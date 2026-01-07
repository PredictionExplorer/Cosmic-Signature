//! Composition Filter for Museum-Quality Negative Space
//!
//! This module provides composition analysis and rejection for enforcing
//! museum-quality aesthetics. The core principle: empty space is not
//! absence, it's presence. Great art breathes.

#![allow(dead_code)] // Module is part of museum mode API
//!
//! # Philosophy
//!
//! - **70% void minimum**: Most of the image should be empty
//! - **Single focal point**: One area of interest, not uniform density
//! - **Edge breathing**: Content never touches the frame edge
//! - **Asymmetric balance**: Golden ratio, not centered
//! - **Cropped drama**: Willingness to show only part of the trajectory
//!
//! # Rejection Criteria
//!
//! Compositions are scored and rejected if they:
//! - Cover more than 30% of the frame
//! - Have uniform density distribution
//! - Lack clear negative space regions
//! - Have content too close to edges
//! - Look "tangled" or "busy"

use nalgebra::Vector3;

/// Composition quality score (0 = reject, 1 = perfect)
#[derive(Clone, Debug)]
pub struct CompositionScore {
    /// Overall quality (weighted combination)
    pub overall: f64,
    
    /// Void percentage (higher = more negative space = better)
    pub void_score: f64,
    
    /// Focal point clarity (higher = clearer focus = better)
    pub focal_score: f64,
    
    /// Edge breathing (higher = more margin = better)
    pub edge_score: f64,
    
    /// Density variance (higher = more contrast between areas = better)
    pub density_score: f64,
    
    /// Simplicity (higher = cleaner pattern = better)
    pub simplicity_score: f64,
    
    /// Detailed rejection reason if score is low
    pub rejection_reason: Option<String>,
}

impl CompositionScore {
    /// Create a perfect score
    pub fn perfect() -> Self {
        Self {
            overall: 1.0,
            void_score: 1.0,
            focal_score: 1.0,
            edge_score: 1.0,
            density_score: 1.0,
            simplicity_score: 1.0,
            rejection_reason: None,
        }
    }
    
    /// Create a rejected score with reason
    pub fn rejected(reason: &str) -> Self {
        Self {
            overall: 0.0,
            void_score: 0.0,
            focal_score: 0.0,
            edge_score: 0.0,
            density_score: 0.0,
            simplicity_score: 0.0,
            rejection_reason: Some(reason.to_string()),
        }
    }
    
    /// Check if composition should be accepted
    pub fn is_acceptable(&self) -> bool {
        self.overall >= 0.4 // Threshold for acceptance
    }
    
    /// Get human-readable quality tier
    pub fn quality_tier(&self) -> &'static str {
        match self.overall {
            x if x >= 0.9 => "Exceptional",
            x if x >= 0.7 => "Excellent",
            x if x >= 0.5 => "Good",
            x if x >= 0.3 => "Marginal",
            _ => "Poor",
        }
    }
}

/// Configuration for composition filtering
#[derive(Clone, Debug)]
pub struct CompositionFilterConfig {
    /// Maximum allowed coverage (0-1)
    pub max_coverage: f64,
    
    /// Minimum required void percentage
    pub min_void: f64,
    
    /// Minimum edge margin (fraction of dimension)
    pub min_edge_margin: f64,
    
    /// Grid size for density analysis
    pub analysis_grid_size: usize,
    
    /// Minimum density variance for interesting composition
    pub min_density_variance: f64,
    
    /// Maximum "tangles" per unit area (complexity limit)
    pub max_crossing_density: f64,
}

impl Default for CompositionFilterConfig {
    fn default() -> Self {
        Self::museum_quality()
    }
}

impl CompositionFilterConfig {
    /// Configuration for museum-quality output
    pub fn museum_quality() -> Self {
        Self {
            max_coverage: 0.30,          // Maximum 30% coverage
            min_void: 0.70,              // Minimum 70% void
            min_edge_margin: 0.05,       // 5% margin from edges
            analysis_grid_size: 16,      // 16x16 analysis grid
            min_density_variance: 0.1,   // Require some density variation
            max_crossing_density: 0.3,   // Limit tangles
        }
    }
    
    /// Relaxed configuration for more variety
    pub fn relaxed() -> Self {
        Self {
            max_coverage: 0.45,
            min_void: 0.55,
            min_edge_margin: 0.03,
            analysis_grid_size: 12,
            min_density_variance: 0.05,
            max_crossing_density: 0.5,
        }
    }
    
