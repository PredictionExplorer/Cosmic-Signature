//! Static Background Generator for Gravitational Lensing
//!
//! This module generates beautiful, static starfield and nebula backgrounds
//! that will be distorted by the gravitational lensing effect. The backgrounds
//! are designed to be visually interesting while also making the lensing
//! distortion clearly visible.
//!
//! # Background Types
//!
//! - **Starfield**: Scattered points of light with varying brightness and color
//! - **Nebula**: Soft, colorful gas clouds with fractal structure
//! - **Deep Field**: Combination of stars and distant galaxies
//! - **Grid**: Debug/educational overlay showing spacetime curvature

#![allow(dead_code)]
#![allow(clippy::unreadable_literal)]
#![allow(clippy::many_single_char_names)]

use std::f64::consts::PI;
use rayon::prelude::*;

use super::cosmic_palette::CosmicPalette;

/// Configuration for background generation
#[derive(Clone, Debug)]
pub struct LensingBackgroundConfig {
    /// Background style
    pub style: BackgroundStyle,
    
    /// Star density (stars per 1000 pixels)
    pub star_density: f64,
    
    /// Nebula opacity (0-1)
    pub nebula_opacity: f64,
    
    /// Number of nebula layers
    pub nebula_layers: usize,
    
    /// Base frequency for nebula noise
    pub nebula_frequency: f64,
    
    /// Whether to include distant galaxies
    pub include_galaxies: bool,
    
    /// Galaxy density (galaxies per 10000 pixels)
    pub galaxy_density: f64,
    
    /// Whether to apply subtle gradient
    pub gradient_background: bool,
}

/// Background style variants
#[derive(Clone, Debug, PartialEq)]
pub enum BackgroundStyle {
    /// Pure starfield with no nebula
    Starfield,
    /// Nebula clouds with embedded stars
    Nebula,
    /// Deep field with galaxies and nebula
    DeepField,
    /// Pure black (maximum contrast for lensing)
    Void,
    /// Subtle gradient for elegant look
    Gradient,
}

impl Default for LensingBackgroundConfig {
    fn default() -> Self {
        Self::deep_field()
    }
}

impl LensingBackgroundConfig {
    /// Rich deep field background
    pub fn deep_field() -> Self {
        Self {
            style: BackgroundStyle::DeepField,
            star_density: 0.8,
            nebula_opacity: 0.15,
            nebula_layers: 3,
            nebula_frequency: 0.003,
            include_galaxies: true,
            galaxy_density: 0.05,
            gradient_background: true,
        }
    }
    
    /// Simple starfield
    pub fn starfield() -> Self {
        Self {
            style: BackgroundStyle::Starfield,
            star_density: 1.2,
            nebula_opacity: 0.0,
            nebula_layers: 0,
            nebula_frequency: 0.0,
            include_galaxies: false,
            galaxy_density: 0.0,
            gradient_background: true,
        }
    }
    
    /// Nebula-dominated background
    pub fn nebula() -> Self {
        Self {
            style: BackgroundStyle::Nebula,
            star_density: 0.4,
            nebula_opacity: 0.25,
            nebula_layers: 4,
            nebula_frequency: 0.002,
            include_galaxies: false,
            galaxy_density: 0.0,
            gradient_background: false,
        }
    }
    
    /// Pure void (black background)
    pub fn void() -> Self {
        Self {
            style: BackgroundStyle::Void,
            star_density: 0.0,
            nebula_opacity: 0.0,
            nebula_layers: 0,
            nebula_frequency: 0.0,
            include_galaxies: false,
            galaxy_density: 0.0,
            gradient_background: false,
        }
    }
    
    /// Elegant gradient
    pub fn gradient() -> Self {
        Self {
            style: BackgroundStyle::Gradient,
            star_density: 0.3,
            nebula_opacity: 0.0,
            nebula_layers: 0,
            nebula_frequency: 0.0,
            include_galaxies: false,
            galaxy_density: 0.0,
            gradient_background: true,
        }
    }
}

