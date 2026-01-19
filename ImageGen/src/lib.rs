//! Three Body Problem Visualization Library
//!
//! This library provides simulation and rendering capabilities for the three-body problem.
//!
//! # Optimization Modules
//!
//! The `optim` module contains CPU-optimized implementations for performance-critical operations:
//! - **Hierarchical Borda**: Multi-stage filtering for faster trajectory selection
//! - **Effect Fusion**: Single-pass pixel-local effects processing
//! - **Gaussian LUT**: Pre-computed blur kernels
//! - **Memory Pool**: Reusable frame buffer allocation
//! - **Sparse Spectrum**: Memory-efficient spectral accumulation

pub mod analysis;
pub mod config;
pub mod drift;
pub mod oklab;
pub mod optim;
pub mod post_effects;
pub mod render;
pub mod sim;
pub mod spectrum;
pub mod utils;
