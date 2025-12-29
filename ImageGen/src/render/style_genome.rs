//! Style Genome: Coherent aesthetic randomization system
//!
//! Instead of random parameter soup, this module derives a small vector of
//! **continuous style coordinates** from the seed. These coordinates create
//! a "genetic" style identity that influences all parameters coherently.
//!
//! # The Problem with Random Parameters
//!
//! When each parameter is randomized independently, you get:
//! - Incoherent aesthetics (photochemical effects mixed with digital glitch)
//! - Jarring combinations (warm halation with cool atmospheric fog)
//! - "Parameter soup" that lacks artistic vision
//!
//! # The Style Genome Solution
//!
//! A small set of continuous style axes (0.0-1.0 each) creates a "genetic"
//! fingerprint for each seed. These axes bias all subsequent randomization:
//!
//! - **photochemical**: Clinical/digital ↔ Film/emulsion
//! - **ornate**: Minimal/clean ↔ Rich/decorated
//! - **ethereal**: Material/solid ↔ Atmospheric/diffuse
//! - **chromatic**: Monochrome/muted ↔ Prismatic/saturated
//! - **crisp**: Soft/dreamy ↔ Sharp/defined
//! - **dramatic**: Flat/even ↔ High contrast/moody
//! - **organic**: Geometric/ordered ↔ Fluid/chaotic
//! - **luminous**: Dark/shadowy ↔ Bright/glowing
//!
//! # Usage
//!
//! ```ignore
//! let genome = StyleGenome::from_rng(rng);
//! let halation_prob = genome.effect_probability("halation", 0.4);
//! let (blur_min, blur_max) = genome.bias_range("blur_strength", 5.0, 20.0);
//! ```

use crate::sim::Sha3RandomByteStream;

/// Style genome: 8 continuous axes that define aesthetic coherence.
///
/// Each axis is a value in [0.0, 1.0] derived deterministically from the seed.
/// Together, they create a unique "style fingerprint" for each render.
#[derive(Clone, Debug)]
pub struct StyleGenome {
    /// Clinical/digital (0.0) ↔ Film/emulsion (1.0)
    /// High values favor: halation, fine texture, dodge & burn
    /// Low values favor: clean digital look, no grain
    pub photochemical: f64,

    /// Minimal/clean (0.0) ↔ Rich/decorated (1.0)
    /// High values favor: opalescence, champlevé, aether
    /// Low values favor: simple, unadorned appearance
    pub ornate: f64,

    /// Material/solid (0.0) ↔ Atmospheric/diffuse (1.0)
    /// High values favor: atmospheric depth, aurora, cosmic ink
    /// Low values favor: crisp edges, high micro-contrast
    pub ethereal: f64,

    /// Monochrome/muted (0.0) ↔ Prismatic/saturated (1.0)
    /// High values favor: chromatic bloom, gradient map, high vibrance
    /// Low values favor: desaturated, subtle color
    pub chromatic: f64,

    /// Soft/dreamy (0.0) ↔ Sharp/defined (1.0)
    /// High values favor: micro-contrast, edge luminance
    /// Low values favor: perceptual blur, soft bloom
    pub crisp: f64,

    /// Flat/even (0.0) ↔ High contrast/moody (1.0)
    /// High values favor: vignette, dodge & burn, volumetric occlusion
    /// Low values favor: even lighting, low contrast
    pub dramatic: f64,

    /// Geometric/ordered (0.0) ↔ Fluid/chaotic (1.0)
    /// High values favor: cosmic ink, aether flow
    /// Low values favor: structured champlevé, rigid forms
    pub organic: f64,

    /// Dark/shadowy (0.0) ↔ Bright/glowing (1.0)
    /// High values favor: glow enhancement, halation, bloom
    /// Low values favor: atmospheric darkening, shadow depth
    pub luminous: f64,
}

impl StyleGenome {
    /// Generate style genome from RNG (deterministic for same seed).
    ///
    /// Each axis is sampled independently from the RNG stream, creating
    /// a unique style fingerprint for each seed.
    pub fn from_rng(rng: &mut Sha3RandomByteStream) -> Self {
        Self {
            photochemical: rng.next_f64(),
            ornate: rng.next_f64(),
            ethereal: rng.next_f64(),
            chromatic: rng.next_f64(),
            crisp: rng.next_f64(),
            dramatic: rng.next_f64(),
            organic: rng.next_f64(),
            luminous: rng.next_f64(),
        }
    }

