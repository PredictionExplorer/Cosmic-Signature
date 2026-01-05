//! Energy factors for post-processing effects.
//!
//! This module defines the brightness impact (energy factor) for each effect
//! in the rendering pipeline. These values are used by the HDR pipeline to
//! track cumulative brightness changes and prevent over-darkening.

#![allow(dead_code)] // Not all methods used yet - infrastructure for elegant pipeline
//!
//! # Energy Factor Scale
//!
//! - `1.0` = brightness neutral (no net change)
//! - `< 1.0` = darkening effect (e.g., vignette, occlusion)
//! - `> 1.0` = brightening effect (e.g., bloom adds light)
//!
//! # Determining Energy Factors
//!
//! Energy factors are estimated based on:
//! 1. The typical brightness change the effect causes
//! 2. Parameter-dependent scaling (stronger effects = lower factor)
//! 3. Area of effect (full-image vs. localized)
//!
//! These are averages - actual impact varies per-pixel.

/// Energy factors for darkening effects.
///
/// These effects reduce overall image brightness.
pub mod darkening {
    /// Vignette: darkens edges, energy depends on strength.
    /// At full strength, ~30% of pixels are significantly darkened.
    pub fn vignette(strength: f64) -> f64 {
        // Vignette darkens roughly proportional to strength
        // At strength 1.0, average darkening is ~25%
        1.0 - strength * 0.25
    }

    /// Atmospheric depth: adds depth fog that darkens distant areas.
    pub fn atmospheric_depth(strength: f64, darkening: f64) -> f64 {
        // Combines fog opacity (strength) and explicit darkening
        let fog_impact = strength * 0.15;
        let dark_impact = darkening;
        1.0 - (fog_impact + dark_impact).min(0.5)
    }

    /// Volumetric occlusion: simulates light blocking.
    pub fn volumetric_occlusion(strength: f64) -> f64 {
        // Strong darkening effect in dense areas
        1.0 - strength * 0.4
    }

    /// Cosmic ink: adds dark swirling patterns.
    pub fn cosmic_ink(strength: f64) -> f64 {
        // Dark ink overlay
        1.0 - strength * 0.35
    }

    /// Deep space: interstellar medium absorption.
    pub fn deep_space(strength: f64) -> f64 {
        // Gas absorption and scattering
        1.0 - strength * 0.3
    }

    /// Color grading vignette component.
    pub fn color_grade_vignette(vignette_strength: f64) -> f64 {
        vignette(vignette_strength)
    }

    /// Dodge & burn burn component.
    pub fn dodge_burn_burn(burn_amount: f64) -> f64 {
        // Burn darkens highlights
        1.0 - burn_amount * 0.1
    }
}

/// Energy factors for brightening effects.
///
/// These effects add light or increase brightness.
pub mod brightening {
    /// Gaussian bloom: redistributes and adds glow.
    pub fn gaussian_bloom(strength: f64) -> f64 {
        // Bloom adds light from bright areas
        1.0 + strength * 0.15
    }

    /// DoG bloom: difference-of-gaussians adds edge glow.
    pub fn dog_bloom(strength: f64) -> f64 {
        // Similar to gaussian but more localized
        1.0 + strength * 0.10
    }

    /// Chromatic bloom: adds color-separated glow.
    pub fn chromatic_bloom(strength: f64) -> f64 {
        1.0 + strength * 0.12
    }

    /// Glow enhancement: boosts existing glow regions.
    pub fn glow_enhancement(strength: f64) -> f64 {
        1.0 + strength * 0.20
    }

    /// Edge luminance: brightens edges.
    pub fn edge_luminance(strength: f64, brightness_boost: f64) -> f64 {
        // Edge detection + brightness boost
        1.0 + strength * brightness_boost * 0.15
    }

    /// Halation: film-like light bloom.
    pub fn halation(strength: f64) -> f64 {
        // Adds warm glow around bright areas
        1.0 + strength * 0.10
    }

    /// Cherenkov radiation glow.
    pub fn cherenkov(strength: f64) -> f64 {
        // Adds blue/UV glow
        1.0 + strength * 0.15
    }

    /// Prismatic halos: rainbow rings around bright points.
    pub fn prismatic_halos(strength: f64) -> f64 {
        1.0 + strength * 0.08
    }

    /// Crepuscular rays: god rays effect.
    pub fn crepuscular_rays(strength: f64) -> f64 {
        1.0 + strength * 0.12
    }

    /// Dodge & burn dodge component.
    pub fn dodge_burn_dodge(dodge_amount: f64) -> f64 {
        // Dodge brightens shadows
        1.0 + dodge_amount * 0.1
    }

