//! Diffraction Spikes / Airy Halo
//!
//! Emulates starburst diffraction around bright highlights with subtle
//! airy halos for a scientific, optical look.

use super::{PixelBuffer, PostEffect};
use crate::post_effects::utils;
use crate::render::constants;
use rayon::prelude::*;
use std::error::Error;

/// Configuration for diffraction spikes effect.
#[derive(Clone, Debug)]
pub struct DiffractionSpikesConfig {
    /// Overall effect strength (0.0 = off)
    pub strength: f64,
    /// Luminance threshold for highlights
    pub threshold: f64,
    /// Soft knee for the threshold
    pub knee: f64,
    /// Spike length in pixels
    pub spike_length: f64,
    /// Falloff exponent along spike length
    pub spike_falloff: f64,
    /// Samples per spike direction
    pub sample_count: usize,
    /// Central airy halo strength
    pub halo_strength: f64,
}

impl Default for DiffractionSpikesConfig {
    fn default() -> Self {
        Self {
            strength: constants::DEFAULT_DIFFRACTION_STRENGTH,
            threshold: constants::DEFAULT_DIFFRACTION_THRESHOLD,
            knee: constants::DEFAULT_DIFFRACTION_KNEE,
            spike_length: constants::DEFAULT_DIFFRACTION_SPIKE_LENGTH,
            spike_falloff: constants::DEFAULT_DIFFRACTION_SPIKE_FALLOFF,
            sample_count: constants::DEFAULT_DIFFRACTION_SAMPLE_COUNT,
            halo_strength: constants::DEFAULT_DIFFRACTION_HALO_STRENGTH,
        }
    }
}

/// Diffraction spikes post effect.
pub struct DiffractionSpikes {
    config: DiffractionSpikesConfig,
}

impl DiffractionSpikes {
    pub fn new(config: DiffractionSpikesConfig) -> Self {
        Self { config }
    }

    fn build_highlight_buffer(&self, input: &PixelBuffer) -> PixelBuffer {
        let threshold = self.config.threshold.clamp(0.0, 1.0);
        let knee = self.config.knee.max(1e-6);
        input
            .par_iter()
            .map(|&(r, g, b, a)| {
                if a <= 1e-10 {
                    return (0.0, 0.0, 0.0, 0.0);
                }
                let sr = r / a;
                let sg = g / a;
                let sb = b / a;
                let lum = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb).clamp(0.0, 1.0);
                let t = ((lum - threshold) / knee).clamp(0.0, 1.0);
                let highlight = t * t * (3.0 - 2.0 * t);
                (
                    sr * highlight * a,
                    sg * highlight * a,
                    sb * highlight * a,
                    a * highlight,
                )
            })
            .collect()
    }
}

impl PostEffect for DiffractionSpikes {
    fn name(&self) -> &str {
        "Diffraction Spikes"
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

        let highlight_buffer = self.build_highlight_buffer(input);
        let sample_count = self.config.sample_count.max(1);
        let inv_samples = 1.0 / sample_count as f64;

        let mut weights = Vec::with_capacity(sample_count);
        for i in 1..=sample_count {
            let t = i as f64 * inv_samples;
            weights.push((1.0 - t).powf(self.config.spike_falloff));
        }
        let weight_sum_dir: f64 = weights.iter().sum();
        let normalization =
            1.0 / (weight_sum_dir * 4.0 * 2.0 + self.config.halo_strength.max(0.0));

        let directions = [
            (1.0, 0.0),
            (0.0, 1.0),
            (0.7071067811865476, 0.7071067811865476),
            (0.7071067811865476, -0.7071067811865476),
        ];

        let output: PixelBuffer = (0..input.len())
            .into_par_iter()
            .map(|idx| {
                let base = input[idx];
                let x = (idx % width) as f64;
                let y = (idx / width) as f64;

                let mut spike = (0.0, 0.0, 0.0, 0.0);

                for &(dx, dy) in &directions {
                    for (step, &weight) in weights.iter().enumerate() {
                        let offset = self.config.spike_length * (step as f64 + 1.0) * inv_samples;
                        let sx1 = x + dx * offset;
                        let sy1 = y + dy * offset;
                        let sx2 = x - dx * offset;
                        let sy2 = y - dy * offset;
                        let sample1 = utils::sample_bilinear(&highlight_buffer, width, height, sx1, sy1);
                        let sample2 = utils::sample_bilinear(&highlight_buffer, width, height, sx2, sy2);
                        spike.0 += (sample1.0 + sample2.0) * weight;
                        spike.1 += (sample1.1 + sample2.1) * weight;
                        spike.2 += (sample1.2 + sample2.2) * weight;
                        spike.3 += (sample1.3 + sample2.3) * weight;
                    }
                }

                let halo = highlight_buffer[idx];
                spike.0 += halo.0 * self.config.halo_strength;
                spike.1 += halo.1 * self.config.halo_strength;
                spike.2 += halo.2 * self.config.halo_strength;
                spike.3 += halo.3 * self.config.halo_strength;

                spike.0 *= normalization * self.config.strength;
                spike.1 *= normalization * self.config.strength;
                spike.2 *= normalization * self.config.strength;
                spike.3 *= normalization * self.config.strength;

                let out_a = base.3.max(spike.3 * 0.6);
                (
                    (base.0 + spike.0).max(0.0),
                    (base.1 + spike.1).max(0.0),
                    (base.2 + spike.2).max(0.0),
                    out_a,
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
    fn test_diffraction_default_config() {
        let config = DiffractionSpikesConfig::default();
        assert!(config.strength > 0.0);
        assert!(config.spike_length > 0.0);
    }

    #[test]
    fn test_diffraction_zero_strength_passthrough() {
        let config = DiffractionSpikesConfig { strength: 0.0, ..Default::default() };
        let effect = DiffractionSpikes::new(config);
        let input = vec![(0.2, 0.2, 0.2, 1.0); 4];
        let output = effect.process(&input, 2, 2).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn test_diffraction_spreads_highlight() {
        let config = DiffractionSpikesConfig {
            strength: 1.0,
            threshold: 0.1,
            spike_length: 4.0,
            sample_count: 4,
            ..Default::default()
        };
        let effect = DiffractionSpikes::new(config);
        let mut input = vec![(0.0, 0.0, 0.0, 0.0); 25];
        input[12] = (1.0, 1.0, 1.0, 1.0);
        let output = effect.process(&input, 5, 5).unwrap();
        assert!(
            output[2].3 > 0.0 || output[22].3 > 0.0,
            "Diffraction should spread highlights along spike directions"
        );
    }
}
