//! Line drawing, plot functions, and primitive rendering

use super::color::OklabColor;
use crate::{spectral_constants, spectrum::NUM_BINS, utils::{build_gaussian_kernel, is_zero}};
use spectral_constants::{LAMBDA_START, LAMBDA_END};
use rayon::prelude::*;
use smallvec::SmallVec;
use std::sync::atomic::{AtomicBool, Ordering};

pub static DISPERSION_BOOST_ENABLED: AtomicBool = AtomicBool::new(true);

/// Convert OkLab hue to wavelength with perceptually uniform distribution.
/// 
/// This mapping ensures that the full visible spectrum (380-700nm) is utilized,
/// providing rich color diversity across blues, greens, yellows, oranges, and reds.
/// 
/// The mapping is designed to align with perceptual color relationships:
/// - Red hues (around 0°) map to long wavelengths (650-700nm)
/// - Yellow hues (around 60°) map to yellow wavelengths (570-590nm)
/// - Green hues (around 120°) map to green wavelengths (510-550nm)
/// - Cyan hues (around 180°) map to cyan wavelengths (485-510nm)
/// - Blue hues (around 240°) map to blue wavelengths (450-485nm)
/// - Violet hues (around 300°) map to violet wavelengths (380-450nm)
#[inline]
pub(crate) fn oklab_hue_to_wavelength(a: f64, b: f64) -> f64 {
    // Calculate hue angle in radians (-π to +π)
    let hue_rad = b.atan2(a);
    
    // Convert to degrees (0 to 360)
    let mut hue_deg = hue_rad.to_degrees();
    if hue_deg < 0.0 {
        hue_deg += 360.0;
    }
    
    // Map hue to wavelength using a perceptually uniform distribution
    // This mapping is designed to maximize color variety and align with
    // the natural color spectrum while accounting for OkLab's hue distribution
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
        // Create smooth transition back to red
        380.0 + ((hue_deg - 330.0) / 30.0) * 320.0
    };
    
    // Ensure wavelength is within valid bounds
    wavelength.clamp(LAMBDA_START, LAMBDA_END)
}

/// Gaussian blur context for efficient blurring with reusable temp buffer
pub(crate) struct GaussianBlurContext {
    kernel: SmallVec<[f64; 32]>,
    radius: usize,
    temp_buffer: Vec<(f64, f64, f64, f64)>,
}

impl GaussianBlurContext {
    fn new(radius: usize, buffer_size: usize) -> Self {
        let kernel = build_gaussian_kernel(radius);
        let kernel_len = kernel.len();
        let mut small_kernel = SmallVec::with_capacity(kernel_len);
        small_kernel.extend_from_slice(&kernel);
        Self { 
            kernel: small_kernel, 
            radius,
            temp_buffer: vec![(0.0, 0.0, 0.0, 0.0); buffer_size],
        }
    }
    
    /// Ensure temp buffer has correct capacity
    fn ensure_capacity(&mut self, size: usize) {
        if self.temp_buffer.len() != size {
            self.temp_buffer.resize(size, (0.0, 0.0, 0.0, 0.0));
        }
    }
}

/// Apply 2D Gaussian blur to RGBA buffer in parallel
pub fn parallel_blur_2d_rgba(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    radius: usize,
) {
    if radius == 0 {
        return;
    }

    let mut blur_ctx = GaussianBlurContext::new(radius, buffer.len());

    // Horizontal pass (reuse pre-allocated temp buffer)
    blur_ctx.ensure_capacity(buffer.len());
    blur_ctx.temp_buffer.par_chunks_mut(width).enumerate().for_each(|(y, row)| {
        #[allow(clippy::needless_range_loop)] // Direct indexing for performance
        for x in 0..width {
            let mut sum = (0.0, 0.0, 0.0, 0.0);

            for (i, &k) in blur_ctx.kernel.iter().enumerate() {
                let src_x = (x as i32 + i as i32 - blur_ctx.radius as i32)
                    .clamp(0, width as i32 - 1) as usize;
                let pixel = buffer[y * width + src_x];
                sum.0 += pixel.0 * k;
                sum.1 += pixel.1 * k;
                sum.2 += pixel.2 * k;
                sum.3 += pixel.3 * k;
            }

            row[x] = sum;
        }
    });

    // Vertical pass
    buffer.par_chunks_mut(width).enumerate().for_each(|(y, row)| {
        #[allow(clippy::needless_range_loop)] // Direct indexing for performance
        for x in 0..width {
            let mut sum = (0.0, 0.0, 0.0, 0.0);

            for (i, &k) in blur_ctx.kernel.iter().enumerate() {
                let src_y = (y as i32 + i as i32 - blur_ctx.radius as i32)
                    .clamp(0, height as i32 - 1) as usize;
                let pixel = blur_ctx.temp_buffer[src_y * width + x];
                sum.0 += pixel.0 * k;
                sum.1 += pixel.1 * k;
                sum.2 += pixel.2 * k;
                sum.3 += pixel.3 * k;
            }

            row[x] = sum;
        }
    });
}

