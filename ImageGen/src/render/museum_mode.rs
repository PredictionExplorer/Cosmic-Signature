//! Museum Mode Renderer
//!
//! A complete reimagining of the rendering pipeline for museum-quality output.
//! This mode combines:

#![allow(dead_code)] // Module provides extensive configuration options for future use
//!
//! - **Curated 2-color palettes** for sophisticated restraint
//! - **Point-based Gaussian splatting** for soft, ethereal quality
//! - **Composition filtering** for negative space enforcement
//! - **Film grain** for organic materiality
//!
//! # Design Philosophy
//!
//! The default renderer is designed for spectacle - bright, colorful, dynamic.
//! Museum mode takes the opposite approach: restraint, sophistication, and
//! the kind of quiet beauty that invites contemplation.
//!
//! Key principles:
//! - **Less is more**: Empty space is not absence, it's presence
//! - **Two colors maximum**: Primary + accent, swimming in void
//! - **Soft everything**: No hard edges, all Gaussian, all diffuse
//! - **Imperfect perfection**: Subtle grain adds organic quality
//!
//! # Usage
//!
//! ```ignore
//! let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
//! let result = renderer.render(&trajectory_positions, width, height, seed);
//! ```

use nalgebra::Vector3;
use rayon::prelude::*;

use super::cosmic_palette::{CosmicPalette, deep_field_palette};
use super::point_renderer::{PointRendererConfig, RenderPoint, render_points, render_star_highlights, PointAccumulator};
use super::composition_filter::{CompositionFilterConfig, CompositionScore, analyze_composition};
use super::film_grain::{FilmGrainConfig, apply_film_grain, apply_vignette};

/// Configuration for museum mode rendering
#[derive(Clone, Debug)]
pub struct MuseumModeConfig {
    /// Point rendering configuration
    pub point_config: PointRendererConfig,
    
    /// Composition filtering configuration
    pub composition_config: CompositionFilterConfig,
    
    /// Film grain configuration
    pub grain_config: FilmGrainConfig,
    
    /// Vignette strength (0 = none, 1 = strong)
    pub vignette_strength: f64,
    
    /// Vignette radius (fraction where falloff starts)
    pub vignette_radius: f64,
    
    /// Whether to auto-crop for better composition
    pub auto_crop: bool,
    
    /// Target void percentage for auto-cropping
    pub target_void: f64,
    
    /// Whether to add star highlights at velocity peaks
    pub enable_star_highlights: bool,
    
    /// Velocity threshold for star highlights
    pub star_highlight_threshold: f64,
    
    /// Gamma correction value
    pub gamma: f64,
    
    /// Background rendering mode
    pub background_mode: BackgroundMode,
    
    /// Whether to use temporal fading (older positions fade)
    pub temporal_fading: bool,
    
    /// Subsample rate (render every Nth position for sparsity)
    pub position_subsample: usize,
}

/// Background rendering modes
#[derive(Clone, Debug, PartialEq)]
pub enum BackgroundMode {
    /// Pure black (deepest void)
    PureBlack,
    /// Subtle gradient from palette
    PaletteGradient,
    /// Very subtle noise/texture
    TexturedVoid,
}

impl Default for MuseumModeConfig {
    fn default() -> Self {
        Self::deep_field()
    }
}

impl MuseumModeConfig {
    /// Deep field configuration: sparse points, lots of void
    pub fn deep_field() -> Self {
        Self {
            point_config: PointRendererConfig::deep_field(),
            composition_config: CompositionFilterConfig::museum_quality(),
            grain_config: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.15,
            vignette_radius: 0.6,
            auto_crop: false, // Full frame for now
            target_void: 0.75,
            enable_star_highlights: true,
            star_highlight_threshold: 0.85,
            gamma: 2.2,
            background_mode: BackgroundMode::PaletteGradient,
            temporal_fading: true,
            position_subsample: 3, // Use every 3rd position
        }
    }
    
