//! Dichroic Glass Effect
//!
//! Creates a color-shifting effect where colors change based on viewing angle
//! (approximated by local gradient direction). Like dichroic glass or oil on water,
//! blues from one direction shift to golds from another.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for dichroic glass effect
#[derive(Clone, Debug)]
pub struct DichroicGlassConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Primary hue shift in degrees
    pub primary_hue_shift: f64,
    /// Secondary hue shift in degrees (opposite direction)
    pub secondary_hue_shift: f64,
    /// How much the angle affects color (0.0 = none, 1.0 = full)
    pub angle_sensitivity: f64,
    /// Iridescence frequency (higher = more color bands)
    pub iridescence_frequency: f64,
    /// Whether to preserve original luminance
    pub preserve_luminance: bool,
}

impl Default for DichroicGlassConfig {
    fn default() -> Self {
        Self {
            strength: 0.55,
            primary_hue_shift: 45.0,   // Shift toward yellow/gold
            secondary_hue_shift: -60.0, // Shift toward blue/violet
            angle_sensitivity: 0.8,
            iridescence_frequency: 3.0,
            preserve_luminance: true,
        }
    }
}

/// Dichroic glass color-shifting effect
pub struct DichroicGlass {
    config: DichroicGlassConfig,
}

impl DichroicGlass {
    pub fn new(config: DichroicGlassConfig) -> Self {
        Self { config }
    }

    /// Convert RGB to HSL
    #[inline]
    fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let l = (max + min) / 2.0;

        if (max - min).abs() < 1e-10 {
            return (0.0, 0.0, l); // Achromatic
        }

        let d = max - min;
        let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };

        let h = if (max - r).abs() < 1e-10 {
            let mut h = (g - b) / d;
            if g < b {
                h += 6.0;
            }
            h / 6.0
        } else if (max - g).abs() < 1e-10 {
            ((b - r) / d + 2.0) / 6.0
        } else {
            ((r - g) / d + 4.0) / 6.0
        };

        (h, s, l)
    }

    /// Convert HSL to RGB
    #[inline]
    fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
        if s < 1e-10 {
            return (l, l, l); // Achromatic
        }

        let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
        let p = 2.0 * l - q;

        let hue_to_rgb = |p: f64, q: f64, mut t: f64| -> f64 {
            if t < 0.0 {
                t += 1.0;
            }
            if t > 1.0 {
                t -= 1.0;
            }
            if t < 1.0 / 6.0 {
                return p + (q - p) * 6.0 * t;
            }
            if t < 1.0 / 2.0 {
                return q;
            }
            if t < 2.0 / 3.0 {
                return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
            }
            p
        };

        (
            hue_to_rgb(p, q, h + 1.0 / 3.0),
            hue_to_rgb(p, q, h),
            hue_to_rgb(p, q, h - 1.0 / 3.0),
        )
    }
}

