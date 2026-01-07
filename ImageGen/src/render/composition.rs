//! Composition-Aware Framing for Museum Quality Output
//!
//! This module provides advanced framing algorithms that go beyond simple
//! bounding-box fitting to consider compositional principles.

#![allow(clippy::unreadable_literal)]
//!
//! # Compositional Principles
//!
//! ## Rule of Thirds
//! The frame is divided into a 3×3 grid. Key visual elements should align
//! with the grid lines or their intersections (power points).
//!
//! ## Golden Ratio
//! The golden ratio (φ ≈ 1.618) appears in many aesthetically pleasing
//! compositions. Key elements should align with golden spiral focal points.
//!
//! ## Safe Margins
//! A minimum margin around the content prevents visual tension from elements
//! appearing to touch the frame edge.
//!
//! # Usage
//!
//! The framing adjustments are applied after computing the bounding box
//! but before rendering, allowing the render context to use optimized bounds.

#![allow(dead_code)] // Module prepared for future integration

use nalgebra::Vector3;

/// Golden ratio constant (φ)
pub const GOLDEN_RATIO: f64 = 1.618033988749895;

/// Minimum margin as fraction of frame dimension (5% on each side)
pub const MIN_MARGIN_FRACTION: f64 = 0.05;

/// Maximum margin as fraction of frame dimension (15% on each side)
pub const MAX_MARGIN_FRACTION: f64 = 0.15;

/// Rule of thirds grid positions (0.0, 0.333, 0.667, 1.0)
pub const THIRDS_POSITIONS: [f64; 4] = [0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0];

/// Golden ratio grid positions for rule of thirds alternative
pub const GOLDEN_POSITIONS: [f64; 4] = [0.0, 1.0 / GOLDEN_RATIO, 1.0 - 1.0 / GOLDEN_RATIO, 1.0];

/// Power points for rule of thirds (grid intersections)
pub const THIRDS_POWER_POINTS: [(f64, f64); 4] = [
    (1.0 / 3.0, 1.0 / 3.0), // Top-left
    (2.0 / 3.0, 1.0 / 3.0), // Top-right
    (1.0 / 3.0, 2.0 / 3.0), // Bottom-left
    (2.0 / 3.0, 2.0 / 3.0), // Bottom-right
];

/// Framing mode for composition
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum FramingMode {
    /// Simple bounding box with uniform margins
    BoundingBox,
    /// Center content with rule of thirds consideration
    RuleOfThirds,
    /// Center content with golden ratio consideration
    GoldenRatio,
    /// Automatic selection based on content analysis
    #[default]
    Automatic,
}

/// Result of composition analysis
#[derive(Clone, Debug)]
pub struct CompositionAnalysis {
    /// Original bounding box
    pub original_bounds: (f64, f64, f64, f64), // min_x, max_x, min_y, max_y
    
    /// Adjusted bounding box with composition-aware margins
    pub adjusted_bounds: (f64, f64, f64, f64),
    
    /// Center of visual mass in normalized coordinates (0-1)
    pub visual_center: (f64, f64),
    
    /// Distance from center of mass to nearest power point
    pub power_point_alignment: f64,
    
    /// Recommended framing mode based on analysis
    pub recommended_mode: FramingMode,
    
    /// Margin fraction applied (0-1)
    pub margin_applied: f64,
}

