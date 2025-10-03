#!/usr/bin/env python3
"""
Three Body Problem Simulation Batch Runner

Runs multiple three-body simulations with different parameter combinations.
Each simulation is executed twice: once in standard mode and once in special mode.
"""

import subprocess
import os
import hashlib
import argparse
import itertools
from pathlib import Path


# ===================== Configuration =====================

CONFIG = {
    'program_path': './target/release/three_body_problem',
    'num_sims': 5000,  # Fixed number of simulations per run

    # Seed generation
    'base_seed_string': 'cosmic_signature2',
    'seed_hex_bytes': 6,  # 48 bits
    'num_seeds_per_combo': 5,  # Reduced for broader parameter coverage

    # Drift parameter test matrix (optimized for visual variety ~200 runs)
    # Scale: Controls camera movement magnitude (subtle to dramatic)
    'drift_scales': [0.5, 1.5, 3.5, 6.0],

    # Arc fraction: How much of orbit traversed (0=static, 1=full circle)
    # 0.15=subtle sweep, 0.35=moderate pan, 0.65=dramatic arc
    'drift_arc_fractions': [0.15, 0.35],

    # Eccentricity: Orbit shape (0=circle, 1=parabola)
    # 0.1=smooth circular, 0.45=balanced ellipse, 0.8=dramatic elongation
    'drift_orbit_eccentricities': [0.1, 0.45],

    'drift_mode': 'elliptical',
}


def generate_hex_seed(input_string: str, num_bytes: int) -> str:
    """Generate a hex seed string from input using SHA-256."""
    hasher = hashlib.sha256()
    hasher.update(input_string.encode('utf-8'))
    hash_bytes = hasher.digest()
    seed_bytes = hash_bytes[:num_bytes]
    return "0x" + seed_bytes.hex()


def run_simulation(command: list[str], description: str) -> bool:
    """
    Execute a single simulation command.

    Args:
        command: Command and arguments to execute
        description: Human-readable description of the job

    Returns:
        True if successful, False otherwise
    """
    print(f"\n{'='*60}")
    print(f"Running: {description}")
    print(f"Command: {' '.join(command)}")
    print('='*60)

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=False
        )

        # Print output
        if result.stdout:
            print(result.stdout)

        if result.returncode == 0:
            print(f"✓ Completed: {description}")
            return True
        else:
            print(f"✗ Failed (exit code {result.returncode}): {description}")
            return False

    except KeyboardInterrupt:
        print(f"\n⚠ Interrupted: {description}")
        raise
    except Exception as e:
        print(f"✗ Error: {description}\n  {e}")
        return False


def build_command(
    program_path: str,
    seed: str,
    filename: str,
    num_sims: int,
    drift_config: dict,
    special: bool = False,
    test_frame: bool = False
) -> list[str]:
    """
    Build the command line for a simulation run.

    Args:
        program_path: Path to the executable
        seed: Hex seed string
        filename: Base output filename
        num_sims: Number of simulations
        drift_config: Drift parameters dictionary
        special: Whether to enable special mode
        test_frame: Whether to enable test frame mode (render first frame only)

    Returns:
        Command as list of strings
    """
    command = [
        program_path,
        '--seed', seed,
        '--file-name', filename,
        '--num-sims', str(num_sims),
        '--drift-mode', drift_config['mode'],
        '--drift-scale', str(drift_config['scale']),
        '--drift-arc-fraction', str(drift_config['arc_fraction']),
        '--drift-orbit-eccentricity', str(drift_config['orbit_eccentricity']),
    ]

    if special:
        command.append('--special')

    if test_frame:
        command.append('--test-frame')

    return command


