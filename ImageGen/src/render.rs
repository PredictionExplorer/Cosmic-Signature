//! Rendering module: histogram passes, color mapping, line drawing, and output

use crate::post_effects::{PostEffectChain, AutoExposure, GaussianBloom, DogBloom, PerceptualBlur, PerceptualBlurConfig};
use crate::oklab;
use crate::sim;
use crate::spectrum::{BIN_SHIFT, NUM_BINS, rgb_to_bin, spd_to_rgba};
use crate::utils::{bounding_box, build_gaussian_kernel};
use image::{DynamicImage, ImageBuffer, Rgb};
use nalgebra::Vector3;
use rayon::prelude::*;
use std::error::Error;
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};

// Global parameter: strength of density-aware alpha compression.
// 0 => disabled (legacy behaviour).
static ALPHA_COMPRESS_BITS: AtomicU64 = AtomicU64::new(0);

// Global parameter: HDR scale multiplier for line alpha
static HDR_SCALE: AtomicU64 = AtomicU64::new(1.0f64.to_bits());

/// Set the global alpha-compression coefficient.
/// Should be called once from `main` after CLI parsing.
/// Typical range: 0 (disabled) .. 10 (very strong).
pub fn set_alpha_compress(k: f64) {
    ALPHA_COMPRESS_BITS.store(k.to_bits(), Ordering::Relaxed);
}

#[inline]
fn get_alpha_compress() -> f64 {
    f64::from_bits(ALPHA_COMPRESS_BITS.load(Ordering::Relaxed))
}

/// Set the global HDR scale coefficient.
pub fn set_hdr_scale(scale: f64) {
    HDR_SCALE.store(scale.to_bits(), Ordering::Relaxed);
}

#[inline]
fn get_hdr_scale() -> f64 {
    f64::from_bits(HDR_SCALE.load(Ordering::Relaxed))
}

/// Mipmap pyramid for efficient multi-scale filtering
pub struct MipPyramid {
    levels: Vec<Vec<(f64, f64, f64, f64)>>,
    widths: Vec<usize>,
    heights: Vec<usize>,
}

impl MipPyramid {
    pub fn new(base: &[(f64, f64, f64, f64)], width: usize, height: usize, levels: usize) -> Self {
        let mut pyramid = MipPyramid {
            levels: vec![base.to_vec()],
            widths: vec![width],
            heights: vec![height],
        };
        
        for level in 1..levels {
            let prev_w = pyramid.widths[level - 1];
            let prev_h = pyramid.heights[level - 1];
            let new_w = (prev_w + 1) / 2;
            let new_h = (prev_h + 1) / 2;
            
            let mut downsampled = vec![(0.0, 0.0, 0.0, 0.0); new_w * new_h];
            
            // Box filter downsample (parallel)
            downsampled.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
                let x = idx % new_w;
                let y = idx / new_w;
                
                // Sample 2x2 region from previous level
                let x0 = (x * 2).min(prev_w - 1);
                let x1 = ((x * 2) + 1).min(prev_w - 1);
                let y0 = (y * 2).min(prev_h - 1);
                let y1 = ((y * 2) + 1).min(prev_h - 1);
                
                let p00 = pyramid.levels[level - 1][y0 * prev_w + x0];
                let p01 = pyramid.levels[level - 1][y0 * prev_w + x1];
                let p10 = pyramid.levels[level - 1][y1 * prev_w + x0];
                let p11 = pyramid.levels[level - 1][y1 * prev_w + x1];
                
                *pixel = (
                    (p00.0 + p01.0 + p10.0 + p11.0) * 0.25,
                    (p00.1 + p01.1 + p10.1 + p11.1) * 0.25,
                    (p00.2 + p01.2 + p10.2 + p11.2) * 0.25,
                    (p00.3 + p01.3 + p10.3 + p11.3) * 0.25,
                );
            });
            
            pyramid.levels.push(downsampled);
            pyramid.widths.push(new_w);
            pyramid.heights.push(new_h);
        }
        
        pyramid
    }
    
    pub fn upsample_bilinear(&self, level: usize, target_w: usize, target_h: usize) -> Vec<(f64, f64, f64, f64)> {
        let src = &self.levels[level];
        let src_w = self.widths[level];
        let src_h = self.heights[level];
        let mut result = vec![(0.0, 0.0, 0.0, 0.0); target_w * target_h];
        
        result.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
            let x = idx % target_w;
            let y = idx / target_w;
            
            // Map to source coordinates
            let sx = (x as f64 * src_w as f64 / target_w as f64).min((src_w - 1) as f64);
            let sy = (y as f64 * src_h as f64 / target_h as f64).min((src_h - 1) as f64);
            
            let x0 = sx.floor() as usize;
            let y0 = sy.floor() as usize;
            let x1 = (x0 + 1).min(src_w - 1);
            let y1 = (y0 + 1).min(src_h - 1);
            
            let fx = sx - x0 as f64;
            let fy = sy - y0 as f64;
            
            // Bilinear interpolation
            let p00 = src[y0 * src_w + x0];
            let p01 = src[y0 * src_w + x1];
            let p10 = src[y1 * src_w + x0];
            let p11 = src[y1 * src_w + x1];
            
            let top = (
                p00.0 * (1.0 - fx) + p01.0 * fx,
                p00.1 * (1.0 - fx) + p01.1 * fx,
                p00.2 * (1.0 - fx) + p01.2 * fx,
                p00.3 * (1.0 - fx) + p01.3 * fx,
            );
            
            let bottom = (
                p10.0 * (1.0 - fx) + p11.0 * fx,
                p10.1 * (1.0 - fx) + p11.1 * fx,
                p10.2 * (1.0 - fx) + p11.2 * fx,
                p10.3 * (1.0 - fx) + p11.3 * fx,
            );
            
            *pixel = (
                top.0 * (1.0 - fy) + bottom.0 * fy,
                top.1 * (1.0 - fy) + bottom.1 * fy,
                top.2 * (1.0 - fy) + bottom.2 * fy,
                top.3 * (1.0 - fy) + bottom.3 * fy,
            );
        });
        
        result
    }
}

