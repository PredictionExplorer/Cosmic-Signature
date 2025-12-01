//! Drift configuration resolution with random generation support
//!
//! This module handles the logic for resolving drift parameters, either from
//! user-provided values or by generating random values based on the mode.

use crate::drift::DriftParameters;
use crate::sim::Sha3RandomByteStream;
use thiserror::Error;
use tracing::info;

/// Errors that can occur during drift configuration resolution.
#[derive(Debug, Error)]
pub enum DriftConfigError {
    /// Drift parameters were partially specified - all or none must be provided.
    #[error(
        "Drift parameters must be either all specified or all omitted. Provided: scale={scale:?}, arc_fraction={arc_fraction:?}, eccentricity={eccentricity:?}"
    )]
    PartialSpecification {
        scale: Option<f64>,
        arc_fraction: Option<f64>,
        eccentricity: Option<f64>,
    },
}

/// Resolved drift configuration ready for use
#[derive(Debug, Clone)]
pub struct ResolvedDriftConfig {
    pub scale: f64,
    pub arc_fraction: f64,
    pub orbit_eccentricity: f64,
    pub was_randomized: bool,
}

impl ResolvedDriftConfig {
    /// Create drift configuration from explicit values
    pub fn from_values(scale: f64, arc_fraction: f64, orbit_eccentricity: f64) -> Self {
        Self { scale, arc_fraction, orbit_eccentricity, was_randomized: false }
    }

    /// Generate random drift configuration based on special mode
    ///
    /// Biased toward higher arc_fraction and scale values based on analysis:
    /// - Amazing images: arc_fraction=0.578, scale=1.10
    /// - Boring images: arc_fraction=0.301, scale=0.67
    pub fn generate_random(rng: &mut Sha3RandomByteStream, special_mode: bool) -> Self {
        let (scale, arc_fraction, orbit_eccentricity) = if special_mode {
            // Special mode: wider ranges for more dramatic motion
            let scale = rng.next_f64() * 7.0; // 0.0 to 7.0
            let arc_fraction = rng.next_f64() * 0.5; // 0.0 to 0.5
            let orbit_eccentricity = 0.1 + rng.next_f64() * 0.4; // 0.1 to 0.5

            info!("Generated random drift parameters (special mode):");
            info!("  scale: {:.3}", scale);
            info!("  arc_fraction: {:.3}", arc_fraction);
            info!("  orbit_eccentricity: {:.3}", orbit_eccentricity);

            (scale, arc_fraction, orbit_eccentricity)
        } else {
            // Standard mode: biased toward higher values for better composition
            // Use beta distribution-like sampling for arc_fraction to favor higher values
            let r1 = rng.next_f64();
            let r2 = rng.next_f64();
            // Take maximum of two samples to bias toward higher values (beta-ish distribution)
            let arc_bias = r1.max(r2);

            // Map to range [0.35, 0.80] with bias toward upper half
            // Target: mean ~0.55 (vs Amazing=0.578, Good=0.450, Boring=0.301)
            let arc_fraction = 0.35 + arc_bias * 0.45;

            // Scale: bias toward higher values within [0.7, 2.0]
            // Target: mean ~1.2 (vs Amazing=1.10, Boring=0.67)
            let scale_r = rng.next_f64();
            let scale = 0.7 + scale_r * 1.3;

            // Eccentricity: keep existing range (no significant difference found)
            let orbit_eccentricity = 0.4 + rng.next_f64() * 0.1; // 0.4 to 0.5

            info!("Generated random drift parameters (standard mode):");
            info!("  scale: {:.3}", scale);
            info!("  arc_fraction: {:.3}", arc_fraction);
            info!("  orbit_eccentricity: {:.3}", orbit_eccentricity);

            (scale, arc_fraction, orbit_eccentricity)
        };

        Self { scale, arc_fraction, orbit_eccentricity, was_randomized: true }
    }

    /// Convert to DriftParameters for use in the drift system
    pub fn to_drift_parameters(&self) -> DriftParameters {
        DriftParameters::new(self.scale, self.arc_fraction, self.orbit_eccentricity)
    }
}

