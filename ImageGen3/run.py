import itertools
import os
import random
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional, Tuple

# ===================== Simulation Configuration =====================
SIMULATION_CONFIG = {
    # Where is the compiled Rust program?
    'program_path': './target/release/three_body_problem',

    # Parallelism
    'max_concurrent': 1,

    # Base hex seed + how many variant runs
    'base_seed_hex': "100019",
    'num_runs': 2000,

    # The relevant command-line arguments for the core parameters
    # (NOT including bloom or special).
    'param_ranges': {
        'num_steps': [1_000_000],
        'num_sims': [10000],
        'location': [300.0],
        'velocity': [1.0],
        'min_mass': [100.0],
        'max_mass': [300.0],
        'clip_black': [0.01],
        'clip_white': [0.99],
        'levels_gamma': [1.0],
        'max_points': [100000],
        'chaos_weight': [3.0],
        'perimeter_weight': [1.0],
        'dist_weight': [2.0],
        'lyap_weight': [2.5],
        'frame_size': [1800],
    },

    # Bloom defaults that match the Rust code's defaults
    'bloom_radius_percent': 0.1,
    'bloom_threshold': 0.25,
    'bloom_strength': 1.0,
}


# ===================== Dataclass for Parameters =====================
@dataclass
class SimulationParams:
    """
    Reflects the *core* Rust CLI arguments:

      --seed, --file-name,

      --num-steps, --num-sims, --location, --velocity,
      --min-mass, --max-mass, --max-points,

      --chaos-weight, --perimeter-weight, --dist-weight, --lyap-weight,

      --clip-black, --clip-white, --levels-gamma,
      --frame-size

    Then we have *bloom‐related arguments*, but we won't generate them
    in param_ranges. We'll just fix them to the Rust defaults.

    We also store 'seed' appended last, not in param_ranges.
    And we have a 'special' flag for bloom or not.
    """
    num_steps: int
    num_sims: int
    location: float
    velocity: float
    min_mass: float
    max_mass: float
    clip_black: float
    clip_white: float
    levels_gamma: float
    max_points: int
    chaos_weight: float
    perimeter_weight: float
    dist_weight: float
    lyap_weight: float
    frame_size: int

    # We'll fill these in ourselves, not from param_ranges:
    special: bool
    bloom_radius_percent: float
    bloom_threshold: float
    bloom_strength: float

    seed: str


def generate_file_name(params: SimulationParams) -> str:
    """
    Create a file name using the seed value, plus suffix if special is True.
    We'll strip the '0x' from the seed, for uniqueness.
    """
    seed_part = params.seed[2:]  # remove leading '0x'
    if params.special:
        return f"seed_{seed_part}_sp"
    else:
        return f"seed_{seed_part}_reg"


def build_command_list(program_path: str, params: SimulationParams, file_name: str) -> List[str]:
    """
    Construct the command list for the Rust simulation, matching the new code’s CLI.
    """
    cmd = [
        program_path,

        "--seed", params.seed,
        "--file-name", file_name,

        "--num-steps", str(params.num_steps),
        "--num-sims", str(params.num_sims),
        "--location", str(params.location),
        "--velocity", str(params.velocity),
        "--min-mass", str(params.min_mass),
        "--max-mass", str(params.max_mass),

        "--max-points", str(params.max_points),
        "--chaos-weight", str(params.chaos_weight),
        "--perimeter-weight", str(params.perimeter_weight),
        "--dist-weight", str(params.dist_weight),
        "--lyap-weight", str(params.lyap_weight),

        "--clip-black", str(params.clip_black),
        "--clip-white", str(params.clip_white),
        "--levels-gamma", str(params.levels_gamma),

        "--frame-size", str(params.frame_size),
    ]

    # If the user wants the special bloom effect, add --special
    if params.special:
        cmd.append("--special")

    # Add bloom arguments (percent, threshold, strength)
    cmd.extend([
        "--bloom-radius-percent", str(params.bloom_radius_percent),
        "--bloom-threshold", str(params.bloom_threshold),
        "--bloom-strength", str(params.bloom_strength),
    ])

    return cmd


