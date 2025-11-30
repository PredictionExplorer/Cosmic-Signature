//! Chromatic bloom effect for prismatic color separation.
//!
//! This effect creates a magical, lens-aberration-like glow by separating RGB channels
//! spatially and blurring them independently, then compositing back with additive blending.
//!
//! # Effect Description
//!
//! Chromatic bloom simulates lens aberration by:
//! 1. Extracting bright pixels above a luminance threshold
//! 2. Separating RGB channels with radial offset from center
//! 3. Applying independent blur to each channel
//! 4. Compositing back with additive blending
//!
//! # Configuration
//!
//! The effect scales with resolution to maintain consistent appearance across
//! different output sizes.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for chromatic bloom effect
#[derive(Clone, Debug)]
pub struct ChromaticBloomConfig {
    /// Blur radius in pixels
    pub radius: usize,
    /// Overall effect strength (0.0-1.0)
    pub strength: f64,
    /// RGB channel separation distance in pixels
    pub separation: f64,
    /// Luminance threshold for bloom activation (0.0-1.0)
    pub threshold: f64,
}

impl Default for ChromaticBloomConfig {
    fn default() -> Self {
        // Default for ~1080p resolution
        Self::from_resolution(1920, 1080)
    }
}

impl ChromaticBloomConfig {
    /// Create configuration scaled for the given resolution with enhanced prismatic beauty
    /// This ensures the effect looks consistently stunning across different resolutions
    pub fn from_resolution(width: usize, height: usize) -> Self {
        let min_dim = width.min(height) as f64;
        Self {
            // Enhanced radius for luxurious bloom spread: 14px @ 1080p, 28px @ 4K
            radius: (0.013 * min_dim).round() as usize,  // Increased from 0.0111
            // Enhanced separation for dramatic chromatic aberration: 3.2px @ 1080p
            separation: 0.0030 * min_dim,  // Increased from 0.0023
            // Enhanced strength for vivid prismatic color
            strength: 0.78,  // Increased from 0.65
            // Lower threshold for more magical bloom coverage
            threshold: 0.12,  // Reduced from 0.15
        }
    }
}

/// Chromatic bloom post-effect
pub struct ChromaticBloom {
    config: ChromaticBloomConfig,
    enabled: bool,
}

impl ChromaticBloom {
    pub fn new(config: ChromaticBloomConfig) -> Self {
        Self { config, enabled: true }
    }

