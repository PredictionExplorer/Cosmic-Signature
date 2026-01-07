//! Type-safe color representations for the rendering pipeline.
//!
//! This module provides compile-time safety for color space handling,
//! preventing accidental mixing of HDR and display-referred values.
//!
//! Note: This is infrastructure for the elegant HDR pipeline. Not all types
//! are used in the current pipeline, but they provide the foundation for
//! future improvements.

#![allow(dead_code)] // Infrastructure module - not all types used yet
#![allow(clippy::return_self_not_must_use)] // Builder-pattern methods intentionally return Self
//!
//! # Design Philosophy
//!
//! In a professional rendering pipeline, colors exist in different domains:
//!
//! - **Scene-Referred (HDR)**: Linear light values that can exceed 1.0.
//!   Used throughout the rendering pipeline until final display conversion.
//!
//! - **Display-Referred**: Gamma-encoded values in 0-1 range, ready for display.
//!   Only created at the final output stage.
//!
//! By using distinct types for these domains, we get compile-time guarantees
//! that prevent common bugs like:
//! - Applying effects to already-tonemapped data
//! - Double-tonemapping
//! - Incorrect exposure calculations
//!
//! # Example
//!
//! ```rust,ignore
//! // HDR values can exceed 1.0
//! let bright_pixel = LinearHDR::new(2.5, 1.8, 0.9, 1.0);
//!
//! // Convert to display-referred (applies tonemapping)
//! let display_pixel = bright_pixel.to_display(exposure, &tonemap_curve);
//!
//! // This won't compile - can't mix types!
//! // let bad = some_hdr_effect(display_pixel); // Error!
//! ```

use std::ops::{Add, Mul};

/// Linear HDR color in scene-referred space.
///
/// Values represent physical light intensity and can exceed 1.0.
/// This is the format used throughout the rendering pipeline.
///
/// # Storage Format
///
/// Uses premultiplied alpha: RGB channels are already multiplied by alpha.
/// This is the standard format for compositing and effect processing.
///
/// # Example
///
/// ```rust,ignore
/// // Create from components
/// let pixel = LinearHDR::new(0.5, 0.3, 0.8, 1.0);
///
/// // HDR values can be > 1.0 (bright highlights)
/// let bright = LinearHDR::new(3.0, 2.5, 1.2, 1.0);
///
/// // Convert from legacy tuple format
/// let from_tuple = LinearHDR::from((0.5, 0.3, 0.8, 1.0));
/// ```
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinearHDR {
    /// Red channel (premultiplied, unbounded)
    pub r: f64,
    /// Green channel (premultiplied, unbounded)
    pub g: f64,
    /// Blue channel (premultiplied, unbounded)
    pub b: f64,
    /// Alpha channel (0.0 - 1.0)
    pub a: f64,
}

impl LinearHDR {
    /// Create a new HDR pixel from components.
    #[inline]
    pub const fn new(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self { r, g, b, a }
    }

    /// Create a fully transparent black pixel.
    #[inline]
    pub const fn transparent() -> Self {
        Self::new(0.0, 0.0, 0.0, 0.0)
    }

    /// Create an opaque black pixel.
    #[inline]
    pub const fn black() -> Self {
        Self::new(0.0, 0.0, 0.0, 1.0)
    }

    /// Create an opaque white pixel.
    #[inline]
    pub const fn white() -> Self {
        Self::new(1.0, 1.0, 1.0, 1.0)
    }

    /// Compute luminance using Rec. 709 coefficients.
    ///
    /// For premultiplied values, this returns the premultiplied luminance.
    /// Divide by alpha for the straight luminance if needed.
    #[inline]
    pub fn luminance(&self) -> f64 {
        0.2126 * self.r + 0.7152 * self.g + 0.0722 * self.b
    }

    /// Compute straight (un-premultiplied) luminance.
    ///
    /// Returns 0.0 for transparent pixels.
    #[inline]
    pub fn straight_luminance(&self) -> f64 {
        if self.a <= 0.0 {
            return 0.0;
        }
        self.luminance() / self.a
    }

    /// Check if this pixel is fully transparent.
    #[inline]
    pub fn is_transparent(&self) -> bool {
        self.a <= 0.0
    }

    /// Check if this pixel has any visible content.
    #[inline]
    pub fn is_visible(&self) -> bool {
        self.a > 1e-9
    }

    /// Apply exposure adjustment (multiply by 2^ev).
    ///
    /// This is the correct way to adjust brightness in HDR space.
    #[inline]
    pub fn apply_exposure(self, ev: f64) -> Self {
        let factor = 2.0_f64.powf(ev);
        Self::new(self.r * factor, self.g * factor, self.b * factor, self.a)
    }

