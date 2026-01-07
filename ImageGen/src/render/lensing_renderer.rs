//! Gravitational Lensing Renderer
//!
//! This module provides the complete rendering pipeline for the Gravitational Lensing
//! visualization mode. It combines:
//!
//! - **Static background**: Starfield, nebula, or deep field imagery
//! - **Gravitational lensing**: Spacetime distortion along orbital paths
//! - **Trajectory visualization**: Optional luminous trails showing body paths
//! - **Einstein rings**: Circular distortions at close approaches
//!
//! # Design Philosophy
//!
//! This mode treats the trajectories not as objects to be drawn, but as masses
//! that curve spacetime itself. The beauty comes from seeing how the background
//! universe is warped and distorted by these invisible gravitational influences.
//!
//! # Styles
//!
//! - **Gravitational Wakes**: Default. Trajectories visible as luminous paths that
//!   clearly distort space around them. Dramatic and visually striking.
//!
//! - **Invisible Paths**: Most subtle. Trajectories are nearly invisible; only the
//!   distortion of the background reveals where they passed.

#![allow(dead_code)]
#![allow(clippy::unreadable_literal)]

use nalgebra::Vector3;
use rayon::prelude::*;

use super::gravitational_lensing::{
    LensingConfig, LensingField, LensingSource,
    trajectory_to_lensing_sources, generate_grid_overlay,
};
use super::lensing_background::{
    LensingBackgroundConfig, generate_background,
};
use super::cosmic_palette::{CosmicPalette, EVENT_HORIZON};
use super::film_grain::{FilmGrainConfig, apply_film_grain, apply_vignette};

/// Configuration for the complete lensing renderer
#[derive(Clone, Debug)]
pub struct LensingRendererConfig {
    /// Lensing physics configuration
    pub lensing: LensingConfig,
    
    /// Background generation configuration
    pub background: LensingBackgroundConfig,
    
    /// Film grain configuration
    pub grain: FilmGrainConfig,
    
    /// Whether to render visible trajectory trails
    pub show_trajectories: bool,
    
    /// Trajectory trail brightness (if shown)
    pub trajectory_brightness: f64,
    
    /// Trajectory trail width in pixels
    pub trajectory_width: f64,
    
    /// Whether trajectories fade with age
    pub trajectory_fade: bool,
    
    /// Vignette strength (0 = none, 1 = strong)
    pub vignette_strength: f64,
    
    /// Vignette radius (where falloff starts)
    pub vignette_radius: f64,
    
    /// Subsample rate for lensing sources (higher = faster, less accurate)
    pub source_subsample: usize,
    
    /// Gamma correction value
    pub gamma: f64,
    
    /// Whether to add subtle glow to high-distortion areas
    pub distortion_glow: bool,
    
    /// Distortion glow intensity
    pub distortion_glow_intensity: f64,
}

impl Default for LensingRendererConfig {
    fn default() -> Self {
        Self::gravitational_wakes()
    }
}

impl LensingRendererConfig {
    /// "Gravitational Wakes" style - dramatic, trajectories visible
    pub fn gravitational_wakes() -> Self {
        Self {
            lensing: LensingConfig::gravitational_wakes(),
            background: LensingBackgroundConfig::deep_field(),
            grain: FilmGrainConfig::museum_quality(),
            show_trajectories: true,
            trajectory_brightness: 0.6,
            trajectory_width: 1.5,
            trajectory_fade: true,
            vignette_strength: 0.2,
            vignette_radius: 0.6,
            source_subsample: 3,
            gamma: 2.2,
            distortion_glow: true,
            distortion_glow_intensity: 0.15,
        }
    }
    
    /// "Invisible Paths" style - subtle, only distortion visible
    pub fn invisible_paths() -> Self {
        Self {
            lensing: LensingConfig::invisible_paths(),
            background: LensingBackgroundConfig::starfield(),
            grain: FilmGrainConfig::museum_quality(),
            show_trajectories: false,
            trajectory_brightness: 0.0,
            trajectory_width: 0.0,
            trajectory_fade: false,
            vignette_strength: 0.15,
            vignette_radius: 0.65,
            source_subsample: 5,
            gamma: 2.2,
            distortion_glow: false,
            distortion_glow_intensity: 0.0,
        }
    }
    
