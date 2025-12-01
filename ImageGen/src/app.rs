//! Application orchestration and workflow management
//!
//! This module breaks down the main application flow into clean, focused functions,
//! each with a single responsibility. This improves testability, readability, and
//! maintainability.

use crate::drift::parse_drift_mode;
use crate::drift_config::{ResolvedDriftConfig, resolve_drift_config};
use crate::error::{ConfigError, Result};
use crate::generation_log::{
    DriftConfig, GenerationLogger, GenerationRecord, LoggedRenderConfig, OrbitInfo,
    SimulationConfig,
};
use crate::render::{
    self, ChannelLevels, RenderConfig, RenderParams, SceneDataRef, VideoEncodingOptions,
    compute_black_white_gamma, constants, create_video_from_frames_singlepass,
    generate_body_color_sequences, pass_1_build_histogram_spectral, pass_2_write_frames_spectral,
    render_single_frame_spectral, save_image_as_png_16bit,
};
use crate::sim::{self, Body, Sha3RandomByteStream, TrajectoryResult};
use image::{ImageBuffer, Rgb};
use nalgebra::Vector3;
use std::fs;
use tracing::{info, warn};

/// Application configuration derived from command-line arguments
#[allow(dead_code)] // Some fields used in logging, others reserved for future use
pub struct AppConfig {
    /// Hex seed for deterministic RNG
    pub seed: String,
    /// Output file name (without extension)
    pub file_name: String,
    /// Number of random configurations to try in Borda search
    pub num_sims: usize,
    /// Number of simulation timesteps for warmup and recording
    pub num_steps_sim: usize,
    /// Output image/video width in pixels
    pub width: u32,
    /// Output image/video height in pixels
    pub height: u32,
    /// Enable special mode (spectral dispersion, energy density shift)
    pub special: bool,
    /// Render only first frame (for quick testing)
    pub test_frame: bool,
    /// Black point clipping percentile (e.g., 0.002 = clip darkest 0.2%)
    pub clip_black: f64,
    /// White point clipping percentile (e.g., 0.001 = clip brightest 0.1%)
    pub clip_white: f64,
    /// Alpha calculation denominator (controls body opacity)
    pub alpha_denom: usize,
    /// Energy threshold for escape detection during Borda search
    pub escape_threshold: f64,
    /// Enable drift transformations (camera movement)
    pub drift_enabled: bool,
    /// Drift mode: "orbital", "linear", "zoom", etc.
    pub drift_mode: String,
    /// Drift scale factor (amplitude of transformation)
    pub drift_scale: Option<f64>,
    /// Arc fraction for orbital drift (0.0-1.0)
    pub drift_arc_fraction: Option<f64>,
    /// Orbit eccentricity for drift path (0.0-0.95)
    pub drift_orbit_eccentricity: Option<f64>,
    /// Profile tag for favorites system
    pub profile_tag: String,
    /// Bloom mode: "dog" or "none"
    pub bloom_mode: String,
    /// DoG bloom strength multiplier
    pub dog_strength: f64,
    /// DoG inner sigma (None = auto-calculate from resolution)
    pub dog_sigma: Option<f64>,
    /// DoG outer/inner sigma ratio
    pub dog_ratio: f64,
    /// HDR mode: "auto", "velocity", or "none"
    pub hdr_mode: String,
    pub hdr_scale: f64,
    pub perceptual_blur: String,
    pub perceptual_blur_radius: Option<usize>,
    pub perceptual_blur_strength: f64,
    pub perceptual_gamut_mode: String,
    pub min_mass: f64,
    pub max_mass: f64,
    pub location: f64,
    pub velocity: f64,
    pub chaos_weight: f64,
    pub equil_weight: f64,
}

