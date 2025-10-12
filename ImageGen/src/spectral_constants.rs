//! Shared constants for spectral color processing and wavelength conversions
//!
//! This module centralizes all spectral-related constants used throughout the rendering
//! pipeline, ensuring consistency and eliminating duplication.

use crate::spectrum::NUM_BINS;

/// Start of visible spectrum in nanometers
pub const LAMBDA_START: f64 = 380.0;

/// End of visible spectrum in nanometers  
pub const LAMBDA_END: f64 = 700.0;

/// Total range of visible spectrum
pub const LAMBDA_RANGE: f64 = LAMBDA_END - LAMBDA_START;

/// Width of each spectral bin in nanometers
pub const BIN_WIDTH: f64 = LAMBDA_RANGE / NUM_BINS as f64;

/// Convert wavelength (nm) to fractional bin position
///
/// # Arguments
/// * `wavelength` - Wavelength in nanometers, should be in range [LAMBDA_START, LAMBDA_END]
///
/// # Returns
/// Fractional bin position, clamped to valid range [0, NUM_BINS-1]
#[inline]
pub fn wavelength_to_bin(wavelength: f64) -> f64 {
    ((wavelength - LAMBDA_START) / BIN_WIDTH).clamp(0.0, (NUM_BINS - 1) as f64)
}

/// Convert bin index to center wavelength (nm)
///
/// # Arguments
/// * `bin` - Bin index in range [0, NUM_BINS)
///
/// # Returns
/// Center wavelength of the bin in nanometers
#[inline]
pub fn bin_to_wavelength(bin: usize) -> f64 {
    LAMBDA_START + (bin as f64 + 0.5) * BIN_WIDTH
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wavelength_to_bin() {
        // Test boundaries
        assert_eq!(wavelength_to_bin(LAMBDA_START), 0.0);
        assert!(wavelength_to_bin(LAMBDA_END) <= (NUM_BINS - 1) as f64);
        
        // Test middle of spectrum
        let mid_wavelength = (LAMBDA_START + LAMBDA_END) / 2.0;
        let mid_bin = wavelength_to_bin(mid_wavelength);
        assert!(mid_bin > 0.0 && mid_bin < (NUM_BINS - 1) as f64);
    }

    #[test]
    fn test_bin_to_wavelength() {
        // Test boundaries
        assert!(bin_to_wavelength(0) >= LAMBDA_START);
        assert!(bin_to_wavelength(NUM_BINS - 1) <= LAMBDA_END);
        
        // Test that bins are evenly spaced
        let w0 = bin_to_wavelength(0);
        let w1 = bin_to_wavelength(1);
        let spacing = w1 - w0;
        assert!((spacing - BIN_WIDTH).abs() < 1e-10);
    }

    #[test]
    fn test_roundtrip_conversion() {
        // Test that converting bin -> wavelength -> bin gives consistent results
        for bin in 0..NUM_BINS {
            let wavelength = bin_to_wavelength(bin);
            let bin_f = wavelength_to_bin(wavelength);
            // Should be within 0.5 bins (since we use bin center)
            assert!((bin_f - bin as f64).abs() < 0.51);
        }
    }
}

