// Import external crates
extern crate nalgebra as na;
use na::Vector3;

use rayon::prelude::*;

use sha3::{Digest, Sha3_256};

use clap::Parser;

use std::f64::{INFINITY, NEG_INFINITY};

use image::{ImageBuffer, Rgb};
use imageproc::drawing::draw_filled_circle_mut;

use palette::{FromColor, Hsl, Srgb};

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

use statrs::statistics::Statistics;

use hex;

use std::process::{Command, Stdio};

/// Program to simulate and visualize the three-body problem
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate and visualize the three-body problem with customizable options."
)]
struct Args {
    /// Seed for the random number generator (hexadecimal string)
    #[arg(long, default_value = "00")]
    seed: String,

    /// Base name for the output files (image and video)
    #[arg(long, default_value = "output")]
    file_name: String,

    /// Number of simulation steps
    #[arg(long, default_value_t = 1_000_000)]
    num_steps: usize,

    /// Number of simulations to run when searching for the best trajectory
    #[arg(long, default_value_t = 10_000)]
    num_sims: usize,

    /// Maximum initial position value
    #[arg(long, default_value_t = 250.0)]
    location: f64,

    /// Maximum initial velocity value
    #[arg(long, default_value_t = 2.0)]
    velocity: f64,

    /// Minimum mass of the bodies
    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,

    /// Maximum mass of the bodies
    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    /// Avoid applying visual effects (e.g., Gaussian blur)
    #[arg(long, default_value_t = false)]
    avoid_effects: bool,

    /// Do not generate video output
    #[arg(long, default_value_t = false)]
    no_video: bool,

    /// Use a special color for the visualization (gold, bronze, silver, white)
    #[arg(long, value_parser = ["gold", "bronze", "silver", "white"])]
    special_color: Option<String>,
}

/// Custom random number generator based on SHA3-256 hashing
pub struct Sha3RandomByteStream {
    hasher: Sha3_256,
    seed: Vec<u8>,
    buffer: Vec<u8>,
    index: usize,
    min_mass: f64,
    max_mass: f64,
    location: f64,
    velocity: f64,
}

impl Sha3RandomByteStream {
    /// Create a new random byte stream with the given seed and parameters
    pub fn new(seed: &Vec<u8>, min_mass: f64, max_mass: f64, location: f64, velocity: f64) -> Self {
        let mut hasher = Sha3_256::new();
        let cloned_seed = seed.clone();
        hasher.update(seed);
        let buffer = hasher.clone().finalize_reset().to_vec();
        Self { hasher, seed: cloned_seed, buffer, index: 0, min_mass, max_mass, location, velocity }
    }

    /// Generate the next random byte
    pub fn next_byte(&mut self) -> u8 {
        if self.index >= self.buffer.len() {
            // Refill the buffer by hashing the seed and the previous buffer
            self.hasher.update(&self.seed);
            self.hasher.update(&self.buffer);
            self.buffer = self.hasher.finalize_reset().to_vec();
            self.index = 0;
        }

        let byte = self.buffer[self.index];
        self.index += 1;
        byte
    }

    /// Generate the next random u64 value
    pub fn next_u64(&mut self) -> u64 {
        let mut bytes = [0u8; 8];
        for i in 0..8 {
            bytes[i] = self.next_byte();
        }
        u64::from_le_bytes(bytes)
    }

    /// Generate the next random f64 value between 0.0 and 1.0
    pub fn next_f64(&mut self) -> f64 {
        let value: u64 = self.next_u64();
        let max_value = u64::MAX;
        (value as f64) / (max_value as f64)
    }

    /// Generate a random f64 value within a specified range
    pub fn gen_range(&mut self, min: f64, max: f64) -> f64 {
        let num = self.next_f64();
        let range = max - min;
        num * range + min
    }

    /// Generate a random mass within the specified mass range
    pub fn random_mass(&mut self) -> f64 {
        self.gen_range(self.min_mass, self.max_mass)
    }

    /// Generate a random location within the specified range
    pub fn random_location(&mut self) -> f64 {
        self.gen_range(-self.location, self.location)
    }

    /// Generate a random velocity within the specified range
    pub fn random_velocity(&mut self) -> f64 {
        self.gen_range(-self.velocity, self.velocity)
    }
}