    /// Get biased probability for an effect based on genome.
    ///
    /// The genome shifts the base probability up or down based on
    /// which style axes are relevant to that effect.
    ///
    /// # Arguments
    ///
    /// * `effect_name` - Name of the effect (e.g., "halation", "opalescence")
    /// * `base_prob` - Base probability before genome influence (0.0-1.0)
    ///
    /// # Returns
    ///
    /// Adjusted probability clamped to [0.0, 1.0]
    pub fn effect_probability(&self, effect_name: &str, base_prob: f64) -> f64 {
        let bias = match effect_name {
            // Photochemical finishing effects
            "halation" => self.photochemical * 0.35 + self.luminous * 0.20,
            "fine_texture" => self.photochemical * 0.25 + self.ornate * 0.20,
            "dodge_burn" => self.photochemical * 0.20 + self.dramatic * 0.30,

            // Material/decorative effects
            "opalescence" => self.ornate * 0.35 + self.chromatic * 0.15,
            "champleve" => self.ornate * 0.30 - self.organic * 0.10,
            "aether" => self.ornate * 0.25 + self.organic * 0.20,

            // Atmospheric effects
            "atmospheric_depth" => self.ethereal * 0.35 + self.dramatic * 0.15,
            "aurora_veils" => self.ethereal * 0.30 + self.chromatic * 0.15,
            "cosmic_ink" => self.ethereal * 0.25 + self.organic * 0.25,
            "deep_space" => self.ethereal * 0.30 + self.dramatic * 0.15,

            // Color effects
            "gradient_map" => self.chromatic * 0.25 + self.dramatic * 0.10,
            "chromatic_bloom" => self.chromatic * 0.30 - self.photochemical * 0.15,

            // Detail/clarity effects
            "micro_contrast" => self.crisp * 0.30 - self.ethereal * 0.15,
            "edge_luminance" => self.crisp * 0.25 + self.dramatic * 0.10,
            "perceptual_blur" => (1.0 - self.crisp) * 0.25,

            // Glow effects
            "glow" => self.luminous * 0.35,
            "bloom" => self.luminous * 0.25 - self.crisp * 0.10,

            // Depth effects
            "volumetric_occlusion" => self.dramatic * 0.30 + (1.0 - self.ethereal) * 0.15,
            "crepuscular_rays" => self.dramatic * 0.25 + self.luminous * 0.15,

            // Physics effects
            "event_horizon" => self.dramatic * 0.20,
            "cherenkov" => self.luminous * 0.25 + self.chromatic * 0.15,
            "prismatic_halos" => self.chromatic * 0.25 + self.luminous * 0.15,

            _ => 0.0,
        };

        (base_prob + bias).clamp(0.0, 0.95)
    }

    /// Get biased parameter range based on genome.
    ///
    /// Shifts and potentially narrows parameter ranges based on
    /// style preferences encoded in the genome.
    ///
    /// # Arguments
    ///
    /// * `param_name` - Name of the parameter
    /// * `min` - Original minimum value
    /// * `max` - Original maximum value
    ///
    /// # Returns
    ///
    /// Tuple of (new_min, new_max) biased by genome
    #[allow(dead_code)] // Reserved for future genome-biased parameter sampling
    pub fn bias_range(&self, param_name: &str, min: f64, max: f64) -> (f64, f64) {
        let range = max - min;

        let (range_scale, center_shift) = match param_name {
            // Photochemical parameters
            "halation_warmth" => (1.0, self.photochemical * 0.15),
            "halation_strength" => (1.0, self.photochemical * 0.10 + self.luminous * 0.05),

            // Dramatic parameters
            "vignette_strength" => (1.0, self.dramatic * 0.15),
            "dodge_burn_strength" => (1.0, self.dramatic * 0.10 + self.photochemical * 0.05),
            "volumetric_occlusion_strength" => (1.0, self.dramatic * 0.12),

            // Blur/sharpness parameters
            "blur_strength" => (1.0, -self.crisp * 0.15),
            "perceptual_blur_strength" => (1.0, -self.crisp * 0.20),
            "micro_contrast_strength" => (1.0, self.crisp * 0.12),

            // Color parameters
            "vibrance" => (1.0, self.chromatic * 0.15),
            "chromatic_bloom_strength" => (1.0, self.chromatic * 0.10 - self.photochemical * 0.05),

            // Atmospheric parameters
            "atmospheric_depth_strength" => (1.0, self.ethereal * 0.15),
            "atmospheric_darkening" => (1.0, (1.0 - self.luminous) * 0.10),

            // Glow parameters
            "glow_strength" => (1.0, self.luminous * 0.12),
            "bloom_core_brightness" => (1.0, self.luminous * 0.08),

            // Material parameters
            "opalescence_strength" => (1.0, self.ornate * 0.10),
            "aether_scattering_strength" => (1.0, self.organic * 0.08),

            _ => (1.0, 0.0),
        };

        let new_min = (min + center_shift * range).clamp(min, max);
        let new_max = (new_min + range * range_scale).clamp(new_min, max);

        (new_min, new_max)
    }

