//! Elegant HDR pipeline integration.
//!
//! This module provides the integration layer between the new HDR pipeline
//! and the existing rendering system. It replaces the ad-hoc band-aid fixes
//! with principled brightness management.
//!
//! # Design
//!
//! Instead of:
//! 1. Apply effects (darken)
//! 2. Apply brightness compensation (band-aid)
//! 3. Apply auto-levels (band-aid)
//!
//! We now have:
//! 1. Compute expected energy impact from effect configuration
//! 2. Apply effects (with energy tracking)
//! 3. Apply single, principled exposure adjustment
//! 4. Tonemap

use super::effect_energy::EffectEnergyCatalog;
use super::randomizable_config::ResolvedEffectConfig;
use super::types::PixelBuffer;
use rayon::prelude::*;

/// Compute the expected energy impact from a resolved effect configuration.
///
/// This analyzes the enabled effects and their parameters to determine
/// how much the image brightness will change.
pub fn compute_energy_catalog(config: &ResolvedEffectConfig) -> EffectEnergyCatalog {
    use super::effect_energy::{darkening, brightening, neutral};

    let mut catalog = EffectEnergyCatalog::new();

    // === TRAJECTORY EFFECTS ===

    // Gaussian bloom (brightening)
    if config.blur_strength > 0.0 {
        catalog.add("gaussian_blur", brightening::gaussian_bloom(config.blur_strength * 0.1));
    }

    // DoG bloom (brightening)
    if config.dog_strength > 0.0 {
        catalog.add("dog_bloom", brightening::dog_bloom(config.dog_strength));
    }

    // Glow enhancement (brightening)
    if config.enable_glow && config.glow_strength > 0.0 {
        catalog.add("glow", brightening::glow_enhancement(config.glow_strength));
    }

    // Chromatic bloom (brightening)
    if config.enable_chromatic_bloom && config.chromatic_bloom_strength > 0.0 {
        catalog.add("chromatic_bloom", brightening::chromatic_bloom(config.chromatic_bloom_strength));
    }

    // Edge luminance (brightening)
    if config.enable_edge_luminance && config.edge_luminance_strength > 0.0 {
        catalog.add(
            "edge_luminance",
            brightening::edge_luminance(
                config.edge_luminance_strength,
                config.edge_luminance_brightness_boost,
            ),
        );
    }

    // Opalescence (neutral)
    if config.enable_opalescence {
        catalog.add("opalescence", neutral::OPALESCENCE);
    }

    // Champlevé (neutral)
    if config.enable_champleve {
        catalog.add("champleve", neutral::CHAMPLEVE);
    }

    // Aether (neutral)
    if config.enable_aether {
        catalog.add("aether", neutral::AETHER);
    }

    // Cherenkov (brightening)
    if config.enable_cherenkov && config.cherenkov_strength > 0.0 {
        catalog.add("cherenkov", brightening::cherenkov(config.cherenkov_strength));
    }

    // Prismatic halos (brightening)
    if config.enable_prismatic_halos && config.prismatic_halos_strength > 0.0 {
        catalog.add("prismatic_halos", brightening::prismatic_halos(config.prismatic_halos_strength));
    }

    // Deep space (darkening)
    if config.enable_deep_space {
        catalog.add("deep_space", darkening::deep_space(0.35)); // Fixed strength
    }

    // === FINISHING EFFECTS ===

    // Aurora veils (brightening)
    if config.enable_aurora_veils && config.aurora_veils_strength > 0.0 {
        catalog.add("aurora_veils", brightening::aurora_veils(config.aurora_veils_strength));
    }

    // Cosmic ink (darkening)
    if config.enable_cosmic_ink && config.cosmic_ink_strength > 0.0 {
        catalog.add("cosmic_ink", darkening::cosmic_ink(config.cosmic_ink_strength));
    }

    // Gradient map (neutral)
    if config.enable_gradient_map {
        catalog.add("gradient_map", neutral::GRADIENT_MAP);
    }

    // Color grading with vignette (darkening via vignette)
    if config.enable_color_grade
        && config.vignette_strength > 0.0 {
            catalog.add_vignette(config.vignette_strength);
    }

    // Micro contrast (neutral)
    if config.enable_micro_contrast {
        catalog.add("micro_contrast", neutral::MICRO_CONTRAST);
    }

    // Volumetric occlusion (darkening)
    if config.enable_volumetric_occlusion && config.volumetric_occlusion_strength > 0.0 {
        catalog.add_volumetric_occlusion(config.volumetric_occlusion_strength);
    }

    // Crepuscular rays (brightening)
    if config.enable_crepuscular_rays && config.crepuscular_rays_strength > 0.0 {
        catalog.add("crepuscular_rays", brightening::crepuscular_rays(config.crepuscular_rays_strength));
    }

    // Atmospheric depth (darkening)
    if config.enable_atmospheric_depth && config.atmospheric_depth_strength > 0.0 {
        catalog.add_atmospheric_depth(config.atmospheric_depth_strength, config.atmospheric_darkening);
    }

    // Dodge & burn (mixed)
    if config.enable_dodge_burn {
        catalog.add_dodge_burn(config.dodge_burn_dodge_amount, config.dodge_burn_burn_amount);
    }

    // Halation (brightening)
    if config.enable_halation && config.halation_strength > 0.0 {
        catalog.add_halation(config.halation_strength);
    }

    // Fine texture (neutral)
    if config.enable_fine_texture {
        catalog.add("fine_texture", neutral::FINE_TEXTURE);
    }

    catalog
}

