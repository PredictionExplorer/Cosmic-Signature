//! Aurora veils effect for atmospheric majesty.
//!
//! This effect creates vertical, curtain-like veils of shimmering light reminiscent
//! of the Aurora Borealis. The veils add profound depth and scale, making the
//! trajectories feel like they're floating in a vast, active cathedral of space.
//!
//! # Artistic Concept
//!
//! By adding vertical structures to a primarily horizontal/orbital visualization,
//! we create a sense of three-dimensional space and atmospheric presence. The
//! curtains provide context and scale while not overwhelming the main trajectories.
//!
//! # Implementation
//!
//! Uses layered Perlin noise to generate organic, flowing curtain shapes with
//! gentle animation potential (via time parameter) and color gradients that
//! evoke natural aurora colors (green, purple, pink, blue).

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for aurora veils effect
#[derive(Clone, Debug)]
pub struct AuroraVeilsConfig {
    /// Overall strength/opacity of the aurora veils (0.0-1.0)
    pub strength: f64,
    /// Number of vertical curtains/veils
    pub curtain_count: usize,
    /// Height variation (0.0 = flat, 1.0 = full variation)
    pub height_variation: f64,
    /// Horizontal wave amplitude
    pub wave_amplitude: f64,
    /// Vertical gradient power (higher = more concentrated at top)
    pub vertical_falloff: f64,
    /// Color palette for aurora (4 colors: base, mid, highlight, peak)
    pub colors: [(f64, f64, f64); 4],
    /// Shimmer/animation frequency
    pub shimmer_frequency: f64,
    /// Softness of curtain edges (0.0 = sharp, 1.0 = very soft)
    pub edge_softness: f64,
}

impl Default for AuroraVeilsConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl AuroraVeilsConfig {
    /// Configuration optimized for special mode (dramatic aurora)
    pub fn special_mode() -> Self {
        Self {
            strength: 0.35,              // Visible but not overwhelming
            curtain_count: 5,             // Multiple overlapping curtains
            height_variation: 0.75,       // Strong vertical movement
            wave_amplitude: 0.12,         // Noticeable horizontal undulation
            vertical_falloff: 1.8,        // Concentrated in upper regions
            colors: [
                (0.15, 0.45, 0.35),      // Deep teal base
                (0.25, 0.65, 0.45),      // Emerald green mid
                (0.55, 0.35, 0.65),      // Purple highlight
                (0.75, 0.55, 0.75),      // Pale magenta peak
            ],
            shimmer_frequency: 0.8,
            edge_softness: 0.65,
        }
    }

    /// Configuration for standard mode (subtle atmospheric hints)
    #[allow(dead_code)] // Public API for library consumers
    pub fn standard_mode() -> Self {
        Self {
            strength: 0.18,
            curtain_count: 3,
            height_variation: 0.55,
            wave_amplitude: 0.08,
            vertical_falloff: 2.2,
            colors: [
                (0.10, 0.30, 0.25),
                (0.18, 0.45, 0.35),
                (0.35, 0.25, 0.45),
                (0.50, 0.40, 0.55),
            ],
            shimmer_frequency: 0.6,
            edge_softness: 0.75,
        }
    }
}

/// Aurora veils post-effect
pub struct AuroraVeils {
    config: AuroraVeilsConfig,
    enabled: bool,
}