    /// Apply a scalar multiplier to RGB (preserving alpha).
    #[inline]
    pub fn scale_rgb(self, factor: f64) -> Self {
        Self::new(self.r * factor, self.g * factor, self.b * factor, self.a)
    }

    /// Clamp RGB values to a maximum (for effect limiting).
    ///
    /// Note: In a true HDR pipeline, you rarely want to clamp.
    /// This is provided for compatibility with effects that expect bounded values.
    #[inline]
    pub fn clamp_rgb(self, max: f64) -> Self {
        Self::new(
            self.r.min(max).max(0.0),
            self.g.min(max).max(0.0),
            self.b.min(max).max(0.0),
            self.a.clamp(0.0, 1.0),
        )
    }

    /// Convert to legacy tuple format.
    ///
    /// Used for compatibility with existing effect implementations.
    #[inline]
    pub fn to_tuple(self) -> (f64, f64, f64, f64) {
        (self.r, self.g, self.b, self.a)
    }

    /// Get straight (un-premultiplied) RGB values.
    ///
    /// Returns (0, 0, 0) for transparent pixels.
    #[inline]
    #[allow(clippy::wrong_self_convention)]
    pub fn to_straight_rgb(&self) -> (f64, f64, f64) {
        if self.a <= 0.0 {
            return (0.0, 0.0, 0.0);
        }
        (self.r / self.a, self.g / self.a, self.b / self.a)
    }

    /// Create from straight RGB and alpha (will premultiply).
    #[inline]
    pub fn from_straight(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self::new(r * a, g * a, b * a, a)
    }

    /// Composite this pixel over another using "over" operator.
    ///
    /// Both pixels must be premultiplied.
    #[inline]
    pub fn over(self, background: Self) -> Self {
        let out_a = self.a + background.a * (1.0 - self.a);
        if out_a <= 0.0 {
            return Self::transparent();
        }
        Self::new(
            self.r + background.r * (1.0 - self.a),
            self.g + background.g * (1.0 - self.a),
            self.b + background.b * (1.0 - self.a),
            out_a,
        )
    }

    /// Linear interpolation between two HDR values.
    #[inline]
    pub fn lerp(self, other: Self, t: f64) -> Self {
        Self::new(
            self.r + (other.r - self.r) * t,
            self.g + (other.g - self.g) * t,
            self.b + (other.b - self.b) * t,
            self.a + (other.a - self.a) * t,
        )
    }
}

impl Default for LinearHDR {
    fn default() -> Self {
        Self::transparent()
    }
}

impl From<(f64, f64, f64, f64)> for LinearHDR {
    #[inline]
    fn from((r, g, b, a): (f64, f64, f64, f64)) -> Self {
        Self::new(r, g, b, a)
    }
}

impl From<LinearHDR> for (f64, f64, f64, f64) {
    #[inline]
    fn from(hdr: LinearHDR) -> Self {
        hdr.to_tuple()
    }
}

impl Add for LinearHDR {
    type Output = Self;

    #[inline]
    fn add(self, rhs: Self) -> Self::Output {
        Self::new(
            self.r + rhs.r,
            self.g + rhs.g,
            self.b + rhs.b,
            (self.a + rhs.a).min(1.0),
        )
    }
}

impl Mul<f64> for LinearHDR {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f64) -> Self::Output {
        self.scale_rgb(rhs)
    }
}

/// Display-referred color in sRGB space.
///
/// Values are gamma-encoded and clamped to 0.0-1.0 range.
/// This type is only created at the final output stage.
///
/// # Invariant
///
/// All channel values are guaranteed to be in [0.0, 1.0] range.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DisplayRGB {
    /// Red channel (gamma-encoded, 0.0 - 1.0)
    pub r: f64,
    /// Green channel (gamma-encoded, 0.0 - 1.0)
    pub g: f64,
    /// Blue channel (gamma-encoded, 0.0 - 1.0)
    pub b: f64,
    /// Alpha channel (0.0 - 1.0)
    pub a: f64,
}

impl DisplayRGB {
    /// Create a new display pixel from components.
    ///
    /// Values are clamped to valid range.
    #[inline]
    pub fn new(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self {
            r: r.clamp(0.0, 1.0),
            g: g.clamp(0.0, 1.0),
            b: b.clamp(0.0, 1.0),
            a: a.clamp(0.0, 1.0),
        }
    }

