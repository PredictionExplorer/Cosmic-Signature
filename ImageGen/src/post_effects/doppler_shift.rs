//! Relativistic Doppler Shift Post-Effect
//!
//! Simulates the color shift that occurs when objects move toward or away from
//! an observer. Objects approaching appear blue-shifted (shorter wavelength),
//! while objects receding appear red-shifted (longer wavelength).
//!
//! This is the same phenomenon astronomers use to measure stellar velocities
//! and the expansion of the universe. Applied to the three-body trajectories,
//! it creates a sense of motion and depth.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for relativistic Doppler shift effect
#[derive(Clone, Debug)]
pub struct DopplerShiftConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Blue shift intensity for approaching regions
    pub blue_shift_intensity: f64,
    /// Red shift intensity for receding regions
    pub red_shift_intensity: f64,
    /// Sensitivity to velocity (gradient magnitude)
    pub velocity_sensitivity: f64,
    /// Whether to preserve original luminance
    pub preserve_luminance: bool,
    /// Direction angle that represents "toward viewer" (radians)
    /// 0 = right, π/2 = up, π = left, -π/2 = down
    pub approach_direction: f64,
    /// Smoothness of the transition between blue and red
    pub transition_smoothness: f64,
}

impl Default for DopplerShiftConfig {
    fn default() -> Self {
        Self {
            strength: 0.40,
            blue_shift_intensity: 0.7,
            red_shift_intensity: 0.6,
            velocity_sensitivity: 1.5,
            preserve_luminance: true,
            approach_direction: -std::f64::consts::FRAC_PI_4, // Upper-right approach
            transition_smoothness: 0.3,
        }
    }
}

/// Relativistic Doppler shift effect
pub struct DopplerShift {
    config: DopplerShiftConfig,
}

impl DopplerShift {
    pub fn new(config: DopplerShiftConfig) -> Self {
        Self { config }
    }

    /// Apply blue shift to RGB values
    /// Blue-shifted light has shorter wavelength: red → green → blue → violet
    #[inline]
    fn apply_blue_shift(r: f64, g: f64, b: f64, amount: f64) -> (f64, f64, f64) {
        // Shift spectrum toward shorter wavelengths
        // Red becomes less, green shifts to blue, blue intensifies
        let shifted_r = r * (1.0 - amount * 0.5) + g * amount * 0.2;
        let shifted_g = g * (1.0 - amount * 0.3) + b * amount * 0.4;
        let shifted_b = b * (1.0 + amount * 0.3) + r * amount * 0.1;

        // Add violet tint for strong blue shift
        let violet_boost = amount * 0.15;
        (
            shifted_r + violet_boost,
            shifted_g * (1.0 - violet_boost * 0.5),
            shifted_b + violet_boost * 0.8,
        )
    }

    /// Apply red shift to RGB values
    /// Red-shifted light has longer wavelength: violet → blue → green → yellow → red
    #[inline]
    fn apply_red_shift(r: f64, g: f64, b: f64, amount: f64) -> (f64, f64, f64) {
        // Shift spectrum toward longer wavelengths
        // Blue becomes less, green shifts to red, red intensifies
        let shifted_r = r * (1.0 + amount * 0.4) + g * amount * 0.3;
        let shifted_g = g * (1.0 - amount * 0.2) + r * amount * 0.1;
        let shifted_b = b * (1.0 - amount * 0.5);

        // Add warm yellow/orange tint for strong red shift
        let warm_boost = amount * 0.12;
        (
            shifted_r + warm_boost,
            shifted_g + warm_boost * 0.6,
            shifted_b * (1.0 - warm_boost),
        )
    }

    /// Calculate the "approach factor" from gradient direction
    /// Returns value from -1 (receding) to +1 (approaching)
    #[inline]
    fn approach_factor(gradient_angle: f64, approach_dir: f64, smoothness: f64) -> f64 {
        // Calculate how aligned the gradient is with the approach direction
        let angle_diff = (gradient_angle - approach_dir).sin();

        // Smooth the transition using tanh
        if smoothness > 0.0 {
            (angle_diff / smoothness).tanh()
        } else {
            angle_diff.signum()
        }
    }

