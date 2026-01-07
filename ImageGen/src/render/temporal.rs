//! Temporal Refinements for Museum-Quality Video
//!
//! This module provides frame blending and temporal anti-aliasing for
//! smoother video output, especially during fast-moving trajectory sections.
//!
//! # Techniques
//!
//! - **Temporal Accumulation**: Blend multiple sub-frames for motion blur
//! - **Frame Blending**: Smooth transitions between frames
//! - **Velocity-Adaptive Sampling**: More samples for fast motion areas
//!
//! # Museum Quality Philosophy
//!
//! Smooth, cinematic motion is essential for exhibition-quality video.
//! Stuttery or jittery motion breaks the immersive viewing experience.

// Module is prepared for future integration - suppress dead_code warnings
#![allow(dead_code)]

use rayon::prelude::*;

/// Configuration for temporal refinements
#[derive(Clone, Debug)]
pub struct TemporalConfig {
    /// Enable frame blending for smoother motion
    pub enable_blending: bool,
    
    /// Blend factor for previous frame (0.0 = no blend, 1.0 = full ghosting)
    /// MUSEUM QUALITY: 0.15-0.25 provides subtle smoothing without ghosting
    pub blend_factor: f64,
    
    /// Enable velocity-adaptive opacity for motion blur effect
    pub velocity_adaptive_alpha: bool,
    
    /// Strength of velocity-based alpha reduction (0.0 = none, 1.0 = strong)
    pub velocity_alpha_strength: f64,
}

impl Default for TemporalConfig {
    fn default() -> Self {
        Self::museum_quality()
    }
}

impl TemporalConfig {
    /// Create museum-quality temporal configuration
    pub fn museum_quality() -> Self {
        Self {
            enable_blending: true,
            blend_factor: 0.18,
            velocity_adaptive_alpha: true,
            velocity_alpha_strength: 0.35,
        }
    }
    
    /// Create configuration for still image output (no temporal effects)
    #[allow(dead_code)]
    pub fn still_image() -> Self {
        Self {
            enable_blending: false,
            blend_factor: 0.0,
            velocity_adaptive_alpha: false,
            velocity_alpha_strength: 0.0,
        }
    }
    
    /// Create configuration for high-motion videos (more blur)
    #[allow(dead_code)]
    pub fn high_motion() -> Self {
        Self {
            enable_blending: true,
            blend_factor: 0.25,
            velocity_adaptive_alpha: true,
            velocity_alpha_strength: 0.50,
        }
    }
}

/// Frame blending state for temporal accumulation
pub struct FrameBlender {
    /// Previous frame buffer (for blending)
    previous_frame: Option<Vec<(f64, f64, f64, f64)>>,
    
    /// Configuration
    config: TemporalConfig,
}

impl FrameBlender {
    /// Create a new frame blender with the given configuration
    pub fn new(config: TemporalConfig) -> Self {
        Self {
            previous_frame: None,
            config,
        }
    }
    
    /// Blend the current frame with the previous frame
    ///
    /// Returns a new buffer with the blended result, storing the current
    /// frame for the next blend operation.
    pub fn blend_frame(
        &mut self,
        current: Vec<(f64, f64, f64, f64)>,
    ) -> Vec<(f64, f64, f64, f64)> {
        if !self.config.enable_blending || self.config.blend_factor <= 0.0 {
            // No blending, just store and return
            self.previous_frame = Some(current.clone());
            return current;
        }
        
        let result = match &self.previous_frame {
            Some(prev) if prev.len() == current.len() => {
                // Blend previous with current
                let blend = self.config.blend_factor;
                let keep = 1.0 - blend;
                
                current
                    .par_iter()
                    .zip(prev.par_iter())
                    .map(|((cr, cg, cb, ca), (pr, pg, pb, pa))| {
                        (
                            cr * keep + pr * blend,
                            cg * keep + pg * blend,
                            cb * keep + pb * blend,
                            ca * keep + pa * blend,
                        )
                    })
                    .collect()
            }
            _ => {
                // No previous frame or size mismatch, use current as-is
                current.clone()
            }
        };
        
        // Store current for next frame
        self.previous_frame = Some(current);
        
        result
    }
    
