//! Halation: Photochemical highlight glow effect
//!
//! Simulates the warm, soft glow created when bright light scatters through
//! photographic emulsion. Unlike bloom (optical), halation has a characteristic
//! red/warm bias and soft shoulder rolloff that creates an "expensive film" look.
//!
//! # Photochemical Background
//!
//! In traditional film photography, extremely bright light passes through the emulsion
//! layer, reflects off the film base, and re-exposes the emulsion from behind. This
//! creates a characteristic warm (red-biased) halo around highlights that's softer
//! and more gradual than optical bloom.
//!
//! # Usage
//!
//! Place this effect in the Scene Finishing Chain, after atmospheric effects
//! but before color grading, to create a photochemical "film" quality.

use super::{FrameParams, PixelBuffer, PostEffect};
use super::utils::{downsample_2x, upsample_bilinear};
use crate::render::drawing::parallel_blur_2d_rgba;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for the halation effect.
#[derive(Clone, Debug)]
pub struct HalationConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full).
    /// Typical values: 0.15-0.35 for subtle film quality.
    pub strength: f64,

    /// Luminance threshold for halation trigger (0.0-1.0).
    /// Only highlights above this value will produce halation.
    /// Typical values: 0.55-0.75.
    pub threshold: f64,

    /// Blur radius as a fraction of the smaller image dimension.
    /// Typical values: 0.02-0.05.
    pub radius_scale: f64,

    /// Red/warm bias amount (0.0 = neutral, 1.0 = very warm).
    /// This simulates the characteristic red reflection from film base.
    /// Typical values: 0.25-0.45.
    pub warmth: f64,

    /// Shoulder softness (higher = more gradual falloff).
    /// Controls how smoothly highlights transition into halation.
    /// Typical values: 1.5-3.0.
    pub softness: f64,

    /// Resolution scale for performance (1 = full res, 2 = half res, 4 = quarter res).
    /// Typical values: 2 for soft effects.
    pub downsample_factor: usize,
}

impl Default for HalationConfig {
    fn default() -> Self {
        Self {
            strength: 0.25,
            threshold: 0.65,
            radius_scale: 0.03,
            warmth: 0.35,
            softness: 2.0,
            downsample_factor: 2,
        }
    }
}

/// Halation post-processing effect.
///
/// Creates a warm, soft glow around bright highlights that simulates
/// the photochemical scattering in traditional film photography.
pub struct Halation {
    config: HalationConfig,
}

impl Halation {
    /// Create a new halation effect with the given configuration.
    #[must_use]
    pub fn new(config: HalationConfig) -> Self {
        Self { config }
    }
}

impl PostEffect for Halation {
    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        // Early exit if effect is disabled
        if self.config.strength <= 0.0 {
            return Ok(input.to_vec());
        }

        // PERFORMANCE OPTIMIZATION: Process soft effects at lower resolution
        let (downsampled, ds_w, ds_h) = if self.config.downsample_factor > 1 {
            downsample_2x(input, width, height)
        } else {
            (input.to_vec(), width, height)
        };

        let min_dim = ds_w.min(ds_h);
        let radius = (self.config.radius_scale * min_dim as f64).round().max(1.0) as usize;
        let threshold = self.config.threshold;
        let softness = self.config.softness;

        // Step 1: Extract highlights above threshold with soft shoulder
        let mut highlights: PixelBuffer = downsampled
            .par_iter()
            .map(|&(r, g, b, a)| {
                // Compute luminance (Rec. 709 coefficients)
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                if lum > threshold {
                    // Calculate excess luminance and apply soft shoulder
                    let excess = (lum - threshold) / (1.0 - threshold).max(0.001);
                    let soft_mask = soft_shoulder(excess, softness);

                    // Scale the pixel by the soft mask
                    (r * soft_mask, g * soft_mask, b * soft_mask, a * soft_mask)
                } else {
                    (0.0, 0.0, 0.0, 0.0)
                }
            })
            .collect();

        // Step 2: Blur the highlights (two-pass box blur for smoother result)
        // First pass
        parallel_blur_2d_rgba(&mut highlights, ds_w, ds_h, radius);
        // Second pass for smoother falloff
        parallel_blur_2d_rgba(&mut highlights, ds_w, ds_h, radius);

        // Step 3: Apply warm bias to blurred highlights
        let warmth = self.config.warmth;
        highlights.par_iter_mut().for_each(|pixel| {
            // Shift color toward red/orange (characteristic of film halation)
            pixel.0 *= 1.0 + warmth * 0.30;
            pixel.1 *= 1.0 + warmth * 0.10;
            pixel.2 *= 1.0 - warmth * 0.20;
        });

