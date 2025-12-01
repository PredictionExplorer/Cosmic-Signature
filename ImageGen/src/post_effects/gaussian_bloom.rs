//! Gaussian blur-based bloom effect implementation.

use super::{PixelBuffer, PostEffect};
use crate::render::parallel_blur_2d_rgba;
use rayon::prelude::*;
use std::error::Error;

/// Gaussian bloom post-processing effect.
///
/// Applies a Gaussian blur to create a soft glow effect, then composites
/// it with the original image using screen blending.
pub struct GaussianBloom {
    /// Blur radius in pixels.
    pub radius: usize,

    /// Strength of the bloom effect (multiplier for blurred component).
    pub strength: f64,

    /// Brightness multiplier for the core (unblurred) image.
    pub core_brightness: f64,

    /// Whether this effect is enabled.
    pub enabled: bool,
}

impl GaussianBloom {
    /// Creates `a` new Gaussian bloom effect with the given parameters.
    pub fn new(radius: usize, strength: f64, core_brightness: f64) -> Self {
        Self { radius, strength, core_brightness, enabled: true }
    }
}

impl PostEffect for GaussianBloom {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.radius == 0 {
            // No blur, just apply core brightness
            let mut output = Vec::with_capacity(input.len());
            output.par_extend(input.par_iter().map(|&(r, g, b, a)| {
                (
                    r * self.core_brightness,
                    g * self.core_brightness,
                    b * self.core_brightness,
                    a * self.core_brightness,
                )
            }));
            return Ok(output);
        }

        // Create blurred version
        let mut blurred = input.clone();
        parallel_blur_2d_rgba(&mut blurred, width, height, self.radius);

        // Composite using screen blend: C = A + B - A*B
        let mut output = Vec::with_capacity(input.len());
        output.par_extend(input.par_iter().zip(blurred.par_iter()).map(
            |(&(cr, cg, cb, ca), &(br, bg, bb, ba))| {
                // Base image with core brightness
                let base_r = cr * self.core_brightness;
                let base_g = cg * self.core_brightness;
                let base_b = cb * self.core_brightness;
                let base_a = ca * self.core_brightness;

                // Bloom from blur pass
                let bloom_r = br * self.strength;
                let bloom_g = bg * self.strength;
                let bloom_b = bb * self.strength;
                let bloom_a = ba * self.strength;

                // Screen blend approximation: C = A + B - A*B
                let out_r = (base_r + bloom_r - base_r * bloom_r).max(0.0);
                let out_g = (base_g + bloom_g - base_g * bloom_g).max(0.0);
                let out_b = (base_b + bloom_b - base_b * bloom_b).max(0.0);
                let out_a = base_a + bloom_a;

                (out_r, out_g, out_b, out_a)
            },
        ));

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
    fn test_gaussian_bloom_basic() {
        let bloom = GaussianBloom::new(5, 0.5, 1.0);
        let buffer = test_buffer(100, 100, 0.5);

        let result = bloom.process(&buffer, 100, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_gaussian_bloom_zero_radius() {
        let bloom = GaussianBloom::new(0, 0.5, 1.0);
        let buffer = test_buffer(50, 50, 0.5);

        let result = bloom.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_gaussian_bloom_handles_zero() {
        let bloom = GaussianBloom::new(5, 0.5, 1.0);
        let buffer = test_buffer(50, 50, 0.0);

        let result = bloom.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }
}
