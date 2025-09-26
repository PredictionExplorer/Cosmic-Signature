use crate::render::constants;
use nalgebra::Vector3;
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;
use smallvec::SmallVec;

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
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
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
        min_x -= constants::BOUNDING_BOX_PADDING;
        max_x += constants::BOUNDING_BOX_PADDING;
    }
    if (max_y - min_y).abs() < 1e-12 {
        min_y -= constants::BOUNDING_BOX_PADDING;
        max_y += constants::BOUNDING_BOX_PADDING;
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
pub fn build_gaussian_kernel(radius: usize) -> SmallVec<[f64; 32]> {
    if radius == 0 {
        return SmallVec::new();
    }
    let sigma =
        (radius as f64 / constants::GAUSSIAN_SIGMA_FACTOR).max(constants::GAUSSIAN_SIGMA_MIN);
    let kernel_size = 2 * radius + 1;
    let mut kernel = SmallVec::with_capacity(kernel_size);
    let two_sigma2 = constants::GAUSSIAN_TWO_FACTOR * sigma * sigma;
    let mut sum = 0.0;
    for i in 0..kernel_size {
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
