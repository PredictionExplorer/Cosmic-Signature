//! Generation logging system for reproducibility
//!
//! This module provides functionality to log all generation parameters to a file,
//! allowing for exact reproduction of any generated image or video.

use crate::curation::{
    CurationSummary,
    quality_score::{FrameFeatures, QualityScores},
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufReader, BufWriter};
use std::path::Path;
use tracing::{error, info};

const LOG_FILE_PATH: &str = "generation_log.json";

/// Complete record of a generation run with all parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationRecord {
    /// Timestamp of generation
    pub timestamp: String,

    /// Output file name (without extension)
    pub file_name: String,

    /// Hex seed used for generation
    pub seed: String,

    /// Whether special mode was enabled
    pub special_mode: bool,

    /// Rendering configuration
    pub render_config: LoggedRenderConfig,

    /// Drift configuration
    pub drift_config: DriftConfig,

    /// Simulation parameters
    pub simulation_config: SimulationConfig,

    /// Selected orbit information from Borda selection
    pub orbit_info: OrbitInfo,

    /// Orbit bodies (for fast reproduction / skipping Borda search)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orbit_bodies: Option<Vec<LoggedBody>>,

    /// Fully resolved effect configuration (for fast reproduction)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_effect_config: Option<crate::render::randomizable_config::ResolvedEffectConfig>,

    /// Randomization log (if any parameters were randomized)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub randomization_log: Option<crate::render::effect_randomizer::RandomizationLog>,

    /// Curation metadata for strict/balanced quality runs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curation: Option<CurationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggedRenderConfig {
    pub width: u32,
    pub height: u32,
    pub clip_black: f64,
    pub clip_white: f64,
    pub alpha_denom: usize,
    pub alpha_compress: f64,
    pub bloom_mode: String,
    pub dog_strength: f64,
    pub dog_sigma: Option<f64>,
    pub dog_ratio: f64,
    pub hdr_mode: String,
    pub hdr_scale: f64,
    #[serde(default = "default_quality_mode")]
    pub quality_mode: String,
    pub perceptual_blur: String,
    pub perceptual_blur_radius: Option<usize>,
    pub perceptual_blur_strength: f64,
    pub perceptual_gamut_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurationRecord {
    pub summary: CurationSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round_id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_scores: Option<QualityScores>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_features: Option<FrameFeatures>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub novelty_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nebula_palette_id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nebula_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub repair_actions: Vec<String>,
}

fn default_quality_mode() -> String {
    "strict".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftConfig {
    pub enabled: bool,
    pub mode: String,
    pub scale: f64,
    pub arc_fraction: f64,
    pub orbit_eccentricity: f64,
    /// Indicates if these values were randomly generated
    pub randomized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationConfig {
    pub num_sims: usize,
    pub num_steps_sim: usize,
    pub location: f64,
    pub velocity: f64,
    pub min_mass: f64,
    pub max_mass: f64,
    pub chaos_weight: f64,
    pub equil_weight: f64,
    pub escape_threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitInfo {
    pub selected_index: usize,
    pub weighted_score: f64,
    pub total_candidates: usize,
    pub discarded_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggedBody {
    pub mass: f64,
    pub position: [f64; 3],
    pub velocity: [f64; 3],
}

impl GenerationRecord {
    /// Create a new generation record with the current timestamp
    pub fn new(file_name: String, seed: String, special_mode: bool) -> Self {
        let timestamp = Local::now().to_rfc3339();

        Self {
            timestamp,
            file_name,
            seed,
            special_mode,
            render_config: LoggedRenderConfig::default(),
            drift_config: DriftConfig::default(),
            simulation_config: SimulationConfig::default(),
            orbit_info: OrbitInfo::default(),
            orbit_bodies: None,
            resolved_effect_config: None,
            randomization_log: None,
            curation: None,
        }
    }
}

impl Default for LoggedRenderConfig {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            clip_black: 0.010,
            clip_white: 0.990,
            alpha_denom: 15_000_000,
            alpha_compress: 6.0,
            bloom_mode: "dog".to_string(),
            dog_strength: 0.32,
            dog_sigma: None,
            dog_ratio: 2.8,
            hdr_mode: "auto".to_string(),
            hdr_scale: 0.12,
            quality_mode: "strict".to_string(),
            perceptual_blur: "on".to_string(),
            perceptual_blur_radius: None,
            perceptual_blur_strength: 0.65,
            perceptual_gamut_mode: "preserve-hue".to_string(),
        }
    }
}

impl Default for DriftConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: "elliptical".to_string(),
            scale: 1.0,
            arc_fraction: 0.18,
            orbit_eccentricity: 0.15,
            randomized: false,
        }
    }
}

