use clap::Parser;
use hex;
use image::{codecs::avif::AvifEncoder, DynamicImage, ImageBuffer, ImageEncoder, Rgb};
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
use std::fs::File;
use std::io::{BufWriter, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

/// For Borda metric calculations
const LLE_M: usize = 3; // dimension used in embedding for Lyapunov exponent
const B: usize = 32; // KdTree branching factor
const G: f64 = 9.8; // gravitational constant

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate many random 3-body orbits, pick best by Borda, then generate single image + H.264 MP4 video with global auto-level."
)]
struct Args {
    /// Hex seed for random generation (e.g. --seed 0xABC123)
    #[arg(long, default_value = "0x100033")]
    seed: String,

    /// Base file name (no extension)
    #[arg(long, default_value = "output")]
    file_name: String,

    /// Number of random orbits to consider (Borda)
    #[arg(long, default_value_t = 10_000)]
    num_sims: usize,

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

    /// Borda weighting: average perimeter
    #[arg(long, default_value_t = 1.0)]
    perimeter_weight: f64,

    /// Borda weighting: total distance
    #[arg(long, default_value_t = 2.0)]
    dist_weight: f64,

    /// Borda weighting: lyapunov exponent
    #[arg(long, default_value_t = 2.5)]
    lyap_weight: f64,

    /// Max points for chaos measure sub-sampling
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,

    /// Image/video width/height in pixels
    #[arg(long, default_value_t = 1800)]
    frame_size: u32,

    /// Fraction of the smaller dimension to use as the blur radius
    #[arg(long, default_value_t = 0.01)]
    blur_radius_fraction: f64,

    /// How strongly the blurred line is added
    #[arg(long, default_value_t = 1.0)]
    blur_strength: f64,

    /// Brightness multiplier for the crisp core line
    #[arg(long, default_value_t = 1.0)]
    blur_core_brightness: f64,

    /// If true, skip the Gaussian blur pass and only draw crisp lines
    #[arg(long, default_value_t = false)]
    disable_blur: bool,

    /// Fraction of pixels clipped to black
    #[arg(long, default_value_t = 0.01)]
    clip_black: f64,

    /// Fraction of pixels clipped to white
    #[arg(long, default_value_t = 0.99)]
    clip_white: f64,

    /// Gamma correction after clipping
    #[arg(long, default_value_t = 1.0)]
    levels_gamma: f64,
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

/// Warm up, then collect `num_steps` positions
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

fn average_triangle_perimeter(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let len = positions[0].len();
    if len < 1 {
        return 0.0;
    }
    let mut sum = 0.0;
    for i in 0..len {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];
        sum += (p1 - p2).norm() + (p2 - p3).norm() + (p3 - p1).norm();
    }
    sum / (len as f64)
}

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
    // embed
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

#[derive(Clone)]
struct TrajectoryResult {
    chaos: f64,
    avg_perimeter: f64,
    total_dist: f64,
    lyap_exp: f64,
    // Borda
    chaos_pts: usize,
    perimeter_pts: usize,
    dist_pts: usize,
    lyap_pts: usize,
    total_score: usize,
    total_score_weighted: f64,
}

