//! Exhaustive Single-Stage Borda Selection
//!
//! This module implements a brute-force trajectory search that evaluates all candidates
//! with full simulation. Scores are computed incrementally during simulation to minimize
//! memory usage - only initial conditions and final scores are retained.
//!
//! The algorithm:
//! 1. Generate N random initial conditions (default: 100,000)
//! 2. For each candidate, run full simulation and compute scores incrementally
//! 3. Rank all valid candidates using weighted Borda scoring
//! 4. Return the best trajectory's initial conditions

use crate::analysis::{
    AestheticWeights, calculate_total_angular_momentum, calculate_total_energy,
};
use crate::render::constants;
use crate::sim::{Body, Sha3RandomByteStream, TrajectoryResult, shift_bodies_to_com, G};
use nalgebra::Vector3;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;
use tracing::info;

// =============================================================================
// Configuration
// =============================================================================

/// Configuration for exhaustive Borda selection
#[derive(Clone, Debug)]
pub struct BordaConfig {
    /// Number of candidate trajectories to evaluate (default: 100,000)
    pub num_candidates: usize,
    /// Enable parallel processing (default: true)
    pub parallel: bool,
    /// Progress reporting interval in candidates (default: 1,000)
    pub progress_interval: usize,
    /// Escape check interval in simulation steps (default: 10,000)
    pub escape_check_interval: usize,
}

impl Default for BordaConfig {
    fn default() -> Self {
        Self {
            num_candidates: 100_000,
            parallel: true,
            progress_interval: 1_000,
            escape_check_interval: 10_000,
        }
    }
}

impl BordaConfig {
    /// Create a fast config for quick testing
    pub fn fast() -> Self {
        Self {
            num_candidates: 500,
            parallel: true,
            progress_interval: 100,
            escape_check_interval: 5_000,
        }
    }
}

// =============================================================================
// Aesthetic Configuration
// =============================================================================

/// Aesthetic configuration for Borda selection
#[derive(Clone, Copy, Debug, Default)]
pub struct BordaAestheticConfig {
    pub weights: AestheticWeights,
}

// =============================================================================
// Streaming Scorer
// =============================================================================

/// Grid size for spatial metrics (occupancy, symmetry, density)
const GRID_SIZE: usize = 16;

/// Accumulates aesthetic scores incrementally during simulation.
/// 
/// This avoids storing the full trajectory (which would be ~24MB per candidate
/// for 1M steps × 3 bodies × 3 coords × 8 bytes).
#[derive(Clone)]
struct StreamingScorer {
    // Body masses (needed for chaos calculation)
    masses: [f64; 3],
    
    // Equilateralness accumulator
    equil_sum: f64,
    equil_count: usize,
    
    // Bounding box for spatial metrics
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    
    // Occupancy grid for density/symmetry/negative-space
    occupancy_grid: [[bool; GRID_SIZE]; GRID_SIZE],
    
    // For chaos metric: store radial distances (subsampled)
    radial_samples_1: Vec<f64>,
    radial_samples_2: Vec<f64>,
    radial_samples_3: Vec<f64>,
    subsample_rate: usize,
    step_counter: usize,
}

impl StreamingScorer {
    fn new(masses: [f64; 3], num_steps: usize) -> Self {
        // Subsample radial distances to keep memory reasonable
        // For 1M steps, keep ~10K samples (every 100th step)
        let subsample_rate = (num_steps / 10_000).max(1);
        let expected_samples = num_steps / subsample_rate + 1;
        
        Self {
            masses,
            equil_sum: 0.0,
            equil_count: 0,
            min_x: f64::MAX,
            max_x: f64::MIN,
            min_y: f64::MAX,
            max_y: f64::MIN,
            occupancy_grid: [[false; GRID_SIZE]; GRID_SIZE],
            radial_samples_1: Vec::with_capacity(expected_samples),
            radial_samples_2: Vec::with_capacity(expected_samples),
            radial_samples_3: Vec::with_capacity(expected_samples),
            subsample_rate,
            step_counter: 0,
        }
    }
    
