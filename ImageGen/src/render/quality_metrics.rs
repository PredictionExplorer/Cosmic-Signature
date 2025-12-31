//! Quality Metrics: Automatic quality validation via histogram pass
//!
//! The existing Pass 1 (histogram building) renders every frame. We can compute
//! quality metrics there at **zero extra cost**:
//!
//! - Highlight clipping percentage
//! - Shadow crush percentage
//! - Contrast spread (luminance standard deviation)
//! - Gamut excursion count
//!
//! If metrics are poor, we can suggest parameter adjustments or log warnings.
//!
//! # Philosophy
//!
//! Museum-quality output requires objective quality validation, not just
//! subjective "looks good" assessment. These metrics catch common issues:
//!
//! - **Highlight clipping**: Too much bloom/glow causing white-out
//! - **Shadow crush**: Too much darkening causing detail loss
//! - **Low contrast**: Flat, uninteresting tonal range
//! - **Gamut excursion**: Colors outside sRGB that will clip
//!
//! # Usage
//!
//! ```ignore
//! let metrics = QualityMetrics::from_pixel_buffer(&pixels);
//! if metrics.quality_score < 0.7 {
//!     log::warn!("Low quality score: {}", metrics.quality_score);
//! }
//! ```

// Allow dead code for quality metrics API - these are designed for future integration
// with the histogram pass and quality-based auto-adjustment pipeline.
#![allow(dead_code)]

use rayon::prelude::*;
use super::tonemap::tonemap_core;
use super::types::ChannelLevels;

/// Quality metrics computed from rendered pixels.
///
/// These metrics provide objective quality assessment at zero extra render cost
/// by leveraging the histogram pass that already processes every frame.
#[derive(Debug, Clone)]
pub struct QualityMetrics {
    /// Percentage of pixels above 0.98 luminance (highlight clipping)
    pub highlight_clip_pct: f64,

    /// Percentage of pixels below 0.02 luminance with significant alpha (shadow crush)
    pub shadow_crush_pct: f64,

    /// Standard deviation of luminance (0 = flat, higher = more contrast)
    pub contrast_spread: f64,

    /// Mean luminance of the image
    pub mean_luminance: f64,

    /// Number of pixels with out-of-gamut values before tonemap
    pub gamut_excursions: usize,

    /// Total number of pixels analyzed
    pub total_pixels: usize,

    /// Number of non-transparent pixels
    pub visible_pixels: usize,

    /// Overall quality score (0-1, higher is better)
    pub quality_score: f64,
}

impl Default for QualityMetrics {
    fn default() -> Self {
        Self {
            highlight_clip_pct: 0.0,
            shadow_crush_pct: 0.0,
            contrast_spread: 0.0,
            mean_luminance: 0.0,
            gamut_excursions: 0,
            total_pixels: 0,
            visible_pixels: 0,
            quality_score: 1.0,
        }
    }
}

