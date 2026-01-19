//! Hierarchical Borda Selection
//!
//! Multi-stage filtering algorithm that dramatically reduces the number of simulation
//! steps needed to find the best trajectory. Instead of running full simulations for
//! all candidates, we progressively eliminate poor candidates with shorter simulations.
//!
//! Typical speedup: 5-10x for Borda selection phase.

use crate::analysis::{
    AestheticWeights, calculate_total_angular_momentum, calculate_total_energy,
    density_balance_score, equilateralness_score, golden_ratio_composition_score,
    negative_space_score, non_chaoticness, symmetry_score,
};
use crate::render::{CameraConfig, DepthCueConfig, OklabColor, draw_line_segment_aa_alpha};
use crate::render::constants;
use crate::render::context::RenderContext;
use crate::sim::{Body, Sha3RandomByteStream, TrajectoryResult, get_positions, is_definitely_escaping, shift_bodies_to_com};
use nalgebra::Vector3;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use tracing::info;

/// Configuration for hierarchical Borda selection
#[derive(Clone, Debug)]
pub struct HierarchicalBordaConfig {
    /// Number of elimination stages
    pub num_stages: usize,
    /// Steps per stage as fraction of final steps
    pub stage_step_fractions: Vec<f64>,
    /// Survival rate per stage (fraction to keep)
    pub stage_survival_rates: Vec<f64>,
    /// Minimum candidates to keep per stage
    pub min_survivors_per_stage: usize,
    /// Whether to use parallel processing
    pub parallel: bool,
}

impl Default for HierarchicalBordaConfig {
    fn default() -> Self {
        Self {
            num_stages: 3,
            // Stage 1: 1%, Stage 2: 10%, Stage 3: 100% of steps
            stage_step_fractions: vec![0.01, 0.10, 1.0],
            // Keep 30% after stage 1, 50% after stage 2, final selection at stage 3
            stage_survival_rates: vec![0.30, 0.50, 1.0],
            min_survivors_per_stage: 10,
            parallel: true,
        }
    }
}

impl HierarchicalBordaConfig {
    /// Create a fast config for quick previews
    pub fn fast() -> Self {
        Self {
            num_stages: 2,
            stage_step_fractions: vec![0.005, 1.0],
            stage_survival_rates: vec![0.20, 1.0],
            min_survivors_per_stage: 5,
            parallel: true,
        }
    }

    /// Create an aggressive config for maximum performance
    pub fn aggressive() -> Self {
        Self {
            num_stages: 4,
            stage_step_fractions: vec![0.001, 0.01, 0.1, 1.0],
            stage_survival_rates: vec![0.15, 0.25, 0.50, 1.0],
            min_survivors_per_stage: 5,
            parallel: true,
        }
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<(), String> {
        if self.num_stages == 0 {
            return Err("Must have at least 1 stage".to_string());
        }
        if self.stage_step_fractions.len() != self.num_stages {
            return Err("stage_step_fractions length must match num_stages".to_string());
        }
        if self.stage_survival_rates.len() != self.num_stages {
            return Err("stage_survival_rates length must match num_stages".to_string());
        }
        for (i, &frac) in self.stage_step_fractions.iter().enumerate() {
            if frac <= 0.0 || frac > 1.0 {
                return Err(format!("stage_step_fractions[{}] must be in (0, 1]", i));
            }
        }
        for (i, &rate) in self.stage_survival_rates.iter().enumerate() {
            if rate <= 0.0 || rate > 1.0 {
                return Err(format!("stage_survival_rates[{}] must be in (0, 1]", i));
            }
        }
        // Last stage must have 100% steps and survival
        if self.stage_step_fractions[self.num_stages - 1] != 1.0 {
            return Err("Final stage must have step_fraction = 1.0".to_string());
        }
        Ok(())
    }
}

/// Low-resolution preview render settings for fast composition scoring.
#[derive(Clone, Copy, Debug)]
pub struct PreviewRenderConfig {
    pub enabled: bool,
    pub width: u32,
    pub height: u32,
    pub step_stride: usize,
}

impl Default for PreviewRenderConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            width: constants::DEFAULT_PREVIEW_SIZE,
            height: constants::DEFAULT_PREVIEW_SIZE,
            step_stride: constants::DEFAULT_PREVIEW_STEP_STRIDE,
        }
    }
}