    /// Aurora veils: additive aurora overlay.
    pub fn aurora_veils(strength: f64) -> f64 {
        1.0 + strength * 0.15
    }
}

/// Energy factors for neutral effects.
///
/// These effects transform colors without significant brightness change.
pub mod neutral {
    /// Perceptual blur: softens without brightness change.
    pub const PERCEPTUAL_BLUR: f64 = 1.0;

    /// Color grading (excluding vignette).
    pub const COLOR_GRADE_BASE: f64 = 1.0;

    /// Gradient map: remaps colors.
    pub const GRADIENT_MAP: f64 = 1.0;

    /// Champlevé iridescence: adds color variation.
    pub const CHAMPLEVE: f64 = 1.0;

    /// Aether weave: structural color patterns.
    pub const AETHER: f64 = 1.0;

    /// Opalescence: pearlescent color shift.
    pub const OPALESCENCE: f64 = 1.0;

    /// Micro contrast: local contrast enhancement.
    pub const MICRO_CONTRAST: f64 = 1.0;

    /// Fine texture: surface texture overlay.
    pub const FINE_TEXTURE: f64 = 1.0;

    /// Event horizon: gravitational lensing.
    pub const EVENT_HORIZON: f64 = 1.0;

    /// Refractive caustics: light bending.
    pub const REFRACTIVE_CAUSTICS: f64 = 1.0;

    /// Dimensional glitch: distortion effect.
    pub const DIMENSIONAL_GLITCH: f64 = 1.0;

    /// Nebula clouds: background layer (composited separately).
    pub const NEBULA_CLOUDS: f64 = 1.0;
}

/// Compute combined energy factor for a set of effects.
///
/// This accounts for the multiplicative nature of brightness changes.
pub fn combine_factors(factors: &[f64]) -> f64 {
    factors.iter().product()
}

/// Effect energy catalog with parameter-aware calculations.
///
/// This struct provides a centralized way to compute energy factors
/// based on effect configurations.
#[derive(Default, Clone, Debug)]
pub struct EffectEnergyCatalog {
    /// Cached combined factor
    combined: Option<f64>,
    /// Individual effect factors
    factors: Vec<(String, f64)>,
}

impl EffectEnergyCatalog {
    /// Create a new empty catalog.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add an effect's energy factor.
    pub fn add(&mut self, name: &str, factor: f64) {
        self.factors.push((name.to_string(), factor));
        self.combined = None; // Invalidate cache
    }

