//! Render passes for histogram building and frame writing

use crate::render::{
    color::OklabColor,
    context::RenderContext,
    drawing::draw_line_segment_aa_spectral,
    effects::{DogBloomConfig, PostEffectConfig, create_post_effect_chain},
    RenderConfig,
};
use crate::spectrum::{spd_to_rgba, NUM_BINS};
use image::{ImageBuffer, Rgb};
use log::{debug, info};
use nalgebra::Vector3;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use std::error::Error;

// ACES tone mapping constants
const ACES_A: f64 = 2.51;
const ACES_B: f64 = 0.03;
const ACES_C: f64 = 2.43;
const ACES_D: f64 = 0.59;
const ACES_E: f64 = 0.14;

/// ACES filmic tone mapping function
#[inline]
fn aces_film(x: f64) -> f64 {
    (x * (ACES_A * x + ACES_B)) / (x * (ACES_C * x + ACES_D) + ACES_E)
}

/// ACES tone mapping look-up table for performance
struct AcesLut {
    table: Vec<f64>,
    scale: f64,
    max_input: f64,
}

impl AcesLut {
    fn new() -> Self {
        const LUT_SIZE: usize = 4096;
        const MAX_INPUT: f64 = 10.0; // Maximum expected input value
        
        let mut table = Vec::with_capacity(LUT_SIZE);
        let scale = (LUT_SIZE - 1) as f64 / MAX_INPUT;
        
        for i in 0..LUT_SIZE {
            let x = (i as f64 / (LUT_SIZE - 1) as f64) * MAX_INPUT;
            table.push(aces_film(x));
        }
        
        Self { table, scale, max_input: MAX_INPUT }
    }
    
    #[inline]
    fn apply(&self, x: f64) -> f64 {
        if x <= 0.0 {
            return 0.0;
        }
        if x >= self.max_input {
            return aces_film(x); // Fall back to computation for out-of-range values
        }
        
        let idx_f = x * self.scale;
        let idx = idx_f as usize;
        if idx >= self.table.len() - 1 {
            return self.table[self.table.len() - 1];
        }
        
        // Linear interpolation for better accuracy
        let frac = idx_f - idx as f64;
        let y0 = self.table[idx];
        let y1 = self.table[idx + 1];
        y0 + (y1 - y0) * frac
    }
}

// Global ACES LUT instance
static ACES_LUT: Lazy<AcesLut> = Lazy::new(AcesLut::new);

/// Convert spectral power distribution buffer to RGBA
fn convert_spd_buffer_to_rgba(src: &[[f64; NUM_BINS]], dest: &mut [(f64, f64, f64, f64)]) {
    dest.par_iter_mut()
        .zip(src.par_iter())
        .for_each(|(dst, spd)| {
            let rgba = spd_to_rgba(spd);
            dst.0 = rgba.0;
            dst.1 = rgba.1;
            dst.2 = rgba.2;
            dst.3 = rgba.3;
        });
}

/// Parameters for spectral histogram pass
pub struct SpectralHistogramParams<'a> {
    pub positions: &'a [Vec<Vector3<f64>>],
    pub colors: &'a [Vec<OklabColor>],
    pub body_alphas: &'a [f64],
    pub width: u32,
    pub height: u32,
    pub blur_radius_px: usize,
    pub blur_strength: f64,
    pub blur_core_brightness: f64,
    pub frame_interval: usize,
    pub all_r: &'a mut Vec<f64>,
    pub all_g: &'a mut Vec<f64>,
    pub all_b: &'a mut Vec<f64>,
    pub bloom_mode: &'a str,
    pub dog_config: &'a DogBloomConfig,
    pub hdr_mode: &'a str,
    pub perceptual_blur_enabled: bool,
    pub perceptual_blur_config: Option<&'a crate::post_effects::PerceptualBlurConfig>,
    pub render_config: &'a RenderConfig,
}

/// Parameters for spectral frame writing pass
pub struct SpectralFrameWriteParams<'a, F> {
    pub positions: &'a [Vec<Vector3<f64>>],
    pub colors: &'a [Vec<OklabColor>],
    pub body_alphas: &'a [f64],
    pub width: u32,
    pub height: u32,
    pub blur_radius_px: usize,
    pub blur_strength: f64,
    pub blur_core_brightness: f64,
    pub frame_interval: usize,
    pub black_r: f64,
    pub white_r: f64,
    pub black_g: f64,
    pub white_g: f64,
    pub black_b: f64,
    pub white_b: f64,
    pub bloom_mode: &'a str,
    pub dog_config: &'a DogBloomConfig,
    pub hdr_mode: &'a str,
    pub perceptual_blur_enabled: bool,
    pub perceptual_blur_config: Option<&'a crate::post_effects::PerceptualBlurConfig>,
    pub frame_sink: F,
    pub last_frame_out: &'a mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
    pub render_config: &'a RenderConfig,
}

