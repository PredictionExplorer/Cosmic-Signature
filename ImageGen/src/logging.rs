//! Structured logging utilities for consistent progress reporting.
//!
//! This module provides helpers for structured, consistent logging throughout
//! the rendering pipeline. All log messages use structured fields for machine
//! parsability while remaining human-readable.

use tracing::{debug, info};

/// Stage progress tracker for consistent logging across the rendering pipeline.
///
/// This struct provides a uniform interface for logging stage progress,
/// ensuring all log messages have consistent formatting and structured fields.
///
/// # Example
///
/// ```ignore
/// let stage = StageProgress::new(1, 7, "borda_selection");
/// stage.log_start("Searching through 50000 random orbits");
/// // ... do work ...
/// stage.log_complete("Selected best orbit with score 0.85");
/// ```
#[derive(Debug, Clone)]
pub struct StageProgress {
    current: usize,
    total: usize,
    name: &'static str,
}

impl StageProgress {
    /// Create a new stage progress tracker.
    ///
    /// # Arguments
    ///
    /// * `current` - Current stage number (1-indexed)
    /// * `total` - Total number of stages
    /// * `name` - Short name for the operation (used in structured logs)
    #[must_use]
    pub fn new(current: usize, total: usize, name: &'static str) -> Self {
        Self { current, total, name }
    }

    /// Log the start of this stage.
    ///
    /// Emits a structured log message with stage number, total stages,
    /// and operation name as fields.
    pub fn log_start(&self, details: &str) {
        info!(
            stage = self.current,
            total_stages = self.total,
            operation = self.name,
            "STAGE {}/{}: {}",
            self.current,
            self.total,
            details
        );
    }

    /// Log successful completion of this stage.
    pub fn log_complete(&self, details: &str) {
        info!(
            stage = self.current,
            total_stages = self.total,
            operation = self.name,
            status = "complete",
            "   => {}",
            details
        );
    }

    /// Log a progress update within this stage.
    ///
    /// # Arguments
    ///
    /// * `percent` - Progress percentage (0.0 to 100.0)
    /// * `pass` - Optional pass number for multi-pass operations
    pub fn log_progress(&self, percent: f64, pass: Option<usize>) {
        if let Some(p) = pass {
            debug!(
                stage = self.current,
                total_stages = self.total,
                operation = self.name,
                progress = format!("{:.1}%", percent),
                pass = p,
                "Progress"
            );
        } else {
            debug!(
                stage = self.current,
                total_stages = self.total,
                operation = self.name,
                progress = format!("{:.1}%", percent),
                "Progress"
            );
        }
    }
}

/// Statistics tracker for filter operations.
///
/// Used to log filtering results with consistent structured fields.
#[derive(Debug, Clone, Default)]
pub struct FilterStats {
    total: usize,
    discarded: usize,
    reason: Option<String>,
}

impl FilterStats {
    /// Create a new filter stats tracker.
    #[must_use]
    pub fn new(total: usize) -> Self {
        Self {
            total,
            discarded: 0,
            reason: None,
        }
    }

    /// Record discarded items with a reason.
    pub fn record_discards(&mut self, count: usize, reason: impl Into<String>) {
        self.discarded = count;
        self.reason = Some(reason.into());
    }

    /// Log the filter results with structured fields.
    pub fn log_results(&self) {
        let percent = if self.total > 0 {
            100.0 * self.discarded as f64 / self.total as f64
        } else {
            0.0
        };

        info!(
            discarded = self.discarded,
            total = self.total,
            percent = format!("{:.1}%", percent),
            reason = self.reason.as_deref().unwrap_or("N/A"),
            "Filtering complete"
        );
    }
}

/// Render progress tracker for consistent frame-by-frame logging.
#[derive(Debug, Clone)]
pub struct RenderProgress {
    pass: usize,
    mode: &'static str,
    total_steps: usize,
    chunk_size: usize,
}

impl RenderProgress {
    /// Create a new render progress tracker.
    ///
    /// # Arguments
    ///
    /// * `pass` - Pass number (1 for histogram, 2 for final render)
    /// * `mode` - Rendering mode (e.g., "spectral")
    /// * `total_steps` - Total simulation steps
    #[must_use]
    pub fn new(pass: usize, mode: &'static str, total_steps: usize) -> Self {
        let chunk_size = (total_steps / 10).max(1);
        Self {
            pass,
            mode,
            total_steps,
            chunk_size,
        }
    }

    /// Check if we should log progress at this step.
    #[must_use]
    pub fn should_log(&self, step: usize) -> bool {
        step.is_multiple_of(self.chunk_size)
    }

    /// Log progress for a given step.
    pub fn log_step(&self, step: usize) {
        if self.should_log(step) {
            let percent = (step as f64 / self.total_steps as f64) * 100.0;
            debug!(
                progress = format!("{:.1}%", percent),
                pass = self.pass,
                mode = self.mode,
                step = step,
                total_steps = self.total_steps,
                "Render pass progress"
            );
        }
    }

    /// Log completion of the render pass.
    pub fn log_complete(&self) {
        info!(
            pass = self.pass,
            mode = self.mode,
            status = "complete",
            "   pass {} ({} render): 100% done",
            self.pass,
            self.mode
        );
    }
}

/// Performance metrics for a render operation.
#[derive(Debug, Clone)]
pub struct RenderMetrics {
    pub width: u32,
    pub height: u32,
    pub total_frames: usize,
    pub total_steps: usize,
    pub effects_enabled: Vec<&'static str>,
}

impl RenderMetrics {
    /// Log render configuration at start.
    pub fn log_config(&self) {
        info!(
            width = self.width,
            height = self.height,
            total_frames = self.total_frames,
            total_steps = self.total_steps,
            effects = ?self.effects_enabled,
            "Render configuration"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stage_progress_creation() {
        let stage = StageProgress::new(1, 7, "test_operation");
        assert_eq!(stage.current, 1);
        assert_eq!(stage.total, 7);
        assert_eq!(stage.name, "test_operation");
    }

    #[test]
    fn test_filter_stats_percent() {
        let mut stats = FilterStats::new(100);
        stats.record_discards(25, "test reason");
        
        assert_eq!(stats.total, 100);
        assert_eq!(stats.discarded, 25);
        assert_eq!(stats.reason, Some("test reason".to_string()));
    }

    #[test]
    fn test_render_progress_should_log() {
        let progress = RenderProgress::new(1, "spectral", 100);
        
        // Should log every 10 steps (chunk_size = 10)
        assert!(progress.should_log(0));
        assert!(progress.should_log(10));
        assert!(progress.should_log(20));
        assert!(!progress.should_log(5));
        assert!(!progress.should_log(15));
    }

    #[test]
    fn test_render_progress_minimum_chunk() {
        // For small total_steps, chunk_size should be at least 1
        let progress = RenderProgress::new(1, "spectral", 5);
        assert!(progress.chunk_size >= 1);
    }
}

