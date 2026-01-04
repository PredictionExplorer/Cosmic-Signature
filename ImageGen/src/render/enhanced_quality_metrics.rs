//! Enhanced Quality Metrics for Museum-Quality Output
//!
//! This module provides comprehensive quality assessment that goes beyond basic
//! technical metrics to include aesthetic, compositional, and perceptual analysis.
//!
//! # Philosophy
//!
//! Museum-quality output requires more than just "no clipping" or "good contrast".
//! We need to evaluate:
//!
//! - **Technical Quality**: Exposure, dynamic range, gamut handling
//! - **Tonal Distribution**: Rich shadows, detailed midtones, clean highlights
//! - **Compositional Balance**: Visual weight distribution, subject prominence
//! - **Color Quality**: Variety, harmony, saturation balance
//! - **Visual Interest**: Detail presence, entropy, local contrast
//!
//! # Scoring Philosophy
//!
//! The final score is computed as a weighted combination of sub-scores, each
//! normalized to [0, 1]. The weights reflect importance for museum-quality output:
//!
//! | Category | Weight | Rationale |
//! |----------|--------|-----------|
//! | Technical | 0.30 | Foundation - must be correct |
//! | Tonal | 0.25 | Rich tonal range is essential |
//! | Compositional | 0.20 | Professional framing |
//! | Color | 0.15 | Aesthetic appeal |
//! | Visual Interest | 0.10 | Engagement factor |

// Allow dead_code for the comprehensive metrics API - these fields are exposed
// for diagnostics and future enhancements to the quality scoring system.
#![allow(dead_code)]

use rayon::prelude::*;
use super::tonemap::tonemap_core;
use super::types::ChannelLevels;

/// Thresholds for quality assessment
pub mod thresholds {
    /// Minimum score for "Excellent" rating (museum exhibition ready)
    pub const EXCELLENT: f64 = 0.85;
    /// Minimum score for "Good" rating (gallery quality)
    pub const GOOD: f64 = 0.70;
    /// Minimum score for "Acceptable" rating (may need refinement)
    pub const ACCEPTABLE: f64 = 0.50;
    
    /// Target mean luminance for optimal exposure
    pub const TARGET_MEAN_LUMINANCE: f64 = 0.22;
    /// Acceptable range around target luminance
    pub const LUMINANCE_TOLERANCE: f64 = 0.12;
    
    // ==== HARD REJECTION THRESHOLDS (instant fail) ====
    
    /// HARD MINIMUM: Images darker than this are INSTANTLY REJECTED.
    /// A mean luminance below 0.05 means the image is essentially black.
    pub const HARD_MIN_LUMINANCE: f64 = 0.05;
    
    /// HARD MINIMUM: Images with less than this subject coverage are REJECTED.
    /// Less than 2% visible pixels means the frame is nearly empty.
    pub const HARD_MIN_SUBJECT_COVERAGE: f64 = 0.02;
    
    /// HARD MAXIMUM: Images with more than this shadow crushing are REJECTED.
    /// More than 50% of pixels in deep shadow indicates catastrophic darkness.
    pub const HARD_MAX_SHADOW_CRUSH: f64 = 50.0;
    
    /// Minimum acceptable midtone presence (% of pixels in midtone range)
    pub const MIN_MIDTONE_PRESENCE: f64 = 0.15;
    /// Maximum acceptable edge activity (keeps attention in center)
    pub const MAX_EDGE_ACTIVITY: f64 = 0.35;
    
    /// Minimum color variety for interesting images
    pub const MIN_COLOR_VARIETY: f64 = 0.10;
    
    /// Optimal contrast spread range
    pub const MIN_CONTRAST_SPREAD: f64 = 0.08;
    pub const MAX_CONTRAST_SPREAD: f64 = 0.45;
    
    /// Maximum acceptable highlight clipping
    pub const MAX_HIGHLIGHT_CLIP_PCT: f64 = 8.0;
    /// Maximum acceptable shadow crushing  
    pub const MAX_SHADOW_CRUSH_PCT: f64 = 15.0;
}

/// Enhanced quality metrics with comprehensive aesthetic analysis.
///
/// This extends the basic QualityMetrics with additional measurements
/// that capture the aesthetic quality of museum-worthy images.
#[derive(Debug, Clone)]
pub struct EnhancedQualityMetrics {
    // ========== Technical Metrics (Foundation) ==========
    /// Percentage of pixels above 0.98 luminance (highlight clipping)
    pub highlight_clip_pct: f64,
    /// Percentage of pixels below 0.02 luminance with significant alpha
    pub shadow_crush_pct: f64,
    /// Standard deviation of luminance
    pub contrast_spread: f64,
    /// Mean luminance of the image
    pub mean_luminance: f64,
    /// Number of pixels with out-of-gamut values
    pub gamut_excursions: usize,
    /// Total pixels analyzed
    pub total_pixels: usize,
    /// Non-transparent pixels
    pub visible_pixels: usize,
    
    // ========== Tonal Distribution Metrics ==========
    /// Detail/variation in shadow regions (luminance 0.0-0.15)
    pub shadow_detail: f64,
    /// Percentage of pixels in usable midtone range (0.15-0.85)
    pub midtone_presence: f64,
    /// Detail/variation in highlight regions (luminance 0.85-1.0)
    pub highlight_detail: f64,
    /// How well the histogram spans the full tonal range
    pub tonal_range_utilization: f64,
    
    // ========== Compositional Metrics ==========
    /// Distance of visual center of mass from image center (0 = centered, 1 = corner)
    pub visual_balance: f64,
    /// Percentage of frame occupied by visible subject matter
    pub subject_coverage: f64,
    /// Activity level at frame edges (should be lower than center)
    pub edge_activity: f64,
    /// Ratio of center activity to overall activity
    pub center_focus: f64,
    
    // ========== Color Metrics ==========
    /// Diversity of hues present (0 = monochrome, 1 = full spectrum)
    pub color_variety: f64,
    /// Balance of saturation (penalize both under and over saturation)
    pub saturation_balance: f64,
    /// Mean saturation level
    pub mean_saturation: f64,
    
    // ========== Visual Interest Metrics ==========
    /// Local contrast / micro-detail presence
    pub local_contrast: f64,
    /// Information content (luminance entropy)
    pub luminance_entropy: f64,
    /// Spatial frequency distribution (avoids both flat and noisy)
    pub detail_balance: f64,
    
    // ========== Beauty Metrics (P3 Museum Quality) ==========
    /// Luminance hierarchy - clear focal points with visual progression (0-1)
    pub luminance_hierarchy: f64,
    /// Color harmony - how well colors work together (0-1)
    pub color_harmony: f64,
    /// Visual rhythm - pleasing pattern regularity (0-1)
    pub visual_rhythm: f64,
    /// Overall beauty score combining P3 metrics (0-1)
    pub beauty_score: f64,
    
    // ========== Composite Scores ==========
    /// Technical sub-score (0-1)
    pub technical_score: f64,
    /// Tonal sub-score (0-1)
    pub tonal_score: f64,
    /// Compositional sub-score (0-1)
    pub compositional_score: f64,
    /// Color sub-score (0-1)
    pub color_score: f64,
    /// Visual interest sub-score (0-1)
    pub interest_score: f64,
    /// Final weighted quality score (0-1)
    pub quality_score: f64,
}

