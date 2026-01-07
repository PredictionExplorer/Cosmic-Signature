//! Museum-Quality Elegant Color Palettes
//!
//! This module provides sophisticated, muted color palettes inspired by
//! fine art, luxury materials, and natural phenomena.
//!
//! # Design Philosophy
//!
//! Museum-quality colors are characterized by:
//! - **Muted saturation**: Rich but not garish
//! - **Luminous undertones**: High lightness with controlled chroma
//! - **Harmonic relationships**: Colors that work together naturally
//! - **Refined subtlety**: Beauty in restraint
//!
//! # Palette Categories
//!
//! - **Natural**: Earth tones, ocean hues, celestial colors
//! - **Art Historical**: Renaissance, Impressionist, Japanese aesthetics
//! - **Material**: Precious metals, gemstones, textiles

// Module is prepared for future integration - suppress dead_code warnings
#![allow(dead_code)]

/// An elegant color palette optimized for museum-quality output
#[derive(Clone, Debug, PartialEq)]
pub struct ElegantPalette {
    /// Palette name for display/logging
    pub name: &'static str,
    
    /// Base hues for the three bodies (in OKLab hue degrees)
    pub hues: [f64; 3],
    
    /// Lightness values for the three bodies (0.0-1.0)
    pub lightnesses: [f64; 3],
    
    /// Chroma (saturation) values for the three bodies
    pub chromas: [f64; 3],
    
    /// Background tint (subtle color for pure black background variation)
    pub background_tint: [f64; 3],  // RGB 0-1
    
    /// Whether this palette works well with nebula backgrounds
    pub supports_nebula: bool,
}

impl ElegantPalette {
    /// Get palette by index (wraps around)
    pub fn from_index(index: usize) -> Self {
        ALL_PALETTES[index % ALL_PALETTES.len()].clone()
    }
    
    /// Get total number of available palettes
    pub fn count() -> usize {
        ALL_PALETTES.len()
    }
    
    /// Random palette selection weighted by elegance score
    pub fn random(seed: u64) -> Self {
        // Simple hash-based selection
        let index = (seed as usize) % ALL_PALETTES.len();
        ALL_PALETTES[index].clone()
    }
}

// ============================================================================
// NATURAL PALETTES - Inspired by Earth, Ocean, and Sky
// ============================================================================

/// Morning Frost - Cool, ethereal dawn colors
pub const MORNING_FROST: ElegantPalette = ElegantPalette {
    name: "Morning Frost",
    hues: [200.0, 180.0, 220.0],           // Cool blues
    lightnesses: [0.75, 0.70, 0.72],       // High luminosity
    chromas: [0.08, 0.06, 0.10],           // Very muted
    background_tint: [0.02, 0.03, 0.05],   // Deep blue-black
    supports_nebula: true,
};

/// Desert Twilight - Warm earth tones at dusk
pub const DESERT_TWILIGHT: ElegantPalette = ElegantPalette {
    name: "Desert Twilight",
    hues: [30.0, 15.0, 45.0],              // Warm oranges/terracotta
    lightnesses: [0.68, 0.72, 0.65],
    chromas: [0.10, 0.08, 0.12],           // Earthy saturation
    background_tint: [0.04, 0.02, 0.02],   // Warm black
    supports_nebula: true,
};

/// Deep Ocean - Bioluminescent ocean depths
pub const DEEP_OCEAN: ElegantPalette = ElegantPalette {
    name: "Deep Ocean",
    hues: [190.0, 170.0, 210.0],           // Ocean teals
    lightnesses: [0.65, 0.70, 0.68],
    chromas: [0.12, 0.10, 0.08],
    background_tint: [0.01, 0.02, 0.04],   // Abyssal blue
    supports_nebula: true,
};

/// Arctic Aurora - Northern lights palette
pub const ARCTIC_AURORA: ElegantPalette = ElegantPalette {
    name: "Arctic Aurora",
    hues: [140.0, 180.0, 280.0],           // Green-cyan-violet
    lightnesses: [0.72, 0.70, 0.68],
    chromas: [0.10, 0.08, 0.12],
    background_tint: [0.01, 0.01, 0.02],   // Dark violet
    supports_nebula: true,
};

// ============================================================================
// ART HISTORICAL PALETTES - Inspired by Fine Art Movements
// ============================================================================

/// Vermeer Light - Dutch Golden Age interior lighting
pub const VERMEER_LIGHT: ElegantPalette = ElegantPalette {
    name: "Vermeer Light",
    hues: [45.0, 210.0, 30.0],             // Gold, blue, amber
    lightnesses: [0.75, 0.65, 0.70],
    chromas: [0.10, 0.08, 0.12],
    background_tint: [0.02, 0.02, 0.01],   // Warm umber
    supports_nebula: false,
};

