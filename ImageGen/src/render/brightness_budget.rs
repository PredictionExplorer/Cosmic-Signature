//! Brightness budget system for preventing cumulative darkness.
//!
//! This module provides a "darkness budget" mechanism that prevents multiple
//! darkening effects from compounding and crushing image brightness.
//!
//! # Design Philosophy
//!
//! Each effect that reduces brightness (volumetric_occlusion, atmospheric_depth,
//! cosmic_ink, etc.) is assigned a "darkness cost". The total darkness applied
//! to an image is capped to ensure museum-quality output with sufficient brightness.
//!
//! # Usage
//!
//! ```rust
//! # use three_body_problem::render::brightness_budget::BrightnessBudget;
//! let mut budget = BrightnessBudget::default();
//!
//! // Request darkness for volumetric occlusion
//! let allowed_strength = budget.request_darkness("volumetric_occlusion", 0.65);
//! // May return less than requested if budget is exhausted
//!
//! // Check how much budget remains
//! let remaining = budget.remaining();
//! ```
//!
//! # Museum Quality Guarantee
//!
//! The budget system ensures that even when multiple darkening effects are enabled,
//! the final image retains sufficient brightness to be exhibition-ready.
//!
//! # Note
//!
//! This module is currently used for runtime brightness compensation (via
//! `apply_brightness_compensation` in the pipeline). The budget tracking types
//! (`BrightnessBudget`, `DarknessCosts`, `apply_brightness_budget`) are public
//! API for future integration with adaptive effect strength adjustment.

// Allow dead code for public API types that are not yet fully integrated
#![allow(dead_code)]

/// Maximum cumulative darkness that can be applied before corrections kick in.
///
/// This value represents the total "darkening power" allowed across all effects.
/// A value of 1.0 means the image could theoretically be darkened to black;
/// 0.5 means only half that darkening is allowed.
///
/// # Tuning Notes
///
/// - **0.35**: Conservative - very bright images, minimal atmospheric effects
/// - **0.50**: Balanced - good depth effects while maintaining brightness
/// - **0.60**: Gallery mode - allows rich atmosphere while protecting highlights
/// - **0.75**: Cinematic - deeper shadows but risks crushing midtones
const DEFAULT_DARKNESS_BUDGET: f64 = 0.55;

/// Minimum brightness multiplier the image can drop to.
///
/// Even after all darkening effects, the image should not be darker than
/// this fraction of its original brightness in the midtones.
const MIN_BRIGHTNESS_FLOOR: f64 = 0.45;

/// Tracks and limits cumulative darkening across multiple effects.
///
/// The budget system ensures that no matter how many darkening effects are enabled,
/// the final image maintains sufficient brightness for museum-quality output.
#[derive(Clone, Debug)]
pub struct BrightnessBudget {
    /// Maximum total darkness budget
    max_budget: f64,
    /// Current consumed darkness
    consumed: f64,
    /// Minimum allowed brightness multiplier
    min_brightness: f64,
    /// Record of which effects consumed how much
    allocations: Vec<(String, f64)>,
}

impl Default for BrightnessBudget {
    fn default() -> Self {
        Self {
            max_budget: DEFAULT_DARKNESS_BUDGET,
            consumed: 0.0,
            min_brightness: MIN_BRIGHTNESS_FLOOR,
            allocations: Vec::new(),
        }
    }
}

impl BrightnessBudget {
    /// Create a new brightness budget with custom limits.
    ///
    /// # Arguments
    ///
    /// * `max_budget` - Maximum cumulative darkness (0.0 - 1.0)
    /// * `min_brightness` - Minimum brightness floor (0.0 - 1.0)
    pub fn new(max_budget: f64, min_brightness: f64) -> Self {
        Self {
            max_budget: max_budget.clamp(0.1, 1.0),
            consumed: 0.0,
            min_brightness: min_brightness.clamp(0.1, 0.9),
            allocations: Vec::new(),
        }
    }

    /// Create a conservative budget for maximum brightness preservation.
    pub fn conservative() -> Self {
        Self::new(0.40, 0.55)
    }

    /// Create a cinematic budget allowing deeper shadows.
    pub fn cinematic() -> Self {
        Self::new(0.65, 0.35)
    }

