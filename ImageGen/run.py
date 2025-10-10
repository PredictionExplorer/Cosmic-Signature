#!/usr/bin/env python3
"""
Simple infinite runner for Three Body Problem simulations.
Generates random seeds and randomly chooses special/standard mode.
"""

import subprocess
import secrets
import random
import time
from pathlib import Path


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


def run_simulation(seed: str, is_special: bool) -> bool:
    """Run a single simulation with the given parameters."""
    mode = "special" if is_special else "standard"
    filename = f"{seed[2:]}_{mode}"  # Remove '0x' prefix for filename

    command = [
        './target/release/three_body_problem',
        '--seed', seed,
        '--file-name', filename,
    ]

    if is_special:
        command.append('--special')

    print(f"\n{'='*60}")
    print(f"Seed: {seed} | Mode: {mode.upper()}")
    print(f"File: {filename}")
    print('='*60)

    try:
        result = subprocess.run(command, check=False)
        success = result.returncode == 0

        if success:
            print(f"✓ Completed: {filename}")
        else:
            print(f"✗ Failed: {filename}")

        return success

    except KeyboardInterrupt:
        raise
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def main():
    """Run simulations indefinitely with random seeds and modes."""
    print("\n" + "="*60)
    print("Three Body Problem - Infinite Random Runner")
    print("="*60)
    print("Generating random seeds and modes...")
    print("Press Ctrl+C to stop")
    print("="*60 + "\n")

    # Ensure output directories exist
    Path('pics').mkdir(exist_ok=True)
    Path('vids').mkdir(exist_ok=True)

    count = 0
    successful = 0
    failed = 0

    try:
        while True:
            count += 1

            # Generate random seed and mode
            seed = generate_random_seed()
            is_special = random.choice([True, False])

            print(f"\n[Generation {count}] (Success: {successful}, Failed: {failed})")

            # Run simulation
            success = run_simulation(seed, is_special)

            if success:
                successful += 1
            else:
                failed += 1
                # Brief pause on failure to avoid rapid error loops
                time.sleep(2)

    except KeyboardInterrupt:
        print("\n\n" + "="*60)
        print("Stopped by user")
        print("="*60)
        print(f"Total runs: {count}")
        print(f"Successful: {successful}")
        print(f"Failed: {failed}")
        print("="*60 + "\n")


if __name__ == "__main__":
    main()