    /// Update scores with positions from a single simulation step.
    /// This is called once per integration step and must be fast.
    #[inline]
    fn update(&mut self, p0: Vector3<f64>, p1: Vector3<f64>, p2: Vector3<f64>) {
        // Update bounding box
        for p in [p0, p1, p2] {
            self.min_x = self.min_x.min(p[0]);
            self.max_x = self.max_x.max(p[0]);
            self.min_y = self.min_y.min(p[1]);
            self.max_y = self.max_y.max(p[1]);
        }
        
        // Equilateralness: measure how close triangle sides are to each other
        let l01 = (p0 - p1).norm();
        let l12 = (p1 - p2).norm();
        let l20 = (p2 - p0).norm();
        let min_len = l01.min(l12).min(l20);
        if min_len > 1e-14 {
            let max_len = l01.max(l12).max(l20);
            self.equil_sum += min_len / max_len;
            self.equil_count += 1;
        }
        
        // Subsample radial distances for chaos metric
        if self.step_counter % self.subsample_rate == 0 {
            let [m1, m2, m3] = self.masses;
            let cm1 = (m2 * p1 + m3 * p2) / (m2 + m3);
            let cm2 = (m1 * p0 + m3 * p2) / (m1 + m3);
            let cm3 = (m1 * p0 + m2 * p1) / (m1 + m2);
            self.radial_samples_1.push((p0 - cm1).norm());
            self.radial_samples_2.push((p1 - cm2).norm());
            self.radial_samples_3.push((p2 - cm3).norm());
        }
        
        self.step_counter += 1;
    }
    
    /// Finalize bounding box and populate occupancy grid.
    /// Called after all simulation steps are processed.
    fn finalize_grid(&mut self, positions_for_grid: &[(Vector3<f64>, Vector3<f64>, Vector3<f64>)]) {
        let width = self.max_x - self.min_x;
        let height = self.max_y - self.min_y;
        
        if width < 1e-10 || height < 1e-10 {
            return;
        }
        
        for &(p0, p1, p2) in positions_for_grid {
            for p in [p0, p1, p2] {
                let gx = (((p[0] - self.min_x) / width) * (GRID_SIZE - 1) as f64).round() as usize;
                let gy = (((p[1] - self.min_y) / height) * (GRID_SIZE - 1) as f64).round() as usize;
                let gx = gx.min(GRID_SIZE - 1);
                let gy = gy.min(GRID_SIZE - 1);
                self.occupancy_grid[gy][gx] = true;
            }
        }
    }
    
    /// Compute final scores from accumulated data.
    fn compute_scores(&self) -> AestheticScores {
        let equilateralness = if self.equil_count > 0 {
            self.equil_sum / self.equil_count as f64
        } else {
            0.0
        };
        
        let chaos = self.compute_chaos_score();
        let (density, symmetry, negative_space, golden_ratio) = self.compute_spatial_scores();
        
        AestheticScores {
            chaos,
            equilateralness,
            golden_ratio,
            negative_space,
            symmetry,
            density,
        }
    }
    
    /// Compute chaos score from subsampled radial distances using FFT.
    fn compute_chaos_score(&self) -> f64 {
        if self.radial_samples_1.is_empty() {
            return 0.0;
        }
        
        // Compute standard deviation of FFT magnitudes for each body
        let sd1 = fft_std_dev(&self.radial_samples_1);
        let sd2 = fft_std_dev(&self.radial_samples_2);
        let sd3 = fft_std_dev(&self.radial_samples_3);
        
        (sd1 + sd2 + sd3) / 3.0
    }
    
    /// Compute spatial scores from occupancy grid.
    fn compute_spatial_scores(&self) -> (f64, f64, f64, f64) {
        let (occupied, empty) = self.count_grid_cells();
        let total = (GRID_SIZE * GRID_SIZE) as f64;
        
        // Density score: prefer ~35% occupancy
        let density = {
            let ratio = occupied as f64 / total;
            let ideal = 0.35;
            let tolerance = 0.35;
            (1.0 - ((ratio - ideal).abs() / tolerance).min(1.0)).clamp(0.0, 1.0)
        };
        
        // Symmetry score
        let symmetry = self.compute_grid_symmetry();
        
        // Negative space score
        let negative_space = self.compute_negative_space_score(occupied, empty);
        
        // Golden ratio score
        let golden_ratio = self.compute_golden_ratio_score();
        
        (density, symmetry, negative_space, golden_ratio)
    }
    
