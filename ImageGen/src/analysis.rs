//! Analysis module for orbit scoring and composition metrics
//!
//! This module provides various scoring functions used in Borda selection
//! to find aesthetically interesting and visually pleasing orbits.

use crate::sim::{Body, G};
use crate::utils::fourier_transform;
use nalgebra::Vector3;
use statrs::statistics::Statistics;

// ==================== AESTHETIC WEIGHTS ====================

#[derive(Clone, Copy, Debug)]
pub struct AestheticWeights {
    pub chaos: f64,
    pub equilateralness: f64,
    pub golden_ratio: f64,
    pub negative_space: f64,
    pub symmetry: f64,
    pub density: f64,
    pub preview: f64,
}

impl Default for AestheticWeights {
    fn default() -> Self {
        Self {
            chaos: 1.0,
            equilateralness: 8.5,
            golden_ratio: 0.0,
            negative_space: 0.0,
            symmetry: 0.0,
            density: 0.0,
            preview: 0.0,
        }
    }
}

impl AestheticWeights {
    pub fn gallery() -> Self {
        Self {
            chaos: 1.0,
            equilateralness: 8.0,
            golden_ratio: 3.0,
            negative_space: 2.4,
            symmetry: 1.6,
            density: 1.2,
            preview: 1.5,
        }
    }
}

// ==================== PHYSICAL METRICS ====================

/// Total energy: kinetic + potential
pub fn calculate_total_energy(bodies: &[Body]) -> f64 {
    let mut kin = 0.0;
    let mut pot = 0.0;
    for b in bodies {
        kin += crate::render::constants::KINETIC_ENERGY_FACTOR * b.mass * b.velocity.norm_squared();
    }
    let n = bodies.len(); // Cache length to avoid repeated calls
    for i in 0..n {
        for j in (i + 1)..n {
            let r = (bodies[i].position - bodies[j].position).norm();
            if r > 1e-10 {
                pot += -G * bodies[i].mass * bodies[j].mass / r;
            }
        }
    }
    kin + pot
}

/// Total angular momentum vector
pub fn calculate_total_angular_momentum(bodies: &[Body]) -> Vector3<f64> {
    let mut total_l = Vector3::zeros();
    for b in bodies {
        total_l += b.mass * b.position.cross(&b.velocity);
    }
    total_l
}

/// A measure of "regularity" vs "chaos", smaller => more chaotic
pub fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &[Vec<Vector3<f64>>]) -> f64 {
    let len = positions[0].len();
    if len == 0 {
        return 0.0;
    }
    let mut r1 = vec![0.0; len];
    let mut r2 = vec![0.0; len];
    let mut r3 = vec![0.0; len];
    for i in 0..len {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];
        let cm1 = (m2 * p2 + m3 * p3) / (m2 + m3);
        let cm2 = (m1 * p1 + m3 * p3) / (m1 + m3);
        let cm3 = (m1 * p1 + m2 * p2) / (m1 + m2);
        r1[i] = (p1 - cm1).norm();
        r2[i] = (p2 - cm2).norm();
        r3[i] = (p3 - cm3).norm();
    }
    let abs1: Vec<f64> = fourier_transform(&r1).iter().map(|c| c.norm()).collect();
    let abs2: Vec<f64> = fourier_transform(&r2).iter().map(|c| c.norm()).collect();
    let abs3: Vec<f64> = fourier_transform(&r3).iter().map(|c| c.norm()).collect();
    let sd1 = Statistics::std_dev(abs1.iter().copied());
    let sd2 = Statistics::std_dev(abs2.iter().copied());
    let sd3 = Statistics::std_dev(abs3.iter().copied());
    (sd1 + sd2 + sd3) / 3.0
}

/// Score how "equilateral" the 3-body triangle is over time
pub fn equilateralness_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let n = positions[0].len();
    if n < 1 {
        return 0.0;
    }
    let mut sum = 0.0;
    for step in 0..n {
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];
        let l01 = (p0 - p1).norm();
        let l12 = (p1 - p2).norm();
        let l20 = (p2 - p0).norm();
        let mn = l01.min(l12).min(l20);
        if mn < 1e-14 {
            continue;
        }
        let mx = l01.max(l12).max(l20);
        sum += 1.0 / (mx / mn);
    }
    sum / (n as f64)
}

