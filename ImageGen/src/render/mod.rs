//! Rendering module: histogram passes, color mapping, line drawing, and output
//!
//! This module provides a complete rendering pipeline for the three-body problem visualization,
//! including coordinate transformations, line drawing, post-processing effects, and video output.

use crate::post_effects::{
    ChromaticBloomConfig, GradientMapConfig, LuxuryPalette, NebulaCloudConfig, PerceptualBlurConfig,
};
use crate::spectrum::NUM_BINS;
use rayon::prelude::*;
use tracing::{debug, info};

// Module declarations
pub mod advanced_curation;
pub mod aesthetic_scoring;
pub mod artifact_budget;
pub mod auto_tune;
pub mod batch_drawing;
pub mod brightness_budget;
pub mod buffer_pool;
pub mod color;
pub mod color_space;
pub mod color_types;
pub mod composition;
pub mod composition_filter;
pub mod constants;
pub mod context;
pub mod cosmic_palette;
pub mod curation;
pub mod drawing;
pub mod effect_energy;
pub mod effect_randomizer;
pub mod elegant_pipeline;
pub mod elegant_palettes;
pub mod effect_themes;
pub mod enhanced_quality_metrics;
pub mod effects;
pub mod error;
pub mod film_grain;
pub mod hdr_pipeline;
pub mod histogram;
pub mod museum_mode;
pub mod gravitational_lensing;
pub mod lensing_background;
pub mod lensing_renderer;
pub mod parameter_descriptors;
pub mod pipeline;
pub mod point_renderer;
pub mod quality_metrics;
pub mod randomizable_config;
pub mod simd_tonemap;
pub mod style_genome;
pub mod temporal;
pub mod tonemap;
pub mod types;
pub mod velocity_hdr;
pub mod video;

// Import from our submodules
use crate::post_effects::FrameParams;
use self::effects::{EffectChainBuilder, EffectConfig, convert_spd_buffer_to_rgba};
use self::error::{RenderError, Result};
use self::histogram::HistogramData;
use self::pipeline::{RenderLoopContext, apply_exposure_normalization};
use self::tonemap::tonemap_to_16bit_dithered;

// Re-export core types and functions for public API compatibility
// MUSEUM QUALITY: Added generate_palette_coordinated_colors for palette-aware trajectory colors
#[allow(unused_imports)]
pub use color::{OklabColor, generate_body_color_sequences, generate_palette_coordinated_colors};
// ELEGANT HDR PIPELINE: Type-safe color representations
#[allow(unused_imports)]
pub use color_types::{LinearHDR, DisplayRGB, HDRBuffer, DisplayBuffer, ExposureControl, EnergyTracker};
// ELEGANT HDR PIPELINE: Pipeline components
#[allow(unused_imports)]
pub use hdr_pipeline::{HDREffect, HDREffectChain, HDRToDisplay, HDRPipeline, LegacyEffectAdapter};
#[allow(unused_imports)]
pub use drawing::{draw_line_segment_aa_spectral_with_dispersion, parallel_blur_2d_rgba};
pub use effects::{DogBloomConfig, ExposureCalculator, apply_dog_bloom};
pub use histogram::compute_black_white_gamma;
#[allow(unused_imports)] // Public API for quality-based auto-adjustment
pub use quality_metrics::{QualityMetrics, QualityAssessment};
#[allow(unused_imports)] // Public API for enhanced quality assessment
pub use enhanced_quality_metrics::{EnhancedQualityMetrics, QualityAdjustment};
#[allow(unused_imports)] // Public API types - exported for library consumers
pub use types::{
    BloomConfig, BlurConfig, ChannelLevels, HdrConfig, PerceptualBlurSettings, RenderConfig,
    RenderParams, Resolution, SceneData, SceneDataRef,
};
pub use video::VideoEncodingOptions;
#[allow(unused_imports)] // Public API for library consumers
pub use video::{EncodingStrategy, create_video_from_frames_singlepass, create_video_with_retry};

