//! Three Body Problem Visualization Library
//!
//! This library provides simulation and rendering capabilities for the three-body problem.

pub mod analysis;
pub mod app;
pub mod drift;
pub mod drift_config;
pub mod error;
pub mod generation_log;
pub mod oklab;
pub mod post_effects;
pub mod render;
pub mod sim;
pub mod soa_positions;
pub mod spectral_constants;
pub mod spectrum;
pub mod spectrum_simd;
pub mod utils;

// Re-export common types for convenience
pub use error::{AppError, ConfigError, RenderError, SimulationError, Result};
