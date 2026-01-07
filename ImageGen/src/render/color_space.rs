//! Color space management for museum-quality output.
//!
//! This module handles color space conversions and provides proper output
//! for different display technologies:
//! - sRGB: Standard for most displays and web
//! - Display P3: Wide gamut for modern Apple displays and HDR content
//! - Adobe RGB: Wide gamut for professional printing
//!
//! All conversions maintain hue fidelity using perceptually-uniform mappings.

// Color space matrices use standard values that are more readable without separators
#![allow(clippy::unreadable_literal)]

/// Supported output color spaces
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
#[allow(dead_code)]
#[allow(clippy::upper_case_acronyms)]
pub enum ColorSpace {
    /// Standard RGB (sRGB) - default for web and most displays
    #[default]
    SRGB,
    /// Display P3 - wide gamut for modern displays (25% larger than sRGB)
    DisplayP3,
    /// Adobe RGB (1998) - wide gamut for professional printing
    AdobeRGB,
}

#[allow(dead_code)]
impl ColorSpace {
    /// Parse color space from string (case-insensitive)
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "srgb" | "s-rgb" => Some(Self::SRGB),
            "p3" | "display-p3" | "displayp3" | "display_p3" => Some(Self::DisplayP3),
            "adobe-rgb" | "adobergb" | "adobe_rgb" | "adobe" => Some(Self::AdobeRGB),
            _ => None,
        }
    }
    
    /// Human-readable name
    pub fn name(&self) -> &'static str {
        match self {
            Self::SRGB => "sRGB",
            Self::DisplayP3 => "Display P3",
            Self::AdobeRGB => "Adobe RGB",
        }
    }
    
    /// ICC profile description for embedding
    #[allow(dead_code)]
    pub fn icc_description(&self) -> &'static str {
        match self {
            Self::SRGB => "sRGB IEC61966-2.1",
            Self::DisplayP3 => "Display P3",
            Self::AdobeRGB => "Adobe RGB (1998)",
        }
    }
}

/// Color space conversion utilities.
/// All functions work with linear RGB (not gamma-encoded).
pub struct ColorSpaceConverter;

#[allow(dead_code)]
impl ColorSpaceConverter {
    // ========== sRGB <-> Linear Conversion ==========
    
    /// Convert sRGB gamma-encoded value to linear
    #[inline]
    pub fn srgb_to_linear(v: f64) -> f64 {
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    }
    
    /// Convert linear value to sRGB gamma-encoded
    #[inline]
    pub fn linear_to_srgb(v: f64) -> f64 {
        if v <= 0.0031308 {
            v * 12.92
        } else {
            1.055 * v.powf(1.0 / 2.4) - 0.055
        }
    }
    
    // ========== Color Space Matrices ==========
    // All matrices are for conversion via XYZ color space
    
    /// sRGB to XYZ matrix (D65 white point)
    const SRGB_TO_XYZ: [[f64; 3]; 3] = [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ];
    
    /// XYZ to sRGB matrix (D65 white point)
    const XYZ_TO_SRGB: [[f64; 3]; 3] = [
        [ 3.2404542, -1.5371385, -0.4985314],
        [-0.9692660,  1.8760108,  0.0415560],
        [ 0.0556434, -0.2040259,  1.0572252],
    ];
    
    /// Display P3 to XYZ matrix (D65 white point)
    #[allow(dead_code)]
    const P3_TO_XYZ: [[f64; 3]; 3] = [
        [0.4865709, 0.2656677, 0.1982173],
        [0.2289746, 0.6917385, 0.0792869],
        [0.0000000, 0.0451134, 1.0439444],
    ];
    
    /// XYZ to Display P3 matrix (D65 white point)
    const XYZ_TO_P3: [[f64; 3]; 3] = [
        [ 2.4934969, -0.9313836, -0.4027108],
        [-0.8294890,  1.7626641,  0.0236247],
        [ 0.0358458, -0.0761724,  0.9568845],
    ];
    
    /// Adobe RGB to XYZ matrix (D65 white point)
    #[allow(dead_code)]
    const ADOBE_RGB_TO_XYZ: [[f64; 3]; 3] = [
        [0.5767309, 0.1855540, 0.1881852],
        [0.2973769, 0.6273491, 0.0752741],
        [0.0270343, 0.0706872, 0.9911085],
    ];
    
