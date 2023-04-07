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
        /*Calculates gravitational acceleration applying on a body.
        :param m: Mass of object that creates acceleration
        :param r: Distance between objects
        */
        //const G: f64 = 9.8;
        let dir: Vector3<f64> = self.position - other_position;
        let mag = dir.norm();
        self.acceleration += -G * other_mass * dir / (mag * mag * mag);
    }

    fn reset_acceleration(&mut self) {
        self.acceleration = Vector3::zeros();
    }

}



/*
fn verlet_integration(planets, dt, num_steps):
    positions = {planet.name: np.zeros((num_steps, 3)) for planet in planets}
    for i, planet in enumerate(planets):
        positions[planet.name][0] = planet.position

    for step in range(1, num_steps):
        for i, planet1 in enumerate(planets):
            acceleration = np.zeros(3)
            for j, planet2 in enumerate(planets):
                if i != j:
                    force = gravitational_force(planet1, planet2)
                    acceleration += force / planet1.mass
            planet1.position += planet1.velocity * dt + 0.5 * acceleration * dt**2
            planet1.velocity += acceleration * dt
            positions[planet1.name][step] = planet1.position

    return positions
*/



fn gravity_acceleration(body: &Body, dir: Vector3<f64>) -> Vector3<f64> {
    /*Calculates gravitational acceleration applying on a body.
    :param m: Mass of object that creates acceleration
    :param r: Distance between objects
    */
    //const G: f64 = 9.8;
    let mag = dir.norm();
    return -G * body.mass * dir / (mag * mag * mag);
}



/*
fn update_velocities(body: Body, direction: Vector3) {
    for body in bodies.iter_mut() {
        body.velocity += body.acceleration * dt;
    }
}

fn verlet_step(bodies: &mut [Body], dt: f64) {
    update_accelerations(bodies);
    for body in bodies.iter_mut() {
        body.position += body.velocity * dt + body.acceleration * (dt * dt) * 0.5;
    }
    update_velocities(bodies, dt);
}
*/


fn verlet_step_2(bodies: &mut [Body], dt: f64) {
    /*Calculates velocity and position of three bodies for the next time step.
    :param r: Positions of three bodies - #bodies x #dimensions
    :param v: Velocities of three bodies - #bodies x #dimensions
    :param m: Masses of three bodies - #bodies x 1
    :param dt: Time-step in seconds
    */


    //let mut a = [Vector3::zeros(), Vector3::zeros(), Vector3::zeros()];

    //a = np.zeros_like(r, dtype=np.float64) #initialize acceleration for all bodies: #bodies x #dimensions
    //
    for i in 0..bodies.len() {
        bodies[i].reset_acceleration();
        for j in 0..bodies.len() {
            if i != j {
                bodies[i].update_acceleration(bodies[j].mass, bodies[j].position);
                //a[i] += gravity_acceleration(&bodies[j], bodies[i].position - bodies[j].position);
            }
        }
    }

    for i in 0..bodies.len() {
        bodies[i].position = bodies[i].position + bodies[i].velocity * dt + 0.5 * bodies[i].acceleration * (dt * dt);
    }

    for i in 0..bodies.len() {
        for j in 0..bodies.len() {
            if i != j {
                //bodies[i].update_acceleration(&bodies[j]);
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


fn main() {
    let dt = 0.001;
    let steps = 800_000;

    let body1 = Body::new(71.75203285, Vector3::new(138.56428574, -235.17280379, -169.68820646), Vector3::new(0.0, 0.0, 0.0));
    let body2 = Body::new(24.72652452, Vector3::new(139.56263714, -134.93432058,  -89.39675993), Vector3::new(0.0, 0.0, 0.0));
    let body3 = Body::new(83.12462743, Vector3::new(-40.34692494, -120.48855271, -107.46054229), Vector3::new(0.0, 0.0, 0.0));


    let mut bodies = vec![body1, body2, body3];

    let mut positions = vec![vec![Vector3::zeros(); steps]; bodies.len()];

    for step in 0..steps {
        for (i, body) in bodies.iter().enumerate() {
            positions[i][step] = body.position;
        }
        verlet_step_2(&mut bodies, dt);
    }

    plot_positions(&positions);

    println!("done");
}
