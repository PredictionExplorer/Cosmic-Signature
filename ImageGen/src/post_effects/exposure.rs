//! Auto-exposure post-processing effect.

use super::{PixelBuffer, PostEffect};
use crate::render::ExposureCalculator;
use rayon::prelude::*;
use std::error::Error;

/// Automatic exposure adjustment effect.
///
/// Analyzes the image luminance distribution and applies exposure
/// compensation to achieve optimal brightness.
pub struct AutoExposure {
    /// The exposure calculator configuration.
    pub calculator: ExposureCalculator,

    /// Whether this effect is enabled.
    pub enabled: bool,
}

impl AutoExposure {
    /// Creates a new auto-exposure effect with default settings.
    pub fn new() -> Self {
        Self { calculator: ExposureCalculator::default(), enabled: true }
    }
}

impl Default for AutoExposure {
    fn default() -> Self {
        Self::new()
    }
}

impl PostEffect for AutoExposure {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        _width: usize,
        _height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        // Calculate the exposure multiplier
        let exposure = self.calculator.calculate_exposure(input);

        // Apply exposure to all pixels
        let mut output = Vec::with_capacity(input.len());
        output.par_extend(input.par_iter().map(|&(r, g, b, a)| {
            (
                r * exposure,
                g * exposure,
                b * exposure,
                a, // Alpha unchanged
            )
        }));

        Ok(output)
    }
}
