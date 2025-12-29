//! Post-processing effects pipeline for the Three Body Problem renderer.
//!
//! This module provides a trait-based system for applying visual effects
//! in a composable, modular fashion.

// Allow common graphics code patterns
#![allow(clippy::many_single_char_names)] // RGB/RGBA notation is standard
#![allow(clippy::cast_precision_loss)] // Acceptable in graphics operations
#![allow(clippy::cast_possible_truncation)] // Checked where necessary
#![allow(clippy::cast_sign_loss)] // Acceptable in graphics code

use std::error::Error;
#[cfg(test)]
use std::fmt;

// Re-export PixelBuffer from central types module for consistency
pub use crate::render::types::PixelBuffer;

/// Per-frame parameters that may vary
#[derive(Clone, Debug)]
pub struct FrameParams {
    pub frame_number: usize,
    pub _density: Option<f64>,
    pub body_positions: Option<Vec<(f64, f64)>>, // Screen-space positions
}

/// Error type for post-processing pipeline failures.
#[derive(Debug)]
#[cfg(test)]
pub struct PostEffectError {
    effect_name: String,
    message: String,
}

#[cfg(test)]
impl fmt::Display for PostEffectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PostEffect '{}' error: {}", self.effect_name, self.message)
    }
}

#[cfg(test)]
impl Error for PostEffectError {}

/// Trait for implementing post-processing effects.
///
/// Each effect transforms an input buffer and returns a new buffer.
/// Effects should be stateless and safe to call multiple times.
pub trait PostEffect: Send + Sync {
    /// Process the input buffer and return the result.
    ///
    /// # Arguments
    /// * `input` - Input pixel buffer
    /// * `width` - Buffer width in pixels
    /// * `height` - Buffer height in pixels
    /// * `params` - Per-frame parameters
    ///
    /// # Returns
    /// Processed pixel buffer or error
    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
        params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>>;

    /// Returns whether this effect is currently enabled.
    /// Default implementation returns true.
    fn is_enabled(&self) -> bool {
        true
    }
}

/// A chain of post-processing effects applied in sequence.
///
/// # Performance Note
///
/// The chain uses double-buffering internally to minimize allocations during processing.
/// Each effect reads from one buffer and writes to another, then buffers are swapped.
/// This reduces GC pressure significantly compared to per-effect allocation.
pub struct PostEffectChain {
    effects: Vec<Box<dyn PostEffect>>,
}

impl PostEffectChain {
    /// Creates a new, empty effect chain.
    pub fn new() -> Self {
        Self { effects: Vec::new() }
    }

    /// Adds an effect to the end of the chain.
    pub fn add(&mut self, effect: Box<dyn PostEffect>) {
        self.effects.push(effect);
    }

    /// Processes a buffer through all enabled effects in order.
    ///
    /// # Performance Optimization
    ///
    /// This method counts the number of enabled effects upfront. If there are multiple
    /// effects, it uses double-buffering to avoid repeated allocations. For 0-1 effects,
    /// it uses the simpler code path.
    ///
    /// # Arguments
    /// * `buffer` - Input pixel buffer
    /// * `width` - Buffer width in pixels
    /// * `height` - Buffer height in pixels
    /// * `params` - Per-frame parameters
    ///
    /// # Returns
    /// Final processed buffer or first error encountered
    pub fn process(
        &self,
        mut buffer: PixelBuffer,
        width: usize,
        height: usize,
        params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        // Count enabled effects to choose optimal strategy
        let enabled_count = self.effects.iter().filter(|e| e.is_enabled()).count();

        if enabled_count == 0 {
            // No effects - return input unchanged
            return Ok(buffer);
        }

        if enabled_count == 1 {
            // Single effect - simple path
            for effect in &self.effects {
                if effect.is_enabled() {
                    return effect.process(&buffer, width, height, params);
                }
            }
            return Ok(buffer);
        }

        // Multiple effects - use double-buffering to minimize allocations
        // Pre-allocate a working buffer to ping-pong between
        let pixel_count = width * height;
        let mut working_buffer = vec![(0.0, 0.0, 0.0, 0.0); pixel_count];
        let mut use_working = false;

        for effect in &self.effects {
            if effect.is_enabled() {
                if use_working {
                    // Process: working → buffer
                    buffer = effect.process(&working_buffer, width, height, params)?;
                    use_working = false;
                } else {
                    // Process: buffer → working
                    working_buffer = effect.process(&buffer, width, height, params)?;
                    use_working = true;
                }
            }
        }

        // Return whichever buffer has the final result
        if use_working { Ok(working_buffer) } else { Ok(buffer) }
    }

    /// Returns the number of effects in the chain.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.effects.len()
    }

    /// Returns true if the chain has no effects.
    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }
}

impl Default for PostEffectChain {
    fn default() -> Self {
        Self::new()
    }
}

// Re-export effect implementations
pub mod aether;
pub mod atmospheric_depth;
pub mod aurora_veils;
pub mod champleve;
pub mod cherenkov;
pub mod chromatic_bloom;
pub mod color_grade;
pub mod cosmic_ink;
pub mod crepuscular_rays;
pub mod deep_space;
pub mod dimensional_glitch;
pub mod dodge_burn;
pub mod dog_bloom;
pub mod edge_luminance;
pub mod event_horizon;
pub mod exposure;
pub mod fine_texture;
pub mod gaussian_bloom;
pub mod glow_enhancement;
pub mod gradient_map;
pub mod halation;
pub mod micro_contrast;
pub mod nebula_clouds;
pub mod opalescence;
pub mod perceptual_blur;
pub mod prismatic_halos;
pub mod refractive_caustics;
pub mod temporal_smoothing;
pub mod utils;
pub mod volumetric_occlusion;