    /// Add a darkening effect.
    pub fn add_vignette(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("vignette", darkening::vignette(strength));
        }
    }

    /// Add atmospheric depth.
    pub fn add_atmospheric_depth(&mut self, strength: f64, darkening_param: f64) {
        if strength > 0.0 {
            self.add("atmospheric_depth", darkening::atmospheric_depth(strength, darkening_param));
        }
    }

    /// Add volumetric occlusion.
    pub fn add_volumetric_occlusion(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("volumetric_occlusion", darkening::volumetric_occlusion(strength));
        }
    }

    /// Add cosmic ink.
    pub fn add_cosmic_ink(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("cosmic_ink", darkening::cosmic_ink(strength));
        }
    }

    /// Add gaussian bloom.
    pub fn add_gaussian_bloom(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("gaussian_bloom", brightening::gaussian_bloom(strength));
        }
    }

    /// Add DoG bloom.
    pub fn add_dog_bloom(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("dog_bloom", brightening::dog_bloom(strength));
        }
    }

    /// Add chromatic bloom.
    pub fn add_chromatic_bloom(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("chromatic_bloom", brightening::chromatic_bloom(strength));
        }
    }

    /// Add glow enhancement.
    pub fn add_glow_enhancement(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("glow_enhancement", brightening::glow_enhancement(strength));
        }
    }

    /// Add edge luminance.
    pub fn add_edge_luminance(&mut self, strength: f64, brightness_boost: f64) {
        if strength > 0.0 {
            self.add("edge_luminance", brightening::edge_luminance(strength, brightness_boost));
        }
    }

    /// Add halation.
    pub fn add_halation(&mut self, strength: f64) {
        if strength > 0.0 {
            self.add("halation", brightening::halation(strength));
        }
    }

    /// Add dodge & burn (combined).
    pub fn add_dodge_burn(&mut self, dodge_amount: f64, burn_amount: f64) {
        let dodge = brightening::dodge_burn_dodge(dodge_amount);
        let burn = darkening::dodge_burn_burn(burn_amount);
        // Net effect is product
        self.add("dodge_burn", dodge * burn);
    }

    /// Get the combined energy factor.
    pub fn combined_factor(&mut self) -> f64 {
        if let Some(cached) = self.combined {
            return cached;
        }

        let factors: Vec<f64> = self.factors.iter().map(|(_, f)| *f).collect();
        let combined = combine_factors(&factors);
        self.combined = Some(combined);
        combined
    }

    /// Get a breakdown of factors by effect.
    pub fn breakdown(&self) -> &[(String, f64)] {
        &self.factors
    }

    /// Check if any darkening effects are present.
    pub fn has_darkening(&self) -> bool {
        self.factors.iter().any(|(_, f)| *f < 1.0)
    }

    /// Check if any brightening effects are present.
    pub fn has_brightening(&self) -> bool {
        self.factors.iter().any(|(_, f)| *f > 1.0)
    }

    /// Get the compensation needed to restore neutral energy.
    pub fn compensation_factor(&mut self) -> f64 {
        let combined = self.combined_factor();
        if combined <= 0.0 {
            return 1.0;
        }
        1.0 / combined
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vignette_energy() {
        // No vignette = neutral
        assert!((darkening::vignette(0.0) - 1.0).abs() < 1e-10);

        // Full vignette = ~75% brightness
        assert!((darkening::vignette(1.0) - 0.75).abs() < 1e-10);

        // Mid vignette = between
        let mid = darkening::vignette(0.5);
        assert!(mid > 0.75 && mid < 1.0);
    }

    #[test]
    fn test_bloom_energy() {
        // No bloom = neutral
        assert!((brightening::gaussian_bloom(0.0) - 1.0).abs() < 1e-10);

        // Full bloom = +15%
        assert!((brightening::gaussian_bloom(1.0) - 1.15).abs() < 1e-10);
    }

    #[test]
    fn test_atmospheric_depth_energy() {
        // Strong atmospheric effect
        let factor = darkening::atmospheric_depth(0.8, 0.15);
        assert!(factor < 1.0);
        assert!(factor > 0.5);
    }

    #[test]
    fn test_combine_factors() {
        // Two 80% effects = 64%
        let factors = vec![0.8, 0.8];
        let combined = combine_factors(&factors);
        assert!((combined - 0.64).abs() < 1e-10);

        // Brightening cancels darkening
        let factors = vec![0.8, 1.25];
        let combined = combine_factors(&factors);
        assert!((combined - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_catalog_building() {
        let mut catalog = EffectEnergyCatalog::new();

        catalog.add_vignette(0.5);
        catalog.add_gaussian_bloom(0.3);
        catalog.add_atmospheric_depth(0.5, 0.1);

        let combined = catalog.combined_factor();

        // Should be product of all factors
        assert!(combined > 0.0);
        assert!(combined < 1.0); // Net darkening expected
    }

    #[test]
    fn test_catalog_compensation() {
        let mut catalog = EffectEnergyCatalog::new();

        catalog.add_vignette(1.0); // 0.75 factor

        let comp = catalog.compensation_factor();

        // Compensation should be ~1.33 to restore brightness
        assert!((comp - 1.0 / 0.75).abs() < 1e-10);
    }

    #[test]
    fn test_catalog_breakdown() {
        let mut catalog = EffectEnergyCatalog::new();

        catalog.add_vignette(0.5);
        catalog.add_gaussian_bloom(0.3);

        let breakdown = catalog.breakdown();
        assert_eq!(breakdown.len(), 2);
        assert_eq!(breakdown[0].0, "vignette");
        assert_eq!(breakdown[1].0, "gaussian_bloom");
    }

    #[test]
    fn test_has_darkening_brightening() {
        let mut catalog = EffectEnergyCatalog::new();

        catalog.add_vignette(0.5);
        assert!(catalog.has_darkening());
        assert!(!catalog.has_brightening());

        catalog.add_gaussian_bloom(0.5);
        assert!(catalog.has_brightening());
    }

    #[test]
    fn test_neutral_effects() {
        // Neutral effects should be exactly 1.0
        assert!((neutral::PERCEPTUAL_BLUR - 1.0).abs() < 1e-10);
        assert!((neutral::GRADIENT_MAP - 1.0).abs() < 1e-10);
        assert!((neutral::CHAMPLEVE - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_dodge_burn_combined() {
        let mut catalog = EffectEnergyCatalog::new();

        // Equal dodge and burn should roughly cancel
        catalog.add_dodge_burn(0.5, 0.5);

        let factor = catalog.combined_factor();
        // Should be close to 1.0 but not exactly (different curve shapes)
        assert!(factor > 0.95 && factor < 1.05);
    }
}