// Integer part of x
#[inline]
fn ipart(x: f32) -> i32 {
    x.floor() as i32
}

// Fractional part of x
#[inline]
fn fpart(x: f32) -> f32 {
    x - x.floor()
}

// Remaining fractional part of x
#[inline]
fn rfpart(x: f32) -> f32 {
    1.0 - fpart(x)
}

/// Linear interpolation
#[inline]
fn lerp(a: f64, b: f64, t: f32) -> f64 {
    a + (b - a) * t as f64
}

/// Plot a spectral pixel with anti-aliasing coverage
#[allow(clippy::too_many_arguments)] // Low-level pixel plotting requires all parameters
fn plot_spec(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    coverage: f32,    // AA coverage 0..1
    bin_left: usize,  // first wavelength bin
    bin_right: usize, // second bin (may equal left)
    w_right: f64,     // weight for right bin (0..1)
    base_alpha: f64,  // base opacity for the line segment
    hdr_scale: f64,
) {
    if x < 0 || x >= width as i32 || y < 0 || y >= height as i32 {
        return;
    }

    // Helper to deposit energy into a bin
    fn deposit(
        accum: &mut [[f64; NUM_BINS]],
        width: u32,
        height: u32,
        xi: i32,
        yi: i32,
        energy: f64,
        bin: usize,
    ) {
        if xi >= 0 && xi < width as i32 && yi >= 0 && yi < height as i32 {
            let idx = yi as usize * width as usize + xi as usize;
            accum[idx][bin] += energy;
        }
    }

    let alpha = coverage as f64 * base_alpha;
    let energy = alpha * hdr_scale;

    // Deposit energy in appropriate bins
    if bin_right == bin_left {
        // Single bin case
        deposit(accum, width, height, x, y, energy, bin_left);
    } else {
        // Interpolate between two bins
        let e_left = energy * (1.0 - w_right);
        let e_right = energy * w_right;
        deposit(accum, width, height, x, y, e_left, bin_left);
        deposit(accum, width, height, x, y, e_right, bin_right);
    }
}

