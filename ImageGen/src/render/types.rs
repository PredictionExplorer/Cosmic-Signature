//! Common types and parameter groupings for the rendering pipeline
//!
//! This module provides strongly-typed parameter structures to reduce function
//! signature complexity and improve code maintainability.
//!
//! These types form the public API for rendering configuration and are designed
//! to be used by library consumers and the main application.
//!
//! Note: Some types are exported for library API completeness even if not used
//! internally. This is intentional professional API design.

#![allow(dead_code)] // Public API types for library consumers

use super::color::OklabColor;
use super::effects::DogBloomConfig;
use crate::post_effects::PerceptualBlurConfig;
use nalgebra::Vector3;

/// Image resolution dimensions
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

impl Resolution {
    /// Create a new resolution
    pub fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }
    
    /// Get pixel count
    #[inline]
    pub fn pixel_count(&self) -> usize {
        (self.width as usize) * (self.height as usize)
    }
    
    /// Get minimum dimension
    #[inline]
    pub fn min_dimension(&self) -> u32 {
        self.width.min(self.height)
    }
    
    /// Get aspect ratio (width / height)
    #[inline]
    pub fn aspect_ratio(&self) -> f64 {
        self.width as f64 / self.height as f64
    }
}

/// Blur configuration parameters
///
/// Part of the public rendering API for configuring blur effects.
#[derive(Clone, Copy, Debug)]
pub struct BlurConfig {
    pub radius_px: usize,
    pub strength: f64,
    pub core_brightness: f64,
}

impl BlurConfig {
    /// Create blur config optimized for standard mode
    pub fn standard(resolution: Resolution) -> Self {
        Self {
            radius_px: (0.014 * resolution.min_dimension() as f64).round() as usize,
            strength: 7.0,
            core_brightness: 7.0,
        }
    }
    
    /// Create blur config optimized for special mode
    pub fn special(resolution: Resolution) -> Self {
        Self {
            radius_px: (0.032 * resolution.min_dimension() as f64).round() as usize,
            strength: 12.0,
            core_brightness: 12.0,
        }
    }
}

/// Bloom effect configuration
///
/// Part of the public rendering API for configuring bloom effects.
#[derive(Clone, Debug)]
pub struct BloomConfig {
    pub mode: String,
    pub dog_config: DogBloomConfig,
}

impl BloomConfig {
    /// Create DoG bloom configuration with resolution-aware sigma
    ///
    /// Public API for library consumers.
    pub fn dog(resolution: Resolution, strength: f64, ratio: f64, sigma: Option<f64>) -> Self {
        let dog_sigma = sigma.unwrap_or_else(|| {
            // Default: 0.0065 of min dimension = 7px @ 1080p, 14px @ 4K
            0.0065 * resolution.min_dimension() as f64
        });
        
        Self {
            mode: "dog".to_string(),
            dog_config: DogBloomConfig {
                inner_sigma: dog_sigma,
                outer_ratio: ratio,
                strength,
                threshold: 0.01,
            },
        }
    }
    
    /// Create Gaussian bloom configuration
    ///
    /// Public API for library consumers.
    pub fn gaussian() -> Self {
        Self {
            mode: "gaussian".to_string(),
            dog_config: DogBloomConfig {
                inner_sigma: 7.0,
                outer_ratio: 2.8,
                strength: 0.32,
                threshold: 0.01,
            },
        }
    }
}

/// HDR configuration
///
/// Part of the public rendering API.
#[derive(Clone, Debug)]
pub struct HdrConfig {
    pub mode: String,
    pub scale: f64,
}

impl HdrConfig {
    /// Create HDR config from mode string and scale
    ///
    /// Public API for library consumers.
    pub fn new(mode: impl Into<String>, scale: f64) -> Self {
        let mode_str = mode.into();
        Self {
            mode: mode_str.clone(),
            scale: if mode_str == "auto" { scale } else { 1.0 },
        }
    }
}

/// Perceptual blur configuration wrapper
///
/// Part of the public rendering API.
#[derive(Clone, Debug)]
pub struct PerceptualBlurSettings {
    pub enabled: bool,
    pub config: Option<PerceptualBlurConfig>,
}

impl PerceptualBlurSettings {
    /// Create settings from CLI arguments
    ///
    /// Public API for library consumers.
    pub fn from_args(
        enabled: bool,
        config: Option<PerceptualBlurConfig>,
    ) -> Self {
        Self { enabled, config }
    }
}

/// Complete scene data for rendering
///
/// Part of the public rendering API.
#[derive(Clone)]
pub struct SceneData {
    pub positions: Vec<Vec<Vector3<f64>>>,
    pub colors: Vec<Vec<OklabColor>>,
    pub body_alphas: Vec<f64>,
}

