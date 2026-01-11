//! Gravitational Lensing Renderer v2
//!
//! Complete rendering pipeline for physics-inspired gravitational lensing visualization.
//! This module orchestrates background generation, lensing distortion, Einstein rings,
//! and finishing effects into museum-quality artwork.
//!
//! # Styles
//!
//! - **Cosmic Lens**: 3 massive bodies with dramatic Einstein rings (default)
//! - **Gravitational Wake**: Trajectory centroids create rippling patterns
//! - **Event Horizon**: Extreme distortion with accretion glow
//! - **Spacetime Fabric**: Grid overlay showing mathematical curvature

#![allow(clippy::unreadable_literal)]
#![allow(dead_code)]

use nalgebra::Vector3;
use rayon::prelude::*;
use image::{ImageBuffer, Rgb};

use super::gravitational_lensing::{
    LensingConfig, LensingStyle,
    create_mass_sources, DisplacementField, apply_distortion,
    render_einstein_rings, render_accretion_glow, render_grid_overlay,
    render_trajectory_trails, compute_caustic_density, render_caustic_overlay,
    render_proper_time_trails, TrajectoryDensityField, render_luminous_trails,
    compute_accumulated_caustics,
};
use super::lensing_background::{LensingBackgroundConfig, generate_background};
use super::cosmic_palette::{CosmicPalette, EVENT_HORIZON, ICE_AND_FIRE, DEEP_OCEAN, RED_DWARF};
use super::film_grain::{FilmGrainConfig, apply_film_grain, apply_vignette};

// ============================================================================
// RENDERER CONFIGURATION
// ============================================================================

/// Complete configuration for the lensing renderer
#[derive(Clone, Debug)]
pub struct LensingRendererConfig {
    /// Lensing physics configuration
    pub lensing: LensingConfig,
    
    /// Background generation configuration
    pub background: LensingBackgroundConfig,
    
    /// Film grain configuration
    pub grain: FilmGrainConfig,
    
    /// Vignette strength (0 = none, 1 = strong)
    pub vignette_strength: f64,
    
    /// Vignette radius (where falloff starts, 0-1)
    pub vignette_radius: f64,
    
    /// Gamma correction value
    pub gamma: f64,
    
    /// Palette name for automatic selection
    pub palette_name: String,
}

impl Default for LensingRendererConfig {
    fn default() -> Self {
        Self::geodesic_caustics()
    }
}

impl LensingRendererConfig {
    /// Geodesic Caustics style: Physics-accurate ray tracing with emergent caustic patterns
    /// 
    /// This is the recommended default style - it creates museum-quality art
    /// where the beauty emerges directly from accurate physics visualization.
    /// Caustic curves form naturally where light rays converge through curved spacetime.
    pub fn geodesic_caustics() -> Self {
        Self {
            lensing: LensingConfig::geodesic_caustics(),
            background: LensingBackgroundConfig::deep_field(),
            grain: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.18,
            vignette_radius: 0.65,
            gamma: 2.2,
            palette_name: "Event Horizon".to_string(),
        }
    }
    
    /// Cosmic Lens style: Dramatic Einstein rings around 3 massive bodies
    pub fn cosmic_lens() -> Self {
        Self {
            lensing: LensingConfig::cosmic_lens(),
            background: LensingBackgroundConfig::deep_field(),
            grain: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.2,
            vignette_radius: 0.6,
            gamma: 2.2,
            palette_name: "Event Horizon".to_string(),
        }
    }
    
    /// Gravitational Wake style: Rippling distortion along trajectory paths
    pub fn gravitational_wake() -> Self {
        Self {
            lensing: LensingConfig::gravitational_wake(),
            background: LensingBackgroundConfig::starfield(),
            grain: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.15,
            vignette_radius: 0.65,
            gamma: 2.2,
            palette_name: "Ice and Fire".to_string(),
        }
    }
    
    /// Event Horizon style: Maximum drama with accretion glow
    pub fn event_horizon() -> Self {
        Self {
            lensing: LensingConfig::event_horizon(),
            background: LensingBackgroundConfig::nebula(),
            grain: FilmGrainConfig::museum_quality(),
            vignette_strength: 0.25,
            vignette_radius: 0.55,
            gamma: 2.2,
            palette_name: "Red Dwarf".to_string(),
        }
    }
    
