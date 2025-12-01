//! Rendering module: histogram passes, color mapping, line drawing, and output
//!
//! This module provides a complete rendering pipeline for the three-body problem visualization,
//! including coordinate transformations, line drawing, post-processing effects, and video output.

use crate::post_effects::{
    ChromaticBloomConfig, GradientMapConfig, LuxuryPalette, NebulaCloudConfig, NebulaClouds,
    PerceptualBlurConfig,
};
use crate::spectrum::NUM_BINS;
use rayon::prelude::*;
use std::sync::LazyLock;
use tracing::{debug, info};

// Module declarations
pub mod batch_drawing;
pub mod buffer_pool;
pub mod color;
pub mod constants;
pub mod context;
pub mod drawing;
pub mod effect_randomizer;
pub mod effects;
pub mod error;
pub mod histogram;
pub mod parameter_descriptors;
pub mod randomizable_config;
pub mod simd_tonemap;
pub mod types;
pub mod velocity_hdr;
pub mod video;

// Import from our submodules
use self::batch_drawing::{draw_triangle_batch_spectral, prepare_triangle_vertices};
use self::context::{PixelBuffer, RenderContext};
use self::effects::{EffectChainBuilder, EffectConfig, FrameParams, convert_spd_buffer_to_rgba};
use self::error::{RenderError, Result};
use self::histogram::HistogramData;

// Re-export core types and functions for public API compatibility
pub use color::{OklabColor, generate_body_color_sequences};
#[allow(unused_imports)]
pub use drawing::{draw_line_segment_aa_spectral_with_dispersion, parallel_blur_2d_rgba};
pub use effects::{DogBloomConfig, ExposureCalculator, apply_dog_bloom};
pub use histogram::compute_black_white_gamma;
// Re-export all types as part of public library API (not used internally, but part of API contract)
#[allow(unused_imports)] // Public API re-exports for library consumers
pub use types::{
    BloomConfig, BlurConfig, ChannelLevels, HdrConfig, PerceptualBlurSettings, RenderConfig,
    RenderParams, Resolution, SceneData, SceneDataRef,
};
pub use video::VideoEncodingOptions;
// Re-export retry functionality for library consumers
#[allow(unused_imports)] // Public API for library consumers
pub use video::{EncodingStrategy, create_video_from_frames_singlepass, create_video_with_retry};

// Re-export types from dependencies used in public API
pub use image::{DynamicImage, ImageBuffer, Rgb};

/// Core tonemapping function (shared logic for both 8-bit and 16-bit)
/// Returns final RGB channels in 0.0-1.0 range
#[inline]
fn tonemap_core(fr: f64, fg: f64, fb: f64, fa: f64, levels: &ChannelLevels) -> [f64; 3] {
    let alpha = fa.clamp(0.0, 1.0);
    if alpha <= 0.0 {
        return [0.0, 0.0, 0.0];
    }

    let source = [fr.max(0.0), fg.max(0.0), fb.max(0.0)];
    let premult = [source[0] * alpha, source[1] * alpha, source[2] * alpha];
    if premult[0] <= 0.0 && premult[1] <= 0.0 && premult[2] <= 0.0 {
        return [0.0, 0.0, 0.0];
    }

    let mut leveled = [0.0; 3];
    for i in 0..3 {
        leveled[i] = ((premult[i] - levels.black[i]).max(0.0)) / levels.range[i];
    }

    let mut channel_curves = [0.0; 3];
    for i in 0..3 {
        channel_curves[i] = ACES_LUT.apply(leveled[i]);
    }

    let target_luma =
        0.2126 * channel_curves[0] + 0.7152 * channel_curves[1] + 0.0722 * channel_curves[2];

    if target_luma <= 0.0 {
        return [0.0, 0.0, 0.0];
    }

    let straight_luma = 0.2126 * source[0] + 0.7152 * source[1] + 0.0722 * source[2];
    // Enhanced chroma preservation for vivid, saturated colors
    let chroma_preserve = (alpha / (alpha + constants::CHROMA_PRESERVE_FACTOR)).clamp(0.0, 1.0);

    let mut final_channels = [0.0; 3];
    if straight_luma > 0.0 {
        for i in 0..3 {
            final_channels[i] = channel_curves[i] * (1.0 - chroma_preserve)
                + (source[i] / straight_luma) * target_luma * chroma_preserve;
        }
    } else {
        final_channels = channel_curves;
    }

    // Reduced neutral mixing for more vibrant low-alpha regions
    let neutral_mix = ((constants::NEUTRAL_MIX_ALPHA_THRESHOLD - alpha).max(0.0)
        / constants::NEUTRAL_MIX_ALPHA_THRESHOLD)
        .clamp(0.0, 1.0)
        * constants::NEUTRAL_MIX_MAX_STRENGTH;
    if neutral_mix > 0.0 {
        for c in &mut final_channels {
            *c = (*c * (1.0 - neutral_mix) + target_luma * neutral_mix).max(0.0);
        }
    }

    let final_luma =
        0.2126 * final_channels[0] + 0.7152 * final_channels[1] + 0.0722 * final_channels[2];

    if final_luma > 0.0 {
        let scale = target_luma / final_luma;
        for c in &mut final_channels {
            *c *= scale;
        }
    }

    final_channels
}