impl Default for EnhancedQualityMetrics {
    fn default() -> Self {
        Self {
            // Technical - default to "normal" values that won't trigger hard rejection
            highlight_clip_pct: 0.0,
            shadow_crush_pct: 0.0,
            contrast_spread: 0.15, // Normal contrast
            mean_luminance: 0.22, // Target luminance (won't trigger hard rejection)
            gamut_excursions: 0,
            total_pixels: 1000,
            visible_pixels: 500, // 50% coverage (won't trigger hard rejection)
            // Tonal
            shadow_detail: 0.5,
            midtone_presence: 0.5,
            highlight_detail: 0.5,
            tonal_range_utilization: 0.5,
            // Compositional - default to normal values
            visual_balance: 0.1, // Slightly off-center
            subject_coverage: 0.25, // 25% coverage (won't trigger hard rejection)
            edge_activity: 0.2,
            center_focus: 0.5,
            // Color
            color_variety: 0.3,
            saturation_balance: 0.5,
            mean_saturation: 0.3,
            // Interest
            local_contrast: 0.5,
            luminance_entropy: 0.5,
            detail_balance: 0.5,
            // Beauty (P3 Museum Quality)
            luminance_hierarchy: 0.5,
            color_harmony: 0.5,
            visual_rhythm: 0.5,
            beauty_score: 0.5,
            // Scores
            technical_score: 1.0,
            tonal_score: 1.0,
            compositional_score: 1.0,
            color_score: 1.0,
            interest_score: 1.0,
            quality_score: 1.0,
        }
    }
}

/// Aggregate analysis for reduction
#[derive(Default, Clone)]
struct AggregateAnalysis {
    visible_count: usize,
    highlight_clipped: usize,
    shadow_crushed: usize,
    gamut_excursions: usize,
    
    lum_sum: f64,
    lum_sq_sum: f64,
    
    shadow_count: usize,
    shadow_lum_sum: f64,
    shadow_lum_sq_sum: f64,
    
    midtone_count: usize,
    
    highlight_count: usize,
    highlight_lum_sum: f64,
    highlight_lum_sq_sum: f64,
    
    sat_sum: f64,
    hue_buckets: [usize; 12],
    
    weight_x_sum: f64,
    weight_y_sum: f64,
    total_weight: f64,
}

impl AggregateAnalysis {
    fn merge(mut self, other: Self) -> Self {
        self.visible_count += other.visible_count;
        self.highlight_clipped += other.highlight_clipped;
        self.shadow_crushed += other.shadow_crushed;
        self.gamut_excursions += other.gamut_excursions;
        
        self.lum_sum += other.lum_sum;
        self.lum_sq_sum += other.lum_sq_sum;
        
        self.shadow_count += other.shadow_count;
        self.shadow_lum_sum += other.shadow_lum_sum;
        self.shadow_lum_sq_sum += other.shadow_lum_sq_sum;
        
        self.midtone_count += other.midtone_count;
        
        self.highlight_count += other.highlight_count;
        self.highlight_lum_sum += other.highlight_lum_sum;
        self.highlight_lum_sq_sum += other.highlight_lum_sq_sum;
        
        self.sat_sum += other.sat_sum;
        for i in 0..12 {
            self.hue_buckets[i] += other.hue_buckets[i];
        }
        
        self.weight_x_sum += other.weight_x_sum;
        self.weight_y_sum += other.weight_y_sum;
        self.total_weight += other.total_weight;
        
        self
    }
}

impl EnhancedQualityMetrics {
    /// Compute enhanced quality metrics from a pixel buffer with spatial information.
    ///
    /// This is the primary entry point for quality analysis. It performs a single
    /// parallel pass over the pixels to compute all metrics efficiently.
    ///
    /// # Arguments
    ///
    /// * `pixels` - Slice of (R, G, B, A) tuples in premultiplied alpha format
    /// * `width` - Image width in pixels
    /// * `height` - Image height in pixels
    ///
    /// # Returns
    ///
    /// Comprehensive quality metrics including aesthetic scores
    pub fn from_pixel_buffer_2d(
        pixels: &[(f64, f64, f64, f64)],
        width: usize,
        height: usize,
    ) -> Self {
        if pixels.is_empty() || width == 0 || height == 0 {
            // Return metrics with explicit zero values for empty input
            return Self { total_pixels: 0, visible_pixels: 0, ..Self::default() };
        }
        
        let total_pixels = pixels.len();
        debug_assert_eq!(total_pixels, width * height);
        
        // Edge region definition (outer 15% of each edge)
        let edge_margin = 0.15;
        let edge_x_min = (width as f64 * edge_margin) as usize;
        let edge_x_max = width - edge_x_min;
        let edge_y_min = (height as f64 * edge_margin) as usize;
        let edge_y_max = height - edge_y_min;
        
        // Center region definition (middle 40% of frame)
        let center_margin = 0.30;
        let center_x_min = (width as f64 * center_margin) as usize;
        let center_x_max = width - center_x_min;
        let center_y_min = (height as f64 * center_margin) as usize;
        let center_y_max = height - center_y_min;
        
        let w_f = width as f64;
        let h_f = height as f64;
        
        // Parallel analysis
        let aggregate: AggregateAnalysis = pixels
            .par_iter()
            .enumerate()
            .map(|(idx, &(r, g, b, a))| {
                let mut agg = AggregateAnalysis::default();
                
                // Skip transparent pixels
                if a <= 0.01 {
                    return agg;
                }
                
                // Position
                let x = idx % width;
                let y = idx / width;
                let norm_x = x as f64 / w_f;
                let norm_y = y as f64 / h_f;
                
                // Un-premultiply for accurate color analysis
                let (sr, sg, sb) = if a > 0.01 {
                    (r / a, g / a, b / a)
                } else {
                    (r, g, b)
                };
                
                // Luminance (Rec. 709)
                let lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
                let lum_clamped = lum.clamp(0.0, 1.0);
                
                agg.visible_count = 1;
                agg.lum_sum = lum_clamped;
                agg.lum_sq_sum = lum_clamped * lum_clamped;
                
                // Technical metrics
                if lum > 0.98 {
                    agg.highlight_clipped = 1;
                }
                if lum < 0.02 && a > 0.1 {
                    agg.shadow_crushed = 1;
                }
                if r > 1.5 || g > 1.5 || b > 1.5 || r < -0.1 || g < -0.1 || b < -0.1 {
                    agg.gamut_excursions = 1;
                }
                
                // Tonal classification
                if lum_clamped < 0.15 {
                    agg.shadow_count = 1;
                    agg.shadow_lum_sum = lum_clamped;
                    agg.shadow_lum_sq_sum = lum_clamped * lum_clamped;
                } else if lum_clamped > 0.85 {
                    agg.highlight_count = 1;
                    agg.highlight_lum_sum = lum_clamped;
                    agg.highlight_lum_sq_sum = lum_clamped * lum_clamped;
                } else {
                    agg.midtone_count = 1;
                }
                
                // Color analysis (HSV-style saturation)
                let max_rgb = sr.max(sg).max(sb);
                let min_rgb = sr.min(sg).min(sb);
                let chroma = max_rgb - min_rgb;
                let saturation = if max_rgb > 0.001 { chroma / max_rgb } else { 0.0 };
                agg.sat_sum = saturation;
                
                // Hue bucket (for variety calculation)
                if chroma > 0.05 {
                    let hue = if (max_rgb - sr).abs() < 0.001 {
                        ((sg - sb) / chroma).rem_euclid(6.0)
                    } else if (max_rgb - sg).abs() < 0.001 {
                        (sb - sr) / chroma + 2.0
                    } else {
                        (sr - sg) / chroma + 4.0
                    };
                    let bucket = ((hue / 6.0) * 12.0).floor() as usize % 12;
                    agg.hue_buckets[bucket] = 1;
                }
                
                // Position-weighted center of mass
                let weight = lum_clamped + 0.1; // Small bias to count dark pixels too
                agg.weight_x_sum = norm_x * weight;
                agg.weight_y_sum = norm_y * weight;
                agg.total_weight = weight;
                
                agg
            })
            .reduce(AggregateAnalysis::default, AggregateAnalysis::merge);
        
        // Compute edge vs center activity
        let (edge_lum_sum, edge_count, center_lum_sum, center_count): (f64, usize, f64, usize) = 
            pixels
                .par_iter()
                .enumerate()
                .map(|(idx, &(r, g, b, a))| {
                    if a <= 0.01 {
                        return (0.0, 0usize, 0.0, 0usize);
                    }
                    
                    let x = idx % width;
                    let y = idx / width;
                    
                    let (sr, sg, sb) = if a > 0.01 {
                        (r / a, g / a, b / a)
                    } else {
                        (r, g, b)
                    };
                    let lum = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb).clamp(0.0, 1.0);
                    
                    let is_edge = x < edge_x_min || x >= edge_x_max || y < edge_y_min || y >= edge_y_max;
                    let is_center = x >= center_x_min && x < center_x_max && y >= center_y_min && y < center_y_max;
                    
                    if is_edge {
                        (lum, 1, 0.0, 0)
                    } else if is_center {
                        (0.0, 0, lum, 1)
                    } else {
                        (0.0, 0, 0.0, 0)
                    }
                })
                .reduce(|| (0.0, 0, 0.0, 0), |a, b| (a.0 + b.0, a.1 + b.1, a.2 + b.2, a.3 + b.3));
        