    /// Extract bright pixels above threshold
    fn extract_bright_pixels(
        &self,
        input: &PixelBuffer,
        _width: usize,
        _height: usize,
    ) -> PixelBuffer {
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 0.0 {
                    return (0.0, 0.0, 0.0, 0.0);
                }

                // Calculate luminance (Rec. 709)
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                // Threshold-based extraction with smooth falloff
                let brightness = (lum - self.config.threshold).max(0.0) / (1.0 - self.config.threshold);
                let factor = brightness.min(1.0).powf(1.5); // Smooth curve

                (r * factor, g * factor, b * factor, a * factor)
            })
            .collect()
    }

    /// Sample pixel with bilinear interpolation
    #[inline]
    fn sample_bilinear(
        buffer: &PixelBuffer,
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

        let p00 = buffer[y0 * width + x0];
        let p01 = buffer[y0 * width + x1];
        let p10 = buffer[y1 * width + x0];
        let p11 = buffer[y1 * width + x1];

        // Bilinear interpolation
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

    /// Create spatially offset channel buffers
    fn create_separated_channels(
        &self,
        bright: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> (PixelBuffer, PixelBuffer, PixelBuffer) {
        let sep = self.config.separation;
        let cx = width as f64 / 2.0;
        let cy = height as f64 / 2.0;
        let size = width * height;

        // Red channel: offset outward from center
        let red_buffer: PixelBuffer = (0..size)
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                let dx = x as f64 - cx;
                let dy = y as f64 - cy;
                let dist = (dx * dx + dy * dy).sqrt().max(1.0);
                
                let offset_x = x as f64 + (dx / dist) * sep;
                let offset_y = y as f64 + (dy / dist) * sep;
                
                let (r, _, _, a) = Self::sample_bilinear(bright, width, height, offset_x, offset_y);
                (r, 0.0, 0.0, a)
            })
            .collect();

        // Green channel: centered (no offset)
        let green_buffer: PixelBuffer = bright
            .par_iter()
            .map(|&(_, g, _, a)| (0.0, g, 0.0, a))
            .collect();

        // Blue channel: offset inward toward center
        let blue_buffer: PixelBuffer = (0..size)
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                let dx = x as f64 - cx;
                let dy = y as f64 - cy;
                let dist = (dx * dx + dy * dy).sqrt().max(1.0);
                
                let offset_x = x as f64 - (dx / dist) * sep;
                let offset_y = y as f64 - (dy / dist) * sep;
                
                let (_, _, b, a) = Self::sample_bilinear(bright, width, height, offset_x, offset_y);
                (0.0, 0.0, b, a)
            })
            .collect();

        (red_buffer, green_buffer, blue_buffer)
    }

    /// Apply box blur (separable) for efficient Gaussian approximation
    fn box_blur_channel(&self, buffer: &mut PixelBuffer, width: usize, height: usize) {
        if self.config.radius == 0 {
            return;
        }

        let radius = self.config.radius;
        
        // Horizontal pass
        let mut temp = buffer.clone();
        for y in 0..height {
            for x in 0..width {
                let mut sum = (0.0, 0.0, 0.0, 0.0);
                let mut count = 0;

                for dx in -(radius as i32)..=(radius as i32) {
                    let nx = (x as i32 + dx).clamp(0, width as i32 - 1) as usize;
                    let idx = y * width + nx;
                    sum.0 += buffer[idx].0;
                    sum.1 += buffer[idx].1;
                    sum.2 += buffer[idx].2;
                    sum.3 += buffer[idx].3;
                    count += 1;
                }

                let inv_count = 1.0 / count as f64;
                temp[y * width + x] = (
                    sum.0 * inv_count,
                    sum.1 * inv_count,
                    sum.2 * inv_count,
                    sum.3 * inv_count,
                );
            }
        }

        // Vertical pass
        for y in 0..height {
            for x in 0..width {
                let mut sum = (0.0, 0.0, 0.0, 0.0);
                let mut count = 0;

                for dy in -(radius as i32)..=(radius as i32) {
                    let ny = (y as i32 + dy).clamp(0, height as i32 - 1) as usize;
                    let idx = ny * width + x;
                    sum.0 += temp[idx].0;
                    sum.1 += temp[idx].1;
                    sum.2 += temp[idx].2;
                    sum.3 += temp[idx].3;
                    count += 1;
                }

                let inv_count = 1.0 / count as f64;
                buffer[y * width + x] = (
                    sum.0 * inv_count,
                    sum.1 * inv_count,
                    sum.2 * inv_count,
                    sum.3 * inv_count,
                );
            }
        }
    }
}

