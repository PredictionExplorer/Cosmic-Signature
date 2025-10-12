//! Comprehensive error handling for the Three Body Problem visualization system
//!
//! This module provides a unified error type hierarchy for all operations in the system,
//! enabling proper error propagation and recovery instead of panics.

use std::error::Error;
use std::fmt;

/// Result type alias using our custom error type
pub type Result<T> = std::result::Result<T, AppError>;

/// Top-level application error encompassing all possible failure modes
#[derive(Debug)]
pub enum AppError {
    /// Simulation-related errors
    Simulation(SimulationError),
    
    /// Rendering-related errors
    Render(RenderError),
    
    /// Configuration and input validation errors
    Config(ConfigError),
    
    /// File I/O errors
    Io(std::io::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Simulation(e) => write!(f, "Simulation error: {}", e),
            Self::Render(e) => write!(f, "Rendering error: {}", e),
            Self::Config(e) => write!(f, "Configuration error: {}", e),
            Self::Io(e) => write!(f, "I/O error: {}", e),
        }
    }
}

impl Error for AppError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Simulation(e) => Some(e),
            Self::Render(e) => Some(e),
            Self::Config(e) => Some(e),
            Self::Io(e) => Some(e),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<SimulationError> for AppError {
    fn from(error: SimulationError) -> Self {
        Self::Simulation(error)
    }
}

impl From<RenderError> for AppError {
    fn from(error: RenderError) -> Self {
        Self::Render(error)
    }
}

impl From<ConfigError> for AppError {
    fn from(error: ConfigError) -> Self {
        Self::Config(error)
    }
}

impl From<crate::render::error::RenderError> for AppError {
    fn from(error: crate::render::error::RenderError) -> Self {
        Self::Render(RenderError::Inner(error))
    }
}

/// Errors that can occur during physics simulation
#[derive(Debug)]
pub enum SimulationError {
    /// No valid orbits found after filtering and escape checks
    NoValidOrbits {
        total_attempted: usize,
        discarded: usize,
        reason: String,
    },
}

impl fmt::Display for SimulationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoValidOrbits { total_attempted, discarded, reason } => {
                write!(
                    f,
                    "No valid orbits found after filtering {}/{} candidates. Reason: {}",
                    discarded, total_attempted, reason
                )
            }
        }
    }
}

impl Error for SimulationError {}

/// Errors that can occur during rendering operations
#[derive(Debug)]
pub enum RenderError {
    /// Wraps the existing render::error::RenderError
    Inner(crate::render::error::RenderError),
    
    /// Invalid rendering dimensions
    InvalidDimensions {
        width: u32,
        height: u32,
        reason: String,
    },
}

impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Inner(e) => write!(f, "{}", e),
            Self::InvalidDimensions { width, height, reason } => {
                write!(f, "Invalid dimensions {}x{}: {}", width, height, reason)
            }
        }
    }
}

impl Error for RenderError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Inner(e) => Some(e),
            _ => None,
        }
    }
}

/// Configuration and validation errors
#[derive(Debug)]
pub enum ConfigError {
    /// Invalid seed format
    InvalidSeed {
        seed: String,
        error: hex::FromHexError,
    },
    
    /// File system error
    FileSystem {
        operation: String,
        path: String,
        error: std::io::Error,
    },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSeed { seed, error } => {
                write!(f, "Invalid hex seed '{}': {}", seed, error)
            }
            Self::FileSystem { operation, path, error } => {
                write!(f, "Failed to {} '{}': {}", operation, path, error)
            }
        }
    }
}

impl Error for ConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidSeed { error, .. } => Some(error),
            Self::FileSystem { error, .. } => Some(error),
        }
    }
}

/// Helper functions for common validation patterns
pub mod validation {
    use super::*;
    
    /// Validate that dimensions are non-zero and reasonable
    pub fn validate_dimensions(width: u32, height: u32) -> Result<()> {
        if width == 0 || height == 0 {
            return Err(RenderError::InvalidDimensions {
                width,
                height,
                reason: "Dimensions must be greater than zero".to_string(),
            }
            .into());
        }
        
        const MAX_DIMENSION: u32 = 16384; // 16K
        if width > MAX_DIMENSION || height > MAX_DIMENSION {
            return Err(RenderError::InvalidDimensions {
                width,
                height,
                reason: format!("Dimensions must not exceed {}", MAX_DIMENSION),
            }
            .into());
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_dimensions() {
        assert!(validation::validate_dimensions(1920, 1080).is_ok());
        assert!(validation::validate_dimensions(0, 1080).is_err());
        assert!(validation::validate_dimensions(1920, 0).is_err());
        assert!(validation::validate_dimensions(20000, 1080).is_err());
    }
    
    #[test]
    fn test_error_display() {
        let err = SimulationError::NoValidOrbits {
            total_attempted: 100,
            discarded: 95,
            reason: "All orbits escaped".to_string(),
        };
        
        let display = format!("{}", err);
        assert!(display.contains("95/100"));
        assert!(display.contains("escaped"));
    }
}

