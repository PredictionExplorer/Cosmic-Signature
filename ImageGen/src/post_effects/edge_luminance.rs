//! Edge luminance enhancement for refined, defined forms.
//!
//! This effect detects edges in the image and selectively brightens them,
//! creating a subtle highlighting that enhances the definition of forms
//! without introducing harsh outlines. Creates a refined, gallery-quality look.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for edge luminance enhancement
#[derive(Clone, Debug)]
pub struct EdgeLuminanceConfig {
    /// Overall strength of edge enhancement (0.0-1.0)
    pub strength: f64,
    /// Sensitivity to edge detection (lower = more edges detected)
    pub threshold: f64,
    /// Brightness boost for detected edges
    pub brightness_boost: f64,
    /// Apply enhancement only to bright edges (vs all edges)
    pub bright_edges_only: bool,
    /// Minimum luminance for edge to be enhanced (if bright_edges_only)
    pub min_luminance: f64,
}

impl Default for EdgeLuminanceConfig {
    fn default() -> Self {
        Self {
            strength: 0.25,
            threshold: 0.15,
            brightness_boost: 0.35,
            bright_edges_only: true,
            min_luminance: 0.25,
        }
    }
}

/// Edge luminance enhancement post-effect
pub struct EdgeLuminance {
    config: EdgeLuminanceConfig,
    enabled: bool,
}

impl EdgeLuminance {
    pub fn new(config: EdgeLuminanceConfig) -> Self {
        let enabled = config.strength > 0.0;
        Self { config, enabled }
    }

    /// Calculate luminance from RGB
    #[inline]
    fn calculate_luminance(r: f64, g: f64, b: f64) -> f64 {
        0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /// Get pixel luminance safely
    #[inline]
    fn get_pixel_lum(
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: isize,
        y: isize,
    ) -> f64 {
        if x < 0 || y < 0 || x >= width as isize || y >= height as isize {
            return 0.0;
        }

        let idx = (y as usize) * width + (x as usize);
        if idx >= buffer.len() {
            return 0.0;
        }

        let (r, g, b, a) = buffer[idx];
        if a <= 0.0 {
            return 0.0;
        }

        Self::calculate_luminance(r / a, g / a, b / a)
    }

    /// Detect edge strength at a given pixel using Sobel operator
    fn detect_edge_strength(
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: usize,
        y: usize,
    ) -> f64 {
        let x = x as isize;
        let y = y as isize;

        // Sobel operator for edge detection
        // Horizontal gradient (Gx)
        let gx = -Self::get_pixel_lum(buffer, width, height, x - 1, y - 1)
            - 2.0 * Self::get_pixel_lum(buffer, width, height, x - 1, y)
            - Self::get_pixel_lum(buffer, width, height, x - 1, y + 1)
            + Self::get_pixel_lum(buffer, width, height, x + 1, y - 1)
            + 2.0 * Self::get_pixel_lum(buffer, width, height, x + 1, y)
            + Self::get_pixel_lum(buffer, width, height, x + 1, y + 1);

        // Vertical gradient (Gy)
        let gy = -Self::get_pixel_lum(buffer, width, height, x - 1, y - 1)
            - 2.0 * Self::get_pixel_lum(buffer, width, height, x, y - 1)
            - Self::get_pixel_lum(buffer, width, height, x + 1, y - 1)
            + Self::get_pixel_lum(buffer, width, height, x - 1, y + 1)
            + 2.0 * Self::get_pixel_lum(buffer, width, height, x, y + 1)
            + Self::get_pixel_lum(buffer, width, height, x + 1, y + 1);

        // Gradient magnitude
        (gx * gx + gy * gy).sqrt()
    }

    /// Apply smooth edge enhancement that preserves color
    fn enhance_pixel(
        &self,
        r: f64,
        g: f64,
        b: f64,
        a: f64,
        edge_strength: f64,
        luminance: f64,
    ) -> (f64, f64, f64, f64) {
        // Convert to straight alpha
        let sr = r / a;
        let sg = g / a;
        let sb = b / a;

        // Check if edge is strong enough
        if edge_strength < self.config.threshold {
            return (r, g, b, a);
        }

        // Check luminance requirement
        if self.config.bright_edges_only && luminance < self.config.min_luminance {
            return (r, g, b, a);
        }

        // Calculate enhancement factor
        let edge_factor = ((edge_strength - self.config.threshold)
            / (1.0 - self.config.threshold))
            .clamp(0.0, 1.0);

        let enhancement = edge_factor * self.config.strength * self.config.brightness_boost;

        // Apply enhancement preserving color ratios
        let boost = 1.0 + enhancement;
        let enhanced_r = sr * boost;
        let enhanced_g = sg * boost;
        let enhanced_b = sb * boost;

        // Soft clamp to preserve HDR while preventing extreme values
        let max_val = enhanced_r.max(enhanced_g).max(enhanced_b);
        let (final_r, final_g, final_b) = if max_val > 1.5 {
            let scale = 1.5 / max_val;
            (enhanced_r * scale, enhanced_g * scale, enhanced_b * scale)
        } else {
            (enhanced_r, enhanced_g, enhanced_b)
        };

        // Convert back to premultiplied alpha
        (final_r * a, final_g * a, final_b * a, a)
    }
}

impl PostEffect for EdgeLuminance {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        // First pass: detect edges
        let edge_map: Vec<f64> = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;

