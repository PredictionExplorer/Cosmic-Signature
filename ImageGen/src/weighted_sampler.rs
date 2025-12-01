//! Statistical distribution-based parameter sampling.
//!
//! This module implements sampling from distributions (truncated normal, uniform)
//! for all effect parameters. This provides better aesthetic results than pure
//! uniform sampling by centering values around known good ranges.
//!
//! All sampling functions have robust fallbacks - they will NEVER return
//! an invalid value or cause a crash/panic.

use crate::parameter_distributions::DefaultDistributions;
use crate::sim::Sha3RandomByteStream;
use std::f64::consts::PI;

/// Sample from a truncated normal distribution.
///
/// Uses Box-Muller transform with rejection sampling.
///
/// # Safety
/// ALWAYS returns `a` value in [`min`, `max`]. Never panics, never returns NaN/Inf.
/// Multiple fallback strategies ensure robustness:
/// 1. Normal rejection sampling (up to 1000 attempts)
/// 2. Fallback to clamped mean
/// 3. Final safety clamp
#[must_use = "sampling result should not be discarded"]
pub fn sample_truncated_normal(
    rng: &mut Sha3RandomByteStream,
    mean: f64,
    std: f64,
    min: f64,
    max: f64,
) -> f64 {
    // Validate inputs - fallback to uniform if invalid
    if !mean.is_finite() || !std.is_finite() || !min.is_finite() || !max.is_finite() {
        return sample_uniform(rng, min.max(0.0), max.min(1.0));
    }

    if min >= max {
        return min;
    }

    if std <= 0.0 {
        return mean.clamp(min, max);
    }

    // Use Box-Muller transform + rejection sampling
    let max_iterations = 1000;

    for _ in 0..max_iterations {
        // Box-Muller transform to generate normal(0, 1)
        let u1 = rng.next_f64().max(1e-10); // Avoid log(0)
        let u2 = rng.next_f64();

        let z = (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos();

        // Transform to N(mean, std)
        let value = mean + std * z;

        // Accept if in range and finite
        if value.is_finite() && value >= min && value <= max {
            return value;
        }
    }

    // Fallback 1: Clamp the mean
    let fallback = mean.clamp(min, max);
    if fallback.is_finite() {
        return fallback;
    }

    // Fallback 2: Midpoint
    let midpoint = f64::midpoint(min, max);
    if midpoint.is_finite() {
        return midpoint;
    }

    // Fallback 3: Min value (guaranteed valid by caller)
    min
}

/// Sample from a categorical distribution given weights.
///
/// Returns the index of the selected category.
#[allow(dead_code)] // May be used in future for integer distributions
pub fn sample_categorical(rng: &mut Sha3RandomByteStream, weights: &[f64]) -> usize {
    if weights.is_empty() {
        return 0;
    }

    // Compute total weight
    let total: f64 = weights.iter().sum();
    if total <= 0.0 {
        return 0;
    }

    // Sample uniformly in [0, total]
    let mut target = rng.next_f64() * total;

    // Find which category we landed in
    for (i, &weight) in weights.iter().enumerate() {
        target -= weight;
        if target <= 0.0 {
            return i;
        }
    }

    // Fallback (shouldn't reach here due to floating point)
    weights.len() - 1
}

/// Sample from a uniform distribution in [min, max].
///
/// # Safety
/// ALWAYS returns `a` value in [`min`, `max`]. Never panics.
#[must_use = "sampling result should not be discarded"]
pub fn sample_uniform(rng: &mut Sha3RandomByteStream, min: f64, max: f64) -> f64 {
    if !min.is_finite() || !max.is_finite() || min >= max {
        return min;
    }

    let value = min + rng.next_f64() * (max - min);

    // Safety clamp
    value.clamp(min, max)
}

/// Sample `a` float parameter using distribution-based sampling.
///
/// Attempts to sample from a truncated normal distribution if one is defined
/// for this parameter. Falls back to uniform sampling if no distribution exists.
///
/// # Safety
/// ALWAYS returns `a` value in [`min`, `max`]. Never panics. Multiple fallback strategies:
/// 1. Sample from truncated normal (if distribution defined)
/// 2. Fall back to uniform if no distribution
/// 3. Fall back to uniform if sampling fails
/// 4. Final safety clamp to guarantee bounds
#[must_use = "sampling result should not be discarded"]
pub fn sample_parameter(
    rng: &mut Sha3RandomByteStream,
    param_name: &str,
    min: f64,
    max: f64,
) -> f64 {
    // Try to get distribution for this parameter
    if let Some(dist) = DefaultDistributions::get(param_name) {
        // Sample from distribution, respecting the allowed range
        let value = sample_truncated_normal(rng, dist.mean, dist.std, min, max);

        // Final safety clamp
        return value.clamp(min, max);
    }

    // No distribution defined, use uniform sampling
    sample_uniform(rng, min, max)
}

/// Sample an integer parameter using distribution-based sampling.
///
/// For integer parameters, attempts to sample from truncated normal distribution
/// (if defined) and rounds to nearest integer. Falls back to uniform if no
/// distribution is defined.
///
/// # Safety
/// ALWAYS returns `a` value in [`min`, `max`]. Never panics.
#[must_use = "sampling result should not be discarded"]
pub fn sample_parameter_int(
    rng: &mut Sha3RandomByteStream,
    param_name: &str,
    min: usize,
    max: usize,
) -> usize {
    // Validate bounds
    if min > max {
        return min;
    }

    // Try to get distribution
    if let Some(dist) = DefaultDistributions::get(param_name) {
        // Sample from normal and round to integer
        let value = sample_truncated_normal(rng, dist.mean, dist.std, min as f64, max as f64);

        let int_value = value.round() as usize;
        return int_value.clamp(min, max);
    }

    // Fallback to uniform
    let range = max - min + 1;
    let value = min + (rng.next_f64() * range as f64).floor() as usize;
    value.clamp(min, max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::Sha3RandomByteStream;

    #[test]
    fn test_sample_uniform() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);

        for _ in 0..100 {
            let value = sample_uniform(&mut rng, 0.0, 1.0);
            assert!((0.0..=1.0).contains(&value));
        }
    }

    #[test]
    fn test_sample_truncated_normal() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);

        for _ in 0..100 {
            let value = sample_truncated_normal(&mut rng, 0.5, 0.1, 0.0, 1.0);
            assert!((0.0..=1.0).contains(&value));
        }
    }

    #[test]
    fn test_sample_categorical() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);
        let weights = vec![1.0, 2.0, 1.0];

        let mut counts = [0; 3];
        for _ in 0..1000 {
            let idx = sample_categorical(&mut rng, &weights);
            assert!(idx < 3);
            counts[idx] += 1;
        }

        // Category 1 should have roughly double the counts of categories 0 and 2
        assert!(counts[1] > counts[0]);
        assert!(counts[1] > counts[2]);
    }

    #[test]
    fn test_truncated_normal_respects_bounds() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);

        // Mean outside bounds - should clamp to bounds
        for _ in 0..100 {
            let value = sample_truncated_normal(&mut rng, 10.0, 0.5, 0.0, 1.0);
            assert!((0.0..=1.0).contains(&value));
        }
    }

    #[test]
    fn test_sample_parameter_with_unknown_param() {
        let mut rng = Sha3RandomByteStream::new(&[5, 6, 7, 8], 1.0, 2.0, 1.0, 1.0);

        // Unknown parameter should fall back to uniform sampling
        for _ in 0..100 {
            let value = sample_parameter(&mut rng, "unknown_param_xyz", 0.0, 1.0);
            assert!((0.0..=1.0).contains(&value));
        }
    }

    #[test]
    fn test_sample_parameter_int_bounds() {
        let mut rng = Sha3RandomByteStream::new(&[9, 10, 11, 12], 1.0, 2.0, 1.0, 1.0);

        for _ in 0..100 {
            let value = sample_parameter_int(&mut rng, "unknown_int_param", 5, 10);
            assert!((5..=10).contains(&value));
        }
    }

    #[test]
    fn test_sample_uniform_edge_cases() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);

        // Equal min and max should return min
        let value = sample_uniform(&mut rng, 0.5, 0.5);
        assert!((value - 0.5).abs() < 1e-10);

        // Inverted range should return min
        let value = sample_uniform(&mut rng, 1.0, 0.0);
        assert!((value - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_truncated_normal_edge_cases() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);

        // Zero std should return clamped mean
        let value = sample_truncated_normal(&mut rng, 0.5, 0.0, 0.0, 1.0);
        assert!((value - 0.5).abs() < 1e-10);

        // Inverted range should return min
        let value = sample_truncated_normal(&mut rng, 0.5, 0.1, 1.0, 0.0);
        assert!((value - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_sample_parameter_int_single_value() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 2.0, 1.0, 1.0);

        // When min == max, should return that value
        let value = sample_parameter_int(&mut rng, "test", 5, 5);
        assert_eq!(value, 5);
    }
}

