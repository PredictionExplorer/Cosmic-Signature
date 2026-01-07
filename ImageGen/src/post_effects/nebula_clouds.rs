//! Nebula Dust Clouds post-effect
//!
//! Creates organic, flowing nebula clouds in the background using multi-octave
//! OpenSimplex2S noise. The clouds slowly drift and evolve over time, adding
//! atmospheric depth and cosmic beauty without overpowering the trajectories.

use super::{FrameParams, PixelBuffer, PostEffect};
use super::utils::upsample_bilinear;
use opensimplex2::smooth;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for nebula dust clouds effect
#[derive(Clone, Debug)]
pub struct NebulaCloudConfig {
    /// Overall strength/opacity of the effect (0.0-1.0)
    pub strength: f64,
    /// Number of octaves for multi-scale detail (3-5 recommended)
    pub octaves: usize,
    /// Base frequency for noise (lower = larger features)
    pub base_frequency: f64,
    /// Amplitude reduction per octave (0.5 = each octave half as strong)
    pub persistence: f64,
    /// Frequency increase per octave (2.0 = each octave twice the frequency)
    pub lacunarity: f64,
    /// Color palette for nebula (4 colors that blend smoothly)
    pub colors: [[f64; 3]; 4],
    /// Time scale for animation (controls drift speed in videos)
    pub time_scale: f64,
    /// Seed for noise generator (derived from simulation seed)
    pub noise_seed: i64,
    /// Edge fade distance (0.0 = no fade, 0.2 = fade 20% from edges)
    pub edge_fade: f64,
}

impl Default for NebulaCloudConfig {
    fn default() -> Self {
        Self::standard_mode(1920, 1080, 0)
    }
}

impl NebulaCloudConfig {
    /// Create configuration for special mode with subtle atmosphere.
    /// 
    /// The nebula should be barely perceptible - a hint of cosmic depth
    /// that doesn't compete with the trajectories. Previous values (0.18)
    /// were too strong and created distracting patterns.
    #[allow(dead_code)] // Legacy helper - kept for backward compatibility
    pub fn special_mode(width: usize, height: usize, seed: i32) -> Self {
        let min_dim = width.min(height) as f64;
        Self {
            strength: 0.06,  // Very subtle - barely visible hint of atmosphere
            octaves: 3,      // Fewer octaves = smoother, less noisy
            base_frequency: 0.0008 * (1080.0 / min_dim), // Lower frequency = larger, smoother features
            persistence: 0.4, // Lower = less high-frequency detail
            lacunarity: 2.0,
            colors: [
                [0.04, 0.02, 0.10], // Very dark purple - barely visible
                [0.02, 0.06, 0.08], // Very dark teal
                [0.06, 0.02, 0.08], // Very dark magenta
                [0.01, 0.03, 0.08], // Very deep blue
            ],
            time_scale: 0.0015, // Slower drift
            noise_seed: seed as i64,
            edge_fade: 0.35, // Strong edge fade so nebula is mostly at edges
        }
    }
    
    /// Create elegant minimal nebula - just a very subtle color gradient.
    /// 
    /// This creates an almost imperceptible background that adds depth
    /// without any distracting patterns.
    #[allow(dead_code)] // API available for future use
    pub fn elegant(seed: i32) -> Self {
        Self {
            strength: 0.03,  // Almost invisible
            octaves: 2,      // Minimal detail - just smooth color
            base_frequency: 0.0004, // Very large, smooth features
            persistence: 0.3,
            lacunarity: 2.0,
            colors: [
                [0.02, 0.01, 0.05], // Near-black with hint of purple
                [0.01, 0.03, 0.04], // Near-black with hint of teal
                [0.03, 0.01, 0.04], // Near-black with hint of magenta
                [0.01, 0.02, 0.04], // Near-black with hint of blue
            ],
            time_scale: 0.001,
            noise_seed: seed as i64,
            edge_fade: 0.5, // Very strong edge fade
        }
    }