/// Configuration for elegant exposure adjustment.
#[derive(Clone, Debug)]
pub struct ElegantExposureConfig {
    /// Target mean luminance for visible pixels
    pub target_luminance: f64,

    /// Maximum exposure boost allowed
    pub max_boost: f64,

    /// Minimum energy factor before compensation kicks in
    pub energy_threshold: f64,

    /// Blend between energy-based and auto-exposure (0 = energy only, 1 = auto only)
    pub auto_exposure_blend: f64,
}

impl Default for ElegantExposureConfig {
    fn default() -> Self {
        Self {
            target_luminance: 0.25,
            max_boost: 6.0, // Higher to handle very dark trajectory renders
            energy_threshold: 0.8, // Only compensate if energy < 80%
            auto_exposure_blend: 0.4, // Balanced between energy and auto
        }
    }
}

/// Apply elegant exposure adjustment based on energy tracking.
///
/// This replaces `apply_brightness_compensation` and `apply_final_auto_levels`
/// with a single, principled adjustment that:
///
/// 1. Uses the energy catalog to predict brightness loss from effects
/// 2. Measures actual scene luminance to detect inherently dark scenes
/// 3. Applies a single, smooth exposure adjustment
/// 4. Protects highlights from clipping
///
/// # Arguments
///
/// * `buffer` - Pixel buffer to modify (premultiplied alpha)
/// * `catalog` - Energy catalog from effect configuration
/// * `config` - Exposure adjustment configuration
pub fn apply_elegant_exposure(
    buffer: &mut PixelBuffer,
    catalog: &mut EffectEnergyCatalog,
    config: &ElegantExposureConfig,
) {
    if buffer.is_empty() {
        return;
    }

    // Get the expected energy factor from effects
    let energy_factor = catalog.combined_factor();

    // ALWAYS measure actual scene luminance - this is critical!
    // The scene may be inherently dark (sparse trajectories, small sizes, etc.)
    // regardless of what effects are applied.
    let measured_luminance = sample_scene_luminance(buffer);

    // Determine if we need to boost based on:
    // 1. Effect-induced darkening (energy_factor < threshold)
    // 2. Inherently dark scene (measured_luminance < target)
    // 3. OVER-bright scene (measured_luminance >> 1.0) - need to compress!
    let needs_effect_compensation = energy_factor < config.energy_threshold;
    let needs_scene_boost = measured_luminance < config.target_luminance * 0.5;
    let needs_compression = measured_luminance > 2.0; // HDR values need compression

    if needs_compression {
        // Scene is over-bright (HDR values) - we need to compress, not boost
        // This happens when effects add a lot of light or normalization amplified tiny values
        
        // For extreme HDR values (>100), we need aggressive compression with proper
        // tonemapping-style curves to preserve relative brightness relationships.
        if measured_luminance > 100.0 {
        tracing::debug!(
            "Elegant exposure: EXTREME HDR compression (lum={:.0}), applying reinhard tonemapping",
            measured_luminance
        );
            
            // Use Reinhard-style compression: x / (1 + x) scaled to target luminance
            // This preserves relative brightness while bringing everything into range
            let scale = 1.0 / measured_luminance; // Normalize to ~1.0 average
            let target = config.target_luminance * 2.0; // Slightly brighter target after compression
            
            buffer.par_iter_mut().for_each(|pixel| {
                let (r, g, b, a) = *pixel;
                if a <= 1e-9 {
                    return;
                }
                
                // Normalize, compress, and rescale
                let nr = r * scale;
                let ng = g * scale;
                let nb = b * scale;
                
                // Reinhard tonemapping: preserves relative brightness
                let cr = (nr / (1.0 + nr)) * target;
                let cg = (ng / (1.0 + ng)) * target;
                let cb = (nb / (1.0 + nb)) * target;
                
                *pixel = (cr.max(0.0), cg.max(0.0), cb.max(0.0), a);
            });
        } else {
            // Moderate HDR - compress but keep things reasonably bright
            // Target luminance for final output should be higher to ensure visibility
            let output_target = 0.5; // Target 50% brightness for good visibility
            let compress_factor = output_target / measured_luminance;
            
            tracing::debug!(
                "Elegant exposure: HDR compression (lum={:.2}, factor={:.3})",
                measured_luminance, compress_factor
            );
            
            buffer.par_iter_mut().for_each(|pixel| {
                let (r, g, b, a) = *pixel;
                *pixel = (r * compress_factor, g * compress_factor, b * compress_factor, a);
            });
        }
        return;
    }

    if !needs_effect_compensation && !needs_scene_boost {
        tracing::debug!(
            "Elegant exposure: no adjustment (energy={:.2}%, lum={:.4})",
            energy_factor * 100.0,
            measured_luminance
        );
        return;
    }

    // Compute energy-based compensation
    let energy_compensation = if needs_effect_compensation {
        catalog.compensation_factor()
    } else {
        1.0
    };

    // Compute auto-exposure compensation for dark scenes
    // Use a lower threshold to catch very dark images
    let auto_compensation = if measured_luminance > 1e-6 {
        (config.target_luminance / measured_luminance).min(config.max_boost * 2.0)
    } else {
        config.max_boost // Scene is nearly black - use max boost
    };

    // Blend energy-based and auto-exposure
    // If scene is very dark, weight auto-exposure more heavily
    let blend = if measured_luminance < config.target_luminance * 0.1 {
        0.8 // Heavily favor auto-exposure for very dark scenes
    } else {
        config.auto_exposure_blend
    };

    let blended = energy_compensation * (1.0 - blend) + auto_compensation * blend;

    // Apply soft clamping to max boost
    let boost = soft_clamp(blended, 1.0, config.max_boost);

    if boost <= 1.01 {
        tracing::debug!(
            "Elegant exposure: no adjustment (energy={:.2}%, lum={:.6}, boost={:.2}x)",
            energy_factor * 100.0,
            measured_luminance,
            boost
        );
        return;
    }

    tracing::debug!(
        "Elegant exposure: BOOSTING energy={:.2}%, measured_lum={:.6}, boost={:.2}x",
        energy_factor * 100.0,
        measured_luminance,
        boost
    );

    // Apply the exposure boost with highlight protection
    apply_exposure_with_protection(buffer, boost);
}

