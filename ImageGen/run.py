import subprocess
import os
import random
import time
import hashlib # For seed generation
from concurrent.futures import ThreadPoolExecutor

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'max_concurrent': 1,
    'max_random_sleep': 3,
    # --- Seed Generation Config ---
    'base_seed_string': "cosmic_signature", # Base string for seed generation
    'num_runs_to_generate': 100,          # How many seeds to generate and run
    'seed_hex_bytes': 6,                    # How many bytes of the hash to use (6 bytes = 48 bits)
    'base_output_name': 'out' # Added base name for output files
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
    # Get config values
    max_workers = CONFIG['max_concurrent']
    base_string = CONFIG['base_seed_string']
    num_runs = CONFIG['num_runs_to_generate']
    seed_bytes_len = CONFIG['seed_hex_bytes']
    base_output_name = CONFIG['base_output_name']

    print(f"Generating and processing {num_runs} runs based on '{base_string}' with max {max_workers} concurrent workers...")

    # Rust program now saves PNGs to 'pics/' and videos to 'vids/'
    pics_dir = "pics"
    print(f"Output PNGs will be saved in ./{pics_dir}/")

    futures = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for i in range(num_runs):
            # 1. Generate the input string for hashing
            input_seed_str = f"{base_string}{i}"

            # 2. Generate the actual hex seed using the hash
            hex_seed = generate_hex_seed(input_seed_str, seed_bytes_len)

            # 3. Derive filename from the generated hex seed
            seed_suffix = hex_seed[2:] # Remove '0x' prefix
            output_file_base = f"{base_output_name}_{seed_suffix}"

            # Check existence in the 'pics' directory
            output_png_path = os.path.join(pics_dir, f"{output_file_base}.png")

            # 4. Check if the output PNG already exists
            if os.path.exists(output_png_path):
                print(f"Skipping run {i} (seed {hex_seed}): Output file {output_png_path} already exists.")
                continue # Skip this iteration

            # 5. Construct the command
            command = [
                CONFIG['program_path'],
                '--seed', hex_seed,
                # Pass ONLY the base filename - Rust handles the directory
                '--file-name', output_file_base
            ]

            # 6. Submit the command to the executor
            print(f"Submitting job for run {i} (seed {hex_seed})...")
            futures.append(executor.submit(run_command, command))

        print(f"All {len(futures)} jobs submitted. Waiting for completion...")
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

    print("All submitted jobs have completed or been cancelled.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScript terminated by user.")
