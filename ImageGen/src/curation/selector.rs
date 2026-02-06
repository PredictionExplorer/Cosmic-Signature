//! Candidate selection helpers for curation pipeline.

use crate::curation::{CandidateEvaluation, quality_score::QualityScores};

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

pub fn composite_score(scores: &QualityScores, novelty_score: f64) -> f64 {
    clamp01(0.70 * scores.image_composite + 0.20 * scores.video_composite + 0.10 * novelty_score)
}

pub fn choose_finalists(
    mut candidates: Vec<CandidateEvaluation>,
    finalist_count: usize,
) -> Vec<CandidateEvaluation> {
    candidates.sort_by(|a, b| {
        b.composite_score
            .partial_cmp(&a.composite_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    candidates.truncate(finalist_count.max(1));
    candidates
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
}