    /// Request darkness budget for an effect.
    ///
    /// Returns the allowed darkness (which may be less than requested if
    /// the budget is exhausted).
    ///
    /// # Arguments
    ///
    /// * `effect_name` - Name of the effect requesting darkness
    /// * `requested` - Requested darkness amount (0.0 - 1.0)
    ///
    /// # Returns
    ///
    /// The allowed darkness, clamped to available budget.
    ///
    /// # Example
    ///
    /// ```rust
    /// # use three_body_problem::render::brightness_budget::BrightnessBudget;
    /// let mut budget = BrightnessBudget::default();
    ///
    /// // First effect gets full request
    /// let vol_occ = budget.request_darkness("volumetric_occlusion", 0.30);
    /// assert!((vol_occ - 0.30).abs() < 0.001);
    ///
    /// // Later effects may get reduced allocation
    /// let atmos = budget.request_darkness("atmospheric_depth", 0.30);
    /// // atmos will be <= 0.25 due to remaining budget
    /// ```
    pub fn request_darkness(&mut self, effect_name: &str, requested: f64) -> f64 {
        let remaining = self.remaining();
        let allowed = requested.min(remaining).max(0.0);
        
        if allowed > 0.0 {
            self.consumed += allowed;
            self.allocations.push((effect_name.to_string(), allowed));
        }
        
        allowed
    }

    /// Get the remaining darkness budget.
    #[inline]
    pub fn remaining(&self) -> f64 {
        (self.max_budget - self.consumed).max(0.0)
    }

    /// Get the total consumed darkness.
    #[inline]
    pub fn consumed(&self) -> f64 {
        self.consumed
    }

    /// Get the maximum budget.
    #[inline]
    pub fn max_budget(&self) -> f64 {
        self.max_budget
    }

    /// Get the minimum brightness floor.
    #[inline]
    pub fn min_brightness(&self) -> f64 {
        self.min_brightness
    }

    /// Calculate the post-effect brightness compensation needed.
    ///
    /// This returns a multiplier that should be applied after all darkening
    /// effects to restore brightness to acceptable levels.
    ///
    /// # Returns
    ///
    /// A brightness multiplier >= 1.0 to compensate for darkness.
    pub fn calculate_compensation(&self) -> f64 {
        // Estimate the brightness reduction from consumed darkness
        // Each unit of "darkness" roughly corresponds to that fraction of brightness lost
        let estimated_brightness = (1.0 - self.consumed * 0.7).max(self.min_brightness);
        
        // Calculate how much we need to boost to reach target
        let target_brightness = 0.75; // Target midtone brightness
        let compensation = target_brightness / estimated_brightness;
        
        // Clamp to reasonable range (don't over-boost)
        compensation.clamp(1.0, 2.0)
    }

    /// Check if the budget is exhausted.
    #[inline]
    pub fn is_exhausted(&self) -> bool {
        self.remaining() < 0.01
    }

    /// Get allocation records for debugging.
    pub fn allocations(&self) -> &[(String, f64)] {
        &self.allocations
    }

    /// Reset the budget (for testing or multi-frame scenarios).
    pub fn reset(&mut self) {
        self.consumed = 0.0;
        self.allocations.clear();
    }
}

/// Cost coefficients for each darkening effect.
///
/// These represent how much "darkness budget" each effect consumes per unit strength.
/// Higher values mean the effect has more darkening impact.
#[derive(Clone, Debug)]
pub struct DarknessCosts {
    pub volumetric_occlusion: f64,
    pub atmospheric_depth: f64,
    pub cosmic_ink: f64,
    pub aurora_veils: f64, // Note: aurora uses screen blend, so cost is negative/zero
    pub vignette: f64,
    pub dodge_burn: f64, // Burn component
}

impl Default for DarknessCosts {
    fn default() -> Self {
        Self {
            // Volumetric occlusion is the heaviest darkening effect
            volumetric_occlusion: 0.55,
            // Atmospheric depth adds fog + darkening
            atmospheric_depth: 0.40,
            // Cosmic ink blends dark colors
            cosmic_ink: 0.35,
            // Aurora veils uses screen blend - actually lightens, so minimal cost
            aurora_veils: 0.05,
            // Vignette darkens edges
            vignette: 0.25,
            // Dodge & burn is balanced, slight net darkening
            dodge_burn: 0.15,
        }
    }
}

