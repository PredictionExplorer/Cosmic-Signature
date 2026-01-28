#!/usr/bin/env python3
"""
Parallel infinite runner for Three Body Problem simulations.
Generates random seeds and randomly chooses special/standard mode.
Runs multiple instances in parallel.
"""

import subprocess
import secrets
import random
import signal
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Configuration
NUM_WORKERS = 8  # Number of parallel instances

# Global state for graceful shutdown
shutdown_event = threading.Event()
stats_lock = threading.Lock()
stats = {
    'started': 0,
    'successful': 0,
    'failed': 0,
}


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


def run_simulation(task_id: int) -> tuple[int, bool, str]:
    """Run a single simulation with random parameters.
    
    Returns: (task_id, success, filename)
    """
    if shutdown_event.is_set():
        return (task_id, False, "")
    
    # Generate random seed and mode
    seed = generate_random_seed()
    is_special = random.choice([True, False])
    mode = "special" if is_special else "standard"
    filename = f"{seed[2:]}_{mode}"  # Remove '0x' prefix for filename

    command = [
        './target/release/three_body_problem',
        '--seed', seed,
        '--file-name', filename,
    ]

    if is_special:
        command.append('--special')

    with stats_lock:
        stats['started'] += 1
        current_num = stats['started']
    
    print(f"[{current_num}] Started: {filename} ({mode.upper()})")

    try:
        result = subprocess.run(
            command, 
            check=False,
            stdout=subprocess.DEVNULL,  # Suppress output to avoid interleaving
            stderr=subprocess.DEVNULL,
        )
        success = result.returncode == 0

        if success:
            print(f"[{current_num}] ✓ Completed: {filename}")
        else:
            print(f"[{current_num}] ✗ Failed: {filename}")

        return (task_id, success, filename)

    except Exception as e:
        print(f"[{current_num}] ✗ Error: {filename} - {e}")
        return (task_id, False, filename)


def signal_handler(signum, frame):
    """Handle CTRL+C gracefully."""
    print("\n\nShutting down... waiting for running tasks to complete.")
    shutdown_event.set()


def main():
    """Run simulations indefinitely with random seeds and modes."""
    print("\n" + "="*60)
    print("Three Body Problem - Parallel Infinite Runner")
    print(f"Running {NUM_WORKERS} instances in parallel")
    print("="*60)
    print("Press Ctrl+C to stop (will wait for running tasks)")
    print("="*60 + "\n")

    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Ensure output directories exist
    Path('pics').mkdir(exist_ok=True)
    Path('vids').mkdir(exist_ok=True)

    task_id = 0
    
    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
        # Submit initial batch of tasks
        futures = {}
        for _ in range(NUM_WORKERS):
            if shutdown_event.is_set():
                break
            future = executor.submit(run_simulation, task_id)
            futures[future] = task_id
            task_id += 1

        # Process completed tasks and submit new ones
        while futures and not shutdown_event.is_set():
            # Wait for any task to complete
            done_futures = []
            for future in as_completed(futures, timeout=0.5):
                done_futures.append(future)
                
            if not done_futures:
                continue
                
            for future in done_futures:
                try:
                    _, success, filename = future.result()
                    with stats_lock:
                        if success:
                            stats['successful'] += 1
                        else:
                            stats['failed'] += 1
                except Exception as e:
                    print(f"Task error: {e}")
                    with stats_lock:
                        stats['failed'] += 1

                # Remove completed future
                del futures[future]

                # Submit a new task if not shutting down
                if not shutdown_event.is_set():
                    new_future = executor.submit(run_simulation, task_id)
                    futures[new_future] = task_id
                    task_id += 1

        # Wait for remaining tasks to complete
        if futures:
            print(f"\nWaiting for {len(futures)} remaining tasks to complete...")
            for future in as_completed(futures):
                try:
                    _, success, _ = future.result()
                    with stats_lock:
                        if success:
                            stats['successful'] += 1
                        else:
                            stats['failed'] += 1
                except Exception:
                    with stats_lock:
                        stats['failed'] += 1

    # Print final statistics
    print("\n" + "="*60)
    print("Stopped by user")
    print("="*60)
    print(f"Total started: {stats['started']}")
    print(f"Successful: {stats['successful']}")
    print(f"Failed: {stats['failed']}")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