/// Monet Water - Impressionist water reflections
pub const MONET_WATER: ElegantPalette = ElegantPalette {
    name: "Monet Water",
    hues: [200.0, 140.0, 280.0],           // Water blue, lily green, violet
    lightnesses: [0.70, 0.72, 0.68],
    chromas: [0.08, 0.10, 0.06],           // Soft, diffused
    background_tint: [0.02, 0.02, 0.03],   // Misty blue
    supports_nebula: true,
};

/// Ukiyo-e Waves - Japanese woodblock print palette
pub const UKIYOE_WAVES: ElegantPalette = ElegantPalette {
    name: "Ukiyo-e Waves",
    hues: [220.0, 200.0, 0.0],             // Prussian blue, indigo, paper white
    lightnesses: [0.55, 0.65, 0.85],       // High contrast
    chromas: [0.15, 0.10, 0.02],           // Strong blue, subtle white
    background_tint: [0.01, 0.01, 0.02],   // Ink black
    supports_nebula: false,
};

/// Renaissance Gold - Florentine gilded tones
pub const RENAISSANCE_GOLD: ElegantPalette = ElegantPalette {
    name: "Renaissance Gold",
    hues: [40.0, 20.0, 350.0],             // Gold, sienna, deep rose
    lightnesses: [0.72, 0.60, 0.55],
    chromas: [0.12, 0.14, 0.10],
    background_tint: [0.03, 0.02, 0.02],   // Warm umber
    supports_nebula: false,
};

// ============================================================================
// MATERIAL PALETTES - Inspired by Precious Materials
// ============================================================================

/// Platinum Twilight - Cool precious metal tones
pub const PLATINUM_TWILIGHT: ElegantPalette = ElegantPalette {
    name: "Platinum Twilight",
    hues: [240.0, 200.0, 260.0],           // Cool silvers
    lightnesses: [0.75, 0.80, 0.70],       // Highly luminous
    chromas: [0.04, 0.05, 0.06],           // Nearly neutral
    background_tint: [0.02, 0.02, 0.02],   // Pure dark
    supports_nebula: true,
};

/// Rose Gold Dream - Warm metallic blush
pub const ROSE_GOLD_DREAM: ElegantPalette = ElegantPalette {
    name: "Rose Gold Dream",
    hues: [15.0, 350.0, 30.0],             // Copper, rose, gold
    lightnesses: [0.72, 0.68, 0.75],
    chromas: [0.08, 0.10, 0.08],
    background_tint: [0.03, 0.02, 0.02],   // Warm black
    supports_nebula: false,
};

/// Opal Fire - Iridescent gemstone colors
pub const OPAL_FIRE: ElegantPalette = ElegantPalette {
    name: "Opal Fire",
    hues: [200.0, 320.0, 40.0],            // Blue, magenta, fire
    lightnesses: [0.75, 0.70, 0.72],
    chromas: [0.10, 0.12, 0.10],
    background_tint: [0.01, 0.01, 0.01],   // Deep black
    supports_nebula: true,
};

/// Jade Serenity - Ancient Chinese jade tones
pub const JADE_SERENITY: ElegantPalette = ElegantPalette {
    name: "Jade Serenity",
    hues: [150.0, 130.0, 170.0],           // Jade greens
    lightnesses: [0.65, 0.70, 0.60],
    chromas: [0.10, 0.08, 0.12],
    background_tint: [0.01, 0.02, 0.01],   // Deep forest
    supports_nebula: true,
};

// ============================================================================
// MONOCHROMATIC PALETTES - Sophisticated single-hue variations
// ============================================================================

/// Graphite Dreams - Pure grayscale with subtle warmth
pub const GRAPHITE_DREAMS: ElegantPalette = ElegantPalette {
    name: "Graphite Dreams",
    hues: [30.0, 30.0, 30.0],              // Warm neutral
    lightnesses: [0.75, 0.65, 0.85],       // Light variation
    chromas: [0.02, 0.03, 0.01],           // Nearly monochrome
    background_tint: [0.02, 0.02, 0.02],   // True black
    supports_nebula: false,
};

/// Indigo Night - Deep blue monochrome
pub const INDIGO_NIGHT: ElegantPalette = ElegantPalette {
    name: "Indigo Night",
    hues: [250.0, 240.0, 260.0],           // Indigo variations
    lightnesses: [0.60, 0.70, 0.55],
    chromas: [0.14, 0.10, 0.16],
    background_tint: [0.01, 0.01, 0.03],   // Deep indigo
    supports_nebula: true,
};

// ============================================================================
// CELESTIAL PALETTES - Cosmic and astronomical
// ============================================================================