    fn count_grid_cells(&self) -> (usize, usize) {
        let mut occupied = 0;
        let mut empty = 0;
        for row in &self.occupancy_grid {
            for &cell in row {
                if cell { occupied += 1; } else { empty += 1; }
            }
        }
        (occupied, empty)
    }
    
    fn compute_grid_symmetry(&self) -> f64 {
        let mut h_matches = 0;
        let mut v_matches = 0;
        let mut total = 0;
        
        // Horizontal symmetry (left-right)
        for y in 0..GRID_SIZE {
            for x in 0..GRID_SIZE / 2 {
                if self.occupancy_grid[y][x] == self.occupancy_grid[y][GRID_SIZE - 1 - x] {
                    h_matches += 1;
                }
                total += 1;
            }
        }
        
        // Vertical symmetry (top-bottom)
        for x in 0..GRID_SIZE {
            for y in 0..GRID_SIZE / 2 {
                if self.occupancy_grid[y][x] == self.occupancy_grid[GRID_SIZE - 1 - y][x] {
                    v_matches += 1;
                }
            }
        }
        
        if total == 0 {
            return 0.0;
        }
        
        let h_score = h_matches as f64 / total as f64;
        let v_score = v_matches as f64 / total as f64;
        ((h_score + v_score) / 2.0).clamp(0.0, 1.0)
    }
    
    fn compute_negative_space_score(&self, occupied: usize, empty: usize) -> f64 {
        let total = (GRID_SIZE * GRID_SIZE) as f64;
        let occupancy_ratio = occupied as f64 / total;
        
        // Ideal occupancy around 40%
        let ideal_occupancy = 0.4;
        let occupancy_score = 1.0 - ((occupancy_ratio - ideal_occupancy).abs() / 0.4).min(1.0);
        
        // Find largest connected empty region
        let mut visited = [[false; GRID_SIZE]; GRID_SIZE];
        let mut largest_empty = 0;
        let mut num_regions = 0;
        
        for y in 0..GRID_SIZE {
            for x in 0..GRID_SIZE {
                if !self.occupancy_grid[y][x] && !visited[y][x] {
                    let size = flood_fill(&self.occupancy_grid, &mut visited, x, y);
                    largest_empty = largest_empty.max(size);
                    num_regions += 1;
                }
            }
        }
        
        let region_size_score = if empty > 0 {
            (largest_empty as f64 / empty as f64).min(1.0)
        } else {
            0.0
        };
        
        let region_count_score = if num_regions > 0 {
            (1.0 / num_regions as f64).min(1.0)
        } else {
            0.0
        };
        
        // Edge connectivity
        let mut edge_empty = 0;
        for i in 0..GRID_SIZE {
            if !self.occupancy_grid[0][i] { edge_empty += 1; }
            if !self.occupancy_grid[GRID_SIZE - 1][i] { edge_empty += 1; }
            if !self.occupancy_grid[i][0] { edge_empty += 1; }
            if !self.occupancy_grid[i][GRID_SIZE - 1] { edge_empty += 1; }
        }
        let edge_score = (edge_empty as f64 / (4 * GRID_SIZE) as f64).min(1.0);
        
        let symmetry_score = self.compute_grid_symmetry();
        
        (occupancy_score * 0.25 + region_size_score * 0.25 + region_count_score * 0.15 
            + edge_score * 0.15 + symmetry_score * 0.2).clamp(0.0, 1.0)
    }
    
