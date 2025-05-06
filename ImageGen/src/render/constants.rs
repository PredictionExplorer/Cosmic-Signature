//! Constants used throughout the render module
//!
//! This module contains all numeric constants used in rendering operations,
//! color space conversions, and video encoding. Each constant is documented
//! with its purpose and typical usage range.

#![allow(dead_code)]

// ========== Color Generation Constants ==========

/// Degrees in a full rotation
pub const HUE_FULL_CIRCLE: f64 = 360.0;

/// Separation between body hues (360/3 for even distribution)
/// This ensures the three bodies have maximally separated base colors
pub const BODY_HUE_SEPARATION: f64 = 120.0;

/// Controls drift rate of hue over time (higher = more palette movement)
pub const HUE_DRIFT_SCALE: f64 = 1.85;

/// Base time drift factor for subtle color evolution
pub const BASE_HUE_DRIFT: f64 = 1.4;

/// Amplitude, in degrees, applied by the palette sway wave
pub const HUE_WAVE_AMPLITUDE: f64 = 52.0;

/// Frequency, in cycles, of the palette sway wave across a trajectory
pub const HUE_WAVE_FREQUENCY: f64 = 2.6;

/// Additional per-body phase offsets (degrees) to guarantee separation
pub const BODY_HUE_PHASE: [f64; 3] = [0.0, 120.0, 240.0];

// ========== OKLab Perceptual Color Space Constants ==========

/// Base chroma value (typical range 0-0.3 for natural colors)
/// Higher values produce more saturated colors
pub const OKLAB_CHROMA_BASE: f64 = 0.18;

/// Range of chroma variation around the base value
pub const OKLAB_CHROMA_RANGE: f64 = 0.12;

/// Additional chroma modulation applied via palette waves
pub const OKLAB_CHROMA_WAVE_AMPLITUDE: f64 = 0.07;

/// Base lightness value (0=black, 1=white)
pub const OKLAB_LIGHTNESS_BASE: f64 = 0.62;

/// Range of lightness variation around the base value
pub const OKLAB_LIGHTNESS_RANGE: f64 = 0.32;

/// Additional lightness modulation applied via palette waves
pub const OKLAB_LIGHTNESS_WAVE_AMPLITUDE: f64 = 0.22;

// ========== Rendering Constants ==========

/// Default HDR scale factor when HDR mode is disabled
pub const DEFAULT_HDR_SCALE: f64 = 1.0;

/// Alpha threshold for skipping pixels (below this is considered transparent)
pub const ALPHA_EPSILON: f64 = 1e-6;

/// Bilinear interpolation averaging factor (1/4 for 4 samples)
pub const BILINEAR_AVG_FACTOR: f64 = 0.25;

/// Edge extension for bounding box to ensure all particles are visible
pub const BOUNDING_BOX_PADDING: f64 = 0.5;

/// Sigma calculation factor for Gaussian blur (radius/3)
pub const GAUSSIAN_SIGMA_FACTOR: f64 = 3.0;

/// Minimum sigma value to prevent division by zero
pub const GAUSSIAN_SIGMA_MIN: f64 = 1.0;

/// Factor for two-sigma-squared calculation in Gaussian
pub const GAUSSIAN_TWO_FACTOR: f64 = 2.0;

/// Default HDR scale multiplier for line alpha
pub const DEFAULT_HDR_SCALE_LINE: f64 = 0.15;

/// Alpha threshold below which pixels are skipped (for performance)
pub const ALPHA_THRESHOLD: f64 = 1e-6;

/// Default strength for the cinematic color grading effect (0-1)
pub const DEFAULT_COLOR_GRADE_STRENGTH: f64 = 0.48;

/// Default vignette strength for color grading (0-1)
pub const DEFAULT_COLOR_GRADE_VIGNETTE: f64 = 0.45;

/// Default vignette softness exponent (> 1.0)
pub const DEFAULT_COLOR_GRADE_VIGNETTE_SOFTNESS: f64 = 2.6;

/// Default warmth shift applied during color grading
pub const DEFAULT_COLOR_GRADE_WARMTH: f64 = 0.024;

/// Default vibrance boost applied during color grading
pub const DEFAULT_COLOR_GRADE_VIBRANCE: f64 = 1.12;

/// Default clarity strength (high-pass contrast) during color grading
pub const DEFAULT_COLOR_GRADE_CLARITY: f64 = 0.30;

/// Default clarity blur radius (pixels) used for the high-pass filter
pub const DEFAULT_COLOR_GRADE_CLARITY_RADIUS: usize = 3;

/// Default tone curve strength for midtone contrast shaping
pub const DEFAULT_COLOR_GRADE_TONE_CURVE: f64 = 0.55;

/// Default cool tint added to shadows during color grading (linear RGB deltas)
pub const DEFAULT_COLOR_GRADE_SHADOW_TINT: [f64; 3] = [-0.08, -0.02, 0.16];

