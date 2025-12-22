//! Velocity-modulated HDR calculation for dynamic motion enhancement
//!
//! This module provides utilities for computing HDR multipliers based on body velocities,
//! enhancing the visual impact of fast-moving bodies. Both regular and gallery/special modes
//! receive velocity enhancement for museum-quality output, with gallery mode using more
//! dramatic boost factors.
//!
//! # Museum Quality Philosophy
//!
//! All output should be exhibition-ready. Regular mode provides subtle, refined motion
//! enhancement that adds life without overwhelming geometric precision. Gallery/special
//! mode maximizes the dramatic effect for cinematic impact.

use nalgebra::Vector3;

use super::constants::{
    REGULAR_VELOCITY_HDR_BOOST_FACTOR, VELOCITY_HDR_BOOST_FACTOR, VELOCITY_HDR_BOOST_THRESHOLD,
};

/// Calculator for velocity-based HDR multipliers
///
/// This struct efficiently computes HDR multipliers for line segments based on
/// the velocities of the bodies at their endpoints. Both modes receive enhancement
/// to ensure museum-quality output across all render configurations.
pub struct VelocityHdrCalculator<'a> {
    positions: &'a [Vec<Vector3<f64>>],
    dt: f64,
    boost_factor: f64,
}

impl<'a> VelocityHdrCalculator<'a> {
    /// Create a new velocity HDR calculator
    ///
    /// # Arguments
    /// * `positions` - Position data for all bodies across all timesteps
    /// * `dt` - Simulation timestep
    /// * `special_mode` - Whether gallery/special mode is enabled (uses higher boost factor)
    ///
    /// # Mode Behavior
    ///
    /// - **Regular mode**: Uses `REGULAR_VELOCITY_HDR_BOOST_FACTOR` (3.0×) for subtle elegance
    /// - **Gallery/Special mode**: Uses `VELOCITY_HDR_BOOST_FACTOR` (8.0×) for dramatic impact
    pub fn new(positions: &'a [Vec<Vector3<f64>>], dt: f64, special_mode: bool) -> Self {
        let boost_factor = if special_mode {
            VELOCITY_HDR_BOOST_FACTOR
        } else {
            REGULAR_VELOCITY_HDR_BOOST_FACTOR
        };
        Self { positions, dt, boost_factor }
    }

    /// Compute HDR multiplier for a line segment between two bodies
    ///
    /// # Arguments
    /// * `step` - Current simulation step
    /// * `body0` - Index of first body
    /// * `body1` - Index of second body
    ///
    /// # Returns
    /// HDR multiplier (1.0 = no boost, higher values = more boost)
    #[inline]
    pub fn compute_segment_multiplier(&self, step: usize, body0: usize, body1: usize) -> f64 {
        // Need next step for velocity calculation
        if step + 1 >= self.positions[0].len() {
            return 1.0;
        }

        // Compute velocity multipliers for both bodies
        let v0 = self.compute_single_velocity_multiplier(step, body0);
        let v1 = self.compute_single_velocity_multiplier(step, body1);

        // Average the two multipliers for smooth segment appearance
        (v0 + v1) * 0.5
    }

    /// Compute velocity HDR multiplier for a single body
    #[inline]
    fn compute_single_velocity_multiplier(&self, step: usize, body: usize) -> f64 {
        let p0 = self.positions[body][step];
        let p1 = self.positions[body][step + 1];

        compute_velocity_hdr_multiplier(&p0, &p1, self.dt, self.boost_factor)
    }

    /// Returns the boost factor being used by this calculator
    #[cfg(test)]
    pub fn boost_factor(&self) -> f64 {
        self.boost_factor
    }
}

