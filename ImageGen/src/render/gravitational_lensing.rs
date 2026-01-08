//! Gravitational Lensing v2: Physics-Inspired Spacetime Visualization
//!
//! This module implements dramatic, museum-quality gravitational lensing effects
//! using a small number of massive sources for clearly visible distortion.
//!
//! # Design Philosophy
//!
//! Real gravitational lensing images (from Hubble) are beautiful because you see
//! clearly identifiable distortion patterns - Einstein rings, arced galaxies,
//! curved light paths. This module prioritizes **visible, dramatic effects** over
//! physically accurate but imperceptible simulations.
//!
//! # Styles
//!
//! - **Cosmic Lens**: 3 massive bodies create dramatic Einstein rings
//! - **Gravitational Wake**: Trajectory centroids create rippling patterns
//! - **Event Horizon**: Extreme distortion, almost surreal
//! - **Spacetime Fabric**: Grid overlay showing mathematical curvature

#![allow(clippy::unreadable_literal)]
#![allow(clippy::many_single_char_names)]
#![allow(dead_code)]

use rayon::prelude::*;
use nalgebra::Vector3;

// ============================================================================
// CONFIGURATION
// ============================================================================

/// Lensing style variants
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub enum LensingStyle {
    /// 3 massive bodies with Einstein rings (recommended default)
    #[default]
    CosmicLens,
    /// Trajectory centroids create rippling wake patterns
    GravitationalWake,
    /// Extreme distortion for maximum drama
    EventHorizon,
    /// Grid overlay showing spacetime curvature
    SpacetimeFabric,
}

impl LensingStyle {
    /// Parse style from string
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "cosmic-lens" | "cosmiclens" | "cosmic" => Self::CosmicLens,
            "gravitational-wake" | "wake" | "ripple" => Self::GravitationalWake,
            "event-horizon" | "eventhorizon" | "extreme" | "black-hole" => Self::EventHorizon,
            "spacetime-fabric" | "fabric" | "grid" | "spacetime" => Self::SpacetimeFabric,
            _ => Self::CosmicLens,
        }
    }
    
    /// Get display name
    pub fn name(&self) -> &'static str {
        match self {
            Self::CosmicLens => "Cosmic Lens",
            Self::GravitationalWake => "Gravitational Wake",
            Self::EventHorizon => "Event Horizon",
            Self::SpacetimeFabric => "Spacetime Fabric",
        }
    }
}

/// Configuration for gravitational lensing effect
#[derive(Clone, Debug)]
pub struct LensingConfig {
    /// Lensing style
    pub style: LensingStyle,
    
    /// Base mass for lensing sources (higher = more distortion)
    pub base_mass: f64,
    
    /// Mass multiplier (applied on top of base_mass)
    pub mass_multiplier: f64,
    
    /// Einstein radius scale factor
    pub einstein_scale: f64,
    
    /// Maximum displacement in pixels
    pub max_displacement: f64,
    
    /// Falloff exponent (higher = faster falloff with distance)
    pub falloff_exponent: f64,
    
    /// Whether to render Einstein rings
    pub show_einstein_rings: bool,
    
    /// Einstein ring brightness (0-1)
    pub ring_brightness: f64,
    
    /// Einstein ring thickness factor
    pub ring_thickness: f64,
    
    /// Whether to show accretion glow
    pub show_accretion_glow: bool,
    
    /// Accretion glow intensity
    pub accretion_intensity: f64,
    
    /// Whether to show grid overlay
    pub show_grid: bool,
    
    /// Grid spacing in pixels
    pub grid_spacing: f64,
    
    /// Grid line opacity
    pub grid_opacity: f64,
    
    /// Chromatic aberration strength (0 = none)
    pub chromatic_aberration: f64,
    
    /// Number of centroids for wake style
    pub wake_centroids: usize,
    
    /// Trajectory trail opacity (0 = invisible)
    pub trail_opacity: f64,
    
    /// Trail width in pixels
    pub trail_width: f64,
    
    /// Whether to compute at half resolution for performance
    pub half_resolution: bool,
}

impl Default for LensingConfig {
    fn default() -> Self {
        Self::cosmic_lens()
    }
}

impl LensingConfig {
    /// Cosmic Lens: 3 massive bodies with dramatic Einstein rings
    pub fn cosmic_lens() -> Self {
        Self {
            style: LensingStyle::CosmicLens,
            base_mass: 100_000.0,
            mass_multiplier: 1.0,
            einstein_scale: 0.15,
            max_displacement: 120.0,
            falloff_exponent: 1.0,
            show_einstein_rings: true,
            ring_brightness: 0.6,
            ring_thickness: 0.12,
            show_accretion_glow: false,
            accretion_intensity: 0.0,
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.3,
            chromatic_aberration: 0.15,
            wake_centroids: 3,
            trail_opacity: 0.15,
            trail_width: 1.0,
            half_resolution: true,
        }
    }
    
    /// Gravitational Wake: Trajectory creates rippling distortion
    pub fn gravitational_wake() -> Self {
        Self {
            style: LensingStyle::GravitationalWake,
            base_mass: 15_000.0,
            mass_multiplier: 1.0,
            einstein_scale: 0.08,
            max_displacement: 60.0,
            falloff_exponent: 1.2,
            show_einstein_rings: false,
            ring_brightness: 0.0,
            ring_thickness: 0.0,
            show_accretion_glow: false,
            accretion_intensity: 0.0,
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.3,
            chromatic_aberration: 0.08,
            wake_centroids: 40,
            trail_opacity: 0.25,
            trail_width: 1.2,
            half_resolution: true,
        }
    }
    
    /// Event Horizon: Extreme distortion, maximum drama
    pub fn event_horizon() -> Self {
        Self {
            style: LensingStyle::EventHorizon,
            base_mass: 400_000.0,
            mass_multiplier: 1.0,
            einstein_scale: 0.25,
            max_displacement: 250.0,
            falloff_exponent: 0.8,
            show_einstein_rings: true,
            ring_brightness: 0.9,
            ring_thickness: 0.15,
            show_accretion_glow: true,
            accretion_intensity: 0.4,
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.3,
            chromatic_aberration: 0.25,
            wake_centroids: 3,
            trail_opacity: 0.0,
            trail_width: 0.0,
            half_resolution: true,
        }
    }
    
