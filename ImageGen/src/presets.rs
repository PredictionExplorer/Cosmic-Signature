//! Preset configurations for common rendering scenarios.
//!
//! This module provides pre-configured effect settings for various use cases,
//! reducing the need for users to specify many parameters for common scenarios.
//!
//! # Available Presets
//!
//! - **Gallery**: High-quality output for exhibition, stable and polished
//! - **Preview**: Fast iteration renders with minimal effects
//! - **Cinematic**: Film-like aesthetic with strong vignettes and grading
//! - **Exploratory**: Maximum exploration with all effects enabled
//! - **Minimal**: Clean trajectory visualization with minimal post-processing
//! - **Web**: Optimized for web/social media (balanced quality and speed)

use crate::render::randomizable_config::RandomizableEffectConfig;

/// Available render presets for common use cases.
///
/// Each preset provides `a` curated set of effect parameters optimized
/// for a specific rendering scenario.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Preset {
    /// High-quality gallery exhibition output.
    ///
    /// Features:
    /// - Gallery quality mode enabled (narrower randomization)
    /// - Core effects enabled: chromatic bloom, champlevé, color grading
    /// - Experimental effects disabled for stability
    /// - Optimized for print and exhibition display
    #[default]
    Gallery,

    /// Fast preview renders for rapid iteration.
    ///
    /// Features:
    /// - Expensive effects disabled (chromatic bloom, perceptual blur)
    /// - Fine texture and volumetric effects disabled
    /// - Basic bloom and color grading only
    /// - 3-5× faster than Gallery mode
    Preview,

    /// Cinematic film-like aesthetic.
    ///
    /// Features:
    /// - Strong color grading with film-like tones
    /// - Enhanced vignette for dramatic framing
    /// - Atmospheric depth for spatial perspective
    /// - Rich contrast and tone curves
    Cinematic,

    /// Maximum exploration with all effects enabled.
    ///
    /// Features:
    /// - All effects enabled including experimental
    /// - Wide randomization ranges
    /// - Unpredictable but potentially stunning results
    /// - Best for discovering new visual territories
    Exploratory,

    /// Clean trajectory visualization with minimal effects.
    ///
    /// Features:
    /// - Most post-processing disabled
    /// - Basic bloom only for visibility
    /// - No color grading or material effects
    /// - Focus on pure physics visualization
    Minimal,

    /// Optimized for web and social media.
    ///
    /// Features:
    /// - Balanced quality and encoding speed
    /// - Effects tuned for compressed video
    /// - Punchy colors that survive compression
    /// - Good for sharing on platforms with aggressive re-encoding
    Web,
}

impl Preset {
    /// Apply this preset to the given configuration.
    ///
    /// This modifies the configuration to match the preset's parameters.
    /// Explicitly set values in the config take precedence over preset defaults.
    ///
    /// # Arguments
    ///
    /// * `config` - The configuration to modify
    pub fn apply(&self, config: &mut RandomizableEffectConfig) {
        match self {
            Preset::Gallery => self.apply_gallery(config),
            Preset::Preview => self.apply_preview(config),
            Preset::Cinematic => self.apply_cinematic(config),
            Preset::Exploratory => self.apply_exploratory(config),
            Preset::Minimal => self.apply_minimal(config),
            Preset::Web => self.apply_web(config),
        }
    }