/// Helper to resolve drift configuration from optional command-line args.
///
/// # Errors
///
/// Returns `DriftConfigError::PartialSpecification` if some but not all drift parameters
/// are provided. All parameters must be specified together, or none at all.
///
/// # Example
///
/// ```
/// # use three_body_problem::drift_config::resolve_drift_config;
/// # use three_body_problem::sim::Sha3RandomByteStream;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let seed = b"test_seed";
/// # let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
/// // All parameters specified (valid)
/// let config = resolve_drift_config(Some(1.5), Some(0.3), Some(0.2), &mut rng, false)?;
///
/// // No parameters specified (valid - will randomize)
/// let config = resolve_drift_config(None, None, None, &mut rng, false)?;
///
/// // Partial specification (error)
/// let result = resolve_drift_config(Some(1.5), None, None, &mut rng, false);
/// assert!(result.is_err());
/// # Ok(())
/// # }
/// ```
pub fn resolve_drift_config(
    scale_opt: Option<f64>,
    arc_fraction_opt: Option<f64>,
    eccentricity_opt: Option<f64>,
    rng: &mut Sha3RandomByteStream,
    special_mode: bool,
) -> Result<ResolvedDriftConfig, DriftConfigError> {
    match (scale_opt, arc_fraction_opt, eccentricity_opt) {
        (Some(scale), Some(arc), Some(ecc)) => {
            // All parameters provided
            info!("Using user-specified drift parameters:");
            info!("  scale: {:.3}", scale);
            info!("  arc_fraction: {:.3}", arc);
            info!("  orbit_eccentricity: {:.3}", ecc);
            Ok(ResolvedDriftConfig::from_values(scale, arc, ecc))
        }
        (None, None, None) => {
            // No parameters provided - generate random
            info!("No drift parameters specified, generating random values...");
            Ok(ResolvedDriftConfig::generate_random(rng, special_mode))
        }
        _ => {
            // Partial specification - this is an error condition
            Err(DriftConfigError::PartialSpecification {
                scale: scale_opt,
                arc_fraction: arc_fraction_opt,
                eccentricity: eccentricity_opt,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_rng() -> Sha3RandomByteStream {
        let seed = [0x42u8; 32];
        Sha3RandomByteStream::new(&seed, 1.0, 2.0, 1.0, 1.0)
    }

    #[test]
    fn test_from_values() {
        let config = ResolvedDriftConfig::from_values(1.5, 0.3, 0.2);
        assert_eq!(config.scale, 1.5);
        assert_eq!(config.arc_fraction, 0.3);
        assert_eq!(config.orbit_eccentricity, 0.2);
        assert!(!config.was_randomized);
    }

    #[test]
    fn test_generate_random_special() {
        let mut rng = make_rng();
        let config = ResolvedDriftConfig::generate_random(&mut rng, true);

        // Special mode ranges
        assert!(config.scale >= 0.0 && config.scale <= 7.0);
        assert!(config.arc_fraction >= 0.0 && config.arc_fraction <= 0.5);
        assert!(config.orbit_eccentricity >= 0.1 && config.orbit_eccentricity <= 0.5);
        assert!(config.was_randomized);
    }

    #[test]
    fn test_generate_random_standard() {
        let mut rng = make_rng();
        let config = ResolvedDriftConfig::generate_random(&mut rng, false);

        // Standard mode ranges (updated to match biased distributions)
        assert!(config.scale >= 0.7 && config.scale <= 2.0, "scale out of range: {}", config.scale);
        assert!(
            config.arc_fraction >= 0.35 && config.arc_fraction <= 0.80,
            "arc_fraction out of range: {}",
            config.arc_fraction
        );
        assert!(
            config.orbit_eccentricity >= 0.4 && config.orbit_eccentricity <= 0.5,
            "orbit_eccentricity out of range: {}",
            config.orbit_eccentricity
        );
        assert!(config.was_randomized);
    }

    #[test]
    fn test_resolve_all_provided() {
        let mut rng = make_rng();
        let result = resolve_drift_config(Some(1.0), Some(0.5), Some(0.3), &mut rng, false);
        assert!(result.is_ok());

        let config = result.unwrap();
        assert_eq!(config.scale, 1.0);
        assert!(!config.was_randomized);
    }

    #[test]
    fn test_resolve_none_provided() {
        let mut rng = make_rng();
        let result = resolve_drift_config(None, None, None, &mut rng, false);
        assert!(result.is_ok());

        let config = result.unwrap();
        assert!(config.was_randomized);
    }

    #[test]
    fn test_resolve_partial_returns_error() {
        let mut rng = make_rng();
        let result = resolve_drift_config(Some(1.0), None, None, &mut rng, false);
        assert!(result.is_err());

        if let Err(DriftConfigError::PartialSpecification { scale, arc_fraction, eccentricity }) =
            result
        {
            assert_eq!(scale, Some(1.0));
            assert_eq!(arc_fraction, None);
            assert_eq!(eccentricity, None);
        } else {
            panic!("Expected PartialSpecification error");
        }
    }
}