impl DarknessCosts {
    /// Calculate the darkness cost for a given effect and strength.
    ///
    /// # Arguments
    ///
    /// * `effect` - Effect name (must match field names)
    /// * `strength` - Effect strength (0.0 - 1.0)
    ///
    /// # Returns
    ///
    /// The darkness cost for this effect at this strength.
    pub fn cost_for(&self, effect: &str, strength: f64) -> f64 {
        let coefficient = match effect {
            "volumetric_occlusion" => self.volumetric_occlusion,
            "atmospheric_depth" => self.atmospheric_depth,
            "cosmic_ink" => self.cosmic_ink,
            "aurora_veils" => self.aurora_veils,
            "vignette" => self.vignette,
            "dodge_burn" => self.dodge_burn,
            _ => 0.0,
        };
        coefficient * strength
    }
}

/// Apply brightness budget to adjust effect strengths.
///
/// This function takes a set of requested effect strengths and returns
/// adjusted strengths that respect the brightness budget.
///
/// # Arguments
///
/// * `budget` - The brightness budget to use
/// * `volumetric_strength` - Requested volumetric occlusion strength
/// * `atmospheric_strength` - Requested atmospheric depth strength
/// * `atmospheric_darkening` - Requested atmospheric darkening strength
/// * `cosmic_ink_strength` - Requested cosmic ink strength
/// * `vignette_strength` - Requested vignette strength
///
/// # Returns
///
/// A tuple of adjusted strengths in the same order as arguments.
pub fn apply_brightness_budget(
    budget: &mut BrightnessBudget,
    costs: &DarknessCosts,
    volumetric_strength: f64,
    atmospheric_strength: f64,
    atmospheric_darkening: f64,
    cosmic_ink_strength: f64,
    vignette_strength: f64,
) -> (f64, f64, f64, f64, f64) {
    // Calculate requested costs
    let vol_cost = costs.cost_for("volumetric_occlusion", volumetric_strength);
    let atmos_cost = costs.cost_for("atmospheric_depth", atmospheric_strength * atmospheric_darkening);
    let ink_cost = costs.cost_for("cosmic_ink", cosmic_ink_strength);
    let vig_cost = costs.cost_for("vignette", vignette_strength);
    
    // Total requested
    let total_requested = vol_cost + atmos_cost + ink_cost + vig_cost;
    
    // If we're within budget, allow everything
    if total_requested <= budget.remaining() {
        budget.request_darkness("volumetric_occlusion", vol_cost);
        budget.request_darkness("atmospheric_depth", atmos_cost);
        budget.request_darkness("cosmic_ink", ink_cost);
        budget.request_darkness("vignette", vig_cost);
        return (volumetric_strength, atmospheric_strength, atmospheric_darkening, cosmic_ink_strength, vignette_strength);
    }
    
    // Need to scale down - prioritize volumetric > atmospheric > ink > vignette
    let remaining = budget.remaining();
    let scale = if total_requested > 0.0 { remaining / total_requested } else { 1.0 };
    
    // Apply scaled strengths with priorities
    let adj_volumetric = volumetric_strength * (scale * 1.2).min(1.0); // Prioritize
    let adj_atmospheric = atmospheric_strength * scale;
    let adj_darkening = atmospheric_darkening * (scale * 0.7).min(1.0); // Reduce darkening more
    let adj_ink = cosmic_ink_strength * (scale * 0.8).min(1.0);
    let adj_vignette = vignette_strength * (scale * 0.6).min(1.0); // Vignette is least important
    
    // Record allocations
    budget.request_darkness("volumetric_occlusion", costs.cost_for("volumetric_occlusion", adj_volumetric));
    budget.request_darkness("atmospheric_depth", costs.cost_for("atmospheric_depth", adj_atmospheric * adj_darkening));
    budget.request_darkness("cosmic_ink", costs.cost_for("cosmic_ink", adj_ink));
    budget.request_darkness("vignette", costs.cost_for("vignette", adj_vignette));
    
    (adj_volumetric, adj_atmospheric, adj_darkening, adj_ink, adj_vignette)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_budget() {
        let budget = BrightnessBudget::default();
        assert!((budget.max_budget() - DEFAULT_DARKNESS_BUDGET).abs() < 0.001);
        assert!(budget.remaining() > 0.0);
        assert!(!budget.is_exhausted());
    }

    #[test]
    fn test_request_darkness() {
        let mut budget = BrightnessBudget::default();
        
        // First request should be granted in full
        let allowed = budget.request_darkness("test_effect", 0.20);
        assert!((allowed - 0.20).abs() < 0.001);
        assert!((budget.consumed() - 0.20).abs() < 0.001);
    }

    #[test]
    fn test_budget_exhaustion() {
        let mut budget = BrightnessBudget::new(0.30, 0.50);
        
        // Request more than budget
        let allowed1 = budget.request_darkness("effect1", 0.20);
        let allowed2 = budget.request_darkness("effect2", 0.20);
        
        assert!((allowed1 - 0.20).abs() < 0.001);
        assert!(allowed2 < 0.15); // Should be capped
        assert!(budget.is_exhausted() || budget.remaining() < 0.05);
    }

    #[test]
    fn test_compensation_calculation() {
        let mut budget = BrightnessBudget::default();
        
        // No darkness = minimal compensation
        let comp1 = budget.calculate_compensation();
        assert!(comp1 >= 1.0);
        
        // After consuming darkness, compensation should increase
        budget.request_darkness("heavy_effect", 0.40);
        let comp2 = budget.calculate_compensation();
        assert!(comp2 > comp1);
    }

    #[test]
    fn test_conservative_vs_cinematic() {
        let conservative = BrightnessBudget::conservative();
        let cinematic = BrightnessBudget::cinematic();
        
        assert!(conservative.max_budget() < cinematic.max_budget());
        assert!(conservative.min_brightness() > cinematic.min_brightness());
    }

    #[test]
    fn test_darkness_costs() {
        let costs = DarknessCosts::default();
        
        // Volumetric should be heaviest
        let vol_cost = costs.cost_for("volumetric_occlusion", 1.0);
        let ink_cost = costs.cost_for("cosmic_ink", 1.0);
        assert!(vol_cost > ink_cost);
        
        // Aurora should be lightest (it lightens)
        let aurora_cost = costs.cost_for("aurora_veils", 1.0);
        assert!(aurora_cost < ink_cost);
    }

    #[test]
    fn test_apply_brightness_budget_within_budget() {
        let mut budget = BrightnessBudget::new(1.0, 0.30); // Large budget
        let costs = DarknessCosts::default();
        
        let (vol, atmos, _dark, _ink, _vig) = apply_brightness_budget(
            &mut budget,
            &costs,
            0.50, 0.30, 0.20, 0.30, 0.25,
        );
        
        // Should get requested values when within budget
        assert!((vol - 0.50).abs() < 0.01);
        assert!((atmos - 0.30).abs() < 0.01);
    }

    #[test]
    fn test_apply_brightness_budget_over_budget() {
        let mut budget = BrightnessBudget::new(0.20, 0.50); // Small budget
        let costs = DarknessCosts::default();
        
        let (vol, atmos, dark, ink, vig) = apply_brightness_budget(
            &mut budget,
            &costs,
            0.65, 0.40, 0.25, 0.40, 0.35,
        );
        
        // All values should be reduced due to budget constraints
        // Note: we check all values to ensure they're all affected by the budget
        assert!(vol < 0.65, "volumetric should be reduced: {}", vol);
        assert!(
            atmos < 0.40 || dark < 0.25,
            "atmospheric should be reduced: atmos={}, dark={}",
            atmos,
            dark
        );
        assert!(ink < 0.40, "cosmic_ink should be reduced: {}", ink);
        assert!(vig < 0.35, "vignette should be reduced: {}", vig);
    }

    #[test]
    fn test_reset() {
        let mut budget = BrightnessBudget::default();
        budget.request_darkness("test", 0.30);
        assert!(budget.consumed() > 0.0);
        
        budget.reset();
        assert!((budget.consumed() - 0.0).abs() < 0.001);
        assert!(budget.allocations().is_empty());
    }

    #[test]
    fn test_allocations_tracking() {
        let mut budget = BrightnessBudget::default();
        budget.request_darkness("effect1", 0.10);
        budget.request_darkness("effect2", 0.15);
        
        let allocs = budget.allocations();
        assert_eq!(allocs.len(), 2);
        assert_eq!(allocs[0].0, "effect1");
        assert_eq!(allocs[1].0, "effect2");
    }
}

