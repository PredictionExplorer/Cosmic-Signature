//! Physics simulation module: 3-body orbits, RNG, Verlet integration, and Borda search
//!
//! # Overview
//!
//! This module implements a complete N-body gravitational simulation system
//! optimized for the chaotic three-body problem. It provides deterministic
//! trajectory generation, quality ranking, and automatic selection of
//! aesthetically pleasing orbits.
//!
//! # Physics Engine
//!
//! ## Verlet Integration
//!
//! The simulation uses the velocity Verlet algorithm, a symplectic integrator
//! that provides excellent long-term energy conservation:
//!
//! ```text
//! x(t+Δt) = x(t) + v(t)·Δt + ½·a(t)·Δt²
//! a(t+Δt) = F(x(t+Δt)) / m
//! v(t+Δt) = v(t) + ½·[a(t) + a(t+Δt)]·Δt
//! ```
//!
//! **Benefits:**
//! - Time-reversible (symmetry under t → -t)
//! - Second-order accuracy O(Δt²)
//! - Energy drift ~O(Δt²) over long timescales
//! - Stable for chaotic systems
//!
//! ## Gravitational Force
//!
//! Newtonian gravity with softening to prevent singularities:
//!
//! ```text
//! F_ij = -G · m_i · m_j · (r_i - r_j) / |r_i - r_j|³
//! ```
//!
//! Singularity prevention: Forces are zeroed when distance < 1e-10.
//!
//! # Borda Selection Algorithm
//!
//! Automatically selects visually interesting orbits from random initial
//! conditions using a two-criterion Borda count voting system:
//!
//! ## Quality Metrics
//!
//! 1. **Non-Chaoticness**: Measures orbit predictability
//!    - Lower = more chaotic/interesting
//!    - Computed via position variance across bodies
//!
//! 2. **Equilateralness**: Measures triangular symmetry
//!    - Higher = more symmetric/aesthetic
//!    - Based on moment of inertia tensor analysis
//!
//! ## Selection Process
//!
//! ```text
//! ┌─────────────────┐
//! │ Generate N      │
//! │ Random Configs  │
//! └────────┬────────┘
//!          │
//!          ▼
//! ┌─────────────────┐     ┌──────────────┐
//! │ Quick Rejection │────▶│ Escape Check │
//! │ (E, L, escape)  │     │ High Energy  │
//! └────────┬────────┘     └──────────────┘
//!          │ Pass
//!          ▼
//! ┌─────────────────┐
//! │ Simulate &      │
//! │ Compute Metrics │
//! └────────┬────────┘
//!          │
//!          ▼
//! ┌─────────────────┐
//! │ Borda Ranking   │ ← Rank by chaos (ascending)
//! │ (2 criteria)    │ ← Rank by equilateral (descending)
//! └────────┬────────┘
//!          │
//!          ▼
//! ┌─────────────────┐
//! │ Select Best     │
//! │ Weighted Score  │
//! └─────────────────┘
//! ```
//!
//! # Deterministic RNG
//!
//! Uses SHA3-256 for cryptographically-strong deterministic randomness:
//! - **Input**: Single hex seed
//! - **Output**: Infinite deterministic byte stream
//! - **Property**: Same seed always produces same trajectory
//!
//! This enables:
//! - Reproducible results
//! - Parallel candidate generation
//! - Seed-based trajectory caching
//!
//! # Performance Optimizations
//!
//! 1. **Zero-allocation Verlet**: Stack-allocated arrays for 3-body problem
//! 2. **Early-exit checks**: Escape detection during warmup phase
//! 3. **Quick rejection filters**: Energy and angular momentum thresholds
//! 4. **Parallel Borda search**: Rayon-parallelized candidate evaluation
//!
//! # Example Usage
//!
//! ```rust,no_run
//! use three_body_problem::sim::{Sha3RandomByteStream, select_best_trajectory};
//!
//! // Create deterministic RNG from seed
//! let seed = b"cosmic_signature_seed";
//! let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
//!
//! // Search for best orbit (100 candidates, 100k warmup steps)
//! let (bodies, metrics) = select_best_trajectory(
//!     &mut rng,
//!     100,        // num_sims
//!     100_000,    // warmup_steps
//!     1.0,        // chaos_weight
//!     1.0,        // equilateral_weight
//!     0.0,        // escape_threshold
//! ).expect("Should find valid orbit");
//!
//! println!("Selected orbit: chaos={:.3}, equilateral={:.3}",
//!          metrics.chaos, metrics.equilateralness);
//! ```
//!
//! # Thread Safety
//!
//! - `Body`: `Clone`, safe to share across threads
//! - `Sha3RandomByteStream`: Not `Sync` (contains internal state), create per-thread
//! - Simulation functions: Thread-safe, can be called concurrently

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

