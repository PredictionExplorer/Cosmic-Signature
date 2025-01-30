use clap::Parser;
use hex;
use image::{DynamicImage, ImageBuffer, Rgb, Rgba, RgbaImage};
use kiddo::float::kdtree::KdTree;
use kiddo::SquaredEuclidean;
use line_drawing::Bresenham;
use na::Vector3;
use nalgebra as na;
use palette::{FromColor, Hsl, Srgb};
use rayon::prelude::*;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use sha3::Digest; // Important trait import
use sha3::Sha3_256;
use statrs::statistics::Statistics;
use std::f64::{INFINITY, NEG_INFINITY};
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

/// We embed data of dimension LLE_M for the Lyapunov exponent calculation.
const LLE_M: usize = 3;
/// The branching factor for the KdTree. (Used in `kiddo`.)
const B: usize = 32;
/// Gravitational constant, for convenience we use a typical G=9.8
const G: f64 = 9.8;

// ======================================================================
// Command‐line arguments
// ======================================================================
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate & visualize the three-body problem (lines-only image + video, percentile-based auto-level)."
)]
struct Args {
    /// Hex seed for random generation (e.g. --seed 00 or 0xABC123)
    #[arg(long, default_value = "0x100000")]
    seed: String,

    /// Base file name (no extension)
    #[arg(long, default_value = "output")]
    file_name: String,

    /// Number of timesteps to simulate
    #[arg(long, default_value_t = 1_000_000)]
    num_steps: usize,

    /// Number of random simulations to consider
    #[arg(long, default_value_t = 10_000)]
    num_sims: usize,

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

    /// Max points for chaos measure sub-sampling
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,

    /// Chaos measure weight
    #[arg(long, default_value_t = 3.0)]
    chaos_weight: f64,

    /// Average perimeter weight
    #[arg(long, default_value_t = 1.0)]
    perimeter_weight: f64,

    /// Total distance weight
    #[arg(long, default_value_t = 2.0)]
    dist_weight: f64,

    /// Lyapunov exponent weight
    #[arg(long, default_value_t = 2.5)]
    lyap_weight: f64,

    /// Fraction of pixels clipped to black
    #[arg(long, default_value_t = 0.01)]
    clip_black: f64,

    /// Fraction of pixels clipped to white
    #[arg(long, default_value_t = 0.99)]
    clip_white: f64,

    /// Gamma correction after clipping/remapping
    #[arg(long, default_value_t = 1.0)]
    levels_gamma: f64,

    /// Image/video width/height in pixels
    #[arg(long, default_value_t = 1800)]
    frame_size: u32,

    /// Fraction of the smaller image dimension to use as the blur radius
    /// e.g. 0.01 = 1% of min(width,height)
    #[arg(long, default_value_t = 0.01)]
    blur_radius_fraction: f64,

    /// How strongly the blurred line is added
    #[arg(long, default_value_t = 1.0)]
    blur_strength: f64,

    /// Brightness multiplier for the sharp core line
    #[arg(long, default_value_t = 1.0)]
    blur_core_brightness: f64,
}

// ======================================================================
// Our custom RNG (SHA3-based)
// ======================================================================
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
}

// ======================================================================
// Three‐Body Simulation Logic
// ======================================================================
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

/// One Verlet integration step for all bodies
fn verlet_step(bodies: &mut [Body], dt: f64) {
    let positions: Vec<_> = bodies.iter().map(|b| b.position).collect();
    let masses: Vec<_> = bodies.iter().map(|b| b.mass).collect();

    // First half‐kick
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

    // Second half‐kick
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

/// Run a warm‐up pass, then collect body positions over `num_steps` steps
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;

    // Warm up
    for _ in 0..num_steps {
        verlet_step(&mut bodies, dt);
    }

    // Record
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

/// Calculate total energy = sum(kinetic) + sum(potential)
fn calculate_total_energy(bodies: &[Body]) -> f64 {
    let mut kinetic = 0.0;
    let mut potential = 0.0;
    for b in bodies {
        kinetic += 0.5 * b.mass * b.velocity.norm_squared();
    }
    for i in 0..bodies.len() {
        for j in (i + 1)..bodies.len() {
            let r = (bodies[i].position - bodies[j].position).norm();
            if r > 1e-10 {
                potential += -G * bodies[i].mass * bodies[j].mass / r;
            }
        }
    }
    kinetic + potential
}

fn calculate_total_angular_momentum(bodies: &[Body]) -> Vector3<f64> {
    let mut total_l = Vector3::zeros();
    for b in bodies {
        total_l += b.mass * b.position.cross(&b.velocity);
    }
    total_l
}

// ======================================================================
// Chaos & Metric Calculations
// ======================================================================
fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let n = input.len();
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    let mut complex_input: Vec<Complex<f64>> =
        input.iter().map(|&v| Complex::new(v, 0.0)).collect();
    fft.process(&mut complex_input);
    complex_input
}

fn average_triangle_perimeter(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let len = positions[0].len();
    if len < 1 {
        return 0.0;
    }
    let mut sum_perim = 0.0;
    for step in 0..len {
        let p1 = positions[0][step];
        let p2 = positions[1][step];
        let p3 = positions[2][step];
        let d12 = (p1 - p2).norm();
        let d23 = (p2 - p3).norm();
        let d31 = (p3 - p1).norm();
        sum_perim += d12 + d23 + d31;
    }
    sum_perim / (len as f64)
}

