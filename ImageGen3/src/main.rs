use na::Vector3;
use nalgebra as na;

use clap::Parser;
use rayon::prelude::*;
use sha3::{Digest, Sha3_256};
use std::f64::{INFINITY, NEG_INFINITY};

use hex;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use imageproc::drawing::draw_filled_circle_mut;
use imageproc::filter;
use palette::{FromColor, Hsl, Srgb};
use std::io::{Cursor, Write};
use std::process::{Command, Stdio};

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use statrs::statistics::Statistics;

// Needed for your LLE function:
use kiddo::float::kdtree::KdTree;
use kiddo::SquaredEuclidean;

// ===================== Constants =====================
const LLE_M: usize = 3;
const B: usize = 32;
type IDX = u32;

const G: f64 = 9.8;

/// Command-line arguments
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate & visualize the three-body problem (trajectories + LIC flow + long-exposure) using Sha3 RNG."
)]
struct Args {
    // Basic simulation parameters
    #[arg(long, default_value = "00")]
    seed: String,
    #[arg(long, default_value = "output")]
    file_name: String,
    #[arg(long, default_value_t = 1_000_000)]
    num_steps: usize,
    #[arg(long, default_value_t = 10_000)]
    num_sims: usize,

    // Ranges for random generation
    #[arg(long, default_value_t = 250.0)]
    location: f64,
    #[arg(long, default_value_t = 2.0)]
    velocity: f64,
    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,
    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    // Visualization toggles
    #[arg(long, default_value_t = false)]
    avoid_effects: bool,
    #[arg(long, default_value_t = false)]
    no_video: bool,
    #[arg(long, default_value_t = false)]
    dynamic_bounds: bool,
    #[arg(long, default_value_t = false)]
    no_image: bool,
    #[arg(long, default_value_t = false)]
    force_visible: bool,

    // Colors
    #[arg(
        long,
        value_parser = [
            "gold", "bronze", "white", "emerald", "sapphire", "quartz",
            "amethyst", "topaz", "turquoise", "aqua", "fuchsia"
        ]
    )]
    special_color: Option<String>,

    // Analysis
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,

    // Trajectory length parameters (regular)
    #[arg(long, default_value_t = 0.2)]
    video_tail_min: f64,
    #[arg(long, default_value_t = 2.0)]
    video_tail_max: f64,
    #[arg(long, default_value_t = 1.0)]
    image_tail_min: f64,
    #[arg(long, default_value_t = 8.0)]
    image_tail_max: f64,

    // Trajectory length parameters (when special color IS used)
    #[arg(long, default_value_t = 1.0)]
    special_color_video_tail_min: f64,
    #[arg(long, default_value_t = 1.0)]
    special_color_video_tail_max: f64,
    #[arg(long, default_value_t = 5.0)]
    special_color_image_tail_min: f64,
    #[arg(long, default_value_t = 5.0)]
    special_color_image_tail_max: f64,

    // Weights for metrics
    #[arg(long, default_value_t = 1.0)]
    chaos_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    area_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    dist_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    lyap_weight: f64,
}

/// A custom RNG based on repeated Sha3-256 hashing.
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

    pub fn random_unit(&mut self) -> f64 {
        self.next_f64()
    }
}

/// A celestial body
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

/// Verlet step
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

/// Simulate & record final positions
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;

    // Phase 1: get final state
    for _ in 0..num_steps {
        verlet_step(&mut bodies, dt);
    }

    // Phase 2: record positions
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

// Colors
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

// Helper functions for indexing nalgebra's Vector3
fn x(v: &Vector3<f64>) -> f64 {
    v[0]
}
fn y(v: &Vector3<f64>) -> f64 {
    v[1]
}

// Normalize entire positions in-place
fn normalize_positions_inplace(positions: &mut [Vec<Vector3<f64>>]) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for body_pos in positions.iter() {
        for pos in body_pos {
            let px = x(pos);
            let py = y(pos);
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
    let mut range = (max_x - min_x).max(max_y - min_y);
    if range < 1e-14 {
        range = 1.0;
    }

    let half_range = range / 2.0;
    for body_pos in positions.iter_mut() {
        for pos in body_pos.iter_mut() {
            pos[0] = (pos[0] - (x_center - half_range)) / range;
            pos[1] = (pos[1] - (y_center - half_range)) / range;
        }
    }
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
        for &pos in body_positions {
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
            let px = body_positions[step][0];
            let py = body_positions[step][1];
            if px < min_x {
                min_x = px;
            }
            if py < min_y {
                min_y = py;
            }
            if px > max_x {
                max_x = px;
            }
            if py > max_y {
                max_y = py;
            }
        }
    }
    (min_x, min_y, max_x, max_y)
}

