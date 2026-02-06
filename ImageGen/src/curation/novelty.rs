//! Novelty tracking to avoid repetitive accepted outputs.

use crate::curation::quality_score::FrameFeatures;

#[derive(Clone, Debug, Default)]
pub struct NoveltyMemory {
    accepted: Vec<FrameFeatures>,
    max_entries: usize,
}

impl NoveltyMemory {
    pub fn new(max_entries: usize) -> Self {
        Self {
            accepted: Vec::new(),
            max_entries: max_entries.max(1),
        }
    }

    pub fn len(&self) -> usize {
        self.accepted.len()
    }

    pub fn score_candidate(&self, features: &FrameFeatures) -> f64 {
        if self.accepted.is_empty() {
            return 1.0;
        }

        let mut min_distance = f64::MAX;
        for prev in &self.accepted {
            let d = feature_distance(prev, features);
            if d < min_distance {
                min_distance = d;
            }
        }

        // Normalize to a practical 0..1 novelty score.
        (min_distance / 0.35).clamp(0.0, 1.0)
    }

    pub fn remember(&mut self, features: FrameFeatures) {
        self.accepted.push(features);
        if self.accepted.len() > self.max_entries {
            let overflow = self.accepted.len() - self.max_entries;
            self.accepted.drain(0..overflow);
        }
    }
}

fn feature_distance(a: &FrameFeatures, b: &FrameFeatures) -> f64 {
    let mut sum = 0.0;

    for i in 0..3 {
        let d_mean = a.mean_rgb[i] - b.mean_rgb[i];
        let d_std = a.std_rgb[i] - b.std_rgb[i];
        sum += d_mean * d_mean * 1.2;
        sum += d_std * d_std * 0.8;
    }

    let d_occ = a.occupancy_ratio - b.occupancy_ratio;
    let d_edge = a.edge_density - b.edge_density;
    let d_center = a.center_energy_ratio - b.center_energy_ratio;
    let d_sat = a.saturation_mean - b.saturation_mean;
    let d_band = a.banding_proxy - b.banding_proxy;

    sum += d_occ * d_occ * 1.3;
    sum += d_edge * d_edge * 1.3;
    sum += d_center * d_center * 0.9;
    sum += d_sat * d_sat * 1.1;
    sum += d_band * d_band * 0.6;

    sum.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(x: f64) -> FrameFeatures {
        FrameFeatures {
            mean_rgb: [x, x * 0.8, x * 0.6],
            std_rgb: [0.1 + x * 0.1, 0.08, 0.06],
            occupancy_ratio: 0.3 + x * 0.1,
            edge_density: 0.12 + x * 0.05,
            center_energy_ratio: 0.4,
            clip_black_ratio: 0.1,
            clip_white_ratio: 0.02,
            banding_proxy: 0.1,
            saturation_mean: 0.25 + x * 0.2,
        }
    }

    #[test]
    fn empty_memory_returns_high_novelty() {
        let m = NoveltyMemory::new(10);
        assert_eq!(m.score_candidate(&sample(0.2)), 1.0);
    }

    #[test]
    fn close_candidates_have_lower_novelty() {
        let mut m = NoveltyMemory::new(10);
        m.remember(sample(0.2));
        let close = m.score_candidate(&sample(0.21));
        let far = m.score_candidate(&sample(0.8));
        assert!(close < far);
    }
}
