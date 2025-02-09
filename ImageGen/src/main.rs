use clap::Parser;
use hex;
use image::{DynamicImage, ImageBuffer, Rgb};
use line_drawing::Bresenham;
use na::Vector3;
use nalgebra as na;
use palette::{FromColor, Hsl, Srgb};
use rayon::prelude::*;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use sha3::{Digest, Sha3_256};
use std::error::Error;
use std::f64::{INFINITY, NEG_INFINITY};
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

use wide::f64x4;

/// For Borda metric calculations
const LLE_M: usize = 3; // dimension used in embedding for Lyapunov exponent
const B: usize = 32; // KdTree branching factor
const G: f64 = 9.8; // gravitational constant

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "
Simulate many random 3-body orbits, pick best by Borda (including aspect ratio closeness),
then generate single image + H.264 MP4 video with two-pass global auto-level.

No rotation is done; final dimension is always width×height (defaults to 1920×1080).
If you want orbits that fill 16:9 better, we factor an 'aspect ratio closeness' measure
into the Borda ranking. A perfect 16:9 orbit gets closeness=1.0, bigger mismatch => 0.0.
"
)]
struct Args {
    /// Hex seed for random generation (e.g. --seed 0xABC123)
    #[arg(long, default_value = "0x100033")]
    seed: String,

    /// Base file name (no extension)
    #[arg(long, default_value = "output")]
    file_name: String,

    /// Number of random orbits to consider. If not provided, defaults:
    ///   - 100,000 if --special
    ///   - 30,000 otherwise
    #[arg(long)]
    num_sims: Option<usize>,

    /// Number of steps used to judge each candidate orbit
    #[arg(long, default_value_t = 1_000_000)]
    num_steps_sim: usize,

    /// Range for random initial positions (±this value)
    #[arg(long, default_value_t = 300.0)]
    location: f64,

    /// Range for random initial velocities (±this value)
    #[arg(long, default_value_t = 1.0)]
    velocity: f64,

    /// Min mass
    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,

    /// Max mass
    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    /// Borda weighting: chaos measure
    #[arg(long, default_value_t = 3.0)]
    chaos_weight: f64,

    /// Borda weighting: average triangle area
    #[arg(long, default_value_t = 1.0)]
    area_weight: f64,

    /// Borda weighting: total distance
    #[arg(long, default_value_t = 2.0)]
    dist_weight: f64,

    /// Borda weighting: lyapunov exponent
    #[arg(long, default_value_t = 2.5)]
    lyap_weight: f64,

    /// Borda weighting: aspect ratio closeness
    #[arg(long, default_value_t = 1.0)]
    aspect_weight: f64,

    /// Max points for chaos measure sub-sampling
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,

    /// Output image/video width in pixels
    #[arg(long, default_value_t = 1920 / 2)]
    width: u32,

    /// Output image/video height in pixels
    #[arg(long, default_value_t = 1080 / 2)]
    height: u32,

    /// Fraction of pixels clipped to black
    #[arg(long, default_value_t = 0.005)]
    clip_black: f64,

    /// Fraction of pixels clipped to white
    #[arg(long, default_value_t = 0.99)]
    clip_white: f64,

    /// Gamma correction after clipping
    #[arg(long, default_value_t = 1.0)]
    levels_gamma: f64,

    /// If true, use “special” mode => changes some defaults
    #[arg(long, default_value_t = false)]
    special: bool,
}

// ========================================================
// Our custom RNG (SHA3-based)
// ========================================================
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

    fn next_byte(&mut self) -> u8 {
        if self.index >= self.buffer.len() {
            self.hasher.update(&self.seed);
            self.hasher.update(&self.buffer);
            self.buffer = self.hasher.finalize_reset().to_vec();
            self.index = 0;
        }
        let byte = self.buffer[self.index];
        self.index += 1;
        byte
    }

    fn next_u64(&mut self) -> u64 {
        let mut bytes = [0u8; 8];
        for b in &mut bytes {
            *b = self.next_byte();
        }
        u64::from_le_bytes(bytes)
    }

    fn next_f64(&mut self) -> f64 {
        (self.next_u64() as f64) / (u64::MAX as f64)
    }

    fn gen_range(&mut self, min: f64, max: f64) -> f64 {
        let r = self.next_f64();
        r * (max - min) + min
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

    pub fn random_alpha(&mut self, min_a: f64, max_a: f64) -> f64 {
        self.gen_range(min_a, max_a)
    }
}

// ========================================================
// Three‐Body Simulation
// ========================================================
#[derive(Clone)]
struct Body {
    mass: f64,
    position: na::Vector3<f64>,
    velocity: na::Vector3<f64>,
    acceleration: na::Vector3<f64>,
}

impl Body {
    fn new(mass: f64, position: Vector3<f64>, velocity: Vector3<f64>) -> Self {
        Self { mass, position, velocity, acceleration: Vector3::zeros() }
    }

    fn reset_acceleration(&mut self) {
        self.acceleration = Vector3::zeros();
    }

    fn update_acceleration(&mut self, other_mass: f64, other_pos: &Vector3<f64>) {
        let direction = self.position - *other_pos;
        let distance = direction.norm();
        if distance > 1e-10 {
            self.acceleration += -G * other_mass * direction / distance.powi(3);
        }
    }
}

