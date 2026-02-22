//! Constants used throughout the render module
//!
//! This module contains all numeric constants used in rendering operations,
//! color space conversions, and video encoding. Each constant is documented
//! with its purpose and typical usage range.

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

/// Base frequency (cycles) of the palette sway wave (now randomized per-seed in [1.8, 4.0])
#[allow(dead_code)]
pub const HUE_WAVE_FREQUENCY: f64 = 2.6;

/// Additional per-body phase offsets (degrees) to guarantee separation
pub const BODY_HUE_PHASE: [f64; 3] = [0.0, 120.0, 240.0];

// ========== OKLab Perceptual Color Space Constants ==========

/// Base chroma value (typical range 0-0.3 for natural colors)
pub const OKLAB_CHROMA_BASE: f64 = 0.18;
/// Boosted base chroma for museum-quality output
pub const OKLAB_CHROMA_BASE_BOOSTED: f64 = 0.22;

/// Range of chroma variation around the base value
pub const OKLAB_CHROMA_RANGE: f64 = 0.12;
/// Boosted chroma range
pub const OKLAB_CHROMA_RANGE_BOOSTED: f64 = 0.14;

/// Additional chroma modulation applied via palette waves
pub const OKLAB_CHROMA_WAVE_AMPLITUDE: f64 = 0.07;
/// Boosted chroma wave amplitude
pub const OKLAB_CHROMA_WAVE_AMPLITUDE_BOOSTED: f64 = 0.10;

/// Base lightness value (0=black, 1=white)
pub const OKLAB_LIGHTNESS_BASE: f64 = 0.62;

/// Range of lightness variation around the base value
pub const OKLAB_LIGHTNESS_RANGE: f64 = 0.32;

/// Additional lightness modulation applied via palette waves
pub const OKLAB_LIGHTNESS_WAVE_AMPLITUDE: f64 = 0.28;

// ========== Rendering Constants ==========

/// Default HDR scale factor when HDR mode is disabled
pub const DEFAULT_HDR_SCALE: f64 = 1.0;

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

/// Default strength for the cinematic color grading effect (0-1)
pub const DEFAULT_COLOR_GRADE_STRENGTH: f64 = 0.48;

/// Default vignette strength for color grading (0-1)
pub const DEFAULT_COLOR_GRADE_VIGNETTE: f64 = 0.45;

/// Default vignette softness exponent (> 1.0)
pub const DEFAULT_COLOR_GRADE_VIGNETTE_SOFTNESS: f64 = 2.6;

/// Default vibrance boost applied during color grading
pub const DEFAULT_COLOR_GRADE_VIBRANCE: f64 = 1.12;

/// Default clarity strength (high-pass contrast) during color grading
pub const DEFAULT_COLOR_GRADE_CLARITY: f64 = 0.30;

/// Default tone curve strength for midtone contrast shaping
pub const DEFAULT_COLOR_GRADE_TONE_CURVE: f64 = 0.55;

/// Default cool tint added to shadows during color grading (linear RGB deltas)
pub const DEFAULT_COLOR_GRADE_SHADOW_TINT: [f64; 3] = [-0.08, -0.02, 0.16];

/// Default warm tint added to highlights during color grading (linear RGB deltas)
pub const DEFAULT_COLOR_GRADE_HIGHLIGHT_TINT: [f64; 3] = [0.11, 0.05, -0.03];

/// Default cell density for the champlevé effect (cells per normalized unit)
pub const DEFAULT_CHAMPLEVE_CELL_DENSITY: f64 = 55.0;

/// Influence of luminance on champlevé interference alignment
pub const DEFAULT_CHAMPLEVE_FLOW_ALIGNMENT: f64 = 0.65;

/// Default interference amplitude for iridescence
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_AMPLITUDE: f64 = 0.6;

/// Default interference frequency for iridescent striations
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_FREQUENCY: f64 = 30.0;

/// Default rim intensity for metal inlay
pub const DEFAULT_CHAMPLEVE_RIM_INTENSITY: f64 = 2.0;

/// Default rim warmth blend factor (0 = original color, 1 = full gold)
pub const DEFAULT_CHAMPLEVE_RIM_WARMTH: f64 = 0.72;

