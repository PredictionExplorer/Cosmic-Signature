//! Candidate selection helpers for curation pipeline.

use crate::curation::{CandidateEvaluation, quality_score::QualityScores};

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

pub fn composite_score(scores: &QualityScores, novelty_score: f64) -> f64 {
    clamp01(0.70 * scores.image_composite + 0.20 * scores.video_composite + 0.10 * novelty_score)
}

fn feature_distance(a: &crate::curation::quality_score::FrameFeatures, b: &crate::curation::quality_score::FrameFeatures) -> f64 {
    let mut sum = 0.0;
    for i in 0..3 {
        let d_mean = a.mean_rgb[i] - b.mean_rgb[i];
        let d_std = a.std_rgb[i] - b.std_rgb[i];
        sum += 1.2 * d_mean * d_mean;
        sum += 0.8 * d_std * d_std;
    }
    let d_occ = a.occupancy_ratio - b.occupancy_ratio;
    let d_edge = a.edge_density - b.edge_density;
    let d_center = a.center_energy_ratio - b.center_energy_ratio;
    let d_sat = a.saturation_mean - b.saturation_mean;
    let d_band = a.banding_proxy - b.banding_proxy;
    sum += 1.3 * d_occ * d_occ;
    sum += 1.3 * d_edge * d_edge;
    sum += 0.9 * d_center * d_center;
    sum += 1.1 * d_sat * d_sat;
    sum += 0.6 * d_band * d_band;
    sum.sqrt()
}

fn diversity_score(
    candidate: &CandidateEvaluation,
    selected: &[CandidateEvaluation],
) -> f64 {
    if selected.is_empty() {
        return 1.0;
    }
    let min_distance = selected
        .iter()
        .map(|s| feature_distance(&candidate.features, &s.features))
        .fold(f64::INFINITY, f64::min);
    let style_bonus = if selected
        .iter()
        .all(|s| s.style_family != candidate.style_family)
    {
        0.12
    } else {
        0.0
    };
    clamp01((min_distance / 0.35).clamp(0.0, 1.0) + style_bonus)
}

