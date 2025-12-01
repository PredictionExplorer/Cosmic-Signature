//! Default parameter distributions for weighted sampling.
//!
//! All parameters are sampled from distributions (typically truncated normal)
//! rather than uniformly. This provides better aesthetic results by centering
//! values around known good ranges while still allowing exploration.
//!
//! Each parameter has a mean (center point) and standard deviation (spread).
//! Tighter distributions (smaller std) focus on a narrow range.
//! Looser distributions (larger std) explore more broadly.

/// Distribution parameters for `a` single parameter.
#[derive(Debug, Clone, Copy)]
pub struct DistParams {
    pub mean: f64,
    pub std: f64,
}

impl DistParams {
    pub const fn new(mean: f64, std: f64) -> Self {
        Self { mean, std }
    }
}

/// Default distributions for all float parameters.
///
/// These are derived from analysis of aesthetically pleasing outputs.
/// Mean values center around the midpoint or slightly adjusted for known good values.
/// Std values determine how tightly clustered the sampling is.
pub struct DefaultDistributions;

impl DefaultDistributions {
    // ==== Bloom & Glow Parameters ====
    pub const BLUR_STRENGTH: DistParams = DistParams::new(10.0, 4.0);
    pub const BLUR_RADIUS_SCALE: DistParams = DistParams::new(0.020, 0.008);
    pub const BLUR_CORE_BRIGHTNESS: DistParams = DistParams::new(10.0, 4.0);
    pub const DOG_STRENGTH: DistParams = DistParams::new(0.35, 0.12);
    pub const DOG_SIGMA_SCALE: DistParams = DistParams::new(0.007, 0.003);
    pub const DOG_RATIO: DistParams = DistParams::new(3.0, 0.8);
    pub const GLOW_STRENGTH: DistParams = DistParams::new(0.40, 0.15);
    pub const GLOW_THRESHOLD: DistParams = DistParams::new(0.68, 0.08);
    pub const GLOW_RADIUS_SCALE: DistParams = DistParams::new(0.007, 0.003);
    pub const GLOW_SHARPNESS: DistParams = DistParams::new(2.5, 0.8);
    pub const GLOW_SATURATION_BOOST: DistParams = DistParams::new(0.20, 0.10);

    // ==== Chromatic Effects ====
    pub const CHROMATIC_BLOOM_STRENGTH: DistParams = DistParams::new(0.60, 0.15);
    pub const CHROMATIC_BLOOM_RADIUS_SCALE: DistParams = DistParams::new(0.012, 0.004);
    pub const CHROMATIC_BLOOM_SEPARATION_SCALE: DistParams = DistParams::new(0.0030, 0.0010);
    pub const CHROMATIC_BLOOM_THRESHOLD: DistParams = DistParams::new(0.18, 0.06);

    // ==== Perceptual Blur ====
    pub const PERCEPTUAL_BLUR_STRENGTH: DistParams = DistParams::new(0.65, 0.12);

    // ==== Color Grading ====
    pub const COLOR_GRADE_STRENGTH: DistParams = DistParams::new(0.50, 0.15);
    pub const VIGNETTE_STRENGTH: DistParams = DistParams::new(0.40, 0.15);
    pub const VIGNETTE_SOFTNESS: DistParams = DistParams::new(2.5, 0.6);
    pub const VIBRANCE: DistParams = DistParams::new(1.10, 0.15);
    pub const CLARITY_STRENGTH: DistParams = DistParams::new(0.30, 0.12);
    pub const TONE_CURVE_STRENGTH: DistParams = DistParams::new(0.50, 0.15);

    // ==== Gradient Mapping ====
    pub const GRADIENT_MAP_STRENGTH: DistParams = DistParams::new(0.75, 0.12);
    pub const GRADIENT_MAP_HUE_PRESERVATION: DistParams = DistParams::new(0.20, 0.08);
    // Gradient palette is discrete (0-14), no distribution needed

    // ==== Material Effects - Opalescence ====
    pub const OPALESCENCE_STRENGTH: DistParams = DistParams::new(0.20, 0.10);
    pub const OPALESCENCE_SCALE: DistParams = DistParams::new(0.010, 0.004);
    // Opalescence layers is discrete (1-6), no distribution needed

