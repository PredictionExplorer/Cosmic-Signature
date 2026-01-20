//! Anisotropic Flow Blur
//!
//! Directional blur aligned to local gradients, creating motion-like streaking
//! that enhances perceived flow in the trajectories.

use super::{PixelBuffer, PostEffect};
use crate::post_effects::utils;
use crate::render::constants;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for the anisotropic flow blur effect.
#[derive(Clone, Debug)]
pub struct FlowBlurConfig {
    /// Overall effect strength (0.0 = off)
    pub strength: f64,
    /// Base blur radius in pixels
    pub radius: f64,
    /// Samples along the blur direction
    pub sample_count: usize,
    /// Gradient-driven anisotropy scaling
    pub anisotropy: f64,
    /// Minimum edge threshold for blur activation
    pub edge_threshold: f64,
    /// Falloff exponent for sampling weights
    pub falloff: f64,
}

impl Default for FlowBlurConfig {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_FLOW_BLUR_STRENGTH,
            radius: constants::DEFAULT_FLOW_BLUR_RADIUS,
            sample_count: constants::DEFAULT_FLOW_BLUR_SAMPLES,
            anisotropy: constants::DEFAULT_FLOW_BLUR_ANISOTROPY,
            edge_threshold: constants::DEFAULT_FLOW_BLUR_EDGE_THRESHOLD,
            falloff: constants::DEFAULT_FLOW_BLUR_FALLOFF,
        }
    }
}

/// Anisotropic flow blur post effect.
pub struct FlowBlur {
    config: FlowBlurConfig,
}

impl FlowBlur {
    pub fn new(config: FlowBlurConfig) -> Self {
        Self { config }
    }
}

impl PostEffect for FlowBlur {
    fn name(&self) -> &str {
        "Flow Blur"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 || self.config.radius <= 0.0 || input.is_empty() {
            return Ok(input.clone());
        }

        let gradients = utils::calculate_gradients_uncached(input, width, height);
        let samples = self.config.sample_count.max(3);
        let denom = (samples - 1) as f64;
        let edge_threshold = self.config.edge_threshold.clamp(0.0, 1.0);

        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let base = input[idx];
                if base.3 <= 1e-10 {
                    return base;
                }

                let (gx, gy) = gradients[idx];
                let grad_mag = (gx * gx + gy * gy).sqrt();
                if grad_mag <= edge_threshold {
                    return base;
                }

                let dir_x = gx / grad_mag;
                let dir_y = gy / grad_mag;
                let blur_extent = (self.config.radius * (1.0 + self.config.anisotropy * grad_mag))
                    .max(0.0);

                let mut acc = (0.0, 0.0, 0.0, 0.0);
                let mut weight_sum = 0.0;

                for i in 0..samples {
                    let t = (i as f64 / denom) * 2.0 - 1.0;
                    let weight = (1.0 - t.abs()).powf(self.config.falloff).max(0.0);
                    let offset = t * blur_extent;
                    let x = (idx % width) as f64 + dir_x * offset;
                    let y = (idx / width) as f64 + dir_y * offset;
                    let sample = utils::sample_bilinear(input, width, height, x, y);
                    acc.0 += sample.0 * weight;
                    acc.1 += sample.1 * weight;
                    acc.2 += sample.2 * weight;
                    acc.3 += sample.3 * weight;
                    weight_sum += weight;
                }

                if weight_sum <= 1e-10 {
                    return base;
                }

                let blurred = (
                    acc.0 / weight_sum,
                    acc.1 / weight_sum,
                    acc.2 / weight_sum,
                    acc.3 / weight_sum,
                );

                let edge_weight = ((grad_mag - edge_threshold) / (1.0 - edge_threshold)).clamp(0.0, 1.0);
                let blend = (self.config.strength * edge_weight).clamp(0.0, 1.0);

                (
                    base.0 + (blurred.0 - base.0) * blend,
                    base.1 + (blurred.1 - base.1) * blend,
                    base.2 + (blurred.2 - base.2) * blend,
                    base.3 + (blurred.3 - base.3) * blend,
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
    fn test_flow_blur_default_config() {
        let config = FlowBlurConfig::default();
        assert!(config.radius > 0.0);
        assert!(config.sample_count >= 3);
    }

    #[test]
    fn test_flow_blur_zero_strength_passthrough() {
        let config = FlowBlurConfig { strength: 0.0, ..Default::default() };
        let effect = FlowBlur::new(config);
        let input = vec![(0.3, 0.3, 0.3, 1.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_flow_blur_spreads_signal() {
        let config = FlowBlurConfig {
            strength: 1.0,
            radius: 3.0,
            edge_threshold: 0.0,
            ..Default::default()
        };
        let effect = FlowBlur::new(config);
        let input = vec![
            (0.0, 0.0, 0.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
        ];
        let output = effect.process(&input, 3, 1).unwrap();
        assert!(
            output[1].0 < 1.0,
            "Flow blur should soften the high-contrast edge"
        );
    }
}
