//! Atmospheric depth effect for cinematic dimensionality.
//!
//! This effect simulates atmospheric perspective by desaturating and tinting
//! pixels based on perceived depth (derived from local density and luminance).
//! Creates the impression of depth fog, aerial perspective, and volumetric atmosphere.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for atmospheric depth effect
#[derive(Clone, Debug)]
pub struct AtmosphericDepthConfig {
    /// Overall strength of the atmospheric effect (0.0-1.0)
    pub strength: f64,
    /// Fog color (the atmospheric tint applied to distant areas)
    pub fog_color: (f64, f64, f64),
    /// Density threshold for depth perception (lower = more effect)
    pub density_threshold: f64,
    /// Desaturation strength for distant areas
    pub desaturation: f64,
    /// Luminance reduction for distant areas
    pub darkening: f64,
    /// Neighborhood radius for density estimation
    pub density_radius: usize,
}

impl Default for AtmosphericDepthConfig {
    fn default() -> Self {
        Self {
            strength: 0.28,
            fog_color: (0.08, 0.12, 0.22),
            density_threshold: 0.15,
            desaturation: 0.45,
            darkening: 0.18,
            density_radius: 3,
        }
    }
}

/// Atmospheric depth post-effect
pub struct AtmosphericDepth {
    config: AtmosphericDepthConfig,
    enabled: bool,
}

impl AtmosphericDepth {
    pub fn new(config: AtmosphericDepthConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Calculate local density (average alpha in neighborhood)
    /// Higher density = foreground, lower density = background/empty space
    fn calculate_density(
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: usize,
        y: usize,
        radius: usize,
    ) -> f64 {
        let mut sum = 0.0;
        let mut count = 0;

        let x_min = x.saturating_sub(radius);
        let x_max = (x + radius).min(width - 1);
        let y_min = y.saturating_sub(radius);
        let y_max = (y + radius).min(height - 1);

        for ny in y_min..=y_max {
            for nx in x_min..=x_max {
                let idx = ny * width + nx;
                if idx < buffer.len() {
                    sum += buffer[idx].3; // alpha channel
                    count += 1;
                }
            }
        }

        if count > 0 {
            sum / count as f64
        } else {
            0.0
        }
    }

    /// Convert RGB to HSL for saturation manipulation
    fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let delta = max - min;

        let l = (max + min) * 0.5;

        if delta < 1e-10 {
            return (0.0, 0.0, l);
        }

        let s = if l < 0.5 {
            delta / (max + min)
        } else {
            delta / (2.0 - max - min)
        };

        let h = if (max - r).abs() < 1e-10 {
            ((g - b) / delta + if g < b { 6.0 } else { 0.0 }) / 6.0
        } else if (max - g).abs() < 1e-10 {
            ((b - r) / delta + 2.0) / 6.0
        } else {
            ((r - g) / delta + 4.0) / 6.0
        };

        (h, s, l)
    }

    /// Convert HSL back to RGB
    fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
        if s < 1e-10 {
            return (l, l, l);
        }

        let hue_to_rgb = |p: f64, q: f64, mut t: f64| -> f64 {
            if t < 0.0 {
                t += 1.0;
            }
            if t > 1.0 {
                t -= 1.0;
            }
            if t < 1.0 / 6.0 {
                p + (q - p) * 6.0 * t
            } else if t < 0.5 {
                q
            } else if t < 2.0 / 3.0 {
                p + (q - p) * (2.0 / 3.0 - t) * 6.0
            } else {
                p
            }
        };

        let q = if l < 0.5 {
            l * (1.0 + s)
        } else {
            l + s - l * s
        };
        let p = 2.0 * l - q;

        let r = hue_to_rgb(p, q, h + 1.0 / 3.0);
        let g = hue_to_rgb(p, q, h);
        let b = hue_to_rgb(p, q, h - 1.0 / 3.0);

        (r, g, b)
    }
}

impl PostEffect for AtmosphericDepth {
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

        // First pass: calculate density map
        let density_map: Vec<f64> = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                Self::calculate_density(input, width, height, x, y, self.config.density_radius)
            })
            .collect();

        // Second pass: apply atmospheric effects based on density
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                // Convert to straight alpha
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Get density for this pixel
                let density = density_map[idx];

                // Calculate depth factor (0.0 = foreground/dense, 1.0 = background/empty)
                let depth_factor = if density < self.config.density_threshold {
                    let normalized_density = density / self.config.density_threshold;
                    1.0 - normalized_density
                } else {
                    0.0
                };

                // Apply effect only if there's depth
                if depth_factor < 0.01 {
                    return (r, g, b, a);
                }

                // Modulate by overall strength
                let effective_depth = depth_factor * self.config.strength;

                // Desaturate based on depth
                let (_h, s, l) = Self::rgb_to_hsl(sr, sg, sb);
                let desaturated_s = s * (1.0 - effective_depth * self.config.desaturation);
                let (desat_r, desat_g, desat_b) = Self::hsl_to_rgb(_h, desaturated_s, l);

                // Apply atmospheric fog tint
                let fog_r = self.config.fog_color.0;
                let fog_g = self.config.fog_color.1;
                let fog_b = self.config.fog_color.2;

                let tinted_r = desat_r * (1.0 - effective_depth) + fog_r * effective_depth;
                let tinted_g = desat_g * (1.0 - effective_depth) + fog_g * effective_depth;
                let tinted_b = desat_b * (1.0 - effective_depth) + fog_b * effective_depth;

                // Apply luminance reduction (darkening of distant areas)
                let dark_factor = 1.0 - effective_depth * self.config.darkening;
                let final_r = tinted_r * dark_factor;
                let final_g = tinted_g * dark_factor;
                let final_b = tinted_b * dark_factor;

                // Convert back to premultiplied alpha
                (
                    (final_r * a).max(0.0),
                    (final_g * a).max(0.0),
                    (final_b * a).max(0.0),
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
    fn test_atmospheric_depth_disabled() {
        let config = AtmosphericDepthConfig {
            strength: 0.0,
            ..AtmosphericDepthConfig::default()
        };
        let atmos = AtmosphericDepth::new(config);
        assert!(!atmos.is_enabled());
    }

    #[test]
    fn test_atmospheric_depth_enabled() {
        let config = AtmosphericDepthConfig::default();
        let atmos = AtmosphericDepth::new(config);
        assert!(atmos.is_enabled());
    }

    #[test]
    fn test_rgb_hsl_conversion() {
        // Test pure red
        let (h, s, l) = AtmosphericDepth::rgb_to_hsl(1.0, 0.0, 0.0);
        let (r, g, b) = AtmosphericDepth::hsl_to_rgb(h, s, l);
        assert!((r - 1.0).abs() < 0.01);
        assert!(g < 0.01);
        assert!(b < 0.01);

        // Test gray (no saturation)
        let (_h, s, l) = AtmosphericDepth::rgb_to_hsl(0.5, 0.5, 0.5);
        assert!(s < 0.01);
        assert!((l - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_density_calculation() {
        // Create a simple buffer with varying alpha
        let buffer: PixelBuffer = (0..100)
            .map(|i| {
                let alpha = if i < 50 { 1.0 } else { 0.0 };
                (0.5, 0.5, 0.5, alpha)
            })
            .collect();

        let density = AtmosphericDepth::calculate_density(&buffer, 10, 10, 2, 2, 1);
        assert!(density > 0.5); // Should be high in dense area

        let density_far = AtmosphericDepth::calculate_density(&buffer, 10, 10, 7, 7, 1);
        assert!(density_far < 0.5); // Should be low in empty area
    }
}

