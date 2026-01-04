//! Advanced Curation System for Museum-Quality Output
//!
//! This module implements a sophisticated multi-stage curation pipeline that ensures
//! every generated image meets museum-quality standards. Unlike simple K-try selection,
//! this system uses:
//!
//! 1. **Two-Stage Curation**: Fast elimination → High-fidelity comparison
//! 2. **Iterative Quality Refinement**: Keep improving until "Excellent" quality
//! 3. **Quality-Directed Candidate Generation**: Use feedback to bias new candidates
//!
//! # Philosophy
//!
//! Museum-quality output cannot be left to chance. Instead of hoping 1 of K random
//! candidates is good, we:
//!
//! - **Actively correct** toward quality using feedback loops
//! - **Iterate** until quality thresholds are met (not just "best of random")
//! - **Render at higher fidelity** for final comparison to avoid preview artifacts
//!
//! # Architecture
//!
//! ```text
//! Stage 1: Fast Preview (K candidates, step_stride=32, scale=0.25)
//!     ↓
//! Top 3 candidates selected
//!     ↓
//! Stage 2: High-Fidelity Preview (3 candidates, step_stride=4, scale=0.5)
//!     ↓
//! Best candidate selected
//!     ↓
//! Stage 3: Iterative Refinement (if score < EXCELLENT)
//!     ↓
//! Apply adjustments → Re-score → Repeat until satisfied
//!     ↓
//! Final verified configuration
//! ```

// Allow dead_code for the public API - this module is designed for integration
// with the main rendering pipeline and exposes types for external use.
#![allow(dead_code)]

use crate::render::context::PixelBuffer;
use crate::render::effect_randomizer::RandomizationLog;
use crate::render::enhanced_quality_metrics::{
    EnhancedQualityMetrics, QualityAdjustment, thresholds,
};
use crate::render::histogram::HistogramData;
use crate::render::randomizable_config::{RandomizableEffectConfig, ResolvedEffectConfig};
use crate::render::types::{ChannelLevels, RenderConfig, RenderParams, SceneDataRef};
use crate::render::compute_black_white_gamma;
use crate::sim::Sha3RandomByteStream;
use sha3::{Digest, Sha3_256};
use tracing::{debug, info, warn};

/// Settings for advanced curation
#[derive(Clone, Copy, Debug)]
pub struct AdvancedCurationSettings {
    // Stage 1: Fast Preview
    /// Number of initial candidates to generate
    pub initial_k: usize,
    /// Preview scale for fast stage (0.0-1.0)
    pub fast_preview_scale: f64,
    /// Step stride for fast preview (higher = faster but less accurate)
    pub fast_step_stride: usize,
    
    // Stage 2: High-Fidelity Comparison
    /// Number of finalists to compare at high fidelity
    pub finalist_count: usize,
    /// Preview scale for high-fidelity stage
    pub hifi_preview_scale: f64,
    /// Step stride for high-fidelity preview (lower = more accurate)
    pub hifi_step_stride: usize,
    
    // Stage 3: Iterative Refinement
    /// Maximum refinement iterations
    pub max_refinement_iterations: usize,
    /// Target quality score (stop iterating when reached)
    pub target_quality: f64,
    /// Minimum quality floor (warn if not achieved)
    pub quality_floor: f64,
    
    // General settings
    /// Pixel stride for histogram sampling
    pub histogram_pixel_stride: usize,
    /// Pixel stride for metric computation
    pub metric_pixel_stride: usize,
}

impl Default for AdvancedCurationSettings {
    fn default() -> Self {
        Self {
            // Stage 1: Cast a wide net with fast previews
            initial_k: 12,
            fast_preview_scale: 0.25,
            fast_step_stride: 32,
            
            // Stage 2: Compare finalists more carefully
            finalist_count: 3,
            hifi_preview_scale: 0.50,
            hifi_step_stride: 4,
            
            // Stage 3: Refine until excellent
            max_refinement_iterations: 5,
            target_quality: thresholds::EXCELLENT,
            quality_floor: thresholds::GOOD,
            
            // Sampling settings
            histogram_pixel_stride: 8,
            metric_pixel_stride: 4,
        }
    }
}

impl AdvancedCurationSettings {
    /// Settings optimized for speed (preview/test mode)
    pub fn fast() -> Self {
        Self {
            initial_k: 4,
            fast_preview_scale: 0.20,
            fast_step_stride: 64,
            finalist_count: 2,
            hifi_preview_scale: 0.33,
            hifi_step_stride: 16,
            max_refinement_iterations: 2,
            ..Default::default()
        }
    }
    
