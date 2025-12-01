//! Refractive caustics effect for glass/crystal simulation.
//!
//! This effect transforms the image into a refractive medium.
//! 1. Refraction: Displaces background pixels based on local gradients (normals).
//! 2. Caustics: Accumulates light intensity where refractive rays converge, creating sharp, realistic highlights.
//! 3. Chromatic Aberration: Splits the refractive rays for a realistic glass look.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for refractive caustics
#[derive(Clone, Debug)]
pub struct RefractiveCausticsConfig {
    /// Strength of the refraction distortion (0.0-1.0)
    pub strength: f64,
    /// Scale of the refraction (unused but kept for compatibility/future)
    pub scale: f64,
    /// Amount of chromatic aberration (RGB spread) in refraction
    pub chromatic_aberration: f64,
    /// Brightness multiplier for caustics
    pub brightness: f64,
    /// Threshold for applying effects
    pub threshold: f64,
    /// Focus sharpness of the caustics (higher = sharper lines)
    pub focus_sharpness: f64,
    /// Angle of the virtual light source for caustics
    pub light_angle: f64,
}

impl Default for RefractiveCausticsConfig {
    fn default() -> Self {
        Self::special_mode()
    }
}

impl RefractiveCausticsConfig {
    pub fn special_mode() -> Self {
        Self {
            strength: 0.015,
            scale: 1.0,
            chromatic_aberration: 0.005,
            brightness: 1.2,
            threshold: 0.1,
            focus_sharpness: 15.0,
            light_angle: 45.0,
        }
    }
}

pub struct RefractiveCaustics {
    config: RefractiveCausticsConfig,
    enabled: bool,
}

impl RefractiveCaustics {
    pub fn new(config: RefractiveCausticsConfig) -> Self {
        let enabled = config.strength > 0.0 || config.brightness > 0.0;
        Self { config, enabled }
    }

    /// Calculate normal map from luminance gradients using Sobel operator
    fn generate_normal_map(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Vec<(f64, f64)> {
        input
            .par_iter()
            .enumerate()
            .map(|(idx, _)| {
                let x = idx % width;
                let y = idx / width;

                if x == 0 || x == width - 1 || y == 0 || y == height - 1 {
                    return (0.0, 0.0);
                }

                // Sample luminance neighborhood
                let get_lum = |dx: i32, dy: i32| {
                    let nx = (x as i32 + dx) as usize;
                    let ny = (y as i32 + dy) as usize;
                    let (r, g, b, a) = input[ny * width + nx];
                    if a <= 0.0 { 0.0 } else { 0.2126 * r + 0.7152 * g + 0.0722 * b }
                };

                // Sobel X
                let gx = -get_lum(-1, -1) - 2.0 * get_lum(-1, 0) - get_lum(-1, 1)
                    + get_lum(1, -1)
                    + 2.0 * get_lum(1, 0)
                    + get_lum(1, 1);

                // Sobel Y
                let gy = -get_lum(-1, -1) - 2.0 * get_lum(0, -1) - get_lum(1, -1)
                    + get_lum(-1, 1)
                    + 2.0 * get_lum(0, 1)
                    + get_lum(1, 1);

                (gx, gy)
            })
            .collect()
    }

    /// Sample pixel with bounds checking and bilinear interpolation
    fn sample_bilinear(
        &self,
        buffer: &PixelBuffer,
        width: usize,
        height: usize,
        x: f64,
        y: f64,
    ) -> (f64, f64, f64, f64) {
        let x = x.clamp(0.0, (width - 1) as f64);
        let y = y.clamp(0.0, (height - 1) as f64);

        let x0 = x.floor() as usize;
        let y0 = y.floor() as usize;
        let x1 = (x0 + 1).min(width - 1);
        let y1 = (y0 + 1).min(height - 1);

        let fx = x - x0 as f64;
        let fy = y - y0 as f64;

        let idx00 = y0 * width + x0;
        let idx01 = y0 * width + x1;
        let idx10 = y1 * width + x0;
        let idx11 = y1 * width + x1;

        let p00 = buffer[idx00];
        let p01 = buffer[idx01];
        let p10 = buffer[idx10];
        let p11 = buffer[idx11];

        let interpolate = |v00: f64, v01: f64, v10: f64, v11: f64| {
            let top = v00 * (1.0 - fx) + v01 * fx;
            let bot = v10 * (1.0 - fx) + v11 * fx;
            top * (1.0 - fy) + bot * fy
        };

        (
            interpolate(p00.0, p01.0, p10.0, p11.0),
            interpolate(p00.1, p01.1, p10.1, p11.1),
            interpolate(p00.2, p01.2, p10.2, p11.2),
            interpolate(p00.3, p01.3, p10.3, p11.3),
        )
    }
}

impl PostEffect for RefractiveCaustics {
    fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if !self.is_enabled() {
            return Ok(input.clone());
        }

        // 1. Generate Normals
        let normals = self.generate_normal_map(input, width, height);

        // 2. Caustic Map Generation (Accumulation)
        // We map *forward* from source pixels to target pixels based on the lens effect of the normal.
        // Pixels that map to the same spot create brightness (convergence).
        let light_rad = self.config.light_angle.to_radians();
        let _lx = light_rad.cos();
        let _ly = light_rad.sin();
        let focus_dist = self.config.focus_sharpness;

