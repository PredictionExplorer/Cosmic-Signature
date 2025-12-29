//! Rendering pipeline orchestration and memory management
//!
//! This module contains the core rendering loop logic, managing the multi-pass
//! rendering pipeline that transforms simulated trajectories into final video frames.
//!
//! # Architecture
//!
//! The pipeline uses a workspace pattern to minimize allocations:
//! - Pre-allocated buffers for spectral and RGBA data
//! - Reusable workspace across frames
//! - Clear separation of logic (RenderLoopContext) from memory (RenderWorkspace)

use super::batch_drawing::{draw_triangle_batch_spectral, prepare_triangle_vertices};
use super::color::OklabColor;
use super::constants;
use super::context::{PixelBuffer, RenderContext};
use crate::post_effects::FrameParams;
use super::effects::{EffectChainBuilder, convert_spd_buffer_to_rgba};
use super::error::{RenderError, Result};
use super::randomizable_config::ResolvedEffectConfig;
use super::types::RenderParams;
use super::velocity_hdr;
use crate::post_effects::{NebulaCloudConfig, NebulaClouds};
use crate::spectrum::NUM_BINS;
use rayon::prelude::*;

/// Memory workspace for rendering operations
///
/// This struct manages all heap-allocated buffers used during rendering,
/// separating memory management concerns from rendering logic.
///
/// # Performance
///
/// - Pre-allocated buffers avoid per-frame allocations
/// - Reusable workspace reduces GC pressure
/// - Clear separation allows future optimizations (e.g., arena allocation)
pub(crate) struct RenderWorkspace {
    /// Spectral power distribution accumulator (HDR, per-wavelength)
    accum_spd: Vec<[f64; NUM_BINS]>,

    /// RGBA accumulator (post-SPD conversion)
    accum_rgba: PixelBuffer,

    /// Pre-allocated empty background buffer (reused when nebula disabled)
    empty_background: PixelBuffer,
}

impl RenderWorkspace {
    /// Create a new workspace with pre-allocated buffers
    pub fn new(pixel_count: usize) -> Self {
        Self {
            accum_spd: vec![[0.0f64; NUM_BINS]; pixel_count],
            accum_rgba: vec![(0.0, 0.0, 0.0, 0.0); pixel_count],
            empty_background: vec![(0.0, 0.0, 0.0, 0.0); pixel_count],
        }
    }

    /// Reset buffers for reuse (clearing without reallocation)
    pub fn reset(&mut self) {
        // Clear RGBA buffer for next frame (SPD cleared during conversion)
        self.accum_rgba.clear();
        self.accum_rgba.resize(self.empty_background.len(), (0.0, 0.0, 0.0, 0.0));
    }

    /// Get reference to empty background buffer
    #[inline]
    pub fn empty_background(&self) -> &PixelBuffer {
        &self.empty_background
    }
}

/// Context for the render loop, encapsulating rendering logic
///
/// This struct separates rendering **logic** from memory management,
/// making the control flow clearer and easier to test.
///
/// # Design
///
/// - **Logic**: Effect chain, coordinate transforms, velocity calculations
/// - **Memory**: Separate `RenderWorkspace` handles all buffers
/// - **Configuration**: Immutable rendering parameters
pub(crate) struct RenderLoopContext<'a> {
    // Rendering logic components
    ctx: RenderContext,
    effect_chain: EffectChainBuilder,
    nebula_config: NebulaCloudConfig,
    velocity_calc: velocity_hdr::VelocityHdrCalculator<'a>,

    // Memory workspace (separated for clarity)
    workspace: RenderWorkspace,

    // Immutable configuration
    total_steps: usize,
    chunk_line: usize,
    frame_interval: usize,
    width: u32,
    height: u32,
    special_mode: bool,
    hdr_scale: f64,
    current_body_positions: Vec<(f64, f64)>,
    // Channel levels for exposure normalization (if provided)
    levels: Option<super::types::ChannelLevels>,
}

