//! Spectral utilities: 16-bin SPD handling and conversions.
//!
//! Our “spectral accumulation” keeps one energy value per wavelength bin
//! (bins are equally spaced from 380-700 nm).  Rendering draws into this
//! SPD buffer, then we convert the spectrum → linear-sRGB right before
//! the normal tone-mapping / bloom pipeline.

use image::Rgb;
use once_cell::sync::Lazy;
use palette::{FromColor, Hsl, Srgb};

/// Number of wavelength buckets in the SPD.
pub const NUM_BINS: usize = 16;
/// Start / end wavelengths in nanometres.
const LAMBDA_START: f64 = 380.0;
const LAMBDA_END: f64 = 700.0;

/// Centre wavelength for a bin.
#[inline]
pub fn wavelength_nm_for_bin(bin: usize) -> f64 {
    LAMBDA_START + (bin as f64 + 0.5) * (LAMBDA_END - LAMBDA_START) / NUM_BINS as f64
}

/// Approximate (linear-sRGB) colour corresponding to a given wavelength.
/// Formula adapted from Dan Bruton's reference (gamma removed → stay linear).
fn wavelength_to_rgb(lambda: f64) -> (f64, f64, f64) {
    let (r, g, b) = if (380.0..440.0).contains(&lambda) {
        (-(lambda - 440.0) / (440.0 - 380.0), 0.0, 1.0)
    } else if (440.0..490.0).contains(&lambda) {
        (0.0, (lambda - 440.0) / (490.0 - 440.0), 1.0)
    } else if (490.0..510.0).contains(&lambda) {
        (0.0, 1.0, -(lambda - 510.0) / (510.0 - 490.0))
    } else if (510.0..580.0).contains(&lambda) {
        ((lambda - 510.0) / (580.0 - 510.0), 1.0, 0.0)
    } else if (580.0..645.0).contains(&lambda) {
        (1.0, -(lambda - 645.0) / (645.0 - 580.0), 0.0)
    } else if (645.0..=700.0).contains(&lambda) {
        (1.0, 0.0, 0.0)
    } else {
        (0.0, 0.0, 0.0)
    };

    // Intensity falloff near ends of visible range (simple linear ramp).
    let factor = if (380.0..420.0).contains(&lambda) {
        0.3 + 0.7 * (lambda - 380.0) / (420.0 - 380.0)
    } else if (420.0..645.0).contains(&lambda) {
        1.0
    } else if (645.0..=700.0).contains(&lambda) {
        0.3 + 0.7 * (700.0 - lambda) / (700.0 - 645.0)
    } else {
        0.0
    };

    (r * factor, g * factor, b * factor)
}

/// Pre-computed linear-sRGB triplet for each bin’s unit intensity.
pub static BIN_RGB: Lazy<[(f64, f64, f64); NUM_BINS]> = Lazy::new(|| {
    let mut arr = [(0.0, 0.0, 0.0); NUM_BINS];
    for i in 0..NUM_BINS {
        arr[i] = wavelength_to_rgb(wavelength_nm_for_bin(i));
    }
    arr
});

/// Sub-pixel shift for each wavelength bin to create “prismatic” fringes.
/// Computed along a golden-angle spiral inside one pixel (≤ ±0.35 px).
pub static BIN_SHIFT: Lazy<[(f32, f32); NUM_BINS]> = Lazy::new(|| {
    let golden = std::f32::consts::PI * (3.0 - 5.0_f32.sqrt()); // ≈2.39996
    let mut arr = [(0.0, 0.0); NUM_BINS];
    let base = 1.5_f32; // stronger dispersion
    for i in 0..NUM_BINS {
        let radius = base * (i as f32 + 1.0) / NUM_BINS as f32;
        let angle = (i as f32) * golden;
        arr[i] = (radius * angle.cos(), radius * angle.sin());
    }
    arr
});

/// Per-bin tone-mapping strength k_b used in `energy' = 1 - exp(-k_b * e)`.
pub static BIN_TONE: Lazy<[f64; NUM_BINS]> = Lazy::new(|| {
    let mut arr = [1.0f64; NUM_BINS];
    for i in 0..NUM_BINS {
        // Blues (low i) get stronger k (brighter), reds lower to curb washout
        arr[i] = 2.0 - 1.4 * (i as f64) / (NUM_BINS as f64 - 1.0);
    }
    arr
});

/// Convert an image‐space RGB (u8) colour to its closest wavelength bin based on hue.
#[inline]
pub fn rgb_to_bin(col: &Rgb<u8>) -> usize {
    let srgb = Srgb::new(col[0] as f32 / 255.0, col[1] as f32 / 255.0, col[2] as f32 / 255.0);
    let hsl: Hsl = Hsl::from_color(srgb);
    let mut hue_deg = hsl.hue.into_degrees() as f64;
    if hue_deg < 0.0 {
        hue_deg += 360.0;
    }
    let bin = (hue_deg / 360.0 * NUM_BINS as f64).floor() as usize;
    bin.min(NUM_BINS - 1)
}

/// Convert an SPD sample (per-bin energy) to linear-sRGB premultiplied RGBA.
/// Alpha equals total energy (capped at 1.0) so downstream blending treats it
/// similarly to our old pipeline.
#[inline]
pub fn spd_to_rgba(spd: &[f64; NUM_BINS]) -> (f64, f64, f64, f64) {
    // Accumulate RGB weighted by each bin's energy.
    let mut r = 0.0;
    let mut g = 0.0;
    let mut b = 0.0;
    let mut total = 0.0;
    for (e, (&(lr, lg, lb), &k)) in spd.iter().zip(BIN_RGB.iter().zip(BIN_TONE.iter())) {
        if *e == 0.0 {
            continue;
        }
        // Per-bin tone curve
        let e_mapped = 1.0 - (-k * *e).exp();
        total += e_mapped;
        r += e_mapped * lr;
        g += e_mapped * lg;
        b += e_mapped * lb;
    }
    if total == 0.0 {
        return (0.0, 0.0, 0.0, 0.0);
    }

    // Normalise colour so it does NOT desaturate when total is high.
    r /= total;
    g /= total;
    b /= total;

    // Boost saturation (linear RGB) to combat greying from multi-hue blend.
    let mean = (r + g + b) / 3.0;
    let sat_boost = 1.8; // ≥1 for more vivid hues
    r = mean + (r - mean) * sat_boost;
    g = mean + (g - mean) * sat_boost;
    b = mean + (b - mean) * sat_boost;

    // Clamp after saturation boost
    r = r.clamp(0.0, 1.0);
    g = g.clamp(0.0, 1.0);
    b = b.clamp(0.0, 1.0);

    // Compress brightness with simple tone curve to preserve detail.
    let brightness = 1.0 - (-total).exp(); // asymptotes at 1.0, smooth increase
    (r * brightness, g * brightness, b * brightness, brightness)
}
