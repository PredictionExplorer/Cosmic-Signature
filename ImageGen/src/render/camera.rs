//! Camera and projection utilities for 3D → 2D framing.
//!
//! Provides a simple look-at camera, projection modes, and depth cueing.

use nalgebra::Vector3;

use super::constants;

/// Projection model for mapping camera-space to screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectionMode {
    Perspective,
    Orthographic,
}

/// Camera configuration for framing a 3D orbit.
#[derive(Clone, Copy, Debug)]
pub struct CameraConfig {
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
    pub roll_deg: f64,
    /// Distance multiplier relative to scene radius.
    pub distance: f64,
    pub fov_y_deg: f64,
    pub projection: ProjectionMode,
    /// Padding added to the projected bounds.
    pub fit_padding: f64,
}

impl Default for CameraConfig {
    fn default() -> Self {
        Self {
            azimuth_deg: constants::DEFAULT_CAMERA_AZIMUTH_DEG,
            elevation_deg: constants::DEFAULT_CAMERA_ELEVATION_DEG,
            roll_deg: constants::DEFAULT_CAMERA_ROLL_DEG,
            distance: constants::DEFAULT_CAMERA_DISTANCE,
            fov_y_deg: constants::DEFAULT_CAMERA_FOV_DEG,
            projection: ProjectionMode::Perspective,
            fit_padding: constants::DEFAULT_CAMERA_FIT_PADDING,
        }
    }
}

/// Depth cueing controls for optional depth-based alpha modulation.
#[derive(Clone, Copy, Debug)]
pub struct DepthCueConfig {
    pub strength: f64,
    pub gamma: f64,
    pub min_scale: f64,
}

impl Default for DepthCueConfig {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_DEPTH_CUE_STRENGTH,
            gamma: constants::DEFAULT_DEPTH_CUE_GAMMA,
            min_scale: constants::DEFAULT_DEPTH_CUE_MIN_SCALE,
        }
    }
}

impl DepthCueConfig {
    /// Convert normalized depth (0 = near, 1 = far) into an alpha multiplier.
    #[inline]
    pub fn factor(&self, depth_norm: f64) -> f64 {
        if self.strength <= 0.0 {
            return 1.0;
        }
        let nearness = (1.0 - depth_norm).clamp(0.0, 1.0).powf(self.gamma.max(1e-6));
        let scaled = self.min_scale + (1.0 - self.min_scale) * nearness;
        1.0 + self.strength * (scaled - 1.0)
    }
}

/// Scene bounds derived from 3D positions.
#[derive(Clone, Copy, Debug)]
pub struct SceneBounds {
    pub min: Vector3<f64>,
    pub max: Vector3<f64>,
    pub center: Vector3<f64>,
    pub radius: f64,
}

impl SceneBounds {
    pub fn from_positions(positions: &[Vec<Vector3<f64>>]) -> Self {
        let mut min = Vector3::new(f64::INFINITY, f64::INFINITY, f64::INFINITY);
        let mut max = Vector3::new(f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);

        for body in positions {
            for p in body {
                min.x = min.x.min(p.x);
                min.y = min.y.min(p.y);
                min.z = min.z.min(p.z);
                max.x = max.x.max(p.x);
                max.y = max.y.max(p.y);
                max.z = max.z.max(p.z);
            }
        }

        if !min.x.is_finite() || !max.x.is_finite() {
            min = Vector3::new(-1.0, -1.0, -1.0);
            max = Vector3::new(1.0, 1.0, 1.0);
        }

        let center = (min + max) * 0.5;
        let extent = (max - min) * 0.5;
        let radius = extent.norm().max(1e-6);

        Self { min, max, center, radius }
    }
}

/// A look-at camera with roll support.
#[derive(Clone, Copy, Debug)]
pub struct Camera {
    origin: Vector3<f64>,
    right: Vector3<f64>,
    up: Vector3<f64>,
    forward: Vector3<f64>,
    fov_y_rad: f64,
    projection: ProjectionMode,
}

impl Camera {
    pub fn from_scene(bounds: &SceneBounds, config: CameraConfig) -> Self {
        let az = config.azimuth_deg.to_radians();
        let el = config.elevation_deg.to_radians();

        let dir = Vector3::new(az.cos() * el.cos(), az.sin() * el.cos(), el.sin());
        let distance = bounds.radius * config.distance.max(0.1) + bounds.radius;
        let origin = bounds.center + dir * distance;

        let mut up_hint = Vector3::new(0.0, 0.0, 1.0);
        let forward = (bounds.center - origin).normalize();
        if forward.cross(&up_hint).norm() < 1e-6 {
            up_hint = Vector3::new(0.0, 1.0, 0.0);
        }

        let mut right = forward.cross(&up_hint).normalize();
        let mut up = right.cross(&forward).normalize();

        let roll = config.roll_deg.to_radians();
        if roll.abs() > 1e-8 {
            let (sin_r, cos_r) = roll.sin_cos();
            let new_right = right * cos_r + up * sin_r;
            let new_up = -right * sin_r + up * cos_r;
            right = new_right.normalize();
            up = new_up.normalize();
        }

        Self {
            origin,
            right,
            up,
            forward,
            fov_y_rad: config.fov_y_deg.to_radians().max(1e-6),
            projection: config.projection,
        }
    }

    #[inline]
    pub fn world_to_camera(&self, p: Vector3<f64>) -> Vector3<f64> {
        let rel = p - self.origin;
        Vector3::new(rel.dot(&self.right), rel.dot(&self.up), rel.dot(&self.forward))
    }

    /// Project camera-space point to a 2D plane + depth.
    #[inline]
    pub fn project(&self, cam: Vector3<f64>) -> (f64, f64, f64) {
        match self.projection {
            ProjectionMode::Perspective => {
                let depth = cam.z.max(constants::DEFAULT_CAMERA_NEAR_CLIP);
                let scale = 1.0 / (self.fov_y_rad * 0.5).tan();
                (cam.x * scale / depth, cam.y * scale / depth, depth)
            }
            ProjectionMode::Orthographic => (cam.x, cam.y, cam.z),
        }
    }
}
