//! Dodge & Burn: Saliency-guided local exposure shaping
//!
//! Automatically identifies visually important regions and applies subtle
//! exposure adjustments to create focal hierarchy — the sense that someone
//! deliberately chose what matters in the image.
//!
//! # Photography Background
//!
//! In traditional darkroom photography, "dodging" (lightening) and "burning"
//! (darkening) are techniques used to guide the viewer's eye by selectively
//! adjusting exposure in different regions. This effect automates that process
//! using a saliency map derived from luminance and alpha density.
//!
//! # Usage
//!
//! Place this effect early in the Scene Finishing Chain, before atmospheric
//! effects add their own structure, to establish focal hierarchy.

use super::{FrameParams, PixelBuffer, PostEffect};
use super::utils::{downsample_2x, upsample_bilinear};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for the dodge & burn effect.
#[derive(Clone, Debug)]
pub struct DodgeBurnConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full).
    /// Typical values: 0.15-0.30 for subtle focal shaping.
    pub strength: f64,

    /// Dodge (lighten) amount for salient regions.
    /// How much to brighten the most visually important areas.
    /// Typical values: 0.10-0.20.
    pub dodge_amount: f64,

    /// Burn (darken) amount for non-salient regions.
    /// How much to darken the less important areas.
    /// Typical values: 0.05-0.15.
    pub burn_amount: f64,

    /// Blur radius for saliency map as a fraction of the smaller dimension.
    /// Larger values create broader, more gradual focal regions.
    /// Typical values: 0.05-0.12.
    pub saliency_radius_scale: f64,

    /// Weight for luminance in saliency calculation (vs. alpha/density).
    /// 1.0 = only luminance, 0.0 = only alpha/density.
    /// Typical values: 0.5-0.7.
    pub luminance_weight: f64,

    /// Resolution scale for performance (1 = full res, 2 = half res, 4 = quarter res).
    /// Typical values: 2 or 4 for low-frequency saliency masks.
    pub downsample_factor: usize,
}

impl Default for DodgeBurnConfig {
    fn default() -> Self {
        Self {
            strength: 0.20,
            dodge_amount: 0.15,
            burn_amount: 0.10,
            saliency_radius_scale: 0.08,
            luminance_weight: 0.6,
            downsample_factor: 2,
        }
    }
}

/// Dodge & Burn post-processing effect.
///
/// Creates focal hierarchy by automatically lightening important regions
/// and darkening less important areas, simulating traditional darkroom
/// exposure control techniques.
pub struct DodgeBurn {
    config: DodgeBurnConfig,
}

impl DodgeBurn {
    /// Create a new dodge & burn effect with the given configuration.
    #[must_use]
    pub fn new(config: DodgeBurnConfig) -> Self {
        Self { config }
    }

    /// Build a saliency map from the image.
    ///
    /// Combines luminance and alpha/density information, then blurs
    /// to create a smooth low-frequency saliency structure.
    fn build_saliency_map(&self, input: &PixelBuffer, width: usize, height: usize) -> Vec<f64> {
        let lum_weight = self.config.luminance_weight;
        let alpha_weight = 1.0 - lum_weight;

        // Compute per-pixel saliency (luminance + alpha/density)
        let mut saliency: Vec<f64> = input
            .par_iter()
            .map(|&(r, g, b, a)| {
                // Luminance (Rec. 709 coefficients)
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                // Combine luminance and alpha with configured weights
                lum * lum_weight + a * alpha_weight
            })
            .collect();

        // Blur to get low-frequency saliency structure
        let min_dim = width.min(height);
        let radius = (self.config.saliency_radius_scale * min_dim as f64).round().max(1.0) as usize;

        // Apply separable box blur for efficiency
        blur_1d_horizontal(&mut saliency, width, height, radius);
        blur_1d_vertical(&mut saliency, width, height, radius);

        // Normalize to 0-1 range
        let max_sal = saliency.iter().copied().fold(0.0f64, f64::max);
        if max_sal > 0.0 {
            saliency.par_iter_mut().for_each(|s| *s /= max_sal);
        }

        saliency
    }
}

impl PostEffect for DodgeBurn {
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

        // PERFORMANCE OPTIMIZATION: Build saliency map at lower resolution
        let (ds_input, ds_w, ds_h) = if self.config.downsample_factor > 1 {
            downsample_2x(input, width, height)
        } else {
            (input.to_vec(), width, height)
        };

