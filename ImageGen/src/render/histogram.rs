//! Histogram computation and analysis
//!
//! This module provides memory-bounded histogram storage and computation of color
//! statistics for automatic exposure and color grading.
//!
//! Public API methods are provided for library consumers even if not used internally.

#![allow(dead_code)] // Public API methods for library consumers

use rayon::prelude::*;

/// Default upper bound for per-channel reservoir samples.
const MAX_RESERVOIR_SAMPLES: usize = 200_000;
/// Minimum useful per-channel reservoir size.
const MIN_RESERVOIR_SAMPLES: usize = 8_192;

/// Streaming quantile estimator using deterministic reservoir sampling.
#[derive(Clone, Debug)]
struct ReservoirQuantiles {
    samples: Vec<f64>,
    seen: u64,
    min_value: f64,
    max_value: f64,
    rng_state: u64,
}

impl ReservoirQuantiles {
    fn with_capacity(capacity: usize, seed: u64) -> Self {
        let bounded = capacity.clamp(MIN_RESERVOIR_SAMPLES, MAX_RESERVOIR_SAMPLES);
        Self {
            samples: Vec::with_capacity(bounded),
            seen: 0,
            min_value: f64::INFINITY,
            max_value: f64::NEG_INFINITY,
            rng_state: seed ^ 0x9E37_79B9_7F4A_7C15,
        }
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        // xorshift64*: deterministic and lightweight for reservoir indexing.
        let mut x = self.rng_state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.rng_state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    #[inline]
    fn push(&mut self, value: f64) {
        if !value.is_finite() {
            return;
        }

        self.seen = self.seen.saturating_add(1);
        self.min_value = self.min_value.min(value);
        self.max_value = self.max_value.max(value);

        if self.samples.len() < self.samples.capacity() {
            self.samples.push(value);
            return;
        }

        let replace_idx = (self.next_u64() % self.seen) as usize;
        if replace_idx < self.samples.len() {
            self.samples[replace_idx] = value;
        }
    }

    fn quantile(&self, q: f64) -> Option<f64> {
        if self.samples.is_empty() {
            return None;
        }

        let mut sorted = self.samples.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let q = q.clamp(0.0, 1.0);
        let idx = ((sorted.len() as f64 - 1.0) * q).round() as usize;
        Some(sorted[idx.min(sorted.len() - 1)])
    }
}

/// Memory-bounded histogram storage for streaming quantiles.
pub struct HistogramData {
    r: ReservoirQuantiles,
    g: ReservoirQuantiles,
    b: ReservoirQuantiles,
}

impl HistogramData {
    /// Create new histogram storage with expected sample count.
    pub fn with_capacity(capacity: usize) -> Self {
        let per_channel_capacity = (capacity / 3).max(MIN_RESERVOIR_SAMPLES);
        Self {
            r: ReservoirQuantiles::with_capacity(per_channel_capacity, 0xA5A5_A5A5),
            g: ReservoirQuantiles::with_capacity(per_channel_capacity, 0x5A5A_5A5A),
            b: ReservoirQuantiles::with_capacity(per_channel_capacity, 0x3C6E_F372),
        }
    }

    /// Add a pixel's RGB values to the histogram
    #[inline]
    pub fn push(&mut self, r: f64, g: f64, b: f64) {
        self.r.push(r);
        self.g.push(g);
        self.b.push(b);
    }

    /// Get the number of ingested samples.
    pub fn len(&self) -> usize {
        self.r.seen.min(usize::MAX as u64) as usize
    }
    
    /// Check if the histogram is empty
    pub fn is_empty(&self) -> bool {
        self.r.seen == 0
    }

    /// Reserve additional capacity to reduce reallocations.
    ///
    /// No-op once the bounded reservoir is full.
    pub fn reserve(&mut self, additional: usize) {
        let target = self.r.samples.len().saturating_add(additional);
        let bounded = target.min(self.r.samples.capacity());
        self.r.samples.reserve(bounded.saturating_sub(self.r.samples.len()));
        self.g.samples.reserve(bounded.saturating_sub(self.g.samples.len()));
        self.b.samples.reserve(bounded.saturating_sub(self.b.samples.len()));
    }

    /// Compute black/white points directly from bounded quantile reservoirs.
    pub fn black_white_points(
        &self,
        clip_black: f64,
        clip_white: f64,
    ) -> (f64, f64, f64, f64, f64, f64) {
        let black_q = clip_black.clamp(0.0, 1.0);
        let white_q = clip_white.clamp(0.0, 1.0);

        let black_r = self.r.quantile(black_q).unwrap_or(0.0);
        let mut white_r = self.r.quantile(white_q).unwrap_or(1.0);
        let black_g = self.g.quantile(black_q).unwrap_or(0.0);
        let mut white_g = self.g.quantile(white_q).unwrap_or(1.0);
        let black_b = self.b.quantile(black_q).unwrap_or(0.0);
        let mut white_b = self.b.quantile(white_q).unwrap_or(1.0);

        // Ensure ordered black < white to keep downstream range valid.
        if white_r <= black_r {
            white_r = black_r + 1e-6;
        }
        if white_g <= black_g {
            white_g = black_g + 1e-6;
        }
        if white_b <= black_b {
            white_b = black_b + 1e-6;
        }

        (black_r, white_r, black_g, white_g, black_b, white_b)
    }
}

/// Compute black/white points from histogram data (legacy API).
///
/// Note: This API sorts full arrays and is kept for library compatibility.
/// Internal renderer paths now use bounded streaming quantiles via `HistogramData`.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reservoir_quantiles_are_bounded() {
        let mut h = HistogramData::with_capacity(10_000_000);
        for i in 0..2_000_000usize {
            let v = i as f64 / 2_000_000.0;
            h.push(v, v, v);
        }

        assert!(h.r.samples.len() <= MAX_RESERVOIR_SAMPLES);
        assert!(h.g.samples.len() <= MAX_RESERVOIR_SAMPLES);
        assert!(h.b.samples.len() <= MAX_RESERVOIR_SAMPLES);
    }

    #[test]
    fn streaming_black_white_estimate_is_reasonable() {
        let mut h = HistogramData::with_capacity(100_000);
        // Uniform-ish ramp in [0,1].
        for i in 0..500_000usize {
            let v = (i % 10_000) as f64 / 9_999.0;
            h.push(v, v, v);
        }

        let (br, wr, bg, wg, bb, wb) = h.black_white_points(0.01, 0.99);
        for (b, w) in [(br, wr), (bg, wg), (bb, wb)] {
            assert!(b < w);
            assert!((b - 0.01).abs() < 0.03, "black quantile too far: {b}");
            assert!((w - 0.99).abs() < 0.03, "white quantile too far: {w}");
        }
    }
}