/// Represents a celestial body in the simulation
#[derive(Clone)]
struct Body {
    mass: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
}

// Gravitational constant (arbitrary units)
const G: f64 = 9.8;

impl Body {
    /// Create a new body with specified mass, position, and velocity
    fn new(mass: f64, position: Vector3<f64>, velocity: Vector3<f64>) -> Body {
        Body { mass, position, velocity, acceleration: Vector3::zeros() }
    }

    /// Update the body's acceleration based on another body's mass and position
    fn update_acceleration(&mut self, other_mass: f64, other_position: &Vector3<f64>) {
        let dir: Vector3<f64> = self.position - *other_position;
        let mag = dir.norm();
        // Avoid division by zero or extremely small values
        if mag > 1e-10 {
            self.acceleration += -G * other_mass * dir / (mag * mag * mag);
        }
    }

    /// Reset the body's acceleration to zero
    fn reset_acceleration(&mut self) {
        self.acceleration = Vector3::zeros();
    }
}

/// Perform one step of Verlet integration for all bodies
fn verlet_step(bodies: &mut [Body], dt: f64) {
    // First loop: calculate accelerations based on positions
    // Collect positions and masses to avoid borrowing issues
    let positions: Vec<Vector3<f64>> = bodies.iter().map(|body| body.position).collect();
    let masses: Vec<f64> = bodies.iter().map(|body| body.mass).collect();

    for (i, body) in bodies.iter_mut().enumerate() {
        body.reset_acceleration();
        for (j, &other_position) in positions.iter().enumerate() {
            if i != j {
                body.update_acceleration(masses[j], &other_position);
            }
        }
    }

    // Update positions based on velocities and accelerations
    for body in bodies.iter_mut() {
        body.position = body.position + body.velocity * dt + 0.5 * body.acceleration * dt * dt;
    }

    // Second loop: recalculate accelerations with updated positions
    // Collect updated positions
    let positions: Vec<Vector3<f64>> = bodies.iter().map(|body| body.position).collect();

    for (i, body) in bodies.iter_mut().enumerate() {
        body.reset_acceleration();
        for (j, &other_position) in positions.iter().enumerate() {
            if i != j {
                body.update_acceleration(masses[j], &other_position);
            }
        }
    }

    // Update velocities based on the average acceleration
    for body in bodies.iter_mut() {
        body.velocity = body.velocity + body.acceleration * dt;
    }
}

/// Simulate the bodies over a number of steps and return their positions
fn get_positions(mut bodies: Vec<Body>, num_steps: usize) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;

    let mut positions = vec![vec![Vector3::zeros(); num_steps]; bodies.len()];

    for step in 0..num_steps {
        for (i, body) in bodies.iter().enumerate() {
            positions[i][step] = body.position;
        }
        verlet_step(&mut bodies, dt);
    }
    positions
}

/// Generate a color sequence based on a random walk in hue for a single body
fn get_single_color_walk(rng: &mut Sha3RandomByteStream, len: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::with_capacity(len);
    let mut hue = rng.gen_range(0.0, 360.0);
    for _ in 0..len {
        let delta = if rng.next_byte() & 1 == 0 { 0.1 } else { -0.1 };
        hue = (hue + delta).rem_euclid(360.0);
        let hsl = Hsl::new(hue, 1.0, 0.5);
        let rgb = Srgb::from_color(hsl);
        let r = (rgb.red * 255.0).clamp(0.0, 255.0) as u8;
        let g = (rgb.green * 255.0).clamp(0.0, 255.0) as u8;
        let b = (rgb.blue * 255.0).clamp(0.0, 255.0) as u8;
        colors.push(Rgb([r, g, b]));
    }
    colors
}

