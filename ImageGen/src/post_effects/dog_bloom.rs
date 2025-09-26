//! Difference of Gaussians (DoG) bloom effect implementation.

use super::{PixelBuffer, PostEffect};
use crate::render::{DogBloomConfig, apply_dog_bloom};
use rayon::prelude::*;
use std::error::Error;

/// Difference of Gaussians bloom post-processing effect.
///
/// Creates sharper, more defined bloom by subtracting two Gaussian blurs
/// of different radii, emphasizing edges and reducing overall haziness.
pub struct DogBloom {
    /// Configuration for the DoG algorithm.
    pub config: DogBloomConfig,

    /// Brightness multiplier for the core (unblurred) image.
    pub core_brightness: f64,

    /// Whether this effect is enabled.
    pub enabled: bool,
}

impl DogBloom {
    /// Creates a new DoG bloom effect with the given configuration.
    pub fn new(config: DogBloomConfig, core_brightness: f64) -> Self {
        Self { config, core_brightness, enabled: true }
    }
}

impl PostEffect for DogBloom {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        // Apply DoG bloom to get the bloom component
        let dog_bloom = apply_dog_bloom(input, width, height, &self.config);

        // Composite: base * core_brightness + dog bloom (additive)
        let mut output = Vec::with_capacity(input.len());
        output.par_extend(input.par_iter().zip(dog_bloom.par_iter()).map(
            |(&(base_r, base_g, base_b, base_a), &(dog_r, dog_g, dog_b, _dog_a))| {
                // Apply core brightness to base
                let out_r = (base_r * self.core_brightness + dog_r).min(f64::MAX);
                let out_g = (base_g * self.core_brightness + dog_g).min(f64::MAX);
                let out_b = (base_b * self.core_brightness + dog_b).min(f64::MAX);
                let out_a = base_a * self.core_brightness;

                (out_r, out_g, out_b, out_a)
            },
        ));

        Ok(output)
    }
}
