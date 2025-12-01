//! Constants used throughout the render module.
//!
//! This module contains all numeric constants used in rendering operations,
//! color space conversions, and video encoding. Each constant is documented
//! with its purpose, physical/perceptual basis, and recommended value ranges.
//!
//! # Constant Categories
//!
//! - **Color Generation**: Hue, chroma, and lightness parameters for body colors
//! - **OKLab Perceptual**: Color space transformation constants
//! - **Rendering**: Blur, bloom, and visual effect parameters
//! - **Video Encoding**: Framerate, bitrate, and codec settings
//! - **Simulation**: Physics timestep and energy calculations
//!
//! # Value Selection Methodology
//!
//! Constants were tuned through extensive visual testing to achieve:
//! 1. Perceptually beautiful default aesthetics
//! 2. Stable numerical behavior across input ranges
//! 3. Performance characteristics suitable for real-time preview

// ========== Color Generation Constants ==========

/// Degrees in a full rotation
pub const HUE_FULL_CIRCLE: f64 = 360.0;

/// Separation between body hues (360/3 for even distribution)
/// This ensures the three bodies have maximally separated base colors
pub const BODY_HUE_SEPARATION: f64 = 120.0;

/// Enhanced drift rate for captivating palette evolution
pub const HUE_DRIFT_SCALE: f64 = 2.15; // Increased from 1.85 for more dynamic color shifts

/// Enhanced base drift for rich color journey
pub const BASE_HUE_DRIFT: f64 = 1.7; // Increased from 1.4 for stronger evolution

/// Amplified wave amplitude for dramatic color sweeps
pub const HUE_WAVE_AMPLITUDE: f64 = 62.0; // Increased from 52 for bolder palette movement

/// Refined wave frequency for elegant color cycles
pub const HUE_WAVE_FREQUENCY: f64 = 2.9; // Increased from 2.6 for richer harmonic variation

/// Additional per-body phase offsets (degrees) to guarantee separation
pub const BODY_HUE_PHASE: [f64; 3] = [0.0, 120.0, 240.0];

// ========== OKLab Perceptual Color Space Constants ==========

/// Base chroma value - dramatically increased for stunning saturation
/// Higher values produce more saturated, jewel-like colors
pub const OKLAB_CHROMA_BASE: f64 = 0.24; // Increased from 0.18 for richer colors

/// Range of chroma variation - wider range for more dynamic color shifts
pub const OKLAB_CHROMA_RANGE: f64 = 0.16; // Increased from 0.12 for greater variety

/// Additional chroma modulation - enhanced for vivid palette movement
pub const OKLAB_CHROMA_WAVE_AMPLITUDE: f64 = 0.10; // Increased from 0.07 for bolder waves

/// Base lightness value - optimized for maximum vibrancy while maintaining depth
pub const OKLAB_LIGHTNESS_BASE: f64 = 0.68; // Increased from 0.62 for brighter overall tone

/// Range of lightness variation - expanded for dramatic luminosity shifts
pub const OKLAB_LIGHTNESS_RANGE: f64 = 0.36; // Increased from 0.32 for wider dynamic range

/// Additional lightness modulation - amplified for stunning brightness waves
pub const OKLAB_LIGHTNESS_WAVE_AMPLITUDE: f64 = 0.26; // Increased from 0.22 for dramatic sparkle

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

/// Enhanced cinematic color grading for dramatic visual impact
pub const DEFAULT_COLOR_GRADE_STRENGTH: f64 = 0.58; // Increased from 0.48 for richer grading

/// Enhanced vignette for focused attention and depth
pub const DEFAULT_COLOR_GRADE_VIGNETTE: f64 = 0.52; // Increased from 0.45 for stronger framing

/// Vignette softness optimized for smooth falloff
pub const DEFAULT_COLOR_GRADE_VIGNETTE_SOFTNESS: f64 = 2.8; // Increased from 2.6 for gentler transition

/// Vibrance dramatically enhanced for jewel-like saturation
pub const DEFAULT_COLOR_GRADE_VIBRANCE: f64 = 1.28; // Increased from 1.12 for stunning colors

/// Clarity boosted for crystalline detail and definition
pub const DEFAULT_COLOR_GRADE_CLARITY: f64 = 0.38; // Increased from 0.30 for sharper micro-contrast

/// Tone curve enhanced for powerful midtone punch
pub const DEFAULT_COLOR_GRADE_TONE_CURVE: f64 = 0.65; // Increased from 0.55 for more dramatic S-curve

/// Enhanced cool tint for deep, rich shadows with azure undertones
pub const DEFAULT_COLOR_GRADE_SHADOW_TINT: [f64; 3] = [-0.10, -0.03, 0.20]; // Cooler, deeper shadows

/// Enhanced warm tint for luminous, golden highlights
pub const DEFAULT_COLOR_GRADE_HIGHLIGHT_TINT: [f64; 3] = [0.14, 0.07, -0.04]; // Warmer, richer highlights

