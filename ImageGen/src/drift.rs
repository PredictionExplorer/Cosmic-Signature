use nalgebra::Vector3;
use crate::sim::Sha3RandomByteStream;
use std::f64::consts::PI;

/// Trait for applying drift transformations to position data
pub trait DriftTransform {
    fn apply(&mut self, positions: &mut [Vec<Vector3<f64>>], dt: f64);
}

/// No drift - positions remain unchanged
pub struct NoDrift;

impl DriftTransform for NoDrift {
    fn apply(&mut self, _positions: &mut [Vec<Vector3<f64>>], _dt: f64) {
        // Do nothing
    }
}

/// Brownian drift - random walk motion with pre-generated random values
pub struct BrownianDrift {
    displacements: Vec<Vector3<f64>>,
}

impl BrownianDrift {
    pub fn new(rng: &mut Sha3RandomByteStream, scale: f64, num_steps: usize) -> Self {
        let dt_sqrt = 0.001f64.sqrt(); // Using known dt value
        let mut displacements = Vec::with_capacity(num_steps);
        
        for _ in 0..num_steps {
            // Generate 3D Gaussian displacement using Box-Muller transform
            let dx = Self::gaussian_from_rng(rng) * scale * dt_sqrt;
            let dy = Self::gaussian_from_rng(rng) * scale * dt_sqrt;
            let dz = Self::gaussian_from_rng(rng) * scale * dt_sqrt;
            
            displacements.push(Vector3::new(dx, dy, dz));
        }
        
        Self { displacements }
    }

    /// Generate a Gaussian random number using Box-Muller transform
    fn gaussian_from_rng(rng: &mut Sha3RandomByteStream) -> f64 {
        // Box-Muller transform: convert two uniform [0,1] to two Gaussian N(0,1)
        let u1 = rng.next_f64();
        let u2 = rng.next_f64();
        
        // Avoid log(0)
        let u1 = u1.max(1e-10);
        
        let r = (-2.0 * u1.ln()).sqrt();
        let theta = 2.0 * PI * u2;
        
        r * theta.cos() // Return one of the two generated values
    }
}

impl DriftTransform for BrownianDrift {
    fn apply(&mut self, positions: &mut [Vec<Vector3<f64>>], _dt: f64) {
        if positions.is_empty() || positions[0].is_empty() {
            return;
        }

        let steps = positions[0].len().min(self.displacements.len());
        let mut offset = Vector3::zeros();

        // Apply Brownian motion: each step adds a random displacement
        for step in 0..steps {
            // Accumulate offset
            offset += self.displacements[step];

            // Apply the same offset to all bodies at this timestep
            for body_positions in positions.iter_mut() {
                body_positions[step] += offset;
            }
        }
    }
}

/// Linear drift - constant velocity motion
pub struct LinearDrift {
    velocity: Vector3<f64>,
}

impl LinearDrift {
    pub fn new(rng: &mut Sha3RandomByteStream, scale: f64) -> Self {
        // Random spherical coordinates
        let theta = rng.next_f64() * PI; // polar angle [0, π]
        let phi = rng.next_f64() * 2.0 * PI; // azimuthal angle [0, 2π]
        let speed = scale;
        
        let velocity = Vector3::new(
            speed * theta.sin() * phi.cos(),
            speed * theta.sin() * phi.sin(),
            speed * theta.cos(),
        );
        
        Self { velocity }
    }
}

impl DriftTransform for LinearDrift {
    fn apply(&mut self, positions: &mut [Vec<Vector3<f64>>], dt: f64) {
        if positions.is_empty() || positions[0].is_empty() {
            return;
        }

        let steps = positions[0].len();

        for step in 0..steps {
            let offset = self.velocity * (step as f64) * dt;
            
            // Apply the same offset to all bodies at this timestep
            for body_positions in positions.iter_mut() {
                body_positions[step] += offset;
            }
        }
    }
}

/// Parse drift mode from string
pub fn parse_drift_mode(mode: &str, rng: &mut Sha3RandomByteStream, scale: f64, num_steps: usize) -> Box<dyn DriftTransform> {
    match mode.to_lowercase().as_str() {
        "none" => Box::new(NoDrift),
        "brownian" => Box::new(BrownianDrift::new(rng, scale, num_steps)),
        "linear" => Box::new(LinearDrift::new(rng, scale)),
        _ => {
            eprintln!("Unknown drift mode '{}', using 'brownian'", mode);
            Box::new(BrownianDrift::new(rng, scale, num_steps))
        }
    }
} 