/// Default rim sharpness exponent
pub const DEFAULT_CHAMPLEVE_RIM_SHARPNESS: f64 = 4.5;

/// Default interior lift for opaline glow
pub const DEFAULT_CHAMPLEVE_INTERIOR_LIFT: f64 = 0.70;

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
pub const DEFAULT_AETHER_SCATTERING_STRENGTH: f64 = 1.0;

/// Exponent for the scattering falloff curve
pub const DEFAULT_AETHER_SCATTERING_FALLOFF: f64 = 2.5;

/// Amplitude of the iridescent color shifting
pub const DEFAULT_AETHER_IRIDESCENCE_AMPLITUDE: f64 = 0.65;

/// Frequency of the iridescent color bands
pub const DEFAULT_AETHER_IRIDESCENCE_FREQUENCY: f64 = 12.0;

/// Intensity of the negative space caustics
pub const DEFAULT_AETHER_CAUSTIC_STRENGTH: f64 = 0.35;

/// Softness of the caustic bleed effect
pub const DEFAULT_AETHER_CAUSTIC_SOFTNESS: f64 = 3.0;

// ========== Special Mode Enhancement Constants ==========

/// Spectral dispersion strength - controls prismatic trail separation
pub const SPECTRAL_DISPERSION_STRENGTH: f64 = 0.8;
/// Boosted dispersion for wider rainbow trails
pub const SPECTRAL_DISPERSION_STRENGTH_BOOSTED: f64 = 1.1;

/// Number of wavelength bins to spread dispersion across (±bins from center)
pub const SPECTRAL_DISPERSION_BINS: usize = 5;  // Increased from 3 for fuller spectrum

/// Velocity-based HDR boost factor - multiplies HDR scale at high velocities
/// 1.0 = no boost, 2.0 = double brightness at max velocity
pub const VELOCITY_HDR_BOOST_FACTOR: f64 = 8.0;  // Increased from 2.5 for dramatic flares

/// Velocity threshold for HDR boost (normalized units per timestep)
/// Velocities above this get maximum boost
pub const VELOCITY_HDR_BOOST_THRESHOLD: f64 = 0.15;  // Lowered from 0.3 to activate earlier

/// Energy density threshold for wavelength shift (normalized energy)
/// Pixels above this threshold shift toward red (heat)
pub const ENERGY_DENSITY_SHIFT_THRESHOLD: f64 = 0.08;  // Lowered from 0.25 to affect more pixels

/// Wavelength shift strength (fraction of bin to shift per density unit)
/// Higher values create stronger red-shift in high-energy regions
pub const ENERGY_DENSITY_SHIFT_STRENGTH: f64 = 0.75;  // Increased from 0.35 for stronger heat effect

// ========== Video Encoding Constants ==========

/// Default video bitrate for high quality output (legacy, no longer used)
#[allow(dead_code)]
pub const DEFAULT_VIDEO_BITRATE: &str = "100M";

/// Default video framerate
pub const DEFAULT_VIDEO_FPS: u32 = 60;

/// Default target duration in frames (~30 seconds at 60 FPS)
pub const DEFAULT_TARGET_FRAMES: u32 = 1800;

/// Default video codec (legacy, no longer used - now using H.265)
#[allow(dead_code)]
pub const DEFAULT_VIDEO_CODEC: &str = "libx264";

/// Default pixel format for compatibility (legacy, no longer used - now using 10-bit formats)
#[allow(dead_code)]
pub const DEFAULT_PIXEL_FORMAT: &str = "yuv420p";

// ========== Simulation Constants ==========

/// Default simulation timestep
pub const DEFAULT_DT: f64 = 0.001;

/// Kinetic energy factor (1/2 in KE = 1/2 * m * v²)
pub const KINETIC_ENERGY_FACTOR: f64 = 0.5;

// ========== Mathematical Constants ==========

/// Two times PI (full circle in radians)
pub const TWO_PI: f64 = 2.0 * std::f64::consts::PI;

// ========== Progress Reporting Constants ==========

/// Percentage conversion factor
pub const PERCENT_FACTOR: f64 = 100.0;