    /// Filament configuration: thin trails, elegant curves
    pub fn filament() -> Self {
        Self {
            point_config: PointRendererConfig::filament(),
            composition_config: CompositionFilterConfig::museum_quality(),
            grain_config: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.12,
            vignette_radius: 0.65,
            auto_crop: false,
            target_void: 0.70,
            enable_star_highlights: false, // Filaments don't need star highlights
            star_highlight_threshold: 0.95,
            gamma: 2.2,
            background_mode: BackgroundMode::PaletteGradient,
            temporal_fading: true,
            position_subsample: 1, // Use all positions for continuous trails
        }
    }
    
    /// Hybrid configuration: best of both worlds
    pub fn hybrid() -> Self {
        Self {
            point_config: PointRendererConfig::museum_quality(),
            composition_config: CompositionFilterConfig::museum_quality(),
            grain_config: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.12,
            vignette_radius: 0.65,
            auto_crop: false,
            target_void: 0.72,
            enable_star_highlights: true,
            star_highlight_threshold: 0.88,
            gamma: 2.2,
            background_mode: BackgroundMode::PaletteGradient,
            temporal_fading: true,
            position_subsample: 2,
        }
    }
    
    /// Minimal configuration: maximum restraint
    pub fn minimal() -> Self {
        Self {
            point_config: PointRendererConfig {
                sample_probability: 0.08,
                base_brightness: 0.35,
                ..PointRendererConfig::deep_field()
            },
            composition_config: CompositionFilterConfig::minimal(),
            grain_config: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.08,
            vignette_radius: 0.7,
            auto_crop: false,
            target_void: 0.85,
            enable_star_highlights: true,
            star_highlight_threshold: 0.92,
            gamma: 2.2,
            background_mode: BackgroundMode::PureBlack,
            temporal_fading: true,
            position_subsample: 5,
        }
    }
}

/// Museum mode renderer
pub struct MuseumModeRenderer {
    config: MuseumModeConfig,
}

impl MuseumModeRenderer {
    /// Create a new museum mode renderer
    pub fn new(config: MuseumModeConfig) -> Self {
        Self { config }
    }
    
    /// Render trajectory positions to an RGBA buffer
    ///
    /// # Arguments
    /// * `positions` - Trajectory positions [body][step] = Vector3
    /// * `velocities` - Optional velocity magnitudes [body][step]
    /// * `width`, `height` - Output dimensions
    /// * `seed` - Random seed for deterministic rendering
    ///
    /// # Returns
    /// RGBA buffer as Vec<(f64, f64, f64, f64)> with values 0-1
    pub fn render(
        &self,
        positions: &[Vec<Vector3<f64>>],
        velocities: Option<&[Vec<f64>]>,
        width: usize,
        height: usize,
        seed: u64,
    ) -> MuseumRenderResult {
        // Analyze composition quality
        let composition_score = analyze_composition(
            positions,
            width as u32,
            height as u32,
            &self.config.composition_config,
        );
        
        // Get palette based on seed
        let palette = deep_field_palette(seed);
        
        // Compute bounds
        let bounds = compute_bounds(positions);
        
        // Compute or estimate velocities
        let computed_velocities = match velocities {
            Some(v) => v.to_vec(),
            None => compute_velocities(positions),
        };
        
        // Convert to render points with subsampling
        let points = trajectory_to_render_points(
            positions,
            &computed_velocities,
            width,
            height,
            bounds,
            self.config.position_subsample,
            self.config.temporal_fading,
        );
        
        // Render main points
        let mut buffer = render_points(
            &points,
            width,
            height,
            palette,
            &self.config.point_config,
            seed,
        );
        
        // Add star highlights if enabled
        if self.config.enable_star_highlights {
            let mut accum = PointAccumulator::new(width, height);
            render_star_highlights(
                &points,
                width,
                height,
                &mut accum,
                palette,
                self.config.star_highlight_threshold,
            );
            
            // Composite star highlights onto buffer
            let star_rgba = accum.to_rgba(palette, self.config.gamma);
            for (base, star) in buffer.iter_mut().zip(star_rgba.iter()) {
                // Additive blending for stars
                base.0 = (base.0 + star.0 * 0.3).min(1.0);
                base.1 = (base.1 + star.1 * 0.3).min(1.0);
                base.2 = (base.2 + star.2 * 0.3).min(1.0);
            }
        }
        
        // Apply vignette
        if self.config.vignette_strength > 0.0 {
            buffer = apply_vignette(
                &buffer,
                width,
                height,
                self.config.vignette_strength,
                self.config.vignette_radius,
            );
        }
        
        // Apply film grain last
        if self.config.grain_config.intensity > 0.0 {
            buffer = apply_film_grain(
                &buffer,
                width,
                height,
                &self.config.grain_config,
                seed + 1000, // Different seed for grain
            );
        }
        
        MuseumRenderResult {
            buffer,
            composition_score,
            palette_name: palette.name.to_string(),
            width,
            height,
        }
    }
    
