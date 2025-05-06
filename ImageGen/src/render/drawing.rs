//! Line drawing, plot functions, and primitive rendering

use super::color::OklabColor;
use super::constants;
use crate::spectrum::NUM_BINS;
use crate::utils::build_gaussian_kernel;
use rayon::prelude::*;
use smallvec::SmallVec;

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
    const LAMBDA_START: f64 = 380.0;
    const LAMBDA_END: f64 = 700.0;
    
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

/// Gaussian blur context for efficient blurring
pub(crate) struct GaussianBlurContext {
    kernel: SmallVec<[f64; 32]>,
    radius: usize,
}

impl GaussianBlurContext {
    fn new(radius: usize) -> Self {
        let kernel = build_gaussian_kernel(radius);
        let kernel_len = kernel.len();
        let mut small_kernel = SmallVec::with_capacity(kernel_len);
        small_kernel.extend_from_slice(&kernel);
        Self { kernel: small_kernel, radius }
    }
}

/// Plot context for efficient pixel plotting
struct PlotContext {
    width_i32: i32,
    height_i32: i32,
    width_usize: usize,
}

impl PlotContext {
    #[inline]
    fn new(width: u32, height: u32) -> Self {
        Self { width_i32: width as i32, height_i32: height as i32, width_usize: width as usize }
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

    let blur_ctx = GaussianBlurContext::new(radius);

    // Horizontal pass
    let mut temp = vec![(0.0, 0.0, 0.0, 0.0); buffer.len()];
    temp.par_chunks_mut(width).enumerate().for_each(|(y, row)| {
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
        for x in 0..width {
            let mut sum = (0.0, 0.0, 0.0, 0.0);

            for (i, &k) in blur_ctx.kernel.iter().enumerate() {
                let src_y = (y as i32 + i as i32 - blur_ctx.radius as i32)
                    .clamp(0, height as i32 - 1) as usize;
                let pixel = temp[src_y * width + x];
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

/// Plot a single pixel with anti-aliasing coverage
fn plot(
    accum: &mut [(f64, f64, f64, f64)],
    ctx: &PlotContext,
    x: i32,
    y: i32,
    alpha: f32, // alpha here is the anti-aliasing coverage (0..1)
    color_l: f64,
    color_a: f64,
    color_b: f64,
    base_alpha: f64, // base_alpha is the line segment's alpha
    hdr_scale: f64,
) {
    // Fast bounds check
    if x < 0 || x >= ctx.width_i32 || y < 0 || y >= ctx.height_i32 {
        return;
    }

    // Early exit for low alpha
    let src_alpha = alpha as f64 * base_alpha * hdr_scale;
    if src_alpha < constants::ALPHA_THRESHOLD {
        return;
    }

    // Single index calculation
    let idx = y as usize * ctx.width_usize + x as usize;

    // Direct access (bounds already checked)
    let pixel = &mut accum[idx];

    // Optimized compositing with premultiplied alpha
    pixel.0 += color_l * src_alpha;
    pixel.1 += color_a * src_alpha;
    pixel.2 += color_b * src_alpha;
    pixel.3 += src_alpha;
}

/// Linear interpolation
#[inline]
fn lerp(a: f64, b: f64, t: f32) -> f64 {
    a + (b - a) * t as f64
}

/// Draw anti-aliased line segment with alpha using Wu's algorithm
pub fn draw_line_segment_aa_alpha(
    accum: &mut [(f64, f64, f64, f64)],
    width: u32,
    height: u32,
    mut x0: f32,
    mut y0: f32,
    mut x1: f32,
    mut y1: f32,
    col0: OklabColor,
    col1: OklabColor,
    alpha0: f64,
    alpha1: f64,
    hdr_scale: f64,
) {
    let ctx = PlotContext::new(width, height);

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
    }

    let dx = x1 - x0;
    let dy = y1 - y0;
    let gradient = if dx == 0.0 { 1.0 } else { dy / dx };

    // Handle first endpoint
    let xend = x0.round();
    let yend = y0 + gradient * (xend - x0);
    let xgap = rfpart(x0 + 0.5);
    let xpxl1 = xend as i32;
    let ypxl1 = ipart(yend);

    // Plot first endpoint pixels
    let (l0, a0, b0) = col0;
    if steep {
        plot(&mut *accum, &ctx, ypxl1, xpxl1, rfpart(yend) * xgap, l0, a0, b0, alpha0, hdr_scale);
        plot(
            &mut *accum,
            &ctx,
            ypxl1 + 1,
            xpxl1,
            fpart(yend) * xgap,
            l0,
            a0,
            b0,
            alpha0,
            hdr_scale,
        );
    } else {
        plot(&mut *accum, &ctx, xpxl1, ypxl1, rfpart(yend) * xgap, l0, a0, b0, alpha0, hdr_scale);
        plot(
            &mut *accum,
            &ctx,
            xpxl1,
            ypxl1 + 1,
            fpart(yend) * xgap,
            l0,
            a0,
            b0,
            alpha0,
            hdr_scale,
        );
    }

    let mut intery = yend + gradient;

    // Handle second endpoint
    let xend = x1.round();
    let yend = y1 + gradient * (xend - x1);
    let xgap = fpart(x1 + 0.5);
    let xpxl2 = xend as i32;
    let ypxl2 = ipart(yend);

    // Plot second endpoint pixels
    let (l1, a1, b1) = col1;
    if steep {
        plot(&mut *accum, &ctx, ypxl2, xpxl2, rfpart(yend) * xgap, l1, a1, b1, alpha1, hdr_scale);
        plot(
            &mut *accum,
            &ctx,
            ypxl2 + 1,
            xpxl2,
            fpart(yend) * xgap,
            l1,
            a1,
            b1,
            alpha1,
            hdr_scale,
        );
    } else {
        plot(&mut *accum, &ctx, xpxl2, ypxl2, rfpart(yend) * xgap, l1, a1, b1, alpha1, hdr_scale);
        plot(
            &mut *accum,
            &ctx,
            xpxl2,
            ypxl2 + 1,
            fpart(yend) * xgap,
            l1,
            a1,
            b1,
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

            // Interpolate color
            let l = lerp(l0, l1, t);
            let a = lerp(a0, a1, t);
            let b = lerp(b0, b1, t);
            let alpha = lerp(alpha0, alpha1, t);

            let y = ipart(intery);
            let frac = fpart(intery);

            if steep {
                plot(&mut *accum, &ctx, y, x, rfpart(intery), l, a, b, alpha, hdr_scale);
                plot(&mut *accum, &ctx, y + 1, x, frac, l, a, b, alpha, hdr_scale);
            } else {
                plot(&mut *accum, &ctx, x, y, rfpart(intery), l, a, b, alpha, hdr_scale);
                plot(&mut *accum, &ctx, x, y + 1, frac, l, a, b, alpha, hdr_scale);
            }

            intery += gradient;
        }
    }
}

/// Plot a spectral pixel with anti-aliasing coverage
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

/// Draw anti-aliased line segment for spectral rendering
pub fn draw_line_segment_aa_spectral(
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
    let gradient = if dx == 0.0 { 1.0 } else { dy / dx };

    // Convert OkLab colors to wavelengths using perceptually uniform mapping
    let (_l0, a0, b0) = col0;
    let (_l1, a1, b1) = col1;
    
    // Map OkLab hue to wavelength with full spectrum coverage
    let wavelength0 = oklab_hue_to_wavelength(a0, b0);
    let wavelength1 = oklab_hue_to_wavelength(a1, b1);
    
    // Constants for wavelength to bin conversion
    const LAMBDA_START: f64 = 380.0;
    const LAMBDA_END: f64 = 700.0;
    const LAMBDA_RANGE: f64 = LAMBDA_END - LAMBDA_START;
    const BIN_WIDTH: f64 = LAMBDA_RANGE / NUM_BINS as f64;
    
    // Convert wavelengths to fractional bin positions
    // These are guaranteed to be within [0, NUM_BINS-1] due to wavelength clamping
    let bin0_f = ((wavelength0 - LAMBDA_START) / BIN_WIDTH).clamp(0.0, (NUM_BINS - 1) as f64);
    let bin1_f = ((wavelength1 - LAMBDA_START) / BIN_WIDTH).clamp(0.0, (NUM_BINS - 1) as f64);

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
