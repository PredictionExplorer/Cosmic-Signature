//! Post-processing effects and image filtering

use crate::oklab;
use crate::post_effects::{
    AutoExposure, DogBloom as PostDogBloom, GaussianBloom,
    PerceptualBlur, PerceptualBlurConfig, PostEffectChain,
};
use crate::utils::build_gaussian_kernel;
use log::{debug, trace};
use rayon::prelude::*;
use smallvec::SmallVec;

/// Configuration for Difference-of-Gaussians bloom
#[derive(Clone, Debug)]
pub struct DogBloomConfig {
    /// Base blur radius
    pub inner_sigma: f64,
    /// Outer sigma = inner * ratio (typically 2-3)
    pub outer_ratio: f64,
    /// DoG multiplier (0.2-0.8)
    pub strength: f64,
    /// Minimum value to include
    pub threshold: f64,
}

impl Default for DogBloomConfig {
    fn default() -> Self {
        Self {
            inner_sigma: 6.0,
            outer_ratio: 2.5,
            strength: 0.35,
            threshold: 0.01,
        }
    }
}

/// Configuration for creating post-effect chains
pub struct PostEffectConfig<'a> {
    pub bloom_mode: &'a str,
    pub blur_radius_px: usize,
    pub blur_strength: f64,
    pub blur_core_brightness: f64,
    pub dog_config: &'a DogBloomConfig,
    pub hdr_mode: &'a str,
    pub perceptual_blur_enabled: bool,
    pub perceptual_blur_config: Option<&'a PerceptualBlurConfig>,
}

/// Mipmap pyramid for efficient multi-scale filtering
pub struct MipPyramid {
    levels: Vec<Vec<(f64, f64, f64, f64)>>,
    widths: Vec<usize>,
    heights: Vec<usize>,
}

impl MipPyramid {
    /// Create a new mipmap pyramid with specified number of levels
    pub fn new(base: &[(f64, f64, f64, f64)], width: usize, height: usize, levels: usize) -> Self {
        let mut pyramid = MipPyramid {
            levels: vec![base.to_vec()],
            widths: vec![width],
            heights: vec![height],
        };
        
        for level in 1..levels {
            let prev_w = pyramid.widths[level - 1];
            let prev_h = pyramid.heights[level - 1];
            let new_w = prev_w.div_ceil(2);
            let new_h = prev_h.div_ceil(2);
            
            let mut downsampled = vec![(0.0, 0.0, 0.0, 0.0); new_w * new_h];
            
            // Box filter downsample (parallel)
            downsampled.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
                let x = idx % new_w;
                let y = idx / new_w;
                
                // Sample 2x2 region from previous level
                let x0 = (x * 2).min(prev_w - 1);
                let x1 = ((x * 2) + 1).min(prev_w - 1);
                let y0 = (y * 2).min(prev_h - 1);
                let y1 = ((y * 2) + 1).min(prev_h - 1);
                
                let p00 = pyramid.levels[level - 1][y0 * prev_w + x0];
                let p01 = pyramid.levels[level - 1][y0 * prev_w + x1];
                let p10 = pyramid.levels[level - 1][y1 * prev_w + x0];
                let p11 = pyramid.levels[level - 1][y1 * prev_w + x1];
                
                *pixel = (
                    (p00.0 + p01.0 + p10.0 + p11.0) * 0.25,
                    (p00.1 + p01.1 + p10.1 + p11.1) * 0.25,
                    (p00.2 + p01.2 + p10.2 + p11.2) * 0.25,
                    (p00.3 + p01.3 + p10.3 + p11.3) * 0.25,
                );
            });
            
            pyramid.levels.push(downsampled);
            pyramid.widths.push(new_w);
            pyramid.heights.push(new_h);
        }
        
        pyramid
    }
}

/// Auto-exposure calculator for HDR tone mapping
pub struct ExposureCalculator {
    target_percentile: f64,
    min_exposure: f64,
    max_exposure: f64,
}

impl Default for ExposureCalculator {
    fn default() -> Self {
        Self {
            target_percentile: 0.95,
            min_exposure: 0.1,
            max_exposure: 10.0,
        }
    }
}

