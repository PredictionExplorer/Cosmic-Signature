//! Gravitational Lensing Core Physics
//!
//! This module implements the physics of gravitational lensing for museum-quality
//! visualization of spacetime distortion. It simulates how massive bodies bend
//! light and distort background images.
//!
//! # Physics Overview
//!
//! In general relativity, massive objects curve spacetime. Light follows geodesics
//! (shortest paths) through this curved space, resulting in:
//!
//! - **Image distortion**: Straight lines become curved
//! - **Einstein rings**: Background sources form circular arcs around massive objects
//! - **Magnification**: Areas near massive objects are stretched
//! - **Multiple images**: A single source can appear in multiple locations
//!
//! # Implementation Notes
//!
//! We use a simplified ray-tracing approach optimized for visual beauty:
//! - Each pixel traces back to find what background point it would see
//! - Distortion strength is computed from trajectory mass and proximity
//! - Performance is prioritized via spatial acceleration structures

#![allow(dead_code)]
#![allow(clippy::unreadable_literal)]
#![allow(clippy::many_single_char_names)]

use rayon::prelude::*;
use nalgebra::Vector3;

/// Configuration for gravitational lensing effect
#[derive(Clone, Debug)]
pub struct LensingConfig {
    /// Overall lensing strength multiplier (1.0 = physically motivated, higher = more dramatic)
    pub strength: f64,
    
    /// Einstein radius scale (affects size of distortion rings)
    pub einstein_radius_scale: f64,
    
    /// Falloff exponent for lensing strength with distance
    pub falloff_exponent: f64,
    
    /// Maximum distortion in pixels (prevents extreme warping)
    pub max_displacement: f64,
    
    /// Whether to show lensing grid overlay for visualization
    pub show_grid: bool,
    
    /// Grid line spacing in pixels (if grid is enabled)
    pub grid_spacing: f64,
    
    /// Grid line opacity (0-1)
    pub grid_opacity: f64,
    
    /// Mass distribution along trajectory (how "heavy" each point feels)
    /// Higher values = more intense lensing near bodies
    pub mass_concentration: f64,
    
    /// Whether to apply chromatic aberration (color separation at edges)
    pub chromatic_aberration: bool,
    
    /// Strength of chromatic aberration (if enabled)
    pub chromatic_strength: f64,
}

impl Default for LensingConfig {
    fn default() -> Self {
        Self::gravitational_wakes()
    }
}

impl LensingConfig {
    /// Dramatic default - "Gravitational Wakes" style
    /// Trajectories are luminous and clearly distort space around them
    pub fn gravitational_wakes() -> Self {
        Self {
            strength: 1.8,
            einstein_radius_scale: 0.08,
            falloff_exponent: 1.5,
            max_displacement: 150.0,
            show_grid: false,
            grid_spacing: 40.0,
            grid_opacity: 0.15,
            mass_concentration: 2.0,
            chromatic_aberration: true,
            chromatic_strength: 0.3,
        }
    }
    
    /// Subtle mode - "Invisible Paths" style
    /// Trajectories are nearly invisible; only the distortion reveals them
    pub fn invisible_paths() -> Self {
        Self {
            strength: 1.2,
            einstein_radius_scale: 0.05,
            falloff_exponent: 2.0,
            max_displacement: 80.0,
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.1,
            mass_concentration: 1.5,
            chromatic_aberration: false,
            chromatic_strength: 0.0,
        }
    }
    
    /// Maximum drama for spectacular images
    pub fn extreme() -> Self {
        Self {
            strength: 3.0,
            einstein_radius_scale: 0.12,
            falloff_exponent: 1.2,
            max_displacement: 250.0,
            show_grid: false,
            grid_spacing: 30.0,
            grid_opacity: 0.2,
            mass_concentration: 3.0,
            chromatic_aberration: true,
            chromatic_strength: 0.5,
        }
    }
    
    /// With grid overlay for educational/artistic visualization
    #[must_use]
    pub fn with_grid(mut self) -> Self {
        self.show_grid = true;
        self
    }
}