/// Enhanced cell density for intricate champlevé detail
pub const DEFAULT_CHAMPLEVE_CELL_DENSITY: f64 = 62.0; // Increased from 55 for finer tessellation

/// Enhanced flow alignment for fluid, organic champlevé patterns
pub const DEFAULT_CHAMPLEVE_FLOW_ALIGNMENT: f64 = 0.72; // Increased from 0.65 for stronger directionality

/// Amplified interference for stunning iridescent shimmer
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_AMPLITUDE: f64 = 0.72; // Increased from 0.6 for richer color play

/// Enhanced interference frequency for delicate pearlescent bands
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_FREQUENCY: f64 = 35.0; // Increased from 30 for finer detail

/// Dramatically enhanced rim intensity for brilliant metallic edges
pub const DEFAULT_CHAMPLEVE_RIM_INTENSITY: f64 = 2.4; // Increased from 2.0 for brighter halos

/// Enhanced rim warmth for luxurious golden accents
pub const DEFAULT_CHAMPLEVE_RIM_WARMTH: f64 = 0.78; // Increased from 0.72 for richer gold

/// Sharpened rim definition for crisp metallic boundaries
pub const DEFAULT_CHAMPLEVE_RIM_SHARPNESS: f64 = 5.0; // Increased from 4.5 for sharper edges

/// Enhanced interior glow for luminous opalescence
pub const DEFAULT_CHAMPLEVE_INTERIOR_LIFT: f64 = 0.78; // Increased from 0.70 for brighter cores

/// Amplified anisotropy for stunning brushed-metal reflections
pub const DEFAULT_CHAMPLEVE_ANISOTROPY: f64 = 1.05; // Increased from 0.95 for stronger directional sheen

/// Default centre highlight compression for champlevé cells
pub const DEFAULT_CHAMPLEVE_CELL_SOFTNESS: f64 = 1.1;

// ========== Aether Effect Constants ==========

/// Enhanced filament density for intricate ethereal weave
pub const DEFAULT_AETHER_FILAMENT_DENSITY: f64 = 105.0; // Increased from 90 for richer texture

/// Amplified flow alignment for mesmerizing directional flow
pub const DEFAULT_AETHER_FLOW_ALIGNMENT: f64 = 0.92; // Increased from 0.85 for stronger coherence

/// Enhanced scattering for luminous volumetric presence
pub const DEFAULT_AETHER_SCATTERING_STRENGTH: f64 = 1.2; // Increased from 1.0 for stronger glow

/// Optimized falloff for smooth, atmospheric transitions
pub const DEFAULT_AETHER_SCATTERING_FALLOFF: f64 = 2.7; // Increased from 2.5 for gentler gradient

/// Amplified iridescence for spectacular chromatic shimmer
pub const DEFAULT_AETHER_IRIDESCENCE_AMPLITUDE: f64 = 0.78; // Increased from 0.65 for richer color play

/// Enhanced frequency for delicate rainbow bands
pub const DEFAULT_AETHER_IRIDESCENCE_FREQUENCY: f64 = 14.0; // Increased from 12 for finer detail

/// Intensified caustics for dramatic light refraction
pub const DEFAULT_AETHER_CAUSTIC_STRENGTH: f64 = 0.45; // Increased from 0.35 for stronger effect

/// Refined caustic softness for elegant bleed and bloom
pub const DEFAULT_AETHER_CAUSTIC_SOFTNESS: f64 = 3.5; // Increased from 3.0 for smoother transitions

// ========== Special Mode Enhancement Constants ==========

/// Spectral dispersion strength controls prismatic trail separation.
///
/// # Physical Basis
///
/// Real light passing through a prism separates by wavelength due to varying
/// refractive indices (dispersion). This constant simulates that effect by
/// offsetting different wavelength bins spatially during line drawing.
///
/// # Value Selection
///
/// - **0.0**: No dispersion (monochromatic appearance)
/// - **0.3**: Subtle rainbow fringing at high-contrast edges
/// - **0.8** (default): Visible prismatic trails (~13px separation at 1080p)
/// - **1.5+**: Extreme separation, potentially too artificial
///
/// The value 0.8 was chosen to create visible but not overwhelming chromatic
/// separation, matching the aesthetic of high-quality astrophotography with
/// slight lens aberration.
pub const SPECTRAL_DISPERSION_STRENGTH: f64 = 0.8;

/// Number of wavelength bins to spread dispersion across (±bins from center).
///
/// Controls the width of the rainbow effect. More bins create a fuller spectrum
/// but increase computational cost linearly.
///
/// - **3**: Tighter, more focused prismatic effect
/// - **5** (default): Full visible spectrum representation
/// - **7+**: Very wide separation, may appear artificial
pub const SPECTRAL_DISPERSION_BINS: usize = 5;

