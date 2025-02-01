import os
import itertools
import subprocess
import threading

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
    'base_seed_hex': "191056",
    'num_runs': 10000,  # e.g., how many seeds to generate

    # The relevant command-line arguments for the core parameters
    'param_ranges': {
        'num_sims': [10_000],             # --num-sims
        'num_steps_sim': [1_000_000],    # --num-steps-sim
        'location': [300.0],            # --location
        'velocity': [1.0],              # --velocity
        'min_mass': [100.0],            # --min-mass
        'max_mass': [300.0],            # --max-mass
        'chaos_weight': [3.0],          # --chaos-weight
        'perimeter_weight': [1.0],      # --perimeter-weight
        'dist_weight': [2.0],           # --dist-weight
        'lyap_weight': [2.5],           # --lyap-weight
        'max_points': [100_000],        # --max-points
        'frame_size': [600],            # --frame-size

        # If disable_blur == True, we ignore multiple blur variants
        'blur_radius_fraction': [0.01],
        'blur_strength': [1.0],
        'blur_core_brightness': [1.0],
        'disable_blur': [False],

        'clip_black': [0.01],           # --clip-black
        'clip_white': [0.99],           # --clip-white
        'levels_gamma': [1.0],          # --levels-gamma
    },

    # 6 total: one "no blur," one "normal," two "wild," two "extreme."
    # Each tuple is (blur_radius_fraction, blur_strength, blur_core_brightness)
    'blur_variants': [
        (0.0,  0.0,  1.0),   # (A) "No blur"
                             #   - radius=0.0 => effectively no blur pass
                             #   - strength=0.0 => no added glow
                             #   - core=1.0 => lines at normal brightness

        (0.01, 1.0,  1.0),   # (B) "Normal"
                             #   - radius=0.01 => 1% of smaller dimension
                             #   - strength=1.0 => moderate glow
                             #   - core=1.0 => crisp lines normal

        (0.03, 2.0,  2.0),   # (C) "Wild #1"
                             #   - radius=0.03 => 3% blur radius
                             #   - strength=2.0 => stronger glow
                             #   - core=2.0 => lines are twice normal brightness

        (0.05, 3.0,  3.0),   # (D) "Wild #2"
                             #   - radius=0.05 => 5% blur radius
                             #   - strength=3.0 => even stronger glow
                             #   - core=3.0 => lines triple normal brightness

        (0.10, 8.0,  5.0),   # (E) "Extreme #1"
                             #   - radius=0.10 => 10% blur radius
                             #   - strength=8.0 => large glow halo
                             #   - core=5.0 => lines are extremely bright

        (0.15, 12.0, 8.0),   # (F) "Extreme #2"
                             #   - radius=0.15 => 15% blur radius
                             #   - strength=12.0 => intense glow
                             #   - core=8.0 => ultra-bright core lines
    ],
}

# ===================== Dataclass for Parameters =====================
@dataclass
class SimulationParams:
    """
    Reflects all Rust CLI arguments for the three_body_problem binary.
    """
    seed: str
    file_name: str

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
    Create the main 'file_name' for Rust's "--file-name" argument.

    - If disable_blur is True, call it "_disableBlur".
    - Else if blur_radius_fraction < 1e-9 => "noblur".
    - Otherwise => "blur_radius_XXX_str_YYY_core_ZZZ".
    """
    seed_part = params.seed[2:] if params.seed.startswith("0x") else params.seed

    if params.disable_blur:
        return f"seed_{seed_part}_disableBlur"
    else:
        if params.blur_radius_fraction < 1e-9:
            # effectively no blur
            return f"seed_{seed_part}_noblur"
        else:
            return (
                f"seed_{seed_part}"
                f"_blur_radius_{params.blur_radius_fraction:.3f}"
                f"_str_{params.blur_strength:.2f}"
                f"_core_{params.blur_core_brightness:.2f}"
            )


def generate_log_prefix(params: SimulationParams) -> str:
    """
    Creates the prefix for the log files.
    We'll reuse the same logic as generate_file_name.
    """
    return generate_file_name(params)


def build_command_list(program_path: str, params: SimulationParams) -> List[str]:
    """
    Construct the command list for the Rust simulation.
    Matches each argument to the Rust code's --long-arg name.
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