/// Configuration for Difference-of-Gaussians bloom
#[derive(Clone)]
pub struct DogBloomConfig {
    pub inner_sigma: f64,   // Base blur radius
    pub outer_ratio: f64,   // Outer sigma = inner * ratio (typically 2-3)
    pub strength: f64,      // DoG multiplier (0.2-0.8)
    pub threshold: f64,     // Minimum value to include
}

impl Default for DogBloomConfig {
    fn default() -> Self {
        Self {
            inner_sigma: 6.0,
            outer_ratio: 2.5,
            strength: 0.35,
            threshold: 0.01,
        }
    }
}

/// Auto-exposure calculator for HDR tone mapping
pub struct ExposureCalculator {
    target_percentile: f64,
    min_exposure: f64,
    max_exposure: f64,
}

impl Default for ExposureCalculator {
    fn default() -> Self {
        Self {
            target_percentile: 0.95,
            min_exposure: 0.1,
            max_exposure: 10.0,
        }
    }
}

impl ExposureCalculator {
    pub fn calculate_exposure(&self, pixels: &[(f64, f64, f64, f64)]) -> f64 {
        // Compute luminance values
        let luminances: Vec<f64> = pixels
            .par_iter()
            .map(|(r, g, b, a)| {
                // Rec. 709 luminance weights
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                lum * a  // Premultiplied
            })
            .filter(|&l| l > 0.0)  // Ignore black pixels
            .collect();
        
        if luminances.is_empty() {
            return 1.0;
        }
        
        // Find percentile using partial sort
        let mut sorted = luminances;
        let percentile_idx = ((sorted.len() as f64 * self.target_percentile) as usize)
            .min(sorted.len() - 1);
        
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let percentile_value = sorted[percentile_idx];
        
        // Calculate exposure to map percentile to ~0.8
        let exposure = 0.8 / percentile_value.max(1e-10);
        
        // Clamp to reasonable range
        exposure.clamp(self.min_exposure, self.max_exposure)
    }
}

/// Apply Difference-of-Gaussians bloom effect
pub fn apply_dog_bloom(
    input: &[(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    config: &DogBloomConfig,
) -> Vec<(f64, f64, f64, f64)> {
    // Create mip pyramid (3 levels)
    let pyramid = MipPyramid::new(input, width, height, 3);
    
    // Blur at different mip levels for efficiency
    let inner_radius = config.inner_sigma.round() as usize;
    let outer_radius = (config.inner_sigma * config.outer_ratio).round() as usize;
    
    // Blur level 1 (half resolution) with inner sigma
    let mut blur_inner = pyramid.levels[1].clone();
    parallel_blur_2d_rgba(
        &mut blur_inner,
        pyramid.widths[1],
        pyramid.heights[1],
        inner_radius / 2,  // Adjust for mip level
    );
    
    // Blur level 2 (quarter resolution) with outer sigma
    let mut blur_outer = pyramid.levels[2].clone();
    parallel_blur_2d_rgba(
        &mut blur_outer,
        pyramid.widths[2],
        pyramid.heights[2],
        outer_radius / 4,  // Adjust for mip level
    );
    
    // Upsample both to original resolution
    let inner_upsampled = pyramid.upsample_bilinear(1, width, height);
    let outer_upsampled = pyramid.upsample_bilinear(2, width, height);
    
    // Compute DoG and apply threshold
    let mut dog_result = vec![(0.0, 0.0, 0.0, 0.0); width * height];
    
    dog_result.par_iter_mut()
        .zip(inner_upsampled.par_iter())
        .zip(outer_upsampled.par_iter())
        .for_each(|((dog, &inner), &outer)| {
            let diff = (
                inner.0 - outer.0,
                inner.1 - outer.1,
                inner.2 - outer.2,
                inner.3 - outer.3,
            );
            
            // Compute luminance for thresholding
            let lum = 0.299 * diff.0 + 0.587 * diff.1 + 0.114 * diff.2;
            
            if lum > config.threshold {
                *dog = (
                    diff.0 * config.strength,
                    diff.1 * config.strength,
                    diff.2 * config.strength,
                    diff.3 * config.strength,
                );
            }
            // Negative values are left as zero (clamped)
        });
    
    dog_result
}

/// Save single image as PNG
pub fn save_image_as_png(
    rgb_img: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    path: &str,
) -> Result<(), Box<dyn Error>> {
    let dyn_img = DynamicImage::ImageRgb8(rgb_img.clone());
    dyn_img.save(path)?;
    println!("   Saved PNG => {path}");
    Ok(())
}

/// Pass 1: gather global histogram for final color leveling
#[allow(dead_code)]
pub fn pass_1_build_histogram(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
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
) {
    let npix = (width as usize) * (height as usize);
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    // Use bounding_box (with padding) for scaling
    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = (max_x - min_x).max(1e-12); // Avoid division by zero
        let hh = (max_y - min_y).max(1e-12);
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    // Iterate through ALL steps
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let _pct = (step as f64 / total_steps as f64) * 100.0;
            // Use print! or other logging if needed, avoiding excessive output
            // println!("   pass 1 (histogram): {:.0}% done", _pct);
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

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

        // Accumulate crisp lines for every step
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, x0, y0, x1, y1, c0, c1, a0, a1);
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, x1, y1, x2, y2, c1, c2, a1, a2);
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, x2, y2, x0, y0, c2, c0, a2, a0);

        // --- Per-Frame Processing for Histogram ---
        let is_final = step == total_steps - 1;
        // Process frame data on frame_interval OR the very last step
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Convert from draw space to RGB if needed
            let rgb_buffer = convert_accum_buffer_to_rgb(&accum_crisp);
            
            // Create and apply post-effect chain
            let post_chain = create_post_effect_chain(
                bloom_mode,
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
                dog_config,
                hdr_mode,
                perceptual_blur_enabled,
                perceptual_blur_config,
            );
            
            let final_frame_pixels = post_chain.process(
                rgb_buffer,
                width as usize,
                height as usize,
            ).expect("Post-effect chain failed");

            // 3. Collect Histogram Data (Premultiplied)
            // Reserve approximate space to reduce reallocations
            all_r.reserve(npix);
            all_g.reserve(npix);
            all_b.reserve(npix);

            for &(r, g, b, a) in &final_frame_pixels {
                // Composite over black implicitly (premultiplying by alpha)
                let dr = r * a;
                let dg = g * a;
                let db = b * a;
                // Add all pixels' contributions to histogram
                all_r.push(dr);
                all_g.push(dg);
                all_b.push(db);
            }
        }
    }
    println!("   pass 1 (histogram): 100% done"); // Final message
}

