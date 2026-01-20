import subprocess
import os
import random
import time
import json
from collections import deque
# os.urandom used for truly random seed generation
from concurrent.futures import ThreadPoolExecutor
import concurrent.futures
import argparse
import itertools

try:
    import tomllib  # Python 3.11+
except ImportError:
    tomllib = None

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'max_concurrent': 8,  # Run 8 parallel processes for faster execution
    'max_random_sleep': 0.5,  # Small random sleep to stagger process starts
    # --- Seed Generation Config ---
    'num_seeds_per_combo': 100,             # Random selections per batch
    'seed_hex_bytes': 6,                    # How many random bytes for seed (6 bytes = 48 bits)
    # --- Drift Test Matrix ---
    'drift_scales': [0.5, 1.5, 3.0, 5.0, 8.0],  # Drift scales between 0 and 10
    'drift_arc_fractions': [0.1, 0.2, 0.4, 0.7],  # Reasonable arc fraction values
    'drift_orbit_eccentricities': [0.1, 0.3, 0.5, 0.8],  # Eccentricity values (0 = circle, 1 = parabola)
    'drift_mode': 'elliptical',                 # Only test elliptical drift mode
    'use_test_matrix': True,                # Whether to use the test matrix or single config
    # --- Aesthetic / Style Presets ---
    'aesthetic_presets': ['default', 'gallery'],
    'style_presets': ['default', 'astral', 'ethereal', 'metallic', 'minimal'],
    # --- Time Dilation Variants ---
    'time_dilation_configs': [
        {'enabled': False, 'min_dt_factor': 0.1, 'threshold_distance': 0.5, 'strength': 2.0, 'tag': 'off'},
        {'enabled': True, 'min_dt_factor': 0.05, 'threshold_distance': 0.4, 'strength': 2.0, 'tag': 'soft'},
        {'enabled': True, 'min_dt_factor': 0.02, 'threshold_distance': 0.3, 'strength': 2.6, 'tag': 'strong'},
    ],
    # --- Output / Performance Flags ---
    'png_only': False,
    'parallel_accumulation': False,
    'png_bit_depth': 16,
    'write_exr': False
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
        # Merge stderr into stdout to avoid deadlocks from full stderr buffers
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )

        # Read combined output line by line
        if process.stdout:
            for line in process.stdout:
                print(f"[output] {line.strip()}", flush=True)

        process.wait()  # Wait for the process to complete

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

def generate_random_hex_seed(num_bytes):
    """Generates a truly random hex seed string using OS entropy."""
    return "0x" + os.urandom(num_bytes).hex()

def fmt_float(value, precision=3):
    s = f"{value:.{precision}g}"
    return s.replace(".", "p")

