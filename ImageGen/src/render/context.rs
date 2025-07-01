//! Rendering context and configuration

use nalgebra::Vector3;

/// Rendering configuration parameters
pub struct RenderConfig {
    /// High dynamic range scale factor  
    pub hdr_scale: f64,
    /// Alpha compression factor to reduce overdraw saturation
    /// Higher values reduce alpha more aggressively in dense areas
    pub alpha_compress: f64,
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self {
            hdr_scale: 1.0,
            alpha_compress: 0.0,
        }
    }
}

/// Main rendering context
pub struct RenderContext {
    /// Image width
    pub width: u32,
    /// Image height  
    pub height: u32,
    /// Total pixel count
    pixel_count: usize,
    /// Bounding box for coordinate transformation
    bounds: BoundingBox,
}

struct BoundingBox {
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
}

impl RenderContext {
    /// Create a new render context from positions
    pub fn new(width: u32, height: u32, positions: &[Vec<Vector3<f64>>]) -> Self {
        let pixel_count = (width as usize) * (height as usize);
        let bounds = calculate_bounds(positions);
        
        Self {
            width,
            height,
            pixel_count,
            bounds,
        }
    }
    
    /// Get total pixel count
    pub fn pixel_count(&self) -> usize {
        self.pixel_count
    }
    
    /// Convert world coordinates to pixel coordinates
    pub fn to_pixel(&self, x: f64, y: f64) -> (f32, f32) {
        let norm_x = (x - self.bounds.min_x) / (self.bounds.max_x - self.bounds.min_x);
        let norm_y = (y - self.bounds.min_y) / (self.bounds.max_y - self.bounds.min_y);
        
        let px = norm_x * (self.width as f64 - 1.0);
        let py = (1.0 - norm_y) * (self.height as f64 - 1.0); // Flip Y
        
        (px as f32, py as f32)
    }
}

/// Calculate bounding box from positions
fn calculate_bounds(positions: &[Vec<Vector3<f64>>]) -> BoundingBox {
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    
    for body_positions in positions {
        for pos in body_positions {
            min_x = min_x.min(pos[0]);
            max_x = max_x.max(pos[0]);
            min_y = min_y.min(pos[1]);
            max_y = max_y.max(pos[1]);
        }
    }
    
    // Add 10% margin
    let margin_x = (max_x - min_x) * 0.1;
    let margin_y = (max_y - min_y) * 0.1;
    
    BoundingBox {
        min_x: min_x - margin_x,
        max_x: max_x + margin_x,
        min_y: min_y - margin_y,
        max_y: max_y + margin_y,
    }
} 