/// compute black/white/gamma from histogram
pub fn compute_black_white_gamma(
    all_r: &mut [f64],
    all_g: &mut [f64],
    all_b: &mut [f64],
    clip_black: f64,
    clip_white: f64,
) -> (f64, f64, f64, f64, f64, f64) {
    all_r.sort_by(|a, b| a.partial_cmp(b).unwrap());
    all_g.sort_by(|a, b| a.partial_cmp(b).unwrap());
    all_b.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let total_pix = all_r.len();
    if total_pix == 0 {
        return (0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
    }

    let black_idx = ((clip_black * total_pix as f64).round() as isize)
        .clamp(0, (total_pix - 1) as isize) as usize;
    let white_idx = ((clip_white * total_pix as f64).round() as isize)
        .clamp(0, (total_pix - 1) as isize) as usize;

    (
        all_r[black_idx],
        all_r[white_idx],
        all_g[black_idx],
        all_g[white_idx],
        all_b[black_idx],
        all_b[white_idx],
    )
}

/// Calculate the average density of a frame based on accumulated alpha values
fn calculate_frame_density(accum: &[(f64, f64, f64, f64)]) -> f64 {
    let total_alpha: f64 = accum.par_iter().map(|(_, _, _, a)| a).sum();
    let num_pixels = accum.len() as f64;
    // Return average alpha per pixel as density metric
    total_alpha / num_pixels
}

/// Pass 2: final frames => color mapping => write frames
#[allow(dead_code)]
pub fn pass_2_write_frames(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
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
    mut frame_sink: impl FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
) -> Result<(), Box<dyn Error>> {
    let npix = (width as usize) * (height as usize);
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    // Get initial alpha compression value from CLI
    let base_alpha_compress = get_alpha_compress();

    // Use bounding_box (with padding)
    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = (max_x - min_x).max(1e-12);
        let hh = (max_y - min_y).max(1e-12);
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    // Calculate ranges for level adjustment
    let range_r = (white_r - black_r).max(1e-14);
    let range_g = (white_g - black_g).max(1e-14);
    let range_b = (white_b - black_b).max(1e-14);

    // Iterate through ALL steps
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let _pct = (step as f64 / total_steps as f64) * 100.0;
            // println!("   pass 2 (render): {:.0}% done", _pct);
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

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

        // Accumulate crisp lines
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, x0, y0, x1, y1, c0, c1, a0, a1);
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, x1, y1, x2, y2, c1, c2, a1, a2);
        draw_line_segment_aa_alpha(&mut accum_crisp, width, height, x2, y2, x0, y0, c2, c0, a2, a0);

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

            // Update global alpha compression for this frame
            set_alpha_compress(adaptive_compress);

            // Convert from OKLab to RGB
            let rgb_buffer = convert_accum_buffer_to_rgb(&accum_crisp);
            
            // Create and apply post-effect chain
            let post_chain = create_post_effect_chain(
                bloom_mode,
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
                dog_config,
                hdr_mode,
                perceptual_blur_enabled,
                perceptual_blur_config,
            );
            
            let final_frame_pixels = post_chain.process(
                rgb_buffer,
                width as usize,
                height as usize,
            )?;

            // 3. Apply Levels & Convert to 8-bit
            let mut buf_8bit = vec![0u8; npix * 3];
            buf_8bit.par_chunks_mut(3).zip(final_frame_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    // Premultiply by alpha (composite over black)
                    let mut rr = fr * fa;
                    let mut gg = fg * fa;
                    let mut bb = fb * fa;

                    // Apply levels (black/white points)
                    rr = (rr - black_r) / range_r;
                    gg = (gg - black_g) / range_g;
                    bb = (bb - black_b) / range_b;

                    // Apply ACES Filmic Tonemapping
                    rr = aces_film(rr);
                    gg = aces_film(gg);
                    bb = aces_film(bb);

                    // Scale to 0-255 and clamp (final output clamp)
                    chunk[0] = (rr * 255.0).round().clamp(0.0, 255.0) as u8;
                    chunk[1] = (gg * 255.0).round().clamp(0.0, 255.0) as u8;
                    chunk[2] = (bb * 255.0).round().clamp(0.0, 255.0) as u8;
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
    println!("   pass 2 (render): 100% done");
    Ok(())
}

// ACES Filmic Tonemapping Curve (approximation)
// Source: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
const A: f64 = 2.51;
const B: f64 = 0.03;
const C: f64 = 2.43;
const D: f64 = 0.59;
const E: f64 = 0.14;

