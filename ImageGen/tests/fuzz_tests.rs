//! Comprehensive fuzz tests for critical system components
//!
//! This module contains property-based fuzz tests that verify robustness
//! against hostile inputs, extreme values, and edge cases. These tests are
//! critical for production quality and security.

use proptest::prelude::*;
use three_body_problem::*;

// ============================================================================
// Spectral Power Distribution Fuzz Tests
// ============================================================================

proptest! {
    /// Fuzz test: SPD to RGBA conversion handles extreme values
    ///
    /// Critical for HDR rendering where SPD values can be arbitrarily large.
    #[test]
    fn prop_spd_to_rgba_extreme_values(
        values in prop::collection::vec(-1e100f64..1e100, spectrum::NUM_BINS..=spectrum::NUM_BINS),
    ) {
        // Skip non-finite inputs
        if values.iter().any(|v| !v.is_finite()) {
            return Ok(());
        }

        let mut spd = [0.0; spectrum::NUM_BINS];
        for (i, &val) in values.iter().enumerate() {
            spd[i] = val;
        }

        let (_r, _g, _b, _a) = spectrum::spd_to_rgba(&spd);

        // If we got here without crashing, test passes
        prop_assert!(true);
    }

    /// Fuzz test: SPD with NaN/Inf values doesn't crash
    #[test]
    fn prop_spd_nan_inf_handling(bin_idx in 0usize..spectrum::NUM_BINS) {
        let test_values = [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1e308, -1e308];

        for &special_value in &test_values {
            let mut spd = [0.0; spectrum::NUM_BINS];
            spd[bin_idx] = special_value;

            // Should not panic
            let (_r, _g, _b, _a) = spectrum::spd_to_rgba(&spd);

            // NaN propagation is acceptable, but crash is not
            prop_assert!(true); // Made it here without crash
        }
    }
}

// ============================================================================
// Weighted Sampler Fuzz Tests
// ============================================================================

proptest! {
    /// Fuzz test: Truncated normal sampling always returns valid values
    ///
    /// Critical: sampling controls all effect parameters in the rendering pipeline.
    #[test]
    fn prop_truncated_normal_always_valid(
        mean in -1e10f64..1e10,
        std in 0.0f64..1e10,
        min in -1e10f64..1e10,
        max in -1e10f64..1e10,
        seed_val in any::<u64>(),
    ) {
        // Skip invalid ranges
        if !mean.is_finite() || !std.is_finite() || !min.is_finite() || !max.is_finite() {
            return Ok(());
        }
        if min >= max {
            return Ok(());
        }

        let seed = seed_val.to_le_bytes();
        let mut rng = sim::Sha3RandomByteStream::new(&seed, 100.0, 300.0, 25.0, 10.0);

        // Sample multiple times
        for _ in 0..10 {
            let value = weighted_sampler::sample_truncated_normal(&mut rng, mean, std, min, max);

            // Must be finite
            prop_assert!(value.is_finite(), "Sampled value not finite");

            // Must be in range
            prop_assert!(value >= min && value <= max,
                        "Sampled value {} not in range [{}, {}]", value, min, max);
        }
    }

    /// Fuzz test: Uniform sampling respects bounds
    #[test]
    fn prop_uniform_respects_bounds(
        min in -1e10f64..1e10,
        max in -1e10f64..1e10,
        seed_val in any::<u64>(),
    ) {
        if !min.is_finite() || !max.is_finite() || min >= max {
            return Ok(());
        }

        let seed = seed_val.to_le_bytes();
        let mut rng = sim::Sha3RandomByteStream::new(&seed, 100.0, 300.0, 25.0, 10.0);

        for _ in 0..100 {
            let value = weighted_sampler::sample_uniform(&mut rng, min, max);

            prop_assert!(value.is_finite());
            prop_assert!(value >= min && value <= max,
                        "Uniform sample {} not in range [{}, {}]", value, min, max);
        }
    }

    /// Fuzz test: Sampling with extreme standard deviation doesn't hang
    #[test]
    fn prop_sampling_terminates_with_extreme_std(
        std in 0.0f64..1e100,
        seed_val in any::<u64>(),
    ) {
        let seed = seed_val.to_le_bytes();
        let mut rng = sim::Sha3RandomByteStream::new(&seed, 100.0, 300.0, 25.0, 10.0);

        // This should complete in bounded time
        let value = weighted_sampler::sample_truncated_normal(&mut rng, 0.5, std, 0.0, 1.0);

            prop_assert!((0.0..=1.0).contains(&value));
    }

    /// Fuzz test: Categorical sampling with varying weight distributions
    #[test]
    fn prop_categorical_sampling_various_weights(
        num_weights in 1usize..100,
        seed_val in any::<u64>(),
    ) {
        let seed = seed_val.to_le_bytes();
        let mut rng = sim::Sha3RandomByteStream::new(&seed, 100.0, 300.0, 25.0, 10.0);

        // Create weights (all positive)
        let weights: Vec<f64> = (0..num_weights).map(|i| (i + 1) as f64).collect();

        for _ in 0..10 {
            let value = weighted_sampler::sample_categorical(&mut rng, &weights);

            prop_assert!(value < weights.len(),
                        "Categorical sample {} exceeds weights length {}", value, weights.len());
        }
    }
}

