//! Point-Based Renderer with Gaussian Splatting
//!
//! This module provides point-based rendering for museum-quality cosmic art.
//! Instead of drawing line segments, each trajectory position is rendered as
//! a soft Gaussian "splat" that accumulates naturally.

#![allow(clippy::unreadable_literal)]
#![allow(dead_code)] // Module provides extensive configuration options for future use
//!
//! # Philosophy
//!
//! - **Softness**: No hard edges, everything is diffuse and ethereal
//! - **Accumulation**: Overlapping splats create organic density
//! - **Physics-driven**: Size and brightness vary with velocity
//! - **Sparse beauty**: Less is more
//!
//! # Rendering Modes
//!
//! - **Filament**: Hair-thin trails with subtle glow
//! - **Deep Field**: Point-like stars clustered along trajectories
//! - **Hybrid**: Combination of both for rich detail

use rayon::prelude::*;
use super::cosmic_palette::CosmicPalette;

/// Configuration for point-based rendering
#[derive(Clone, Debug)]
pub struct PointRendererConfig {
    /// Base size of points in pixels (before velocity scaling)
    pub base_point_size: f64,
    
    /// How much velocity affects point size (0 = no effect, 1 = double at max velocity)
    pub velocity_size_factor: f64,
    
    /// Base brightness of points (0-1)
    pub base_brightness: f64,
    
    /// How much velocity affects brightness (0 = no effect, 1 = double at max velocity)
    pub velocity_brightness_factor: f64,
    
    /// Fade factor for older positions (0 = no fade, 1 = full fade by end)
    pub temporal_fade: f64,
    
    /// Gaussian sigma as fraction of point size
    pub gaussian_sigma_factor: f64,
    
    /// Threshold below which accent color is used (velocity percentile)
    pub accent_velocity_threshold: f64,
    
    /// Probability of rendering each point (for sparse sampling)
    pub sample_probability: f64,
    
    /// Maximum total coverage allowed (0-1, for automatic brightness scaling)
    pub max_coverage: f64,
}

impl Default for PointRendererConfig {
    fn default() -> Self {
        Self::museum_quality()
    }
}

impl PointRendererConfig {
    /// Configuration for museum-quality output
    pub fn museum_quality() -> Self {
        Self {
            base_point_size: 1.5,
            velocity_size_factor: 0.3,
            base_brightness: 0.4,
            velocity_brightness_factor: 0.6,
            temporal_fade: 0.5,
            gaussian_sigma_factor: 0.4,
            accent_velocity_threshold: 0.85,
            sample_probability: 0.2, // Only render 20% of points for sparsity
            max_coverage: 0.25, // Target maximum 25% coverage
        }
    }
    
    /// Configuration for dense filament rendering
    pub fn filament() -> Self {
        Self {
            base_point_size: 0.8,
            velocity_size_factor: 0.2,
            base_brightness: 0.3,
            velocity_brightness_factor: 0.4,
            temporal_fade: 0.3,
            gaussian_sigma_factor: 0.5,
            accent_velocity_threshold: 0.95,
            sample_probability: 0.5, // More points for continuous filaments
            max_coverage: 0.30,
        }
    }
    
    /// Configuration for sparse deep field rendering
    pub fn deep_field() -> Self {
        Self {
            base_point_size: 2.0,
            velocity_size_factor: 0.5,
            base_brightness: 0.5,
            velocity_brightness_factor: 0.5,
            temporal_fade: 0.6,
            gaussian_sigma_factor: 0.35,
            accent_velocity_threshold: 0.80,
            sample_probability: 0.1, // Very sparse
            max_coverage: 0.15, // Maximum 15% coverage for lots of void
        }
    }
}

/// A single point to be rendered
#[derive(Clone, Debug)]
pub struct RenderPoint {
    /// Position in pixel coordinates
    pub x: f64,
    pub y: f64,
    
    /// Normalized velocity (0-1 range, where 1 is max velocity in trajectory)
    pub velocity: f64,
    
    /// Normalized age (0 = start of trajectory, 1 = end)
    pub age: f64,
    
    /// Body index (0, 1, or 2)
    pub body_index: usize,
}

/// Accumulation buffer for point rendering
pub struct PointAccumulator {
    /// Width in pixels
    width: usize,
    /// Height in pixels
    height: usize,
    /// RGB accumulator (linear, additive)
    buffer: Vec<[f64; 3]>,
    /// Coverage accumulator (for automatic brightness scaling)
    coverage: Vec<f64>,
}