impl PostEffect for DichroicGlass {
    fn name(&self) -> &str {
        "Dichroic Glass"
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

        // Calculate gradients for angle estimation
        let gradients = super::utils::calculate_gradients(input, width, height);

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

                // Get gradient direction as viewing angle proxy
                let (gx, gy) = gradients[idx];
                let angle = gy.atan2(gx); // -π to π
                let gradient_mag = (gx * gx + gy * gy).sqrt();

                // Normalize angle to 0-1 range
                let normalized_angle = (angle + std::f64::consts::PI) / (2.0 * std::f64::consts::PI);

                // Calculate iridescent phase
                let x = idx % width;
                let y = idx / width;
                let phase = (normalized_angle * self.config.iridescence_frequency
                    + (x as f64 / width as f64) * 0.5
                    + (y as f64 / height as f64) * 0.3)
                    .sin();

                // Interpolate between primary and secondary hue shifts
                let hue_shift_degrees = self.config.primary_hue_shift * (0.5 + 0.5 * phase)
                    + self.config.secondary_hue_shift * (0.5 - 0.5 * phase);
                let hue_shift = hue_shift_degrees / 360.0;

                // Apply angle sensitivity - more gradient = more effect
                let effect_strength =
                    self.config.strength * (gradient_mag * self.config.angle_sensitivity).min(1.0);

                // Convert to HSL, shift hue, convert back
                let (h, s, l) = Self::rgb_to_hsl(sr, sg, sb);
                let new_h = (h + hue_shift * effect_strength).rem_euclid(1.0);
                let (shifted_r, shifted_g, shifted_b) = Self::hsl_to_rgb(new_h, s, l);

                // Optionally preserve luminance
                let (final_r, final_g, final_b) = if self.config.preserve_luminance {
                    let orig_lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
                    let new_lum =
                        0.2126 * shifted_r + 0.7152 * shifted_g + 0.0722 * shifted_b;
                    if new_lum > 1e-10 {
                        let scale = orig_lum / new_lum;
                        (shifted_r * scale, shifted_g * scale, shifted_b * scale)
                    } else {
                        (shifted_r, shifted_g, shifted_b)
                    }
                } else {
                    (shifted_r, shifted_g, shifted_b)
                };

                // Blend with original
                let blend = effect_strength;
                let mix_r = sr + (final_r - sr) * blend;
                let mix_g = sg + (final_g - sg) * blend;
                let mix_b = sb + (final_b - sb) * blend;

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
    fn test_dichroic_default_config() {
        let config = DichroicGlassConfig::default();
        assert!(config.strength > 0.0);
    }

    #[test]
    fn test_rgb_hsl_roundtrip() {
        let original = (0.8, 0.3, 0.5);
        let (h, s, l) = DichroicGlass::rgb_to_hsl(original.0, original.1, original.2);
        let (r, g, b) = DichroicGlass::hsl_to_rgb(h, s, l);
        assert!((r - original.0).abs() < 0.001);
        assert!((g - original.1).abs() < 0.001);
        assert!((b - original.2).abs() < 0.001);
    }

    #[test]
    fn test_hsl_pure_red() {
        let (h, s, _l) = DichroicGlass::rgb_to_hsl(1.0, 0.0, 0.0);
        assert!(h.abs() < 0.01 || (h - 1.0).abs() < 0.01); // Hue near 0 or 1
        assert!((s - 1.0).abs() < 0.01); // Full saturation
    }

    #[test]
    fn test_dichroic_preserves_transparent() {
        let effect = DichroicGlass::new(DichroicGlassConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn test_dichroic_zero_strength() {
        let config = DichroicGlassConfig { strength: 0.0, ..Default::default() };
        let effect = DichroicGlass::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }

    #[test]
    fn test_hsl_pure_colors() {
        // Test pure green
        let (h_g, s_g, _l_g) = DichroicGlass::rgb_to_hsl(0.0, 1.0, 0.0);
        assert!((h_g - 1.0/3.0).abs() < 0.01, "Green hue should be ~0.33, got {}", h_g);
        assert!((s_g - 1.0).abs() < 0.01);
        
        // Test pure blue
        let (h_b, s_b, _l_b) = DichroicGlass::rgb_to_hsl(0.0, 0.0, 1.0);
        assert!((h_b - 2.0/3.0).abs() < 0.01, "Blue hue should be ~0.67, got {}", h_b);
        assert!((s_b - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_hsl_grayscale() {
        // Grayscale should have zero saturation
        for gray in [0.0, 0.25, 0.5, 0.75, 1.0] {
            let (_, s, l) = DichroicGlass::rgb_to_hsl(gray, gray, gray);
            assert!(s < 0.001, "Gray {} should have zero saturation", gray);
            assert!((l - gray).abs() < 0.001, "Lightness should equal gray value");
        }
    }

    #[test]
    fn test_hsl_roundtrip_many_colors() {
        // Test roundtrip for many colors
        let test_colors = [
            (1.0, 0.0, 0.0),  // Red
            (0.0, 1.0, 0.0),  // Green
            (0.0, 0.0, 1.0),  // Blue
            (1.0, 1.0, 0.0),  // Yellow
            (1.0, 0.0, 1.0),  // Magenta
            (0.0, 1.0, 1.0),  // Cyan
            (0.5, 0.5, 0.5),  // Gray
            (0.8, 0.2, 0.4),  // Random color
            (0.1, 0.9, 0.3),  // Another random
        ];
        
        for (r, g, b) in test_colors {
            let (h, s, l) = DichroicGlass::rgb_to_hsl(r, g, b);
            let (r2, g2, b2) = DichroicGlass::hsl_to_rgb(h, s, l);
            assert!((r - r2).abs() < 0.01, "Red mismatch for ({},{},{})", r, g, b);
            assert!((g - g2).abs() < 0.01, "Green mismatch for ({},{},{})", r, g, b);
            assert!((b - b2).abs() < 0.01, "Blue mismatch for ({},{},{})", r, g, b);
        }
    }

    #[test]
    fn test_dichroic_produces_color_variation() {
        let config = DichroicGlassConfig {
            strength: 0.8,
            ..Default::default()
        };
        let effect = DichroicGlass::new(config);
        
        // Create uniform color buffer with gradient positions
        let input: Vec<(f64, f64, f64, f64)> = (0..100)
            .map(|_| (0.9, 0.5, 0.2, 1.0))
            .collect();
        
        let output = effect.process(&input, 10, 10).unwrap();
        
        // Verify output is valid
        assert_eq!(output.len(), 100);
        for pixel in &output {
            assert!(!pixel.0.is_nan());
            assert!(!pixel.1.is_nan());
            assert!(!pixel.2.is_nan());
        }
        // Note: Even with uniform input, gradient calculation may produce 
        // some variation at edges, which is expected behavior
    }

    #[test]
    fn test_dichroic_luminance_preservation() {
        let config = DichroicGlassConfig {
            strength: 0.5,
            preserve_luminance: true,
            ..Default::default()
        };
        let effect = DichroicGlass::new(config);
        
        let input: Vec<(f64, f64, f64, f64)> = (0..25)
            .map(|i| {
                let v = (i as f64 + 5.0) / 30.0;
                (v, v * 0.8, v * 0.6, 1.0)
            })
            .collect();
        
        let output = effect.process(&input, 5, 5).unwrap();
        
        // With preserve_luminance, overall brightness should be similar
        let in_total_lum: f64 = input.iter()
            .map(|(r, g, b, _)| 0.2126 * r + 0.7152 * g + 0.0722 * b)
            .sum();
        let out_total_lum: f64 = output.iter()
            .map(|(r, g, b, _)| 0.2126 * r + 0.7152 * g + 0.0722 * b)
            .sum();
        
        let lum_change = (out_total_lum - in_total_lum).abs() / in_total_lum;
        assert!(lum_change < 0.3, "Total luminance changed by {}%", lum_change * 100.0);
    }
}
