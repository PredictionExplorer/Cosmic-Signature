//! Rendering module: histogram passes, color mapping, line drawing, and output
//!
//! This module provides a complete rendering pipeline for the three-body problem visualization,
//! including coordinate transformations, line drawing, post-processing effects, and video output.

use crate::post_effects::{
    ChromaticBloomConfig, GradientMapConfig, LuxuryPalette, NebulaClouds, NebulaCloudConfig,
    PerceptualBlurConfig,
};
use crate::spectrum::NUM_BINS;
use nalgebra::Vector3;
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
use self::effects::{
    EffectChainBuilder, EffectConfig, FrameParams,
    convert_spd_buffer_to_rgba,
};
use self::error::{RenderError, Result};
use self::histogram::HistogramData;

// Re-export core types and functions for public API compatibility
pub use color::{OklabColor, generate_body_color_sequences};
#[allow(unused_imports)]
pub use drawing::{
    draw_line_segment_aa_spectral_with_dispersion, parallel_blur_2d_rgba,
};
pub use effects::{DogBloomConfig, ExposureCalculator, apply_dog_bloom};
pub use histogram::compute_black_white_gamma;
// Re-export all types as part of public library API (not used internally, but part of API contract)
#[allow(unused_imports)] // Public API re-exports for library consumers
pub use types::{BloomConfig, BlurConfig, ChannelLevels, HdrConfig, PerceptualBlurSettings, Resolution, SceneData};
pub use video::{VideoEncodingOptions, create_video_from_frames_singlepass};

// Re-export types from dependencies used in public API
pub use image::{DynamicImage, ImageBuffer, Rgb};

/// Rendering configuration parameters
#[derive(Clone, Copy, Debug)]
pub struct RenderConfig {
    pub hdr_scale: f64,
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self { hdr_scale: constants::DEFAULT_HDR_SCALE }
    }
}

#[inline]
fn tonemap_to_8bit(fr: f64, fg: f64, fb: f64, fa: f64, levels: &ChannelLevels) -> [u8; 3] {
    let alpha = fa.clamp(0.0, 1.0);
    if alpha <= 0.0 {
        return [0, 0, 0];
    }

    let source = [fr.max(0.0), fg.max(0.0), fb.max(0.0)];
    let premult = [source[0] * alpha, source[1] * alpha, source[2] * alpha];
    if premult[0] <= 0.0 && premult[1] <= 0.0 && premult[2] <= 0.0 {
        return [0, 0, 0];
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
        return [0, 0, 0];
    }

    let straight_luma = 0.2126 * source[0] + 0.7152 * source[1] + 0.0722 * source[2];
    let chroma_preserve = (alpha / (alpha + 0.1)).clamp(0.0, 1.0);

    let mut final_channels = [0.0; 3];
    if straight_luma > 0.0 {
        for i in 0..3 {
            final_channels[i] = channel_curves[i] * (1.0 - chroma_preserve)
                + (source[i] / straight_luma) * target_luma * chroma_preserve;
        }
    } else {
        final_channels = channel_curves;
    }

    let neutral_mix = ((0.05 - alpha).max(0.0) / 0.05).clamp(0.0, 1.0) * 0.2;
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

    [
        (final_channels[0] * 255.0).round().clamp(0.0, 255.0) as u8,
        (final_channels[1] * 255.0).round().clamp(0.0, 255.0) as u8,
        (final_channels[2] * 255.0).round().clamp(0.0, 255.0) as u8,
    ]
}

/// Save single image as PNG
pub fn save_image_as_png(rgb_img: &ImageBuffer<Rgb<u8>, Vec<u8>>, path: &str) -> Result<()> {
    let dyn_img = DynamicImage::ImageRgb8(rgb_img.clone());
    dyn_img.save(path).map_err(|e| RenderError::ImageEncoding(e.to_string()))?;
    info!("   Saved PNG => {path}");
    Ok(())
}

