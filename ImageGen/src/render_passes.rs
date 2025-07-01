//! Render passes for histogram building and frame writing

use crate::oklab;
use crate::render::{
    color::OklabColor,
    context::RenderContext,
    drawing::{draw_line_segment_aa_alpha, draw_line_segment_aa_spectral, LineParams},
    effects::{DogBloomConfig, PostEffectConfig, create_post_effect_chain, parallel_blur_2d_rgba},
    RenderConfig,
};
use crate::render_utils::{EffectChainBuilder, EffectConfig, FrameParams, HistogramData};
use crate::spectrum::{spd_to_rgba, NUM_BINS};
use image::{ImageBuffer, Rgb};
use log::{debug, info, trace};
use nalgebra::Vector3;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use std::error::Error;

// ACES tone mapping constants
const ACES_A: f64 = 2.51;
const ACES_B: f64 = 0.03;
const ACES_C: f64 = 2.43;
const ACES_D: f64 = 0.59;
const ACES_E: f64 = 0.14;

/// ACES filmic tone mapping function
#[inline]
fn aces_film(x: f64) -> f64 {
    (x * (ACES_A * x + ACES_B)) / (x * (ACES_C * x + ACES_D) + ACES_E)
}

/// ACES tone mapping look-up table for performance
struct AcesLut {
    table: Vec<f64>,
    scale: f64,
    max_input: f64,
}

impl AcesLut {
    fn new() -> Self {
        const LUT_SIZE: usize = 4096;
        const MAX_INPUT: f64 = 10.0; // Maximum expected input value
        
        let mut table = Vec::with_capacity(LUT_SIZE);
        let scale = (LUT_SIZE - 1) as f64 / MAX_INPUT;
        
        for i in 0..LUT_SIZE {
            let x = (i as f64 / (LUT_SIZE - 1) as f64) * MAX_INPUT;
            table.push(aces_film(x));
        }
        
        Self { table, scale, max_input: MAX_INPUT }
    }
    
    #[inline]
    fn apply(&self, x: f64) -> f64 {
        if x <= 0.0 {
            return 0.0;
        }
        if x >= self.max_input {
            return aces_film(x); // Fall back to computation for out-of-range values
        }
        
        let idx_f = x * self.scale;
        let idx = idx_f as usize;
        if idx >= self.table.len() - 1 {
            return self.table[self.table.len() - 1];
        }
        
        // Linear interpolation for better accuracy
        let frac = idx_f - idx as f64;
        let y0 = self.table[idx];
        let y1 = self.table[idx + 1];
        y0 + (y1 - y0) * frac
    }
}

// Global ACES LUT instance
static ACES_LUT: Lazy<AcesLut> = Lazy::new(AcesLut::new);

/// Convert accumulation buffer from OKLab to RGB
fn convert_accum_buffer_to_rgb(
    buffer: &[(f64, f64, f64, f64)],
) -> Vec<(f64, f64, f64, f64)> {
    buffer.par_iter()
        .map(|&(l, a, b, alpha)| {
            let rgb = oklab::oklab_to_linear_srgb(l, a, b);
            (rgb.0, rgb.1, rgb.2, alpha)
        })
        .collect()
}

/// Convert spectral power distribution buffer to RGBA
fn convert_spd_buffer_to_rgba(src: &[[f64; NUM_BINS]], dest: &mut [(f64, f64, f64, f64)]) {
    dest.par_iter_mut()
        .zip(src.par_iter())
        .for_each(|(dst, spd)| {
            let rgba = spd_to_rgba(spd);
            dst.0 = rgba.0;
            dst.1 = rgba.1;
            dst.2 = rgba.2;
            dst.3 = rgba.3;
        });
}