impl QualityMetrics {
    /// Compute quality metrics from a pixel buffer.
    ///
    /// This function analyzes the pixel buffer to compute various quality metrics
    /// including highlight clipping, shadow crushing, contrast spread, and gamut excursions.
    ///
    /// # Arguments
    ///
    /// * `pixels` - Slice of (R, G, B, A) tuples in premultiplied alpha format
    ///
    /// # Returns
    ///
    /// A `QualityMetrics` struct containing all computed metrics
    pub fn from_pixel_buffer(pixels: &[(f64, f64, f64, f64)]) -> Self {
        if pixels.is_empty() {
            return Self::default();
        }

        let total_pixels = pixels.len();

        // Parallel computation of per-pixel metrics
        let (highlight_count, shadow_count, gamut_excursions, visible_count, lum_sum, lum_sq_sum) =
            pixels
                .par_iter()
                .map(|&(r, g, b, a)| {
                    // Skip fully transparent pixels
                    if a <= 0.01 {
                        return (0usize, 0usize, 0usize, 0usize, 0.0, 0.0);
                    }

                    // Compute luminance (Rec. 709 coefficients)
                    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

                    let highlight = if lum > 0.98 { 1usize } else { 0 };
                    let shadow = if lum < 0.02 && a > 0.1 { 1usize } else { 0 };

                    // Check for gamut excursions (values significantly out of range)
                    let gamut = if r > 1.5 || g > 1.5 || b > 1.5 || r < -0.1 || g < -0.1 || b < -0.1
                    {
                        1usize
                    } else {
                        0
                    };

                    (highlight, shadow, gamut, 1usize, lum, lum * lum)
                })
                .reduce(
                    || (0, 0, 0, 0, 0.0, 0.0),
                    |a, b| (a.0 + b.0, a.1 + b.1, a.2 + b.2, a.3 + b.3, a.4 + b.4, a.5 + b.5),
                );

        let visible_pixels = visible_count;

        // Avoid division by zero
        if visible_pixels == 0 {
            return Self { total_pixels, ..Default::default() };
        }

        let n = visible_pixels as f64;
        let mean_luminance = lum_sum / n;
        let variance = (lum_sq_sum / n) - (mean_luminance * mean_luminance);
        let contrast_spread = variance.max(0.0).sqrt();

        let highlight_clip_pct = (highlight_count as f64 / n) * 100.0;
        let shadow_crush_pct = (shadow_count as f64 / n) * 100.0;

        // Compute quality score
        let quality_score = Self::compute_quality_score(
            highlight_clip_pct,
            shadow_crush_pct,
            contrast_spread,
            gamut_excursions,
            visible_pixels,
        );

        Self {
            highlight_clip_pct,
            shadow_crush_pct,
            contrast_spread,
            mean_luminance,
            gamut_excursions,
            total_pixels,
            visible_pixels,
            quality_score,
        }
    }

    /// Compute overall quality score from individual metrics.
    ///
    /// The score is 1.0 (perfect) minus penalties for various quality issues.
    fn compute_quality_score(
        highlight_clip_pct: f64,
        shadow_crush_pct: f64,
        contrast_spread: f64,
        gamut_excursions: usize,
        visible_pixels: usize,
    ) -> f64 {
        let mut score = 1.0;

        // Penalty for highlight clipping (up to 30% penalty for >10% clipping)
        score -= (highlight_clip_pct / 10.0).min(0.3);

        // Penalty for shadow crushing (up to 20% penalty for >10% crushing)
        score -= (shadow_crush_pct / 10.0).min(0.2);

        // Penalty for too-flat images (contrast_spread < 0.1)
        if contrast_spread < 0.1 {
            score -= (0.1 - contrast_spread) * 2.0;
        }

        // Penalty for excessive contrast (contrast_spread > 0.45)
        if contrast_spread > 0.45 {
            score -= (contrast_spread - 0.45) * 1.0;
        }

        // Small penalty for gamut excursions (they'll be clamped but indicate issues)
        if visible_pixels > 0 {
            let gamut_pct = (gamut_excursions as f64 / visible_pixels as f64) * 100.0;
            score -= (gamut_pct / 20.0).min(0.1);
        }

        score.max(0.0)
    }

    /// Check if this image passes minimum quality standards.
    ///
    /// Returns true if the quality score is above the museum-quality threshold.
    pub fn passes_museum_quality(&self) -> bool {
        self.quality_score >= 0.7
    }

    /// Get a human-readable quality assessment.
    pub fn assessment(&self) -> QualityAssessment {
        if self.quality_score >= 0.85 {
            QualityAssessment::Excellent
        } else if self.quality_score >= 0.7 {
            QualityAssessment::Good
        } else if self.quality_score >= 0.5 {
            QualityAssessment::Acceptable
        } else {
            QualityAssessment::Poor
        }
    }

