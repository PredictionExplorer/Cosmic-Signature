//! Cinematic color grading post effect.
//!
//! Applies a subtle vignette, warm highlights, and cool shadows to give
//! the renders a more photographic, gallery-ready look while preserving
//! the existing dynamic range and hue relationships.

use super::{PixelBuffer, PostEffect};
use crate::render::{constants, parallel_blur_2d_rgba};
use rayon::prelude::*;
use std::error::Error;
use std::f64::consts::TAU;

#[allow(dead_code)]
#[derive(Clone, Copy, Debug)]
pub enum ToneMappingStyle {
    Cinematic,
    Linear,
    HighKey,
}

impl ToneMappingStyle {
    #[allow(dead_code)]
    fn apply(&self, channel: f64) -> f64 {
        match self {
            ToneMappingStyle::Cinematic => {
                let x = channel.max(0.0);
                let a = 2.51;
                let b = 0.03;
                let c = 2.43;
                let d = 0.59;
                let e = 0.14;
                ((x * (a * x + b)) / (x * (c * x + d) + e)).clamp(0.0, 1.0)
            }
            ToneMappingStyle::Linear => channel.clamp(0.0, 1.0),
            ToneMappingStyle::HighKey => {
                let x = channel.clamp(0.0, 2.0);
                (x / (x + 1.2)).powf(0.85).clamp(0.0, 1.0)
            }
        }
    }
}

fn luminance(r: f64, g: f64, b: f64) -> f64 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

fn remap_tone_curve(lum: f64, strength: f64) -> f64 {
    if strength <= 0.0 {
        return lum.clamp(0.0, 1.0);
    }
    let centered = (lum - 0.5).clamp(-0.5, 0.5);
    let gain = 1.0 + strength * 6.0;
    (0.5 + (gain * centered).tanh() * 0.5).clamp(0.0, 1.0)
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct ColorGradeParams {
    pub strength: f64,
    pub vignette_strength: f64,
    pub vignette_softness: f64,
    pub warmth_shift: f64,
    pub vibrance: f64,
    pub clarity_strength: f64,
    pub clarity_radius: usize,
    pub tone_curve: f64,
    pub shadow_tint: [f64; 3],
    pub highlight_tint: [f64; 3],
    pub tone_mapping: ToneMappingStyle,
    pub color_lift: [f64; 3],
    pub color_gamma: [f64; 3],
    pub color_gain: [f64; 3],
}

impl Default for ColorGradeParams {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_COLOR_GRADE_STRENGTH,
            vignette_strength: constants::DEFAULT_COLOR_GRADE_VIGNETTE,
            vignette_softness: constants::DEFAULT_COLOR_GRADE_VIGNETTE_SOFTNESS,
            warmth_shift: constants::DEFAULT_COLOR_GRADE_WARMTH,
            vibrance: constants::DEFAULT_COLOR_GRADE_VIBRANCE,
            clarity_strength: constants::DEFAULT_COLOR_GRADE_CLARITY,
            clarity_radius: constants::DEFAULT_COLOR_GRADE_CLARITY_RADIUS,
            tone_curve: constants::DEFAULT_COLOR_GRADE_TONE_CURVE,
            shadow_tint: constants::DEFAULT_COLOR_GRADE_SHADOW_TINT,
            highlight_tint: constants::DEFAULT_COLOR_GRADE_HIGHLIGHT_TINT,
            tone_mapping: ToneMappingStyle::Cinematic,
            color_lift: constants::DEFAULT_COLOR_GRADE_LIFT,
            color_gamma: constants::DEFAULT_COLOR_GRADE_GAMMA,
            color_gain: constants::DEFAULT_COLOR_GRADE_GAIN,
        }
    }
}

pub struct CinematicColorGrade {
    pub params: ColorGradeParams,
    pub enabled: bool,
}

impl CinematicColorGrade {
    pub fn new(params: ColorGradeParams) -> Self {
        Self { params, enabled: true }
    }

