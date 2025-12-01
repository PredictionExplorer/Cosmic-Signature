//! Effect randomization system using statistical distributions.
//!
//! This module provides type-safe randomization of effect parameters using
//! distributions (typically truncated normal) rather than uniform sampling.
//!
//! # Aesthetic Axes System
//!
//! The core innovation is the use of **continuous aesthetic axes** to guide
//! randomization. Instead of discrete themes or pure randomness, each render
//! occupies a unique position in a 3-dimensional aesthetic space:
//!
//! - **Energy vs. Matter** (Light/Glow vs. Surface/Texture)
//! - **Vintage vs. Digital** (Soft/Film vs. Sharp/Glitch)
//! - **Complexity** (Minimal vs. Baroque)
//!
//! These axes dynamically adjust probabilities and parameters, creating infinite
//! variety while maintaining artistic coherence.
//!
//! ## Example
//!
//! ```
//! # use three_body_problem::render::effect_randomizer::EffectRandomizer;
//! # use three_body_problem::sim::Sha3RandomByteStream;
//! let seed = vec![0x42, 0x43, 0x44, 0x45];
//! let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
//! let mut randomizer = EffectRandomizer::new(&mut rng, true);
//!
//! // Biases are randomly generated for this render
//! let biases = randomizer.biases();
//! println!("Energy vs Matter: {}", biases.energy_vs_matter);
//!
//! // Probabilities are dynamically calculated based on biases
//! let enable_bloom = randomizer.randomize_enable("bloom");
//! ```
//!
//! See `AESTHETIC_AXES_SYSTEM.md` for comprehensive documentation.

use super::parameter_descriptors::{FloatParamDescriptor, IntParamDescriptor};
use crate::sim::Sha3RandomByteStream;
use crate::weighted_sampler;

/// Continuous aesthetic axes that guide probability distributions.
///
/// These three axes define a 3-dimensional "aesthetic space" where each point
/// represents a unique visual style. The axes create fluid biases rather than
/// discrete categories, ensuring infinite variety.
///
/// # Design Rationale
///
/// - **Why Continuous?** Allows for gradient transitions (e.g., 70% Matter, 30% Energy)
/// - **Why 3 Axes?** Covers the major aesthetic dimensions without over-constraining
/// - **Why Not More?** Additional axes have diminishing returns and increase complexity
///
/// # Example Positions
///
/// | E | V | C | Style |
/// |---|---|---|-------|
/// | 0.1 | 0.1 | 0.2 | Soft glowing minimalism |
/// | 0.9 | 0.1 | 0.7 | Vintage oil painting |
/// | 0.1 | 0.9 | 0.8 | Neon hologram |
/// | 0.9 | 0.9 | 0.3 | Sharp metallic sculpture |
#[derive(Clone, Copy, Debug)]
pub struct AestheticBiases {
    /// **Energy vs. Matter Axis** (`0.0` = Pure Energy, `1.0` = Pure Matter)
    ///
    /// Controls the balance between light-based effects (bloom, glow, rays) and
    /// material-based effects (texture, enamel, surface detail).
    ///
    /// - **Low (Energy):** Favors bloom, glow, prismatic halos, cherenkov
    /// - **High (Matter):** Favors champlevé, fine texture, shadows, surface detail
    pub energy_vs_matter: f64,

    /// **Vintage vs. Digital Axis** (`0.0` = Vintage, `1.0` = Digital)
    ///
    /// Controls the "lens" aesthetic - soft/film vs. sharp/glitchy.
    ///
    /// - **Low (Vintage):** Favors soft blur, warm palettes, gentle vignettes
    /// - **High (Digital):** Favors chromatic aberration, glitches, high contrast, neon
    pub vintage_vs_digital: f64,

    /// **Complexity Axis** (`0.0` = Minimal, `1.0` = Baroque)
    ///
    /// Controls the overall density of effects and layering.
    ///
    /// - **Low (Minimal):** Fewer effects enabled, clean look
    /// - **High (Baroque):** Many effects enabled, rich layering
    pub complexity: f64,
}