/// Draw anti-aliased line segment for spectral rendering with optional dispersion
#[allow(clippy::too_many_arguments)] // Low-level drawing primitive requires all parameters
pub fn draw_line_segment_aa_spectral_with_dispersion(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    col0: OklabColor,
    col1: OklabColor,
    alpha0: f64,
    alpha1: f64,
    hdr_scale: f64,
    enable_dispersion: bool,
) {
    // If dispersion is disabled, use the original single-pass rendering
    if !enable_dispersion {
        draw_line_segment_aa_spectral_internal(
            accum, width, height, x0, y0, x1, y1, col0, col1, alpha0, alpha1, hdr_scale,
        );
        return;
    }

    // With dispersion enabled, we draw the line multiple times with wavelength-dependent offsets
    // Calculate perpendicular direction for dispersion
    let dx = x1 - x0;
    let dy = y1 - y0;
    let len = (dx * dx + dy * dy).sqrt();
    
    if len < 0.001 {
        // Line too short, just draw normally
        draw_line_segment_aa_spectral_internal(
            accum, width, height, x0, y0, x1, y1, col0, col1, alpha0, alpha1, hdr_scale,
        );
        return;
    }
    
    // Perpendicular unit vector (rotated 90 degrees)
    let perp_x = -dy / len;
    let perp_y = dx / len;
    
    // Convert colors to wavelengths to find the center bins
    let (_l0, a0, b0) = col0;
    let (_l1, a1, b1) = col1;
    let wavelength0 = oklab_hue_to_wavelength(a0, b0);
    let wavelength1 = oklab_hue_to_wavelength(a1, b1);
    
    let center_bin0 = ((wavelength0 - LAMBDA_START) / spectral_constants::BIN_WIDTH).round() as isize;
    let center_bin1 = ((wavelength1 - LAMBDA_START) / spectral_constants::BIN_WIDTH).round() as isize;
    
    use crate::render::constants::{SPECTRAL_DISPERSION_BINS, SPECTRAL_DISPERSION_STRENGTH, SPECTRAL_DISPERSION_STRENGTH_BOOSTED};
    let dispersion_strength = if DISPERSION_BOOST_ENABLED.load(Ordering::Relaxed) {
        SPECTRAL_DISPERSION_STRENGTH_BOOSTED
    } else {
        SPECTRAL_DISPERSION_STRENGTH
    };
    let dispersion_range = SPECTRAL_DISPERSION_BINS as isize;
    
    // Draw multiple passes, one for each wavelength bin with spatial offset
    for bin_offset in -dispersion_range..=dispersion_range {
        // Calculate offset distance based on bin offset (creates rainbow spread)
        let offset_dist = bin_offset as f32 * dispersion_strength as f32;
        
        // Offset the line perpendicular to its direction
        let offset_x = perp_x * offset_dist;
        let offset_y = perp_y * offset_dist;
        
        // Create modified wavelengths for this dispersed pass
        let bin0 = (center_bin0 + bin_offset).clamp(0, (NUM_BINS - 1) as isize) as usize;
        let bin1 = (center_bin1 + bin_offset).clamp(0, (NUM_BINS - 1) as isize) as usize;
        
        // Convert bins back to wavelengths
        let disp_wavelength0 = spectral_constants::bin_to_wavelength(bin0);
        let disp_wavelength1 = spectral_constants::bin_to_wavelength(bin1);
        
        // Create new colors by preserving lightness but using dispersed wavelengths
        // We reconstruct OkLab from wavelength (approximate reverse)
        let disp_col0 = wavelength_to_oklab(disp_wavelength0, col0.0);
        let disp_col1 = wavelength_to_oklab(disp_wavelength1, col1.0);
        
        // Reduce alpha for dispersed copies to maintain total energy
        let dispersion_alpha_factor = 1.0 / (2.0 * dispersion_range as f64 + 1.0);
        
        // Draw the offset line
        draw_line_segment_aa_spectral_internal(
            accum,
            width,
            height,
            x0 + offset_x,
            y0 + offset_y,
            x1 + offset_x,
            y1 + offset_y,
            disp_col0,
            disp_col1,
            alpha0 * dispersion_alpha_factor,
            alpha1 * dispersion_alpha_factor,
            hdr_scale,
        );
    }
}

/// Helper to convert wavelength back to approximate OkLab (preserving lightness)
#[inline]
fn wavelength_to_oklab(wavelength: f64, lightness: f64) -> OklabColor {
    // Map wavelength to hue angle (reverse of oklab_hue_to_wavelength, approximate)
    let hue_deg = if wavelength >= 650.0 {
        // Red region: 650-700nm -> 0-30°
        (700.0 - wavelength) / 50.0 * 30.0
    } else if wavelength >= 620.0 {
        // Orange region: 620-650nm -> 30-60°
        30.0 + (650.0 - wavelength) / 30.0 * 30.0
    } else if wavelength >= 570.0 {
        // Yellow region: 570-620nm -> 60-90°
        60.0 + (620.0 - wavelength) / 50.0 * 30.0
    } else if wavelength >= 510.0 {
        // Green region: 510-570nm -> 90-150°
        90.0 + (570.0 - wavelength) / 60.0 * 60.0
    } else if wavelength >= 485.0 {
        // Cyan region: 485-510nm -> 150-210°
        150.0 + (510.0 - wavelength) / 25.0 * 60.0
    } else if wavelength >= 450.0 {
        // Blue region: 450-485nm -> 210-270°
        210.0 + (485.0 - wavelength) / 35.0 * 60.0
    } else {
        // Violet region: 380-450nm -> 270-330°
        270.0 + (450.0 - wavelength) / 70.0 * 60.0
    };
    
    // Convert hue angle to OkLab a,b components
    let hue_rad = hue_deg.to_radians();
    let chroma = 0.15; // Fixed moderate chroma for dispersion
    let a = chroma * hue_rad.cos();
    let b = chroma * hue_rad.sin();
    
    (lightness, a, b)
}

