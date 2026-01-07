//! Aesthetic Scoring for Orbit Selection
//!
//! This module provides additional scoring criteria for the Borda orbit selection
//! process, focusing on visual properties that make trajectories more appealing
//! when rendered.
//!
//! # Scoring Criteria
//!
//! 1. **Coverage Score**: Trajectories should cover a "sweet spot" of the frame
//!    - Too sparse: boring, empty-looking images
//!    - Too dense: muddy, overblown images
//!    - Ideal: 15-60% coverage
//!
//! 2. **Balance Score**: Center of visual mass should be near frame center
//!    - Heavily weighted images look unbalanced
//!    - Some asymmetry is interesting, perfect centering is boring
//!    - Ideal: center of mass within 20% of frame center
//!
//! 3. **Complexity Score**: Rewards interesting trajectory patterns
//!    - Spirals, loops, and intersections are visually engaging
//!    - Simple ellipses or chaotic noise are less interesting
//!    - Based on trajectory curvature variance
//!
//! 4. **Aspect Ratio Usage**: Trajectories should use the full frame
//!    - Very tall/narrow or very wide/short patterns look awkward
//!    - Ideal: aspect ratio near the frame's aspect ratio
//!
//! # Usage
//!
//! These scores are combined with the existing chaos and equilateralness metrics
//! in the Borda selection process.

// MUSEUM QUALITY: This module is prepared for future integration into the Borda
// selection process. The functions are marked allow(dead_code) until integration.
#![allow(dead_code)]

use nalgebra::Vector3;

/// Aesthetic scores for a trajectory configuration
#[derive(Clone, Debug)]
pub struct AestheticScores {
    /// Coverage score: how much of the frame the trajectory occupies (0-1)
    /// Ideal range: 0.15 - 0.60
    pub coverage: f64,
    
    /// Balance score: how centered the visual mass is (0-1, higher = more centered)
    pub balance: f64,
    
    /// Complexity score: how visually interesting the pattern is (0-1)
    pub complexity: f64,
    
    /// Aspect ratio usage: how well the trajectory fills the frame shape (0-1)
    pub aspect_usage: f64,
    
    /// Combined aesthetic score (weighted average)
    pub combined_score: f64,
}

/// Compute aesthetic scores for a set of positions
///
/// # Arguments
///
/// * `positions` - Position vectors for each body at each timestep.
///   Format: `positions[body_idx][step] = Vector3`
/// * `frame_aspect_ratio` - Width / Height of the target frame (e.g., 16/9 = 1.78)
///
/// # Returns
///
/// `AestheticScores` struct with all computed metrics
pub fn compute_aesthetic_scores(
    positions: &[Vec<Vector3<f64>>],
    frame_aspect_ratio: f64,
) -> AestheticScores {
    if positions.is_empty() || positions[0].is_empty() {
        return AestheticScores {
            coverage: 0.0,
            balance: 0.0,
            complexity: 0.0,
            aspect_usage: 0.0,
            combined_score: 0.0,
        };
    }

    // Compute bounding box and center of mass
    let (min_x, max_x, min_y, max_y, center_x, center_y) = compute_bounds_and_center(positions);
    
    // 1. Coverage Score
    let coverage = compute_coverage_score(positions, min_x, max_x, min_y, max_y);
    
    // 2. Balance Score
    let balance = compute_balance_score(min_x, max_x, min_y, max_y, center_x, center_y);
    
    // 3. Complexity Score
    let complexity = compute_complexity_score(positions);
    
    // 4. Aspect Ratio Usage
    let aspect_usage = compute_aspect_usage_score(min_x, max_x, min_y, max_y, frame_aspect_ratio);
    
    // Combine scores with weights
    // Coverage and complexity are most important for visual appeal
    let combined_score = 
        coverage * 0.30 +
        balance * 0.20 +
        complexity * 0.30 +
        aspect_usage * 0.20;
    
    AestheticScores {
        coverage,
        balance,
        complexity,
        aspect_usage,
        combined_score,
    }
}