    fn compute_golden_ratio_score(&self) -> f64 {
        const PHI: f64 = 1.618033988749895;
        
        let width = self.max_x - self.min_x;
        let height = self.max_y - self.min_y;
        if width < 1e-10 || height < 1e-10 {
            return 0.0;
        }
        
        // Count cells in each section
        let (occupied, _) = self.count_grid_cells();
        if occupied == 0 {
            return 0.0;
        }
        
        // Center cell concentration
        let center_count = {
            let mid = GRID_SIZE / 2;
            let range = GRID_SIZE / 4;
            let mut count = 0;
            for y in (mid - range)..(mid + range) {
                for x in (mid - range)..(mid + range) {
                    if self.occupancy_grid[y][x] { count += 1; }
                }
            }
            count
        };
        
        let center_ratio = center_count as f64 / occupied as f64;
        let ideal_center = 0.25;
        let center_score = 1.0 - (center_ratio - ideal_center).abs() / 0.25;
        
        // Edge utilization
        let mut uses_edges = 0u8;
        for i in 0..GRID_SIZE {
            if self.occupancy_grid[0][i] { uses_edges |= 1; }
            if self.occupancy_grid[GRID_SIZE - 1][i] { uses_edges |= 2; }
            if self.occupancy_grid[i][0] { uses_edges |= 4; }
            if self.occupancy_grid[i][GRID_SIZE - 1] { uses_edges |= 8; }
        }
        let edge_score = uses_edges.count_ones() as f64 / 4.0;
        
        // Aspect ratio
        let aspect = width / height;
        let aspect_score = 1.0 - ((aspect - PHI).abs() / PHI).min(1.0);
        
        (center_score.max(0.0) * 0.3 + edge_score * 0.4 + aspect_score * 0.3).clamp(0.0, 1.0)
    }
}

/// Flood fill to count connected empty region size.
fn flood_fill(
    grid: &[[bool; GRID_SIZE]; GRID_SIZE],
    visited: &mut [[bool; GRID_SIZE]; GRID_SIZE],
    start_x: usize,
    start_y: usize,
) -> usize {
    let mut stack = vec![(start_x, start_y)];
    let mut size = 0;
    
    while let Some((x, y)) = stack.pop() {
        if x >= GRID_SIZE || y >= GRID_SIZE || visited[y][x] || grid[y][x] {
            continue;
        }
        
        visited[y][x] = true;
        size += 1;
        
        if x > 0 { stack.push((x - 1, y)); }
        if x < GRID_SIZE - 1 { stack.push((x + 1, y)); }
        if y > 0 { stack.push((x, y - 1)); }
        if y < GRID_SIZE - 1 { stack.push((x, y + 1)); }
    }
    
    size
}

/// Compute standard deviation of FFT magnitudes.
fn fft_std_dev(samples: &[f64]) -> f64 {
    if samples.len() < 2 {
        return 0.0;
    }
    
    // Use the existing fourier_transform from utils
    let spectrum = crate::utils::fourier_transform(samples);
    let magnitudes: Vec<f64> = spectrum.iter().map(|c| c.norm()).collect();
    
    // Compute standard deviation
    let n = magnitudes.len() as f64;
    let mean = magnitudes.iter().sum::<f64>() / n;
    let variance = magnitudes.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
    variance.sqrt()
}

// =============================================================================
// Candidate Result
// =============================================================================

/// Aesthetic scores computed for a trajectory.
#[derive(Clone, Copy, Debug, Default)]
pub struct AestheticScores {
    pub chaos: f64,
    pub equilateralness: f64,
    pub golden_ratio: f64,
    pub negative_space: f64,
    pub symmetry: f64,
    pub density: f64,
}

/// Result from evaluating a single candidate trajectory.
#[derive(Clone)]
struct CandidateResult {
    index: usize,
    initial_bodies: Vec<Body>,
    scores: AestheticScores,
    is_valid: bool,
}

impl CandidateResult {
    fn invalid(index: usize, bodies: Vec<Body>) -> Self {
        Self {
            index,
            initial_bodies: bodies,
            scores: AestheticScores::default(),
            is_valid: false,
        }
    }
}

// =============================================================================
// Single Candidate Evaluation
// =============================================================================

