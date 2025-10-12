use clap::Parser;
use tracing::info;
use tracing_subscriber::EnvFilter;

mod analysis;
mod app;
mod drift;
mod drift_config;
mod error;
mod generation_log;
mod oklab;
mod post_effects;
mod render;
mod sim;
mod soa_positions;
mod spectral_constants;
mod spectrum;
mod spectrum_simd;
mod utils;

use error::Result;
use render::RenderConfig;
use sim::Sha3RandomByteStream;

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

    /// Test mode: render only the first frame as PNG and exit (skips video generation)
    #[arg(long, default_value_t = false)]
    test_frame: bool,

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
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    drift_scale: Option<f64>,

    /// Fraction of the orbit to traverse when using elliptical drift (0-1)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    drift_arc_fraction: Option<f64>,

    /// Orbit eccentricity when using elliptical drift (0-0.95)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    drift_orbit_eccentricity: Option<f64>,

    /// Profile tag to append to output filenames
    #[arg(long, default_value = "")]
    profile_tag: String,

    /// Bloom mode: gaussian or dog
    #[arg(long, default_value = "dog")]
    bloom_mode: String,

    /// DoG bloom strength (0.1-1.0)
    #[arg(long, default_value_t = 0.32)]
    dog_strength: f64,

    /// DoG inner sigma in pixels (auto-scales with resolution if not specified)
    #[arg(long)]
    dog_sigma: Option<f64>,

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

fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize tracing
    setup_logging(args.json_logs, &args.log_level);

    // Determine number of simulations
    let num_sims = args.num_sims.unwrap_or(if args.special { 100_000 } else { 30_000 });

    // Setup
    app::setup_directories()?;
    error::validation::validate_dimensions(args.width, args.height)?;
    
    let seed_bytes = app::parse_seed(&args.seed)?;
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let noise_seed = app::derive_noise_seed(&seed_bytes);
    
    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // Stage 1: Borda selection
    let (best_bodies, best_info) = app::run_borda_selection(
        &mut rng,
        num_sims,
        args.num_steps_sim,
        args.chaos_weight,
        args.equil_weight,
        args.escape_threshold,
    )?;

    // Stage 2: Re-run best orbit
    let mut positions = app::simulate_best_orbit(best_bodies, args.num_steps_sim);

    // Stage 2.5: Apply drift (if enabled)
    let drift_config = if !args.no_drift {
        app::apply_drift_transformation(
            &mut positions,
            &args.drift_mode,
            args.drift_scale,
            args.drift_arc_fraction,
            args.drift_orbit_eccentricity,
            &mut rng,
            args.special,
        )
    } else {
        info!("STAGE 2.5/7: Drift disabled (--no-drift flag)");
        None
    };

    // Stage 3: Generate colors
    let (colors, body_alphas) = app::generate_colors(
        &mut rng,
        args.num_steps_sim,
        args.alpha_denom,
    );

    // Using OKLab color space
    info!("   => Using OKLab color space for accumulation");

    // Stage 4: Bounding box
    info!("STAGE 4/7: Determining bounding box...");
    let render_ctx = render::context::RenderContext::new(args.width, args.height, &positions);
    let bbox = render_ctx.bounds();
    info!("   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]", bbox.min_x, bbox.max_x, bbox.min_y, bbox.max_y);

    // Configure rendering
    let render_config = RenderConfig {
        hdr_scale: if args.hdr_mode == "auto" { args.hdr_scale } else { 1.0 },
    };
    
    let (blur_radius_px, blur_strength, blur_core_brightness) = 
        app::create_blur_config(args.special, args.width, args.height);

    let dog_config = app::create_dog_config(
        args.width,
        args.height,
        args.dog_sigma,
        args.dog_ratio,
        args.dog_strength,
    );

    let perceptual_blur_enabled = args.perceptual_blur.to_lowercase() == "on";
    let perceptual_blur_config = app::create_perceptual_blur_config(
        perceptual_blur_enabled,
        blur_radius_px,
        args.perceptual_blur_radius,
        args.perceptual_blur_strength,
        &args.perceptual_gamut_mode,
    );

    // Stage 5-6: Build histogram and compute levels
    let levels = app::build_histogram_and_levels(
        &positions,
        &colors,
        &body_alphas,
        args.width,
        args.height,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        &args.bloom_mode,
        &dog_config,
        &args.hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config.as_ref(),
        args.special,
        noise_seed,
        &render_config,
        args.clip_black,
        args.clip_white,
    )?;

    let base_filename = app::generate_filename(&args.file_name, &args.profile_tag);
    let output_png = format!("pics/{}.png", base_filename);

    // Stage 7: Render
    if args.test_frame {
        app::render_test_frame(
            &positions,
            &colors,
            &body_alphas,
            args.width,
            args.height,
            blur_radius_px,
            blur_strength,
            blur_core_brightness,
            &levels,
            &args.bloom_mode,
            &dog_config,
            &args.hdr_mode,
            perceptual_blur_enabled,
            perceptual_blur_config.as_ref(),
            args.special,
            noise_seed,
            &render_config,
            &output_png,
            &best_info,
        )?;
        return Ok(());
    }

    // Normal mode: Render full video
    let output_vid = format!("vids/{}.mp4", base_filename);
    
    app::render_video(
        &positions,
        &colors,
        &body_alphas,
        args.width,
        args.height,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        &levels,
        &args.bloom_mode,
        &dog_config,
        &args.hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config.as_ref(),
        args.special,
        noise_seed,
        &render_config,
        &output_vid,
        &output_png,
    )?;

    info!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );
    
    // Log generation parameters for reproducibility
    let app_config = app::AppConfig {
        seed: args.seed.clone(),
        file_name: args.file_name.clone(),
        num_sims,
        num_steps_sim: args.num_steps_sim,
        width: args.width,
        height: args.height,
        special: args.special,
        test_frame: args.test_frame,
        clip_black: args.clip_black,
        clip_white: args.clip_white,
        alpha_denom: args.alpha_denom,
        escape_threshold: args.escape_threshold,
        drift_enabled: !args.no_drift,
        drift_mode: args.drift_mode.clone(),
        drift_scale: args.drift_scale,
        drift_arc_fraction: args.drift_arc_fraction,
        drift_orbit_eccentricity: args.drift_orbit_eccentricity,
        profile_tag: args.profile_tag.clone(),
        bloom_mode: args.bloom_mode.clone(),
        dog_strength: args.dog_strength,
        dog_sigma: args.dog_sigma,
        dog_ratio: args.dog_ratio,
        hdr_mode: args.hdr_mode.clone(),
        hdr_scale: args.hdr_scale,
        perceptual_blur: args.perceptual_blur.clone(),
        perceptual_blur_radius: args.perceptual_blur_radius,
        perceptual_blur_strength: args.perceptual_blur_strength,
        perceptual_gamut_mode: args.perceptual_gamut_mode.clone(),
        min_mass: args.min_mass,
        max_mass: args.max_mass,
        location: args.location,
        velocity: args.velocity,
        chaos_weight: args.chaos_weight,
        equil_weight: args.equil_weight,
    };
    
    app::log_generation(&app_config, &base_filename, hex_seed, &drift_config, num_sims, &best_info);
    
    Ok(())
}