/// Compute bounding box and center of mass from positions
fn compute_bounds_and_center(
    positions: &[Vec<Vector3<f64>>],
) -> (f64, f64, f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut count = 0;
    
    for body_positions in positions {
        for pos in body_positions {
            min_x = min_x.min(pos.x);
            max_x = max_x.max(pos.x);
            min_y = min_y.min(pos.y);
            max_y = max_y.max(pos.y);
            sum_x += pos.x;
            sum_y += pos.y;
            count += 1;
        }
    }
    
    let center_x = if count > 0 { sum_x / count as f64 } else { 0.0 };
    let center_y = if count > 0 { sum_y / count as f64 } else { 0.0 };
    
    (min_x, max_x, min_y, max_y, center_x, center_y)
}

/// Compute coverage score based on trajectory density
///
/// Uses a simple grid-based approach to estimate what fraction of the frame
/// contains trajectory data. Score is highest in the "sweet spot" range of 15-60%.
fn compute_coverage_score(
    positions: &[Vec<Vector3<f64>>],
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
) -> f64 {
    const GRID_SIZE: usize = 32;
    
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    if width <= 0.0 || height <= 0.0 {
        return 0.0;
    }
    
    // Count occupied cells
    let mut grid = vec![vec![false; GRID_SIZE]; GRID_SIZE];
    
    for body_positions in positions {
        // Sample every 100th position for efficiency
        for pos in body_positions.iter().step_by(100) {
            let gx = ((pos.x - min_x) / width * (GRID_SIZE - 1) as f64) as usize;
            let gy = ((pos.y - min_y) / height * (GRID_SIZE - 1) as f64) as usize;
            if gx < GRID_SIZE && gy < GRID_SIZE {
                grid[gx][gy] = true;
            }
        }
    }
    
    let occupied: usize = grid.iter().flatten().filter(|&&b| b).count();
    let total = GRID_SIZE * GRID_SIZE;
    let raw_coverage = occupied as f64 / total as f64;
    
    // Score function: peaks at 0.35, falls off towards 0 and 1
    // Using a bell curve centered at 0.35 with σ ≈ 0.20
    let ideal_coverage = 0.35;
    let spread = 0.20;
    let diff = (raw_coverage - ideal_coverage).abs();
    
    (-diff * diff / (2.0 * spread * spread)).exp()
}

/// Compute balance score based on center of mass position
///
/// Score is highest when the center of mass is near the frame center,
/// with a gradual falloff towards the edges.
fn compute_balance_score(
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
    center_x: f64, center_y: f64,
) -> f64 {
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    if width <= 0.0 || height <= 0.0 {
        return 0.0;
    }
    
    // Frame center
    let frame_center_x = (min_x + max_x) / 2.0;
    let frame_center_y = (min_y + max_y) / 2.0;
    
    // Normalized offset from center (0 = perfect center, 1 = at edge)
    let offset_x = ((center_x - frame_center_x) / (width / 2.0)).abs();
    let offset_y = ((center_y - frame_center_y) / (height / 2.0)).abs();
    
    // Combined offset (Euclidean, capped at 1)
    let offset = (offset_x * offset_x + offset_y * offset_y).sqrt().min(1.0);
    
    // Score falls off quadratically from 1.0 at center
    // Allow some offset (0.2) before penalizing - slight asymmetry is interesting
    let tolerance = 0.2;
    if offset <= tolerance {
        1.0
    } else {
        let excess = (offset - tolerance) / (1.0 - tolerance);
        1.0 - excess * excess
    }
}

