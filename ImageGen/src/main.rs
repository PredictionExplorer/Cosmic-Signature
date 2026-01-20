use clap::Parser;
use std::error::Error;
use std::fs;
use serde::Serialize;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

mod analysis;
mod config;
mod drift;
mod oklab;
mod optim;
mod post_effects;
mod render;
mod sim;
mod spectrum;
mod utils;

use analysis::AestheticWeights;
use drift::*;
use render::constants;
use render::*;
use sim::*;
use utils::*;

#[derive(Serialize)]
struct ScoreMetadata {
    total_weighted: f64,
    chaos: f64,
    equilateralness: f64,
    golden_ratio: f64,
    negative_space: f64,
    symmetry: f64,
    density: f64,
}

#[derive(Serialize)]
struct TimeDilationMetadata {
    enabled: bool,
    min_dt_factor: f64,
    threshold_distance: f64,
    strength: f64,
}

#[derive(Serialize)]
struct CameraMetadata {
    azimuth_deg: f64,
    elevation_deg: f64,
    roll_deg: f64,
    distance: f64,
    fov_y_deg: f64,
    projection: String,
    fit_padding: f64,
}

#[derive(Serialize)]
struct DriftMetadata {
    mode: String,
    scale: f64,
    arc_fraction: f64,
    orbit_eccentricity: f64,
    enabled: bool,
}

#[derive(Serialize)]
struct RunMetadata {
    file_name: String,
    seed: String,
    output_png: String,
    output_exr: Option<String>,
    width: u32,
    height: u32,
    num_steps: usize,
    frame_interval: usize,
    aesthetic_preset: String,
    style_preset: String,
    png_bit_depth: u16,
    write_exr: bool,
    scores: ScoreMetadata,
    time_dilation: TimeDilationMetadata,
    camera: CameraMetadata,
    drift: DriftMetadata,
}

/// Command-line arguments
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "
Simulate random 3-body orbits, choose the best via Borda, 
then generate a single image + MP4. 
Also discards orbits that appear to have an escaping body."
)]
struct Args {
    #[arg(long, default_value = "0x100033")]
    seed: String,

    #[arg(long, default_value = "output")]
    file_name: String,

    #[arg(long)]
    num_sims: Option<usize>,

    #[arg(long, default_value_t = 1_000_000)]
    num_steps_sim: usize,

    /// Enable adaptive time dilation for close encounters
    #[arg(long)]
    time_dilation: bool,

    /// Minimum timestep factor for adaptive time dilation
    #[arg(long, default_value_t = 0.1)]
    time_dilation_min_dt_factor: f64,

    /// Distance threshold for adaptive time dilation
    #[arg(long, default_value_t = 0.5)]
    time_dilation_threshold: f64,

    /// Strength of adaptive time dilation
    #[arg(long, default_value_t = 2.0)]
    time_dilation_strength: f64,

    #[arg(long, default_value_t = 300.0)]
    location: f64,

    #[arg(long, default_value_t = 1.0)]
    velocity: f64,

    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,

    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    #[arg(long)]
    chaos_weight: Option<f64>,

    #[arg(long)]
    equil_weight: Option<f64>,

    /// Aesthetic preset: default or gallery
    #[arg(long)]
    aesthetic_preset: Option<String>,

    /// Style preset: default, ethereal, metallic, astral, minimal
    #[arg(long)]
    style_preset: Option<String>,

    /// Optional TOML config path
    #[arg(long)]
    config: Option<String>,

    /// Golden ratio composition weight
    #[arg(long)]
    golden_weight: Option<f64>,

    /// Negative space weight
    #[arg(long)]
    negative_weight: Option<f64>,

    /// Symmetry weight
    #[arg(long)]
    symmetry_weight: Option<f64>,

    /// Density balance weight
    #[arg(long)]
    density_weight: Option<f64>,

    #[arg(long, default_value_t = 1920)]
    width: u32,

    #[arg(long, default_value_t = 1080)]
    height: u32,

    /// Camera azimuth angle in degrees (rotation around Z)
    #[arg(long, default_value_t = constants::DEFAULT_CAMERA_AZIMUTH_DEG)]
    camera_azimuth: f64,

    /// Camera elevation angle in degrees (tilt from XY plane)
    #[arg(long, default_value_t = constants::DEFAULT_CAMERA_ELEVATION_DEG)]
    camera_elevation: f64,

