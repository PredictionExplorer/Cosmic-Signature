use na::Vector3;
use nalgebra as na;

use clap::Parser;
use rayon::prelude::*;
use sha3::{Digest, Sha3_256};
use std::f64::{INFINITY, NEG_INFINITY};

use hex;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use imageproc::drawing::draw_filled_circle_mut;
use palette::{FromColor, Hsl, Srgb};
use std::io::{Cursor, Write};
use std::process::{Command, Stdio};

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use statrs::statistics::Statistics;

use kiddo::float::kdtree::KdTree;
use kiddo::SquaredEuclidean;

use chrono::Utc; // for timestamp

const APEN_M: usize = 2;
const APEN_M1: usize = 3;
const LLE_M: usize = 3;
const B: usize = 32;
type IDX = u32;

/// Command-line arguments
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate and visualize the three-body problem with kd-tree optimization (less verbose)."
)]
struct Args {
    // ---------------------------
    // Basic simulation parameters
    // ---------------------------
    #[arg(long, default_value = "00")]
    seed: String,
    #[arg(long, default_value = "output")]
    file_name: String,
    #[arg(long, default_value_t = 1_000_000)]
    num_steps: usize,
    #[arg(long, default_value_t = 10_000)]
    num_sims: usize,

    // ---------------------------
    // Ranges for random generation
    // ---------------------------
    #[arg(long, default_value_t = 250.0)]
    location: f64,
    #[arg(long, default_value_t = 2.0)]
    velocity: f64,
    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,
    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    // ---------------------------
    // Visualization toggles
    // ---------------------------
    #[arg(long, default_value_t = false)]
    avoid_effects: bool,
    #[arg(long, default_value_t = false)]
    no_video: bool,
    /// If set, recompute the bounding box for every frame in the video.
    #[arg(long, default_value_t = false)]
    dynamic_bounds: bool,

    // ---------------------------
    // Colors
    // ---------------------------
    #[arg(
        long,
        value_parser = [
            "gold", "bronze", "white", "emerald", "sapphire", "quartz",
            "amethyst", "topaz", "turquoise", "aqua", "fuchsia"
        ]
    )]
    special_color: Option<String>,

    // ---------------------------
    // Analysis
    // ---------------------------
    /// Maximum number of points to consider when analyzing trajectories (default: 100k)
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,

    // ---------------------------
    // Trajectory length parameters (regular)
    // ---------------------------
    #[arg(long, default_value_t = 0.2)]
    video_tail_min: f64,
    #[arg(long, default_value_t = 2.0)]
    video_tail_max: f64,
    #[arg(long, default_value_t = 1.0)]
    image_tail_min: f64,
    #[arg(long, default_value_t = 8.0)]
    image_tail_max: f64,

    // ---------------------------
    // Trajectory length parameters (when special color IS used)
    // ---------------------------
    #[arg(long, default_value_t = 1.0)]
    special_color_video_tail_min: f64,
    #[arg(long, default_value_t = 1.0)]
    special_color_video_tail_max: f64,
    #[arg(long, default_value_t = 5.0)]
    special_color_image_tail_min: f64,
    #[arg(long, default_value_t = 5.0)]
    special_color_image_tail_max: f64,
}

/// Custom RNG
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
        self.next_f64() * (max - min) + min
    }

    pub fn random_mass(&mut self) -> f64 {
        self.gen_range(self.min_mass, self.max_mass)
    }

    /// Generates a random coordinate in [-location_range..location_range].
    pub fn random_location(&mut self) -> f64 {
        self.gen_range(-self.location_range, self.location_range)
    }

    /// Generates a random velocity in [-velocity_range..velocity_range].
    pub fn random_velocity(&mut self) -> f64 {
        self.gen_range(-self.velocity_range, self.velocity_range)
    }
}

/// Represents a celestial body
#[derive(Clone)]
struct Body {
    mass: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
}

const G: f64 = 9.8;

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

    for (i, body) in bodies.iter_mut().enumerate() {
        body.reset_acceleration();
        for (j, &other_pos) in positions.iter().enumerate() {
            if i != j {
                body.update_acceleration(masses[j], &other_pos);
            }
        }
    }

    for body in bodies.iter_mut() {
        body.position += body.velocity * dt + 0.5 * body.acceleration * dt * dt;
    }

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

