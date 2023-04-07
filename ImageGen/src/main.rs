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

fn plot_positions(positions: &Vec<Vec<Vector3<f64>>>) {

    // Set image dimensions, background color, and line color
    let width = 800;
    let height = 800;
    let background_color = Rgb([255u8, 255u8, 255u8]);
    let line_color = Rgb([0u8, 0u8, 0u8]);

    // Find the minimum and maximum coordinates for x and y
    let (mut min_x, mut min_y) = (INFINITY, INFINITY);
    let (mut max_x, mut max_y) = (NEG_INFINITY, NEG_INFINITY);

    for i in 0..positions[1].len() - 1 {
        let x = positions[1][i][0];
        let y = positions[1][i][1];
        if x < min_x { min_x = x; }
        if y < min_y { min_y = y; }
        if x > max_x { max_x = x; }
        if y > max_y { max_y = y; }
    }

    min_x = min_x - (max_x - min_x) * 0.1;
    max_x = max_x + (max_x - min_x) * 0.1;

    min_y = min_y - (max_y - min_y) * 0.1;
    max_y = max_y + (max_y - min_y) * 0.1;

    // Create a new image with a white background
    let mut img = ImageBuffer::from_fn(width, height, |_, _| background_color);

    // Draw lines between consecutive positions
    for i in 0..positions[1].len() - 1 {
        let x1 = positions[1][i][0];
        let y1 = positions[1][i][1];
        let x2 = positions[1][i + 1][0];
        let y2 = positions[1][i + 1][1];

        // Scale and shift positions to fit within the image dimensions
        let x1p = ((x1 - min_x) / (max_x - min_x) * (width as f64 - 1.0)).round();
        let y1p = ((y1 - min_y) / (max_y - min_y) * (height as f64 - 1.0)).round();
        let x2p = ((x2 - min_x) / (max_x - min_x) * (width as f64 - 1.0)).round();
        let y2p = ((y2 - min_y) / (max_y - min_y) * (height as f64 - 1.0)).round();

        // Draw a line segment between the scaled positions
        draw_line_segment_mut(&mut img, (x1p as f32, y1p as f32), (x2p as f32, y2p as f32), line_color);
    }

    // Save the image to a file
    img.save("trajectory.png").unwrap();
}

/*
 def non_chaoticness_fun(m_1,m_2,m_3,p1,p2,p3):
     """Finds non-chaoticness
     :param m_1: Mass of body 1
     :param m_2: Mass of body 2
     :param m_3: Mass of body 3
     :param p_1: Position vector of body 1
     :param p_2: Position vector of body 2
     :param p_3: Position vector of body 3
     """

     #Find distances (R) to other bodies' centre-of-mass
     R1=np.sqrt(np.sum(np.square(p1-(m_2*p2+m_3*p3)/(m_2+m_3)),axis=-1))
     R2=np.sqrt(np.sum(np.square(p2-(m_1*p1+m_3*p3)/(m_1+m_3)),axis=-1))
     R3=np.sqrt(np.sum(np.square(p3-(m_2*p2+m_1*p1)/(m_2+m_1)),axis=-1))

     #Find standard deviation of FFT of R
     non_chaoticness_1=np.sqrt(np.std(np.abs(np.fft.rfft(R1))))
     non_chaoticness_2=np.sqrt(np.std(np.abs(np.fft.rfft(R2))))
     non_chaoticness_3=np.sqrt(np.std(np.abs(np.fft.rfft(R3))))

     #average all bodies and return
     return (non_chaoticness_1+non_chaoticness_2+non_chaoticness_3)/3
*/

use std::process;


extern crate rustfft;
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;
use rustfft::num_traits::Zero;

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

fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &Vec<Vec<Vector3<f64>>>) {
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

    let mut absolute1: Vec<f64> = result1
        .iter()
        .map(|&val| (val.norm()))
        .collect();

    let mut absolute2: Vec<f64> = result2
        .iter()
        .map(|&val| (val.norm()))
        .collect();

    let mut absolute3: Vec<f64> = result3
        .iter()
        .map(|&val| (val.norm()))
        .collect();

    let final_result1 = absolute1.std_dev().sqrt();
    let final_result2 = absolute2.std_dev().sqrt();
    let final_result3 = absolute3.std_dev().sqrt();

    println!("final1 {}", final_result1);
    println!("final2 {}", final_result2);
    println!("final3 {}", final_result3);
}

fn main() {
    let dt = 0.001;
    //let steps = 800_000;
    let steps = 200_000;

    let body1 = Body::new(71.75203285, Vector3::new(138.56428574, -235.17280379, -169.68820646), Vector3::new(0.0, 0.0, 0.0));
    let body2 = Body::new(24.72652452, Vector3::new(139.56263714, -134.93432058,  -89.39675993), Vector3::new(0.0, 0.0, 0.0));
    let body3 = Body::new(83.12462743, Vector3::new(-40.34692494, -120.48855271, -107.46054229), Vector3::new(0.0, 0.0, 0.0));


    let mut bodies = vec![body1, body2, body3];

    let mut positions = vec![vec![Vector3::zeros(); steps]; bodies.len()];

    for step in 0..steps {
        for (i, body) in bodies.iter().enumerate() {
            positions[i][step] = body.position;
        }
        verlet_step(&mut bodies, dt);
    }


    non_chaoticness(bodies[0].mass, bodies[1].mass, bodies[2].mass, &positions);

    //plot_positions(&positions);

    println!("done");
}