fn verlet_step(bodies: &mut [Body], dt: f64) {
    let positions: Vec<_> = bodies.iter().map(|b| b.position).collect();
    let masses: Vec<_> = bodies.iter().map(|b| b.mass).collect();

    // First half-kick
    for (i, body) in bodies.iter_mut().enumerate() {
        body.reset_acceleration();
        for (j, &other_pos) in positions.iter().enumerate() {
            if i != j {
                body.update_acceleration(masses[j], &other_pos);
            }
        }
    }

    // Drift
    for body in bodies.iter_mut() {
        body.position += body.velocity * dt + 0.5 * body.acceleration * dt * dt;
    }

    // Second half-kick
    let new_positions: Vec<_> = bodies.iter().map(|b| b.position).collect();
    for (i, body) in bodies.iter_mut().enumerate() {
        body.reset_acceleration();
        for (j, &other_pos) in new_positions.iter().enumerate() {
            if i != j {
                body.update_acceleration(masses[j], &other_pos);
            }
        }
    }

    for body in bodies.iter_mut() {
        body.velocity += body.acceleration * dt;
    }
}

/// Warm up, then collect `num_steps` positions.
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;
    // Warm up
    for _ in 0..num_steps {
        verlet_step(&mut bodies, dt);
    }
    // Record positions
    let mut bodies2 = bodies.clone();
    let mut all_positions = vec![vec![Vector3::zeros(); num_steps]; bodies.len()];
    for step in 0..num_steps {
        for (i, b) in bodies2.iter().enumerate() {
            all_positions[i][step] = b.position;
        }
        verlet_step(&mut bodies2, dt);
    }
    all_positions
}

fn calculate_total_energy(bodies: &[Body]) -> f64 {
    let mut kin = 0.0;
    let mut pot = 0.0;
    for b in bodies {
        kin += 0.5 * b.mass * b.velocity.norm_squared();
    }
    for i in 0..bodies.len() {
        for j in (i + 1)..bodies.len() {
            let r = (bodies[i].position - bodies[j].position).norm();
            if r > 1e-10 {
                pot += -G * bodies[i].mass * bodies[j].mass / r;
            }
        }
    }
    kin + pot
}

fn calculate_total_angular_momentum(bodies: &[Body]) -> Vector3<f64> {
    let mut total_l = Vector3::zeros();
    for b in bodies {
        total_l += b.mass * b.position.cross(&b.velocity);
    }
    total_l
}

// ========================================================
// KdTree + Borda selection
// ========================================================
use kiddo::float::kdtree::KdTree;
use kiddo::SquaredEuclidean;
use statrs::statistics::Statistics;

fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(input.len());
    let mut data: Vec<_> = input.iter().map(|&x| Complex::new(x, 0.0)).collect();
    fft.process(&mut data);
    data
}

/// We *normalize* positions in `total_distance` but not in other metrics; part of the original design.
fn total_distance(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let mut new_pos = positions.to_vec();
    normalize_positions_for_analysis(&mut new_pos);
    let mut sum = 0.0;
    for body_idx in 0..new_pos.len() {
        for step_idx in 1..new_pos[body_idx].len() {
            let p0 = new_pos[body_idx][step_idx - 1];
            let p1 = new_pos[body_idx][step_idx];
            sum += (p1 - p0).norm();
        }
    }
    sum
}

fn normalize_positions_for_analysis(positions: &mut [Vec<Vector3<f64>>]) {
    let mut min_x = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut min_y = INFINITY;
    let mut max_y = NEG_INFINITY;
    for body in positions.iter() {
        for p in body.iter() {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }
    }
    let x_center = (max_x + min_x) * 0.5;
    let y_center = (max_y + min_y) * 0.5;
    let mut range = (max_x - min_x).max(max_y - min_y) * 1.1;
    if range < 1e-14 {
        range = 1.0;
    }
    let adj_min_x = x_center - (range * 0.5);
    let adj_min_y = y_center - (range * 0.5);
    for body in positions.iter_mut() {
        for p in body.iter_mut() {
            p[0] = (p[0] - adj_min_x) / range;
            p[1] = (p[1] - adj_min_y) / range;
        }
    }
}

fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &[Vec<Vector3<f64>>]) -> f64 {
    let len = positions[0].len();
    if len == 0 {
        return 0.0;
    }
    let mut r1 = vec![0.0; len];
    let mut r2 = vec![0.0; len];
    let mut r3 = vec![0.0; len];
    for i in 0..len {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];
        let cm1 = (m2 * p2 + m3 * p3) / (m2 + m3);
        let cm2 = (m1 * p1 + m3 * p3) / (m1 + m3);
        let cm3 = (m1 * p1 + m2 * p2) / (m1 + m2);
        r1[i] = (p1 - cm1).norm();
        r2[i] = (p2 - cm2).norm();
        r3[i] = (p3 - cm3).norm();
    }
    let abs1: Vec<f64> = fourier_transform(&r1).iter().map(|c| c.norm()).collect();
    let abs2: Vec<f64> = fourier_transform(&r2).iter().map(|c| c.norm()).collect();
    let abs3: Vec<f64> = fourier_transform(&r3).iter().map(|c| c.norm()).collect();
    let sd1 = abs1.iter().copied().std_dev();
    let sd2 = abs2.iter().copied().std_dev();
    let sd3 = abs3.iter().copied().std_dev();
    (sd1 + sd2 + sd3) / 3.0
}