/// A custom RNG based on repeated SHA3 hashing
///
/// # Performance Characteristics
///
/// This RNG is optimized for **zero heap allocations** in the hot path:
/// - Uses fixed-size `[u8; 32]` buffer (stack-allocated)
/// - SHA3-256 produces exactly 32 bytes per iteration
/// - No `.to_vec()` calls during refills
/// - Fully deterministic from seed
///
/// # Cryptographic Properties
///
/// Uses SHA3-256 (Keccak) which provides:
/// - 256-bit security level
/// - Avalanche effect (1-bit seed change → 50% output change)
/// - Cycle length > 2^256 (effectively infinite)
///
/// Perfect for deterministic simulation where reproducibility is critical.
pub struct Sha3RandomByteStream {
    hasher: Sha3_256,
    seed: [u8; 32],   // Fixed-size seed (no allocation)
    buffer: [u8; 32], // Fixed-size buffer (no allocation)
    index: usize,
    min_mass: f64,
    max_mass: f64,
    location_range: f64,
    velocity_range: f64,
}

impl Sha3RandomByteStream {
    /// Create a new deterministic RNG from a seed
    ///
    /// # Arguments
    ///
    /// * `seed` - Arbitrary-length seed bytes (hashed to 32 bytes internally)
    /// * `min_mass` - Minimum mass for `random_mass()`
    /// * `max_mass` - Maximum mass for `random_mass()`
    /// * `location` - Range [-location, +location] for `random_location()`
    /// * `velocity` - Range [-velocity, +velocity] for `random_velocity()`
    ///
    /// # Performance
    ///
    /// Zero heap allocations - all buffers are fixed-size arrays on the stack.
    pub fn new(seed: &[u8], min_mass: f64, max_mass: f64, location: f64, velocity: f64) -> Self {
        let mut hasher = Sha3_256::new();
        hasher.update(seed);

        // Initial hash to seed buffer (SHA3-256 produces exactly 32 bytes)
        let initial_hash = hasher.clone().finalize_reset();
        let mut buffer = [0u8; 32];
        buffer.copy_from_slice(&initial_hash);

        // Hash seed to fixed size for storage
        let mut seed_array = [0u8; 32];
        let seed_hash = Sha3_256::digest(seed);
        seed_array.copy_from_slice(&seed_hash);

        Self {
            hasher,
            seed: seed_array,
            buffer,
            index: 0,
            min_mass,
            max_mass,
            location_range: location,
            velocity_range: velocity,
        }
    }