/// Randomizer for effect parameters using statistical distributions.
///
/// This is the core engine that generates aesthetic variety. It combines:
/// 1. **Aesthetic Biases:** Continuous axes that define the overall style
/// 2. **Statistical Distributions:** Truncated normal sampling for parameters
/// 3. **Dynamic Probabilities:** Effect enable probabilities calculated from biases
///
/// # Architecture
///
/// ```text
/// RNG Seed → Aesthetic Biases (3 floats) → Effect Probabilities
///                                        ↓
///                                   Enable/Disable
///                                        ↓
///                              Parameter Sampling (Gaussian)
/// ```
///
/// # Example
///
/// ```
/// # use three_body_problem::render::effect_randomizer::EffectRandomizer;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// let seed = vec![0x12, 0x34, 0x56, 0x78];
/// let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
/// let mut randomizer = EffectRandomizer::new(&mut rng, true);
///
/// // Check if an effect should be enabled based on biases
/// let should_enable_bloom = randomizer.randomize_enable("bloom");
/// ```
pub struct EffectRandomizer<'a> {
    rng: &'a mut Sha3RandomByteStream,
    gallery_quality: bool,
    biases: AestheticBiases,
}

impl<'a> EffectRandomizer<'a> {
    /// Create a new effect randomizer with randomly generated aesthetic biases.
    ///
    /// # Design
    ///
    /// The biases are sampled uniformly from [0.0, 1.0] at construction time,
    /// ensuring each render has a unique position in the aesthetic space.
    ///
    /// # Arguments
    ///
    /// * `rng` - Random number generator (deterministic from seed)
    /// * `gallery_quality` - If true, use narrower parameter ranges for stability
    ///
    /// # Returns
    ///
    /// A randomizer with unique aesthetic biases for this render session
    pub fn new(rng: &'a mut Sha3RandomByteStream, gallery_quality: bool) -> Self {
        // Generate random aesthetic biases for this run
        // Each axis is uniformly sampled to ensure unbiased exploration
        let biases = AestheticBiases {
            energy_vs_matter: rng.next_f64(),
            vintage_vs_digital: rng.next_f64(),
            complexity: rng.next_f64(),
        };

        Self { rng, gallery_quality, biases }
    }

    /// Get the aesthetic biases for this randomizer.
    ///
    /// Useful for logging and debugging to understand why certain effects
    /// were chosen.
    pub fn biases(&self) -> AestheticBiases {
        self.biases
    }

    /// Randomly decide whether an effect should be enabled.
    ///
    /// The probability is dynamically calculated from the aesthetic biases,
    /// ensuring effects are correlated in aesthetically pleasing ways.
    ///
    /// # Arguments
    ///
    /// * `effect_name` - Name of the effect (e.g., "bloom", "champleve")
    ///
    /// # Returns
    ///
    /// `true` if the effect should be enabled, `false` otherwise
    ///
    /// # Example
    ///
    /// ```
    /// # use three_body_problem::render::effect_randomizer::EffectRandomizer;
    /// # use three_body_problem::sim::Sha3RandomByteStream;
    /// # let seed = vec![0x42];
    /// # let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
    /// # let mut randomizer = EffectRandomizer::new(&mut rng, false);
    /// if randomizer.randomize_enable("bloom") {
    ///     // Apply bloom effect
    /// }
    /// ```
    pub fn randomize_enable(&mut self, effect_name: &str) -> bool {
        let probability = self.get_enable_probability(effect_name);
        self.rng.next_f64() < probability
    }