        // Build histogram for entropy calculation (16 bins)
        let histogram: Vec<usize> = {
            let bins: [std::sync::atomic::AtomicUsize; 16] = Default::default();
            pixels.par_iter().for_each(|&(r, g, b, a)| {
                if a > 0.01 {
                    let (sr, sg, sb) = (r / a, g / a, b / a);
                    let lum = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb).clamp(0.0, 0.9999);
                    let bin = (lum * 16.0) as usize;
                    bins[bin].fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
            });
            bins.iter().map(|b| b.load(std::sync::atomic::Ordering::Relaxed)).collect()
        };
        
        // Now compute all the derived metrics
        let visible = aggregate.visible_count;
        if visible == 0 {
            // Return metrics with explicit values for fully transparent image
            return Self { total_pixels, visible_pixels: 0, ..Default::default() };
        }
        
        let n = visible as f64;
        
        // Technical metrics
        let mean_luminance = aggregate.lum_sum / n;
        let variance = (aggregate.lum_sq_sum / n) - (mean_luminance * mean_luminance);
        let contrast_spread = variance.max(0.0).sqrt();
        let highlight_clip_pct = (aggregate.highlight_clipped as f64 / n) * 100.0;
        let shadow_crush_pct = (aggregate.shadow_crushed as f64 / n) * 100.0;
        
        // Tonal distribution
        let shadow_detail = if aggregate.shadow_count > 10 {
            let shadow_mean = aggregate.shadow_lum_sum / aggregate.shadow_count as f64;
            let shadow_var = (aggregate.shadow_lum_sq_sum / aggregate.shadow_count as f64) - (shadow_mean * shadow_mean);
            shadow_var.max(0.0).sqrt() / 0.15 // Normalize to shadow range
        } else {
            0.0
        };
        
        let highlight_detail = if aggregate.highlight_count > 10 {
            let hl_mean = aggregate.highlight_lum_sum / aggregate.highlight_count as f64;
            let hl_var = (aggregate.highlight_lum_sq_sum / aggregate.highlight_count as f64) - (hl_mean * hl_mean);
            hl_var.max(0.0).sqrt() / 0.15 // Normalize to highlight range
        } else {
            0.0
        };
        
        let midtone_presence = aggregate.midtone_count as f64 / n;
        
        // Tonal range utilization (how many histogram bins are populated)
        let populated_bins = histogram.iter().filter(|&&count| count > (visible / 100).max(1)).count();
        let tonal_range_utilization = populated_bins as f64 / 16.0;
        
        // Compositional metrics
        let visual_center_x = if aggregate.total_weight > 0.0 {
            aggregate.weight_x_sum / aggregate.total_weight
        } else {
            0.5
        };
        let visual_center_y = if aggregate.total_weight > 0.0 {
            aggregate.weight_y_sum / aggregate.total_weight
        } else {
            0.5
        };
        let visual_balance = ((visual_center_x - 0.5).powi(2) + (visual_center_y - 0.5).powi(2)).sqrt();
        
        let subject_coverage = n / total_pixels as f64;
        
        let edge_activity = if edge_count > 0 {
            edge_lum_sum / edge_count as f64
        } else {
            0.0
        };
        
        let center_activity = if center_count > 0 {
            center_lum_sum / center_count as f64
        } else {
            0.0
        };
        let center_focus = if edge_activity > 0.001 {
            (center_activity / (edge_activity + 0.01)).min(3.0) / 3.0
        } else {
            0.5
        };
        
        // Color metrics
        let mean_saturation = aggregate.sat_sum / n;
        
        // Color variety: count populated hue buckets
        let populated_hue_buckets = aggregate.hue_buckets.iter().filter(|&&c| c > (visible / 50).max(1)).count();
        let color_variety = populated_hue_buckets as f64 / 12.0;
        
        // Saturation balance (penalize extremes)
        let saturation_balance = if mean_saturation < 0.15 {
            mean_saturation / 0.15 // Under-saturated penalty
        } else if mean_saturation > 0.70 {
            1.0 - ((mean_saturation - 0.70) / 0.30).min(1.0) // Over-saturated penalty
        } else {
            1.0
        };
        
        // Visual interest metrics
        let luminance_entropy = compute_entropy(&histogram, visible);
        
        // Local contrast approximation (using contrast_spread as proxy scaled appropriately)
        let local_contrast = (contrast_spread / 0.25).min(1.0);
        
        // Detail balance (entropy in goldilocks zone)
        let detail_balance = if luminance_entropy < 0.3 {
            luminance_entropy / 0.3 // Too uniform
        } else if luminance_entropy > 0.9 {
            1.0 - ((luminance_entropy - 0.9) / 0.1).min(1.0) // Too noisy
        } else {
            1.0
        };
        
        // Compute sub-scores
        let technical_score = Self::compute_technical_score(
            highlight_clip_pct,
            shadow_crush_pct,
            contrast_spread,
            aggregate.gamut_excursions,
            visible,
            mean_luminance,
        );
        
        let tonal_score = Self::compute_tonal_score(
            shadow_detail,
            midtone_presence,
            highlight_detail,
            tonal_range_utilization,
        );
        
        let compositional_score = Self::compute_compositional_score(
            visual_balance,
            subject_coverage,
            edge_activity,
            center_focus,
        );
        
        let color_score = Self::compute_color_score(
            color_variety,
            saturation_balance,
            mean_saturation,
        );
        
        let interest_score = Self::compute_interest_score(
            local_contrast,
            luminance_entropy,
            detail_balance,
        );
        
        // Beauty metrics (P3 Museum Quality)
        let luminance_hierarchy = Self::compute_luminance_hierarchy(&aggregate, width, height);
        let color_harmony = Self::compute_color_harmony(&aggregate);
        let visual_rhythm = Self::compute_visual_rhythm(
            luminance_entropy, 
            local_contrast, 
            visible as f64 / total_pixels as f64,
        );
        let beauty_score = Self::compute_beauty_score(
            luminance_hierarchy,
            color_harmony,
            visual_rhythm,
        );
        
        // Final weighted score
        // Weights chosen to prioritize technical correctness while rewarding aesthetic beauty
        // Beauty metrics contribute 5% (taken from interest_score weight)
        let quality_score = 
            technical_score * 0.30 +
            tonal_score * 0.25 +
            compositional_score * 0.20 +
            color_score * 0.15 +
            interest_score * 0.05 +
            beauty_score * 0.05;
        
