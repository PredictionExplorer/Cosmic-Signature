import subprocess
import os
import random
import time
import hashlib # For seed generation
from concurrent.futures import ThreadPoolExecutor
import argparse

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'max_concurrent': 3,
    'max_random_sleep': 100,
    # --- Seed Generation Config ---
    'base_seed_string': "cosmic_signature", # Base string for seed generation
    'num_seeds_per_combo': 30,             # How many seeds to try for each drift combo
    'seed_hex_bytes': 6,                    # How many bytes of the hash to use (6 bytes = 48 bits)
    # --- Drift Test Matrix ---
    'drift_scales': [0.3, 1.0, 3.0, 10.0, 30.0, 100.0, 300.0],      # Different drift scales to test
    'drift_modes': ['none', 'brownian'],  # Different drift modes to test
    'use_test_matrix': True                # Whether to use the test matrix or single config
}

def run_command(cmd):
    """
    Helper function to run a single simulation command.
    Prints output in real-time.
    Includes an optional random sleep.
    """
    max_sleep = CONFIG.get('max_random_sleep', 0)
    if max_sleep > 0:
        sleep_duration = random.uniform(0, max_sleep)
        print(f"PID {os.getpid()}: Sleeping for {sleep_duration:.2f} seconds before running {' '.join(cmd)}")
        time.sleep(sleep_duration)

    print(f"PID {os.getpid()}: Running command: {' '.join(cmd)}")
    try:
        # Use Popen to run the command and stream output
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1, universal_newlines=True)

        # Read and print stdout line by line
        if process.stdout:
            for line in process.stdout:
                print(f"[stdout] {line.strip()}", flush=True)

        # Read and print stderr line by line after stdout is exhausted
        # Or you could potentially read them concurrently with threads/select if needed
        stderr_output = ""
        if process.stderr:
            stderr_output = process.stderr.read()
            if stderr_output:
                print(f"[stderr] {stderr_output.strip()}", flush=True)

        process.wait() # Wait for the process to complete

        if process.returncode == 0:
            print(f"PID {os.getpid()}: Command finished successfully: {' '.join(cmd)}")
        else:
            print(f"PID {os.getpid()}: Command failed with return code {process.returncode}: {' '.join(cmd)}")
            # Stderr was already printed if it existed

    except KeyboardInterrupt:
        print(f"PID {os.getpid()}: Command interrupted by user: {' '.join(cmd)}")
        # Let the main thread handle the interrupt
        raise
    except Exception as e:
        print(f"PID {os.getpid()}: An unexpected error occurred running {' '.join(cmd)}: {e}")