// ==================== COMPOSITION METRICS ====================

/// Golden ratio constant (phi)
#[allow(dead_code)]
pub const PHI: f64 = 1.618033988749895;

/// Golden ratio composition scoring
/// 
/// Scores how well the trajectory fills golden ratio sections of the canvas.
/// Uses the rule of thirds (approximation of golden ratio) and checks:
/// - Distribution of points across golden sections
/// - Balance between filled and empty quadrants
/// - Presence of key points near golden intersections
/// 
/// Returns a score from 0.0 (poor composition) to 1.0 (excellent composition)
#[allow(dead_code)]
pub fn golden_ratio_composition_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let n = positions[0].len();
    if n < 10 {
        return 0.0;
    }

    // Find bounding box
    let mut min_x = f64::MAX;
    let mut max_x = f64::MIN;
    let mut min_y = f64::MAX;
    let mut max_y = f64::MIN;

    for body_positions in positions {
        for pos in body_positions {
            min_x = min_x.min(pos[0]);
            max_x = max_x.max(pos[0]);
            min_y = min_y.min(pos[1]);
            max_y = max_y.max(pos[1]);
        }
    }

    let width = max_x - min_x;
    let height = max_y - min_y;
    if width < 1e-10 || height < 1e-10 {
        return 0.0;
    }

    // Golden ratio divisions (1/phi ≈ 0.618)
    let golden_x1 = min_x + width / PHI;
    let golden_x2 = max_x - width / PHI;
    let golden_y1 = min_y + height / PHI;
    let golden_y2 = max_y - height / PHI;

    // Count points in each of the 9 sections (3x3 grid)
    let mut section_counts = [[0usize; 3]; 3];
    let mut total_points = 0;

    for body_positions in positions {
        for pos in body_positions {
            let section_x = if pos[0] < golden_x2 {
                0
            } else if pos[0] < golden_x1 {
                1
            } else {
                2
            };
            let section_y = if pos[1] < golden_y2 {
                0
            } else if pos[1] < golden_y1 {
                1
            } else {
                2
            };
            section_counts[section_y][section_x] += 1;
            total_points += 1;
        }
    }

    if total_points == 0 {
        return 0.0;
    }

    // Score 1: Distribution balance (prefer even distribution with slight center bias)
    let total = total_points as f64;
    let center_ratio = section_counts[1][1] as f64 / total;
    let ideal_center = 0.25; // Center should have slightly more
    let center_score = 1.0 - (center_ratio - ideal_center).abs() / 0.25;

    // Score 2: Golden intersection presence (key points near golden ratio intersections)
    let intersection_points = [
        (golden_x1, golden_y1),
        (golden_x1, golden_y2),
        (golden_x2, golden_y1),
        (golden_x2, golden_y2),
    ];

    let mut intersection_score = 0.0;
    let proximity_threshold = (width.min(height)) * 0.1; // 10% of smaller dimension

    for (gx, gy) in intersection_points {
        let mut min_dist = f64::MAX;
        for body_positions in positions {
            for pos in body_positions {
                let dist = ((pos[0] - gx).powi(2) + (pos[1] - gy).powi(2)).sqrt();
                min_dist = min_dist.min(dist);
            }
        }
        // Score based on proximity to golden intersection
        intersection_score += (1.0 - (min_dist / proximity_threshold).min(1.0)) / 4.0;
    }

    // Score 3: Edge utilization (trajectory should use the canvas well)
    let mut uses_left = false;
    let mut uses_right = false;
    let mut uses_top = false;
    let mut uses_bottom = false;
    let edge_threshold = 0.15;

    for body_positions in positions {
        for pos in body_positions {
            let norm_x = (pos[0] - min_x) / width;
            let norm_y = (pos[1] - min_y) / height;
            if norm_x < edge_threshold {
                uses_left = true;
            }
            if norm_x > 1.0 - edge_threshold {
                uses_right = true;
            }
            if norm_y < edge_threshold {
                uses_bottom = true;
            }
            if norm_y > 1.0 - edge_threshold {
                uses_top = true;
            }
        }
    }
    let edge_score = (uses_left as u8 + uses_right as u8 + uses_top as u8 + uses_bottom as u8) as f64 / 4.0;

    // Score 4: Aspect ratio preference (golden ratio aspect is ideal)
    let aspect = width / height;
    let aspect_score = 1.0 - ((aspect - PHI).abs() / PHI).min(1.0);

    // Weighted combination
    let final_score = center_score * 0.2 
        + intersection_score * 0.35 
        + edge_score * 0.25 
        + aspect_score * 0.2;

    final_score.clamp(0.0, 1.0)
}

