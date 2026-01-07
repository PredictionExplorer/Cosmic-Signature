#!/usr/bin/env python3
"""
Parallel runner for Three Body Problem simulations.
Runs 4 concurrent simulations at a time.
Generates random seeds and randomly chooses rendering mode.

Available modes:
- Museum modes: hybrid, deep-field, filament, minimal
- Lensing modes: gravitational-wakes, invisible-paths
- Legacy modes: standard, special
"""

import asyncio
import secrets
import random
import time
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
from typing import List, Optional

# Number of concurrent processes to run
MAX_CONCURRENT = 8


@dataclass
class RenderMode:
    """Represents a rendering mode with its CLI flags and display name."""
    name: str  # Short name for filename
    display: str  # Display name for logging
    flags: List[str]  # CLI flags to pass


# All available rendering modes
RENDER_MODES = [
    # Museum modes (default beautiful renderer)
    RenderMode("museum_hybrid", "Museum (Hybrid)", ["--museum-mode", "--museum-style", "hybrid"]),
    RenderMode("museum_deepfield", "Museum (Deep Field)", ["--museum-mode", "--museum-style", "deep-field"]),
    RenderMode("museum_filament", "Museum (Filament)", ["--museum-mode", "--museum-style", "filament"]),
    RenderMode("museum_minimal", "Museum (Minimal)", ["--museum-mode", "--museum-style", "minimal"]),
    
    # Lensing modes (gravitational lensing visualization)
    RenderMode("lensing_wakes", "Lensing (Gravitational Wakes)", ["--lensing-mode", "--lensing-style", "gravitational-wakes"]),
    RenderMode("lensing_invisible", "Lensing (Invisible Paths)", ["--lensing-mode", "--lensing-style", "invisible-paths"]),
    
    # Legacy modes
    RenderMode("standard", "Standard (Legacy)", ["--museum-mode=false"]),
    RenderMode("special", "Special (Nebula)", ["--museum-mode=false", "--special"]),
]


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


def choose_random_mode() -> RenderMode:
    """Choose a random rendering mode."""
    return random.choice(RENDER_MODES)


async def run_simulation(seed: str, mode: RenderMode, job_id: int) -> bool:
    """Run a single simulation with the given parameters."""
    filename = f"{seed[2:]}_{mode.name}"  # Remove '0x' prefix for filename

    command = [
        './target/release/three_body_problem',
        '--seed', seed,
        '--file-name', filename,
    ] + mode.flags

    start_time = datetime.now()
    print(f"\n{'='*60}")
    print(f"[Worker {job_id}] Starting")
    print(f"Seed: {seed} | Mode: {mode.display}")
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
        # Generate random seed and choose random mode
        seed = generate_random_seed()
        mode = choose_random_mode()

        async with semaphore:
            if not stats['running']:
                break

            stats['count'] += 1
            stats['mode_counts'][mode.name] = stats['mode_counts'].get(mode.name, 0) + 1

            # Run simulation
            success = await run_simulation(seed, mode, job_id)

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
            # Build mode breakdown string
            mode_str = " | ".join(
                f"{name}: {count}" 
                for name, count in sorted(stats['mode_counts'].items())
            )
            print(f"\n📊 Status: {stats['count']} total | "
                  f"✓ {stats['successful']} | ✗ {stats['failed']} | "
                  f"🔄 {MAX_CONCURRENT} workers")
            if mode_str:
                print(f"   Modes: {mode_str}\n")


async def main_async():
    """Run simulations with MAX_CONCURRENT parallel workers."""
    print("\n" + "="*60)
    print("Three Body Problem - Parallel Runner")
    print(f"Running {MAX_CONCURRENT} concurrent simulations")
    print("="*60)
    print("Available modes:")
    for mode in RENDER_MODES:
        print(f"  • {mode.display}")
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
        'worker_count': 0,
        'mode_counts': {}
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
        print("\nMode breakdown:")
        for name, count in sorted(stats['mode_counts'].items()):
            print(f"  {name}: {count}")
        print("="*60 + "\n")


def main():
    """Entry point."""
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