/// Pass 1: gather global histogram for final color leveling
// ACES Filmic Tonemapping Curve constants
// Source: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
const A: f64 = 2.51;
const B: f64 = 0.03;
const C: f64 = 2.43;
const D: f64 = 0.59;
const E: f64 = 0.14;

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
) -> PixelBuffer {
    // Start with empty buffer (black background)
    let background = vec![(0.0, 0.0, 0.0, 0.0); width * height];
    
    // Apply nebula effect (which adds color without needing alpha tricks)
    let nebula = NebulaClouds::new(config.clone());
    nebula
        .process_with_time(&background, width, height, frame_number)
        .expect("Failed to generate nebula background")
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
fn composite_buffers(
    background: &PixelBuffer,
    foreground: &PixelBuffer,
) -> PixelBuffer {
    // Constants for enhancement
    const ALPHA_BOOST_FACTOR: f64 = 1.20;      // 20% stronger trajectory coverage
    const SATURATION_BOOST_FACTOR: f64 = 1.20; // 20% more saturated colors
    const SATURATION_THRESHOLD: f64 = 0.50;    // Only boost high-alpha pixels
    
    background
        .par_iter()
        .zip(foreground.par_iter())
        .map(|(&(br, bg, bb, ba), &(fr, fg, fb, fa))| {
            // Stage 1: Apply alpha boost to strengthen trajectory coverage
            let boosted_fa = (fa * ALPHA_BOOST_FACTOR).min(1.0);
            
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
                    if alpha_out > SATURATION_THRESHOLD {
                        // Unpremultiply to get straight RGB
                        let sr = r_out / alpha_out;
                        let sg = g_out / alpha_out;
                        let sb = b_out / alpha_out;
                        
                        // Calculate mean luminance
                        let mean = (sr + sg + sb) / 3.0;
                        
                        // Boost saturation: move colors away from mean
                        let boosted_sr = mean + (sr - mean) * SATURATION_BOOST_FACTOR;
                        let boosted_sg = mean + (sg - mean) * SATURATION_BOOST_FACTOR;
                        let boosted_sb = mean + (sb - mean) * SATURATION_BOOST_FACTOR;
                        
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
        AetherConfig, AtmosphericDepthConfig, ChampleveConfig, ColorGradeParams,
        EdgeLuminanceConfig, FineTextureConfig, GlowEnhancementConfig,
        MicroContrastConfig, OpalescenceConfig,
        fine_texture::TextureType,
    };
    
    let width = resolved.width as usize;
    let height = resolved.height as usize;
    let min_dim = width.min(height);
    
    // Calculate derived parameters from resolved scales
    let blur_radius_px = (resolved.blur_radius_scale * min_dim as f64).round() as usize;
    let dog_inner_sigma = resolved.dog_sigma_scale * min_dim as f64;
    let glow_radius = (resolved.glow_radius_scale * min_dim as f64).round() as usize;
    let chromatic_bloom_radius = (resolved.chromatic_bloom_radius_scale * min_dim as f64).round() as usize;
    let chromatic_bloom_separation = resolved.chromatic_bloom_separation_scale * min_dim as f64;
    let opalescence_scale_abs = resolved.opalescence_scale * ((width * height) as f64).sqrt();
    let fine_texture_scale_abs = resolved.fine_texture_scale * ((width * height) as f64).sqrt();
    
    // Build DoG config from resolved parameters
    let dog_config = DogBloomConfig {
        inner_sigma: dog_inner_sigma,
        outer_ratio: resolved.dog_ratio,
        strength: resolved.dog_strength,
        threshold: 0.01, // Fixed threshold
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
        palette: LuxuryPalette::GoldPurple,
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
            clarity_radius: (0.0028 * min_dim as f64).round().max(1.0) as usize,
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
            chromatic_shift: 0.5, // Fixed
            angle_sensitivity: 0.8, // Fixed
            pearl_sheen: 0.3, // Fixed
        },
        
        // Detail and clarity
        edge_luminance_enabled: resolved.enable_edge_luminance,
        edge_luminance_config: EdgeLuminanceConfig {
            strength: resolved.edge_luminance_strength,
            threshold: resolved.edge_luminance_threshold,
            brightness_boost: resolved.edge_luminance_brightness_boost,
            bright_edges_only: true, // Fixed
            min_luminance: 0.2, // Fixed
        },
        micro_contrast_enabled: resolved.enable_micro_contrast,
        micro_contrast_config: MicroContrastConfig {
            strength: resolved.micro_contrast_strength,
            radius: resolved.micro_contrast_radius,
            edge_threshold: 0.15, // Fixed
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
            fog_color: (0.08, 0.12, 0.22), // Fixed cosmic tint
            density_threshold: 0.15, // Fixed
            desaturation: resolved.atmospheric_desaturation,
            darkening: resolved.atmospheric_darkening,
            density_radius: 3, // Fixed
        },
        fine_texture_enabled: resolved.enable_fine_texture,
        fine_texture_config: FineTextureConfig {
            texture_type: TextureType::Canvas, // Fixed
            strength: resolved.fine_texture_strength,
            scale: fine_texture_scale_abs,
            contrast: resolved.fine_texture_contrast,
            anisotropy: 0.3, // Fixed
            angle: 0.0, // Fixed
        },
    }
}

/// Legacy build effect configuration (kept for backward compatibility if needed)
#[allow(dead_code)]
#[allow(clippy::too_many_arguments)]
fn build_effect_config(
    width: usize,
    height: usize,
    bloom_mode: &str,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&PerceptualBlurConfig>,
    special_mode: bool,
) -> EffectConfig {
    use crate::post_effects::{
        AetherConfig, AtmosphericDepthConfig, ChampleveConfig, ColorGradeParams,
        EdgeLuminanceConfig, FineTextureConfig, GlowEnhancementConfig,
        MicroContrastConfig, OpalescenceConfig,
    };

    // Determine gradient map settings (only enabled in special mode with palette)
    let gradient_map_enabled = special_mode;
    let gradient_map_config = if special_mode {
        GradientMapConfig {
            palette: LuxuryPalette::GoldPurple,
            strength: 0.85,
            hue_preservation: 0.15,
        }
    } else {
        GradientMapConfig {
            palette: LuxuryPalette::GoldPurple,
            strength: 0.0,
            hue_preservation: 1.0,
        }
    };

    EffectConfig {
        // Core bloom and blur
        bloom_mode: bloom_mode.to_string(),
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config: dog_config.clone(),
        hdr_mode: hdr_mode.to_string(),
        perceptual_blur_enabled,
        perceptual_blur_config: perceptual_blur_config.cloned(),
        
        // Color manipulation
        color_grade_enabled: true,
        color_grade_params: ColorGradeParams::from_resolution_and_mode(width, height, special_mode),
        gradient_map_enabled, // Only when actually needed
        gradient_map_config,
        
        // Material and iridescence (always enabled, scaled by mode)
        champleve_enabled: true,
        champleve_config: ChampleveConfig::new(special_mode),
        aether_enabled: true,
        aether_config: AetherConfig::new(special_mode),
        chromatic_bloom_enabled: true,
        chromatic_bloom_config: ChromaticBloomConfig::from_resolution(width, height),
        opalescence_enabled: true, // NOW ENABLED IN BOTH MODES
        opalescence_config: if special_mode {
            OpalescenceConfig::special_mode(width, height)
        } else {
            OpalescenceConfig::standard_mode(width, height)
        },
        
        // Detail and clarity (NEW - enabled in both modes)
        edge_luminance_enabled: true, // NOW ENABLED IN BOTH MODES
        edge_luminance_config: if special_mode {
            EdgeLuminanceConfig::special_mode()
        } else {
            EdgeLuminanceConfig::standard_mode()
        },
        micro_contrast_enabled: true, // NEW - enabled in both modes
        micro_contrast_config: if special_mode {
            MicroContrastConfig::special_mode()
        } else {
            MicroContrastConfig::standard_mode()
        },
        glow_enhancement_enabled: true, // NEW - enabled in both modes
        glow_enhancement_config: if special_mode {
            GlowEnhancementConfig::special_mode(width, height)
        } else {
            GlowEnhancementConfig::standard_mode(width, height)
        },
        
        // Atmospheric and surface (NEW - enabled in both modes)
        atmospheric_depth_enabled: true, // NOW ENABLED IN BOTH MODES
        atmospheric_depth_config: if special_mode {
            AtmosphericDepthConfig::special_mode()
        } else {
            AtmosphericDepthConfig::standard_mode()
        },
        fine_texture_enabled: true, // NOW ENABLED IN BOTH MODES
        fine_texture_config: if special_mode {
            FineTextureConfig::special_mode_canvas(width, height)
        } else {
            FineTextureConfig::standard_mode(width, height)
        },
    }
}

/// Apply energy density wavelength shift to spectral buffer
/// Hot regions (high energy) shift toward red, cool regions stay blue
fn apply_energy_density_shift(accum_spd: &mut [[f64; NUM_BINS]], special_mode: bool) {
    if !special_mode {
        return;
    }
    
    use constants::{ENERGY_DENSITY_SHIFT_THRESHOLD, ENERGY_DENSITY_SHIFT_STRENGTH};
    
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

// ====================== PASS 1 (SPECTRAL) ===========================
/// Pass 1: gather global histogram for final color leveling (spectral)
#[allow(clippy::too_many_arguments)] // Low-level rendering primitive requires all parameters
pub fn pass_1_build_histogram_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    resolved_config: &randomizable_config::ResolvedEffectConfig,
    frame_interval: usize,
    all_r: &mut Vec<f64>,
    all_g: &mut Vec<f64>,
    all_b: &mut Vec<f64>,
    noise_seed: i32,
    render_config: &RenderConfig,
) {
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
    
    // Create nebula configuration (rendered separately, not in effect chain)
    let nebula_config = NebulaCloudConfig {
        strength: resolved_config.nebula_strength,
        octaves: resolved_config.nebula_octaves,
        base_frequency: resolved_config.nebula_base_frequency,
        lacunarity: 2.0, // Fixed
        persistence: 0.5, // Fixed
        noise_seed: noise_seed as i64,
        colors: [
            [0.08, 0.12, 0.22],  // Deep blue
            [0.15, 0.08, 0.25],  // Purple
            [0.25, 0.12, 0.18],  // Magenta
            [0.12, 0.15, 0.28],  // Blue-violet
        ],
        time_scale: 1.0, // Fixed
        edge_fade: 0.3, // Fixed
    };

    // Create histogram storage
    let mut histogram = HistogramData::with_capacity(ctx.pixel_count() * 10);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);
    let dt = constants::DEFAULT_DT;
    
    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);
    
    // Pre-allocate empty background buffer for reuse (optimization: saves 60× 2MB allocations)
    let empty_background = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 1, mode = "spectral", "Histogram pass progress");
        }
        
        // Prepare triangle vertices with batched data access (better cache locality)
        let vertices = prepare_triangle_vertices(
            positions,
            colors,
            &[body_alphas[0], body_alphas[1], body_alphas[2]],
            step,
            &ctx,
        );

        // Compute velocity-based HDR multipliers using the calculator
        let hdr_mult_01 = velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = velocity_calc.compute_segment_multiplier(step, 2, 0);

        // Draw entire triangle in batch (10-20% faster than individual calls)
        draw_triangle_batch_spectral(
            &mut accum_spd,
            width,
            height,
            vertices[0],
            vertices[1],
            vertices[2],
            hdr_mult_01,
            hdr_mult_12,
            hdr_mult_20,
            render_config.hdr_scale,
            special_mode,
        );

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Apply energy density wavelength shift before conversion
            apply_energy_density_shift(&mut accum_spd, special_mode);
            
            // convert SPD -> RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            // Process with persistent effect chain
            let frame_params = FrameParams { _frame_number: step / frame_interval, _density: None };

            // Take ownership of accum_rgba to avoid clone
            let rgba_buffer = std::mem::take(&mut accum_rgba);
            let trajectory_pixels = effect_chain
                .process_frame(rgba_buffer, width as usize, height as usize, &frame_params)
                .expect("Failed to process frame during spectral histogram pass");
            // Reuse the buffer instead of reallocating - clear and resize to avoid allocation
            accum_rgba.clear();
            accum_rgba.resize(ctx.pixel_count(), (0.0, 0.0, 0.0, 0.0));

            // Generate nebula background separately (with zero-overhead check)
            let nebula_background = if special_mode && resolved_config.nebula_strength > 0.0 {
                generate_nebula_background(
                    width as usize,
                    height as usize,
                    step / frame_interval,
                    &nebula_config,
                )
            } else {
                empty_background.clone()  // Reuse pre-allocated empty buffer (zero overhead)
            };

            // Composite nebula background UNDER trajectory foreground
            let final_frame_pixels = composite_buffers(&nebula_background, &trajectory_pixels);

            // Collect histogram data efficiently
            histogram.reserve(ctx.pixel_count());
            for &(r, g, b, a) in &final_frame_pixels {
                histogram.push(r * a, g * a, b * a);
            }
        }
    }

    // Extract channels efficiently without intermediate copying
    let (extracted_r, extracted_g, extracted_b) = histogram.extract_channels();
    *all_r = extracted_r;
    *all_g = extracted_g;
    *all_b = extracted_b;

    info!("   pass 1 (spectral histogram): 100% done");
}

