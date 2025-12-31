//! Quality-based auto-tuning for museum-quality output.
//!
//! This module applies conservative, deterministic adjustments to a resolved
//! effect configuration based on objective `QualityMetrics`.
//!
//! Philosophy:
//! - Prefer *small, targeted* changes over heavy-handed reconfiguration
//! - Never introduce randomness here (must remain reproducible)
//! - Record all adjustments into the `RandomizationLog` for auditability

use crate::render::effect_randomizer::{RandomizationLog, RandomizationRecord, RandomizedParameter};
use crate::render::quality_metrics::{AdjustmentDirection, QualityMetrics};
use crate::render::randomizable_config::ResolvedEffectConfig;
use crate::render::types::RenderConfig;

/// Apply quality-based auto-tuning to a resolved config and render config.
///
/// This uses `metrics.suggest_adjustments()` and also adjusts exposure normalization boost
/// toward a target mean luminance.
pub fn apply_quality_autotune(
    resolved: &mut ResolvedEffectConfig,
    render_config: &mut RenderConfig,
    metrics: &QualityMetrics,
    randomization_log: &mut RandomizationLog,
) {
    let mut record = RandomizationRecord::new("quality_autotune".to_string(), true, false);

    // 1) Apply metric-driven parameter adjustments.
    for adj in metrics.suggest_adjustments() {
        let applied = match adj.param.as_str() {
            "halation_threshold" => {
                let before = resolved.halation_threshold;
                resolved.halation_threshold = apply_delta(before, adj.direction, adj.magnitude, 0.0, 1.0);
                Some((before, resolved.halation_threshold))
            }
            "glow_strength" => {
                let before = resolved.glow_strength;
                resolved.glow_strength = apply_delta(before, adj.direction, adj.magnitude, 0.0, 10_000.0);
                Some((before, resolved.glow_strength))
            }
            // Note: our bloom "strength" lives in the gaussian blur strength parameter.
            "bloom_strength" => {
                let before = resolved.blur_strength;
                resolved.blur_strength = apply_delta(before, adj.direction, adj.magnitude, 0.0, 10_000.0);
                Some((before, resolved.blur_strength))
            }
            "vignette_strength" => {
                let before = resolved.vignette_strength;
                resolved.vignette_strength = apply_delta(before, adj.direction, adj.magnitude, 0.0, 1.0);
                Some((before, resolved.vignette_strength))
            }
            "atmospheric_darkening" => {
                let before = resolved.atmospheric_darkening;
                resolved.atmospheric_darkening =
                    apply_delta(before, adj.direction, adj.magnitude, 0.0, 1.0);
                Some((before, resolved.atmospheric_darkening))
            }
            "dodge_burn_strength" => {
                let before = resolved.dodge_burn_strength;
                resolved.dodge_burn_strength = apply_delta(before, adj.direction, adj.magnitude, 0.0, 2.0);
                Some((before, resolved.dodge_burn_strength))
            }
            "micro_contrast_strength" => {
                let before = resolved.micro_contrast_strength;
                resolved.micro_contrast_strength =
                    apply_delta(before, adj.direction, adj.magnitude, 0.0, 2.0);
                Some((before, resolved.micro_contrast_strength))
            }
            "chromatic_bloom_strength" => {
                let before = resolved.chromatic_bloom_strength;
                resolved.chromatic_bloom_strength =
                    apply_delta(before, adj.direction, adj.magnitude, 0.0, 2.0);
                Some((before, resolved.chromatic_bloom_strength))
            }
            _ => None,
        };

        if let Some((before, after)) = applied {
            if (after - before).abs() > 1e-12 {
                record.parameters.push(RandomizedParameter {
                    name: adj.param,
                    value: format!("{after:.4}"),
                    was_randomized: false,
                    range_used: format!("auto_tune (from {before:.4})"),
                });
            }
        }
    }

    // 2) Exposure normalization self-tuning (hue-preserving scalar boost).
    //
    // We target a midtone mean luminance in the tonemapped preview. This is a gentle
    // closed-loop correction that reduces “too dark / too bright” failures.
    let target_mean = 0.22;
    let mean = metrics.mean_luminance.max(1e-6);
    let desired_ratio = (target_mean / mean).clamp(0.70, 1.40);

    let before_boost = render_config.exposure_normalization.boost;
    let mut after_boost = before_boost * desired_ratio;
    after_boost = after_boost.clamp(0.8, 3.2);
    render_config.exposure_normalization.boost = after_boost;

    if (after_boost - before_boost).abs() > 1e-9 {
        record.parameters.push(RandomizedParameter {
            name: "exposure_normalization_boost".to_string(),
            value: format!("{after_boost:.4}"),
            was_randomized: false,
            range_used: format!("auto_tune (from {before_boost:.4}, target_mean={target_mean:.3})"),
        });
    }

    if !record.parameters.is_empty() {
        randomization_log.add_record(record);
    }
}