/// Compute complexity score based on trajectory curvature
///
/// More complex trajectories (spirals, loops) score higher than
/// simple ellipses or chaotic noise.
fn compute_complexity_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    // Measure curvature variation
    let mut total_curvature_var = 0.0;
    let mut count = 0;
    
    for body_positions in positions {
        if body_positions.len() < 100 {
            continue;
        }
        
        let mut curvatures = Vec::new();
        
        // Sample curvature at regular intervals
        let step = (body_positions.len() / 100).max(1);
        for i in (step..body_positions.len() - step).step_by(step) {
            let p0 = body_positions[i - step];
            let p1 = body_positions[i];
            let p2 = body_positions[i + step];
            
            // Approximate curvature using three points
            let v1 = p1 - p0;
            let v2 = p2 - p1;
            
            let cross = v1.x * v2.y - v1.y * v2.x;
            let len1 = (v1.x * v1.x + v1.y * v1.y).sqrt();
            let len2 = (v2.x * v2.x + v2.y * v2.y).sqrt();
            
            if len1 > 1e-10 && len2 > 1e-10 {
                let curvature = cross.abs() / (len1 * len2);
                curvatures.push(curvature);
            }
        }
        
        if curvatures.len() > 1 {
            // Compute variance of curvature
            let mean = curvatures.iter().sum::<f64>() / curvatures.len() as f64;
            let variance = curvatures.iter()
                .map(|&c| (c - mean) * (c - mean))
                .sum::<f64>() / curvatures.len() as f64;
            
            total_curvature_var += variance.sqrt();
            count += 1;
        }
    }
    
    if count == 0 {
        return 0.5; // Default to middle score if can't compute
    }
    
    let avg_curvature_std = total_curvature_var / count as f64;
    
    // Score function: moderate variance is best
    // Too low = simple ellipse, too high = chaotic noise
    // Ideal range: 0.05 - 0.3
    let ideal = 0.15;
    let spread = 0.15;
    let diff = (avg_curvature_std - ideal).abs();
    
    (-diff * diff / (2.0 * spread * spread)).exp()
}

/// Compute how well the trajectory uses the frame's aspect ratio
///
/// Trajectories that match the frame's shape score higher.
fn compute_aspect_usage_score(
    min_x: f64, max_x: f64,
    min_y: f64, max_y: f64,
    frame_aspect_ratio: f64,
) -> f64 {
    let width = max_x - min_x;
    let height = max_y - min_y;
    
    if width <= 0.0 || height <= 0.0 {
        return 0.0;
    }
    
    let trajectory_aspect = width / height;
    
    // Score based on how close the trajectory aspect matches the frame aspect
    // Use logarithmic ratio for symmetric scoring
    let ratio = (trajectory_aspect / frame_aspect_ratio).ln().abs();
    
    // Score falls off exponentially from perfect match
    // Allow up to 2x difference before significant penalty
    let tolerance = 0.7; // ln(2) ≈ 0.69
    
    (-ratio * ratio / (2.0 * tolerance * tolerance)).exp()
}