    /// Create from already-validated values (no clamping).
    ///
    /// # Safety
    ///
    /// Caller must ensure values are in [0.0, 1.0] range.
    #[inline]
    pub const fn new_unchecked(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self { r, g, b, a }
    }

    /// Convert to 8-bit sRGB values.
    #[inline]
    pub fn to_u8(self) -> [u8; 4] {
        [
            (self.r * 255.0).round() as u8,
            (self.g * 255.0).round() as u8,
            (self.b * 255.0).round() as u8,
            (self.a * 255.0).round() as u8,
        ]
    }

    /// Convert to 16-bit values.
    #[inline]
    pub fn to_u16(self) -> [u16; 4] {
        [
            (self.r * 65535.0).round() as u16,
            (self.g * 65535.0).round() as u16,
            (self.b * 65535.0).round() as u16,
            (self.a * 65535.0).round() as u16,
        ]
    }
}

impl Default for DisplayRGB {
    fn default() -> Self {
        Self::new(0.0, 0.0, 0.0, 0.0)
    }
}

/// Buffer of HDR pixels.
///
/// This is the type used throughout the rendering pipeline.
pub type HDRBuffer = Vec<LinearHDR>;

/// Buffer of display-ready pixels.
///
/// Only created at final output.
pub type DisplayBuffer = Vec<DisplayRGB>;

/// Extension trait for converting legacy PixelBuffer to HDRBuffer.
pub trait ToHDRBuffer {
    /// Convert to typed HDR buffer.
    fn to_hdr_buffer(&self) -> HDRBuffer;
}

impl ToHDRBuffer for Vec<(f64, f64, f64, f64)> {
    fn to_hdr_buffer(&self) -> HDRBuffer {
        self.iter().map(|&t| LinearHDR::from(t)).collect()
    }
}

/// Extension trait for converting HDRBuffer to legacy format.
pub trait ToLegacyBuffer {
    /// Convert to legacy tuple format for compatibility.
    fn to_legacy_buffer(&self) -> Vec<(f64, f64, f64, f64)>;
}

impl ToLegacyBuffer for HDRBuffer {
    fn to_legacy_buffer(&self) -> Vec<(f64, f64, f64, f64)> {
        self.iter().map(|p| p.to_tuple()).collect()
    }
}

// ============================================================================
// EXPOSURE CONTROL
// ============================================================================

/// Exposure controller for HDR to display conversion.
///
/// This is the single point of exposure control in the pipeline,
/// replacing ad-hoc brightness adjustments.
#[derive(Clone, Debug)]
pub struct ExposureControl {
    /// Base exposure in EV (exposure value)
    /// 0.0 = no change, +1.0 = 2x brighter, -1.0 = 2x darker
    pub base_ev: f64,

    /// Target luminance for auto-exposure (typically 0.18 for 18% gray)
    pub auto_target: f64,

    /// How much auto-exposure influences final exposure (0.0 - 1.0)
    pub auto_blend: f64,

    /// Maximum auto-exposure adjustment in EV
    pub auto_max_ev: f64,
}

impl Default for ExposureControl {
    fn default() -> Self {
        Self {
            base_ev: 0.0,
            auto_target: 0.18,
            auto_blend: 0.5,
            auto_max_ev: 3.0,
        }
    }
}

impl ExposureControl {
    /// Create exposure control with fixed EV.
    pub fn fixed(ev: f64) -> Self {
        Self { base_ev: ev, auto_blend: 0.0, ..Default::default() }
    }

    /// Create exposure control with auto-exposure.
    pub fn auto() -> Self {
        Self { auto_blend: 1.0, ..Default::default() }
    }

    /// Compute the exposure multiplier for a scene.
    ///
    /// # Arguments
    ///
    /// * `scene_luminance` - Average scene luminance (from histogram or sampling)
    ///
    /// # Returns
    ///
    /// Exposure multiplier to apply to HDR values before tonemapping.
    pub fn compute_multiplier(&self, scene_luminance: f64) -> f64 {
        let base_mult = 2.0_f64.powf(self.base_ev);

        if self.auto_blend <= 0.0 || scene_luminance <= 0.0 {
            return base_mult;
        }

        // Auto-exposure: adjust to bring scene_luminance to auto_target
        let auto_ev = (self.auto_target / scene_luminance).log2().clamp(-self.auto_max_ev, self.auto_max_ev);
        let auto_mult = 2.0_f64.powf(auto_ev);

        // Blend between base and auto
        base_mult * (1.0 - self.auto_blend) + auto_mult * self.auto_blend
    }
}

// ============================================================================
// ENERGY TRACKING
// ============================================================================

