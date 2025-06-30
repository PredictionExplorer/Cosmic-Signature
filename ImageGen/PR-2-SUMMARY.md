# PR-2: Auto-Exposed Linear-Light HDR - Implementation Summary

## Overview
Successfully implemented Auto-Exposed Linear-Light HDR rendering system, replacing the alpha compression mechanism with a cleaner HDR scale approach and automatic exposure adjustment.

## Key Changes

### 1. HDR Scale Management
- Added `HDR_SCALE` atomic storage similar to alpha compression
- Implemented `set_hdr_scale()` and `get_hdr_scale()` functions
- Default scale of 1.0 when HDR is off, configurable scale when on

### 2. Alpha Compression Removal
- Removed exponential soft-knee compression from `plot()` and `plot_spec()` functions
- Replaced with simple HDR scale multiplication: `src_alpha = alpha * base_alpha * hdr_scale`
- Removed density-based adaptive compression from rendering passes
- Removed manual exposure gamma (1.2) from both render passes

### 3. Auto-Exposure System
- Created `ExposureCalculator` struct with configurable parameters:
  - `target_percentile`: 0.95 (95th percentile)
  - `min_exposure`: 0.1
  - `max_exposure`: 10.0
- Calculates exposure based on Rec. 709 luminance weights
- Maps 95th percentile luminance to 0.8 for optimal brightness
- Applied after SPD→RGBA conversion, before bloom effects

### 4. CLI Integration
- Added `--hdr-mode` flag with options: "off" (default) or "auto"
- Added `--hdr-scale` flag with default value 0.15
- HDR scale is only applied when HDR mode is "auto"

### 5. Render Pipeline Updates
- Updated `pass_1_build_histogram_spectral` to accept `hdr_mode` parameter
- Updated `pass_2_write_frames_spectral` to accept `hdr_mode` parameter
- Auto-exposure is calculated and applied per frame when enabled
- Maintains compatibility with existing bloom modes (gaussian/dog)

## Testing Results
- Successfully compiled with no errors or warnings
- Tested with HDR off: produces standard output
- Tested with HDR auto: produces auto-exposed output with proper dynamic range
- Both test cases generated valid PNG and MP4 outputs

## Performance Impact
- Minimal overhead from auto-exposure calculation
- Memory usage unchanged (still using f64 accumulators)
- Note: Full f32 conversion deferred to avoid scope creep

## Usage Example
```bash
# Standard rendering (HDR off)
./three_body_problem --seed 0x123456 --hdr-mode off

# HDR with auto-exposure
./three_body_problem --seed 0x123456 --hdr-mode auto --hdr-scale 0.15
```

## Next Steps
- Monitor visual quality with different seeds and configurations
- Consider f32 conversion in a separate PR for memory optimization
- Potentially add more HDR modes (manual exposure, tone curves) 