    /// Render with automatic palette selection based on trajectory characteristics
    pub fn render_auto_palette(
        &self,
        positions: &[Vec<Vector3<f64>>],
        velocities: Option<&[Vec<f64>]>,
        width: usize,
        height: usize,
        seed: u64,
    ) -> MuseumRenderResult {
        // Analyze trajectory to select appropriate palette
        let palette = select_palette_for_trajectory(positions, seed);
        
        // Use selected palette
        self.render_with_palette(positions, velocities, width, height, seed, palette)
    }
    
    /// Render with a specific palette
    pub fn render_with_palette(
        &self,
        positions: &[Vec<Vector3<f64>>],
        velocities: Option<&[Vec<f64>]>,
        width: usize,
        height: usize,
        seed: u64,
        palette: &CosmicPalette,
    ) -> MuseumRenderResult {
        let composition_score = analyze_composition(
            positions,
            width as u32,
            height as u32,
            &self.config.composition_config,
        );
        
        let bounds = compute_bounds(positions);
        
        let computed_velocities = match velocities {
            Some(v) => v.to_vec(),
            None => compute_velocities(positions),
        };
        
        let points = trajectory_to_render_points(
            positions,
            &computed_velocities,
            width,
            height,
            bounds,
            self.config.position_subsample,
            self.config.temporal_fading,
        );
        
        let mut buffer = render_points(
            &points,
            width,
            height,
            palette,
            &self.config.point_config,
            seed,
        );
        
        if self.config.enable_star_highlights {
            let mut accum = PointAccumulator::new(width, height);
            render_star_highlights(
                &points,
                width,
                height,
                &mut accum,
                palette,
                self.config.star_highlight_threshold,
            );
            
            let star_rgba = accum.to_rgba(palette, self.config.gamma);
            for (base, star) in buffer.iter_mut().zip(star_rgba.iter()) {
                base.0 = (base.0 + star.0 * 0.3).min(1.0);
                base.1 = (base.1 + star.1 * 0.3).min(1.0);
                base.2 = (base.2 + star.2 * 0.3).min(1.0);
            }
        }
        
        if self.config.vignette_strength > 0.0 {
            buffer = apply_vignette(
                &buffer,
                width,
                height,
                self.config.vignette_strength,
                self.config.vignette_radius,
            );
        }
        
        if self.config.grain_config.intensity > 0.0 {
            buffer = apply_film_grain(
                &buffer,
                width,
                height,
                &self.config.grain_config,
                seed + 1000,
            );
        }
        
        MuseumRenderResult {
            buffer,
            composition_score,
            palette_name: palette.name.to_string(),
            width,
            height,
        }
    }
}

/// Result of museum mode rendering
#[derive(Debug)]
pub struct MuseumRenderResult {
    /// RGBA buffer with values 0-1
    pub buffer: Vec<(f64, f64, f64, f64)>,
    
    /// Composition quality score
    pub composition_score: CompositionScore,
    
    /// Name of palette used
    pub palette_name: String,
    
    /// Width in pixels
    pub width: usize,
    
    /// Height in pixels
    pub height: usize,
}

impl MuseumRenderResult {
    /// Check if composition quality is acceptable
    pub fn is_museum_quality(&self) -> bool {
        self.composition_score.is_acceptable()
    }
    