impl<'a> RenderLoopContext<'a> {
    /// Create a new render loop context from render parameters
    ///
    /// # Architecture
    ///
    /// This constructor separates concerns:
    /// 1. **Memory Allocation**: `RenderWorkspace` handles all buffers
    /// 2. **Logic Setup**: Effect chains, coordinate transforms
    /// 3. **Configuration**: Immutable parameters extracted from params
    pub fn new(params: &'a RenderParams<'a>) -> Self {
        let positions = params.scene.positions;
        let resolved_config = params.resolved_config;
        let noise_seed = params.noise_seed;

        let width = resolved_config.width;
        let height = resolved_config.height;
        let special_mode = resolved_config.special_mode;

        // Create render context (coordinate transforms, bounding box)
        let ctx = RenderContext::new(width, height, positions);
        let pixel_count = ctx.pixel_count();

        // Allocate memory workspace (separated from logic)
        let workspace = RenderWorkspace::new(pixel_count);

        // Build effect configuration from resolved config
        let effect_config = super::build_effect_config_from_resolved(resolved_config);
        let effect_chain = EffectChainBuilder::new(effect_config);

        // Create nebula configuration (immutable parameters)
        let nebula_config = NebulaCloudConfig {
            strength: resolved_config.nebula_strength,
            octaves: resolved_config.nebula_octaves,
            base_frequency: resolved_config.nebula_base_frequency,
            lacunarity: 2.0,
            persistence: 0.5,
            noise_seed: noise_seed as i64,
            colors: [
                [0.08, 0.12, 0.22], // Deep blue
                [0.15, 0.08, 0.25], // Purple
                [0.25, 0.12, 0.18], // Magenta
                [0.12, 0.15, 0.28], // Blue-violet
            ],
            // Cinematic drift rate (avoid flicker/boiling noise in video)
            time_scale: constants::NEBULA_TIME_SCALE,
            edge_fade: 0.3,
        };

        let total_steps = positions[0].len();
        let chunk_line = (total_steps / 10).max(1);
        let dt = constants::DEFAULT_DT;

        // Create velocity HDR calculator (logic component)
        let velocity_calc = velocity_hdr::VelocityHdrCalculator::new(positions, dt, special_mode);

        Self {
            ctx,
            effect_chain,
            nebula_config,
            velocity_calc,
            workspace,
            total_steps,
            chunk_line,
            frame_interval: params.frame_interval,
            width,
            height,
            special_mode,
            hdr_scale: params.render_config.hdr_scale,
            current_body_positions: Vec::with_capacity(3),
            levels: params.levels.cloned(),
        }
    }

    /// Draw a single step of the simulation to the accumulation buffers
    ///
    /// # Performance
    ///
    /// Inlined for hot path optimization. This is called millions of times
    /// during a full render, so every cycle counts.
    #[inline]
    pub fn draw_step(
        &mut self,
        step: usize,
        positions: &[Vec<nalgebra::Vector3<f64>>],
        colors: &[Vec<OklabColor>],
        body_alphas: &[f64],
    ) {
        // Prepare triangle vertices (coordinate transform)
        let vertices = prepare_triangle_vertices(
            positions,
            colors,
            &[body_alphas[0], body_alphas[1], body_alphas[2]],
            step,
            &self.ctx,
        );

        // Compute velocity-based HDR multipliers (physics-based brightness)
        let hdr_mult_01 = self.velocity_calc.compute_segment_multiplier(step, 0, 1);
        let hdr_mult_12 = self.velocity_calc.compute_segment_multiplier(step, 1, 2);
        let hdr_mult_20 = self.velocity_calc.compute_segment_multiplier(step, 2, 0);

        // Draw entire triangle in batch (writes to workspace.accum_spd)
        draw_triangle_batch_spectral(
            &mut self.workspace.accum_spd,
            self.width,
            self.height,
            vertices[0],
            vertices[1],
            vertices[2],
            hdr_mult_01,
            hdr_mult_12,
            hdr_mult_20,
            self.hdr_scale,
            self.special_mode,
        );

        // Store body positions if we are about to emit a frame
        if self.should_emit_frame(step) {
            self.current_body_positions.clear();
            for i in 0..3 {
                let p = positions[i][step];
                let (px, py) = self.ctx.to_pixel(p[0], p[1]);
                self.current_body_positions.push((px as f64, py as f64));
            }
        }
    }