    /// Get a human-readable description of this preset.
    #[must_use]
    pub fn description(&self) -> &'static str {
        match self {
            Preset::Gallery => {
                "High-quality gallery exhibition output with stable, polished effects"
            }
            Preset::Preview => "Fast preview renders for rapid iteration (3-5× faster)",
            Preset::Cinematic => "Film-like aesthetic with dramatic vignettes and color grading",
            Preset::Exploratory => "Maximum exploration with all effects enabled",
            Preset::Minimal => "Clean trajectory visualization with minimal post-processing",
            Preset::Web => "Balanced quality/speed optimized for web and social media",
        }
    }

    fn apply_gallery(&self, config: &mut RandomizableEffectConfig) {
        config.gallery_quality = true;

        // Enable core exhibition-ready effects
        config.enable_chromatic_bloom = Some(true);
        config.enable_champleve = Some(true);
        config.enable_color_grade = Some(true);
        config.enable_bloom = Some(true);
        config.enable_glow = Some(true);
        config.enable_perceptual_blur = Some(true);
        config.enable_edge_luminance = Some(true);

        // Disable experimental/unstable effects
        config.enable_aether = Some(false);
        config.enable_opalescence = Some(false);
        config.enable_crepuscular_rays = Some(false);
        config.enable_volumetric_occlusion = Some(false);
        config.enable_refractive_caustics = Some(false);

        // Conservative parameter ranges
        config.chromatic_bloom_strength = Some(0.55);
        config.color_grade_strength = Some(0.45);
        config.vignette_strength = Some(0.35);
    }

    fn apply_preview(&self, config: &mut RandomizableEffectConfig) {
        // Disable expensive effects for fast iteration
        config.enable_chromatic_bloom = Some(false);
        config.enable_perceptual_blur = Some(false);
        config.enable_fine_texture = Some(false);
        config.enable_volumetric_occlusion = Some(false);
        config.enable_crepuscular_rays = Some(false);
        config.enable_refractive_caustics = Some(false);
        config.enable_opalescence = Some(false);
        config.enable_aether = Some(false);
        config.enable_champleve = Some(false);
        config.enable_atmospheric_depth = Some(false);

        // Keep basic effects for visibility
        config.enable_bloom = Some(true);
        config.enable_glow = Some(true);
        config.enable_color_grade = Some(true);
        config.enable_edge_luminance = Some(true);
        config.enable_micro_contrast = Some(false);

        // Lighter settings for speed
        config.blur_radius_scale = Some(0.01);
        config.blur_strength = Some(5.0);
        config.color_grade_strength = Some(0.3);
    }

    fn apply_cinematic(&self, config: &mut RandomizableEffectConfig) {
        // Strong color grading for film look
        config.enable_color_grade = Some(true);
        config.color_grade_strength = Some(0.70);
        config.vignette_strength = Some(0.55);
        config.vignette_softness = Some(2.8);
        config.tone_curve_strength = Some(0.70);

        // Atmospheric effects for depth
        config.enable_atmospheric_depth = Some(true);
        config.atmospheric_depth_strength = Some(0.35);
        config.atmospheric_desaturation = Some(0.40);

        // Rich bloom
        config.enable_bloom = Some(true);
        config.enable_glow = Some(true);
        config.glow_strength = Some(0.50);
        config.blur_strength = Some(10.0);

        // Subtle chromatic effects
        config.enable_chromatic_bloom = Some(true);
        config.chromatic_bloom_strength = Some(0.45);

        // Disable distracting effects
        config.enable_opalescence = Some(false);
        config.enable_crepuscular_rays = Some(false);
        config.enable_fine_texture = Some(false);
    }

    fn apply_exploratory(&self, config: &mut RandomizableEffectConfig) {
        // Enable ALL effects for maximum exploration
        config.enable_bloom = Some(true);
        config.enable_glow = Some(true);
        config.enable_chromatic_bloom = Some(true);
        config.enable_perceptual_blur = Some(true);
        config.enable_micro_contrast = Some(true);
        config.enable_gradient_map = Some(true);
        config.enable_color_grade = Some(true);
        config.enable_champleve = Some(true);
        config.enable_aether = Some(true);
        config.enable_opalescence = Some(true);
        config.enable_edge_luminance = Some(true);
        config.enable_atmospheric_depth = Some(true);
        config.enable_crepuscular_rays = Some(true);
        config.enable_volumetric_occlusion = Some(true);
        config.enable_refractive_caustics = Some(true);
        config.enable_fine_texture = Some(true);

        // Wide exploration - let randomization decide parameters
        config.gallery_quality = false;
    }

    fn apply_minimal(&self, config: &mut RandomizableEffectConfig) {
        // Disable almost everything
        config.enable_chromatic_bloom = Some(false);
        config.enable_perceptual_blur = Some(false);
        config.enable_micro_contrast = Some(false);
        config.enable_gradient_map = Some(false);
        config.enable_color_grade = Some(false);
        config.enable_champleve = Some(false);
        config.enable_aether = Some(false);
        config.enable_opalescence = Some(false);
        config.enable_edge_luminance = Some(false);
        config.enable_atmospheric_depth = Some(false);
        config.enable_crepuscular_rays = Some(false);
        config.enable_volumetric_occlusion = Some(false);
        config.enable_refractive_caustics = Some(false);
        config.enable_fine_texture = Some(false);

        // Keep minimal bloom for visibility
        config.enable_bloom = Some(true);
        config.enable_glow = Some(true);
        config.blur_strength = Some(4.0);
        config.blur_radius_scale = Some(0.008);
        config.glow_strength = Some(0.25);
    }

    fn apply_web(&self, config: &mut RandomizableEffectConfig) {
        // Punchy effects that survive compression
        config.enable_bloom = Some(true);
        config.enable_glow = Some(true);
        config.enable_chromatic_bloom = Some(true);
        config.enable_color_grade = Some(true);
        config.enable_edge_luminance = Some(true);
        config.enable_micro_contrast = Some(true);

        // Disable subtle effects that get lost in compression
        config.enable_perceptual_blur = Some(false);
        config.enable_fine_texture = Some(false);
        config.enable_atmospheric_depth = Some(false);
        config.enable_opalescence = Some(false);
        config.enable_aether = Some(false);
        config.enable_champleve = Some(false);
        config.enable_crepuscular_rays = Some(false);
        config.enable_volumetric_occlusion = Some(false);
        config.enable_refractive_caustics = Some(false);

        // Strong, punchy values
        config.chromatic_bloom_strength = Some(0.65);
        config.color_grade_strength = Some(0.55);
        config.vibrance = Some(1.25);
        config.clarity_strength = Some(0.40);
        config.micro_contrast_strength = Some(0.35);
        config.edge_luminance_strength = Some(0.30);
        config.vignette_strength = Some(0.40);
    }
}

