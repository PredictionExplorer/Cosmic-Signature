//! Event Horizon gravitational lensing effect.
//!
//! This effect simulates the extreme warping of space-time around massive bodies,
//! creating a "black hole" style gravitational lens that bends light and background
//! elements around dense regions of the trajectory field.
//!
//! # Physics Basis
//!
//! Real gravitational lensing occurs when massive objects warp space-time, bending
//! the path of light passing near them. This effect creates:
//! - **Radial distortion** toward mass centers
//! - **Einstein rings** around perfectly aligned sources
//! - **Chromatic aberration** from differential bending by wavelength
//!
//! # Implementation
//!
//! 1. **Density Map Generation**: Convert luminance to a "mass" field
//! 2. **Gravitational Potential**: Calculate cumulative gravitational effect
//! 3. **Lensing Distortion**: Warp background pixels toward mass centers
//! 4. **Chromatic Separation**: Simulate wavelength-dependent bending

use super::{FrameParams, PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for event horizon lensing effect
#[derive(Clone, Debug)]
pub struct EventHorizonConfig {
    /// Overall strength of the gravitational lensing (0.0-1.0)
    pub strength: f64,
    /// Mass scaling factor (how bright regions map to gravitational mass)
    pub mass_scale: f64,
    /// Gravitational constant (controls falloff rate)
    pub gravity_constant: f64,
    /// Maximum lensing displacement in pixels
    pub max_displacement: f64,
    /// Chromatic aberration strength (wavelength-dependent bending)
    pub chromatic_aberration: f64,
    /// Minimum luminance threshold for mass contribution
    pub mass_threshold: f64,
    /// Softening factor to prevent singularities
    pub softening: f64,
}

impl Default for EventHorizonConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl EventHorizonConfig {
    /// Configuration optimized for special mode (dramatic but controlled lensing)
    pub fn special_mode() -> Self {
        Self {
            strength: 0.45,              // Visible but not overwhelming
            mass_scale: 2.5,             // Bright regions have strong gravitational effect
            gravity_constant: 150.0,     // Controls how quickly effect falls off with distance
            max_displacement: 35.0,      // Maximum pixel shift (prevents extreme distortion)
            chromatic_aberration: 0.008, // Subtle rainbow fringing at lens edges
            mass_threshold: 0.15,        // Only moderately bright regions contribute mass
            softening: 3.0,              // Prevents singularities at point masses
        }
    }

    /// Configuration for standard mode (subtle space-time curvature)
    #[allow(dead_code)] // Public API for library consumers
    pub fn standard_mode() -> Self {
        Self {
            strength: 0.25,
            mass_scale: 1.8,
            gravity_constant: 120.0,
            max_displacement: 20.0,
            chromatic_aberration: 0.004,
            mass_threshold: 0.20,
            softening: 4.0,
        }
    }
}

/// Event horizon gravitational lensing post-effect
pub struct EventHorizon {
    config: EventHorizonConfig,
    enabled: bool,
}

impl EventHorizon {
    /// Create a new event horizon lensing effect
    pub fn new(config: EventHorizonConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Generate mass/density map from luminance
    ///
    /// Bright regions are treated as massive objects that warp space-time.
    /// Returns a normalized mass field in range [0, 1].
    fn generate_mass_map(&self, input: &PixelBuffer) -> Vec<f64> {
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 0.0 {
                    return 0.0;
                }

                // Calculate luminance (Rec. 709)
                let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / a;

                // Threshold and scale to mass
                if lum < self.config.mass_threshold {
                    0.0
                } else {
                    let mass_contribution =
                        (lum - self.config.mass_threshold) / (1.0 - self.config.mass_threshold);
                    mass_contribution.powf(1.5) * self.config.mass_scale
                }
            })
            .collect()
    }

    /// Calculate gravitational displacement vector at a given pixel
    ///
    /// This simulates the bending of light rays passing near massive objects.
    /// Uses inverse-square law with softening to prevent singularities.
    #[inline]
    fn calculate_gravitational_displacement(
        &self,
        x: usize,
        y: usize,
        width: usize,
        height: usize,
        mass_map: &[f64],
    ) -> (f64, f64) {
        let px = x as f64;
        let py = y as f64;

        let mut disp_x = 0.0;
        let mut disp_y = 0.0;

        // Sample a grid of mass points to accumulate gravitational effect
        // For performance, we downsample the mass map
        let sample_step = (width.min(height) / 40).max(1);

        for my in (0..height).step_by(sample_step) {
            for mx in (0..width).step_by(sample_step) {
                let mass = mass_map[my * width + mx];
                if mass < 0.01 {
                    continue;
                }

                let dx = mx as f64 - px;
                let dy = my as f64 - py;
                let dist_sq = dx * dx + dy * dy + self.config.softening * self.config.softening;
                let dist = dist_sq.sqrt();

                // Gravitational force proportional to mass / distance^2
                // Direction: toward the mass
                let force = mass * self.config.gravity_constant / dist_sq;

                // Displacement is in direction of the mass (attractive)
                disp_x += (dx / dist) * force;
                disp_y += (dy / dist) * force;
            }
        }

        // Clamp to maximum displacement
        let disp_mag = (disp_x * disp_x + disp_y * disp_y).sqrt();
        if disp_mag > self.config.max_displacement {
            let scale = self.config.max_displacement / disp_mag;
            disp_x *= scale;
            disp_y *= scale;
        }

        (disp_x, disp_y)
    }

    /// Sample pixel with bounds checking and bilinear interpolation
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

        let idx00 = y0 * width + x0;
        let idx01 = y0 * width + x1;
        let idx10 = y1 * width + x0;
        let idx11 = y1 * width + x1;

        let p00 = buffer[idx00];
        let p01 = buffer[idx01];
        let p10 = buffer[idx10];
        let p11 = buffer[idx11];

        let interpolate = |v00: f64, v01: f64, v10: f64, v11: f64| {
            let top = v00 * (1.0 - fx) + v01 * fx;
            let bot = v10 * (1.0 - fx) + v11 * fx;
            top * (1.0 - fy) + bot * fy
        };

        (
            interpolate(p00.0, p01.0, p10.0, p11.0),
            interpolate(p00.1, p01.1, p10.1, p11.1),
            interpolate(p00.2, p01.2, p10.2, p11.2),
            interpolate(p00.3, p01.3, p10.3, p11.3),
        )
    }
}