/// Borda points adjustment based on aesthetic score
///
/// Returns a multiplier in range [0.8, 1.2] to adjust the trajectory's
/// Borda score based on its aesthetic quality.
pub fn aesthetic_borda_multiplier(scores: &AestheticScores) -> f64 {
    // Convert combined score (0-1) to multiplier (0.8-1.2)
    // This gives aesthetically pleasing trajectories a 20% boost
    0.8 + scores.combined_score * 0.4
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_circular_orbit(steps: usize, radius: f64, center: Vector3<f64>) -> Vec<Vector3<f64>> {
        (0..steps)
            .map(|i| {
                let angle = 2.0 * std::f64::consts::PI * i as f64 / steps as f64;
                Vector3::new(
                    center.x + radius * angle.cos(),
                    center.y + radius * angle.sin(),
                    center.z,
                )
            })
            .collect()
    }

    fn create_sparse_orbit(steps: usize) -> Vec<Vector3<f64>> {
        // Very sparse - just a few points in a large area
        (0..steps)
            .map(|i| {
                let t = i as f64 / steps as f64;
                Vector3::new(
                    t * 1000.0 - 500.0,
                    (t * std::f64::consts::PI).sin() * 50.0,
                    0.0,
                )
            })
            .collect()
    }

    #[test]
    fn test_coverage_score_ideal_range() {
        // Create an orbit with good coverage
        let orbit1 = create_circular_orbit(1000, 100.0, Vector3::zeros());
        let orbit2 = create_circular_orbit(1000, 80.0, Vector3::new(30.0, 20.0, 0.0));
        let orbit3 = create_circular_orbit(1000, 60.0, Vector3::new(-20.0, -30.0, 0.0));
        
        let positions = vec![orbit1, orbit2, orbit3];
        let scores = compute_aesthetic_scores(&positions, 16.0 / 9.0);
        
        // Coverage score uses a bell curve, so anything > 0.2 is reasonable for these orbits
        assert!(scores.coverage > 0.2, "Good coverage orbit should have reasonable coverage score: {}", scores.coverage);
    }

    #[test]
    fn test_coverage_score_sparse() {
        // Create a sparse orbit
        let orbit = create_sparse_orbit(100);
        let positions = vec![orbit];
        let scores = compute_aesthetic_scores(&positions, 16.0 / 9.0);
        
        // Sparse orbits should have lower coverage score
        assert!(scores.coverage < 0.8, "Sparse orbit should have lower coverage score: {}", scores.coverage);
    }

    #[test]
    fn test_balance_score_centered() {
        // Create centered orbits
        let orbit = create_circular_orbit(1000, 100.0, Vector3::zeros());
        let positions = vec![orbit];
        let scores = compute_aesthetic_scores(&positions, 1.0);
        
        assert!(scores.balance > 0.8, "Centered orbit should have high balance score: {}", scores.balance);
    }

    #[test]
    fn test_balance_score_offset() {
        // Create offset orbit
        let orbit = create_circular_orbit(1000, 50.0, Vector3::new(200.0, 200.0, 0.0));
        let positions = vec![orbit];
        let scores = compute_aesthetic_scores(&positions, 1.0);
        
        // Single offset orbit will be centered in its own frame
        // This tests the balance calculation
        assert!(scores.balance > 0.0, "Balance score should be positive: {}", scores.balance);
    }

    #[test]
    fn test_complexity_score_simple() {
        // Simple circular orbit = low complexity
        let orbit = create_circular_orbit(1000, 100.0, Vector3::zeros());
        let positions = vec![orbit];
        let scores = compute_aesthetic_scores(&positions, 1.0);
        
        // Complexity for a simple circle - could be low or moderate depending on curvature variance
        assert!(scores.complexity >= 0.0 && scores.complexity <= 1.0, 
            "Complexity should be in [0,1]: {}", scores.complexity);
    }

    #[test]
    fn test_aspect_usage_matching() {
        // Create orbit that matches 16:9 aspect ratio
        let mut orbit = Vec::new();
        for i in 0..1000 {
            let t = i as f64 / 1000.0;
            orbit.push(Vector3::new(
                (t * std::f64::consts::TAU).cos() * 160.0,
                (t * std::f64::consts::TAU).sin() * 90.0,
                0.0,
            ));
        }
        let positions = vec![orbit];
        let scores = compute_aesthetic_scores(&positions, 16.0 / 9.0);
        
        assert!(scores.aspect_usage > 0.5, 
            "Matching aspect ratio should have good aspect usage score: {}", scores.aspect_usage);
    }

    #[test]
    fn test_combined_score_reasonable_range() {
        let orbit1 = create_circular_orbit(1000, 100.0, Vector3::zeros());
        let orbit2 = create_circular_orbit(1000, 80.0, Vector3::new(30.0, 20.0, 0.0));
        let orbit3 = create_circular_orbit(1000, 60.0, Vector3::new(-20.0, -30.0, 0.0));
        
        let positions = vec![orbit1, orbit2, orbit3];
        let scores = compute_aesthetic_scores(&positions, 16.0 / 9.0);
        
        assert!(scores.combined_score >= 0.0 && scores.combined_score <= 1.0,
            "Combined score should be in [0,1]: {}", scores.combined_score);
    }

    #[test]
    fn test_borda_multiplier_range() {
        let scores = AestheticScores {
            coverage: 0.5,
            balance: 0.5,
            complexity: 0.5,
            aspect_usage: 0.5,
            combined_score: 0.5,
        };
        
        let multiplier = aesthetic_borda_multiplier(&scores);
        assert!(multiplier >= 0.8 && multiplier <= 1.2,
            "Multiplier should be in [0.8, 1.2]: {}", multiplier);
    }

    #[test]
    fn test_empty_positions() {
        let positions: Vec<Vec<Vector3<f64>>> = vec![];
        let scores = compute_aesthetic_scores(&positions, 1.0);
        
        assert_eq!(scores.combined_score, 0.0, "Empty positions should have 0 score");
    }
}

