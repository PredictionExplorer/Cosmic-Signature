//! Chromatic Dispersion Halos
//!
//! Splits color channels along local gradients to create subtle optical
//! dispersion around high-contrast structures.

use super::{PixelBuffer, PostEffect};
use crate::post_effects::utils;
use crate::render::constants;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for chromatic dispersion effect.
#[derive(Clone, Debug)]
pub struct ChromaticDispersionConfig {
    /// Overall effect strength (0.0 = off)
    pub strength: f64,
    /// Base dispersion shift in pixels
    pub dispersion_px: f64,
    /// Minimum edge strength before dispersion appears
    pub edge_threshold: f64,
    /// Edge weighting exponent
    pub edge_exponent: f64,
    /// Luminance exponent driving dispersion intensity
    pub luma_power: f64,
}

impl Default for ChromaticDispersionConfig {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_CHROMATIC_DISPERSION_STRENGTH,
            dispersion_px: constants::DEFAULT_CHROMATIC_DISPERSION_PIXELS,
            edge_threshold: constants::DEFAULT_CHROMATIC_DISPERSION_EDGE_THRESHOLD,
            edge_exponent: constants::DEFAULT_CHROMATIC_DISPERSION_EDGE_EXPONENT,
            luma_power: constants::DEFAULT_CHROMATIC_DISPERSION_LUMA_POWER,
        }
    }
}

/// Chromatic dispersion post effect.
pub struct ChromaticDispersion {
    config: ChromaticDispersionConfig,
}

impl ChromaticDispersion {
    pub fn new(config: ChromaticDispersionConfig) -> Self {
        Self { config }
    }
}

impl PostEffect for ChromaticDispersion {
    fn name(&self) -> &str {
        "Chromatic Dispersion"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 || input.is_empty() {
            return Ok(input.clone());
        }

        let gradients = utils::calculate_gradients_uncached(input, width, height);
        let edge_threshold = self.config.edge_threshold.clamp(0.0, 1.0);

        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let (r, g, b, a) = input[idx];
                if a <= 1e-10 {
                    return (r, g, b, a);
                }

                let sr = r / a;
                let sg = g / a;
                let sb = b / a;
                let lum = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb).clamp(0.0, 1.0);

                let (gx, gy) = gradients[idx];
                let grad_mag = (gx * gx + gy * gy).sqrt();
                if grad_mag <= edge_threshold {
                    return (r, g, b, a);
                }

                let edge_weight = ((grad_mag - edge_threshold) / (1.0 - edge_threshold))
                    .clamp(0.0, 1.0)
                    .powf(self.config.edge_exponent);
                let luma_weight = lum.powf(self.config.luma_power);
                let shift = self.config.dispersion_px * edge_weight * (0.4 + 0.6 * luma_weight);

                let dir_x = gx / grad_mag;
                let dir_y = gy / grad_mag;
                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                let sample_r =
                    utils::sample_bilinear(input, width, height, x + dir_x * shift, y + dir_y * shift);
                let sample_b =
                    utils::sample_bilinear(input, width, height, x - dir_x * shift, y - dir_y * shift);

                let r_src = if sample_r.3 > 1e-10 { sample_r.0 / sample_r.3 } else { sr };
                let b_src = if sample_b.3 > 1e-10 { sample_b.2 / sample_b.3 } else { sb };
                let blend = (self.config.strength * edge_weight).clamp(0.0, 1.0);

                let out_r = sr + (r_src - sr) * blend;
                let out_g = sg;
                let out_b = sb + (b_src - sb) * blend;

                (out_r.max(0.0) * a, out_g.max(0.0) * a, out_b.max(0.0) * a, a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dispersion_default_config() {
        let config = ChromaticDispersionConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.dispersion_px > 0.0);
    }

    #[test]
    fn test_dispersion_zero_strength_passthrough() {
        let config = ChromaticDispersionConfig { strength: 0.0, ..Default::default() };
        let effect = ChromaticDispersion::new(config);
        let input = vec![(0.2, 0.3, 0.4, 1.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_dispersion_preserves_transparency() {
        let effect = ChromaticDispersion::new(ChromaticDispersionConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 9];
        let output = effect.process(&input, 3, 3).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_dispersion_alters_edge_color() {
        let config = ChromaticDispersionConfig {
            strength: 1.0,
            dispersion_px: 2.0,
            edge_threshold: 0.0,
            ..Default::default()
        };
        let effect = ChromaticDispersion::new(config);
        let input = vec![
            (0.0, 0.0, 0.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
        ];
        let output = effect.process(&input, 3, 1).unwrap();
        assert!(
            (output[1].0 - output[1].2).abs() > 1e-6,
            "Dispersion should split channels on a strong edge"
        );
    }
}
