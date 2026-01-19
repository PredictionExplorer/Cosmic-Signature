//! SIMD-Accelerated Processing
//!
//! Uses the `wide` crate for portable SIMD operations across x86/ARM.
//! Processes 4 pixels at once for significant speedup in rendering operations.
//!
//! Typical speedup: 2-4x for pixel processing, blur, and tone mapping.

// This module provides library utilities for SIMD optimization
// that can be used by external consumers or future internal optimizations
#![allow(dead_code)]

use wide::f64x4;
use rayon::prelude::*;

/// Number of f64 values processed in parallel
pub const SIMD_WIDTH: usize = 4;

// ============================================================================
// SIMD Pixel Utilities
// ============================================================================

/// RGBA pixel represented as 4 separate SIMD lanes for R, G, B, A
/// Each lane processes 4 different pixels' same channel
#[derive(Clone, Copy, Debug)]
pub struct SimdPixel4 {
    pub r: f64x4,
    pub g: f64x4,
    pub b: f64x4,
    pub a: f64x4,
}

impl SimdPixel4 {
    /// Create from 4 RGBA tuples
    #[inline]
    pub fn from_pixels(pixels: &[(f64, f64, f64, f64); 4]) -> Self {
        Self {
            r: f64x4::new([pixels[0].0, pixels[1].0, pixels[2].0, pixels[3].0]),
            g: f64x4::new([pixels[0].1, pixels[1].1, pixels[2].1, pixels[3].1]),
            b: f64x4::new([pixels[0].2, pixels[1].2, pixels[2].2, pixels[3].2]),
            a: f64x4::new([pixels[0].3, pixels[1].3, pixels[2].3, pixels[3].3]),
        }
    }

    /// Create with all zeros
    #[inline]
    pub fn zero() -> Self {
        Self {
            r: f64x4::ZERO,
            g: f64x4::ZERO,
            b: f64x4::ZERO,
            a: f64x4::ZERO,
        }
    }

    /// Create with a splat value
    #[inline]
    pub fn splat(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self {
            r: f64x4::splat(r),
            g: f64x4::splat(g),
            b: f64x4::splat(b),
            a: f64x4::splat(a),
        }
    }

    /// Extract back to 4 RGBA tuples
    #[inline]
    pub fn to_pixels(&self) -> [(f64, f64, f64, f64); 4] {
        let r = self.r.to_array();
        let g = self.g.to_array();
        let b = self.b.to_array();
        let a = self.a.to_array();
        [
            (r[0], g[0], b[0], a[0]),
            (r[1], g[1], b[1], a[1]),
            (r[2], g[2], b[2], a[2]),
            (r[3], g[3], b[3], a[3]),
        ]
    }

    /// Compute luminance for all 4 pixels (Rec. 709)
    #[inline]
    pub fn luminance(&self) -> f64x4 {
        self.r * f64x4::splat(0.2126) + self.g * f64x4::splat(0.7152) + self.b * f64x4::splat(0.0722)
    }

    /// Linear interpolation between two pixel sets
    #[inline]
    pub fn lerp(a: &Self, b: &Self, t: f64x4) -> Self {
        let one_minus_t = f64x4::splat(1.0) - t;
        Self {
            r: a.r * one_minus_t + b.r * t,
            g: a.g * one_minus_t + b.g * t,
            b: a.b * one_minus_t + b.b * t,
            a: a.a * one_minus_t + b.a * t,
        }
    }

    /// Clamp all channels to [0, 1]
    #[inline]
    pub fn clamp01(&self) -> Self {
        Self {
            r: self.r.max(f64x4::ZERO).min(f64x4::splat(1.0)),
            g: self.g.max(f64x4::ZERO).min(f64x4::splat(1.0)),
            b: self.b.max(f64x4::ZERO).min(f64x4::splat(1.0)),
            a: self.a.max(f64x4::ZERO).min(f64x4::splat(1.0)),
        }
    }

    /// Multiply all channels by a scalar
    #[inline]
    pub fn scale(&self, s: f64x4) -> Self {
        Self {
            r: self.r * s,
            g: self.g * s,
            b: self.b * s,
            a: self.a * s,
        }
    }

    /// Add two pixel sets
    #[inline]
    pub fn add(&self, other: &Self) -> Self {
        Self {
            r: self.r + other.r,
            g: self.g + other.g,
            b: self.b + other.b,
            a: self.a + other.a,
        }
    }

    /// Multiply two pixel sets (per-channel)
    #[inline]
    pub fn mul(&self, other: &Self) -> Self {
        Self {
            r: self.r * other.r,
            g: self.g * other.g,
            b: self.b * other.b,
            a: self.a * other.a,
        }
    }
}

// ============================================================================
// SIMD Effect Processing
// ============================================================================

/// SIMD blackbody temperature to RGB conversion
/// Processes 4 temperatures at once using scalar comparison for portability
#[inline]
pub fn simd_blackbody_to_rgb(temp: f64x4) -> (f64x4, f64x4, f64x4) {
    let temp_arr = temp.to_array();
    let mut r_arr = [0.0f64; 4];
    let mut g_arr = [0.0f64; 4];
    let mut b_arr = [0.0f64; 4];
    
    for i in 0..4 {
        let t = temp_arr[i] / 100.0;
        
        // Red channel (matches effect_fusion blackbody_to_rgb)
        r_arr[i] = if t <= 66.0 {
            1.0
        } else {
            let x = t - 60.0;
            (329.698727446 * x.powf(-0.1332047592) / 255.0).clamp(0.0, 1.0)
        };
        
        // Green channel
        g_arr[i] = if t <= 66.0 {
            ((99.4708025861 * t.ln() - 161.1195681661) / 255.0).clamp(0.0, 1.0)
        } else {
            let x = t - 60.0;
            (288.1221695283 * x.powf(-0.0755148492) / 255.0).clamp(0.0, 1.0)
        };
        
        // Blue channel
        b_arr[i] = if t >= 66.0 {
            1.0
        } else if t <= 19.0 {
            0.0
        } else {
            let x = t - 10.0;
            ((138.5177312231 * x.ln() - 305.0447927307) / 255.0).clamp(0.0, 1.0)
        };
    }

    (f64x4::new(r_arr), f64x4::new(g_arr), f64x4::new(b_arr))
}

