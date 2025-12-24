#!/usr/bin/env python3
"""
Parallel runner for Three Body Problem simulations.
Runs 4 concurrent simulations at a time.
Generates random seeds and randomly chooses special/standard mode.
"""

import asyncio
import secrets
import random
import time
from pathlib import Path
from datetime import datetime

# Number of concurrent processes to run
MAX_CONCURRENT = 4


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


async def run_simulation(seed: str, is_special: bool, job_id: int) -> bool:
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

    start_time = datetime.now()
    print(f"\n{'='*60}")
    print(f"[Worker {job_id}] Starting")
    print(f"Seed: {seed} | Mode: {mode.upper()}")
    print(f"File: {filename}")
    print('='*60)

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()
        success = process.returncode == 0

        elapsed = (datetime.now() - start_time).total_seconds()

        if success:
            print(f"✓ [Worker {job_id}] Completed: {filename} ({elapsed:.1f}s)")
        else:
            print(f"✗ [Worker {job_id}] Failed: {filename} ({elapsed:.1f}s)")
            if stderr:
                print(f"  Error: {stderr.decode()[:200]}")

        return success

    except Exception as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"✗ [Worker {job_id}] Error: {e} ({elapsed:.1f}s)")
        return False


async def worker(semaphore: asyncio.Semaphore, stats: dict):
    """Worker that continuously runs simulations."""
    job_id = stats['worker_count']
    stats['worker_count'] += 1

    while stats['running']:
        # Generate random seed and mode
        seed = generate_random_seed()
        is_special = random.choice([True, False])

        async with semaphore:
            if not stats['running']:
                break

            stats['count'] += 1
            current_job = stats['count']

            # Run simulation
            success = await run_simulation(seed, is_special, job_id)

            if success:
                stats['successful'] += 1
            else:
                stats['failed'] += 1
                # Brief pause on failure to avoid rapid error loops
                await asyncio.sleep(2)


async def status_reporter(stats: dict):
    """Periodically report overall statistics."""
    while stats['running']:
        await asyncio.sleep(10)
        if stats['running']:
            print(f"\n📊 Status: {stats['count']} total | "
                  f"✓ {stats['successful']} | ✗ {stats['failed']} | "
                  f"🔄 {MAX_CONCURRENT} workers\n")


async def main_async():
    """Run simulations with MAX_CONCURRENT parallel workers."""
    print("\n" + "="*60)
    print("Three Body Problem - Parallel Runner")
    print(f"Running {MAX_CONCURRENT} concurrent simulations")
    print("="*60)
    print("Press Ctrl+C to stop")
    print("="*60 + "\n")

    # Ensure output directories exist
    Path('pics').mkdir(exist_ok=True)
    Path('vids').mkdir(exist_ok=True)

    # Shared statistics
    stats = {
        'count': 0,
        'successful': 0,
        'failed': 0,
        'running': True,
        'worker_count': 0
    }

    # Semaphore to limit concurrent processes
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    try:
        # Create worker tasks and status reporter
        workers = [asyncio.create_task(worker(semaphore, stats))
                   for _ in range(MAX_CONCURRENT)]
        reporter = asyncio.create_task(status_reporter(stats))

        # Wait for all workers (runs indefinitely until interrupted)
        await asyncio.gather(*workers, reporter)

    except KeyboardInterrupt:
        print("\n\n" + "="*60)
        print("Stopping workers gracefully...")
        print("="*60)
        stats['running'] = False

        # Give workers a moment to finish current jobs
        await asyncio.sleep(1)

        print("\n" + "="*60)
        print("Stopped by user")
        print("="*60)
        print(f"Total runs: {stats['count']}")
        print(f"Successful: {stats['successful']}")
        print(f"Failed: {stats['failed']}")
        print("="*60 + "\n")


def main():
    """Entry point."""
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
