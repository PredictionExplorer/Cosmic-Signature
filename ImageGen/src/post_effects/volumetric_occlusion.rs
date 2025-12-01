//! Volumetric occlusion effect for deep, atmospheric self-shadowing.
//!
//! This effect simulates light rays traversing a volumetric medium (the "density" of the orbit).
//! Denser/brighter areas cast shadows onto areas "behind" them relative to a virtual light source.
//! This adds massive 3D depth and spatial ambiguity to the otherwise flat render.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for volumetric occlusion
#[derive(Clone, Debug)]
pub struct VolumetricOcclusionConfig {
    /// Strength of the shadow effect (0.0-1.0)
    pub strength: f64,
    /// Number of steps for raymarching (quality vs performance)
    pub steps: usize,
    /// Scale of the density map (higher = more opaque objects)
    pub density_scale: f64,
    /// Angle of the light source in degrees
    pub light_angle: f64,
    /// Color of the shadow (usually dark, but can be tinted)
    pub shadow_color: (f64, f64, f64),
    /// Decay rate of the shadow (falloff)
    pub decay: f64,
    /// Luminance threshold for casting shadows
    pub shadow_threshold: f64,
}

impl Default for VolumetricOcclusionConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl VolumetricOcclusionConfig {
    pub fn special_mode() -> Self {
        Self {
            strength: 0.65,
            steps: 16,
            density_scale: 1.2,
            light_angle: 135.0,             // Top-left lighting default
            shadow_color: (0.0, 0.0, 0.05), // Very deep blue-black shadows
            decay: 0.85,
            shadow_threshold: 0.1,
        }
    }
}

pub struct VolumetricOcclusion {
    config: VolumetricOcclusionConfig,
    enabled: bool,
}

impl VolumetricOcclusion {
    pub fn new(config: VolumetricOcclusionConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Generate a single-channel density map from the input buffer.
    /// Uses luminance and alpha to estimate "thickness".
    fn generate_density_map(&self, input: &PixelBuffer) -> Vec<f64> {
        let threshold = self.config.shadow_threshold;
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                // Combine alpha coverage with luminance
                // Brighter areas are assumed to be "thicker" or "denser" light emitters
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if lum < threshold { 0.0 } else { (a * 0.5 + lum * 0.5).min(1.0) }
            })
            .collect()
    }
}

impl PostEffect for VolumetricOcclusion {
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

        // 1. Prepare density map
        let density_map = self.generate_density_map(input);

        // 2. Precompute light vector step
        let angle_rad = self.config.light_angle.to_radians();
        // We march TOWARDS the light to check for blockers.
        // If light comes from Top-Left (135 deg), we step in (-1, -1) direction.
        let step_len = (width.min(height) as f64 * 0.005).max(1.0); // Step size ~0.5% of screen
        let step_x = angle_rad.cos() * step_len;
        let step_y = angle_rad.sin() * step_len;

        let num_steps = self.config.steps;
        let shadow_strength = self.config.strength;
        let density_mult = self.config.density_scale;
        let shadow_r = self.config.shadow_color.0;
        let shadow_g = self.config.shadow_color.1;
        let shadow_b = self.config.shadow_color.2;
        let decay = self.config.decay;

        // 3. Raymarch shadows (Parallel)
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let px = (idx % width) as f64;
                let py = (idx / width) as f64;

                let mut occlusion = 0.0;
                let mut ray_x = px;
                let mut ray_y = py;
                let mut weight = 1.0;

                // March towards light source
                for _ in 0..num_steps {
                    ray_x += step_x;
                    ray_y += step_y;

                    // Boundary check
                    if ray_x < 0.0 || ray_x >= width as f64 || ray_y < 0.0 || ray_y >= height as f64
                    {
                        break;
                    }

                    // Sample density
                    let ix = ray_x as usize;
                    let iy = ray_y as usize;
                    let s_idx = iy * width + ix;

                    // Accumulate occlusion based on density of blocking pixels
                    // We decay the contribution with distance (weight)
                    let density = density_map[s_idx] * density_mult;
                    occlusion += density * weight;

                    weight *= decay; // Falloff

                    if occlusion >= 1.0 {
                        occlusion = 1.0;
                        break;
                    }
                }

                // Apply shadow
                // Occlusion 1.0 means fully shadowed.
                let shadow_factor = occlusion * shadow_strength;
                let lit_factor = (1.0 - shadow_factor).max(0.0);

                // Mix original color with shadow color based on lighting
                // If lit, use original. If shadowed, mix in shadow color.
                let final_r = r * lit_factor + shadow_r * shadow_factor * a; // Multiply by alpha to keep background clean
                let final_g = g * lit_factor + shadow_g * shadow_factor * a;
                let final_b = b * lit_factor + shadow_b * shadow_factor * a;

                (final_r, final_g, final_b, a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_buffer(w: usize, h: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); w * h]
    }

    #[test]
    fn test_volumetric_occlusion_basic() {
        let config = VolumetricOcclusionConfig::default();
        let occlusion = VolumetricOcclusion::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let result = occlusion.process(&buffer, 100, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_volumetric_occlusion_zero() {
        let config = VolumetricOcclusionConfig::default();
        let occlusion = VolumetricOcclusion::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let result = occlusion.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_volumetric_occlusion_hdr() {
        let config = VolumetricOcclusionConfig::default();
        let occlusion = VolumetricOcclusion::new(config);
        let buffer = test_buffer(50, 50, 5.0);

        let result = occlusion.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }
}