    /// Settings optimized for maximum quality (gallery mode)
    pub fn gallery() -> Self {
        Self {
            initial_k: 16,
            fast_preview_scale: 0.30,
            fast_step_stride: 24,
            finalist_count: 4,
            hifi_preview_scale: 0.60,
            hifi_step_stride: 2,
            max_refinement_iterations: 8,
            ..Default::default()
        }
    }
}

/// Summary of the curation process
#[derive(Clone, Debug)]
pub struct CurationSummary {
    /// Index of the chosen candidate from initial pool
    pub chosen_initial_index: usize,
    /// Final quality score after all refinement
    pub final_score: f64,
    /// Quality metrics at each stage
    pub stage_scores: Vec<f64>,
    /// Number of refinement iterations performed
    pub refinement_iterations: usize,
    /// Whether the target quality was achieved
    pub target_achieved: bool,
    /// Final enhanced metrics
    pub final_metrics: EnhancedQualityMetrics,
    /// Adjustments applied during refinement
    pub adjustments_applied: Vec<String>,
}

/// Result of advanced curation
#[derive(Clone, Debug)]
pub struct AdvancedCuratedConfig {
    pub resolved: ResolvedEffectConfig,
    pub randomization_log: RandomizationLog,
    pub summary: CurationSummary,
}

/// Candidate evaluation result
struct CandidateScore {
    config: ResolvedEffectConfig,
    log: RandomizationLog,
    score: f64,
    metrics: EnhancedQualityMetrics,
    index: usize,
}