impl PointAccumulator {
    /// Create a new accumulator with given dimensions
    pub fn new(width: usize, height: usize) -> Self {
        let size = width * height;
        Self {
            width,
            height,
            buffer: vec![[0.0, 0.0, 0.0]; size],
            coverage: vec![0.0; size],
        }
    }
    
    /// Clear the accumulator
    pub fn clear(&mut self) {
        for pixel in &mut self.buffer {
            *pixel = [0.0, 0.0, 0.0];
        }
        for c in &mut self.coverage {
            *c = 0.0;
        }
    }
    
    /// Add a Gaussian splat at the given position
    /// 
    /// # Arguments
    /// * `x`, `y` - Center position in pixel coordinates
    /// * `color` - RGB color to add (0-1 range)
    /// * `brightness` - Overall brightness multiplier
    /// * `size` - Size in pixels (radius to 2-sigma)
    /// * `sigma_factor` - Gaussian sigma as fraction of size
    pub fn add_gaussian_splat(
        &mut self,
        x: f64,
        y: f64,
        color: &[f64; 3],
        brightness: f64,
        size: f64,
        sigma_factor: f64,
    ) {
        let sigma = size * sigma_factor;
        if sigma < 0.1 {
            return; // Too small to render
        }
        
        let sigma_sq = sigma * sigma;
        let two_sigma_sq = 2.0 * sigma_sq;
        
        // Render radius (3 sigma covers 99.7% of Gaussian)
        let radius = (sigma * 3.0).ceil() as i32;
        
        let cx = x as i32;
        let cy = y as i32;
        
        for dy in -radius..=radius {
            let py = cy + dy;
            if py < 0 || py >= self.height as i32 {
                continue;
            }
            
            for dx in -radius..=radius {
                let px = cx + dx;
                if px < 0 || px >= self.width as i32 {
                    continue;
                }
                
                // Distance from center
                let dist_sq = (dx as f64 - (x - cx as f64)).powi(2) 
                            + (dy as f64 - (y - cy as f64)).powi(2);
                
                // Gaussian falloff
                let weight = (-dist_sq / two_sigma_sq).exp();
                
                if weight < 0.001 {
                    continue; // Below visibility threshold
                }
                
                let idx = py as usize * self.width + px as usize;
                let contribution = brightness * weight;
                
                self.buffer[idx][0] += color[0] * contribution;
                self.buffer[idx][1] += color[1] * contribution;
                self.buffer[idx][2] += color[2] * contribution;
                self.coverage[idx] += contribution;
            }
        }
    }
    
    /// Add a single hard point (for star-like highlights)
    pub fn add_star_point(
        &mut self,
        x: f64,
        y: f64,
        color: &[f64; 3],
        brightness: f64,
    ) {
        let px = x as i32;
        let py = y as i32;
        
        if px < 0 || px >= self.width as i32 || py < 0 || py >= self.height as i32 {
            return;
        }
        
        let idx = py as usize * self.width + px as usize;
        self.buffer[idx][0] += color[0] * brightness;
        self.buffer[idx][1] += color[1] * brightness;
        self.buffer[idx][2] += color[2] * brightness;
        self.coverage[idx] += brightness;
    }
    
    /// Calculate current coverage percentage
    pub fn coverage_percentage(&self) -> f64 {
        let covered = self.coverage.iter().filter(|&&c| c > 0.01).count();
        covered as f64 / self.coverage.len() as f64
    }
    
    /// Get maximum coverage value (for brightness normalization)
    pub fn max_coverage(&self) -> f64 {
        self.coverage.iter().copied().fold(0.0, f64::max)
    }
    
    /// Convert to final RGBA buffer with soft clamping
    pub fn to_rgba(&self, palette: &CosmicPalette, gamma: f64) -> Vec<(f64, f64, f64, f64)> {
        let max_cov = self.max_coverage().max(0.1);
        
        self.buffer
            .par_iter()
            .enumerate()
            .map(|(idx, pixel)| {
                let y_norm = (idx / self.width) as f64 / self.height as f64;
                let bg = palette.background_at(1.0 - y_norm); // Invert so dark at top
                
                // Normalize brightness
                let scale = 1.0 / max_cov.sqrt(); // Square root for perceptual scaling
                
                let r = soft_highlight(pixel[0] * scale) + bg[0];
                let g = soft_highlight(pixel[1] * scale) + bg[1];
                let b = soft_highlight(pixel[2] * scale) + bg[2];
                
                // Apply gamma
                let r = apply_gamma(r.clamp(0.0, 1.0), gamma);
                let g = apply_gamma(g.clamp(0.0, 1.0), gamma);
                let b = apply_gamma(b.clamp(0.0, 1.0), gamma);
                
                (r, g, b, 1.0)
            })
            .collect()
    }
}

