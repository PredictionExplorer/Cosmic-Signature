//! Three Body Problem Visualization Library
//!
//! This library provides simulation and rendering capabilities for the three-body problem.
//!
//! # Core Modules
//!
//! - [`sim`]: Physics simulation and trajectory generation
//! - [`render`]: Rendering pipeline, effects, and video encoding
//! - [`post_effects`]: Post-processing effects (bloom, color grading, etc.)
//!
//! # Configuration
//!
//! - [`config_file`]: TOML configuration file support
//! - [`presets`]: Pre-configured effect presets for common use cases
//!
//! # Utilities
//!
//! - [`logging`]: Structured logging utilities
//! - [`weighted_sampler`]: Distribution-based parameter sampling

pub mod analysis;
pub mod app;
pub mod config_file;
pub mod drift;
pub mod drift_config;
pub mod error;
pub mod generation_log;
pub mod logging;
pub mod oklab;
pub mod parameter_distributions;
pub mod post_effects;
pub mod presets;
pub mod render;
pub mod sim;
pub mod soa_positions;
pub mod spectral_constants;
pub mod spectrum;
pub mod spectrum_simd;
pub mod utils;
pub mod weighted_sampler;

// Re-export common types for convenience
pub use error::{AppError, ConfigError, RenderError, SimulationError, Result};
pub use presets::Preset;