fn total_distance(positions: &[Vec<Vector3<f64>>]) -> f64 {
    // We normalize positions into [0..1] bounding box first
    let mut new_positions = positions.to_vec();
    normalize_positions_for_analysis(&mut new_positions);

    let mut total_dist = 0.0;
    for body_idx in 0..new_positions.len() {
        for step_idx in 1..new_positions[body_idx].len() {
            let p1 = new_positions[body_idx][step_idx];
            let p0 = new_positions[body_idx][step_idx - 1];
            let dx = p1[0] - p0[0];
            let dy = p1[1] - p0[1];
            total_dist += (dx * dx + dy * dy).sqrt();
        }
    }
    total_dist
}

fn normalize_positions_for_analysis(positions: &mut [Vec<Vector3<f64>>]) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for body_pos in positions.iter() {
        for pos in body_pos {
            let px = pos[0];
            let py = pos[1];
            if px < min_x {
                min_x = px;
            }
            if px > max_x {
                max_x = px;
            }
            if py < min_y {
                min_y = py;
            }
            if py > max_y {
                max_y = py;
            }
        }
    }

    let x_center = (max_x + min_x) / 2.0;
    let y_center = (max_y + min_y) / 2.0;
    let mut range = (max_x - min_x).max(max_y - min_y) * 1.1;
    if range < 1e-14 {
        range = 1.0;
    }

    let adj_min_x = x_center - (range / 2.0);
    let adj_min_y = y_center - (range / 2.0);

    for body_pos in positions.iter_mut() {
        for pos in body_pos.iter_mut() {
            pos[0] = (pos[0] - adj_min_x) / range;
            pos[1] = (pos[1] - adj_min_y) / range;
        }
    }
}

/// A measure of “non‐chaoticness”: lower = more regular orbits
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

/// Approximates the Lyapunov exponent for a 1D time series, embedded in 3D
fn lyapunov_exponent_kdtree(data: &[f64], tau: usize, max_iter: usize) -> f64 {
    if data.len() < (LLE_M - 1) * tau + 1 {
        return 0.0;
    }

    // Embed
    let embedded: Vec<[f64; LLE_M]> = (0..(data.len() - (LLE_M - 1) * tau))
        .map(|i| [data[i], data[i + tau], data[i + 2 * tau]])
        .collect();

    let emb_len = embedded.len();
    if emb_len < 2 {
        return 0.0;
    }

    // Build KD-tree
    let mut kdtree: KdTree<f64, u64, LLE_M, B, u32> = KdTree::new();
    for (i, point) in embedded.iter().enumerate() {
        kdtree.add(point, i as u64);
    }

    // For each point, find nearest neighbor distinct from itself
    let mut divergence = vec![0.0; max_iter];
    let mut counts = vec![0usize; max_iter];

    for i in 0..emb_len {
        let query = &embedded[i];
        let nn_buffer = kdtree.nearest_n::<SquaredEuclidean>(query, 2);
        let nn1 = nn_buffer[0];
        let nn2 = nn_buffer[1];

        // The nearest "other" point
        let nn_id = if nn1.item == i as u64 { nn2.item as usize } else { nn1.item as usize };

        let allowed_steps = max_iter.min(emb_len - 1 - i).min(emb_len - 1 - nn_id);

        for k in 0..allowed_steps {
            let dist_i = (0..LLE_M)
                .map(|d| (embedded[i + k][d] - embedded[nn_id + k][d]).powi(2))
                .sum::<f64>()
                .sqrt();
            divergence[k] += dist_i;
            counts[k] += 1;
        }
    }

    if max_iter < 2 {
        return 0.0;
    }

    // Fit slope of log(divergence) vs. time steps
    let log_divergence: Vec<f64> = (0..max_iter)
        .map(|k| if counts[k] > 0 { (divergence[k] / counts[k] as f64).ln() } else { 0.0 })
        .collect();

    let x_vals: Vec<f64> = (0..max_iter).map(|x| x as f64).collect();
    let mean_x = x_vals.iter().copied().mean();
    let mean_y = log_divergence.iter().copied().mean();

    let mut numerator = 0.0;
    let mut denominator = 0.0;
    for i in 0..max_iter {
        let dx = x_vals[i] - mean_x;
        numerator += dx * (log_divergence[i] - mean_y);
        denominator += dx * dx;
    }

    if denominator.abs() < 1e-14 {
        0.0
    } else {
        numerator / denominator
    }
}

// ======================================================================
// Borda‐based orbit selection
// ======================================================================
#[derive(Debug, Clone)]
struct TrajectoryResult {
    chaos: f64,
    avg_perimeter: f64,
    total_dist: f64,
    lyap_exp: f64,
    chaos_pts: usize,
    perimeter_pts: usize,
    dist_pts: usize,
    lyap_pts: usize,
    total_score: usize,
    total_score_weighted: f64,
}