    /// Spacetime Fabric: Grid overlay showing curvature
    pub fn spacetime_fabric() -> Self {
        Self {
            style: LensingStyle::SpacetimeFabric,
            base_mass: 80_000.0,
            mass_multiplier: 1.0,
            einstein_scale: 0.12,
            max_displacement: 100.0,
            falloff_exponent: 1.0,
            show_einstein_rings: false,
            ring_brightness: 0.0,
            ring_thickness: 0.0,
            show_accretion_glow: false,
            accretion_intensity: 0.0,
            show_grid: true,
            grid_spacing: 40.0,
            grid_opacity: 0.5,
            chromatic_aberration: 0.05,
            wake_centroids: 3,
            trail_opacity: 0.2,
            trail_width: 1.5,
            half_resolution: true,
        }
    }
    
    /// Create config from style enum
    pub fn from_style(style: LensingStyle) -> Self {
        match style {
            LensingStyle::CosmicLens => Self::cosmic_lens(),
            LensingStyle::GravitationalWake => Self::gravitational_wake(),
            LensingStyle::EventHorizon => Self::event_horizon(),
            LensingStyle::SpacetimeFabric => Self::spacetime_fabric(),
        }
    }
    
    /// Apply custom mass multiplier
    #[must_use]
    pub fn with_strength(mut self, multiplier: f64) -> Self {
        self.mass_multiplier = multiplier;
        self
    }
    
    /// Enable/disable grid overlay
    #[must_use]
    pub fn with_grid(mut self, enabled: bool) -> Self {
        self.show_grid = enabled;
        self
    }
}

// ============================================================================
// MASS SOURCES
// ============================================================================

/// A gravitational lensing mass source
#[derive(Clone, Debug)]
pub struct MassSource {
    /// Position in pixel coordinates
    pub x: f64,
    pub y: f64,
    
    /// Effective mass (determines lensing strength)
    pub mass: f64,
    
    /// Body index (0, 1, or 2) for coloring
    pub body_index: usize,
    
    /// Velocity magnitude (normalized 0-1)
    pub velocity: f64,
}

/// Create mass sources from trajectory positions
/// 
/// For CosmicLens/EventHorizon: Uses only current (final) body positions
/// For GravitationalWake: Uses aggregated centroids along trajectory
pub fn create_mass_sources(
    positions: &[Vec<Vector3<f64>>],
    config: &LensingConfig,
    width: usize,
    height: usize,
) -> Vec<MassSource> {
    // Compute world bounds
    let (min_x, max_x, min_y, max_y) = compute_bounds(positions);
    let margin = 0.1 * ((max_x - min_x).max(max_y - min_y));
    let world_bounds = WorldBounds {
        min_x: min_x - margin,
        max_x: max_x + margin,
        min_y: min_y - margin,
        max_y: max_y + margin,
    };
    
    match config.style {
        LensingStyle::CosmicLens | LensingStyle::EventHorizon | LensingStyle::SpacetimeFabric => {
            create_body_sources(positions, config, width, height, &world_bounds)
        }
        LensingStyle::GravitationalWake => {
            create_centroid_sources(positions, config, width, height, &world_bounds)
        }
    }
}

/// World coordinate bounds
struct WorldBounds {
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
}

impl WorldBounds {
    fn width(&self) -> f64 {
        (self.max_x - self.min_x).max(1e-10)
    }
    
    fn height(&self) -> f64 {
        (self.max_y - self.min_y).max(1e-10)
    }
    
    fn to_pixel(&self, world_x: f64, world_y: f64, img_width: usize, img_height: usize) -> (f64, f64) {
        let px = (world_x - self.min_x) / self.width() * img_width as f64;
        let py = (world_y - self.min_y) / self.height() * img_height as f64;
        (px, py)
    }
}

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
    
    (min_x, max_x, min_y, max_y)
}

/// Create sources from final body positions only (3 sources)
fn create_body_sources(
    positions: &[Vec<Vector3<f64>>],
    config: &LensingConfig,
    width: usize,
    height: usize,
    bounds: &WorldBounds,
) -> Vec<MassSource> {
    let effective_mass = config.base_mass * config.mass_multiplier;
    
    positions.iter().enumerate().filter_map(|(body_idx, body_pos)| {
        body_pos.last().map(|final_pos| {
            let (px, py) = bounds.to_pixel(final_pos.x, final_pos.y, width, height);
            
            // Vary mass slightly by body for visual interest
            let mass_variation = 1.0 + (body_idx as f64 - 1.0) * 0.1;
            
            MassSource {
                x: px,
                y: py,
                mass: effective_mass * mass_variation,
                body_index: body_idx,
                velocity: 1.0,
            }
        })
    }).collect()
}

/// Create sources from trajectory centroids (30-50 sources)
fn create_centroid_sources(
    positions: &[Vec<Vector3<f64>>],
    config: &LensingConfig,
    width: usize,
    height: usize,
    bounds: &WorldBounds,
) -> Vec<MassSource> {
    let num_centroids = config.wake_centroids;
    let effective_mass = config.base_mass * config.mass_multiplier;
    let mut sources = Vec::with_capacity(num_centroids * positions.len());
    
    for (body_idx, body_pos) in positions.iter().enumerate() {
        if body_pos.is_empty() {
            continue;
        }
        
        let segment_size = (body_pos.len() / num_centroids).max(1);
        
        for segment_idx in 0..num_centroids {
            let start = segment_idx * segment_size;
            let end = ((segment_idx + 1) * segment_size).min(body_pos.len());
            
            if start >= end {
                continue;
            }
            
            // Compute centroid of segment
            let mut sum_x = 0.0;
            let mut sum_y = 0.0;
            let count = (end - start) as f64;
            
            for pos in &body_pos[start..end] {
                sum_x += pos.x;
                sum_y += pos.y;
            }
            
            let centroid_x = sum_x / count;
            let centroid_y = sum_y / count;
            let (px, py) = bounds.to_pixel(centroid_x, centroid_y, width, height);
            
            // Mass decreases for older segments (creates trailing effect)
            let age = segment_idx as f64 / num_centroids as f64;
            let mass = effective_mass * (1.0 - age * 0.6);
            
            sources.push(MassSource {
                x: px,
                y: py,
                mass,
                body_index: body_idx,
                velocity: 1.0 - age * 0.5,
            });
        }
    }
    
    sources
}

