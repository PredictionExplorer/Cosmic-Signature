//! Post-processing effects pipeline
//!
//! This module manages the visual effects chain including bloom, blur, and tone mapping.
//! It provides a configurable pipeline for post-processing rendered frames.

use super::constants;
use super::context::PixelBuffer;
use super::drawing::parallel_blur_2d_rgba;
use super::error::{RenderError, Result};
use crate::post_effects::{
    AutoExposure, ChampleveConfig, ChromaticBloom, ChromaticBloomConfig, CinematicColorGrade,
    ColorGradeParams, DogBloom, GaussianBloom, GlowEnhancement, GlowEnhancementConfig,
    GradientMap, GradientMapConfig, MicroContrast, MicroContrastConfig,
    PerceptualBlur, PerceptualBlurConfig, PostEffect,
    PostEffectChain, aether::AetherConfig, apply_aether_weave, apply_champleve_iridescence,
    AtmosphericDepth, AtmosphericDepthConfig, EdgeLuminance, EdgeLuminanceConfig,
    FineTexture, FineTextureConfig, Opalescence, OpalescenceConfig,
};
use crate::spectrum::{NUM_BINS, spd_to_rgba};
use rayon::prelude::*;

/// Configuration for effect chain creation
/// 
/// Controls which effects are enabled and their parameters. Effects are applied
/// in a carefully ordered sequence for optimal visual quality:
/// 1. Bloom effects (diffuse glow)
/// 2. Tone mapping and blur
/// 3. Color manipulation (palettes, grading)
/// 4. Material effects (iridescence, structure)
/// 5. Detail enhancement (edges, contrast)
/// 6. Atmospheric effects (depth, texture)
#[derive(Clone, Debug)]
pub struct EffectConfig {
    // Core bloom and blur effects
    pub bloom_mode: String,
    pub blur_radius_px: usize,
    pub blur_strength: f64,
    pub blur_core_brightness: f64,
    pub dog_config: DogBloomConfig,
    pub hdr_mode: String,
    pub perceptual_blur_enabled: bool,
    pub perceptual_blur_config: Option<PerceptualBlurConfig>,
    
    // Color manipulation effects
    pub color_grade_enabled: bool,
    pub color_grade_params: ColorGradeParams,
    pub gradient_map_enabled: bool,
    pub gradient_map_config: GradientMapConfig,
    
    // Material and iridescence effects
    pub champleve_enabled: bool,
    pub champleve_config: ChampleveConfig,
    pub aether_enabled: bool,
    pub aether_config: AetherConfig,
    pub chromatic_bloom_enabled: bool,
    pub chromatic_bloom_config: ChromaticBloomConfig,
    pub opalescence_enabled: bool,
    pub opalescence_config: OpalescenceConfig,
    
    // Detail and clarity effects
    pub edge_luminance_enabled: bool,
    pub edge_luminance_config: EdgeLuminanceConfig,
    pub micro_contrast_enabled: bool,
    pub micro_contrast_config: MicroContrastConfig,
    pub glow_enhancement_enabled: bool,
    pub glow_enhancement_config: GlowEnhancementConfig,
    
    // Atmospheric and surface effects
    pub atmospheric_depth_enabled: bool,
    pub atmospheric_depth_config: AtmosphericDepthConfig,
    pub fine_texture_enabled: bool,
    pub fine_texture_config: FineTextureConfig,
}

/// Per-frame parameters that may vary
#[derive(Clone, Debug)]
pub struct FrameParams {
    pub _frame_number: usize,
    pub _density: Option<f64>,
}

/// Persistent effect chain builder
pub struct EffectChainBuilder {
    chain: PostEffectChain,
    _config: EffectConfig,
}

impl EffectChainBuilder {
    /// Create a new effect chain builder with given configuration
    pub fn new(config: EffectConfig) -> Self {
        let chain = Self::build_chain(&config);
        Self { chain, _config: config }
    }

