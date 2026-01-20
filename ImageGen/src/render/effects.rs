//! Post-processing effects pipeline
//!
//! This module manages the visual effects chain including bloom, blur, and tone mapping.
//! It provides a configurable pipeline for post-processing rendered frames.

use super::constants;
use super::context::PixelBuffer;
use super::drawing::parallel_blur_2d_rgba;
use super::error::{RenderError, Result};
use crate::oklab;
use crate::optim::simd::simd_oklab_to_linear_srgb_batch;
use crate::optim::simd::simd_spd_to_rgba_batch;
use crate::post_effects::{
    AutoExposure, ChampleveConfig, CinematicColorGrade, ColorGradeParams, DogBloom, GaussianBloom,
    PerceptualBlur, PerceptualBlurConfig, PostEffect, PostEffectChain, aether::AetherConfig,
    apply_aether_weave, apply_champleve_iridescence,
    // New museum-quality effects
    AncientManuscript, AncientManuscriptConfig,
    BlackbodyRadiation, BlackbodyConfig,
    DichroicGlass, DichroicGlassConfig,
    Ferrofluid, FerrofluidConfig,
    SpectralInterference, SpectralInterferenceConfig,
    SubsurfaceScattering, SubsurfaceScatteringConfig,
    TemporalEchoes, TemporalEchoesConfig,
    // Cosmic/Physics-inspired museum-quality effects
    Aurora, AuroraConfig,
    CausticNetworks, CausticNetworksConfig,
    DopplerShift, DopplerShiftConfig,
    GravitationalLensing, GravitationalLensingConfig,
    Nebula, NebulaConfig,
};
use crate::post_effects::utils;
use crate::optim::effect_fusion::{FusedEffectConfig, FusedEffectProcessor};
use crate::spectrum::{BIN_RGB, BIN_TONE, NUM_BINS, spd_to_rgba};
use rayon::prelude::*;

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
    pub color_grade_enabled: bool,
    pub color_grade_params: ColorGradeParams,
    pub champleve_enabled: bool,
    pub champleve_config: ChampleveConfig,
    pub aether_enabled: bool,
    pub aether_config: AetherConfig,
    // New museum-quality effects
    pub blackbody_enabled: bool,
    pub blackbody_config: BlackbodyConfig,
    pub subsurface_enabled: bool,
    pub subsurface_config: SubsurfaceScatteringConfig,
    pub dichroic_enabled: bool,
    pub dichroic_config: DichroicGlassConfig,
    pub ferrofluid_enabled: bool,
    pub ferrofluid_config: FerrofluidConfig,
    pub temporal_echoes_enabled: bool,
    pub temporal_echoes_config: TemporalEchoesConfig,
    pub manuscript_enabled: bool,
    pub manuscript_config: AncientManuscriptConfig,
    pub spectral_interference_enabled: bool,
    pub spectral_interference_config: SpectralInterferenceConfig,
    pub fuse_pixel_effects: bool,
    // ═══════════════════════════════════════════════════════════════
    // COSMIC/PHYSICS-INSPIRED MUSEUM-QUALITY EFFECTS
    // ═══════════════════════════════════════════════════════════════
    pub gravitational_lensing_enabled: bool,
    pub gravitational_lensing_config: GravitationalLensingConfig,
    pub caustic_networks_enabled: bool,
    pub caustic_networks_config: CausticNetworksConfig,
    pub doppler_shift_enabled: bool,
    pub doppler_shift_config: DopplerShiftConfig,
    pub aurora_enabled: bool,
    pub aurora_config: AuroraConfig,
    pub nebula_enabled: bool,
    pub nebula_config: NebulaConfig,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectPreset {
    Default,
    Ethereal,
    Metallic,
    Astral,
    Minimal,
}