/// Runs the Borda search in parallel over `num_sims` random orbits.
/// Prints progress ~every 10% of orbits processed.
fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    num_steps_sim: usize,
    max_points: usize,
    chaos_weight: f64,
    perimeter_weight: f64,
    dist_weight: f64,
    lyap_weight: f64,
) -> (Vec<Body>, TrajectoryResult) {
    println!("STAGE 1/7: Borda search over {num_sims} random orbits...");

    // Build many random orbits
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

    // We'll track progress in the parallel loop
    let progress_counter = AtomicUsize::new(0);
    let chunk_size = (num_sims / 10).max(1);

    // Compute in parallel
    let results: Vec<Option<(TrajectoryResult, usize)>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(idx, bodies)| {
            // Update progress
            let local_count = progress_counter.fetch_add(1, Ordering::Relaxed) + 1;
            if local_count % chunk_size == 0 {
                let pct = (local_count as f64 / num_sims as f64) * 100.0;
                println!("   Borda search: {:.0}% done", pct);
            }

            // Basic checks
            let e = calculate_total_energy(bodies);
            let ang = calculate_total_angular_momentum(bodies).norm();
            // skip unbound orbits or negligible ang
            if e >= 0.0 || ang < 1e-3 {
                None
            } else {
                // big simulation
                let positions = get_positions(bodies.clone(), num_steps_sim);
                let len = positions[0].len();
                let factor = (len / max_points).max(1);
                let m1 = bodies[0].mass;
                let m2 = bodies[1].mass;
                let m3 = bodies[2].mass;

                // sub-sample for lyapunov
                let body1_norms: Vec<f64> =
                    positions[0].iter().step_by(factor).map(|p| p.norm()).collect();

                // Evaluate
                let c = non_chaoticness(m1, m2, m3, &positions); // lower is better
                let p = average_triangle_perimeter(&positions);
                let d = total_distance(&positions);
                let ly = lyapunov_exponent_kdtree(&body1_norms, 1, 50);

                let tr = TrajectoryResult {
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
                };
                Some((tr, idx))
            }
        })
        .collect();

    let valid: Vec<_> = results.into_iter().filter_map(|x| x).collect();
    if valid.is_empty() {
        panic!("No valid orbits found (all unbound or zero angular momentum).");
    }

    // Borda arrays
    let mut info_vec = valid;
    let mut chaos_vals = Vec::with_capacity(info_vec.len());
    let mut perim_vals = Vec::with_capacity(info_vec.len());
    let mut dist_vals = Vec::with_capacity(info_vec.len());
    let mut lyap_vals = Vec::with_capacity(info_vec.len());

    for (i, (tr, _)) in info_vec.iter().enumerate() {
        chaos_vals.push((tr.chaos, i));
        perim_vals.push((tr.avg_perimeter, i));
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
        let mut out = vec![0; n];
        for (rank, (_val, idx)) in vals.into_iter().enumerate() {
            let score = n - rank;
            out[idx] = score;
        }
        out
    }

    // chaos lower=better
    let chaos_pts = assign_borda_scores(chaos_vals, false);
    // perimeter higher=better
    let perim_pts = assign_borda_scores(perim_vals, true);
    // distance higher=better
    let dist_pts = assign_borda_scores(dist_vals, true);
    // lyap higher=better
    let lyap_pts = assign_borda_scores(lyap_vals, true);

    for (i, (tr, _)) in info_vec.iter_mut().enumerate() {
        tr.chaos_pts = chaos_pts[i];
        tr.perimeter_pts = perim_pts[i];
        tr.dist_pts = dist_pts[i];
        tr.lyap_pts = lyap_pts[i];
        tr.total_score = chaos_pts[i] + perim_pts[i] + dist_pts[i] + lyap_pts[i];
        tr.total_score_weighted = (chaos_pts[i] as f64 * chaos_weight)
            + (perim_pts[i] as f64 * perimeter_weight)
            + (dist_pts[i] as f64 * dist_weight)
            + (lyap_pts[i] as f64 * lyap_weight);
    }

    // pick best
    let (best_tr, best_idx) = info_vec
        .iter()
        .max_by(|(a, _ai), (b, _bi)| {
            a.total_score_weighted.partial_cmp(&b.total_score_weighted).unwrap()
        })
        .unwrap();

    let best_bodies = many_bodies[*best_idx].clone();
    println!(
        "   => Borda best: Weighted total = {:.3}, chaos={:.3e}, perim={:.3}, dist={:.3}, lyap={:.3}",
        best_tr.total_score_weighted,
        best_tr.chaos,
        best_tr.avg_perimeter,
        best_tr.total_dist,
        best_tr.lyap_exp
    );

    (best_bodies, best_tr.clone())
}

