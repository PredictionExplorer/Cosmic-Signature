//! Rendering module: histogram passes, color mapping, line drawing, and output
//!
//! This module provides a complete rendering pipeline for the three-body problem visualization,
//! including coordinate transformations, line drawing, post-processing effects, and video output.

use crate::post_effects::{
    ChromaticBloomConfig, GradientMapConfig, LuxuryPalette, NebulaCloudConfig, NebulaClouds,
    PerceptualBlurConfig, TemporalSmoothing, TemporalSmoothingConfig,
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
use self::effects::{EffectChainBuilder, EffectConfig, FrameParams, convert_spd_buffer_to_rgba};
use self::error::{RenderError, Result};
use self::histogram::HistogramData;

// Re-export core types and functions for public API compatibility
pub use color::{OklabColor, generate_body_color_sequences};
#[allow(unused_imports)]
pub use drawing::{draw_line_segment_aa_spectral_with_dispersion, parallel_blur_2d_rgba};
pub use effects::{DogBloomConfig, ExposureCalculator, apply_dog_bloom};
#[allow(unused_imports)] // Public API re-export for library consumers.
pub use histogram::compute_black_white_gamma;
// Re-export all types as part of public library API (not used internally, but part of API contract)
#[allow(unused_imports)] // Public API re-exports for library consumers
pub use types::{
    BloomConfig, BlurConfig, ChannelLevels, HdrConfig, PerceptualBlurSettings, Resolution,
    SceneData,
};
pub use video::{VideoEncodingOptions, create_video_from_frames_singlepass};

// Re-export types from dependencies used in public API
pub use image::{DynamicImage, ImageBuffer, Rgb};

/// Render-time effect budget used by curation tiers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectBudget {
    Preview,
    #[allow(dead_code)] // Reserved for optional intermediate scoring/render pipelines.
    Finalist,
    Full,
}

impl Default for EffectBudget {
    fn default() -> Self {
        Self::Full
    }
}

/// Rendering configuration parameters
#[derive(Clone, Debug)]
pub struct RenderConfig {
    pub hdr_scale: f64,
    pub bloom_mode: String,
    pub hdr_mode: String,
    pub temporal_smoothing_enabled: bool,
    pub temporal_smoothing_blend: f64,
    pub exposure_damping_enabled: bool,
    pub exposure_damping_rate: f64,
    pub output_dither_enabled: bool,
    pub effect_budget: EffectBudget,
    pub histogram_fast_mode: bool,
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self {
            hdr_scale: constants::DEFAULT_HDR_SCALE,
            bloom_mode: "dog".to_string(),
            hdr_mode: "auto".to_string(),
            temporal_smoothing_enabled: false,
            temporal_smoothing_blend: 0.0,
            exposure_damping_enabled: false,
            exposure_damping_rate: 0.15,
            output_dither_enabled: false,
            effect_budget: EffectBudget::Full,
            histogram_fast_mode: false,
        }
    }
}

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

    final_channels
}

