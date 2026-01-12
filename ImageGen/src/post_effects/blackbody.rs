//! Blackbody Radiation Coloring Post-Effect
//!
//! Maps orbital velocity to temperature, creating physically meaningful color palettes
//! where faster motion appears hotter (blue/white) and slower motion cooler (red/orange).
//! Inspired by stellar physics and thermal emission.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for blackbody radiation coloring
#[derive(Clone, Debug)]
pub struct BlackbodyConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full replacement)
    pub strength: f64,
    /// Minimum temperature in Kelvin (cooler regions)
    pub min_temperature: f64,
    /// Maximum temperature in Kelvin (hotter regions)
    pub max_temperature: f64,
    /// Whether to preserve original luminance
    pub preserve_luminance: bool,
    /// Blend mode: "replace", "multiply", "screen", or "overlay"
    pub blend_mode: String,
}

impl Default for BlackbodyConfig {
    fn default() -> Self {
        Self {
            strength: 0.65,
            min_temperature: 1800.0,  // Deep red/orange
            max_temperature: 12000.0, // Blue-white
            preserve_luminance: true,
            blend_mode: "overlay".to_string(),
        }
    }
}

/// Blackbody radiation coloring effect
pub struct BlackbodyRadiation {
    config: BlackbodyConfig,
}

impl BlackbodyRadiation {
    pub fn new(config: BlackbodyConfig) -> Self {
        Self { config }
    }

    /// Convert temperature in Kelvin to RGB color using Planck's law approximation
    /// Based on the CIE 1931 color matching functions
    #[inline]
    fn temperature_to_rgb(temp: f64) -> (f64, f64, f64) {
        // Clamp temperature to valid range
        let temp = temp.clamp(1000.0, 40000.0);

        // Normalize to 100K scale for the algorithm
        let temp_100 = temp / 100.0;

        // Calculate RGB based on temperature ranges
        // Algorithm adapted from Tanner Helland's blackbody approximation
        let r = if temp_100 <= 66.0 {
            1.0
        } else {
            let r = 329.698727446 * (temp_100 - 60.0).powf(-0.1332047592);
            (r / 255.0).clamp(0.0, 1.0)
        };

        let g = if temp_100 <= 66.0 {
            let g = 99.4708025861 * temp_100.ln() - 161.1195681661;
            (g / 255.0).clamp(0.0, 1.0)
        } else {
            let g = 288.1221695283 * (temp_100 - 60.0).powf(-0.0755148492);
            (g / 255.0).clamp(0.0, 1.0)
        };

        let b = if temp_100 >= 66.0 {
            1.0
        } else if temp_100 <= 19.0 {
            0.0
        } else {
            let b = 138.5177312231 * (temp_100 - 10.0).ln() - 305.0447927307;
            (b / 255.0).clamp(0.0, 1.0)
        };

        (r, g, b)
    }

    /// Estimate "velocity" from pixel luminance gradient
    #[inline]
    fn estimate_velocity_from_gradient(gradient_magnitude: f64) -> f64 {
        // Higher gradient = faster change = higher velocity
        // Use a smooth mapping that emphasizes variations
        (gradient_magnitude * 2.0).tanh()
    }
}

