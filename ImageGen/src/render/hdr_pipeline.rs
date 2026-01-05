//! HDR-aware rendering pipeline.
//!
//! This module provides the infrastructure for an elegant, scene-referred
//! rendering pipeline. Not all components are integrated into the main
//! pipeline yet, but they provide the foundation for future improvements.

#![allow(dead_code)] // Infrastructure module - gradual integration in progress

//! This module implements the elegant, scene-referred rendering pipeline where:
//!
//! 1. All effects operate in unbounded linear HDR space
//! 2. Effects declare their energy impact (darkening/brightening)
//! 3. The pipeline tracks cumulative energy and prevents over-darkening
//! 4. Exposure control happens at a single point before tonemapping
//! 5. Tonemapping is the final step, converting HDR to display-referred
//!
//! # Design Philosophy
//!
//! This pipeline treats brightness as information to be preserved, not a problem
//! to be fixed afterward. Instead of:
//!
//! > "Generate → Darken → Stretch (fix)"
//!
//! We have:
//!
//! > "Generate (HDR) → Transform (HDR) → Display (once)"

use super::color_types::{LinearHDR, EnergyTracker, ExposureControl};
use super::tonemap::ACES_LUT;
use rayon::prelude::*;
use std::error::Error;

/// Trait for HDR-aware post-processing effects.
///
/// Effects implementing this trait operate in scene-referred (HDR) space
/// and declare their energy impact on the image.
///
/// # Energy Model
///
/// Each effect returns an `energy_factor`:
/// - `1.0` = brightness neutral (no change to overall energy)
/// - `< 1.0` = darkening effect (e.g., vignette, occlusion)
/// - `> 1.0` = brightening effect (e.g., bloom adds light)
///
/// The pipeline uses this information to:
/// 1. Track cumulative energy through the effect chain
/// 2. Limit effects when the energy budget is exhausted
/// 3. Apply compensation at the end if needed
///
/// # Example
///
/// ```rust,ignore
/// struct MyVignetteEffect {
///     strength: f64,
/// }
///
/// impl HDREffect for MyVignetteEffect {
///     fn energy_factor(&self) -> f64 {
///         // Vignette darkens by roughly (1 - strength * 0.5) on average
///         1.0 - self.strength * 0.5
///     }
///
///     fn process_hdr(
///         &self,
///         input: &[LinearHDR],
///         width: usize,
///         height: usize,
///     ) -> Result<Vec<LinearHDR>, Box<dyn Error>> {
///         // Apply vignette in HDR space
///         // ...
///     }
/// }
/// ```
pub trait HDREffect: Send + Sync {
    /// Returns the expected energy factor of this effect.
    ///
    /// This is used by the pipeline to track cumulative brightness changes.
    /// The value should be an estimate of the average brightness change:
    ///
    /// - `1.0` = no change to overall brightness
    /// - `0.8` = darkens by ~20% on average
    /// - `1.2` = brightens by ~20% on average
    fn energy_factor(&self) -> f64 {
        1.0 // Default: brightness neutral
    }

    /// Process the HDR buffer.
    ///
    /// Input and output are in scene-referred (linear HDR) space.
    /// Values can exceed 1.0.
    fn process_hdr(
        &self,
        input: &[LinearHDR],
        width: usize,
        height: usize,
    ) -> Result<Vec<LinearHDR>, Box<dyn Error>>;

    /// Returns the name of this effect for debugging.
    fn name(&self) -> &'static str {
        "HDREffect"
    }

    /// Returns whether this effect is currently enabled.
    fn is_enabled(&self) -> bool {
        true
    }
}

/// HDR effect chain with energy tracking.
///
/// Processes a sequence of HDR effects while tracking cumulative energy
/// and preventing over-darkening.
pub struct HDREffectChain {
    effects: Vec<Box<dyn HDREffect>>,
    energy_tracker: EnergyTracker,
}

impl HDREffectChain {
    /// Create a new empty effect chain.
    pub fn new() -> Self {
        Self {
            effects: Vec::new(),
            energy_tracker: EnergyTracker::default(),
        }
    }

    /// Create with custom energy minimum.
    pub fn with_energy_minimum(minimum: f64) -> Self {
        Self {
            effects: Vec::new(),
            energy_tracker: EnergyTracker::with_minimum(minimum),
        }
    }

