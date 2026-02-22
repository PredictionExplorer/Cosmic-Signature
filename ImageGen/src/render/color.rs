//! Color space conversions and utilities

use crate::render::constants::*;
use crate::sim::Sha3RandomByteStream;
use tracing::info;

/// Type alias for OKLab color (L, a, b components)
pub type OklabColor = (f64, f64, f64);

/// Small random hue variation for visual interest
const HUE_DRIFT_JITTER: f64 = 0.1;

/// Generate color gradient optimized for OKLab space.
///
/// Generates colors in OKLCh (cylindrical OKLab) for perceptually
/// uniform distribution. `chroma_boost` selects richer saturation
/// constants; `hue_wave_freq` controls per-seed color rhythm.
pub fn generate_color_gradient_oklab(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    body_index: usize,
    base_hue_offset: f64,
    chroma_boost: bool,
    hue_wave_freq: f64,
) -> Vec<OklabColor> {
    let chroma_base = if chroma_boost { OKLAB_CHROMA_BASE_BOOSTED } else { OKLAB_CHROMA_BASE };
    let chroma_range = if chroma_boost { OKLAB_CHROMA_RANGE_BOOSTED } else { OKLAB_CHROMA_RANGE };
    let chroma_wave = if chroma_boost { OKLAB_CHROMA_WAVE_AMPLITUDE_BOOSTED } else { OKLAB_CHROMA_WAVE_AMPLITUDE };

    let mut colors = Vec::with_capacity(length);

    let base_hue = rng.next_f64() * HUE_FULL_CIRCLE
        + body_index as f64 * BODY_HUE_SEPARATION
        + BODY_HUE_PHASE[body_index % BODY_HUE_PHASE.len()];

    let ln_cache: Vec<f64> =
        (0..length).map(|i| if i > 0 { (i as f64).ln() } else { 0.0 }).collect();
    let wave_cache: Vec<f64> = (0..length)
        .map(|i| {
            let t = i as f64 / length.max(1) as f64;
            let phase_offset = body_index as f64 * 0.33 + rng.next_f64() * 0.1;
            ((phase_offset + t * hue_wave_freq) * std::f64::consts::TAU).sin()
        })
        .collect();

    let random_bits: Vec<u8> = (0..length).map(|_| rng.next_byte()).collect();
    let random_chromas: Vec<f64> = (0..length).map(|_| rng.next_f64()).collect();
    let random_lightnesses: Vec<f64> = (0..length).map(|_| rng.next_f64()).collect();

    for step in 0..length {
        let mut current_hue = base_hue
            + base_hue_offset * (1.0 + ln_cache[step]) * HUE_DRIFT_SCALE
            + wave_cache[step] * HUE_WAVE_AMPLITUDE;

        if random_bits[step] & 1 == 0 {
            current_hue += HUE_DRIFT_JITTER;
        } else {
            current_hue -= HUE_DRIFT_JITTER;
        }
        current_hue = current_hue.rem_euclid(HUE_FULL_CIRCLE);

        let wave_factor = wave_cache[step];
        let chroma = (chroma_base
            + random_chromas[step] * chroma_range
            + wave_factor * chroma_wave
            + body_index as f64 * 0.01)
            .max(0.0);

        let lightness = (OKLAB_LIGHTNESS_BASE
            + random_lightnesses[step] * OKLAB_LIGHTNESS_RANGE
            + wave_factor * OKLAB_LIGHTNESS_WAVE_AMPLITUDE
            + body_index as f64 * 0.015)
            .clamp(0.0, 1.0);

        let hue_rad = current_hue.to_radians();
        let a = chroma * hue_rad.cos();
        let b = chroma * hue_rad.sin();

        colors.push((lightness, a, b));
    }

    colors
}

