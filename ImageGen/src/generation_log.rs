//! Generation logging system for reproducibility
//!
//! This module provides functionality to log all generation parameters to a file,
//! allowing for exact reproduction of any generated image or video.

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Read as _, Write as _};
use std::path::Path;
use tracing::{error, info, warn};

const LOG_FILE_PATH: &str = "generation_log.json";
const LOCK_FILE_PATH: &str = "generation_log.json.lock";

/// Complete record of a generation run with all parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationRecord {
    /// Timestamp of generation
    pub timestamp: String,
    
    /// Output file name (without extension)
    pub file_name: String,
    
    /// Hex seed used for generation
    pub seed: String,
    
    /// Rendering configuration
    pub render_config: LoggedRenderConfig,
    
    /// Drift configuration
    pub drift_config: DriftConfig,
    
    /// Simulation parameters
    pub simulation_config: SimulationConfig,
    
    /// Selected orbit information from Borda selection
    pub orbit_info: OrbitInfo,
    
    /// Randomization log (if any parameters were randomized)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub randomization_log: Option<crate::render::effect_randomizer::RandomizationLog>,
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
    pub fn new(file_name: String, seed: String) -> Self {
        let timestamp = Local::now().to_rfc3339();
        
        Self {
            timestamp,
            file_name,
            seed,
            render_config: LoggedRenderConfig::default(),
            drift_config: DriftConfig::default(),
            simulation_config: SimulationConfig::default(),
            orbit_info: OrbitInfo::default(),
            randomization_log: None,
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

/// Log manager for generation records.
///
/// Uses file locking (`File::lock`) to ensure safe concurrent writes
/// from parallel simulation processes.
pub struct GenerationLogger {
    log_file_path: String,
    lock_file_path: String,
}

impl GenerationLogger {
    pub fn new() -> Self {
        Self {
            log_file_path: LOG_FILE_PATH.to_string(),
            lock_file_path: LOCK_FILE_PATH.to_string(),
        }
    }

    #[cfg(test)]
    pub fn with_paths(log_path: String, lock_path: String) -> Self {
        Self { log_file_path: log_path, lock_file_path: lock_path }
    }

    /// Append a new generation record to the log, holding an exclusive file lock
    /// for the entire read-modify-write cycle to prevent data loss under concurrency.
    pub fn log_generation(&self, record: GenerationRecord) {
        let lock_file = match OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.lock_file_path)
        {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to create lock file {}: {}", self.lock_file_path, e);
                return;
            }
        };

        if let Err(e) = lock_file.lock() {
            error!("Failed to acquire lock on {}: {}", self.lock_file_path, e);
            return;
        }

        // ---- Critical section: exclusive lock held ----
        let result = self.locked_append(&record);
        // ---- End critical section (lock released on drop) ----

        match result {
            Ok(_) => {
                info!("Generation logged: {}", record.file_name);
            }
            Err(e) => {
                error!("Failed to save generation log: {}", e);
            }
        }
    }

    /// Perform the actual read-modify-write while the caller holds the lock.
    fn locked_append(&self, record: &GenerationRecord) -> std::io::Result<()> {
        let mut records = self.load_records();
        records.push(record.clone());

        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.log_file_path)?;

        let writer = BufWriter::new(file);
        serde_json::to_writer_pretty(writer, &records)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }

    fn load_records(&self) -> Vec<GenerationRecord> {
        let path = Path::new(&self.log_file_path);

        if !path.exists() {
            return Vec::new();
        }

        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to open generation log: {}", e);
                return Vec::new();
            }
        };

        let mut contents = String::new();
        if let Err(e) = file.read_to_string(&mut contents) {
            error!("Failed to read generation log: {}", e);
            return Vec::new();
        }

        let contents = contents.trim();
        if contents.is_empty() {
            return Vec::new();
        }

        match serde_json::from_str(contents) {
            Ok(records) => records,
            Err(e) => {
                warn!("Failed to parse generation log, starting fresh: {}", e);
                self.backup_corrupt_log(&contents);
                Vec::new()
            }
        }
    }

    /// If the log file is corrupt, save a backup so data isn't silently lost.
    fn backup_corrupt_log(&self, contents: &str) {
        let backup_path = format!("{}.corrupt.{}", self.log_file_path, chrono::Utc::now().timestamp());
        if let Ok(mut f) = File::create(&backup_path) {
            let _ = f.write_all(contents.as_bytes());
            warn!("Corrupt log backed up to {}", backup_path);
        }
    }
}