    /// Camera roll angle in degrees
    #[arg(long, default_value_t = constants::DEFAULT_CAMERA_ROLL_DEG)]
    camera_roll: f64,

    /// Camera distance multiplier relative to scene radius
    #[arg(long, default_value_t = constants::DEFAULT_CAMERA_DISTANCE)]
    camera_distance: f64,

    /// Camera vertical field of view (degrees)
    #[arg(long, default_value_t = constants::DEFAULT_CAMERA_FOV_DEG)]
    camera_fov: f64,

    /// Projection mode: perspective or orthographic
    #[arg(long, default_value = "perspective")]
    camera_projection: String,

    /// Padding applied to projected bounds (fraction of extent)
    #[arg(long, default_value_t = constants::DEFAULT_CAMERA_FIT_PADDING)]
    camera_fit_padding: f64,

    /// Depth cue strength for alpha modulation (0 = off)
    #[arg(long, default_value_t = constants::DEFAULT_DEPTH_CUE_STRENGTH)]
    depth_cue_strength: f64,

    /// Depth cue gamma for nearness weighting
    #[arg(long, default_value_t = constants::DEFAULT_DEPTH_CUE_GAMMA)]
    depth_cue_gamma: f64,

    /// Minimum depth scale (farther points never drop below this)
    #[arg(long, default_value_t = constants::DEFAULT_DEPTH_CUE_MIN_SCALE)]
    depth_cue_min_scale: f64,

    /// Lower percentile for clamping
    #[arg(long, default_value_t = 0.005)]
    clip_black: f64,

    /// Upper percentile for clamping
    #[arg(long, default_value_t = 0.995)]
    clip_white: f64,

    #[arg(long, default_value_t = false)]
    special: bool,

    /// Denominator for alpha used in drawing lines
    #[arg(long, default_value_t = 10_000_000)]
    alpha_denom: usize,

    /// If body's energy in COM frame is above this, treat as escaping
    #[arg(long, default_value_t = -0.3)]
    escape_threshold: f64,

    /// Strength of density-aware alpha compression (0 = off)
    #[arg(long, default_value_t = 6.0)]
    alpha_compress: f64,

    /// Disable drift motion (drift is enabled by default)
    #[arg(long, default_value_t = false)]
    no_drift: bool,

    /// Drift mode: linear, brownian, elliptical
    #[arg(long, default_value = "elliptical")]
    drift_mode: String,

    /// Scale of drift motion (relative to system size)
    #[arg(long, default_value_t = 1.0)]
    drift_scale: f64,

    /// Fraction of the orbit to traverse when using elliptical drift (0-1)
    #[arg(long, default_value_t = 0.25)]
    drift_arc_fraction: f64,

    /// Orbit eccentricity when using elliptical drift (0-0.95)
    #[arg(long, default_value_t = 0.2)]
    drift_orbit_eccentricity: f64,

    /// Profile tag to append to output filenames
    #[arg(long, default_value = "")]
    profile_tag: String,

    /// PNG-only mode: skip video encoding, only output final frame
    #[arg(long, default_value_t = false)]
    png_only: bool,

    /// Fast mode: reduces simulation steps and candidate count for quick previews
    #[arg(long, default_value_t = false)]
    fast: bool,

    /// Bloom mode: gaussian or dog
    #[arg(long, default_value = "dog")]
    bloom_mode: String,

    /// DoG bloom strength (0.1-1.0)
    #[arg(long, default_value_t = 0.35)]
    dog_strength: f64,

    /// DoG inner sigma in pixels
    #[arg(long, default_value_t = 6.0)]
    dog_sigma: f64,

    /// DoG outer/inner sigma ratio
    #[arg(long, default_value_t = 2.5)]
    dog_ratio: f64,

    /// HDR mode: off or auto
    #[arg(long, default_value = "auto")]
    hdr_mode: String,

    /// HDR scale multiplier for line alpha
    #[arg(long, default_value_t = 0.15)]
    hdr_scale: f64,

    /// Enable perceptual blur in OKLab space: off or on
    #[arg(long, default_value = "on")]
    perceptual_blur: String,

    /// Perceptual blur radius (pixels), defaults to main blur radius
    #[arg(long)]
    perceptual_blur_radius: Option<usize>,

