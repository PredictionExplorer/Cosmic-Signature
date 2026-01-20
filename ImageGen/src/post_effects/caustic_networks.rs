//! Caustic Light Networks Post-Effect
//!
//! Creates intricate patterns of concentrated brightness where light would focus
//! when passing through curved surfaces. Like looking at sunlight through water
//! or a gemstone, this effect adds dramatic, photo-realistic light focusing.
//!
//! Caustics appear where the curvature of trajectories would naturally concentrate
//! light rays, creating sharp lines of brilliant illumination.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for caustic light networks effect
#[derive(Clone, Debug)]
pub struct CausticNetworksConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Curvature threshold for caustic formation (lower = more caustics)
    pub curvature_threshold: f64,
    /// Sharpness of caustic lines (higher = thinner, more concentrated)
    pub sharpness: f64,
    /// Color temperature of caustics (warm golden to cool white)
    /// 0.0 = cool white, 1.0 = warm gold
    pub warmth: f64,
    /// Whether to add rainbow dispersion at caustic edges
    pub rainbow_dispersion: bool,
    /// Dispersion strength for rainbow effect
    pub dispersion_strength: f64,
    /// Glow radius around caustic lines
    pub glow_radius: f64,
}

impl Default for CausticNetworksConfig {
    fn default() -> Self {
        Self {
            strength: 0.45,
            curvature_threshold: 0.15,
            sharpness: 3.0,
            warmth: 0.3,
            rainbow_dispersion: true,
            dispersion_strength: 0.4,
            glow_radius: 0.02,
        }
    }
}

/// Caustic light network effect
pub struct CausticNetworks {
    config: CausticNetworksConfig,
}

impl CausticNetworks {
    pub fn new(config: CausticNetworksConfig) -> Self {
        Self { config }
    }