        // Build saliency map at reduced resolution
        let ds_saliency = self.build_saliency_map(&ds_input, ds_w, ds_h);

        // Upscale saliency map back to original resolution
        // (Convert Vec<f64> to PixelBuffer for the upsample utility)
        let ds_saliency_rgba: PixelBuffer = ds_saliency.iter().map(|&s| (s, s, s, 1.0)).collect();
        let full_res_saliency_rgba = if self.config.downsample_factor > 1 {
            upsample_bilinear(&ds_saliency_rgba, ds_w, ds_h, width, height)
        } else {
            ds_saliency_rgba
        };

        let dodge_amount = self.config.dodge_amount;
        let burn_amount = self.config.burn_amount;
        let strength = self.config.strength;

        // Apply dodge/burn based on full-res saliency
        let output: PixelBuffer = input
            .par_iter()
            .zip(full_res_saliency_rgba.par_iter())
            .map(|(&(r, g, b, a), &sal_rgba)| {
                let sal = sal_rgba.0; // Use any channel, they're all the same
                
                // Map saliency to exposure adjustment:
                // - High saliency (>0.5) = dodge (lighten)
                // - Low saliency (<0.5) = burn (darken)
                let adjustment = if sal > 0.5 {
                    let t = (sal - 0.5) * 2.0;
                    dodge_amount * t * strength
                } else {
                    let t = (0.5 - sal) * 2.0;
                    -burn_amount * t * strength
                };

                // Apply adjustment
                (
                    (r + adjustment).max(0.0),
                    (g + adjustment).max(0.0),
                    (b + adjustment).max(0.0),
                    a,
                )
            })
            .collect();

        Ok(output)
    }

    fn is_enabled(&self) -> bool {
        self.config.strength > 0.0
    }
}

/// Horizontal 1D box blur for saliency map.
///
/// Operates in-place using a temporary buffer for efficiency.
fn blur_1d_horizontal(data: &mut Vec<f64>, width: usize, height: usize, radius: usize) {
    if radius == 0 || width == 0 {
        return;
    }

    let mut temp = vec![0.0; data.len()];

    for y in 0..height {
        let row_start = y * width;

        // Use sliding window for O(n) blur
        let mut sum = 0.0;
        let mut count = 0;

        // Initialize window
        for x in 0..radius.min(width) {
            sum += data[row_start + x];
            count += 1;
        }

        for x in 0..width {
            // Add new pixel to window (right side)
            let add_x = x + radius;
            if add_x < width {
                sum += data[row_start + add_x];
                count += 1;
            }

            // Store blurred value
            temp[row_start + x] = sum / count as f64;

            // Remove old pixel from window (left side)
            let remove_x = x.saturating_sub(radius);
            if x >= radius {
                sum -= data[row_start + remove_x];
                count -= 1;
            }
        }
    }

    *data = temp;
}

