import itertools
import subprocess
import threading
import os

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List

# ===================== Simulation Configuration =====================
SIMULATION_CONFIG = {
    # Path to your compiled Rust program:
    'program_path': './target/release/three_body_problem',

    # Parallelism (how many simulations to run at once)
    'max_concurrent': 1,

    # Base hex seed + how many variant runs
    'base_seed_hex': "100035",
    'num_runs': 1000,  # e.g., how many different seeds to generate

    # The relevant command-line arguments for the core parameters
    # using the same default values the Rust code has (adjust if desired).
    # NOTE: These keys must match your Rust CLI argument names (minus the '--' and dashes).
    'param_ranges': {
        'num_sims': [10_000],             # --num-sims
        'num_steps_sim': [1_000_000],     # --num-steps-sim
        'location': [300.0],             # --location
        'velocity': [1.0],               # --velocity
        'min_mass': [100.0],             # --min-mass
        'max_mass': [300.0],             # --max-mass
        'chaos_weight': [3.0],           # --chaos-weight
        'perimeter_weight': [1.0],       # --perimeter-weight
        'dist_weight': [2.0],            # --dist-weight
        'lyap_weight': [2.5],            # --lyap-weight
        'max_points': [100_000],         # --max-points
        'frame_size': [800],             # --frame-size
        'blur_radius_fraction': [0.01],  # --blur-radius-fraction
        'blur_strength': [1.0],          # --blur-strength
        'blur_core_brightness': [1.0],   # --blur-core-brightness
        'disable_blur': [False],         # --disable-blur
        'clip_black': [0.01],            # --clip-black
        'clip_white': [0.99],            # --clip-white
        'levels_gamma': [1.0],           # --levels-gamma
    },

    # Example "blur variants" if blur is enabled
    'blur_variants': [
        (0.005, 1.0, 1.0),
        (0.01,  1.0, 1.0),
        (0.02,  1.0, 2.0),
        (0.02,  2.0, 1.0),
        (0.05,  2.0, 3.0),
    ],
}


# ===================== Dataclass for Parameters =====================
@dataclass
class SimulationParams:
    """
    Reflects all Rust CLI arguments (with underscores replaced by dashes in the actual CLI flags).
    """
    seed: str
    file_name: str

    # Matching each arg in the Rust code:
    num_sims: int               # --num-sims
    num_steps_sim: int          # --num-steps-sim
    location: float             # --location
    velocity: float             # --velocity
    min_mass: float             # --min-mass
    max_mass: float             # --max-mass
    chaos_weight: float         # --chaos-weight
    perimeter_weight: float     # --perimeter-weight
    dist_weight: float          # --dist-weight
    lyap_weight: float          # --lyap-weight
    max_points: int             # --max-points
    frame_size: int             # --frame-size

    blur_radius_fraction: float # --blur-radius-fraction
    blur_strength: float        # --blur-strength
    blur_core_brightness: float # --blur-core-brightness
    disable_blur: bool          # --disable-blur

    clip_black: float           # --clip-black
    clip_white: float           # --clip-white
    levels_gamma: float         # --levels-gamma


def generate_file_name(params: SimulationParams) -> str:
    """
    Create a file name using the seed value plus (if blur is enabled) the blur settings.
    We'll strip '0x' from the seed for uniqueness, e.g. "seed_10003000_blur0.010_str1.00_core1.00".
    """
    seed_part = params.seed[2:] if params.seed.startswith("0x") else params.seed

    if params.disable_blur:
        # If blur is disabled, we can just name by seed
        return f"seed_{seed_part}_noblur"
    else:
        return (
            f"seed_{seed_part}"
            f"_blur{params.blur_radius_fraction:.3f}"
            f"_str{params.blur_strength:.2f}"
            f"_core{params.blur_core_brightness:.2f}"
        )


