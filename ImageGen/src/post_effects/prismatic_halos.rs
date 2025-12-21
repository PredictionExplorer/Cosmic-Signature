//! Prismatic ice halos effect for optical phenomena.
//!
//! This effect simulates the complex optical halos and sundogs that appear when
//! light passes through ice crystals in Earth's atmosphere. Adapted for cosmic
//! visualization, it creates rainbow-tinged rings and arcs around bright regions,
//! adding optical complexity and breaking the "clean digital" look.
//!
//! # Physics Inspiration
//!
//! Real atmospheric halos are caused by:
//! - Refraction through hexagonal ice crystals
//! - 22° and 46° circular halos
//! - Parhelia (sundogs) at specific angles
//! - Circumzenithal arcs (smile-shaped arcs)
//!
//! # Implementation
//!
//! We simplify by creating circular halos around bright spots with chromatic
//! separation, giving a prismatic, jewel-like quality to high-energy regions.

use super::{FrameParams, PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for prismatic halos effect
#[derive(Clone, Debug)]
pub struct PrismaticHalosConfig {
    /// Overall strength of the halo effect (0.0-1.0)
    pub strength: f64,
    /// Luminance threshold for halo emission
    pub threshold: f64,
    /// Inner halo radius (in pixels at 1080p scale)
    pub inner_radius: f64,
    /// Outer halo radius
    pub outer_radius: f64,
    /// Chromatic separation strength (rainbow spread)
    pub chromatic_separation: f64,
    /// Halo sharpness (higher = sharper rings)
    pub sharpness: f64,
    /// Number of halo rings
    pub ring_count: usize,
}

impl Default for PrismaticHalosConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl PrismaticHalosConfig {
    /// Configuration optimized for special mode (dramatic halos)
    pub fn special_mode() -> Self {
        Self {
            strength: 0.42,
            threshold: 0.70,    // Only very bright regions create halos
            inner_radius: 25.0, // Start of halo
            outer_radius: 65.0, // End of halo
            chromatic_separation: 0.35,
            sharpness: 2.5,
            ring_count: 3, // Multiple overlapping rings
        }
    }

    /// Configuration for standard mode (subtle optical hints)
    #[allow(dead_code)] // Public API for library consumers
    pub fn standard_mode() -> Self {
        Self {
            strength: 0.25,
            threshold: 0.75,
            inner_radius: 20.0,
            outer_radius: 50.0,
            chromatic_separation: 0.25,
            sharpness: 3.0,
            ring_count: 2,
        }
    }
}

/// Prismatic halos post-effect
pub struct PrismaticHalos {
    config: PrismaticHalosConfig,
    enabled: bool,
}

impl PrismaticHalos {
    /// Create a new prismatic halos effect
    pub fn new(config: PrismaticHalosConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Find bright spots that should emit halos
    fn find_emitters(
        &self,
        input: &PixelBuffer,
        width: usize,
        _height: usize,
    ) -> Vec<(usize, usize, f64)> {
        let threshold = self.config.threshold;

        input
            .par_iter()
            .enumerate()
            .filter_map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return None;
                }

                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                if lum > threshold {
                    let x = idx % width;
                    let y = idx / width;
                    let brightness = ((lum - threshold) / (1.0 - threshold)).min(1.0);
                    Some((x, y, brightness))
                } else {
                    None
                }
            })
            .collect()
    }

    /// Generate halo contribution at a pixel from an emitter
    fn calculate_halo_at_pixel(
        &self,
        px: usize,
        py: usize,
        emit_x: usize,
        emit_y: usize,
        emit_brightness: f64,
    ) -> (f64, f64, f64) {
        let dx = px as f64 - emit_x as f64;
        let dy = py as f64 - emit_y as f64;
        let dist = (dx * dx + dy * dy).sqrt();

        if dist < self.config.inner_radius || dist > self.config.outer_radius {
            return (0.0, 0.0, 0.0);
        }

        // Multiple rings
        let mut total_r = 0.0;
        let mut total_g = 0.0;
        let mut total_b = 0.0;

        for ring_idx in 0..self.config.ring_count {
            let ring_offset = (ring_idx as f64) * 0.3;

            // Normalized distance within halo range
            let halo_range = self.config.outer_radius - self.config.inner_radius;
            let t = ((dist - self.config.inner_radius) / halo_range + ring_offset).fract();

            // Ring intensity (peaked at specific distances)
            let ring_center = 0.5;
            let ring_intensity = 1.0 - ((t - ring_center).abs() * 2.0).powf(self.config.sharpness);
            let ring_intensity = ring_intensity.max(0.0);

            // Distance falloff
            let falloff = 1.0 - (dist - self.config.inner_radius) / halo_range;

            // Chromatic separation - different colors peak at different radii
            let chroma_shift = self.config.chromatic_separation;
            let r_peak = (t - chroma_shift * 0.5).abs();
            let g_peak = t.abs();
            let b_peak = (t + chroma_shift * 0.5).abs();

            let r_intensity = (1.0 - r_peak * 2.0).max(0.0).powf(1.5);
            let g_intensity = (1.0 - g_peak * 2.0).max(0.0).powf(1.5);
            let b_intensity = (1.0 - b_peak * 2.0).max(0.0).powf(1.5);

            let weight = ring_intensity * falloff * emit_brightness;

            total_r += r_intensity * weight;
            total_g += g_intensity * weight;
            total_b += b_intensity * weight;
        }

        (total_r, total_g, total_b)
    }
}

