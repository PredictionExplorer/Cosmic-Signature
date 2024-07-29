// External crates
extern crate nalgebra as na;
extern crate rustfft;

// Standard library imports
use std::f64::{INFINITY, NEG_INFINITY};
use std::io::Write;
use std::process::{Command, Stdio};

// Third-party crates
use clap::Parser;
use hex;
use image::{DynamicImage, ImageBuffer, Rgb, Rgba};
use nalgebra::{Point2, Point3, Vector3};
use palette::{rgb::Rgb as PaletteRgb, FromColor, Hsv};
use rand::Rng;
use rand_distr::{Distribution, Normal};
use rayon::prelude::*;
use rustfft::{num_complex::Complex, FftPlanner};
use sha3::{Digest, Sha3_256};
use statrs::statistics::Statistics;

use ndarray::Array3;

use backtrace::Backtrace;
use std::panic;

const GRID_RESOLUTION: (usize, usize, usize) = (50, 50, 50);
const DIFFUSION_RATE: f64 = 0.01;
const THERMAL_COEFFICIENT: f64 = 0.001;
const AMBIENT_TEMP: f64 = 0.0;

const PARTICLES_PER_FRAME: usize = 10;

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
    position: Point3<f64>,
    velocity: Vector3<f64>,
    acceleration: Vector3<f64>,
}

const G: f64 = 9.8;

impl Body {
    fn new(mass: f64, position: Point3<f64>, velocity: Vector3<f64>) -> Body {
        Body { mass, position, velocity, acceleration: Vector3::zeros() }
    }