/// Evaluate a single candidate trajectory.
///
/// Runs full simulation, computes scores incrementally, returns compact result.
fn evaluate_candidate(
    index: usize,
    bodies: Vec<Body>,
    num_steps: usize,
    escape_threshold: f64,
    escape_check_interval: usize,
) -> CandidateResult {
    // Quick energy/momentum pre-filter
    let energy = calculate_total_energy(&bodies);
    let angular_momentum = calculate_total_angular_momentum(&bodies).norm();
    if energy > 10.0 || angular_momentum < 10.0 {
        return CandidateResult::invalid(index, bodies);
    }
    
    // Initialize simulation state
    let mut sim_bodies = bodies.clone();
    shift_bodies_to_com(&mut sim_bodies);
    let dt = constants::DEFAULT_DT;
    
    // Initialize streaming scorer
    let masses = [sim_bodies[0].mass, sim_bodies[1].mass, sim_bodies[2].mass];
    let mut scorer = StreamingScorer::new(masses, num_steps);
    
    // Store subsampled positions for grid computation
    let grid_subsample_rate = (num_steps / 1000).max(1);
    let mut grid_positions: Vec<(Vector3<f64>, Vector3<f64>, Vector3<f64>)> = 
        Vec::with_capacity(num_steps / grid_subsample_rate + 1);
    
    // Warmup phase (same number of steps as recording phase)
    for _ in 0..num_steps {
        verlet_step(&mut sim_bodies, dt);
    }
    
    // Recording phase with streaming scoring
    let mut recording_bodies = sim_bodies.clone();
    for step in 0..num_steps {
        let p0 = recording_bodies[0].position;
        let p1 = recording_bodies[1].position;
        let p2 = recording_bodies[2].position;
        
        // Update streaming scorer
        scorer.update(p0, p1, p2);
        
        // Subsample for grid
        if step % grid_subsample_rate == 0 {
            grid_positions.push((p0, p1, p2));
        }
        
        // Integration step
        verlet_step(&mut recording_bodies, dt);
        
        // Periodic escape check
        if step % escape_check_interval == 0
            && step > 0
            && is_escaping(&recording_bodies, escape_threshold)
        {
            return CandidateResult::invalid(index, bodies);
        }
    }
    
    // Final escape check
    if is_escaping(&recording_bodies, escape_threshold) {
        return CandidateResult::invalid(index, bodies);
    }
    
    // Finalize grid and compute scores
    scorer.finalize_grid(&grid_positions);
    let scores = scorer.compute_scores();
    
    CandidateResult {
        index,
        initial_bodies: bodies,
        scores,
        is_valid: true,
    }
}

/// Basic Verlet integration step (inlined for performance).
#[inline]
fn verlet_step(bodies: &mut [Body], dt: f64) {
    // Store positions and masses
    let positions: [Vector3<f64>; 3] = [
        bodies[0].position,
        bodies[1].position,
        bodies[2].position,
    ];
    let masses: [f64; 3] = [bodies[0].mass, bodies[1].mass, bodies[2].mass];
    
    // Compute accelerations
    let mut accelerations = [Vector3::zeros(); 3];
    for i in 0..3 {
        for j in 0..3 {
            if i != j {
                let dir = positions[i] - positions[j];
                let d = dir.norm();
                if d > 1e-10 {
                    accelerations[i] -= G * masses[j] * dir / d.powi(3);
                }
            }
        }
    }
    
    // Update positions
    for (i, body) in bodies.iter_mut().enumerate() {
        body.position += body.velocity * dt + 0.5 * accelerations[i] * dt * dt;
    }
    
    // Recompute accelerations at new positions
    let new_positions: [Vector3<f64>; 3] = [
        bodies[0].position,
        bodies[1].position,
        bodies[2].position,
    ];
    
    let mut new_accelerations = [Vector3::zeros(); 3];
    for i in 0..3 {
        for j in 0..3 {
            if i != j {
                let dir = new_positions[i] - new_positions[j];
                let d = dir.norm();
                if d > 1e-10 {
                    new_accelerations[i] -= G * masses[j] * dir / d.powi(3);
                }
            }
        }
    }
    
    // Update velocities
    for (i, body) in bodies.iter_mut().enumerate() {
        body.velocity += 0.5 * (accelerations[i] + new_accelerations[i]) * dt;
    }
}