impl SceneData {
    /// Create a new scene data structure
    ///
    /// Public API for library consumers.
    pub fn new(
        positions: Vec<Vec<Vector3<f64>>>,
        colors: Vec<Vec<OklabColor>>,
        body_alphas: Vec<f64>,
    ) -> Self {
        Self { positions, colors, body_alphas }
    }
    
    /// Get number of bodies
    ///
    /// Part of the public API for scene inspection.
    pub fn num_bodies(&self) -> usize {
        self.positions.len()
    }
    
    /// Get number of timesteps
    ///
    /// Part of the public API for scene inspection.
    pub fn num_steps(&self) -> usize {
        if self.positions.is_empty() {
            0
        } else {
            self.positions[0].len()
        }
    }
}

/// Channel levels for tonemapping
#[derive(Clone, Copy, Debug)]
pub struct ChannelLevels {
    pub black: [f64; 3],
    pub range: [f64; 3],
}

impl ChannelLevels {
    /// Create channel levels from black/white points
    #[inline]
    pub fn new(
        black_r: f64,
        white_r: f64,
        black_g: f64,
        white_g: f64,
        black_b: f64,
        white_b: f64,
    ) -> Self {
        Self {
            black: [black_r, black_g, black_b],
            range: [
                (white_r - black_r).max(1e-14),
                (white_g - black_g).max(1e-14),
                (white_b - black_b).max(1e-14),
            ],
        }
    }
    
    /// Get black point for channel (0=R, 1=G, 2=B)
    ///
    /// Part of the public API for color level inspection.
    #[inline]
    pub fn black_point(&self, channel: usize) -> f64 {
        self.black[channel]
    }
    
    /// Get range for channel (0=R, 1=G, 2=B)
    ///
    /// Part of the public API for color level inspection.
    #[inline]
    pub fn range(&self, channel: usize) -> f64 {
        self.range[channel]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolution_basic() {
        let res = Resolution::new(1920, 1080);
        assert_eq!(res.width, 1920);
        assert_eq!(res.height, 1080);
        assert_eq!(res.pixel_count(), 1920 * 1080);
        assert_eq!(res.min_dimension(), 1080);
    }

    #[test]
    fn test_resolution_aspect_ratio() {
        let res = Resolution::new(1920, 1080);
        assert!((res.aspect_ratio() - 16.0/9.0).abs() < 0.01);
    }

    #[test]
    fn test_blur_config_standard() {
        let res = Resolution::new(1920, 1080);
        let blur = BlurConfig::standard(res);
        
        assert_eq!(blur.radius_px, (0.014_f64 * 1080.0).round() as usize);
        assert_eq!(blur.strength, 7.0);
    }

    #[test]
    fn test_blur_config_special() {
        let res = Resolution::new(1920, 1080);
        let blur = BlurConfig::special(res);
        
        assert_eq!(blur.radius_px, (0.032_f64 * 1080.0).round() as usize);
        assert_eq!(blur.strength, 12.0);
    }

    #[test]
    fn test_hdr_config_auto() {
        let hdr = HdrConfig::new("auto", 0.12);
        assert_eq!(hdr.scale, 0.12);
    }

    #[test]
    fn test_hdr_config_off() {
        let hdr = HdrConfig::new("off", 0.12);
        assert_eq!(hdr.scale, 1.0);
    }

    #[test]
    fn test_scene_data_dimensions() {
        use nalgebra::Vector3;
        
        let positions = vec![
            vec![Vector3::zeros(); 100],
            vec![Vector3::zeros(); 100],
            vec![Vector3::zeros(); 100],
        ];
        let colors = vec![vec![(0.5, 0.0, 0.0); 100]; 3];
        let alphas = vec![0.5, 0.5, 0.5];
        
        let scene = SceneData::new(positions, colors, alphas);
        assert_eq!(scene.num_bodies(), 3);
        assert_eq!(scene.num_steps(), 100);
    }

    #[test]
    fn test_channel_levels() {
        let levels = ChannelLevels::new(0.0, 1.0, 0.1, 0.9, 0.2, 0.8);
        
        assert_eq!(levels.black_point(0), 0.0);
        assert_eq!(levels.black_point(1), 0.1);
        assert_eq!(levels.black_point(2), 0.2);
        
        assert!((levels.range(0) - 1.0).abs() < 1e-10);
        assert!((levels.range(1) - 0.8).abs() < 1e-10);
        assert!((levels.range(2) - 0.6).abs() < 1e-10);
    }
}

