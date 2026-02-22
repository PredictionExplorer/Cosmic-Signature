//! Glow enhancement for sparkle and magic on bright areas.
//!
//! This effect is distinct from bloom - while bloom creates large diffuse halos,
//! glow creates tight, sharp highlights on the very brightest points, adding
//! sparkle, stars, and a sense of luminous energy. Think "lens star filter" effect.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for glow enhancement
#[derive(Clone, Debug)]
pub struct GlowEnhancementConfig {
    /// Overall strength of the glow effect (0.0-1.0)
    pub strength: f64,
    /// Luminance threshold for glow activation (0.0-1.0)
    /// Only pixels brighter than this get glow
    pub threshold: f64,
    /// Glow radius in pixels (tight glow, not diffuse)
    pub radius: usize,
    /// Glow sharpness (higher = tighter, sharper glow)
    pub sharpness: f64,
    /// Color saturation boost for glowing areas
    pub saturation_boost: f64,
}

impl Default for GlowEnhancementConfig {
    fn default() -> Self {
        let min_dim = 1920_usize.min(1080) as f64;
        Self {
            strength: 0.45,
            threshold: 0.65,
            radius: (0.008 * min_dim).round() as usize,
            sharpness: 2.5,
            saturation_boost: 0.25,
        }
    }
}

/// Glow enhancement post-effect
pub struct GlowEnhancement {
    config: GlowEnhancementConfig,
    enabled: bool,
}

impl GlowEnhancement {
    pub fn new(config: GlowEnhancementConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Calculate luminance from premultiplied RGB
    #[inline]
    fn luminance_premult(r: f64, g: f64, b: f64, a: f64) -> f64 {
        if a <= 0.0 {
            0.0
        } else {
            // Convert to straight alpha first
            let sr = r / a;
            let sg = g / a;
            let sb = b / a;
            0.2126 * sr + 0.7152 * sg + 0.0722 * sb
        }
    }

    /// Extract bright pixels above threshold
    fn extract_bright_pixels(&self, input: &PixelBuffer) -> PixelBuffer {
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 0.0 {
                    return (0.0, 0.0, 0.0, 0.0);
                }

                let lum = Self::luminance_premult(r, g, b, a);

                // Smooth threshold with falloff
                if lum > self.config.threshold {
                    let excess = (lum - self.config.threshold) / (1.0 - self.config.threshold);
                    let factor = excess.powf(self.config.sharpness).min(1.0);

                    // Boost saturation for glowing areas
                    let sr = r / a;
                    let sg = g / a;
                    let sb = b / a;

                    // Simple saturation boost (move away from gray)
                    let mean = (sr + sg + sb) / 3.0;
                    let boosted_r = mean + (sr - mean) * (1.0 + self.config.saturation_boost);
                    let boosted_g = mean + (sg - mean) * (1.0 + self.config.saturation_boost);
                    let boosted_b = mean + (sb - mean) * (1.0 + self.config.saturation_boost);

                    (
                        boosted_r.max(0.0) * factor * a,
                        boosted_g.max(0.0) * factor * a,
                        boosted_b.max(0.0) * factor * a,
                        a * factor,
                    )
                } else {
                    (0.0, 0.0, 0.0, 0.0)
                }
            })
            .collect()
    }

    /// Apply tight radial blur for glow (simpler than full Gaussian)
    fn apply_radial_glow(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> PixelBuffer {
        let radius = self.config.radius;
        if radius == 0 {
            return input.clone();
        }

        let mut output = vec![(0.0, 0.0, 0.0, 0.0); input.len()];

        output.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
            let x = idx % width;
            let y = idx / width;

            let mut sum_r = 0.0;
            let mut sum_g = 0.0;
            let mut sum_b = 0.0;
            let mut sum_a = 0.0;
            let mut weight_total = 0.0;

            // Simple box kernel for speed
            let x_min = x.saturating_sub(radius);
            let x_max = (x + radius).min(width - 1);
            let y_min = y.saturating_sub(radius);
            let y_max = (y + radius).min(height - 1);

            for ny in y_min..=y_max {
                for nx in x_min..=x_max {
                    let sidx = ny * width + nx;
                    if sidx < input.len() {
                        // Radial falloff weight
                        let dx = (nx as f64 - x as f64).abs();
                        let dy = (ny as f64 - y as f64).abs();
                        let dist = (dx * dx + dy * dy).sqrt();
                        let weight = (1.0 - (dist / radius as f64)).max(0.0);

                        let (r, g, b, a) = input[sidx];
                        sum_r += r * weight;
                        sum_g += g * weight;
                        sum_b += b * weight;
                        sum_a += a * weight;
                        weight_total += weight;
                    }
                }
            }

            if weight_total > 0.0 {
                *pixel = (
                    sum_r / weight_total,
                    sum_g / weight_total,
                    sum_b / weight_total,
                    sum_a / weight_total,
                );
            }
        });

        output
    }
}