    /// Create configuration for standard mode (disabled)
    pub fn standard_mode(_width: usize, _height: usize, seed: i32) -> Self {
        Self {
            strength: 0.0, // Disabled in standard mode
            octaves: 2,
            base_frequency: 0.001,
            persistence: 0.5,
            lacunarity: 2.0,
            colors: [[0.0, 0.0, 0.0]; 4],
            time_scale: 0.002,
            noise_seed: seed as i64,
            edge_fade: 0.0,
        }
    }
}

/// Nebula clouds post-effect
pub struct NebulaClouds {
    config: NebulaCloudConfig,
    enabled: bool,
}

impl NebulaClouds {
    /// Create new nebula clouds effect with given configuration
    pub fn new(config: NebulaCloudConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Evaluate multi-octave noise at given position and time
    /// Uses noise3_ImproveXY which is optimized for time-varied animations
    /// Returns value in [0, 1] range
    #[inline]
    fn evaluate_noise(&self, x: f64, y: f64, time: f64) -> f64 {
        let mut total = 0.0;
        let mut amplitude = 1.0;
        let mut frequency = self.config.base_frequency;
        let mut max_amplitude = 0.0;

        for _ in 0..self.config.octaves {
            let noise_val = smooth::noise3_ImproveXY(
                self.config.noise_seed,
                x * frequency,
                y * frequency,
                time,
            );
            total += (noise_val as f64) * amplitude;
            max_amplitude += amplitude;

            amplitude *= self.config.persistence;
            frequency *= self.config.lacunarity;
        }

        let normalized = total / max_amplitude;
        let val = (normalized + 1.0) * 0.5;

        // MUSEUM QUALITY: Power-Fractal mapping for deep voids and sharp filaments.
        // val^2 or val^3 creates much more interesting structures than linear noise.
        val.powf(2.2)
    }

    /// Map noise value to nebula color using smooth interpolation with chromatic drift.
    #[inline]
    fn noise_to_color(&self, noise_value: f64, drift: f64) -> [f64; 3] {
        // Apply chromatic drift: shift color lookup based on secondary noise
        let shifted_noise = (noise_value + drift * 0.15).clamp(0.0, 1.0);
        
        let scaled = shifted_noise * 4.0;
        let idx = scaled.floor() as usize;
        let t = scaled.fract();

        let color1 = self.config.colors[idx.min(3)];
        let color2 = self.config.colors[(idx + 1) % 4];

        let smooth_t = (1.0 - (t * std::f64::consts::PI).cos()) * 0.5;

        [
            color1[0] + (color2[0] - color1[0]) * smooth_t,
            color1[1] + (color2[1] - color1[1]) * smooth_t,
            color1[2] + (color2[2] - color1[2]) * smooth_t,
        ]
    }

    /// Calculate edge fade factor (1.0 at center, fades to 0 near edges)
    /// Uses radial distance for smooth, circular vignette without corner artifacts
    #[inline]
    fn calculate_edge_fade(&self, x: f64, y: f64, width: f64, height: f64) -> f64 {
        if self.config.edge_fade <= 0.0 {
            return 1.0;
        }

        // Calculate radial distance from center (normalized)
        let center_x = width * 0.5;
        let center_y = height * 0.5;
        let dx = (x - center_x) / width;
        let dy = (y - center_y) / height;
        let dist_from_center = (dx * dx + dy * dy).sqrt();

        // Maximum distance (corner to center, normalized)
        let max_dist = 0.5_f64.sqrt(); // sqrt(0.5) ≈ 0.707

        // Fade starts at (1.0 - fade_dist) and reaches 0 at edges
        let fade_start = 1.0 - self.config.edge_fade;
        let normalized_dist = dist_from_center / max_dist;

        if normalized_dist < fade_start {
            1.0
        } else {
            // Smooth fade from fade_start to 1.0 (edge)
            let fade_range = 1.0 - fade_start;
            let fade_amount = (normalized_dist - fade_start) / fade_range;
            (1.0 - fade_amount).clamp(0.0, 1.0)
        }
    }

    /// Process buffer with frame number for time-based animation
    pub fn process_with_time(
        &self,
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        frame_number: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.enabled {
            return Ok(buffer.to_vec());
        }

        // PERFORMANCE OPTIMIZATION: Generate nebula at 50% resolution
        // Nebula is low-frequency; full resolution is wasteful.
        // This provides ~4x speedup for background generation.
        let gen_width = width / 2;
        let gen_height = height / 2;
        
        let mut gen_buffer = vec![(0.0, 0.0, 0.0, 0.0); gen_width * gen_height];

        // Calculate time offset for smooth animation
        // At 60fps over 30 seconds: frame_number goes 0 to 1800
        // time_scale = 0.0022 means time goes from 0 to ~4.0 over the animation
        let time = frame_number as f64 * self.config.time_scale;

        let width_f = width as f64;
        let height_f = height as f64;

        // Process in parallel for maximum performance
        gen_buffer.par_iter_mut().enumerate().for_each(|(idx, pixel)| {
            let x_gen = (idx % gen_width) as f64;
            let y_gen = (idx / gen_width) as f64;
            
            // Map back to full resolution coordinates for noise continuity
            let x = x_gen * 2.0;
            let y = y_gen * 2.0;

            // Secondary noise layer for layered motion and chromatic drift
            let drift_noise = smooth::noise3_ImproveXY(
                self.config.noise_seed + 1, // Offset seed
                x * self.config.base_frequency * 0.5,
                y * self.config.base_frequency * 0.5,
                time * 0.45,
            ) as f64;

            // Evaluate primary noise for color selection
            let noise_value = self.evaluate_noise(x, y, time);

            // Map to nebula color with chromatic drift
            let nebula_color = self.noise_to_color(noise_value, drift_noise);

            // Calculate base opacity with edge fade
            let edge_fade = self.calculate_edge_fade(x, y, width_f, height_f);
            
            // MUSEUM QUALITY: Ensure nebula is always visible with a minimum floor
            // This prevents completely black images by guaranteeing background brightness
            let base_opacity = self.config.strength * edge_fade;

            // Final opacity creates wispy, organic structure
            // Increased minimum (0.50 instead of 0.40) ensures visibility
            let opacity_variation = 0.50 + noise_value * 1.00;
            let final_opacity = (base_opacity * opacity_variation).clamp(0.0, 1.0);
            
            // MUSEUM QUALITY FLOOR: Ensure minimum visibility in center region
            // This prevents "black hole" areas where everything is invisible
            let min_opacity = if edge_fade > 0.5 { 0.08 } else { 0.04 };
            let final_opacity = final_opacity.max(min_opacity * edge_fade);

            // Apply nebula as pure RGB color with coverage
            pixel.0 = nebula_color[0];
            pixel.1 = nebula_color[1];
            pixel.2 = nebula_color[2];
            pixel.3 = final_opacity; // Alpha represents nebula coverage
        });

        // Upscale to full resolution
        let upscaled = upsample_bilinear(&gen_buffer, gen_width, gen_height, width, height);
        
        Ok(upscaled)
    }
}

impl PostEffect for NebulaClouds {
    fn process(
        &self,
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        // For static images, use frame 0
        self.process_with_time(buffer, width, height, params.frame_number)
    }

