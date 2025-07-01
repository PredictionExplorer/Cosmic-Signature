//! Line drawing and primitive rendering

use crate::oklab;
use crate::render::color::OklabColor;
use crate::spectrum::NUM_BINS;
use log::trace;

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
    alpha_compress: f64,
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
    pub alpha_compress: f64,
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
    // Parameters for depositing energy
    struct DepositParams {
        xi: i32,
        yi: i32,
        energy: f64,
        bin: usize,
        alpha_compress: f64,
    }
    
    // Inner helper to deposit energy into a specific bin
    #[inline]
    fn deposit(
        accum: &mut [[f64; NUM_BINS]],
        width: u32,
        height: u32,
        params: &DepositParams,
    ) {
        if params.xi >= 0 && params.xi < width as i32 && params.yi >= 0 && params.yi < height as i32 {
            let idx = (params.yi as usize) * (width as usize) + (params.xi as usize);
            
            // Apply alpha compression based on current energy in the bin
            let compression_factor = if params.alpha_compress > 0.0 {
                // Use exponential decay based on total energy at this pixel
                let current_energy: f64 = accum[idx].iter().sum();
                (-params.alpha_compress * current_energy).exp()
            } else {
                1.0
            };
            
            accum[idx][params.bin] += params.energy * compression_factor;
        }
    }

    // Total energy to deposit
    let total_energy = params.coverage as f64 * params.base_alpha * params.hdr_scale;
    
    // Distribute energy between wavelength bins
    if params.bin_left == params.bin_right {
        // Single bin case
        deposit(accum, width, height, &DepositParams {
            xi: params.x, yi: params.y, energy: total_energy, bin: params.bin_left, alpha_compress: params.alpha_compress
        });
    } else {
        // Split between two bins
        let w_left = 1.0 - params.w_right;
        deposit(accum, width, height, &DepositParams {
            xi: params.x, yi: params.y, energy: total_energy * w_left, bin: params.bin_left, alpha_compress: params.alpha_compress
        });
        deposit(accum, width, height, &DepositParams {
            xi: params.x, yi: params.y, energy: total_energy * params.w_right, bin: params.bin_right, alpha_compress: params.alpha_compress
        });
    }
}

/// Draw an anti-aliased line segment in spectral mode
///
/// Uses Xiaolin Wu's line algorithm with spectral decomposition
pub fn draw_line_segment_aa_spectral(
    accum: &mut [[f64; NUM_BINS]],
    width: u32,
    height: u32,
    params: SpectralLineParams,
) {
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
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: ypxl1 + 1, y: xpxl1, coverage: fpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
        });
    } else {
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl1, y: ypxl1, coverage: rfpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl1, y: ypxl1 + 1, coverage: fpart(yend) * xgap, 
            bin_left: bin0_left, bin_right: bin0_right, w_right: w0_right, 
            base_alpha: params.alpha0, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
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
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: ypxl2 + 1, y: xpxl2, coverage: fpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
        });
    } else {
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl2, y: ypxl2, coverage: rfpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
        });
        plot_spec(accum, width, height, &SpectralPlotParams { 
            x: xpxl2, y: ypxl2 + 1, coverage: fpart(yend) * xgap, 
            bin_left: bin1_left, bin_right: bin1_right, w_right: w1_right, 
            base_alpha: params.alpha1, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
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
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
            });
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x: ipart(intery) + 1, y: x, coverage: fpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
            });
        } else {
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x, y: ipart(intery), coverage: rfpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
            });
            plot_spec(accum, width, height, &SpectralPlotParams { 
                x, y: ipart(intery) + 1, coverage: fpart(intery), 
                bin_left, bin_right, w_right, 
                base_alpha: interp_alpha, hdr_scale: params.hdr_scale, alpha_compress: params.alpha_compress 
            });
        }
        intery += gradient;
    }
} 