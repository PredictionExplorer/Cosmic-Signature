//! Randomizable configuration for all effect parameters.
//!
//! This module defines the complete parameter space for effect configuration,
//! with support for explicit user values or random generation.

use super::effect_randomizer::{EffectRandomizer, RandomizationLog, RandomizationRecord};
use super::parameter_descriptors as pd;
use crate::sim::Sha3RandomByteStream;

/// Complete configuration for all randomizable effect parameters.
/// Each field is Option<T>: None means "randomize this", Some(T) means "use explicit value".
#[derive(Clone, Debug, Default)]
pub struct RandomizableEffectConfig {
    // Gallery quality mode
    pub gallery_quality: bool,

    // Effect enable/disable flags
    pub enable_bloom: Option<bool>,
    pub enable_glow: Option<bool>,
    pub enable_chromatic_bloom: Option<bool>,
    pub enable_perceptual_blur: Option<bool>,
    pub enable_micro_contrast: Option<bool>,
    pub enable_gradient_map: Option<bool>,
    pub enable_color_grade: Option<bool>,
    pub enable_champleve: Option<bool>,
    pub enable_aether: Option<bool>,
    pub enable_opalescence: Option<bool>,
    pub enable_edge_luminance: Option<bool>,
    pub enable_atmospheric_depth: Option<bool>,
    pub enable_fine_texture: Option<bool>,

    // Bloom & Glow parameters
    pub blur_strength: Option<f64>,
    pub blur_radius_scale: Option<f64>,
    pub blur_core_brightness: Option<f64>,
    pub dog_strength: Option<f64>,
    pub dog_sigma_scale: Option<f64>,
    pub dog_ratio: Option<f64>,
    pub glow_strength: Option<f64>,
    pub glow_threshold: Option<f64>,
    pub glow_radius_scale: Option<f64>,
    pub glow_sharpness: Option<f64>,
    pub glow_saturation_boost: Option<f64>,

    // Chromatic effects
    pub chromatic_bloom_strength: Option<f64>,
    pub chromatic_bloom_radius_scale: Option<f64>,
    pub chromatic_bloom_separation_scale: Option<f64>,
    pub chromatic_bloom_threshold: Option<f64>,

    // Perceptual blur
    pub perceptual_blur_strength: Option<f64>,

    // Color grading
    pub color_grade_strength: Option<f64>,
    pub vignette_strength: Option<f64>,
    pub vignette_softness: Option<f64>,
    pub vibrance: Option<f64>,
    pub clarity_strength: Option<f64>,
    pub tone_curve_strength: Option<f64>,

    // Gradient mapping
    pub gradient_map_strength: Option<f64>,
    pub gradient_map_hue_preservation: Option<f64>,

    // Material effects - Opalescence
    pub opalescence_strength: Option<f64>,
    pub opalescence_scale: Option<f64>,
    pub opalescence_layers: Option<usize>,

    // Material effects - Champlevé
    pub champleve_flow_alignment: Option<f64>,
    pub champleve_interference_amplitude: Option<f64>,
    pub champleve_rim_intensity: Option<f64>,
    pub champleve_rim_warmth: Option<f64>,
    pub champleve_interior_lift: Option<f64>,

    // Material effects - Aether
    pub aether_flow_alignment: Option<f64>,
    pub aether_scattering_strength: Option<f64>,
    pub aether_iridescence_amplitude: Option<f64>,
    pub aether_caustic_strength: Option<f64>,

    // Detail & Clarity
    pub micro_contrast_strength: Option<f64>,
    pub micro_contrast_radius: Option<usize>,
    pub edge_luminance_strength: Option<f64>,
    pub edge_luminance_threshold: Option<f64>,
    pub edge_luminance_brightness_boost: Option<f64>,

    // Atmospheric
    pub atmospheric_depth_strength: Option<f64>,
    pub atmospheric_desaturation: Option<f64>,
    pub atmospheric_darkening: Option<f64>,
    pub fine_texture_strength: Option<f64>,
    pub fine_texture_scale: Option<f64>,
    pub fine_texture_contrast: Option<f64>,

    // HDR & Exposure
    pub hdr_scale: Option<f64>,

    // Clipping
    pub clip_black: Option<f64>,
    pub clip_white: Option<f64>,

    // Nebula
    pub nebula_strength: Option<f64>,
    pub nebula_octaves: Option<usize>,
    pub nebula_base_frequency: Option<f64>,
}

