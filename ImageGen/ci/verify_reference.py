#!/usr/bin/env python3
"""
CI verification script for comparing generated images against reference images.
"""

import sys
import hashlib
import json
import os
from pathlib import Path


def calculate_sha256(filepath):
    """Calculate SHA256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def load_reference_metadata(ref_path):
    """Load reference metadata from JSON file."""
    json_path = ref_path.with_suffix('.json')
    if not json_path.exists():
        raise FileNotFoundError(f"Reference metadata not found: {json_path}")
    
    with open(json_path, 'r') as f:
        return json.load(f)


def verify_image(test_image_path, reference_image_path):
    """Verify that a test image matches the reference image."""
    # Check if test image exists
    if not os.path.exists(test_image_path):
        print(f"ERROR: Test image not found: {test_image_path}")
        return False
    
    # Check if reference image exists
    if not os.path.exists(reference_image_path):
        print(f"ERROR: Reference image not found: {reference_image_path}")
        return False
    
    # Calculate hashes
    test_hash = calculate_sha256(test_image_path)
    ref_hash = calculate_sha256(reference_image_path)
    
    # Load reference metadata
    ref_path = Path(reference_image_path)
    try:
        metadata = load_reference_metadata(ref_path)
        expected_hash = metadata.get('sha256', ref_hash)
    except Exception as e:
        print(f"WARNING: Could not load reference metadata: {e}")
        expected_hash = ref_hash
    
    # Compare hashes
    if test_hash == expected_hash:
        print(f"✓ Image verification PASSED")
        print(f"  Test hash:      {test_hash}")
        print(f"  Expected hash:  {expected_hash}")
        return True
    else:
        print(f"✗ Image verification FAILED")
        print(f"  Test hash:      {test_hash}")
        print(f"  Expected hash:  {expected_hash}")
        
        # Calculate file sizes for additional info
        test_size = os.path.getsize(test_image_path)
        ref_size = os.path.getsize(reference_image_path)
        print(f"  Test file size:     {test_size} bytes")
        print(f"  Reference file size: {ref_size} bytes")
        
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python verify_reference.py <test_image_path> [reference_image_path]")
        sys.exit(1)
    
    test_image_path = sys.argv[1]
    
    # If reference path not provided, use default
    if len(sys.argv) >= 3:
        reference_image_path = sys.argv[2]
    else:
        # Default to the 512x288 reference
        script_dir = Path(__file__).parent
        reference_image_path = script_dir / "reference" / "baseline_512x288.png"
    
    # Verify the image
    success = verify_image(test_image_path, reference_image_path)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main() 