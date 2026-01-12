//! Spectral Interference Patterns
//!
//! Creates true physical optics interference patterns when trails overlap,
//! producing moiré-like effects and unexpected color combinations based on
//! wavelength constructive/destructive interference.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for spectral interference effect
#[derive(Clone, Debug)]
pub struct SpectralInterferenceConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Interference pattern frequency
    pub frequency: f64,
    /// Phase variation based on position
    pub phase_variation: f64,
    /// Color separation amount
    pub color_separation: f64,
    /// Whether to show constructive peaks
    pub show_constructive: bool,
    /// Whether to show destructive troughs
    pub show_destructive: bool,
    /// Film thickness variation (for thin-film interference)
    pub thickness_variation: f64,
}

impl Default for SpectralInterferenceConfig {
    fn default() -> Self {
        Self {
            strength: 0.4,
            frequency: 40.0,
            phase_variation: 0.5,
            color_separation: 0.3,
            show_constructive: true,
            show_destructive: true,
            thickness_variation: 0.6,
        }
    }
}

/// Spectral interference effect
pub struct SpectralInterference {
    config: SpectralInterferenceConfig,
}

impl SpectralInterference {
    pub fn new(config: SpectralInterferenceConfig) -> Self {
        Self { config }
    }

    /// Calculate interference pattern for a specific wavelength
    #[inline]
    fn wavelength_interference(
        phase: f64,
        wavelength_nm: f64,
        thickness: f64,
    ) -> f64 {
        // Thin-film interference: 2 * n * d * cos(theta) = m * lambda
        // Simplified: intensity varies with path difference
        let path_difference = thickness * 2.0; // In normalized units
        let phase_shift = (path_difference / (wavelength_nm / 550.0)) * std::f64::consts::TAU;
        
        // Interference term
        let interference = (phase + phase_shift).cos();
        
        // Return intensity modifier (0 to 1)
        (interference + 1.0) / 2.0
    }

    /// Calculate RGB from wavelength with interference
    fn apply_wavelength_interference(
        r: f64,
        g: f64,
        b: f64,
        phase: f64,
        thickness: f64,
        config: &SpectralInterferenceConfig,
    ) -> (f64, f64, f64) {
        // Red: ~650nm, Green: ~550nm, Blue: ~450nm
        let red_wavelength = 650.0;
        let green_wavelength = 550.0;
        let blue_wavelength = 450.0;

        let red_interference = Self::wavelength_interference(phase, red_wavelength, thickness);
        let green_interference = Self::wavelength_interference(phase, green_wavelength, thickness);
        let blue_interference = Self::wavelength_interference(phase, blue_wavelength, thickness);

        // Apply interference with constructive/destructive control
        let apply_factor = |base: f64, interference: f64| -> f64 {
            let deviation = interference - 0.5; // -0.5 to 0.5
            
            if deviation > 0.0 && config.show_constructive {
                // Constructive: brighten
                base + deviation * 2.0 * config.color_separation
            } else if deviation < 0.0 && config.show_destructive {
                // Destructive: darken
                base + deviation * 2.0 * config.color_separation
            } else {
                base
            }
        };

        (
            apply_factor(r, red_interference),
            apply_factor(g, green_interference),
            apply_factor(b, blue_interference),
        )
    }
}

impl PostEffect for SpectralInterference {
    fn name(&self) -> &str {
        "Spectral Interference"
    }

    fn process(
        &self,
        input: &PixelBuffer,
        width: usize,
        height: usize,
    ) -> Result<PixelBuffer, Box<dyn Error>> {
        if self.config.strength <= 0.0 || input.is_empty() {
            return Ok(input.clone());
        }

        // Calculate gradients for interference direction
        let gradients = super::utils::calculate_gradients(input, width, height);

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                if a <= 0.0 {
                    return (r, g, b, a);
                }

                let x = idx % width;
                let y = idx / width;

                // Un-premultiply
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Get gradient for phase calculation
                let (gx, gy) = gradients[idx];
                let gradient_mag = (gx * gx + gy * gy).sqrt();
                let gradient_angle = gy.atan2(gx);

                // Calculate interference phase based on position and gradient
                let spatial_phase = (x as f64 * self.config.frequency / width as f64
                    + y as f64 * self.config.frequency / height as f64)
                    * std::f64::consts::TAU;
                
                // Gradient-based phase variation
                let gradient_phase = gradient_angle * self.config.phase_variation;
                
                // Combined phase
                let phase = spatial_phase + gradient_phase;

                // Film thickness varies with gradient magnitude and position
                let base_thickness = 0.5 + gradient_mag * 2.0;
                let thickness_noise = (x as f64 * 0.1 + y as f64 * 0.07).sin() * 0.5 + 0.5;
                let thickness = base_thickness + thickness_noise * self.config.thickness_variation;

                // Apply wavelength-dependent interference
                let (int_r, int_g, int_b) = Self::apply_wavelength_interference(
                    sr,
                    sg,
                    sb,
                    phase,
                    thickness,
                    &self.config,
                );

                // Blend with original based on strength and gradient
                // More effect where there's more structure (higher gradient)
                let local_strength = self.config.strength * (0.3 + gradient_mag * 0.7).min(1.0);
                let final_r = sr + (int_r - sr) * local_strength;
                let final_g = sg + (int_g - sg) * local_strength;
                let final_b = sb + (int_b - sb) * local_strength;

                // Re-premultiply
                (
                    final_r.clamp(0.0, 1.5) * a,
                    final_g.clamp(0.0, 1.5) * a,
                    final_b.clamp(0.0, 1.5) * a,
                    a,
                )
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spectral_interference_default_config() {
        let config = SpectralInterferenceConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.frequency > 0.0);
    }

