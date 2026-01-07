//! Cosmic Palette System for Museum-Quality Rendering
//!
//! This module provides a curated 2-color palette system designed for
//! sophisticated, museum-quality space art. Each palette follows the
//! principle of radical restraint: one primary color, one accent, and void.

#![allow(dead_code)] // Module is part of museum mode API
//!
//! # Design Philosophy
//!
//! - **Two colors maximum**: Primary (80%) + Accent (5%) + Void (15%)
//! - **Curated harmony**: Colors chosen for aesthetic compatibility
//! - **Cosmic authenticity**: Inspired by real astronomical phenomena
//! - **Emotional resonance**: Each palette evokes a distinct mood
//!
//! # Palette Categories
//!
//! - **Stellar**: Based on star colors and temperatures
//! - **Nebular**: Inspired by emission/reflection nebulae
//! - **Galactic**: Deep space and intergalactic void
//! - **Atmospheric**: Auroras, planetary atmospheres

use std::f64::consts::PI;

/// A curated two-color palette for museum-quality rendering
#[derive(Clone, Debug, PartialEq)]
pub struct CosmicPalette {
    /// Palette name for identification
    pub name: &'static str,
    
    /// Primary color (RGB, 0-1 range) - dominates the image
    pub primary: [f64; 3],
    
    /// Accent color (RGB, 0-1 range) - sparse highlights
    pub accent: [f64; 3],
    
    /// Background gradient start (near black)
    pub void_deep: [f64; 3],
    
    /// Background gradient end (subtle color)
    pub void_horizon: [f64; 3],
    
    /// Emotional/aesthetic description
    pub mood: &'static str,
}

impl CosmicPalette {
    /// Get palette by index (wraps around)
    pub fn from_index(index: usize) -> &'static CosmicPalette {
        &ALL_COSMIC_PALETTES[index % ALL_COSMIC_PALETTES.len()]
    }
    
    /// Get total number of available palettes
    pub fn count() -> usize {
        ALL_COSMIC_PALETTES.len()
    }
    
    /// Select palette based on seed for deterministic randomization
    pub fn from_seed(seed: u64) -> &'static CosmicPalette {
        let index = (seed as usize) % ALL_COSMIC_PALETTES.len();
        &ALL_COSMIC_PALETTES[index]
    }
    
    /// Interpolate between primary and accent based on intensity
    /// 
    /// - intensity 0.0 = pure primary
    /// - intensity 1.0 = pure accent
    pub fn blend(&self, intensity: f64) -> [f64; 3] {
        let t = intensity.clamp(0.0, 1.0);
        [
            self.primary[0] * (1.0 - t) + self.accent[0] * t,
            self.primary[1] * (1.0 - t) + self.accent[1] * t,
            self.primary[2] * (1.0 - t) + self.accent[2] * t,
        ]
    }
    
    /// Get background color for a given vertical position (0=bottom, 1=top)
    pub fn background_at(&self, y_normalized: f64) -> [f64; 3] {
        let t = y_normalized.clamp(0.0, 1.0);
        // Subtle gradient from deep void to horizon
        [
            self.void_deep[0] * (1.0 - t) + self.void_horizon[0] * t,
            self.void_deep[1] * (1.0 - t) + self.void_horizon[1] * t,
            self.void_deep[2] * (1.0 - t) + self.void_horizon[2] * t,
        ]
    }
    
    /// Convert brightness (0-1) to colored value using palette
    /// 
    /// Uses a sophisticated curve:
    /// - Low brightness: primary color, dimmed
    /// - Medium brightness: full primary
    /// - High brightness: shifts toward accent
    pub fn brightness_to_color(&self, brightness: f64, accent_threshold: f64) -> [f64; 3] {
        let b = brightness.clamp(0.0, 1.0);
        
        if b < accent_threshold {
            // Below threshold: pure primary, scaled by brightness
            let scale = b / accent_threshold;
            [
                self.primary[0] * scale,
                self.primary[1] * scale,
                self.primary[2] * scale,
            ]
        } else {
            // Above threshold: blend toward accent
            let blend = (b - accent_threshold) / (1.0 - accent_threshold);
            let blend = blend.powf(2.0); // Quadratic for subtle transition
            self.blend(blend)
        }
    }
}

// ============================================================================
// STELLAR PALETTES - Based on star temperatures and colors
// ============================================================================