/// approximate lyapunov exponent
fn lyapunov_exponent_kdtree(data: &[f64], tau: usize, max_iter: usize) -> f64 {
    if data.len() < (LLE_M - 1) * tau + 1 {
        return 0.0;
    }
    let embedded: Vec<[f64; LLE_M]> = (0..(data.len() - (LLE_M - 1) * tau))
        .map(|i| [data[i], data[i + tau], data[i + 2 * tau]])
        .collect();
    let emb_len = embedded.len();
    if emb_len < 2 {
        return 0.0;
    }
    let mut kdtree: KdTree<f64, u64, LLE_M, B, u32> = KdTree::new();
    for (i, point) in embedded.iter().enumerate() {
        kdtree.add(point, i as u64);
    }
    let mut divergence = vec![0.0; max_iter];
    let mut counts = vec![0usize; max_iter];
    for i in 0..emb_len {
        let query = &embedded[i];
        let nn = kdtree.nearest_n::<SquaredEuclidean>(query, 2);
        let nn1 = nn[0];
        let nn2 = nn[1];
        let nn_id = if nn1.item == i as u64 { nn2.item as usize } else { nn1.item as usize };
        let allowed_steps = max_iter.min(emb_len - 1 - i).min(emb_len - 1 - nn_id);
        for k in 0..allowed_steps {
            let dx = embedded[i + k][0] - embedded[nn_id + k][0];
            let dy = embedded[i + k][1] - embedded[nn_id + k][1];
            let dz = embedded[i + k][2] - embedded[nn_id + k][2];
            let d = (dx * dx + dy * dy + dz * dz).sqrt();
            divergence[k] += d;
            counts[k] += 1;
        }
    }
    if max_iter < 2 {
        return 0.0;
    }
    let log_divergence: Vec<f64> = (0..max_iter)
        .map(|k| if counts[k] > 0 { (divergence[k] / (counts[k] as f64)).ln() } else { 0.0 })
        .collect();
    let x_vals: Vec<f64> = (0..max_iter).map(|i| i as f64).collect();
    let mean_x = x_vals.iter().copied().mean();
    let mean_y = log_divergence.iter().copied().mean();
    let mut num = 0.0;
    let mut den = 0.0;
    for i in 0..max_iter {
        let dx = x_vals[i] - mean_x;
        num += dx * (log_divergence[i] - mean_y);
        den += dx * dx;
    }
    if den.abs() < 1e-14 {
        0.0
    } else {
        num / den
    }
}

/// measure how close the bounding box aspect ratio is to final_aspect
/// => returns in [0,1], 1=perfect match, 0=extremely mismatched
fn aspect_ratio_closeness(positions: &[Vec<Vector3<f64>>], final_aspect: f64) -> f64 {
    let (min_x, max_x, min_y, max_y) = bounding_box_2d(positions);
    let w = max_x - min_x;
    let h = max_y - min_y;
    if w < 1e-14 || h < 1e-14 {
        return 0.0;
    }
    let orbit_aspect = w / h;
    let diff = (orbit_aspect - final_aspect).abs() / final_aspect;
    let score = 1.0 - diff;
    score.clamp(0.0, 1.0)
}

fn bounding_box_2d(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut min_y = INFINITY;
    let mut max_y = NEG_INFINITY;
    for body_idx in 0..positions.len() {
        for &p in &positions[body_idx] {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }
    }
    (min_x, max_x, min_y, max_y)
}

/// Also adds a 5% margin for final rendering.
fn bounding_box(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut min_y = INFINITY;
    let mut max_y = NEG_INFINITY;
    for body_idx in 0..positions.len() {
        for &p in &positions[body_idx] {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }
    }
    if (max_x - min_x).abs() < 1e-12 {
        min_x -= 0.5;
        max_x += 0.5;
    }
    if (max_y - min_y).abs() < 1e-12 {
        min_y -= 0.5;
        max_y += 0.5;
    }
    // Expand by 5% margin
    {
        let wx = max_x - min_x;
        let wy = max_y - min_y;
        min_x -= 0.05 * wx;
        max_x += 0.05 * wx;
        min_y -= 0.05 * wy;
        max_y += 0.05 * wy;
    }
    (min_x, max_x, min_y, max_y)
}

fn average_triangle_area_screen(positions: &[Vec<Vector3<f64>>], width: u32, height: u32) -> f64 {
    let total_steps = positions[0].len();
    if total_steps == 0 {
        return 0.0;
    }
    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let ww = max_x - min_x;
    let hh = max_y - min_y;
    if ww.abs() < 1e-14 || hh.abs() < 1e-14 {
        return 0.0;
    }

    let mut sum_area = 0.0;
    for step in 0..total_steps {
        let p1 = positions[0][step];
        let p2 = positions[1][step];
        let p3 = positions[2][step];

        let x1 = (p1[0] - min_x) / ww * (width as f64);
        let y1 = (p1[1] - min_y) / hh * (height as f64);
        let x2 = (p2[0] - min_x) / ww * (width as f64);
        let y2 = (p2[1] - min_y) / hh * (height as f64);
        let x3 = (p3[0] - min_x) / ww * (width as f64);
        let y3 = (p3[1] - min_y) / hh * (height as f64);

        let area = 0.5 * ((x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)).abs();
        sum_area += area;
    }

    sum_area / (total_steps as f64)
}

#[derive(Clone)]
struct TrajectoryResult {
    chaos: f64,
    triangle_area: f64,
    total_dist: f64,
    lyap_exp: f64,
    aspect_closeness: f64,

    chaos_pts: usize,
    area_pts: usize,
    dist_pts: usize,
    lyap_pts: usize,
    aspect_pts: usize,

    total_score: usize,
    total_score_weighted: f64,
}