fn apply_delta(current: f64, direction: AdjustmentDirection, magnitude: f64, min: f64, max: f64) -> f64 {
    let next = match direction {
        AdjustmentDirection::Increase => current + magnitude,
        AdjustmentDirection::Decrease => current - magnitude,
    };
    next.clamp(min, max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::effect_randomizer::AestheticBiases;

    #[test]
    fn test_apply_quality_autotune_adjusts_boost_and_logs() {
        let mut resolved = ResolvedEffectConfig {
            width: 64,
            height: 64,
            gallery_quality: true,
            special_mode: false,
            noise_seed: 42,
            // enables
            enable_bloom: true,
            enable_glow: true,
            enable_chromatic_bloom: true,
            enable_perceptual_blur: true,
            enable_micro_contrast: true,
            enable_gradient_map: true,
            enable_color_grade: true,
            enable_champleve: true,
            enable_aether: true,
            enable_opalescence: true,
            enable_edge_luminance: true,
            enable_atmospheric_depth: true,
            enable_crepuscular_rays: true,
            enable_volumetric_occlusion: true,
            enable_refractive_caustics: true,
            enable_fine_texture: true,
            enable_event_horizon: false,
            enable_cherenkov: false,
            enable_cosmic_ink: false,
            enable_aurora_veils: false,
            enable_prismatic_halos: false,
            enable_dimensional_glitch: false,
            enable_deep_space: false,
            // parameters (only the ones we touch need meaningful defaults)
            blur_strength: 8.0,
            blur_radius_scale: 0.02,
            blur_core_brightness: 8.0,
            dog_strength: 0.3,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.8,
            glow_strength: 0.5,
            glow_threshold: 0.8,
            glow_radius_scale: 0.01,
            glow_sharpness: 0.5,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.4,
            chromatic_bloom_radius_scale: 0.01,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.8,
            perceptual_blur_strength: 0.5,
            color_grade_strength: 0.5,
            vignette_strength: 0.3,
            vignette_softness: 0.6,
            vibrance: 0.2,
            clarity_strength: 0.2,
            tone_curve_strength: 0.2,
            gradient_map_strength: 0.7,
            gradient_map_hue_preservation: 0.2,
            gradient_map_palette: 0,
            opalescence_strength: 0.2,
            opalescence_scale: 0.02,
            opalescence_layers: 3,
            champleve_flow_alignment: 0.5,
            champleve_interference_amplitude: 0.2,
            champleve_rim_intensity: 0.2,
            champleve_rim_warmth: 0.2,
            champleve_interior_lift: 0.1,
            aether_flow_alignment: 0.5,
            aether_scattering_strength: 0.5,
            aether_iridescence_amplitude: 0.2,
            aether_caustic_strength: 0.2,
            micro_contrast_strength: 0.1,
            micro_contrast_radius: 2,
            edge_luminance_strength: 0.1,
            edge_luminance_threshold: 0.2,
            edge_luminance_brightness_boost: 0.1,
            atmospheric_depth_strength: 0.1,
            atmospheric_desaturation: 0.1,
            atmospheric_darkening: 0.2,
            atmospheric_fog_color_r: 0.1,
            atmospheric_fog_color_g: 0.1,
            atmospheric_fog_color_b: 0.1,
            crepuscular_rays_strength: 0.2,
            crepuscular_rays_density: 0.8,
            crepuscular_rays_decay: 0.95,
            crepuscular_rays_weight: 0.5,
            crepuscular_rays_exposure: 0.2,
            volumetric_occlusion_strength: 0.3,
            volumetric_occlusion_radius: 6,
            volumetric_occlusion_light_angle: 0.3,
            volumetric_occlusion_density_scale: 1.0,
            volumetric_occlusion_decay: 0.9,
            volumetric_occlusion_threshold: 0.2,
            refractive_caustics_strength: 0.0,
            refractive_caustics_ior: 1.3,
            refractive_caustics_dispersion: 0.1,
            refractive_caustics_focus: 0.5,
            refractive_caustics_threshold: 0.8,
            fine_texture_strength: 0.5,
            fine_texture_scale: 0.01,
            fine_texture_contrast: 0.3,
            fine_texture_specular: 0.2,
            fine_texture_light_angle: 0.3,
            fine_texture_type: 0,
            hdr_scale: 0.12,
            clip_black: 0.002,
            clip_white: 0.98,
            nebula_strength: 0.0,
            nebula_octaves: 4,
            nebula_base_frequency: 0.001,
            event_horizon_strength: 0.0,
            event_horizon_mass_scale: 1.0,
            cherenkov_strength: 0.0,
            cherenkov_threshold: 0.8,
            cherenkov_blur_radius: 1.0,
            cosmic_ink_strength: 0.0,
            cosmic_ink_swirl_intensity: 0.0,
            aurora_veils_strength: 0.0,
            aurora_veils_curtain_count: 3,
            prismatic_halos_strength: 0.0,
            prismatic_halos_threshold: 0.9,
            dimensional_glitch_strength: 0.0,
            dimensional_glitch_threshold: 0.9,
            enable_halation: true,
            halation_strength: 0.2,
            halation_threshold: 0.7,
            halation_radius_scale: 0.02,
            halation_warmth: 0.3,
            halation_softness: 2.0,
            enable_dodge_burn: true,
            dodge_burn_strength: 0.2,
            dodge_burn_dodge_amount: 0.1,
            dodge_burn_burn_amount: 0.1,
            dodge_burn_saliency_radius: 0.08,
            dodge_burn_luminance_weight: 0.6,
        };

        let mut render_config = RenderConfig::default();
        render_config.exposure_normalization.boost = 2.0;

        // A "too dark" metric should increase boost toward target.
        let metrics = QualityMetrics {
            mean_luminance: 0.10,
            ..QualityMetrics::default()
        };

        let mut log = RandomizationLog::new(
            true,
            AestheticBiases { energy_vs_matter: 0.5, vintage_vs_digital: 0.5, complexity: 0.5 },
        );
        apply_quality_autotune(&mut resolved, &mut render_config, &metrics, &mut log);

        assert!(render_config.exposure_normalization.boost > 2.0);
        assert!(!log.effects.is_empty());
    }
}