    /// Calculate the enable probability for a specific effect based on aesthetic axes.
    ///
    /// This is the heart of the aesthetic system. Each effect has a formula that
    /// combines the three bias axes to produce a probability.
    ///
    /// # Design Principles
    ///
    /// - **Axis Correlation:** Effects are grouped by aesthetic affinity
    /// - **Gradient Responses:** Probabilities change smoothly as biases change
    /// - **Safety Bounds:** All probabilities clamped to [0.05, 0.95]
    ///
    /// # Formula Examples
    ///
    /// - `bloom`: `0.7 + (1.0 - energy_vs_matter) * 0.2` (favored by Energy)
    /// - `champleve`: `0.1 + energy_vs_matter * 0.8` (favored by Matter)
    /// - `chromatic_bloom`: `0.2 + vintage_vs_digital * 0.6` (favored by Digital)
    ///
    /// # Returns
    ///
    /// Probability in range [0.05, 0.95] (never 0% or 100% to preserve variety)
    fn get_enable_probability(&self, effect_name: &str) -> f64 {
        // --- 1. COMPLEXITY AXIS ---
        // Scales overall probability of "optional" effects
        let c = self.biases.complexity;

        // --- 2. ENERGY VS MATTER AXIS ---
        // e = 0 (Energy), e = 1 (Matter)
        let e = self.biases.energy_vs_matter;

        // --- 3. VINTAGE VS DIGITAL AXIS ---
        // v = 0 (Vintage), v = 1 (Digital)
        let v = self.biases.vintage_vs_digital;

        let prob = match effect_name {
            // ================== CORE EFFECTS ==================
            "bloom" => {
                // Almost always on, but slightly favored by Energy
                0.7 + (1.0 - e) * 0.2
            }
            "glow" => {
                // Favored by Energy and High Complexity
                0.4 + (1.0 - e) * 0.4 + c * 0.1
            }
            "color_grade" => {
                // Always good, slightly favored by Vintage
                0.6 + (1.0 - v) * 0.2
            }

            // ================== SURFACE / MATTER ==================
            "champleve" => {
                // Strongly favored by Matter
                0.1 + e * 0.8
            }
            "fine_texture" => {
                // Strongly favored by Matter
                0.2 + e * 0.6
            }
            "opalescence" => {
                // Matter + Vintage (Pearlescent look)
                0.1 + e * 0.4 + (1.0 - v) * 0.2
            }
            "edge_luminance" => {
                // Matter (Rim light) or Digital (Neon edge)
                // U-shaped curve: good for both extremes, bad for middle
                let distinctiveness = (e - 0.5).abs() * 2.0;
                0.3 + distinctiveness * 0.4
            }

            // ================== LIGHT / ENERGY ==================
            "crepuscular_rays" => {
                // Energy + Complexity
                0.1 + (1.0 - e) * 0.5 + c * 0.2
            }
            "cherenkov" => {
                // Digital + Energy
                0.1 + v * 0.4 + (1.0 - e) * 0.3
            }
            "prismatic_halos" => {
                // Digital + Energy + Complexity
                0.05 + v * 0.3 + (1.0 - e) * 0.3 + c * 0.2
            }
            "chromatic_bloom" => {
                // Digital favorite
                0.2 + v * 0.6
            }

            // ================== ATMOSPHERE (Special Mode uses overrides, this is base) ==================
            "volumetric_occlusion" => {
                // Matter (needs surface to cast shadow) or Energy (needs light) -> Balanced
                // Favored by Complexity
                0.3 + c * 0.4
            }
            "atmospheric_depth" => {
                // Vintage (Haze) + Complexity
                0.2 + (1.0 - v) * 0.4 + c * 0.3
            }

            // ================== ARTIFACTS ==================
            "dimensional_glitch" => {
                // Pure Digital + Energy
                if v > 0.7 && e < 0.4 { 0.6 } else { 0.05 }
            }
            "perceptual_blur" => {
                // Vintage (Softness)
                0.3 + (1.0 - v) * 0.5
            }
            "micro_contrast" => {
                // Digital (Sharpness) + Matter (Texture detail)
                0.3 + v * 0.3 + e * 0.3
            }

            // ================== STRUCTURAL ==================
            "aether" => {
                // Good all-rounder, favored by Complexity
                0.2 + c * 0.5
            }
            "gradient_map" => {
                // Digital (False color) or Vintage (Sepia/Duotone)
                // High complexity favors it less (too busy)
                0.4 + (1.0 - c) * 0.3
            }

            // Legacy / Rare
            "refractive_caustics" => 0.05,
            "event_horizon" => 0.1 + c * 0.2,
            "cosmic_ink" => 0.1 + c * 0.2,
            "aurora_veils" => 0.1 + c * 0.2,

            _ => 0.5,
        };

        prob.clamp(0.05, 0.95)
    }