/// Compute composition-aware framing for a set of positions
///
/// # Arguments
///
/// * `positions` - Position vectors for each body at each timestep
/// * `frame_width` - Target frame width in pixels
/// * `frame_height` - Target frame height in pixels
/// * `mode` - Framing mode to use
///
/// # Returns
///
/// `CompositionAnalysis` with adjusted bounds and composition metrics
pub fn compute_composition(
    positions: &[Vec<Vector3<f64>>],
    frame_width: u32,
    frame_height: u32,
    mode: FramingMode,
) -> CompositionAnalysis {
    // Compute original bounding box
    let (min_x, max_x, min_y, max_y) = compute_bounds(positions);
    let original_bounds = (min_x, max_x, min_y, max_y);
    
    // Compute visual center (center of mass weighted by trajectory density)
    let visual_center = compute_visual_center(positions, min_x, max_x, min_y, max_y);
    
    // Determine margin based on content coverage
    let content_width = max_x - min_x;
    let content_height = max_y - min_y;
    let margin_fraction = compute_adaptive_margin(
        content_width, content_height, 
        frame_width as f64, frame_height as f64
    );
    
    // Apply margins
    let margin_x = content_width * margin_fraction;
    let margin_y = content_height * margin_fraction;
    
    let mut adjusted_min_x = min_x - margin_x;
    let mut adjusted_max_x = max_x + margin_x;
    let mut adjusted_min_y = min_y - margin_y;
    let mut adjusted_max_y = max_y + margin_y;
    
    // Determine framing mode
    let actual_mode = match mode {
        FramingMode::Automatic => analyze_best_mode(&visual_center, content_width / content_height),
        other => other,
    };
    
    // Apply composition adjustments based on mode
    match actual_mode {
        FramingMode::RuleOfThirds => {
            apply_thirds_alignment(
                &mut adjusted_min_x, &mut adjusted_max_x,
                &mut adjusted_min_y, &mut adjusted_max_y,
                &visual_center,
            );
        }
        FramingMode::GoldenRatio => {
            apply_golden_alignment(
                &mut adjusted_min_x, &mut adjusted_max_x,
                &mut adjusted_min_y, &mut adjusted_max_y,
                &visual_center,
            );
        }
        _ => {}
    }
    
    // Compute power point alignment score
    let power_point_alignment = compute_power_point_alignment(&visual_center);
    
    CompositionAnalysis {
        original_bounds,
        adjusted_bounds: (adjusted_min_x, adjusted_max_x, adjusted_min_y, adjusted_max_y),
        visual_center,
        power_point_alignment,
        recommended_mode: actual_mode,
        margin_applied: margin_fraction,
    }
}

/// Compute bounding box from positions
fn compute_bounds(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    
    for body in positions {
        for pos in body {
            min_x = min_x.min(pos.x);
            max_x = max_x.max(pos.x);
            min_y = min_y.min(pos.y);
            max_y = max_y.max(pos.y);
        }
    }
    
    // Ensure non-zero dimensions
    if (max_x - min_x).abs() < 1e-10 {
        max_x = min_x + 1.0;
    }
    if (max_y - min_y).abs() < 1e-10 {
        max_y = min_y + 1.0;
    }
    
    (min_x, max_x, min_y, max_y)
}

/// Compute visual center (normalized 0-1 in the frame)
fn compute_visual_center(
    positions: &[Vec<Vector3<f64>>],
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
) -> (f64, f64) {
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut count = 0;
    
    // Sample positions to compute center of mass
    for body in positions {
        for pos in body.iter().step_by(100) {
            sum_x += pos.x;
            sum_y += pos.y;
            count += 1;
        }
    }
    
    if count == 0 {
        return (0.5, 0.5);
    }
    
    let center_x = sum_x / count as f64;
    let center_y = sum_y / count as f64;
    
    // Normalize to 0-1 range
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    let norm_x = (center_x - min_x) / width;
    let norm_y = (center_y - min_y) / height;
    
    (norm_x.clamp(0.0, 1.0), norm_y.clamp(0.0, 1.0))
}

/// Compute adaptive margin based on content size relative to frame
fn compute_adaptive_margin(
    content_width: f64, content_height: f64,
    frame_width: f64, frame_height: f64,
) -> f64 {
    let frame_aspect = frame_width / frame_height;
    let content_aspect = content_width / content_height;
    
    // If content aspect matches frame aspect well, use smaller margins
    // If content aspect differs significantly, use larger margins
    let aspect_diff = ((content_aspect / frame_aspect) - 1.0).abs();
    
    // Map aspect difference to margin fraction
    // aspect_diff of 0 -> MIN_MARGIN, aspect_diff of 1 -> MAX_MARGIN
    let margin = MIN_MARGIN_FRACTION + aspect_diff.min(1.0) * (MAX_MARGIN_FRACTION - MIN_MARGIN_FRACTION);
    
    margin.clamp(MIN_MARGIN_FRACTION, MAX_MARGIN_FRACTION)
}

