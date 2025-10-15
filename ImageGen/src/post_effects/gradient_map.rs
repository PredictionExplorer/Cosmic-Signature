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
    
    // === MUSEUM-QUALITY ADDITIONS ===
    
    /// Venetian Renaissance: Deep crimson, burnt sienna, gold leaf, ultramarine
    VenetianRenaissance,
    /// Japanese Ukiyo-e: Prussian blue, vermillion, gold, ink black
    JapaneseUkiyoe,
    /// Art Nouveau: Jade green, peacock blue, burnished copper, cream
    ArtNouveau,
    /// Lunar Opal: Silver, moonstone blue, pale lavender, pearl white
    LunarOpal,
    /// Fire Opal: Deep ruby, flame orange, citrine yellow, rose gold
    FireOpal,
    /// Deep Ocean: Abyssal blue, bioluminescent teal, phosphorescent green, midnight indigo
    DeepOcean,
    /// Aurora Borealis: Emerald green, electric violet, ice blue, magenta
    AuroraBorealis,
    /// Molten Metal: Dark iron, cherry red heat, yellow-white, platinum
    MoltenMetal,
    /// Ancient Jade: Deep jade, celadon, seafoam, white jade
    AncientJade,
    /// Royal Amethyst: Deep purple, violet, lavender, silver
    RoyalAmethyst,
    /// Desert Sunset: Burnt umber, terracotta, saffron, dusty rose
    DesertSunset,
    /// Polar Ice: Deep blue ice, cyan, pale turquoise, diamond white
    PolarIce,
    /// Peacock Feather: Deep teal, emerald, sapphire, gold
    PeacockFeather,
    /// Cherry Blossom: Deep burgundy, pink, pale pink, white
    CherryBlossom,
    /// Cosmic Nebula: Deep space purple, magenta, electric blue, star white
    CosmicNebula,
}

impl LuxuryPalette {
    /// Convert an integer index (0-14) to a palette variant.
    /// Useful for randomized palette selection.
    pub fn from_index(index: usize) -> Self {
        match index % 15 {  // Modulo ensures we always get a valid palette
            0 => LuxuryPalette::GoldPurple,
            1 => LuxuryPalette::CosmicTealPink,
            2 => LuxuryPalette::AmberCyan,
            3 => LuxuryPalette::IndigoGold,
            4 => LuxuryPalette::BlueOrange,
            5 => LuxuryPalette::VenetianRenaissance,
            6 => LuxuryPalette::JapaneseUkiyoe,
            7 => LuxuryPalette::ArtNouveau,
            8 => LuxuryPalette::LunarOpal,
            9 => LuxuryPalette::FireOpal,
            10 => LuxuryPalette::DeepOcean,
            11 => LuxuryPalette::AuroraBorealis,
            12 => LuxuryPalette::MoltenMetal,
            13 => LuxuryPalette::AncientJade,
            14 => LuxuryPalette::RoyalAmethyst,
            _ => unreachable!("Modulo 15 ensures index is 0-14"),
        }
    }
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
            
            // === MUSEUM-QUALITY PALETTE DEFINITIONS ===
            
