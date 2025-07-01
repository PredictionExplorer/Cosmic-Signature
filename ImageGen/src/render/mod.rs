//! Rendering module: histogram passes, color mapping, line drawing, and output
//!
//! This module provides functionality for rendering three-body problem simulations
//! with various visual effects and post-processing options.

// Allow unused imports since these are public API exports
#![allow(unused_imports)]

// Submodules
pub mod color;
pub mod context;
pub mod drawing;
pub mod effects;
pub mod error;
pub mod histogram;
pub mod video;

// Re-export commonly used types and functions
pub use color::{generate_body_color_sequences, generate_color_gradient_oklab, OklabColor};
pub use context::{RenderContext, RenderConfig};
pub use drawing::{draw_line_segment_aa_alpha, draw_line_segment_aa_spectral};
pub use effects::{
    apply_dog_bloom, create_post_effect_chain, parallel_blur_2d_rgba, DogBloomConfig, ExposureCalculator,
    MipPyramid,
};
pub use error::{RenderError, RenderResult};
pub use histogram::compute_black_white_gamma;
pub use video::create_video_from_frames_singlepass;

// Re-export render passes
pub use crate::render_passes::{
    pass_1_build_histogram, pass_1_build_histogram_spectral,
    pass_2_write_frames, pass_2_write_frames_spectral,
};

// Re-export utility functions
pub use crate::render_utils::{
    EffectChainBuilder, EffectConfig, FrameParams,
    HistogramData, save_image_as_png,
}; 