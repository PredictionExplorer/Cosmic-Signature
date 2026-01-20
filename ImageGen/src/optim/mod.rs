//! Performance optimization modules
//!
//! This module contains CPU-optimized implementations for performance-critical operations:
//! - Exhaustive Borda selection (single-stage full evaluation)
//! - Memory pooling and arena allocation
//! - Pre-computed lookup tables
//! - Fused effect processing
//! - SIMD-accelerated pixel processing

pub mod borda;
pub mod effect_fusion;
pub mod gaussian_lut;
pub mod memory_pool;
pub mod simd;
pub mod sparse_spectrum;

// Re-export commonly used types
pub use borda::{BordaAestheticConfig, BordaConfig, select_best_trajectory};

// These are library utilities that may not be used by the main binary but are part of the API
#[allow(unused_imports)]
pub use effect_fusion::{FusedEffectProcessor, FusedEffectConfig};
#[allow(unused_imports)]
pub use gaussian_lut::GaussianLUT;
#[allow(unused_imports)]
pub use memory_pool::FrameBufferPool;
#[allow(unused_imports)]
pub use sparse_spectrum::SparseSpectrum;
#[allow(unused_imports)]
pub use simd::{
    SimdPixel4, simd_blur_2d, simd_oklab_to_linear_srgb_batch, simd_process_effects_buffer,
    simd_spd_to_rgba_batch, simd_tonemap_buffer, SIMD_WIDTH,
};