impl EffectPreset {
    pub fn from_str(value: &str) -> Self {
        match value.to_lowercase().as_str() {
            "ethereal" => Self::Ethereal,
            "metallic" => Self::Metallic,
            "astral" => Self::Astral,
            "minimal" => Self::Minimal,
            _ => Self::Default,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct EffectOverrides {
    pub blackbody_enabled: Option<bool>,
    pub subsurface_enabled: Option<bool>,
    pub dichroic_enabled: Option<bool>,
    pub ferrofluid_enabled: Option<bool>,
    pub temporal_echoes_enabled: Option<bool>,
    pub spectral_interference_enabled: Option<bool>,
    pub aether_enabled: Option<bool>,
    pub champleve_enabled: Option<bool>,
    pub color_grade_enabled: Option<bool>,
    pub perceptual_blur_enabled: Option<bool>,
    pub fuse_pixel_effects: Option<bool>,
    pub manuscript_enabled: Option<bool>,
    // Cosmic/Physics-inspired effects
    pub gravitational_lensing_enabled: Option<bool>,
    pub caustic_networks_enabled: Option<bool>,
    pub doppler_shift_enabled: Option<bool>,
    pub aurora_enabled: Option<bool>,
    pub nebula_enabled: Option<bool>,
}

/// Per-frame parameters that may vary
#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct FrameParams {
    pub frame_number: usize,
    pub density: Option<f64>,
}

/// Persistent effect chain builder
pub struct EffectChainBuilder {
    chain_pre: PostEffectChain,
    chain_post: PostEffectChain,
    #[allow(dead_code)]
    config: EffectConfig,
    fused_processor: Option<FusedEffectProcessor>,
}

impl EffectChainBuilder {
    /// Create a new effect chain builder with given configuration
    pub fn new(config: EffectConfig) -> Self {
        let (chain_pre, chain_post, fused_processor) = Self::build_chain(&config);
        Self { chain_pre, chain_post, config, fused_processor }
    }

    /// Build the effect chain based on configuration
    fn build_chain(
        config: &EffectConfig,
    ) -> (PostEffectChain, PostEffectChain, Option<FusedEffectProcessor>) {
        let mut chain_pre = PostEffectChain::new();
        let mut chain_post = PostEffectChain::new();
        let mut fused_processor = None;

        if config.fuse_pixel_effects {
            let fused_config = FusedEffectConfig {
                blackbody_enabled: config.blackbody_enabled,
                blackbody_strength: config.blackbody_config.strength,
                blackbody_min_temp: config.blackbody_config.min_temperature,
                blackbody_max_temp: config.blackbody_config.max_temperature,
                dichroic_enabled: config.dichroic_enabled,
                dichroic_strength: config.dichroic_config.strength,
                dichroic_primary_shift: config.dichroic_config.primary_hue_shift,
                dichroic_secondary_shift: config.dichroic_config.secondary_hue_shift,
                ferrofluid_enabled: config.ferrofluid_enabled,
                ferrofluid_strength: config.ferrofluid_config.strength,
                ferrofluid_metallic_intensity: config.ferrofluid_config.metallic_intensity,
                spectral_enabled: false,
                spectral_strength: 0.0,
                spectral_frequency: 0.0,
                subsurface_enabled: config.subsurface_enabled,
                subsurface_strength: config.subsurface_config.strength,
                subsurface_warmth: config.subsurface_config.warmth,
            };
            if fused_config.any_enabled() {
                fused_processor = Some(FusedEffectProcessor::new(fused_config));
            }
        }

        // Add blur effect
        if config.blur_radius_px > 0 {
            chain_pre.add(Box::new(GaussianBloom::new(
                config.blur_radius_px,
                config.blur_strength,
                config.blur_core_brightness,
            )))
        }

        // Add bloom effect
        match config.bloom_mode.as_str() {
            "dog" => chain_pre.add(Box::new(DogBloom::new(
                config.dog_config.clone(),
                config.blur_core_brightness,
            ))),
            "gaussian" => {}
            _ => {}
        }

        // Add perceptual blur if enabled
        if config.perceptual_blur_enabled {
            if let Some(blur_config) = &config.perceptual_blur_config {
                chain_pre.add(Box::new(PerceptualBlur::new(blur_config.clone())));
            }
        }

        // Add HDR/auto-exposure
        if config.hdr_mode == "auto" {
            chain_pre.add(Box::new(AutoExposure::default()));
        }

        if config.color_grade_enabled && config.color_grade_params.strength > 0.0 {
            chain_pre.add(Box::new(CinematicColorGrade::new(config.color_grade_params.clone())));
        }

        if config.champleve_enabled {
            chain_pre.add(Box::new(ChampleveFinish::new(config.champleve_config.clone())));
        }

        if config.aether_enabled {
            chain_pre.add(Box::new(AetherFinish::new(config.aether_config.clone())));
        }

        // New museum-quality effects (pixel-local)
        let skip_pixel_local = config.fuse_pixel_effects && fused_processor.is_some();
        if !skip_pixel_local {
            if config.blackbody_enabled {
                chain_pre.add(Box::new(BlackbodyRadiation::new(config.blackbody_config.clone())));
            }

            if config.subsurface_enabled {
                chain_pre.add(Box::new(SubsurfaceScattering::new(config.subsurface_config.clone())));
            }

            if config.dichroic_enabled {
                chain_pre.add(Box::new(DichroicGlass::new(config.dichroic_config.clone())));
            }

            if config.ferrofluid_enabled {
                chain_pre.add(Box::new(Ferrofluid::new(config.ferrofluid_config.clone())));
            }
        }

        if config.temporal_echoes_enabled {
            chain_post.add(Box::new(TemporalEchoes::new(config.temporal_echoes_config.clone())));
        }

        if config.spectral_interference_enabled {
            chain_post
                .add(Box::new(SpectralInterference::new(config.spectral_interference_config.clone())));
        }

        // ═══════════════════════════════════════════════════════════════
        // COSMIC/PHYSICS-INSPIRED MUSEUM-QUALITY EFFECTS
        // These effects create beautiful, scientifically-inspired visuals
        // ═══════════════════════════════════════════════════════════════

        // Gravitational Lensing: Apply early for distortion effects
        // (should be before color effects to distort the base image)
        if config.gravitational_lensing_enabled {
            chain_post.add(Box::new(GravitationalLensing::new(
                config.gravitational_lensing_config.clone(),
            )));
        }

        // Caustic Networks: Light focusing creates brilliant highlights
        if config.caustic_networks_enabled {
            chain_post.add(Box::new(CausticNetworks::new(
                config.caustic_networks_config.clone(),
            )));
        }

        // Doppler Shift: Direction-based color shifting
        if config.doppler_shift_enabled {
            chain_post.add(Box::new(DopplerShift::new(config.doppler_shift_config.clone())));
        }

        // Aurora Borealis: Ethereal color ribbons
        if config.aurora_enabled {
            chain_post.add(Box::new(Aurora::new(config.aurora_config.clone())));
        }

        // Nebula Tendrils: Atmospheric depth and cosmic wisps
        if config.nebula_enabled {
            chain_post.add(Box::new(Nebula::new(config.nebula_config.clone())));
        }

        // Ancient manuscript should be last as it's a complete style transformation
        if config.manuscript_enabled {
            chain_post.add(Box::new(AncientManuscript::new(config.manuscript_config.clone())));
        }

        (chain_pre, chain_post, fused_processor)
    }

    /// Process a frame with the persistent effect chain
    pub fn process_frame(
        &self,
        buffer: PixelBuffer,
        width: usize,
        height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer> {
        utils::reset_gradient_cache();
        let buffer = self
            .chain_pre
            .process(buffer, width, height)
            .map_err(|e| RenderError::EffectChain(e.to_string()))?;

        let mut buffer = buffer;
        if let Some(fused) = &self.fused_processor {
            fused.process_in_place(&mut buffer, width, height);
        }

        self.chain_post
            .process(buffer, width, height)
            .map_err(|e| RenderError::EffectChain(e.to_string()))
    }
}

impl EffectConfig {
    pub fn apply_preset(&mut self, preset: EffectPreset) {
        match preset {
            EffectPreset::Default => {}
            EffectPreset::Ethereal => {
                self.blur_strength = 0.8;
                self.blur_core_brightness = 1.4;
                self.dog_config.strength = 0.25;
                self.aether_enabled = true;
                self.champleve_enabled = false;
                self.blackbody_enabled = true;
                self.blackbody_config.strength = 0.25;
                self.subsurface_enabled = true;
                self.ferrofluid_enabled = false;
                self.dichroic_enabled = false;
                self.temporal_echoes_enabled = true;
                self.spectral_interference_enabled = false;
                self.color_grade_params.vibrance *= 1.1;
                self.color_grade_params.warmth_shift += 0.05;
                // Ethereal cosmic effects
                self.gravitational_lensing_enabled = true;
                self.gravitational_lensing_config.strength = 0.25;
                self.caustic_networks_enabled = false;
                self.doppler_shift_enabled = false;
                self.aurora_enabled = true;
                self.aurora_config.strength = 0.5;
                self.nebula_enabled = true;
                self.nebula_config.strength = 0.45;
            }
            EffectPreset::Metallic => {
                self.blur_strength = 0.45;
                self.blur_core_brightness = 0.9;
                self.aether_enabled = false;
                self.champleve_enabled = false;
                self.blackbody_enabled = false;
                self.subsurface_enabled = false;
                self.ferrofluid_enabled = true;
                self.ferrofluid_config.strength = 0.8;
                self.ferrofluid_config.metallic_intensity = 0.9;
                self.dichroic_enabled = true;
                self.spectral_interference_enabled = true;
                self.temporal_echoes_enabled = false;
                self.color_grade_params.vibrance *= 1.05;
                // Metallic cosmic effects - focus on caustics
                self.gravitational_lensing_enabled = true;
                self.gravitational_lensing_config.strength = 0.4;
                self.caustic_networks_enabled = true;
                self.caustic_networks_config.strength = 0.6;
                self.doppler_shift_enabled = true;
                self.doppler_shift_config.strength = 0.3;
                self.aurora_enabled = false;
                self.nebula_enabled = false;
            }
            EffectPreset::Astral => {
                self.blur_strength = 0.7;
                self.blur_core_brightness = 1.2;
                self.aether_enabled = true;
                self.champleve_enabled = true;
                self.blackbody_enabled = true;
                self.blackbody_config.strength = 0.45;
                self.subsurface_enabled = true;
                self.ferrofluid_enabled = false;
                self.dichroic_enabled = false;
                self.temporal_echoes_enabled = true;
                self.spectral_interference_enabled = true;
                self.spectral_interference_config.strength = 0.35;
                self.color_grade_params.vibrance *= 1.15;
                // Astral preset: Maximum cosmic beauty - all effects enabled
                self.gravitational_lensing_enabled = true;
                self.gravitational_lensing_config.strength = 0.4;
                self.caustic_networks_enabled = true;
                self.caustic_networks_config.strength = 0.5;
                self.doppler_shift_enabled = true;
                self.doppler_shift_config.strength = 0.45;
                self.aurora_enabled = true;
                self.aurora_config.strength = 0.4;
                self.nebula_enabled = true;
                self.nebula_config.strength = 0.4;
            }
            EffectPreset::Minimal => {
                self.blur_strength = 0.2;
                self.blur_core_brightness = 0.6;
                self.bloom_mode = "gaussian".to_string();
                self.perceptual_blur_enabled = false;
                self.aether_enabled = false;
                self.champleve_enabled = false;
                self.blackbody_enabled = false;
                self.subsurface_enabled = false;
                self.dichroic_enabled = false;
                self.ferrofluid_enabled = false;
                self.temporal_echoes_enabled = false;
                self.spectral_interference_enabled = false;
                self.manuscript_enabled = false;
                self.color_grade_params.vibrance *= 0.9;
                // Minimal: disable all cosmic effects
                self.gravitational_lensing_enabled = false;
                self.caustic_networks_enabled = false;
                self.doppler_shift_enabled = false;
                self.aurora_enabled = false;
                self.nebula_enabled = false;
            }
        }
    }

    pub fn apply_overrides(&mut self, overrides: &EffectOverrides) {
        if let Some(value) = overrides.blackbody_enabled {
            self.blackbody_enabled = value;
        }
        if let Some(value) = overrides.subsurface_enabled {
            self.subsurface_enabled = value;
        }
        if let Some(value) = overrides.dichroic_enabled {
            self.dichroic_enabled = value;
        }
        if let Some(value) = overrides.ferrofluid_enabled {
            self.ferrofluid_enabled = value;
        }
        if let Some(value) = overrides.temporal_echoes_enabled {
            self.temporal_echoes_enabled = value;
        }
        if let Some(value) = overrides.spectral_interference_enabled {
            self.spectral_interference_enabled = value;
        }
        if let Some(value) = overrides.aether_enabled {
            self.aether_enabled = value;
        }
        if let Some(value) = overrides.champleve_enabled {
            self.champleve_enabled = value;
        }
        if let Some(value) = overrides.color_grade_enabled {
            self.color_grade_enabled = value;
        }
        if let Some(value) = overrides.perceptual_blur_enabled {
            self.perceptual_blur_enabled = value;
        }
        if let Some(value) = overrides.fuse_pixel_effects {
            self.fuse_pixel_effects = value;
        }
        if let Some(value) = overrides.manuscript_enabled {
            self.manuscript_enabled = value;
        }
        // Cosmic/Physics-inspired effects
        if let Some(value) = overrides.gravitational_lensing_enabled {
            self.gravitational_lensing_enabled = value;
        }
        if let Some(value) = overrides.caustic_networks_enabled {
            self.caustic_networks_enabled = value;
        }
        if let Some(value) = overrides.doppler_shift_enabled {
            self.doppler_shift_enabled = value;
        }
        if let Some(value) = overrides.aurora_enabled {
            self.aurora_enabled = value;
        }
        if let Some(value) = overrides.nebula_enabled {
            self.nebula_enabled = value;
        }
    }
}

impl Default for EffectConfig {
    fn default() -> Self {
        Self {
            bloom_mode: "gaussian".to_string(),
            blur_radius_px: 8,
            blur_strength: 0.5,
            blur_core_brightness: 1.0,
            dog_config: DogBloomConfig::default(),
            hdr_mode: "off".to_string(),
            perceptual_blur_enabled: false,
            perceptual_blur_config: None,
            color_grade_enabled: true,
            color_grade_params: ColorGradeParams::default(),
            champleve_enabled: false,
            champleve_config: ChampleveConfig::default(),
            aether_enabled: true,
            aether_config: AetherConfig::default(),
            // ═══════════════════════════════════════════════════════════════
            // MUSEUM-QUALITY EFFECTS - Curated defaults for maximum beauty
            // ═══════════════════════════════════════════════════════════════
            
            // Blackbody: Subtle temperature-based coloring adds physical realism
            blackbody_enabled: true,
            blackbody_config: BlackbodyConfig {
                strength: 0.35,  // Subtle - enhances without overwhelming
                min_temperature: 2200.0,   // Warm candlelight
                max_temperature: 9500.0,   // Cool daylight blue
                preserve_luminance: true,
                blend_mode: "overlay".to_string(),
            },
            
            // Subsurface Scattering: Creates beautiful volumetric depth
            subsurface_enabled: true,
            subsurface_config: SubsurfaceScatteringConfig {
                strength: 0.30,  // Gentle translucency
                scatter_radius_scale: 0.018,
                warmth: 0.25,
                transmission: 0.55,
                falloff: 2.2,
                scatter_saturation: 1.15,
            },
            
            // Dichroic Glass: Iridescent color shifts for jewel-like quality
            dichroic_enabled: true,
            dichroic_config: DichroicGlassConfig {
                strength: 0.28,  // Subtle iridescence
                primary_hue_shift: 35.0,
                secondary_hue_shift: -45.0,
                angle_sensitivity: 0.7,
                iridescence_frequency: 2.5,
                preserve_luminance: true,
            },
            
            // Ferrofluid: Metallic highlights for dimensionality
            ferrofluid_enabled: true,
            ferrofluid_config: FerrofluidConfig {
                strength: 0.22,  // Subtle metallic sheen
                metallic_intensity: 0.5,
                spike_sharpness: 2.5,
                reflectivity: 0.45,
                reflection_tint: [0.97, 0.95, 0.92],  // Neutral silver
                environment_intensity: 0.2,
            },
            
            // Temporal Echoes: Ghostly depth for sense of motion history
            temporal_echoes_enabled: true,
            temporal_echoes_config: TemporalEchoesConfig {
                strength: 0.25,  // Subtle ghosting
                num_echoes: 2,
                opacity_falloff: 0.4,
                offset_scale: 0.012,
                color_shift: 0.12,
                blur_per_echo: 0.25,
                flow_direction: std::f64::consts::FRAC_PI_4,
            },
            
            // Spectral Interference: Physical optics for rainbow caustics
            spectral_interference_enabled: true,
            spectral_interference_config: SpectralInterferenceConfig {
                strength: 0.22,  // Subtle interference patterns
                frequency: 35.0,
                phase_variation: 0.4,
                color_separation: 0.25,
                show_constructive: true,
                show_destructive: true,
                thickness_variation: 0.5,
            },
            
            // Ancient Manuscript: DISABLED by default (complete style override)
            manuscript_enabled: false,
            manuscript_config: AncientManuscriptConfig::default(),

            // Fuse pixel-local effects to reduce passes
            fuse_pixel_effects: true,

            // ═══════════════════════════════════════════════════════════════
            // COSMIC/PHYSICS-INSPIRED MUSEUM-QUALITY EFFECTS
            // These create the stunning, gallery-worthy visual impact
            // ═══════════════════════════════════════════════════════════════

            // Gravitational Lensing: Subtle light distortion around dense regions
            // Creates the "gravity is visible" effect - essential for physics authenticity
            gravitational_lensing_enabled: true,
            gravitational_lensing_config: GravitationalLensingConfig {
                strength: 0.35,
                distortion_radius: 0.08,
                density_sensitivity: 2.5,
                falloff_exponent: 1.5,
                chromatic_aberration: true,
                chromatic_strength: 0.3,
            },

            // Caustic Networks: Sharp light focusing at curvature maxima
            // Creates dramatic, jewel-like brilliance where light concentrates
            caustic_networks_enabled: true,
            caustic_networks_config: CausticNetworksConfig {
                strength: 0.45,
                curvature_threshold: 0.15,
                sharpness: 3.0,
                warmth: 0.3,
                rainbow_dispersion: true,
                dispersion_strength: 0.4,
                glow_radius: 0.02,
            },

            // Relativistic Doppler Shift: Direction-based blue/red shifting
            // Approaching regions blue-shift, receding red-shift - scientifically accurate
            doppler_shift_enabled: true,
            doppler_shift_config: DopplerShiftConfig {
                strength: 0.40,
                blue_shift_intensity: 0.7,
                red_shift_intensity: 0.6,
                velocity_sensitivity: 1.5,
                preserve_luminance: true,
                approach_direction: -std::f64::consts::FRAC_PI_4,
                transition_smoothness: 0.3,
            },

            // Aurora Borealis Ribbons: Ethereal flowing color bands
            // Creates organic, dancing light reminiscent of northern lights
            aurora_enabled: true,
            aurora_config: AuroraConfig {
                strength: 0.38,
                num_ribbons: 4,
                wave_frequency: 8.0,
                wave_amplitude: 0.03,
                ribbon_width: 0.025,
                color_intensity: 0.85,
                perpendicular: true,
                shimmer_phase: 0.0,
                edge_softness: 0.6,
            },

            // Nebula Tendrils: Atmospheric depth with wispy extensions
            // Adds cosmic grandeur and volumetric quality
            nebula_enabled: true,
            nebula_config: NebulaConfig {
                strength: 0.35,
                tendril_reach: 0.15,
                octaves: 4,
                persistence: 0.5,
                noise_scale: 3.0,
                hue_variation: 0.3,
                follow_gradient: true,
                dust_opacity: 0.6,
                emission_intensity: 0.4,
                color_temperature: 0.4,
            },
        }
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

    #[allow(dead_code)]
    pub fn upsample_bilinear(
        &self,
        level: usize,
        target_w: usize,
        target_h: usize,
    ) -> Vec<(f64, f64, f64, f64)> {
        let src = &self.levels[level];
        let src_w = self.widths[level];
        let src_h = self.heights[level];
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

            // Get source pixels
            let p00 = src[y0 * src_w + x0];
            let p01 = src[y0 * src_w + x1];
            let p10 = src[y1 * src_w + x0];
            let p11 = src[y1 * src_w + x1];

            // Proper premultiplied alpha interpolation
            // First interpolate premultiplied colors normally
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

            // Renormalize if needed for very low alpha to avoid color bleeding
            if pixel.3 > 0.0 && pixel.3 < 0.01 {
                let scale = pixel.3
                    / (p00.3 * (1.0 - fx) * (1.0 - fy)
                        + p01.3 * fx * (1.0 - fy)
                        + p10.3 * (1.0 - fx) * fy
                        + p11.3 * fx * fy)
                        .max(1e-10);
                pixel.0 *= scale;
                pixel.1 *= scale;
                pixel.2 *= scale;
            }
        });

        result
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

    let bin_rgb = &*BIN_RGB;
    let bin_tone = &*BIN_TONE;
    let len = src.len();
    let simd_len = len / 4 * 4;

    if simd_len > 0 {
        dest[..simd_len]
            .par_chunks_mut(4)
            .zip(src[..simd_len].par_chunks(4))
            .for_each(|(dest_chunk, src_chunk)| {
                let batch = [src_chunk[0], src_chunk[1], src_chunk[2], src_chunk[3]];
                let rgba = simd_spd_to_rgba_batch(&batch, bin_rgb, bin_tone);
                dest_chunk.copy_from_slice(&rgba);
            });
    }

    for i in simd_len..len {
        dest[i] = spd_to_rgba(&src[i]);
    }
}

/// Convert accumulation buffer from OKLab to RGB color space
pub(crate) fn convert_accum_buffer_to_rgb(
    buffer: &[(f64, f64, f64, f64)],
) -> Vec<(f64, f64, f64, f64)> {
    let mut output = vec![(0.0, 0.0, 0.0, 0.0); buffer.len()];
    let len = buffer.len();
    let simd_len = len / 4 * 4;

    if simd_len > 0 {
        simd_oklab_to_linear_srgb_batch(&buffer[..simd_len], &mut output[..simd_len]);
    }

    for i in simd_len..len {
        let (l, a, b, alpha) = buffer[i];
        if alpha > 0.0 {
            // Divide by alpha to get actual OKLab values
            let (r, g, b_val) = oklab::oklab_to_linear_srgb(l / alpha, a / alpha, b / alpha);
            // Keep premultiplied alpha
            output[i] = (r * alpha, g * alpha, b_val * alpha, alpha);
        } else {
            output[i] = (0.0, 0.0, 0.0, 0.0);
        }
    }

    output
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
    fn name(&self) -> &str {
        "Champleve Iridescence"
    }

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
    fn name(&self) -> &str {
        "Woven Aether"
    }

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