/// Generate a color sequence with variation around the specified special color
fn get_special_color_walk(
    color_name: &str,
    len: usize,
    rng: &mut Sha3RandomByteStream,
) -> Vec<Rgb<u8>> {
    let (base_hue, base_saturation, base_lightness) = match color_name.to_lowercase().as_str() {
        "gold" => (51.0, 1.0, 0.5),    // Gold color in HSL (hue in degrees)
        "bronze" => (30.0, 0.75, 0.5), // Bronze color in HSL
        "silver" => (0.0, 0.0, 0.75),  // Silver is light gray
        "white" => (0.0, 0.0, 1.0),    // White color in HSL
        _ => (0.0, 0.0, 1.0),          // Default to white if unknown
    };

    let mut colors = Vec::with_capacity(len);
    let mut hue = base_hue;

    for _ in 0..len {
        // For colors with hue, vary the hue slightly
        if base_saturation > 0.0 {
            // Randomly adjust the hue within a small range
            let delta = rng.gen_range(-1.0, 1.0); // Adjust hue by -1 to 1 degree
            hue = (hue + delta).rem_euclid(360.0);
        }

        // For silver and white, we can vary lightness slightly
        let lightness = if base_saturation == 0.0 {
            let delta = rng.gen_range(-0.05, 0.05); // Adjust lightness by -0.05 to 0.05
            (base_lightness + delta).clamp(0.7, 1.0)
        } else {
            base_lightness
        };

        let hsl = Hsl::new(hue, base_saturation, lightness);
        let rgb = Srgb::from_color(hsl);

        let r = (rgb.red * 255.0).clamp(0.0, 255.0) as u8;
        let g = (rgb.green * 255.0).clamp(0.0, 255.0) as u8;
        let b = (rgb.blue * 255.0).clamp(0.0, 255.0) as u8;

        colors.push(Rgb([r, g, b]));
    }

    colors
}

/// Generate color sequences for all three bodies
fn get_3_colors(
    rng: &mut Sha3RandomByteStream,
    len: usize,
    special_color: Option<&str>,
) -> Vec<Vec<Rgb<u8>>> {
    let mut colors = Vec::new();

    if let Some(color_name) = special_color {
        // Use the special color with variation for all bodies
        let special_color_walk = get_special_color_walk(color_name, len, rng);
        colors.push(special_color_walk.clone());
        colors.push(special_color_walk.clone());
        colors.push(special_color_walk.clone());
    } else {
        // Generate random color walks for each body
        for _ in 0..3 {
            let c = get_single_color_walk(rng, len);
            colors.push(c);
        }
    }
    colors
}