// ====================== PASS 2 (SPECTRAL) ===========================
/// Pass 2: final frames => color mapping => write frames (spectral)
#[allow(clippy::too_many_arguments)] // Low-level rendering primitive requires all parameters
pub fn pass_2_write_frames_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    resolved_config: &randomizable_config::ResolvedEffectConfig,
    frame_interval: usize,
    black_r: f64,
    white_r: f64,
    black_g: f64,
    white_g: f64,
    black_b: f64,
    white_b: f64,
    noise_seed: i32,
    mut frame_sink: impl FnMut(&[u8]) -> Result<()>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
    render_config: &RenderConfig,
) -> Result<()> {
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
    
    // Create nebula configuration (rendered separately, not in effect chain)
    let nebula_config = NebulaCloudConfig {
        strength: resolved_config.nebula_strength,
        octaves: resolved_config.nebula_octaves,
        base_frequency: resolved_config.nebula_base_frequency,
        lacunarity: 2.0, // Fixed
        persistence: 0.5, // Fixed
        noise_seed: noise_seed as i64,
        colors: [
            [0.08, 0.12, 0.22],  // Deep blue
            [0.15, 0.08, 0.25],  // Purple
            [0.25, 0.12, 0.18],  // Magenta
            [0.12, 0.15, 0.28],  // Blue-violet
        ],
        time_scale: 1.0, // Fixed
        edge_fade: 0.3, // Fixed
    };

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);
    let dt = constants::DEFAULT_DT;
    
    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);
    
    // Pre-allocate empty background buffer for reuse (optimization: saves 60× 2MB allocations)
    let empty_background = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);

    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 2, mode = "spectral", "Render pass progress");
        }
        // Prepare triangle vertices with batched data access (better cache locality)
        let vertices = prepare_triangle_vertices(
            positions,
            colors,
            &[body_alphas[0], body_alphas[1], body_alphas[2]],
            step,
            &ctx,
        );

        // Compute velocity-based HDR multipliers using the calculator
        let hdr_mult_01 = velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = velocity_calc.compute_segment_multiplier(step, 2, 0);

        // Draw entire triangle in batch (10-20% faster than individual calls)
        draw_triangle_batch_spectral(
            &mut accum_spd,
            width,
            height,
            vertices[0],
            vertices[1],
            vertices[2],
            hdr_mult_01,
            hdr_mult_12,
            hdr_mult_20,
            render_config.hdr_scale,
            special_mode,
        );

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Apply energy density wavelength shift before conversion
            apply_energy_density_shift(&mut accum_spd, special_mode);
            
            // Convert SPD -> RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            // Process with persistent effect chain
            let frame_params = FrameParams { _frame_number: step / frame_interval, _density: None };

            // Take ownership of accum_rgba to avoid clone
            let rgba_buffer = std::mem::take(&mut accum_rgba);
            let trajectory_pixels = effect_chain
                .process_frame(rgba_buffer, width as usize, height as usize, &frame_params)
                .expect("Failed to process frame during spectral render pass");
            // Reuse the buffer instead of reallocating - clear and resize to avoid allocation
            accum_rgba.clear();
            accum_rgba.resize(ctx.pixel_count(), (0.0, 0.0, 0.0, 0.0));

            // Generate nebula background separately (with zero-overhead check)
            let nebula_background = if special_mode && resolved_config.nebula_strength > 0.0 {
                generate_nebula_background(
                    width as usize,
                    height as usize,
                    step / frame_interval,
                    &nebula_config,
                )
            } else {
                empty_background.clone()  // Reuse pre-allocated empty buffer (zero overhead)
            };

            // Composite nebula background UNDER trajectory foreground
            let final_frame_pixels = composite_buffers(&nebula_background, &trajectory_pixels);

            // levels + ACES tonemapping
            let mut buf_8bit = vec![0u8; ctx.pixel_count() * 3];
            buf_8bit.par_chunks_mut(3).zip(final_frame_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    let mapped = tonemap_to_8bit(fr, fg, fb, fa, &levels);
                    chunk[0] = mapped[0];
                    chunk[1] = mapped[1];
                    chunk[2] = mapped[2];
                },
            );

            frame_sink(&buf_8bit)?;
            if is_final {
                *last_frame_out = ImageBuffer::from_raw(width, height, buf_8bit);
            }
        }
    }
    info!("   pass 2 (spectral render): 100% done");
    Ok(())
}