/// Tonemap to 16-bit (primary output format for maximum precision)
#[inline]
fn tonemap_to_16bit(fr: f64, fg: f64, fb: f64, fa: f64, levels: &ChannelLevels) -> [u16; 3] {
    let channels = tonemap_core(fr, fg, fb, fa, levels);
    [
        (channels[0] * 65535.0).round().clamp(0.0, 65535.0) as u16,
        (channels[1] * 65535.0).round().clamp(0.0, 65535.0) as u16,
        (channels[2] * 65535.0).round().clamp(0.0, 65535.0) as u16,
    ]
}

/// Save 16-bit image as PNG.
///
/// Exports a 16-bit RGB image in PNG format, preserving the full dynamic range
/// for maximum quality.
///
/// # Errors
///
/// Returns `RenderError::ImageEncoding` if PNG encoding or file writing fails.
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::render::save_image_as_png_16bit;
/// # use image::{ImageBuffer, Rgb};
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let final_frame: ImageBuffer<Rgb<u16>, Vec<u16>> = ImageBuffer::new(100, 100);
/// save_image_as_png_16bit(&final_frame, "output.png")?;
/// # Ok(())
/// # }
/// ```
pub fn save_image_as_png_16bit(
    rgb_img: &ImageBuffer<Rgb<u16>, Vec<u16>>,
    path: &str,
) -> Result<()> {
    let dyn_img = DynamicImage::ImageRgb16(rgb_img.clone());
    dyn_img.save(path).map_err(|e| RenderError::ImageEncoding(e.to_string()))?;
    info!("   Saved 16-bit PNG => {path}");
    Ok(())
}

/// Pass 1: gather global histogram for final color leveling
// Enhanced ACES Filmic Tonemapping Curve - refined for maximum beauty
// Based on ACES standard with custom optimization for luminous, jewel-like imagery
// Original ACES: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
// Enhanced to preserve highlights while maintaining rich shadows
const A: f64 = 2.58; // Increased from 2.51 for more highlight preservation
const B: f64 = 0.02; // Reduced from 0.03 for deeper blacks with more punch
const C: f64 = 2.38; // Reduced from 2.43 for stronger midtone contrast
const D: f64 = 0.56; // Reduced from 0.59 for enhanced shadow depth
const E: f64 = 0.12; // Reduced from 0.14 for richer shadow detail

/// Optimized ACES tonemapping using lookup table
struct AcesLut {
    table: Vec<f64>,
    scale: f64,
    max_input: f64,
}

impl AcesLut {
    fn new() -> Self {
        const LUT_SIZE: usize = 2048;
        const MAX_INPUT: f64 = 16.0; // Covers typical HDR range

        let mut table = Vec::with_capacity(LUT_SIZE);
        let scale = (LUT_SIZE - 1) as f64 / MAX_INPUT;

        // Pre-compute ACES values
        for i in 0..LUT_SIZE {
            let x = (i as f64) / scale;
            let y = (x * (A * x + B)) / (x * (C * x + D) + E);
            table.push(y);
        }

        Self { table, scale, max_input: MAX_INPUT }
    }

    #[inline]
    fn apply(&self, x: f64) -> f64 {
        if x <= 0.0 {
            return 0.0;
        }

        if x >= self.max_input {
            // For very large values, use direct computation
            return (x * (A * x + B)) / (x * (C * x + D) + E);
        }

        // Linear interpolation in LUT
        let pos = x * self.scale;
        let idx = pos as usize;
        let frac = pos - idx as f64;

        if idx >= self.table.len() - 1 {
            return self.table[self.table.len() - 1];
        }

        // Linear interpolation
        self.table[idx] * (1.0 - frac) + self.table[idx + 1] * frac
    }
}

// Lazy static for global LUT
static ACES_LUT: LazyLock<AcesLut> = LazyLock::new(AcesLut::new);

// ====================== HELPER FUNCTIONS ===========================

/// Generate nebula background buffer (separate from trajectories)
fn generate_nebula_background(
    width: usize,
    height: usize,
    frame_number: usize,
    config: &NebulaCloudConfig,
) -> Result<PixelBuffer> {
    // Start with empty buffer (black background)
    let background = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    // Apply nebula effect (which adds color without needing alpha tricks)
    let nebula = NebulaClouds::new(config.clone());
    nebula
        .process_with_time(&background, width, height, frame_number)
        .map_err(|e| RenderError::EffectError(e.to_string()))
}