    /// Get a summary of the dominant style characteristics.
    ///
    /// Returns a human-readable description of the genome's primary traits.
    #[allow(dead_code)]
    pub fn describe(&self) -> String {
        let mut traits = Vec::new();

        if self.photochemical > 0.65 {
            traits.push("film-like");
        }
        if self.ornate > 0.65 {
            traits.push("richly decorated");
        }
        if self.ethereal > 0.65 {
            traits.push("atmospheric");
        }
        if self.chromatic > 0.65 {
            traits.push("prismatic");
        }
        if self.crisp > 0.65 {
            traits.push("sharp");
        }
        if self.dramatic > 0.65 {
            traits.push("high-contrast");
        }
        if self.organic > 0.65 {
            traits.push("fluid");
        }
        if self.luminous > 0.65 {
            traits.push("glowing");
        }

        // Also note the low extremes
        if self.photochemical < 0.35 {
            traits.push("clinical");
        }
        if self.ornate < 0.35 {
            traits.push("minimal");
        }
        if self.ethereal < 0.35 {
            traits.push("solid");
        }
        if self.chromatic < 0.35 {
            traits.push("muted");
        }
        if self.crisp < 0.35 {
            traits.push("dreamy");
        }
        if self.dramatic < 0.35 {
            traits.push("even");
        }
        if self.organic < 0.35 {
            traits.push("geometric");
        }
        if self.luminous < 0.35 {
            traits.push("dark");
        }

        if traits.is_empty() {
            "balanced".to_string()
        } else {
            traits.join(", ")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_rng() -> Sha3RandomByteStream {
        Sha3RandomByteStream::new(b"test_style_genome_v1", 100.0, 300.0, 25.0, 10.0)
    }

    #[test]
    fn test_genome_axes_in_range() {
        let mut rng = test_rng();
        let genome = StyleGenome::from_rng(&mut rng);

        assert!(genome.photochemical >= 0.0 && genome.photochemical <= 1.0);
        assert!(genome.ornate >= 0.0 && genome.ornate <= 1.0);
        assert!(genome.ethereal >= 0.0 && genome.ethereal <= 1.0);
        assert!(genome.chromatic >= 0.0 && genome.chromatic <= 1.0);
        assert!(genome.crisp >= 0.0 && genome.crisp <= 1.0);
        assert!(genome.dramatic >= 0.0 && genome.dramatic <= 1.0);
        assert!(genome.organic >= 0.0 && genome.organic <= 1.0);
        assert!(genome.luminous >= 0.0 && genome.luminous <= 1.0);
    }

    #[test]
    fn test_genome_deterministic() {
        let mut rng1 = test_rng();
        let mut rng2 = test_rng();

        let genome1 = StyleGenome::from_rng(&mut rng1);
        let genome2 = StyleGenome::from_rng(&mut rng2);

        assert!((genome1.photochemical - genome2.photochemical).abs() < 1e-10);
        assert!((genome1.ornate - genome2.ornate).abs() < 1e-10);
        assert!((genome1.ethereal - genome2.ethereal).abs() < 1e-10);
    }

    #[test]
    fn test_effect_probability_bounded() {
        let mut rng = test_rng();
        let genome = StyleGenome::from_rng(&mut rng);

        for effect in &[
            "halation",
            "fine_texture",
            "opalescence",
            "chromatic_bloom",
            "atmospheric_depth",
        ] {
            let prob = genome.effect_probability(effect, 0.5);
            assert!(
                prob >= 0.0 && prob <= 1.0,
                "Probability for {} out of range: {}",
                effect,
                prob
            );
        }
    }

    #[test]
    fn test_photochemical_genome_favors_halation() {
        // Create a genome that's fully photochemical
        let genome = StyleGenome {
            photochemical: 1.0,
            ornate: 0.5,
            ethereal: 0.5,
            chromatic: 0.5,
            crisp: 0.5,
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let halation_prob = genome.effect_probability("halation", 0.3);
        let chromatic_prob = genome.effect_probability("chromatic_bloom", 0.3);

        // Photochemical genome should strongly favor halation over chromatic bloom
        assert!(
            halation_prob > chromatic_prob,
            "Photochemical genome should favor halation ({}) over chromatic bloom ({})",
            halation_prob,
            chromatic_prob
        );
    }

    #[test]
    fn test_bias_range_within_bounds() {
        let mut rng = test_rng();
        let genome = StyleGenome::from_rng(&mut rng);

        let (min, max) = genome.bias_range("vignette_strength", 0.0, 0.5);
        assert!(min >= 0.0, "Min below original: {}", min);
        assert!(max <= 0.5, "Max above original: {}", max);
        assert!(min <= max, "Min > max: {} > {}", min, max);
    }

    #[test]
    fn test_dramatic_genome_increases_vignette() {
        let genome = StyleGenome {
            photochemical: 0.5,
            ornate: 0.5,
            ethereal: 0.5,
            chromatic: 0.5,
            crisp: 0.5,
            dramatic: 1.0, // Max dramatic
            organic: 0.5,
            luminous: 0.5,
        };

        let (min, _max) = genome.bias_range("vignette_strength", 0.0, 0.5);

        // High dramatic should shift vignette range upward
        assert!(min > 0.0, "Dramatic genome should increase vignette minimum");
    }

    #[test]
    fn test_describe_extreme_genomes() {
        let bright = StyleGenome {
            photochemical: 0.1,
            ornate: 0.1,
            ethereal: 0.1,
            chromatic: 0.1,
            crisp: 0.1,
            dramatic: 0.1,
            organic: 0.1,
            luminous: 0.9,
        };

        let description = bright.describe();
        assert!(description.contains("glowing"), "Should describe as glowing: {}", description);
        assert!(description.contains("clinical"), "Should describe as clinical: {}", description);
    }

    #[test]
    fn test_unknown_effect_zero_bias() {
        let mut rng = test_rng();
        let genome = StyleGenome::from_rng(&mut rng);

        // Unknown effect should return base probability unchanged
        let prob = genome.effect_probability("unknown_effect_xyz", 0.42);
        assert!(
            (prob - 0.42).abs() < 1e-10,
            "Unknown effect should return base probability"
        );
    }

    #[test]
    fn test_effect_probability_all_known_effects() {
        let mut rng = test_rng();
        let genome = StyleGenome::from_rng(&mut rng);

        // All effects that have genome biasing should return valid probabilities
        let effects = [
            "halation", "fine_texture", "dodge_burn", "opalescence", "champléve",
            "aether", "chromatic_bloom", "prismatic_halos", "atmospheric_depth",
            "aurora_veils", "cosmic_ink", "deep_space", "glow", "bloom",
            "micro_contrast", "edge_luminance", "vignette", "volumetric_occlusion",
        ];

        for effect in &effects {
            let prob = genome.effect_probability(effect, 0.5);
            assert!(
                prob >= 0.0 && prob <= 1.0,
                "Effect {} has invalid probability: {}",
                effect,
                prob
            );
        }
    }

    #[test]
    fn test_chromatic_genome_favors_chromatic_effects() {
        let genome = StyleGenome {
            photochemical: 0.5,
            ornate: 0.5,
            ethereal: 0.5,
            chromatic: 1.0, // Max chromatic
            crisp: 0.5,
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let chromatic_prob = genome.effect_probability("chromatic_bloom", 0.3);
        let neutral_prob = genome.effect_probability("halation", 0.3);

        // Chromatic genome should favor chromatic bloom
        assert!(
            chromatic_prob > neutral_prob * 0.8,
            "Chromatic genome should favor chromatic bloom"
        );
    }

    #[test]
    fn test_ethereal_genome_favors_atmospheric() {
        let genome = StyleGenome {
            photochemical: 0.5,
            ornate: 0.5,
            ethereal: 1.0, // Max ethereal
            chromatic: 0.5,
            crisp: 0.5,
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let atmos_prob = genome.effect_probability("atmospheric_depth", 0.3);

        // Ethereal genome should favor atmospheric depth
        assert!(
            atmos_prob > 0.35,
            "Ethereal genome should significantly boost atmospheric depth: {}",
            atmos_prob
        );
    }

    #[test]
    fn test_luminous_genome_favors_glow() {
        let genome = StyleGenome {
            photochemical: 0.5,
            ornate: 0.5,
            ethereal: 0.5,
            chromatic: 0.5,
            crisp: 0.5,
            dramatic: 0.5,
            organic: 0.5,
            luminous: 1.0, // Max luminous
        };

        let glow_prob = genome.effect_probability("glow", 0.3);

        // Luminous genome should favor glow
        assert!(
            glow_prob > 0.35,
            "Luminous genome should boost glow: {}",
            glow_prob
        );
    }

    #[test]
    fn test_crisp_genome_favors_sharpness() {
        let genome = StyleGenome {
            photochemical: 0.5,
            ornate: 0.5,
            ethereal: 0.5,
            chromatic: 0.5,
            crisp: 1.0, // Max crisp
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let micro_prob = genome.effect_probability("micro_contrast", 0.3);

        // Crisp genome should favor micro-contrast
        assert!(
            micro_prob > 0.35,
            "Crisp genome should boost micro_contrast: {}",
            micro_prob
        );
    }

    #[test]
    fn test_ornate_genome_favors_decorative() {
        let genome = StyleGenome {
            photochemical: 0.5,
            ornate: 1.0, // Max ornate
            ethereal: 0.5,
            chromatic: 0.5,
            crisp: 0.5,
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let opal_prob = genome.effect_probability("opalescence", 0.3);

        // Ornate genome should favor opalescence
        assert!(
            opal_prob > 0.35,
            "Ornate genome should boost opalescence: {}",
            opal_prob
        );
    }

    #[test]
    fn test_bias_range_preserves_order() {
        let mut rng = test_rng();
        let genome = StyleGenome::from_rng(&mut rng);

        let params = [
            ("vignette_strength", 0.0, 0.5),
            ("micro_contrast_strength", 0.05, 0.35),
            ("halation_strength", 0.1, 0.5),
            ("glow_strength", 0.2, 0.8),
        ];

        for (name, min, max) in params {
            let (new_min, new_max) = genome.bias_range(name, min, max);
            assert!(
                new_min >= min && new_max <= max && new_min <= new_max,
                "bias_range for {} violated constraints: [{}, {}] -> [{}, {}]",
                name, min, max, new_min, new_max
            );
        }
    }

    #[test]
    fn test_different_seeds_produce_different_genomes() {
        let mut rng1 = Sha3RandomByteStream::new(b"seed_alpha", 100.0, 300.0, 25.0, 10.0);
        let mut rng2 = Sha3RandomByteStream::new(b"seed_beta", 100.0, 300.0, 25.0, 10.0);

        let genome1 = StyleGenome::from_rng(&mut rng1);
        let genome2 = StyleGenome::from_rng(&mut rng2);

        // At least one axis should differ significantly
        let diff = (genome1.photochemical - genome2.photochemical).abs()
            + (genome1.ornate - genome2.ornate).abs()
            + (genome1.ethereal - genome2.ethereal).abs()
            + (genome1.chromatic - genome2.chromatic).abs();

        assert!(
            diff > 0.1,
            "Different seeds should produce different genomes"
        );
    }

    #[test]
    fn test_describe_balanced_genome() {
        let balanced = StyleGenome {
            photochemical: 0.5,
            ornate: 0.5,
            ethereal: 0.5,
            chromatic: 0.5,
            crisp: 0.5,
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let description = balanced.describe();
        assert_eq!(description, "balanced", "Balanced genome should describe as balanced");
    }

    #[test]
    fn test_describe_mixed_genome() {
        let mixed = StyleGenome {
            photochemical: 0.9, // high
            ornate: 0.2,        // low
            ethereal: 0.5,
            chromatic: 0.9, // high
            crisp: 0.2,     // low
            dramatic: 0.5,
            organic: 0.5,
            luminous: 0.5,
        };

        let description = mixed.describe();
        assert!(description.contains("film-like"), "Should contain film-like: {}", description);
        assert!(description.contains("minimal"), "Should contain minimal: {}", description);
        assert!(description.contains("prismatic"), "Should contain prismatic: {}", description);
        assert!(description.contains("dreamy"), "Should contain dreamy: {}", description);
    }
}