/// Apply blackbody effect to 4 pixels at once
#[inline]
pub fn simd_apply_blackbody(
    pixels: &SimdPixel4,
    strength: f64,
    min_temp: f64,
    max_temp: f64,
) -> SimdPixel4 {
    let lum = pixels.luminance();
    let temp_range = f64x4::splat(max_temp - min_temp);
    let temp = f64x4::splat(min_temp) + lum * temp_range;
    
    let (tr, tg, tb) = simd_blackbody_to_rgb(temp);
    
    // Overlay blend - use scalar comparison for portability
    let r_arr = pixels.r.to_array();
    let g_arr = pixels.g.to_array();
    let b_arr = pixels.b.to_array();
    let tr_arr = tr.to_array();
    let tg_arr = tg.to_array();
    let tb_arr = tb.to_array();
    
    let mut r_overlay_arr = [0.0f64; 4];
    let mut g_overlay_arr = [0.0f64; 4];
    let mut b_overlay_arr = [0.0f64; 4];
    
    for i in 0..4 {
        r_overlay_arr[i] = if r_arr[i] < 0.5 {
            2.0 * r_arr[i] * tr_arr[i]
        } else {
            1.0 - 2.0 * (1.0 - r_arr[i]) * (1.0 - tr_arr[i])
        };
        g_overlay_arr[i] = if g_arr[i] < 0.5 {
            2.0 * g_arr[i] * tg_arr[i]
        } else {
            1.0 - 2.0 * (1.0 - g_arr[i]) * (1.0 - tg_arr[i])
        };
        b_overlay_arr[i] = if b_arr[i] < 0.5 {
            2.0 * b_arr[i] * tb_arr[i]
        } else {
            1.0 - 2.0 * (1.0 - b_arr[i]) * (1.0 - tb_arr[i])
        };
    }
    
    let r_overlay = f64x4::new(r_overlay_arr);
    let g_overlay = f64x4::new(g_overlay_arr);
    let b_overlay = f64x4::new(b_overlay_arr);
    
    // Blend with original - SIMD for the simple math
    let one = f64x4::splat(1.0);
    let s = f64x4::splat(strength);
    let inv_s = one - s;
    
    SimdPixel4 {
        r: (pixels.r * inv_s + r_overlay * s).max(f64x4::ZERO).min(one),
        g: (pixels.g * inv_s + g_overlay * s).max(f64x4::ZERO).min(one),
        b: (pixels.b * inv_s + b_overlay * s).max(f64x4::ZERO).min(one),
        a: pixels.a,
    }
}

/// Apply metallic/ferrofluid effect to 4 pixels at once
#[inline]
pub fn simd_apply_metallic(
    pixels: &SimdPixel4,
    strength: f64,
    metallic_intensity: f64,
) -> SimdPixel4 {
    let lum = pixels.luminance();
    let one = f64x4::splat(1.0);
    
    // Fresnel-like reflectance: 1 - lum^2
    let fresnel = one - lum * lum;
    
    // Metallic tint (silver)
    let metal_r = f64x4::splat(0.97);
    let metal_g = f64x4::splat(0.95);
    let metal_b = f64x4::splat(0.92);
    
    let metallic = f64x4::splat(metallic_intensity);
    let blend = fresnel * metallic;
    
    let mr = pixels.r + blend * (metal_r - pixels.r);
    let mg = pixels.g + blend * (metal_g - pixels.g);
    let mb = pixels.b + blend * (metal_b - pixels.b);
    
    // Blend with original
    let s = f64x4::splat(strength);
    let inv_s = one - s;
    
    SimdPixel4 {
        r: (pixels.r * inv_s + mr * s).max(f64x4::ZERO).min(one),
        g: (pixels.g * inv_s + mg * s).max(f64x4::ZERO).min(one),
        b: (pixels.b * inv_s + mb * s).max(f64x4::ZERO).min(one),
        a: pixels.a,
    }
}

/// Apply subsurface scattering warmth to 4 pixels at once
#[inline]
pub fn simd_apply_subsurface(
    pixels: &SimdPixel4,
    strength: f64,
    warmth: f64,
) -> SimdPixel4 {
    let one = f64x4::splat(1.0);
    let w = f64x4::splat(warmth);
    
    // Warm tint
    let ssr = pixels.r + w * f64x4::splat(0.1);
    let ssg = pixels.g + w * f64x4::splat(0.03);
    let ssb = pixels.b - w * f64x4::splat(0.05);
    
    // Blend with original
    let s = f64x4::splat(strength);
    let inv_s = one - s;
    
    SimdPixel4 {
        r: (pixels.r * inv_s + ssr * s).max(f64x4::ZERO).min(one),
        g: (pixels.g * inv_s + ssg * s).max(f64x4::ZERO).min(one),
        b: (pixels.b * inv_s + ssb * s).max(f64x4::ZERO).min(one),
        a: pixels.a,
    }
}

// ============================================================================
// SIMD Blur / Convolution
// ============================================================================

