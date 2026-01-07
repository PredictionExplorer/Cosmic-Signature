//! Effect curation (K-try selection) for museum-quality output.
//!
//! The renderer has a very large creative parameter space. Even with a strong randomizer
//! (StyleGenome + ArtifactBudget), some seeds will still land on weaker configurations.
//! For museum-quality output we can afford extra compute: we generate **K** candidate
//! effect configurations, render a **cheap preview**, score it using `QualityMetrics`,
//! and select the best candidate before running Pass 1/2 at full fidelity.
//!
//! ## Design goals
//! - Deterministic given seed + args (reproducible)
//! - Does **not** perturb simulation RNG / Borda orbit selection
//! - Cheap enough to run routinely in gallery mode
//! - Uses objective metrics (clipping, contrast, gamut stress) with a small compositional bias
//!   toward “readable subject / subdued background”.

use crate::render::context::PixelBuffer;
use crate::render::histogram::HistogramData;
use crate::render::effect_randomizer::RandomizationLog;
use crate::render::randomizable_config::{RandomizableEffectConfig, ResolvedEffectConfig};
use crate::render::types::{ChannelLevels, RenderConfig, RenderParams, SceneDataRef};
use crate::render::{compute_black_white_gamma, quality_metrics::QualityMetrics};
use crate::sim::Sha3RandomByteStream;
use sha3::{Digest, Sha3_256};

/// Curated selection settings.
#[derive(Clone, Copy, Debug)]
pub struct CurationSettings {
    /// Number of candidates to try. `1` disables curation.
    pub k: usize,
    /// Preview resolution scale (relative to target width/height).
    pub preview_scale: f64,
    /// Step stride for preview drawing (skip simulation steps for speed).
    pub preview_step_stride: usize,
    /// Pixel stride for preview histogram sampling.
    pub histogram_pixel_stride: usize,
    /// Pixel stride for preview metric sampling.
    pub metric_pixel_stride: usize,
    /// Minimum acceptable quality score (0..1).
    pub quality_floor: f64,
}

impl Default for CurationSettings {
    fn default() -> Self {
        Self {
            k: 8,
            preview_scale: 0.333,
            preview_step_stride: 64,
            histogram_pixel_stride: 16,
            metric_pixel_stride: 8,
            quality_floor: 0.70,
        }
    }
}

/// Summary of the curated selection.
#[derive(Clone, Debug)]
pub struct CurationSummary {
    pub chosen_index: usize,
    pub chosen_score: f64,
    pub chosen_metrics: QualityMetrics,
}

/// Result of curation: chosen config + metrics summary.
#[derive(Clone, Debug)]
pub struct CuratedConfig {
    pub resolved: ResolvedEffectConfig,
    pub randomization_log: RandomizationLog,
    pub summary: CurationSummary,
}

/// Curate a resolved effect config by trying additional deterministic candidates.
///
/// Candidate 0 is the already-resolved config (created using the main RNG). Additional
/// candidates are generated using a derived RNG that depends only on the seed bytes and
/// the candidate index — ensuring the simulation RNG sequence is unchanged.
pub fn curate_effect_config(
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
    settings: CurationSettings,
) -> CuratedConfig {
    if settings.k <= 1 {
        // Still compute a preview score (useful for logging / auto-tune hooks),
        // but keep the original candidate.
        let (score, metrics) =
            score_candidate(&base_candidate, scene, render_config, settings, hdr_mode_auto);
        return CuratedConfig {
            resolved: base_candidate,
            randomization_log: base_log,
            summary: CurationSummary { chosen_index: 0, chosen_score: score, chosen_metrics: metrics },
        };
    }

    let k = settings.k.max(1);

    // Candidate 0: base config.
    let (mut best_score, mut best_metrics) =
        score_candidate(&base_candidate, scene, render_config, settings, hdr_mode_auto);
    let mut best_config = base_candidate.clone();
    let mut best_log = base_log.clone();
    let mut best_idx = 0usize;

    // Candidates 1..k-1: derived RNG, does not affect simulation RNG.
    for idx in 1..k {
        let mut rng = derived_rng(seed_bytes, idx);
        let (resolved, log) =
            randomizable_config.resolve(&mut rng, width, height, special_mode, noise_seed);

        let (score, metrics) = score_candidate(&resolved, scene, render_config, settings, hdr_mode_auto);
        if score > best_score {
            best_score = score;
            best_metrics = metrics;
            best_config = resolved;
            best_log = log;
            best_idx = idx;
        }
    }

    CuratedConfig {
        resolved: best_config,
        randomization_log: best_log,
        summary: CurationSummary { chosen_index: best_idx, chosen_score: best_score, chosen_metrics: best_metrics },
    }
}

