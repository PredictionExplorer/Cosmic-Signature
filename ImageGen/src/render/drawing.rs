//! Line drawing and primitive rendering

use crate::oklab;
use crate::render::{color::OklabColor, context::PlotContext};
use crate::spectrum::NUM_BINS;
use log::trace;

/// Compute the integer part of a floating point number
#[inline]
fn ipart(x: f32) -> i32 {
    x.floor() as i32
}

/// Compute the fractional part of a floating point number
#[inline]
fn fpart(x: f32) -> f32 {
    x - x.floor()
}

/// Compute the reverse fractional part
#[inline]
fn rfpart(x: f32) -> f32 {
    1.0 - fpart(x)
}

/// Plot a single pixel with antialiasing coverage
#[inline]
#[allow(dead_code)]
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
    // Early bounds check
    if x < 0 || x >= ctx.width_i32 || y < 0 || y >= ctx.height_i32 {
        return;
    }

    // Convert OKLab to linear RGB
    let rgb = oklab::oklab_to_linear_srgb(color_l, color_a, color_b);
    
    // Compute source alpha (coverage * base alpha * HDR scale)
    let src_alpha = alpha as f64 * base_alpha * hdr_scale;

    // Single index calculation
    let idx = (y as usize * ctx.width_usize) + x as usize;
    
    // Get destination pixel
    let dst = &mut accum[idx];

    // Premultiplied alpha compositing
    // Source is already premultiplied (rgb * src_alpha)
    // Destination is premultiplied
    // Result = Src + Dst * (1 - SrcAlpha)
    dst.0 += rgb.0 * src_alpha;
    dst.1 += rgb.1 * src_alpha;
    dst.2 += rgb.2 * src_alpha;
    dst.3 += src_alpha;
}

/// Draw an anti-aliased line segment with varying alpha and color
///
/// Uses Xiaolin Wu's line algorithm for anti-aliasing
#[allow(dead_code)]
pub fn draw_line_segment_aa_alpha(
    accum: &mut [(f64, f64, f64, f64)],
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
    trace!("Drawing line from ({:.2}, {:.2}) to ({:.2}, {:.2})", x0, y0, x1, y1);
    
    let ctx = PlotContext::new(width, height);
    
    let dx = (x1 - x0).abs();
    let dy = (y1 - y0).abs();
    
    let steep = dy > dx;
    
    if steep {
        std::mem::swap(&mut x0, &mut y0);
        std::mem::swap(&mut x1, &mut y1);
    }

    if x0 > x1 {
        std::mem::swap(&mut x0, &mut x1);
        std::mem::swap(&mut y0, &mut y1);
        // Also swap colors and alphas when swapping endpoints
        std::mem::swap(&mut col0, &mut col1);
        std::mem::swap(&mut alpha0, &mut alpha1);
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

    if steep {
        plot(accum, &ctx, ypxl1, xpxl1, rfpart(yend) * xgap, col0.0, col0.1, col0.2, alpha0, hdr_scale);
        plot(accum, &ctx, ypxl1 + 1, xpxl1, fpart(yend) * xgap, col0.0, col0.1, col0.2, alpha0, hdr_scale);
    } else {
        plot(accum, &ctx, xpxl1, ypxl1, rfpart(yend) * xgap, col0.0, col0.1, col0.2, alpha0, hdr_scale);
        plot(accum, &ctx, xpxl1, ypxl1 + 1, fpart(yend) * xgap, col0.0, col0.1, col0.2, alpha0, hdr_scale);
    }

    let mut intery = yend + gradient;

    // Handle second endpoint
    let xend = x1.round();
    let yend = y1 + gradient * (xend - x1);
    let xgap = fpart(x1 + 0.5);
    let xpxl2 = xend as i32;
    let ypxl2 = ipart(yend);

    if steep {
        plot(accum, &ctx, ypxl2, xpxl2, rfpart(yend) * xgap, col1.0, col1.1, col1.2, alpha1, hdr_scale);
        plot(accum, &ctx, ypxl2 + 1, xpxl2, fpart(yend) * xgap, col1.0, col1.1, col1.2, alpha1, hdr_scale);
    } else {
        plot(accum, &ctx, xpxl2, ypxl2, rfpart(yend) * xgap, col1.0, col1.1, col1.2, alpha1, hdr_scale);
        plot(accum, &ctx, xpxl2, ypxl2 + 1, fpart(yend) * xgap, col1.0, col1.1, col1.2, alpha1, hdr_scale);
    }

    // Draw the line between endpoints
    let total_dist = ((xpxl2 - xpxl1) as f32).abs();
    
    for x in (xpxl1 + 1)..xpxl2 {
        let t = if total_dist > 0.0 {
            ((x - xpxl1) as f32) / total_dist
        } else {
            0.0
        };
        
        let interp_color = (
            col0.0 + (col1.0 - col0.0) * t as f64,
            col0.1 + (col1.1 - col0.1) * t as f64,
            col0.2 + (col1.2 - col0.2) * t as f64,
        );
        let interp_alpha = alpha0 + (alpha1 - alpha0) * t as f64;
        
        if steep {
            plot(accum, &ctx, ipart(intery), x, rfpart(intery), 
                 interp_color.0, interp_color.1, interp_color.2, interp_alpha, hdr_scale);
            plot(accum, &ctx, ipart(intery) + 1, x, fpart(intery), 
                 interp_color.0, interp_color.1, interp_color.2, interp_alpha, hdr_scale);
        } else {
            plot(accum, &ctx, x, ipart(intery), rfpart(intery), 
                 interp_color.0, interp_color.1, interp_color.2, interp_alpha, hdr_scale);
            plot(accum, &ctx, x, ipart(intery) + 1, fpart(intery), 
                 interp_color.0, interp_color.1, interp_color.2, interp_alpha, hdr_scale);
        }
        intery += gradient;
    }
}

/// Linear interpolation helper
#[inline]
fn lerp(a: f64, b: f64, t: f32) -> f64 {
    a + (b - a) * t as f64
}

/// Plot a single pixel in spectral mode
#[inline]
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
    // Inner helper to deposit energy into a specific bin
    #[inline]
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
            let idx = (yi as usize) * (width as usize) + (xi as usize);
            accum[idx][bin] += energy;
        }
    }

    // Total energy to deposit
    let total_energy = coverage as f64 * base_alpha * hdr_scale;
    
    // Distribute energy between wavelength bins
    if bin_left == bin_right {
        // Single bin case
        deposit(accum, width, height, x, y, total_energy, bin_left);
    } else {
        // Split between two bins
        let w_left = 1.0 - w_right;
        deposit(accum, width, height, x, y, total_energy * w_left, bin_left);
        deposit(accum, width, height, x, y, total_energy * w_right, bin_right);
    }
}

