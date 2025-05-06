# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Rust-based 3-body orbital dynamics simulator that generates artistic visualizations of chaotic gravitational systems. The project creates both PNG images and MP4 videos of orbital trajectories with advanced rendering effects including spectral color computation, drift transformations, and bloom effects.

## Common Commands

### Build Commands
```bash
cargo build                # Debug build
cargo build --release      # Optimized release build (required for simulations)
```

### Running the Simulator
```bash
./target/release/three_body_problem --seed 0x123456 --file-name my_orbit
```

### Python Runner Script
The `run.py` script automates running multiple simulations with different parameters:
```bash
python run.py                    # Run test matrix (multiple drift configurations)
python run.py --single-config    # Run single configuration
python run.py --max-concurrent 4 # Use 4 parallel workers
```

### Code Formatting
```bash
cargo fmt                        # Format code using rustfmt.toml settings
```

### Development Tools
```bash
cargo check                      # Fast syntax/type checking
cargo clippy                     # Linting
```

## Architecture

### Core Modules

**`main.rs`** - Entry point and orchestration
- Parses CLI arguments
- Coordinates the 7-stage simulation pipeline
- Handles output directory creation and file naming

**`sim.rs`** - Simulation engine and Borda selection
- `Sha3RandomByteStream`: Deterministic RNG for reproducible results
- `Body`: Represents celestial bodies with mass, position, velocity
- N-body physics integration using Verlet method
- Borda ranking system to select aesthetically pleasing orbits from random samples
- Center-of-mass frame calculations and escape detection

**`render.rs`** - Advanced rendering pipeline
- Dual-pass rendering: histogram gathering + frame generation
- Anti-aliased line drawing using Xiaolin Wu's algorithm
- Multi-layer compositing (sharp core + bloom halo)
- ACES filmic tone mapping
- Spectral rendering path for realistic color physics

**`spectrum.rs`** - Spectral color computation
- 16-bin spectral power distribution (380-700nm)
- Wavelength-to-RGB conversion with proper physics
- Sub-pixel chromatic aberration simulation

**`drift.rs`** - Motion transformations
- `BrownianDrift`: Gaussian random walk motion
- Configurable drift modes applied to orbital trajectories
- Used to add subtle motion variations for artistic effect

**`analysis.rs`** - Orbit quality metrics
- Energy and angular momentum calculations
- "Non-chaoticness" and "equilateralness" scoring
- Fourier analysis for orbital regularity assessment

**`utils.rs`** - Utility functions
- Gaussian blur kernels and convolution
- Bounding box calculations
- Mathematical utilities

### Simulation Pipeline (7 Stages)

1. **Borda Search**: Generate thousands of random 3-body configurations, simulate briefly, rank by aesthetic metrics
2. **Full Simulation**: Re-run the best orbit for full duration (default 1M steps)
3. **Drift Application**: Apply motion transformations (Brownian/linear drift)
4. **Color Generation**: Create evolving color sequences using perceptual color spaces
5. **Bounding Box**: Calculate spatial bounds for viewport scaling
6. **Pass 1 - Histogram**: Accumulate all frames to determine exposure levels
7. **Pass 2 - Rendering**: Generate final frames with proper tone mapping and effects

### Key Configuration

**Cargo.toml** - Package configuration
- Project name: `three_body_problem`
- Rust edition 2024, min version 1.86.0
- Optimized release profile with LTO and single codegen unit
- Dependencies include nalgebra, image, rayon for parallel processing

**rustfmt.toml** - Code formatting rules
- 100 character line width
- Trailing commas always
- Import grouping and merging enabled
- Single-line functions and structs allowed

### File Organization

**Input/Output**:
- `pics/` - Generated PNG images (final frames)
- `vids/` - Generated MP4 videos (full animations)
- Seeds determine output filename prefixes

**Python Integration**:
- `run.py` provides high-level automation
- Supports parallel execution and parameter sweeps
- Automatic file existence checking to skip duplicates

## Development Notes

### Performance Considerations
- Release builds are essential - debug builds are too slow for realistic simulations
- Parallel processing used extensively (rayon crate)
- Memory-efficient streaming for large datasets

### Reproducibility
- All randomness is seeded with SHA3-based deterministic RNG
- Same seed always produces identical results
- Hex seeds allow easy parameter exploration

### Rendering Quality
- Anti-aliased line drawing prevents jagged edges
- Spectral rendering provides physically accurate colors
- Multi-scale blur and bloom effects create cinematic quality
- ACES tone mapping handles high dynamic range

### Common Development Patterns
- Use existing RNG patterns for any new random generation
- Follow the modular architecture when adding new drift modes or analysis metrics
- Maintain the two-pass rendering structure for any new visual effects
- CLI arguments should have sensible defaults and clear documentation