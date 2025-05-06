#!/bin/bash
set -e

# Reference image generation script
# This script generates deterministic reference images for CI testing

echo "Generating reference images for CI..."

# Change to project root
cd "$(dirname "$0")/../.."

# Build the project in release mode
echo "Building project..."
cargo build --release

# Fixed parameters for reference image
SEED="0x46205528"
WIDTH=512
HEIGHT=288
NUM_STEPS=100000
DRIFT_MODE="brownian"
DRIFT_SCALE=1.0
ALPHA_COMPRESS=6.0
PROFILE_TAG="ci_reference"

# Generate the reference image
echo "Generating reference image with parameters:"
echo "  Seed: $SEED"
echo "  Dimensions: ${WIDTH}x${HEIGHT}"
echo "  Steps: $NUM_STEPS"
echo "  Drift: $DRIFT_MODE (scale=$DRIFT_SCALE)"
echo "  Alpha compress: $ALPHA_COMPRESS"

./target/release/three_body_problem \
    --seed "$SEED" \
    --width "$WIDTH" \
    --height "$HEIGHT" \
    --num-steps-sim "$NUM_STEPS" \
    --drift-mode "$DRIFT_MODE" \
    --drift-scale "$DRIFT_SCALE" \
    --alpha-compress "$ALPHA_COMPRESS" \
    --file-name "baseline" \
    --profile-tag "$PROFILE_TAG"

# Move the generated files to reference directory
mv "pics/baseline_${PROFILE_TAG}.png" "ci/reference/baseline_${WIDTH}x${HEIGHT}.png"

# Generate JSON metadata
cat > "ci/reference/baseline_${WIDTH}x${HEIGHT}.json" << EOF
{
    "seed": "$SEED",
    "width": $WIDTH,
    "height": $HEIGHT,
    "num_steps": $NUM_STEPS,
    "drift_mode": "$DRIFT_MODE",
    "drift_scale": $DRIFT_SCALE,
    "alpha_compress": $ALPHA_COMPRESS,
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "sha256": "$(shasum -a 256 ci/reference/baseline_${WIDTH}x${HEIGHT}.png | cut -d' ' -f1)"
}
EOF

echo "Reference image generated successfully!"
echo "Location: ci/reference/baseline_${WIDTH}x${HEIGHT}.png"
echo "Metadata: ci/reference/baseline_${WIDTH}x${HEIGHT}.json" 