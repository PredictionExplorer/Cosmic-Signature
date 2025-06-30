use clap::Parser;
use std::error::Error;
use std::fs;
use image::{ImageBuffer, Rgb};

mod analysis;
mod drift;
mod post_effects;
mod render;
mod sim;
mod spectrum;
mod utils;

use drift::*;
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

    #[arg(long, default_value_t = 1.0)]
    chaos_weight: f64,

    #[arg(long, default_value_t = 8.5)]
    equil_weight: f64,

    #[arg(long, default_value_t = 1920)]
    width: u32,

    #[arg(long, default_value_t = 1080)]
    height: u32,

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

    /// Drift mode: linear, brownian
    #[arg(long, default_value = "brownian")]
    drift_mode: String,

    /// Scale of drift motion (relative to system size)
    #[arg(long, default_value_t = 0.01)]
    drift_scale: f64,

    /// Profile tag to append to output filenames
    #[arg(long, default_value = "")]
    profile_tag: String,

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
}

fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse();

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
    println!("STAGE 2/7: Re-running best orbit for {} steps...", args.num_steps_sim);
    let sim_result = get_positions(best_bodies.clone(), args.num_steps_sim);
    let mut positions = sim_result.positions;
    println!("   => Done.");

    // 2.5) Apply drift transformation if enabled (default)
    if !args.no_drift {
        println!("STAGE 2.5/7: Applying {} drift...", args.drift_mode);

        // Create and apply drift using the existing RNG
        let num_steps = positions[0].len();
        let mut drift_transform =
            parse_drift_mode(&args.drift_mode, &mut rng, args.drift_scale, num_steps);
        let dt = 0.001; // Same dt as used in simulation
        drift_transform.apply(&mut positions, dt);

        println!("   => Drift applied with scale {}", args.drift_scale);
    }

    // 3) Generate color sequences
    println!("STAGE 3/7: Generating color sequences + alpha...");
    let alpha_value = 1.0 / (args.alpha_denom as f64);
    let (colors, body_alphas) =
        generate_body_color_sequences(&mut rng, args.num_steps_sim, alpha_value);

    render::set_alpha_compress(args.alpha_compress);

    // Set HDR scale based on mode
    if args.hdr_mode == "auto" {
        render::set_hdr_scale(args.hdr_scale);
    } else {
        render::set_hdr_scale(1.0);  // No HDR scaling when off
    }

    // 4) bounding box info
    println!("STAGE 4/7: Determining bounding box...");
    let (min_x, max_x, min_y, max_y) = bounding_box(&positions);
    println!("   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]", min_x, max_x, min_y, max_y);

    // 5) pass 1 => gather histogram
    println!("STAGE 5/7: PASS 1 => building global histogram...");
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

    let frame_rate = 60;
    let target_frames = 1800; // ~30 sec @ 60 FPS
    let frame_interval = (args.num_steps_sim / target_frames).max(1);

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
    );

    // 6) compute black/white/gamma
    println!("STAGE 6/7: Determine global black/white/gamma...");
    let (black_r, white_r, black_g, white_g, black_b, white_b) = compute_black_white_gamma(
        &mut all_r,
        &mut all_g,
        &mut all_b,
        args.clip_black,
        args.clip_white,
    );
    println!(
        "   => R:[{:.3e},{:.3e}] G:[{:.3e},{:.3e}] B:[{:.3e},{:.3e}]",
        black_r, white_r, black_g, white_g, black_b, white_b
    );
    // Free memory
    drop(all_r);
    drop(all_g);
    drop(all_b);

    // 7) pass 2 => final frames => feed into ffmpeg
    println!("STAGE 7/7: PASS 2 => final frames => FFmpeg...");

    // Generate filename with optional profile tag
    let base_filename = if args.profile_tag.is_empty() {
        args.file_name.clone()
    } else {
        format!("{}_{}", args.file_name, args.profile_tag)
    };

    let output_vid = format!("vids/{}.mp4", base_filename);
    let output_png = format!("pics/{}.png", base_filename);
    let mut last_frame_png: Option<ImageBuffer<Rgb<u8>, Vec<u8>>> = None;

    create_video_from_frames_singlepass(
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
                |buf_8bit| {
                    out.write_all(buf_8bit)?;
                    Ok(())
                },
                &mut last_frame_png,
            )?;
            Ok(())
        },
        &output_vid,
    )?;

    // Save final frame if available
    if let Some(last_frame) = last_frame_png {
        println!("Attempting to save PNG to: {}", output_png);
        match save_image_as_png(&last_frame, &output_png) {
            Ok(_) => {}
            Err(e) => eprintln!("Failed to save final PNG: {}", e),
        }
    } else {
        eprintln!("Warning: No final frame was generated to save as PNG.");
    }

    println!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );
    Ok(())
}