/// Check if any body is escaping the system.
#[inline]
fn is_escaping(bodies: &[Body], threshold: f64) -> bool {
    let mut local = bodies.to_vec();
    shift_bodies_to_com(&mut local);
    
    for (i, bi) in local.iter().enumerate() {
        let kinetic = constants::KINETIC_ENERGY_FACTOR * bi.mass * bi.velocity.norm_squared();
        
        let mut potential = 0.0;
        for (j, bj) in local.iter().enumerate() {
            if i != j {
                let d = (bi.position - bj.position).norm();
                if d > 1e-12 {
                    potential += -G * bi.mass * bj.mass / d;
                }
            }
        }
        
        if kinetic + potential > threshold {
            return true;
        }
    }
    
    false
}

// =============================================================================
// Borda Ranking
// =============================================================================

/// Assign Borda points to candidates based on a metric.
/// Higher is better when `higher_is_better` is true.
fn assign_borda_points(values: &[(f64, usize)], higher_is_better: bool) -> Vec<usize> {
    let mut sorted = values.to_vec();
    if higher_is_better {
        sorted.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    }
    
    let n = sorted.len();
    let mut points = vec![0usize; n];
    for (rank, (_, original_index)) in sorted.into_iter().enumerate() {
        points[original_index] = n - rank;
    }
    
    points
}

/// Rank candidates using weighted Borda scoring and return the best one.
fn select_best_by_borda(
    candidates: &[CandidateResult],
    weights: &AestheticWeights,
) -> (usize, TrajectoryResult) {
    let n = candidates.len();
    
    // Extract values for each metric
    let chaos_vals: Vec<_> = candidates.iter().enumerate()
        .map(|(i, c)| (c.scores.chaos, i)).collect();
    let equil_vals: Vec<_> = candidates.iter().enumerate()
        .map(|(i, c)| (c.scores.equilateralness, i)).collect();
    let golden_vals: Vec<_> = candidates.iter().enumerate()
        .map(|(i, c)| (c.scores.golden_ratio, i)).collect();
    let negative_vals: Vec<_> = candidates.iter().enumerate()
        .map(|(i, c)| (c.scores.negative_space, i)).collect();
    let symmetry_vals: Vec<_> = candidates.iter().enumerate()
        .map(|(i, c)| (c.scores.symmetry, i)).collect();
    let density_vals: Vec<_> = candidates.iter().enumerate()
        .map(|(i, c)| (c.scores.density, i)).collect();
    
    // Assign Borda points (chaos: lower is better, others: higher is better)
    let chaos_pts = assign_borda_points(&chaos_vals, false);
    let equil_pts = assign_borda_points(&equil_vals, true);
    let golden_pts = if weights.golden_ratio > 0.0 {
        assign_borda_points(&golden_vals, true)
    } else {
        vec![0; n]
    };
    let negative_pts = if weights.negative_space > 0.0 {
        assign_borda_points(&negative_vals, true)
    } else {
        vec![0; n]
    };
    let symmetry_pts = if weights.symmetry > 0.0 {
        assign_borda_points(&symmetry_vals, true)
    } else {
        vec![0; n]
    };
    let density_pts = if weights.density > 0.0 {
        assign_borda_points(&density_vals, true)
    } else {
        vec![0; n]
    };
    
    // Calculate weighted scores and find best
    let mut best_idx = 0;
    let mut best_weighted = f64::MIN;
    
    for i in 0..n {
        let weighted = weights.chaos * chaos_pts[i] as f64
            + weights.equilateralness * equil_pts[i] as f64
            + weights.golden_ratio * golden_pts[i] as f64
            + weights.negative_space * negative_pts[i] as f64
            + weights.symmetry * symmetry_pts[i] as f64
            + weights.density * density_pts[i] as f64;
        
        if weighted > best_weighted {
            best_weighted = weighted;
            best_idx = i;
        }
    }
    
    let best = &candidates[best_idx];
    let result = TrajectoryResult {
        chaos: best.scores.chaos,
        equilateralness: best.scores.equilateralness,
        golden_ratio: best.scores.golden_ratio,
        negative_space: best.scores.negative_space,
        symmetry: best.scores.symmetry,
        density: best.scores.density,
        chaos_pts: chaos_pts[best_idx],
        equil_pts: equil_pts[best_idx],
        total_score: chaos_pts[best_idx] + equil_pts[best_idx] 
            + golden_pts[best_idx] + negative_pts[best_idx]
            + symmetry_pts[best_idx] + density_pts[best_idx],
        total_score_weighted: best_weighted,
    };
    
    (best.index, result)
}

