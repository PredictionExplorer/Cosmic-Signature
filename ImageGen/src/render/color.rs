//! Color space conversions and utilities
//!
//! This module provides color generation for the three-body trajectory rendering.
//! It supports two modes:
//! - **Random mode**: Traditional 120° separated hues for maximum variety
//! - **Palette-coordinated mode**: Hues derived from the gradient map palette for harmony

// Allow common color space patterns
#![allow(clippy::many_single_char_names)] // r, g, b are standard notation

use crate::post_effects::LuxuryPalette;
use crate::render::constants::*;
use crate::sim::Sha3RandomByteStream;
use tracing::info;

/// Type alias for OKLab color (L, `a`, `b` components)
pub type OklabColor = (f64, f64, f64);

/// Small random hue variation for visual interest
const HUE_DRIFT_JITTER: f64 = 0.1;

/// Hue jitter range for palette-coordinated mode (±15°)
const PALETTE_HUE_JITTER: f64 = 15.0;

/// Generate color gradient optimized for OKLab space
///
/// This generates colors in OKLCh (cylindrical OKLab) space for more
/// perceptually uniform color distribution.
pub fn generate_color_gradient_oklab(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    body_index: usize,
    base_hue_offset: f64,
) -> Vec<OklabColor> {
    let mut colors = Vec::with_capacity(length);

    // Start with a random hue, ensuring wide separation between bodies
    let base_hue = rng.next_f64() * HUE_FULL_CIRCLE
        + body_index as f64 * BODY_HUE_SEPARATION
        + BODY_HUE_PHASE[body_index % BODY_HUE_PHASE.len()];

    // Pre-compute logarithms and sinusoidal wave for palette movement
    let ln_cache: Vec<f64> =
        (0..length).map(|i| if i > 0 { (i as f64).ln() } else { 0.0 }).collect();
    let wave_cache: Vec<f64> = (0..length)
        .map(|i| {
            let t = i as f64 / length.max(1) as f64;
            let phase_offset = body_index as f64 * 0.33 + rng.next_f64() * 0.1;
            ((phase_offset + t * HUE_WAVE_FREQUENCY) * std::f64::consts::TAU).sin()
        })
        .collect();

    // Pre-generate random values to reduce RNG calls
    let random_bits: Vec<u8> = (0..length).map(|_| rng.next_byte()).collect();
    let random_chromas: Vec<f64> = (0..length).map(|_| rng.next_f64()).collect();
    let random_lightnesses: Vec<f64> = (0..length).map(|_| rng.next_f64()).collect();

    for step in 0..length {
        // Time-based hue drift using logarithmic drift and wave modulation
        let mut current_hue = base_hue
            + base_hue_offset * (1.0 + ln_cache[step]) * HUE_DRIFT_SCALE
            + wave_cache[step] * HUE_WAVE_AMPLITUDE;

        // Slight random variation using pre-generated bits
        if random_bits[step] & 1 == 0 {
            current_hue += HUE_DRIFT_JITTER;
        } else {
            current_hue -= HUE_DRIFT_JITTER;
        }
        current_hue = current_hue.rem_euclid(HUE_FULL_CIRCLE);

        // Generate in LCh space using pre-generated random values and wave modulation
        let wave_factor = wave_cache[step];
        let chroma = (OKLAB_CHROMA_BASE
            + random_chromas[step] * OKLAB_CHROMA_RANGE
            + wave_factor * OKLAB_CHROMA_WAVE_AMPLITUDE
            + body_index as f64 * 0.01)
            .max(0.0);

        let lightness = (OKLAB_LIGHTNESS_BASE
            + random_lightnesses[step] * OKLAB_LIGHTNESS_RANGE
            + wave_factor * OKLAB_LIGHTNESS_WAVE_AMPLITUDE
            + body_index as f64 * 0.015)
            .clamp(0.0, 1.0);

        // Convert LCh to Lab
        let hue_rad = current_hue.to_radians();
        let a = chroma * hue_rad.cos();
        let b = chroma * hue_rad.sin();

        // Store OKLab color directly
        colors.push((lightness, a, b));
    }

    colors
}