def generate_hex_seed(input_string, num_bytes):
    """Generates a hex seed string from an input string using SHA-256."""
    hasher = hashlib.sha256()
    hasher.update(input_string.encode('utf-8'))
    hash_bytes = hasher.digest()
    seed_bytes = hash_bytes[:num_bytes]
    return "0x" + seed_bytes.hex()

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run multiple three-body simulations with different seeds')
    parser.add_argument('--single-config', action='store_true',
                        help='Run single configuration instead of test matrix')
    parser.add_argument('--drift-mode', choices=['brownian', 'linear', 'none'],
                        help='Drift mode for single config')
    parser.add_argument('--drift-scale', type=float,
                        help='Scale of drift motion for single config')
    parser.add_argument('--num-seeds', type=int,
                        default=CONFIG.get('num_seeds_per_combo', 10),
                        help='Number of seeds per configuration (default: 10)')
    parser.add_argument('--max-concurrent', type=int,
                        default=CONFIG.get('max_concurrent', 1),
                        help='Maximum concurrent workers (default: 1)')
    args = parser.parse_args()

    # Update CONFIG based on arguments
    CONFIG['max_concurrent'] = args.max_concurrent
    CONFIG['num_seeds_per_combo'] = args.num_seeds

    if args.single_config:
        CONFIG['use_test_matrix'] = False
        # For single config, use provided drift settings or defaults
        if args.drift_mode:
            CONFIG['single_drift_mode'] = args.drift_mode
        else:
            CONFIG['single_drift_mode'] = 'brownian'

        if args.drift_scale is not None:
            CONFIG['single_drift_scale'] = args.drift_scale
        else:
            CONFIG['single_drift_scale'] = 0.01

        # Get config values
    max_workers = CONFIG['max_concurrent']
    base_string = CONFIG['base_seed_string']
    seed_bytes_len = CONFIG['seed_hex_bytes']
    num_seeds = CONFIG['num_seeds_per_combo']

    # Generate drift configurations
    drift_configs = []
    if CONFIG['use_test_matrix']:
        # Generate all combinations
        for mode in CONFIG['drift_modes']:
            if mode == 'none':
                drift_configs.append({'mode': mode, 'scale': 0, 'enabled': False})
            else:
                for scale in CONFIG['drift_scales']:
                    drift_configs.append({'mode': mode, 'scale': scale, 'enabled': True})

        print(f"Running test matrix with {len(drift_configs)} drift configurations:")
        for config in drift_configs:
            if config['enabled']:
                print(f"  - {config['mode']} drift, scale={config['scale']}")
            else:
                print(f"  - no drift")
        print(f"Each configuration will use {num_seeds} different seeds")
        print(f"Total runs: {len(drift_configs) * num_seeds}")
    else:
        # Single configuration
        mode = CONFIG.get('single_drift_mode', 'brownian')
        scale = CONFIG.get('single_drift_scale', 0.01)
        if mode == 'none':
            drift_configs.append({'mode': mode, 'scale': 0, 'enabled': False})
        else:
            drift_configs.append({'mode': mode, 'scale': scale, 'enabled': True})

        if drift_configs[0]['enabled']:
            print(f"Running single configuration: {mode} drift, scale={scale}")
        else:
            print(f"Running single configuration: no drift")
        print(f"Using {num_seeds} different seeds")

        # Rust program now saves PNGs to 'pics/' and videos to 'vids/'
    pics_dir = "pics"
    print(f"\nOutput PNGs will be saved in ./{pics_dir}/")
    print(f"Using max {max_workers} concurrent workers\n")

    # Generate all job configurations first
    all_jobs = []
    for drift_config in drift_configs:
        # Format drift info for filename
        if drift_config['enabled']:
            drift_str = f"{drift_config['mode']}_s{drift_config['scale']}"
        else:
            drift_str = "nodrift"

        # Generate seeds for this configuration
        for seed_idx in range(num_seeds):
            job_info = {
                'drift_config': drift_config,
                'drift_str': drift_str,
                'seed_idx': seed_idx,
                'base_string': base_string,
                'seed_bytes_len': seed_bytes_len,
                'pics_dir': pics_dir
            }
            all_jobs.append(job_info)

    # Randomize the order of all jobs
    random.shuffle(all_jobs)
    print(f"Randomized order of {len(all_jobs)} total jobs\n")

    futures = []
    run_counter = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Process jobs in randomized order
        for job in all_jobs:
            drift_config = job['drift_config']
            drift_str = job['drift_str']
            seed_idx = job['seed_idx']

            # 1. Generate the input string for hashing - include drift config
            input_seed_str = f"{drift_str}_{seed_idx}"

            # 2. Generate the actual hex seed using the hash
            hex_seed = generate_hex_seed(input_seed_str, job['seed_bytes_len'])

            # 3. Derive filename including drift settings
            seed_suffix = hex_seed[2:][:8] # Use first 8 chars of hex seed
            output_file_base = f"{seed_suffix}_{drift_str}"

            # Check existence in the 'pics' directory
            output_png_path = os.path.join(job['pics_dir'], f"{output_file_base}.png")

            # 4. Check if the output PNG already exists
            if os.path.exists(output_png_path):
                print(f"Skipping: {output_file_base} (already exists)")
                continue # Skip this iteration

            # 5. Construct the command
            command = [
                CONFIG['program_path'],
                '--seed', hex_seed,
                # Pass ONLY the base filename - Rust handles the directory
                '--file-name', output_file_base
            ]

            # Add drift configuration
            if not drift_config['enabled']:
                command.append('--no-drift')
            else:
                # Add drift mode and scale
                command.extend(['--drift-mode', drift_config['mode']])
                command.extend(['--drift-scale', str(drift_config['scale'])])

            # 6. Submit the command to the executor
            print(f"Submitting: {output_file_base} (seed {hex_seed})")
            futures.append(executor.submit(run_command, command))
            run_counter += 1

        print(f"\nAll {len(futures)} jobs submitted. Waiting for completion...")
        # Wait for all submitted futures to complete
        for future in futures:
            try:
                future.result() # Wait for the task to finish and retrieve result/exception
            except Exception as e:
                print(f"A job raised an exception: {e}")
            except KeyboardInterrupt:
                 print("\nCaught KeyboardInterrupt, stopping...")
                 # Attempt to cancel pending futures
                 executor.shutdown(wait=False, cancel_futures=True)
                 break # Exit the loop

    print(f"\nCompleted! Processed {run_counter} unique configurations.")
    print("Check the 'pics/' directory for results organized by drift settings.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScript terminated by user.")