// =============================================================================
// Main Entry Point
// =============================================================================

/// Generate random initial conditions for a 3-body system.
fn generate_random_bodies(rng: &mut Sha3RandomByteStream) -> Vec<Body> {
    let mut bodies = vec![
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), rng.random_location()),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), rng.random_velocity()),
        ),
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), rng.random_location()),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), rng.random_velocity()),
        ),
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), rng.random_location()),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), rng.random_velocity()),
        ),
    ];
    shift_bodies_to_com(&mut bodies);
    bodies
}

/// Exhaustive single-stage Borda selection.
///
/// Evaluates all candidates with full simulation and returns the best trajectory.
///
/// # Arguments
/// * `rng` - Random number generator for initial conditions
/// * `num_steps` - Number of simulation steps per candidate
/// * `escape_threshold` - Energy threshold for escape detection
/// * `config` - Borda search configuration
/// * `aesthetic` - Aesthetic weights for scoring
///
/// # Returns
/// Tuple of (best initial conditions, trajectory result with scores)
pub fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_steps: usize,
    escape_threshold: f64,
    config: &BordaConfig,
    aesthetic: &BordaAestheticConfig,
) -> (Vec<Body>, TrajectoryResult) {
    info!(
        "Exhaustive Borda search: {} candidates × {} steps",
        config.num_candidates, num_steps
    );
    
    // Generate all initial conditions upfront
    let start_gen = Instant::now();
    let candidates: Vec<Vec<Body>> = (0..config.num_candidates)
        .map(|_| generate_random_bodies(rng))
        .collect();
    info!(
        "Generated {} initial conditions in {:.2}s",
        candidates.len(),
        start_gen.elapsed().as_secs_f64()
    );
    
    // Evaluate all candidates
    let progress = AtomicUsize::new(0);
    let discarded = AtomicUsize::new(0);
    let start_eval = Instant::now();
    
    let results: Vec<CandidateResult> = if config.parallel {
        candidates
            .into_par_iter()
            .enumerate()
            .map(|(index, bodies)| {
                let result = evaluate_candidate(
                    index,
                    bodies,
                    num_steps,
                    escape_threshold,
                    config.escape_check_interval,
                );
                
                if !result.is_valid {
                    discarded.fetch_add(1, Ordering::Relaxed);
                }
                
                // Progress reporting
                let done = progress.fetch_add(1, Ordering::Relaxed) + 1;
                if done % config.progress_interval == 0 {
                    let elapsed = start_eval.elapsed().as_secs_f64();
                    let rate = done as f64 / elapsed;
                    let eta = (config.num_candidates - done) as f64 / rate;
                    info!(
                        "   Progress: {}/{} ({:.1}%), {:.1} cand/s, ETA: {:.0}s",
                        done,
                        config.num_candidates,
                        done as f64 / config.num_candidates as f64 * 100.0,
                        rate,
                        eta
                    );
                }
                
                result
            })
            .collect()
    } else {
        candidates
            .into_iter()
            .enumerate()
            .map(|(index, bodies)| {
                let result = evaluate_candidate(
                    index,
                    bodies,
                    num_steps,
                    escape_threshold,
                    config.escape_check_interval,
                );
                
                if !result.is_valid {
                    discarded.fetch_add(1, Ordering::Relaxed);
                }
                
                let done = progress.fetch_add(1, Ordering::Relaxed) + 1;
                if done % config.progress_interval == 0 {
                    let elapsed = start_eval.elapsed().as_secs_f64();
                    let rate = done as f64 / elapsed;
                    let eta = (config.num_candidates - done) as f64 / rate;
                    info!(
                        "   Progress: {}/{} ({:.1}%), {:.1} cand/s, ETA: {:.0}s",
                        done,
                        config.num_candidates,
                        done as f64 / config.num_candidates as f64 * 100.0,
                        rate,
                        eta
                    );
                }
                
                result
            })
            .collect()
    };
    
    let total_time = start_eval.elapsed().as_secs_f64();
    let discard_count = discarded.load(Ordering::Relaxed);
    info!(
        "Evaluation complete in {:.1}s ({:.1} candidates/s)",
        total_time,
        config.num_candidates as f64 / total_time
    );
    info!(
        "   Discarded {}/{} ({:.1}%) due to filters or escapes",
        discard_count,
        config.num_candidates,
        discard_count as f64 / config.num_candidates as f64 * 100.0
    );
    
    // Filter valid results
    let valid_results: Vec<CandidateResult> = results
        .into_iter()
        .filter(|r| r.is_valid)
        .collect();
    
    if valid_results.is_empty() {
        panic!("No valid trajectories found! Try adjusting parameters.");
    }
    
    info!("Valid candidates: {}", valid_results.len());
    
    // Borda ranking
    let (best_idx, result) = select_best_by_borda(&valid_results, &aesthetic.weights);
    let best_bodies = valid_results[best_idx].initial_bodies.clone();
    
    info!(
        "   => Best candidate: original_idx={}, weighted_score={:.3}",
        valid_results[best_idx].index,
        result.total_score_weighted
    );
    
    (best_bodies, result)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_borda_config_default() {
        let config = BordaConfig::default();
        assert_eq!(config.num_candidates, 100_000);
        assert!(config.parallel);
    }

    #[test]
    fn test_borda_config_fast() {
        let config = BordaConfig::fast();
        assert_eq!(config.num_candidates, 500);
    }

    #[test]
    fn test_streaming_scorer_creation() {
        let scorer = StreamingScorer::new([100.0, 100.0, 100.0], 1_000_000);
        assert_eq!(scorer.equil_sum, 0.0);
        assert_eq!(scorer.equil_count, 0);
    }

    #[test]
    fn test_streaming_scorer_update() {
        let mut scorer = StreamingScorer::new([100.0, 100.0, 100.0], 1000);
        let p0 = Vector3::new(1.0, 0.0, 0.0);
        let p1 = Vector3::new(0.0, 1.0, 0.0);
        let p2 = Vector3::new(0.0, 0.0, 1.0);
        
        scorer.update(p0, p1, p2);
        
        assert!(scorer.equil_count > 0);
        assert!(scorer.min_x <= 0.0);
        assert!(scorer.max_x >= 1.0);
    }

    #[test]
    fn test_flood_fill() {
        let grid = [[false; GRID_SIZE]; GRID_SIZE];
        let mut visited = [[false; GRID_SIZE]; GRID_SIZE];
        
        let size = flood_fill(&grid, &mut visited, 0, 0);
        assert_eq!(size, GRID_SIZE * GRID_SIZE);
    }

    #[test]
    fn test_assign_borda_points() {
        let values = vec![(0.5, 0), (0.3, 1), (0.8, 2)];
        
        // Higher is better
        let points = assign_borda_points(&values, true);
        assert_eq!(points[2], 3); // 0.8 is best
        assert_eq!(points[0], 2); // 0.5 is second
        assert_eq!(points[1], 1); // 0.3 is worst
        
        // Lower is better
        let points = assign_borda_points(&values, false);
        assert_eq!(points[1], 3); // 0.3 is best
        assert_eq!(points[0], 2); // 0.5 is second
        assert_eq!(points[2], 1); // 0.8 is worst
    }

    #[test]
    fn test_aesthetic_scores_default() {
        let scores = AestheticScores::default();
        assert_eq!(scores.chaos, 0.0);
        assert_eq!(scores.equilateralness, 0.0);
    }
}