/// Generate a complete background image
pub fn generate_background(
    width: usize,
    height: usize,
    palette: &CosmicPalette,
    config: &LensingBackgroundConfig,
    seed: u64,
) -> Vec<(f64, f64, f64, f64)> {
    match config.style {
        BackgroundStyle::Void => {
            generate_void_background(width, height, palette)
        }
        BackgroundStyle::Gradient => {
            let mut buffer = generate_gradient_background(width, height, palette);
            if config.star_density > 0.0 {
                add_stars(&mut buffer, width, height, palette, config.star_density, seed);
            }
            buffer
        }
        BackgroundStyle::Starfield => {
            let mut buffer = generate_gradient_background(width, height, palette);
            add_stars(&mut buffer, width, height, palette, config.star_density, seed);
            buffer
        }
        BackgroundStyle::Nebula => {
            let mut buffer = generate_void_background(width, height, palette);
            add_nebula(&mut buffer, width, height, palette, config, seed);
            add_stars(&mut buffer, width, height, palette, config.star_density, seed);
            buffer
        }
        BackgroundStyle::DeepField => {
            let mut buffer = if config.gradient_background {
                generate_gradient_background(width, height, palette)
            } else {
                generate_void_background(width, height, palette)
            };
            add_nebula(&mut buffer, width, height, palette, config, seed);
            if config.include_galaxies {
                add_galaxies(&mut buffer, width, height, palette, config.galaxy_density, seed);
            }
            add_stars(&mut buffer, width, height, palette, config.star_density, seed);
            buffer
        }
    }
}

/// Generate pure void background (from palette)
fn generate_void_background(
    width: usize,
    height: usize,
    palette: &CosmicPalette,
) -> Vec<(f64, f64, f64, f64)> {
    vec![(palette.void_deep[0], palette.void_deep[1], palette.void_deep[2], 1.0); width * height]
}

/// Generate subtle gradient background
fn generate_gradient_background(
    width: usize,
    height: usize,
    palette: &CosmicPalette,
) -> Vec<(f64, f64, f64, f64)> {
    (0..width * height)
        .into_par_iter()
        .map(|idx| {
            let y = (idx / width) as f64 / height as f64;
            let x = (idx % width) as f64 / width as f64;
            
            // Radial gradient from center
            let cx = 0.5;
            let cy = 0.5;
            let dist = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt() * 1.414;
            let t = dist.clamp(0.0, 1.0);
            
            // Blend from center (slightly lighter) to edges (void)
            let center = palette.void_horizon;
            let edge = palette.void_deep;
            
            let r = center[0] * (1.0 - t) + edge[0] * t;
            let g = center[1] * (1.0 - t) + edge[1] * t;
            let b = center[2] * (1.0 - t) + edge[2] * t;
            
            (r, g, b, 1.0)
        })
        .collect()
}

/// Add stars to a background buffer
fn add_stars(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    palette: &CosmicPalette,
    density: f64,
    seed: u64,
) {
    let num_stars = ((width * height) as f64 * density / 1000.0) as usize;
    
    for i in 0..num_stars {
        // Deterministic star positions
        let hash1 = hash_u64(seed, i as u64, 0);
        let hash2 = hash_u64(seed, i as u64, 1);
        let hash3 = hash_u64(seed, i as u64, 2);
        let hash4 = hash_u64(seed, i as u64, 3);
        
        let x = ((hash1 as f64 / u64::MAX as f64) * width as f64) as usize;
        let y = ((hash2 as f64 / u64::MAX as f64) * height as f64) as usize;
        
        if x >= width || y >= height {
            continue;
        }
        
        // Star brightness (power law distribution for realism)
        let raw_brightness = hash3 as f64 / u64::MAX as f64;
        let brightness = raw_brightness.powf(3.0); // Most stars are dim
        
        // Star color temperature (blue to white to yellow/red)
        let temp = hash4 as f64 / u64::MAX as f64;
        let star_color = star_temperature_to_color(temp);
        
        // Blend with palette
        let final_color = if brightness > 0.8 {
            // Bright stars use accent color
            [
                palette.accent[0] * 0.5 + star_color[0] * 0.5,
                palette.accent[1] * 0.5 + star_color[1] * 0.5,
                palette.accent[2] * 0.5 + star_color[2] * 0.5,
            ]
        } else {
            star_color
        };
        
        // Draw star with subtle glow
        draw_star(buffer, width, height, x, y, brightness, &final_color);
    }
}