/// Composite background and foreground buffers using enhanced "over" operator
/// Background goes first (underneath), then foreground on top
///
/// This implementation uses a two-stage enhancement to maintain trajectory purity:
/// 1. Alpha boost: Strengthens foreground coverage to reduce background bleed
/// 2. Saturation boost: Restores color richness in trajectory regions
///
/// Note: Background is in straight alpha format (RGB + coverage alpha)
///       Foreground is in premultiplied alpha format (RGB * alpha + alpha)
fn composite_buffers(background: &PixelBuffer, foreground: &PixelBuffer) -> PixelBuffer {
    background
        .par_iter()
        .zip(foreground.par_iter())
        .map(|(&(br, bg, bb, ba), &(fr, fg, fb, fa))| {
            // Stage 1: Apply alpha boost to strengthen trajectory coverage
            let boosted_fa = (fa * constants::COMPOSITE_ALPHA_BOOST_FACTOR).min(1.0);

            if boosted_fa >= 1.0 {
                // Foreground is fully opaque - completely covers background
                (fr, fg, fb, fa)
            } else if boosted_fa <= 0.0 {
                // No foreground - only background visible
                // Convert background from straight to premultiplied for output consistency
                (br * ba, bg * ba, bb * ba, ba)
            } else {
                // Standard "over" compositing with enhanced alpha
                // Result alpha: original fa + background * (1 - boosted_fa)
                let alpha_out = fa + ba * (1.0 - boosted_fa);

                if alpha_out <= 0.0 {
                    (0.0, 0.0, 0.0, 0.0)
                } else {
                    // Composite colors with boosted foreground coverage
                    // Output = premult_foreground + premult_background * (1 - boosted_alpha_foreground)
                    let mut r_out = fr + (br * ba) * (1.0 - boosted_fa);
                    let mut g_out = fg + (bg * ba) * (1.0 - boosted_fa);
                    let mut b_out = fb + (bb * ba) * (1.0 - boosted_fa);

                    // Stage 2: Saturation boost for trajectory-dominant regions
                    // This restores gold richness that may be dulled by nebula bleed
                    if alpha_out > constants::COMPOSITE_SATURATION_THRESHOLD {
                        // Unpremultiply to get straight RGB
                        let sr = r_out / alpha_out;
                        let sg = g_out / alpha_out;
                        let sb = b_out / alpha_out;

                        // Calculate mean luminance
                        let mean = (sr + sg + sb) / 3.0;

                        // Boost saturation: move colors away from mean
                        let boosted_sr =
                            mean + (sr - mean) * constants::COMPOSITE_SATURATION_BOOST_FACTOR;
                        let boosted_sg =
                            mean + (sg - mean) * constants::COMPOSITE_SATURATION_BOOST_FACTOR;
                        let boosted_sb =
                            mean + (sb - mean) * constants::COMPOSITE_SATURATION_BOOST_FACTOR;

                        // Clamp to valid range
                        let clamped_sr = boosted_sr.clamp(0.0, 1.0);
                        let clamped_sg = boosted_sg.clamp(0.0, 1.0);
                        let clamped_sb = boosted_sb.clamp(0.0, 1.0);

                        // Re-premultiply
                        r_out = clamped_sr * alpha_out;
                        g_out = clamped_sg * alpha_out;
                        b_out = clamped_sb * alpha_out;
                    }

                    (r_out, g_out, b_out, alpha_out)
                }
            }
        })
        .collect()
}

