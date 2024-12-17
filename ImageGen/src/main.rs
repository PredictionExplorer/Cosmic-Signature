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
    about = "Simulate and visualize the three-body problem with kd-tree optimization."
)]
struct Args {
    #[arg(long, default_value = "00")]
    seed: String,
    #[arg(long, default_value = "output")]
    file_name: String,
    #[arg(long, default_value_t = 1_000_000)]
    num_steps: usize,
    #[arg(long, default_value_t = 10_000)]
    num_sims: usize,
    #[arg(long, default_value_t = 250.0)]
    location: f64,
    #[arg(long, default_value_t = 2.0)]
    velocity: f64,
    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,
    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,
    #[arg(long, default_value_t = false)]
    avoid_effects: bool,
    #[arg(long, default_value_t = false)]
    no_video: bool,
    #[arg(long, value_parser = ["gold","bronze","white","emerald","sapphire","quartz","amethyst","topaz","turquoise","aqua","fuchsia"])]
    special_color: Option<String>,
    /// Maximum number of points to consider when analyzing trajectories (default: 100k)
    #[arg(long, default_value_t = 100_000)]
    max_points: usize,
    /// If set, we recompute the bounding box for every single frame in the video.
    /// (Images are always dynamic-bounded.)
    #[arg(long, default_value_t = false)]
    dynamic_bounds: bool,
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

    pub fn random_location(&mut self) -> f64 {
        self.gen_range(-self.location_range, self.location_range)
    }

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

/// Simulate positions over time
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;
    println!("Simulating {} steps...", num_steps);
    let mut all_positions = vec![vec![Vector3::zeros(); num_steps]; bodies.len()];

    let progress_interval = (num_steps / 10).max(1); // print every 10%
    for step in 0..num_steps {
        if step % progress_interval == 0 && step > 0 {
            let percent = (step as f64 / num_steps as f64) * 100.0;
            println!("Simulation progress: {:.0}%", percent);
        }
        for (i, b) in bodies.iter().enumerate() {
            all_positions[i][step] = b.position;
        }
        verlet_step(&mut bodies, dt);
    }
    println!("Simulation done.");
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

/// A helper to globally normalize positions to [0..1], ignoring hidden or not.
/// This modifies positions in-place (like the old code).
fn normalize_positions_inplace(positions: &mut [Vec<Vector3<f64>>]) {
    let mut min_x = INFINITY;
    let mut min_y = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut max_y = NEG_INFINITY;

    // Find global min/max
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

    // compute the scale
    let x_center = (max_x + min_x) / 2.0;
    let y_center = (max_y + min_y) / 2.0;
    let mut range = (max_x - min_x).max(max_y - min_y);
    if range < 1e-14 {
        range = 1.0;
    }

    // shift+scale to [0..1]
    let half_range = range / 2.0;
    for body_pos in positions.iter_mut() {
        for pos in body_pos.iter_mut() {
            pos.x = (pos.x - (x_center - half_range)) / range;
            pos.y = (pos.y - (y_center - half_range)) / range;
            // z is never used for plotting, but we could do the same if we want z in [0..1].
        }
    }
}

/// Compute bounding box for the entire timeline (ignoring hidden bodies).
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

/// Compute bounding box for just the subset of steps (the trajectory portion) in each frame
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

/// Plot positions to frames
///
/// - Images are always "dynamic" bounding (zoom for just that final portion).
/// - Videos respect the `dynamic_bounds` parameter.
/// Since we've now globally normalized to [0..1], the bounding box is typically [0..1] for all steps.
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

    // If we produce a single frame (image), always dynamic bounding:
    let dynamic_bounds = if one_frame {
        true
    } else {
        // otherwise, use the command-line param
        dynamic_bounds_for_video
    };

    // total_frames for a video, or 1 if just an image
    let total_frames = if one_frame {
        1
    } else {
        // guard against zero
        if frame_interval == 0 {
            1
        } else {
            total_steps / frame_interval
        }
    };
    println!("Generating {} frame(s) (dynamic_bounds={})...", total_frames, dynamic_bounds);