    /// Spacetime Fabric style: Grid overlay for educational visualization
    pub fn spacetime_fabric() -> Self {
        Self {
            lensing: LensingConfig::spacetime_fabric(),
            background: LensingBackgroundConfig::gradient(),
            grain: FilmGrainConfig::none(),
            vignette_strength: 0.1,
            vignette_radius: 0.7,
            gamma: 2.2,
            palette_name: "Deep Ocean".to_string(),
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
        }
    }
    
    /// Create config from style string
    pub fn from_style_str(style: &str) -> Self {
        Self::from_style(LensingStyle::from_str(style))
    }
    
    /// Set custom lensing strength multiplier
    #[must_use]
    pub fn with_strength(mut self, multiplier: f64) -> Self {
        self.lensing.mass_multiplier = multiplier;
        self
    }
    
    /// Enable grid overlay
    #[must_use]
    pub fn with_grid(mut self) -> Self {
        self.lensing.show_grid = true;
        self
    }
}

// ============================================================================
// RENDER RESULT
// ============================================================================

/// Result of lensing rendering
#[derive(Debug)]
pub struct LensingRenderResult {
    /// RGBA buffer with values 0-1
    pub buffer: Vec<(f64, f64, f64, f64)>,
    /// Image width
    pub width: usize,
    /// Image height
    pub height: usize,
    /// Style used
    pub style_name: String,
    /// Palette used
    pub palette_name: String,
    /// Maximum distortion in pixels
    pub max_distortion: f64,
    /// Average distortion in pixels
    pub avg_distortion: f64,
    /// Number of mass sources used
    pub source_count: usize,
}

impl LensingRenderResult {
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
    
    /// Convert to 16-bit RGB image
    pub fn to_image(&self) -> ImageBuffer<Rgb<u16>, Vec<u16>> {
        let rgb_data: Vec<u16> = self.buffer
            .iter()
            .flat_map(|(r, g, b, _)| {
                [
                    (r.clamp(0.0, 1.0) * 65535.0) as u16,
                    (g.clamp(0.0, 1.0) * 65535.0) as u16,
                    (b.clamp(0.0, 1.0) * 65535.0) as u16,
                ]
            })
            .collect();
        
        ImageBuffer::from_raw(self.width as u32, self.height as u32, rgb_data)
            .expect("Buffer size matches image dimensions")
    }
    
    /// Get quality summary
    pub fn quality_summary(&self) -> String {
        format!(
            "{} style, {} palette, {:.1}px max distortion, {} sources",
            self.style_name, self.palette_name, self.max_distortion, self.source_count
        )
    }
}

// ============================================================================
// MAIN RENDERER
// ============================================================================

/// Gravitational Lensing Renderer v2
/// 
/// Creates museum-quality visualizations of spacetime distortion.
pub struct LensingRenderer {
    config: LensingRendererConfig,
}

impl LensingRenderer {
    /// Create a new renderer with the given configuration
    pub fn new(config: LensingRendererConfig) -> Self {
        Self { config }
    }
    
    /// Create renderer for a specific style
    pub fn for_style(style: LensingStyle) -> Self {
        Self::new(LensingRendererConfig::from_style(style))
    }
    
    /// Create renderer from style string
    pub fn from_style_str(style: &str) -> Self {
        Self::new(LensingRendererConfig::from_style_str(style))
    }
    
    /// Render trajectories with gravitational lensing effect
    pub fn render(
        &self,
        positions: &[Vec<Vector3<f64>>],
        width: usize,
        height: usize,
        seed: u64,
    ) -> LensingRenderResult {
        self.render_with_palette(positions, width, height, seed, None)
    }
    