    /// Extreme lensing for maximum drama
    pub fn extreme() -> Self {
        Self {
            lensing: LensingConfig::extreme(),
            background: LensingBackgroundConfig::nebula(),
            grain: FilmGrainConfig::museum_quality(),
            show_trajectories: true,
            trajectory_brightness: 0.8,
            trajectory_width: 2.0,
            trajectory_fade: true,
            vignette_strength: 0.25,
            vignette_radius: 0.55,
            source_subsample: 2,
            gamma: 2.2,
            distortion_glow: true,
            distortion_glow_intensity: 0.25,
        }
    }
    
    /// With grid overlay for educational/debug purposes
    #[must_use]
    pub fn with_grid(mut self) -> Self {
        self.lensing = self.lensing.with_grid();
        self
    }
    
    /// Set lensing strength
    #[must_use]
    pub fn with_lensing_strength(mut self, strength: f64) -> Self {
        self.lensing.strength = strength;
        self
    }
}

/// Result of lensing rendering
#[derive(Debug)]
pub struct LensingRenderResult {
    /// RGBA buffer with values 0-1
    pub buffer: Vec<(f64, f64, f64, f64)>,
    
    /// Width in pixels
    pub width: usize,
    
    /// Height in pixels
    pub height: usize,
    
    /// Palette used
    pub palette_name: String,
    
    /// Maximum distortion magnitude observed
    pub max_distortion: f64,
    
    /// Average distortion magnitude
    pub avg_distortion: f64,
}

impl LensingRenderResult {
    /// Convert buffer to 8-bit RGBA bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        self.buffer
            .iter()
            .flat_map(|(r, g, b, a)| {
                [
                    (r.clamp(0.0, 1.0) * 255.0) as u8,
                    (g.clamp(0.0, 1.0) * 255.0) as u8,
                    (b.clamp(0.0, 1.0) * 255.0) as u8,
                    (a.clamp(0.0, 1.0) * 255.0) as u8,
                ]
            })
            .collect()
    }
    
    /// Convert buffer to 16-bit RGBA values
    pub fn to_u16(&self) -> Vec<u16> {
        self.buffer
            .iter()
            .flat_map(|(r, g, b, a)| {
                [
                    (r.clamp(0.0, 1.0) * 65535.0) as u16,
                    (g.clamp(0.0, 1.0) * 65535.0) as u16,
                    (b.clamp(0.0, 1.0) * 65535.0) as u16,
                    (a.clamp(0.0, 1.0) * 65535.0) as u16,
                ]
            })
            .collect()
    }
}

/// Main lensing renderer
pub struct LensingRenderer {
    config: LensingRendererConfig,
}

impl LensingRenderer {
    /// Create a new lensing renderer with the given configuration
    pub fn new(config: LensingRendererConfig) -> Self {
        Self { config }
    }
    
    /// Render trajectories with gravitational lensing effect
    ///
    /// # Arguments
    /// * `positions` - Trajectory positions [body][step] = Vector3
    /// * `velocities` - Optional velocity magnitudes [body][step]
    /// * `width`, `height` - Output dimensions
    /// * `seed` - Random seed for deterministic rendering
    /// * `palette` - Optional custom palette (defaults to EVENT_HORIZON)
    pub fn render(
        &self,
        positions: &[Vec<Vector3<f64>>],
        velocities: Option<&[Vec<f64>]>,
        width: usize,
        height: usize,
        seed: u64,
        palette: Option<&CosmicPalette>,
    ) -> LensingRenderResult {
        let palette = palette.unwrap_or(&EVENT_HORIZON);
        
        // Step 1: Generate static background
        let background = generate_background(
            width, height, palette, &self.config.background, seed
        );
        
        // Step 2: Convert trajectories to lensing sources
        let sources = trajectory_to_lensing_sources(
            positions,
            velocities,
            width,
            height,
            self.config.source_subsample,
        );
        
        // Step 3: Build lensing field
        let lensing_field = LensingField::from_sources(
            &sources,
            width,
            height,
            &self.config.lensing,
        );
        
        // Compute distortion statistics
        let (max_distortion, avg_distortion) = compute_distortion_stats(&lensing_field);
        
        // Step 4: Apply lensing distortion to background
        let mut buffer = lensing_field.apply_distortion(&background, &self.config.lensing);
        
        // Step 5: Optionally add grid overlay
        if self.config.lensing.show_grid {
            let grid = generate_grid_overlay(
                &lensing_field,
                self.config.lensing.grid_spacing,
                self.config.lensing.grid_opacity,
                palette.accent,
            );
            
            composite_over(&mut buffer, &grid);
        }
        
        // Step 6: Optionally add distortion glow
        if self.config.distortion_glow {
            add_distortion_glow(
                &mut buffer,
                &lensing_field,
                palette,
                self.config.distortion_glow_intensity,
            );
        }
        
        // Step 7: Optionally render visible trajectory trails
        if self.config.show_trajectories {
            add_trajectory_trails(
                &mut buffer,
                &sources,
                width,
                height,
                palette,
                self.config.trajectory_brightness,
                self.config.trajectory_width,
                self.config.trajectory_fade,
            );
        }
        
        // Step 8: Apply vignette
        if self.config.vignette_strength > 0.0 {
            buffer = apply_vignette(
                &buffer,
                width,
                height,
                self.config.vignette_strength,
                self.config.vignette_radius,
            );
        }
        
        // Step 9: Apply film grain
        if self.config.grain.intensity > 0.0 {
            buffer = apply_film_grain(
                &buffer,
                width,
                height,
                &self.config.grain,
                seed + 1000,
            );
        }
        
        // Step 10: Apply gamma correction
        buffer = apply_gamma_correction(&buffer, self.config.gamma);
        
        LensingRenderResult {
            buffer,
            width,
            height,
            palette_name: palette.name.to_string(),
            max_distortion,
            avg_distortion,
        }
    }
    
