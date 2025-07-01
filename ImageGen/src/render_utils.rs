//! Rendering utilities for common functionality

use crate::oklab;
use crate::post_effects::{PostEffectChain, AutoExposure, GaussianBloom, DogBloom, PerceptualBlur, PerceptualBlurConfig};
use crate::render::DogBloomConfig;
use std::error::Error;

/// Type alias for pixel buffer
type PixelBuffer = Vec<(f64, f64, f64, f64)>;

/// Configuration for effect chain creation
#[derive(Clone, Debug)]
pub struct EffectConfig {
    pub bloom_mode: String,
    pub blur_radius_px: usize,
    pub blur_strength: f64,
    pub blur_core_brightness: f64,
    pub dog_config: DogBloomConfig,
    pub hdr_mode: String,
    pub perceptual_blur_enabled: bool,
    pub perceptual_blur_config: Option<PerceptualBlurConfig>,
}

/// Per-frame parameters that may vary
/// Currently used as a placeholder for future frame-specific parameters
#[derive(Clone, Debug, Default)]
pub struct FrameParams {}

/// Persistent effect chain builder
pub struct EffectChainBuilder {
    chain: PostEffectChain,
}

impl EffectChainBuilder {
    /// Create a new effect chain builder with given configuration
    pub fn new(config: EffectConfig) -> Self {
        let chain = Self::build_chain(&config);
        Self { chain }
    }
    
    /// Build the effect chain based on configuration
    fn build_chain(config: &EffectConfig) -> PostEffectChain {
        let mut chain = PostEffectChain::new();
        
        // 1. Auto-exposure (if enabled)
        if config.hdr_mode == "auto" {
            chain.add(Box::new(AutoExposure::new()));
        }
        
        // 2. Bloom effect
        match config.bloom_mode.as_str() {
            "dog" => {
                chain.add(Box::new(DogBloom::new(
                    config.dog_config.clone(),
                    config.blur_core_brightness,
                )));
            }
            _ => {
                // Default to Gaussian bloom
                chain.add(Box::new(GaussianBloom::new(
                    config.blur_radius_px,
                    config.blur_strength,
                    config.blur_core_brightness,
                )));
            }
        }
        
        // 3. Perceptual blur (if enabled)
        if config.perceptual_blur_enabled {
            let blur_config = config.perceptual_blur_config.clone().unwrap_or(
                PerceptualBlurConfig {
                    radius: config.blur_radius_px,
                    strength: 0.5,
                    gamut_mode: oklab::GamutMapMode::PreserveHue,
                }
            );
            chain.add(Box::new(PerceptualBlur::new(blur_config)));
        }
        
        chain
    }
    
    /// Process a frame with the configured effect chain
    pub fn process_frame(
        &self,
        buffer: PixelBuffer,
        width: usize,
        height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        self.chain.process(buffer, width, height)
    }
}

/// Optimized histogram storage with better memory layout
pub struct HistogramData {
    /// Interleaved RGB data for better cache locality
    data: Vec<[f64; 3]>,
}

impl HistogramData {
    /// Create new histogram storage with given capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
        }
    }
    
    /// Add a pixel's RGB values to the histogram
    #[inline]
    pub fn push(&mut self, r: f64, g: f64, b: f64) {
        self.data.push([r, g, b]);
    }
    
    /// Reserve additional capacity
    pub fn reserve(&mut self, additional: usize) {
        self.data.reserve(additional);
    }
    
    /// Get raw data for iteration
    pub fn data(&self) -> &[[f64; 3]] {
        &self.data
    }
}

/// Save an RGB image buffer as PNG
pub fn save_image_as_png(
    rgb_img: &image::ImageBuffer<image::Rgb<u8>, Vec<u8>>,
    path: &str,
) -> Result<(), Box<dyn Error>> {
    use log::info;
    
    let dyn_img = image::DynamicImage::ImageRgb8(rgb_img.clone());
    dyn_img.save(path)?;
    info!("Saved PNG => {}", path);
    Ok(())
} 