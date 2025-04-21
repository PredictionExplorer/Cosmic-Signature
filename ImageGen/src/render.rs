//! Rendering module: histogram passes, color mapping, line drawing, and output

use std::error::Error;
use std::io::Write;
use image::{DynamicImage, ImageBuffer, Rgb};
use nalgebra::Vector3;
use rayon::prelude::*;
// Assuming bounding_box includes padding like in the example
use crate::utils::{build_gaussian_kernel, bounding_box}; // Changed bounding_box_2d to bounding_box
use palette::{FromColor, Hsl, Srgb};
use crate::sim;

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
            // 1. Blur (if enabled)
            let mut temp_blur = accum_crisp.clone(); // Start with crisp data
            if blur_radius_px > 0 {
                parallel_blur_2d_rgba(&mut temp_blur, width as usize, height as usize, blur_radius_px);
            }

            // 2. Composite Crisp + Blur
            let mut final_frame_pixels = vec![(0.0, 0.0, 0.0, 0.0); npix];
            final_frame_pixels.par_iter_mut().enumerate().for_each(|(i, pix)| {
                let (cr, cg, cb, ca) = accum_crisp[i];
                let (br, bg, bb, ba) = temp_blur[i]; // Use the potentially blurred buffer
                // Blend crisp and blurred components
                let out_r = cr * blur_core_brightness + br * blur_strength;
                let out_g = cg * blur_core_brightness + bg * blur_strength;
                let out_b = cb * blur_core_brightness + bb * blur_strength;
                let out_a = ca * blur_core_brightness + ba * blur_strength; // Combine alphas too?
                *pix = (out_r, out_g, out_b, out_a);
            });

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

    (all_r[black_idx], all_r[white_idx], all_g[black_idx], all_g[white_idx], all_b[black_idx], all_b[white_idx])
}