    fn grade_pixel(
        &self,
        src: (f64, f64, f64, f64),
        blurred: Option<(f64, f64, f64, f64)>,
        vignette_factor: f64,
    ) -> (f64, f64, f64, f64) {
        let (r, g, b, a) = src;
        if a <= 0.0 {
            return src;
        }

        let straight = [r / a, g / a, b / a];
        let base_lum = luminance(straight[0], straight[1], straight[2]);

        let clarity_detail = if self.params.clarity_strength > 0.0 {
            if let Some((br, bg, bb, ba)) = blurred {
                if ba > 0.0 {
                    let blurred_lum = luminance(br / ba, bg / ba, bb / ba);
                    base_lum - blurred_lum
                } else {
                    0.0
                }
            } else {
                0.0
            }
        } else {
            0.0
        };
        let lum_clarity =
            (base_lum + clarity_detail * self.params.clarity_strength).clamp(0.0, 1.5);

        let chroma = [straight[0] - base_lum, straight[1] - base_lum, straight[2] - base_lum];
        let midtone_weight = (lum_clarity * (1.0 - lum_clarity) * 4.0).clamp(0.0, 1.0);
        let vibrance_boost = 1.0 + self.params.vibrance * midtone_weight;
        let mut vibrant = [
            base_lum + chroma[0] * vibrance_boost,
            base_lum + chroma[1] * vibrance_boost,
            base_lum + chroma[2] * vibrance_boost,
        ];

        // Secondary saturation push driven by clarity and existing chroma span
        let chroma_span =
            ((chroma[0] * chroma[0] + chroma[1] * chroma[1] + chroma[2] * chroma[2]) / 3.0).sqrt();
        let saturation_gain = 1.0
            + 0.35 * self.params.vibrance
            + 0.45 * midtone_weight
            + 0.6 * clarity_detail.abs().min(1.2)
            + 0.4 * chroma_span.min(1.5);
        for channel in &mut vibrant {
            *channel = base_lum + (*channel - base_lum) * saturation_gain;
        }

        // Palette sway introduces gentle complementary shifts for added drama
        let palette_wave = (clarity_detail * 5.0 + vignette_factor * TAU).sin();
        vibrant[0] += palette_wave * 0.06;
        vibrant[1] += palette_wave * -0.02;
        vibrant[2] += palette_wave * -0.07;

        let tone = remap_tone_curve(lum_clarity, self.params.tone_curve);
        let current_tone = luminance(vibrant[0], vibrant[1], vibrant[2]).max(1e-6);
        let tone_scale = tone / current_tone;
        for channel in &mut vibrant {
            *channel *= tone_scale;
        }

        // Shadow and highlight tinting
        for i in 0..3 {
            vibrant[i] += self.params.shadow_tint[i];
            vibrant[i] += self.params.highlight_tint[i];
        }

        let vignette_mix = 1.0 - self.params.vignette_strength * vignette_factor;
        let vivid_lum = luminance(vibrant[0], vibrant[1], vibrant[2]).max(1e-6);
        let vignetted_lum = (vivid_lum * vignette_mix).max(0.0);
        let luminance_scale = vignetted_lum / vivid_lum;
        for channel in &mut vibrant {
            *channel = (*channel * luminance_scale).max(0.0);
        }

        let strength = self.params.strength;
        let blended = (
            straight[0] + (vibrant[0] - straight[0]) * strength,
            straight[1] + (vibrant[1] - straight[1]) * strength,
            straight[2] + (vibrant[2] - straight[2]) * strength,
        );

        (blended.0.max(0.0) * a, blended.1.max(0.0) * a, blended.2.max(0.0) * a, a)
    }
}

impl Default for CinematicColorGrade {
    fn default() -> Self {
        Self::new(ColorGradeParams::default())
    }
}

impl PostEffect for CinematicColorGrade {
    fn name(&self) -> &str {
        "Cinematic Color Grade"
    }

    fn is_enabled(&self) -> bool {
        self.enabled && self.params.strength > 0.0
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

        let center_x = (width as f64 - 1.0) * 0.5;
        let center_y = (height as f64 - 1.0) * 0.5;
        let inv_radius = 1.0 / center_x.max(center_y).max(1.0);
        let softness = self.params.vignette_softness.max(1.0);

        let clarity_buffer = if self.params.clarity_strength > 0.0 && self.params.clarity_radius > 0
        {
            let mut blurred = input.clone();
            parallel_blur_2d_rgba(&mut blurred, width, height, self.params.clarity_radius);
            Some(blurred)
        } else {
            None
        };

        let clarity_ref = clarity_buffer.as_ref();
        let mut output = vec![(0.0, 0.0, 0.0, 0.0); input.len()];

        output.par_iter_mut().enumerate().zip(input.par_iter()).for_each(|((idx, out), &px)| {
            let x = idx % width;
            let y = idx / width;
            let dx = (x as f64 - center_x) * inv_radius;
            let dy = (y as f64 - center_y) * inv_radius;
            let vignette = (dx * dx + dy * dy).powf(softness).min(1.0);
            let blurred_px = clarity_ref.and_then(|buf| buf.get(idx)).copied();
            *out = self.grade_pixel(px, blurred_px, vignette);
        });

        Ok(output)
    }
}
