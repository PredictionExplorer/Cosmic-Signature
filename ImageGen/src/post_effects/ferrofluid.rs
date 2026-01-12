//! Ferrofluid / Liquid Metal Effect
//!
//! Creates a dynamic metallic appearance with sharp spikes near high-energy regions
//! and smooth curves elsewhere. Inspired by ferrofluid responding to magnetic fields.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for ferrofluid effect
#[derive(Clone, Debug)]
pub struct FerrofluidConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Metallic reflection intensity
    pub metallic_intensity: f64,
    /// Spike sharpness (higher = sharper spikes near high gradients)
    pub spike_sharpness: f64,
    /// Base reflectivity of the "liquid metal"
    pub reflectivity: f64,
    /// Color tint for reflections (RGB)
    pub reflection_tint: [f64; 3],
    /// Amount of environment mapping simulation
    pub environment_intensity: f64,
}

impl Default for FerrofluidConfig {
    fn default() -> Self {
        Self {
            strength: 0.5,
            metallic_intensity: 0.7,
            spike_sharpness: 3.0,
            reflectivity: 0.6,
            reflection_tint: [0.95, 0.92, 0.88], // Slight warm silver
            environment_intensity: 0.3,
        }
    }
}

/// Ferrofluid liquid metal effect
pub struct Ferrofluid {
    config: FerrofluidConfig,
}

impl Ferrofluid {
    pub fn new(config: FerrofluidConfig) -> Self {
        Self { config }
    }

    /// Calculate metallic fresnel factor based on viewing angle
    #[inline]
    fn fresnel(cos_angle: f64, f0: f64) -> f64 {
        // Schlick's approximation
        f0 + (1.0 - f0) * (1.0 - cos_angle).powi(5)
    }

    /// Compute normal from gradient
    #[inline]
    fn gradient_to_normal(gx: f64, gy: f64) -> (f64, f64, f64) {
        // Treat gradient as surface normal perturbation
        let scale = 2.0;
        let nx = -gx * scale;
        let ny = -gy * scale;
        let nz = 1.0;
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        (nx / len, ny / len, nz / len)
    }

    /// Compute specular highlight
    #[inline]
    fn specular_highlight(normal: (f64, f64, f64), light_dir: (f64, f64, f64), shininess: f64) -> f64 {
        // Simplified specular using half-vector approximation
        let view_dir = (0.0, 0.0, 1.0); // Looking straight at screen
        let half_x = (light_dir.0 + view_dir.0) / 2.0;
        let half_y = (light_dir.1 + view_dir.1) / 2.0;
        let half_z = (light_dir.2 + view_dir.2) / 2.0;
        let half_len = (half_x * half_x + half_y * half_y + half_z * half_z).sqrt();
        let (hx, hy, hz) = (half_x / half_len, half_y / half_len, half_z / half_len);

        let n_dot_h = (normal.0 * hx + normal.1 * hy + normal.2 * hz).max(0.0);
        n_dot_h.powf(shininess)
    }
}

