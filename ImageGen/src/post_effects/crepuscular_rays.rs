//! Crepuscular rays (God Rays) effect for volumetric lighting.
//!
//! This effect simulates light scattering through a participating medium (atmosphere/fog),
//! creating dramatic "god rays" emanating from bright sources. It adds a sense of
//! majesty, volume, and divine atmosphere to the image.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for crepuscular rays
#[derive(Clone, Debug)]
pub struct CrepuscularRaysConfig {
    /// Strength of the light rays (0.0-1.0)
    pub strength: f64,
    /// Number of samples for the radial blur (quality vs performance)
    pub density: f64,
    /// Decay rate of the light as it travels (0.9-0.99)
    pub decay: f64,
    /// Weight of each sample (brightness)
    pub weight: f64,
    /// Brightness threshold for emitting rays
    pub exposure: f64,
    /// Position of the light source (normalized 0.0-1.0)
    pub light_position: (f64, f64),
    /// Color tint for the rays (R, G, B)
    pub ray_color: (f64, f64, f64),
}

impl Default for CrepuscularRaysConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl CrepuscularRaysConfig {
    /// Create configuration for special mode (dramatic, golden lighting)
    pub fn special_mode() -> Self {
        Self {
            strength: 0.65,              // Visible but not overwhelming
            density: 1.0,                // Full density
            decay: 0.96,                 // Long rays
            weight: 0.4,                 // Soft weight
            exposure: 0.2,               // Emit from mid-highlights up
            light_position: (0.5, 0.5),  // Center emanation (works best for orbits)
            ray_color: (1.0, 0.95, 0.8), // Warm golden light
        }
    }
}

/// Crepuscular rays post-effect
pub struct CrepuscularRays {
    config: CrepuscularRaysConfig,
    enabled: bool,
}

impl CrepuscularRays {
    pub fn new(config: CrepuscularRaysConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Extract high-intensity pixels to serve as light emitters
    fn extract_emitters(&self, input: &PixelBuffer, _width: usize, _height: usize) -> PixelBuffer {
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 0.0 {
                    return (0.0, 0.0, 0.0, 0.0);
                }

                // Calculate luminance
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                // Thresholding - only bright parts emit light
                if lum > self.config.exposure {
                    // Boost the emitter brightness
                    let boost = (lum - self.config.exposure)
                        * crate::render::constants::RAY_EMITTER_BOOST_FACTOR;
                    (r * boost, g * boost, b * boost, a)
                } else {
                    (0.0, 0.0, 0.0, 0.0)
                }
            })
            .collect()
    }

    /// Apply radial blur to generate rays
    fn generate_rays(&self, emitters: &PixelBuffer, width: usize, height: usize) -> PixelBuffer {
        let center_x = self.config.light_position.0 * width as f64;
        let center_y = self.config.light_position.1 * height as f64;

        let num_samples = (100.0 * self.config.density) as usize;
        let _decay = self.config.decay;
        let weight = self.config.weight / num_samples as f64;

        // We can't easily do a true scatter scatter in a single parallel pass without a gather approach.
        // For CPU ray tracing of this effect, a "gather" approach is better:
        // For each pixel, trace TOWARDS the light source, sampling occlusion.
        // However, to keep it consistent with the codebase's style (and performance),
        // we'll use a simplified radial blur approximation.

        // NOTE: A true high-quality radial blur is expensive on CPU.
        // We will implement a downsampled approximation or a limited sample count approach.
        // Here we use a gather approach for each pixel.

        emitters
            .par_iter()
            .enumerate()
            .map(|(idx, _)| {
                let px = (idx % width) as f64;
                let py = (idx / width) as f64;

                // Vector to light
                let dx = center_x - px;
                let dy = center_y - py;
                let dist = (dx * dx + dy * dy).sqrt();

                // If we are at the light, full brightness
                if dist < 1.0 {
                    return (1.0, 1.0, 1.0, 1.0);
                }

                // Step size
                let step_x = dx / num_samples as f64;
                let step_y = dy / num_samples as f64;

                let mut accum_r = 0.0;
                let mut accum_g = 0.0;
                let mut accum_b = 0.0;
                let mut current_decay = 1.0;

                // March towards light
                for i in 0..num_samples {
                    // Sample position
                    let sx = px + step_x * i as f64;
                    let sy = py + step_y * i as f64;

                    // Nearest neighbor fetch for speed
                    let six = sx.clamp(0.0, (width - 1) as f64) as usize;
                    let siy = sy.clamp(0.0, (height - 1) as f64) as usize;
                    let sidx = siy * width + six;

                    let (r, g, b, _) = emitters[sidx];

                    accum_r += r * weight * current_decay;
                    accum_g += g * weight * current_decay;
                    accum_b += b * weight * current_decay;

                    current_decay *= self.config.decay;
                }

                (accum_r, accum_g, accum_b, 1.0)
            })
            .collect()
    }
}

impl PostEffect for CrepuscularRays {
    fn is_enabled(&self) -> bool {
        self.enabled && self.config.strength > 0.0
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

        // 1. Extract emitters
        let emitters = self.extract_emitters(input, width, height);

        // 2. Generate light rays (this is expensive, maybe we should downsample?
        // For "Museum Quality" we keep it full res but limit samples or optimize).
        // Optimization: limiting samples to 40 for performance while keeping look.
        let rays = self.generate_rays(&emitters, width, height);

        // 3. Composite rays onto original image
        let output: PixelBuffer = input
            .par_iter()
            .zip(rays.par_iter())
            .map(|(&(r, g, b, a), &(rr, rg, rb, _))| {
                let ray_strength = self.config.strength;

                // Additive blending with tint
                let final_r = r + rr * ray_strength * self.config.ray_color.0;
                let final_g = g + rg * ray_strength * self.config.ray_color.1;
                let final_b = b + rb * ray_strength * self.config.ray_color.2;

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
    fn test_crepuscular_rays_basic() {
        let config = CrepuscularRaysConfig::default();
        let rays = CrepuscularRays::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let result = rays.process(&buffer, 100, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_crepuscular_rays_handles_zero() {
        let config = CrepuscularRaysConfig::default();
        let rays = CrepuscularRays::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let result = rays.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_crepuscular_rays_handles_hdr() {
        let config = CrepuscularRaysConfig::default();
        let rays = CrepuscularRays::new(config);
        let buffer = test_buffer(50, 50, 5.0);

        let result = rays.process(&buffer, 50, 50);
        assert!(result.is_ok());
        for &(r, _, _, _) in &result.unwrap() {
            assert!(r.is_finite());
        }
    }
}