/// Pass 2: final frames => color mapping => write frames
pub fn pass_2_write_frames(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,         // Added blur strength for compositing
    blur_core_brightness: f64, // Added core brightness for compositing
    frame_interval: usize,
    black_r: f64,
    white_r: f64,
    black_g: f64,
    white_g: f64,
    black_b: f64,
    white_b: f64,
    mut frame_sink: impl FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
) -> Result<(), Box<dyn Error>> {
    let npix = (width as usize) * (height as usize);
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

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
        let p0 = positions[0][step]; let p1 = positions[1][step]; let p2 = positions[2][step];
        let c0 = colors[0][step]; let c1 = colors[1][step]; let c2 = colors[2][step];
        let a0 = body_alphas[0]; let a1 = body_alphas[1]; let a2 = body_alphas[2];

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
            // 1. Blur (if enabled)
            let mut temp_blur = accum_crisp.clone();
            if blur_radius_px > 0 {
                parallel_blur_2d_rgba(&mut temp_blur, width as usize, height as usize, blur_radius_px);
            }

            // 2. Composite Crisp + Blur + Bloom
            let mut final_frame_pixels = vec![(0.0, 0.0, 0.0, 0.0); npix];
            final_frame_pixels.par_iter_mut().enumerate().for_each(|(i, pix)| {
                let (cr, cg, cb, ca) = accum_crisp[i];
                let (br, bg, bb, ba) = temp_blur[i];
                // base composite
                let base_r = cr * blur_core_brightness;
                let base_g = cg * blur_core_brightness;
                let base_b = cb * blur_core_brightness;
                let base_a = ca * blur_core_brightness;
                // bloom from blur pass
                let bloom_r = br * blur_strength;
                let bloom_g = bg * blur_strength;
                let bloom_b = bb * blur_strength;
                let bloom_a = ba * blur_strength;
                // Screen Blend Approximation: C = A + B - A*B
                let out_r = (base_r + bloom_r - base_r * bloom_r).clamp(0.0, f64::MAX); // Clamp to avoid negative
                let out_g = (base_g + bloom_g - base_g * bloom_g).clamp(0.0, f64::MAX);
                let out_b = (base_b + bloom_b - base_b * bloom_b).clamp(0.0, f64::MAX);
                // carry through alpha
                let out_a = base_a + bloom_a;
                *pix = (out_r, out_g, out_b, out_a);
            });

            // --- Bloom highlight pass ---
            let mut bloom_highlight = vec![(0.0,0.0,0.0,0.0); npix];
            // threshold and extra blur for highlights
            let highlight_radius = blur_radius_px * 2;
            let threshold = 0.3;
            // extract bright regions
            for (idx, &(r, g, b, a)) in final_frame_pixels.iter().enumerate() {
                let lum = (0.299*r + 0.587*g + 0.114*b) * a;
                if lum > threshold {
                    bloom_highlight[idx] = (r, g, b, a);
                }
            }
            // heavy blur on highlights
            if highlight_radius > 0 {
                parallel_blur_2d_rgba(&mut bloom_highlight, width as usize, height as usize, highlight_radius);
            }
            // add back to final + clamp
            final_frame_pixels.par_iter_mut().enumerate().for_each(|(i, pix)| {
                let (r1,g1,b1,a1) = *pix;
                let (r2,g2,b2,_) = bloom_highlight[i];
                // full highlight blend
                let rf = (r1 + r2).min(1.0);
                let gf = (g1 + g2).min(1.0);
                let bf = (b1 + b2).min(1.0);
                let af = a1;
                *pix = (rf, gf, bf, af);
            });

            // 2.5 Exposure boost to brighten dark regions
            let exposure = 1.15; // Increased from 1.0
             final_frame_pixels.par_iter_mut().for_each(|pix| {
                 pix.0 *= exposure;
                 pix.1 *= exposure;
                 pix.2 *= exposure;
             });

            // 3. Apply Levels & Convert to 8-bit
            let mut buf_8bit = vec![0u8; npix * 3];
            buf_8bit
                .par_chunks_mut(3)
                .zip(final_frame_pixels.par_iter())
                .for_each(|(chunk, &(fr, fg, fb, fa))| {
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
                });

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

/// Simple RGB gradient generator
pub fn generate_color_gradient(rng: &mut sim::Sha3RandomByteStream, length: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    let mut hue = rng.next_f64() * 360.0;
    let base_saturation = 0.7;
    let saturation_range = 0.3; // 0.7 to 1.0
    let base_lightness = 0.4;
    let lightness_range = 0.2; // 0.4 to 0.6

    for _ in 0..length {
        // Slightly vary hue
        if rng.next_byte() & 1 == 0 { hue += 0.1; } else { hue -= 0.1; }
        if hue < 0.0 { hue += 360.0; } else if hue >= 360.0 { hue -= 360.0; }

        // Generate random saturation and lightness within ranges
        let saturation = base_saturation + rng.next_f64() * saturation_range;
        let lightness = base_lightness + rng.next_f64() * lightness_range;

        // Create HSL color and convert to SRGB
        let hsl_color = Hsl::new(hue, saturation, lightness);
        let rgb = Srgb::from_color(hsl_color);

        colors.push(Rgb([(rgb.red*255.0) as u8,(rgb.green*255.0) as u8,(rgb.blue*255.0) as u8]));
    }
    colors
}

/// Generate 3 color sequences + alpha
pub fn generate_body_color_sequences(
    rng: &mut sim::Sha3RandomByteStream,
    length: usize,
    alpha_value: f64,
) -> (Vec<Vec<Rgb<u8>>>, Vec<f64>) {
    let b1 = generate_color_gradient(rng, length);
    let b2 = generate_color_gradient(rng, length);
    let b3 = generate_color_gradient(rng, length);
    println!("   => Setting all body alphas to 1/{alpha_value:.0} = {alpha_value:.3e}");
    (vec![b1,b2,b3], vec![alpha_value;3])
}

/// Parallel 2D blur (premultiplied RGBA in f64)
pub fn parallel_blur_2d_rgba(
    buffer: &mut [(f64,f64,f64,f64)],
    width: usize,
    height: usize,
    radius: usize,
) {
    if radius==0 { return; }
    let kernel = build_gaussian_kernel(radius);
    let k_len = kernel.len();
    let mut temp = vec![(0.0,0.0,0.0,0.0); width*height];

    temp.par_chunks_mut(width)
        .zip(buffer.par_chunks(width))
        .for_each(|(trow, brow)| { 
            for x in 0..width { 
                let mut sum = [0.0; 4]; 
                for k in 0..k_len { 
                    let dx = (x as isize + (k as isize - radius as isize)).clamp(0, width as isize - 1) as usize; 
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
    buffer.par_chunks_mut(width)
        .enumerate()
        .for_each(|(y, brow)| { 
            for x in 0..width { 
                let mut sum = [0.0; 4]; 
                for k in 0..k_len { 
                    let yy = (y as isize + (k as isize - radius as isize)).clamp(0, height as isize - 1) as usize; 
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
fn ipart(x: f32) -> i32 { x.floor() as i32 }

#[inline]
fn fpart(x: f32) -> f32 { x.fract() }

#[inline]
fn rfpart(x: f32) -> f32 { 1.0 - x.fract() }

// Function to plot a pixel with alpha blending
#[inline]
fn plot(
    accum: &mut [(f64,f64,f64,f64)], width: u32, height: u32,
    x: i32, y: i32, alpha: f32, // alpha here is the anti-aliasing coverage (0..1)
    color_r: f64, color_g: f64, color_b: f64, base_alpha: f64 // base_alpha is the line segment's alpha
) {
    if x >= 0 && x < width as i32 && y >= 0 && y < height as i32 {
        let idx = (y as usize * width as usize) + x as usize;

        // Calculate effective alpha for the source (line segment + AA coverage)
        let src_alpha = (alpha as f64 * base_alpha).clamp(0.0, 1.0);

        // Get destination values
        let (dst_r, dst_g, dst_b, dst_alpha) = accum[idx];

        // Premultiply source color (assuming input color_r/g/b are straight alpha)
        let src_r_pre = color_r * src_alpha;
        let src_g_pre = color_g * src_alpha;
        let src_b_pre = color_b * src_alpha;

        // Apply "Over" blending formula for color (output is premultiplied)
        let out_r = src_r_pre + dst_r * (1.0 - src_alpha);
        let out_g = src_g_pre + dst_g * (1.0 - src_alpha);
        let out_b = src_b_pre + dst_b * (1.0 - src_alpha);

        // Combine alpha
        let out_alpha = src_alpha + dst_alpha * (1.0 - src_alpha);

        // Update accumulator with new premultiplied RGBA
        accum[idx] = (out_r, out_g, out_b, out_alpha);
    }
}

/// Line drawing with Xiaolin Wu anti-aliasing and alpha compositing (additive)
// Replaces draw_line_segment_crisp_alpha
pub fn draw_line_segment_aa_alpha(
    accum: &mut [(f64,f64,f64,f64)],
    width: u32, height: u32,
    mut x0: f32, mut y0: f32, mut x1: f32, mut y1: f32,
    col0: Rgb<u8>, col1: Rgb<u8>,
    alpha0: f64, alpha1: f64,
) {
    // Convert colors to f64 (0.0-1.0)
    let r0 = col0[0] as f64 / 255.0; let g0 = col0[1] as f64 / 255.0; let b0 = col0[2] as f64 / 255.0;
    let r1 = col1[0] as f64 / 255.0; let g1 = col1[1] as f64 / 255.0; let b1 = col1[2] as f64 / 255.0;

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
            plot(accum, width, height, ipart(intery), x, rfpart(intery), interp_r, interp_g, interp_b, interp_alpha);
            plot(accum, width, height, ipart(intery) + 1, x, fpart(intery), interp_r, interp_g, interp_b, interp_alpha);
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
            plot(accum, width, height, x, ipart(intery), rfpart(intery), interp_r, interp_g, interp_b, interp_alpha);
            plot(accum, width, height, x, ipart(intery) + 1, fpart(intery), interp_r, interp_g, interp_b, interp_alpha);
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
    let mut child = cmd.args(&[
        "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", &format!("{}x{}", width, height),
        "-r", &frame_rate.to_string(),
        "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        output_file,
    ])
    .stdin(std::process::Stdio::piped())
    .spawn()?;
    if let Some(stdin) = child.stdin.as_mut() {
        frames_iter(stdin)?;
    }
    let status = child.wait()?;
    if !status.success() { return Err("ffmpeg failed".into()); }
    println!("   Saved video => {output_file}");
    Ok(())
}

// Lerp function for f64
#[inline]
fn lerp(a: f64, b: f64, t: f32) -> f64 {
    a + (b - a) * (t as f64)
}