/// Generate 3 color sequences + per-body alphas.
///
/// `chroma_boost`: use richer saturation constants.
/// `alpha_variation`: give each body a slightly different alpha for depth.
pub fn generate_body_color_sequences(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    alpha_denom: usize,
    chroma_boost: bool,
    alpha_variation: bool,
) -> (Vec<Vec<OklabColor>>, Vec<f64>) {
    let base_hue_offset = BASE_HUE_DRIFT;

    // #14: randomize hue wave frequency per seed for unique color rhythm
    let hue_wave_freq = 1.8 + rng.next_f64() * 2.2; // [1.8, 4.0]

    let b1 = generate_color_gradient_oklab(rng, length, 0, base_hue_offset, chroma_boost, hue_wave_freq);
    let b2 = generate_color_gradient_oklab(rng, length, 1, base_hue_offset, chroma_boost, hue_wave_freq);
    let b3 = generate_color_gradient_oklab(rng, length, 2, base_hue_offset, chroma_boost, hue_wave_freq);

    let body_alphas = if alpha_variation {
        // Shuffle [13M, 15M, 17M] using the RNG for per-body depth hierarchy
        let mut denoms = [13_000_000.0_f64, 15_000_000.0, 17_000_000.0];
        for i in (1..3).rev() {
            let j = (rng.next_f64() * (i + 1) as f64).floor() as usize;
            denoms.swap(i, j);
        }
        let alphas = vec![1.0 / denoms[0], 1.0 / denoms[1], 1.0 / denoms[2]];
        info!("   => Per-body alpha variation: {:.3e}, {:.3e}, {:.3e}", alphas[0], alphas[1], alphas[2]);
        alphas
    } else {
        let alpha_value = 1.0 / alpha_denom as f64;
        info!("   => Uniform body alpha: 1/{alpha_denom} = {alpha_value:.3e}");
        vec![alpha_value; 3]
    };

    (vec![b1, b2, b3], body_alphas)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::Sha3RandomByteStream;

    #[test]
    fn test_color_gradient_generation() {
        let mut rng = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 1.0, 1.0, 1.0);
        let length = 100;
        let colors = generate_color_gradient_oklab(&mut rng, length, 0, BASE_HUE_DRIFT, false, HUE_WAVE_FREQUENCY);

        assert_eq!(colors.len(), length);
        for (l, a, b) in &colors {
            assert!(*l >= 0.0 && *l <= 1.0);
            assert!(*a >= -0.5 && *a <= 0.5);
            assert!(*b >= -0.5 && *b <= 0.5);
        }
    }

    #[test]
    fn test_color_gradient_chroma_boost() {
        let mut rng1 = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 1.0, 1.0, 1.0);
        let mut rng2 = Sha3RandomByteStream::new(&[1, 2, 3, 4], 1.0, 1.0, 1.0, 1.0);

        let normal = generate_color_gradient_oklab(&mut rng1, 100, 0, BASE_HUE_DRIFT, false, 2.6);
        let boosted = generate_color_gradient_oklab(&mut rng2, 100, 0, BASE_HUE_DRIFT, true, 2.6);

        let avg_chroma = |cols: &[(f64, f64, f64)]| {
            cols.iter().map(|(_, a, b)| (a * a + b * b).sqrt()).sum::<f64>() / cols.len() as f64
        };
        assert!(avg_chroma(&boosted) > avg_chroma(&normal),
            "Boosted chroma should produce higher average saturation");
    }

    #[test]
    fn test_body_color_sequences_uniform_alpha() {
        let mut rng = Sha3RandomByteStream::new(&[5, 6, 7, 8], 1.0, 1.0, 1.0, 1.0);
        let (colors, alphas) = generate_body_color_sequences(&mut rng, 50, 15_000_000, false, false);

        assert_eq!(colors.len(), 3);
        assert_eq!(alphas.len(), 3);
        for &a in &alphas { assert_eq!(a, 1.0 / 15_000_000.0); }
    }

    #[test]
    fn test_body_color_sequences_alpha_variation() {
        let mut rng = Sha3RandomByteStream::new(&[5, 6, 7, 8], 1.0, 1.0, 1.0, 1.0);
        let (_, alphas) = generate_body_color_sequences(&mut rng, 50, 15_000_000, false, true);

        assert_eq!(alphas.len(), 3);
        let unique: std::collections::HashSet<u64> = alphas.iter().map(|a| a.to_bits()).collect();
        assert!(unique.len() > 1, "alpha_variation should produce different per-body alphas");
    }
}