fn aces_film(x: f64) -> f64 {
    // Clamp negative values before applying curve
    let x = x.max(0.0);
    // Apply ACES curve formula
    (x * (A * x + B)) / (x * (C * x + D) + E)
}



/// Generate color gradient optimized for OKLab space
/// 
/// This generates colors in OKLCh (cylindrical OKLab) space for more
/// perceptually uniform color distribution.
pub fn generate_color_gradient_oklab(
    rng: &mut sim::Sha3RandomByteStream,
    length: usize,
    body_index: usize,
    base_hue_offset: f64,
) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    
    // Start with a random hue
    let mut hue = rng.next_f64() * 360.0;
    hue += body_index as f64 * 120.0; // Spread bodies evenly
    
    // OKLab-optimized parameters
    let base_chroma = 0.12;  // OKLab chroma is typically 0-0.3
    let chroma_range = 0.08;
    let base_lightness = 0.65;
    let lightness_range = 0.25;
    
    for step in 0..length {
        // Time-based hue drift
        let time_drift = if step > 0 {
            base_hue_offset * (1.0 + (step as f64).ln()).min(360.0)
        } else {
            0.0
        };
        
        let mut current_hue = (hue + time_drift).rem_euclid(360.0);
        
        // Slight random variation
        if rng.next_byte() & 1 == 0 {
            current_hue += 0.1;
        } else {
            current_hue -= 0.1;
        }
        current_hue = current_hue.rem_euclid(360.0);
        
        // Generate in LCh space
        let chroma = base_chroma + rng.next_f64() * chroma_range;
        let lightness = base_lightness + rng.next_f64() * lightness_range;
        
        // Convert LCh to Lab
        let hue_rad = current_hue.to_radians();
        let a = chroma * hue_rad.cos();
        let b = chroma * hue_rad.sin();
        
        // Convert OKLab to RGB
        let (r_linear, g_linear, b_linear) = oklab::oklab_to_linear_srgb(lightness, a, b);
        
        // Apply gamut mapping
        let (r_mapped, g_mapped, b_mapped) = 
            oklab::GamutMapMode::PreserveHue.map_to_gamut(r_linear, g_linear, b_linear);
        
        // Convert to sRGB and quantize
        // Note: We're using linear->sRGB approximation here
        let r_srgb = if r_mapped <= 0.0031308 {
            12.92 * r_mapped
        } else {
            1.055 * r_mapped.powf(1.0 / 2.4) - 0.055
        };
        let g_srgb = if g_mapped <= 0.0031308 {
            12.92 * g_mapped
        } else {
            1.055 * g_mapped.powf(1.0 / 2.4) - 0.055
        };
        let b_srgb = if b_mapped <= 0.0031308 {
            12.92 * b_mapped
        } else {
            1.055 * b_mapped.powf(1.0 / 2.4) - 0.055
        };
        
        colors.push(Rgb([
            (r_srgb * 255.0).round().clamp(0.0, 255.0) as u8,
            (g_srgb * 255.0).round().clamp(0.0, 255.0) as u8,
            (b_srgb * 255.0).round().clamp(0.0, 255.0) as u8,
        ]));
    }
    
    colors
}

/// Generate 3 color sequences + alpha
pub fn generate_body_color_sequences(
    rng: &mut sim::Sha3RandomByteStream,
    length: usize,
    alpha_value: f64,
) -> (Vec<Vec<Rgb<u8>>>, Vec<f64>) {
    // Base hue offset for time-based drift (in degrees per log-time unit)
    let base_hue_offset = 0.5; // Subtle drift over time

    // Use OKLab-optimized color generation
    let (b1, b2, b3) = (
        generate_color_gradient_oklab(rng, length, 0, base_hue_offset),
        generate_color_gradient_oklab(rng, length, 1, base_hue_offset),
        generate_color_gradient_oklab(rng, length, 2, base_hue_offset),
    );
    
    println!("   => Setting all body alphas to 1/{alpha_value:.0} = {alpha_value:.3e}");
    (vec![b1, b2, b3], vec![alpha_value; 3])
}

/// Parallel 2D blur (premultiplied RGBA in f64)
pub fn parallel_blur_2d_rgba(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    radius: usize,
) {
    if radius == 0 {
        return;
    }
    let kernel = build_gaussian_kernel(radius);
    let k_len = kernel.len();
    let mut temp = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    temp.par_chunks_mut(width).zip(buffer.par_chunks(width)).for_each(|(trow, brow)| {
        for x in 0..width {
            let mut sum = [0.0; 4];
            for k in 0..k_len {
                let dx = (x as isize + (k as isize - radius as isize)).clamp(0, width as isize - 1)
                    as usize;
                let (r, g, b, a) = brow[dx];
                let w = kernel[k];
                sum[0] += r * w;
                sum[1] += g * w;
                sum[2] += b * w;
                sum[3] += a * w;
            }
            trow[x] = (sum[0], sum[1], sum[2], sum[3]);
        }
    });
    buffer.par_chunks_mut(width).enumerate().for_each(|(y, brow)| {
        for x in 0..width {
            let mut sum = [0.0; 4];
            for k in 0..k_len {
                let yy = (y as isize + (k as isize - radius as isize)).clamp(0, height as isize - 1)
                    as usize;
                let (r, g, b, a) = temp[yy * width + x];
                let w = kernel[k];
                sum[0] += r * w;
                sum[1] += g * w;
                sum[2] += b * w;
                sum[3] += a * w;
            }
            brow[x] = (sum[0], sum[1], sum[2], sum[3]);
        }
    });
}

/// Helper functions for Xiaolin Wu algorithm
#[inline]
fn ipart(x: f32) -> i32 {
    x.floor() as i32
}

