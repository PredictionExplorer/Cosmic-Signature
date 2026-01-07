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

/// Hue drift rate for palette evolution.
/// 
/// Moderate value for gradual, elegant color shifts.
pub const HUE_DRIFT_SCALE: f64 = 1.6;

/// Base drift for color journey.
pub const BASE_HUE_DRIFT: f64 = 1.2;

/// Wave amplitude for color sweeps.
/// 
/// Reduced for subtle palette movement that doesn't distract.
pub const HUE_WAVE_AMPLITUDE: f64 = 40.0;

/// Wave frequency for color cycles.
pub const HUE_WAVE_FREQUENCY: f64 = 2.2;

/// Additional per-body phase offsets (degrees) to guarantee separation
pub const BODY_HUE_PHASE: [f64; 3] = [0.0, 120.0, 240.0];

// ========== OKLab Perceptual Color Space Constants ==========

/// Base chroma value for color saturation.
///
/// MUSEUM QUALITY: Reduced from 0.18 to 0.12 for more sophisticated,
/// muted color palettes. Vibrant neon colors look "digital" - refined
/// art uses more subtle, nuanced color.
pub const OKLAB_CHROMA_BASE: f64 = 0.12;

/// Range of chroma variation.
///
/// MUSEUM QUALITY: Reduced from 0.10 to 0.06 to prevent occasional
/// oversaturated spikes while maintaining visual interest.
pub const OKLAB_CHROMA_RANGE: f64 = 0.06;

/// Chroma wave amplitude for saturation modulation.
///
/// MUSEUM QUALITY: Reduced from 0.06 to 0.03 for more consistent
/// saturation levels throughout the trajectory.
pub const OKLAB_CHROMA_WAVE_AMPLITUDE: f64 = 0.03;

/// Base lightness value.
///
/// MUSEUM QUALITY: Increased from 0.62 to 0.68 for more luminous,
/// elegant appearance. Higher lightness with lower chroma = refined.
pub const OKLAB_LIGHTNESS_BASE: f64 = 0.68;

/// Range of lightness variation.
///
/// MUSEUM QUALITY: Reduced from 0.28 to 0.20 for more consistent
/// brightness without harsh dark spots.
pub const OKLAB_LIGHTNESS_RANGE: f64 = 0.20;

/// Lightness wave amplitude for brightness modulation.
///
/// MUSEUM QUALITY: Reduced from 0.18 to 0.10 for smoother
/// brightness transitions.
pub const OKLAB_LIGHTNESS_WAVE_AMPLITUDE: f64 = 0.10;

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

/// Color grading strength.
/// 
/// Reduced from 0.58 to preserve natural trajectory colors.
/// Heavy grading obscures the beautiful organic colors from spectral rendering.
pub const DEFAULT_COLOR_GRADE_STRENGTH: f64 = 0.35;

/// Vignette strength for edge darkening.
/// 
/// Subtle vignette draws focus without obvious artificial darkening.
pub const DEFAULT_COLOR_GRADE_VIGNETTE: f64 = 0.30;

/// Vignette softness for smooth falloff.
/// 
/// Higher value for imperceptible gradual transition.
pub const DEFAULT_COLOR_GRADE_VIGNETTE_SOFTNESS: f64 = 3.5;

/// Vibrance for selective saturation boost.
/// 
/// Reduced from 1.28 to prevent oversaturated neon colors.
/// Subtle vibrance enhances without overwhelming.
pub const DEFAULT_COLOR_GRADE_VIBRANCE: f64 = 1.08;

/// Clarity for local contrast enhancement.
/// 
/// Reduced to prevent harsh edges and noise amplification.
/// Note: Currently set to 0.0 in elegant mode to avoid artifacts.
#[allow(dead_code)] // Available for modes that want clarity enhancement
pub const DEFAULT_COLOR_GRADE_CLARITY: f64 = 0.18;

/// Tone curve for S-curve contrast.
/// 
/// Moderate value for gentle midtone enhancement.
pub const DEFAULT_COLOR_GRADE_TONE_CURVE: f64 = 0.40;

/// Shadow tint color shift (L, a, b components).
/// 
/// Subtle cool shift for depth without heavy blue cast.
pub const DEFAULT_COLOR_GRADE_SHADOW_TINT: [f64; 3] = [-0.04, -0.01, 0.08];

/// Highlight tint color shift (L, a, b components).
/// 
/// Subtle warm shift for natural luminosity.
pub const DEFAULT_COLOR_GRADE_HIGHLIGHT_TINT: [f64; 3] = [0.06, 0.03, -0.02];

/// Cell density for champlevé pattern.
/// 
/// Reduced for a cleaner, less busy appearance. High values create
/// excessive noise that detracts from trajectory beauty.
pub const DEFAULT_CHAMPLEVE_CELL_DENSITY: f64 = 35.0;

/// Flow alignment for champlevé pattern.
/// 
/// Moderate value for organic patterns without overwhelming structure.
pub const DEFAULT_CHAMPLEVE_FLOW_ALIGNMENT: f64 = 0.45;