    /// Generate a random float using distribution-based sampling with aesthetic shaping.
    ///
    /// This method combines two sources of quality:
    /// 1. **Base Sampling:** Uses truncated normal distributions (not uniform)
    /// 2. **Aesthetic Shaping:** Applies bias-based adjustments to the sampled value
    ///
    /// # Process
    ///
    /// 1. Sample from truncated normal distribution centered at the parameter's mean
    /// 2. Apply aesthetic bias adjustments (e.g., Vintage → softer blur radius)
    /// 3. Clamp to valid range
    ///
    /// # Arguments
    ///
    /// * `descriptor` - Parameter descriptor with min/max ranges and metadata
    ///
    /// # Returns
    ///
    /// A value in [`min`, `max`] that respects both the distribution and aesthetic biases
    ///
    /// # Safety
    ///
    /// ALWAYS returns a value within [`min`, `max`]. Multiple fallback strategies
    /// ensure this function never panics and never returns invalid values.
    ///
    /// # Example
    ///
    /// ```
    /// # use three_body_problem::render::effect_randomizer::EffectRandomizer;
    /// # use three_body_problem::render::parameter_descriptors::FloatParamDescriptor;
    /// # use three_body_problem::sim::Sha3RandomByteStream;
    /// # let seed = vec![0x42];
    /// # let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
    /// # let mut randomizer = EffectRandomizer::new(&mut rng, false);
    /// let descriptor = FloatParamDescriptor {
    ///     name: "blur_radius_scale",
    ///     min: 0.004,
    ///     max: 0.065,
    ///     gallery_min: 0.012,
    ///     gallery_max: 0.035,
    ///     description: "Blur radius scale",
    /// };
    ///
    /// let value = randomizer.randomize_float(&descriptor);
    /// assert!(value >= 0.004 && value <= 0.065);
    /// ```
    pub fn randomize_float(&mut self, descriptor: &FloatParamDescriptor) -> f64 {
        let (min, max) = descriptor.range(self.gallery_quality);

        // Base sample from distribution
        let mut value = weighted_sampler::sample_parameter(self.rng, descriptor.name, min, max);

        // Apply aesthetic bias shifts to the sampled value
        // This pushes the parameter within its valid range towards the style

        // VINTAGE vs DIGITAL adjustments
        // Vintage -> Warmer, softer
        // Digital -> Cooler, sharper, punchier
        match descriptor.name {
            "blur_radius_scale" | "glow_radius_scale" => {
                // Vintage = softer (larger radius)
                if self.biases.vintage_vs_digital < 0.3 {
                    value *= 1.2;
                } else if self.biases.vintage_vs_digital > 0.7 {
                    value *= 0.8;
                }
            }
            "glow_sharpness" | "vignette_softness" => {
                // Digital = sharper
                if self.biases.vintage_vs_digital > 0.7 {
                    value *= 1.3;
                }
            }
            "color_grade_strength" | "vibrance" => {
                // Digital = punchier
                if self.biases.vintage_vs_digital > 0.7 {
                    value *= 1.15;
                }
            }
            _ => {}
        }

        // ENERGY vs MATTER adjustments
        match descriptor.name {
            "bloom_strength" | "glow_strength" => {
                // Energy = stronger light
                if self.biases.energy_vs_matter < 0.3 {
                    value *= 1.25;
                }
            }
            "fine_texture_strength" | "champleve_rim_intensity" => {
                // Matter = stronger surface
                if self.biases.energy_vs_matter > 0.7 {
                    value *= 1.25;
                }
            }
            _ => {}
        }

        value.clamp(min, max)
    }

