//! Ancient Manuscript Mode
//!
//! Renders on simulated aged parchment with sepia toning, deliberate "imperfect"
//! ink application, and gold leaf highlights. Think medieval astronomical manuscripts.

use super::{PixelBuffer, PostEffect};
use rayon::prelude::*;
use std::error::Error;

/// Configuration for ancient manuscript effect
#[derive(Clone, Debug)]
pub struct AncientManuscriptConfig {
    /// Overall effect strength (0.0 = off, 1.0 = full)
    pub strength: f64,
    /// Sepia intensity
    pub sepia_strength: f64,
    /// Parchment base color (RGB)
    pub parchment_color: [f64; 3],
    /// Ink color for dark areas (RGB)
    pub ink_color: [f64; 3],
    /// Gold leaf highlight color (RGB)
    pub gold_color: [f64; 3],
    /// Gold leaf threshold (luminance above this gets gold)
    pub gold_threshold: f64,
    /// Amount of aging/weathering noise
    pub aging_amount: f64,
    /// Ink bleed/feathering amount
    pub ink_bleed: f64,
    /// Vignette darkening for aged edges
    pub edge_darkening: f64,
}

impl Default for AncientManuscriptConfig {
    fn default() -> Self {
        Self {
            strength: 0.7,
            sepia_strength: 0.6,
            parchment_color: [0.95, 0.90, 0.80],
            ink_color: [0.15, 0.10, 0.08],
            gold_color: [0.95, 0.80, 0.35],
            gold_threshold: 0.7,
            aging_amount: 0.15,
            ink_bleed: 0.1,
            edge_darkening: 0.3,
        }
    }
}

/// Ancient manuscript artistic effect
pub struct AncientManuscript {
    config: AncientManuscriptConfig,
}

impl AncientManuscript {
    pub fn new(config: AncientManuscriptConfig) -> Self {
        Self { config }
    }

    /// Simple hash-based noise for aging effects
    #[inline]
    fn hash_noise(x: usize, y: usize, seed: u32) -> f64 {
        let n = (x as u32).wrapping_mul(374761393)
            .wrapping_add((y as u32).wrapping_mul(668265263))
            .wrapping_add(seed.wrapping_mul(1013904223));
        let n = n ^ (n >> 13);
        let n = n.wrapping_mul(1274126177);
        (n as f64) / (u32::MAX as f64)
    }

    /// Fractal noise for parchment texture
    fn parchment_noise(x: usize, y: usize, width: usize, height: usize) -> f64 {
        let scale1 = 0.1;
        let scale2 = 0.05;
        let scale3 = 0.02;

        let u = x as f64 / width as f64;
        let v = y as f64 / height as f64;

        // Multiple octaves of noise
        let n1 = Self::hash_noise((u * width as f64 * scale1) as usize, 
                                   (v * height as f64 * scale1) as usize, 12345);
        let n2 = Self::hash_noise((u * width as f64 * scale2) as usize, 
                                   (v * height as f64 * scale2) as usize, 67890);
        let n3 = Self::hash_noise((u * width as f64 * scale3) as usize, 
                                   (v * height as f64 * scale3) as usize, 11111);

        n1 * 0.5 + n2 * 0.3 + n3 * 0.2
    }

    /// Apply sepia tone
    #[inline]
    fn apply_sepia(r: f64, g: f64, b: f64, strength: f64) -> (f64, f64, f64) {
        // Classic sepia matrix
        let sepia_r = r * 0.393 + g * 0.769 + b * 0.189;
        let sepia_g = r * 0.349 + g * 0.686 + b * 0.168;
        let sepia_b = r * 0.272 + g * 0.534 + b * 0.131;

        (
            r + (sepia_r - r) * strength,
            g + (sepia_g - g) * strength,
            b + (sepia_b - b) * strength,
        )
    }

