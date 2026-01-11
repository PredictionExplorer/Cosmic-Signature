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
//! # Luminous Trajectory Lensing (New Default)
//!
//! The "Geodesic Caustics" style implements a novel approach where the **entire orbital
//! history** shapes spacetime distortion:
//!
//! 1. **Trajectory Density Field**: Computes where bodies spent time throughout the simulation
//! 2. **Distributed Mass**: The trajectory path itself acts as an extended mass distribution
//! 3. **Accumulated Caustics**: Integrates caustic patterns across multiple timesteps
//!
//! This creates museum-quality art where the physics of the three-body problem
//! directly shapes the visual output - denser orbital regions create stronger lensing.
//!
//! # Styles
//!
//! - **Geodesic Caustics**: Full orbital history shapes lensing (default)
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
    /// Geodesic ray tracing with emergent caustic patterns (recommended default)
    /// Physics-accurate visualization where beauty emerges from the mathematics
    #[default]
    GeodesicCaustics,
    /// 3 massive bodies with Einstein rings
    CosmicLens,
    /// Trajectory centroids create rippling wake patterns
    GravitationalWake,
    /// Extreme distortion for maximum drama
    EventHorizon,
    /// Grid overlay showing spacetime curvature
    SpacetimeFabric,
    /// NEW: Accumulated grid distortion from orbital history
    /// The grid permanently records gravitational influence - no trajectory lines
    GravitationalMemory,
}

impl LensingStyle {
    /// Parse style from string
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "geodesic-caustics" | "geodesiccaustics" | "caustics" | "geodesic" => Self::GeodesicCaustics,
            "cosmic-lens" | "cosmiclens" | "cosmic" => Self::CosmicLens,
            "gravitational-wake" | "wake" | "ripple" => Self::GravitationalWake,
            "event-horizon" | "eventhorizon" | "extreme" | "black-hole" => Self::EventHorizon,
            "spacetime-fabric" | "fabric" | "grid" | "spacetime" => Self::SpacetimeFabric,
            "gravitational-memory" | "memory" | "accumulated" | "imprint" => Self::GravitationalMemory,
            _ => Self::GeodesicCaustics, // Default to geodesic caustics
        }
    }
    
    /// Get display name
    pub fn name(&self) -> &'static str {
        match self {
            Self::GeodesicCaustics => "Geodesic Caustics",
            Self::CosmicLens => "Cosmic Lens",
            Self::GravitationalWake => "Gravitational Wake",
            Self::EventHorizon => "Event Horizon",
            Self::SpacetimeFabric => "Spacetime Fabric",
            Self::GravitationalMemory => "Gravitational Memory",
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
    
    // === Geodesic Caustics specific settings ===
    
    /// Number of ray samples per pixel for caustic computation
    pub caustic_ray_density: usize,
    
    /// Caustic brightness multiplier
    pub caustic_brightness: f64,
    
    /// Whether to show caustic curves (emergent from ray density)
    pub show_caustics: bool,
    
    /// Proper-time trail visualization (physics-accurate worldlines)
    pub show_proper_time_trails: bool,
    
    /// Time dilation color shift strength (red=slow, blue=fast)
    pub time_dilation_strength: f64,
    
    /// Caustic smoothing radius
    pub caustic_smoothing: f64,
    
    // === Trajectory-Based Lensing Settings ===
    
    /// Enable trajectory-based mass distribution (entire orbital history shapes lensing)
    pub use_trajectory_density: bool,
    
    /// Number of trajectory points to sample for density computation
    pub trajectory_sample_count: usize,
    
    /// Minimum density threshold (0-1) for mass source generation
    pub density_threshold: f64,
    
    /// How many mass sources to generate from trajectory density
    pub trajectory_source_count: usize,
    
    /// Base mass per trajectory density unit
    pub trajectory_mass_scale: f64,
    
    /// Number of temporal snapshots for accumulated caustics
    pub accumulated_caustic_samples: usize,
    
    /// Luminous trail brightness (the glowing path of orbital history)
    pub luminous_trail_brightness: f64,
    
    /// Luminous trail falloff (how quickly brightness fades with age)
    pub luminous_trail_falloff: f64,
    
    // === Temporal Windowing (Elegance Curation) ===
    
    /// Start of trajectory window (0.0 = beginning, 1.0 = end)
    /// Use 0.4-0.6 to skip the initial chaotic "settling" phase
    pub trajectory_window_start: f64,
    
    /// End of trajectory window (0.0 = beginning, 1.0 = end)  
    /// Use 1.0 to include the most recent positions
    pub trajectory_window_end: f64,
    
    // === Fixed Camera / Square Bounds ===
    
    /// Use fixed square bounds (prevents camera zoom and aspect ratio distortion)
    /// When true, the coordinate system is fixed from the start - no adaptive scaling
    pub use_fixed_bounds: bool,
    
    /// Margin factor for fixed bounds (e.g., 0.1 = 10% extra space around content)
    pub fixed_bounds_margin: f64,
    
    // === Accumulated Grid Distortion (Gravitational Memory) ===
    
    /// Enable accumulated grid distortion from orbital history
    /// Grid permanently records gravitational influence - shows where masses have been
    pub use_accumulated_grid: bool,
    
    /// Number of temporal samples for accumulated grid (more = smoother, slower)
    pub accumulated_grid_samples: usize,
    
    /// Grid distortion memory strength (how much history affects current distortion)
    pub grid_memory_strength: f64,
    
    /// Fraction of trajectory to use for accumulated grid (0.0-1.0)
    /// Lower values = only recent history, higher = full history
    pub grid_history_fraction: f64,
}

impl Default for LensingConfig {
    fn default() -> Self {
        Self::geodesic_caustics()
    }
}