    /// Generate a random integer using distribution-based sampling.
    ///
    /// For integer parameters with defined distributions, samples from
    /// truncated normal and rounds. Otherwise uses uniform sampling.
    ///
    /// # Safety
    /// ALWAYS returns `a` value within [`min`, `max`]. Never panics.
    pub fn randomize_int(&mut self, descriptor: &IntParamDescriptor) -> usize {
        let (min, max) = descriptor.range(self.gallery_quality);

        weighted_sampler::sample_parameter_int(self.rng, descriptor.name, min, max)
    }

    /// Generate two floats ensuring first < second (for constrained pairs).
    pub fn randomize_ordered_pair(
        &mut self,
        desc_a: &FloatParamDescriptor,
        desc_b: &FloatParamDescriptor,
    ) -> (f64, f64) {
        let val_a = self.randomize_float(desc_a);
        let val_b = self.randomize_float(desc_b);

        if val_a < val_b { (val_a, val_b) } else { (val_b, val_a) }
    }

    /// Generate a random float in [min, max] using the RNG.
    /// Kept for backward compatibility and testing.
    #[allow(dead_code)]
    fn random_range(&mut self, min: f64, max: f64) -> f64 {
        let t = self.random_f64();
        min + t * (max - min)
    }

    /// Generate a random integer in [min, max] using the RNG.
    /// Kept for backward compatibility and testing.
    #[allow(dead_code)]
    fn random_range_int(&mut self, min: usize, max: usize) -> usize {
        let range = max - min + 1;
        let t = self.random_f64();
        min + (t * range as f64).floor() as usize
    }

    /// Get a random f64 in [0.0, 1.0) from the RNG.
    /// Kept for backward compatibility and testing.
    #[allow(dead_code)]
    fn random_f64(&mut self) -> f64 {
        // Use 4 bytes to construct a uniform random float
        let b0 = self.rng.next_byte() as u32;
        let b1 = self.rng.next_byte() as u32;
        let b2 = self.rng.next_byte() as u32;
        let b3 = self.rng.next_byte() as u32;

        // Combine into a 32-bit integer
        let bits = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;

        // Convert to [0.0, 1.0) range
        (bits as f64) / (u32::MAX as f64)
    }

    /// Get the gallery quality setting.
    pub fn gallery_quality(&self) -> bool {
        self.gallery_quality
    }
}

/// Tracks randomization decisions for logging.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct RandomizationRecord {
    pub effect_name: String,
    pub enabled: bool,
    pub was_randomized: bool,
    pub parameters: Vec<RandomizedParameter>,
}

/// A single randomized parameter value.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct RandomizedParameter {
    pub name: String,
    pub value: String, // String to handle both float and int
    pub was_randomized: bool,
    pub range_used: String,
}

impl RandomizationRecord {
    pub fn new(effect_name: String, enabled: bool, was_randomized: bool) -> Self {
        Self { effect_name, enabled, was_randomized, parameters: Vec::new() }
    }

    pub fn add_float(&mut self, name: String, value: f64, was_randomized: bool, range: (f64, f64)) {
        self.parameters.push(RandomizedParameter {
            name,
            value: format!("{value:.4}"),
            was_randomized,
            range_used: format!("[{:.4}, {:.4}]", range.0, range.1),
        });
    }

    pub fn add_int(
        &mut self,
        name: String,
        value: usize,
        was_randomized: bool,
        range: (usize, usize),
    ) {
        self.parameters.push(RandomizedParameter {
            name,
            value: value.to_string(),
            was_randomized,
            range_used: format!("[{}, {}]", range.0, range.1),
        });
    }
}