/// Nebula Whisper - Subtle cosmic gas clouds
pub const NEBULA_WHISPER: ElegantPalette = ElegantPalette {
    name: "Nebula Whisper",
    hues: [280.0, 200.0, 340.0],           // Purple, teal, pink
    lightnesses: [0.65, 0.70, 0.68],
    chromas: [0.10, 0.08, 0.12],
    background_tint: [0.02, 0.01, 0.02],   // Space purple
    supports_nebula: true,
};

/// Solar Prominence - Sun's chromosphere colors
pub const SOLAR_PROMINENCE: ElegantPalette = ElegantPalette {
    name: "Solar Prominence",
    hues: [25.0, 10.0, 45.0],              // Solar oranges
    lightnesses: [0.75, 0.70, 0.72],
    chromas: [0.14, 0.16, 0.12],
    background_tint: [0.01, 0.01, 0.01],   // Space black
    supports_nebula: false,
};

/// Lunar Silver - Moon surface tones
pub const LUNAR_SILVER: ElegantPalette = ElegantPalette {
    name: "Lunar Silver",
    hues: [220.0, 200.0, 240.0],           // Cool silvers
    lightnesses: [0.78, 0.72, 0.82],
    chromas: [0.03, 0.04, 0.02],           // Very muted
    background_tint: [0.01, 0.01, 0.01],   // Dark space
    supports_nebula: true,
};

// ============================================================================
// PALETTE COLLECTION
// ============================================================================

/// All available elegant palettes
pub const ALL_PALETTES: &[ElegantPalette] = &[
    // Natural
    MORNING_FROST,
    DESERT_TWILIGHT,
    DEEP_OCEAN,
    ARCTIC_AURORA,
    // Art Historical
    VERMEER_LIGHT,
    MONET_WATER,
    UKIYOE_WAVES,
    RENAISSANCE_GOLD,
    // Material
    PLATINUM_TWILIGHT,
    ROSE_GOLD_DREAM,
    OPAL_FIRE,
    JADE_SERENITY,
    // Monochromatic
    GRAPHITE_DREAMS,
    INDIGO_NIGHT,
    // Celestial
    NEBULA_WHISPER,
    SOLAR_PROMINENCE,
    LUNAR_SILVER,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_palette_count() {
        assert!(ElegantPalette::count() >= 15, "Should have many palettes");
    }

    #[test]
    fn test_palette_from_index_wraps() {
        let p1 = ElegantPalette::from_index(0);
        let p2 = ElegantPalette::from_index(ElegantPalette::count());
        assert_eq!(p1.name, p2.name, "Index should wrap around");
    }

    #[test]
    fn test_all_palettes_have_valid_values() {
        for palette in ALL_PALETTES {
            // Check hues are in valid range
            for &hue in &palette.hues {
                assert!(hue >= 0.0 && hue < 360.0, 
                    "Palette {} has invalid hue: {}", palette.name, hue);
            }
            
            // Check lightnesses are in valid range
            for &l in &palette.lightnesses {
                assert!(l >= 0.0 && l <= 1.0, 
                    "Palette {} has invalid lightness: {}", palette.name, l);
            }
            
            // Check chromas are muted (museum quality)
            for &c in &palette.chromas {
                assert!(c >= 0.0 && c <= 0.20, 
                    "Palette {} has too high chroma: {} (museum quality should be <= 0.20)", 
                    palette.name, c);
            }
            
            // Check background tint is dark
            for &t in &palette.background_tint {
                assert!(t >= 0.0 && t <= 0.10, 
                    "Palette {} has too bright background: {}", palette.name, t);
            }
        }
    }

    #[test]
    fn test_palette_chroma_is_muted() {
        // Museum quality means muted colors
        let max_chroma = 0.16;
        for palette in ALL_PALETTES {
            let avg_chroma = (palette.chromas[0] + palette.chromas[1] + palette.chromas[2]) / 3.0;
            assert!(avg_chroma <= max_chroma,
                "Palette {} has average chroma {} which exceeds museum quality threshold {}",
                palette.name, avg_chroma, max_chroma);
        }
    }

    #[test]
    fn test_palette_lightness_is_luminous() {
        // Museum quality means luminous, not dark
        let min_avg_lightness = 0.60;
        for palette in ALL_PALETTES {
            let avg_lightness = (palette.lightnesses[0] + palette.lightnesses[1] + palette.lightnesses[2]) / 3.0;
            assert!(avg_lightness >= min_avg_lightness,
                "Palette {} has average lightness {} which is below museum quality threshold {}",
                palette.name, avg_lightness, min_avg_lightness);
        }
    }

    #[test]
    fn test_palette_names_are_unique() {
        let mut names: Vec<&str> = ALL_PALETTES.iter().map(|p| p.name).collect();
        names.sort();
        let original_len = names.len();
        names.dedup();
        assert_eq!(names.len(), original_len, "Palette names should be unique");
    }
}