// Plot single or multi
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
    } else if frame_interval == 0 {
        1
    } else {
        total_steps / frame_interval
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
                let x1 = body_positions[idx][0];
                let y1 = body_positions[idx][1];
                let x2 = body_positions[idx - 1][0];
                let y2 = body_positions[idx - 1][1];
                let dist = ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt();
                total_dist += dist;
                if total_dist >= trajectory_lengths[body_i] {
                    break;
                }
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

        let mut img = ImageBuffer::from_pixel(frame_size, frame_size, Rgb([0, 0, 0]));

        // draw trajectories
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
                let px = body_positions[step][0];
                let py = body_positions[step][1];
                let xp = ((px - adj_min_x) / range * frame_size as f64).round() as i32;
                let yp = ((py - adj_min_y) / range * frame_size as f64).round() as i32;
                let color = colors[body_i][step.min(colors[body_i].len() - 1)];
                draw_filled_circle_mut(&mut img, (xp, yp), 6, color);
            }
        }

        if !avoid_effects {
            // optional blur
            let blurred = filter::gaussian_blur_f32(&img, 6.0);
            let mut img2 = blurred.clone();
            // highlight the path with small white dots
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
                    let px = body_positions[step][0];
                    let py = body_positions[step][1];
                    let xp = ((px - adj_min_x) / range * frame_size as f64).round() as i32;
                    let yp = ((py - adj_min_y) / range * frame_size as f64).round() as i32;
                    draw_filled_circle_mut(&mut img2, (xp, yp), 1, Rgb([255, 255, 255]));
                }
            }
            img = img2;
        }

        frames.push(img);

        if one_frame {
            break;
        }
    }
    frames
}

// Create video
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

// ============= stats
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

fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let n = input.len();
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    let mut complex_input: Vec<Complex<f64>> =
        input.iter().map(|&v| Complex::new(v, 0.0)).collect();
    fft.process(&mut complex_input);
    complex_input
}

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

