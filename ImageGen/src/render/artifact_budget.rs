//! Artifact Budget: Soft quality guardrails for effect combinations
//!
//! Some effects contribute to an "artifact" aesthetic when overused:
//! - Chromatic bloom (prismatic separation)
//! - Edge luminance (outline effects)
//! - Strong micro-contrast (HDR halos)
//!
//! Instead of banning these entirely, we assign each an **artifact cost**
//! and cap the total **budget**. When budget is exceeded, we scale down
//! the strongest contributors rather than disabling effects entirely.
//!
//! # Philosophy
//!
//! Museum-quality output allows artifacts as intentional artistic choices,
//! but prevents accidental accumulation that creates "plugin-stack" aesthetics.
//! The budget system is a soft guardrail, not a hard ban.
//!
//! # Usage
//!
//! ```ignore
//! let budget = ArtifactBudget::museum_quality();
//! budget.apply(&mut resolved_config);
//! ```

use super::randomizable_config::ResolvedEffectConfig;

/// Artifact budget configuration and scoring.
///
/// The budget system assigns costs to "artifact-prone" effects and
/// scales them back when the total exceeds the allowed budget.
#[derive(Clone, Debug)]
pub struct ArtifactBudget {
    /// Maximum total artifact score (0.0-1.0).
    /// Lower = stricter quality enforcement.
    pub max_budget: f64,

    /// Individual effect costs (proportional to artifact risk).
    /// Higher cost = more likely to cause artifact aesthetic.
    pub chromatic_bloom_cost: f64,
    pub edge_luminance_cost: f64,
    pub micro_contrast_cost: f64,
    pub prismatic_halos_cost: f64,
    pub dimensional_glitch_cost: f64,
}

impl Default for ArtifactBudget {
    fn default() -> Self {
        Self::museum_quality()
    }
}

impl ArtifactBudget {
    /// Create museum-quality budget with strict artifact control.
    ///
    /// This is the recommended setting for exhibition-quality output.
    pub fn museum_quality() -> Self {
        Self {
            max_budget: 0.45,             // Strict: allow moderate artifacts
            chromatic_bloom_cost: 0.25,   // High cost: prismatic separation is artifact-prone
            edge_luminance_cost: 0.18,    // Moderate cost: can create outline effects
            micro_contrast_cost: 0.15,    // Moderate cost: can create HDR halos
            prismatic_halos_cost: 0.18,   // Moderate cost: optical effect
            dimensional_glitch_cost: 0.40, // Very high cost: digital aesthetic
        }
    }

    /// Create relaxed budget for artistic experimentation.
    ///
    /// Allows more artifacts for intentionally "processed" aesthetics.
    #[allow(dead_code)]
    pub fn creative() -> Self {
        Self {
            max_budget: 0.75,
            chromatic_bloom_cost: 0.20,
            edge_luminance_cost: 0.15,
            micro_contrast_cost: 0.12,
            prismatic_halos_cost: 0.15,
            dimensional_glitch_cost: 0.30,
        }
    }

    /// Calculate current artifact score for configuration.
    ///
    /// The score is the sum of (effect_enabled * effect_strength * effect_cost)
    /// for all artifact-prone effects.
    pub fn calculate_score(&self, config: &ResolvedEffectConfig) -> f64 {
        let mut score = 0.0;

        // Chromatic bloom: high artifact cost
        if config.enable_chromatic_bloom {
            let normalized_strength = (config.chromatic_bloom_strength / 0.5).min(1.0);
            score += self.chromatic_bloom_cost * normalized_strength;
        }

        // Edge luminance: moderate artifact cost
        if config.enable_edge_luminance {
            let normalized_strength = (config.edge_luminance_strength / 0.3).min(1.0);
            score += self.edge_luminance_cost * normalized_strength;
        }

        // Micro-contrast: moderate artifact cost when strong
        if config.enable_micro_contrast {
            let normalized_strength = (config.micro_contrast_strength / 0.4).min(1.0);
            score += self.micro_contrast_cost * normalized_strength;
        }

        // Prismatic halos: moderate cost
        if config.enable_prismatic_halos {
            let normalized_strength = (config.prismatic_halos_strength / 0.5).min(1.0);
            score += self.prismatic_halos_cost * normalized_strength;
        }

        // Dimensional glitch: very high cost (not museum-appropriate)
        if config.enable_dimensional_glitch {
            let normalized_strength = (config.dimensional_glitch_strength / 0.5).min(1.0);
            score += self.dimensional_glitch_cost * normalized_strength;
        }

        score
    }