impl ExposureCalculator {
    /// Calculate exposure value based on pixel luminance
    pub fn calculate_exposure(&self, pixels: &[(f64, f64, f64, f64)]) -> f64 {
        // Compute luminance values
        let luminances: Vec<f64> = pixels
            .par_iter()
            .map(|(r, g, b, a)| {
                // Rec. 709 luminance weights
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                lum * a  // Premultiplied
            })
            .filter(|&l| l > 0.0)  // Ignore black pixels
            .collect();
        
        if luminances.is_empty() {
            return 1.0;
        }
        
        // Find percentile using partial sort
        let mut sorted = luminances;
        let percentile_idx = ((sorted.len() as f64 * self.target_percentile) as usize)
            .min(sorted.len() - 1);
        
        let (_, median, _) = sorted.select_nth_unstable_by(percentile_idx, |a, b| {
            a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
        });
        
        // Calculate exposure to map percentile to ~0.8
        let exposure = 0.8 / median.max(1e-10);
        
        // Clamp to reasonable range
        exposure.clamp(self.min_exposure, self.max_exposure)
    }
}

/// Gaussian blur context with cached kernel
struct GaussianBlurContext {
    kernel: SmallVec<[f64; 32]>,
    radius: usize,
}

impl GaussianBlurContext {
    fn new(radius: usize) -> Self {
        let kernel_vec = build_gaussian_kernel(radius);
        
        // Use SmallVec for small kernels to avoid heap allocation
        let kernel = kernel_vec;
        
        Self {
            kernel,
            radius,
        }
    }
}

/// Apply separable 2D Gaussian blur to RGBA buffer in parallel
pub fn parallel_blur_2d_rgba(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    radius: usize,
) {
    if radius == 0 {
        return;
    }
    
    debug!("Applying Gaussian blur with radius {radius}");
    
    let blur_ctx = GaussianBlurContext::new(radius);
    let temp = buffer.to_vec();
    
    // Horizontal pass (parallelized by row)
    buffer.par_chunks_mut(width).enumerate().for_each(|(y, row)| {
        for (x, pixel) in row.iter_mut().enumerate() {
            let mut sum = (0.0, 0.0, 0.0, 0.0);
            
            for (i, &k) in blur_ctx.kernel.iter().enumerate() {
                let sx = (x as i32 + i as i32 - blur_ctx.radius as i32)
                    .clamp(0, width as i32 - 1) as usize;
                let src = temp[y * width + sx];
                sum.0 += src.0 * k;
                sum.1 += src.1 * k;
                sum.2 += src.2 * k;
                sum.3 += src.3 * k;
            }
            
            *pixel = sum;
        }
    });
    
    // Vertical pass - use a separate output buffer to avoid issues
    let temp2 = buffer.to_vec();
    let mut output = vec![(0.0, 0.0, 0.0, 0.0); width * height];
    
    // Process columns in parallel
    output.par_chunks_mut(1).enumerate().for_each(|(idx, pixel_slice)| {
        let x = idx % width;
        let y = idx / width;
        
        let mut sum = (0.0, 0.0, 0.0, 0.0);
        
        for (i, &k) in blur_ctx.kernel.iter().enumerate() {
            let sy = (y as i32 + i as i32 - blur_ctx.radius as i32)
                .clamp(0, height as i32 - 1) as usize;
            let src = temp2[sy * width + x];
            sum.0 += src.0 * k;
            sum.1 += src.1 * k;
            sum.2 += src.2 * k;
            sum.3 += src.3 * k;
        }
        
        pixel_slice[0] = sum;
    });
    
    // Copy output back to buffer
    buffer.copy_from_slice(&output);
}

