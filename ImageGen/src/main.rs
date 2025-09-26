use clap::Parser;
use image::{ImageBuffer, Rgb};
use std::error::Error;
use std::fs;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

mod analysis;
mod drift;
mod oklab;
mod post_effects;
mod render;
mod sim;
mod spectrum;
mod utils;

use drift::*;
use render::constants;
use render::*;
use sim::*;
use utils::*;

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

    #[arg(long, default_value_t = 1_500_000)]
    num_steps_sim: usize,

    #[arg(long, default_value_t = 300.0)]
    location: f64,

    #[arg(long, default_value_t = 1.0)]
    velocity: f64,

    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,

    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    #[arg(long, default_value_t = 0.75)]
    chaos_weight: f64,

    #[arg(long, default_value_t = 11.0)]
    equil_weight: f64,

    #[arg(long, default_value_t = 1920)]
    width: u32,

    #[arg(long, default_value_t = 1080)]
    height: u32,

    /// Lower percentile for clamping
    #[arg(long, default_value_t = 0.010)]
    clip_black: f64,

    /// Upper percentile for clamping
    #[arg(long, default_value_t = 0.990)]
    clip_white: f64,

    #[arg(long, default_value_t = false)]
    special: bool,

    /// Denominator for alpha used in drawing lines
    #[arg(long, default_value_t = 15_000_000)]
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
    #[arg(long, default_value_t = 0.18)]
    drift_arc_fraction: f64,

    /// Orbit eccentricity when using elliptical drift (0-0.95)
    #[arg(long, default_value_t = 0.15)]
    drift_orbit_eccentricity: f64,

    /// Profile tag to append to output filenames
    #[arg(long, default_value = "")]
    profile_tag: String,

    /// Bloom mode: gaussian or dog
    #[arg(long, default_value = "dog")]
    bloom_mode: String,

    /// DoG bloom strength (0.1-1.0)
    #[arg(long, default_value_t = 0.32)]
    dog_strength: f64,

    /// DoG inner sigma in pixels
    #[arg(long, default_value_t = 7.0)]
    dog_sigma: f64,

    /// DoG outer/inner sigma ratio
    #[arg(long, default_value_t = 2.8)]
    dog_ratio: f64,

    /// HDR mode: off or auto
    #[arg(long, default_value = "auto")]
    hdr_mode: String,

    /// HDR scale multiplier for line alpha
    #[arg(long, default_value_t = 0.12)]
    hdr_scale: f64,

    /// Enable perceptual blur in OKLab space: off or on
    #[arg(long, default_value = "on")]
    perceptual_blur: String,

    /// Perceptual blur radius (pixels), defaults to main blur radius
    #[arg(long)]
    perceptual_blur_radius: Option<usize>,

    /// Perceptual blur strength (0.0-1.0)
    #[arg(long, default_value_t = 0.65)]
    perceptual_blur_strength: f64,

    /// Gamut mapping mode for perceptual blur: clamp, preserve-hue, soft-clip
    #[arg(long, default_value = "preserve-hue")]
    perceptual_gamut_mode: String,

    /// Output logs in JSON format
    #[arg(long)]
    json_logs: bool,

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

    let num_sims = match args.num_sims {
        Some(val) => val,
        None => {
            if args.special {
                100_000
            } else {
                30_000
            }
        }
    };

    // Create pics and vids directories
    fs::create_dir_all("pics")?;
    fs::create_dir_all("vids")?;

    let width = args.width;
    let height = args.height;

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

    // 1) Borda selection
    let (best_bodies, best_info) = sim::select_best_trajectory(
        &mut rng,
        num_sims,
        args.num_steps_sim,
        args.chaos_weight,
        args.equil_weight,
        args.escape_threshold,
    );

    // 2) Re-run best orbit
    info!("STAGE 2/7: Re-running best orbit for {} steps...", args.num_steps_sim);
    let sim_result = get_positions(best_bodies.clone(), args.num_steps_sim);
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
        generate_body_color_sequences(&mut rng, args.num_steps_sim, alpha_value);

    // Create render configuration
    let render_config = render::RenderConfig {
        hdr_scale: if args.hdr_mode == "auto" { args.hdr_scale } else { 1.0 },
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
            // stronger blur for special mode, optimized for 1080p
            (0.025 * std::cmp::min(args.width, args.height) as f64).round() as usize,
            10.0, // boosted blur strength
            10.0, // core brightness = equal to strength for brighter lines
        )
    } else {
        (
            // museum-grade blur settings optimized for 1080p viewing
            (0.018 * std::cmp::min(args.width, args.height) as f64).round() as usize,
            9.0, // boosted blur strength
            9.0, // core brightness = equal to strength for brighter lines
        )
    };

    let frame_rate = constants::DEFAULT_VIDEO_FPS;
    let target_frames = constants::DEFAULT_TARGET_FRAMES; // ~30 sec @ 60 FPS
    let frame_interval = (args.num_steps_sim / target_frames as usize).max(1);

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

    // 7) pass 2 => final frames => feed into ffmpeg
    info!("STAGE 7/7: PASS 2 => final frames => FFmpeg...");

    // Generate filename with optional profile tag
    let base_filename = if args.profile_tag.is_empty() {
        args.file_name.clone()
    } else {
        format!("{}_{}", args.file_name, args.profile_tag)
    };

    let output_vid = format!("vids/{}.mp4", base_filename);
    let output_png = format!("pics/{}.png", base_filename);
    let mut last_frame_png: Option<ImageBuffer<Rgb<u8>, Vec<u8>>> = None;

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
                blur_strength,        // Pass blur_strength
                blur_core_brightness, // Pass blur_core_brightness
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
                |buf_8bit| {
                    out.write_all(buf_8bit).map_err(render::error::RenderError::VideoEncoding)?;
                    Ok(())
                },
                &mut last_frame_png,
                &render_config,
            )?;
            Ok(())
        },
        &output_vid,
        &video_options,
    )
    .map_err(|e| Box::new(e) as Box<dyn Error>)?;

    // Save final frame if available
    if let Some(last_frame) = last_frame_png {
        info!("Attempting to save PNG to: {}", output_png);
        match save_image_as_png(&last_frame, &output_png) {
            Ok(_) => {}
            Err(e) => error!("Failed to save final PNG: {}", e),
        }
    } else {
        warn!("Warning: No final frame was generated to save as PNG.");
    }

    info!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );
    Ok(())
}
