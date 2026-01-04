//! Fine art texture overlay for tactile richness and material quality.
//!
//! Adds subtle procedural textures that simulate fine art materials:
//! - Canvas weave patterns
//! - Handmade paper grain
//! - Metallic surface variations
//! - Impasto (thick paint) relief
//!
//! These textures add a sense of physicality and craftsmanship to digital renders.

use super::{FrameParams, PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Type of fine art texture
#[derive(Clone, Debug, PartialEq)]
pub enum TextureType {
    /// Canvas weave pattern (like oil painting canvas)
    Canvas,
    /// Thick paint relief with specular highlights
    Impasto,
    /// Classic photographic film grain (silver halide emulation)
    FilmGrain,
}

/// Configuration for fine texture overlay
#[derive(Clone, Debug)]
pub struct FineTextureConfig {
    /// Type of texture to apply
    pub texture_type: TextureType,
    /// Overall strength of the texture (0.0-1.0)
    pub strength: f64,
    /// Scale of texture features (larger = coarser texture)
    pub scale: f64,
    /// Contrast of texture variations
    pub contrast: f64,
    /// Directional anisotropy (0.0 = isotropic, 1.0 = strongly directional)
    pub anisotropy: f64,
    /// Angle for directional features (in degrees)
    pub angle: f64,
    /// Light direction for 3D effects (azimuth angle in degrees)
    pub light_angle: f64,
    /// Strength of specular highlights (0.0-1.0)
    pub specular_strength: f64,
}

impl Default for FineTextureConfig {
    fn default() -> Self {
        Self::special_mode_canvas(1920, 1080)
    }
}

impl FineTextureConfig {
    /// Canvas texture for special mode (luxurious fine art finish)
    pub fn special_mode_canvas(width: usize, height: usize) -> Self {
        let base_scale = (width as f64 * height as f64).sqrt();
        Self {
            texture_type: TextureType::Impasto, // Upgraded to Impasto by default for "Museum Quality"
            strength: 0.25,                     // Stronger for 3D effect
            scale: base_scale * 0.0016,
            contrast: 0.42,
            anisotropy: 0.32,
            angle: 45.0,
            light_angle: 135.0,      // Top-left lighting
            specular_strength: 0.15, // Subtle gloss
        }
    }
    
    /// Classic photographic film grain for cinematic quality
    /// 
    /// Emulates the silver halide grain structure of analog film stock.
    /// Creates organic, luminance-responsive grain that adds depth and character.
    #[allow(dead_code)]
    pub fn film_grain(width: usize, height: usize, intensity: f64) -> Self {
        let base_scale = (width as f64 * height as f64).sqrt();
        Self {
            texture_type: TextureType::FilmGrain,
            strength: (intensity * 0.15).clamp(0.01, 0.20), // Subtle: 0.01-0.20
            scale: base_scale * 0.0008,                     // Fine grain
            contrast: 0.65,                                  // Higher contrast grain particles
            anisotropy: 0.05,                               // Nearly isotropic (film is random)
            angle: 0.0,
            light_angle: 0.0,       // Not used for film grain
            specular_strength: 0.0, // No specular for film grain
        }
    }
}

/// Fine texture post-effect
pub struct FineTexture {
    config: FineTextureConfig,
    enabled: bool,
}

impl FineTexture {
    pub fn new(config: FineTextureConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Fast 2D hash function
    #[inline]
    fn hash2d(x: f64, y: f64) -> f64 {
        let h = ((x * 127.1 + y * 311.7).sin() * 43758.5453).fract();
        (h - 0.5) * 2.0 // Map to [-1, 1]
    }

    /// Value noise (smooth interpolated noise)
    fn value_noise(&self, x: f64, y: f64) -> f64 {
        let ix = x.floor();
        let iy = y.floor();
        let fx = x - ix;
        let fy = y - iy;

        // Smoothstep interpolation
        let sx = fx * fx * (3.0 - 2.0 * fx);
        let sy = fy * fy * (3.0 - 2.0 * fy);

        // Corner values
        let v00 = Self::hash2d(ix, iy);
        let v10 = Self::hash2d(ix + 1.0, iy);
        let v01 = Self::hash2d(ix, iy + 1.0);
        let v11 = Self::hash2d(ix + 1.0, iy + 1.0);

        // Bilinear interpolation
        let v0 = v00 * (1.0 - sx) + v10 * sx;
        let v1 = v01 * (1.0 - sx) + v11 * sx;
        v0 * (1.0 - sy) + v1 * sy
    }

    /// Canvas weave pattern (two perpendicular wave patterns)
    fn canvas_pattern(&self, x: f64, y: f64) -> f64 {
        let scale = 1.0 / self.config.scale;

        // Horizontal threads
        let h_wave = (y * scale * 8.0).sin();
        let h_noise = self.value_noise(x * scale * 0.5, y * scale * 8.0);
        let h_thread = (h_wave + h_noise * 0.3) * 0.5;

        // Vertical threads
        let v_wave = (x * scale * 8.0).sin();
        let v_noise = self.value_noise(x * scale * 8.0, y * scale * 0.5);
        let v_thread = (v_wave + v_noise * 0.3) * 0.5;

        // Combine with slight offset for weave pattern
        let weave = (h_thread + v_thread) * 0.5 + h_thread * v_thread * 0.3;

        // Add fine grain
        let grain = self.value_noise(x * scale * 20.0, y * scale * 20.0) * 0.2;

        weave + grain
    }

    /// Get texture `height`/value for `a` given position
    fn get_height_map(&self, x: f64, y: f64) -> f64 {
        let raw_value = self.canvas_pattern(x, y);

        // Apply contrast
        let centered = raw_value * self.config.contrast;

        // Apply anisotropy (makes texture more directional)
        if self.config.anisotropy > 0.0 {
            let angle_rad = self.config.angle.to_radians();
            let directional = (x * angle_rad.cos() + y * angle_rad.sin()).sin() * 0.1;
            centered * (1.0 - self.config.anisotropy) + directional * self.config.anisotropy
        } else {
            centered
        }
    }
}

impl PostEffect for FineTexture {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        _height: usize,
        _params: &FrameParams,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        // Precompute light vector
        let light_rad = self.config.light_angle.to_radians();
        let lx = light_rad.cos();
        let ly = light_rad.sin();
        let lz = 0.5; // Light slightly coming from front
        // Normalize
        let len = (lx * lx + ly * ly + lz * lz).sqrt();
        let light_dir = (lx / len, ly / len, lz / len);

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                // 1. Get base texture modulation
                let texture_val = self.get_height_map(x, y);

                if self.config.texture_type == TextureType::Canvas {
                    // Classic 2D multiply mode
                    let modulation = 1.0 + texture_val * self.config.strength;
                    return (
                        (r * modulation).max(0.0),
                        (g * modulation).max(0.0),
                        (b * modulation).max(0.0),
                        a,
                    );
                }
                
                if self.config.texture_type == TextureType::FilmGrain {
                    // Film grain emulation (silver halide)
                    // Key characteristics:
                    // 1. Luminance-dependent: more visible in midtones, less in shadows/highlights
                    // 2. Per-channel variation: real film has slightly different grain per color layer
                    // 3. Gaussian-like distribution: not uniform noise
                    
                    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    
                    // Film grain is most visible in midtones (0.2-0.7)
                    // Shadows compress grain, highlights blow it out
                    let midtone_factor = 1.0 - 2.0 * (lum - 0.45).abs().min(0.45);
                    let grain_strength = self.config.strength * midtone_factor;
                    
                    // Per-channel grain with slight offsets (different film layers)
                    let grain_r = texture_val;
                    let grain_g = Self::hash2d(x + 0.5, y + 0.3);
                    let grain_b = Self::hash2d(x + 0.7, y + 0.9);
                    
                    // Apply grain additively (more natural than multiplicative)
                    let nr = (r + grain_r * grain_strength * lum).max(0.0);
                    let ng = (g + grain_g * grain_strength * lum).max(0.0);
                    let nb = (b + grain_b * grain_strength * lum).max(0.0);
                    
                    return (nr, ng, nb, a);
                }

                // 3. Impasto Mode (3D Lighting)
                // Calculate simple derivative for normal
                let h_center = texture_val;
                let h_right = self.get_height_map(x + 1.0, y);
                let h_down = self.get_height_map(x, y + 1.0);

                // MUSEUM QUALITY UPGRADE: Adaptive Materiality
                // Add image luminance to height (paint thickness matches brightness)
                // This creates a subtle "3D relief" where trajectories appear physical.
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                let thickness = lum * 0.65; // Bright areas = thicker paint

                let total_h = h_center + thickness;
                let total_h_r = h_right + thickness;
                let total_h_d = h_down + thickness;

                let dx = (total_h_r - total_h) * self.config.strength * 12.0;
                let dy = (total_h_d - total_h) * self.config.strength * 12.0;

                // Normal vector (-dx, -dy, 1)
                let nz = 1.0;
                let n_len = (dx * dx + dy * dy + nz * nz).sqrt();
                let normal = (-dx / n_len, -dy / n_len, nz / n_len);

                // Diffuse lighting (Lambert) with slight warm shift
                let diffuse =
                    (normal.0 * light_dir.0 + normal.1 * light_dir.1 + normal.2 * light_dir.2)
                        .max(0.0);

                // Specular lighting (Blinn-Phong) - museum quality "sheen"
                let hx = light_dir.0;
                let hy = light_dir.1;
                let hz = light_dir.2 + 1.0;
                let h_len = (hx * hx + hy * hy + hz * hz).sqrt();
                let half_vec = (hx / h_len, hy / h_len, hz / h_len);

                let spec_angle =
                    (normal.0 * half_vec.0 + normal.1 * half_vec.1 + normal.2 * half_vec.2)
                        .max(0.0);
                
                // Adaptive specular: only highlights catch the gloss
                let specular = spec_angle.powf(48.0) * self.config.specular_strength * (0.2 + lum * 0.8);

                let light_intensity = 0.85 + diffuse * 0.35;

                let final_r = r * light_intensity + specular;
                let final_g = g * light_intensity + specular;
                let final_b = b * light_intensity + specular;

                (final_r.max(0.0), final_g.max(0.0), final_b.max(0.0), a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_texture_disabled() {
        let config = FineTextureConfig { strength: 0.0, ..FineTextureConfig::default() };
        let texture = FineTexture::new(config);
        assert!(!texture.is_enabled());
    }

    #[test]
    fn test_texture_enabled() {
        let config = FineTextureConfig::special_mode_canvas(1920, 1080);
        let texture = FineTexture::new(config);
        assert!(texture.is_enabled());
    }

    #[test]
    fn test_impasto_mode() {
        let mut config = FineTextureConfig::special_mode_canvas(100, 100);
        config.texture_type = TextureType::Impasto;
        let texture = FineTexture::new(config);

        let buffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = texture.process(&buffer, 10, 10, &params).unwrap();

        // Should not be identical to input (lighting applied)
        assert!((result[0].0 - 0.5).abs() > 0.0001);
    }

    #[test]
    fn test_all_texture_types() {
        let types = [TextureType::Canvas, TextureType::Impasto, TextureType::FilmGrain];

        for texture_type in types {
            let config = FineTextureConfig {
                texture_type,
                strength: 0.1,
                scale: 10.0,
                contrast: 0.5,
                anisotropy: 0.0,
                angle: 0.0,
                light_angle: 45.0,
                specular_strength: 0.5,
            };
            let texture = FineTexture::new(config);

            // Should be enabled
            assert!(texture.is_enabled());

            // Should produce varying values (or at least run without panic)
            let _ = texture.get_height_map(0.0, 0.0);
        }
    }
    
    #[test]
    fn test_film_grain_mode() {
        let config = FineTextureConfig::film_grain(1920, 1080, 0.5);
        let texture = FineTexture::new(config);
        
        assert!(texture.is_enabled());
        assert_eq!(texture.config.texture_type, TextureType::FilmGrain);
        
        // Test that film grain processes correctly
        let buffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let result = texture.process(&buffer, 10, 10, &params).unwrap();
        
        // Should not be identical to input (grain applied)
        assert!((result[0].0 - 0.5).abs() > 0.0001 || 
                (result[0].1 - 0.5).abs() > 0.0001 ||
                (result[0].2 - 0.5).abs() > 0.0001,
                "Film grain should modify pixel values");
    }
    
    #[test]
    fn test_film_grain_luminance_dependent() {
        let config = FineTextureConfig::film_grain(100, 100, 1.0);
        let texture = FineTexture::new(config);
        
        // Create two buffers: dark and bright
        let dark_buffer = vec![(0.1, 0.1, 0.1, 1.0); 100];
        let bright_buffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
        
        let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
        let dark_result = texture.process(&dark_buffer, 10, 10, &params).unwrap();
        let bright_result = texture.process(&bright_buffer, 10, 10, &params).unwrap();
        
        // Calculate variance of changes for both
        let dark_changes: Vec<f64> = dark_result.iter()
            .zip(dark_buffer.iter())
            .map(|((r, _, _, _), (orig_r, _, _, _))| (r - orig_r).abs())
            .collect();
        let bright_changes: Vec<f64> = bright_result.iter()
            .zip(bright_buffer.iter())
            .map(|((r, _, _, _), (orig_r, _, _, _))| (r - orig_r).abs())
            .collect();
        
        let dark_avg: f64 = dark_changes.iter().sum::<f64>() / dark_changes.len() as f64;
        let bright_avg: f64 = bright_changes.iter().sum::<f64>() / bright_changes.len() as f64;
        
        // Midtone (bright) should have more visible grain than dark regions
        assert!(bright_avg > dark_avg,
            "Film grain should be more visible in midtones: bright_avg={}, dark_avg={}", 
            bright_avg, dark_avg);
    }
}