/// Runs the Borda search in parallel over `num_sims` random orbits.
fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    num_steps_sim: usize,
    max_points: usize,
    chaos_weight: f64,
    area_weight: f64,
    dist_weight: f64,
    lyap_weight: f64,
    aspect_weight: f64,
    final_aspect: f64,
    width: u32,
    height: u32,
) -> (Vec<Body>, TrajectoryResult) {
    println!("STAGE 1/8: Borda search over {num_sims} random orbits...");
    let many_bodies: Vec<Vec<Body>> = (0..num_sims)
        .map(|_| {
            vec![
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
            ]
        })
        .collect();

    let progress_counter = AtomicUsize::new(0);
    let chunk_size = (num_sims / 10).max(1);

    let results: Vec<Option<(TrajectoryResult, usize)>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(idx, bodies)| {
            let local_count = progress_counter.fetch_add(1, Ordering::Relaxed) + 1;
            if local_count % chunk_size == 0 {
                let pct = (local_count as f64 / num_sims as f64) * 100.0;
                println!("   Borda search: {:.0}% done", pct);
            }
            // Filter out unbound or near-zero angular momentum
            let e = calculate_total_energy(bodies);
            let ang = calculate_total_angular_momentum(bodies).norm();
            if e >= 0.0 || ang < 1e-3 {
                None
            } else {
                let positions = get_positions(bodies.clone(), num_steps_sim);
                let len = positions[0].len();
                let factor = (len / max_points).max(1);

                let m1 = bodies[0].mass;
                let m2 = bodies[1].mass;
                let m3 = bodies[2].mass;

                // chaos measure
                let c = non_chaoticness(m1, m2, m3, &positions);

                // area measure
                let area = average_triangle_area_screen(&positions, width, height);

                // total distance
                let d = total_distance(&positions);

                // approximate Lyapunov exponent
                let body1_norms: Vec<f64> =
                    positions[0].iter().step_by(factor).map(|p| p.norm()).collect();
                let ly = lyapunov_exponent_kdtree(&body1_norms, 1, 50);

                // aspect closeness
                let asp = aspect_ratio_closeness(&positions, final_aspect);

                let tr = TrajectoryResult {
                    chaos: c,
                    triangle_area: area,
                    total_dist: d,
                    lyap_exp: ly,
                    aspect_closeness: asp,

                    chaos_pts: 0,
                    area_pts: 0,
                    dist_pts: 0,
                    lyap_pts: 0,
                    aspect_pts: 0,

                    total_score: 0,
                    total_score_weighted: 0.0,
                };
                Some((tr, idx))
            }
        })
        .collect();

    let valid: Vec<_> = results.into_iter().filter_map(|x| x).collect();
    if valid.is_empty() {
        panic!("No valid orbits found (all unbound or zero angular momentum).");
    }
    let mut info_vec = valid;

    // Gather metrics
    let mut chaos_vals = Vec::with_capacity(info_vec.len());
    let mut area_vals = Vec::with_capacity(info_vec.len());
    let mut dist_vals = Vec::with_capacity(info_vec.len());
    let mut lyap_vals = Vec::with_capacity(info_vec.len());
    let mut aspect_vals = Vec::with_capacity(info_vec.len());

    for (i, (tr, _)) in info_vec.iter().enumerate() {
        chaos_vals.push((tr.chaos, i));
        area_vals.push((tr.triangle_area, i));
        dist_vals.push((tr.total_dist, i));
        lyap_vals.push((tr.lyap_exp, i));
        aspect_vals.push((tr.aspect_closeness, i));
    }

    fn assign_borda_scores(mut vals: Vec<(f64, usize)>, higher_better: bool) -> Vec<usize> {
        if higher_better {
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = vals.len();
        let mut out = vec![0; n];
        for (rank, (_val, idx)) in vals.into_iter().enumerate() {
            let score = n - rank;
            out[idx] = score;
        }
        out
    }

    // chaos => lower is better
    let chaos_pts = assign_borda_scores(chaos_vals, false);
    // area => bigger is better
    let area_pts = assign_borda_scores(area_vals, true);
    // dist => bigger is better
    let dist_pts = assign_borda_scores(dist_vals, true);
    // lyap => bigger is better
    let lyap_pts = assign_borda_scores(lyap_vals, true);
    // aspect => bigger is better
    let aspect_pts = assign_borda_scores(aspect_vals, true);

    for (i, (tr, _)) in info_vec.iter_mut().enumerate() {
        tr.chaos_pts = chaos_pts[i];
        tr.area_pts = area_pts[i];
        tr.dist_pts = dist_pts[i];
        tr.lyap_pts = lyap_pts[i];
        tr.aspect_pts = aspect_pts[i];

        tr.total_score = chaos_pts[i] + area_pts[i] + dist_pts[i] + lyap_pts[i] + aspect_pts[i];
        tr.total_score_weighted = (chaos_pts[i] as f64 * chaos_weight)
            + (area_pts[i] as f64 * area_weight)
            + (dist_pts[i] as f64 * dist_weight)
            + (lyap_pts[i] as f64 * lyap_weight)
            + (aspect_pts[i] as f64 * aspect_weight);
    }

    // pick best by total_score_weighted
    let (best_tr, best_idx) = info_vec
        .iter()
        .max_by(|(a, _), (b, _)| {
            a.total_score_weighted.partial_cmp(&b.total_score_weighted).unwrap()
        })
        .unwrap();
    let best_bodies = many_bodies[*best_idx].clone();

    println!(
        "   => Borda best: Weighted total={:.3}, chaos={:.3e}, area={:.3}, dist={:.3}, lyap={:.3}, aspect={:.3}",
        best_tr.total_score_weighted,
        best_tr.chaos,
        best_tr.triangle_area,
        best_tr.total_dist,
        best_tr.lyap_exp,
        best_tr.aspect_closeness
    );
    (best_bodies, best_tr.clone())
}

// ========================================================
// Single-Pass Gaussian Blur (Parallel), now 4-channel
// ========================================================
fn build_gaussian_kernel(radius: usize) -> Vec<f64> {
    if radius == 0 {
        return vec![1.0];
    }
    let sigma = radius as f64 / 2.0_f64.max(1.0);
    let two_sigma_sq = 2.0 * sigma * sigma;
    let mut kernel = Vec::with_capacity(2 * radius + 1);
    let mut sum = 0.0;
    for i in 0..(2 * radius + 1) {
        let x = i as f64 - radius as f64;
        let val = (-x * x / two_sigma_sq).exp();
        kernel.push(val);
        sum += val;
    }
    for v in kernel.iter_mut() {
        *v /= sum;
    }
    kernel
}