/// Ice & Fire - The contrast of hot and cold stars
pub const ICE_AND_FIRE: CosmicPalette = CosmicPalette {
    name: "Ice & Fire",
    primary: [0.227, 0.353, 0.549],    // Steel blue (#3a5a8c)
    accent: [1.0, 0.420, 0.208],       // Ember orange (#ff6b35)
    void_deep: [0.008, 0.012, 0.024],  // Near black with blue hint
    void_horizon: [0.020, 0.035, 0.055], // Subtle blue
    mood: "Dynamic tension between cosmic extremes",
};

/// Moonlight - Silver and gold celestial elegance
pub const MOONLIGHT: CosmicPalette = CosmicPalette {
    name: "Moonlight",
    primary: [0.753, 0.753, 0.753],    // Silver (#c0c0c0)
    accent: [1.0, 0.843, 0.0],         // Gold (#ffd700)
    void_deep: [0.004, 0.004, 0.008],  // Deep space black
    void_horizon: [0.012, 0.012, 0.020], // Hint of purple
    mood: "Celestial elegance and timeless beauty",
};

/// Blue Giant - Hot blue stars
pub const BLUE_GIANT: CosmicPalette = CosmicPalette {
    name: "Blue Giant",
    primary: [0.529, 0.808, 0.922],    // Light blue (#87ceeb)
    accent: [1.0, 1.0, 1.0],           // Pure white
    void_deep: [0.004, 0.008, 0.016],  // Deep blue-black
    void_horizon: [0.016, 0.024, 0.040], // Subtle blue
    mood: "The fierce beauty of stellar youth",
};

/// Red Dwarf - Cool red stars, long-lived and steady
pub const RED_DWARF: CosmicPalette = CosmicPalette {
    name: "Red Dwarf",
    primary: [0.804, 0.361, 0.361],    // Indian red (#cd5c5c)
    accent: [1.0, 0.647, 0.0],         // Orange (#ffa500)
    void_deep: [0.016, 0.004, 0.004],  // Deep red-black
    void_horizon: [0.028, 0.012, 0.012], // Warm darkness
    mood: "Ancient patience and quiet endurance",
};

// ============================================================================
// NEBULAR PALETTES - Inspired by emission and reflection nebulae
// ============================================================================

/// Nebula Core - Deep purple with magenta highlights
pub const NEBULA_CORE: CosmicPalette = CosmicPalette {
    name: "Nebula Core",
    primary: [0.392, 0.196, 0.490],    // Deep purple (#643c7d)
    accent: [1.0, 0.0, 1.0],           // Magenta (#ff00ff)
    void_deep: [0.012, 0.004, 0.020],  // Purple-black
    void_horizon: [0.024, 0.012, 0.035], // Subtle violet
    mood: "The birthplace of stars, raw cosmic energy",
};

/// Orion's Veil - Soft pink emission nebula
pub const ORIONS_VEIL: CosmicPalette = CosmicPalette {
    name: "Orion's Veil",
    primary: [0.867, 0.627, 0.667],    // Dusty rose (#dda0aa)
    accent: [0.678, 0.847, 0.902],     // Light blue (#add8e6)
    void_deep: [0.012, 0.008, 0.012],  // Neutral dark
    void_horizon: [0.024, 0.016, 0.024], // Warm hint
    mood: "Delicate cosmic nursery, new beginnings",
};

/// Pillars of Creation - Iconic nebula colors
pub const PILLARS: CosmicPalette = CosmicPalette {
    name: "Pillars of Creation",
    primary: [0.545, 0.353, 0.169],    // Saddle brown dust
    accent: [0.255, 0.412, 0.882],     // Royal blue stars
    void_deep: [0.008, 0.008, 0.012],  // Deep space
    void_horizon: [0.020, 0.016, 0.024], // Subtle warmth
    mood: "Towering cosmic structures, sublime scale",
};

// ============================================================================
// GALACTIC PALETTES - Deep space and intergalactic void
// ============================================================================

/// Deep Ocean - Bioluminescent abyss
pub const DEEP_OCEAN: CosmicPalette = CosmicPalette {
    name: "Deep Ocean",
    primary: [0.039, 0.165, 0.290],    // Dark blue (#0a2a4a)
    accent: [0.0, 1.0, 0.941],         // Cyan bioluminescence (#00fff0)
    void_deep: [0.0, 0.008, 0.016],    // Abyss
    void_horizon: [0.008, 0.020, 0.035], // Deep blue
    mood: "Mysterious depths, alien life",
};