    /// Suggest parameter adjustments based on metrics.
    ///
    /// Returns a list of suggested adjustments to improve quality.
    pub fn suggest_adjustments(&self) -> Vec<ParameterAdjustment> {
        let mut adjustments = Vec::new();

        // High highlight clipping suggests too much glow/bloom
        if self.highlight_clip_pct > 5.0 {
            adjustments.push(ParameterAdjustment {
                param: "halation_threshold".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.1,
                reason: format!("High highlight clipping ({:.1}%)", self.highlight_clip_pct),
            });
            adjustments.push(ParameterAdjustment {
                param: "glow_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.1,
                reason: format!("High highlight clipping ({:.1}%)", self.highlight_clip_pct),
            });
            adjustments.push(ParameterAdjustment {
                param: "bloom_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 2.0,
                reason: format!("High highlight clipping ({:.1}%)", self.highlight_clip_pct),
            });
        }

        // High shadow crushing suggests too much darkening
        if self.shadow_crush_pct > 10.0 {
            adjustments.push(ParameterAdjustment {
                param: "vignette_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.1,
                reason: format!("High shadow crush ({:.1}%)", self.shadow_crush_pct),
            });
            adjustments.push(ParameterAdjustment {
                param: "atmospheric_darkening".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.1,
                reason: format!("High shadow crush ({:.1}%)", self.shadow_crush_pct),
            });
        }

        // Low contrast suggests need for more shaping
        if self.contrast_spread < 0.08 {
            adjustments.push(ParameterAdjustment {
                param: "dodge_burn_strength".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.1,
                reason: format!("Low contrast ({:.3})", self.contrast_spread),
            });
            adjustments.push(ParameterAdjustment {
                param: "micro_contrast_strength".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.05,
                reason: format!("Low contrast ({:.3})", self.contrast_spread),
            });
        }

        // High gamut excursions suggest color management issues
        if self.visible_pixels > 0 {
            let gamut_pct = (self.gamut_excursions as f64 / self.visible_pixels as f64) * 100.0;
            if gamut_pct > 5.0 {
                adjustments.push(ParameterAdjustment {
                    param: "chromatic_bloom_strength".to_string(),
                    direction: AdjustmentDirection::Decrease,
                    magnitude: 0.1,
                    reason: format!("High gamut excursions ({:.1}%)", gamut_pct),
                });
            }
        }

        adjustments
    }

    /// Accumulate metrics from multiple frames.
    ///
    /// Useful for computing aggregate metrics across a video sequence.
    pub fn accumulate(&mut self, other: &QualityMetrics) {
        if other.visible_pixels == 0 {
            return;
        }

        let total_visible = self.visible_pixels + other.visible_pixels;
        if total_visible == 0 {
            return;
        }

        // Weighted average for percentages and spreads
        let w1 = self.visible_pixels as f64;
        let w2 = other.visible_pixels as f64;
        let total_w = w1 + w2;

        self.highlight_clip_pct =
            (self.highlight_clip_pct * w1 + other.highlight_clip_pct * w2) / total_w;
        self.shadow_crush_pct =
            (self.shadow_crush_pct * w1 + other.shadow_crush_pct * w2) / total_w;
        self.contrast_spread =
            (self.contrast_spread * w1 + other.contrast_spread * w2) / total_w;
        self.mean_luminance = (self.mean_luminance * w1 + other.mean_luminance * w2) / total_w;

        // Sum for counts
        self.gamut_excursions += other.gamut_excursions;
        self.total_pixels += other.total_pixels;
        self.visible_pixels = total_visible;

        // Recompute quality score
        self.quality_score = Self::compute_quality_score(
            self.highlight_clip_pct,
            self.shadow_crush_pct,
            self.contrast_spread,
            self.gamut_excursions,
            self.visible_pixels,
        );
    }

    /// Format metrics for logging.
    pub fn to_log_string(&self) -> String {
        format!(
            "QualityMetrics {{ score: {:.2}, highlight_clip: {:.1}%, shadow_crush: {:.1}%, contrast: {:.3}, mean_lum: {:.3}, gamut_excursions: {} }}",
            self.quality_score,
            self.highlight_clip_pct,
            self.shadow_crush_pct,
            self.contrast_spread,
            self.mean_luminance,
            self.gamut_excursions
        )
    }