impl Default for GenerationLogger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::thread;

    fn temp_paths(tag: &str) -> (String, String) {
        let dir = std::env::temp_dir();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let log = dir.join(format!("test_gen_log_{tag}_{ts}.json")).to_string_lossy().to_string();
        let lock = format!("{log}.lock");
        (log, lock)
    }

    fn make_record(name: &str) -> GenerationRecord {
        let mut r = GenerationRecord::new(name.to_string(), "0xdead".to_string());
        r.simulation_config.num_sims = 100;
        r
    }

    fn cleanup(paths: &(String, String)) {
        let _ = std::fs::remove_file(&paths.0);
        let _ = std::fs::remove_file(&paths.1);
    }

    #[test]
    fn test_sequential_append() {
        let paths = temp_paths("seq");
        let logger = GenerationLogger::with_paths(paths.0.clone(), paths.1.clone());

        logger.log_generation(make_record("first"));
        logger.log_generation(make_record("second"));
        logger.log_generation(make_record("third"));

        let records = logger.load_records();
        assert_eq!(records.len(), 3);
        assert_eq!(records[0].file_name, "first");
        assert_eq!(records[1].file_name, "second");
        assert_eq!(records[2].file_name, "third");

        cleanup(&paths);
    }

    #[test]
    fn test_concurrent_writes_no_data_loss() {
        let paths = temp_paths("conc");
        let log_path = paths.0.clone();
        let lock_path = paths.1.clone();

        let num_threads = 8;
        let writes_per_thread = 5;
        let barrier = Arc::new(Barrier::new(num_threads));

        let handles: Vec<_> = (0..num_threads)
            .map(|tid| {
                let lp = log_path.clone();
                let lkp = lock_path.clone();
                let b = Arc::clone(&barrier);
                thread::spawn(move || {
                    b.wait();
                    for w in 0..writes_per_thread {
                        let logger = GenerationLogger::with_paths(lp.clone(), lkp.clone());
                        let name = format!("t{tid}_w{w}");
                        logger.log_generation(make_record(&name));
                    }
                })
            })
            .collect();

        for h in handles {
            h.join().expect("thread panicked");
        }

        let logger = GenerationLogger::with_paths(log_path, lock_path);
        let records = logger.load_records();

        assert_eq!(
            records.len(),
            num_threads * writes_per_thread,
            "expected {} records but found {} — data lost to race condition",
            num_threads * writes_per_thread,
            records.len(),
        );

        cleanup(&paths);
    }

    #[test]
    fn test_empty_file_handled() {
        let paths = temp_paths("empty");
        File::create(&paths.0).unwrap();

        let logger = GenerationLogger::with_paths(paths.0.clone(), paths.1.clone());
        let records = logger.load_records();
        assert!(records.is_empty());

        logger.log_generation(make_record("after_empty"));
        let records = logger.load_records();
        assert_eq!(records.len(), 1);

        cleanup(&paths);
    }

    #[test]
    fn test_corrupt_file_backed_up() {
        let paths = temp_paths("corrupt");
        std::fs::write(&paths.0, "this is not json").unwrap();

        let logger = GenerationLogger::with_paths(paths.0.clone(), paths.1.clone());
        logger.log_generation(make_record("fresh_start"));

        let records = logger.load_records();
        assert_eq!(records.len(), 1, "should recover with a fresh log");
        assert_eq!(records[0].file_name, "fresh_start");

        let backups: Vec<_> = std::fs::read_dir(std::env::temp_dir())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("test_gen_log_corrupt"))
            .filter(|e| e.file_name().to_string_lossy().contains(".corrupt."))
            .collect();
        assert!(!backups.is_empty(), "corrupt file should be backed up");

        for b in &backups {
            let _ = std::fs::remove_file(b.path());
        }
        cleanup(&paths);
    }

    #[test]
    fn test_nonexistent_file_creates_fresh() {
        let paths = temp_paths("fresh");
        let _ = std::fs::remove_file(&paths.0);

        let logger = GenerationLogger::with_paths(paths.0.clone(), paths.1.clone());
        logger.log_generation(make_record("brand_new"));

        let records = logger.load_records();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].file_name, "brand_new");

        cleanup(&paths);
    }
}