/// Standalone bilinear upsampling function for arbitrary data
fn upsample_bilinear(
    src: &[(f64, f64, f64, f64)],
    src_w: usize,
    src_h: usize,
    target_w: usize,
    target_h: usize,
) -> Vec<(f64, f64, f64, f64)> {
    let mut result = vec![(0.0, 0.0, 0.0, 0.0); target_w * target_h];
    
    result.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let x = idx % target_w;
        let y = idx / target_w;
        
        // Map to source coordinates
        let sx = (x as f64 * src_w as f64 / target_w as f64).min((src_w - 1) as f64);
        let sy = (y as f64 * src_h as f64 / target_h as f64).min((src_h - 1) as f64);
        
        let x0 = sx.floor() as usize;
        let y0 = sy.floor() as usize;
        let x1 = (x0 + 1).min(src_w - 1);
        let y1 = (y0 + 1).min(src_h - 1);
        
        let fx = sx - x0 as f64;
        let fy = sy - y0 as f64;
        
        // Get source pixels (premultiplied RGBA)
        let p00 = src[y0 * src_w + x0];
        let p01 = src[y0 * src_w + x1];
        let p10 = src[y1 * src_w + x0];
        let p11 = src[y1 * src_w + x1];
        
        // Proper premultiplied alpha interpolation
        let top = (
            p00.0 * (1.0 - fx) + p01.0 * fx,
            p00.1 * (1.0 - fx) + p01.1 * fx,
            p00.2 * (1.0 - fx) + p01.2 * fx,
            p00.3 * (1.0 - fx) + p01.3 * fx,
        );
        
        let bottom = (
            p10.0 * (1.0 - fx) + p11.0 * fx,
            p10.1 * (1.0 - fx) + p11.1 * fx,
            p10.2 * (1.0 - fx) + p11.2 * fx,
            p10.3 * (1.0 - fx) + p11.3 * fx,
        );
        
        *pixel = (
            top.0 * (1.0 - fy) + bottom.0 * fy,
            top.1 * (1.0 - fy) + bottom.1 * fy,
            top.2 * (1.0 - fy) + bottom.2 * fy,
            top.3 * (1.0 - fy) + bottom.3 * fy,
        );
        
        // Renormalize for very low alpha to prevent color bleeding
        if pixel.3 > 0.0 && pixel.3 < 0.01 {
            let expected_alpha = p00.3 * (1.0 - fx) * (1.0 - fy) + 
                                p01.3 * fx * (1.0 - fy) + 
                                p10.3 * (1.0 - fx) * fy + 
                                p11.3 * fx * fy;
            if expected_alpha > 1e-10 {
                let scale = pixel.3 / expected_alpha;
                pixel.0 *= scale;
                pixel.1 *= scale;
                pixel.2 *= scale;
            }
        }
    });
    
    result
}

/// Apply Difference-of-Gaussians bloom effect
pub fn apply_dog_bloom(
    input: &[(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    config: &DogBloomConfig,
) -> Vec<(f64, f64, f64, f64)> {
    trace!("Applying DoG bloom with config: {config:?}");
    
    // Create mip pyramid (3 levels)
    let pyramid = MipPyramid::new(input, width, height, 3);
    
    // Blur at different mip levels for efficiency
    let inner_radius = config.inner_sigma.round() as usize;
    let outer_radius = (config.inner_sigma * config.outer_ratio).round() as usize;
    
    // Blur level 1 (half resolution) with inner sigma
    let mut blur_inner = pyramid.levels[1].clone();
    parallel_blur_2d_rgba(
        &mut blur_inner,
        pyramid.widths[1],
        pyramid.heights[1],
        inner_radius / 2,  // Adjust for mip level
    );
    
    // Blur level 2 (quarter resolution) with outer sigma
    let mut blur_outer = pyramid.levels[2].clone();
    parallel_blur_2d_rgba(
        &mut blur_outer,
        pyramid.widths[2],
        pyramid.heights[2],
        outer_radius / 4,  // Adjust for mip level
    );
    
    // Upsample both BLURRED data to original resolution
    let inner_upsampled = upsample_bilinear(
        &blur_inner,
        pyramid.widths[1],
        pyramid.heights[1],
        width,
        height,
    );
    let outer_upsampled = upsample_bilinear(
        &blur_outer,
        pyramid.widths[2],
        pyramid.heights[2],
        width,
        height,
    );
    
    // Compute DoG and apply threshold
    let mut dog_result = vec![(0.0, 0.0, 0.0, 0.0); width * height];
    
    dog_result.par_iter_mut()
        .zip(inner_upsampled.par_iter())
        .zip(outer_upsampled.par_iter())
        .for_each(|((dog, &inner), &outer)| {
            let diff = (
                inner.0 - outer.0,
                inner.1 - outer.1,
                inner.2 - outer.2,
                inner.3 - outer.3,
            );
            
            // Compute luminance for thresholding
            let lum = 0.299 * diff.0 + 0.587 * diff.1 + 0.114 * diff.2;
            
            if lum > config.threshold {
                *dog = (
                    diff.0 * config.strength,
                    diff.1 * config.strength,
                    diff.2 * config.strength,
                    diff.3 * config.strength,
                );
            }
            // Negative values are left as zero (clamped)
        });
    
    dog_result
}

/// Create a post-effect chain based on configuration
pub fn create_post_effect_chain(config: PostEffectConfig) -> PostEffectChain {
    trace!("Creating post-effect chain with bloom_mode={}, hdr_mode={}", config.bloom_mode, config.hdr_mode);
    
    let mut chain = PostEffectChain::new();
    
    // 1. Auto-exposure (if enabled)
    if config.hdr_mode == "auto" {
        chain.add(Box::new(AutoExposure::new()));
    }
    
    // 2. Bloom effect
    match config.bloom_mode {
        "dog" => {
            chain.add(Box::new(PostDogBloom::new(
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
        let blur_config = config.perceptual_blur_config.cloned().unwrap_or(
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