fn derived_rng(seed_bytes: &[u8], candidate_index: usize) -> Sha3RandomByteStream {
    let mut hasher = Sha3_256::new();
    hasher.update(seed_bytes);
    hasher.update(b"effects-curation-v1");
    hasher.update((candidate_index as u64).to_le_bytes());
    let digest = hasher.finalize();

    // Mass/location/velocity ranges are irrelevant for effect randomization, but required
    // by the RNG constructor. Use stable constants for deterministic independence.
    Sha3RandomByteStream::new(&digest, 100.0, 300.0, 25.0, 10.0)
}

fn score_candidate(
    candidate: &ResolvedEffectConfig,
    scene: SceneDataRef<'_>,
    render_config: &RenderConfig,
    settings: CurationSettings,
    hdr_mode_auto: bool,
) -> (f64, QualityMetrics) {
    let (preview_w, preview_h) = preview_resolution(candidate.width, candidate.height, settings.preview_scale);
    let preview_config = rescale_resolved_config_for_preview(candidate, preview_w, preview_h);

    let mut preview_render_config = *render_config;
    preview_render_config.hdr_scale = if hdr_mode_auto { candidate.hdr_scale } else { 1.0 };
    preview_render_config.histogram_pixel_stride = settings.histogram_pixel_stride.max(1);

    let total_steps = scene.num_steps().max(1);
    let frame_interval = total_steps; // emit only the final frame (is_final)
    let params = RenderParams::new(scene, &preview_config, frame_interval, preview_config.noise_seed, &preview_render_config);

    let (final_pixels, levels) = render_preview_frame(&params, settings.preview_step_stride.max(1), settings.histogram_pixel_stride.max(1));

    // Compute display-referred metrics by tonemapping sampled pixels with identity levels
    // (data is normalized pre-effects during rendering).
    let identity_levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
    let metrics = QualityMetrics::from_tonemapped_pixel_buffer_sampled(
        &final_pixels,
        preview_w as usize,
        preview_h as usize,
        settings.metric_pixel_stride.max(1),
        &identity_levels,
    );

    // Composition bias: penalize extremely low visible coverage (empty images).
    let coverage = if metrics.total_pixels > 0 {
        metrics.visible_pixels as f64 / metrics.total_pixels as f64
    } else {
        0.0
    };

    // Basic score: quality score with gentle coverage + midtone preference.
    let mut score = metrics.quality_score;

    // Enforce a soft quality floor: candidates below the threshold are strongly disfavored.
    // This prevents “best of bad” outcomes when all candidates are weak.
    if metrics.quality_score < settings.quality_floor {
        let deficit = settings.quality_floor - metrics.quality_score;
        score -= deficit.min(0.5);
    }
    if coverage < 0.01 {
        score -= 0.20;
    } else if coverage < 0.03 {
        score -= 0.10;
    }

    // Prefer mean luminance near a photographic midtone range.
    let target_mean = 0.22;
    let mean_err = (metrics.mean_luminance - target_mean).abs();
    score -= (mean_err / 0.22).min(0.25);

    // Prefer non-flat contrast (already in quality_score, add a tiny extra incentive).
    score += (metrics.contrast_spread - 0.10).clamp(0.0, 0.08);

    // Encourage candidates that produce stable histogram levels (avoid extreme scaling).
    // This helps prevent the “firefly exposure collapse” failure mode.
    let _ = levels; // reserved for future scoring refinement (kept for clarity)

    (score, metrics)
}

