extern crate nalgebra as na;
use na::{Vector3};

use rayon::prelude::*;

use sha3::{Digest, Sha3_256};

pub struct Sha3RandomByteStream {
    hasher: Sha3_256,
    seed: Vec<u8>,
    buffer: Vec<u8>,
    index: usize,
}

impl Sha3RandomByteStream {
    pub fn new(seed: &Vec<u8>) -> Self {
        let mut hasher = Sha3_256::new();
        let cloned_seed = seed.clone();
        hasher.update(seed);
        let buffer = hasher.clone().finalize_reset().to_vec();
        Self {
            hasher,
            seed: cloned_seed,
            buffer,
            index: 0,
        }
    }

    pub fn next_byte(&mut self) -> u8 {
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

    pub fn next_u64(&mut self) -> u64 {
        let mut bytes = [0u8; 8];
        for i in 0..8 {
            bytes[i] = self.next_byte();
        }
        u64::from_le_bytes(bytes)
    }

    pub fn next_f64(&mut self) -> f64 {
        let value: u64 = self.next_u64();
        let max_value = u64::MAX;
        (value as f64) / (max_value as f64)
    }

    pub fn gen_range(&mut self, min: f64, max: f64) -> f64 {
        let num = self.next_f64();
        let range = max - min;
        let value = num * range + min;
        value
    }

    pub fn random_mass(&mut self) -> f64 {
        self.gen_range(100.0, 300.0)
    }
    
    pub fn random_location(&mut self) -> f64 {
        self.gen_range(-250.0, 250.0)
    }

    
}

#[derive(Clone)]
struct Body {
    mass: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
}

const G: f64 = 9.8;

impl Body {
    fn new(mass: f64, position: Vector3<f64>, velocity: Vector3<f64>) -> Body {
        Body {
            mass,
            position,
            velocity,
            acceleration: Vector3::zeros(),
        }
    }

    fn update_acceleration(&mut self, other_mass: f64, other_position: Vector3<f64>) {
        let dir: Vector3<f64> = self.position - other_position;
        let mag = dir.norm();
        self.acceleration += -G * other_mass * dir / (mag * mag * mag);
    }