    /// Get quality tier description
    pub fn quality_tier(&self) -> &'static str {
        self.composition_score.quality_tier()
    }
    
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

// ============================================================================
// Helper Functions
// ============================================================================

/// Compute bounds from positions
fn compute_bounds(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    
    for body in positions {
        for pos in body {
            min_x = min_x.min(pos.x);
            max_x = max_x.max(pos.x);
            min_y = min_y.min(pos.y);
            max_y = max_y.max(pos.y);
        }
    }
    
    // Add margin
    let margin = 0.05 * ((max_x - min_x).max(max_y - min_y));
    (min_x - margin, max_x + margin, min_y - margin, max_y + margin)
}

/// Compute velocities from positions (finite difference)
fn compute_velocities(positions: &[Vec<Vector3<f64>>]) -> Vec<Vec<f64>> {
    positions
        .iter()
        .map(|body| {
            if body.len() < 2 {
                return vec![0.0; body.len()];
            }
            
            let mut velocities = Vec::with_capacity(body.len());
            
            // First position: use forward difference
            velocities.push((body[1] - body[0]).norm());
            
            // Middle positions: use central difference
            for i in 1..body.len() - 1 {
                let vel = (body[i + 1] - body[i - 1]).norm() / 2.0;
                velocities.push(vel);
            }
            
            // Last position: use backward difference
            velocities.push((body[body.len() - 1] - body[body.len() - 2]).norm());
            
            velocities
        })
        .collect()
}

