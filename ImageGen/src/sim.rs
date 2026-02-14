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

/// Record positions for `steps` iterations (no warmup -- records from step 0).
pub fn get_positions(mut bodies: Vec<Body>, steps: usize) -> FullSim {
    shift_bodies_to_com(&mut bodies);
    let dt = crate::render::constants::DEFAULT_DT;
    let mut all = vec![vec![Vector3::zeros(); steps]; bodies.len()];
    for i in 0..steps {
        for (j, b) in bodies.iter().enumerate() {
            all[j][i] = b.position;
        }
        verlet_step(&mut bodies, dt);
    }
    FullSim { positions: all }
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

/// Lightweight survival check: runs Verlet integration for `steps` iterations
/// with periodic escape checks but NO position recording (zero memory per orbit
/// beyond the 3 body structs).
pub fn survives_simulation(bodies: &[Body], steps: usize, escape_threshold: f64) -> bool {
    let mut bodies = bodies.to_vec();
    shift_bodies_to_com(&mut bodies);
    let dt = crate::render::constants::DEFAULT_DT;
    const CHECK_INTERVAL: usize = 10_000;
    for step in 0..steps {
        verlet_step(&mut bodies, dt);
        if step % CHECK_INTERVAL == 0
            && step > 0
            && is_definitely_escaping(&bodies, escape_threshold)
        {
            return false;
        }
    }
    !is_definitely_escaping(&bodies, escape_threshold)
}

/// Orbit search result
#[derive(Clone)]
#[allow(dead_code)]
pub struct TrajectoryResult {
    pub chaos: f64,
    pub equilateralness: f64,
    pub chaos_pts: usize,
    pub equil_pts: usize,
    pub total_score: usize,
    pub total_score_weighted: f64,
}

/// Streaming orbit search: prefilter -> survive full-length -> record + score -> keep best.
pub fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    steps: usize,
    cw: f64,
    ew: f64,
    th: f64,
) -> Result<(Vec<Body>, TrajectoryResult, usize, usize)> {
    info!("STAGE 1/7: Streaming orbit search over {num_sims} candidates ({steps} steps each)...");

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

    let prefilter_discarded = AtomicUsize::new(0);
    let survivors_count = AtomicUsize::new(0);
    let progress = AtomicUsize::new(0);
    let progress_chunk = (num_sims / 10).max(1);

    // Streaming search: for each orbit, prefilter -> survive -> record -> score.
    // Each thread holds at most one orbit's positions at a time (~72 MB), freed
    // immediately after scoring. reduce_with keeps only the best composite score.
    let best = many
        .par_iter()
        .enumerate()
        .filter_map(|(i, bodies)| {
            let cnt = progress.fetch_add(1, Ordering::Relaxed) + 1;
            if cnt.is_multiple_of(progress_chunk) {
                info!(
                    "   Search: {:.0}% done, {} survivors so far",
                    (cnt as f64 / num_sims as f64) * crate::render::constants::PERCENT_FACTOR,
                    survivors_count.load(Ordering::Relaxed),
                );
            }

            // Prefilter: energy + angular momentum (instant, no simulation).
            let energy = calculate_total_energy(bodies);
            let angular = calculate_total_angular_momentum(bodies).norm();
            if energy > 10.0 || angular < 10.0 {
                prefilter_discarded.fetch_add(1, Ordering::Relaxed);
                return None;
            }

            // Full-length survival check (no position recording, ~96 bytes).
            if !survives_simulation(bodies, steps, th) {
                return None;
            }
            survivors_count.fetch_add(1, Ordering::Relaxed);

            // Record positions and score (positions freed at end of closure).
            let sim = get_positions(bodies.clone(), steps);
            let m1 = bodies[0].mass;
            let m2 = bodies[1].mass;
            let m3 = bodies[2].mass;
            let chaos = non_chaoticness(m1, m2, m3, &sim.positions);
            let equil = equilateralness_score(&sim.positions);

            let composite = ew * equil - cw * chaos;
            Some((composite, i, chaos, equil))
        })
        .reduce_with(|a, b| if a.0 >= b.0 { a } else { b });

    let discarded = prefilter_discarded.load(Ordering::Relaxed);
    let total_survivors = survivors_count.load(Ordering::Relaxed);
    info!(
        "   => {total_survivors} survivors from {num_sims} candidates ({discarded} prefilter discarded)."
    );

    match best {
        Some((composite, idx, chaos, equil)) => {
            info!(
                "\n   => Chosen orbit idx {idx} with composite score {composite:.3} (chaos={chaos:.4}, equil={equil:.4})"
            );
            let result = TrajectoryResult {
                chaos,
                equilateralness: equil,
                chaos_pts: 0,
                equil_pts: 0,
                total_score: 0,
                total_score_weighted: composite,
            };
            Ok((many[idx].clone(), result, idx, num_sims - total_survivors))
        }
        None => Err(SimulationError::NoValidOrbits {
            total_attempted: num_sims,
            discarded,
            reason: format!(
                "No orbits survived {steps} steps with escape threshold {th}"
            ),
        }
        .into()),
    }
}

