//! Rendering module: histogram passes, color mapping, line drawing, and output
//!
//! This module provides a complete rendering pipeline for the three-body problem visualization,
//! including coordinate transformations, line drawing, post-processing effects, and video output.

use crate::post_effects::PerceptualBlurConfig;
use crate::spectrum::NUM_BINS;
use nalgebra::Vector3;
use rayon::prelude::*;
use std::sync::LazyLock;
use tracing::{debug, info};

// Module declarations
pub mod color;
pub mod constants;
pub mod context;
pub mod drawing;
pub mod effects;
pub mod error;
pub mod histogram;
pub mod video;

// Import from our submodules
use self::context::RenderContext;
use self::effects::{
    EffectChainBuilder, EffectConfig, FrameParams, convert_accum_buffer_to_rgb,
    convert_spd_buffer_to_rgba,
};
use self::error::{RenderError, Result};
use self::histogram::{HistogramData, calculate_frame_density};
use crate::post_effects::{AetherConfig, ChampleveConfig, ColorGradeParams};

// Re-export core types and functions for public API compatibility
pub use color::{OklabColor, generate_body_color_sequences};
pub use drawing::{
    draw_line_segment_aa_alpha, draw_line_segment_aa_spectral, parallel_blur_2d_rgba,
};
pub use effects::{DogBloomConfig, ExposureCalculator, apply_dog_bloom};
pub use histogram::compute_black_white_gamma;
pub use video::{VideoEncodingOptions, create_video_from_frames_singlepass};

// Re-export types from dependencies used in public API
pub use image::{DynamicImage, ImageBuffer, Rgb};

/// Rendering configuration parameters
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub struct RenderConfig {
    pub alpha_compress: f64,
    pub hdr_scale: f64,
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self { alpha_compress: 0.0, hdr_scale: constants::DEFAULT_HDR_SCALE }
    }
}

#[derive(Clone, Copy, Debug)]
struct ChannelLevels {
    black: [f64; 3],
    range: [f64; 3],
}

impl ChannelLevels {
    #[inline]
    fn new(
        black_r: f64,
        white_r: f64,
        black_g: f64,
        white_g: f64,
        black_b: f64,
        white_b: f64,
    ) -> Self {
        Self {
            black: [black_r, black_g, black_b],
            range: [
                (white_r - black_r).max(1e-14),
                (white_g - black_g).max(1e-14),
                (white_b - black_b).max(1e-14),
            ],
        }
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
#[allow(dead_code)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn pass_1_build_histogram(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    frame_interval: usize,
    all_r: &mut Vec<f64>,
    all_g: &mut Vec<f64>,
    all_b: &mut Vec<f64>,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&PerceptualBlurConfig>,
    render_config: &RenderConfig,
) {
    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Create persistent effect chain
    let effect_config = EffectConfig {
        bloom_mode: bloom_mode.to_string(),
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config: dog_config.clone(),
        hdr_mode: hdr_mode.to_string(),
        perceptual_blur_enabled,
        perceptual_blur_config: perceptual_blur_config.cloned(),
        color_grade_enabled: true,
        color_grade_params: ColorGradeParams::default(),
        champleve_enabled: false,
        champleve_config: ChampleveConfig::default(),
        aether_enabled: true,
        aether_config: AetherConfig::default(),
    };
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create histogram storage (more efficient than separate vectors)
    let mut histogram = HistogramData::with_capacity(ctx.pixel_count() * 10); // Estimate capacity

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    // Iterate through ALL steps
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 1, "Histogram pass progress");
        }
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

        // Accumulate crisp lines for every step
        draw_line_segment_aa_alpha(
            &mut accum_crisp,
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_alpha(
            &mut accum_crisp,
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_alpha(
            &mut accum_crisp,
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
            render_config.hdr_scale,
        );

        // --- Per-Frame Processing for Histogram ---
        let is_final = step == total_steps - 1;
        // Process frame data on frame_interval OR the very last step
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Convert from draw space to RGB if needed
            let rgb_buffer = convert_accum_buffer_to_rgb(&accum_crisp);

            // Process with persistent effect chain
            let frame_params = FrameParams {
                frame_number: step / frame_interval,
                density: None, // Could calculate if needed
            };

            let final_frame_pixels = effect_chain
                .process_frame(rgb_buffer, width as usize, height as usize, &frame_params)
                .expect("Failed to process frame during histogram pass");

            // Collect histogram data more efficiently
            histogram.reserve(ctx.pixel_count());
            for &(r, g, b, a) in &final_frame_pixels {
                // Composite over black implicitly (premultiplying by alpha)
                histogram.push(r * a, g * a, b * a);
            }
        }
    }

    // Transfer histogram data to output vectors (for backward compatibility)
    all_r.clear();
    all_g.clear();
    all_b.clear();
    all_r.reserve(histogram.len());
    all_g.reserve(histogram.len());
    all_b.reserve(histogram.len());

    // Extract channels from interleaved storage
    for rgb in histogram.data() {
        all_r.push(rgb[0]);
        all_g.push(rgb[1]);
        all_b.push(rgb[2]);
    }

    info!("   pass 1 (histogram): 100% done"); // Final message
}