/// Negative space quality scoring
/// 
/// Scores how interesting and meaningful the empty spaces are.
/// Good negative space creates visual breathing room and can form
/// recognizable or pleasing shapes.
/// 
/// Returns a score from 0.0 (poor negative space) to 1.0 (excellent)
#[allow(dead_code)]
pub fn negative_space_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let Some((grid, occupied, empty)) = build_occupancy_grid(positions) else {
        return 0.0;
    };

    let total = (GRID_SIZE * GRID_SIZE) as f64;
    let occupancy_ratio = occupied as f64 / total;

    // Score 1: Ideal occupancy (not too sparse, not too dense)
    // Ideal is around 30-50% occupied
    let ideal_occupancy = 0.4;
    let occupancy_score = 1.0 - ((occupancy_ratio - ideal_occupancy).abs() / 0.4).min(1.0);

    // Score 2: Contiguity of empty space (larger connected regions are better)
    let mut visited = [[false; GRID_SIZE]; GRID_SIZE];
    let mut largest_empty_region = 0;
    let mut num_empty_regions = 0;

    for y in 0..GRID_SIZE {
        for x in 0..GRID_SIZE {
            if !grid[y][x] && !visited[y][x] {
                // Flood fill to find connected empty region
                let size = flood_fill_size(&grid, &mut visited, x, y);
                largest_empty_region = largest_empty_region.max(size);
                num_empty_regions += 1;
            }
        }
    }

    // Prefer fewer, larger empty regions (more intentional negative space)
    let region_size_score = if empty > 0 {
        (largest_empty_region as f64 / empty as f64).min(1.0)
    } else {
        0.0
    };

    let region_count_score = if num_empty_regions > 0 {
        (1.0 / num_empty_regions as f64).min(1.0) // Fewer regions = better
    } else {
        0.0
    };

    // Score 3: Edge connectivity (empty space touching edges is good for framing)
    let mut edge_empty = 0;
    for i in 0..GRID_SIZE {
        if !grid[0][i] {
            edge_empty += 1;
        }
        if !grid[GRID_SIZE - 1][i] {
            edge_empty += 1;
        }
        if !grid[i][0] {
            edge_empty += 1;
        }
        if !grid[i][GRID_SIZE - 1] {
            edge_empty += 1;
        }
    }
    let edge_score = (edge_empty as f64 / (4 * GRID_SIZE) as f64).min(1.0);

    // Score 4: Symmetry of negative space
    let symmetry_score = calculate_grid_symmetry(&grid);

    // Weighted combination
    let final_score = occupancy_score * 0.25
        + region_size_score * 0.25
        + region_count_score * 0.15
        + edge_score * 0.15
        + symmetry_score * 0.2;

    final_score.clamp(0.0, 1.0)
}

/// Symmetry score based on occupancy grid mirroring.
pub fn symmetry_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let Some((grid, _, _)) = build_occupancy_grid(positions) else {
        return 0.0;
    };
    calculate_grid_symmetry(&grid).clamp(0.0, 1.0)
}

/// Density balance score based on overall occupancy ratio.
pub fn density_balance_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let Some((_grid, occupied, _empty)) = build_occupancy_grid(positions) else {
        return 0.0;
    };
    let total = (GRID_SIZE * GRID_SIZE) as f64;
    if total <= 0.0 {
        return 0.0;
    }
    let ratio = occupied as f64 / total;
    let ideal = 0.35;
    let tolerance = 0.35;
    let score = 1.0 - ((ratio - ideal).abs() / tolerance).min(1.0);
    score.clamp(0.0, 1.0)
}