/// Interference amplitude for iridescent shimmer.
/// 
/// Reduced significantly - the shimmer effect was too aggressive
/// and made images look like cheap holographic stickers.
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_AMPLITUDE: f64 = 0.25;

/// Interference frequency for pearlescent bands.
/// 
/// Lower frequency creates more elegant, less noisy patterns.
pub const DEFAULT_CHAMPLEVE_INTERFERENCE_FREQUENCY: f64 = 18.0;

/// Rim intensity for metallic edge highlights.
/// 
/// Reduced to prevent halos around all edges.
pub const DEFAULT_CHAMPLEVE_RIM_INTENSITY: f64 = 1.2;

/// Rim warmth for golden accent tones.
pub const DEFAULT_CHAMPLEVE_RIM_WARMTH: f64 = 0.55;

/// Rim sharpness for metallic boundary definition.
/// 
/// Lower value for softer, more natural edges.
pub const DEFAULT_CHAMPLEVE_RIM_SHARPNESS: f64 = 3.0;

/// Interior glow for core brightness.
/// 
/// Reduced to prevent washed-out centers.
pub const DEFAULT_CHAMPLEVE_INTERIOR_LIFT: f64 = 0.45;

/// Anisotropy for brushed-metal reflections.
/// 
/// Reduced for subtlety.
pub const DEFAULT_CHAMPLEVE_ANISOTROPY: f64 = 0.55;

/// Centre highlight compression for champlevé cells.
pub const DEFAULT_CHAMPLEVE_CELL_SOFTNESS: f64 = 1.4;

// ========== Aether Effect Constants ==========

/// Filament density for ethereal texture.
/// 
/// Reduced for cleaner appearance - high density creates noise.
pub const DEFAULT_AETHER_FILAMENT_DENSITY: f64 = 55.0;

/// Flow alignment for directional coherence.
/// 
/// Moderate value for organic flow.
pub const DEFAULT_AETHER_FLOW_ALIGNMENT: f64 = 0.65;

/// Scattering strength for volumetric glow.
/// 
/// Reduced for subtle atmospheric effect.
pub const DEFAULT_AETHER_SCATTERING_STRENGTH: f64 = 0.70;

/// Scattering falloff for atmospheric transitions.
pub const DEFAULT_AETHER_SCATTERING_FALLOFF: f64 = 2.2;

/// Iridescence amplitude for chromatic shimmer.
/// 
/// Significantly reduced - high values create garish rainbow effects.
pub const DEFAULT_AETHER_IRIDESCENCE_AMPLITUDE: f64 = 0.30;

/// Iridescence frequency for rainbow band spacing.
/// 
/// Lower frequency for elegant, less noisy patterns.
pub const DEFAULT_AETHER_IRIDESCENCE_FREQUENCY: f64 = 8.0;

/// Caustic strength for light refraction effect.
/// 
/// Reduced for subtle enhancement.
pub const DEFAULT_AETHER_CAUSTIC_STRENGTH: f64 = 0.20;

/// Caustic softness for refraction blur.
pub const DEFAULT_AETHER_CAUSTIC_SOFTNESS: f64 = 4.5;

// ========== Gallery & Regular Mode Constants ==========
//
// Both modes produce high-quality output with different aesthetics:
// - Regular Mode: Clean, elegant, preserving natural trajectory colors
// - Gallery/Special Mode: Enhanced atmospheric presence

/// Palette wave strength for gallery/special mode.
///
/// Reduced from 1.0 - full strength palette waves overwhelm natural colors
/// and create artificial-looking gradients. A moderate value adds cohesion
/// without washing out the beautiful organic spectral colors.
///
/// # Value
///
/// - **0.50** (gallery mode): Balanced enhancement
pub const GALLERY_PALETTE_WAVE_STRENGTH: f64 = 0.50;

/// Palette wave strength for regular mode.
///
/// Very subtle - regular mode should preserve natural trajectory colors
/// as much as possible.
///
/// # Value
///
/// - **0.15** (regular mode): Minimal, nearly invisible
pub const REGULAR_PALETTE_WAVE_STRENGTH: f64 = 0.15;

/// Velocity HDR boost factor for regular mode.
///
/// While gallery/special mode uses full velocity HDR (8.0×), regular mode
/// benefits from a subtle velocity-based brightness enhancement that adds
/// life and dynamism without the dramatic flares.
///
/// # Physical Basis
///
/// Fast-moving celestial bodies create motion blur and light concentration.
/// This subtle effect preserves the geometric elegance of regular mode while
/// adding a hint of physics-based visual interest.
///
/// # Value
///
/// - **3.0** (regular mode): Subtle but perceptible motion enhancement
pub const REGULAR_VELOCITY_HDR_BOOST_FACTOR: f64 = 3.0;

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

// ========== Pass 1 Histogram Constants ==========
//
// Pass 1 exists to compute global exposure levels cheaply and deterministically.
// It should be *much cheaper* than the full Pass 2 render, so we intentionally:
// - sample fewer frames than the full video output
// - sample pixels on a grid (stride) rather than storing every pixel

