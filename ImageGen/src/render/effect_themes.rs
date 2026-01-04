//! Effect Theme System for Museum-Quality Output
//!
//! This module provides predefined effect themes that coordinate multiple effects
//! for cohesive, professional aesthetics. Instead of enabling effects independently,
//! themes ensure complementary combinations that produce harmonious results.
//!
//! # Design Philosophy
//!
//! Each theme defines:
//! - Which effects to enable/disable
//! - Relative strength adjustments for coordinated look
//! - Effect parameter biases for the theme's aesthetic
//!
//! Themes prevent conflicting effect combinations (e.g., heavy volumetric occlusion
//! with subtle chromatic bloom) that can produce muddy or confusing visuals.

use crate::sim::Sha3RandomByteStream;

/// Predefined effect themes for cohesive aesthetics.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub enum EffectTheme {
    /// Ethereal: Soft, dreamy, luminous
    /// High: Halation, Chromatic Bloom, Perceptual Blur
    /// Low: Micro Contrast, Fine Texture, Volumetric Occlusion
    Ethereal,

    /// Dramatic: High contrast, bold shadows, cinematic
    /// High: Volumetric Occlusion, Crepuscular Rays, Dodge & Burn
    /// Low: Chromatic Bloom, Perceptual Blur
    Dramatic,

    /// Cinematic: Film-like, warm, textured
    /// High: Color Grade, Fine Texture, Halation, Vignette
    /// Medium: Atmospheric Depth
    /// Low: Dimensional Glitch
    Cinematic,

    /// Cosmic: Deep space, nebulae, aurora
    /// High: Deep Space, Nebula, Aurora Veils, Chromatic Bloom
    /// Medium: Cosmic Ink
    /// Low: Fine Texture, Micro Contrast
    Cosmic,

    /// Minimal: Clean, subtle, elegant
    /// High: Gradient Map
    /// Low: Most effects, subtle strengths only
    Minimal,

    /// Balanced: A moderate mix of all effect types
    /// Medium: Most effects at moderate strength
    Balanced,

    /// Random: Let the randomizer decide (no theme constraints)
    Random,
}

impl EffectTheme {
    /// Select a random theme based on RNG
    pub fn random(rng: &mut Sha3RandomByteStream) -> Self {
        let idx = (rng.next_f64() * 6.0) as usize;
        match idx {
            0 => EffectTheme::Ethereal,
            1 => EffectTheme::Dramatic,
            2 => EffectTheme::Cinematic,
            3 => EffectTheme::Cosmic,
            4 => EffectTheme::Minimal,
            _ => EffectTheme::Balanced,
        }
    }

    /// Select a theme weighted toward more visually interesting options
    pub fn random_gallery(rng: &mut Sha3RandomByteStream) -> Self {
        // Gallery mode prefers themes that produce striking results
        let val = rng.next_f64();
        if val < 0.25 {
            EffectTheme::Cinematic
        } else if val < 0.45 {
            EffectTheme::Ethereal
        } else if val < 0.60 {
            EffectTheme::Cosmic
        } else if val < 0.75 {
            EffectTheme::Dramatic
        } else if val < 0.90 {
            EffectTheme::Balanced
        } else {
            EffectTheme::Minimal
        }
    }

    /// Get human-readable name
    pub fn name(&self) -> &'static str {
        match self {
            EffectTheme::Ethereal => "Ethereal",
            EffectTheme::Dramatic => "Dramatic",
            EffectTheme::Cinematic => "Cinematic",
            EffectTheme::Cosmic => "Cosmic",
            EffectTheme::Minimal => "Minimal",
            EffectTheme::Balanced => "Balanced",
            EffectTheme::Random => "Random",
        }
    }
}