/// Build effect configuration from resolved randomizable config
///
/// Creates a fully configured EffectConfig from a ResolvedEffectConfig with all
/// parameters determined (either explicitly set or randomized).
fn build_effect_config_from_resolved(
    resolved: &randomizable_config::ResolvedEffectConfig,
) -> EffectConfig {
    use crate::oklab::GamutMapMode;
    use crate::post_effects::{
        AetherConfig, AtmosphericDepthConfig, AuroraVeilsConfig, ChampleveConfig, CherenkovConfig,
        ColorGradeParams, CosmicInkConfig, CrepuscularRaysConfig, DimensionalGlitchConfig,
        EdgeLuminanceConfig, EventHorizonConfig, FineTextureConfig, GlowEnhancementConfig,
        MicroContrastConfig, OpalescenceConfig, PrismaticHalosConfig, RefractiveCausticsConfig,
        VolumetricOcclusionConfig, fine_texture::TextureType,
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
            radius: blur_radius_px, // Use main blur radius
            strength: resolved.perceptual_blur_strength,
            gamut_mode: GamutMapMode::PreserveHue, // Fixed mode
        })
    } else {
        None
    };

    // Determine gradient map settings (only enabled in special mode or if explicitly enabled)
    let gradient_map_enabled = resolved.enable_gradient_map && resolved.special_mode;
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
        hdr_mode: "auto".to_string(),
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
            palette_wave_strength: if resolved.special_mode { 1.0 } else { 0.0 },
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
            chromatic_shift: 0.5,   // Fixed
            angle_sensitivity: 0.8, // Fixed
            pearl_sheen: 0.3,       // Fixed
        },

        // Detail and clarity
        edge_luminance_enabled: resolved.enable_edge_luminance,
        edge_luminance_config: EdgeLuminanceConfig {
            strength: resolved.edge_luminance_strength,
            threshold: resolved.edge_luminance_threshold,
            brightness_boost: resolved.edge_luminance_brightness_boost,
            bright_edges_only: true, // Fixed
            min_luminance: 0.2,      // Fixed
        },
        micro_contrast_enabled: resolved.enable_micro_contrast,
        micro_contrast_config: MicroContrastConfig {
            strength: resolved.micro_contrast_strength,
            radius: resolved.micro_contrast_radius,
            edge_threshold: 0.15,  // Fixed
            luminance_weight: 0.7, // Fixed
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
            density_threshold: 0.15, // Fixed
            desaturation: resolved.atmospheric_desaturation,
            darkening: resolved.atmospheric_darkening,
            density_radius: 3, // Fixed
        },
        crepuscular_rays_enabled: resolved.enable_crepuscular_rays,
        crepuscular_rays_config: CrepuscularRaysConfig {
            strength: resolved.crepuscular_rays_strength,
            density: resolved.crepuscular_rays_density,
            decay: resolved.crepuscular_rays_decay,
            weight: resolved.crepuscular_rays_weight,
            exposure: resolved.crepuscular_rays_exposure,
            light_position: (0.5, 0.5),  // Fixed to center for orbits
            ray_color: (1.0, 0.95, 0.8), // Fixed warm golden color
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
            anisotropy: 0.3, // Fixed
            angle: 0.0,      // Fixed
            light_angle: resolved.fine_texture_light_angle,
            specular_strength: resolved.fine_texture_specular,
        },

        // New "Masterpiece" effects configuration
        event_horizon_enabled: resolved.enable_event_horizon,
        event_horizon_config: EventHorizonConfig {
            strength: resolved.event_horizon_strength,
            mass_scale: resolved.event_horizon_mass_scale,
            gravity_constant: 150.0,     // Fixed
            max_displacement: 35.0,      // Fixed
            chromatic_aberration: 0.008, // Fixed
            mass_threshold: 0.15,        // Fixed
            softening: 3.0,              // Fixed
        },

        cherenkov_enabled: resolved.enable_cherenkov,
        cherenkov_config: CherenkovConfig {
            strength: resolved.cherenkov_strength,
            threshold: resolved.cherenkov_threshold,
            blur_radius: resolved.cherenkov_blur_radius,
            blue_intensity: 0.85, // Fixed
            uv_intensity: 0.45,   // Fixed
            cone_angle: 25.0,     // Fixed
            falloff: 2.2,         // Fixed
        },

        cosmic_ink_enabled: resolved.enable_cosmic_ink,
        cosmic_ink_config: CosmicInkConfig {
            strength: resolved.cosmic_ink_strength,
            octaves: 4,   // Fixed
            scale: 0.015, // Fixed
            swirl_intensity: resolved.cosmic_ink_swirl_intensity,
            diffusion: 0.35,               // Fixed
            ink_color: (0.08, 0.12, 0.18), // Fixed
            vorticity_strength: 0.55,      // Fixed
        },

        aurora_veils_enabled: resolved.enable_aurora_veils,
        aurora_veils_config: AuroraVeilsConfig {
            strength: resolved.aurora_veils_strength,
            curtain_count: resolved.aurora_veils_curtain_count,
            height_variation: 0.75, // Fixed
            wave_amplitude: 0.12,   // Fixed
            vertical_falloff: 1.8,  // Fixed
            colors: [
                (0.15, 0.45, 0.35),
                (0.25, 0.65, 0.45),
                (0.55, 0.35, 0.65),
                (0.75, 0.55, 0.75),
            ], // Fixed palette
            shimmer_frequency: 0.8, // Fixed
            edge_softness: 0.65,    // Fixed
        },

        prismatic_halos_enabled: resolved.enable_prismatic_halos,
        prismatic_halos_config: PrismaticHalosConfig {
            strength: resolved.prismatic_halos_strength,
            threshold: resolved.prismatic_halos_threshold,
            inner_radius: 25.0,         // Fixed
            outer_radius: 65.0,         // Fixed
            chromatic_separation: 0.35, // Fixed
            sharpness: 2.5,             // Fixed
            ring_count: 3,              // Fixed
        },

        dimensional_glitch_enabled: resolved.enable_dimensional_glitch,
        dimensional_glitch_config: DimensionalGlitchConfig {
            strength: resolved.dimensional_glitch_strength,
            threshold: resolved.dimensional_glitch_threshold,
            block_displacement: 8.0,   // Fixed
            channel_separation: 4.0,   // Fixed
            scanline_intensity: 0.25,  // Fixed
            quantization_levels: 12.0, // Fixed
            block_size: 8,             // Fixed
        },
    }
}

/// Apply energy density wavelength shift to spectral buffer
/// Hot regions (high energy) shift toward red, cool regions stay blue
fn apply_energy_density_shift(accum_spd: &mut [[f64; NUM_BINS]], special_mode: bool) {
    if !special_mode {
        return;
    }

    use constants::{ENERGY_DENSITY_SHIFT_STRENGTH, ENERGY_DENSITY_SHIFT_THRESHOLD};

    accum_spd.par_iter_mut().for_each(|spd| {
        // Calculate total energy in this pixel
        let total_energy: f64 = spd.iter().sum();

        // If energy is below threshold, no shift needed
        if total_energy < ENERGY_DENSITY_SHIFT_THRESHOLD {
            return;
        }

        // Calculate shift amount (excess energy above threshold)
        let excess_energy = total_energy - ENERGY_DENSITY_SHIFT_THRESHOLD;
        let shift_amount = (excess_energy * ENERGY_DENSITY_SHIFT_STRENGTH).min(1.0);

        // Apply redshift: move energy from lower bins (blue) to higher bins (red)
        // We blur the spectrum toward the red end
        let mut shifted_spd = *spd;
        for i in (1..NUM_BINS).rev() {
            // Each bin receives energy from the bin below it (blueshift → redshift)
            shifted_spd[i] = spd[i] * (1.0 - shift_amount) + spd[i - 1] * shift_amount;
        }
        // First bin only loses energy
        shifted_spd[0] = spd[0] * (1.0 - shift_amount);

        *spd = shifted_spd;
    });
}