    /// Add an effect to the chain.
    pub fn add(&mut self, effect: Box<dyn HDREffect>) {
        self.effects.push(effect);
    }

    /// Process the buffer through all enabled effects.
    ///
    /// Effects are applied in order, with energy tracking to prevent
    /// over-darkening. If an effect would exceed the energy budget,
    /// its impact is limited.
    pub fn process(
        &mut self,
        mut buffer: Vec<LinearHDR>,
        width: usize,
        height: usize,
    ) -> Result<Vec<LinearHDR>, Box<dyn Error>> {
        // Reset energy tracker for this frame
        self.energy_tracker = EnergyTracker::with_minimum(self.energy_tracker.minimum);

        for effect in &self.effects {
            if !effect.is_enabled() {
                continue;
            }

            let expected_factor = effect.energy_factor();
            let allowed_factor = self.energy_tracker.apply(expected_factor);

            // If we're at the energy floor and effect would darken further, skip
            if self.energy_tracker.is_at_minimum() && expected_factor < 1.0 {
                tracing::debug!(
                    "Skipping {} (energy budget exhausted)",
                    effect.name()
                );
                continue;
            }

            // Apply the effect
            buffer = effect.process_hdr(&buffer, width, height)?;

            // If effect was limited, we might need to compensate
            if (allowed_factor - expected_factor).abs() > 0.01 {
                let compensation = expected_factor / allowed_factor;
                tracing::debug!(
                    "{}: limited by energy budget (wanted {:.2}, got {:.2})",
                    effect.name(),
                    expected_factor,
                    allowed_factor
                );

                // Apply partial compensation to restore some of the intended darkening
                // This keeps the effect visible but limits its impact
                buffer = buffer
                    .par_iter()
                    .map(|p| p.scale_rgb(compensation.sqrt())) // Partial compensation
                    .collect();
            }
        }

        Ok(buffer)
    }

    /// Get the current energy level after processing.
    pub fn current_energy(&self) -> f64 {
        self.energy_tracker.current
    }

    /// Get the compensation factor needed to restore full brightness.
    pub fn compensation_factor(&self) -> f64 {
        self.energy_tracker.compensation_factor()
    }
}

impl Default for HDREffectChain {
    fn default() -> Self {
        Self::new()
    }
}

/// Final HDR to display conversion stage.
///
/// This is the single point where HDR values are converted to display-referred
/// values. It applies:
///
/// 1. Exposure adjustment (based on scene analysis or user setting)
/// 2. Tonemapping (ACES curve)
/// 3. Gamma encoding (for sRGB display)
pub struct HDRToDisplay {
    exposure: ExposureControl,
}

impl HDRToDisplay {
    /// Create with default exposure settings.
    pub fn new() -> Self {
        Self {
            exposure: ExposureControl::default(),
        }
    }

    /// Create with specific exposure control.
    pub fn with_exposure(exposure: ExposureControl) -> Self {
        Self { exposure }
    }

    /// Convert HDR buffer to display-ready values.
    ///
    /// This is the FINAL conversion in the pipeline. After this,
    /// values are in display-referred space and should not be
    /// processed further.
    pub fn convert(
        &self,
        buffer: &[LinearHDR],
        width: usize,
        _height: usize,
    ) -> Vec<[f64; 3]> {
        // Compute scene statistics for auto-exposure
        let scene_luminance = self.compute_scene_luminance(buffer);
        let exposure_mult = self.exposure.compute_multiplier(scene_luminance);

        tracing::debug!(
            "HDR->Display: scene_lum={:.4}, exposure_mult={:.2}",
            scene_luminance,
            exposure_mult
        );

        // Convert each pixel
        buffer
            .par_iter()
            .enumerate()
            .map(|(idx, pixel)| {
                let x = idx % width;
                let y = idx / width;
                self.convert_pixel(*pixel, exposure_mult, x, y)
            })
            .collect()
    }