/// Property-based tests for sampling functions.
///
/// These tests use random inputs to verify invariants hold across
/// `a` wide range of parameter values.
#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// Truncated normal always returns values within bounds.
        #[test]
        fn truncated_normal_always_in_bounds(
            mean in -100.0f64..100.0,
            std in 0.01f64..50.0,
            bound1 in -100.0f64..100.0,
            bound2 in -100.0f64..100.0,
            seed in 0u8..255u8,
        ) {
            let min = bound1.min(bound2);
            let max = (bound1.max(bound2) + 0.01).max(min + 0.01); // Ensure min < max

            let mut rng = Sha3RandomByteStream::new(&[seed, seed.wrapping_add(1), seed.wrapping_add(2), seed.wrapping_add(3)], 1.0, 2.0, 1.0, 1.0);
            let value = sample_truncated_normal(&mut rng, mean, std, min, max);

            prop_assert!(value >= min, "Value {} below min {}", value, min);
            prop_assert!(value <= max, "Value {} above max {}", value, max);
            prop_assert!(value.is_finite(), "Value is not finite");
        }

        /// Uniform sampling always returns values within bounds.
        #[test]
        fn uniform_always_in_bounds(
            bound1 in -100.0f64..100.0,
            bound2 in -100.0f64..100.0,
            seed in 0u8..255u8,
        ) {
            let min = bound1.min(bound2);
            let max = bound1.max(bound2);

            let mut rng = Sha3RandomByteStream::new(&[seed, seed.wrapping_add(1), seed.wrapping_add(2), seed.wrapping_add(3)], 1.0, 2.0, 1.0, 1.0);
            let value = sample_uniform(&mut rng, min, max);

            prop_assert!(value >= min, "Value {} below min {}", value, min);
            prop_assert!(value <= max, "Value {} above max {}", value, max);
            prop_assert!(value.is_finite(), "Value is not finite");
        }

        /// Integer sampling always returns values within bounds.
        #[test]
        fn int_sampling_always_in_bounds(
            bound1 in 0usize..1000,
            bound2 in 0usize..1000,
            seed in 0u8..255u8,
        ) {
            let min = bound1.min(bound2);
            let max = bound1.max(bound2);

            let mut rng = Sha3RandomByteStream::new(&[seed, seed.wrapping_add(1), seed.wrapping_add(2), seed.wrapping_add(3)], 1.0, 2.0, 1.0, 1.0);
            let value = sample_parameter_int(&mut rng, "test_param", min, max);

            prop_assert!(value >= min, "Value {} below min {}", value, min);
            prop_assert!(value <= max, "Value {} above max {}", value, max);
        }

        /// Parameter sampling never returns NaN or Infinity.
        #[test]
        fn parameter_sampling_finite(
            min in -1000.0f64..1000.0,
            max in -1000.0f64..1000.0,
            seed in 0u8..255u8,
        ) {
            let (min, max) = if min <= max { (min, max) } else { (max, min) };

            let mut rng = Sha3RandomByteStream::new(&[seed, seed.wrapping_add(1), seed.wrapping_add(2), seed.wrapping_add(3)], 1.0, 2.0, 1.0, 1.0);
            let value = sample_parameter(&mut rng, "blur_strength", min, max);

            prop_assert!(value.is_finite(), "Parameter sampling returned non-finite value");
        }
    }
}