/// Convert trajectory positions to render points
fn trajectory_to_render_points(
    positions: &[Vec<Vector3<f64>>],
    velocities: &[Vec<f64>],
    width: usize,
    height: usize,
    bounds: (f64, f64, f64, f64),
    subsample: usize,
    temporal_fading: bool,
) -> Vec<RenderPoint> {
    let (min_x, max_x, min_y, max_y) = bounds;
    let world_width = (max_x - min_x).max(1e-10);
    let world_height = (max_y - min_y).max(1e-10);
    
    // Find max velocity for normalization
    let max_velocity = velocities
        .iter()
        .flat_map(|v| v.iter())
        .copied()
        .fold(0.0, f64::max)
        .max(1e-10);
    
    let subsample = subsample.max(1);
    
    positions
        .par_iter()
        .zip(velocities.par_iter())
        .enumerate()
        .flat_map(|(body_idx, (body_positions, body_velocities))| {
            let num_steps = body_positions.len();
            
            body_positions
                .iter()
                .zip(body_velocities.iter())
                .enumerate()
                .filter(|(i, _)| i % subsample == 0)
                .map(|(step, (pos, &vel))| {
                    // Convert world to pixel coordinates
                    let px = (pos.x - min_x) / world_width * width as f64;
                    let py = (pos.y - min_y) / world_height * height as f64;
                    
                    // Normalize velocity
                    let velocity = vel / max_velocity;
                    
                    // Age: 0 = start, 1 = end
                    let age = if temporal_fading {
                        step as f64 / num_steps.max(1) as f64
                    } else {
                        0.0
                    };
                    
                    RenderPoint {
                        x: px,
                        y: py,
                        velocity,
                        age,
                        body_index: body_idx,
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

/// Select palette based on trajectory characteristics
fn select_palette_for_trajectory(positions: &[Vec<Vector3<f64>>], seed: u64) -> &'static CosmicPalette {
    use super::cosmic_palette::ALL_COSMIC_PALETTES;
    
    // Compute trajectory "energy" and "symmetry"
    let mut total_distance = 0.0;
    let mut crossings = 0;
    
    for body in positions {
        for i in 1..body.len() {
            total_distance += (body[i] - body[i - 1]).norm();
        }
    }
    
    // Count approximate crossings (simplified)
    for body in positions {
        let n = body.len();
        for i in (0..n).step_by(100) {
            for j in (i + 50..n).step_by(100) {
                if i < body.len() && j < body.len() {
                    let dist = (body[i] - body[j]).norm();
                    if dist < total_distance * 0.001 {
                        crossings += 1;
                    }
                }
            }
        }
    }
    
    // Select palette based on characteristics
    let complexity = crossings.min(10) as u64;
    let palette_idx = (seed + complexity) as usize % ALL_COSMIC_PALETTES.len();
    
    &ALL_COSMIC_PALETTES[palette_idx]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_circular_trajectory(steps: usize, radius: f64) -> Vec<Vec<Vector3<f64>>> {
        let positions: Vec<Vector3<f64>> = (0..steps)
            .map(|i| {
                let angle = 2.0 * std::f64::consts::PI * i as f64 / steps as f64;
                Vector3::new(
                    radius * angle.cos(),
                    radius * angle.sin(),
                    0.0,
                )
            })
            .collect();
        vec![positions]
    }

    #[test]
    fn test_museum_mode_config_defaults() {
        let config = MuseumModeConfig::default();
        assert!(config.vignette_strength >= 0.0);
        assert!(config.gamma > 0.0);
    }

    #[test]
    fn test_museum_mode_config_presets() {
        let deep_field = MuseumModeConfig::deep_field();
        let filament = MuseumModeConfig::filament();
        let _hybrid = MuseumModeConfig::hybrid();
        let minimal = MuseumModeConfig::minimal();
        
        // Minimal should have highest void target
        assert!(minimal.target_void > deep_field.target_void);
        
        // Filament should use all positions
        assert_eq!(filament.position_subsample, 1);
    }

    #[test]
    fn test_museum_renderer_creation() {
        let config = MuseumModeConfig::default();
        let _renderer = MuseumModeRenderer::new(config);
    }

    #[test]
    fn test_museum_render_basic() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(1000, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345);
        
        assert_eq!(result.buffer.len(), 10000);
        assert_eq!(result.width, 100);
        assert_eq!(result.height, 100);
        assert!(!result.palette_name.is_empty());
    }

    #[test]
    fn test_museum_render_with_velocities() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        let velocities = vec![vec![1.0; 100]];
        
        let result = renderer.render(&positions, Some(&velocities), 50, 50, 12345);
        
        assert_eq!(result.buffer.len(), 2500);
    }

    #[test]
    fn test_museum_render_values_in_range() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(500, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345);
        
        for (r, g, b, a) in &result.buffer {
            assert!(*r >= 0.0 && *r <= 1.0, "R out of range: {}", r);
            assert!(*g >= 0.0 && *g <= 1.0, "G out of range: {}", g);
            assert!(*b >= 0.0 && *b <= 1.0, "B out of range: {}", b);
            assert!(*a >= 0.0 && *a <= 1.0, "A out of range: {}", a);
        }
    }

    #[test]
    fn test_museum_render_deterministic() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result1 = renderer.render(&positions, None, 50, 50, 12345);
        let result2 = renderer.render(&positions, None, 50, 50, 12345);
        
        assert_eq!(result1.palette_name, result2.palette_name);
        
        // Check a few pixels
        for i in [0, 100, 500, 1000, 2000] {
            let (r1, g1, b1, a1) = result1.buffer[i];
            let (r2, g2, b2, a2) = result2.buffer[i];
            assert!((r1 - r2).abs() < 0.001);
            assert!((g1 - g2).abs() < 0.001);
            assert!((b1 - b2).abs() < 0.001);
            assert!((a1 - a2).abs() < 0.001);
        }
    }

    #[test]
    fn test_museum_render_to_bytes() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 10, 10, 12345);
        let bytes = result.to_bytes();
        
        assert_eq!(bytes.len(), 10 * 10 * 4); // RGBA
    }

    #[test]
    fn test_museum_render_to_u16() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render(&positions, None, 10, 10, 12345);
        let u16s = result.to_u16();
        
        assert_eq!(u16s.len(), 10 * 10 * 4); // RGBA
        // u16 values are inherently <= 65535, so no need to check
    }

    #[test]
    fn test_museum_render_composition_score() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(500, 10.0);
        
        let result = renderer.render(&positions, None, 100, 100, 12345);
        
        // Should have a valid composition score
        assert!(result.composition_score.overall >= 0.0);
        assert!(result.composition_score.overall <= 1.0);
    }

    #[test]
    fn test_compute_bounds() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(10.0, 10.0, 0.0)],
        ];
        
        let (min_x, max_x, min_y, max_y) = compute_bounds(&positions);
        
        // Should include margin
        assert!(min_x < 0.0);
        assert!(max_x > 10.0);
        assert!(min_y < 0.0);
        assert!(max_y > 10.0);
    }

    #[test]
    fn test_compute_velocities() {
        let positions = vec![
            vec![
                Vector3::new(0.0, 0.0, 0.0),
                Vector3::new(1.0, 0.0, 0.0),
                Vector3::new(3.0, 0.0, 0.0),
            ],
        ];
        
        let velocities = compute_velocities(&positions);
        
        assert_eq!(velocities.len(), 1);
        assert_eq!(velocities[0].len(), 3);
        
        // First velocity: forward difference
        assert!((velocities[0][0] - 1.0).abs() < 0.01);
        
        // Middle velocity: central difference
        assert!((velocities[0][1] - 1.5).abs() < 0.01); // (3-0)/2
        
        // Last velocity: backward difference
        assert!((velocities[0][2] - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_trajectory_to_render_points() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(10.0, 10.0, 0.0)],
        ];
        let velocities = vec![vec![1.0, 2.0]];
        
        let points = trajectory_to_render_points(
            &positions,
            &velocities,
            100, 100,
            (0.0, 10.0, 0.0, 10.0),
            1, // No subsampling
            true, // Temporal fading
        );
        
        assert_eq!(points.len(), 2);
        
        // Check first point is at origin
        assert!(points[0].x < 10.0);
        assert!(points[0].y < 10.0);
        assert_eq!(points[0].age, 0.0);
        
        // Check second point is at end
        assert!(points[1].x > 90.0);
        assert!(points[1].y > 90.0);
        assert!(points[1].age > 0.0);
    }

    #[test]
    fn test_trajectory_to_render_points_subsampling() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0); 100],
        ];
        let velocities = vec![vec![1.0; 100]];
        
        let points_full = trajectory_to_render_points(
            &positions, &velocities, 100, 100,
            (0.0, 1.0, 0.0, 1.0), 1, true,
        );
        
        let points_subsampled = trajectory_to_render_points(
            &positions, &velocities, 100, 100,
            (0.0, 1.0, 0.0, 1.0), 5, true,
        );
        
        assert_eq!(points_full.len(), 100);
        assert_eq!(points_subsampled.len(), 20);
    }

    #[test]
    fn test_select_palette_deterministic() {
        let positions = create_circular_trajectory(100, 10.0);
        
        let palette1 = select_palette_for_trajectory(&positions, 12345);
        let palette2 = select_palette_for_trajectory(&positions, 12345);
        
        assert_eq!(palette1.name, palette2.name);
    }

    #[test]
    fn test_museum_result_quality_tier() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(500, 10.0);
        
        let result = renderer.render(&positions, None, 200, 200, 12345);
        
        let tier = result.quality_tier();
        assert!(!tier.is_empty());
        assert!(["Exceptional", "Excellent", "Good", "Marginal", "Poor"].contains(&tier));
    }

    #[test]
    fn test_background_modes() {
        assert_eq!(BackgroundMode::PureBlack, BackgroundMode::PureBlack);
        assert_ne!(BackgroundMode::PureBlack, BackgroundMode::PaletteGradient);
    }

    #[test]
    fn test_render_auto_palette() {
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render_auto_palette(&positions, None, 50, 50, 12345);
        
        assert_eq!(result.buffer.len(), 2500);
        assert!(!result.palette_name.is_empty());
    }

    #[test]
    fn test_render_with_custom_palette() {
        use super::super::cosmic_palette::MOONLIGHT;
        
        let renderer = MuseumModeRenderer::new(MuseumModeConfig::default());
        let positions = create_circular_trajectory(100, 10.0);
        
        let result = renderer.render_with_palette(&positions, None, 50, 50, 12345, &MOONLIGHT);
        
        assert_eq!(result.palette_name, "Moonlight");
    }
}

