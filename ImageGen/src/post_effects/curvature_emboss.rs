//! Curvature Emboss
//!
//! Enhances local curvature with a subtle embossed relief, giving trajectories
//! a sculpted, gallery-quality depth.

use super::{PixelBuffer, PostEffect};
use crate::render::constants;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for curvature emboss effect.
#[derive(Clone, Debug)]
pub struct CurvatureEmbossConfig {
    /// Overall effect strength (0.0 = off)
    pub strength: f64,
    /// Light direction in radians (screen space)
    pub light_direction: f64,
    /// Curvature amplification factor
    pub curvature_boost: f64,
    /// Emboss contrast multiplier
    pub emboss_contrast: f64,
    /// Minimum luminance to engage embossing
    pub min_luminance: f64,
}

impl Default for CurvatureEmbossConfig {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_EMBOSS_STRENGTH,
            light_direction: constants::DEFAULT_EMBOSS_LIGHT_DIRECTION,
            curvature_boost: constants::DEFAULT_EMBOSS_CURVATURE_BOOST,
            emboss_contrast: constants::DEFAULT_EMBOSS_CONTRAST,
            min_luminance: constants::DEFAULT_EMBOSS_MIN_LUMINANCE,
        }
    }
}

/// Curvature emboss post effect.
pub struct CurvatureEmboss {
    config: CurvatureEmbossConfig,
}

impl CurvatureEmboss {
    pub fn new(config: CurvatureEmbossConfig) -> Self {
        Self { config }
    }
}

impl PostEffect for CurvatureEmboss {
    fn name(&self) -> &str {
        "Curvature Emboss"
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

        let mut luminance = vec![0.0f64; input.len()];
        luminance.par_iter_mut().enumerate().for_each(|(idx, lum)| {
            let (r, g, b, a) = input[idx];
            *lum = if a > 0.0 { (0.2126 * r + 0.7152 * g + 0.0722 * b) / a } else { 0.0 };
        });

        let light_dir = (self.config.light_direction.cos(), self.config.light_direction.sin());
        let min_luma = self.config.min_luminance.max(0.0);

        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let (r, g, b, a) = input[idx];
                if a <= 1e-10 {
                    return (r, g, b, a);
                }

                let x = (idx % width) as isize;
                let y = (idx / width) as isize;
                let sample = |sx: isize, sy: isize| -> f64 {
                    let sx = sx.clamp(0, width as isize - 1);
                    let sy = sy.clamp(0, height as isize - 1);
                    luminance[sy as usize * width + sx as usize]
                };

                let lum = luminance[idx];
                if lum < min_luma {
                    return (r, g, b, a);
                }

                let gx = sample(x + 1, y) - sample(x - 1, y);
                let gy = sample(x, y + 1) - sample(x, y - 1);
                let laplacian = sample(x - 1, y)
                    + sample(x + 1, y)
                    + sample(x, y - 1)
                    + sample(x, y + 1)
                    - 4.0 * lum;

                let edge = gx * light_dir.0 + gy * light_dir.1;
                let curvature = laplacian.abs() * self.config.curvature_boost;
                let shade = edge * self.config.emboss_contrast * (1.0 + curvature);
                let target_lum = (lum + shade * self.config.strength).clamp(0.0, 1.5);
                let scale = if lum > 1e-6 { (target_lum / lum).clamp(0.0, 3.0) } else { 1.0 };

                let sr = r / a;
                let sg = g / a;
                let sb = b / a;
                (
                    (sr * scale).max(0.0) * a,
                    (sg * scale).max(0.0) * a,
                    (sb * scale).max(0.0) * a,
                    a,
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
    fn test_emboss_default_config() {
        let config = CurvatureEmbossConfig::default();
        assert!(config.strength > 0.0);
    }

    #[test]
    fn test_emboss_zero_strength_passthrough() {
        let config = CurvatureEmbossConfig { strength: 0.0, ..Default::default() };
        let effect = CurvatureEmboss::new(config);
        let input = vec![(0.4, 0.4, 0.4, 1.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_emboss_alters_edge() {
        let config = CurvatureEmbossConfig { strength: 1.0, ..Default::default() };
        let effect = CurvatureEmboss::new(config);
        let input = vec![
            (0.2, 0.2, 0.2, 1.0),
            (0.8, 0.8, 0.8, 1.0),
            (0.8, 0.8, 0.8, 1.0),
            (0.2, 0.2, 0.2, 1.0),
        ];
        let output = effect.process(&input, 2, 2).unwrap();
        assert!(
            (output[0].0 - input[0].0).abs() > 1e-6
                || (output[1].0 - input[1].0).abs() > 1e-6,
            "Emboss should modify contrast at edges"
        );
    }
}