    /// Convert a single HDR pixel to display RGB.
    fn convert_pixel(&self, pixel: LinearHDR, exposure: f64, _x: usize, _y: usize) -> [f64; 3] {
        if pixel.is_transparent() {
            return [0.0, 0.0, 0.0];
        }

        // Un-premultiply
        let (sr, sg, sb) = pixel.to_straight_rgb();

        // Apply exposure
        let exposed_r = sr * exposure;
        let exposed_g = sg * exposure;
        let exposed_b = sb * exposure;

        // Apply ACES tonemapping
        let tm_r = ACES_LUT.apply(exposed_r);
        let tm_g = ACES_LUT.apply(exposed_g);
        let tm_b = ACES_LUT.apply(exposed_b);

        // Clamp to display range (ACES should already be in range, but ensure)
        [
            tm_r.clamp(0.0, 1.0),
            tm_g.clamp(0.0, 1.0),
            tm_b.clamp(0.0, 1.0),
        ]
    }

    /// Compute scene luminance for auto-exposure.
    fn compute_scene_luminance(&self, buffer: &[LinearHDR]) -> f64 {
        // Sample luminance from visible pixels
        let sample_stride = (buffer.len() / 1000).max(1);
        let mut total_lum = 0.0;
        let mut count = 0;

        for (idx, pixel) in buffer.iter().enumerate() {
            if idx % sample_stride != 0 {
                continue;
            }
            if pixel.is_visible() {
                total_lum += pixel.straight_luminance();
                count += 1;
            }
        }

        if count == 0 {
            return 0.18; // Default to 18% gray if no visible pixels
        }

        total_lum / count as f64
    }
}

impl Default for HDRToDisplay {
    fn default() -> Self {
        Self::new()
    }
}

/// Complete HDR pipeline orchestrator.
///
/// Manages the full rendering pipeline from HDR input to display output.
/// This replaces the ad-hoc band-aid approach with a principled design.
pub struct HDRPipeline {
    /// Effect chain with energy tracking
    pub effect_chain: HDREffectChain,

    /// Final conversion stage
    pub to_display: HDRToDisplay,

    /// Whether to apply energy compensation before display conversion
    pub apply_energy_compensation: bool,
}

impl HDRPipeline {
    /// Create a new pipeline with default settings.
    pub fn new() -> Self {
        Self {
            effect_chain: HDREffectChain::new(),
            to_display: HDRToDisplay::new(),
            apply_energy_compensation: true,
        }
    }

    /// Create with custom energy minimum.
    pub fn with_energy_minimum(minimum: f64) -> Self {
        Self {
            effect_chain: HDREffectChain::with_energy_minimum(minimum),
            to_display: HDRToDisplay::new(),
            apply_energy_compensation: true,
        }
    }

    /// Add an effect to the pipeline.
    pub fn add_effect(&mut self, effect: Box<dyn HDREffect>) {
        self.effect_chain.add(effect);
    }

    /// Set the exposure control.
    pub fn set_exposure(&mut self, exposure: ExposureControl) {
        self.to_display = HDRToDisplay::with_exposure(exposure);
    }

    /// Process HDR buffer through effects and convert to display.
    ///
    /// This is the main entry point for rendering a frame.
    pub fn process(
        &mut self,
        buffer: Vec<LinearHDR>,
        width: usize,
        height: usize,
    ) -> Result<Vec<[f64; 3]>, Box<dyn Error>> {
        // Run through effect chain (with energy tracking)
        let mut processed = self.effect_chain.process(buffer, width, height)?;

        // Apply energy compensation if enabled
        if self.apply_energy_compensation {
            let compensation = self.effect_chain.compensation_factor();
            if compensation > 1.01 {
                tracing::debug!(
                    "Applying energy compensation: {:.2}x (energy at {:.1}%)",
                    compensation,
                    self.effect_chain.current_energy() * 100.0
                );

                // Apply gentle compensation (sqrt to avoid over-correction)
                let gentle_comp = compensation.sqrt();
                processed = processed
                    .par_iter()
                    .map(|p| p.scale_rgb(gentle_comp))
                    .collect();
            }
        }

        // Convert to display
        Ok(self.to_display.convert(&processed, width, height))
    }
}

impl Default for HDRPipeline {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// ADAPTER FOR LEGACY EFFECTS
// ============================================================================

use super::types::PixelBuffer;
use crate::post_effects::{PostEffect, FrameParams};

/// Adapter to use legacy PostEffect implementations in the HDR pipeline.
///
/// This allows gradual migration: existing effects can be wrapped and used
/// in the new pipeline while we migrate them to the HDREffect trait.
pub struct LegacyEffectAdapter {
    effect: Box<dyn PostEffect>,
    energy_factor: f64,
    name: &'static str,
}

impl LegacyEffectAdapter {
    /// Wrap a legacy effect with its estimated energy factor.
    pub fn new(effect: Box<dyn PostEffect>, energy_factor: f64, name: &'static str) -> Self {
        Self { effect, energy_factor, name }
    }
}

impl HDREffect for LegacyEffectAdapter {
    fn energy_factor(&self) -> f64 {
        self.energy_factor
    }