/// Randomly sample many orbits, compute chaos & geometry metrics, do a Borda ranking, pick best
fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_iters: usize,
    num_steps_sim: usize,
    num_steps_video: usize,
    max_points: usize,
    chaos_weight: f64,
    perimeter_weight: f64,
    dist_weight: f64,
    lyap_weight: f64,
) -> (Vec<Vec<Vector3<f64>>>, TrajectoryResult, [f64; 3], usize) {
    println!("Running {} simulations to find the best orbit...", num_iters);

    // Generate a list of random initial conditions
    let many_bodies: Vec<Vec<Body>> = (0..num_iters)
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

    // Compute results in parallel
    let results_par: Vec<Option<(TrajectoryResult, usize, [f64; 3])>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(index, bodies)| {
            let total_energy = calculate_total_energy(bodies);
            let ang_mom = calculate_total_angular_momentum(bodies).norm();

            // Filter out orbits that aren’t bound or have negligible angular momentum
            if total_energy >= 0.0 || ang_mom < 1e-3 {
                None
            } else {
                let positions_full = get_positions(bodies.clone(), num_steps_sim);
                let len = positions_full[0].len();
                let factor = (len / max_points).max(1);
                let body1_norms: Vec<f64> =
                    positions_full[0].iter().step_by(factor).map(|p| p.norm()).collect();

                let m1 = bodies[0].mass;
                let m2 = bodies[1].mass;
                let m3 = bodies[2].mass;

                let c = non_chaoticness(m1, m2, m3, &positions_full);
                let p = average_triangle_perimeter(&positions_full);
                let d = total_distance(&positions_full);
                let ly = lyapunov_exponent_kdtree(&body1_norms, 1, 50);

                Some((
                    TrajectoryResult {
                        chaos: c,
                        avg_perimeter: p,
                        total_dist: d,
                        lyap_exp: ly,
                        chaos_pts: 0,
                        perimeter_pts: 0,
                        dist_pts: 0,
                        lyap_pts: 0,
                        total_score: 0,
                        total_score_weighted: 0.0,
                    },
                    index,
                    [m1, m2, m3],
                ))
            }
        })
        .collect();

    // Filter out invalid
    let valid_results: Vec<_> = results_par.into_iter().filter_map(|x| x).collect();
    let valid_count = valid_results.len();
    println!("Number of valid simulations considered: {}/{}", valid_count, num_iters);

    if valid_results.is_empty() {
        panic!("No valid simulations found. Possibly all orbits unbound or zero angular momentum.");
    }

    // For Borda ranking, gather metrics
    let mut info_vec = valid_results;
    let mut chaos_vals = Vec::with_capacity(info_vec.len());
    let mut perimeter_vals = Vec::with_capacity(info_vec.len());
    let mut dist_vals = Vec::with_capacity(info_vec.len());
    let mut lyap_vals = Vec::with_capacity(info_vec.len());

    for (i, (tr, _, _)) in info_vec.iter().enumerate() {
        chaos_vals.push((tr.chaos, i));
        perimeter_vals.push((tr.avg_perimeter, i));
        dist_vals.push((tr.total_dist, i));
        lyap_vals.push((tr.lyap_exp, i));
    }

    fn assign_borda_scores(mut vals: Vec<(f64, usize)>, higher_better: bool) -> Vec<usize> {
        if higher_better {
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = vals.len();
        let mut points_for_index = vec![0; n];
        for (rank, (_, idx)) in vals.into_iter().enumerate() {
            // Borda: n for best, n-1 for next, etc.
            let score = n - rank;
            points_for_index[idx] = score;
        }
        points_for_index
    }

    // chaos: lower is better
    let chaos_points = assign_borda_scores(chaos_vals, false);
    // perimeter: higher is better
    let perimeter_points = assign_borda_scores(perimeter_vals, true);
    // distance: higher better
    let dist_points = assign_borda_scores(dist_vals, true);
    // lyap exponent: higher better
    let lyap_points = assign_borda_scores(lyap_vals, true);

    // Sum them up
    for (i, (tr, _, _)) in info_vec.iter_mut().enumerate() {
        tr.chaos_pts = chaos_points[i];
        tr.perimeter_pts = perimeter_points[i];
        tr.dist_pts = dist_points[i];
        tr.lyap_pts = lyap_points[i];
        tr.total_score = chaos_points[i] + perimeter_points[i] + dist_points[i] + lyap_points[i];
        tr.total_score_weighted = (chaos_points[i] as f64 * chaos_weight)
            + (perimeter_points[i] as f64 * perimeter_weight)
            + (dist_points[i] as f64 * dist_weight)
            + (lyap_points[i] as f64 * lyap_weight);
    }

    // Pick the best
    let (_, best_item) = info_vec
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| {
            a.0.total_score_weighted.partial_cmp(&b.0.total_score_weighted).unwrap()
        })
        .unwrap();

    let best_tr = best_item.0.clone();
    let best_bodies_index = best_item.1;
    let best_masses = best_item.2;

    // Re-run with num_steps_video
    let chosen_bodies = &many_bodies[best_bodies_index];
    let positions_best = get_positions(chosen_bodies.clone(), num_steps_video);

    (positions_best, best_tr, best_masses, valid_count)
}

