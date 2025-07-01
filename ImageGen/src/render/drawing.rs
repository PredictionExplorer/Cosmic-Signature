//! Line drawing and primitive rendering

use crate::oklab;
use crate::render::{color::OklabColor, context::PlotContext};
use crate::spectrum::NUM_BINS;
use log::trace;

/// Parameters for plotting a single pixel
pub struct PlotParams {
    pub x: i32,
    pub y: i32,
    pub coverage: f32,
    pub color: OklabColor,
    pub alpha: f64,
    pub hdr_scale: f64,
}

/// Parameters for drawing a line segment
pub struct LineParams {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub col0: OklabColor,
    pub col1: OklabColor,
    pub alpha0: f64,
    pub alpha1: f64,
    pub hdr_scale: f64,
}

/// Parameters for plotting a single pixel in spectral mode
struct SpectralPlotParams {
    x: i32,
    y: i32,
    coverage: f32,
    bin_left: usize,
    bin_right: usize,
    w_right: f64,
    base_alpha: f64,
    hdr_scale: f64,
}

/// Parameters for drawing a line segment in spectral mode
pub struct SpectralLineParams {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub col0: OklabColor,
    pub col1: OklabColor,
    pub alpha0: f64,
    pub alpha1: f64,
    pub hdr_scale: f64,
}

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

