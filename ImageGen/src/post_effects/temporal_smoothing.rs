//! Temporal smoothing effect for buttery-smooth video quality.
//!
//! This effect blends each frame with the previous frame to reduce temporal jitter
//! and create a more cinematic, fluid motion. Creates the perception of higher
//! frame rate and more organic movement without actual interpolation.
//!
//! Note: This effect is stateful and requires special integration into the video
//! rendering pipeline. It will be fully integrated in a future update.

#![allow(dead_code)] // Awaiting video pipeline integration

use super::PixelBuffer;
use std::sync::Mutex;

/// Configuration for temporal smoothing effect
#[derive(Clone, Debug)]
pub struct TemporalSmoothingConfig {
    /// Blend factor with previous frame (0.0 = no smoothing, 1.0 = full blend)
    /// Typical values: 0.15-0.35
    pub blend_factor: f64,
    /// Minimum alpha threshold to apply smoothing (prevents ghosting in empty areas)
    pub alpha_threshold: f64,
}

impl Default for TemporalSmoothingConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl TemporalSmoothingConfig {
    /// Create configuration for special mode (stronger smoothing)
    pub fn special_mode() -> Self {
        Self {
            blend_factor: 0.25,      // 25% of previous frame
            alpha_threshold: 0.01,    // Only smooth visible pixels
        }
    }

    /// Create configuration for standard mode (subtle smoothing)
    pub fn standard_mode() -> Self {
        Self {
            blend_factor: 0.15,      // 15% of previous frame
            alpha_threshold: 0.01,
        }
    }
}

/// Temporal smoothing effect with frame history
///
/// Note: This effect maintains state between frames, so it must be used carefully.
/// It's designed for video rendering where frames are processed sequentially.
pub struct TemporalSmoothing {
    config: TemporalSmoothingConfig,
    enabled: bool,
    // Thread-safe frame buffer for video processing
    previous_frame: Mutex<Option<PixelBuffer>>,
}

impl TemporalSmoothing {
    pub fn new(config: TemporalSmoothingConfig) -> Self {
        let enabled = config.blend_factor > 0.0;
        Self {
            config,
            enabled,
            previous_frame: Mutex::new(None),
        }
    }

    /// Process a frame with temporal smoothing
    ///
    /// This is NOT a PostEffect trait implementation because it needs mutable state.
    /// Called directly from the rendering pipeline for video frames.
    pub fn process_frame(&self, current: PixelBuffer) -> PixelBuffer {
        if !self.enabled {
            return current;
        }

        let mut prev_guard = self.previous_frame.lock().unwrap();

        let result = if let Some(prev) = prev_guard.as_ref() {
            // Ensure frame sizes match
            if prev.len() != current.len() {
                // Size mismatch - just use current frame and reset
                *prev_guard = Some(current.clone());
                return current;
            }

            // Blend current with previous
            let blend_factor = self.config.blend_factor;
            let inv_blend = 1.0 - blend_factor;
            let threshold = self.config.alpha_threshold;

            current
                .iter()
                .zip(prev.iter())
                .map(|(&(cr, cg, cb, ca), &(pr, pg, pb, pa))| {
                    // Only blend if both frames have visible content
                    if ca > threshold && pa > threshold {
                        // Blend RGB and alpha
                        let r = cr * inv_blend + pr * blend_factor;
                        let g = cg * inv_blend + pg * blend_factor;
                        let b = cb * inv_blend + pb * blend_factor;
                        let a = ca * inv_blend + pa * blend_factor;
                        (r, g, b, a)
                    } else {
                        // No blending for transparent or appearing pixels
                        (cr, cg, cb, ca)
                    }
                })
                .collect()
        } else {
            // First frame - no previous to blend with
            current.clone()
        };

        // Store current frame for next iteration
        *prev_guard = Some(current);

        result
    }

    /// Reset temporal buffer (call when starting new video or after seeking)
    pub fn reset(&self) {
        let mut prev_guard = self.previous_frame.lock().unwrap();
        *prev_guard = None;
    }

    /// Check if effect is enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_temporal_smoothing_disabled() {
        let config = TemporalSmoothingConfig {
            blend_factor: 0.0,
            alpha_threshold: 0.01,
        };
        let smoother = TemporalSmoothing::new(config);
        assert!(!smoother.is_enabled());
    }

    #[test]
    fn test_temporal_smoothing_enabled() {
        let config = TemporalSmoothingConfig::special_mode();
        let smoother = TemporalSmoothing::new(config);
        assert!(smoother.is_enabled());
    }

    #[test]
    fn test_first_frame_passthrough() {
        let config = TemporalSmoothingConfig::special_mode();
        let smoother = TemporalSmoothing::new(config);

        let frame = vec![(1.0, 0.5, 0.25, 1.0); 100];
        let result = smoother.process_frame(frame.clone());

        // First frame should pass through unchanged
        assert_eq!(result, frame);
    }

    #[test]
    fn test_frame_blending() {
        let config = TemporalSmoothingConfig {
            blend_factor: 0.5, // 50% blend for clear testing
            alpha_threshold: 0.01,
        };
        let smoother = TemporalSmoothing::new(config);

        // First frame
        let frame1 = vec![(1.0, 1.0, 1.0, 1.0); 100];
        let _result1 = smoother.process_frame(frame1);

        // Second frame (black)
        let frame2 = vec![(0.0, 0.0, 0.0, 1.0); 100];
        let result2 = smoother.process_frame(frame2);

        // Should be 50% blend: (0.0 * 0.5 + 1.0 * 0.5) = 0.5
        assert!((result2[0].0 - 0.5).abs() < 0.001);
        assert!((result2[0].1 - 0.5).abs() < 0.001);
        assert!((result2[0].2 - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_reset() {
        let config = TemporalSmoothingConfig::special_mode();
        let smoother = TemporalSmoothing::new(config);

        // Process a frame
        let frame1 = vec![(1.0, 1.0, 1.0, 1.0); 100];
        let _result1 = smoother.process_frame(frame1);

        // Reset
        smoother.reset();

        // Next frame should be treated as first frame
        let frame2 = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let result2 = smoother.process_frame(frame2.clone());

        // Should pass through unchanged (no blending)
        assert_eq!(result2, frame2);
    }

    #[test]
    fn test_alpha_threshold() {
        let config = TemporalSmoothingConfig {
            blend_factor: 0.5,
            alpha_threshold: 0.5, // High threshold
        };
        let smoother = TemporalSmoothing::new(config);

        // First frame with low alpha
        let frame1 = vec![(1.0, 1.0, 1.0, 0.3); 100];
        let _result1 = smoother.process_frame(frame1);

        // Second frame with low alpha
        let frame2 = vec![(0.0, 0.0, 0.0, 0.3); 100];
        let result2 = smoother.process_frame(frame2.clone());

        // Should NOT blend (alpha below threshold)
        assert_eq!(result2, frame2);
    }
}

