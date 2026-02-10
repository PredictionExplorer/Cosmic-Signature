//! Style family priors for broad but controlled aesthetic variation.

use crate::curation::QualityMode;
use crate::render::randomizable_config::ResolvedEffectConfig;
use crate::sim::Sha3RandomByteStream;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StyleFamily {
    VelvetNebula,
    GlassAurora,
    CobaltEmber,
    SolarRelic,
    InkConstellation,
    MineralPlasma,
    BronzeMirage,
    PolarCathedral,
    SilkTopology,
    LuminousManuscript,
    CoralVacuum,
    EtherFiligree,
}

#[derive(Clone, Copy, Debug)]
struct StylePriors {
    // Effect inclusion bias around baseline p=0.5 in range [-0.15, +0.15]
    bloom_bias: f64,
    glow_bias: f64,
    chromatic_bloom_bias: f64,
    perceptual_blur_bias: f64,
    micro_contrast_bias: f64,
    gradient_map_bias: f64,
    color_grade_bias: f64,
    champleve_bias: f64,
    aether_bias: f64,
    opalescence_bias: f64,
    edge_luminance_bias: f64,
    atmospheric_depth_bias: f64,
    fine_texture_bias: f64,

    // Parameter centers (used with shaped sampling, then mixed with random draw)
    bloom_strength_center: f64,
    glow_strength_center: f64,
    chromatic_strength_center: f64,
    color_grade_center: f64,
    vibrance_center: f64,
    texture_strength_center: f64,
    clip_black_center: f64,
    clip_white_center: f64,
    hdr_scale_center: f64,
}

impl StyleFamily {
    pub fn from_str(value: &str) -> Option<Self> {
        let normalized = value
            .to_ascii_lowercase()
            .replace(['-', '_'], " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        match normalized.as_str() {
            "velvet nebula" => Some(Self::VelvetNebula),
            "glass aurora" => Some(Self::GlassAurora),
            "cobalt ember" => Some(Self::CobaltEmber),
            "solar relic" => Some(Self::SolarRelic),
            "ink constellation" => Some(Self::InkConstellation),
            "mineral plasma" => Some(Self::MineralPlasma),
            "bronze mirage" => Some(Self::BronzeMirage),
            "polar cathedral" => Some(Self::PolarCathedral),
            "silk topology" => Some(Self::SilkTopology),
            "luminous manuscript" => Some(Self::LuminousManuscript),
            "coral vacuum" => Some(Self::CoralVacuum),
            "ether filigree" => Some(Self::EtherFiligree),
            _ => None,
        }
    }

