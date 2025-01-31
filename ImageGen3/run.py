import itertools
import subprocess
import threading
import os

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional, Tuple

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
    # using the same default values the Rust code has (adjust if desired):
    'param_ranges': {
        'num_steps_sim': [1_000_000],      # Rust default is 1_000_000
        'num_sims': [10_000],             # Rust default is 10_000
        'location': [300.0],             # Rust default is 300.0
        'velocity': [1.0],               # Rust default is 1.0
        'min_mass': [100.0],             # Rust default is 100.0
        'max_mass': [300.0],             # Rust default is 300.0
        'chaos_weight': [3.0],           # Rust default is 3.0
        'perimeter_weight': [1.0],       # Rust default is 1.0
        'dist_weight': [2.0],            # Rust default is 2.0
        'lyap_weight': [2.5],            # Rust default is 2.5
        'max_points': [100_000],         # Rust default is 100_000
        'frame_size': [800],            # Rust default is 1800
        'blur_radius_fraction': [0.01],  # Rust default is 0.01
        'blur_strength': [1.0],          # Rust default is 1.0
        'blur_core_brightness': [1.0],   # Rust default is 1.0
        'disable_blur': [False],         # Rust default is false
        'clip_black': [0.01],            # Rust default is 0.01
        'clip_white': [0.99],            # Rust default is 0.99
        'levels_gamma': [1.0],           # Rust default is 1.0
    },

    # We define 5 "blur variants" as an example.  Each variant changes
    # radius fraction, strength, core brightness:
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
    Reflects all Rust CLI arguments:
      --seed, --file-name,
      --num-sims, --num-steps-sim, --location, --velocity,
      --min-mass, --max-mass, --chaos-weight, --perimeter-weight,
      --dist-weight, --lyap-weight, --max-points, --frame-size,
      --blur-radius-fraction, --blur-strength, --blur-core-brightness,
      --disable-blur, --clip-black, --clip-white, --levels-gamma
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
    perimeter_weight: float
    dist_weight: float
    lyap_weight: float
    max_points: int
    frame_size: int
    blur_radius_fraction: float
    blur_strength: float
    blur_core_brightness: float
    disable_blur: bool
    clip_black: float
    clip_white: float
    levels_gamma: float


def generate_file_name(params: SimulationParams) -> str:
    """
    Create a file name using the seed value plus the blur settings.
    We'll strip the '0x' from the seed for uniqueness.

    Example: "seed_10003000_blur0.010_str1.00_core1.00"
    """
    seed_part = params.seed[2:] if params.seed.startswith("0x") else params.seed
    return (
        f"seed_{seed_part}"
        f"_blur{params.blur_radius_fraction:.3f}"
        f"_str{params.blur_strength:.2f}"
        f"_core{params.blur_core_brightness:.2f}"
    )