/// Tracks cumulative brightness/energy changes through the effect pipeline.
///
/// This replaces ad-hoc brightness budget tracking with a first-class concept.
#[derive(Clone, Debug)]
pub struct EnergyTracker {
    /// Current energy level (1.0 = full brightness preserved)
    pub current: f64,

    /// Minimum allowed energy (prevents over-darkening)
    pub minimum: f64,
}

impl Default for EnergyTracker {
    fn default() -> Self {
        Self {
            current: 1.0,
            minimum: 0.25, // Never darken below 25% of original
        }
    }
}

impl EnergyTracker {
    /// Create a new energy tracker with custom minimum.
    pub fn with_minimum(minimum: f64) -> Self {
        Self { current: 1.0, minimum: minimum.clamp(0.01, 1.0) }
    }

    /// Apply an effect's energy factor.
    ///
    /// Returns the actual factor applied (may be limited by minimum).
    pub fn apply(&mut self, effect_factor: f64) -> f64 {
        let new_energy = self.current * effect_factor;

        if new_energy < self.minimum {
            // Would exceed budget - limit the darkening
            let allowed_factor = self.minimum / self.current;
            self.current = self.minimum;
            allowed_factor
        } else {
            self.current = new_energy;
            effect_factor
        }
    }

    /// Get the compensation needed to restore full energy.
    pub fn compensation_factor(&self) -> f64 {
        if self.current <= 0.0 {
            return 1.0;
        }
        1.0 / self.current
    }