/// We'll blur `(r,g,b,a)` naïvely in non-premultiplied form.
fn parallel_blur_2d_rgba(
    buffer: &mut [(f64, f64, f64, f64)],
    width: usize,
    height: usize,
    radius: usize,
) {
    if radius == 0 {
        return;
    }
    let kernel = build_gaussian_kernel(radius);
    let k_len = kernel.len();

    // We'll keep a temp buffer
    let mut temp = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    // Horizontal pass
    temp.par_chunks_mut(width).zip(buffer.par_chunks(width)).for_each(|(temp_row, buf_row)| {
        for x in 0..width {
            // We'll do sum_r, sum_g, sum_b, sum_a
            let mut sum = f64x4::splat(0.0);
            for k in 0..k_len {
                let dx = (x as isize + (k as isize - radius as isize)).clamp(0, width as isize - 1)
                    as usize;
                let (rr, gg, bb, aa) = buf_row[dx];
                let weight = kernel[k];
                let vec_pix = f64x4::new([rr, gg, bb, aa]);
                sum += vec_pix * f64x4::splat(weight);
            }
            let arr = sum.to_array();
            temp_row[x] = (arr[0], arr[1], arr[2], arr[3]);
        }
    });

    // Vertical pass
    buffer.par_chunks_mut(width).enumerate().for_each(|(y, buf_row)| {
        for x in 0..width {
            let mut sum = f64x4::splat(0.0);
            for k in 0..k_len {
                let yy = (y as isize + (k as isize - radius as isize)).clamp(0, height as isize - 1)
                    as usize;
                let (rr, gg, bb, aa) = temp[yy * width + x];
                let weight = kernel[k];
                let vec_pix = f64x4::new([rr, gg, bb, aa]);
                sum += vec_pix * f64x4::splat(weight);
            }
            let arr = sum.to_array();
            buf_row[x] = (arr[0], arr[1], arr[2], arr[3]);
        }
    });
}

// ========================================================
// Crisp Line Drawing with “Alpha Over”
// ========================================================
/// Over-compositing (non-premultiplied):
///
/// new_a = src_a + dst_a * (1 - src_a)
/// new_rgb = (src_rgb * src_a + dst_rgb * dst_a * (1 - src_a)) / new_a
///
/// We'll linear-interpolate color of endpoints to get `(src_r, src_g, src_b, src_a)` for each pixel.
fn draw_line_segment_crisp_alpha(
    accum: &mut [(f64, f64, f64, f64)], // (r, g, b, a) in non-premultiplied form
    width: u32,
    height: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    col0: Rgb<u8>,
    col1: Rgb<u8>,
    alpha0: f64,
    alpha1: f64,
) {
    let w_usize = width as usize;
    let start = (x0.round() as i32, y0.round() as i32);
    let end = (x1.round() as i32, y1.round() as i32);
    let pts: Vec<(i32, i32)> = Bresenham::new(start, end).collect();
    let n = pts.len();
    for (i, (xx, yy)) in pts.into_iter().enumerate() {
        if xx < 0 || xx >= width as i32 || yy < 0 || yy >= height as i32 {
            continue;
        }
        let idx = (yy as usize) * w_usize + (xx as usize);
        let t = if n <= 1 { 0.0 } else { i as f64 / (n - 1) as f64 };

        // Interpolate the color & alpha at fraction t
        let src_a = alpha0 * (1.0 - t) + alpha1 * t;
        let src_r = ((col0[0] as f64) / 255.0) * (1.0 - t) + ((col1[0] as f64) / 255.0) * t;
        let src_g = ((col0[1] as f64) / 255.0) * (1.0 - t) + ((col1[1] as f64) / 255.0) * t;
        let src_b = ((col0[2] as f64) / 255.0) * (1.0 - t) + ((col1[2] as f64) / 255.0) * t;

        // “Over” compositing with what's in accum
        let (dst_r, dst_g, dst_b, dst_a) = accum[idx];
        let new_a = src_a + dst_a * (1.0 - src_a);
        if new_a > 1e-14 {
            let new_r = (src_r * src_a + dst_r * dst_a * (1.0 - src_a)) / new_a;
            let new_g = (src_g * src_a + dst_g * dst_a * (1.0 - src_a)) / new_a;
            let new_b = (src_b * src_a + dst_b * dst_a * (1.0 - src_a)) / new_a;
            accum[idx] = (new_r, new_g, new_b, new_a);
        } else {
            // If new_a is ~0, that means the source is nearly transparent and the destination was nearly 0 alpha
            // -> effectively nothing
            // We can just keep accum[idx] as is.
        }
    }
}

// ========================================================
// Generate color sequences (+ alpha selection)
// ========================================================
fn generate_color_gradient(rng: &mut Sha3RandomByteStream, length: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    let mut hue = rng.next_f64() * 360.0;
    for _ in 0..length {
        // gently shift hue
        if rng.next_byte() & 1 == 0 {
            hue += 0.1;
        } else {
            hue -= 0.1;
        }
        if hue < 0.0 {
            hue += 360.0;
        } else if hue >= 360.0 {
            hue -= 360.0;
        }
        let hsl = Hsl::new(hue, 1.0, 0.5);
        let rgb = Srgb::from_color(hsl);
        colors.push(Rgb([
            (rgb.red * 255.0) as u8,
            (rgb.green * 255.0) as u8,
            (rgb.blue * 255.0) as u8,
        ]));
    }
    colors
}

