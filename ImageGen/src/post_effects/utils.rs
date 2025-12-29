//! Shared utilities for post-processing effects.

use super::PixelBuffer;
use rayon::prelude::*;

/// Computes luminance gradients for a given pixel buffer, used for flow-aware effects.
pub fn calculate_gradients(buffer: &PixelBuffer, width: usize, height: usize) -> Vec<(f64, f64)> {
    let mut luminance = vec![0.0f64; buffer.len()];
    luminance.par_iter_mut().enumerate().for_each(|(idx, lum)| {
        let (r, g, b, a) = buffer[idx];
        *lum = if a > 0.0 { (0.2126 * r + 0.7152 * g + 0.0722 * b) / a } else { 0.0 };
    });

    let mut gradients = vec![(0.0, 0.0); buffer.len()];
    gradients.par_iter_mut().enumerate().for_each(|(idx, grad)| {
        let x = (idx % width) as isize;
        let y = (idx / width) as isize;
        let sample = |sx: isize, sy: isize| -> f64 {
            let sx = sx.clamp(0, width as isize - 1);
            let sy = sy.clamp(0, height as isize - 1);
            luminance[sy as usize * width + sx as usize]
        };
        let gx = sample(x + 1, y) - sample(x - 1, y);
        let gy = sample(x, y + 1) - sample(x, y - 1);

        // Normalize gradients to avoid overpowering chroma modulation
        let magnitude = (gx * gx + gy * gy).sqrt().max(1e-5);
        let scale = (0.85 / magnitude).min(1.0);

        *grad = (gx * scale, gy * scale);
    });
    gradients
}

/// Downsamples a pixel buffer by 2x in both dimensions using a box filter.
/// Handles premultiplied alpha correctly.
pub fn downsample_2x(
    src: &PixelBuffer,
    width: usize,
    height: usize,
) -> (PixelBuffer, usize, usize) {
    let new_w = width.div_ceil(2);
    let new_h = height.div_ceil(2);
    let mut dest = vec![(0.0, 0.0, 0.0, 0.0); new_w * new_h];

    dest.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let dx = idx % new_w;
        let dy = idx / new_w;

        let x0 = dx * 2;
        let x1 = (x0 + 1).min(width - 1);
        let y0 = dy * 2;
        let y1 = (y0 + 1).min(height - 1);

        let p00 = src[y0 * width + x0];
        let p01 = src[y0 * width + x1];
        let p10 = src[y1 * width + x0];
        let p11 = src[y1 * width + x1];

        *pixel = (
            (p00.0 + p01.0 + p10.0 + p11.0) * 0.25,
            (p00.1 + p01.1 + p10.1 + p11.1) * 0.25,
            (p00.2 + p01.2 + p10.2 + p11.2) * 0.25,
            (p00.3 + p01.3 + p10.3 + p11.3) * 0.25,
        );
    });

    (dest, new_w, new_h)
}

/// Upsamples a pixel buffer using bilinear interpolation.
/// Correctly handles premultiplied alpha.
pub fn upsample_bilinear(
    src: &PixelBuffer,
    src_w: usize,
    src_h: usize,
    target_w: usize,
    target_h: usize,
) -> PixelBuffer {
    if src_w == target_w && src_h == target_h {
        return src.clone();
    }

    let mut dest = vec![(0.0, 0.0, 0.0, 0.0); target_w * target_h];

    dest.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let x = idx % target_w;
        let y = idx / target_w;

        let sx = (x as f64 * src_w as f64 / target_w as f64).min((src_w - 1) as f64);
        let sy = (y as f64 * src_h as f64 / target_h as f64).min((src_h - 1) as f64);

        let x0 = sx.floor() as usize;
        let y0 = sy.floor() as usize;
        let x1 = (x0 + 1).min(src_w - 1);
        let y1 = (y0 + 1).min(src_h - 1);

        let fx = sx - x0 as f64;
        let fy = sy - y0 as f64;

        let p00 = src[y0 * src_w + x0];
        let p01 = src[y0 * src_w + x1];
        let p10 = src[y1 * src_w + x0];
        let p11 = src[y1 * src_w + x1];

        // Bilinear interpolation of premultiplied channels
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

    dest
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_buffer(w: usize, h: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); w * h]
    }

    #[test]
    fn test_calculate_gradients_uniform() {
        let buffer = test_buffer(50, 50, 0.5);
        let gradients = calculate_gradients(&buffer, 50, 50);

        assert_eq!(gradients.len(), buffer.len());
        // Uniform buffer should have near-zero gradients
        for &(gx, gy) in &gradients {
            assert!(gx.is_finite() && gy.is_finite());
            assert!(gx.abs() < 0.1 && gy.abs() < 0.1);
        }
    }

    #[test]
    fn test_calculate_gradients_size() {
        let buffer = test_buffer(100, 100, 0.5);
        let gradients = calculate_gradients(&buffer, 100, 100);
        assert_eq!(gradients.len(), 100 * 100);
    }

    #[test]
    fn test_calculate_gradients_handles_zero() {
        let buffer = test_buffer(50, 50, 0.0);
        let gradients = calculate_gradients(&buffer, 50, 50);

        for &(gx, gy) in &gradients {
            assert!(gx.is_finite() && gy.is_finite());
        }
    }
}
