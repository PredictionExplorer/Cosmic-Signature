//! Generation logging system for reproducibility
//!
//! This module provides functionality to log all generation parameters to a file,
//! allowing for exact reproduction of any generated image or video.

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
    pub perceptual_blur: String,
    pub perceptual_blur_radius: Option<usize>,
    pub perceptual_blur_strength: f64,
    pub perceptual_gamut_mode: String,
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
        Self {
            selected_index: 0,
            weighted_score: 0.0,
            total_candidates: 0,
            discarded_count: 0,
        }
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
    
    /// Create a new generation logger with a custom path
    #[allow(dead_code)]
    pub fn with_path(path: String) -> Self {
        Self { log_file_path: path }
    }
    
    /// Load all existing records from the log file
    fn load_records(&self) -> Vec<GenerationRecord> {
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
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.log_file_path)?;
        
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
    
    /// Find a record by file name
    #[allow(dead_code)]
    pub fn find_by_filename(&self, file_name: &str) -> Option<GenerationRecord> {
        let records = self.load_records();
        records.into_iter().find(|r| r.file_name == file_name)
    }
    
    /// Get the most recent N records
    #[allow(dead_code)]
    pub fn get_recent(&self, count: usize) -> Vec<GenerationRecord> {
        let records = self.load_records();
        let start = records.len().saturating_sub(count);
        records[start..].to_vec()
    }
}

impl Default for GenerationLogger {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper to pretty-print a generation record
#[allow(dead_code)]
pub fn print_record(record: &GenerationRecord) {
    println!("\n=== Generation Record ===");
    println!("Timestamp: {}", record.timestamp);
    println!("File: {}", record.file_name);
    println!("Seed: {}", record.seed);
    println!("Special Mode: {}", record.special_mode);
    println!("\n--- Render Settings ---");
    println!("  Resolution: {}x{}", record.render_config.width, record.render_config.height);
    println!("  Bloom: {}", record.render_config.bloom_mode);
    println!("  HDR: {}", record.render_config.hdr_mode);
    println!("\n--- Drift Settings ---");
    println!("  Enabled: {}", record.drift_config.enabled);
    if record.drift_config.enabled {
        println!("  Mode: {}", record.drift_config.mode);
        println!("  Scale: {:.3}", record.drift_config.scale);
        println!("  Arc Fraction: {:.3}", record.drift_config.arc_fraction);
        println!("  Eccentricity: {:.3}", record.drift_config.orbit_eccentricity);
        println!("  Randomized: {}", record.drift_config.randomized);
    }
    println!("\n--- Simulation Settings ---");
    println!("  Num Simulations: {}", record.simulation_config.num_sims);
    println!("  Num Steps: {}", record.simulation_config.num_steps_sim);
    println!("\n--- Orbit Selection ---");
    println!("  Selected Index: {}", record.orbit_info.selected_index);
    println!("  Weighted Score: {:.3}", record.orbit_info.weighted_score);
    println!("  Total Candidates: {}", record.orbit_info.total_candidates);
    println!("  Discarded: {}", record.orbit_info.discarded_count);
    println!("========================\n");
}

