//! Effect randomization system for museum-quality parameter generation.
//!
//! This module provides type-safe randomization of effect parameters within
//! curated ranges, ensuring every output meets exhibition standards.

use super::parameter_descriptors::{FloatParamDescriptor, IntParamDescriptor};
use crate::sim::Sha3RandomByteStream;

/// Randomizer for effect parameters using the deterministic RNG.
pub struct EffectRandomizer<'a> {
    rng: &'a mut Sha3RandomByteStream,
}

impl<'a> EffectRandomizer<'a> {
    pub fn new(rng: &'a mut Sha3RandomByteStream) -> Self {
        Self { rng }
    }

    /// Randomly decide whether an effect should be enabled.
    ///
    /// `probability` is the chance of enabling (0.0 = never, 1.0 = always).
    /// Derived from empirical analysis of visually pleasing outputs.
    pub fn randomize_enable(&mut self, probability: f64) -> bool {
        debug_assert!(
            (0.0..=1.0).contains(&probability),
            "enable probability must be in [0.0, 1.0], got {}",
            probability,
        );
        self.random_f64() < probability
    }

    /// Generate a random float within the descriptor's range.
    pub fn randomize_float(&mut self, descriptor: &FloatParamDescriptor) -> f64 {
        self.random_range(descriptor.min, descriptor.max)
    }

    /// Generate a random integer within the descriptor's range.
    pub fn randomize_int(&mut self, descriptor: &IntParamDescriptor) -> usize {
        self.random_range_int(descriptor.min, descriptor.max)
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
        let b0 = self.rng.next_byte() as u32;
        let b1 = self.rng.next_byte() as u32;
        let b2 = self.rng.next_byte() as u32;
        let b3 = self.rng.next_byte() as u32;
        let bits = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
        (bits as f64) / (u32::MAX as f64)
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
    pub value: String,
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
    pub effects: Vec<RandomizationRecord>,
}

impl RandomizationLog {
    pub fn new() -> Self {
        Self { effects: Vec::new() }
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
    fn test_randomize_enable_half() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng);
        
        let mut count_true = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable(0.5) {
                count_true += 1;
            }
        }
        
        assert!(count_true > 400 && count_true < 600,
            "50% probability produced {} / 1000", count_true);
    }

    #[test]
    fn test_randomize_enable_high_probability() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng);
        
        let mut count_true = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable(0.80) {
                count_true += 1;
            }
        }
        
        assert!(count_true > 700 && count_true < 900,
            "80% probability produced {} / 1000", count_true);
    }

    #[test]
    fn test_randomize_enable_low_probability() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng);
        
        let mut count_true = 0;
        for _ in 0..1000 {
            if randomizer.randomize_enable(0.20) {
                count_true += 1;
            }
        }
        
        assert!(count_true > 100 && count_true < 300,
            "20% probability produced {} / 1000", count_true);
    }

    #[test]
    fn test_randomize_enable_extremes() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng);

        for _ in 0..100 {
            assert!(!randomizer.randomize_enable(0.0), "0% should never enable");
        }

        for _ in 0..100 {
            assert!(randomizer.randomize_enable(1.0), "100% should always enable");
        }
    }

    #[test]
    fn test_randomize_float_range() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng);
        
        let descriptor = FloatParamDescriptor {
            name: "test",
            min: 10.0,
            max: 20.0,
            description: "Test parameter",
        };
        
        for _ in 0..100 {
            let value = randomizer.randomize_float(&descriptor);
            assert!((10.0..=20.0).contains(&value));
        }
    }

    #[test]
    fn test_randomize_ordered_pair() {
        let mut rng = make_test_rng();
        let mut randomizer = EffectRandomizer::new(&mut rng);
        
        let desc = FloatParamDescriptor {
            name: "test",
            min: 0.0,
            max: 1.0,
            description: "Test parameter",
        };
        
        for _ in 0..100 {
            let (a, b) = randomizer.randomize_ordered_pair(&desc, &desc);
            assert!(a < b, "First value must be less than second: {} < {}", a, b);
        }
    }
}
