//! OKLab color space conversions and utilities.
//!
//! Based on the OKLab color space by Björn Ottosson (2020)
//! Reference: https://bottosson.github.io/posts/oklab/
//!
//! This module provides accurate conversions between linear sRGB and OKLab color spaces,
//! with support for batch processing and various gamut mapping strategies.

use rayon::prelude::*;

/// Configuration for gamut mapping strategies when converting from OKLab back to sRGB.
#[derive(Debug, Clone, Copy)]
pub enum GamutMapMode {
    /// Simple clamping of out-of-gamut values (fast but can cause discontinuities)
    Clamp,
    /// Preserve hue by scaling towards gray (maintains perceptual hue)
    PreserveHue,
    /// Soft clipping using smooth transitions (reduces harsh edges)
    SoftClip,
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
/// * `(L, a, b)` - OKLab values where:
///   - L is lightness [0, 1]
///   - a is green-red axis [-0.4, 0.4] approximately
///   - b is blue-yellow axis [-0.4, 0.4] approximately
#[inline]
pub fn linear_srgb_to_oklab(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    // Step 1: Linear RGB to cone response (LMS)
    let l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    let m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    let s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    // Step 2: Apply nonlinearity (cube root)
    let l_prime = l.cbrt();
    let m_prime = m.cbrt();
    let s_prime = s.cbrt();

    // Step 3: Transform to Lab coordinates
    let lab_l = 0.2104542553 * l_prime + 0.7936177850 * m_prime - 0.0040720468 * s_prime;
    let lab_a = 1.9779984951 * l_prime - 2.4285922050 * m_prime + 0.4505937099 * s_prime;
    let lab_b = 0.0259040371 * l_prime + 0.7827717662 * m_prime - 0.8086757660 * s_prime;

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
/// * `(r, g, b)` - Linear RGB values (may be outside [0, 1] range)
#[inline]
pub fn oklab_to_linear_srgb(l: f64, a: f64, b: f64) -> (f64, f64, f64) {
    // Step 1: Lab to nonlinear cone response
    let l_prime = l + 0.3963377774 * a + 0.2158037573 * b;
    let m_prime = l - 0.1055613458 * a - 0.0638541728 * b;
    let s_prime = l - 0.0894841775 * a - 1.2914855480 * b;

    // Step 2: Apply inverse nonlinearity (cube)
    let l_lms = l_prime * l_prime * l_prime;
    let m_lms = m_prime * m_prime * m_prime;
    let s_lms = s_prime * s_prime * s_prime;

    // Step 3: Cone response to linear RGB
    let r = 4.0767416621 * l_lms - 3.3077115913 * m_lms + 0.2309699292 * s_lms;
    let g = -1.2684380046 * l_lms + 2.6097574011 * m_lms - 0.3413193965 * s_lms;
    let b = -0.0041960863 * l_lms - 0.7034186147 * m_lms + 1.7076147010 * s_lms;

    (r, g, b)
}

/// Batch convert linear sRGB pixels to OKLab.
///
/// This function processes multiple pixels in parallel for better performance.
/// Alpha channel is preserved unchanged.
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
            GamutMapMode::Clamp => {
                // Simple clamping - fast but can cause color shifts
                (r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0))
            }

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

            GamutMapMode::SoftClip => {
                // Smooth S-curve mapping for values near boundaries
                fn soft_clip_channel(x: f64) -> f64 {
                    if x <= 0.0 {
                        0.0
                    } else if x >= 1.0 {
                        1.0
                    } else if x < 0.05 {
                        // Smooth transition near 0
                        let t = x / 0.05;
                        x * (2.0 - t)
                    } else if x > 0.95 {
                        // Smooth transition near 1
                        let t = (x - 0.95) / 0.05;
                        0.95 + 0.05 * t * (2.0 - t)
                    } else {
                        x
                    }
                }

                (soft_clip_channel(r), soft_clip_channel(g), soft_clip_channel(b))
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
        for mode in [GamutMapMode::Clamp, GamutMapMode::PreserveHue, GamutMapMode::SoftClip] {
            let mapped = mode.map_to_gamut(in_gamut.0, in_gamut.1, in_gamut.2);
            assert!((mapped.0 - in_gamut.0).abs() < EPSILON, "{:?} changed in-gamut R", mode);
            assert!((mapped.1 - in_gamut.1).abs() < EPSILON, "{:?} changed in-gamut G", mode);
            assert!((mapped.2 - in_gamut.2).abs() < EPSILON, "{:?} changed in-gamut B", mode);
        }

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
            for mode in [GamutMapMode::Clamp, GamutMapMode::PreserveHue, GamutMapMode::SoftClip] {
                let (r_out, g_out, b_out) = mode.map_to_gamut(*r, *g, *b);

                // Verify all outputs are in valid range
                assert!(
                    (0.0..=1.0).contains(&r_out),
                    "{:?} failed to map {} R to gamut: {}",
                    mode,
                    name,
                    r_out
                );
                assert!(
                    (0.0..=1.0).contains(&g_out),
                    "{:?} failed to map {} G to gamut: {}",
                    mode,
                    name,
                    g_out
                );
                assert!(
                    (0.0..=1.0).contains(&b_out),
                    "{:?} failed to map {} B to gamut: {}",
                    mode,
                    name,
                    b_out
                );
            }
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
}
