//! Histogram computation and color leveling

use log::{debug, info};
use rayon::prelude::*;

/// Compute black and white points for color leveling
///
/// Uses optimized percentile finding with select_nth_unstable for O(n) complexity
/// instead of full sorting which is O(n log n).
///
/// # Arguments
/// * `all_r`, `all_g`, `all_b` - Mutable slices containing color channel data
/// * `clip_black` - Black point percentile (e.g., 0.0001)
/// * `clip_white` - White point percentile (e.g., 0.999)
///
/// # Returns
/// Tuple of (black_r, white_r, black_g, white_g, black_b, white_b)
pub fn compute_black_white_gamma(
    all_r: &mut [f64],
    all_g: &mut [f64],
    all_b: &mut [f64],
    clip_black: f64,
    clip_white: f64,
) -> (f64, f64, f64, f64, f64, f64) {
    info!("Computing histogram black/white points with clip_black={:.4}, clip_white={:.4}", 
          clip_black, clip_white);
    
    let total_pix = all_r.len();
    if total_pix == 0 {
        debug!("Empty histogram data, returning default values");
        return (0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
    }
    
    // Calculate percentile indices
    let black_idx = ((clip_black * total_pix as f64).round() as usize)
        .min(total_pix.saturating_sub(1));
    let white_idx = ((clip_white * total_pix as f64).round() as usize)
        .min(total_pix.saturating_sub(1));
    
    debug!("Histogram size: {}, black_idx: {}, white_idx: {}", total_pix, black_idx, white_idx);
    
    // Use parallel percentile finding for better performance on large histograms
    let ((black_r, white_r), ((black_g, white_g), (black_b, white_b))) = rayon::join(
        || {
            // Process R channel
            let black_r = *all_r.select_nth_unstable_by(black_idx, |a, b| {
                a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
            }).1;
            let white_r = *all_r.select_nth_unstable_by(white_idx, |a, b| {
                a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
            }).1;
            (black_r, white_r)
        },
        || {
            rayon::join(
                || {
                    // Process G channel
                    let black_g = *all_g.select_nth_unstable_by(black_idx, |a, b| {
                        a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
                    }).1;
                    let white_g = *all_g.select_nth_unstable_by(white_idx, |a, b| {
                        a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
                    }).1;
                    (black_g, white_g)
                },
                || {
                    // Process B channel
                    let black_b = *all_b.select_nth_unstable_by(black_idx, |a, b| {
                        a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
                    }).1;
                    let white_b = *all_b.select_nth_unstable_by(white_idx, |a, b| {
                        a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
                    }).1;
                    (black_b, white_b)
                }
            )
        }
    );
    
    info!("Computed black/white points: R({:.4}, {:.4}), G({:.4}, {:.4}), B({:.4}, {:.4})",
          black_r, white_r, black_g, white_g, black_b, white_b);
    
    (black_r, white_r, black_g, white_g, black_b, white_b)
}

/// Calculate frame density for adaptive processing
///
/// Computes the average alpha value across all pixels as a measure of density
#[allow(dead_code)]
pub fn calculate_frame_density(accum: &[(f64, f64, f64, f64)]) -> f64 {
    let total_alpha: f64 = accum.par_iter()
        .map(|(_, _, _, a)| a)
        .sum();
    
    let density = total_alpha / accum.len() as f64;
    debug!("Frame density: {:.4}", density);
    density
} 