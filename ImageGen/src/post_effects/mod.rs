//! Post-processing effects pipeline for the Three Body Problem renderer.
//!
//! This module provides a trait-based system for applying visual effects
//! in a composable, modular fashion.

use std::error::Error;
use std::fmt;

/// Type alias for pixel buffers used throughout the pipeline.
/// Format: (R, G, B, A) in linear color space, premultiplied alpha.
pub type PixelBuffer = Vec<(f64, f64, f64, f64)>;

/// Error type for post-processing pipeline failures.
#[derive(Debug)]
pub struct PostEffectError {
    effect_name: String,
    message: String,
}

impl fmt::Display for PostEffectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PostEffect '{}' error: {}", self.effect_name, self.message)
    }
}

impl Error for PostEffectError {}

/// Trait for implementing post-processing effects.
///
/// Each effect transforms an input buffer and returns a new buffer.
/// Effects should be stateless and safe to call multiple times.
pub trait PostEffect: Send + Sync {
    /// Returns the human-readable name of this effect.
    #[allow(dead_code)]
    fn name(&self) -> &str;
    
    /// Process the input buffer and return the result.
    /// 
    /// # Arguments
    /// * `input` - Input pixel buffer
    /// * `width` - Buffer width in pixels
    /// * `height` - Buffer height in pixels
    /// 
    /// # Returns
    /// Processed pixel buffer or error
    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>>;
    
    /// Returns whether this effect is currently enabled.
    /// Default implementation returns true.
    fn is_enabled(&self) -> bool {
        true
    }
}

/// A chain of post-processing effects applied in sequence.
pub struct PostEffectChain {
    effects: Vec<Box<dyn PostEffect>>,
}

impl PostEffectChain {
    /// Creates a new, empty effect chain.
    pub fn new() -> Self {
        Self {
            effects: Vec::new(),
        }
    }
    
    /// Adds an effect to the end of the chain.
    pub fn add(&mut self, effect: Box<dyn PostEffect>) {
        self.effects.push(effect);
    }
    
    /// Processes a buffer through all enabled effects in order.
    /// 
    /// # Arguments
    /// * `buffer` - Input pixel buffer
    /// * `width` - Buffer width in pixels
    /// * `height` - Buffer height in pixels
    /// 
    /// # Returns
    /// Final processed buffer or first error encountered
    pub fn process(
        &self,
        mut buffer: PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        for effect in &self.effects {
            if effect.is_enabled() {
                buffer = effect.process(&buffer, width, height)?;
            }
        }
        Ok(buffer)
    }
    
    /// Returns the number of effects in the chain.
    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.effects.len()
    }
    
    /// Returns true if the chain has no effects.
    #[allow(dead_code)]
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
pub mod exposure;
pub mod gaussian_bloom;
pub mod dog_bloom;
pub mod perceptual_blur;

pub use exposure::AutoExposure;
pub use gaussian_bloom::GaussianBloom;
pub use dog_bloom::DogBloom;
pub use perceptual_blur::{PerceptualBlur, PerceptualBlurConfig};

#[cfg(test)]
mod tests {
    use super::*;
    
    // Simple test effect that adds a constant value
    struct AddEffect {
        value: f64,
        enabled: bool,
    }
    
    impl PostEffect for AddEffect {
        fn name(&self) -> &str { "Add Effect" }
        
        fn is_enabled(&self) -> bool { self.enabled }
        
        fn process(&self, input: &PixelBuffer, _width: usize, _height: usize) -> Result<PixelBuffer, Box<dyn Error>> {
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
        let result = chain.process(input.clone(), 1, 1).unwrap();
        assert_eq!(result, input);
    }
    
    #[test]
    fn test_single_effect() {
        let mut chain = PostEffectChain::new();
        chain.add(Box::new(AddEffect { value: 0.1, enabled: true }));
        
        assert_eq!(chain.len(), 1);
        assert!(!chain.is_empty());
        
        let input = vec![(0.5, 0.5, 0.5, 1.0)];
        let result = chain.process(input, 1, 1).unwrap();
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
        let result = chain.process(input, 1, 1).unwrap();
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
        let result = chain.process(input, 1, 1).unwrap();
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
        
        assert_eq!(format!("{}", error), "PostEffect 'Test Effect' error: Test error");
    }
} 