// Re-export museum mode types for public API
#[allow(unused_imports)]
pub use museum_mode::{MuseumModeConfig, MuseumModeRenderer, MuseumRenderResult, BackgroundMode};
#[allow(unused_imports)]
pub use cosmic_palette::{CosmicPalette, ALL_COSMIC_PALETTES, EVENT_HORIZON};
#[allow(unused_imports)]
pub use point_renderer::{PointRendererConfig, RenderPoint};
#[allow(unused_imports)]
pub use composition_filter::{CompositionFilterConfig, CompositionScore};
#[allow(unused_imports)]
pub use film_grain::FilmGrainConfig;

// Re-export gravitational lensing types for public API
#[allow(unused_imports)]
pub use gravitational_lensing::{LensingConfig, LensingStyle, MassSource, DisplacementField};
#[allow(unused_imports)]
pub use lensing_background::{LensingBackgroundConfig, BackgroundStyle as LensingBackgroundStyle};
#[allow(unused_imports)]
pub use lensing_renderer::{LensingRendererConfig, LensingRenderer, LensingRenderResult};

// Re-export types from dependencies used in public API
pub use image::{DynamicImage, ImageBuffer, Rgb};

/// Save 16-bit image as PNG.
///
/// Exports a 16-bit RGB image in PNG format, preserving the full dynamic range
/// for maximum quality.
///
/// # Errors
///
/// Returns `RenderError::ImageEncoding` if PNG encoding or file writing fails.
pub fn save_image_as_png_16bit(
    rgb_img: &ImageBuffer<Rgb<u16>, Vec<u16>>,
    path: &str,
) -> Result<()> {
    let dyn_img = DynamicImage::ImageRgb16(rgb_img.clone());
    dyn_img.save(path).map_err(|e| RenderError::ImageEncoding(e.to_string()))?;
    info!("   Saved 16-bit PNG => {path}");
    Ok(())
}