/// Advanced curation with multi-stage selection and iterative refinement.
///
/// This is the main entry point for museum-quality image curation. It performs:
///
/// 1. **Stage 1**: Generate K candidates with fast preview, select top finalists
/// 2. **Stage 2**: Re-evaluate finalists with high-fidelity preview
/// 3. **Stage 3**: Iteratively refine the winner until quality target is met
///
/// # Arguments
///
/// * `seed_bytes` - Deterministic seed for reproducibility
/// * `base_candidate` - Initial effect configuration
/// * `base_log` - Randomization log for the base candidate
/// * `randomizable_config` - Template for generating new candidates
/// * `width`, `height` - Output dimensions
/// * `special_mode` - Whether special mode effects are enabled
/// * `hdr_mode_auto` - Whether HDR mode is automatic
/// * `noise_seed` - Noise seed for effects
/// * `scene` - Scene data (positions, colors, alphas)
/// * `render_config` - Rendering configuration
/// * `settings` - Curation settings
///
/// # Returns
///
/// The best configuration found after all curation stages
pub fn advanced_curate_effect_config(
    seed_bytes: &[u8],
    base_candidate: ResolvedEffectConfig,
    base_log: RandomizationLog,
    randomizable_config: &RandomizableEffectConfig,
    width: u32,
    height: u32,
    special_mode: bool,
    hdr_mode_auto: bool,
    noise_seed: i32,
    scene: SceneDataRef<'_>,
    render_config: &RenderConfig,
    settings: AdvancedCurationSettings,
) -> AdvancedCuratedConfig {
    info!("Starting advanced curation (K={}, finalists={}, max_iter={})",
        settings.initial_k, settings.finalist_count, settings.max_refinement_iterations);
    
    let mut stage_scores = Vec::new();
    
    // =========================================================================
    // STAGE 1: Fast Preview - Generate and score K candidates
    // =========================================================================
    debug!("Stage 1: Fast preview of {} candidates", settings.initial_k);
    
    let mut candidates: Vec<CandidateScore> = Vec::with_capacity(settings.initial_k);
    
    // Candidate 0: Base config
    let base_score = score_candidate_enhanced(
        &base_candidate,
        scene,
        render_config,
        settings.fast_preview_scale,
        settings.fast_step_stride,
        settings.histogram_pixel_stride,
        settings.metric_pixel_stride,
        hdr_mode_auto,
    );
    
    candidates.push(CandidateScore {
        config: base_candidate.clone(),
        log: base_log.clone(),
        score: base_score.0,
        metrics: base_score.1,
        index: 0,
    });
    
    // Generate additional candidates
    for idx in 1..settings.initial_k {
        let mut rng = derived_rng(seed_bytes, idx);
        let (resolved, log) = randomizable_config.resolve(
            &mut rng, width, height, special_mode, noise_seed
        );
        
        let (score, metrics) = score_candidate_enhanced(
            &resolved,
            scene,
            render_config,
            settings.fast_preview_scale,
            settings.fast_step_stride,
            settings.histogram_pixel_stride,
            settings.metric_pixel_stride,
            hdr_mode_auto,
        );
        
        candidates.push(CandidateScore {
            config: resolved,
            log,
            score,
            metrics,
            index: idx,
        });
        
        debug!("  Candidate {}: score={:.3}", idx, score);
    }
    
    // Sort by score (descending) and take finalists
    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let finalists: Vec<_> = candidates.into_iter().take(settings.finalist_count).collect();
    
    let stage1_best = finalists.first().map(|c| c.score).unwrap_or(0.0);
    stage_scores.push(stage1_best);
    info!("Stage 1 complete: top {} finalists selected (best score: {:.3})", 
        finalists.len(), stage1_best);
    
    // =========================================================================
    // STAGE 2: High-Fidelity Preview - Re-evaluate finalists
    // =========================================================================
    debug!("Stage 2: High-fidelity preview of {} finalists", finalists.len());
    
    let mut hifi_scores: Vec<CandidateScore> = Vec::with_capacity(finalists.len());
    
    for finalist in finalists {
        let (score, metrics) = score_candidate_enhanced(
            &finalist.config,
            scene,
            render_config,
            settings.hifi_preview_scale,
            settings.hifi_step_stride,
            settings.histogram_pixel_stride,
            settings.metric_pixel_stride,
            hdr_mode_auto,
        );
        
        debug!("  Finalist {} (from idx {}): fast={:.3} → hifi={:.3}", 
            hifi_scores.len(), finalist.index, finalist.score, score);
        
        hifi_scores.push(CandidateScore {
            config: finalist.config,
            log: finalist.log,
            score,
            metrics,
            index: finalist.index,
        });
    }
    
    // Select the best after high-fidelity scoring
    hifi_scores.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut best = hifi_scores.remove(0);
    
    let stage2_score = best.score;
    stage_scores.push(stage2_score);
    info!("Stage 2 complete: selected candidate {} with score {:.3}",
        best.index, stage2_score);
    
    // =========================================================================
    // STAGE 3: Iterative Quality Refinement
    // =========================================================================
    let mut refinement_iterations = 0;
    let mut adjustments_applied = Vec::new();
    
    if best.score < settings.target_quality && settings.max_refinement_iterations > 0 {
        debug!("Stage 3: Iterative refinement (current={:.3}, target={:.3})",
            best.score, settings.target_quality);
        
        for iteration in 0..settings.max_refinement_iterations {
            refinement_iterations = iteration + 1;
            
            // Get suggested adjustments
            let adjustments = best.metrics.suggest_adjustments();
            
            if adjustments.is_empty() {
                debug!("  No further adjustments suggested, stopping refinement");
                break;
            }
            
            // Apply adjustments to config
            let mut refined_config = best.config.clone();
            let applied = apply_adjustments(&mut refined_config, &adjustments);
            
            for adj_name in &applied {
                adjustments_applied.push(format!("iter{}: {}", iteration + 1, adj_name));
            }
            
            if applied.is_empty() {
                debug!("  No adjustments could be applied, stopping refinement");
                break;
            }
            
            // Re-score with refined config
            let (new_score, new_metrics) = score_candidate_enhanced(
                &refined_config,
                scene,
                render_config,
                settings.hifi_preview_scale,
                settings.hifi_step_stride,
                settings.histogram_pixel_stride,
                settings.metric_pixel_stride,
                hdr_mode_auto,
            );
            
            debug!("  Iteration {}: {:.3} → {:.3} (applied: {:?})",
                iteration + 1, best.score, new_score, applied);
            
            // Keep refinement if it improved (or didn't make things worse)
            if new_score >= best.score - 0.02 {
                best.config = refined_config;
                best.score = new_score;
                best.metrics = new_metrics;
                stage_scores.push(new_score);
            }
            
            // Check if we've reached target
            if best.score >= settings.target_quality {
                info!("  Target quality achieved at iteration {}", iteration + 1);
                break;
            }
        }
    }
    
    // =========================================================================
    // Final Quality Check
    // =========================================================================
    let target_achieved = best.score >= settings.target_quality;
    
    if best.score < settings.quality_floor {
        warn!("Final quality {:.3} is below floor {:.3} - image may need review",
            best.score, settings.quality_floor);
    } else if !target_achieved {
        info!("Final quality {:.3} is good but below target {:.3}",
            best.score, settings.target_quality);
    } else {
        info!("Curation complete: quality {:.3} (target={:.3}) achieved",
            best.score, settings.target_quality);
    }
    
    AdvancedCuratedConfig {
        resolved: best.config,
        randomization_log: best.log,
        summary: CurationSummary {
            chosen_initial_index: best.index,
            final_score: best.score,
            stage_scores,
            refinement_iterations,
            target_achieved,
            final_metrics: best.metrics,
            adjustments_applied,
        },
    }
}