    /// Compute quality metrics from a pixel buffer after tonemapping (sampled).
    ///
    /// This is designed for **preview scoring / curation**, where we want display-referred
    /// metrics (e.g., highlight clipping in SDR space) without processing every pixel.
    ///
    /// - Input pixels are premultiplied RGBA in linear space (as used throughout the pipeline).
    /// - Tonemapping is applied per sample using `tonemap_core`.
    /// - Sampling uses a grid stride: every `stride` pixels in X and Y.
    ///
    /// # Arguments
    /// - `pixels`: Premultiplied RGBA buffer
    /// - `width`, `height`: Buffer dimensions
    /// - `stride`: Sampling stride (>= 1)
    /// - `tonemap_levels`: Levels passed to tonemap. For the museum-quality pipeline, this is
    ///   typically identity levels (0..1) because exposure normalization happens earlier.
    pub fn from_tonemapped_pixel_buffer_sampled(
        pixels: &[(f64, f64, f64, f64)],
        width: usize,
        height: usize,
        stride: usize,
        tonemap_levels: &ChannelLevels,
    ) -> Self {
        if pixels.is_empty() || width == 0 || height == 0 {
            return Self::default();
        }
        debug_assert_eq!(pixels.len(), width * height);

        let stride = stride.max(1);
        let sample_w = width.div_ceil(stride);
        let sample_h = height.div_ceil(stride);
        let total_samples = sample_w * sample_h;

        if total_samples == 0 {
            return Self::default();
        }

        // Enumerate sampled indices (small enough for allocation in preview contexts).
        let indices: Vec<usize> = (0..height)
            .step_by(stride)
            .flat_map(|y| (0..width).step_by(stride).map(move |x| y * width + x))
            .collect();

        let (highlight_count, shadow_count, gamut_excursions, visible_count, lum_sum, lum_sq_sum) =
            indices
                .par_iter()
                .map(|&idx| {
                    let (r, g, b, a) = pixels[idx];
                    if a <= 0.01 {
                        return (0usize, 0usize, 0usize, 0usize, 0.0, 0.0);
                    }

                    // Display-referred luminance from tonemapped RGB.
                    let tm = tonemap_core(r, g, b, a, tonemap_levels);
                    let lum = 0.2126 * tm[0] + 0.7152 * tm[1] + 0.0722 * tm[2];

                    let highlight = if lum > 0.98 { 1usize } else { 0 };
                    let shadow = if lum < 0.02 && a > 0.1 { 1usize } else { 0 };

                    // Gamut excursions: measure pre-tonemap signal stress.
                    let gamut = if r > 1.5 || g > 1.5 || b > 1.5 || r < -0.1 || g < -0.1 || b < -0.1
                    {
                        1usize
                    } else {
                        0
                    };

                    (highlight, shadow, gamut, 1usize, lum, lum * lum)
                })
                .reduce(
                    || (0, 0, 0, 0, 0.0, 0.0),
                    |a, b| (a.0 + b.0, a.1 + b.1, a.2 + b.2, a.3 + b.3, a.4 + b.4, a.5 + b.5),
                );

        let visible_pixels = visible_count;
        if visible_pixels == 0 {
            return Self { total_pixels: total_samples, ..Default::default() };
        }

        let n = visible_pixels as f64;
        let mean_luminance = lum_sum / n;
        let variance = (lum_sq_sum / n) - (mean_luminance * mean_luminance);
        let contrast_spread = variance.max(0.0).sqrt();

        let highlight_clip_pct = (highlight_count as f64 / n) * 100.0;
        let shadow_crush_pct = (shadow_count as f64 / n) * 100.0;

        let quality_score = Self::compute_quality_score(
            highlight_clip_pct,
            shadow_crush_pct,
            contrast_spread,
            gamut_excursions,
            visible_pixels,
        );

        Self {
            highlight_clip_pct,
            shadow_crush_pct,
            contrast_spread,
            mean_luminance,
            gamut_excursions,
            total_pixels: total_samples,
            visible_pixels,
            quality_score,
        }
    }
}