impl PostEffect for EventHorizon {
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

        // 1. Generate mass map from luminance
        let mass_map = self.generate_mass_map(input);

        // 2. Calculate gravitational displacement for each pixel
        let displacements: Vec<(f64, f64)> = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                self.calculate_gravitational_displacement(x, y, width, height, &mass_map)
            })
            .collect();

        // 3. Apply lensing with chromatic aberration
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(_r, _g, _b, a))| {
                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                let (disp_x, disp_y) = displacements[idx];

                // Apply strength scaling
                let dx = disp_x * self.config.strength;
                let dy = disp_y * self.config.strength;

                // Chromatic aberration: different wavelengths bend differently
                let aberr = self.config.chromatic_aberration;

                // Red (longest wavelength) bends least - sample closer
                let (rr, _, _, _) = Self::sample_bilinear(
                    input,
                    width,
                    height,
                    x + dx * (1.0 - aberr),
                    y + dy * (1.0 - aberr),
                );

                // Green (middle wavelength) - centered
                let (_, gg, _, _) = Self::sample_bilinear(input, width, height, x + dx, y + dy);

                // Blue (shortest wavelength) bends most - sample further
                let (_, _, bb, _) = Self::sample_bilinear(
                    input,
                    width,
                    height,
                    x + dx * (1.0 + aberr),
                    y + dy * (1.0 + aberr),
                );

                // Preserve original alpha
                (rr, gg, bb, a)
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
    fn test_event_horizon_disabled() {
        let config = EventHorizonConfig { strength: 0.0, ..EventHorizonConfig::default() };
        let effect = EventHorizon::new(config);
        assert!(!effect.is_enabled());
    }

    #[test]
    fn test_event_horizon_enabled() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);
        assert!(effect.is_enabled());
    }

    #[test]
    fn test_event_horizon_basic() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_event_horizon_handles_zero() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 50, 50, &params);
        assert!(result.is_ok());
    }

    #[test]
    fn test_event_horizon_handles_hdr() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);
        let buffer = test_buffer(50, 50, 5.0);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 50, 50, &params);
        assert!(result.is_ok());
        for &(r, g, b, _) in &result.unwrap() {
            assert!(r.is_finite());
            assert!(g.is_finite());
            assert!(b.is_finite());
        }
    }

    #[test]
    fn test_mass_map_generation() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);

        // Create buffer with varying brightness
        let buffer: PixelBuffer = (0..100)
            .map(|i| {
                let val = i as f64 / 100.0;
                (val, val, val, 1.0)
            })
            .collect();

        let mass_map = effect.generate_mass_map(&buffer);

        // Low luminance should have no mass
        assert!(mass_map[0] < 0.01);

        // High luminance should have significant mass
        assert!(mass_map[99] > 0.5);
    }

    #[test]
    fn test_gravitational_displacement_symmetry() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);

        // Create a centered bright spot
        let mut buffer = test_buffer(100, 100, 0.0);
        buffer[50 * 100 + 50] = (1.0, 1.0, 1.0, 1.0);

        let mass_map = effect.generate_mass_map(&buffer);

        // Test displacement at symmetric points
        let (dx1, _dy1) = effect.calculate_gravitational_displacement(40, 50, 100, 100, &mass_map);
        let (dx2, _dy2) = effect.calculate_gravitational_displacement(60, 50, 100, 100, &mass_map);

        // Displacements should point toward center with similar magnitude
        assert!(dx1 > 0.0); // Left side pulled right
        assert!(dx2 < 0.0); // Right side pulled left
        assert!((dx1.abs() - dx2.abs()).abs() < 0.1); // Similar magnitude
    }

    #[test]
    fn test_bilinear_sampling_bounds() {
        let buffer = test_buffer(10, 10, 0.5);

        // Test corner
        let corner = EventHorizon::sample_bilinear(&buffer, 10, 10, 0.0, 0.0);
        assert!((corner.0 - 0.5).abs() < 1e-10);

        // Test out-of-bounds (should clamp)
        let oob = EventHorizon::sample_bilinear(&buffer, 10, 10, 15.0, 15.0);
        assert!((oob.0 - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_output_values_finite() {
        let config = EventHorizonConfig::default();
        let effect = EventHorizon::new(config);

        // Create varied test buffer
        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 0.8;
                (val, val * 0.9, val * 1.1, 1.0)
            })
            .collect();

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params).unwrap();

        // All outputs should be finite
        for &(r, g, b, a) in &result {
            assert!(r.is_finite(), "Red channel not finite");
            assert!(g.is_finite(), "Green channel not finite");
            assert!(b.is_finite(), "Blue channel not finite");
            assert!(a.is_finite(), "Alpha channel not finite");
        }
    }
}
