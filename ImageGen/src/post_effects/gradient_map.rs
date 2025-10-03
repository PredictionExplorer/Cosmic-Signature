//! Gradient mapping for luxury color palettes.
//!
//! This effect remaps the luminance values of the image through carefully
//! crafted gradient palettes to create stunning, professional color treatments.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Predefined luxury color palettes
#[derive(Clone, Debug)]
#[allow(dead_code)]
pub enum LuxuryPalette {
    /// Rich gold to deep purple gradient
    GoldPurple,
    /// Cosmic teal to vibrant pink
    CosmicTealPink,
    /// Warm amber to cool cyan
    AmberCyan,
    /// Deep indigo to bright gold
    IndigoGold,
    /// Ethereal blue to warm orange
    BlueOrange,
}

/// Configuration for gradient mapping effect
#[derive(Clone, Debug)]
pub struct GradientMapConfig {
    /// Selected luxury palette
    pub palette: LuxuryPalette,
    /// Strength of the effect (0.0 = original, 1.0 = full gradient map)
    pub strength: f64,
    /// Preserve original hue to some degree
    pub hue_preservation: f64,
}

impl Default for GradientMapConfig {
    fn default() -> Self {
        Self {
            palette: LuxuryPalette::GoldPurple,
            strength: 0.55,
            hue_preservation: 0.25,
        }
    }
}

/// Gradient mapping post-effect
pub struct GradientMap {
    config: GradientMapConfig,
    enabled: bool,
}

impl GradientMap {
    pub fn new(config: GradientMapConfig) -> Self {
        Self { config, enabled: true }
    }

    /// Get color from palette at normalized position (0.0 to 1.0)
    fn sample_palette(&self, t: f64) -> (f64, f64, f64) {
        let t = t.clamp(0.0, 1.0);
        
        match self.config.palette {
            LuxuryPalette::GoldPurple => {
                // Deep purple -> Rich gold
                let colors = [
                    (0.15, 0.05, 0.25), // Dark purple
                    (0.35, 0.15, 0.45), // Medium purple
                    (0.55, 0.25, 0.50), // Magenta
                    (0.75, 0.45, 0.35), // Rose gold
                    (0.95, 0.75, 0.35), // Bright gold
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::CosmicTealPink => {
                // Deep teal -> Vibrant pink
                let colors = [
                    (0.05, 0.20, 0.25), // Deep teal
                    (0.10, 0.35, 0.45), // Cyan
                    (0.35, 0.50, 0.65), // Sky blue
                    (0.75, 0.35, 0.60), // Magenta
                    (0.95, 0.55, 0.75), // Bright pink
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::AmberCyan => {
                // Warm amber -> Cool cyan
                let colors = [
                    (0.25, 0.10, 0.05), // Dark amber
                    (0.65, 0.35, 0.15), // Orange
                    (0.85, 0.75, 0.45), // Yellow
                    (0.45, 0.75, 0.75), // Aqua
                    (0.15, 0.55, 0.70), // Cyan
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::IndigoGold => {
                // Deep indigo -> Bright gold
                let colors = [
                    (0.05, 0.05, 0.20), // Indigo
                    (0.15, 0.20, 0.50), // Blue
                    (0.35, 0.45, 0.65), // Periwinkle
                    (0.75, 0.60, 0.40), // Warm beige
                    (1.00, 0.85, 0.40), // Bright gold
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::BlueOrange => {
                // Ethereal blue -> Warm orange
                let colors = [
                    (0.10, 0.15, 0.35), // Deep blue
                    (0.20, 0.35, 0.65), // Blue
                    (0.50, 0.55, 0.75), // Light blue
                    (0.85, 0.55, 0.35), // Orange
                    (0.95, 0.65, 0.25), // Bright orange
                ];
                Self::interpolate_gradient(&colors, t)
            }
        }
    }

    /// Interpolate between gradient stop colors
    fn interpolate_gradient(colors: &[(f64, f64, f64)], t: f64) -> (f64, f64, f64) {
        let n = colors.len() - 1;
        let segment = (t * n as f64).min(n as f64 - 0.0001);
        let idx = segment.floor() as usize;
        let local_t = segment - idx as f64;
        
        let c0 = colors[idx];
        let c1 = colors[(idx + 1).min(n)];
        
        (
            c0.0 + (c1.0 - c0.0) * local_t,
            c0.1 + (c1.1 - c0.1) * local_t,
            c0.2 + (c1.2 - c0.2) * local_t,
        )
    }

    /// Convert RGB to HSV
    fn rgb_to_hsv(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let delta = max - min;
        
        let v = max;
        let s = if max > 0.0 { delta / max } else { 0.0 };
        
        let h = if delta == 0.0 {
            0.0
        } else if max == r {
            60.0 * (((g - b) / delta) % 6.0)
        } else if max == g {
            60.0 * (((b - r) / delta) + 2.0)
        } else {
            60.0 * (((r - g) / delta) + 4.0)
        };
        
        let h = if h < 0.0 { h + 360.0 } else { h };
        
        (h, s, v)
    }

    /// Convert HSV to RGB
    fn hsv_to_rgb(h: f64, s: f64, v: f64) -> (f64, f64, f64) {
        let c = v * s;
        let h_prime = h / 60.0;
        let x = c * (1.0 - ((h_prime % 2.0) - 1.0).abs());
        let m = v - c;
        
        let (r, g, b) = match h_prime as i32 {
            0 => (c, x, 0.0),
            1 => (x, c, 0.0),
            2 => (0.0, c, x),
            3 => (0.0, x, c),
            4 => (x, 0.0, c),
            _ => (c, 0.0, x),
        };
        
        (r + m, g + m, b + m)
    }
}

impl PostEffect for GradientMap {
    fn is_enabled(&self) -> bool {
        self.enabled && self.config.strength > 0.0
    }

    fn process(
        &self,
        input: &PixelBuffer,
        _width: usize,
        _height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        let output: PixelBuffer = input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                // Convert to straight alpha
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Calculate luminance
                let lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;

                // Sample gradient at luminance
                let (gr, gg, gb) = self.sample_palette(lum);

                // Apply hue preservation if requested
                let (final_r, final_g, final_b) = if self.config.hue_preservation > 0.0 {
                    let (orig_h, orig_s, _) = Self::rgb_to_hsv(sr, sg, sb);
                    let (grad_h, grad_s, grad_v) = Self::rgb_to_hsv(gr, gg, gb);
                    
                    // Blend hues
                    let blended_h = orig_h * self.config.hue_preservation 
                        + grad_h * (1.0 - self.config.hue_preservation);
                    let blended_s = orig_s * self.config.hue_preservation 
                        + grad_s * (1.0 - self.config.hue_preservation);
                    
                    Self::hsv_to_rgb(blended_h, blended_s, grad_v)
                } else {
                    (gr, gg, gb)
                };

                // Blend with original based on strength
                let strength = self.config.strength;
                let blended_r = sr * (1.0 - strength) + final_r * strength;
                let blended_g = sg * (1.0 - strength) + final_g * strength;
                let blended_b = sb * (1.0 - strength) + final_b * strength;

                // Convert back to premultiplied alpha
                (
                    (blended_r * a).max(0.0),
                    (blended_g * a).max(0.0),
                    (blended_b * a).max(0.0),
                    a,
                )
            })
            .collect();

        Ok(output)
    }
}