    /// Reset the blender state (e.g., for a new video)
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.previous_frame = None;
    }
}

/// Compute velocity-based alpha modifier for a line segment
///
/// Faster segments get slightly more transparent to simulate motion blur.
/// This creates a more elegant, refined look for high-velocity trajectories.
///
/// # Arguments
///
/// * `velocity` - Current velocity magnitude
/// * `max_velocity` - Maximum expected velocity (for normalization)
/// * `strength` - How much to reduce alpha for fast motion (0.0-1.0)
///
/// # Returns
///
/// Alpha multiplier in range [1.0 - strength, 1.0]
#[inline]
pub fn velocity_alpha_modifier(velocity: f64, max_velocity: f64, strength: f64) -> f64 {
    if max_velocity <= 0.0 || strength <= 0.0 {
        return 1.0;
    }
    
    // Normalize velocity to 0-1 range
    let normalized = (velocity / max_velocity).clamp(0.0, 1.0);
    
    // Apply easing for more natural falloff
    let eased = normalized * normalized; // Quadratic easing
    
    // Compute alpha reduction (faster = more transparent)
    1.0 - (eased * strength)
}

/// Compute line thickness modifier based on velocity
///
/// Faster segments can be slightly thinner for a more delicate appearance.
/// This helps prevent fast-moving parts from becoming dominant.
///
/// # Arguments
///
/// * `velocity` - Current velocity magnitude
/// * `max_velocity` - Maximum expected velocity
/// * `min_thickness` - Minimum thickness ratio (0.0-1.0)
///
/// # Returns
///
/// Thickness multiplier in range [min_thickness, 1.0]
#[inline]
pub fn velocity_thickness_modifier(velocity: f64, max_velocity: f64, min_thickness: f64) -> f64 {
    if max_velocity <= 0.0 {
        return 1.0;
    }
    
    let normalized = (velocity / max_velocity).clamp(0.0, 1.0);
    
    // Faster = thinner
    1.0 - (normalized * (1.0 - min_thickness))
}

