extern crate nalgebra as na;
use na::Vector3;

use rayon::prelude::*;

use sha3::{Digest, Sha3_256};

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
    pub fn new(seed: &Vec<u8>, min_mass: f64, max_mass: f64, location: f64, velocity: f64) -> Self {
        let mut hasher = Sha3_256::new();
        let cloned_seed = seed.clone();
        hasher.update(seed);
        let buffer = hasher.clone().finalize_reset().to_vec();
        Self { hasher, seed: cloned_seed, buffer, index: 0, min_mass, max_mass, location, velocity }
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
        // 100 - 300
        self.gen_range(self.min_mass, self.max_mass)
    }

    pub fn random_location(&mut self) -> f64 {
        // let n = 250.0;
        self.gen_range(-self.location, self.location)
    }

    pub fn random_velocity(&mut self) -> f64 {
        self.gen_range(-self.velocity, self.velocity)
    }

    pub fn is_white(&mut self) -> bool {
        const CHANCE_WHITE: f64 = 0.1;
        if self.gen_range(0.0, 1.0) < CHANCE_WHITE {
            return true;
        } else {
            return false;
        }
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
        Body { mass, position, velocity, acceleration: Vector3::zeros() }
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
        bodies[i].position =
            bodies[i].position + bodies[i].velocity * dt + 0.5 * bodies[i].acceleration * (dt * dt);
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

fn get_white_color_walk(len: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::new();
    const WHITE_COLOR: Rgb<u8> = Rgb([255, 255, 255]);
    for _ in 0..len {
        colors.push(WHITE_COLOR);
    }
    colors
}

fn get_3_colors(rng: &mut Sha3RandomByteStream, len: usize, special: bool) -> Vec<Vec<Rgb<u8>>> {
    let mut colors = Vec::new();
    if special {
        let white_color = get_white_color_walk(len);
        colors.push(white_color.clone());
        colors.push(white_color.clone());
        colors.push(white_color.clone());
    } else {
        for _ in 0..3 {
            let c = get_single_color_walk(rng, len);
            colors.push(c);
        }
    }
    colors
}

fn convert_positions(positions: &mut Vec<Vec<Vector3<f64>>>, hide: &Vec<bool>) {
    // we want to convert the positions to a range of 0.0 to 1.0
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
    let x_center = (max_x + min_x) / 2.0;
    let y_center = (max_y + min_y) / 2.0;

    let x_range = max_x - min_x;
    let y_range = max_y - min_y;

    let mut range = if x_range > y_range { x_range } else { y_range };
    range *= 1.1;

    min_x = x_center - (range / 2.0);
    min_y = y_center - (range / 2.0);

    for body_idx in 0..positions.len() {
        for step in 0..positions[body_idx].len() {
            positions[body_idx][step][0] = (positions[body_idx][step][0] - min_x) / range;
            positions[body_idx][step][1] = (positions[body_idx][step][1] - min_y) / range;
        }
    }
}

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
    convert_positions(positions, hide);

    let mut frames = Vec::new();

    let mut snake_end: usize = if one_frame { positions[0].len() - 1 } else { frame_interval };

    const BACKGROUND_COLOR: Rgb<u8> = Rgb([0u8, 0u8, 0u8]);
    const WHITE_COLOR: Rgb<u8> = Rgb([255, 255, 255]);
    loop {
        let mut img = ImageBuffer::from_fn(frame_size, frame_size, |_, _| BACKGROUND_COLOR);

        let mut snake_starts: [usize; 3] = [0, 0, 0];

        for body_idx in 0..positions.len() {
            if hide[body_idx] {
                continue;
            }

            let mut total_dist: f64 = 0.0;
            let mut idx = snake_end;
            loop {
                if idx <= 1 || total_dist > snake_lens[body_idx] {
                    break;
                }
                let x1 = positions[body_idx][idx][0];
                let y1 = positions[body_idx][idx][1];
                let x2 = positions[body_idx][idx - 1][0];
                let y2 = positions[body_idx][idx - 1][1];
                let dist = ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt(); // TODO: use distance function in the struct
                total_dist += dist;
                idx -= 1;
            }
            snake_starts[body_idx] = idx;

            for i in snake_starts[body_idx]..snake_end {
                let x = positions[body_idx][i][0];
                let y = positions[body_idx][i][1];

                // Scale and shift positions to fit within the image dimensions
                let xp = (x * frame_size as f64).round();
                let yp = (y * frame_size as f64).round();

                draw_filled_circle_mut(&mut img, (xp as i32, yp as i32), 6, colors[body_idx][i]);
            }
        }

        if !avoid_effects {
            img = imageproc::filter::gaussian_blur_f32(&img.clone(), 6.0);
            //let mut blurred_img = img.clone();
            for body_idx in 0..positions.len() {
                if hide[body_idx] {
                    continue;
                }

                for i in snake_starts[body_idx]..snake_end {
                    let x = positions[body_idx][i][0];
                    let y = positions[body_idx][i][1];

                    // Scale and shift positions to fit within the image dimensions
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
    }

    return frames;
}

extern crate rustfft;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

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

use statrs::statistics::Statistics;

fn analyze_trajectories(
    m1: f64,
    m2: f64,
    m3: f64,
    positions: &Vec<Vec<Vector3<f64>>>,
) -> (f64, f64, f64) {
    let chaos = non_chaoticness(m1, m2, m3, &positions);
    let avg_area = triangle_area(&positions);
    let total_dist = calculate_total_distance(&positions);
    return (chaos, avg_area, total_dist);
    //(chaos * chaos * (1.0 / avg_area)).sqrt()
}

fn calculate_total_distance(positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
    let mut new_positions = positions.clone();
    //let hide = vec![false, false, false];
    convert_positions(&mut new_positions, &vec![false, false, false]);

    let mut total_dist = 0.0;
    for body_idx in 0..new_positions.len() {
        for step_idx in 1..new_positions[body_idx].len() {
            let x1 = positions[body_idx][step_idx][0];
            let y1 = positions[body_idx][step_idx][1];
            let x2 = positions[body_idx][step_idx - 1][0];
            let y2 = positions[body_idx][step_idx - 1][1];
            let dist = ((x1 - x2).powi(2) + (y1 - y2).powi(2)).sqrt();
            total_dist += dist;
        }
    }
    total_dist
}

fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
    // The lower, the better
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

    let absolute1: Vec<f64> = result1.iter().map(|&val| (val.norm())).collect();

    let absolute2: Vec<f64> = result2.iter().map(|&val| (val.norm())).collect();

    let absolute3: Vec<f64> = result3.iter().map(|&val| (val.norm())).collect();

    let final_result1 = absolute1.std_dev().sqrt();
    let final_result2 = absolute2.std_dev().sqrt();
    let final_result3 = absolute3.std_dev().sqrt();

    (final_result1 + final_result2 + final_result3) / 3.0
}

use image::DynamicImage;
use std::io::Write;
use std::process::{Command, Stdio};

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

    let output = ffmpeg.wait_with_output().expect("Failed to wait on ffmpeg process");

    if !output.status.success() {
        eprintln!("ffmpeg exited with an error: {}", String::from_utf8_lossy(&output.stderr));
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

fn triangle_area(positions: &Vec<Vec<Vector3<f64>>>) -> f64 {
    // calculate what percentage of screen is occupied by the 3 bodies

    let mut new_positions = positions.clone();
    //let hide = vec![false, false, false];
    convert_positions(&mut new_positions, &vec![false, false, false]);

    let mut result = 0.0;
    let mut total_num = 0.0;

    for step in 0..new_positions[0].len() {
        // (1/2) * |x1(y2 − y3) + x2(y3 − y1) + x3(y1 − y2)|
        let y_diff_p2_p3 = new_positions[1][step][1] - new_positions[2][step][1];
        let y_diff_p3_p1 = new_positions[2][step][1] - new_positions[0][step][1];
        let y_diff_p1_p2 = new_positions[0][step][1] - new_positions[1][step][1];
        let area = 0.5
            * ((new_positions[0][step][0] * y_diff_p2_p3
                + new_positions[1][step][0] * y_diff_p3_p1
                + new_positions[2][step][0] * y_diff_p1_p2)
                .abs());

        result += area;
        total_num += 1.0;
    }
    result / total_num
}

fn get_best(
    rng: &mut Sha3RandomByteStream,
    num_iters: usize,
    num_steps_sim: usize,
    num_steps_video: usize,
) -> Vec<Vec<Vector3<f64>>> {
    let mut many_bodies: Vec<Vec<Body>> = vec![];
    for _ in 0..num_iters {
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

        let bodies = vec![body1, body2, body3];
        many_bodies.push(bodies);
    }

    let mut results_par = vec![(0.0, 0., 0.0); many_bodies.len()];
    many_bodies
        .par_iter()
        .map(|bodies| {
            let m1 = bodies[0].mass;
            let m2 = bodies[1].mass;
            let m3 = bodies[2].mass;
            let positions = get_positions(bodies.clone(), num_steps_sim);
            analyze_trajectories(m1, m2, m3, &positions)
        })
        .collect_into_vec(&mut results_par);

    // sort the list and keep the indeces
    let mut indexed_pairs: Vec<(usize, (f64, f64, f64))> =
        results_par.clone().into_iter().enumerate().collect();

    // Sort by the (f64, f64) pairs
    indexed_pairs.sort_by(|a, b| a.1 .0.partial_cmp(&b.1 .0).unwrap());

    const N: usize = 50;
    let mut best_idx = 0;
    let mut best_result = f64::NEG_INFINITY;
    for i in 0..N {
        let (original_index, (_chaos, avg_area, _total_dist)) = indexed_pairs[i];
        if avg_area > best_result {
            best_result = avg_area;
            best_idx = original_index;
        }
    }

    let bodies = &many_bodies[best_idx];
    println!(
        "mass: {} {} {} pos: {} {} | {} {} | {} {}",
        bodies[0].mass,
        bodies[1].mass,
        bodies[2].mass,
        bodies[0].position[0],
        bodies[0].position[1],
        bodies[1].position[0],
        bodies[1].position[1],
        bodies[2].position[0],
        bodies[2].position[1]
    );
    let result = get_positions(bodies.clone(), num_steps_video);
    let avg_area = results_par[best_idx].1;
    let total_distance = results_par[best_idx].2;
    println!("Area: {}", avg_area);
    println!("Dist: {}", total_distance);
    result
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
    special: bool,

    #[arg(long, default_value_t = false)]
    no_video: bool,
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

    let mut byte_stream = Sha3RandomByteStream::new(
        &seed,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    let steps = args.num_steps;

    // Determine the hide vector based on the special flag
    let hide = if args.special {
        vec![false, true, true]
    } else {
        let random_val = byte_stream.gen_range(0.0, 1.0);
        if random_val < 1.0 / 3.0 {
            vec![false, false, false] // 1/3 chance to hide none
        } else if random_val < 2.0 / 3.0 {
            vec![false, false, true] // 1/3 chance to hide none
        } else {
            vec![false, true, true] // 1/3 chance to hide none
        }
    };

    let mut positions = get_best(&mut byte_stream, args.num_sims, steps, steps);

    let colors = get_3_colors(&mut byte_stream, steps, args.special);

    let s: &str = args.file_name.as_str();
    let file_name = format!("vids/{}.mp4", s);
    println!("done simulating");

    let init_len: usize = 0;
    const NUM_SECONDS: usize = 30;
    let target_length = 60 * NUM_SECONDS;
    let steps_per_frame: usize = steps / target_length;
    const FRAME_SIZE: u32 = 1600;

    let random_vid_snake_len = 1.0;
    let random_pic_snake_len = 5.0;

    let vid_snake_lens = if args.special {
        [random_vid_snake_len, random_vid_snake_len, random_vid_snake_len]
    } else {
        [
            byte_stream.gen_range(0.2, 2.0),
            byte_stream.gen_range(0.2, 2.0),
            byte_stream.gen_range(0.2, 2.0),
        ]
    };

    let pic_snake_lens = if args.special {
        [random_pic_snake_len, random_pic_snake_len, random_pic_snake_len]
    } else {
        [
            byte_stream.gen_range(1.0, 8.0),
            byte_stream.gen_range(1.0, 8.0),
            byte_stream.gen_range(1.0, 8.0),
        ]
    };

    let pic_frames = plot_positions(
        &mut positions,
        FRAME_SIZE,
        pic_snake_lens,
        init_len,
        &hide,
        &colors,
        steps_per_frame,
        args.avoid_effects,
        true,
    );
    let last_frame = pic_frames[pic_frames.len() - 1].clone();
    if let Err(e) = last_frame.save(format!("pics/{}.png", s)) {
        eprintln!("Error saving image: {:?}", e);
    } else {
        println!("Image saved successfully.");
    }

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
            false,
        );

        create_video_from_frames_in_memory(&frames, &file_name, 60);
        println!("done creating video");
    }
}