/// Sample scene luminance from the buffer.
///
/// Returns the mean luminance of visible (non-transparent) pixels.
/// For sparse trajectory renders, this may be computed from very few pixels.
fn sample_scene_luminance(buffer: &PixelBuffer) -> f64 {
    let stride = (buffer.len() / 2000).max(1); // More samples
    let mut total = 0.0;
    let mut count = 0;
    let mut max_lum = 0.0_f64;

    for (idx, pixel) in buffer.iter().enumerate() {
        if idx % stride != 0 {
            continue;
        }
        let (r, g, b, a) = *pixel;
        if a > 1e-9 { // Lower threshold to catch very faint pixels
            // Un-premultiply for accurate luminance
            let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / a;
            total += lum;
            max_lum = max_lum.max(lum);
            count += 1;
        }
    }

    if count == 0 {
        tracing::debug!("sample_scene_luminance: no visible pixels found!");
        return 0.0;
    }

    let mean = total / count as f64;
    tracing::debug!(
        "sample_scene_luminance: mean={:.6}, max={:.6}, samples={}",
        mean, max_lum, count
    );
    mean
}

/// Soft clamp function for smooth limiting.
fn soft_clamp(value: f64, min: f64, max: f64) -> f64 {
    if value <= min {
        return min;
    }
    if value <= max {
        return value;
    }
    // Soft rolloff above max
    let excess = value - max;
    max + excess / (1.0 + excess * 0.5)
}

