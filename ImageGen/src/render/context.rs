//! Common rendering context and utilities
//!
//! This module provides the core rendering context that manages coordinate transformations
//! and pixel operations, as well as utilities for iterating through animation frames.

use crate::render::camera::{Camera, CameraConfig, DepthCueConfig, SceneBounds};
use crate::render::color::OklabColor;
use crate::render::constants;
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
    bounds: ProjectedBounds,
    camera: Camera,
    depth_cue: DepthCueConfig,
}

impl RenderContext {
    /// Creates a new render context from position data
    pub fn new(
        width: u32,
        height: u32,
        positions: &[Vec<Vector3<f64>>],
        camera_config: CameraConfig,
        depth_cue: DepthCueConfig,
    ) -> Self {
        let scene = SceneBounds::from_positions(positions);
        let camera = Camera::from_scene(&scene, camera_config);
        let bounds =
            ProjectedBounds::from_positions(positions, &camera, width, height, camera_config.fit_padding);

        Self {
            width,
            height,
            width_usize: width as usize,
            height_usize: height as usize,
            width_i32: width as i32,
            height_i32: height as i32,
            bounds,
            camera,
            depth_cue,
        }
    }

    /// Convert world coordinates to pixel coordinates
    #[inline]
    pub fn to_pixel(&self, x: f64, y: f64, z: f64) -> (f32, f32, f64) {
        let cam = self.camera.world_to_camera(Vector3::new(x, y, z));
        let (px, py, depth) = self.camera.project(cam);
        let (nx, ny) = self.bounds.normalize(px, py);
        let depth_norm = self.bounds.normalize_depth(depth);
        let depth_factor = self.depth_cue.factor(depth_norm);
        let pixel_x = nx * self.width as f64;
        let pixel_y = ny * self.height as f64;
        (pixel_x as f32, pixel_y as f32, depth_factor)
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

/// Projected bounds for coordinate transformations
#[derive(Clone, Copy, Debug)]
pub struct ProjectedBounds {
    pub min_x: f64,
    #[allow(dead_code)]
    pub max_x: f64,
    pub min_y: f64,
    #[allow(dead_code)]
    pub max_y: f64,
    pub width: f64,
    pub height: f64,
    pub min_depth: f64,
    pub max_depth: f64,
}

impl ProjectedBounds {
    /// Create bounds from projected positions.
    pub fn from_positions(
        positions: &[Vec<Vector3<f64>>],
        camera: &Camera,
        width: u32,
        height: u32,
        padding: f64,
    ) -> Self {
        let mut min_x = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        let mut min_depth = f64::INFINITY;
        let mut max_depth = f64::NEG_INFINITY;

        for body in positions {
            for p in body {
                let cam = camera.world_to_camera(*p);
                let (px, py, depth) = camera.project(cam);
                if !px.is_finite() || !py.is_finite() || !depth.is_finite() {
                    continue;
                }
                min_x = min_x.min(px);
                max_x = max_x.max(px);
                min_y = min_y.min(py);
                max_y = max_y.max(py);
                min_depth = min_depth.min(depth);
                max_depth = max_depth.max(depth);
            }
        }

        if !min_x.is_finite() || !max_x.is_finite() {
            min_x = -1.0;
            max_x = 1.0;
            min_y = -1.0;
            max_y = 1.0;
            min_depth = 0.0;
            max_depth = 1.0;
        }

        let pad = padding.max(0.0);
        let pad_x = (max_x - min_x).abs() * pad;
        let pad_y = (max_y - min_y).abs() * pad;
        min_x -= pad_x;
        max_x += pad_x;
        min_y -= pad_y;
        max_y += pad_y;

        let mut width_proj = (max_x - min_x).max(1e-12);
        let mut height_proj = (max_y - min_y).max(1e-12);
        let aspect = width as f64 / height as f64;

        let bounds_aspect = width_proj / height_proj;
        if bounds_aspect > aspect {
            let new_height = width_proj / aspect;
            let delta = (new_height - height_proj) * 0.5;
            min_y -= delta;
            max_y += delta;
            height_proj = (max_y - min_y).max(1e-12);
        } else {
            let new_width = height_proj * aspect;
            let delta = (new_width - width_proj) * 0.5;
            min_x -= delta;
            max_x += delta;
            width_proj = (max_x - min_x).max(1e-12);
        }

        if (max_depth - min_depth).abs() < constants::FLOAT_EPSILON {
            min_depth -= 1.0;
            max_depth += 1.0;
        }

        Self {
            min_x,
            max_x,
            min_y,
            max_y,
            width: width_proj,
            height: height_proj,
            min_depth,
            max_depth,
        }
    }

    /// Convert world coordinates to normalized coordinates (0..1)
    #[inline]
    pub fn normalize(&self, x: f64, y: f64) -> (f64, f64) {
        let nx = (x - self.min_x) / self.width;
        let ny = (y - self.min_y) / self.height;
        (nx, ny)
    }

    /// Convert depth to normalized range (0..1)
    #[inline]
    #[allow(clippy::wrong_self_convention)]
    pub fn normalize_depth(&self, depth: f64) -> f64 {
        let range = (self.max_depth - self.min_depth).max(1e-12);
        ((depth - self.min_depth) / range).clamp(0.0, 1.0)
    }
}

/// Data for a single frame iteration
#[allow(dead_code)]
pub struct FrameData {
    pub step: usize,
    pub is_frame_boundary: bool,
    pub is_final: bool,
    pub positions: [(f64, f64); 3],
    pub depth_factors: [f64; 3],
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

            let (x0, y0, d0) = self.to_pixel(p0[0], p0[1], p0[2]);
            let (x1, y1, d1) = self.to_pixel(p1[0], p1[1], p1[2]);
            let (x2, y2, d2) = self.to_pixel(p2[0], p2[1], p2[2]);

            let is_frame_boundary = step > 0 && step % frame_interval == 0;
            let is_final = step == total_steps - 1;

            let frame_data = FrameData {
                step,
                is_frame_boundary,
                is_final,
                positions: [(x0 as f64, y0 as f64), (x1 as f64, y1 as f64), (x2 as f64, y2 as f64)],
                depth_factors: [d0, d1, d2],
                colors: [colors[0][step], colors[1][step], colors[2][step]],
                alphas: [body_alphas[0], body_alphas[1], body_alphas[2]],
            };

            callback(frame_data)?;
        }

        Ok(())
    }
}