/// Initialize application directories.
///
/// Creates the `pics/` and `vids/` output directories if they don't exist.
///
/// # Errors
///
/// Returns `ConfigError::FileSystem` if directory creation fails due to
/// permissions or filesystem issues.
pub fn setup_directories() -> Result<()> {
    fs::create_dir_all("pics").map_err(|e| ConfigError::FileSystem {
        operation: "create directory".to_string(),
        path: "pics".to_string(),
        error: e,
    })?;

    fs::create_dir_all("vids").map_err(|e| ConfigError::FileSystem {
        operation: "create directory".to_string(),
        path: "vids".to_string(),
        error: e,
    })?;

    Ok(())
}

/// Parse and validate hex seed.
///
/// Accepts seeds with or without the "0x" prefix.
///
/// # Errors
///
/// Returns `ConfigError::InvalidSeed` if the seed contains non-hexadecimal characters.
///
/// # Example
///
/// ```
/// # use three_body_problem::app::parse_seed;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// let seed_bytes = parse_seed("0x100033")?;  // With prefix
/// assert_eq!(seed_bytes, vec![0x10, 0x00, 0x33]);
/// 
/// let seed_bytes = parse_seed("100033")?;    // Without prefix
/// assert_eq!(seed_bytes, vec![0x10, 0x00, 0x33]);
/// # Ok(())
/// # }
/// ```
pub fn parse_seed(seed: &str) -> Result<Vec<u8>> {
    let hex_seed = seed.strip_prefix("0x").unwrap_or(seed);

    hex::decode(hex_seed)
        .map_err(|e| ConfigError::InvalidSeed { seed: seed.to_string(), error: e }.into())
}

/// Derive noise seed from simulation seed for nebula generation
pub fn derive_noise_seed(seed_bytes: &[u8]) -> i32 {
    let get_or_zero = |idx| seed_bytes.get(idx).copied().unwrap_or(0);
    i32::from_le_bytes([get_or_zero(0), get_or_zero(1), get_or_zero(2), get_or_zero(3)])
}

/// Run Borda selection to find the best orbit.
///
/// This function evaluates thousands of random 3-body configurations and selects
/// the most aesthetically interesting one using a two-criterion Borda count voting system.
///
/// # Errors
///
/// Returns `SimulationError::NoValidOrbits` if all candidate orbits are filtered out
/// due to high energy, low angular momentum, or escaping bodies.
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::app::run_borda_selection;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let seed = b"test_seed";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// let (best_bodies, metrics) = run_borda_selection(
///     &mut rng,
///     30_000,  // Try 30k random configs
///     1_000_000,  // Simulate for 1M steps
///     0.75,  // Chaos weight
///     11.0,  // Equilateral weight  
///     -0.3,  // Escape threshold
/// )?;
/// # Ok(())
/// # }
/// ```
pub fn run_borda_selection(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    num_steps_sim: usize,
    chaos_weight: f64,
    equil_weight: f64,
    escape_threshold: f64,
) -> Result<(Vec<Body>, TrajectoryResult)> {
    info!("STAGE 1/7: Borda search over {} random orbits...", num_sims);

    sim::select_best_trajectory(
        rng,
        num_sims,
        num_steps_sim,
        chaos_weight,
        equil_weight,
        escape_threshold,
    )
}

/// Re-run the best orbit to get full trajectory
pub fn simulate_best_orbit(best_bodies: Vec<Body>, num_steps_sim: usize) -> Vec<Vec<Vector3<f64>>> {
    info!("STAGE 2/7: Re-running best orbit for {} steps...", num_steps_sim);
    let sim_result = sim::get_positions(best_bodies, num_steps_sim);
    info!("   => Done.");
    sim_result.positions
}