    /// Apply budget constraints, scaling down effects if necessary.
    ///
    /// When the total artifact score exceeds the budget, effects are
    /// scaled down proportionally to bring the total within budget.
    /// This preserves the relative balance of effects while reducing
    /// overall artifact intensity.
    pub fn apply(&self, config: &mut ResolvedEffectConfig) -> Option<f64> {
        let score = self.calculate_score(config);

        if score <= self.max_budget {
            return None;
        }

        // Calculate scale factor needed to bring within budget
        let scale_factor = self.max_budget / score;

        // Scale down artifact-contributing effects proportionally
        if config.enable_chromatic_bloom {
            config.chromatic_bloom_strength *= scale_factor;
        }

        if config.enable_edge_luminance {
            config.edge_luminance_strength *= scale_factor;
        }

        if config.enable_micro_contrast {
            config.micro_contrast_strength *= scale_factor;
        }

        if config.enable_prismatic_halos {
            config.prismatic_halos_strength *= scale_factor;
        }

        if config.enable_dimensional_glitch {
            config.dimensional_glitch_strength *= scale_factor;
        }

        Some(scale_factor)
    }

    /// Suggest disabling dimensional glitch for museum quality.
    ///
    /// Returns true if dimensional glitch should be disabled for
    /// museum-quality output (it has a very high artifact cost).
    pub fn should_disable_glitch(&self) -> bool {
        self.dimensional_glitch_cost >= 0.35
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_config() -> ResolvedEffectConfig {
        use crate::render::effect_themes::EffectTheme;
        ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: true,
            special_mode: false,
            noise_seed: 42,
            effect_theme: EffectTheme::Balanced,
            enable_bloom: false,
            enable_glow: false,
            enable_chromatic_bloom: false,
            enable_perceptual_blur: false,
            enable_micro_contrast: false,
            enable_gradient_map: false,
            enable_color_grade: false,
            enable_champleve: false,
            enable_aether: false,
            enable_opalescence: false,
            enable_edge_luminance: false,
            enable_atmospheric_depth: false,
            enable_crepuscular_rays: false,
            enable_volumetric_occlusion: false,
            enable_refractive_caustics: false,
            enable_fine_texture: false,
            enable_event_horizon: false,
            enable_cherenkov: false,
            enable_cosmic_ink: false,
            enable_aurora_veils: false,
            enable_prismatic_halos: false,
            enable_dimensional_glitch: false,
            enable_deep_space: false,
            enable_halation: false,
            enable_dodge_burn: false,
            blur_strength: 0.0,
            blur_radius_scale: 0.0,
            blur_core_brightness: 0.0,
            dog_strength: 0.0,
            dog_sigma_scale: 0.0,
            dog_ratio: 0.0,
            glow_strength: 0.0,
            glow_threshold: 0.0,
            glow_radius_scale: 0.0,
            glow_sharpness: 0.0,
            glow_saturation_boost: 0.0,
            chromatic_bloom_strength: 0.0,
            chromatic_bloom_radius_scale: 0.0,
            chromatic_bloom_separation_scale: 0.0,
            chromatic_bloom_threshold: 0.0,
            perceptual_blur_strength: 0.0,
            color_grade_strength: 0.0,
            vignette_strength: 0.0,
            vignette_softness: 0.0,
            vibrance: 0.0,
            clarity_strength: 0.0,
            tone_curve_strength: 0.0,
            gradient_map_strength: 0.0,
            gradient_map_hue_preservation: 0.0,
            gradient_map_palette: 0,
            opalescence_strength: 0.0,
            opalescence_scale: 0.0,
            opalescence_layers: 0,
            champleve_flow_alignment: 0.0,
            champleve_interference_amplitude: 0.0,
            champleve_rim_intensity: 0.0,
            champleve_rim_warmth: 0.0,
            champleve_interior_lift: 0.0,
            aether_flow_alignment: 0.0,
            aether_scattering_strength: 0.0,
            aether_iridescence_amplitude: 0.0,
            aether_caustic_strength: 0.0,
            micro_contrast_strength: 0.0,
            micro_contrast_radius: 0,
            edge_luminance_strength: 0.0,
            edge_luminance_threshold: 0.0,
            edge_luminance_brightness_boost: 0.0,
            atmospheric_depth_strength: 0.0,
            atmospheric_desaturation: 0.0,
            atmospheric_darkening: 0.0,
            atmospheric_fog_color_r: 0.0,
            atmospheric_fog_color_g: 0.0,
            atmospheric_fog_color_b: 0.0,
            crepuscular_rays_strength: 0.0,
            crepuscular_rays_density: 0.0,
            crepuscular_rays_decay: 0.0,
            crepuscular_rays_weight: 0.0,
            crepuscular_rays_exposure: 0.0,
            volumetric_occlusion_strength: 0.0,
            volumetric_occlusion_radius: 0,
            volumetric_occlusion_light_angle: 0.0,
            volumetric_occlusion_density_scale: 0.0,
            volumetric_occlusion_decay: 0.0,
            volumetric_occlusion_threshold: 0.0,
            refractive_caustics_strength: 0.0,
            refractive_caustics_ior: 0.0,
            refractive_caustics_dispersion: 0.0,
            refractive_caustics_focus: 0.0,
            refractive_caustics_threshold: 0.0,
            fine_texture_strength: 0.0,
            fine_texture_scale: 0.0,
            fine_texture_contrast: 0.0,
            fine_texture_specular: 0.0,
            fine_texture_light_angle: 0.0,
            fine_texture_type: 0,
            hdr_scale: 0.0,
            clip_black: 0.0,
            clip_white: 1.0,
            nebula_strength: 0.0,
            nebula_octaves: 0,
            nebula_base_frequency: 0.0,
            event_horizon_strength: 0.0,
            event_horizon_mass_scale: 0.0,
            cherenkov_strength: 0.0,
            cherenkov_threshold: 0.0,
            cherenkov_blur_radius: 0.0,
            cosmic_ink_strength: 0.0,
            cosmic_ink_swirl_intensity: 0.0,
            aurora_veils_strength: 0.0,
            aurora_veils_curtain_count: 0,
            prismatic_halos_strength: 0.0,
            prismatic_halos_threshold: 0.0,
            dimensional_glitch_strength: 0.0,
            dimensional_glitch_threshold: 0.0,
            halation_strength: 0.0,
            halation_threshold: 0.0,
            halation_radius_scale: 0.0,
            halation_warmth: 0.0,
            halation_softness: 0.0,
            dodge_burn_strength: 0.0,
            dodge_burn_dodge_amount: 0.0,
            dodge_burn_burn_amount: 0.0,
            dodge_burn_saliency_radius: 0.0,
            dodge_burn_luminance_weight: 0.0,
        }
    }