/// Convert positions to fit within the range [0.0, 1.0] for plotting
fn convert_positions(positions: &mut Vec<Vec<Vector3<f64>>>, hide: &Vec<bool>) {
    // Find min and max coordinates
    let (mut min_x, mut min_y) = (INFINITY, INFINITY);
    let (mut max_x, mut max_y) = (NEG_INFINITY, NEG_INFINITY);

    for body_idx in 0..positions.len() {
        if hide[body_idx] {
            continue;
        }
        for step in 0..positions[body_idx].len() {
            let x = positions[body_idx][step][0];
            let y = positions[body_idx][step][1];
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

    // Center and scale positions
    let x_center = (max_x + min_x) / 2.0;
    let y_center = (max_y + min_y) / 2.0;

    let x_range = max_x - min_x;
    let y_range = max_y - min_y;

    let mut range = if x_range > y_range { x_range } else { y_range };
    range *= 1.1; // Add some padding

    min_x = x_center - (range / 2.0);
    min_y = y_center - (range / 2.0);

    for body_idx in 0..positions.len() {
        for step in 0..positions[body_idx].len() {
            positions[body_idx][step][0] = (positions[body_idx][step][0] - min_x) / range;
            positions[body_idx][step][1] = (positions[body_idx][step][1] - min_y) / range;
        }
    }
}

/// Plot positions and generate frames for visualization
fn plot_positions(
    positions: &mut Vec<Vec<Vector3<f64>>>,
    frame_size: u32,
    snake_lens: [f64; 3],
    init_len: usize,
    hide: &Vec<bool>,
    colors: &Vec<Vec<Rgb<u8>>>,
    frame_interval: usize,
    avoid_effects: bool,
    one_frame: bool,
) -> Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    // Convert positions to [0.0, 1.0] range
    convert_positions(positions, hide);

    let mut frames = Vec::new();

    let mut snake_end: usize = if one_frame { positions[0].len() - 1 } else { frame_interval };

    const BACKGROUND_COLOR: Rgb<u8> = Rgb([0u8, 0u8, 0u8]);
    const WHITE_COLOR: Rgb<u8> = Rgb([255, 255, 255]);

    loop {
        // Create a new image with background color
        let mut img = ImageBuffer::from_fn(frame_size, frame_size, |_, _| BACKGROUND_COLOR);

        let mut snake_starts: [usize; 3] = [0, 0, 0];

        // Draw the trajectories
        for body_idx in 0..positions.len() {
            if hide[body_idx] {
                continue;
            }

            let mut total_dist: f64 = 0.0;
            let mut idx = snake_end;
            // Determine the start index based on the snake length
            loop {
                if idx <= 1 || total_dist > snake_lens[body_idx] {
                    break;
                }
                let x1 = positions[body_idx][idx][0];
                let y1 = positions[body_idx][idx][1];
                let x2 = positions[body_idx][idx - 1][0];
                let y2 = positions[body_idx][idx - 1][1];
                let dist = ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt();
                total_dist += dist;
                idx -= 1;
            }
            snake_starts[body_idx] = idx;

            // Draw the trajectory segments
            for i in snake_starts[body_idx]..snake_end {
                let x = positions[body_idx][i][0];
                let y = positions[body_idx][i][1];

                // Scale positions to image dimensions
                let xp = (x * frame_size as f64).round();
                let yp = (y * frame_size as f64).round();

                draw_filled_circle_mut(&mut img, (xp as i32, yp as i32), 6, colors[body_idx][i]);
            }
        }

        if !avoid_effects {
            // Apply Gaussian blur for visual effect
            img = imageproc::filter::gaussian_blur_f32(&img.clone(), 6.0);

            // Redraw the bodies on top of the blurred image
            for body_idx in 0..positions.len() {
                if hide[body_idx] {
                    continue;
                }

                for i in snake_starts[body_idx]..snake_end {
                    let x = positions[body_idx][i][0];
                    let y = positions[body_idx][i][1];

                    // Scale positions to image dimensions
                    let xp = (x * frame_size as f64).round();
                    let yp = (y * frame_size as f64).round();

                    draw_filled_circle_mut(&mut img, (xp as i32, yp as i32), 1, WHITE_COLOR);
                }
            }
        }

        if snake_end >= init_len {
            frames.push(imageproc::filter::gaussian_blur_f32(&img, 1.0));
        }
        snake_end += frame_interval;
        if snake_end >= positions[0].len() {
            break;
        }

        if one_frame {
            break;
        }
    }

    frames
}

/// Create a video from frames stored in memory using ffmpeg
fn create_video_from_frames_in_memory(
    frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>],
    output_file: &str,
    frame_rate: u32,
) {
    let mut command = Command::new("ffmpeg");
    command
        .arg("-y") // Overwrite the output file if it exists
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

    let mut ffmpeg = command.spawn().expect("Failed to spawn ffmpeg process");
    let ffmpeg_stdin = ffmpeg.stdin.as_mut().expect("Failed to open ffmpeg stdin");

    for frame in frames {
        let dyn_image = image::DynamicImage::ImageRgb8(frame.clone());
        dyn_image
            .write_to(ffmpeg_stdin, image::ImageOutputFormat::Png)
            .expect("Failed to write frame to ffmpeg stdin");
    }

    // Close the stdin to signal ffmpeg that we are done
    drop(ffmpeg.stdin.take());

    let output = ffmpeg.wait_with_output().expect("Failed to wait on ffmpeg process");

    if !output.status.success() {
        eprintln!("ffmpeg exited with an error: {}", String::from_utf8_lossy(&output.stderr));
    }
}

/// Analyze the trajectories to compute chaos, average area, and total distance
fn analyze_trajectories(
    m1: f64,
    m2: f64,
    m3: f64,
    positions: &Vec<Vec<Vector3<f64>>>,
) -> (f64, f64, f64) {
    let chaos = non_chaoticness(m1, m2, m3, positions);
    let avg_area = triangle_area(positions);
    let total_dist = calculate_total_distance(positions);
    (chaos, avg_area, total_dist)
}