/// Apply exposure boost with highlight protection.
fn apply_exposure_with_protection(buffer: &mut PixelBuffer, boost: f64) {
    buffer.par_iter_mut().for_each(|pixel| {
        let (r, g, b, a) = *pixel;

        if a <= 1e-9 {
            return;
        }

        // Un-premultiply
        let sr = r / a;
        let sg = g / a;
        let sb = b / a;

        // Apply boost with soft rolloff for highlights
        let br = highlight_protected_boost(sr, boost);
        let bg = highlight_protected_boost(sg, boost);
        let bb = highlight_protected_boost(sb, boost);

        // Re-premultiply
        *pixel = (br * a, bg * a, bb * a, a);
    });
}

/// Apply boost with highlight protection.
///
/// Uses a curve that:
/// - Applies full boost to shadows and midtones
/// - Gradually reduces boost for highlights
/// - Never clips values (asymptotes toward target)
#[inline]
fn highlight_protected_boost(value: f64, boost: f64) -> f64 {
    if value <= 0.0 {
        return 0.0;
    }

    // Target value with full boost
    let target = value * boost;

    // Soft compress highlights
    if target <= 0.8 {
        target
    } else {
        // Smooth rolloff: asymptotes toward 1.0 + small headroom
        let excess = target - 0.8;
        let compressed = excess / (1.0 + excess * 2.0);
        0.8 + compressed * 0.35 // Max output ~1.15 for infinite input
    }
}

// ============================================================================
// INTEGRATION HELPER
// ============================================================================