impl PreviewRenderConfig {
    pub fn gallery() -> Self {
        Self {
            enabled: true,
            width: constants::DEFAULT_PREVIEW_SIZE,
            height: constants::DEFAULT_PREVIEW_SIZE,
            step_stride: (constants::DEFAULT_PREVIEW_STEP_STRIDE / 2).max(1),
        }
    }
}

/// Aesthetic configuration for Borda selection.
#[derive(Clone, Copy, Debug)]
pub struct BordaAestheticConfig {
    pub weights: AestheticWeights,
    pub preview: PreviewRenderConfig,
    pub camera: CameraConfig,
}

impl Default for BordaAestheticConfig {
    fn default() -> Self {
        Self {
            weights: AestheticWeights::default(),
            preview: PreviewRenderConfig::default(),
            camera: CameraConfig::default(),
        }
    }
}

/// Candidate trajectory with intermediate scores
#[derive(Clone)]
struct Candidate {
    bodies: Vec<Body>,
    index: usize,
    chaos_score: f64,
    equil_score: f64,
    golden_score: f64,
    negative_score: f64,
    symmetry_score: f64,
    density_score: f64,
    preview_score: f64,
    is_valid: bool,
}

#[derive(Clone, Copy, Debug)]
struct CandidateScores {
    chaos: f64,
    equilateralness: f64,
    golden: f64,
    negative: f64,
    symmetry: f64,
    density: f64,
    preview: f64,
}

fn preview_composition_score(
    positions: &[Vec<Vector3<f64>>],
    preview: &PreviewRenderConfig,
    camera: CameraConfig,
) -> f64 {
    if !preview.enabled || positions.is_empty() {
        return 0.0;
    }

    let width = preview.width.max(8);
    let height = preview.height.max(8);
    let depth_cue = DepthCueConfig { strength: 0.0, gamma: 1.0, min_scale: 1.0 };
    let ctx = RenderContext::new(width, height, positions, camera, depth_cue);
    let mut accum = vec![(0.0, 0.0, 0.0, 0.0); (width * height) as usize];

    let total_steps = positions[0].len();
    let stride = preview.step_stride.max(1);
    let neutral_color: OklabColor = (0.0, 0.0, 0.0);

    for step in (0..total_steps).step_by(stride) {
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let (x0, y0, _d0) = ctx.to_pixel(p0[0], p0[1], p0[2]);
        let (x1, y1, _d1) = ctx.to_pixel(p1[0], p1[1], p1[2]);
        let (x2, y2, _d2) = ctx.to_pixel(p2[0], p2[1], p2[2]);

        draw_line_segment_aa_alpha(
            &mut accum,
            width,
            height,
            x0,
            y0,
            x1,
            y1,
            neutral_color,
            neutral_color,
            1.0,
            1.0,
            1.0,
        );
        draw_line_segment_aa_alpha(
            &mut accum,
            width,
            height,
            x1,
            y1,
            x2,
            y2,
            neutral_color,
            neutral_color,
            1.0,
            1.0,
            1.0,
        );
        draw_line_segment_aa_alpha(
            &mut accum,
            width,
            height,
            x2,
            y2,
            x0,
            y0,
            neutral_color,
            neutral_color,
            1.0,
            1.0,
            1.0,
        );
    }

    preview_score_from_alpha(&accum, width as usize, height as usize)
}