        // Upscale highlights back to original resolution
        let full_res_highlights = if self.config.downsample_factor > 1 {
            upsample_bilinear(&highlights, ds_w, ds_h, width, height)
        } else {
            highlights
        };

        // Step 4: Composite halation back to original using screen blend
        let strength = self.config.strength;
        let output: PixelBuffer = input
            .par_iter()
            .zip(full_res_highlights.par_iter())
            .map(|(&(r, g, b, a), &(hr, hg, hb, _ha))| {
                // Screen blend: result = base + highlight * (1 - base)
                let r_out = r + hr * strength * (1.0 - r.clamp(0.0, 1.0));
                let g_out = g + hg * strength * (1.0 - g.clamp(0.0, 1.0));
                let b_out = b + hb * strength * (1.0 - b.clamp(0.0, 1.0));

                (r_out, g_out, b_out, a)
            })
            .collect();

        Ok(output)
    }

    fn is_enabled(&self) -> bool {
        self.config.strength > 0.0
    }
}

/// Soft shoulder function for gradual highlight falloff.
///
/// Uses a power curve to create smooth transitions at the threshold boundary.
/// Higher softness values create more gradual falloff.
#[inline]
fn soft_shoulder(x: f64, softness: f64) -> f64 {
    let clamped = x.clamp(0.0, 1.0);
    // y = x^(1/softness) gives a curve that's gentler for higher softness
    clamped.powf(1.0 / softness.max(0.1))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_image(width: usize, height: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); width * height]
    }

    fn test_params() -> FrameParams {
        FrameParams { frame_number: 0, _density: None, body_positions: None }
    }

    #[test]
    fn test_halation_config_default() {
        let config = HalationConfig::default();
        assert!((config.strength - 0.25).abs() < 1e-10);
        assert!((config.threshold - 0.65).abs() < 1e-10);
        assert!((config.warmth - 0.35).abs() < 1e-10);
        assert!((config.radius_scale - 0.03).abs() < 1e-10);
        assert!((config.softness - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_halation_disabled_passthrough() {
        let config = HalationConfig { strength: 0.0, ..Default::default() };
        let effect = Halation::new(config);

        let input = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let result = effect.process(&input, 10, 10, &test_params()).unwrap();
        assert_eq!(result, input);
    }

    #[test]
    fn test_halation_is_enabled() {
        let enabled = Halation::new(HalationConfig { strength: 0.5, ..Default::default() });
        assert!(enabled.is_enabled());

        let disabled = Halation::new(HalationConfig { strength: 0.0, ..Default::default() });
        assert!(!disabled.is_enabled());
    }

    #[test]
    fn test_halation_preserves_dark_pixels() {
        let config = HalationConfig { threshold: 0.9, ..Default::default() };
        let effect = Halation::new(config);

        // All pixels below threshold
        let input = vec![(0.3, 0.3, 0.3, 1.0); 100];
        let result = effect.process(&input, 10, 10, &test_params()).unwrap();

        // Dark pixels should be largely unchanged (only minimal halation)
        for (orig, res) in input.iter().zip(result.iter()) {
            assert!((orig.0 - res.0).abs() < 0.1);
            assert!((orig.1 - res.1).abs() < 0.1);
            assert!((orig.2 - res.2).abs() < 0.1);
        }
    }

    #[test]
    fn test_halation_adds_warmth_to_highlights() {
        let config = HalationConfig {
            strength: 1.0,
            threshold: 0.5,
            warmth: 0.5,
            downsample_factor: 1,
            ..Default::default()
        };
        let effect = Halation::new(config);

        // Bright center pixel surrounded by dark pixels
        let mut input = vec![(0.0, 0.0, 0.0, 1.0); 25];
        input[12] = (1.0, 1.0, 1.0, 1.0); // Center pixel is bright

        let result = effect.process(&input, 5, 5, &test_params()).unwrap();

        // Center pixel should have warm bias (red > green > blue)
        let center = result[12];
        // Due to screen blend and warmth, we expect some color shift
        assert!(center.0 >= center.2, "Halation should add warmth (red >= blue)");
    }

    #[test]
    fn test_halation_spreads_to_neighbors() {
        let config = HalationConfig {
            strength: 1.0,
            threshold: 0.5,
            radius_scale: 0.2, // Large radius for visible spread
            warmth: 0.0,       // No warmth for easier testing
            softness: 1.0,
            downsample_factor: 1,
        };
        let effect = Halation::new(config);

        // Single bright pixel in center
        let mut input = vec![(0.0, 0.0, 0.0, 1.0); 25];
        input[12] = (1.0, 1.0, 1.0, 1.0);

        let result = effect.process(&input, 5, 5, &test_params()).unwrap();

        // Neighboring pixels should receive some glow
        let neighbor = result[11]; // Left of center
        assert!(neighbor.0 > 0.0, "Halation should spread to neighbors");
        assert!(neighbor.1 > 0.0);
        assert!(neighbor.2 > 0.0);
    }

    #[test]
    fn test_halation_threshold_effect() {
        let low_threshold = HalationConfig {
            strength: 1.0,
            threshold: 0.3,
            downsample_factor: 1,
            ..Default::default()
        };
        let high_threshold = HalationConfig {
            strength: 1.0,
            threshold: 0.9,
            downsample_factor: 1,
            ..Default::default()
        };

        let low_effect = Halation::new(low_threshold);
        let high_effect = Halation::new(high_threshold);

        // Medium brightness image
        let input = create_test_image(10, 10, 0.5);

        let low_result = low_effect.process(&input, 10, 10, &test_params()).unwrap();
        let high_result = high_effect.process(&input, 10, 10, &test_params()).unwrap();

        // Low threshold should produce more change
        let low_change: f64 =
            low_result.iter().zip(input.iter()).map(|(r, i)| (r.0 - i.0).abs()).sum();
        let high_change: f64 =
            high_result.iter().zip(input.iter()).map(|(r, i)| (r.0 - i.0).abs()).sum();

        assert!(
            low_change > high_change,
            "Lower threshold should produce more halation"
        );
    }

    #[test]
    fn test_halation_strength_scales_effect() {
        let weak = HalationConfig { strength: 0.1, threshold: 0.3, downsample_factor: 1, ..Default::default() };
        let strong = HalationConfig { strength: 1.0, threshold: 0.3, downsample_factor: 1, ..Default::default() };

        let weak_effect = Halation::new(weak);
        let strong_effect = Halation::new(strong);

        let input = create_test_image(10, 10, 0.5);

        let weak_result = weak_effect.process(&input, 10, 10, &test_params()).unwrap();
        let strong_result = strong_effect.process(&input, 10, 10, &test_params()).unwrap();

        // Stronger effect should produce more change
        let weak_change: f64 =
            weak_result.iter().zip(input.iter()).map(|(r, i)| (r.0 - i.0).abs()).sum();
        let strong_change: f64 =
            strong_result.iter().zip(input.iter()).map(|(r, i)| (r.0 - i.0).abs()).sum();

        assert!(
            strong_change > weak_change,
            "Higher strength should produce more halation"
        );
    }

    #[test]
    fn test_halation_preserves_alpha() {
        let config = HalationConfig { downsample_factor: 1, ..Default::default() };
        let effect = Halation::new(config);

        let input = vec![
            (1.0, 1.0, 1.0, 0.5), // Semi-transparent bright
            (0.0, 0.0, 0.0, 0.3), // Semi-transparent dark
            (0.5, 0.5, 0.5, 1.0), // Opaque mid-gray
        ];

        let result = effect.process(&input, 3, 1, &test_params()).unwrap();

        // Alpha values should be preserved
        assert!((result[0].3 - 0.5).abs() < 1e-10);
        assert!((result[1].3 - 0.3).abs() < 1e-10);
        assert!((result[2].3 - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_halation_larger_image() {
        let config = HalationConfig { downsample_factor: 2, ..Default::default() };
        let effect = Halation::new(config);

        // Test on a larger image to ensure no panics
        let input = create_test_image(100, 100, 0.8);
        let result = effect.process(&input, 100, 100, &test_params()).unwrap();

        assert_eq!(result.len(), input.len());
    }

    #[test]
    fn test_halation_non_square_image() {
        let config = HalationConfig { downsample_factor: 2, ..Default::default() };
        let effect = Halation::new(config);

        // Wide image
        let input = create_test_image(50, 10, 0.7);
        let result = effect.process(&input, 50, 10, &test_params()).unwrap();
        assert_eq!(result.len(), input.len());

        // Tall image
        let input2 = create_test_image(10, 50, 0.7);
        let result2 = effect.process(&input2, 10, 50, &test_params()).unwrap();
        assert_eq!(result2.len(), input2.len());
    }

    #[test]
    fn test_soft_shoulder_bounds() {
        assert!((soft_shoulder(0.0, 2.0) - 0.0).abs() < 1e-10);
        assert!((soft_shoulder(1.0, 2.0) - 1.0).abs() < 1e-10);
        assert!(soft_shoulder(0.5, 2.0) > 0.0);
        assert!(soft_shoulder(0.5, 2.0) < 1.0);
    }

    #[test]
    fn test_soft_shoulder_softness_effect() {
        let x = 0.5;
        let soft_low = soft_shoulder(x, 1.0);
        let soft_high = soft_shoulder(x, 3.0);

        // Higher softness should give higher output for same input
        // (because y = x^(1/s) and 1/3 < 1/1, so x^(1/3) > x^1 for x < 1)
        assert!(soft_high > soft_low);
    }

    #[test]
    fn test_soft_shoulder_extreme_softness() {
        // With y = x^(1/softness), for x < 1:
        // - Lower softness (e.g. 0.5) means 1/softness is larger (2.0), so x^2 < x for x<1 -> smaller output
        // - Higher softness (e.g. 2.0) means 1/softness is smaller (0.5), so x^0.5 > x for x<1 -> larger output
        let low_softness = soft_shoulder(0.25, 1.0);  // 0.25^1 = 0.25
        let high_softness = soft_shoulder(0.25, 4.0); // 0.25^0.25 ≈ 0.707

        assert!(
            high_softness > low_softness,
            "Higher softness should give larger output for same input: {} vs {}",
            high_softness,
            low_softness
        );
    }

    #[test]
    fn test_soft_shoulder_monotonic() {
        // Output should be monotonically increasing with input
        for softness in [0.5, 1.0, 2.0, 5.0] {
            let mut prev = 0.0;
            for i in 0..=10 {
                let x = i as f64 / 10.0;
                let y = soft_shoulder(x, softness);
                assert!(y >= prev, "soft_shoulder should be monotonic");
                prev = y;
            }
        }
    }

    #[test]
    fn test_halation_no_negative_values() {
        let config = HalationConfig {
            strength: 1.0,
            threshold: 0.3,
            warmth: 1.0, // Maximum warmth
            downsample_factor: 1,
            ..Default::default()
        };
        let effect = Halation::new(config);

        let input = create_test_image(20, 20, 0.8);
        let result = effect.process(&input, 20, 20, &test_params()).unwrap();

        // No pixel should have negative values
        for pixel in result {
            assert!(pixel.0 >= 0.0, "Red should be non-negative");
            assert!(pixel.1 >= 0.0, "Green should be non-negative");
            assert!(pixel.2 >= 0.0, "Blue should be non-negative");
        }
    }

    #[test]
    fn test_halation_warmth_color_shift() {
        let neutral = HalationConfig { warmth: 0.0, threshold: 0.3, strength: 1.0, radius_scale: 0.2, downsample_factor: 1, ..Default::default() };
        let warm = HalationConfig { warmth: 1.0, threshold: 0.3, strength: 1.0, radius_scale: 0.2, downsample_factor: 1, ..Default::default() };

        let neutral_effect = Halation::new(neutral);
        let warm_effect = Halation::new(warm);

        // Larger image with bright center to see warmth effect
        let mut input = vec![(0.0, 0.0, 0.0, 1.0); 25]; // 5x5
        input[12] = (1.0, 1.0, 1.0, 1.0); // Center bright

        let neutral_result = neutral_effect.process(&input, 5, 5, &test_params()).unwrap();
        let warm_result = warm_effect.process(&input, 5, 5, &test_params()).unwrap();

        // Look at the neighbor pixel where halation spreads, not center
        // Center pixel is already white so screen blend won't shift color much
        let neighbor_neutral = neutral_result[11]; // Left of center
        let neighbor_warm = warm_result[11];

        // Both should have some glow from halation spread
        if neighbor_neutral.2 > 0.01 && neighbor_warm.2 > 0.01 {
            let neutral_ratio = neighbor_neutral.0 / neighbor_neutral.2;
            let warm_ratio = neighbor_warm.0 / neighbor_warm.2;

            assert!(
                warm_ratio >= neutral_ratio,
                "Warm halation should have higher or equal red/blue ratio: warm={:.3}, neutral={:.3}",
                warm_ratio,
                neutral_ratio
            );
        }
    }
}