/// A lensing mass source (derived from trajectory positions)
#[derive(Clone, Debug)]
pub struct LensingSource {
    /// Position in pixel coordinates
    pub x: f64,
    pub y: f64,
    
    /// Effective mass (relative, affects lensing strength)
    pub mass: f64,
    
    /// Velocity (higher velocity = different lensing characteristics)
    pub velocity: f64,
    
    /// Body index (0, 1, or 2)
    pub body_index: usize,
}

/// Precomputed lensing field for efficient distortion lookup
pub struct LensingField {
    /// Width of the field
    width: usize,
    /// Height of the field
    height: usize,
    /// Displacement vectors (dx, dy) for each pixel
    displacements: Vec<(f64, f64)>,
    /// Distortion magnitude at each pixel (for visualization)
    magnitudes: Vec<f64>,
}

impl LensingField {
    /// Create a new lensing field from trajectory sources
    pub fn from_sources(
        sources: &[LensingSource],
        width: usize,
        height: usize,
        config: &LensingConfig,
    ) -> Self {
        let size = width * height;
        
        // Build spatial acceleration structure (grid of source indices)
        let grid = SpatialGrid::from_sources(sources, width, height, 64);
        
        // Compute displacement field in parallel
        let displacements: Vec<(f64, f64)> = (0..size)
            .into_par_iter()
            .map(|idx| {
                let px = (idx % width) as f64 + 0.5;
                let py = (idx / width) as f64 + 0.5;
                
                compute_displacement(px, py, sources, &grid, config, width, height)
            })
            .collect();
        
        // Compute magnitudes for visualization
        let magnitudes: Vec<f64> = displacements
            .par_iter()
            .map(|(dx, dy)| (dx * dx + dy * dy).sqrt())
            .collect();
        
        Self {
            width,
            height,
            displacements,
            magnitudes,
        }
    }
    
    /// Get the source pixel coordinates for a given destination pixel
    /// Returns (source_x, source_y) which may be fractional
    #[inline]
    pub fn get_source_coords(&self, x: usize, y: usize) -> (f64, f64) {
        let idx = y * self.width + x;
        let (dx, dy) = self.displacements[idx];
        (x as f64 + dx, y as f64 + dy)
    }
    
    /// Get displacement at a pixel
    #[inline]
    pub fn get_displacement(&self, x: usize, y: usize) -> (f64, f64) {
        let idx = y * self.width + x;
        self.displacements[idx]
    }
    
    /// Get distortion magnitude at a pixel (for visualization)
    #[inline]
    pub fn get_magnitude(&self, x: usize, y: usize) -> f64 {
        let idx = y * self.width + x;
        self.magnitudes[idx]
    }
    
    /// Get chromatic aberration offsets for RGB channels
    /// Returns [(r_dx, r_dy), (g_dx, g_dy), (b_dx, b_dy)]
    pub fn get_chromatic_offsets(&self, x: usize, y: usize, strength: f64) -> [(f64, f64); 3] {
        let (dx, dy) = self.get_displacement(x, y);
        let mag = (dx * dx + dy * dy).sqrt();
        
        if mag < 0.1 {
            return [(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)];
        }
        
        // Normalize displacement direction
        let nx = dx / mag;
        let ny = dy / mag;
        
        // Chromatic separation perpendicular to distortion
        let perpx = -ny;
        let perpy = nx;
        
        let chroma_offset = mag * strength * 0.1;
        
        [
            (dx + perpx * chroma_offset, dy + perpy * chroma_offset),      // Red: outer
            (dx, dy),                                                        // Green: center
            (dx - perpx * chroma_offset, dy - perpy * chroma_offset),      // Blue: inner
        ]
    }
    