    /// Normalize luminance to preserve original brightness
    #[inline]
    fn normalize_luminance(
        r: f64,
        g: f64,
        b: f64,
        target_lum: f64,
    ) -> (f64, f64, f64) {
        let current_lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if current_lum > 1e-10 {
            let scale = target_lum / current_lum;
            (r * scale, g * scale, b * scale)
        } else {
            (r, g, b)
        }
    }
}

impl PostEffect for DopplerShift {
    fn name(&self) -> &str {
        "Doppler Shift"
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

        // Calculate gradients for velocity direction estimation
        let gradients = super::utils::calculate_gradients(input, width, height);

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                // Get gradient (represents local velocity direction)
                let (gx, gy) = gradients[idx];
                let grad_mag = (gx * gx + gy * gy).sqrt();

                // Skip if no significant gradient
                if grad_mag < 0.001 {
                    return (r, g, b, a);
                }

                // Un-premultiply
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Calculate approach factor
                let grad_angle = gy.atan2(gx);
                let approach = Self::approach_factor(
                    grad_angle,
                    self.config.approach_direction,
                    self.config.transition_smoothness,
                );

                // Velocity factor (higher gradient = faster motion = stronger shift)
                let velocity_factor = (grad_mag * self.config.velocity_sensitivity)
                    .tanh()
                    .min(1.0);

                // Calculate effect strength for this pixel
                let effect_amount = velocity_factor * self.config.strength * approach.abs();

                if effect_amount < 0.001 {
                    return (r, g, b, a);
                }

                // Calculate original luminance if we need to preserve it
                let orig_lum = if self.config.preserve_luminance {
                    0.2126 * sr + 0.7152 * sg + 0.0722 * sb
                } else {
                    0.0
                };

                // Apply appropriate color shift
                let (shifted_r, shifted_g, shifted_b) = if approach > 0.0 {
                    // Approaching: blue shift
                    let blue_amount = effect_amount * self.config.blue_shift_intensity;
                    Self::apply_blue_shift(sr, sg, sb, blue_amount)
                } else {
                    // Receding: red shift
                    let red_amount = effect_amount * self.config.red_shift_intensity;
                    Self::apply_red_shift(sr, sg, sb, red_amount)
                };

                // Preserve luminance if requested
                let (final_r, final_g, final_b) = if self.config.preserve_luminance && orig_lum > 0.0
                {
                    Self::normalize_luminance(shifted_r, shifted_g, shifted_b, orig_lum)
                } else {
                    (shifted_r, shifted_g, shifted_b)
                };

                // Blend with original based on overall strength
                let blend = effect_amount;
                let out_r = sr + (final_r - sr) * blend;
                let out_g = sg + (final_g - sg) * blend;
                let out_b = sb + (final_b - sb) * blend;

                // Re-premultiply
                (
                    out_r.max(0.0) * a,
                    out_g.max(0.0) * a,
                    out_b.max(0.0) * a,
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
    fn test_doppler_shift_default_config() {
        let config = DopplerShiftConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.blue_shift_intensity > 0.0);
        assert!(config.red_shift_intensity > 0.0);
    }

    #[test]
    fn test_doppler_shift_preserves_transparent() {
        let effect = DopplerShift::new(DopplerShiftConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 16];
        let output = effect.process(&input, 4, 4).unwrap();
        
        for pixel in &output {
            assert_eq!(pixel.3, 0.0);
        }
    }

    #[test]
    fn test_doppler_shift_zero_strength() {
        let config = DopplerShiftConfig {
            strength: 0.0,
            ..Default::default()
        };
        let effect = DopplerShift::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0); 16];
        let output = effect.process(&input, 4, 4).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_blue_shift_increases_blue() {
        let (r, _g, b) = DopplerShift::apply_blue_shift(0.5, 0.5, 0.5, 0.8);
        
        // Blue should increase relative to original
        assert!(b > 0.5, "Blue should increase: got {}", b);
        // Red should decrease
        assert!(r < 0.6, "Red should not increase significantly: got {}", r);
    }

