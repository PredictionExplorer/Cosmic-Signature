//! OKLab color space conversions and utilities.
//!
//! Based on the OKLab color space by Björn Ottosson (2020)
//! Reference: https://bottosson.github.io/posts/oklab/
//!
//! This module provides accurate conversions between linear sRGB and OKLab color spaces,
//! with support for batch processing and various gamut mapping strategies.
//!
//! # Color Space Properties
//!
//! OKLab is a perceptually uniform color space with the following properties:
//! - **L** (Lightness): 0.0 (black) to 1.0 (white)
//! - **a**: Green-red axis, approximately -0.4 to +0.4
//! - **b**: Blue-yellow axis, approximately -0.4 to +0.4
//!
//! Perceptual uniformity means that equal distances in the color space
//! correspond to equal perceived color differences.

use rayon::prelude::*;

/// Configuration for gamut mapping strategies when converting from OKLab back to sRGB.
#[derive(Debug, Clone, Copy)]
pub enum GamutMapMode {
    /// Preserve hue by scaling towards gray (maintains perceptual hue)
    PreserveHue,
}

#[allow(clippy::derivable_impls)] // PreserveHue as default is intentional and clear
impl Default for GamutMapMode {
    fn default() -> Self {
        GamutMapMode::PreserveHue
    }
}

/// Convert linear sRGB to OKLab color space.
///
/// # Arguments
/// * `r`, `g`, `b` - Linear RGB values (not gamma corrected), typically in range [0, 1]
///
/// # Returns
/// * `(L, `a`, `b`)` - OKLab values where:
///   - L is lightness [0, 1]
///   - a is green-red axis [-0.4, 0.4] approximately
///   - b is blue-yellow axis [-0.4, 0.4] approximately
#[inline]
#[must_use]
#[allow(clippy::many_single_char_names)] // Standard RGB color space notation
pub fn linear_srgb_to_oklab(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    // Step 1: Linear RGB to cone response (LMS)
    let l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
    let m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
    let s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

    // Step 2: Apply nonlinearity (cube root)
    let l_prime = l.cbrt();
    let m_prime = m.cbrt();
    let s_prime = s.cbrt();

    // Step 3: Transform to Lab coordinates
    let lab_l = 0.210_454_255_3 * l_prime + 0.793_617_785_0 * m_prime - 0.004_072_046_8 * s_prime;
    let lab_a = 1.977_998_495_1 * l_prime - 2.428_592_205_0 * m_prime + 0.450_593_709_9 * s_prime;
    let lab_b = 0.025_904_037_1 * l_prime + 0.782_771_766_2 * m_prime - 0.808_675_766_0 * s_prime;

    (lab_l, lab_a, lab_b)
}

/// Convert OKLab to linear sRGB color space.
///
/// # Arguments
/// * `l` - Lightness value
/// * `a` - Green-red axis value
/// * `b` - Blue-yellow axis value
///
/// # Returns
/// * `(`r`, `g`, `b`)` - Linear RGB values (may be outside [0, 1] range)
#[inline]
#[must_use]
#[allow(clippy::many_single_char_names)] // Standard RGB color space notation
pub fn oklab_to_linear_srgb(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    // Step 1: Lab to nonlinear cone response
    let l_prime = l + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
    let m_prime = l - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
    let s_prime = l - 0.089_484_177_5 * a - 1.291_485_548_0 * b;

    // Step 2: Apply inverse nonlinearity (cube)
    let l_lms = l_prime * l_prime * l_prime;
    let m_lms = m_prime * m_prime * m_prime;
    let s_lms = s_prime * s_prime * s_prime;

    // Step 3: Cone response to linear RGB
    let r = 4.076_741_662_1 * l_lms - 3.307_711_591_3 * m_lms + 0.230_969_929_2 * s_lms;
    let g = -1.268_438_004_6 * l_lms + 2.609_757_401_1 * m_lms - 0.341_319_396_5 * s_lms;
    let b = -0.004_196_086_3 * l_lms - 0.703_418_614_7 * m_lms + 1.707_614_701_0 * s_lms;

    (r, g, b)
}