        Self {
            // Technical
            highlight_clip_pct,
            shadow_crush_pct,
            contrast_spread,
            mean_luminance,
            gamut_excursions: aggregate.gamut_excursions,
            total_pixels,
            visible_pixels: visible,
            // Tonal
            shadow_detail,
            midtone_presence,
            highlight_detail,
            tonal_range_utilization,
            // Compositional
            visual_balance,
            subject_coverage,
            edge_activity,
            center_focus,
            // Color
            color_variety,
            saturation_balance,
            mean_saturation,
            // Interest
            local_contrast,
            luminance_entropy,
            detail_balance,
            // Beauty (P3 Museum Quality)
            luminance_hierarchy,
            color_harmony,
            visual_rhythm,
            beauty_score,
            // Scores
            technical_score,
            tonal_score,
            compositional_score,
            color_score,
            interest_score,
            quality_score,
        }
    }
    
    /// Compute enhanced metrics from tonemapped pixel buffer (sampled for speed).
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
        
        let stride = stride.max(1);
        let sample_w = width.div_ceil(stride);
        let sample_h = height.div_ceil(stride);
        
        // Build sampled buffer with tonemapping applied
        let sampled: Vec<(f64, f64, f64, f64)> = (0..height)
            .step_by(stride)
            .flat_map(|y| {
                (0..width).step_by(stride).map(move |x| {
                    let idx = y * width + x;
                    let (r, g, b, a) = pixels[idx];
                    let tm = tonemap_core(r, g, b, a, tonemap_levels);
                    // tonemap_core returns [r, g, b], preserve original alpha
                    (tm[0], tm[1], tm[2], a)
                })
            })
            .collect();
        
        Self::from_pixel_buffer_2d(&sampled, sample_w, sample_h)
    }
    
    /// Compute technical sub-score
    fn compute_technical_score(
        highlight_clip_pct: f64,
        shadow_crush_pct: f64,
        contrast_spread: f64,
        gamut_excursions: usize,
        visible_pixels: usize,
        mean_luminance: f64,
    ) -> f64 {
        let mut score = 1.0;
        
        // Highlight clipping penalty (steeper curve for museum quality)
        if highlight_clip_pct > 3.0 {
            score -= ((highlight_clip_pct - 3.0) / thresholds::MAX_HIGHLIGHT_CLIP_PCT).min(0.35);
        }
        
        // Shadow crushing penalty
        if shadow_crush_pct > 5.0 {
            score -= ((shadow_crush_pct - 5.0) / thresholds::MAX_SHADOW_CRUSH_PCT).min(0.25);
        }
        
        // Contrast spread (penalize both extremes)
        if contrast_spread < thresholds::MIN_CONTRAST_SPREAD {
            score -= ((thresholds::MIN_CONTRAST_SPREAD - contrast_spread) / thresholds::MIN_CONTRAST_SPREAD).min(0.25);
        } else if contrast_spread > thresholds::MAX_CONTRAST_SPREAD {
            score -= ((contrast_spread - thresholds::MAX_CONTRAST_SPREAD) / 0.15).min(0.15);
        }
        
        // Gamut excursions
        if visible_pixels > 0 {
            let gamut_pct = (gamut_excursions as f64 / visible_pixels as f64) * 100.0;
            score -= (gamut_pct / 20.0).min(0.10);
        }
        
        // Mean luminance (target ~0.22 for photographic midtone)
        let lum_error = (mean_luminance - thresholds::TARGET_MEAN_LUMINANCE).abs();
        score -= (lum_error / thresholds::LUMINANCE_TOLERANCE).min(0.20);
        
        score.max(0.0)
    }
    
    /// Compute tonal distribution sub-score
    fn compute_tonal_score(
        shadow_detail: f64,
        midtone_presence: f64,
        highlight_detail: f64,
        tonal_range_utilization: f64,
    ) -> f64 {
        let mut score = 1.0;
        
        // Shadow detail (some detail is good, but not required)
        score += shadow_detail.min(0.5) * 0.10;
        
        // Midtone presence is important
        if midtone_presence < thresholds::MIN_MIDTONE_PRESENCE {
            score -= ((thresholds::MIN_MIDTONE_PRESENCE - midtone_presence) / thresholds::MIN_MIDTONE_PRESENCE).min(0.30);
        } else if midtone_presence > 0.30 {
            // Reward good midtone presence
            score += (midtone_presence - 0.30).min(0.20) * 0.25;
        }
        
        // Highlight detail
        score += highlight_detail.min(0.5) * 0.10;
        
        // Tonal range utilization
        if tonal_range_utilization < 0.3 {
            score -= (0.3 - tonal_range_utilization) * 0.5;
        } else if tonal_range_utilization > 0.6 {
            score += (tonal_range_utilization - 0.6).min(0.15) * 0.25;
        }
        
        score.clamp(0.0, 1.0)
    }
    
    /// Compute compositional sub-score
    fn compute_compositional_score(
        visual_balance: f64,
        subject_coverage: f64,
        edge_activity: f64,
        center_focus: f64,
    ) -> f64 {
        let mut score = 1.0;
        
        // Visual balance (slight off-center can be good, extreme is bad)
        if visual_balance > 0.3 {
            score -= ((visual_balance - 0.3) / 0.4).min(0.25);
        } else if visual_balance < 0.15 {
            // Perfectly centered is slightly penalized (too static)
            score -= (0.15 - visual_balance) * 0.3;
        }
        
        // Subject coverage (want 5-50% coverage typically)
        if subject_coverage < 0.05 {
            score -= (0.05 - subject_coverage) * 4.0; // Heavy penalty for near-empty
        } else if subject_coverage > 0.60 {
            score -= (subject_coverage - 0.60) * 0.5; // Mild penalty for overcrowded
        }
        
        // Edge activity (lower is better for composition)
        if edge_activity > thresholds::MAX_EDGE_ACTIVITY {
            score -= ((edge_activity - thresholds::MAX_EDGE_ACTIVITY) / 0.3).min(0.20);
        }
        
        // Center focus bonus
        if center_focus > 0.5 {
            score += (center_focus - 0.5).min(0.2) * 0.25;
        }
        
        score.clamp(0.0, 1.0)
    }
    
    /// Compute color sub-score
    fn compute_color_score(
        color_variety: f64,
        saturation_balance: f64,
        mean_saturation: f64,
    ) -> f64 {
        let mut score = 1.0;
        
        // Color variety (some variety is good)
        if color_variety < thresholds::MIN_COLOR_VARIETY {
            score -= ((thresholds::MIN_COLOR_VARIETY - color_variety) / thresholds::MIN_COLOR_VARIETY).min(0.15);
        } else if color_variety > 0.25 {
            score += (color_variety - 0.25).min(0.20) * 0.25;
        }
        
        // Saturation balance
        score *= saturation_balance;
        
        // Mean saturation (very low saturation is penalized)
        if mean_saturation < 0.08 {
            score -= (0.08 - mean_saturation) * 2.0;
        }
        
        score.clamp(0.0, 1.0)
    }
    
    /// Compute visual interest sub-score
    fn compute_interest_score(
        local_contrast: f64,
        luminance_entropy: f64,
        detail_balance: f64,
    ) -> f64 {
        let mut score = 0.5; // Base score
        
        // Local contrast adds interest
        score += local_contrast * 0.25;
        
        // Entropy in goldilocks zone (0.4-0.8 is ideal)
        if luminance_entropy >= 0.4 && luminance_entropy <= 0.8 {
            score += 0.20;
        } else if luminance_entropy < 0.3 {
            score -= (0.3 - luminance_entropy) * 0.5;
        }
        
        // Detail balance
        score += (detail_balance - 0.5) * 0.2;
        
        score.clamp(0.0, 1.0)
    }
    
    /// Compute luminance hierarchy score.
    /// Measures whether there's a clear focal point with supporting visual progression.
    /// Higher scores indicate good luminance organization with bright focal areas
    /// surrounded by supporting darker regions.
    fn compute_luminance_hierarchy(aggregate: &AggregateAnalysis, width: usize, height: usize) -> f64 {
        if aggregate.visible_count == 0 || width == 0 || height == 0 {
            return 0.5;
        }
        
        // Analyze luminance distribution across the image
        // Good hierarchy: concentrated bright areas with gradual falloff
        
        // Check if highlights are well-distributed (not uniform)
        let highlight_ratio = aggregate.highlight_clipped as f64 / aggregate.visible_count as f64;
        let shadow_ratio = aggregate.shadow_crushed as f64 / aggregate.visible_count as f64;
        
        // Ideal: some highlights (2-15%) with moderate shadows
        let highlight_score = if highlight_ratio < 0.02 {
            highlight_ratio / 0.02 // Too few highlights
        } else if highlight_ratio <= 0.15 {
            1.0 // Ideal range
        } else {
            1.0 - ((highlight_ratio - 0.15) / 0.35).min(0.5) // Too many highlights
        };
        
        // Shadow distribution score
        let shadow_score = if shadow_ratio < 0.30 {
            1.0 - (0.30 - shadow_ratio) * 0.5 // Some shadows add depth
        } else {
            1.0 - ((shadow_ratio - 0.30) / 0.50).min(0.6) // Too dark
        };
        
        // Combine for hierarchy score
        (highlight_score * 0.6 + shadow_score * 0.4).clamp(0.0, 1.0)
    }
    
    /// Compute color harmony score.
    /// Measures how well the colors work together based on color theory principles.
    /// Considers analogous colors, complementary relationships, and saturation balance.
    fn compute_color_harmony(aggregate: &AggregateAnalysis) -> f64 {
        if aggregate.visible_count == 0 {
            return 0.5;
        }
        
        // Analyze hue bucket distribution for harmony
        let total_hue_samples: usize = aggregate.hue_buckets.iter().sum();
        if total_hue_samples == 0 {
            return 0.5; // Monochrome - neutral harmony
        }
        
        // Find dominant hue buckets
        let mut sorted_buckets: Vec<(usize, usize)> = aggregate.hue_buckets
            .iter()
            .enumerate()
            .map(|(i, &count)| (i, count))
            .collect();
        sorted_buckets.sort_by_key(|&(_, count)| std::cmp::Reverse(count));
        
        let dominant_bucket = sorted_buckets[0].0;
        let dominant_count = sorted_buckets[0].1;
        
        // Calculate dominance (how concentrated the color palette is)
        let dominance = dominant_count as f64 / total_hue_samples as f64;
        
        // Harmony patterns:
        // 1. Monochromatic: >70% in one bucket (high harmony)
        // 2. Analogous: concentrated in 2-3 adjacent buckets (good harmony)
        // 3. Complementary: two opposite buckets (interesting harmony)
        // 4. Split-complementary: dominant + two adjacent to complement (good)
        // 5. Scattered: low harmony
        
        let mut harmony: f64 = 0.5; // Base score
        
        if dominance > 0.70 {
            // Monochromatic - high harmony
            harmony += 0.35;
        } else if dominance > 0.40 {
            // Check for analogous (adjacent buckets)
            let left_bucket = (dominant_bucket + 11) % 12;
            let right_bucket = (dominant_bucket + 1) % 12;
            let analogous_total = dominant_count 
                + aggregate.hue_buckets[left_bucket]
                + aggregate.hue_buckets[right_bucket];
            let analogous_ratio = analogous_total as f64 / total_hue_samples as f64;
            
            if analogous_ratio > 0.70 {
                harmony += 0.30; // Good analogous harmony
            } else {
                // Check for complementary
                let complement = (dominant_bucket + 6) % 12;
                let complement_count = aggregate.hue_buckets[complement];
                let complement_ratio = complement_count as f64 / total_hue_samples as f64;
                
                if complement_ratio > 0.20 && complement_ratio < 0.45 {
                    harmony += 0.25; // Good complementary tension
                }
            }
        }
        
        // Saturation consistency adds to harmony
        let sat_score = aggregate.sat_sum / aggregate.visible_count.max(1) as f64;
        if sat_score > 0.15 && sat_score < 0.60 {
            harmony += 0.10; // Moderate saturation is harmonious
        }
        
        harmony.clamp(0.0, 1.0)
    }
    
    /// Compute visual rhythm score.
    /// Measures the presence of pleasing patterns and visual flow in the image.
    /// Based on luminance variation patterns and spatial distribution.
    fn compute_visual_rhythm(
        luminance_entropy: f64,
        local_contrast: f64,
        coverage: f64,
    ) -> f64 {
        // Visual rhythm is indicated by:
        // 1. Luminance entropy in the sweet spot (not too uniform, not chaotic)
        // 2. Good distribution of detail across the image
        // 3. Balance between quiet and active areas
        
        let mut rhythm: f64 = 0.5;
        
        // Luminance entropy contribution
        // Values 0.4-0.7 suggest good visual rhythm
        if luminance_entropy >= 0.4 && luminance_entropy <= 0.7 {
            rhythm += 0.25;
        } else if luminance_entropy < 0.3 {
            rhythm -= 0.15; // Too uniform, boring
        } else if luminance_entropy > 0.85 {
            rhythm -= 0.10; // Too chaotic, no pattern
        }
        
        // Local contrast variation adds rhythm
        if local_contrast > 0.2 && local_contrast < 0.8 {
            rhythm += 0.15; // Good contrast rhythm
        }
        
        // Coverage contributes to rhythm perception
        if coverage > 0.15 && coverage < 0.70 {
            rhythm += 0.10; // Good subject/background balance
        }
        
        rhythm.clamp(0.0, 1.0)
    }
    
    /// Compute overall beauty score combining all P3 beauty metrics.
    fn compute_beauty_score(
        luminance_hierarchy: f64,
        color_harmony: f64,
        visual_rhythm: f64,
    ) -> f64 {
        // Weight the components
        // Color harmony is most important for aesthetic appeal
        // Luminance hierarchy creates visual interest
        // Visual rhythm provides pleasing patterns
        let score = luminance_hierarchy * 0.30 +
                   color_harmony * 0.45 +
                   visual_rhythm * 0.25;
        
        score.clamp(0.0, 1.0)
    }
    
    /// Get quality assessment category
    pub fn assessment(&self) -> QualityAssessment {
        // First check for hard rejection conditions
        if self.is_hard_rejected() {
            return QualityAssessment::Rejected;
        }
        
        if self.quality_score >= thresholds::EXCELLENT {
            QualityAssessment::Excellent
        } else if self.quality_score >= thresholds::GOOD {
            QualityAssessment::Good
        } else if self.quality_score >= thresholds::ACCEPTABLE {
            QualityAssessment::Acceptable
        } else {
            QualityAssessment::Poor
        }
    }
    
    /// Check if this image should be HARD REJECTED (catastrophic quality issues).
    ///
    /// These conditions represent images that are fundamentally unusable:
    /// - Too dark (essentially black)
    /// - Too empty (no visible content)
    /// - Excessive shadow crushing (majority of image is crushed to black)
    pub fn is_hard_rejected(&self) -> bool {
        // HARD REJECT: Image is essentially black
        if self.mean_luminance < thresholds::HARD_MIN_LUMINANCE {
            return true;
        }
        
        // HARD REJECT: Image is nearly empty (no visible content)
        if self.subject_coverage < thresholds::HARD_MIN_SUBJECT_COVERAGE {
            return true;
        }
        
        // HARD REJECT: Catastrophic shadow crushing (majority of image is black)
        if self.shadow_crush_pct > thresholds::HARD_MAX_SHADOW_CRUSH {
            return true;
        }
        
        false
    }
    
    /// Get the reason for hard rejection, if any.
    pub fn hard_rejection_reason(&self) -> Option<String> {
        if self.mean_luminance < thresholds::HARD_MIN_LUMINANCE {
            return Some(format!(
                "Image too dark: mean luminance {:.3} < minimum {:.3}",
                self.mean_luminance, thresholds::HARD_MIN_LUMINANCE
            ));
        }
        
        if self.subject_coverage < thresholds::HARD_MIN_SUBJECT_COVERAGE {
            return Some(format!(
                "Image too empty: subject coverage {:.1}% < minimum {:.1}%",
                self.subject_coverage * 100.0, thresholds::HARD_MIN_SUBJECT_COVERAGE * 100.0
            ));
        }
        
        if self.shadow_crush_pct > thresholds::HARD_MAX_SHADOW_CRUSH {
            return Some(format!(
                "Image crushed to black: {:.1}% shadow crushing > maximum {:.1}%",
                self.shadow_crush_pct, thresholds::HARD_MAX_SHADOW_CRUSH
            ));
        }
        
        None
    }
    
    /// Check if quality is museum-worthy (passes all hard requirements AND score threshold)
    pub fn passes_museum_quality(&self) -> bool {
        !self.is_hard_rejected() && self.quality_score >= thresholds::GOOD
    }
    
    /// Check if quality is exhibition-ready
    pub fn is_exhibition_ready(&self) -> bool {
        !self.is_hard_rejected() && self.quality_score >= thresholds::EXCELLENT
    }
    
    /// Get a detailed diagnostic string
    pub fn diagnostic_string(&self) -> String {
        format!(
            "Quality: {:.3} ({:?})\n\
             Technical: {:.3} (clip:{:.1}%, crush:{:.1}%, contrast:{:.3}, lum:{:.3})\n\
             Tonal: {:.3} (shadow:{:.2}, mid:{:.2}, highlight:{:.2}, range:{:.2})\n\
             Composition: {:.3} (balance:{:.2}, coverage:{:.2}, edge:{:.2}, center:{:.2})\n\
             Color: {:.3} (variety:{:.2}, sat_bal:{:.2}, mean_sat:{:.2})\n\
             Interest: {:.3} (local:{:.2}, entropy:{:.2}, detail:{:.2})",
            self.quality_score, self.assessment(),
            self.technical_score, self.highlight_clip_pct, self.shadow_crush_pct, self.contrast_spread, self.mean_luminance,
            self.tonal_score, self.shadow_detail, self.midtone_presence, self.highlight_detail, self.tonal_range_utilization,
            self.compositional_score, self.visual_balance, self.subject_coverage, self.edge_activity, self.center_focus,
            self.color_score, self.color_variety, self.saturation_balance, self.mean_saturation,
            self.interest_score, self.local_contrast, self.luminance_entropy, self.detail_balance,
        )
    }
    
    /// Suggest parameter adjustments based on detected deficits.
    pub fn suggest_adjustments(&self) -> Vec<QualityAdjustment> {
        let mut adjustments = Vec::new();
        
        // Technical adjustments
        if self.highlight_clip_pct > 5.0 {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "glow_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.15,
                reason: format!("Highlight clipping at {:.1}%", self.highlight_clip_pct),
            });
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "chromatic_bloom_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.1,
                reason: "Reduce bloom to prevent clipping".to_string(),
            });
        }
        
        if self.shadow_crush_pct > 10.0 {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "atmospheric_darkening".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.05,
                reason: format!("Shadow crushing at {:.1}%", self.shadow_crush_pct),
            });
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "volumetric_occlusion_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.1,
                reason: "Reduce occlusion to preserve shadow detail".to_string(),
            });
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "vignette_strength".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.05,
                reason: "Reduce vignette to preserve shadows".to_string(),
            });
        }
        
        // Exposure adjustment
        if self.mean_luminance < 0.15 {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "exposure_boost".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.3,
                reason: format!("Image too dark (mean lum: {:.3})", self.mean_luminance),
            });
        } else if self.mean_luminance > 0.35 {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Technical,
                param: "exposure_boost".to_string(),
                direction: AdjustmentDirection::Decrease,
                magnitude: 0.2,
                reason: format!("Image too bright (mean lum: {:.3})", self.mean_luminance),
            });
        }
        
        // Contrast adjustments
        if self.contrast_spread < thresholds::MIN_CONTRAST_SPREAD {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Tonal,
                param: "dodge_burn_strength".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.15,
                reason: format!("Low contrast ({:.3})", self.contrast_spread),
            });
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Tonal,
                param: "micro_contrast_strength".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.08,
                reason: "Increase local contrast for detail".to_string(),
            });
        }
        
        // Compositional adjustments
        if self.edge_activity > thresholds::MAX_EDGE_ACTIVITY {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Compositional,
                param: "vignette_strength".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.05,
                reason: format!("High edge activity ({:.2})", self.edge_activity),
            });
        }
        
        // Color adjustments
        if self.mean_saturation < 0.10 {
            adjustments.push(QualityAdjustment {
                category: AdjustmentCategory::Color,
                param: "vibrance".to_string(),
                direction: AdjustmentDirection::Increase,
                magnitude: 0.1,
                reason: format!("Low saturation ({:.2})", self.mean_saturation),
            });
        }
        
        adjustments
    }
}