/// Build effect configuration from resolved randomizable config
///
/// Creates a fully configured EffectConfig from a ResolvedEffectConfig with all
/// parameters determined (either explicitly set or randomized).
pub(crate) fn build_effect_config_from_resolved(
    resolved: &randomizable_config::ResolvedEffectConfig,
) -> EffectConfig {
    use crate::oklab::GamutMapMode;
    use crate::post_effects::{
        AetherConfig, AtmosphericDepthConfig, AuroraVeilsConfig, ChampleveConfig, CherenkovConfig,
        ColorGradeParams, CosmicInkConfig, CrepuscularRaysConfig, DeepSpaceConfig,
        DimensionalGlitchConfig, DodgeBurnConfig, EdgeLuminanceConfig, EventHorizonConfig,
        FineTextureConfig, GlowEnhancementConfig, HalationConfig, MicroContrastConfig,
        OpalescenceConfig, PrismaticHalosConfig, RefractiveCausticsConfig, VolumetricOcclusionConfig,
        fine_texture::TextureType,
    };

    let width = resolved.width as usize;
    let height = resolved.height as usize;
    let min_dim = width.min(height);

    // Calculate derived parameters from resolved scales
    let blur_radius_px = (resolved.blur_radius_scale * min_dim as f64).round() as usize;
    let dog_inner_sigma = resolved.dog_sigma_scale * min_dim as f64;
    let glow_radius = (resolved.glow_radius_scale * min_dim as f64).round() as usize;
    let chromatic_bloom_radius =
        (resolved.chromatic_bloom_radius_scale * min_dim as f64).round() as usize;
    let chromatic_bloom_separation = resolved.chromatic_bloom_separation_scale * min_dim as f64;
    let opalescence_scale_abs = resolved.opalescence_scale * ((width * height) as f64).sqrt();
    let fine_texture_scale_abs = resolved.fine_texture_scale * ((width * height) as f64).sqrt();

    // Build DoG config from resolved parameters
    let dog_config = DogBloomConfig {
        inner_sigma: dog_inner_sigma,
        outer_ratio: resolved.dog_ratio,
        strength: resolved.dog_strength,
        threshold: constants::DOG_BLOOM_THRESHOLD,
    };

    // Build perceptual blur config if enabled
    let perceptual_blur_config = if resolved.enable_perceptual_blur {
        Some(PerceptualBlurConfig {
            radius: blur_radius_px,
            strength: resolved.perceptual_blur_strength,
            gamut_mode: GamutMapMode::PreserveHue,
        })
    } else {
        None
    };

    // Determine gradient map settings
    // Luxury color palettes are available in both modes for museum-quality output
    let gradient_map_enabled = resolved.enable_gradient_map;
    let gradient_map_config = GradientMapConfig {
        palette: LuxuryPalette::from_index(resolved.gradient_map_palette),
        strength: resolved.gradient_map_strength,
        hue_preservation: resolved.gradient_map_hue_preservation,
    };

    EffectConfig {
        // Core bloom and blur
        bloom_mode: if resolved.enable_bloom { "dog".to_string() } else { "none".to_string() },
        blur_radius_px,
        blur_strength: resolved.blur_strength,
        blur_core_brightness: resolved.blur_core_brightness,
        dog_config,
        // MUSEUM QUALITY: hdr_mode "off" - histogram+ACES is the sole exposure authority
        // This prevents double-normalization that flattens tonal nuance
        hdr_mode: "off".to_string(),
        perceptual_blur_enabled: resolved.enable_perceptual_blur,
        perceptual_blur_config,

        // Color manipulation
        color_grade_enabled: resolved.enable_color_grade,
        color_grade_params: ColorGradeParams {
            strength: resolved.color_grade_strength,
            vignette_strength: resolved.vignette_strength,
            vignette_softness: resolved.vignette_softness,
            vibrance: resolved.vibrance,
            clarity_strength: resolved.clarity_strength,
            clarity_radius: (constants::CLARITY_RADIUS_SCALE * min_dim as f64).round().max(1.0)
                as usize,
            tone_curve: resolved.tone_curve_strength,
            shadow_tint: constants::DEFAULT_COLOR_GRADE_SHADOW_TINT,
            highlight_tint: constants::DEFAULT_COLOR_GRADE_HIGHLIGHT_TINT,
            // Palette wave adds color harmony; full strength in gallery/special mode,
            // subtle enhancement in regular mode for refined elegance
            palette_wave_strength: if resolved.special_mode {
                constants::GALLERY_PALETTE_WAVE_STRENGTH
            } else {
                constants::REGULAR_PALETTE_WAVE_STRENGTH
            },
        },
        gradient_map_enabled,
        gradient_map_config,

        // Material and iridescence
        champleve_enabled: resolved.enable_champleve,
        champleve_config: ChampleveConfig {
            cell_density: constants::DEFAULT_CHAMPLEVE_CELL_DENSITY,
            flow_alignment: resolved.champleve_flow_alignment,
            interference_amplitude: resolved.champleve_interference_amplitude,
            interference_frequency: constants::DEFAULT_CHAMPLEVE_INTERFERENCE_FREQUENCY,
            rim_intensity: resolved.champleve_rim_intensity,
            rim_warmth: resolved.champleve_rim_warmth,
            rim_sharpness: constants::DEFAULT_CHAMPLEVE_RIM_SHARPNESS,
            interior_lift: resolved.champleve_interior_lift,
            anisotropy: constants::DEFAULT_CHAMPLEVE_ANISOTROPY,
            cell_softness: constants::DEFAULT_CHAMPLEVE_CELL_SOFTNESS,
        },
        aether_enabled: resolved.enable_aether,
        aether_config: AetherConfig {
            filament_density: constants::DEFAULT_AETHER_FILAMENT_DENSITY,
            flow_alignment: resolved.aether_flow_alignment,
            scattering_strength: resolved.aether_scattering_strength,
            scattering_falloff: constants::DEFAULT_AETHER_SCATTERING_FALLOFF,
            iridescence_amplitude: resolved.aether_iridescence_amplitude,
            iridescence_frequency: constants::DEFAULT_AETHER_IRIDESCENCE_FREQUENCY,
            caustic_strength: resolved.aether_caustic_strength,
            caustic_softness: constants::DEFAULT_AETHER_CAUSTIC_SOFTNESS,
            luxury_mode: resolved.special_mode,
        },
        chromatic_bloom_enabled: resolved.enable_chromatic_bloom,
        chromatic_bloom_config: ChromaticBloomConfig {
            radius: chromatic_bloom_radius,
            strength: resolved.chromatic_bloom_strength,
            separation: chromatic_bloom_separation,
            threshold: resolved.chromatic_bloom_threshold,
        },
        opalescence_enabled: resolved.enable_opalescence,
        opalescence_config: OpalescenceConfig {
            strength: resolved.opalescence_strength,
            scale: opalescence_scale_abs,
            layers: resolved.opalescence_layers,
            chromatic_shift: 0.5,
            angle_sensitivity: 0.8,
            pearl_sheen: 0.3,
        },

        // Detail and clarity
        edge_luminance_enabled: resolved.enable_edge_luminance,
        edge_luminance_config: EdgeLuminanceConfig {
            strength: resolved.edge_luminance_strength,
            threshold: resolved.edge_luminance_threshold,
            brightness_boost: resolved.edge_luminance_brightness_boost,
            bright_edges_only: true,
            min_luminance: 0.2,
        },
        micro_contrast_enabled: resolved.enable_micro_contrast,
        micro_contrast_config: MicroContrastConfig {
            strength: resolved.micro_contrast_strength,
            radius: resolved.micro_contrast_radius,
            edge_threshold: 0.15,
            luminance_weight: 0.7,
        },
        glow_enhancement_enabled: resolved.enable_glow,
        glow_enhancement_config: GlowEnhancementConfig {
            strength: resolved.glow_strength,
            threshold: resolved.glow_threshold,
            radius: glow_radius,
            sharpness: resolved.glow_sharpness,
            saturation_boost: resolved.glow_saturation_boost,
        },

        // Atmospheric and surface
        atmospheric_depth_enabled: resolved.enable_atmospheric_depth,
        atmospheric_depth_config: AtmosphericDepthConfig {
            strength: resolved.atmospheric_depth_strength,
            fog_color: (
                resolved.atmospheric_fog_color_r,
                resolved.atmospheric_fog_color_g,
                resolved.atmospheric_fog_color_b,
            ),
            density_threshold: 0.15,
            desaturation: resolved.atmospheric_desaturation,
            darkening: resolved.atmospheric_darkening,
            density_radius: 3,
        },
        crepuscular_rays_enabled: resolved.enable_crepuscular_rays,
        crepuscular_rays_config: CrepuscularRaysConfig {
            strength: resolved.crepuscular_rays_strength,
            density: resolved.crepuscular_rays_density,
            decay: resolved.crepuscular_rays_decay,
            weight: resolved.crepuscular_rays_weight,
            exposure: resolved.crepuscular_rays_exposure,
            light_position: (0.5, 0.5),
            ray_color: (1.0, 0.95, 0.8),
        },
        volumetric_occlusion_enabled: resolved.enable_volumetric_occlusion,
        volumetric_occlusion_config: VolumetricOcclusionConfig {
            strength: resolved.volumetric_occlusion_strength,
            steps: resolved.volumetric_occlusion_radius,
            density_scale: resolved.volumetric_occlusion_density_scale,
            light_angle: resolved.volumetric_occlusion_light_angle,
            shadow_color: (0.0, 0.0, 0.05),
            decay: resolved.volumetric_occlusion_decay,
            shadow_threshold: resolved.volumetric_occlusion_threshold,
        },
        refractive_caustics_enabled: resolved.enable_refractive_caustics,
        refractive_caustics_config: RefractiveCausticsConfig {
            strength: resolved.refractive_caustics_strength,
            scale: resolved.refractive_caustics_ior,
            chromatic_aberration: resolved.refractive_caustics_dispersion,
            brightness: 1.2,
            threshold: resolved.refractive_caustics_threshold,
            focus_sharpness: resolved.refractive_caustics_focus,
            light_angle: 45.0,
        },
        fine_texture_enabled: resolved.enable_fine_texture,
        fine_texture_config: FineTextureConfig {
            texture_type: if resolved.fine_texture_type == 1 {
                TextureType::Impasto
            } else {
                TextureType::Canvas
            },
            strength: resolved.fine_texture_strength,
            scale: fine_texture_scale_abs,
            contrast: resolved.fine_texture_contrast,
            anisotropy: 0.3,
            angle: 0.0,
            light_angle: resolved.fine_texture_light_angle,
            specular_strength: resolved.fine_texture_specular,
        },

        // New "Masterpiece" effects configuration
        event_horizon_enabled: resolved.enable_event_horizon,
        event_horizon_config: EventHorizonConfig {
            strength: resolved.event_horizon_strength,
            mass_scale: resolved.event_horizon_mass_scale,
            gravity_constant: 150.0,
            max_displacement: 35.0,
            chromatic_aberration: 0.008,
            mass_threshold: 0.15,
            softening: 3.0,
        },

        cherenkov_enabled: resolved.enable_cherenkov,
        cherenkov_config: CherenkovConfig {
            strength: resolved.cherenkov_strength,
            threshold: resolved.cherenkov_threshold,
            blur_radius: resolved.cherenkov_blur_radius,
            blue_intensity: 0.85,
            uv_intensity: 0.45,
            cone_angle: 25.0,
            falloff: 2.2,
        },

        cosmic_ink_enabled: resolved.enable_cosmic_ink,
        cosmic_ink_config: CosmicInkConfig {
            strength: resolved.cosmic_ink_strength,
            octaves: 4,
            scale: 0.015,
            swirl_intensity: resolved.cosmic_ink_swirl_intensity,
            diffusion: 0.35,
            ink_color: (0.08, 0.12, 0.18),
            vorticity_strength: 0.55,
        },

        aurora_veils_enabled: resolved.enable_aurora_veils,
        aurora_veils_config: AuroraVeilsConfig {
            strength: resolved.aurora_veils_strength,
            curtain_count: resolved.aurora_veils_curtain_count,
            height_variation: 0.75,
            wave_amplitude: 0.12,
            vertical_falloff: 1.8,
            colors: [
                (0.15, 0.45, 0.35),
                (0.25, 0.65, 0.45),
                (0.55, 0.35, 0.65),
                (0.75, 0.55, 0.75),
            ],
            shimmer_frequency: 0.8,
            edge_softness: 0.65,
        },

        prismatic_halos_enabled: resolved.enable_prismatic_halos,
        prismatic_halos_config: PrismaticHalosConfig {
            strength: resolved.prismatic_halos_strength,
            threshold: resolved.prismatic_halos_threshold,
            inner_radius: 25.0,
            outer_radius: 65.0,
            chromatic_separation: 0.35,
            sharpness: 2.5,
            ring_count: 3,
        },

        dimensional_glitch_enabled: resolved.enable_dimensional_glitch,
        dimensional_glitch_config: DimensionalGlitchConfig {
            strength: resolved.dimensional_glitch_strength,
            threshold: resolved.dimensional_glitch_threshold,
            block_displacement: 8.0,
            channel_separation: 4.0,
            scanline_intensity: 0.25,
            quantization_levels: 12.0,
            block_size: 8,
        },
        deep_space_enabled: resolved.enable_deep_space,
        deep_space_config: DeepSpaceConfig {
            strength: if resolved.enable_deep_space { 0.35 } else { 0.0 },
            gas_density: 0.65,
            scattering_coeff: 0.85,
            absorption_coeff: 0.12,
            gas_color: [0.06, 0.12, 0.24],
            noise_seed: resolved.noise_seed as i64,
            base_frequency: 0.0018,
            octaves: 4,
            illumination_scale: 1.8,
            illumination_radius: (0.15 * min_dim as f64).max(100.0),
        },

        // NEW: Museum Quality Upgrade effects
        halation_enabled: resolved.enable_halation,
        halation_config: HalationConfig {
            strength: resolved.halation_strength,
            threshold: resolved.halation_threshold,
            radius_scale: resolved.halation_radius_scale,
            warmth: resolved.halation_warmth,
            softness: resolved.halation_softness,
            downsample_factor: 2,
        },

        dodge_burn_enabled: resolved.enable_dodge_burn,
        dodge_burn_config: DodgeBurnConfig {
            strength: resolved.dodge_burn_strength,
            dodge_amount: resolved.dodge_burn_dodge_amount,
            burn_amount: resolved.dodge_burn_burn_amount,
            saliency_radius_scale: resolved.dodge_burn_saliency_radius,
            luminance_weight: resolved.dodge_burn_luminance_weight,
            downsample_factor: 2,
        },
    }
}