    fn update_acceleration(&mut self, other_mass: f64, other_position: Point3<f64>) {
        let dir: Vector3<f64> = self.position - other_position;
        let mag = dir.magnitude();
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

fn get_single_color_walk(rng: &mut Sha3RandomByteStream, len: usize) -> Vec<Rgb<u8>> {
    let mut colors = Vec::new();
    let mut hue = rng.gen_range(0.0, 360.0);
    for _ in 0..len {
        if rng.next_byte() & 1 == 0 {
            hue += 0.5;
        } else {
            hue -= 0.5;
        }
        hue = hue.rem_euclid(360.0);
        let hsv = Hsv::new(hue, 0.7, 0.5); // Reduced saturation
        let rgb = PaletteRgb::from_color(hsv);
        colors.push(Rgb([
            (rgb.red * 255.0) as u8,
            (rgb.green * 255.0) as u8,
            (rgb.blue * 255.0) as u8,
        ]));
    }
    colors
}

fn get_3_colors(rng: &mut Sha3RandomByteStream, len: usize, special: bool) -> Vec<Vec<Rgba<u8>>> {
    let mut colors = Vec::new();
    if special {
        let white_color = get_white_color_walk(len);
        colors.push(white_color.clone());
        colors.push(white_color.clone());
        colors.push(white_color.clone());
    } else {
        for _ in 0..3 {
            let c = get_single_color_walk(rng, len);
            colors.push(c.into_iter().map(|rgb| Rgba([rgb[0], rgb[1], rgb[2], 255])).collect());
        }
    }
    colors
}

fn get_white_color_walk(len: usize) -> Vec<Rgba<u8>> {
    vec![Rgba([255, 255, 255, 255]); len]
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

const TIME_PER_FRAME: f64 = 1.0 / 60.0;

struct Camera {
    position: Point3<f64>,
    direction: Vector3<f64>,
    up: Vector3<f64>,
    fov: f64,
}

impl Camera {
    fn world_to_screen(&self, world_pos: Point3<f64>, width: u32, height: u32) -> Point2<f64> {
        let to_camera = world_pos - self.position;
        let forward = to_camera.dot(&self.direction);

        if forward <= 0.0 {
            return Point2::new(-1.0, -1.0); // Behind the camera
        }

        let right = self.direction.cross(&self.up).normalize();
        let up = right.cross(&self.direction);

        let horizontal = to_camera.dot(&right);
        let vertical = to_camera.dot(&up);

        let aspect_ratio = width as f64 / height as f64;
        let tan_fov = (self.fov / 2.0).tan();

        let screen_x = (horizontal / (forward * tan_fov * aspect_ratio) + 1.0) * 0.5 * width as f64;
        let screen_y = (-vertical / (forward * tan_fov) + 1.0) * 0.5 * height as f64;

        Point2::new(screen_x, screen_y)
    }
}

struct FluidGrid {
    velocity: Array3<Vector3<f64>>,
    density: Array3<f64>,
    temperature: Array3<f64>,
}

struct VolumetricGrid {
    grid: Array3<f32>,
    resolution: (usize, usize, usize),
    bounds: (Vector3<f64>, Vector3<f64>),
}

impl FluidGrid {
    fn new(resolution: (usize, usize, usize)) -> Self {
        FluidGrid {
            velocity: Array3::zeros(resolution),
            density: Array3::zeros(resolution),
            temperature: Array3::zeros(resolution),
        }
    }

    fn advect(&mut self, dt: f64) {
        // Simple Euler advection
        let (nx, ny, nz) = self.velocity.dim();
        let mut new_density = Array3::zeros((nx, ny, nz));
        let mut new_temperature = Array3::zeros((nx, ny, nz));

        for x in 0..nx {
            for y in 0..ny {
                for z in 0..nz {
                    let pos = Vector3::new(x as f64, y as f64, z as f64);
                    let vel = self.velocity[[x, y, z]];
                    let new_pos = pos - vel * dt;

                    // Clamp positions to grid bounds
                    let nx = new_pos.x.clamp(0.0, (nx - 1) as f64);
                    let ny = new_pos.y.clamp(0.0, (ny - 1) as f64);
                    let nz = new_pos.z.clamp(0.0, (nz - 1) as f64);

                    // Interpolate density and temperature
                    new_density[[x, y, z]] = self.interpolate(&self.density, nx, ny, nz);
                    new_temperature[[x, y, z]] = self.interpolate(&self.temperature, nx, ny, nz);
                }
            }
        }

        self.density = new_density;
        self.temperature = new_temperature;
    }

    fn diffuse(&mut self, dt: f64) {
        let rate = DIFFUSION_RATE * dt;
        self.density = self.gauss_seidel(&self.density, rate);
        self.temperature = self.gauss_seidel(&self.temperature, rate);
    }

    fn project(&mut self) {
        // Simplified pressure projection
        let (nx, ny, nz) = self.velocity.dim();
        let mut div = Array3::zeros((nx, ny, nz));

        for x in 1..nx - 1 {
            for y in 1..ny - 1 {
                for z in 1..nz - 1 {
                    div[[x, y, z]] = 0.5
                        * (self.velocity[[x + 1, y, z]][0] - self.velocity[[x - 1, y, z]][0]
                            + self.velocity[[x, y + 1, z]][1]
                            - self.velocity[[x, y - 1, z]][1]
                            + self.velocity[[x, y, z + 1]][2]
                            - self.velocity[[x, y, z - 1]][2]);
                }
            }
        }

        // Solve for pressure
        let p = self.gauss_seidel(&div, 1.0);

        // Apply pressure
        for x in 1..nx - 1 {
            for y in 1..ny - 1 {
                for z in 1..nz - 1 {
                    self.velocity[[x, y, z]] -= 0.5
                        * Vector3::new(
                            p[[x + 1, y, z]] - p[[x - 1, y, z]],
                            p[[x, y + 1, z]] - p[[x, y - 1, z]],
                            p[[x, y, z + 1]] - p[[x, y, z - 1]],
                        );
                }
            }
        }
    }

    fn interpolate(&self, grid: &Array3<f64>, x: f64, y: f64, z: f64) -> f64 {
        let i0 = x.floor() as usize;
        let i1 = i0 + 1;
        let j0 = y.floor() as usize;
        let j1 = j0 + 1;
        let k0 = z.floor() as usize;
        let k1 = k0 + 1;

        let s1 = x - i0 as f64;
        let s0 = 1.0 - s1;
        let t1 = y - j0 as f64;
        let t0 = 1.0 - t1;
        let u1 = z - k0 as f64;
        let u0 = 1.0 - u1;

        let (nx, ny, nz) = grid.dim();
        let i0 = i0.min(nx - 1);
        let i1 = i1.min(nx - 1);
        let j0 = j0.min(ny - 1);
        let j1 = j1.min(ny - 1);
        let k0 = k0.min(nz - 1);
        let k1 = k1.min(nz - 1);

        s0 * (t0 * (u0 * grid[[i0, j0, k0]] + u1 * grid[[i0, j0, k1]])
            + t1 * (u0 * grid[[i0, j1, k0]] + u1 * grid[[i0, j1, k1]]))
            + s1 * (t0 * (u0 * grid[[i1, j0, k0]] + u1 * grid[[i1, j0, k1]])
                + t1 * (u0 * grid[[i1, j1, k0]] + u1 * grid[[i1, j1, k1]]))
    }

    fn gauss_seidel(&self, b: &Array3<f64>, alpha: f64) -> Array3<f64> {
        let (nx, ny, nz) = b.dim();
        let mut x = Array3::zeros((nx, ny, nz));
        let beta = 1.0 / (1.0 + 6.0 * alpha);

        for _ in 0..20 {
            // Number of iterations
            for i in 1..nx - 1 {
                for j in 1..ny - 1 {
                    for k in 1..nz - 1 {
                        x[[i, j, k]] = (x[[i - 1, j, k]]
                            + x[[i + 1, j, k]]
                            + x[[i, j - 1, k]]
                            + x[[i, j + 1, k]]
                            + x[[i, j, k - 1]]
                            + x[[i, j, k + 1]])
                            * alpha
                            + b[[i, j, k]] * beta;
                    }
                }
            }
        }

        x
    }
}

impl VolumetricGrid {
    fn new(resolution: (usize, usize, usize), bounds: (Vector3<f64>, Vector3<f64>)) -> Self {
        VolumetricGrid { grid: Array3::zeros(resolution), resolution, bounds }
    }

    fn add_particle(&mut self, position: &Point3<f64>, density: f32) {
        let (min_bound, max_bound) = self.bounds;
        let normalized_pos = (position.coords - min_bound).component_div(&(max_bound - min_bound));
        let (x, y, z) = (
            (normalized_pos[0] * self.resolution.0 as f64) as usize,
            (normalized_pos[1] * self.resolution.1 as f64) as usize,
            (normalized_pos[2] * self.resolution.2 as f64) as usize,
        );
        if x < self.resolution.0 && y < self.resolution.1 && z < self.resolution.2 {
            self.grid[[x, y, z]] += density;
        }
    }

    fn apply_3d_blur(&mut self, sigma: f32) {
        // Simple 3D box blur as an approximation
        let blur_radius = (sigma * 3.0) as usize;
        let mut new_grid = self.grid.clone();

        for x in 0..self.resolution.0 {
            for y in 0..self.resolution.1 {
                for z in 0..self.resolution.2 {
                    let mut sum = 0.0;
                    let mut count = 0;
                    for dx in 0..=blur_radius * 2 {
                        for dy in 0..=blur_radius * 2 {
                            for dz in 0..=blur_radius * 2 {
                                let nx = x.saturating_add(dx).saturating_sub(blur_radius);
                                let ny = y.saturating_add(dy).saturating_sub(blur_radius);
                                let nz = z.saturating_add(dz).saturating_sub(blur_radius);
                                if nx < self.resolution.0
                                    && ny < self.resolution.1
                                    && nz < self.resolution.2
                                {
                                    sum += self.grid[[nx, ny, nz]];
                                    count += 1;
                                }
                            }
                        }
                    }
                    new_grid[[x, y, z]] = sum / count as f32;
                }
            }
        }

        self.grid = new_grid;
    }

    fn get_density(&self, position: &Point3<f64>) -> f32 {
        let (min_bound, max_bound) = self.bounds;
        let normalized_pos = (position.coords - min_bound).component_div(&(max_bound - min_bound));
        let (x, y, z) = (
            (normalized_pos[0] * self.resolution.0 as f64) as usize,
            (normalized_pos[1] * self.resolution.1 as f64) as usize,
            (normalized_pos[2] * self.resolution.2 as f64) as usize,
        );
        if x < self.resolution.0 && y < self.resolution.1 && z < self.resolution.2 {
            self.grid[[x, y, z]]
        } else {
            0.0
        }
    }
}

#[derive(Clone)]
struct Particle {
    position: Point3<f64>,
    velocity: Vector3<f64>,
    color: Rgba<u8>,
    lifetime: f64,
    max_lifetime: f64,
    size: f64,
    max_size: f64,
}

struct ParticleSystem {
    particles: Vec<Particle>,
    color_walks: Vec<Vec<Rgba<u8>>>,
    emission_counts: [usize; 3],
    fluid_grid: FluidGrid,
    volumetric_grid: VolumetricGrid,
}

const MAX_INFLUENCE_DISTANCE: f64 = 1.0; // Adjust this value based on your simulation scale
const WIND_STRENGTH: f64 = 0.01; // Adjust this to control how much the bodies affect particle movement

impl ParticleSystem {
    fn new(num_particles: usize, bounds: (f64, f64, f64), color_walks: Vec<Vec<Rgba<u8>>>) -> Self {
        let mut rng = rand::thread_rng();
        let particles = (0..num_particles)
            .map(|_| Particle {
                position: Point3::new(
                    rng.gen_range(-bounds.0..bounds.0),
                    rng.gen_range(-bounds.1..bounds.1),
                    rng.gen_range(-bounds.2..bounds.2),
                ),
                velocity: Vector3::new(
                    rng.gen_range(-0.00015..0.00015),
                    rng.gen_range(-0.00015..0.00015),
                    rng.gen_range(-0.00015..0.00015),
                ),
                color: Rgba([255, 255, 255, 255]),
                lifetime: 0.0,
                max_lifetime: rng.gen_range(100.0..8000.0),
                size: rng.gen_range(1.0..3.0),
                max_size: rng.gen_range(10.0..100.0),
            })
            .collect();

        let fluid_grid = FluidGrid::new(GRID_RESOLUTION);
        let grid_bounds = (
            Vector3::new(-bounds.0, -bounds.1, -bounds.2),
            Vector3::new(bounds.0, bounds.1, bounds.2),
        );
        let volumetric_grid = VolumetricGrid::new(GRID_RESOLUTION, grid_bounds);

        ParticleSystem {
            particles,
            color_walks,
            emission_counts: [0; 3],
            fluid_grid,
            volumetric_grid,
        }
    }

    fn update(&mut self, bodies: &[Body], time_step: f64, bounds: (f64, f64, f64)) {
        // Update fluid simulation
        self.fluid_grid.advect(time_step);
        self.fluid_grid.diffuse(time_step);
        self.fluid_grid.project();

        // Clear and repopulate the volumetric grid
        self.volumetric_grid = VolumetricGrid::new(GRID_RESOLUTION, self.volumetric_grid.bounds);

        // Update particles
        let mut updated_particles = Vec::new();

        for particle in &self.particles {
            let mut updated_particle = particle.clone();
            updated_particle.lifetime += time_step;
            if updated_particle.lifetime >= updated_particle.max_lifetime {
                continue;
            }

            // Gradually increase size
            updated_particle.size += (updated_particle.max_size - updated_particle.size) * 0.01;

            let grid_pos = self.world_to_grid(&updated_particle.position);
            let fluid_velocity = self.fluid_grid.velocity[grid_pos];

            // Apply fluid velocity
            updated_particle.velocity +=
                (fluid_velocity - updated_particle.velocity) * time_step * 0.1;

            // Apply thermal effects
            let local_temp = self.fluid_grid.temperature[grid_pos];
            updated_particle.velocity +=
                Vector3::new(0.0, (local_temp - AMBIENT_TEMP) * THERMAL_COEFFICIENT, 0.0)
                    * time_step;

            // Add slight downward force (gravity)
            updated_particle.velocity += Vector3::new(0.0, -0.01, 0.0) * time_step;

            // Update position
            updated_particle.position += updated_particle.velocity * time_step;

            // Contain particles within bounds
            for i in 0..3 {
                if updated_particle.position[i] < -bounds.0
                    || updated_particle.position[i] > bounds.0
                {
                    updated_particle.velocity[i] *= -0.5; // Bounce off walls
                    updated_particle.position[i] =
                        updated_particle.position[i].clamp(-bounds.0, bounds.0);
                }
            }

            // Add random movement for diffusion
            let mut rng = rand::thread_rng();
            let diffusion_strength = 0.0001;
            updated_particle.velocity += Vector3::new(
                rng.gen_range(-diffusion_strength..diffusion_strength),
                rng.gen_range(-diffusion_strength..diffusion_strength),
                rng.gen_range(-diffusion_strength..diffusion_strength),
            );

            // Add particle to volumetric grid
            self.volumetric_grid.add_particle(&updated_particle.position, 1.0);

            updated_particles.push(updated_particle);
        }

        // Update particles with their new states
        self.particles = updated_particles;

        // Emit new particles
        for (idx, body) in bodies.iter().enumerate() {
            self.emit_particles(body, PARTICLES_PER_FRAME, idx);
        }

        // Apply 3D blur to volumetric grid
        self.volumetric_grid.apply_3d_blur(1.5);

        // Update fluid grid based on particles
        self.update_fluid_grid();

        // Conserve momentum
        self.conserve_momentum();
    }

    fn world_to_grid(&self, position: &Point3<f64>) -> (usize, usize, usize) {
        let (min_bound, max_bound) = self.volumetric_grid.bounds;
        let normalized_pos = (position.coords - min_bound).component_div(&(max_bound - min_bound));
        (
            (normalized_pos[0].clamp(0.0, 1.0) * (GRID_RESOLUTION.0 - 1) as f64) as usize,
            (normalized_pos[1].clamp(0.0, 1.0) * (GRID_RESOLUTION.1 - 1) as f64) as usize,
            (normalized_pos[2].clamp(0.0, 1.0) * (GRID_RESOLUTION.2 - 1) as f64) as usize,
        )
    }

    fn update_fluid_grid(&mut self) {
        // Reset fluid grid
        self.fluid_grid = FluidGrid::new(GRID_RESOLUTION);

        // Update fluid grid based on particles
        for particle in &self.particles {
            let (x, y, z) = self.world_to_grid(&particle.position);
            if x < GRID_RESOLUTION.0 && y < GRID_RESOLUTION.1 && z < GRID_RESOLUTION.2 {
                self.fluid_grid.velocity[[x, y, z]] += particle.velocity;
                self.fluid_grid.density[[x, y, z]] += 1.0;
                self.fluid_grid.temperature[[x, y, z]] += 1.0; // Simplified temperature addition
            }
        }

        // Normalize velocity and temperature
        for x in 0..GRID_RESOLUTION.0 {
            for y in 0..GRID_RESOLUTION.1 {
                for z in 0..GRID_RESOLUTION.2 {
                    if self.fluid_grid.density[[x, y, z]] > 0.0 {
                        self.fluid_grid.velocity[[x, y, z]] /= self.fluid_grid.density[[x, y, z]];
                        self.fluid_grid.temperature[[x, y, z]] /=
                            self.fluid_grid.density[[x, y, z]];
                    }
                }
            }
        }
    }

    fn conserve_momentum(&mut self) {
        let total_momentum: Vector3<f64> = self.particles.iter().map(|p| p.velocity).sum();
        let average_velocity = total_momentum / self.particles.len() as f64;
        for particle in &mut self.particles {
            particle.velocity -= average_velocity;
        }
    }

    fn emit_particles(&mut self, body: &Body, count: usize, body_idx: usize) {
        let mut rng = rand::thread_rng();
        let normal = Normal::new(0.0, 0.1).unwrap();

        for _ in 0..count {
            let offset = Vector3::new(
                normal.sample(&mut rng),
                normal.sample(&mut rng),
                normal.sample(&mut rng),
            );

            let position = body.position + offset;
            let vel = 0.01;
            let velocity = Vector3::new(
                rng.gen_range(-vel..vel),
                rng.gen_range(-vel..vel),
                rng.gen_range(-vel..vel),
            ) + body.velocity * 0.1;

            let color_index = self.emission_counts[body_idx] % self.color_walks[body_idx].len();
            let base_color = self.color_walks[body_idx][color_index];
            let color =
                Rgba([base_color[0], base_color[1], base_color[2], rng.gen_range(100..200)]);

            let max_lifetime = rng.gen_range(1.0..5.0);
            let max_size = rng.gen_range(5.0..20.0);

            self.particles.push(Particle {
                position,
                velocity,
                color,
                lifetime: 0.0,
                max_lifetime,
                size: max_size * 0.2,
                max_size,
            });
        }
        self.emission_counts[body_idx] += count;

        // Debug: Print emitted particle count
        println!("Emitted {} particles for body {}", count, body_idx);
    }

    fn render(&self, width: u32, height: u32, camera: &Camera) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
        let mut img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(width, height);

        // Fill the image with a dark gray background
        for pixel in img.pixels_mut() {
            *pixel = Rgba([20, 20, 20, 255]);
        }

        // Debug: Draw a white rectangle in the center
        for y in height / 4..3 * height / 4 {
            for x in width / 4..3 * width / 4 {
                img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }

        // Render particles
        for particle in &self.particles {
            let screen_pos = camera.world_to_screen(particle.position, width, height);
            let x = screen_pos.x.round() as i32;
            let y = screen_pos.y.round() as i32;

            if x >= 0 && x < width as i32 && y >= 0 && y < height as i32 {
                let density = self.volumetric_grid.get_density(&particle.position);
                self.draw_smoke_particle(&mut img, x, y, particle, density);
            }
        }

        // Debug: Print number of particles
        println!("Number of particles: {}", self.particles.len());

        img
    }

    fn draw_smoke_particle(
        &self,
        img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>,
        x: i32,
        y: i32,
        particle: &Particle,
        density: f32,
    ) {
        let radius = (particle.size * 5.0) as i32;
        let fade_factor = (1.0 - (particle.lifetime / particle.max_lifetime)).powf(0.5);

        for dy in -radius..=radius {
            for dx in -radius..=radius {
                let distance = ((dx * dx + dy * dy) as f64).sqrt();
                if distance <= radius as f64 {
                    let px = x + dx;
                    let py = y + dy;
                    if px >= 0 && px < img.width() as i32 && py >= 0 && py < img.height() as i32 {
                        let opacity = fade_factor
                            * (1.0 - distance / radius as f64).powf(2.0)
                            * density as f64;
                        let current_color = img.get_pixel(px as u32, py as u32);
                        let new_color = self.blend_colors(current_color, &particle.color, opacity);
                        img.put_pixel(px as u32, py as u32, new_color);
                    }
                }
            }
        }
    }

    fn blend_colors(&self, bg: &Rgba<u8>, fg: &Rgba<u8>, opacity: f64) -> Rgba<u8> {
        let alpha = (opacity * fg[3] as f64 / 255.0) as f32;
        let r = (fg[0] as f32 * alpha + bg[0] as f32 * (1.0 - alpha)) as u8;
        let g = (fg[1] as f32 * alpha + bg[1] as f32 * (1.0 - alpha)) as u8;
        let b = (fg[2] as f32 * alpha + bg[2] as f32 * (1.0 - alpha)) as u8;
        let a = (fg[3] as f32 * alpha + bg[3] as f32 * (1.0 - alpha)) as u8;
        Rgba([r, g, b, a])
    }
}

fn plot_positions(
    positions: &mut Vec<Vec<Vector3<f64>>>,
    frame_size: u32,
    snake_lens: [f64; 3],
    _init_len: usize,
    hide: &Vec<bool>,
    colors: &Vec<Vec<Rgba<u8>>>,
    frame_interval: usize,
    avoid_effects: bool,
    one_frame: bool,
) -> Vec<ImageBuffer<Rgba<u8>, Vec<u8>>> {
    let mut frames = Vec::new();
    let bounds = (5.0, 5.0, 5.0);
    let mut particle_system = ParticleSystem::new(0, bounds, colors.to_vec());
    let camera = Camera {
        position: Point3::new(0.0, 0.0, -5.0), // Moved further back
        direction: Vector3::new(0.0, 0.0, 1.0),
        up: Vector3::new(0.0, 1.0, 0.0),
        fov: 60.0f64.to_radians(),
    };

    let mut current_pos: usize = 0;
    let snake_length: usize = (snake_lens.iter().max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap()
        / frame_interval as f64) as usize;
    let _snake_end = if one_frame { positions[0].len() } else { snake_length };

    // Calculate bounds once, at the beginning
    let (min_pos, max_pos) = calculate_bounds(positions);
    let pos_range = max_pos - min_pos;

    loop {
        let bodies: Vec<Body> = positions
            .iter()
            .enumerate()
            .filter(|&(i, _)| !hide[i])
            .map(|(_i, pos)| {
                let current_pos_vec = pos[current_pos];
                let prev_pos = if current_pos > 0 { pos[current_pos - 1] } else { current_pos_vec };
                let time_elapsed = frame_interval as f64 * TIME_PER_FRAME;
                let velocity = (current_pos_vec - prev_pos) / time_elapsed;

                let acceleration = if current_pos > 1 {
                    let prev_prev_pos = pos[current_pos - 2];
                    let prev_velocity = (prev_pos - prev_prev_pos) / time_elapsed;
                    (velocity - prev_velocity) / time_elapsed
                } else {
                    Vector3::zeros()
                };

                let normalized_pos = normalize_position(current_pos_vec, &min_pos, &pos_range);
                Body {
                    mass: 100.0,
                    position: Point3::from(normalized_pos),
                    velocity: velocity,
                    acceleration: acceleration,
                }
            })
            .collect();

        particle_system.update(&bodies, frame_interval as f64 * TIME_PER_FRAME, bounds);
        let img = particle_system.render(frame_size, frame_size, &camera);

        frames.push(img);

        current_pos += frame_interval;
        if current_pos >= positions[0].len() {
            break;
        }
    }

    frames
}

fn calculate_bounds(positions: &Vec<Vec<Vector3<f64>>>) -> (Vector3<f64>, Vector3<f64>) {
    let mut min_pos = Vector3::new(f64::MAX, f64::MAX, f64::MAX);
    let mut max_pos = Vector3::new(f64::MIN, f64::MIN, f64::MIN);
    for pos_set in positions.iter() {
        for pos in pos_set.iter() {
            min_pos = min_pos.zip_map(pos, f64::min);
            max_pos = max_pos.zip_map(pos, f64::max);
        }
    }
    (min_pos, max_pos)
}

fn normalize_position(
    pos: Vector3<f64>,
    min_pos: &Vector3<f64>,
    pos_range: &Vector3<f64>,
) -> Vector3<f64> {
    (pos - min_pos).component_div(pos_range)
}

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

fn create_video_from_frames_in_memory(
    frames: &[ImageBuffer<Rgba<u8>, Vec<u8>>],
    output_file: &str,
    _frame_rate: u32, // Note: We're not using this parameter, so I've prefixed it with an underscore
) {
    let mut command = Command::new("ffmpeg");
    command
        .arg("-y")
        .arg("-f")
        .arg("image2pipe")
        .arg("-vcodec")
        .arg("png")
        .arg("-r")
        .arg("60") // 60 fps
        .arg("-s") // Specify size
        .arg("300x300") // Width x Height
        .arg("-i")
        .arg("-")
        .arg("-c:v")
        .arg("libx265") // H.265/HEVC codec
        .arg("-preset")
        .arg("medium")
        .arg("-crf")
        .arg("23")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-tag:v")
        .arg("hvc1")
        .arg("-threads")
        .arg("0")
        .arg(output_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut ffmpeg = command.spawn().expect("Failed to spawn ffmpeg process");
    let ffmpeg_stdin = ffmpeg.stdin.as_mut().expect("Failed to open ffmpeg stdin");

    for frame in frames {
        // Convert Rgba to Rgb
        let rgb_frame: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_fn(frame.width(), frame.height(), |x, y| {
                let rgba = frame.get_pixel(x, y);
                Rgb([rgba[0], rgba[1], rgba[2]])
            });

        let dyn_image = DynamicImage::ImageRgb8(rgb_frame);
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
            positions[i][step] = body.position.coords;
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
            Point3::new(rng.random_location(), rng.random_location(), 0.0),
            Vector3::new(0.0, 0.0, rng.random_velocity()),
        );
        let body2 = Body::new(
            rng.random_mass(),
            Point3::new(rng.random_location(), rng.random_location(), 0.0),
            Vector3::new(0.0, 0.0, rng.random_velocity()),
        );
        let body3 = Body::new(
            rng.random_mass(),
            Point3::new(rng.random_location(), rng.random_location(), 0.0),
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
            let positions = get_positions(bodies.to_vec(), num_steps_sim);
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
    let result = get_positions(bodies.to_vec(), num_steps_video);
    let avg_area = results_par[best_idx].1;
    let total_distance = results_par[best_idx].2;
    println!("Area: {}", avg_area);
    println!("Dist: {}", total_distance);
    result
}

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

fn main() {
    panic::set_hook(Box::new(|panic_info| {
        let backtrace = Backtrace::new();
        println!("Panic occurred: {:?}", panic_info);
        println!("Backtrace: {:?}", backtrace);
    }));
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
    /*let hide = if args.special {
        vec![false, false, false]
        //vec![true, true, true]
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
    */

    let hide = vec![false, false, false];

    let mut positions = get_best(&mut byte_stream, args.num_sims, steps, steps);

    let s: &str = args.file_name.as_str();
    let file_name = format!("vids/{}.mp4", s);
    println!("done simulating");

    let init_len: usize = 0;
    const NUM_SECONDS: usize = 5;
    let target_length = 60 * NUM_SECONDS;
    let steps_per_frame: usize = steps / target_length;

    let total_frames = steps / steps_per_frame;
    let total_particles = total_frames * PARTICLES_PER_FRAME * 3;

    let colors = get_3_colors(&mut byte_stream, total_particles, args.special);

    const FRAME_SIZE: u32 = 300;

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

        // Debug: Save the first frame
        if let Some(first_frame) = frames.first() {
            first_frame.save("debug_first_frame.png").expect("Failed to save debug frame");
        }

        create_video_from_frames_in_memory(&frames, &file_name, 60);
        println!("done creating video");
    }
}