    /// Render with a specific palette
    pub fn render_with_palette(
        &self,
        positions: &[Vec<Vector3<f64>>],
        width: usize,
        height: usize,
        seed: u64,
        palette_override: Option<&CosmicPalette>,
    ) -> LensingRenderResult {
        // Select palette
        let palette = palette_override.unwrap_or_else(|| {
            self.select_palette()
        });
        
        // Body colors for trail rendering
        let body_colors = [palette.primary, palette.accent, blend_colors(&palette.primary, &palette.accent)];
        
        // Step 1: Generate background
        let mut buffer = generate_background(
            width,
            height,
            palette,
            &self.config.background,
            seed,
        );
        
        // Step 2: Compute trajectory density field (for Geodesic Caustics with trajectory density)
        let trajectory_density = if self.config.lensing.use_trajectory_density {
            Some(TrajectoryDensityField::compute(
                positions,
                width,
                height,
                &self.config.lensing,
            ))
        } else {
            None
        };
        
        // Step 3: Create mass sources (uses trajectory density if enabled)
        let sources = create_mass_sources(
            positions,
            &self.config.lensing,
            width,
            height,
        );
        
        // Step 4: Compute displacement field
        let field = DisplacementField::compute(
            &sources,
            width,
            height,
            &self.config.lensing,
        );
        
        let max_distortion = field.max_magnitude();
        let avg_distortion = field.avg_magnitude();
        
        // Step 5: Apply lensing distortion
        buffer = apply_distortion(&buffer, &field, &self.config.lensing);
        
        // Step 6: Render luminous trails BEFORE caustics (so caustics appear on top)
        // This creates the glowing orbital history visualization
        if let Some(ref density_field) = trajectory_density {
            render_luminous_trails(
                &mut buffer,
                density_field,
                &self.config.lensing,
                &body_colors,
            );
        }
        
        // Step 7: Render caustic overlay (for Geodesic Caustics style)
        if self.config.lensing.show_caustics {
            // Use accumulated caustics if trajectory density is enabled
            let caustic_density = if self.config.lensing.use_trajectory_density 
                && self.config.lensing.accumulated_caustic_samples > 1 {
                compute_accumulated_caustics(
                    positions,
                    &field,
                    &self.config.lensing,
                    width,
                    height,
                )
            } else {
                compute_caustic_density(&field, &self.config.lensing)
            };
            
            render_caustic_overlay(
                &mut buffer,
                &caustic_density,
                width,
                height,
                &self.config.lensing,
                palette.primary,
                palette.accent,
            );
        }
        
        // Step 8: Render grid overlay (if enabled)
        if self.config.lensing.show_grid {
            render_grid_overlay(
                &mut buffer,
                &field,
                width,
                height,
                self.config.lensing.grid_spacing,
                self.config.lensing.grid_opacity,
                palette.accent,
            );
        }
        
        // Step 9: Render accretion glow (if enabled)
        render_accretion_glow(
            &mut buffer,
            &sources,
            width,
            height,
            &self.config.lensing,
            palette.primary,
        );
        
        // Step 10: Render Einstein rings (if enabled)
        render_einstein_rings(
            &mut buffer,
            &sources,
            width,
            height,
            &self.config.lensing,
            palette.accent,
        );
        
        // Step 11: Render trajectory trails
        // Use proper-time trails for Geodesic Caustics, standard trails otherwise
        // Skip if we already rendered luminous trails
        if !self.config.lensing.use_trajectory_density {
            if self.config.lensing.show_proper_time_trails {
                render_proper_time_trails(
                    &mut buffer,
                    positions,
                    &sources,
                    width,
                    height,
                    &self.config.lensing,
                    &body_colors,
                );
            } else {
                render_trajectory_trails(
                    &mut buffer,
                    positions,
                    width,
                    height,
                    &self.config.lensing,
                    &body_colors,
                );
            }
        }
        
        // Step 12: Apply vignette
        if self.config.vignette_strength > 0.0 {
            buffer = apply_vignette(
                &buffer,
                width,
                height,
                self.config.vignette_strength,
                self.config.vignette_radius,
            );
        }
        
        // Step 13: Apply film grain
        if self.config.grain.intensity > 0.0 {
            buffer = apply_film_grain(
                &buffer,
                width,
                height,
                &self.config.grain,
                seed + 1000,
            );
        }
        
        // Step 14: Apply gamma correction
        buffer = apply_gamma(&buffer, self.config.gamma);
        
        LensingRenderResult {
            buffer,
            width,
            height,
            style_name: self.config.lensing.style.name().to_string(),
            palette_name: palette.name.to_string(),
            max_distortion,
            avg_distortion,
            source_count: sources.len(),
        }
    }
    
