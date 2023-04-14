extern crate nalgebra as na;
use na::{Vector3};

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

use image::{ImageBuffer, Rgb};
use imageproc::drawing::draw_line_segment_mut;
use std::f64::{INFINITY, NEG_INFINITY};

fn print_type_of<T>(_: &T) {
    println!("{}", std::any::type_name::<T>());
}

use image::Pixel;

fn plot_positions(positions: &Vec<Vec<Vector3<f64>>>, frame_interval: usize) -> Vec<ImageBuffer<Rgb<u8>, Vec<u8>>> {

    // Set image dimensions, background color, and line color
    let width = 800;
    let height = 800;
    let background_color = Rgb([0u8, 0u8, 0u8]);
    let line_color = Rgb([255, 255, 255]);

    // Find the minimum and maximum coordinates for x and y
    let (mut min_x, mut min_y) = (INFINITY, INFINITY);
    let (mut max_x, mut max_y) = (NEG_INFINITY, NEG_INFINITY);

    for i in 0..positions[0].len() - 1 {
        let x = positions[0][i][0];
        let y = positions[0][i][1];
        if x < min_x { min_x = x; }
        if y < min_y { min_y = y; }
        if x > max_x { max_x = x; }
        if y > max_y { max_y = y; }
    }

    min_x = min_x - (max_x - min_x) * 0.1;
    max_x = max_x + (max_x - min_x) * 0.1;

    min_y = min_y - (max_y - min_y) * 0.1;
    max_y = max_y + (max_y - min_y) * 0.1;

    let mut frames = Vec::new();

    // Create a new image with a white background
    let mut img = ImageBuffer::from_fn(width, height, |_, _| background_color);
    for (frame, chunk) in positions[0].chunks(frame_interval).enumerate() {
        
        // Draw lines between consecutive positions
        for i in 0..chunk.len() - 1 {
            let x1 = chunk[i][0];
            let y1 = chunk[i][1];
            let x2 = chunk[i + 1][0];
            let y2 = chunk[i + 1][1];

            // Scale and shift positions to fit within the image dimensions
            let x1p = ((x1 - min_x) / (max_x - min_x) * (width as f64 - 1.0)).round();
            let y1p = ((y1 - min_y) / (max_y - min_y) * (height as f64 - 1.0)).round();
            let x2p = ((x2 - min_x) / (max_x - min_x) * (width as f64 - 1.0)).round();
            let y2p = ((y2 - min_y) / (max_y - min_y) * (height as f64 - 1.0)).round();

            // Draw a line segment between the scaled positions
            draw_line_segment_mut(&mut img, (x1p as f32, y1p as f32), (x2p as f32, y2p as f32), line_color);
        }

        let mut blurred_img = imageproc::filter::gaussian_blur_f32(&img, 3.0);

        // Create a new image with the same dimensions as the input images
        let mut combined_image = ImageBuffer::from_fn(width, height, |_, _| background_color);

        // Iterate through the pixels of both images and take the brighter pixel
        for y in 0..height {
            for x in 0..width {
                let pixel1 = blurred_img.get_pixel(x, y);
                let pixel2 = img.get_pixel(x, y);

                let luma1 = pixel1.to_luma();
                let luma2 = pixel2.to_luma();

                let brighter_pixel = if luma1[0] > luma2[0] {
                    pixel1
                } else {
                    pixel2
                };

                combined_image.put_pixel(x, y, *brighter_pixel);
            }
        }
        frames.push(combined_image);
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
    let mut R1: Vec<f64> = vec![0.0; positions[0].len()];
    let mut R2: Vec<f64> = vec![0.0; positions[0].len()];
    let mut R3: Vec<f64> = vec![0.0; positions[0].len()];

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

        R1[i] = dist1.norm();
        R2[i] = dist2.norm();
        R3[i] = dist3.norm();
    }

    let result1 = fourier_transform(&R1);
    let result2 = fourier_transform(&R2);
    let result3 = fourier_transform(&R3);

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

fn get_positions(mut bodies: Vec<Body>) -> Vec<Vec<Vector3<f64>>> {
    let dt = 0.001;
    let steps = 100_000;

    let mut positions = vec![vec![Vector3::zeros(); steps]; bodies.len()];

    for step in 0..steps {
        for (i, body) in bodies.iter().enumerate() {
            positions[i][step] = body.position;
        }
        verlet_step(&mut bodies, dt);
    }
    positions
}

fn get_best(num_iters: i64) -> Vec<Vec<Vector3<f64>>>{
    let mut many_bodies: Vec<Vec<Body>> = vec![];
    for _ in 0..num_iters {
        let body1 = Body::new(71.75203285, Vector3::new(138.56428574, -235.17280379, -169.68820646), Vector3::new(0.0, 0.0, 0.0));
        let body2 = Body::new(24.72652452, Vector3::new(139.56263714, -134.93432058,  -89.39675993), Vector3::new(0.0, 0.0, 0.0));
        let body3 = Body::new(83.12462743, Vector3::new(-40.34692494, -120.48855271, -107.46054229), Vector3::new(0.0, 0.0, 0.0));

        let mut bodies = vec![body1, body2, body3];
        many_bodies.push(bodies);
    }
    let mut best_chaos = f64::INFINITY;
    let mut best_positions = vec![];
    
    for bodies in many_bodies {
        let m1 = bodies[0].mass;
        let m2 = bodies[1].mass;
        let m3 = bodies[2].mass;
        let positions = get_positions(bodies);
        let chaos = non_chaoticness(m1, m2, m3, &positions);
        println!("chaos: {}", chaos);
        if chaos < best_chaos {
            best_chaos = chaos;
            best_positions = positions;
            println!("best chaos: {}", best_chaos);
        }
    }
    best_positions
}

fn main() {

    get_best(10);

    println!("done simulating");
    //let frames = plot_positions(&positions, 1000);
    //create_video_from_frames_in_memory(&frames, "output.mp4", 60);
    //println!("done video");
}