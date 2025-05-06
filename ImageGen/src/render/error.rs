//! Error types for render module

use thiserror::Error;

/// Errors that can occur during rendering
#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum RenderError {
    #[error("Effect chain failed: {0}")]
    EffectChain(String),

    #[error("Video encoding failed")]
    VideoEncoding(#[from] std::io::Error),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Color conversion out of range: {value} for channel {channel}")]
    ColorConversion { value: f64, channel: &'static str },

    #[error("Invalid dimensions: width={width}, height={height}")]
    InvalidDimensions { width: u32, height: u32 },

    #[error("Histogram computation failed: {0}")]
    Histogram(String),

    #[error("Frame {frame} processing failed: {reason}")]
    FrameProcessing { frame: usize, reason: String },

    #[error("Image encoding failed: {0}")]
    ImageEncoding(String),

    #[error("Post-processing failed: {0}")]
    PostProcessing(String),

    #[error("Render pipeline error: {0}")]
    Pipeline(String),

    #[error("Memory allocation failed: {0}")]
    Allocation(String),

    #[error("Invalid parameter: {name}={value}, reason: {reason}")]
    InvalidParameter { name: &'static str, value: String, reason: String },
}

/// Convenience type alias
pub type Result<T> = std::result::Result<T, RenderError>;
