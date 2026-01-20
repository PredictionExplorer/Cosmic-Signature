//! Nebula Tendrils Post-Effect
//!
//! Creates wispy, volumetric extensions emanating from the trajectories,
//! reminiscent of interstellar nebulae and star-forming regions.
//!
//! Nebulae are vast clouds of gas and dust where stars are born, and they
//! exhibit beautiful, organic tendrils shaped by stellar winds and radiation.
//! This effect adds atmospheric depth and cosmic grandeur to the three-body
//! visualization.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for nebula tendrils effect
#[derive(Clone, Debug)]
pub struct NebulaConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Tendril reach as fraction of image dimension
    pub tendril_reach: f64,
    /// Number of noise octaves (more = finer detail)
    pub octaves: usize,
    /// Noise persistence (amplitude falloff per octave)
    pub persistence: f64,
    /// Base noise scale
    pub noise_scale: f64,
    /// Color hue variation
    pub hue_variation: f64,
    /// Whether to follow gradient direction
    pub follow_gradient: bool,
    /// Dust opacity (lower = more transparent wisps)
    pub dust_opacity: f64,
    /// Emission glow intensity
    pub emission_intensity: f64,
    /// Color temperature (0 = cool blue/cyan, 1 = warm pink/orange)
    pub color_temperature: f64,
}

impl Default for NebulaConfig {
    fn default() -> Self {
        Self {
            strength: 0.35,
            tendril_reach: 0.15,
            octaves: 4,
            persistence: 0.5,
            noise_scale: 3.0,
            hue_variation: 0.3,
            follow_gradient: true,
            dust_opacity: 0.6,
            emission_intensity: 0.4,
            color_temperature: 0.4,
        }
    }
}

/// Nebula tendril effect
pub struct Nebula {
    config: NebulaConfig,
}

impl Nebula {
    pub fn new(config: NebulaConfig) -> Self {
        Self { config }
    }

    /// Simple hash-based noise (deterministic, no external dependencies)
    #[inline]
    fn hash_noise(x: f64, y: f64, seed: u32) -> f64 {
        let xi = (x.floor() as i32) as u32;
        let yi = (y.floor() as i32) as u32;

        let n = xi
            .wrapping_mul(374761393)
            .wrapping_add(yi.wrapping_mul(668265263))
            .wrapping_add(seed.wrapping_mul(1013904223));
        let n = n ^ (n >> 13);
        let n = n.wrapping_mul(1274126177);
        let n = n ^ (n >> 16);

        (n as f64) / (u32::MAX as f64)
    }

    /// Smooth interpolation
    #[inline]
    fn smoothstep(t: f64) -> f64 {
        t * t * (3.0 - 2.0 * t)
    }

    /// 2D value noise with smooth interpolation
    fn value_noise(x: f64, y: f64, seed: u32) -> f64 {
        let xi = x.floor();
        let yi = y.floor();
        let xf = x - xi;
        let yf = y - yi;

        // Get corner values
        let v00 = Self::hash_noise(xi, yi, seed);
        let v10 = Self::hash_noise(xi + 1.0, yi, seed);
        let v01 = Self::hash_noise(xi, yi + 1.0, seed);
        let v11 = Self::hash_noise(xi + 1.0, yi + 1.0, seed);

        // Smooth interpolation
        let sx = Self::smoothstep(xf);
        let sy = Self::smoothstep(yf);

        let n0 = v00 * (1.0 - sx) + v10 * sx;
        let n1 = v01 * (1.0 - sx) + v11 * sx;

        n0 * (1.0 - sy) + n1 * sy
    }

    /// Fractal Brownian Motion (fBm) noise
    fn fbm_noise(x: f64, y: f64, octaves: usize, persistence: f64, seed: u32) -> f64 {
        let mut total = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = 1.0;
        let mut max_value = 0.0;

        for i in 0..octaves {
            total += Self::value_noise(x * frequency, y * frequency, seed.wrapping_add(i as u32))
                * amplitude;
            max_value += amplitude;
            amplitude *= persistence;
            frequency *= 2.0;
        }

        total / max_value
    }

    /// Domain-warped noise for more organic patterns
    fn warped_noise(x: f64, y: f64, config: &NebulaConfig) -> f64 {
        let scale = config.noise_scale;

        // First layer of noise for warping
        let warp_x = Self::fbm_noise(x * scale, y * scale, 2, 0.5, 12345) - 0.5;
        let warp_y = Self::fbm_noise(x * scale + 5.3, y * scale + 1.7, 2, 0.5, 67890) - 0.5;

        // Apply warping
        let warped_x = x + warp_x * 0.3;
        let warped_y = y + warp_y * 0.3;

        // Main noise with warped coordinates
        Self::fbm_noise(
            warped_x * scale,
            warped_y * scale,
            config.octaves,
            config.persistence,
            11111,
        )
    }

