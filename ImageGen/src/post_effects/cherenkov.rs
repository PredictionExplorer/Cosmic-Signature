//! Cherenkov radiation effect for high-velocity visualization.
//!
//! This effect simulates the characteristic blue glow that occurs when particles
//! travel faster than light in a medium (Cherenkov radiation). While the physics
//! don't literally apply to our orbital mechanics, the visual metaphor of "extreme
//! velocity" creating a distinctive cold, directional glow is powerful.
//!
//! # Physics Inspiration
//!
//! Real Cherenkov radiation:
//! - Occurs when particles exceed the phase velocity of light in a medium
//! - Creates a characteristic blue/UV glow (short wavelengths)
//! - Forms a directional cone of light (like a sonic boom for light)
//!
//! # Implementation
//!
//! Since post-effects don't have direct access to velocity vectors, we approximate
//! using brightness (which correlates with velocity via `VelocityHdrCalculator`):
//! 1. High-brightness regions are treated as high-velocity
//! 2. Directional blur creates the "wake" effect
//! 3. Blue/UV color shift emphasizes the cold, high-energy nature

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for Cherenkov radiation effect
#[derive(Clone, Debug)]
pub struct CherenkovConfig {
    /// Overall strength of the Cherenkov effect (0.0-1.0)
    pub strength: f64,
    /// Velocity/energy threshold (luminance) for Cherenkov emission
    pub threshold: f64,
    /// Directional blur radius (creates the "wake")
    pub blur_radius: f64,
    /// Blue color intensity (0.0-1.0)
    pub blue_intensity: f64,
    /// UV (violet) color intensity (0.0-1.0)
    pub uv_intensity: f64,
    /// Cone angle in degrees (wider = more diffuse)
    pub cone_angle: f64,
    /// Glow falloff exponent (higher = sharper)
    pub falloff: f64,
}

impl Default for CherenkovConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl CherenkovConfig {
    /// Configuration optimized for special mode (dramatic blue trails)
    pub fn special_mode() -> Self {
        Self {
            strength: 0.55,       // Strong but not overwhelming
            threshold: 0.65,      // Only very bright/fast regions emit
            blur_radius: 8.0,     // Noticeable directional blur
            blue_intensity: 0.85, // Strong blue component
            uv_intensity: 0.45,   // Moderate violet for variety
            cone_angle: 25.0,     // Focused cone
            falloff: 2.2,         // Sharp falloff from center
        }
    }

    /// Configuration for standard mode (subtle high-velocity hints)
    #[allow(dead_code)] // Public API for library consumers
    pub fn standard_mode() -> Self {
        Self {
            strength: 0.30,
            threshold: 0.72,
            blur_radius: 5.0,
            blue_intensity: 0.70,
            uv_intensity: 0.30,
            cone_angle: 20.0,
            falloff: 2.5,
        }
    }
}

/// Cherenkov radiation post-effect
pub struct Cherenkov {
    config: CherenkovConfig,
    enabled: bool,
}

impl Cherenkov {
    /// Create a new Cherenkov radiation effect
    pub fn new(config: CherenkovConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Extract high-velocity/energy pixels as Cherenkov emitters
    ///
    /// Returns a buffer where only bright pixels (above threshold) emit blue light.
    fn extract_emitters(&self, input: &PixelBuffer) -> PixelBuffer {
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 0.0 {
                    return (0.0, 0.0, 0.0, 0.0);
                }

                // Calculate luminance
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                // Threshold - only high-energy regions emit Cherenkov
                if lum < self.config.threshold {
                    return (0.0, 0.0, 0.0, 0.0);
                }

                // Boost factor based on how far above threshold
                let energy =
                    ((lum - self.config.threshold) / (1.0 - self.config.threshold)).clamp(0.0, 1.0);
                let boost = energy.powf(self.config.falloff);

                // Emit pure blue/UV light (not original color)
                let blue = self.config.blue_intensity * boost;
                let uv = self.config.uv_intensity * boost;

                // Cherenkov is characteristically blue/violet
                (uv * 0.6, uv * 0.4 + blue * 0.2, blue, a * boost)
            })
            .collect()
    }

    /// Apply directional blur to create the "cone" effect
    ///
    /// In real Cherenkov radiation, the cone points in the direction of motion.
    /// We approximate by using gradient direction as motion direction.
    fn apply_directional_blur(
        &self,
        emitters: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> PixelBuffer {
        // Calculate motion direction from luminance gradients
        let gradients: Vec<(f64, f64)> = emitters
            .par_iter()
            .enumerate()
            .map(|(idx, _)| {
                let x = idx % width;
                let y = idx / width;

                if x == 0 || x >= width - 1 || y == 0 || y >= height - 1 {
                    return (0.0, 0.0);
                }

                // Sobel operator for gradient
                let get_lum = |dx: i32, dy: i32| {
                    let nx = (x as i32 + dx).max(0).min((width - 1) as i32) as usize;
                    let ny = (y as i32 + dy).max(0).min((height - 1) as i32) as usize;
                    let (r, g, b, a) = emitters[ny * width + nx];
                    if a <= 0.0 { 0.0 } else { 0.2126 * r + 0.7152 * g + 0.0722 * b }
                };

                let gx = get_lum(1, 0) - get_lum(-1, 0);
                let gy = get_lum(0, 1) - get_lum(0, -1);

                (gx, gy)
            })
            .collect();

        // Apply directional blur
        emitters
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let x = idx % width;
                let y = idx / width;
                let (gx, gy) = gradients[idx];

                // Direction of motion (normalized)
                let dir_mag = (gx * gx + gy * gy).sqrt();
                let (dir_x, dir_y) = if dir_mag > 0.001 {
                    (gx / dir_mag, gy / dir_mag)
                } else {
                    (1.0, 0.0) // Default direction if no gradient
                };

                // Sample along the motion direction (cone behind the particle)
                let mut acc_r = r;
                let mut acc_g = g;
                let mut acc_b = b;
                let mut acc_a = a;
                let mut weight_sum = 1.0;

                let samples = (self.config.blur_radius as usize).max(1);
                let cone_rad = self.config.cone_angle.to_radians();

                for i in 1..=samples {
                    let t = i as f64;

                    // Sample along direction with cone spread
                    for j in -1..=1 {
                        let spread = (j as f64) * cone_rad;
                        let sample_x = x as f64 - dir_x * t + dir_y * spread * t / samples as f64;
                        let sample_y = y as f64 - dir_y * t - dir_x * spread * t / samples as f64;

                        if sample_x < 0.0
                            || sample_x >= (width - 1) as f64
                            || sample_y < 0.0
                            || sample_y >= (height - 1) as f64
                        {
                            continue;
                        }

                        let sx = sample_x as usize;
                        let sy = sample_y as usize;
                        let sidx = sy * width + sx;

                        let weight = (1.0 - t / samples as f64).max(0.0);
                        let (sr, sg, sb, sa) = emitters[sidx];

                        acc_r += sr * weight;
                        acc_g += sg * weight;
                        acc_b += sb * weight;
                        acc_a += sa * weight;
                        weight_sum += weight;
                    }
                }

                // Normalize
                (acc_r / weight_sum, acc_g / weight_sum, acc_b / weight_sum, acc_a / weight_sum)
            })
            .collect()
    }
}