    fn process_hdr(
        &self,
        input: &[LinearHDR],
        width: usize,
        height: usize,
    ) -> Result<Vec<LinearHDR>, Box<dyn Error>> {
        // Convert to legacy format
        let legacy_buffer: PixelBuffer = input.iter().map(|p| p.to_tuple()).collect();

        // Process with legacy effect
        let params = FrameParams {
            frame_number: 0,
            _density: None,
            body_positions: None,
        };
        let result = self.effect.process(&legacy_buffer, width, height, &params)?;

        // Convert back to HDR
        Ok(result.into_iter().map(LinearHDR::from).collect())
    }

    fn name(&self) -> &'static str {
        self.name
    }

    fn is_enabled(&self) -> bool {
        self.effect.is_enabled()
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Test effect that darkens by a fixed factor.
    struct DarkenEffect {
        factor: f64,
    }

    impl HDREffect for DarkenEffect {
        fn energy_factor(&self) -> f64 {
            self.factor
        }

        fn process_hdr(
            &self,
            input: &[LinearHDR],
            _width: usize,
            _height: usize,
        ) -> Result<Vec<LinearHDR>, Box<dyn Error>> {
            Ok(input.iter().map(|p| p.scale_rgb(self.factor)).collect())
        }

        fn name(&self) -> &'static str {
            "DarkenEffect"
        }
    }

    /// Test effect that brightens (adds light).
    struct BrightenEffect {
        amount: f64,
    }

    impl HDREffect for BrightenEffect {
        fn energy_factor(&self) -> f64 {
            1.0 + self.amount
        }

        fn process_hdr(
            &self,
            input: &[LinearHDR],
            _width: usize,
            _height: usize,
        ) -> Result<Vec<LinearHDR>, Box<dyn Error>> {
            Ok(input
                .iter()
                .map(|p| LinearHDR::new(p.r + self.amount, p.g + self.amount, p.b + self.amount, p.a))
                .collect())
        }