fn preview_score_from_alpha(buffer: &[(f64, f64, f64, f64)], width: usize, height: usize) -> f64 {
    if buffer.is_empty() || width == 0 || height == 0 {
        return 0.0;
    }

    let threshold = 1e-4;
    let total = (width * height) as f64;
    let occupied = buffer.iter().filter(|p| p.3 > threshold).count() as f64;
    let ratio = occupied / total.max(1.0);

    let ideal = 0.25;
    let density_score = (1.0 - ((ratio - ideal).abs() / ideal).min(1.0)).clamp(0.0, 1.0);

    let mut sym_lr = 0.0;
    let mut count_lr = 0usize;
    for y in 0..height {
        for x in 0..width / 2 {
            let a = buffer[y * width + x].3;
            let b = buffer[y * width + (width - 1 - x)].3;
            let denom = a.max(b).max(1e-6);
            sym_lr += 1.0 - ((a - b).abs() / denom).min(1.0);
            count_lr += 1;
        }
    }
    let sym_lr_score = if count_lr > 0 { sym_lr / count_lr as f64 } else { 0.0 };

    let mut sym_tb = 0.0;
    let mut count_tb = 0usize;
    for y in 0..height / 2 {
        for x in 0..width {
            let a = buffer[y * width + x].3;
            let b = buffer[(height - 1 - y) * width + x].3;
            let denom = a.max(b).max(1e-6);
            sym_tb += 1.0 - ((a - b).abs() / denom).min(1.0);
            count_tb += 1;
        }
    }
    let sym_tb_score = if count_tb > 0 { sym_tb / count_tb as f64 } else { 0.0 };

    let symmetry_score = (sym_lr_score + sym_tb_score) * 0.5;
    (0.55 * symmetry_score + 0.45 * density_score).clamp(0.0, 1.0)
}

/// Score a candidate at a given number of steps
fn score_candidate(
    bodies: &[Body],
    steps: usize,
    escape_threshold: f64,
    preview: &PreviewRenderConfig,
    camera: CameraConfig,
) -> Option<CandidateScores> {
    // Quick energy/momentum filter
    let e = calculate_total_energy(bodies);
    let ang = calculate_total_angular_momentum(bodies).norm();
    if e > 10.0 || ang < 10.0 {
        return None;
    }

    // Run simulation
    let sim_result = get_positions(bodies.to_vec(), steps);
    
    // Escape check
    if is_definitely_escaping(&sim_result.final_bodies, escape_threshold) {
        return None;
    }

    // Calculate scores
    let m1 = bodies[0].mass;
    let m2 = bodies[1].mass;
    let m3 = bodies[2].mass;
    let chaos = non_chaoticness(m1, m2, m3, &sim_result.positions);
    let equil = equilateralness_score(&sim_result.positions);
    let golden = golden_ratio_composition_score(&sim_result.positions);
    let negative = negative_space_score(&sim_result.positions);
    let symmetry = symmetry_score(&sim_result.positions);
    let density = density_balance_score(&sim_result.positions);
    let preview_score = if preview.enabled {
        preview_composition_score(&sim_result.positions, preview, camera)
    } else {
        0.0
    };

    Some(CandidateScores {
        chaos,
        equilateralness: equil,
        golden,
        negative,
        symmetry,
        density,
        preview: preview_score,
    })
}

/// Select top N candidates by weighted score
fn select_top_candidates(
    candidates: &mut [Candidate],
    weights: &AestheticWeights,
    keep_count: usize,
) -> Vec<Candidate> {
    // Only consider valid candidates
    let valid_candidates: Vec<_> = candidates.iter()
        .filter(|c| c.is_valid)
        .collect();
    
    if valid_candidates.is_empty() {
        return vec![];
    }

    fn assign(vals: Vec<(f64, usize)>, higher_is_better: bool) -> Vec<usize> {
        let mut v = vals;
        if higher_is_better {
            v.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        } else {
            v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        }
        let n = v.len();
        let mut out = vec![0; n];
        for (r, (_, i)) in v.into_iter().enumerate() {
            out[i] = n - r;
        }
        out
    }

    // Borda point assignment
    let n = valid_candidates.len();
    let chaos_points = assign(
        valid_candidates.iter().enumerate().map(|(i, c)| (c.chaos_score, i)).collect(),
        false,
    );
    let equil_points = assign(
        valid_candidates.iter().enumerate().map(|(i, c)| (c.equil_score, i)).collect(),
        true,
    );
    let golden_points = if weights.golden_ratio > 0.0 {
        assign(
            valid_candidates.iter().enumerate().map(|(i, c)| (c.golden_score, i)).collect(),
            true,
        )
    } else {
        vec![0; n]
    };
    let negative_points = if weights.negative_space > 0.0 {
        assign(
            valid_candidates.iter().enumerate().map(|(i, c)| (c.negative_score, i)).collect(),
            true,
        )
    } else {
        vec![0; n]
    };
    let symmetry_points = if weights.symmetry > 0.0 {
        assign(
            valid_candidates.iter().enumerate().map(|(i, c)| (c.symmetry_score, i)).collect(),
            true,
        )
    } else {
        vec![0; n]
    };
    let density_points = if weights.density > 0.0 {
        assign(
            valid_candidates.iter().enumerate().map(|(i, c)| (c.density_score, i)).collect(),
            true,
        )
    } else {
        vec![0; n]
    };
    let preview_points = if weights.preview > 0.0 {
        assign(
            valid_candidates.iter().enumerate().map(|(i, c)| (c.preview_score, i)).collect(),
            true,
        )
    } else {
        vec![0; n]
    };

    // Calculate weighted scores
    let mut scored: Vec<_> = valid_candidates
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let weighted = weights.chaos * chaos_points[i] as f64
                + weights.equilateralness * equil_points[i] as f64
                + weights.golden_ratio * golden_points[i] as f64
                + weights.negative_space * negative_points[i] as f64
                + weights.symmetry * symmetry_points[i] as f64
                + weights.density * density_points[i] as f64
                + weights.preview * preview_points[i] as f64;
            ((**c).clone(), weighted)
        })
        .collect();

    // Sort by weighted score (descending)
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Return top candidates
    scored.into_iter()
        .take(keep_count)
        .map(|(c, _)| c)
        .collect()
}