    /// Render with automatic palette selection based on seed
    pub fn render_auto_palette(
        &self,
        positions: &[Vec<Vector3<f64>>],
        velocities: Option<&[Vec<f64>]>,
        width: usize,
        height: usize,
        seed: u64,
    ) -> LensingRenderResult {
        use super::cosmic_palette::lensing_palette;
        let palette = lensing_palette(seed);
        self.render(positions, velocities, width, height, seed, Some(palette))
    }
}

/// Compute distortion statistics from lensing field
fn compute_distortion_stats(field: &LensingField) -> (f64, f64) {
    let width = field.width();
    let height = field.height();
    
    let mut max_dist = 0.0f64;
    let mut sum_dist = 0.0f64;
    
    for y in 0..height {
        for x in 0..width {
            let mag = field.get_magnitude(x, y);
            max_dist = max_dist.max(mag);
            sum_dist += mag;
        }
    }
    
    let avg_dist = sum_dist / (width * height) as f64;
    (max_dist, avg_dist)
}

/// Composite grid overlay onto buffer using "over" blending
fn composite_over(base: &mut [(f64, f64, f64, f64)], overlay: &[(f64, f64, f64, f64)]) {
    for (b, o) in base.iter_mut().zip(overlay.iter()) {
        let alpha = o.3;
        if alpha > 0.0 {
            b.0 = b.0 * (1.0 - alpha) + o.0 * alpha;
            b.1 = b.1 * (1.0 - alpha) + o.1 * alpha;
            b.2 = b.2 * (1.0 - alpha) + o.2 * alpha;
        }
    }
}

/// Add glow in areas of high distortion
fn add_distortion_glow(
    buffer: &mut [(f64, f64, f64, f64)],
    field: &LensingField,
    palette: &CosmicPalette,
    intensity: f64,
) {
    let width = field.width();
    let height = field.height();
    
    // Find max distortion for normalization
    let mut max_mag = 0.0f64;
    for y in 0..height {
        for x in 0..width {
            max_mag = max_mag.max(field.get_magnitude(x, y));
        }
    }
    
    if max_mag < 0.1 {
        return;
    }
    
    // Add glow proportional to distortion
    for y in 0..height {
        for x in 0..width {
            let mag = field.get_magnitude(x, y) / max_mag;
            
            // Only add glow where distortion is significant
            if mag > 0.1 {
                let glow = (mag - 0.1) * intensity;
                let idx = y * width + x;
                
                // Use primary color for glow
                buffer[idx].0 = (buffer[idx].0 + palette.primary[0] * glow).min(1.0);
                buffer[idx].1 = (buffer[idx].1 + palette.primary[1] * glow).min(1.0);
                buffer[idx].2 = (buffer[idx].2 + palette.primary[2] * glow).min(1.0);
            }
        }
    }
}

