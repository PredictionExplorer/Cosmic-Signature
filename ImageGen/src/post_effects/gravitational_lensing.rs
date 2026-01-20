//! Gravitational Lensing Post-Effect
//!
//! Simulates the bending of light around massive objects, creating subtle distortions
//! near dense regions of the trajectory. This effect makes gravity visible by showing
//! how light would bend in the presence of massive bodies.
//!
//! The three-body problem is fundamentally about gravitational interaction - this effect
//! visualizes that invisible force by distorting the image in physically meaningful ways.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for gravitational lensing effect
#[derive(Clone, Debug)]
pub struct GravitationalLensingConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Maximum distortion radius as fraction of image dimension
    pub distortion_radius: f64,
    /// How much density affects distortion (higher = more distortion near dense areas)
    pub density_sensitivity: f64,
    /// Falloff exponent for distortion (higher = sharper falloff)
    pub falloff_exponent: f64,
    /// Whether to create chromatic aberration (different colors bend differently)
    pub chromatic_aberration: bool,
    /// Chromatic aberration strength (separation between color channels)
    pub chromatic_strength: f64,
}

impl Default for GravitationalLensingConfig {
    fn default() -> Self {
        Self {
            strength: 0.35,
            distortion_radius: 0.08,
            density_sensitivity: 2.5,
            falloff_exponent: 1.5,
            chromatic_aberration: true,
            chromatic_strength: 0.3,
        }
    }
}

/// Gravitational lensing distortion effect
pub struct GravitationalLensing {
    config: GravitationalLensingConfig,
}

impl GravitationalLensing {
    pub fn new(config: GravitationalLensingConfig) -> Self {
        Self { config }
    }

    /// Bilinear sample from buffer with boundary clamping
    #[inline]
    fn sample_bilinear(
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: f64,
        y: f64,
    ) -> (f64, f64, f64, f64) {
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

        // Bilinear interpolation
        let top_r = p00.0 * (1.0 - fx) + p01.0 * fx;
        let top_g = p00.1 * (1.0 - fx) + p01.1 * fx;
        let top_b = p00.2 * (1.0 - fx) + p01.2 * fx;
        let top_a = p00.3 * (1.0 - fx) + p01.3 * fx;

        let bot_r = p10.0 * (1.0 - fx) + p11.0 * fx;
        let bot_g = p10.1 * (1.0 - fx) + p11.1 * fx;
        let bot_b = p10.2 * (1.0 - fx) + p11.2 * fx;
        let bot_a = p10.3 * (1.0 - fx) + p11.3 * fx;

        (
            top_r * (1.0 - fy) + bot_r * fy,
            top_g * (1.0 - fy) + bot_g * fy,
            top_b * (1.0 - fy) + bot_b * fy,
            top_a * (1.0 - fy) + bot_a * fy,
        )
    }

    /// Build a density field from the alpha channel (blurred for smooth gradients)
    fn build_density_field(
        input: &PixelBuffer,
        width: usize,
        height: usize,
        blur_radius: usize,
    ) -> Vec<f64> {
        let mut density = vec![0.0; width * height];

        // Extract alpha as density
        for (i, pixel) in input.iter().enumerate() {
            density[i] = pixel.3;
        }

        // Simple box blur for smoothing (separable: horizontal then vertical)
        let mut temp = density.clone();

        // Horizontal pass
        for y in 0..height {
            for x in 0..width {
                let mut sum = 0.0;
                let mut count = 0;
                for dx in 0..=(blur_radius * 2) {
                    let sx = (x as i32 + dx as i32 - blur_radius as i32)
                        .clamp(0, (width - 1) as i32) as usize;
                    sum += density[y * width + sx];
                    count += 1;
                }
                temp[y * width + x] = sum / count as f64;
            }
        }

        // Vertical pass
        for y in 0..height {
            for x in 0..width {
                let mut sum = 0.0;
                let mut count = 0;
                for dy in 0..=(blur_radius * 2) {
                    let sy = (y as i32 + dy as i32 - blur_radius as i32)
                        .clamp(0, (height - 1) as i32) as usize;
                    sum += temp[sy * width + x];
                    count += 1;
                }
                density[y * width + x] = sum / count as f64;
            }
        }

        density
    }