impl Default for SimulationConfig {
    fn default() -> Self {
        Self {
            num_sims: 30_000,
            num_steps_sim: 1_000_000,
            location: 300.0,
            velocity: 1.0,
            min_mass: 100.0,
            max_mass: 300.0,
            chaos_weight: 0.75,
            equil_weight: 11.0,
            escape_threshold: -0.3,
        }
    }
}

impl Default for OrbitInfo {
    fn default() -> Self {
        Self { selected_index: 0, weighted_score: 0.0, total_candidates: 0, discarded_count: 0 }
    }
}

/// Log manager for generation records
pub struct GenerationLogger {
    log_file_path: String,
}

impl GenerationLogger {
    /// Create a new generation logger with the default path
    pub fn new() -> Self {
        Self { log_file_path: LOG_FILE_PATH.to_string() }
    }

    /// Load all existing records from the log file
    pub fn load_records(&self) -> Vec<GenerationRecord> {
        let path = Path::new(&self.log_file_path);

        if !path.exists() {
            return Vec::new();
        }

        match File::open(path) {
            Ok(file) => {
                let reader = BufReader::new(file);
                match serde_json::from_reader(reader) {
                    Ok(records) => records,
                    Err(e) => {
                        error!("Failed to parse generation log: {}", e);
                        Vec::new()
                    }
                }
            }
            Err(e) => {
                error!("Failed to open generation log: {}", e);
                Vec::new()
            }
        }
    }

    /// Save all records to the log file
    fn save_records(&self, records: &[GenerationRecord]) -> std::io::Result<()> {
        let file =
            OpenOptions::new().write(true).create(true).truncate(true).open(&self.log_file_path)?;

        let writer = BufWriter::new(file);
        serde_json::to_writer_pretty(writer, records)?;

        Ok(())
    }

    /// Append a new generation record to the log
    pub fn log_generation(&self, record: GenerationRecord) {
        let mut records = self.load_records();
        records.push(record.clone());

        match self.save_records(&records) {
            Ok(_) => {
                info!("Generation logged to {}", self.log_file_path);
                info!("  Seed: {}", record.seed);
                info!("  File: {}", record.file_name);
                info!("  Special mode: {}", record.special_mode);
                if record.drift_config.randomized {
                    info!("  Drift parameters (randomized):");
                    info!("    scale: {:.3}", record.drift_config.scale);
                    info!("    arc_fraction: {:.3}", record.drift_config.arc_fraction);
                    info!("    eccentricity: {:.3}", record.drift_config.orbit_eccentricity);
                }
            }
            Err(e) => {
                error!("Failed to save generation log: {}", e);
            }
        }
    }
}

impl Default for GenerationLogger {
    fn default() -> Self {
        Self::new()
    }
}