// ========================================================
// Single-pass line drawing => produce frames, final still
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

fn gaussian_blur_2d(buffer: &mut [(f64, f64, f64)], width: usize, height: usize, radius: usize) {
    if radius == 0 {
        return;
    }
    let kernel = build_gaussian_kernel(radius);
    let mut temp = vec![(0.0, 0.0, 0.0); width * height];

    // horizontal
    let k_len = kernel.len();
    for y in 0..height {
        let row_start = y * width;
        for x in 0..width {
            let mut rsum = 0.0;
            let mut gsum = 0.0;
            let mut bsum = 0.0;
            for k in 0..k_len {
                let dx = (k as isize) - (radius as isize);
                let xx = (x as isize + dx).clamp(0, width as isize - 1) as usize;
                let pix = buffer[row_start + xx];
                let w = kernel[k];
                rsum += pix.0 * w;
                gsum += pix.1 * w;
                bsum += pix.2 * w;
            }
            temp[row_start + x] = (rsum, gsum, bsum);
        }
    }
    // vertical
    for x in 0..width {
        for y in 0..height {
            let mut rsum = 0.0;
            let mut gsum = 0.0;
            let mut bsum = 0.0;
            for k in 0..k_len {
                let dy = (k as isize) - (radius as isize);
                let yy = (y as isize + dy).clamp(0, height as isize - 1) as usize;
                let pix = temp[yy * width + x];
                let w = kernel[k];
                rsum += pix.0 * w;
                gsum += pix.1 * w;
                bsum += pix.2 * w;
            }
            buffer[y * width + x] = (rsum, gsum, bsum);
        }
    }
}

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
    disable_blur: bool,
) {
    let w_usize = width as usize;
    let h_usize = height as usize;
    let npix = w_usize * h_usize;

    if !disable_blur && blur_radius_px > 0 {
        // 1) temp buffer
        let mut temp = vec![(0.0, 0.0, 0.0); npix];

        let start = (x0.round() as i32, y0.round() as i32);
        let end = (x1.round() as i32, y1.round() as i32);
        let pts: Vec<(i32, i32)> = Bresenham::new(start, end).collect();
        let n = pts.len();
        for (i, (xx, yy)) in pts.iter().enumerate() {
            if *xx < 0 || *xx >= width as i32 || *yy < 0 || *yy >= height as i32 {
                continue;
            }
            let idx = (*yy as usize) * w_usize + (*xx as usize);

            let t = if n == 1 { 0.0 } else { i as f64 / (n - 1) as f64 };
            let r = (col0[0] as f64) * (1.0 - t) + (col1[0] as f64) * t;
            let g = (col0[1] as f64) * (1.0 - t) + (col1[1] as f64) * t;
            let b = (col0[2] as f64) * (1.0 - t) + (col1[2] as f64) * t;
            temp[idx].0 += r;
            temp[idx].1 += g;
            temp[idx].2 += b;
        }

        // blur
        gaussian_blur_2d(&mut temp, w_usize, h_usize, blur_radius_px);

        // add blurred
        for i in 0..npix {
            accum[i].0 += temp[i].0 * blur_strength;
            accum[i].1 += temp[i].1 * blur_strength;
            accum[i].2 += temp[i].2 * blur_strength;
        }

        // crisp line on top
        for (i, (xx, yy)) in pts.into_iter().enumerate() {
            if xx < 0 || xx >= width as i32 || yy < 0 || yy >= height as i32 {
                continue;
            }
            let idx = (yy as usize) * w_usize + (xx as usize);
            let t = if n == 1 { 0.0 } else { i as f64 / (n - 1) as f64 };
            let r = (col0[0] as f64) * (1.0 - t) + (col1[0] as f64) * t;
            let g = (col0[1] as f64) * (1.0 - t) + (col1[1] as f64) * t;
            let b = (col0[2] as f64) * (1.0 - t) + (col1[2] as f64) * t;

            accum[idx].0 += r * blur_core_brightness;
            accum[idx].1 += g * blur_core_brightness;
            accum[idx].2 += b * blur_core_brightness;
        }
    } else {
        // skip blur, just draw crisp line
        let start = (x0.round() as i32, y0.round() as i32);
        let end = (x1.round() as i32, y1.round() as i32);
        let pts: Vec<(i32, i32)> = Bresenham::new(start, end).collect();
        let n = pts.len();
        for (i, (xx, yy)) in pts.into_iter().enumerate() {
            if xx < 0 || xx >= width as i32 || yy < 0 || yy >= height as i32 {
                continue;
            }
            let idx = (yy as usize) * w_usize + (xx as usize);

            let t = if n == 1 { 0.0 } else { i as f64 / (n - 1) as f64 };
            let r = (col0[0] as f64) * (1.0 - t) + (col1[0] as f64) * t;
            let g = (col0[1] as f64) * (1.0 - t) + (col1[1] as f64) * t;
            let b = (col0[2] as f64) * (1.0 - t) + (col1[2] as f64) * t;

            accum[idx].0 += r * blur_core_brightness;
            accum[idx].1 += g * blur_core_brightness;
            accum[idx].2 += b * blur_core_brightness;
        }
    }
}