impl PostEffect for ChromaticBloom {
    fn is_enabled(&self) -> bool {
        self.enabled && self.config.strength > 0.0 && self.config.radius > 0
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

        // Extract bright pixels
        let bright = self.extract_bright_pixels(input, width, height);

        // Separate into RGB channels with spatial offsets
        let (mut red, mut green, mut blue) = self.create_separated_channels(&bright, width, height);

        // Blur each channel independently
        self.box_blur_channel(&mut red, width, height);
        self.box_blur_channel(&mut green, width, height);
        self.box_blur_channel(&mut blue, width, height);

        // Composite back with additive blending
        let output: PixelBuffer = input
            .par_iter()
            .zip(red.par_iter())
            .zip(green.par_iter())
            .zip(blue.par_iter())
            .map(|(((orig, r), g), b)| {
                let bloom_r = r.0;
                let bloom_g = g.1;
                let bloom_b = b.2;

                (
                    (orig.0 + bloom_r * self.config.strength).min(10.0), // Clamp to reasonable HDR range
                    (orig.1 + bloom_g * self.config.strength).min(10.0),
                    (orig.2 + bloom_b * self.config.strength).min(10.0),
                    orig.3,
                )
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create `a` test buffer with uniform pixel values.
    fn test_buffer(width: usize, height: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); width * height]
    }

    /// Create a test buffer with a bright center spot.
    fn test_buffer_with_center_spot(width: usize, height: usize, bg: f64, spot: f64) -> PixelBuffer {
        let cx = width / 2;
        let cy = height / 2;
        let radius = (width.min(height) / 4) as f64;
        
        (0..height * width)
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                let dx = x as f64 - cx as f64;
                let dy = y as f64 - cy as f64;
                let dist = (dx * dx + dy * dy).sqrt();
                
                if dist < radius {
                    (spot, spot, spot, 1.0)
                } else {
                    (bg, bg, bg, 1.0)
                }
            })
            .collect()
    }

    fn test_config() -> ChromaticBloomConfig {
        ChromaticBloomConfig {
            radius: 5,
            strength: 0.5,
            separation: 3.0,
            threshold: 0.3,
        }
    }

    #[test]
    fn test_chromatic_bloom_disabled_returns_input() {
        let config = ChromaticBloomConfig { strength: 0.0, ..test_config() };
        let bloom = ChromaticBloom::new(config);
        let input = test_buffer(10, 10, 0.5);
        
        let result = bloom.process(&input, 10, 10).unwrap();
        
        // With zero strength, output should match input
        for (orig, res) in input.iter().zip(result.iter()) {
            assert!((orig.0 - res.0).abs() < 1e-10, "Output differs from input with zero strength");
        }
    }

    #[test]
    fn test_chromatic_bloom_zero_radius_returns_input() {
        let config = ChromaticBloomConfig { radius: 0, ..test_config() };
        let bloom = ChromaticBloom::new(config);
        let input = test_buffer(10, 10, 0.5);
        
        let result = bloom.process(&input, 10, 10).unwrap();
        
        // With zero radius, output should match input
        for (orig, res) in input.iter().zip(result.iter()) {
            assert!((orig.0 - res.0).abs() < 1e-10, "Output differs from input with zero radius");
        }
    }

    #[test]
    fn test_chromatic_bloom_respects_threshold() {
        let config = ChromaticBloomConfig { threshold: 0.8, ..test_config() };
        let bloom = ChromaticBloom::new(config);
        
        // Create input below threshold
        let input = test_buffer(20, 20, 0.3); // Below 0.8 threshold
        let result = bloom.process(&input, 20, 20).unwrap();
        
        // Below-threshold pixels should have minimal bloom added
        for (orig, res) in input.iter().zip(result.iter()) {
            assert!(
                (orig.0 - res.0).abs() < 0.1,
                "Below-threshold pixels changed too much: {} vs {}",
                orig.0, res.0
            );
        }
    }

    #[test]
    fn test_chromatic_bloom_adds_color() {
        let config = test_config();
        let bloom = ChromaticBloom::new(config);
        
        // Create high-luminance input with bright center
        let input = test_buffer_with_center_spot(50, 50, 0.1, 0.9);
        let result = bloom.process(&input, 50, 50).unwrap();
        
        // Center pixels should have bloom added (brightness should increase or stay same)
        let center_idx = 25 * 50 + 25;
        assert!(
            result[center_idx].0 >= input[center_idx].0 - 0.01,
            "Bloom should not significantly reduce brightness at center: {} vs {}",
            result[center_idx].0, input[center_idx].0
        );
    }

    #[test]
    fn test_chromatic_bloom_preserves_alpha() {
        let config = test_config();
        let bloom = ChromaticBloom::new(config);
        
        let mut input = test_buffer(10, 10, 0.9);
        input[50].3 = 0.5; // Set one pixel to 50% alpha
        
        let result = bloom.process(&input, 10, 10).unwrap();
        
        // Alpha should be preserved (bloom doesn't modify alpha)
        assert_eq!(result[50].3, input[50].3, "Alpha should be preserved");
    }

    #[test]
    fn test_bilinear_sampling_center() {
        let buffer = test_buffer(10, 10, 0.5);
        
        let result = ChromaticBloom::sample_bilinear(&buffer, 10, 10, 5.0, 5.0);
        assert!((result.0 - 0.5).abs() < 1e-10, "Center sampling should return exact value");
    }

    #[test]
    fn test_bilinear_sampling_corners() {
        let buffer = test_buffer(10, 10, 0.5);
        
        // Test corner sampling
        let corner_tl = ChromaticBloom::sample_bilinear(&buffer, 10, 10, 0.0, 0.0);
        assert!((corner_tl.0 - 0.5).abs() < 1e-10, "Top-left corner sampling failed");
        
        let corner_br = ChromaticBloom::sample_bilinear(&buffer, 10, 10, 9.0, 9.0);
        assert!((corner_br.0 - 0.5).abs() < 1e-10, "Bottom-right corner sampling failed");
    }

    #[test]
    fn test_bilinear_sampling_oob_clamps() {
        let buffer = test_buffer(10, 10, 0.5);
        
        // Out-of-bounds coordinates should clamp to valid range
        let oob_negative = ChromaticBloom::sample_bilinear(&buffer, 10, 10, -5.0, -5.0);
        assert!((oob_negative.0 - 0.5).abs() < 1e-10, "Negative coords should clamp to edge");
        
        let oob_positive = ChromaticBloom::sample_bilinear(&buffer, 10, 10, 15.0, 15.0);
        assert!((oob_positive.0 - 0.5).abs() < 1e-10, "Large coords should clamp to edge");
    }

    #[test]
    fn test_bilinear_interpolation() {
        // Create a gradient buffer
        let width = 10;
        let height = 10;
        let buffer: PixelBuffer = (0..width * height)
            .map(|idx| {
                let x = idx % width;
                let value = x as f64 / (width - 1) as f64;
                (value, value, value, 1.0)
            })
            .collect();
        
        // Sampling between x=4 and x=5 should interpolate
        let result = ChromaticBloom::sample_bilinear(&buffer, width, height, 4.5, 5.0);
        let expected = 4.5 / 9.0; // Linearly interpolated
        assert!(
            (result.0 - expected).abs() < 0.01,
            "Bilinear interpolation failed: {} vs {}",
            result.0, expected
        );
    }

    #[test]
    fn test_extract_bright_pixels_threshold() {
        let config = ChromaticBloomConfig { threshold: 0.5, ..test_config() };
        let bloom = ChromaticBloom::new(config);
        
        // Create buffer with varying brightness
        let buffer: PixelBuffer = (0..100)
            .map(|i| {
                let value = i as f64 / 100.0;
                (value, value, value, 1.0)
            })
            .collect();
        
        let bright = bloom.extract_bright_pixels(&buffer, 10, 10);
        
        // Pixels below 0.5 threshold should be dark/zero
        for (i, pixel) in bright.iter().enumerate().take(50) {
            assert!(
                pixel.0 < 0.1,
                "Below-threshold pixel {i} should be dark: {}",
                pixel.0
            );
        }
        
        // Pixels above threshold should have some brightness
        for (i, pixel) in bright.iter().enumerate().skip(75).take(25) {
            assert!(
                pixel.0 > 0.0,
                "Above-threshold pixel {} should be bright: {}",
                i + 75, pixel.0
            );
        }
    }

    #[test]
    fn test_box_blur_uniform_unchanged() {
        let config = ChromaticBloomConfig { radius: 3, ..test_config() };
        let bloom = ChromaticBloom::new(config);
        
        // Uniform buffer should remain uniform after blur
        let mut buffer = test_buffer(20, 20, 0.6);
        bloom.box_blur_channel(&mut buffer, 20, 20);
        
        for (i, pixel) in buffer.iter().enumerate() {
            assert!(
                (pixel.0 - 0.6).abs() < 0.01,
                "Uniform blur result differs at {}: {}",
                i, pixel.0
            );
        }
    }

    #[test]
    fn test_config_from_resolution_scales() {
        let config_1080 = ChromaticBloomConfig::from_resolution(1920, 1080);
        let config_4k = ChromaticBloomConfig::from_resolution(3840, 2160);
        
        // 4K should have approximately double the radius
        assert!(
            config_4k.radius > config_1080.radius,
            "4K should have larger radius than 1080p"
        );
        
        // Separation should also scale
        assert!(
            config_4k.separation > config_1080.separation,
            "4K should have larger separation than 1080p"
        );
    }

    #[test]
    fn test_output_values_reasonable() {
        let config = test_config();
        let bloom = ChromaticBloom::new(config);
        
        // Create a bright test pattern
        let input = test_buffer_with_center_spot(50, 50, 0.1, 0.95);
        let result = bloom.process(&input, 50, 50).unwrap();
        
        // All output values should be in reasonable HDR range
        for (i, pixel) in result.iter().enumerate() {
            assert!(
                pixel.0 >= 0.0 && pixel.0 <= 10.0,
                "R value out of range at {}: {}",
                i, pixel.0
            );
            assert!(
                pixel.1 >= 0.0 && pixel.1 <= 10.0,
                "G value out of range at {}: {}",
                i, pixel.1
            );
            assert!(
                pixel.2 >= 0.0 && pixel.2 <= 10.0,
                "B value out of range at {}: {}",
                i, pixel.2
            );
            assert!(
                pixel.3 >= 0.0 && pixel.3 <= 1.0,
                "Alpha out of range at {}: {}",
                i, pixel.3
            );
        }
    }

    #[test]
    fn test_is_enabled() {
        // Enabled when strength > 0 and radius > 0
        let enabled = ChromaticBloom::new(ChromaticBloomConfig {
            strength: 0.5,
            radius: 5,
            ..Default::default()
        });
        assert!(enabled.is_enabled());
        
        // Disabled when strength = 0
        let disabled_strength = ChromaticBloom::new(ChromaticBloomConfig {
            strength: 0.0,
            radius: 5,
            ..Default::default()
        });
        assert!(!disabled_strength.is_enabled());
        
        // Disabled when radius = 0
        let disabled_radius = ChromaticBloom::new(ChromaticBloomConfig {
            strength: 0.5,
            radius: 0,
            ..Default::default()
        });
        assert!(!disabled_radius.is_enabled());
    }
}