    /// Select palette based on configuration
    fn select_palette(&self) -> &'static CosmicPalette {
        match self.config.palette_name.as_str() {
            "Event Horizon" => &EVENT_HORIZON,
            "Ice and Fire" => &ICE_AND_FIRE,
            "Red Dwarf" => &RED_DWARF,
            "Deep Ocean" => &DEEP_OCEAN,
            _ => &EVENT_HORIZON,
        }
    }
}

/// Blend two colors
fn blend_colors(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        (a[0] + b[0]) * 0.5,
        (a[1] + b[1]) * 0.5,
        (a[2] + b[2]) * 0.5,
    ]
}

/// Apply gamma correction
fn apply_gamma(buffer: &[(f64, f64, f64, f64)], gamma: f64) -> Vec<(f64, f64, f64, f64)> {
    let inv_gamma = 1.0 / gamma;
    
    buffer
        .par_iter()
        .map(|(r, g, b, a)| {
            (
                r.clamp(0.0, 1.0).powf(inv_gamma),
                g.clamp(0.0, 1.0).powf(inv_gamma),
                b.clamp(0.0, 1.0).powf(inv_gamma),
                *a,
            )
        })
        .collect()
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

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

    // ---- Config tests ----
    
    #[test]
    fn test_config_geodesic_caustics() {
        let config = LensingRendererConfig::geodesic_caustics();
        assert_eq!(config.lensing.style, LensingStyle::GeodesicCaustics);
        assert!(config.lensing.show_caustics);
        assert!(config.lensing.show_proper_time_trails);
        assert!(!config.lensing.show_einstein_rings); // Uses emergent caustics instead
    }
    
    #[test]
    fn test_config_cosmic_lens() {
        let config = LensingRendererConfig::cosmic_lens();
        assert_eq!(config.lensing.style, LensingStyle::CosmicLens);
        assert!(config.lensing.show_einstein_rings);
    }
    
    #[test]
    fn test_config_gravitational_wake() {
        let config = LensingRendererConfig::gravitational_wake();
        assert_eq!(config.lensing.style, LensingStyle::GravitationalWake);
        assert!(config.lensing.wake_centroids > 10);
    }
    
    #[test]
    fn test_config_event_horizon() {
        let config = LensingRendererConfig::event_horizon();
        assert_eq!(config.lensing.style, LensingStyle::EventHorizon);
        assert!(config.lensing.show_accretion_glow);
    }
    
    #[test]
    fn test_config_spacetime_fabric() {
        let config = LensingRendererConfig::spacetime_fabric();
        assert_eq!(config.lensing.style, LensingStyle::SpacetimeFabric);
        assert!(config.lensing.show_grid);
    }
    
    #[test]
    fn test_config_from_style_str() {
        let geodesic = LensingRendererConfig::from_style_str("geodesic-caustics");
        assert_eq!(geodesic.lensing.style, LensingStyle::GeodesicCaustics);
        
        let caustics = LensingRendererConfig::from_style_str("caustics");
        assert_eq!(caustics.lensing.style, LensingStyle::GeodesicCaustics);
        
        let cosmic = LensingRendererConfig::from_style_str("cosmic-lens");
        assert_eq!(cosmic.lensing.style, LensingStyle::CosmicLens);
        
        let wake = LensingRendererConfig::from_style_str("wake");
        assert_eq!(wake.lensing.style, LensingStyle::GravitationalWake);
        
        let horizon = LensingRendererConfig::from_style_str("event-horizon");
        assert_eq!(horizon.lensing.style, LensingStyle::EventHorizon);
        
        let fabric = LensingRendererConfig::from_style_str("fabric");
        assert_eq!(fabric.lensing.style, LensingStyle::SpacetimeFabric);
        
        // Default should now be GeodesicCaustics
        let unknown = LensingRendererConfig::from_style_str("unknown");
        assert_eq!(unknown.lensing.style, LensingStyle::GeodesicCaustics);
    }
    
    #[test]
    fn test_config_with_strength() {
        let config = LensingRendererConfig::cosmic_lens().with_strength(2.5);
        assert!((config.lensing.mass_multiplier - 2.5).abs() < 0.001);
    }
    
    #[test]
    fn test_config_with_grid() {
        let config = LensingRendererConfig::cosmic_lens().with_grid();
        assert!(config.lensing.show_grid);
    }

    // ---- Renderer tests ----
    
    #[test]
    fn test_renderer_creation() {
        let renderer = LensingRenderer::new(LensingRendererConfig::default());
        assert_eq!(renderer.config.lensing.style, LensingStyle::GeodesicCaustics);
    }
    
    #[test]
    fn test_renderer_for_style() {
        let renderer = LensingRenderer::for_style(LensingStyle::EventHorizon);
        assert_eq!(renderer.config.lensing.style, LensingStyle::EventHorizon);
    }
    
    #[test]
    fn test_renderer_from_style_str() {
        let renderer = LensingRenderer::from_style_str("gravitational-wake");
        assert_eq!(renderer.config.lensing.style, LensingStyle::GravitationalWake);
    }

    // ---- Render result tests ----
    
    #[test]
    fn test_render_geodesic_caustics() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::GeodesicCaustics);
        
        let result = renderer.render(&positions, 200, 200, 123);
        
        assert_eq!(result.width, 200);
        assert_eq!(result.height, 200);
        assert_eq!(result.buffer.len(), 200 * 200);
        // With trajectory density enabled, we have many more sources
        assert!(result.source_count > 3,
            "Geodesic caustics with trajectory density should have many sources, got {}",
            result.source_count);
        assert!(result.max_distortion > 0.0);
        assert_eq!(result.style_name, "Geodesic Caustics");
    }
    
    #[test]
    fn test_render_cosmic_lens() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::CosmicLens);
        
        let result = renderer.render(&positions, 200, 200, 123);
        
        assert_eq!(result.width, 200);
        assert_eq!(result.height, 200);
        assert_eq!(result.buffer.len(), 200 * 200);
        assert_eq!(result.source_count, 3);
        assert!(result.max_distortion > 0.0);
        assert_eq!(result.style_name, "Cosmic Lens");
    }
    
    #[test]
    fn test_render_gravitational_wake() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::GravitationalWake);
        
        let result = renderer.render(&positions, 200, 200, 456);
        
        assert_eq!(result.width, 200);
        assert_eq!(result.height, 200);
        assert!(result.source_count > 3); // Wake creates multiple centroids
        assert_eq!(result.style_name, "Gravitational Wake");
    }
    
    #[test]
    fn test_render_event_horizon() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::EventHorizon);
        
        let result = renderer.render(&positions, 200, 200, 789);
        
        assert_eq!(result.source_count, 3);
        assert!(result.max_distortion > 50.0); // Should have strong distortion
        assert_eq!(result.style_name, "Event Horizon");
    }
    
    #[test]
    fn test_render_spacetime_fabric() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::SpacetimeFabric);
        
        let result = renderer.render(&positions, 200, 200, 101112);
        
        assert_eq!(result.source_count, 3);
        assert_eq!(result.style_name, "Spacetime Fabric");
    }
    
    #[test]
    fn test_render_all_styles_produce_valid_output() {
        let positions = create_test_trajectory();
        
        for style in [
            LensingStyle::GeodesicCaustics,
            LensingStyle::CosmicLens,
            LensingStyle::GravitationalWake,
            LensingStyle::EventHorizon,
            LensingStyle::SpacetimeFabric,
        ] {
            let renderer = LensingRenderer::for_style(style.clone());
            let result = renderer.render(&positions, 100, 100, 42);
            
            // Check all pixels are valid
            for pixel in &result.buffer {
                assert!(pixel.0 >= 0.0 && pixel.0 <= 1.0, "Red out of range for {:?}", style);
                assert!(pixel.1 >= 0.0 && pixel.1 <= 1.0, "Green out of range for {:?}", style);
                assert!(pixel.2 >= 0.0 && pixel.2 <= 1.0, "Blue out of range for {:?}", style);
                assert!(pixel.3 >= 0.0 && pixel.3 <= 1.0, "Alpha out of range for {:?}", style);
            }
        }
    }
    
    #[test]
    fn test_render_result_to_u16() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::CosmicLens);
        let result = renderer.render(&positions, 100, 100, 42);
        
        let u16_data = result.to_u16();
        
        assert_eq!(u16_data.len(), 100 * 100 * 4); // RGBA - all values valid by type
    }
    
    #[test]
    fn test_render_result_to_image() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::CosmicLens);
        let result = renderer.render(&positions, 100, 100, 42);
        
        let img = result.to_image();
        
        assert_eq!(img.width(), 100);
        assert_eq!(img.height(), 100);
    }
    
    #[test]
    fn test_render_result_quality_summary() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::CosmicLens);
        let result = renderer.render(&positions, 100, 100, 42);
        
        let summary = result.quality_summary();
        
        assert!(summary.contains("Cosmic Lens"));
        assert!(summary.contains("Event Horizon")); // Palette name
        assert!(summary.contains("sources"));
    }
    
    #[test]
    fn test_render_with_custom_strength() {
        let positions = create_test_trajectory();
        
        // Use very different strengths to ensure noticeable difference
        let weak_config = LensingRendererConfig::cosmic_lens().with_strength(0.1);
        let strong_config = LensingRendererConfig::cosmic_lens().with_strength(5.0);
        
        let weak_renderer = LensingRenderer::new(weak_config);
        let strong_renderer = LensingRenderer::new(strong_config);
        
        // Use larger resolution to avoid edge effects
        let weak_result = weak_renderer.render(&positions, 400, 400, 42);
        let strong_result = strong_renderer.render(&positions, 400, 400, 42);
        
        // Stronger lensing should produce more distortion (or at least equal due to clamping)
        assert!(strong_result.max_distortion >= weak_result.max_distortion,
            "Strong distortion ({}) should be >= weak distortion ({})",
            strong_result.max_distortion, weak_result.max_distortion);
    }
    
    #[test]
    fn test_render_deterministic() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::CosmicLens);
        
        let result1 = renderer.render(&positions, 100, 100, 12345);
        let result2 = renderer.render(&positions, 100, 100, 12345);
        
        // Same seed should produce same result
        assert_eq!(result1.buffer.len(), result2.buffer.len());
        
        for (p1, p2) in result1.buffer.iter().zip(result2.buffer.iter()) {
            assert!((p1.0 - p2.0).abs() < 0.0001);
            assert!((p1.1 - p2.1).abs() < 0.0001);
            assert!((p1.2 - p2.2).abs() < 0.0001);
        }
    }
    
    #[test]
    fn test_render_different_seeds_produce_different_results() {
        let positions = create_test_trajectory();
        let renderer = LensingRenderer::for_style(LensingStyle::CosmicLens);
        
        let result1 = renderer.render(&positions, 100, 100, 111);
        let result2 = renderer.render(&positions, 100, 100, 222);
        
        // Different seeds should produce different backgrounds
        let different_pixels = result1.buffer.iter().zip(result2.buffer.iter())
            .filter(|(p1, p2)| (p1.0 - p2.0).abs() > 0.01)
            .count();
        
        assert!(different_pixels > 100, "Different seeds should produce different results");
    }

    // ---- Helper function tests ----
    
    #[test]
    fn test_blend_colors() {
        let a = [1.0, 0.0, 0.0];
        let b = [0.0, 1.0, 0.0];
        let blended = blend_colors(&a, &b);
        
        assert!((blended[0] - 0.5).abs() < 0.001);
        assert!((blended[1] - 0.5).abs() < 0.001);
        assert!((blended[2] - 0.0).abs() < 0.001);
    }
    
    #[test]
    fn test_apply_gamma() {
        let buffer = vec![(0.5, 0.5, 0.5, 1.0); 10];
        let gamma_corrected = apply_gamma(&buffer, 2.2);
        
        // Gamma 2.2 should brighten mid-tones
        assert!(gamma_corrected[0].0 > 0.5);
        assert!(gamma_corrected[0].1 > 0.5);
        assert!(gamma_corrected[0].2 > 0.5);
    }
    
    #[test]
    fn test_apply_gamma_preserves_alpha() {
        let buffer = vec![(0.5, 0.5, 0.5, 0.7); 10];
        let gamma_corrected = apply_gamma(&buffer, 2.2);
        
        // Alpha should be unchanged
        assert!((gamma_corrected[0].3 - 0.7).abs() < 0.001);
    }
    
    #[test]
    fn test_apply_gamma_linear() {
        let buffer = vec![(0.5, 0.5, 0.5, 1.0); 10];
        let gamma_corrected = apply_gamma(&buffer, 1.0);
        
        // Gamma 1.0 should not change values
        assert!((gamma_corrected[0].0 - 0.5).abs() < 0.001);
    }
}