// ============================================================================
// DISPLACEMENT FIELD
// ============================================================================

/// Precomputed displacement field for efficient distortion
pub struct DisplacementField {
    width: usize,
    height: usize,
    /// Displacement vectors (dx, dy) for each pixel
    displacements: Vec<(f64, f64)>,
    /// Distortion magnitude at each pixel
    magnitudes: Vec<f64>,
    /// Whether this was computed at half resolution
    is_half_res: bool,
    /// Original full resolution dimensions
    full_width: usize,
    full_height: usize,
}

impl DisplacementField {
    /// Compute displacement field from mass sources
    pub fn compute(
        sources: &[MassSource],
        width: usize,
        height: usize,
        config: &LensingConfig,
    ) -> Self {
        let (compute_width, compute_height, is_half_res) = if config.half_resolution {
            (width / 2, height / 2, true)
        } else {
            (width, height, false)
        };
        
        let size = compute_width * compute_height;
        
        // Compute displacement field in parallel
        let displacements: Vec<(f64, f64)> = (0..size)
            .into_par_iter()
            .map(|idx| {
                let x = (idx % compute_width) as f64 + 0.5;
                let y = (idx / compute_width) as f64 + 0.5;
                
                // Scale coordinates if computing at half res
                let (sx, sy) = if is_half_res {
                    (x * 2.0, y * 2.0)
                } else {
                    (x, y)
                };
                
                compute_pixel_displacement(sx, sy, sources, config, width, height)
            })
            .collect();
        
        // Compute magnitudes for visualization
        let magnitudes: Vec<f64> = displacements
            .par_iter()
            .map(|(dx, dy)| (dx * dx + dy * dy).sqrt())
            .collect();
        
        Self {
            width: compute_width,
            height: compute_height,
            displacements,
            magnitudes,
            is_half_res,
            full_width: width,
            full_height: height,
        }
    }
    
    /// Get source coordinates for a destination pixel (with upscaling if needed)
    pub fn get_source_coords(&self, x: usize, y: usize) -> (f64, f64) {
        if self.is_half_res {
            // Bilinear interpolation from half-res field
            let fx = x as f64 / 2.0;
            let fy = y as f64 / 2.0;
            let (dx, dy) = self.sample_bilinear(fx, fy);
            (x as f64 + dx, y as f64 + dy)
        } else {
            let idx = y * self.width + x;
            let (dx, dy) = self.displacements[idx];
            (x as f64 + dx, y as f64 + dy)
        }
    }
    
    /// Get displacement at pixel (with upscaling if needed)
    pub fn get_displacement(&self, x: usize, y: usize) -> (f64, f64) {
        if self.is_half_res {
            let fx = x as f64 / 2.0;
            let fy = y as f64 / 2.0;
            self.sample_bilinear(fx, fy)
        } else {
            let idx = y * self.width + x;
            self.displacements[idx]
        }
    }
    
    /// Get distortion magnitude at pixel
    pub fn get_magnitude(&self, x: usize, y: usize) -> f64 {
        if self.is_half_res {
            let fx = x as f64 / 2.0;
            let fy = y as f64 / 2.0;
            self.sample_magnitude_bilinear(fx, fy)
        } else {
            let idx = y * self.width + x;
            self.magnitudes[idx]
        }
    }
    
    /// Bilinear sample of displacement field
    fn sample_bilinear(&self, x: f64, y: f64) -> (f64, f64) {
        let x0 = (x.floor() as usize).min(self.width.saturating_sub(1));
        let y0 = (y.floor() as usize).min(self.height.saturating_sub(1));
        let x1 = (x0 + 1).min(self.width.saturating_sub(1));
        let y1 = (y0 + 1).min(self.height.saturating_sub(1));
        
        let fx = x - x.floor();
        let fy = y - y.floor();
        
        let d00 = self.displacements[y0 * self.width + x0];
        let d10 = self.displacements[y0 * self.width + x1];
        let d01 = self.displacements[y1 * self.width + x0];
        let d11 = self.displacements[y1 * self.width + x1];
        
        let dx = lerp(lerp(d00.0, d10.0, fx), lerp(d01.0, d11.0, fx), fy);
        let dy = lerp(lerp(d00.1, d10.1, fx), lerp(d01.1, d11.1, fx), fy);
        
        (dx, dy)
    }
    
    /// Bilinear sample of magnitude field
    fn sample_magnitude_bilinear(&self, x: f64, y: f64) -> f64 {
        let x0 = (x.floor() as usize).min(self.width.saturating_sub(1));
        let y0 = (y.floor() as usize).min(self.height.saturating_sub(1));
        let x1 = (x0 + 1).min(self.width.saturating_sub(1));
        let y1 = (y0 + 1).min(self.height.saturating_sub(1));
        
        let fx = x - x.floor();
        let fy = y - y.floor();
        
        let m00 = self.magnitudes[y0 * self.width + x0];
        let m10 = self.magnitudes[y0 * self.width + x1];
        let m01 = self.magnitudes[y1 * self.width + x0];
        let m11 = self.magnitudes[y1 * self.width + x1];
        
        lerp(lerp(m00, m10, fx), lerp(m01, m11, fx), fy)
    }
    
    /// Get max distortion magnitude
    pub fn max_magnitude(&self) -> f64 {
        self.magnitudes.iter().copied().fold(0.0, f64::max)
    }
    