fn total_distance(positions: &[Vec<Vector3<f64>>]) -> f64 {
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

/// "Chaos measure" used in code
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

// ================== Actual LLE code using KdTree (your snippet) ==================
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

        // If the first nearest neighbor is itself, pick the second
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

// Borda result
#[derive(Debug, Clone)]
struct TrajectoryResult {
    chaos: f64,
    avg_area: f64,
    total_dist: f64,
    lyap_exp: f64,
    chaos_pts: usize,
    area_pts: usize,
    dist_pts: usize,
    lyap_pts: usize,
    total_score: usize,
    total_score_weighted: f64,
}

/// Select best orbit
fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_iters: usize,
    num_steps_sim: usize,
    num_steps_video: usize,
    max_points: usize,
    chaos_weight: f64,
    area_weight: f64,
    dist_weight: f64,
    lyap_weight: f64,
) -> (Vec<Vec<Vector3<f64>>>, TrajectoryResult, [f64; 3], usize) {
    println!("Running {} simulations to find the best orbit...", num_iters);

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

    use rayon::prelude::*;
    let results_par: Vec<Option<(TrajectoryResult, usize, [f64; 3])>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(index, bodies)| {
            let total_energy = calculate_total_energy(bodies);
            let ang_mom = calculate_total_angular_momentum(bodies).norm();

            // Filter out unbound or degenerate
            if total_energy >= 0.0 || ang_mom < 1e-3 {
                None
            } else {
                let positions_full = get_positions(bodies.clone(), num_steps_sim);
                let len = positions_full[0].len();
                let factor = (len / max_points).max(1);
                // We'll just check body #1 for LLE
                let body1_norms: Vec<f64> =
                    positions_full[0].iter().step_by(factor).map(|p| p.norm()).collect();

                let m1 = bodies[0].mass;
                let m2 = bodies[1].mass;
                let m3 = bodies[2].mass;

                let c = non_chaoticness(m1, m2, m3, &positions_full);
                let a = average_triangle_area(&positions_full);
                let d = total_distance(&positions_full);

                // Now your function:
                let ly = lyapunov_exponent_kdtree(&body1_norms, 1, 50);

                Some((
                    TrajectoryResult {
                        chaos: c,
                        avg_area: a,
                        total_dist: d,
                        lyap_exp: ly,
                        chaos_pts: 0,
                        area_pts: 0,
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

    let valid_results: Vec<_> = results_par.into_iter().filter_map(|x| x).collect();
    let valid_count = valid_results.len();
    println!(
        "Number of valid simulations considered: {}/{} (others unbound or small angular momentum).",
        valid_count, num_iters
    );
    if valid_results.is_empty() {
        panic!("No valid simulations found. Possibly all orbits unbound or zero angular momentum.");
    }

    let mut chaos_vals = vec![];
    let mut avg_area_vals = vec![];
    let mut dist_vals = vec![];
    let mut lyap_vals = vec![];

    let mut info_vec = valid_results;
    for (i, (tr, _, _)) in info_vec.iter().enumerate() {
        chaos_vals.push((tr.chaos, i));
        avg_area_vals.push((tr.avg_area, i));
        dist_vals.push((tr.total_dist, i));
        lyap_vals.push((tr.lyap_exp, i));
    }

    // Borda scoring
    fn assign_borda_scores(mut vals: Vec<(f64, usize)>, higher_better: bool) -> Vec<usize> {
        if higher_better {
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = vals.len();
        let mut points_for_index = vec![0; n];
        for (rank, (_, idx)) in vals.into_iter().enumerate() {
            let score = n - rank;
            points_for_index[idx] = score;
        }
        points_for_index
    }

    let chaos_points = assign_borda_scores(chaos_vals, false);
    let area_points = assign_borda_scores(avg_area_vals, true);
    let dist_points = assign_borda_scores(dist_vals, true);
    let lyap_points = assign_borda_scores(lyap_vals, true);

    for (i, (tr, _, _)) in info_vec.iter_mut().enumerate() {
        tr.chaos_pts = chaos_points[i];
        tr.area_pts = area_points[i];
        tr.dist_pts = dist_points[i];
        tr.lyap_pts = lyap_points[i];
        tr.total_score = chaos_points[i] + area_points[i] + dist_points[i] + lyap_points[i];
        tr.total_score_weighted = chaos_points[i] as f64 * chaos_weight
            + area_points[i] as f64 * area_weight
            + dist_points[i] as f64 * dist_weight
            + lyap_points[i] as f64 * lyap_weight;
    }

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

    let chosen_bodies = &many_bodies[best_bodies_index];
    let positions_best = get_positions(chosen_bodies.clone(), num_steps_video);

    (positions_best, best_tr, best_masses, valid_count)
}

// ============ For the LIC flow
#[derive(Clone)]
struct FieldCell {
    vx: f64,
    vy: f64,
}

/// Compute the field on Nx×Ny
fn compute_gravity_field(
    bodies: &[Body],
    nx: usize,
    ny: usize,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
) -> Vec<FieldCell> {
    let mut field = vec![FieldCell { vx: 0.0, vy: 0.0 }; nx * ny];
    let dx = (max_x - min_x) / (nx as f64);
    let dy = (max_y - min_y) / (ny as f64);

    for j in 0..ny {
        let y = min_y + (j as f64 + 0.5) * dy;
        for i in 0..nx {
            let x = min_x + (i as f64 + 0.5) * dx;
            let mut fx = 0.0;
            let mut fy = 0.0;
            for b in bodies {
                let rx = x - b.position[0];
                let ry = y - b.position[1];
                let dist2 = rx * rx + ry * ry;
                let dist = dist2.sqrt();
                if dist > 1e-12 {
                    let scale = -G * b.mass / dist.powi(3);
                    fx += scale * rx;
                    fy += scale * ry;
                }
            }
            let idx = j * nx + i;
            field[idx].vx = fx;
            field[idx].vy = fy;
        }
    }
    field
}

fn sample_field_bilinear(field: &[FieldCell], nx: usize, ny: usize, x: f64, y: f64) -> (f64, f64) {
    if x < 0.0 || x >= (nx - 1) as f64 || y < 0.0 || y >= (ny - 1) as f64 {
        return (0.0, 0.0);
    }

    let ix = x.floor() as usize;
    let iy = y.floor() as usize;
    let fx = x - ix as f64;
    let fy = y - iy as f64;

    let idx00 = iy * nx + ix;
    let idx01 = (iy + 1) * nx + ix;
    let idx10 = iy * nx + (ix + 1);
    let idx11 = (iy + 1) * nx + (ix + 1);

    let vx00 = field[idx00].vx;
    let vy00 = field[idx00].vy;
    let vx01 = field[idx01].vx;
    let vy01 = field[idx01].vy;
    let vx10 = field[idx10].vx;
    let vy10 = field[idx10].vy;
    let vx11 = field[idx11].vx;
    let vy11 = field[idx11].vy;

    let vx0 = vx00 * (1.0 - fy) + vx01 * fy;
    let vx1 = vx10 * (1.0 - fy) + vx11 * fy;
    let vy0 = vy00 * (1.0 - fy) + vy01 * fy;
    let vy1 = vy10 * (1.0 - fy) + vy11 * fy;

    let vx = vx0 * (1.0 - fx) + vx1 * fx;
    let vy = vy0 * (1.0 - fx) + vy1 * fx;
    (vx, vy)
}

fn trace_streamline(
    mut x: f64,
    mut y: f64,
    sign: f64,
    field: &[FieldCell],
    noise: &[f64],
    nx: usize,
    ny: usize,
    kernel_steps: usize,
    step_size: f64,
) -> (f64, f64) {
    let mut sum = 0.0;
    let mut count = 0.0;
    for _ in 0..kernel_steps {
        let (vx, vy) = sample_field_bilinear(field, nx, ny, x, y);
        let mag = (vx * vx + vy * vy).sqrt() + 1e-12;
        let step_vx = vx / mag * sign * step_size;
        let step_vy = vy / mag * sign * step_size;

        let xi = x.round() as i32;
        let yi = y.round() as i32;
        if xi < 0 || xi >= nx as i32 || yi < 0 || yi >= ny as i32 {
            break;
        }
        let idx = yi as usize * nx + xi as usize;
        sum += noise[idx];
        count += 1.0;

        x += step_vx;
        y += step_vy;
        if x < 0.0 || x >= nx as f64 || y < 0.0 || y >= ny as f64 {
            break;
        }
    }
    (sum, count)
}

fn perform_lic(field: &[FieldCell], noise: &[f64], nx: usize, ny: usize) -> Vec<f64> {
    let kernel_steps = 20;
    let step_size = 1.0;
    let mut output = vec![0.0; nx * ny];

    for j in 0..ny {
        for i in 0..nx {
            let idx = j * nx + i;
            let center_noise = noise[idx];
            let mut sum = center_noise;
            let mut count = 1.0;

            let (fsum, fcount) = trace_streamline(
                i as f64,
                j as f64,
                1.0,
                field,
                noise,
                nx,
                ny,
                kernel_steps,
                step_size,
            );
            sum += fsum;
            count += fcount;

            let (bsum, bcount) = trace_streamline(
                i as f64,
                j as f64,
                -1.0,
                field,
                noise,
                nx,
                ny,
                kernel_steps,
                step_size,
            );
            sum += bsum;
            count += bcount;

            output[idx] = sum / count;
        }
    }
    output
}

fn colorize_lic(
    lic: &[f64],
    field: &[FieldCell],
    nx: usize,
    ny: usize,
) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let mut img = ImageBuffer::new(nx as u32, ny as u32);

    let mut max_mag = 0.0;
    for c in field {
        let mag = (c.vx * c.vx + c.vy * c.vy).sqrt();
        if mag > max_mag {
            max_mag = mag;
        }
    }
    if max_mag < 1e-12 {
        max_mag = 1.0;
    }

    for j in 0..ny {
        for i in 0..nx {
            let idx = j * nx + i;
            let gray = lic[idx];
            let vx = field[idx].vx;
            let vy = field[idx].vy;
            let mag = (vx * vx + vy * vy).sqrt();
            let hue = 240.0 * (mag / max_mag).min(1.0);
            let sat = 1.0;
            let light = gray;
            let (r, g, b) = hsl_to_rgb(hue, sat, light);
            img.put_pixel(i as u32, j as u32, Rgb([r, g, b]));
        }
    }
    img
}

fn hsl_to_rgb(h_deg: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hh = h_deg / 60.0;
    let x = c * (1.0 - (hh % 2.0 - 1.0).abs());
    let (r1, g1, b1) = if hh < 1.0 {
        (c, x, 0.0)
    } else if hh < 2.0 {
        (x, c, 0.0)
    } else if hh < 3.0 {
        (0.0, c, x)
    } else if hh < 4.0 {
        (0.0, x, c)
    } else if hh < 5.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    let m = l - c / 2.0;
    let rr = ((r1 + m) * 255.0).clamp(0.0, 255.0) as u8;
    let gg = ((g1 + m) * 255.0).clamp(0.0, 255.0) as u8;
    let bb = ((b1 + m) * 255.0).clamp(0.0, 255.0) as u8;
    (rr, gg, bb)
}

// --------------- Long-Exposure
#[derive(Clone)]
struct ExposureCell {
    sum_fx: f64,
    sum_fy: f64,
    sum_mag: f64,
    count: usize,
}

fn accumulate_time_exposure(
    positions: &[Vec<Vector3<f64>>],
    masses: &[f64; 3],
    nx: usize,
    ny: usize,
) -> (Vec<ExposureCell>, f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    for i in 0..3 {
        for &p in positions[i].iter() {
            let px = p[0];
            let py = p[1];
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
    let pad_factor = 0.1;
    let w = max_x - min_x;
    let h = max_y - min_y;
    // Expand bounding box a bit
    min_x -= w * pad_factor;
    max_x += w * pad_factor;
    min_y -= h * pad_factor;
    max_y += h * pad_factor;

    let dx = (max_x - min_x) / (nx as f64);
    let dy = (max_y - min_y) / (ny as f64);

    let total_steps = positions[0].len();
    let sample_count = 2000.min(total_steps);
    let step_stride = (total_steps / sample_count).max(1);

    println!(
        "Long-exposure bounding box= [{:.3},{:.3}]..[{:.3},{:.3}]",
        min_x, min_y, max_x, max_y
    );
    println!("Sub-sampling steps= {}, stride= {}", sample_count, step_stride);

    let mut accum =
        vec![ExposureCell { sum_fx: 0.0, sum_fy: 0.0, sum_mag: 0.0, count: 0 }; nx * ny];

    // chunked approach
    for t in (0..total_steps).step_by(step_stride) {
        let p1 = positions[0][t];
        let p2 = positions[1][t];
        let p3 = positions[2][t];

        accum.par_iter_mut().enumerate().for_each(|(idx, cell)| {
            let i = idx % nx;
            let j = idx / nx;
            let x = min_x + (i as f64 + 0.5) * dx;
            let y = min_y + (j as f64 + 0.5) * dy;

            let mut fx = 0.0;
            let mut fy = 0.0;

            // from body1
            let rx1 = x - p1[0];
            let ry1 = y - p1[1];
            let dist1 = (rx1 * rx1 + ry1 * ry1).sqrt();
            if dist1 > 1e-12 {
                let scale = -G * masses[0] / dist1.powi(3);
                fx += scale * rx1;
                fy += scale * ry1;
            }

            // from body2
            let rx2 = x - p2[0];
            let ry2 = y - p2[1];
            let dist2 = (rx2 * rx2 + ry2 * ry2).sqrt();
            if dist2 > 1e-12 {
                let scale = -G * masses[1] / dist2.powi(3);
                fx += scale * rx2;
                fy += scale * ry2;
            }

            // from body3
            let rx3 = x - p3[0];
            let ry3 = y - p3[1];
            let dist3 = (rx3 * rx3 + ry3 * ry3).sqrt();
            if dist3 > 1e-12 {
                let scale = -G * masses[2] / dist3.powi(3);
                fx += scale * rx3;
                fy += scale * ry3;
            }

            let mag = (fx * fx + fy * fy).sqrt();
            cell.sum_fx += fx;
            cell.sum_fy += fy;
            cell.sum_mag += mag;
            cell.count += 1;
        });
    }

    (accum, min_x, max_x, min_y, max_y)
}

fn generate_exposure_images(
    accum: &[ExposureCell],
    nx: usize,
    ny: usize,
    _min_x: f64,
    _max_x: f64,
    _min_y: f64,
    _max_y: f64,
    base_name: &str,
) {
    let mut global_max_mag = 0.0;
    for cell in accum {
        if cell.count > 0 {
            let avg_mag = cell.sum_mag / (cell.count as f64);
            if avg_mag > global_max_mag {
                global_max_mag = avg_mag;
            }
        }
    }
    if global_max_mag < 1e-12 {
        global_max_mag = 1.0;
    }

    let mut img_linear = ImageBuffer::new(nx as u32, ny as u32);
    let mut img_log = ImageBuffer::new(nx as u32, ny as u32);

    for j in 0..ny {
        for i in 0..nx {
            let idx = j * nx + i;
            let cell = &accum[idx];
            if cell.count == 0 {
                // black
                img_linear.put_pixel(i as u32, j as u32, Rgb([0, 0, 0]));
                img_log.put_pixel(i as u32, j as u32, Rgb([0, 0, 0]));
                continue;
            }
            let avg_fx = cell.sum_fx / (cell.count as f64);
            let avg_fy = cell.sum_fy / (cell.count as f64);
            let angle_deg = avg_fy.atan2(avg_fx).to_degrees();
            let hue = (angle_deg + 360.0) % 360.0;

            let avg_mag = cell.sum_mag / (cell.count as f64);
            let lin_brightness = (avg_mag / global_max_mag).min(1.0);
            let log_brightness = ((1.0 + avg_mag).ln() / (1.0 + global_max_mag).ln()).min(1.0);

            let (r_lin, g_lin, b_lin) = hsl_to_rgb(hue, 1.0, lin_brightness);
            let (r_log, g_log, b_log) = hsl_to_rgb(hue, 1.0, log_brightness);

            img_linear.put_pixel(i as u32, j as u32, Rgb([r_lin, g_lin, b_lin]));
            img_log.put_pixel(i as u32, j as u32, Rgb([r_log, g_log, b_log]));
        }
    }

    let out_lin = format!("pics/{}_exposure_linear.png", base_name);
    let out_log = format!("pics/{}_exposure_log.png", base_name);

    if let Err(e) = img_linear.save(&out_lin) {
        eprintln!("Error saving linear exposure image: {}", e);
    } else {
        println!("Long-exposure (linear) image saved as {}", out_lin);
    }

    if let Err(e) = img_log.save(&out_log) {
        eprintln!("Error saving log exposure image: {}", e);
    } else {
        println!("Long-exposure (log) image saved as {}", out_log);
    }
}

// main
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

    // decide hide
    let hide_bodies = if args.force_visible {
        vec![false, false, false]
    } else {
        let val = rng.random_unit();
        if val < 1.0 / 3.0 {
            vec![false, false, false]
        } else if val < 2.0 / 3.0 {
            vec![false, false, true]
        } else {
            vec![false, true, true]
        }
    };

    // 1) pick best
    let (mut positions, best_result, best_masses, _valid_sims) = select_best_trajectory(
        &mut rng,
        args.num_sims,
        args.num_steps,
        args.num_steps,
        args.max_points,
        args.chaos_weight,
        args.area_weight,
        args.dist_weight,
        args.lyap_weight,
    );

    // print
    println!("\nScore breakdown for best trajectory:");
    println!(
        "  - Chaos measure (lower better) = {:.4e}, Borda pts = {}",
        best_result.chaos, best_result.chaos_pts
    );
    println!(
        "  - Avg triangle area (higher better) = {:.6}, Borda pts = {}",
        best_result.avg_area, best_result.area_pts
    );
    println!(
        "  - Total distance (higher better) = {:.6}, Borda pts = {}",
        best_result.total_dist, best_result.dist_pts
    );
    println!(
        "  - Lyapunov exponent (higher => more chaotic) = {:.6}, Borda pts = {}",
        best_result.lyap_exp, best_result.lyap_pts
    );
    println!("  ----------------------------------------------------");
    println!("  => Unweighted Borda total = {}", best_result.total_score);
    println!("  => Weighted total = {:.3}", best_result.total_score_weighted);

    println!("\n================ BEST TRAJECTORY INFO ================");
    println!(" - Borda Score: {}", best_result.total_score);
    println!(
        " - Weighted Score: {:.3} (chaos_w={:.2}, area_w={:.2}, dist_w={:.2}, lyap_w={:.2})",
        best_result.total_score_weighted,
        args.chaos_weight,
        args.area_weight,
        args.dist_weight,
        args.lyap_weight
    );
    println!(" - Masses: [{:.2}, {:.2}, {:.2}]", best_masses[0], best_masses[1], best_masses[2]);
    println!(" - Chaos measure = {:.4e} (lower better)", best_result.chaos);
    println!(" - Avg triangle area = {:.6} (higher better)", best_result.avg_area);
    println!(" - Total distance = {:.6} (higher better)", best_result.total_dist);
    println!(" - Lyapunov exponent = {:.6}", best_result.lyap_exp);
    println!("======================================================");

    let base_name = args.file_name.as_str();
    let video_filename = format!("vids/{}.mp4", base_name);

    // store unscaled for the long-exposure
    let positions_unscaled = positions.clone();

    // 2) normalize for trajectory
    normalize_positions_inplace(&mut positions);

    // 3) color sequences
    let colors =
        generate_body_color_sequences(&mut rng, args.num_steps, args.special_color.as_deref());

    // tail
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

    // 4) single-frame trajectory
    if !args.no_image {
        let frame_size = 800;
        let pic_frames = plot_positions(
            &positions,
            frame_size,
            image_trajectory_lengths,
            &hide_bodies,
            &colors,
            999_999_999, // effectively just one frame
            args.avoid_effects,
            true,
            args.dynamic_bounds,
        );
        let last_frame = pic_frames.last().unwrap().clone();
        let traj_path = format!("pics/{}.png", base_name);
        if let Err(e) = last_frame.save(&traj_path) {
            eprintln!("Error saving trajectory image: {:?}", e);
        } else {
            println!("Trajectory image saved as {}", traj_path);
        }
    } else {
        println!("No trajectory image requested.");
    }

    // 5) optionally create video
    if !args.no_video {
        let num_seconds = 30;
        let target_length = 60 * num_seconds;
        let frame_interval =
            if target_length > 0 { args.num_steps.saturating_div(target_length) } else { 1 };
        let frame_size = 800;
        let frames = plot_positions(
            &positions,
            frame_size,
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

    // 6) LIC flow from final snapshot
    {
        let nstep = positions[0].len() - 1;
        let final_bodies = [
            Body::new(best_masses[0], positions[0][nstep], Vector3::zeros()),
            Body::new(best_masses[1], positions[1][nstep], Vector3::zeros()),
            Body::new(best_masses[2], positions[2][nstep], Vector3::zeros()),
        ];
        let nx = 800;
        let ny = 800;
        let min_x = 0.0;
        let max_x = 1.0;
        let min_y = 0.0;
        let max_y = 1.0;

        println!("Computing gravitational field for LIC on {}x{} grid...", nx, ny);
        let field = compute_gravity_field(&final_bodies, nx, ny, min_x, max_x, min_y, max_y);

        let mut noise = vec![0.0; nx * ny];
        for v in noise.iter_mut() {
            *v = rng.random_unit();
        }

        println!("Performing line integral convolution ({}x{})...", nx, ny);
        let lic_gray = perform_lic(&field, &noise, nx, ny);
        let lic_img = colorize_lic(&lic_gray, &field, nx, ny);

        let lic_path = format!("pics/{}_lic.png", base_name);
        if let Err(e) = lic_img.save(&lic_path) {
            eprintln!("Error saving LIC image: {:?}", e);
        } else {
            println!("Flow-field LIC image saved as {}", lic_path);
        }
    }

    // 7) Long-exposure images
    {
        let nx = 800;
        let ny = 800;
        println!("\nGenerating long-exposure field images with sub-sampling...");
        let (exposure_accum, _min_x, _max_x, _min_y, _max_y) =
            accumulate_time_exposure(&positions_unscaled, &best_masses, nx, ny);

        generate_exposure_images(
            &exposure_accum,
            nx,
            ny,
            _min_x,
            _max_x,
            _min_y,
            _max_y,
            base_name,
        );
    }

    println!("\nDone with simulation + image generation.");
}