/// Replacement for the old band-aid functions.
///
/// Call this instead of `apply_brightness_compensation` and `apply_final_auto_levels`.
///
/// # Example
///
/// ```rust,ignore
/// // Instead of:
/// // apply_brightness_compensation(&mut buffer, 0.30, 4.0);
/// // apply_final_auto_levels(&mut buffer, 0.90);
///
/// // Use:
/// let mut catalog = compute_energy_catalog(&resolved_config);
/// apply_elegant_brightness(&mut buffer, &mut catalog);
/// ```
pub fn apply_elegant_brightness(
    buffer: &mut PixelBuffer,
    catalog: &mut EffectEnergyCatalog,
) {
    apply_elegant_exposure(buffer, catalog, &ElegantExposureConfig::default());
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::effect_themes::EffectTheme;

    /// Create a minimal test config with default values
    fn create_minimal_config() -> ResolvedEffectConfig {
        ResolvedEffectConfig {
            width: 64,
            height: 64,
            gallery_quality: false,
            special_mode: false,
            noise_seed: 42,
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
            effect_theme: EffectTheme::Random,
            // Set all strength values to defaults
            blur_radius_scale: 0.0,
            blur_strength: 0.0,
            blur_core_brightness: 1.0,
            dog_sigma_scale: 0.01,
            dog_ratio: 2.0,
            dog_strength: 0.0,
            glow_radius_scale: 0.0,
            glow_strength: 0.0,
            glow_threshold: 0.5,
            glow_sharpness: 0.5,
            glow_saturation_boost: 0.0,
            chromatic_bloom_radius_scale: 0.0,
            chromatic_bloom_separation_scale: 0.0,
            chromatic_bloom_strength: 0.0,
            chromatic_bloom_threshold: 0.5,
            perceptual_blur_strength: 0.0,
            micro_contrast_strength: 0.0,
            micro_contrast_radius: 3,
            gradient_map_palette: 0,
            gradient_map_strength: 0.0,
            gradient_map_hue_preservation: 0.0,
            color_grade_strength: 0.0,
            vignette_strength: 0.0,
            vignette_softness: 0.5,
            vibrance: 0.0,
            clarity_strength: 0.0,
            tone_curve_strength: 0.0,
            champleve_flow_alignment: 0.0,
            champleve_interference_amplitude: 0.0,
            champleve_rim_intensity: 0.0,
            champleve_rim_warmth: 0.0,
            champleve_interior_lift: 0.0,
            aether_flow_alignment: 0.0,
            aether_scattering_strength: 0.0,
            aether_iridescence_amplitude: 0.0,
            aether_caustic_strength: 0.0,
            opalescence_strength: 0.0,
            opalescence_scale: 0.0,
            opalescence_layers: 3,
            edge_luminance_strength: 0.0,
            edge_luminance_threshold: 0.0,
            edge_luminance_brightness_boost: 0.0,
            atmospheric_depth_strength: 0.0,
            atmospheric_fog_color_r: 0.0,
            atmospheric_fog_color_g: 0.0,
            atmospheric_fog_color_b: 0.0,
            atmospheric_desaturation: 0.0,
            atmospheric_darkening: 0.0,
            crepuscular_rays_strength: 0.0,
            crepuscular_rays_density: 0.0,
            crepuscular_rays_decay: 0.0,
            crepuscular_rays_weight: 0.0,
            crepuscular_rays_exposure: 0.0,
            volumetric_occlusion_strength: 0.0,
            volumetric_occlusion_radius: 0,
            volumetric_occlusion_density_scale: 0.0,
            volumetric_occlusion_light_angle: 0.0,
            volumetric_occlusion_decay: 0.0,
            volumetric_occlusion_threshold: 0.0,
            refractive_caustics_strength: 0.0,
            refractive_caustics_ior: 0.0,
            refractive_caustics_dispersion: 0.0,
            refractive_caustics_threshold: 0.0,
            refractive_caustics_focus: 0.0,
            fine_texture_type: 0,
            fine_texture_strength: 0.0,
            fine_texture_scale: 0.0,
            fine_texture_contrast: 0.0,
            fine_texture_light_angle: 0.0,
            fine_texture_specular: 0.0,
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
            nebula_strength: 0.0,
            nebula_octaves: 4,
            nebula_base_frequency: 0.001,
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
            hdr_scale: 1.0,
            clip_black: 0.0,
            clip_white: 1.0,
        }
    }

    /// Create a test config with some darkening effects
    fn create_darkening_config() -> ResolvedEffectConfig {
        let mut config = create_minimal_config();
        config.enable_color_grade = true;
        config.vignette_strength = 1.0;
        config.enable_volumetric_occlusion = true;
        config.volumetric_occlusion_strength = 0.5;
        config
    }

    /// Create a test config with some brightening effects
    fn create_brightening_config() -> ResolvedEffectConfig {
        let mut config = create_minimal_config();
        config.enable_glow = true;
        config.glow_strength = 0.8;
        config.enable_chromatic_bloom = true;
        config.chromatic_bloom_strength = 0.8;
        config.enable_halation = true;
        config.halation_strength = 0.5;
        config
    }

    #[test]
    fn test_compute_energy_catalog_basic() {
        let mut config = create_minimal_config();
        config.enable_color_grade = true;
        config.vignette_strength = 0.3;
        config.enable_glow = true;
        config.glow_strength = 0.3;

        let mut catalog = compute_energy_catalog(&config);
        let factor = catalog.combined_factor();

        // Should have some effects
        assert!(!catalog.breakdown().is_empty());

        // Factor should be reasonable (not 0 or huge)
        assert!(factor > 0.1 && factor < 10.0);
    }

    #[test]
    fn test_compute_energy_catalog_darkening() {
        let config = create_darkening_config();
        let mut catalog = compute_energy_catalog(&config);
        let factor = catalog.combined_factor();

        // Net darkening expected
        assert!(factor < 1.0, "Expected darkening, got {}", factor);
    }

    #[test]
    fn test_compute_energy_catalog_brightening() {
        let config = create_brightening_config();
        let mut catalog = compute_energy_catalog(&config);
        let factor = catalog.combined_factor();

        // Net brightening expected
        assert!(factor > 1.0, "Expected brightening, got {}", factor);
    }

    #[test]
    fn test_elegant_exposure_skips_bright_scenes() {
        let mut buffer: PixelBuffer = vec![(0.8, 0.8, 0.8, 1.0); 100];
        let config = create_minimal_config();
        let mut catalog = compute_energy_catalog(&config);

        // Energy is at 1.0 (minimal config), so should skip
        let original = buffer[0].0;
        apply_elegant_exposure(&mut buffer, &mut catalog, &ElegantExposureConfig::default());

        assert!((buffer[0].0 - original).abs() < 0.01, "Should not modify bright scene");
    }

    #[test]
    fn test_elegant_exposure_boosts_dark_scenes() {
        // Create a dark scene
        let mut buffer: PixelBuffer = vec![(0.1, 0.1, 0.1, 1.0); 100];

        // Create catalog with significant darkening
        let mut config = create_minimal_config();
        config.enable_color_grade = true;
        config.vignette_strength = 1.0;
        config.enable_volumetric_occlusion = true;
        config.volumetric_occlusion_strength = 0.8;
        config.enable_atmospheric_depth = true;
        config.atmospheric_depth_strength = 0.8;
        config.atmospheric_darkening = 0.15;

        let mut catalog = compute_energy_catalog(&config);

        let original = buffer[0].0;
        apply_elegant_exposure(&mut buffer, &mut catalog, &ElegantExposureConfig::default());

        assert!(buffer[0].0 > original, "Should boost dark scene");
    }

    #[test]
    fn test_highlight_protected_boost() {
        // Low values get full boost
        let low = highlight_protected_boost(0.2, 2.0);
        assert!((low - 0.4).abs() < 0.01);

        // High values get protected
        let high = highlight_protected_boost(0.8, 2.0);
        assert!(high < 1.2, "Highlights should be protected");
        assert!(high > 0.8, "Should still increase");
    }

    #[test]
    fn test_soft_clamp() {
        assert!((soft_clamp(0.5, 0.0, 1.0) - 0.5).abs() < 1e-10);
        assert!((soft_clamp(0.0, 0.0, 1.0) - 0.0).abs() < 1e-10);
        // Soft clamp above max: value = max + excess / (1 + excess * 0.5)
        // For 1.5 with max=1.0: excess=0.5, result = 1.0 + 0.5/(1+0.25) = 1.0 + 0.4 = 1.4
        let clamped = soft_clamp(1.5, 0.0, 1.0);
        assert!(clamped > 1.0 && clamped < 1.5, "Soft clamped value {}", clamped);
    }

    #[test]
    fn test_sample_scene_luminance() {
        let buffer: PixelBuffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let lum = sample_scene_luminance(&buffer);
        assert!((lum - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_sample_scene_luminance_ignores_transparent() {
        let mut buffer: PixelBuffer = vec![(0.8, 0.8, 0.8, 1.0); 50];
        buffer.extend(vec![(0.0, 0.0, 0.0, 0.0); 50]); // Transparent

        let lum = sample_scene_luminance(&buffer);
        assert!((lum - 0.8).abs() < 0.1); // Should only count visible
    }
}