/// Analyze content to determine best framing mode
fn analyze_best_mode(visual_center: &(f64, f64), content_aspect: f64) -> FramingMode {
    // If visual center is near the actual center, simple bounding box is fine
    let center_offset = ((visual_center.0 - 0.5).powi(2) + (visual_center.1 - 0.5).powi(2)).sqrt();
    
    if center_offset < 0.1 {
        // Content is well-centered, use standard framing
        FramingMode::BoundingBox
    } else if !(1.0 / GOLDEN_RATIO..=GOLDEN_RATIO).contains(&content_aspect) {
        // Very elongated content benefits from golden ratio framing
        FramingMode::GoldenRatio
    } else {
        // Default to rule of thirds for most compositions
        FramingMode::RuleOfThirds
    }
}

/// Apply rule of thirds alignment by shifting bounds
fn apply_thirds_alignment(
    min_x: &mut f64, max_x: &mut f64,
    min_y: &mut f64, max_y: &mut f64,
    visual_center: &(f64, f64),
) {
    // Find nearest power point
    let (target_x, target_y) = find_nearest_thirds_point(visual_center);
    
    // Shift bounds to place visual center closer to power point
    let width = *max_x - *min_x;
    let height = *max_y - *min_y;
    
    // Desired center position in world coordinates
    let current_center_x = *min_x + visual_center.0 * width;
    let current_center_y = *min_y + visual_center.1 * height;
    
    let target_center_x = *min_x + target_x * width;
    let target_center_y = *min_y + target_y * height;
    
    // Shift by 50% of the difference (subtle adjustment)
    let shift_x = (target_center_x - current_center_x) * 0.5;
    let shift_y = (target_center_y - current_center_y) * 0.5;
    
    *min_x += shift_x;
    *max_x += shift_x;
    *min_y += shift_y;
    *max_y += shift_y;
}

/// Apply golden ratio alignment
fn apply_golden_alignment(
    min_x: &mut f64, max_x: &mut f64,
    min_y: &mut f64, max_y: &mut f64,
    visual_center: &(f64, f64),
) {
    // Find nearest golden point
    let (target_x, target_y) = find_nearest_golden_point(visual_center);
    
    // Shift bounds similar to thirds alignment
    let width = *max_x - *min_x;
    let height = *max_y - *min_y;
    
    let current_center_x = *min_x + visual_center.0 * width;
    let current_center_y = *min_y + visual_center.1 * height;
    
    let target_center_x = *min_x + target_x * width;
    let target_center_y = *min_y + target_y * height;
    
    let shift_x = (target_center_x - current_center_x) * 0.5;
    let shift_y = (target_center_y - current_center_y) * 0.5;
    
    *min_x += shift_x;
    *max_x += shift_x;
    *min_y += shift_y;
    *max_y += shift_y;
}

/// Find nearest rule of thirds power point
fn find_nearest_thirds_point(center: &(f64, f64)) -> (f64, f64) {
    let mut best = THIRDS_POWER_POINTS[0];
    let mut best_dist = f64::MAX;
    
    for &(px, py) in &THIRDS_POWER_POINTS {
        let dist = (center.0 - px).powi(2) + (center.1 - py).powi(2);
        if dist < best_dist {
            best_dist = dist;
            best = (px, py);
        }
    }
    
    best
}

/// Find nearest golden ratio power point
fn find_nearest_golden_point(center: &(f64, f64)) -> (f64, f64) {
    let golden_points = [
        (GOLDEN_POSITIONS[1], GOLDEN_POSITIONS[1]),
        (GOLDEN_POSITIONS[2], GOLDEN_POSITIONS[1]),
        (GOLDEN_POSITIONS[1], GOLDEN_POSITIONS[2]),
        (GOLDEN_POSITIONS[2], GOLDEN_POSITIONS[2]),
    ];
    
    let mut best = golden_points[0];
    let mut best_dist = f64::MAX;
    
    for &(px, py) in &golden_points {
        let dist = (center.0 - px).powi(2) + (center.1 - py).powi(2);
        if dist < best_dist {
            best_dist = dist;
            best = (px, py);
        }
    }
    
    best
}