/// Convert star temperature (0-1 normalized) to RGB color
fn star_temperature_to_color(temp: f64) -> [f64; 3] {
    // 0 = cool red, 0.5 = white, 1 = hot blue
    if temp < 0.3 {
        // Red/orange stars
        let t = temp / 0.3;
        [1.0, 0.4 + t * 0.4, 0.2 + t * 0.3]
    } else if temp < 0.7 {
        // White/yellow stars
        let t = (temp - 0.3) / 0.4;
        [1.0, 0.8 + t * 0.2, 0.5 + t * 0.5]
    } else {
        // Blue/white stars
        let t = (temp - 0.7) / 0.3;
        [0.8 + t * 0.2, 0.9 + t * 0.1, 1.0]
    }
}

/// Draw a star with optional glow
fn draw_star(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    x: usize,
    y: usize,
    brightness: f64,
    color: &[f64; 3],
) {
    let idx = y * width + x;
    
    // Core pixel
    let intensity = brightness * 0.8;
    buffer[idx].0 = (buffer[idx].0 + color[0] * intensity).min(1.0);
    buffer[idx].1 = (buffer[idx].1 + color[1] * intensity).min(1.0);
    buffer[idx].2 = (buffer[idx].2 + color[2] * intensity).min(1.0);
    
    // For bright stars, add glow to neighbors
    if brightness > 0.5 {
        let glow = brightness * 0.2;
        let neighbors = [
            (x.wrapping_sub(1), y),
            (x + 1, y),
            (x, y.wrapping_sub(1)),
            (x, y + 1),
        ];
        
        for (nx, ny) in neighbors {
            if nx < width && ny < height {
                let nidx = ny * width + nx;
                buffer[nidx].0 = (buffer[nidx].0 + color[0] * glow).min(1.0);
                buffer[nidx].1 = (buffer[nidx].1 + color[1] * glow).min(1.0);
                buffer[nidx].2 = (buffer[nidx].2 + color[2] * glow).min(1.0);
            }
        }
    }
}

/// Add nebula clouds to a background buffer
fn add_nebula(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    palette: &CosmicPalette,
    config: &LensingBackgroundConfig,
    seed: u64,
) {
    let nebula: Vec<f64> = (0..width * height)
        .into_par_iter()
        .map(|idx| {
            let x = (idx % width) as f64;
            let y = (idx / width) as f64;
            
            fractal_noise(x, y, config.nebula_frequency, config.nebula_layers, seed)
        })
        .collect();
    
    // Apply nebula to buffer
    for (idx, &noise) in nebula.iter().enumerate() {
        let nebula_color = if noise > 0.0 {
            palette.primary
        } else {
            palette.accent
        };
        
        let intensity = noise.abs() * config.nebula_opacity;
        
        buffer[idx].0 = (buffer[idx].0 + nebula_color[0] * intensity).min(1.0);
        buffer[idx].1 = (buffer[idx].1 + nebula_color[1] * intensity).min(1.0);
        buffer[idx].2 = (buffer[idx].2 + nebula_color[2] * intensity).min(1.0);
    }
}

/// Add distant galaxies to a background buffer
fn add_galaxies(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    palette: &CosmicPalette,
    density: f64,
    seed: u64,
) {
    let num_galaxies = ((width * height) as f64 * density / 10000.0) as usize;
    
    for i in 0..num_galaxies {
        let hash1 = hash_u64(seed.wrapping_add(1000), i as u64, 0);
        let hash2 = hash_u64(seed.wrapping_add(1000), i as u64, 1);
        let hash3 = hash_u64(seed.wrapping_add(1000), i as u64, 2);
        let hash4 = hash_u64(seed.wrapping_add(1000), i as u64, 3);
        let hash5 = hash_u64(seed.wrapping_add(1000), i as u64, 4);
        
        let cx = (hash1 as f64 / u64::MAX as f64) * width as f64;
        let cy = (hash2 as f64 / u64::MAX as f64) * height as f64;
        let size = 3.0 + (hash3 as f64 / u64::MAX as f64) * 8.0;
        let brightness = 0.1 + (hash4 as f64 / u64::MAX as f64) * 0.2;
        let angle = (hash5 as f64 / u64::MAX as f64) * PI;
        
        draw_galaxy(buffer, width, height, cx, cy, size, angle, brightness, palette);
    }
}