/// Simulate positions over time with minimal printing
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;

    // We'll do a 2-phase approach:
    // Phase 1: run the simulation to get final state (no progress prints).
    for _ in 0..num_steps {
        verlet_step(&mut bodies, dt);
    }

    // Phase 2: to actually record each step, we must replay from the start
    // for the same dt. (Yes, it's slightly redundant, but simpler code.)
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

/// Generate color gradients
fn generate_color_gradient(rng: &mut Sha3RandomByteStream, length: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    let mut hue = rng.gen_range(0.0, 360.0);
    for _ in 0..length {
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

fn generate_special_color_gradient(color_name: &str, length: usize) -> Vec<Rgb<u8>> {
    let rgb_color = match color_name.to_lowercase().as_str() {
        "gold" => Rgb([255, 215, 0]),
        "bronze" => Rgb([205, 127, 50]),
        "white" => Rgb([255, 255, 255]),
        "emerald" => Rgb([144, 255, 182]),
        "sapphire" => Rgb([70, 130, 255]),
        "quartz" => Rgb([255, 205, 220]),
        "amethyst" => Rgb([205, 133, 255]),
        "topaz" => Rgb([255, 205, 133]),
        "turquoise" => Rgb([133, 255, 205]),
        "aqua" => Rgb([0, 255, 255]),
        "fuchsia" => Rgb([255, 0, 128]),
        _ => Rgb([255, 255, 255]),
    };
    vec![rgb_color; length]
}

fn generate_body_color_sequences(
    rng: &mut Sha3RandomByteStream,
    length: usize,
    special_color: Option<&str>,
) -> Vec<Vec<Rgb<u8>>> {
    if let Some(color_name) = special_color {
        let sc = generate_special_color_gradient(color_name, length);
        vec![sc.clone(), sc.clone(), sc.clone()]
    } else {
        vec![
            generate_color_gradient(rng, length),
            generate_color_gradient(rng, length),
            generate_color_gradient(rng, length),
        ]
    }
}

/// A helper to globally normalize positions to [0..1] in x and y,
/// ignoring the z component for visualization.
fn normalize_positions_inplace(positions: &mut [Vec<Vector3<f64>>]) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for body_pos in positions.iter() {
        for &pos in body_pos {
            let x = pos.x;
            let y = pos.y;
            if x < min_x {
                min_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if x > max_x {
                max_x = x;
            }
            if y > max_y {
                max_y = y;
            }
        }
    }

    let x_center = (max_x + min_x) / 2.0;
    let y_center = (max_y + min_y) / 2.0;
    let mut range = (max_x - min_x).max(max_y - min_y);
    if range < 1e-14 {
        range = 1.0;
    }

    let half_range = range / 2.0;
    for body_pos in positions.iter_mut() {
        for pos in body_pos.iter_mut() {
            pos.x = (pos.x - (x_center - half_range)) / range;
            pos.y = (pos.y - (y_center - half_range)) / range;
            // z is untouched for this 2D rendering
        }
    }
}

/// Plot positions to frames (minimal printing)
fn plot_positions(
    positions: &[Vec<Vector3<f64>>],
    frame_size: u32,
    trajectory_lengths: [f64; 3],
    hide: &[bool],
    colors: &[Vec<Rgb<u8>>],
    frame_interval: usize,
    avoid_effects: bool,
    one_frame: bool,
    dynamic_bounds_for_video: bool,
) -> Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    let total_steps = positions[0].len();
    let dynamic_bounds = if one_frame { true } else { dynamic_bounds_for_video };
    let total_frames = if one_frame {
        1
    } else {
        if frame_interval == 0 {
            1
        } else {
            total_steps / frame_interval
        }
    };

    let (static_min_x, static_min_y, static_max_x, static_max_y) = if !dynamic_bounds {
        compute_bounding_box_for_all_steps(positions, hide)
    } else {
        (0.0, 0.0, 1.0, 1.0)
    };

    let mut frames = Vec::new();
    for frame_index in 0..total_frames {
        let current_end_step = if one_frame {
            total_steps.saturating_sub(1)
        } else {
            (frame_index + 1) * frame_interval
        };

        let mut trajectory_starts = [0usize; 3];
        for (body_i, body_positions) in positions.iter().enumerate() {
            if hide[body_i] {
                continue;
            }
            let clamp_end = current_end_step.min(body_positions.len());
            if clamp_end == 0 {
                trajectory_starts[body_i] = 0;
                continue;
            }

            let mut total_dist = 0.0;
            let mut idx = clamp_end - 1;
            while idx > 0 && total_dist < trajectory_lengths[body_i] {
                let (x1, y1) = (body_positions[idx][0], body_positions[idx][1]);
                let (x2, y2) = (body_positions[idx - 1][0], body_positions[idx - 1][1]);
                let dist = ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt();
                total_dist += dist;
                idx -= 1;
            }
            trajectory_starts[body_i] = idx;
        }

        let (min_x, min_y, max_x, max_y) = if dynamic_bounds {
            compute_bounding_box_for_frame(positions, hide, &trajectory_starts, current_end_step)
        } else {
            (static_min_x, static_min_y, static_max_x, static_max_y)
        };

        let x_center = (max_x + min_x) / 2.0;
        let y_center = (max_y + min_y) / 2.0;
        let mut range = (max_x - min_x).max(max_y - min_y) * 1.1;
        if range < 1e-14 {
            range = 1.0;
        }
        let adj_min_x = x_center - (range / 2.0);
        let adj_min_y = y_center - (range / 2.0);

        const BACKGROUND_COLOR: Rgb<u8> = Rgb([0, 0, 0]);
        let mut img = ImageBuffer::from_pixel(frame_size, frame_size, BACKGROUND_COLOR);

        // Draw the trajectories
        for (body_i, body_positions) in positions.iter().enumerate() {
            if hide[body_i] {
                continue;
            }
            let clamp_end = current_end_step.min(body_positions.len());
            let start_idx = trajectory_starts[body_i];
            if start_idx >= clamp_end {
                continue;
            }
            for step in start_idx..clamp_end {
                let x = body_positions[step][0];
                let y = body_positions[step][1];
                let xp = ((x - adj_min_x) / range * frame_size as f64).round() as i32;
                let yp = ((y - adj_min_y) / range * frame_size as f64).round() as i32;

                let color = colors[body_i][step.min(colors[body_i].len() - 1)];
                draw_filled_circle_mut(&mut img, (xp, yp), 6, color);
            }
        }

        if !avoid_effects {
            // Optional blur effect
            let blurred = imageproc::filter::gaussian_blur_f32(&img, 6.0);
            img = blurred;

            // Then re-draw thinner circles in white
            const WHITE_COLOR: Rgb<u8> = Rgb([255, 255, 255]);
            for (body_i, body_positions) in positions.iter().enumerate() {
                if hide[body_i] {
                    continue;
                }
                let clamp_end = current_end_step.min(body_positions.len());
                let start_idx = trajectory_starts[body_i];
                if start_idx >= clamp_end {
                    continue;
                }
                for step in start_idx..clamp_end {
                    let x = body_positions[step][0];
                    let y = body_positions[step][1];
                    let xp = ((x - adj_min_x) / range * frame_size as f64).round() as i32;
                    let yp = ((y - adj_min_y) / range * frame_size as f64).round() as i32;
                    draw_filled_circle_mut(&mut img, (xp, yp), 1, WHITE_COLOR);
                }
            }
        }

        frames.push(img);

        if one_frame {
            break;
        }
    }
    frames
}

fn compute_bounding_box_for_all_steps(
    positions: &[Vec<Vector3<f64>>],
    hide: &[bool],
) -> (f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for (body_i, body_positions) in positions.iter().enumerate() {
        if hide[body_i] {
            continue;
        }
        for step_pos in body_positions {
            let x = step_pos[0];
            let y = step_pos[1];
            if x < min_x {
                min_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if x > max_x {
                max_x = x;
            }
            if y > max_y {
                max_y = y;
            }
        }
    }

    (min_x, min_y, max_x, max_y)
}

fn compute_bounding_box_for_frame(
    positions: &[Vec<Vector3<f64>>],
    hide: &[bool],
    trajectory_starts: &[usize],
    current_end_step: usize,
) -> (f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for (body_i, body_positions) in positions.iter().enumerate() {
        if hide[body_i] {
            continue;
        }
        let clamp_end = current_end_step.min(body_positions.len());
        if clamp_end == 0 {
            continue;
        }
        for step in trajectory_starts[body_i]..clamp_end {
            let x = body_positions[step][0];
            let y = body_positions[step][1];
            if x < min_x {
                min_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if x > max_x {
                max_x = x;
            }
            if y > max_y {
                max_y = y;
            }
        }
    }

    (min_x, min_y, max_x, max_y)
}

/// Create video using ffmpeg (minimal printing)
fn create_video_from_frames_in_memory(
    frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>],
    output_file: &str,
    frame_rate: u32,
) {
    println!("Generating video...");
    let mut command = Command::new("ffmpeg");
    command
        .arg("-y")
        .arg("-f")
        .arg("image2pipe")
        .arg("-vcodec")
        .arg("png")
        .arg("-r")
        .arg(frame_rate.to_string())
        .arg("-i")
        .arg("-")
        .arg("-c:v")
        .arg("libx264")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg(output_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut ffmpeg = command.spawn().expect("Failed ffmpeg");
    let ffmpeg_stdin = ffmpeg.stdin.as_mut().expect("Failed ffmpeg stdin");

    for frame in frames {
        let dyn_img = DynamicImage::ImageRgb8(frame.clone());
        let mut png_data = Vec::new();
        {
            let mut cursor = Cursor::new(&mut png_data);
            dyn_img.write_to(&mut cursor, ImageFormat::Png).expect("Write frame failed");
        }
        ffmpeg_stdin.write_all(&png_data).expect("Failed to write to ffmpeg stdin");
    }

    drop(ffmpeg.stdin.take());
    let output = ffmpeg.wait_with_output().expect("Wait ffmpeg");
    if !output.status.success() {
        eprintln!("ffmpeg error: {}", String::from_utf8_lossy(&output.stderr));
    }
    println!("Video creation complete.");
}

/// Compute fourier transform
fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let n = input.len();
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);

    let mut complex_input: Vec<Complex<f64>> =
        input.iter().map(|&v| Complex::new(v, 0.0)).collect();
    fft.process(&mut complex_input);
    complex_input
}

/// Calculate total energy
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

/// Calculate total angular momentum
fn calculate_total_angular_momentum(bodies: &[Body]) -> Vector3<f64> {
    let mut total_l = Vector3::zeros();
    for b in bodies {
        total_l += b.mass * b.position.cross(&b.velocity);
    }
    total_l
}

/// Approximate Entropy with kd-tree (fixed m=2)
fn approximate_entropy_kdtree(data: &[f64], r: f64) -> f64 {
    let n = data.len();
    if n < 3 {
        return 0.0;
    }

    let subsequences_m: Vec<[f64; APEN_M]> = (0..(n - 1)).map(|i| [data[i], data[i + 1]]).collect();
    let mut kdtree_m: KdTree<f64, u64, APEN_M, B, IDX> = KdTree::new();
    for (i, arr) in subsequences_m.iter().enumerate() {
        kdtree_m.add(arr, i as u64);
    }

    let phi_m = |kdtree: &KdTree<f64, u64, APEN_M, B, IDX>, subs: &[[f64; APEN_M]], rr: f64| {
        let countable = subs.len() as f64;
        let mut sum_log = 0.0;
        for arr in subs {
            let result = kdtree.within::<SquaredEuclidean>(arr, rr);
            let c = result.len() as f64 / countable;
            sum_log += c.ln();
        }
        sum_log / countable
    };

    let phi_m_val = phi_m(&kdtree_m, &subsequences_m, r);

    let subsequences_m1: Vec<[f64; APEN_M1]> =
        (0..(n - 2)).map(|i| [data[i], data[i + 1], data[i + 2]]).collect();

    let mut kdtree_m1: KdTree<f64, u64, APEN_M1, B, IDX> = KdTree::new();
    for (i, arr) in subsequences_m1.iter().enumerate() {
        kdtree_m1.add(arr, i as u64);
    }

    let phi_m1 = |kdtree: &KdTree<f64, u64, APEN_M1, B, IDX>, subs: &[[f64; APEN_M1]], rr: f64| {
        let countable = subs.len() as f64;
        let mut sum_log = 0.0;
        for arr in subs {
            let result = kdtree.within::<SquaredEuclidean>(arr, rr);
            let c = result.len() as f64 / countable;
            sum_log += c.ln();
        }
        sum_log / countable
    };

    let phi_m1_val = phi_m1(&kdtree_m1, &subsequences_m1, r);

    phi_m_val - phi_m1_val
}

/// Lyapunov exponent with kd-tree (m=3 fixed)
fn lyapunov_exponent_kdtree(data: &[f64], tau: usize, max_iter: usize) -> f64 {
    let n = data.len();
    if n < (LLE_M - 1) * tau + 1 {
        return 0.0;
    }

    let embedded: Vec<[f64; LLE_M]> =
        (0..(n - (LLE_M - 1) * tau)).map(|i| [data[i], data[i + tau], data[i + 2 * tau]]).collect();

    let emb_len = embedded.len();
    if emb_len < 2 {
        return 0.0;
    }

    let mut kdtree: KdTree<f64, u64, LLE_M, B, IDX> = KdTree::new();
    for (i, point) in embedded.iter().enumerate() {
        kdtree.add(point, i as u64);
    }

    let mut divergence = vec![0.0; max_iter];
    let mut counts = vec![0usize; max_iter];

    for i in 0..emb_len {
        let query = &embedded[i];
        let nn_buffer = kdtree.nearest_n::<SquaredEuclidean>(query, 2);

        let nn1 = nn_buffer[0];
        let nn2 = nn_buffer[1];

        let (nn_id, _) =
            if nn1.item == i as u64 { (nn2.item, nn2.distance) } else { (nn1.item, nn1.distance) };

        let j = nn_id as usize;
        let allowed_steps = max_iter.min(emb_len - 1 - i).min(emb_len - 1 - j);

        for k in 0..allowed_steps {
            let dist_i = (0..LLE_M)
                .map(|d| (embedded[i + k][d] - embedded[j + k][d]).powi(2))
                .sum::<f64>()
                .sqrt();
            divergence[k] += dist_i;
            counts[k] += 1;
        }
    }

    if max_iter < 2 {
        return 0.0;
    }

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

/// Calculate average triangle area (in 2D, after normalization)
fn average_triangle_area(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let mut new_positions = positions.to_vec();
    normalize_positions_for_analysis(&mut new_positions);

    let mut result = 0.0;
    let mut total_num = 0.0;

    for step in 0..new_positions[0].len() {
        let x1 = new_positions[0][step][0];
        let y1 = new_positions[0][step][1];
        let x2 = new_positions[1][step][0];
        let y2 = new_positions[1][step][1];
        let x3 = new_positions[2][step][0];
        let y3 = new_positions[2][step][1];

        let area = 0.5 * ((x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)).abs());
        result += area;
        total_num += 1.0;
    }
    result / total_num
}

// For analysis only; not used for final rendering. Ignores z dimension.
fn normalize_positions_for_analysis(positions: &mut [Vec<Vector3<f64>>]) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for body_pos in positions.iter() {
        for pos in body_pos {
            let (x, y) = (pos[0], pos[1]);
            if x < min_x {
                min_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if x > max_x {
                max_x = x;
            }
            if y > max_y {
                max_y = y;
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

/// Calculate total distance traveled by all bodies in 2D, after normalization.
fn total_distance(positions: &[Vec<Vector3<f64>>]) -> f64 {
    // Copy so we can normalize
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

/// Non-chaoticness measure
fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &[Vec<Vector3<f64>>]) -> f64 {
    let len = positions[0].len();
    let mut r1 = vec![0.0; len];
    let mut r2 = vec![0.0; len];
    let mut r3 = vec![0.0; len];

    for i in 0..len {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];

        // center of mass for the other two bodies:
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

#[derive(Debug, Clone)]
struct TrajectoryResult {
    chaos: f64,         // lower is better
    avg_area: f64,      // higher is better
    total_dist: f64,    // higher is better
    ap_en: f64,         // higher is better
    lyap_exp: f64,      // higher is better
    total_score: usize, // higher is better
}

/// A struct capturing the points each metric awarded to the best trajectory
#[derive(Debug, Clone)]
struct BestPoints {
    chaos_pts: usize,
    area_pts: usize,
    dist_pts: usize,
    apen_pts: usize,
    lyap_pts: usize,
}

/// Returns (positions of best trajectory, info about best trajectory, masses of that best sim,
/// plus some meta-info about how many sims are valid, and the points for each metric).
fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_iters: usize,
    num_steps_sim: usize,
    num_steps_video: usize,
    max_points: usize,
) -> (
    Vec<Vec<Vector3<f64>>>,
    TrajectoryResult,
    [f64; 3],
    usize, // valid_count
    BestPoints,
) {
    println!("Running {} simulations to find the best orbit...", num_iters);

    // Create many random sets of bodies
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

    // We'll store: (TrajectoryResult, index_in_many_bodies, [m1,m2,m3]) or None if discarded
    let results_par: Vec<Option<(TrajectoryResult, usize, [f64; 3])>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(index, bodies)| {
            let total_energy = calculate_total_energy(bodies);
            let ang_mom_vec = calculate_total_angular_momentum(bodies);
            let ang_mom_mag = ang_mom_vec.norm();

            // Only keep negative total energy & not negligible angular momentum
            if total_energy >= 0.0 || ang_mom_mag < 1e-3 {
                None
            } else {
                // Simulate for num_steps_sim
                let positions_full = get_positions(bodies.clone(), num_steps_sim);

                // Sub-sampling for ApEn / Lyap
                let len = positions_full[0].len();
                let factor = (len / max_points).max(1);
                let body1_norms: Vec<f64> =
                    positions_full[0].iter().step_by(factor).map(|p| p.norm()).collect();

                let m1 = bodies[0].mass;
                let m2 = bodies[1].mass;
                let m3 = bodies[2].mass;

                let c = non_chaoticness(m1, m2, m3, &positions_full);
                let a = average_triangle_area(&positions_full);
                let d = total_distance(&positions_full); // 2D distance after normalization
                let std_dev = body1_norms.iter().copied().std_dev();
                let r_apen = 0.2 * std_dev;
                let ap = approximate_entropy_kdtree(&body1_norms, r_apen);
                let ly = lyapunov_exponent_kdtree(&body1_norms, 1, 50);

                Some((
                    TrajectoryResult {
                        chaos: c,
                        avg_area: a,
                        total_dist: d,
                        ap_en: ap,
                        lyap_exp: ly,
                        total_score: 0,
                    },
                    index,
                    [m1, m2, m3],
                ))
            }
        })
        .collect();

    // Filter out the None
    let valid_results: Vec<_> = results_par.into_iter().filter_map(|x| x).collect();
    let valid_count = valid_results.len();
    println!(
        "Number of valid simulations considered: {}/{} (others discarded because total_energy>=0 or ang_mom<1e-3).",
        valid_count, num_iters
    );
    if valid_results.is_empty() {
        panic!("No valid simulations found. Possibly all orbits unbound or zero angular momentum.");
    }

    // We'll gather each metric in vectors for Borda scoring:
    let mut chaos_vals: Vec<(f64, usize)> = vec![];
    let mut avg_area_vals: Vec<(f64, usize)> = vec![];
    let mut dist_vals: Vec<(f64, usize)> = vec![];
    let mut ap_en_vals: Vec<(f64, usize)> = vec![];
    let mut lyap_vals: Vec<(f64, usize)> = vec![];

    let mut info_vec = valid_results;

    for (i, (tr, _, _)) in info_vec.iter().enumerate() {
        chaos_vals.push((tr.chaos, i));
        avg_area_vals.push((tr.avg_area, i));
        dist_vals.push((tr.total_dist, i));
        ap_en_vals.push((tr.ap_en, i));
        lyap_vals.push((tr.lyap_exp, i));
    }

    fn assign_borda_scores(mut vals: Vec<(f64, usize)>, higher_better: bool) -> Vec<usize> {
        // Returns a vector of "points" for each index
        //   index i => how many points it gets for this metric
        // First, sort by ascending or descending depending on higher_better
        if higher_better {
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = vals.len();
        let mut points_for_index = vec![0; n];
        // rank=0 => highest gets n points, rank=1 => next gets n-1, etc.
        for (rank, (_, idx)) in vals.into_iter().enumerate() {
            let score = n - rank;
            points_for_index[idx] = score;
        }
        points_for_index
    }

    // chaos: lower better
    let chaos_points = assign_borda_scores(chaos_vals, false);
    // avg_area: higher better
    let area_points = assign_borda_scores(avg_area_vals, true);
    // total_dist: higher better
    let dist_points = assign_borda_scores(dist_vals, true);
    // ap_en: higher better
    let apen_points = assign_borda_scores(ap_en_vals, true);
    // lyap: higher better
    let lyap_points = assign_borda_scores(lyap_vals, true);

    // Sum up
    for (i, (tr, _, _)) in info_vec.iter_mut().enumerate() {
        tr.total_score =
            chaos_points[i] + area_points[i] + dist_points[i] + apen_points[i] + lyap_points[i];
    }

    // Pick best by total_score
    let (best_i, best_item) =
        info_vec.iter().enumerate().max_by_key(|(_, (tr, _, _))| tr.total_score).unwrap();

    let best_tr = best_item.0.clone();
    let best_bodies_index = best_item.1;
    let best_masses = best_item.2;

    // re-run that simulation for num_steps_video steps
    let chosen_bodies = &many_bodies[best_bodies_index];
    let positions_best = get_positions(chosen_bodies.clone(), num_steps_video);

    // We'll store the points for the best trajectory for CSV logging
    let best_pts = BestPoints {
        chaos_pts: chaos_points[best_i],
        area_pts: area_points[best_i],
        dist_pts: dist_points[best_i],
        apen_pts: apen_points[best_i],
        lyap_pts: lyap_points[best_i],
    };

    (positions_best, best_tr, best_masses, valid_count, best_pts)
}

/// Append one line to a CSV file, creating it if needed.
/// Includes all command-line args, final results, etc.
fn append_to_csv(
    args: &Args,
    valid_sims: usize,
    best_pts: &BestPoints,
    best_tr: &TrajectoryResult,
    best_masses: &[f64; 3],
    num_iters: usize,
) {
    use std::fs::OpenOptions;
    let path = "results.csv";

    let file_exists = std::path::Path::new(path).exists();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .expect("Cannot open or create results.csv");

    // If file is newly created, write header:
    if !file_exists {
        let header = "timestamp,seed,file_name,num_steps,num_sims,location,velocity,\
min_mass,max_mass,avoid_effects,no_video,dynamic_bounds,special_color,\
max_points,video_tail_min,video_tail_max,image_tail_min,image_tail_max,\
special_color_video_tail_min,special_color_video_tail_max,\
special_color_image_tail_min,special_color_image_tail_max,\
valid_sims,total_sims,\
best_chaos_value,best_chaos_points,best_avg_area_value,best_avg_area_points,\
best_dist_value,best_dist_points,best_apen_value,best_apen_points,\
best_lyap_value,best_lyap_points,best_score,best_m1,best_m2,best_m3\n";
        file.write_all(header.as_bytes()).unwrap();
    }

    let now_unix = Utc::now().timestamp();
    let color_str = match &args.special_color {
        Some(c) => c.to_string(),
        None => "".to_string(),
    };

    let row_cleaned = format!("{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
        now_unix,
        args.seed,
        args.file_name,
        args.num_steps,
        args.num_sims,
        args.location,
        args.velocity,
        args.min_mass,
        args.max_mass,
        args.avoid_effects,
        args.no_video,
        args.dynamic_bounds,
        color_str,
        args.max_points,
        args.video_tail_min,
        args.video_tail_max,
        args.image_tail_min,
        args.image_tail_max,
        args.special_color_video_tail_min,
        args.special_color_video_tail_max,
        args.special_color_image_tail_min,
        args.special_color_image_tail_max,
        valid_sims,
        num_iters,
        best_tr.chaos,
        best_pts.chaos_pts,
        best_tr.avg_area,
        best_pts.area_pts,
        best_tr.total_dist,
        best_pts.dist_pts,
        best_tr.ap_en,
        best_pts.apen_pts,
        best_tr.lyap_exp,
        best_pts.lyap_pts,
        best_tr.total_score,
        best_masses[0],
        best_masses[1],
        best_masses[2]
    );

    file.write_all(row_cleaned.as_bytes()).unwrap();
}

fn main() {
    let args = Args::parse();
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed = hex::decode(hex_seed).expect("Invalid hex seed");

    println!("Starting 3-body simulations with up to {} steps each...", args.num_steps);

    let mut rng = Sha3RandomByteStream::new(
        &seed,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // Decide which bodies to hide (for final rendering)
    let hide_bodies = {
        let val = rng.gen_range(0.0, 1.0);
        if val < 1.0 / 3.0 {
            vec![false, false, false]
        } else if val < 2.0 / 3.0 {
            vec![false, false, true]
        } else {
            vec![false, true, true]
        }
    };

    // 1) Select best trajectory
    let (mut positions, best_result, best_masses, valid_sims, best_points) = select_best_trajectory(
        &mut rng,
        args.num_sims,
        args.num_steps,
        args.num_steps,
        args.max_points,
    );

    // 2) Normalize positions (for final visualization)
    normalize_positions_inplace(&mut positions);

    // 3) Generate color sequences
    let colors =
        generate_body_color_sequences(&mut rng, args.num_steps, args.special_color.as_deref());
    let base_name = args.file_name.as_str();
    let video_filename = format!("vids/{}.mp4", base_name);

    // Decide on the tail lengths:
    let (video_trajectory_lengths, image_trajectory_lengths) = if args.special_color.is_some() {
        let vt_min = args.special_color_video_tail_min;
        let vt_max = args.special_color_video_tail_max;
        let it_min = args.special_color_image_tail_min;
        let it_max = args.special_color_image_tail_max;

        (
            [
                rng.gen_range(vt_min, vt_max),
                rng.gen_range(vt_min, vt_max),
                rng.gen_range(vt_min, vt_max),
            ],
            [
                rng.gen_range(it_min, it_max),
                rng.gen_range(it_min, it_max),
                rng.gen_range(it_min, it_max),
            ],
        )
    } else {
        let vt_min = args.video_tail_min;
        let vt_max = args.video_tail_max;
        let it_min = args.image_tail_min;
        let it_max = args.image_tail_max;

        (
            [
                rng.gen_range(vt_min, vt_max),
                rng.gen_range(vt_min, vt_max),
                rng.gen_range(vt_min, vt_max),
            ],
            [
                rng.gen_range(it_min, it_max),
                rng.gen_range(it_min, it_max),
                rng.gen_range(it_min, it_max),
            ],
        )
    };

    // Print best trajectory info (final user-friendly output)
    println!("\nScore breakdown for best trajectory:");
    println!(
        "  - Chaos measure (lower better) = {:.4e}, awarded {} points",
        best_result.chaos, best_points.chaos_pts
    );
    println!(
        "  - Avg triangle area (higher better) = {:.6}, awarded {} points",
        best_result.avg_area, best_points.area_pts
    );
    println!(
        "  - Total distance (higher better) = {:.6}, awarded {} points",
        best_result.total_dist, best_points.dist_pts
    );
    println!(
        "  - Approx. Entropy (ApEn) (higher better) = {:.6}, awarded {} points",
        best_result.ap_en, best_points.apen_pts
    );
    println!(
        "  - Lyapunov exponent (higher better) = {:.6}, awarded {} points",
        best_result.lyap_exp, best_points.lyap_pts
    );
    println!("  ----------------------------------------------------");
    println!("  => Final total score = {}", best_result.total_score);

    println!("\n================ BEST TRAJECTORY INFO ================");
    println!(" - Score (Higher is better): {}", best_result.total_score);
    println!(" - Masses: [{:.2}, {:.2}, {:.2}]", best_masses[0], best_masses[1], best_masses[2]);
    println!(" - Chaos measure (Lower is better): {:.4e}", best_result.chaos);
    println!(" - Average triangle area (Higher is better): {:.6}", best_result.avg_area);
    println!(" - Total distance (Higher is better): {:.6}", best_result.total_dist);
    println!(" - Approx. Entropy (ApEn) (Higher is better): {:.6}", best_result.ap_en);
    println!(" - Lyapunov exponent (Higher is better): {:.6}", best_result.lyap_exp);
    println!("======================================================");

    // Write all this to CSV
    append_to_csv(&args, valid_sims, &best_points, &best_result, &best_masses, args.num_sims);

    // Make a single image (one_frame = true)
    let pic_frames = plot_positions(
        &positions,
        1600,
        image_trajectory_lengths,
        &hide_bodies,
        &colors,
        999_999_999, // effectively produce 1 frame
        args.avoid_effects,
        true,
        args.dynamic_bounds,
    );
    let last_frame = pic_frames.last().unwrap().clone();
    if let Err(e) = last_frame.save(format!("pics/{}.png", base_name)) {
        eprintln!("Error saving image: {:?}", e);
    } else {
        println!("Final snapshot (image) saved as pics/{}.png", base_name);
    }

    // Optionally generate a video
    if !args.no_video {
        let num_seconds = 30;
        let target_length = 60 * num_seconds;
        let frame_interval =
            if target_length > 0 { args.num_steps.saturating_div(target_length) } else { 1 };
        let frames = plot_positions(
            &positions,
            1600,
            video_trajectory_lengths,
            &hide_bodies,
            &colors,
            frame_interval,
            args.avoid_effects,
            false,
            args.dynamic_bounds,
        );
        create_video_from_frames_in_memory(&frames, &video_filename, 60);
    } else {
        println!("No video requested.");
    }

    println!("\nDone with simulation and rendering.");
}
