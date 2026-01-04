//! Three Body Problem Visualization - Command Line Interface
//!
//! Main binary entry point for the three-body problem visualization system.

// Apply same lint configuration as library
#![allow(clippy::too_many_arguments)] // CLI functions need many parameters

use clap::Parser;
use tracing::info;
use tracing_subscriber::EnvFilter;

mod analysis;
mod app;
mod cli;
mod drift;
mod drift_config;
mod error;
mod generation_log;
mod oklab;
mod parameter_distributions;
mod post_effects;
mod render;
mod sim;
mod soa_positions;
mod spectral_constants;
mod spectrum;
mod spectrum_simd;
mod utils;
mod weighted_sampler;

use cli::{Cli, EffectArgs};
use error::Result;
use render::RenderConfig;
use sim::Sha3RandomByteStream;

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

/// Build randomizable effect configuration from command-line arguments.
/// Any unspecified parameter will be randomized during resolution.
fn build_randomizable_config(
    args: &EffectArgs,
) -> render::randomizable_config::RandomizableEffectConfig {
    use render::randomizable_config::RandomizableEffectConfig;

    RandomizableEffectConfig {
        gallery_quality: args.gallery_quality,
        effect_theme: None, // Let the system randomly select an appropriate theme

        // Effect enables (convert disable flags to enable options)
        enable_bloom: if args.disable_all_effects || args.disable_bloom {
            Some(false)
        } else {
            None
        },
        enable_glow: if args.disable_all_effects || args.disable_glow { Some(false) } else { None },
        enable_chromatic_bloom: if args.disable_all_effects || args.disable_chromatic_bloom {
            Some(false)
        } else {
            None
        },
        enable_perceptual_blur: if args.disable_all_effects || args.disable_perceptual_blur {
            Some(false)
        } else {
            None
        },
        enable_micro_contrast: if args.disable_all_effects || args.disable_micro_contrast {
            Some(false)
        } else {
            None
        },
        enable_gradient_map: if args.disable_all_effects || args.disable_gradient_map {
            Some(false)
        } else {
            None
        },
        enable_color_grade: if args.disable_all_effects || args.disable_color_grade {
            Some(false)
        } else {
            None
        },
        enable_champleve: if args.disable_all_effects || args.disable_champleve {
            Some(false)
        } else {
            None
        },
        enable_aether: if args.disable_all_effects || args.disable_aether {
            Some(false)
        } else {
            None
        },
        enable_opalescence: if args.disable_all_effects || args.disable_opalescence {
            Some(false)
        } else {
            None
        },
        enable_edge_luminance: if args.disable_all_effects || args.disable_edge_luminance {
            Some(false)
        } else {
            None
        },
        enable_atmospheric_depth: if args.disable_all_effects || args.disable_atmospheric_depth {
            Some(false)
        } else {
            None
        },
        enable_fine_texture: if args.disable_all_effects || args.disable_fine_texture {
            Some(false)
        } else {
            None
        },

        // Bloom & Glow parameters
        blur_strength: args.param_blur_strength,
        blur_radius_scale: args.param_blur_radius_scale,
        blur_core_brightness: args.param_blur_core_brightness,
        dog_strength: args.param_dog_strength,
        dog_sigma_scale: args.param_dog_sigma_scale,
        dog_ratio: args.param_dog_ratio,
        glow_strength: args.param_glow_strength,
        glow_threshold: args.param_glow_threshold,
        glow_radius_scale: args.param_glow_radius_scale,
        glow_sharpness: args.param_glow_sharpness,
        glow_saturation_boost: args.param_glow_saturation_boost,

        // Chromatic effects
        chromatic_bloom_strength: args.param_chromatic_bloom_strength,
        chromatic_bloom_radius_scale: args.param_chromatic_bloom_radius_scale,
        chromatic_bloom_separation_scale: args.param_chromatic_bloom_separation_scale,
        chromatic_bloom_threshold: args.param_chromatic_bloom_threshold,

        // Perceptual blur
        perceptual_blur_strength: args.param_perceptual_blur_strength,

        // Color grading
        color_grade_strength: args.param_color_grade_strength,
        vignette_strength: args.param_vignette_strength,
        vignette_softness: args.param_vignette_softness,
        vibrance: args.param_vibrance,
        clarity_strength: args.param_clarity_strength,
        tone_curve_strength: args.param_tone_curve_strength,

        // Gradient mapping
        gradient_map_strength: args.param_gradient_map_strength,
        gradient_map_hue_preservation: args.param_gradient_map_hue_preservation,
        gradient_map_palette: args.param_gradient_map_palette,

        // Opalescence
        opalescence_strength: args.param_opalescence_strength,
        opalescence_scale: args.param_opalescence_scale,
        opalescence_layers: args.param_opalescence_layers,

        // Champlevé
        champleve_flow_alignment: args.param_champleve_flow_alignment,
        champleve_interference_amplitude: args.param_champleve_interference_amplitude,
        champleve_rim_intensity: args.param_champleve_rim_intensity,
        champleve_rim_warmth: args.param_champleve_rim_warmth,
        champleve_interior_lift: args.param_champleve_interior_lift,

        // Aether
        aether_flow_alignment: args.param_aether_flow_alignment,
        aether_scattering_strength: args.param_aether_scattering_strength,
        aether_iridescence_amplitude: args.param_aether_iridescence_amplitude,
        aether_caustic_strength: args.param_aether_caustic_strength,

        // Micro-contrast
        micro_contrast_strength: args.param_micro_contrast_strength,
        micro_contrast_radius: args.param_micro_contrast_radius,

        // Edge luminance
        edge_luminance_strength: args.param_edge_luminance_strength,
        edge_luminance_threshold: args.param_edge_luminance_threshold,
        edge_luminance_brightness_boost: args.param_edge_luminance_brightness_boost,

        // Atmospheric depth
        atmospheric_depth_strength: args.param_atmospheric_depth_strength,
        atmospheric_desaturation: args.param_atmospheric_desaturation,
        atmospheric_darkening: args.param_atmospheric_darkening,
        atmospheric_fog_color_r: args.param_atmospheric_fog_color_r,
        atmospheric_fog_color_g: args.param_atmospheric_fog_color_g,
        atmospheric_fog_color_b: args.param_atmospheric_fog_color_b,

        // Crepuscular Rays
        enable_crepuscular_rays: if args.disable_all_effects { Some(false) } else { None },
        crepuscular_rays_strength: None,
        crepuscular_rays_density: None,
        crepuscular_rays_decay: None,
        crepuscular_rays_weight: None,
        crepuscular_rays_exposure: None,

        // Volumetric Occlusion
        enable_volumetric_occlusion: if args.disable_all_effects { Some(false) } else { None },
        volumetric_occlusion_strength: None,
        volumetric_occlusion_radius: None,
        volumetric_occlusion_light_angle: None,
        volumetric_occlusion_density_scale: None,
        volumetric_occlusion_decay: None,
        volumetric_occlusion_threshold: None,

        // Refractive Caustics
        enable_refractive_caustics: if args.disable_all_effects { Some(false) } else { None },
        refractive_caustics_strength: None,
        refractive_caustics_ior: None,
        refractive_caustics_dispersion: None,
        refractive_caustics_focus: None,
        refractive_caustics_threshold: None,

        // Fine texture
        fine_texture_strength: args.param_fine_texture_strength,
        fine_texture_scale: args.param_fine_texture_scale,
        fine_texture_contrast: args.param_fine_texture_contrast,
        fine_texture_specular: None,
        fine_texture_light_angle: None,
        fine_texture_type: None,

        // HDR
        hdr_scale: args.param_hdr_scale,

        // Clipping
        clip_black: args.param_clip_black,
        clip_white: args.param_clip_white,

        // Nebula
        nebula_strength: args.param_nebula_strength,
        nebula_octaves: args.param_nebula_octaves,
        nebula_base_frequency: args.param_nebula_base_frequency,

        // New "Masterpiece" effects - all randomized by default
        enable_event_horizon: if args.disable_all_effects { Some(false) } else { None },
        event_horizon_strength: None,
        event_horizon_mass_scale: None,

        enable_cherenkov: if args.disable_all_effects { Some(false) } else { None },
        cherenkov_strength: None,
        cherenkov_threshold: None,
        cherenkov_blur_radius: None,

        enable_cosmic_ink: if args.disable_all_effects { Some(false) } else { None },
        cosmic_ink_strength: None,
        cosmic_ink_swirl_intensity: None,

        enable_aurora_veils: if args.disable_all_effects { Some(false) } else { None },
        aurora_veils_strength: None,
        aurora_veils_curtain_count: None,

        enable_prismatic_halos: if args.disable_all_effects { Some(false) } else { None },
        prismatic_halos_strength: None,
        prismatic_halos_threshold: None,

        enable_dimensional_glitch: if args.disable_all_effects { Some(false) } else { None },
        dimensional_glitch_strength: None,
        dimensional_glitch_threshold: None,
        enable_deep_space: if args.disable_all_effects { Some(false) } else { None },

        // NEW: Museum Quality Upgrade effects - randomized by default
        enable_halation: if args.disable_all_effects { Some(false) } else { None },
        halation_strength: None,
        halation_threshold: None,
        halation_radius_scale: None,
        halation_warmth: None,
        halation_softness: None,

        enable_dodge_burn: if args.disable_all_effects { Some(false) } else { None },
        dodge_burn_strength: None,
        dodge_burn_dodge_amount: None,
        dodge_burn_burn_amount: None,
        dodge_burn_saliency_radius: None,
        dodge_burn_luminance_weight: None,
    }
}

