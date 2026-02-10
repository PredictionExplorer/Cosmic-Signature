//! Quality scoring heuristics for curation.

use crate::render::randomizable_config::ResolvedEffectConfig;
use image::{ImageBuffer, Rgb};
use nalgebra::Vector3;

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct QualityScores {
    pub technical_integrity: f64,
    pub composition_energy: f64,
    pub color_harmony: f64,
    pub effect_coherence: f64,
    pub temporal_stability: f64,
    pub motion_smoothness: f64,
    pub exposure_consistency: f64,
    pub image_composite: f64,
    pub video_composite: f64,
    pub final_composite: f64,
}

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct FrameFeatures {
    pub mean_rgb: [f64; 3],
    pub std_rgb: [f64; 3],
    pub occupancy_ratio: f64,
    pub edge_density: f64,
    pub center_energy_ratio: f64,
    pub clip_black_ratio: f64,
    pub clip_white_ratio: f64,
    pub banding_proxy: f64,
    pub saturation_mean: f64,
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

fn score_soft_range(value: f64, ideal_min: f64, ideal_max: f64, hard_min: f64, hard_max: f64) -> f64 {
    if value < hard_min || value > hard_max {
        return 0.0;
    }
    if value >= ideal_min && value <= ideal_max {
        return 1.0;
    }
    if value < ideal_min {
        return (value - hard_min) / (ideal_min - hard_min);
    }
    (hard_max - value) / (hard_max - ideal_max)
}

pub fn score_image_frame(
    frame: &ImageBuffer<Rgb<u16>, Vec<u16>>,
    config: &ResolvedEffectConfig,
) -> (QualityScores, FrameFeatures) {
    let width = frame.width() as usize;
    let height = frame.height() as usize;
    let pixel_count = (width * height).max(1);

    let mut sum = [0.0f64; 3];
    let mut sum_sq = [0.0f64; 3];

    let mut occupancy_count = 0usize;
    let mut clip_black_count = 0usize;
    let mut clip_white_count = 0usize;
    let mut edge_count = 0usize;
    let mut center_energy = 0.0f64;
    let mut total_energy = 0.0f64;
    let mut saturation_sum = 0.0f64;
    let mut luma_map = vec![0.0f64; pixel_count];
    let mut near_white_map = vec![false; pixel_count];

    let cx = (width as f64 - 1.0) * 0.5;
    let cy = (height as f64 - 1.0) * 0.5;
    let max_radius = cx.max(cy).max(1.0);

    let mut prev_luma_row = vec![0.0f64; width];
    let mut banding_hits = 0usize;
    let mut banding_checks = 0usize;

    for y in 0..height {
        let mut prev_luma = 0.0;
        let mut prev_delta = 0.0;
        for x in 0..width {
            let p = frame.get_pixel(x as u32, y as u32).0;
            let r = p[0] as f64 / 65535.0;
            let g = p[1] as f64 / 65535.0;
            let b = p[2] as f64 / 65535.0;

            sum[0] += r;
            sum[1] += g;
            sum[2] += b;
            sum_sq[0] += r * r;
            sum_sq[1] += g * g;
            sum_sq[2] += b * b;

            let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let idx = y * width + x;
            luma_map[idx] = lum;
            near_white_map[idx] = r >= 0.98 && g >= 0.98 && b >= 0.98;
            total_energy += lum;

            if lum > 0.004 {
                occupancy_count += 1;
            }

            if r <= 0.001 || g <= 0.001 || b <= 0.001 {
                clip_black_count += 1;
            }
            if r >= 0.999 || g >= 0.999 || b >= 0.999 {
                clip_white_count += 1;
            }

            let ch_max = r.max(g).max(b);
            let ch_min = r.min(g).min(b);
            saturation_sum += ch_max - ch_min;

            if x > 0 {
                let dl = (lum - prev_luma).abs();
                if dl > 0.03 {
                    edge_count += 1;
                }

                let delta2 = (dl - prev_delta).abs();
                banding_checks += 1;
                if dl < 0.0015 && delta2 < 0.0015 {
                    banding_hits += 1;
                }
                prev_delta = dl;
            }

            if y > 0 {
                let dv = (lum - prev_luma_row[x]).abs();
                if dv > 0.03 {
                    edge_count += 1;
                }
            }
            prev_luma_row[x] = lum;
            prev_luma = lum;

            let dx = x as f64 - cx;
            let dy = y as f64 - cy;
            let radius = ((dx * dx + dy * dy).sqrt() / max_radius).min(1.0);
            let center_weight = 1.0 - radius;
            center_energy += lum * center_weight;
        }
    }

    let means = [
        sum[0] / pixel_count as f64,
        sum[1] / pixel_count as f64,
        sum[2] / pixel_count as f64,
    ];
    let std = [
        (sum_sq[0] / pixel_count as f64 - means[0] * means[0]).max(0.0).sqrt(),
        (sum_sq[1] / pixel_count as f64 - means[1] * means[1]).max(0.0).sqrt(),
        (sum_sq[2] / pixel_count as f64 - means[2] * means[2]).max(0.0).sqrt(),
    ];

    let occupancy_ratio = occupancy_count as f64 / pixel_count as f64;
    let edge_density = edge_count as f64 / (2.0 * pixel_count as f64);
    let center_energy_ratio = if total_energy > 1e-12 { center_energy / total_energy } else { 0.0 };
    let clip_black_ratio = clip_black_count as f64 / pixel_count as f64;
    let clip_white_ratio = clip_white_count as f64 / pixel_count as f64;
    let banding_proxy = if banding_checks > 0 {
        banding_hits as f64 / banding_checks as f64
    } else {
        0.0
    };
    let saturation_mean = saturation_sum / pixel_count as f64;

    let border_x = ((width as f64) * 0.12).ceil() as usize;
    let border_y = ((height as f64) * 0.12).ceil() as usize;
    let interior_w = width.saturating_sub(border_x.saturating_mul(2));
    let interior_h = height.saturating_sub(border_y.saturating_mul(2));
    let perimeter_pixels = pixel_count.saturating_sub(interior_w.saturating_mul(interior_h)).max(1);
    let mut perimeter_speckle_count = 0usize;
    if width > 2 && height > 2 {
        for y in 1..(height - 1) {
            for x in 1..(width - 1) {
                let is_perimeter =
                    x < border_x || x >= width - border_x || y < border_y || y >= height - border_y;
                if !is_perimeter {
                    continue;
                }
                let idx = y * width + x;
                if !near_white_map[idx] {
                    continue;
                }

                let mut has_dark_neighbor = false;
                for ny in (y - 1)..=(y + 1) {
                    for nx in (x - 1)..=(x + 1) {
                        if nx == x && ny == y {
                            continue;
                        }
                        if luma_map[ny * width + nx] < 0.18 {
                            has_dark_neighbor = true;
                            break;
                        }
                    }
                    if has_dark_neighbor {
                        break;
                    }
                }
                if has_dark_neighbor {
                    perimeter_speckle_count += 1;
                }
            }
        }
    }
    let perimeter_speckle_ratio = perimeter_speckle_count as f64 / perimeter_pixels as f64;
    let perimeter_speckle_penalty = if perimeter_speckle_count < 6 {
        0.0
    } else {
        clamp01((perimeter_speckle_ratio - 0.00010) / 0.00040)
    };

    let occupancy_score = score_soft_range(occupancy_ratio, 0.12, 0.72, 0.03, 0.90);
    let edge_score = score_soft_range(edge_density, 0.04, 0.28, 0.005, 0.45);
    let center_score = score_soft_range(center_energy_ratio, 0.22, 0.60, 0.06, 0.85);

    let clip_penalty = clamp01((clip_black_ratio - 0.10) * 1.8 + (clip_white_ratio - 0.04) * 5.0);
    let banding_penalty = clamp01((banding_proxy - 0.20) * 1.6);
    let overblur_penalty = if config.blur_radius_scale > 0.05 && config.blur_strength > 18.0 {
        0.30
    } else {
        0.0
    };
    let oversharp_penalty = if config.micro_contrast_strength > 0.55 { 0.20 } else { 0.0 };

    let technical_integrity = clamp01(
        1.0
            - (0.36 * clip_penalty
                + 0.18 * banding_penalty
                + 0.12 * overblur_penalty
                + 0.08 * oversharp_penalty
                + 0.26 * perimeter_speckle_penalty),
    );

    let composition_energy = clamp01(0.40 * occupancy_score + 0.35 * edge_score + 0.25 * center_score);

    let sat_score = score_soft_range(saturation_mean, 0.14, 0.55, 0.03, 0.85);
    let channel_balance = {
        let diff_rg = (means[0] - means[1]).abs();
        let diff_rb = (means[0] - means[2]).abs();
        let diff_gb = (means[1] - means[2]).abs();
        clamp01(1.0 - ((diff_rg + diff_rb + diff_gb) / 1.8))
    };
    let color_harmony = clamp01(0.68 * sat_score + 0.32 * channel_balance);

    let mut coherence_penalty = 0.0;
    if config.enable_gradient_map && config.enable_color_grade {
        let combo = config.gradient_map_strength + config.color_grade_strength;
        if combo > 1.35 {
            coherence_penalty += 0.28;
        }
    }
    if !config.enable_bloom && !config.enable_glow && !config.enable_chromatic_bloom {
        coherence_penalty += 0.35;
    }
    if config.enable_opalescence && config.opalescence_layers >= 5 && config.fine_texture_contrast > 0.40 {
        coherence_penalty += 0.20;
    }
    if config.clip_black > 0.020 && config.clip_white < 0.985 {
        coherence_penalty += 0.25;
    }
    coherence_penalty += 0.40 * perimeter_speckle_penalty;
    let effect_coherence = clamp01(1.0 - coherence_penalty);

    let image_composite = clamp01(
        0.30 * technical_integrity
            + 0.30 * composition_energy
            + 0.20 * color_harmony
            + 0.20 * effect_coherence,
    );

    let features = FrameFeatures {
        mean_rgb: means,
        std_rgb: std,
        occupancy_ratio,
        edge_density,
        center_energy_ratio,
        clip_black_ratio,
        clip_white_ratio,
        banding_proxy,
        saturation_mean,
    };

    let scores = QualityScores {
        technical_integrity,
        composition_energy,
        color_harmony,
        effect_coherence,
        temporal_stability: image_composite,
        motion_smoothness: image_composite,
        exposure_consistency: image_composite,
        image_composite,
        video_composite: image_composite,
        final_composite: image_composite,
    };

    (scores, features)
}

pub fn estimate_temporal_scores(positions: &[Vec<Vector3<f64>>]) -> (f64, f64, f64) {
    if positions.is_empty() || positions[0].len() < 4 {
        return (0.5, 0.5, 0.5);
    }

    let steps = positions[0].len();
    let mut speed = Vec::with_capacity(steps.saturating_sub(1));

    for t in 1..steps {
        let mut total_speed = 0.0;
        for body in positions {
            let v = (body[t] - body[t - 1]).norm();
            total_speed += v;
        }
        speed.push(total_speed / positions.len() as f64);
    }

    if speed.len() < 3 {
        return (0.5, 0.5, 0.5);
    }

    let mut accel = Vec::with_capacity(speed.len() - 1);
    for i in 1..speed.len() {
        accel.push(speed[i] - speed[i - 1]);
    }

    let mut jerk_sum = 0.0;
    let mut jerk_count = 0usize;
    for i in 1..accel.len() {
        jerk_sum += (accel[i] - accel[i - 1]).abs();
        jerk_count += 1;
    }
    let jerk_mean = if jerk_count > 0 { jerk_sum / jerk_count as f64 } else { 0.0 };

    let mean_speed = speed.iter().sum::<f64>() / speed.len() as f64;
    let speed_var = speed
        .iter()
        .map(|v| {
            let d = *v - mean_speed;
            d * d
        })
        .sum::<f64>()
        / speed.len() as f64;
    let speed_std = speed_var.sqrt();

    let temporal_stability = clamp01(1.0 / (1.0 + 10.0 * speed_std));
    let motion_smoothness = clamp01(1.0 / (1.0 + 30.0 * jerk_mean));
    let exposure_consistency = clamp01(1.0 / (1.0 + 6.0 * (speed_std + jerk_mean)));

    (temporal_stability, motion_smoothness, exposure_consistency)
}

fn probe_frame_signature(frame: &ImageBuffer<Rgb<u16>, Vec<u16>>) -> (f64, f64, f64, f64) {
    let width = frame.width() as usize;
    let height = frame.height() as usize;
    let pixel_count = (width * height).max(1) as f64;

    let mut sum_luma = 0.0;
    let mut sum_chroma = 0.0;
    let mut weighted_x = 0.0;
    let mut weighted_y = 0.0;

    for y in 0..height {
        for x in 0..width {
            let p = frame.get_pixel(x as u32, y as u32).0;
            let r = p[0] as f64 / 65535.0;
            let g = p[1] as f64 / 65535.0;
            let b = p[2] as f64 / 65535.0;
            let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            let chroma = r.max(g).max(b) - r.min(g).min(b);

            sum_luma += luma;
            sum_chroma += chroma;
            weighted_x += x as f64 * luma;
            weighted_y += y as f64 * luma;
        }
    }

    let mean_luma = sum_luma / pixel_count;
    let mean_chroma = sum_chroma / pixel_count;
    let denom = sum_luma.max(1e-9);
    let centroid_x = if width > 1 {
        (weighted_x / denom) / (width as f64 - 1.0)
    } else {
        0.5
    };
    let centroid_y = if height > 1 {
        (weighted_y / denom) / (height as f64 - 1.0)
    } else {
        0.5
    };

    (mean_luma, mean_chroma, centroid_x, centroid_y)
}

pub fn score_temporal_probe_frames(
    probe_frames: &[ImageBuffer<Rgb<u16>, Vec<u16>>],
) -> (f64, f64, f64) {
    if probe_frames.is_empty() {
        return (0.5, 0.5, 0.5);
    }
    if probe_frames.len() == 1 {
        return (0.65, 0.65, 0.65);
    }

    let signatures: Vec<(f64, f64, f64, f64)> =
        probe_frames.iter().map(probe_frame_signature).collect();

    let mut luminance_deltas = Vec::with_capacity(signatures.len().saturating_sub(1));
    let mut chroma_deltas = Vec::with_capacity(signatures.len().saturating_sub(1));
    let mut centroid_velocity = Vec::with_capacity(signatures.len().saturating_sub(1));

    for i in 1..signatures.len() {
        let prev = signatures[i - 1];
        let curr = signatures[i];
        luminance_deltas.push((curr.0 - prev.0).abs());
        chroma_deltas.push((curr.1 - prev.1).abs());
        let dx = curr.2 - prev.2;
        let dy = curr.3 - prev.3;
        centroid_velocity.push((dx * dx + dy * dy).sqrt());
    }

    let avg_luma_delta =
        luminance_deltas.iter().sum::<f64>() / luminance_deltas.len().max(1) as f64;
    let avg_chroma_delta = chroma_deltas.iter().sum::<f64>() / chroma_deltas.len().max(1) as f64;
    let avg_velocity = centroid_velocity.iter().sum::<f64>() / centroid_velocity.len().max(1) as f64;

    let mut jerk_sum = 0.0;
    let mut jerk_count = 0usize;
    for i in 1..centroid_velocity.len() {
        jerk_sum += (centroid_velocity[i] - centroid_velocity[i - 1]).abs();
        jerk_count += 1;
    }
    let avg_jerk = if jerk_count > 0 {
        jerk_sum / jerk_count as f64
    } else {
        0.0
    };

    let mean_luma = signatures.iter().map(|s| s.0).sum::<f64>() / signatures.len() as f64;
    let luma_std = (signatures
        .iter()
        .map(|s| {
            let d = s.0 - mean_luma;
            d * d
        })
        .sum::<f64>()
        / signatures.len() as f64)
        .sqrt();

    let temporal_stability =
        clamp01(1.0 / (1.0 + 12.0 * avg_luma_delta + 9.0 * avg_chroma_delta));
    let motion_smoothness = clamp01(1.0 / (1.0 + 6.0 * avg_velocity + 16.0 * avg_jerk));
    let exposure_consistency = clamp01(1.0 / (1.0 + 24.0 * luma_std + 12.0 * avg_luma_delta));

    (temporal_stability, motion_smoothness, exposure_consistency)
}

pub fn apply_video_and_novelty(
    scores: &mut QualityScores,
    temporal_stability: f64,
    motion_smoothness: f64,
    exposure_consistency: f64,
    novelty_score: f64,
) {
    scores.temporal_stability = clamp01(temporal_stability);
    scores.motion_smoothness = clamp01(motion_smoothness);
    scores.exposure_consistency = clamp01(exposure_consistency);

    scores.video_composite = clamp01(
        0.45 * scores.temporal_stability
            + 0.30 * scores.motion_smoothness
            + 0.25 * scores.exposure_consistency,
    );

    scores.final_composite = clamp01(0.70 * scores.image_composite + 0.20 * scores.video_composite + 0.10 * novelty_score);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config(width: u32, height: u32) -> ResolvedEffectConfig {
        ResolvedEffectConfig {
            width,
            height,
            gallery_quality: false,
            special_mode: false,
            enable_bloom: true,
            enable_glow: true,
            enable_chromatic_bloom: true,
            enable_perceptual_blur: true,
            enable_micro_contrast: true,
            enable_gradient_map: true,
            enable_color_grade: true,
            enable_champleve: true,
            enable_aether: true,
            enable_opalescence: true,
            enable_edge_luminance: true,
            enable_atmospheric_depth: true,
            enable_fine_texture: true,
            blur_strength: 8.0,
            blur_radius_scale: 0.02,
            blur_core_brightness: 8.0,
            dog_strength: 0.4,
            dog_sigma_scale: 0.006,
            dog_ratio: 2.6,
            glow_strength: 0.4,
            glow_threshold: 0.6,
            glow_radius_scale: 0.006,
            glow_sharpness: 2.6,
            glow_saturation_boost: 0.2,
            chromatic_bloom_strength: 0.6,
            chromatic_bloom_radius_scale: 0.012,
            chromatic_bloom_separation_scale: 0.002,
            chromatic_bloom_threshold: 0.16,
            perceptual_blur_strength: 0.6,
            color_grade_strength: 0.5,
            vignette_strength: 0.3,
            vignette_softness: 2.4,
            vibrance: 1.1,
            clarity_strength: 0.3,
            tone_curve_strength: 0.5,
            gradient_map_strength: 0.7,
            gradient_map_hue_preservation: 0.2,
            gradient_map_palette: 1,
            opalescence_strength: 0.2,
            opalescence_scale: 0.01,
            opalescence_layers: 3,
            champleve_flow_alignment: 0.6,
            champleve_interference_amplitude: 0.5,
            champleve_rim_intensity: 1.8,
            champleve_rim_warmth: 0.5,
            champleve_interior_lift: 0.6,
            aether_flow_alignment: 0.7,
            aether_scattering_strength: 0.9,
            aether_iridescence_amplitude: 0.6,
            aether_caustic_strength: 0.2,
            micro_contrast_strength: 0.3,
            micro_contrast_radius: 4,
            edge_luminance_strength: 0.2,
            edge_luminance_threshold: 0.2,
            edge_luminance_brightness_boost: 0.3,
            atmospheric_depth_strength: 0.2,
            atmospheric_desaturation: 0.3,
            atmospheric_darkening: 0.2,
            atmospheric_fog_color_r: 0.1,
            atmospheric_fog_color_g: 0.1,
            atmospheric_fog_color_b: 0.1,
            fine_texture_strength: 0.1,
            fine_texture_scale: 0.001,
            fine_texture_contrast: 0.3,
            hdr_scale: 0.12,
            clip_black: 0.01,
            clip_white: 0.99,
            nebula_strength: 0.05,
            nebula_octaves: 4,
            nebula_base_frequency: 0.001,
        }
    }

    fn gradient_frame(width: u32, height: u32) -> ImageBuffer<Rgb<u16>, Vec<u16>> {
        let mut img = ImageBuffer::<Rgb<u16>, Vec<u16>>::new(width, height);
        let cx = width as f64 * 0.5;
        let cy = height as f64 * 0.5;
        let rx = width as f64 * 0.28;
        let ry = height as f64 * 0.22;
        for (x, y, p) in img.enumerate_pixels_mut() {
            let dx = (x as f64 - cx) / rx.max(1.0);
            let dy = (y as f64 - cy) / ry.max(1.0);
            let d2 = dx * dx + dy * dy;
            if d2 <= 1.0 {
                let core = (1.0 - d2).powf(0.65);
                let v = ((0.22 + 0.53 * core) * 65535.0).round() as u16;
                *p = Rgb([v, v, v]);
            } else {
                *p = Rgb([0, 0, 0]);
            }
        }
        img
    }

    fn add_perimeter_speckles(img: &mut ImageBuffer<Rgb<u16>, Vec<u16>>, count: usize) {
        let width = img.width() as usize;
        let height = img.height() as usize;
        let border_y = ((height as f64) * 0.12).ceil() as usize;
        let mut written = 0usize;
        let mut x = 1usize;
        while written < count && x + 1 < width {
            let y = if written.is_multiple_of(2) {
                border_y.max(1).saturating_sub(1).min(height - 2)
            } else {
                (height - border_y.max(1)).min(height - 2)
            };
            img.put_pixel(x as u32, y as u32, Rgb([65535, 65535, 65535]));
            written += 1;
            x = x.saturating_add(3);
            if x + 1 >= width {
                x = 1;
            }
        }
    }

    fn add_center_highlights(img: &mut ImageBuffer<Rgb<u16>, Vec<u16>>, count: usize) {
        let width = img.width() as usize;
        let height = img.height() as usize;
        let x0 = width / 3;
        let x1 = (2 * width / 3).max(x0 + 1);
        let y0 = height / 3;
        let y1 = (2 * height / 3).max(y0 + 1);
        let mut written = 0usize;
        let mut x = x0;
        let mut y = y0;
        while written < count {
            img.put_pixel(x as u32, y as u32, Rgb([65535, 65535, 65535]));
            written += 1;
            x += 5;
            if x >= x1 {
                x = x0;
                y += 5;
                if y >= y1 {
                    y = y0;
                }
            }
        }
    }

    #[test]
    fn image_score_is_bounded() {
        let mut img = ImageBuffer::<Rgb<u16>, Vec<u16>>::new(16, 16);
        for (x, y, p) in img.enumerate_pixels_mut() {
            let v = (((x + y) as f64 / 30.0) * 65535.0) as u16;
            *p = Rgb([v, v, v]);
        }

        let config = test_config(16, 16);

        let (scores, _features) = score_image_frame(&img, &config);
        assert!((0.0..=1.0).contains(&scores.image_composite));
        assert!((0.0..=1.0).contains(&scores.final_composite));
    }

    #[test]
    fn perimeter_white_speckles_are_heavily_penalized() {
        let config = test_config(256, 256);
        let clean = gradient_frame(256, 256);
        let mut artifacted = clean.clone();
        add_perimeter_speckles(&mut artifacted, 220);

        let (clean_scores, _) = score_image_frame(&clean, &config);
        let (artifact_scores, _) = score_image_frame(&artifacted, &config);

        assert!(artifact_scores.technical_integrity < clean_scores.technical_integrity - 0.20);
        assert!(artifact_scores.image_composite < clean_scores.image_composite - 0.10);
    }

    #[test]
    fn center_highlights_are_not_treated_as_perimeter_speckles() {
        let config = test_config(256, 256);
        let base = gradient_frame(256, 256);
        let mut center_hot = base.clone();
        let mut perimeter_hot = base.clone();

        add_center_highlights(&mut center_hot, 220);
        add_perimeter_speckles(&mut perimeter_hot, 220);

        let (center_scores, _) = score_image_frame(&center_hot, &config);
        let (perimeter_scores, _) = score_image_frame(&perimeter_hot, &config);

        assert!(perimeter_scores.technical_integrity < center_scores.technical_integrity - 0.15);
        assert!(perimeter_scores.image_composite < center_scores.image_composite - 0.08);
    }

    #[test]
    fn tiny_number_of_perimeter_speckles_does_not_overpenalize() {
        let config = test_config(256, 256);
        let clean = gradient_frame(256, 256);
        let mut sparse = clean.clone();
        add_perimeter_speckles(&mut sparse, 4);

        let (clean_scores, _) = score_image_frame(&clean, &config);
        let (sparse_scores, _) = score_image_frame(&sparse, &config);

        assert!(sparse_scores.technical_integrity > clean_scores.technical_integrity - 0.06);
        assert!(sparse_scores.image_composite > clean_scores.image_composite - 0.04);
    }

    #[test]
    fn severe_perimeter_speckles_reduce_effect_coherence() {
        let config = test_config(256, 256);
        let clean = gradient_frame(256, 256);
        let mut artifacted = clean.clone();
        add_perimeter_speckles(&mut artifacted, 240);

        let (clean_scores, _) = score_image_frame(&clean, &config);
        let (artifact_scores, _) = score_image_frame(&artifacted, &config);

        assert!(artifact_scores.effect_coherence < clean_scores.effect_coherence - 0.25);
    }

    fn solid_frame(width: u32, height: u32, v: u16) -> ImageBuffer<Rgb<u16>, Vec<u16>> {
        let mut img = ImageBuffer::<Rgb<u16>, Vec<u16>>::new(width, height);
        for p in img.pixels_mut() {
            *p = Rgb([v, v, v]);
        }
        img
    }

    fn moving_spot_frames(width: u32, height: u32, count: usize) -> Vec<ImageBuffer<Rgb<u16>, Vec<u16>>> {
        let mut frames = Vec::with_capacity(count);
        for i in 0..count {
            let mut img = ImageBuffer::<Rgb<u16>, Vec<u16>>::new(width, height);
            let x = (i.min(width.saturating_sub(1) as usize)) as u32;
            let y = (height / 2).min(height.saturating_sub(1));
            img.put_pixel(x, y, Rgb([65535, 65535, 65535]));
            frames.push(img);
        }
        frames
    }

    fn single_spot_frame(width: u32, height: u32, x: u32) -> ImageBuffer<Rgb<u16>, Vec<u16>> {
        let mut img = ImageBuffer::<Rgb<u16>, Vec<u16>>::new(width, height);
        let clamped_x = x.min(width.saturating_sub(1));
        let y = (height / 2).min(height.saturating_sub(1));
        img.put_pixel(clamped_x, y, Rgb([65535, 65535, 65535]));
        img
    }

    #[test]
    fn probe_temporal_scores_reward_stability() {
        let stable = vec![
            solid_frame(16, 16, 12_000),
            solid_frame(16, 16, 12_000),
            solid_frame(16, 16, 12_000),
            solid_frame(16, 16, 12_000),
        ];
        let flicker = vec![
            solid_frame(16, 16, 6_000),
            solid_frame(16, 16, 50_000),
            solid_frame(16, 16, 6_000),
            solid_frame(16, 16, 50_000),
        ];

        let stable_scores = score_temporal_probe_frames(&stable);
        let flicker_scores = score_temporal_probe_frames(&flicker);
        assert!(stable_scores.0 > flicker_scores.0);
        assert!(stable_scores.2 > flicker_scores.2);
    }

    #[test]
    fn probe_temporal_scores_capture_motion_smoothness() {
        let smooth = moving_spot_frames(32, 16, 5);
        let jitter = vec![
            single_spot_frame(32, 16, 1),
            single_spot_frame(32, 16, 2),
            single_spot_frame(32, 16, 31),
            single_spot_frame(32, 16, 2),
            single_spot_frame(32, 16, 28),
        ];

        let smooth_scores = score_temporal_probe_frames(&smooth);
        let jitter_scores = score_temporal_probe_frames(&jitter);
        assert!(smooth_scores.1 > jitter_scores.1);
    }
}
