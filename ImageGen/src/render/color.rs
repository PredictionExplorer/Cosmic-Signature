//! Color space conversions and utilities

use crate::render::constants::*;
use crate::sim::Sha3RandomByteStream;
use tracing::info;

/// Type alias for OKLab color (L, a, b components)
pub type OklabColor = (f64, f64, f64);

/// Small random hue variation for visual interest
const HUE_DRIFT_JITTER: f64 = 0.1;

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

/// Generate 3 color sequences + alpha
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
}
