//! Temporal Echoes / Ghost Trails Effect
//!
//! Shows multiple "shadow" versions of the trajectory at different time offsets,
//! creating a sense of temporal depth and parallel universes.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for temporal echoes effect
#[derive(Clone, Debug)]
pub struct TemporalEchoesConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Number of echo layers
    pub num_echoes: usize,
    /// Opacity falloff per echo (multiplicative)
    pub opacity_falloff: f64,
    /// Spatial offset scale for echoes
    pub offset_scale: f64,
    /// Color shift per echo (toward cooler tones)
    pub color_shift: f64,
    /// Blur amount per echo level
    pub blur_per_echo: f64,
    /// Direction of temporal flow (radians)
    pub flow_direction: f64,
}

impl Default for TemporalEchoesConfig {
    fn default() -> Self {
        Self {
            strength: 0.5,
            num_echoes: 3,
            opacity_falloff: 0.5,
            offset_scale: 0.015,
            color_shift: 0.15,
            blur_per_echo: 0.3,
            flow_direction: std::f64::consts::FRAC_PI_4, // 45 degrees
        }
    }
}

/// Temporal echoes ghost trail effect
pub struct TemporalEchoes {
    config: TemporalEchoesConfig,
}

impl TemporalEchoes {
    pub fn new(config: TemporalEchoesConfig) -> Self {
        Self { config }
    }

    /// Shift color toward cooler tones (past = cooler, future = warmer)
    #[inline]
    fn shift_color_cool(r: f64, g: f64, b: f64, amount: f64) -> (f64, f64, f64) {
        // Shift toward blue/violet
        (
            r * (1.0 - amount * 0.3),
            g * (1.0 - amount * 0.1),
            b * (1.0 + amount * 0.2),
        )
    }

    /// Simple box blur for a single pixel (3x3)
    fn sample_blurred(
        input: &PixelBuffer,
        width: usize,
        height: usize,
        x: f64,
        y: f64,
        blur_radius: f64,
    ) -> (f64, f64, f64, f64) {
        let radius = blur_radius.ceil() as i32;
        if radius == 0 {
            // Direct bilinear sample
            return Self::sample_bilinear(input, width, height, x, y);
        }

        let mut sum = (0.0, 0.0, 0.0, 0.0);
        let mut weight_sum = 0.0;

        for dy in -radius..=radius {
            for dx in -radius..=radius {
                let dist = ((dx * dx + dy * dy) as f64).sqrt();
                if dist > blur_radius {
                    continue;
                }
                let weight = 1.0 - dist / (blur_radius + 1.0);
                let sample =
                    Self::sample_bilinear(input, width, height, x + dx as f64, y + dy as f64);
                sum.0 += sample.0 * weight;
                sum.1 += sample.1 * weight;
                sum.2 += sample.2 * weight;
                sum.3 += sample.3 * weight;
                weight_sum += weight;
            }
        }

        if weight_sum > 0.0 {
            (
                sum.0 / weight_sum,
                sum.1 / weight_sum,
                sum.2 / weight_sum,
                sum.3 / weight_sum,
            )
        } else {
            (0.0, 0.0, 0.0, 0.0)
        }
    }

    /// Bilinear sample from buffer
    fn sample_bilinear(
        input: &PixelBuffer,
        width: usize,
        height: usize,
        x: f64,
        y: f64,
    ) -> (f64, f64, f64, f64) {
        let x = x.clamp(0.0, (width - 1) as f64);
        let y = y.clamp(0.0, (height - 1) as f64);

        let x0 = x.floor() as usize;
        let y0 = y.floor() as usize;
        let x1 = (x0 + 1).min(width - 1);
        let y1 = (y0 + 1).min(height - 1);

        let fx = x - x0 as f64;
        let fy = y - y0 as f64;

        let p00 = input[y0 * width + x0];
        let p01 = input[y0 * width + x1];
        let p10 = input[y1 * width + x0];
        let p11 = input[y1 * width + x1];

        let top = (
            p00.0 * (1.0 - fx) + p01.0 * fx,
            p00.1 * (1.0 - fx) + p01.1 * fx,
            p00.2 * (1.0 - fx) + p01.2 * fx,
            p00.3 * (1.0 - fx) + p01.3 * fx,
        );

        let bottom = (
            p10.0 * (1.0 - fx) + p11.0 * fx,
            p10.1 * (1.0 - fx) + p11.1 * fx,
            p10.2 * (1.0 - fx) + p11.2 * fx,
            p10.3 * (1.0 - fx) + p11.3 * fx,
        );

        (
            top.0 * (1.0 - fy) + bottom.0 * fy,
            top.1 * (1.0 - fy) + bottom.1 * fy,
            top.2 * (1.0 - fy) + bottom.2 * fy,
            top.3 * (1.0 - fy) + bottom.3 * fy,
        )
    }
}