/// Calculate the non-chaoticness metric of the trajectories
fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
    // The lower, the less chaotic
    let mut r1: Vec<f64> = vec![0.0; positions[0].len()];
    let mut r2: Vec<f64> = vec![0.0; positions[0].len()];
    let mut r3: Vec<f64> = vec![0.0; positions[0].len()];

    for i in 0..positions[0].len() {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];

        let center_of_mass1 = (m2 * p2 + m3 * p3) / (m2 + m3);
        let center_of_mass2 = (m1 * p1 + m3 * p3) / (m1 + m3);
        let center_of_mass3 = (m1 * p1 + m2 * p2) / (m1 + m2);

        let dist1 = p1 - center_of_mass1;
        let dist2 = p2 - center_of_mass2;
        let dist3 = p3 - center_of_mass3;

        r1[i] = dist1.norm();
        r2[i] = dist2.norm();
        r3[i] = dist3.norm();
    }

    let result1 = fourier_transform(&r1);
    let result2 = fourier_transform(&r2);
    let result3 = fourier_transform(&r3);

    let absolute1: Vec<f64> = result1.iter().map(|val| val.norm()).collect();
    let absolute2: Vec<f64> = result2.iter().map(|val| val.norm()).collect();
    let absolute3: Vec<f64> = result3.iter().map(|val| val.norm()).collect();

    let final_result1 = absolute1.std_dev().sqrt();
    let final_result2 = absolute2.std_dev().sqrt();
    let final_result3 = absolute3.std_dev().sqrt();

    (final_result1 + final_result2 + final_result3) / 3.0
}

/// Perform Fourier transform on a time series
fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let n = input.len();

    // Create an FFT planner
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);

    // Create complex input
    let mut complex_input: Vec<Complex<f64>> =
        input.iter().map(|&val| Complex::new(val, 0.0)).collect();

    // Perform the FFT
    fft.process(&mut complex_input);

    complex_input
}