/// Effect strength modifier for a theme.
/// Values are multipliers: 1.0 = default, 0.5 = half strength, 2.0 = double
#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct ThemeModifiers {
    // Bloom & Glow effects
    pub bloom_multiplier: f64,
    pub glow_multiplier: f64,
    pub chromatic_bloom_multiplier: f64,
    pub halation_multiplier: f64,

    // Atmospheric effects
    pub atmospheric_depth_multiplier: f64,
    pub volumetric_occlusion_multiplier: f64,
    pub crepuscular_rays_multiplier: f64,
    pub nebula_multiplier: f64,
    pub aurora_veils_multiplier: f64,
    pub deep_space_multiplier: f64,

    // Detail effects
    pub micro_contrast_multiplier: f64,
    pub fine_texture_multiplier: f64,
    pub perceptual_blur_multiplier: f64,

    // Color effects
    pub color_grade_multiplier: f64,
    pub gradient_map_multiplier: f64,

    // Other effects
    pub dodge_burn_multiplier: f64,
    pub vignette_multiplier: f64,
    pub cosmic_ink_multiplier: f64,
    pub opalescence_multiplier: f64,
    pub edge_luminance_multiplier: f64,

    // Effect enable probabilities (0.0 = disabled, 1.0 = always on)
    pub enable_chromatic_bloom: Option<f64>,
    pub enable_halation: Option<f64>,
    pub enable_volumetric_occlusion: Option<f64>,
    pub enable_aurora_veils: Option<f64>,
    pub enable_crepuscular_rays: Option<f64>,
    pub enable_cosmic_ink: Option<f64>,
    pub enable_deep_space: Option<f64>,
    pub enable_perceptual_blur: Option<f64>,
}

impl Default for ThemeModifiers {
    fn default() -> Self {
        Self {
            bloom_multiplier: 1.0,
            glow_multiplier: 1.0,
            chromatic_bloom_multiplier: 1.0,
            halation_multiplier: 1.0,
            atmospheric_depth_multiplier: 1.0,
            volumetric_occlusion_multiplier: 1.0,
            crepuscular_rays_multiplier: 1.0,
            nebula_multiplier: 1.0,
            aurora_veils_multiplier: 1.0,
            deep_space_multiplier: 1.0,
            micro_contrast_multiplier: 1.0,
            fine_texture_multiplier: 1.0,
            perceptual_blur_multiplier: 1.0,
            color_grade_multiplier: 1.0,
            gradient_map_multiplier: 1.0,
            dodge_burn_multiplier: 1.0,
            vignette_multiplier: 1.0,
            cosmic_ink_multiplier: 1.0,
            opalescence_multiplier: 1.0,
            edge_luminance_multiplier: 1.0,
            enable_chromatic_bloom: None,
            enable_halation: None,
            enable_volumetric_occlusion: None,
            enable_aurora_veils: None,
            enable_crepuscular_rays: None,
            enable_cosmic_ink: None,
            enable_deep_space: None,
            enable_perceptual_blur: None,
        }
    }
}