#[inline]
fn fpart(x: f32) -> f32 {
    x.fract()
}

#[inline]
fn rfpart(x: f32) -> f32 {
    1.0 - x.fract()
}

// Function to plot a pixel with alpha blending
#[inline]
#[allow(dead_code)]
fn plot(
    accum: &mut [(f64, f64, f64, f64)],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    alpha: f32, // alpha here is the anti-aliasing coverage (0..1)
    color_r: f64,
    color_g: f64,
    color_b: f64,
    base_alpha: f64, // base_alpha is the line segment's alpha
) {
    if x >= 0 && x < width as i32 && y >= 0 && y < height as i32 {
        let idx = (y as usize * width as usize) + x as usize;

        // Calculate effective alpha for the source (line segment + AA coverage)
        let hdr_scale = get_hdr_scale();
        let src_alpha = (alpha as f64 * base_alpha * hdr_scale).clamp(0.0, f64::MAX);

        // Convert source color to OKLab
        let (src_l, src_a, src_b) = oklab::linear_srgb_to_oklab(color_r, color_g, color_b);
        
        // Get destination values (already in OKLab space)
        let (dst_l, dst_a, dst_b, dst_alpha) = accum[idx];
        
        // Composite in OKLab space
        let (out_l, out_a, out_b, out_alpha) = oklab::oklab_over_composite(
            src_l, src_a, src_b, src_alpha,
            dst_l, dst_a, dst_b, dst_alpha,
        );
        
        // Update accumulator with new premultiplied OKLab values
        accum[idx] = (out_l, out_a, out_b, out_alpha);
    }
}

/// Line drawing with Xiaolin Wu anti-aliasing and alpha compositing (additive)
// Replaces draw_line_segment_crisp_alpha
#[allow(dead_code)]
pub fn draw_line_segment_aa_alpha(
    accum: &mut [(f64, f64, f64, f64)],
    width: u32,
    height: u32,
    mut x0: f32,
    mut y0: f32,
    mut x1: f32,
    mut y1: f32,
    col0: Rgb<u8>,
    col1: Rgb<u8>,
    alpha0: f64,
    alpha1: f64,
) {
    // Convert colors to f64 (0.0-1.0)
    let r0 = col0[0] as f64 / 255.0;
    let g0 = col0[1] as f64 / 255.0;
    let b0 = col0[2] as f64 / 255.0;
    let r1 = col1[0] as f64 / 255.0;
    let g1 = col1[1] as f64 / 255.0;
    let b1 = col1[2] as f64 / 255.0;

    let steep = (y1 - y0).abs() > (x1 - x0).abs();

    if steep {
        std::mem::swap(&mut x0, &mut y0);
        std::mem::swap(&mut x1, &mut y1);
    }
    if x0 > x1 {
        std::mem::swap(&mut x0, &mut x1);
        std::mem::swap(&mut y0, &mut y1);
        // Interpolation based on original order is handled by 't' calculation
    }

    let dx = x1 - x0;
    let dy = y1 - y0;
    // Avoid division by zero for vertical lines; gradient is not used in plot for vertical
    let gradient = if dx.abs() < 1e-9 { 0.0 } else { dy / dx };

    // Handle first endpoint
    let xend0 = x0.round(); // Use round for consistency with Wu's algorithm endpoint handling
    let yend0 = y0 + gradient * (xend0 - x0);
    let xgap0 = rfpart(x0 + 0.5); // Wu uses x + 0.5 for gap calc
    let px0 = xend0 as i32;
    let py0 = ipart(yend0);

    if steep {
        // Original coord system: (py0, px0) and (py0 + 1, px0)
        plot(accum, width, height, py0, px0, rfpart(yend0) * xgap0, r0, g0, b0, alpha0);
        plot(accum, width, height, py0 + 1, px0, fpart(yend0) * xgap0, r0, g0, b0, alpha0);
    } else {
        // Original coord system: (px0, py0) and (px0, py0 + 1)
        plot(accum, width, height, px0, py0, rfpart(yend0) * xgap0, r0, g0, b0, alpha0);
        plot(accum, width, height, px0, py0 + 1, fpart(yend0) * xgap0, r0, g0, b0, alpha0);
    }
    let mut intery = yend0 + gradient; // First y-intersection for the main loop

    // Handle second endpoint
    let xend1 = x1.round();
    let yend1 = y1 + gradient * (xend1 - x1);
    let xgap1 = fpart(x1 + 0.5); // Wu uses x + 0.5 for gap calc
    let px1 = xend1 as i32;
    let py1 = ipart(yend1);

    if steep {
        // Original coord system: (py1, px1) and (py1 + 1, px1)
        plot(accum, width, height, py1, px1, rfpart(yend1) * xgap1, r1, g1, b1, alpha1);
        plot(accum, width, height, py1 + 1, px1, fpart(yend1) * xgap1, r1, g1, b1, alpha1);
    } else {
        // Original coord system: (px1, py1) and (px1, py1 + 1)
        plot(accum, width, height, px1, py1, rfpart(yend1) * xgap1, r1, g1, b1, alpha1);
        plot(accum, width, height, px1, py1 + 1, fpart(yend1) * xgap1, r1, g1, b1, alpha1);
    }

    // Main loop: iterate between endpoints px0 and px1
    if steep {
        for x in (px0 + 1)..px1 {
            let t = (x as f32 - x0) / dx.max(1e-9); // Interpolation factor (0..1)
            let interp_r = lerp(r0, r1, t);
            let interp_g = lerp(g0, g1, t);
            let interp_b = lerp(b0, b1, t);
            let interp_alpha = lerp(alpha0, alpha1, t);
            // Original coord system: (ipart(intery), x) and (ipart(intery) + 1, x)
            plot(
                accum,
                width,
                height,
                ipart(intery),
                x,
                rfpart(intery),
                interp_r,
                interp_g,
                interp_b,
                interp_alpha,
            );
            plot(
                accum,
                width,
                height,
                ipart(intery) + 1,
                x,
                fpart(intery),
                interp_r,
                interp_g,
                interp_b,
                interp_alpha,
            );
            intery += gradient;
        }
    } else {
        for x in (px0 + 1)..px1 {
            let t = (x as f32 - x0) / dx.max(1e-9); // Interpolation factor (0..1)
            let interp_r = lerp(r0, r1, t);
            let interp_g = lerp(g0, g1, t);
            let interp_b = lerp(b0, b1, t);
            let interp_alpha = lerp(alpha0, alpha1, t);
            // Original coord system: (x, ipart(intery)) and (x, ipart(intery) + 1)
            plot(
                accum,
                width,
                height,
                x,
                ipart(intery),
                rfpart(intery),
                interp_r,
                interp_g,
                interp_b,
                interp_alpha,
            );
            plot(
                accum,
                width,
                height,
                x,
                ipart(intery) + 1,
                fpart(intery),
                interp_r,
                interp_g,
                interp_b,
                interp_alpha,
            );
            intery += gradient;
        }
    }
}