fn main() -> Result<()> {
    let args = Cli::parse();

    // Initialize tracing
    setup_logging(args.output.json_logs, &args.output.log_level);

    // Determine number of simulations
    let num_sims = args.sim.num_sims.unwrap_or(if args.effects.special { 100_000 } else { 30_000 });

    // Setup
    app::setup_directories()?;
    error::validation::validate_dimensions(args.render.width, args.render.height)?;

    let seed_bytes = app::parse_seed(&args.sim.seed)?;
    let hex_seed =
        if args.sim.seed.starts_with("0x") { &args.sim.seed[2..] } else { &args.sim.seed };
    let noise_seed = app::derive_noise_seed(&seed_bytes);

    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.sim.min_mass,
        args.sim.max_mass,
        args.sim.location,
        args.sim.velocity,
    );

    // Resolve effect configuration (randomize unspecified parameters using distributions)
    info!("Resolving effect configuration...");
    let randomizable_config = build_randomizable_config(&args.effects);
    let (resolved_effect_config, randomization_log) = randomizable_config.resolve(
        &mut rng,
        args.render.width,
        args.render.height,
        args.effects.special,
        noise_seed,
    );

    let num_randomized = randomization_log
        .effects
        .iter()
        .map(|e| e.parameters.iter().filter(|p| p.was_randomized).count())
        .sum::<usize>();

    info!(
        "   => Resolved {} effects ({} parameters randomized, {} explicit)",
        randomization_log.effects.len(),
        num_randomized,
        randomization_log.effects.iter().map(|e| e.parameters.len()).sum::<usize>()
            - num_randomized
    );

    if args.effects.gallery_quality {
        info!("   => Gallery quality mode enabled (conservative randomization ranges)");
    }

    // Stage 1: Borda selection
    let (best_bodies, best_info) = app::run_borda_selection(
        &mut rng,
        num_sims,
        args.sim.num_steps_sim,
        args.sim.chaos_weight,
        args.sim.equil_weight,
        args.sim.escape_threshold,
    )?;

    // Stage 2: Re-run best orbit
    let mut positions = app::simulate_best_orbit(best_bodies, args.sim.num_steps_sim);

    // Stage 2.5: Apply drift (if enabled)
    let drift_config = if !args.drift.no_drift {
        app::apply_drift_transformation(
            &mut positions,
            &args.drift.drift_mode,
            args.drift.drift_scale,
            args.drift.drift_arc_fraction,
            args.drift.drift_orbit_eccentricity,
            &mut rng,
            args.effects.special,
        )?
    } else {
        info!("STAGE 2.5/7: Drift disabled (--no-drift flag)");
        None
    };

    // Stage 3: Generate colors
    //
    // MUSEUM QUALITY: Two enhancements in gallery mode:
    // 1. Use lower alpha_denom for brighter trajectories
    // 2. Use palette-coordinated colors for visual harmony with gradient map
    //
    // If user explicitly specified --alpha-denom, honor that value.
    // Otherwise, use gallery or standard defaults based on mode.
    let effective_alpha_denom = if args.render.alpha_denom != render::constants::DEFAULT_ALPHA_DENOM {
        // User explicitly overrode alpha_denom
        args.render.alpha_denom
    } else if args.effects.gallery_quality {
        // Gallery mode: use brighter (3x) alpha for museum-quality visibility
        render::constants::GALLERY_ALPHA_DENOM
    } else {
        // Standard mode: use default alpha
        render::constants::DEFAULT_ALPHA_DENOM
    };
    
    // MUSEUM QUALITY: Generate palette-coordinated colors in gallery mode
    // This ensures trajectory colors harmonize with the gradient map effect
    let alpha_value = 1.0 / (effective_alpha_denom as f64);
    let (colors, body_alphas) = if args.effects.gallery_quality {
        render::color::generate_palette_coordinated_colors(
            &mut rng,
            args.sim.num_steps_sim,
            alpha_value,
            resolved_effect_config.gradient_map_palette,
        )
    } else {
        app::generate_colors(&mut rng, args.sim.num_steps_sim, effective_alpha_denom)
    };

    // Using OKLab color space
    info!(
        "   => Using OKLab color space for accumulation (alpha_denom={}{})",
        effective_alpha_denom,
        if args.effects.gallery_quality && args.render.alpha_denom == render::constants::DEFAULT_ALPHA_DENOM {
            " [gallery mode: 3x brighter, palette-coordinated]"
        } else {
            ""
        }
    );

    // Stage 4: Bounding box
    info!("STAGE 4/7: Determining bounding box...");
    let render_ctx =
        render::context::RenderContext::new(args.render.width, args.render.height, &positions);
    let bbox = render_ctx.bounds();
    info!(
        "   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]",
        bbox.min_x, bbox.max_x, bbox.min_y, bbox.max_y
    );

    // Configure rendering from resolved parameters
    let hdr_mode_auto = args.render.hdr_mode == "auto";
    let mut render_config = RenderConfig {
        hdr_scale: if hdr_mode_auto { resolved_effect_config.hdr_scale } else { 1.0 },
        ..RenderConfig::default()
    };

    // Stage 4.5: Museum-quality curation
    //
    // We try multiple effect configurations and pick the best via preview render + metrics,
    // without perturbing the simulation RNG sequence (orbit selection remains unchanged).
    //
    // Two modes are available:
    // - Standard curation (K-try selection): Fast, good quality
    // - Advanced curation: Multi-stage with iterative refinement, guarantees excellence
    
    let scene_for_curation = render::SceneDataRef::new(&positions, &colors, &body_alphas);
    
    let (resolved_effect_config, randomization_log) = if args.effects.advanced_curation {
        // Advanced multi-stage curation with iterative quality refinement
        info!("Using advanced curation (multi-stage with quality refinement)...");
        
        let settings = if args.effects.gallery_quality {
            render::advanced_curation::AdvancedCurationSettings::gallery()
        } else {
            render::advanced_curation::AdvancedCurationSettings::default()
        };
        
        let curated = render::advanced_curation::advanced_curate_effect_config(
            &seed_bytes,
            resolved_effect_config,
            randomization_log,
            &randomizable_config,
            args.render.width,
            args.render.height,
            args.effects.special,
            hdr_mode_auto,
            noise_seed,
            scene_for_curation,
            &render_config,
            settings,
        );
        
        info!(
            "   => Advanced curation complete: score={:.3} ({:?}), {} refinement iterations",
            curated.summary.final_score,
            curated.summary.final_metrics.assessment(),
            curated.summary.refinement_iterations,
        );
        
        if !curated.summary.adjustments_applied.is_empty() {
            info!("   => Adjustments applied: {:?}", curated.summary.adjustments_applied);
        }
        
        (curated.resolved, curated.randomization_log)
    } else {
        // Standard K-try curation (faster, still good quality)
        let curation_k = args.effects.curation_k.unwrap_or_else(|| {
            if args.effects.gallery_quality {
                render::constants::DEFAULT_CURATION_K
            } else {
                1
            }
        });

        if curation_k > 1 {
            info!("Curating effect configuration (K = {})...", curation_k);
        }

        let curation_settings = render::curation::CurationSettings { k: curation_k, ..Default::default() };
        let curated = render::curation::curate_effect_config(
            &seed_bytes,
            resolved_effect_config,
            randomization_log,
            &randomizable_config,
            args.render.width,
            args.render.height,
            args.effects.special,
            hdr_mode_auto,
            noise_seed,
            scene_for_curation,
            &render_config,
            curation_settings,
        );

        if curation_k > 1 {
            info!(
                "   => Curated config chosen: idx={} score={:.3} quality={:.3} (mean_lum={:.3}, contrast={:.3})",
                curated.summary.chosen_index,
                curated.summary.chosen_score,
                curated.summary.chosen_metrics.quality_score,
                curated.summary.chosen_metrics.mean_luminance,
                curated.summary.chosen_metrics.contrast_spread,
            );
        }

        // Apply quality auto-tuning for standard curation
        // (Advanced curation already does iterative refinement)
        let mut resolved = curated.resolved;
        let mut log = curated.randomization_log;
        
        render::auto_tune::apply_quality_autotune(
            &mut resolved,
            &mut render_config,
            &curated.summary.chosen_metrics,
            &mut log,
        );
        
        (resolved, log)
    };

    // Update HDR scale after curation (candidate may have different hdr_scale).
    render_config.hdr_scale = if hdr_mode_auto { resolved_effect_config.hdr_scale } else { 1.0 };

    // Stage 5-6: Build histogram and compute levels
    let levels = app::build_histogram_and_levels(
        &positions,
        &colors,
        &body_alphas,
        &resolved_effect_config,
        noise_seed,
        &render_config,
    )?;

    let base_filename = app::generate_filename(&args.output.file_name, &args.output.profile_tag);
    let output_png = format!("pics/{}.png", base_filename);

    // Stage 7: Render
    if args.output.test_frame {
        app::render_test_frame(
            &positions,
            &colors,
            &body_alphas,
            &resolved_effect_config,
            &levels,
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
        &resolved_effect_config,
        &levels,
        noise_seed,
        &render_config,
        &output_vid,
        &output_png,
        args.render.fast_encode,
    )?;

    info!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );

    // Log generation parameters for reproducibility
    let app_config = app::AppConfig {
        seed: args.sim.seed.clone(),
        file_name: args.output.file_name.clone(),
        num_sims,
        num_steps_sim: args.sim.num_steps_sim,
        width: args.render.width,
        height: args.render.height,
        special: args.effects.special,
        test_frame: args.output.test_frame,
        clip_black: resolved_effect_config.clip_black,
        clip_white: resolved_effect_config.clip_white,
        alpha_denom: effective_alpha_denom, // Use actual value (gallery-adjusted)
        escape_threshold: args.sim.escape_threshold,
        drift_enabled: !args.drift.no_drift,
        drift_mode: args.drift.drift_mode.clone(),
        drift_scale: args.drift.drift_scale,
        drift_arc_fraction: args.drift.drift_arc_fraction,
        drift_orbit_eccentricity: args.drift.drift_orbit_eccentricity,
        profile_tag: args.output.profile_tag.clone(),
        bloom_mode: args.effects.bloom_mode.clone(),
        dog_strength: args.effects.dog_strength,
        dog_sigma: args.effects.dog_sigma,
        dog_ratio: args.effects.dog_ratio,
        hdr_mode: args.render.hdr_mode.clone(),
        hdr_scale: resolved_effect_config.hdr_scale,
        perceptual_blur: args.effects.perceptual_blur.clone(),
        perceptual_blur_radius: args.effects.perceptual_blur_radius,
        perceptual_blur_strength: args.effects.perceptual_blur_strength,
        perceptual_gamut_mode: args.effects.perceptual_gamut_mode.clone(),
        min_mass: args.sim.min_mass,
        max_mass: args.sim.max_mass,
        location: args.sim.location,
        velocity: args.sim.velocity,
        chaos_weight: args.sim.chaos_weight,
        equil_weight: args.sim.equil_weight,
    };

    app::log_generation(
        &app_config,
        &base_filename,
        hex_seed,
        &drift_config,
        num_sims,
        &best_info,
        Some(&randomization_log),
    );

    Ok(())
}
