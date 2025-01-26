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
use line_drawing::Bresenham;
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
const B: usize = 32; // used by KdTree
type IDX = u32;

const G: f64 = 9.8;

/// Command-line arguments
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate & visualize the three-body problem, with parallel Borda-scoring, lines-only video, auto-level single images, adjustable percentile/gamma, and frame_size."
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
    perimeter_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    dist_weight: f64,
    #[arg(long, default_value_t = 1.0)]
    lyap_weight: f64,

    // Auto-levels for single images
    #[arg(long, default_value_t = 0.01)]
    auto_levels_black_percent: f64,
    #[arg(long, default_value_t = 0.99)]
    auto_levels_white_percent: f64,
    #[arg(long, default_value_t = 0.9)]
    auto_levels_gamma: f64,

    // Frame (image) size for single images & videos
    #[arg(long, default_value_t = 800)]
    frame_size: u32,
}

// Our RNG
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

/// A single body
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

// Simple velocity-Verlet integrator
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

// record final positions
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;

    // Phase 1: warm-up
    for _ in 0..num_steps {
        verlet_step(&mut bodies, dt);
    }

    // Phase 2: record
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

// We'll use Hsl and Srgb from the palette crate
fn generate_color_gradient(rng: &mut Sha3RandomByteStream, length: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(length);
    let mut hue = rng.gen_range(0.0, 360.0);
    for _ in 0..length {
        // We do a tiny random walk in hue
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

/// The function to generate per-body color sequences
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

fn x(v: &Vector3<f64>) -> f64 {
    v[0]
}
fn y(v: &Vector3<f64>) -> f64 {
    v[1]
}

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

/// This function **draws** a line between (x0, y0) and (x1, y1) into accum_r/g/b.
/// It uses Bresenham to walk all integer coordinates on that line, and linearly
/// interpolates between `col0` and `col1`, adding small_weight * color to each pixel.
fn draw_line_segment_additive_gradient(
    accum_r: &mut [f64],
    accum_g: &mut [f64],
    accum_b: &mut [f64],
    width: u32,
    height: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    col0: Rgb<u8>,
    col1: Rgb<u8>,
    small_weight: f64,
) {
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

        // Fraction of the way along this line
        let t = if n == 1 { 0.0 } else { i as f64 / (n.saturating_sub(1)) as f64 };

        let r = (col0[0] as f64) * (1.0 - t) + (col1[0] as f64) * t;
        let g = (col0[1] as f64) * (1.0 - t) + (col1[1] as f64) * t;
        let b = (col0[2] as f64) * (1.0 - t) + (col1[2] as f64) * t;

        accum_r[idx] += r * small_weight;
        accum_g[idx] += g * small_weight;
        accum_b[idx] += b * small_weight;
    }
}

// Plot normal trajectory frames (parallel)
fn plot_positions_parallel(
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

    // bounding box if not dynamic
    let (static_min_x, static_min_y, static_max_x, static_max_y) = if !dynamic_bounds {
        compute_bounding_box_for_all_steps(positions, hide)
    } else {
        (0.0, 0.0, 1.0, 1.0)
    };

    let frame_indices: Vec<usize> = (0..total_frames).collect();
    let frames: Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> = frame_indices
        .par_iter()
        .map(|&frame_index| {
            let current_end_step = if one_frame {
                total_steps.saturating_sub(1)
            } else {
                (frame_index + 1) * frame_interval
            };

            // figure out tail
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
                compute_bounding_box_for_frame(
                    positions,
                    hide,
                    &trajectory_starts,
                    current_end_step,
                )
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

            // draw circles
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

            // optional blur + highlight
            if !avoid_effects {
                let blurred = filter::gaussian_blur_f32(&img, 6.0);
                let mut img2 = blurred.clone();
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

            img
        })
        .collect();

    frames
}

// create video from frames
fn create_video_from_frames_in_memory(
    frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>],
    output_file: &str,
    frame_rate: u32,
) {
    println!("Generating video... {}", output_file);

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
        .arg("-threads")
        .arg("0")
        .arg("-c:v")
        .arg("libx264")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg(output_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut ffmpeg = command.spawn().expect("Failed to start ffmpeg");
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
    println!("Video creation complete: {}", output_file);
}

// ================== Stats
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

// Chaos measure
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
        let perimeter = d12 + d23 + d31;
        sum_perim += perimeter;
    }
    sum_perim / (len as f64)
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

// TrajectoryResult + Borda
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

    let results_par: Vec<Option<(TrajectoryResult, usize, [f64; 3])>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(index, bodies)| {
            let total_energy = calculate_total_energy(bodies);
            let ang_mom = calculate_total_angular_momentum(bodies).norm();

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

    // separate out each metric for Borda
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
            let score = n - rank;
            points_for_index[idx] = score;
        }
        points_for_index
    }

    // chaos: lower better
    let chaos_points = assign_borda_scores(chaos_vals, false);
    // perimeter: higher better
    let perimeter_points = assign_borda_scores(perimeter_vals, true);
    // dist: higher better
    let dist_points = assign_borda_scores(dist_vals, true);
    // lyap: higher better
    let lyap_points = assign_borda_scores(lyap_vals, true);

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

