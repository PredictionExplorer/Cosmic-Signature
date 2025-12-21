//! Deep Space post-effect with volumetric scattering
//!
//! Simulates light scattering through a medium (nebula gas) as bodies move through it.
//! Uses multi-octave OpenSimplex2S noise for the gas density field and calculates
//! illumination from body positions.

use super::{FrameParams, PixelBuffer, PostEffect};
use opensimplex2::smooth;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for Deep Space scattering effect
#[derive(Clone, Debug)]
pub struct DeepSpaceConfig {
    /// Overall strength of the effect (0.0-1.0)
    pub strength: f64,
    /// Density of the nebula gas (0.0-1.0)
    pub gas_density: f64,
    /// Scattering coefficient (how much light is scattered)
    pub scattering_coeff: f64,
    /// Absorption coefficient (how much light is blocked)
    pub absorption_coeff: f64,
    /// Color of the nebula gas
    pub gas_color: [f64; 3],
    /// Noise seed for the gas density field
    pub noise_seed: i64,
    /// Base frequency for noise (larger features)
    pub base_frequency: f64,
    /// Number of octaves for noise
    pub octaves: usize,
    /// Scale factor for illumination from bodies
    pub illumination_scale: f64,
    /// Radius of illumination from each body
    pub illumination_radius: f64,
}

impl Default for DeepSpaceConfig {
    fn default() -> Self {
        Self {
            strength: 0.25,
            gas_density: 0.6,
            scattering_coeff: 0.8,
            absorption_coeff: 0.1,
            gas_color: [0.05, 0.1, 0.2], // Deep space blue
            noise_seed: 0,
            base_frequency: 0.002,
            octaves: 4,
            illumination_scale: 1.5,
            illumination_radius: 150.0,
        }
    }
}

/// Deep Space scattering effect
pub struct DeepSpace {
    config: DeepSpaceConfig,
    body_positions: Vec<(f64, f64)>, // Screen-space positions
    time: f64,
}

impl DeepSpace {
    /// Create new Deep Space effect
    pub fn new(config: DeepSpaceConfig, body_positions: Vec<(f64, f64)>, time: f64) -> Self {
        Self { config, body_positions, time }
    }

    /// Evaluate multi-octave noise at given position
    #[inline]
    fn evaluate_density(&self, x: f64, y: f64) -> f64 {
        let mut total = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = self.config.base_frequency;
        let mut max_amplitude = 0.0;

        for _ in 0..self.config.octaves {
            let noise_val = smooth::noise3_ImproveXY(
                self.config.noise_seed,
                x * frequency,
                y * frequency,
                self.time,
            );
            total += (noise_val as f64) * amplitude;
            max_amplitude += amplitude;

            amplitude *= 0.5;
            frequency *= 2.0;
        }

        let normalized = (total / max_amplitude + 1.0) * 0.5;
        normalized * self.config.gas_density
    }

    /// Calculate illumination at a pixel from bodies
    #[inline]
    fn calculate_illumination(&self, x: f64, y: f64, density: f64) -> f64 {
        let mut total_light = 0.0;

        for &(bx, by) in &self.body_positions {
            let dx = x - bx;
            let dy = y - by;
            let dist_sq = dx * dx + dy * dy;
            let dist = dist_sq.sqrt();

            if dist < self.config.illumination_radius {
                // Radial falloff + density interaction
                let falloff = (1.0 - dist / self.config.illumination_radius).powi(2);
                total_light += falloff * density * self.config.illumination_scale;
            }
        }

        total_light
    }
}

impl PostEffect for DeepSpace {
    fn process(
        &self,
        buffer: &PixelBuffer,
        width: usize,
        _height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 {
            return Ok(buffer.to_vec());
        }

        let mut result = buffer.clone();

        result.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
            let x = (idx % width) as f64;
            let y = (idx / width) as f64;

            // 1. Get gas density at this point
            let density = self.evaluate_density(x, y);

            // 2. Calculate scattering from bodies
            let illumination = self.calculate_illumination(x, y, density);

            // 3. Apply scattering and absorption
            let scatter_r = self.config.gas_color[0] * illumination * self.config.scattering_coeff;
            let scatter_g = self.config.gas_color[1] * illumination * self.config.scattering_coeff;
            let scatter_b = self.config.gas_color[2] * illumination * self.config.scattering_coeff;

            // 4. Blend into pixel
            let strength = self.config.strength;
            
            // Additive scattering
            pixel.0 += scatter_r * strength;
            pixel.1 += scatter_g * strength;
            pixel.2 += scatter_b * strength;

            // Density-based absorption (darken the background slightly where gas is thick)
            let absorption = (1.0 - density * self.config.absorption_coeff * strength).max(0.0);
            pixel.0 *= absorption;
            pixel.1 *= absorption;
            pixel.2 *= absorption;
        });

        Ok(result)
    }

    fn is_enabled(&self) -> bool {
        self.config.strength > 0.0
    }
}