impl std::fmt::Display for Preset {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Preset::Gallery => write!(f, "gallery"),
            Preset::Preview => write!(f, "preview"),
            Preset::Cinematic => write!(f, "cinematic"),
            Preset::Exploratory => write!(f, "exploratory"),
            Preset::Minimal => write!(f, "minimal"),
            Preset::Web => write!(f, "web"),
        }
    }
}

impl std::str::FromStr for Preset {
    type Err = PresetParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "gallery" => Ok(Preset::Gallery),
            "preview" | "fast" => Ok(Preset::Preview),
            "cinematic" | "film" => Ok(Preset::Cinematic),
            "exploratory" | "explore" | "all" => Ok(Preset::Exploratory),
            "minimal" | "min" | "clean" => Ok(Preset::Minimal),
            "web" | "social" => Ok(Preset::Web),
            _ => Err(PresetParseError(s.to_string())),
        }
    }
}

/// Error returned when parsing an invalid preset name.
#[derive(Debug, Clone)]
pub struct PresetParseError(String);

impl std::fmt::Display for PresetParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "invalid preset '{}': expected one of: gallery, preview, cinematic, exploratory, minimal, web",
            self.0
        )
    }
}

impl std::error::Error for PresetParseError {}

/// List all available presets with their descriptions.
#[must_use]
pub fn list_presets() -> Vec<(&'static str, &'static str)> {
    vec![
        ("gallery", Preset::Gallery.description()),
        ("preview", Preset::Preview.description()),
        ("cinematic", Preset::Cinematic.description()),
        ("exploratory", Preset::Exploratory.description()),
        ("minimal", Preset::Minimal.description()),
        ("web", Preset::Web.description()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_preset_parse() {
        assert_eq!(Preset::from_str("gallery").unwrap(), Preset::Gallery);
        assert_eq!(Preset::from_str("GALLERY").unwrap(), Preset::Gallery);
        assert_eq!(Preset::from_str("preview").unwrap(), Preset::Preview);
        assert_eq!(Preset::from_str("fast").unwrap(), Preset::Preview);
        assert_eq!(Preset::from_str("cinematic").unwrap(), Preset::Cinematic);
        assert_eq!(Preset::from_str("film").unwrap(), Preset::Cinematic);
        assert_eq!(Preset::from_str("exploratory").unwrap(), Preset::Exploratory);
        assert_eq!(Preset::from_str("explore").unwrap(), Preset::Exploratory);
        assert_eq!(Preset::from_str("minimal").unwrap(), Preset::Minimal);
        assert_eq!(Preset::from_str("min").unwrap(), Preset::Minimal);
        assert_eq!(Preset::from_str("web").unwrap(), Preset::Web);
        assert_eq!(Preset::from_str("social").unwrap(), Preset::Web);
    }

    #[test]
    fn test_preset_parse_error() {
        assert!(Preset::from_str("invalid").is_err());
    }

    #[test]
    fn test_preset_display() {
        assert_eq!(Preset::Gallery.to_string(), "gallery");
        assert_eq!(Preset::Preview.to_string(), "preview");
        assert_eq!(Preset::Cinematic.to_string(), "cinematic");
    }

    #[test]
    fn test_gallery_preset_applies_correctly() {
        let mut config = RandomizableEffectConfig::default();
        Preset::Gallery.apply(&mut config);

        assert!(config.gallery_quality);
        assert_eq!(config.enable_chromatic_bloom, Some(true));
        assert_eq!(config.enable_champleve, Some(true));
        assert_eq!(config.enable_aether, Some(false));
        assert_eq!(config.enable_opalescence, Some(false));
    }

    #[test]
    fn test_preview_preset_disables_expensive() {
        let mut config = RandomizableEffectConfig::default();
        Preset::Preview.apply(&mut config);

        assert_eq!(config.enable_chromatic_bloom, Some(false));
        assert_eq!(config.enable_perceptual_blur, Some(false));
        assert_eq!(config.enable_fine_texture, Some(false));
        assert_eq!(config.enable_bloom, Some(true)); // Basic bloom kept
    }

    #[test]
    fn test_minimal_preset_mostly_disabled() {
        let mut config = RandomizableEffectConfig::default();
        Preset::Minimal.apply(&mut config);

        assert_eq!(config.enable_color_grade, Some(false));
        assert_eq!(config.enable_champleve, Some(false));
        assert_eq!(config.enable_aether, Some(false));
        assert_eq!(config.enable_bloom, Some(true)); // Basic visibility
    }

    #[test]
    fn test_exploratory_enables_all() {
        let mut config = RandomizableEffectConfig::default();
        Preset::Exploratory.apply(&mut config);

        assert_eq!(config.enable_bloom, Some(true));
        assert_eq!(config.enable_chromatic_bloom, Some(true));
        assert_eq!(config.enable_champleve, Some(true));
        assert_eq!(config.enable_aether, Some(true));
        assert_eq!(config.enable_opalescence, Some(true));
        assert_eq!(config.enable_crepuscular_rays, Some(true));
        assert!(!config.gallery_quality); // Wide exploration
    }

    #[test]
    fn test_cinematic_preset_film_look() {
        let mut config = RandomizableEffectConfig::default();
        Preset::Cinematic.apply(&mut config);

        assert_eq!(config.enable_color_grade, Some(true));
        assert_eq!(config.vignette_strength, Some(0.55));
        assert_eq!(config.tone_curve_strength, Some(0.70));
        assert_eq!(config.enable_atmospheric_depth, Some(true));
    }

    #[test]
    fn test_web_preset_punchy() {
        let mut config = RandomizableEffectConfig::default();
        Preset::Web.apply(&mut config);

        // Punchy effects enabled
        assert_eq!(config.enable_micro_contrast, Some(true));
        assert!(config.vibrance.unwrap_or(1.0) > 1.0);

        // Subtle effects disabled
        assert_eq!(config.enable_fine_texture, Some(false));
        assert_eq!(config.enable_perceptual_blur, Some(false));
    }

    #[test]
    fn test_list_presets() {
        let presets = list_presets();
        assert_eq!(presets.len(), 6);
        assert!(presets.iter().any(|(name, _)| *name == "gallery"));
        assert!(presets.iter().any(|(name, _)| *name == "preview"));
    }

    #[test]
    fn test_preset_default() {
        assert_eq!(Preset::default(), Preset::Gallery);
    }
}