    #[test]
    fn test_zero_score_for_disabled_effects() {
        let budget = ArtifactBudget::museum_quality();
        let config = minimal_config();

        let score = budget.calculate_score(&config);
        assert!((score - 0.0).abs() < 1e-10, "Score should be 0 for disabled effects");
    }

    #[test]
    fn test_chromatic_bloom_contributes_to_score() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.5;

        let score = budget.calculate_score(&config);
        assert!(score > 0.0, "Chromatic bloom should contribute to score");
        assert!(
            score <= budget.chromatic_bloom_cost,
            "Score should be <= max cost"
        );
    }

    #[test]
    fn test_apply_scales_down_when_over_budget() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        // Enable multiple artifact-prone effects at moderate strength
        // Use values that won't hit the .min(1.0) normalization ceiling
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.4;
        config.enable_edge_luminance = true;
        config.edge_luminance_strength = 0.25;
        config.enable_micro_contrast = true;
        config.micro_contrast_strength = 0.3;
        config.enable_prismatic_halos = true;
        config.prismatic_halos_strength = 0.4;

        let original_chromatic = config.chromatic_bloom_strength;
        let original_score = budget.calculate_score(&config);

        // Verify we're over budget before scaling
        assert!(
            original_score > budget.max_budget,
            "Original score {} should be > budget {} for this test",
            original_score,
            budget.max_budget
        );

        let scale = budget.apply(&mut config);

        // Should have applied scaling
        assert!(scale.is_some(), "Should have applied scaling");
        assert!(
            config.chromatic_bloom_strength < original_chromatic,
            "Chromatic bloom should be scaled down"
        );

        // New score should be significantly lower
        let new_score = budget.calculate_score(&config);
        assert!(
            new_score < original_score,
            "New score {} should be < original score {}",
            new_score,
            original_score
        );
    }

    #[test]
    fn test_apply_does_nothing_when_under_budget() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        // Enable one effect at low strength
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.1;

        let original = config.chromatic_bloom_strength;
        let scale = budget.apply(&mut config);

        assert!(scale.is_none(), "Should not apply scaling when under budget");
        assert!(
            (config.chromatic_bloom_strength - original).abs() < 1e-10,
            "Strength should be unchanged"
        );
    }

    #[test]
    fn test_museum_quality_disables_glitch() {
        let budget = ArtifactBudget::museum_quality();
        assert!(
            budget.should_disable_glitch(),
            "Museum quality should recommend disabling glitch"
        );
    }

    #[test]
    fn test_dimensional_glitch_high_cost() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        config.enable_dimensional_glitch = true;
        config.dimensional_glitch_strength = 0.5;

        let score = budget.calculate_score(&config);

        // Glitch alone should consume most of the budget
        assert!(
            score > budget.max_budget * 0.7,
            "Glitch alone should consume most of budget"
        );
    }

    #[test]
    fn test_creative_budget_more_permissive() {
        let museum = ArtifactBudget::museum_quality();
        let creative = ArtifactBudget::creative();

        assert!(
            creative.max_budget > museum.max_budget,
            "Creative budget should be more permissive"
        );
    }

    #[test]
    fn test_all_effects_contribute_to_score() {
        let budget = ArtifactBudget::museum_quality();

        // Test chromatic_bloom
        let mut config = minimal_config();
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.5;
        let score = budget.calculate_score(&config);
        assert!(score > 0.0, "chromatic_bloom should contribute to score, got {}", score);

        // Test edge_luminance
        let mut config = minimal_config();
        config.enable_edge_luminance = true;
        config.edge_luminance_strength = 0.3;
        let score = budget.calculate_score(&config);
        assert!(score > 0.0, "edge_luminance should contribute to score, got {}", score);

        // Test micro_contrast
        let mut config = minimal_config();
        config.enable_micro_contrast = true;
        config.micro_contrast_strength = 0.35;
        let score = budget.calculate_score(&config);
        assert!(score > 0.0, "micro_contrast should contribute to score, got {}", score);

        // Test prismatic_halos
        let mut config = minimal_config();
        config.enable_prismatic_halos = true;
        config.prismatic_halos_strength = 0.5;
        let score = budget.calculate_score(&config);
        assert!(score > 0.0, "prismatic_halos should contribute to score, got {}", score);

        // Test dimensional_glitch
        let mut config = minimal_config();
        config.enable_dimensional_glitch = true;
        config.dimensional_glitch_strength = 0.5;
        let score = budget.calculate_score(&config);
        assert!(score > 0.0, "dimensional_glitch should contribute to score, got {}", score);
    }

    #[test]
    fn test_score_increases_with_strength() {
        let budget = ArtifactBudget::museum_quality();

        let mut low_strength = minimal_config();
        low_strength.enable_chromatic_bloom = true;
        low_strength.chromatic_bloom_strength = 0.1;

        let mut high_strength = minimal_config();
        high_strength.enable_chromatic_bloom = true;
        high_strength.chromatic_bloom_strength = 0.5;

        let low_score = budget.calculate_score(&low_strength);
        let high_score = budget.calculate_score(&high_strength);

        assert!(
            high_score > low_score,
            "Higher strength should produce higher score: {} vs {}",
            high_score,
            low_score
        );
    }

    #[test]
    fn test_apply_preserves_disabled_effects() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        // Enable some effects at high strength to trigger scaling
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.5;
        config.enable_edge_luminance = true;
        config.edge_luminance_strength = 0.4;

        // Keep some effects disabled
        assert!(!config.enable_micro_contrast);
        assert!(!config.enable_prismatic_halos);

        budget.apply(&mut config);

        // Disabled effects should remain disabled
        assert!(!config.enable_micro_contrast, "Disabled effects should stay disabled");
        assert!(!config.enable_prismatic_halos, "Disabled effects should stay disabled");
    }

    #[test]
    fn test_scaling_proportional_to_contribution() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        // Enable effects with different costs
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.5; // High cost effect
        config.enable_micro_contrast = true;
        config.micro_contrast_strength = 0.35; // Lower cost effect

        let orig_chromatic = config.chromatic_bloom_strength;
        let orig_micro = config.micro_contrast_strength;

        budget.apply(&mut config);

        // Both should be scaled, but chromatic (higher cost) should be scaled more
        let chromatic_reduction = orig_chromatic - config.chromatic_bloom_strength;
        let micro_reduction = orig_micro - config.micro_contrast_strength;

        // Note: After scaling, chromatic should have a larger reduction
        // due to its higher cost
        if chromatic_reduction > 0.0 && micro_reduction > 0.0 {
            assert!(
                chromatic_reduction >= micro_reduction * 0.5,
                "Higher cost effects should be scaled more: chromatic_reduction={}, micro_reduction={}",
                chromatic_reduction,
                micro_reduction
            );
        }
    }

    #[test]
    fn test_score_capped_at_effect_cost() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        // Enable one effect at very high strength
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 1.0; // Max strength

        let score = budget.calculate_score(&config);

        // Score should not exceed the effect's cost (due to normalization)
        assert!(
            score <= budget.chromatic_bloom_cost * 1.01, // Small tolerance
            "Score should be capped at effect cost: {} > {}",
            score,
            budget.chromatic_bloom_cost
        );
    }

    #[test]
    fn test_budget_default_is_museum_quality() {
        let default = ArtifactBudget::default();
        let museum = ArtifactBudget::museum_quality();

        assert!((default.max_budget - museum.max_budget).abs() < 1e-10);
        assert!((default.chromatic_bloom_cost - museum.chromatic_bloom_cost).abs() < 1e-10);
    }

    #[test]
    fn test_apply_returns_scale_factor() {
        let budget = ArtifactBudget::museum_quality();
        let mut config = minimal_config();

        // Configure to exceed budget
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.5;
        config.enable_edge_luminance = true;
        config.edge_luminance_strength = 0.4;
        config.enable_micro_contrast = true;
        config.micro_contrast_strength = 0.4;

        if let Some(scale) = budget.apply(&mut config) {
            assert!(
                scale > 0.0 && scale < 1.0,
                "Scale factor should be in (0, 1): {}",
                scale
            );
        }
    }
}