/// Generate 3 color sequences + alpha (random mode)
pub fn generate_body_color_sequences(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    alpha_value: f64,
) -> (Vec<Vec<OklabColor>>, Vec<f64>) {
    // Base hue offset for time-based drift (in degrees per log-time unit)
    let base_hue_offset = BASE_HUE_DRIFT; // Subtle drift over time

    // Use OKLab-optimized color generation
    let (b1, b2, b3) = (
        generate_color_gradient_oklab(rng, length, 0, base_hue_offset),
        generate_color_gradient_oklab(rng, length, 1, base_hue_offset),
        generate_color_gradient_oklab(rng, length, 2, base_hue_offset),
    );

    info!("   => Setting all body alphas to 1/{alpha_value:.0} = {alpha_value:.3e}");
    (vec![b1, b2, b3], vec![alpha_value; 3])
}

/// Generate palette-coordinated color gradient for a single body.
///
/// MUSEUM QUALITY: Colors are derived from the gradient map palette to ensure
/// visual harmony between trajectories and the color grading effect.
///
/// # Arguments
///
/// * `rng` - Random number generator for variation
/// * `length` - Number of color samples (simulation steps)
/// * `body_index` - Body index (0, 1, or 2)
/// * `base_hue` - Base hue from the palette (in degrees)
/// * `lightness` - Target lightness from the palette
/// * `chroma` - Target chroma from the palette
fn generate_palette_coordinated_gradient(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    body_index: usize,
    base_hue: f64,
    lightness: f64,
    chroma: f64,
) -> Vec<OklabColor> {
    let mut colors = Vec::with_capacity(length);

    // Pre-compute wave cache for smooth palette evolution
    let wave_cache: Vec<f64> = (0..length)
        .map(|i| {
            let t = i as f64 / length.max(1) as f64;
            let phase_offset = body_index as f64 * 0.33;
            ((phase_offset + t * HUE_WAVE_FREQUENCY) * std::f64::consts::TAU).sin()
        })
        .collect();

    // Pre-generate random values for subtle variation
    let random_hue_jitter: Vec<f64> = (0..length)
        .map(|_| (rng.next_f64() - 0.5) * 2.0 * PALETTE_HUE_JITTER)
        .collect();
    let random_lightness: Vec<f64> = (0..length)
        .map(|_| (rng.next_f64() - 0.5) * 0.1)
        .collect();
    let random_chroma: Vec<f64> = (0..length)
        .map(|_| (rng.next_f64() - 0.5) * 0.04)
        .collect();

    for step in 0..length {
        // Gentle hue drift around base, with wave modulation and random jitter
        let hue_drift = wave_cache[step] * 20.0 + random_hue_jitter[step];
        let current_hue = (base_hue + hue_drift).rem_euclid(360.0);

        // Subtle lightness and chroma variation
        let current_lightness = (lightness + wave_cache[step] * 0.05 + random_lightness[step])
            .clamp(0.3, 0.95);
        let current_chroma = (chroma + wave_cache[step] * 0.02 + random_chroma[step])
            .clamp(0.05, 0.25);

        // Convert LCh to Lab
        let hue_rad = current_hue.to_radians();
        let a = current_chroma * hue_rad.cos();
        let b = current_chroma * hue_rad.sin();

        colors.push((current_lightness, a, b));
    }

    colors
}

