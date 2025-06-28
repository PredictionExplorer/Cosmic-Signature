import subprocess
import os
import random
import time
import hashlib # For seed generation
from concurrent.futures import ThreadPoolExecutor
import concurrent.futures
import argparse

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'max_concurrent': 3,
    'max_random_sleep': 100,
    # --- Seed Generation Config ---
    'base_seed_string': "cosmic_signature00", # Base string for seed generation
    'num_seeds_per_combo': 4,             # How many seeds to try for each drift combo
    'seed_hex_bytes': 6,                    # How many bytes of the hash to use (6 bytes = 48 bits)
    # --- Drift Test Matrix ---
    'drift_scales': [0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0],      # Different drift scales to test
    'drift_modes': ['none', 'linear', 'brownian'],  # Different drift modes to test
    'num_steps_options': [100000, 300000, 1000000, 3000000],  # Different simulation step counts to test
    # --- Alpha Compression Matrix ---
    'alpha_compress_values': [0.0, 3.0, 6.0, 12.0],  # Different alpha compression values to test
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
    parser.add_argument('--num-steps-sim', type=int,
                        help='Number of simulation steps for single config mode')
    parser.add_argument('--alpha-compress', type=float,
                        help='Alpha compression value for single config mode')
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
            
        if args.alpha_compress is not None:
            CONFIG['single_alpha_compress'] = args.alpha_compress
        else:
            CONFIG['single_alpha_compress'] = 6.0  # Default value

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
        print(f"Will test with {len(CONFIG['alpha_compress_values'])} alpha compression values: {CONFIG['alpha_compress_values']}")
        print(f"Will generate {num_seeds} random seeds")
        print(f"Each seed will be run with {len(CONFIG['num_steps_options'])} step counts: {CONFIG['num_steps_options']}")
        print(f"Each seed+steps combo will be run with all {len(drift_configs)} drift configurations")
        print(f"Each drift configuration will be run with all {len(CONFIG['alpha_compress_values'])} alpha compression values")
        print(f"Total runs: {num_seeds} × {len(CONFIG['num_steps_options'])} × {len(drift_configs)} × {len(CONFIG['alpha_compress_values'])} = {num_seeds * len(CONFIG['num_steps_options']) * len(drift_configs) * len(CONFIG['alpha_compress_values'])}")
    else:
        # Single configuration
        mode = CONFIG.get('single_drift_mode', 'brownian')
        scale = CONFIG.get('single_drift_scale', 0.01)
        alpha_compress = CONFIG.get('single_alpha_compress', 6.0)
        if mode == 'none':
            drift_configs.append({'mode': mode, 'scale': 0, 'enabled': False})
        else:
            drift_configs.append({'mode': mode, 'scale': scale, 'enabled': True})

        if drift_configs[0]['enabled']:
            print(f"Running single configuration: {mode} drift, scale={scale}, alpha_compress={alpha_compress}")
        else:
            print(f"Running single configuration: no drift, alpha_compress={alpha_compress}")
        
        # Handle step counts for single config
        if args.num_steps_sim:
            CONFIG['num_steps_options'] = [args.num_steps_sim]
            print(f"Using custom step count: {args.num_steps_sim}")
        else:
            print(f"Using default step counts: {CONFIG['num_steps_options']}")
        
        print(f"Using {num_seeds} different seeds")

        # Rust program now saves PNGs to 'pics/' and videos to 'vids/'
    pics_dir = "pics"
    print(f"\nOutput PNGs will be saved in ./{pics_dir}/")
    print(f"Using max {max_workers} concurrent workers\n")

    # Generate all job configurations first
    # Iterate through seeds first, then steps, then drift configs, then alpha compress for each combination
    all_jobs = []
    
    # Get alpha_compress values based on mode
    if CONFIG['use_test_matrix']:
        alpha_compress_values = CONFIG['alpha_compress_values']
    else:
        # Single config mode - use single value
        alpha_compress_values = [CONFIG.get('single_alpha_compress', 6.0)]
    
    for seed_idx in range(num_seeds):
        for num_steps in CONFIG['num_steps_options']:
            for drift_config in drift_configs:
                for alpha_compress in alpha_compress_values:
                    # Format drift info for filename
                    if drift_config['enabled']:
                        drift_str = f"{drift_config['mode']}_s{drift_config['scale']}"
                    else:
                        drift_str = "nodrift"

                    # Format steps for filename (100k, 300k, 1M)
                    if num_steps >= 1000000:
                        steps_str = f"{num_steps // 1000000}M"
                    else:
                        steps_str = f"{num_steps // 1000}k"

                    job_info = {
                        'drift_config': drift_config,
                        'drift_str': drift_str,
                        'seed_idx': seed_idx,
                        'num_steps': num_steps,
                        'steps_str': steps_str,
                        'alpha_compress': alpha_compress,
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

        # 3. Derive filename including steps, drift settings, and alpha compress
        seed_suffix = hex_seed[2:][:8] # Use first 8 chars of hex seed
        alpha_str = f"a{job['alpha_compress']}"
        output_file_base = f"{seed_suffix}_{job['steps_str']}_{alpha_str}_{drift_str}"

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
            '--num-steps-sim', str(job['num_steps']),
            '--alpha-compress', str(job['alpha_compress']),
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

        jobs_to_run.append({
            'command': command,
            'output_file_base': output_file_base,
            'hex_seed': hex_seed
        })

    print(f"\nSkipped {skipped_count} existing files")
    print(f"Will run {len(jobs_to_run)} jobs with max {max_workers} concurrent workers\n")

    # Run jobs maintaining constant concurrency level
    run_counter = 0
    active_futures = {}
    job_index = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
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
    print("Check the 'pics/' directory for results organized by drift settings.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScript terminated by user.")