/// Velocity-based HDR boost factor for bright flares on fast-moving segments.
///
/// # Physical Basis
///
/// Fast-moving objects leave shorter, more concentrated light trails.
/// In real astrophotography, this creates brighter streaks. This factor
/// simulates that concentration of photons.
///
/// # Value Selection
///
/// - **1.0**: No velocity-based brightness (uniform trails)
/// - **2.5**: Subtle brightening (original default)
/// - **8.0** (default): Dramatic flares on high-velocity segments
///
/// Higher values create more dramatic "solar flare" effects when bodies
/// move quickly, adding visual interest to dynamic moments.
pub const VELOCITY_HDR_BOOST_FACTOR: f64 = 8.0;

/// Velocity threshold for HDR boost (normalized units per timestep).
///
/// Velocities above this get maximum boost. Lower thresholds make the
/// effect more prevalent, higher thresholds restrict it to extreme velocities.
///
/// - **0.05**: Activates on moderate motion
/// - **0.15** (default): Activates on fast motion
/// - **0.30**: Restricts to very fast motion only
pub const VELOCITY_HDR_BOOST_THRESHOLD: f64 = 0.15;

/// Energy density threshold for wavelength shift (normalized energy).
///
/// # Physical Basis
///
/// In astrophysics, high-energy regions appear redder due to thermal emission.
/// This effect simulates that by shifting the spectral distribution of
/// high-energy pixels toward longer (red) wavelengths.
///
/// # Value Selection
///
/// - **0.05**: Affects most trajectory regions (very prevalent)
/// - **0.08** (default): Affects dense crossings and overlaps
/// - **0.25**: Restricts to extremely bright regions only
///
/// Lower values create `a` more uniformly "heated" appearance.
pub const ENERGY_DENSITY_SHIFT_THRESHOLD: f64 = 0.08;

/// Wavelength shift strength (fraction of bin to shift per density unit).
///
/// Controls how aggressively high-energy regions shift toward red.
///
/// - **0.35**: Subtle warming in hot regions
/// - **0.75** (default): Visible but natural thermal shift
/// - **1.0+**: Aggressive red-shifting, may look unnatural
///
/// Higher values create stronger red-shift in high-energy regions,
/// enhancing the sense of thermal intensity at trajectory crossings.
pub const ENERGY_DENSITY_SHIFT_STRENGTH: f64 = 0.75;

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

// ========== Tonemapping Constants ==========
// Note: Main tonemapping constants have been moved to render/tonemap.rs

/// Alpha boost factor for trajectory compositing (1.20 = 20% stronger coverage)
pub const COMPOSITE_ALPHA_BOOST_FACTOR: f64 = 1.20;

/// Saturation boost factor for trajectory compositing (1.20 = 20% more saturated)
pub const COMPOSITE_SATURATION_BOOST_FACTOR: f64 = 1.20;

/// Saturation threshold for compositing (only boost high-alpha pixels)
pub const COMPOSITE_SATURATION_THRESHOLD: f64 = 0.50;

// ========== Drawing Constants ==========

/// Minimum line length threshold (lines shorter than this are not drawn)
pub const MIN_LINE_LENGTH: f64 = 0.001;

/// Default chroma value for spectral dispersion effect
pub const DISPERSION_DEFAULT_CHROMA: f64 = 0.15;

// ========== Effect-Specific Constants ==========

/// Ray emitter boost factor for crepuscular rays
pub const RAY_EMITTER_BOOST_FACTOR: f64 = 2.0;

/// Clarity radius scale factor (relative to minimum dimension)
pub const CLARITY_RADIUS_SCALE: f64 = 0.0028;

/// Fixed threshold for DoG bloom effect
pub const DOG_BLOOM_THRESHOLD: f64 = 0.01;

// ========== Simulation Physics Constants ==========

/// Gravity singularity prevention threshold
/// Prevents division by zero when bodies get very close
pub const GRAVITY_SINGULARITY_THRESHOLD: f64 = 1e-10;

/// Energy threshold for quick rejection in Borda search (E > 10.0)
pub const BORDA_ENERGY_REJECTION_THRESHOLD: f64 = 10.0;

/// Angular momentum threshold for quick rejection in Borda search (L < 10.0)
pub const BORDA_ANGULAR_MOMENTUM_THRESHOLD: f64 = 10.0;

/// Minimum viable chaos score for trajectory acceptance
pub const MIN_VIABLE_CHAOS: f64 = 0.1;

/// Minimum viable equilateral score for trajectory acceptance
pub const MIN_VIABLE_EQUILATERAL: f64 = 0.01;

/// Mass check threshold for center-of-mass calculation
pub const COM_MASS_THRESHOLD: f64 = 1e-14;

/// Minimum distance threshold for gravitational force calculation
pub const MIN_DISTANCE_THRESHOLD: f64 = 1e-12;

/// Early-exit check interval for Borda search (check every N steps)
pub const BORDA_CHECK_INTERVAL: usize = 10000;

// ========== Progress Reporting Constants ==========

/// Percentage conversion factor
pub const PERCENT_FACTOR: f64 = 100.0;