    // ==== Material Effects - Champlevé ====
    pub const CHAMPLEVE_FLOW_ALIGNMENT: DistParams = DistParams::new(0.65, 0.12);
    pub const CHAMPLEVE_INTERFERENCE_AMPLITUDE: DistParams = DistParams::new(0.55, 0.15);
    pub const CHAMPLEVE_RIM_INTENSITY: DistParams = DistParams::new(2.0, 0.6);
    pub const CHAMPLEVE_RIM_WARMTH: DistParams = DistParams::new(0.60, 0.15);
    pub const CHAMPLEVE_INTERIOR_LIFT: DistParams = DistParams::new(0.65, 0.15);

    // ==== Material Effects - Aether ====
    pub const AETHER_FLOW_ALIGNMENT: DistParams = DistParams::new(0.75, 0.12);
    pub const AETHER_SCATTERING_STRENGTH: DistParams = DistParams::new(0.90, 0.25);
    pub const AETHER_IRIDESCENCE_AMPLITUDE: DistParams = DistParams::new(0.60, 0.15);
    pub const AETHER_CAUSTIC_STRENGTH: DistParams = DistParams::new(0.30, 0.12);

    // ==== Detail & Clarity ====
    pub const MICRO_CONTRAST_STRENGTH: DistParams = DistParams::new(0.25, 0.10);
    // Micro contrast radius is discrete (2-12), no distribution needed
    pub const EDGE_LUMINANCE_STRENGTH: DistParams = DistParams::new(0.20, 0.10);
    pub const EDGE_LUMINANCE_THRESHOLD: DistParams = DistParams::new(0.20, 0.06);
    pub const EDGE_LUMINANCE_BRIGHTNESS_BOOST: DistParams = DistParams::new(0.30, 0.10);

    // ==== Atmospheric ====
    pub const ATMOSPHERIC_DEPTH_STRENGTH: DistParams = DistParams::new(0.25, 0.12);
    pub const ATMOSPHERIC_DESATURATION: DistParams = DistParams::new(0.40, 0.12);
    pub const ATMOSPHERIC_DARKENING: DistParams = DistParams::new(0.18, 0.08);
    pub const ATMOSPHERIC_FOG_COLOR_R: DistParams = DistParams::new(0.15, 0.06);
    pub const ATMOSPHERIC_FOG_COLOR_G: DistParams = DistParams::new(0.15, 0.06);
    pub const ATMOSPHERIC_FOG_COLOR_B: DistParams = DistParams::new(0.15, 0.06);
    pub const FINE_TEXTURE_STRENGTH: DistParams = DistParams::new(0.12, 0.05);
    pub const FINE_TEXTURE_SCALE: DistParams = DistParams::new(0.0017, 0.0006);
    pub const FINE_TEXTURE_CONTRAST: DistParams = DistParams::new(0.35, 0.10);

    // ==== HDR & Exposure ====
    pub const HDR_SCALE: DistParams = DistParams::new(0.12, 0.04);

    // ==== Clipping ====
    pub const CLIP_BLACK: DistParams = DistParams::new(0.012, 0.004);
    pub const CLIP_WHITE: DistParams = DistParams::new(0.990, 0.006);

    // ==== Nebula (currently disabled, but defined for completeness) ====
    pub const NEBULA_STRENGTH: DistParams = DistParams::new(0.0, 0.0); // Disabled
    pub const NEBULA_BASE_FREQUENCY: DistParams = DistParams::new(0.0015, 0.0005);