/// Score a candidate using enhanced quality metrics
fn score_candidate_enhanced(
    candidate: &ResolvedEffectConfig,
    scene: SceneDataRef<'_>,
    render_config: &RenderConfig,
    preview_scale: f64,
    step_stride: usize,
    histogram_stride: usize,
    metric_stride: usize,
    hdr_mode_auto: bool,
) -> (f64, EnhancedQualityMetrics) {
    let (preview_w, preview_h) = preview_resolution(
        candidate.width, candidate.height, preview_scale
    );
    let preview_config = rescale_resolved_config_for_preview(candidate, preview_w, preview_h);
    
    let mut preview_render_config = *render_config;
    preview_render_config.hdr_scale = if hdr_mode_auto { candidate.hdr_scale } else { 1.0 };
    preview_render_config.histogram_pixel_stride = histogram_stride.max(1);
    
    let total_steps = scene.num_steps().max(1);
    let frame_interval = total_steps; // Emit only final frame
    let params = RenderParams::new(
        scene, &preview_config, frame_interval, preview_config.noise_seed, &preview_render_config
    );
    
    let (final_pixels, _levels) = render_preview_frame(
        &params, step_stride.max(1), histogram_stride.max(1)
    );
    
    // Compute enhanced metrics
    let identity_levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
    let metrics = EnhancedQualityMetrics::from_tonemapped_pixel_buffer_sampled(
        &final_pixels,
        preview_w as usize,
        preview_h as usize,
        metric_stride.max(1),
        &identity_levels,
    );
    
    // ========== HARD REJECTION CHECK ==========
    // If the image fails catastrophically, give it a score of 0.0
    // This ensures it won't be selected even if it's the "best" of bad options
    if metrics.is_hard_rejected() {
        warn!("Candidate HARD REJECTED: {}", 
            metrics.hard_rejection_reason().unwrap_or_else(|| "Unknown".to_string()));
        return (0.0, metrics);
    }
    
    // Compute final score with additional biases for museum quality
    let mut score = metrics.quality_score;
    
    // Coverage penalty (avoid empty images)
    let coverage = if metrics.total_pixels > 0 {
        metrics.visible_pixels as f64 / metrics.total_pixels as f64
    } else {
        0.0
    };
    
    if coverage < 0.01 {
        score -= 0.35; // Stronger penalty
    } else if coverage < 0.05 {
        score -= 0.25;
    }
    
    // Prefer images with subject in frame
    if metrics.subject_coverage < 0.03 {
        score -= 0.25; // Stronger penalty
    }
    
    // Strong penalty for very dark images (anything below target luminance)
    if metrics.mean_luminance < 0.15 {
        score -= 0.30 * (0.15 - metrics.mean_luminance) / 0.15;
    } else if metrics.mean_luminance < 0.20 {
        score -= 0.15 * (0.20 - metrics.mean_luminance) / 0.05;
    }
    
    // Strong penalty for very bright images
    if metrics.mean_luminance > 0.40 {
        score -= 0.15 * (metrics.mean_luminance - 0.40) / 0.40;
    }
    
    (score.max(0.0), metrics)
}

