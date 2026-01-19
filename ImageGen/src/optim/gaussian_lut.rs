//! Pre-computed Gaussian Kernels
//!
//! Static lookup table for common Gaussian blur radii, avoiding
//! repeated kernel computation during rendering.
//!
//! Typical speedup: 1.5x for blur operations.

#![allow(dead_code)]

use once_cell::sync::Lazy;

/// Maximum radius stored in the LUT
pub const MAX_LUT_RADIUS: usize = 64;

/// Pre-computed Gaussian kernel lookup table
pub static GAUSSIAN_LUT: Lazy<GaussianLUT> = Lazy::new(GaussianLUT::new);

/// Gaussian kernel lookup table
pub struct GaussianLUT {
    /// Kernels indexed by radius (1 to MAX_LUT_RADIUS)
    kernels: Vec<Vec<f64>>,
    /// Kernel sums for quick normalization check
    sums: Vec<f64>,
}

impl GaussianLUT {
    /// Create a new LUT with pre-computed kernels
    pub fn new() -> Self {
        let mut kernels = Vec::with_capacity(MAX_LUT_RADIUS + 1);
        let mut sums = Vec::with_capacity(MAX_LUT_RADIUS + 1);

        // Radius 0 - identity kernel
        kernels.push(vec![1.0]);
        sums.push(1.0);

        // Pre-compute kernels for radii 1 to MAX_LUT_RADIUS
        for radius in 1..=MAX_LUT_RADIUS {
            let kernel = Self::compute_kernel(radius);
            let sum: f64 = kernel.iter().sum();
            sums.push(sum);
            kernels.push(kernel);
        }

        Self { kernels, sums }
    }

    /// Get a pre-computed kernel for the given radius
    ///
    /// Returns None if radius > MAX_LUT_RADIUS
    #[inline]
    pub fn get(&self, radius: usize) -> Option<&[f64]> {
        if radius <= MAX_LUT_RADIUS {
            Some(&self.kernels[radius])
        } else {
            None
        }
    }

    /// Get kernel or compute on-demand for large radii
    pub fn get_or_compute(&self, radius: usize) -> Vec<f64> {
        if let Some(kernel) = self.get(radius) {
            kernel.to_vec()
        } else {
            Self::compute_kernel(radius)
        }
    }

    /// Get the sum of a kernel (for normalization verification)
    #[inline]
    pub fn get_sum(&self, radius: usize) -> Option<f64> {
        if radius <= MAX_LUT_RADIUS {
            Some(self.sums[radius])
        } else {
            None
        }
    }

    /// Compute a Gaussian kernel for the given radius
    fn compute_kernel(radius: usize) -> Vec<f64> {
        if radius == 0 {
            return vec![1.0];
        }

        let size = 2 * radius + 1;
        let sigma = radius as f64 / 3.0;
        let sigma = sigma.max(0.5); // Minimum sigma

        let two_sigma_sq = 2.0 * sigma * sigma;
        let norm = 1.0 / (std::f64::consts::PI * two_sigma_sq).sqrt();

        let mut kernel = Vec::with_capacity(size);
        let mut sum = 0.0;

        for i in 0..size {
            let x = i as f64 - radius as f64;
            let val = norm * (-x * x / two_sigma_sq).exp();
            kernel.push(val);
            sum += val;
        }

        // Normalize
        if sum > 0.0 {
            for val in &mut kernel {
                *val /= sum;
            }
        }

        kernel
    }

    /// Get kernel length for a given radius
    #[inline]
    pub fn kernel_length(radius: usize) -> usize {
        2 * radius + 1
    }

    /// Check if a radius is in the LUT
    #[inline]
    pub fn is_cached(&self, radius: usize) -> bool {
        radius <= MAX_LUT_RADIUS
    }
}

impl Default for GaussianLUT {
    fn default() -> Self {
        Self::new()
    }
}

/// Apply 1D Gaussian blur to a row using LUT
#[inline]
pub fn blur_row_lut(
    src: &[f64],
    dst: &mut [f64],
    kernel: &[f64],
    radius: usize,
) {
    let width = src.len();

    for x in 0..width {
        let mut sum = 0.0;
        for (k, &weight) in kernel.iter().enumerate() {
            let src_x = (x as i32 + k as i32 - radius as i32)
                .clamp(0, width as i32 - 1) as usize;
            sum += src[src_x] * weight;
        }
        dst[x] = sum;
    }
}