impl RandomizableEffectConfig {
    /// Resolve all Option<T> values: use explicit values or randomize.
    /// Returns a fully resolved configuration and a log of randomization decisions.
    pub fn resolve(
        &self,
        rng: &mut Sha3RandomByteStream,
        width: u32,
        height: u32,
        special_mode: bool,
    ) -> (ResolvedEffectConfig, RandomizationLog) {
        let mut randomizer = EffectRandomizer::new(rng, self.gallery_quality);
        let mut log = RandomizationLog::new(self.gallery_quality);

        // Resolve all parameters with logging
        let resolved = ResolvedEffectConfig {
            width,
            height,
            gallery_quality: self.gallery_quality,
            special_mode,

            // Effect enables
            enable_bloom: self.resolve_enable("bloom", self.enable_bloom, &mut randomizer, &mut log),
            enable_glow: self.resolve_enable("glow", self.enable_glow, &mut randomizer, &mut log),
            enable_chromatic_bloom: self.resolve_enable(
                "chromatic_bloom",
                self.enable_chromatic_bloom,
                &mut randomizer,
                &mut log,
            ),
            enable_perceptual_blur: self.resolve_enable(
                "perceptual_blur",
                self.enable_perceptual_blur,
                &mut randomizer,
                &mut log,
            ),
            enable_micro_contrast: self.resolve_enable(
                "micro_contrast",
                self.enable_micro_contrast,
                &mut randomizer,
                &mut log,
            ),
            enable_gradient_map: self.resolve_enable(
                "gradient_map",
                self.enable_gradient_map,
                &mut randomizer,
                &mut log,
            ),
            enable_color_grade: self.resolve_enable(
                "color_grade",
                self.enable_color_grade,
                &mut randomizer,
                &mut log,
            ),
            enable_champleve: self.resolve_enable(
                "champleve",
                self.enable_champleve,
                &mut randomizer,
                &mut log,
            ),
            enable_aether: self.resolve_enable("aether", self.enable_aether, &mut randomizer, &mut log),
            enable_opalescence: self.resolve_enable(
                "opalescence",
                self.enable_opalescence,
                &mut randomizer,
                &mut log,
            ),
            enable_edge_luminance: self.resolve_enable(
                "edge_luminance",
                self.enable_edge_luminance,
                &mut randomizer,
                &mut log,
            ),
            enable_atmospheric_depth: self.resolve_enable(
                "atmospheric_depth",
                self.enable_atmospheric_depth,
                &mut randomizer,
                &mut log,
            ),
            enable_fine_texture: self.resolve_enable(
                "fine_texture",
                self.enable_fine_texture,
                &mut randomizer,
                &mut log,
            ),

            // Resolve all float/int parameters
            blur_strength: self.resolve_float("blur_strength", self.blur_strength, &pd::BLUR_STRENGTH, &mut randomizer, &mut log),
            blur_radius_scale: self.resolve_float("blur_radius_scale", self.blur_radius_scale, &pd::BLUR_RADIUS_SCALE, &mut randomizer, &mut log),
            blur_core_brightness: self.resolve_float("blur_core_brightness", self.blur_core_brightness, &pd::BLUR_CORE_BRIGHTNESS, &mut randomizer, &mut log),
            dog_strength: self.resolve_float("dog_strength", self.dog_strength, &pd::DOG_STRENGTH, &mut randomizer, &mut log),
            dog_sigma_scale: self.resolve_float("dog_sigma_scale", self.dog_sigma_scale, &pd::DOG_SIGMA_SCALE, &mut randomizer, &mut log),
            dog_ratio: self.resolve_float("dog_ratio", self.dog_ratio, &pd::DOG_RATIO, &mut randomizer, &mut log),
            glow_strength: self.resolve_float("glow_strength", self.glow_strength, &pd::GLOW_STRENGTH, &mut randomizer, &mut log),
            glow_threshold: self.resolve_float("glow_threshold", self.glow_threshold, &pd::GLOW_THRESHOLD, &mut randomizer, &mut log),
            glow_radius_scale: self.resolve_float("glow_radius_scale", self.glow_radius_scale, &pd::GLOW_RADIUS_SCALE, &mut randomizer, &mut log),
            glow_sharpness: self.resolve_float("glow_sharpness", self.glow_sharpness, &pd::GLOW_SHARPNESS, &mut randomizer, &mut log),
            glow_saturation_boost: self.resolve_float("glow_saturation_boost", self.glow_saturation_boost, &pd::GLOW_SATURATION_BOOST, &mut randomizer, &mut log),
            chromatic_bloom_strength: self.resolve_float("chromatic_bloom_strength", self.chromatic_bloom_strength, &pd::CHROMATIC_BLOOM_STRENGTH, &mut randomizer, &mut log),
            chromatic_bloom_radius_scale: self.resolve_float("chromatic_bloom_radius_scale", self.chromatic_bloom_radius_scale, &pd::CHROMATIC_BLOOM_RADIUS_SCALE, &mut randomizer, &mut log),
            chromatic_bloom_separation_scale: self.resolve_float("chromatic_bloom_separation_scale", self.chromatic_bloom_separation_scale, &pd::CHROMATIC_BLOOM_SEPARATION_SCALE, &mut randomizer, &mut log),
            chromatic_bloom_threshold: self.resolve_float("chromatic_bloom_threshold", self.chromatic_bloom_threshold, &pd::CHROMATIC_BLOOM_THRESHOLD, &mut randomizer, &mut log),
            perceptual_blur_strength: self.resolve_float("perceptual_blur_strength", self.perceptual_blur_strength, &pd::PERCEPTUAL_BLUR_STRENGTH, &mut randomizer, &mut log),
            color_grade_strength: self.resolve_float("color_grade_strength", self.color_grade_strength, &pd::COLOR_GRADE_STRENGTH, &mut randomizer, &mut log),
            vignette_strength: self.resolve_float("vignette_strength", self.vignette_strength, &pd::VIGNETTE_STRENGTH, &mut randomizer, &mut log),
            vignette_softness: self.resolve_float("vignette_softness", self.vignette_softness, &pd::VIGNETTE_SOFTNESS, &mut randomizer, &mut log),
            vibrance: self.resolve_float("vibrance", self.vibrance, &pd::VIBRANCE, &mut randomizer, &mut log),
            clarity_strength: self.resolve_float("clarity_strength", self.clarity_strength, &pd::CLARITY_STRENGTH, &mut randomizer, &mut log),
            tone_curve_strength: self.resolve_float("tone_curve_strength", self.tone_curve_strength, &pd::TONE_CURVE_STRENGTH, &mut randomizer, &mut log),
            gradient_map_strength: self.resolve_float("gradient_map_strength", self.gradient_map_strength, &pd::GRADIENT_MAP_STRENGTH, &mut randomizer, &mut log),
            gradient_map_hue_preservation: self.resolve_float("gradient_map_hue_preservation", self.gradient_map_hue_preservation, &pd::GRADIENT_MAP_HUE_PRESERVATION, &mut randomizer, &mut log),
            opalescence_strength: self.resolve_float("opalescence_strength", self.opalescence_strength, &pd::OPALESCENCE_STRENGTH, &mut randomizer, &mut log),
            opalescence_scale: self.resolve_float("opalescence_scale", self.opalescence_scale, &pd::OPALESCENCE_SCALE, &mut randomizer, &mut log),
            opalescence_layers: self.resolve_int("opalescence_layers", self.opalescence_layers, &pd::OPALESCENCE_LAYERS, &mut randomizer, &mut log),
            champleve_flow_alignment: self.resolve_float("champleve_flow_alignment", self.champleve_flow_alignment, &pd::CHAMPLEVE_FLOW_ALIGNMENT, &mut randomizer, &mut log),
            champleve_interference_amplitude: self.resolve_float("champleve_interference_amplitude", self.champleve_interference_amplitude, &pd::CHAMPLEVE_INTERFERENCE_AMPLITUDE, &mut randomizer, &mut log),
            champleve_rim_intensity: self.resolve_float("champleve_rim_intensity", self.champleve_rim_intensity, &pd::CHAMPLEVE_RIM_INTENSITY, &mut randomizer, &mut log),
            champleve_rim_warmth: self.resolve_float("champleve_rim_warmth", self.champleve_rim_warmth, &pd::CHAMPLEVE_RIM_WARMTH, &mut randomizer, &mut log),
            champleve_interior_lift: self.resolve_float("champleve_interior_lift", self.champleve_interior_lift, &pd::CHAMPLEVE_INTERIOR_LIFT, &mut randomizer, &mut log),
            aether_flow_alignment: self.resolve_float("aether_flow_alignment", self.aether_flow_alignment, &pd::AETHER_FLOW_ALIGNMENT, &mut randomizer, &mut log),
            aether_scattering_strength: self.resolve_float("aether_scattering_strength", self.aether_scattering_strength, &pd::AETHER_SCATTERING_STRENGTH, &mut randomizer, &mut log),
            aether_iridescence_amplitude: self.resolve_float("aether_iridescence_amplitude", self.aether_iridescence_amplitude, &pd::AETHER_IRIDESCENCE_AMPLITUDE, &mut randomizer, &mut log),
            aether_caustic_strength: self.resolve_float("aether_caustic_strength", self.aether_caustic_strength, &pd::AETHER_CAUSTIC_STRENGTH, &mut randomizer, &mut log),
            micro_contrast_strength: self.resolve_float("micro_contrast_strength", self.micro_contrast_strength, &pd::MICRO_CONTRAST_STRENGTH, &mut randomizer, &mut log),
            micro_contrast_radius: self.resolve_int("micro_contrast_radius", self.micro_contrast_radius, &pd::MICRO_CONTRAST_RADIUS, &mut randomizer, &mut log),
            edge_luminance_strength: self.resolve_float("edge_luminance_strength", self.edge_luminance_strength, &pd::EDGE_LUMINANCE_STRENGTH, &mut randomizer, &mut log),
            edge_luminance_threshold: self.resolve_float("edge_luminance_threshold", self.edge_luminance_threshold, &pd::EDGE_LUMINANCE_THRESHOLD, &mut randomizer, &mut log),
            edge_luminance_brightness_boost: self.resolve_float("edge_luminance_brightness_boost", self.edge_luminance_brightness_boost, &pd::EDGE_LUMINANCE_BRIGHTNESS_BOOST, &mut randomizer, &mut log),
            atmospheric_depth_strength: self.resolve_float("atmospheric_depth_strength", self.atmospheric_depth_strength, &pd::ATMOSPHERIC_DEPTH_STRENGTH, &mut randomizer, &mut log),
            atmospheric_desaturation: self.resolve_float("atmospheric_desaturation", self.atmospheric_desaturation, &pd::ATMOSPHERIC_DESATURATION, &mut randomizer, &mut log),
            atmospheric_darkening: self.resolve_float("atmospheric_darkening", self.atmospheric_darkening, &pd::ATMOSPHERIC_DARKENING, &mut randomizer, &mut log),
            fine_texture_strength: self.resolve_float("fine_texture_strength", self.fine_texture_strength, &pd::FINE_TEXTURE_STRENGTH, &mut randomizer, &mut log),
            fine_texture_scale: self.resolve_float("fine_texture_scale", self.fine_texture_scale, &pd::FINE_TEXTURE_SCALE, &mut randomizer, &mut log),
            fine_texture_contrast: self.resolve_float("fine_texture_contrast", self.fine_texture_contrast, &pd::FINE_TEXTURE_CONTRAST, &mut randomizer, &mut log),
            hdr_scale: self.resolve_float("hdr_scale", self.hdr_scale, &pd::HDR_SCALE, &mut randomizer, &mut log),
            nebula_strength: self.resolve_float("nebula_strength", self.nebula_strength, &pd::NEBULA_STRENGTH, &mut randomizer, &mut log),
            nebula_octaves: self.resolve_int("nebula_octaves", self.nebula_octaves, &pd::NEBULA_OCTAVES, &mut randomizer, &mut log),
            nebula_base_frequency: self.resolve_float("nebula_base_frequency", self.nebula_base_frequency, &pd::NEBULA_BASE_FREQUENCY, &mut randomizer, &mut log),
            
            // Resolve constrained pair (clip_black < clip_white)
            clip_black: 0.0, // Will be set below
            clip_white: 0.0, // Will be set below
        };

        // Resolve clip_black and clip_white as ordered pair
        let (clip_black, clip_white) = if self.clip_black.is_some() && self.clip_white.is_some() {
            // Both specified - ensure ordering
            let black = self.clip_black.unwrap();
            let white = self.clip_white.unwrap();
            if black < white {
                (black, white)
            } else {
                (white, black)
            }
        } else if self.clip_black.is_some() {
            // Only black specified, randomize white
            let black = self.clip_black.unwrap();
            let white = randomizer.randomize_float(&pd::CLIP_WHITE);
            if black < white {
                (black, white)
            } else {
                (white, black)
            }
        } else if self.clip_white.is_some() {
            // Only white specified, randomize black
            let white = self.clip_white.unwrap();
            let black = randomizer.randomize_float(&pd::CLIP_BLACK);
            if black < white {
                (black, white)
            } else {
                (white, black)
            }
        } else {
            // Both random - use ordered pair
            randomizer.randomize_ordered_pair(&pd::CLIP_BLACK, &pd::CLIP_WHITE)
        };

        // Store resolved clip values
        let resolved = ResolvedEffectConfig {
            clip_black,
            clip_white,
            ..resolved
        };

        // Log clip parameters
        let mut clip_record = RandomizationRecord::new("clipping".to_string(), true, false);
        clip_record.add_float(
            "clip_black".to_string(),
            clip_black,
            self.clip_black.is_none(),
            pd::CLIP_BLACK.range(self.gallery_quality),
        );
        clip_record.add_float(
            "clip_white".to_string(),
            clip_white,
            self.clip_white.is_none(),
            pd::CLIP_WHITE.range(self.gallery_quality),
        );
        log.add_record(clip_record);

        // Apply conflict detection and adjustments
        let resolved = apply_conflict_detection(resolved, &mut log);

        (resolved, log)
    }

