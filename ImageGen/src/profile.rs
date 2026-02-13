//! Loadable/savable effect profiles.
//!
//! A profile freezes the full resolved effect configuration so we can:
//! - reproduce a known-good look without expensive curation
//! - generate many variants efficiently (e.g. reuse the same profile across orbits)

use crate::error::{ConfigError, Result};
use crate::render::randomizable_config::ResolvedEffectConfig;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufReader, BufWriter};
use std::path::Path;

pub const EFFECT_PROFILE_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EffectProfile {
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub config: ResolvedEffectConfig,
}

impl EffectProfile {
    pub fn new(name: Option<String>, config: ResolvedEffectConfig) -> Self {
        Self { version: EFFECT_PROFILE_VERSION, name, config }
    }
}

pub fn load_effect_profile(path: &str) -> Result<EffectProfile> {
    let path_obj = Path::new(path);
    let file = std::fs::File::open(path_obj).map_err(|e| ConfigError::FileSystem {
        operation: "open file".to_string(),
        path: path.to_string(),
        error: e,
    })?;

    let reader = BufReader::new(file);
    let profile: EffectProfile = serde_json::from_reader(reader).map_err(|e| ConfigError::Json {
        operation: "parse effect profile".to_string(),
        path: path.to_string(),
        error: e,
    })?;

    Ok(profile)
}

pub fn save_effect_profile(path: &str, profile: &EffectProfile) -> Result<()> {
    let path_obj = Path::new(path);

    let file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path_obj)
        .map_err(|e| ConfigError::FileSystem {
            operation: "write file".to_string(),
            path: path.to_string(),
            error: e,
        })?;

    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, profile).map_err(|e| ConfigError::Json {
        operation: "serialize effect profile".to_string(),
        path: path.to_string(),
        error: e,
    })?;

    Ok(())
}

