//! Unified rendering pipeline configuration builder
//!
//! This module provides a builder pattern for creating effect chains and rendering
//! configurations, eliminating duplication across pass_1, pass_2, and single-frame rendering.

#![allow(dead_code)] // Builder will be used in future main.rs refactoring

use super::effects::{EffectChainBuilder, EffectConfig};
use super::types::{BloomConfig, BlurConfig, Resolution};
use crate::post_effects::{
    AetherConfig, ChampleveConfig, ChromaticBloomConfig, ColorGradeParams,
    GradientMapConfig, LuxuryPalette, NebulaCloudConfig, PerceptualBlurConfig,
};

/// Builder for creating consistent effect chains across all rendering passes
pub struct EffectPipelineBuilder {
    resolution: Resolution,
    blur_config: BlurConfig,
    bloom_config: BloomConfig,
    hdr_mode: String,
    perceptual_blur_enabled: bool,
    perceptual_blur_config: Option<PerceptualBlurConfig>,
    special_mode: bool,
}

impl EffectPipelineBuilder {
    /// Create a new pipeline builder
    pub fn new(resolution: Resolution, special_mode: bool) -> Self {
        let blur_config = if special_mode {
            BlurConfig::special(resolution)
        } else {
            BlurConfig::standard(resolution)
        };
        
        Self {
            resolution,
            blur_config,
            bloom_config: BloomConfig::gaussian(), // Default, will be overridden
            hdr_mode: "auto".to_string(),
            perceptual_blur_enabled: true,
            perceptual_blur_config: None,
            special_mode,
        }
    }
    
    /// Set blur configuration
    pub fn with_blur(mut self, config: BlurConfig) -> Self {
        self.blur_config = config;
        self
    }
    
    /// Set bloom configuration
    pub fn with_bloom(mut self, config: BloomConfig) -> Self {
        self.bloom_config = config;
        self
    }
    
    /// Set HDR mode
    pub fn with_hdr_mode(mut self, mode: String) -> Self {
        self.hdr_mode = mode;
        self
    }
    
    /// Set perceptual blur settings
    pub fn with_perceptual_blur(
        mut self,
        enabled: bool,
        config: Option<PerceptualBlurConfig>,
    ) -> Self {
        self.perceptual_blur_enabled = enabled;
        self.perceptual_blur_config = config;
        self
    }
    
    /// Build the effect chain
    #[allow(dead_code)] // Used in future refactoring to eliminate duplication
    pub fn build(&self) -> EffectChainBuilder {
        let effect_config = EffectConfig {
            bloom_mode: self.bloom_config.mode.clone(),
            blur_radius_px: self.blur_config.radius_px,
            blur_strength: self.blur_config.strength,
            blur_core_brightness: self.blur_config.core_brightness,
            dog_config: self.bloom_config.dog_config.clone(),
            hdr_mode: self.hdr_mode.clone(),
            perceptual_blur_enabled: self.perceptual_blur_enabled,
            perceptual_blur_config: self.perceptual_blur_config.clone(),
            color_grade_enabled: true,
            color_grade_params: ColorGradeParams::from_resolution_and_mode(
                self.resolution.width as usize,
                self.resolution.height as usize,
                self.special_mode,
            ),
            champleve_enabled: true,
            champleve_config: ChampleveConfig::new(self.special_mode),
            aether_enabled: true,
            aether_config: AetherConfig::new(self.special_mode),
            chromatic_bloom_enabled: true,
            chromatic_bloom_config: ChromaticBloomConfig::from_resolution(
                self.resolution.width as usize,
                self.resolution.height as usize,
            ),
            gradient_map_enabled: true,
            gradient_map_config: if self.special_mode {
                GradientMapConfig {
                    palette: LuxuryPalette::GoldPurple,
                    strength: 0.85,
                    hue_preservation: 0.15,
                }
            } else {
                GradientMapConfig {
                    palette: LuxuryPalette::GoldPurple,
                    strength: 0.0,
                    hue_preservation: 1.0,
                }
            },
        };
        
        EffectChainBuilder::new(effect_config)
    }
}

/// Build nebula cloud configuration
pub fn build_nebula_config(
    resolution: Resolution,
    special_mode: bool,
    noise_seed: i32,
) -> NebulaCloudConfig {
    if special_mode {
        NebulaCloudConfig::special_mode(
            resolution.width as usize,
            resolution.height as usize,
            noise_seed,
        )
    } else {
        NebulaCloudConfig::standard_mode(
            resolution.width as usize,
            resolution.height as usize,
            noise_seed,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_builder_default() {
        let res = Resolution::new(1920, 1080);
        let builder = EffectPipelineBuilder::new(res, false);
        
        assert!(!builder.special_mode);
        assert_eq!(builder.hdr_mode, "auto");
        assert!(builder.perceptual_blur_enabled);
    }

    #[test]
    fn test_pipeline_builder_with_customizations() {
        let res = Resolution::new(1920, 1080);
        let blur = BlurConfig::special(res);
        let bloom = BloomConfig::gaussian();
        
        let builder = EffectPipelineBuilder::new(res, true)
            .with_blur(blur)
            .with_bloom(bloom)
            .with_hdr_mode("off".to_string())
            .with_perceptual_blur(false, None);
        
        assert!(builder.special_mode);
        assert_eq!(builder.hdr_mode, "off");
        assert!(!builder.perceptual_blur_enabled);
    }

    #[test]
    fn test_nebula_config_standard() {
        let res = Resolution::new(1920, 1080);
        let _config = build_nebula_config(res, false, 42);
        // Config is created successfully - structure is opaque
    }

    #[test]
    fn test_nebula_config_special() {
        let res = Resolution::new(1920, 1080);
        let _config = build_nebula_config(res, true, 42);
        // Config is created successfully - structure is opaque
    }
}