/// Create H.264 video in a single pass using FFmpeg
pub fn create_video_from_frames_singlepass(
    width: u32,
    height: u32,
    frame_rate: u32,
    mut frames_iter: impl FnMut(&mut dyn Write) -> Result<(), Box<dyn Error>>,
    output_file: &str,
) -> Result<(), Box<dyn Error>> {
    let mut cmd = std::process::Command::new("ffmpeg");
    let mut child = cmd
        .args(&[
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            &format!("{}x{}", width, height),
            "-r",
            &frame_rate.to_string(),
            "-i",
            "-",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            output_file,
        ])
        .stdin(std::process::Stdio::piped())
        .spawn()?;
    if let Some(stdin) = child.stdin.as_mut() {
        frames_iter(stdin)?;
    }
    let status = child.wait()?;
    if !status.success() {
        return Err("ffmpeg failed".into());
    }
    println!("   Saved video => {output_file}");
    Ok(())
}

// Lerp function for f64
#[inline]
fn lerp(a: f64, b: f64, t: f32) -> f64 {
    a + (b - a) * (t as f64)
}

// ====================== SPECTRAL DRAWING =============================
/// Plot a pixel into a spectral accumulator (SPD) with antialias coverage.
#[inline]
fn plot_spec(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    coverage: f32,    // AA coverage 0..1
    bin_left: usize,  // first wavelength bin
    bin_right: usize, // second bin (may equal left)
    w_right: f64,     // weight for right bin (0..1)
    base_alpha: f64,  // base opacity for the line segment
) {
    // Helper to deposit energy with prismatic sub-pixel shift
    #[inline]
    fn deposit(
        accum: &mut [[f64; NUM_BINS]],
        width: u32,
        height: u32,
        xi: i32,
        yi: i32,
        energy: f64,
        bin: usize,
    ) {
        if energy == 0.0 {
            return;
        }
        let (sx, sy) = BIN_SHIFT[bin];
        let xf = xi as f32 + 0.5 + sx;
        let yf = yi as f32 + 0.5 + sy;
        let x0 = xf.floor();
        let y0 = yf.floor();
        let wx = xf - x0;
        let wy = yf - y0;

        let x0i = x0 as i32;
        let y0i = y0 as i32;
        let contrib = [
            (x0i, y0i, (1.0 - wx) * (1.0 - wy)),
            (x0i + 1, y0i, wx * (1.0 - wy)),
            (x0i, y0i + 1, (1.0 - wx) * wy),
            (x0i + 1, y0i + 1, wx * wy),
        ];

        for &(cx, cy, w) in &contrib {
            if w == 0.0 {
                continue;
            }
            if cx < 0 || cy < 0 || cx >= width as i32 || cy >= height as i32 {
                continue;
            }
            let idx = (cy as usize) * (width as usize) + (cx as usize);
            accum[idx][bin] += energy * (w as f64);
        }
    }

    // Use HDR scale instead of compression
    let hdr_scale = get_hdr_scale();
    let energy = (coverage as f64 * base_alpha * hdr_scale).clamp(0.0, f64::MAX);

    let left_energy = energy * (1.0 - w_right);
    let right_energy = energy * w_right;

    deposit(accum, width, height, x, y, left_energy, bin_left);
    deposit(accum, width, height, x, y, right_energy, bin_right);
}