/// Tonemap to 8-bit (for legacy support, not currently used)
#[allow(dead_code)]
#[inline]
fn tonemap_to_8bit(fr: f64, fg: f64, fb: f64, fa: f64, levels: &ChannelLevels) -> [u8; 3] {
    let channels = tonemap_core(fr, fg, fb, fa, levels);
    [
        (channels[0] * 255.0).round().clamp(0.0, 255.0) as u8,
        (channels[1] * 255.0).round().clamp(0.0, 255.0) as u8,
        (channels[2] * 255.0).round().clamp(0.0, 255.0) as u8,
    ]
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

fn estimate_frame_exposure(pixels: &[(f64, f64, f64, f64)]) -> f64 {
    if pixels.is_empty() {
        return 1.0;
    }

    let mut luma_sum = 0.0;
    let mut count = 0usize;
    for &(r, g, b, a) in pixels {
        if a <= 1e-6 {
            continue;
        }
        let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / a.max(1e-6);
        luma_sum += luma;
        count += 1;
    }

    if count == 0 {
        return 1.0;
    }

    let mean_luma = (luma_sum / count as f64).max(1e-6);
    (0.22 / mean_luma).clamp(0.45, 1.75)
}

fn apply_exposure_damping(
    pixels: &mut PixelBuffer,
    exposure_state: &mut Option<f64>,
    damping_rate: f64,
) {
    let target_exposure = estimate_frame_exposure(pixels);
    let damped_exposure = if let Some(previous) = *exposure_state {
        previous + (target_exposure - previous) * damping_rate.clamp(0.01, 1.0)
    } else {
        target_exposure
    };
    *exposure_state = Some(damped_exposure);

    if (damped_exposure - 1.0).abs() < 1e-4 {
        return;
    }

    for pixel in pixels {
        pixel.0 *= damped_exposure;
        pixel.1 *= damped_exposure;
        pixel.2 *= damped_exposure;
    }
}

fn dither_hash(x: usize, y: usize, frame_number: usize) -> i32 {
    let mut n = (x as u32)
        .wrapping_mul(374_761_393)
        .wrapping_add((y as u32).wrapping_mul(668_265_263))
        .wrapping_add((frame_number as u32).wrapping_mul(2_147_483_647));
    n ^= n >> 13;
    n = n.wrapping_mul(1_274_126_177);
    n ^= n >> 16;
    (n & 0xff) as i32
}

fn apply_output_dither(buf_16bit: &mut [u16], width: usize, frame_number: usize) {
    if width == 0 {
        return;
    }
    for (idx, chunk) in buf_16bit.chunks_exact_mut(3).enumerate() {
        let x = idx % width;
        let y = idx / width;
        let noise = dither_hash(x, y, frame_number) - 128;
        let offset = noise / 2;
        for c in chunk {
            let value = *c as i32 + offset;
            *c = value.clamp(0, 65_535) as u16;
        }
    }
}

/// Save 16-bit image as PNG
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

/// Keep nebula visible in open background while preventing dominance over trajectories.
#[inline]
fn controlled_nebula_alpha(base_alpha: f64, foreground_alpha: f64) -> (f64, f64) {
    if base_alpha <= 0.0 {
        return (0.0, 1.0);
    }

    // When trajectories are sparse, gently lift very low nebula coverage.
    const MIN_FLOOR_ALPHA: f64 = 0.010;
    const MAX_FLOOR_ALPHA: f64 = 0.028;
    const FLOOR_PUSH_MAX: f64 = 0.55;

    // Always cap maximum nebula coverage, with a stricter cap under dense foreground.
    const DENSE_REGION_CEILING: f64 = 0.040;
    const OPEN_REGION_CEILING: f64 = 0.130;

    let fg = foreground_alpha.clamp(0.0, 1.0);
    let open_space = (1.0 - fg).clamp(0.0, 1.0);
    let floor_push = ((0.10 - fg) / 0.10).clamp(0.0, 1.0) * FLOOR_PUSH_MAX;
    let floor_alpha = MIN_FLOOR_ALPHA + (MAX_FLOOR_ALPHA - MIN_FLOOR_ALPHA) * open_space.powf(1.2);
    let ceiling =
        DENSE_REGION_CEILING + (OPEN_REGION_CEILING - DENSE_REGION_CEILING) * open_space.powf(1.6);

    let lifted = base_alpha + (floor_alpha - base_alpha).max(0.0) * floor_push;
    let controlled = lifted.min(ceiling).max(0.0);
    let gain = controlled / base_alpha.max(1e-9);
    (controlled, gain)
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
    // Constants for enhancement
    const ALPHA_BOOST_FACTOR: f64 = 1.20; // 20% stronger trajectory coverage
    const SATURATION_BOOST_FACTOR: f64 = 1.20; // 20% more saturated colors
    const SATURATION_THRESHOLD: f64 = 0.50; // Only boost high-alpha pixels

    background
        .par_iter()
        .zip(foreground.par_iter())
        .map(|(&(br, bg, bb, ba), &(fr, fg, fb, fa))| {
            let (controlled_ba, _) = controlled_nebula_alpha(ba, fa);

            // Stage 1: Apply alpha boost to strengthen trajectory coverage
            let boosted_fa = (fa * ALPHA_BOOST_FACTOR).min(1.0);

            if boosted_fa >= 1.0 {
                // Foreground is fully opaque - completely covers background
                (fr, fg, fb, fa)
            } else if boosted_fa <= 0.0 {
                // No foreground - only background visible
                // Convert background from straight to premultiplied for output consistency
                (br * controlled_ba, bg * controlled_ba, bb * controlled_ba, controlled_ba)
            } else {
                // Standard "over" compositing with enhanced alpha
                // Result alpha: original fa + background * (1 - boosted_fa)
                let alpha_out = fa + controlled_ba * (1.0 - boosted_fa);

                if alpha_out <= 0.0 {
                    (0.0, 0.0, 0.0, 0.0)
                } else {
                    // Composite colors with boosted foreground coverage
                    // Output = premult_foreground + premult_background * (1 - boosted_alpha_foreground)
                    let mut r_out = fr + (br * controlled_ba) * (1.0 - boosted_fa);
                    let mut g_out = fg + (bg * controlled_ba) * (1.0 - boosted_fa);
                    let mut b_out = fb + (bb * controlled_ba) * (1.0 - boosted_fa);

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

/// Build nebula configuration for the current render.
///
/// Nebula is only active in special mode. We reuse the special-mode defaults from
/// the effect module so time evolution remains gentle for video output.
fn build_nebula_config(
    resolved_config: &randomizable_config::ResolvedEffectConfig,
    noise_seed: i32,
) -> NebulaCloudConfig {
    if !resolved_config.special_mode {
        return NebulaCloudConfig::standard_mode(
            resolved_config.width as usize,
            resolved_config.height as usize,
            noise_seed,
        );
    }

    let mut config = NebulaCloudConfig::special_mode(
        resolved_config.width as usize,
        resolved_config.height as usize,
        noise_seed,
    );

    config.strength = resolved_config.nebula_strength.max(0.0);
    config.octaves = resolved_config.nebula_octaves.max(1);
    config.base_frequency = resolved_config.nebula_base_frequency.max(1e-6);
    config.noise_seed = noise_seed as i64;
    config.palette_id = NebulaCloudConfig::palette_index_from_seed(
        config.noise_seed,
        resolved_config.gradient_map_palette,
    );
    config.colors = NebulaCloudConfig::palette_for_index(config.palette_id);
    config
}

pub fn nebula_palette_id_for_config(
    resolved_config: &randomizable_config::ResolvedEffectConfig,
    noise_seed: i32,
) -> Option<usize> {
    if !resolved_config.special_mode || resolved_config.nebula_strength <= 0.0 {
        return None;
    }

    Some(NebulaCloudConfig::palette_index_from_seed(
        noise_seed as i64,
        resolved_config.gradient_map_palette,
    ))
}

/// Build effect configuration from resolved randomizable config
///
/// Creates a fully configured EffectConfig from a ResolvedEffectConfig with all
/// parameters determined (either explicitly set or randomized).
fn build_effect_config_from_resolved(
    resolved: &randomizable_config::ResolvedEffectConfig,
    render_config: &RenderConfig,
) -> EffectConfig {
    use crate::oklab::GamutMapMode;
    use crate::post_effects::{
        AetherConfig, AtmosphericDepthConfig, ChampleveConfig, ColorGradeParams,
        EdgeLuminanceConfig, FineTextureConfig, GlowEnhancementConfig, MicroContrastConfig,
        OpalescenceConfig, fine_texture::TextureType,
    };

    let width = resolved.width as usize;
    let height = resolved.height as usize;
    let min_dim = width.min(height);
    let budget = render_config.effect_budget;
    let preview_budget = matches!(budget, EffectBudget::Preview);
    let finalist_budget = matches!(budget, EffectBudget::Finalist);
    let full_budget = matches!(budget, EffectBudget::Full);

    // Calculate derived parameters from resolved scales
    let bloom_enabled = resolved.enable_bloom;
    let radius_scale = match budget {
        EffectBudget::Preview => 0.60,
        EffectBudget::Finalist => 0.80,
        EffectBudget::Full => 1.0,
    };
    let blur_radius_px = if bloom_enabled {
        ((resolved.blur_radius_scale * min_dim as f64) * radius_scale).round().max(1.0) as usize
    } else {
        0
    };
    let dog_inner_sigma = resolved.dog_sigma_scale * min_dim as f64;
    let glow_radius =
        ((resolved.glow_radius_scale * min_dim as f64) * radius_scale).round().max(1.0) as usize;
    let chromatic_bloom_radius =
        ((resolved.chromatic_bloom_radius_scale * min_dim as f64) * radius_scale).round().max(1.0)
            as usize;
    let chromatic_bloom_separation = resolved.chromatic_bloom_separation_scale * min_dim as f64;
    let opalescence_scale_abs = resolved.opalescence_scale * ((width * height) as f64).sqrt();
    let fine_texture_scale_abs = resolved.fine_texture_scale * ((width * height) as f64).sqrt();
    let chroma_strength_scale = match budget {
        EffectBudget::Preview => 0.75,
        EffectBudget::Finalist => 0.90,
        EffectBudget::Full => 1.0,
    };

    // Build DoG config from resolved parameters
    let dog_config = DogBloomConfig {
        inner_sigma: dog_inner_sigma,
        outer_ratio: resolved.dog_ratio,
        strength: if bloom_enabled { resolved.dog_strength } else { 0.0 },
        threshold: 0.01, // Fixed threshold
    };

    // Build perceptual blur config if enabled
    let perceptual_blur_config = if resolved.enable_perceptual_blur {
        Some(PerceptualBlurConfig {
            radius: blur_radius_px, // Use main blur radius
            strength: resolved.perceptual_blur_strength * chroma_strength_scale,
            gamut_mode: GamutMapMode::PreserveHue, // Fixed mode
        })
    } else {
        None
    };

    // Determine gradient map settings (enabled in both modes for richer color palettes)
    let gradient_map_enabled = resolved.enable_gradient_map;
    let gradient_map_config = GradientMapConfig {
        palette: LuxuryPalette::from_index(resolved.gradient_map_palette),
        strength: resolved.gradient_map_strength * chroma_strength_scale,
        hue_preservation: resolved.gradient_map_hue_preservation,
    };
    let enable_champleve = resolved.enable_champleve && full_budget;
    let enable_aether = resolved.enable_aether && full_budget;
    let enable_opalescence = resolved.enable_opalescence && !preview_budget;
    let enable_micro_contrast = resolved.enable_micro_contrast && !preview_budget;
    let enable_atmospheric_depth = resolved.enable_atmospheric_depth && !preview_budget;
    let enable_fine_texture = resolved.enable_fine_texture && full_budget;

    EffectConfig {
        // Core bloom and blur
        bloom_mode: if !bloom_enabled {
            "none".to_string()
        } else if render_config.bloom_mode.eq_ignore_ascii_case("gaussian") {
            "gaussian".to_string()
        } else {
            "dog".to_string()
        },
        blur_radius_px,
        blur_strength: if bloom_enabled {
            resolved.blur_strength * chroma_strength_scale
        } else {
            0.0
        },
        blur_core_brightness: resolved.blur_core_brightness,
        dog_config,
        hdr_mode: render_config.hdr_mode.clone(),
        perceptual_blur_enabled: resolved.enable_perceptual_blur,
        perceptual_blur_config,

        // Color manipulation
        color_grade_enabled: resolved.enable_color_grade,
        color_grade_params: ColorGradeParams {
            strength: resolved.color_grade_strength * chroma_strength_scale,
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
        champleve_enabled: enable_champleve,
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
        aether_enabled: enable_aether,
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
            strength: resolved.chromatic_bloom_strength * chroma_strength_scale,
            separation: chromatic_bloom_separation,
            threshold: resolved.chromatic_bloom_threshold,
        },
        opalescence_enabled: enable_opalescence,
        opalescence_config: OpalescenceConfig {
            strength: if finalist_budget {
                resolved.opalescence_strength * 0.85
            } else {
                resolved.opalescence_strength
            },
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
        micro_contrast_enabled: enable_micro_contrast,
        micro_contrast_config: MicroContrastConfig {
            strength: if finalist_budget {
                resolved.micro_contrast_strength * 0.90
            } else {
                resolved.micro_contrast_strength
            },
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
        atmospheric_depth_enabled: enable_atmospheric_depth,
        atmospheric_depth_config: AtmosphericDepthConfig {
            strength: if finalist_budget {
                resolved.atmospheric_depth_strength * 0.75
            } else {
                resolved.atmospheric_depth_strength
            },
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
        fine_texture_enabled: enable_fine_texture,
        fine_texture_config: FineTextureConfig {
            texture_type: TextureType::Canvas, // Fixed
            strength: resolved.fine_texture_strength,
            scale: fine_texture_scale_abs,
            contrast: resolved.fine_texture_contrast,
            anisotropy: 0.3, // Fixed
            angle: 0.0,      // Fixed
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
        EdgeLuminanceConfig, FineTextureConfig, GlowEnhancementConfig, MicroContrastConfig,
        OpalescenceConfig,
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

// ====================== PASS 1 (SPECTRAL) ===========================
/// Pass 1: gather global histogram for final color leveling (spectral)
#[allow(clippy::too_many_arguments)] // Low-level rendering primitive requires all parameters
pub fn pass_1_build_histogram_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    resolved_config: &randomizable_config::ResolvedEffectConfig,
    frame_interval: usize,
    noise_seed: i32,
    render_config: &RenderConfig,
) -> (f64, f64, f64, f64, f64, f64) {
    let width = resolved_config.width;
    let height = resolved_config.height;
    let special_mode = resolved_config.special_mode;

    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Build effect configuration from resolved config
    let effect_config = build_effect_config_from_resolved(resolved_config, render_config);
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create nebula configuration (rendered separately, not in effect chain)
    let nebula_config = build_nebula_config(resolved_config, noise_seed);

    // Create bounded histogram storage (streaming quantiles).
    let mut histogram = HistogramData::with_capacity(ctx.pixel_count() * 8);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);
    let dt = constants::DEFAULT_DT;

    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

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

            // Skip background compositing entirely when nebula is disabled.
            let final_frame_pixels = if nebula_config.strength > 0.0 {
                let nebula_background = generate_nebula_background(
                    width as usize,
                    height as usize,
                    step / frame_interval,
                    &nebula_config,
                );
                composite_buffers(&nebula_background, &trajectory_pixels)
            } else {
                trajectory_pixels
            };

            // Collect histogram data efficiently
            for &(r, g, b, a) in &final_frame_pixels {
                histogram.push(r * a, g * a, b * a);
            }
        }
    }

    info!("   pass 1 (spectral histogram): 100% done");
    histogram.black_white_points(resolved_config.clip_black, resolved_config.clip_white)
}

// ====================== PASS 2 (SPECTRAL) ===========================
/// Pass 2: final frames => color mapping => write frames (spectral, 16-bit output)
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
    last_frame_out: &mut Option<ImageBuffer<Rgb<u16>, Vec<u16>>>,
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
    let effect_config = build_effect_config_from_resolved(resolved_config, render_config);
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create nebula configuration (rendered separately, not in effect chain)
    let nebula_config = build_nebula_config(resolved_config, noise_seed);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);
    let dt = constants::DEFAULT_DT;

    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);
    let temporal_smoother = if render_config.temporal_smoothing_enabled {
        Some(TemporalSmoothing::new(TemporalSmoothingConfig {
            blend_factor: render_config.temporal_smoothing_blend.clamp(0.0, 0.95),
            alpha_threshold: 0.01,
        }))
    } else {
        None
    };
    let mut exposure_state: Option<f64> = None;

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

            // Skip background compositing entirely when nebula is disabled.
            let mut final_frame_pixels = if nebula_config.strength > 0.0 {
                let nebula_background = generate_nebula_background(
                    width as usize,
                    height as usize,
                    step / frame_interval,
                    &nebula_config,
                );
                composite_buffers(&nebula_background, &trajectory_pixels)
            } else {
                trajectory_pixels
            };

            if let Some(smoother) = &temporal_smoother {
                final_frame_pixels = smoother.process_frame(final_frame_pixels);
            }
            if render_config.exposure_damping_enabled {
                apply_exposure_damping(
                    &mut final_frame_pixels,
                    &mut exposure_state,
                    render_config.exposure_damping_rate,
                );
            }

            // levels + ACES tonemapping to 16-bit
            let mut buf_16bit = vec![0u16; ctx.pixel_count() * 3];
            buf_16bit.par_chunks_mut(3).zip(final_frame_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    let mapped = tonemap_to_16bit(fr, fg, fb, fa, &levels);
                    chunk[0] = mapped[0];
                    chunk[1] = mapped[1];
                    chunk[2] = mapped[2];
                },
            );
            if render_config.output_dither_enabled {
                apply_output_dither(&mut buf_16bit, width as usize, step / frame_interval);
            }

            // Convert u16 buffer to bytes for FFmpeg (little-endian rgb48le format)
            let buf_bytes = unsafe {
                std::slice::from_raw_parts(buf_16bit.as_ptr() as *const u8, buf_16bit.len() * 2)
            };

            frame_sink(buf_bytes)?;
            if is_final {
                *last_frame_out = ImageBuffer::from_raw(width, height, buf_16bit);
            }
        }
    }
    info!("   pass 2 (spectral render): 100% done");
    Ok(())
}

// ====================== SINGLE FRAME RENDERING ===========================
/// Render a single test frame (first frame only) for quick testing (16-bit output)
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
) -> Result<ImageBuffer<Rgb<u16>, Vec<u16>>> {
    info!("   Rendering first frame only (test mode)...");

    let width = resolved_config.width;
    let height = resolved_config.height;
    let special_mode = resolved_config.special_mode;

    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Build effect configuration from resolved config
    let effect_config = build_effect_config_from_resolved(resolved_config, render_config);
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create nebula configuration
    let nebula_config = build_nebula_config(resolved_config, noise_seed);

    let total_steps = positions[0].len();
    let dt = constants::DEFAULT_DT;

    // Create velocity HDR calculator for efficient multiplier computation
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

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
        .expect("Failed to process test frame");

    // Skip background compositing entirely when nebula is disabled.
    let final_pixels = if nebula_config.strength > 0.0 {
        let nebula_background =
            generate_nebula_background(width as usize, height as usize, 0, &nebula_config);
        composite_buffers(&nebula_background, &trajectory_pixels)
    } else {
        trajectory_pixels
    };

    // Tonemap to 16-bit
    let mut buf_16bit = vec![0u16; ctx.pixel_count() * 3];
    buf_16bit.par_chunks_mut(3).zip(final_pixels.par_iter()).for_each(
        |(chunk, &(fr, fg, fb, fa))| {
            let mapped = tonemap_to_16bit(fr, fg, fb, fa, &levels);
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

/// Render a short sequence of probe frames for temporal quality scoring.
///
/// This is intentionally limited to the first `probe_count` output frame boundaries
/// and is used by curation to estimate temporal beauty without rendering full video.
#[allow(clippy::too_many_arguments)] // Low-level rendering primitive requires all parameters
pub fn render_probe_frames_spectral(
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
    probe_count: usize,
) -> Result<Vec<ImageBuffer<Rgb<u16>, Vec<u16>>>> {
    let probe_count = probe_count.max(1);
    let width = resolved_config.width;
    let height = resolved_config.height;
    let special_mode = resolved_config.special_mode;

    let ctx = RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    let effect_config = build_effect_config_from_resolved(resolved_config, render_config);
    let effect_chain = EffectChainBuilder::new(effect_config);

    let nebula_config = build_nebula_config(resolved_config, noise_seed);

    let total_steps = positions[0].len();
    let dt = constants::DEFAULT_DT;
    let frame_interval = (total_steps / constants::DEFAULT_TARGET_FRAMES as usize).max(1);
    let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);
    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);

    let temporal_smoother = if render_config.temporal_smoothing_enabled {
        Some(TemporalSmoothing::new(TemporalSmoothingConfig {
            blend_factor: render_config.temporal_smoothing_blend.clamp(0.0, 0.95),
            alpha_threshold: 0.01,
        }))
    } else {
        None
    };
    let mut exposure_state: Option<f64> = None;
    let mut probes: Vec<ImageBuffer<Rgb<u16>, Vec<u16>>> = Vec::with_capacity(probe_count);

    for step in 0..total_steps {
        let vertices = prepare_triangle_vertices(
            positions,
            colors,
            &[body_alphas[0], body_alphas[1], body_alphas[2]],
            step,
            &ctx,
        );

        let hdr_mult_01 = velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = velocity_calc.compute_segment_multiplier(step, 2, 0);

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
            apply_energy_density_shift(&mut accum_spd, special_mode);
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            let frame_number = step / frame_interval;
            let frame_params = FrameParams { _frame_number: frame_number, _density: None };
            let rgba_buffer = std::mem::take(&mut accum_rgba);
            let trajectory_pixels = effect_chain.process_frame(
                rgba_buffer,
                width as usize,
                height as usize,
                &frame_params,
            )?;
            accum_rgba.clear();
            accum_rgba.resize(ctx.pixel_count(), (0.0, 0.0, 0.0, 0.0));

            let mut final_pixels = if nebula_config.strength > 0.0 {
                let nebula_background = generate_nebula_background(
                    width as usize,
                    height as usize,
                    frame_number,
                    &nebula_config,
                );
                composite_buffers(&nebula_background, &trajectory_pixels)
            } else {
                trajectory_pixels
            };

            if let Some(smoother) = &temporal_smoother {
                final_pixels = smoother.process_frame(final_pixels);
            }
            if render_config.exposure_damping_enabled {
                apply_exposure_damping(
                    &mut final_pixels,
                    &mut exposure_state,
                    render_config.exposure_damping_rate,
                );
            }

            let mut buf_16bit = vec![0u16; ctx.pixel_count() * 3];
            buf_16bit.par_chunks_mut(3).zip(final_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    let mapped = tonemap_to_16bit(fr, fg, fb, fa, &levels);
                    chunk[0] = mapped[0];
                    chunk[1] = mapped[1];
                    chunk[2] = mapped[2];
                },
            );

            let image = ImageBuffer::from_raw(width, height, buf_16bit).ok_or_else(|| {
                RenderError::ImageEncoding("Failed to create probe frame image buffer".to_string())
            })?;
            probes.push(image);

            if probes.len() >= probe_count {
                break;
            }
        }
    }

    Ok(probes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::randomizable_config::RandomizableEffectConfig;
    use crate::sim::Sha3RandomByteStream;

    fn sample_resolved(special_mode: bool) -> randomizable_config::ResolvedEffectConfig {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 100.0, 300.0, 300.0, 1.0);
        let config = RandomizableEffectConfig {
            nebula_strength: Some(0.08),
            nebula_octaves: Some(4),
            nebula_base_frequency: Some(0.0014),
            ..Default::default()
        };
        let (resolved, _) = config.resolve(&mut rng, 320, 180, special_mode);
        resolved
    }

    fn mean_rgb_delta(a: &PixelBuffer, b: &PixelBuffer) -> f64 {
        assert_eq!(a.len(), b.len());
        let mut total = 0.0;
        for (lhs, rhs) in a.iter().zip(b.iter()) {
            total += (lhs.0 - rhs.0).abs();
            total += (lhs.1 - rhs.1).abs();
            total += (lhs.2 - rhs.2).abs();
        }
        total / (a.len() as f64 * 3.0)
    }

    #[test]
    fn nebula_config_is_disabled_outside_special_mode() {
        let mut resolved = sample_resolved(false);
        resolved.nebula_strength = 0.10;

        let config = build_nebula_config(&resolved, 42);
        assert_eq!(config.strength, 0.0);

        let frame = generate_nebula_background(64, 36, 0, &config);
        assert!(frame.iter().all(|&(r, g, b, a)| r == 0.0 && g == 0.0 && b == 0.0 && a == 0.0));
    }

    #[test]
    fn nebula_config_uses_gentle_special_mode_temporal_defaults() {
        let mut resolved = sample_resolved(true);
        resolved.nebula_strength = 0.11;
        resolved.nebula_octaves = 6;
        resolved.nebula_base_frequency = 0.0021;

        let config = build_nebula_config(&resolved, 77);
        assert!((config.strength - 0.11).abs() < 1e-12);
        assert_eq!(config.octaves, 6);
        assert!((config.base_frequency - 0.0021).abs() < 1e-12);
        assert!((config.time_scale - 0.0022).abs() < 1e-12);
        assert!((config.edge_fade - 0.25).abs() < 1e-12);
    }

    #[test]
    fn nebula_background_changes_gradually_between_adjacent_frames() {
        let resolved = sample_resolved(true);
        let config = build_nebula_config(&resolved, 1234);

        let frame_0 = generate_nebula_background(96, 54, 120, &config);
        let frame_1 = generate_nebula_background(96, 54, 121, &config);
        let delta = mean_rgb_delta(&frame_0, &frame_1);

        assert!(delta > 0.0, "Nebula should evolve over time");
        assert!(
            delta < 0.01,
            "Nebula should evolve smoothly; adjacent-frame delta too high: {delta:.6}"
        );
    }

    #[test]
    fn nebula_background_is_black_when_strength_is_zero() {
        let mut resolved = sample_resolved(true);
        resolved.nebula_strength = 0.0;
        let config = build_nebula_config(&resolved, 99);

        let frame = generate_nebula_background(64, 64, 10, &config);
        assert!(frame.iter().all(|&(r, g, b, a)| r == 0.0 && g == 0.0 && b == 0.0 && a == 0.0));
    }

    #[test]
    fn nebula_controller_lifts_visibility_in_open_background() {
        let (controlled, gain) = controlled_nebula_alpha(0.006, 0.0);
        assert!(controlled > 0.006, "controller should gently lift very faint nebula");
        assert!(gain > 1.0);
        assert!(controlled <= 0.13);
    }

    #[test]
    fn nebula_controller_caps_dominance_under_dense_foreground() {
        let (controlled, _) = controlled_nebula_alpha(0.14, 0.85);
        assert!(
            controlled <= 0.05,
            "dense foreground should aggressively cap nebula alpha, got {controlled}"
        );
    }

    #[test]
    fn nebula_palette_is_deterministic_and_hint_sensitive() {
        let mut resolved = sample_resolved(true);
        resolved.gradient_map_palette = 1;
        let a = build_nebula_config(&resolved, 31415);
        let b = build_nebula_config(&resolved, 31415);
        assert_eq!(a.palette_id, b.palette_id);
        assert_eq!(a.colors, b.colors);

        resolved.gradient_map_palette = 6;
        let c = build_nebula_config(&resolved, 31415);
        assert_ne!(
            a.palette_id, c.palette_id,
            "palette hint should influence nebula palette selection"
        );
    }

    #[test]
    fn nebula_palette_id_helper_returns_none_when_nebula_disabled() {
        let mut resolved = sample_resolved(false);
        resolved.nebula_strength = 0.0;
        assert!(nebula_palette_id_for_config(&resolved, 100).is_none());
    }

    #[test]
    fn nebula_palette_id_helper_matches_config_builder() {
        let mut resolved = sample_resolved(true);
        resolved.gradient_map_palette = 9;
        resolved.nebula_strength = 0.07;

        let config = build_nebula_config(&resolved, 2026);
        let palette_id = nebula_palette_id_for_config(&resolved, 2026).expect("palette expected");
        assert_eq!(palette_id, config.palette_id);
    }
}