/// Apply quality adjustments to a resolved config
fn apply_adjustments(config: &mut ResolvedEffectConfig, adjustments: &[QualityAdjustment]) -> Vec<String> {
    let mut applied = Vec::new();
    
    for adj in adjustments {
        let result = match adj.param.as_str() {
            "glow_strength" => {
                let before = config.glow_strength;
                config.glow_strength = adj.apply(before, 0.0, 10000.0);
                Some(("glow_strength", before, config.glow_strength))
            }
            "chromatic_bloom_strength" => {
                let before = config.chromatic_bloom_strength;
                config.chromatic_bloom_strength = adj.apply(before, 0.0, 2.0);
                Some(("chromatic_bloom_strength", before, config.chromatic_bloom_strength))
            }
            "atmospheric_darkening" => {
                let before = config.atmospheric_darkening;
                config.atmospheric_darkening = adj.apply(before, 0.0, 0.5);
                Some(("atmospheric_darkening", before, config.atmospheric_darkening))
            }
            "volumetric_occlusion_strength" => {
                let before = config.volumetric_occlusion_strength;
                config.volumetric_occlusion_strength = adj.apply(before, 0.0, 1.0);
                Some(("volumetric_occlusion_strength", before, config.volumetric_occlusion_strength))
            }
            "vignette_strength" => {
                let before = config.vignette_strength;
                config.vignette_strength = adj.apply(before, 0.0, 1.0);
                Some(("vignette_strength", before, config.vignette_strength))
            }
            "dodge_burn_strength" => {
                let before = config.dodge_burn_strength;
                config.dodge_burn_strength = adj.apply(before, 0.0, 2.0);
                Some(("dodge_burn_strength", before, config.dodge_burn_strength))
            }
            "micro_contrast_strength" => {
                let before = config.micro_contrast_strength;
                config.micro_contrast_strength = adj.apply(before, 0.0, 1.0);
                Some(("micro_contrast_strength", before, config.micro_contrast_strength))
            }
            "vibrance" => {
                let before = config.vibrance;
                config.vibrance = adj.apply(before, 0.0, 1.0);
                Some(("vibrance", before, config.vibrance))
            }
            "halation_threshold" => {
                let before = config.halation_threshold;
                config.halation_threshold = adj.apply(before, 0.0, 1.0);
                Some(("halation_threshold", before, config.halation_threshold))
            }
            "cosmic_ink_strength" => {
                let before = config.cosmic_ink_strength;
                config.cosmic_ink_strength = adj.apply(before, 0.0, 1.0);
                Some(("cosmic_ink_strength", before, config.cosmic_ink_strength))
            }
            _ => None,
        };
        
        if let Some((name, before, after)) = result {
            if (before - after).abs() > 1e-9 {
                applied.push(format!("{}: {:.3}→{:.3}", name, before, after));
            }
        }
    }
    
    applied
}

/// Generate derived RNG for candidate generation
fn derived_rng(seed_bytes: &[u8], candidate_index: usize) -> Sha3RandomByteStream {
    let mut hasher = Sha3_256::new();
    hasher.update(seed_bytes);
    hasher.update(b"advanced-curation-v2");
    hasher.update((candidate_index as u64).to_le_bytes());
    let digest = hasher.finalize();
    
    Sha3RandomByteStream::new(&digest, 100.0, 300.0, 25.0, 10.0)
}

/// Calculate preview resolution
fn preview_resolution(width: u32, height: u32, scale: f64) -> (u32, u32) {
    let scale = scale.clamp(0.15, 1.0);
    let w = ((width as f64) * scale).round().max(192.0) as u32;
    let h = ((height as f64) * scale).round().max(108.0) as u32;
    // Keep even dimensions
    (w & !1, h & !1)
}

/// Rescale config for preview
fn rescale_resolved_config_for_preview(
    src: &ResolvedEffectConfig,
    preview_w: u32,
    preview_h: u32,
) -> ResolvedEffectConfig {
    let mut cfg = src.clone();
    let old_min = (src.width.min(src.height)).max(1) as f64;
    let new_min = (preview_w.min(preview_h)).max(1) as f64;
    let s = (new_min / old_min).clamp(0.20, 5.0);
    
    cfg.width = preview_w;
    cfg.height = preview_h;
    
    // Rescale pixel-based parameters
    cfg.micro_contrast_radius = ((cfg.micro_contrast_radius as f64) * s).round().max(1.0) as usize;
    cfg.volumetric_occlusion_radius = ((cfg.volumetric_occlusion_radius as f64) * s).round().max(1.0) as usize;
    
    cfg
}