/// Helper: flood fill to count connected region size
#[allow(dead_code)]
fn flood_fill_size(
    grid: &[[bool; 16]; 16],
    visited: &mut [[bool; 16]; 16],
    start_x: usize,
    start_y: usize,
) -> usize {
    const GRID_SIZE: usize = 16;
    let mut stack = vec![(start_x, start_y)];
    let mut size = 0;

    while let Some((x, y)) = stack.pop() {
        if x >= GRID_SIZE || y >= GRID_SIZE {
            continue;
        }
        if visited[y][x] || grid[y][x] {
            continue;
        }

        visited[y][x] = true;
        size += 1;

        // Add neighbors
        if x > 0 {
            stack.push((x - 1, y));
        }
        if x < GRID_SIZE - 1 {
            stack.push((x + 1, y));
        }
        if y > 0 {
            stack.push((x, y - 1));
        }
        if y < GRID_SIZE - 1 {
            stack.push((x, y + 1));
        }
    }

    size
}

/// Helper: calculate symmetry score for the occupancy grid
#[allow(dead_code)]
fn calculate_grid_symmetry(grid: &[[bool; 16]; 16]) -> f64 {
    const GRID_SIZE: usize = 16;
    let mut horizontal_matches = 0;
    let mut vertical_matches = 0;
    let mut total_comparisons = 0;

    // Horizontal symmetry (left-right)
    for y in 0..GRID_SIZE {
        for x in 0..GRID_SIZE / 2 {
            if grid[y][x] == grid[y][GRID_SIZE - 1 - x] {
                horizontal_matches += 1;
            }
            total_comparisons += 1;
        }
    }

    // Vertical symmetry (top-bottom)
    for x in 0..GRID_SIZE {
        for y in 0..GRID_SIZE / 2 {
            if grid[y][x] == grid[GRID_SIZE - 1 - y][x] {
                vertical_matches += 1;
            }
        }
    }

    let horizontal_score = horizontal_matches as f64 / total_comparisons as f64;
    let vertical_score = vertical_matches as f64 / total_comparisons as f64;

    // Average of both symmetries
    (horizontal_score + vertical_score) / 2.0
}

// ==================== GRID HELPERS ====================

const GRID_SIZE: usize = 16;

fn build_occupancy_grid(
    positions: &[Vec<Vector3<f64>>],
) -> Option<([[bool; GRID_SIZE]; GRID_SIZE], usize, usize)> {
    if positions.is_empty() || positions[0].len() < 10 {
        return None;
    }

    let mut min_x = f64::MAX;
    let mut max_x = f64::MIN;
    let mut min_y = f64::MAX;
    let mut max_y = f64::MIN;

    for body_positions in positions {
        for pos in body_positions {
            min_x = min_x.min(pos[0]);
            max_x = max_x.max(pos[0]);
            min_y = min_y.min(pos[1]);
            max_y = max_y.max(pos[1]);
        }
    }

    let width = max_x - min_x;
    let height = max_y - min_y;
    if width < 1e-10 || height < 1e-10 {
        return None;
    }

    let mut grid = [[false; GRID_SIZE]; GRID_SIZE];
    for body_positions in positions {
        for pos in body_positions {
            let gx = (((pos[0] - min_x) / width) * (GRID_SIZE - 1) as f64).round() as usize;
            let gy = (((pos[1] - min_y) / height) * (GRID_SIZE - 1) as f64).round() as usize;
            let gx = gx.min(GRID_SIZE - 1);
            let gy = gy.min(GRID_SIZE - 1);
            grid[gy][gx] = true;
        }
    }

    let mut occupied = 0;
    let mut empty = 0;
    for row in &grid {
        for &cell in row {
            if cell {
                occupied += 1;
            } else {
                empty += 1;
            }
        }
    }

    Some((grid, occupied, empty))
}

// ==================== TIME DILATION METRICS ====================