// Note: Gaussian kernel tests removed as the function is not publicly exposed.
// These tests exist in the utils module's internal tests.

// ============================================================================
// Drift Transformation Fuzz Tests
// ============================================================================

proptest! {
    /// Fuzz test: Drift parameters handle extreme values
    ///
    /// Verifies that DriftParameters::new() clamps values to valid ranges.
    #[test]
    fn prop_drift_parameters_extreme_values(
        scale in -100.0f64..100.0,
        arc_fraction in -2.0f64..2.0,
        eccentricity in -2.0f64..2.0,
    ) {
        if !scale.is_finite() || !arc_fraction.is_finite() || !eccentricity.is_finite() {
            return Ok(());
        }

        // Creating drift parameters should not panic
        let params = drift::DriftParameters::new(scale, arc_fraction, eccentricity);

        // Verify parameters are clamped to valid ranges
        prop_assert!(params.scale >= 0.0, "Scale should be clamped to non-negative");
        prop_assert!(params.arc_fraction >= 0.0 && params.arc_fraction <= 1.0,
                    "Arc fraction should be in [0, 1]");
        prop_assert!(params.eccentricity >= 0.0 && params.eccentricity <= 0.95,
                    "Eccentricity should be in [0, 0.95]");
    }
}

// ============================================================================
// Color Processing Fuzz Tests
// ============================================================================

proptest! {
    /// Fuzz test: OkLab color operations handle hostile values
    ///
    /// Tests that color space conversions don't crash with extreme values.
    #[test]
    fn prop_color_ops_handle_extreme_values(
        r in -1000.0f64..1000.0,
        g in -1000.0f64..1000.0,
        b in -1000.0f64..1000.0,
    ) {
        if !r.is_finite() || !g.is_finite() || !b.is_finite() {
            return Ok(());
        }

        // Color conversion should not panic
        let (l, a, b_ch) = oklab::linear_srgb_to_oklab(r, g, b);

        prop_assert!(l.is_finite());
        prop_assert!(a.is_finite());
        prop_assert!(b_ch.is_finite());

        // Reverse conversion should also work
        let (r2, g2, b2) = oklab::oklab_to_linear_srgb(l, a, b_ch);
        prop_assert!(r2.is_finite());
        prop_assert!(g2.is_finite());
        prop_assert!(b2.is_finite());
    }

    /// Fuzz test: Gamut mapping handles extreme out-of-gamut colors
    #[test]
    fn prop_gamut_mapping_extreme_colors(
        r in -1000.0f64..1000.0,
        g in -1000.0f64..1000.0,
        b in -1000.0f64..1000.0,
    ) {
        use oklab::GamutMapMode;

        if !r.is_finite() || !g.is_finite() || !b.is_finite() {
            return Ok(());
        }

        let mode = GamutMapMode::PreserveHue;
        let (r_out, g_out, b_out) = mode.map_to_gamut(r, g, b);

        // Output must be finite and in valid range
        prop_assert!(r_out.is_finite() && (0.0..=1.0).contains(&r_out));
        prop_assert!(g_out.is_finite() && (0.0..=1.0).contains(&g_out));
        prop_assert!(b_out.is_finite() && (0.0..=1.0).contains(&b_out));
    }
}