fn preview_resolution(width: u32, height: u32, scale: f64) -> (u32, u32) {
    let scale = scale.clamp(0.20, 1.0);
    let w = ((width as f64) * scale).round().max(256.0) as u32;
    let h = ((height as f64) * scale).round().max(144.0) as u32;
    // Keep even dimensions for video-friendly scaling and some SIMD kernels.
    (w & !1, h & !1)
}

fn rescale_resolved_config_for_preview(
    src: &ResolvedEffectConfig,
    preview_w: u32,
    preview_h: u32,
) -> ResolvedEffectConfig {
    let mut cfg = src.clone();
    let old_min = (src.width.min(src.height)).max(1) as f64;
    let new_min = (preview_w.min(preview_h)).max(1) as f64;
    let s = (new_min / old_min).clamp(0.25, 4.0);

    cfg.width = preview_w;
    cfg.height = preview_h;

    // Rescale pixel-based radii to preserve perceived scale in preview.
    cfg.micro_contrast_radius = ((cfg.micro_contrast_radius as f64) * s).round().max(1.0) as usize;
    cfg.volumetric_occlusion_radius =
        ((cfg.volumetric_occlusion_radius as f64) * s).round().max(1.0) as usize;

    cfg
}

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

    // Draw sparsely for speed (still deterministic).
    let mut step = 0usize;
    while step < total_steps {
        loop_ctx.draw_step(step, positions, colors, body_alphas);
        step = step.saturating_add(step_stride);
    }
    // Ensure we draw the final step so body_positions are correct for finishing effects.
    if total_steps > 0 && !(total_steps - 1).is_multiple_of(step_stride) {
        loop_ctx.draw_step(total_steps - 1, positions, colors, body_alphas);
    }

    // Convert SPD -> RGBA and build a sampled histogram for levels.
    let rgba = loop_ctx.snapshot_trajectory_rgba_for_histogram();
    let mut histogram = HistogramData::with_capacity(
        ((params.width() as usize).div_ceil(histogram_stride) * (params.height() as usize).div_ceil(histogram_stride))
            .max(1),
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

    #[test]
    fn test_preview_resolution_is_even_and_bounded() {
        let (w, h) = preview_resolution(1920, 1080, 0.333);
        assert_eq!(w % 2, 0);
        assert_eq!(h % 2, 0);
        assert!(w >= 256);
        assert!(h >= 144);
    }

    #[test]
    fn test_curation_k1_is_identity() {
        let seed = b"curation_identity_v1";
        let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);

        // Simple deterministic scene
        let bodies = vec![
            Body::new(150.0, Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 0.5, 0.0)),
            Body::new(160.0, Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.0, -0.4, 0.0)),
            Body::new(170.0, Vector3::new(0.0, 1.0, 0.0), Vector3::new(-0.3, 0.0, 0.0)),
        ];
        let sim = get_positions(bodies, 200);
        let positions = sim.positions;
        let (colors, alphas) = generate_body_color_sequences(&mut rng, 200, 0.01);

        let scene = SceneDataRef::new(&positions, &colors, &alphas);
        let randomizable = RandomizableEffectConfig::default();
        let (resolved, log) = randomizable.clone().resolve(&mut rng, 320, 240, false, 42);

        let settings = CurationSettings { k: 1, ..Default::default() };
        let curated = curate_effect_config(
            seed,
            resolved.clone(),
            log,
            &randomizable,
            320,
            240,
            false,
            true,
            42,
            scene,
            &RenderConfig::default(),
            settings,
        );

        assert_eq!(curated.resolved.width, resolved.width);
        assert_eq!(curated.resolved.height, resolved.height);
    }
}