def main():
    parser = argparse.ArgumentParser(
        description='Run three-body simulations with parameter sweep',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                    # Run full parameter matrix
  %(prog)s --num-seeds 3      # Run with 3 seeds per combination
  %(prog)s --skip-existing    # Skip files that already exist
        """
    )

    parser.add_argument(
        '--num-seeds',
        type=int,
        default=CONFIG['num_seeds_per_combo'],
        help='Number of seeds per parameter combination (default: %(default)s)'
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Skip simulations where output files already exist'
    )
    parser.add_argument(
        '--no-shuffle',
        action='store_true',
        help='Run jobs in deterministic order instead of shuffled'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print commands without executing'
    )
    parser.add_argument(
        '--test-frame',
        action='store_true',
        help='Test mode: render only first frame (no video, much faster)'
    )

    args = parser.parse_args()

    # Ensure output directories exist
    Path('pics').mkdir(exist_ok=True)
    Path('vids').mkdir(exist_ok=True)

    # Build parameter matrix
    drift_configs = []
    for scale, arc_frac, eccen in itertools.product(
        CONFIG['drift_scales'],
        CONFIG['drift_arc_fractions'],
        CONFIG['drift_orbit_eccentricities']
    ):
        drift_configs.append({
            'mode': CONFIG['drift_mode'],
            'scale': scale,
            'arc_fraction': arc_frac,
            'orbit_eccentricity': eccen,
        })

    # Summary
    total_combinations = len(drift_configs) * args.num_seeds
    total_runs = total_combinations * 2  # Each run done twice (standard + special)

    print("\n" + "="*60)
    print("Three Body Problem Batch Runner")
    print("="*60)
    print(f"Parameter combinations: {len(drift_configs)}")
    print(f"Seeds per combination: {args.num_seeds}")
    print(f"Simulations per run: {CONFIG['num_sims']}")
    print(f"Total unique configs: {total_combinations}")
    print(f"Total runs (×2 for special mode): {total_runs}")
    print(f"Test frame mode: {'ENABLED (first frame only)' if args.test_frame else 'DISABLED (full video)'}")
    print(f"\nDrift parameter ranges:")
    print(f"  Scales: {CONFIG['drift_scales']}")
    print(f"  Arc fractions: {CONFIG['drift_arc_fractions']}")
    print(f"  Eccentricities: {CONFIG['drift_orbit_eccentricities']}")
    print("="*60 + "\n")

    # Generate all jobs
    jobs = []

    for seed_idx in range(args.num_seeds):
        for drift_config in drift_configs:
            # Generate seed (same for both standard and special runs)
            input_seed_str = f"{CONFIG['base_seed_string']}_{seed_idx}"
            hex_seed = generate_hex_seed(input_seed_str, CONFIG['seed_hex_bytes'])
            seed_suffix = hex_seed[2:][:8]  # First 8 hex chars

            # Build drift parameter string for filename
            drift_str = (
                f"s{drift_config['scale']}_"
                f"af{drift_config['arc_fraction']}_"
                f"oe{drift_config['orbit_eccentricity']}"
            )

            # Create two jobs: standard and special
            for special_mode in [True, False]:
                mode_suffix = "special" if special_mode else "standard"
                filename = f"{seed_suffix}_{drift_str}_{mode_suffix}"

                # Check if output already exists
                output_path = Path('pics') / f"{filename}.png"
                if args.skip_existing and output_path.exists():
                    print(f"Skipping (exists): {filename}")
                    continue

                # Build command
                command = build_command(
                    CONFIG['program_path'],
                    hex_seed,
                    filename,
                    CONFIG['num_sims'],
                    drift_config,
                    special_mode,
                    args.test_frame
                )

                # Create job description
                description = (
                    f"seed={seed_suffix} "
                    f"scale={drift_config['scale']} "
                    f"af={drift_config['arc_fraction']} "
                    f"oe={drift_config['orbit_eccentricity']} "
                    f"[{mode_suffix.upper()}]"
                )

                jobs.append({
                    'command': command,
                    'description': description,
                    'filename': filename
                })

    # Shuffle jobs for better distribution (unless disabled)
    if not args.no_shuffle:
        import random
        random.shuffle(jobs)
        print(f"Shuffled {len(jobs)} jobs for randomized execution order\n")
    else:
        print(f"Running {len(jobs)} jobs in deterministic order\n")

    if args.dry_run:
        print("DRY RUN - Commands that would be executed:\n")
        for i, job in enumerate(jobs, 1):
            print(f"{i}. {' '.join(job['command'])}")
        return

    # Execute jobs sequentially
    successful = 0
    failed = 0

    try:
        for i, job in enumerate(jobs, 1):
            print(f"\n[Job {i}/{len(jobs)}]")

            success = run_simulation(job['command'], job['description'])

            if success:
                successful += 1
            else:
                failed += 1

    except KeyboardInterrupt:
        print("\n\n⚠ Batch run interrupted by user")

    # Summary
    print("\n" + "="*60)
    print("Batch Run Complete")
    print("="*60)
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Total: {successful + failed}")
    if args.test_frame:
        print(f"\nOutput files in: ./pics/ (test frames only, no videos)")
    else:
        print(f"\nOutput files in: ./pics/ and ./vids/")
    print("="*60 + "\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nScript terminated by user.")
        exit(130)