/// For each body, we have a color sequence + **one random alpha** in [0.1..0.3].
fn generate_body_color_sequences(
    rng: &mut Sha3RandomByteStream,
    length: usize,
) -> (Vec<Vec<Rgb<u8>>>, Vec<f64>) {
    let body1_alpha = rng.random_alpha(0.1, 0.3);
    let body2_alpha = rng.random_alpha(0.1, 0.3);
    let body3_alpha = rng.random_alpha(0.1, 0.3);

    println!("   => Body alphas = {:.3}, {:.3}, {:.3}", body1_alpha, body2_alpha, body3_alpha);

    let seqs = vec![
        generate_color_gradient(rng, length),
        generate_color_gradient(rng, length),
        generate_color_gradient(rng, length),
    ];
    let alphas = vec![body1_alpha, body2_alpha, body3_alpha];
    (seqs, alphas)
}

// ========================================================
// Single-pass H.264 encoding
// ========================================================
fn create_video_from_frames_singlepass(
    width: u32,
    height: u32,
    frame_rate: u32,
    mut frames_iter: impl FnMut(&mut dyn Write) -> Result<(), Box<dyn Error>>,
    output_file: &str,
) -> Result<(), Box<dyn Error>> {
    if width == 0 || height == 0 {
        eprintln!("Invalid video size => skipping video creation.");
        return Ok(());
    }
    let cpu_count = num_cpus::get().to_string();
    println!(
        "STAGE 7/8: Creating H.264 video => {output_file}, {}x{}, {} FPS, using {} threads",
        width, height, frame_rate, cpu_count
    );

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgb24")
        .arg("-video_size")
        .arg(format!("{}x{}", width, height))
        .arg("-framerate")
        .arg(frame_rate.to_string())
        .arg("-i")
        .arg("-")
        .arg("-threads")
        .arg(&cpu_count)
        .arg("-preset")
        .arg("slow")
        .arg("-crf")
        .arg("18")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:v")
        .arg("libx264")
        .arg("-an")
        .arg(output_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let mut child = cmd.spawn()?;

    if let Some(ref mut sin) = child.stdin {
        frames_iter(sin)?;
    }

    let out = child.wait_with_output()?;
    if !out.status.success() {
        eprintln!(
            "FFmpeg error (exit code {}):\n{}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        );
    } else {
        println!("   => Single-pass video creation complete => {output_file}");
    }
    Ok(())
}

// ========================================================
// Save single image as PNG
// ========================================================
fn save_image_as_png(
    rgb_img: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    path: &str,
) -> Result<(), Box<dyn Error>> {
    let dyn_img = DynamicImage::ImageRgb8(rgb_img.clone());
    dyn_img.save(path)?;
    println!("   Saved PNG => {path}");
    Ok(())
}

// ========================================================
// Two-Pass Global Levels
// ========================================================

/// First pass: gather histogram
///
///   - We have an accumulation buffer `(r,g,b,a)` in non-premultiplied alpha.
///   - After drawing lines, we want to see how “over black” it appears:
///         display_r = r * a, display_g = g*a, display_b = b*a
///     This is the color if you composited the pixel on black.
///   - Then we optionally blur (including alpha channel), combine crisp + blur,
///     and again interpret the result as `(color_over_black) = color.r*g*a`.
///
/// We'll do it exactly like we do in the final pass, but we discard the frames,
/// except we track histogram across all frames to figure out black/white thresholds.
fn pass_1_build_histogram(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    frame_interval: usize,
    all_r: &mut Vec<f64>,
    all_g: &mut Vec<f64>,
    all_b: &mut Vec<f64>,
) {
    let npix = (width as usize) * (height as usize);

    // We'll keep a 4-channel buffer for crisp lines
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            println!("   pass 1 (histogram): {:.0}% done", pct);
        }

        // Draw lines among the 3 bodies
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let c0 = colors[0][step];
        let c1 = colors[1][step];
        let c2 = colors[2][step];

        // Each body has a fixed alpha
        let a0 = body_alphas[0];
        let a1 = body_alphas[1];
        let a2 = body_alphas[2];

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

        draw_line_segment_crisp_alpha(
            &mut accum_crisp,
            width,
            height,
            x0,
            y0,
            x1,
            y1,
            c0,
            c1,
            a0,
            a1,
        );
        draw_line_segment_crisp_alpha(
            &mut accum_crisp,
            width,
            height,
            x1,
            y1,
            x2,
            y2,
            c1,
            c2,
            a1,
            a2,
        );
        draw_line_segment_crisp_alpha(
            &mut accum_crisp,
            width,
            height,
            x2,
            y2,
            x0,
            y0,
            c2,
            c0,
            a2,
            a0,
        );

        let is_final = step == total_steps - 1;
        if (step % frame_interval == 0) || is_final {
            // Blur pass
            let mut temp = accum_crisp.clone();
            if blur_radius_px > 0 {
                parallel_blur_2d_rgba(&mut temp, width as usize, height as usize, blur_radius_px);
            }
            // Combine crisp + blur
            let mut final_frame = vec![(0.0, 0.0, 0.0, 0.0); npix];
            final_frame.par_iter_mut().enumerate().for_each(|(i, pix)| {
                let (cr, cg, cb, ca) = accum_crisp[i];
                let (br, bg, bb, ba) = temp[i];
                // Weighted combination
                let out_r = cr * blur_core_brightness + br * blur_strength;
                let out_g = cg * blur_core_brightness + bg * blur_strength;
                let out_b = cb * blur_core_brightness + bb * blur_strength;
                let out_a = ca * blur_core_brightness + ba * blur_strength;
                *pix = (out_r, out_g, out_b, out_a);
            });

            // Now, interpret each pixel “over black”
            // => display_r = final_r * final_a, etc.
            all_r.reserve(npix);
            all_g.reserve(npix);
            all_b.reserve(npix);

            for &(r, g, b, a) in &final_frame {
                let dr = r * a;
                let dg = g * a;
                let db = b * a;
                all_r.push(dr);
                all_g.push(dg);
                all_b.push(db);
            }
        }
    }
}