// ========================================================
// Generate color sequences
// ========================================================
fn generate_color_gradient(rng: &mut Sha3RandomByteStream, length: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    let mut hue = rng.next_f64() * 360.0;

    for _ in 0..length {
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

// ========================================================
// Global auto-level for frames
// ========================================================
fn build_cdf(hist: &[u32; 256]) -> Vec<u32> {
    let mut cdf = vec![0u32; 256];
    let mut running = 0u32;
    for (i, &c) in hist.iter().enumerate() {
        running += c;
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
    let cf = c as f64;
    let bf = black_cut as f64;
    let wf = white_cut as f64;
    if wf <= bf {
        return c;
    }
    let mut t = (cf - bf) / (wf - bf);
    t = t.clamp(0.0, 1.0);
    t = t.powf(gamma);
    (t * 255.0).round().clamp(0.0, 255.0) as u8
}

/// Global auto-level for all frames => no flicker
fn auto_levels_percentile_frames_global(
    frames: &mut [ImageBuffer<Rgb<u8>, Vec<u8>>],
    clip_black: f64,
    clip_white: f64,
    gamma: f64,
) {
    if frames.is_empty() {
        return;
    }

    let (w, h) = (frames[0].width(), frames[0].height());
    let total_pix = frames.len() as u64 * (w as u64) * (h as u64);

    let mut hist_r = [0u32; 256];
    let mut hist_g = [0u32; 256];
    let mut hist_b = [0u32; 256];

    for f in frames.iter() {
        for px in f.pixels() {
            hist_r[px[0] as usize] += 1;
            hist_g[px[1] as usize] += 1;
            hist_b[px[2] as usize] += 1;
        }
    }
    let black_count = (clip_black * (total_pix as f64)).round() as u32;
    let white_count = (clip_white * (total_pix as f64)).round() as u32;

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

// ========================================================
// 2-pass H.264 with multi-threading
// ========================================================
fn create_video_from_frames_2pass(
    frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>],
    output_file: &str,
    frame_rate: u32,
) {
    if frames.is_empty() {
        eprintln!("No frames => skipping video creation.");
        return;
    }
    let width = frames[0].width();
    let height = frames[0].height();

    // Get number of CPU cores available
    let cpu_count = num_cpus::get().to_string();

    println!(
        "STAGE 6/7: Creating 2-pass H.264 video => {output_file}, {}x{}, {} FPS, using {} threads",
        width, height, frame_rate, cpu_count
    );

    // pass1
    {
        println!("   (pass 1) Encoding (libx264)...");
        let mut cmd = Command::new("ffmpeg");
        cmd.arg("-y")
            // raw frames from stdin
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
            // Thread usage
            .arg("-threads")
            .arg(&cpu_count)
            // H.264 codec
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("slow") // 'slow' or 'medium' is a common trade-off
            // CRF for quality (lower = higher quality)
            .arg("-crf")
            .arg("18")
            // Two-pass: pass 1
            .arg("-pass")
            .arg("1")
            // Typically needed to produce a valid color space
            .arg("-pix_fmt")
            .arg("yuv420p")
            // No audio
            .arg("-an")
            // Output to null for pass1
            .arg("-f")
            .arg("null")
            .arg("/dev/null")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().expect("Failed to start ffmpeg pass1");
        {
            let sin = child.stdin.as_mut().unwrap();
            for frame in frames {
                sin.write_all(frame.as_raw()).expect("ffmpeg pass1 write fail");
            }
        }
        let out = child.wait_with_output().expect("ffmpeg pass1 wait fail");
        if !out.status.success() {
            eprintln!("FFmpeg pass1 error:\n{}", String::from_utf8_lossy(&out.stderr));
        } else {
            println!("   (pass 1) Done.");
        }
    }

    // pass2
    {
        println!("   (pass 2) Encoding (libx264)...");
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
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("slow")
            .arg("-crf")
            .arg("18")
            .arg("-pass")
            .arg("2")
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-an")
            .arg(output_file)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().expect("Failed to start ffmpeg pass2");
        {
            let sin = child.stdin.as_mut().unwrap();
            for frame in frames {
                sin.write_all(frame.as_raw()).expect("ffmpeg pass2 write fail");
            }
        }
        let out = child.wait_with_output().expect("ffmpeg pass2 wait fail");
        if !out.status.success() {
            eprintln!("FFmpeg pass2 error:\n{}", String::from_utf8_lossy(&out.stderr));
        } else {
            println!("   (pass 2) Done. Video creation complete => {output_file}");
        }
    }
}

// ========================================================
// Save single image as AVIF
// ========================================================
fn save_image_as_avif(
    rgb_img: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    path: &str,
    speed: u8,
    quality: u8,
) -> Result<(), Box<dyn Error>> {
    let dyn_img = DynamicImage::ImageRgb8(rgb_img.clone());
    let file = File::create(path)?;
    let writer = BufWriter::new(file);

    let s = speed.min(10);
    let q = quality.min(100);

    let encoder = AvifEncoder::new_with_speed_quality(writer, s, q);
    encoder.write_image(
        dyn_img.as_bytes(),
        dyn_img.width(),
        dyn_img.height(),
        dyn_img.color().into(),
    )?;
    println!("   Saved AVIF => {path}");
    Ok(())
}

// ========================================================
// main
// ========================================================
fn main() {
    let args = Args::parse();

    // create dirs
    let _ = fs::create_dir_all("pics");
    let _ = fs::create_dir_all("vids");

    // RNG
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed_bytes = hex::decode(hex_seed).expect("invalid hex seed");
    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // 1) Borda => best orbit
    let (best_bodies, best_info) = select_best_trajectory(
        &mut rng,
        args.num_sims,
        args.num_steps_sim,
        args.max_points,
        args.chaos_weight,
        args.perimeter_weight,
        args.dist_weight,
        args.lyap_weight,
    );

    // 2) re-run best orbit => get positions
    println!("STAGE 2/7: Re-running best orbit for {} steps...", args.num_steps_sim);
    let positions = get_positions(best_bodies.clone(), args.num_steps_sim);
    println!("   => Done re-running best orbit.");

    // 3) bounding box
    println!("STAGE 3/7: Determining bounding box...");
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
    {
        let wx = max_x - min_x;
        let wy = max_y - min_y;
        min_x -= 0.05 * wx;
        max_x += 0.05 * wx;
        min_y -= 0.05 * wy;
        max_y += 0.05 * wy;
    }
    println!("   => Done bounding box.");

    // 4) line drawing
    println!(
        "STAGE 4/7: Single-pass line drawing => frames + final image ({} steps).",
        args.num_steps_sim
    );
    let width = args.frame_size;
    let height = args.frame_size;
    let w_usize = width as usize;
    let h_usize = height as usize;
    let npix = w_usize * h_usize;

    let smaller_dim = (width as f64).min(height as f64);
    let blur_radius_px = if args.disable_blur {
        0
    } else {
        (args.blur_radius_fraction * smaller_dim).round() as usize
    };

    let to_pixel = |xx: f64, yy: f64| -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((xx - min_x) / ww) * (width as f64);
        let py = ((yy - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    };

    let colors = generate_body_color_sequences(&mut rng, args.num_steps_sim);

    // We produce ~1800 frames if possible
    let frame_rate = 60;
    let target_frames = 1800;
    let fi = if target_frames > 0 { (args.num_steps_sim / target_frames).max(1) } else { 1 };

    let mut accum = vec![(0.0, 0.0, 0.0); npix];
    let mut frames = Vec::new();

    // We'll print progress ~every 10% in the line drawing loop
    let chunk_line = (args.num_steps_sim / 10).max(1);

    for step in 0..args.num_steps_sim {
        if step % chunk_line == 0 {
            let pct = (step as f64 / args.num_steps_sim as f64) * 100.0;
            println!("   line drawing: {:.0}% done", pct);
        }

        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let c0 = colors[0][step];
        let c1 = colors[1][step];
        let c2 = colors[2][step];

        let (x0, y0) = to_pixel(p0[0], p0[1]);
        let (x1, y1) = to_pixel(p1[0], p1[1]);
        let (x2, y2) = to_pixel(p2[0], p2[1]);

        // Add lines to accum
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
            args.blur_strength,
            args.blur_core_brightness,
            args.disable_blur,
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
            args.blur_strength,
            args.blur_core_brightness,
            args.disable_blur,
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
            args.blur_strength,
            args.blur_core_brightness,
            args.disable_blur,
        );

        // snapshot if step multiple of fi or last step
        if (step % fi == 0) || (step == args.num_steps_sim - 1) {
            let mut maxval = 0.0;
            for &(r, g, b) in &accum {
                let m = r.max(g).max(b);
                if m > maxval {
                    maxval = m;
                }
            }
            if maxval < 1e-14 {
                maxval = 1.0;
            }
            let mut img = ImageBuffer::new(width, height);
            for (i, px) in img.pixels_mut().enumerate() {
                let (r, g, b) = accum[i];
                let rr = (r / maxval).clamp(0.0, 1.0) * 255.0;
                let gg = (g / maxval).clamp(0.0, 1.0) * 255.0;
                let bb = (b / maxval).clamp(0.0, 1.0) * 255.0;
                *px = Rgb([rr as u8, gg as u8, bb as u8]);
            }
            frames.push(img);
        }
    }
    println!("   => line drawing complete. Collected {} frames.", frames.len());

    // 5) global auto-level
    println!("STAGE 5/7: Applying global histogram auto-level to {} frames...", frames.len());
    auto_levels_percentile_frames_global(
        &mut frames,
        args.clip_black,
        args.clip_white,
        args.levels_gamma,
    );
    println!("   => Done auto-leveling.");

    // The last frame is the final single image
    let final_img = frames.last().unwrap().clone();

    // 6) create video (2-pass H.264)
    let vid_path = format!("vids/{}.mp4", args.file_name);
    create_video_from_frames_2pass(&frames, &vid_path, frame_rate);

    // 7) save final single image as AVIF
    println!("STAGE 7/7: Saving final single image as AVIF...");
    let avif_path = format!("pics/{}.avif", args.file_name);
    if let Err(e) = save_image_as_avif(&final_img, &avif_path, 0, 90) {
        eprintln!("Error saving AVIF: {e}");
    }

    println!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );
}
