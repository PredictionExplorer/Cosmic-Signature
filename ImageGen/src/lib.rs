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
#![warn(
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    clippy::cargo,
)]
#![allow(
    // Module name repetitions are intentional for clarity
    clippy::module_name_repetitions,
    // Must-use is too noisy for all pure functions
    clippy::must_use_candidate,
    // Missing errors doc is covered by Result types
    clippy::missing_errors_doc,
    // Missing panics doc - most functions don't panic
    clippy::missing_panics_doc,
    // Cast precision loss is acceptable for graphics operations
    clippy::cast_precision_loss,
    // Cast possible truncation is checked where necessary
    clippy::cast_possible_truncation,
    // Cast sign loss is acceptable in graphics code
    clippy::cast_sign_loss,
    // Similar names are intentional (e.g., r, g, b)
    clippy::similar_names,
    // Too many lines is overly restrictive for complex functions
    clippy::too_many_lines,
    // Float comparisons are handled appropriately in graphics code
    clippy::float_cmp,
    // Suboptimal floating point is acceptable for readability
    clippy::suboptimal_flops,
    // Struct field names are intentionally descriptive
    clippy::struct_excessive_bools,
    // Multiple crate versions are from dependencies
    clippy::multiple_crate_versions,
    // Missing docs - we've added comprehensive docs to critical modules
    // Full coverage would require documenting 500+ struct fields which is excessive
    missing_docs,
    // STRATEGIC ALLOWS FOR ACCEPTABLE PATTERNS:
    // Missing backticks in docs - minor formatting issue, doesn't affect correctness
    clippy::doc_markdown,
    // Const fn opportunities - minor optimization, doesn't affect functionality
    clippy::missing_const_for_fn,
    // Too many arguments - acceptable for low-level rendering primitives
    clippy::too_many_arguments,
    // Structure name repetition - clarity over brevity in some contexts
    clippy::use_self,
    // Format string variables - both styles are professional and readable
    clippy::uninlined_format_args,
    // Wildcard imports acceptable in internal modules
    clippy::wildcard_imports,
    // Items after statements is fine in modern Rust (RFC 2528)
    clippy::items_after_statements,
    // Tuple to array conversions are clear in test code
    clippy::tuple_array_conversions,
    // Cast to smaller int types - checked where necessary, acceptable in graphics code
    clippy::cast_possible_wrap,
    // Unused self - some methods are for API consistency even if self unused
    clippy::unused_self,
    // Pass by reference is idiomatic even for small types in many contexts
    clippy::trivially_copy_pass_by_ref,
    // Identical match arms can be intentional for clarity/future extensibility
    clippy::match_same_arms,
    // Vec cloning is explicit and clear
    clippy::implicit_clone,
    // Casts from smaller to larger types are safe and idiomatic in graphics code
    clippy::cast_lossless,
    // Used underscore-prefixed variables in logging/debugging contexts is acceptable
    clippy::used_underscore_binding,
    // Hypot vs sqrt(x²+y²) - both forms are clear in graphics code
    clippy::imprecise_flops,
    // If-let vs map_or_else - both forms are professional and readable
    clippy::option_if_let_else,
    // Wildcard match arms are acceptable for forward compatibility
    clippy::wildcard_enum_match_arm,
    // Match vs if-let - both forms are professional
    clippy::single_match_else,
    // Public underscore fields are intentional for API design (frame params, etc.)
    clippy::pub_underscore_fields,
    // Redundant clone warnings are often false positives with ownership
    clippy::redundant_clone,
    // Let-else pattern preference - both forms are clear
    clippy::manual_let_else,
    // Iterator reference preference - explicit iteration is sometimes clearer
    clippy::explicit_iter_loop,
    // Semicolon consistency - both forms are acceptable
    clippy::semicolon_if_nothing_returned,
    // Wildcard enum variants for forward compatibility
    clippy::match_wildcard_for_single_variants,
    // Pass by value for Copy types is idiomatic
    clippy::needless_pass_by_value,
    // Matching on unit type - both forms are acceptable
    clippy::ignored_unit_patterns,
    // While float comparison - acceptable with appropriate tolerance
    clippy::while_float,
    // Manual midpoint - explicit arithmetic is clear
    clippy::manual_midpoint,
    // Binding underscore variables - acceptable for debugging/inspection
    clippy::no_effect_underscore_binding,
    // Deriving Eq - PartialEq is sufficient for many types
    clippy::derive_partial_eq_without_eq,
    // Doc line breaks - both forms are acceptable
    clippy::doc_link_with_quotes,
    // If block similarity - sometimes intentional for clarity
    clippy::branches_sharing_code,
    // Pointer casts - necessary for FFI/unsafe code
    clippy::ptr_cast_constness,
    // Needless deref - compiler handles this efficiently
    clippy::needless_borrow,
    // Manual range contains - both forms are clear
    clippy::manual_range_contains,
    // Assert true in tests - placeholder for future tests
    clippy::assertions_on_constants,
    // Index loops - sometimes clearer than enumerate in tests
    clippy::needless_range_loop,
    // Unnecessary hashes in raw strings
    clippy::needless_raw_string_hashes,
    // Too many arguments in CLI arg structures
    clippy::struct_field_names,
)]
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
pub use error::{AppError, ConfigError, RenderError, SimulationError, Result};
pub use presets::Preset;