// ====================== SINGLE FRAME RENDERING ===========================
/// Render a single test frame (first frame only) for quick testing
#[allow(clippy::too_many_arguments)] // Low-level rendering primitive requires all parameters
pub fn render_single_frame_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    resolved_config: &randomizable_config::ResolvedEffectConfig,
    black_r: f64,
    white_r: f64,
    black_g: f64,
    white_g: f64,
    black_b: f64,
    white_b: f64,
    noise_seed: i32,
    render_config: &RenderConfig,
) -> Result<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    info!("   Rendering first frame only (test mode)...");
    
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
        lacunarity: 2.0, // Fixed
        persistence: 0.5, // Fixed
        noise_seed: noise_seed as i64,
        colors: [
            [0.08, 0.12, 0.22],  // Deep blue
            [0.15, 0.08, 0.25],  // Purple
            [0.25, 0.12, 0.18],  // Magenta
            [0.12, 0.15, 0.28],  // Blue-violet
        ],
        time_scale: 1.0, // Fixed
        edge_fade: 0.3, // Fixed
    };

    let total_steps = positions[0].len();
    let dt = constants::DEFAULT_DT;
    
    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);
    
    // Pre-allocate empty background buffer for reuse (optimization)
    let empty_background = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];
    
    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);

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
            &mut accum_spd, width, height, x0, y0, x1, y1, c0, c1, a0, a1,
            render_config.hdr_scale * hdr_mult_01, special_mode,
        );
        draw_line_segment_aa_spectral_with_dispersion(
            &mut accum_spd, width, height, x1, y1, x2, y2, c1, c2, a1, a2,
            render_config.hdr_scale * hdr_mult_12, special_mode,
        );
        draw_line_segment_aa_spectral_with_dispersion(
            &mut accum_spd, width, height, x2, y2, x0, y0, c2, c0, a2, a0,
            render_config.hdr_scale * hdr_mult_20, special_mode,
        );
    }

    // Process the accumulated frame
    apply_energy_density_shift(&mut accum_spd, special_mode);
    convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

    let frame_params = FrameParams { _frame_number: 0, _density: None };
    let trajectory_pixels = effect_chain
        .process_frame(accum_rgba, width as usize, height as usize, &frame_params)
        .expect("Failed to process test frame");

    // Generate nebula background for frame 0 (with zero-overhead check)
    let nebula_background = if special_mode && resolved_config.nebula_strength > 0.0 {
        generate_nebula_background(width as usize, height as usize, 0, &nebula_config)
    } else {
        empty_background  // Reuse pre-allocated empty buffer (zero overhead)
    };

    // Composite nebula under trajectories
    let final_pixels = composite_buffers(&nebula_background, &trajectory_pixels);

    // Tonemap to 8-bit
    let mut buf_8bit = vec![0u8; ctx.pixel_count() * 3];
    buf_8bit.par_chunks_mut(3).zip(final_pixels.par_iter()).for_each(
        |(chunk, &(fr, fg, fb, fa))| {
            let mapped = tonemap_to_8bit(fr, fg, fb, fa, &levels);
            chunk[0] = mapped[0];
            chunk[1] = mapped[1];
            chunk[2] = mapped[2];
        },
    );

    // Create ImageBuffer and return
    let image = ImageBuffer::from_raw(width, height, buf_8bit)
        .ok_or_else(|| RenderError::ImageEncoding("Failed to create image buffer".to_string()))?;
    
    Ok(image)
}