// ====================== PASS 1 (SPECTRAL) ===========================

/// Pass 1: gather global histogram for final color leveling (spectral).
///
/// This function renders all frames and collects color histogram data
/// for computing optimal black/white levels, ensuring consistent exposure
/// across the entire video sequence.
pub fn pass_1_build_histogram_spectral(
    params: &RenderParams<'_>,
    all_r: &mut Vec<f64>,
    all_g: &mut Vec<f64>,
    all_b: &mut Vec<f64>,
) -> Result<()> {
    let positions = params.scene.positions;
    let colors = params.scene.colors;
    let body_alphas = params.scene.body_alphas;

    // Use shared render loop context
    let mut loop_ctx = RenderLoopContext::new(params);

    // Create histogram storage
    let pixel_stride = params.render_config.histogram_pixel_stride.max(1);
    let samples_per_frame =
        ((params.width() as usize).div_ceil(pixel_stride) * (params.height() as usize).div_ceil(pixel_stride))
            .max(1);
    // Conservative capacity estimate: a small multiple of one sampled frame.
    let mut histogram = HistogramData::with_capacity(samples_per_frame * 16);

    for step in 0..loop_ctx.total_steps() {
        // Progress logging
        if step % loop_ctx.chunk_line() == 0 {
            let pct = (step as f64 / loop_ctx.total_steps() as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 1, mode = "spectral", "Histogram pass progress");
        }

        // Draw step using shared context
        loop_ctx.draw_step(step, positions, colors, body_alphas);

        // Emit frame if needed
        if loop_ctx.should_emit_frame(step) {
            // Histogram pass operates on the *raw trajectory RGBA* (premultiplied),
            // before exposure normalization and before any post-processing effects.
            // This keeps Pass 1 cheap and ensures levels represent the true source signal.
            let trajectory_rgba = loop_ctx.snapshot_trajectory_rgba_for_histogram();

            // Collect sampled histogram data (grid sampling to keep memory bounded)
            histogram.reserve(samples_per_frame);
            push_pixels_to_histogram_sampled(
                &mut histogram,
                trajectory_rgba,
                params.width() as usize,
                params.height() as usize,
                pixel_stride,
            );
        }
    }

    // Extract channels
    let (extracted_r, extracted_g, extracted_b) = histogram.extract_channels();
    *all_r = extracted_r;
    *all_g = extracted_g;
    *all_b = extracted_b;

    info!("   pass 1 (spectral histogram): 100% done");
    Ok(())
}