impl EffectTheme {
    /// Get the modifiers for this theme
    pub fn modifiers(&self) -> ThemeModifiers {
        match self {
            EffectTheme::Ethereal => ThemeModifiers {
                // Emphasize soft, luminous effects
                halation_multiplier: 1.4,
                chromatic_bloom_multiplier: 1.3,
                perceptual_blur_multiplier: 1.3,
                opalescence_multiplier: 1.2,

                // Reduce harsh/contrasty effects
                micro_contrast_multiplier: 0.6,
                fine_texture_multiplier: 0.5,
                volumetric_occlusion_multiplier: 0.4,
                dodge_burn_multiplier: 0.7,
                cosmic_ink_multiplier: 0.3,

                // Soft atmospheric
                atmospheric_depth_multiplier: 0.8,

                // Enable probabilities
                enable_halation: Some(0.95),
                enable_chromatic_bloom: Some(0.85),
                enable_perceptual_blur: Some(0.80),
                enable_volumetric_occlusion: Some(0.30),
                enable_cosmic_ink: Some(0.20),

                ..Default::default()
            },

            EffectTheme::Dramatic => ThemeModifiers {
                // Emphasize contrast and depth
                volumetric_occlusion_multiplier: 1.4,
                crepuscular_rays_multiplier: 1.5,
                dodge_burn_multiplier: 1.4,
                vignette_multiplier: 1.3,
                atmospheric_depth_multiplier: 1.3,

                // Reduce soft/dreamy effects
                chromatic_bloom_multiplier: 0.5,
                perceptual_blur_multiplier: 0.4,
                halation_multiplier: 0.6,

                // Moderate detail
                micro_contrast_multiplier: 1.2,

                // Enable probabilities
                enable_volumetric_occlusion: Some(0.90),
                enable_crepuscular_rays: Some(0.70),
                enable_chromatic_bloom: Some(0.40),
                enable_perceptual_blur: Some(0.30),

                ..Default::default()
            },

            EffectTheme::Cinematic => ThemeModifiers {
                // Film-like qualities
                color_grade_multiplier: 1.3,
                fine_texture_multiplier: 1.4,
                halation_multiplier: 1.2,
                vignette_multiplier: 1.2,
                
                // Warm atmospheric
                atmospheric_depth_multiplier: 1.1,
                gradient_map_multiplier: 1.1,

                // Moderate other effects
                chromatic_bloom_multiplier: 0.9,
                volumetric_occlusion_multiplier: 0.8,

                // Enable probabilities
                enable_halation: Some(0.90),

                ..Default::default()
            },

            EffectTheme::Cosmic => ThemeModifiers {
                // Space-themed effects
                nebula_multiplier: 1.4,
                aurora_veils_multiplier: 1.5,
                deep_space_multiplier: 1.4,
                chromatic_bloom_multiplier: 1.3,
                cosmic_ink_multiplier: 1.2,
                opalescence_multiplier: 1.2,

                // Reduce earth-like effects
                fine_texture_multiplier: 0.5,
                micro_contrast_multiplier: 0.7,

                // Enable probabilities
                enable_aurora_veils: Some(0.85),
                enable_deep_space: Some(0.80),
                enable_cosmic_ink: Some(0.70),
                enable_chromatic_bloom: Some(0.85),

                ..Default::default()
            },

            EffectTheme::Minimal => ThemeModifiers {
                // Very subtle effects
                bloom_multiplier: 0.7,
                glow_multiplier: 0.7,
                chromatic_bloom_multiplier: 0.5,
                halation_multiplier: 0.6,
                atmospheric_depth_multiplier: 0.5,
                volumetric_occlusion_multiplier: 0.3,
                crepuscular_rays_multiplier: 0.3,
                aurora_veils_multiplier: 0.4,
                deep_space_multiplier: 0.4,
                micro_contrast_multiplier: 0.6,
                fine_texture_multiplier: 0.5,
                perceptual_blur_multiplier: 0.6,
                dodge_burn_multiplier: 0.5,
                vignette_multiplier: 0.6,
                cosmic_ink_multiplier: 0.3,

                // Keep color grading active
                gradient_map_multiplier: 1.0,
                color_grade_multiplier: 0.8,

                // Disable most optional effects
                enable_volumetric_occlusion: Some(0.20),
                enable_aurora_veils: Some(0.15),
                enable_crepuscular_rays: Some(0.15),
                enable_cosmic_ink: Some(0.10),
                enable_deep_space: Some(0.20),

                ..Default::default()
            },

            EffectTheme::Balanced | EffectTheme::Random => ThemeModifiers::default(),
        }
    }

    /// Apply theme modifiers to a strength value
    #[allow(dead_code)]
    pub fn apply_modifier(&self, base_strength: f64, multiplier: f64) -> f64 {
        (base_strength * multiplier).clamp(0.0, 1.0)
    }