impl AuroraVeils {
    /// Create a new aurora veils effect
    pub fn new(config: AuroraVeilsConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Simple 2D hash for noise generation
    #[inline]
    fn hash(x: f64, y: f64) -> f64 {
        let x = x.floor();
        let y = y.floor();
        let n = x * 127.1 + y * 311.7;
        (n.sin() * 43758.5453).fract() * 2.0 - 1.0
    }

    /// Perlin-style noise
    fn perlin_noise(&self, x: f64, y: f64) -> f64 {
        let ix = x.floor();
        let iy = y.floor();
        let fx = x - ix;
        let fy = y - iy;

        // Smoothstep interpolation
        let sx = fx * fx * (3.0 - 2.0 * fx);
        let sy = fy * fy * (3.0 - 2.0 * fy);

        // Get gradients at corners
        let g00 = Self::hash(ix, iy);
        let g10 = Self::hash(ix + 1.0, iy);
        let g01 = Self::hash(ix, iy + 1.0);
        let g11 = Self::hash(ix + 1.0, iy + 1.0);

        // Interpolate
        let n0 = g00 * (1.0 - sx) + g10 * sx;
        let n1 = g01 * (1.0 - sx) + g11 * sx;
        n0 * (1.0 - sy) + n1 * sy
    }

    /// Multi-octave noise for rich detail
    fn fbm_noise(&self, x: f64, y: f64, octaves: usize) -> f64 {
        let mut total = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = 1.0;
        let mut max_value = 0.0;

        for _ in 0..octaves {
            total += self.perlin_noise(x * frequency, y * frequency) * amplitude;
            max_value += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }

        (total / max_value) * 0.5 + 0.5 // Normalize to [0, 1]
    }

    /// Generate aurora curtain intensity at a given pixel
    fn generate_aurora_intensity(&self, x: usize, y: usize, width: usize, height: usize) -> (f64, f64) {
        let nx = x as f64 / width as f64;
        let ny = y as f64 / height as f64;

        let mut total_intensity = 0.0;
        let mut color_variation = 0.0;

        // Generate multiple overlapping curtains
        for i in 0..self.config.curtain_count {
            let curtain_offset = (i as f64) / (self.config.curtain_count as f64);

            // Horizontal position with wave
            let wave = self.perlin_noise(ny * 3.0 + curtain_offset * 10.0, curtain_offset * 5.0);
            let curtain_x = curtain_offset + wave * self.config.wave_amplitude;

            // Distance from this curtain
            let dist_x = (nx - curtain_x).abs();

            // Curtain width influenced by height
            let width_factor = 0.03 + ny * 0.02;
            let curtain_strength = (1.0 - (dist_x / width_factor)).max(0.0);

            // Vertical intensity (stronger at top)
            let vertical_intensity = (1.0 - ny).powf(self.config.vertical_falloff);

            // Height variation using noise
            let height_noise = self.fbm_noise(
                nx * 2.0 + curtain_offset * 5.0,
                curtain_offset * 3.0,
                3,
            );
            let height_modulation =
                1.0 - (height_noise - 0.5).abs() * self.config.height_variation;

            // Shimmer effect
            let shimmer = self.perlin_noise(
                ny * self.config.shimmer_frequency * 5.0,
                curtain_offset * 7.0,
            ) * 0.2
                + 0.8;

            // Combine factors with soft edge
            let edge_smooth = curtain_strength.powf(1.0 / self.config.edge_softness);
            let intensity = edge_smooth * vertical_intensity * height_modulation * shimmer;

            total_intensity += intensity;
            color_variation += intensity * (curtain_offset + height_noise * 0.3);
        }

        // Normalize and clamp
        total_intensity = (total_intensity / self.config.curtain_count as f64).clamp(0.0, 1.0);
        color_variation = (color_variation / total_intensity.max(0.001)).fract();

        (total_intensity, color_variation)
    }

    /// Map intensity and variation to aurora color
    fn aurora_color(&self, intensity: f64, variation: f64) -> (f64, f64, f64) {
        // Select color from palette based on variation
        let color_index = variation * (self.config.colors.len() - 1) as f64;
        let idx = color_index.floor() as usize;
        let frac = color_index.fract();

        let c0 = self.config.colors[idx.min(self.config.colors.len() - 1)];
        let c1 = self.config.colors[(idx + 1).min(self.config.colors.len() - 1)];

        // Interpolate between colors
        let r = c0.0 + (c1.0 - c0.0) * frac;
        let g = c0.1 + (c1.1 - c0.1) * frac;
        let b = c0.2 + (c1.2 - c0.2) * frac;

        // Scale by intensity
        (r * intensity, g * intensity, b * intensity)
    }
}

impl PostEffect for AuroraVeils {
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

        // Generate aurora and composite
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let x = idx % width;
                let y = idx / width;

                let (intensity, variation) =
                    self.generate_aurora_intensity(x, y, width, height);

                if intensity < 0.01 {
                    return (r, g, b, a);
                }

                let (ar, ag, ab) = self.aurora_color(intensity, variation);

                // Screen blending (lightens)
                let strength = self.config.strength;
                let final_r = r + ar * strength * (1.0 - r);
                let final_g = g + ag * strength * (1.0 - g);
                let final_b = b + ab * strength * (1.0 - b);

                (final_r, final_g, final_b, a)
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
    fn test_aurora_veils_disabled() {
        let config = AuroraVeilsConfig {
            strength: 0.0,
            ..AuroraVeilsConfig::default()
        };
        let effect = AuroraVeils::new(config);
        assert!(!effect.is_enabled());
    }

    #[test]
    fn test_aurora_veils_enabled() {
        let config = AuroraVeilsConfig::default();
        let effect = AuroraVeils::new(config);
        assert!(effect.is_enabled());
    }

    #[test]
    fn test_aurora_veils_basic() {
        let config = AuroraVeilsConfig::default();
        let effect = AuroraVeils::new(config);
        let buffer = test_buffer(100, 100, 0.2);

        let result = effect.process(&buffer, 100, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_aurora_veils_handles_zero() {
        let config = AuroraVeilsConfig::default();
        let effect = AuroraVeils::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let result = effect.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_aurora_veils_adds_light() {
        let config = AuroraVeilsConfig::default();
        let effect = AuroraVeils::new(config);
        let buffer = test_buffer(100, 100, 0.1);

        let result = effect.process(&buffer, 100, 100).unwrap();

        // Aurora should add light (screen blending)
        let has_added_light = result
            .iter()
            .zip(buffer.iter())
            .any(|(&(r_out, g_out, b_out, _), &(r_in, g_in, b_in, _))| {
                r_out > r_in || g_out > g_in || b_out > b_in
            });

        assert!(has_added_light);
    }

    #[test]
    fn test_noise_deterministic() {
        let config = AuroraVeilsConfig::default();
        let effect = AuroraVeils::new(config);

        let n1 = effect.perlin_noise(5.0, 7.0);
        let n2 = effect.perlin_noise(5.0, 7.0);
        assert_eq!(n1, n2);
    }

    #[test]
    fn test_output_values_finite() {
        let config = AuroraVeilsConfig::default();
        let effect = AuroraVeils::new(config);

        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 0.5;
                (val, val * 0.8, val * 1.2, 1.0)
            })
            .collect();

        let result = effect.process(&buffer, 100, 100).unwrap();

        for &(r, g, b, a) in &result {
            assert!(r.is_finite(), "Red channel not finite");
            assert!(g.is_finite(), "Green channel not finite");
            assert!(b.is_finite(), "Blue channel not finite");
            assert!(a.is_finite(), "Alpha channel not finite");
        }
    }
}