    /// Get average distortion magnitude
    pub fn avg_magnitude(&self) -> f64 {
        if self.magnitudes.is_empty() {
            0.0
        } else {
            self.magnitudes.iter().sum::<f64>() / self.magnitudes.len() as f64
        }
    }
    
    /// Get full resolution width
    pub fn full_width(&self) -> usize {
        self.full_width
    }
    
    /// Get full resolution height
    pub fn full_height(&self) -> usize {
        self.full_height
    }
}

#[inline]
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a * (1.0 - t) + b * t
}

/// Compute displacement for a single pixel
fn compute_pixel_displacement(
    px: f64,
    py: f64,
    sources: &[MassSource],
    config: &LensingConfig,
    width: usize,
    height: usize,
) -> (f64, f64) {
    let mut total_dx = 0.0;
    let mut total_dy = 0.0;
    
    let dim_scale = (width.min(height) as f64).max(1.0);
    
    for source in sources {
        let dx = source.x - px;
        let dy = source.y - py;
        let dist_sq = dx * dx + dy * dy;
        let dist = dist_sq.sqrt().max(1.0);
        
        // Einstein radius based on mass
        let einstein_r = config.einstein_scale * dim_scale * (source.mass / 100_000.0).sqrt();
        
        // Gravitational lensing formula: deflection ∝ mass / distance^falloff
        let deflection = source.mass * einstein_r / (dist.powf(config.falloff_exponent) + einstein_r);
        
        // Direction toward source
        let nx = dx / dist;
        let ny = dy / dist;
        
        // Clamp individual contribution
        let contribution = deflection.min(config.max_displacement * 0.5);
        
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

// ============================================================================
// DISTORTION APPLICATION
// ============================================================================

/// Apply lensing distortion to a background image
pub fn apply_distortion(
    background: &[(f64, f64, f64, f64)],
    field: &DisplacementField,
    config: &LensingConfig,
) -> Vec<(f64, f64, f64, f64)> {
    let width = field.full_width();
    let height = field.full_height();
    
    (0..width * height)
        .into_par_iter()
        .map(|idx| {
            let x = idx % width;
            let y = idx / width;
            
            if config.chromatic_aberration > 0.0 {
                // Chromatic aberration: sample each channel with different offsets
                let (dx, dy) = field.get_displacement(x, y);
                let mag = (dx * dx + dy * dy).sqrt();
                
                if mag > 0.1 {
                    let nx = dx / mag;
                    let ny = dy / mag;
                    let perpx = -ny;
                    let perpy = nx;
                    let chroma_offset = mag * config.chromatic_aberration * 0.3;
                    
                    // Red: outer, Green: center, Blue: inner
                    let r = sample_channel(background, width, height,
                        x as f64 + dx + perpx * chroma_offset,
                        y as f64 + dy + perpy * chroma_offset, 0);
                    let g = sample_channel(background, width, height,
                        x as f64 + dx, y as f64 + dy, 1);
                    let b = sample_channel(background, width, height,
                        x as f64 + dx - perpx * chroma_offset,
                        y as f64 + dy - perpy * chroma_offset, 2);
                    
                    (r, g, b, 1.0)
                } else {
                    let (sx, sy) = field.get_source_coords(x, y);
                    sample_bilinear(background, width, height, sx, sy)
                }
            } else {
                let (sx, sy) = field.get_source_coords(x, y);
                sample_bilinear(background, width, height, sx, sy)
            }
        })
        .collect()
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
    let x = x.clamp(0.0, (width - 1) as f64);
    let y = y.clamp(0.0, (height - 1) as f64);
    
    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);
    
    let fx = x - x.floor();
    let fy = y - y.floor();
    
    let get_val = |px: usize, py: usize| -> f64 {
        let idx = py * width + px;
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
    
    lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy)
}

/// Bilinear sample of RGBA buffer
fn sample_bilinear(
    buffer: &[(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    x: f64,
    y: f64,
) -> (f64, f64, f64, f64) {
    let x = x.clamp(0.0, (width - 1) as f64);
    let y = y.clamp(0.0, (height - 1) as f64);
    
    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;
    let x1 = (x0 + 1).min(width - 1);
    let y1 = (y0 + 1).min(height - 1);
    
    let fx = x - x.floor();
    let fy = y - y.floor();
    
    let p00 = buffer[y0 * width + x0];
    let p10 = buffer[y0 * width + x1];
    let p01 = buffer[y1 * width + x0];
    let p11 = buffer[y1 * width + x1];
    
    (
        lerp(lerp(p00.0, p10.0, fx), lerp(p01.0, p11.0, fx), fy),
        lerp(lerp(p00.1, p10.1, fx), lerp(p01.1, p11.1, fx), fy),
        lerp(lerp(p00.2, p10.2, fx), lerp(p01.2, p11.2, fx), fy),
        lerp(lerp(p00.3, p10.3, fx), lerp(p01.3, p11.3, fx), fy),
    )
}

// ============================================================================
// EINSTEIN RINGS & ACCRETION GLOW
// ============================================================================

/// Render Einstein rings around mass sources
pub fn render_einstein_rings(
    buffer: &mut [(f64, f64, f64, f64)],
    sources: &[MassSource],
    width: usize,
    height: usize,
    config: &LensingConfig,
    accent_color: [f64; 3],
) {
    if !config.show_einstein_rings || config.ring_brightness <= 0.0 {
        return;
    }
    
    let dim_scale = (width.min(height) as f64).max(1.0);
    
    for source in sources {
        // Einstein radius
        let radius = config.einstein_scale * dim_scale * (source.mass / 100_000.0).sqrt();
        let thickness = radius * config.ring_thickness;
        let outer_radius = radius + thickness;
        let inner_radius = (radius - thickness).max(0.0);
        
        // Bounding box for this ring
        let min_x = (source.x - outer_radius - 2.0).max(0.0) as usize;
        let max_x = ((source.x + outer_radius + 2.0) as usize).min(width - 1);
        let min_y = (source.y - outer_radius - 2.0).max(0.0) as usize;
        let max_y = ((source.y + outer_radius + 2.0) as usize).min(height - 1);
        
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let dx = x as f64 - source.x;
                let dy = y as f64 - source.y;
                let dist = (dx * dx + dy * dy).sqrt();
                
                // Check if within ring
                if dist >= inner_radius && dist <= outer_radius {
                    // Smooth falloff at edges
                    let ring_center = (inner_radius + outer_radius) / 2.0;
                    let dist_from_center = (dist - ring_center).abs();
                    let half_thickness = (outer_radius - inner_radius) / 2.0;
                    let alpha = 1.0 - (dist_from_center / half_thickness).clamp(0.0, 1.0);
                    let alpha = alpha * alpha; // Smooth falloff
                    
                    let brightness = config.ring_brightness * alpha;
                    
                    // Vary color slightly by angle for visual interest
                    let angle = dy.atan2(dx);
                    let color_shift = (angle * 2.0).sin() * 0.1 + 1.0;
                    
                    let idx = y * width + x;
                    buffer[idx].0 = (buffer[idx].0 + accent_color[0] * brightness * color_shift).min(1.0);
                    buffer[idx].1 = (buffer[idx].1 + accent_color[1] * brightness).min(1.0);
                    buffer[idx].2 = (buffer[idx].2 + accent_color[2] * brightness * (2.0 - color_shift)).min(1.0);
                }
            }
        }
    }
}

/// Render accretion glow (hot matter falling into black holes)
pub fn render_accretion_glow(
    buffer: &mut [(f64, f64, f64, f64)],
    sources: &[MassSource],
    width: usize,
    height: usize,
    config: &LensingConfig,
    primary_color: [f64; 3],
) {
    if !config.show_accretion_glow || config.accretion_intensity <= 0.0 {
        return;
    }
    
    let dim_scale = (width.min(height) as f64).max(1.0);
    
    for source in sources {
        let radius = config.einstein_scale * dim_scale * (source.mass / 100_000.0).sqrt() * 0.5;
        let outer_radius = radius * 3.0;
        
        let min_x = (source.x - outer_radius).max(0.0) as usize;
        let max_x = ((source.x + outer_radius) as usize).min(width - 1);
        let min_y = (source.y - outer_radius).max(0.0) as usize;
        let max_y = ((source.y + outer_radius) as usize).min(height - 1);
        
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let dx = x as f64 - source.x;
                let dy = y as f64 - source.y;
                let dist = (dx * dx + dy * dy).sqrt();
                
                if dist < outer_radius && dist > radius * 0.3 {
                    // Accretion disk-like falloff
                    let normalized_dist = dist / outer_radius;
                    let falloff = (1.0 - normalized_dist).max(0.0).powf(1.5);
                    
                    // Doppler-like color shift based on angle
                    let angle = dy.atan2(dx);
                    let doppler = (angle).sin() * 0.3 + 0.7;
                    
                    let intensity = config.accretion_intensity * falloff;
                    
                    // Hot orange/red glow
                    let idx = y * width + x;
                    buffer[idx].0 = (buffer[idx].0 + primary_color[0] * intensity * doppler * 1.2).min(1.0);
                    buffer[idx].1 = (buffer[idx].1 + primary_color[1] * intensity * 0.7).min(1.0);
                    buffer[idx].2 = (buffer[idx].2 + primary_color[2] * intensity * 0.3).min(1.0);
                }
            }
        }
    }
}