/// Void & Ember - Stark minimalism
pub const VOID_AND_EMBER: CosmicPalette = CosmicPalette {
    name: "Void & Ember",
    primary: [0.063, 0.063, 0.063],    // Near black
    accent: [1.0, 0.271, 0.0],         // Hot coal (#ff4500)
    void_deep: [0.0, 0.0, 0.0],        // Pure black
    void_horizon: [0.004, 0.004, 0.004], // Barely visible
    mood: "Stark drama, the first light in darkness",
};

/// Galactic Arm - Milky Way spiral
pub const GALACTIC_ARM: CosmicPalette = CosmicPalette {
    name: "Galactic Arm",
    primary: [0.871, 0.835, 0.773],    // Pale starlight
    accent: [0.529, 0.808, 0.980],     // Hot blue stars
    void_deep: [0.004, 0.004, 0.008],  // Deep void
    void_horizon: [0.016, 0.016, 0.024], // Dust lanes
    mood: "Our cosmic home, familiar infinity",
};

// ============================================================================
// ATMOSPHERIC PALETTES - Auroras and planetary atmospheres
// ============================================================================

/// Aurora Borealis - Northern lights
pub const AURORA: CosmicPalette = CosmicPalette {
    name: "Aurora Borealis",
    primary: [0.196, 0.804, 0.196],    // Lime green (#32cd32)
    accent: [0.502, 0.0, 0.502],       // Purple (#800080)
    void_deep: [0.0, 0.008, 0.012],    // Dark blue-green
    void_horizon: [0.012, 0.024, 0.016], // Subtle green
    mood: "Dancing lights, magnetic poetry",
};

/// Titan Haze - Saturn's moon atmosphere
pub const TITAN_HAZE: CosmicPalette = CosmicPalette {
    name: "Titan Haze",
    primary: [0.824, 0.627, 0.353],    // Sandy brown
    accent: [0.545, 0.271, 0.075],     // Rusty orange
    void_deep: [0.016, 0.012, 0.008],  // Brown-black
    void_horizon: [0.035, 0.028, 0.020], // Hazy orange
    mood: "Alien shores, methane seas",
};

/// Europa Ice - Jupiter's frozen moon
pub const EUROPA_ICE: CosmicPalette = CosmicPalette {
    name: "Europa Ice",
    primary: [0.878, 0.933, 0.969],    // Ice blue-white
    accent: [0.373, 0.620, 0.627],     // Cadet blue
    void_deep: [0.008, 0.012, 0.016],  // Cold void
    void_horizon: [0.020, 0.028, 0.035], // Icy hint
    mood: "Frozen possibility, hidden oceans",
};

// ============================================================================
// SCHOLARLY PALETTES - Scientific/antique aesthetic
// ============================================================================

/// Sepia Study - Antique astronomical chart
pub const SEPIA_STUDY: CosmicPalette = CosmicPalette {
    name: "Sepia Study",
    primary: [0.227, 0.165, 0.102],    // Sepia ink (#3a2a1a)
    accent: [0.788, 0.635, 0.153],     // Gilt gold (#c9a227)
    void_deep: [0.035, 0.031, 0.024],  // Aged paper (inverted mode)
    void_horizon: [0.055, 0.047, 0.035], // Warmer paper
    mood: "Scholarly gravitas, timeless knowledge",
};

/// Blueprint - Technical precision
pub const BLUEPRINT: CosmicPalette = CosmicPalette {
    name: "Blueprint",
    primary: [0.941, 0.941, 0.973],    // White lines
    accent: [1.0, 0.898, 0.6],         // Pale gold annotations
    void_deep: [0.051, 0.102, 0.204],  // Blueprint blue
    void_horizon: [0.071, 0.133, 0.255], // Lighter blue
    mood: "Technical precision, engineering beauty",
};

// ============================================================================
// PALETTE COLLECTION
// ============================================================================

/// All available cosmic palettes
pub static ALL_COSMIC_PALETTES: &[CosmicPalette] = &[
    // Stellar
    ICE_AND_FIRE,
    MOONLIGHT,
    BLUE_GIANT,
    RED_DWARF,
    // Nebular
    NEBULA_CORE,
    ORIONS_VEIL,
    PILLARS,
    // Galactic
    DEEP_OCEAN,
    VOID_AND_EMBER,
    GALACTIC_ARM,
    // Atmospheric
    AURORA,
    TITAN_HAZE,
    EUROPA_ICE,
    // Scholarly
    SEPIA_STUDY,
    BLUEPRINT,
];

