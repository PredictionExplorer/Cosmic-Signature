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
    'base_seed_hex': "155556",
    'num_runs': 10,  # Example; adjust as needed

    # The relevant command-line arguments for the core parameters
    'param_ranges': {
        # Single-valued parameters
        'num_sims': [10_000],          # --num-sims
        'num_steps_sim': [1_000_000],  # --num-steps-sim
        'location': [300.0],          # --location
        'velocity': [1.0],            # --velocity
        'min_mass': [100.0],          # --min-mass
        'max_mass': [300.0],          # --max-mass
        'chaos_weight': [3.0],        # --chaos-weight
        'area_weight': [1.0],         # --area-weight
        'dist_weight': [2.0],         # --dist-weight
        'lyap_weight': [2.5],         # --lyap-weight
        'aspect_weight': [1.0],       # --aspect-weight

        'max_points': [100_000],      # --max-points
        'width': [1920],              # --width
        'height': [1080],             # --height

        'clip_black': [0.005],        # --clip-black
        'clip_white': [0.99],         # --clip-white
        'levels_gamma': [1.0],        # --levels-gamma

        # Boolean parameter
        'special': [False, True],     # --special
    },
}

# ===================== Dataclass for Parameters =====================
@dataclass
class SimulationParams:
    """
    Reflects all Rust CLI arguments for the new three_body_problem binary.
    """
    seed: str
    file_name: str

    num_sims: int
    num_steps_sim: int
    location: float
    velocity: float
    min_mass: float
    max_mass: float

    chaos_weight: float
    area_weight: float
    dist_weight: float
    lyap_weight: float
    aspect_weight: float

    max_points: int

    width: int
    height: int

    clip_black: float
    clip_white: float
    levels_gamma: float

    special: bool


def generate_file_name(params: SimulationParams) -> str:
    """
    Create the 'file_name' for Rust's "--file-name" argument.
    Contains 'seed' plus 'nm' (normal) or 'sp' (special).
    """
    seed_part = params.seed[2:] if params.seed.startswith("0x") else params.seed
    # Append 'nm' if special=False, 'sp' if special=True
    mode_str = "sp" if params.special else "nm"
    return f"seed_{seed_part}_{mode_str}"


def build_command_list(program_path: str, params: SimulationParams) -> List[str]:
    """
    Construct the command list for the Rust simulation.
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
        "--area-weight", str(params.area_weight),
        "--dist-weight", str(params.dist_weight),
        "--lyap-weight", str(params.lyap_weight),
        "--aspect-weight", str(params.aspect_weight),

        "--max-points", str(params.max_points),

        "--width", str(params.width),
        "--height", str(params.height),

        "--clip-black", str(params.clip_black),
        "--clip-white", str(params.clip_white),
        "--levels-gamma", str(params.levels_gamma),
    ]

    # Only add --special if params.special is True
    if params.special:
        cmd.append("--special")

    return cmd


def _logger_thread(
    pipe,
    label: str,
    print_lock: threading.Lock,
    lines_storage: list
):
    """
    Reads lines from the given pipe in a loop, prints them to console
    with a [label] prefix, and also appends to lines_storage.
    """
    for raw_line in iter(pipe.readline, ''):
        if not raw_line:
            break
        line = raw_line.rstrip('\n')
        with print_lock:
            print(f"[{label}] {line}")
        lines_storage.append(line)

    pipe.close()


def run_simulation(command_list: List[str], params: SimulationParams) -> int:
    """
    1) Print the EXACT command to console.
    2) Spawn the child process, capturing stdout/stderr line by line in separate threads.
    3) On non-zero exit, re-print all lines for clarity.
    4) Return the child's exit code.
    """
    cmd_str = " ".join(command_list)
    print(f"Running command: {cmd_str}")

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
        args=(proc.stdout, "STDOUT", print_lock, stdout_lines),
        daemon=True
    )
    t_err = threading.Thread(
        target=_logger_thread,
        args=(proc.stderr, "STDERR", print_lock, stderr_lines),
        daemon=True
    )

    t_out.start()
    t_err.start()

    proc.wait()
    t_out.join()
    t_err.join()

    if proc.returncode != 0:
        print(f"\nERROR: child returned code {proc.returncode}. Printing all captured output:\n")

        # Re-print to console for clarity
        print("---- BEGIN RUST STDOUT ----")
        for line in stdout_lines:
            print(f"[STDOUT] {line}")
        print("---- END RUST STDOUT ----\n")

        print("---- BEGIN RUST STDERR ----")
        for line in stderr_lines:
            print(f"[STDERR] {line}")
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
        Build a list of SimulationParams, specifically alternating between
        normal and special mode for each seed.
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())

        # Extract 'special' from param_values so we can manually alternate
        special_idx = keys.index("special")
        special_values = param_values[special_idx]  # [False, True]
        # Remove them from the dictionary to handle them separately
        del keys[special_idx]
        del param_values[special_idx]

        # All other combos
        other_combos = list(itertools.product(*param_values))

        param_sets = []
        for i in range(num_runs):
            seed_suffix = f"{i:04X}"
            full_seed = f"0x{base_seed_hex}{seed_suffix}"

            for combo in other_combos:
                combo_dict = dict(zip(keys, combo))

                # Alternate both special=False and special=True for each seed
                for s in special_values:
                    p = SimulationParams(
                        seed=full_seed,
                        file_name="will_replace",  # updated later
                        num_sims=combo_dict['num_sims'],
                        num_steps_sim=combo_dict['num_steps_sim'],
                        location=combo_dict['location'],
                        velocity=combo_dict['velocity'],
                        min_mass=combo_dict['min_mass'],
                        max_mass=combo_dict['max_mass'],
                        chaos_weight=combo_dict['chaos_weight'],
                        area_weight=combo_dict['area_weight'],
                        dist_weight=combo_dict['dist_weight'],
                        lyap_weight=combo_dict['lyap_weight'],
                        aspect_weight=combo_dict['aspect_weight'],
                        max_points=combo_dict['max_points'],
                        width=combo_dict['width'],
                        height=combo_dict['height'],
                        clip_black=combo_dict['clip_black'],
                        clip_white=combo_dict['clip_white'],
                        levels_gamma=combo_dict['levels_gamma'],
                        special=s
                    )
                    param_sets.append(p)

        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """
        Executes each SimulationParams in a ThreadPoolExecutor
        with up to 'max_concurrent' concurrency.
        """
        print(f"Total tasks to execute: {len(param_sets)}")

        # Note: no logs folder creation—everything goes to console

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in param_sets:
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
        "Starting batch runs of the Rust three-body simulator.\n"
        "We alternate normal/special for each seed.\n"
        "All process output is printed to the console.\n"
    )

    runner = SimulationRunner(
        program_path=SIMULATION_CONFIG['program_path'],
        max_concurrent=SIMULATION_CONFIG['max_concurrent']
    )

    param_sets = runner.get_parameter_combinations(
        base_seed_hex=SIMULATION_CONFIG['base_seed_hex'],
        num_runs=SIMULATION_CONFIG['num_runs']
    )

    print(f"Number of parameter sets: {len(param_sets)}")
    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()