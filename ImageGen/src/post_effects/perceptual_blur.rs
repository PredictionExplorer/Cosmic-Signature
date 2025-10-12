//! Perceptual blur post-processing effect using OKLab color space.
//!
//! This effect performs blur operations in the perceptually uniform OKLab color space,
//! resulting in more natural and vibrant color mixing compared to RGB blur.

use super::{PixelBuffer, PostEffect};
use crate::oklab::{self, GamutMapMode};
use crate::render::parallel_blur_2d_rgba;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for perceptual blur effect.
#[derive(Debug, Clone)]
pub struct PerceptualBlurConfig {
    /// Blur radius in pixels
    pub radius: usize,

    /// Strength of the effect (0.0 = no effect, 1.0 = full effect)
    pub strength: f64,

    /// Gamut mapping strategy for out-of-gamut colors
    pub gamut_mode: GamutMapMode,
}

impl Default for PerceptualBlurConfig {
    fn default() -> Self {
        // Default for ~1080p resolution
        Self::from_resolution(1920, 1080)
    }
}

impl PerceptualBlurConfig {
    /// Create configuration scaled for the given resolution.
    /// This ensures the effect looks consistent across different resolutions.
    pub fn from_resolution(width: usize, height: usize) -> Self {
        let min_dim = width.min(height) as f64;
        Self {
            // Scale radius: 10px @ 1080p, 20px @ 4K
            radius: (0.0093 * min_dim).round() as usize,
            strength: 0.5,
            gamut_mode: GamutMapMode::default(),
        }
    }
}

/// Perceptual blur post-processing effect.
///
/// This effect converts the image to OKLab color space before applying blur,
/// then converts back to RGB. This produces more vibrant and natural-looking
/// blur halos, especially when mixing complementary colors.
pub struct PerceptualBlur {
    pub config: PerceptualBlurConfig,
    pub enabled: bool,
}

impl PerceptualBlur {
    /// Creates a new perceptual blur effect with the given configuration.
    pub fn new(config: PerceptualBlurConfig) -> Self {
        Self { config, enabled: true }
    }
}

impl PostEffect for PerceptualBlur {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        // Early exit if effect is disabled or has no strength
        if !self.enabled || self.config.strength <= 0.0 || self.config.radius == 0 {
            return Ok(input.clone());
        }

        // Step 1: Handle premultiplied alpha and convert to OKLab
        // Since our pipeline uses premultiplied alpha, we need to unpremultiply before color conversion
        let unpremultiplied: Vec<(f64, f64, f64, f64)> = input
            .par_iter()
            .map(|&(r_pre, g_pre, b_pre, alpha)| {
                if alpha > 1e-10 {
                    // Unpremultiply
                    (r_pre / alpha, g_pre / alpha, b_pre / alpha, alpha)
                } else {
                    // Transparent pixel
                    (0.0, 0.0, 0.0, 0.0)
                }
            })
            .collect();

        // Convert to OKLab using batch function
        let oklab_buffer = oklab::linear_srgb_to_oklab_batch(&unpremultiplied);

        // Step 2: Apply blur in OKLab space
        // Note: We blur the premultiplied OKLab values to maintain proper alpha compositing
        let mut blurred_oklab = oklab_buffer.clone();

        // Premultiply OKLab values for blur
        blurred_oklab.par_iter_mut().for_each(|pixel| {
            pixel.0 *= pixel.3; // L * alpha
            pixel.1 *= pixel.3; // a * alpha
            pixel.2 *= pixel.3; // b * alpha
            // alpha remains unchanged
        });

        // Apply the blur
        parallel_blur_2d_rgba(&mut blurred_oklab, width, height, self.config.radius);

        // Unpremultiply after blur
        blurred_oklab.par_iter_mut().for_each(|pixel| {
            if pixel.3 > 1e-10 {
                pixel.0 /= pixel.3;
                pixel.1 /= pixel.3;
                pixel.2 /= pixel.3;
            }
        });

        // Step 3: Convert back to RGB with gamut mapping
        let blurred_rgb_straight = oklab::oklab_to_linear_srgb_batch(&blurred_oklab);

