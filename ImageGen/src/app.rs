//! Application orchestration and workflow management
//!
//! This module breaks down the main application flow into clean, focused functions,
//! each with a single responsibility. This improves testability, readability, and
//! maintainability.

use crate::drift::parse_drift_mode;
use crate::drift_config::{resolve_drift_config, ResolvedDriftConfig};
use crate::error::{ConfigError, Result};
use crate::generation_log::{GenerationLogger, GenerationRecord, LoggedRenderConfig, DriftConfig, SimulationConfig, OrbitInfo};
use crate::oklab;
use crate::post_effects;
use crate::render::{
    self, constants, generate_body_color_sequences,
    save_image_as_png, ChannelLevels, DogBloomConfig, RenderConfig,
    VideoEncodingOptions, compute_black_white_gamma,
    pass_1_build_histogram_spectral, pass_2_write_frames_spectral,
    render_single_frame_spectral, create_video_from_frames_singlepass,
};
use crate::sim::{self, Sha3RandomByteStream, Body, TrajectoryResult};
use image::{ImageBuffer, Rgb};
use nalgebra::Vector3;
use std::fs;
use tracing::{info, warn};

/// Application configuration derived from command-line arguments
#[allow(dead_code)] // Some fields used in logging, others reserved for future use
pub struct AppConfig {
    pub seed: String,
    pub file_name: String,
    pub num_sims: usize,
    pub num_steps_sim: usize,
    pub width: u32,
    pub height: u32,
    pub special: bool,
    pub test_frame: bool,
    pub clip_black: f64,
    pub clip_white: f64,
    pub alpha_denom: usize,
    pub escape_threshold: f64,
    pub drift_enabled: bool,
    pub drift_mode: String,
    pub drift_scale: Option<f64>,
    pub drift_arc_fraction: Option<f64>,
    pub drift_orbit_eccentricity: Option<f64>,
    pub profile_tag: String,
    pub bloom_mode: String,
    pub dog_strength: f64,
    pub dog_sigma: Option<f64>,
    pub dog_ratio: f64,
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

/// Initialize application directories
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

/// Parse and validate hex seed
pub fn parse_seed(seed: &str) -> Result<Vec<u8>> {
    let hex_seed = seed.strip_prefix("0x").unwrap_or(seed);
    
    hex::decode(hex_seed).map_err(|e| ConfigError::InvalidSeed {
        seed: seed.to_string(),
        error: e,
    }.into())
}

/// Derive noise seed from simulation seed for nebula generation
pub fn derive_noise_seed(seed_bytes: &[u8]) -> i32 {
    let get_or_zero = |idx| seed_bytes.get(idx).copied().unwrap_or(0);
    i32::from_le_bytes([
        get_or_zero(0),
        get_or_zero(1),
        get_or_zero(2),
        get_or_zero(3),
    ])
}

/// Run Borda selection to find the best orbit
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
pub fn simulate_best_orbit(
    best_bodies: Vec<Body>,
    num_steps_sim: usize,
) -> Vec<Vec<Vector3<f64>>> {
    info!("STAGE 2/7: Re-running best orbit for {} steps...", num_steps_sim);
    let sim_result = sim::get_positions(best_bodies, num_steps_sim);
    info!("   => Done.");
    sim_result.positions
}

/// Apply drift transformation to positions
pub fn apply_drift_transformation(
    positions: &mut [Vec<Vector3<f64>>],
    drift_mode: &str,
    drift_scale: Option<f64>,
    drift_arc_fraction: Option<f64>,
    drift_orbit_eccentricity: Option<f64>,
    rng: &mut Sha3RandomByteStream,
    special: bool,
) -> Option<ResolvedDriftConfig> {
    info!("STAGE 2.5/7: Resolving drift configuration...");
    
    let resolved = resolve_drift_config(
        drift_scale,
        drift_arc_fraction,
        drift_orbit_eccentricity,
        rng,
        special,
    );
    
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
    Some(resolved)
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

/// Create blur configuration based on mode and resolution
pub fn create_blur_config(special: bool, width: u32, height: u32) -> (usize, f64, f64) {
    if special {
        (
            (0.032 * std::cmp::min(width, height) as f64).round() as usize,
            12.0,
            12.0,
        )
    } else {
        (
            (0.014 * std::cmp::min(width, height) as f64).round() as usize,
            7.0,
            7.0,
        )
    }
}

/// Create DoG bloom configuration with resolution-aware sigma
pub fn create_dog_config(
    width: u32,
    height: u32,
    dog_sigma: Option<f64>,
    dog_ratio: f64,
    dog_strength: f64,
) -> DogBloomConfig {
    let sigma = dog_sigma.unwrap_or_else(|| {
        0.0065 * std::cmp::min(width, height) as f64
    });
    
    DogBloomConfig {
        inner_sigma: sigma,
        outer_ratio: dog_ratio,
        strength: dog_strength,
        threshold: 0.01,
    }
}

/// Create perceptual blur configuration
pub fn create_perceptual_blur_config(
    enabled: bool,
    blur_radius_px: usize,
    perceptual_blur_radius: Option<usize>,
    perceptual_blur_strength: f64,
    perceptual_gamut_mode: &str,
) -> Option<post_effects::PerceptualBlurConfig> {
    if !enabled {
        return None;
    }
    
    use oklab::GamutMapMode;
    
    Some(post_effects::PerceptualBlurConfig {
        radius: perceptual_blur_radius.unwrap_or(blur_radius_px),
        strength: perceptual_blur_strength,
        gamut_mode: match perceptual_gamut_mode {
            "clamp" => GamutMapMode::Clamp,
            "soft-clip" => GamutMapMode::SoftClip,
            _ => GamutMapMode::PreserveHue,
        },
    })
}

/// Build histogram and determine color levels
#[allow(clippy::too_many_arguments)] // Necessary for complete rendering configuration
pub fn build_histogram_and_levels(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&post_effects::PerceptualBlurConfig>,
    special: bool,
    noise_seed: i32,
    render_config: &RenderConfig,
    clip_black: f64,
    clip_white: f64,
) -> Result<ChannelLevels> {
    info!("STAGE 5/7: PASS 1 => building global histogram...");
    
    let target_frames = constants::DEFAULT_TARGET_FRAMES;
    let frame_interval = (positions[0].len() / target_frames as usize).max(1);
    
    let mut all_r = Vec::new();
    let mut all_g = Vec::new();
    let mut all_b = Vec::new();
    
    pass_1_build_histogram_spectral(
        positions,
        colors,
        body_alphas,
        width,
        height,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        frame_interval,
        &mut all_r,
        &mut all_g,
        &mut all_b,
        bloom_mode,
        dog_config,
        hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config,
        special,
        noise_seed,
        render_config,
    );
    
    info!("STAGE 6/7: Determine global black/white/gamma...");
    let (black_r, white_r, black_g, white_g, black_b, white_b) = compute_black_white_gamma(
        &mut all_r,
        &mut all_g,
        &mut all_b,
        clip_black,
        clip_white,
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
#[allow(clippy::too_many_arguments)] // Necessary for complete rendering configuration
pub fn render_test_frame(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    levels: &ChannelLevels,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&post_effects::PerceptualBlurConfig>,
    special: bool,
    noise_seed: i32,
    render_config: &RenderConfig,
    output_png: &str,
    best_info: &TrajectoryResult,
) -> Result<()> {
    info!("STAGE 7/7: TEST FRAME MODE => rendering first frame only...");
    
    let test_frame = render_single_frame_spectral(
        positions,
        colors,
        body_alphas,
        width,
        height,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        levels.black[0],
        levels.range[0] + levels.black[0],
        levels.black[1],
        levels.range[1] + levels.black[1],
        levels.black[2],
        levels.range[2] + levels.black[2],
        bloom_mode,
        dog_config,
        hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config,
        special,
        noise_seed,
        render_config,
    )?;
    
    info!("Saving test frame to: {}", output_png);
    save_image_as_png(&test_frame, output_png)?;
    
    info!("✓ Test frame saved successfully!");
    info!(
        "Best orbit => Weighted Borda = {:.3}\nTest complete!",
        best_info.total_score_weighted
    );
    
    Ok(())
}

/// Render full video
#[allow(clippy::too_many_arguments)] // Necessary for complete rendering configuration
pub fn render_video(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    levels: &ChannelLevels,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&post_effects::PerceptualBlurConfig>,
    special: bool,
    noise_seed: i32,
    render_config: &RenderConfig,
    output_vid: &str,
    output_png: &str,
) -> Result<()> {
    info!("STAGE 7/7: PASS 2 => final frames => video...");
    
    let frame_rate = constants::DEFAULT_VIDEO_FPS;
    let target_frames = constants::DEFAULT_TARGET_FRAMES;
    let frame_interval = (positions[0].len() / target_frames as usize).max(1);
    
    let mut last_frame_png: Option<ImageBuffer<Rgb<u8>, Vec<u8>>> = None;
    let video_options = VideoEncodingOptions::default();
    
    create_video_from_frames_singlepass(
        width,
        height,
        frame_rate,
        |out| {
            pass_2_write_frames_spectral(
                positions,
                colors,
                body_alphas,
                width,
                height,
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
                frame_interval,
                levels.black[0],
                levels.range[0] + levels.black[0],
                levels.black[1],
                levels.range[1] + levels.black[1],
                levels.black[2],
                levels.range[2] + levels.black[2],
                bloom_mode,
                dog_config,
                hdr_mode,
                perceptual_blur_enabled,
                perceptual_blur_config,
                special,
                noise_seed,
                |buf_8bit| {
                    out.write_all(buf_8bit).map_err(render::error::RenderError::VideoEncoding)?;
                    Ok(())
                },
                &mut last_frame_png,
                render_config,
            )?;
            Ok(())
        },
        output_vid,
        &video_options,
    )?;
    
    // Save final frame
    if let Some(last_frame) = last_frame_png {
        info!("Attempting to save PNG to: {}", output_png);
        save_image_as_png(&last_frame, output_png)?;
    } else {
        warn!("Warning: No final frame was generated to save as PNG.");
    }
    
    Ok(())
}

/// Log generation parameters for reproducibility
pub fn log_generation(
    config: &AppConfig,
    file_name: &str,
    seed: &str,
    drift_config: &Option<ResolvedDriftConfig>,
    num_sims: usize,
    best_info: &TrajectoryResult,
) {
    let logger = GenerationLogger::new();
    
    let mut record = GenerationRecord::new(
        file_name.to_string(),
        format!("0x{}", seed),
        config.special,
    );
    
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
    
    logger.log_generation(record);
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn test_create_blur_config_standard() {
        let (radius, strength, brightness) = create_blur_config(false, 1920, 1080);
        assert_eq!(radius, (0.014_f64 * 1080.0).round() as usize);
        assert_eq!(strength, 7.0);
        assert_eq!(brightness, 7.0);
    }

    #[test]
    fn test_create_blur_config_special() {
        let (radius, strength, brightness) = create_blur_config(true, 1920, 1080);
        assert_eq!(radius, (0.032_f64 * 1080.0).round() as usize);
        assert_eq!(strength, 12.0);
        assert_eq!(brightness, 12.0);
    }
}