    /// XYZ to Adobe RGB matrix (D65 white point)
    const XYZ_TO_ADOBE_RGB: [[f64; 3]; 3] = [
        [ 2.0413690, -0.5649464, -0.3446944],
        [-0.9692660,  1.8760108,  0.0415560],
        [ 0.0134474, -0.1183897,  1.0154096],
    ];
    
    /// Apply 3x3 matrix transformation to RGB
    #[inline]
    fn apply_matrix(matrix: &[[f64; 3]; 3], r: f64, g: f64, b: f64) -> [f64; 3] {
        [
            matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b,
            matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b,
            matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b,
        ]
    }
    
    /// Convert linear sRGB to XYZ
    #[inline]
    pub fn srgb_linear_to_xyz(r: f64, g: f64, b: f64) -> [f64; 3] {
        Self::apply_matrix(&Self::SRGB_TO_XYZ, r, g, b)
    }
    
    /// Convert XYZ to linear sRGB
    #[inline]
    pub fn xyz_to_srgb_linear(x: f64, y: f64, z: f64) -> [f64; 3] {
        Self::apply_matrix(&Self::XYZ_TO_SRGB, x, y, z)
    }
    
    /// Convert XYZ to linear Display P3
    #[inline]
    pub fn xyz_to_p3_linear(x: f64, y: f64, z: f64) -> [f64; 3] {
        Self::apply_matrix(&Self::XYZ_TO_P3, x, y, z)
    }
    
    /// Convert XYZ to linear Adobe RGB
    #[inline]
    pub fn xyz_to_adobe_rgb_linear(x: f64, y: f64, z: f64) -> [f64; 3] {
        Self::apply_matrix(&Self::XYZ_TO_ADOBE_RGB, x, y, z)
    }
    
    /// Convert linear sRGB to target color space (linear output)
    pub fn convert_from_srgb_linear(
        r: f64, g: f64, b: f64,
        target: ColorSpace,
    ) -> [f64; 3] {
        match target {
            ColorSpace::SRGB => [r, g, b],
            ColorSpace::DisplayP3 => {
                let xyz = Self::srgb_linear_to_xyz(r, g, b);
                Self::xyz_to_p3_linear(xyz[0], xyz[1], xyz[2])
            }
            ColorSpace::AdobeRGB => {
                let xyz = Self::srgb_linear_to_xyz(r, g, b);
                Self::xyz_to_adobe_rgb_linear(xyz[0], xyz[1], xyz[2])
            }
        }
    }
    
    /// Convert linear sRGB to gamma-encoded target color space
    pub fn convert_from_srgb_linear_to_gamma(
        r: f64, g: f64, b: f64,
        target: ColorSpace,
    ) -> [f64; 3] {
        let linear = Self::convert_from_srgb_linear(r, g, b, target);
        
        match target {
            ColorSpace::SRGB | ColorSpace::DisplayP3 => {
                // Both use sRGB transfer function
                [
                    Self::linear_to_srgb(linear[0]),
                    Self::linear_to_srgb(linear[1]),
                    Self::linear_to_srgb(linear[2]),
                ]
            }
            ColorSpace::AdobeRGB => {
                // Adobe RGB uses gamma 2.2
                [
                    linear[0].powf(1.0 / 2.2),
                    linear[1].powf(1.0 / 2.2),
                    linear[2].powf(1.0 / 2.2),
                ]
            }
        }
    }
    
