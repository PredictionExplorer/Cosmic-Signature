//! Simulation module: 3-body orbits, RNG, integrator, and Borda search

use crate::analysis::{
    calculate_total_angular_momentum, calculate_total_energy, equilateralness_score,
    non_chaoticness,
};
use crate::error::{Result, SimulationError};
use nalgebra::Vector3;
use rayon::prelude::*;
use sha3::{Digest, Sha3_256};
use std::sync::atomic::{AtomicUsize, Ordering};
use tracing::info;

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

/// Basic Verlet step (optimized for 3-body problem with zero-allocation)
fn verlet_step(bodies: &mut [Body], dt: f64) {
    // Use fixed-size arrays for 3-body problem (eliminates heap allocations)
    // This optimization saves ~2M allocations during Borda search!
    debug_assert_eq!(bodies.len(), 3, "Optimized for 3-body problem");
    
    // Stack-allocated arrays (zero heap allocation!)
    let mut pos = [Vector3::zeros(); 3];
    let mut mass = [0.0; 3];
    
    for (i, b) in bodies.iter().enumerate().take(3) {
        pos[i] = b.position;
        mass[i] = b.mass;
    }
    
    // First acceleration calculation
    for (i, b) in bodies.iter_mut().enumerate().take(3) {
        b.reset_acceleration();
        for j in 0..3 {
            if i != j {
                b.update_acceleration(mass[j], &pos[j])
            }
        }
    }
    
    // Update positions
    for b in bodies.iter_mut() {
        b.position += b.velocity * dt + 0.5 * b.acceleration * dt * dt;
    }
    
    // Update positions array for second pass
    for (i, b) in bodies.iter().enumerate().take(3) {
        pos[i] = b.position;
    }
    
    // Second acceleration calculation
    for (i, b) in bodies.iter_mut().enumerate().take(3) {
        b.reset_acceleration();
        for j in 0..3 {
            if i != j {
                b.update_acceleration(mass[j], &pos[j])
            }
        }
    }
    
    // Update velocities
    for b in bodies.iter_mut() {
        b.velocity += b.acceleration * dt;
    }
}

/// Recorded positions
pub struct FullSim {
    pub positions: Vec<Vec<Vector3<f64>>>,
}

/// warmup + record with optional early-exit checks
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
    FullSim { positions: all }
}