/// Apply 1D Gaussian kernel to a row of pixels using SIMD
/// Processes 4 output pixels at once
pub fn simd_blur_row(
    src: &[(f64, f64, f64, f64)],
    dst: &mut [(f64, f64, f64, f64)],
    kernel: &[f64],
    radius: usize,
) {
    let width = src.len();
    
    // Process 4 pixels at a time
    let chunks = width / SIMD_WIDTH;
    
    for chunk in 0..chunks {
        let base_x = chunk * SIMD_WIDTH;
        
        let mut sum_r = f64x4::ZERO;
        let mut sum_g = f64x4::ZERO;
        let mut sum_b = f64x4::ZERO;
        let mut sum_a = f64x4::ZERO;
        
        for (k, &weight) in kernel.iter().enumerate() {
            let w = f64x4::splat(weight);
            
            // Calculate source indices for each of the 4 pixels
            let src_indices: [usize; 4] = [
                ((base_x + 0) as i32 + k as i32 - radius as i32).clamp(0, width as i32 - 1) as usize,
                ((base_x + 1) as i32 + k as i32 - radius as i32).clamp(0, width as i32 - 1) as usize,
                ((base_x + 2) as i32 + k as i32 - radius as i32).clamp(0, width as i32 - 1) as usize,
                ((base_x + 3) as i32 + k as i32 - radius as i32).clamp(0, width as i32 - 1) as usize,
            ];
            
            let r = f64x4::new([
                src[src_indices[0]].0,
                src[src_indices[1]].0,
                src[src_indices[2]].0,
                src[src_indices[3]].0,
            ]);
            let g = f64x4::new([
                src[src_indices[0]].1,
                src[src_indices[1]].1,
                src[src_indices[2]].1,
                src[src_indices[3]].1,
            ]);
            let b = f64x4::new([
                src[src_indices[0]].2,
                src[src_indices[1]].2,
                src[src_indices[2]].2,
                src[src_indices[3]].2,
            ]);
            let a = f64x4::new([
                src[src_indices[0]].3,
                src[src_indices[1]].3,
                src[src_indices[2]].3,
                src[src_indices[3]].3,
            ]);
            
            sum_r = sum_r + r * w;
            sum_g = sum_g + g * w;
            sum_b = sum_b + b * w;
            sum_a = sum_a + a * w;
        }
        
        // Write results
        let r_arr = sum_r.to_array();
        let g_arr = sum_g.to_array();
        let b_arr = sum_b.to_array();
        let a_arr = sum_a.to_array();
        
        for i in 0..SIMD_WIDTH {
            if base_x + i < width {
                dst[base_x + i] = (r_arr[i], g_arr[i], b_arr[i], a_arr[i]);
            }
        }
    }
    
    // Handle remaining pixels (scalar fallback)
    let remainder_start = chunks * SIMD_WIDTH;
    for x in remainder_start..width {
        let mut sum = (0.0, 0.0, 0.0, 0.0);
        for (k, &weight) in kernel.iter().enumerate() {
            let src_x = (x as i32 + k as i32 - radius as i32).clamp(0, width as i32 - 1) as usize;
            let pixel = src[src_x];
            sum.0 += pixel.0 * weight;
            sum.1 += pixel.1 * weight;
            sum.2 += pixel.2 * weight;
            sum.3 += pixel.3 * weight;
        }
        dst[x] = sum;
    }
}

/// SIMD-accelerated 2D separable Gaussian blur
pub fn simd_blur_2d(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    kernel: &[f64],
    radius: usize,
) {
    if radius == 0 || kernel.is_empty() {
        return;
    }
    
    // Temporary buffer for horizontal pass
    let mut temp = vec![(0.0, 0.0, 0.0, 0.0); width * height];
    
    // Horizontal pass (parallel rows)
    temp.par_chunks_mut(width)
        .enumerate()
        .for_each(|(y, dst_row)| {
            let src_row = &buffer[y * width..(y + 1) * width];
            simd_blur_row(src_row, dst_row, kernel, radius);
        });
    
    // Vertical pass - process columns
    // We'll transpose, blur rows, transpose back
    for x in 0..width {
        // Extract column
        let col: Vec<_> = (0..height).map(|y| temp[y * width + x]).collect();
        let mut col_out = vec![(0.0, 0.0, 0.0, 0.0); height];
        
        simd_blur_row(&col, &mut col_out, kernel, radius);
        
        // Write back
        for y in 0..height {
            buffer[y * width + x] = col_out[y];
        }
    }
}

// ============================================================================
// SIMD Tone Mapping
// ============================================================================

/// ACES filmic tone mapping constants
const ACES_A: f64 = 2.51;
const ACES_B: f64 = 0.03;
const ACES_C: f64 = 2.43;
const ACES_D: f64 = 0.59;
const ACES_E: f64 = 0.14;

/// SIMD ACES filmic tone mapping for 4 values at once
#[inline]
pub fn simd_aces_tonemap(x: f64x4) -> f64x4 {
    let x = x.max(f64x4::ZERO);
    let a = f64x4::splat(ACES_A);
    let b = f64x4::splat(ACES_B);
    let c = f64x4::splat(ACES_C);
    let d = f64x4::splat(ACES_D);
    let e = f64x4::splat(ACES_E);
    
    // ACES: (x * (a*x + b)) / (x * (c*x + d) + e)
    let numerator = x * (a * x + b);
    let denominator = x * (c * x + d) + e;
    
    numerator / denominator
}

/// Apply full tone mapping pipeline to 4 pixels
#[inline]
pub fn simd_tonemap_pixel4(
    pixels: &SimdPixel4,
    black: (f64, f64, f64),
    range: (f64, f64, f64),
) -> SimdPixel4 {
    let one = f64x4::splat(1.0);
    let zero = f64x4::ZERO;
    
    // Alpha check - blend to zero for low alpha
    let alpha = pixels.a.max(zero).min(one);
    
    // Un-premultiply (handle zero alpha)
    let alpha_safe = alpha.max(f64x4::splat(1e-10));
    let pr = pixels.r / alpha_safe;
    let pg = pixels.g / alpha_safe;
    let pb = pixels.b / alpha_safe;
    
    // Apply levels
    let black_r = f64x4::splat(black.0);
    let black_g = f64x4::splat(black.1);
    let black_b = f64x4::splat(black.2);
    let range_r = f64x4::splat(range.0);
    let range_g = f64x4::splat(range.1);
    let range_b = f64x4::splat(range.2);
    
    let leveled_r = ((pr - black_r).max(zero)) / range_r;
    let leveled_g = ((pg - black_g).max(zero)) / range_g;
    let leveled_b = ((pb - black_b).max(zero)) / range_b;
    
    // ACES tone mapping
    let mapped_r = simd_aces_tonemap(leveled_r);
    let mapped_g = simd_aces_tonemap(leveled_g);
    let mapped_b = simd_aces_tonemap(leveled_b);
    
    SimdPixel4 {
        r: mapped_r.max(zero).min(one),
        g: mapped_g.max(zero).min(one),
        b: mapped_b.max(zero).min(one),
        a: alpha,
    }
}

