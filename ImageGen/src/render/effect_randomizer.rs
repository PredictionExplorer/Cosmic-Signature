//! Effect randomization system using statistical distributions.
//!
//! This module provides type-safe randomization of effect parameters using
//! distributions (typically truncated normal) rather than uniform sampling.
//!
//! All parameters are sampled from distributions with specific means and
//! standard deviations, providing better aesthetic results while still
//! allowing exploration of the parameter space.

use super::parameter_descriptors::{FloatParamDescriptor, IntParamDescriptor};
use crate::sim::Sha3RandomByteStream;
use crate::weighted_sampler;

/// Randomizer for effect parameters using statistical distributions.
///
/// Parameters are sampled from truncated normal distributions centered
/// around aesthetically pleasing values, with controllable spread.
pub struct EffectRandomizer<'a> {
    rng: &'a mut Sha3RandomByteStream,
    gallery_quality: bool,
}

impl<'a> EffectRandomizer<'a> {
    /// Create a new effect randomizer.
    ///
    /// # Arguments
    /// * `rng` - Random number generator
    /// * `gallery_quality` - Use narrower parameter ranges
    pub fn new(
        rng: &'a mut Sha3RandomByteStream,
        gallery_quality: bool,
    ) -> Self {
        Self {
            rng,
            gallery_quality,
        }
    }

    /// Randomly decide whether an effect should be enabled with per-effect probabilities.
    ///
    /// Probabilities are based on analysis of Amazing vs Boring images:
    /// - Effects that were OFF in amazing images get lower enable probability
    /// - Effects that were ON in amazing images get higher enable probability
    /// 
    /// This maintains variety while biasing toward aesthetically superior results.
    pub fn randomize_enable(&mut self, effect_name: &str) -> bool {
        let probability = self.get_enable_probability(effect_name);
        self.rng.next_f64() < probability
    }
    
    /// Get the enable probability for a specific effect based on empirical analysis.
    ///
    /// Analysis results (Amazing vs Boring enable rates):
    /// - opalescence: 0% vs 81% → 15% probability (mostly off)
    /// - aether: 0% vs 62% → 15% probability (mostly off)
    /// - atmospheric_depth: 14% vs 67% → 25% probability (mostly off)
    /// - gradient_map: 14% vs 52% → 25% probability (mostly off)
    /// - fine_texture: 29% vs 57% → 35% probability (somewhat less)
    /// - chromatic_bloom: 43% vs 62% → 45% probability (balanced, slightly less)
    /// - perceptual_blur: 43% vs 57% → 45% probability (balanced)
    /// - champleve: 86% vs 48% → 75% probability (mostly on)
    /// - bloom: 71% vs 43% → 70% probability (mostly on)
    /// - micro_contrast: 57% vs 38% → 60% probability (more on)
    /// - glow: No significant difference → 50% (neutral)
    /// - color_grade: 43% vs 52% → 50% (neutral)
    /// - edge_luminance: 29% vs 57% → 45% (balanced)
    fn get_enable_probability(&self, effect_name: &str) -> f64 {
        match effect_name {
            // Mostly disabled in Amazing images (15%)
            "opalescence" => 0.15,
            "aether" => 0.15,
            "refractive_caustics" => 0.15,
            
            // Frequently disabled in Amazing images (25%)
            "atmospheric_depth" => 0.25,
            "gradient_map" => 0.25,
            "volumetric_occlusion" => 0.25,
            
            // Somewhat less in Amazing images (35%)
            "fine_texture" => 0.35,
            "crepuscular_rays" => 0.30,
            
            // Balanced but slightly favoring off (45%)
            "chromatic_bloom" => 0.45,
            "perceptual_blur" => 0.45,
            "edge_luminance" => 0.45,
            
            // Neutral (50%)
            "glow" => 0.50,
            "color_grade" => 0.50,
            
            // More often enabled in Amazing images (60%+)
            "micro_contrast" => 0.60,
            "bloom" => 0.70,
            "champleve" => 0.75,
            
            // Unknown effects default to neutral
            _ => 0.50,
        }
    }

    /// Generate a random float using distribution-based sampling.
    ///
    /// Samples from a truncated normal distribution centered around
    /// aesthetically pleasing values, providing better results than
    /// uniform sampling while maintaining variety.
    ///
    /// # Safety
    /// ALWAYS returns `a` value within [`min`, `max`]. Multiple fallback strategies
    /// ensure this function never panics and never returns invalid values.
    pub fn randomize_float(&mut self, descriptor: &FloatParamDescriptor) -> f64 {
        let (min, max) = descriptor.range(self.gallery_quality);
        
        weighted_sampler::sample_parameter(
            self.rng,
            descriptor.name,
            min,
            max,
        )
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
        
        weighted_sampler::sample_parameter_int(
            self.rng,
            descriptor.name,
            min,
            max,
        )
    }

    /// Generate two floats ensuring first < second (for constrained pairs).
    pub fn randomize_ordered_pair(
        &mut self,
        desc_a: &FloatParamDescriptor,
        desc_b: &FloatParamDescriptor,
    ) -> (f64, f64) {
        let val_a = self.randomize_float(desc_a);
        let val_b = self.randomize_float(desc_b);
        
        if val_a < val_b {
            (val_a, val_b)
        } else {
            (val_b, val_a)
        }
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
        Self {
            effect_name,
            enabled,
            was_randomized,
            parameters: Vec::new(),
        }
    }

    pub fn add_float(&mut self, name: String, value: f64, was_randomized: bool, range: (f64, f64)) {
        self.parameters.push(RandomizedParameter {
            name,
            value: format!("{value:.4}"),
            was_randomized,
            range_used: format!("[{:.4}, {:.4}]", range.0, range.1),
        });
    }

    pub fn add_int(&mut self, name: String, value: usize, was_randomized: bool, range: (usize, usize)) {
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
    pub effects: Vec<RandomizationRecord>,
}

impl RandomizationLog {
    pub fn new(gallery_quality: bool) -> Self {
        Self {
            gallery_quality,
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
    fn test_randomize_enable() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng, false);
        
        // Test neutral effect (50% probability)
        let mut count_true = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable("glow") {
                count_true += 1;
            }
        }
        // Should be roughly 500 ± 100 for 50% probability effect
        assert!(count_true > 400 && count_true < 600, "Got {}", count_true);
        
        // Test high-probability effect (bloom at 70%)
        let mut count_bloom = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable("bloom") {
                count_bloom += 1;
            }
        }
        // Should be roughly 700 ± 100 for 70% probability effect
        assert!(count_bloom > 600 && count_bloom < 800, "Got {}", count_bloom);
        
        // Test low-probability effect (opalescence at 15%)
        let mut count_opal = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable("opalescence") {
                count_opal += 1;
            }
        }
        // Should be roughly 150 ± 75 for 15% probability effect
        assert!(count_opal > 75 && count_opal < 225, "Got {}", count_opal);
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
}