/// Apply temporal anti-aliasing to a frame sequence
///
/// This function takes multiple sub-frames and combines them to produce
/// a single anti-aliased frame with motion blur.
///
/// # Arguments
///
/// * `subframes` - Vector of sub-frame buffers to combine
///
/// # Returns
///
/// Combined frame with temporal anti-aliasing
pub fn combine_subframes(subframes: &[Vec<(f64, f64, f64, f64)>]) -> Vec<(f64, f64, f64, f64)> {
    if subframes.is_empty() {
        return Vec::new();
    }
    
    if subframes.len() == 1 {
        return subframes[0].clone();
    }
    
    let pixel_count = subframes[0].len();
    let weight = 1.0 / subframes.len() as f64;
    
    (0..pixel_count)
        .into_par_iter()
        .map(|i| {
            let mut r = 0.0;
            let mut g = 0.0;
            let mut b = 0.0;
            let mut a = 0.0;
            
            for subframe in subframes {
                if i < subframe.len() {
                    r += subframe[i].0 * weight;
                    g += subframe[i].1 * weight;
                    b += subframe[i].2 * weight;
                    a += subframe[i].3 * weight;
                }
            }
            
            (r, g, b, a)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_temporal_config_defaults() {
        let config = TemporalConfig::default();
        assert!(config.enable_blending, "Blending should be enabled by default");
        assert!(config.blend_factor > 0.0, "Blend factor should be positive");
        assert!(config.blend_factor < 0.5, "Blend factor should not be too high (causes ghosting)");
    }

    #[test]
    fn test_frame_blender_first_frame() {
        let config = TemporalConfig::museum_quality();
        let mut blender = FrameBlender::new(config);
        
        let frame = vec![(1.0, 0.5, 0.25, 1.0); 100];
        let result = blender.blend_frame(frame.clone());
        
        // First frame should be unmodified
        assert_eq!(result.len(), 100);
        assert_eq!(result[0], (1.0, 0.5, 0.25, 1.0));
    }

    #[test]
    fn test_frame_blender_blends_frames() {
        let config = TemporalConfig {
            enable_blending: true,
            blend_factor: 0.5,  // 50% blend for easy testing
            ..Default::default()
        };
        let mut blender = FrameBlender::new(config);
        
        // First frame: all white
        let frame1 = vec![(1.0, 1.0, 1.0, 1.0); 10];
        let _ = blender.blend_frame(frame1);
        
        // Second frame: all black
        let frame2 = vec![(0.0, 0.0, 0.0, 1.0); 10];
        let result = blender.blend_frame(frame2);
        
        // Should be 50% gray
        assert!((result[0].0 - 0.5).abs() < 0.01, "R should be ~0.5, got {}", result[0].0);
        assert!((result[0].1 - 0.5).abs() < 0.01, "G should be ~0.5, got {}", result[0].1);
        assert!((result[0].2 - 0.5).abs() < 0.01, "B should be ~0.5, got {}", result[0].2);
    }

    #[test]
    fn test_frame_blender_disabled() {
        let config = TemporalConfig {
            enable_blending: false,
            ..Default::default()
        };
        let mut blender = FrameBlender::new(config);
        
        let frame1 = vec![(1.0, 1.0, 1.0, 1.0); 10];
        let _ = blender.blend_frame(frame1);
        
        let frame2 = vec![(0.0, 0.0, 0.0, 1.0); 10];
        let result = blender.blend_frame(frame2);
        
        // Should be pure black (no blending)
        assert_eq!(result[0].0, 0.0, "Should be black without blending");
    }

    #[test]
    fn test_velocity_alpha_modifier() {
        // Zero velocity = full alpha
        let alpha = velocity_alpha_modifier(0.0, 100.0, 0.5);
        assert!((alpha - 1.0).abs() < 0.01, "Zero velocity should give full alpha");
        
        // Max velocity = reduced alpha
        let alpha = velocity_alpha_modifier(100.0, 100.0, 0.5);
        assert!((alpha - 0.5).abs() < 0.01, "Max velocity should reduce alpha by strength");
        
        // Half velocity = partially reduced (quadratic, so 0.25 reduction)
        let alpha = velocity_alpha_modifier(50.0, 100.0, 0.5);
        assert!(alpha > 0.8 && alpha < 0.95, "Half velocity should give partial reduction: {}", alpha);
    }

    #[test]
    fn test_velocity_thickness_modifier() {
        let thickness = velocity_thickness_modifier(0.0, 100.0, 0.5);
        assert!((thickness - 1.0).abs() < 0.01, "Zero velocity should give full thickness");
        
        let thickness = velocity_thickness_modifier(100.0, 100.0, 0.5);
        assert!((thickness - 0.5).abs() < 0.01, "Max velocity should give min thickness");
    }

    #[test]
    fn test_combine_subframes_single() {
        let subframes = vec![vec![(0.5, 0.5, 0.5, 1.0); 10]];
        let result = combine_subframes(&subframes);
        assert_eq!(result[0], (0.5, 0.5, 0.5, 1.0));
    }

    #[test]
    fn test_combine_subframes_multiple() {
        let subframes = vec![
            vec![(1.0, 0.0, 0.0, 1.0); 10],  // Red
            vec![(0.0, 1.0, 0.0, 1.0); 10],  // Green
            vec![(0.0, 0.0, 1.0, 1.0); 10],  // Blue
        ];
        let result = combine_subframes(&subframes);
        
        // Should be averaged
        let expected = 1.0 / 3.0;
        assert!((result[0].0 - expected).abs() < 0.01, "R should be ~0.33");
        assert!((result[0].1 - expected).abs() < 0.01, "G should be ~0.33");
        assert!((result[0].2 - expected).abs() < 0.01, "B should be ~0.33");
    }

    #[test]
    fn test_combine_subframes_empty() {
        let subframes: Vec<Vec<(f64, f64, f64, f64)>> = vec![];
        let result = combine_subframes(&subframes);
        assert!(result.is_empty(), "Empty input should give empty output");
    }
}