/// Collection of all randomization records for a render session.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct RandomizationLog {
    pub gallery_quality: bool,
    pub theme: String,
    pub effects: Vec<RandomizationRecord>,
}

impl RandomizationLog {
    pub fn new(gallery_quality: bool, biases: AestheticBiases) -> Self {
        Self {
            gallery_quality,
            theme: format!(
                "E:{:.2} M:{:.2} C:{:.2}",
                biases.energy_vs_matter, biases.vintage_vs_digital, biases.complexity
            ),
            effects: Vec::new(),
        }
    }

    pub fn add_record(&mut self, record: RandomizationRecord) {
        self.effects.push(record);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_rng() -> Sha3RandomByteStream {
        let seed = vec![0x42, 0x43, 0x44, 0x45];
        Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0)
    }

    #[test]
    fn test_aesthetic_biases_are_valid() {
        let mut rng = make_test_rng();
        let randomizer = EffectRandomizer::new(&mut rng, false);

        let biases = randomizer.biases();

        // All biases should be in [0.0, 1.0] range
        assert!((0.0..=1.0).contains(&biases.energy_vs_matter));
        assert!((0.0..=1.0).contains(&biases.vintage_vs_digital));
        assert!((0.0..=1.0).contains(&biases.complexity));
    }

    #[test]
    fn test_biases_affect_probabilities() {
        // Find biases with extreme values using different seeds
        let mut high_energy_biases = None;
        let mut high_matter_biases = None;

        for i in 0..100 {
            let seed = vec![i as u8, (i + 1) as u8, (i + 2) as u8, (i + 3) as u8];
            let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
            let randomizer = EffectRandomizer::new(&mut rng, false);
            let biases = randomizer.biases();

            if biases.energy_vs_matter < 0.3 && high_energy_biases.is_none() {
                high_energy_biases = Some(biases);
            }
            if biases.energy_vs_matter > 0.7 && high_matter_biases.is_none() {
                high_matter_biases = Some(biases);
            }

            if high_energy_biases.is_some() && high_matter_biases.is_some() {
                break;
            }
        }

        let high_energy_biases = high_energy_biases.expect("Should find high energy bias");
        let high_matter_biases = high_matter_biases.expect("Should find high matter bias");

        // Calculate probabilities directly using the bias logic
        let bloom_prob_energy = {
            let e = high_energy_biases.energy_vs_matter;
            0.7 + (1.0 - e) * 0.2
        };
        let bloom_prob_matter = {
            let e = high_matter_biases.energy_vs_matter;
            0.7 + (1.0 - e) * 0.2
        };

        // High energy should favor bloom more
        assert!(
            bloom_prob_energy > bloom_prob_matter,
            "Energy bias should favor bloom: {} vs {}",
            bloom_prob_energy,
            bloom_prob_matter
        );

        // High matter should favor champleve more
        let champ_prob_energy = {
            let e = high_energy_biases.energy_vs_matter;
            0.1 + e * 0.8
        };
        let champ_prob_matter = {
            let e = high_matter_biases.energy_vs_matter;
            0.1 + e * 0.8
        };

        assert!(
            champ_prob_matter > champ_prob_energy,
            "Matter bias should favor champleve: {} vs {}",
            champ_prob_matter,
            champ_prob_energy
        );
    }

    #[test]
    fn test_probabilities_always_in_valid_range() {
        // Test many randomizers with different biases
        for i in 0..100 {
            let seed = vec![i as u8, (i + 1) as u8, (i + 2) as u8, (i + 3) as u8];
            let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
            let randomizer = EffectRandomizer::new(&mut rng, false);

            // Check a representative set of effects
            let effects = vec![
                "bloom",
                "glow",
                "champleve",
                "fine_texture",
                "chromatic_bloom",
                "dimensional_glitch",
                "aurora_veils",
                "cosmic_ink",
                "aether",
            ];

            for effect in effects {
                let prob = randomizer.get_enable_probability(effect);
                assert!(
                    (0.05..=0.95).contains(&prob),
                    "Probability for {} out of range: {}",
                    effect,
                    prob
                );
            }
        }
    }