    fn is_enabled(&self) -> bool {
        self.enabled
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_noise_evaluation() {
        let config = NebulaCloudConfig::special_mode(1920, 1080, 42);
        let nebula = NebulaClouds::new(config);

        // Noise should be in [0, 1] range
        let noise = nebula.evaluate_noise(100.0, 100.0, 0.0);
        assert!((0.0..=1.0).contains(&noise), "Noise value out of range: {}", noise);

        // Different positions should give different values
        let noise2 = nebula.evaluate_noise(500.0, 500.0, 0.0);
        assert_ne!(noise, noise2);
    }

    #[test]
    fn test_color_mapping() {
        let config = NebulaCloudConfig::special_mode(1920, 1080, 42);
        let nebula = NebulaClouds::new(config);

        // Test color interpolation at different noise values
        let color_0 = nebula.noise_to_color(0.0, 0.0);
        let color_quarter = nebula.noise_to_color(0.25, 0.0);
        let color_mid = nebula.noise_to_color(0.5, 0.0);
        let color_three_quarter = nebula.noise_to_color(0.75, 0.0);
        let color_1 = nebula.noise_to_color(1.0, 0.0);

        // All colors should be valid RGB
        for color in [color_0, color_quarter, color_mid, color_three_quarter, color_1] {
            assert!(color[0] >= 0.0 && color[0] <= 1.0, "R out of range");
            assert!(color[1] >= 0.0 && color[1] <= 1.0, "G out of range");
            assert!(color[2] >= 0.0 && color[2] <= 1.0, "B out of range");
        }

        // Colors should vary
        assert_ne!(color_0, color_mid);
        assert_ne!(color_mid, color_1);
    }

    #[test]
    fn test_edge_fade() {
        let config = NebulaCloudConfig::special_mode(1920, 1080, 42);
        let nebula = NebulaClouds::new(config);

        // Center should have full opacity
        let center_fade = nebula.calculate_edge_fade(960.0, 540.0, 1920.0, 1080.0);
        assert!(center_fade > 0.98, "Center fade too low: {}", center_fade);

        // Edges should fade significantly
        let corner_fade = nebula.calculate_edge_fade(0.0, 0.0, 1920.0, 1080.0);
        assert!(corner_fade < 0.2, "Corner fade too high: {}", corner_fade);
    }

    #[test]
    fn test_disabled_mode() {
        let config = NebulaCloudConfig::standard_mode(1920, 1080, 0);
        assert_eq!(config.strength, 0.0);

        let nebula = NebulaClouds::new(config);
        assert!(!nebula.is_enabled());
    }

    #[test]
    fn test_determinism() {
        let config = NebulaCloudConfig::special_mode(1920, 1080, 12345);
        let nebula1 = NebulaClouds::new(config.clone());
        let nebula2 = NebulaClouds::new(config);

        // Same seed and coordinates should produce identical noise
        let noise1 = nebula1.evaluate_noise(100.0, 200.0, 1.0);
        let noise2 = nebula2.evaluate_noise(100.0, 200.0, 1.0);
        assert_eq!(noise1, noise2, "Determinism failed!");
    }

    #[test]
    fn test_time_animation() {
        let config = NebulaCloudConfig::special_mode(1920, 1080, 42);
        let nebula = NebulaClouds::new(config);

        // Different times should produce different noise
        let noise_t0 = nebula.evaluate_noise(100.0, 100.0, 0.0);
        let noise_t1 = nebula.evaluate_noise(100.0, 100.0, 1.0);
        let noise_t10 = nebula.evaluate_noise(100.0, 100.0, 10.0);

        // All should be different (time evolution working)
        assert_ne!(noise_t0, noise_t1, "Time animation not working!");
        assert_ne!(noise_t0, noise_t10, "Time animation not working!");

        // Small time step should produce small change (continuity)
        let small_diff = (noise_t1 - noise_t0).abs();
        assert!(small_diff < 0.5, "Noise changing too fast over small time: {}", small_diff);
    }

    #[test]
    fn test_buffer_processing() {
        let config = NebulaCloudConfig::special_mode(100, 100, 42);
        let nebula = NebulaClouds::new(config);

        // Create test buffer (all black)
        let buffer = vec![(0.0, 0.0, 0.0, 0.0); 10000];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let result = nebula.process(&buffer, 100, 100, &params).unwrap();

        // Result should have nebula colors added
        let has_color = result.iter().any(|&(r, g, b, _a)| r > 0.0 || g > 0.0 || b > 0.0);
        assert!(has_color, "Nebula should add color to black background!");
    }
}