/// Compute velocity-modulated HDR scale based on position delta
///
/// Returns multiplier for hdr_scale (1.0 = no boost, higher = more boost for fast motion)
///
/// # Arguments
/// * `p0` - Position at current step
/// * `p1` - Position at next step
/// * `dt` - Simulation timestep
/// * `boost_factor` - Maximum boost factor to apply at threshold velocity
///
/// # Returns
/// HDR multiplier based on velocity magnitude
#[inline]
fn compute_velocity_hdr_multiplier(
    p0: &Vector3<f64>,
    p1: &Vector3<f64>,
    dt: f64,
    boost_factor: f64,
) -> f64 {
    // Compute velocity magnitude
    let delta = p1 - p0;
    let velocity = delta.norm() / dt;

    // Normalize velocity and apply boost
    let normalized_velocity = (velocity / VELOCITY_HDR_BOOST_THRESHOLD).min(1.0);

    // Linear interpolation: 1.0 at zero velocity, boost_factor at threshold velocity
    1.0 + normalized_velocity * (boost_factor - 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_velocity_hdr_multiplier_stationary() {
        let p0 = Vector3::new(1.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0); // No movement
        let mult = compute_velocity_hdr_multiplier(&p0, &p1, 0.001, VELOCITY_HDR_BOOST_FACTOR);
        assert_eq!(mult, 1.0, "Stationary body should have no HDR boost");
    }

    #[test]
    fn test_velocity_hdr_multiplier_fast_gallery_mode() {
        let p0 = Vector3::new(0.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0); // Fast movement
        let mult = compute_velocity_hdr_multiplier(&p0, &p1, 0.001, VELOCITY_HDR_BOOST_FACTOR);
        assert!(mult > 1.0, "Fast-moving body should have HDR boost");
        assert!(mult <= VELOCITY_HDR_BOOST_FACTOR, "Multiplier should not exceed max boost");
    }

    #[test]
    fn test_velocity_hdr_multiplier_fast_regular_mode() {
        let p0 = Vector3::new(0.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0); // Fast movement
        let mult =
            compute_velocity_hdr_multiplier(&p0, &p1, 0.001, REGULAR_VELOCITY_HDR_BOOST_FACTOR);
        assert!(mult > 1.0, "Fast-moving body should have HDR boost in regular mode");
        assert!(
            mult <= REGULAR_VELOCITY_HDR_BOOST_FACTOR,
            "Multiplier should not exceed regular mode max boost"
        );
        assert!(
            mult < VELOCITY_HDR_BOOST_FACTOR,
            "Regular mode boost should be less than gallery mode"
        );
    }

    #[test]
    fn test_calculator_regular_mode_has_subtle_boost() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)],
            vec![Vector3::new(0.0, 1.0, 0.0), Vector3::new(1.0, 1.0, 0.0)],
        ];

        let calc = VelocityHdrCalculator::new(&positions, 0.001, false);
        let mult = calc.compute_segment_multiplier(0, 0, 1);

        // Regular mode should now have boost (unlike before when it was disabled)
        assert!(mult > 1.0, "Regular mode should have subtle HDR boost for museum quality");
        assert!(
            mult <= REGULAR_VELOCITY_HDR_BOOST_FACTOR,
            "Regular mode boost should be capped at subtle level"
        );
    }

    #[test]
    fn test_calculator_gallery_mode_has_dramatic_boost() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)],
            vec![Vector3::new(0.0, 1.0, 0.0), Vector3::new(1.0, 1.0, 0.0)],
        ];

        let calc = VelocityHdrCalculator::new(&positions, 0.001, true);
        let mult = calc.compute_segment_multiplier(0, 0, 1);

        assert!(mult > 1.0, "Gallery mode should have dramatic HDR boost");
    }

    #[test]
    fn test_gallery_mode_boost_exceeds_regular_mode() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)],
            vec![Vector3::new(0.0, 1.0, 0.0), Vector3::new(1.0, 1.0, 0.0)],
        ];

        let regular_calc = VelocityHdrCalculator::new(&positions, 0.001, false);
        let gallery_calc = VelocityHdrCalculator::new(&positions, 0.001, true);

        let regular_mult = regular_calc.compute_segment_multiplier(0, 0, 1);
        let gallery_mult = gallery_calc.compute_segment_multiplier(0, 0, 1);

        assert!(
            gallery_mult > regular_mult,
            "Gallery mode should produce higher boost than regular mode"
        );
    }

    #[test]
    fn test_boost_factor_selection() {
        let positions = vec![vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)]];

        let regular_calc = VelocityHdrCalculator::new(&positions, 0.001, false);
        let gallery_calc = VelocityHdrCalculator::new(&positions, 0.001, true);

        assert_eq!(
            regular_calc.boost_factor(),
            REGULAR_VELOCITY_HDR_BOOST_FACTOR,
            "Regular mode should use regular boost factor"
        );
        assert_eq!(
            gallery_calc.boost_factor(),
            VELOCITY_HDR_BOOST_FACTOR,
            "Gallery mode should use full boost factor"
        );
    }
}
