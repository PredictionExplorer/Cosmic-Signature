//! Common rendering context and utilities
//!
//! This module provides the core rendering context that manages coordinate transformations
//! and pixel operations, as well as utilities for iterating through animation frames.

use crate::render::color::OklabColor;
use crate::render::error::Result;
use nalgebra::Vector3;

/// Type alias for pixel buffer - RGBA premultiplied
pub type PixelBuffer = Vec<(f64, f64, f64, f64)>;

/// Encapsulates common rendering operations and coordinate transformations
pub struct RenderContext {
    pub width: u32,
    pub height: u32,
    pub width_usize: usize,
    pub height_usize: usize,
    #[allow(dead_code)]
    pub width_i32: i32,
    #[allow(dead_code)]
    pub height_i32: i32,
    bounds: BoundingBox,
}

impl RenderContext {
    /// Creates a new render context from position data
    pub fn new(width: u32, height: u32, positions: &[Vec<Vector3<f64>>]) -> Self {
        let bounds = BoundingBox::from_positions(positions);

        Self {
            width,
            height,
            width_usize: width as usize,
            height_usize: height as usize,
            width_i32: width as i32,
            height_i32: height as i32,
            bounds,
        }
    }

    /// Convert world coordinates to pixel coordinates
    #[inline]
    pub fn to_pixel(&self, x: f64, y: f64) -> (f32, f32) {
        self.bounds.to_pixel(x, y, self.width, self.height)
    }

    /// Get total pixel count
    #[inline]
    pub fn pixel_count(&self) -> usize {
        self.width_usize * self.height_usize
    }

    /// Check if pixel coordinates are in bounds
    #[inline]
    #[allow(dead_code)]
    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && x < self.width_i32 && y >= 0 && y < self.height_i32
    }

    /// Get linear index from 2D coordinates
    #[inline]
    #[allow(dead_code)]
    pub fn pixel_index(&self, x: i32, y: i32) -> usize {
        (y as usize * self.width_usize) + x as usize
    }
}

/// Bounding box for coordinate transformations
#[derive(Clone, Copy, Debug)]
pub struct BoundingBox {
    pub min_x: f64,
    #[allow(dead_code)]
    pub max_x: f64,
    pub min_y: f64,
    #[allow(dead_code)]
    pub max_y: f64,
    pub width: f64,
    pub height: f64,
}

impl BoundingBox {
    /// Create a new bounding box from position data
    pub fn from_positions(positions: &[Vec<Vector3<f64>>]) -> Self {
        let (min_x, max_x, min_y, max_y) = crate::utils::bounding_box(positions);
        Self {
            min_x,
            max_x,
            min_y,
            max_y,
            width: (max_x - min_x).max(1e-12),
            height: (max_y - min_y).max(1e-12),
        }
    }

    /// Create a bounding box from explicit bounds
    #[allow(dead_code)]
    pub fn new(min_x: f64, max_x: f64, min_y: f64, max_y: f64) -> Self {
        Self {
            min_x,
            max_x,
            min_y,
            max_y,
            width: (max_x - min_x).max(1e-12),
            height: (max_y - min_y).max(1e-12),
        }
    }

    /// Convert world coordinates to normalized coordinates (0..1)
    #[inline]
    pub fn normalize(&self, x: f64, y: f64) -> (f64, f64) {
        let nx = (x - self.min_x) / self.width;
        let ny = (y - self.min_y) / self.height;
        (nx, ny)
    }

    /// Convert world coordinates to pixel coordinates
    #[inline]
    #[allow(clippy::wrong_self_convention)]
    pub fn to_pixel(&self, x: f64, y: f64, width: u32, height: u32) -> (f32, f32) {
        let (nx, ny) = self.normalize(x, y);
        let px = nx * (width as f64);
        let py = ny * (height as f64);
        (px as f32, py as f32)
    }
}

/// Data for a single frame iteration
#[allow(dead_code)]
pub struct FrameData {
    pub step: usize,
    pub is_frame_boundary: bool,
    pub is_final: bool,
    pub positions: [(f64, f64); 3],
    pub colors: [OklabColor; 3],
    pub alphas: [f64; 3],
}

/// Common frame iteration logic
#[allow(dead_code)]
pub trait FrameIterator {
    /// Iterate through frames with a callback
    fn iterate_frames<F>(
        &self,
        positions: &[Vec<Vector3<f64>>],
        colors: &[Vec<OklabColor>],
        body_alphas: &[f64],
        frame_interval: usize,
        callback: F,
    ) -> Result<()>
    where
        F: FnMut(FrameData) -> Result<()>;
}

#[allow(dead_code)]
impl FrameIterator for RenderContext {
    fn iterate_frames<F>(
        &self,
        positions: &[Vec<Vector3<f64>>],
        colors: &[Vec<OklabColor>],
        body_alphas: &[f64],
        frame_interval: usize,
        mut callback: F,
    ) -> Result<()>
    where
        F: FnMut(FrameData) -> Result<()>,
    {
        let total_steps = positions[0].len();

        for step in 0..total_steps {
            let p0 = positions[0][step];
            let p1 = positions[1][step];
            let p2 = positions[2][step];

            let (x0, y0) = self.to_pixel(p0[0], p0[1]);
            let (x1, y1) = self.to_pixel(p1[0], p1[1]);
            let (x2, y2) = self.to_pixel(p2[0], p2[1]);

            let is_frame_boundary = step > 0 && step % frame_interval == 0;
            let is_final = step == total_steps - 1;

            let frame_data = FrameData {
                step,
                is_frame_boundary,
                is_final,
                positions: [(x0 as f64, y0 as f64), (x1 as f64, y1 as f64), (x2 as f64, y2 as f64)],
                colors: [colors[0][step], colors[1][step], colors[2][step]],
                alphas: [body_alphas[0], body_alphas[1], body_alphas[2]],
            };

            callback(frame_data)?;
        }

        Ok(())
    }
}