def rank_metadata(pics_dir, top_n=20):
    if tomllib is None:
        print("tomllib not available; skipping metadata ranking.")
        return

    entries = []
    for filename in os.listdir(pics_dir):
        if not filename.endswith(".meta.toml"):
            continue
        path = os.path.join(pics_dir, filename)
        try:
            with open(path, "rb") as f:
                data = tomllib.load(f)
            score = (
                data.get("scores", {}).get("total_weighted")
                if isinstance(data.get("scores"), dict)
                else None
            )
            if score is None:
                continue
            entries.append((score, data))
        except Exception as e:
            print(f"Failed to parse metadata {filename}: {e}")

    if not entries:
        print("No metadata files found for ranking.")
        return

    entries.sort(key=lambda item: item[0], reverse=True)
    top_entries = entries[:top_n]
    ranking_path = os.path.join(pics_dir, "rankings.json")
    with open(ranking_path, "w", encoding="utf-8") as f:
        json.dump([entry[1] for entry in top_entries], f, indent=2)

    print(f"\nTop {len(top_entries)} candidates by total_weighted score:")
    for idx, (score, data) in enumerate(top_entries, start=1):
        name = data.get("file_name", "unknown")
        output_png = data.get("output_png", "")
        print(f"{idx:02d}. {name} | score={score:.3f} | {output_png}")
    print(f"Saved rankings to {ranking_path}")

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
                        help='Seeds per parameter set per cycle (default: 6)')
    parser.add_argument('--total-jobs', type=int,
                        help='Optional: stop after N runs (default: infinite)')
    parser.add_argument('--workers', '-j', type=int,
                        default=CONFIG.get('max_concurrent', 8),
                        help='Number of parallel worker processes (default: 8)')
    args = parser.parse_args()

    # Override max_concurrent if specified via command line
    CONFIG['max_concurrent'] = args.workers

    # Use configured parallelism (default: 8 concurrent processes)
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
    seed_bytes_len = CONFIG['seed_hex_bytes']
    random_batch_size = max(1, CONFIG.get('num_seeds_per_combo', 1))
    max_runs = args.total_jobs if args.total_jobs and args.total_jobs > 0 else None

    pics_dir = "pics"
    print(f"\nOutput PNGs will be saved in ./{pics_dir}/")
    print(f"Using max {max_workers} concurrent workers\n")
    print("Randomly sampling parameter combinations each run.")
    print("Press Ctrl+C to stop.")

    time_dilation_configs = CONFIG.get(
        'time_dilation_configs',
        [{'enabled': False, 'min_dt_factor': 0.1, 'threshold_distance': 0.5, 'strength': 2.0, 'tag': 'off'}],
    )
    aesthetic_presets = CONFIG.get('aesthetic_presets', ['default'])
    style_presets = CONFIG.get('style_presets', ['default'])

    if args.single_config:
        drift_configs = [{
            'mode': CONFIG.get('single_drift_mode', 'linear'),
            'scale': CONFIG.get('single_drift_scale', 1.5),
            'arc_fraction': CONFIG.get('single_drift_arc_fraction', 0.2),
            'orbit_eccentricity': CONFIG.get('single_drift_orbit_eccentricity', 0.3),
            'enabled': True
        }]
        print(f"Using fixed drift config: {drift_configs[0]}")
    else:
        drift_configs = [
            {
                'mode': CONFIG['drift_mode'],
                'scale': scale,
                'arc_fraction': arc_frac,
                'orbit_eccentricity': eccen,
                'enabled': True
            }
            for (scale, arc_frac, eccen) in itertools.product(
                CONFIG['drift_scales'],
                CONFIG['drift_arc_fractions'],
                CONFIG['drift_orbit_eccentricities']
            )
        ]

    base_combos = list(itertools.product(drift_configs, time_dilation_configs, aesthetic_presets, style_presets))
    print(f"Possible parameter combinations: {len(base_combos)}")
    print(f"Random selections per batch: {random_batch_size}")

    param_queue = deque()
    batch_count = 0

    def refill_param_queue():
        nonlocal param_queue, batch_count
        param_queue = deque(random.choice(base_combos) for _ in range(random_batch_size))
        batch_count += 1
        print(f"\nStarting random batch {batch_count} ({len(param_queue)} runs queued)")

    def build_job_from_combo(combo):
        drift_config, td_config, aesthetic_preset, style_preset = combo
        drift_str = f"s{fmt_float(drift_config['scale'])}_af{fmt_float(drift_config['arc_fraction'])}_oe{fmt_float(drift_config['orbit_eccentricity'])}"
        if td_config.get('enabled'):
            td_str = (
                f"td_m{fmt_float(td_config['min_dt_factor'])}"
                f"_t{fmt_float(td_config['threshold_distance'])}"
                f"_s{fmt_float(td_config['strength'])}"
            )
        else:
            td_str = "td_off"
        preset_str = f"ap{aesthetic_preset}_sp{style_preset}"
        param_str = f"{drift_str}_{td_str}_{preset_str}"

        hex_seed = generate_random_hex_seed(seed_bytes_len)
        seed_suffix = hex_seed[2:][:8]
        output_file_base = f"{param_str}_{seed_suffix}"
        output_png_path = os.path.join(pics_dir, f"{output_file_base}.png")

        command = [
            CONFIG['program_path'],
            '--seed', hex_seed,
            '--file-name', output_file_base,
            '--drift-mode', drift_config['mode'],
            '--drift-scale', str(drift_config['scale']),
            '--drift-arc-fraction', str(drift_config['arc_fraction']),
            '--drift-orbit-eccentricity', str(drift_config['orbit_eccentricity']),
            '--aesthetic-preset', aesthetic_preset,
            '--style-preset', style_preset,
        ]

        if td_config.get('enabled'):
            command.extend([
                '--time-dilation',
                '--time-dilation-min-dt-factor', str(td_config['min_dt_factor']),
                '--time-dilation-threshold', str(td_config['threshold_distance']),
                '--time-dilation-strength', str(td_config['strength'])
            ])

        if CONFIG.get('png_only'):
            command.append('--png-only')
        if CONFIG.get('parallel_accumulation'):
            command.append('--parallel-accumulation')
        if CONFIG.get('png_bit_depth') in (8, 16):
            command.extend(['--png-bit-depth', str(CONFIG['png_bit_depth'])])
        if CONFIG.get('write_exr'):
            command.append('--write-exr')

        return {
            'command': command,
            'output_file_base': output_file_base,
            'output_png_path': output_png_path,
            'hex_seed': hex_seed
        }

    run_counter = 0
    active_futures = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        try:
            while True:
                while len(active_futures) < max_workers and (max_runs is None or run_counter < max_runs):
                    if not param_queue:
                        refill_param_queue()
                    combo = param_queue.popleft()
                    job = build_job_from_combo(combo)
                    if os.path.exists(job['output_png_path']):
                        continue
                    print(f"[Submitting] {job['output_file_base']} (seed {job['hex_seed']}) | Active jobs: {len(active_futures)}")
                    future = executor.submit(run_command, job['command'])
                    active_futures[future] = job
                    run_counter += 1

                if max_runs is not None and run_counter >= max_runs and not active_futures:
                    break

                done, pending = concurrent.futures.wait(
                    active_futures.keys(),
                    return_when=concurrent.futures.FIRST_COMPLETED
                )

                for future in done:
                    job = active_futures.pop(future)
                    try:
                        future.result()
                        print(f"[Completed] {job['output_file_base']} | Active jobs: {len(active_futures)}")
                    except Exception as e:
                        print(f"[Failed] {job['output_file_base']} raised an exception: {e} | Active jobs: {len(active_futures)}")

        except KeyboardInterrupt:
            print("\nCaught KeyboardInterrupt, stopping...")
            for future in active_futures:
                future.cancel()
            executor.shutdown(wait=False, cancel_futures=True)

    print(f"\nStopped. Processed {run_counter} runs.")
    print("Check the 'pics/' directory for results.")
    rank_metadata(pics_dir, top_n=20)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScript terminated by user.")