/// Soft highlight compression (prevents harsh clipping)
#[inline]
fn soft_highlight(x: f64) -> f64 {
    if x <= 0.5 {
        x
    } else {
        // Soft shoulder curve
        0.5 + 0.5 * (1.0 - (-(x - 0.5) * 2.0).exp())
    }
}

/// Apply gamma correction
#[inline]
fn apply_gamma(value: f64, gamma: f64) -> f64 {
    if value <= 0.0 {
        0.0
    } else {
        value.powf(1.0 / gamma)
    }
}

/// Render a set of points to an RGBA buffer
/// 
/// This is the main entry point for point-based rendering.
pub fn render_points(
    points: &[RenderPoint],
    width: usize,
    height: usize,
    palette: &CosmicPalette,
    config: &PointRendererConfig,
    seed: u64,
) -> Vec<(f64, f64, f64, f64)> {
    let mut accum = PointAccumulator::new(width, height);
    
    // Simple deterministic sampling based on seed
    let sample_threshold = (config.sample_probability * u64::MAX as f64) as u64;
    
    for (i, point) in points.iter().enumerate() {
        // Deterministic sampling
        let hash = simple_hash(seed, i as u64);
        if hash > sample_threshold {
            continue;
        }
        
        // Calculate point properties
        let age_fade = 1.0 - point.age * config.temporal_fade;
        
        let size = config.base_point_size 
            * (1.0 + point.velocity * config.velocity_size_factor)
            * age_fade.max(0.3); // Don't fade size too much
            
        let brightness = config.base_brightness 
            * (1.0 + point.velocity * config.velocity_brightness_factor)
            * age_fade;
        
        // Determine if this should be accent color
        let use_accent = point.velocity > config.accent_velocity_threshold;
        
        let color = if use_accent {
            palette.accent
        } else {
            palette.brightness_to_color(brightness, 0.7)
        };
        
        accum.add_gaussian_splat(
            point.x,
            point.y,
            &color,
            brightness,
            size,
            config.gaussian_sigma_factor,
        );
    }
    
    // If coverage is too high, we should have sampled less
    // This information could be used for adaptive rendering
    let _coverage = accum.coverage_percentage();
    
    accum.to_rgba(palette, 2.2)
}

/// Render sparse star points at trajectory crossings/peaks
pub fn render_star_highlights(
    points: &[RenderPoint],
    _width: usize,
    _height: usize,
    accum: &mut PointAccumulator,
    palette: &CosmicPalette,
    threshold: f64,
) {
    for point in points {
        if point.velocity > threshold {
            // Bright accent point
            let brightness = (point.velocity - threshold) / (1.0 - threshold);
            accum.add_star_point(
                point.x,
                point.y,
                &palette.accent,
                brightness * 0.8,
            );
            
            // Small glow around it
            accum.add_gaussian_splat(
                point.x,
                point.y,
                &palette.accent,
                brightness * 0.3,
                3.0,
                0.5,
            );
        }
    }
}

/// Simple hash function for deterministic sampling
#[inline]
fn simple_hash(seed: u64, index: u64) -> u64 {
    let mut x = seed.wrapping_add(index);
    x = x.wrapping_mul(0x517cc1b727220a95);
    x ^= x >> 32;
    x = x.wrapping_mul(0x517cc1b727220a95);
    x ^= x >> 32;
    x
}