/// Load recent accepted frame feature signatures for novelty gating.
pub fn load_recent_frame_features(limit: usize) -> Vec<FrameFeatures> {
    let logger = GenerationLogger::new();
    let records = logger.load_records();
    let mut features = Vec::new();
    for record in records.into_iter().rev() {
        if let Some(curation) = record.curation {
            if let Some(feature) = curation.frame_features {
                features.push(feature);
                if features.len() >= limit.max(1) {
                    break;
                }
            }
        }
    }
    features.reverse();
    features
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curation::quality_score::QualityScores;

    fn temp_log_path(suffix: &str) -> String {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time ok")
            .as_nanos();
        std::env::temp_dir()
            .join(format!("generation_log_{suffix}_{ts}.json"))
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn curation_nebula_fields_roundtrip_through_log_file() {
        let path = temp_log_path("roundtrip");
        let logger = GenerationLogger { log_file_path: path.clone() };

        let mut record = GenerationRecord::new(
            "special_0001_deadbeef".to_string(),
            "0xdeadbeef".to_string(),
            true,
        );
        record.curation = Some(CurationRecord {
            summary: CurationSummary::default(),
            style_family: Some("Velvet Nebula".to_string()),
            candidate_id: Some(12),
            round_id: Some(2),
            quality_scores: Some(QualityScores {
                image_composite: 0.91,
                video_composite: 0.88,
                final_composite: 0.90,
                nebula_visibility_score: 0.36,
                nebula_dominance_penalty: 0.14,
                nebula_signal_ratio: 0.19,
                ..Default::default()
            }),
            frame_features: Some(FrameFeatures::default()),
            novelty_score: Some(0.27),
            nebula_palette_id: Some(5),
            nebula_strength: Some(0.082),
            repair_actions: vec!["repair:rebalanced_glow".to_string()],
        });

        logger.log_generation(record.clone());
        let loaded = logger.load_records();
        assert!(!loaded.is_empty());
        let last = loaded.last().expect("record exists");
        let curation = last.curation.as_ref().expect("curation exists");
        assert_eq!(curation.nebula_palette_id, Some(5));
        assert_eq!(curation.nebula_strength, Some(0.082));
        assert_eq!(curation.quality_scores.as_ref().map(|q| q.nebula_visibility_score), Some(0.36));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn legacy_curation_json_without_nebula_fields_deserializes() {
        let legacy_json = r#"
        [
          {
            "timestamp": "2026-02-10T00:00:00+00:00",
            "file_name": "special_legacy",
            "seed": "0x01",
            "special_mode": true,
            "render_config": {
              "width": 1920,
              "height": 1080,
              "clip_black": 0.01,
              "clip_white": 0.99,
              "alpha_denom": 15000000,
              "alpha_compress": 6.0,
              "bloom_mode": "dog",
              "dog_strength": 0.32,
              "dog_sigma": null,
              "dog_ratio": 2.8,
              "hdr_mode": "auto",
              "hdr_scale": 0.12,
              "quality_mode": "strict",
              "perceptual_blur": "on",
              "perceptual_blur_radius": null,
              "perceptual_blur_strength": 0.65,
              "perceptual_gamut_mode": "preserve-hue"
            },
            "drift_config": {
              "enabled": true,
              "mode": "elliptical",
              "scale": 1.0,
              "arc_fraction": 0.18,
              "orbit_eccentricity": 0.15,
              "randomized": false
            },
            "simulation_config": {
              "num_sims": 1,
              "num_steps_sim": 10,
              "location": 300.0,
              "velocity": 1.0,
              "min_mass": 100.0,
              "max_mass": 300.0,
              "chaos_weight": 0.75,
              "equil_weight": 11.0,
              "escape_threshold": -0.3
            },
            "orbit_info": {
              "selected_index": 0,
              "weighted_score": 0.0,
              "total_candidates": 1,
              "discarded_count": 0
            },
            "curation": {
              "summary": {
                "quality_mode": "strict",
                "rounds_used": 1,
                "accepted": true,
                "total_candidates": 1,
                "finalists_considered": 1,
                "rejection_reason": null
              },
              "quality_scores": {
                "technical_integrity": 0.9,
                "composition_energy": 0.8,
                "color_harmony": 0.7,
                "effect_coherence": 0.8,
                "temporal_stability": 0.7,
                "motion_smoothness": 0.7,
                "exposure_consistency": 0.7,
                "image_composite": 0.8,
                "video_composite": 0.75,
                "final_composite": 0.78
              },
              "repair_actions": []
            }
          }
        ]
        "#;

        let records: Vec<GenerationRecord> =
            serde_json::from_str(legacy_json).expect("legacy JSON should remain compatible");
        assert_eq!(records.len(), 1);
        let curation = records[0].curation.as_ref().expect("curation exists");
        assert_eq!(curation.nebula_palette_id, None);
        assert_eq!(curation.nebula_strength, None);
        let qs = curation.quality_scores.as_ref().expect("quality scores exist");
        assert_eq!(qs.nebula_visibility_score, 0.0);
        assert_eq!(qs.nebula_dominance_penalty, 0.0);
        assert_eq!(qs.nebula_signal_ratio, 0.0);
    }
}
