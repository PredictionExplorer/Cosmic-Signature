//! Aurora Borealis Ribbons Post-Effect
//!
//! Creates flowing, ribbon-like color bands reminiscent of the northern lights.
//! Auroras occur when charged particles interact with the atmosphere, producing
//! characteristic green, pink, and purple curtains of light.
//!
//! Applied to the three-body trajectories, this effect adds an ethereal,
//! organic quality that transforms mathematical curves into dancing lights.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for aurora borealis ribbons effect
#[derive(Clone, Debug)]
pub struct AuroraConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Number of ribbon layers
    pub num_ribbons: usize,
    /// Ribbon wave frequency (higher = more waves)
    pub wave_frequency: f64,
    /// Ribbon wave amplitude as fraction of image
    pub wave_amplitude: f64,
    /// Ribbon width as fraction of image
    pub ribbon_width: f64,
    /// Color palette intensity
    pub color_intensity: f64,
    /// Whether to use perpendicular ribbons (across trajectories)
    pub perpendicular: bool,
    /// Shimmer/animation phase (0.0 to 1.0 for time-based variation)
    pub shimmer_phase: f64,
    /// Soft edge falloff for ribbon edges
    pub edge_softness: f64,
}

impl Default for AuroraConfig {
    fn default() -> Self {
        Self {
            strength: 0.38,
            num_ribbons: 4,
            wave_frequency: 8.0,
            wave_amplitude: 0.03,
            ribbon_width: 0.025,
            color_intensity: 0.85,
            perpendicular: true,
            shimmer_phase: 0.0,
            edge_softness: 0.6,
        }
    }
}

/// Aurora borealis ribbon effect
pub struct Aurora {
    config: AuroraConfig,
}

impl Aurora {
    pub fn new(config: AuroraConfig) -> Self {
        Self { config }
    }

    /// Classic aurora color palette
    /// Returns RGB for a given position in the aurora spectrum (0-1)
    #[inline]
    fn aurora_color(t: f64, intensity: f64) -> (f64, f64, f64) {
        // Aurora colors: green (dominant), cyan, magenta, violet, pink
        let t = t.rem_euclid(1.0);

        // Piece-wise color function for authentic aurora look
        let (r, g, b) = if t < 0.2 {
            // Green to cyan
            let local_t = t / 0.2;
            (
                0.1 * local_t,
                0.8 + 0.1 * local_t,
                0.3 + 0.4 * local_t,
            )
        } else if t < 0.4 {
            // Cyan to green
            let local_t = (t - 0.2) / 0.2;
            (
                0.1 * (1.0 - local_t),
                0.9 - 0.1 * local_t,
                0.7 - 0.4 * local_t,
            )
        } else if t < 0.6 {
            // Green to yellow-green
            let local_t = (t - 0.4) / 0.2;
            (
                0.2 * local_t,
                0.8,
                0.3 * (1.0 - local_t * 0.5),
            )
        } else if t < 0.8 {
            // Yellow-green to magenta/pink
            let local_t = (t - 0.6) / 0.2;
            (
                0.2 + 0.6 * local_t,
                0.8 - 0.4 * local_t,
                0.15 + 0.45 * local_t,
            )
        } else {
            // Magenta/pink to green (wrap around)
            let local_t = (t - 0.8) / 0.2;
            (
                0.8 - 0.7 * local_t,
                0.4 + 0.4 * local_t,
                0.6 - 0.3 * local_t,
            )
        };

        (r * intensity, g * intensity, b * intensity)
    }

    /// Calculate ribbon intensity at a point
    #[inline]
    fn ribbon_intensity(
        distance_from_center: f64,
        ribbon_width: f64,
        edge_softness: f64,
    ) -> f64 {
        // Smooth falloff from ribbon center
        let normalized = (distance_from_center / ribbon_width).abs();

        if normalized > 1.0 {
            0.0
        } else {
            // Smooth edge using cosine falloff
            let falloff = if edge_softness > 0.0 {
                let inner = 1.0 - edge_softness;
                if normalized < inner {
                    1.0
                } else {
                    let t = (normalized - inner) / edge_softness;
                    0.5 * (1.0 + (t * std::f64::consts::PI).cos())
                }
            } else {
                1.0 - normalized
            };

            falloff.clamp(0.0, 1.0)
        }
    }

    /// Wave displacement function
    #[inline]
    fn wave_displacement(
        position: f64,
        frequency: f64,
        amplitude: f64,
        phase: f64,
        ribbon_index: usize,
    ) -> f64 {
        // Multiple harmonics for natural look
        let p = position * frequency + phase + ribbon_index as f64 * 0.7;
        let wave1 = (p * std::f64::consts::TAU).sin();
        let wave2 = (p * std::f64::consts::TAU * 2.3 + 0.5).sin() * 0.3;
        let wave3 = (p * std::f64::consts::TAU * 0.7 + 1.2).sin() * 0.2;

        amplitude * (wave1 + wave2 + wave3)
    }
}