/// Draw an elliptical galaxy
fn draw_galaxy(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    cx: f64,
    cy: f64,
    size: f64,
    angle: f64,
    brightness: f64,
    palette: &CosmicPalette,
) {
    let cos_a = angle.cos();
    let sin_a = angle.sin();
    let aspect = 0.4; // Elliptical galaxies
    
    let radius = size.ceil() as i32;
    
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let px = cx as i32 + dx;
            let py = cy as i32 + dy;
            
            if px < 0 || px >= width as i32 || py < 0 || py >= height as i32 {
                continue;
            }
            
            // Rotate and scale for ellipse
            let rx = dx as f64 * cos_a - dy as f64 * sin_a;
            let ry = (dx as f64 * sin_a + dy as f64 * cos_a) / aspect;
            
            let dist = (rx * rx + ry * ry).sqrt();
            
            if dist > size {
                continue;
            }
            
            // Gaussian falloff
            let sigma = size * 0.4;
            let intensity = brightness * (-dist * dist / (2.0 * sigma * sigma)).exp();
            
            let idx = py as usize * width + px as usize;
            
            // Galaxies use primary color with slight variation
            buffer[idx].0 = (buffer[idx].0 + palette.primary[0] * intensity).min(1.0);
            buffer[idx].1 = (buffer[idx].1 + palette.primary[1] * intensity).min(1.0);
            buffer[idx].2 = (buffer[idx].2 + palette.primary[2] * intensity).min(1.0);
        }
    }
}

/// Fractal (fBm) noise for nebula generation
fn fractal_noise(x: f64, y: f64, frequency: f64, octaves: usize, seed: u64) -> f64 {
    let mut value = 0.0;
    let mut amplitude = 1.0;
    let mut freq = frequency;
    let mut total_amplitude = 0.0;
    
    for octave in 0..octaves {
        value += amplitude * simplex_noise(x * freq, y * freq, seed.wrapping_add(octave as u64));
        total_amplitude += amplitude;
        amplitude *= 0.5;
        freq *= 2.0;
    }
    
    value / total_amplitude
}

/// Simple 2D noise (approximation of simplex noise)
fn simplex_noise(x: f64, y: f64, seed: u64) -> f64 {
    // Grid-based value noise (faster than true simplex)
    let x0 = x.floor() as i64;
    let y0 = y.floor() as i64;
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    
    let fx = x - x0 as f64;
    let fy = y - y0 as f64;
    
    // Smoothstep interpolation
    let sx = fx * fx * (3.0 - 2.0 * fx);
    let sy = fy * fy * (3.0 - 2.0 * fy);
    
    // Hash corners
    let v00 = hash_to_float(seed, x0 as u64, y0 as u64);
    let v10 = hash_to_float(seed, x1 as u64, y0 as u64);
    let v01 = hash_to_float(seed, x0 as u64, y1 as u64);
    let v11 = hash_to_float(seed, x1 as u64, y1 as u64);
    
    // Bilinear interpolation
    let v0 = v00 * (1.0 - sx) + v10 * sx;
    let v1 = v01 * (1.0 - sx) + v11 * sx;
    
    v0 * (1.0 - sy) + v1 * sy
}

/// Hash two integers to a float in [-1, 1]
fn hash_to_float(seed: u64, x: u64, y: u64) -> f64 {
    let h = hash_u64(seed, x, y);
    (h as f64 / u64::MAX as f64) * 2.0 - 1.0
}