pub fn choose_finalists(
    mut candidates: Vec<CandidateEvaluation>,
    finalist_count: usize,
) -> Vec<CandidateEvaluation> {
    if candidates.is_empty() {
        return Vec::new();
    }
    let target = finalist_count.max(1).min(candidates.len());
    candidates.sort_by(|a, b| {
        b.composite_score
            .partial_cmp(&a.composite_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if target == candidates.len() {
        return candidates;
    }

    let mut selected = Vec::with_capacity(target);
    selected.push(candidates.remove(0));

    while selected.len() < target && !candidates.is_empty() {
        let mut best_idx = 0usize;
        let mut best_utility = f64::NEG_INFINITY;
        for (idx, candidate) in candidates.iter().enumerate() {
            let utility =
                0.68 * candidate.composite_score + 0.32 * diversity_score(candidate, &selected);
            if utility > best_utility {
                best_utility = utility;
                best_idx = idx;
            }
        }
        selected.push(candidates.swap_remove(best_idx));
    }

    selected.sort_by(|a, b| {
        b.composite_score
            .partial_cmp(&a.composite_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    selected
}

pub fn accept_candidate(
    candidate: &CandidateEvaluation,
    min_image_score: f64,
    min_video_score: f64,
    min_novelty_score: f64,
) -> bool {
    candidate.scores.image_composite >= min_image_score
        && candidate.scores.video_composite >= min_video_score
        && candidate.novelty_score >= min_novelty_score
}

pub fn pick_winner(finalists: &[CandidateEvaluation]) -> Option<CandidateEvaluation> {
    finalists
        .iter()
        .max_by(|a, b| {
            a.composite_score
                .partial_cmp(&b.composite_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curation::quality_score::{FrameFeatures, QualityScores};
    use crate::render::effect_randomizer::RandomizationLog;
    use crate::render::randomizable_config::ResolvedEffectConfig;

    fn dummy_config() -> ResolvedEffectConfig {
        ResolvedEffectConfig {
            width: 1,
            height: 1,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: true,
            enable_glow: true,
            enable_chromatic_bloom: true,
            enable_perceptual_blur: true,
            enable_micro_contrast: true,
            enable_gradient_map: true,
            enable_color_grade: true,
            enable_champleve: true,
            enable_aether: true,
            enable_opalescence: true,
            enable_edge_luminance: true,
            enable_atmospheric_depth: true,
            enable_fine_texture: true,
            blur_strength: 1.0,
            blur_radius_scale: 0.01,
            blur_core_brightness: 1.0,
            dog_strength: 0.3,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.5,
            glow_strength: 0.3,
            glow_threshold: 0.6,
            glow_radius_scale: 0.006,
            glow_sharpness: 2.5,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.4,
            chromatic_bloom_radius_scale: 0.01,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.2,
            perceptual_blur_strength: 0.6,
            color_grade_strength: 0.5,
            vignette_strength: 0.4,
            vignette_softness: 2.5,
            vibrance: 1.1,
            clarity_strength: 0.3,
            tone_curve_strength: 0.5,
            gradient_map_strength: 0.6,
            gradient_map_hue_preservation: 0.2,
            gradient_map_palette: 0,
            opalescence_strength: 0.2,
            opalescence_scale: 0.01,
            opalescence_layers: 3,
            champleve_flow_alignment: 0.5,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 1.5,
            champleve_rim_warmth: 0.5,
            champleve_interior_lift: 0.5,
            aether_flow_alignment: 0.6,
            aether_scattering_strength: 0.8,
            aether_iridescence_amplitude: 0.6,
            aether_caustic_strength: 0.2,
            micro_contrast_strength: 0.3,
            micro_contrast_radius: 3,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.2,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.2,
            atmospheric_desaturation: 0.2,
            atmospheric_darkening: 0.2,
            atmospheric_fog_color_r: 0.1,
            atmospheric_fog_color_g: 0.1,
            atmospheric_fog_color_b: 0.1,
            fine_texture_strength: 0.1,
            fine_texture_scale: 0.001,
            fine_texture_contrast: 0.2,
            hdr_scale: 0.1,
            clip_black: 0.01,
            clip_white: 0.99,
            nebula_strength: 0.1,
            nebula_octaves: 4,
            nebula_base_frequency: 0.001,
        }
    }

    fn candidate(score: f64) -> CandidateEvaluation {
        CandidateEvaluation {
            round_id: 1,
            candidate_id: 1,
            style_family: "Test".to_string(),
            config: dummy_config(),
            randomization_log: RandomizationLog::default(),
            scores: QualityScores {
                image_composite: score,
                video_composite: score,
                final_composite: score,
                ..Default::default()
            },
            features: FrameFeatures::default(),
            novelty_score: score,
            composite_score: score,
            repair_actions: Vec::new(),
        }
    }

    fn candidate_with_features(
        id: usize,
        score: f64,
        style_family: &str,
        feature_seed: f64,
    ) -> CandidateEvaluation {
        CandidateEvaluation {
            round_id: 1,
            candidate_id: id,
            style_family: style_family.to_string(),
            config: dummy_config(),
            randomization_log: RandomizationLog::default(),
            scores: QualityScores {
                image_composite: score,
                video_composite: score,
                final_composite: score,
                ..Default::default()
            },
            features: FrameFeatures {
                mean_rgb: [feature_seed, feature_seed * 0.9, feature_seed * 0.8],
                std_rgb: [0.06 + feature_seed * 0.1, 0.05, 0.04],
                occupancy_ratio: 0.25 + feature_seed * 0.2,
                edge_density: 0.10 + feature_seed * 0.15,
                center_energy_ratio: 0.35 + feature_seed * 0.2,
                clip_black_ratio: 0.05,
                clip_white_ratio: 0.02,
                banding_proxy: 0.08 + feature_seed * 0.1,
                saturation_mean: 0.18 + feature_seed * 0.25,
            },
            novelty_score: score,
            composite_score: score,
            repair_actions: Vec::new(),
        }
    }

    #[test]
    fn finalists_are_sorted() {
        let finalists = choose_finalists(vec![candidate(0.2), candidate(0.9), candidate(0.5)], 2);
        assert_eq!(finalists.len(), 2);
        assert!(finalists[0].composite_score >= finalists[1].composite_score);
    }

    #[test]
    fn acceptance_uses_all_thresholds() {
        let c = candidate(0.8);
        assert!(accept_candidate(&c, 0.7, 0.7, 0.7));
        assert!(!accept_candidate(&c, 0.9, 0.7, 0.7));
    }

    #[test]
    fn finalists_balance_score_and_diversity() {
        let near_duplicate_a = candidate_with_features(1, 0.95, "Velvet Nebula", 0.20);
        let near_duplicate_b = candidate_with_features(2, 0.94, "Velvet Nebula", 0.205);
        let distinct_style = candidate_with_features(3, 0.90, "Glass Aurora", 0.85);

        let finalists = choose_finalists(
            vec![near_duplicate_a, near_duplicate_b, distinct_style],
            2,
        );

        assert_eq!(finalists.len(), 2);
        let ids: Vec<usize> = finalists.iter().map(|c| c.candidate_id).collect();
        assert!(ids.contains(&1));
        assert!(ids.contains(&3));
    }
}