// ====================== RENDER LOOP CONTEXT ===========================

/// Memory workspace for rendering operations
///
/// This struct manages all heap-allocated buffers used during rendering,
/// separating memory management concerns from rendering logic.
///
/// # Performance
///
/// - Pre-allocated buffers avoid per-frame allocations
/// - Reusable workspace reduces GC pressure
/// - Clear separation allows future optimizations (e.g., arena allocation)
struct RenderWorkspace {
    /// Spectral power distribution accumulator (HDR, per-wavelength)
    accum_spd: Vec<[f64; NUM_BINS]>,

    /// RGBA accumulator (post-SPD conversion)
    accum_rgba: PixelBuffer,

    /// Pre-allocated empty background buffer (reused when nebula disabled)
    empty_background: PixelBuffer,
}

impl RenderWorkspace {
    /// Create a new workspace with pre-allocated buffers
    fn new(pixel_count: usize) -> Self {
        Self {
            accum_spd: vec![[0.0f64; NUM_BINS]; pixel_count],
            accum_rgba: vec![(0.0, 0.0, 0.0, 0.0); pixel_count],
            empty_background: vec![(0.0, 0.0, 0.0, 0.0); pixel_count],
        }
    }

    /// Reset buffers for reuse (clearing without reallocation)
    fn reset(&mut self) {
        // Clear RGBA buffer for next frame (SPD cleared during conversion)
        self.accum_rgba.clear();
        self.accum_rgba.resize(self.empty_background.len(), (0.0, 0.0, 0.0, 0.0));
    }
}

/// Context for the render loop, encapsulating rendering logic
///
/// This struct separates rendering **logic** from memory management,
/// making the control flow clearer and easier to test.
///
/// # Design
///
/// - **Logic**: Effect chain, coordinate transforms, velocity calculations
/// - **Memory**: Separate `RenderWorkspace` handles all buffers
/// - **Configuration**: Immutable rendering parameters
struct RenderLoopContext<'a> {
    // Rendering logic components
    ctx: RenderContext,
    effect_chain: EffectChainBuilder,
    nebula_config: NebulaCloudConfig,
    velocity_calc: velocity_hdr::VelocityHdrCalculator<'a>,

    // Memory workspace (separated for clarity)
    workspace: RenderWorkspace,

    // Immutable configuration
    total_steps: usize,
    chunk_line: usize,
    frame_interval: usize,
    width: u32,
    height: u32,
    special_mode: bool,
    hdr_scale: f64,
}

impl<'a> RenderLoopContext<'a> {
    /// Create a new render loop context from render parameters
    ///
    /// # Architecture
    ///
    /// This constructor separates concerns:
    /// 1. **Memory Allocation**: `RenderWorkspace` handles all buffers
    /// 2. **Logic Setup**: Effect chains, coordinate transforms
    /// 3. **Configuration**: Immutable parameters extracted from params
    fn new(params: &'a RenderParams<'a>) -> Self {
        let positions = params.scene.positions;
        let resolved_config = params.resolved_config;
        let noise_seed = params.noise_seed;

        let width = resolved_config.width;
        let height = resolved_config.height;
        let special_mode = resolved_config.special_mode;

        // Create render context (coordinate transforms, bounding box)
        let ctx = RenderContext::new(width, height, positions);
        let pixel_count = ctx.pixel_count();

        // Allocate memory workspace (separated from logic)
        let workspace = RenderWorkspace::new(pixel_count);

        // Build effect configuration from resolved config
        let effect_config = build_effect_config_from_resolved(resolved_config);
        let effect_chain = EffectChainBuilder::new(effect_config);

        // Create nebula configuration (immutable parameters)
        let nebula_config = NebulaCloudConfig {
            strength: resolved_config.nebula_strength,
            octaves: resolved_config.nebula_octaves,
            base_frequency: resolved_config.nebula_base_frequency,
            lacunarity: 2.0,
            persistence: 0.5,
            noise_seed: noise_seed as i64,
            colors: [
                [0.08, 0.12, 0.22], // Deep blue
                [0.15, 0.08, 0.25], // Purple
                [0.25, 0.12, 0.18], // Magenta
                [0.12, 0.15, 0.28], // Blue-violet
            ],
            time_scale: 1.0,
            edge_fade: 0.3,
        };

        let total_steps = positions[0].len();
        let chunk_line = (total_steps / 10).max(1);
        let dt = constants::DEFAULT_DT;

        // Create velocity HDR calculator (logic component)
        let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

        Self {
            ctx,
            effect_chain,
            nebula_config,
            velocity_calc,
            workspace,
            total_steps,
            chunk_line,
            frame_interval: params.frame_interval,
            width,
            height,
            special_mode,
            hdr_scale: params.render_config.hdr_scale,
        }
    }