/// Simple hash function
fn hash_u64(seed: u64, x: u64, y: u64) -> u64 {
    let mut h = seed;
    h = h.wrapping_add(x.wrapping_mul(0x9e3779b97f4a7c15));
    h = h.wrapping_add(y.wrapping_mul(0x517cc1b727220a95));
    h ^= h >> 33;
    h = h.wrapping_mul(0xff51afd7ed558ccd);
    h ^= h >> 33;
    h = h.wrapping_mul(0xc4ceb9fe1a85ec53);
    h ^= h >> 33;
    h
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::cosmic_palette::EVENT_HORIZON;

    #[test]
    fn test_background_config_defaults() {
        let config = LensingBackgroundConfig::default();
        assert_eq!(config.style, BackgroundStyle::DeepField);
        assert!(config.star_density > 0.0);
    }

    #[test]
    fn test_background_config_presets() {
        let starfield = LensingBackgroundConfig::starfield();
        let nebula = LensingBackgroundConfig::nebula();
        let void = LensingBackgroundConfig::void();
        
        assert_eq!(starfield.style, BackgroundStyle::Starfield);
        assert_eq!(nebula.style, BackgroundStyle::Nebula);
        assert_eq!(void.style, BackgroundStyle::Void);
        
        // Void should have no features
        assert_eq!(void.star_density, 0.0);
        assert_eq!(void.nebula_opacity, 0.0);
    }

    #[test]
    fn test_generate_void_background() {
        let buffer = generate_void_background(100, 100, &EVENT_HORIZON);
        
        assert_eq!(buffer.len(), 10000);
        
        // All pixels should be void color
        for (r, g, b, a) in &buffer {
            assert_eq!(*r, EVENT_HORIZON.void_deep[0]);
            assert_eq!(*g, EVENT_HORIZON.void_deep[1]);
            assert_eq!(*b, EVENT_HORIZON.void_deep[2]);
            assert_eq!(*a, 1.0);
        }
    }

    #[test]
    fn test_generate_gradient_background() {
        let buffer = generate_gradient_background(100, 100, &EVENT_HORIZON);
        
        assert_eq!(buffer.len(), 10000);
        
        // Center should be brighter than corner
        let center_idx = 50 * 100 + 50;
        let corner_idx = 0;
        
        let center_lum = buffer[center_idx].0 * 0.2126 
            + buffer[center_idx].1 * 0.7152 
            + buffer[center_idx].2 * 0.0722;
        let corner_lum = buffer[corner_idx].0 * 0.2126 
            + buffer[corner_idx].1 * 0.7152 
            + buffer[corner_idx].2 * 0.0722;
        
        assert!(center_lum >= corner_lum);
    }

    #[test]
    fn test_generate_background_starfield() {
        let config = LensingBackgroundConfig::starfield();
        let buffer = generate_background(100, 100, &EVENT_HORIZON, &config, 12345);
        
        assert_eq!(buffer.len(), 10000);
        
        // Should have some bright pixels (stars)
        let bright_pixels = buffer.iter()
            .filter(|(r, g, b, _)| *r > 0.1 || *g > 0.1 || *b > 0.1)
            .count();
        
        assert!(bright_pixels > 0);
    }

    #[test]
    fn test_generate_background_nebula() {
        let config = LensingBackgroundConfig::nebula();
        let buffer = generate_background(100, 100, &EVENT_HORIZON, &config, 12345);
        
        assert_eq!(buffer.len(), 10000);
        
        // Values should be in valid range
        for (r, g, b, a) in &buffer {
            assert!(*r >= 0.0 && *r <= 1.0);
            assert!(*g >= 0.0 && *g <= 1.0);
            assert!(*b >= 0.0 && *b <= 1.0);
            assert_eq!(*a, 1.0);
        }
    }

    #[test]
    fn test_generate_background_deep_field() {
        let config = LensingBackgroundConfig::deep_field();
        let buffer = generate_background(200, 200, &EVENT_HORIZON, &config, 12345);
        
        assert_eq!(buffer.len(), 40000);
    }

    #[test]
    fn test_generate_background_deterministic() {
        let config = LensingBackgroundConfig::starfield();
        
        let buffer1 = generate_background(50, 50, &EVENT_HORIZON, &config, 12345);
        let buffer2 = generate_background(50, 50, &EVENT_HORIZON, &config, 12345);
        
        // Same seed should produce same result
        for (p1, p2) in buffer1.iter().zip(buffer2.iter()) {
            assert!((p1.0 - p2.0).abs() < 0.001);
            assert!((p1.1 - p2.1).abs() < 0.001);
            assert!((p1.2 - p2.2).abs() < 0.001);
        }
    }

    #[test]
    fn test_star_temperature_to_color() {
        let cold = star_temperature_to_color(0.0);
        let warm = star_temperature_to_color(0.5);
        let hot = star_temperature_to_color(1.0);
        
        // Cold stars are reddish
        assert!(cold[0] > cold[2]);
        
        // Hot stars are bluish
        assert!(hot[2] >= hot[0]);
        
        // All values in range
        for color in [cold, warm, hot] {
            for c in color {
                assert!(c >= 0.0 && c <= 1.0);
            }
        }
    }

    #[test]
    fn test_fractal_noise_range() {
        for i in 0..100 {
            let x = i as f64 * 10.0;
            let y = i as f64 * 7.0;
            let noise = fractal_noise(x, y, 0.01, 4, 12345);
            
            // Noise should be roughly in [-1, 1]
            assert!(noise >= -2.0 && noise <= 2.0);
        }
    }

    #[test]
    fn test_simplex_noise_range() {
        for i in 0..100 {
            let x = i as f64 * 0.5;
            let y = i as f64 * 0.3;
            let noise = simplex_noise(x, y, 42);
            
            // Should be in [-1, 1]
            assert!(noise >= -1.0 && noise <= 1.0);
        }
    }

    #[test]
    fn test_hash_deterministic() {
        let h1 = hash_u64(12345, 100, 200);
        let h2 = hash_u64(12345, 100, 200);
        
        assert_eq!(h1, h2);
        
        let h3 = hash_u64(12345, 100, 201);
        assert_ne!(h1, h3);
    }

    #[test]
    fn test_draw_star() {
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 100];
        let color = [1.0, 1.0, 1.0];
        
        draw_star(&mut buffer, 10, 10, 5, 5, 1.0, &color);
        
        // Center should be bright
        let center_idx = 5 * 10 + 5;
        assert!(buffer[center_idx].0 > 0.0);
        assert!(buffer[center_idx].1 > 0.0);
        assert!(buffer[center_idx].2 > 0.0);
    }

    #[test]
    fn test_add_stars() {
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        
        add_stars(&mut buffer, 100, 100, &EVENT_HORIZON, 2.0, 12345);
        
        // Some pixels should now be brighter
        let bright = buffer.iter().filter(|p| p.0 > 0.01).count();
        assert!(bright > 0);
    }

    #[test]
    fn test_add_nebula() {
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 10000];
        let config = LensingBackgroundConfig::nebula();
        
        add_nebula(&mut buffer, 100, 100, &EVENT_HORIZON, &config, 12345);
        
        // Should have colored some pixels
        let colored = buffer.iter()
            .filter(|p| p.0 > 0.001 || p.1 > 0.001 || p.2 > 0.001)
            .count();
        assert!(colored > 0);
    }

    #[test]
    fn test_add_galaxies() {
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 40000];
        
        add_galaxies(&mut buffer, 200, 200, &EVENT_HORIZON, 0.5, 12345);
        
        // Should have some bright pixels
        let bright = buffer.iter().filter(|p| p.0 > 0.01).count();
        assert!(bright > 0);
    }

    #[test]
    fn test_background_styles_all_work() {
        let styles = [
            BackgroundStyle::Void,
            BackgroundStyle::Gradient,
            BackgroundStyle::Starfield,
            BackgroundStyle::Nebula,
            BackgroundStyle::DeepField,
        ];
        
        for style in styles {
            let config = LensingBackgroundConfig {
                style,
                ..LensingBackgroundConfig::default()
            };
            
            let buffer = generate_background(50, 50, &EVENT_HORIZON, &config, 12345);
            assert_eq!(buffer.len(), 2500);
        }
    }
}