impl PostEffect for BlackbodyRadiation {
    fn name(&self) -> &str {
        "Blackbody Radiation"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 {
            return Ok(input.clone());
        }

        // First pass: compute gradients to estimate velocity
        let gradients = super::utils::calculate_gradients(input, width, height);

        // Second pass: apply blackbody coloring based on gradient magnitude (velocity proxy)
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                // Get gradient magnitude as velocity proxy
                let (gx, gy) = gradients[idx];
                let gradient_mag = (gx * gx + gy * gy).sqrt();
                let velocity = Self::estimate_velocity_from_gradient(gradient_mag);

                // Map velocity to temperature
                let temp_range = self.config.max_temperature - self.config.min_temperature;
                let temperature = self.config.min_temperature + velocity * temp_range;

                // Get blackbody RGB for this temperature
                let (bb_r, bb_g, bb_b) = Self::temperature_to_rgb(temperature);

                // Un-premultiply for blending
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Original luminance
                let orig_lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;

                // Apply blend mode
                let (blended_r, blended_g, blended_b) = match self.config.blend_mode.as_str() {
                    "replace" => (bb_r, bb_g, bb_b),
                    "multiply" => (sr * bb_r, sg * bb_g, sb * bb_b),
                    "screen" => (
                        1.0 - (1.0 - sr) * (1.0 - bb_r),
                        1.0 - (1.0 - sg) * (1.0 - bb_g),
                        1.0 - (1.0 - sb) * (1.0 - bb_b),
                    ),
                    _ => {
                        // Overlay blend: multiply dark, screen light
                        let blend_channel = |base: f64, blend: f64| -> f64 {
                            if base < 0.5 {
                                2.0 * base * blend
                            } else {
                                1.0 - 2.0 * (1.0 - base) * (1.0 - blend)
                            }
                        };
                        (
                            blend_channel(sr, bb_r),
                            blend_channel(sg, bb_g),
                            blend_channel(sb, bb_b),
                        )
                    }
                };

                // Optionally preserve original luminance
                let (final_r, final_g, final_b) = if self.config.preserve_luminance && orig_lum > 0.0
                {
                    let new_lum = 0.2126 * blended_r + 0.7152 * blended_g + 0.0722 * blended_b;
                    if new_lum > 0.0 {
                        let scale = orig_lum / new_lum;
                        (blended_r * scale, blended_g * scale, blended_b * scale)
                    } else {
                        (blended_r, blended_g, blended_b)
                    }
                } else {
                    (blended_r, blended_g, blended_b)
                };

                // Mix with original based on strength
                let mix_r = sr + (final_r - sr) * self.config.strength;
                let mix_g = sg + (final_g - sg) * self.config.strength;
                let mix_b = sb + (final_b - sb) * self.config.strength;

                // Re-premultiply
                (mix_r.max(0.0) * a, mix_g.max(0.0) * a, mix_b.max(0.0) * a, a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blackbody_default_config() {
        let config = BlackbodyConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.min_temperature < config.max_temperature);
    }

    #[test]
    fn test_temperature_to_rgb_cold() {
        // Cold temperatures should be reddish
        let (r, g, b) = BlackbodyRadiation::temperature_to_rgb(2000.0);
        assert!(r > g, "Red should dominate at low temperatures");
        assert!(r > b, "Red should dominate at low temperatures");
    }

    #[test]
    fn test_temperature_to_rgb_hot() {
        // Hot temperatures should be bluish-white
        let (_r, _g, b) = BlackbodyRadiation::temperature_to_rgb(15000.0);
        assert!(b > 0.5, "Blue should be strong at high temperatures");
    }

    #[test]
    fn test_temperature_to_rgb_neutral() {
        // Around 6500K should be roughly neutral (daylight)
        let (r, g, b) = BlackbodyRadiation::temperature_to_rgb(6500.0);
        // All channels should be relatively balanced
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        assert!(max - min < 0.3, "6500K should be roughly neutral");
    }

    #[test]
    fn test_blackbody_effect_preserves_transparent() {
        let effect = BlackbodyRadiation::new(BlackbodyConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn test_blackbody_effect_zero_strength() {
        let config = BlackbodyConfig { strength: 0.0, ..Default::default() };
        let effect = BlackbodyRadiation::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }

    #[test]
    fn test_velocity_estimation() {
        // Higher gradient should give higher velocity
        let low_velocity = BlackbodyRadiation::estimate_velocity_from_gradient(0.1);
        let high_velocity = BlackbodyRadiation::estimate_velocity_from_gradient(0.9);
        assert!(high_velocity > low_velocity);
    }

    #[test]
    fn test_temperature_range_clamping() {
        // Test that extreme temperatures are handled
        let (r1, g1, b1) = BlackbodyRadiation::temperature_to_rgb(500.0);  // Below min
        let (r2, g2, b2) = BlackbodyRadiation::temperature_to_rgb(50000.0); // Above max
        
        // Both should produce valid colors
        assert!(r1 >= 0.0 && r1 <= 1.0);
        assert!(g1 >= 0.0 && g1 <= 1.0);
        assert!(b1 >= 0.0 && b1 <= 1.0);
        assert!(r2 >= 0.0 && r2 <= 1.0);
        assert!(g2 >= 0.0 && g2 <= 1.0);
        assert!(b2 >= 0.0 && b2 <= 1.0);
    }

    #[test]
    fn test_temperature_monotonicity() {
        // Blue should generally increase with temperature
        let temps = [2000.0, 4000.0, 6000.0, 8000.0, 10000.0];
        let blues: Vec<f64> = temps.iter()
            .map(|&t| BlackbodyRadiation::temperature_to_rgb(t).2)
            .collect();
        
        // Check general trend (allowing some variation)
        assert!(blues[4] > blues[0], "Blue should increase from 2000K to 10000K");
    }

    #[test]
    fn test_blend_modes() {
        let base_config = BlackbodyConfig {
            strength: 1.0,
            ..Default::default()
        };
        
        let input = vec![(0.5, 0.5, 0.5, 1.0); 4];
        
        for mode in ["replace", "multiply", "screen", "overlay"] {
            let config = BlackbodyConfig {
                blend_mode: mode.to_string(),
                ..base_config.clone()
            };
            let effect = BlackbodyRadiation::new(config);
            let result = effect.process(&input, 2, 2);
            assert!(result.is_ok(), "Blend mode '{}' should work", mode);
        }
    }

    #[test]
    fn test_luminance_preservation() {
        let config = BlackbodyConfig {
            strength: 0.8,
            preserve_luminance: true,
            ..Default::default()
        };
        let effect = BlackbodyRadiation::new(config);
        
        // Create gradient buffer
        let mut input = Vec::new();
        for i in 0..9 {
            let v = (i as f64 + 1.0) / 10.0;
            input.push((v, v, v, 1.0));
        }
        
        let output = effect.process(&input, 3, 3).unwrap();
        
        // Luminance should be approximately preserved
        for (i, (inp, out)) in input.iter().zip(output.iter()).enumerate() {
            let in_lum = 0.2126 * inp.0 + 0.7152 * inp.1 + 0.0722 * inp.2;
            let out_lum = 0.2126 * out.0 + 0.7152 * out.1 + 0.0722 * out.2;
            // Allow 50% tolerance due to effect blending
            assert!(
                (in_lum - out_lum).abs() < in_lum * 0.5 + 0.1,
                "Luminance changed too much at pixel {}: {} -> {}",
                i, in_lum, out_lum
            );
        }
    }
}