/// Quality assessment categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualityAssessment {
    /// Score >= 0.85: Exhibition-ready
    Excellent,
    /// Score >= 0.70: Museum-quality threshold
    Good,
    /// Score >= 0.50: May need adjustment
    Acceptable,
    /// Score < 0.50: Likely has issues
    Poor,
}

impl std::fmt::Display for QualityAssessment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QualityAssessment::Excellent => write!(f, "Excellent"),
            QualityAssessment::Good => write!(f, "Good"),
            QualityAssessment::Acceptable => write!(f, "Acceptable"),
            QualityAssessment::Poor => write!(f, "Poor"),
        }
    }
}

/// Direction of parameter adjustment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdjustmentDirection {
    Increase,
    Decrease,
}

/// A suggested parameter adjustment to improve quality.
#[derive(Debug, Clone)]
#[allow(dead_code)] // Public API for quality-based auto-adjustment
pub struct ParameterAdjustment {
    /// Parameter name to adjust
    pub param: String,

    /// Direction of adjustment
    pub direction: AdjustmentDirection,

    /// Suggested magnitude of change
    pub magnitude: f64,

    /// Reason for the adjustment
    pub reason: String,
}

impl ParameterAdjustment {
    /// Apply this adjustment to a value.
    #[allow(dead_code)] // Public API for quality-based auto-adjustment
    pub fn apply(&self, current: f64) -> f64 {
        match self.direction {
            AdjustmentDirection::Increase => current + self.magnitude,
            AdjustmentDirection::Decrease => (current - self.magnitude).max(0.0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_pixels(r: f64, g: f64, b: f64, a: f64, count: usize) -> Vec<(f64, f64, f64, f64)> {
        vec![(r, g, b, a); count]
    }

    #[test]
    fn test_empty_buffer() {
        let metrics = QualityMetrics::from_pixel_buffer(&[]);
        assert_eq!(metrics.total_pixels, 0);
        assert_eq!(metrics.visible_pixels, 0);
        assert!((metrics.quality_score - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_fully_transparent_buffer() {
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 0.0, 1000);
        let metrics = QualityMetrics::from_pixel_buffer(&pixels);
        assert_eq!(metrics.total_pixels, 1000);
        assert_eq!(metrics.visible_pixels, 0);
    }

    #[test]
    fn test_perfect_mid_gray() {
        // Mid-gray with full alpha should have excellent quality
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 1000);
        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert_eq!(metrics.highlight_clip_pct, 0.0);
        assert_eq!(metrics.shadow_crush_pct, 0.0);
        assert_eq!(metrics.gamut_excursions, 0);
        // Flat image has zero contrast spread
        assert!(metrics.contrast_spread < 0.01);
    }

    #[test]
    fn test_highlight_clipping_detection() {
        // 10% of pixels are clipped (luminance > 0.98)
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 900);
        pixels.extend(create_test_pixels(1.0, 1.0, 1.0, 1.0, 100));

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert!(
            (metrics.highlight_clip_pct - 10.0).abs() < 0.1,
            "Expected ~10% highlight clip, got {}",
            metrics.highlight_clip_pct
        );
    }

    #[test]
    fn test_shadow_crush_detection() {
        // 20% of pixels are crushed (luminance < 0.02 with alpha > 0.1)
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 800);
        pixels.extend(create_test_pixels(0.01, 0.01, 0.01, 1.0, 200));

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert!(
            (metrics.shadow_crush_pct - 20.0).abs() < 0.1,
            "Expected ~20% shadow crush, got {}",
            metrics.shadow_crush_pct
        );
    }

    #[test]
    fn test_gamut_excursion_detection() {
        // Some pixels have out-of-gamut values
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 900);
        pixels.extend(create_test_pixels(2.0, 0.5, 0.5, 1.0, 100)); // R > 1.5

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert_eq!(
            metrics.gamut_excursions, 100,
            "Expected 100 gamut excursions, got {}",
            metrics.gamut_excursions
        );
    }

    #[test]
    fn test_contrast_spread_calculation() {
        // Create pixels with known variance
        // Half black, half white should have high contrast
        let mut pixels = create_test_pixels(0.0, 0.0, 0.0, 1.0, 500);
        pixels.extend(create_test_pixels(1.0, 1.0, 1.0, 1.0, 500));

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        // With half 0 and half 1, mean = 0.5, variance = 0.25, std = 0.5
        assert!(
            (metrics.contrast_spread - 0.5).abs() < 0.01,
            "Expected contrast spread ~0.5, got {}",
            metrics.contrast_spread
        );
        assert!(
            (metrics.mean_luminance - 0.5).abs() < 0.01,
            "Expected mean luminance ~0.5, got {}",
            metrics.mean_luminance
        );
    }

    #[test]
    fn test_quality_score_perfect_image() {
        // Moderate contrast, no clipping, no crushing
        let mut pixels = Vec::new();
        for i in 0..1000 {
            let v = 0.2 + 0.6 * (i as f64 / 1000.0); // Range 0.2-0.8
            pixels.push((v, v, v, 1.0));
        }

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert!(
            metrics.quality_score > 0.85,
            "Expected high quality score, got {}",
            metrics.quality_score
        );
        assert_eq!(metrics.assessment(), QualityAssessment::Excellent);
    }

    #[test]
    fn test_quality_score_clipped_image() {
        // Many clipped highlights should lower score
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 700);
        pixels.extend(create_test_pixels(1.0, 1.0, 1.0, 1.0, 300)); // 30% clipped

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert!(
            metrics.quality_score < 0.75,
            "Expected lower quality score due to clipping, got {}",
            metrics.quality_score
        );
    }