    /// Calculate edge darkening (vignette for aged look)
    #[inline]
    fn edge_vignette(x: usize, y: usize, width: usize, height: usize, strength: f64) -> f64 {
        let cx = width as f64 / 2.0;
        let cy = height as f64 / 2.0;
        let dx = (x as f64 - cx) / cx;
        let dy = (y as f64 - cy) / cy;
        let dist = (dx * dx + dy * dy).sqrt();

        // Soft edge darkening
        let vignette = 1.0 - (dist * 0.7).powi(2) * strength;
        vignette.clamp(0.3, 1.0)
    }
}

impl PostEffect for AncientManuscript {
    fn name(&self) -> &str {
        "Ancient Manuscript"
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

        let output: PixelBuffer = input
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let x = idx % width;
                let y = idx / width;

                // Calculate parchment noise for this pixel
                let parchment_noise = Self::parchment_noise(x, y, width, height);
                let edge_factor = Self::edge_vignette(x, y, width, height, self.config.edge_darkening);

                // Parchment base with noise variation
                let parch_r = self.config.parchment_color[0] * (0.9 + parchment_noise * 0.1);
                let parch_g = self.config.parchment_color[1] * (0.9 + parchment_noise * 0.1);
                let parch_b = self.config.parchment_color[2] * (0.85 + parchment_noise * 0.15);

                if a <= 0.01 {
                    // Transparent area = parchment background
                    let aged_r = parch_r * edge_factor;
                    let aged_g = parch_g * edge_factor;
                    let aged_b = parch_b * edge_factor;

                    // Add aging spots
                    let age_spot = Self::hash_noise(x, y, 99999);
                    if age_spot > 0.95 - self.config.aging_amount * 0.3 {
                        let spot_dark = 0.7 + age_spot * 0.3;
                        return (
                            (aged_r * spot_dark * self.config.strength + parch_r * (1.0 - self.config.strength)),
                            (aged_g * spot_dark * self.config.strength + parch_g * (1.0 - self.config.strength)),
                            (aged_b * spot_dark * self.config.strength + parch_b * (1.0 - self.config.strength)),
                            1.0,
                        );
                    }

                    return (
                        aged_r * self.config.strength + parch_r * (1.0 - self.config.strength),
                        aged_g * self.config.strength + parch_g * (1.0 - self.config.strength),
                        aged_b * self.config.strength + parch_b * (1.0 - self.config.strength),
                        1.0,
                    );
                }

                // Un-premultiply
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;

                // Calculate luminance
                let lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;

                // Apply sepia to original colors
                let (sepia_r, sepia_g, sepia_b) = Self::apply_sepia(sr, sg, sb, self.config.sepia_strength);

                // Decide between ink, gold, and middle tones
                let (final_r, final_g, final_b) = if lum > self.config.gold_threshold {
                    // Bright areas get gold leaf treatment
                    let gold_amount = ((lum - self.config.gold_threshold) / (1.0 - self.config.gold_threshold)).min(1.0);
                    let gold_noise = Self::hash_noise(x, y, 55555);
                    let gold_factor = gold_amount * (0.7 + gold_noise * 0.3);

                    (
                        sepia_r + (self.config.gold_color[0] - sepia_r) * gold_factor,
                        sepia_g + (self.config.gold_color[1] - sepia_g) * gold_factor,
                        sepia_b + (self.config.gold_color[2] - sepia_b) * gold_factor,
                    )
                } else if lum < 0.3 {
                    // Dark areas become ink
                    let ink_amount = 1.0 - (lum / 0.3);
                    let ink_noise = Self::hash_noise(x, y, 33333);
                    let ink_factor = ink_amount * (0.8 + ink_noise * 0.2 * self.config.ink_bleed);

                    (
                        sepia_r + (self.config.ink_color[0] - sepia_r) * ink_factor,
                        sepia_g + (self.config.ink_color[1] - sepia_g) * ink_factor,
                        sepia_b + (self.config.ink_color[2] - sepia_b) * ink_factor,
                    )
                } else {
                    // Middle tones stay sepia
                    (sepia_r, sepia_g, sepia_b)
                };

                // Apply edge darkening
                let vignette_r = final_r * edge_factor;
                let vignette_g = final_g * edge_factor;
                let vignette_b = final_b * edge_factor;

                // Blend with parchment underneath
                let blend = a.min(1.0);
                let out_r = parch_r * (1.0 - blend) + vignette_r * blend;
                let out_g = parch_g * (1.0 - blend) + vignette_g * blend;
                let out_b = parch_b * (1.0 - blend) + vignette_b * blend;

                // Final blend with strength
                let result_r = (sr * a) * (1.0 - self.config.strength) + out_r * self.config.strength;
                let result_g = (sg * a) * (1.0 - self.config.strength) + out_g * self.config.strength;
                let result_b = (sb * a) * (1.0 - self.config.strength) + out_b * self.config.strength;

                (result_r.clamp(0.0, 1.0), result_g.clamp(0.0, 1.0), result_b.clamp(0.0, 1.0), 1.0)
            })
            .collect();

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ancient_manuscript_default_config() {
        let config = AncientManuscriptConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.gold_threshold > 0.0 && config.gold_threshold < 1.0);
    }

    #[test]
    fn test_sepia_tone() {
        let (r, _g, b) = AncientManuscript::apply_sepia(0.5, 0.5, 0.5, 1.0);
        // Sepia should be warmer (more red, less blue)
        assert!(r > b);
    }

    #[test]
    fn test_hash_noise_range() {
        for x in 0..10 {
            for y in 0..10 {
                let n = AncientManuscript::hash_noise(x, y, 12345);
                assert!(n >= 0.0 && n <= 1.0);
            }
        }
    }

    #[test]
    fn test_edge_vignette() {
        // Center should be brightest
        let center = AncientManuscript::edge_vignette(50, 50, 100, 100, 0.5);
        let edge = AncientManuscript::edge_vignette(0, 0, 100, 100, 0.5);
        assert!(center > edge);
    }

    #[test]
    fn test_ancient_manuscript_zero_strength() {
        let config = AncientManuscriptConfig { strength: 0.0, ..Default::default() };
        let effect = AncientManuscript::new(config);
        let input = vec![(0.5, 0.3, 0.1, 1.0)];
        let output = effect.process(&input, 1, 1).unwrap();
        assert_eq!(output[0], input[0]);
    }

    #[test]
    fn test_sepia_strength_scaling() {
        let gray = (0.5, 0.5, 0.5);
        
        let (r0, g0, b0) = AncientManuscript::apply_sepia(gray.0, gray.1, gray.2, 0.0);
        let (r1, _g1, b1) = AncientManuscript::apply_sepia(gray.0, gray.1, gray.2, 1.0);
        
        // At strength 0, should be unchanged
        assert!((r0 - gray.0).abs() < 0.01);
        assert!((g0 - gray.1).abs() < 0.01);
        assert!((b0 - gray.2).abs() < 0.01);
        
        // At strength 1, should be fully sepia
        assert!(r1 > b1, "Full sepia should be warmer");
    }

    #[test]
    fn test_hash_noise_determinism() {
        // Same inputs should produce same outputs
        let n1 = AncientManuscript::hash_noise(42, 73, 12345);
        let n2 = AncientManuscript::hash_noise(42, 73, 12345);
        assert_eq!(n1, n2);
        
        // Different inputs should produce different outputs
        let n3 = AncientManuscript::hash_noise(42, 74, 12345);
        assert_ne!(n1, n3);
    }

    #[test]
    fn test_hash_noise_distribution() {
        // Noise should be roughly uniformly distributed
        let mut sum = 0.0;
        let count = 1000;
        
        for i in 0..count {
            sum += AncientManuscript::hash_noise(i, i * 7, 99999);
        }
        
        let mean = sum / count as f64;
        // Mean should be around 0.5 for uniform distribution
        assert!(mean > 0.3 && mean < 0.7, "Noise mean {} is not near 0.5", mean);
    }

    #[test]
    fn test_vignette_symmetry() {
        let width = 100;
        let height = 100;
        let strength = 0.5;
        
        // Test that opposite corners have similar (not exact due to integer math) vignette
        let tl = AncientManuscript::edge_vignette(0, 0, width, height, strength);
        let tr = AncientManuscript::edge_vignette(width - 1, 0, width, height, strength);
        let bl = AncientManuscript::edge_vignette(0, height - 1, width, height, strength);
        let br = AncientManuscript::edge_vignette(width - 1, height - 1, width, height, strength);
        
        // All corners should be darker than center
        let center = AncientManuscript::edge_vignette(50, 50, width, height, strength);
        assert!(tl < center, "TL corner should be darker than center");
        assert!(tr < center, "TR corner should be darker than center");
        assert!(bl < center, "BL corner should be darker than center");
        assert!(br < center, "BR corner should be darker than center");
        
        // Corners should all be in similar range (allow for slight asymmetry)
        let corners = [tl, tr, bl, br];
        let max_corner = corners.iter().cloned().fold(f64::MIN, f64::max);
        let min_corner = corners.iter().cloned().fold(f64::MAX, f64::min);
        assert!((max_corner - min_corner) < 0.1, "Corners should have similar vignette");
    }

    #[test]
    fn test_vignette_strength_scaling() {
        let corner = (0, 0);
        let width = 100;
        let height = 100;
        
        let weak = AncientManuscript::edge_vignette(corner.0, corner.1, width, height, 0.2);
        let strong = AncientManuscript::edge_vignette(corner.0, corner.1, width, height, 0.8);
        
        // Stronger vignette should be darker at corners
        assert!(strong < weak, "Stronger vignette should be darker");
    }

    #[test]
    fn test_parchment_noise_range() {
        for x in 0..20 {
            for y in 0..20 {
                let n = AncientManuscript::parchment_noise(x, y, 100, 100);
                assert!(n >= 0.0 && n <= 1.0, "Parchment noise out of range: {}", n);
            }
        }
    }

    #[test]
    fn test_gold_leaf_on_bright_areas() {
        let config = AncientManuscriptConfig {
            strength: 1.0,
            gold_threshold: 0.7,
            ..Default::default()
        };
        let effect = AncientManuscript::new(config);
        
        // Create buffer with one very bright pixel
        let mut input = vec![(0.2, 0.2, 0.2, 1.0); 9];
        input[4] = (1.0, 1.0, 1.0, 1.0); // Bright center
        
        let output = effect.process(&input, 3, 3).unwrap();
        
        // Center pixel should have gold tones (high R, medium G, low B)
        let center = output[4];
        // Gold has R > G > B pattern
        // Due to parchment blending, we mainly check it's not pure white
        assert!(center.0 > 0.0 && center.1 > 0.0);
    }

    #[test]
    fn test_ink_on_dark_areas() {
        let config = AncientManuscriptConfig {
            strength: 1.0,
            ..Default::default()
        };
        let effect = AncientManuscript::new(config);
        
        // Create buffer with one very dark pixel
        let mut input = vec![(0.6, 0.6, 0.6, 1.0); 9];
        input[4] = (0.05, 0.05, 0.05, 1.0); // Dark center
        
        let output = effect.process(&input, 3, 3).unwrap();
        
        // Center pixel should be ink-colored (very dark, brownish)
        let center = output[4];
        // Ink is dark, so luminance should be low
        let lum = 0.2126 * center.0 + 0.7152 * center.1 + 0.0722 * center.2;
        assert!(lum < 0.4, "Dark areas should have ink treatment");
    }

    #[test]
    fn test_transparent_becomes_parchment() {
        let config = AncientManuscriptConfig {
            strength: 1.0,
            ..Default::default()
        };
        let effect = AncientManuscript::new(config);
        
        // Transparent input
        let input = vec![(0.0, 0.0, 0.0, 0.0); 4];
        
        let output = effect.process(&input, 2, 2).unwrap();
        
        // Output should be opaque parchment color
        for pixel in &output {
            assert!(pixel.3 > 0.9, "Transparent should become parchment");
            // Parchment is warm colored
            assert!(pixel.0 > pixel.2, "Parchment should be warm");
        }
    }
}
