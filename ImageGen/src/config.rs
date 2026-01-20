use serde::Deserialize;
use std::error::Error;
use std::fs;

#[derive(Debug, Deserialize, Default)]
pub struct AppConfig {
    pub aesthetic_preset: Option<String>,
    pub style_preset: Option<String>,
    pub effects: Option<EffectsConfig>,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub struct EffectsConfig {
    pub blackbody_enabled: Option<bool>,
    pub curvature_emboss_enabled: Option<bool>,
    pub flow_blur_enabled: Option<bool>,
    pub lensing_enabled: Option<bool>,
    pub subsurface_enabled: Option<bool>,
    pub dichroic_enabled: Option<bool>,
    pub ferrofluid_enabled: Option<bool>,
    pub temporal_echoes_enabled: Option<bool>,
    pub diffraction_spikes_enabled: Option<bool>,
    pub chromatic_dispersion_enabled: Option<bool>,
    pub spectral_interference_enabled: Option<bool>,
    pub aether_enabled: Option<bool>,
    pub champleve_enabled: Option<bool>,
    pub color_grade_enabled: Option<bool>,
    pub perceptual_blur_enabled: Option<bool>,
    pub fuse_pixel_effects: Option<bool>,
    pub manuscript_enabled: Option<bool>,
}

pub fn load_config(path: &str) -> Result<AppConfig, Box<dyn Error>> {
    let contents = fs::read_to_string(path)?;
    let config: AppConfig = toml::from_str(&contents)?;
    Ok(config)
}

impl From<&EffectsConfig> for crate::render::effects::EffectOverrides {
    fn from(config: &EffectsConfig) -> Self {
        Self {
            blackbody_enabled: config.blackbody_enabled,
            curvature_emboss_enabled: config.curvature_emboss_enabled,
            flow_blur_enabled: config.flow_blur_enabled,
            lensing_enabled: config.lensing_enabled,
            subsurface_enabled: config.subsurface_enabled,
            dichroic_enabled: config.dichroic_enabled,
            ferrofluid_enabled: config.ferrofluid_enabled,
            temporal_echoes_enabled: config.temporal_echoes_enabled,
            diffraction_spikes_enabled: config.diffraction_spikes_enabled,
            chromatic_dispersion_enabled: config.chromatic_dispersion_enabled,
            spectral_interference_enabled: config.spectral_interference_enabled,
            aether_enabled: config.aether_enabled,
            champleve_enabled: config.champleve_enabled,
            color_grade_enabled: config.color_grade_enabled,
            perceptual_blur_enabled: config.perceptual_blur_enabled,
            fuse_pixel_effects: config.fuse_pixel_effects,
            manuscript_enabled: config.manuscript_enabled,
        }
    }
}