/// Convert trajectory positions to render points
/// 
/// # Arguments
/// * `positions` - Trajectory positions [body][step] = (x, y) in world coordinates
/// * `velocities` - Velocity magnitudes [body][step]
/// * `width`, `height` - Output dimensions
/// * `bounds` - World coordinate bounds (min_x, max_x, min_y, max_y)
pub fn trajectory_to_points(
    positions: &[Vec<(f64, f64)>],
    velocities: &[Vec<f64>],
    width: usize,
    height: usize,
    bounds: (f64, f64, f64, f64),
) -> Vec<RenderPoint> {
    let (min_x, max_x, min_y, max_y) = bounds;
    let world_width = max_x - min_x;
    let world_height = max_y - min_y;
    
    // Find max velocity for normalization
    let max_velocity = velocities.iter()
        .flat_map(|v| v.iter())
        .copied()
        .fold(0.0, f64::max)
        .max(0.001);
    
    let mut points = Vec::new();
    
    for (body_idx, (body_positions, body_velocities)) in positions.iter().zip(velocities.iter()).enumerate() {
        let num_steps = body_positions.len();
        
        for (step, ((x, y), &vel)) in body_positions.iter().zip(body_velocities.iter()).enumerate() {
            // Convert world to pixel coordinates
            let px = (x - min_x) / world_width * width as f64;
            let py = (y - min_y) / world_height * height as f64;
            
            // Normalize velocity and age
            let velocity = vel / max_velocity;
            let age = step as f64 / num_steps.max(1) as f64;
            
            points.push(RenderPoint {
                x: px,
                y: py,
                velocity,
                age,
                body_index: body_idx,
            });
        }
    }
    
    points
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::cosmic_palette::ICE_AND_FIRE;

    #[test]
    fn test_point_renderer_config_defaults() {
        let config = PointRendererConfig::default();
        assert!(config.base_point_size > 0.0);
        assert!(config.sample_probability > 0.0 && config.sample_probability <= 1.0);
    }

    #[test]
    fn test_point_accumulator_creation() {
        let accum = PointAccumulator::new(100, 100);
        assert_eq!(accum.buffer.len(), 10000);
        assert_eq!(accum.coverage.len(), 10000);
    }

    #[test]
    fn test_point_accumulator_clear() {
        let mut accum = PointAccumulator::new(10, 10);
        accum.buffer[0] = [1.0, 1.0, 1.0];
        accum.coverage[0] = 1.0;
        
        accum.clear();
        
        assert_eq!(accum.buffer[0], [0.0, 0.0, 0.0]);
        assert_eq!(accum.coverage[0], 0.0);
    }

    #[test]
    fn test_gaussian_splat() {
        let mut accum = PointAccumulator::new(100, 100);
        
        accum.add_gaussian_splat(
            50.0, 50.0,
            &[1.0, 1.0, 1.0],
            1.0,
            5.0,
            0.4,
        );
        
        // Center should have highest value
        let center_idx = 50 * 100 + 50;
        assert!(accum.buffer[center_idx][0] > 0.0, "Center should have value");
        
        // Nearby should have some value
        let nearby_idx = 51 * 100 + 51;
        assert!(accum.buffer[nearby_idx][0] > 0.0, "Nearby should have value");
        assert!(accum.buffer[nearby_idx][0] < accum.buffer[center_idx][0], 
            "Nearby should be less than center");
        
        // Far away should have no value
        let far_idx = 0;
        assert!(accum.buffer[far_idx][0] < 0.001, "Far away should have no value");
    }

    #[test]
    fn test_star_point() {
        let mut accum = PointAccumulator::new(100, 100);
        
        accum.add_star_point(
            50.0, 50.0,
            &[1.0, 1.0, 1.0],
            1.0,
        );
        
        let center_idx = 50 * 100 + 50;
        assert!(accum.buffer[center_idx][0] > 0.0);
    }

    #[test]
    fn test_coverage_percentage() {
        let mut accum = PointAccumulator::new(100, 100);
        
        // Initially empty
        assert_eq!(accum.coverage_percentage(), 0.0);
        
        // Add a splat
        accum.add_gaussian_splat(50.0, 50.0, &[1.0, 1.0, 1.0], 1.0, 5.0, 0.4);
        
        let coverage = accum.coverage_percentage();
        assert!(coverage > 0.0 && coverage < 1.0);
    }

    #[test]
    fn test_to_rgba() {
        let mut accum = PointAccumulator::new(10, 10);
        accum.add_gaussian_splat(5.0, 5.0, &[1.0, 1.0, 1.0], 1.0, 2.0, 0.4);
        
        let rgba = accum.to_rgba(&ICE_AND_FIRE, 2.2);
        
        assert_eq!(rgba.len(), 100);
        
        // Check all values are valid
        for (r, g, b, a) in &rgba {
            assert!(*r >= 0.0 && *r <= 1.0, "R out of range: {}", r);
            assert!(*g >= 0.0 && *g <= 1.0, "G out of range: {}", g);
            assert!(*b >= 0.0 && *b <= 1.0, "B out of range: {}", b);
            assert_eq!(*a, 1.0);
        }
    }

    #[test]
    fn test_render_points_empty() {
        let points: Vec<RenderPoint> = vec![];
        let result = render_points(&points, 100, 100, &ICE_AND_FIRE, &PointRendererConfig::default(), 12345);
        
        assert_eq!(result.len(), 10000);
        
        // With no points, should just have subtle background colors (from palette void colors)
        // ICE_AND_FIRE has void_deep of [0.008, 0.012, 0.024] and void_horizon of [0.020, 0.035, 0.055]
        // After gamma correction, these become brighter
        for (r, g, b, _) in &result {
            // Should be relatively dim (background gradient colors)
            assert!(*r < 0.3 && *g < 0.3 && *b < 0.3, 
                "Background should be dim, got r={}, g={}, b={}", r, g, b);
        }
    }

    #[test]
    fn test_render_points_single() {
        let points = vec![
            RenderPoint {
                x: 50.0,
                y: 50.0,
                velocity: 0.5,
                age: 0.0,
                body_index: 0,
            },
        ];
        
        let config = PointRendererConfig {
            sample_probability: 1.0, // Ensure point is rendered
            ..PointRendererConfig::default()
        };
        
        let result = render_points(&points, 100, 100, &ICE_AND_FIRE, &config, 12345);
        
        // Center should be brighter than corner
        let center = result[50 * 100 + 50];
        let corner = result[0];
        
        let center_lum = center.0 * 0.2126 + center.1 * 0.7152 + center.2 * 0.0722;
        let corner_lum = corner.0 * 0.2126 + corner.1 * 0.7152 + corner.2 * 0.0722;
        
        assert!(center_lum > corner_lum, "Center should be brighter than corner");
    }

    #[test]
    fn test_trajectory_to_points() {
        let positions = vec![
            vec![(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)],
            vec![(1.0, 0.0), (1.0, 1.0), (1.0, 2.0)],
        ];
        let velocities = vec![
            vec![1.0, 2.0, 1.5],
            vec![0.5, 1.0, 0.5],
        ];
        
        let points = trajectory_to_points(
            &positions,
            &velocities,
            100, 100,
            (0.0, 2.0, 0.0, 2.0),
        );
        
        assert_eq!(points.len(), 6);
        
        // Check first point of first body
        assert_eq!(points[0].body_index, 0);
        assert!((points[0].x - 0.0).abs() < 0.1);
        assert!((points[0].y - 0.0).abs() < 0.1);
        assert_eq!(points[0].age, 0.0);
        
        // Check velocity is normalized
        assert!(points[0].velocity <= 1.0);
        assert!(points[1].velocity <= 1.0);
    }

    #[test]
    fn test_soft_highlight() {
        // Values below 0.5 should pass through
        assert!((soft_highlight(0.3) - 0.3).abs() < 0.001);
        
        // Values above 0.5 should be compressed
        let high = soft_highlight(2.0);
        assert!(high < 2.0, "Should compress high values");
        assert!(high < 1.0, "Should stay below 1.0");
        assert!(high > 0.5, "Should be above 0.5");
    }

    #[test]
    fn test_simple_hash_deterministic() {
        let h1 = simple_hash(12345, 100);
        let h2 = simple_hash(12345, 100);
        assert_eq!(h1, h2, "Same inputs should give same hash");
        
        let h3 = simple_hash(12345, 101);
        assert_ne!(h1, h3, "Different inputs should give different hash");
    }

    #[test]
    fn test_render_star_highlights() {
        let points = vec![
            RenderPoint { x: 50.0, y: 50.0, velocity: 0.9, age: 0.0, body_index: 0 },
            RenderPoint { x: 30.0, y: 30.0, velocity: 0.3, age: 0.0, body_index: 0 },
        ];
        
        let mut accum = PointAccumulator::new(100, 100);
        render_star_highlights(&points, 100, 100, &mut accum, &ICE_AND_FIRE, 0.85);
        
        // High velocity point should have contribution
        let high_idx = 50 * 100 + 50;
        assert!(accum.buffer[high_idx][0] > 0.0 || accum.buffer[high_idx][1] > 0.0 || accum.buffer[high_idx][2] > 0.0);
        
        // Low velocity point should have no contribution
        let low_idx = 30 * 100 + 30;
        assert!(accum.buffer[low_idx][0] < 0.01 && accum.buffer[low_idx][1] < 0.01 && accum.buffer[low_idx][2] < 0.01);
    }
}

