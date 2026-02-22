//! Velocity-modulated HDR calculation for dynamic motion enhancement
//!
//! Computes HDR multipliers based on body velocities, enhancing the visual
//! impact of fast-moving bodies.

use nalgebra::Vector3;

use super::constants::{VELOCITY_HDR_BOOST_FACTOR, VELOCITY_HDR_BOOST_THRESHOLD};

/// Calculator for velocity-based HDR multipliers.
pub struct VelocityHdrCalculator<'a> {
    positions: &'a [Vec<Vector3<f64>>],
    dt: f64,
}

impl<'a> VelocityHdrCalculator<'a> {
    pub fn new(positions: &'a [Vec<Vector3<f64>>], dt: f64) -> Self {
        Self { positions, dt }
    }

    /// Compute HDR multiplier for a line segment between two bodies.
    /// Returns 1.0 (no boost) up to VELOCITY_HDR_BOOST_FACTOR for fast motion.
    #[inline]
    pub fn compute_segment_multiplier(&self, step: usize, body0: usize, body1: usize) -> f64 {
        if step + 1 >= self.positions[0].len() {
            return 1.0;
        }

        let v0 = self.compute_single_velocity_multiplier(step, body0);
        let v1 = self.compute_single_velocity_multiplier(step, body1);
        (v0 + v1) * 0.5
    }

    #[inline]
    fn compute_single_velocity_multiplier(&self, step: usize, body: usize) -> f64 {
        let p0 = self.positions[body][step];
        let p1 = self.positions[body][step + 1];
        compute_velocity_hdr_multiplier(&p0, &p1, self.dt)
    }
}

#[inline]
fn compute_velocity_hdr_multiplier(p0: &Vector3<f64>, p1: &Vector3<f64>, dt: f64) -> f64 {
    let delta = p1 - p0;
    let velocity = delta.norm() / dt;
    let normalized_velocity = (velocity / VELOCITY_HDR_BOOST_THRESHOLD).min(1.0);
    1.0 + normalized_velocity * (VELOCITY_HDR_BOOST_FACTOR - 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_velocity_hdr_multiplier_stationary() {
        let p0 = Vector3::new(1.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0);
        let mult = compute_velocity_hdr_multiplier(&p0, &p1, 0.001);
        assert_eq!(mult, 1.0, "Stationary body should have no HDR boost");
    }

    #[test]
    fn test_velocity_hdr_multiplier_fast() {
        let p0 = Vector3::new(0.0, 0.0, 0.0);
        let p1 = Vector3::new(1.0, 0.0, 0.0);
        let mult = compute_velocity_hdr_multiplier(&p0, &p1, 0.001);
        assert!(mult > 1.0, "Fast-moving body should have HDR boost");
        assert!(mult <= VELOCITY_HDR_BOOST_FACTOR, "Multiplier should not exceed max boost");
    }

    #[test]
    fn test_calculator_always_computes() {
        let positions = vec![
            vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(1.0, 0.0, 0.0)],
            vec![Vector3::new(0.0, 1.0, 0.0), Vector3::new(1.0, 1.0, 0.0)],
        ];
        
        let calc = VelocityHdrCalculator::new(&positions, 0.001);
        let mult = calc.compute_segment_multiplier(0, 0, 1);
        assert!(mult > 1.0, "Fast movement should boost HDR");
    }
}
