//! Auto-exposure post-processing effect.

use super::{FrameParams, PixelBuffer, PostEffect};
use crate::render::ExposureCalculator;
use rayon::prelude::*;
use std::error::Error;

/// Automatic exposure adjustment effect.
///
/// Analyzes the image luminance distribution and applies exposure
/// compensation to achieve optimal brightness.
/// 
/// [DEPRECATED] Use global histogram authority instead.
#[allow(dead_code)]
pub struct AutoExposure {
    /// The exposure calculator configuration.
    pub calculator: ExposureCalculator,

    /// Whether this effect is enabled.
    pub enabled: bool,
}

#[allow(dead_code)]
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
        _params: &FrameParams,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_buffer(w: usize, h: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); w * h]
    }

    #[test]
    fn test_auto_exposure_basic() {
        let exposure = AutoExposure::new();
        let buffer = test_buffer(100, 100, 0.5);
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };

        let result = exposure.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_auto_exposure_handles_zero() {
        let exposure = AutoExposure::new();
        let buffer = test_buffer(50, 50, 0.0);
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };

        let result = exposure.process(&buffer, 50, 50, &params);
        assert!(result.is_ok());
    }

    #[test]
    fn test_auto_exposure_handles_hdr() {
        let exposure = AutoExposure::new();
        let buffer = test_buffer(50, 50, 5.0);
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };

        let result = exposure.process(&buffer, 50, 50, &params);
        assert!(result.is_ok());
    }
}