    /// Nebula color based on noise value and temperature setting
    fn nebula_color(noise: f64, temperature: f64, intensity: f64) -> (f64, f64, f64) {
        // Base colors based on temperature
        // Cool: cyan, blue, purple
        // Warm: pink, orange, gold

        let cool_r = 0.3 + noise * 0.2;
        let cool_g = 0.5 + noise * 0.3;
        let cool_b = 0.8 + noise * 0.2;

        let warm_r = 0.9 - noise * 0.2;
        let warm_g = 0.4 + noise * 0.3;
        let warm_b = 0.5 - noise * 0.2;

        // Interpolate based on temperature
        let r = cool_r * (1.0 - temperature) + warm_r * temperature;
        let g = cool_g * (1.0 - temperature) + warm_g * temperature;
        let b = cool_b * (1.0 - temperature) + warm_b * temperature;

        (r * intensity, g * intensity, b * intensity)
    }

    /// Build density field from alpha channel with blur
    fn build_density_field(
        input: &PixelBuffer,
        width: usize,
        height: usize,
        blur_radius: usize,
    ) -> Vec<f64> {
        let mut density: Vec<f64> = input.iter().map(|p| p.3).collect();

        // Simple separable box blur
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
}

impl PostEffect for Nebula {
    fn name(&self) -> &str {
        "Nebula Tendrils"
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
        let reach_px = (self.config.tendril_reach * min_dim).round() as usize;
        let blur_radius = (reach_px / 4).max(2);

        // Build density field (blurred alpha channel)
        let density = Self::build_density_field(input, width, height, blur_radius);

        // Calculate gradients for direction-following
        let gradients = super::utils::calculate_gradients(input, width, height);

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let x = idx % width;
                let y = idx / width;
                let fx = x as f64;
                let fy = y as f64;

                // Normalized coordinates
                let nx = fx / min_dim;
                let ny = fy / min_dim;

                // Get local density and gradient
                let local_density = density[idx];
                let (gx, gy) = gradients[idx];
                let grad_mag = (gx * gx + gy * gy).sqrt();

                // Direction offset for warping (follow gradient or use noise)
                let (offset_x, offset_y) = if self.config.follow_gradient && grad_mag > 0.001 {
                    let noise_amt = Self::value_noise(nx * 5.0, ny * 5.0, 99999) * 0.3;
                    (
                        gx / grad_mag * 0.1 + noise_amt,
                        gy / grad_mag * 0.1 + noise_amt,
                    )
                } else {
                    (0.0, 0.0)
                };

                // Calculate nebula noise at this position
                let noise = Self::warped_noise(nx + offset_x, ny + offset_y, &self.config);

                // Nebula intensity: strongest near (but not at) trajectory
                // Creates a halo effect around the main trajectories
                let edge_factor = local_density * (1.0 - local_density * 0.5) * 4.0;
                let hue_shift = Self::value_noise(nx * 3.0, ny * 3.0, 77777) * self.config.hue_variation;
                let local_temp = self.config.color_temperature + hue_shift;

                // Get nebula color
                let (nebula_r, nebula_g, nebula_b) = Self::nebula_color(
                    noise,
                    local_temp.clamp(0.0, 1.0),
                    self.config.emission_intensity,
                );

                // Dust layer (darker, absorbing)
                let dust = (1.0 - noise) * 0.3 * self.config.dust_opacity;

                // Combined nebula intensity
                let nebula_intensity = edge_factor * noise * self.config.strength;

                if nebula_intensity < 0.001 && dust < 0.001 {
                    return (r, g, b, a);
                }

                // Un-premultiply original
                let (orig_r, orig_g, orig_b) = if a > 0.0 {
                    (r / a, g / a, b / a)
                } else {
                    (0.0, 0.0, 0.0)
                };

                // Apply dust absorption (darkening)
                let dust_r = orig_r * (1.0 - dust * edge_factor);
                let dust_g = orig_g * (1.0 - dust * edge_factor);
                let dust_b = orig_b * (1.0 - dust * edge_factor);

                // Add emission (additive blending)
                let final_r = dust_r + nebula_r * nebula_intensity;
                let final_g = dust_g + nebula_g * nebula_intensity;
                let final_b = dust_b + nebula_b * nebula_intensity;

                // Extend alpha where nebula is visible
                let nebula_alpha = nebula_intensity * 0.4;
                let final_a = a.max(nebula_alpha);

                // Re-premultiply
                (
                    final_r.clamp(0.0, 1.5) * final_a,
                    final_g.clamp(0.0, 1.5) * final_a,
                    final_b.clamp(0.0, 1.5) * final_a,
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
    fn test_nebula_default_config() {
        let config = NebulaConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.octaves > 0);
        assert!(config.tendril_reach > 0.0);
    }

    #[test]
    fn test_nebula_preserves_mostly_transparent() {
        let effect = Nebula::new(NebulaConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        let output = effect.process(&input, 10, 10).unwrap();

        // Most pixels should remain transparent or near-transparent
        let mostly_transparent = output.iter().filter(|p| p.3 < 0.1).count();
        assert!(mostly_transparent > 90);
    }

    #[test]
    fn test_nebula_zero_strength() {
        let config = NebulaConfig {
            strength: 0.0,
            ..Default::default()
        };
        let effect = Nebula::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0); 100];
        let output = effect.process(&input, 10, 10).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_hash_noise_range() {
        for i in 0..20 {
            for j in 0..20 {
                let noise = Nebula::hash_noise(i as f64, j as f64, 12345);
                assert!(
                    noise >= 0.0 && noise <= 1.0,
                    "Noise {} out of range at ({}, {})",
                    noise,
                    i,
                    j
                );
            }
        }
    }

    #[test]
    fn test_hash_noise_determinism() {
        let n1 = Nebula::hash_noise(5.5, 7.3, 99999);
        let n2 = Nebula::hash_noise(5.5, 7.3, 99999);
        assert_eq!(n1, n2, "Noise should be deterministic");
    }

    #[test]
    fn test_value_noise_range() {
        for i in 0..20 {
            let x = i as f64 * 0.3;
            let y = i as f64 * 0.7 + 0.5;
            let noise = Nebula::value_noise(x, y, 12345);
            assert!(
                noise >= 0.0 && noise <= 1.0,
                "Value noise {} out of range",
                noise
            );
        }
    }

    #[test]
    fn test_value_noise_smoothness() {
        // Adjacent points should have similar values (smooth)
        let n1 = Nebula::value_noise(5.0, 5.0, 12345);
        let n2 = Nebula::value_noise(5.01, 5.0, 12345);
        let diff = (n1 - n2).abs();

        assert!(
            diff < 0.2,
            "Noise should be smooth: diff {} too large",
            diff
        );
    }

    #[test]
    fn test_fbm_noise_range() {
        let config = NebulaConfig::default();
        for i in 0..20 {
            let x = i as f64 * 0.5;
            let y = i as f64 * 0.3;
            let noise = Nebula::fbm_noise(x, y, config.octaves, config.persistence, 12345);
            assert!(
                noise >= 0.0 && noise <= 1.0,
                "fBm noise {} out of range",
                noise
            );
        }
    }

    #[test]
    fn test_warped_noise_range() {
        let config = NebulaConfig::default();
        for i in 0..20 {
            let x = i as f64 * 0.1;
            let y = i as f64 * 0.15;
            let noise = Nebula::warped_noise(x, y, &config);
            assert!(
                noise >= 0.0 && noise <= 1.0,
                "Warped noise {} out of range",
                noise
            );
        }
    }

    #[test]
    fn test_nebula_color_cool() {
        let (r, _g, b) = Nebula::nebula_color(0.5, 0.0, 1.0); // Cool temperature

        // Cool nebula should have more blue
        assert!(b > r, "Cool nebula should be blue-dominant");
    }

    #[test]
    fn test_nebula_color_warm() {
        let (r, _g, b) = Nebula::nebula_color(0.5, 1.0, 1.0); // Warm temperature

        // Warm nebula should have more red/pink
        assert!(r > b, "Warm nebula should be red-dominant");
    }

    #[test]
    fn test_smoothstep_bounds() {
        assert!((Nebula::smoothstep(0.0) - 0.0).abs() < 0.001);
        assert!((Nebula::smoothstep(1.0) - 1.0).abs() < 0.001);
        assert!((Nebula::smoothstep(0.5) - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_smoothstep_monotonic() {
        let mut prev = Nebula::smoothstep(0.0);
        for i in 1..=10 {
            let t = i as f64 / 10.0;
            let curr = Nebula::smoothstep(t);
            assert!(
                curr >= prev,
                "Smoothstep should be monotonic: {} < {}",
                curr,
                prev
            );
            prev = curr;
        }
    }

    #[test]
    fn test_nebula_adds_atmosphere() {
        let config = NebulaConfig {
            strength: 0.8,
            emission_intensity: 0.6,
            ..Default::default()
        };
        let effect = Nebula::new(config);

        // Create a buffer with a trajectory
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        for i in 40..60 {
            input[i] = (0.8, 0.8, 0.8, 1.0);
        }

        let output = effect.process(&input, 10, 10).unwrap();

        // Should have some colored emission
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
    fn test_density_field_building() {
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        input[55] = (1.0, 1.0, 1.0, 1.0);

        let density = Nebula::build_density_field(&input, 10, 10, 2);

        // Center should have density
        assert!(density[55] > 0.0);
        // Neighbors should have some density due to blur
        assert!(density[45] > 0.0 || density[54] > 0.0 || density[65] > 0.0);
        // Corners should have less density
        assert!(density[0] < density[55]);
    }
}