        fn name(&self) -> &'static str {
            "BrightenEffect"
        }
    }

    #[test]
    fn test_hdr_chain_empty() {
        let mut chain = HDREffectChain::new();
        let buffer = vec![LinearHDR::new(0.5, 0.5, 0.5, 1.0); 100];

        let result = chain.process(buffer.clone(), 10, 10).unwrap();

        // Should be unchanged
        assert_eq!(result.len(), 100);
        assert!((result[0].r - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_hdr_chain_single_effect() {
        let mut chain = HDREffectChain::new();
        chain.add(Box::new(DarkenEffect { factor: 0.8 }));

        let buffer = vec![LinearHDR::new(1.0, 1.0, 1.0, 1.0); 100];
        let result = chain.process(buffer, 10, 10).unwrap();

        // Should be darkened
        assert!((result[0].r - 0.8).abs() < 1e-10);
        assert!((chain.current_energy() - 0.8).abs() < 1e-10);
    }

    #[test]
    fn test_hdr_chain_energy_tracking() {
        let mut chain = HDREffectChain::new();
        chain.add(Box::new(DarkenEffect { factor: 0.7 })); // 70%
        chain.add(Box::new(DarkenEffect { factor: 0.8 })); // 80%

        let buffer = vec![LinearHDR::new(1.0, 1.0, 1.0, 1.0); 100];
        let _result = chain.process(buffer, 10, 10).unwrap();

        // Energy should be 0.7 * 0.8 = 0.56
        assert!((chain.current_energy() - 0.56).abs() < 1e-10);
    }

    #[test]
    fn test_hdr_chain_energy_limit() {
        let mut chain = HDREffectChain::with_energy_minimum(0.5);
        chain.add(Box::new(DarkenEffect { factor: 0.3 })); // Would go to 30%

        let buffer = vec![LinearHDR::new(1.0, 1.0, 1.0, 1.0); 100];
        let _result = chain.process(buffer, 10, 10).unwrap();

        // Should be limited to 50% minimum
        assert!((chain.current_energy() - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_hdr_chain_compensation_factor() {
        let mut chain = HDREffectChain::new();
        chain.add(Box::new(DarkenEffect { factor: 0.5 }));

        let buffer = vec![LinearHDR::new(1.0, 1.0, 1.0, 1.0); 100];
        let _result = chain.process(buffer, 10, 10).unwrap();

        // Compensation should be 2.0 to restore full brightness
        assert!((chain.compensation_factor() - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_hdr_to_display_basic() {
        let converter = HDRToDisplay::new();
        let buffer = vec![LinearHDR::new(0.5, 0.5, 0.5, 1.0); 100];

        let result = converter.convert(&buffer, 10, 10);

        assert_eq!(result.len(), 100);
        // Values should be tonemapped (in valid display range)
        assert!(result[0][0] >= 0.0 && result[0][0] <= 1.0);
    }

    #[test]
    fn test_hdr_to_display_preserves_hdr_highlights() {
        let converter = HDRToDisplay::with_exposure(ExposureControl::fixed(0.0));
        let buffer = vec![
            LinearHDR::new(0.5, 0.5, 0.5, 1.0), // Normal
            LinearHDR::new(3.0, 3.0, 3.0, 1.0), // HDR highlight
        ];

        let result = converter.convert(&buffer, 2, 1);

        // HDR highlight should be brighter than normal
        assert!(result[1][0] > result[0][0]);
        // But still in display range
        assert!(result[1][0] <= 1.0);
    }

    #[test]
    fn test_hdr_pipeline_full() {
        let mut pipeline = HDRPipeline::new();
        pipeline.add_effect(Box::new(DarkenEffect { factor: 0.8 }));
        pipeline.set_exposure(ExposureControl::fixed(0.0));

        let buffer = vec![LinearHDR::new(0.5, 0.5, 0.5, 1.0); 100];
        let result = pipeline.process(buffer, 10, 10).unwrap();

        // Should produce valid output
        assert_eq!(result.len(), 100);
        assert!(result[0][0] >= 0.0 && result[0][0] <= 1.0);
    }

    #[test]
    fn test_hdr_pipeline_energy_compensation() {
        let mut pipeline = HDRPipeline::with_energy_minimum(0.25);
        pipeline.add_effect(Box::new(DarkenEffect { factor: 0.5 }));
        pipeline.apply_energy_compensation = true;

        let buffer = vec![LinearHDR::new(0.5, 0.5, 0.5, 1.0); 100];
        let result = pipeline.process(buffer.clone(), 10, 10).unwrap();

        // With compensation, result should be brighter than just darkened
        let mut pipeline_no_comp = HDRPipeline::with_energy_minimum(0.25);
        pipeline_no_comp.add_effect(Box::new(DarkenEffect { factor: 0.5 }));
        pipeline_no_comp.apply_energy_compensation = false;

        let result_no_comp = pipeline_no_comp.process(buffer, 10, 10).unwrap();

        // Compensated should be brighter
        assert!(result[0][0] > result_no_comp[0][0]);
    }

    #[test]
    fn test_brighten_effect_energy() {
        let mut chain = HDREffectChain::new();
        chain.add(Box::new(BrightenEffect { amount: 0.2 })); // +20% energy

        let buffer = vec![LinearHDR::new(0.5, 0.5, 0.5, 1.0); 100];
        let _result = chain.process(buffer, 10, 10).unwrap();

        // Energy should be > 1.0 (brightening)
        assert!(chain.current_energy() > 1.0);
    }

    #[test]
    fn test_scene_luminance_computation() {
        let converter = HDRToDisplay::new();

        // All gray pixels
        let buffer = vec![LinearHDR::new(0.5, 0.5, 0.5, 1.0); 100];
        let lum = converter.compute_scene_luminance(&buffer);

        assert!((lum - 0.5).abs() < 0.1);
    }

    #[test]
    fn test_scene_luminance_ignores_transparent() {
        let converter = HDRToDisplay::new();

        // Mix of visible and transparent
        let mut buffer = vec![LinearHDR::new(0.8, 0.8, 0.8, 1.0); 50];
        buffer.extend(vec![LinearHDR::transparent(); 50]);

        let lum = converter.compute_scene_luminance(&buffer);

        // Should only consider visible pixels
        assert!((lum - 0.8).abs() < 0.1);
    }
}