/// Single lines-only additive image for all steps (parallel chunk).
fn generate_connection_lines_single_image_cool(
    positions: &[Vec<Vector3<f64>>],
    body_colors: &[Vec<Rgb<u8>>],
    out_size: u32,
) -> RgbaImage {
    println!("\nGenerating *colorful* additive lines-only single image (parallel chunked).");

    let width = out_size;
    let height = out_size;
    let npix = (width * height) as usize;
    let total_steps = positions[0].len();
    if total_steps == 0 {
        return RgbaImage::new(width, height);
    }

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
        // avoid degenerate bounding box
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
        // give a small margin
        min_x -= 0.05 * wx;
        max_x += 0.05 * wx;
        min_y -= 0.05 * wy;
        max_y += 0.05 * wy;
    }

    let small_weight = 0.3_f64;
    let n_threads = rayon::current_num_threads();
    let chunk_size = (total_steps / n_threads).max(1);

    // We'll accumulate partial results in parallel and then combine
    let partials: Vec<(Vec<f64>, Vec<f64>, Vec<f64>)> = (0..n_threads)
        .into_par_iter()
        .map(|chunk_idx| {
            let start = chunk_idx * chunk_size;
            let end = (start + chunk_size).min(total_steps);

            let mut local_r: Vec<f64> = vec![0.0; npix];
            let mut local_g: Vec<f64> = vec![0.0; npix];
            let mut local_b: Vec<f64> = vec![0.0; npix];

            // helper to map from (x,y) to pixel coords
            fn to_pixel_coords(
                x: f64,
                y: f64,
                min_x: f64,
                min_y: f64,
                max_x: f64,
                max_y: f64,
                width: u32,
                height: u32,
            ) -> (f32, f32) {
                let ww = max_x - min_x;
                let hh = max_y - min_y;
                let px = ((x - min_x) / ww) * (width as f64);
                let py = ((y - min_y) / hh) * (height as f64);
                (px as f32, py as f32)
            }

            for step in start..end {
                let p0 = positions[0][step];
                let p1 = positions[1][step];
                let p2 = positions[2][step];

                let c0 = body_colors[0][step.min(body_colors[0].len() - 1)];
                let c1 = body_colors[1][step.min(body_colors[1].len() - 1)];
                let c2 = body_colors[2][step.min(body_colors[2].len() - 1)];

                let (x0, y0) =
                    to_pixel_coords(p0[0], p0[1], min_x, min_y, max_x, max_y, width, height);
                let (x1, y1) =
                    to_pixel_coords(p1[0], p1[1], min_x, min_y, max_x, max_y, width, height);
                let (x2, y2) =
                    to_pixel_coords(p2[0], p2[1], min_x, min_y, max_x, max_y, width, height);

                // lines p0->p1, p1->p2, p2->p0
                draw_line_segment_additive_gradient(
                    &mut local_r,
                    &mut local_g,
                    &mut local_b,
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
                draw_line_segment_additive_gradient(
                    &mut local_r,
                    &mut local_g,
                    &mut local_b,
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
                draw_line_segment_additive_gradient(
                    &mut local_r,
                    &mut local_g,
                    &mut local_b,
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

            (local_r, local_g, local_b)
        })
        .collect();

    // reduce partials
    let mut accum_r: Vec<f64> = vec![0.0; npix];
    let mut accum_g: Vec<f64> = vec![0.0; npix];
    let mut accum_b: Vec<f64> = vec![0.0; npix];

    for (rbuf, gbuf, bbuf) in partials {
        for i in 0..npix {
            accum_r[i] += rbuf[i];
            accum_g[i] += gbuf[i];
            accum_b[i] += bbuf[i];
        }
    }

    // find max
    let mut maxval: f64 = 0.0;
    for i in 0..npix {
        let m = accum_r[i].max(accum_g[i]).max(accum_b[i]);
        if m > maxval {
            maxval = m;
        }
    }
    if maxval < 1e-14 {
        maxval = 1.0;
    }

    let mut img = RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let idx = (y as usize) * (width as usize) + (x as usize);
            let rr = (accum_r[idx] / maxval).clamp(0.0, 1.0) * 255.0;
            let gg = (accum_g[idx] / maxval).clamp(0.0, 1.0) * 255.0;
            let bb = (accum_b[idx] / maxval).clamp(0.0, 1.0) * 255.0;
            img.put_pixel(x, y, Rgba([rr as u8, gg as u8, bb as u8, 255]));
        }
    }

    img
}

/// Lines-only frames for a video, parallel
fn generate_connection_lines_frames_parallel(
    positions: &[Vec<Vector3<f64>>],
    body_colors: &[Vec<Rgb<u8>>],
    out_size: u32,
    frame_interval: usize,
) -> Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    let total_steps = positions[0].len();
    if total_steps == 0 {
        return vec![];
    }

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
    let total_frames = if frame_interval == 0 { 1 } else { total_steps / frame_interval };
    let npix = (width * height) as usize;

    // We'll do a "global max" approach for the line additions.
    // First accumulate *all* steps, figure out the max, then for each frame we
    // only sum up to clamp_end steps and scale by that same global max, so
    // the brightness doesn't flicker from frame to frame.
    let small_weight = 0.3_f64;
    let mut global_accum_r: Vec<f64> = vec![0.0; npix];
    let mut global_accum_g: Vec<f64> = vec![0.0; npix];
    let mut global_accum_b: Vec<f64> = vec![0.0; npix];

    fn to_pixel_coords(
        x: f64,
        y: f64,
        min_x: f64,
        min_y: f64,
        max_x: f64,
        max_y: f64,
        width: u32,
        height: u32,
    ) -> (f32, f32) {
        let ww = max_x - min_x;
        let hh = max_y - min_y;
        let px = ((x - min_x) / ww) * (width as f64);
        let py = ((y - min_y) / hh) * (height as f64);
        (px as f32, py as f32)
    }

    // accumulate all steps once
    for step in 0..total_steps {
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];

        let c0 = body_colors[0][step.min(body_colors[0].len() - 1)];
        let c1 = body_colors[1][step.min(body_colors[1].len() - 1)];
        let c2 = body_colors[2][step.min(body_colors[2].len() - 1)];

        let (x0, y0) = to_pixel_coords(p0[0], p0[1], min_x, min_y, max_x, max_y, width, height);
        let (x1, y1) = to_pixel_coords(p1[0], p1[1], min_x, min_y, max_x, max_y, width, height);
        let (x2, y2) = to_pixel_coords(p2[0], p2[1], min_x, min_y, max_x, max_y, width, height);

        // lines
        draw_line_segment_additive_gradient(
            &mut global_accum_r,
            &mut global_accum_g,
            &mut global_accum_b,
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
        draw_line_segment_additive_gradient(
            &mut global_accum_r,
            &mut global_accum_g,
            &mut global_accum_b,
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
        draw_line_segment_additive_gradient(
            &mut global_accum_r,
            &mut global_accum_g,
            &mut global_accum_b,
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

    // find the final global max
    let mut final_global_max = 0.0_f64;
    for i in 0..npix {
        let m = global_accum_r[i].max(global_accum_g[i]).max(global_accum_b[i]);
        if m > final_global_max {
            final_global_max = m;
        }
    }
    if final_global_max < 1e-14 {
        final_global_max = 1.0;
    }

    // Now build frames in parallel
    let frame_indices: Vec<usize> = (0..total_frames).collect();
    let frames: Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> = frame_indices
        .par_iter()
        .map(|&frame_idx| {
            let clamp_end = ((frame_idx + 1) * frame_interval).min(total_steps);

            // accumulate up to clamp_end
            let mut accum_r: Vec<f64> = vec![0.0; npix];
            let mut accum_g: Vec<f64> = vec![0.0; npix];
            let mut accum_b: Vec<f64> = vec![0.0; npix];

            for step in 0..clamp_end {
                let p0 = positions[0][step];
                let p1 = positions[1][step];
                let p2 = positions[2][step];

                let c0 = body_colors[0][step.min(body_colors[0].len() - 1)];
                let c1 = body_colors[1][step.min(body_colors[1].len() - 1)];
                let c2 = body_colors[2][step.min(body_colors[2].len() - 1)];

                let (x0, y0) =
                    to_pixel_coords(p0[0], p0[1], min_x, min_y, max_x, max_y, width, height);
                let (x1, y1) =
                    to_pixel_coords(p1[0], p1[1], min_x, min_y, max_x, max_y, width, height);
                let (x2, y2) =
                    to_pixel_coords(p2[0], p2[1], min_x, min_y, max_x, max_y, width, height);

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

            // convert to image
            let mut img = ImageBuffer::new(width, height);
            for y in 0..height {
                for x in 0..width {
                    let idx = (y as usize) * (width as usize) + (x as usize);
                    let rr = (accum_r[idx] / final_global_max).clamp(0.0, 1.0) * 255.0;
                    let gg = (accum_g[idx] / final_global_max).clamp(0.0, 1.0) * 255.0;
                    let bb = (accum_b[idx] / final_global_max).clamp(0.0, 1.0) * 255.0;
                    img.put_pixel(x, y, Rgb([rr as u8, gg as u8, bb as u8]));
                }
            }
            img
        })
        .collect();

    frames
}

// Single-image auto-level
fn auto_levels_image(
    input: &DynamicImage,
    black_percent: f64,
    white_percent: f64,
    gamma: f64,
) -> ImageBuffer<Rgb<u8>, Vec<u8>> {
    let rgb_img = input.to_rgb8();
    let (w, h) = rgb_img.dimensions();

    let mut hist_r = vec![0u32; 256];
    let mut hist_g = vec![0u32; 256];
    let mut hist_b = vec![0u32; 256];
    for px in rgb_img.pixels() {
        hist_r[px[0] as usize] += 1;
        hist_g[px[1] as usize] += 1;
        hist_b[px[2] as usize] += 1;
    }
    let total_px = w * h;

    fn find_cutoff(hist: &[u32], percentile: f64, total_px: u32) -> u8 {
        let target = (percentile * total_px as f64).round() as u32;
        let mut cumsum = 0;
        for (i, &count) in hist.iter().enumerate() {
            cumsum += count;
            if cumsum >= target {
                return i as u8;
            }
        }
        255
    }

    let black_r = find_cutoff(&hist_r, black_percent, total_px);
    let black_g = find_cutoff(&hist_g, black_percent, total_px);
    let black_b = find_cutoff(&hist_b, black_percent, total_px);

    let white_r = find_cutoff(&hist_r, white_percent, total_px);
    let white_g = find_cutoff(&hist_g, white_percent, total_px);
    let white_b = find_cutoff(&hist_b, white_percent, total_px);

    let mut out_img = ImageBuffer::new(w, h);

    let map_channel = |c: u8, black: u8, white: u8| -> u8 {
        if black >= white {
            return c;
        }
        let c_val = c as f64;
        let black_val = black as f64;
        let white_val = white as f64;
        let mut norm = (c_val - black_val) / (white_val - black_val);
        if norm < 0.0 {
            norm = 0.0;
        } else if norm > 1.0 {
            norm = 1.0;
        }
        norm = norm.powf(gamma);
        (norm * 255.0).clamp(0.0, 255.0) as u8
    };

    for (x, y, pixel) in out_img.enumerate_pixels_mut() {
        let orig = rgb_img.get_pixel(x, y);
        let r = map_channel(orig[0], black_r, white_r);
        let g = map_channel(orig[1], black_g, white_g);
        let b = map_channel(orig[2], black_b, white_b);
        *pixel = Rgb([r, g, b]);
    }

    out_img
}

fn main() {
    let args = Args::parse();
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed = hex::decode(hex_seed).expect("Invalid hex seed");

    println!("Starting 3-body simulations with up to {} steps each (parallel).", args.num_steps);

    let mut rng = Sha3RandomByteStream::new(
        &seed,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    // Decide hide
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

    // 1) pick best orbit
    let (mut positions, best_result, best_masses, valid_sims) = select_best_trajectory(
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

    println!("\nScore breakdown for best trajectory (out of {} valid orbits):", valid_sims);
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
    let lines_video_filename = format!("vids/{}_lines_only.mp4", base_name);

    // For lines-only, keep unscaled
    let positions_unscaled = positions.clone();

    // 2) normalize for normal trajectory
    normalize_positions_inplace(&mut positions);

    // 3) color sequences
    let colors =
        generate_body_color_sequences(&mut rng, args.num_steps, args.special_color.as_deref());

    // 4) figure out tail lengths
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

    let frame_size = args.frame_size;

    // 5) Single-frame normal image
    if !args.no_image {
        let pic_frames = plot_positions_parallel(
            &positions,
            frame_size,
            image_trajectory_lengths,
            &hide_bodies,
            &colors,
            999_999_999,
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

        // auto-level single normal image
        let dyn_img = DynamicImage::ImageRgb8(last_frame);
        let auto_leveled = auto_levels_image(
            &dyn_img,
            args.auto_levels_black_percent,
            args.auto_levels_white_percent,
            args.auto_levels_gamma,
        );
        let traj_path_al = format!("pics/{}_AL.png", base_name);
        if let Err(e) = auto_leveled.save(&traj_path_al) {
            eprintln!("Error saving trajectory AL image: {:?}", e);
        } else {
            println!("Trajectory auto-level image saved as {}", traj_path_al);
        }
    } else {
        println!("No single-frame trajectory image requested.");
    }

    // 6) normal trajectory video
    if !args.no_video {
        let num_seconds = 30;
        let target_length = 60 * num_seconds;
        let frame_interval =
            if target_length > 0 { args.num_steps.saturating_div(target_length) } else { 1 }.max(1);

        let frames = plot_positions_parallel(
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
        println!("No main trajectory video requested.");
    }

    // 7) Single-frame lines-only image (unscaled)
    let lines_only_img =
        generate_connection_lines_single_image_cool(&positions_unscaled, &colors, frame_size);
    let lines_path = format!("pics/{}_lines_only.png", base_name);
    if let Err(e) = lines_only_img.save(&lines_path) {
        eprintln!("Error saving lines-only image: {:?}", e);
    } else {
        println!("Lines-only image saved as {}", lines_path);
    }

    // auto-level lines-only single image
    {
        let dyn_img = DynamicImage::ImageRgba8(lines_only_img);
        let auto_leveled_lines = auto_levels_image(
            &dyn_img,
            args.auto_levels_black_percent,
            args.auto_levels_white_percent,
            args.auto_levels_gamma,
        );
        let lines_path_al = format!("pics/{}_lines_only_AL.png", base_name);
        if let Err(e) = auto_leveled_lines.save(&lines_path_al) {
            eprintln!("Error saving lines-only AL image: {:?}", e);
        } else {
            println!("Lines-only auto-level image saved as {}", lines_path_al);
        }
    }

    // 8) lines-only video
    if !args.no_video {
        let num_seconds = 30;
        let target_length = 60 * num_seconds;
        let frame_interval =
            if target_length > 0 { args.num_steps.saturating_div(target_length) } else { 1 }.max(1);

        let lines_frames = generate_connection_lines_frames_parallel(
            &positions_unscaled,
            &colors,
            frame_size,
            frame_interval,
        );
        create_video_from_frames_in_memory(&lines_frames, &lines_video_filename, 60);
    } else {
        println!("No lines-only video requested.");
    }

    println!("\nDone: normal + lines-only videos + single images (with auto-level).");
}