/// Pass 1: Build histogram for color leveling
#[allow(dead_code)] // Exported API, not used in current example
#[allow(clippy::too_many_arguments)]
pub fn pass_1_build_histogram(
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
    perceptual_blur_config: Option<&crate::post_effects::PerceptualBlurConfig>,
    render_config: &RenderConfig,
) {
    info!("Starting pass 1: building histogram");
    
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
    };
    let effect_chain = EffectChainBuilder::new(effect_config);
    
    // Create histogram storage
    let mut histogram = HistogramData::with_capacity(ctx.pixel_count() * 10);

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 100).max(1);

    // Iterate through ALL steps
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            debug!("Pass 1 progress: {:.0}%", pct);
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
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, LineParams { x0, y0, x1, y1, col0: c0, col1: c1, alpha0: a0, alpha1: a1, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, LineParams { x0: x1, y0: y1, x1: x2, y1: y2, col0: c1, col1: c2, alpha0: a1, alpha1: a2, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, LineParams { x0: x2, y0: y2, x1: x0, y1: y0, col0: c2, col1: c0, alpha0: a2, alpha1: a0, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });

        // Process frame data on frame_interval OR the very last step
        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Convert from OKLab to RGB
            let rgb_buffer = convert_accum_buffer_to_rgb(&accum_crisp);
            
            // Process with persistent effect chain
            let frame_params = FrameParams {};
            
            let final_frame_pixels = effect_chain.process_frame(
                rgb_buffer,
                width as usize,
                height as usize,
                &frame_params,
            ).expect("Post-effect chain failed");

            // Collect histogram data
            histogram.reserve(ctx.pixel_count());
            for &(r, g, b, a) in &final_frame_pixels {
                histogram.push(r * a, g * a, b * a);
            }
        }
    }
    
    // Transfer histogram data to output vectors
    for rgb in histogram.data() {
        all_r.push(rgb[0]);
        all_g.push(rgb[1]);
        all_b.push(rgb[2]);
    }
    
    info!("Pass 1 complete: {} histogram samples collected", all_r.len());
}