    /// Apply lensing distortion to a background image
    pub fn apply_distortion(
        &self,
        background: &[(f64, f64, f64, f64)],
        config: &LensingConfig,
    ) -> Vec<(f64, f64, f64, f64)> {
        let width = self.width;
        let height = self.height;
        
        (0..width * height)
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;
                
                if config.chromatic_aberration && config.chromatic_strength > 0.0 {
                    // Sample each color channel with different offsets
                    let offsets = self.get_chromatic_offsets(x, y, config.chromatic_strength);
                    
                    let r = sample_channel(background, width, height, 
                        x as f64 + offsets[0].0, y as f64 + offsets[0].1, 0);
                    let g = sample_channel(background, width, height, 
                        x as f64 + offsets[1].0, y as f64 + offsets[1].1, 1);
                    let b = sample_channel(background, width, height, 
                        x as f64 + offsets[2].0, y as f64 + offsets[2].1, 2);
                    
                    (r, g, b, 1.0)
                } else {
                    // Simple distortion without chromatic aberration
                    let (sx, sy) = self.get_source_coords(x, y);
                    sample_bilinear(background, width, height, sx, sy)
                }
            })
            .collect()
    }
    
    /// Get width
    pub fn width(&self) -> usize {
        self.width
    }
    
    /// Get height
    pub fn height(&self) -> usize {
        self.height
    }
}

/// Spatial grid for accelerating source lookups
struct SpatialGrid {
    /// Grid cell size
    cell_size: usize,
    /// Number of cells in X
    cells_x: usize,
    /// Number of cells in Y
    cells_y: usize,
    /// Source indices in each cell
    cells: Vec<Vec<usize>>,
}

impl SpatialGrid {
    fn from_sources(sources: &[LensingSource], width: usize, height: usize, cell_size: usize) -> Self {
        let cells_x = width.div_ceil(cell_size);
        let cells_y = height.div_ceil(cell_size);
        let mut cells = vec![Vec::new(); cells_x * cells_y];
        
        for (i, source) in sources.iter().enumerate() {
            let cx = ((source.x as usize) / cell_size).min(cells_x - 1);
            let cy = ((source.y as usize) / cell_size).min(cells_y - 1);
            cells[cy * cells_x + cx].push(i);
        }
        
        Self {
            cell_size,
            cells_x,
            cells_y,
            cells,
        }
    }
    
    /// Get sources that might affect a pixel at (px, py) within a given radius
    fn get_nearby_sources<'a>(
        &'a self,
        sources: &'a [LensingSource],
        px: f64,
        py: f64,
        radius: f64,
    ) -> impl Iterator<Item = &'a LensingSource> {
        let radius_cells = (radius / self.cell_size as f64).ceil() as i32 + 1;
        let cx = (px as usize / self.cell_size) as i32;
        let cy = (py as usize / self.cell_size) as i32;
        
        let cells_x = self.cells_x as i32;
        let cells_y = self.cells_y as i32;
        
        // Collect indices from nearby cells
        let mut indices = Vec::new();
        for dy in -radius_cells..=radius_cells {
            for dx in -radius_cells..=radius_cells {
                let ncx = cx + dx;
                let ncy = cy + dy;
                if ncx >= 0 && ncx < cells_x && ncy >= 0 && ncy < cells_y {
                    let cell_idx = (ncy as usize) * self.cells_x + (ncx as usize);
                    indices.extend(self.cells[cell_idx].iter().copied());
                }
            }
        }
        
        indices.into_iter().map(move |i| &sources[i])
    }
}

/// Compute displacement at a single pixel from all sources
fn compute_displacement(
    px: f64,
    py: f64,
    sources: &[LensingSource],
    grid: &SpatialGrid,
    config: &LensingConfig,
    width: usize,
    height: usize,
) -> (f64, f64) {
    let search_radius = config.max_displacement * 3.0;
    let mut total_dx = 0.0;
    let mut total_dy = 0.0;
    
    // Sum contributions from nearby sources
    for source in grid.get_nearby_sources(sources, px, py, search_radius) {
        let dx = source.x - px;
        let dy = source.y - py;
        let dist_sq = dx * dx + dy * dy;
        let dist = dist_sq.sqrt().max(1.0); // Avoid division by zero
        
        // Einstein radius for this source
        let einstein_r = config.einstein_radius_scale * (width.min(height) as f64) * source.mass.sqrt();
        
        // Lensing deflection using simplified gravitational lensing formula
        // θ = 4GM/(c²b) where b is impact parameter
        // We simplify to: deflection ∝ mass / distance^falloff
        let deflection_strength = config.strength 
            * config.mass_concentration 
            * source.mass 
            * einstein_r 
            / dist.powf(config.falloff_exponent);
        
        // Direction: toward the source
        let nx = dx / dist;
        let ny = dy / dist;
        
        // Clamp individual contribution
        let contribution = deflection_strength.min(config.max_displacement);
        
        total_dx += nx * contribution;
        total_dy += ny * contribution;
    }
    
    // Clamp total displacement
    let total_mag = (total_dx * total_dx + total_dy * total_dy).sqrt();
    if total_mag > config.max_displacement {
        let scale = config.max_displacement / total_mag;
        total_dx *= scale;
        total_dy *= scale;
    }
    
    (total_dx, total_dy)
}