    /// Check if we've hit the energy floor.
    pub fn is_at_minimum(&self) -> bool {
        (self.current - self.minimum).abs() < 1e-6
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear_hdr_creation() {
        let pixel = LinearHDR::new(0.5, 0.3, 0.8, 1.0);
        assert!((pixel.r - 0.5).abs() < 1e-10);
        assert!((pixel.g - 0.3).abs() < 1e-10);
        assert!((pixel.b - 0.8).abs() < 1e-10);
        assert!((pixel.a - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_allows_values_over_one() {
        let bright = LinearHDR::new(3.0, 2.5, 1.2, 1.0);
        assert!(bright.r > 1.0);
        assert!(bright.g > 1.0);
        assert!(bright.b > 1.0);
    }

    #[test]
    fn test_linear_hdr_luminance() {
        let gray = LinearHDR::new(0.5, 0.5, 0.5, 1.0);
        assert!((gray.luminance() - 0.5).abs() < 1e-10);

        let red = LinearHDR::new(1.0, 0.0, 0.0, 1.0);
        assert!((red.luminance() - 0.2126).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_exposure() {
        let pixel = LinearHDR::new(0.5, 0.5, 0.5, 1.0);

        let brighter = pixel.apply_exposure(1.0); // +1 EV = 2x
        assert!((brighter.r - 1.0).abs() < 1e-10);

        let darker = pixel.apply_exposure(-1.0); // -1 EV = 0.5x
        assert!((darker.r - 0.25).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_over_compositing() {
        let fg = LinearHDR::from_straight(1.0, 0.0, 0.0, 0.5); // 50% red
        let bg = LinearHDR::from_straight(0.0, 0.0, 1.0, 1.0); // 100% blue

        let result = fg.over(bg);

        // Should be blend of red over blue
        assert!(result.r > 0.0);
        assert!(result.b > 0.0);
        assert!((result.a - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_from_tuple() {
        let tuple = (0.5, 0.3, 0.8, 1.0);
        let pixel: LinearHDR = tuple.into();

        assert!((pixel.r - 0.5).abs() < 1e-10);
        assert!((pixel.g - 0.3).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_to_tuple() {
        let pixel = LinearHDR::new(0.5, 0.3, 0.8, 1.0);
        let tuple: (f64, f64, f64, f64) = pixel.into();

        assert!((tuple.0 - 0.5).abs() < 1e-10);
        assert!((tuple.1 - 0.3).abs() < 1e-10);
    }

    #[test]
    fn test_display_rgb_clamps() {
        let pixel = DisplayRGB::new(1.5, -0.5, 0.5, 1.0);

        assert!((pixel.r - 1.0).abs() < 1e-10); // Clamped from 1.5
        assert!((pixel.g - 0.0).abs() < 1e-10); // Clamped from -0.5
        assert!((pixel.b - 0.5).abs() < 1e-10); // Unchanged
    }

    #[test]
    fn test_display_rgb_to_u8() {
        let pixel = DisplayRGB::new(1.0, 0.5, 0.0, 1.0);
        let bytes = pixel.to_u8();

        assert_eq!(bytes[0], 255);
        assert_eq!(bytes[1], 128); // 0.5 * 255 rounded
        assert_eq!(bytes[2], 0);
        assert_eq!(bytes[3], 255);
    }

    #[test]
    fn test_display_rgb_to_u16() {
        let pixel = DisplayRGB::new(1.0, 0.5, 0.0, 1.0);
        let values = pixel.to_u16();

        assert_eq!(values[0], 65535);
        assert_eq!(values[1], 32768); // 0.5 * 65535 rounded
        assert_eq!(values[2], 0);
    }

    #[test]
    fn test_exposure_control_fixed() {
        let ctrl = ExposureControl::fixed(1.0); // +1 EV

        let mult = ctrl.compute_multiplier(0.5);
        assert!((mult - 2.0).abs() < 1e-10); // 2^1 = 2
    }

    #[test]
    fn test_exposure_control_auto() {
        let ctrl = ExposureControl::auto();

        // Scene is darker than target
        let mult = ctrl.compute_multiplier(0.09); // Half of 0.18 target
        assert!(mult > 1.0); // Should brighten

        // Scene is brighter than target
        let mult = ctrl.compute_multiplier(0.36); // 2x target
        assert!(mult < 1.0); // Should darken
    }

    #[test]
    fn test_energy_tracker_normal() {
        let mut tracker = EnergyTracker::default();

        // Apply 80% energy factor (mild darkening)
        let applied = tracker.apply(0.8);
        assert!((applied - 0.8).abs() < 1e-10);
        assert!((tracker.current - 0.8).abs() < 1e-10);
    }

    #[test]
    fn test_energy_tracker_at_minimum() {
        let mut tracker = EnergyTracker::with_minimum(0.5);

        // Try to darken to 30% (below 50% minimum)
        let applied = tracker.apply(0.3);

        // Should be limited to reach minimum
        assert!(applied > 0.3);
        assert!((tracker.current - 0.5).abs() < 1e-10);
        assert!(tracker.is_at_minimum());
    }

    #[test]
    fn test_energy_tracker_compensation() {
        let mut tracker = EnergyTracker::default();

        tracker.apply(0.5); // Darken to 50%
        let comp = tracker.compensation_factor();

        assert!((comp - 2.0).abs() < 1e-10); // Need 2x to restore
    }

    #[test]
    fn test_hdr_buffer_conversion() {
        let legacy: Vec<(f64, f64, f64, f64)> = vec![
            (0.5, 0.3, 0.8, 1.0),
            (0.1, 0.2, 0.3, 0.5),
        ];

        let hdr = legacy.to_hdr_buffer();
        assert_eq!(hdr.len(), 2);
        assert!((hdr[0].r - 0.5).abs() < 1e-10);
        assert!((hdr[1].a - 0.5).abs() < 1e-10);

        let back = hdr.to_legacy_buffer();
        assert_eq!(back.len(), 2);
        assert!((back[0].0 - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_straight_luminance() {
        // Premultiplied: 0.4 RGB at 0.5 alpha = straight 0.8 RGB
        let pixel = LinearHDR::new(0.4, 0.4, 0.4, 0.5);

        let straight_lum = pixel.straight_luminance();
        assert!((straight_lum - 0.8).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_lerp() {
        let a = LinearHDR::new(0.0, 0.0, 0.0, 1.0);
        let b = LinearHDR::new(1.0, 1.0, 1.0, 1.0);

        let mid = a.lerp(b, 0.5);
        assert!((mid.r - 0.5).abs() < 1e-10);
        assert!((mid.g - 0.5).abs() < 1e-10);
        assert!((mid.b - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_linear_hdr_add() {
        let a = LinearHDR::new(0.3, 0.3, 0.3, 0.5);
        let b = LinearHDR::new(0.2, 0.2, 0.2, 0.3);

        let sum = a + b;
        assert!((sum.r - 0.5).abs() < 1e-10);
        assert!((sum.a - 0.8).abs() < 1e-10); // Alpha capped at min(sum, 1.0)
    }

    #[test]
    fn test_linear_hdr_mul() {
        let pixel = LinearHDR::new(0.5, 0.4, 0.3, 1.0);
        let scaled = pixel * 2.0;

        assert!((scaled.r - 1.0).abs() < 1e-10);
        assert!((scaled.g - 0.8).abs() < 1e-10);
        assert!((scaled.b - 0.6).abs() < 1e-10);
        assert!((scaled.a - 1.0).abs() < 1e-10); // Alpha unchanged
    }
}