    /// Draw a single step of the simulation to the accumulation buffers
    ///
    /// # Performance
    ///
    /// Inlined for hot path optimization. This is called millions of times
    /// during a full render, so every cycle counts.
    #[inline]
    fn draw_step(
        &mut self,
        step: usize,
        positions: &[Vec<nalgebra::Vector3<f64>>],
        colors: &[Vec<OklabColor>],
        body_alphas: &[f64],
    ) {
        // Prepare triangle vertices (coordinate transform)
        let vertices = prepare_triangle_vertices(
            positions,
            colors,
            &[body_alphas[0], body_alphas[1], body_alphas[2]],
            step,
            &self.ctx,
        );

        // Compute velocity-based HDR multipliers (physics-based brightness)
        let hdr_mult_01 = self.velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = self.velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = self.velocity_calc.compute_segment_multiplier(step, 2, 0);

        // Draw entire triangle in batch (writes to workspace.accum_spd)
        draw_triangle_batch_spectral(
            &mut self.workspace.accum_spd,
            self.width,
            self.height,
            vertices[0],
            vertices[1],
            vertices[2],
            hdr_mult_01,
            hdr_mult_12,
            hdr_mult_20,
            self.hdr_scale,
            self.special_mode,
        );
    }

    /// Process a frame and return the final composited pixels
    ///
    /// # Pipeline
    ///
    /// 1. Apply energy density wavelength shift (special mode only)
    /// 2. Convert spectral data (SPD) to RGBA
    /// 3. Apply post-processing effect chain
    /// 4. Generate nebula background (if enabled)
    /// 5. Composite background under foreground
    /// 6. Reset workspace for next frame
    ///
    /// # Memory Management
    ///
    /// Uses `std::mem::take` to avoid cloning large buffers, then resets
    /// the workspace for reuse. This eliminates per-frame allocations.
    fn process_frame(
        &mut self,
        frame_number: usize,
        resolved_config: &randomizable_config::ResolvedEffectConfig,
    ) -> Result<PixelBuffer> {
        // Apply energy density wavelength shift before conversion (special mode)
        apply_energy_density_shift(&mut self.workspace.accum_spd, self.special_mode);

        // Convert SPD -> RGBA (spectral rendering to RGB color space)
        convert_spd_buffer_to_rgba(&self.workspace.accum_spd, &mut self.workspace.accum_rgba);

        // Process with effect chain (take ownership to avoid clone)
        let frame_params = FrameParams { _frame_number: frame_number, _density: None };
        let rgba_buffer = std::mem::take(&mut self.workspace.accum_rgba);
        let trajectory_pixels = self
            .effect_chain
            .process_frame(rgba_buffer, self.width as usize, self.height as usize, &frame_params)
            .map_err(|e| RenderError::EffectError(e.to_string()))?;

        // Reset workspace for next frame (reuses allocations)
        self.workspace.reset();

        // Generate nebula background (or reuse empty buffer for zero overhead)
        let nebula_background = if self.special_mode && resolved_config.nebula_strength > 0.0 {
            generate_nebula_background(
                self.width as usize,
                self.height as usize,
                frame_number,
                &self.nebula_config,
            )?
        } else {
            // Zero-cost path when nebula disabled (no clone, just reference)
            self.workspace.empty_background.clone()
        };

        // Composite nebula background under trajectory foreground
        Ok(composite_buffers(&nebula_background, &trajectory_pixels))
    }

    /// Check if we should emit a frame at this step
    #[inline]
    fn should_emit_frame(&self, step: usize) -> bool {
        let is_final = step == self.total_steps - 1;
        (step > 0 && step.is_multiple_of(self.frame_interval)) || is_final
    }

    /// Check if this is the final step
    #[inline]
    fn is_final_step(&self, step: usize) -> bool {
        step == self.total_steps - 1
    }
}