        // Use a thread-safe accumulation buffer
        // We use a flat Vec<f64> wrapped in Mutex chunks or atomic floats would be better,
        // but for simplicity and safety in Rayon, we can compute local caustic intensity using Jacobian determinant
        // which is purely local and doesn't require scatter-write accumulation.

        // Jacobian Determinant Method for Caustics (Local, Parallel-friendly)
        // Map M(x,y) = (x,y) + D(x,y) where D is displacement based on normal
        // Intensity ~ 1 / det(Jacobian(M))
        let caustic_map: Vec<f64> = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let x = idx % width;
                let y = idx / width;

                if x < 1 || x >= width - 1 || y < 1 || y >= height - 1 {
                    return 0.0;
                }

                // Displacement field D(x,y) = normal * focus_dist
                let get_disp = |nx: usize, ny: usize| {
                    let (gx, gy) = normals[ny * width + nx];
                    // Project normal onto light plane for directional caustics
                    // Or just use magnitude for general focus
                    (gx * focus_dist, gy * focus_dist)
                };

                // Calculate derivatives of the mapping (x+dx, y+dy)
                let (d00_x, d00_y) = get_disp(x, y);
                let (d10_x, d10_y) = get_disp(x + 1, y);
                let (d01_x, d01_y) = get_disp(x, y + 1);

                // Jacobian of M(x,y)
                // J = [ 1 + d(dx)/dx   d(dx)/dy ]
                //     [ d(dy)/dx       1 + d(dy)/dy ]

                let d_dx_dx = d10_x - d00_x;
                let d_dx_dy = d01_x - d00_x;
                let d_dy_dx = d10_y - d00_y;
                let d_dy_dy = d01_y - d00_y;

                let j11 = 1.0 + d_dx_dx;
                let j12 = d_dx_dy;
                let j21 = d_dy_dx;
                let j22 = 1.0 + d_dy_dy;

                let det = j11 * j22 - j12 * j21;

                // Intensity is inverse of area change.
                // If det < 1, area shrinks -> brighter.
                // If det -> 0, caustic singularity.

                if det.abs() < 0.001 {
                    5.0 // Clamp singularities
                } else {
                    (1.0 / det.abs()).clamp(0.0, 5.0) - 1.0 // Subtract 1.0 base brightness
                }
                .max(0.0)
            })
            .collect();

        // 3. Refraction + Composition
        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if lum < self.config.threshold {
                    return (r, g, b, a);
                }

                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                // Refraction vector
                let (nx, ny) = normals[idx];
                // Scale refraction by image brightness (thicker glass = more refr?)
                // Actually just use strength and scale
                let ref_scale = self.config.strength * 100.0 * self.config.scale; // Scale up for visibility

                let dx = nx * ref_scale;
                let dy = ny * ref_scale;

                // Chromatic Aberration: Sample RGB at different offsets
                let aberr = self.config.chromatic_aberration * 100.0;

                // R: +offset
                let (rr, _, _, _) = self.sample_bilinear(
                    input,
                    width,
                    height,
                    x + dx * (1.0 + aberr),
                    y + dy * (1.0 + aberr),
                );
                // G: center
                let (_, gg, _, _) = self.sample_bilinear(input, width, height, x + dx, y + dy);
                // B: -offset
                let (_, _, bb, _) = self.sample_bilinear(
                    input,
                    width,
                    height,
                    x + dx * (1.0 - aberr),
                    y + dy * (1.0 - aberr),
                );

                // Mix original and refracted based on alpha/density?
                // If it's "glass", we see the refracted background OR the refracted self.
                // Here we assume the input is the "object" and we are refracting "through" it.
                // Since we are in 2D, this basically warps the image.

                // Add Caustics
                let caustic_val = caustic_map[idx] * self.config.brightness; // Use brightness as caustic strength

                // Combine: Refracted Image + Caustic Highlights
                // If alpha is low, we see background (black/nebula).
                // If alpha is high, we see refracted texture.

                let final_r = rr + caustic_val;
                let final_g = gg + caustic_val;
                let final_b = bb + caustic_val;

                // Preserve original alpha, maybe boost it for caustics
                let final_a = (a + caustic_val).min(1.0);

                (final_r, final_g, final_b, final_a)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_buffer(w: usize, h: usize, value: f64) -> PixelBuffer {
        vec![(value, value, value, 1.0); w * h]
    }

    #[test]
    fn test_refractive_caustics_basic() {
        let config = RefractiveCausticsConfig::default();
        let caustics = RefractiveCaustics::new(config);
        let buffer = test_buffer(100, 100, 0.5);

        let result = caustics.process(&buffer, 100, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), buffer.len());
    }

    #[test]
    fn test_refractive_caustics_zero() {
        let config = RefractiveCausticsConfig::default();
        let caustics = RefractiveCaustics::new(config);
        let buffer = test_buffer(50, 50, 0.0);

        let result = caustics.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }

    #[test]
    fn test_refractive_caustics_hdr() {
        let config = RefractiveCausticsConfig::default();
        let caustics = RefractiveCaustics::new(config);
        let buffer = test_buffer(50, 50, 5.0);

        let result = caustics.process(&buffer, 50, 50);
        assert!(result.is_ok());
    }
}
