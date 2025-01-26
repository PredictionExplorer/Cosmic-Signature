import itertools
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional, Tuple
import subprocess
import random

@dataclass
class SimulationParams:
    """Holds all parameters for a single simulation run"""
    num_steps: int
    num_sims: int
    location: float
    velocity: float
    min_mass: float
    max_mass: float
    avoid_effects: bool
    no_video: bool
    dynamic_bounds: bool
    special_color: Optional[str]
    video_tail_min: float
    video_tail_max: float
    image_tail_min: float
    image_tail_max: float
    special_color_video_tail_min: float
    special_color_video_tail_max: float
    special_color_image_tail_min: float
    special_color_image_tail_max: float
    seed: str

def generate_file_name(params: SimulationParams, run_number: int) -> str:
    """Create a simplified file name using just essential parameters"""
    return f"sim_{run_number:04d}"

def run_simulation(command_list: List[str]) -> Tuple[str, Optional[str]]:
    """Run the Rust program via subprocess"""
    shell_command = " ".join(command_list)
    try:
        result = subprocess.run(
            command_list,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return (shell_command, result.stdout.strip())
    except subprocess.CalledProcessError:
        return (shell_command, None)

def build_command_list(program_path: str, params: SimulationParams, file_name: str) -> List[str]:
    """Construct the command list for the simulation"""
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
        "--force-visible",
        "--auto-levels-black-percent", "0.0",
        "--auto-levels-white-percent", "0.9",
        "--auto-levels-gamma", "0.8",
        "--video-tail-min", str(params.video_tail_min),
        "--video-tail-max", str(params.video_tail_max),
        "--image-tail-min", str(params.image_tail_min),
        "--image-tail-max", str(params.image_tail_max),
        "--special-color-video-tail-min", str(params.special_color_video_tail_min),
        "--special-color-video-tail-max", str(params.special_color_video_tail_max),
        "--special-color-image-tail-min", str(params.special_color_image_tail_min),
        "--special-color-image-tail-max", str(params.special_color_image_tail_max)
    ]

    # Add optional flags
    if params.avoid_effects:
        cmd.append("--avoid-effects")
    if params.no_video:
        cmd.append("--no-video")
    if params.dynamic_bounds:
        cmd.append("--dynamic-bounds")
    if params.special_color:
        cmd.extend(["--special-color", params.special_color])

    return cmd

class SimulationRunner:
    def __init__(self, program_path: str, max_concurrent: int):
        self.program_path = program_path
        self.max_concurrent = max_concurrent
        
    def get_parameter_combinations(self, base_seed_hex: str, num_runs: int) -> List[SimulationParams]:
        """Generate all parameter combinations"""
        param_ranges = {
            'num_steps': [1_000_000],
            'num_sims': [500],
            'location': [250.0],
            'velocity': [1.0],
            'min_mass': [100.0],
            'max_mass': [300.0],
            'avoid_effects': [False],
            'no_video': [False],
            'dynamic_bounds': [False],
            'special_color': [None],
            'video_tail_min': [2000.0],
            'video_tail_max': [2000.0],
            'image_tail_min': [2000.0],
            'image_tail_max': [2000.0],
            'special_color_video_tail_min': [1.0],
            'special_color_video_tail_max': [1.0],
            'special_color_image_tail_min': [2.0],
            'special_color_image_tail_max': [2.0]
        }

        param_sets = []
        for combo in itertools.product(*param_ranges.values()):
            for i in range(num_runs):
                seed_suffix = f"{i:04X}"
                full_seed = f"0x{base_seed_hex}{seed_suffix}"
                
                params = SimulationParams(
                    *combo,
                    seed=full_seed
                )
                param_sets.append(params)
                
        return param_sets

    def run_simulations(self, param_sets: List[SimulationParams]):
        """Run simulations in parallel"""
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {}
            for i, params in enumerate(param_sets):
                file_name = generate_file_name(params, i)
                
                # Skip if video already exists
                if not params.no_video and os.path.isfile(f'vids/{file_name}.mp4'):
                    continue
                
                cmd_list = build_command_list(self.program_path, params, file_name)
                fut = executor.submit(run_simulation, cmd_list)
                futures[fut] = cmd_list

            for future in as_completed(futures):
                cmd_list = futures[future]
                shell_command, output = future.result()
                print(f"Finished command:\n  {shell_command}")
                if output:
                    print(f"Output:\n{output}")
                else:
                    print("No output or an error occurred.")

def main():
    print("Starting batch runs of the Rust three-body simulator...")
    
    runner = SimulationRunner(
        program_path='./target/release/three_body_problem',
        max_concurrent=1
    )
    
    param_sets = runner.get_parameter_combinations(
        base_seed_hex="890129",
        num_runs=500
    )
    
    random.shuffle(param_sets)
    print(f"Total runs to execute: {len(param_sets)}")
    
    runner.run_simulations(param_sets)

if __name__ == "__main__":
    main()