//! Common rendering context and utilities
//!
//! This module provides the core rendering context that manages coordinate transformations
//! and pixel operations, as well as utilities for iterating through animation frames.

use nalgebra::Vector3;

/// Type alias for pixel buffer - RGBA premultiplied
pub type PixelBuffer = Vec<(f64, f64, f64, f64)>;

/// Encapsulates common rendering operations and coordinate transformations
pub struct RenderContext {
    pub width: u32,
    pub height: u32,
    pub width_usize: usize,
    pub height_usize: usize,
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
            bounds,
        }
    }

    /// Convert world coordinates to pixel coordinates
    #[inline]
    pub fn to_pixel(&self, x: f64, y: f64) -> (f32, f32) {
        self.bounds.world_to_pixel(x, y, self.width, self.height)
    }

    /// Get total pixel count
    #[inline]
    pub fn pixel_count(&self) -> usize {
        self.width_usize * self.height_usize
    }
    
    /// Get the bounding box used for coordinate transformations
    #[inline]
    pub fn bounds(&self) -> &BoundingBox {
        &self.bounds
    }

}

/// Bounding box for coordinate transformations
#[derive(Clone, Copy, Debug)]
pub struct BoundingBox {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
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

    /// Convert world coordinates to normalized coordinates (0..1)
    #[inline]
    pub fn normalize(&self, x: f64, y: f64) -> (f64, f64) {
        let nx = (x - self.min_x) / self.width;
        let ny = (y - self.min_y) / self.height;
        (nx, ny)
    }

    /// Convert world coordinates to pixel coordinates
    #[inline]
    pub fn world_to_pixel(&self, x: f64, y: f64, width: u32, height: u32) -> (f32, f32) {
        let (nx, ny) = self.normalize(x, y);
        let px = nx * (width as f64);
        let py = ny * (height as f64);
        (px as f32, py as f32)
    }
}