/// Push sampled premultiplied RGB samples into the histogram.
///
/// We use grid sampling (stride) to keep Pass 1 fast and memory-bounded.
/// Percentiles are robust to this level of sampling for typical frame sizes.
#[inline]
fn push_pixels_to_histogram_sampled(
    histogram: &mut HistogramData,
    pixels: &[(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    stride: usize,
) {
    debug_assert!(stride >= 1);
    for y in (0..height).step_by(stride) {
        let row = y * width;
        for x in (0..width).step_by(stride) {
            let (r, g, b, _a) = pixels[row + x];
            histogram.push(r, g, b);
        }
    }
}

// ====================== PASS 2 (SPECTRAL) ===========================

/// Pass 2: final frames => color mapping => write frames (spectral, 16-bit output).
///
/// This function renders all frames with histogram-derived color level adjustments,
/// applies tonemapping, and writes 16-bit RGB frames to the provided sink for encoding.
pub fn pass_2_write_frames_spectral(
    params: &RenderParams<'_>,
    _levels: &ChannelLevels,
    mut frame_sink: impl FnMut(&[u8]) -> Result<()>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u16>, Vec<u16>>>,
) -> Result<()> {
    let positions = params.scene.positions;
    let colors = params.scene.colors;
    let body_alphas = params.scene.body_alphas;
    let resolved_config = params.resolved_config;

    // Use shared render loop context
    let mut loop_ctx = RenderLoopContext::new(params);
    let pixel_count = loop_ctx.ctx().pixel_count();
    let width = params.width() as usize;

    for step in 0..loop_ctx.total_steps() {
        // Progress logging
        if step % loop_ctx.chunk_line() == 0 {
            let pct = (step as f64 / loop_ctx.total_steps() as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 2, mode = "spectral", "Render pass progress");
        }

        // Draw step using shared context
        loop_ctx.draw_step(step, positions, colors, body_alphas);

        // Emit frame if needed
        if loop_ctx.should_emit_frame(step) {
            let frame_number = step / loop_ctx.frame_interval();
            let final_frame_pixels = loop_ctx.process_frame(frame_number, resolved_config)?;

            // MUSEUM QUALITY FIX: Data is already normalized [0, 1] in process_frame.
            // We pass identity levels to tonemapping to avoid double-normalization.
            let identity_levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

            // Tonemap to 16-bit
            let mut buf_16bit = vec![0u16; pixel_count * 3];
            buf_16bit
                .par_chunks_mut(3)
                .enumerate()
                .zip(final_frame_pixels.par_iter())
                .for_each(|((idx, chunk), &(fr, fg, fb, fa))| {
                    let x = idx % width;
                    let y = idx / width;
                    let mapped = tonemap_to_16bit_dithered(fr, fg, fb, fa, &identity_levels, x, y);
                    chunk[0] = mapped[0];
                    chunk[1] = mapped[1];
                    chunk[2] = mapped[2];
                });

            // Convert to bytes for FFmpeg (little-endian rgb48le format)
            let buf_bytes: &[u8] = bytemuck::cast_slice(&buf_16bit);

            frame_sink(buf_bytes)?;

            if loop_ctx.is_final_step(step) {
                *last_frame_out = ImageBuffer::from_raw(params.width(), params.height(), buf_16bit);
            }
        }
    }
    info!("   pass 2 (spectral render): 100% done");
    Ok(())
}

// ====================== SINGLE FRAME RENDERING ===========================

/// Render a single test frame (first frame only) for quick testing (16-bit output).
///
/// This function is optimized for rapid iteration and parameter testing.
pub fn render_single_frame_spectral(
    params: &RenderParams<'_>,
    levels: &ChannelLevels,
) -> Result<ImageBuffer<Rgb<u16>, Vec<u16>>> {
    info!("   Rendering first frame only (test mode)...");

    let positions = params.scene.positions;
    let colors = params.scene.colors;
    let body_alphas = params.scene.body_alphas;
    let resolved_config = params.resolved_config;
    let noise_seed = params.noise_seed;
    let render_config = params.render_config;

    let width = resolved_config.width;
    let height = resolved_config.height;
    let special_mode = resolved_config.special_mode;

    // Create render context
    let ctx = context::RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Build effect configuration
    let effect_config = build_effect_config_from_resolved(resolved_config);
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create nebula configuration
    let nebula_config = NebulaCloudConfig {
        strength: resolved_config.nebula_strength,
        octaves: resolved_config.nebula_octaves,
        base_frequency: resolved_config.nebula_base_frequency,
        lacunarity: 2.0,
        persistence: 0.5,
        noise_seed: noise_seed as i64,
        colors: [[0.08, 0.12, 0.22], [0.15, 0.08, 0.25], [0.25, 0.12, 0.18], [0.12, 0.15, 0.28]],
        // Cinematic drift rate (avoid flicker/boiling noise in video)
        time_scale: constants::NEBULA_TIME_SCALE,
        edge_fade: 0.3,
    };

    let total_steps = positions[0].len();
    let dt = constants::DEFAULT_DT;

    // Create velocity HDR calculator
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

    let empty_background = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    let frame_interval = (total_steps / constants::DEFAULT_TARGET_FRAMES as usize).max(1);
    let first_frame_step = frame_interval;

    for step in 0..=first_frame_step {
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let c0 = colors[0][step];
        let c1 = colors[1][step];
        let c2 = colors[2][step];

        let a0 = body_alphas[0];
        let a1 = body_alphas[1];
        let a2 = body_alphas[2];

        let (x0, y0) = ctx.to_pixel(p0[0], p0[1]);
        let (x1, y1) = ctx.to_pixel(p1[0], p1[1]);
        let (x2, y2) = ctx.to_pixel(p2[0], p2[1]);

        let hdr_mult_01 = velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = velocity_calc.compute_segment_multiplier(step, 2, 0);

        drawing::draw_line_segment_aa_spectral_with_dispersion(
            &mut accum_spd,
            width,
            height,
            x0,
            y0,
            x1,
            y1,
            c0,
            c1,
            a0,
            a1,
            render_config.hdr_scale * hdr_mult_01,
            special_mode,
        );
        drawing::draw_line_segment_aa_spectral_with_dispersion(
            &mut accum_spd,
            width,
            height,
            x1,
            y1,
            x2,
            y2,
            c1,
            c2,
            a1,
            a2,
            render_config.hdr_scale * hdr_mult_12,
            special_mode,
        );
        drawing::draw_line_segment_aa_spectral_with_dispersion(
            &mut accum_spd,
            width,
            height,
            x2,
            y2,
            x0,
            y0,
            c2,
            c0,
            a2,
            a0,
            render_config.hdr_scale * hdr_mult_20,
            special_mode,
        );
    }

    // Process the accumulated frame
    pipeline::apply_energy_density_shift(&mut accum_spd, special_mode);
    convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

    // MUSEUM QUALITY FIX: Normalize exposure BEFORE effects
    // This is the manual path for test frames (RenderLoopContext not used here)
    apply_exposure_normalization(&mut accum_rgba, levels, render_config.exposure_normalization);

    // Get current body positions for the test frame
    let mut current_body_positions = Vec::with_capacity(3);
    for body_pos in positions.iter().take(3) {
        let p = body_pos[first_frame_step];
        let (px, py) = ctx.to_pixel(p[0], p[1]);
        current_body_positions.push((px as f64, py as f64));
    }

    let frame_params = FrameParams {
        frame_number: 0,
        _density: None,
        body_positions: Some(current_body_positions),
    };

    // MUSEUM QUALITY PIPELINE SPLIT:
    // Stage 1: Process trajectories ONLY
    let trajectory_pixels = effect_chain
        .process_trajectories(accum_rgba, width as usize, height as usize, &frame_params)?;

    // Stage 2: Generate nebula background
    let mut nebula_background = if special_mode && resolved_config.nebula_strength > 0.0 {
        pipeline::generate_nebula_background(width as usize, height as usize, 0, &nebula_config)?
    } else {
        empty_background
    };

    if special_mode && resolved_config.nebula_strength > 0.0 {
        pipeline::apply_subject_aware_nebula_mask(
            &mut nebula_background,
            &trajectory_pixels,
            width as usize,
            height as usize,
        );
    }

    // Stage 3: Composite
    let composited = pipeline::composite_buffers(&nebula_background, &trajectory_pixels);

    // Stage 4: Scene-level finishing
    let final_pixels = effect_chain
        .process_finishing(composited, width as usize, height as usize, &frame_params)?;

    // Tonemap to 16-bit
    let identity_levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

    // Tonemap to 16-bit with blue-noise dithering (sub-visible, prevents banding).
    let pixel_count = ctx.pixel_count();
    let mut buf_16bit = vec![0u16; pixel_count * 3];
    let w_usize = width as usize;
    buf_16bit
        .par_chunks_mut(3)
        .enumerate()
        .zip(final_pixels.par_iter())
        .for_each(|((idx, chunk), &(fr, fg, fb, fa))| {
            let x = idx % w_usize;
            let y = idx / w_usize;
            let mapped = tonemap_to_16bit_dithered(fr, fg, fb, fa, &identity_levels, x, y);
            chunk[0] = mapped[0];
            chunk[1] = mapped[1];
            chunk[2] = mapped[2];
        });

    // Create ImageBuffer and return
    let image = ImageBuffer::from_raw(width, height, buf_16bit).ok_or_else(|| {
        RenderError::ImageEncoding("Failed to create 16-bit image buffer".to_string())
    })?;

    Ok(image)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_histogram_collection_uses_premultiplied_rgb() {
        // Regression test for the α² bug in histogram sampling.
        // If we mistakenly multiply premultiplied RGB by alpha again, values scale as α².
        let mut histogram = HistogramData::with_capacity(4);
        let pixels: Vec<(f64, f64, f64, f64)> = vec![
            // Straight red=1.0 with alpha=0.5 => premult red=0.5
            (0.5, 0.0, 0.0, 0.5),
        ];

        push_pixels_to_histogram_sampled(&mut histogram, &pixels, 1, 1, 1);
        let (r, g, b) = histogram.extract_channels();

        assert_eq!(r.len(), 1);
        assert!((r[0] - 0.5).abs() < 1e-12, "Expected premult R=0.5, got {}", r[0]);
        assert!((g[0] - 0.0).abs() < 1e-12);
        assert!((b[0] - 0.0).abs() < 1e-12);
    }
}
