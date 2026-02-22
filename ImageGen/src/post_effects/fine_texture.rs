//! Fine art texture overlay for tactile richness and material quality.
//!
//! Adds subtle procedural textures that simulate fine art materials:
//! - Canvas weave patterns
//! - Handmade paper grain
//! - Metallic surface variations
//! - Subtle noise for organic imperfection
//!
//! These textures add a sense of physicality and craftsmanship to digital renders.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Type of fine art texture
#[derive(Clone, Debug)]
pub enum TextureType {
    /// Canvas weave pattern (like oil painting canvas)
    Canvas,
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
}

impl Default for FineTextureConfig {
    fn default() -> Self {
        let base_scale = (1920.0_f64 * 1080.0).sqrt();
        Self {
            texture_type: TextureType::Canvas,
            strength: 0.12,
            scale: base_scale * 0.0018,
            contrast: 0.35,
            anisotropy: 0.25,
            angle: 45.0,
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

    /// Get texture value for a given position
    fn get_texture_value(&self, x: f64, y: f64) -> f64 {
        let raw_value = match self.config.texture_type {
            TextureType::Canvas => self.canvas_pattern(x, y),
        };

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
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                // Get texture modulation
                let texture = self.get_texture_value(x, y);
                let modulation = 1.0 + texture * self.config.strength;

                // Apply texture modulation (multiplicative for natural look)
                let final_r = (r * modulation).max(0.0);
                let final_g = (g * modulation).max(0.0);
                let final_b = (b * modulation).max(0.0);

                (final_r, final_g, final_b, a)
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
        let config = FineTextureConfig {
            strength: 0.0,
            ..FineTextureConfig::default()
        };
        let texture = FineTexture::new(config);
        assert!(!texture.is_enabled());
    }

    #[test]
    fn test_texture_enabled() {
        let config = FineTextureConfig::default();
        let texture = FineTexture::new(config);
        assert!(texture.is_enabled());
    }

    #[test]
    fn test_hash_determinism() {
        let h1 = FineTexture::hash2d(100.0, 200.0);
        let h2 = FineTexture::hash2d(100.0, 200.0);
        assert_eq!(h1, h2, "Hash should be deterministic");
    }

    #[test]
    fn test_buffer_processing() {
        let config = FineTextureConfig::default();
        let texture = FineTexture::new(config);

        // Create uniform test buffer
        let buffer: PixelBuffer = vec![(0.5, 0.5, 0.5, 1.0); 10000];
        let result = texture.process(&buffer, 100, 100).unwrap();

        // Verify texture has been applied (values should vary)
        assert_eq!(result.len(), buffer.len());
        let has_variation = result
            .windows(2)
            .any(|w| (w[0].0 - w[1].0).abs() > 0.001);
        assert!(has_variation, "Texture should add variation");
    }

    #[test]
    fn test_all_texture_types() {
        let types = [
            TextureType::Canvas,
        ];

        for texture_type in types {
            let config = FineTextureConfig {
                texture_type,
                strength: 0.1,
                scale: 10.0,
                contrast: 0.5,
                anisotropy: 0.0,
                angle: 0.0,
            };
            let texture = FineTexture::new(config);
            
            // Should be enabled
            assert!(texture.is_enabled());
            
            // Should produce varying values
            let v1 = texture.get_texture_value(0.0, 0.0);
            let v2 = texture.get_texture_value(10.0, 10.0);
            assert_ne!(v1, v2);
        }
    }
}