def build_command_list(program_path: str, params: SimulationParams) -> List[str]:
    """
    Construct the command list for the Rust simulation,
    ensuring every CLI parameter is included.
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


def _logger_thread(pipe, label: str, log_filename: str, print_lock: threading.Lock):
    """
    Reads lines from the given pipe in a loop,
    prints them immediately with [THREAD-x] label,
    and appends them to the log file.
    """
    # Open the log file in append mode. We'll flush each line as we go.
    with open(log_filename, 'a', encoding='utf-8') as f:
        for raw_line in iter(pipe.readline, ''):
            if not raw_line:
                break
            line = raw_line.rstrip('\n')
            # Print to screen with lock so lines don't interleave mid-line
            with print_lock:
                print(f"[{label}] {line}")
            # Also write to log file
            f.write(f"[{label}] {line}\n")
            f.flush()
    pipe.close()


def run_simulation(command_list: List[str], seed: str) -> int:
    """
    Launch the Rust simulation in real-time streaming mode:
      - We capture stdout + stderr with Popen.
      - We spawn two threads to read each pipe line by line.
      - Each line is printed to the console + appended to a log file
        named "{seed}_thread-1.log" for stdout, "{seed}_thread-2.log" for stderr.
    Returns the child's exit code.
    """
    # We ensure logs go into the current working directory:
    stdout_log_file = f"{seed}_thread-1.log"
    stderr_log_file = f"{seed}_thread-2.log"

    # We'll use a lock so printing doesn't get jumbled by both threads
    print_lock = threading.Lock()

    # Start the subprocess
    proc = subprocess.Popen(
        command_list,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,   # so we get strings instead of bytes
        bufsize=1,   # line-buffered
        universal_newlines=True
    )

    # Spawn threads to read the child's stdout/stderr in real time
    t_out = threading.Thread(
        target=_logger_thread,
        args=(proc.stdout, "THREAD-1", stdout_log_file, print_lock),
        daemon=True
    )
    t_err = threading.Thread(
        target=_logger_thread,
        args=(proc.stderr, "THREAD-2", stderr_log_file, print_lock),
        daemon=True
    )

    t_out.start()
    t_err.start()

    # Wait for the child to exit
    proc.wait()

    # Wait for the logger threads to finish reading any last lines
    t_out.join()
    t_err.join()

    return proc.returncode


class SimulationRunner:
    def __init__(self, program_path: str, max_concurrent: int):
        self.program_path = program_path
        self.max_concurrent = max_concurrent

    def get_parameter_combinations(self, base_seed_hex: str, num_runs: int) -> List[SimulationParams]:
        """
        Generate all combinations from 'param_ranges' in SIMULATION_CONFIG.
        Then for each combination, produce multiple seeds, and for each seed,
        produce multiple "blur variants".
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())

        param_sets = []
        for combo in itertools.product(*param_values):
            for i in range(num_runs):
                # Build a unique seed, e.g. 0x100030 + i in hex
                seed_suffix = f"{i:04X}"   # i => 4-hex-digit string
                full_seed = f"0x{base_seed_hex}{seed_suffix}"

                # Convert 'combo' -> dict of base param fields
                combo_dict = dict(zip(keys, combo))

                # For each blur variant, create a separate SimulationParams
                for (radius_frac, strength, core_bright) in SIMULATION_CONFIG['blur_variants']:
                    params = SimulationParams(
                        seed=full_seed,
                        file_name="output",
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
                        disable_blur=combo_dict['disable_blur'],

                        clip_black=combo_dict['clip_black'],
                        clip_white=combo_dict['clip_white'],
                        levels_gamma=combo_dict['levels_gamma'],
                    )
                    param_sets.append(params)

        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """
        Execute each SimulationParams in a ThreadPoolExecutor,
        up to 'max_concurrent' concurrency.
        """
        print(f"Total tasks to execute: {len(param_sets)}")

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in param_sets:
                # Generate a nicer file name so we don't overwrite "output" each time
                file_name = generate_file_name(params)
                params.file_name = file_name

                cmd_list = build_command_list(self.program_path, params)

                # Instead of returning stdout, we do real-time streaming,
                # so we'll store the return code in the future’s result.
                fut = executor.submit(run_simulation, cmd_list, params.seed)
                futures[fut] = cmd_list

            for future in as_completed(futures):
                cmd_list = futures[future]
                exit_code = future.result()
                print(f"Finished command:\n  {' '.join(cmd_list)}")
                if exit_code == 0:
                    print("Child process exited successfully.\n")
                else:
                    print(f"Child process exited with code {exit_code}.\n")


def main():
    print("Starting batch runs of the Rust three-body simulator, enumerating all parameters.\n"
          "We produce 5 blur variants per seed. Images/video are generated by the Rust code.\n")

    # Create the runner
    runner = SimulationRunner(
        program_path=SIMULATION_CONFIG['program_path'],
        max_concurrent=SIMULATION_CONFIG['max_concurrent']
    )

    # Generate all param sets
    param_sets = runner.get_parameter_combinations(
        base_seed_hex=SIMULATION_CONFIG['base_seed_hex'],
        num_runs=SIMULATION_CONFIG['num_runs']
    )

    print(f"Base param sets *including* blur variants: {len(param_sets)}")

    # Execute them in parallel (or serially if max_concurrent=1).
    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()