/// Default warm tint added to highlights during color grading (linear RGB deltas)
pub const DEFAULT_COLOR_GRADE_HIGHLIGHT_TINT: [f64; 3] = [0.11, 0.05, -0.03];

/// Default lift adjustment applied before grading (per channel)
pub const DEFAULT_COLOR_GRADE_LIFT: [f64; 3] = [0.012, 0.006, -0.005];

/// Default gamma adjustment per channel for filmic grade
pub const DEFAULT_COLOR_GRADE_GAMMA: [f64; 3] = [0.90, 0.94, 1.03];

/// Default gain adjustment per channel to balance highlights
pub const DEFAULT_COLOR_GRADE_GAIN: [f64; 3] = [1.2, 1.08, 0.94];

/// Default cell density for the champlevé effect (cells per normalized unit)
pub const DEFAULT_CHAMPLEVE_CELL_DENSITY: f64 = 55.0;

/// Influence of luminance on champlevé interference alignment
pub const DEFAULT_CHAMPLEVE_FLOW_ALIGNMENT: f64 = 0.65;

/// Default interference amplitude for iridescence
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_AMPLITUDE: f64 = 0.3;

/// Default interference frequency for iridescent striations
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_FREQUENCY: f64 = 30.0;

/// Default rim intensity for metal inlay
pub const DEFAULT_CHAMPLEVE_RIM_INTENSITY: f64 = 1.2;

/// Default rim warmth blend factor (0 = original color, 1 = full gold)
pub const DEFAULT_CHAMPLEVE_RIM_WARMTH: f64 = 0.72;

/// Default rim sharpness exponent
pub const DEFAULT_CHAMPLEVE_RIM_SHARPNESS: f64 = 4.5;

/// Default interior lift for opaline glow
pub const DEFAULT_CHAMPLEVE_INTERIOR_LIFT: f64 = 0.40;

/// Default anisotropy strength for brushed-metal sheen
pub const DEFAULT_CHAMPLEVE_ANISOTROPY: f64 = 0.95;

/// Default centre highlight compression for champlevé cells
pub const DEFAULT_CHAMPLEVE_CELL_SOFTNESS: f64 = 1.1;

// ========== Aether Effect Constants ==========

/// Default density of filaments in the aether weave
pub const DEFAULT_AETHER_FILAMENT_DENSITY: f64 = 90.0;

/// Default strength of flow alignment for anisotropic warp
pub const DEFAULT_AETHER_FLOW_ALIGNMENT: f64 = 0.85;

/// Base intensity of the volumetric scattering effect
pub const DEFAULT_AETHER_SCATTERING_STRENGTH: f64 = 0.55;

/// Exponent for the scattering falloff curve
pub const DEFAULT_AETHER_SCATTERING_FALLOFF: f64 = 2.5;

/// Amplitude of the iridescent color shifting
pub const DEFAULT_AETHER_IRIDESCENCE_AMPLITUDE: f64 = 0.35;

/// Frequency of the iridescent color bands
pub const DEFAULT_AETHER_IRIDESCENCE_FREQUENCY: f64 = 12.0;

/// Intensity of the negative space caustics
pub const DEFAULT_AETHER_CAUSTIC_STRENGTH: f64 = 0.15;

/// Softness of the caustic bleed effect
pub const DEFAULT_AETHER_CAUSTIC_SOFTNESS: f64 = 3.0;

// ========== Video Encoding Constants ==========

/// Default video bitrate for high quality output
pub const DEFAULT_VIDEO_BITRATE: &str = "100M";

/// Default video framerate
pub const DEFAULT_VIDEO_FPS: u32 = 60;

/// Default target duration in frames (~30 seconds at 60 FPS)
pub const DEFAULT_TARGET_FRAMES: u32 = 1800;

/// Default video codec
pub const DEFAULT_VIDEO_CODEC: &str = "libx264";

/// Default pixel format for compatibility
pub const DEFAULT_PIXEL_FORMAT: &str = "yuv420p";

// ========== Simulation Constants ==========

/// Default simulation timestep
pub const DEFAULT_DT: f64 = 0.001;

/// Kinetic energy factor (1/2 in KE = 1/2 * m * v²)
pub const KINETIC_ENERGY_FACTOR: f64 = 0.5;

/// Default perceptual blur strength
pub const DEFAULT_PERCEPTUAL_BLUR_STRENGTH: f64 = 0.5;

// ========== Mathematical Constants ==========

/// Two times PI (full circle in radians)
pub const TWO_PI: f64 = 2.0 * std::f64::consts::PI;

/// Small epsilon for floating point comparisons
pub const FLOAT_EPSILON: f64 = 1e-6;

// ========== Progress Reporting Constants ==========

/// Percentage conversion factor
pub const PERCENT_FACTOR: f64 = 100.0;

/// Progress update interval (update every N frames)
pub const PROGRESS_UPDATE_INTERVAL: usize = 100;
