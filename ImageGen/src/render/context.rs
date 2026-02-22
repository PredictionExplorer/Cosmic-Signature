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
    pub fn new(width: u32, height: u32, positions: &[Vec<Vector3<f64>>], aspect_correction: bool) -> Self {
        let mut bounds = BoundingBox::from_positions(positions);
        if aspect_correction {
            bounds.apply_aspect_correction(width, height);
        }

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

    /// Pad the bounding box so its aspect ratio matches the target output dimensions.
    /// This prevents orbit distortion (stretching) when the orbit shape doesn't
    /// match the output aspect ratio.
    pub fn apply_aspect_correction(&mut self, target_width: u32, target_height: u32) {
        if target_height == 0 || self.height < 1e-12 {
            return;
        }
        let target_ar = target_width as f64 / target_height as f64;
        let bbox_ar = self.width / self.height;

        if bbox_ar < target_ar {
            let new_width = self.height * target_ar;
            let pad = (new_width - self.width) * 0.5;
            self.min_x -= pad;
            self.max_x += pad;
            self.width = new_width;
        } else if bbox_ar > target_ar {
            let new_height = self.width / target_ar;
            let pad = (new_height - self.height) * 0.5;
            self.min_y -= pad;
            self.max_y += pad;
            self.height = new_height;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_positions(points: &[(f64, f64)]) -> Vec<Vec<Vector3<f64>>> {
        (0..3).map(|_| {
            points.iter().map(|&(x, y)| Vector3::new(x, y, 0.0)).collect()
        }).collect()
    }

    #[test]
    fn test_bounding_box_from_positions() {
        let positions = make_positions(&[(0.0, 0.0), (10.0, 5.0)]);
        let bbox = BoundingBox::from_positions(&positions);
        assert!(bbox.min_x < 0.0);
        assert!(bbox.max_x > 10.0);
        assert!(bbox.width > 10.0);
        assert!(bbox.height > 5.0);
    }

    #[test]
    fn test_world_to_pixel_corners() {
        let positions = make_positions(&[(0.0, 0.0), (100.0, 100.0)]);
        let bbox = BoundingBox::from_positions(&positions);
        let (px, py) = bbox.world_to_pixel(bbox.min_x, bbox.min_y, 1920, 1080);
        assert!(px.abs() < 1.0, "top-left should map near pixel (0,0)");
        assert!(py.abs() < 1.0, "top-left should map near pixel (0,0)");
    }

    #[test]
    fn test_normalize_center() {
        let positions = make_positions(&[(0.0, 0.0), (10.0, 10.0)]);
        let bbox = BoundingBox::from_positions(&positions);
        let cx = (bbox.min_x + bbox.max_x) / 2.0;
        let cy = (bbox.min_y + bbox.max_y) / 2.0;
        let (nx, ny) = bbox.normalize(cx, cy);
        assert!((nx - 0.5).abs() < 0.01, "center should normalize to ~0.5");
        assert!((ny - 0.5).abs() < 0.01, "center should normalize to ~0.5");
    }

    #[test]
    fn test_aspect_correction_wide_orbit() {
        let mut bbox = BoundingBox {
            min_x: 0.0, max_x: 100.0, min_y: 0.0, max_y: 50.0,
            width: 100.0, height: 50.0,
        };
        bbox.apply_aspect_correction(1920, 1080);
        let ar = bbox.width / bbox.height;
        let target_ar = 1920.0 / 1080.0;
        assert!((ar - target_ar).abs() < 0.01,
            "corrected AR {:.3} should match target {:.3}", ar, target_ar);
        assert!((bbox.width - 100.0).abs() < 0.01);
        assert!(bbox.height > 50.0);
    }

    #[test]
    fn test_aspect_correction_tall_orbit() {
        let mut bbox = BoundingBox {
            min_x: 0.0, max_x: 50.0, min_y: 0.0, max_y: 100.0,
            width: 50.0, height: 100.0,
        };
        bbox.apply_aspect_correction(1920, 1080);
        let ar = bbox.width / bbox.height;
        let target_ar = 1920.0 / 1080.0;
        assert!((ar - target_ar).abs() < 0.01,
            "corrected AR {:.3} should match target {:.3}", ar, target_ar);
        assert!((bbox.height - 100.0).abs() < 0.01);
        assert!(bbox.width > 50.0);
    }

    #[test]
    fn test_aspect_correction_already_matching() {
        let mut bbox = BoundingBox {
            min_x: 0.0, max_x: 160.0, min_y: 0.0, max_y: 90.0,
            width: 160.0, height: 90.0,
        };
        let orig_width = bbox.width;
        let orig_height = bbox.height;
        bbox.apply_aspect_correction(1920, 1080);
        assert!((bbox.width - orig_width).abs() < 0.01, "should not change matching bbox");
        assert!((bbox.height - orig_height).abs() < 0.01, "should not change matching bbox");
    }

    #[test]
    fn test_aspect_correction_centers_padding() {
        let mut bbox = BoundingBox {
            min_x: 10.0, max_x: 110.0, min_y: 20.0, max_y: 70.0,
            width: 100.0, height: 50.0,
        };
        let cy_before = (bbox.min_y + bbox.max_y) / 2.0;
        bbox.apply_aspect_correction(1920, 1080);
        let cy_after = (bbox.min_y + bbox.max_y) / 2.0;
        assert!((cy_before - cy_after).abs() < 0.01, "center Y should be preserved");
    }

    #[test]
    fn test_aspect_correction_zero_height() {
        let mut bbox = BoundingBox {
            min_x: 0.0, max_x: 100.0, min_y: 50.0, max_y: 50.0,
            width: 100.0, height: 0.0,
        };
        bbox.apply_aspect_correction(1920, 1080);
        assert!(bbox.width.is_finite());
        assert!(bbox.height.is_finite());
    }

    #[test]
    fn test_render_context_with_aspect_correction() {
        let positions = make_positions(&[(0.0, 0.0), (100.0, 50.0)]);
        let ctx = RenderContext::new(1920, 1080, &positions, true);
        let ar = ctx.bounds().width / ctx.bounds().height;
        let target_ar = 1920.0 / 1080.0;
        assert!((ar - target_ar).abs() < 0.05,
            "aspect-corrected context AR {:.3} should be near {:.3}", ar, target_ar);
    }

    #[test]
    fn test_render_context_without_aspect_correction() {
        let positions = make_positions(&[(0.0, 0.0), (100.0, 50.0)]);
        let ctx = RenderContext::new(1920, 1080, &positions, false);
        let ar = ctx.bounds().width / ctx.bounds().height;
        assert!(ar > 1.5, "uncorrected AR should reflect orbit shape");
    }

    #[test]
    fn test_pixel_count() {
        let positions = make_positions(&[(0.0, 0.0), (10.0, 10.0)]);
        let ctx = RenderContext::new(1920, 1080, &positions, false);
        assert_eq!(ctx.pixel_count(), 1920 * 1080);
    }
}