/// Target number of frames to sample during Pass 1 histogram collection.
///
/// This does NOT affect output video length; it only affects how densely we sample
/// the evolving trajectory for percentile estimation. A few hundred samples are
/// sufficient for stable percentiles while keeping Pass 1 fast.
pub const HISTOGRAM_TARGET_FRAMES: u32 = 240;

/// Default pixel stride for Pass 1 histogram collection (grid sampling).
///
/// A stride of 16 samples ~1/256 of pixels per sampled frame, which is ample for
/// percentile estimation while keeping memory usage very low.
pub const DEFAULT_HISTOGRAM_PIXEL_STRIDE: usize = 16;

// ========== Exposure Normalization Constants ==========

/// Default exposure boost applied after normalization (pre-effects).
///
/// This is tuned to produce a rich working range for finishing effects without
/// crushing midtones or turning the scene into constant bloom.
/// Default exposure boost for normalization.
/// MUSEUM QUALITY: Increased from 2.2 to 3.0 to ensure trajectories are bright enough
/// before effects are applied. This helps prevent dark images.
pub const DEFAULT_EXPOSURE_BOOST: f64 = 3.0;

// ========== Museum-Quality Curation ==========

/// Default number of effect configurations to try for curated gallery output.
pub const DEFAULT_CURATION_K: usize = 8;

// ========== Nebula Background Constants ==========
//
// The nebula is a subtle background layer intended to read as slow, cinematic drift.
// If the time step is too large, the noise "boils" from frame to frame and looks like
// TV static rather than atmospheric depth.

/// Total noise-time span traversed by the nebula across `DEFAULT_TARGET_FRAMES`.
///
/// A span of ~4.0 produces gentle motion over a ~30s / 1800-frame render.
pub const NEBULA_NOISE_TIME_RANGE: f64 = 4.0;

/// Nebula noise time scale per output frame.
///
/// Computed from `NEBULA_NOISE_TIME_RANGE` and `DEFAULT_TARGET_FRAMES` for consistency
/// if target duration changes.
pub const NEBULA_TIME_SCALE: f64 = NEBULA_NOISE_TIME_RANGE / (DEFAULT_TARGET_FRAMES as f64);

/// Default video codec (legacy, no longer used - now using H.265)
#[allow(dead_code)]
pub const DEFAULT_VIDEO_CODEC: &str = "libx264";

/// Default pixel format for compatibility (legacy, no longer used - now using 10-bit formats)
#[allow(dead_code)]
pub const DEFAULT_PIXEL_FORMAT: &str = "yuv420p";

// ========== Simulation Constants ==========

/// Default simulation timestep
pub const DEFAULT_DT: f64 = 0.001;

/// Minimum allowable timestep for adaptive simulation
pub const MIN_DT: f64 = 1e-7;

/// Maximum allowable timestep for adaptive simulation
pub const MAX_DT: f64 = 0.005;

/// Target precision for adaptive time-stepping (lower = more precise)
pub const ADAPTIVE_PRECISION: f64 = 0.015;

/// Kinetic energy factor (1/2 in KE = 1/2 * m * v²)
pub const KINETIC_ENERGY_FACTOR: f64 = 0.5;

// ========== Mathematical Constants ==========

/// Two times PI (full circle in radians)
pub const TWO_PI: f64 = 2.0 * std::f64::consts::PI;

// ========== Tonemapping Constants ==========
// Note: Main tonemapping constants have been moved to render/tonemap.rs

/// Alpha boost factor for trajectory compositing.
///
/// MUSEUM QUALITY: Increased from 1.20 to 1.50 (50% boost) for more visible trajectories.
/// This helps prevent dark images especially in standard mode without nebula backgrounds.
pub const COMPOSITE_ALPHA_BOOST_FACTOR: f64 = 1.50;

/// Saturation boost factor for trajectory compositing (1.20 = 20% more saturated)
pub const COMPOSITE_SATURATION_BOOST_FACTOR: f64 = 1.20;

/// Saturation threshold for compositing (only boost high-alpha pixels)
pub const COMPOSITE_SATURATION_THRESHOLD: f64 = 0.50;

// ========== Drawing Constants ==========

/// Default alpha denominator for standard mode.
///
/// This controls the opacity of each line segment: `alpha = 1 / alpha_denom`.
/// Higher values = more transparent lines (requires more trajectory density).
/// Standard mode uses a higher value for subtle, ethereal results.
pub const DEFAULT_ALPHA_DENOM: usize = 15_000_000;

/// Alpha denominator for gallery/museum quality mode.
///
/// Gallery mode uses a lower denominator (3× brighter) to ensure trajectories
/// are clearly visible even with sparse coverage. This prevents dark/empty images
/// that can occur when trajectory density is low.
///
/// The factor of 3x was chosen because:
/// - It's enough to make sparse trajectories visible
/// - It doesn't blow out dense crossing regions
/// - It works well with the brightness compensation system
pub const GALLERY_ALPHA_DENOM: usize = 5_000_000;

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