impl PostEffect for GlowEnhancement {
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

        // Extract bright pixels
        let bright = self.extract_bright_pixels(input);

        // Apply tight glow blur
        let glowed = self.apply_radial_glow(&bright, width, height);

        // Composite glow back onto original with strength
        let output: PixelBuffer = input
            .par_iter()
            .zip(glowed.par_iter())
            .map(|(&(r, g, b, a), &(gr, gg, gb, ga))| {
                let strength = self.config.strength;
                (
                    (r + gr * strength).min(a * 1.5), // Allow slight HDR bloom
                    (g + gg * strength).min(a * 1.5),
                    (b + gb * strength).min(a * 1.5),
                    (a + ga * strength * 0.1).min(1.0), // Minimal alpha boost
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
    fn test_glow_disabled() {
        let config = GlowEnhancementConfig {
            strength: 0.0,
            ..GlowEnhancementConfig::default()
        };
        let glow = GlowEnhancement::new(config);
        assert!(!glow.is_enabled());
    }

    #[test]
    fn test_glow_enabled() {
        let config = GlowEnhancementConfig::default();
        let glow = GlowEnhancement::new(config);
        assert!(glow.is_enabled());
    }

    #[test]
    fn test_luminance_calculation() {
        // Bright white
        let lum = GlowEnhancement::luminance_premult(1.0, 1.0, 1.0, 1.0);
        assert!((lum - 1.0).abs() < 0.001);

        // Dark
        let lum = GlowEnhancement::luminance_premult(0.1, 0.1, 0.1, 1.0);
        assert!(lum < 0.15);
    }

    #[test]
    fn test_extract_bright_pixels() {
        let config = GlowEnhancementConfig {
            threshold: 0.5,
            strength: 1.0,
            sharpness: 1.0,
            saturation_boost: 0.0,
            radius: 1,
        };
        let glow = GlowEnhancement::new(config);

        // Create buffer with bright and dark pixels
        let buffer: PixelBuffer = vec![
            (0.2, 0.2, 0.2, 1.0), // Dark - below threshold
            (0.8, 0.8, 0.8, 1.0), // Bright - above threshold
            (1.0, 1.0, 1.0, 1.0), // Very bright
            (0.0, 0.0, 0.0, 1.0), // Black
        ];

        let bright = glow.extract_bright_pixels(&buffer);

        // Dark pixel should be zeroed
        assert!(bright[0].0 < 0.01);
        // Bright pixels should remain
        assert!(bright[1].0 > 0.1);
        assert!(bright[2].0 > 0.1);
    }

    #[test]
    fn test_buffer_processing() {
        let config = GlowEnhancementConfig::default();
        let glow = GlowEnhancement::new(config);

        // Create test buffer with gradient
        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = i as f64 / 10000.0;
                (val, val, val, 1.0)
            })
            .collect();

        let result = glow.process(&buffer, 100, 100).unwrap();
        assert_eq!(result.len(), buffer.len());
    }
}