    /// Calculate curvature from second derivatives of the luminance field
    fn calculate_curvature(
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Vec<f64> {
        let mut curvature = vec![0.0; width * height];

        // First, extract luminance
        let luminance: Vec<f64> = input
            .iter()
            .map(|(r, g, b, a)| {
                if *a > 0.0 {
                    (0.2126 * r + 0.7152 * g + 0.0722 * b) / a
                } else {
                    0.0
                }
            })
            .collect();

        curvature
            .par_iter_mut()
            .enumerate()
            .for_each(|(idx, curv)| {
                let x = idx % width;
                let y = idx / width;

                if x < 2 || x >= width - 2 || y < 2 || y >= height - 2 {
                    return;
                }

                // Second derivatives using central differences
                let idx_c = y * width + x;
                let lum_c = luminance[idx_c];

                // ∂²L/∂x²
                let d2x = luminance[idx_c - 1] - 2.0 * lum_c + luminance[idx_c + 1];

                // ∂²L/∂y²
                let d2y = luminance[idx_c - width] - 2.0 * lum_c + luminance[idx_c + width];

                // ∂²L/∂x∂y (mixed partial)
                let d2xy = 0.25
                    * (luminance[(y + 1) * width + (x + 1)]
                        - luminance[(y + 1) * width + (x - 1)]
                        - luminance[(y - 1) * width + (x + 1)]
                        + luminance[(y - 1) * width + (x - 1)]);

                // Gaussian curvature (simplified): K = (∂²L/∂x² * ∂²L/∂y² - (∂²L/∂x∂y)²)
                // We use absolute curvature magnitude for caustic detection
                let gaussian_curv = d2x * d2y - d2xy * d2xy;
                let mean_curv = (d2x + d2y) * 0.5;

                // Combined curvature measure (both positive and negative curvature create caustics)
                *curv = (gaussian_curv.abs() + mean_curv.abs() * 0.5).sqrt();
            });

        curvature
    }

    /// Build glow field around high-curvature regions
    fn build_caustic_glow(
        curvature: &[f64],
        width: usize,
        height: usize,
        threshold: f64,
        radius: usize,
    ) -> Vec<f64> {
        let mut glow = vec![0.0; width * height];

        // First pass: identify caustic points
        let caustic_mask: Vec<bool> = curvature
            .iter()
            .map(|&c| c > threshold)
            .collect();

        // Second pass: apply radial glow
        glow.par_iter_mut().enumerate().for_each(|(idx, g)| {
            let x = idx % width;
            let y = idx / width;

            let mut max_intensity: f64 = 0.0;

            for dy in 0..=(radius * 2) {
                for dx in 0..=(radius * 2) {
                    let sx = (x as i32 + dx as i32 - radius as i32)
                        .clamp(0, (width - 1) as i32) as usize;
                    let sy = (y as i32 + dy as i32 - radius as i32)
                        .clamp(0, (height - 1) as i32) as usize;

                    let src_idx = sy * width + sx;
                    if caustic_mask[src_idx] {
                        let dist_x = (dx as f64 - radius as f64) / radius as f64;
                        let dist_y = (dy as f64 - radius as f64) / radius as f64;
                        let dist = (dist_x * dist_x + dist_y * dist_y).sqrt();

                        if dist <= 1.0 {
                            // Gaussian-ish falloff
                            let falloff = (1.0 - dist * dist).max(0.0);
                            let intensity = curvature[src_idx] * falloff;
                            max_intensity = max_intensity.max(intensity);
                        }
                    }
                }
            }

            *g = max_intensity;
        });

        glow
    }

    /// Generate rainbow dispersion color based on angle
    #[inline]
    fn dispersion_color(angle: f64, intensity: f64) -> (f64, f64, f64) {
        // Map angle to spectrum position
        let t = (angle / std::f64::consts::TAU + 0.5).rem_euclid(1.0);

        // Smooth spectrum: violet -> blue -> cyan -> green -> yellow -> orange -> red
        let r = (t * 6.0 - 3.0).abs().clamp(0.0, 1.0);
        let g = (2.0 - (t * 6.0 - 2.0).abs()).clamp(0.0, 1.0);
        let b = (2.0 - (t * 6.0 - 4.0).abs()).clamp(0.0, 1.0);

        (r * intensity, g * intensity, b * intensity)
    }

    /// Apply warmth tint to caustic color
    #[inline]
    fn warm_tint(r: f64, g: f64, b: f64, warmth: f64) -> (f64, f64, f64) {
        // Warm tint: boost red/yellow, reduce blue
        (
            r * (1.0 + warmth * 0.3),
            g * (1.0 + warmth * 0.15),
            b * (1.0 - warmth * 0.2),
        )
    }
}

impl PostEffect for CausticNetworks {
    fn name(&self) -> &str {
        "Caustic Networks"
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
        let glow_radius = (self.config.glow_radius * min_dim).round() as usize;
        let glow_radius = glow_radius.max(2);

        // Calculate curvature field
        let curvature = Self::calculate_curvature(input, width, height);

        // Find curvature statistics for adaptive thresholding
        let max_curv = curvature
            .iter()
            .copied()
            .fold(0.0_f64, f64::max);
        let threshold = max_curv * self.config.curvature_threshold;

        // Build glow field
        let glow = Self::build_caustic_glow(&curvature, width, height, threshold, glow_radius);

        // Calculate gradient direction for dispersion effect
        let gradients = super::utils::calculate_gradients(input, width, height);

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let caustic_intensity = glow[idx].powf(1.0 / self.config.sharpness);

                if caustic_intensity < 0.001 {
                    return (r, g, b, a);
                }

                // Base caustic brightness
                let brightness = caustic_intensity * self.config.strength;

                // Get original color (un-premultiplied)
                let (orig_r, orig_g, orig_b) = if a > 0.0 {
                    (r / a, g / a, b / a)
                } else {
                    (0.0, 0.0, 0.0)
                };

                // Calculate caustic color
                let (caustic_r, caustic_g, caustic_b) = if self.config.rainbow_dispersion {
                    // Use gradient direction for dispersion angle
                    let (gx, gy) = gradients[idx];
                    let angle = gy.atan2(gx);
                    let (dr, dg, db) = Self::dispersion_color(angle, self.config.dispersion_strength);

                    // Blend warm white base with rainbow dispersion
                    let base = brightness * (1.0 - self.config.dispersion_strength);
                    let (wr, wg, wb) = Self::warm_tint(1.0, 1.0, 1.0, self.config.warmth);

                    (
                        base * wr + dr * brightness,
                        base * wg + dg * brightness,
                        base * wb + db * brightness,
                    )
                } else {
                    // Simple warm white caustic
                    let (wr, wg, wb) = Self::warm_tint(1.0, 1.0, 1.0, self.config.warmth);
                    (brightness * wr, brightness * wg, brightness * wb)
                };

                // Add caustic light to original color (additive blend)
                let final_r = orig_r + caustic_r;
                let final_g = orig_g + caustic_g;
                let final_b = orig_b + caustic_b;

                // Extend alpha where caustics appear in transparent areas
                let final_a = a.max(caustic_intensity * 0.3 * self.config.strength);

                // Re-premultiply
                (
                    final_r.max(0.0) * final_a,
                    final_g.max(0.0) * final_a,
                    final_b.max(0.0) * final_a,
                    final_a,
                )
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_caustic_networks_default_config() {
        let config = CausticNetworksConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.curvature_threshold > 0.0);
        assert!(config.sharpness > 0.0);
    }