/// Pass 2: final frames => color mapping => write frames
#[allow(dead_code)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn pass_2_write_frames(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,        // Added blur strength for compositing
    blur_core_brightness: f64, // Added core brightness for compositing
    frame_interval: usize,
    black_r: f64,
    white_r: f64,
    black_g: f64,
    white_g: f64,
    black_b: f64,
    white_b: f64,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&PerceptualBlurConfig>,
    mut frame_sink: impl FnMut(&[u8]) -> Result<()>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
    render_config: &RenderConfig,
) -> Result<()> {
    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Create persistent effect chain
    let effect_config = EffectConfig {
        bloom_mode: bloom_mode.to_string(),
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config: dog_config.clone(),
        hdr_mode: hdr_mode.to_string(),
        perceptual_blur_enabled,
        perceptual_blur_config: perceptual_blur_config.cloned(),
        color_grade_enabled: true,
        color_grade_params: ColorGradeParams::default(),
        champleve_enabled: false,
        champleve_config: ChampleveConfig::default(),
        aether_enabled: true,
        aether_config: AetherConfig::default(),
    };
    let effect_chain = EffectChainBuilder::new(effect_config);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    // Get initial alpha compression value from render config
    let base_alpha_compress = render_config.alpha_compress;

    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);

    // Iterate through ALL steps
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 2, "Render pass progress");
        }
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

        // Accumulate crisp lines
        draw_line_segment_aa_alpha(
            &mut accum_crisp,
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_alpha(
            &mut accum_crisp,
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_alpha(
            &mut accum_crisp,
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
            render_config.hdr_scale,
        );

        // --- Per-Frame Processing and Writing ---
        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Calculate frame density and adapt alpha compression
            let density = calculate_frame_density(&accum_crisp);
            // Map density to alpha compression: low density = 0, high density = base value
            let adaptive_compress = if density < 0.1 {
                0.0 // Very low density: pure additive
            } else if density < 1.0 {
                base_alpha_compress * (density / 1.0) // Linear ramp up
            } else {
                base_alpha_compress // Full compression for high density
            };

            // Apply adaptive compression to the accumulation buffer if compression is enabled
            let compressed_buffer = if adaptive_compress > 0.0 {
                // Apply alpha compression: reduce alpha while preserving color ratios
                accum_crisp
                    .par_iter()
                    .map(|&(l, a, b, alpha)| {
                        if alpha > 0.0 {
                            // Compress alpha using 1 / (1 + k*alpha) formula
                            let compressed_alpha = alpha / (1.0 + adaptive_compress * alpha);
                            // Scale premultiplied color components proportionally
                            let scale = compressed_alpha / alpha;
                            (l * scale, a * scale, b * scale, compressed_alpha)
                        } else {
                            (l, a, b, alpha)
                        }
                    })
                    .collect()
            } else {
                accum_crisp.clone()
            };

            // Convert from OKLab to RGB
            let rgb_buffer = convert_accum_buffer_to_rgb(&compressed_buffer);

            // Process with persistent effect chain
            let frame_params =
                FrameParams { frame_number: step / frame_interval, density: Some(density) };

            let final_frame_pixels = effect_chain
                .process_frame(rgb_buffer, width as usize, height as usize, &frame_params)
                .expect("Failed to process frame during render pass");

            // 3. Apply Levels & Convert to 8-bit
            let mut buf_8bit = vec![0u8; ctx.pixel_count() * 3];
            buf_8bit.par_chunks_mut(3).zip(final_frame_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    let mapped = tonemap_to_8bit(fr, fg, fb, fa, &levels);
                    chunk[0] = mapped[0];
                    chunk[1] = mapped[1];
                    chunk[2] = mapped[2];
                },
            );

            // 4. Send Frame to Sink
            frame_sink(&buf_8bit)?;

            // 5. Store Last Frame for PNG Output
            if is_final {
                // Create ImageBuffer from the raw 8-bit buffer
                *last_frame_out = ImageBuffer::from_raw(width, height, buf_8bit);
            }
        }
    }
    info!("   pass 2 (render): 100% done");
    Ok(())
}

// ACES Filmic Tonemapping Curve (approximation)
// Source: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
const A: f64 = 2.51;
const B: f64 = 0.03;
const C: f64 = 2.43;
const D: f64 = 0.59;
const E: f64 = 0.14;