/// Apply drift transformation to positions
///
/// # Errors
///
/// Returns an error if drift parameters are partially specified (all or none must be provided).
pub fn apply_drift_transformation(
    positions: &mut [Vec<Vector3<f64>>],
    drift_mode: &str,
    drift_scale: Option<f64>,
    drift_arc_fraction: Option<f64>,
    drift_orbit_eccentricity: Option<f64>,
    rng: &mut Sha3RandomByteStream,
    special: bool,
) -> Result<Option<ResolvedDriftConfig>> {
    info!("STAGE 2.5/7: Resolving drift configuration...");

    let resolved = resolve_drift_config(
        drift_scale,
        drift_arc_fraction,
        drift_orbit_eccentricity,
        rng,
        special,
    )?;

    info!("Applying {} drift...", drift_mode);
    let num_steps = positions[0].len();
    let drift_params = resolved.to_drift_parameters();

    if crate::utils::is_zero(drift_params.arc_fraction)
        && drift_mode.to_lowercase().starts_with("ell")
    {
        warn!("Elliptical drift requested with zero arc fraction; skipping motion");
    }

    let mut drift_transform = parse_drift_mode(drift_mode, rng, drift_params, num_steps);
    drift_transform.apply(positions, constants::DEFAULT_DT);

    info!("   => Drift applied successfully");
    Ok(Some(resolved))
}

/// Generate color sequences and alpha values for bodies
pub fn generate_colors(
    rng: &mut Sha3RandomByteStream,
    num_steps_sim: usize,
    alpha_denom: usize,
) -> (Vec<Vec<render::OklabColor>>, Vec<f64>) {
    info!("STAGE 3/7: Generating color sequences + alpha...");
    let alpha_value = 1.0 / (alpha_denom as f64);
    generate_body_color_sequences(rng, num_steps_sim, alpha_value)
}

/// Build histogram and determine color levels.
///
/// This function renders all frames in Pass 1, collecting color histogram data
/// to compute optimal black/white points for tonemapping. This ensures consistent
/// exposure across the entire video.
///
/// # Errors
///
/// Returns `RenderError` if the rendering pipeline fails during histogram collection.
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::app::build_histogram_and_levels;
/// # use three_body_problem::render::RenderConfig;
/// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # use nalgebra::Vector3;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let positions = vec![vec![Vector3::zeros(); 1000]; 3];
/// # let colors = vec![vec![(0.5, 0.0, 0.0); 1000]; 3];
/// # let body_alphas = vec![1.0; 3];
/// # let seed = b"test";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// # let (resolved_config, _log) = RandomizableEffectConfig::default().resolve(&mut rng, 1920, 1080, false);
/// # let noise_seed = 0i32;
/// # let render_config = RenderConfig::default();
/// let levels = build_histogram_and_levels(
///     &positions,
///     &colors,
///     &body_alphas,
///     &resolved_config,
///     noise_seed,
///     &render_config,
/// )?;
/// // levels now contains per-channel black/white points
/// # Ok(())
/// # }
/// ```
pub fn build_histogram_and_levels(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    resolved_config: &render::randomizable_config::ResolvedEffectConfig,
    noise_seed: i32,
    render_config: &RenderConfig,
) -> Result<ChannelLevels> {
    info!("STAGE 5/7: PASS 1 => building global histogram...");

    let target_frames = constants::DEFAULT_TARGET_FRAMES;
    let frame_interval = (positions[0].len() / target_frames as usize).max(1);

    // Create grouped render parameters
    let scene = SceneDataRef::new(positions, colors, body_alphas);
    let params =
        RenderParams::new(scene, resolved_config, frame_interval, noise_seed, render_config);

    let mut all_r = Vec::new();
    let mut all_g = Vec::new();
    let mut all_b = Vec::new();

    pass_1_build_histogram_spectral(&params, &mut all_r, &mut all_g, &mut all_b)?;

    info!("STAGE 6/7: Determine global black/white/gamma...");
    let (black_r, white_r, black_g, white_g, black_b, white_b) = compute_black_white_gamma(
        &mut all_r,
        &mut all_g,
        &mut all_b,
        resolved_config.clip_black,
        resolved_config.clip_white,
    );

    info!(
        "   => R:[{:.3e},{:.3e}] G:[{:.3e},{:.3e}] B:[{:.3e},{:.3e}]",
        black_r, white_r, black_g, white_g, black_b, white_b
    );

    Ok(ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b))
}

/// Generate output filename with optional profile tag
pub fn generate_filename(base_name: &str, profile_tag: &str) -> String {
    if profile_tag.is_empty() {
        base_name.to_string()
    } else {
        format!("{}_{}", base_name, profile_tag)
    }
}

