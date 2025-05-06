# CI Infrastructure

This directory contains the continuous integration setup for the Three Body Problem simulator.

## Structure

- `reference/` - Contains reference images and metadata for regression testing
- `verify_reference.py` - Python script to verify generated images against references
- `README.md` - This file

## Reference Images

Reference images are used to ensure the simulator produces deterministic output across different runs and platforms. To generate or update reference images:

```bash
cd ci/reference
./generate_reference.sh
```

This will create:
- `baseline_512x288.png` - The reference image
- `baseline_512x288.json` - Metadata including parameters and SHA256 hash

## CI Workflow

The GitHub Actions workflow (`.github/workflows/test.yml`) performs:

1. **Code Quality Checks**
   - Formatting verification (`cargo fmt`)
   - Linting (`cargo clippy`)
   
2. **Build & Test**
   - Builds the project in release mode
   - Runs unit tests
   
3. **Image Verification**
   - Generates a test image with fixed parameters
   - Compares against the reference image (if available)
   
4. **Performance Benchmark**
   - Runs a benchmark simulation
   - Reports timing and output file sizes

## Using Profile Tags

The `--profile-tag` flag can be used to differentiate output files:

```bash
./target/release/three_body_problem --seed 0x123 --profile-tag "experiment_1"
# Creates: pics/output_experiment_1.png
```

This is particularly useful for:
- A/B testing different parameters
- CI builds (using PR numbers or commit hashes)
- Organizing outputs from parameter sweeps 