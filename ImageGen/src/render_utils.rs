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
#[allow(dead_code)] // Used by non-spectral render passes which are currently unused
pub struct HistogramData {
    /// Interleaved RGB data for better cache locality
    data: Vec<[f64; 3]>,
}

#[allow(dead_code)]
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
    
    /// Get the length of the histogram
    pub fn len(&self) -> usize {
        self.data.len()
    }
    
    /// Check if histogram is empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
    
    /// Clear the histogram data
    pub fn clear(&mut self) {
        self.data.clear();
    }
    
    /// Reserve additional capacity
    pub fn reserve(&mut self, additional: usize) {
        self.data.reserve(additional);
    }
    
    /// Get raw data for iteration
    pub fn data(&self) -> &[[f64; 3]] {
        &self.data
    }
    
    /// Compute black and white points for color leveling
    pub fn compute_black_white_points(
        &mut self,
        clip_black: f64,
        clip_white: f64,
    ) -> (f64, f64, f64, f64, f64, f64) {
        let total_pix = self.data.len();
        if total_pix == 0 {
            return (0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
        }
        
        // Extract channels for sorting
        let mut r_values: Vec<f64> = self.data.iter().map(|rgb| rgb[0]).collect();
        let mut g_values: Vec<f64> = self.data.iter().map(|rgb| rgb[1]).collect();
        let mut b_values: Vec<f64> = self.data.iter().map(|rgb| rgb[2]).collect();
        
        // Use select_nth_unstable for O(n) percentile finding
        let black_idx = ((clip_black * total_pix as f64).round() as usize)
            .min(total_pix.saturating_sub(1));
        let white_idx = ((clip_white * total_pix as f64).round() as usize)
            .min(total_pix.saturating_sub(1));
        
        // Find percentiles using partial sort (O(n) complexity)
        let black_r = *r_values.select_nth_unstable_by(black_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        let white_r = *r_values.select_nth_unstable_by(white_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        
        let black_g = *g_values.select_nth_unstable_by(black_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        let white_g = *g_values.select_nth_unstable_by(white_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        
        let black_b = *b_values.select_nth_unstable_by(black_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        let white_b = *b_values.select_nth_unstable_by(white_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        
        (black_r, white_r, black_g, white_g, black_b, white_b)
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