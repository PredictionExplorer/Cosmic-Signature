use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use nalgebra::Vector3;
use std::f64::{INFINITY, NEG_INFINITY};

/// Compute Fourier transform of a real-valued signal
pub fn fourier_transform(input: &[f64]) -> Vec<Complex<f64>> {
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(input.len());
    let mut data: Vec<_> = input.iter().map(|&x| Complex::new(x, 0.0)).collect();
    fft.process(&mut data);
    data
}

/// 2D bounding box: (min_x, max_x, min_y, max_y)
pub fn bounding_box_2d(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let mut min_x = INFINITY;
    let mut max_x = NEG_INFINITY;
    let mut min_y = INFINITY;
    let mut max_y = NEG_INFINITY;
    for body in positions {
        for p in body {
            min_x = min_x.min(p[0]);
            max_x = max_x.max(p[0]);
            min_y = min_y.min(p[1]);
            max_y = max_y.max(p[1]);
        }
    }
    (min_x, max_x, min_y, max_y)
}

/// 2D bounding box with padding, always non-degenerate
pub fn bounding_box(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64, f64) {
    let (mut min_x, mut max_x, mut min_y, mut max_y) = bounding_box_2d(positions);
    if (max_x - min_x).abs() < 1e-12 {
        min_x -= 0.5;
        max_x += 0.5;
    }
    if (max_y - min_y).abs() < 1e-12 {
        min_y -= 0.5;
        max_y += 0.5;
    }
    let wx = max_x - min_x;
    let wy = max_y - min_y;
    min_x -= 0.05 * wx;
    max_x += 0.05 * wx;
    min_y -= 0.05 * wy;
    max_y += 0.05 * wy;
    (min_x, max_x, min_y, max_y)
}

/// Build a simple 1D Gaussian kernel
pub fn build_gaussian_kernel(radius: usize) -> Vec<f64> {
    if radius == 0 {
        return Vec::new();
    }
    let sigma = (radius as f64 / 3.0).max(1.0);
    let mut kernel = Vec::with_capacity(2 * radius + 1);
    let two_sigma2 = 2.0 * sigma * sigma;
    let mut sum = 0.0;
    for i in 0..(2 * radius + 1) {
        let x = i as f64 - radius as f64;
        let val = (-x * x / two_sigma2).exp();
        kernel.push(val);
        sum += val;
    }
    for v in &mut kernel {
        *v /= sum;
    }
    kernel
}