    /// Process a frame and return the final composited pixels
    ///
    /// # Pipeline
    ///
    /// 1. Apply energy density wavelength shift (special mode only)
    /// 2. Convert spectral data (SPD) to RGBA
    /// 3. Apply post-processing effect chain
    /// 4. Generate nebula background (if enabled)
    /// 5. Composite background under foreground
    /// 6. Reset workspace for next frame
    ///
    /// # Memory Management
    ///
    /// Uses `std::mem::take` to avoid cloning large buffers, then resets
    /// the workspace for reuse. This eliminates per-frame allocations.
    pub fn process_frame(
        &mut self,
        frame_number: usize,
        resolved_config: &ResolvedEffectConfig,
    ) -> Result<PixelBuffer> {
        // Apply energy density wavelength shift before conversion (special mode)
        apply_energy_density_shift(&mut self.workspace.accum_spd, self.special_mode);

        // Convert SPD -> RGBA (spectral rendering to RGB color space)
        // Access workspace fields directly to avoid borrow checker issues
        convert_spd_buffer_to_rgba(&self.workspace.accum_spd, &mut self.workspace.accum_rgba);

        // MUSEUM QUALITY FIX: Normalize exposure BEFORE effects
        // The effects (Halation, DodgeBurn, etc.) expect 0-1 range values.
        // Without this, they see raw HDR values (e.g. 100.0) and bloom everything.
        if let Some(levels) = &self.levels {
            apply_exposure_normalization(&mut self.workspace.accum_rgba, levels);
        }

        // MUSEUM QUALITY PIPELINE SPLIT:
        // Stage 1: Process trajectories ONLY (Bloom, Glow, Materials)
        let frame_params = FrameParams {
            frame_number,
            _density: None,
            body_positions: Some(self.current_body_positions.clone()),
        };
        let rgba_buffer = std::mem::take(&mut self.workspace.accum_rgba);
        
        let trajectory_pixels = self
            .effect_chain
            .process_trajectories(rgba_buffer, self.width as usize, self.height as usize, &frame_params)?;

        // Reset workspace for next frame (reuses allocations)
        self.workspace.reset();

        // Stage 2: Generate background (Nebula)
        let nebula_background = if self.special_mode && resolved_config.nebula_strength > 0.0 {
            generate_nebula_background(
                self.width as usize,
                self.height as usize,
                frame_number,
                &self.nebula_config,
            )?
        } else {
            // Zero-cost path when nebula disabled (no clone, just reference)
            self.workspace.empty_background().to_vec()
        };

        // Stage 3: Composite background and trajectories
        let composited = composite_buffers(&nebula_background, &trajectory_pixels);

        // Stage 4: Scene-level finishing (Halation, Dodge & Burn, Texture)
        // These effects now interact with the whole scene for realistic light behavior.
        let final_frame = self
            .effect_chain
            .process_finishing(composited, self.width as usize, self.height as usize, &frame_params)?;

        Ok(final_frame)
    }

    /// Check if we should emit a frame at this step
    #[inline]
    pub fn should_emit_frame(&self, step: usize) -> bool {
        let is_final = step == self.total_steps - 1;
        (step > 0 && step.is_multiple_of(self.frame_interval)) || is_final
    }

    /// Check if this is the final step
    #[inline]
    pub fn is_final_step(&self, step: usize) -> bool {
        step == self.total_steps - 1
    }

    /// Get total steps
    #[inline]
    pub fn total_steps(&self) -> usize {
        self.total_steps
    }

    /// Get chunk line for progress logging
    #[inline]
    pub fn chunk_line(&self) -> usize {
        self.chunk_line
    }

    /// Get frame interval
    #[inline]
    pub fn frame_interval(&self) -> usize {
        self.frame_interval
    }

    /// Get render context reference
    #[inline]
    pub fn ctx(&self) -> &RenderContext {
        &self.ctx
    }
}