/// Generate 3 palette-coordinated color sequences + alpha.
///
/// MUSEUM QUALITY: This function creates body colors that harmonize with the
/// selected gradient map palette, ensuring visual coherence between trajectories
/// and the final color grading.
///
/// # Arguments
///
/// * `rng` - Random number generator
/// * `length` - Number of color samples (simulation steps)
/// * `alpha_value` - Alpha value for all bodies
/// * `palette_index` - Index of the gradient map palette to coordinate with
///
/// # Returns
///
/// Tuple of (body_colors, body_alphas) where:
/// - body_colors: Vec of 3 color sequences, each with `length` OKLab colors
/// - body_alphas: Vec of 3 alpha values (all equal to alpha_value)
pub fn generate_palette_coordinated_colors(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    alpha_value: f64,
    palette_index: usize,
) -> (Vec<Vec<OklabColor>>, Vec<f64>) {
    let palette = LuxuryPalette::from_index(palette_index);
    let hues = palette.body_hues();
    let lightnesses = palette.body_lightnesses();
    let chromas = palette.body_chromas();

    info!(
        "   => Using palette-coordinated colors (palette: {:?})",
        palette
    );
    info!(
        "   => Body hues: [{:.0}°, {:.0}°, {:.0}°]",
        hues[0], hues[1], hues[2]
    );

    let b1 = generate_palette_coordinated_gradient(
        rng, length, 0, hues[0], lightnesses[0], chromas[0],
    );
    let b2 = generate_palette_coordinated_gradient(
        rng, length, 1, hues[1], lightnesses[1], chromas[1],
    );
    let b3 = generate_palette_coordinated_gradient(
        rng, length, 2, hues[2], lightnesses[2], chromas[2],
    );

    info!(
        "   => Setting all body alphas to 1/{:.0} = {:.3e}",
        1.0 / alpha_value,
        alpha_value
    );
    (vec![b1, b2, b3], vec![alpha_value; 3])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::Sha3RandomByteStream;

    #[test]
    fn test_color_gradient_generation() {
        // Constructor needs 5 params: seed, min_mass, max_mass, location, velocity
        // These mass/location values aren't used by color generation
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 1.0, 1.0, 1.0);
        let length = 100;
        let colors = generate_color_gradient_oklab(&mut rng, length, 0, BASE_HUE_DRIFT);

        assert_eq!(colors.len(), length);

        // Check that colors are within expected ranges
        for (l, a, b) in &colors {
            // Lightness should be within reasonable bounds
            assert!(*l >= 0.0 && *l <= 1.0);
            // a and b components should be within typical OKLab range (-0.5 to 0.5 is conservative)
            assert!(*a >= -0.5 && *a <= 0.5);
            assert!(*b >= -0.5 && *b <= 0.5);
        }
    }

    #[test]
    fn test_body_color_sequences() {
        // Constructor needs 5 params: seed, min_mass, max_mass, location, velocity
        // These mass/location values aren't used by color generation
        let mut rng = Sha3RandomByteStream::new(&[5, 6, 7, 8], 1.0, 1.0, 1.0, 1.0);
        let length = 50;
        let alpha = 0.001;

        let (colors, alphas) = generate_body_color_sequences(&mut rng, length, alpha);

        assert_eq!(colors.len(), 3);
        assert_eq!(alphas.len(), 3);

        for body_colors in &colors {
            assert_eq!(body_colors.len(), length);
        }

        for &a in &alphas {
            assert_eq!(a, alpha);
        }
    }

    // =========================================================================
    // MUSEUM QUALITY: Palette-Coordinated Color Tests
    // =========================================================================

    #[test]
    fn test_palette_coordinated_colors_generates_valid_colors() {
        let mut rng = Sha3RandomByteStream::new(&[10, 20, 30, 40], 1.0, 1.0, 1.0, 1.0);
        let length = 100;
        let alpha = 0.001;
        let palette_index = 0; // GoldPurple

        let (colors, alphas) = generate_palette_coordinated_colors(&mut rng, length, alpha, palette_index);

        assert_eq!(colors.len(), 3, "Should generate 3 body color sequences");
        assert_eq!(alphas.len(), 3, "Should generate 3 alpha values");

        for (body_idx, body_colors) in colors.iter().enumerate() {
            assert_eq!(body_colors.len(), length, "Body {} should have {} colors", body_idx, length);
            
            for (step, (l, a, b)) in body_colors.iter().enumerate() {
                assert!(
                    *l >= 0.0 && *l <= 1.0,
                    "Body {} step {} lightness {} out of range",
                    body_idx, step, l
                );
                assert!(
                    *a >= -0.5 && *a <= 0.5,
                    "Body {} step {} 'a' component {} out of range",
                    body_idx, step, a
                );
                assert!(
                    *b >= -0.5 && *b <= 0.5,
                    "Body {} step {} 'b' component {} out of range",
                    body_idx, step, b
                );
            }
        }
    }

    #[test]
    fn test_palette_coordinated_colors_different_palettes_produce_different_hues() {
        let mut rng1 = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 1.0, 1.0, 1.0);
        let mut rng2 = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 1.0, 1.0, 1.0);
        let length = 10;
        let alpha = 0.001;

        let (colors_gold, _) = generate_palette_coordinated_colors(&mut rng1, length, alpha, 0); // GoldPurple
        let (colors_teal, _) = generate_palette_coordinated_colors(&mut rng2, length, alpha, 1); // CosmicTealPink

        // Calculate average hue difference between the two palettes
        let mut total_diff = 0.0;
        for body_idx in 0..3 {
            let (_l1, a1, b1) = colors_gold[body_idx][0];
            let (_l2, a2, b2) = colors_teal[body_idx][0];
            
            // Hue from OKLab a,b components
            let hue1 = b1.atan2(a1);
            let hue2 = b2.atan2(a2);
            
            // Angular difference
            let diff = (hue1 - hue2).abs();
            total_diff += diff.min(std::f64::consts::TAU - diff);
        }
        
        assert!(
            total_diff > 0.3,
            "Different palettes should produce noticeably different hues (diff={})",
            total_diff
        );
    }

    #[test]
    fn test_palette_coordinated_colors_deterministic() {
        let mut rng1 = Sha3RandomByteStream::new(&[50, 60, 70, 80], 1.0, 1.0, 1.0, 1.0);
        let mut rng2 = Sha3RandomByteStream::new(&[50, 60, 70, 80], 1.0, 1.0, 1.0, 1.0);
        let length = 50;
        let alpha = 0.001;
        let palette = 5; // VenetianRenaissance

        let (colors1, alphas1) = generate_palette_coordinated_colors(&mut rng1, length, alpha, palette);
        let (colors2, alphas2) = generate_palette_coordinated_colors(&mut rng2, length, alpha, palette);

        assert_eq!(alphas1, alphas2, "Alphas should be identical");
        
        for body in 0..3 {
            for step in 0..length {
                let c1 = colors1[body][step];
                let c2 = colors2[body][step];
                assert!(
                    (c1.0 - c2.0).abs() < 1e-10 &&
                    (c1.1 - c2.1).abs() < 1e-10 &&
                    (c1.2 - c2.2).abs() < 1e-10,
                    "Colors should be deterministic for same seed"
                );
            }
        }
    }

    #[test]
    fn test_palette_coordinated_colors_has_temporal_variation() {
        let mut rng = Sha3RandomByteStream::new(&[100, 110, 120, 130], 1.0, 1.0, 1.0, 1.0);
        let length = 1000;
        let alpha = 0.001;
        let palette = 3; // IndigoGold

        let (colors, _) = generate_palette_coordinated_colors(&mut rng, length, alpha, palette);

        // Check that colors evolve over time (not static)
        for body in 0..3 {
            let first = colors[body][0];
            let last = colors[body][length - 1];
            
            // Calculate color distance
            let dist = ((first.0 - last.0).powi(2) + 
                       (first.1 - last.1).powi(2) + 
                       (first.2 - last.2).powi(2)).sqrt();
            
            assert!(
                dist > 0.01,
                "Body {} colors should vary over time (first={:?}, last={:?}, dist={})",
                body, first, last, dist
            );
        }
    }

    #[test]
    fn test_all_palettes_produce_valid_body_colors() {
        // Test all 15 palettes
        for palette_idx in 0..15 {
            let mut rng = Sha3RandomByteStream::new(&[palette_idx as u8, 0, 0, 0], 1.0, 1.0, 1.0, 1.0);
            let (colors, _) = generate_palette_coordinated_colors(&mut rng, 10, 0.001, palette_idx);
            
            for body in 0..3 {
                for (l, a, b) in &colors[body] {
                    assert!(
                        *l >= 0.0 && *l <= 1.0,
                        "Palette {} body {} has invalid lightness {}",
                        palette_idx, body, l
                    );
                    assert!(
                        a.abs() <= 0.5 && b.abs() <= 0.5,
                        "Palette {} body {} has invalid chroma (a={}, b={})",
                        palette_idx, body, a, b
                    );
                }
            }
        }
    }
}
