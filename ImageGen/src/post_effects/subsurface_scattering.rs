//! Subsurface Scattering Post-Effect
//!
//! Makes trails appear to have translucent volume where light scatters internally,
//! like light through a jellyfish, jade, or wax. Creates depth and material presence.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for subsurface scattering effect
#[derive(Clone, Debug)]
pub struct SubsurfaceScatteringConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Scatter radius as fraction of image dimension
    pub scatter_radius_scale: f64,
    /// Color shift toward warm tones in scattered light
    pub warmth: f64,
    /// How much light penetrates (transmission)
    pub transmission: f64,
    /// Falloff exponent for scatter distance
    pub falloff: f64,
    /// Saturation boost for scattered light
    pub scatter_saturation: f64,
}

impl Default for SubsurfaceScatteringConfig {
    fn default() -> Self {
        Self {
            strength: 0.45,
            scatter_radius_scale: 0.025,
            warmth: 0.3,
            transmission: 0.6,
            falloff: 2.0,
            scatter_saturation: 1.2,
        }
    }
}

/// Subsurface scattering effect for volumetric appearance
pub struct SubsurfaceScattering {
    config: SubsurfaceScatteringConfig,
}

impl SubsurfaceScattering {
    pub fn new(config: SubsurfaceScatteringConfig) -> Self {
        Self { config }
    }

    /// Apply warm color shift to simulate subsurface light transport
    #[inline]
    fn apply_warmth(r: f64, g: f64, b: f64, warmth: f64) -> (f64, f64, f64) {
        // Shift toward red/orange as light travels through material
        (
            r * (1.0 + warmth * 0.4),
            g * (1.0 + warmth * 0.1),
            b * (1.0 - warmth * 0.3),
        )
    }

    /// Apply saturation adjustment
    #[inline]
    fn adjust_saturation(r: f64, g: f64, b: f64, factor: f64) -> (f64, f64, f64) {
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        (
            lum + (r - lum) * factor,
            lum + (g - lum) * factor,
            lum + (b - lum) * factor,
        )
    }
}

