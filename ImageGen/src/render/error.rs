//! Error types for the render module

use thiserror::Error;

/// Errors that can occur during rendering operations
#[derive(Debug, Error)]
pub enum RenderError {
    /// Video encoding failed
    #[error("Video encoding failed: {0}")]
    VideoEncoding(#[from] std::io::Error),
    
    /// Image encoding/decoding error
    #[error("Image processing error: {0}")]
    ImageError(#[from] image::ImageError),
    
    /// FFmpeg process error
    #[error("FFmpeg process error: {message}")]
    FfmpegError { message: String },
    
    /// Invalid dimensions
    #[error("Invalid dimensions: width={width}, height={height}")]
    InvalidDimensions { width: u32, height: u32 },
    
    /// Generic error wrapper for backward compatibility
    #[error(transparent)]
    Other(#[from] Box<dyn std::error::Error + Send + Sync>),
}

/// Result type alias for render operations
pub type RenderResult<T> = Result<T, RenderError>; 