/// Compute alignment score to power points (lower = better aligned)
fn compute_power_point_alignment(center: &(f64, f64)) -> f64 {
    // Find minimum distance to any power point
    let mut min_dist = f64::MAX;
    
    for &(px, py) in &THIRDS_POWER_POINTS {
        let dist = ((center.0 - px).powi(2) + (center.1 - py).powi(2)).sqrt();
        min_dist = min_dist.min(dist);
    }
    
    // Convert distance to score (0 = perfect alignment, 1 = worst case)
    // Maximum possible distance from power point is about 0.47 (diagonal)
    (min_dist / 0.47).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_positions(count: usize, offset: Vector3<f64>) -> Vec<Vector3<f64>> {
        (0..count)
            .map(|i| {
                let t = i as f64 / count as f64 * std::f64::consts::TAU;
                Vector3::new(
                    100.0 * t.cos() + offset.x,
                    100.0 * t.sin() + offset.y,
                    offset.z,
                )
            })
            .collect()
    }

    #[test]
    fn test_compute_bounds() {
        let pos1 = create_test_positions(100, Vector3::zeros());
        let pos2 = create_test_positions(100, Vector3::new(50.0, 50.0, 0.0));
        let positions = vec![pos1, pos2];
        
        let (min_x, max_x, min_y, max_y) = compute_bounds(&positions);
        
        assert!(min_x < max_x, "Min X should be less than max X");
        assert!(min_y < max_y, "Min Y should be less than max Y");
    }

    #[test]
    fn test_visual_center_centered() {
        let pos = create_test_positions(1000, Vector3::zeros());
        let positions = vec![pos];
        
        let (min_x, max_x, min_y, max_y) = compute_bounds(&positions);
        let center = compute_visual_center(&positions, min_x, max_x, min_y, max_y);
        
        // Circular orbit should be centered
        assert!((center.0 - 0.5).abs() < 0.1, "X center should be near 0.5: {}", center.0);
        assert!((center.1 - 0.5).abs() < 0.1, "Y center should be near 0.5: {}", center.1);
    }

    #[test]
    fn test_adaptive_margin() {
        // Matching aspect ratios should have small margins
        let margin_matching = compute_adaptive_margin(160.0, 90.0, 1920.0, 1080.0);
        assert!(margin_matching < 0.10, "Matching aspects should have small margin: {}", margin_matching);
        
        // Very different aspect ratios should have larger margins
        let margin_different = compute_adaptive_margin(100.0, 100.0, 1920.0, 1080.0);
        assert!(margin_different > margin_matching, "Different aspects should have larger margin");
    }

    #[test]
    fn test_thirds_power_points() {
        // Test that we find the correct power point
        let near_top_left = (0.3, 0.3);
        let result = find_nearest_thirds_point(&near_top_left);
        assert_eq!(result, (1.0 / 3.0, 1.0 / 3.0), "Should find top-left power point");
        
        let near_center = (0.5, 0.5);
        let result = find_nearest_thirds_point(&near_center);
        // Center is equidistant from all points, any is valid
        assert!(THIRDS_POWER_POINTS.contains(&result), "Should find some power point");
    }

    #[test]
    fn test_composition_analysis() {
        let pos1 = create_test_positions(1000, Vector3::zeros());
        let pos2 = create_test_positions(1000, Vector3::new(30.0, 20.0, 0.0));
        let pos3 = create_test_positions(1000, Vector3::new(-20.0, -30.0, 0.0));
        let positions = vec![pos1, pos2, pos3];
        
        let analysis = compute_composition(&positions, 1920, 1080, FramingMode::Automatic);
        
        assert!(analysis.margin_applied >= MIN_MARGIN_FRACTION, "Margin should be at least minimum");
        assert!(analysis.margin_applied <= MAX_MARGIN_FRACTION, "Margin should not exceed maximum");
        assert!(analysis.power_point_alignment >= 0.0 && analysis.power_point_alignment <= 1.0,
            "Power point alignment should be in [0,1]");
    }

    #[test]
    fn test_framing_modes() {
        let pos = create_test_positions(100, Vector3::zeros());
        let positions = vec![pos];
        
        let analysis_auto = compute_composition(&positions, 1920, 1080, FramingMode::Automatic);
        let analysis_thirds = compute_composition(&positions, 1920, 1080, FramingMode::RuleOfThirds);
        let analysis_golden = compute_composition(&positions, 1920, 1080, FramingMode::GoldenRatio);
        
        // All should produce valid results
        assert!(analysis_auto.adjusted_bounds.0 < analysis_auto.adjusted_bounds.1, "Auto mode bounds valid");
        assert!(analysis_thirds.adjusted_bounds.0 < analysis_thirds.adjusted_bounds.1, "Thirds mode bounds valid");
        assert!(analysis_golden.adjusted_bounds.0 < analysis_golden.adjusted_bounds.1, "Golden mode bounds valid");
    }
}