/// Sample a single color channel with bilinear interpolation
fn sample_channel(
    buffer: &[(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    x: f64,
    y: f64,
    channel: usize,
) -> f64 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    
    let fx = x - x0 as f64;
    let fy = y - y0 as f64;
    
    let get_val = |px: i32, py: i32| -> f64 {
        if px < 0 || px >= width as i32 || py < 0 || py >= height as i32 {
            return 0.0;
        }
        let idx = py as usize * width + px as usize;
        match channel {
            0 => buffer[idx].0,
            1 => buffer[idx].1,
            2 => buffer[idx].2,
            _ => buffer[idx].3,
        }
    };
    
    let v00 = get_val(x0, y0);
    let v10 = get_val(x1, y0);
    let v01 = get_val(x0, y1);
    let v11 = get_val(x1, y1);
    
    let v0 = v00 * (1.0 - fx) + v10 * fx;
    let v1 = v01 * (1.0 - fx) + v11 * fx;
    
    v0 * (1.0 - fy) + v1 * fy
}

/// Bilinear sample of RGBA buffer
fn sample_bilinear(
    buffer: &[(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    x: f64,
    y: f64,
) -> (f64, f64, f64, f64) {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    
    let fx = x - x0 as f64;
    let fy = y - y0 as f64;
    
    let get_pixel = |px: i32, py: i32| -> (f64, f64, f64, f64) {
        if px < 0 || px >= width as i32 || py < 0 || py >= height as i32 {
            return (0.0, 0.0, 0.0, 0.0);
        }
        buffer[py as usize * width + px as usize]
    };
    
    let p00 = get_pixel(x0, y0);
    let p10 = get_pixel(x1, y0);
    let p01 = get_pixel(x0, y1);
    let p11 = get_pixel(x1, y1);
    
    let lerp = |a: f64, b: f64, t: f64| a * (1.0 - t) + b * t;
    
    let r0 = lerp(p00.0, p10.0, fx);
    let r1 = lerp(p01.0, p11.0, fx);
    let r = lerp(r0, r1, fy);
    
    let g0 = lerp(p00.1, p10.1, fx);
    let g1 = lerp(p01.1, p11.1, fx);
    let g = lerp(g0, g1, fy);
    
    let b0 = lerp(p00.2, p10.2, fx);
    let b1 = lerp(p01.2, p11.2, fx);
    let b = lerp(b0, b1, fy);
    
    let a0 = lerp(p00.3, p10.3, fx);
    let a1 = lerp(p01.3, p11.3, fx);
    let a = lerp(a0, a1, fy);
    
    (r, g, b, a)
}

/// Convert trajectory positions to lensing sources
pub fn trajectory_to_lensing_sources(
    positions: &[Vec<Vector3<f64>>],
    velocities: Option<&[Vec<f64>]>,
    width: usize,
    height: usize,
    subsample: usize,
) -> Vec<LensingSource> {
    // Compute bounds
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
    
    let margin = 0.1 * ((max_x - min_x).max(max_y - min_y));
    min_x -= margin;
    max_x += margin;
    min_y -= margin;
    max_y += margin;
    
    let world_width = (max_x - min_x).max(1e-10);
    let world_height = (max_y - min_y).max(1e-10);
    
    // Compute max velocity for normalization
    let max_velocity = velocities
        .map_or(1.0, |vels| {
            vels.iter()
                .flat_map(|v| v.iter())
                .copied()
                .fold(0.0, f64::max)
        })
        .max(1e-10);
    
    let subsample = subsample.max(1);
    let mut sources = Vec::new();
    
    for (body_idx, body_positions) in positions.iter().enumerate() {
        let body_velocities = velocities.map(|v| &v[body_idx]);
        let num_steps = body_positions.len();
        
        for (step, pos) in body_positions.iter().enumerate() {
            if step % subsample != 0 {
                continue;
            }
            
            // Convert to pixel coordinates
            let px = (pos.x - min_x) / world_width * width as f64;
            let py = (pos.y - min_y) / world_height * height as f64;
            
            // Get velocity
            let velocity = body_velocities
                .and_then(|v| v.get(step).copied())
                .unwrap_or(1.0) / max_velocity;
            
            // Mass decreases with age (older positions have less lensing effect)
            let age = step as f64 / num_steps.max(1) as f64;
            let mass = 1.0 - age * 0.5; // Start at 1.0, end at 0.5
            
            sources.push(LensingSource {
                x: px,
                y: py,
                mass,
                velocity,
                body_index: body_idx,
            });
        }
    }
    
    sources
}

/// Generate a distortion grid overlay for visualization
pub fn generate_grid_overlay(
    lensing_field: &LensingField,
    spacing: f64,
    opacity: f64,
    line_color: [f64; 3],
) -> Vec<(f64, f64, f64, f64)> {
    let width = lensing_field.width();
    let height = lensing_field.height();
    
    (0..width * height)
        .into_par_iter()
        .map(|idx| {
            let x = idx % width;
            let y = idx / width;
            
            // Get source coordinates (where this pixel's light came from)
            let (sx, sy) = lensing_field.get_source_coords(x, y);
            
            // Check if near a grid line
            let on_vertical = (sx % spacing).abs() < 1.0 || (spacing - sx % spacing).abs() < 1.0;
            let on_horizontal = (sy % spacing).abs() < 1.0 || (spacing - sy % spacing).abs() < 1.0;
            
            if on_vertical || on_horizontal {
                // Soften based on how close to exact grid line
                let dist_v = (sx % spacing).abs().min((spacing - sx % spacing).abs());
                let dist_h = (sy % spacing).abs().min((spacing - sy % spacing).abs());
                let dist = dist_v.min(dist_h);
                let alpha = opacity * (1.0 - dist).max(0.0);
                
                (line_color[0], line_color[1], line_color[2], alpha)
            } else {
                (0.0, 0.0, 0.0, 0.0)
            }
        })
        .collect()
}

/// Compute Einstein ring radii for each body's current position
/// Returns vector of (center_x, center_y, radius) for potential Einstein rings
pub fn compute_einstein_rings(
    positions: &[Vec<Vector3<f64>>],
    width: usize,
    height: usize,
    config: &LensingConfig,
) -> Vec<(f64, f64, f64)> {
    // Get final positions of each body
    let mut rings = Vec::new();
    
    // Compute bounds (same as trajectory_to_lensing_sources)
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
    
    let margin = 0.1 * ((max_x - min_x).max(max_y - min_y));
    min_x -= margin;
    max_x += margin;
    min_y -= margin;
    max_y += margin;
    
    let world_width = (max_x - min_x).max(1e-10);
    let world_height = (max_y - min_y).max(1e-10);
    
    for body in positions {
        if let Some(final_pos) = body.last() {
            let px = (final_pos.x - min_x) / world_width * width as f64;
            let py = (final_pos.y - min_y) / world_height * height as f64;
            
            // Einstein radius depends on mass and configuration
            let radius = config.einstein_radius_scale * (width.min(height) as f64) * config.strength;
            
            rings.push((px, py, radius));
        }
    }
    
    rings
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn create_simple_trajectory() -> Vec<Vec<Vector3<f64>>> {
        vec![
            vec![
                Vector3::new(0.0, 0.0, 0.0),
                Vector3::new(10.0, 0.0, 0.0),
                Vector3::new(20.0, 0.0, 0.0),
            ],
        ]
    }

    fn create_circular_trajectory(steps: usize, radius: f64) -> Vec<Vec<Vector3<f64>>> {
        let positions: Vec<Vector3<f64>> = (0..steps)
            .map(|i| {
                let angle = 2.0 * PI * i as f64 / steps as f64;
                Vector3::new(radius * angle.cos(), radius * angle.sin(), 0.0)
            })
            .collect();
        vec![positions]
    }

    #[test]
    fn test_lensing_config_defaults() {
        let config = LensingConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.max_displacement > 0.0);
        assert!(!config.show_grid);
    }

    #[test]
    fn test_lensing_config_presets() {
        let wakes = LensingConfig::gravitational_wakes();
        let invisible = LensingConfig::invisible_paths();
        let extreme = LensingConfig::extreme();
        
        // Extreme should be more dramatic
        assert!(extreme.strength > wakes.strength);
        assert!(wakes.strength > invisible.strength);
        
        // Extreme should allow more displacement
        assert!(extreme.max_displacement > wakes.max_displacement);
    }

    #[test]
    fn test_lensing_config_with_grid() {
        let config = LensingConfig::gravitational_wakes().with_grid();
        assert!(config.show_grid);
    }

    #[test]
    fn test_trajectory_to_lensing_sources() {
        let positions = create_simple_trajectory();
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        
        assert_eq!(sources.len(), 3);
        assert_eq!(sources[0].body_index, 0);
    }

    #[test]
    fn test_trajectory_to_lensing_sources_subsampling() {
        let positions = create_circular_trajectory(100, 10.0);
        
        let sources_full = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let sources_sub = trajectory_to_lensing_sources(&positions, None, 100, 100, 10);
        
        assert_eq!(sources_full.len(), 100);
        assert_eq!(sources_sub.len(), 10);
    }

    #[test]
    fn test_lensing_source_mass_decreases_with_age() {
        let positions = create_circular_trajectory(100, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        
        // First source should have higher mass than last
        assert!(sources.first().unwrap().mass > sources.last().unwrap().mass);
    }

    #[test]
    fn test_lensing_field_creation() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        assert_eq!(field.width(), 100);
        assert_eq!(field.height(), 100);
    }

    #[test]
    fn test_lensing_field_displacements() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        // Get displacement at center
        let (dx, dy) = field.get_displacement(50, 50);
        
        // Displacements should be finite
        assert!(dx.is_finite());
        assert!(dy.is_finite());
    }

    #[test]
    fn test_lensing_field_source_coords() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        let (sx, sy) = field.get_source_coords(50, 50);
        
        // Source coords should be reasonably close to original
        // (within max_displacement)
        assert!((sx - 50.0).abs() <= config.max_displacement);
        assert!((sy - 50.0).abs() <= config.max_displacement);
    }

    #[test]
    fn test_lensing_field_magnitude() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        // Magnitude should be non-negative
        let mag = field.get_magnitude(50, 50);
        assert!(mag >= 0.0);
    }

    #[test]
    fn test_chromatic_offsets() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        let offsets = field.get_chromatic_offsets(50, 50, 0.3);
        
        // Should return 3 offset pairs
        assert_eq!(offsets.len(), 3);
        
        // All offsets should be finite
        for (dx, dy) in &offsets {
            assert!(dx.is_finite());
            assert!(dy.is_finite());
        }
    }

    #[test]
    fn test_apply_distortion() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        // Create simple background
        let background: Vec<(f64, f64, f64, f64)> = (0..10000)
            .map(|i| {
                let x = (i % 100) as f64 / 100.0;
                let y = (i / 100) as f64 / 100.0;
                (x, y, 0.5, 1.0)
            })
            .collect();
        
        let distorted = field.apply_distortion(&background, &config);
        
        assert_eq!(distorted.len(), background.len());
        
        // Values should be in valid range
        for (r, g, b, a) in &distorted {
            assert!(*r >= 0.0 && *r <= 1.0);
            assert!(*g >= 0.0 && *g <= 1.0);
            assert!(*b >= 0.0 && *b <= 1.0);
            assert!(*a >= 0.0 && *a <= 1.0);
        }
    }

    #[test]
    fn test_sample_bilinear() {
        let buffer = vec![
            (0.0, 0.0, 0.0, 1.0), (1.0, 0.0, 0.0, 1.0),
            (0.0, 1.0, 0.0, 1.0), (1.0, 1.0, 0.0, 1.0),
        ];
        
        // Sample at center should be average
        let center = sample_bilinear(&buffer, 2, 2, 0.5, 0.5);
        assert!((center.0 - 0.5).abs() < 0.01);
        assert!((center.1 - 0.5).abs() < 0.01);
        
        // Sample at corner should match corner value
        let corner = sample_bilinear(&buffer, 2, 2, 0.0, 0.0);
        assert!((corner.0 - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_sample_bilinear_out_of_bounds() {
        let buffer = vec![(1.0, 1.0, 1.0, 1.0); 4];
        
        // Sample outside should return zeros (or be clamped)
        let outside = sample_bilinear(&buffer, 2, 2, -5.0, -5.0);
        assert!(outside.0 >= 0.0);
    }

    #[test]
    fn test_generate_grid_overlay() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        let grid = generate_grid_overlay(&field, 20.0, 0.5, [1.0, 1.0, 1.0]);
        
        assert_eq!(grid.len(), 10000);
        
        // Some pixels should have grid lines (non-zero alpha)
        let with_lines = grid.iter().filter(|p| p.3 > 0.0).count();
        assert!(with_lines > 0);
    }

    #[test]
    fn test_compute_einstein_rings() {
        let positions = create_circular_trajectory(50, 10.0);
        let config = LensingConfig::gravitational_wakes();
        
        let rings = compute_einstein_rings(&positions, 100, 100, &config);
        
        assert_eq!(rings.len(), 1); // One body = one ring
        
        let (cx, cy, radius) = rings[0];
        assert!(cx.is_finite());
        assert!(cy.is_finite());
        assert!(radius > 0.0);
    }

    #[test]
    fn test_spatial_grid_creation() {
        let sources = vec![
            LensingSource { x: 10.0, y: 10.0, mass: 1.0, velocity: 0.5, body_index: 0 },
            LensingSource { x: 50.0, y: 50.0, mass: 1.0, velocity: 0.5, body_index: 0 },
            LensingSource { x: 90.0, y: 90.0, mass: 1.0, velocity: 0.5, body_index: 0 },
        ];
        
        let grid = SpatialGrid::from_sources(&sources, 100, 100, 32);
        
        // Grid should have been created
        assert!(grid.cells_x > 0);
        assert!(grid.cells_y > 0);
    }

    #[test]
    fn test_lensing_near_source_vs_far() {
        let sources = vec![
            LensingSource { x: 50.0, y: 50.0, mass: 1.0, velocity: 0.5, body_index: 0 },
        ];
        let config = LensingConfig::gravitational_wakes();
        
        let field = LensingField::from_sources(&sources, 100, 100, &config);
        
        // Near source should have higher magnitude than far
        let near_mag = field.get_magnitude(51, 50);
        let far_mag = field.get_magnitude(0, 0);
        
        assert!(near_mag >= far_mag);
    }

    #[test]
    fn test_distortion_deterministic() {
        let positions = create_circular_trajectory(50, 10.0);
        let sources = trajectory_to_lensing_sources(&positions, None, 100, 100, 1);
        let config = LensingConfig::gravitational_wakes();
        
        let field1 = LensingField::from_sources(&sources, 100, 100, &config);
        let field2 = LensingField::from_sources(&sources, 100, 100, &config);
        
        // Same inputs should produce same outputs
        let (dx1, dy1) = field1.get_displacement(50, 50);
        let (dx2, dy2) = field2.get_displacement(50, 50);
        
        assert!((dx1 - dx2).abs() < 0.001);
        assert!((dy1 - dy2).abs() < 0.001);
    }
}