// ============================================================================
// GRID OVERLAY
// ============================================================================

/// Render a distorted grid overlay to show spacetime curvature
pub fn render_grid_overlay(
    buffer: &mut [(f64, f64, f64, f64)],
    field: &DisplacementField,
    width: usize,
    _height: usize,
    spacing: f64,
    opacity: f64,
    color: [f64; 3],
) {
    buffer.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let x = idx % width;
        let y = idx / width;
        
        // Get source coordinates (where this pixel's light came from)
        let (sx, sy) = field.get_source_coords(x, y);
        
        // Check if near a grid line
        let line_width = 1.5;
        let near_vertical = (sx % spacing).abs() < line_width || (spacing - sx % spacing).abs() < line_width;
        let near_horizontal = (sy % spacing).abs() < line_width || (spacing - sy % spacing).abs() < line_width;
        
        if near_vertical || near_horizontal {
            // Compute distance to nearest grid line for anti-aliasing
            let dist_v = (sx % spacing).abs().min((spacing - sx % spacing).abs());
            let dist_h = (sy % spacing).abs().min((spacing - sy % spacing).abs());
            let dist = dist_v.min(dist_h);
            let alpha = opacity * (1.0 - dist / line_width).max(0.0);
            
            pixel.0 = lerp(pixel.0, color[0], alpha);
            pixel.1 = lerp(pixel.1, color[1], alpha);
            pixel.2 = lerp(pixel.2, color[2], alpha);
        }
    });
}

// ============================================================================
// TRAJECTORY TRAILS
// ============================================================================