    fn resolve_enable(
        &self,
        name: &str,
        value: Option<bool>,
        randomizer: &mut EffectRandomizer,
        log: &mut RandomizationLog,
    ) -> bool {
        let (enabled, was_randomized) = match value {
            Some(v) => (v, false),
            None => (randomizer.randomize_enable(), true),
        };

        log.add_record(RandomizationRecord::new(
            name.to_string(),
            enabled,
            was_randomized,
        ));

        enabled
    }

    fn resolve_float(
        &self,
        name: &str,
        value: Option<f64>,
        descriptor: &pd::FloatParamDescriptor,
        randomizer: &mut EffectRandomizer,
        log: &mut RandomizationLog,
    ) -> f64 {
        let (resolved, was_randomized) = match value {
            Some(v) => (v, false),
            None => (randomizer.randomize_float(descriptor), true),
        };

        // Find or create record for this parameter's effect group
        let effect_name = Self::effect_group_name(name);
        let record_idx = log.effects.iter().position(|r| r.effect_name == effect_name);
        
        if let Some(idx) = record_idx {
            log.effects[idx].add_float(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
        } else {
            let mut record = RandomizationRecord::new(effect_name, true, false);
            record.add_float(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
            log.add_record(record);
        }

        resolved
    }

    fn resolve_int(
        &self,
        name: &str,
        value: Option<usize>,
        descriptor: &pd::IntParamDescriptor,
        randomizer: &mut EffectRandomizer,
        log: &mut RandomizationLog,
    ) -> usize {
        let (resolved, was_randomized) = match value {
            Some(v) => (v, false),
            None => (randomizer.randomize_int(descriptor), true),
        };

        // Find or create record for this parameter's effect group
        let effect_name = Self::effect_group_name(name);
        let record_idx = log.effects.iter().position(|r| r.effect_name == effect_name);
        
        if let Some(idx) = record_idx {
            log.effects[idx].add_int(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
        } else {
            let mut record = RandomizationRecord::new(effect_name, true, false);
            record.add_int(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
            log.add_record(record);
        }

        resolved
    }

    /// Extract effect group name from parameter name (e.g., "glow_strength" -> "glow")
    fn effect_group_name(param_name: &str) -> String {
        param_name.split('_').next().unwrap_or(param_name).to_string()
    }
}

/// Fully resolved effect configuration with all parameters determined.
#[derive(Clone, Debug)]
pub struct ResolvedEffectConfig {
    pub width: u32,
    pub height: u32,
    #[allow(dead_code)] // Stored for logging purposes
    pub gallery_quality: bool,
    pub special_mode: bool,

    // Effect enables
    pub enable_bloom: bool,
    pub enable_glow: bool,
    pub enable_chromatic_bloom: bool,
    pub enable_perceptual_blur: bool,
    pub enable_micro_contrast: bool,
    pub enable_gradient_map: bool,
    pub enable_color_grade: bool,
    pub enable_champleve: bool,
    pub enable_aether: bool,
    pub enable_opalescence: bool,
    pub enable_edge_luminance: bool,
    pub enable_atmospheric_depth: bool,
    pub enable_fine_texture: bool,

    // Parameters
    pub blur_strength: f64,
    pub blur_radius_scale: f64,
    pub blur_core_brightness: f64,
    pub dog_strength: f64,
    pub dog_sigma_scale: f64,
    pub dog_ratio: f64,
    pub glow_strength: f64,
    pub glow_threshold: f64,
    pub glow_radius_scale: f64,
    pub glow_sharpness: f64,
    pub glow_saturation_boost: f64,
    pub chromatic_bloom_strength: f64,
    pub chromatic_bloom_radius_scale: f64,
    pub chromatic_bloom_separation_scale: f64,
    pub chromatic_bloom_threshold: f64,
    pub perceptual_blur_strength: f64,
    pub color_grade_strength: f64,
    pub vignette_strength: f64,
    pub vignette_softness: f64,
    pub vibrance: f64,
    pub clarity_strength: f64,
    pub tone_curve_strength: f64,
    pub gradient_map_strength: f64,
    pub gradient_map_hue_preservation: f64,
    pub opalescence_strength: f64,
    pub opalescence_scale: f64,
    pub opalescence_layers: usize,
    pub champleve_flow_alignment: f64,
    pub champleve_interference_amplitude: f64,
    pub champleve_rim_intensity: f64,
    pub champleve_rim_warmth: f64,
    pub champleve_interior_lift: f64,
    pub aether_flow_alignment: f64,
    pub aether_scattering_strength: f64,
    pub aether_iridescence_amplitude: f64,
    pub aether_caustic_strength: f64,
    pub micro_contrast_strength: f64,
    pub micro_contrast_radius: usize,
    pub edge_luminance_strength: f64,
    pub edge_luminance_threshold: f64,
    pub edge_luminance_brightness_boost: f64,
    pub atmospheric_depth_strength: f64,
    pub atmospheric_desaturation: f64,
    pub atmospheric_darkening: f64,
    pub fine_texture_strength: f64,
    pub fine_texture_scale: f64,
    pub fine_texture_contrast: f64,
    pub hdr_scale: f64,
    pub clip_black: f64,
    pub clip_white: f64,
    pub nebula_strength: f64,
    pub nebula_octaves: usize,
    pub nebula_base_frequency: f64,
}

/// Apply essential constraints to prevent performance catastrophes and mathematical impossibilities.
///
/// Philosophy: Maximum exploration with minimum intervention.
/// - NO aesthetic constraints (oversaturation, clutter, darkness are valid artistic choices)
/// - ONLY essential guards: performance, stability, mathematical validity
/// - Parameters are chosen independently to maximize exploration of visual space
fn apply_conflict_detection(mut config: ResolvedEffectConfig, log: &mut RandomizationLog) -> ResolvedEffectConfig {
    let mut adjustments = Vec::new();

    // ============================================================================
    // ESSENTIAL CONSTRAINT 1: Performance Guard - Extreme Blur
    // ============================================================================
    // Prevents: Out-of-memory errors or multi-hour render times
    // Threshold: Only triggers at truly extreme combinations (top 5% of range)
    // 
    // Large blur radius (>60px at 1080p) combined with high iteration count
    // can cause >3GB memory allocation and >10 minutes per frame
    if config.enable_bloom && config.blur_radius_scale > 0.060 && config.blur_strength > 24.0 {
        let original_radius = config.blur_radius_scale;
        let original_strength = config.blur_strength;
        
        // Scale back just enough to stay within performance envelope
        let performance_factor = 0.85;
        config.blur_radius_scale *= performance_factor;
        config.blur_strength *= performance_factor;
        
        adjustments.push(format!(
            "Performance guard: Scaled extreme blur parameters (radius: {:.4} -> {:.4}, strength: {:.2} -> {:.2}) to prevent memory/time issues",
            original_radius, config.blur_radius_scale,
            original_strength, config.blur_strength
        ));
    }

    // ============================================================================
    // ESSENTIAL CONSTRAINT 2: Exponential Cost Guard - Opalescence Layers
    // ============================================================================
    // Prevents: Exponential performance degradation
    // Threshold: Only restricts most extreme combination (6+ layers at high strength)
    //
    // Each opalescence layer multiplies rendering cost. 6+ layers at high strength
    // can cause minutes per frame due to nested interference calculations.
    if config.enable_opalescence 
        && config.opalescence_layers > 5 
        && config.opalescence_strength > 0.30 
    {
        let original_layers = config.opalescence_layers;
        
        config.opalescence_layers = 5;
        
        adjustments.push(format!(
            "Performance guard: Capped opalescence_layers ({} -> 5) at high strength ({:.2}) to prevent exponential cost",
            original_layers, config.opalescence_strength
        ));
    }

    // ============================================================================
    // Note: All aesthetic conflict rules have been removed to maximize exploration.
    // Oversaturation, visual clutter, muddy looks, and extreme darkness are valid
    // artistic outcomes. Users can regenerate with different seeds if desired.
    // ============================================================================

    // Log adjustments if any were made
    if !adjustments.is_empty() {
        let mut adjustment_record = RandomizationRecord::new(
            "essential_constraints".to_string(),
            true,
            false,
        );
        
        for adjustment in adjustments {
            adjustment_record.parameters.push(crate::render::effect_randomizer::RandomizedParameter {
                name: "performance_guard".to_string(),
                value: adjustment,
                was_randomized: false,
                range_used: "N/A".to_string(),
            });
        }
        
        log.add_record(adjustment_record);
    }

    config
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::Sha3RandomByteStream;

    /// Test that extreme blur parameters trigger performance guard
    #[test]
    fn test_extreme_blur_performance_guard() {
        let config = ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: true,
            blur_radius_scale: 0.070, // Extreme radius (above 0.060 threshold)
            blur_strength: 26.0,       // Extreme strength (above 24.0 threshold)
            // Initialize other required fields with defaults
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
            enable_fine_texture: false,
            blur_core_brightness: 10.0,
            dog_strength: 0.3,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.5,
            glow_strength: 0.4,
            glow_threshold: 0.65,
            glow_radius_scale: 0.007,
            glow_sharpness: 2.5,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.6,
            chromatic_bloom_radius_scale: 0.012,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.15,
            perceptual_blur_strength: 0.65,
            color_grade_strength: 0.5,
            vignette_strength: 0.4,
            vignette_softness: 2.5,
            vibrance: 1.1,
            clarity_strength: 0.25,
            tone_curve_strength: 0.5,
            gradient_map_strength: 0.7,
            gradient_map_hue_preservation: 0.2,
            opalescence_strength: 0.15,
            opalescence_scale: 0.01,
            opalescence_layers: 3,
            champleve_flow_alignment: 0.6,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 1.8,
            champleve_rim_warmth: 0.6,
            champleve_interior_lift: 0.65,
            aether_flow_alignment: 0.7,
            aether_scattering_strength: 0.9,
            aether_iridescence_amplitude: 0.6,
            aether_caustic_strength: 0.3,
            micro_contrast_strength: 0.25,
            micro_contrast_radius: 5,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.18,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.25,
            atmospheric_desaturation: 0.35,
            atmospheric_darkening: 0.15,
            fine_texture_strength: 0.12,
            fine_texture_scale: 0.0018,
            fine_texture_contrast: 0.35,
            hdr_scale: 0.12,
            clip_black: 0.01,
            clip_white: 0.99,
            nebula_strength: 0.0,
            nebula_octaves: 4,
            nebula_base_frequency: 0.0015,
        };

        let mut log = RandomizationLog::new(false);
        let result = apply_conflict_detection(config.clone(), &mut log);

        // Verify that both parameters were scaled down
        assert!(
            result.blur_radius_scale < config.blur_radius_scale,
            "Blur radius should be reduced by performance guard"
        );
        assert!(
            result.blur_strength < config.blur_strength,
            "Blur strength should be reduced by performance guard"
        );

        // Verify adjustment was logged
        assert!(
            !log.effects.is_empty(),
            "Performance adjustment should be logged"
        );
        assert_eq!(
            log.effects[0].effect_name, "essential_constraints",
            "Should log essential constraints"
        );
    }

    /// Test that extreme blur parameters below threshold are NOT affected
    #[test]
    fn test_below_threshold_blur_not_affected() {
        let config = ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: true,
            blur_radius_scale: 0.055, // Below 0.060 threshold
            blur_strength: 23.0,       // Below 24.0 threshold
            // Same defaults as above
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
            enable_fine_texture: false,
            blur_core_brightness: 10.0,
            dog_strength: 0.3,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.5,
            glow_strength: 0.4,
            glow_threshold: 0.65,
            glow_radius_scale: 0.007,
            glow_sharpness: 2.5,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.6,
            chromatic_bloom_radius_scale: 0.012,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.15,
            perceptual_blur_strength: 0.65,
            color_grade_strength: 0.5,
            vignette_strength: 0.4,
            vignette_softness: 2.5,
            vibrance: 1.1,
            clarity_strength: 0.25,
            tone_curve_strength: 0.5,
            gradient_map_strength: 0.7,
            gradient_map_hue_preservation: 0.2,
            opalescence_strength: 0.15,
            opalescence_scale: 0.01,
            opalescence_layers: 3,
            champleve_flow_alignment: 0.6,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 1.8,
            champleve_rim_warmth: 0.6,
            champleve_interior_lift: 0.65,
            aether_flow_alignment: 0.7,
            aether_scattering_strength: 0.9,
            aether_iridescence_amplitude: 0.6,
            aether_caustic_strength: 0.3,
            micro_contrast_strength: 0.25,
            micro_contrast_radius: 5,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.18,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.25,
            atmospheric_desaturation: 0.35,
            atmospheric_darkening: 0.15,
            fine_texture_strength: 0.12,
            fine_texture_scale: 0.0018,
            fine_texture_contrast: 0.35,
            hdr_scale: 0.12,
            clip_black: 0.01,
            clip_white: 0.99,
            nebula_strength: 0.0,
            nebula_octaves: 4,
            nebula_base_frequency: 0.0015,
        };

        let mut log = RandomizationLog::new(false);
        let result = apply_conflict_detection(config.clone(), &mut log);

        // Verify parameters are unchanged
        assert_eq!(
            result.blur_radius_scale, config.blur_radius_scale,
            "Blur radius should not change below threshold"
        );
        assert_eq!(
            result.blur_strength, config.blur_strength,
            "Blur strength should not change below threshold"
        );

        // Verify no adjustment was logged
        assert!(
            log.effects.is_empty(),
            "No adjustment should be logged for safe parameters"
        );
    }

    /// Test that extreme opalescence layers are capped at high strength
    #[test]
    fn test_opalescence_layers_performance_guard() {
        let config = ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: false,
            enable_glow: false,
            enable_chromatic_bloom: false,
            enable_perceptual_blur: false,
            enable_micro_contrast: false,
            enable_gradient_map: false,
            enable_color_grade: false,
            enable_champleve: false,
            enable_aether: false,
            enable_opalescence: true,
            opalescence_layers: 6,      // Above 5 threshold
            opalescence_strength: 0.35, // Above 0.30 threshold
            enable_edge_luminance: false,
            enable_atmospheric_depth: false,
            enable_fine_texture: false,
            blur_radius_scale: 0.02,
            blur_strength: 10.0,
            blur_core_brightness: 10.0,
            dog_strength: 0.3,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.5,
            glow_strength: 0.4,
            glow_threshold: 0.65,
            glow_radius_scale: 0.007,
            glow_sharpness: 2.5,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.6,
            chromatic_bloom_radius_scale: 0.012,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.15,
            perceptual_blur_strength: 0.65,
            color_grade_strength: 0.5,
            vignette_strength: 0.4,
            vignette_softness: 2.5,
            vibrance: 1.1,
            clarity_strength: 0.25,
            tone_curve_strength: 0.5,
            gradient_map_strength: 0.7,
            gradient_map_hue_preservation: 0.2,
            opalescence_scale: 0.01,
            champleve_flow_alignment: 0.6,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 1.8,
            champleve_rim_warmth: 0.6,
            champleve_interior_lift: 0.65,
            aether_flow_alignment: 0.7,
            aether_scattering_strength: 0.9,
            aether_iridescence_amplitude: 0.6,
            aether_caustic_strength: 0.3,
            micro_contrast_strength: 0.25,
            micro_contrast_radius: 5,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.18,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.25,
            atmospheric_desaturation: 0.35,
            atmospheric_darkening: 0.15,
            fine_texture_strength: 0.12,
            fine_texture_scale: 0.0018,
            fine_texture_contrast: 0.35,
            hdr_scale: 0.12,
            clip_black: 0.01,
            clip_white: 0.99,
            nebula_strength: 0.0,
            nebula_octaves: 4,
            nebula_base_frequency: 0.0015,
        };

        let mut log = RandomizationLog::new(false);
        let result = apply_conflict_detection(config.clone(), &mut log);

        // Verify layers were capped at 5
        assert_eq!(
            result.opalescence_layers, 5,
            "Opalescence layers should be capped at 5"
        );

        // Verify adjustment was logged
        assert!(
            !log.effects.is_empty(),
            "Performance adjustment should be logged"
        );
    }

    /// Test that opalescence layers below threshold or low strength are NOT capped
    #[test]
    fn test_opalescence_below_threshold_not_affected() {
        let config = ResolvedEffectConfig {
            width: 1920,
            height: 1080,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: false,
            enable_glow: false,
            enable_chromatic_bloom: false,
            enable_perceptual_blur: false,
            enable_micro_contrast: false,
            enable_gradient_map: false,
            enable_color_grade: false,
            enable_champleve: false,
            enable_aether: false,
            enable_opalescence: true,
            opalescence_layers: 6,      // Above threshold BUT...
            opalescence_strength: 0.25, // ...strength below 0.30 threshold
            enable_edge_luminance: false,
            enable_atmospheric_depth: false,
            enable_fine_texture: false,
            blur_radius_scale: 0.02,
            blur_strength: 10.0,
            blur_core_brightness: 10.0,
            dog_strength: 0.3,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.5,
            glow_strength: 0.4,
            glow_threshold: 0.65,
            glow_radius_scale: 0.007,
            glow_sharpness: 2.5,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.6,
            chromatic_bloom_radius_scale: 0.012,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.15,
            perceptual_blur_strength: 0.65,
            color_grade_strength: 0.5,
            vignette_strength: 0.4,
            vignette_softness: 2.5,
            vibrance: 1.1,
            clarity_strength: 0.25,
            tone_curve_strength: 0.5,
            gradient_map_strength: 0.7,
            gradient_map_hue_preservation: 0.2,
            opalescence_scale: 0.01,
            champleve_flow_alignment: 0.6,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 1.8,
            champleve_rim_warmth: 0.6,
            champleve_interior_lift: 0.65,
            aether_flow_alignment: 0.7,
            aether_scattering_strength: 0.9,
            aether_iridescence_amplitude: 0.6,
            aether_caustic_strength: 0.3,
            micro_contrast_strength: 0.25,
            micro_contrast_radius: 5,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.18,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.25,
            atmospheric_desaturation: 0.35,
            atmospheric_darkening: 0.15,
            fine_texture_strength: 0.12,
            fine_texture_scale: 0.0018,
            fine_texture_contrast: 0.35,
            hdr_scale: 0.12,
            clip_black: 0.01,
            clip_white: 0.99,
            nebula_strength: 0.0,
            nebula_octaves: 4,
            nebula_base_frequency: 0.0015,
        };

        let mut log = RandomizationLog::new(false);
        let result = apply_conflict_detection(config.clone(), &mut log);

        // Verify layers are NOT capped (strength too low)
        assert_eq!(
            result.opalescence_layers, 6,
            "Opalescence layers should not be capped at low strength"
        );

        // Verify no adjustment was logged
        assert!(
            log.effects.is_empty(),
            "No adjustment should be logged for safe parameters"
        );
    }

    /// Test that parameter randomization works end-to-end with new wider ranges
    #[test]
    fn test_wide_range_randomization() {
        let config = RandomizableEffectConfig {
            gallery_quality: false,
            ..Default::default()
        };

        let seed = [1, 2, 3, 4, 5, 6, 7, 8];
        let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
        let (resolved, log) = config.resolve(&mut rng, 1920, 1080, false);

        // Verify all parameters are within their widened exploratory ranges
        assert!(resolved.blur_strength >= 1.5 && resolved.blur_strength <= 28.0);
        assert!(resolved.blur_radius_scale >= 0.004 && resolved.blur_radius_scale <= 0.065);
        assert!(resolved.glow_strength >= 0.05 && resolved.glow_strength <= 0.95);
        assert!(resolved.chromatic_bloom_strength >= 0.20 && resolved.chromatic_bloom_strength <= 0.95);
        assert!(resolved.opalescence_layers >= 1 && resolved.opalescence_layers <= 6);

        // Verify log contains all randomized parameters
        assert!(!log.effects.is_empty(), "Should have randomization log");
    }
}
