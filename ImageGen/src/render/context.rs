//! Rendering context and configuration

use nalgebra::Vector3;

/// Rendering configuration parameters
#[derive(Clone, Copy, Debug)]
pub struct RenderConfig {
    /// Alpha compression factor (reserved for future use)
    #[allow(dead_code)] // TODO: Implement alpha compression in render passes
    pub alpha_compress: f64,
    /// HDR scale factor for brightness
    pub hdr_scale: f64,
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self {
            alpha_compress: 0.0,
            hdr_scale: 1.0,
        }
    }
}

/// Encapsulates common rendering operations and coordinate transformations
pub struct RenderContext {
    pub width: u32,
    pub height: u32,
    pub width_usize: usize,
    pub height_usize: usize,
    bounds: BoundingBox,
}

/// Bounding box for coordinate transformations
#[derive(Clone, Copy, Debug)]
struct BoundingBox {
    min_x: f64,
    min_y: f64,
    width: f64,
    height: f64,
}

impl RenderContext {
    /// Creates a new render context from position data
    pub fn new(width: u32, height: u32, positions: &[Vec<Vector3<f64>>]) -> Self {
        let (min_x, max_x, min_y, max_y) = crate::utils::bounding_box(positions);
        let bounds = BoundingBox {
            min_x,
            min_y,
            width: (max_x - min_x).max(1e-12),
            height: (max_y - min_y).max(1e-12),
        };
        
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
        let px = ((x - self.bounds.min_x) / self.bounds.width) * (self.width as f64);
        let py = ((y - self.bounds.min_y) / self.bounds.height) * (self.height as f64);
        (px as f32, py as f32)
    }
    
    /// Get total pixel count
    #[inline]
    pub fn pixel_count(&self) -> usize {
        self.width_usize * self.height_usize
    }
    

}

/// Context for optimized plot operations
pub struct PlotContext {
    pub width_i32: i32,
    pub height_i32: i32,
    pub width_usize: usize,
}

impl PlotContext {
    /// Create a new plot context
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width_i32: width as i32,
            height_i32: height as i32,
            width_usize: width as usize,
        }
    }
} 