//! Repair pass for near-miss candidates.

use crate::curation::quality_score::QualityScores;
use crate::render::randomizable_config::ResolvedEffectConfig;

pub fn repair_candidate(config: &mut ResolvedEffectConfig, scores: &QualityScores) -> Vec<String> {
    let mut actions = Vec::new();

    // Action 1: clipping correction if technical quality is low.
    if scores.technical_integrity < 0.78 {
        if config.clip_black > 0.015 || config.clip_white < 0.988 {
            config.clip_black = config.clip_black.min(0.013).max(0.006);
            config.clip_white = config.clip_white.max(0.990).min(0.996);
            actions.push("repair:clipping_correction".to_string());
        }
    }

    if actions.len() >= 2 {
        return actions;
    }

    // Action 2: bloom/glow rebalance to recover structure and polish.
    if !(config.enable_bloom || config.enable_glow || config.enable_chromatic_bloom) {
        config.enable_bloom = true;
        config.dog_strength = config.dog_strength.max(0.30);
        actions.push("repair:luminous_rebalance_enable_bloom".to_string());
    } else if config.enable_chromatic_bloom && config.chromatic_bloom_threshold < 0.10 {
        config.chromatic_bloom_threshold = 0.12;
        actions.push("repair:raise_chromatic_threshold".to_string());
    } else if config.enable_glow && config.glow_strength > 0.75 {
        config.glow_strength = 0.72;
        actions.push("repair:moderate_glow_strength".to_string());
    }

    if actions.len() >= 2 {
        return actions;
    }

    // Action 3: texture/vignette moderation (surface harshness fixer).
    if config.fine_texture_strength > 0.22 || config.fine_texture_contrast > 0.45 {
        config.fine_texture_strength = config.fine_texture_strength.min(0.20);
        config.fine_texture_contrast = config.fine_texture_contrast.min(0.40);
        actions.push("repair:moderate_texture".to_string());
    }

    if actions.len() >= 2 {
        return actions;
    }

    if config.color_grade_strength > 0.72 && config.gradient_map_strength > 0.72 {
        config.color_grade_strength = 0.66;
        config.gradient_map_strength = 0.66;
        actions.push("repair:cap_grade_gradient_combo".to_string());
    }

    actions.truncate(2);
    actions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> ResolvedEffectConfig {
        ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: false,
            enable_glow: false,
            enable_chromatic_bloom: false,
            enable_perceptual_blur: true,
            enable_micro_contrast: true,
            enable_gradient_map: true,
            enable_color_grade: true,
            enable_champleve: true,
            enable_aether: true,
            enable_opalescence: true,
            enable_edge_luminance: true,
            enable_atmospheric_depth: true,
            enable_fine_texture: true,
            blur_strength: 10.0,
            blur_radius_scale: 0.02,
            blur_core_brightness: 10.0,
            dog_strength: 0.2,
            dog_sigma_scale: 0.01,
            dog_ratio: 2.8,
            glow_strength: 0.8,
            glow_threshold: 0.7,
            glow_radius_scale: 0.01,
            glow_sharpness: 3.0,
            glow_saturation_boost: 0.3,
            chromatic_bloom_strength: 0.7,
            chromatic_bloom_radius_scale: 0.012,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.08,
            perceptual_blur_strength: 0.6,
            color_grade_strength: 0.8,
            vignette_strength: 0.5,
            vignette_softness: 2.8,
            vibrance: 1.2,
            clarity_strength: 0.3,
            tone_curve_strength: 0.6,
            gradient_map_strength: 0.8,
            gradient_map_hue_preservation: 0.2,
            gradient_map_palette: 0,
            opalescence_strength: 0.2,
            opalescence_scale: 0.01,
            opalescence_layers: 5,
            champleve_flow_alignment: 0.6,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 2.0,
            champleve_rim_warmth: 0.7,
            champleve_interior_lift: 0.7,
            aether_flow_alignment: 0.8,
            aether_scattering_strength: 1.0,
            aether_iridescence_amplitude: 0.7,
            aether_caustic_strength: 0.3,
            micro_contrast_strength: 0.3,
            micro_contrast_radius: 5,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.2,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.3,
            atmospheric_desaturation: 0.4,
            atmospheric_darkening: 0.2,
            atmospheric_fog_color_r: 0.1,
            atmospheric_fog_color_g: 0.1,
            atmospheric_fog_color_b: 0.1,
            fine_texture_strength: 0.28,
            fine_texture_scale: 0.002,
            fine_texture_contrast: 0.50,
            hdr_scale: 0.12,
            clip_black: 0.022,
            clip_white: 0.983,
            nebula_strength: 0.1,
            nebula_octaves: 4,
            nebula_base_frequency: 0.001,
        }
    }

    #[test]
    fn repair_applies_at_most_two_actions() {
        let mut cfg = config();
        let scores = QualityScores { technical_integrity: 0.5, ..Default::default() };
        let actions = repair_candidate(&mut cfg, &scores);
        assert!(actions.len() <= 2);
    }
}