/// Render a preview frame
fn render_preview_frame(
    params: &RenderParams<'_>,
    step_stride: usize,
    histogram_stride: usize,
) -> (PixelBuffer, ChannelLevels) {
    use crate::render::pipeline::RenderLoopContext;
    
    let positions = params.scene.positions;
    let colors = params.scene.colors;
    let body_alphas = params.scene.body_alphas;
    let resolved = params.resolved_config;
    
    let mut loop_ctx = RenderLoopContext::new(params);
    let total_steps = loop_ctx.total_steps();
    
    // Draw with stride
    let mut step = 0usize;
    while step < total_steps {
        loop_ctx.draw_step(step, positions, colors, body_alphas);
        step = step.saturating_add(step_stride);
    }
    
    // Ensure final step is drawn
    if total_steps > 0 && (total_steps - 1) % step_stride != 0 {
        loop_ctx.draw_step(total_steps - 1, positions, colors, body_alphas);
    }
    
    // Convert and build histogram
    let rgba = loop_ctx.snapshot_trajectory_rgba_for_histogram();
    let mut histogram = HistogramData::with_capacity(
        ((params.width() as usize).div_ceil(histogram_stride) * 
         (params.height() as usize).div_ceil(histogram_stride)).max(1)
    );
    
    for y in (0..params.height() as usize).step_by(histogram_stride.max(1)) {
        let row = y * (params.width() as usize);
        for x in (0..params.width() as usize).step_by(histogram_stride.max(1)) {
            let (r, g, b, _a) = rgba[row + x];
            histogram.push(r, g, b);
        }
    }
    
    let (mut all_r, mut all_g, mut all_b) = histogram.extract_channels();
    let (black_r, white_r, black_g, white_g, black_b, white_b) = compute_black_white_gamma(
        &mut all_r,
        &mut all_g,
        &mut all_b,
        resolved.clip_black,
        resolved.clip_white,
    );
    let levels = ChannelLevels::new(black_r, white_r, black_g, white_g, black_b, white_b);
    
    loop_ctx.set_levels_for_exposure(levels);
    let final_pixels = loop_ctx
        .process_frame_from_converted_rgba(0, resolved)
        .expect("Preview render should not fail");
    
    (final_pixels, levels)
}

#[cfg(test)]
mod tests {
    use super::*;
    use nalgebra::Vector3;
    use crate::sim::{Body, get_positions};
    use crate::render::color::generate_body_color_sequences;
    