/// Sort channels & compute black/white thresholds + gamma
fn compute_black_white_gamma(
    all_r: &mut [f64],
    all_g: &mut [f64],
    all_b: &mut [f64],
    clip_black: f64,
    clip_white: f64,
    gamma: f64,
) -> (f64, f64, f64, f64, f64, f64, f64) {
    all_r.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    all_g.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    all_b.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

    let total_pix = all_r.len();
    if total_pix == 0 {
        return (0.0, 1.0, 0.0, 1.0, 0.0, 1.0, gamma);
    }

    let black_idx = ((clip_black * total_pix as f64).round() as isize)
        .clamp(0, (total_pix - 1) as isize) as usize;
    let white_idx = ((clip_white * total_pix as f64).round() as isize)
        .clamp(0, (total_pix - 1) as isize) as usize;

    let black_r = all_r[black_idx];
    let white_r = all_r[white_idx];
    let black_g = all_g[black_idx];
    let white_g = all_g[white_idx];
    let black_b = all_b[black_idx];
    let white_b = all_b[white_idx];

    (black_r, white_r, black_g, white_g, black_b, white_b, gamma)
}

/// Second pass: re-render frames, apply black/white/gamma on-the-fly, feed frames to sink
///
/// Same logic as pass 1, but we actually produce frames for a video file.
/// We store the last frame for PNG output.
fn pass_2_write_frames(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<Rgb<u8>>],
    body_alphas: &[f64],
    width: u32,
    height: u32,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
    frame_interval: usize,
    black_r: f64,
    white_r: f64,
    black_g: f64,
    white_g: f64,
    black_b: f64,
    white_b: f64,
    gamma: f64,
    mut frame_sink: impl FnMut(&[u8]) -> Result<(), Box<dyn Error>>,
    last_frame_out: &mut Option<ImageBuffer<Rgb<u8>, Vec<u8>>>,
) -> Result<(), Box<dyn Error>> {
    let npix = (width as usize) * (height as usize);

    // Accumulation buffer for crisp lines
    let mut accum_crisp = vec![(0.0, 0.0, 0.0, 0.0); npix];

    let total_steps = positions[0].len();
    let chunk_line = (total_steps / 10).max(1);

    let (min_x, max_x, min_y, max_y) = bounding_box(positions);
    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    // For black/white/gamma we need the range
    let range_r = (white_r - black_r).max(1e-14);
    let range_g = (white_g - black_g).max(1e-14);
    let range_b = (white_b - black_b).max(1e-14);

    for step in 0..total_steps {
        if step % chunk_line == 0 {
            let pct = (step as f64 / total_steps as f64) * 100.0;
            println!("   pass 2 (final frames): {:.0}% done", pct);
        }

        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];
        let c0 = colors[0][step];
        let c1 = colors[1][step];
        let c2 = colors[2][step];
        let a0 = body_alphas[0];
        let a1 = body_alphas[1];
        let a2 = body_alphas[2];

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

        // Draw lines with alpha-over
        draw_line_segment_crisp_alpha(
            &mut accum_crisp,
            width,
            height,
            x0,
            y0,
            x1,
            y1,
            c0,
            c1,
            a0,
            a1,
        );
        draw_line_segment_crisp_alpha(
            &mut accum_crisp,
            width,
            height,
            x1,
            y1,
            x2,
            y2,
            c1,
            c2,
            a1,
            a2,
        );
        draw_line_segment_crisp_alpha(
            &mut accum_crisp,
            width,
            height,
            x2,
            y2,
            x0,
            y0,
            c2,
            c0,
            a2,
            a0,
        );

        let is_final = step == total_steps - 1;
        if (step % frame_interval == 0) || is_final {
            // blur
            let mut temp = accum_crisp.clone();
            if blur_radius_px > 0 {
                parallel_blur_2d_rgba(&mut temp, width as usize, height as usize, blur_radius_px);
            }
            // combine crisp + blur
            let mut final_frame = vec![(0.0, 0.0, 0.0, 0.0); npix];
            final_frame.par_iter_mut().enumerate().for_each(|(i, pix)| {
                let (cr, cg, cb, ca) = accum_crisp[i];
                let (br, bg, bb, ba) = temp[i];
                let out_r = cr * blur_core_brightness + br * blur_strength;
                let out_g = cg * blur_core_brightness + bg * blur_strength;
                let out_b = cb * blur_core_brightness + bb * blur_strength;
                let out_a = ca * blur_core_brightness + ba * blur_strength;
                *pix = (out_r, out_g, out_b, out_a);
            });

            // Now interpret final_frame “over black” => (dr,dg,db) = (r*a, g*a, b*a)
            // Then do black/white/gamma => 8-bit
            let mut buf_8bit = vec![0u8; npix * 3];
            buf_8bit.par_chunks_mut(3).zip(final_frame.par_iter()).for_each(
                |(chunk, &(fr, fg, fb, fa))| {
                    // 1) Over black
                    let mut rr = fr * fa;
                    let mut gg = fg * fa;
                    let mut bb = fb * fa;

                    // 2) Clip black/white
                    rr = (rr - black_r) / range_r;
                    gg = (gg - black_g) / range_g;
                    bb = (bb - black_b) / range_b;

                    rr = rr.clamp(0.0, 1.0);
                    gg = gg.clamp(0.0, 1.0);
                    bb = bb.clamp(0.0, 1.0);

                    // 3) gamma
                    if gamma != 1.0 {
                        rr = rr.powf(gamma);
                        gg = gg.powf(gamma);
                        bb = bb.powf(gamma);
                    }

                    rr *= 255.0;
                    gg *= 255.0;
                    bb *= 255.0;

                    chunk[0] = rr.round().clamp(0.0, 255.0) as u8;
                    chunk[1] = gg.round().clamp(0.0, 255.0) as u8;
                    chunk[2] = bb.round().clamp(0.0, 255.0) as u8;
                },
            );

            // Send the frame out
            frame_sink(&buf_8bit)?;

            // If it's the last frame, store for PNG
            if is_final {
                let image_buf = ImageBuffer::from_raw(width, height, buf_8bit).unwrap();
                *last_frame_out = Some(image_buf);
            }
        }
    }
    Ok(())
}