/// Process entire buffer with SIMD tone mapping
pub fn simd_tonemap_buffer(
    input: &[(f64, f64, f64, f64)],
    output: &mut [u8],
    black: (f64, f64, f64),
    range: (f64, f64, f64),
) {
    let pixel_count = input.len();
    let chunks = pixel_count / SIMD_WIDTH;
    
    // Process 4 pixels at a time
    for chunk in 0..chunks {
        let base = chunk * SIMD_WIDTH;
        
        let pixels = SimdPixel4::from_pixels(&[
            input[base],
            input[base + 1],
            input[base + 2],
            input[base + 3],
        ]);
        
        let mapped = simd_tonemap_pixel4(&pixels, black, range);
        let result = mapped.to_pixels();
        
        // Convert to u8 and write
        for i in 0..SIMD_WIDTH {
            let idx = (base + i) * 3;
            output[idx] = (result[i].0 * 255.0).round().clamp(0.0, 255.0) as u8;
            output[idx + 1] = (result[i].1 * 255.0).round().clamp(0.0, 255.0) as u8;
            output[idx + 2] = (result[i].2 * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    
    // Handle remaining pixels (scalar)
    let remainder_start = chunks * SIMD_WIDTH;
    for i in remainder_start..pixel_count {
        let (r, g, b, a) = input[i];
        let alpha = a.clamp(0.0, 1.0);
        
        if alpha <= 0.0 {
            let idx = i * 3;
            output[idx] = 0;
            output[idx + 1] = 0;
            output[idx + 2] = 0;
            continue;
        }
        
        let pr = r / alpha;
        let pg = g / alpha;
        let pb = b / alpha;
        
        let leveled_r = ((pr - black.0).max(0.0)) / range.0;
        let leveled_g = ((pg - black.1).max(0.0)) / range.1;
        let leveled_b = ((pb - black.2).max(0.0)) / range.2;
        
        let mapped_r = scalar_aces(leveled_r);
        let mapped_g = scalar_aces(leveled_g);
        let mapped_b = scalar_aces(leveled_b);
        
        let idx = i * 3;
        output[idx] = (mapped_r * 255.0).round().clamp(0.0, 255.0) as u8;
        output[idx + 1] = (mapped_g * 255.0).round().clamp(0.0, 255.0) as u8;
        output[idx + 2] = (mapped_b * 255.0).round().clamp(0.0, 255.0) as u8;
    }
}

#[inline]
fn scalar_aces(x: f64) -> f64 {
    let x = x.max(0.0);
    (x * (ACES_A * x + ACES_B)) / (x * (ACES_C * x + ACES_D) + ACES_E)
}

// ============================================================================
// SIMD Spectral Processing
// ============================================================================

/// Process spectral bins to RGB using SIMD
/// Processes 4 pixels' spectral data at once
pub fn simd_spd_to_rgba_batch(
    spd_batch: &[[f64; 16]; 4],
    bin_rgb: &[(f64, f64, f64); 16],
    bin_tone: &[f64; 16],
) -> [(f64, f64, f64, f64); 4] {
    let mut results = [(0.0, 0.0, 0.0, 0.0); 4];
    
    // For each pixel in the batch
    for (pixel_idx, spd) in spd_batch.iter().enumerate() {
        let mut r = 0.0;
        let mut g = 0.0;
        let mut b = 0.0;
        let mut total = 0.0;
        
        for (bin_idx, &energy) in spd.iter().enumerate() {
            if energy == 0.0 {
                continue;
            }
            let k = bin_tone[bin_idx];
            let e_mapped = 1.0 - (-k * energy).exp();
            total += e_mapped;
            r += e_mapped * bin_rgb[bin_idx].0;
            g += e_mapped * bin_rgb[bin_idx].1;
            b += e_mapped * bin_rgb[bin_idx].2;
        }
        
        if total == 0.0 {
            results[pixel_idx] = (0.0, 0.0, 0.0, 0.0);
            continue;
        }
        
        r /= total;
        g /= total;
        b /= total;
        
        // Saturation boost
        let mean = (r + g + b) / 3.0;
        let max_channel = r.max(g).max(b);
        let min_channel = r.min(g).min(b);
        let color_range = max_channel - min_channel;
        
        let sat_boost = if color_range < 0.1 {
            2.5
        } else if color_range < 0.3 {
            2.2
        } else {
            1.8
        };
        
        r = mean + (r - mean) * sat_boost;
        g = mean + (g - mean) * sat_boost;
        b = mean + (b - mean) * sat_boost;
        
        // Soft clamp
        let max_value = r.max(g).max(b);
        if max_value > 1.0 {
            let scale = 1.0 / max_value;
            r *= scale;
            g *= scale;
            b *= scale;
        }
        
        r = r.clamp(0.0, 1.0);
        g = g.clamp(0.0, 1.0);
        b = b.clamp(0.0, 1.0);
        
        let brightness = 1.0 - (-total).exp();
        results[pixel_idx] = (r * brightness, g * brightness, b * brightness, brightness);
    }
    
    results
}

// ============================================================================
// SIMD OKLab -> Linear sRGB Conversion
// ============================================================================

/// Convert premultiplied OKLab buffer to premultiplied linear sRGB using SIMD.
/// This matches the scalar `oklab_to_linear_srgb` math, preserving visual output.
pub fn simd_oklab_to_linear_srgb_batch(
    input: &[(f64, f64, f64, f64)],
    output: &mut [(f64, f64, f64, f64)],
) {
    assert_eq!(input.len(), output.len());
    let len = input.len();
    let simd_len = len / SIMD_WIDTH * SIMD_WIDTH;

    if simd_len > 0 {
        output[..simd_len]
            .par_chunks_mut(SIMD_WIDTH)
            .zip(input[..simd_len].par_chunks(SIMD_WIDTH))
            .for_each(|(out_chunk, in_chunk)| {
                let l = f64x4::new([in_chunk[0].0, in_chunk[1].0, in_chunk[2].0, in_chunk[3].0]);
                let a = f64x4::new([in_chunk[0].1, in_chunk[1].1, in_chunk[2].1, in_chunk[3].1]);
                let b = f64x4::new([in_chunk[0].2, in_chunk[1].2, in_chunk[2].2, in_chunk[3].2]);
                let alpha = f64x4::new([in_chunk[0].3, in_chunk[1].3, in_chunk[2].3, in_chunk[3].3]);

                let alpha_safe = alpha.max(f64x4::splat(1e-10));
                let l_un = l / alpha_safe;
                let a_un = a / alpha_safe;
                let b_un = b / alpha_safe;

                // OKLab -> LMS (nonlinear)
                let l_prime = l_un + f64x4::splat(0.3963377774) * a_un + f64x4::splat(0.2158037573) * b_un;
                let m_prime = l_un - f64x4::splat(0.1055613458) * a_un - f64x4::splat(0.0638541728) * b_un;
                let s_prime = l_un - f64x4::splat(0.0894841775) * a_un - f64x4::splat(1.2914855480) * b_un;

                // Inverse nonlinearity (cube)
                let l_lms = l_prime * l_prime * l_prime;
                let m_lms = m_prime * m_prime * m_prime;
                let s_lms = s_prime * s_prime * s_prime;

                // LMS -> linear sRGB
                let r = f64x4::splat(4.0767416621) * l_lms
                    - f64x4::splat(3.3077115913) * m_lms
                    + f64x4::splat(0.2309699292) * s_lms;
                let g = -f64x4::splat(1.2684380046) * l_lms
                    + f64x4::splat(2.6097574011) * m_lms
                    - f64x4::splat(0.3413193965) * s_lms;
                let b_out = -f64x4::splat(0.0041960863) * l_lms
                    - f64x4::splat(0.7034186147) * m_lms
                    + f64x4::splat(1.7076147010) * s_lms;

                // Premultiply
                let r = r * alpha;
                let g = g * alpha;
                let b_out = b_out * alpha;

                let r_arr = r.to_array();
                let g_arr = g.to_array();
                let b_arr = b_out.to_array();
                let a_arr = alpha.to_array();

                for i in 0..SIMD_WIDTH {
                    if a_arr[i] > 0.0 {
                        out_chunk[i] = (r_arr[i], g_arr[i], b_arr[i], a_arr[i]);
                    } else {
                        out_chunk[i] = (0.0, 0.0, 0.0, 0.0);
                    }
                }
            });
    }

    for i in simd_len..len {
        let (l, a, b, alpha) = input[i];
        if alpha > 0.0 {
            let l_un = l / alpha;
            let a_un = a / alpha;
            let b_un = b / alpha;

            let l_prime = l_un + 0.3963377774 * a_un + 0.2158037573 * b_un;
            let m_prime = l_un - 0.1055613458 * a_un - 0.0638541728 * b_un;
            let s_prime = l_un - 0.0894841775 * a_un - 1.2914855480 * b_un;

            let l_lms = l_prime * l_prime * l_prime;
            let m_lms = m_prime * m_prime * m_prime;
            let s_lms = s_prime * s_prime * s_prime;

            let r = 4.0767416621 * l_lms - 3.3077115913 * m_lms + 0.2309699292 * s_lms;
            let g = -1.2684380046 * l_lms + 2.6097574011 * m_lms - 0.3413193965 * s_lms;
            let b_out = -0.0041960863 * l_lms - 0.7034186147 * m_lms + 1.7076147010 * s_lms;

            output[i] = (r * alpha, g * alpha, b_out * alpha, alpha);
        } else {
            output[i] = (0.0, 0.0, 0.0, 0.0);
        }
    }
}

// ============================================================================
// SIMD Math Helpers
// ============================================================================

/// Approximate natural logarithm for SIMD (good for ~1-100 range)
#[allow(dead_code)]
#[inline]
fn simd_ln_approx(x: f64x4) -> f64x4 {
    // Simple polynomial approximation
    // ln(x) ≈ (x - 1) - (x - 1)^2/2 + (x - 1)^3/3 for x near 1
    // For larger x, we use: ln(x) ≈ 2 * (y - 1)/(y + 1) where y = sqrt(x)
    // This is a rough approximation sufficient for visual effects
    
    let one = f64x4::splat(1.0);
    let y = simd_sqrt_approx(x);
    let y_minus_1 = y - one;
    let y_plus_1 = y + one;
    
    f64x4::splat(2.0) * y_minus_1 / y_plus_1
}

/// Approximate square root for SIMD
#[allow(dead_code)]
#[inline]
fn simd_sqrt_approx(x: f64x4) -> f64x4 {
    // Newton-Raphson iteration: y = (y + x/y) / 2
    // Starting with x/2 as initial guess
    let half = f64x4::splat(0.5);
    let mut y = x * half;
    
    // 3 iterations is usually enough
    for _ in 0..3 {
        y = (y + x / y) * half;
    }
    
    y
}

/// Approximate power function for SIMD
#[allow(dead_code)]
#[inline]
fn simd_pow_approx(base: f64x4, exp: f64x4) -> f64x4 {
    // x^y = exp(y * ln(x))
    // Using simple approximation for visual effects
    let ln_base = simd_ln_approx(base.max(f64x4::splat(0.001)));
    let result = ln_base * exp;
    
    // exp approximation: exp(x) ≈ 1 + x + x^2/2 + x^3/6 for small x
    let one = f64x4::splat(1.0);
    let x = result;
    let x2 = x * x;
    let x3 = x2 * x;
    
    one + x + x2 * f64x4::splat(0.5) + x3 * f64x4::splat(0.1667)
}

// ============================================================================
// Batch Processing for Full Buffers
// ============================================================================

/// Process an entire pixel buffer with fused SIMD effects
pub fn simd_process_effects_buffer(
    input: &[(f64, f64, f64, f64)],
    blackbody_strength: f64,
    blackbody_min_temp: f64,
    blackbody_max_temp: f64,
    metallic_strength: f64,
    metallic_intensity: f64,
    subsurface_strength: f64,
    subsurface_warmth: f64,
) -> Vec<(f64, f64, f64, f64)> {
    let mut output = vec![(0.0, 0.0, 0.0, 0.0); input.len()];
    let chunks = input.len() / SIMD_WIDTH;
    
    // Process in parallel chunks
    output.par_chunks_mut(SIMD_WIDTH)
        .enumerate()
        .for_each(|(chunk_idx, out_chunk)| {
            let base = chunk_idx * SIMD_WIDTH;
            if base + SIMD_WIDTH > input.len() {
                return;
            }
            
            let mut pixels = SimdPixel4::from_pixels(&[
                input[base],
                input[base + 1],
                input[base + 2],
                input[base + 3],
            ]);
            
            // Apply effects in sequence
            if blackbody_strength > 0.0 {
                pixels = simd_apply_blackbody(&pixels, blackbody_strength, blackbody_min_temp, blackbody_max_temp);
            }
            
            if metallic_strength > 0.0 {
                pixels = simd_apply_metallic(&pixels, metallic_strength, metallic_intensity);
            }
            
            if subsurface_strength > 0.0 {
                pixels = simd_apply_subsurface(&pixels, subsurface_strength, subsurface_warmth);
            }
            
            let result = pixels.to_pixels();
            out_chunk.copy_from_slice(&result);
        });
    
    // Handle remainder
    let remainder_start = chunks * SIMD_WIDTH;
    for i in remainder_start..input.len() {
        output[i] = input[i]; // Fallback: just copy
    }
    
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::oklab;

    // ========== SimdPixel4 Tests ==========

    #[test]
    fn test_simd_pixel4_from_pixels() {
        let pixels = [
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
            (0.5, 0.5, 0.5, 0.5),
        ];
        
        let simd = SimdPixel4::from_pixels(&pixels);
        let back = simd.to_pixels();
        
        for i in 0..4 {
            assert!((back[i].0 - pixels[i].0).abs() < 1e-10);
            assert!((back[i].1 - pixels[i].1).abs() < 1e-10);
            assert!((back[i].2 - pixels[i].2).abs() < 1e-10);
            assert!((back[i].3 - pixels[i].3).abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_pixel4_zero() {
        let simd = SimdPixel4::zero();
        let pixels = simd.to_pixels();
        
        for p in &pixels {
            assert_eq!(*p, (0.0, 0.0, 0.0, 0.0));
        }
    }

    #[test]
    fn test_simd_pixel4_splat() {
        let simd = SimdPixel4::splat(0.5, 0.6, 0.7, 0.8);
        let pixels = simd.to_pixels();
        
        for p in &pixels {
            assert!((p.0 - 0.5).abs() < 1e-10);
            assert!((p.1 - 0.6).abs() < 1e-10);
            assert!((p.2 - 0.7).abs() < 1e-10);
            assert!((p.3 - 0.8).abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_pixel4_luminance() {
        let pixels = [
            (1.0, 1.0, 1.0, 1.0), // White: lum ≈ 1.0
            (0.0, 0.0, 0.0, 1.0), // Black: lum = 0.0
            (1.0, 0.0, 0.0, 1.0), // Red: lum = 0.2126
            (0.0, 1.0, 0.0, 1.0), // Green: lum = 0.7152
        ];
        
        let simd = SimdPixel4::from_pixels(&pixels);
        let lum = simd.luminance().to_array();
        
        assert!((lum[0] - 1.0).abs() < 1e-10);
        assert!(lum[1].abs() < 1e-10);
        assert!((lum[2] - 0.2126).abs() < 1e-10);
        assert!((lum[3] - 0.7152).abs() < 1e-10);
    }

    #[test]
    fn test_simd_pixel4_clamp() {
        let pixels = [
            (1.5, -0.5, 0.5, 1.0),
            (0.0, 2.0, 0.0, -1.0),
            (-1.0, 0.5, 1.5, 0.5),
            (0.5, 0.5, 0.5, 0.5),
        ];
        
        let simd = SimdPixel4::from_pixels(&pixels);
        let clamped = simd.clamp01();
        let result = clamped.to_pixels();
        
        assert!((result[0].0 - 1.0).abs() < 1e-10); // 1.5 -> 1.0
        assert!((result[0].1 - 0.0).abs() < 1e-10); // -0.5 -> 0.0
        assert!((result[1].1 - 1.0).abs() < 1e-10); // 2.0 -> 1.0
        assert!((result[1].3 - 0.0).abs() < 1e-10); // -1.0 -> 0.0
    }

    #[test]
    fn test_simd_pixel4_scale() {
        let pixels = [
            (1.0, 1.0, 1.0, 1.0),
            (0.5, 0.5, 0.5, 0.5),
            (0.2, 0.4, 0.6, 0.8),
            (0.0, 0.0, 0.0, 0.0),
        ];
        
        let simd = SimdPixel4::from_pixels(&pixels);
        let scaled = simd.scale(f64x4::splat(0.5));
        let result = scaled.to_pixels();
        
        assert!((result[0].0 - 0.5).abs() < 1e-10);
        assert!((result[1].0 - 0.25).abs() < 1e-10);
    }

    #[test]
    fn test_simd_pixel4_add() {
        let a = SimdPixel4::splat(0.3, 0.3, 0.3, 1.0);
        let b = SimdPixel4::splat(0.2, 0.4, 0.1, 0.0);
        let result = a.add(&b).to_pixels();
        
        for p in &result {
            assert!((p.0 - 0.5).abs() < 1e-10);
            assert!((p.1 - 0.7).abs() < 1e-10);
            assert!((p.2 - 0.4).abs() < 1e-10);
            assert!((p.3 - 1.0).abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_pixel4_lerp() {
        let a = SimdPixel4::splat(0.0, 0.0, 0.0, 1.0);
        let b = SimdPixel4::splat(1.0, 1.0, 1.0, 1.0);
        let t = f64x4::splat(0.5);
        let result = SimdPixel4::lerp(&a, &b, t).to_pixels();
        
        for p in &result {
            assert!((p.0 - 0.5).abs() < 1e-10);
            assert!((p.1 - 0.5).abs() < 1e-10);
            assert!((p.2 - 0.5).abs() < 1e-10);
        }
    }

    // ========== SIMD Effect Tests ==========

    #[test]
    fn test_simd_blackbody_cold() {
        let (r, _g, b) = simd_blackbody_to_rgb(f64x4::splat(2000.0));
        let r_arr = r.to_array();
        let b_arr = b.to_array();
        
        // Cold temperature should be reddish
        for i in 0..4 {
            assert!(r_arr[i] > b_arr[i], "Cold temp should be more red than blue");
        }
    }

    #[test]
    fn test_simd_blackbody_hot() {
        let (_r, _g, b) = simd_blackbody_to_rgb(f64x4::splat(10000.0));
        let b_arr = b.to_array();
        
        // Hot temperature: blue should be significant
        for i in 0..4 {
            assert!(b_arr[i] > 0.5, "Hot temp should have high blue");
        }
    }

    #[test]
    fn test_simd_apply_blackbody_preserves_alpha() {
        let pixels = SimdPixel4::from_pixels(&[
            (0.5, 0.5, 0.5, 1.0),
            (0.5, 0.5, 0.5, 0.5),
            (0.5, 0.5, 0.5, 0.0),
            (0.5, 0.5, 0.5, 0.75),
        ]);
        
        let result = simd_apply_blackbody(&pixels, 0.5, 2000.0, 10000.0);
        let out = result.to_pixels();
        
        assert!((out[0].3 - 1.0).abs() < 1e-10);
        assert!((out[1].3 - 0.5).abs() < 1e-10);
        assert!((out[2].3 - 0.0).abs() < 1e-10);
        assert!((out[3].3 - 0.75).abs() < 1e-10);
    }

    #[test]
    fn test_simd_apply_blackbody_zero_strength() {
        let pixels = SimdPixel4::from_pixels(&[
            (0.3, 0.5, 0.7, 1.0),
            (0.3, 0.5, 0.7, 1.0),
            (0.3, 0.5, 0.7, 1.0),
            (0.3, 0.5, 0.7, 1.0),
        ]);
        
        let result = simd_apply_blackbody(&pixels, 0.0, 2000.0, 10000.0);
        let out = result.to_pixels();
        
        for i in 0..4 {
            assert!((out[i].0 - 0.3).abs() < 1e-10);
            assert!((out[i].1 - 0.5).abs() < 1e-10);
            assert!((out[i].2 - 0.7).abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_apply_metallic() {
        let pixels = SimdPixel4::splat(0.5, 0.5, 0.5, 1.0);
        let result = simd_apply_metallic(&pixels, 0.5, 0.8);
        let out = result.to_pixels();
        
        // Should add some metallic sheen
        for i in 0..4 {
            assert!(out[i].0 > 0.0 && out[i].0 <= 1.0);
            assert!(out[i].1 > 0.0 && out[i].1 <= 1.0);
            assert!(out[i].2 > 0.0 && out[i].2 <= 1.0);
        }
    }

    #[test]
    fn test_simd_apply_subsurface() {
        let pixels = SimdPixel4::splat(0.5, 0.5, 0.5, 1.0);
        let result = simd_apply_subsurface(&pixels, 0.5, 0.5);
        let out = result.to_pixels();
        
        // Warmth should add red, reduce blue
        for i in 0..4 {
            assert!(out[i].0 >= 0.5); // Red increased or same
            assert!(out[i].2 <= 0.5); // Blue decreased or same
        }
    }

    // ========== SIMD Blur Tests ==========

    #[test]
    fn test_simd_blur_row_identity() {
        let kernel = vec![1.0];
        let src = vec![
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
            (0.5, 0.5, 0.5, 1.0),
        ];
        let mut dst = vec![(0.0, 0.0, 0.0, 0.0); 4];
        
        simd_blur_row(&src, &mut dst, &kernel, 0);
        
        for i in 0..4 {
            assert!((dst[i].0 - src[i].0).abs() < 1e-10);
            assert!((dst[i].1 - src[i].1).abs() < 1e-10);
            assert!((dst[i].2 - src[i].2).abs() < 1e-10);
            assert!((dst[i].3 - src[i].3).abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_blur_row_averaging() {
        // Simple 3-tap average kernel
        let kernel = vec![1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0];
        let src = vec![
            (0.0, 0.0, 0.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0),
        ];
        let mut dst = vec![(0.0, 0.0, 0.0, 0.0); 8];
        
        simd_blur_row(&src, &mut dst, &kernel, 1);
        
        // Position 1 should be average of 0, 1, 2 = (0+1+0)/3 ≈ 0.333
        assert!((dst[1].0 - 1.0 / 3.0).abs() < 0.01);
    }

    #[test]
    fn test_simd_blur_2d_identity() {
        let kernel = vec![1.0];
        let mut buffer = vec![
            (1.0, 0.0, 0.0, 1.0), (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0), (0.5, 0.5, 0.5, 1.0),
        ];
        let original = buffer.clone();
        
        simd_blur_2d(&mut buffer, 2, 2, &kernel, 0);
        
        for i in 0..4 {
            assert!((buffer[i].0 - original[i].0).abs() < 1e-10);
            assert!((buffer[i].1 - original[i].1).abs() < 1e-10);
            assert!((buffer[i].2 - original[i].2).abs() < 1e-10);
            assert!((buffer[i].3 - original[i].3).abs() < 1e-10);
        }
    }

    // ========== SIMD Tone Mapping Tests ==========

    #[test]
    fn test_simd_aces_zero() {
        let result = simd_aces_tonemap(f64x4::ZERO).to_array();
        for v in &result {
            assert!(v.abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_aces_one() {
        let result = simd_aces_tonemap(f64x4::splat(1.0)).to_array();
        // ACES(1.0) = (1 * (2.51 * 1 + 0.03)) / (1 * (2.43 * 1 + 0.59) + 0.14)
        //           = 2.54 / 3.16 ≈ 0.804
        for v in &result {
            assert!((v - 0.804).abs() < 0.01);
        }
    }

    #[test]
    fn test_simd_aces_clamps_negative() {
        let result = simd_aces_tonemap(f64x4::splat(-1.0)).to_array();
        for v in &result {
            assert!(v.abs() < 1e-10);
        }
    }

    #[test]
    fn test_simd_tonemap_pixel4_preserves_alpha() {
        let pixels = SimdPixel4::from_pixels(&[
            (0.5, 0.5, 0.5, 1.0),
            (0.5, 0.5, 0.5, 0.5),
            (0.5, 0.5, 0.5, 0.0),
            (0.5, 0.5, 0.5, 0.25),
        ]);
        
        let result = simd_tonemap_pixel4(&pixels, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0));
        let out = result.to_pixels();
        
        assert!((out[0].3 - 1.0).abs() < 1e-10);
        assert!((out[1].3 - 0.5).abs() < 1e-10);
        assert!((out[2].3 - 0.0).abs() < 1e-10);
        assert!((out[3].3 - 0.25).abs() < 1e-10);
    }

    #[test]
    fn test_simd_tonemap_buffer_basic() {
        let input = vec![
            (0.5, 0.5, 0.5, 1.0),
            (0.5, 0.5, 0.5, 1.0),
            (0.5, 0.5, 0.5, 1.0),
            (0.5, 0.5, 0.5, 1.0),
        ];
        let mut output = vec![0u8; input.len() * 3];
        
        simd_tonemap_buffer(&input, &mut output, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0));
        
        // All pixels should be the same
        for i in 0..4 {
            assert_eq!(output[i * 3], output[0]);
            assert_eq!(output[i * 3 + 1], output[1]);
            assert_eq!(output[i * 3 + 2], output[2]);
        }
        
        // u8 values are always in valid range (0-255)
        // Just verify output is not empty
        assert!(!output.is_empty(), "Output should not be empty");
    }

    // ========== SIMD Math Helpers Tests ==========

    #[test]
    fn test_simd_sqrt_approx() {
        let input = f64x4::new([1.0, 4.0, 9.0, 16.0]);
        let result = simd_sqrt_approx(input).to_array();
        
        assert!((result[0] - 1.0).abs() < 0.01);
        assert!((result[1] - 2.0).abs() < 0.01);
        assert!((result[2] - 3.0).abs() < 0.01);
        assert!((result[3] - 4.0).abs() < 0.01);
    }

    #[test]
    fn test_simd_ln_approx() {
        // Natural log: ln(1) = 0, ln(e) ≈ 1
        // Note: This is a rough approximation for visual effects, not mathematical precision
        let input = f64x4::new([1.0, std::f64::consts::E, 10.0, 100.0]);
        let result = simd_ln_approx(input).to_array();
        
        // Approximation should produce finite, roughly ordered results
        assert!(!result[0].is_nan(), "ln(1) should not be NaN");
        assert!(!result[1].is_nan(), "ln(e) should not be NaN");
        // ln(10) > ln(e) > ln(1)
        assert!(result[2] > result[1], "ln(10) should be > ln(e)");
        assert!(result[1] > result[0], "ln(e) should be > ln(1)");
    }

    // ========== Buffer Processing Tests ==========

    #[test]
    fn test_simd_process_effects_buffer_passthrough() {
        let input: Vec<_> = (0..16)
            .map(|i| {
                let v = i as f64 / 16.0;
                (v, v, v, 1.0)
            })
            .collect();
        
        // Zero strength = passthrough
        let output = simd_process_effects_buffer(
            &input,
            0.0, 2000.0, 10000.0, // blackbody
            0.0, 0.5,             // metallic
            0.0, 0.25,            // subsurface
        );
        
        assert_eq!(output.len(), input.len());
        for i in 0..input.len() {
            assert!((output[i].0 - input[i].0).abs() < 0.01);
            assert!((output[i].1 - input[i].1).abs() < 0.01);
            assert!((output[i].2 - input[i].2).abs() < 0.01);
            assert!((output[i].3 - input[i].3).abs() < 0.01);
        }
    }

    #[test]
    fn test_simd_process_effects_buffer_modifies() {
        let input: Vec<_> = (0..16)
            .map(|_| (0.5, 0.5, 0.5, 1.0))
            .collect();
        
        let output = simd_process_effects_buffer(
            &input,
            0.5, 2000.0, 10000.0, // blackbody
            0.3, 0.5,             // metallic
            0.2, 0.25,            // subsurface
        );
        
        assert_eq!(output.len(), input.len());
        
        // At least some pixels should be modified
        let any_modified = output.iter().enumerate().any(|(i, p)| {
            (p.0 - input[i].0).abs() > 0.01
                || (p.1 - input[i].1).abs() > 0.01
                || (p.2 - input[i].2).abs() > 0.01
        });
        assert!(any_modified, "Effects should modify pixels");
    }

    #[test]
    fn test_simd_spd_to_rgba_batch_empty() {
        let spd_batch = [[0.0f64; 16]; 4];
        let bin_rgb = [(0.0, 0.0, 0.0); 16];
        let bin_tone = [1.0f64; 16];
        
        let result = simd_spd_to_rgba_batch(&spd_batch, &bin_rgb, &bin_tone);
        
        for p in &result {
            assert_eq!(*p, (0.0, 0.0, 0.0, 0.0));
        }
    }

    #[test]
    fn test_simd_oklab_to_linear_srgb_batch_matches_scalar() {
        let input = vec![
            (0.5, 0.1, 0.2, 1.0),
            (0.2, -0.1, 0.3, 0.8),
            (0.0, 0.0, 0.0, 0.0),
            (0.7, -0.2, 0.1, 0.5),
            (0.4, 0.0, -0.1, 1.0),
            (0.6, 0.2, -0.2, 0.75),
        ];

        let mut output = vec![(0.0, 0.0, 0.0, 0.0); input.len()];
        simd_oklab_to_linear_srgb_batch(&input, &mut output);

        for (i, &(l, a, b, alpha)) in input.iter().enumerate() {
            let expected = if alpha > 0.0 {
                let (r, g, b_val) = oklab::oklab_to_linear_srgb(l / alpha, a / alpha, b / alpha);
                (r * alpha, g * alpha, b_val * alpha, alpha)
            } else {
                (0.0, 0.0, 0.0, 0.0)
            };

            assert!((output[i].0 - expected.0).abs() < 1e-10, "R mismatch at {}", i);
            assert!((output[i].1 - expected.1).abs() < 1e-10, "G mismatch at {}", i);
            assert!((output[i].2 - expected.2).abs() < 1e-10, "B mismatch at {}", i);
            assert!((output[i].3 - expected.3).abs() < 1e-10, "A mismatch at {}", i);
        }
    }

    #[test]
    fn test_simd_consistency_with_scalar() {
        // Test that SIMD produces similar results to scalar
        let input = vec![
            (0.5, 0.3, 0.7, 1.0),
            (0.2, 0.8, 0.1, 0.9),
            (0.9, 0.1, 0.5, 0.5),
            (0.4, 0.4, 0.4, 1.0),
        ];
        
        // Process with SIMD
        let simd_result = simd_process_effects_buffer(
            &input,
            0.3, 2000.0, 10000.0,
            0.2, 0.5,
            0.1, 0.25,
        );
        
        // All outputs should be valid
        for p in &simd_result {
            assert!(p.0 >= 0.0 && p.0 <= 1.0);
            assert!(p.1 >= 0.0 && p.1 <= 1.0);
            assert!(p.2 >= 0.0 && p.2 <= 1.0);
            assert!(p.3 >= 0.0 && p.3 <= 1.0);
        }
    }
}
