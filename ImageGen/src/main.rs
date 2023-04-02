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

    fn reset_acceleration(&mut self) {
        self.acceleration = Vector3::zeros();
    }

    fn update_acceleration(&mut self, other: &Body) {
        let r = other.position - self.position;
        let distance = r.norm();
        let force_magnitude = G * self.mass * other.mass / (distance * distance);
        let force = force_magnitude * r / distance;
        self.acceleration += force / self.mass
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




fn update_accelerations(bodies: &mut [Body]) {
    
    for i in 0..bodies.len() {
        let body1_ptr = &mut bodies[i] as *mut Body;
        bodies[i].reset_acceleration();

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
    update_velocities(bodies, dt);
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

    // Create a new image with a white background
    let mut img = ImageBuffer::from_fn(width, height, |_, _| background_color);

    // Draw lines between consecutive positions
    for i in 0..positions[0].len() - 1 {
        let x1 = positions[0][i][0];
        let y1 = positions[0][i][1];
        let x2 = positions[0][i + 1][0];
        let y2 = positions[0][i + 1][1];

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


fn TypeOf<T>(_: &T) {
    println!("{}", std::any::type_name::<T>())
}


fn main() {
    let dt = 0.001;
    let steps = 200_000;

    /*
    let body1 = Body::new(42.87781762, Vector3::new(133.47426179, -95.95830491, 16.90552867), Vector3::new(0.0, 0.0, 0.0));
    let body2 = Body::new(18.06659753, Vector3::new(19.90033799, 247.02239617, 70.52390568), Vector3::new(0.0, 0.0, 0.0));
    let body3 = Body::new(105.38238772, Vector3::new(-36.24854541, -25.77961209, -109.48262213), Vector3::new(0.0, 0.0, 0.0));
    */

    let body1 = Body::new(10.0, Vector3::new(-10.0, 10.0, -11.0), Vector3::new(-3.0, 0.0, 0.0));
    let body2 = Body::new(20.0, Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 0.0, 0.0));
    let body3 = Body::new(30.0, Vector3::new(10.0, 10.0, 12.0), Vector3::new(3.0, 0.0, 0.0));





    /*
m_1 = 10
m_2 = 20
m_3 = 30

# starting coordinates for planets
# p1_start = x_1, y_1, z_1
p1_start = np.array([-10, 10, -11])
v1_start = np.array([-3, 0, 0])

# p2_start = x_2, y_2, z_2
p2_start = np.array([0, 0, 0])
v2_start = np.array([0, 0, 0])

# p3_start = x_3, y_3, z_3
p3_start = np.array([10, 10, 12])
v3_start = np.array([3, 0, 0])

*/




    let mut bodies = vec![body1, body2, body3];

    let mut positions = vec![vec![Vector3::zeros(); steps]; bodies.len()];

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