/// Apply energy density wavelength shift to spectral buffer
///
/// Hot regions (high energy) shift toward red, cool regions stay blue.
/// This simulates thermal emission in high-energy trajectory crossings.
pub(crate) fn apply_energy_density_shift(accum_spd: &mut [[f64; NUM_BINS]], special_mode: bool) {
    if !special_mode {
        return;
    }

    use constants::{ENERGY_DENSITY_SHIFT_STRENGTH, ENERGY_DENSITY_SHIFT_THRESHOLD};

    accum_spd.par_iter_mut().for_each(|spd| {
        // Calculate total energy in this pixel
        let total_energy: f64 = spd.iter().sum();

        // If energy is below threshold, no shift needed
        if total_energy < ENERGY_DENSITY_SHIFT_THRESHOLD {
            return;
        }

        // Calculate shift amount (excess energy above threshold)
        let excess_energy = total_energy - ENERGY_DENSITY_SHIFT_THRESHOLD;
        let shift_amount = (excess_energy * ENERGY_DENSITY_SHIFT_STRENGTH).min(1.0);

        // Apply redshift: move energy from lower bins (blue) to higher bins (red)
        let mut shifted_spd = *spd;
        for i in (1..NUM_BINS).rev() {
            shifted_spd[i] = spd[i] * (1.0 - shift_amount) + spd[i - 1] * shift_amount;
        }
        shifted_spd[0] = spd[0] * (1.0 - shift_amount);

        *spd = shifted_spd;
    });
}

/// Generate nebula background buffer (separate from trajectories)
pub(crate) fn generate_nebula_background(
    width: usize,
    height: usize,
    frame_number: usize,
    config: &NebulaCloudConfig,
) -> Result<PixelBuffer> {
    // Start with empty buffer (black background)
    let background = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    // Apply nebula effect
    let nebula = NebulaClouds::new(config.clone());
    nebula
        .process_with_time(&background, width, height, frame_number)
        .map_err(|e| RenderError::EffectError(e.to_string()))
}

/// Composite background and foreground buffers using enhanced "over" operator
///
/// Background goes first (underneath), then foreground on top.
/// Uses alpha boost and saturation boost to maintain trajectory purity.
pub(crate) fn composite_buffers(background: &PixelBuffer, foreground: &PixelBuffer) -> PixelBuffer {
    background
        .par_iter()
        .zip(foreground.par_iter())
        .map(|(&(br, bg, bb, ba), &(fr, fg, fb, fa))| {
            // Stage 1: Apply alpha boost to strengthen trajectory coverage
            let boosted_fa = (fa * constants::COMPOSITE_ALPHA_BOOST_FACTOR).min(1.0);

            if boosted_fa >= 1.0 {
                (fr, fg, fb, fa)
            } else if boosted_fa <= 0.0 {
                (br * ba, bg * ba, bb * ba, ba)
            } else {
                let alpha_out = fa + ba * (1.0 - boosted_fa);

                if alpha_out <= 0.0 {
                    (0.0, 0.0, 0.0, 0.0)
                } else {
                    let mut r_out = fr + (br * ba) * (1.0 - boosted_fa);
                    let mut g_out = fg + (bg * ba) * (1.0 - boosted_fa);
                    let mut b_out = fb + (bb * ba) * (1.0 - boosted_fa);

                    // Stage 2: Saturation boost for trajectory-dominant regions
                    if alpha_out > constants::COMPOSITE_SATURATION_THRESHOLD {
                        let sr = r_out / alpha_out;
                        let sg = g_out / alpha_out;
                        let sb = b_out / alpha_out;

                        let mean = (sr + sg + sb) / 3.0;

                        let boosted_sr =
                            mean + (sr - mean) * constants::COMPOSITE_SATURATION_BOOST_FACTOR;
                        let boosted_sg =
                            mean + (sg - mean) * constants::COMPOSITE_SATURATION_BOOST_FACTOR;
                        let boosted_sb =
                            mean + (sb - mean) * constants::COMPOSITE_SATURATION_BOOST_FACTOR;

                        let clamped_sr = boosted_sr.clamp(0.0, 1.0);
                        let clamped_sg = boosted_sg.clamp(0.0, 1.0);
                        let clamped_sb = boosted_sb.clamp(0.0, 1.0);

                        r_out = clamped_sr * alpha_out;
                        g_out = clamped_sg * alpha_out;
                        b_out = clamped_sb * alpha_out;
                    }

                    (r_out, g_out, b_out, alpha_out)
                }
            }
        })
        .collect()
}