            LuxuryPalette::VenetianRenaissance => {
                // Inspired by Titian, Tintoretto: rich, warm, luxurious
                let colors = [
                    (0.12, 0.05, 0.08), // Deep crimson shadow
                    (0.45, 0.12, 0.15), // Rich crimson
                    (0.55, 0.28, 0.18), // Burnt sienna
                    (0.85, 0.65, 0.25), // Gold leaf
                    (0.25, 0.35, 0.65), // Ultramarine blue
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::JapaneseUkiyoe => {
                // Inspired by Hokusai, Hiroshige: bold, graphic, elegant
                let colors = [
                    (0.05, 0.08, 0.15), // Ink black
                    (0.08, 0.15, 0.38), // Deep Prussian blue
                    (0.12, 0.35, 0.55), // Prussian blue
                    (0.75, 0.20, 0.18), // Vermillion red
                    (0.95, 0.75, 0.35), // Gold accent
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::ArtNouveau => {
                // Inspired by Mucha, Klimt: organic, flowing, metallic
                let colors = [
                    (0.15, 0.28, 0.22), // Deep jade green
                    (0.25, 0.45, 0.35), // Jade
                    (0.18, 0.42, 0.52), // Peacock blue
                    (0.58, 0.35, 0.22), // Burnished copper
                    (0.92, 0.88, 0.75), // Cream
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::LunarOpal => {
                // Cool, ethereal, mystical with opalescent shimmer
                let colors = [
                    (0.25, 0.28, 0.35), // Deep moonstone
                    (0.45, 0.52, 0.62), // Moonstone blue
                    (0.65, 0.62, 0.72), // Pale lavender
                    (0.85, 0.88, 0.92), // Pearl white
                    (0.95, 0.95, 0.98), // Diamond shimmer
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::FireOpal => {
                // Warm, intense, gem-like with internal fire
                let colors = [
                    (0.22, 0.05, 0.08), // Deep ruby
                    (0.65, 0.08, 0.12), // Ruby red
                    (0.88, 0.35, 0.15), // Flame orange
                    (0.95, 0.75, 0.25), // Citrine yellow
                    (0.92, 0.72, 0.52), // Rose gold
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::DeepOcean => {
                // Mysterious, bioluminescent, deep water aesthetics
                let colors = [
                    (0.02, 0.05, 0.15), // Midnight indigo
                    (0.05, 0.12, 0.28), // Abyssal blue
                    (0.08, 0.35, 0.45), // Deep ocean blue
                    (0.12, 0.55, 0.52), // Bioluminescent teal
                    (0.25, 0.72, 0.45), // Phosphorescent green
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::AuroraBorealis => {
                // Electric, dancing, celestial phenomenon
                let colors = [
                    (0.08, 0.15, 0.25), // Night sky
                    (0.15, 0.52, 0.38), // Emerald green
                    (0.22, 0.65, 0.72), // Ice blue
                    (0.65, 0.28, 0.75), // Electric violet
                    (0.85, 0.35, 0.72), // Magenta
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::MoltenMetal => {
                // Industrial, powerful, forge aesthetics
                let colors = [
                    (0.08, 0.08, 0.10), // Dark iron
                    (0.25, 0.12, 0.10), // Heated metal
                    (0.72, 0.18, 0.12), // Cherry red heat
                    (0.95, 0.82, 0.35), // Yellow-white hot
                    (0.88, 0.90, 0.92), // Platinum
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::AncientJade => {
                // Serene, precious, Chinese imperial aesthetics
                let colors = [
                    (0.08, 0.18, 0.15), // Deep jade
                    (0.25, 0.42, 0.35), // Jade green
                    (0.45, 0.62, 0.52), // Celadon
                    (0.68, 0.82, 0.75), // Seafoam
                    (0.88, 0.95, 0.92), // White jade
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::RoyalAmethyst => {
                // Regal, mystical, crystalline gem
                let colors = [
                    (0.15, 0.08, 0.22), // Deep purple
                    (0.35, 0.15, 0.48), // Royal purple
                    (0.55, 0.28, 0.65), // Amethyst violet
                    (0.75, 0.52, 0.82), // Light lavender
                    (0.85, 0.82, 0.88), // Silver
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::DesertSunset => {
                // Warm, earthy, Southwestern aesthetics
                let colors = [
                    (0.15, 0.08, 0.05), // Burnt umber
                    (0.42, 0.22, 0.15), // Deep terracotta
                    (0.68, 0.38, 0.22), // Terracotta
                    (0.88, 0.65, 0.25), // Saffron
                    (0.85, 0.62, 0.55), // Dusty rose
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::PolarIce => {
                // Crystalline, pristine, arctic beauty
                let colors = [
                    (0.05, 0.15, 0.25), // Deep blue ice
                    (0.15, 0.38, 0.52), // Glacial blue
                    (0.28, 0.58, 0.72), // Ice blue
                    (0.52, 0.78, 0.88), // Pale turquoise
                    (0.92, 0.98, 1.00), // Diamond white
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::PeacockFeather => {
                // Iridescent, luxurious, nature's artistry
                let colors = [
                    (0.05, 0.15, 0.18), // Deep teal
                    (0.12, 0.38, 0.42), // Teal
                    (0.15, 0.52, 0.35), // Emerald
                    (0.18, 0.35, 0.65), // Sapphire
                    (0.75, 0.58, 0.25), // Golden eye
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::CherryBlossom => {
                // Delicate, ephemeral, Japanese spring
                let colors = [
                    (0.22, 0.08, 0.12), // Deep burgundy branch
                    (0.55, 0.18, 0.25), // Deep pink
                    (0.82, 0.45, 0.52), // Cherry pink
                    (0.92, 0.72, 0.78), // Pale pink
                    (0.98, 0.95, 0.96), // White petals
                ];
                Self::interpolate_gradient(&colors, t)
            }
            LuxuryPalette::CosmicNebula => {
                // Deep space, stellar, cosmic wonder
                let colors = [
                    (0.05, 0.02, 0.12), // Deep space
                    (0.22, 0.08, 0.38), // Deep space purple
                    (0.55, 0.15, 0.65), // Nebula magenta
                    (0.25, 0.45, 0.82), // Electric blue
                    (0.95, 0.92, 0.98), // Star white
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
        use crate::utils::{is_zero, approx_eq};
        
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let delta = max - min;
        
        let v = max;
        let s = if max > 0.0 { delta / max } else { 0.0 };
        
        let h = if is_zero(delta) {
            0.0
        } else if approx_eq(max, r) {
            60.0 * (((g - b) / delta) % 6.0)
        } else if approx_eq(max, g) {
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