/// Pass 1: Build histogram (spectral mode)
pub fn pass_1_build_histogram_spectral(params: SpectralHistogramParams) {
    info!("Starting pass 1 (spectral): building histogram");
    
    let ctx = RenderContext::new(params.width, params.height, params.positions);
    let npix = ctx.pixel_count();
    
    let mut accum_spd = vec![[0.0; NUM_BINS]; npix];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];
    
    let post_chain = create_post_effect_chain(PostEffectConfig {
        bloom_mode: params.bloom_mode,
        blur_radius_px: params.blur_radius_px,
        blur_strength: params.blur_strength,
        blur_core_brightness: params.blur_core_brightness,
        dog_config: params.dog_config,
        hdr_mode: params.hdr_mode,
        perceptual_blur_enabled: params.perceptual_blur_enabled,
        perceptual_blur_config: params.perceptual_blur_config,
    });
    
    let total_steps = params.positions[0].len();
    let chunk_line = (total_steps / 100).max(1);
    
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            debug!("Pass 1 (spectral) progress: {:.0}%", pct);
        }
        
        let p0 = params.positions[0][step];
        let p1 = params.positions[1][step];
        let p2 = params.positions[2][step];

        let c0 = params.colors[0][step];
        let c1 = params.colors[1][step];
        let c2 = params.colors[2][step];

        let a0 = params.body_alphas[0];
        let a1 = params.body_alphas[1];
        let a2 = params.body_alphas[2];

        let (x0, y0) = ctx.to_pixel(p0[0], p0[1]);
        let (x1, y1) = ctx.to_pixel(p1[0], p1[1]);
        let (x2, y2) = ctx.to_pixel(p2[0], p2[1]);

        // Draw spectral lines
        draw_line_segment_aa_spectral(&mut accum_spd, params.width, params.height, crate::render::drawing::SpectralLineParams {
            x0, y0, x1, y1, col0: c0, col1: c1, alpha0: a0, alpha1: a1, 
            hdr_scale: params.render_config.hdr_scale, alpha_compress: params.render_config.alpha_compress
        });
        draw_line_segment_aa_spectral(&mut accum_spd, params.width, params.height, crate::render::drawing::SpectralLineParams {
            x0: x1, y0: y1, x1: x2, y1: y2, col0: c1, col1: c2, alpha0: a1, alpha1: a2,
            hdr_scale: params.render_config.hdr_scale, alpha_compress: params.render_config.alpha_compress
        });
        draw_line_segment_aa_spectral(&mut accum_spd, params.width, params.height, crate::render::drawing::SpectralLineParams {
            x0: x2, y0: y2, x1: x0, y1: y0, col0: c2, col1: c0, alpha0: a2, alpha1: a0,
            hdr_scale: params.render_config.hdr_scale, alpha_compress: params.render_config.alpha_compress
        });

        let is_final = step == total_steps - 1;
        if (step > 0 && step % params.frame_interval == 0) || is_final {
            // Convert spectral to RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);
            
            // Apply post-effects
            let final_pixels = post_chain.process(accum_rgba.clone(), params.width as usize, params.height as usize)
                .expect("Post-effect chain failed");
            
            // Collect histogram data
            for &(r, g, b, a) in &final_pixels {
                params.all_r.push(r * a);
                params.all_g.push(g * a);
                params.all_b.push(b * a);
            }
        }
    }
    
    info!("Pass 1 (spectral) complete: {} histogram samples", params.all_r.len());
}

