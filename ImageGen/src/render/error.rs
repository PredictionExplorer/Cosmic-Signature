//! Error types for render module

use thiserror::Error;

/// Errors that can occur during rendering
#[derive(Debug, Error)]
pub enum RenderError {
    #[error("Effect chain failed: {0}")]
    EffectChain(String),

    #[error("Video encoding failed")]
    VideoEncoding(#[from] std::io::Error),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Invalid dimensions: width={width}, height={height}")]
    InvalidDimensions { width: u32, height: u32 },

    #[error("Image encoding failed: {0}")]
    ImageEncoding(String),
}

/// Convenience type alias
pub type Result<T> = std::result::Result<T, RenderError>;