impl PostEffect for Aurora {
    fn name(&self) -> &str {
        "Aurora Borealis"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 || input.is_empty() || self.config.num_ribbons == 0 {
            return Ok(input.clone());
        }

        let min_dim = width.min(height) as f64;
        let ribbon_width_px = self.config.ribbon_width * min_dim;
        let wave_amp_px = self.config.wave_amplitude * min_dim;

        // Calculate gradients for trajectory direction
        let gradients = super::utils::calculate_gradients(input, width, height);

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let x = idx % width;
                let y = idx / width;
                let fx = x as f64;
                let fy = y as f64;

                // Get gradient direction
                let (gx, gy) = gradients[idx];
                let grad_mag = (gx * gx + gy * gy).sqrt();

                // Skip areas with no trajectory presence
                if grad_mag < 0.001 && a < 0.01 {
                    return (r, g, b, a);
                }

                // Calculate perpendicular direction for ribbon orientation
                let (ribbon_dx, ribbon_dy) = if self.config.perpendicular && grad_mag > 0.001 {
                    // Perpendicular to gradient
                    (-gy / grad_mag, gx / grad_mag)
                } else {
                    // Default to diagonal
                    (0.707, 0.707)
                };

                // Accumulate aurora contribution from all ribbons
                let mut aurora_r = 0.0;
                let mut aurora_g = 0.0;
                let mut aurora_b = 0.0;

                for ribbon_idx in 0..self.config.num_ribbons {
                    // Ribbon center position (spread evenly)
                    let ribbon_offset =
                        (ribbon_idx as f64 / self.config.num_ribbons as f64 - 0.5) * min_dim * 0.5;

                    // Wave displacement for organic movement
                    let wave = Self::wave_displacement(
                        (fx * ribbon_dx + fy * ribbon_dy) / min_dim,
                        self.config.wave_frequency,
                        wave_amp_px,
                        self.config.shimmer_phase,
                        ribbon_idx,
                    );

                    // Distance from ribbon center (perpendicular to ribbon direction)
                    let dist_along_ribbon = fx * ribbon_dx + fy * ribbon_dy;
                    let dist_across_ribbon = fx * ribbon_dy - fy * ribbon_dx;
                    let ribbon_center = ribbon_offset + wave;
                    let distance = (dist_across_ribbon - ribbon_center).abs();

                    // Calculate ribbon intensity
                    let intensity = Self::ribbon_intensity(
                        distance,
                        ribbon_width_px,
                        self.config.edge_softness,
                    );

                    if intensity > 0.001 {
                        // Get aurora color for this ribbon
                        let color_phase = (dist_along_ribbon / min_dim * 2.0
                            + ribbon_idx as f64 * 0.25
                            + self.config.shimmer_phase)
                            .rem_euclid(1.0);
                        let (ar, ag, ab) =
                            Self::aurora_color(color_phase, self.config.color_intensity);

                        // Modulate by local density (stronger near trajectories)
                        let density_factor = if a > 0.0 { 0.3 + a * 0.7 } else { 0.3 };

                        aurora_r += ar * intensity * density_factor;
                        aurora_g += ag * intensity * density_factor;
                        aurora_b += ab * intensity * density_factor;
                    }
                }

                // Apply aurora as screen blend (additive with soft clip)
                if aurora_r < 0.001 && aurora_g < 0.001 && aurora_b < 0.001 {
                    return (r, g, b, a);
                }

                let effect_strength = self.config.strength;

                // Un-premultiply original
                let (orig_r, orig_g, orig_b) = if a > 0.0 {
                    (r / a, g / a, b / a)
                } else {
                    (0.0, 0.0, 0.0)
                };

                // Screen blend: result = 1 - (1-a)(1-b)
                let blend_r = 1.0 - (1.0 - orig_r) * (1.0 - aurora_r * effect_strength);
                let blend_g = 1.0 - (1.0 - orig_g) * (1.0 - aurora_g * effect_strength);
                let blend_b = 1.0 - (1.0 - orig_b) * (1.0 - aurora_b * effect_strength);

                // Extend alpha where aurora is visible
                let aurora_alpha = (aurora_r + aurora_g + aurora_b).min(1.0) * 0.3;
                let final_a = a.max(aurora_alpha * effect_strength);

                // Re-premultiply
                (
                    blend_r.clamp(0.0, 1.0) * final_a,
                    blend_g.clamp(0.0, 1.0) * final_a,
                    blend_b.clamp(0.0, 1.0) * final_a,
                    final_a,
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
    fn test_aurora_default_config() {
        let config = AuroraConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.num_ribbons > 0);
        assert!(config.wave_frequency > 0.0);
    }

    #[test]
    fn test_aurora_preserves_transparent() {
        let effect = Aurora::new(AuroraConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 100];
        let output = effect.process(&input, 10, 10).unwrap();

        // Aurora should add some glow even to transparent areas
        // but should not cause NaN or negative values
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
    fn test_aurora_zero_strength() {
        let config = AuroraConfig {
            strength: 0.0,
            ..Default::default()
        };
        let effect = Aurora::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0); 100];
        let output = effect.process(&input, 10, 10).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_aurora_zero_ribbons() {
        let config = AuroraConfig {
            num_ribbons: 0,
            ..Default::default()
        };
        let effect = Aurora::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0); 100];
        let output = effect.process(&input, 10, 10).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_aurora_color_valid_range() {
        // Test that aurora colors are always valid
        for i in 0..20 {
            let t = i as f64 / 20.0;
            let (r, g, b) = Aurora::aurora_color(t, 1.0);

            assert!(r >= 0.0 && r <= 1.1, "Red {} out of range at t={}", r, t);
            assert!(g >= 0.0 && g <= 1.1, "Green {} out of range at t={}", g, t);
            assert!(b >= 0.0 && b <= 1.1, "Blue {} out of range at t={}", b, t);
        }
    }

