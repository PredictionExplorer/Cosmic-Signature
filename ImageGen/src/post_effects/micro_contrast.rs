//! Micro-contrast enhancement for improved detail clarity.
//!
//! This effect enhances local contrast at a small scale, making details "pop"
//! without over-sharpening or creating halos. Uses an edge-aware approach
//! to boost detail perception while preserving smooth gradients.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for micro-contrast enhancement
#[derive(Clone, Debug)]
pub struct MicroContrastConfig {
    /// Overall strength of the effect (0.0-1.0)
    pub strength: f64,
    /// Radius for local averaging (smaller = finer details enhanced)
    pub radius: usize,
    /// Edge protection threshold (prevents halo artifacts)
    pub edge_threshold: f64,
    /// Luminance weight for contrast boost
    pub luminance_weight: f64,
}

impl Default for MicroContrastConfig {
    fn default() -> Self {
        Self {
            strength: 0.35,
            radius: 2,
            edge_threshold: 0.12,
            luminance_weight: 0.7,
        }
    }
}

/// Micro-contrast enhancement post-effect
pub struct MicroContrast {
    config: MicroContrastConfig,
    enabled: bool,
}

impl MicroContrast {
    pub fn new(config: MicroContrastConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Calculate local average in neighborhood
    #[inline]
    fn local_average(
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: usize,
        y: usize,
        radius: usize,
    ) -> (f64, f64, f64, f64) {
        let mut sum_r = 0.0;
        let mut sum_g = 0.0;
        let mut sum_b = 0.0;
        let mut sum_a = 0.0;
        let mut count = 0;

        let x_min = x.saturating_sub(radius);
        let x_max = (x + radius).min(width - 1);
        let y_min = y.saturating_sub(radius);
        let y_max = (y + radius).min(height - 1);

        for ny in y_min..=y_max {
            for nx in x_min..=x_max {
                let idx = ny * width + nx;
                if idx < buffer.len() {
                    let (r, g, b, a) = buffer[idx];
                    sum_r += r;
                    sum_g += g;
                    sum_b += b;
                    sum_a += a;
                    count += 1;
                }
            }
        }

        if count > 0 {
            let inv_count = 1.0 / count as f64;
            (sum_r * inv_count, sum_g * inv_count, sum_b * inv_count, sum_a * inv_count)
        } else {
            (0.0, 0.0, 0.0, 0.0)
        }
    }

    /// Calculate luminance
    #[inline]
    fn luminance(r: f64, g: f64, b: f64) -> f64 {
        0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /// Detect if pixel is on an edge (to avoid halos)
    #[inline]
    fn is_edge(
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: usize,
        y: usize,
        threshold: f64,
    ) -> bool {
        if x == 0 || y == 0 || x >= width - 1 || y >= height - 1 {
            return false;
        }

        let idx = y * width + x;
        let center_lum = {
            let (r, g, b, a) = buffer[idx];
            if a > 0.0 {
                Self::luminance(r / a, g / a, b / a)
            } else {
                0.0
            }
        };

        // Check horizontal and vertical neighbors
        let neighbors = [
            (x.wrapping_sub(1), y),
            (x + 1, y),
            (x, y.wrapping_sub(1)),
            (x, y + 1),
        ];

        for (nx, ny) in neighbors {
            if nx < width && ny < height {
                let nidx = ny * width + nx;
                let (r, g, b, a) = buffer[nidx];
                if a > 0.0 {
                    let neighbor_lum = Self::luminance(r / a, g / a, b / a);
                    if (neighbor_lum - center_lum).abs() > threshold {
                        return true;
                    }
                }
            }
        }

        false
    }
}

impl PostEffect for MicroContrast {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        // First pass: calculate local averages (parallelized)
        let local_avgs: Vec<(f64, f64, f64, f64)> = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                Self::local_average(input, width, height, x, y, self.config.radius)
            })
            .collect();

        // Second pass: apply micro-contrast enhancement
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let x = idx % width;
                let y = idx / width;

                // Skip edges to avoid halos
                if Self::is_edge(input, width, height, x, y, self.config.edge_threshold) {
                    return (r, g, b, a);
                }

                // Get local average
                let (avg_r, avg_g, avg_b, _avg_a) = local_avgs[idx];

                // Convert to straight alpha
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;
                let avg_sr = if _avg_a > 0.0 { avg_r / _avg_a } else { avg_r };
                let avg_sg = if _avg_a > 0.0 { avg_g / _avg_a } else { avg_g };
                let avg_sb = if _avg_a > 0.0 { avg_b / _avg_a } else { avg_b };

                // Calculate difference from local average (local contrast)
                let diff_r = sr - avg_sr;
                let diff_g = sg - avg_sg;
                let diff_b = sb - avg_sb;

                // Calculate luminance difference
                let lum = Self::luminance(sr, sg, sb);
                let avg_lum = Self::luminance(avg_sr, avg_sg, avg_sb);
                let lum_diff = lum - avg_lum;

                // Blend RGB and luminance-based contrast
                let lum_weight = self.config.luminance_weight;
                let rgb_weight = 1.0 - lum_weight;

                // Enhanced differences
                let enhanced_r = diff_r * rgb_weight + lum_diff * lum_weight;
                let enhanced_g = diff_g * rgb_weight + lum_diff * lum_weight;
                let enhanced_b = diff_b * rgb_weight + lum_diff * lum_weight;

                // Apply enhancement with strength control
                let strength = self.config.strength;
                let final_r = sr + enhanced_r * strength;
                let final_g = sg + enhanced_g * strength;
                let final_b = sb + enhanced_b * strength;

                // Clamp to valid range
                let clamped_r = final_r.clamp(0.0, 1.2);
                let clamped_g = final_g.clamp(0.0, 1.2);
                let clamped_b = final_b.clamp(0.0, 1.2);

                // Convert back to premultiplied alpha
                (clamped_r * a, clamped_g * a, clamped_b * a, a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_micro_contrast_disabled() {
        let config = MicroContrastConfig {
            strength: 0.0,
            ..MicroContrastConfig::default()
        };
        let mc = MicroContrast::new(config);
        assert!(!mc.is_enabled());
    }

    #[test]
    fn test_micro_contrast_enabled() {
        let config = MicroContrastConfig::default();
        let mc = MicroContrast::new(config);
        assert!(mc.is_enabled());
    }

    #[test]
    fn test_luminance_calculation() {
        // Test pure white
        let lum = MicroContrast::luminance(1.0, 1.0, 1.0);
        assert!((lum - 1.0).abs() < 0.001);

        // Test pure black
        let lum = MicroContrast::luminance(0.0, 0.0, 0.0);
        assert!(lum < 0.001);

        // Test mid gray
        let lum = MicroContrast::luminance(0.5, 0.5, 0.5);
        assert!((lum - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_local_average() {
        // Create simple gradient buffer
        let buffer: PixelBuffer = (0..100)
            .map(|i| {
                let val = (i as f64 / 100.0) * 0.5;
                (val, val, val, 1.0)
            })
            .collect();

        let avg = MicroContrast::local_average(&buffer, 10, 10, 5, 5, 1);
        
        // Should be non-zero
        assert!(avg.0 > 0.0);
        assert!(avg.3 > 0.0); // Alpha should be averaged too
    }

    #[test]
    fn test_buffer_processing() {
        let config = MicroContrastConfig::default();
        let mc = MicroContrast::new(config);

        // Create test buffer with gradient
        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 0.5;
                (val, val, val, 1.0)
            })
            .collect();

        let result = mc.process(&buffer, 100, 100).unwrap();
        assert_eq!(result.len(), buffer.len());
    }
}