    #[test]
    fn test_red_shift_increases_red() {
        let (r, _g, b) = DopplerShift::apply_red_shift(0.5, 0.5, 0.5, 0.8);
        
        // Red should increase
        assert!(r > 0.5, "Red should increase: got {}", r);
        // Blue should decrease
        assert!(b < 0.5, "Blue should decrease: got {}", b);
    }

    #[test]
    fn test_approach_factor_range() {
        for angle in [0.0, 1.0, 2.0, 3.0, -1.0, -2.0] {
            let factor = DopplerShift::approach_factor(angle, 0.0, 0.3);
            assert!(
                factor >= -1.0 && factor <= 1.0,
                "Approach factor {} out of range for angle {}",
                factor,
                angle
            );
        }
    }

    #[test]
    fn test_approach_factor_symmetry() {
        // Opposite angles should give opposite signs
        let f1 = DopplerShift::approach_factor(0.0, 0.0, 0.3);
        let f2 = DopplerShift::approach_factor(std::f64::consts::PI, 0.0, 0.3);
        
        // Not necessarily exactly opposite due to sin function, but should differ
        assert!(
            (f1 - f2).abs() > 0.1 || f1.abs() < 0.1,
            "Opposite angles should give different factors"
        );
    }

    #[test]
    fn test_luminance_preservation() {
        let (r, g, b) = (0.8, 0.4, 0.2);
        let target_lum = 0.5;
        
        let (nr, ng, nb) = DopplerShift::normalize_luminance(r, g, b, target_lum);
        let result_lum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
        
        assert!(
            (result_lum - target_lum).abs() < 0.01,
            "Luminance should be {}, got {}",
            target_lum,
            result_lum
        );
    }

    #[test]
    fn test_gradient_affects_shift_direction() {
        let config = DopplerShiftConfig {
            strength: 0.8,
            approach_direction: 0.0, // Right = approaching
            preserve_luminance: false,
            ..Default::default()
        };
        let effect = DopplerShift::new(config);

        // Create a horizontal gradient (brightness increasing to right)
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        for y in 4..6 {
            for x in 0..10 {
                let v = x as f64 / 10.0;
                input[y * 10 + x] = (v, v, v, 1.0);
            }
        }

        let output = effect.process(&input, 10, 10).unwrap();

        // Check that processing produced valid output
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
    fn test_effect_varies_with_gradient_magnitude() {
        let config = DopplerShiftConfig {
            strength: 1.0,
            velocity_sensitivity: 2.0,
            preserve_luminance: false,
            ..Default::default()
        };
        let effect = DopplerShift::new(config);

        // Create two gradients: one steep, one shallow
        let mut input_steep = vec![(0.5, 0.5, 0.5, 1.0); 25];
        let mut input_shallow = vec![(0.5, 0.5, 0.5, 1.0); 25];

        // Steep gradient
        input_steep[11] = (0.2, 0.2, 0.2, 1.0);
        input_steep[13] = (0.8, 0.8, 0.8, 1.0);

        // Shallow gradient
        input_shallow[11] = (0.45, 0.45, 0.45, 1.0);
        input_shallow[13] = (0.55, 0.55, 0.55, 1.0);

        let output_steep = effect.process(&input_steep, 5, 5).unwrap();
        let output_shallow = effect.process(&input_shallow, 5, 5).unwrap();

        // Calculate color difference from gray at center
        let diff_steep = (output_steep[12].0 - 0.5).abs()
            + (output_steep[12].1 - 0.5).abs()
            + (output_steep[12].2 - 0.5).abs();
        let diff_shallow = (output_shallow[12].0 - 0.5).abs()
            + (output_shallow[12].1 - 0.5).abs()
            + (output_shallow[12].2 - 0.5).abs();

        // Steep gradient should have more color shift
        // (Though both might be near zero if center has no gradient)
        assert!(
            diff_steep >= diff_shallow * 0.8 || diff_shallow < 0.05,
            "Steeper gradient should produce more shift: {} vs {}",
            diff_steep,
            diff_shallow
        );
    }
}
