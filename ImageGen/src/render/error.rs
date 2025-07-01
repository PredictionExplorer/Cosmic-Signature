//! Error types for the render module

use thiserror::Error;

/// Errors that can occur during rendering operations
#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum RenderError {
    /// Effect chain processing failed
    #[error("Effect chain failed: {0}")]
    EffectChain(String),
    
    /// Video encoding failed
    #[error("Video encoding failed: {0}")]
    VideoEncoding(#[from] std::io::Error),
    
    /// Invalid configuration provided
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    
    /// Image encoding/decoding error
    #[error("Image processing error: {0}")]
    ImageError(#[from] image::ImageError),
    
    /// FFmpeg process error
    #[error("FFmpeg process error: {message}")]
    FfmpegError { message: String },
    
    /// Invalid dimensions
    #[error("Invalid dimensions: width={width}, height={height}")]
    InvalidDimensions { width: u32, height: u32 },
    
    /// Empty data provided
    #[error("Empty data provided: {context}")]
    EmptyData { context: String },
    
    /// Numeric computation error
    #[error("Numeric error: {0}")]
    NumericError(String),
    
    /// Generic error wrapper for backward compatibility
    #[error(transparent)]
    Other(#[from] Box<dyn std::error::Error + Send + Sync>),
}

/// Result type alias for render operations
pub type RenderResult<T> = Result<T, RenderError>; 