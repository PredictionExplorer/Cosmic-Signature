extern crate nalgebra as na;
use na::{Vector3};

#[derive(Clone)]
struct Body {
    mass: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
}

impl Body {
    fn new(mass: f64, position: Vector3<f64>, velocity: Vector3<f64>) -> Body {
        Body {
            mass,
            position,
            velocity,
            acceleration: Vector3::zeros(),
        }
    }

    fn update_acceleration(&mut self, other: &Body) {
        self.acceleration = Vector3::zeros();
        let r = other.position - self.position;
        let distance = r.norm();
        //println!("{}", distance);
        self.acceleration += r * G * other.mass / distance.powi(3);
    }
}

fn update_accelerations(bodies: &mut [Body]) {
    
    for i in 0..bodies.len() {
        let body1_ptr = &mut bodies[i] as *mut Body;

        for j in 0..bodies.len() {
            if i != j {
                let body2_ptr = &bodies[j] as *const Body;

                unsafe {
                    let body1 = &mut *body1_ptr;
                    let body2 = &*body2_ptr;
                    body1.update_acceleration(body2);
                }
            }
        }
    }
}

fn update_velocities(bodies: &mut [Body], dt: f64) {
    for body in bodies.iter_mut() {
        body.velocity += body.acceleration * dt;
    }
}

fn verlet_step(bodies: &mut [Body], dt: f64) {
    update_accelerations(bodies);
    for body in bodies.iter_mut() {
        body.position += body.velocity * dt + body.acceleration * (dt * dt) * 0.5;
    }

    update_accelerations(bodies);
    update_velocities(bodies, dt);
}

const G: f64 = 9.8;

use image::{ImageBuffer, Rgb};
use imageproc::drawing::draw_line_segment_mut;
use std::f64::{INFINITY, NEG_INFINITY};



fn plot_positions(positions: &Vec<Vec<Vector3<f64>>>) {
    let flat_positions: Vec<(f64, f64, f64)> = positions
        .iter()
        .flat_map(|body_positions| {
            body_positions.iter().map(|pos| (pos.x, pos.y, pos.z))
        })
        .collect();

    // Replace the original positions variable with the flattened one
    let positions = &flat_positions;

    // Set image dimensions, background color, and line color
    let width = 800;
    let height = 800;
    let background_color = Rgb([255u8, 255u8, 255u8]);
    let line_color = Rgb([0u8, 0u8, 0u8]);

    // Find the minimum and maximum coordinates for x and y
    let (mut min_x, mut min_y) = (INFINITY, INFINITY);
    let (mut max_x, mut max_y) = (NEG_INFINITY, NEG_INFINITY);

    for &(x, y, _) in positions {
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }

    // Create a new image with a white background
    let mut img = ImageBuffer::from_fn(width, height, |_, _| background_color);

    // Draw lines between consecutive positions
    for i in 0..positions.len() - 1 {
        let (x1, y1, _) = positions[i];
        let (x2, y2, _) = positions[i + 1];

        // Scale and shift positions to fit within the image dimensions
        let x1 = ((x1 - min_x) / (max_x - min_x) * (width as f64 - 1.0)).round();
        let y1 = ((y1 - min_y) / (max_y - min_y) * (height as f64 - 1.0)).round();
        let x2 = ((x2 - min_x) / (max_x - min_x) * (width as f64 - 1.0)).round();
        let y2 = ((y2 - min_y) / (max_y - min_y) * (height as f64 - 1.0)).round();

        // Draw a line segment between the scaled positions
        draw_line_segment_mut(&mut img, (x1 as f32, y1 as f32), (x2 as f32, y2 as f32), line_color);
    }

    // Save the image to a file
    img.save("trajectory.png").unwrap();
}


fn TypeOf<T>(_: &T) {
    println!("{}", std::any::type_name::<T>())
}


fn main() {
    let dt = 0.001;
    let steps = 400000;


    let body1 = Body::new(42.87781762, Vector3::new(133.47426179, -95.95830491, 16.90552867), Vector3::new(0.0, 0.0, 0.0));
    let body2 = Body::new(18.06659753, Vector3::new(19.90033799, 247.02239617, 70.52390568), Vector3::new(0.0, 0.0, 0.0));
    let body3 = Body::new(105.38238772, Vector3::new(-36.24854541, -25.77961209, -109.48262213), Vector3::new(0.0, 0.0, 0.0));

    let mut bodies = vec![body1, body2, body3];

    let mut positions = vec![vec![Vector3::zeros(); steps]; bodies.len()];
    TypeOf(&positions[0]);

    for step in 0..steps {
        for (i, body) in bodies.iter().enumerate() {
            positions[i][step] = body.position;
        }
        verlet_step(&mut bodies, dt);
    }
    //println!("{}", positions[0]);

    plot_positions(&positions);

    println!("done");
}
