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

    # The relevant command-line arguments that still exist in the Rust code,
    # each list can contain one or many values (for parameter sweeps).
    'param_ranges': {
        'num_steps': [1_000_000],
        'num_sims': [10_000],
        'location': [300.0],
        'velocity': [1.0],
        'min_mass': [100.0],
        'max_mass': [300.0],
        'clip_black': [0.01],
        'clip_white': [0.99],
        'levels_gamma': [1.0],
        'max_points': [100_000],
        'chaos_weight': [3.0],
        'perimeter_weight': [1.0],
        'dist_weight': [2.0],
        'lyap_weight': [2.0],
        'frame_size': [1800],

        # Bloom & special fields:
        'special': [True],
        'bloom_radius': [50],
        'bloom_threshold': [0.3],
        'bloom_strength': [1.0],
    }
}


# ===================== Dataclass for Parameters =====================
@dataclass
class SimulationParams:
    """
    Reflects the Rust CLI arguments we still need:
      --seed, --file-name,

      --num-steps, --num-sims, --location, --velocity,
      --min-mass, --max-mass, --max-points,

      --chaos-weight, --perimeter-weight, --dist-weight, --lyap-weight,

      --clip-black, --clip-white, --levels-gamma,
      --frame-size,

      --special, --bloom-radius, --bloom-threshold, --bloom-strength

    Then the final 'seed' appended from the base_seed_hex + suffix.
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

    special: bool
    bloom_radius: int
    bloom_threshold: float
    bloom_strength: float

    seed: str  # appended last, not in param_ranges


def generate_file_name(params: SimulationParams) -> str:
    """
    Create a file name using the seed value, e.g. 'seed_1234ABCD'.
    We'll strip the '0x' from the seed, for uniqueness.
    """
    result = f"seed_{params.seed[2:]}"
    if params.special:
        result += "_sp"
    else:
        result += "_reg"
    return result


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

    # Bloom params:
    cmd.extend([
        "--bloom-radius", str(params.bloom_radius),
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
        Generate all parameter combinations from param_ranges, plus each seed variant.
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())
        param_sets = []

        for combo in itertools.product(*param_values):
            for i in range(num_runs):
                # Build a unique seed: e.g. 0x890131 + i in hex
                seed_suffix = f"{i:04X}"  # 4 hex digits
                full_seed = f"0x{base_seed_hex}{seed_suffix}"

                # "combo" is a tuple in the same order as 'keys'
                # We pass it to SimulationParams(*combo, seed=...)
                params = SimulationParams(*combo, seed=full_seed)
                param_sets.append(params)

        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """
        Run simulations in parallel using ThreadPoolExecutor, up to max_concurrent.
        """
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in param_sets:
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
    print("Starting batch runs of the Rust three-body simulator (with optional bloom).")

    # Create the runner with the config
    runner = SimulationRunner(
        program_path=SIMULATION_CONFIG['program_path'],
        max_concurrent=SIMULATION_CONFIG['max_concurrent']
    )

    # Generate parameter combos (including seeds)
    param_sets = runner.get_parameter_combinations(
        base_seed_hex=SIMULATION_CONFIG['base_seed_hex'],
        num_runs=SIMULATION_CONFIG['num_runs']
    )

    # Optional: shuffle them for random ordering
    random.shuffle(param_sets)

    print(f"Total runs to execute: {len(param_sets)}")

    # Execute them in parallel
    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()