// ======================================================================
// Gaussian blur (2-pass, separable) for an in-memory buffer of (r,g,b) floats
// ======================================================================
fn build_gaussian_kernel(radius: usize) -> Vec<f64> {
    if radius == 0 {
        return vec![1.0]; // trivial "no-blur" kernel
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
    // Normalize
    for v in kernel.iter_mut() {
        *v /= sum;
    }
    kernel
}

fn gaussian_blur_1d(
    input: &[(f64, f64, f64)],
    output: &mut [(f64, f64, f64)],
    width: usize,
    height: usize,
    kernel: &[f64],
    radius: usize,
    horizontal: bool,
) {
    // If radius == 0, skip
    if radius == 0 {
        output.copy_from_slice(input);
        return;
    }
    output.fill((0.0, 0.0, 0.0));
    let k_len = kernel.len();

    if horizontal {
        for y in 0..height {
            let row_start = y * width;
            for x in 0..width {
                let mut rsum = 0.0;
                let mut gsum = 0.0;
                let mut bsum = 0.0;
                for k in 0..k_len {
                    let dx = k as isize - radius as isize;
                    let xx = (x as isize + dx).clamp(0, width as isize - 1) as usize;
                    let pix = input[row_start + xx];
                    let w = kernel[k];
                    rsum += pix.0 * w;
                    gsum += pix.1 * w;
                    bsum += pix.2 * w;
                }
                output[row_start + x] = (rsum, gsum, bsum);
            }
        }
    } else {
        // Vertical pass
        for x in 0..width {
            for y in 0..height {
                let mut rsum = 0.0;
                let mut gsum = 0.0;
                let mut bsum = 0.0;
                for k in 0..k_len {
                    let dy = k as isize - radius as isize;
                    let yy = (y as isize + dy).clamp(0, height as isize - 1) as usize;
                    let pix = input[yy * width + x];
                    let w = kernel[k];
                    rsum += pix.0 * w;
                    gsum += pix.1 * w;
                    bsum += pix.2 * w;
                }
                output[y * width + x] = (rsum, gsum, bsum);
            }
        }
    }
}

fn gaussian_blur_2d(buffer: &mut [(f64, f64, f64)], width: usize, height: usize, radius: usize) {
    if radius == 0 {
        return;
    }
    let kernel = build_gaussian_kernel(radius);
    // Temp for 1D pass
    let mut temp = vec![(0.0, 0.0, 0.0); width * height];
    gaussian_blur_1d(buffer, &mut temp, width, height, &kernel, radius, true); // horizontal pass
    gaussian_blur_1d(&temp, buffer, width, height, &kernel, radius, false); // vertical pass
}

// ======================================================================
// Lines‐Only Drawing with Gaussian Blur approach
// ======================================================================

/// Draw a single line segment with a "glow" approach:
/// 1) Draw line into a temp buffer
/// 2) Gaussian-blur that temp buffer
/// 3) Add (blur_strength) of blurred line to main accum
/// 4) Draw a crisp line directly on accum (multiplied by blur_core_brightness)
fn draw_line_segment_additive_gradient_with_blur(
    accum: &mut [(f64, f64, f64)],
    width: u32,
    height: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    col0: Rgb<u8>,
    col1: Rgb<u8>,
    blur_radius_px: usize,
    blur_strength: f64,
    blur_core_brightness: f64,
) {
    let w_usize = width as usize;
    let h_usize = height as usize;
    let npix = w_usize * h_usize;

    // 1) Draw the line into a separate temp buffer
    let mut temp = vec![(0.0, 0.0, 0.0); npix];

    let start = (x0.round() as i32, y0.round() as i32);
    let end = (x1.round() as i32, y1.round() as i32);

    let points: Vec<(i32, i32)> = Bresenham::new(start, end).collect();
    let n = points.len();
    if n == 0 {
        return;
    }

    for (i, (xx, yy)) in points.into_iter().enumerate() {
        if xx < 0 || xx >= width as i32 || yy < 0 || yy >= height as i32 {
            continue;
        }
        let idx = (yy as usize) * (width as usize) + (xx as usize);

        let t = if n == 1 { 0.0 } else { i as f64 / (n - 1) as f64 };
        let r = (col0[0] as f64) * (1.0 - t) + (col1[0] as f64) * t;
        let g = (col0[1] as f64) * (1.0 - t) + (col1[1] as f64) * t;
        let b = (col0[2] as f64) * (1.0 - t) + (col1[2] as f64) * t;

        // You can adjust this base weight if you want more/less color
        let small_weight = 1.0;
        temp[idx].0 += r * small_weight;
        temp[idx].1 += g * small_weight;
        temp[idx].2 += b * small_weight;
    }

    // 2) Apply Gaussian blur to temp
    gaussian_blur_2d(&mut temp, w_usize, h_usize, blur_radius_px);

    // 3) Add blurred line to main accum
    //    scaled by "blur_strength"
    for i in 0..npix {
        accum[i].0 += temp[i].0 * blur_strength;
        accum[i].1 += temp[i].1 * blur_strength;
        accum[i].2 += temp[i].2 * blur_strength;
    }

    // 4) Draw a crisp line on top (for bright "core")
    //    using a brightness multiplier
    let start = (x0.round() as i32, y0.round() as i32);
    let end = (x1.round() as i32, y1.round() as i32);
    let points2: Vec<(i32, i32)> = Bresenham::new(start, end).collect();
    let n2 = points2.len();
    for (i, (xx, yy)) in points2.into_iter().enumerate() {
        if xx < 0 || xx >= width as i32 || yy < 0 || yy >= height as i32 {
            continue;
        }
        let idx = (yy as usize) * (width as usize) + (xx as usize);

        let t = if n2 == 1 { 0.0 } else { i as f64 / (n2 - 1) as f64 };
        let r = (col0[0] as f64) * (1.0 - t) + (col1[0] as f64) * t;
        let g = (col0[1] as f64) * (1.0 - t) + (col1[1] as f64) * t;
        let b = (col0[2] as f64) * (1.0 - t) + (col1[2] as f64) * t;

        accum[idx].0 += r * blur_core_brightness;
        accum[idx].1 += g * blur_core_brightness;
        accum[idx].2 += b * blur_core_brightness;
    }
}

/// Generate a color gradient for a single body across `length` steps
fn generate_color_gradient(rng: &mut Sha3RandomByteStream, length: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    let mut hue = rng.gen_range(0.0, 360.0);

    for _ in 0..length {
        // Tiny random walk in hue
        if rng.next_byte() & 1 == 0 {
            hue += 0.1;
        } else {
            hue -= 0.1;
        }
        if hue < 0.0 {
            hue += 360.0;
        } else if hue > 360.0 {
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

/// Generate color gradients for all 3 bodies
fn generate_body_color_sequences(
    rng: &mut Sha3RandomByteStream,
    length: usize,
) -> Vec<Vec<Rgb<u8>>> {
    vec![
        generate_color_gradient(rng, length),
        generate_color_gradient(rng, length),
        generate_color_gradient(rng, length),
    ]
}

/// Single lines‐only image (additive color) with all timesteps
/// Now uses blurred line drawing in each step
fn generate_lines_only_single_image(
    positions: &[Vec<Vector3<f64>>],
    body_colors: &[Vec<Rgb<u8>>],
    out_size: u32,
    blur_radius_fraction: f64,
    blur_strength: f64,
    blur_core_brightness: f64,
) -> RgbaImage {
    println!("Generating lines-only single image with Gaussian-blurred lines...");

    let width = out_size;
    let height = out_size;
    let npix = (width * height) as usize;
    let total_steps = positions[0].len();
    if total_steps == 0 {
        return RgbaImage::new(width, height);
    }

    // 1) Find bounding box
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;
    for body_idx in 0..positions.len() {
        for &p in &positions[body_idx] {
            if p[0] < min_x {
                min_x = p[0];
            }
            if p[0] > max_x {
                max_x = p[0];
            }
            if p[1] < min_y {
                min_y = p[1];
            }
            if p[1] > max_y {
                max_y = p[1];
            }
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
    {
        let wx = max_x - min_x;
        let wy = max_y - min_y;
        min_x -= 0.05 * wx;
        max_x += 0.05 * wx;
        min_y -= 0.05 * wy;
        max_y += 0.05 * wy;
    }

    // Helper to convert from world coords to pixel coords
    let to_pixel = |x: f64, y: f64| -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((x - min_x) / ww) * (width as f64);
        let py = ((y - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    // Compute an integer blur radius based on fraction
    let smaller_dim = (width as f64).min(height as f64);
    let blur_radius_px = (blur_radius_fraction * smaller_dim).round() as usize;

    // 2) We'll accumulate in "accum"
    let accum_final = (0..total_steps)
        .into_par_iter()
        .fold(
            || vec![(0.0, 0.0, 0.0); npix],
            |mut local_accum, step| {
                let p0 = positions[0][step];
                let p1 = positions[1][step];
                let p2 = positions[2][step];

                let c0 = body_colors[0][step.min(body_colors[0].len() - 1)];
                let c1 = body_colors[1][step.min(body_colors[1].len() - 1)];
                let c2 = body_colors[2][step.min(body_colors[2].len() - 1)];

                let (x0, y0) = to_pixel(p0[0], p0[1]);
                let (x1, y1) = to_pixel(p1[0], p1[1]);
                let (x2, y2) = to_pixel(p2[0], p2[1]);

                // Draw lines with blur
                draw_line_segment_additive_gradient_with_blur(
                    &mut local_accum,
                    width,
                    height,
                    x0,
                    y0,
                    x1,
                    y1,
                    c0,
                    c1,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                );
                draw_line_segment_additive_gradient_with_blur(
                    &mut local_accum,
                    width,
                    height,
                    x1,
                    y1,
                    x2,
                    y2,
                    c1,
                    c2,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                );
                draw_line_segment_additive_gradient_with_blur(
                    &mut local_accum,
                    width,
                    height,
                    x2,
                    y2,
                    x0,
                    y0,
                    c2,
                    c0,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                );

                local_accum
            },
        )
        .reduce(
            || vec![(0.0, 0.0, 0.0); npix],
            |mut acc, local_acc| {
                for (i, (r, g, b)) in local_acc.into_iter().enumerate() {
                    acc[i].0 += r;
                    acc[i].1 += g;
                    acc[i].2 += b;
                }
                acc
            },
        );

    // 3) Convert accum -> RgbaImage
    // Find maxval for scaling
    let mut maxval = 0.0;
    for &(r, g, b) in &accum_final {
        let m = r.max(g).max(b);
        if m > maxval {
            maxval = m;
        }
    }
    if maxval < 1e-14 {
        maxval = 1.0;
    }

    let mut img = RgbaImage::new(width, height);
    for (i, pixel) in img.pixels_mut().enumerate() {
        let (r, g, b) = accum_final[i];
        let rr = (r / maxval).clamp(0.0, 1.0) * 255.0;
        let gg = (g / maxval).clamp(0.0, 1.0) * 255.0;
        let bb = (b / maxval).clamp(0.0, 1.0) * 255.0;
        *pixel = Rgba([rr as u8, gg as u8, bb as u8, 255]);
    }

    img
}

/// Generate frames of lines‐only drawings in color‐additive mode (with blur).
/// Each frame i includes lines from steps [0..i*frame_interval).
fn generate_lines_only_frames_raw(
    positions: &[Vec<Vector3<f64>>],
    body_colors: &[Vec<Rgb<u8>>],
    out_size: u32,
    frame_interval: usize,
    blur_radius_fraction: f64,
    blur_strength: f64,
    blur_core_brightness: f64,
) -> Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    let total_steps = positions[0].len();
    if total_steps == 0 {
        return vec![];
    }
    let total_frames =
        if frame_interval == 0 { 1 } else { (total_steps + frame_interval - 1) / frame_interval };

    // bounding box
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;
    for body_idx in 0..positions.len() {
        for &p in &positions[body_idx] {
            if p[0] < min_x {
                min_x = p[0];
            }
            if p[0] > max_x {
                max_x = p[0];
            }
            if p[1] < min_y {
                min_y = p[1];
            }
            if p[1] > max_y {
                max_y = p[1];
            }
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
    {
        let wx = max_x - min_x;
        let wy = max_y - min_y;
        min_x -= 0.05 * wx;
        max_x += 0.05 * wx;
        min_y -= 0.05 * wy;
        max_y += 0.05 * wy;
    }

    let width = out_size;
    let height = out_size;
    let w_usize = width as usize;
    let npix = (width * height) as usize;
    let to_pixel = |x: f64, y: f64| {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((x - min_x) / ww) * (width as f64);
        let py = ((y - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    // Compute blur radius in pixels
    let smaller_dim = (width as f64).min(height as f64);
    let blur_radius_px = (blur_radius_fraction * smaller_dim).round() as usize;

    // We'll parallelize by frame
    (0..total_frames)
        .into_par_iter()
        .map(|frame_idx| {
            let clamp_end = ((frame_idx + 1) * frame_interval).min(total_steps);

            // accum array of (r,g,b)
            let mut accum = vec![(0.0, 0.0, 0.0); npix];

            // For all steps up to clamp_end, draw lines (with blur)
            for step in 0..clamp_end {
                let p0 = positions[0][step];
                let p1 = positions[1][step];
                let p2 = positions[2][step];

                let c0 = body_colors[0][step.min(body_colors[0].len() - 1)];
                let c1 = body_colors[1][step.min(body_colors[1].len() - 1)];
                let c2 = body_colors[2][step.min(body_colors[2].len() - 1)];

                let (x0, y0) = to_pixel(p0[0], p0[1]);
                let (x1, y1) = to_pixel(p1[0], p1[1]);
                let (x2, y2) = to_pixel(p2[0], p2[1]);

                draw_line_segment_additive_gradient_with_blur(
                    &mut accum,
                    width,
                    height,
                    x0,
                    y0,
                    x1,
                    y1,
                    c0,
                    c1,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                );
                draw_line_segment_additive_gradient_with_blur(
                    &mut accum,
                    width,
                    height,
                    x1,
                    y1,
                    x2,
                    y2,
                    c1,
                    c2,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                );
                draw_line_segment_additive_gradient_with_blur(
                    &mut accum,
                    width,
                    height,
                    x2,
                    y2,
                    x0,
                    y0,
                    c2,
                    c0,
                    blur_radius_px,
                    blur_strength,
                    blur_core_brightness,
                );
            }

            // Scale accum -> [0..255]
            let mut maxval = 0.0;
            for (r, g, b) in &accum {
                let m = r.max(*g).max(*b);
                if m > maxval {
                    maxval = m;
                }
            }
            if maxval < 1e-14 {
                maxval = 1.0;
            }

            let mut img = ImageBuffer::new(width, height);
            for y in 0..height {
                for x in 0..width {
                    let idx = (y as usize) * (w_usize) + (x as usize);
                    let (r, g, b) = accum[idx];
                    let rr = (r / maxval).clamp(0.0, 1.0) * 255.0;
                    let gg = (g / maxval).clamp(0.0, 1.0) * 255.0;
                    let bb = (b / maxval).clamp(0.0, 1.0) * 255.0;
                    img.put_pixel(x, y, Rgb([rr as u8, gg as u8, bb as u8]));
                }
            }
            img
        })
        .collect()
}

// ======================================================================
// Auto‐leveling (histogram‐based percentile clipping + gamma)
// ======================================================================
fn build_cdf(hist: &[u32; 256]) -> Vec<u32> {
    let mut cdf = vec![0u32; 256];
    let mut running = 0u32;
    for (i, &count) in hist.iter().enumerate() {
        running += count;
        cdf[i] = running;
    }
    cdf
}

fn find_percentile_cut(cdf: &[u32], cutoff_count: u32, from_left: bool) -> u8 {
    if from_left {
        for i in 0..256 {
            if cdf[i] >= cutoff_count {
                return i as u8;
            }
        }
        255
    } else {
        for i in (0..256).rev() {
            if cdf[i] <= cutoff_count {
                return i as u8;
            }
        }
        0
    }
}

fn remap_and_gamma(c: u8, black_cut: u8, white_cut: u8, gamma: f64) -> u8 {
    let c_val = c as f64;
    let b_val = black_cut as f64;
    let w_val = white_cut as f64;
    if w_val <= b_val {
        return c;
    }
    let mut t = (c_val - b_val) / (w_val - b_val);
    t = t.clamp(0.0, 1.0);
    t = t.powf(gamma);
    (t * 255.0).round().clamp(0.0, 255.0) as u8
}

/// Auto‐levels a sequence of frames in parallel
fn auto_levels_percentile_frames(
    frames: &mut [ImageBuffer<Rgb<u8>, Vec<u8>>],
    clip_black: f64,
    clip_white: f64,
    gamma: f64,
) {
    if frames.is_empty() {
        return;
    }

    let (mut hist_r, mut hist_g, mut hist_b) = ([0u32; 256], [0u32; 256], [0u32; 256]);
    for frame in frames.iter() {
        for px in frame.pixels() {
            hist_r[px[0] as usize] += 1;
            hist_g[px[1] as usize] += 1;
            hist_b[px[2] as usize] += 1;
        }
    }

    let total_pixels = frames.len() as u32 * frames[0].width() as u32 * frames[0].height() as u32;
    let black_count = (clip_black * total_pixels as f64).round() as u32;
    let white_count = (clip_white * total_pixels as f64).round() as u32;

    let cdf_r = build_cdf(&hist_r);
    let cdf_g = build_cdf(&hist_g);
    let cdf_b = build_cdf(&hist_b);

    let black_cut_r = find_percentile_cut(&cdf_r, black_count, true);
    let black_cut_g = find_percentile_cut(&cdf_g, black_count, true);
    let black_cut_b = find_percentile_cut(&cdf_b, black_count, true);

    let white_cut_r = find_percentile_cut(&cdf_r, white_count, false);
    let white_cut_g = find_percentile_cut(&cdf_g, white_count, false);
    let white_cut_b = find_percentile_cut(&cdf_b, white_count, false);

    frames.par_iter_mut().for_each(|frame| {
        for px in frame.pixels_mut() {
            px[0] = remap_and_gamma(px[0], black_cut_r, white_cut_r, gamma);
            px[1] = remap_and_gamma(px[1], black_cut_g, white_cut_g, gamma);
            px[2] = remap_and_gamma(px[2], black_cut_b, white_cut_b, gamma);
        }
    });
}

/// Auto‐levels a single dynamic image
fn auto_levels_percentile_image(
    input: &DynamicImage,
    clip_black: f64,
    clip_white: f64,
    gamma: f64,
) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let rgb_img = input.to_rgb8();
    let (width, height) = rgb_img.dimensions();

    let mut hist_r = [0u32; 256];
    let mut hist_g = [0u32; 256];
    let mut hist_b = [0u32; 256];
    for px in rgb_img.pixels() {
        hist_r[px[0] as usize] += 1;
        hist_g[px[1] as usize] += 1;
        hist_b[px[2] as usize] += 1;
    }

    let total_pixels = (width * height) as u32;
    let black_count = (clip_black * total_pixels as f64).round() as u32;
    let white_count = (clip_white * total_pixels as f64).round() as u32;

    let cdf_r = build_cdf(&hist_r);
    let cdf_g = build_cdf(&hist_g);
    let cdf_b = build_cdf(&hist_b);

    let black_cut_r = find_percentile_cut(&cdf_r, black_count, true);
    let black_cut_g = find_percentile_cut(&cdf_g, black_count, true);
    let black_cut_b = find_percentile_cut(&cdf_b, black_count, true);

    let white_cut_r = find_percentile_cut(&cdf_r, white_count, false);
    let white_cut_g = find_percentile_cut(&cdf_g, white_count, false);
    let white_cut_b = find_percentile_cut(&cdf_b, white_count, false);

    let mut out_img = ImageBuffer::new(width, height);
    for (x, y, pixel) in out_img.enumerate_pixels_mut() {
        let orig = rgb_img.get_pixel(x, y);
        let nr = remap_and_gamma(orig[0], black_cut_r, white_cut_r, gamma);
        let ng = remap_and_gamma(orig[1], black_cut_g, white_cut_g, gamma);
        let nb = remap_and_gamma(orig[2], black_cut_b, white_cut_b, gamma);
        *pixel = Rgb([nr, ng, nb]);
    }
    out_img
}

// ======================================================================
// FFmpeg video creation from raw frames
// ======================================================================
fn create_video_from_frames_in_memory(
    frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>],
    output_file: &str,
    frame_rate: u32,
) {
    if frames.is_empty() {
        eprintln!("No frames to encode, skipping video creation.");
        return;
    }

    println!("Generating video (raw -> H.264) with FFmpeg: {}", output_file);

    let width = frames[0].width();
    let height = frames[0].height();

    let mut command = Command::new("ffmpeg");
    command
        .arg("-y")
        // Read raw frames from stdin
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
        // Let ffmpeg choose how many threads to spawn
        .arg("-threads")
        .arg("0")
        // Encode using libx264
        .arg("-c:v")
        .arg("libx264")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg(output_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut ffmpeg = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            eprintln!("Failed to start ffmpeg: {}", e);
            return;
        }
    };

    // Write frames as raw RGB to ffmpeg
    if let Some(mut child_stdin) = ffmpeg.stdin.take() {
        for frame in frames {
            if let Err(e) = child_stdin.write_all(frame.as_raw()) {
                eprintln!("Failed to write frame data to ffmpeg: {}", e);
                break;
            }
        }
    }

    let output = match ffmpeg.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            eprintln!("Failed waiting for ffmpeg: {}", e);
            return;
        }
    };
    if !output.status.success() {
        eprintln!("FFmpeg error:\n{}", String::from_utf8_lossy(&output.stderr));
    } else {
        println!("Video creation complete: {}", output_file);
    }
}

// ======================================================================
// main
// ======================================================================
fn main() {
    let args = Args::parse();

    // Create output directories if they don't exist
    if let Err(e) = fs::create_dir_all("pics") {
        eprintln!("Could not create 'pics' folder: {}", e);
    }
    if let Err(e) = fs::create_dir_all("vids") {
        eprintln!("Could not create 'vids' folder: {}", e);
    }

    // Prepare RNG
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed_bytes = hex::decode(hex_seed).expect("Invalid hex seed");

    println!(
        "Starting 3-body simulation with lines-only visualization (Gaussian blur on lines)..."
    );

    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // 1) Select best orbit
    let (positions, best_result, best_masses, valid_sims) = select_best_trajectory(
        &mut rng,
        args.num_sims,
        args.num_steps,
        args.num_steps,
        args.max_points,
        args.chaos_weight,
        args.perimeter_weight,
        args.dist_weight,
        args.lyap_weight,
    );

    println!("\nNumber of valid orbits: {}", valid_sims);
    println!("Best orbit Borda breakdown:");
    println!(
        "  Chaos measure = {:.4e}  (Borda pts={}) (lower=better)",
        best_result.chaos, best_result.chaos_pts
    );
    println!(
        "  Avg perimeter = {:.6}   (Borda pts={}) (higher=better)",
        best_result.avg_perimeter, best_result.perimeter_pts
    );
    println!(
        "  Total distance= {:.6}   (Borda pts={}) (higher=better)",
        best_result.total_dist, best_result.dist_pts
    );
    println!(
        "  Lyap exponent = {:.6}   (Borda pts={}) (higher=better)",
        best_result.lyap_exp, best_result.lyap_pts
    );
    println!("  Weighted total = {:.3}", best_result.total_score_weighted);
    println!("  Masses = [{:.2}, {:.2}, {:.2}]", best_masses[0], best_masses[1], best_masses[2]);

    // 2) Generate color sequences (one per body)
    let colors = generate_body_color_sequences(&mut rng, args.num_steps);

    // 3) Single lines‐only image from all steps, auto‐leveled
    let single_img = generate_lines_only_single_image(
        &positions,
        &colors,
        args.frame_size,
        args.blur_radius_fraction,
        args.blur_strength,
        args.blur_core_brightness,
    );
    let dyn_img = DynamicImage::ImageRgba8(single_img);
    let dyn_img_rgb = dyn_img.to_rgb8();
    let dyn_img2 = DynamicImage::ImageRgb8(dyn_img_rgb);

    // Auto‐levels
    let single_img_al = auto_levels_percentile_image(
        &dyn_img2,
        args.clip_black,
        args.clip_white,
        args.levels_gamma,
    );

    // Save PNG
    let png_path = format!("pics/{}.png", args.file_name);
    if let Err(e) = single_img_al.save(&png_path) {
        eprintln!("Error saving lines-only image: {:?}", e);
    } else {
        println!("Saved lines-only image -> {}", png_path);
    }

    // 4) Lines‐only video
    let num_seconds = 30;
    let target_frames = 60 * num_seconds;
    let frame_interval =
        if target_frames > 0 { args.num_steps.saturating_div(target_frames) } else { 1 }.max(1);

    let mut lines_frames = generate_lines_only_frames_raw(
        &positions,
        &colors,
        args.frame_size,
        frame_interval,
        args.blur_radius_fraction,
        args.blur_strength,
        args.blur_core_brightness,
    );

    // Auto‐level the frames
    auto_levels_percentile_frames(
        &mut lines_frames,
        args.clip_black,
        args.clip_white,
        args.levels_gamma,
    );

    // Create video from frames
    let video_filename = format!("vids/{}.mp4", args.file_name);
    create_video_from_frames_in_memory(&lines_frames, &video_filename, 60);

    println!("Done. Created 1 lines image and 1 lines video (with blurred lines).");
}
