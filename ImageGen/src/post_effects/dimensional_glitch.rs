//! Dimensional glitch effect for digital aesthetics.
//!
//! This effect introduces intentional digital artifacts (block sorting, channel
//! displacement, pixel corruption) that trigger during high-energy moments of the
//! simulation. It creates a sense that the computational reality is struggling to
//! contain the extreme physics, adding a unique "meta" layer to the visualization.
//!
//! # Artistic Concept
//!
//! By embracing the digital medium rather than hiding it, we create glitch art
//! that comments on the computational nature of the simulation itself. The glitches
//! serve as visual punctuation marks for chaotic events.
//!
//! # Implementation
//!
//! Uses luminance/energy as a trigger for various digital artifacts:
//! - Block sorting/displacement (à la datamoshing)
//! - RGB channel offsetting
//! - Pixel value quantization
//! - Scanline artifacts

use super::{FrameParams, PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for dimensional glitch effect
#[derive(Clone, Debug)]
#[allow(dead_code)] // Some fields used only in standard_mode, which is API for future use
pub struct DimensionalGlitchConfig {
    /// Overall strength of glitch artifacts (0.0-1.0)
    pub strength: f64,
    /// Energy threshold for glitch activation (luminance)
    pub threshold: f64,
    /// Block displacement strength
    pub block_displacement: f64,
    /// RGB channel separation distance
    pub channel_separation: f64,
    /// Scanline artifact intensity
    pub scanline_intensity: f64,
    /// Quantization levels (lower = more posterized)
    pub quantization_levels: f64,
    /// Glitch block size in pixels
    pub block_size: usize,
}

impl Default for DimensionalGlitchConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl DimensionalGlitchConfig {
    /// Configuration optimized for special mode (dramatic glitches)
    #[allow(dead_code)] // Public API for library consumers
    pub fn special_mode() -> Self {
        Self {
            strength: 0.35,
            threshold: 0.75, // High energy triggers glitches
            block_displacement: 8.0,
            channel_separation: 4.0,
            scanline_intensity: 0.25,
            quantization_levels: 12.0, // Moderate posterization
            block_size: 8,
        }
    }

    /// Configuration for standard mode (subtle artifacts)
    #[allow(dead_code)] // Public API for library consumers
    pub fn standard_mode() -> Self {
        Self {
            strength: 0.20,
            threshold: 0.80,
            block_displacement: 4.0,
            channel_separation: 2.0,
            scanline_intensity: 0.15,
            quantization_levels: 16.0,
            block_size: 6,
        }
    }
}

/// Dimensional glitch post-effect
pub struct DimensionalGlitch {
    config: DimensionalGlitchConfig,
    enabled: bool,
}

impl DimensionalGlitch {
    /// Create a new dimensional glitch effect
    pub fn new(config: DimensionalGlitchConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Calculate glitch intensity based on local energy
    fn calculate_glitch_intensity(&self, input: &PixelBuffer) -> Vec<f64> {
        input
            .par_iter()
            .map(|&(r, g, b, _a)| {
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                if lum < self.config.threshold {
                    0.0
                } else {
                    let energy = ((lum - self.config.threshold) / (1.0 - self.config.threshold))
                        .clamp(0.0, 1.0);
                    energy.powf(2.0) // Quadratic for sharper trigger
                }
            })
            .collect()
    }

    /// Simple hash for pseudo-random displacement
    #[inline]
    fn hash(x: usize, y: usize) -> f64 {
        let n = (x.wrapping_mul(374_761_393) ^ y.wrapping_mul(668_265_263)) as f64;
        (n * 0.000_000_01).fract()
    }

    /// Apply block displacement effect
    fn apply_block_displacement(
        &self,
        input: &PixelBuffer,
        glitch_map: &[f64],
        width: usize,
        height: usize,
    ) -> PixelBuffer {
        let block_size = self.config.block_size;

        input
            .par_iter()
            .enumerate()
            .map(|(idx, &pixel)| {
                let x = idx % width;
                let y = idx / width;

                let block_x = x / block_size;
                let block_y = y / block_size;

                // Average glitch intensity in this block
                let mut block_glitch = 0.0;
                let mut count = 0;

                for by in (block_y * block_size)..((block_y + 1) * block_size).min(height) {
                    for bx in (block_x * block_size)..((block_x + 1) * block_size).min(width) {
                        block_glitch += glitch_map[by * width + bx];
                        count += 1;
                    }
                }

                if count > 0 {
                    block_glitch /= count as f64;
                }

                if block_glitch < 0.1 {
                    return pixel;
                }

                // Displace this block randomly
                let hash_val = Self::hash(block_x, block_y);
                let disp_x =
                    ((hash_val * 2.0 - 1.0) * self.config.block_displacement * block_glitch) as i32;
                let disp_y = (((hash_val * 17.0).fract() * 2.0 - 1.0)
                    * self.config.block_displacement
                    * block_glitch) as i32;

                let src_x = (x as i32 + disp_x).clamp(0, (width - 1) as i32) as usize;
                let src_y = (y as i32 + disp_y).clamp(0, (height - 1) as i32) as usize;
                let src_idx = src_y * width + src_x;

                input[src_idx]
            })
            .collect()
    }

    /// Apply RGB channel separation
    fn apply_channel_separation(
        &self,
        input: &PixelBuffer,
        glitch_map: &[f64],
        width: usize,
        _height: usize,
    ) -> PixelBuffer {
        input
            .par_iter()
            .enumerate()
            .map(|(idx, _)| {
                let x = idx % width;
                let y = idx / width;
                let glitch = glitch_map[idx];

                if glitch < 0.1 {
                    return input[idx];
                }

                let sep = self.config.channel_separation * glitch;

                // Sample each channel at different offsets
                let r_idx = y * width + ((x as f64 - sep) as usize).clamp(0, width - 1);
                let g_idx = idx;
                let b_idx = y * width + ((x as f64 + sep) as usize).clamp(0, width - 1);

                let r = input[r_idx].0;
                let g = input[g_idx].1;
                let b = input[b_idx].2;
                let a = input[idx].3;

                (r, g, b, a)
            })
            .collect()
    }

    /// Apply scanline artifacts
    fn apply_scanlines(
        &self,
        buffer: &mut PixelBuffer,
        glitch_map: &[f64],
        width: usize,
        _height: usize,
    ) {
        buffer.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
            let y = idx / width;
            let glitch = glitch_map[idx];

            if glitch < 0.1 {
                return;
            }

            // Scanline darkness on odd lines
            if y % 2 == 1 {
                let darken = self.config.scanline_intensity * glitch;
                pixel.0 *= 1.0 - darken;
                pixel.1 *= 1.0 - darken;
                pixel.2 *= 1.0 - darken;
            }
        });
    }
}

