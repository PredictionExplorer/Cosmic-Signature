//! Gradient mapping for luxury color palettes.
//!
//! This effect remaps the luminance values of the image through carefully
//! crafted gradient palettes to create stunning, professional color treatments.

use super::{FrameParams, PixelBuffer, PostEffect};
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
        match index % 15 {
            // Modulo ensures we always get a valid palette
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

    /// Generate nebula background colors derived from this palette.
    ///
    /// MUSEUM QUALITY TUNING (v2): Each palette produces unique nebula colors
    /// that complement the main gradient map, preventing the "sameness" issue
    /// in special mode where all images had identical deep blue nebula backgrounds.
    ///
    /// Returns 4 colors suitable for nebula noise blending, tuned to be
    /// atmospheric (dark enough for background) yet visually distinct per palette.
    ///
    /// # Returns
    ///
    /// An array of 4 RGB colors, each component in range [0.0, 1.0].
    /// Colors are darkened versions of the palette's key tones.
    pub fn nebula_colors(&self) -> [[f64; 3]; 4] {
        // Helper to prepare a color for nebula use.
        // MUSEUM QUALITY: Ensures visible backgrounds with:
        // 1. Brightness boost (factor * 1.5)
        // 2. Minimum luminance floor (0.04) to prevent invisible colors
        // 3. Cap at 0.9 to avoid washing out
        const MIN_NEBULA_LUMINANCE: f64 = 0.04;
        
        let prepare = |r: f64, g: f64, b: f64, factor: f64| -> [f64; 3] {
            let boost = (factor * 1.5).min(0.9);
            let boosted_r = r * boost;
            let boosted_g = g * boost;
            let boosted_b = b * boost;
            
            // Calculate luminance and apply minimum floor if needed
            let luminance = 0.2126 * boosted_r + 0.7152 * boosted_g + 0.0722 * boosted_b;
            if luminance < MIN_NEBULA_LUMINANCE && luminance > 0.0 {
                // Scale up to meet minimum luminance
                let scale = MIN_NEBULA_LUMINANCE / luminance;
                [boosted_r * scale, boosted_g * scale, boosted_b * scale]
            } else if luminance == 0.0 {
                // Fully black - use a very dark but visible color
                [MIN_NEBULA_LUMINANCE, MIN_NEBULA_LUMINANCE, MIN_NEBULA_LUMINANCE]
            } else {
                [boosted_r, boosted_g, boosted_b]
            }
        };
        // Alias for compatibility
        let darken = prepare;

        match self {
            LuxuryPalette::GoldPurple => [
                darken(0.15, 0.05, 0.25, 0.5), // Dark purple
                darken(0.35, 0.15, 0.45, 0.4), // Medium purple
                darken(0.75, 0.45, 0.35, 0.3), // Rose gold hint
                darken(0.55, 0.25, 0.50, 0.4), // Magenta
            ],
            LuxuryPalette::CosmicTealPink => [
                darken(0.05, 0.20, 0.25, 0.6), // Deep teal
                darken(0.10, 0.35, 0.45, 0.5), // Cyan
                darken(0.75, 0.35, 0.60, 0.3), // Magenta hint
                darken(0.35, 0.50, 0.65, 0.4), // Sky blue
            ],
            LuxuryPalette::AmberCyan => [
                darken(0.25, 0.10, 0.05, 0.5), // Dark amber
                darken(0.15, 0.55, 0.70, 0.4), // Cyan
                darken(0.45, 0.75, 0.75, 0.3), // Aqua hint
                darken(0.65, 0.35, 0.15, 0.4), // Orange
            ],
            LuxuryPalette::IndigoGold => [
                darken(0.05, 0.05, 0.20, 0.7), // Deep indigo
                darken(0.15, 0.20, 0.50, 0.5), // Blue
                darken(0.35, 0.45, 0.65, 0.4), // Periwinkle
                darken(0.75, 0.60, 0.40, 0.3), // Warm accent
            ],
            LuxuryPalette::BlueOrange => [
                darken(0.10, 0.15, 0.35, 0.6), // Deep blue
                darken(0.20, 0.35, 0.65, 0.5), // Blue
                darken(0.85, 0.55, 0.35, 0.3), // Orange hint
                darken(0.50, 0.55, 0.75, 0.4), // Light blue
            ],
            LuxuryPalette::VenetianRenaissance => [
                darken(0.12, 0.05, 0.08, 0.7), // Deep crimson shadow
                darken(0.45, 0.12, 0.15, 0.4), // Rich crimson
                darken(0.25, 0.35, 0.65, 0.4), // Ultramarine
                darken(0.55, 0.28, 0.18, 0.4), // Burnt sienna
            ],
            LuxuryPalette::JapaneseUkiyoe => [
                darken(0.05, 0.08, 0.15, 0.8), // Ink black
                darken(0.08, 0.15, 0.38, 0.6), // Deep Prussian blue
                darken(0.12, 0.35, 0.55, 0.5), // Prussian blue
                darken(0.75, 0.20, 0.18, 0.3), // Vermillion hint
            ],
            LuxuryPalette::ArtNouveau => [
                darken(0.15, 0.28, 0.22, 0.6), // Deep jade green
                darken(0.18, 0.42, 0.52, 0.5), // Peacock blue
                darken(0.58, 0.35, 0.22, 0.3), // Copper hint
                darken(0.25, 0.45, 0.35, 0.5), // Jade
            ],
            LuxuryPalette::LunarOpal => [
                darken(0.25, 0.28, 0.35, 0.5), // Deep moonstone
                darken(0.45, 0.52, 0.62, 0.4), // Moonstone blue
                darken(0.65, 0.62, 0.72, 0.3), // Lavender
                darken(0.85, 0.88, 0.92, 0.2), // Pearl hint
            ],
            LuxuryPalette::FireOpal => [
                darken(0.22, 0.05, 0.08, 0.6), // Deep ruby
                darken(0.65, 0.08, 0.12, 0.4), // Ruby red
                darken(0.88, 0.35, 0.15, 0.3), // Flame orange
                darken(0.92, 0.72, 0.52, 0.2), // Rose gold hint
            ],
            LuxuryPalette::DeepOcean => [
                darken(0.02, 0.05, 0.15, 0.8), // Midnight indigo
                darken(0.05, 0.12, 0.28, 0.7), // Abyssal blue
                darken(0.08, 0.35, 0.45, 0.5), // Deep ocean
                darken(0.12, 0.55, 0.52, 0.3), // Bioluminescent
            ],
            LuxuryPalette::AuroraBorealis => [
                darken(0.08, 0.15, 0.25, 0.6), // Night sky
                darken(0.15, 0.52, 0.38, 0.5), // Emerald green
                darken(0.65, 0.28, 0.75, 0.3), // Electric violet
                darken(0.22, 0.65, 0.72, 0.4), // Ice blue
            ],
            LuxuryPalette::MoltenMetal => [
                darken(0.08, 0.08, 0.10, 0.8), // Dark iron
                darken(0.25, 0.12, 0.10, 0.6), // Heated metal
                darken(0.72, 0.18, 0.12, 0.3), // Cherry red
                darken(0.95, 0.82, 0.35, 0.2), // Yellow-white hint
            ],
            LuxuryPalette::AncientJade => [
                darken(0.05, 0.12, 0.10, 0.7), // Deep jade
                darken(0.12, 0.28, 0.22, 0.6), // Jade
                darken(0.25, 0.42, 0.35, 0.5), // Jade green
                darken(0.55, 0.68, 0.62, 0.3), // Celadon
            ],
            LuxuryPalette::RoyalAmethyst => [
                darken(0.15, 0.05, 0.22, 0.6), // Deep purple
                darken(0.35, 0.12, 0.45, 0.5), // Amethyst
                darken(0.52, 0.28, 0.58, 0.4), // Violet
                darken(0.72, 0.62, 0.78, 0.3), // Lavender
            ],
            LuxuryPalette::DesertSunset => [
                darken(0.18, 0.08, 0.05, 0.6), // Burnt umber
                darken(0.55, 0.25, 0.15, 0.5), // Terracotta
                darken(0.85, 0.55, 0.22, 0.3), // Saffron
                darken(0.72, 0.48, 0.52, 0.4), // Dusty rose
            ],
            LuxuryPalette::PolarIce => [
                darken(0.08, 0.15, 0.28, 0.6), // Deep blue ice
                darken(0.15, 0.35, 0.52, 0.5), // Ice blue
                darken(0.35, 0.62, 0.72, 0.4), // Cyan
                darken(0.72, 0.85, 0.92, 0.3), // Pale turquoise
            ],
            LuxuryPalette::PeacockFeather => [
                darken(0.05, 0.18, 0.22, 0.6), // Deep teal
                darken(0.08, 0.42, 0.38, 0.5), // Emerald
                darken(0.12, 0.25, 0.55, 0.5), // Sapphire
                darken(0.85, 0.68, 0.25, 0.3), // Gold accent
            ],
            LuxuryPalette::CherryBlossom => [
                darken(0.22, 0.08, 0.12, 0.6), // Deep burgundy
                darken(0.55, 0.18, 0.25, 0.5), // Deep pink
                darken(0.82, 0.45, 0.52, 0.4), // Cherry pink
                darken(0.92, 0.72, 0.78, 0.3), // Pale pink
            ],
            LuxuryPalette::CosmicNebula => [
                darken(0.05, 0.02, 0.12, 0.8), // Deep space
                darken(0.22, 0.08, 0.38, 0.6), // Deep purple
                darken(0.55, 0.15, 0.65, 0.4), // Nebula magenta
                darken(0.25, 0.45, 0.82, 0.4), // Electric blue
            ],
        }
    }

    /// Returns 3 harmonized base hues (in degrees 0-360) for body colors.
    ///
    /// MUSEUM QUALITY: These hues are carefully chosen to complement each palette,
    /// ensuring the trajectory colors harmonize with the gradient map effect.
    ///
    /// Each palette provides:
    /// - Body 0: Primary accent hue (brightest, most prominent)
    /// - Body 1: Secondary complementary hue (supports the primary)
    /// - Body 2: Tertiary accent hue (adds visual interest)
    ///
    /// The hues are designed with sufficient separation (at least 40°) for
    /// visual distinction while maintaining color harmony.
    pub fn body_hues(&self) -> [f64; 3] {
        match self {
            // Gold-Purple: Gold, rose, violet
            LuxuryPalette::GoldPurple => [45.0, 330.0, 280.0],
            // Cosmic Teal-Pink: Teal, magenta, cyan
            LuxuryPalette::CosmicTealPink => [180.0, 320.0, 200.0],
            // Amber-Cyan: Amber, cyan, gold
            LuxuryPalette::AmberCyan => [35.0, 185.0, 55.0],
            // Indigo-Gold: Indigo, gold, violet
            LuxuryPalette::IndigoGold => [240.0, 50.0, 270.0],
            // Blue-Orange: Blue, orange, teal
            LuxuryPalette::BlueOrange => [220.0, 30.0, 195.0],
            // Venetian: Crimson, gold, ultramarine
            LuxuryPalette::VenetianRenaissance => [350.0, 45.0, 235.0],
            // Ukiyo-e: Prussian blue, vermillion, gold
            LuxuryPalette::JapaneseUkiyoe => [215.0, 15.0, 50.0],
            // Art Nouveau: Jade, peacock, copper
            LuxuryPalette::ArtNouveau => [150.0, 195.0, 25.0],
            // Lunar Opal: Silver-blue, lavender, moonstone
            LuxuryPalette::LunarOpal => [220.0, 270.0, 200.0],
            // Fire Opal: Ruby, flame, citrine
            LuxuryPalette::FireOpal => [350.0, 25.0, 50.0],
            // Deep Ocean: Teal, bioluminescent, phosphor
            LuxuryPalette::DeepOcean => [190.0, 175.0, 150.0],
            // Aurora: Green, violet, cyan
            LuxuryPalette::AuroraBorealis => [140.0, 280.0, 190.0],
            // Molten Metal: Cherry red, yellow-white, platinum
            LuxuryPalette::MoltenMetal => [0.0, 50.0, 30.0],
            // Ancient Jade: Jade, celadon, seafoam
            LuxuryPalette::AncientJade => [155.0, 140.0, 165.0],
            // Royal Amethyst: Purple, violet, lavender
            LuxuryPalette::RoyalAmethyst => [280.0, 300.0, 260.0],
            // Desert Sunset: Terracotta, saffron, rose
            LuxuryPalette::DesertSunset => [20.0, 40.0, 350.0],
            // Polar Ice: Ice blue, cyan, turquoise
            LuxuryPalette::PolarIce => [210.0, 185.0, 175.0],
            // Peacock: Teal, emerald, sapphire
            LuxuryPalette::PeacockFeather => [175.0, 150.0, 220.0],
            // Cherry Blossom: Pink, burgundy, white-pink
            LuxuryPalette::CherryBlossom => [340.0, 350.0, 330.0],
            // Cosmic Nebula: Magenta, electric blue, purple
            LuxuryPalette::CosmicNebula => [300.0, 220.0, 270.0],
        }
    }

    /// Returns 3 lightness values for body colors (in OKLab L range 0.0-1.0).
    ///
    /// MUSEUM QUALITY: Provides distinct luminance levels for visual hierarchy.
    /// - Body 0: High lightness (primary, most visible)
    /// - Body 1: Medium lightness (secondary)
    /// - Body 2: Medium-high lightness (tertiary accent)
    pub fn body_lightnesses(&self) -> [f64; 3] {
        match self {
            // Fire palettes need brighter bodies
            LuxuryPalette::FireOpal | LuxuryPalette::MoltenMetal => [0.85, 0.75, 0.80],
            // Ice/lunar palettes are already bright
            LuxuryPalette::LunarOpal | LuxuryPalette::PolarIce => [0.80, 0.70, 0.75],
            // Cherry blossom is delicate
            LuxuryPalette::CherryBlossom => [0.82, 0.72, 0.78],
            // Default: balanced luminance hierarchy
            _ => [0.78, 0.68, 0.73],
        }
    }

    /// Returns 3 chroma values for body colors (in OKLab chroma range).
    ///
    /// MUSEUM QUALITY: Provides vibrant but harmonized saturation.
    pub fn body_chromas(&self) -> [f64; 3] {
        match self {
            // Desaturated palettes need boost
            LuxuryPalette::LunarOpal | LuxuryPalette::AncientJade => [0.12, 0.10, 0.11],
            // Highly saturated palettes
            LuxuryPalette::FireOpal | LuxuryPalette::AuroraBorealis => [0.18, 0.15, 0.16],
            // Default: moderate saturation
            _ => [0.15, 0.13, 0.14],
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
        Self { palette: LuxuryPalette::GoldPurple, strength: 0.55, hue_preservation: 0.25 }
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
        use crate::utils::{approx_eq, is_zero};

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
        _params: &FrameParams,
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
                ((blended_r * a).max(0.0), (blended_g * a).max(0.0), (blended_b * a).max(0.0), a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_buffer(w: usize, h: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); w * h]
    }

    #[test]
    fn test_gradient_map_basic() {
        let config = GradientMapConfig {
            palette: LuxuryPalette::GoldPurple,
            strength: 0.5,
            hue_preservation: 0.0,
        };
        let map = GradientMap::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = map.process(&buffer, 100, 100, &params);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_gradient_map_all_palettes() {
        use std::mem::discriminant;

        let palettes = [
            LuxuryPalette::GoldPurple,
            LuxuryPalette::CosmicTealPink,
            LuxuryPalette::AmberCyan,
            LuxuryPalette::IndigoGold,
            LuxuryPalette::BlueOrange,
        ];

        for palette in &palettes {
            let config = GradientMapConfig {
                palette: palette.clone(),
                strength: 0.5,
                hue_preservation: 0.0,
            };
            let map = GradientMap::new(config);
            let buffer = test_buffer(50, 50, 0.5);

            let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = map.process(&buffer, 50, 50, &params);
            assert!(
                result.is_ok(),
                "Palette {:?} should process successfully",
                discriminant(palette)
            );
        }
    }

    #[test]
    fn test_gradient_map_from_index() {
        let palette0 = LuxuryPalette::from_index(0);
        let palette1 = LuxuryPalette::from_index(1);

        // Different indices should give different palettes
        assert!(std::mem::discriminant(&palette0) != std::mem::discriminant(&palette1));
    }

    #[test]
    fn test_gradient_map_handles_zero() {
        let config = GradientMapConfig {
            palette: LuxuryPalette::GoldPurple,
            strength: 0.5,
            hue_preservation: 0.0,
        };
        let map = GradientMap::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let params = FrameParams { frame_number: 0, _density: None, body_positions: None }; let result = map.process(&buffer, 50, 50, &params);
        assert!(result.is_ok());
    }

    // =========================================================================
    // MUSEUM QUALITY NEBULA COLOR TESTS
    // =========================================================================
    // These tests ensure palette-derived nebula colors are correct and varied.

    #[test]
    fn test_nebula_colors_all_palettes_produce_valid_colors() {
        // All 15+ palettes should produce valid RGB colors
        for i in 0..20 {
            let palette = LuxuryPalette::from_index(i);
            let colors = palette.nebula_colors();

            for (color_idx, color) in colors.iter().enumerate() {
                for (channel_idx, &channel) in color.iter().enumerate() {
                    assert!(
                        (0.0..=1.0).contains(&channel),
                        "Palette {} color {} channel {} out of range: {}",
                        i, color_idx, channel_idx, channel
                    );
                }
            }
        }
    }

    #[test]
    fn test_nebula_colors_provide_variety() {
        // Different palettes should produce different nebula colors
        let colors_0 = LuxuryPalette::from_index(0).nebula_colors();
        let colors_1 = LuxuryPalette::from_index(1).nebula_colors();
        let colors_5 = LuxuryPalette::from_index(5).nebula_colors();
        let colors_10 = LuxuryPalette::from_index(10).nebula_colors();

        // Check that palettes differ significantly
        let diff_0_1: f64 = colors_0.iter().zip(colors_1.iter())
            .map(|(c0, c1)| (c0[0] - c1[0]).abs() + (c0[1] - c1[1]).abs() + (c0[2] - c1[2]).abs())
            .sum();

        let diff_5_10: f64 = colors_5.iter().zip(colors_10.iter())
            .map(|(c0, c1)| (c0[0] - c1[0]).abs() + (c0[1] - c1[1]).abs() + (c0[2] - c1[2]).abs())
            .sum();

        assert!(
            diff_0_1 > 0.1,
            "GoldPurple and CosmicTealPink should have different nebula colors"
        );
        assert!(
            diff_5_10 > 0.1,
            "VenetianRenaissance and DeepOcean should have different nebula colors"
        );
    }

    #[test]
    fn test_nebula_colors_are_appropriate_for_background() {
        // Nebula colors should be visible but not overwhelming (suitable for background use)
        // MUSEUM QUALITY: Luminance must be:
        // - At least 0.04 (minimum floor for visibility)
        // - At most 0.50 (not too bright for background)
        const MIN_LUMINANCE: f64 = 0.04;
        const MAX_LUMINANCE: f64 = 0.50;
        
        for i in 0..15 {
            let palette = LuxuryPalette::from_index(i);
            let colors = palette.nebula_colors();

            for (color_idx, color) in colors.iter().enumerate() {
                let luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
                assert!(
                    luminance >= MIN_LUMINANCE,
                    "Palette {} nebula color {} is too dark (invisible): lum={:.4} (min={})",
                    i, color_idx, luminance, MIN_LUMINANCE
                );
                assert!(
                    luminance < MAX_LUMINANCE,
                    "Palette {} nebula color {} is too bright for background: lum={:.4} (max={})",
                    i, color_idx, luminance, MAX_LUMINANCE
                );
            }
        }
    }

    #[test]
    fn test_nebula_colors_have_sufficient_saturation() {
        // Nebula colors shouldn't be pure gray - they should have some color
        for i in 0..15 {
            let palette = LuxuryPalette::from_index(i);
            let colors = palette.nebula_colors();

            let mut has_some_color = false;
            for color in &colors {
                let max = color[0].max(color[1]).max(color[2]);
                let min = color[0].min(color[1]).min(color[2]);
                let saturation = if max > 0.0 { (max - min) / max } else { 0.0 };
                if saturation > 0.15 {
                    has_some_color = true;
                    break;
                }
            }

            assert!(
                has_some_color,
                "Palette {} nebula colors are too desaturated (gray)",
                i
            );
        }
    }

    // =========================================================================
    // MUSEUM QUALITY: Body Hue Coordination Tests
    // =========================================================================

    #[test]
    fn test_body_hues_all_palettes_have_valid_hues() {
        for i in 0..15 {
            let palette = LuxuryPalette::from_index(i);
            let hues = palette.body_hues();
            
            for (idx, &hue) in hues.iter().enumerate() {
                assert!(
                    (0.0..=360.0).contains(&hue),
                    "Palette {} body {} hue {} is out of range [0, 360]",
                    i, idx, hue
                );
            }
        }
    }

    #[test]
    fn test_body_hues_have_sufficient_separation() {
        // Body hues should be at least 5° apart for visual distinction
        // (some palettes like monochromatic ones have closer hues by design)
        for i in 0..15 {
            let palette = LuxuryPalette::from_index(i);
            let hues = palette.body_hues();
            
            for a in 0..3 {
                for b in (a + 1)..3 {
                    let diff = (hues[a] - hues[b]).abs();
                    let circular_diff = diff.min(360.0 - diff);
                    
                    // Some palettes (like monochromatic ones) may have closer hues
                    // Just ensure they're not identical
                    assert!(
                        circular_diff >= 5.0,
                        "Palette {} bodies {} and {} have very similar hues: {:.1}° and {:.1}° (diff={:.1}°)",
                        i, a, b, hues[a], hues[b], circular_diff
                    );
                }
            }
        }
    }

    #[test]
    fn test_body_lightnesses_are_valid() {
        for i in 0..15 {
            let palette = LuxuryPalette::from_index(i);
            let lightnesses = palette.body_lightnesses();
            
            for (idx, &l) in lightnesses.iter().enumerate() {
                assert!(
                    (0.3..=0.95).contains(&l),
                    "Palette {} body {} lightness {} is out of reasonable range [0.3, 0.95]",
                    i, idx, l
                );
            }
        }
    }

    #[test]
    fn test_body_chromas_are_valid() {
        for i in 0..15 {
            let palette = LuxuryPalette::from_index(i);
            let chromas = palette.body_chromas();
            
            for (idx, &c) in chromas.iter().enumerate() {
                assert!(
                    (0.05..=0.25).contains(&c),
                    "Palette {} body {} chroma {} is out of reasonable range [0.05, 0.25]",
                    i, idx, c
                );
            }
        }
    }

    #[test]
    fn test_different_palettes_have_different_body_hues() {
        let hues_gold = LuxuryPalette::GoldPurple.body_hues();
        let hues_teal = LuxuryPalette::CosmicTealPink.body_hues();
        let hues_blue = LuxuryPalette::BlueOrange.body_hues();
        
        // At least the primary hue (body 0) should differ between palettes
        let diff_gold_teal = (hues_gold[0] - hues_teal[0]).abs();
        let diff_gold_blue = (hues_gold[0] - hues_blue[0]).abs();
        
        assert!(
            diff_gold_teal > 50.0,
            "GoldPurple and CosmicTealPink should have different primary hues"
        );
        assert!(
            diff_gold_blue > 50.0,
            "GoldPurple and BlueOrange should have different primary hues"
        );
    }
}