/// Add visible trajectory trails
fn add_trajectory_trails(
    buffer: &mut [(f64, f64, f64, f64)],
    sources: &[LensingSource],
    width: usize,
    height: usize,
    palette: &CosmicPalette,
    brightness: f64,
    trail_width: f64,
    fade_with_age: bool,
) {
    // Group sources by body and draw trails
    let mut body_sources: [Vec<&LensingSource>; 3] = [Vec::new(), Vec::new(), Vec::new()];
    
    for source in sources {
        if source.body_index < 3 {
            body_sources[source.body_index].push(source);
        }
    }
    
    for (body_idx, body) in body_sources.iter().enumerate() {
        if body.is_empty() {
            continue;
        }
        
        // Color based on body index
        let color = if body_idx == 0 {
            palette.primary
        } else if body_idx == 1 {
            palette.accent
        } else {
            // Blend of primary and accent for third body
            [
                (palette.primary[0] + palette.accent[0]) * 0.5,
                (palette.primary[1] + palette.accent[1]) * 0.5,
                (palette.primary[2] + palette.accent[2]) * 0.5,
            ]
        };
        
        // Draw soft trail along trajectory
        for source in body {
            let age_factor = if fade_with_age {
                1.0 - source.mass * 0.5 // mass decreases with age
            } else {
                1.0
            };
            
            let point_brightness = brightness * age_factor * (0.5 + source.velocity * 0.5);
            
            draw_soft_point(
                buffer,
                width,
                height,
                source.x,
                source.y,
                trail_width,
                point_brightness,
                &color,
            );
        }
    }
}

/// Draw a soft (Gaussian) point
fn draw_soft_point(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    cx: f64,
    cy: f64,
    size: f64,
    brightness: f64,
    color: &[f64; 3],
) {
    let sigma = size * 0.5;
    let radius = (sigma * 3.0).ceil() as i32;
    
    let icx = cx as i32;
    let icy = cy as i32;
    
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let px = icx + dx;
            let py = icy + dy;
            
            if px < 0 || px >= width as i32 || py < 0 || py >= height as i32 {
                continue;
            }
            
            let dist_sq = (dx as f64 - (cx - icx as f64)).powi(2) 
                        + (dy as f64 - (cy - icy as f64)).powi(2);
            
            let weight = (-dist_sq / (2.0 * sigma * sigma)).exp();
            
            if weight < 0.01 {
                continue;
            }
            
            let idx = py as usize * width + px as usize;
            let contribution = brightness * weight;
            
            // Additive blending
            buffer[idx].0 = (buffer[idx].0 + color[0] * contribution).min(1.0);
            buffer[idx].1 = (buffer[idx].1 + color[1] * contribution).min(1.0);
            buffer[idx].2 = (buffer[idx].2 + color[2] * contribution).min(1.0);
        }
    }
}

