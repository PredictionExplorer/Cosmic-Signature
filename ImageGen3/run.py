import itertools
import random
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional, Tuple

# ===================== Simulation Configuration =====================
SIMULATION_CONFIG = {
    # Path to your compiled Rust program:
    'program_path': './target/release/three_body_problem',

    # Parallelism
    'max_concurrent': 1,

    # Base hex seed + how many variant runs
    'base_seed_hex': "100030",
    'num_runs': 10,   # e.g. number of seeds, adjust as needed

    # The relevant command-line arguments for the core parameters
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
        'lyap_weight': [2.5],
        'frame_size': [1800],

        # Newly included parameters corresponding to the Rust code's defaults:
        'disable_png': [False],
        'disable_avif': [False],
        'disable_blur': [False],
        'disable_video': [False],
        'avif_speed': [0],
        'avif_quality': [90],
    },

    # We define 5 "blur variants" as before (each variant changes radius fraction, strength, core brightness)
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
      --num-steps, --num-sims, --location, --velocity,
      --min-mass, --max-mass, --max-points,
      --chaos-weight, --perimeter-weight, --dist-weight, --lyap-weight,
      --clip-black, --clip-white, --levels-gamma,
      --frame-size,

      And the newly introduced arguments:
      --disable-png, --disable-avif, --disable-blur, --disable-video,
      --avif-speed, --avif-quality,

      And the three "blur" parameters:
      --blur-radius-fraction, --blur-strength, --blur-core-brightness

    By default, booleans (disable_*) are False so images and videos
    will be generated.  The user can override if needed.
    """
    # Core simulation parameters
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

    # Booleans/flags
    disable_png: bool
    disable_avif: bool
    disable_blur: bool
    disable_video: bool

    # AVIF settings
    avif_speed: int
    avif_quality: int

    # Additional blur parameters
    blur_radius_fraction: float
    blur_strength: float
    blur_core_brightness: float

    # The unique seed for this run
    seed: str


def generate_file_name(params: SimulationParams) -> str:
    """
    Create a file name using the seed value, plus the blur settings.
    We'll strip the '0x' from the seed, for uniqueness.

    Example: "seed_10002501_blur0.010_str1.00_core2.00"
    """
    seed_part = params.seed[2:]  # remove leading '0x'
    return (
        f"seed_{seed_part}"
        f"_blur{params.blur_radius_fraction:.3f}"
        f"_str{params.blur_strength:.2f}"
        f"_core{params.blur_core_brightness:.2f}"
    )


def build_command_list(program_path: str, params: SimulationParams, file_name: str) -> List[str]:
    """
    Construct the command list for the Rust simulation.
    Includes *every* CLI parameter present in the Rust program.
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

        # The blur-related arguments
        "--blur-radius-fraction", str(params.blur_radius_fraction),
        "--blur-strength", str(params.blur_strength),
        "--blur-core-brightness", str(params.blur_core_brightness),
    ]

    # Booleans: Only add them if they're True
    if params.disable_png:
        cmd.append("--disable-png")
    if params.disable_avif:
        cmd.append("--disable-avif")
    if params.disable_blur:
        cmd.append("--disable-blur")
    if params.disable_video:
        cmd.append("--disable-video")

    # AVIF speed/quality
    cmd.append("--avif-speed")
    cmd.append(str(params.avif_speed))

    cmd.append("--avif-quality")
    cmd.append(str(params.avif_quality))

    return cmd


def run_simulation(command_list: List[str]) -> Tuple[str, Optional[str]]:
    """
    Run the Rust program via subprocess.
    Returns (command_string, output).
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
    except subprocess.CalledProcessError as e:
        print("Error occurred while running command:")
        print(e.stderr)
        return (cmd_str, None)


class SimulationRunner:
    def __init__(self, program_path: str, max_concurrent: int):
        self.program_path = program_path
        self.max_concurrent = max_concurrent

    def get_parameter_combinations(
        self,
        base_seed_hex: str,
        num_runs: int
    ) -> List[SimulationParams]:
        """
        Generate all combinations from 'param_ranges' in SIMULATION_CONFIG.
        Then for each combination, produce multiple seeds, and for each seed,
        produce multiple "blur variants".

        This yields a list of SimulationParams, each describing a single run.
        """
        keys = list(SIMULATION_CONFIG['param_ranges'].keys())
        param_values = list(SIMULATION_CONFIG['param_ranges'].values())

        param_sets = []
        # e.g. if each param has exactly 1 value, we only get 1 combo, but let's keep it general
        for combo in itertools.product(*param_values):
            for i in range(num_runs):
                # Build a unique seed, e.g. 0x100030 + i in hex
                # i is turned into 4 hex digits => e.g. "0000", "0001", "0002"
                seed_suffix = f"{i:04X}"
                full_seed = f"0x{base_seed_hex}{seed_suffix}"

                # Convert 'combo' -> dict of base param fields
                combo_dict = dict(zip(keys, combo))

                # For each blur variant, create a separate SimulationParams
                for (radius_frac, strength, core_bright) in SIMULATION_CONFIG['blur_variants']:
                    params = SimulationParams(
                        num_steps=combo_dict['num_steps'],
                        num_sims=combo_dict['num_sims'],
                        location=combo_dict['location'],
                        velocity=combo_dict['velocity'],
                        min_mass=combo_dict['min_mass'],
                        max_mass=combo_dict['max_mass'],
                        clip_black=combo_dict['clip_black'],
                        clip_white=combo_dict['clip_white'],
                        levels_gamma=combo_dict['levels_gamma'],
                        max_points=combo_dict['max_points'],
                        chaos_weight=combo_dict['chaos_weight'],
                        perimeter_weight=combo_dict['perimeter_weight'],
                        dist_weight=combo_dict['dist_weight'],
                        lyap_weight=combo_dict['lyap_weight'],
                        frame_size=combo_dict['frame_size'],

                        disable_png=combo_dict['disable_png'],
                        disable_avif=combo_dict['disable_avif'],
                        disable_blur=combo_dict['disable_blur'],
                        disable_video=combo_dict['disable_video'],
                        avif_speed=combo_dict['avif_speed'],
                        avif_quality=combo_dict['avif_quality'],

                        blur_radius_fraction=radius_frac,
                        blur_strength=strength,
                        blur_core_brightness=core_bright,

                        seed=full_seed
                    )
                    param_sets.append(params)

        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """
        Execute each SimulationParams in a ThreadPoolExecutor, up to 'max_concurrent' concurrency.
        """
        print(f"Total tasks to execute: {len(param_sets)}")

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for params in param_sets:
                file_name = generate_file_name(params)
                cmd_list = build_command_list(self.program_path, params, file_name)
                fut = executor.submit(run_simulation, cmd_list)
                futures[fut] = cmd_list

            for future in as_completed(futures):
                shell_command, output = future.result()
                print(f"Finished command:\n  {shell_command}")
                if output:
                    print(f"Output:\n{output}\n")
                else:
                    print("No output or an error occurred.\n")


def main():
    print("Starting batch runs of the Rust three-body simulator, enumerating all parameters.\n"
          "We produce 5 blur variants per seed. Images and videos are generated by default.\n")

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

    # (Optional) shuffle to randomize execution order:
    # random.shuffle(param_sets)

    # Execute them in parallel
    runner.run_simulations(param_sets)


if __name__ == "__main__":
    main()