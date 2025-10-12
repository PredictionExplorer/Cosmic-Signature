//! Effect randomization system for exploratory parameter generation.
//!
//! This module provides type-safe randomization of effect parameters within
//! carefully tuned ranges, enabling exploration of the visual parameter space
//! while maintaining aesthetic coherence.

use super::parameter_descriptors::{FloatParamDescriptor, IntParamDescriptor};
use crate::sim::Sha3RandomByteStream;

/// Randomizer for effect parameters using the deterministic RNG.
pub struct EffectRandomizer<'a> {
    rng: &'a mut Sha3RandomByteStream,
    gallery_quality: bool,
}

impl<'a> EffectRandomizer<'a> {
    /// Create a new effect randomizer.
    pub fn new(rng: &'a mut Sha3RandomByteStream, gallery_quality: bool) -> Self {
        Self { rng, gallery_quality }
    }

    /// Randomly decide whether an effect should be enabled (50% probability).
    pub fn randomize_enable(&mut self) -> bool {
        self.random_f64() < 0.5
    }

    /// Generate a random float within the descriptor's range.
    pub fn randomize_float(&mut self, descriptor: &FloatParamDescriptor) -> f64 {
        let (min, max) = descriptor.range(self.gallery_quality);
        self.random_range(min, max)
    }

    /// Generate a random integer within the descriptor's range.
    pub fn randomize_int(&mut self, descriptor: &IntParamDescriptor) -> usize {
        let (min, max) = descriptor.range(self.gallery_quality);
        self.random_range_int(min, max)
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
    fn random_range(&mut self, min: f64, max: f64) -> f64 {
        let t = self.random_f64();
        min + t * (max - min)
    }

    /// Generate a random integer in [min, max] using the RNG.
    fn random_range_int(&mut self, min: usize, max: usize) -> usize {
        let range = max - min + 1;
        let t = self.random_f64();
        min + (t * range as f64).floor() as usize
    }

    /// Get a random f64 in [0.0, 1.0) from the RNG.
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
            value: format!("{:.4}", value),
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
        
        // Generate many samples and check they're roughly 50/50
        let mut count_true = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable() {
                count_true += 1;
            }
        }
        
        // Should be roughly 500 ± 100
        assert!(count_true > 400 && count_true < 600);
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

