use na::Vector3;
use nalgebra as na;

use clap::Parser;
use rayon::prelude::*;
use sha3::{Digest, Sha3_256};
use std::f64::{INFINITY, NEG_INFINITY};

use hex;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb, Rgba, RgbaImage};
use imageproc::drawing::draw_filled_circle_mut;
use imageproc::filter;
use line_drawing::Bresenham; // We'll use this for additive lines
use palette::{FromColor, Hsl, Srgb};
use std::io::{Cursor, Write};
use std::process::{Command, Stdio};

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use statrs::statistics::Statistics;

// KdTree for the Lyapunov exponent
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
    about = "Simulate & visualize the three-body problem (trajectories + retarded-time wave), plus a colorful lines-only additive rendering."
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
    perimeter_weight: f64, // <-- renamed from area_weight
    #[arg(long, default_value_t = 1.0)]
    dist_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    lyap_weight: f64,

    // "Wave" image params
    #[arg(long, default_value_t = 0.005)]
    wave_freq: f64, // base wave frequency
    #[arg(long, default_value_t = 1.0)]
    wave_speed: f64, // wave speed in "units" per time
    #[arg(long, default_value_t = 800)]
    wave_image_size: u32, // final image dimension
    #[arg(long, default_value_t = 2000)]
    wave_subsamples: usize, // how many time steps to consider in the wave image

    // Additional fade factors for retarded-time wave image
    #[arg(long, default_value_t = 1.0)]
    time_decay: f64, // exponential fade with how old the wave is
    #[arg(long, default_value_t = 1.0)]
    dist_decay: f64, // distance fade factor
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

    // Phase 1: get final state (advance without storing)
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
                if idx == 0 {
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

/// We'll replace "average_triangle_area" with "average_triangle_perimeter".
/// The function computes the *average* of the perimeter across all time steps.
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
        let perimeter = d12 + d23 + d31;
        sum_perim += perimeter;
    }

    sum_perim / (len as f64)
}

/// For distance analysis we still do the same approach
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

// ================== Actual LLE code using KdTree ==================
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
    avg_perimeter: f64, // <-- replaced avg_area
    total_dist: f64,
    lyap_exp: f64,
    chaos_pts: usize,
    perimeter_pts: usize, // replaced area_pts
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
    perimeter_weight: f64,
    dist_weight: f64,
    lyap_weight: f64,
) -> (Vec<Vec<Vector3<f64>>>, TrajectoryResult, [f64; 3], usize) {
    println!("Running {} simulations to find the best orbit...", num_iters);

    // Generate random bodies for each simulation
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

    // Evaluate them in parallel
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
                let p = average_triangle_perimeter(&positions_full);
                let d = total_distance(&positions_full);

                // Lyapunov exponent
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

    let valid_results: Vec<_> = results_par.into_iter().filter_map(|x| x).collect();
    let valid_count = valid_results.len();
    println!(
        "Number of valid simulations considered: {}/{} (others unbound or too small angular momentum).",
        valid_count, num_iters
    );
    if valid_results.is_empty() {
        panic!("No valid simulations found. Possibly all orbits unbound or zero angular momentum.");
    }

    let mut info_vec = valid_results;

    // We'll separate out each metric so we can do Borda scoring
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
        // Sort by metric
        if higher_better {
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = vals.len();
        let mut points_for_index = vec![0; n];
        for (rank, (_, idx)) in vals.into_iter().enumerate() {
            // Borda: best rank gets n points, next gets n-1, ...
            let score = n - rank;
            points_for_index[idx] = score;
        }
        points_for_index
    }

    // chaos: lower is better => higher_better = false
    let chaos_points = assign_borda_scores(chaos_vals, false);
    // perimeter: higher better
    let perimeter_points = assign_borda_scores(perimeter_vals, true);
    // dist: higher better
    let dist_points = assign_borda_scores(dist_vals, true);
    // lyap: higher better
    let lyap_points = assign_borda_scores(lyap_vals, true);

    // Tally up
    for (i, (tr, _, _)) in info_vec.iter_mut().enumerate() {
        tr.chaos_pts = chaos_points[i];
        tr.perimeter_pts = perimeter_points[i];
        tr.dist_pts = dist_points[i];
        tr.lyap_pts = lyap_points[i];
        tr.total_score = chaos_points[i] + perimeter_points[i] + dist_points[i] + lyap_points[i];
        tr.total_score_weighted = chaos_points[i] as f64 * chaos_weight
            + perimeter_points[i] as f64 * perimeter_weight
            + dist_points[i] as f64 * dist_weight
            + lyap_points[i] as f64 * lyap_weight;
    }

    // Pick best
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

// ------------------- Retarded-Time Wave Summation (Single Image) ------------------

/// Convert HSL to RGB in [0..1].
fn hsl_to_rgb(h_deg: f64, s: f64, l: f64) -> (f64, f64, f64) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hh = (h_deg / 60.0) % 6.0;
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
    (r1 + m, g1 + m, b1 + m)
}

