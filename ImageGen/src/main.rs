use clap::Parser;
use hex;
use image::{DynamicImage, ImageBuffer};
use line_drawing::Bresenham;
use nalgebra::Vector3;
use palette::oklch::Oklch;
use palette::{Clamp, FromColor, Srgb};
use rayon::prelude::*;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use sha3::{Digest, Sha3_256};
use statrs::statistics::Statistics;

use std::error::Error;
use std::f64::{INFINITY, NEG_INFINITY};
use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

/// Gravity constant
const G: f64 = 9.8;

/// For the Lyapunov exponent embedding
const LLE_M: usize = 3;
/// kd‐tree branching
const B: usize = 32;

// =============================================
// CLI
// =============================================
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "
Three‐Body orbits => Borda => final image & MP4 (with hue‐only random walk, additive Lab blending).
"
)]
struct Args {
    #[arg(long, default_value = "0x100033")]
    seed: String,

    #[arg(long, default_value = "output")]
    file_name: String,

    /// If not specified => 30k or 100k if --special
    #[arg(long)]
    num_sims: Option<usize>,

    #[arg(long, default_value_t = 1_000_000)]
    num_steps_sim: usize,

    #[arg(long, default_value_t = false)]
    special: bool,

    #[arg(long, default_value_t = 300.0)]
    location: f64,

    #[arg(long, default_value_t = 1.0)]
    velocity: f64,

    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,

    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    // Borda weighting
    #[arg(long, default_value_t = 7.0)]
    chaos_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    area_weight: f64,
    #[arg(long, default_value_t = 2.0)]
    dist_weight: f64,
    #[arg(long, default_value_t = 5.0)]
    lyap_weight: f64,
    #[arg(long, default_value_t = 2.0)]
    aspect_weight: f64,

    #[arg(long, default_value_t = 100_000)]
    max_points: usize,

    #[arg(long, default_value_t = 960)]
    width: u32,

    #[arg(long, default_value_t = 540)]
    height: u32,

    // final auto-level
    #[arg(long, default_value_t = 0.002)]
    clip_black: f64,
    #[arg(long, default_value_t = 0.998)]
    clip_white: f64,
    #[arg(long, default_value_t = 0.8)]
    levels_gamma: f64,
}

// =============================================
// RNG
// =============================================
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

// =============================================
// Three-body
// =============================================
#[derive(Clone)]
struct Body {
    mass: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
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

    // first half-kick
    for (i, body) in bodies.iter_mut().enumerate() {
        body.reset_acceleration();
        for (j, &other_pos) in positions.iter().enumerate() {
            if i != j {
                body.update_acceleration(masses[j], &other_pos);
            }
        }
    }
    // drift
    for body in bodies.iter_mut() {
        body.position += body.velocity * dt + 0.5 * body.acceleration * dt * dt;
    }
    // second half-kick
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

fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;
    // warm-up
    for _ in 0..num_steps {
        verlet_step(&mut bodies, dt);
    }
    // record
    let mut bodies2 = bodies.clone();
    let mut out = vec![vec![Vector3::zeros(); num_steps]; bodies.len()];
    for step in 0..num_steps {
        for (i, b) in bodies2.iter().enumerate() {
            out[i][step] = b.position;
        }
        verlet_step(&mut bodies2, dt);
    }
    out
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

// =============================================
// Borda
// =============================================
fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(input.len());
    let mut data: Vec<_> = input.iter().map(|&x| Complex::new(x, 0.0)).collect();
    fft.process(&mut data);
    data
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
        for &p in body.iter() {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }
    }
    let x_center = 0.5 * (max_x + min_x);
    let y_center = 0.5 * (max_y + min_y);
    let mut range = (max_x - min_x).max(max_y - min_y) * 1.1;
    if range < 1e-14 {
        range = 1.0;
    }
    let adj_min_x = x_center - 0.5 * range;
    let adj_min_y = y_center - 0.5 * range;
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

