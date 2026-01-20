//! Gravitational Lensing Warp
//!
//! Warps the image using a blurred luminance-derived "mass field" to mimic
//! subtle spacetime curvature around bright structures.

use super::{PixelBuffer, PostEffect};
use crate::post_effects::utils;
use crate::render::{constants, parallel_blur_2d_rgba};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for gravitational lensing warp.
#[derive(Clone, Debug)]
pub struct GravitationalLensingConfig {
    /// Overall warp strength (0.0 = off)
    pub strength: f64,
    /// Blur radius for the mass field (pixels)
    pub blur_radius: usize,
    /// Exponent applied to luminance when building the mass field
    pub mass_exponent: f64,
    /// Maximum displacement in pixels
    pub max_displacement: f64,
    /// Edge fade-out region (fraction of min dimension)
    pub edge_fade: f64,
}

impl Default for GravitationalLensingConfig {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_LENSING_STRENGTH,
            blur_radius: constants::DEFAULT_LENSING_BLUR_RADIUS,
            mass_exponent: constants::DEFAULT_LENSING_MASS_EXPONENT,
            max_displacement: constants::DEFAULT_LENSING_MAX_DISPLACEMENT,
            edge_fade: constants::DEFAULT_LENSING_EDGE_FADE,
        }
    }
}

/// Gravitational lensing post effect.
pub struct GravitationalLensing {
    config: GravitationalLensingConfig,
}

impl GravitationalLensing {
    pub fn new(config: GravitationalLensingConfig) -> Self {
        Self { config }
    }

    #[inline]
    fn edge_fade_factor(x: usize, y: usize, width: usize, height: usize, edge_fade: f64) -> f64 {
        if edge_fade <= 0.0 {
            return 1.0;
        }
        let min_dim = width.min(height) as f64;
        let fade_radius = (edge_fade * min_dim).max(1.0);
        let edge_dist = (x.min(width - 1 - x)).min(y.min(height - 1 - y)) as f64;
        (edge_dist / fade_radius).clamp(0.0, 1.0)
    }
}

impl PostEffect for GravitationalLensing {
    fn name(&self) -> &str {
        "Gravitational Lensing"
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

        // Build luminance-derived mass field.
        let mut mass_field = vec![(0.0, 0.0, 0.0, 1.0); input.len()];
        mass_field
            .par_iter_mut()
            .zip(input.par_iter())
            .for_each(|(mass, &(r, g, b, a))| {
                if a <= 1e-10 {
                    return;
                }
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;
                let lum = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb).max(0.0);
                let density = lum.powf(self.config.mass_exponent);
                *mass = (density, density, density, 1.0);
            });

        if self.config.blur_radius > 0 {
            parallel_blur_2d_rgba(&mut mass_field, width, height, self.config.blur_radius);
        }

        let gradients = utils::calculate_gradients_uncached(&mass_field, width, height);
        let displacement_scale = self.config.strength * self.config.max_displacement;

        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                let (gx, gy) = gradients[idx];

                if gx.abs() < 1e-8 && gy.abs() < 1e-8 {
                    return input[idx];
                }

                let mut dx = gx * displacement_scale;
                let mut dy = gy * displacement_scale;
                let fade = Self::edge_fade_factor(x, y, width, height, self.config.edge_fade);
                dx *= fade;
                dy *= fade;

                utils::sample_bilinear(input, width, height, x as f64 + dx, y as f64 + dy)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lensing_default_config() {
        let config = GravitationalLensingConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.max_displacement > 0.0);
    }

    #[test]
    fn test_lensing_zero_strength_passthrough() {
        let config = GravitationalLensingConfig { strength: 0.0, ..Default::default() };
        let effect = GravitationalLensing::new(config);
        let input = vec![(0.2, 0.3, 0.4, 1.0); 9];
        let output = effect.process(&input, 3, 3).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_lensing_uniform_image_no_change() {
        let config = GravitationalLensingConfig { strength: 0.8, ..Default::default() };
        let effect = GravitationalLensing::new(config);
        let input = vec![(0.5, 0.5, 0.5, 1.0); 9];
        let output = effect.process(&input, 3, 3).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_lensing_changes_non_uniform() {
        let config = GravitationalLensingConfig {
            strength: 1.0,
            blur_radius: 0,
            max_displacement: 1.0,
            edge_fade: 0.0,
            ..Default::default()
        };
        let effect = GravitationalLensing::new(config);
        let mut input = vec![(0.0, 0.0, 0.0, 1.0); 9];
        input[4] = (1.0, 1.0, 1.0, 1.0);
        let output = effect.process(&input, 3, 3).unwrap();
        assert!(
            output.iter().zip(input.iter()).any(|(o, i)| (o.0 - i.0).abs() > 1e-6),
            "Lensing should modify at least one pixel"
        );
    }
}