/// Calculate the average area of the triangle formed by the three bodies over time
fn triangle_area(positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
    let mut new_positions = positions.clone();
    // No bodies are hidden for this calculation
    convert_positions(&mut new_positions, &vec![false, false, false]);

    let mut result = 0.0;
    let mut total_num = 0.0;

    for step in 0..new_positions[0].len() {
        // Calculate the area using the shoelace formula
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

/// Calculate the total distance traveled by all bodies
fn calculate_total_distance(positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
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

/// Run multiple simulations and select the one with the best characteristics
fn get_best(
    rng: &mut Sha3RandomByteStream,
    num_iters: usize,
    num_steps_sim: usize,
    num_steps_video: usize,
) -> Vec<Vec<Vector3<f64>>> {
    // Generate initial conditions
    let many_bodies: Vec<Vec<Body>> = (0..num_iters)
        .map(|_| {
            let body1 = Body::new(
                rng.random_mass(),
                Vector3::new(rng.random_location(), rng.random_location(), 0.0),
                Vector3::new(0.0, 0.0, rng.random_velocity()),
            );
            let body2 = Body::new(
                rng.random_mass(),
                Vector3::new(rng.random_location(), rng.random_location(), 0.0),
                Vector3::new(0.0, 0.0, rng.random_velocity()),
            );
            let body3 = Body::new(
                rng.random_mass(),
                Vector3::new(rng.random_location(), rng.random_location(), 0.0),
                Vector3::new(0.0, 0.0, rng.random_velocity()),
            );

            vec![body1, body2, body3]
        })
        .collect();

    // Analyze trajectories in parallel
    let results_par: Vec<(f64, f64, f64)> = many_bodies
        .par_iter()
        .map(|bodies| {
            let m1 = bodies[0].mass;
            let m2 = bodies[1].mass;
            let m3 = bodies[2].mass;
            let positions = get_positions(bodies.clone(), num_steps_sim);
            analyze_trajectories(m1, m2, m3, &positions)
        })
        .collect();

    // Sort the simulations based on the chaos metric
    let mut indexed_pairs: Vec<(usize, (f64, f64, f64))> =
        results_par.into_iter().enumerate().collect();

    // Sort by the chaos metric (the lower, the better)
    indexed_pairs.sort_by(|a, b| a.1 .0.partial_cmp(&b.1 .0).unwrap());

    const N: usize = 50; // Number of top simulations to consider
    let mut best_idx = 0;
    let mut best_result = f64::NEG_INFINITY;
    for i in 0..N.min(indexed_pairs.len()) {
        let (original_index, (_chaos, avg_area, _total_dist)) = indexed_pairs[i];
        if avg_area > best_result {
            best_result = avg_area;
            best_idx = original_index;
        }
    }

    let bodies = &many_bodies[best_idx];
    println!(
        "Selected simulation with masses: {:.2}, {:.2}, {:.2}",
        bodies[0].mass, bodies[1].mass, bodies[2].mass
    );
    let result = get_positions(bodies.clone(), num_steps_video);
    let avg_area = indexed_pairs.iter().find(|&&(idx, _)| idx == best_idx).unwrap().1 .1;
    let total_distance = indexed_pairs.iter().find(|&&(idx, _)| idx == best_idx).unwrap().1 .2;
    println!("Average triangle area: {:.6}", avg_area);
    println!("Total distance traveled: {:.6}", total_distance);
    result
}

fn main() {
    // Parse command-line arguments
    let args = Args::parse();

    // Process the seed argument
    let string_seed = if args.seed.starts_with("0x") {
        args.seed[2..].to_string()
    } else {
        args.seed.to_string()
    };
    let seed = hex::decode(string_seed).expect("Invalid hexadecimal string");

    // Initialize the random byte stream
    let mut byte_stream = Sha3RandomByteStream::new(
        &seed,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    let steps = args.num_steps;

    // Determine which bodies to hide based on the special_color flag
    let hide = if args.special_color.is_some() {
        vec![false, true, true] // Only show the first body
    } else {
        // Randomly decide which bodies to hide
        let random_val = byte_stream.gen_range(0.0, 1.0);
        if random_val < 1.0 / 3.0 {
            vec![false, false, false] // Show all bodies
        } else if random_val < 2.0 / 3.0 {
            vec![false, false, true] // Hide one body
        } else {
            vec![false, true, true] // Hide two bodies
        }
    };

    // Run simulations and get the best trajectory
    let mut positions = get_best(&mut byte_stream, args.num_sims, steps, steps);

    // Generate colors for the bodies
    let colors = get_3_colors(&mut byte_stream, steps, args.special_color.as_deref());

    let s: &str = args.file_name.as_str();
    let file_name = format!("vids/{}.mp4", s);
    println!("Simulation complete.");

    // Set initial length and frame parameters
    let init_len: usize = 0;
    const NUM_SECONDS: usize = 30;
    let target_length = 60 * NUM_SECONDS;
    let steps_per_frame: usize = steps / target_length;
    const FRAME_SIZE: u32 = 1600;

    // Set snake lengths (tail lengths) for video and image
    let random_vid_snake_len = 1.0;
    let random_pic_snake_len = 5.0;

    let vid_snake_lens = if args.special_color.is_some() {
        [random_vid_snake_len, random_vid_snake_len, random_vid_snake_len]
    } else {
        [
            byte_stream.gen_range(0.2, 2.0),
            byte_stream.gen_range(0.2, 2.0),
            byte_stream.gen_range(0.2, 2.0),
        ]
    };

    let pic_snake_lens = if args.special_color.is_some() {
        [random_pic_snake_len, random_pic_snake_len, random_pic_snake_len]
    } else {
        [
            byte_stream.gen_range(1.0, 8.0),
            byte_stream.gen_range(1.0, 8.0),
            byte_stream.gen_range(1.0, 8.0),
        ]
    };

    // Generate the final image
    let pic_frames = plot_positions(
        &mut positions,
        FRAME_SIZE,
        pic_snake_lens,
        init_len,
        &hide,
        &colors,
        steps_per_frame,
        args.avoid_effects,
        true, // Generate only one frame
    );
    let last_frame = pic_frames[pic_frames.len() - 1].clone();
    if let Err(e) = last_frame.save(format!("pics/{}.png", s)) {
        eprintln!("Error saving image: {:?}", e);
    } else {
        println!("Image saved successfully.");
    }

    // Generate the video if not skipped
    if !args.no_video {
        let frames = plot_positions(
            &mut positions,
            FRAME_SIZE,
            vid_snake_lens,
            init_len,
            &hide,
            &colors,
            steps_per_frame,
            args.avoid_effects,
            false, // Generate multiple frames for video
        );

        create_video_from_frames_in_memory(&frames, &file_name, 60);
        println!("Video creation complete.");
    }
}