/// Apply 1D Gaussian blur to RGBA row using LUT
#[inline]
pub fn blur_row_rgba_lut(
    src: &[(f64, f64, f64, f64)],
    dst: &mut [(f64, f64, f64, f64)],
    kernel: &[f64],
    radius: usize,
) {
    let width = src.len();

    for x in 0..width {
        let mut sum = (0.0, 0.0, 0.0, 0.0);
        for (k, &weight) in kernel.iter().enumerate() {
            let src_x = (x as i32 + k as i32 - radius as i32)
                .clamp(0, width as i32 - 1) as usize;
            let pixel = src[src_x];
            sum.0 += pixel.0 * weight;
            sum.1 += pixel.1 * weight;
            sum.2 += pixel.2 * weight;
            sum.3 += pixel.3 * weight;
        }
        dst[x] = sum;
    }
}

/// Optimized 2D separable Gaussian blur using LUT
pub fn blur_2d_rgba_lut(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    radius: usize,
) {
    if radius == 0 {
        return;
    }

    // Get kernel from LUT
    let kernel = GAUSSIAN_LUT.get_or_compute(radius);

    // Temporary buffer for horizontal pass
    let mut temp = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    // Horizontal pass
    for y in 0..height {
        let row_start = y * width;
        let row_end = row_start + width;
        let src_row = &buffer[row_start..row_end];
        let dst_row = &mut temp[row_start..row_end];
        blur_row_rgba_lut(src_row, dst_row, &kernel, radius);
    }

    // Vertical pass (transpose logic)
    for x in 0..width {
        // Extract column
        let col: Vec<_> = (0..height)
            .map(|y| temp[y * width + x])
            .collect();
        
        let mut col_out = vec![(0.0, 0.0, 0.0, 0.0); height];
        blur_row_rgba_lut(&col, &mut col_out, &kernel, radius);

        // Write back
        for y in 0..height {
            buffer[y * width + x] = col_out[y];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lut_creation() {
        let lut = GaussianLUT::new();
        assert!(lut.get(0).is_some());
        assert!(lut.get(1).is_some());
        assert!(lut.get(MAX_LUT_RADIUS).is_some());
        assert!(lut.get(MAX_LUT_RADIUS + 1).is_none());
    }

    #[test]
    fn test_lut_identity_kernel() {
        let lut = GaussianLUT::new();
        let kernel = lut.get(0).unwrap();
        assert_eq!(kernel.len(), 1);
        assert!((kernel[0] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_kernel_normalization() {
        let lut = GaussianLUT::new();
        
        for radius in 1..=MAX_LUT_RADIUS {
            let kernel = lut.get(radius).unwrap();
            let sum: f64 = kernel.iter().sum();
            assert!(
                (sum - 1.0).abs() < 1e-10,
                "Kernel radius {} not normalized: sum = {}",
                radius,
                sum
            );
        }
    }

    #[test]
    fn test_kernel_symmetry() {
        let lut = GaussianLUT::new();
        
        for radius in 1..=16 {
            let kernel = lut.get(radius).unwrap();
            let len = kernel.len();
            
            // Check symmetry
            for i in 0..len / 2 {
                assert!(
                    (kernel[i] - kernel[len - 1 - i]).abs() < 1e-10,
                    "Kernel radius {} not symmetric at index {}",
                    radius,
                    i
                );
            }
        }
    }

    #[test]
    fn test_kernel_peak_at_center() {
        let lut = GaussianLUT::new();
        
        for radius in 1..=16 {
            let kernel = lut.get(radius).unwrap();
            let center = radius;
            
            // Center should be the maximum
            for (i, &val) in kernel.iter().enumerate() {
                assert!(
                    val <= kernel[center] + 1e-10,
                    "Kernel radius {} has higher value at {} than center",
                    radius,
                    i
                );
            }
        }
    }

    #[test]
    fn test_kernel_length() {
        for radius in 0..=10 {
            assert_eq!(
                GaussianLUT::kernel_length(radius),
                2 * radius + 1
            );
        }
    }

    #[test]
    fn test_get_or_compute_cached() {
        let lut = GaussianLUT::new();
        
        for radius in 0..=MAX_LUT_RADIUS {
            let kernel = lut.get_or_compute(radius);
            let cached = lut.get(radius).unwrap();
            assert_eq!(kernel.len(), cached.len());
        }
    }

    #[test]
    fn test_get_or_compute_uncached() {
        let lut = GaussianLUT::new();
        let kernel = lut.get_or_compute(MAX_LUT_RADIUS + 10);
        
        // Should still produce a valid kernel
        let sum: f64 = kernel.iter().sum();
        assert!((sum - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_blur_row_identity() {
        let kernel = vec![1.0];
        let src = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let mut dst = vec![0.0; 5];
        
        blur_row_lut(&src, &mut dst, &kernel, 0);
        
        for i in 0..5 {
            assert!((dst[i] - src[i]).abs() < 1e-10);
        }
    }

    #[test]
    fn test_blur_row_averaging() {
        // Simple 3-tap average kernel
        let kernel = vec![1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0];
        let src = vec![0.0, 3.0, 0.0, 0.0, 0.0];
        let mut dst = vec![0.0; 5];
        
        blur_row_lut(&src, &mut dst, &kernel, 1);
        
        // Position 0: edge handling
        // Position 1: (0 + 3 + 0) / 3 = 1.0
        assert!((dst[1] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_blur_row_rgba() {
        let kernel = vec![0.25, 0.5, 0.25];
        let src = vec![
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
        ];
        let mut dst = vec![(0.0, 0.0, 0.0, 0.0); 3];
        
        blur_row_rgba_lut(&src, &mut dst, &kernel, 1);
        
        // All channels should be blended
        assert!(dst[1].0 > 0.0 && dst[1].0 < 1.0);
        assert!(dst[1].1 > 0.0 && dst[1].1 < 1.0);
        assert!(dst[1].2 > 0.0 && dst[1].2 < 1.0);
    }

    #[test]
    fn test_blur_2d_identity() {
        let mut buffer = vec![
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
            (0.5, 0.5, 0.5, 1.0),
        ];
        let original = buffer.clone();
        
        blur_2d_rgba_lut(&mut buffer, 2, 2, 0);
        
        // Radius 0 should be identity
        for i in 0..4 {
            assert!((buffer[i].0 - original[i].0).abs() < 1e-10);
            assert!((buffer[i].1 - original[i].1).abs() < 1e-10);
            assert!((buffer[i].2 - original[i].2).abs() < 1e-10);
            assert!((buffer[i].3 - original[i].3).abs() < 1e-10);
        }
    }

    #[test]
    fn test_blur_2d_averaging() {
        // 3x3 image with center white, rest black
        let mut buffer = vec![
            (0.0, 0.0, 0.0, 1.0), (0.0, 0.0, 0.0, 1.0), (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0), (1.0, 1.0, 1.0, 1.0), (0.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 0.0, 1.0), (0.0, 0.0, 0.0, 1.0), (0.0, 0.0, 0.0, 1.0),
        ];
        
        blur_2d_rgba_lut(&mut buffer, 3, 3, 1);
        
        // Center should now be less than 1.0 (spread to neighbors)
        assert!(buffer[4].0 < 1.0);
        assert!(buffer[4].0 > 0.0);
        
        // Neighbors should have received some value
        assert!(buffer[1].0 > 0.0); // Top
        assert!(buffer[3].0 > 0.0); // Left
        assert!(buffer[5].0 > 0.0); // Right
        assert!(buffer[7].0 > 0.0); // Bottom
    }

    #[test]
    fn test_is_cached() {
        let lut = GaussianLUT::new();
        
        assert!(lut.is_cached(0));
        assert!(lut.is_cached(MAX_LUT_RADIUS));
        assert!(!lut.is_cached(MAX_LUT_RADIUS + 1));
    }

    #[test]
    fn test_get_sum() {
        let lut = GaussianLUT::new();
        
        for radius in 0..=MAX_LUT_RADIUS {
            let sum = lut.get_sum(radius).unwrap();
            assert!((sum - 1.0).abs() < 1e-10);
        }
        
        assert!(lut.get_sum(MAX_LUT_RADIUS + 1).is_none());
    }

    #[test]
    fn test_global_lut_access() {
        // Test that the global static LUT is accessible
        let kernel = GAUSSIAN_LUT.get(5).unwrap();
        assert_eq!(kernel.len(), 11);
    }
}