/// Internal implementation of spectral line drawing (original logic)
#[allow(clippy::too_many_arguments)] // Low-level drawing primitive requires all parameters
fn draw_line_segment_aa_spectral_internal(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    mut x0: f32,
    mut y0: f32,
    mut x1: f32,
    mut y1: f32,
    mut col0: OklabColor,
    mut col1: OklabColor,
    mut alpha0: f64,
    mut alpha1: f64,
    hdr_scale: f64,
) {
    let dx = (x1 - x0).abs();
    let dy = (y1 - y0).abs();

    // Wu's algorithm works best for non-steep lines
    let steep = dy > dx;

    if steep {
        // Swap x and y coordinates
        (x0, y0) = (y0, x0);
        (x1, y1) = (y1, x1);
    }

    if x0 > x1 {
        // Swap endpoints
        (x0, x1) = (x1, x0);
        (y0, y1) = (y1, y0);
        // Also swap colors and alphas
        std::mem::swap(&mut col0, &mut col1);
        std::mem::swap(&mut alpha0, &mut alpha1);
    }

    let dx = x1 - x0;
    let dy = y1 - y0;
    let gradient = if is_zero(dx as f64) { 1.0 } else { dy / dx };

    // Convert OkLab colors to wavelengths using perceptually uniform mapping
    let (_l0, a0, b0) = col0;
    let (_l1, a1, b1) = col1;
    
    // Map OkLab hue to wavelength with full spectrum coverage
    let wavelength0 = oklab_hue_to_wavelength(a0, b0);
    let wavelength1 = oklab_hue_to_wavelength(a1, b1);
    
    // Convert wavelengths to fractional bin positions
    let bin0_f = spectral_constants::wavelength_to_bin(wavelength0);
    let bin1_f = spectral_constants::wavelength_to_bin(wavelength1);

    // First endpoint
    let xend = x0.round();
    let yend = y0 + gradient * (xend - x0);
    let xgap = rfpart(x0 + 0.5);
    let xpxl1 = xend as i32;
    let ypxl1 = ipart(yend);

    // Calculate bins for first endpoint with safe bounds checking
    let bin0_left = (bin0_f.floor() as usize).min(NUM_BINS - 1);
    let bin0_right = (bin0_left + 1).min(NUM_BINS - 1);
    let w0_right = bin0_f.fract();

    if steep {
        plot_spec(
            accum,
            width,
            height,
            ypxl1,
            xpxl1,
            rfpart(yend) * xgap,
            bin0_left,
            bin0_right,
            w0_right,
            alpha0,
            hdr_scale,
        );
        plot_spec(
            accum,
            width,
            height,
            ypxl1 + 1,
            xpxl1,
            fpart(yend) * xgap,
            bin0_left,
            bin0_right,
            w0_right,
            alpha0,
            hdr_scale,
        );
    } else {
        plot_spec(
            accum,
            width,
            height,
            xpxl1,
            ypxl1,
            rfpart(yend) * xgap,
            bin0_left,
            bin0_right,
            w0_right,
            alpha0,
            hdr_scale,
        );
        plot_spec(
            accum,
            width,
            height,
            xpxl1,
            ypxl1 + 1,
            fpart(yend) * xgap,
            bin0_left,
            bin0_right,
            w0_right,
            alpha0,
            hdr_scale,
        );
    }

    let mut intery = yend + gradient;

    // Second endpoint
    let xend = x1.round();
    let yend = y1 + gradient * (xend - x1);
    let xgap = fpart(x1 + 0.5);
    let xpxl2 = xend as i32;
    let ypxl2 = ipart(yend);

    // Calculate bins for second endpoint with safe bounds checking
    let bin1_left = (bin1_f.floor() as usize).min(NUM_BINS - 1);
    let bin1_right = (bin1_left + 1).min(NUM_BINS - 1);
    let w1_right = bin1_f.fract();

    if steep {
        plot_spec(
            accum,
            width,
            height,
            ypxl2,
            xpxl2,
            rfpart(yend) * xgap,
            bin1_left,
            bin1_right,
            w1_right,
            alpha1,
            hdr_scale,
        );
        plot_spec(
            accum,
            width,
            height,
            ypxl2 + 1,
            xpxl2,
            fpart(yend) * xgap,
            bin1_left,
            bin1_right,
            w1_right,
            alpha1,
            hdr_scale,
        );
    } else {
        plot_spec(
            accum,
            width,
            height,
            xpxl2,
            ypxl2,
            rfpart(yend) * xgap,
            bin1_left,
            bin1_right,
            w1_right,
            alpha1,
            hdr_scale,
        );
        plot_spec(
            accum,
            width,
            height,
            xpxl2,
            ypxl2 + 1,
            fpart(yend) * xgap,
            bin1_left,
            bin1_right,
            w1_right,
            alpha1,
            hdr_scale,
        );
    }

    // Draw line between endpoints
    let total_pixels = (xpxl2 - xpxl1 - 1).max(0);
    if total_pixels > 0 {
        for x in (xpxl1 + 1)..xpxl2 {
            // Calculate interpolation parameter
            let t = (x - xpxl1) as f32 / (xpxl2 - xpxl1) as f32;

            // Interpolate alpha
            let alpha = lerp(alpha0, alpha1, t);

            // Interpolate bin position with safe bounds
            let bin_f = lerp(bin0_f, bin1_f, t);
            let bin_left = (bin_f.floor() as usize).min(NUM_BINS - 1);
            let bin_right = (bin_left + 1).min(NUM_BINS - 1);
            let w_right = bin_f.fract();

            let y = ipart(intery);

            if steep {
                plot_spec(
                    accum,
                    width,
                    height,
                    y,
                    x,
                    rfpart(intery),
                    bin_left,
                    bin_right,
                    w_right,
                    alpha,
                    hdr_scale,
                );
                plot_spec(
                    accum,
                    width,
                    height,
                    y + 1,
                    x,
                    fpart(intery),
                    bin_left,
                    bin_right,
                    w_right,
                    alpha,
                    hdr_scale,
                );
            } else {
                plot_spec(
                    accum,
                    width,
                    height,
                    x,
                    y,
                    rfpart(intery),
                    bin_left,
                    bin_right,
                    w_right,
                    alpha,
                    hdr_scale,
                );
                plot_spec(
                    accum,
                    width,
                    height,
                    x,
                    y + 1,
                    fpart(intery),
                    bin_left,
                    bin_right,
                    w_right,
                    alpha,
                    hdr_scale,
                );
            }

            intery += gradient;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dispersion_boost_default_enabled() {
        assert!(DISPERSION_BOOST_ENABLED.load(Ordering::Relaxed),
            "dispersion boost should be enabled by default");
    }

    #[test]
    fn test_oklab_hue_to_wavelength_range() {
        for deg in (0..360).step_by(10) {
            let rad = (deg as f64).to_radians();
            let a = 0.15 * rad.cos();
            let b = 0.15 * rad.sin();
            let wl = oklab_hue_to_wavelength(a, b);
            assert!(wl >= 380.0 && wl <= 700.0,
                "hue {deg}\u{00b0} -> wavelength {wl} out of visible range");
        }
    }

    #[test]
    fn test_wavelength_to_oklab_roundtrip() {
        let wl = 620.0;
        let (l, a, b) = wavelength_to_oklab(wl, 0.7);
        assert!(l > 0.0, "lightness should be positive");
        let chroma = (a * a + b * b).sqrt();
        assert!(chroma > 0.0, "wavelength {wl} should produce colored output");
    }

    #[test]
    fn test_wavelength_to_oklab_endpoints() {
        let blue = wavelength_to_oklab(420.0, 0.7);
        let red = wavelength_to_oklab(650.0, 0.7);
        assert!(blue.0 > 0.0, "blue lightness should be positive");
        assert!(red.0 > 0.0, "red lightness should be positive");
    }
}