/// Pass 2: Write frames with color correction
#[allow(dead_code)] // Exported API, not used in current example
#[allow(clippy::too_many_arguments)]
pub fn pass_2_write_frames(
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
    perceptual_blur_config: Option<&crate::post_effects::PerceptualBlurConfig>,
    mut frame_sink: impl FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
    render_config: &RenderConfig,
) -> Result<(), Box<dyn Error>> {
    info!("Starting pass 2: writing frames");
    
    // Precompute color correction ranges
    struct ColorRanges {
        r: f64,
        g: f64,
        b: f64,
    }
    
    let ranges = ColorRanges {
        r: if white_r > black_r { white_r - black_r } else { 1.0 },
        g: if white_g > black_g { white_g - black_g } else { 1.0 },
        b: if white_b > black_b { white_b - black_b } else { 1.0 },
    };
    
    debug!("Color ranges: R={:.4}, G={:.4}, B={:.4}", ranges.r, ranges.g, ranges.b);
    
    // Create render context
    let ctx = RenderContext::new(width, height, positions);
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];
    let mut accum_blur = vec![(0.0, 0.0, 0.0, 0.0); ctx.pixel_count()];
    
    // Create post-effect chain
    let post_chain = create_post_effect_chain(PostEffectConfig {
        bloom_mode,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config,
        hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config,
    });
    
    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 100).max(1);
    let mut frame_count = 0;
    
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            debug!("Pass 2 progress: {:.0}%", pct);
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

        // Draw crisp lines
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, LineParams { x0, y0, x1, y1, col0: c0, col1: c1, alpha0: a0, alpha1: a1, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, LineParams { x0: x1, y0: y1, x1: x2, y1: y2, col0: c1, col1: c2, alpha0: a1, alpha1: a2, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, LineParams { x0: x2, y0: y2, x1: x0, y1: y0, col0: c2, col1: c0, alpha0: a2, alpha1: a0, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });

        // Draw blurred lines (for motion blur effect)
        if blur_radius_px > 0 {
            draw_line_segment_aa_alpha(&mut accum_blur, width, height, LineParams { x0, y0, x1, y1, col0: c0, col1: c1, alpha0: a0, alpha1: a1, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
            draw_line_segment_aa_alpha(&mut accum_blur, width, height, LineParams { x0: x1, y0: y1, x1: x2, y1: y2, col0: c1, col1: c2, alpha0: a1, alpha1: a2, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
            draw_line_segment_aa_alpha(&mut accum_blur, width, height, LineParams { x0: x2, y0: y2, x1: x0, y1: y0, col0: c2, col1: c0, alpha0: a2, alpha1: a0, hdr_scale: render_config.hdr_scale, alpha_compress: render_config.alpha_compress });
        }

        // Process frame on interval or final step
        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            frame_count += 1;
            trace!("Processing frame {}", frame_count);
            
            // Apply blur to the blur buffer
            if blur_radius_px > 0 {
                parallel_blur_2d_rgba(&mut accum_blur, width as usize, height as usize, blur_radius_px);
            }
            
            // Composite blur over crisp
            if blur_radius_px > 0 {
                accum_crisp.par_iter_mut()
                    .zip(accum_blur.par_iter())
                    .for_each(|(crisp, &blur)| {
                        let core_factor = 1.0 - blur_strength;
                        crisp.0 = crisp.0 * blur_core_brightness + blur.0 * core_factor;
                        crisp.1 = crisp.1 * blur_core_brightness + blur.1 * core_factor;
                        crisp.2 = crisp.2 * blur_core_brightness + blur.2 * core_factor;
                        crisp.3 = crisp.3.max(blur.3);
                    });
            }
            
            // Convert to RGB and apply post-effects
            let rgb_buffer = convert_accum_buffer_to_rgb(&accum_crisp);
            let final_pixels = post_chain.process(rgb_buffer, width as usize, height as usize)?;
            
            // Convert to 8-bit with color correction
            let mut rgb_bytes = vec![0u8; ctx.pixel_count() * 3];
            
            rgb_bytes.par_chunks_exact_mut(3)
                .zip(final_pixels.par_iter())
                .for_each(|(rgb, &(r, g, b, _a))| {
                    // Apply color leveling
                    let r_norm = ((r - black_r) / ranges.r).clamp(0.0, 1.0);
                    let g_norm = ((g - black_g) / ranges.g).clamp(0.0, 1.0);
                    let b_norm = ((b - black_b) / ranges.b).clamp(0.0, 1.0);
                    
                    // Apply tone mapping
                    let r_mapped = ACES_LUT.apply(r_norm);
                    let g_mapped = ACES_LUT.apply(g_norm);
                    let b_mapped = ACES_LUT.apply(b_norm);
                    
                    // Convert to 8-bit
                    rgb[0] = (r_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                    rgb[1] = (g_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                    rgb[2] = (b_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                });
            
            // Send frame to sink
            frame_sink(&rgb_bytes)?;
            
            // Save last frame if requested
            if is_final && last_frame_out.is_some() {
                if let Some(img_out) = last_frame_out {
                    *img_out = ImageBuffer::from_raw(width, height, rgb_bytes)
                        .expect("Failed to create image buffer");
                }
            }
            
            // Clear buffers for next frame
            if !is_final {
                accum_crisp.fill((0.0, 0.0, 0.0, 0.0));
                accum_blur.fill((0.0, 0.0, 0.0, 0.0));
            }
        }
    }
    
    info!("Pass 2 complete: {} frames written", frame_count);
    Ok(())
}

/// Pass 1: Build histogram (spectral mode)
#[allow(clippy::too_many_arguments)]
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
    perceptual_blur_config: Option<&crate::post_effects::PerceptualBlurConfig>,
    render_config: &RenderConfig,
) {
    info!("Starting pass 1 (spectral): building histogram");
    
    let ctx = RenderContext::new(width, height, positions);
    let npix = ctx.pixel_count();
    
    let mut accum_spd = vec![[0.0; NUM_BINS]; npix];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];
    
    let post_chain = create_post_effect_chain(PostEffectConfig {
        bloom_mode,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config,
        hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config,
    });
    
    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 100).max(1);
    
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            debug!("Pass 1 (spectral) progress: {:.0}%", pct);
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

        // Draw spectral lines
        draw_line_segment_aa_spectral(&mut accum_spd, width, height, x0, y0, x1, y1, c0, c1, a0, a1, render_config.hdr_scale, render_config.alpha_compress);
        draw_line_segment_aa_spectral(&mut accum_spd, width, height, x1, y1, x2, y2, c1, c2, a1, a2, render_config.hdr_scale, render_config.alpha_compress);
        draw_line_segment_aa_spectral(&mut accum_spd, width, height, x2, y2, x0, y0, c2, c0, a2, a0, render_config.hdr_scale, render_config.alpha_compress);

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Convert spectral to RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);
            
            // Apply post-effects
            let final_pixels = post_chain.process(accum_rgba.clone(), width as usize, height as usize)
                .expect("Post-effect chain failed");
            
            // Collect histogram data
            for &(r, g, b, a) in &final_pixels {
                all_r.push(r * a);
                all_g.push(g * a);
                all_b.push(b * a);
            }
        }
    }
    
    info!("Pass 1 (spectral) complete: {} histogram samples", all_r.len());
}