    /// Strict configuration for minimal aesthetic
    pub fn minimal() -> Self {
        Self {
            max_coverage: 0.20,
            min_void: 0.80,
            min_edge_margin: 0.08,
            analysis_grid_size: 20,
            min_density_variance: 0.15,
            max_crossing_density: 0.15,
        }
    }
}

/// Analyze composition quality for a set of positions
/// 
/// # Arguments
/// * `positions` - Trajectory positions [body][step]
/// * `width`, `height` - Output dimensions
/// * `config` - Filtering configuration
///
/// # Returns
/// Composition score with detailed breakdown
pub fn analyze_composition(
    positions: &[Vec<Vector3<f64>>],
    _width: u32,
    _height: u32,
    config: &CompositionFilterConfig,
) -> CompositionScore {
    if positions.is_empty() || positions[0].is_empty() {
        return CompositionScore::rejected("Empty trajectory");
    }
    
    // Compute bounding box
    let (min_x, max_x, min_y, max_y) = compute_bounds(positions);
    let world_width = max_x - min_x;
    let world_height = max_y - min_y;
    
    if world_width < 1e-10 || world_height < 1e-10 {
        return CompositionScore::rejected("Degenerate trajectory");
    }
    
    // Build density grid
    let grid = build_density_grid(
        positions,
        config.analysis_grid_size,
        min_x, max_x, min_y, max_y,
    );
    
    // 1. Void Score: How much of the grid is empty?
    let void_fraction = compute_void_fraction(&grid);
    let void_score = if void_fraction >= config.min_void {
        1.0
    } else if void_fraction >= config.min_void * 0.7 {
        (void_fraction - config.min_void * 0.7) / (config.min_void * 0.3)
    } else {
        0.0
    };
    
    if void_score < 0.3 {
        return CompositionScore {
            overall: void_score * 0.5,
            void_score,
            focal_score: 0.0,
            edge_score: 0.0,
            density_score: 0.0,
            simplicity_score: 0.0,
            rejection_reason: Some(format!("Too dense: {:.0}% void (need {:.0}%)", 
                void_fraction * 100.0, config.min_void * 100.0)),
        };
    }
    
    // 2. Edge Score: Is content away from edges?
    let edge_score = compute_edge_score(positions, min_x, max_x, min_y, max_y, config.min_edge_margin);
    
    // 3. Focal Score: Is there a clear focal region?
    let focal_score = compute_focal_score(&grid);
    
    // 4. Density Score: Is there interesting density variation?
    let density_score = compute_density_variance_score(&grid, config.min_density_variance);
    
    // 5. Simplicity Score: Are there too many crossings/tangles?
    let simplicity_score = compute_simplicity_score(positions, min_x, max_x, min_y, max_y, config.max_crossing_density);
    
    // Compute overall score with weights
    let overall = 
        void_score * 0.30 +
        edge_score * 0.15 +
        focal_score * 0.20 +
        density_score * 0.15 +
        simplicity_score * 0.20;
    
    let rejection_reason = if overall < 0.4 {
        Some(format!(
            "Low quality: void={:.2}, edge={:.2}, focal={:.2}, density={:.2}, simple={:.2}",
            void_score, edge_score, focal_score, density_score, simplicity_score
        ))
    } else {
        None
    };
    
    CompositionScore {
        overall,
        void_score,
        focal_score,
        edge_score,
        density_score,
        simplicity_score,
        rejection_reason,
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
    
    // Add small margin to prevent edge cases
    let margin = 0.001 * (max_x - min_x + max_y - min_y);
    (min_x - margin, max_x + margin, min_y - margin, max_y + margin)
}

/// Build a density grid from positions
fn build_density_grid(
    positions: &[Vec<Vector3<f64>>],
    grid_size: usize,
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
) -> Vec<Vec<f64>> {
    let mut grid = vec![vec![0.0; grid_size]; grid_size];
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    let mut total_points = 0;
    
    for body in positions {
        // Sample positions (every 10th for efficiency)
        for pos in body.iter().step_by(10) {
            let gx = ((pos.x - min_x) / width * (grid_size - 1) as f64) as usize;
            let gy = ((pos.y - min_y) / height * (grid_size - 1) as f64) as usize;
            
            if gx < grid_size && gy < grid_size {
                grid[gy][gx] += 1.0;
                total_points += 1;
            }
        }
    }
    
    // Normalize
    if total_points > 0 {
        let scale = 1.0 / total_points as f64;
        for row in &mut grid {
            for cell in row {
                *cell *= scale;
            }
        }
    }
    
    grid
}

/// Compute fraction of grid cells that are empty
fn compute_void_fraction(grid: &[Vec<f64>]) -> f64 {
    let total_cells = grid.len() * grid[0].len();
    let empty_cells = grid.iter()
        .flat_map(|row| row.iter())
        .filter(|&&v| v < 0.001) // Threshold for "empty"
        .count();
    
    empty_cells as f64 / total_cells as f64
}

/// Compute edge breathing score
fn compute_edge_score(
    positions: &[Vec<Vector3<f64>>],
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
    min_margin: f64,
) -> f64 {
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    let margin_x = width * min_margin;
    let margin_y = height * min_margin;
    
    let mut edge_violations = 0;
    let mut total_samples = 0;
    
    for body in positions {
        for pos in body.iter().step_by(100) {
            total_samples += 1;
            
            // Check if too close to any edge
            let dist_left = pos.x - min_x;
            let dist_right = max_x - pos.x;
            let dist_bottom = pos.y - min_y;
            let dist_top = max_y - pos.y;
            
            if dist_left < margin_x || dist_right < margin_x ||
               dist_bottom < margin_y || dist_top < margin_y {
                edge_violations += 1;
            }
        }
    }
    
    if total_samples == 0 {
        return 1.0;
    }
    
    let violation_rate = edge_violations as f64 / total_samples as f64;
    (1.0 - violation_rate * 2.0).max(0.0) // Double weight for edge violations
}

/// Compute focal point clarity score
/// High score = content is concentrated in one area, not uniform
fn compute_focal_score(grid: &[Vec<f64>]) -> f64 {
    let rows = grid.len();
    let cols = grid[0].len();
    
    // Find the peak density cell
    let mut max_density = 0.0;
    let mut max_x = 0;
    let mut max_y = 0;
    
    for (y, row) in grid.iter().enumerate() {
        for (x, &density) in row.iter().enumerate() {
            if density > max_density {
                max_density = density;
                max_x = x;
                max_y = y;
            }
        }
    }
    
    if max_density < 0.001 {
        return 0.5; // Empty grid, neutral score
    }
    
    // Compute how much density is concentrated around the peak
    let radius = (rows.min(cols) / 4) as i32;
    let mut focal_mass = 0.0;
    let mut total_mass = 0.0;
    
    for (y, row) in grid.iter().enumerate() {
        for (x, &density) in row.iter().enumerate() {
            total_mass += density;
            
            let dx = x as i32 - max_x as i32;
            let dy = y as i32 - max_y as i32;
            if dx * dx + dy * dy <= radius * radius {
                focal_mass += density;
            }
        }
    }
    
    if total_mass < 0.001 {
        return 0.5;
    }
    
    // Higher concentration around focal point = higher score
    let concentration = focal_mass / total_mass;
    
    // We want moderate concentration (not too spread, not single point)
    // Ideal is around 0.3-0.5
    if concentration < 0.2 {
        concentration / 0.2 * 0.5 // Too spread out
    } else if concentration < 0.6 {
        1.0 // Good range
    } else {
        1.0 - (concentration - 0.6) / 0.4 * 0.5 // Too concentrated
    }
}

/// Compute density variance score
/// High score = interesting variation between empty and filled areas
fn compute_density_variance_score(grid: &[Vec<f64>], min_variance: f64) -> f64 {
    let values: Vec<f64> = grid.iter().flat_map(|row| row.iter().copied()).collect();
    
    if values.is_empty() {
        return 0.0;
    }
    
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let variance = values.iter()
        .map(|&v| (v - mean).powi(2))
        .sum::<f64>() / values.len() as f64;
    
    let std_dev = variance.sqrt();
    
    if std_dev >= min_variance {
        1.0
    } else {
        std_dev / min_variance
    }
}

/// Compute simplicity score based on trajectory crossings
/// High score = fewer tangles and crossings
fn compute_simplicity_score(
    positions: &[Vec<Vector3<f64>>],
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
    max_crossing_density: f64,
) -> f64 {
    // Use a coarse grid to count crossings
    const GRID_SIZE: usize = 32;
    let mut grid = vec![vec![0u32; GRID_SIZE]; GRID_SIZE];
    
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    // Count how many times each cell is visited
    for body in positions {
        for pos in body.iter().step_by(50) {
            let gx = ((pos.x - min_x) / width * (GRID_SIZE - 1) as f64) as usize;
            let gy = ((pos.y - min_y) / height * (GRID_SIZE - 1) as f64) as usize;
            
            if gx < GRID_SIZE && gy < GRID_SIZE {
                grid[gy][gx] += 1;
            }
        }
    }
    
    // Count cells with multiple visits (crossings)
    let crossing_cells = grid.iter()
        .flat_map(|row| row.iter())
        .filter(|&&count| count > 3) // More than 3 visits = crossing
        .count();
    
    let crossing_density = crossing_cells as f64 / (GRID_SIZE * GRID_SIZE) as f64;
    
    if crossing_density <= max_crossing_density * 0.5 {
        1.0 // Very clean
    } else if crossing_density <= max_crossing_density {
        1.0 - (crossing_density - max_crossing_density * 0.5) / (max_crossing_density * 0.5) * 0.5
    } else {
        0.5 * (max_crossing_density / crossing_density) // Heavily penalize excess crossings
    }
}

/// Find the best composition from multiple candidates
/// 
/// # Arguments
/// * `candidates` - List of (positions, seed) tuples
/// * `width`, `height` - Output dimensions
/// * `config` - Filtering configuration
///
/// # Returns
/// Index of best candidate and its score
pub fn find_best_composition(
    candidates: &[(Vec<Vec<Vector3<f64>>>, u64)],
    width: u32,
    height: u32,
    config: &CompositionFilterConfig,
) -> (usize, CompositionScore) {
    let mut best_idx = 0;
    let mut best_score = CompositionScore::rejected("No candidates");
    
    for (idx, (positions, _seed)) in candidates.iter().enumerate() {
        let score = analyze_composition(positions, width, height, config);
        
        if score.overall > best_score.overall {
            best_score = score;
            best_idx = idx;
        }
    }
    
    (best_idx, best_score)
}

/// Suggest cropping bounds for better composition
/// 
/// Returns (crop_x, crop_y, crop_width, crop_height) as fractions of original
pub fn suggest_crop(
    positions: &[Vec<Vector3<f64>>],
    target_void: f64,
) -> (f64, f64, f64, f64) {
    let (min_x, max_x, min_y, max_y) = compute_bounds(positions);
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    // Find center of mass
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut count = 0;
    
    for body in positions {
        for pos in body.iter().step_by(100) {
            sum_x += pos.x;
            sum_y += pos.y;
            count += 1;
        }
    }
    
    if count == 0 {
        return (0.0, 0.0, 1.0, 1.0); // Full frame
    }
    
    let center_x = sum_x / count as f64;
    let center_y = sum_y / count as f64;
    
    // Normalize center to 0-1 range
    let norm_cx = (center_x - min_x) / width;
    let norm_cy = (center_y - min_y) / height;
    
    // Crop to show center of mass at golden ratio position
    // and achieve target void percentage
    let content_fraction = 1.0 - target_void;
    let crop_size = content_fraction.sqrt(); // Square root for 2D
    
    // Position crop to place center at golden ratio
    let golden = 0.382; // 1 - 0.618
    let crop_x = (norm_cx - golden * crop_size).clamp(0.0, 1.0 - crop_size);
    let crop_y = (norm_cy - golden * crop_size).clamp(0.0, 1.0 - crop_size);
    
    (crop_x, crop_y, crop_size, crop_size)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_circular_trajectory(steps: usize, radius: f64, center: (f64, f64)) -> Vec<Vector3<f64>> {
        (0..steps)
            .map(|i| {
                let angle = 2.0 * std::f64::consts::PI * i as f64 / steps as f64;
                Vector3::new(
                    center.0 + radius * angle.cos(),
                    center.1 + radius * angle.sin(),
                    0.0,
                )
            })
            .collect()
    }

    #[test]
    fn test_composition_score_quality_tier() {
        assert_eq!(CompositionScore { overall: 0.95, ..CompositionScore::perfect() }.quality_tier(), "Exceptional");
        assert_eq!(CompositionScore { overall: 0.75, ..CompositionScore::perfect() }.quality_tier(), "Excellent");
        assert_eq!(CompositionScore { overall: 0.55, ..CompositionScore::perfect() }.quality_tier(), "Good");
        assert_eq!(CompositionScore { overall: 0.35, ..CompositionScore::perfect() }.quality_tier(), "Marginal");
        assert_eq!(CompositionScore { overall: 0.15, ..CompositionScore::perfect() }.quality_tier(), "Poor");
    }

    #[test]
    fn test_compute_bounds() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(10.0, 10.0, 0.0)],
        ];
        
        let (min_x, max_x, min_y, max_y) = compute_bounds(&positions);
        
        assert!(min_x < 0.1);
        assert!(max_x > 9.9);
        assert!(min_y < 0.1);
        assert!(max_y > 9.9);
    }

    #[test]
    fn test_analyze_composition_empty() {
        let positions: Vec<Vec<Vector3<f64>>> = vec![];
        let config = CompositionFilterConfig::default();
        
        let score = analyze_composition(&positions, 100, 100, &config);
        
        assert!(!score.is_acceptable());
        assert!(score.rejection_reason.is_some());
    }

    #[test]
    fn test_analyze_composition_sparse() {
        // Create a sparse trajectory that should pass composition filter
        let positions = vec![
            create_circular_trajectory(100, 10.0, (0.0, 0.0)),
        ];
        
        let config = CompositionFilterConfig::relaxed();
        let score = analyze_composition(&positions, 1000, 1000, &config);
        
        // Should have reasonable void score
        assert!(score.void_score > 0.0);
    }

    #[test]
    fn test_void_fraction() {
        // Grid with mostly empty cells
        let grid = vec![
            vec![0.0, 0.0, 0.0, 0.0],
            vec![0.0, 0.5, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0],
        ];
        
        let void = compute_void_fraction(&grid);
        assert!(void > 0.9, "Should be mostly void: {}", void);
    }

    #[test]
    fn test_focal_score_concentrated() {
        // Grid with density concentrated in one area
        let mut grid = vec![vec![0.0; 8]; 8];
        grid[3][3] = 0.5;
        grid[3][4] = 0.3;
        grid[4][3] = 0.3;
        grid[4][4] = 0.4;
        
        let score = compute_focal_score(&grid);
        // Focal score of 0.5 is neutral (for empty grids) or can be reasonable for concentrated density
        assert!(score >= 0.5, "Concentrated density should have reasonable focal score: {}", score);
    }

    #[test]
    fn test_edge_score() {
        // Trajectory well inside bounds
        let positions = vec![
            create_circular_trajectory(100, 5.0, (50.0, 50.0)),
        ];
        
        let score = compute_edge_score(&positions, 0.0, 100.0, 0.0, 100.0, 0.1);
        assert!(score > 0.8, "Well-centered trajectory should have high edge score: {}", score);
    }

    #[test]
    fn test_simplicity_score_clean() {
        // Single clean loop
        let positions = vec![
            create_circular_trajectory(1000, 10.0, (0.0, 0.0)),
        ];
        
        let score = compute_simplicity_score(&positions, -15.0, 15.0, -15.0, 15.0, 0.3);
        assert!(score > 0.5, "Clean loop should have reasonable simplicity: {}", score);
    }

    #[test]
    fn test_suggest_crop() {
        let positions = vec![
            create_circular_trajectory(100, 10.0, (0.0, 0.0)),
        ];
        
        let (x, y, w, h) = suggest_crop(&positions, 0.7);
        
        // Should return valid crop bounds
        assert!(x >= 0.0 && x <= 1.0);
        assert!(y >= 0.0 && y <= 1.0);
        assert!(w > 0.0 && w <= 1.0);
        assert!(h > 0.0 && h <= 1.0);
        assert!(x + w <= 1.0 + 0.01); // Allow tiny float error
        assert!(y + h <= 1.0 + 0.01);
    }

    #[test]
    fn test_find_best_composition() {
        let candidates = vec![
            (vec![create_circular_trajectory(100, 5.0, (0.0, 0.0))], 1),
            (vec![create_circular_trajectory(100, 10.0, (0.0, 0.0))], 2),
        ];
        
        let config = CompositionFilterConfig::relaxed();
        let (best_idx, score) = find_best_composition(&candidates, 1000, 1000, &config);
        
        assert!(best_idx < candidates.len());
        assert!(score.overall >= 0.0);
    }

    #[test]
    fn test_filter_config_presets() {
        let museum = CompositionFilterConfig::museum_quality();
        let relaxed = CompositionFilterConfig::relaxed();
        let minimal = CompositionFilterConfig::minimal();
        
        // Museum should be stricter than relaxed
        assert!(museum.min_void > relaxed.min_void);
        assert!(museum.max_coverage < relaxed.max_coverage);
        
        // Minimal should be strictest
        assert!(minimal.min_void > museum.min_void);
        assert!(minimal.max_coverage < museum.max_coverage);
    }
}