/// Quality assessment categories
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualityAssessment {
    /// Score >= 0.85: Exhibition-ready, museum-quality
    Excellent,
    /// Score >= 0.70: Gallery-quality, professionally acceptable
    Good,
    /// Score >= 0.50: May need refinement
    Acceptable,
    /// Score < 0.50: Needs significant improvement
    Poor,
    /// HARD REJECTED: Catastrophic quality issues (black, empty, etc.)
    Rejected,
}

impl std::fmt::Display for QualityAssessment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QualityAssessment::Excellent => write!(f, "Excellent"),
            QualityAssessment::Good => write!(f, "Good"),
            QualityAssessment::Acceptable => write!(f, "Acceptable"),
            QualityAssessment::Poor => write!(f, "Poor"),
            QualityAssessment::Rejected => write!(f, "REJECTED"),
        }
    }
}

/// Category of quality adjustment
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdjustmentCategory {
    Technical,
    Tonal,
    Compositional,
    Color,
    Interest,
}

/// Direction of parameter adjustment
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdjustmentDirection {
    Increase,
    Decrease,
}

/// A suggested quality adjustment
#[derive(Debug, Clone)]
pub struct QualityAdjustment {
    pub category: AdjustmentCategory,
    pub param: String,
    pub direction: AdjustmentDirection,
    pub magnitude: f64,
    pub reason: String,
}