/// Get a palette suitable for "filament" style rendering (thin, delicate)
pub fn filament_palette(seed: u64) -> &'static CosmicPalette {
    // Prefer palettes with good contrast and delicate primaries
    const FILAMENT_FAVORITES: &[usize] = &[0, 1, 2, 7, 10, 12]; // ICE_AND_FIRE, MOONLIGHT, BLUE_GIANT, DEEP_OCEAN, AURORA, EUROPA_ICE
    let index = FILAMENT_FAVORITES[(seed as usize) % FILAMENT_FAVORITES.len()];
    &ALL_COSMIC_PALETTES[index]
}

/// Get a palette suitable for "deep field" style rendering (point-based)
pub fn deep_field_palette(seed: u64) -> &'static CosmicPalette {
    // Prefer palettes with strong accent contrast for star points
    const DEEP_FIELD_FAVORITES: &[usize] = &[0, 1, 4, 8, 9]; // ICE_AND_FIRE, MOONLIGHT, NEBULA_CORE, VOID_AND_EMBER, GALACTIC_ARM
    let index = DEEP_FIELD_FAVORITES[(seed as usize) % DEEP_FIELD_FAVORITES.len()];
    &ALL_COSMIC_PALETTES[index]
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/// Convert RGB to luminance (Rec. 709)
#[inline]
pub fn luminance(rgb: &[f64; 3]) -> f64 {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/// Compute perceptual brightness (attempt at more intuitive brightness)
#[inline]
pub fn perceptual_brightness(rgb: &[f64; 3]) -> f64 {
    // Attempt at perceptual brightness (HSP color model)
    (0.299 * rgb[0].powi(2) + 0.587 * rgb[1].powi(2) + 0.114 * rgb[2].powi(2)).sqrt()
}

/// Apply gamma correction
#[inline]
pub fn apply_gamma(value: f64, gamma: f64) -> f64 {
    if value <= 0.0 {
        0.0
    } else {
        value.powf(1.0 / gamma)
    }
}

/// Soft clamp that compresses values smoothly toward 1.0
#[inline]
pub fn soft_clamp(value: f64, knee: f64) -> f64 {
    if value <= knee {
        value
    } else {
        knee + (1.0 - knee) * (1.0 - (-(value - knee) / (1.0 - knee)).exp())
    }
}

/// Create a subtle iridescent color shift based on angle
/// Used for thin-film interference effects on cosmic filaments
pub fn iridescent_shift(base_color: &[f64; 3], angle: f64, strength: f64) -> [f64; 3] {
    let s = strength.clamp(0.0, 1.0);
    
    // Shift hue based on viewing angle (thin-film interference approximation)
    let phase = angle * 2.0 * PI;
    let r_shift = (phase).cos() * 0.1 * s;
    let g_shift = (phase + 2.0 * PI / 3.0).cos() * 0.1 * s;
    let b_shift = (phase + 4.0 * PI / 3.0).cos() * 0.1 * s;
    
    [
        (base_color[0] + r_shift).clamp(0.0, 1.0),
        (base_color[1] + g_shift).clamp(0.0, 1.0),
        (base_color[2] + b_shift).clamp(0.0, 1.0),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_palette_count() {
        assert!(CosmicPalette::count() >= 10, "Should have many palettes");
    }

    #[test]
    fn test_palette_from_index_wraps() {
        let p1 = CosmicPalette::from_index(0);
        let p2 = CosmicPalette::from_index(CosmicPalette::count());
        assert_eq!(p1.name, p2.name, "Index should wrap around");
    }

    #[test]
    fn test_all_palettes_have_valid_colors() {
        for palette in ALL_COSMIC_PALETTES {
            // Check primary color is valid
            for &c in &palette.primary {
                assert!(c >= 0.0 && c <= 1.0, 
                    "Palette {} has invalid primary color component: {}", palette.name, c);
            }
            
            // Check accent color is valid
            for &c in &palette.accent {
                assert!(c >= 0.0 && c <= 1.0, 
                    "Palette {} has invalid accent color component: {}", palette.name, c);
            }
            
            // Check void colors are dark
            let void_lum = luminance(&palette.void_deep);
            assert!(void_lum < 0.1, 
                "Palette {} void_deep too bright: {}", palette.name, void_lum);
        }
    }

    #[test]
    fn test_blend() {
        let palette = &ICE_AND_FIRE;
        
        // At 0, should be pure primary
        let c0 = palette.blend(0.0);
        assert_eq!(c0, palette.primary);
        
        // At 1, should be pure accent
        let c1 = palette.blend(1.0);
        assert_eq!(c1, palette.accent);
        
        // At 0.5, should be midpoint
        let c05 = palette.blend(0.5);
        for i in 0..3 {
            let expected = (palette.primary[i] + palette.accent[i]) / 2.0;
            assert!((c05[i] - expected).abs() < 0.01,
                "Blend at 0.5 should be midpoint");
        }
    }

    #[test]
    fn test_background_gradient() {
        let palette = &DEEP_OCEAN;
        
        let bottom = palette.background_at(0.0);
        let top = palette.background_at(1.0);
        
        assert_eq!(bottom, palette.void_deep);
        assert_eq!(top, palette.void_horizon);
    }

    #[test]
    fn test_brightness_to_color() {
        let palette = &MOONLIGHT;
        
        // Low brightness should be dim primary
        let dim = palette.brightness_to_color(0.2, 0.8);
        assert!(luminance(&dim) < luminance(&palette.primary));
        
        // Full brightness should have accent component
        let bright = palette.brightness_to_color(1.0, 0.8);
        // Should be close to accent
        let dist_to_accent = (
            (bright[0] - palette.accent[0]).powi(2) +
            (bright[1] - palette.accent[1]).powi(2) +
            (bright[2] - palette.accent[2]).powi(2)
        ).sqrt();
        assert!(dist_to_accent < 0.5, "Full brightness should be near accent");
    }

    #[test]
    fn test_luminance() {
        // Pure white should have luminance 1.0
        assert!((luminance(&[1.0, 1.0, 1.0]) - 1.0).abs() < 0.001);
        
        // Pure black should have luminance 0.0
        assert!((luminance(&[0.0, 0.0, 0.0]) - 0.0).abs() < 0.001);
        
        // Green contributes most (Rec. 709)
        let green_lum = luminance(&[0.0, 1.0, 0.0]);
        let red_lum = luminance(&[1.0, 0.0, 0.0]);
        let blue_lum = luminance(&[0.0, 0.0, 1.0]);
        assert!(green_lum > red_lum && green_lum > blue_lum);
    }

    #[test]
    fn test_soft_clamp() {
        // Below knee should pass through
        assert!((soft_clamp(0.5, 0.8) - 0.5).abs() < 0.001);
        
        // Above knee should be compressed
        let clamped = soft_clamp(2.0, 0.8);
        assert!(clamped < 2.0, "Should compress values above knee");
        assert!(clamped < 1.0, "Should stay below 1.0");
        assert!(clamped > 0.8, "Should be above knee");
    }

    #[test]
    fn test_iridescent_shift() {
        let base = [0.5, 0.5, 0.5];
        
        // Zero strength should return base color
        let no_shift = iridescent_shift(&base, 0.5, 0.0);
        assert_eq!(no_shift, base);
        
        // Different angles should produce different colors
        let shift1 = iridescent_shift(&base, 0.0, 0.5);
        let shift2 = iridescent_shift(&base, 0.5, 0.5);
        assert!(shift1 != shift2, "Different angles should produce different shifts");
    }

    #[test]
    fn test_filament_palette_deterministic() {
        let p1 = filament_palette(12345);
        let p2 = filament_palette(12345);
        assert_eq!(p1.name, p2.name, "Same seed should give same palette");
    }

    #[test]
    fn test_deep_field_palette_deterministic() {
        let p1 = deep_field_palette(54321);
        let p2 = deep_field_palette(54321);
        assert_eq!(p1.name, p2.name, "Same seed should give same palette");
    }

    #[test]
    fn test_palette_names_unique() {
        let mut names: Vec<&str> = ALL_COSMIC_PALETTES.iter().map(|p| p.name).collect();
        names.sort_unstable();
        let original_len = names.len();
        names.dedup();
        assert_eq!(names.len(), original_len, "Palette names should be unique");
    }

    #[test]
    fn test_apply_gamma() {
        // Gamma of 1 should be identity
        assert!((apply_gamma(0.5, 1.0) - 0.5).abs() < 0.001);
        
        // Gamma of 2.2 should brighten midtones
        let brightened = apply_gamma(0.5, 2.2);
        assert!(brightened > 0.5, "Gamma 2.2 should brighten 0.5");
        
        // Zero should stay zero
        assert_eq!(apply_gamma(0.0, 2.2), 0.0);
    }
}

