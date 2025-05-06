import subprocess
import os
import random
import time
import hashlib # For seed generation
from concurrent.futures import ThreadPoolExecutor
import concurrent.futures
import argparse
import itertools

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'max_concurrent': 1,  # Always single-threaded as requested
    'max_random_sleep': 0,  # No sleep needed for single-threaded
    # --- Seed Generation Config ---
    'base_seed_string': "cosmic_signature00", # Base string for seed generation
    'num_seeds_per_combo': 6,               # Seeds per parameter combination (adjusted for ~500 total jobs)
    'seed_hex_bytes': 6,                    # How many bytes of the hash to use (6 bytes = 48 bits)
    # --- Drift Test Matrix ---
    'drift_scales': [0.5, 1.5, 3.0, 5.0, 8.0],  # Drift scales between 0 and 10
    'drift_arc_fractions': [0.1, 0.2, 0.4, 0.7],  # Reasonable arc fraction values
    'drift_orbit_eccentricities': [0.1, 0.3, 0.5, 0.8],  # Eccentricity values (0 = circle, 1 = parabola)
    'drift_mode': 'elliptical',                 # Only test elliptical drift mode
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
    parser = argparse.ArgumentParser(description='Run multiple three-body simulations with different parameter combinations')
    parser.add_argument('--single-config', action='store_true',
                        help='Run single configuration instead of test matrix')
    parser.add_argument('--drift-mode', choices=['linear'],
                        help='Drift mode for single config (only linear supported)')
    parser.add_argument('--drift-scale', type=float,
                        help='Scale of drift motion for single config')
    parser.add_argument('--drift-arc-fraction', type=float,
                        help='Arc fraction for single config')
    parser.add_argument('--drift-orbit-eccentricity', type=float,
                        help='Orbit eccentricity for single config')
    parser.add_argument('--num-seeds', type=int,
                        default=CONFIG.get('num_seeds_per_combo', 6),
                        help='Number of seeds per configuration (default: 6)')
    parser.add_argument('--total-jobs', type=int,
                        help='Override total number of jobs to run (will adjust seeds per combo)')
    args = parser.parse_args()

    # Always use single-threaded execution
    CONFIG['max_concurrent'] = 1
    CONFIG['num_seeds_per_combo'] = args.num_seeds

    if args.single_config:
        CONFIG['use_test_matrix'] = False
        # For single config, use provided drift settings or defaults
        CONFIG['single_drift_mode'] = args.drift_mode or 'linear'
        CONFIG['single_drift_scale'] = args.drift_scale if args.drift_scale is not None else 1.5
        CONFIG['single_drift_arc_fraction'] = args.drift_arc_fraction if args.drift_arc_fraction is not None else 0.2
        CONFIG['single_drift_orbit_eccentricity'] = args.drift_orbit_eccentricity if args.drift_orbit_eccentricity is not None else 0.3

    # Get config values
    max_workers = CONFIG['max_concurrent']
    base_string = CONFIG['base_seed_string']
    seed_bytes_len = CONFIG['seed_hex_bytes']
    num_seeds = CONFIG['num_seeds_per_combo']

    # Generate drift configurations
    drift_configs = []
    if CONFIG['use_test_matrix']:
        # Generate all combinations of parameters
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
                'enabled': True
            })

        # Adjust seeds per combo if total-jobs specified
        if args.total_jobs:
            num_seeds = max(1, args.total_jobs // len(drift_configs))
            CONFIG['num_seeds_per_combo'] = num_seeds
            print(f"Adjusted to {num_seeds} seeds per combination to reach ~{args.total_jobs} total jobs")

        total_jobs = num_seeds * len(drift_configs)
        print(f"Running test matrix with {len(drift_configs)} parameter combinations:")
        print(f"  - Drift scales: {CONFIG['drift_scales']}")
        print(f"  - Arc fractions: {CONFIG['drift_arc_fractions']}")
        print(f"  - Orbit eccentricities: {CONFIG['drift_orbit_eccentricities']}")
        print(f"Will generate {num_seeds} random seeds per combination")
        print(f"Total runs: {num_seeds} × {len(drift_configs)} = {total_jobs}")
    else:
        # Single configuration
        mode = CONFIG.get('single_drift_mode', 'linear')
        scale = CONFIG.get('single_drift_scale', 1.5)
        arc_fraction = CONFIG.get('single_drift_arc_fraction', 0.2)
        orbit_eccentricity = CONFIG.get('single_drift_orbit_eccentricity', 0.3)
        drift_configs.append({
            'mode': mode,
            'scale': scale,
            'arc_fraction': arc_fraction,
            'orbit_eccentricity': orbit_eccentricity,
            'enabled': True
        })

        print(f"Running single configuration:")
        print(f"  - Mode: {mode}")
        print(f"  - Scale: {scale}")
        print(f"  - Arc fraction: {arc_fraction}")
        print(f"  - Orbit eccentricity: {orbit_eccentricity}")
        print(f"Using {num_seeds} different seeds")

        # Rust program now saves PNGs to 'pics/' and videos to 'vids/'
    pics_dir = "pics"
    print(f"\nOutput PNGs will be saved in ./{pics_dir}/")
    print(f"Using max {max_workers} concurrent workers\n")

    # Generate all job configurations first
    # Iterate through seeds first, then drift configs for each combination
    all_jobs = []

    for seed_idx in range(num_seeds):
        for drift_config in drift_configs:
            # Format drift info for filename - include all parameters
            drift_str = f"s{drift_config['scale']}_af{drift_config['arc_fraction']}_oe{drift_config['orbit_eccentricity']}"

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

    # Prepare jobs to run (filter out existing ones first)
    jobs_to_run = []
    skipped_count = 0

    for job in all_jobs:
        drift_config = job['drift_config']
        drift_str = job['drift_str']
        seed_idx = job['seed_idx']

        # 1. Generate the input string for hashing - DO NOT include drift config
        # This ensures the same seed is used across all drift settings
        input_seed_str = f"{base_string}_{seed_idx}"

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
            skipped_count += 1
            continue # Skip this iteration

        # 5. Construct the command
        command = [
            CONFIG['program_path'],
            '--seed', hex_seed,
            # Pass ONLY the base filename - Rust handles the directory
            '--file-name', output_file_base,
            # Add drift mode and all parameters
            '--drift-mode', drift_config['mode'],
            '--drift-scale', str(drift_config['scale']),
            '--drift-arc-fraction', str(drift_config['arc_fraction']),
            '--drift-orbit-eccentricity', str(drift_config['orbit_eccentricity'])
        ]

        jobs_to_run.append({
            'command': command,
            'output_file_base': output_file_base,
            'hex_seed': hex_seed
        })

    print(f"\nSkipped {skipped_count} existing files")
    print(f"Will run {len(jobs_to_run)} jobs sequentially (single-threaded)\n")

    # Run jobs sequentially (single-threaded as requested)
    run_counter = 0
    active_futures = {}
    job_index = 0

    with ThreadPoolExecutor(max_workers=1) as executor:
        # Submit initial batch of jobs
        while len(active_futures) < max_workers and job_index < len(jobs_to_run):
            job = jobs_to_run[job_index]
            jobs_remaining = len(jobs_to_run) - job_index
            print(f"[Submitting] {job['output_file_base']} (seed {job['hex_seed']}) | Jobs remaining: {jobs_remaining}")
            future = executor.submit(run_command, job['command'])
            active_futures[future] = job
            job_index += 1
            run_counter += 1

        # Process jobs as they complete and submit new ones
        try:
            while active_futures:
                # Wait for at least one job to complete
                done, pending = concurrent.futures.wait(
                    active_futures.keys(),
                    return_when=concurrent.futures.FIRST_COMPLETED
                )

                # Process completed jobs
                for future in done:
                    job = active_futures.pop(future)
                    try:
                        future.result()  # This will raise exception if job failed
                        print(f"[Completed] {job['output_file_base']} | Active jobs: {len(active_futures)}")
                    except Exception as e:
                        print(f"[Failed] {job['output_file_base']} raised an exception: {e} | Active jobs: {len(active_futures)}")

                    # Submit a new job if available
                    if job_index < len(jobs_to_run):
                        new_job = jobs_to_run[job_index]
                        jobs_remaining = len(jobs_to_run) - job_index
                        print(f"[Submitting] {new_job['output_file_base']} (seed {new_job['hex_seed']}) | Jobs remaining: {jobs_remaining}")
                        new_future = executor.submit(run_command, new_job['command'])
                        active_futures[new_future] = new_job
                        job_index += 1
                        run_counter += 1

        except KeyboardInterrupt:
            print("\nCaught KeyboardInterrupt, stopping...")
            # Cancel all pending futures
            for future in active_futures:
                future.cancel()
            executor.shutdown(wait=False, cancel_futures=True)

    print(f"\nCompleted! Processed {run_counter} unique configurations.")
    print("Check the 'pics/' directory for results.")
    print("Filenames include seed and all parameters: seed_s<scale>_af<arc_fraction>_oe<orbit_eccentricity>.png")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScript terminated by user.")