#[allow(dead_code)]
fn aces_film(x: f64) -> f64 {
    // Clamp negative values before applying curve
    let x = x.max(0.0);
    // Apply ACES curve formula
    (x * (A * x + B)) / (x * (C * x + D) + E)
}

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

// ====================== PASS 1 (SPECTRAL) ===========================
/// Pass 1: gather global histogram for final color leveling (spectral)
pub fn pass_1_build_histogram_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    frame_interval: usize,
    all_r: &mut Vec<f64>,
    all_g: &mut Vec<f64>,
    all_b: &mut Vec<f64>,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&PerceptualBlurConfig>,
    render_config: &RenderConfig,
) {
    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Create persistent effect chain
    let effect_config = EffectConfig {
        bloom_mode: bloom_mode.to_string(),
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config: dog_config.clone(),
        hdr_mode: hdr_mode.to_string(),
        perceptual_blur_enabled,
        perceptual_blur_config: perceptual_blur_config.cloned(),
        color_grade_enabled: true,
        color_grade_params: ColorGradeParams::default(),
        champleve_enabled: false,
        champleve_config: ChampleveConfig::default(),
        aether_enabled: true,
        aether_config: AetherConfig::default(),
    };
    let effect_chain = EffectChainBuilder::new(effect_config);

    // Create histogram storage
    let mut histogram = HistogramData::with_capacity(ctx.pixel_count() * 10);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 1, mode = "spectral", "Histogram pass progress");
        }
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

        draw_line_segment_aa_spectral(
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_spectral(
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_spectral(
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
            render_config.hdr_scale,
        );

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // convert SPD -> RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            // Process with persistent effect chain
            let frame_params = FrameParams { frame_number: step / frame_interval, density: None };

            // Take ownership of accum_rgba to avoid clone
            let rgba_buffer = std::mem::take(&mut accum_rgba);
            let final_frame_pixels = effect_chain
                .process_frame(rgba_buffer, width as usize, height as usize, &frame_params)
                .expect("Failed to process frame during spectral histogram pass");
            // Reallocate for next iteration
            accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

            // Collect histogram data efficiently
            histogram.reserve(ctx.pixel_count());
            for &(r, g, b, a) in &final_frame_pixels {
                histogram.push(r * a, g * a, b * a);
            }
        }
    }

    // Transfer histogram data to output vectors
    all_r.clear();
    all_g.clear();
    all_b.clear();
    all_r.reserve(histogram.len());
    all_g.reserve(histogram.len());
    all_b.reserve(histogram.len());

    for rgb in histogram.data() {
        all_r.push(rgb[0]);
        all_g.push(rgb[1]);
        all_b.push(rgb[2]);
    }

    info!("   pass 1 (spectral histogram): 100% done");
}

// ====================== PASS 2 (SPECTRAL) ===========================
/// Pass 2: final frames => color mapping => write frames (spectral)
pub fn pass_2_write_frames_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<OklabColor>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    frame_interval: usize,
    black_r: f64,
    white_r: f64,
    black_g: f64,
    white_g: f64,
    black_b: f64,
    white_b: f64,
    bloom_mode: &str,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&PerceptualBlurConfig>,
    mut frame_sink: impl FnMut(&[u8]) -> Result<()>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
    render_config: &RenderConfig,
) -> Result<()> {
    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; ctx.pixel_count()];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

    // Create persistent effect chain
    let effect_config = EffectConfig {
        bloom_mode: bloom_mode.to_string(),
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config: dog_config.clone(),
        hdr_mode: hdr_mode.to_string(),
        perceptual_blur_enabled,
        perceptual_blur_config: perceptual_blur_config.cloned(),
        color_grade_enabled: true,
        color_grade_params: ColorGradeParams::default(),
        champleve_enabled: false,
        champleve_config: ChampleveConfig::default(),
        aether_enabled: true,
        aether_config: AetherConfig::default(),
    };
    let effect_chain = EffectChainBuilder::new(effect_config);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);

    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * constants::PERCENT_FACTOR;
            debug!(progress = pct, pass = 2, mode = "spectral", "Render pass progress");
        }
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

        draw_line_segment_aa_spectral(
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_spectral(
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
            render_config.hdr_scale,
        );
        draw_line_segment_aa_spectral(
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
            render_config.hdr_scale,
        );

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Convert SPD -> RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            // Process with persistent effect chain
            let frame_params = FrameParams { frame_number: step / frame_interval, density: None };

            // Take ownership of accum_rgba to avoid clone
            let rgba_buffer = std::mem::take(&mut accum_rgba);
            let final_frame_pixels = effect_chain
                .process_frame(rgba_buffer, width as usize, height as usize, &frame_params)
                .expect("Failed to process frame during spectral render pass");
            // Reallocate for next iteration
            accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];

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
