//! Curation pipeline for high-variability, high-beauty output selection.

use crate::render::effect_randomizer::RandomizationLog;
use crate::render::randomizable_config::ResolvedEffectConfig;

pub mod novelty;
pub mod quality_score;
pub mod repair;
pub mod selector;
pub mod style_families;

#[allow(unused_imports)] // Re-export for external consumers
pub use style_families::StyleFamily;

/// High-level curation strategy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QualityMode {
    Strict,
    Balanced,
    Explore,
}

impl QualityMode {
    pub fn from_str(value: &str) -> Self {
        match value.to_ascii_lowercase().as_str() {
            "strict" => Self::Strict,
            "balanced" => Self::Balanced,
            "explore" => Self::Explore,
            _ => Self::Strict,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Strict => "strict",
            Self::Balanced => "balanced",
            Self::Explore => "explore",
        }
    }
}

/// Curation and candidate search options.
#[derive(Clone, Debug)]
pub struct CurationOptions {
    pub quality_mode: QualityMode,
    pub candidate_count_preview: usize,
    pub finalist_count: usize,
    pub max_curation_rounds: usize,
    pub min_image_score: f64,
    pub min_video_score: f64,
    pub min_novelty_score: f64,
    pub allow_repair_pass: bool,
    pub style_family: Option<String>,
}

impl Default for CurationOptions {
    fn default() -> Self {
        Self {
            quality_mode: QualityMode::Strict,
            candidate_count_preview: 30,
            finalist_count: 2,
            max_curation_rounds: 2,
            min_image_score: 0.78,
            min_video_score: 0.72,
            min_novelty_score: 0.18,
            allow_repair_pass: true,
            style_family: None,
        }
    }
}

/// Candidate evaluation with metrics and provenance.
#[derive(Clone, Debug)]
pub struct CandidateEvaluation {
    pub round_id: usize,
    pub candidate_id: usize,
    pub style_family: String,
    pub config: ResolvedEffectConfig,
    pub randomization_log: RandomizationLog,
    pub scores: quality_score::QualityScores,
    pub features: quality_score::FrameFeatures,
    pub novelty_score: f64,
    pub composite_score: f64,
    pub repair_actions: Vec<String>,
}

/// End result of curation search.
#[allow(dead_code)] // Reserved for public API and future pipeline composition.
#[derive(Clone, Debug)]
pub struct CurationOutcome {
    pub winner: CandidateEvaluation,
    pub summary: CurationSummary,
}

/// Run-level curation metadata for reproducibility.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CurationSummary {
    pub quality_mode: String,
    pub rounds_used: usize,
    pub accepted: bool,
    pub total_candidates: usize,
    pub finalists_considered: usize,
    pub rejection_reason: Option<String>,
}

impl Default for CurationSummary {
    fn default() -> Self {
        Self {
            quality_mode: "strict".to_string(),
            rounds_used: 0,
            accepted: false,
            total_candidates: 0,
            finalists_considered: 0,
            rejection_reason: None,
        }
    }
}