/// Batch convert linear sRGB pixels to OKLab.
///
/// This function processes multiple pixels in parallel for better performance.
/// Alpha channel is preserved unchanged.
#[must_use]
pub fn linear_srgb_to_oklab_batch(pixels: &[(f64, f64, f64, f64)]) -> Vec<(f64, f64, f64, f64)> {
    pixels
        .par_iter()
        .map(|&(r, g, b, alpha)| {
            let (l, a_ch, b_ch) = linear_srgb_to_oklab(r, g, b);
            (l, a_ch, b_ch, alpha)
        })
        .collect()
}

/// Batch convert OKLab pixels to linear sRGB.
///
/// This function processes multiple pixels in parallel for better performance.
/// Alpha channel is preserved unchanged.
#[must_use]
pub fn oklab_to_linear_srgb_batch(pixels: &[(f64, f64, f64, f64)]) -> Vec<(f64, f64, f64, f64)> {
    pixels
        .par_iter()
        .map(|&(l, a_ch, b_ch, alpha)| {
            let (r, g, b) = oklab_to_linear_srgb(l, a_ch, b_ch);
            (r, g, b, alpha)
        })
        .collect()
}

impl GamutMapMode {
    /// Map an RGB color that may be outside the [0, 1] gamut to valid range.
    ///
    /// Different strategies provide different tradeoffs between color accuracy
    /// and perceptual quality.
    pub fn map_to_gamut(&self, r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        match self {
            GamutMapMode::PreserveHue => {
                // Check if already in gamut
                let max_val = r.max(g).max(b);
                let min_val = r.min(g).min(b);

                if min_val >= 0.0 && max_val <= 1.0 {
                    return (r, g, b);
                }

                // Calculate luminance using Rec. 709 coefficients
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                // Binary search for the scale factor that brings the color into gamut
                let mut low = 0.0;
                let mut high = 1.0;
                let tolerance = 0.001;

                // Ensure luminance is in valid range first
                let lum_clamped = lum.clamp(0.0, 1.0);

                while high - low > tolerance {
                    let mid = (low + high) / 2.0;

                    // Scale the chroma while preserving luminance
                    let test_r = lum_clamped + (r - lum) * mid;
                    let test_g = lum_clamped + (g - lum) * mid;
                    let test_b = lum_clamped + (b - lum) * mid;

                    // Check if this scale factor keeps us in gamut
                    if (0.0..=1.0).contains(&test_r)
                        && (0.0..=1.0).contains(&test_g)
                        && (0.0..=1.0).contains(&test_b)
                    {
                        low = mid;
                    } else {
                        high = mid;
                    }
                }

                // Apply the final scale factor
                (
                    lum_clamped + (r - lum) * low,
                    lum_clamped + (g - lum) * low,
                    lum_clamped + (b - lum) * low,
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EPSILON: f64 = 1e-6;

    #[test]
    fn test_rgb_oklab_roundtrip() {
        // Test important colors maintain accuracy through round-trip conversion
        let test_colors = [
            (0.0, 0.0, 0.0, "Black"),
            (1.0, 1.0, 1.0, "White"),
            (1.0, 0.0, 0.0, "Red"),
            (0.0, 1.0, 0.0, "Green"),
            (0.0, 0.0, 1.0, "Blue"),
            (1.0, 1.0, 0.0, "Yellow"),
            (0.0, 1.0, 1.0, "Cyan"),
            (1.0, 0.0, 1.0, "Magenta"),
            (0.5, 0.5, 0.5, "Gray"),
            (0.25, 0.5, 0.75, "Random 1"),
            (0.8, 0.2, 0.4, "Random 2"),
        ];

        for (r, g, b, name) in &test_colors {
            let (l, a, b_ch) = linear_srgb_to_oklab(*r, *g, *b);
            let (r2, g2, b2) = oklab_to_linear_srgb(l, a, b_ch);

            assert!((r - r2).abs() < EPSILON, "{}: Red channel error: {} vs {}", name, r, r2);
            assert!((g - g2).abs() < EPSILON, "{}: Green channel error: {} vs {}", name, g, g2);
            assert!((b - b2).abs() < EPSILON, "{}: Blue channel error: {} vs {}", name, b, b2);
        }
    }

    #[test]
    fn test_oklab_properties() {
        // Test that black has L=0 and white has L≈1
        let (black_l, black_a, black_b) = linear_srgb_to_oklab(0.0, 0.0, 0.0);
        assert!(black_l.abs() < EPSILON, "Black should have L≈0, got {}", black_l);
        assert!(black_a.abs() < EPSILON, "Black should have a≈0, got {}", black_a);
        assert!(black_b.abs() < EPSILON, "Black should have b≈0, got {}", black_b);

        let (white_l, white_a, white_b) = linear_srgb_to_oklab(1.0, 1.0, 1.0);
        assert!((white_l - 1.0).abs() < 0.001, "White should have L≈1, got {}", white_l);
        assert!(white_a.abs() < 0.001, "White should have a≈0, got {}", white_a);
        assert!(white_b.abs() < 0.001, "White should have b≈0, got {}", white_b);

        // Test that grays have a≈0 and b≈0
        for i in 1..10 {
            let gray = i as f64 / 10.0;
            let (_, a, b) = linear_srgb_to_oklab(gray, gray, gray);
            assert!(a.abs() < 0.001, "Gray {} should have a≈0, got {}", gray, a);
            assert!(b.abs() < 0.001, "Gray {} should have b≈0, got {}", gray, b);
        }
    }

    #[test]
    fn test_batch_conversion() {
        let test_pixels = vec![
            (0.1, 0.2, 0.3, 1.0),
            (0.5, 0.5, 0.5, 0.5),
            (1.0, 0.0, 0.0, 0.8),
            (0.0, 1.0, 0.0, 0.3),
        ];

        // Test forward batch conversion
        let oklab_batch = linear_srgb_to_oklab_batch(&test_pixels);

        // Verify against individual conversions
        for (i, &(r, g, b, alpha)) in test_pixels.iter().enumerate() {
            let (l, a, b_ch) = linear_srgb_to_oklab(r, g, b);
            let batch_result = oklab_batch[i];

            assert!((batch_result.0 - l).abs() < EPSILON, "Batch L mismatch");
            assert!((batch_result.1 - a).abs() < EPSILON, "Batch a mismatch");
            assert!((batch_result.2 - b_ch).abs() < EPSILON, "Batch b mismatch");
            assert!((batch_result.3 - alpha).abs() < EPSILON, "Batch alpha mismatch");
        }

        // Test inverse batch conversion
        let rgb_batch = oklab_to_linear_srgb_batch(&oklab_batch);

        // Verify roundtrip
        for (i, original) in test_pixels.iter().enumerate() {
            let converted = rgb_batch[i];
            assert!((converted.0 - original.0).abs() < EPSILON, "Roundtrip R mismatch");
            assert!((converted.1 - original.1).abs() < EPSILON, "Roundtrip G mismatch");
            assert!((converted.2 - original.2).abs() < EPSILON, "Roundtrip B mismatch");
            assert!((converted.3 - original.3).abs() < EPSILON, "Roundtrip alpha mismatch");
        }
    }

    #[test]
    fn test_gamut_mapping() {
        // Test in-gamut color (should be unchanged)
        let in_gamut = (0.5, 0.7, 0.3);
        let mode = GamutMapMode::PreserveHue;
        let mapped = mode.map_to_gamut(in_gamut.0, in_gamut.1, in_gamut.2);
        assert!((mapped.0 - in_gamut.0).abs() < EPSILON, "PreserveHue changed in-gamut R");
        assert!((mapped.1 - in_gamut.1).abs() < EPSILON, "PreserveHue changed in-gamut G");
        assert!((mapped.2 - in_gamut.2).abs() < EPSILON, "PreserveHue changed in-gamut B");

        // Test out-of-gamut colors
        let test_cases = [
            (1.5, 0.5, 0.5, "Over bright red"),
            (-0.2, 0.5, 0.5, "Negative red"),
            (0.5, 1.3, 0.5, "Over bright green"),
            (0.5, 0.5, -0.1, "Negative blue"),
            (1.2, 1.2, 1.2, "Over bright white"),
            (-0.1, -0.1, -0.1, "Negative black"),
        ];

        for (r, g, b, name) in &test_cases {
            let (r_out, g_out, b_out) = mode.map_to_gamut(*r, *g, *b);

            // Verify all outputs are in valid range
            assert!(
                (0.0..=1.0).contains(&r_out),
                "PreserveHue failed to map {} R to gamut: {}",
                name,
                r_out
            );
            assert!(
                (0.0..=1.0).contains(&g_out),
                "PreserveHue failed to map {} G to gamut: {}",
                name,
                g_out
            );
            assert!(
                (0.0..=1.0).contains(&b_out),
                "PreserveHue failed to map {} B to gamut: {}",
                name,
                b_out
            );
        }
    }

    #[test]
    fn test_preserve_hue_mode() {
        // Test that PreserveHue mode brings colors into gamut while maintaining RGB relationships
        let out_of_gamut: (f64, f64, f64) = (1.5, 0.3, 0.6); // Oversaturated reddish color
        let (r_in, g_in, b_in) = out_of_gamut;

        let (r_out, g_out, b_out) = GamutMapMode::PreserveHue.map_to_gamut(r_in, g_in, b_in);

        // Verify the color is now in gamut
        assert!((0.0..=1.0).contains(&r_out), "R out of gamut: {}", r_out);
        assert!((0.0..=1.0).contains(&g_out), "G out of gamut: {}", g_out);
        assert!((0.0..=1.0).contains(&b_out), "B out of gamut: {}", b_out);

        // Test that the luminance is preserved
        let lum_in = 0.2126 * r_in + 0.7152 * g_in + 0.0722 * b_in;
        let lum_out = 0.2126 * r_out + 0.7152 * g_out + 0.0722 * b_out;
        let lum_expected = lum_in.clamp(0.0, 1.0);
        assert!(
            (lum_out - lum_expected).abs() < 0.01,
            "Luminance not preserved: {} vs {}",
            lum_out,
            lum_expected
        );

        // Test 2: pure scaling case - over-bright gray
        let gray_scale = (1.5, 1.5, 1.5);
        let (r_gray, g_gray, b_gray) =
            GamutMapMode::PreserveHue.map_to_gamut(gray_scale.0, gray_scale.1, gray_scale.2);

        // For gray, all channels should be equal after mapping
        assert!((r_gray - g_gray).abs() < EPSILON, "Gray not preserved: R={} G={}", r_gray, g_gray);
        assert!((g_gray - b_gray).abs() < EPSILON, "Gray not preserved: G={} B={}", g_gray, b_gray);
        assert_eq!(r_gray, 1.0, "Gray should be clamped to 1.0");

        // Test 3: Negative values
        let negative_color = (-0.2, 0.5, 0.5);
        let (r_neg, g_neg, b_neg) = GamutMapMode::PreserveHue.map_to_gamut(
            negative_color.0,
            negative_color.1,
            negative_color.2,
        );

        // Verify all values are in gamut
        assert!(r_neg >= 0.0, "R should be non-negative: {}", r_neg);
        assert!((0.0..=1.0).contains(&g_neg), "G out of gamut: {}", g_neg);
        assert!((0.0..=1.0).contains(&b_neg), "B out of gamut: {}", b_neg);

        // Test 4: Already in gamut - should be unchanged
        let in_gamut = (0.8, 0.5, 0.3);
        let (r_unchanged, g_unchanged, b_unchanged) =
            GamutMapMode::PreserveHue.map_to_gamut(in_gamut.0, in_gamut.1, in_gamut.2);
        assert!((r_unchanged - in_gamut.0).abs() < EPSILON, "In-gamut R changed");
        assert!((g_unchanged - in_gamut.1).abs() < EPSILON, "In-gamut G changed");
        assert!((b_unchanged - in_gamut.2).abs() < EPSILON, "In-gamut B changed");
    }

    #[test]
    fn test_default_gamut_mode() {
        let mode = GamutMapMode::default();
        assert!(matches!(mode, GamutMapMode::PreserveHue));
    }
}

/// Property-based tests for OKLab color conversions.
///
/// These tests verify key invariants using random inputs.
#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// RGB to OKLab roundtrip preserves values within tolerance.
        #[test]
        fn roundtrip_preserves_values(
            r in 0.0f64..=1.0,
            g in 0.0f64..=1.0,
            b in 0.0f64..=1.0,
        ) {
            let (l, a, b_ch) = linear_srgb_to_oklab(r, g, b);
            let (r2, g2, b2) = oklab_to_linear_srgb(l, a, b_ch);

            prop_assert!((r - r2).abs() < 1e-6, "R mismatch: {} vs {}", r, r2);
            prop_assert!((g - g2).abs() < 1e-6, "G mismatch: {} vs {}", g, g2);
            prop_assert!((b - b2).abs() < 1e-6, "B mismatch: {} vs {}", b, b2);
        }

        /// OKLab lightness is bounded for in-gamut colors.
        #[test]
        fn oklab_lightness_is_bounded(
            r in 0.0f64..=1.0,
            g in 0.0f64..=1.0,
            b in 0.0f64..=1.0,
        ) {
            let (l, _, _) = linear_srgb_to_oklab(r, g, b);
            prop_assert!((0.0..=1.001).contains(&l), "L out of bounds: {l}");
        }

        /// Grays have near-zero chroma (a and b).
        #[test]
        fn grays_have_zero_chroma(
            gray in 0.0f64..=1.0,
        ) {
            let (_, a, b) = linear_srgb_to_oklab(gray, gray, gray);
            prop_assert!(a.abs() < 0.001, "Gray a not zero: {}", a);
            prop_assert!(b.abs() < 0.001, "Gray b not zero: {}", b);
        }

        /// Gamut mapping always produces in-range values.
        #[test]
        fn gamut_mapping_produces_valid_values(
            r in -2.0f64..=2.0,
            g in -2.0f64..=2.0,
            b in -2.0f64..=2.0,
        ) {
            let (r_out, g_out, b_out) = GamutMapMode::PreserveHue.map_to_gamut(r, g, b);

            prop_assert!((0.0..=1.0).contains(&r_out), "R out of gamut: {}", r_out);
            prop_assert!((0.0..=1.0).contains(&g_out), "G out of gamut: {}", g_out);
            prop_assert!((0.0..=1.0).contains(&b_out), "B out of gamut: {}", b_out);
        }

        /// Batch conversion matches individual conversion.
        #[test]
        fn batch_matches_individual(
            r in 0.0f64..=1.0,
            g in 0.0f64..=1.0,
            b in 0.0f64..=1.0,
            a in 0.0f64..=1.0,
        ) {
            let pixels = vec![(r, g, b, a)];
            let batch_result = linear_srgb_to_oklab_batch(&pixels);

            let (l, a_ch, b_ch) = linear_srgb_to_oklab(r, g, b);

            prop_assert!((batch_result[0].0 - l).abs() < 1e-10, "Batch L mismatch");
            prop_assert!((batch_result[0].1 - a_ch).abs() < 1e-10, "Batch a mismatch");
            prop_assert!((batch_result[0].2 - b_ch).abs() < 1e-10, "Batch b mismatch");
            prop_assert!((batch_result[0].3 - a).abs() < 1e-10, "Batch alpha mismatch");
        }

        /// Conversion produces finite values for any input.
        #[test]
        fn conversion_produces_finite_values(
            r in -10.0f64..=10.0,
            g in -10.0f64..=10.0,
            b in -10.0f64..=10.0,
        ) {
            let (l, a, b_ch) = linear_srgb_to_oklab(r, g, b);

            prop_assert!(l.is_finite(), "L is not finite for input ({}, {}, {})", r, g, b);
            prop_assert!(a.is_finite(), "a is not finite for input ({}, {}, {})", r, g, b);
            prop_assert!(b_ch.is_finite(), "b is not finite for input ({}, {}, {})", r, g, b);
        }

        /// Fuzz test: Extreme RGB values produce finite OkLab output
        ///
        /// Critical for HDR rendering where RGB values can exceed [0,1].
        #[test]
        fn prop_extreme_rgb_to_oklab(
            r in -1e100f64..1e100,
            g in -1e100f64..1e100,
            b in -1e100f64..1e100,
        ) {
            // Skip non-finite inputs
            if !r.is_finite() || !g.is_finite() || !b.is_finite() {
                return Ok(());
            }

            let (l, a, b_ch) = linear_srgb_to_oklab(r, g, b);

            prop_assert!(l.is_finite(), "L not finite for extreme RGB ({}, {}, {})", r, g, b);
            prop_assert!(a.is_finite(), "a not finite for extreme RGB ({}, {}, {})", r, g, b);
            prop_assert!(b_ch.is_finite(), "b not finite for extreme RGB ({}, {}, {})", r, g, b);
        }

        /// Fuzz test: Extreme OkLab values produce finite RGB output
        #[test]
        fn prop_extreme_oklab_to_rgb(
            l in -100.0f64..100.0,
            a in -100.0f64..100.0,
            b in -100.0f64..100.0,
        ) {
            let (r, g, b_ch) = oklab_to_linear_srgb(l, a, b);

            prop_assert!(r.is_finite(), "R not finite for OkLab ({}, {}, {})", l, a, b);
            prop_assert!(g.is_finite(), "G not finite for OkLab ({}, {}, {})", l, a, b);
            prop_assert!(b_ch.is_finite(), "B not finite for OkLab ({}, {}, {})", l, a, b);
        }

        /// Fuzz test: Gamut mapping always produces valid RGB
        #[test]
        fn prop_gamut_mapping_produces_valid_rgb(
            r in -100.0f64..100.0,
            g in -100.0f64..100.0,
            b in -100.0f64..100.0,
        ) {
            let mode = GamutMapMode::PreserveHue;
            let (r_out, g_out, b_out) = mode.map_to_gamut(r, g, b);

            // Output must be finite
            prop_assert!(r_out.is_finite());
            prop_assert!(g_out.is_finite());
            prop_assert!(b_out.is_finite());

            // Output must be in [0, 1] range
            prop_assert!((0.0..=1.0).contains(&r_out), "R {} out of gamut", r_out);
            prop_assert!((0.0..=1.0).contains(&g_out), "G {} out of gamut", g_out);
            prop_assert!((0.0..=1.0).contains(&b_out), "B {} out of gamut", b_out);
        }

        /// Fuzz test: Batch conversion matches single-pixel conversion
        ///
        /// Differential fuzzing to ensure parallel version is correct.
        #[test]
        fn prop_batch_matches_single_pixel(
            pixels in prop::collection::vec((0.0f64..1.0, 0.0f64..1.0, 0.0f64..1.0, 0.0f64..1.0), 1..100),
        ) {
            let batch_result = linear_srgb_to_oklab_batch(&pixels);

            for (i, &(r, g, b, alpha)) in pixels.iter().enumerate() {
                let (l, a, b_ch) = linear_srgb_to_oklab(r, g, b);
                let batch_pixel = batch_result[i];

                prop_assert!((batch_pixel.0 - l).abs() < 1e-10, "Batch L mismatch at pixel {}", i);
                prop_assert!((batch_pixel.1 - a).abs() < 1e-10, "Batch a mismatch at pixel {}", i);
                prop_assert!((batch_pixel.2 - b_ch).abs() < 1e-10, "Batch b mismatch at pixel {}", i);
                prop_assert!((batch_pixel.3 - alpha).abs() < 1e-10, "Batch alpha mismatch at pixel {}", i);
            }
        }

        /// Fuzz test: Inverse batch conversion matches forward conversion
        #[test]
        fn prop_batch_inverse_matches(
            pixels in prop::collection::vec((0.0f64..1.0, 0.0f64..1.0, 0.0f64..1.0, 0.0f64..1.0), 1..100),
        ) {
            let oklab_pixels = linear_srgb_to_oklab_batch(&pixels);
            let rgb_pixels = oklab_to_linear_srgb_batch(&oklab_pixels);

            for (i, &original) in pixels.iter().enumerate() {
                let converted = rgb_pixels[i];

                prop_assert!((converted.0 - original.0).abs() < 1e-6, "R roundtrip error at pixel {}", i);
                prop_assert!((converted.1 - original.1).abs() < 1e-6, "G roundtrip error at pixel {}", i);
                prop_assert!((converted.2 - original.2).abs() < 1e-6, "B roundtrip error at pixel {}", i);
                prop_assert!((converted.3 - original.3).abs() < 1e-10, "Alpha roundtrip error at pixel {}", i);
            }
        }

        /// Fuzz test: Subnormal floats are handled correctly
        #[test]
        fn prop_handles_subnormal_floats(
            r_exp in -1074i32..=-1022,
            g_exp in -1074i32..=-1022,
            b_exp in -1074i32..=-1022,
        ) {
            // Create subnormal values (very small positive numbers)
            let r = 2.0f64.powi(r_exp);
            let g = 2.0f64.powi(g_exp);
            let b = 2.0f64.powi(b_exp);

            let (l, a, b_ch) = linear_srgb_to_oklab(r, g, b);

            prop_assert!(l.is_finite());
            prop_assert!(a.is_finite());
            prop_assert!(b_ch.is_finite());

            // Verify roundtrip
            let (r2, g2, b2) = oklab_to_linear_srgb(l, a, b_ch);
            prop_assert!(r2.is_finite());
            prop_assert!(g2.is_finite());
            prop_assert!(b2.is_finite());
        }
    }
}
