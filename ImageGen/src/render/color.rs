//! Color generation and manipulation utilities

use crate::sim::Sha3RandomByteStream;
use log::trace;

/// Type alias for OKLab color (L, a, b components)
pub type OklabColor = (f64, f64, f64);

// Color generation constants
const HUE_FULL_CIRCLE: f64 = 360.0;      // Degrees in a full rotation
const BODY_HUE_SEPARATION: f64 = 120.0;  // 360/3 for even distribution
const HUE_DRIFT_SCALE: f64 = 1.0;        // Controls drift rate over time

// OKLab perceptual constants
const OKLAB_CHROMA_BASE: f64 = 0.12;     // Typical chroma range 0-0.3
const OKLAB_CHROMA_RANGE: f64 = 0.08;
const OKLAB_LIGHTNESS_BASE: f64 = 0.65;
const OKLAB_LIGHTNESS_RANGE: f64 = 0.25;

/// Generate a gradient of colors in OKLab space for a single body over time
///
/// # Arguments
/// * `rng` - Random number generator
/// * `length` - Number of colors to generate
/// * `body_index` - Index of the body (0, 1, or 2)
/// * `base_hue_offset` - Base offset for hue drift over time
///
/// # Returns
/// Vector of OKLab colors with length `length`
pub fn generate_color_gradient_oklab(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    body_index: usize,
    base_hue_offset: f64,
) -> Vec<OklabColor> {
    trace!("Generating color gradient for body {} with {} steps", body_index, length);
    
    // Pre-allocate with exact capacity
    let mut colors = Vec::with_capacity(length);
    
    // Base hue evenly distributed across bodies
    let hue_start = rng.next_f64() * HUE_FULL_CIRCLE + body_index as f64 * BODY_HUE_SEPARATION;
    
    // Pre-compute logarithmic time drift values
    let ln_cache: Vec<f64> = (1..=length)
        .map(|i| base_hue_offset * (HUE_DRIFT_SCALE + (i as f64).ln()).min(HUE_FULL_CIRCLE))
        .collect();
    
    // Batch RNG calls for efficiency
    let random_values: Vec<(f64, f64)> = (0..length)
        .map(|_| (rng.next_f64(), rng.next_f64()))
        .collect();
    
    // Generate colors using pre-computed values
    for (step, &time_drift) in ln_cache.iter().enumerate() {
        let (rand_chroma, rand_lightness) = random_values[step];
        
        let hue = hue_start + time_drift;
        
        // Constrained random variation in chroma and lightness for perceptual consistency
        let chroma = OKLAB_CHROMA_BASE + rand_chroma * OKLAB_CHROMA_RANGE;
        let lightness = OKLAB_LIGHTNESS_BASE + rand_lightness * OKLAB_LIGHTNESS_RANGE;
        
        // Convert cylindrical to rectangular coordinates
        let a = chroma * (hue.to_radians()).cos();
        let b = chroma * (hue.to_radians()).sin();
        
        colors.push((lightness, a, b));
    }
    
    colors
}

/// Generate color sequences for three bodies
///
/// # Arguments
/// * `rng` - Random number generator
/// * `length` - Number of time steps
/// * `alpha_value` - Default alpha value for all bodies
///
/// # Returns
/// Tuple of (color sequences for 3 bodies, alpha values for 3 bodies)
pub fn generate_body_color_sequences(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    alpha_value: f64,
) -> (Vec<Vec<OklabColor>>, Vec<f64>) {
    trace!("Generating color sequences for {} steps", length);
    
    // Base hue offset for time-based color drift
    let base_hue_offset = 10.0 + rng.next_f64() * 40.0; // 10-50 degree drift
    
    let body_colors = vec![
        generate_color_gradient_oklab(rng, length, 0, base_hue_offset),
        generate_color_gradient_oklab(rng, length, 1, base_hue_offset),
        generate_color_gradient_oklab(rng, length, 2, base_hue_offset),
    ];
    
    let body_alphas = vec![alpha_value; 3];
    
    (body_colors, body_alphas)
}

/// Linear interpolation helper
#[inline]
#[allow(dead_code)]
pub(crate) fn lerp(a: f64, b: f64, t: f32) -> f64 {
    a + (b - a) * t as f64
} 