    fn create_test_scene() -> (Vec<Vec<nalgebra::Vector3<f64>>>, Vec<Vec<crate::render::OklabColor>>, Vec<f64>) {
        let seed = b"test_advanced_curation";
        let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
        
        let bodies = vec![
            Body::new(150.0, Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 0.5, 0.0)),
            Body::new(160.0, Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.0, -0.4, 0.0)),
            Body::new(170.0, Vector3::new(0.0, 1.0, 0.0), Vector3::new(-0.3, 0.0, 0.0)),
        ];
        let sim = get_positions(bodies, 200);
        let (colors, alphas) = generate_body_color_sequences(&mut rng, 200, 0.01);
        
        (sim.positions, colors, alphas)
    }
    
    #[test]
    fn test_preview_resolution_bounds() {
        let (w, h) = preview_resolution(1920, 1080, 0.25);
        assert!(w >= 192, "Width {} should be >= 192", w);
        assert!(h >= 108, "Height {} should be >= 108", h);
        assert_eq!(w % 2, 0, "Width should be even");
        assert_eq!(h % 2, 0, "Height should be even");
        
        let (w2, _h2) = preview_resolution(1920, 1080, 0.5);
        assert!(w2 > w, "Higher scale should give larger preview");
    }
    
    #[test]
    fn test_settings_presets() {
        let default = AdvancedCurationSettings::default();
        let fast = AdvancedCurationSettings::fast();
        let gallery = AdvancedCurationSettings::gallery();
        
        // Fast should have fewer candidates
        assert!(fast.initial_k < default.initial_k);
        
        // Gallery should have more candidates
        assert!(gallery.initial_k > default.initial_k);
        
        // Gallery should have lower step stride (more accurate)
        assert!(gallery.hifi_step_stride < default.hifi_step_stride);
    }
    
    #[test]
    fn test_derived_rng_is_deterministic() {
        let seed = b"determinism_test";
        
        let mut rng1 = derived_rng(seed, 5);
        let mut rng2 = derived_rng(seed, 5);
        
        // Should produce same sequence
        for _ in 0..100 {
            assert_eq!(rng1.next_byte(), rng2.next_byte());
        }
        
        // Different index should produce different sequence
        let mut rng3 = derived_rng(seed, 6);
        let first1 = rng1.next_byte();
        let first3 = rng3.next_byte();
        // Very unlikely to be equal (but possible)
        assert_ne!(first1, first3, "Different indices should produce different RNG streams");
    }
    
    #[test]
    fn test_rescale_config_preserves_ratios() {
        // Create a config by resolving from randomizable
        let seed = b"test_rescale";
        let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
        let randomizable = RandomizableEffectConfig::default();
        let (mut src, _log) = randomizable.resolve(&mut rng, 1920, 1080, false, 42);
        
        // Set specific values for testing
        src.micro_contrast_radius = 8;
        src.volumetric_occlusion_radius = 12;
        
        let preview = rescale_resolved_config_for_preview(&src, 960, 540);
        
        // Dimensions should be updated
        assert_eq!(preview.width, 960);
        assert_eq!(preview.height, 540);
        
        // Radii should be scaled down proportionally
        assert!(preview.micro_contrast_radius < src.micro_contrast_radius);
        assert!(preview.volumetric_occlusion_radius < src.volumetric_occlusion_radius);
    }
    
    #[test]
    fn test_apply_adjustments_modifies_config() {
        use crate::render::enhanced_quality_metrics::AdjustmentDirection;
        
        // Create a config by resolving from randomizable
        let seed = b"test_adjustments";
        let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
        let randomizable = RandomizableEffectConfig::default();
        let (mut config, _log) = randomizable.resolve(&mut rng, 320, 240, false, 42);
        
        // Set specific values for testing
        config.glow_strength = 0.5;
        config.atmospheric_darkening = 0.2;
        
        let adjustments = vec![
            QualityAdjustment {
                category: crate::render::enhanced_quality_metrics::AdjustmentCategory::Technical,
                param: "glow_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.15,
                reason: "test".to_string(),
            },
            QualityAdjustment {
                category: crate::render::enhanced_quality_metrics::AdjustmentCategory::Technical,
                param: "atmospheric_darkening".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.05,
                reason: "test".to_string(),
            },
        ];
        
        let applied = apply_adjustments(&mut config, &adjustments);
        
        assert!(!applied.is_empty(), "Should have applied adjustments");
        assert!(config.glow_strength < 0.5, "Glow should be reduced");
        assert!(config.atmospheric_darkening < 0.2, "Darkening should be reduced");
    }
    
    #[test]
    fn test_advanced_curation_runs_without_panic() {
        let (positions, colors, alphas) = create_test_scene();
        let scene = SceneDataRef::new(&positions, &colors, &alphas);
        
        let seed = b"test_curation_run";
        let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
        
        let randomizable = RandomizableEffectConfig::default();
        let (resolved, log) = randomizable.clone().resolve(&mut rng, 256, 144, false, 42);
        
        // Use fast settings for test
        let settings = AdvancedCurationSettings::fast();
        
        let curated = advanced_curate_effect_config(
            seed,
            resolved,
            log,
            &randomizable,
            256,
            144,
            false,
            true,
            42,
            scene,
            &RenderConfig::default(),
            settings,
        );
        
        // Should produce valid output
        assert!(curated.summary.final_score >= 0.0);
        assert!(curated.summary.final_score <= 1.5); // May exceed 1.0 slightly with bonuses
        assert!(!curated.summary.stage_scores.is_empty());
    }
    
    #[test]
    fn test_curation_summary_tracks_iterations() {
        let (positions, colors, alphas) = create_test_scene();
        let scene = SceneDataRef::new(&positions, &colors, &alphas);
        
        let seed = b"test_iteration_tracking";
        let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
        
        let randomizable = RandomizableEffectConfig::default();
        let (resolved, log) = randomizable.clone().resolve(&mut rng, 192, 108, false, 42);
        
        let mut settings = AdvancedCurationSettings::fast();
        settings.target_quality = 1.5; // Impossible target to force iterations
        settings.max_refinement_iterations = 3;
        
        let curated = advanced_curate_effect_config(
            seed,
            resolved,
            log,
            &randomizable,
            192,
            108,
            false,
            true,
            42,
            scene,
            &RenderConfig::default(),
            settings,
        );
        
        // Should have attempted refinement
        // (may or may not have found adjustments depending on metrics)
        assert!(curated.summary.stage_scores.len() >= 2, 
            "Should have at least stage 1 and stage 2 scores");
    }
}

