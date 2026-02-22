//! Opalescent iridescence effect for gem-like, angle-dependent color shimmer.
//!
//! This effect simulates the optical phenomenon of opalescence where color appears
//! to shift based on viewing angle, creating the appearance of precious opals,
//! dichroic glass, or butterfly wings. It adds subtle, sophisticated color shifts
//! that enhance the perception of depth and material quality.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for opalescence effect
#[derive(Clone, Debug)]
pub struct OpalescenceConfig {
    /// Overall strength of the opalescent effect (0.0-1.0)
    pub strength: f64,
    /// Scale of the opalescent patterns (larger = bigger features)
    pub scale: f64,
    /// Number of color layers for depth (2-4 recommended)
    pub layers: usize,
    /// Shift hue based on luminance (creates rainbow effect)
    pub chromatic_shift: f64,
    /// Angle dependency strength (higher = more angle-sensitive)
    pub angle_sensitivity: f64,
    /// Pearl-like sheen in highlights
    pub pearl_sheen: f64,
}

impl Default for OpalescenceConfig {
    fn default() -> Self {
        let base_scale = (1920.0_f64 * 1080.0).sqrt();
        Self {
            strength: 0.18,
            scale: base_scale * 0.008,
            layers: 3,
            chromatic_shift: 0.35,
            angle_sensitivity: 1.25,
            pearl_sheen: 0.22,
        }
    }
}

/// Opalescence post-effect
pub struct Opalescence {
    config: OpalescenceConfig,
    enabled: bool,
}

impl Opalescence {
    pub fn new(config: OpalescenceConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Fast 2D hash function for pseudo-random pattern generation
    #[inline]
    fn hash2d(x: f64, y: f64, seed: f64) -> f64 {
        ((x * 127.1 + y * 311.7 + seed * 419.3).sin() * 43758.5453).fract()
    }

    /// Smooth noise using bilinear interpolation
    #[inline]
    fn smooth_noise(&self, x: f64, y: f64, seed: f64) -> f64 {
        let ix = x.floor();
        let iy = y.floor();
        let fx = x - ix;
        let fy = y - iy;

        // Smooth interpolation (smoothstep)
        let sx = fx * fx * (3.0 - 2.0 * fx);
        let sy = fy * fy * (3.0 - 2.0 * fy);

        // Get corner values
        let v00 = Self::hash2d(ix, iy, seed);
        let v10 = Self::hash2d(ix + 1.0, iy, seed);
        let v01 = Self::hash2d(ix, iy + 1.0, seed);
        let v11 = Self::hash2d(ix + 1.0, iy + 1.0, seed);

        // Bilinear interpolation
        let v0 = v00 * (1.0 - sx) + v10 * sx;
        let v1 = v01 * (1.0 - sx) + v11 * sx;
        v0 * (1.0 - sy) + v1 * sy
    }

    /// Calculate angle-dependent color shift
    /// Simulates thin-film interference patterns
    #[inline]
    fn interference_color(&self, x: f64, y: f64, luminance: f64) -> (f64, f64, f64) {
        // Create multi-layer interference pattern
        let mut hue_shift = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = 1.0;

        for i in 0..self.config.layers {
            let layer_seed = (i + 1) as f64 * 91.234;
            let noise = self.smooth_noise(
                x * frequency / self.config.scale,
                y * frequency / self.config.scale,
                layer_seed,
            );

            // Angle simulation: use gradient-like patterns
            let angle_factor = ((x / self.config.scale * 0.3 + noise * 2.0).sin()
                + (y / self.config.scale * 0.3 + noise * 2.0).cos())
                * 0.5;

            hue_shift += angle_factor * amplitude * self.config.angle_sensitivity;
            amplitude *= 0.6;
            frequency *= 1.8;
        }

        // Add luminance-dependent chromatic shift (thin-film interference)
        hue_shift += luminance * self.config.chromatic_shift * 360.0;

        // Convert hue shift to RGB color shift
        let hue_rad = hue_shift.to_radians();
        let shift_r = hue_rad.cos() * 0.5 + 0.5;
        let shift_g = (hue_rad + std::f64::consts::TAU / 3.0).cos() * 0.5 + 0.5;
        let shift_b = (hue_rad + 2.0 * std::f64::consts::TAU / 3.0).cos() * 0.5 + 0.5;

        (shift_r, shift_g, shift_b)
    }

    /// Calculate pearl-like sheen in highlights
    #[inline]
    fn pearl_sheen(&self, luminance: f64) -> f64 {
        if luminance < 0.5 {
            0.0
        } else {
            // Smooth highlight boost
            let highlight = (luminance - 0.5) * 2.0;
            highlight.powf(2.5) * self.config.pearl_sheen
        }
    }
}

impl PostEffect for Opalescence {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        _height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

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