/// Generate a single "retarded-time wave" image using **all** steps.
fn generate_retarded_wave_image(
    positions: &[Vec<Vector3<f64>>],
    wave_freq: f64,
    wave_speed: f64,
    wave_subsamples: usize,
    out_size: u32,
    time_decay: f64,
    dist_decay: f64,
    base_name: &str,
) {
    println!("\nGenerating retarded-time wave image from all steps...");

    // 1) bounding box around all times
    let mut min_x = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut min_y = INFINITY;
    let mut max_y = NEG_INFINITY;

    for body_pos in positions {
        for &p in body_pos {
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
    if max_x - min_x < 1e-12 || max_y - min_y < 1e-12 {
        // degenerate fallback
        min_x -= 1.0;
        max_x += 1.0;
        min_y -= 1.0;
        max_y += 1.0;
    } else {
        // pad by 10%
        let w = max_x - min_x;
        let h = max_y - min_y;
        min_x -= 0.1 * w;
        max_x += 0.1 * w;
        min_y -= 0.1 * h;
        max_y += 0.1 * h;
    }

    let nx = out_size as usize;
    let ny = out_size as usize;

    let total_steps = positions[0].len();
    if total_steps < 2 {
        println!("Not enough steps for wave image. Skipping.");
        return;
    }
    // We'll define dt=0.001 (the simulation step)
    let dt = 0.001;
    let final_step = total_steps - 1;
    let final_time = final_step as f64 * dt;

    // We'll sub-sample the timeline
    let stride = (total_steps / wave_subsamples.max(1)).max(1);
    println!(
        " Wave bounding box: x=[{:.2},{:.2}], y=[{:.2},{:.2}], out_size={}, wave_subsamples={}, stride={}",
        min_x, max_x, min_y, max_y, out_size, wave_subsamples, stride
    );

    #[derive(Clone, Copy)]
    struct ComplexSum {
        re: f64,
        im: f64,
    }
    let mut accum = vec![ComplexSum { re: 0.0, im: 0.0 }; nx * ny];

    accum.par_iter_mut().enumerate().for_each(|(pix_idx, cacc)| {
        let ix = pix_idx % nx;
        let iy = pix_idx / nx;
        // pixel coords
        let x = min_x + (ix as f64 + 0.5) / (nx as f64) * (max_x - min_x);
        let y = min_y + (iy as f64 + 0.5) / (ny as f64) * (max_y - min_y);

        let mut local_re = 0.0;
        let mut local_im = 0.0;

        let mut t_i = final_step as i64; // start from the end, go backwards
        while t_i >= 0 {
            let t_usize = t_i as usize;
            // positions of the 3 bodies
            let p1 = positions[0][t_usize];
            let p2 = positions[1][t_usize];
            let p3 = positions[2][t_usize];

            let tsec = t_i as f64 * dt;
            let age = final_time - tsec; // how long ago

            // For each body
            for &pb in &[p1, p2, p3] {
                let dx = x - pb[0];
                let dy = y - pb[1];
                let dist = (dx * dx + dy * dy).sqrt();
                if dist < 1e-12 {
                    continue;
                }
                // retarded-time phase
                let phase = wave_freq * (age - dist / wave_speed);

                // amplitude fade
                let time_factor = (-time_decay * age).exp().max(0.0);
                let dist_factor = 1.0 / (1.0 + dist_decay * dist);
                let amp = time_factor * dist_factor;

                local_re += amp * phase.cos();
                local_im += amp * phase.sin();
            }

            t_i -= stride as i64;
        }

        cacc.re = local_re;
        cacc.im = local_im;
    });

    // 3) Convert final sums to color
    let mut max_amp = 0.0;
    for c in &accum {
        let real_amp = (c.re * c.re + c.im * c.im).sqrt();
        if real_amp > max_amp {
            max_amp = real_amp;
        }
    }
    if max_amp < 1e-12 {
        max_amp = 1.0;
    }

    let mut img = ImageBuffer::new(nx as u32, ny as u32);
    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let idx = (y as usize) * nx + (x as usize);
        let re = accum[idx].re;
        let im = accum[idx].im;
        let amp = (re * re + im * im).sqrt();
        let phase = im.atan2(re).to_degrees(); // in [-180..180]

        // Map amplitude => saturate with a slight gamma tweak
        let amp_norm = amp / max_amp;
        let sat = amp_norm.powf(0.6);
        let hue = (phase + 360.0) % 360.0;
        let light = 0.5;

        let (r, g, b) = hsl_to_rgb(hue, sat, light);
        let rr = (r.clamp(0.0, 1.0) * 255.0) as u8;
        let gg = (g.clamp(0.0, 1.0) * 255.0) as u8;
        let bb = (b.clamp(0.0, 1.0) * 255.0) as u8;

        *pixel = Rgb([rr, gg, bb]);
    }

    let out_path = format!("pics/{}_retarded_wave.png", base_name);
    if let Err(e) = img.save(&out_path) {
        eprintln!("Error saving retarded wave image: {:?}", e);
    } else {
        println!("Retarded-time wave image saved as {}", out_path);
    }
}

// ---------------- NEW: COLORFUL, ADDITIVE LINES-ONLY IMAGE with GRADIENTS ----------------

// We'll use the body color arrays at each step: for line body_i -> body_j, we do
// a pixel-by-pixel gradient from the color of body_i to the color of body_j in that step.

/// Interpolate 2 colors in RGB space
fn interpolate_color(c0: Rgb<u8>, c1: Rgb<u8>, alpha: f64) -> (f64, f64, f64) {
    let r0 = c0[0] as f64;
    let g0 = c0[1] as f64;
    let b0 = c0[2] as f64;
    let r1 = c1[0] as f64;
    let g1 = c1[1] as f64;
    let b1 = c1[2] as f64;
    let r = (1.0 - alpha) * r0 + alpha * r1;
    let g = (1.0 - alpha) * g0 + alpha * g1;
    let b = (1.0 - alpha) * b0 + alpha * b1;
    (r, g, b)
}

/// Draw a line from (x0,y0) to (x1,y1) into our float accumulators using Bresenham,
/// but we do a color gradient from color0 -> color1 across the segment.
fn draw_line_segment_additive_gradient(
    accum_r: &mut [f64],
    accum_g: &mut [f64],
    accum_b: &mut [f64],
    width: u32,
    height: u32,
    x0f: f32,
    y0f: f32,
    x1f: f32,
    y1f: f32,
    color0: Rgb<u8>,
    color1: Rgb<u8>,
    weight: f64,
) {
    let x0 = x0f.round() as i32;
    let y0 = y0f.round() as i32;
    let x1 = x1f.round() as i32;
    let y1 = y1f.round() as i32;

    // We'll gather all points in a Vec first, so we know the total length (num_points).
    let line_points: Vec<(i32, i32)> = Bresenham::new((x0, y0), (x1, y1)).collect();
    let num_points = line_points.len();
    if num_points < 2 {
        return;
    }

    for (i, (x, y)) in line_points.iter().enumerate() {
        if *x < 0 || *y < 0 || *x >= width as i32 || *y >= height as i32 {
            continue;
        }
        let idx = (*y as usize) * (width as usize) + (*x as usize);
        let alpha = i as f64 / (num_points.saturating_sub(1) as f64);
        let (rr, gg, bb) = interpolate_color(color0, color1, alpha);
        accum_r[idx] += rr * weight;
        accum_g[idx] += gg * weight;
        accum_b[idx] += bb * weight;
    }
}

/// We adapt the "generate_connection_lines_image_cool" to use body-colors for each step,
/// then do a gradient line between them.
fn generate_connection_lines_image_cool(
    positions: &[Vec<Vector3<f64>>],
    body_colors: &[Vec<Rgb<u8>>],
    out_size: u32,
    base_name: &str,
) {
    println!("\nGenerating *colorful* additive lines-only image with per-body color gradients...");

    // 1) Determine bounding box from all steps (all 3 bodies).
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
    let eps = 1e-12;
    if (max_x - min_x).abs() < eps {
        min_x -= 0.5;
        max_x += 0.5;
    }
    if (max_y - min_y).abs() < eps {
        min_y -= 0.5;
        max_y += 0.5;
    }
    // Optionally pad by ~5%
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

    // We'll store floating accumulators for R, G, B in [0..∞) range
    let npix = (width * height) as usize;
    let mut accum_r = vec![0.0; npix];
    let mut accum_g = vec![0.0; npix];
    let mut accum_b = vec![0.0; npix];

    // A helper to transform (world x,y) -> pixel (f32,f32)
    fn to_pixel_coords(
        x: f64,
        y: f64,
        min_x: f64,
        min_y: f64,
        max_x: f64,
        max_y: f64,
        w: u32,
        h: u32,
    ) -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((x - min_x) / ww) * (w as f64);
        let py = ((y - min_y) / hh) * (h as f64);
        (px as f32, py as f32)
    }

    // 2) For each time step, draw lines body0->body1, body1->body2, body2->body0
    //    using color interpolation from the respective body-colors at that step.
    let total_steps = positions[0].len();
    if total_steps == 0 {
        println!("No steps to draw lines for. Skipping lines-only image.");
        return;
    }

    let small_weight = 0.3; // how much color to add per pixel per line
    for step in 0..total_steps {
        // Positions of the 3 bodies
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        // Colors of the 3 bodies at this time step
        let c0 = body_colors[0][step.min(body_colors[0].len() - 1)];
        let c1 = body_colors[1][step.min(body_colors[1].len() - 1)];
        let c2 = body_colors[2][step.min(body_colors[2].len() - 1)];

        // to_pixel_coords => (x0,y0, x1,y1, x2,y2)
        let (x0, y0) = to_pixel_coords(p0[0], p0[1], min_x, min_y, max_x, max_y, width, height);
        let (x1, y1) = to_pixel_coords(p1[0], p1[1], min_x, min_y, max_x, max_y, width, height);
        let (x2, y2) = to_pixel_coords(p2[0], p2[1], min_x, min_y, max_x, max_y, width, height);

        // line 0: p0->p1 with gradient from c0->c1
        draw_line_segment_additive_gradient(
            &mut accum_r,
            &mut accum_g,
            &mut accum_b,
            width,
            height,
            x0,
            y0,
            x1,
            y1,
            c0,
            c1,
            small_weight,
        );

        // line 1: p1->p2 with gradient from c1->c2
        draw_line_segment_additive_gradient(
            &mut accum_r,
            &mut accum_g,
            &mut accum_b,
            width,
            height,
            x1,
            y1,
            x2,
            y2,
            c1,
            c2,
            small_weight,
        );

        // line 2: p2->p0 with gradient from c2->c0
        draw_line_segment_additive_gradient(
            &mut accum_r,
            &mut accum_g,
            &mut accum_b,
            width,
            height,
            x2,
            y2,
            x0,
            y0,
            c2,
            c0,
            small_weight,
        );
    }

    // 3) Normalize accumulators to 0..255
    let mut maxval = 0.0;
    for i in 0..npix {
        let val_r = accum_r[i];
        let val_g = accum_g[i];
        let val_b = accum_b[i];
        let m = val_r.max(val_g).max(val_b);
        if m > maxval {
            maxval = m;
        }
    }
    if maxval < 1e-14 {
        maxval = 1.0;
    }

    // 4) Write to an RGBA image
    let mut img = RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let idx = (y as usize) * (width as usize) + (x as usize);
            // scale
            let rr = (accum_r[idx] / maxval).clamp(0.0, 1.0) * 255.0;
            let gg = (accum_g[idx] / maxval).clamp(0.0, 1.0) * 255.0;
            let bb = (accum_b[idx] / maxval).clamp(0.0, 1.0) * 255.0;
            img.put_pixel(x, y, Rgba([rr as u8, gg as u8, bb as u8, 255]));
        }
    }

    // 5) Save to disk
    let out_path = format!("pics/{}_lines_only.png", base_name);
    if let Err(e) = img.save(&out_path) {
        eprintln!("Error saving lines-only image: {:?}", e);
    } else {
        println!("Colorful additive lines-only image saved as {}", out_path);
    }
}