def build_command_list(program_path: str, params: SimulationParams) -> List[str]:
    """
    Construct the command list for the Rust simulation.
    Make sure each argument matches the Rust code's --long-arg name exactly.
    """
    cmd = [
        program_path,
        "--seed", params.seed,
        "--file-name", params.file_name,

        "--num-sims", str(params.num_sims),
        "--num-steps-sim", str(params.num_steps_sim),
        "--location", str(params.location),
        "--velocity", str(params.velocity),
        "--min-mass", str(params.min_mass),
        "--max-mass", str(params.max_mass),

        "--chaos-weight", str(params.chaos_weight),
        "--perimeter-weight", str(params.perimeter_weight),
        "--dist-weight", str(params.dist_weight),
        "--lyap-weight", str(params.lyap_weight),

        "--max-points", str(params.max_points),
        "--frame-size", str(params.frame_size),

        "--blur-radius-fraction", str(params.blur_radius_fraction),
        "--blur-strength", str(params.blur_strength),
        "--blur-core-brightness", str(params.blur_core_brightness),
    ]

    # If blur is disabled, we add --disable-blur
    if params.disable_blur:
        cmd.append("--disable-blur")

    cmd += [
        "--clip-black", str(params.clip_black),
        "--clip-white", str(params.clip_white),
        "--levels-gamma", str(params.levels_gamma),
    ]

    return cmd


def _logger_thread(
    pipe,
    label: str,
    log_filename: str,
    print_lock: threading.Lock,
    lines_storage: list
):
    """
    Reads lines from the given pipe in a loop, prints them immediately
    with a [THREAD-x] label, writes them to a log file, and also
    stores them in memory for potential re-print on error.
    """
    with open(log_filename, 'a', encoding='utf-8') as f:
        for raw_line in iter(pipe.readline, ''):
            if not raw_line:
                break
            line = raw_line.rstrip('\n')

            with print_lock:
                print(f"[{label}] {line}")

            f.write(f"[{label}] {line}\n")
            f.flush()

            lines_storage.append(line)

    pipe.close()


def run_simulation(command_list: List[str], seed: str) -> int:
    """
    1) Print the EXACT command.
    2) Start the child process with Popen, capturing stdout + stderr.
    3) Two threads read stdout/stderr line by line, printing + logging.
    4) On non-zero exit, re-print all captured lines to help debug.
    5) Return the child's exit code.
    """
    cmd_str = " ".join(command_list)
    print(f"Running command: {cmd_str}")

    stdout_log_file = f"{seed}_thread-1.log"
    stderr_log_file = f"{seed}_thread-2.log"

    print_lock = threading.Lock()
    stdout_lines = []
    stderr_lines = []

    proc = subprocess.Popen(
        command_list,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # line-buffered
        universal_newlines=True
    )

    t_out = threading.Thread(
        target=_logger_thread,
        args=(proc.stdout, "THREAD-1", stdout_log_file, print_lock, stdout_lines),
        daemon=True
    )
    t_err = threading.Thread(
        target=_logger_thread,
        args=(proc.stderr, "THREAD-2", stderr_log_file, print_lock, stderr_lines),
        daemon=True
    )

    t_out.start()
    t_err.start()

    proc.wait()
    t_out.join()
    t_err.join()

    if proc.returncode != 0:
        print(f"\nERROR: child returned code {proc.returncode}. Printing all captured output:\n")

        print("---- BEGIN RUST STDOUT ----")
        for line in stdout_lines:
            print(f"[THREAD-1] {line}")
        print("---- END RUST STDOUT ----\n")

        print("---- BEGIN RUST STDERR ----")
        for line in stderr_lines:
            print(f"[THREAD-2] {line}")
        print("---- END RUST STDERR ----\n")

    return proc.returncode