    pub fn all() -> [Self; 12] {
        [
            Self::VelvetNebula,
            Self::GlassAurora,
            Self::CobaltEmber,
            Self::SolarRelic,
            Self::InkConstellation,
            Self::MineralPlasma,
            Self::BronzeMirage,
            Self::PolarCathedral,
            Self::SilkTopology,
            Self::LuminousManuscript,
            Self::CoralVacuum,
            Self::EtherFiligree,
        ]
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::VelvetNebula => "Velvet Nebula",
            Self::GlassAurora => "Glass Aurora",
            Self::CobaltEmber => "Cobalt Ember",
            Self::SolarRelic => "Solar Relic",
            Self::InkConstellation => "Ink Constellation",
            Self::MineralPlasma => "Mineral Plasma",
            Self::BronzeMirage => "Bronze Mirage",
            Self::PolarCathedral => "Polar Cathedral",
            Self::SilkTopology => "Silk Topology",
            Self::LuminousManuscript => "Luminous Manuscript",
            Self::CoralVacuum => "Coral Vacuum",
            Self::EtherFiligree => "Ether Filigree",
        }
    }

    pub fn random(rng: &mut Sha3RandomByteStream) -> Self {
        let families = Self::all();
        let idx = (rng.next_f64() * families.len() as f64).floor() as usize;
        families[idx.min(families.len() - 1)]
    }

    fn priors(self) -> StylePriors {
        match self {
            Self::VelvetNebula => StylePriors {
                bloom_bias: 0.10,
                glow_bias: 0.06,
                chromatic_bloom_bias: 0.02,
                perceptual_blur_bias: 0.08,
                micro_contrast_bias: -0.08,
                gradient_map_bias: 0.07,
                color_grade_bias: 0.04,
                champleve_bias: -0.05,
                aether_bias: 0.05,
                opalescence_bias: 0.03,
                edge_luminance_bias: -0.03,
                atmospheric_depth_bias: 0.07,
                fine_texture_bias: 0.01,
                bloom_strength_center: 0.68,
                glow_strength_center: 0.42,
                chromatic_strength_center: 0.55,
                color_grade_center: 0.45,
                vibrance_center: 1.08,
                texture_strength_center: 0.11,
                clip_black_center: 0.011,
                clip_white_center: 0.992,
                hdr_scale_center: 0.13,
            },
            Self::GlassAurora => StylePriors {
                bloom_bias: 0.04,
                glow_bias: 0.09,
                chromatic_bloom_bias: 0.12,
                perceptual_blur_bias: 0.11,
                micro_contrast_bias: -0.05,
                gradient_map_bias: 0.10,
                color_grade_bias: 0.02,
                champleve_bias: -0.10,
                aether_bias: 0.06,
                opalescence_bias: 0.10,
                edge_luminance_bias: -0.02,
                atmospheric_depth_bias: 0.02,
                fine_texture_bias: -0.08,
                bloom_strength_center: 0.54,
                glow_strength_center: 0.57,
                chromatic_strength_center: 0.72,
                color_grade_center: 0.34,
                vibrance_center: 1.14,
                texture_strength_center: 0.06,
                clip_black_center: 0.010,
                clip_white_center: 0.994,
                hdr_scale_center: 0.12,
            },
            Self::CobaltEmber => StylePriors {
                bloom_bias: -0.03,
                glow_bias: 0.03,
                chromatic_bloom_bias: 0.05,
                perceptual_blur_bias: -0.04,
                micro_contrast_bias: 0.10,
                gradient_map_bias: 0.08,
                color_grade_bias: 0.12,
                champleve_bias: 0.01,
                aether_bias: -0.02,
                opalescence_bias: 0.03,
                edge_luminance_bias: 0.08,
                atmospheric_depth_bias: -0.02,
                fine_texture_bias: 0.03,
                bloom_strength_center: 0.48,
                glow_strength_center: 0.38,
                chromatic_strength_center: 0.46,
                color_grade_center: 0.58,
                vibrance_center: 1.10,
                texture_strength_center: 0.14,
                clip_black_center: 0.012,
                clip_white_center: 0.991,
                hdr_scale_center: 0.14,
            },
            Self::SolarRelic => StylePriors {
                bloom_bias: 0.12,
                glow_bias: 0.08,
                chromatic_bloom_bias: -0.02,
                perceptual_blur_bias: 0.01,
                micro_contrast_bias: 0.04,
                gradient_map_bias: 0.14,
                color_grade_bias: 0.10,
                champleve_bias: 0.10,
                aether_bias: -0.06,
                opalescence_bias: 0.01,
                edge_luminance_bias: 0.03,
                atmospheric_depth_bias: 0.04,
                fine_texture_bias: 0.07,
                bloom_strength_center: 0.73,
                glow_strength_center: 0.44,
                chromatic_strength_center: 0.36,
                color_grade_center: 0.60,
                vibrance_center: 1.16,
                texture_strength_center: 0.16,
                clip_black_center: 0.013,
                clip_white_center: 0.989,
                hdr_scale_center: 0.15,
            },
            Self::InkConstellation => StylePriors {
                bloom_bias: -0.10,
                glow_bias: -0.08,
                chromatic_bloom_bias: -0.11,
                perceptual_blur_bias: -0.02,
                micro_contrast_bias: 0.14,
                gradient_map_bias: 0.06,
                color_grade_bias: 0.10,
                champleve_bias: 0.05,
                aether_bias: -0.04,
                opalescence_bias: -0.06,
                edge_luminance_bias: 0.11,
                atmospheric_depth_bias: -0.02,
                fine_texture_bias: 0.10,
                bloom_strength_center: 0.30,
                glow_strength_center: 0.22,
                chromatic_strength_center: 0.25,
                color_grade_center: 0.56,
                vibrance_center: 0.98,
                texture_strength_center: 0.18,
                clip_black_center: 0.014,
                clip_white_center: 0.990,
                hdr_scale_center: 0.10,
            },
            Self::MineralPlasma => StylePriors {
                bloom_bias: 0.05,
                glow_bias: 0.04,
                chromatic_bloom_bias: 0.09,
                perceptual_blur_bias: 0.06,
                micro_contrast_bias: 0.04,
                gradient_map_bias: 0.12,
                color_grade_bias: 0.03,
                champleve_bias: 0.12,
                aether_bias: 0.04,
                opalescence_bias: 0.09,
                edge_luminance_bias: 0.06,
                atmospheric_depth_bias: 0.00,
                fine_texture_bias: 0.09,
                bloom_strength_center: 0.62,
                glow_strength_center: 0.48,
                chromatic_strength_center: 0.70,
                color_grade_center: 0.42,
                vibrance_center: 1.20,
                texture_strength_center: 0.17,
                clip_black_center: 0.011,
                clip_white_center: 0.992,
                hdr_scale_center: 0.14,
            },
            Self::BronzeMirage => StylePriors {
                bloom_bias: 0.08,
                glow_bias: 0.03,
                chromatic_bloom_bias: -0.03,
                perceptual_blur_bias: 0.03,
                micro_contrast_bias: 0.08,
                gradient_map_bias: 0.12,
                color_grade_bias: 0.13,
                champleve_bias: 0.11,
                aether_bias: -0.01,
                opalescence_bias: -0.02,
                edge_luminance_bias: 0.08,
                atmospheric_depth_bias: 0.04,
                fine_texture_bias: 0.11,
                bloom_strength_center: 0.57,
                glow_strength_center: 0.36,
                chromatic_strength_center: 0.35,
                color_grade_center: 0.62,
                vibrance_center: 1.12,
                texture_strength_center: 0.19,
                clip_black_center: 0.013,
                clip_white_center: 0.989,
                hdr_scale_center: 0.15,
            },
            Self::PolarCathedral => StylePriors {
                bloom_bias: 0.06,
                glow_bias: 0.10,
                chromatic_bloom_bias: 0.08,
                perceptual_blur_bias: 0.12,
                micro_contrast_bias: -0.03,
                gradient_map_bias: 0.10,
                color_grade_bias: 0.01,
                champleve_bias: -0.05,
                aether_bias: 0.10,
                opalescence_bias: 0.11,
                edge_luminance_bias: 0.00,
                atmospheric_depth_bias: 0.09,
                fine_texture_bias: -0.06,
                bloom_strength_center: 0.66,
                glow_strength_center: 0.58,
                chromatic_strength_center: 0.68,
                color_grade_center: 0.30,
                vibrance_center: 1.05,
                texture_strength_center: 0.07,
                clip_black_center: 0.009,
                clip_white_center: 0.995,
                hdr_scale_center: 0.11,
            },
            Self::SilkTopology => StylePriors {
                bloom_bias: 0.02,
                glow_bias: 0.04,
                chromatic_bloom_bias: 0.04,
                perceptual_blur_bias: 0.14,
                micro_contrast_bias: -0.06,
                gradient_map_bias: 0.11,
                color_grade_bias: 0.02,
                champleve_bias: 0.00,
                aether_bias: 0.08,
                opalescence_bias: 0.08,
                edge_luminance_bias: -0.01,
                atmospheric_depth_bias: 0.05,
                fine_texture_bias: -0.03,
                bloom_strength_center: 0.58,
                glow_strength_center: 0.41,
                chromatic_strength_center: 0.53,
                color_grade_center: 0.36,
                vibrance_center: 1.06,
                texture_strength_center: 0.09,
                clip_black_center: 0.010,
                clip_white_center: 0.994,
                hdr_scale_center: 0.12,
            },
            Self::LuminousManuscript => StylePriors {
                bloom_bias: 0.07,
                glow_bias: 0.02,
                chromatic_bloom_bias: -0.02,
                perceptual_blur_bias: 0.01,
                micro_contrast_bias: 0.09,
                gradient_map_bias: 0.09,
                color_grade_bias: 0.14,
                champleve_bias: 0.13,
                aether_bias: -0.04,
                opalescence_bias: 0.00,
                edge_luminance_bias: 0.12,
                atmospheric_depth_bias: 0.03,
                fine_texture_bias: 0.14,
                bloom_strength_center: 0.52,
                glow_strength_center: 0.31,
                chromatic_strength_center: 0.30,
                color_grade_center: 0.67,
                vibrance_center: 1.08,
                texture_strength_center: 0.21,
                clip_black_center: 0.014,
                clip_white_center: 0.989,
                hdr_scale_center: 0.13,
            },
            Self::CoralVacuum => StylePriors {
                bloom_bias: 0.03,
                glow_bias: 0.11,
                chromatic_bloom_bias: 0.13,
                perceptual_blur_bias: 0.04,
                micro_contrast_bias: 0.02,
                gradient_map_bias: 0.10,
                color_grade_bias: 0.05,
                champleve_bias: -0.02,
                aether_bias: 0.06,
                opalescence_bias: 0.06,
                edge_luminance_bias: 0.04,
                atmospheric_depth_bias: 0.00,
                fine_texture_bias: 0.00,
                bloom_strength_center: 0.61,
                glow_strength_center: 0.61,
                chromatic_strength_center: 0.76,
                color_grade_center: 0.47,
                vibrance_center: 1.24,
                texture_strength_center: 0.10,
                clip_black_center: 0.011,
                clip_white_center: 0.993,
                hdr_scale_center: 0.14,
            },
            Self::EtherFiligree => StylePriors {
                bloom_bias: 0.04,
                glow_bias: 0.08,
                chromatic_bloom_bias: 0.06,
                perceptual_blur_bias: 0.10,
                micro_contrast_bias: 0.03,
                gradient_map_bias: 0.06,
                color_grade_bias: 0.03,
                champleve_bias: 0.08,
                aether_bias: 0.14,
                opalescence_bias: 0.08,
                edge_luminance_bias: 0.07,
                atmospheric_depth_bias: 0.07,
                fine_texture_bias: 0.04,
                bloom_strength_center: 0.56,
                glow_strength_center: 0.50,
                chromatic_strength_center: 0.58,
                color_grade_center: 0.40,
                vibrance_center: 1.12,
                texture_strength_center: 0.13,
                clip_black_center: 0.010,
                clip_white_center: 0.993,
                hdr_scale_center: 0.13,
            },
        }
    }
}

