//! Velocity-modulated HDR calculation for dynamic motion enhancement
//!
//! This module provides utilities for computing HDR multipliers based on body velocities,
//! enhancing the visual impact of fast-moving bodies in special rendering mode.

use nalgebra::Vector3;

use super::constants::{VELOCITY_HDR_BOOST_FACTOR, VELOCITY_HDR_BOOST_THRESHOLD};

/// Calculator for velocity-based HDR multipliers
///
/// This struct efficiently computes HDR multipliers for line segments based on
/// the velocities of the bodies at their endpoints.
pub struct VelocityHdrCalculator<'a> {
    positions: &'a [Vec<Vector3<f64>>],
    dt: f64,
    special_mode: bool,
}

impl<'a> VelocityHdrCalculator<'a> {
    /// Create a new velocity HDR calculator
    ///
    /// # Arguments
    /// * `positions` - Position data for all bodies across all timesteps
    /// * `dt` - Simulation timestep
    /// * `special_mode` - Whether special mode enhancements are enabled
    pub fn new(positions: &'a [Vec<Vector3<f64>>], dt: f64, special_mode: bool) -> Self {
        Self { positions, dt, special_mode }
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
        if !self.special_mode {
            return 1.0;
        }

        // Need next step for velocity calculation
        if step + 1 >= self.positions[0].len() {
            return 1.0;
        }

        // Compute velocity multipliers for both bodies
        let v0 = self.compute_single_velocity_multiplier(step, body0);
        let v1 = self.compute_single_velocity_multiplier(step, body1);

        // Average the two multipliers
        (v0 + v1) * 0.5
    }

    /// Compute velocity HDR multiplier for a single body
    #[inline]
    fn compute_single_velocity_multiplier(&self, step: usize, body: usize) -> f64 {
        let p0 = self.positions[body][step];
        let p1 = self.positions[body][step + 1];
        
        compute_velocity_hdr_multiplier(&p0, &p1, self.dt)
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
///
/// # Returns
/// HDR multiplier based on velocity magnitude
#[inline]
fn compute_velocity_hdr_multiplier(p0: &Vector3<f64>, p1: &Vector3<f64>, dt: f64) -> f64 {
    // Compute velocity magnitude
    let delta = p1 - p0;
    let velocity = delta.norm() / dt;
    
    // Normalize velocity and apply boost
    let normalized_velocity = (velocity / VELOCITY_HDR_BOOST_THRESHOLD).min(1.0);
    
    // Linear interpolation: 1.0 at zero velocity, BOOST_FACTOR at threshold velocity
    1.0 + normalized_velocity * (VELOCITY_HDR_BOOST_FACTOR - 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_velocity_hdr_multiplier_stationary() {
        let p0 = Vector3::new(1.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0); // No movement
        let mult = compute_velocity_hdr_multiplier(&p0, &p1, 0.001);
        assert_eq!(mult, 1.0, "Stationary body should have no HDR boost");
    }

    #[test]
    fn test_velocity_hdr_multiplier_fast() {
        let p0 = Vector3::new(0.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0); // Fast movement
        let mult = compute_velocity_hdr_multiplier(&p0, &p1, 0.001);
        assert!(mult > 1.0, "Fast-moving body should have HDR boost");
        assert!(mult <= VELOCITY_HDR_BOOST_FACTOR, "Multiplier should not exceed max boost");
    }

    #[test]
    fn test_calculator_special_mode_disabled() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)],
            vec![Vector3::new(0.0, 1.0, 0.0), Vector3::new(1.0, 1.0, 0.0)],
        ];
        
        let calc = VelocityHdrCalculator::new(&positions, 0.001, false);
        let mult = calc.compute_segment_multiplier(0, 0, 1);
        assert_eq!(mult, 1.0, "Special mode disabled should return 1.0");
    }

    #[test]
    fn test_calculator_special_mode_enabled() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)],
            vec![Vector3::new(0.0, 1.0, 0.0), Vector3::new(1.0, 1.0, 0.0)],
        ];
        
        let calc = VelocityHdrCalculator::new(&positions, 0.001, true);
        let mult = calc.compute_segment_multiplier(0, 0, 1);
        assert!(mult > 1.0, "Fast movement in special mode should boost HDR");
    }
}

