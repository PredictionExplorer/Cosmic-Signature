#!/usr/bin/env python3
"""
Parallel infinite runner for Three Body Problem simulations.
Generates random seeds and alternates between special/regular mode by default.
Runs multiple instances in parallel.

Filename format:  {mode}_{sequence:04d}_{seed_hex}
  Examples:       special_0001_a3f19c2b7e01
                  regular_0002_d8e4b10f6c93

This makes it easy to sort output by mode (special groups first/last)
and by generation order within each mode.
"""

import argparse
import subprocess
import secrets
import random
import signal
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from pathlib import Path

# Defaults
DEFAULT_WORKERS = 6
DEFAULT_SUBPROCESS_TIMEOUT = 6000  # 100 minutes per simulation
BINARY_PATH = Path('./target/release/three_body_problem')

# Global state for graceful shutdown
shutdown_event = threading.Event()
stats_lock = threading.Lock()
stats = {
    'started': 0,
    'successful': 0,
    'failed': 0,
    'total_elapsed': 0.0,
    'special_ok': 0,
    'special_fail': 0,
    'regular_ok': 0,
    'regular_fail': 0,
}

# Thread-safe sequence counter for filenames
_seq_lock = threading.Lock()
_seq_counter = 0


def next_sequence_number() -> int:
    """Return the next global sequence number (thread-safe)."""
    global _seq_counter
    with _seq_lock:
        _seq_counter += 1
        return _seq_counter


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Parallel infinite runner for Three Body Problem simulations."
    )
    parser.add_argument(
        '-w', '--workers',
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Number of parallel instances (default: {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        '-m', '--mode',
        choices=['both', 'special', 'regular', 'random'],
        default='both',
        help=(
            "Simulation mode: 'both' (default, alternates special/regular), "
            "'special' (only special), 'regular' (only regular), "
            "'random' (random coin flip each run)"
        ),
    )
    parser.add_argument(
        '-t', '--timeout',
        type=int,
        default=DEFAULT_SUBPROCESS_TIMEOUT,
        help=f"Per-simulation timeout in seconds (default: {DEFAULT_SUBPROCESS_TIMEOUT})",
    )
    parser.add_argument(
        '--binary',
        type=str,
        default=str(BINARY_PATH),
        help=f"Path to the simulation binary (default: {BINARY_PATH})",
    )
    parser.add_argument(
        '--pics-dir',
        type=str,
        default='pics',
        help="Output directory for images (default: pics)",
    )
    parser.add_argument(
        '--vids-dir',
        type=str,
        default='vids',
        help="Output directory for videos (default: vids)",
    )
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if args.timeout < 1:
        parser.error("--timeout must be at least 1")
    return args


def check_binary(binary_path: str) -> None:
    """Verify the simulation binary exists and is executable."""
    path = Path(binary_path)
    if not path.exists():
        print(f"Error: binary not found at '{binary_path}'", file=sys.stderr)
        print("  Hint: run 'cargo build --release' first.", file=sys.stderr)
        sys.exit(1)
    if not path.is_file():
        print(f"Error: '{binary_path}' is not a file.", file=sys.stderr)
        sys.exit(1)


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


def choose_mode(mode_arg: str, task_id: int) -> bool:
    """Return True for special mode, False for regular.

    In 'both' mode, alternates deterministically based on task_id so that
    special and regular runs are evenly interleaved regardless of parallelism.
    """
    if mode_arg == 'special':
        return True
    elif mode_arg == 'regular':
        return False
    elif mode_arg == 'both':
        return task_id % 2 == 0  # Even tasks = special, odd = regular
    else:  # 'random'
        return random.choice([True, False])


def build_filename(seq: int, seed: str, is_special: bool) -> str:
    """Build a sortable filename.

    Format: {mode}_{sequence:04d}_{seed_hex}
    Examples:
        special_0001_a3f19c2b7e01
        regular_0002_d8e4b10f6c93

    Sorting alphabetically groups by mode, then by generation order.
    """
    mode_prefix = "special" if is_special else "regular"
    seed_hex = seed[2:]  # Strip '0x' prefix
    return f"{mode_prefix}_{seq:04d}_{seed_hex}"


def run_simulation(
    task_id: int,
    binary_path: str,
    mode_arg: str,
    timeout: int,
) -> tuple[int, bool, str, float, bool]:
    """Run a single simulation with random parameters.

    Returns: (task_id, success, filename, elapsed_seconds, is_special)
    """
    if shutdown_event.is_set():
        return (task_id, False, "", 0.0, False)

    seed = generate_random_seed()
    is_special = choose_mode(mode_arg, task_id)
    seq = next_sequence_number()
    filename = build_filename(seq, seed, is_special)
    mode_label = "SPECIAL" if is_special else "REGULAR"

    command = [
        binary_path,
        '--seed', seed,
        '--file-name', filename,
    ]

    if is_special:
        command.append('--special')

    with stats_lock:
        stats['started'] += 1
        current_num = stats['started']

    print(f"[{current_num}] Started: {filename} ({mode_label})")

    start_time = time.monotonic()
    try:
        result = subprocess.run(
            command,
            check=False,
            timeout=timeout,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        elapsed = time.monotonic() - start_time
        success = result.returncode == 0

        if success:
            print(f"[{current_num}] Completed: {filename} ({elapsed:.1f}s)")
        else:
            stderr_text = result.stderr.decode(errors='replace').strip()
            detail = f" - {stderr_text}" if stderr_text else ""
            print(
                f"[{current_num}] Failed (exit {result.returncode}): "
                f"{filename} ({elapsed:.1f}s){detail}"
            )

        return (task_id, success, filename, elapsed, is_special)

    except subprocess.TimeoutExpired:
        elapsed = time.monotonic() - start_time
        print(
            f"[{current_num}] Timed out after {elapsed:.0f}s: {filename}"
        )
        return (task_id, False, filename, elapsed, is_special)

    except FileNotFoundError:
        elapsed = time.monotonic() - start_time
        print(
            f"[{current_num}] Binary not found: {binary_path}",
            file=sys.stderr,
        )
        shutdown_event.set()
        return (task_id, False, filename, elapsed, is_special)

    except Exception as e:
        elapsed = time.monotonic() - start_time
        print(f"[{current_num}] Error: {filename} - {e}")
        return (task_id, False, filename, elapsed, is_special)


def record_result(success: bool, is_special: bool, elapsed: float) -> None:
    """Update global stats for a completed task (caller must hold stats_lock)."""
    if success:
        stats['successful'] += 1
        if is_special:
            stats['special_ok'] += 1
        else:
            stats['regular_ok'] += 1
    else:
        stats['failed'] += 1
        if is_special:
            stats['special_fail'] += 1
        else:
            stats['regular_fail'] += 1
    stats['total_elapsed'] += elapsed


def signal_handler(signum, frame):
    """Handle CTRL+C / SIGTERM gracefully."""
    print("\n\nShutting down... waiting for running tasks to complete.")
    shutdown_event.set()


def main():
    """Run simulations indefinitely with random seeds and modes."""
    args = parse_args()

    binary_path = args.binary
    num_workers = args.workers
    mode_arg = args.mode
    timeout = args.timeout

    check_binary(binary_path)

    # Ensure output directories exist
    Path(args.pics_dir).mkdir(parents=True, exist_ok=True)
    Path(args.vids_dir).mkdir(parents=True, exist_ok=True)

    mode_desc = {
        'both': 'both (alternating special / regular)',
        'special': 'special only',
        'regular': 'regular only',
        'random': 'random (coin flip each run)',
    }

    print("\n" + "=" * 60)
    print("Three Body Problem - Parallel Infinite Runner")
    print(f"  Workers:  {num_workers}")
    print(f"  Mode:     {mode_desc.get(mode_arg, mode_arg)}")
    print(f"  Timeout:  {timeout}s per simulation")
    print(f"  Binary:   {binary_path}")
    print(f"  Files:    {{special|regular}}_NNNN_{{seed}}")
    print("=" * 60)
    print("Press Ctrl+C to stop (will wait for running tasks)")
    print("=" * 60 + "\n")

    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    try:
        signal.signal(signal.SIGTERM, signal_handler)
    except OSError:
        pass  # SIGTERM not available on all platforms

    overall_start = time.monotonic()
    task_id = 0

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures: dict = {}

        # Submit initial batch of tasks
        for _ in range(num_workers):
            if shutdown_event.is_set():
                break
            future = executor.submit(
                run_simulation, task_id, binary_path, mode_arg, timeout
            )
            futures[future] = task_id
            task_id += 1

        # Process completed tasks and submit new ones
        while futures and not shutdown_event.is_set():
            try:
                done_futures = list(as_completed(futures, timeout=1.0))
            except TimeoutError:
                continue

            for future in done_futures:
                try:
                    _, success, filename, elapsed, is_special = future.result()
                    with stats_lock:
                        record_result(success, is_special, elapsed)
                except Exception as e:
                    print(f"Task error: {e}")
                    with stats_lock:
                        stats['failed'] += 1

                del futures[future]

                # Submit a new task if not shutting down
                if not shutdown_event.is_set():
                    new_future = executor.submit(
                        run_simulation, task_id, binary_path, mode_arg, timeout
                    )
                    futures[new_future] = task_id
                    task_id += 1

        # Wait for remaining tasks to complete
        if futures:
            print(f"\nWaiting for {len(futures)} remaining tasks to complete...")
            for future in as_completed(futures):
                try:
                    _, success, _, elapsed, is_special = future.result()
                    with stats_lock:
                        record_result(success, is_special, elapsed)
                except Exception:
                    with stats_lock:
                        stats['failed'] += 1

    overall_elapsed = time.monotonic() - overall_start
    completed = stats['successful'] + stats['failed']
    avg = stats['total_elapsed'] / completed if completed else 0.0

    print("\n" + "=" * 60)
    print("Stopped by user")
    print("=" * 60)
    print(f"  Total started:     {stats['started']}")
    print(f"  Successful:        {stats['successful']}")
    print(f"    Special:         {stats['special_ok']} ok, {stats['special_fail']} failed")
    print(f"    Regular:         {stats['regular_ok']} ok, {stats['regular_fail']} failed")
    print(f"  Failed:            {stats['failed']}")
    print(f"  Avg sim time:      {avg:.1f}s")
    print(f"  Wall-clock time:   {overall_elapsed:.1f}s")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
