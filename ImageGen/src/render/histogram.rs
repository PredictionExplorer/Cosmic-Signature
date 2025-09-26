//! Histogram computation and analysis
//!
//! This module provides efficient histogram storage and computation of color statistics
//! for automatic exposure and color grading.

use rayon::prelude::*;

/// Optimized histogram storage with better memory layout
pub struct HistogramData {
    /// Interleaved RGB data for better cache locality
    data: Vec<[f64; 3]>,
}

impl HistogramData {
    /// Create new histogram storage with given capacity
    pub fn with_capacity(capacity: usize) -> Self {
        Self { data: Vec::with_capacity(capacity) }
    }

    /// Add a pixel's RGB values to the histogram
    #[inline]
    pub fn push(&mut self, r: f64, g: f64, b: f64) {
        self.data.push([r, g, b]);
    }

    /// Get the length of the histogram
    pub fn len(&self) -> usize {
        self.data.len()
    }


    /// Reserve additional capacity
    pub fn reserve(&mut self, additional: usize) {
        self.data.reserve(additional);
    }

    /// Get raw data for iteration
    pub fn data(&self) -> &[[f64; 3]] {
        &self.data
    }

}

/// Compute black/white points from histogram data
pub fn compute_black_white_gamma(
    all_r: &mut [f64],
    all_g: &mut [f64],
    all_b: &mut [f64],
    clip_black: f64,
    clip_white: f64,
) -> (f64, f64, f64, f64, f64, f64) {
    // sort each channel separately (in parallel)
    let r_slice = &mut *all_r;
    let g_slice = &mut *all_g;
    let b_slice = &mut *all_b;

    [r_slice, g_slice, b_slice].par_iter_mut().for_each(|channel| {
        channel.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    });

    let total_pix = all_r.len();
    if total_pix == 0 {
        return (0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
    }

    let black_idx =
        ((clip_black * total_pix as f64).round() as usize).min(total_pix.saturating_sub(1));
    let white_idx =
        ((clip_white * total_pix as f64).round() as usize).min(total_pix.saturating_sub(1));

    let black_r = all_r[black_idx];
    let white_r = all_r[white_idx];
    let black_g = all_g[black_idx];
    let white_g = all_g[white_idx];
    let black_b = all_b[black_idx];
    let white_b = all_b[white_idx];

    (black_r, white_r, black_g, white_g, black_b, white_b)
}