pub fn resolve_style_family(explicit: Option<&str>, rng: &mut Sha3RandomByteStream) -> StyleFamily {
    if let Some(value) = explicit {
        if let Some(style) = StyleFamily::from_str(value) {
            return style;
        }
    }
    StyleFamily::random(rng)
}

fn biased_bool(rng: &mut Sha3RandomByteStream, bias: f64) -> bool {
    let p = (0.5 + bias).clamp(0.05, 0.95);
    rng.next_f64() < p
}

fn triangular_01(rng: &mut Sha3RandomByteStream) -> f64 {
    // Triangular around 0.5 (not flat uniform) to reduce ugly tails while preserving spread.
    (rng.next_f64() + rng.next_f64()) * 0.5
}

fn sample_centered(
    rng: &mut Sha3RandomByteStream,
    center: f64,
    spread: f64,
    min: f64,
    max: f64,
    mode: QualityMode,
) -> f64 {
    let mode_scale = match mode {
        QualityMode::Strict => 0.70,
        QualityMode::Balanced => 0.85,
        QualityMode::Explore => 1.0,
    };
    let noise = (triangular_01(rng) - 0.5) * 2.0;
    (center + noise * spread * mode_scale).clamp(min, max)
}

pub fn apply_style_family(
    config: &mut ResolvedEffectConfig,
    family: StyleFamily,
    rng: &mut Sha3RandomByteStream,
    mode: QualityMode,
) -> Vec<String> {
    let priors = family.priors();
    let mut actions = vec![format!("style_family={}", family.name())];

    // Preserve the 50/50 center but bias by family-specific offsets.
    config.enable_bloom = biased_bool(rng, priors.bloom_bias);
    config.enable_glow = biased_bool(rng, priors.glow_bias);
    config.enable_chromatic_bloom = biased_bool(rng, priors.chromatic_bloom_bias);
    config.enable_perceptual_blur = biased_bool(rng, priors.perceptual_blur_bias);
    config.enable_micro_contrast = biased_bool(rng, priors.micro_contrast_bias);
    config.enable_gradient_map = biased_bool(rng, priors.gradient_map_bias);
    config.enable_color_grade = biased_bool(rng, priors.color_grade_bias);
    config.enable_champleve = biased_bool(rng, priors.champleve_bias);
    config.enable_aether = biased_bool(rng, priors.aether_bias);
    config.enable_opalescence = biased_bool(rng, priors.opalescence_bias);
    config.enable_edge_luminance = biased_bool(rng, priors.edge_luminance_bias);
    config.enable_atmospheric_depth = biased_bool(rng, priors.atmospheric_depth_bias);
    config.enable_fine_texture = biased_bool(rng, priors.fine_texture_bias);

    // Keep broad variation while reducing extreme tails with centered sampling.
    config.dog_strength = 0.5 * config.dog_strength
        + 0.5 * sample_centered(rng, priors.bloom_strength_center, 0.33, 0.05, 0.90, mode);
    config.glow_strength = 0.5 * config.glow_strength
        + 0.5 * sample_centered(rng, priors.glow_strength_center, 0.30, 0.05, 0.90, mode);
    config.chromatic_bloom_strength = 0.5 * config.chromatic_bloom_strength
        + 0.5 * sample_centered(rng, priors.chromatic_strength_center, 0.30, 0.10, 0.95, mode);
    config.color_grade_strength = 0.5 * config.color_grade_strength
        + 0.5 * sample_centered(rng, priors.color_grade_center, 0.28, 0.10, 0.85, mode);
    config.vibrance = 0.5 * config.vibrance
        + 0.5 * sample_centered(rng, priors.vibrance_center, 0.30, 0.75, 1.45, mode);
    config.fine_texture_strength = 0.5 * config.fine_texture_strength
        + 0.5 * sample_centered(rng, priors.texture_strength_center, 0.10, 0.03, 0.30, mode);
    config.clip_black = 0.5 * config.clip_black
        + 0.5 * sample_centered(rng, priors.clip_black_center, 0.010, 0.004, 0.030, mode);
    config.clip_white = 0.5 * config.clip_white
        + 0.5 * sample_centered(rng, priors.clip_white_center, 0.010, 0.980, 0.998, mode);
    config.hdr_scale = 0.5 * config.hdr_scale
        + 0.5 * sample_centered(rng, priors.hdr_scale_center, 0.05, 0.06, 0.24, mode);
    config.nebula_strength = sample_centered(rng, 0.07, 0.05, 0.02, 0.12, mode);

    actions.extend(apply_beauty_constraints(config));
    actions
}