impl QualityAdjustment {
    /// Apply this adjustment to a value
    pub fn apply(&self, current: f64, min: f64, max: f64) -> f64 {
        let next = match self.direction {
            AdjustmentDirection::Increase => current + self.magnitude,
            AdjustmentDirection::Decrease => current - self.magnitude,
        };
        next.clamp(min, max)
    }
}

/// Compute Shannon entropy from a histogram
fn compute_entropy(histogram: &[usize], total: usize) -> f64 {
    if total == 0 {
        return 0.0;
    }
    
    let total_f = total as f64;
    let mut entropy = 0.0;
    
    for &count in histogram {
        if count > 0 {
            let p = count as f64 / total_f;
            entropy -= p * p.log2();
        }
    }
    
    // Normalize to [0, 1] (max entropy for 16 bins is log2(16) = 4)
    entropy / 4.0
}

#[cfg(test)]
mod tests {
    use super::*;
    
    fn create_test_pixels(r: f64, g: f64, b: f64, a: f64, count: usize) -> Vec<(f64, f64, f64, f64)> {
        vec![(r, g, b, a); count]
    }
    
    fn create_gradient_pixels(width: usize, height: usize) -> Vec<(f64, f64, f64, f64)> {
        let mut pixels = Vec::with_capacity(width * height);
        for _y in 0..height {
            for x in 0..width {
                let lum = x as f64 / width as f64;
                pixels.push((lum, lum, lum, 1.0));
            }
        }
        pixels
    }
    
    fn create_colored_pixels(width: usize, height: usize) -> Vec<(f64, f64, f64, f64)> {
        let mut pixels = Vec::with_capacity(width * height);
        for y in 0..height {
            for x in 0..width {
                let hue = (x as f64 / width as f64) * 6.0;
                let (r, g, b) = hue_to_rgb(hue);
                let brightness = 0.3 + 0.5 * (y as f64 / height as f64);
                pixels.push((r * brightness, g * brightness, b * brightness, 1.0));
            }
        }
        pixels
    }
    