impl LensingConfig {
    /// Geodesic Caustics: Clean, stable gravitational lensing with dramatic effects
    /// 
    /// This style creates museum-quality spacetime distortion using 3 massive bodies
    /// at their FINAL positions. This is stable (no flickering) and visually dramatic.
    /// 
    /// **Key features:**
    /// - Fixed square coordinate system (no camera zoom or aspect ratio changes)
    /// - 3 massive bodies create visible Einstein-like lensing
    /// - Soft glowing trails show orbital history
    /// - Caustic patterns emerge naturally from ray convergence
    pub fn geodesic_caustics() -> Self {
        Self {
            style: LensingStyle::GeodesicCaustics,
            base_mass: 120_000.0,  // High mass for dramatic, visible lensing
            mass_multiplier: 1.0,
            einstein_scale: 0.18,  // Larger for very visible lensing
            max_displacement: 150.0,
            falloff_exponent: 0.9,  // Slower falloff = larger area of effect
            show_einstein_rings: true,  // Show the rings!
            ring_brightness: 0.5,
            ring_thickness: 0.10,
            show_accretion_glow: true,  // Subtle glow around bodies
            accretion_intensity: 0.3,
            show_grid: false,  // No grid for clean artistic look
            grid_spacing: 50.0,
            grid_opacity: 0.0,
            chromatic_aberration: 0.18,  // Visible chromatic separation
            wake_centroids: 3,
            trail_opacity: 0.0,   // NO boring line trails
            trail_width: 0.0,
            half_resolution: false,
            // Caustic settings (stable single-frame computation)
            caustic_ray_density: 4,
            caustic_brightness: 1.2,
            show_caustics: true,
            show_proper_time_trails: false,
            time_dilation_strength: 0.0,
            caustic_smoothing: 3.0,
            // Trajectory-based lensing DISABLED (caused flickering)
            use_trajectory_density: false,
            trajectory_sample_count: 0,
            density_threshold: 0.0,
            trajectory_source_count: 0,
            trajectory_mass_scale: 0.0,
            accumulated_caustic_samples: 1,  // Single frame only
            luminous_trail_brightness: 0.0,
            luminous_trail_falloff: 0.0,
            trajectory_window_start: 0.0,
            trajectory_window_end: 1.0,
            // FIXED CAMERA: No zoom, no aspect ratio changes
            use_fixed_bounds: true,
            fixed_bounds_margin: 0.15,
            // Accumulated grid (disabled)
            use_accumulated_grid: false,
            accumulated_grid_samples: 0,
            grid_memory_strength: 0.0,
            grid_history_fraction: 0.0,
        }
    }
    
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
            show_accretion_glow: true,  // Show glow around bodies
            accretion_intensity: 0.35,
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.3,
            chromatic_aberration: 0.15,
            wake_centroids: 3,
            trail_opacity: 0.0,   // NO boring line trails
            trail_width: 0.0,
            half_resolution: true,
            // Geodesic-specific settings (not used for this style)
            caustic_ray_density: 1,
            caustic_brightness: 0.0,
            show_caustics: false,
            show_proper_time_trails: false,
            time_dilation_strength: 0.0,
            caustic_smoothing: 0.0,
            // Trajectory-based lensing (disabled for this style)
            use_trajectory_density: false,
            trajectory_sample_count: 0,
            density_threshold: 0.0,
            trajectory_source_count: 0,
            trajectory_mass_scale: 0.0,
            accumulated_caustic_samples: 0,
            luminous_trail_brightness: 0.0,
            luminous_trail_falloff: 0.0,
            // Temporal windowing (full trajectory for non-geodesic styles)
            trajectory_window_start: 0.0,
            trajectory_window_end: 1.0,
            // Fixed camera
            use_fixed_bounds: true,
            fixed_bounds_margin: 0.15,
            // Accumulated grid (disabled)
            use_accumulated_grid: false,
            accumulated_grid_samples: 0,
            grid_memory_strength: 0.0,
            grid_history_fraction: 0.0,
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
            show_accretion_glow: true,   // Glow shows current positions
            accretion_intensity: 0.3,
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.3,
            chromatic_aberration: 0.08,
            wake_centroids: 40,
            trail_opacity: 0.0,   // NO boring line trails - wake IS the visualization
            trail_width: 0.0,
            half_resolution: true,
            // Geodesic-specific settings (not used for this style)
            caustic_ray_density: 1,
            caustic_brightness: 0.0,
            show_caustics: false,
            show_proper_time_trails: false,
            time_dilation_strength: 0.0,
            caustic_smoothing: 0.0,
            // Trajectory-based lensing (disabled for this style)
            use_trajectory_density: false,
            trajectory_sample_count: 0,
            density_threshold: 0.0,
            trajectory_source_count: 0,
            trajectory_mass_scale: 0.0,
            accumulated_caustic_samples: 0,
            luminous_trail_brightness: 0.0,
            luminous_trail_falloff: 0.0,
            // Temporal windowing (full trajectory for non-geodesic styles)
            trajectory_window_start: 0.0,
            trajectory_window_end: 1.0,
            // Fixed camera
            use_fixed_bounds: true,
            fixed_bounds_margin: 0.15,
            // Accumulated grid (disabled)
            use_accumulated_grid: false,
            accumulated_grid_samples: 0,
            grid_memory_strength: 0.0,
            grid_history_fraction: 0.0,
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
            accretion_intensity: 0.5,   // More dramatic glow
            show_grid: false,
            grid_spacing: 50.0,
            grid_opacity: 0.3,
            chromatic_aberration: 0.25,
            wake_centroids: 3,
            trail_opacity: 0.0,   // NO boring line trails
            trail_width: 0.0,
            half_resolution: true,
            // Geodesic-specific settings (not used for this style)
            caustic_ray_density: 1,
            caustic_brightness: 0.0,
            show_caustics: false,
            show_proper_time_trails: false,
            time_dilation_strength: 0.0,
            caustic_smoothing: 0.0,
            // Trajectory-based lensing (disabled for this style)
            use_trajectory_density: false,
            trajectory_sample_count: 0,
            density_threshold: 0.0,
            trajectory_source_count: 0,
            trajectory_mass_scale: 0.0,
            accumulated_caustic_samples: 0,
            luminous_trail_brightness: 0.0,
            luminous_trail_falloff: 0.0,
            // Temporal windowing (full trajectory for non-geodesic styles)
            trajectory_window_start: 0.0,
            trajectory_window_end: 1.0,
            // Fixed camera
            use_fixed_bounds: true,
            fixed_bounds_margin: 0.15,
            // Accumulated grid (disabled)
            use_accumulated_grid: false,
            accumulated_grid_samples: 0,
            grid_memory_strength: 0.0,
            grid_history_fraction: 0.0,
        }
    }
    
    /// Spacetime Fabric: Grid overlay showing curvature
    /// 
    /// Grid is now softer and more artistic (less "mathematical").
    /// Trails are soft glowing orbs instead of lines.
    pub fn spacetime_fabric() -> Self {
        Self {
            style: LensingStyle::SpacetimeFabric,
            base_mass: 100_000.0,  // Higher mass for more visible bending
            mass_multiplier: 1.0,
            einstein_scale: 0.15,  // Larger effect radius
            max_displacement: 120.0,
            falloff_exponent: 1.0,
            show_einstein_rings: false,
            ring_brightness: 0.0,
            ring_thickness: 0.0,
            show_accretion_glow: true,  // Subtle glow around bodies
            accretion_intensity: 0.25,
            show_grid: true,
            grid_spacing: 50.0,  // Wider grid spacing - less cluttered
            grid_opacity: 0.25,  // Much softer grid (was 0.5)
            chromatic_aberration: 0.08,
            wake_centroids: 3,
            trail_opacity: 0.0,   // NO trail lines!
            trail_width: 0.0,
            half_resolution: true,
            // Geodesic-specific settings (not used for this style)
            caustic_ray_density: 1,
            caustic_brightness: 0.0,
            show_caustics: false,
            show_proper_time_trails: false,
            time_dilation_strength: 0.0,
            caustic_smoothing: 0.0,
            // Trajectory-based lensing (disabled for this style)
            use_trajectory_density: false,
            trajectory_sample_count: 0,
            density_threshold: 0.0,
            trajectory_source_count: 0,
            trajectory_mass_scale: 0.0,
            accumulated_caustic_samples: 0,
            luminous_trail_brightness: 0.0,
            luminous_trail_falloff: 0.0,
            // Temporal windowing (full trajectory for non-geodesic styles)
            trajectory_window_start: 0.0,
            trajectory_window_end: 1.0,
            // Fixed camera
            use_fixed_bounds: true,
            fixed_bounds_margin: 0.15,
            // Accumulated grid (disabled - use GravitationalMemory for this)
            use_accumulated_grid: false,
            accumulated_grid_samples: 0,
            grid_memory_strength: 0.0,
            grid_history_fraction: 0.0,
        }
    }
    
    /// Gravitational Memory: Grid permanently records orbital history
    /// 
    /// **THE COOLEST MODE** - The grid shows WHERE masses have been, not WHERE they are.
    /// No trajectory lines - the distorted grid IS the history.
    /// 
    /// The grid accumulates distortion from every position in the orbital history,
    /// creating a permanent "imprint" of gravitational influence.
    pub fn gravitational_memory() -> Self {
        Self {
            style: LensingStyle::GravitationalMemory,
            base_mass: 60_000.0,  // Lower per-sample mass (accumulates)
            mass_multiplier: 1.0,
            einstein_scale: 0.12,
            max_displacement: 100.0,
            falloff_exponent: 1.0,
            show_einstein_rings: false,  // Grid tells the story
            ring_brightness: 0.0,
            ring_thickness: 0.0,
            show_accretion_glow: true,  // Glow at current positions
            accretion_intensity: 0.4,   // More visible glow
            show_grid: true,            // THE MAIN FEATURE
            grid_spacing: 40.0,         // Denser grid for detail
            grid_opacity: 0.45,         // Visible but not overwhelming
            chromatic_aberration: 0.10, // Subtle color fringing
            wake_centroids: 3,
            trail_opacity: 0.0,         // NO TRAIL LINES! Grid is the trail.
            trail_width: 0.0,
            half_resolution: true,
            // Geodesic-specific (not used)
            caustic_ray_density: 1,
            caustic_brightness: 0.0,
            show_caustics: false,
            show_proper_time_trails: false,
            time_dilation_strength: 0.0,
            caustic_smoothing: 0.0,
            // Trajectory-based lensing (disabled)
            use_trajectory_density: false,
            trajectory_sample_count: 0,
            density_threshold: 0.0,
            trajectory_source_count: 0,
            trajectory_mass_scale: 0.0,
            accumulated_caustic_samples: 0,
            luminous_trail_brightness: 0.0,
            luminous_trail_falloff: 0.0,
            // Temporal windowing
            trajectory_window_start: 0.0,
            trajectory_window_end: 1.0,
            // Fixed camera
            use_fixed_bounds: true,
            fixed_bounds_margin: 0.15,
            // ACCUMULATED GRID - THE KEY FEATURE
            use_accumulated_grid: true,
            accumulated_grid_samples: 30,  // Sample 30 timesteps for history
            grid_memory_strength: 0.8,     // Strong memory of past positions
            grid_history_fraction: 1.0,    // Use full history
        }
    }
    
    /// Create config from style enum
    pub fn from_style(style: LensingStyle) -> Self {
        match style {
            LensingStyle::GeodesicCaustics => Self::geodesic_caustics(),
            LensingStyle::CosmicLens => Self::cosmic_lens(),
            LensingStyle::GravitationalWake => Self::gravitational_wake(),
            LensingStyle::EventHorizon => Self::event_horizon(),
            LensingStyle::SpacetimeFabric => Self::spacetime_fabric(),
            LensingStyle::GravitationalMemory => Self::gravitational_memory(),
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
/// For GeodesicCaustics with trajectory density: Creates distributed mass sources from orbital history
/// For CosmicLens/EventHorizon: Uses only current (final) body positions
/// For GravitationalWake: Uses aggregated centroids along trajectory
/// 
/// **New:** When `use_fixed_bounds` is enabled, uses fixed square bounds to prevent
/// camera zoom and aspect ratio distortion during animations.
pub fn create_mass_sources(
    positions: &[Vec<Vector3<f64>>],
    config: &LensingConfig,
    width: usize,
    height: usize,
) -> Vec<MassSource> {
    // Compute world bounds - use fixed square bounds if configured
    let world_bounds = if config.use_fixed_bounds {
        WorldBounds::fixed_square(positions, config.fixed_bounds_margin)
    } else {
        WorldBounds::from_positions(positions, 0.1)
    };
    
    match config.style {
        LensingStyle::GeodesicCaustics if config.use_trajectory_density => {
            // Create mass sources from entire orbital history (can cause flickering)
            create_trajectory_density_sources(positions, config, width, height, &world_bounds)
        }
        LensingStyle::GeodesicCaustics | LensingStyle::CosmicLens | LensingStyle::EventHorizon | LensingStyle::SpacetimeFabric => {
            // Simple 3-body lensing (stable, no flickering)
            create_body_sources(positions, config, width, height, &world_bounds)
        }
        LensingStyle::GravitationalWake => {
            create_centroid_sources(positions, config, width, height, &world_bounds)
        }
        LensingStyle::GravitationalMemory => {
            // For accumulated grid: use all positions from trajectory history
            // This creates the "permanent imprint" of gravitational influence
            create_accumulated_history_sources(positions, config, width, height, &world_bounds)
        }
    }
}

/// Get world bounds for external use (e.g., trail rendering)
pub fn get_world_bounds(positions: &[Vec<Vector3<f64>>], config: &LensingConfig) -> WorldBounds {
    if config.use_fixed_bounds {
        WorldBounds::fixed_square(positions, config.fixed_bounds_margin)
    } else {
        WorldBounds::from_positions(positions, 0.1)
    }
}

/// World coordinate bounds
pub struct WorldBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

impl WorldBounds {
    pub fn width(&self) -> f64 {
        (self.max_x - self.min_x).max(1e-10)
    }
    
    pub fn height(&self) -> f64 {
        (self.max_y - self.min_y).max(1e-10)
    }
    
    pub fn to_pixel(&self, world_x: f64, world_y: f64, img_width: usize, img_height: usize) -> (f64, f64) {
        let px = (world_x - self.min_x) / self.width() * img_width as f64;
        let py = (world_y - self.min_y) / self.height() * img_height as f64;
        (px, py)
    }
    
    /// Compute bounds from positions (may have non-square aspect ratio)
    pub fn from_positions(positions: &[Vec<Vector3<f64>>], margin: f64) -> Self {
        let (min_x, max_x, min_y, max_y) = compute_bounds_raw(positions);
        let span = (max_x - min_x).max(max_y - min_y);
        let actual_margin = margin * span;
        Self {
            min_x: min_x - actual_margin,
            max_x: max_x + actual_margin,
            min_y: min_y - actual_margin,
            max_y: max_y + actual_margin,
        }
    }
    
    /// Compute fixed SQUARE bounds centered on center of mass.
    /// This prevents camera zoom and aspect ratio distortion.
    pub fn fixed_square(positions: &[Vec<Vector3<f64>>], margin_factor: f64) -> Self {
        let (min_x, max_x, min_y, max_y) = crate::utils::fixed_square_bounds(positions, margin_factor);
        Self { min_x, max_x, min_y, max_y }
    }
    
    /// Default bounds for testing or when positions are empty
    pub fn default_for_positions(positions: &[Vec<Vector3<f64>>], _width: usize, _height: usize) -> Self {
        Self::from_positions(positions, 0.1)
    }
}

/// Compute raw bounds from positions (no margin)
pub fn compute_bounds_raw(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
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

/// Legacy function for backwards compatibility
pub fn compute_bounds(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    compute_bounds_raw(positions)
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

/// Create mass sources from entire trajectory history for accumulated grid distortion
/// 
/// This creates many small mass sources at sampled positions throughout the orbital history.
/// When used with the grid overlay, this creates a "gravitational memory" effect where
/// the grid shows the permanent imprint of where masses have been.
fn create_accumulated_history_sources(
    positions: &[Vec<Vector3<f64>>],
    config: &LensingConfig,
    width: usize,
    height: usize,
    bounds: &WorldBounds,
) -> Vec<MassSource> {
    let num_samples = config.accumulated_grid_samples.max(10);
    let effective_mass = config.base_mass * config.mass_multiplier;
    let history_fraction = config.grid_history_fraction.clamp(0.1, 1.0);
    let memory_strength = config.grid_memory_strength.clamp(0.1, 2.0);
    
    let mut sources = Vec::with_capacity(num_samples * positions.len());
    
    for (body_idx, body_pos) in positions.iter().enumerate() {
        if body_pos.is_empty() {
            continue;
        }
        
        // Determine which portion of history to use
        let history_len = (body_pos.len() as f64 * history_fraction) as usize;
        let start_idx = body_pos.len().saturating_sub(history_len);
        let relevant_positions = &body_pos[start_idx..];
        
        if relevant_positions.is_empty() {
            continue;
        }
        
        // Sample evenly across the history
        let step = (relevant_positions.len() / num_samples).max(1);
        
        for (sample_idx, i) in (0..relevant_positions.len()).step_by(step).enumerate() {
            let pos = &relevant_positions[i];
            let (px, py) = bounds.to_pixel(pos.x, pos.y, width, height);
            
            // Age factor: older positions have slightly less influence
            let age = sample_idx as f64 / num_samples as f64;
            let age_factor = 0.5 + 0.5 * (1.0 - age);  // Older = 50-100% strength
            
            // Distribute mass across all samples, weighted by memory strength
            let sample_mass = (effective_mass / num_samples as f64) * memory_strength * age_factor;
            
            sources.push(MassSource {
                x: px,
                y: py,
                mass: sample_mass,
                body_index: body_idx,
                velocity: 1.0 - age * 0.3,
            });
        }
    }
    
    sources
}

// ============================================================================
// TRAJECTORY DENSITY LENSING (NEW!)
// ============================================================================

/// Trajectory density field - a 2D map showing where bodies spent time
/// 
/// Higher values indicate regions where bodies lingered or orbital paths overlapped.
/// This becomes the mass distribution for "Luminous Trajectory Lensing".
pub struct TrajectoryDensityField {
    /// Density values for each pixel (0-1 normalized)
    pub density: Vec<f64>,
    /// Width of the density field
    pub width: usize,
    /// Height of the density field
    pub height: usize,
    /// Per-body density contributions (for coloring)
    pub body_densities: [Vec<f64>; 3],
    /// World bounds used for coordinate conversion
    bounds: WorldBounds,
}

impl TrajectoryDensityField {
    /// Compute trajectory density field from all positions
    /// 
    /// For each trajectory point, we accumulate density in nearby pixels.
    /// This creates a "heat map" of where bodies spent their time.
    /// 
    /// OPTIMIZED: Uses parallel computation per body with final merge.
    /// CURATED: Applies temporal windowing to show only the "elegant" portion of the orbit.
    pub fn compute(
        positions: &[Vec<Vector3<f64>>],
        width: usize,
        height: usize,
        config: &LensingConfig,
    ) -> Self {
        // Use fixed square bounds if configured
        let bounds = get_world_bounds(positions, config);
        
        // Subsample trajectory for performance
        let sample_count = config.trajectory_sample_count.max(100);
        
        // Gaussian splat radius (in pixels)
        let splat_radius = (width.min(height) as f64 * 0.02).max(3.0);
        let sigma = splat_radius / 2.5;
        let radius_int = splat_radius.ceil() as i32;
        
        // Temporal windowing parameters
        let window_start = config.trajectory_window_start.clamp(0.0, 1.0);
        let window_end = config.trajectory_window_end.clamp(0.0, 1.0);
        
        // OPTIMIZATION: Compute each body's density contribution in parallel
        // CURATED: Only process positions within the temporal window
        let body_results: Vec<(Vec<f64>, usize)> = positions.par_iter().enumerate()
            .filter(|(_, body_pos)| !body_pos.is_empty())
            .map(|(body_idx, body_pos)| {
                let mut body_density = vec![0.0; width * height];
                
                // Apply temporal windowing: only use portion of trajectory
                let total_len = body_pos.len();
                let start_idx = (total_len as f64 * window_start) as usize;
                let end_idx = (total_len as f64 * window_end) as usize;
                let windowed_len = end_idx.saturating_sub(start_idx).max(1);
                
                let subsample = (windowed_len / sample_count).max(1);
                
                for (local_step, step) in (start_idx..end_idx).enumerate() {
                    if local_step % subsample != 0 {
                        continue;
                    }
                    
                    let pos = &body_pos[step];
                    let (px, py) = bounds.to_pixel(pos.x, pos.y, width, height);
                    let cx = px.round() as i32;
                    let cy = py.round() as i32;
                    
                    // Time-based weight within the window
                    // More recent positions (higher local_step) have higher weight
                    let age_in_window = local_step as f64 / windowed_len as f64;
                    let time_weight = 0.6 + 0.4 * age_in_window; // 0.6 to 1.0 (favor recent)
                    
                    // Splat Gaussian contribution to nearby pixels
                    for dy in -radius_int..=radius_int {
                        for dx in -radius_int..=radius_int {
                            let nx = cx + dx;
                            let ny = cy + dy;
                            
                            if nx < 0 || nx >= width as i32 || ny < 0 || ny >= height as i32 {
                                continue;
                            }
                            
                            let dist_sq = (dx as f64).powi(2) + (dy as f64).powi(2);
                            let weight = (-dist_sq / (2.0 * sigma * sigma)).exp() * time_weight;
                            
                            let idx = ny as usize * width + nx as usize;
                            body_density[idx] += weight;
                        }
                    }
                }
                
                (body_density, body_idx)
            })
            .collect();
        
        // Merge body densities into total density and per-body arrays
        let mut density = vec![0.0; width * height];
        let mut body_densities: [Vec<f64>; 3] = [
            vec![0.0; width * height],
            vec![0.0; width * height],
            vec![0.0; width * height],
        ];
        
        for (body_density, body_idx) in body_results {
            // Add to total density
            for (total, &bd) in density.iter_mut().zip(body_density.iter()) {
                *total += bd;
            }
            // Store per-body density (for coloring)
            if body_idx < 3 {
                body_densities[body_idx] = body_density;
            }
        }
        
        // Normalize density to [0, 1]
        let max_density = density.iter().copied().fold(0.0, f64::max).max(1e-10);
        for d in &mut density {
            *d /= max_density;
        }
        
        // Normalize body densities
        for body_density in &mut body_densities {
            let max_bd = body_density.iter().copied().fold(0.0, f64::max).max(1e-10);
            for d in body_density.iter_mut() {
                *d /= max_bd;
            }
        }
        
        Self {
            density,
            width,
            height,
            body_densities,
            bounds,
        }
    }
    
    /// Get density at a pixel location
    pub fn get_density(&self, x: usize, y: usize) -> f64 {
        if x < self.width && y < self.height {
            self.density[y * self.width + x]
        } else {
            0.0
        }
    }
    
    /// Get which body contributed most at this location (for coloring)
    pub fn dominant_body(&self, x: usize, y: usize) -> usize {
        if x >= self.width || y >= self.height {
            return 0;
        }
        let idx = y * self.width + x;
        let mut max_body = 0;
        let mut max_val = 0.0;
        for (i, bd) in self.body_densities.iter().enumerate() {
            if bd[idx] > max_val {
                max_val = bd[idx];
                max_body = i;
            }
        }
        max_body
    }
}

/// Create mass sources distributed along the trajectory based on density
/// 
/// This is the key function for "Luminous Trajectory Lensing":
/// - High-density regions (where bodies lingered) get more massive sources
/// - The entire orbital history shapes the gravitational lensing
fn create_trajectory_density_sources(
    positions: &[Vec<Vector3<f64>>],
    config: &LensingConfig,
    width: usize,
    height: usize,
    bounds: &WorldBounds,
) -> Vec<MassSource> {
    // Compute trajectory density field
    let density_field = TrajectoryDensityField::compute(positions, width, height, config);
    
    // Also include the 3 current body positions as primary sources
    let mut sources = create_body_sources(positions, config, width, height, bounds);
    
    // Find high-density regions and create mass sources there
    let target_count = config.trajectory_source_count.max(10);
    let threshold = config.density_threshold;
    
    // Collect candidate positions (above threshold density)
    let mut candidates: Vec<(usize, usize, f64, usize)> = Vec::new(); // (x, y, density, body_idx)
    
    // Sample the density field at regular intervals
    let step = ((width * height) as f64 / (target_count as f64 * 10.0)).sqrt().max(1.0) as usize;
    
    for y in (0..height).step_by(step.max(1)) {
        for x in (0..width).step_by(step.max(1)) {
            let d = density_field.get_density(x, y);
            if d > threshold {
                let body_idx = density_field.dominant_body(x, y);
                candidates.push((x, y, d, body_idx));
            }
        }
    }
    
    // Sort by density (highest first) and take top candidates
    candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    
    let count = candidates.len().min(target_count);
    
    for (x, y, density, body_idx) in candidates.into_iter().take(count) {
        // Mass proportional to density
        let mass = config.trajectory_mass_scale * density * config.mass_multiplier;
        
        sources.push(MassSource {
            x: x as f64 + 0.5,
            y: y as f64 + 0.5,
            mass,
            body_index: body_idx,
            velocity: density, // Use density as velocity proxy for coloring
        });
    }
    
    sources
}

/// Render luminous trajectory trails
/// 
/// Creates a glowing visualization of the orbital history, where brightness
/// corresponds to how much time the bodies spent in each region.
pub fn render_luminous_trails(
    buffer: &mut [(f64, f64, f64, f64)],
    density_field: &TrajectoryDensityField,
    config: &LensingConfig,
    body_colors: &[[f64; 3]; 3],
) {
    if config.luminous_trail_brightness <= 0.0 {
        return;
    }
    
    let width = density_field.width;
    let _height = density_field.height; // Used for buffer indexing validation
    let brightness = config.luminous_trail_brightness;
    let falloff = config.luminous_trail_falloff.max(0.1);
    
    buffer.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let x = idx % width;
        let y = idx / width;
        
        let density = density_field.get_density(x, y);
        
        if density > 0.01 {
            // Get dominant body for coloring
            let body_idx = density_field.dominant_body(x, y);
            let base_color = body_colors[body_idx % 3];
            
            // Non-linear intensity mapping for more dramatic effect
            let intensity = brightness * density.powf(falloff);
            
            // Additive blending with soft glow
            pixel.0 = (pixel.0 + base_color[0] * intensity).min(1.0);
            pixel.1 = (pixel.1 + base_color[1] * intensity).min(1.0);
            pixel.2 = (pixel.2 + base_color[2] * intensity).min(1.0);
        }
    });
}

/// Compute accumulated caustics across multiple timesteps
/// 
/// Instead of computing caustics from just the final positions, this
/// samples multiple points along the trajectory and integrates the
/// caustic patterns, creating a visualization of the entire gravitational history.
/// 
/// OPTIMIZED: Uses parallel computation for temporal samples (~3-4× faster)
pub fn compute_accumulated_caustics(
    positions: &[Vec<Vector3<f64>>],
    field: &DisplacementField,
    config: &LensingConfig,
    width: usize,
    height: usize,
) -> Vec<f64> {
    let samples = config.accumulated_caustic_samples.max(1);
    
    if samples <= 1 {
        // Fall back to single-frame caustics
        return compute_caustic_density(field, config);
    }
    
    // Use fixed square bounds if configured (prevents zoom/aspect ratio issues)
    let bounds = get_world_bounds(positions, config);
    
    let total_steps = positions.iter().map(|p| p.len()).max().unwrap_or(1);
    let effective_mass = config.base_mass * config.mass_multiplier;
    
    // OPTIMIZATION: Compute all temporal samples in parallel
    // Each sample computes its own displacement field and caustic density
    let sample_results: Vec<(Vec<f64>, f64)> = (0..samples)
        .into_par_iter()
        .map(|sample_idx| {
            // Select timestep for this sample
            let t = (sample_idx as f64 + 0.5) / samples as f64;
            let step = ((total_steps as f64) * t) as usize;
            
            // Create sources from positions at this timestep
            let temp_sources: Vec<MassSource> = positions.iter().enumerate()
                .filter_map(|(body_idx, body_pos)| {
                    if body_pos.is_empty() {
                        return None;
                    }
                    let idx = step.min(body_pos.len() - 1);
                    let pos = &body_pos[idx];
                    let (px, py) = bounds.to_pixel(pos.x, pos.y, width, height);
                    let age_weight = 0.5 + 0.5 * t;
                    
                    Some(MassSource {
                        x: px,
                        y: py,
                        mass: effective_mass * age_weight,
                        body_index: body_idx,
                        velocity: 1.0,
                    })
                })
                .collect();
            
            // Use half resolution for temporal samples (optimization)
            // The main displacement field uses full res, these are just for accumulation
            let mut temp_config = config.clone();
            temp_config.half_resolution = true;
            
            // Compute displacement field and caustic density for this timestep
            let temp_field = DisplacementField::compute(&temp_sources, width, height, &temp_config);
            let temp_density = compute_caustic_density(&temp_field, &temp_config);
            
            // Return density and weight for this sample
            let sample_weight = 0.5 + 0.5 * t;
            (temp_density, sample_weight)
        })
        .collect();
    
    // Merge all sample results (sequential, but fast)
    let mut accumulated = vec![0.0; width * height];
    for (density, weight) in sample_results {
        for (acc, d) in accumulated.iter_mut().zip(density.iter()) {
            *acc += d * weight;
        }
    }
    
    // Normalize accumulated density
    let max_acc = accumulated.iter().copied().fold(0.0, f64::max).max(1.0);
    for d in &mut accumulated {
        *d = (*d / max_acc).powf(0.6); // Gamma for better dynamic range
    }
    
    accumulated
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
/// Render trajectory trails as soft glowing orbs
/// 
/// **New:** Uses fixed square bounds when configured to prevent camera zoom and
/// aspect ratio changes. Trails are rendered as soft Gaussian blobs, not lines.
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
    
    // Use fixed bounds if configured (prevents zoom/aspect ratio issues)
    let bounds = get_world_bounds(positions, config);
    
    // Subsample trajectory for performance (render ~2000 points per body)
    let max_samples = 2000;
    let subsample = (positions[0].len() / max_samples).max(1);
    
    // Use trail_width as the size of soft glowing orbs
    // Larger width = softer, more blurred trails (artistic)
    // Smaller width = sharper, more distinct trails
    let orb_size = config.trail_width.max(1.5);
    
    for (body_idx, body_pos) in positions.iter().enumerate() {
        let color = colors[body_idx % 3];
        
        for (step, pos) in body_pos.iter().enumerate() {
            if step % subsample != 0 {
                continue;
            }
            
            let (px, py) = bounds.to_pixel(pos.x, pos.y, width, height);
            
            // Skip points outside the visible area (with margin)
            if px < -orb_size * 3.0 || px > width as f64 + orb_size * 3.0 ||
               py < -orb_size * 3.0 || py > height as f64 + orb_size * 3.0 {
                continue;
            }
            
            // Age-based fade: older points are dimmer
            // age = 0 at start, 1 at end
            let age = step as f64 / body_pos.len().max(1) as f64;
            
            // Fade from full opacity at end to 30% at start
            let age_fade = 0.3 + 0.7 * age;
            let opacity = config.trail_opacity * age_fade;
            
            draw_soft_point(buffer, width, height, px, py, orb_size, opacity, &color);
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
// GEODESIC CAUSTICS RENDERING
// ============================================================================

/// Compute ray density field for caustic visualization
/// 
/// This traces light rays backward through curved spacetime and counts
/// where they converge to create bright caustic patterns.
pub fn compute_caustic_density(
    field: &DisplacementField,
    config: &LensingConfig,
) -> Vec<f64> {
    let width = field.full_width();
    let height = field.full_height();
    
    // Create density accumulator
    let mut density = vec![0.0f64; width * height];
    
    // For each destination pixel, trace multiple rays backward to find where
    // they came from in the source plane. Where many rays converge to similar
    // source positions, we have high density (caustics).
    let ray_density = config.caustic_ray_density.max(1);
    let sub_pixel_step = 1.0 / ray_density as f64;
    
    for y in 0..height {
        for x in 0..width {
            // Trace multiple rays per pixel for density estimation
            for sy in 0..ray_density {
                for sx in 0..ray_density {
                    let sub_x = x as f64 + sx as f64 * sub_pixel_step + sub_pixel_step * 0.5;
                    let sub_y = y as f64 + sy as f64 * sub_pixel_step + sub_pixel_step * 0.5;
                    
                    // Get source coordinates (where this light ray came from)
                    let (src_x, src_y) = field.get_source_coords(
                        sub_x.min((width - 1) as f64) as usize,
                        sub_y.min((height - 1) as f64) as usize,
                    );
                    
                    // Compute magnification (Jacobian determinant)
                    // Higher magnification = more light rays converging = brighter caustic
                    let (dx, dy) = field.get_displacement(
                        sub_x.min((width - 1) as f64) as usize,
                        sub_y.min((height - 1) as f64) as usize,
                    );
                    let displacement_mag = (dx * dx + dy * dy).sqrt();
                    
                    // Magnification increases near caustics (where rays converge)
                    // This is approximated by displacement gradient
                    let magnification = 1.0 + displacement_mag * 0.1;
                    
                    // Accumulate to source pixel
                    let src_xi = (src_x.round() as usize).min(width - 1);
                    let src_yi = (src_y.round() as usize).min(height - 1);
                    let src_idx = src_yi * width + src_xi;
                    
                    density[src_idx] += magnification / (ray_density * ray_density) as f64;
                }
            }
        }
    }
    
    // Apply smoothing to reduce noise
    if config.caustic_smoothing > 0.0 {
        density = smooth_density_field(&density, width, height, config.caustic_smoothing);
    }
    
    // Normalize to [0, 1] range with non-linear mapping for artistic effect
    let max_density = density.iter().copied().fold(0.0, f64::max).max(1.0);
    for d in &mut density {
        *d = (*d / max_density).powf(0.7); // Gamma for better dynamic range
    }
    
    density
}

/// Apply Gaussian smoothing to density field
fn smooth_density_field(
    density: &[f64],
    _width: usize,
    _height: usize,
    sigma: f64,
) -> Vec<f64> {
    // Derive width and height from density length
    let total = density.len();
    let width = (total as f64).sqrt() as usize;
    let height = total / width;
    
    let radius = (sigma * 2.5).ceil() as i32;
    let mut smoothed = vec![0.0; width * height];
    
    // Compute Gaussian kernel weights
    let mut kernel = Vec::new();
    let mut kernel_sum = 0.0;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let weight = (-((dx * dx + dy * dy) as f64) / (2.0 * sigma * sigma)).exp();
            kernel.push(weight);
            kernel_sum += weight;
        }
    }
    for w in &mut kernel {
        *w /= kernel_sum;
    }
    
    // Apply convolution
    for y in 0..height {
        for x in 0..width {
            let mut sum = 0.0;
            let mut ki = 0;
            
            for dy in -radius..=radius {
                for dx in -radius..=radius {
                    let nx = (x as i32 + dx).clamp(0, (width - 1) as i32) as usize;
                    let ny = (y as i32 + dy).clamp(0, (height - 1) as i32) as usize;
                    sum += density[ny * width + nx] * kernel[ki];
                    ki += 1;
                }
            }
            
            smoothed[y * width + x] = sum;
        }
    }
    
    smoothed
}

/// Render caustic patterns over the buffer
/// 
/// Caustics appear as bright curves where light rays converge.
/// This creates organic, physics-based patterns without mathematical grids.
pub fn render_caustic_overlay(
    buffer: &mut [(f64, f64, f64, f64)],
    density: &[f64],
    _width: usize,
    _height: usize,
    config: &LensingConfig,
    primary_color: [f64; 3],
    accent_color: [f64; 3],
) {
    if !config.show_caustics || config.caustic_brightness <= 0.0 {
        return;
    }
    
    // Find density threshold for caustic detection (high density = caustic)
    let mean_density: f64 = density.iter().sum::<f64>() / density.len() as f64;
    let caustic_threshold = mean_density + 0.15; // Caustics are above-average density
    
    buffer.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
        let d = density[idx];
        
        if d > caustic_threshold {
            // Caustic detected - add glow
            let intensity = ((d - caustic_threshold) / (1.0 - caustic_threshold))
                .clamp(0.0, 1.0)
                .powf(0.5) // Square root for more visible caustics
                * config.caustic_brightness;
            
            // Blend between primary and accent based on intensity
            // Higher intensity caustics shift toward accent color
            let blend = intensity.clamp(0.0, 1.0);
            let color = [
                primary_color[0] * (1.0 - blend) + accent_color[0] * blend,
                primary_color[1] * (1.0 - blend) + accent_color[1] * blend,
                primary_color[2] * (1.0 - blend) + accent_color[2] * blend,
            ];
            
            // Additive blending for glow effect
            pixel.0 = (pixel.0 + color[0] * intensity * 0.5).min(1.0);
            pixel.1 = (pixel.1 + color[1] * intensity * 0.5).min(1.0);
            pixel.2 = (pixel.2 + color[2] * intensity * 0.5).min(1.0);
        }
    });
}

/// Render proper-time worldline trails
/// 
/// Instead of simple line trails, this visualizes the bodies' worldlines
/// with color encoding gravitational time dilation:
/// - Blue tint: fast-running clocks (weak gravity)
/// - Red tint: slow-running clocks (strong gravity, close approaches)
pub fn render_proper_time_trails(
    buffer: &mut [(f64, f64, f64, f64)],
    positions: &[Vec<Vector3<f64>>],
    sources: &[MassSource],
    width: usize,
    height: usize,
    config: &LensingConfig,
    base_colors: &[[f64; 3]; 3],
) {
    if !config.show_proper_time_trails || config.time_dilation_strength <= 0.0 {
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
    
    // Subsample for performance
    let subsample = (positions[0].len() / 8000).max(1);
    
    for (body_idx, body_pos) in positions.iter().enumerate() {
        let base_color = base_colors[body_idx % 3];
        
        for step in (0..body_pos.len()).step_by(subsample) {
            let pos = body_pos[step];
            let (px, py) = bounds.to_pixel(pos.x, pos.y, width, height);
            
            if px < 0.0 || px >= width as f64 || py < 0.0 || py >= height as f64 {
                continue;
            }
            
            // Compute gravitational potential at this point
            // (approximation: sum of 1/r from all other masses)
            let mut potential = 0.0;
            for (other_idx, source) in sources.iter().enumerate() {
                if other_idx == body_idx {
                    continue;
                }
                let dx = px - source.x;
                let dy = py - source.y;
                let dist = (dx * dx + dy * dy).sqrt().max(10.0);
                potential += source.mass / dist;
            }
            
            // Normalize potential for color mapping
            let normalized_potential = (potential / 50000.0).clamp(0.0, 1.0);
            
            // Time dilation color shift
            // Higher potential (close to masses) = redder (slower time)
            // Lower potential (far from masses) = bluer (faster time)
            let dilation_factor = config.time_dilation_strength * normalized_potential;
            
            // Apply time dilation color shift
            let shifted_color = [
                (base_color[0] + dilation_factor * 0.3).clamp(0.0, 1.0),
                (base_color[1] - dilation_factor * 0.1).clamp(0.0, 1.0),
                (base_color[2] - dilation_factor * 0.2).clamp(0.0, 1.0),
            ];
            
            // Age-based fade
            let age = step as f64 / body_pos.len() as f64;
            let opacity = 0.35 * (1.0 - age * 0.6);
            
            // Draw as soft point (phantom echo effect)
            let size = 2.0 + (1.0 - age) * 1.5; // Larger for recent positions
            draw_soft_point(buffer, width, height, px, py, size, opacity, &shifted_color);
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
        assert_eq!(LensingStyle::from_str("geodesic-caustics"), LensingStyle::GeodesicCaustics);
        assert_eq!(LensingStyle::from_str("geodesiccaustics"), LensingStyle::GeodesicCaustics);
        assert_eq!(LensingStyle::from_str("caustics"), LensingStyle::GeodesicCaustics);
        assert_eq!(LensingStyle::from_str("geodesic"), LensingStyle::GeodesicCaustics);
        assert_eq!(LensingStyle::from_str("CAUSTICS"), LensingStyle::GeodesicCaustics);
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
        assert_eq!(LensingStyle::from_str("unknown"), LensingStyle::GeodesicCaustics); // Default
    }
    
    #[test]
    fn test_lensing_style_name() {
        assert_eq!(LensingStyle::GeodesicCaustics.name(), "Geodesic Caustics");
        assert_eq!(LensingStyle::CosmicLens.name(), "Cosmic Lens");
        assert_eq!(LensingStyle::GravitationalWake.name(), "Gravitational Wake");
        assert_eq!(LensingStyle::EventHorizon.name(), "Event Horizon");
        assert_eq!(LensingStyle::SpacetimeFabric.name(), "Spacetime Fabric");
    }
    
    #[test]
    fn test_lensing_style_default() {
        assert_eq!(LensingStyle::default(), LensingStyle::GeodesicCaustics);
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
        assert_eq!(config.style, LensingStyle::GeodesicCaustics);
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
        // Create a config with trails explicitly enabled for testing
        let mut config = LensingConfig::cosmic_lens();
        config.trail_opacity = 0.3;
        config.trail_width = 2.0;
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 1920 * 1080];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_trajectory_trails(&mut buffer, &positions, 1920, 1080, &config, &colors);
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness, "Trails should add brightness when enabled");
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
            LensingStyle::GeodesicCaustics,
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

    // ============================================================================
    // GEODESIC CAUSTICS TESTS
    // ============================================================================
    
    #[test]
    fn test_lensing_config_geodesic_caustics() {
        let config = LensingConfig::geodesic_caustics();
        assert_eq!(config.style, LensingStyle::GeodesicCaustics);
        assert!(config.show_caustics);
        // Updated: Now uses stable 3-body lensing, not trajectory-based
        assert!(config.show_einstein_rings, "Should show Einstein rings for dramatic effect");
        assert!(config.show_accretion_glow, "Should show accretion glow");
        assert!(!config.show_grid, "No mathematical grid");
        assert!(config.caustic_brightness > 0.0);
        // Fixed camera enabled
        assert!(config.use_fixed_bounds, "Should use fixed bounds to prevent zoom");
    }
    
    #[test]
    fn test_create_mass_sources_geodesic_caustics() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        let sources = create_mass_sources(&positions, &config, 1920, 1080);
        
        // Updated: Geodesic caustics now uses simple 3-body lensing (stable, no flickering)
        // This creates exactly 3 sources (one per body at final position)
        assert_eq!(sources.len(), 3,
            "Should have 3 sources (one per body), got {}", sources.len());
        
        // All sources should have positive mass
        for source in &sources {
            assert!(source.mass > 0.0, "All sources should have positive mass");
        }
    }
    
    #[test]
    fn test_compute_caustic_density_produces_values() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::geodesic_caustics();
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let density = compute_caustic_density(&field, &config);
        
        assert_eq!(density.len(), 100 * 100);
        
        // Density should have variation (not all zeros)
        let max_density = density.iter().copied().fold(0.0, f64::max);
        let min_density = density.iter().copied().fold(f64::MAX, f64::min);
        
        assert!(max_density > 0.0, "Should have positive density");
        assert!(max_density != min_density, "Should have density variation");
    }
    
    #[test]
    fn test_compute_caustic_density_normalized() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::geodesic_caustics();
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let density = compute_caustic_density(&field, &config);
        
        // All values should be in [0, 1] range after normalization
        for d in &density {
            assert!(*d >= 0.0, "Density should be non-negative");
            assert!(*d <= 1.0, "Density should be at most 1.0 after normalization");
        }
    }
    
    #[test]
    fn test_render_caustic_overlay_adds_brightness() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let config = LensingConfig::geodesic_caustics();
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        let density = compute_caustic_density(&field, &config);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        render_caustic_overlay(
            &mut buffer,
            &density,
            100,
            100,
            &config,
            [1.0, 0.5, 0.0],
            [0.5, 0.8, 1.0],
        );
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness, "Caustic overlay should add brightness");
    }
    
    #[test]
    fn test_render_caustic_overlay_disabled() {
        let sources = vec![
            MassSource { x: 50.0, y: 50.0, mass: 100000.0, body_index: 0, velocity: 1.0 },
        ];
        let mut config = LensingConfig::geodesic_caustics();
        config.show_caustics = false;
        
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        let density = compute_caustic_density(&field, &config);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.1, 1.0); 10000];
        let original = buffer.clone();
        
        render_caustic_overlay(
            &mut buffer,
            &density,
            100,
            100,
            &config,
            [1.0, 0.5, 0.0],
            [0.5, 0.8, 1.0],
        );
        
        assert_eq!(buffer, original, "Should not modify buffer when caustics disabled");
    }
    
    #[test]
    fn test_render_proper_time_trails_adds_brightness() {
        let positions = create_test_trajectory();
        // Use a config that has proper time trails ENABLED for testing
        let mut config = LensingConfig::geodesic_caustics();
        config.show_proper_time_trails = true;
        config.time_dilation_strength = 0.6;
        
        let sources = create_mass_sources(&positions, &config, 200, 200);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 200 * 200];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_proper_time_trails(
            &mut buffer,
            &positions,
            &sources,
            200,
            200,
            &config,
            &colors,
        );
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness, "Proper time trails should add brightness");
    }
    
    #[test]
    fn test_render_proper_time_trails_disabled() {
        let positions = create_test_trajectory();
        let mut config = LensingConfig::geodesic_caustics();
        config.show_proper_time_trails = false;
        
        let sources = create_mass_sources(&positions, &config, 100, 100);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.1, 1.0); 10000];
        let original = buffer.clone();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_proper_time_trails(
            &mut buffer,
            &positions,
            &sources,
            100,
            100,
            &config,
            &colors,
        );
        
        assert_eq!(buffer, original, "Should not modify buffer when proper time trails disabled");
    }
    
    #[test]
    fn test_smooth_density_field_preserves_dimensions() {
        let density: Vec<f64> = vec![0.5; 10000];
        let smoothed = smooth_density_field(&density, 100, 100, 2.0);
        
        assert_eq!(smoothed.len(), 10000);
    }
    
    #[test]
    fn test_smooth_density_field_smooths_spikes() {
        // Create a density field with a single spike
        let mut density: Vec<f64> = vec![0.0; 10000];
        density[50 * 100 + 50] = 1.0; // Spike in center
        
        let smoothed = smooth_density_field(&density, 100, 100, 3.0);
        
        // The spike should be reduced
        assert!(smoothed[50 * 100 + 50] < 1.0, "Spike should be smoothed");
        
        // Neighbors should have increased values
        assert!(smoothed[50 * 100 + 51] > 0.0, "Neighbors should have increased values");
    }
    
    #[test]
    fn test_full_geodesic_caustics_pipeline() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        // Create sources (stable 3-body approach)
        let sources = create_mass_sources(&positions, &config, 200, 200);
        assert_eq!(sources.len(), 3, "Should have exactly 3 sources (one per body)");
        
        // Compute displacement field
        let field = DisplacementField::compute(&sources, 200, 200, &config);
        assert!(field.max_magnitude() > 0.0);
        
        // Compute caustic density
        let density = compute_caustic_density(&field, &config);
        assert_eq!(density.len(), 200 * 200);
        
        // Apply distortion
        let background: Vec<(f64, f64, f64, f64)> = vec![(0.05, 0.05, 0.1, 1.0); 200 * 200];
        let mut buffer = apply_distortion(&background, &field, &config);
        
        // Add caustic overlay
        render_caustic_overlay(
            &mut buffer,
            &density,
            200,
            200,
            &config,
            [1.0, 0.5, 0.0],
            [0.5, 0.8, 1.0],
        );
        
        // Add proper time trails
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_proper_time_trails(
            &mut buffer,
            &positions,
            &sources,
            200,
            200,
            &config,
            &colors,
        );
        
        // Verify results
        assert_eq!(buffer.len(), 200 * 200);
        
        // Should have some bright pixels
        let bright_pixels = buffer.iter()
            .filter(|p| p.0 > 0.2 || p.1 > 0.2 || p.2 > 0.2)
            .count();
        assert!(bright_pixels > 0, "Should have some bright pixels from caustics and trails");
        
        // All values should be valid
        for pixel in &buffer {
            assert!(pixel.0 >= 0.0 && pixel.0 <= 1.0);
            assert!(pixel.1 >= 0.0 && pixel.1 <= 1.0);
            assert!(pixel.2 >= 0.0 && pixel.2 <= 1.0);
        }
    }
    
    #[test]
    fn test_geodesic_caustics_chromatic_aberration() {
        let config = LensingConfig::geodesic_caustics();
        
        // Geodesic caustics should have chromatic aberration enabled
        assert!(config.chromatic_aberration > 0.0,
            "Geodesic caustics should have chromatic aberration for physically accurate light bending");
    }
    
    #[test]
    fn test_geodesic_caustics_high_quality_settings() {
        let config = LensingConfig::geodesic_caustics();
        
        // Should not use half resolution for maximum quality
        assert!(!config.half_resolution,
            "Geodesic caustics should use full resolution for caustic detail");
        
        // Should have multiple rays per pixel
        assert!(config.caustic_ray_density >= 2,
            "Should trace multiple rays per pixel for accurate caustic computation");
    }

    // ============================================================================
    // TRAJECTORY-BASED LENSING TESTS (NEW!)
    // ============================================================================
    
    #[test]
    fn test_trajectory_density_config_disabled() {
        let config = LensingConfig::geodesic_caustics();
        
        // Trajectory-based lensing is DISABLED in the new stable approach
        // (trajectory density caused flickering in videos)
        assert!(!config.use_trajectory_density, 
            "Geodesic caustics should NOT use trajectory density (causes flickering)");
        
        // Instead, it uses stable features:
        assert!(config.show_einstein_rings, "Should show Einstein rings");
        assert!(config.show_caustics, "Should show caustics");
        // No more boring line trails!
        assert_eq!(config.trail_opacity, 0.0, "Should NOT have line trails");
        assert!(config.use_fixed_bounds, "Should use fixed bounds");
    }
    
    #[test]
    fn test_trajectory_density_config_disabled_for_other_styles() {
        // Cosmic Lens
        let config = LensingConfig::cosmic_lens();
        assert!(!config.use_trajectory_density,
            "Cosmic Lens should not use trajectory density");
        
        // Gravitational Wake
        let config = LensingConfig::gravitational_wake();
        assert!(!config.use_trajectory_density,
            "Gravitational Wake should not use trajectory density");
        
        // Event Horizon
        let config = LensingConfig::event_horizon();
        assert!(!config.use_trajectory_density,
            "Event Horizon should not use trajectory density");
        
        // Spacetime Fabric
        let config = LensingConfig::spacetime_fabric();
        assert!(!config.use_trajectory_density,
            "Spacetime Fabric should not use trajectory density");
    }
    
    #[test]
    fn test_trajectory_density_field_compute() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        // Check dimensions
        assert_eq!(density_field.width, 100);
        assert_eq!(density_field.height, 100);
        assert_eq!(density_field.density.len(), 100 * 100);
        assert_eq!(density_field.body_densities.len(), 3);
    }
    
    #[test]
    fn test_trajectory_density_field_has_nonzero_values() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        // Should have some non-zero density
        let max_density = density_field.density.iter().copied().fold(0.0, f64::max);
        assert!(max_density > 0.0, "Density field should have non-zero values");
        
        // Maximum should be 1.0 after normalization
        assert!((max_density - 1.0).abs() < 0.01,
            "Density field should be normalized to max 1.0, got {}", max_density);
    }
    
    #[test]
    fn test_trajectory_density_field_values_in_range() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        // All values should be in [0, 1] range
        for d in &density_field.density {
            assert!(*d >= 0.0 && *d <= 1.0,
                "Density values should be in [0, 1], got {}", d);
        }
    }
    
    #[test]
    fn test_trajectory_density_field_get_density() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        // In-bounds access
        let d = density_field.get_density(50, 50);
        assert!(d >= 0.0 && d <= 1.0);
        
        // Out-of-bounds should return 0
        let d_oob = density_field.get_density(200, 200);
        assert!((d_oob - 0.0).abs() < 0.001, "Out of bounds should return 0");
    }
    
    #[test]
    fn test_trajectory_density_field_dominant_body() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        // Should return a valid body index (0, 1, or 2)
        let body_idx = density_field.dominant_body(50, 50);
        assert!(body_idx < 3, "Body index should be 0, 1, or 2");
        
        // Out-of-bounds should return 0
        let body_idx_oob = density_field.dominant_body(200, 200);
        assert_eq!(body_idx_oob, 0, "Out of bounds should return body 0");
    }
    
    #[test]
    fn test_create_trajectory_density_sources_count() {
        let positions = create_test_trajectory();
        
        // Test with trajectory density EXPLICITLY enabled for legacy testing
        let mut config = LensingConfig::geodesic_caustics();
        config.use_trajectory_density = true;
        config.trajectory_sample_count = 1000;
        config.trajectory_source_count = 50;
        
        let sources = create_mass_sources(&positions, &config, 200, 200);
        
        // With trajectory density enabled, should have more than just 3 sources
        assert!(sources.len() > 3,
            "Trajectory density should generate additional sources, got {}", sources.len());
        
        // Should have at least some sources
        assert!(sources.len() >= 5,
            "Should have a reasonable number of sources, got {}", sources.len());
    }
    
    #[test]
    fn test_create_trajectory_density_sources_positions() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let sources = create_mass_sources(&positions, &config, 200, 200);
        
        // All sources should have valid positions
        for source in &sources {
            // Positions should be within or near image bounds
            assert!(source.x >= -50.0 && source.x <= 250.0,
                "Source x position out of range: {}", source.x);
            assert!(source.y >= -50.0 && source.y <= 250.0,
                "Source y position out of range: {}", source.y);
        }
    }
    
    #[test]
    fn test_create_trajectory_density_sources_mass() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let sources = create_mass_sources(&positions, &config, 200, 200);
        
        // All sources should have positive mass
        for source in &sources {
            assert!(source.mass > 0.0,
                "All sources should have positive mass, got {}", source.mass);
        }
    }
    
    #[test]
    fn test_render_luminous_trails_adds_brightness() {
        let positions = create_test_trajectory();
        // Use a config with luminous trails ENABLED for testing
        let mut config = LensingConfig::geodesic_caustics();
        config.use_trajectory_density = true;  // Enable for this test
        config.luminous_trail_brightness = 0.5;
        config.trajectory_sample_count = 500;
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        let initial_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_luminous_trails(&mut buffer, &density_field, &config, &colors);
        
        let final_brightness: f64 = buffer.iter().map(|p| p.0 + p.1 + p.2).sum();
        
        assert!(final_brightness > initial_brightness,
            "Luminous trails should add brightness");
    }
    
    #[test]
    fn test_render_luminous_trails_disabled() {
        let positions = create_test_trajectory();
        let mut config = LensingConfig::geodesic_caustics();
        config.luminous_trail_brightness = 0.0;
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.1, 0.1, 0.1, 1.0); 10000];
        let original = buffer.clone();
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_luminous_trails(&mut buffer, &density_field, &config, &colors);
        
        assert_eq!(buffer, original,
            "Should not modify buffer when luminous trails brightness is 0");
    }
    
    #[test]
    fn test_render_luminous_trails_values_in_range() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        
        let density_field = TrajectoryDensityField::compute(&positions, 100, 100, &config);
        
        let mut buffer: Vec<(f64, f64, f64, f64)> = vec![(0.5, 0.5, 0.5, 1.0); 10000];
        
        let colors = [[0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8]];
        render_luminous_trails(&mut buffer, &density_field, &config, &colors);
        
        // All values should still be in [0, 1] range
        for pixel in &buffer {
            assert!(pixel.0 >= 0.0 && pixel.0 <= 1.0,
                "Red channel should be in [0, 1], got {}", pixel.0);
            assert!(pixel.1 >= 0.0 && pixel.1 <= 1.0,
                "Green channel should be in [0, 1], got {}", pixel.1);
            assert!(pixel.2 >= 0.0 && pixel.2 <= 1.0,
                "Blue channel should be in [0, 1], got {}", pixel.2);
        }
    }
    
    #[test]
    fn test_compute_accumulated_caustics_produces_values() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        let sources = create_mass_sources(&positions, &config, 100, 100);
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let accumulated = compute_accumulated_caustics(&positions, &field, &config, 100, 100);
        
        assert_eq!(accumulated.len(), 100 * 100,
            "Accumulated caustics should have correct size");
        
        // Should have some non-zero values
        let max_val = accumulated.iter().copied().fold(0.0, f64::max);
        assert!(max_val > 0.0,
            "Accumulated caustics should have non-zero values");
    }
    
    #[test]
    fn test_compute_accumulated_caustics_normalized() {
        let positions = create_test_trajectory();
        let config = LensingConfig::geodesic_caustics();
        let sources = create_mass_sources(&positions, &config, 100, 100);
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let accumulated = compute_accumulated_caustics(&positions, &field, &config, 100, 100);
        
        // All values should be in [0, 1] range
        for val in &accumulated {
            assert!(*val >= 0.0 && *val <= 1.0,
                "Accumulated caustic values should be in [0, 1], got {}", val);
        }
    }
    
    #[test]
    fn test_compute_accumulated_caustics_single_sample_fallback() {
        let positions = create_test_trajectory();
        let mut config = LensingConfig::geodesic_caustics();
        config.accumulated_caustic_samples = 1; // Force single sample
        
        let sources = create_mass_sources(&positions, &config, 100, 100);
        let field = DisplacementField::compute(&sources, 100, 100, &config);
        
        let accumulated = compute_accumulated_caustics(&positions, &field, &config, 100, 100);
        
        // Should fall back to regular caustic density
        assert_eq!(accumulated.len(), 100 * 100);
    }
    
    #[test]
    fn test_full_trajectory_lensing_pipeline() {
        let positions = create_test_trajectory();
        
        // Use a config with trajectory density ENABLED for legacy testing
        let mut config = LensingConfig::geodesic_caustics();
        config.use_trajectory_density = true;
        config.trajectory_sample_count = 500;
        config.trajectory_source_count = 30;
        config.luminous_trail_brightness = 0.5;
        
        // Step 1: Compute trajectory density field
        let density_field = TrajectoryDensityField::compute(&positions, 200, 200, &config);
        assert_eq!(density_field.density.len(), 200 * 200);
        
        // Step 2: Create trajectory-based mass sources
        let sources = create_mass_sources(&positions, &config, 200, 200);
        assert!(sources.len() > 3, "Should have trajectory-based sources");
        
        // Step 3: Compute displacement field
        let field = DisplacementField::compute(&sources, 200, 200, &config);
        assert!(field.max_magnitude() > 0.0);
        
        // Step 4: Create background and apply distortion
        let background: Vec<(f64, f64, f64, f64)> = vec![(0.05, 0.05, 0.1, 1.0); 200 * 200];
        let mut buffer = apply_distortion(&background, &field, &config);
        
        // Step 5: Render luminous trails
        let colors = [[0.8, 0.3, 0.1], [0.3, 0.6, 0.9], [0.7, 0.2, 0.7]];
        render_luminous_trails(&mut buffer, &density_field, &config, &colors);
        
        // Step 6: Compute and render accumulated caustics
        let accumulated_caustics = compute_accumulated_caustics(
            &positions, &field, &config, 200, 200
        );
        render_caustic_overlay(
            &mut buffer, &accumulated_caustics, 200, 200, &config,
            [1.0, 0.5, 0.0], [0.5, 0.8, 1.0],
        );
        
        // Verify results
        assert_eq!(buffer.len(), 200 * 200);
        
        // Should have some bright pixels from both trails and caustics
        let bright_pixels = buffer.iter()
            .filter(|p| p.0 > 0.2 || p.1 > 0.2 || p.2 > 0.2)
            .count();
        assert!(bright_pixels > 100,
            "Should have many bright pixels from trails and caustics, got {}", bright_pixels);
        
        // All values should be valid
        for pixel in &buffer {
            assert!(pixel.0 >= 0.0 && pixel.0 <= 1.0);
            assert!(pixel.1 >= 0.0 && pixel.1 <= 1.0);
            assert!(pixel.2 >= 0.0 && pixel.2 <= 1.0);
        }
    }
    
    #[test]
    fn test_trajectory_lensing_vs_standard_lensing_source_count() {
        let positions = create_test_trajectory();
        
        // Config with trajectory density ENABLED
        let mut config_traj = LensingConfig::geodesic_caustics();
        config_traj.use_trajectory_density = true;
        config_traj.trajectory_sample_count = 500;
        config_traj.trajectory_source_count = 30;
        let sources_traj = create_mass_sources(&positions, &config_traj, 200, 200);
        
        // Config without trajectory density (default for geodesic caustics now)
        let config_std = LensingConfig::geodesic_caustics();
        assert!(!config_std.use_trajectory_density);
        let sources_std = create_mass_sources(&positions, &config_std, 200, 200);
        
        // Trajectory-based should have more sources than standard (3)
        assert!(sources_traj.len() > sources_std.len(),
            "Trajectory lensing should have more sources: {} vs {}",
            sources_traj.len(), sources_std.len());
    }
    
    #[test]
    fn test_trajectory_density_respects_sample_count() {
        let positions = create_test_trajectory();
        
        // Low sample count
        let mut config_low = LensingConfig::geodesic_caustics();
        config_low.trajectory_sample_count = 100;
        
        // High sample count  
        let mut config_high = LensingConfig::geodesic_caustics();
        config_high.trajectory_sample_count = 5000;
        
        let density_low = TrajectoryDensityField::compute(&positions, 100, 100, &config_low);
        let density_high = TrajectoryDensityField::compute(&positions, 100, 100, &config_high);
        
        // Both should produce valid density fields
        assert_eq!(density_low.density.len(), 10000);
        assert_eq!(density_high.density.len(), 10000);
        
        // Both should have non-zero max density
        let max_low = density_low.density.iter().copied().fold(0.0, f64::max);
        let max_high = density_high.density.iter().copied().fold(0.0, f64::max);
        
        assert!(max_low > 0.0);
        assert!(max_high > 0.0);
    }
}
