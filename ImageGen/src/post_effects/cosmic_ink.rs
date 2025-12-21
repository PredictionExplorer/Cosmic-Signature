//! Cosmic ink effect for fluid-like space visualization.
//!
//! This effect treats space not as an empty void, but as a dark, viscous fluid
//! medium. Trajectories leave behind swirling, organic patterns reminiscent of
//! ink diffusing through water or smoke trails in low gravity.
//!
//! # Artistic Concept
//!
//! By visualizing the "wake" and turbulence left by moving bodies, we create
//! a sense that space itself has substance and memory - each particle's passage
//! through space leaves a lasting impression.
//!
//! # Implementation
//!
//! Uses multi-octave curl noise to generate organic, swirling patterns that
//! follow the flow direction indicated by luminance gradients. The result is
//! a beautiful, fluid-like texture that adds depth without overwhelming the
//! primary trajectories.

use super::{FrameParams, PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for cosmic ink effect
#[derive(Clone, Debug)]
pub struct CosmicInkConfig {
    /// Overall strength of the ink effect (0.0-1.0)
    pub strength: f64,
    /// Number of noise octaves for detail (2-5 recommended)
    pub octaves: usize,
    /// Base noise scale (lower = larger patterns)
    pub scale: f64,
    /// Swirl intensity (how much the ink follows flow)
    pub swirl_intensity: f64,
    /// Diffusion rate (how quickly ink spreads)
    pub diffusion: f64,
    /// Ink color tint (R, G, B) - dark colors recommended
    pub ink_color: (f64, f64, f64),
    /// Contrast boost for vorticity visualization
    pub vorticity_strength: f64,
}

impl Default for CosmicInkConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl CosmicInkConfig {
    /// Configuration optimized for special mode (dramatic fluid trails)
    pub fn special_mode() -> Self {
        Self {
            strength: 0.40,                // Noticeable but not overwhelming
            octaves: 4,                    // Rich multi-scale detail
            scale: 0.015,                  // Medium-scale patterns
            swirl_intensity: 0.75,         // Strong flow following
            diffusion: 0.35,               // Moderate spread
            ink_color: (0.08, 0.12, 0.18), // Deep blue-gray ink
            vorticity_strength: 0.55,      // Visible swirls
        }
    }

    /// Configuration for standard mode (subtle fluid hints)
    #[allow(dead_code)] // Public API for library consumers
    pub fn standard_mode() -> Self {
        Self {
            strength: 0.22,
            octaves: 3,
            scale: 0.020,
            swirl_intensity: 0.50,
            diffusion: 0.25,
            ink_color: (0.05, 0.08, 0.12),
            vorticity_strength: 0.35,
        }
    }
}

/// Cosmic ink post-effect
pub struct CosmicInk {
    config: CosmicInkConfig,
    enabled: bool,
}

impl CosmicInk {
    /// Create a new cosmic ink effect
    pub fn new(config: CosmicInkConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Simple hash-based noise function
    ///
    /// This creates a pseudo-random value from coordinates for procedural generation.
    #[inline]
    fn hash_noise(x: f64, y: f64) -> f64 {
        let x = x.floor();
        let y = y.floor();
        let n = x * 374_761_393.0 + y * 668_265_263.0;
        (n.sin() * 43_758.545_3).fract() * 2.0 - 1.0
    }

    /// Smooth noise using bilinear interpolation
    #[inline]
    fn smooth_noise(&self, x: f64, y: f64) -> f64 {
        let ix = x.floor();
        let iy = y.floor();
        let fx = x - ix;
        let fy = y - iy;

        // Smooth interpolation (smoothstep)
        let sx = fx * fx * (3.0 - 2.0 * fx);
        let sy = fy * fy * (3.0 - 2.0 * fy);

        // Get corner values
        let v00 = Self::hash_noise(ix, iy);
        let v10 = Self::hash_noise(ix + 1.0, iy);
        let v01 = Self::hash_noise(ix, iy + 1.0);
        let v11 = Self::hash_noise(ix + 1.0, iy + 1.0);

        // Bilinear interpolation
        let v0 = v00 * (1.0 - sx) + v10 * sx;
        let v1 = v01 * (1.0 - sx) + v11 * sx;
        v0 * (1.0 - sy) + v1 * sy
    }

    /// Multi-octave noise for rich detail
    fn fractal_noise(&self, x: f64, y: f64) -> f64 {
        let mut total = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = 1.0;
        let mut max_value = 0.0;

        for _ in 0..self.config.octaves {
            total += self.smooth_noise(x * frequency, y * frequency) * amplitude;
            max_value += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }

        let normalized = total / max_value;
        // Map from [-1, 1] to [0, 1] with clamping for safety
        (normalized * 0.5 + 0.5).clamp(0.0, 1.0)
    }

    /// Curl noise derivative for organic flow patterns
    ///
    /// Curl noise is divergence-free, making it ideal for fluid simulation.
    fn curl_noise(&self, x: f64, y: f64) -> (f64, f64) {
        let eps = 0.5;

        // Calculate gradient
        let dx = (self.fractal_noise(x + eps, y) - self.fractal_noise(x - eps, y)) / (2.0 * eps);
        let dy = (self.fractal_noise(x, y + eps) - self.fractal_noise(x, y - eps)) / (2.0 * eps);

        // Curl (rotate 90 degrees)
        (-dy, dx)
    }

    /// Generate ink pattern based on flow field
    fn generate_ink_pattern(&self, input: &PixelBuffer, width: usize, height: usize) -> Vec<f64> {
        // Calculate flow field from luminance gradients
        let flow_field: Vec<(f64, f64)> = input
            .par_iter()
            .enumerate()
            .map(|(idx, _)| {
                let x = idx % width;
                let y = idx / width;

                if x == 0 || x >= width - 1 || y == 0 || y >= height - 1 {
                    return (0.0, 0.0);
                }

                // Sobel operator
                let get_lum = |dx: i32, dy: i32| {
                    let nx = (x as i32 + dx).max(0).min((width - 1) as i32) as usize;
                    let ny = (y as i32 + dy).max(0).min((height - 1) as i32) as usize;
                    let (r, g, b, a) = input[ny * width + nx];
                    if a <= 0.0 { 0.0 } else { 0.2126 * r + 0.7152 * g + 0.0722 * b }
                };

                let gx = get_lum(1, 0) - get_lum(-1, 0);
                let gy = get_lum(0, 1) - get_lum(0, -1);

                (gx, gy)
            })
            .collect();

        // Generate ink density using flow-aligned noise
        (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;

                // Normalized coordinates
                let nx = x as f64 * self.config.scale;
                let ny = y as f64 * self.config.scale;

                // Base curl noise for organic flow
                let (curl_x, curl_y) = self.curl_noise(nx, ny);

                // Flow alignment
                let (flow_x, flow_y) = flow_field[idx];
                let flow_mag = (flow_x * flow_x + flow_y * flow_y).sqrt();

                // Combine curl noise with flow field
                let swirl = self.config.swirl_intensity;
                let combined_x = curl_x * (1.0 - swirl) + flow_x * swirl;
                let combined_y = curl_y * (1.0 - swirl) + flow_y * swirl;

                // Sample noise along flow direction
                let offset = 3.0;
                let density =
                    self.fractal_noise(nx + combined_x * offset, ny + combined_y * offset);

                // Add vorticity (rotation) visualization
                let vorticity = curl_x * curl_x + curl_y * curl_y;
                let vorticity_boost = vorticity * self.config.vorticity_strength;

                // Combine density with flow intensity
                ((density * 0.5 + 0.5) + vorticity_boost + flow_mag * self.config.diffusion)
                    .clamp(0.0, 1.0)
            })
            .collect()
    }
}

impl PostEffect for CosmicInk {
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

        // Generate ink pattern
        let ink_pattern = self.generate_ink_pattern(input, width, height);

        // Composite ink onto original image
        let (ink_r, ink_g, ink_b) = self.config.ink_color;
        let output: PixelBuffer = input
            .par_iter()
            .zip(ink_pattern.par_iter())
            .map(|(&(r, g, b, a), &ink)| {
                let strength = self.config.strength;

                // Screen blending mode (for dark ink)
                let ink_contribution = ink * strength;
                let final_r = r * (1.0 - ink_contribution) + ink_r * ink_contribution;
                let final_g = g * (1.0 - ink_contribution) + ink_g * ink_contribution;
                let final_b = b * (1.0 - ink_contribution) + ink_b * ink_contribution;

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
    fn test_cosmic_ink_disabled() {
        let config = CosmicInkConfig { strength: 0.0, ..CosmicInkConfig::default() };
        let effect = CosmicInk::new(config);
        assert!(!effect.is_enabled());
    }

    #[test]
    fn test_cosmic_ink_enabled() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);
        assert!(effect.is_enabled());
    }

    #[test]
    fn test_cosmic_ink_basic() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_cosmic_ink_handles_zero() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = effect.process(&buffer, 50, 50, &params);
        assert!(result.is_ok());
    }

    #[test]
    fn test_cosmic_ink_handles_hdr() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);
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
    fn test_noise_functions_deterministic() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);

        // Same coordinates should give same result
        let n1 = effect.smooth_noise(10.0, 20.0);
        let n2 = effect.smooth_noise(10.0, 20.0);
        assert_eq!(n1, n2);

        // Different coordinates should give different results
        let n3 = effect.smooth_noise(10.0, 21.0);
        assert_ne!(n1, n3);
    }

    #[test]
    fn test_fractal_noise_in_range() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);

        // Test multiple points - fbm_noise normalizes to [0, 1]
        for i in 0..100 {
            let x = i as f64 * 0.1;
            let y = i as f64 * 0.15;
            let noise = effect.fractal_noise(x, y);
            assert!((0.0..=1.0).contains(&noise), "Noise out of range: {}", noise);
        }
    }

    #[test]
    fn test_curl_noise_produces_vectors() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);

        let (cx, cy) = effect.curl_noise(5.0, 7.0);
        assert!(cx.is_finite());
        assert!(cy.is_finite());

        // Curl should produce non-zero vectors in most cases
        let mag = (cx * cx + cy * cy).sqrt();
        assert!(mag > 0.0);
    }

    #[test]
    fn test_output_values_finite() {
        let config = CosmicInkConfig::default();
        let effect = CosmicInk::new(config);

        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 0.8;
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