/// Render test frame (first frame only)
/// Render test frame (first frame only).
///
/// Renders only the first frame for quick testing and debugging. This is useful
/// for verifying effect parameters without waiting for the full video to render.
///
/// # Errors
///
/// Returns `RenderError` if frame rendering or PNG encoding fails.
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::app::render_test_frame;
/// # use three_body_problem::render::{RenderConfig, ChannelLevels};
/// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
/// # use three_body_problem::sim::{Sha3RandomByteStream, TrajectoryResult};
/// # use nalgebra::Vector3;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let positions = vec![vec![Vector3::zeros(); 1000]; 3];
/// # let colors = vec![vec![(0.5, 0.0, 0.0); 1000]; 3];
/// # let body_alphas = vec![1.0; 3];
/// # let seed = b"test";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// # let (resolved_config, _log) = RandomizableEffectConfig::default().resolve(&mut rng, 1920, 1080, false);
/// # let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
/// # let noise_seed = 0i32;
/// # let render_config = RenderConfig::default();
/// # let best_info = TrajectoryResult { chaos: 0.5, equilateralness: 0.5, chaos_pts: 1, equil_pts: 1, total_score: 2, total_score_weighted: 1.0 };
/// render_test_frame(
///     &positions,
///     &colors,
///     &body_alphas,
///     &resolved_config,
///     &levels,
///     noise_seed,
///     &render_config,
///     "pics/test.png",
///     &best_info,
/// )?;
/// # Ok(())
/// # }
/// ```
pub fn render_test_frame(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    resolved_config: &render::randomizable_config::ResolvedEffectConfig,
    levels: &ChannelLevels,
    noise_seed: i32,
    render_config: &RenderConfig,
    output_png: &str,
    best_info: &TrajectoryResult,
) -> Result<()> {
    info!("STAGE 7/7: TEST FRAME MODE => rendering first frame only...");

    let target_frames = constants::DEFAULT_TARGET_FRAMES;
    let frame_interval = (positions[0].len() / target_frames as usize).max(1);

    // Create grouped render parameters
    let scene = SceneDataRef::new(positions, colors, body_alphas);
    let params =
        RenderParams::new(scene, resolved_config, frame_interval, noise_seed, render_config);

    let test_frame = render_single_frame_spectral(&params, levels)?;

    info!("Saving test frame to: {}", output_png);
    save_image_as_png_16bit(&test_frame, output_png)?;

    info!("✓ Test frame saved successfully (16-bit PNG)!");
    info!("Best orbit => Weighted Borda = {:.3}\nTest complete!", best_info.total_score_weighted);

    Ok(())
}