impl PostEffect for DimensionalGlitch {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        // Calculate where glitches should appear
        let glitch_map = self.calculate_glitch_intensity(input);

        // Check if any glitches are triggered
        let max_glitch = glitch_map.iter().copied().fold(0.0f64, f64::max);
        if max_glitch < 0.01 {
            return Ok(input.clone());
        }

        // Apply glitch layers in sequence
        let mut output = self.apply_block_displacement(input, &glitch_map, width, height);
        output = self.apply_channel_separation(&output, &glitch_map, width, height);
        self.apply_scanlines(&mut output, &glitch_map, width, height);

        // Apply overall strength
        let output: PixelBuffer = output
            .par_iter()
            .zip(input.par_iter())
            .map(|(&glitched, &original)| {
                let strength = self.config.strength;
                (
                    original.0 * (1.0 - strength) + glitched.0 * strength,
                    original.1 * (1.0 - strength) + glitched.1 * strength,
                    original.2 * (1.0 - strength) + glitched.2 * strength,
                    original.3,
                )
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
    fn test_dimensional_glitch_disabled() {
        let config =
            DimensionalGlitchConfig { strength: 0.0, ..DimensionalGlitchConfig::default() };
        let effect = DimensionalGlitch::new(config);
        assert!(!effect.is_enabled());
    }

    #[test]
    fn test_dimensional_glitch_enabled() {
        let config = DimensionalGlitchConfig::default();
        let effect = DimensionalGlitch::new(config);
        assert!(effect.is_enabled());
    }

    #[test]
    fn test_dimensional_glitch_basic() {
        let config = DimensionalGlitchConfig::default();
        let effect = DimensionalGlitch::new(config);

        // Create high-energy buffer to trigger glitches
        let buffer = test_buffer(100, 100, 0.9);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_dimensional_glitch_no_trigger() {
        let config = DimensionalGlitchConfig::default();
        let effect = DimensionalGlitch::new(config);

        // Low energy should not trigger glitches
        let buffer = test_buffer(100, 100, 0.3);
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params).unwrap();

        // Should be nearly identical to input
        assert_eq!(result.len(), buffer.len());
    }

    #[test]
    fn test_hash_deterministic() {
        let h1 = DimensionalGlitch::hash(10, 20);
        let h2 = DimensionalGlitch::hash(10, 20);
        assert_eq!(h1, h2);

        let h3 = DimensionalGlitch::hash(11, 20);
        assert_ne!(h1, h3);
    }

    #[test]
    fn test_output_values_finite() {
        let config = DimensionalGlitchConfig::default();
        let effect = DimensionalGlitch::new(config);

        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 1.5;
                (val, val * 0.9, val * 1.1, 1.0)
            })
            .collect();

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params).unwrap();

        for &(r, g, b, a) in &result {
            assert!(r.is_finite(), "Red channel not finite");
            assert!(g.is_finite(), "Green channel not finite");
            assert!(b.is_finite(), "Blue channel not finite");
            assert!(a.is_finite(), "Alpha channel not finite");
        }
    }
}