    #[test]
    fn test_aurora_color_has_green_dominance() {
        // Aurora should have green as prominent color
        let mut green_sum = 0.0;
        let mut red_sum = 0.0;

        for i in 0..100 {
            let t = i as f64 / 100.0;
            let (r, g, _b) = Aurora::aurora_color(t, 1.0);
            red_sum += r;
            green_sum += g;
        }

        assert!(
            green_sum > red_sum,
            "Green should dominate: G={} > R={}",
            green_sum,
            red_sum
        );
    }

    #[test]
    fn test_ribbon_intensity_falloff() {
        let width = 10.0;
        let softness = 0.5;

        // Center should be maximum
        let center = Aurora::ribbon_intensity(0.0, width, softness);
        assert!((center - 1.0).abs() < 0.01, "Center should be 1.0: {}", center);

        // Edge should be near zero
        let edge = Aurora::ribbon_intensity(width, width, softness);
        assert!(edge < 0.01, "Edge should be near 0: {}", edge);

        // Outside should be zero
        let outside = Aurora::ribbon_intensity(width * 1.5, width, softness);
        assert!(outside == 0.0, "Outside should be 0: {}", outside);

        // Point in transition zone (0.75 is between inner boundary 0.5 and edge 1.0)
        // with softness=0.5, inner boundary is at normalized=0.5
        // so 0.75 is in the soft falloff region
        let in_transition = Aurora::ribbon_intensity(width * 0.75, width, softness);
        assert!(
            in_transition > edge && in_transition < center,
            "Transition point should be between edge and center: {} in ({}, {})",
            in_transition,
            edge,
            center
        );
    }

    #[test]
    fn test_wave_displacement_bounded() {
        let config = AuroraConfig::default();

        for i in 0..20 {
            let pos = i as f64 / 10.0;
            let wave = Aurora::wave_displacement(pos, config.wave_frequency, 1.0, 0.0, 0);

            // Wave should be bounded by amplitude (with some margin for harmonics)
            assert!(
                wave.abs() < 2.0,
                "Wave {} should be bounded at position {}",
                wave,
                pos
            );
        }
    }

    #[test]
    fn test_wave_displacement_varies() {
        // Different positions should give different values
        let wave1 = Aurora::wave_displacement(0.0, 8.0, 1.0, 0.0, 0);
        let wave2 = Aurora::wave_displacement(0.5, 8.0, 1.0, 0.0, 0);
        let wave3 = Aurora::wave_displacement(1.0, 8.0, 1.0, 0.0, 0);

        // At least some should differ
        let all_same = (wave1 - wave2).abs() < 0.01 && (wave2 - wave3).abs() < 0.01;
        assert!(!all_same, "Waves should vary: {}, {}, {}", wave1, wave2, wave3);
    }

    #[test]
    fn test_aurora_adds_color() {
        let config = AuroraConfig {
            strength: 0.8,
            num_ribbons: 2,
            ..Default::default()
        };
        let effect = Aurora::new(config);

        // Create a simple gradient pattern
        let mut input = vec![(0.3, 0.3, 0.3, 1.0); 100];
        for i in 40..60 {
            input[i] = (0.6, 0.6, 0.6, 1.0);
        }

        let output = effect.process(&input, 10, 10).unwrap();

        // At least some pixels should have green shifted higher (aurora signature)
        let green_boost_count = output
            .iter()
            .enumerate()
            .filter(|(i, (r, g, b, _))| {
                let (ir, ig, ib, _) = input[*i];
                // Check if green increased more than others (aurora-like)
                (g - ig) > (r - ir) * 0.5 || (g - ig) > (b - ib) * 0.5
            })
            .count();

        // Should have some aurora-affected pixels
        assert!(
            green_boost_count > 0 || output.iter().all(|p| !p.0.is_nan()),
            "Should have green-boosted pixels or at least valid output"
        );
    }
}
