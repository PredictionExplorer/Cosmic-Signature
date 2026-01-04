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
use super::types::{ExposureNormalizationConfig, ExposureNormalizationMode};
use super::velocity_hdr;
use crate::post_effects::{LuxuryPalette, NebulaCloudConfig, NebulaClouds};
use crate::post_effects::utils::upsample_bilinear;
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
    exposure_normalization: ExposureNormalizationConfig,
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
        //
        // MUSEUM QUALITY TUNING (v2): Derive nebula colors from the gradient map palette.
        // This ensures visual coherence between the nebula background and the color grading,
        // while providing variety across different images (each palette produces unique colors).
        let nebula_colors = LuxuryPalette::from_index(resolved_config.gradient_map_palette)
            .nebula_colors();

        let nebula_config = NebulaCloudConfig {
            strength: resolved_config.nebula_strength,
            octaves: resolved_config.nebula_octaves,
            base_frequency: resolved_config.nebula_base_frequency,
            lacunarity: 2.0,
            persistence: 0.5,
            noise_seed: noise_seed as i64,
            // Use palette-derived colors for variety and coherence
            colors: nebula_colors,
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
            exposure_normalization: params.render_config.exposure_normalization,
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

    /// Snapshot the current accumulated trajectory buffer as premultiplied RGBA for histogram use.
    ///
    /// This intentionally does **not** run post-processing effects. Pass 1 should estimate
    /// black/white points from the true source signal so that exposure normalization can
    /// produce a stable working range for downstream effects.
    #[inline]
    pub(crate) fn snapshot_trajectory_rgba_for_histogram(&mut self) -> &PixelBuffer {
        apply_energy_density_shift(&mut self.workspace.accum_spd, self.special_mode);
        convert_spd_buffer_to_rgba(&self.workspace.accum_spd, &mut self.workspace.accum_rgba);
        &self.workspace.accum_rgba
    }

    /// Set histogram-derived channel levels for pre-effects exposure normalization.
    ///
    /// This is primarily used by the curation/preview pipeline, which computes levels
    /// from a cheap sampled histogram and then wants to run the finishing chain with
    /// normalization enabled.
    pub(crate) fn set_levels_for_exposure(&mut self, levels: super::types::ChannelLevels) {
        self.levels = Some(levels);
    }

    /// Process the current frame assuming SPD→RGBA conversion has already occurred.
    ///
    /// This is a shared helper used by:
    /// - `process_frame()` (normal render path), after doing energy shift + SPD→RGBA conversion
    /// - curation/preview code, which wants to compute histogram levels from the converted RGBA
    ///   and then run the effect chains without applying the energy shift twice.
    pub(crate) fn process_frame_from_converted_rgba(
        &mut self,
        frame_number: usize,
        resolved_config: &ResolvedEffectConfig,
    ) -> Result<PixelBuffer> {
        // MUSEUM QUALITY FIX: Normalize exposure BEFORE effects
        // The effects (Halation, DodgeBurn, etc.) expect 0-1-ish range values.
        if let Some(levels) = &self.levels {
            apply_exposure_normalization(
                &mut self.workspace.accum_rgba,
                levels,
                self.exposure_normalization,
            );
        }

        // MUSEUM QUALITY PIPELINE SPLIT:
        // Stage 1: Process trajectories ONLY (Bloom, Glow, Materials)
        let frame_params = FrameParams {
            frame_number,
            _density: None,
            body_positions: Some(self.current_body_positions.clone()),
        };
        let rgba_buffer = std::mem::take(&mut self.workspace.accum_rgba);

        let trajectory_pixels = self.effect_chain.process_trajectories(
            rgba_buffer,
            self.width as usize,
            self.height as usize,
            &frame_params,
        )?;

        // Reset workspace for next frame (reuses allocations)
        self.workspace.reset();

        // Stage 2: Generate background (Nebula)
        let mut nebula_background = if self.special_mode && resolved_config.nebula_strength > 0.0 {
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

        // Museum-quality: keep the background present but subordinate to the subject.
        if self.special_mode && resolved_config.nebula_strength > 0.0 {
            apply_subject_aware_nebula_mask(
                &mut nebula_background,
                &trajectory_pixels,
                self.width as usize,
                self.height as usize,
            );
        }

        // Stage 3: Composite background and trajectories
        let composited = composite_buffers(&nebula_background, &trajectory_pixels);

        // Stage 4: Scene-level finishing (Halation, Dodge & Burn, Texture)
        let mut final_frame = self.effect_chain.process_finishing(
            composited,
            self.width as usize,
            self.height as usize,
            &frame_params,
        )?;

        // Stage 5: MUSEUM QUALITY BRIGHTNESS COMPENSATION
        // After all darkening effects have been applied, check if the image is too dark
        // and apply a gentle lift to ensure exhibition-quality brightness.
        //
        // Target luminance: 0.32 is tuned for rich, vibrant output without washing out
        // Max boost: 1.6 prevents over-correction that could blow out highlights
        apply_brightness_compensation(&mut final_frame, 0.32, 1.6);

        Ok(final_frame)
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
        convert_spd_buffer_to_rgba(&self.workspace.accum_spd, &mut self.workspace.accum_rgba);

        self.process_frame_from_converted_rgba(frame_number, resolved_config)
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

/// Apply a subject-aware opacity mask to the nebula background.
///
/// The nebula background is generated as a straight RGB + alpha layer (not premultiplied).
/// This function modulates nebula alpha based on the trajectory layer so the background
/// frames the subject instead of overpowering it.
pub(crate) fn apply_subject_aware_nebula_mask(
    nebula_background: &mut PixelBuffer,
    trajectory_pixels: &PixelBuffer,
    width: usize,
    height: usize,
) {
    if nebula_background.len() != trajectory_pixels.len() || nebula_background.is_empty() {
        return;
    }

    // Downsampled subject mask for speed (nebula is low-frequency).
    const DOWNSAMPLE: usize = 4;
    let ds_w = width.div_ceil(DOWNSAMPLE);
    let ds_h = height.div_ceil(DOWNSAMPLE);
    let min_dim = width.min(height);

    // Build low-res subject proximity map in [0, 1].
    let mut mask_ds = vec![(0.0, 0.0, 0.0, 0.0); ds_w * ds_h];
    mask_ds.par_iter_mut().enumerate().for_each(|(idx, out)| {
        let dx = idx % ds_w;
        let dy = idx / ds_w;

        let x0 = dx * DOWNSAMPLE;
        let y0 = dy * DOWNSAMPLE;
        let x1 = ((dx + 1) * DOWNSAMPLE).min(width);
        let y1 = ((dy + 1) * DOWNSAMPLE).min(height);

        let mut m = 0.0f64;
        for y in y0..y1 {
            let row = y * width;
            for x in x0..x1 {
                let (r, g, b, a) = trajectory_pixels[row + x];
                let premult_luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                let coverage = (a * 0.90 + premult_luma * 0.10).clamp(0.0, 1.0);
                m = m.max(coverage);
            }
        }

        // Store in all channels to reuse RGBA blur implementation.
        *out = (m, m, m, m);
    });

    // Blur for a soft falloff around the subject (approximate distance field).
    let blur_radius = ((0.06 * min_dim as f64) / (DOWNSAMPLE as f64)).round().max(1.0) as usize;
    super::drawing::parallel_blur_2d_rgba(&mut mask_ds, ds_w, ds_h, blur_radius);

    // Upsample to full resolution.
    let mask_full = upsample_bilinear(&mask_ds, ds_w, ds_h, width, height);

    // Opacity modulation: suppress strongly near subject, preserve far away.
    const MIN_FACTOR: f64 = 0.20; // leave a whisper of atmosphere even near dense subject
    const GAMMA: f64 = 1.35;
    nebula_background
        .par_iter_mut()
        .zip(mask_full.par_iter())
        .for_each(|(neb, mask)| {
            let subject = mask.3.clamp(0.0, 1.0);
            let t = (1.0 - subject).clamp(0.0, 1.0);
            let factor = (MIN_FACTOR + (1.0 - MIN_FACTOR) * t).powf(GAMMA);
            neb.3 = (neb.3 * factor).clamp(0.0, 1.0);
        });
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
/// `pixel = (pixel - black) * scale * boost`
///
/// Note: We intentionally do **not** clamp to 1.0 here to preserve headroom for bloom/glow.
pub(crate) fn apply_exposure_normalization(
    buffer: &mut PixelBuffer,
    levels: &super::types::ChannelLevels,
    config: ExposureNormalizationConfig,
) {
    let boost = config.boost.max(0.0);
    if boost == 0.0 {
        return;
    }

    match config.mode {
        ExposureNormalizationMode::PerChannel => {
            // Legacy behavior: normalize each channel independently.
            buffer.par_iter_mut().for_each(|pixel| {
                pixel.0 = ((pixel.0 - levels.black[0]).max(0.0) / levels.range[0] * boost).max(0.0);
                pixel.1 = ((pixel.1 - levels.black[1]).max(0.0) / levels.range[1] * boost).max(0.0);
                pixel.2 = ((pixel.2 - levels.black[2]).max(0.0) / levels.range[2] * boost).max(0.0);
            });
        }
        ExposureNormalizationMode::PreserveHue => {
            // Museum-quality behavior: preserve hue by using a single luminance-derived scale.
            //
            // We still subtract per-channel black points (to remove percentile "lift"),
            // but we scale all channels equally to avoid hue shifts.
            let white_r = levels.black[0] + levels.range[0];
            let white_g = levels.black[1] + levels.range[1];
            let white_b = levels.black[2] + levels.range[2];
            let white_luma = (0.2126 * white_r + 0.7152 * white_g + 0.0722 * white_b).max(1e-14);
            let scale = boost / white_luma;

            buffer.par_iter_mut().for_each(|pixel| {
                pixel.0 = ((pixel.0 - levels.black[0]).max(0.0) * scale).max(0.0);
                pixel.1 = ((pixel.1 - levels.black[1]).max(0.0) * scale).max(0.0);
                pixel.2 = ((pixel.2 - levels.black[2]).max(0.0) * scale).max(0.0);
            });
        }
    }
}

/// Apply post-effect brightness compensation to recover from cumulative darkening.
///
/// MUSEUM QUALITY TUNING (v2): This function analyzes the current brightness of the
/// buffer and applies a gentle lift if the image has become too dark due to
/// cumulative effects (volumetric_occlusion, atmospheric_depth, cosmic_ink, etc.).
///
/// # Algorithm
///
/// 1. Sample the buffer to compute mean luminance (faster than full scan)
/// 2. If mean luminance is below target, apply a compensation boost
/// 3. Use a soft-knee curve to avoid harsh transitions
/// 4. Preserve hue and saturation while boosting luminance
///
/// # Arguments
///
/// * `buffer` - The pixel buffer to compensate (modified in place)
/// * `target_luminance` - Target mean luminance (typically 0.25 - 0.40)
/// * `max_boost` - Maximum allowed boost multiplier (typically 1.5 - 2.5)
///
/// # Example
///
/// ```rust,ignore
/// let mut buffer: PixelBuffer = /* ... */;
/// apply_brightness_compensation(&mut buffer, 0.35, 1.8);
/// ```
pub(crate) fn apply_brightness_compensation(
    buffer: &mut PixelBuffer,
    target_luminance: f64,
    max_boost: f64,
) {
    if buffer.is_empty() {
        return;
    }

    // Sample luminance from a subset of pixels for speed
    let sample_stride = (buffer.len() / 1000).max(1);
    let mut total_lum = 0.0;
    let mut sample_count = 0;

    for (idx, pixel) in buffer.iter().enumerate() {
        if idx % sample_stride != 0 {
            continue;
        }
        let (r, g, b, a) = *pixel;
        if a > 0.01 {
            // Un-premultiply for accurate luminance
            let sr = r / a;
            let sg = g / a;
            let sb = b / a;
            let lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
            total_lum += lum;
            sample_count += 1;
        }
    }

    if sample_count == 0 {
        return;
    }

    let mean_lum = total_lum / sample_count as f64;

    // If mean luminance is already at or above target, no compensation needed
    if mean_lum >= target_luminance {
        return;
    }

    // Calculate boost needed to reach target
    // Use a soft knee to avoid harsh boosting when close to target
    let deficit = target_luminance - mean_lum;
    let raw_boost = target_luminance / mean_lum.max(0.01);

    // Soft knee: reduce boost as we approach the max
    let boost = 1.0 + (raw_boost - 1.0).min(max_boost - 1.0) * soft_knee(deficit, 0.15);

    // Apply boost while preserving hue and saturation
    // This is done by boosting in a way that lifts luminance without shifting colors
    buffer.par_iter_mut().for_each(|pixel| {
        let (r, g, b, a) = *pixel;
        if a <= 0.0 {
            return;
        }

        // Un-premultiply
        let sr = r / a;
        let sg = g / a;
        let sb = b / a;

        // Apply boost with soft rolloff for highlights (avoid clipping)
        let boosted_r = soft_boost(sr, boost);
        let boosted_g = soft_boost(sg, boost);
        let boosted_b = soft_boost(sb, boost);

        // Re-premultiply
        pixel.0 = boosted_r * a;
        pixel.1 = boosted_g * a;
        pixel.2 = boosted_b * a;
    });
}

/// Soft knee function for smooth transitions.
///
/// Returns 1.0 when x is large, approaches 0.0 as x approaches 0.
#[inline]
fn soft_knee(x: f64, knee: f64) -> f64 {
    let normalized = x / knee;
    normalized / (1.0 + normalized)
}

/// Soft boost function that applies a multiplier with highlight protection.
///
/// Uses a modified reinhard-style curve to prevent highlight clipping.
#[inline]
fn soft_boost(value: f64, boost: f64) -> f64 {
    // Apply boost
    let boosted = value * boost;

    // Soft rolloff for highlights (prevent clipping at 1.0)
    // Uses inverse Reinhard: y = x / (1 + x) scaled to preserve mid-tones
    if boosted > 0.7 {
        let excess = boosted - 0.7;
        0.7 + excess / (1.0 + excess * 0.5)
    } else {
        boosted
    }
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

    #[test]
    fn test_subject_aware_nebula_mask_suppresses_near_subject() {
        let width = 16;
        let height = 16;

        // Trajectory: strong subject in center (high alpha), empty elsewhere.
        let mut traj = vec![(0.0, 0.0, 0.0, 0.0); width * height];
        for y in 6..10 {
            for x in 6..10 {
                let idx = y * width + x;
                traj[idx] = (0.8, 0.6, 0.4, 1.0);
            }
        }

        // Nebula: uniform alpha everywhere (straight RGB + alpha).
        let mut nebula = vec![(0.2, 0.3, 0.4, 0.8); width * height];
        apply_subject_aware_nebula_mask(&mut nebula, &traj, width, height);

        let center_a = nebula[8 * width + 8].3;
        let corner_a = nebula[0].3;
        assert!(
            center_a < corner_a,
            "Expected center nebula alpha to be suppressed (center={}, corner={})",
            center_a,
            corner_a
        );
    }

    // =========================================================================
    // MUSEUM QUALITY BRIGHTNESS GUARANTEE TESTS
    // =========================================================================
    // These tests ensure our brightness compensation and darkening budget
    // systems work correctly to prevent overly dark images.

    #[test]
    fn test_brightness_compensation_no_action_when_bright() {
        // When image is already bright, compensation should not over-boost
        let mut buffer: PixelBuffer = vec![(0.6, 0.6, 0.6, 1.0); 1000];
        let original: PixelBuffer = buffer.clone();

        apply_brightness_compensation(&mut buffer, 0.35, 1.6);

        // Should be largely unchanged (bright images need minimal boost)
        for (new, orig) in buffer.iter().zip(original.iter()) {
            // Allow small adjustment but not large boost
            assert!(
                (new.0 - orig.0).abs() < 0.3,
                "Bright image should not be heavily boosted"
            );
        }
    }

    #[test]
    fn test_brightness_compensation_boosts_dark_images() {
        // When image is dark, compensation should boost it
        let mut buffer: PixelBuffer = vec![(0.15, 0.15, 0.15, 1.0); 1000];

        // Calculate mean luminance before
        let mean_before = buffer.iter()
            .map(|(r, g, b, _)| 0.2126 * r + 0.7152 * g + 0.0722 * b)
            .sum::<f64>() / buffer.len() as f64;

        apply_brightness_compensation(&mut buffer, 0.35, 1.8);

        // Calculate mean luminance after
        let mean_after = buffer.iter()
            .map(|(r, g, b, _)| 0.2126 * r + 0.7152 * g + 0.0722 * b)
            .sum::<f64>() / buffer.len() as f64;

        assert!(
            mean_after > mean_before,
            "Dark image should be boosted: before={:.3}, after={:.3}",
            mean_before,
            mean_after
        );
    }

    #[test]
    fn test_brightness_compensation_preserves_relative_luminance() {
        // Brightness compensation should preserve relative luminance relationships
        let mut buffer: PixelBuffer = vec![
            (0.1, 0.1, 0.1, 1.0), // Dark
            (0.2, 0.2, 0.2, 1.0), // Medium
            (0.3, 0.3, 0.3, 1.0), // Light
        ];

        apply_brightness_compensation(&mut buffer, 0.35, 1.6);

        // Relative order should be preserved
        let lum0 = buffer[0].0 + buffer[0].1 + buffer[0].2;
        let lum1 = buffer[1].0 + buffer[1].1 + buffer[1].2;
        let lum2 = buffer[2].0 + buffer[2].1 + buffer[2].2;

        assert!(lum0 < lum1, "Dark should remain darker than medium");
        assert!(lum1 < lum2, "Medium should remain darker than light");
    }

    #[test]
    fn test_brightness_compensation_handles_empty_buffer() {
        // Should not crash on empty buffer
        let mut buffer: PixelBuffer = vec![];
        apply_brightness_compensation(&mut buffer, 0.35, 1.6);
        assert!(buffer.is_empty());
    }

    #[test]
    fn test_brightness_compensation_handles_transparent_pixels() {
        // Should handle transparent pixels gracefully
        let mut buffer: PixelBuffer = vec![
            (0.1, 0.1, 0.1, 1.0),
            (0.0, 0.0, 0.0, 0.0), // Fully transparent
            (0.1, 0.1, 0.1, 0.5), // Semi-transparent
        ];

        apply_brightness_compensation(&mut buffer, 0.35, 1.6);

        // Transparent pixel should remain unchanged
        assert_eq!(buffer[1], (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn test_soft_knee_function() {
        // Soft knee should smoothly transition
        assert!((soft_knee(0.0, 0.15) - 0.0).abs() < 0.01);
        assert!(soft_knee(0.15, 0.15) > 0.4 && soft_knee(0.15, 0.15) < 0.6);
        assert!(soft_knee(1.0, 0.15) > 0.85);
    }

    #[test]
    fn test_soft_boost_function() {
        // Soft boost should apply multiplier with highlight protection
        let boosted_mid = soft_boost(0.3, 1.5);
        assert!((boosted_mid - 0.45).abs() < 0.01, "Mid-tones should boost normally");

        // Highlights should be protected from clipping
        let boosted_high = soft_boost(0.8, 2.0);
        assert!(boosted_high < 1.5, "Highlights should not clip excessively");
    }

    #[test]
    fn test_soft_boost_preserves_order() {
        // Soft boost should preserve luminance ordering
        let dark = soft_boost(0.2, 1.8);
        let mid = soft_boost(0.5, 1.8);
        let light = soft_boost(0.8, 1.8);

        assert!(dark < mid, "Dark should remain darker than mid");
        assert!(mid < light, "Mid should remain darker than light");
    }
}