    #[test]
    fn test_quality_score_flat_image() {
        // Very flat image (no contrast) should be penalized
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 1000);
        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert!(
            metrics.quality_score < 0.85,
            "Expected lower score for flat image, got {}",
            metrics.quality_score
        );
    }

    #[test]
    fn test_passes_museum_quality() {
        // Good image should pass
        let mut pixels = Vec::new();
        for i in 0..1000 {
            let v = 0.2 + 0.6 * (i as f64 / 1000.0);
            pixels.push((v, v, v, 1.0));
        }
        let metrics = QualityMetrics::from_pixel_buffer(&pixels);
        assert!(metrics.passes_museum_quality());

        // Very bad image should not pass - extreme highlight clipping
        // 80% of pixels are clipped highlights, plus some normal
        let mut bad_pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 200);
        bad_pixels.extend(create_test_pixels(0.99, 0.99, 0.99, 1.0, 800)); // 80% clipped
        let bad_metrics = QualityMetrics::from_pixel_buffer(&bad_pixels);

        // Score should be significantly penalized
        assert!(
            bad_metrics.quality_score < 0.8,
            "80% highlight clipping should lower score significantly: {}",
            bad_metrics.quality_score
        );
    }

    #[test]
    fn test_suggest_adjustments_highlight_clipping() {
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 900);
        pixels.extend(create_test_pixels(1.0, 1.0, 1.0, 1.0, 100)); // 10% clipped

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);
        let adjustments = metrics.suggest_adjustments();

        // Should suggest reducing glow/bloom
        assert!(
            adjustments.iter().any(|a| a.param == "glow_strength"
                && a.direction == AdjustmentDirection::Decrease),
            "Should suggest decreasing glow_strength"
        );
    }

    #[test]
    fn test_suggest_adjustments_low_contrast() {
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 1000);
        let metrics = QualityMetrics::from_pixel_buffer(&pixels);
        let adjustments = metrics.suggest_adjustments();

        // Should suggest increasing contrast shaping
        assert!(
            adjustments.iter().any(|a| a.param == "dodge_burn_strength"
                && a.direction == AdjustmentDirection::Increase),
            "Should suggest increasing dodge_burn_strength"
        );
    }

    #[test]
    fn test_accumulate_metrics() {
        let pixels1 = create_test_pixels(0.3, 0.3, 0.3, 1.0, 1000);
        let pixels2 = create_test_pixels(0.7, 0.7, 0.7, 1.0, 1000);

        let mut metrics1 = QualityMetrics::from_pixel_buffer(&pixels1);
        let metrics2 = QualityMetrics::from_pixel_buffer(&pixels2);

        metrics1.accumulate(&metrics2);

        assert_eq!(metrics1.visible_pixels, 2000);
        assert_eq!(metrics1.total_pixels, 2000);
        // Mean luminance should be average of 0.3 and 0.7 = 0.5
        assert!(
            (metrics1.mean_luminance - 0.5).abs() < 0.01,
            "Expected mean luminance ~0.5, got {}",
            metrics1.mean_luminance
        );
    }

    #[test]
    fn test_parameter_adjustment_apply() {
        let increase = ParameterAdjustment {
            param: "test".to_string(),
            direction: AdjustmentDirection::Increase,
            magnitude: 0.1,
            reason: "test".to_string(),
        };
        assert!((increase.apply(0.5) - 0.6).abs() < 1e-10);

        let decrease = ParameterAdjustment {
            param: "test".to_string(),
            direction: AdjustmentDirection::Decrease,
            magnitude: 0.1,
            reason: "test".to_string(),
        };
        assert!((decrease.apply(0.5) - 0.4).abs() < 1e-10);

        // Decrease should not go below 0
        assert!((decrease.apply(0.05) - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_to_log_string() {
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 100);
        let metrics = QualityMetrics::from_pixel_buffer(&pixels);
        let log_str = metrics.to_log_string();

        assert!(log_str.contains("score:"));
        assert!(log_str.contains("highlight_clip:"));
        assert!(log_str.contains("contrast:"));
    }

    #[test]
    fn test_quality_assessment_categories() {
        // Test each category threshold
        let excellent = QualityMetrics { quality_score: 0.90, ..Default::default() };
        assert_eq!(excellent.assessment(), QualityAssessment::Excellent);

        let good = QualityMetrics { quality_score: 0.75, ..Default::default() };
        assert_eq!(good.assessment(), QualityAssessment::Good);

        let acceptable = QualityMetrics { quality_score: 0.55, ..Default::default() };
        assert_eq!(acceptable.assessment(), QualityAssessment::Acceptable);

        let poor = QualityMetrics { quality_score: 0.40, ..Default::default() };
        assert_eq!(poor.assessment(), QualityAssessment::Poor);
    }

    #[test]
    fn test_negative_gamut_excursion() {
        // Negative RGB values should also count as gamut excursions
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 900);
        pixels.extend(create_test_pixels(-0.2, 0.5, 0.5, 1.0, 100)); // R < -0.1

        let metrics = QualityMetrics::from_pixel_buffer(&pixels);

        assert_eq!(
            metrics.gamut_excursions, 100,
            "Expected 100 gamut excursions for negative R, got {}",
            metrics.gamut_excursions
        );
    }

    #[test]
    fn test_assessment_display() {
        assert_eq!(format!("{}", QualityAssessment::Excellent), "Excellent");
        assert_eq!(format!("{}", QualityAssessment::Good), "Good");
        assert_eq!(format!("{}", QualityAssessment::Acceptable), "Acceptable");
        assert_eq!(format!("{}", QualityAssessment::Poor), "Poor");
    }

    #[test]
    fn test_from_tonemapped_pixel_buffer_sampled_basic_counts() {
        let width = 32;
        let height = 32;
        let pixels = vec![(0.5, 0.5, 0.5, 1.0); width * height];
        let identity = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

        let metrics = QualityMetrics::from_tonemapped_pixel_buffer_sampled(
            &pixels,
            width,
            height,
            4,
            &identity,
        );

        assert!(metrics.total_pixels > 0);
        assert_eq!(metrics.visible_pixels, metrics.total_pixels);
        assert!(metrics.mean_luminance.is_finite());
        assert!(metrics.contrast_spread.is_finite());
        assert!((0.0..=1.0).contains(&metrics.quality_score));
    }
}