/// Draw an anti-aliased line segment in spectral mode
///
/// Uses Xiaolin Wu's line algorithm with spectral decomposition
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
    trace!("Drawing spectral line from ({:.2}, {:.2}) to ({:.2}, {:.2})", x0, y0, x1, y1);
    
    let dx = (x1 - x0).abs();
    let dy = (y1 - y0).abs();
    
    let steep = dy > dx;
    
    if steep {
        std::mem::swap(&mut x0, &mut y0);
        std::mem::swap(&mut x1, &mut y1);
    }

    if x0 > x1 {
        std::mem::swap(&mut x0, &mut x1);
        std::mem::swap(&mut y0, &mut y1);
        // Also swap colors and alphas when swapping endpoints
        std::mem::swap(&mut col0, &mut col1);
        std::mem::swap(&mut alpha0, &mut alpha1);
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

    // Convert first endpoint color to wavelength bin
    let bin0 = crate::spectrum::oklab_to_bin(&col0);
    let bin0_left = bin0;
    let bin0_right = bin0;
    let w0_right = 0.0;  // No interpolation between bins for now

    if steep {
        plot_spec(accum, width, height, ypxl1, xpxl1, rfpart(yend) * xgap, 
                  bin0_left, bin0_right, w0_right, alpha0, hdr_scale);
        plot_spec(accum, width, height, ypxl1 + 1, xpxl1, fpart(yend) * xgap, 
                  bin0_left, bin0_right, w0_right, alpha0, hdr_scale);
    } else {
        plot_spec(accum, width, height, xpxl1, ypxl1, rfpart(yend) * xgap, 
                  bin0_left, bin0_right, w0_right, alpha0, hdr_scale);
        plot_spec(accum, width, height, xpxl1, ypxl1 + 1, fpart(yend) * xgap, 
                  bin0_left, bin0_right, w0_right, alpha0, hdr_scale);
    }

    let mut intery = yend + gradient;

    // Handle second endpoint
    let xend = x1.round();
    let yend = y1 + gradient * (xend - x1);
    let xgap = fpart(x1 + 0.5);
    let xpxl2 = xend as i32;
    let ypxl2 = ipart(yend);

    // Convert second endpoint color to wavelength bin
    let bin1 = crate::spectrum::oklab_to_bin(&col1);
    let bin1_left = bin1;
    let bin1_right = bin1;
    let w1_right = 0.0;  // No interpolation between bins for now

    if steep {
        plot_spec(accum, width, height, ypxl2, xpxl2, rfpart(yend) * xgap, 
                  bin1_left, bin1_right, w1_right, alpha1, hdr_scale);
        plot_spec(accum, width, height, ypxl2 + 1, xpxl2, fpart(yend) * xgap, 
                  bin1_left, bin1_right, w1_right, alpha1, hdr_scale);
    } else {
        plot_spec(accum, width, height, xpxl2, ypxl2, rfpart(yend) * xgap, 
                  bin1_left, bin1_right, w1_right, alpha1, hdr_scale);
        plot_spec(accum, width, height, xpxl2, ypxl2 + 1, fpart(yend) * xgap, 
                  bin1_left, bin1_right, w1_right, alpha1, hdr_scale);
    }

    // Draw the line between endpoints
    let total_dist = ((xpxl2 - xpxl1) as f32).abs();
    
    for x in (xpxl1 + 1)..xpxl2 {
        let t = if total_dist > 0.0 {
            ((x - xpxl1) as f32) / total_dist
        } else {
            0.0
        };
        
        // Interpolate bin indices
        let interp_bin_f = bin0 as f64 + (bin1 as f64 - bin0 as f64) * t as f64;
        let bin_left = interp_bin_f.floor() as usize;
        let bin_right = (bin_left + 1).min(NUM_BINS - 1);
        let w_right = interp_bin_f.fract();
        
        // Interpolate alpha
        let interp_alpha = lerp(alpha0, alpha1, t);
        
        if steep {
            plot_spec(accum, width, height, ipart(intery), x, rfpart(intery), 
                      bin_left, bin_right, w_right, interp_alpha, hdr_scale);
            plot_spec(accum, width, height, ipart(intery) + 1, x, fpart(intery), 
                      bin_left, bin_right, w_right, interp_alpha, hdr_scale);
        } else {
            plot_spec(accum, width, height, x, ipart(intery), rfpart(intery), 
                      bin_left, bin_right, w_right, interp_alpha, hdr_scale);
            plot_spec(accum, width, height, x, ipart(intery) + 1, fpart(intery), 
                      bin_left, bin_right, w_right, interp_alpha, hdr_scale);
        }
        intery += gradient;
    }
} 