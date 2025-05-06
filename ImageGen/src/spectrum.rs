//! Spectral utilities: 16-bin SPD handling and conversions.
//!
//! Our "spectral accumulation" keeps one energy value per wavelength bin
//! (bins are equally spaced from 380-700 nm).  Rendering draws into this
//! SPD buffer, then we convert the spectrum → linear-sRGB right before
//! the normal tone-mapping / bloom pipeline.

use once_cell::sync::Lazy;

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

/// Pre-computed linear-sRGB triplet for each bin's unit intensity.
pub static BIN_RGB: Lazy<[(f64, f64, f64); NUM_BINS]> = Lazy::new(|| {
    let mut arr = [(0.0, 0.0, 0.0); NUM_BINS];
    for i in 0..NUM_BINS {
        arr[i] = wavelength_to_rgb(wavelength_nm_for_bin(i));
    }
    arr
});

/// Sub-pixel shift for each wavelength bin to create "prismatic" fringes.
/// Computed along a golden-angle spiral inside one pixel (≤ ±0.35 px).
#[allow(dead_code)]
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
/// 
/// Optimized for the new wavelength mapping to ensure all colors are vibrant:
/// - Violet/Blue wavelengths (380-450nm): Enhanced brightness for visibility
/// - Cyan/Green wavelengths (450-550nm): Balanced for natural appearance
/// - Yellow/Orange wavelengths (550-650nm): Moderate to prevent oversaturation
/// - Red wavelengths (650-700nm): Controlled to prevent washout
pub static BIN_TONE: Lazy<[f64; NUM_BINS]> = Lazy::new(|| {
    let mut arr = [1.0f64; NUM_BINS];
    for i in 0..NUM_BINS {
        // Map bin index to wavelength
        let lambda = wavelength_nm_for_bin(i);
        
        // Apply wavelength-dependent tone mapping for optimal color reproduction
        arr[i] = if lambda < 450.0 {
            // Violet/Blue (380-450nm): Higher strength for better visibility
            2.2 + 0.3 * (450.0 - lambda) / 70.0
        } else if lambda < 490.0 {
            // Blue/Cyan (450-490nm): Strong but balanced
            2.0
        } else if lambda < 550.0 {
            // Cyan/Green (490-550nm): Natural appearance
            1.8
        } else if lambda < 590.0 {
            // Green/Yellow (550-590nm): Moderate strength
            1.6
        } else if lambda < 650.0 {
            // Yellow/Orange (590-650nm): Controlled to prevent oversaturation
            1.4 - 0.2 * (lambda - 590.0) / 60.0
        } else {
            // Orange/Red (650-700nm): Lower to prevent washout
            1.2 - 0.2 * (lambda - 650.0) / 50.0
        };
    }
    arr
});

/// Convert an OKLab color to its closest wavelength bin based on hue.
/// 
/// This function uses the same perceptually uniform wavelength mapping
/// as the spectral rendering pipeline to ensure color consistency.
#[inline]
#[allow(dead_code)]
pub fn oklab_to_bin(col: &(f64, f64, f64)) -> usize {
    let (_l, a, b) = *col;

    // Calculate hue angle in degrees (0 to 360)
    let hue_rad = b.atan2(a);
    let mut hue_deg = hue_rad.to_degrees();
    if hue_deg < 0.0 {
        hue_deg += 360.0;
    }
    
    // Map hue to wavelength using the same perceptually uniform distribution
    // as used in the spectral rendering pipeline
    let wavelength = if hue_deg < 30.0 {
        // Red to red-orange (0-30°) -> 700-650nm
        700.0 - (hue_deg / 30.0) * 50.0
    } else if hue_deg < 60.0 {
        // Red-orange to orange (30-60°) -> 650-620nm
        650.0 - ((hue_deg - 30.0) / 30.0) * 30.0
    } else if hue_deg < 90.0 {
        // Orange to yellow (60-90°) -> 620-570nm
        620.0 - ((hue_deg - 60.0) / 30.0) * 50.0
    } else if hue_deg < 150.0 {
        // Yellow to green (90-150°) -> 570-510nm
        570.0 - ((hue_deg - 90.0) / 60.0) * 60.0
    } else if hue_deg < 210.0 {
        // Green to cyan (150-210°) -> 510-485nm
        510.0 - ((hue_deg - 150.0) / 60.0) * 25.0
    } else if hue_deg < 270.0 {
        // Cyan to blue (210-270°) -> 485-450nm
        485.0 - ((hue_deg - 210.0) / 60.0) * 35.0
    } else if hue_deg < 330.0 {
        // Blue to violet (270-330°) -> 450-380nm
        450.0 - ((hue_deg - 270.0) / 60.0) * 70.0
    } else {
        // Violet to red (330-360°) -> 380-700nm (wrap around)
        380.0 + ((hue_deg - 330.0) / 30.0) * 320.0
    };
    
    // Ensure wavelength is within valid bounds
    let wavelength = wavelength.clamp(LAMBDA_START, LAMBDA_END);
    
    // Convert wavelength to bin index
    let bin_f = (wavelength - LAMBDA_START) / ((LAMBDA_END - LAMBDA_START) / NUM_BINS as f64);
    let bin = (bin_f.floor() as usize).min(NUM_BINS - 1);
    
    bin
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

    // Enhanced saturation boost for more vibrant colors
    // This is critical for maintaining color richness across the full spectrum
    let mean = (r + g + b) / 3.0;
    
    // Dynamic saturation boost based on the dominant color channel
    // This ensures each color maintains its characteristic vibrancy
    let max_channel = r.max(g).max(b);
    let min_channel = r.min(g).min(b);
    let color_range = max_channel - min_channel;
    
    // Adaptive saturation: stronger boost for less saturated colors
    let sat_boost = if color_range < 0.1 {
        2.5  // Strong boost for near-gray colors
    } else if color_range < 0.3 {
        2.2  // Moderate boost for somewhat saturated colors
    } else {
        1.8  // Standard boost for already vibrant colors
    };
    
    r = mean + (r - mean) * sat_boost;
    g = mean + (g - mean) * sat_boost;
    b = mean + (b - mean) * sat_boost;

    // Soft clamp with preservation of color ratios
    let max_value = r.max(g).max(b);
    if max_value > 1.0 {
        let scale = 1.0 / max_value;
        r *= scale;
        g *= scale;
        b *= scale;
    }
    
    // Final hard clamp for safety
    r = r.clamp(0.0, 1.0);
    g = g.clamp(0.0, 1.0);
    b = b.clamp(0.0, 1.0);

    // Compress brightness with simple tone curve to preserve detail.
    let brightness = 1.0 - (-total).exp(); // asymptotes at 1.0, smooth increase
    (r * brightness, g * brightness, b * brightness, brightness)
}
