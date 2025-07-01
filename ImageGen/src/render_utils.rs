//! Rendering utilities for common functionality

#![allow(dead_code)]

use crate::oklab;
use crate::post_effects::{PostEffectChain, AutoExposure, GaussianBloom, DogBloom, PerceptualBlur, PerceptualBlurConfig};
use crate::render::{DogBloomConfig, OklabColor};
use nalgebra::Vector3;
use std::error::Error;

/// Type alias for pixel buffer
type PixelBuffer = Vec<(f64, f64, f64, f64)>;

/// Encapsulates common rendering operations and coordinate transformations
#[allow(dead_code)]
pub struct RenderContext {
    pub width: u32,
    pub height: u32,
    pub width_usize: usize,
    pub height_usize: usize,
    pub width_i32: i32,
    pub height_i32: i32,
    bounds: BoundingBox,
}

/// Bounding box for coordinate transformations
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
struct BoundingBox {
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    width: f64,
    height: f64,
}

impl RenderContext {
    /// Creates a new render context from position data
    pub fn new(width: u32, height: u32, positions: &[Vec<Vector3<f64>>]) -> Self {
        let (min_x, max_x, min_y, max_y) = crate::utils::bounding_box(positions);
        let bounds = BoundingBox {
            min_x,
            max_x,
            min_y,
            max_y,
            width: (max_x - min_x).max(1e-12),
            height: (max_y - min_y).max(1e-12),
        };
        
        Self {
            width,
            height,
            width_usize: width as usize,
            height_usize: height as usize,
            width_i32: width as i32,
            height_i32: height as i32,
            bounds,
        }
    }
    
    /// Convert world coordinates to pixel coordinates
    #[inline]
    pub fn to_pixel(&self, x: f64, y: f64) -> (f32, f32) {
        let px = ((x - self.bounds.min_x) / self.bounds.width) * (self.width as f64);
        let py = ((y - self.bounds.min_y) / self.bounds.height) * (self.height as f64);
        (px as f32, py as f32)
    }
    
    /// Get total pixel count
    #[inline]
    pub fn pixel_count(&self) -> usize {
        self.width_usize * self.height_usize
    }
    
    /// Check if pixel coordinates are in bounds
    #[inline]
    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && x < self.width_i32 && y >= 0 && y < self.height_i32
    }
    
    /// Get linear index from 2D coordinates
    #[inline]
    pub fn pixel_index(&self, x: i32, y: i32) -> usize {
        (y as usize * self.width_usize) + x as usize
    }
}

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
#[derive(Clone, Debug)]
pub struct FrameParams {
    pub frame_number: usize,
    pub density: Option<f64>,
}

/// Persistent effect chain builder
pub struct EffectChainBuilder {
    chain: PostEffectChain,
    config: EffectConfig,
}

impl EffectChainBuilder {
    /// Create a new effect chain builder with given configuration
    pub fn new(config: EffectConfig) -> Self {
        let chain = Self::build_chain(&config);
        Self { chain, config }
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

/// Common frame iteration logic
pub trait FrameIterator {
    /// Iterate through frames with a callback
    fn iterate_frames<F>(
        &self,
        positions: &[Vec<Vector3<f64>>],
        colors: &[Vec<OklabColor>],
        body_alphas: &[f64],
        frame_interval: usize,
        callback: F,
    ) -> Result<(), Box<dyn Error>>
    where
        F: FnMut(FrameData) -> Result<(), Box<dyn Error>>;
}

/// Data for a single frame iteration
pub struct FrameData {
    pub step: usize,
    pub is_frame_boundary: bool,
    pub is_final: bool,
    pub positions: [(f64, f64); 3],
    pub colors: [OklabColor; 3],
    pub alphas: [f64; 3],
}

impl FrameIterator for RenderContext {
    fn iterate_frames<F>(
        &self,
        positions: &[Vec<Vector3<f64>>],
        colors: &[Vec<OklabColor>],
        body_alphas: &[f64],
        frame_interval: usize,
        mut callback: F,
    ) -> Result<(), Box<dyn Error>>
    where
        F: FnMut(FrameData) -> Result<(), Box<dyn Error>>,
    {
        let total_steps = positions[0].len();
        
        for step in 0..total_steps {
            let p0 = positions[0][step];
            let p1 = positions[1][step];
            let p2 = positions[2][step];
            
            let (x0, y0) = self.to_pixel(p0[0], p0[1]);
            let (x1, y1) = self.to_pixel(p1[0], p1[1]);
            let (x2, y2) = self.to_pixel(p2[0], p2[1]);
            
            let is_frame_boundary = step > 0 && step % frame_interval == 0;
            let is_final = step == total_steps - 1;
            
            let frame_data = FrameData {
                step,
                is_frame_boundary,
                is_final,
                positions: [(x0 as f64, y0 as f64), (x1 as f64, y1 as f64), (x2 as f64, y2 as f64)],
                colors: [colors[0][step], colors[1][step], colors[2][step]],
                alphas: [body_alphas[0], body_alphas[1], body_alphas[2]],
            };
            
            callback(frame_data)?;
        }
        
        Ok(())
    }
} 