/// Apply gamma correction to buffer
fn apply_gamma_correction(
    buffer: &[(f64, f64, f64, f64)],
    gamma: f64,
) -> Vec<(f64, f64, f64, f64)> {
    let inv_gamma = 1.0 / gamma;
    
    buffer
        .par_iter()
        .map(|(r, g, b, a)| {
            (
                r.max(0.0).powf(inv_gamma).min(1.0),
                g.max(0.0).powf(inv_gamma).min(1.0),
                b.max(0.0).powf(inv_gamma).min(1.0),
                *a,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn create_circular_trajectory(steps: usize, radius: f64) -> Vec<Vec<Vector3<f64>>> {
        let positions: Vec<Vector3<f64>> = (0..steps)
            .map(|i| {
                let angle = 2.0 * PI * i as f64 / steps as f64;
                Vector3::new(radius * angle.cos(), radius * angle.sin(), 0.0)
            })
            .collect();
        vec![positions]
    }

    fn create_three_body_trajectory(steps: usize) -> Vec<Vec<Vector3<f64>>> {
        vec![
            (0..steps).map(|i| {
                let t = i as f64 / steps as f64 * 2.0 * PI;
                Vector3::new(10.0 * t.cos(), 10.0 * t.sin(), 0.0)
            }).collect(),
            (0..steps).map(|i| {
                let t = i as f64 / steps as f64 * 2.0 * PI + PI * 2.0 / 3.0;
                Vector3::new(8.0 * t.cos(), 8.0 * t.sin(), 0.0)
            }).collect(),
            (0..steps).map(|i| {
                let t = i as f64 / steps as f64 * 2.0 * PI + PI * 4.0 / 3.0;
                Vector3::new(12.0 * t.cos(), 12.0 * t.sin(), 0.0)
            }).collect(),
        ]
    }

    #[test]
    fn test_lensing_renderer_config_defaults() {
        let config = LensingRendererConfig::default();
        assert!(config.show_trajectories);
        assert!(config.trajectory_brightness > 0.0);
        assert!(config.gamma > 0.0);
    }

    #[test]
    fn test_lensing_renderer_config_presets() {
        let wakes = LensingRendererConfig::gravitational_wakes();
        let invisible = LensingRendererConfig::invisible_paths();
        let extreme = LensingRendererConfig::extreme();
        
        // Wakes should show trajectories
        assert!(wakes.show_trajectories);
        
        // Invisible should not show trajectories
        assert!(!invisible.show_trajectories);
        
        // Extreme should have stronger effects
        assert!(extreme.lensing.strength > wakes.lensing.strength);
    }

    #[test]
    fn test_lensing_renderer_config_with_grid() {
        let config = LensingRendererConfig::gravitational_wakes().with_grid();
        assert!(config.lensing.show_grid);
    }

    #[test]
    fn test_lensing_renderer_config_with_strength() {
        let config = LensingRendererConfig::gravitational_wakes().with_lensing_strength(5.0);
        assert!((config.lensing.strength - 5.0).abs() < 0.001);
    }

    #[test]
    fn test_lensing_renderer_creation() {
        let config = LensingRendererConfig::default();
        let _renderer = LensingRenderer::new(config);
    }

    #[test]
    fn test_lensing_render_basic() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345, None);
        
        assert_eq!(result.buffer.len(), 10000);
        assert_eq!(result.width, 100);
        assert_eq!(result.height, 100);
        assert_eq!(result.palette_name, "Event Horizon");
    }

    #[test]
    fn test_lensing_render_invisible_paths() {
        let renderer = LensingRenderer::new(LensingRendererConfig::invisible_paths());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345, None);
        
        assert_eq!(result.buffer.len(), 10000);
    }

    #[test]
    fn test_lensing_render_three_bodies() {
        let renderer = LensingRenderer::new(LensingRendererConfig::gravitational_wakes());
        let positions = create_three_body_trajectory(100);
        
        let result = renderer.render(&positions, None, 150, 150, 12345, None);
        
        assert_eq!(result.buffer.len(), 22500);
    }

    #[test]
    fn test_lensing_render_with_velocities() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        let velocities = vec![vec![1.0; 100]];
        
        let result = renderer.render(&positions, Some(&velocities), 100, 100, 12345, None);
        
        assert_eq!(result.buffer.len(), 10000);
    }

    #[test]
    fn test_lensing_render_with_grid() {
        let config = LensingRendererConfig::gravitational_wakes().with_grid();
        let renderer = LensingRenderer::new(config);
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345, None);
        
        assert_eq!(result.buffer.len(), 10000);
    }

    #[test]
    fn test_lensing_render_values_in_range() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345, None);
        
        for (r, g, b, a) in &result.buffer {
            assert!(*r >= 0.0 && *r <= 1.0, "R out of range: {}", r);
            assert!(*g >= 0.0 && *g <= 1.0, "G out of range: {}", g);
            assert!(*b >= 0.0 && *b <= 1.0, "B out of range: {}", b);
            assert!(*a >= 0.0 && *a <= 1.0, "A out of range: {}", a);
        }
    }

    #[test]
    fn test_lensing_render_deterministic() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(50, 10.0);
        
        let result1 = renderer.render(&positions, None, 50, 50, 12345, None);
        let result2 = renderer.render(&positions, None, 50, 50, 12345, None);
        
        for (p1, p2) in result1.buffer.iter().zip(result2.buffer.iter()) {
            assert!((p1.0 - p2.0).abs() < 0.001);
            assert!((p1.1 - p2.1).abs() < 0.001);
            assert!((p1.2 - p2.2).abs() < 0.001);
        }
    }

    #[test]
    fn test_lensing_render_distortion_stats() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345, None);
        
        // Should have some distortion
        assert!(result.max_distortion >= 0.0);
        assert!(result.avg_distortion >= 0.0);
        assert!(result.max_distortion >= result.avg_distortion);
    }

    #[test]
    fn test_lensing_render_to_bytes() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(50, 10.0);
        
        let result = renderer.render(&positions, None, 10, 10, 12345, None);
        let bytes = result.to_bytes();
        
        assert_eq!(bytes.len(), 10 * 10 * 4); // RGBA
    }

    #[test]
    fn test_lensing_render_to_u16() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(50, 10.0);
        
        let result = renderer.render(&positions, None, 10, 10, 12345, None);
        let u16s = result.to_u16();
        
        assert_eq!(u16s.len(), 10 * 10 * 4); // RGBA
    }

    #[test]
    fn test_lensing_render_auto_palette() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(50, 10.0);
        
        let result = renderer.render_auto_palette(&positions, None, 50, 50, 12345);
        
        assert_eq!(result.buffer.len(), 2500);
        assert!(!result.palette_name.is_empty());
    }

    #[test]
    fn test_lensing_render_custom_palette() {
        use super::super::cosmic_palette::HAWKING_RADIATION;
        
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        let positions = create_circular_trajectory(50, 10.0);
        
        let result = renderer.render(&positions, None, 50, 50, 12345, Some(&HAWKING_RADIATION));
        
        assert_eq!(result.palette_name, "Hawking Radiation");
    }

    #[test]
    fn test_composite_over() {
        let mut base = vec![(0.5, 0.5, 0.5, 1.0); 4];
        let overlay = vec![
            (1.0, 0.0, 0.0, 0.5),
            (0.0, 1.0, 0.0, 0.0), // Zero alpha = no change
            (0.0, 0.0, 1.0, 1.0),
            (1.0, 1.0, 1.0, 0.25),
        ];
        
        composite_over(&mut base, &overlay);
        
        // First pixel blended
        assert!((base[0].0 - 0.75).abs() < 0.01);
        
        // Second pixel unchanged (zero alpha)
        assert!((base[1].0 - 0.5).abs() < 0.01);
        
        // Third pixel fully replaced (alpha = 1)
        assert!((base[2].2 - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_draw_soft_point() {
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 100];
        let color = [1.0, 1.0, 1.0];
        
        draw_soft_point(&mut buffer, 10, 10, 5.0, 5.0, 2.0, 1.0, &color);
        
        // Center should be brightest
        let center_idx = 5 * 10 + 5;
        assert!(buffer[center_idx].0 > 0.0);
        
        // Nearby should have some contribution
        let nearby_idx = 5 * 10 + 6;
        assert!(buffer[nearby_idx].0 > 0.0);
        assert!(buffer[nearby_idx].0 < buffer[center_idx].0);
    }

    #[test]
    fn test_apply_gamma_correction() {
        let buffer = vec![
            (0.0, 0.0, 0.0, 1.0),
            (0.5, 0.5, 0.5, 1.0),
            (1.0, 1.0, 1.0, 1.0),
        ];
        
        let corrected = apply_gamma_correction(&buffer, 2.2);
        
        // Black stays black
        assert!((corrected[0].0 - 0.0).abs() < 0.001);
        
        // White stays white
        assert!((corrected[2].0 - 1.0).abs() < 0.001);
        
        // Midtones get brighter with gamma > 1
        assert!(corrected[1].0 > 0.5);
    }

    #[test]
    fn test_add_distortion_glow() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        
        add_distortion_glow(&mut buffer, &field, &EVENT_HORIZON, 0.5);
        
        // Some pixels should have been glowed
        let bright = buffer.iter().filter(|p| p.0 > 0.001).count();
        assert!(bright > 0);
    }

    #[test]
    fn test_add_trajectory_trails() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        
        add_trajectory_trails(
            &mut buffer,
            &sources,
            100, 100,
            &EVENT_HORIZON,
            0.8,
            2.0,
            true,
        );
        
        // Some pixels should have trails
        let bright = buffer.iter().filter(|p| p.0 > 0.001 || p.1 > 0.001 || p.2 > 0.001).count();
        assert!(bright > 0);
    }

    #[test]
    fn test_compute_distortion_stats() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        let (max_dist, avg_dist) = compute_distortion_stats(&field);
        
        assert!(max_dist >= 0.0);
        assert!(avg_dist >= 0.0);
        assert!(max_dist >= avg_dist);
    }

    #[test]
    fn test_all_config_presets_render() {
        let configs = [
            LensingRendererConfig::gravitational_wakes(),
            LensingRendererConfig::invisible_paths(),
            LensingRendererConfig::extreme(),
        ];
        
        let positions = create_circular_trajectory(50, 10.0);
        
        for config in configs {
            let renderer = LensingRenderer::new(config);
            let result = renderer.render(&positions, None, 50, 50, 12345, None);
            
            assert_eq!(result.buffer.len(), 2500);
        }
    }
}