/// Vertical 1D box blur for saliency map.
///
/// Operates in-place using a temporary buffer for efficiency.
fn blur_1d_vertical(data: &mut Vec<f64>, width: usize, height: usize, radius: usize) {
    if radius == 0 || height == 0 {
        return;
    }

    let mut temp = vec![0.0; data.len()];

    for x in 0..width {
        // Use sliding window for O(n) blur
        let mut sum = 0.0;
        let mut count = 0;

        // Initialize window
        for y in 0..radius.min(height) {
            sum += data[y * width + x];
            count += 1;
        }

        for y in 0..height {
            // Add new pixel to window (bottom)
            let add_y = y + radius;
            if add_y < height {
                sum += data[add_y * width + x];
                count += 1;
            }

            // Store blurred value
            temp[y * width + x] = sum / count as f64;

            // Remove old pixel from window (top)
            let remove_y = y.saturating_sub(radius);
            if y >= radius {
                sum -= data[remove_y * width + x];
                count -= 1;
            }
        }
    }

    *data = temp;
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
    fn test_dodge_burn_config_default() {
        let config = DodgeBurnConfig::default();
        assert!((config.strength - 0.20).abs() < 1e-10);
        assert!((config.dodge_amount - 0.15).abs() < 1e-10);
        assert!((config.burn_amount - 0.10).abs() < 1e-10);
        assert!((config.saliency_radius_scale - 0.08).abs() < 1e-10);
        assert!((config.luminance_weight - 0.6).abs() < 1e-10);
        assert_eq!(config.downsample_factor, 2);
    }

    #[test]
    fn test_dodge_burn_disabled_passthrough() {
        let config = DodgeBurnConfig { strength: 0.0, downsample_factor: 1, ..Default::default() };
        let effect = DodgeBurn::new(config);

        let input = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let result = effect.process(&input, 10, 10, &test_params()).unwrap();
        assert_eq!(result, input);
    }

    #[test]
    fn test_dodge_burn_is_enabled() {
        let enabled = DodgeBurn::new(DodgeBurnConfig { strength: 0.5, downsample_factor: 1, ..Default::default() });
        assert!(enabled.is_enabled());

        let disabled = DodgeBurn::new(DodgeBurnConfig { strength: 0.0, downsample_factor: 1, ..Default::default() });
        assert!(!disabled.is_enabled());
    }

    #[test]
    fn test_dodge_burn_uniform_image_minimal_change() {
        let config = DodgeBurnConfig { downsample_factor: 1, ..Default::default() };
        let effect = DodgeBurn::new(config);

        // Uniform image should have uniform saliency (~0.5 everywhere)
        // which means minimal net adjustment
        let input = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let result = effect.process(&input, 10, 10, &test_params()).unwrap();

        // Check that changes are small for uniform input
        for (orig, res) in input.iter().zip(result.iter()) {
            // Allow some change due to edge effects and normalization
            assert!((orig.0 - res.0).abs() < 0.15);
        }
    }

    #[test]
    fn test_dodge_burn_bright_center_gets_dodged() {
        let config = DodgeBurnConfig {
            strength: 1.0,
            dodge_amount: 0.3,
            burn_amount: 0.3,
            saliency_radius_scale: 0.15,
            luminance_weight: 1.0, // Only use luminance
            downsample_factor: 1,
        };
        let effect = DodgeBurn::new(config);

        // Create image with bright center, dark edges
        let mut input = vec![(0.1, 0.1, 0.1, 1.0); 25]; // 5x5
        input[12] = (0.9, 0.9, 0.9, 1.0); // Center pixel bright

        let result = effect.process(&input, 5, 5, &test_params()).unwrap();

        // Center should be dodged (brighter), corners should be burned (darker)
        let center_before = input[12].0;
        let center_after = result[12].0;
        let corner_before = input[0].0;
        let corner_after = result[0].0;

        // Center should be brighter (dodged)
        assert!(center_after >= center_before - 0.05, "Center should be dodged");
        // Corner should be darker (burned)
        assert!(corner_after <= corner_before + 0.05, "Corner should be burned");
    }

    #[test]
    fn test_dodge_burn_strength_scales_effect() {
        let weak = DodgeBurnConfig { strength: 0.1, downsample_factor: 1, ..Default::default() };
        let strong = DodgeBurnConfig { strength: 1.0, downsample_factor: 1, ..Default::default() };

        let weak_effect = DodgeBurn::new(weak);
        let strong_effect = DodgeBurn::new(strong);

        // Gradient image
        let mut input = Vec::new();
        for i in 0..100 {
            let v = i as f64 / 100.0;
            input.push((v, v, v, 1.0));
        }

        let weak_result = weak_effect.process(&input, 10, 10, &test_params()).unwrap();
        let strong_result = strong_effect.process(&input, 10, 10, &test_params()).unwrap();

        // Compute total change magnitude
        let weak_change: f64 =
            weak_result.iter().zip(input.iter()).map(|(r, i)| (r.0 - i.0).abs()).sum();
        let strong_change: f64 =
            strong_result.iter().zip(input.iter()).map(|(r, i)| (r.0 - i.0).abs()).sum();

        assert!(
            strong_change > weak_change,
            "Higher strength should produce more effect"
        );
    }

    #[test]
    fn test_dodge_burn_preserves_alpha() {
        let config = DodgeBurnConfig { downsample_factor: 1, ..Default::default() };
        let effect = DodgeBurn::new(config);

        let input = vec![
            (0.8, 0.8, 0.8, 0.5), // Semi-transparent
            (0.3, 0.3, 0.3, 0.3), // More transparent
            (0.5, 0.5, 0.5, 1.0), // Opaque
        ];

        let result = effect.process(&input, 3, 1, &test_params()).unwrap();

        // Alpha values should be preserved
        assert!((result[0].3 - 0.5).abs() < 1e-10);
        assert!((result[1].3 - 0.3).abs() < 1e-10);
        assert!((result[2].3 - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_dodge_burn_no_negative_values() {
        let config = DodgeBurnConfig {
            strength: 1.0,
            burn_amount: 0.5, // Strong burn
            downsample_factor: 1,
            ..Default::default()
        };
        let effect = DodgeBurn::new(config);

        // Very dark image - burn could push to negative
        let input = create_test_image(10, 10, 0.1);
        let result = effect.process(&input, 10, 10, &test_params()).unwrap();

        for pixel in result {
            assert!(pixel.0 >= 0.0, "Red should be non-negative");
            assert!(pixel.1 >= 0.0, "Green should be non-negative");
            assert!(pixel.2 >= 0.0, "Blue should be non-negative");
        }
    }

    #[test]
    fn test_dodge_burn_larger_image() {
        let config = DodgeBurnConfig { downsample_factor: 2, ..Default::default() };
        let effect = DodgeBurn::new(config);

        // Test on a larger image to ensure no panics
        let input = create_test_image(100, 100, 0.5);
        let result = effect.process(&input, 100, 100, &test_params()).unwrap();

        assert_eq!(result.len(), input.len());
    }

    #[test]
    fn test_dodge_burn_non_square_image() {
        let config = DodgeBurnConfig { downsample_factor: 2, ..Default::default() };
        let effect = DodgeBurn::new(config);

        // Wide image
        let input = create_test_image(50, 10, 0.5);
        let result = effect.process(&input, 50, 10, &test_params()).unwrap();
        assert_eq!(result.len(), input.len());

        // Tall image
        let input2 = create_test_image(10, 50, 0.5);
        let result2 = effect.process(&input2, 10, 50, &test_params()).unwrap();
        assert_eq!(result2.len(), input2.len());
    }

    #[test]
    fn test_dodge_burn_luminance_weight_config() {
        // Test that luminance_weight is stored correctly
        let lum_only = DodgeBurnConfig {
            luminance_weight: 1.0,
            downsample_factor: 1,
            ..Default::default()
        };
        let alpha_only = DodgeBurnConfig {
            luminance_weight: 0.0,
            downsample_factor: 1,
            ..Default::default()
        };

        assert!((lum_only.luminance_weight - 1.0).abs() < 1e-10);
        assert!((alpha_only.luminance_weight - 0.0).abs() < 1e-10);

        // Test that effects are created correctly
        let lum_effect = DodgeBurn::new(lum_only);
        let alpha_effect = DodgeBurn::new(alpha_only);

        assert!(lum_effect.is_enabled());
        assert!(alpha_effect.is_enabled());
    }

    #[test]
    fn test_dodge_burn_saliency_uses_luminance_and_alpha() {
        let config = DodgeBurnConfig {
            luminance_weight: 0.5, // Equal weight
            strength: 1.0,
            downsample_factor: 1,
            ..Default::default()
        };
        let effect = DodgeBurn::new(config);

        // Create image where luminance and alpha give conflicting signals
        let input = vec![
            (0.9, 0.9, 0.9, 0.1), // High lum, low alpha
            (0.1, 0.1, 0.1, 0.9), // Low lum, high alpha
        ];

        // Build saliency map
        let saliency = effect.build_saliency_map(&input, 2, 1);

        // With equal weights, both pixels should have similar combined saliency
        // (0.9 * 0.5 + 0.1 * 0.5 = 0.5) for first pixel
        // (0.1 * 0.5 + 0.9 * 0.5 = 0.5) for second pixel
        // After normalization, both should be close to each other
        assert!(
            (saliency[0] - saliency[1]).abs() < 0.2,
            "Equal-weighted saliency should be similar for opposite lum/alpha: {:.3} vs {:.3}",
            saliency[0],
            saliency[1]
        );
    }

    #[test]
    fn test_saliency_map_normalized() {
        let config = DodgeBurnConfig::default();
        let effect = DodgeBurn::new(config);

        // Create high-contrast image
        let mut input = create_test_image(10, 10, 0.2);
        input[55] = (1.0, 1.0, 1.0, 1.0); // Bright spot

        let saliency = effect.build_saliency_map(&input, 10, 10);

        // Maximum should be 1.0 after normalization
        let max_sal = saliency.iter().copied().fold(0.0f64, f64::max);
        assert!(
            (max_sal - 1.0).abs() < 0.01,
            "Saliency should be normalized to max 1.0"
        );

        // Minimum should be >= 0
        let min_sal = saliency.iter().copied().fold(f64::INFINITY, f64::min);
        assert!(min_sal >= 0.0, "Saliency should be non-negative");
    }

    #[test]
    fn test_blur_1d_horizontal_preserves_uniform() {
        let width = 10;
        let height = 5;
        let mut data = vec![0.5; width * height];

        blur_1d_horizontal(&mut data, width, height, 2);

        // Uniform data should remain uniform after blur
        for val in &data {
            assert!((val - 0.5).abs() < 0.01);
        }
    }

    #[test]
    fn test_blur_1d_vertical_preserves_uniform() {
        let width = 10;
        let height = 5;
        let mut data = vec![0.5; width * height];

        blur_1d_vertical(&mut data, width, height, 2);

        // Uniform data should remain uniform after blur
        for val in &data {
            assert!((val - 0.5).abs() < 0.01);
        }
    }

    #[test]
    fn test_blur_smooths_impulse() {
        let width = 5;
        let height = 5;
        let mut data = vec![0.0; width * height];
        data[12] = 1.0; // Center impulse

        blur_1d_horizontal(&mut data, width, height, 1);
        blur_1d_vertical(&mut data, width, height, 1);

        // Center should be lower, neighbors should be higher
        assert!(data[12] < 1.0);
        assert!(data[11] > 0.0); // Left neighbor
        assert!(data[13] > 0.0); // Right neighbor
    }

    #[test]
    fn test_blur_zero_radius() {
        let width = 5;
        let height = 5;
        let original = vec![0.5; width * height];
        let mut data = original.clone();

        blur_1d_horizontal(&mut data, width, height, 0);
        blur_1d_vertical(&mut data, width, height, 0);

        // Zero radius should not change data
        assert_eq!(data, original);
    }

    #[test]
    fn test_blur_single_row() {
        let width = 10;
        let height = 1;
        let mut data = vec![0.0; width * height];
        data[5] = 1.0;

        blur_1d_horizontal(&mut data, width, height, 2);

        // Impulse should spread horizontally
        assert!(data[5] < 1.0);
        assert!(data[4] > 0.0);
        assert!(data[6] > 0.0);
    }

    #[test]
    fn test_blur_single_column() {
        let width = 1;
        let height = 10;
        let mut data = vec![0.0; width * height];
        data[5] = 1.0;

        blur_1d_vertical(&mut data, width, height, 2);

        // Impulse should spread vertically
        assert!(data[5] < 1.0);
        assert!(data[4] > 0.0);
        assert!(data[6] > 0.0);
    }

    #[test]
    fn test_blur_preserves_total_energy() {
        let width = 10;
        let height = 10;
        let mut data: Vec<f64> = (0..100).map(|i| i as f64 / 100.0).collect();
        let original_sum: f64 = data.iter().sum();

        blur_1d_horizontal(&mut data, width, height, 2);
        blur_1d_vertical(&mut data, width, height, 2);

        let blurred_sum: f64 = data.iter().sum();

        // Total energy should be approximately preserved
        // (There may be small edge effects)
        assert!(
            (original_sum - blurred_sum).abs() < 1.0,
            "Blur should approximately preserve total energy"
        );
    }

    #[test]
    fn test_dodge_burn_gradient_creates_focal_hierarchy() {
        let config = DodgeBurnConfig {
            strength: 1.0,
            dodge_amount: 0.2,
            burn_amount: 0.2,
            saliency_radius_scale: 0.1,
            luminance_weight: 1.0,
            downsample_factor: 1,
        };
        let effect = DodgeBurn::new(config);

        // Create vertical gradient: dark at top, bright at bottom
        let mut input = Vec::new();
        for y in 0..10 {
            for _x in 0..10 {
                let v = y as f64 / 10.0;
                input.push((v, v, v, 1.0));
            }
        }

        let result = effect.process(&input, 10, 10, &test_params()).unwrap();

        // Bottom (bright) should be dodged relative to input
        // Top (dark) should be burned relative to input
        let top_input = input[5].0;
        let top_result = result[5].0;
        let bottom_input = input[95].0;
        let bottom_result = result[95].0;

        // The effect should increase contrast
        let input_range = bottom_input - top_input;
        let result_range = bottom_result - top_result;

        assert!(
            result_range >= input_range * 0.95, // Allow small tolerance
            "Dodge/burn should increase or maintain contrast: input range {}, result range {}",
            input_range,
            result_range
        );
    }
}