    fn hue_to_rgb(hue: f64) -> (f64, f64, f64) {
        let hue = hue % 6.0;
        let x = 1.0 - (hue % 2.0 - 1.0).abs();
        match hue as usize {
            0 => (1.0, x, 0.0),
            1 => (x, 1.0, 0.0),
            2 => (0.0, 1.0, x),
            3 => (0.0, x, 1.0),
            4 => (x, 0.0, 1.0),
            _ => (1.0, 0.0, x),
        }
    }
    
    #[test]
    fn test_empty_buffer() {
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&[], 0, 0);
        assert_eq!(metrics.total_pixels, 0);
        assert_eq!(metrics.visible_pixels, 0);
    }
    
    #[test]
    fn test_fully_transparent() {
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 0.0, 100);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 10, 10);
        assert_eq!(metrics.total_pixels, 100);
        assert_eq!(metrics.visible_pixels, 0);
    }
    
    #[test]
    fn test_gradient_image_has_good_tonal_range() {
        let pixels = create_gradient_pixels(100, 100);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Gradient should have good tonal range utilization
        assert!(metrics.tonal_range_utilization > 0.5, 
            "Gradient should have good tonal range, got {}", metrics.tonal_range_utilization);
        
        // Should have midtones
        assert!(metrics.midtone_presence > 0.3,
            "Gradient should have midtones, got {}", metrics.midtone_presence);
        
        // Quality should be decent for a gradient
        assert!(metrics.quality_score > 0.4, 
            "Gradient quality should be decent, got {}", metrics.quality_score);
    }
    
    #[test]
    fn test_colored_image_has_color_variety() {
        let pixels = create_colored_pixels(100, 100);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Should detect color variety
        assert!(metrics.color_variety > 0.3,
            "Colored image should have variety, got {}", metrics.color_variety);
        
        // Should have reasonable saturation
        assert!(metrics.mean_saturation > 0.2,
            "Colored image should have saturation, got {}", metrics.mean_saturation);
    }
    
    #[test]
    fn test_highlight_clipping_detection() {
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 800);
        // Add 20% clipped highlights
        pixels.extend(create_test_pixels(1.0, 1.0, 1.0, 1.0, 200));
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 50, 20);
        
        assert!(metrics.highlight_clip_pct > 15.0 && metrics.highlight_clip_pct < 25.0,
            "Expected ~20% highlight clip, got {}%", metrics.highlight_clip_pct);
        
        // Technical score should be penalized
        assert!(metrics.technical_score < 0.9,
            "Technical score should be penalized for clipping, got {}", metrics.technical_score);
    }
    
    #[test]
    fn test_shadow_crushing_detection() {
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 700);
        // Add 30% crushed shadows
        pixels.extend(create_test_pixels(0.01, 0.01, 0.01, 1.0, 300));
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 50, 20);
        
        assert!(metrics.shadow_crush_pct > 25.0 && metrics.shadow_crush_pct < 35.0,
            "Expected ~30% shadow crush, got {}%", metrics.shadow_crush_pct);
    }
    
    #[test]
    fn test_flat_image_penalized() {
        // Completely flat gray image
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 10000);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Should have very low contrast spread
        assert!(metrics.contrast_spread < 0.01,
            "Flat image should have near-zero contrast, got {}", metrics.contrast_spread);
        
        // Quality should be penalized
        assert!(metrics.quality_score < 0.7,
            "Flat image should have lower quality score, got {}", metrics.quality_score);
        
        // Interest score should be low
        assert!(metrics.interest_score < 0.6,
            "Flat image should have low interest, got {}", metrics.interest_score);
    }
    
    #[test]
    fn test_well_exposed_image_scores_well() {
        // Create a well-distributed image (simulate good exposure)
        let mut pixels = Vec::with_capacity(10000);
        for i in 0..10000 {
            let t = i as f64 / 10000.0;
            // Gaussian-like distribution centered at 0.4
            let lum = 0.1 + 0.6 * (1.0 - (t - 0.5).abs() * 2.0).max(0.0);
            pixels.push((lum, lum * 0.9, lum * 0.95, 1.0)); // Slight color variation
        }
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Should have good midtone presence
        assert!(metrics.midtone_presence > 0.2,
            "Well-exposed image should have midtones, got {}", metrics.midtone_presence);
        
        // Technical score should be good
        assert!(metrics.technical_score > 0.6,
            "Well-exposed image should have good technical score, got {}", metrics.technical_score);
    }
    
    #[test]
    fn test_assessment_categories() {
        let mut metrics = EnhancedQualityMetrics::default();
        
        metrics.quality_score = 0.90;
        assert_eq!(metrics.assessment(), QualityAssessment::Excellent);
        
        metrics.quality_score = 0.75;
        assert_eq!(metrics.assessment(), QualityAssessment::Good);
        
        metrics.quality_score = 0.55;
        assert_eq!(metrics.assessment(), QualityAssessment::Acceptable);
        
        metrics.quality_score = 0.40;
        assert_eq!(metrics.assessment(), QualityAssessment::Poor);
    }
    
    #[test]
    fn test_suggest_adjustments_for_dark_image() {
        let mut metrics = EnhancedQualityMetrics::default();
        metrics.mean_luminance = 0.08; // Very dark
        metrics.shadow_crush_pct = 25.0; // Heavy crushing
        
        let adjustments = metrics.suggest_adjustments();
        
        // Should suggest exposure increase
        assert!(adjustments.iter().any(|a| a.param == "exposure_boost" && matches!(a.direction, AdjustmentDirection::Increase)),
            "Should suggest increasing exposure for dark image");
        
        // Should suggest reducing darkening effects
        assert!(adjustments.iter().any(|a| a.param == "atmospheric_darkening"),
            "Should suggest adjusting atmospheric darkening");
    }
    
    #[test]
    fn test_suggest_adjustments_for_flat_contrast() {
        let mut metrics = EnhancedQualityMetrics::default();
        metrics.contrast_spread = 0.03; // Very flat
        
        let adjustments = metrics.suggest_adjustments();
        
        // Should suggest contrast enhancement
        assert!(adjustments.iter().any(|a| a.param == "dodge_burn_strength"),
            "Should suggest dodge/burn for flat contrast");
        assert!(adjustments.iter().any(|a| a.param == "micro_contrast_strength"),
            "Should suggest micro contrast for flat images");
    }
    
    #[test]
    fn test_entropy_calculation() {
        // Uniform histogram (maximum entropy)
        let uniform_hist = vec![100; 16];
        let entropy = compute_entropy(&uniform_hist, 1600);
        assert!(entropy > 0.9, "Uniform histogram should have high entropy, got {}", entropy);
        
        // Single bin (minimum entropy)
        let mut single_bin = vec![0; 16];
        single_bin[8] = 1000;
        let low_entropy = compute_entropy(&single_bin, 1000);
        assert!(low_entropy < 0.1, "Single bin should have low entropy, got {}", low_entropy);
    }
    
    #[test]
    fn test_visual_balance_calculation() {
        // Create image with content concentrated in upper-left
        let mut pixels = Vec::with_capacity(10000);
        for y in 0..100 {
            for x in 0..100 {
                if x < 30 && y < 30 {
                    pixels.push((0.8, 0.8, 0.8, 1.0)); // Bright content
                } else {
                    pixels.push((0.1, 0.1, 0.1, 1.0)); // Dark background
                }
            }
        }
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Visual balance should show off-center content
        assert!(metrics.visual_balance > 0.1,
            "Off-center content should show imbalance, got {}", metrics.visual_balance);
    }
    
    #[test]
    fn test_center_focus_rewards_centered_content() {
        // Create image with content in center
        let mut pixels = Vec::with_capacity(10000);
        for y in 0..100 {
            for x in 0..100 {
                let dx = (x as f64 - 50.0) / 50.0;
                let dy = (y as f64 - 50.0) / 50.0;
                let dist = (dx * dx + dy * dy).sqrt();
                
                if dist < 0.4 {
                    pixels.push((0.7, 0.6, 0.5, 1.0)); // Bright center
                } else {
                    pixels.push((0.15, 0.15, 0.2, 1.0)); // Dark edges
                }
            }
        }
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Center focus should be rewarded
        assert!(metrics.center_focus > 0.4,
            "Centered content should have good center focus, got {}", metrics.center_focus);
        
        // Edge activity should be low
        assert!(metrics.edge_activity < 0.3,
            "Dark edges should have low activity, got {}", metrics.edge_activity);
    }
    
    #[test]
    fn test_quality_adjustment_apply() {
        let increase_adj = QualityAdjustment {
            category: AdjustmentCategory::Technical,
            param: "test".to_string(),
            direction: AdjustmentDirection::Increase,
            magnitude: 0.1,
            reason: "test".to_string(),
        };
        
        assert!((increase_adj.apply(0.5, 0.0, 1.0) - 0.6).abs() < 1e-10);
        assert!((increase_adj.apply(0.95, 0.0, 1.0) - 1.0).abs() < 1e-10); // Clamped
        
        let decrease_adj = QualityAdjustment {
            category: AdjustmentCategory::Technical,
            param: "test".to_string(),
            direction: AdjustmentDirection::Decrease,
            magnitude: 0.1,
            reason: "test".to_string(),
        };
        
        assert!((decrease_adj.apply(0.5, 0.0, 1.0) - 0.4).abs() < 1e-10);
        assert!((decrease_adj.apply(0.05, 0.0, 1.0) - 0.0).abs() < 1e-10); // Clamped
    }
    
    #[test]
    fn test_diagnostic_string_format() {
        let pixels = create_gradient_pixels(50, 50);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 50, 50);
        
        let diag = metrics.diagnostic_string();
        
        // Should contain all major categories
        assert!(diag.contains("Quality:"), "Should contain quality score");
        assert!(diag.contains("Technical:"), "Should contain technical score");
        assert!(diag.contains("Tonal:"), "Should contain tonal score");
        assert!(diag.contains("Composition:"), "Should contain composition score");
        assert!(diag.contains("Color:"), "Should contain color score");
        assert!(diag.contains("Interest:"), "Should contain interest score");
    }
    
    #[test]
    fn test_museum_quality_threshold() {
        let mut metrics = EnhancedQualityMetrics::default();
        
        metrics.quality_score = 0.71;
        assert!(metrics.passes_museum_quality());
        
        metrics.quality_score = 0.69;
        assert!(!metrics.passes_museum_quality());
    }
    
    #[test]
    fn test_exhibition_ready_threshold() {
        let mut metrics = EnhancedQualityMetrics::default();
        
        metrics.quality_score = 0.86;
        assert!(metrics.is_exhibition_ready());
        
        metrics.quality_score = 0.84;
        assert!(!metrics.is_exhibition_ready());
    }
    
    #[test]
    fn test_gamut_excursion_detection() {
        let mut pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 900);
        // Add some out-of-gamut pixels
        pixels.extend(create_test_pixels(2.0, 0.5, 0.5, 1.0, 100));
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 50, 20);
        
        assert_eq!(metrics.gamut_excursions, 100,
            "Should detect 100 gamut excursions, got {}", metrics.gamut_excursions);
    }
    
    #[test]
    fn test_sampled_metrics_match_full() {
        let pixels = create_gradient_pixels(100, 100);
        
        let full_metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        let identity_levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);
        let sampled_metrics = EnhancedQualityMetrics::from_tonemapped_pixel_buffer_sampled(
            &pixels, 100, 100, 2, &identity_levels
        );
        
        // Sampled should be close to full (within tolerance)
        assert!((full_metrics.mean_luminance - sampled_metrics.mean_luminance).abs() < 0.1,
            "Mean luminance should be similar: {} vs {}", 
            full_metrics.mean_luminance, sampled_metrics.mean_luminance);
        
        // Quality scores should be in the same ballpark
        assert!((full_metrics.quality_score - sampled_metrics.quality_score).abs() < 0.15,
            "Quality scores should be similar: {} vs {}",
            full_metrics.quality_score, sampled_metrics.quality_score);
    }
    
    // ========== Beauty Metrics Tests (P3 Museum Quality) ==========
    
    #[test]
    fn test_luminance_hierarchy_score() {
        // Test image with good luminance hierarchy: bright center, dark edges
        let mut pixels = Vec::with_capacity(10000);
        for y in 0..100 {
            for x in 0..100 {
                let dx = (x as f64 - 50.0) / 50.0;
                let dy = (y as f64 - 50.0) / 50.0;
                let dist = (dx * dx + dy * dy).sqrt();
                
                // Bright focal point in center, gradual falloff
                let lum = (1.0 - dist * 0.8).max(0.1);
                pixels.push((lum, lum * 0.9, lum * 0.85, 1.0));
            }
        }
        
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Should have decent luminance hierarchy (above flat baseline)
        assert!(metrics.luminance_hierarchy >= 0.30,
            "Well-organized luminance should have decent hierarchy, got {}", 
            metrics.luminance_hierarchy);
    }
    
    #[test]
    fn test_color_harmony_monochromatic() {
        // Test monochromatic image (high harmony)
        let pixels = create_test_pixels(0.6, 0.55, 0.5, 1.0, 10000); // Warm browns
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Monochromatic should have good harmony
        assert!(metrics.color_harmony >= 0.5,
            "Monochromatic image should have good harmony, got {}",
            metrics.color_harmony);
    }
    
    #[test]
    fn test_color_harmony_varied_colors() {
        // Test image with varied colors (should still have reasonable harmony)
        let pixels = create_colored_pixels(100, 100);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Varied colors should have moderate harmony
        assert!(metrics.color_harmony > 0.3 && metrics.color_harmony < 0.9,
            "Varied colors should have moderate harmony, got {}",
            metrics.color_harmony);
    }
    
    #[test]
    fn test_visual_rhythm_good_entropy() {
        // Test image with good visual rhythm (moderate entropy)
        let pixels = create_gradient_pixels(100, 100);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Gradient should have decent visual rhythm
        assert!(metrics.visual_rhythm >= 0.4,
            "Gradient image should have good visual rhythm, got {}",
            metrics.visual_rhythm);
    }
    
    #[test]
    fn test_visual_rhythm_flat_image() {
        // Test flat image (poor visual rhythm)
        let pixels = create_test_pixels(0.5, 0.5, 0.5, 1.0, 10000);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Flat image should have lower rhythm due to low entropy
        assert!(metrics.visual_rhythm <= 0.5,
            "Flat image should have lower visual rhythm, got {}",
            metrics.visual_rhythm);
    }
    
    #[test]
    fn test_beauty_score_combines_metrics() {
        // Test that beauty score is properly computed from sub-metrics
        let pixels = create_gradient_pixels(100, 100);
        let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
        
        // Beauty score should be in valid range
        assert!(metrics.beauty_score >= 0.0 && metrics.beauty_score <= 1.0,
            "Beauty score should be in [0, 1], got {}", metrics.beauty_score);
        
        // Beauty score should contribute to quality score
        // Quality score formula: tech*0.30 + tonal*0.25 + comp*0.20 + color*0.15 + interest*0.05 + beauty*0.05
        let expected_min = metrics.beauty_score * 0.05; // At minimum, beauty contributes this
        assert!(metrics.quality_score >= expected_min,
            "Beauty score ({}) should contribute to quality score ({})",
            metrics.beauty_score, metrics.quality_score);
    }
    
    #[test]
    fn test_beauty_metrics_default_values() {
        // Test that default values are reasonable
        let metrics = EnhancedQualityMetrics::default();
        
        assert_eq!(metrics.luminance_hierarchy, 0.5, "Default luminance_hierarchy should be 0.5");
        assert_eq!(metrics.color_harmony, 0.5, "Default color_harmony should be 0.5");
        assert_eq!(metrics.visual_rhythm, 0.5, "Default visual_rhythm should be 0.5");
        assert_eq!(metrics.beauty_score, 0.5, "Default beauty_score should be 0.5");
    }
}