/// Plot a single pixel with anti-aliasing coverage
fn plot(
    accum: &mut [(f64, f64, f64, f64)],
    ctx: &PlotContext,
    params: &PlotParams,
) {
    // Early bounds check
    if params.x < 0 || params.x >= ctx.width_i32 || params.y < 0 || params.y >= ctx.height_i32 {
        return;
    }

    // Convert OKLab to linear RGB
    let rgb = oklab::oklab_to_linear_srgb(params.color.0, params.color.1, params.color.2);
    
    // Compute source alpha (coverage * base alpha * HDR scale)
    let src_alpha = params.coverage as f64 * params.alpha * params.hdr_scale;

    // Single index calculation
    let idx = (params.y as usize * ctx.width_usize) + params.x as usize;
    
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
pub fn draw_line_segment_aa_alpha(
    accum: &mut [(f64, f64, f64, f64)],
    width: u32,
    height: u32,
    params: LineParams,
) {
    trace!("Drawing line from ({:.2}, {:.2}) to ({:.2}, {:.2})", params.x0, params.y0, params.x1, params.y1);
    
    let ctx = PlotContext::new(width, height);
    
    let mut x0 = params.x0;
    let mut y0 = params.y0;
    let mut x1 = params.x1;
    let mut y1 = params.y1;
    let mut col0 = params.col0;
    let mut col1 = params.col1;
    let mut alpha0 = params.alpha0;
    let mut alpha1 = params.alpha1;
    let hdr_scale = params.hdr_scale;

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
        plot(accum, &ctx, &PlotParams { x: ypxl1, y: xpxl1, coverage: rfpart(yend) * xgap, color: col0, alpha: alpha0, hdr_scale });
        plot(accum, &ctx, &PlotParams { x: ypxl1 + 1, y: xpxl1, coverage: fpart(yend) * xgap, color: col0, alpha: alpha0, hdr_scale });
    } else {
        plot(accum, &ctx, &PlotParams { x: xpxl1, y: ypxl1, coverage: rfpart(yend) * xgap, color: col0, alpha: alpha0, hdr_scale });
        plot(accum, &ctx, &PlotParams { x: xpxl1, y: ypxl1 + 1, coverage: fpart(yend) * xgap, color: col0, alpha: alpha0, hdr_scale });
    }

    let mut intery = yend + gradient;

    // Handle second endpoint
    let xend = x1.round();
    let yend = y1 + gradient * (xend - x1);
    let xgap = fpart(x1 + 0.5);
    let xpxl2 = xend as i32;
    let ypxl2 = ipart(yend);

    if steep {
        plot(accum, &ctx, &PlotParams { x: ypxl2, y: xpxl2, coverage: rfpart(yend) * xgap, color: col1, alpha: alpha1, hdr_scale });
        plot(accum, &ctx, &PlotParams { x: ypxl2 + 1, y: xpxl2, coverage: fpart(yend) * xgap, color: col1, alpha: alpha1, hdr_scale });
    } else {
        plot(accum, &ctx, &PlotParams { x: xpxl2, y: ypxl2, coverage: rfpart(yend) * xgap, color: col1, alpha: alpha1, hdr_scale });
        plot(accum, &ctx, &PlotParams { x: xpxl2, y: ypxl2 + 1, coverage: fpart(yend) * xgap, color: col1, alpha: alpha1, hdr_scale });
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
            plot(accum, &ctx, &PlotParams { x: ipart(intery), y: x, coverage: rfpart(intery), 
                 color: interp_color, alpha: interp_alpha, hdr_scale });
            plot(accum, &ctx, &PlotParams { x: ipart(intery) + 1, y: x, coverage: fpart(intery), 
                 color: interp_color, alpha: interp_alpha, hdr_scale });
        } else {
            plot(accum, &ctx, &PlotParams { x, y: ipart(intery), coverage: rfpart(intery), 
                 color: interp_color, alpha: interp_alpha, hdr_scale });
            plot(accum, &ctx, &PlotParams { x, y: ipart(intery) + 1, coverage: fpart(intery), 
                 color: interp_color, alpha: interp_alpha, hdr_scale });
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
fn plot_spec(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    params: &SpectralPlotParams,
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
    let total_energy = params.coverage as f64 * params.base_alpha * params.hdr_scale;
    
    // Distribute energy between wavelength bins
    if params.bin_left == params.bin_right {
        // Single bin case
        deposit(accum, width, height, params.x, params.y, total_energy, params.bin_left);
    } else {
        // Split between two bins
        let w_left = 1.0 - params.w_right;
        deposit(accum, width, height, params.x, params.y, total_energy * w_left, params.bin_left);
        deposit(accum, width, height, params.x, params.y, total_energy * params.w_right, params.bin_right);
    }
}

/// Draw an anti-aliased line segment in spectral mode
///
/// Uses Xiaolin Wu's line algorithm with spectral decomposition
#[allow(clippy::too_many_arguments)]
pub fn draw_line_segment_aa_spectral(
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
) {
    let params = SpectralLineParams { x0, y0, x1, y1, col0, col1, alpha0, alpha1, hdr_scale };
    draw_line_segment_aa_spectral_impl(accum, width, height, params);
}

fn draw_line_segment_aa_spectral_impl(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    mut params: SpectralLineParams,
) {
    trace!("Drawing spectral line from ({:.2}, {:.2}) to ({:.2}, {:.2})", params.x0, params.y0, params.x1, params.y1);
    
    let dx = (params.x1 - params.x0).abs();
    let dy = (params.y1 - params.y0).abs();
    
    let steep = dy > dx;
    
    if steep {
        std::mem::swap(&mut params.x0, &mut params.y0);
        std::mem::swap(&mut params.x1, &mut params.y1);
    }

    if params.x0 > params.x1 {
        std::mem::swap(&mut params.x0, &mut params.x1);
        std::mem::swap(&mut params.y0, &mut params.y1);
        // Also swap colors and alphas when swapping endpoints
        std::mem::swap(&mut params.col0, &mut params.col1);
        std::mem::swap(&mut params.alpha0, &mut params.alpha1);
    }

    let dx = params.x1 - params.x0;
    let dy = params.y1 - params.y0;
    let gradient = if dx == 0.0 { 1.0 } else { dy / dx };

    // Handle first endpoint
    let xend = params.x0.round();
    let yend = params.y0 + gradient * (xend - params.x0);
    let xgap = rfpart(params.x0 + 0.5);
    let xpxl1 = xend as i32;
    let ypxl1 = ipart(yend);

    // Convert first endpoint color to wavelength bin
    let bin0 = crate::spectrum::oklab_to_bin(&params.col0);
    let bin0_left = bin0;
    let bin0_right = bin0;
    let w0_right = 0.0;  // No interpolation between bins for now

    if steep {
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: ypxl1, y: xpxl1, coverage: rfpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: ypxl1 + 1, y: xpxl1, coverage: fpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale 
        });
    } else {
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl1, y: ypxl1, coverage: rfpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl1, y: ypxl1 + 1, coverage: fpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale 
        });
    }

    let mut intery = yend + gradient;

    // Handle second endpoint
    let xend = params.x1.round();
    let yend = params.y1 + gradient * (xend - params.x1);
    let xgap = fpart(params.x1 + 0.5);
    let xpxl2 = xend as i32;
    let ypxl2 = ipart(yend);

    // Convert second endpoint color to wavelength bin
    let bin1 = crate::spectrum::oklab_to_bin(&params.col1);
    let bin1_left = bin1;
    let bin1_right = bin1;
    let w1_right = 0.0;  // No interpolation between bins for now

    if steep {
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: ypxl2, y: xpxl2, coverage: rfpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: ypxl2 + 1, y: xpxl2, coverage: fpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale 
        });
    } else {
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl2, y: ypxl2, coverage: rfpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl2, y: ypxl2 + 1, coverage: fpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale 
        });
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
        let interp_alpha = lerp(params.alpha0, params.alpha1, t);
        
        if steep {
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x: ipart(intery), y: x, coverage: rfpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale 
            });
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x: ipart(intery) + 1, y: x, coverage: fpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale 
            });
        } else {
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x, y: ipart(intery), coverage: rfpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale 
            });
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x, y: ipart(intery) + 1, coverage: fpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale 
            });
        }
        intery += gradient;
    }
} 