impl PostEffect for SubsurfaceScattering {
    fn name(&self) -> &str {
        "Subsurface Scattering"
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

        let min_dim = width.min(height) as f64;
        let scatter_radius = (self.config.scatter_radius_scale * min_dim).round() as usize;
        let scatter_radius = scatter_radius.max(1);

        // Create scattered light buffer using separable blur
        let mut scattered = input.clone();

        // Simple box blur for scatter approximation (separable, 2 passes)
        // Horizontal pass
        let mut temp = vec![(0.0, 0.0, 0.0, 0.0); input.len()];
        #[allow(clippy::needless_range_loop)]
        temp.par_chunks_mut(width).enumerate().for_each(|(y, row)| {
            for x in 0..width {
                let mut sum = (0.0, 0.0, 0.0, 0.0);
                let mut weight_sum = 0.0;

                for dx in 0..=(scatter_radius * 2) {
                    let src_x = (x as i32 + dx as i32 - scatter_radius as i32)
                        .clamp(0, width as i32 - 1) as usize;
                    let dist = (dx as f64 - scatter_radius as f64).abs() / scatter_radius as f64;
                    let weight = (1.0 - dist).powf(self.config.falloff).max(0.0);

                    let pixel = input[y * width + src_x];
                    sum.0 += pixel.0 * weight;
                    sum.1 += pixel.1 * weight;
                    sum.2 += pixel.2 * weight;
                    sum.3 += pixel.3 * weight;
                    weight_sum += weight;
                }

                if weight_sum > 0.0 {
                    row[x] = (
                        sum.0 / weight_sum,
                        sum.1 / weight_sum,
                        sum.2 / weight_sum,
                        sum.3 / weight_sum,
                    );
                }
            }
        });

        // Vertical pass
        #[allow(clippy::needless_range_loop)]
        scattered.par_chunks_mut(width).enumerate().for_each(|(y, row)| {
            for x in 0..width {
                let mut sum = (0.0, 0.0, 0.0, 0.0);
                let mut weight_sum = 0.0;

                for dy in 0..=(scatter_radius * 2) {
                    let src_y = (y as i32 + dy as i32 - scatter_radius as i32)
                        .clamp(0, height as i32 - 1) as usize;
                    let dist = (dy as f64 - scatter_radius as f64).abs() / scatter_radius as f64;
                    let weight = (1.0 - dist).powf(self.config.falloff).max(0.0);

                    let pixel = temp[src_y * width + x];
                    sum.0 += pixel.0 * weight;
                    sum.1 += pixel.1 * weight;
                    sum.2 += pixel.2 * weight;
                    sum.3 += pixel.3 * weight;
                    weight_sum += weight;
                }

                if weight_sum > 0.0 {
                    row[x] = (
                        sum.0 / weight_sum,
                        sum.1 / weight_sum,
                        sum.2 / weight_sum,
                        sum.3 / weight_sum,
                    );
                }
            }
        });

        // Combine original with scattered light
        let output: PixelBuffer = input
            .par_iter()
            .zip(scattered.par_iter())
            .map(|(&(r, g, b, a), &(sr, sg, sb, sa))| {
                if a <= 0.0 && sa <= 0.0 {
                    return (0.0, 0.0, 0.0, 0.0);
                }

                // Un-premultiply original
                let (orig_r, orig_g, orig_b) = if a > 0.0 { (r / a, g / a, b / a) } else { (0.0, 0.0, 0.0) };

                // Un-premultiply scattered
                let (scat_r, scat_g, scat_b) =
                    if sa > 0.0 { (sr / sa, sg / sa, sb / sa) } else { (0.0, 0.0, 0.0) };

                // Apply warmth to scattered light
                let (warm_r, warm_g, warm_b) =
                    Self::apply_warmth(scat_r, scat_g, scat_b, self.config.warmth);

                // Apply saturation to scattered light
                let (sat_r, sat_g, sat_b) =
                    Self::adjust_saturation(warm_r, warm_g, warm_b, self.config.scatter_saturation);

                // Blend based on transmission and strength
                let blend = self.config.strength * self.config.transmission;
                let final_r = orig_r + (sat_r - orig_r) * blend;
                let final_g = orig_g + (sat_g - orig_g) * blend;
                let final_b = orig_b + (sat_b - orig_b) * blend;

                // Use max alpha for volumetric effect
                let final_a = a.max(sa * self.config.strength * 0.5);

                // Re-premultiply
                (
                    final_r.max(0.0) * final_a,
                    final_g.max(0.0) * final_a,
                    final_b.max(0.0) * final_a,
                    final_a,
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
    fn test_subsurface_default_config() {
        let config = SubsurfaceScatteringConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.scatter_radius_scale > 0.0);
    }

    #[test]
    fn test_warmth_shift() {
        let (r, _g, b) = SubsurfaceScattering::apply_warmth(0.5, 0.5, 0.5, 0.5);
        assert!(r > 0.5, "Red should increase with warmth");
        assert!(b < 0.5, "Blue should decrease with warmth");
    }

    #[test]
    fn test_saturation_adjustment() {
        let (r, g, b) = SubsurfaceScattering::adjust_saturation(0.8, 0.4, 0.2, 1.5);
        // More saturated: channels should spread further from luminance
        let lum: f64 = 0.2126 * 0.8 + 0.7152 * 0.4 + 0.0722 * 0.2;
        let orig_spread = (0.8_f64 - lum).abs() + (0.4_f64 - lum).abs() + (0.2_f64 - lum).abs();
        let new_spread = (r - lum).abs() + (g - lum).abs() + (b - lum).abs();
        assert!(new_spread > orig_spread);
    }

    #[test]
    fn test_subsurface_preserves_transparent() {
        let effect = SubsurfaceScattering::new(SubsurfaceScatteringConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        assert_eq!(output[0].3, 0.0);
    }

    #[test]
    fn test_subsurface_zero_strength() {
        let config = SubsurfaceScatteringConfig { strength: 0.0, ..Default::default() };
        let effect = SubsurfaceScattering::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }
}