impl PostEffect for Ferrofluid {
    fn name(&self) -> &str {
        "Ferrofluid"
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

        // Calculate gradients
        let gradients = super::utils::calculate_gradients(input, width, height);

        // Light positions for metallic reflections
        let lights: [(f64, f64, f64); 3] = [
            (0.5, -0.5, 0.7),  // Upper right
            (-0.3, -0.3, 0.9), // Upper left
            (0.0, 0.5, 0.6),   // Lower center
        ];

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                // Un-premultiply
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Get gradient for this pixel
                let (gx, gy) = gradients[idx];
                let gradient_mag = (gx * gx + gy * gy).sqrt();

                // Compute surface normal from gradient
                let normal = Self::gradient_to_normal(gx, gy);

                // Calculate spike factor - higher gradient = sharper surface features
                let spike_factor = (gradient_mag * self.config.spike_sharpness).tanh();

                // Fresnel reflection (viewing angle approximated from normal z)
                let cos_view = normal.2.abs();
                let fresnel = Self::fresnel(cos_view, self.config.reflectivity);

                // Calculate specular from multiple lights
                let shininess = 20.0 + spike_factor * 80.0; // Sharper highlights on spikes
                let mut total_specular = 0.0;
                for &light in &lights {
                    // Normalize light direction
                    let len = (light.0 * light.0 + light.1 * light.1 + light.2 * light.2).sqrt();
                    let light_norm = (light.0 / len, light.1 / len, light.2 / len);
                    total_specular += Self::specular_highlight(normal, light_norm, shininess);
                }
                total_specular = (total_specular / lights.len() as f64).min(1.0);

                // Environment reflection simulation (based on normal direction)
                let env_r = 0.5 + normal.0 * 0.5;
                let env_g = 0.5 + normal.1 * 0.5;
                let env_b = 0.5 + normal.2 * 0.3;

                // Combine metallic components
                let metallic_r = self.config.reflection_tint[0]
                    * (fresnel * self.config.metallic_intensity + total_specular)
                    + env_r * self.config.environment_intensity;
                let metallic_g = self.config.reflection_tint[1]
                    * (fresnel * self.config.metallic_intensity + total_specular)
                    + env_g * self.config.environment_intensity;
                let metallic_b = self.config.reflection_tint[2]
                    * (fresnel * self.config.metallic_intensity + total_specular)
                    + env_b * self.config.environment_intensity;

                // Blend original with metallic
                let blend = self.config.strength * (0.3 + 0.7 * spike_factor);
                let final_r = sr + (metallic_r - sr) * blend;
                let final_g = sg + (metallic_g - sg) * blend;
                let final_b = sb + (metallic_b - sb) * blend;

                // Re-premultiply
                (
                    final_r.clamp(0.0, 2.0) * a,
                    final_g.clamp(0.0, 2.0) * a,
                    final_b.clamp(0.0, 2.0) * a,
                    a,
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
    fn test_ferrofluid_default_config() {
        let config = FerrofluidConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.metallic_intensity > 0.0);
    }

    #[test]
    fn test_fresnel_at_grazing() {
        // At grazing angles (cos_angle near 0), fresnel should approach 1
        let fresnel = Ferrofluid::fresnel(0.01, 0.5);
        assert!(fresnel > 0.9, "Fresnel at grazing angle should be high, got {}", fresnel);
    }

    #[test]
    fn test_fresnel_at_normal() {
        // At normal incidence, fresnel should equal f0
        let f0 = 0.5;
        let fresnel = Ferrofluid::fresnel(1.0, f0);
        assert!((fresnel - f0).abs() < 0.01);
    }

    #[test]
    fn test_gradient_to_normal() {
        // Zero gradient should give z-up normal
        let (nx, ny, nz) = Ferrofluid::gradient_to_normal(0.0, 0.0);
        assert!(nx.abs() < 0.01);
        assert!(ny.abs() < 0.01);
        assert!(nz > 0.99);
    }

    #[test]
    fn test_ferrofluid_preserves_transparent() {
        let effect = Ferrofluid::new(FerrofluidConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn test_ferrofluid_zero_strength() {
        let config = FerrofluidConfig { strength: 0.0, ..Default::default() };
        let effect = Ferrofluid::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }

    #[test]
    fn test_fresnel_monotonicity() {
        // Fresnel should decrease as cos_angle increases (more head-on)
        let f0 = 0.3;
        let angles = [0.1, 0.3, 0.5, 0.7, 0.9];
        let fresnels: Vec<f64> = angles.iter().map(|&a| Ferrofluid::fresnel(a, f0)).collect();
        
        for i in 1..fresnels.len() {
            assert!(
                fresnels[i] <= fresnels[i-1] + 0.001,
                "Fresnel should decrease: {} > {}",
                fresnels[i], fresnels[i-1]
            );
        }
    }

    #[test]
    fn test_fresnel_f0_bounds() {
        // Fresnel at any angle should be >= f0
        for f0 in [0.0, 0.2, 0.5, 0.8, 1.0] {
            for cos_angle in [0.1, 0.5, 1.0] {
                let fresnel = Ferrofluid::fresnel(cos_angle, f0);
                assert!(
                    fresnel >= f0 - 0.001,
                    "Fresnel {} should be >= f0 {} at cos_angle {}",
                    fresnel, f0, cos_angle
                );
            }
        }
    }

    #[test]
    fn test_normal_is_normalized() {
        let test_gradients = [
            (0.0, 0.0),
            (1.0, 0.0),
            (0.0, 1.0),
            (1.0, 1.0),
            (-0.5, 0.3),
            (2.0, -1.5),
        ];
        
        for (gx, gy) in test_gradients {
            let (nx, ny, nz) = Ferrofluid::gradient_to_normal(gx, gy);
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            assert!(
                (len - 1.0).abs() < 0.001,
                "Normal should be unit length: got {} for gradient ({}, {})",
                len, gx, gy
            );
        }
    }

    #[test]
    fn test_specular_highlight_range() {
        let normal = (0.0, 0.0, 1.0);
        let light = (0.0, -0.5, 0.866); // 30 degrees from vertical
        
        for shininess in [1.0, 10.0, 50.0, 100.0] {
            let spec = Ferrofluid::specular_highlight(normal, light, shininess);
            assert!(spec >= 0.0, "Specular should be non-negative");
            assert!(spec <= 1.0, "Specular should not exceed 1.0");
        }
    }

    #[test]
    fn test_ferrofluid_metallic_appearance() {
        let config = FerrofluidConfig {
            strength: 0.8,
            metallic_intensity: 0.9,
            ..Default::default()
        };
        let effect = Ferrofluid::new(config);
        
        // Create buffer with high contrast (to generate gradients)
        let mut input = vec![(0.0, 0.0, 0.0, 1.0); 25];
        // Add a bright spot in the center
        input[12] = (1.0, 1.0, 1.0, 1.0);
        
        let output = effect.process(&input, 5, 5).unwrap();
        
        // Pixels near the bright spot should have metallic highlights
        // Check that some pixels got brighter (specular)
        let max_brightness: f64 = output.iter()
            .map(|(r, g, b, _)| r + g + b)
            .fold(0.0, f64::max);
        
        assert!(max_brightness > 0.3, "Should have some bright metallic highlights");
    }
}