pub fn apply_beauty_constraints(config: &mut ResolvedEffectConfig) -> Vec<String> {
    let mut actions = Vec::new();

    // Ensure at least one luminous enhancer is active.
    if !(config.enable_bloom || config.enable_glow || config.enable_chromatic_bloom) {
        config.enable_bloom = true;
        config.dog_strength = config.dog_strength.max(0.28);
        actions.push("constraint:enabled_bloom_for_minimum_luminous_structure".to_string());
    }

    // Cap over-stylization collisions.
    if config.enable_gradient_map && config.enable_color_grade {
        let combined = config.gradient_map_strength + config.color_grade_strength;
        if combined > 1.35 {
            let scale = 1.35 / combined;
            config.gradient_map_strength *= scale;
            config.color_grade_strength *= scale;
            actions.push("constraint:capped_gradient_plus_grade_intensity".to_string());
        }
    }

    // High opalescence layers can get noisy with strong texture.
    if config.enable_opalescence
        && config.opalescence_layers >= 5
        && config.fine_texture_contrast > 0.40
    {
        config.fine_texture_contrast = 0.40;
        actions.push("constraint:reduced_texture_contrast_for_high_opalescence".to_string());
    }

    // Prevent extreme clipping collapse.
    if config.clip_black > 0.020 && config.clip_white < 0.985 {
        config.clip_black = 0.018;
        config.clip_white = 0.990;
        actions.push("constraint:clipping_pair_rebalanced".to_string());
    }

    actions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rng() -> Sha3RandomByteStream {
        Sha3RandomByteStream::new(&[1, 2, 3, 4], 100.0, 300.0, 300.0, 1.0)
    }

    fn sample_config() -> ResolvedEffectConfig {
        // A minimal realistic config fixture for tests.
        ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: false,
            special_mode: false,
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
            enable_fine_texture: true,
            blur_strength: 9.0,
            blur_radius_scale: 0.018,
            blur_core_brightness: 9.0,
            dog_strength: 0.35,
            dog_sigma_scale: 0.007,
            dog_ratio: 2.8,
            glow_strength: 0.42,
            glow_threshold: 0.66,
            glow_radius_scale: 0.008,
            glow_sharpness: 2.8,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.62,
            chromatic_bloom_radius_scale: 0.011,
            chromatic_bloom_separation_scale: 0.0022,
            chromatic_bloom_threshold: 0.18,
            perceptual_blur_strength: 0.64,
            color_grade_strength: 0.45,
            vignette_strength: 0.35,
            vignette_softness: 2.6,
            vibrance: 1.12,
            clarity_strength: 0.28,
            tone_curve_strength: 0.52,
            gradient_map_strength: 0.70,
            gradient_map_hue_preservation: 0.20,
            gradient_map_palette: 7,
            opalescence_strength: 0.18,
            opalescence_scale: 0.010,
            opalescence_layers: 3,
            champleve_flow_alignment: 0.62,
            champleve_interference_amplitude: 0.52,
            champleve_rim_intensity: 1.8,
            champleve_rim_warmth: 0.62,
            champleve_interior_lift: 0.62,
            aether_flow_alignment: 0.72,
            aether_scattering_strength: 0.92,
            aether_iridescence_amplitude: 0.60,
            aether_caustic_strength: 0.28,
            micro_contrast_strength: 0.28,
            micro_contrast_radius: 5,
            edge_luminance_strength: 0.22,
            edge_luminance_threshold: 0.18,
            edge_luminance_brightness_boost: 0.32,
            atmospheric_depth_strength: 0.24,
            atmospheric_desaturation: 0.34,
            atmospheric_darkening: 0.16,
            atmospheric_fog_color_r: 0.08,
            atmospheric_fog_color_g: 0.12,
            atmospheric_fog_color_b: 0.18,
            fine_texture_strength: 0.11,
            fine_texture_scale: 0.0017,
            fine_texture_contrast: 0.32,
            hdr_scale: 0.12,
            clip_black: 0.010,
            clip_white: 0.990,
            nebula_strength: 0.08,
            nebula_octaves: 4,
            nebula_base_frequency: 0.0015,
        }
    }

    #[test]
    fn style_parse_works_for_multiple_formats() {
        assert_eq!(StyleFamily::from_str("Velvet Nebula"), Some(StyleFamily::VelvetNebula));
        assert_eq!(StyleFamily::from_str("velvet-nebula"), Some(StyleFamily::VelvetNebula));
        assert_eq!(StyleFamily::from_str("velvet_nebula"), Some(StyleFamily::VelvetNebula));
        assert_eq!(StyleFamily::from_str("unknown"), None);
    }

    #[test]
    fn beauty_constraints_enforce_luminous_effect() {
        let mut config = sample_config();
        config.enable_bloom = false;
        config.enable_glow = false;
        config.enable_chromatic_bloom = false;
        let actions = apply_beauty_constraints(&mut config);
        assert!(config.enable_bloom);
        assert!(!actions.is_empty());
    }

    #[test]
    fn style_application_is_bounded() {
        let mut config = sample_config();
        let mut rng = rng();
        let _ = apply_style_family(
            &mut config,
            StyleFamily::PolarCathedral,
            &mut rng,
            QualityMode::Strict,
        );
        assert!((0.004..=0.030).contains(&config.clip_black));
        assert!((0.980..=0.998).contains(&config.clip_white));
        assert!((0.06..=0.24).contains(&config.hdr_scale));
    }

    #[test]
    fn strict_mode_nebula_strength_stays_subtle() {
        for seed in 1..64u8 {
            let mut config = sample_config();
            let mut rng = Sha3RandomByteStream::new(&[seed, 2, 3, 4], 100.0, 300.0, 300.0, 1.0);
            let _ = apply_style_family(
                &mut config,
                StyleFamily::VelvetNebula,
                &mut rng,
                QualityMode::Strict,
            );
            assert!(
                (0.03..=0.11).contains(&config.nebula_strength),
                "strict mode nebula strength out of subtle range: {}",
                config.nebula_strength
            );
        }
    }

    #[test]
    fn explore_mode_nebula_strength_respects_global_cap() {
        for seed in 1..64u8 {
            let mut config = sample_config();
            let mut rng = Sha3RandomByteStream::new(&[seed, 5, 6, 7], 100.0, 300.0, 300.0, 1.0);
            let _ = apply_style_family(
                &mut config,
                StyleFamily::GlassAurora,
                &mut rng,
                QualityMode::Explore,
            );
            assert!(
                (0.02..=0.12).contains(&config.nebula_strength),
                "explore mode nebula strength must stay within global subtle bounds: {}",
                config.nebula_strength
            );
        }
    }
}
