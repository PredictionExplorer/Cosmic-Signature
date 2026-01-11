#!/usr/bin/env python3
"""
Parallel runner for Three Body Problem simulations.
Runs 8 concurrent simulations at a time.
Generates random seeds and randomly chooses rendering mode.

Available modes:
- Museum modes: hybrid, deep-field, filament, minimal
- Lensing modes: geodesic-caustics, cosmic-lens, gravitational-wake, event-horizon, spacetime-fabric
- Legacy modes: standard, special

Usage:
  python run.py              # Run with random mode selection (50% geodesic-caustics)
  python run.py --caustics   # Run ONLY geodesic-caustics (Luminous Trajectory Lensing)
  python run.py --all        # Run with equal random selection from all modes
"""

import asyncio
import secrets
import random
import sys
import time
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
from typing import List, Optional

# Command-line mode selection
CAUSTICS_ONLY = "--caustics" in sys.argv
ALL_MODES_EQUAL = "--all" in sys.argv

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
    # Museum modes (beautiful minimalist renderer)
    RenderMode("museum_hybrid", "Museum (Hybrid)", ["--museum-mode", "--museum-style", "hybrid"]),
    RenderMode("museum_deepfield", "Museum (Deep Field)", ["--museum-mode", "--museum-style", "deep-field"]),
    RenderMode("museum_filament", "Museum (Filament)", ["--museum-mode", "--museum-style", "filament"]),
    RenderMode("museum_minimal", "Museum (Minimal)", ["--museum-mode", "--museum-style", "minimal"]),
    
    # Lensing modes v2 (gravitational lensing visualization)
    RenderMode("lensing_caustics", "Lensing (Geodesic Caustics)", ["--lensing-mode", "--lensing-style", "geodesic-caustics"]),
    RenderMode("lensing_cosmic", "Lensing (Cosmic Lens)", ["--lensing-mode", "--lensing-style", "cosmic-lens"]),
    RenderMode("lensing_wake", "Lensing (Gravitational Wake)", ["--lensing-mode", "--lensing-style", "gravitational-wake"]),
    RenderMode("lensing_horizon", "Lensing (Event Horizon)", ["--lensing-mode", "--lensing-style", "event-horizon"]),
    RenderMode("lensing_fabric", "Lensing (Spacetime Fabric)", ["--lensing-mode", "--lensing-style", "spacetime-fabric"]),
    
    # Legacy modes
    RenderMode("standard", "Standard (Legacy)", ["--museum-mode=false"]),
    RenderMode("special", "Special (Nebula)", ["--museum-mode=false", "--special"]),
]


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


def choose_random_mode() -> RenderMode:
    """Choose a random rendering mode.
    
    Mode selection depends on command-line flags:
    - --caustics: ONLY Geodesic Caustics (Luminous Trajectory Lensing)
    - --all: Equal probability for all modes
    - (default): 50% Geodesic Caustics, 50% other modes
    """
    if CAUSTICS_ONLY:
        # Run only Geodesic Caustics (for testing the new trajectory-based lensing)
        return RENDER_MODES[4]  # lensing_caustics
    
    if ALL_MODES_EQUAL:
        # Equal probability for all modes
        return random.choice(RENDER_MODES)
    
    # Default: 50% Geodesic Caustics (the new trajectory-based lensing)
    if random.random() < 0.5:
        return RENDER_MODES[4]  # lensing_caustics (Geodesic Caustics)
    else:
        # Pick from all other modes
        other_modes = RENDER_MODES[:4] + RENDER_MODES[5:]
        return random.choice(other_modes)


async def run_simulation(seed: str, mode: RenderMode, job_id: int) -> bool:
    """Run a single simulation with the given parameters."""
    filename = f"{mode.name}_{seed[2:]}"  # Mode first for easy sorting, then seed

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
    
    # Show mode selection strategy
    if CAUSTICS_ONLY:
        print("🎯 Mode: GEODESIC CAUSTICS ONLY (Luminous Trajectory Lensing)")
        print("   Full orbital history shapes spacetime distortion")
    elif ALL_MODES_EQUAL:
        print("🎲 Mode: All modes with equal probability")
    else:
        print("⚡ Mode: 50% Geodesic Caustics, 50% other modes")
        print("   (Use --caustics for only caustics, --all for equal weights)")
    
    print("="*60)
    print("Available modes:")
    for i, mode in enumerate(RENDER_MODES):
        marker = "★" if i == 4 else "•"  # Star for Geodesic Caustics
        print(f"  {marker} {mode.display}")
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