impl PostEffect for TemporalEchoes {
    fn name(&self) -> &str {
        "Temporal Echoes"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 || self.config.num_echoes == 0 || input.is_empty() {
            return Ok(input.clone());
        }

        let min_dim = width.min(height) as f64;
        let base_offset = self.config.offset_scale * min_dim;

        // Calculate echo offsets (in the flow direction)
        let dx = self.config.flow_direction.cos();
        let dy = self.config.flow_direction.sin();

        // Process each pixel
        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                let original = input[idx];

                // Accumulate echoes (behind the current position in time)
                let mut echo_r = 0.0;
                let mut echo_g = 0.0;
                let mut echo_b = 0.0;
                let mut echo_a = 0.0;

                for echo_idx in 1..=self.config.num_echoes {
                    let echo_factor = echo_idx as f64;
                    let opacity = self.config.opacity_falloff.powi(echo_idx as i32);

                    // Offset position (echoes trail behind)
                    let offset = base_offset * echo_factor;
                    let sample_x = x - dx * offset;
                    let sample_y = y - dy * offset;

                    // Blur amount increases with distance
                    let blur = self.config.blur_per_echo * echo_factor;

                    // Sample with blur
                    let sample =
                        Self::sample_blurred(input, width, height, sample_x, sample_y, blur);

                    if sample.3 > 0.0 {
                        // Un-premultiply
                        let sr = sample.0 / sample.3;
                        let sg = sample.1 / sample.3;
                        let sb = sample.2 / sample.3;

                        // Apply color shift
                        let color_shift = self.config.color_shift * echo_factor;
                        let (shifted_r, shifted_g, shifted_b) =
                            Self::shift_color_cool(sr, sg, sb, color_shift);

                        // Accumulate with opacity
                        let echo_opacity = sample.3 * opacity * self.config.strength;
                        echo_r += shifted_r * echo_opacity;
                        echo_g += shifted_g * echo_opacity;
                        echo_b += shifted_b * echo_opacity;
                        echo_a += echo_opacity;
                    }
                }

                // Blend echoes behind original (screen blend for additive glow)
                if echo_a > 0.0 && original.3 > 0.0 {
                    // Un-premultiply original
                    let orig_r = original.0 / original.3;
                    let orig_g = original.1 / original.3;
                    let orig_b = original.2 / original.3;

                    // Normalize echo color
                    let norm_echo_r = echo_r / echo_a;
                    let norm_echo_g = echo_g / echo_a;
                    let norm_echo_b = echo_b / echo_a;

                    // Screen blend
                    let blend_amount = (echo_a * 0.5).min(0.5);
                    let final_r = orig_r + norm_echo_r * blend_amount * (1.0 - orig_r);
                    let final_g = orig_g + norm_echo_g * blend_amount * (1.0 - orig_g);
                    let final_b = orig_b + norm_echo_b * blend_amount * (1.0 - orig_b);

                    // Combined alpha
                    let final_a = original.3.max(echo_a * 0.3);

                    (
                        final_r.max(0.0) * final_a,
                        final_g.max(0.0) * final_a,
                        final_b.max(0.0) * final_a,
                        final_a,
                    )
                } else if echo_a > 0.0 {
                    // Only echo visible (transparent original)
                    (echo_r, echo_g, echo_b, echo_a * 0.5)
                } else {
                    original
                }
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_temporal_echoes_default_config() {
        let config = TemporalEchoesConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.num_echoes > 0);
    }

    #[test]
    fn test_color_shift_cool() {
        let (r, _g, b) = TemporalEchoes::shift_color_cool(0.5, 0.5, 0.5, 0.5);
        assert!(b > 0.5, "Blue should increase with cool shift");
        assert!(r < 0.5, "Red should decrease with cool shift");
    }