                // Calculate luminance
                let lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;

                // Pixel coordinates
                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                // Get opalescent color shift
                let (shift_r, shift_g, shift_b) = self.interference_color(x, y, lum);

                // Apply color shift with strength control
                let strength = self.config.strength;
                let mut final_r = sr * (1.0 - strength) + (sr * shift_r * 1.3) * strength;
                let mut final_g = sg * (1.0 - strength) + (sg * shift_g * 1.3) * strength;
                let mut final_b = sb * (1.0 - strength) + (sb * shift_b * 1.3) * strength;

                // Add pearl sheen to highlights
                let sheen = self.pearl_sheen(lum);
                if sheen > 0.0 {
                    // Pearl sheen has a slight cool tint
                    final_r += sheen * 0.95;
                    final_g += sheen * 0.98;
                    final_b += sheen * 1.00;
                }

                // Preserve relative color relationships (avoid over-saturation)
                let max_out = final_r.max(final_g).max(final_b);
                if max_out > 1.2 {
                    let scale = 1.2 / max_out;
                    final_r *= scale;
                    final_g *= scale;
                    final_b *= scale;
                }

                // Convert back to premultiplied alpha
                (
                    (final_r * a).max(0.0).min(a * 1.2),
                    (final_g * a).max(0.0).min(a * 1.2),
                    (final_b * a).max(0.0).min(a * 1.2),
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
    fn test_opalescence_disabled() {
        let config = OpalescenceConfig {
            strength: 0.0,
            ..OpalescenceConfig::default()
        };
        let opal = Opalescence::new(config);
        assert!(!opal.is_enabled());
    }

    #[test]
    fn test_opalescence_enabled() {
        let config = OpalescenceConfig::default();
        let opal = Opalescence::new(config);
        assert!(opal.is_enabled());
    }

    #[test]
    fn test_hash_determinism() {
        let h1 = Opalescence::hash2d(100.0, 200.0, 42.0);
        let h2 = Opalescence::hash2d(100.0, 200.0, 42.0);
        assert_eq!(h1, h2, "Hash should be deterministic");
    }

    #[test]
    fn test_hash_variation() {
        let h1 = Opalescence::hash2d(100.0, 200.0, 42.0);
        let h2 = Opalescence::hash2d(101.0, 200.0, 42.0);
        assert_ne!(h1, h2, "Different inputs should produce different hashes");
    }

    #[test]
    fn test_buffer_processing() {
        let config = OpalescenceConfig::default();
        let opal = Opalescence::new(config);

        // Create test buffer with varying luminance
        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = (i as f64 / 10000.0) * 0.5;
                (val, val, val, 1.0)
            })
            .collect();

        let result = opal.process(&buffer, 100, 100).unwrap();

        // Verify colors have been shifted
        assert_eq!(result.len(), buffer.len());
        let has_shift = buffer
            .iter()
            .zip(result.iter())
            .any(|(&orig, &proc)| {
                (orig.0 - proc.0).abs() > 0.001
                    || (orig.1 - proc.1).abs() > 0.001
                    || (orig.2 - proc.2).abs() > 0.001
            });
        assert!(has_shift, "Opalescence should modify colors");
    }
}