        // Apply gamut mapping and re-premultiply
        let blurred_rgb: Vec<(f64, f64, f64, f64)> = blurred_rgb_straight
            .par_iter()
            .map(|&(r, g, b, alpha)| {
                if alpha > 1e-10 {
                    // Apply gamut mapping
                    let (r_mapped, g_mapped, b_mapped) =
                        self.config.gamut_mode.map_to_gamut(r, g, b);

                    // Re-premultiply for our pipeline
                    (r_mapped * alpha, g_mapped * alpha, b_mapped * alpha, alpha)
                } else {
                    (0.0, 0.0, 0.0, 0.0)
                }
            })
            .collect();

        // Step 4: Blend with original based on strength
        if self.config.strength >= 1.0 {
            // Full strength - return blurred directly
            Ok(blurred_rgb)
        } else {
            // Partial strength - blend with original
            let output: Vec<(f64, f64, f64, f64)> = input
                .par_iter()
                .zip(blurred_rgb.par_iter())
                .map(|(&orig, &blur)| {
                    let strength = self.config.strength;
                    (
                        orig.0 + (blur.0 - orig.0) * strength,
                        orig.1 + (blur.1 - orig.1) * strength,
                        orig.2 + (blur.2 - orig.2) * strength,
                        orig.3, // Alpha unchanged
                    )
                })
                .collect();
            Ok(output)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perceptual_blur_creation() {
        let config = PerceptualBlurConfig::default();
        let blur = PerceptualBlur::new(config.clone());

        assert!(blur.is_enabled());
        assert_eq!(blur.config.radius, 10);
        assert_eq!(blur.config.strength, 0.5);
    }

    #[test]
    fn test_perceptual_blur_disabled() {
        let mut blur = PerceptualBlur::new(PerceptualBlurConfig::default());
        blur.enabled = false;

        let input = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let result = blur.process(&input, 10, 10).unwrap();

        // Should return unchanged input when disabled
        assert_eq!(result, input);
    }

    #[test]
    fn test_perceptual_blur_zero_radius() {
        let config = PerceptualBlurConfig {
            radius: 0,
            ..Default::default()
        };
        let blur = PerceptualBlur::new(config);

        let input = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let result = blur.process(&input, 10, 10).unwrap();

        // Should return unchanged input when radius is 0
        assert_eq!(result, input);
    }

    #[test]
    fn test_perceptual_blur_preserves_transparency() {
        let config = PerceptualBlurConfig {
            radius: 3,
            strength: 1.0,
            gamut_mode: GamutMapMode::PreserveHue,
        };
        let blur = PerceptualBlur::new(config);

        // Create test image with some transparent pixels
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 25]; // 5x5 image
        input[12] = (1.0, 0.0, 0.0, 1.0); // Red pixel in center

        let result = blur.process(&input, 5, 5).unwrap();

        // Check that originally transparent pixels have valid alpha
        for pixel in &result {
            assert!(pixel.3 >= 0.0 && pixel.3 <= 1.0, "Alpha out of range: {}", pixel.3);
        }
    }

    #[test]
    fn test_gamut_mapping_applied() {
        let config =
            PerceptualBlurConfig { radius: 1, strength: 1.0, gamut_mode: GamutMapMode::Clamp };
        let blur = PerceptualBlur::new(config);

        // Create input that might produce out-of-gamut colors after blur
        let input = vec![
            (1.0, 0.0, 0.0, 1.0), // Pure red
            (0.0, 1.0, 0.0, 1.0), // Pure green
            (0.0, 0.0, 1.0, 1.0), // Pure blue
            (1.0, 1.0, 0.0, 1.0), // Yellow
        ];

        let result = blur.process(&input, 2, 2).unwrap();

        // Verify all colors are in gamut after processing
        for (i, &(r, g, b, a)) in result.iter().enumerate() {
            // Unpremultiply to check actual color values
            if a > 0.0 {
                let r_straight = r / a;
                let g_straight = g / a;
                let b_straight = b / a;

                assert!(
                    (-0.001..=1.001).contains(&r_straight),
                    "Pixel {} R out of gamut: {}",
                    i,
                    r_straight
                );
                assert!(
                    (-0.001..=1.001).contains(&g_straight),
                    "Pixel {} G out of gamut: {}",
                    i,
                    g_straight
                );
                assert!(
                    (-0.001..=1.001).contains(&b_straight),
                    "Pixel {} B out of gamut: {}",
                    i,
                    b_straight
                );
            }
        }
    }
}