    fn reset_acceleration(&mut self) {
        self.acceleration = Vector3::zeros();
    }
}

fn verlet_step(bodies: &mut [Body], dt: f64) {
    for i in 0..bodies.len() {
        bodies[i].reset_acceleration();
        for j in 0..bodies.len() {
            if i != j {
                bodies[i].update_acceleration(bodies[j].mass, bodies[j].position);
            }
        }
    }

    for i in 0..bodies.len() {
        bodies[i].position = bodies[i].position + bodies[i].velocity * dt + 0.5 * bodies[i].acceleration * (dt * dt);
    }

    for i in 0..bodies.len() {
        for j in 0..bodies.len() {
            if i != j {
                bodies[i].update_acceleration(bodies[j].mass, bodies[j].position);
            }
        }
    }
    
    for i in 0..bodies.len() {
        bodies[i].velocity = bodies[i].velocity + 0.5 * bodies[i].acceleration * dt;
    }
}

use std::f64::{INFINITY, NEG_INFINITY};

use image::{ImageBuffer, Rgb};
use imageproc::drawing::draw_filled_circle_mut;

use palette::{FromColor, Hsl, Srgb};

fn get_single_color_walk(rng: &mut Sha3RandomByteStream, len: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::new();
    let mut hue = rng.gen_range(0.0, 360.0);
    for _ in 0..len {
        if rng.next_byte() & 1 == 0 {
            hue += 0.1;
        } else {
            hue -= 0.1;
        }
        if hue < 0.0 {
            hue += 360.0;
        }
        if hue > 360.0 {
            hue -= 360.0;
        }
        let hsl = Hsl::new(hue, 1.0, 0.5);
        let my_new_rgb = Srgb::from_color(hsl);

        let r = (my_new_rgb.red * 255.0) as u8;
        let g = (my_new_rgb.green * 255.0) as u8;
        let b = (my_new_rgb.blue * 255.0) as u8;

        let line_color: Rgb<u8> = Rgb([r, g, b]);
        colors.push(line_color);
    }
    colors
}

fn get_3_colors(rng: &mut Sha3RandomByteStream, len: usize) -> Vec<Vec<Rgb<u8>>> {
    let mut colors = Vec::new();
    for _ in 0..3 {
        let c = get_single_color_walk(rng, len);
        colors.push(c);
    }
    colors
}

fn plot_positions(positions: &Vec<Vec<Vector3<f64>>>, frame_size: u32, snake_len: usize, init_len: usize, hide: &Vec<bool>, colors: &Vec<Vec<Rgb<u8>>>, frame_interval: usize) -> Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> {
    let background_color = Rgb([0u8, 0u8, 0u8]);

    // Find the minimum and maximum coordinates for x and y
    let (mut min_x, mut min_y) = (INFINITY, INFINITY);
    let (mut max_x, mut max_y) = (NEG_INFINITY, NEG_INFINITY);

    for body_idx in 0..positions.len() {
        if hide[body_idx] {
            continue;
        }
        for step in 0..positions[body_idx].len() {
            let x = positions[body_idx][step][0];
            let y = positions[body_idx][step][1];
            if x < min_x { min_x = x; }
            if y < min_y { min_y = y; }
            if x > max_x { max_x = x; }
            if y > max_y { max_y = y; }
        }
    }
    // TODO: make sure that scaling is equal in both directions
    let x_range = max_x - min_x;
    let y_range = max_y - min_y;
    let x_center = (min_x + max_x) / 2.0;
    let y_center = (min_y + max_y) / 2.0;
    let mut range = if x_range > y_range {
        x_range
    } else {
        y_range
    };
    min_x = x_center - (range / 2.0) * 1.1;
    max_x = x_center + (range / 2.0) * 1.1;
    min_y = y_center - (range / 2.0) * 1.1;
    range = max_x - min_x;

    let mut frames = Vec::new();

    let mut snake_end: usize = 0;

    loop {
        let mut img = ImageBuffer::from_fn(frame_size, frame_size, |_, _| background_color);

        for body_idx in 0..positions.len() {
            if hide[body_idx] {
                continue;
            }
            let snake_start = if snake_end > snake_len {
                snake_end - snake_len
            } else {
                0
            };
            for i in snake_start..snake_end {
                let x1 = positions[body_idx][i][0];
                let y1 = positions[body_idx][i][1];

                // Scale and shift positions to fit within the image dimensions
                let x1p = (((x1 - min_x) / range) * (frame_size as f64)).round();
                let y1p = (((y1 - min_y) / range) * (frame_size as f64)).round();

                draw_filled_circle_mut(&mut img, (x1p as i32, y1p as i32), 6, colors[body_idx][i]);
            }
        }

        let mut blurred_img = imageproc::filter::gaussian_blur_f32(&img, 6.0);
        //let mut blurred_img = img.clone();
        for body_idx in 0..positions.len() {
            if hide[body_idx] {
                continue;
            }
            let snake_start = if snake_end > snake_len {
                snake_end - snake_len
            } else {
                0
            };
            for i in snake_start..snake_end {

                let x1 = positions[body_idx][i][0];
                let y1 = positions[body_idx][i][1];

                // Scale and shift positions to fit within the image dimensions
                let x1p = ((x1 - min_x) / range * (frame_size as f64 - 1.0)).round();
                let y1p = ((y1 - min_y) / range * (frame_size as f64 - 1.0)).round();

                let white_color = Rgb([255, 255, 255]);
                draw_filled_circle_mut(&mut blurred_img, (x1p as i32, y1p as i32), 1, white_color);
            }
        }

        if snake_end >= init_len {
            frames.push(imageproc::filter::gaussian_blur_f32(&blurred_img, 1.0));
        }
        snake_end += frame_interval;
        if snake_end >= positions[0].len() {
            break;
        }
    }

    return frames;

}

extern crate rustfft;
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;

fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let n = input.len();

    // Create an FFT planner
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);

    // Create complex input
    let mut complex_input: Vec<Complex<f64>> = input
        .iter()
        .map(|&val| Complex::new(val, 0.0))
        .collect();

    // Perform the FFT
    fft.process(&mut complex_input);

    complex_input
}

use statrs::statistics::Statistics;

fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
    let mut r1: Vec<f64> = vec![0.0; positions[0].len()];
    let mut r2: Vec<f64> = vec![0.0; positions[0].len()];
    let mut r3: Vec<f64> = vec![0.0; positions[0].len()];

    for i in 0..positions[0].len() {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];

        let center_of_mass1 = (m2 * p2 + m3 * p3) / (m2 + m3);
        let center_of_mass2 = (m1 * p1 + m3 * p3) / (m1 + m3);
        let center_of_mass3 = (m2 * p2 + m1 * p1) / (m2 + m1);

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

    let absolute1: Vec<f64> = result1
        .iter()
        .map(|&val| (val.norm()))
        .collect();

    let absolute2: Vec<f64> = result2
        .iter()
        .map(|&val| (val.norm()))
        .collect();

    let absolute3: Vec<f64> = result3
        .iter()
        .map(|&val| (val.norm()))
        .collect();

    let final_result1 = absolute1.std_dev().sqrt();
    let final_result2 = absolute2.std_dev().sqrt();
    let final_result3 = absolute3.std_dev().sqrt();

    (final_result1 + final_result2 + final_result3) / 3.0
}

use std::io::Write;
use std::process::{Command, Stdio};
use image::DynamicImage;