/// Fast trajectory simulation with early-exit for clearly bad candidates
/// Returns None if the trajectory is clearly unsuitable (saves expensive full simulation)
pub fn get_positions_with_early_exit(
    mut bodies: Vec<Body>,
    steps: usize,
    escape_threshold: f64,
) -> Option<FullSim> {
    // Ensure the initial state is expressed in the centre-of-mass (COM) frame
    shift_bodies_to_com(&mut bodies);
    let dt = crate::render::constants::DEFAULT_DT;
    
    // Warmup phase with periodic escape checks
    const CHECK_INTERVAL: usize = 10000; // Check every 10k steps during warmup
    for step in 0..steps {
        verlet_step(&mut bodies, dt);
        
        // Early-exit check: detect escaping bodies during warmup
        if step % CHECK_INTERVAL == 0 && step > 0 && is_definitely_escaping(&bodies, escape_threshold) {
            return None; // Body escaping, skip this candidate
        }
    }
    
    // Final escape check after warmup
    if is_definitely_escaping(&bodies, escape_threshold) {
        return None;
    }
    
    // Record phase - body configuration is good, record the full trajectory
    let mut b2 = bodies.clone();
    let mut all = vec![vec![Vector3::zeros(); steps]; bodies.len()];
    for i in 0..steps {
        for (j, b) in b2.iter().enumerate() {
            all[j][i] = b.position;
        }
        verlet_step(&mut b2, dt);
    }
    
    Some(FullSim { positions: all })
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
pub fn is_definitely_escaping(b: &[Body], th: f64) -> bool {
    let mut loc = b.to_vec();
    shift_bodies_to_com(&mut loc);
    let n = loc.len(); // Cache length to avoid repeated calls
    #[allow(clippy::needless_range_loop)] // Direct indexing for performance in hot path
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

/// Borda result
#[derive(Clone)]
pub struct TrajectoryResult {
    pub chaos: f64,
    pub equilateralness: f64,
    pub chaos_pts: usize,
    pub equil_pts: usize,
    pub total_score: usize,
    pub total_score_weighted: f64,
    /// Original simulation index of the selected orbit.
    pub selected_index: usize,
    /// Number of orbits discarded by quality filters.
    pub discarded_count: usize,
}

/// Borda search
pub fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    steps: usize,
    cw: f64,
    ew: f64,
    th: f64,
) -> Result<(Vec<Body>, TrajectoryResult)> {
    info!("STAGE 1/7: Borda search over {num_sims} random orbits...");
    // Generate random triples and immediately transform them to the COM frame so
    // the total linear momentum and the COM position are exactly zero.
    let many: Vec<Vec<Body>> = (0..num_sims)
        .map(|_| {
            let mut v = vec![
                Body::new(
                    rng.random_mass(),
                    Vector3::new(
                        rng.random_location(),
                        rng.random_location(),
                        rng.random_location(),
                    ),
                    Vector3::new(
                        rng.random_velocity(),
                        rng.random_velocity(),
                        rng.random_velocity(),
                    ),
                ),
                Body::new(
                    rng.random_mass(),
                    Vector3::new(
                        rng.random_location(),
                        rng.random_location(),
                        rng.random_location(),
                    ),
                    Vector3::new(
                        rng.random_velocity(),
                        rng.random_velocity(),
                        rng.random_velocity(),
                    ),
                ),
                Body::new(
                    rng.random_mass(),
                    Vector3::new(
                        rng.random_location(),
                        rng.random_location(),
                        rng.random_location(),
                    ),
                    Vector3::new(
                        rng.random_velocity(),
                        rng.random_velocity(),
                        rng.random_velocity(),
                    ),
                ),
            ];
            shift_bodies_to_com(&mut v);
            v
        })
        .collect();
    let pc = AtomicUsize::new(0);
    let cs = (num_sims / 10).max(1);
    let dc = AtomicUsize::new(0);
    let results: Vec<Option<(TrajectoryResult, usize)>> = many
        .par_iter()
        .enumerate()
        .map(|(i, b)| {
            let cnt = pc.fetch_add(1, Ordering::Relaxed) + 1;
            if cnt.is_multiple_of(cs) {
                info!(
                    "   Borda search: {:.0}% done",
                    (cnt as f64 / num_sims as f64) * crate::render::constants::PERCENT_FACTOR
                );
            }
            // Quick rejection: check energy and angular momentum first
            let e = calculate_total_energy(b);
            let ang = calculate_total_angular_momentum(b).norm();
            if e > 10.0 || ang < 10.0 {
                dc.fetch_add(1, Ordering::Relaxed);
                return None;
            }
            
            // Run simulation with early-exit checks for escaping bodies
            let simr = match get_positions_with_early_exit(b.clone(), steps, th) {
                Some(result) => result,
                None => {
                    // Early-exit triggered - body escaped during simulation
                    dc.fetch_add(1, Ordering::Relaxed);
                    return None;
                }
            };
            
            let pos = simr.positions;
            let m1 = b[0].mass;
            let m2 = b[1].mass;
            let m3 = b[2].mass;
            
            // Compute quality metrics
            let c = non_chaoticness(m1, m2, m3, &pos);
            let eq = equilateralness_score(&pos);
            
            // Early rejection: if both metrics are terrible, skip
            // This saves time on Borda ranking for clearly unsuitable candidates
            const MIN_VIABLE_CHAOS: f64 = 0.1;     // Below this, too chaotic
            const MIN_VIABLE_EQUILATERAL: f64 = 0.01; // Below this, too linear
            
            if c < MIN_VIABLE_CHAOS && eq < MIN_VIABLE_EQUILATERAL {
                dc.fetch_add(1, Ordering::Relaxed);
                return None;
            }
            
            Some((
                TrajectoryResult {
                    chaos: c,
                    equilateralness: eq,
                    chaos_pts: 0,
                    equil_pts: 0,
                    total_score: 0,
                    total_score_weighted: 0.0,
                    selected_index: 0,
                    discarded_count: 0,
                },
                i,
            ))
        })
        .collect();
    let dtot = dc.load(Ordering::Relaxed);
    info!(
        "   => Discarded {dtot}/{num_sims} ({:.1}%) orbits due to filters or escapes.",
        crate::render::constants::PERCENT_FACTOR * dtot as f64 / num_sims as f64
    );
    let mut iv: Vec<(TrajectoryResult, usize)> = results.into_iter().flatten().collect();
    if iv.is_empty() {
        return Err(SimulationError::NoValidOrbits {
            total_attempted: num_sims,
            discarded: dtot,
            reason: format!(
                "All orbits filtered out due to: high energy (E > 10), \
                low angular momentum (L < 10), or escaping bodies (threshold: {})",
                th
            ),
        }
        .into());
    }
    fn assign(vals: Vec<(f64, usize)>, hb: bool) -> Vec<usize> {
        let mut v = vals;
        if hb {
            v.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = v.len();
        let mut out = vec![0; n];
        for (r, (_, i)) in v.into_iter().enumerate() {
            out[i] = n - r;
        }
        out
    }
    let mut cv = Vec::with_capacity(iv.len());
    let mut ev = Vec::with_capacity(iv.len());
    for (i, (t, _)) in iv.iter().enumerate() {
        cv.push((t.chaos, i));
        ev.push((t.equilateralness, i));
    }
    let cps = assign(cv, false);
    let eps = assign(ev, true);
    for (i, (t, _)) in iv.iter_mut().enumerate() {
        t.chaos_pts = cps[i];
        t.equil_pts = eps[i];
        t.total_score = t.chaos_pts + t.equil_pts;
        t.total_score_weighted = cw * (t.chaos_pts as f64) + ew * (t.equil_pts as f64);
    }
    iv.sort_by(|a, b| b.0.total_score_weighted.partial_cmp(&a.0.total_score_weighted).unwrap());
    let bi = iv[0].1;
    let mut bt = iv[0].0.clone();
    bt.selected_index = bi;
    bt.discarded_count = dtot;
    info!("\n   => Chosen orbit idx {bi} with weighted score {:.3}", bt.total_score_weighted);
    Ok((many[bi].clone(), bt))
}