// ====================== PASS 1 (SPECTRAL) ===========================
/// Pass 1: gather global histogram for final color leveling (spectral).
///
/// This function renders all frames and collects color histogram data
/// for computing optimal black/white levels, ensuring consistent exposure
/// across the entire video sequence.
///
/// # Arguments
///
/// * `params` - Grouped rendering parameters (scene, config, etc.)
/// * `all_r` - Output buffer for red channel histogram values
/// * `all_g` - Output buffer for green channel histogram values
/// * `all_b` - Output buffer for blue channel histogram values
///
/// # Errors
///
/// Returns `RenderError::EffectError` if any post-processing effect fails during histogram collection.
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::render::{pass_1_build_histogram_spectral, RenderParams, SceneDataRef, RenderConfig};
/// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # use nalgebra::Vector3;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let positions = vec![vec![Vector3::zeros(); 100]; 3];
/// # let colors = vec![vec![(0.5, 0.0, 0.0); 100]; 3];
/// # let body_alphas = vec![1.0; 3];
/// # let scene = SceneDataRef::new(&positions, &colors, &body_alphas);
/// # let seed = b"test";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// # let (resolved_config, _log) = RandomizableEffectConfig::default().resolve(&mut rng, 1920, 1080, false);
/// # let render_config = RenderConfig::default();
/// # let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);
/// let mut all_r = Vec::new();
/// let mut all_g = Vec::new();
/// let mut all_b = Vec::new();
/// pass_1_build_histogram_spectral(&params, &mut all_r, &mut all_g, &mut all_b)?;
/// # Ok(())
/// # }
/// ```
pub fn pass_1_build_histogram_spectral(
    params: &RenderParams<'_>,
    all_r: &mut Vec<f64>,
    all_g: &mut Vec<f64>,
    all_b: &mut Vec<f64>,
) -> Result<()> {
    let positions = params.scene.positions;
    let colors = params.scene.colors;
    let body_alphas = params.scene.body_alphas;
    let resolved_config = params.resolved_config;

    // Use shared render loop context
    let mut loop_ctx = RenderLoopContext::new(params);

    // Create histogram storage
    let mut histogram = HistogramData::with_capacity(loop_ctx.ctx.pixel_count() * 10);

    for step in 0..loop_ctx.total_steps {
        // Progress logging
        if step % loop_ctx.chunk_line == 0 {
            let pct = (step as f64 / loop_ctx.total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 1, mode = "spectral", "Histogram pass progress");
        }

        // Draw step using shared context
        loop_ctx.draw_step(step, positions, colors, body_alphas);

        // Emit frame if needed
        if loop_ctx.should_emit_frame(step) {
            let frame_number = step / loop_ctx.frame_interval;
            let final_frame_pixels = loop_ctx.process_frame(frame_number, resolved_config)?;

            // Collect histogram data
            histogram.reserve(loop_ctx.ctx.pixel_count());
            for &(r, g, b, a) in &final_frame_pixels {
                histogram.push(r * a, g * a, b * a);
            }
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

// ====================== PASS 2 (SPECTRAL) ===========================
/// Pass 2: final frames => color mapping => write frames (spectral, 16-bit output).
///
/// This function renders all frames with histogram-derived color level adjustments,
/// applies tonemapping, and writes 16-bit RGB frames to the provided sink for encoding.
///
/// # Arguments
///
/// * `params` - Grouped rendering parameters (scene, config, etc.)
/// * `levels` - Per-channel black/white levels computed from Pass 1 histogram
/// * `frame_sink` - Callback that receives encoded 16-bit frame data (rgb48le format)
/// * `last_frame_out` - Output buffer for the final frame (saved as PNG)
///
/// # Errors
///
/// Returns `RenderError` if:
/// - Post-processing effects fail during rendering
/// - Frame sink callback returns an error (e.g., FFmpeg write failure)
/// - Image buffer creation fails
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::render::{pass_2_write_frames_spectral, RenderParams, SceneDataRef, RenderConfig, ChannelLevels};
/// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # use image::{ImageBuffer, Rgb};
/// # use nalgebra::Vector3;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let positions = vec![vec![Vector3::zeros(); 100]; 3];
/// # let colors = vec![vec![(0.5, 0.0, 0.0); 100]; 3];
/// # let body_alphas = vec![1.0; 3];
/// # let scene = SceneDataRef::new(&positions, &colors, &body_alphas);
/// # let seed = b"test";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// # let (resolved_config, _log) = RandomizableEffectConfig::default().resolve(&mut rng, 1920, 1080, false);
/// # let render_config = RenderConfig::default();
/// # let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);
/// # let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
/// # let mut last_frame: Option<ImageBuffer<Rgb<u16>, Vec<u16>>> = None;
/// pass_2_write_frames_spectral(
///     &params,
///     &levels,
///     |_frame_bytes| Ok(()),
///     &mut last_frame,
/// )?;
/// # Ok(())
/// # }
/// ```
pub fn pass_2_write_frames_spectral(
    params: &RenderParams<'_>,
    levels: &ChannelLevels,
    mut frame_sink: impl FnMut(&[u8]) -> Result<()>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u16>, Vec<u16>>>,
) -> Result<()> {
    let positions = params.scene.positions;
    let colors = params.scene.colors;
    let body_alphas = params.scene.body_alphas;
    let resolved_config = params.resolved_config;

    // Use shared render loop context
    let mut loop_ctx = RenderLoopContext::new(params);
    let pixel_count = loop_ctx.ctx.pixel_count();

    for step in 0..loop_ctx.total_steps {
        // Progress logging
        if step % loop_ctx.chunk_line == 0 {
            let pct = (step as f64 / loop_ctx.total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 2, mode = "spectral", "Render pass progress");
        }

        // Draw step using shared context
        loop_ctx.draw_step(step, positions, colors, body_alphas);

        // Emit frame if needed
        if loop_ctx.should_emit_frame(step) {
            let frame_number = step / loop_ctx.frame_interval;
            let final_frame_pixels = loop_ctx.process_frame(frame_number, resolved_config)?;

            // Tonemap to 16-bit
            let mut buf_16bit = vec![0u16; pixel_count * 3];
            buf_16bit.par_chunks_mut(3).zip(final_frame_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    let mapped = tonemap_to_16bit(fr, fg, fb, fa, levels);
                    chunk[0] = mapped[0];
                    chunk[1] = mapped[1];
                    chunk[2] = mapped[2];
                },
            );

            // Convert to bytes for FFmpeg (little-endian rgb48le format)
            // Use safe bytemuck conversion instead of unsafe transmutation
            let buf_bytes: &[u8] = bytemuck::cast_slice(&buf_16bit);

            frame_sink(buf_bytes)?;

            if loop_ctx.is_final_step(step) {
                *last_frame_out = ImageBuffer::from_raw(loop_ctx.width, loop_ctx.height, buf_16bit);
            }
        }
    }
    info!("   pass 2 (spectral render): 100% done");
    Ok(())
}

// ====================== SINGLE FRAME RENDERING ===========================
/// Render a single test frame (first frame only) for quick testing (16-bit output).
///
/// This function is optimized for rapid iteration and parameter testing. It renders
/// only the first frame interval worth of simulation steps, producing a single 16-bit
/// PNG image.
///
/// # Arguments
///
/// * `params` - Grouped rendering parameters (scene, config, etc.)
/// * `levels` - Per-channel black/white levels for tonemapping
///
/// # Errors
///
/// Returns `RenderError` if:
/// - Post-processing effects fail
/// - Image buffer creation fails
/// - Spectral to RGB conversion encounters invalid data
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::render::{render_single_frame_spectral, save_image_as_png_16bit};
/// # use three_body_problem::render::{RenderParams, SceneDataRef, RenderConfig, ChannelLevels};
/// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # use nalgebra::Vector3;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let positions = vec![vec![Vector3::zeros(); 100]; 3];
/// # let colors = vec![vec![(0.5, 0.0, 0.0); 100]; 3];
/// # let body_alphas = vec![1.0; 3];
/// # let scene = SceneDataRef::new(&positions, &colors, &body_alphas);
/// # let seed = b"test";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// # let (resolved_config, _log) = RandomizableEffectConfig::default().resolve(&mut rng, 1920, 1080, false);
/// # let render_config = RenderConfig::default();
/// # let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);
/// # let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
/// let test_frame = render_single_frame_spectral(&params, &levels)?;
/// save_image_as_png_16bit(&test_frame, "test.png")?;
/// # Ok(())
/// # }
/// ```
pub fn render_single_frame_spectral(
    params: &RenderParams<'_>,
    levels: &ChannelLevels,
) -> Result<ImageBuffer<Rgb<u16>, Vec<u16>>> {
    info!("   Rendering first frame only (test mode)...");

    // Extract commonly-used parameters
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
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Build effect configuration from resolved config
    let effect_config = build_effect_config_from_resolved(resolved_config);
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create nebula configuration
    let nebula_config = NebulaCloudConfig {
        strength: resolved_config.nebula_strength,
        octaves: resolved_config.nebula_octaves,
        base_frequency: resolved_config.nebula_base_frequency,
        lacunarity: 2.0,  // Fixed
        persistence: 0.5, // Fixed
        noise_seed: noise_seed as i64,
        colors: [
            [0.08, 0.12, 0.22], // Deep blue
            [0.15, 0.08, 0.25], // Purple
            [0.25, 0.12, 0.18], // Magenta
            [0.12, 0.15, 0.28], // Blue-violet
        ],
        time_scale: 1.0, // Fixed
        edge_fade: 0.3,  // Fixed
    };

    let total_steps = positions[0].len();
    let dt = constants::DEFAULT_DT;

    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

    // Pre-allocate empty background buffer for reuse (optimization)
    let empty_background = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Render all trajectory steps up to and including the first frame
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

        // Compute velocity-based HDR multipliers using the calculator
        let hdr_mult_01 = velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = velocity_calc.compute_segment_multiplier(step, 2, 0);

        draw_line_segment_aa_spectral_with_dispersion(
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
        draw_line_segment_aa_spectral_with_dispersion(
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
        draw_line_segment_aa_spectral_with_dispersion(
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
    apply_energy_density_shift(&mut accum_spd, special_mode);
    convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

    let frame_params = FrameParams { _frame_number: 0, _density: None };
    let trajectory_pixels = effect_chain
        .process_frame(accum_rgba, width as usize, height as usize, &frame_params)
        .map_err(|e| RenderError::EffectError(e.to_string()))?;

    // Generate nebula background for frame 0 (with zero-overhead check)
    let nebula_background = if special_mode && resolved_config.nebula_strength > 0.0 {
        generate_nebula_background(width as usize, height as usize, 0, &nebula_config)?
    } else {
        empty_background // Reuse pre-allocated empty buffer (zero overhead)
    };

    // Composite nebula under trajectories
    let final_pixels = composite_buffers(&nebula_background, &trajectory_pixels);

    // Tonemap to 16-bit
    let mut buf_16bit = vec![0u16; ctx.pixel_count() * 3];
    buf_16bit.par_chunks_mut(3).zip(final_pixels.par_iter()).for_each(
        |(chunk, &(fr, fg, fb, fa))| {
            let mapped = tonemap_to_16bit(fr, fg, fb, fa, levels);
            chunk[0] = mapped[0];
            chunk[1] = mapped[1];
            chunk[2] = mapped[2];
        },
    );

    // Create ImageBuffer and return
    let image = ImageBuffer::from_raw(width, height, buf_16bit).ok_or_else(|| {
        RenderError::ImageEncoding("Failed to create 16-bit image buffer".to_string())
    })?;

    Ok(image)
}