use kiddo::float::kdtree::KdTree;
use kiddo::SquaredEuclidean;

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
        let nn_id = if nn1.item == (i as u64) { nn2.item as usize } else { nn1.item as usize };
        let allowed = max_iter.min(emb_len - 1 - i).min(emb_len - 1 - nn_id);
        for k in 0..allowed {
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
    let log_div: Vec<f64> = (0..max_iter)
        .map(|k| if counts[k] > 0 { (divergence[k] / (counts[k] as f64)).ln() } else { 0.0 })
        .collect();
    let x_vals: Vec<f64> = (0..max_iter).map(|i| i as f64).collect();
    let mean_x = x_vals.iter().copied().mean();
    let mean_y = log_div.iter().copied().mean();
    let mut num = 0.0;
    let mut den = 0.0;
    for i in 0..max_iter {
        let dx = x_vals[i] - mean_x;
        num += dx * (log_div[i] - mean_y);
        den += dx * dx;
    }
    if den.abs() < 1e-14 {
        0.0
    } else {
        num / den
    }
}

fn aspect_ratio_closeness(positions: &[Vec<Vector3<f64>>], final_aspect: f64) -> f64 {
    let (min_x, max_x, min_y, max_y) = bounding_box_2d(positions);
    let w = max_x - min_x;
    let h = max_y - min_y;
    if w < 1e-14 || h < 1e-14 {
        return 0.0;
    }
    let orbit_aspect = w / h;
    let diff = (orbit_aspect - final_aspect).abs() / final_aspect;
    (1.0 - diff).clamp(0.0, 1.0)
}

fn bounding_box_2d(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut min_y = INFINITY;
    let mut max_y = NEG_INFINITY;
    for b in positions.iter() {
        for &p in b.iter() {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }
    }
    (min_x, max_x, min_y, max_y)
}

fn bounding_box(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let (mut min_x, mut max_x, mut min_y, mut max_y) = bounding_box_2d(positions);
    if (max_x - min_x).abs() < 1e-12 {
        min_x -= 0.5;
        max_x += 0.5;
    }
    if (max_y - min_y).abs() < 1e-12 {
        min_y -= 0.5;
        max_y += 0.5;
    }
    let wx = max_x - min_x;
    let wy = max_y - min_y;
    min_x -= 0.05 * wx;
    max_x += 0.05 * wx;
    min_y -= 0.05 * wy;
    max_y += 0.05 * wy;
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
    let mut sum = 0.0;
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
        sum += area;
    }
    sum / (total_steps as f64)
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

fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_sims: usize,
    num_steps_sim: usize,
    max_points: usize,
    cw: f64,
    aw: f64,
    dw: f64,
    lw: f64,
    aspw: f64,
    final_aspect: f64,
    width: u32,
    height: u32,
) -> (Vec<Body>, TrajectoryResult) {
    println!("STAGE 1/8: Borda => {num_sims} random orbits...");

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
                println!("   => Borda: {:.0}% done", pct);
            }
            let e = calculate_total_energy(bodies);
            let ang = calculate_total_angular_momentum(bodies).norm();
            // filter unbound orbits
            if e >= 0.0 || ang < 1e-3 {
                None
            } else {
                let positions = get_positions(bodies.clone(), num_steps_sim);
                let len = positions[0].len();
                let factor = (len / max_points).max(1);

                let m1 = bodies[0].mass;
                let m2 = bodies[1].mass;
                let m3 = bodies[2].mass;

                let c = non_chaoticness(m1, m2, m3, &positions);
                let area = average_triangle_area_screen(&positions, width, height);
                let d = total_distance(&positions);
                let body1_norms: Vec<f64> =
                    positions[0].iter().step_by(factor).map(|p| p.norm()).collect();
                let ly = lyapunov_exponent_kdtree(&body1_norms, 1, 50);
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
        panic!("No valid orbits => all unbound or near zero momentum!");
    }
    let mut info_vec = valid;

    let mut chaos_vals = Vec::with_capacity(info_vec.len());
    let mut area_vals = Vec::with_capacity(info_vec.len());
    let mut dist_vals = Vec::with_capacity(info_vec.len());
    let mut lyap_vals = Vec::with_capacity(info_vec.len());
    let mut asp_vals = Vec::with_capacity(info_vec.len());

    for (i, (tr, _)) in info_vec.iter().enumerate() {
        chaos_vals.push((tr.chaos, i));
        area_vals.push((tr.triangle_area, i));
        dist_vals.push((tr.total_dist, i));
        lyap_vals.push((tr.lyap_exp, i));
        asp_vals.push((tr.aspect_closeness, i));
    }

    fn assign_borda_scores(mut vals: Vec<(f64, usize)>, higher_better: bool) -> Vec<usize> {
        if higher_better {
            // sort descending on the .0
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            // sort ascending on the .0
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
    let chaos_pts = assign_borda_scores(chaos_vals, false);
    let area_pts = assign_borda_scores(area_vals, true);
    let dist_pts = assign_borda_scores(dist_vals, true);
    let lyap_pts = assign_borda_scores(lyap_vals, true);
    let asp_pts = assign_borda_scores(asp_vals, true);

    for (i, (tr, _)) in info_vec.iter_mut().enumerate() {
        tr.chaos_pts = chaos_pts[i];
        tr.area_pts = area_pts[i];
        tr.dist_pts = dist_pts[i];
        tr.lyap_pts = lyap_pts[i];
        tr.aspect_pts = asp_pts[i];
        tr.total_score = chaos_pts[i] + area_pts[i] + dist_pts[i] + lyap_pts[i] + asp_pts[i];
        tr.total_score_weighted = (chaos_pts[i] as f64 * cw)
            + (area_pts[i] as f64 * aw)
            + (dist_pts[i] as f64 * dw)
            + (lyap_pts[i] as f64 * lw)
            + (asp_pts[i] as f64 * aspw);
    }
    let (best_tr, best_idx) = info_vec
        .iter()
        .max_by(|(a, _), (b, _)| {
            a.total_score_weighted.partial_cmp(&b.total_score_weighted).unwrap()
        })
        .unwrap();
    let best_bodies = many_bodies[*best_idx].clone();
    println!(
        "   => Borda best => Weighted={:.3}, chaos={:.3e}, area={:.3}, dist={:.3}, lyap={:.3}, aspect={:.3}",
        best_tr.total_score_weighted,
        best_tr.chaos,
        best_tr.triangle_area,
        best_tr.total_dist,
        best_tr.lyap_exp,
        best_tr.aspect_closeness
    );
    (best_bodies, best_tr.clone())
}

// =============================================
// Our custom "MyLCH"
// =============================================
#[derive(Copy, Clone, Debug)]
struct MyLCH {
    l: f32,
    c: f32,
    hue_deg: f32,
}

impl MyLCH {
    fn new(l: f32, c: f32, h_deg: f32) -> Self {
        Self { l, c, hue_deg: h_deg }
    }
}

// Convert MyLCH <--> Lab (for additive blending in Lab)
#[inline]
fn lch_to_lab(lch: MyLCH) -> (f32, f32, f32) {
    // L, C, h => Lab
    // a = C*cos(h), b = C*sin(h), with h in radians
    let hr = lch.hue_deg.to_radians();
    let a = lch.c * hr.cos();
    let b = lch.c * hr.sin();
    (lch.l, a, b)
}

#[inline]
fn lab_to_lch(lab: (f32, f32, f32)) -> MyLCH {
    let (l, a, b) = lab;
    let c = (a * a + b * b).sqrt();
    // typical usage is atan2(b, a) for converting back from Lab,
    // but we'll keep consistent with the usage above:
    let mut h = a.atan2(b).to_degrees();
    if h < 0.0 {
        h += 360.0;
    } else if h >= 360.0 {
        h -= 360.0;
    }
    MyLCH::new(l, c, h)
}

/// Additive Lab blend with a small alpha factor:
/// result_lab = base_lab + alpha * src_lab
fn additive_lch_blend(base: MyLCH, src: MyLCH, alpha: f32) -> MyLCH {
    // convert both to Lab
    let (l1, a1, b1) = lch_to_lab(base);
    let (l2, a2, b2) = lch_to_lab(src);

    // do partial additive
    let l_sum = l1 + alpha * l2;
    let a_sum = a1 + alpha * a2;
    let b_sum = b1 + alpha * b2;

    // clamp L to [0..1] to avoid going out of range
    let l_clamped = l_sum.clamp(0.0, 1.0);

    lab_to_lch((l_clamped, a_sum, b_sum))
}

/// Linear interpolation in LCH (including hue) to get intermediate color
#[inline]
fn lch_interpolate(c0: MyLCH, c1: MyLCH, t: f32) -> MyLCH {
    let mut dh = c1.hue_deg - c0.hue_deg;
    // minimal hue difference
    if dh.abs() > 180.0 {
        if dh > 0.0 {
            dh -= 360.0;
        } else {
            dh += 360.0;
        }
    }
    let hue = c0.hue_deg + dh * t;
    let mut hue_wrapped = hue;
    if hue_wrapped < 0.0 {
        hue_wrapped += 360.0;
    } else if hue_wrapped >= 360.0 {
        hue_wrapped -= 360.0;
    }
    let l = c0.l + (c1.l - c0.l) * t;
    let c = c0.c + (c1.c - c0.c) * t;
    MyLCH::new(l, c, hue_wrapped)
}

/// Crisp line, uses additive blending in Lab
fn draw_line_segment_my_lch_additive(
    accum: &mut [MyLCH],
    width: u32,
    height: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    col0: MyLCH,
    col1: MyLCH,
    alpha: f32,
) {
    let w_usize = width as usize;
    let start = (x0.round() as i32, y0.round() as i32);
    let end = (x1.round() as i32, y1.round() as i32);
    let pts: Vec<(i32, i32)> = Bresenham::new(start, end).collect();
    let n = pts.len();
    if n < 2 {
        return;
    }
    for (i, (xx, yy)) in pts.into_iter().enumerate() {
        if xx < 0 || xx >= width as i32 || yy < 0 || yy >= height as i32 {
            continue;
        }
        let idx = (yy as usize) * w_usize + (xx as usize);
        let t = i as f32 / (n - 1) as f32; // 0..1 along the line
        let line_col = lch_interpolate(col0, col1, t);
        // do additive blending
        accum[idx] = additive_lch_blend(accum[idx], line_col, alpha);
    }
}

// For blur
fn build_gaussian_kernel(radius: usize) -> Vec<f64> {
    if radius == 0 {
        return vec![1.0];
    }
    let sigma = radius as f64 / 2.0_f64.max(1.0);
    let two_sigma_sq = 2.0 * sigma * sigma;
    let mut k = Vec::with_capacity(2 * radius + 1);
    let mut sum = 0.0;
    for i in 0..(2 * radius + 1) {
        let x = i as f64 - radius as f64;
        let val = (-x * x / two_sigma_sq).exp();
        k.push(val);
        sum += val;
    }
    for v in k.iter_mut() {
        *v /= sum;
    }
    k
}

fn hue_to_xy(h_deg: f32) -> (f32, f32) {
    let r = h_deg.to_radians();
    (r.cos(), r.sin())
}

fn xy_to_hue(x: f32, y: f32) -> f32 {
    let mut ang_deg = x.atan2(y).to_degrees();
    if ang_deg < 0.0 {
        ang_deg += 360.0;
    } else if ang_deg >= 360.0 {
        ang_deg -= 360.0;
    }
    ang_deg
}

/// Simple 2D blur in MyLCH. We do it by converting hue -> (x,y), blur in (L, C, x, y), then back.
fn parallel_blur_2d_my_lch(buf: &mut [MyLCH], width: usize, height: usize, radius: usize) {
    if radius == 0 {
        return;
    }
    let kernel = build_gaussian_kernel(radius);
    let k_len = kernel.len();
    let mut temp = vec![MyLCH::new(0.5, 0.0, 0.0); width * height];

    // horizontal pass
    temp.par_chunks_mut(width).zip(buf.par_chunks(width)).for_each(|(dst_row, src_row)| {
        for x in 0..width {
            let mut sum_l = 0.0;
            let mut sum_c = 0.0;
            let mut sum_x = 0.0;
            let mut sum_y = 0.0;
            for k in 0..k_len {
                let dx = (x as isize + (k as isize - radius as isize)).clamp(0, width as isize - 1)
                    as usize;
                let w = kernel[k];
                let s = src_row[dx];
                sum_l += w * (s.l as f64);
                sum_c += w * (s.c as f64);
                let (xx, yy) = hue_to_xy(s.hue_deg);
                sum_x += w * xx as f64;
                sum_y += w * yy as f64;
            }
            let out_l = sum_l as f32;
            let out_c = sum_c as f32;
            let x_ = sum_x as f32;
            let y_ = sum_y as f32;
            let out_h = xy_to_hue(x_, y_);
            dst_row[x] = MyLCH::new(out_l, out_c, out_h);
        }
    });

    // vertical pass
    buf.par_chunks_mut(width).enumerate().for_each(|(y, dst_row)| {
        for x in 0..width {
            let mut sum_l = 0.0;
            let mut sum_c = 0.0;
            let mut sum_x = 0.0;
            let mut sum_y = 0.0;
            for k in 0..k_len {
                let yy = (y as isize + (k as isize - radius as isize)).clamp(0, height as isize - 1)
                    as usize;
                let s = temp[yy * width + x];
                let w = kernel[k];
                sum_l += w * (s.l as f64);
                sum_c += w * (s.c as f64);
                let (xx, yy2) = hue_to_xy(s.hue_deg);
                sum_x += w * xx as f64;
                sum_y += w * yy2 as f64;
            }
            let out_l = sum_l as f32;
            let out_c = sum_c as f32;
            let x_ = sum_x as f32;
            let y_ = sum_y as f32;
            let out_h = xy_to_hue(x_, y_);
            dst_row[x] = MyLCH::new(out_l, out_c, out_h);
        }
    });
}

// single‐pass ffmpeg
fn create_video_from_frames_singlepass(
    width: u32,
    height: u32,
    frame_rate: u32,
    mut frames_fn: impl FnMut(&mut dyn Write) -> Result<(), Box<dyn Error>>,
    output_file: &str,
) -> Result<(), Box<dyn Error>> {
    if width == 0 || height == 0 {
        eprintln!("Invalid video size => skipping creation.");
        return Ok(());
    }
    let cpu_count = num_cpus::get().to_string();
    println!(
        "STAGE 7/8: Creating MP4 => {output_file}, {width}x{height}, {frame_rate} FPS, using {cpu_count} threads"
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
        .arg(cpu_count)
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
        frames_fn(sin)?;
    }
    let out = child.wait_with_output()?;
    if !out.status.success() {
        eprintln!("FFmpeg error => {}", String::from_utf8_lossy(&out.stderr));
    } else {
        println!("   => Single‐pass video done => {output_file}");
    }
    Ok(())
}

// final auto‐levels
fn pass_auto_levels(
    buf_my_lch: &[MyLCH],
    width: u32,
    height: u32,
    clip_black: f64,
    clip_white: f64,
    gamma: f64,
) -> Vec<u8> {
    let npix = (width as usize) * (height as usize);

    // convert MyLCH => Oklch => sRGB float
    let mut float_rgb = vec![(0.0, 0.0, 0.0); npix];
    float_rgb.par_iter_mut().enumerate().for_each(|(i, outpix)| {
        let c = buf_my_lch[i];
        let pal_lch = Oklch::new(c.l, c.c, c.hue_deg);
        let srgb = Srgb::from_color(pal_lch).clamp();
        outpix.0 = srgb.red as f64;
        outpix.1 = srgb.green as f64;
        outpix.2 = srgb.blue as f64;
    });

    // gather channels
    let mut all_r = Vec::with_capacity(npix);
    let mut all_g = Vec::with_capacity(npix);
    let mut all_b = Vec::with_capacity(npix);
    for &(r, g, b) in &float_rgb {
        all_r.push(r);
        all_g.push(g);
        all_b.push(b);
    }
    // sort f64 ascending
    all_r.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    all_g.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    all_b.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());

    let total_pix = npix;
    let black_idx = ((clip_black * total_pix as f64).round() as isize)
        .clamp(0, (total_pix as isize) - 1) as usize;
    let white_idx = ((clip_white * total_pix as f64).round() as isize)
        .clamp(0, (total_pix as isize) - 1) as usize;

    let black_r = all_r[black_idx];
    let white_r = all_r[white_idx];
    let black_g = all_g[black_idx];
    let white_g = all_g[white_idx];
    let black_b = all_b[black_idx];
    let white_b = all_b[white_idx];

    let range_r = (white_r - black_r).max(1e-14);
    let range_g = (white_g - black_g).max(1e-14);
    let range_b = (white_b - black_b).max(1e-14);

    let mut out8 = vec![0u8; npix * 3];
    out8.par_chunks_mut(3).zip(float_rgb.par_iter()).for_each(|(chunk, &(r, g, b))| {
        let mut rr = (r - black_r) / range_r;
        let mut gg = (g - black_g) / range_g;
        let mut bb = (b - black_b) / range_b;
        rr = rr.clamp(0.0, 1.0);
        gg = gg.clamp(0.0, 1.0);
        bb = bb.clamp(0.0, 1.0);
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
    });
    out8
}

