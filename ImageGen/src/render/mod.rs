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

// Re-export commonly used types
pub use color::OklabColor;
pub use context::{RenderConfig, RenderContext};
pub use effects::{DogBloomConfig, PostEffectConfig, create_post_effect_chain, parallel_blur_2d_rgba};
pub use error::RenderError;
pub use histogram::compute_black_white_gamma;

// Re-export drawing functions
pub use drawing::draw_line_segment_aa_spectral;

// Re-export render passes
pub use crate::render_passes::{
    pass_1_build_histogram_spectral,
    pass_2_write_frames_spectral,
};

// Re-export utilities
pub use crate::render_utils::save_image_as_png; 