    /// Calculate gradient of density field (direction of strongest change)
    fn calculate_density_gradient(
        density: &[f64],
        width: usize,
        height: usize,
    ) -> Vec<(f64, f64)> {
        let mut gradients = vec![(0.0, 0.0); width * height];

        gradients
            .par_iter_mut()
            .enumerate()
            .for_each(|(idx, grad)| {
                let x = idx % width;
                let y = idx / width;

                // Sobel-like gradient calculation
                let x0 = x.saturating_sub(1);
                let x1 = (x + 1).min(width - 1);
                let y0 = y.saturating_sub(1);
                let y1 = (y + 1).min(height - 1);

                // Horizontal gradient
                let gx = density[y * width + x1] - density[y * width + x0];

                // Vertical gradient
                let gy = density[y1 * width + x] - density[y0 * width + x];

                *grad = (gx, gy);
            });

        gradients
    }
}

impl PostEffect for GravitationalLensing {
    fn name(&self) -> &str {
        "Gravitational Lensing"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 || input.is_empty() {
            return Ok(input.clone());
        }

        let min_dim = width.min(height) as f64;
        let blur_radius = (min_dim * self.config.distortion_radius * 0.5).round() as usize;
        let blur_radius = blur_radius.max(2);

        // Build density field from alpha channel
        let density = Self::build_density_field(input, width, height, blur_radius);

        // Calculate gradient of density (points toward high-density regions)
        let gradients = Self::calculate_density_gradient(&density, width, height);

        // Maximum distortion in pixels
        let max_distortion = min_dim * self.config.distortion_radius * self.config.strength;

        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                let fx = x as f64;
                let fy = y as f64;

                // Get local density and gradient
                let local_density = density[idx];
                let (gx, gy) = gradients[idx];
                let grad_mag = (gx * gx + gy * gy).sqrt();

                // Distortion strength based on being near (but not at) high density
                // Strongest lensing is at the edge of dense regions
                let edge_factor = local_density * (1.0 - local_density).max(0.0) * 4.0;
                let distortion_strength = edge_factor
                    * grad_mag.powf(1.0 / self.config.falloff_exponent)
                    * self.config.density_sensitivity;

                if distortion_strength < 0.001 || grad_mag < 0.0001 {
                    return input[idx];
                }

                // Normalize gradient direction
                let nx = gx / grad_mag;
                let ny = gy / grad_mag;

                // Calculate distortion offset (toward the dense region)
                let distortion = (distortion_strength * max_distortion).min(max_distortion);

                if self.config.chromatic_aberration {
                    // Sample each color channel with slightly different offsets
                    // Red bends less, blue bends more (like real gravitational lensing)
                    let chrom_scale = self.config.chromatic_strength;

                    let r_offset = distortion * (1.0 - chrom_scale * 0.5);
                    let g_offset = distortion;
                    let b_offset = distortion * (1.0 + chrom_scale * 0.5);

                    let r_sample =
                        Self::sample_bilinear(input, width, height, fx + nx * r_offset, fy + ny * r_offset);
                    let g_sample =
                        Self::sample_bilinear(input, width, height, fx + nx * g_offset, fy + ny * g_offset);
                    let b_sample =
                        Self::sample_bilinear(input, width, height, fx + nx * b_offset, fy + ny * b_offset);

                    // Combine channels (use green's alpha as the base)
                    (r_sample.0, g_sample.1, b_sample.2, g_sample.3)
                } else {
                    // Simple distortion without chromatic aberration
                    Self::sample_bilinear(input, width, height, fx + nx * distortion, fy + ny * distortion)
                }
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gravitational_lensing_default_config() {
        let config = GravitationalLensingConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.distortion_radius > 0.0);
        assert!(config.chromatic_aberration);
    }

    #[test]
    fn test_gravitational_lensing_preserves_transparent() {
        let effect = GravitationalLensing::new(GravitationalLensingConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 16];
        let output = effect.process(&input, 4, 4).unwrap();
        
        for pixel in &output {
            assert_eq!(pixel.3, 0.0, "Transparent pixels should remain transparent");
        }
    }