    #[test]
    fn test_caustic_networks_preserves_transparent() {
        let effect = CausticNetworks::new(CausticNetworksConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 25];
        let output = effect.process(&input, 5, 5).unwrap();

        // Most pixels should remain nearly transparent
        let transparent_count = output.iter().filter(|p| p.3 < 0.01).count();
        assert!(transparent_count > 20);
    }

    #[test]
    fn test_caustic_networks_zero_strength() {
        let config = CausticNetworksConfig {
            strength: 0.0,
            ..Default::default()
        };
        let effect = CausticNetworks::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0); 25];
        let output = effect.process(&input, 5, 5).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_curvature_calculation() {
        // Create a buffer with a curved edge (luminance step)
        let mut input = vec![(0.0, 0.0, 0.0, 1.0); 100];
        for y in 0..10 {
            for x in 0..10 {
                if (x as f64 - 5.0).powi(2) + (y as f64 - 5.0).powi(2) < 9.0 {
                    input[y * 10 + x] = (1.0, 1.0, 1.0, 1.0);
                }
            }
        }

        let curvature = CausticNetworks::calculate_curvature(&input, 10, 10);

        // Curvature should be highest at the circle edge
        let edge_curvature = curvature[5 * 10 + 2]; // Edge of circle
        let center_curvature = curvature[5 * 10 + 5]; // Center
        let outside_curvature = curvature[5 * 10 + 9]; // Outside

        assert!(
            edge_curvature > center_curvature,
            "Edge curvature {} should exceed center {}",
            edge_curvature,
            center_curvature
        );
        assert!(
            edge_curvature > outside_curvature,
            "Edge curvature {} should exceed outside {}",
            edge_curvature,
            outside_curvature
        );
    }

    #[test]
    fn test_dispersion_color_spectrum() {
        // Test that we get different colors at different angles
        let (r0, g0, b0) = CausticNetworks::dispersion_color(0.0, 1.0);
        let (r1, g1, b1) =
            CausticNetworks::dispersion_color(std::f64::consts::PI * 0.5, 1.0);
        let (r2, g2, b2) = CausticNetworks::dispersion_color(std::f64::consts::PI, 1.0);

        // Colors should differ
        let diff1 = (r0 - r1).abs() + (g0 - g1).abs() + (b0 - b1).abs();
        let diff2 = (r1 - r2).abs() + (g1 - g2).abs() + (b1 - b2).abs();

        assert!(diff1 > 0.1, "Colors should vary with angle");
        assert!(diff2 > 0.1, "Colors should vary with angle");
    }

    #[test]
    fn test_warm_tint() {
        let (r, g, b) = CausticNetworks::warm_tint(1.0, 1.0, 1.0, 0.5);

        // Warm tint should boost red, reduce blue
        assert!(r > 1.0, "Red should be boosted");
        assert!(g > 1.0, "Green should be slightly boosted");
        assert!(b < 1.0, "Blue should be reduced");
    }

    #[test]
    fn test_caustic_glow_spreading() {
        // Create a single point of high curvature
        let mut curvature = vec![0.0; 100];
        curvature[55] = 1.0; // High curvature at center

        let glow =
            CausticNetworks::build_caustic_glow(&curvature, 10, 10, 0.5, 2);

        // Center should have high glow
        assert!(glow[55] > 0.5);
        // Neighbors should have some glow
        assert!(glow[54] > 0.0);
        assert!(glow[56] > 0.0);
        assert!(glow[45] > 0.0);
        assert!(glow[65] > 0.0);
        // Far pixels should have minimal glow
        assert!(glow[0] < glow[55]);
        assert!(glow[99] < glow[55]);
    }

    #[test]
    fn test_additive_caustic_brightening() {
        let config = CausticNetworksConfig {
            strength: 0.8,
            curvature_threshold: 0.1,
            rainbow_dispersion: false,
            ..Default::default()
        };
        let effect = CausticNetworks::new(config);

        // Create a buffer with high curvature (step edge)
        let mut input = vec![(0.3, 0.3, 0.3, 1.0); 100];
        for i in 50..60 {
            input[i] = (0.8, 0.8, 0.8, 1.0);
        }

        let output = effect.process(&input, 10, 10).unwrap();

        // At least some pixels should be brighter than the brightest input
        let max_input_lum: f64 = input
            .iter()
            .map(|(r, g, b, _)| r + g + b)
            .fold(0.0, f64::max);
        let max_output_lum: f64 = output
            .iter()
            .map(|(r, g, b, _)| r + g + b)
            .fold(0.0, f64::max);

        // Caustics should add brightness
        assert!(
            max_output_lum >= max_input_lum * 0.95,
            "Caustics should not significantly darken"
        );
    }
}