/// Pass 2: Write frames (spectral mode)
#[allow(clippy::too_many_arguments)]
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
    perceptual_blur_config: Option<&crate::post_effects::PerceptualBlurConfig>,
    mut frame_sink: impl FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
    render_config: &RenderConfig,
) -> Result<(), Box<dyn Error>> {
    info!("Starting pass 2 (spectral): writing frames");
    
    struct ColorRanges {
        r: f64,
        g: f64,
        b: f64,
    }
    
    let ranges = ColorRanges {
        r: if white_r > black_r { white_r - black_r } else { 1.0 },
        g: if white_g > black_g { white_g - black_g } else { 1.0 },
        b: if white_b > black_b { white_b - black_b } else { 1.0 },
    };
    
    let ctx = RenderContext::new(width, height, positions);
    let npix = ctx.pixel_count();
    
    let mut accum_spd = vec![[0.0; NUM_BINS]; npix];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];
    
    let post_chain = create_post_effect_chain(PostEffectConfig {
        bloom_mode,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        dog_config,
        hdr_mode,
        perceptual_blur_enabled,
        perceptual_blur_config,
    });
    
    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 100).max(1);
    let mut frame_count = 0;
    
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            debug!("Pass 2 (spectral) progress: {:.0}%", pct);
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

        // Draw spectral lines
        draw_line_segment_aa_spectral(&mut accum_spd, width, height, x0, y0, x1, y1, c0, c1, a0, a1, render_config.hdr_scale, render_config.alpha_compress);
        draw_line_segment_aa_spectral(&mut accum_spd, width, height, x1, y1, x2, y2, c1, c2, a1, a2, render_config.hdr_scale, render_config.alpha_compress);
        draw_line_segment_aa_spectral(&mut accum_spd, width, height, x2, y2, x0, y0, c2, c0, a2, a0, render_config.hdr_scale, render_config.alpha_compress);

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            frame_count += 1;
            
            // Convert spectral to RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);
            
            // Apply post-effects
            let final_pixels = post_chain.process(accum_rgba.clone(), width as usize, height as usize)
                .expect("Post-effect chain failed");
            
            // Convert to 8-bit with color correction
            let mut rgb_bytes = vec![0u8; npix * 3];
            
            rgb_bytes.par_chunks_exact_mut(3)
                .zip(final_pixels.par_iter())
                .for_each(|(rgb, &(r, g, b, _a))| {
                    // Apply color leveling
                    let r_norm = ((r - black_r) / ranges.r).clamp(0.0, 1.0);
                    let g_norm = ((g - black_g) / ranges.g).clamp(0.0, 1.0);
                    let b_norm = ((b - black_b) / ranges.b).clamp(0.0, 1.0);
                    
                    // Apply tone mapping
                    let r_mapped = ACES_LUT.apply(r_norm);
                    let g_mapped = ACES_LUT.apply(g_norm);
                    let b_mapped = ACES_LUT.apply(b_norm);
                    
                    // Convert to 8-bit
                    rgb[0] = (r_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                    rgb[1] = (g_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                    rgb[2] = (b_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                });
            
            // Send frame to sink
            frame_sink(&rgb_bytes)?;
            
            // Save last frame if requested
            if is_final && last_frame_out.is_some() {
                if let Some(img_out) = last_frame_out {
                    *img_out = ImageBuffer::from_raw(width, height, rgb_bytes)
                        .expect("Failed to create image buffer");
                }
            }
            
            // Clear buffers for next frame
            if !is_final {
                accum_spd.fill([0.0; NUM_BINS]);
                accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];
            }
        }
    }
    
    info!("Pass 2 (spectral) complete: {} frames written", frame_count);
    Ok(())
} 