pub fn resolved_config_from_randomization_log(
    log: &crate::render::effect_randomizer::RandomizationLog,
    width: u32,
    height: u32,
    special_mode: bool,
) -> Result<ResolvedEffectConfig> {
    use std::collections::HashMap;

    let mut enables: HashMap<&str, bool> = HashMap::new();
    let mut params: HashMap<&str, String> = HashMap::new();

    for record in &log.effects {
        match record.effect_name.as_str() {
            "bloom" | "glow" | "chromatic_bloom" | "perceptual_blur" | "micro_contrast"
            | "gradient_map" | "color_grade" | "champleve" | "aether" | "opalescence"
            | "edge_luminance" | "atmospheric_depth" | "fine_texture" => {
                enables.insert(record.effect_name.as_str(), record.enabled);
            }
            _ => {}
        }

        for p in &record.parameters {
            params.insert(p.name.as_str(), p.value.clone());
        }
    }

    let missing = |what: &str| -> crate::error::AppError {
        crate::error::ConfigError::InvalidProfile { reason: what.to_string() }.into()
    };

    let parse_f64 = |name: &str| -> Result<f64> {
        let value = params
            .get(name)
            .ok_or_else(|| missing(&format!("randomization_log missing parameter '{name}'")))?;
        value.parse::<f64>().map_err(|_| {
            missing(&format!("randomization_log parameter '{name}' not a float: '{value}'"))
        })
    };

    let parse_usize = |name: &str| -> Result<usize> {
        let value = params
            .get(name)
            .ok_or_else(|| missing(&format!("randomization_log missing parameter '{name}'")))?;
        value.parse::<usize>().map_err(|_| {
            missing(&format!("randomization_log parameter '{name}' not an int: '{value}'"))
        })
    };

    let parse_enable = |name: &str| -> Result<bool> {
        enables
            .get(name)
            .copied()
            .ok_or_else(|| missing(&format!("randomization_log missing enable flag '{name}'")))
    };

    Ok(ResolvedEffectConfig {
        width,
        height,
        gallery_quality: log.gallery_quality,
        special_mode,

        enable_bloom: parse_enable("bloom")?,
        enable_glow: parse_enable("glow")?,
        enable_chromatic_bloom: parse_enable("chromatic_bloom")?,
        enable_perceptual_blur: parse_enable("perceptual_blur")?,
        enable_micro_contrast: parse_enable("micro_contrast")?,
        enable_gradient_map: parse_enable("gradient_map")?,
        enable_color_grade: parse_enable("color_grade")?,
        enable_champleve: parse_enable("champleve")?,
        enable_aether: parse_enable("aether")?,
        enable_opalescence: parse_enable("opalescence")?,
        enable_edge_luminance: parse_enable("edge_luminance")?,
        enable_atmospheric_depth: parse_enable("atmospheric_depth")?,
        enable_fine_texture: parse_enable("fine_texture")?,

        blur_strength: parse_f64("blur_strength")?,
        blur_radius_scale: parse_f64("blur_radius_scale")?,
        blur_core_brightness: parse_f64("blur_core_brightness")?,
        dog_strength: parse_f64("dog_strength")?,
        dog_sigma_scale: parse_f64("dog_sigma_scale")?,
        dog_ratio: parse_f64("dog_ratio")?,
        glow_strength: parse_f64("glow_strength")?,
        glow_threshold: parse_f64("glow_threshold")?,
        glow_radius_scale: parse_f64("glow_radius_scale")?,
        glow_sharpness: parse_f64("glow_sharpness")?,
        glow_saturation_boost: parse_f64("glow_saturation_boost")?,
        chromatic_bloom_strength: parse_f64("chromatic_bloom_strength")?,
        chromatic_bloom_radius_scale: parse_f64("chromatic_bloom_radius_scale")?,
        chromatic_bloom_separation_scale: parse_f64("chromatic_bloom_separation_scale")?,
        chromatic_bloom_threshold: parse_f64("chromatic_bloom_threshold")?,
        perceptual_blur_strength: parse_f64("perceptual_blur_strength")?,
        color_grade_strength: parse_f64("color_grade_strength")?,
        vignette_strength: parse_f64("vignette_strength")?,
        vignette_softness: parse_f64("vignette_softness")?,
        vibrance: parse_f64("vibrance")?,
        clarity_strength: parse_f64("clarity_strength")?,
        tone_curve_strength: parse_f64("tone_curve_strength")?,
        gradient_map_strength: parse_f64("gradient_map_strength")?,
        gradient_map_hue_preservation: parse_f64("gradient_map_hue_preservation")?,
        gradient_map_palette: parse_usize("gradient_map_palette")?,
        opalescence_strength: parse_f64("opalescence_strength")?,
        opalescence_scale: parse_f64("opalescence_scale")?,
        opalescence_layers: parse_usize("opalescence_layers")?,
        champleve_flow_alignment: parse_f64("champleve_flow_alignment")?,
        champleve_interference_amplitude: parse_f64("champleve_interference_amplitude")?,
        champleve_rim_intensity: parse_f64("champleve_rim_intensity")?,
        champleve_rim_warmth: parse_f64("champleve_rim_warmth")?,
        champleve_interior_lift: parse_f64("champleve_interior_lift")?,
        aether_flow_alignment: parse_f64("aether_flow_alignment")?,
        aether_scattering_strength: parse_f64("aether_scattering_strength")?,
        aether_iridescence_amplitude: parse_f64("aether_iridescence_amplitude")?,
        aether_caustic_strength: parse_f64("aether_caustic_strength")?,
        micro_contrast_strength: parse_f64("micro_contrast_strength")?,
        micro_contrast_radius: parse_usize("micro_contrast_radius")?,
        edge_luminance_strength: parse_f64("edge_luminance_strength")?,
        edge_luminance_threshold: parse_f64("edge_luminance_threshold")?,
        edge_luminance_brightness_boost: parse_f64("edge_luminance_brightness_boost")?,
        atmospheric_depth_strength: parse_f64("atmospheric_depth_strength")?,
        atmospheric_desaturation: parse_f64("atmospheric_desaturation")?,
        atmospheric_darkening: parse_f64("atmospheric_darkening")?,
        atmospheric_fog_color_r: parse_f64("atmospheric_fog_color_r")?,
        atmospheric_fog_color_g: parse_f64("atmospheric_fog_color_g")?,
        atmospheric_fog_color_b: parse_f64("atmospheric_fog_color_b")?,
        fine_texture_strength: parse_f64("fine_texture_strength")?,
        fine_texture_scale: parse_f64("fine_texture_scale")?,
        fine_texture_contrast: parse_f64("fine_texture_contrast")?,
        hdr_scale: parse_f64("hdr_scale")?,
        clip_black: parse_f64("clip_black")?,
        clip_white: parse_f64("clip_white")?,
        nebula_strength: parse_f64("nebula_strength")?,
        nebula_octaves: parse_usize("nebula_octaves")?,
        nebula_base_frequency: parse_f64("nebula_base_frequency")?,
    })
}