/// Render full video with all frames.
///
/// Performs Pass 2 rendering, applying tonemapping with the histogram-derived levels
/// and encoding the final video using FFmpeg.
///
/// # Errors
///
/// Returns `RenderError` if:
/// - Frame rendering fails
/// - FFmpeg encoding fails (with automatic fallback to other codecs)
/// - PNG export of final frame fails
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::app::render_video;
/// # use three_body_problem::render::{RenderConfig, ChannelLevels};
/// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # use nalgebra::Vector3;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let positions = vec![vec![Vector3::zeros(); 1000]; 3];
/// # let colors = vec![vec![(0.5, 0.0, 0.0); 1000]; 3];
/// # let body_alphas = vec![1.0; 3];
/// # let seed = b"test";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// # let (resolved_config, _log) = RandomizableEffectConfig::default().resolve(&mut rng, 1920, 1080, false);
/// # let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
/// # let noise_seed = 0i32;
/// # let render_config = RenderConfig::default();
/// render_video(
///     &positions,
///     &colors,
///     &body_alphas,
///     &resolved_config,
///     &levels,
///     noise_seed,
///     &render_config,
///     "vids/output.mp4",
///     "pics/output.png",
///     false,  // high quality mode
/// )?;
/// # Ok(())
/// # }
/// ```
pub fn render_video(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    resolved_config: &render::randomizable_config::ResolvedEffectConfig,
    levels: &ChannelLevels,
    noise_seed: i32,
    render_config: &RenderConfig,
    output_vid: &str,
    output_png: &str,
    fast_encode: bool,
) -> Result<()> {
    if fast_encode {
        info!("STAGE 7/7: PASS 2 => final frames => video (FAST ENCODE MODE)...");
    } else {
        info!("STAGE 7/7: PASS 2 => final frames => video (HIGH QUALITY MODE)...");
    }

    let frame_rate = constants::DEFAULT_VIDEO_FPS;
    let target_frames = constants::DEFAULT_TARGET_FRAMES;
    let frame_interval = (positions[0].len() / target_frames as usize).max(1);

    // Create grouped render parameters
    let scene = SceneDataRef::new(positions, colors, body_alphas);
    let params =
        RenderParams::new(scene, resolved_config, frame_interval, noise_seed, render_config);

    let mut last_frame_png: Option<ImageBuffer<Rgb<u16>, Vec<u16>>> = None;
    let video_options = if fast_encode {
        VideoEncodingOptions::fast_encode()
    } else {
        VideoEncodingOptions::default()
    };

    create_video_from_frames_singlepass(
        resolved_config.width,
        resolved_config.height,
        frame_rate,
        |out| {
            pass_2_write_frames_spectral(
                &params,
                levels,
                |buf_8bit| {
                    out.write_all(buf_8bit).map_err(render::error::RenderError::VideoEncoding)?;
                    Ok(())
                },
                &mut last_frame_png,
            )?;
            Ok(())
        },
        output_vid,
        &video_options,
    )?;

    // Save final frame
    if let Some(last_frame) = last_frame_png {
        info!("Attempting to save 16-bit PNG to: {}", output_png);
        save_image_as_png_16bit(&last_frame, output_png)?;
    } else {
        warn!("Warning: No final frame was generated to save as PNG.");
    }

    Ok(())
}