impl PostEffect for Cherenkov {
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

        // 1. Extract high-energy emitters
        let emitters = self.extract_emitters(input);

        // 2. Apply directional blur to create cone effect
        let cherenkov_glow = self.apply_directional_blur(&emitters, width, height);

        // 3. Composite onto original with additive blending
        let output: PixelBuffer = input
            .par_iter()
            .zip(cherenkov_glow.par_iter())
            .map(|(&(r, g, b, a), &(cr, cg, cb, _))| {
                let strength = self.config.strength;
                (r + cr * strength, g + cg * strength, b + cb * strength, a)
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
    fn test_cherenkov_disabled() {
        let config = CherenkovConfig { strength: 0.0, ..CherenkovConfig::default() };
        let effect = Cherenkov::new(config);
        assert!(!effect.is_enabled());
    }

    #[test]
    fn test_cherenkov_enabled() {
        let config = CherenkovConfig::default();
        let effect = Cherenkov::new(config);
        assert!(effect.is_enabled());
    }

    #[test]
    fn test_cherenkov_basic() {
        let config = CherenkovConfig::default();
        let effect = Cherenkov::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let result = effect.process(&buffer, 100, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_cherenkov_handles_zero() {
        let config = CherenkovConfig::default();
        let effect = Cherenkov::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let result = effect.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cherenkov_handles_hdr() {
        let config = CherenkovConfig::default();
        let effect = Cherenkov::new(config);
        let buffer = test_buffer(50, 50, 5.0);

        let result = effect.process(&buffer, 50, 50);
        assert!(result.is_ok());
        for &(r, g, b, _) in &result.unwrap() {
            assert!(r.is_finite());
            assert!(g.is_finite());
            assert!(b.is_finite());
        }
    }

    #[test]
    fn test_emitter_extraction_respects_threshold() {
        let config = CherenkovConfig { threshold: 0.5, ..CherenkovConfig::default() };
        let effect = Cherenkov::new(config);

        // Create buffer with varying brightness
        let buffer: PixelBuffer = (0..100)
            .map(|i| {
                let val = i as f64 / 100.0;
                (val, val, val, 1.0)
            })
            .collect();

        let emitters = effect.extract_emitters(&buffer);

        // Low luminance should not emit
        let (r0, g0, b0, _) = emitters[0];
        assert!(r0 < 0.01 && g0 < 0.01 && b0 < 0.01);

        // High luminance should emit blue
        let (r99, _g99, b99, _) = emitters[99];
        assert!(b99 > r99); // Should be more blue than red
    }

    #[test]
    fn test_cherenkov_adds_blue() {
        let config = CherenkovConfig {
            threshold: 0.3, // Low threshold to ensure emission
            ..CherenkovConfig::default()
        };
        let effect = Cherenkov::new(config);

        // Create bright test buffer (well above threshold)
        let buffer = test_buffer(50, 50, 0.9);
        let result = effect.process(&buffer, 50, 50).unwrap();

        // Cherenkov should add blue tint
        let center_idx = 25 * 50 + 25;
        let (r_out, _g_out, b_out, _) = result[center_idx];
        let (r_in, _g_in, b_in, _) = buffer[center_idx];

        // Blue should be enhanced more than red
        let blue_increase = b_out - b_in;
        let red_increase = r_out - r_in;
        assert!(blue_increase > red_increase);
    }

    #[test]
    fn test_output_values_finite() {
        let config = CherenkovConfig::default();
        let effect = Cherenkov::new(config);

        // Create varied test buffer
        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 0.8;
                (val, val * 0.9, val * 1.1, 1.0)
            })
            .collect();

        let result = effect.process(&buffer, 100, 100).unwrap();

        // All outputs should be finite
        for &(r, g, b, a) in &result {
            assert!(r.is_finite(), "Red channel not finite");
            assert!(g.is_finite(), "Green channel not finite");
            assert!(b.is_finite(), "Blue channel not finite");
            assert!(a.is_finite(), "Alpha channel not finite");
        }
    }
}