/// Draw anti-aliased line segment into spectral accumulator.
pub fn draw_line_segment_aa_spectral(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    mut x0: f32,
    mut y0: f32,
    mut x1: f32,
    mut y1: f32,
    col0: Rgb<u8>,
    col1: Rgb<u8>,
    alpha0: f64,
    alpha1: f64,
) {
    let bin0 = rgb_to_bin(&col0);
    let bin1 = rgb_to_bin(&col1);

    let steep = (y1 - y0).abs() > (x1 - x0).abs();
    if steep {
        std::mem::swap(&mut x0, &mut y0);
        std::mem::swap(&mut x1, &mut y1);
    }
    if x0 > x1 {
        std::mem::swap(&mut x0, &mut x1);
        std::mem::swap(&mut y0, &mut y1);
    }

    let dx = x1 - x0;
    let dy = y1 - y0;
    let gradient = if dx.abs() < 1e-9 { 0.0 } else { dy / dx };

    // first endpoint
    let xend0 = x0.round();
    let yend0 = y0 + gradient * (xend0 - x0);
    let xgap0 = rfpart(x0 + 0.5);
    let px0 = xend0 as i32;
    let py0 = ipart(yend0);

    if steep {
        plot_spec(accum, width, height, py0, px0, rfpart(yend0) * xgap0, bin0, bin0, 0.0, alpha0);
        plot_spec(
            accum,
            width,
            height,
            py0 + 1,
            px0,
            fpart(yend0) * xgap0,
            bin0,
            bin0,
            0.0,
            alpha0,
        );
    } else {
        plot_spec(accum, width, height, px0, py0, rfpart(yend0) * xgap0, bin0, bin0, 0.0, alpha0);
        plot_spec(
            accum,
            width,
            height,
            px0,
            py0 + 1,
            fpart(yend0) * xgap0,
            bin0,
            bin0,
            0.0,
            alpha0,
        );
    }
    let mut intery = yend0 + gradient;

    // second endpoint
    let xend1 = x1.round();
    let yend1 = y1 + gradient * (xend1 - x1);
    let xgap1 = fpart(x1 + 0.5);
    let px1 = xend1 as i32;
    let py1 = ipart(yend1);

    if steep {
        plot_spec(accum, width, height, py1, px1, rfpart(yend1) * xgap1, bin1, bin1, 0.0, alpha1);
        plot_spec(
            accum,
            width,
            height,
            py1 + 1,
            px1,
            fpart(yend1) * xgap1,
            bin1,
            bin1,
            0.0,
            alpha1,
        );
    } else {
        plot_spec(accum, width, height, px1, py1, rfpart(yend1) * xgap1, bin1, bin1, 0.0, alpha1);
        plot_spec(
            accum,
            width,
            height,
            px1,
            py1 + 1,
            fpart(yend1) * xgap1,
            bin1,
            bin1,
            0.0,
            alpha1,
        );
    }

    // main loop
    if steep {
        for x in (px0 + 1)..px1 {
            let t = (x as f32 - x0) / dx.max(1e-9);
            let alpha_t = lerp(alpha0, alpha1, t);
            let binf = (bin0 as f64) * (1.0 - t as f64) + (bin1 as f64) * t as f64;
            let bin_left = binf.floor().clamp(0.0, (NUM_BINS - 1) as f64) as usize;
            let bin_right = binf.ceil().clamp(0.0, (NUM_BINS - 1) as f64) as usize;
            let w_right = binf - bin_left as f64;
            plot_spec(
                accum,
                width,
                height,
                ipart(intery),
                x,
                rfpart(intery),
                bin_left,
                bin_right,
                w_right,
                alpha_t,
            );
            plot_spec(
                accum,
                width,
                height,
                ipart(intery) + 1,
                x,
                fpart(intery),
                bin_left,
                bin_right,
                w_right,
                alpha_t,
            );
            intery += gradient;
        }
    } else {
        for x in (px0 + 1)..px1 {
            let t = (x as f32 - x0) / dx.max(1e-9);
            let alpha_t = lerp(alpha0, alpha1, t);
            let binf = (bin0 as f64) * (1.0 - t as f64) + (bin1 as f64) * t as f64;
            let bin_left = binf.floor().clamp(0.0, (NUM_BINS - 1) as f64) as usize;
            let bin_right = binf.ceil().clamp(0.0, (NUM_BINS - 1) as f64) as usize;
            let w_right = binf - bin_left as f64;
            plot_spec(
                accum,
                width,
                height,
                x,
                ipart(intery),
                rfpart(intery),
                bin_left,
                bin_right,
                w_right,
                alpha_t,
            );
            plot_spec(
                accum,
                width,
                height,
                x,
                ipart(intery) + 1,
                fpart(intery),
                bin_left,
                bin_right,
                w_right,
                alpha_t,
            );
            intery += gradient;
        }
    }
}

// ====================== SPD -> RGBA CONVERSION ======================
/// Convert whole SPD buffer into RGBA buffer (premultiplied linear sRGB).
fn convert_spd_buffer_to_rgba(src: &[[f64; NUM_BINS]], dest: &mut [(f64, f64, f64, f64)]) {
    dest.par_iter_mut().zip(src.par_iter()).for_each(|(out, spd)| {
        *out = spd_to_rgba(spd);
    });
}

// ====================== COLOR SPACE CONVERSION ======================
/// Convert accumulation buffer from OKLab to RGB.
/// 
/// The accumulation buffer stores (L,a,b,A) values in OKLab space.
/// This function converts them back to (R,G,B,A) for post-processing.
/// 
/// # Arguments
/// * `buffer` - The accumulation buffer in OKLab space
/// 
/// # Returns
/// * A buffer in RGB space
fn convert_accum_buffer_to_rgb(
    buffer: &[(f64, f64, f64, f64)],
) -> Vec<(f64, f64, f64, f64)> {
    // Parallel conversion with gamut mapping
    buffer.par_iter()
        .map(|&(l, a, b, alpha)| {
            if alpha > 0.0 {
                // Unpremultiply OKLab values
                let l_straight = l / alpha;
                let a_straight = a / alpha;
                let b_straight = b / alpha;
                
                // Convert to RGB
                let (r, g, b_rgb) = oklab::oklab_to_linear_srgb(l_straight, a_straight, b_straight);
                
                // Apply gamut mapping
                let (r_mapped, g_mapped, b_mapped) = 
                    oklab::GamutMapMode::PreserveHue.map_to_gamut(r, g, b_rgb);
                
                // Re-premultiply
                (r_mapped * alpha, g_mapped * alpha, b_mapped * alpha, alpha)
            } else {
                (0.0, 0.0, 0.0, 0.0)
            }
        })
        .collect()
}