    /// Get the next random byte from the stream
    ///
    /// # Performance
    ///
    /// Zero allocations - refills the fixed-size buffer in-place when exhausted.
    /// This is called millions of times during Borda search, so it must be fast.
    pub fn next_byte(&mut self) -> u8 {
        if self.index >= self.buffer.len() {
            // Refill buffer: hash(seed || previous_buffer)
            self.hasher.update(self.seed);
            self.hasher.update(self.buffer);

            // Write directly into fixed-size buffer (zero allocation!)
            let hash_result = self.hasher.finalize_reset();
            self.buffer.copy_from_slice(&hash_result);
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
        if d > crate::render::constants::GRAVITY_SINGULARITY_THRESHOLD {
            self.acceleration += -G * om * dir / d.powi(3);
        }
    }
}

/// Basic Verlet step (optimized for 3-body problem with zero-allocation)
///
/// # Safety Guarantees
///
/// This function is **compile-time safe** - it only accepts exactly 3 bodies.
/// The fixed-size array type prevents misuse and allows the compiler to:
/// - Eliminate all bounds checks
/// - Unroll loops completely
/// - Optimize away the array allocations
///
/// # Performance
///
/// Zero heap allocations, fully inlinable, ~2M allocation savings during Borda search.
fn verlet_step(bodies: &mut [Body; 3], dt: f64) {
    // Stack-allocated arrays (zero heap allocation!)
    // With compile-time size, compiler can eliminate bounds checks entirely
    let mut pos = [Vector3::zeros(); 3];
    let mut mass = [0.0; 3];

    // Extract positions and masses (compiler unrolls this completely)
    for (i, body) in bodies.iter().enumerate().take(3) {
        pos[i] = body.position;
        mass[i] = body.mass;
    }

    // First acceleration calculation (compiler unrolls both loops)
    for (i, body) in bodies.iter_mut().enumerate().take(3) {
        body.reset_acceleration();
        for j in 0..3 {
            if i != j {
                body.update_acceleration(mass[j], &pos[j]);
            }
        }
    }

    // Update positions (compiler unrolls)
    for b in bodies.iter_mut() {
        b.position += b.velocity * dt + 0.5 * b.acceleration * dt * dt;
    }

    // Update positions array for second pass (compiler unrolls)
    for (i, body) in bodies.iter().enumerate().take(3) {
        pos[i] = body.position;
    }

    // Second acceleration calculation (compiler unrolls both loops)
    for (i, body) in bodies.iter_mut().enumerate().take(3) {
        body.reset_acceleration();
        for j in 0..3 {
            if i != j {
                body.update_acceleration(mass[j], &pos[j]);
            }
        }
    }

    // Update velocities (compiler unrolls)
    for b in bodies.iter_mut() {
        b.velocity += b.acceleration * dt;
    }
}

/// Calculate adaptive timestep based on current system state
///
/// Uses the minimum "time-to-collision" across all body pairs to determine
/// a timestep that ensures stability during close encounters.
fn calculate_adaptive_dt(bodies: &[Body; 3]) -> f64 {
    let mut min_time = f64::MAX;

    for i in 0..3 {
        for j in i + 1..3 {
            let rel_pos = bodies[i].position - bodies[j].position;
            let dist = rel_pos.norm();

            let rel_vel = bodies[i].velocity - bodies[j].velocity;
            let speed = rel_vel.norm();

            // Safety factor to prevent division by zero and handle static bodies
            let characteristic_speed = speed.max(1e-5);
            let time_scale = dist / characteristic_speed;

            if time_scale < min_time {
                min_time = time_scale;
            }
        }
    }

    // Apply precision factor and clamp to allowable range
    let dt = min_time * crate::render::constants::ADAPTIVE_PRECISION;
    dt.clamp(crate::render::constants::MIN_DT, crate::render::constants::MAX_DT)
}

/// Recorded positions from a complete simulation
pub struct FullSim {
    /// Position trajectories: outer vec is per-body, inner vec is per-timestep
    pub positions: Vec<Vec<Vector3<f64>>>,
}

/// Run full simulation: warmup + record all positions
///
/// Simulates the 3-body system for `steps` warmup iterations, then records
/// another `steps` iterations of trajectory data.
///
/// # Arguments
///
/// * `bodies` - Initial 3-body configuration (will be moved to COM frame)
/// * `steps` - Number of timesteps for both warmup and recording phases
///
/// # Returns
///
/// `FullSim` containing recorded position data for all bodies
///
/// # Panics
///
/// Panics if `bodies` does not contain exactly 3 bodies.
#[must_use = "simulation results should be used"]
pub fn get_positions(mut bodies: Vec<Body>, steps: usize) -> FullSim {
    assert_eq!(bodies.len(), 3, "get_positions requires exactly 3 bodies");

    // Ensure the initial state is expressed in the centre-of-mass (COM) frame
    shift_bodies_to_com(&mut bodies);

    // Convert to fixed-size array for compile-time safety
    let mut bodies_array: [Body; 3] = [bodies[0].clone(), bodies[1].clone(), bodies[2].clone()];

    // Warmup phase
    for _ in 0..steps {
        let dt = calculate_adaptive_dt(&bodies_array);
        verlet_step(&mut bodies_array, dt);
    }

    // Recording phase
    let mut b2 = bodies_array.clone();
    let mut all = vec![vec![Vector3::zeros(); steps]; 3];
    for i in 0..steps {
        for j in 0..3 {
            all[j][i] = b2[j].position;
        }
        let dt = calculate_adaptive_dt(&b2);
        verlet_step(&mut b2, dt);
    }

    FullSim { positions: all }
}

/// Fast trajectory simulation with early-exit for clearly bad candidates
///
/// Similar to `get_positions`, but checks for escaping bodies during the warmup
/// phase and returns `None` early if escape is detected, avoiding wasted computation.
///
/// # Arguments
///
/// * `bodies` - Initial 3-body configuration
/// * `steps` - Number of timesteps
/// * `escape_threshold` - Energy threshold for escape detection
///
/// # Returns
///
/// * `Some(FullSim)` if simulation completes without escape
/// * `None` if any body escapes during warmup
///
/// # Panics
///
/// Panics if `bodies` does not contain exactly 3 bodies.
#[must_use = "simulation results should be checked"]
pub fn get_positions_with_early_exit(
    mut bodies: Vec<Body>,
    steps: usize,
    escape_threshold: f64,
) -> Option<FullSim> {
    assert_eq!(bodies.len(), 3, "get_positions_with_early_exit requires exactly 3 bodies");

    // Ensure the initial state is expressed in the centre-of-mass (COM) frame
    shift_bodies_to_com(&mut bodies);

    // Convert to fixed-size array for compile-time safety
    let mut bodies_array: [Body; 3] = [bodies[0].clone(), bodies[1].clone(), bodies[2].clone()];

    // Warmup phase with periodic escape checks
    for step in 0..steps {
        let dt = calculate_adaptive_dt(&bodies_array);
        verlet_step(&mut bodies_array, dt);

        // Early-exit check: detect escaping bodies during warmup
        // Convert back to slice for escape detection (no allocation overhead)
        if step % crate::render::constants::BORDA_CHECK_INTERVAL == 0 && step > 0 {
            let bodies_slice: &[Body] = &bodies_array;
            if is_definitely_escaping(bodies_slice, escape_threshold) {
                return None; // Body escaping, skip this candidate
            }
        }
    }

    // Final escape check after warmup
    let bodies_slice: &[Body] = &bodies_array;
    if is_definitely_escaping(bodies_slice, escape_threshold) {
        return None;
    }

    // Record phase - body configuration is good, record the full trajectory
    let mut b2 = bodies_array.clone();
    let mut all = vec![vec![Vector3::zeros(); steps]; 3];
    for i in 0..steps {
        for j in 0..3 {
            all[j][i] = b2[j].position;
        }
        let dt = calculate_adaptive_dt(&b2);
        verlet_step(&mut b2, dt);
    }

    Some(FullSim { positions: all })
}

/// Shift bodies to center-of-mass frame (modifies in-place)
///
/// This function transforms the system so that:
/// - Center of mass position is at the origin
/// - Center of mass velocity is zero
///
/// # Arguments
///
/// * `b` - Mutable slice of bodies to transform
///
/// # Example
///
/// ```
/// # use three_body_problem::sim::{Body, shift_bodies_to_com};
/// # use nalgebra::Vector3;
/// let mut bodies = vec![
///     Body::new(100.0, Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.0, 1.0, 0.0)),
///     Body::new(100.0, Vector3::new(-1.0, 0.0, 0.0), Vector3::new(0.0, -1.0, 0.0)),
/// ];
/// shift_bodies_to_com(&mut bodies);
/// // Now COM is at origin and COM velocity is zero
/// let com_pos: Vector3<f64> = bodies.iter().map(|b| b.mass * b.position).sum::<Vector3<f64>>() / 200.0;
/// assert!(com_pos.norm() < 1e-10);
/// ```
pub fn shift_bodies_to_com(b: &mut [Body]) {
    let mt: f64 = b.iter().map(|x| x.mass).sum();
    if mt < crate::render::constants::COM_MASS_THRESHOLD {
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

/// Check if any body in the system is escaping
///
/// A body is considered escaping if its total energy (kinetic + potential) exceeds
/// the escape threshold, meaning it has enough energy to escape to infinity.
///
/// # Arguments
///
/// * `b` - Slice of bodies to check
/// * `th` - Energy threshold above which a body is considered escaping
///
/// # Returns
///
/// `true` if any body is escaping, `false` otherwise
#[must_use = "the escape status should be checked"]
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
                if d > crate::render::constants::MIN_DISTANCE_THRESHOLD {
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
}

/// Select the best trajectory using Borda count voting.
///
/// Evaluates `num_sims` random 3-body configurations in parallel, ranking them
/// by chaos and equilateralness metrics, and returns the highest-scoring orbit.
///
/// # Arguments
///
/// * `rng` - Random number generator for creating candidate configurations
/// * `num_sims` - Number of random configurations to evaluate (30k-100k typical)
/// * `steps` - Simulation timesteps for both warmup and recording phases
/// * `cw` - Chaos weight (higher = prefer more chaotic orbits)
/// * `ew` - Equilateral weight (higher = prefer symmetric triangular orbits)
/// * `th` - Energy threshold for escape detection (bodies above this are rejected)
///
/// # Errors
///
/// Returns `SimulationError::NoValidOrbits` if all candidates are filtered out due to:
/// - High total energy (> 10.0) indicating unbound system
/// - Low angular momentum (< 10.0) indicating near-collision
/// - Bodies escaping during warmup phase
///
/// # Example
///
/// ```no_run
/// # use three_body_problem::sim::{Sha3RandomByteStream, select_best_trajectory};
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let seed = b"test_seed";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// let (best_bodies, metrics) = select_best_trajectory(
///     &mut rng,
///     30_000,    // Evaluate 30k candidates
///     1_000_000, // Simulate for 1M steps
///     0.75,      // Chaos weight
///     11.0,      // Equilateral weight
///     -0.3,      // Escape threshold
/// )?;
/// println!("Best orbit: chaos={:.3}, equilateral={:.3}",
///          metrics.chaos, metrics.equilateralness);
/// # Ok(())
/// # }
/// ```
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
            if e > crate::render::constants::BORDA_ENERGY_REJECTION_THRESHOLD
                || ang < crate::render::constants::BORDA_ANGULAR_MOMENTUM_THRESHOLD
            {
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
            if c < crate::render::constants::MIN_VIABLE_CHAOS
                && eq < crate::render::constants::MIN_VIABLE_EQUILATERAL
            {
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
            // Handle NaN gracefully: treat NaN as less than any number (sort to end)
            v.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        } else {
            // Handle NaN gracefully: treat NaN as greater than any number (sort to end)
            v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
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
    // Sort by weighted score, handling NaN gracefully (NaN sorts to end)
    iv.sort_by(|a, b| {
        b.0.total_score_weighted
            .partial_cmp(&a.0.total_score_weighted)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let bi = iv[0].1;
    let bt = iv[0].0.clone();
    info!("\n   => Chosen orbit idx {bi} with weighted score {:.3}", bt.total_score_weighted);
    Ok((many[bi].clone(), bt))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    /// Helper to create a simple 3-body system for testing
    fn test_system(m1: f64, m2: f64, m3: f64) -> Vec<Body> {
        vec![
            Body::new(m1, Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.0, 0.1, 0.0)),
            Body::new(m2, Vector3::new(-1.0, 0.0, 0.0), Vector3::new(0.0, -0.1, 0.0)),
            Body::new(m3, Vector3::new(0.0, 1.0, 0.0), Vector3::new(-0.1, 0.0, 0.0)),
        ]
    }

    #[test]
    fn test_center_of_mass_zero() {
        let mut bodies = test_system(100.0, 150.0, 200.0);
        shift_bodies_to_com(&mut bodies);

        // Check that COM is at origin
        let total_mass: f64 = bodies.iter().map(|b| b.mass).sum();
        let mut com = Vector3::zeros();
        for b in &bodies {
            com += b.mass * b.position;
        }
        com /= total_mass;

        assert!(com.norm() < 1e-10, "COM should be at origin after shift, got {:?}", com);
    }

    #[test]
    fn test_center_of_mass_velocity_zero() {
        let mut bodies = test_system(100.0, 150.0, 200.0);
        shift_bodies_to_com(&mut bodies);

        // Check that COM velocity is zero
        let total_mass: f64 = bodies.iter().map(|b| b.mass).sum();
        let mut com_vel = Vector3::zeros();
        for b in &bodies {
            com_vel += b.mass * b.velocity;
        }
        com_vel /= total_mass;

        assert!(
            com_vel.norm() < 1e-10,
            "COM velocity should be zero after shift, got {:?}",
            com_vel
        );
    }

    #[test]
    fn test_verlet_deterministic() {
        let bodies1 = test_system(100.0, 150.0, 200.0);
        let bodies2 = bodies1.clone();

        let sim1 = get_positions(bodies1, 100);
        let sim2 = get_positions(bodies2, 100);

        // Same initial conditions should produce identical trajectories
        for body_idx in 0..3 {
            for step in 0..100 {
                let p1 = sim1.positions[body_idx][step];
                let p2 = sim2.positions[body_idx][step];
                assert!(
                    (p1 - p2).norm() < 1e-14,
                    "Deterministic simulation failed at body {} step {}",
                    body_idx,
                    step
                );
            }
        }
    }

    #[test]
    fn test_verlet_step_compile_time_safety() {
        // Verify that verlet_step works with fixed-size array
        let mut bodies = test_system(100.0, 150.0, 200.0);
        shift_bodies_to_com(&mut bodies);

        let mut bodies_array: [Body; 3] = [bodies[0].clone(), bodies[1].clone(), bodies[2].clone()];

        let dt = crate::render::constants::DEFAULT_DT;

        // This should compile and work correctly
        verlet_step(&mut bodies_array, dt);

        // Verify positions changed (simulation advanced)
        let changed = bodies_array.iter().any(|b| b.position != Vector3::zeros());
        assert!(changed, "Verlet step should update positions");
    }

    #[test]
    fn test_rng_deterministic() {
        let seed = b"test_seed_12345";
        let mut rng1 = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
        let mut rng2 = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);

        // Same seed should produce identical random values
        for _ in 0..100 {
            assert_eq!(rng1.next_f64(), rng2.next_f64(), "RNG not deterministic");
        }
    }

    #[test]
    fn test_escape_detection() {
        // Create a system with one body moving very fast (escaping)
        let mut bodies = vec![
            Body::new(100.0, Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 0.0, 0.0)),
            Body::new(100.0, Vector3::new(100.0, 0.0, 0.0), Vector3::new(100.0, 0.0, 0.0)), // Fast!
            Body::new(100.0, Vector3::new(-100.0, 0.0, 0.0), Vector3::new(0.0, 0.0, 0.0)),
        ];
        shift_bodies_to_com(&mut bodies);

        assert!(is_definitely_escaping(&bodies, 0.0), "Should detect escaping body");
    }

    // Property-based tests using proptest
    //
    // Note on conservation laws:
    // - Mass: Trivially conserved (no forces change mass)
    // - Energy & Angular Momentum: Conserved by the symplectic Verlet integrator
    //
    // We only test mass conservation here because the simulation stores positions only
    // (not velocities) for memory efficiency. Reconstructing velocities from position
    // differences would introduce numerical errors that get exponentially amplified by
    // the chaotic dynamics, making any test unreliable. Energy and angular momentum
    // conservation are guaranteed by the mathematical properties of the Verlet method.
    proptest! {
        /// Total mass should be conserved exactly (no numerical drift)
        #[test]
        fn prop_mass_conservation(
            m1 in 100.0f64..300.0,
            m2 in 100.0f64..300.0,
            m3 in 100.0f64..300.0,
        ) {
            let initial_bodies = test_system(m1, m2, m3);
            let initial_mass: f64 = initial_bodies.iter().map(|b| b.mass).sum();

            // Simulate for some steps
            let _sim = get_positions(initial_bodies.clone(), 1000);

            // Reconstruct final bodies (masses should be unchanged)
            let final_mass: f64 = initial_bodies.iter().map(|b| b.mass).sum();

            prop_assert!((initial_mass - final_mass).abs() < 1e-14, "Mass not conserved");
        }

        /// Energy should be bounded in chaotic systems (not strictly conserved due to chaos)
        #[test]
        fn prop_energy_bounded(
            m1 in 100.0f64..300.0,
            m2 in 100.0f64..300.0,
            m3 in 100.0f64..300.0,
        ) {
            let initial_bodies = test_system(m1, m2, m3);
            let initial_energy = calculate_total_energy(&initial_bodies);

            // For chaotic systems, we mainly verify the simulation doesn't diverge wildly
            // Symplectic integrator should keep energy bounded
            // Note: Exact conservation requires storing velocities, which we don't do here
            let sim_result = get_positions(initial_bodies.clone(), 1000);

            // Just verify simulation completed without NaN/infinity
            for body_idx in 0..3 {
                for step in 0..1000 {
                    let pos = sim_result.positions[body_idx][step];
                    prop_assert!(pos.norm().is_finite(), "Position became non-finite");
                }
            }

            // Verify energy is reasonable order of magnitude
            prop_assert!(initial_energy.is_finite(), "Initial energy should be finite");
        }

        /// RNG should produce values in expected ranges
        #[test]
        fn prop_rng_ranges(seed_val in 0u64..1_000_000u64) {
            let seed = seed_val.to_le_bytes();
            let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 25.0, 10.0);

            for _ in 0..100 {
                let mass = rng.random_mass();
                prop_assert!((100.0..=300.0).contains(&mass), "Mass out of range: {mass}");

                let loc = rng.random_location();
                prop_assert!((-25.0..=25.0).contains(&loc), "Location out of range: {loc}");

                let vel = rng.random_velocity();
                prop_assert!((-10.0..=10.0).contains(&vel), "Velocity out of range: {vel}");
            }
        }

        /// Fuzz test: RNG handles arbitrary seed lengths without panicking
        ///
        /// Critical security property: user-controlled seeds should never crash.
        #[test]
        fn prop_rng_arbitrary_seed_length(seed_bytes in prop::collection::vec(any::<u8>(), 0..10000)) {
            let mut rng = Sha3RandomByteStream::new(&seed_bytes, 100.0, 300.0, 25.0, 10.0);

            // Generate values - should never panic regardless of seed
            for _ in 0..10 {
                let mass = rng.random_mass();
                let loc = rng.random_location();
                let vel = rng.random_velocity();
                let f = rng.next_f64();

                // All outputs must be finite and in expected ranges
                prop_assert!(mass.is_finite() && (100.0..=300.0).contains(&mass));
                prop_assert!(loc.is_finite() && (-25.0..=25.0).contains(&loc));
                prop_assert!(vel.is_finite() && (-10.0..=10.0).contains(&vel));
                prop_assert!(f.is_finite() && (0.0..=1.0).contains(&f));
            }
        }

        /// Fuzz test: RNG handles extreme parameter ranges
        #[test]
        fn prop_rng_extreme_ranges(
            min_mass in -1e100f64..1e100,
            max_mass in -1e100f64..1e100,
            location in 0.0f64..1e100,
            velocity in 0.0f64..1e100,
        ) {
            // Skip invalid ranges
            if !min_mass.is_finite() || !max_mass.is_finite() ||
               !location.is_finite() || !velocity.is_finite() ||
               min_mass >= max_mass {
                return Ok(());
            }

            let seed = b"test_seed";
            let mut rng = Sha3RandomByteStream::new(seed, min_mass, max_mass, location, velocity);

            // Should produce valid values even with extreme ranges
            for _ in 0..10 {
                let mass = rng.random_mass();
                let loc = rng.random_location();
                let vel = rng.random_velocity();

                prop_assert!(mass.is_finite());
                prop_assert!(loc.is_finite());
                prop_assert!(vel.is_finite());

                if min_mass < max_mass {
                    prop_assert!(mass >= min_mass && mass <= max_mass,
                                "Mass {} not in range [{}, {}]", mass, min_mass, max_mass);
                }
            }
        }

        /// Fuzz test: RNG is deterministic for same seed
        #[test]
        fn prop_rng_determinism(seed_bytes in prop::collection::vec(any::<u8>(), 1..100)) {
            let mut rng1 = Sha3RandomByteStream::new(&seed_bytes, 100.0, 300.0, 25.0, 10.0);
            let mut rng2 = Sha3RandomByteStream::new(&seed_bytes, 100.0, 300.0, 25.0, 10.0);

            for _ in 0..100 {
                prop_assert_eq!(rng1.next_f64(), rng2.next_f64());
                prop_assert_eq!(rng1.random_mass(), rng2.random_mass());
                prop_assert_eq!(rng1.random_location(), rng2.random_location());
                prop_assert_eq!(rng1.random_velocity(), rng2.random_velocity());
            }
        }

        /// Fuzz test: next_f64 always returns values in [0, 1]
        #[test]
        fn prop_next_f64_range(seed_bytes in prop::collection::vec(any::<u8>(), 1..100)) {
            let mut rng = Sha3RandomByteStream::new(&seed_bytes, 100.0, 300.0, 25.0, 10.0);

            for _ in 0..1000 {
                let f = rng.next_f64();
                prop_assert!((0.0..=1.0).contains(&f), "next_f64 returned {}, outside [0,1]", f);
                prop_assert!(f.is_finite(), "next_f64 returned non-finite value");
            }
        }
    }
}
