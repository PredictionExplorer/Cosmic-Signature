//! Simulation module: 3-body orbits, RNG, and integrator

use nalgebra::Vector3;
use sha3::{Digest, Sha3_256};

/// Gravitational constant
pub const G: f64 = 9.8;

/// A custom RNG based on repeated Sha3 hashing
pub struct Sha3RandomByteStream {
    hasher: Sha3_256,
    seed: Vec<u8>,
    buffer: Vec<u8>,
    index: usize,
    min_mass: f64,
    max_mass: f64,
    location_range: f64,
    velocity_range: f64,
}

impl Sha3RandomByteStream {
    pub fn new(seed: &[u8], min_mass: f64, max_mass: f64, location: f64, velocity: f64) -> Self {
        let mut hasher = Sha3_256::new();
        hasher.update(seed);
        let buffer = hasher.clone().finalize_reset().to_vec();
        Self {
            hasher,
            seed: seed.to_vec(),
            buffer,
            index: 0,
            min_mass,
            max_mass,
            location_range: location,
            velocity_range: velocity,
        }
    }
    pub fn next_byte(&mut self) -> u8 {
        if self.index >= self.buffer.len() {
            self.hasher.update(&self.seed);
            self.hasher.update(&self.buffer);
            self.buffer = self.hasher.finalize_reset().to_vec();
            self.index = 0;
        }
        let b = self.buffer[self.index];
        self.index += 1;
        b
    }
    fn next_u64(&mut self) -> u64 {
        let mut bytes = [0u8; 8];
        for b in &mut bytes {
            *b = self.next_byte();
        }
        u64::from_le_bytes(bytes)
    }
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() as f64) / (u64::MAX as f64)
    }
    fn gen_range(&mut self, min: f64, max: f64) -> f64 {
        self.next_f64() * (max - min) + min
    }
    pub fn random_mass(&mut self) -> f64 {
        self.gen_range(self.min_mass, self.max_mass)
    }
    pub fn random_location(&mut self) -> f64 {
        self.gen_range(-self.location_range, self.location_range)
    }
    pub fn random_velocity(&mut self) -> f64 {
        self.gen_range(-self.velocity_range, self.velocity_range)
    }
}

/// Single Body in the 3-body sim
#[derive(Clone)]
pub struct Body {
    pub mass: f64,
    pub position: Vector3<f64>,
    pub velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
}
impl Body {
    pub fn new(mass: f64, pos: Vector3<f64>, vel: Vector3<f64>) -> Self {
        Self { mass, position: pos, velocity: vel, acceleration: Vector3::zeros() }
    }
    fn reset_acceleration(&mut self) {
        self.acceleration = Vector3::zeros();
    }
    fn update_acceleration(&mut self, om: f64, op: &Vector3<f64>) {
        let dir = self.position - *op;
        let d = dir.norm();
        if d > 1e-10 {
            self.acceleration += -G * om * dir / d.powi(3);
        }
    }
}

/// Basic Verlet step
fn verlet_step(bodies: &mut [Body], dt: f64) {
    let pos: Vec<_> = bodies.iter().map(|b| b.position).collect();
    let mass: Vec<_> = bodies.iter().map(|b| b.mass).collect();
    for (i, b) in bodies.iter_mut().enumerate() {
        b.reset_acceleration();
        for (j, &op) in pos.iter().enumerate() {
            if i != j {
                b.update_acceleration(mass[j], &op)
            }
        }
    }
    for b in bodies.iter_mut() {
        b.position += b.velocity * dt + 0.5 * b.acceleration * dt * dt;
    }
    let new_pos: Vec<_> = bodies.iter().map(|b| b.position).collect();
    for (i, b) in bodies.iter_mut().enumerate() {
        b.reset_acceleration();
        for (j, &op) in new_pos.iter().enumerate() {
            if i != j {
                b.update_acceleration(mass[j], &op)
            }
        }
    }
    for b in bodies.iter_mut() {
        b.velocity += b.acceleration * dt;
    }
}

/// Recorded positions + final state
pub struct FullSim {
    pub positions: Vec<Vec<Vector3<f64>>>,
    #[allow(dead_code)]
    pub final_bodies: Vec<Body>,
}

/// warmup + record
pub fn get_positions(mut bodies: Vec<Body>, steps: usize) -> FullSim {
    // Ensure the initial state is expressed in the centre-of-mass (COM) frame
    shift_bodies_to_com(&mut bodies);
    let dt = crate::render::constants::DEFAULT_DT;
    for _ in 0..steps {
        verlet_step(&mut bodies, dt);
    }
    let mut b2 = bodies.clone();
    let mut all = vec![vec![Vector3::zeros(); steps]; bodies.len()];
    for i in 0..steps {
        for (j, b) in b2.iter().enumerate() {
            all[j][i] = b.position;
        }
        verlet_step(&mut b2, dt);
    }
    FullSim { positions: all, final_bodies: b2 }
}

/// Configuration for gravitational time dilation
#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct TimeDilationConfig {
    /// Whether time dilation is enabled
    pub enabled: bool,
    /// Minimum timestep (never go below this)
    pub min_dt_factor: f64,
    /// Distance threshold for full dilation effect
    pub threshold_distance: f64,
    /// Dilation strength (higher = more extreme slowdown)
    pub strength: f64,
}

impl Default for TimeDilationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            min_dt_factor: 0.1,    // Never go below 10% of base dt
            threshold_distance: 0.5, // Start dilating when closer than this
            strength: 2.0,          // Dilation intensity
        }
    }
}