def run_simulation(command_list: List[str], params: SimulationParams) -> int:
    """
    1) Print the EXACT command.
    2) Build log file names based on blur or not.
    3) Spawn the child process, capturing stdout/stderr line by line.
    4) On non-zero exit, re-print all lines to console & logs.
    5) Return the child's exit code.
    """
    cmd_str = " ".join(command_list)
    print(f"Running command: {cmd_str}")

    log_prefix = generate_log_prefix(params)

    # Put logs in the 'logs' folder, ensuring the folder exists
    stdout_log_file = f"logs/{log_prefix}_thread-stdout.log"
    stderr_log_file = f"logs/{log_prefix}_thread-stderr.log"

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
        args=(proc.stdout, "THREAD-OUT", stdout_log_file, print_lock, stdout_lines),
        daemon=True
    )
    t_err = threading.Thread(
        target=_logger_thread,
        args=(proc.stderr, "THREAD-ERR", stderr_log_file, print_lock, stderr_lines),
        daemon=True
    )

    t_out.start()
    t_err.start()

    proc.wait()
    t_out.join()
    t_err.join()

    if proc.returncode != 0:
        print(f"\nERROR: child returned code {proc.returncode}. Printing all captured output:\n")
        # Re-print to console
        print("---- BEGIN RUST STDOUT ----")
        for line in stdout_lines:
            print(f"[THREAD-OUT] {line}")
        print("---- END RUST STDOUT ----\n")

        print("---- BEGIN RUST STDERR ----")
        for line in stderr_lines:
            print(f"[THREAD-ERR] {line}")
        print("---- END RUST STDERR ----\n")

        # Also append to the log files again
        with open(stdout_log_file, 'a', encoding='utf-8') as f:
            f.write("\nERROR DETECTED. REPRINTING CAPTURED STDOUT LINES:\n")
            for line in stdout_lines:
                f.write(f"[THREAD-OUT] {line}\n")

        with open(stderr_log_file, 'a', encoding='utf-8') as f:
            f.write("\nERROR DETECTED. REPRINTING CAPTURED STDERR LINES:\n")
            for line in stderr_lines:
                f.write(f"[THREAD-ERR] {line}\n")

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
        - For each combination, produce multiple seeds (0..num_runs-1).
        - If 'disable_blur' is True, skip the 'blur_variants' and do only 1 set from param_ranges.
        - Otherwise, for each seed, produce all 6 items in 'blur_variants'.
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())

        param_sets = []
        for combo in itertools.product(*param_values):
            combo_dict = dict(zip(keys, combo))

            blur_is_disabled = combo_dict['disable_blur']
            if blur_is_disabled:
                # Only one "variant" from param ranges
                chosen_blur_variants = [
                    (
                        combo_dict['blur_radius_fraction'],
                        combo_dict['blur_strength'],
                        combo_dict['blur_core_brightness'],
                    )
                ]
            else:
                # Use all 6 from 'blur_variants'
                chosen_blur_variants = SIMULATION_CONFIG['blur_variants']

            for i in range(num_runs):
                # Build a unique seed, e.g. "0x120056" + i in hex => "0x120056000A"
                seed_suffix = f"{i:04X}"
                full_seed = f"0x{base_seed_hex}{seed_suffix}"

                for (radius_frac, strength, core_bright) in chosen_blur_variants:
                    p = SimulationParams(
                        seed=full_seed,
                        file_name="output",  # We'll rename later for uniqueness

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
        # Ensure the 'logs' folder exists (for storing log files)
        os.makedirs("logs", exist_ok=True)

        print(f"Total tasks to execute: {len(param_sets)}")

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in param_sets:
                # Update the file_name argument for the Rust code:
                params.file_name = generate_file_name(params)

                cmd_list = build_command_list(self.program_path, params)
                fut = executor.submit(run_simulation, cmd_list, params)
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
    print(
        "Starting batch runs of the Rust three-body simulator, enumerating all parameters.\n"
        "We produce multiple blur variants per seed (unless blur is disabled). Images/video\n"
        "are generated by the Rust code. Logs are saved per-run in 'logs/' in real time.\n"
    )

    runner = SimulationRunner(
        program_path=SIMULATION_CONFIG['program_path'],
        max_concurrent=SIMULATION_CONFIG['max_concurrent']
    )

    param_sets = runner.get_parameter_combinations(
        base_seed_hex=SIMULATION_CONFIG['base_seed_hex'],
        num_runs=SIMULATION_CONFIG['num_runs']
    )

    print(f"Base param sets (including blur variants unless disabled): {len(param_sets)}")

    # Run them all
    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()