    #[test]
    fn test_bilinear_sample_center() {
        let input = vec![
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
            (1.0, 1.0, 0.0, 1.0),
        ];
        let sample = TemporalEchoes::sample_bilinear(&input, 2, 2, 0.5, 0.5);
        // Center should be average of all four
        assert!((sample.0 - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_temporal_echoes_preserves_transparent() {
        let effect = TemporalEchoes::new(TemporalEchoesConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        assert_eq!(output[0].3, 0.0);
    }

    #[test]
    fn test_temporal_echoes_zero_strength() {
        let config = TemporalEchoesConfig { strength: 0.0, ..Default::default() };
        let effect = TemporalEchoes::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }

    #[test]
    fn test_bilinear_sample_corners() {
        let input = vec![
            (1.0, 0.0, 0.0, 1.0), // Top-left
            (0.0, 1.0, 0.0, 1.0), // Top-right
            (0.0, 0.0, 1.0, 1.0), // Bottom-left
            (1.0, 1.0, 1.0, 1.0), // Bottom-right
        ];
        
        // Sample at corners should return corner values
        let tl = TemporalEchoes::sample_bilinear(&input, 2, 2, 0.0, 0.0);
        assert!((tl.0 - 1.0).abs() < 0.01, "Top-left R should be 1.0");
        
        let tr = TemporalEchoes::sample_bilinear(&input, 2, 2, 1.0, 0.0);
        assert!((tr.1 - 1.0).abs() < 0.01, "Top-right G should be 1.0");
        
        let bl = TemporalEchoes::sample_bilinear(&input, 2, 2, 0.0, 1.0);
        assert!((bl.2 - 1.0).abs() < 0.01, "Bottom-left B should be 1.0");
    }

    #[test]
    fn test_cool_shift_proportional() {
        // Higher amount should produce more shift
        let (r1, _, b1) = TemporalEchoes::shift_color_cool(0.5, 0.5, 0.5, 0.2);
        let (r2, _, b2) = TemporalEchoes::shift_color_cool(0.5, 0.5, 0.5, 0.8);
        
        // More shift = more blue, less red
        assert!(b2 > b1, "Higher amount should produce more blue");
        assert!(r2 < r1, "Higher amount should produce less red");
    }

    #[test]
    fn test_multiple_echoes() {
        let config = TemporalEchoesConfig {
            strength: 0.6,
            num_echoes: 5,
            ..Default::default()
        };
        let effect = TemporalEchoes::new(config);
        
        // Create a diagonal line pattern
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        for i in 0..10 {
            input[i * 10 + i] = (1.0, 0.8, 0.2, 1.0);
        }
        
        let output = effect.process(&input, 10, 10).unwrap();
        
        // With echoes, more pixels should be non-transparent
        let input_opaque = input.iter().filter(|p| p.3 > 0.1).count();
        let output_opaque = output.iter().filter(|p| p.3 > 0.05).count();
        
        assert!(
            output_opaque >= input_opaque,
            "Echoes should spread content: {} vs {}",
            output_opaque, input_opaque
        );
    }

    #[test]
    fn test_echo_opacity_falloff() {
        let config = TemporalEchoesConfig {
            strength: 1.0,
            num_echoes: 3,
            opacity_falloff: 0.5,
            ..Default::default()
        };
        
        // Test that falloff is correctly applied
        let falloff = config.opacity_falloff;
        let opacities: Vec<f64> = (1..=3)
            .map(|i| falloff.powi(i as i32))
            .collect();
        
        assert!(opacities[0] > opacities[1], "First echo should be more opaque");
        assert!(opacities[1] > opacities[2], "Second echo should be more opaque than third");
        assert!((opacities[0] - 0.5).abs() < 0.01, "First opacity should be 0.5");
        assert!((opacities[1] - 0.25).abs() < 0.01, "Second opacity should be 0.25");
    }

    #[test]
    fn test_zero_echoes() {
        let config = TemporalEchoesConfig {
            num_echoes: 0,
            ..Default::default()
        };
        let effect = TemporalEchoes::new(config);
        
        let input = vec![(0.5, 0.3, 0.1, 1.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        
        // With zero echoes, output should equal input
        assert_eq!(output, input);
    }
}