fn create_video_from_frames_in_memory(frames: &[ImageBuffer<Rgb<u8>, Vec<u8>>], output_file: &str, frame_rate: u32) {
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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut ffmpeg = command.spawn().expect("Failed to spawn ffmpeg process");
    let ffmpeg_stdin = ffmpeg.stdin.as_mut().expect("Failed to open ffmpeg stdin");

    for frame in frames {
        let dyn_image = DynamicImage::ImageRgb8(frame.clone());
        dyn_image
            .write_to(ffmpeg_stdin, image::ImageOutputFormat::Png)
            .expect("Failed to write frame to ffmpeg stdin");
    }

    ffmpeg_stdin.flush().expect("Failed to flush ffmpeg stdin");
    drop(ffmpeg_stdin); // Close stdin to signal EOF to ffmpeg

    let output = ffmpeg.wait_with_output().expect("Failed to wait on ffmpeg process");

    if !output.status.success() {
        eprintln!(
            "ffmpeg exited with an error: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

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

fn get_best(rng: &mut Sha3RandomByteStream, num_iters: usize, num_steps_sim: usize, num_steps_video: usize) -> Vec<Vec<Vector3<f64>>> {

    let mut many_bodies: Vec<Vec<Body>> = vec![];
    for _ in 0..num_iters {
        let body1 = Body::new(rng.random_mass(), Vector3::new(rng.random_location(), rng.random_location(), 0.0), Vector3::new(0.0, 0.0, 0.0));
        let body2 = Body::new(rng.random_mass(), Vector3::new(rng.random_location(), rng.random_location(), 0.0), Vector3::new(0.0, 0.0, 0.0));
        let body3 = Body::new(rng.random_mass(), Vector3::new(rng.random_location(), rng.random_location(), 0.0), Vector3::new(0.0, 0.0, 0.0));
        
        let bodies = vec![body1, body2, body3];
        many_bodies.push(bodies);
    }

    let mut results_par = vec![0.0; many_bodies.len()];
    many_bodies.par_iter().map(|bodies| {
        let m1 = bodies[0].mass;
        let m2 = bodies[1].mass;
        let m3 = bodies[2].mass;
        let positions = get_positions(bodies.clone() , num_steps_sim);
        non_chaoticness(m1, m2, m3, &positions)
    }).collect_into_vec(&mut results_par);

    let mut best_idx = 0;
    let mut best_result = f64::INFINITY;
    for (i, &res) in results_par.iter().enumerate() {
        if res < best_result {
            best_result = res;
            best_idx = i;
        }
    }

    let bodies = &many_bodies[best_idx];
    println!("mass: {} {} {} pos: {} {} | {} {} | {} {}",
        bodies[0].mass, bodies[1].mass, bodies[2].mass,
        bodies[0].position[0], bodies[0].position[1],
        bodies[1].position[0], bodies[1].position[1],
        bodies[2].position[0], bodies[2].position[1]);
    get_positions(bodies.clone(), num_steps_video)
}

use clap::Parser;

/// Simple program to greet a person
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long, default_value = "00")]
    seed: String,

    #[arg(long, default_value = "output")]
    file_name: String,

    #[arg(long, default_value_t = 1_000)]
    num_tries: usize,

    #[arg(long, default_value_t = 1_000_000)]
    num_steps_sim: usize,

    #[arg(long, default_value_t = 1_000_000)]
    num_steps_video: usize,

    #[arg(long, default_value_t = 60)]
    frame_rate: u32,

    #[arg(long, default_value_t = 2200)]
    frame_size: u32,

    #[arg(long, default_value_t = 1000)]
    steps_per_frame: usize,

    #[arg(long, default_value_t = 150_000)]
    snake_len: usize,

    #[arg(long, default_value_t = 150_000)]
    init_len: usize,

    #[arg(long)]
    hide_1: bool,

    #[arg(long)]
    hide_2: bool,

    #[arg(long)]
    hide_3: bool,
}

use hex;

fn main() {
    let args = Args::parse();
    let string_seed = if args.seed.starts_with("0x") {
            args.seed[2..].to_string()
        } else {
            args.seed.to_string()
        };
    let seed = hex::decode(string_seed).expect("Invalid hexadecimal string");

    let mut byte_stream = Sha3RandomByteStream::new(&seed);
    let positions = get_best(&mut byte_stream, args.num_tries, args.num_steps_sim, args.num_steps_video);
    println!("done simulating");
    //let colors: Vec<Rgb<u8>> = get_colors(&mut byte_stream);
    let colors = get_3_colors(&mut byte_stream, args.num_steps_video);
    let s: &str = args.file_name.as_str();
    let file_name = format!("{}.mp4", s);
    let hide = vec![args.hide_1, args.hide_2, args.hide_3];
    let frames = plot_positions(&positions, args.frame_size, args.snake_len, args.init_len, &hide, &colors, args.steps_per_frame);
    let last_frame = frames[frames.len() - 1].clone();
    if let Err(e) = last_frame.save(format!("{}.png", s)) {
        eprintln!("Error saving image: {:?}", e);
    } else {
        println!("Image saved successfully.");
    }
    create_video_from_frames_in_memory(&frames, &file_name, 60);
    println!("done creating video");
}