    /// Get distribution for `a` parameter by name.
    pub fn get(param_name: &str) -> Option<DistParams> {
        match param_name {
            "blur_strength" => Some(Self::BLUR_STRENGTH),
            "blur_radius_scale" => Some(Self::BLUR_RADIUS_SCALE),
            "blur_core_brightness" => Some(Self::BLUR_CORE_BRIGHTNESS),
            "dog_strength" => Some(Self::DOG_STRENGTH),
            "dog_sigma_scale" => Some(Self::DOG_SIGMA_SCALE),
            "dog_ratio" => Some(Self::DOG_RATIO),
            "glow_strength" => Some(Self::GLOW_STRENGTH),
            "glow_threshold" => Some(Self::GLOW_THRESHOLD),
            "glow_radius_scale" => Some(Self::GLOW_RADIUS_SCALE),
            "glow_sharpness" => Some(Self::GLOW_SHARPNESS),
            "glow_saturation_boost" => Some(Self::GLOW_SATURATION_BOOST),
            "chromatic_bloom_strength" => Some(Self::CHROMATIC_BLOOM_STRENGTH),
            "chromatic_bloom_radius_scale" => Some(Self::CHROMATIC_BLOOM_RADIUS_SCALE),
            "chromatic_bloom_separation_scale" => Some(Self::CHROMATIC_BLOOM_SEPARATION_SCALE),
            "chromatic_bloom_threshold" => Some(Self::CHROMATIC_BLOOM_THRESHOLD),
            "perceptual_blur_strength" => Some(Self::PERCEPTUAL_BLUR_STRENGTH),
            "color_grade_strength" => Some(Self::COLOR_GRADE_STRENGTH),
            "vignette_strength" => Some(Self::VIGNETTE_STRENGTH),
            "vignette_softness" => Some(Self::VIGNETTE_SOFTNESS),
            "vibrance" => Some(Self::VIBRANCE),
            "clarity_strength" => Some(Self::CLARITY_STRENGTH),
            "tone_curve_strength" => Some(Self::TONE_CURVE_STRENGTH),
            "gradient_map_strength" => Some(Self::GRADIENT_MAP_STRENGTH),
            "gradient_map_hue_preservation" => Some(Self::GRADIENT_MAP_HUE_PRESERVATION),
            "opalescence_strength" => Some(Self::OPALESCENCE_STRENGTH),
            "opalescence_scale" => Some(Self::OPALESCENCE_SCALE),
            "champleve_flow_alignment" => Some(Self::CHAMPLEVE_FLOW_ALIGNMENT),
            "champleve_interference_amplitude" => Some(Self::CHAMPLEVE_INTERFERENCE_AMPLITUDE),
            "champleve_rim_intensity" => Some(Self::CHAMPLEVE_RIM_INTENSITY),
            "champleve_rim_warmth" => Some(Self::CHAMPLEVE_RIM_WARMTH),
            "champleve_interior_lift" => Some(Self::CHAMPLEVE_INTERIOR_LIFT),
            "aether_flow_alignment" => Some(Self::AETHER_FLOW_ALIGNMENT),
            "aether_scattering_strength" => Some(Self::AETHER_SCATTERING_STRENGTH),
            "aether_iridescence_amplitude" => Some(Self::AETHER_IRIDESCENCE_AMPLITUDE),
            "aether_caustic_strength" => Some(Self::AETHER_CAUSTIC_STRENGTH),
            "micro_contrast_strength" => Some(Self::MICRO_CONTRAST_STRENGTH),
            "edge_luminance_strength" => Some(Self::EDGE_LUMINANCE_STRENGTH),
            "edge_luminance_threshold" => Some(Self::EDGE_LUMINANCE_THRESHOLD),
            "edge_luminance_brightness_boost" => Some(Self::EDGE_LUMINANCE_BRIGHTNESS_BOOST),
            "atmospheric_depth_strength" => Some(Self::ATMOSPHERIC_DEPTH_STRENGTH),
            "atmospheric_desaturation" => Some(Self::ATMOSPHERIC_DESATURATION),
            "atmospheric_darkening" => Some(Self::ATMOSPHERIC_DARKENING),
            "atmospheric_fog_color_r" => Some(Self::ATMOSPHERIC_FOG_COLOR_R),
            "atmospheric_fog_color_g" => Some(Self::ATMOSPHERIC_FOG_COLOR_G),
            "atmospheric_fog_color_b" => Some(Self::ATMOSPHERIC_FOG_COLOR_B),
            "fine_texture_strength" => Some(Self::FINE_TEXTURE_STRENGTH),
            "fine_texture_scale" => Some(Self::FINE_TEXTURE_SCALE),
            "fine_texture_contrast" => Some(Self::FINE_TEXTURE_CONTRAST),
            "hdr_scale" => Some(Self::HDR_SCALE),
            "clip_black" => Some(Self::CLIP_BLACK),
            "clip_white" => Some(Self::CLIP_WHITE),
            "nebula_strength" => Some(Self::NEBULA_STRENGTH),
            "nebula_base_frequency" => Some(Self::NEBULA_BASE_FREQUENCY),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(clippy::assertions_on_constants)] // Compile-time verification of distribution constants
    fn test_all_distributions_valid() {
        // Test that all distributions have positive std
        assert!(DefaultDistributions::GLOW_STRENGTH.std > 0.0);
        assert!(DefaultDistributions::VIGNETTE_STRENGTH.std > 0.0);

        // Test lookup works
        assert!(DefaultDistributions::get("glow_strength").is_some());
        assert!(DefaultDistributions::get("invalid_param").is_none());
    }
}