    // If not dynamic, compute a single bounding box for the entire timeline
    let (static_min_x, static_min_y, static_max_x, static_max_y) = if !dynamic_bounds {
        compute_bounding_box_for_all_steps(positions, hide)
    } else {
        (0.0, 0.0, 1.0, 1.0) // dummy
    };

    let mut frames = Vec::new();
    let frame_progress_interval = (total_frames / 10).max(1);

    for frame_index in 0..total_frames {
        if frame_index % frame_progress_interval == 0 && frame_index > 0 {
            let percent = (frame_index as f64 / total_frames as f64) * 100.0;
            println!("Frame generation progress: {:.0}%", percent);
        }

        // Determine which steps we'll draw in this frame.
        let current_end_step = if one_frame {
            // single image => final snapshot
            total_steps.saturating_sub(1)
        } else {
            (frame_index + 1) * frame_interval
        };

        // For each body, figure out how far back we go (based on trajectory_lengths).
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

        // Compute bounding box for this frame (in normalized coords, likely 0..1)
        let (min_x, min_y, max_x, max_y) = if dynamic_bounds {
            compute_bounding_box_for_frame(positions, hide, &trajectory_starts, current_end_step)
        } else {
            (static_min_x, static_min_y, static_max_x, static_max_y)
        };

        // Expand slightly
        let x_center = (max_x + min_x) / 2.0;
        let y_center = (max_y + min_y) / 2.0;
        let mut range = (max_x - min_x).max(max_y - min_y) * 1.1;
        if range < 1e-14 {
            range = 1.0;
        }
        let adj_min_x = x_center - (range / 2.0);
        let adj_min_y = y_center - (range / 2.0);

        // Create a new image buffer for this frame
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
                // Now x,y are already in 0..1 if fully global normalized,
                // but we also do bounding box sub-range if dynamic_bounds is on.
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

    println!("Frame generation complete.");
    frames
}

/// Create video using ffmpeg
fn create_video_from_frames_in_memory(
    frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>],
    output_file: &str,
    frame_rate: u32,
) {
    println!("Starting video creation...");
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

    let video_progress_interval = (frames.len() / 10).max(1);
    for (i, frame) in frames.iter().enumerate() {
        if i % video_progress_interval == 0 {
            let percent = (i as f64 / frames.len() as f64) * 100.0;
            println!("Video encoding progress: {:.0}%", percent);
        }
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

    let phi_m = |kdtree: &KdTree<f64, u64, APEN_M, B, IDX>, subseqs: &[[f64; APEN_M]], r: f64| {
        let countable = subseqs.len() as f64;
        let mut sum_log = 0.0;
        for arr in subseqs {
            let result = kdtree.within::<SquaredEuclidean>(arr, r);
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

    let phi_m1 =
        |kdtree: &KdTree<f64, u64, APEN_M1, B, IDX>, subseqs: &[[f64; APEN_M1]], r: f64| {
            let countable = subseqs.len() as f64;
            let mut sum_log = 0.0;
            for arr in subseqs {
                let result = kdtree.within::<SquaredEuclidean>(arr, r);
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

/// Calculate average triangle area
fn average_triangle_area(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let mut new_positions = positions.to_vec();
    // We'll re-use the old "analysis" style normalization.
    // This is for measuring area dimensionlessly, doesn't affect the final rendering.
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

// For analysis only; not used for final rendering:
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

/// Calculate total distance traveled by all bodies
fn total_distance(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let mut total_dist = 0.0;
    for body_idx in 0..positions.len() {
        for step_idx in 1..positions[body_idx].len() {
            let p1 = positions[body_idx][step_idx];
            let p0 = positions[body_idx][step_idx - 1];
            let dist = (p1 - p0).norm();
            total_dist += dist;
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

fn analyze_trajectories(
    m1: f64,
    m2: f64,
    m3: f64,
    positions: &[Vec<Vector3<f64>>],
    max_points: usize,
) -> (f64, f64, f64, f64, f64) {
    // Downsample data to avoid huge kd-trees
    let len = positions[0].len();
    let factor = (len / max_points).max(1);

    // Downsampling for body1_norms
    let body1_norms: Vec<f64> = positions[0].iter().step_by(factor).map(|p| p.norm()).collect();

    let chaos = non_chaoticness(m1, m2, m3, positions);
    let avg_area = average_triangle_area(positions);
    let total_dist = total_distance(positions);

    let std_dev = body1_norms.iter().copied().std_dev();
    let r = 0.2 * std_dev;

    let ap_en = approximate_entropy_kdtree(&body1_norms, r);
    let lyap_exp = lyapunov_exponent_kdtree(&body1_norms, 1, 50);

    (chaos, avg_area, total_dist, ap_en, lyap_exp)
}

fn select_best_trajectory(
    rng: &mut Sha3RandomByteStream,
    num_iters: usize,
    num_steps_sim: usize,
    num_steps_video: usize,
    max_points: usize,
) -> Vec<Vec<Vector3<f64>>> {
    println!("Running {} simulations to find best...", num_iters);

    // Generate initial conditions
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

    println!("Analyzing trajectories in parallel...");
    let progress_interval = (num_iters / 10).max(1);

    let results_par: Vec<Option<(f64, f64, f64, f64, f64, usize)>> = many_bodies
        .par_iter()
        .enumerate()
        .map(|(index, bodies)| {
            if index % progress_interval == 0 && index > 0 {
                let percent = (index as f64 / num_iters as f64) * 100.0;
                println!("Trajectory analysis progress: {:.0}%", percent);
            }

            let total_energy = calculate_total_energy(bodies);
            let ang_mom_mag = calculate_total_angular_momentum(bodies).norm();

            // We only consider orbits with negative total energy (bound) & enough angular momentum
            if total_energy >= 0.0 || ang_mom_mag < 1e-3 {
                None
            } else {
                let positions = get_positions(bodies.clone(), num_steps_sim);
                let (chaos, avg_area, total_dist, ap_en, lyap_exp) = analyze_trajectories(
                    bodies[0].mass,
                    bodies[1].mass,
                    bodies[2].mass,
                    &positions,
                    max_points,
                );
                Some((chaos, avg_area, total_dist, ap_en, lyap_exp, index))
            }
        })
        .collect();

    let valid_results: Vec<_> = results_par.into_iter().filter_map(|x| x).collect();
    if valid_results.is_empty() {
        panic!("No valid simulations found.");
    }
    println!("Rank aggregating results...");

    fn assign_borda_scores(
        mut vals: Vec<(f64, usize)>,
        higher_better: bool,
    ) -> Vec<(usize, usize)> {
        if higher_better {
            vals.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        } else {
            vals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        }
        let n = vals.len();
        // Borda: top rank = n points, second = n-1, etc.
        vals.into_iter().enumerate().map(|(rank, (_, idx))| (idx, n - rank)).collect()
    }

    let chaos_vals: Vec<(f64, usize)> = valid_results.iter().map(|x| (x.0, x.5)).collect();
    let avg_area_vals: Vec<(f64, usize)> = valid_results.iter().map(|x| (x.1, x.5)).collect();
    let total_dist_vals: Vec<(f64, usize)> = valid_results.iter().map(|x| (x.2, x.5)).collect();
    let ap_en_vals: Vec<(f64, usize)> = valid_results.iter().map(|x| (x.3, x.5)).collect();
    let lyap_vals: Vec<(f64, usize)> = valid_results.iter().map(|x| (x.4, x.5)).collect();

    // chaos: lower better
    let chaos_scores = assign_borda_scores(chaos_vals, false);
    // avg_area: higher better
    let area_scores = assign_borda_scores(avg_area_vals, true);
    // total_dist: higher better
    let dist_scores = assign_borda_scores(total_dist_vals, true);
    // ap_en: higher better
    let apen_scores = assign_borda_scores(ap_en_vals, true);
    // lyap: higher better
    let lyap_scores = assign_borda_scores(lyap_vals, true);

    let mut total_scores = vec![0; num_iters];
    for (idx, s) in chaos_scores {
        total_scores[idx] += s;
    }
    for (idx, s) in area_scores {
        total_scores[idx] += s;
    }
    for (idx, s) in dist_scores {
        total_scores[idx] += s;
    }
    for (idx, s) in apen_scores {
        total_scores[idx] += s;
    }
    for (idx, s) in lyap_scores {
        total_scores[idx] += s;
    }

    let (best_idx, _) = total_scores.iter().enumerate().max_by_key(|&(_i, &score)| score).unwrap();
    let chosen = &many_bodies[best_idx];

    println!(
        "Selected sim masses: {:.2}, {:.2}, {:.2}",
        chosen[0].mass, chosen[1].mass, chosen[2].mass
    );
    println!("Total Energy: {:.6}", calculate_total_energy(chosen));
    println!(
        "Total Angular Momentum Magnitude: {:.6}",
        calculate_total_angular_momentum(chosen).norm()
    );

    get_positions(chosen.clone(), num_steps_video)
}

fn main() {
    let args = Args::parse();
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let seed = hex::decode(hex_seed).expect("Invalid hex seed");

    let mut rng = Sha3RandomByteStream::new(
        &seed,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    let steps = args.num_steps;

    // Randomly decide which bodies to hide. (Same logic as original.)
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
    let mut positions =
        select_best_trajectory(&mut rng, args.num_sims, steps, steps, args.max_points);

    // 2) **Normalize** all positions to [0..1] in-place:
    println!("Normalizing all positions to [0..1] globally (like the old code)...");
    normalize_positions_inplace(&mut positions);

    // 3) Generate color sequences
    let colors = generate_body_color_sequences(&mut rng, steps, args.special_color.as_deref());
    let base_name = args.file_name.as_str();
    let video_filename = format!("vids/{}.mp4", base_name);

    println!("Simulation complete. Generating image...");

    // We'll produce one single PNG. For images, we always do dynamic bounding.
    // We'll show the final moment plus a trajectory tail.
    const NUM_SECONDS: usize = 30;
    let target_length = 60 * NUM_SECONDS;
    let frame_interval = if target_length > 0 { steps.saturating_div(target_length) } else { 1 };
    const FRAME_SIZE: u32 = 1600;

    let video_trajectory_lengths = if args.special_color.is_some() {
        [1.0, 1.0, 1.0]
    } else {
        [rng.gen_range(0.2, 2.0), rng.gen_range(0.2, 2.0), rng.gen_range(0.2, 2.0)]
    };

    let image_trajectory_lengths = if args.special_color.is_some() {
        [5.0, 5.0, 5.0]
    } else {
        [rng.gen_range(1.0, 8.0), rng.gen_range(1.0, 8.0), rng.gen_range(1.0, 8.0)]
    };

    {
        // Generate a single frame (the final state) as a PNG.
        let pic_frames = plot_positions(
            &positions,
            FRAME_SIZE,
            image_trajectory_lengths,
            &hide_bodies,
            &colors,
            frame_interval,
            args.avoid_effects,
            true,                // one_frame = true => dynamic bounding forced
            args.dynamic_bounds, // won't matter for single images because we override it to "true" above
        );
        let last_frame = pic_frames.last().unwrap().clone();
        if let Err(e) = last_frame.save(format!("pics/{}.png", base_name)) {
            eprintln!("Error saving image: {:?}", e);
        } else {
            println!("Image saved.");
        }
    }

    // Then optionally generate a video:
    if !args.no_video {
        // For the video, we do or do not dynamically bound depending on `args.dynamic_bounds`.
        let frames = plot_positions(
            &positions,
            FRAME_SIZE,
            video_trajectory_lengths,
            &hide_bodies,
            &colors,
            frame_interval,
            args.avoid_effects,
            false, // one_frame = false
            args.dynamic_bounds,
        );
        create_video_from_frames_in_memory(&frames, &video_filename, 60);
    }

    println!("Done.");
}