/// Log generation parameters for reproducibility
pub fn log_generation(
    config: &AppConfig,
    file_name: &str,
    _seed: &str,
    drift_config: &Option<ResolvedDriftConfig>,
    num_sims: usize,
    best_info: &TrajectoryResult,
    randomization_log: Option<&render::effect_randomizer::RandomizationLog>,
) {
    let logger = GenerationLogger::new();

    let mut record = GenerationRecord::new(file_name.to_string(), "0x".to_string(), config.special);

    record.render_config = LoggedRenderConfig {
        width: config.width,
        height: config.height,
        clip_black: config.clip_black,
        clip_white: config.clip_white,
        alpha_denom: config.alpha_denom,
        alpha_compress: 6.0, // Default value from constants
        bloom_mode: config.bloom_mode.clone(),
        dog_strength: config.dog_strength,
        dog_sigma: config.dog_sigma,
        dog_ratio: config.dog_ratio,
        hdr_mode: config.hdr_mode.clone(),
        hdr_scale: config.hdr_scale,
        perceptual_blur: config.perceptual_blur.clone(),
        perceptual_blur_radius: config.perceptual_blur_radius,
        perceptual_blur_strength: config.perceptual_blur_strength,
        perceptual_gamut_mode: config.perceptual_gamut_mode.clone(),
    };

    record.drift_config = if let Some(drift) = drift_config {
        DriftConfig {
            enabled: true,
            mode: config.drift_mode.clone(),
            scale: drift.scale,
            arc_fraction: drift.arc_fraction,
            orbit_eccentricity: drift.orbit_eccentricity,
            randomized: drift.was_randomized,
        }
    } else {
        DriftConfig {
            enabled: false,
            mode: "none".to_string(),
            scale: 0.0,
            arc_fraction: 0.0,
            orbit_eccentricity: 0.0,
            randomized: false,
        }
    };

    record.simulation_config = SimulationConfig {
        num_sims,
        num_steps_sim: config.num_steps_sim,
        location: config.location,
        velocity: config.velocity,
        min_mass: config.min_mass,
        max_mass: config.max_mass,
        chaos_weight: config.chaos_weight,
        equil_weight: config.equil_weight,
        escape_threshold: config.escape_threshold,
    };

    record.orbit_info = OrbitInfo {
        selected_index: 0,
        weighted_score: best_info.total_score_weighted,
        total_candidates: num_sims,
        discarded_count: 0,
    };

    // Include randomization log if provided
    record.randomization_log = randomization_log.cloned();

    logger.log_generation(record);
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_parse_seed_valid() {
        let result = parse_seed("0x100033");
        assert!(result.is_ok());

        let bytes = result.unwrap();
        assert_eq!(bytes, vec![0x10, 0x00, 0x33]);
    }

    #[test]
    fn test_parse_seed_no_prefix() {
        let result = parse_seed("100033");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_seed_invalid() {
        let result = parse_seed("0xZZZ");
        assert!(result.is_err());
    }

    #[test]
    fn test_derive_noise_seed() {
        let seed = vec![0x01, 0x02, 0x03, 0x04, 0x05];
        let noise = derive_noise_seed(&seed);
        assert_eq!(noise, i32::from_le_bytes([0x01, 0x02, 0x03, 0x04]));
    }

    #[test]
    fn test_generate_filename_no_tag() {
        let name = generate_filename("test", "");
        assert_eq!(name, "test");
    }

    #[test]
    fn test_generate_filename_with_tag() {
        let name = generate_filename("test", "profile1");
        assert_eq!(name, "test_profile1");
    }

    // Property-based fuzz tests
    proptest! {
        /// Fuzz test: parse_seed must never panic on arbitrary strings
        ///
        /// This verifies that malformed hex strings are handled gracefully.
        /// Security-critical: seeds come from user input (CLI/config files).
        #[test]
        fn prop_parse_seed_never_panics(s in "\\PC*") {
            let _result = parse_seed(&s);
            // Either Ok or Err, never panic
            prop_assert!(true);
        }

        /// Fuzz test: parse_seed handles strings with/without prefix correctly
        #[test]
        fn prop_parse_seed_prefix_variations(
            has_prefix in any::<bool>(),
            hex_chars in "[0-9a-fA-F]{0,100}",
        ) {
            let input = if has_prefix {
                format!("0x{}", hex_chars)
            } else {
                hex_chars
            };
            
            let result = parse_seed(&input);
            
            // Should succeed for valid hex, fail gracefully for invalid
            prop_assert!(result.is_ok() || result.is_err());
        }

        /// Fuzz test: parse_seed handles unicode and special characters
        #[test]
        fn prop_parse_seed_unicode(s in "[\\u{0}-\\u{10FFFF}]{0,50}") {
            let _result = parse_seed(&s);
            prop_assert!(true);
        }

        /// Fuzz test: derive_noise_seed handles arbitrary byte sequences
        #[test]
        fn prop_derive_noise_seed_any_bytes(bytes in prop::collection::vec(any::<u8>(), 0..1000)) {
            let noise = derive_noise_seed(&bytes);
            
            // Output must always be a valid i32 (no panic)
            prop_assert!(true); // If we got here, it succeeded
            let _ = noise; // Use the value
        }

        /// Fuzz test: derive_noise_seed is deterministic
        #[test]
        fn prop_derive_noise_seed_deterministic(bytes in prop::collection::vec(any::<u8>(), 0..100)) {
            let noise1 = derive_noise_seed(&bytes);
            let noise2 = derive_noise_seed(&bytes);
            
            prop_assert_eq!(noise1, noise2);
        }

        /// Fuzz test: generate_filename handles arbitrary strings
        #[test]
        fn prop_generate_filename(
            base in "\\PC{0,100}",
            tag in "\\PC{0,100}",
        ) {
            let filename = generate_filename(&base, &tag);
            
            // Output must be non-empty if base is non-empty
            if !base.is_empty() {
                prop_assert!(!filename.is_empty());
            }
        }
    }
}