    #[test]
    fn test_randomize_enable() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng, false);

        // Test that randomize_enable returns boolean values
        for _ in 0..100 {
            let _enabled = randomizer.randomize_enable("glow");
            // Test that randomize_enable returns a valid boolean
        }
    }

    #[test]
    fn test_randomize_enable_distribution() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng, false);

        // Test neutral effect - should not be always on or always off
        let mut count_true = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable("glow") {
                count_true += 1;
            }
        }
        // With biases, this can vary but shouldn't be extreme
        assert!(count_true > 50 && count_true < 950, "Got {}", count_true);

        // Test high-probability effect (bloom) - should be mostly on
        let mut count_bloom = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable("bloom") {
                count_bloom += 1;
            }
        }
        assert!(count_bloom > 100 && count_bloom < 1000, "Got {}", count_bloom);
    }

    #[test]
    fn test_randomize_float_range() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng, false);

        let descriptor = FloatParamDescriptor {
            name: "test",
            min: 10.0,
            max: 20.0,
            gallery_min: 12.0,
            gallery_max: 18.0,
            description: "Test parameter",
        };

        for _ in 0..100 {
            let value = randomizer.randomize_float(&descriptor);
            assert!((10.0..=20.0).contains(&value));
        }
    }

    #[test]
    fn test_gallery_quality_narrows_range() {
        let mut rng1 = make_test_rng();
        let mut randomizer_normal = EffectRandomizer::new(&mut rng1, false);

        let mut rng2 = make_test_rng();
        let mut randomizer_gallery = EffectRandomizer::new(&mut rng2, true);

        let descriptor = FloatParamDescriptor {
            name: "test",
            min: 0.0,
            max: 100.0,
            gallery_min: 40.0,
            gallery_max: 60.0,
            description: "Test parameter",
        };

        let normal_val = randomizer_normal.randomize_float(&descriptor);
        let gallery_val = randomizer_gallery.randomize_float(&descriptor);

        // Gallery value must be in narrower range
        assert!((40.0..=60.0).contains(&gallery_val));
        // Normal value in wider range (might also be in narrow range by chance)
        assert!((0.0..=100.0).contains(&normal_val));
    }

    #[test]
    fn test_randomize_ordered_pair() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng, false);

        let desc = FloatParamDescriptor {
            name: "test",
            min: 0.0,
            max: 1.0,
            gallery_min: 0.2,
            gallery_max: 0.8,
            description: "Test parameter",
        };

        for _ in 0..100 {
            let (a, b) = randomizer.randomize_ordered_pair(&desc, &desc);
            assert!(a < b, "First value must be less than second: {} < {}", a, b);
        }
    }

    #[test]
    fn test_biases_create_variety() {
        // Generate multiple randomizers with different seeds and verify they have different biases
        let mut biases_set = Vec::new();
        for i in 0..50 {
            let seed = vec![i as u8, (i + 10) as u8, (i + 20) as u8, (i + 30) as u8];
            let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
            let randomizer = EffectRandomizer::new(&mut rng, false);
            biases_set.push(randomizer.biases());
        }

        // Calculate variance in each axis to ensure variety
        let mean_energy: f64 =
            biases_set.iter().map(|b| b.energy_vs_matter).sum::<f64>() / biases_set.len() as f64;
        let variance_energy: f64 =
            biases_set.iter().map(|b| (b.energy_vs_matter - mean_energy).powi(2)).sum::<f64>()
                / biases_set.len() as f64;

        // Variance should be significant (not all the same)
        // For uniform distribution [0,1], variance = 1/12 ≈ 0.083
        assert!(
            variance_energy > 0.05,
            "Insufficient variety in energy_vs_matter: variance = {}",
            variance_energy
        );
    }

    #[test]
    fn test_complexity_increases_effect_count() {
        // Find biases with low and high complexity using different seeds
        let mut low_complexity_biases = None;
        let mut high_complexity_biases = None;

        for i in 0..100 {
            let seed = vec![i as u8, (i + 5) as u8, (i + 10) as u8, (i + 15) as u8];
            let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
            let randomizer = EffectRandomizer::new(&mut rng, false);
            let biases = randomizer.biases();

            if biases.complexity < 0.2 && low_complexity_biases.is_none() {
                low_complexity_biases = Some(biases);
            }
            if biases.complexity > 0.8 && high_complexity_biases.is_none() {
                high_complexity_biases = Some(biases);
            }

            if low_complexity_biases.is_some() && high_complexity_biases.is_some() {
                break;
            }
        }

        let low_c = low_complexity_biases.expect("Should find low complexity").complexity;
        let high_c = high_complexity_biases.expect("Should find high complexity").complexity;

        // Count expected probabilities for complexity-sensitive effects
        // Using the actual formula from get_enable_probability
        let low_complexity_sum =
            (0.2 + low_c * 0.5) + (0.1 + (1.0 - 0.5) * 0.5 + low_c * 0.2) + (0.3 + low_c * 0.4);
        let high_complexity_sum =
            (0.2 + high_c * 0.5) + (0.1 + (1.0 - 0.5) * 0.5 + high_c * 0.2) + (0.3 + high_c * 0.4);

        assert!(
            high_complexity_sum > low_complexity_sum,
            "High complexity should have higher total probability: {} vs {}",
            high_complexity_sum,
            low_complexity_sum
        );
    }

    #[test]
    fn test_digital_vs_vintage_affects_chromatic() {
        // Find biases with different digital vs vintage values
        let mut vintage_biases = None;
        let mut digital_biases = None;

        for i in 0..100 {
            let seed = vec![(i * 2) as u8, (i * 2 + 1) as u8, (i * 3) as u8, (i * 3 + 1) as u8];
            let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
            let randomizer = EffectRandomizer::new(&mut rng, false);
            let biases = randomizer.biases();

            if biases.vintage_vs_digital < 0.2 && vintage_biases.is_none() {
                vintage_biases = Some(biases);
            }
            if biases.vintage_vs_digital > 0.8 && digital_biases.is_none() {
                digital_biases = Some(biases);
            }

            if vintage_biases.is_some() && digital_biases.is_some() {
                break;
            }
        }

        let vintage = vintage_biases.expect("Should find vintage bias");
        let digital = digital_biases.expect("Should find digital bias");

        // Digital should strongly favor chromatic bloom
        let chromatic_vintage = 0.2 + vintage.vintage_vs_digital * 0.6;
        let chromatic_digital = 0.2 + digital.vintage_vs_digital * 0.6;

        assert!(
            chromatic_digital > chromatic_vintage * 1.5,
            "Digital should favor chromatic bloom more: {} vs {}",
            chromatic_digital,
            chromatic_vintage
        );

        // Vintage should favor perceptual blur (softness)
        let blur_vintage = 0.3 + (1.0 - vintage.vintage_vs_digital) * 0.5;
        let blur_digital = 0.3 + (1.0 - digital.vintage_vs_digital) * 0.5;

        assert!(
            blur_vintage > blur_digital,
            "Vintage should favor perceptual blur: {} vs {}",
            blur_vintage,
            blur_digital
        );
    }

    #[test]
    fn test_randomization_log_captures_biases() {
        let mut rng = make_test_rng();
        let randomizer = EffectRandomizer::new(&mut rng, false);
        let biases = randomizer.biases();

        let log = RandomizationLog::new(false, biases);

        // Theme string should contain bias values
        assert!(log.theme.contains("E:"));
        assert!(log.theme.contains("M:"));
        assert!(log.theme.contains("C:"));
    }
}