/// Render faint trajectory trails
pub fn render_trajectory_trails(
    buffer: &mut [(f64, f64, f64, f64)],
    positions: &[Vec<Vector3<f64>>],
    width: usize,
    height: usize,
    config: &LensingConfig,
    colors: &[[f64; 3]; 3],
) {
    if config.trail_opacity <= 0.0 {
        return;
    }
    
    let (min_x, max_x, min_y, max_y) = compute_bounds(positions);
    let margin = 0.1 * ((max_x - min_x).max(max_y - min_y));
    let bounds = WorldBounds {
        min_x: min_x - margin,
        max_x: max_x + margin,
        min_y: min_y - margin,
        max_y: max_y + margin,
    };
    
    // Subsample trajectory for performance
    let subsample = (positions[0].len() / 5000).max(1);
    
    for (body_idx, body_pos) in positions.iter().enumerate() {
        let color = colors[body_idx % 3];
        
        for (step, pos) in body_pos.iter().enumerate() {
            if step % subsample != 0 {
                continue;
            }
            
            let (px, py) = bounds.to_pixel(pos.x, pos.y, width, height);
            
            // Age-based fade
            let age = step as f64 / body_pos.len() as f64;
            let opacity = config.trail_opacity * (1.0 - age * 0.7);
            
            draw_soft_point(buffer, width, height, px, py, config.trail_width, opacity, &color);
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
    let sigma = size.max(0.5);
    let radius = (sigma * 2.5).ceil() as i32;
    
    let icx = cx.floor() as i32;
    let icy = cy.floor() as i32;
    let frac_x = cx - icx as f64;
    let frac_y = cy - icy as f64;
    
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let px = icx + dx;
            let py = icy + dy;
            
            if px < 0 || px >= width as i32 || py < 0 || py >= height as i32 {
                continue;
            }
            
            let dist_sq = (dx as f64 - frac_x).powi(2) + (dy as f64 - frac_y).powi(2);
            let weight = (-dist_sq / (2.0 * sigma * sigma)).exp();
            
            if weight < 0.01 {
                continue;
            }
            
            let idx = py as usize * width + px as usize;
            let contribution = brightness * weight;
            
            buffer[idx].0 = (buffer[idx].0 + color[0] * contribution).min(1.0);
            buffer[idx].1 = (buffer[idx].1 + color[1] * contribution).min(1.0);
            buffer[idx].2 = (buffer[idx].2 + color[2] * contribution).min(1.0);
        }
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    // ---- LensingStyle tests ----
    
    #[test]
    fn test_lensing_style_from_str() {
        assert_eq!(LensingStyle::from_str("cosmic-lens"), LensingStyle::CosmicLens);
        assert_eq!(LensingStyle::from_str("cosmic"), LensingStyle::CosmicLens);
        assert_eq!(LensingStyle::from_str("COSMIC"), LensingStyle::CosmicLens);
        assert_eq!(LensingStyle::from_str("gravitational-wake"), LensingStyle::GravitationalWake);
        assert_eq!(LensingStyle::from_str("wake"), LensingStyle::GravitationalWake);
        assert_eq!(LensingStyle::from_str("event-horizon"), LensingStyle::EventHorizon);
        assert_eq!(LensingStyle::from_str("extreme"), LensingStyle::EventHorizon);
        assert_eq!(LensingStyle::from_str("black-hole"), LensingStyle::EventHorizon);
        assert_eq!(LensingStyle::from_str("spacetime-fabric"), LensingStyle::SpacetimeFabric);
        assert_eq!(LensingStyle::from_str("fabric"), LensingStyle::SpacetimeFabric);
        assert_eq!(LensingStyle::from_str("grid"), LensingStyle::SpacetimeFabric);
        assert_eq!(LensingStyle::from_str("unknown"), LensingStyle::CosmicLens); // Default
    }
    
    #[test]
    fn test_lensing_style_name() {
        assert_eq!(LensingStyle::CosmicLens.name(), "Cosmic Lens");
        assert_eq!(LensingStyle::GravitationalWake.name(), "Gravitational Wake");
        assert_eq!(LensingStyle::EventHorizon.name(), "Event Horizon");
        assert_eq!(LensingStyle::SpacetimeFabric.name(), "Spacetime Fabric");
    }
    
    #[test]
    fn test_lensing_style_default() {
        assert_eq!(LensingStyle::default(), LensingStyle::CosmicLens);
    }

    // ---- LensingConfig tests ----
    
    #[test]
    fn test_lensing_config_cosmic_lens() {
        let config = LensingConfig::cosmic_lens();
        assert_eq!(config.style, LensingStyle::CosmicLens);
        assert!(config.base_mass > 50000.0);
        assert!(config.show_einstein_rings);
        assert!(!config.show_grid);
    }
    
    #[test]
    fn test_lensing_config_gravitational_wake() {
        let config = LensingConfig::gravitational_wake();
        assert_eq!(config.style, LensingStyle::GravitationalWake);
        assert!(config.wake_centroids > 10);
        assert!(!config.show_einstein_rings);
    }
    
    #[test]
    fn test_lensing_config_event_horizon() {
        let config = LensingConfig::event_horizon();
        assert_eq!(config.style, LensingStyle::EventHorizon);
        assert!(config.base_mass > 200000.0);
        assert!(config.show_einstein_rings);
        assert!(config.show_accretion_glow);
    }
    
    #[test]
    fn test_lensing_config_spacetime_fabric() {
        let config = LensingConfig::spacetime_fabric();
        assert_eq!(config.style, LensingStyle::SpacetimeFabric);
        assert!(config.show_grid);
        assert!(!config.show_einstein_rings);
    }
    
    #[test]
    fn test_lensing_config_from_style() {
        let cosmic = LensingConfig::from_style(LensingStyle::CosmicLens);
        assert_eq!(cosmic.style, LensingStyle::CosmicLens);
        
        let wake = LensingConfig::from_style(LensingStyle::GravitationalWake);
        assert_eq!(wake.style, LensingStyle::GravitationalWake);
    }
    
    #[test]
    fn test_lensing_config_with_strength() {
        let config = LensingConfig::cosmic_lens().with_strength(2.0);
        assert!((config.mass_multiplier - 2.0).abs() < 0.001);
    }
    
    #[test]
    fn test_lensing_config_with_grid() {
        let config = LensingConfig::cosmic_lens().with_grid(true);
        assert!(config.show_grid);
    }
    
    #[test]
    fn test_lensing_config_default() {
        let config = LensingConfig::default();
        assert_eq!(config.style, LensingStyle::CosmicLens);
    }

    // ---- Mass source creation tests ----
    
    fn create_test_trajectory() -> Vec<Vec<Vector3<f64>>> {
        vec![
            (0..100).map(|i| {
                let t = i as f64 / 100.0 * 2.0 * PI;
                Vector3::new(100.0 * t.cos(), 100.0 * t.sin(), 0.0)
            }).collect(),
            (0..100).map(|i| {
                let t = i as f64 / 100.0 * 2.0 * PI;
                Vector3::new(-50.0 * t.cos(), 50.0 * t.sin(), 0.0)
            }).collect(),
            (0..100).map(|i| {
                let t = i as f64 / 100.0 * 2.0 * PI;
                Vector3::new(30.0 * (t + PI).cos(), 30.0 * (t + PI).sin(), 0.0)
            }).collect(),
        ]
    }
    
    #[test]
    fn test_create_mass_sources_cosmic_lens() {
        let positions = create_test_trajectory();
        let config = LensingConfig::cosmic_lens();
        let sources = create_mass_sources(&positions, &config, 1920, 1080);
        
        // Cosmic lens should create exactly 3 sources (one per body)
        assert_eq!(sources.len(), 3);
        
        // Each source should have high mass
        for source in &sources {
            assert!(source.mass > 50000.0);
        }
    }
    
    #[test]
    fn test_create_mass_sources_gravitational_wake() {
        let positions = create_test_trajectory();
        let config = LensingConfig::gravitational_wake();
        let sources = create_mass_sources(&positions, &config, 1920, 1080);
        
        // Wake should create multiple sources per body (centroids)
        assert!(sources.len() > 3);
        assert!(sources.len() <= 3 * config.wake_centroids);
    }
    
    #[test]
    fn test_create_mass_sources_event_horizon() {
        let positions = create_test_trajectory();
        let config = LensingConfig::event_horizon();
        let sources = create_mass_sources(&positions, &config, 1920, 1080);
        
        // Event horizon uses body positions like cosmic lens
        assert_eq!(sources.len(), 3);
        
        // But with much higher mass
        for source in &sources {
            assert!(source.mass > 300000.0);
        }
    }
    
    #[test]
    fn test_mass_source_body_indices() {
        let positions = create_test_trajectory();
        let config = LensingConfig::cosmic_lens();
        let sources = create_mass_sources(&positions, &config, 1920, 1080);
        
        let indices: Vec<usize> = sources.iter().map(|s| s.body_index).collect();
        assert!(indices.contains(&0));
        assert!(indices.contains(&1));
        assert!(indices.contains(&2));
    }

    // ---- Displacement field tests ----
    
    #[test]
    fn test_displacement_field_creation() {
        let sources = vec![
            MassSource { x: 500.0, y: 500.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::cosmic_lens();
        
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        assert!(field.max_magnitude() > 0.0);
        assert!(field.avg_magnitude() > 0.0);
    }
    
    #[test]
    fn test_displacement_field_half_resolution() {
        let sources = vec![
            MassSource { x: 500.0, y: 500.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let mut config = LensingConfig::cosmic_lens();
        config.half_resolution = true;
        
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        // Should still return full resolution coords
        assert_eq!(field.full_width(), 100);
        assert_eq!(field.full_height(), 100);
    }
    
    #[test]
    fn test_displacement_field_no_sources() {
        let sources: Vec<MassSource> = vec![];
        let config = LensingConfig::cosmic_lens();
        
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        // No sources = no displacement
        assert!(field.max_magnitude() < 0.001);
    }
    
    #[test]
    fn test_displacement_stronger_near_source() {
        // Use much smaller mass to avoid clamping entirely
        let sources = vec![
            MassSource { x: 250.0, y: 250.0, mass: 100.0, body_index: 0, velocity: 1.0 },
        ];
        let mut config = LensingConfig::cosmic_lens();
        config.half_resolution = false;
        config.max_displacement = 10000.0; // Very high limit to avoid any clamping
        config.einstein_scale = 0.01; // Smaller scale for more controllable values
        
        let field = DisplacementField::compute(&sources, 500, 500, &config);
        
        // Displacement should be stronger near the source (260 is closer than 450)
        let near_mag = field.get_magnitude(260, 250); // 10 pixels away
        let far_mag = field.get_magnitude(450, 250);  // 200 pixels away
        
        assert!(near_mag > far_mag, 
            "Near magnitude ({}) should be greater than far magnitude ({})", 
            near_mag, far_mag);
    }
    
    #[test]
    fn test_displacement_points_toward_source() {
        // Use moderate mass for clearer direction testing
        let sources = vec![
            MassSource { x: 250.0, y: 250.0, mass: 10000.0, body_index: 0, velocity: 1.0 },
        ];
        let mut config = LensingConfig::cosmic_lens();
        config.half_resolution = false;
        
        let field = DisplacementField::compute(&sources, 500, 500, &config);
        
        // Pixel to the right of source (x=300) should be displaced toward source (negative dx means leftward)
        // Wait - the direction is: dx = source.x - px = 250 - 300 = -50
        // So the direction vector points LEFT (toward source), and that's what gets added to displacement
        let (dx, _dy) = field.get_displacement(300, 250);
        assert!(dx < 0.0, "Displacement should point toward source (leftward), got dx={}", dx);
    }

    // ---- Distortion tests ----
    
    #[test]
    fn test_apply_distortion_preserves_dimensions() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 50000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::cosmic_lens();
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let background: Vec<(f64, f64, f64, f64)> = (0..10000)
            .map(|i| ((i % 100) as f64 / 100.0, 0.5, 0.5, 1.0))
            .collect();
        
        let distorted = apply_distortion(&background, &field, &config);
        
        assert_eq!(distorted.len(), background.len());
    }
    
    #[test]
    fn test_apply_distortion_values_in_range() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::cosmic_lens();
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let background: Vec<(f64, f64, f64, f64)> = vec![(0.5, 0.5, 0.5, 1.0); 10000];
        
        let distorted = apply_distortion(&background, &field, &config);
        
        for pixel in &distorted {
            assert!(pixel.0 >= 0.0 && pixel.0 <= 1.0);
            assert!(pixel.1 >= 0.0 && pixel.1 <= 1.0);
            assert!(pixel.2 >= 0.0 && pixel.2 <= 1.0);
            assert!(pixel.3 >= 0.0 && pixel.3 <= 1.0);
        }
    }

    // ---- Einstein ring tests ----
    
    #[test]
    fn test_render_einstein_rings_adds_brightness() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::cosmic_lens();
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        render_einstein_rings(&mut buffer, &sources, 100, 100, &config, [0.5, 0.8, 1.0]);
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness, "Einstein rings should add brightness");
    }
    
    #[test]
    fn test_render_einstein_rings_disabled() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let mut config = LensingConfig::cosmic_lens();
        config.show_einstein_rings = false;
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.1, 1.0); 10000];
        let original = buffer.clone();
        
        render_einstein_rings(&mut buffer, &sources, 100, 100, &config, [0.5, 0.8, 1.0]);
        
        assert_eq!(buffer, original, "Should not modify buffer when disabled");
    }

    // ---- Accretion glow tests ----
    
    #[test]
    fn test_render_accretion_glow_adds_brightness() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::event_horizon();
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        render_accretion_glow(&mut buffer, &sources, 100, 100, &config, [1.0, 0.5, 0.2]);
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness, "Accretion glow should add brightness");
    }
    
    #[test]
    fn test_render_accretion_glow_disabled() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let mut config = LensingConfig::event_horizon();
        config.show_accretion_glow = false;
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.1, 1.0); 10000];
        let original = buffer.clone();
        
        render_accretion_glow(&mut buffer, &sources, 100, 100, &config, [1.0, 0.5, 0.2]);
        
        assert_eq!(buffer, original, "Should not modify buffer when disabled");
    }

    // ---- Grid overlay tests ----
    
    #[test]
    fn test_render_grid_overlay_modifies_buffer() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::spacetime_fabric();
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        
        render_grid_overlay(&mut buffer, &field, 100, 100, config.grid_spacing, config.grid_opacity, [0.5, 0.5, 0.5]);
        
        let non_black_count = buffer.iter().filter(|p| p.0 > 0.01 || p.1 > 0.01 || p.2 > 0.01).count();
        
        assert!(non_black_count > 0, "Grid should add visible lines");
    }

    // ---- Trajectory trails tests ----
    
    #[test]
    fn test_render_trajectory_trails_adds_brightness() {
        let positions = create_test_trajectory();
        let config = LensingConfig::cosmic_lens();
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 1920 * 1080];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_trajectory_trails(&mut buffer, &positions, 1920, 1080, &config, &colors);
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness, "Trails should add brightness");
    }
    
    #[test]
    fn test_render_trajectory_trails_disabled() {
        let positions = create_test_trajectory();
        let mut config = LensingConfig::event_horizon(); // Has trail_opacity = 0
        config.trail_opacity = 0.0;
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.1, 1.0); 100 * 100];
        let original = buffer.clone();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_trajectory_trails(&mut buffer, &positions, 100, 100, &config, &colors);
        
        assert_eq!(buffer, original, "Should not modify buffer when opacity is 0");
    }

    // ---- Integration tests ----
    
    #[test]
    fn test_full_lensing_pipeline_cosmic_lens() {
        let positions = create_test_trajectory();
        let config = LensingConfig::cosmic_lens();
        
        // Create sources
        let sources = create_mass_sources(&positions, &config, 200, 200);
        assert_eq!(sources.len(), 3);
        
        // Compute displacement field
        let field = DisplacementField::compute(&sources, 200, 200, &config);
        assert!(field.max_magnitude() > 0.0);
        
        // Apply distortion
        let background: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.15, 1.0); 200 * 200];
        let mut buffer = apply_distortion(&background, &field, &config);
        
        // Add rings
        render_einstein_rings(&mut buffer, &sources, 200, 200, &config, [0.5, 0.8, 1.0]);
        
        // Verify results
        assert_eq!(buffer.len(), 200 * 200);
        let has_bright_pixels = buffer.iter().any(|p| p.0 > 0.2 || p.1 > 0.2 || p.2 > 0.2);
        assert!(has_bright_pixels, "Should have some bright pixels from rings");
    }
    
    #[test]
    fn test_full_lensing_pipeline_all_styles() {
        let positions = create_test_trajectory();
        
        for style in [
            LensingStyle::CosmicLens,
            LensingStyle::GravitationalWake,
            LensingStyle::EventHorizon,
            LensingStyle::SpacetimeFabric,
        ] {
            let config = LensingConfig::from_style(style.clone());
            let sources = create_mass_sources(&positions, &config, 100, 100);
            let field = DisplacementField::compute(&sources, 100, 100, &config);
            
            assert!(sources.len() >= 3, "Style {:?} should have at least 3 sources", style);
            assert_eq!(field.full_width(), 100);
            assert_eq!(field.full_height(), 100);
        }
    }
    
    // ---- Helper function tests ----
    
    #[test]
    fn test_lerp() {
        assert!((lerp(0.0, 1.0, 0.0) - 0.0).abs() < 0.001);
        assert!((lerp(0.0, 1.0, 1.0) - 1.0).abs() < 0.001);
        assert!((lerp(0.0, 1.0, 0.5) - 0.5).abs() < 0.001);
        assert!((lerp(10.0, 20.0, 0.25) - 12.5).abs() < 0.001);
    }
    
    #[test]
    fn test_compute_bounds() {
        let positions = vec![
            vec![
                Vector3::new(-100.0, -50.0, 0.0),
                Vector3::new(100.0, 50.0, 0.0),
            ],
        ];
        
        let (min_x, max_x, min_y, max_y) = compute_bounds(&positions);
        
        assert!((min_x - (-100.0)).abs() < 0.001);
        assert!((max_x - 100.0).abs() < 0.001);
        assert!((min_y - (-50.0)).abs() < 0.001);
        assert!((max_y - 50.0).abs() < 0.001);
    }
    
    #[test]
    fn test_world_bounds_to_pixel() {
        let bounds = WorldBounds {
            min_x: 0.0,
            max_x: 100.0,
            min_y: 0.0,
            max_y: 100.0,
        };
        
        let (px, py) = bounds.to_pixel(50.0, 50.0, 1000, 1000);
        assert!((px - 500.0).abs() < 0.001);
        assert!((py - 500.0).abs() < 0.001);
    }
}
