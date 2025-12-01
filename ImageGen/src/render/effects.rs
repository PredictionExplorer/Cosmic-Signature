//! Post-processing effects pipeline
//!
//! This module manages the visual effects chain including bloom, blur, and tone mapping.
//! It provides a configurable pipeline for post-processing rendered frames.

use super::constants;
use super::context::PixelBuffer;
use super::drawing::parallel_blur_2d_rgba;
use super::error::{RenderError, Result};
use crate::post_effects::{
    AtmosphericDepth, AtmosphericDepthConfig, AuroraVeils, AuroraVeilsConfig, AutoExposure,
    ChampleveConfig, Cherenkov, CherenkovConfig, ChromaticBloom, ChromaticBloomConfig,
    CinematicColorGrade, ColorGradeParams, CosmicInk, CosmicInkConfig, CrepuscularRays,
    CrepuscularRaysConfig, DimensionalGlitch, DimensionalGlitchConfig, DogBloom, EdgeLuminance,
    EdgeLuminanceConfig, EventHorizon, EventHorizonConfig, FineTexture, FineTextureConfig,
    GaussianBloom, GlowEnhancement, GlowEnhancementConfig, GradientMap, GradientMapConfig,
    MicroContrast, MicroContrastConfig, Opalescence, OpalescenceConfig, PerceptualBlur,
    PerceptualBlurConfig, PostEffect, PostEffectChain, PrismaticHalos, PrismaticHalosConfig,
    RefractiveCaustics, RefractiveCausticsConfig, VolumetricOcclusion, VolumetricOcclusionConfig,
    aether::AetherConfig, apply_aether_weave, apply_champleve_iridescence,
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
    pub crepuscular_rays_enabled: bool,
    pub crepuscular_rays_config: CrepuscularRaysConfig,
    pub volumetric_occlusion_enabled: bool,
    pub volumetric_occlusion_config: VolumetricOcclusionConfig,
    pub refractive_caustics_enabled: bool,
    pub refractive_caustics_config: RefractiveCausticsConfig,
    pub fine_texture_enabled: bool,
    pub fine_texture_config: FineTextureConfig,

    // New "Masterpiece" physics and artistic effects
    pub event_horizon_enabled: bool,
    pub event_horizon_config: EventHorizonConfig,
    pub cherenkov_enabled: bool,
    pub cherenkov_config: CherenkovConfig,
    pub cosmic_ink_enabled: bool,
    pub cosmic_ink_config: CosmicInkConfig,
    pub aurora_veils_enabled: bool,
    pub aurora_veils_config: AuroraVeilsConfig,
    pub prismatic_halos_enabled: bool,
    pub prismatic_halos_config: PrismaticHalosConfig,
    pub dimensional_glitch_enabled: bool,
    pub dimensional_glitch_config: DimensionalGlitchConfig,
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

        // ===== PHASE 7: ATMOSPHERIC & PHYSICS EFFECTS =====
        // Background and environmental layers (apply early for proper layering)

        // 7a. Aurora Veils (background atmospheric curtains) [NEW - MASTERPIECE]
        if config.aurora_veils_enabled {
            chain.add(Box::new(AuroraVeils::new(config.aurora_veils_config.clone())));
        }

        // 7b. Cosmic Ink (fluid-like space medium) [NEW - MASTERPIECE]
        if config.cosmic_ink_enabled {
            chain.add(Box::new(CosmicInk::new(config.cosmic_ink_config.clone())));
        }

        // ===== PHASE 8: PHYSICS VISUALIZATION =====
        // Effects that reveal the invisible forces

        // 8a. Event Horizon Lensing (gravity distortion) [NEW - MASTERPIECE]
        // Replaces refractive_caustics for thematically superior gravity visualization
        if config.event_horizon_enabled {
            chain.add(Box::new(EventHorizon::new(config.event_horizon_config.clone())));
        } else if config.refractive_caustics_enabled {
            // Legacy fallback: Refractive Caustics (Glass/Gem look)
            chain.add(Box::new(RefractiveCaustics::new(config.refractive_caustics_config.clone())));
        }

        // 8b. Volumetric Occlusion (Self-Shadowing for depth)
        if config.volumetric_occlusion_enabled {
            chain.add(Box::new(VolumetricOcclusion::new(
                config.volumetric_occlusion_config.clone(),
            )));
        }

        // 8c. Crepuscular Rays (God Rays - Light scattering)
        if config.crepuscular_rays_enabled {
            chain.add(Box::new(CrepuscularRays::new(config.crepuscular_rays_config.clone())));
        }

        // ===== PHASE 9: ENERGY & VELOCITY EFFECTS =====
        // High-energy event visualization

        // 9a. Cherenkov Radiation (velocity-based blue glow) [NEW - MASTERPIECE]
        if config.cherenkov_enabled {
            chain.add(Box::new(Cherenkov::new(config.cherenkov_config.clone())));
        }

        // 9b. Prismatic Halos (optical phenomena around bright spots) [NEW - MASTERPIECE]
        if config.prismatic_halos_enabled {
            chain.add(Box::new(PrismaticHalos::new(config.prismatic_halos_config.clone())));
        }

        // ===== PHASE 10: ATMOSPHERIC DEPTH & SURFACE =====
        // Final spatial qualities

        // 10a. Atmospheric depth (spatial perspective + fog)
        if config.atmospheric_depth_enabled {
            chain.add(Box::new(AtmosphericDepth::new(config.atmospheric_depth_config.clone())));
        }

        // 10b. Fine texture (surface quality: canvas, linen, etc. - preserves all prior work)
        if config.fine_texture_enabled {
            chain.add(Box::new(FineTexture::new(config.fine_texture_config.clone())));
        }

        // ===== PHASE 11: DIGITAL AESTHETICS =====
        // Meta-layer: the computational medium itself

        // 11. Dimensional Glitch (digital artifacts at peak energy) [NEW - MASTERPIECE]
        if config.dimensional_glitch_enabled {
            chain.add(Box::new(DimensionalGlitch::new(config.dimensional_glitch_config.clone())));
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

impl Default for EffectConfig {
    fn default() -> Self {
        Self {
            bloom_mode: "dog".to_string(),
            blur_radius_px: 15,
            blur_strength: 10.0,
            blur_core_brightness: 10.0,
            dog_config: DogBloomConfig::default(),
            hdr_mode: "auto".to_string(),
            perceptual_blur_enabled: true,
            perceptual_blur_config: None,
            color_grade_enabled: true,
            color_grade_params: ColorGradeParams::default(),
            gradient_map_enabled: false,
            gradient_map_config: GradientMapConfig::default(),
            champleve_enabled: true,
            champleve_config: ChampleveConfig::default(),
            aether_enabled: false,
            aether_config: AetherConfig::default(),
            chromatic_bloom_enabled: true,
            chromatic_bloom_config: ChromaticBloomConfig::default(),
            opalescence_enabled: false,
            opalescence_config: OpalescenceConfig::default(),
            edge_luminance_enabled: true,
            edge_luminance_config: EdgeLuminanceConfig::default(),
            micro_contrast_enabled: true,
            micro_contrast_config: MicroContrastConfig::default(),
            glow_enhancement_enabled: true,
            glow_enhancement_config: GlowEnhancementConfig::default(),
            atmospheric_depth_enabled: false,
            atmospheric_depth_config: AtmosphericDepthConfig::default(),
            crepuscular_rays_enabled: false,
            crepuscular_rays_config: CrepuscularRaysConfig::default(),
            volumetric_occlusion_enabled: false,
            volumetric_occlusion_config: VolumetricOcclusionConfig::default(),
            refractive_caustics_enabled: false,
            refractive_caustics_config: RefractiveCausticsConfig::default(),
            fine_texture_enabled: false,
            fine_texture_config: FineTextureConfig::default(),

            // New "Masterpiece" effects (disabled by default)
            event_horizon_enabled: false,
            event_horizon_config: EventHorizonConfig::default(),
            cherenkov_enabled: false,
            cherenkov_config: CherenkovConfig::default(),
            cosmic_ink_enabled: false,
            cosmic_ink_config: CosmicInkConfig::default(),
            aurora_veils_enabled: false,
            aurora_veils_config: AuroraVeilsConfig::default(),
            prismatic_halos_enabled: false,
            prismatic_halos_config: PrismaticHalosConfig::default(),
            dimensional_glitch_enabled: false,
            dimensional_glitch_config: DimensionalGlitchConfig::default(),
        }
    }
}

#[allow(dead_code)] // Public API for library consumers
impl EffectConfig {
    /// Create a new builder for EffectConfig.
    ///
    /// The builder pattern allows for fluent, readable configuration construction.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let config = EffectConfig::builder()
    ///     .with_dog_bloom(DogBloomConfig::default())
    ///     .enable_chromatic_bloom(true)
    ///     .with_color_grade(ColorGradeParams::cinematic())
    ///     .build();
    /// ```
    #[must_use]
    pub fn builder() -> EffectConfigBuilder {
        EffectConfigBuilder::new()
    }
}

/// Builder for creating `EffectConfig` instances.
///
/// This builder provides a fluent API for constructing effect configurations,
/// making complex configurations more readable and maintainable.
#[derive(Clone, Debug)]
#[allow(dead_code)] // Public API for library consumers
pub struct EffectConfigBuilder {
    config: EffectConfig,
}

impl Default for EffectConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)] // Public API for library consumers
impl EffectConfigBuilder {
    /// Create a new builder with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self { config: EffectConfig::default() }
    }

    /// Set the bloom mode ("dog", "gaussian", or "none").
    #[must_use]
    pub fn bloom_mode(mut self, mode: impl Into<String>) -> Self {
        self.config.bloom_mode = mode.into();
        self
    }

    /// Configure DoG bloom with the given settings.
    #[must_use]
    pub fn with_dog_bloom(mut self, config: DogBloomConfig) -> Self {
        self.config.bloom_mode = "dog".to_string();
        self.config.dog_config = config;
        self
    }

    /// Set blur parameters.
    #[must_use]
    pub fn blur(mut self, radius_px: usize, strength: f64, core_brightness: f64) -> Self {
        self.config.blur_radius_px = radius_px;
        self.config.blur_strength = strength;
        self.config.blur_core_brightness = core_brightness;
        self
    }

    /// Enable or disable chromatic bloom.
    #[must_use]
    pub fn enable_chromatic_bloom(mut self, enabled: bool) -> Self {
        self.config.chromatic_bloom_enabled = enabled;
        self
    }

    /// Configure chromatic bloom with the given settings.
    #[must_use]
    pub fn with_chromatic_bloom(mut self, config: ChromaticBloomConfig) -> Self {
        self.config.chromatic_bloom_enabled = true;
        self.config.chromatic_bloom_config = config;
        self
    }

    /// Configure color grading with the given parameters.
    #[must_use]
    pub fn with_color_grade(mut self, params: ColorGradeParams) -> Self {
        self.config.color_grade_enabled = true;
        self.config.color_grade_params = params;
        self
    }

    /// Enable or disable color grading.
    #[must_use]
    pub fn enable_color_grade(mut self, enabled: bool) -> Self {
        self.config.color_grade_enabled = enabled;
        self
    }

    /// Configure perceptual blur with the given settings.
    #[must_use]
    pub fn with_perceptual_blur(mut self, config: PerceptualBlurConfig) -> Self {
        self.config.perceptual_blur_enabled = true;
        self.config.perceptual_blur_config = Some(config);
        self
    }

    /// Enable or disable perceptual blur.
    #[must_use]
    pub fn enable_perceptual_blur(mut self, enabled: bool) -> Self {
        self.config.perceptual_blur_enabled = enabled;
        self
    }

    /// Configure champlevé effect with the given settings.
    #[must_use]
    pub fn with_champleve(mut self, config: ChampleveConfig) -> Self {
        self.config.champleve_enabled = true;
        self.config.champleve_config = config;
        self
    }

    /// Enable or disable champlevé effect.
    #[must_use]
    pub fn enable_champleve(mut self, enabled: bool) -> Self {
        self.config.champleve_enabled = enabled;
        self
    }

    /// Configure aether effect with the given settings.
    #[must_use]
    pub fn with_aether(mut self, config: AetherConfig) -> Self {
        self.config.aether_enabled = true;
        self.config.aether_config = config;
        self
    }

    /// Enable or disable aether effect.
    #[must_use]
    pub fn enable_aether(mut self, enabled: bool) -> Self {
        self.config.aether_enabled = enabled;
        self
    }

    /// Configure opalescence effect with the given settings.
    #[must_use]
    pub fn with_opalescence(mut self, config: OpalescenceConfig) -> Self {
        self.config.opalescence_enabled = true;
        self.config.opalescence_config = config;
        self
    }

    /// Enable or disable opalescence effect.
    #[must_use]
    pub fn enable_opalescence(mut self, enabled: bool) -> Self {
        self.config.opalescence_enabled = enabled;
        self
    }

    /// Configure glow enhancement with the given settings.
    #[must_use]
    pub fn with_glow(mut self, config: GlowEnhancementConfig) -> Self {
        self.config.glow_enhancement_enabled = true;
        self.config.glow_enhancement_config = config;
        self
    }

    /// Enable or disable glow enhancement.
    #[must_use]
    pub fn enable_glow(mut self, enabled: bool) -> Self {
        self.config.glow_enhancement_enabled = enabled;
        self
    }

    /// Configure edge luminance with the given settings.
    #[must_use]
    pub fn with_edge_luminance(mut self, config: EdgeLuminanceConfig) -> Self {
        self.config.edge_luminance_enabled = true;
        self.config.edge_luminance_config = config;
        self
    }

    /// Enable or disable edge luminance.
    #[must_use]
    pub fn enable_edge_luminance(mut self, enabled: bool) -> Self {
        self.config.edge_luminance_enabled = enabled;
        self
    }

    /// Configure micro contrast with the given settings.
    #[must_use]
    pub fn with_micro_contrast(mut self, config: MicroContrastConfig) -> Self {
        self.config.micro_contrast_enabled = true;
        self.config.micro_contrast_config = config;
        self
    }

    /// Enable or disable micro contrast.
    #[must_use]
    pub fn enable_micro_contrast(mut self, enabled: bool) -> Self {
        self.config.micro_contrast_enabled = enabled;
        self
    }

    /// Configure gradient mapping with the given settings.
    #[must_use]
    pub fn with_gradient_map(mut self, config: GradientMapConfig) -> Self {
        self.config.gradient_map_enabled = true;
        self.config.gradient_map_config = config;
        self
    }

    /// Enable or disable gradient mapping.
    #[must_use]
    pub fn enable_gradient_map(mut self, enabled: bool) -> Self {
        self.config.gradient_map_enabled = enabled;
        self
    }

    /// Configure atmospheric depth with the given settings.
    #[must_use]
    pub fn with_atmospheric_depth(mut self, config: AtmosphericDepthConfig) -> Self {
        self.config.atmospheric_depth_enabled = true;
        self.config.atmospheric_depth_config = config;
        self
    }

    /// Enable or disable atmospheric depth.
    #[must_use]
    pub fn enable_atmospheric_depth(mut self, enabled: bool) -> Self {
        self.config.atmospheric_depth_enabled = enabled;
        self
    }

    /// Configure fine texture with the given settings.
    #[must_use]
    pub fn with_fine_texture(mut self, config: FineTextureConfig) -> Self {
        self.config.fine_texture_enabled = true;
        self.config.fine_texture_config = config;
        self
    }

    /// Enable or disable fine texture.
    #[must_use]
    pub fn enable_fine_texture(mut self, enabled: bool) -> Self {
        self.config.fine_texture_enabled = enabled;
        self
    }

    /// Set HDR mode ("auto" or "off").
    #[must_use]
    pub fn hdr_mode(mut self, mode: impl Into<String>) -> Self {
        self.config.hdr_mode = mode.into();
        self
    }

    /// Disable all effects (minimal rendering).
    ///
    /// This creates a passthrough chain that returns input unchanged.
    #[must_use]
    pub fn disable_all_effects(mut self) -> Self {
        // Disable bloom and blur
        self.config.bloom_mode = "none".to_string();
        self.config.blur_radius_px = 0;
        // Disable HDR/auto-exposure
        self.config.hdr_mode = "off".to_string();
        // Disable all individual effects
        self.config.chromatic_bloom_enabled = false;
        self.config.perceptual_blur_enabled = false;
        self.config.color_grade_enabled = false;
        self.config.gradient_map_enabled = false;
        self.config.champleve_enabled = false;
        self.config.aether_enabled = false;
        self.config.opalescence_enabled = false;
        self.config.edge_luminance_enabled = false;
        self.config.micro_contrast_enabled = false;
        self.config.glow_enhancement_enabled = false;
        self.config.atmospheric_depth_enabled = false;
        self.config.crepuscular_rays_enabled = false;
        self.config.volumetric_occlusion_enabled = false;
        self.config.refractive_caustics_enabled = false;
        self.config.fine_texture_enabled = false;
        self
    }

    /// Build the final EffectConfig.
    #[must_use]
    pub fn build(self) -> EffectConfig {
        self.config
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_effect_config_default() {
        let config = EffectConfig::default();

        assert_eq!(config.bloom_mode, "dog");
        assert!(config.blur_radius_px > 0);
        assert!(config.perceptual_blur_enabled);
        assert!(config.color_grade_enabled);
    }

    #[test]
    fn test_effect_config_builder_default() {
        let config = EffectConfig::builder().build();
        let default = EffectConfig::default();

        assert_eq!(config.bloom_mode, default.bloom_mode);
        assert_eq!(config.blur_radius_px, default.blur_radius_px);
    }

    #[test]
    fn test_builder_bloom_mode() {
        let config = EffectConfig::builder().bloom_mode("gaussian").build();

        assert_eq!(config.bloom_mode, "gaussian");
    }

    #[test]
    fn test_builder_with_dog_bloom() {
        let dog_config =
            DogBloomConfig { inner_sigma: 10.0, outer_ratio: 3.0, strength: 0.5, threshold: 0.02 };

        let config = EffectConfig::builder().with_dog_bloom(dog_config.clone()).build();

        assert_eq!(config.bloom_mode, "dog");
        assert!((config.dog_config.inner_sigma - 10.0).abs() < 1e-10);
        assert!((config.dog_config.outer_ratio - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_builder_blur_settings() {
        let config = EffectConfig::builder().blur(20, 15.0, 12.0).build();

        assert_eq!(config.blur_radius_px, 20);
        assert!((config.blur_strength - 15.0).abs() < 1e-10);
        assert!((config.blur_core_brightness - 12.0).abs() < 1e-10);
    }

    #[test]
    fn test_builder_enable_chromatic_bloom() {
        let enabled = EffectConfig::builder().enable_chromatic_bloom(true).build();
        assert!(enabled.chromatic_bloom_enabled);

        let disabled = EffectConfig::builder().enable_chromatic_bloom(false).build();
        assert!(!disabled.chromatic_bloom_enabled);
    }

    #[test]
    fn test_builder_disable_all() {
        let config = EffectConfig::builder().disable_all_effects().build();

        assert_eq!(config.bloom_mode, "none");
        assert!(!config.chromatic_bloom_enabled);
        assert!(!config.perceptual_blur_enabled);
        assert!(!config.color_grade_enabled);
        assert!(!config.champleve_enabled);
        assert!(!config.aether_enabled);
        assert!(!config.opalescence_enabled);
        assert!(!config.edge_luminance_enabled);
        assert!(!config.micro_contrast_enabled);
        assert!(!config.glow_enhancement_enabled);
        assert!(!config.atmospheric_depth_enabled);
        assert!(!config.fine_texture_enabled);
    }

    #[test]
    fn test_builder_chaining() {
        let config = EffectConfig::builder()
            .bloom_mode("dog")
            .enable_chromatic_bloom(true)
            .enable_color_grade(true)
            .enable_champleve(false)
            .enable_aether(false)
            .hdr_mode("auto")
            .build();

        assert_eq!(config.bloom_mode, "dog");
        assert!(config.chromatic_bloom_enabled);
        assert!(config.color_grade_enabled);
        assert!(!config.champleve_enabled);
        assert!(!config.aether_enabled);
        assert_eq!(config.hdr_mode, "auto");
    }

    #[test]
    fn test_dog_bloom_config_default() {
        let config = DogBloomConfig::default();

        assert!((config.inner_sigma - 6.0).abs() < 1e-10);
        assert!((config.outer_ratio - 2.5).abs() < 1e-10);
        assert!((config.strength - 0.35).abs() < 1e-10);
        assert!((config.threshold - 0.01).abs() < 1e-10);
    }

    #[test]
    fn test_exposure_calculator_default() {
        let calc = ExposureCalculator::default();

        assert!((calc.target_percentile - 0.95).abs() < 1e-10);
        assert!((calc.min_exposure - 0.1).abs() < 1e-10);
        assert!((calc.max_exposure - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_exposure_calculator_empty_pixels() {
        let calc = ExposureCalculator::default();
        let pixels: Vec<(f64, f64, f64, f64)> = vec![];

        let exposure = calc.calculate_exposure(&pixels);
        assert!((exposure - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_exposure_calculator_uniform_gray() {
        let calc = ExposureCalculator::default();
        let pixels = vec![(0.5, 0.5, 0.5, 1.0); 100];

        let exposure = calc.calculate_exposure(&pixels);
        assert!(exposure > 0.0 && exposure.is_finite());
    }

    #[test]
    fn test_effect_chain_builder_creates_chain() {
        let config = EffectConfig::default();
        let chain = EffectChainBuilder::new(config);

        // Basic test - just verify chain can be created
        let buffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let params = FrameParams { _frame_number: 0, _density: None };

        let result = chain.process_frame(buffer, 10, 10, &params);
        assert!(result.is_ok());
    }

    #[test]
    fn test_upsample_bilinear_identity() {
        // Upsampling to same size should preserve values
        let src = vec![
            (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0),
            (0.0, 0.0, 1.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
        ];

        let result = upsample_bilinear(&src, 2, 2, 2, 2);

        for (orig, res) in src.iter().zip(result.iter()) {
            assert!((orig.0 - res.0).abs() < 0.01);
            assert!((orig.1 - res.1).abs() < 0.01);
            assert!((orig.2 - res.2).abs() < 0.01);
            assert!((orig.3 - res.3).abs() < 0.01);
        }
    }

    #[test]
    fn test_upsample_bilinear_doubles_size() {
        let src = vec![(0.5, 0.5, 0.5, 1.0); 4];
        let result = upsample_bilinear(&src, 2, 2, 4, 4);

        assert_eq!(result.len(), 16);

        // Uniform input should produce uniform output
        for pixel in &result {
            assert!((pixel.0 - 0.5).abs() < 0.1);
        }
    }

    #[test]
    fn test_apply_dog_bloom_uniform() {
        let config = DogBloomConfig::default();
        let input = vec![(0.5, 0.5, 0.5, 1.0); 64 * 64];

        let result = apply_dog_bloom(&input, 64, 64, &config);

        // Uniform input should produce relatively uniform output
        assert_eq!(result.len(), 64 * 64);
        for pixel in &result {
            assert!(pixel.0.is_finite());
            assert!(pixel.1.is_finite());
            assert!(pixel.2.is_finite());
            assert!(pixel.3.is_finite());
        }
    }
}