// =============================================
// Generate color sequences (Hue only random walk)
// =============================================
fn generate_body_color_sequences_my_lch(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    n_bodies: usize,
) -> Vec<Vec<MyLCH>> {
    // Each body has a random L in [0.3, 0.7], random C in [0.1, 0.3],
    // random initial Hue in [0..360). Then each step => small drift in hue.
    let mut out = vec![vec![MyLCH::new(0.5, 0.2, 0.0); length]; n_bodies];

    for b in 0..n_bodies {
        let fixed_l = rng.gen_range(0.3, 0.7) as f32;
        let fixed_c = rng.gen_range(0.1, 0.3) as f32;
        let base_h = rng.gen_range(0.0, 360.0) as f32;

        // small hue step range => ±0.4 deg
        let hue_step_max = 0.4;

        let mut current_h = base_h;
        for i in 0..length {
            out[b][i] = MyLCH::new(fixed_l, fixed_c, current_h);
            // do a small random step in hue
            let dh = (rng.next_f64() - 0.5) * (2.0 * hue_step_max);
            current_h += dh as f32;
            if current_h < 0.0 {
                current_h += 360.0;
            } else if current_h >= 360.0 {
                current_h -= 360.0;
            }
        }
    }
    out
}

// =============================================
// Main
// =============================================
fn main() -> Result<(), Box<dyn Error>> {
    let args = Args::parse();
    let num_sims = match args.num_sims {
        Some(v) => v,
        None => {
            if args.special {
                100_000
            } else {
                30_000
            }
        }
    };

    fs::create_dir_all("pics")?;
    fs::create_dir_all("vids")?;

    let width = args.width;
    let height = args.height;
    let final_aspect = width as f64 / height as f64;

    // RNG
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed_bytes = hex::decode(hex_seed)?;
    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // 1) Borda
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

    // 2) re-run
    println!("STAGE 2/8: Re-run best => {} steps...", args.num_steps_sim);
    let positions = get_positions(best_bodies, args.num_steps_sim);

    // 3) color sequences => hue only random walk
    println!("STAGE 3/8: generating color sequences in MyLCH (hue-only)...");
    let colors = generate_body_color_sequences_my_lch(&mut rng, args.num_steps_sim, 3);

    // 4) bounding box
    println!("STAGE 4/8: bounding box...");
    let (min_x, max_x, min_y, max_y) = bounding_box(&positions);
    println!("   => X in [{:.3},{:.3}], Y in [{:.3},{:.3}]", min_x, max_x, min_y, max_y);

    // 5) accumulation
    println!("STAGE 5/8: building frames in MyLCH, additive blend + blur");
    let npix = (width as usize) * (height as usize);
    let mut accum_my_lch = vec![MyLCH::new(0.5, 0.0, 0.0); npix];

    let frame_rate = 60;
    let target_frames = 1800;
    let frame_interval =
        if target_frames > 0 { (args.num_steps_sim / target_frames).max(1) } else { 1 };

    let smaller_dim = width.min(height) as f64;
    let blur_radius_px = (0.02 * smaller_dim).round() as usize;

    fn to_pixel(
        min_x: f64,
        max_x: f64,
        min_y: f64,
        max_y: f64,
        w: u32,
        h: u32,
        xx: f64,
        yy: f64,
    ) -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((xx - min_x) / ww) * (w as f64);
        let py = ((yy - min_y) / hh) * (h as f64);
        (px as f32, py as f32)
    }

    // 6) pipe frames => ffmpeg
    println!("STAGE 6/8: piping frames => ffmpeg single-pass...");
    let vid_path = format!("vids/{}.mp4", args.file_name);

    {
        let frames_writer = |out: &mut dyn Write| -> Result<(), Box<dyn Error>> {
            let total_steps = positions[0].len();
            let chunk_line = (total_steps / 10).max(1);

            // alpha for additive blending
            let alpha = 0.06_f32;

            for step in 0..total_steps {
                if step % chunk_line == 0 {
                    let pct = (step as f64 / total_steps as f64) * 100.0;
                    println!("   => step {} / {} ({:.0}%)", step, total_steps, pct);
                }
                // draw lines for the triangle
                let p0 = positions[0][step];
                let p1 = positions[1][step];
                let p2 = positions[2][step];
                let c0 = colors[0][step];
                let c1 = colors[1][step];
                let c2 = colors[2][step];

                let (x0, y0) = to_pixel(min_x, max_x, min_y, max_y, width, height, p0[0], p0[1]);
                let (x1, y1) = to_pixel(min_x, max_x, min_y, max_y, width, height, p1[0], p1[1]);
                let (x2, y2) = to_pixel(min_x, max_x, min_y, max_y, width, height, p2[0], p2[1]);

                draw_line_segment_my_lch_additive(
                    &mut accum_my_lch,
                    width,
                    height,
                    x0,
                    y0,
                    x1,
                    y1,
                    c0,
                    c1,
                    alpha,
                );
                draw_line_segment_my_lch_additive(
                    &mut accum_my_lch,
                    width,
                    height,
                    x1,
                    y1,
                    x2,
                    y2,
                    c1,
                    c2,
                    alpha,
                );
                draw_line_segment_my_lch_additive(
                    &mut accum_my_lch,
                    width,
                    height,
                    x2,
                    y2,
                    x0,
                    y0,
                    c2,
                    c0,
                    alpha,
                );

                let is_final = step == (total_steps - 1);
                if (step % frame_interval == 0) || is_final {
                    // blur
                    let mut temp = accum_my_lch.clone();
                    parallel_blur_2d_my_lch(
                        &mut temp,
                        width as usize,
                        height as usize,
                        blur_radius_px,
                    );

                    // combine partial (just to keep some crispness vs blur)
                    let mut final_buf = vec![MyLCH::new(0.0, 0.0, 0.0); npix];
                    final_buf.par_iter_mut().enumerate().for_each(|(i, pix)| {
                        let c_accum = accum_my_lch[i];
                        let c_blur = temp[i];
                        // Weighted average of original and blur in Lab
                        let (l1, a1, b1) = lch_to_lab(c_accum);
                        let (l2, a2, b2) = lch_to_lab(c_blur);
                        let w1 = 0.7;
                        let w2 = 0.3;
                        let l_sum = w1 * l1 + w2 * l2;
                        let a_sum = w1 * a1 + w2 * a2;
                        let b_sum = w1 * b1 + w2 * b2;
                        *pix = lab_to_lch((l_sum as f32, a_sum as f32, b_sum as f32));
                    });

                    // convert final_buf => sRGB
                    let mut frame_rgb24 = vec![0u8; npix * 3];
                    frame_rgb24.par_chunks_mut(3).enumerate().for_each(|(i, chunk)| {
                        let cc = final_buf[i];
                        let pal_lch = Oklch::new(cc.l, cc.c, cc.hue_deg);
                        let srgb = Srgb::from_color(pal_lch).clamp();
                        let r = (srgb.red * 255.0).round().clamp(0.0, 255.0) as u8;
                        let g = (srgb.green * 255.0).round().clamp(0.0, 255.0) as u8;
                        let b = (srgb.blue * 255.0).round().clamp(0.0, 255.0) as u8;
                        chunk[0] = r;
                        chunk[1] = g;
                        chunk[2] = b;
                    });
                    out.write_all(&frame_rgb24)?;
                }
            }
            Ok(())
        };

        create_video_from_frames_singlepass(width, height, frame_rate, frames_writer, &vid_path)?;
    }

    // 7) auto-level => final PNG
    println!("STAGE 7/8: auto-level => final single PNG");
    let final_png_rgb = pass_auto_levels(
        &accum_my_lch,
        width,
        height,
        args.clip_black,
        args.clip_white,
        args.levels_gamma,
    );

    // 8) save PNG
    println!("STAGE 8/8: saving final image...");
    fs::create_dir_all("pics")?; // ensure
    let png_path = format!("pics/{}.png", args.file_name);
    let img_buf = ImageBuffer::from_raw(width, height, final_png_rgb).unwrap();
    let dyn_img = DynamicImage::ImageRgb8(img_buf);
    dyn_img.save(&png_path)?;
    println!("   => saved {png_path}");

    println!(
        "Done! Weighted Borda = {:.3}. Enjoy your hue‐only + additive Lab art!",
        best_info.total_score_weighted
    );
    Ok(())
}