    /// Check if an effect should be enabled based on theme and RNG
    #[allow(dead_code)]
    pub fn should_enable_effect(
        &self,
        effect_name: &str,
        base_probability: f64,
        rng: &mut Sha3RandomByteStream,
    ) -> bool {
        let modifiers = self.modifiers();
        
        let override_prob = match effect_name {
            "chromatic_bloom" => modifiers.enable_chromatic_bloom,
            "halation" => modifiers.enable_halation,
            "volumetric_occlusion" => modifiers.enable_volumetric_occlusion,
            "aurora_veils" => modifiers.enable_aurora_veils,
            "crepuscular_rays" => modifiers.enable_crepuscular_rays,
            "cosmic_ink" => modifiers.enable_cosmic_ink,
            "deep_space" => modifiers.enable_deep_space,
            "perceptual_blur" => modifiers.enable_perceptual_blur,
            _ => None,
        };

        let probability = override_prob.unwrap_or(base_probability);
        rng.next_f64() < probability
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::Sha3RandomByteStream;

    fn test_rng() -> Sha3RandomByteStream {
        Sha3RandomByteStream::new(&[1, 2, 3, 4], 100.0, 300.0, 25.0, 10.0)
    }

    #[test]
    fn test_all_themes_have_names() {
        let themes = [
            EffectTheme::Ethereal,
            EffectTheme::Dramatic,
            EffectTheme::Cinematic,
            EffectTheme::Cosmic,
            EffectTheme::Minimal,
            EffectTheme::Balanced,
            EffectTheme::Random,
        ];

        for theme in &themes {
            assert!(!theme.name().is_empty(), "Theme {:?} should have a name", theme);
        }
    }

    #[test]
    fn test_theme_modifiers_have_valid_ranges() {
        let themes = [
            EffectTheme::Ethereal,
            EffectTheme::Dramatic,
            EffectTheme::Cinematic,
            EffectTheme::Cosmic,
            EffectTheme::Minimal,
            EffectTheme::Balanced,
        ];

        for theme in &themes {
            let mods = theme.modifiers();
            
            // All multipliers should be positive and reasonable
            assert!(mods.bloom_multiplier > 0.0 && mods.bloom_multiplier <= 2.0,
                "{:?} bloom_multiplier out of range", theme);
            assert!(mods.glow_multiplier > 0.0 && mods.glow_multiplier <= 2.0,
                "{:?} glow_multiplier out of range", theme);
            assert!(mods.halation_multiplier >= 0.0 && mods.halation_multiplier <= 2.0,
                "{:?} halation_multiplier out of range", theme);
            assert!(mods.volumetric_occlusion_multiplier >= 0.0 && mods.volumetric_occlusion_multiplier <= 2.0,
                "{:?} volumetric_occlusion_multiplier out of range", theme);
        }
    }

    #[test]
    fn test_ethereal_theme_emphasizes_soft_effects() {
        let mods = EffectTheme::Ethereal.modifiers();
        
        // Ethereal should boost soft effects
        assert!(mods.halation_multiplier > 1.0, "Ethereal should boost halation");
        assert!(mods.chromatic_bloom_multiplier > 1.0, "Ethereal should boost chromatic bloom");
        assert!(mods.perceptual_blur_multiplier > 1.0, "Ethereal should boost perceptual blur");
        
        // And reduce harsh effects
        assert!(mods.volumetric_occlusion_multiplier < 1.0, "Ethereal should reduce occlusion");
        assert!(mods.cosmic_ink_multiplier < 1.0, "Ethereal should reduce cosmic ink");
    }

    #[test]
    fn test_dramatic_theme_emphasizes_contrast() {
        let mods = EffectTheme::Dramatic.modifiers();
        
        // Dramatic should boost contrast effects
        assert!(mods.volumetric_occlusion_multiplier > 1.0, "Dramatic should boost occlusion");
        assert!(mods.crepuscular_rays_multiplier > 1.0, "Dramatic should boost rays");
        assert!(mods.dodge_burn_multiplier > 1.0, "Dramatic should boost dodge/burn");
        
        // And reduce soft effects
        assert!(mods.chromatic_bloom_multiplier < 1.0, "Dramatic should reduce chromatic bloom");
        assert!(mods.perceptual_blur_multiplier < 1.0, "Dramatic should reduce blur");
    }

    #[test]
    fn test_cosmic_theme_emphasizes_space_effects() {
        let mods = EffectTheme::Cosmic.modifiers();
        
        // Cosmic should boost space effects
        assert!(mods.nebula_multiplier > 1.0, "Cosmic should boost nebula");
        assert!(mods.aurora_veils_multiplier > 1.0, "Cosmic should boost aurora");
        assert!(mods.deep_space_multiplier > 1.0, "Cosmic should boost deep space");
    }

    #[test]
    fn test_minimal_theme_reduces_most_effects() {
        let mods = EffectTheme::Minimal.modifiers();
        
        // Minimal should reduce most effects
        assert!(mods.bloom_multiplier < 1.0, "Minimal should reduce bloom");
        assert!(mods.volumetric_occlusion_multiplier < 1.0, "Minimal should reduce occlusion");
        assert!(mods.aurora_veils_multiplier < 1.0, "Minimal should reduce aurora");
        
        // But keep gradient map (the core visual identity)
        assert!(mods.gradient_map_multiplier >= 1.0, "Minimal should keep gradient map");
    }

    #[test]
    fn test_balanced_theme_uses_defaults() {
        let mods = EffectTheme::Balanced.modifiers();
        
        // Balanced should use default (1.0) multipliers
        assert!((mods.bloom_multiplier - 1.0).abs() < 0.001, "Balanced should use default bloom");
        assert!((mods.halation_multiplier - 1.0).abs() < 0.001, "Balanced should use default halation");
    }

    #[test]
    fn test_random_theme_selection() {
        let mut rng = test_rng();
        let mut themes_seen = std::collections::HashSet::new();
        
        // Generate many random themes
        for _ in 0..100 {
            let theme = EffectTheme::random(&mut rng);
            themes_seen.insert(theme.name());
        }
        
        // Should see at least 3 different themes
        assert!(themes_seen.len() >= 3, "Random selection should produce variety");
    }

    #[test]
    fn test_gallery_random_prefers_striking_themes() {
        let mut rng = test_rng();
        let mut cinematic_count = 0;
        let mut ethereal_count = 0;
        let mut minimal_count = 0;
        
        for _ in 0..1000 {
            let theme = EffectTheme::random_gallery(&mut rng);
            match theme {
                EffectTheme::Cinematic => cinematic_count += 1,
                EffectTheme::Ethereal => ethereal_count += 1,
                EffectTheme::Minimal => minimal_count += 1,
                _ => {}
            }
        }
        
        // Cinematic and Ethereal should be more common than Minimal in gallery mode
        assert!(cinematic_count > minimal_count, 
            "Gallery should prefer Cinematic over Minimal (got {} vs {})", 
            cinematic_count, minimal_count);
        assert!(ethereal_count > minimal_count,
            "Gallery should prefer Ethereal over Minimal (got {} vs {})",
            ethereal_count, minimal_count);
    }

    #[test]
    fn test_apply_modifier_clamps_values() {
        let theme = EffectTheme::Balanced;
        
        // Test clamping to 0-1 range
        assert_eq!(theme.apply_modifier(0.5, 0.5), 0.25);
        assert_eq!(theme.apply_modifier(0.8, 1.5), 1.0); // Clamped to max
        assert_eq!(theme.apply_modifier(-0.5, 1.0), 0.0); // Clamped to min
    }

    #[test]
    fn test_should_enable_effect_respects_overrides() {
        let mut rng1 = test_rng();
        let mut rng2 = test_rng();
        
        // Ethereal has high probability for halation
        let ethereal = EffectTheme::Ethereal;
        let mut halation_enabled = 0;
        for _ in 0..100 {
            if ethereal.should_enable_effect("halation", 0.5, &mut rng1) {
                halation_enabled += 1;
            }
        }
        // With 95% probability, should see ~95 enabled
        assert!(halation_enabled > 80, "Ethereal should enable halation frequently");

        // Minimal has low probability for volumetric occlusion
        let minimal = EffectTheme::Minimal;
        let mut occlusion_enabled = 0;
        for _ in 0..100 {
            if minimal.should_enable_effect("volumetric_occlusion", 0.5, &mut rng2) {
                occlusion_enabled += 1;
            }
        }
        // With 20% probability, should see ~20 enabled
        assert!(occlusion_enabled < 40, "Minimal should enable occlusion rarely");
    }
}