                // Skip border pixels
                if x == 0 || y == 0 || x >= width - 1 || y >= height - 1 {
                    return 0.0;
                }

                Self::detect_edge_strength(input, width, height, x, y)
            })
            .collect();

        // Second pass: enhance edges
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let edge_strength = edge_map[idx];
                let luminance = Self::calculate_luminance(r / a, g / a, b / a);

                self.enhance_pixel(r, g, b, a, edge_strength, luminance)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_luminance_disabled() {
        let config = EdgeLuminanceConfig {
            strength: 0.0,
            ..EdgeLuminanceConfig::default()
        };
        let edge = EdgeLuminance::new(config);
        assert!(!edge.is_enabled());
    }

    #[test]
    fn test_edge_luminance_enabled() {
        let config = EdgeLuminanceConfig::default();
        let edge = EdgeLuminance::new(config);
        assert!(edge.is_enabled());
    }

    #[test]
    fn test_luminance_calculation() {
        // Pure white
        let lum = EdgeLuminance::calculate_luminance(1.0, 1.0, 1.0);
        assert!((lum - 1.0).abs() < 0.01);

        // Pure black
        let lum = EdgeLuminance::calculate_luminance(0.0, 0.0, 0.0);
        assert!(lum < 0.01);

        // Mid gray
        let lum = EdgeLuminance::calculate_luminance(0.5, 0.5, 0.5);
        assert!((lum - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_edge_detection() {
        // Create a buffer with a clear edge
        let mut buffer = vec![(0.0, 0.0, 0.0, 1.0); 100];
        
        // Make right half bright (creates vertical edge)
        for i in 0..10 {
            for j in 5..10 {
                buffer[i * 10 + j] = (1.0, 1.0, 1.0, 1.0);
            }
        }

        // Check edge detection at the boundary
        let edge_strength = EdgeLuminance::detect_edge_strength(&buffer, 10, 10, 5, 5);
        assert!(edge_strength > 0.5, "Should detect strong edge");

        // Check non-edge area
        let no_edge = EdgeLuminance::detect_edge_strength(&buffer, 10, 10, 2, 2);
        assert!(no_edge < 0.1, "Should not detect edge in uniform area");
    }

    #[test]
    fn test_buffer_processing() {
        let config = EdgeLuminanceConfig::default();
        let edge = EdgeLuminance::new(config);

        // Create simple gradient (creates edges)
        let buffer: PixelBuffer = (0..10000)
            .map(|i| {
                let val = ((i % 100) as f64 / 100.0) * 0.5;
                (val, val, val, 1.0)
            })
            .collect();

        let result = edge.process(&buffer, 100, 100).unwrap();
        assert_eq!(result.len(), buffer.len());
    }
}