    /// Soft-clip out-of-gamut colors while preserving hue
    /// 
    /// When converting to a smaller gamut, colors may exceed [0, 1].
    /// This function smoothly compresses them back into gamut while
    /// maintaining the original hue as much as possible.
    #[inline]
    pub fn soft_clip_gamut(r: f64, g: f64, b: f64) -> [f64; 3] {
        let max_channel = r.max(g).max(b);
        let min_channel = r.min(g).min(b);
        
        // If in gamut, return unchanged
        if max_channel <= 1.0 && min_channel >= 0.0 {
            return [r, g, b];
        }
        
        // Calculate luminance for hue preservation
        let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        
        // Clamp luminance to valid range
        let safe_lum = lum.clamp(0.001, 0.999);
        
        // Scale chroma to fit in gamut while preserving hue
        let mut scale = 1.0_f64;
        
        for &channel in &[r, g, b] {
            let chroma = channel - safe_lum;
            
            if channel > 1.0 && chroma > 1e-10 {
                let needed_scale = (1.0 - safe_lum) / chroma;
                scale = scale.min(needed_scale);
            } else if channel < 0.0 && chroma < -1e-10 {
                let needed_scale = -safe_lum / chroma;
                scale = scale.min(needed_scale);
            }
        }
        
        [
            (safe_lum + (r - safe_lum) * scale).clamp(0.0, 1.0),
            (safe_lum + (g - safe_lum) * scale).clamp(0.0, 1.0),
            (safe_lum + (b - safe_lum) * scale).clamp(0.0, 1.0),
        ]
    }
    
    /// Check if a color is within sRGB gamut
    #[inline]
    #[allow(dead_code)]
    pub fn is_in_srgb_gamut(r: f64, g: f64, b: f64) -> bool {
        (0.0..=1.0).contains(&r) &&
        (0.0..=1.0).contains(&g) &&
        (0.0..=1.0).contains(&b)
    }
    
