//! Iridescent champlevé post-effect for creating a jewel-like enamel look.
//
// This effect partitions the image into Voronoi-like cells, each with a
// metallic rim and a pearlescent, flow-aligned interior. It is designed to
// create a high-end, crafted aesthetic reminiscent of fine jewelry or
// crystalline structures.

use super::PixelBuffer;
use crate::render::constants;
use rayon::prelude::*;

/// Configuration for the champlevé iridescent finish.
#[derive(Clone, Debug)]
pub struct ChampleveConfig {
    pub cell_density: f64,
    pub flow_alignment: f64,
    pub interference_amplitude: f64,
    pub interference_frequency: f64,
    pub rim_intensity: f64,
    pub rim_warmth: f64,
    pub rim_sharpness: f64,
    pub interior_lift: f64,
    pub anisotropy: f64,
    pub cell_softness: f64,
}

impl Default for ChampleveConfig {
    fn default() -> Self {
        Self {
            cell_density: constants::DEFAULT_CHAMPLEVE_CELL_DENSITY,
            flow_alignment: constants::DEFAULT_CHAMPLEVE_FLOW_ALIGNMENT,
            interference_amplitude: constants::DEFAULT_CHAMPLEVE_INTERFERENCE_AMPLITUDE,
            interference_frequency: constants::DEFAULT_CHAMPLEVE_INTERFERENCE_FREQUENCY,
            rim_intensity: constants::DEFAULT_CHAMPLEVE_RIM_INTENSITY,
            rim_warmth: constants::DEFAULT_CHAMPLEVE_RIM_WARMTH,
            rim_sharpness: constants::DEFAULT_CHAMPLEVE_RIM_SHARPNESS,
            interior_lift: constants::DEFAULT_CHAMPLEVE_INTERIOR_LIFT,
            anisotropy: constants::DEFAULT_CHAMPLEVE_ANISOTROPY,
            cell_softness: constants::DEFAULT_CHAMPLEVE_CELL_SOFTNESS,
        }
    }
}

/// A simple 2D hash function to generate pseudo-random points for Voronoi cells.
#[inline]
fn hash2(p: (f64, f64)) -> (f64, f64) {
    let h = (p.0 * 12.9898 + p.1 * 78.233).sin() * 43758.5453;
    (h.fract(), (h * 1.57).fract())
}

/// Computes the two closest Voronoi points for a given pixel coordinate.
#[inline]
fn voronoi_distances(p: (f64, f64)) -> ((f64, f64), (f64, f64)) {
    let ix = p.0.floor();
    let iy = p.1.floor();
    let fx = p.0.fract();
    let fy = p.1.fract();

    let mut closest = (f64::MAX, f64::MAX); // (distance_sq, cell_id_unused)
    let mut second_closest = (f64::MAX, f64::MAX);

    for j in -1..=1 {
        for i in -1..=1 {
            let cell_offset = (i as f64, j as f64);
            let point = hash2((ix + cell_offset.0, iy + cell_offset.1));
            let r = (cell_offset.0 + point.0 - fx, cell_offset.1 + point.1 - fy);
            let d_sq = r.0 * r.0 + r.1 * r.1;

            if d_sq < closest.0 {
                second_closest = closest;
                closest = (d_sq, 0.0);
            } else if d_sq < second_closest.0 {
                second_closest = (d_sq, 0.0);
            }
        }
    }
    (closest, second_closest)
}

/// Applies the champlevé iridescent effect to a buffer of linear RGBA pixels.
pub fn apply_champleve_iridescence(
    buffer: &mut PixelBuffer,
    width: usize,
    height: usize,
    config: &ChampleveConfig,
) {
    if buffer.is_empty() {
        return;
    }

    let gradients = super::utils::calculate_gradients(buffer, width, height);

    let cell_scale = (width as f64 * height as f64).sqrt() / config.cell_density.max(1.0);
    let inv_cell_scale = 1.0 / cell_scale;
    let warm_rim = [1.0, 0.78, 0.35];

    buffer.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let (r, g, b, a) = *pixel;
        if a <= 0.0 {
            return;
        }

        let u = (idx % width) as f64 * inv_cell_scale;
        let v = (idx / width) as f64 * inv_cell_scale;

        let (d1, d2) = voronoi_distances((u, v));
        let rim_dist = (d2.0.sqrt() - d1.0.sqrt()).abs();
        let rim = (1.0 - rim_dist.powf(config.rim_sharpness) * 20.0).clamp(0.0, 1.0);
        let interior = 1.0 - rim;

        let (gx, gy) = gradients[idx];
        let flow_dir = gy.atan2(gx);
        let flow_mag = (gx * gx + gy * gy).sqrt();
        let aligned_phase = flow_dir.cos() * config.flow_alignment;

        let interference =
            (config.interference_frequency * (v * 0.7 + u * 0.3 + aligned_phase)).sin();
        let spectral = interference * config.interference_amplitude;

        let mut sr = r / a;
        let mut sg = g / a;
        let mut sb = b / a;

        let rim_mix = rim * config.rim_intensity * config.rim_warmth;
        sr = sr * (1.0 - rim_mix) + warm_rim[0] * rim_mix;
        sg = sg * (1.0 - rim_mix) + warm_rim[1] * rim_mix;
        sb = sb * (1.0 - rim_mix) + warm_rim[2] * rim_mix;

        sr += spectral * 0.5 * interior;
        sg += spectral * -0.2 * interior;
        sb += spectral * -0.5 * interior;

        let anisotropy = config.anisotropy * flow_mag;
        sr *= 1.0 + anisotropy;
        sg *= 1.0 - anisotropy * 0.5;
        sb *= 1.0 - anisotropy;

        let lift = config.interior_lift * interior.powf(config.cell_softness);
        sr += lift;
        sg += lift;
        sb += lift;

        *pixel = (sr.max(0.0) * a, sg.max(0.0) * a, sb.max(0.0) * a, a);
    });
}