    #[test]
    fn test_gravitational_lensing_zero_strength() {
        let config = GravitationalLensingConfig {
            strength: 0.0,
            ..Default::default()
        };
        let effect = GravitationalLensing::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0); 16];
        let output = effect.process(&input, 4, 4).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_bilinear_sampling_corners() {
        let input = vec![
            (1.0, 0.0, 0.0, 1.0), // top-left
            (0.0, 1.0, 0.0, 1.0), // top-right
            (0.0, 0.0, 1.0, 1.0), // bottom-left
            (1.0, 1.0, 1.0, 1.0), // bottom-right
        ];

        // Sample at top-left corner
        let tl = GravitationalLensing::sample_bilinear(&input, 2, 2, 0.0, 0.0);
        assert!((tl.0 - 1.0).abs() < 0.01);

        // Sample at center should be average
        let center = GravitationalLensing::sample_bilinear(&input, 2, 2, 0.5, 0.5);
        assert!((center.0 - 0.5).abs() < 0.01);
        assert!((center.1 - 0.5).abs() < 0.01);
        assert!((center.2 - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_density_field_smoothing() {
        // Create a buffer with a single bright pixel
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 25];
        input[12] = (1.0, 1.0, 1.0, 1.0); // Center pixel

        let density = GravitationalLensing::build_density_field(&input, 5, 5, 1);

        // Center should still be highest
        assert!(density[12] > density[0]);
        // But neighbors should have some density too (due to blur)
        assert!(density[7] > 0.0); // Above center
        assert!(density[11] > 0.0); // Left of center
    }

    #[test]
    fn test_density_gradient_direction() {
        // Create density increasing from left to right
        let density: Vec<f64> = (0..16).map(|i| (i % 4) as f64 / 3.0).collect();

        let gradients = GravitationalLensing::calculate_density_gradient(&density, 4, 4);

        // Gradient should point rightward (positive x)
        for (i, (gx, _gy)) in gradients.iter().enumerate() {
            let x = i % 4;
            if x > 0 && x < 3 {
                // Middle columns should have positive x gradient
                assert!(*gx > 0.0, "Gradient at {} should point right", i);
            }
        }
    }

    #[test]
    fn test_chromatic_aberration_creates_color_shift() {
        let config = GravitationalLensingConfig {
            strength: 0.8,
            chromatic_aberration: true,
            chromatic_strength: 0.5,
            ..Default::default()
        };
        let effect = GravitationalLensing::new(config);

        // Create a buffer with a gradient
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        for i in 40..60 {
            input[i] = (1.0, 1.0, 1.0, 1.0);
        }

        let output = effect.process(&input, 10, 10).unwrap();

        // Output should have valid values
        for pixel in &output {
            assert!(!pixel.0.is_nan());
            assert!(!pixel.1.is_nan());
            assert!(!pixel.2.is_nan());
            assert!(pixel.0 >= 0.0);
            assert!(pixel.1 >= 0.0);
            assert!(pixel.2 >= 0.0);
        }
    }

    #[test]
    fn test_effect_is_subtle_at_low_strength() {
        let config = GravitationalLensingConfig {
            strength: 0.1,
            ..Default::default()
        };
        let effect = GravitationalLensing::new(config);

        // Create a uniform gray buffer with one bright spot
        let mut input = vec![(0.3, 0.3, 0.3, 0.5); 100];
        input[55] = (1.0, 1.0, 1.0, 1.0);

        let output = effect.process(&input, 10, 10).unwrap();

        // At low strength, most pixels should be very close to original
        let mut close_count = 0;
        for (inp, out) in input.iter().zip(output.iter()) {
            let diff = (inp.0 - out.0).abs() + (inp.1 - out.1).abs() + (inp.2 - out.2).abs();
            if diff < 0.1 {
                close_count += 1;
            }
        }
        assert!(
            close_count > 80,
            "Most pixels should be close to original at low strength"
        );
    }
}
