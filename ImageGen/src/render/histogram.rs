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

    /// Check if histogram is empty
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Clear the histogram data
    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.data.clear();
    }

    /// Reserve additional capacity
    pub fn reserve(&mut self, additional: usize) {
        self.data.reserve(additional);
    }

    /// Get raw data for iteration
    pub fn data(&self) -> &[[f64; 3]] {
        &self.data
    }

    /// Compute black and white points for color leveling
    #[allow(dead_code)]
    pub fn compute_black_white_points(
        &mut self,
        clip_black: f64,
        clip_white: f64,
    ) -> (f64, f64, f64, f64, f64, f64) {
        let total_pix = self.data.len();
        if total_pix == 0 {
            return (0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
        }

        // Extract channels for sorting
        let mut r_values: Vec<f64> = self.data.iter().map(|rgb| rgb[0]).collect();
        let mut g_values: Vec<f64> = self.data.iter().map(|rgb| rgb[1]).collect();
        let mut b_values: Vec<f64> = self.data.iter().map(|rgb| rgb[2]).collect();

        // Use select_nth_unstable for O(n) percentile finding
        let black_idx =
            ((clip_black * total_pix as f64).round() as usize).min(total_pix.saturating_sub(1));
        let white_idx =
            ((clip_white * total_pix as f64).round() as usize).min(total_pix.saturating_sub(1));

        // Find percentiles using partial sort (O(n) complexity)
        let black_r =
            *r_values.select_nth_unstable_by(black_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        let white_r =
            *r_values.select_nth_unstable_by(white_idx, |a, b| a.partial_cmp(b).unwrap()).1;

        let black_g =
            *g_values.select_nth_unstable_by(black_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        let white_g =
            *g_values.select_nth_unstable_by(white_idx, |a, b| a.partial_cmp(b).unwrap()).1;

        let black_b =
            *b_values.select_nth_unstable_by(black_idx, |a, b| a.partial_cmp(b).unwrap()).1;
        let white_b =
            *b_values.select_nth_unstable_by(white_idx, |a, b| a.partial_cmp(b).unwrap()).1;

        (black_r, white_r, black_g, white_g, black_b, white_b)
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

/// Calculate frame density from accumulation buffer
pub(crate) fn calculate_frame_density(accum: &[(f64, f64, f64, f64)]) -> f64 {
    accum
        .iter()
        .map(|(_, _, _, a)| a * a) // Square alpha for better density estimation
        .sum::<f64>()
        / accum.len() as f64
}