    /// Build the effect chain based on configuration
    /// 
    /// Effects are applied in a carefully optimized order:
    /// 1. Bloom effects (diffuse and tight glow)
    /// 2. Tone mapping and perceptual smoothing
    /// 3. Detail enhancement (contrast, clarity)
    /// 4. Color manipulation (palettes, grading)
    /// 5. Material properties (iridescence layers)
    /// 6. Form refinement (edges)
    /// 7. Atmospheric effects (depth, texture)
    fn build_chain(config: &EffectConfig) -> PostEffectChain {
        let mut chain = PostEffectChain::new();

        // ===== PHASE 1: BLOOM & GLOW =====
        // Base lighting effects that work on bright areas
        
        // 1a. Traditional bloom (large diffuse glow)
        if config.blur_radius_px > 0 {
            chain.add(Box::new(GaussianBloom::new(
                config.blur_radius_px,
                config.blur_strength,
                config.blur_core_brightness,
            )));
        }

        // 1b. DoG bloom (edge-detected glow, mutually exclusive with Gaussian)
        match config.bloom_mode.as_str() {
            "dog" => chain.add(Box::new(DogBloom::new(
                config.dog_config.clone(),
                config.blur_core_brightness,
            ))),
            "gaussian" => {}
            _ => {}
        }

        // 1c. Glow enhancement (tight sparkle on very bright areas) [NEW]
        if config.glow_enhancement_enabled {
            chain.add(Box::new(GlowEnhancement::new(config.glow_enhancement_config.clone())));
        }

        // 1d. Chromatic bloom (prismatic color separation)
        if config.chromatic_bloom_enabled {
            chain.add(Box::new(ChromaticBloom::new(config.chromatic_bloom_config.clone())));
        }

        // ===== PHASE 2: TONE MAPPING & BLUR =====
        // Perceptual processing for smooth, natural appearance
        
        // 2a. Perceptual blur (OKLab space smoothing)
        if config.perceptual_blur_enabled && config.perceptual_blur_config.is_some() {
            let blur_config = config.perceptual_blur_config.as_ref().unwrap();
            chain.add(Box::new(PerceptualBlur::new(blur_config.clone())));
        }

        // 2b. Auto-exposure (HDR tone mapping)
        if config.hdr_mode == "auto" {
            chain.add(Box::new(AutoExposure::default()));
        }

        // ===== PHASE 3: DETAIL ENHANCEMENT =====
        // Clarity and definition improvements
        
        // 3. Micro-contrast (local contrast enhancement for detail clarity) [NEW]
        if config.micro_contrast_enabled {
            chain.add(Box::new(MicroContrast::new(config.micro_contrast_config.clone())));
        }

        // ===== PHASE 4: COLOR MANIPULATION =====
        // Artistic color transformations
        
        // 4a. Gradient mapping (luxury color palettes)
        if config.gradient_map_enabled {
            chain.add(Box::new(GradientMap::new(config.gradient_map_config.clone())));
        }

        // 4b. Cinematic color grading (film-like look)
        if config.color_grade_enabled && config.color_grade_params.strength > 0.0 {
            chain.add(Box::new(CinematicColorGrade::new(config.color_grade_params.clone())));
        }

        // ===== PHASE 5: MATERIAL PROPERTIES =====
        // Iridescence and material quality (layered for depth)
        
        // 5a. Opalescence (base gem-like shimmer layer) [MOVED EARLIER]
        if config.opalescence_enabled {
            chain.add(Box::new(Opalescence::new(config.opalescence_config.clone())));
        }

        // 5b. Champlevé (structure layer: Voronoi cells + metallic rims)
        if config.champleve_enabled {
            chain.add(Box::new(ChampleveFinish::new(config.champleve_config.clone())));
        }

        // 5c. Aether (flow layer: woven filaments + volumetric scattering)
        if config.aether_enabled {
            chain.add(Box::new(AetherFinish::new(config.aether_config.clone())));
        }

        // ===== PHASE 6: FORM REFINEMENT =====
        // Edge and shape definition
        
        // 6. Edge luminance (selective edge brightening for refined forms)
        if config.edge_luminance_enabled {
            chain.add(Box::new(EdgeLuminance::new(config.edge_luminance_config.clone())));
        }

        // ===== PHASE 7: ATMOSPHERIC & SURFACE =====
        // Final spatial and material qualities
        
        // 7a. Atmospheric depth (spatial perspective + fog)
        if config.atmospheric_depth_enabled {
            chain.add(Box::new(AtmosphericDepth::new(config.atmospheric_depth_config.clone())));
        }

        // 7b. Fine texture (surface quality: canvas, linen, etc. - preserves all prior work)
        if config.fine_texture_enabled {
            chain.add(Box::new(FineTexture::new(config.fine_texture_config.clone())));
        }

        chain
    }