// ========================================================
// main
// ========================================================
fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse();

    let num_sims = match args.num_sims {
        Some(val) => val,
        None => {
            if args.special {
                100_000
            } else {
                30_000
            }
        }
    };

    let _ = fs::create_dir_all("pics");
    let _ = fs::create_dir_all("vids");

    let width = args.width;
    let height = args.height;
    let final_aspect = width as f64 / height as f64;

    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed_bytes = hex::decode(hex_seed).expect("invalid hex seed");
    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // 1) Borda search
    let (best_bodies, best_info) = select_best_trajectory(
        &mut rng,
        num_sims,
        args.num_steps_sim,
        args.max_points,
        args.chaos_weight,
        args.area_weight,
        args.dist_weight,
        args.lyap_weight,
        args.aspect_weight,
        final_aspect,
        width,
        height,
    );

    // 2) Re-run best orbit
    println!(
        "STAGE 2/8: Re-running best orbit for {} steps (to store positions)...",
        args.num_steps_sim
    );
    let positions = get_positions(best_bodies.clone(), args.num_steps_sim);
    println!("   => Done re-running best orbit.");

    // 3) Generate color sequences + pick alpha
    println!("STAGE 3/8: Generating color sequences + alpha...");
    let (colors, body_alphas) = generate_body_color_sequences(&mut rng, args.num_steps_sim);

    // 4) bounding box
    println!("STAGE 4/8: Determining bounding box...");
    let (min_x, max_x, min_y, max_y) = bounding_box(&positions);
    println!(
        "   => bounding box in X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]",
        min_x, max_x, min_y, max_y
    );

    // pick blur radius
    let (blur_radius_fraction, blur_strength, blur_core_brightness) =
        if args.special { (0.4, 32.0, 20.0) } else { (0.08, 6.0, 4.0) };
    let smaller_dim = width.min(height) as f64;
    let blur_radius_px = (blur_radius_fraction * smaller_dim).round() as usize;

    // 5) pass 1 => gather histogram
    println!("STAGE 5/8: PASS 1 => building global histogram (no frames saved)...");
    let frame_rate = 60;
    let target_frames = 1800; // ~30 seconds at 60 FPS
    let frame_interval =
        if target_frames > 0 { (args.num_steps_sim / target_frames).max(1) } else { 1 };

    let mut all_r = Vec::new();
    let mut all_g = Vec::new();
    let mut all_b = Vec::new();

    pass_1_build_histogram(
        &positions,
        &colors,
        &body_alphas,
        width,
        height,
        blur_radius_px,
        blur_strength,
        blur_core_brightness,
        frame_interval,
        &mut all_r,
        &mut all_g,
        &mut all_b,
    );

    // 6) compute black/white/gamma
    println!("STAGE 6/8: Determining global black/white/gamma...");
    let (black_r, white_r, black_g, white_g, black_b, white_b, gamma) = compute_black_white_gamma(
        &mut all_r,
        &mut all_g,
        &mut all_b,
        args.clip_black,
        args.clip_white,
        args.levels_gamma,
    );
    println!(
        "   => black_r={:.3}, white_r={:.3}, black_g={:.3}, white_g={:.3}, black_b={:.3}, white_b={:.3}, gamma={:.3}",
        black_r, white_r, black_g, white_g, black_b, white_b, gamma
    );

    all_r.clear();
    all_r.shrink_to_fit();
    all_g.clear();
    all_g.shrink_to_fit();
    all_b.clear();
    all_b.shrink_to_fit();

    // 7) pass 2 => final frames to FFmpeg
    println!("STAGE 7/8: PASS 2 => generating final frames + piping to FFmpeg...");
    let vid_path = format!("vids/{}.mp4", args.file_name);

    let mut last_frame_png: Option<ImageBuffer<Rgb<u8>, Vec<u8>>> = None;
    {
        let frames_writer = |out: &mut dyn Write| -> Result<(), Box<dyn Error>> {
            pass_2_write_frames(
                &positions,
                &colors,
                &body_alphas,
                width,
                height,
                blur_radius_px,
                blur_strength,
                blur_core_brightness,
                frame_interval,
                black_r,
                white_r,
                black_g,
                white_g,
                black_b,
                white_b,
                gamma,
                |buf_8bit| {
                    out.write_all(buf_8bit)?;
                    Ok(())
                },
                &mut last_frame_png,
            )?;
            Ok(())
        };
        create_video_from_frames_singlepass(width, height, frame_rate, frames_writer, &vid_path)?;
    }

    // 8) Save final image
    println!("STAGE 8/8: Saving final single image as PNG...");
    if let Some(ref final_image) = last_frame_png {
        let png_path = format!("pics/{}.png", args.file_name);
        if let Err(e) = save_image_as_png(final_image, &png_path) {
            eprintln!("Error saving PNG: {e}");
        }
    } else {
        eprintln!("No final frame found => no PNG written.");
    }

    println!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );
    Ok(())
}