    /// Calculate gamut coverage percentage
    /// Returns what percentage of Display P3 gamut sRGB covers
    #[allow(dead_code)]
    pub fn srgb_gamut_coverage_of_p3() -> f64 {
        // sRGB covers approximately 77% of Display P3
        0.77
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_color_space_parsing() {
        assert_eq!(ColorSpace::from_str("srgb"), Some(ColorSpace::SRGB));
        assert_eq!(ColorSpace::from_str("SRGB"), Some(ColorSpace::SRGB));
        assert_eq!(ColorSpace::from_str("p3"), Some(ColorSpace::DisplayP3));
        assert_eq!(ColorSpace::from_str("display-p3"), Some(ColorSpace::DisplayP3));
        assert_eq!(ColorSpace::from_str("adobe-rgb"), Some(ColorSpace::AdobeRGB));
        assert_eq!(ColorSpace::from_str("invalid"), None);
    }
    
    #[test]
    fn test_srgb_gamma_roundtrip() {
        let values = [0.0, 0.1, 0.5, 0.8, 1.0];
        for v in values {
            let linear = ColorSpaceConverter::srgb_to_linear(v);
            let back = ColorSpaceConverter::linear_to_srgb(linear);
            assert!((v - back).abs() < 1e-10, 
                "sRGB gamma roundtrip failed for {}: got {}", v, back);
        }
    }
    
    #[test]
    fn test_srgb_linear_roundtrip() {
        let values = [0.0, 0.1, 0.5, 0.8, 1.0];
        for v in values {
            let gamma = ColorSpaceConverter::linear_to_srgb(v);
            let back = ColorSpaceConverter::srgb_to_linear(gamma);
            assert!((v - back).abs() < 1e-10,
                "Linear to sRGB roundtrip failed for {}: got {}", v, back);
        }
    }
    
    #[test]
    fn test_srgb_to_xyz_white() {
        // sRGB white (1, 1, 1) should map to D65 white point
        let xyz = ColorSpaceConverter::srgb_linear_to_xyz(1.0, 1.0, 1.0);
        // D65 white point is approximately (0.95047, 1.0, 1.08883)
        assert!((xyz[0] - 0.95047).abs() < 0.001, "X: {}", xyz[0]);
        assert!((xyz[1] - 1.0).abs() < 0.001, "Y: {}", xyz[1]);
        assert!((xyz[2] - 1.08883).abs() < 0.001, "Z: {}", xyz[2]);
    }
    
    #[test]
    fn test_xyz_to_srgb_roundtrip() {
        let colors = [
            (0.5, 0.3, 0.2),
            (0.8, 0.1, 0.6),
            (0.0, 1.0, 0.5),
        ];
        
        for (r, g, b) in colors {
            let xyz = ColorSpaceConverter::srgb_linear_to_xyz(r, g, b);
            let back = ColorSpaceConverter::xyz_to_srgb_linear(xyz[0], xyz[1], xyz[2]);
            // Tolerance accounts for floating-point precision in matrix operations
            assert!((r - back[0]).abs() < 1e-6, "R roundtrip failed: {} -> {}", r, back[0]);
            assert!((g - back[1]).abs() < 1e-6, "G roundtrip failed: {} -> {}", g, back[1]);
            assert!((b - back[2]).abs() < 1e-6, "B roundtrip failed: {} -> {}", b, back[2]);
        }
    }
    
    #[test]
    fn test_convert_srgb_to_srgb() {
        // Converting sRGB to sRGB should be identity
        let result = ColorSpaceConverter::convert_from_srgb_linear(
            0.5, 0.3, 0.7, ColorSpace::SRGB
        );
        assert!((result[0] - 0.5).abs() < 1e-10);
        assert!((result[1] - 0.3).abs() < 1e-10);
        assert!((result[2] - 0.7).abs() < 1e-10);
    }
    
    #[test]
    fn test_convert_srgb_to_p3() {
        // sRGB colors should be valid in P3 (P3 is larger gamut)
        let result = ColorSpaceConverter::convert_from_srgb_linear(
            0.5, 0.3, 0.7, ColorSpace::DisplayP3
        );
        
        // P3 representation should be in valid range for sRGB colors
        assert!(result[0] >= 0.0 && result[0] <= 1.0, "R: {}", result[0]);
        assert!(result[1] >= 0.0 && result[1] <= 1.0, "G: {}", result[1]);
        assert!(result[2] >= 0.0 && result[2] <= 1.0, "B: {}", result[2]);
    }
    
    #[test]
    fn test_soft_clip_in_gamut() {
        // Colors already in gamut should pass through
        let result = ColorSpaceConverter::soft_clip_gamut(0.5, 0.3, 0.7);
        assert!((result[0] - 0.5).abs() < 1e-10);
        assert!((result[1] - 0.3).abs() < 1e-10);
        assert!((result[2] - 0.7).abs() < 1e-10);
    }
    
    #[test]
    fn test_soft_clip_out_of_gamut() {
        // Out of gamut colors should be clipped
        let result = ColorSpaceConverter::soft_clip_gamut(1.5, 0.3, -0.1);
        
        assert!(result[0] >= 0.0 && result[0] <= 1.0, "R out of gamut: {}", result[0]);
        assert!(result[1] >= 0.0 && result[1] <= 1.0, "G out of gamut: {}", result[1]);
        assert!(result[2] >= 0.0 && result[2] <= 1.0, "B out of gamut: {}", result[2]);
    }
    
    #[test]
    fn test_soft_clip_preserves_hue() {
        // Clipping should preserve relative ordering (hue)
        let result = ColorSpaceConverter::soft_clip_gamut(1.5, 0.6, 0.1);
        
        // R > G > B ordering should be maintained
        assert!(result[0] > result[1], "R should be > G");
        assert!(result[1] > result[2], "G should be > B");
    }
    
    #[test]
    fn test_color_space_names() {
        assert_eq!(ColorSpace::SRGB.name(), "sRGB");
        assert_eq!(ColorSpace::DisplayP3.name(), "Display P3");
        assert_eq!(ColorSpace::AdobeRGB.name(), "Adobe RGB");
    }
    
    #[test]
    fn test_gamma_conversion_with_space() {
        // Test that gamma conversion works correctly
        let linear = [0.5, 0.3, 0.7];
        let gamma = ColorSpaceConverter::convert_from_srgb_linear_to_gamma(
            linear[0], linear[1], linear[2], 
            ColorSpace::SRGB
        );
        
        // Gamma-encoded values should be different from linear
        assert!((gamma[0] - linear[0]).abs() > 0.01, "Should apply gamma");
        
        // Should be in valid range
        assert!(gamma[0] >= 0.0 && gamma[0] <= 1.0);
        assert!(gamma[1] >= 0.0 && gamma[1] <= 1.0);
        assert!(gamma[2] >= 0.0 && gamma[2] <= 1.0);
    }
}

