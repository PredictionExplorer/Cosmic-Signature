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