    /// Process a frame with the persistent effect chain
    pub fn process_frame(
        &self,
        buffer: PixelBuffer,
        width: usize,
        height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer> {
        self.chain
            .process(buffer, width, height)
            .map_err(|e| RenderError::EffectChain(e.to_string()))
    }
}

/// Configuration for Difference-of-Gaussians bloom
#[derive(Clone, Debug)]
pub struct DogBloomConfig {
    pub inner_sigma: f64, // Base blur radius
    pub outer_ratio: f64, // Outer sigma = inner * ratio (typically 2-3)
    pub strength: f64,    // DoG multiplier (0.2-0.8)
    pub threshold: f64,   // Minimum value to include
}

impl Default for DogBloomConfig {
    fn default() -> Self {
        Self { inner_sigma: 6.0, outer_ratio: 2.5, strength: 0.35, threshold: 0.01 }
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
        Self { target_percentile: 0.95, min_exposure: 0.1, max_exposure: 10.0 }
    }
}

impl ExposureCalculator {
    pub fn calculate_exposure(&self, pixels: &[(f64, f64, f64, f64)]) -> f64 {
        // Compute luminance values
        let luminances: Vec<f64> = pixels
            .par_iter()
            .map(|(r, g, b, a)| {
                // Rec. 709 luminance weights
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                lum * a // Premultiplied
            })
            .filter(|&l| l > 0.0) // Ignore black pixels
            .collect();

        if luminances.is_empty() {
            return 1.0;
        }

        // Find percentile using partial sort
        let mut sorted = luminances;
        let percentile_idx =
            ((sorted.len() as f64 * self.target_percentile) as usize).min(sorted.len() - 1);

        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let percentile_value = sorted[percentile_idx];

        // Calculate exposure to map percentile to ~0.8
        let exposure = 0.8 / percentile_value.max(1e-10);

        // Clamp to reasonable range
        exposure.clamp(self.min_exposure, self.max_exposure)
    }
}

/// Mipmap pyramid for efficient multi-scale filtering
pub struct MipPyramid {
    levels: Vec<Vec<(f64, f64, f64, f64)>>,
    widths: Vec<usize>,
    heights: Vec<usize>,
}

impl MipPyramid {
    pub fn new(base: &[(f64, f64, f64, f64)], width: usize, height: usize, levels: usize) -> Self {
        let mut pyramid =
            MipPyramid { levels: vec![base.to_vec()], widths: vec![width], heights: vec![height] };

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
                    (p00.0 + p01.0 + p10.0 + p11.0) * constants::BILINEAR_AVG_FACTOR,
                    (p00.1 + p01.1 + p10.1 + p11.1) * constants::BILINEAR_AVG_FACTOR,
                    (p00.2 + p01.2 + p10.2 + p11.2) * constants::BILINEAR_AVG_FACTOR,
                    (p00.3 + p01.3 + p10.3 + p11.3) * constants::BILINEAR_AVG_FACTOR,
                );
            });

            pyramid.levels.push(downsampled);
            pyramid.widths.push(new_w);
            pyramid.heights.push(new_h);
        }

        pyramid
    }

}

/// Standalone bilinear upsampling function for arbitrary data
/// Handles premultiplied alpha values correctly
pub fn upsample_bilinear(
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
        // Interpolate premultiplied values directly
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
            let expected_alpha = p00.3 * (1.0 - fx) * (1.0 - fy)
                + p01.3 * fx * (1.0 - fy)
                + p10.3 * (1.0 - fx) * fy
                + p11.3 * fx * fy;
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
        inner_radius / 2, // Adjust for mip level
    );

    // Blur level 2 (quarter resolution) with outer sigma
    let mut blur_outer = pyramid.levels[2].clone();
    parallel_blur_2d_rgba(
        &mut blur_outer,
        pyramid.widths[2],
        pyramid.heights[2],
        outer_radius / 4, // Adjust for mip level
    );

    // Upsample both BLURRED data to original resolution
    let inner_upsampled =
        upsample_bilinear(&blur_inner, pyramid.widths[1], pyramid.heights[1], width, height);
    let outer_upsampled =
        upsample_bilinear(&blur_outer, pyramid.widths[2], pyramid.heights[2], width, height);

    // Compute DoG and apply threshold
    let mut dog_result = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    dog_result
        .par_iter_mut()
        .zip(inner_upsampled.par_iter())
        .zip(outer_upsampled.par_iter())
        .for_each(|((dog, &inner), &outer)| {
            let diff = (inner.0 - outer.0, inner.1 - outer.1, inner.2 - outer.2, inner.3 - outer.3);

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

/// Convert SPD buffer to RGBA
pub(crate) fn convert_spd_buffer_to_rgba(
    src: &[[f64; NUM_BINS]],
    dest: &mut [(f64, f64, f64, f64)],
) {
    assert_eq!(src.len(), dest.len());

    dest.par_iter_mut().zip(src.par_iter()).for_each(|(dest_pixel, src_pixel)| {
        let rgba = spd_to_rgba(src_pixel);
        *dest_pixel = rgba;
    });
}

struct ChampleveFinish {
    config: ChampleveConfig,
}

impl ChampleveFinish {
    fn new(config: ChampleveConfig) -> Self {
        Self { config }
    }
}

impl PostEffect for ChampleveFinish {
    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> std::result::Result<PixelBuffer, Box<dyn std::error::Error>> {
        let mut buffer = input.clone();
        apply_champleve_iridescence(&mut buffer, width, height, &self.config);
        Ok(buffer)
    }
}

struct AetherFinish {
    config: AetherConfig,
}

impl AetherFinish {
    fn new(config: AetherConfig) -> Self {
        Self { config }
    }
}

impl PostEffect for AetherFinish {
    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> std::result::Result<PixelBuffer, Box<dyn std::error::Error>> {
        let mut buffer = input.clone();
        apply_aether_weave(&mut buffer, width, height, &self.config);
        Ok(buffer)
    }
}