    /// Perceptual blur strength (0.0-1.0)
    #[arg(long, default_value_t = 0.5)]
    perceptual_blur_strength: f64,

    /// Gamut mapping mode for perceptual blur: clamp, preserve-hue, soft-clip
    #[arg(long, default_value = "preserve-hue")]
    perceptual_gamut_mode: String,

    /// Output logs in JSON format
    #[arg(long)]
    json_logs: bool,

    /// Enable parallel accumulation for final stills (memory heavy)
    #[arg(long)]
    parallel_accumulation: bool,

    /// PNG bit depth for still output (8 or 16)
    #[arg(long, default_value_t = 16)]
    png_bit_depth: u16,

    /// Also write linear 32-bit EXR for still output
    #[arg(long)]
    write_exr: bool,

    /// Set log level (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    log_level: String,
}

fn setup_logging(json: bool, level: &str) {
    let env_filter = EnvFilter::try_new(level).unwrap_or_else(|_| EnvFilter::new("info"));

    if json {
        // Structured logging in key=value format (JSON feature not available)
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_target(false)
            .with_thread_ids(false)
            .with_level(true)
            .with_ansi(false)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_target(false)
            .with_thread_ids(false)
            .init();
    }
}

fn main() -> std::result::Result<(), Box<dyn Error>> {
    let args = Args::parse();

    // Initialize tracing with configuration
    setup_logging(args.json_logs, &args.log_level);

    let file_config = if let Some(path) = &args.config {
        match config::load_config(path) {
            Ok(cfg) => Some(cfg),
            Err(err) => {
                warn!("Failed to load config {}: {}", path, err);
                None
            }
        }
    } else {
        None
    };

    // Determine number of simulations based on mode
    let num_sims = match args.num_sims {
        Some(val) => val,
        None => {
            if args.fast {
                500 // Fast mode: reduced candidates
            } else if args.special {
                100_000
            } else {
                100_000
            }
        }
    };

    // Adjust simulation steps in fast mode
    let num_steps_sim = if args.fast && args.num_steps_sim == 1_000_000 {
        100_000 // Fast mode: reduced steps (only if using default)
    } else {
        args.num_steps_sim
    };

    if args.fast {
        info!("Running in FAST mode: reduced candidates ({}) and steps ({})", num_sims, num_steps_sim);
    }

    if args.png_only {
        info!("Running in PNG-ONLY mode: skipping video encoding");
    }

    // Create pics and vids directories
    fs::create_dir_all("pics")?;
    fs::create_dir_all("vids")?;

    let width = args.width;
    let height = args.height;

    let projection = match args.camera_projection.to_lowercase().as_str() {
        "orthographic" | "ortho" => render::ProjectionMode::Orthographic,
        _ => render::ProjectionMode::Perspective,
    };
    let camera_config = render::CameraConfig {
        azimuth_deg: args.camera_azimuth,
        elevation_deg: args.camera_elevation,
        roll_deg: args.camera_roll,
        distance: args.camera_distance,
        fov_y_deg: args.camera_fov,
        projection,
        fit_padding: args.camera_fit_padding,
    };
    let depth_cue = render::DepthCueConfig {
        strength: args.depth_cue_strength,
        gamma: args.depth_cue_gamma,
        min_scale: args.depth_cue_min_scale,
    };

    let aesthetic_preset_name = args
        .aesthetic_preset
        .as_deref()
        .or_else(|| file_config.as_ref().and_then(|cfg| cfg.aesthetic_preset.as_deref()))
        .unwrap_or("default");
    let style_preset_name = args
        .style_preset
        .as_deref()
        .or_else(|| file_config.as_ref().and_then(|cfg| cfg.style_preset.as_deref()))
        .unwrap_or("default");
    let effect_preset = render::effects::EffectPreset::from_str(style_preset_name);
    let effect_overrides = file_config
        .as_ref()
        .and_then(|cfg| cfg.effects.as_ref())
        .map(|effects| render::effects::EffectOverrides::from(effects));

    let mut weights = match aesthetic_preset_name.to_lowercase().as_str() {
        "gallery" => AestheticWeights::gallery(),
        _ => AestheticWeights::default(),
    };
    if let Some(val) = args.chaos_weight {
        weights.chaos = val;
    }
    if let Some(val) = args.equil_weight {
        weights.equilateralness = val;
    }
    if let Some(val) = args.golden_weight {
        weights.golden_ratio = val;
    }
    if let Some(val) = args.negative_weight {
        weights.negative_space = val;
    }
    if let Some(val) = args.symmetry_weight {
        weights.symmetry = val;
    }
    if let Some(val) = args.density_weight {
        weights.density = val;
    }

    let aesthetic_config = optim::BordaAestheticConfig { weights };

    // Convert hex seed
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed_bytes = hex::decode(hex_seed).expect("invalid hex seed");
    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // 1) Borda selection - exhaustive single-stage search
    let borda_config = if args.fast {
        optim::BordaConfig::fast()
    } else {
        optim::BordaConfig {
            num_candidates: num_sims,
            ..optim::BordaConfig::default()
        }
    };
    
    let (best_bodies, best_info) = optim::select_best_trajectory(
        &mut rng,
        num_steps_sim,
        args.escape_threshold,
        &borda_config,
        &aesthetic_config,
    );

    // 2) Re-run best orbit
    info!("STAGE 2/7: Re-running best orbit for {} steps...", num_steps_sim);
    let time_dilation = sim::TimeDilationConfig {
        enabled: args.time_dilation,
        min_dt_factor: args.time_dilation_min_dt_factor,
        threshold_distance: args.time_dilation_threshold,
        strength: args.time_dilation_strength,
    };
    let sim_result = if time_dilation.enabled {
        get_positions_with_time_dilation(best_bodies.clone(), num_steps_sim, &time_dilation)
    } else {
        get_positions(best_bodies.clone(), num_steps_sim)
    };
    let mut positions = sim_result.positions;
    info!("   => Done.");

    // 2.5) Apply drift transformation if enabled (default)
    if !args.no_drift {
        info!("STAGE 2.5/7: Applying {} drift...", args.drift_mode);

        // Create and apply drift using the existing RNG
        let num_steps = positions[0].len();
        let drift_params = DriftParameters::new(
            args.drift_scale,
            args.drift_arc_fraction,
            args.drift_orbit_eccentricity,
        );
        if drift_params.arc_fraction == 0.0 && args.drift_mode.to_lowercase().starts_with("ell") {
            warn!("Elliptical drift requested with zero arc fraction; skipping motion");
        }
        let mut drift_transform =
            parse_drift_mode(&args.drift_mode, &mut rng, drift_params, num_steps);
        let dt = constants::DEFAULT_DT; // Same dt as used in simulation
        drift_transform.apply(&mut positions, dt);

        info!("   => Drift applied with scale {}", args.drift_scale);
    }

    // 3) Generate color sequences
    info!("STAGE 3/7: Generating color sequences + alpha...");
    let alpha_value = 1.0 / (args.alpha_denom as f64);
    let (colors, body_alphas) =
        generate_body_color_sequences(&mut rng, num_steps_sim, alpha_value);

    // Create render configuration
    let render_config = render::RenderConfig {
        alpha_compress: args.alpha_compress,
        hdr_scale: if args.hdr_mode == "auto" { args.hdr_scale } else { 1.0 },
        camera: camera_config,
        depth_cue,
        parallel_accumulation: args.parallel_accumulation,
    };

    // Using OKLab color space for accumulation
    info!("   => Using OKLab color space for accumulation");

    // 4) bounding box info
    info!("STAGE 4/7: Determining bounding box...");
    let (min_x, max_x, min_y, max_y) = bounding_box(&positions);
    info!("   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]", min_x, max_x, min_y, max_y);

    // 5) pass 1 => gather histogram
    info!("STAGE 5/7: PASS 1 => building global histogram...");
    let (blur_radius_px, blur_strength, blur_core_brightness) = if args.special {
        (
            // stronger blur for special mode
            (0.02 * width.min(height) as f64).round() as usize,
            10.0, // boosted blur strength
            10.0, // core brightness = equal to strength for brighter lines
        )
    } else {
        (
            // stronger default blur
            (0.012 * width.min(height) as f64).round() as usize,
            8.0, // boosted blur strength
            8.0, // core brightness = equal to strength for brighter lines
        )
    };

    let frame_rate = constants::DEFAULT_VIDEO_FPS;
    let target_frames = if args.png_only { 1 } else { constants::DEFAULT_TARGET_FRAMES }; // PNG-only: just 1 frame
    let mut frame_interval = (num_steps_sim / target_frames as usize).max(1);
    if args.png_only {
        frame_interval = num_steps_sim.max(1);
    }

    let mut all_r = Vec::new();
    let mut all_g = Vec::new();
    let mut all_b = Vec::new();

    // Create DoG bloom config
    let dog_config = render::DogBloomConfig {
        inner_sigma: args.dog_sigma,
        outer_ratio: args.dog_ratio,
        strength: args.dog_strength,
        threshold: 0.01,
    };

    // Create perceptual blur config
    let perceptual_blur_enabled = args.perceptual_blur.to_lowercase() == "on";
    let perceptual_blur_config = if perceptual_blur_enabled {
        Some(post_effects::PerceptualBlurConfig {
            radius: args.perceptual_blur_radius.unwrap_or(blur_radius_px),
            strength: args.perceptual_blur_strength,
            gamut_mode: match args.perceptual_gamut_mode.as_str() {
                "clamp" => oklab::GamutMapMode::Clamp,
                "soft-clip" => oklab::GamutMapMode::SoftClip,
                _ => oklab::GamutMapMode::PreserveHue,
            },
        })
    } else {
        None
    };

    pass_1_build_histogram_spectral(
        &positions,
        &colors,
        &body_alphas,
        width,
        height,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        frame_interval,
        &mut all_r,
        &mut all_g,
        &mut all_b,
        &args.bloom_mode,
        &dog_config,
        &args.hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config.as_ref(),
        effect_preset,
        effect_overrides.as_ref(),
        &render_config,
    );

    // 6) compute black/white/gamma
    info!("STAGE 6/7: Determine global black/white/gamma...");
    let (black_r, white_r, black_g, white_g, black_b, white_b) = compute_black_white_gamma(
        &mut all_r,
        &mut all_g,
        &mut all_b,
        args.clip_black,
        args.clip_white,
    );
    info!(
        "   => R:[{:.3e},{:.3e}] G:[{:.3e},{:.3e}] B:[{:.3e},{:.3e}]",
        black_r, white_r, black_g, white_g, black_b, white_b
    );
    // Free memory
    drop(all_r);
    drop(all_g);
    drop(all_b);

    // 7) pass 2 => final frames
    // Generate filename with optional profile tag
    let base_filename = if args.profile_tag.is_empty() {
        args.file_name.clone()
    } else {
        format!("{}_{}", args.file_name, args.profile_tag)
    };

    let output_vid = format!("vids/{}.mp4", base_filename);
    let output_png = format!("pics/{}.png", base_filename);
    let output_exr = format!("pics/{}.exr", base_filename);
    let mut last_frame_outputs = render::FinalFrameOutputs::default();
    let png_bit_depth = if args.png_bit_depth <= 8 { 8 } else { 16 };
    if args.png_bit_depth != png_bit_depth {
        warn!("Invalid png bit depth {}, falling back to {}", args.png_bit_depth, png_bit_depth);
    }
    let output_config = render::OutputImageConfig { png_bit_depth, write_exr: args.write_exr };

    if args.png_only {
        // PNG-only mode: render just the final frame directly
        info!("STAGE 7/7: PASS 2 => Rendering final frame only (PNG mode)...");
        
        pass_2_write_frames_spectral(
            &positions,
            &colors,
            &body_alphas,
            width,
            height,
            blur_radius_px,
            blur_strength,
            blur_core_brightness,
            frame_interval,
            black_r,
            white_r,
            black_g,
            white_g,
            black_b,
            white_b,
            &args.bloom_mode,
            &dog_config,
            &args.hdr_mode,
            perceptual_blur_enabled,
            perceptual_blur_config.as_ref(),
            effect_preset,
            effect_overrides.as_ref(),
            |_buf_8bit| {
                // Discard frame data in PNG-only mode (we only want last_frame_png)
                Ok(())
            },
            &mut last_frame_outputs,
            &output_config,
            &render_config,
        )?;
    } else {
        // Full video mode
        info!("STAGE 7/7: PASS 2 => final frames => FFmpeg...");

        // Create video encoding options with default settings
        let video_options = render::VideoEncodingOptions::default();

        render::create_video_from_frames_singlepass(
            width,
            height,
            frame_rate,
            |out| {
                pass_2_write_frames_spectral(
                    &positions,
                    &colors,
                    &body_alphas,
                    width,
                    height,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                    frame_interval,
                    black_r,
                    white_r,
                    black_g,
                    white_g,
                    black_b,
                    white_b,
                    &args.bloom_mode,
                    &dog_config,
                    &args.hdr_mode,
                    perceptual_blur_enabled,
                    perceptual_blur_config.as_ref(),
                    effect_preset,
                    effect_overrides.as_ref(),
                    |buf_8bit| {
                        out.write_all(buf_8bit).map_err(render::error::RenderError::VideoEncoding)?;
                        Ok(())
                    },
                    &mut last_frame_outputs,
                    &output_config,
                    &render_config,
                )?;
                Ok(())
            },
            &output_vid,
            &video_options,
        )
        .map_err(|e| Box::new(e) as Box<dyn Error>)?;
    }

    // Save final frame if available
    if png_bit_depth <= 8 {
        if let Some(last_frame) = last_frame_outputs.png8 {
            info!("Attempting to save PNG to: {}", output_png);
            if let Err(e) = save_image_as_png_u8(&last_frame, &output_png) {
                error!("Failed to save final PNG: {}", e);
            }
        } else {
            warn!("Warning: No final frame was generated to save as PNG.");
        }
    } else if let Some(last_frame) = last_frame_outputs.png16 {
        info!("Attempting to save PNG16 to: {}", output_png);
        if let Err(e) = save_image_as_png_u16(&last_frame, &output_png) {
            error!("Failed to save final PNG16: {}", e);
        }
    } else {
        warn!("Warning: No final frame was generated to save as PNG16.");
    }

    if output_config.write_exr {
        if let Some(last_frame) = last_frame_outputs.exr {
            info!("Attempting to save EXR to: {}", output_exr);
            if let Err(e) = save_image_as_exr(&last_frame, &output_exr) {
                error!("Failed to save final EXR: {}", e);
            }
        } else {
            warn!("Warning: No final frame was generated to save as EXR.");
        }
    }

    let metadata = RunMetadata {
        file_name: base_filename.clone(),
        seed: args.seed.clone(),
        output_png: output_png.clone(),
        output_exr: if output_config.write_exr { Some(output_exr.clone()) } else { None },
        width,
        height,
        num_steps: num_steps_sim,
        frame_interval,
        aesthetic_preset: aesthetic_preset_name.to_string(),
        style_preset: style_preset_name.to_string(),
        png_bit_depth,
        write_exr: output_config.write_exr,
        scores: ScoreMetadata {
            total_weighted: best_info.total_score_weighted,
            chaos: best_info.chaos,
            equilateralness: best_info.equilateralness,
            golden_ratio: best_info.golden_ratio,
            negative_space: best_info.negative_space,
            symmetry: best_info.symmetry,
            density: best_info.density,
        },
        time_dilation: TimeDilationMetadata {
            enabled: time_dilation.enabled,
            min_dt_factor: time_dilation.min_dt_factor,
            threshold_distance: time_dilation.threshold_distance,
            strength: time_dilation.strength,
        },
        camera: CameraMetadata {
            azimuth_deg: camera_config.azimuth_deg,
            elevation_deg: camera_config.elevation_deg,
            roll_deg: camera_config.roll_deg,
            distance: camera_config.distance,
            fov_y_deg: camera_config.fov_y_deg,
            projection: match camera_config.projection {
                render::ProjectionMode::Orthographic => "orthographic".to_string(),
                render::ProjectionMode::Perspective => "perspective".to_string(),
            },
            fit_padding: camera_config.fit_padding,
        },
        drift: DriftMetadata {
            mode: args.drift_mode.clone(),
            scale: args.drift_scale,
            arc_fraction: args.drift_arc_fraction,
            orbit_eccentricity: args.drift_orbit_eccentricity,
            enabled: !args.no_drift,
        },
    };

    let metadata_path = format!("pics/{}.meta.toml", base_filename);
    match toml::to_string_pretty(&metadata) {
        Ok(serialized) => {
            if let Err(err) = fs::write(&metadata_path, serialized) {
                warn!("Failed to write metadata {}: {}", metadata_path, err);
            }
        }
        Err(err) => {
            warn!("Failed to serialize metadata {}: {}", metadata_path, err);
        }
    }

    info!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );
    Ok(())
}