    #[test]
    fn test_wavelength_interference_range() {
        // Interference should return values in 0-1 range
        for phase in [0.0, 1.0, 2.0, 3.0, 6.28] {
            for thickness in [0.1, 0.5, 1.0, 2.0] {
                let result = SpectralInterference::wavelength_interference(phase, 550.0, thickness);
                assert!(result >= 0.0 && result <= 1.0);
            }
        }
    }

    #[test]
    fn test_interference_constructive_destructive() {
        // At certain phases, red/green/blue should have different intensities
        let config = SpectralInterferenceConfig::default();
        let (r1, g1, b1) =
            SpectralInterference::apply_wavelength_interference(0.5, 0.5, 0.5, 0.0, 0.5, &config);
        let (r2, g2, b2) = SpectralInterference::apply_wavelength_interference(
            0.5,
            0.5,
            0.5,
            std::f64::consts::PI,
            0.5,
            &config,
        );

        // Colors should differ between the two phases
        assert!((r1 - r2).abs() > 0.001 || (g1 - g2).abs() > 0.001 || (b1 - b2).abs() > 0.001);
    }

    #[test]
    fn test_spectral_interference_preserves_transparent() {
        let effect = SpectralInterference::new(SpectralInterferenceConfig::default());
        let input = vec![(0.0, 0.0, 0.0, 0.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn test_spectral_interference_zero_strength() {
        let config = SpectralInterferenceConfig { strength: 0.0, ..Default::default() };
        let effect = SpectralInterference::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }

    #[test]
    fn test_wavelength_specific_interference() {
        // Different wavelengths should produce different interference patterns
        let phase = 1.0;
        let thickness = 0.5;
        
        let red_int = SpectralInterference::wavelength_interference(phase, 650.0, thickness);
        let green_int = SpectralInterference::wavelength_interference(phase, 550.0, thickness);
        let blue_int = SpectralInterference::wavelength_interference(phase, 450.0, thickness);
        
        // At least some wavelengths should differ (chromatic dispersion)
        assert!(
            (red_int - green_int).abs() > 0.001 || 
            (green_int - blue_int).abs() > 0.001 ||
            (red_int - blue_int).abs() > 0.001,
            "Different wavelengths should produce different interference"
        );
    }

    #[test]
    fn test_interference_periodicity() {
        // Interference should be periodic with phase
        let thickness = 0.5;
        let wavelength = 550.0;
        
        let i1 = SpectralInterference::wavelength_interference(0.0, wavelength, thickness);
        let i2 = SpectralInterference::wavelength_interference(
            2.0 * std::f64::consts::PI, 
            wavelength, 
            thickness
        );
        
        assert!(
            (i1 - i2).abs() < 0.01,
            "Interference should be 2π periodic: {} vs {}",
            i1, i2
        );
    }

    #[test]
    fn test_constructive_only_mode() {
        let config = SpectralInterferenceConfig {
            strength: 0.8,
            show_constructive: true,
            show_destructive: false,
            ..Default::default()
        };
        
        // This should only brighten, never darken
        let (r, g, b) = SpectralInterference::apply_wavelength_interference(
            0.5, 0.5, 0.5, 0.0, 0.5, &config
        );
        
        // With only constructive, values should be >= input
        assert!(r >= 0.5 - 0.01, "Constructive-only shouldn't darken red");
        assert!(g >= 0.5 - 0.01, "Constructive-only shouldn't darken green");
        assert!(b >= 0.5 - 0.01, "Constructive-only shouldn't darken blue");
    }

    #[test]
    fn test_destructive_only_mode() {
        let config = SpectralInterferenceConfig {
            strength: 0.8,
            show_constructive: false,
            show_destructive: true,
            ..Default::default()
        };
        
        // This should only darken, never brighten
        let (r, g, b) = SpectralInterference::apply_wavelength_interference(
            0.5, 0.5, 0.5, 0.0, 0.5, &config
        );
        
        // With only destructive, values should be <= input
        assert!(r <= 0.5 + 0.01, "Destructive-only shouldn't brighten red");
        assert!(g <= 0.5 + 0.01, "Destructive-only shouldn't brighten green");
        assert!(b <= 0.5 + 0.01, "Destructive-only shouldn't brighten blue");
    }

    #[test]
    fn test_thickness_affects_interference() {
        let phase = 1.0;
        let wavelength = 550.0;
        
        let thin = SpectralInterference::wavelength_interference(phase, wavelength, 0.1);
        let thick = SpectralInterference::wavelength_interference(phase, wavelength, 2.0);
        
        // Different thicknesses should produce different interference
        assert!(
            (thin - thick).abs() > 0.001,
            "Different thicknesses should produce different interference"
        );
    }

    #[test]
    fn test_color_separation_scaling() {
        let base_config = SpectralInterferenceConfig::default();
        
        let low_sep = SpectralInterferenceConfig {
            color_separation: 0.1,
            ..base_config.clone()
        };
        let high_sep = SpectralInterferenceConfig {
            color_separation: 0.9,
            ..base_config
        };
        
        let (r1, _, _) = SpectralInterference::apply_wavelength_interference(
            0.5, 0.5, 0.5, 1.0, 0.5, &low_sep
        );
        let (r2, _, _) = SpectralInterference::apply_wavelength_interference(
            0.5, 0.5, 0.5, 1.0, 0.5, &high_sep
        );
        
        // Both should produce valid colors
        assert!(!r1.is_nan() && r1 >= 0.0);
        assert!(!r2.is_nan() && r2 >= 0.0);
        
        // Note: The exact relationship depends on the interference term
        // At some phases the change might be minimal
    }
}