// Export all public types
pub use aether::{AetherConfig, apply_aether_weave};
pub use atmospheric_depth::AtmosphericDepthConfig;
pub use aurora_veils::AuroraVeilsConfig;
pub use champleve::{ChampleveConfig, apply_champleve_iridescence};
pub use cherenkov::{Cherenkov, CherenkovConfig};
pub use chromatic_bloom::{ChromaticBloom, ChromaticBloomConfig};
pub use color_grade::{CinematicColorGrade, ColorGradeParams};
pub use cosmic_ink::CosmicInkConfig;
pub use crepuscular_rays::{CrepuscularRays, CrepuscularRaysConfig};
pub use deep_space::{DeepSpace, DeepSpaceConfig};
pub use dimensional_glitch::{DimensionalGlitch, DimensionalGlitchConfig};
pub use dodge_burn::{DodgeBurn, DodgeBurnConfig};
pub use dog_bloom::DogBloom;
pub use edge_luminance::{EdgeLuminance, EdgeLuminanceConfig};
pub use event_horizon::{EventHorizon, EventHorizonConfig};
pub use fine_texture::{FineTexture, FineTextureConfig};
pub use gaussian_bloom::GaussianBloom;
pub use glow_enhancement::{GlowEnhancement, GlowEnhancementConfig};
pub use gradient_map::{GradientMap, GradientMapConfig, LuxuryPalette};
pub use halation::{Halation, HalationConfig};
pub use micro_contrast::{MicroContrast, MicroContrastConfig};
pub use nebula_clouds::{NebulaCloudConfig, NebulaClouds};
pub use opalescence::{Opalescence, OpalescenceConfig};
pub use perceptual_blur::{PerceptualBlur, PerceptualBlurConfig};
pub use prismatic_halos::{PrismaticHalos, PrismaticHalosConfig};
pub use refractive_caustics::{RefractiveCaustics, RefractiveCausticsConfig};
pub use volumetric_occlusion::{VolumetricOcclusion, VolumetricOcclusionConfig};
pub use atmospheric_depth::AtmosphericDepth;
pub use aurora_veils::AuroraVeils;
pub use cosmic_ink::CosmicInk;

#[cfg(test)]
mod tests {
    use super::*;

    // Simple test effect that adds a constant value
    struct AddEffect {
        value: f64,
        enabled: bool,
    }

    impl PostEffect for AddEffect {
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
            let mut output = input.clone();
            for pixel in &mut output {
                pixel.0 += self.value;
                pixel.1 += self.value;
                pixel.2 += self.value;
                // Alpha unchanged
            }
            Ok(output)
        }
    }

    #[test]
    fn test_empty_chain() {
        let chain = PostEffectChain::new();
        assert!(chain.is_empty());
        assert_eq!(chain.len(), 0);

        let input = vec![(0.5, 0.5, 0.5, 1.0)];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let result = chain.process(input.clone(), 1, 1, &params).unwrap();
        assert_eq!(result, input);
    }

    #[test]
    fn test_single_effect() {
        let mut chain = PostEffectChain::new();
        chain.add(Box::new(AddEffect { value: 0.1, enabled: true }));

        assert_eq!(chain.len(), 1);
        assert!(!chain.is_empty());

        let input = vec![(0.5, 0.5, 0.5, 1.0)];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let result = chain.process(input, 1, 1, &params).unwrap();
        assert_eq!(result[0].0, 0.6);
        assert_eq!(result[0].1, 0.6);
        assert_eq!(result[0].2, 0.6);
        assert_eq!(result[0].3, 1.0); // Alpha unchanged
    }

    #[test]
    fn test_multiple_effects() {
        let mut chain = PostEffectChain::new();
        chain.add(Box::new(AddEffect { value: 0.1, enabled: true }));
        chain.add(Box::new(AddEffect { value: 0.2, enabled: true }));

        let input = vec![(0.5, 0.5, 0.5, 1.0)];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let result = chain.process(input, 1, 1, &params).unwrap();
        assert_eq!(result[0].0, 0.8); // 0.5 + 0.1 + 0.2
        assert_eq!(result[0].1, 0.8);
        assert_eq!(result[0].2, 0.8);
        assert_eq!(result[0].3, 1.0);
    }

    #[test]
    fn test_disabled_effect() {
        let mut chain = PostEffectChain::new();
        chain.add(Box::new(AddEffect { value: 0.1, enabled: false }));
        chain.add(Box::new(AddEffect { value: 0.2, enabled: true }));

        let input = vec![(0.5, 0.5, 0.5, 1.0)];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let result = chain.process(input, 1, 1, &params).unwrap();
        assert_eq!(result[0].0, 0.7); // 0.5 + 0.2 (first effect disabled)
        assert_eq!(result[0].1, 0.7);
        assert_eq!(result[0].2, 0.7);
        assert_eq!(result[0].3, 1.0);
    }

    #[test]
    fn test_error_type() {
        let error = PostEffectError {
            effect_name: "Test Effect".to_string(),
            message: "Test error".to_string(),
        };

        assert_eq!(error.to_string(), "PostEffect 'Test Effect' error: Test error");
    }
}