impl PostEffect for PrismaticHalos {
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

        // Find bright spots that emit halos
        let emitters = self.find_emitters(input, width, height);

        if emitters.is_empty() {
            return Ok(input.clone());
        }

        // Calculate halo contribution for each pixel
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let px = idx % width;
                let py = idx / width;

                let mut halo_r = 0.0;
                let mut halo_g = 0.0;
                let mut halo_b = 0.0;

                // Accumulate halos from all emitters
                for &(emit_x, emit_y, brightness) in &emitters {
                    let (hr, hg, hb) =
                        self.calculate_halo_at_pixel(px, py, emit_x, emit_y, brightness);
                    halo_r += hr;
                    halo_g += hg;
                    halo_b += hb;
                }

                // Apply strength and composite (additive)
                let strength = self.config.strength;
                (r + halo_r * strength, g + halo_g * strength, b + halo_b * strength, a)
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
    fn test_prismatic_halos_disabled() {
        let config = PrismaticHalosConfig { strength: 0.0, ..PrismaticHalosConfig::default() };
        let effect = PrismaticHalos::new(config);
        assert!(!effect.is_enabled());
    }

    #[test]
    fn test_prismatic_halos_enabled() {
        let config = PrismaticHalosConfig::default();
        let effect = PrismaticHalos::new(config);
        assert!(effect.is_enabled());
    }

    #[test]
    fn test_prismatic_halos_basic() {
        let config = PrismaticHalosConfig::default();
        let effect = PrismaticHalos::new(config);

        // Create a bright spot in the center
        let mut buffer = test_buffer(100, 100, 0.1);
        buffer[50 * 100 + 50] = (1.0, 1.0, 1.0, 1.0); // Bright center

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_prismatic_halos_no_emitters() {
        let config = PrismaticHalosConfig::default();
        let effect = PrismaticHalos::new(config);

        // Buffer too dark to emit halos
        let buffer = test_buffer(100, 100, 0.3);
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
    }

    #[test]
    fn test_find_emitters_respects_threshold() {
        let config = PrismaticHalosConfig { threshold: 0.5, ..PrismaticHalosConfig::default() };
        let effect = PrismaticHalos::new(config);

        let mut buffer = test_buffer(100, 100, 0.3);
        buffer[25 * 100 + 25] = (0.9, 0.9, 0.9, 1.0); // Above threshold
        buffer[75 * 100 + 75] = (0.4, 0.4, 0.4, 1.0); // Below threshold

        let emitters = effect.find_emitters(&buffer, 100, 100);
        assert_eq!(emitters.len(), 1); // Only one bright enough
    }

    #[test]
    fn test_output_values_finite() {
        let config = PrismaticHalosConfig::default();
        let effect = PrismaticHalos::new(config);

        let mut buffer = test_buffer(100, 100, 0.2);
        // Add some bright spots
        buffer[30 * 100 + 30] = (1.5, 1.5, 1.5, 1.0);
        buffer[70 * 100 + 70] = (2.0, 2.0, 2.0, 1.0);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params).unwrap();

        for &(r, g, b, a) in &result {
            assert!(r.is_finite(), "Red channel not finite");
            assert!(g.is_finite(), "Green channel not finite");
            assert!(b.is_finite(), "Blue channel not finite");
            assert!(a.is_finite(), "Alpha channel not finite");
        }
    }
}