/// Pass 2: Write frames (spectral mode)
pub fn pass_2_write_frames_spectral<F>(mut params: SpectralFrameWriteParams<F>) -> Result<(), Box<dyn Error>>
where
    F: FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
{
    info!("Starting pass 2 (spectral): writing frames");
    
    struct ColorRanges {
        r: f64,
        g: f64,
        b: f64,
    }
    
    let ranges = ColorRanges {
        r: if params.white_r > params.black_r { params.white_r - params.black_r } else { 1.0 },
        g: if params.white_g > params.black_g { params.white_g - params.black_g } else { 1.0 },
        b: if params.white_b > params.black_b { params.white_b - params.black_b } else { 1.0 },
    };
    
    let ctx = RenderContext::new(params.width, params.height, params.positions);
    let npix = ctx.pixel_count();
    
    let mut accum_spd = vec![[0.0; NUM_BINS]; npix];
    let mut accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];
    
    let post_chain = create_post_effect_chain(PostEffectConfig {
        bloom_mode: params.bloom_mode,
        blur_radius_px: params.blur_radius_px,
        blur_strength: params.blur_strength,
        blur_core_brightness: params.blur_core_brightness,
        dog_config: params.dog_config,
        hdr_mode: params.hdr_mode,
        perceptual_blur_enabled: params.perceptual_blur_enabled,
        perceptual_blur_config: params.perceptual_blur_config,
    });
    
    let total_steps = params.positions[0].len();
    let chunk_line = (total_steps / 100).max(1);
    let mut frame_count = 0;
    
    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            debug!("Pass 2 (spectral) progress: {:.0}%", pct);
        }
        
        let p0 = params.positions[0][step];
        let p1 = params.positions[1][step];
        let p2 = params.positions[2][step];

        let c0 = params.colors[0][step];
        let c1 = params.colors[1][step];
        let c2 = params.colors[2][step];

        let a0 = params.body_alphas[0];
        let a1 = params.body_alphas[1];
        let a2 = params.body_alphas[2];

        let (x0, y0) = ctx.to_pixel(p0[0], p0[1]);
        let (x1, y1) = ctx.to_pixel(p1[0], p1[1]);
        let (x2, y2) = ctx.to_pixel(p2[0], p2[1]);

        // Draw spectral lines
        draw_line_segment_aa_spectral(&mut accum_spd, params.width, params.height, crate::render::drawing::SpectralLineParams {
            x0, y0, x1, y1, col0: c0, col1: c1, alpha0: a0, alpha1: a1,
            hdr_scale: params.render_config.hdr_scale, alpha_compress: params.render_config.alpha_compress
        });
        draw_line_segment_aa_spectral(&mut accum_spd, params.width, params.height, crate::render::drawing::SpectralLineParams {
            x0: x1, y0: y1, x1: x2, y1: y2, col0: c1, col1: c2, alpha0: a1, alpha1: a2,
            hdr_scale: params.render_config.hdr_scale, alpha_compress: params.render_config.alpha_compress
        });
        draw_line_segment_aa_spectral(&mut accum_spd, params.width, params.height, crate::render::drawing::SpectralLineParams {
            x0: x2, y0: y2, x1: x0, y1: y0, col0: c2, col1: c0, alpha0: a2, alpha1: a0,
            hdr_scale: params.render_config.hdr_scale, alpha_compress: params.render_config.alpha_compress
        });

        let is_final = step == total_steps - 1;
        if (step > 0 && step % params.frame_interval == 0) || is_final {
            frame_count += 1;
            
            // Convert spectral to RGBA
            convert_spd_buffer_to_rgba(&accum_spd, &mut accum_rgba);
            
            // Apply post-effects
            let final_pixels = post_chain.process(accum_rgba.clone(), params.width as usize, params.height as usize)
                .expect("Post-effect chain failed");
            
            // Convert to 8-bit with color correction
            let mut rgb_bytes = vec![0u8; npix * 3];
            
            rgb_bytes.par_chunks_exact_mut(3)
                .zip(final_pixels.par_iter())
                .for_each(|(rgb, &(r, g, b, _a))| {
                    // Apply color leveling
                    let r_norm = ((r - params.black_r) / ranges.r).clamp(0.0, 1.0);
                    let g_norm = ((g - params.black_g) / ranges.g).clamp(0.0, 1.0);
                    let b_norm = ((b - params.black_b) / ranges.b).clamp(0.0, 1.0);
                    
                    // Apply tone mapping
                    let r_mapped = ACES_LUT.apply(r_norm);
                    let g_mapped = ACES_LUT.apply(g_norm);
                    let b_mapped = ACES_LUT.apply(b_norm);
                    
                    // Convert to 8-bit
                    rgb[0] = (r_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                    rgb[1] = (g_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                    rgb[2] = (b_mapped * 255.0).round().clamp(0.0, 255.0) as u8;
                });
            
            // Send frame to sink
            (params.frame_sink)(&rgb_bytes)?;
            
            // Save last frame if requested
            if is_final && params.last_frame_out.is_some() {
                if let Some(img_out) = params.last_frame_out {
                    *img_out = ImageBuffer::from_raw(params.width, params.height, rgb_bytes)
                        .expect("Failed to create image buffer");
                }
            }
            
            // Clear buffers for next frame
            if !is_final {
                accum_spd.fill([0.0; NUM_BINS]);
                accum_rgba = vec![(0.0, 0.0, 0.0, 0.0); npix];
            }
        }
    }
    
    info!("Pass 2 (spectral) complete: {} frames written", frame_count);
    Ok(())
} 