/// Calculate adaptive timestep based on minimum body separation
/// Implements gravitational time dilation: slower timesteps near close encounters
#[allow(dead_code)]
fn adaptive_dt(bodies: &[Body], base_dt: f64, config: &TimeDilationConfig) -> f64 {
    if !config.enabled {
        return base_dt;
    }

    // Find minimum separation
    let mut min_dist = f64::MAX;
    let n = bodies.len();
    for i in 0..n {
        for j in (i + 1)..n {
            let dist = (bodies[i].position - bodies[j].position).norm();
            min_dist = min_dist.min(dist);
        }
    }

    // Apply time dilation: slower timesteps when bodies are closer
    // Formula: dt_factor = max(min_factor, threshold / (dist + small))^strength
    if min_dist < config.threshold_distance {
        let ratio = min_dist / config.threshold_distance;
        let dilation_factor = ratio.powf(config.strength);
        let clamped_factor = dilation_factor.max(config.min_dt_factor);
        base_dt * clamped_factor
    } else {
        base_dt
    }
}

/// Warmup + record with gravitational time dilation
/// Creates denser sampling near close encounters
#[allow(dead_code)]
pub fn get_positions_with_time_dilation(
    mut bodies: Vec<Body>,
    target_steps: usize,
    config: &TimeDilationConfig,
) -> FullSim {
    shift_bodies_to_com(&mut bodies);
    let base_dt = crate::render::constants::DEFAULT_DT;

    // Warmup phase with adaptive dt
    for _ in 0..target_steps {
        let dt = adaptive_dt(&bodies, base_dt, config);
        verlet_step(&mut bodies, dt);
    }

    let mut b2 = bodies.clone();
    let mut all = vec![vec![Vector3::zeros(); target_steps]; bodies.len()];

    // Recording phase with adaptive dt
    // We'll use fixed output intervals but variable simulation steps
    for i in 0..target_steps {
        for (j, b) in b2.iter().enumerate() {
            all[j][i] = b.position;
        }

        // Calculate adaptive timestep
        let dt = adaptive_dt(&b2, base_dt, config);
        
        // Take multiple small steps if we're in a close encounter
        // This gives us finer detail in interesting regions
        let num_substeps = (base_dt / dt).ceil() as usize;
        let actual_dt = base_dt / num_substeps as f64;
        
        for _ in 0..num_substeps {
            verlet_step(&mut b2, actual_dt);
        }
    }

    FullSim { positions: all, final_bodies: b2 }
}

/// Calculate the number of additional samples to take at each timestep
/// based on proximity (for enhanced sampling during close encounters)
#[allow(dead_code)]
pub fn calculate_sample_density(bodies: &[Body], base_density: usize, config: &TimeDilationConfig) -> usize {
    if !config.enabled {
        return base_density;
    }

    // Find minimum separation
    let mut min_dist = f64::MAX;
    let n = bodies.len();
    for i in 0..n {
        for j in (i + 1)..n {
            let dist = (bodies[i].position - bodies[j].position).norm();
            min_dist = min_dist.min(dist);
        }
    }

    // More samples when bodies are closer
    if min_dist < config.threshold_distance {
        let ratio = min_dist / config.threshold_distance;
        let density_boost = (1.0 / ratio.max(0.1)).powf(config.strength / 2.0);
        let boosted = (base_density as f64 * density_boost).round() as usize;
        boosted.clamp(base_density, base_density * 10) // Cap at 10x base
    } else {
        base_density
    }
}

/// Shift to COM
pub fn shift_bodies_to_com(b: &mut [Body]) {
    let mt: f64 = b.iter().map(|x| x.mass).sum();
    if mt < 1e-14 {
        return;
    }
    let mut rc = Vector3::zeros();
    for x in b.iter() {
        rc += x.mass * x.position;
    }
    rc /= mt;
    let mut vc = Vector3::zeros();
    for x in b.iter() {
        vc += x.mass * x.velocity;
    }
    vc /= mt;
    for x in b.iter_mut() {
        x.position -= rc;
        x.velocity -= vc;
    }
}

/// Escaping check
#[allow(dead_code)]
pub fn is_definitely_escaping(b: &[Body], th: f64) -> bool {
    let mut loc = b.to_vec();
    shift_bodies_to_com(&mut loc);
    let n = loc.len(); // Cache length to avoid repeated calls
    for i in 0..n {
        let bi = &loc[i];
        let kin =
            crate::render::constants::KINETIC_ENERGY_FACTOR * bi.mass * bi.velocity.norm_squared();
        let mut pot = 0.0;
        for j in 0..n {
            if i != j {
                let bj = &loc[j];
                let d = (bi.position - bj.position).norm();
                if d > 1e-12 {
                    pot += -G * bi.mass * bj.mass / d;
                }
            }
        }
        if kin + pot > th {
            return true;
        }
    }
    false
}

/// Result from Borda trajectory selection.
///
/// Contains both raw metric scores and Borda ranking points.
#[derive(Clone)]
#[allow(dead_code)]
pub struct TrajectoryResult {
    /// Chaos/regularity score (lower = more regular)
    pub chaos: f64,
    /// Equilateralness score (higher = more equilateral triangles)
    pub equilateralness: f64,
    /// Golden ratio composition score
    pub golden_ratio: f64,
    /// Negative space quality score
    pub negative_space: f64,
    /// Symmetry score
    pub symmetry: f64,
    /// Density balance score
    pub density: f64,
    /// Borda points for chaos metric
    pub chaos_pts: usize,
    /// Borda points for equilateralness metric
    pub equil_pts: usize,
    /// Total unweighted Borda score
    pub total_score: usize,
    /// Total weighted Borda score (used for final ranking)
    pub total_score_weighted: f64,
}