// ------------------ Main ------------------
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
        args.perimeter_weight,
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
        "  - Avg triangle perimeter (higher better) = {:.6}, Borda pts = {}",
        best_result.avg_perimeter, best_result.perimeter_pts
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
        " - Weighted Score: {:.3} (chaos_w={:.2}, perimeter_w={:.2}, dist_w={:.2}, lyap_w={:.2})",
        best_result.total_score_weighted,
        args.chaos_weight,
        args.perimeter_weight,
        args.dist_weight,
        args.lyap_weight
    );
    println!(" - Masses: [{:.2}, {:.2}, {:.2}]", best_masses[0], best_masses[1], best_masses[2]);
    println!(" - Chaos measure = {:.4e} (lower better)", best_result.chaos);
    println!(" - Avg triangle perimeter = {:.6} (higher better)", best_result.avg_perimeter);
    println!(" - Total distance = {:.6} (higher better)", best_result.total_dist);
    println!(" - Lyapunov exponent = {:.6}", best_result.lyap_exp);
    println!("======================================================");

    let base_name = args.file_name.as_str();
    let video_filename = format!("vids/{}.mp4", base_name);

    // store unscaled for wave + lines
    let positions_unscaled = positions.clone();

    // 2) normalize for normal trajectory image
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

    // 6) Retarded-time wave image
    generate_retarded_wave_image(
        &positions_unscaled,
        args.wave_freq,
        args.wave_speed,
        args.wave_subsamples,
        args.wave_image_size,
        args.time_decay,
        args.dist_decay,
        base_name,
    );

    // 7) Our new color‐gradient lines‐only image
    generate_connection_lines_image_cool(&positions_unscaled, &colors, 800, base_name);

    println!("\nDone with simulation + wave image + COOL lines-only image!");
}
