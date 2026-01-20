//! Shared utilities for post-processing effects.

use super::PixelBuffer;
use parking_lot::Mutex;
use rayon::prelude::*;
use std::sync::{Arc, LazyLock};

struct GradientCache {
    width: usize,
    height: usize,
    data: Arc<Vec<(f64, f64)>>,
}

static GRADIENT_CACHE: LazyLock<Mutex<Option<GradientCache>>> = LazyLock::new(|| Mutex::new(None));

/// Clears cached gradients so the next request recomputes them.
pub fn reset_gradient_cache() {
    *GRADIENT_CACHE.lock() = None;
}

/// Computes luminance gradients for a given pixel buffer, used for flow-aware effects.
pub fn calculate_gradients(buffer: &PixelBuffer, width: usize, height: usize) -> Arc<Vec<(f64, f64)>> {
    if let Some(cache) = GRADIENT_CACHE.lock().as_ref() {
        if cache.width == width && cache.height == height {
            return cache.data.clone();
        }
    }

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

    let data = Arc::new(gradients);
    *GRADIENT_CACHE.lock() = Some(GradientCache { width, height, data: data.clone() });
    data
}

/// Computes luminance gradients without using the global cache.
#[allow(dead_code)]
pub fn calculate_gradients_uncached(
    buffer: &PixelBuffer,
    width: usize,
    height: usize,
) -> Vec<(f64, f64)> {
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

        let magnitude = (gx * gx + gy * gy).sqrt().max(1e-5);
        let scale = (0.85 / magnitude).min(1.0);
        *grad = (gx * scale, gy * scale);
    });

    gradients
}

/// Bilinear sample from a premultiplied RGBA buffer.
#[allow(dead_code)]
pub fn sample_bilinear(
    buffer: &PixelBuffer,
    width: usize,
    height: usize,
    x: f64,
    y: f64,
) -> (f64, f64, f64, f64) {
    if width == 0 || height == 0 || buffer.is_empty() {
        return (0.0, 0.0, 0.0, 0.0);
    }

    let x = x.clamp(0.0, (width - 1) as f64);
    let y = y.clamp(0.0, (height - 1) as f64);

    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);

    let fx = x - x0 as f64;
    let fy = y - y0 as f64;

    let p00 = buffer[y0 * width + x0];
    let p01 = buffer[y0 * width + x1];
    let p10 = buffer[y1 * width + x0];
    let p11 = buffer[y1 * width + x1];

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

    (
        top.0 * (1.0 - fy) + bottom.0 * fy,
        top.1 * (1.0 - fy) + bottom.1 * fy,
        top.2 * (1.0 - fy) + bottom.2 * fy,
        top.3 * (1.0 - fy) + bottom.3 * fy,
    )
}