/// Apply exposure normalization to the pixel buffer
///
/// Maps raw HDR values to the 0.0-1.0 range based on histogram levels.
/// This ensures that effects like Halation and Bloom receive normalized data
/// consistent with their expected thresholds.
///
/// # Logic
/// `pixel = (pixel - black) / (white - black)`
/// Clamped to [0.0, 1.0] to prevent artifacts.
pub(crate) fn apply_exposure_normalization(buffer: &mut PixelBuffer, levels: &super::types::ChannelLevels) {
    buffer.par_iter_mut().for_each(|pixel| {
        // Normalize each channel independently using histogram levels
        // This effectively performs "Auto Level" correction before effects run
        
        // Red
        pixel.0 = ((pixel.0 - levels.black[0]) / levels.range[0]).max(0.0);
        
        // Green
        pixel.1 = ((pixel.1 - levels.black[1]) / levels.range[1]).max(0.0);
        
        // Blue
        pixel.2 = ((pixel.2 - levels.black[2]) / levels.range[2]).max(0.0);
        
        // Note: We don't clamp to 1.0 here to preserve HDR headroom for bloom/glow effects.
        // However, the "white point" from histogram is typically the 99.9th percentile,
        // so most pixels will be in [0, 1].
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::randomizable_config::RandomizableEffectConfig;
    use crate::render::RenderConfig;
    use crate::sim::Sha3RandomByteStream;
    use nalgebra::Vector3;

    #[test]
    fn test_workspace_creation() {
        let workspace = RenderWorkspace::new(100);
        assert_eq!(workspace.accum_spd.len(), 100);
        assert_eq!(workspace.empty_background().len(), 100);
    }

    #[test]
    fn test_workspace_reset() {
        let mut workspace = RenderWorkspace::new(100);
        // Modify buffers
        workspace.accum_rgba[0] = (1.0, 1.0, 1.0, 1.0);

        // Reset
        workspace.reset();

        // Should be cleared
        assert_eq!(workspace.accum_rgba[0], (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn test_composite_opaque_foreground() {
        let bg = vec![(1.0, 0.0, 0.0, 1.0)];
        let fg = vec![(0.0, 1.0, 0.0, 1.0)];

        let result = composite_buffers(&bg, &fg);

        // Foreground should completely cover background
        assert!((result[0].1 - 1.0).abs() < 0.1); // Green should dominate
    }

    #[test]
    fn test_composite_transparent_foreground() {
        let bg = vec![(1.0, 0.0, 0.0, 1.0)];
        let fg = vec![(0.0, 1.0, 0.0, 0.0)];

        let result = composite_buffers(&bg, &fg);

        // Background should show through
        assert!((result[0].0 - 1.0).abs() < 0.1); // Red should show
    }

    #[test]
    fn test_energy_density_shift_disabled() {
        let mut spd = vec![[1.0; NUM_BINS]; 10];
        let original = spd.clone();

        apply_energy_density_shift(&mut spd, false);

        // Should be unchanged in standard mode
        assert_eq!(spd, original);
    }

    #[test]
    fn test_render_loop_context_uses_cinematic_nebula_time_scale() {
        // Regression test: nebula animation must use a small time scale to avoid
        // frame-to-frame noise boiling in special mode.
        let steps = 12;
        let positions: Vec<Vec<Vector3<f64>>> = (0..3)
            .map(|b| {
                (0..steps)
                    .map(|i| Vector3::new(i as f64 * 0.01 + b as f64, i as f64 * 0.02, 0.0))
                    .collect()
            })
            .collect();

        let colors: Vec<Vec<OklabColor>> = vec![vec![(0.7, 0.08, 0.12); steps]; 3];
        let body_alphas = vec![1.0; 3];

        let mut rng = Sha3RandomByteStream::new(b"test_nebula_time_scale", 100.0, 300.0, 25.0, 10.0);
        let config = RandomizableEffectConfig { gallery_quality: true, ..Default::default() };
        let (resolved, _log) = config.resolve(&mut rng, 64, 64, true, 42);

        let render_config = RenderConfig::default();
        let params = RenderParams::from_components(
            &positions,
            &colors,
            &body_alphas,
            &resolved,
            1,
            42,
            &render_config,
        );

        let ctx = RenderLoopContext::new(&params);
        assert!(
            (ctx.nebula_config.time_scale - constants::NEBULA_TIME_SCALE).abs() < 1e-12,
            "nebula time_scale should be {}, got {}",
            constants::NEBULA_TIME_SCALE,
            ctx.nebula_config.time_scale
        );
    }
}
