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

// Comprehensive lint configuration for maximum code quality
#![warn(clippy::all, clippy::pedantic, clippy::nursery, clippy::cargo)]
#![allow(
    // === GLOBAL ALLOWS: Domain-Specific Exceptions for Graphics/Physics Code ===

    // Graphics code patterns (inherent to the domain)
    clippy::cast_precision_loss,      // Necessary for pixel coordinate conversions
    clippy::cast_possible_truncation,  // Checked where critical, acceptable elsewhere
    clippy::cast_sign_loss,            // Standard in graphics math (u8, u16 conversions)
    clippy::cast_lossless,             // Explicit casts improve readability
    clippy::cast_possible_wrap,        // Graphics code uses wrapping semantics
    clippy::similar_names,             // RGB/XYZ variables are standard notation
    clippy::float_cmp,                 // Acceptable with domain-appropriate tolerances
    clippy::suboptimal_flops,          // Clarity over micro-optimization
    clippy::imprecise_flops,           // Hypot vs manual sqrt is readability choice

    // API design decisions (intentional choices)
    clippy::module_name_repetitions,   // Clear namespacing (render::RenderContext)
    clippy::struct_excessive_bools,    // Feature flags need boolean fields
    clippy::too_many_arguments,        // Low-level primitives bundle params differently
    clippy::pub_underscore_fields,     // Public API uses underscore for framework params
    clippy::struct_field_names,        // Descriptive field names for clarity

    // Documentation pragmatism (500+ public items)
    missing_docs,                      // Core modules documented, full coverage excessive
    clippy::missing_errors_doc,        // Result types are self-documenting
    clippy::missing_panics_doc,        // Most functions don't panic
    clippy::doc_markdown,              // Minor formatting, doesn't affect correctness
    clippy::doc_link_with_quotes,      // Both forms acceptable

    // Style preferences (both forms are professional)
    clippy::must_use_candidate,        // Too noisy for pure functions
    clippy::uninlined_format_args,     // Both inline and variable formats are clear
    clippy::needless_pass_by_value,    // Idiomatic for Copy types
    clippy::trivially_copy_pass_by_ref,// Sometimes clearer than pass-by-value
    clippy::option_if_let_else,        // If-let can be clearer than map_or_else
    clippy::use_self,                  // Type names can improve clarity
    clippy::missing_const_for_fn,      // Const propagation is compiler's job

    // Modern Rust idioms (post-2018)
    clippy::items_after_statements,    // Fine in modern Rust (RFC 2528)
    clippy::manual_let_else,           // Both forms are acceptable
    clippy::single_match_else,         // Match can be clearer than if-let
    clippy::match_same_arms,           // Explicit branches for future extensibility
    clippy::match_wildcard_for_single_variants, // Forward compatibility
    clippy::wildcard_enum_match_arm,   // Exhaustive matching sometimes too strict
    clippy::semicolon_if_nothing_returned, // Stylistic
    clippy::explicit_iter_loop,        // Explicit iteration can be clearer
    clippy::needless_range_loop,       // Index-based loops acceptable for clarity
    clippy::manual_range_contains,     // Both forms are clear
    clippy::redundant_clone,           // Often false positive with complex ownership
    clippy::needless_borrow,           // Compiler optimizes this away
    clippy::implicit_clone,            // Explicit clone() is clear
    clippy::ignored_unit_patterns,     // () matching acceptable
    clippy::no_effect_underscore_binding, // Useful for debugging
    clippy::used_underscore_binding,   // Acceptable in logging contexts
    clippy::unused_self,               // API consistency
    clippy::derive_partial_eq_without_eq, // PartialEq sufficient
    clippy::assertions_on_constants,   // Acceptable in tests
    clippy::wildcard_imports,          // Acceptable in internal modules
    clippy::tuple_array_conversions,   // Both forms are clear
    clippy::ptr_cast_constness,        // Necessary for FFI
    clippy::branches_sharing_code,     // Sometimes intentional for clarity
    clippy::needless_raw_string_hashes,// Minor style issue
    clippy::too_many_lines,            // Complex rendering code needs space
    clippy::while_float,               // Acceptable with appropriate tolerance
    clippy::manual_midpoint,           // Explicit arithmetic is clear

    // Dependency limitations
    clippy::multiple_crate_versions,   // External dependencies, not our control
)]
// Note: Some module-specific allows are applied locally where needed.
#![deny(
    // Rust 2018 idioms
    rust_2018_idioms,
)]

/// Trajectory analysis: energy, angular momentum, chaos metrics
pub mod analysis;
/// Application orchestration and 7-stage pipeline
pub mod app;
/// TOML configuration file parsing
pub mod config_file;
/// Drift transformations for camera movement
pub mod drift;
/// Drift configuration structures  
pub mod drift_config;
/// Error types and error handling
pub mod error;
/// Generation log for reproducibility
pub mod generation_log;
/// Structured logging utilities
pub mod logging;
/// OkLab color space conversions
pub mod oklab;
/// Parameter distributions for randomization
pub mod parameter_distributions;
/// Post-processing effects pipeline
pub mod post_effects;
/// Named effect presets
pub mod presets;
/// Rendering pipeline, drawing, and video encoding
pub mod render;
/// Physics simulation and Borda selection
pub mod sim;
/// Structure-of-arrays position storage
pub mod soa_positions;
/// Spectral constants and wavelength data
pub mod spectral_constants;
/// Spectral rendering and SPD conversion
pub mod spectrum;
/// SIMD-optimized spectral operations
pub mod spectrum_simd;
/// General-purpose utilities
pub mod utils;
/// Weighted random sampling
pub mod weighted_sampler;

// Re-export common types for convenience
pub use error::{AppError, ConfigError, RenderError, Result, SimulationError};
pub use presets::Preset;