class SimulationRunner:
    """
    Manages the generation of parameter sets and runs them concurrently.
    """
    def __init__(self, program_path: str, max_concurrent: int):
        self.program_path = program_path
        self.max_concurrent = max_concurrent

    def get_parameter_combinations(self, base_seed_hex: str, num_runs: int) -> List[SimulationParams]:
        """
        - Reads from SIMULATION_CONFIG['param_ranges'] to get possible values for each param.
        - For each combination, produce multiple seeds (0 to num_runs-1).
        - For each seed, either produce multiple blur variants (if blur is not forced disabled)
          or just one variant if blur is disabled in that param combination.
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())

        param_sets = []
        for combo in itertools.product(*param_values):
            combo_dict = dict(zip(keys, combo))

            # Check if blur is disabled in this combo
            # If so, we won't produce 5 variants, just 1 "dummy" variant
            blur_is_disabled = combo_dict['disable_blur']
            if blur_is_disabled:
                # We'll define a single "variant" that won't matter
                # because the code will pass --disable-blur anyway.
                chosen_blur_variants = [(combo_dict['blur_radius_fraction'],
                                         combo_dict['blur_strength'],
                                         combo_dict['blur_core_brightness'])]
            else:
                chosen_blur_variants = SIMULATION_CONFIG['blur_variants']

            for i in range(num_runs):
                # Build a unique seed, e.g. 0x100030 + i in hex
                seed_suffix = f"{i:04X}"
                full_seed = f"0x{base_seed_hex}{seed_suffix}"

                for (radius_frac, strength, core_bright) in chosen_blur_variants:
                    p = SimulationParams(
                        seed=full_seed,
                        file_name="output",  # default; we rename later

                        num_sims=combo_dict['num_sims'],
                        num_steps_sim=combo_dict['num_steps_sim'],
                        location=combo_dict['location'],
                        velocity=combo_dict['velocity'],
                        min_mass=combo_dict['min_mass'],
                        max_mass=combo_dict['max_mass'],
                        chaos_weight=combo_dict['chaos_weight'],
                        perimeter_weight=combo_dict['perimeter_weight'],
                        dist_weight=combo_dict['dist_weight'],
                        lyap_weight=combo_dict['lyap_weight'],
                        max_points=combo_dict['max_points'],
                        frame_size=combo_dict['frame_size'],

                        blur_radius_fraction=radius_frac,
                        blur_strength=strength,
                        blur_core_brightness=core_bright,
                        disable_blur=blur_is_disabled,

                        clip_black=combo_dict['clip_black'],
                        clip_white=combo_dict['clip_white'],
                        levels_gamma=combo_dict['levels_gamma'],
                    )

                    param_sets.append(p)

        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """
        Executes each SimulationParams in a ThreadPoolExecutor
        with up to 'max_concurrent' concurrency.
        """
        print(f"Total tasks to execute: {len(param_sets)}")

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in param_sets:
                file_name = generate_file_name(params)
                params.file_name = file_name

                cmd_list = build_command_list(self.program_path, params)
                fut = executor.submit(run_simulation, cmd_list, params.seed)
                futures[fut] = cmd_list

            for future in as_completed(futures):
                cmd_list = futures[future]
                exit_code = future.result()

                cmd_str = " ".join(cmd_list)
                print(f"Finished command:\n  {cmd_str}")
                if exit_code == 0:
                    print("Child process exited successfully.\n")
                else:
                    print(f"Child process exited with code {exit_code}.\n")


def main():
    print("Starting batch runs of the Rust three-body simulator, enumerating all parameters.\n"
          "We produce multiple blur variants per seed (unless blur is disabled). Images/video "
          "are generated by the Rust code.\n")

    runner = SimulationRunner(
        program_path=SIMULATION_CONFIG['program_path'],
        max_concurrent=SIMULATION_CONFIG['max_concurrent']
    )

    param_sets = runner.get_parameter_combinations(
        base_seed_hex=SIMULATION_CONFIG['base_seed_hex'],
        num_runs=SIMULATION_CONFIG['num_runs']
    )

    print(f"Base param sets *including* blur variants: {len(param_sets)}")

    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()