/// Calculate minimum separation distance at each timestep
/// Used for gravitational time dilation adaptive sampling
#[allow(dead_code)]
pub fn calculate_min_separations(positions: &[Vec<Vector3<f64>>]) -> Vec<f64> {
    let n = positions[0].len();
    let mut min_separations = Vec::with_capacity(n);

    for step in 0..n {
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let d01 = (p0 - p1).norm();
        let d12 = (p1 - p2).norm();
        let d20 = (p2 - p0).norm();

        min_separations.push(d01.min(d12).min(d20));
    }

    min_separations
}

/// Calculate close encounter intensity for gravitational time dilation
/// Returns higher values when bodies are closer together
#[allow(dead_code)]
pub fn close_encounter_intensity(positions: &[Vec<Vector3<f64>>], step: usize) -> f64 {
    if step >= positions[0].len() {
        return 0.0;
    }

    let p0 = positions[0][step];
    let p1 = positions[1][step];
    let p2 = positions[2][step];

    let d01 = (p0 - p1).norm();
    let d12 = (p1 - p2).norm();
    let d20 = (p2 - p0).norm();

    let min_dist = d01.min(d12).min(d20);

    // Use inverse square law for intensity (clamped)
    // Closer = higher intensity (more time dilation)
    let intensity = 1.0 / (min_dist * min_dist + 0.1);
    intensity.min(10.0) // Cap to prevent extreme values
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_golden_ratio_composition_basic() {
        // Create a simple trajectory that should have reasonable composition
        let positions = vec![
            vec![
                Vector3::new(0.0, 0.0, 0.0),
                Vector3::new(1.0, 0.0, 0.0),
                Vector3::new(1.0, 1.0, 0.0),
                Vector3::new(0.0, 1.0, 0.0),
            ],
            vec![
                Vector3::new(0.5, 0.5, 0.0),
                Vector3::new(0.5, 0.5, 0.0),
                Vector3::new(0.5, 0.5, 0.0),
                Vector3::new(0.5, 0.5, 0.0),
            ],
            vec![
                Vector3::new(0.3, 0.3, 0.0),
                Vector3::new(0.7, 0.3, 0.0),
                Vector3::new(0.7, 0.7, 0.0),
                Vector3::new(0.3, 0.7, 0.0),
            ],
        ];

        let score = golden_ratio_composition_score(&positions);
        assert!(score >= 0.0 && score <= 1.0);
    }

    #[test]
    fn test_negative_space_basic() {
        // Create a trajectory with some empty space
        let positions = vec![
            vec![
                Vector3::new(0.0, 0.0, 0.0),
                Vector3::new(0.5, 0.0, 0.0),
            ],
            vec![
                Vector3::new(1.0, 0.0, 0.0),
                Vector3::new(1.0, 0.5, 0.0),
            ],
            vec![
                Vector3::new(0.5, 1.0, 0.0),
                Vector3::new(0.0, 1.0, 0.0),
            ],
        ];

        let score = negative_space_score(&positions);
        assert!(score >= 0.0 && score <= 1.0);
    }

    #[test]
    fn test_close_encounter_intensity() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.1, 0.0, 0.0)],
            vec![Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.2, 0.0, 0.0)],
            vec![Vector3::new(0.5, 0.5, 0.0), Vector3::new(0.15, 0.0, 0.0)],
        ];

        // Second step has bodies closer together
        let intensity0 = close_encounter_intensity(&positions, 0);
        let intensity1 = close_encounter_intensity(&positions, 1);
        assert!(intensity1 > intensity0, "Closer bodies should have higher intensity");
    }

    #[test]
    fn test_flood_fill() {
        let grid = [[false; 16]; 16];
        let mut visited = [[false; 16]; 16];

        // Create a 3x3 empty region
        // grid is already all false (empty)

        let size = flood_fill_size(&grid, &mut visited, 0, 0);
        assert_eq!(size, 16 * 16); // Entire grid is empty and connected
    }

    #[test]
    fn test_grid_symmetry() {
        // Create a symmetric grid
        let mut grid = [[false; 16]; 16];
        for i in 0..8 {
            grid[8][i] = true;
            grid[8][15 - i] = true;
        }

        let symmetry = calculate_grid_symmetry(&grid);
        assert!(symmetry > 0.5, "Symmetric grid should have high symmetry score");
    }
}