// ====================== PASS 1 (SPECTRAL) ===========================
/// Pass 1: gather global histogram for final color leveling (spectral)
pub fn pass_1_build_histogram_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
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
) {
    let npix = (width as usize) * (height as usize);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; npix];

    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = (max_x - min_x).max(1e-12);
        let hh = (max_y - min_y).max(1e-12);
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    for step in 0..total_steps {
        if step % chunk_line == 0 {}
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let c0 = colors[0][step];
        let c1 = colors[1][step];
        let c2 = colors[2][step];

        let a0 = body_alphas[0];
        let a1 = body_alphas[1];
        let a2 = body_alphas[2];

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

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
        );

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // convert SPD -> RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            // Note: Spectral rendering always produces RGB, no conversion needed
            // Create and apply post-effect chain
            let post_chain = create_post_effect_chain(
                bloom_mode,
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
                dog_config,
                hdr_mode,
                perceptual_blur_enabled,
                perceptual_blur_config,
            );
            
            let final_frame_pixels = post_chain.process(
                accum_rgba.clone(),
                width as usize,
                height as usize,
            ).expect("Post-effect chain failed");

            // collect histogram
            all_r.reserve(npix);
            all_g.reserve(npix);
            all_b.reserve(npix);
            for &(r, g, b, a) in &final_frame_pixels {
                let dr = r * a;
                let dg = g * a;
                let db = b * a;
                all_r.push(dr);
                all_g.push(dg);
                all_b.push(db);
            }
        }
    }
    println!("   pass 1 (spectral histogram): 100% done");
}

// ====================== PASS 2 (SPECTRAL) ===========================
/// Pass 2: final frames => color mapping => write frames (spectral)
pub fn pass_2_write_frames_spectral(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
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
    mut frame_sink: impl FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
) -> Result<(), Box<dyn Error>> {
    let npix = (width as usize) * (height as usize);
    let mut accum_spd = vec![[0.0f64; NUM_BINS]; npix];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = (max_x - min_x).max(1e-12);
        let hh = (max_y - min_y).max(1e-12);
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    let range_r = (white_r - black_r).max(1e-14);
    let range_g = (white_g - black_g).max(1e-14);
    let range_b = (white_b - black_b).max(1e-14);

    for step in 0..total_steps {
        if step % chunk_line == 0 {}
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let c0 = colors[0][step];
        let c1 = colors[1][step];
        let c2 = colors[2][step];

        let a0 = body_alphas[0];
        let a1 = body_alphas[1];
        let a2 = body_alphas[2];

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

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
        );

        let is_final = step == total_steps - 1;
        if (step > 0 && step % frame_interval == 0) || is_final {
            // Convert SPD -> RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);

            // Note: Spectral rendering always produces RGB, no conversion needed
            // Create and apply post-effect chain
            let post_chain = create_post_effect_chain(
                bloom_mode,
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
                dog_config,
                hdr_mode,
                perceptual_blur_enabled,
                perceptual_blur_config,
            );
            
            let final_frame_pixels = post_chain.process(
                accum_rgba.clone(),
                width as usize,
                height as usize,
            )?;

            // levels + ACES tonemapping
            let mut buf_8bit = vec![0u8; npix * 3];
            buf_8bit.par_chunks_mut(3).zip(final_frame_pixels.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {

                    let mut rr = fr * fa;
                    let mut gg = fg * fa;
                    let mut bb = fb * fa;
                    rr = (rr - black_r) / range_r;
                    gg = (gg - black_g) / range_g;
                    bb = (bb - black_b) / range_b;
                    rr = aces_film(rr);
                    gg = aces_film(gg);
                    bb = aces_film(bb);
                    chunk[0] = (rr * 255.0).round().clamp(0.0, 255.0) as u8;
                    chunk[1] = (gg * 255.0).round().clamp(0.0, 255.0) as u8;
                    chunk[2] = (bb * 255.0).round().clamp(0.0, 255.0) as u8;
                },
            );

            frame_sink(&buf_8bit)?;
            if is_final {
                *last_frame_out = ImageBuffer::from_raw(width, height, buf_8bit);
            }
        }
    }
    println!("   pass 2 (spectral render): 100% done");
    Ok(())
}

/// Creates a post-effect chain based on render parameters.
/// 
/// Effects are applied in order:
/// 1. Auto-exposure (if enabled)
/// 2. Bloom (Gaussian or DoG)
/// 3. Perceptual blur (if enabled) 
/// 
/// Note: Tonemapping is handled separately during 8-bit conversion
/// to maintain compatibility with the levels adjustment workflow.
/// The levels adjustment (black/white points) must be applied in linear space
/// before tonemapping for correct results.
pub fn create_post_effect_chain(
    bloom_mode: &str,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    dog_config: &DogBloomConfig,
    hdr_mode: &str,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<&PerceptualBlurConfig>,
) -> PostEffectChain {
    let mut chain = PostEffectChain::new();
    
    // 1. Auto-exposure (if enabled)
    if hdr_mode == "auto" {
        chain.add(Box::new(AutoExposure::new()));
    }
    
    // 2. Bloom effect
    match bloom_mode {
        "dog" => {
            chain.add(Box::new(DogBloom::new(
                dog_config.clone(),
                blur_core_brightness,
            )));
        }
        _ => {
            // Default to Gaussian bloom
            chain.add(Box::new(GaussianBloom::new(
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
            )));
        }
    }
    
    // 3. Perceptual blur (if enabled)
    if perceptual_blur_enabled {
        let config = perceptual_blur_config.cloned().unwrap_or_else(|| {
            PerceptualBlurConfig {
                radius: blur_radius_px,
                strength: 0.5,
                gamut_mode: crate::oklab::GamutMapMode::PreserveHue,
            }
        });
        chain.add(Box::new(PerceptualBlur::new(config)));
    }
    
    chain
}