def run_simulation(command_list: List[str]) -> Tuple[str, Optional[str]]:
    """
    Run the Rust program via subprocess, return (command_string, output).
    If the subprocess fails, we return (command_string, None).
    """
    cmd_str = " ".join(command_list)
    try:
        result = subprocess.run(
            command_list,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return (cmd_str, result.stdout.strip())
    except subprocess.CalledProcessError:
        return (cmd_str, None)


class SimulationRunner:
    def __init__(self, program_path: str, max_concurrent: int):
        self.program_path = program_path
        self.max_concurrent = max_concurrent

    def get_parameter_combinations(self, base_seed_hex: str, num_runs: int) -> List[SimulationParams]:
        """
        Generate all *regular* parameter combos from param_ranges (NO special).
        We'll produce them with special=False initially, but we'll also pair them
        with special=True right after each run in run_simulations.
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())
        param_sets = []
        for combo in itertools.product(*param_values):
            for i in range(num_runs):
                # Build a unique seed: e.g. 0x100019 + i in hex
                seed_suffix = f"{i:04X}"  # 4 hex digits
                full_seed = f"0x{base_seed_hex}{seed_suffix}"

                # "combo" is a tuple in the same order as 'keys'
                # We'll pass them as *args to SimulationParams, plus special=False for now.
                # We'll fill bloom arguments from the config defaults.
                params = SimulationParams(
                    *combo,
                    special=False,
                    bloom_radius_percent=SIMULATION_CONFIG['bloom_radius_percent'],
                    bloom_threshold=SIMULATION_CONFIG['bloom_threshold'],
                    bloom_strength=SIMULATION_CONFIG['bloom_strength'],
                    seed=full_seed
                )
                param_sets.append(params)

        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """
        For each param set, do two runs:
          1) special=False
          2) special=True
        This ensures we get a regular run *immediately* followed by
        a "special" run with the same seed, so they can be compared.
        """
        # We'll gather tasks in a list, then run them in a pool.
        tasks = []
        for base_params in param_sets:
            # 1) The base param is special=False
            tasks.append(base_params)
            # 2) Create a copy with special=True
            sp_copy = SimulationParams(
                num_steps=base_params.num_steps,
                num_sims=base_params.num_sims,
                location=base_params.location,
                velocity=base_params.velocity,
                min_mass=base_params.min_mass,
                max_mass=base_params.max_mass,
                clip_black=base_params.clip_black,
                clip_white=base_params.clip_white,
                levels_gamma=base_params.levels_gamma,
                max_points=base_params.max_points,
                chaos_weight=base_params.chaos_weight,
                perimeter_weight=base_params.perimeter_weight,
                dist_weight=base_params.dist_weight,
                lyap_weight=base_params.lyap_weight,
                frame_size=base_params.frame_size,

                special=True,
                bloom_radius_percent=base_params.bloom_radius_percent,
                bloom_threshold=base_params.bloom_threshold,
                bloom_strength=base_params.bloom_strength,
                seed=base_params.seed
            )
            tasks.append(sp_copy)

        # Now we want them to run in the exact order we appended them:
        # normal run followed by special run. So we won't shuffle tasks.
        # We'll still do them concurrently if max_concurrent > 1.
        print(f"Total tasks to execute: {len(tasks)} (including normal+special pairs)")

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in tasks:
                file_name = generate_file_name(params)
                cmd_list = build_command_list(self.program_path, params, file_name)
                fut = executor.submit(run_simulation, cmd_list)
                futures[fut] = cmd_list

            for future in as_completed(futures):
                cmd_str = " ".join(futures[future])
                shell_command, output = future.result()
                print(f"Finished command:\n  {shell_command}")
                if output:
                    print(f"Output:\n{output}")
                else:
                    print("No output or an error occurred.")


def main():
    print("Starting batch runs of the Rust three-body simulator, regular and special back-to-back.")

    # Create the runner
    runner = SimulationRunner(
        program_path=SIMULATION_CONFIG['program_path'],
        max_concurrent=SIMULATION_CONFIG['max_concurrent']
    )

    # Generate the base param sets (regular only).
    param_sets = runner.get_parameter_combinations(
        base_seed_hex=SIMULATION_CONFIG['base_seed_hex'],
        num_runs=SIMULATION_CONFIG['num_runs']
    )

    # Optional: shuffle them for random ordering.
    # But if you want each pair to be run in sequence, don't shuffle. Up to you.
    # random.shuffle(param_sets)

    print(f"Base param sets (no special): {len(param_sets)}")
    print("Each will be run twice: once normal, once special.")

    # Execute them in parallel
    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()