/// Hierarchical Borda selection algorithm
///
/// This function implements a multi-stage filtering approach:
/// 1. Generate all random candidates
/// 2. For each stage, run shorter simulations and eliminate poor performers
/// 3. Final stage runs full simulation on survivors
///
/// Returns the best trajectory and its result.
pub fn select_best_trajectory_hierarchical(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    final_steps: usize,
    escape_threshold: f64,
    config: &HierarchicalBordaConfig,
    aesthetic: &BordaAestheticConfig,
) -> (Vec<Body>, TrajectoryResult) {
    config.validate().expect("Invalid hierarchical Borda config");

    info!("STAGE 1/7: Hierarchical Borda search over {} random orbits...", num_sims);
    info!("   Using {} elimination stages", config.num_stages);

    // Generate all random initial conditions
    let mut candidates: Vec<Candidate> = (0..num_sims)
        .map(|i| {
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
            Candidate {
                bodies,
                index: i,
                chaos_score: 0.0,
                equil_score: 0.0,
                golden_score: 0.0,
                negative_score: 0.0,
                symmetry_score: 0.0,
                density_score: 0.0,
                preview_score: 0.0,
                is_valid: true,
            }
        })
        .collect();

    // Process each stage
    for stage in 0..config.num_stages {
        let steps = (final_steps as f64 * config.stage_step_fractions[stage]).round() as usize;
        let steps = steps.max(100); // Minimum 100 steps

        let active_count = candidates.iter().filter(|c| c.is_valid).count();
        info!("   Stage {}/{}: {} steps, {} candidates", 
              stage + 1, config.num_stages, steps, active_count);

        // Score candidates in parallel
        let progress = AtomicUsize::new(0);
        let chunk_size = (active_count / 10).max(1);

        if config.parallel {
            candidates.par_iter_mut().for_each(|candidate| {
                if !candidate.is_valid {
                    return;
                }

                let count = progress.fetch_add(1, Ordering::Relaxed) + 1;
                if count % chunk_size == 0 {
                    let pct = (count as f64 / active_count as f64) * 100.0;
                    info!("      Progress: {:.0}%", pct);
                }

                if let Some(scores) = score_candidate(
                    &candidate.bodies,
                    steps,
                    escape_threshold,
                    &aesthetic.preview,
                    aesthetic.camera,
                ) {
                    candidate.chaos_score = scores.chaos;
                    candidate.equil_score = scores.equilateralness;
                    candidate.golden_score = scores.golden;
                    candidate.negative_score = scores.negative;
                    candidate.symmetry_score = scores.symmetry;
                    candidate.density_score = scores.density;
                    candidate.preview_score = scores.preview;
                } else {
                    candidate.is_valid = false;
                }
            });
        } else {
            for candidate in candidates.iter_mut() {
                if !candidate.is_valid {
                    continue;
                }

                if let Some(scores) = score_candidate(
                    &candidate.bodies,
                    steps,
                    escape_threshold,
                    &aesthetic.preview,
                    aesthetic.camera,
                ) {
                    candidate.chaos_score = scores.chaos;
                    candidate.equil_score = scores.equilateralness;
                    candidate.golden_score = scores.golden;
                    candidate.negative_score = scores.negative;
                    candidate.symmetry_score = scores.symmetry;
                    candidate.density_score = scores.density;
                    candidate.preview_score = scores.preview;
                } else {
                    candidate.is_valid = false;
                }
            }
        }

        // Count valid candidates
        let valid_count = candidates.iter().filter(|c| c.is_valid).count();
        if valid_count == 0 {
            panic!("No valid orbits found after stage {} filtering!", stage + 1);
        }

        // Eliminate poor performers (except in final stage)
        if stage < config.num_stages - 1 {
            let keep_count = ((valid_count as f64 * config.stage_survival_rates[stage]).round() as usize)
                .max(config.min_survivors_per_stage);

            let survivors = select_top_candidates(&mut candidates, &aesthetic.weights, keep_count);
            
            // Mark non-survivors as invalid
            let survivor_indices: std::collections::HashSet<_> = survivors.iter()
                .map(|c| c.index)
                .collect();
            
            for candidate in candidates.iter_mut() {
                if !survivor_indices.contains(&candidate.index) {
                    candidate.is_valid = false;
                }
            }

            let eliminated = valid_count - keep_count.min(valid_count);
            info!("      Eliminated {} candidates, {} remain", eliminated, survivors.len());
        }
    }

    // Final selection
    let valid_candidates: Vec<_> = candidates.iter()
        .filter(|c| c.is_valid)
        .collect();

    if valid_candidates.is_empty() {
        panic!("No valid orbits found after all filtering stages!");
    }

    // Get the best candidate
    let survivors = select_top_candidates(&mut candidates.clone(), &aesthetic.weights, 1);
    let best = &survivors[0];

    // Create final result
    let result = TrajectoryResult {
        chaos: best.chaos_score,
        equilateralness: best.equil_score,
        golden_ratio: best.golden_score,
        negative_space: best.negative_score,
        symmetry: best.symmetry_score,
        density: best.density_score,
        preview_score: best.preview_score,
        chaos_pts: 0, // Will be calculated by caller if needed
        equil_pts: 0,
        total_score: 0,
        total_score_weighted: aesthetic.weights.chaos * best.chaos_score
            + aesthetic.weights.equilateralness * best.equil_score
            + aesthetic.weights.golden_ratio * best.golden_score
            + aesthetic.weights.negative_space * best.negative_score
            + aesthetic.weights.symmetry * best.symmetry_score
            + aesthetic.weights.density * best.density_score
            + aesthetic.weights.preview * best.preview_score,
    };

    info!("   => Chosen orbit idx {} with weighted score {:.3}", 
          best.index, result.total_score_weighted);

    (best.bodies.clone(), result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candidate(bodies: Vec<Body>, index: usize, chaos: f64, equil: f64, valid: bool) -> Candidate {
        Candidate {
            bodies,
            index,
            chaos_score: chaos,
            equil_score: equil,
            golden_score: 0.0,
            negative_score: 0.0,
            symmetry_score: 0.0,
            density_score: 0.0,
            preview_score: 0.0,
            is_valid: valid,
        }
    }

    #[test]
    fn test_hierarchical_config_default() {
        let config = HierarchicalBordaConfig::default();
        assert_eq!(config.num_stages, 3);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_hierarchical_config_fast() {
        let config = HierarchicalBordaConfig::fast();
        assert_eq!(config.num_stages, 2);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_hierarchical_config_aggressive() {
        let config = HierarchicalBordaConfig::aggressive();
        assert_eq!(config.num_stages, 4);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_validation_empty_stages() {
        let config = HierarchicalBordaConfig {
            num_stages: 0,
            stage_step_fractions: vec![],
            stage_survival_rates: vec![],
            min_survivors_per_stage: 5,
            parallel: true,
        };
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_mismatched_lengths() {
        let config = HierarchicalBordaConfig {
            num_stages: 2,
            stage_step_fractions: vec![0.1], // Wrong length
            stage_survival_rates: vec![0.5, 1.0],
            min_survivors_per_stage: 5,
            parallel: true,
        };
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_fraction() {
        let config = HierarchicalBordaConfig {
            num_stages: 2,
            stage_step_fractions: vec![-0.1, 1.0], // Invalid negative
            stage_survival_rates: vec![0.5, 1.0],
            min_survivors_per_stage: 5,
            parallel: true,
        };
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_final_stage_not_full() {
        let config = HierarchicalBordaConfig {
            num_stages: 2,
            stage_step_fractions: vec![0.1, 0.5], // Final not 1.0
            stage_survival_rates: vec![0.5, 1.0],
            min_survivors_per_stage: 5,
            parallel: true,
        };
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_candidate_creation() {
        let candidate = make_candidate(vec![], 42, 0.5, 0.8, true);
        assert_eq!(candidate.index, 42);
        assert!(candidate.is_valid);
    }

    #[test]
    fn test_select_top_candidates_empty() {
        let mut candidates: Vec<Candidate> = vec![];
        let weights = AestheticWeights::default();
        let result = select_top_candidates(&mut candidates, &weights, 5);
        assert!(result.is_empty());
    }

    #[test]
    fn test_select_top_candidates_all_invalid() {
        let mut candidates = vec![
            make_candidate(vec![], 0, 0.5, 0.5, false),
            make_candidate(vec![], 1, 0.3, 0.7, false),
        ];
        let weights = AestheticWeights::default();
        let result = select_top_candidates(&mut candidates, &weights, 5);
        assert!(result.is_empty());
    }

    #[test]
    fn test_select_top_candidates_basic() {
        let body = Body::new(
            100.0,
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
        );
        
        let mut candidates = vec![
            make_candidate(vec![body.clone()], 0, 0.9, 0.1, true),
            make_candidate(vec![body.clone()], 1, 0.1, 0.9, true),
            make_candidate(vec![body.clone()], 2, 0.5, 0.5, true),
        ];

        // With equal weights, candidate 1 should win (best at both)
        let weights = AestheticWeights::default();
        let result = select_top_candidates(&mut candidates, &weights, 1);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].index, 1);
    }

    #[test]
    fn test_select_top_candidates_chaos_weighted() {
        let body = Body::new(
            100.0,
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
        );
        
        let mut candidates = vec![
            make_candidate(vec![body.clone()], 0, 0.1, 0.1, true),
            make_candidate(vec![body.clone()], 1, 0.9, 0.9, true),
        ];

        // Heavy chaos weight should favor candidate 0
        let weights = AestheticWeights {
            chaos: 10.0,
            equilateralness: 1.0,
            ..AestheticWeights::default()
        };
        let result = select_top_candidates(&mut candidates, &weights, 1);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].index, 0);
    }

    #[test]
    fn test_select_top_candidates_equil_weighted() {
        let body = Body::new(
            100.0,
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
        );
        
        let mut candidates = vec![
            make_candidate(vec![body.clone()], 0, 0.1, 0.1, true),
            make_candidate(vec![body.clone()], 1, 0.9, 0.9, true),
        ];

        // Heavy equil weight should favor candidate 1
        let weights = AestheticWeights {
            chaos: 1.0,
            equilateralness: 10.0,
            ..AestheticWeights::default()
        };
        let result = select_top_candidates(&mut candidates, &weights, 1);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].index, 1);
    }

    #[test]
    fn test_select_top_candidates_keep_multiple() {
        let body = Body::new(
            100.0,
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
        );
        
        let mut candidates = vec![
            make_candidate(vec![body.clone()], 0, 0.3, 0.3, true),
            make_candidate(vec![body.clone()], 1, 0.1, 0.9, true),
            make_candidate(vec![body.clone()], 2, 0.5, 0.5, true),
        ];

        let weights = AestheticWeights::default();
        let result = select_top_candidates(&mut candidates, &weights, 2);
        assert_eq!(result.len(), 2);
    }
}
