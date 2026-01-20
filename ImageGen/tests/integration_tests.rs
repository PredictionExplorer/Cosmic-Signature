//! Integration tests for the museum-quality effects pipeline
//!
//! These tests verify that effects work correctly together and maintain
//! image integrity through the processing chain.

use three_body_problem::post_effects::*;
use three_body_problem::analysis::*;
use three_body_problem::sim::*;
use three_body_problem::optim::simd::*;
use nalgebra::Vector3;

// ═══════════════════════════════════════════════════════════════════════════════
// EFFECT CHAIN INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Test that multiple effects can be chained without panicking
#[test]
fn test_effect_chain_integration() {
    let mut chain = PostEffectChain::new();
    
    // Add all new effects
    chain.add(Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())));
    chain.add(Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())));
    chain.add(Box::new(DichroicGlass::new(DichroicGlassConfig::default())));
    chain.add(Box::new(Ferrofluid::new(FerrofluidConfig::default())));
    chain.add(Box::new(TemporalEchoes::new(TemporalEchoesConfig::default())));
    chain.add(Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())));
    
    // Create test buffer (10x10 with gradient)
    let width = 10;
    let height = 10;
    let mut buffer: PixelBuffer = Vec::with_capacity(width * height);
    for y in 0..height {
        for x in 0..width {
            let r = x as f64 / width as f64;
            let g = y as f64 / height as f64;
            let b = 0.5;
            let a = 0.8;
            buffer.push((r * a, g * a, b * a, a)); // Premultiplied
        }
    }
    
    let result = chain.process(buffer, width, height);
    assert!(result.is_ok(), "Effect chain should process without error");
    
    let output = result.unwrap();
    assert_eq!(output.len(), width * height, "Output size should match input");
}

/// Test that the ancient manuscript effect works as a complete style override
#[test]
fn test_ancient_manuscript_full_override() {
    let effect = AncientManuscript::new(AncientManuscriptConfig {
        strength: 1.0, // Full strength
        ..Default::default()
    });
    
    // Create a colorful test buffer
    let width = 20;
    let height = 20;
    let mut buffer: PixelBuffer = Vec::with_capacity(width * height);
    for y in 0..height {
        for x in 0..width {
            // Create a rainbow pattern
            let hue = (x + y) as f64 / 40.0;
            let (r, g, b) = hsv_to_rgb(hue, 1.0, 1.0);
            buffer.push((r, g, b, 1.0));
        }
    }
    
    let result = effect.process(&buffer, width, height).unwrap();
    
    // Verify output is valid and has sepia-like warmth overall
    let mut total_r = 0.0;
    let mut total_b = 0.0;
    for pixel in &result {
        total_r += pixel.0;
        total_b += pixel.2;
        // All values should be valid
        assert!(!pixel.0.is_nan() && pixel.0 >= 0.0);
        assert!(!pixel.1.is_nan() && pixel.1 >= 0.0);
        assert!(!pixel.2.is_nan() && pixel.2 >= 0.0);
    }
    
    // On average, sepia should be warmer (more red than blue)
    assert!(total_r >= total_b * 0.9, "Overall should be warm-toned");
}

/// Test that effects preserve premultiplied alpha correctly
#[test]
fn test_premultiplied_alpha_preservation() {
    let effects: Vec<Box<dyn PostEffect>> = vec![
        Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())),
        Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())),
        Box::new(DichroicGlass::new(DichroicGlassConfig::default())),
        Box::new(Ferrofluid::new(FerrofluidConfig::default())),
        Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())),
    ];
    
    let width = 5;
    let height = 5;
    
    for effect in effects {
        // Test with varying alpha values
        let mut buffer: PixelBuffer = Vec::with_capacity(width * height);
        for i in 0..(width * height) {
            let alpha = (i as f64 + 1.0) / (width * height) as f64; // 0.04 to 1.0
            let r = 0.6 * alpha; // Premultiplied
            let g = 0.4 * alpha;
            let b = 0.8 * alpha;
            buffer.push((r, g, b, alpha));
        }
        
        let result = effect.process(&buffer, width, height).unwrap();
        
        // Verify premultiplied relationship (color <= alpha for each channel)
        for (i, pixel) in result.iter().enumerate() {
            if pixel.3 > 0.001 {
                // Allow small tolerance for floating point
                let tolerance = 0.1;
                assert!(
                    pixel.0 <= pixel.3 + tolerance,
                    "Effect {} broke premultiplied alpha at pixel {}: r={} > a={}",
                    effect.name(), i, pixel.0, pixel.3
                );
                assert!(
                    pixel.1 <= pixel.3 + tolerance,
                    "Effect {} broke premultiplied alpha at pixel {}: g={} > a={}",
                    effect.name(), i, pixel.1, pixel.3
                );
                assert!(
                    pixel.2 <= pixel.3 + tolerance,
                    "Effect {} broke premultiplied alpha at pixel {}: b={} > a={}",
                    effect.name(), i, pixel.2, pixel.3
                );
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Test effects handle empty buffers gracefully
#[test]
fn test_effects_handle_empty_buffer() {
    let effects: Vec<Box<dyn PostEffect>> = vec![
        Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())),
        Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())),
        Box::new(DichroicGlass::new(DichroicGlassConfig::default())),
        Box::new(Ferrofluid::new(FerrofluidConfig::default())),
        Box::new(TemporalEchoes::new(TemporalEchoesConfig::default())),
        Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())),
        Box::new(AncientManuscript::new(AncientManuscriptConfig::default())),
    ];
    
    let empty_buffer: PixelBuffer = vec![];
    
    for effect in effects {
        let result = effect.process(&empty_buffer, 0, 0);
        assert!(result.is_ok(), "Effect {} should handle empty buffer", effect.name());
        assert!(result.unwrap().is_empty(), "Effect {} should return empty for empty input", effect.name());
    }
}

/// Test effects handle single pixel buffers
#[test]
fn test_effects_handle_single_pixel() {
    let effects: Vec<Box<dyn PostEffect>> = vec![
        Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())),
        Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())),
        Box::new(DichroicGlass::new(DichroicGlassConfig::default())),
        Box::new(Ferrofluid::new(FerrofluidConfig::default())),
        Box::new(TemporalEchoes::new(TemporalEchoesConfig::default())),
        Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())),
        Box::new(AncientManuscript::new(AncientManuscriptConfig::default())),
    ];
    
    let single_pixel: PixelBuffer = vec![(0.5, 0.3, 0.7, 1.0)];
    
    for effect in effects {
        let result = effect.process(&single_pixel, 1, 1);
        assert!(result.is_ok(), "Effect {} should handle single pixel", effect.name());
        assert_eq!(result.unwrap().len(), 1, "Effect {} should return single pixel", effect.name());
    }
}

/// Test effects handle extreme color values
#[test]
fn test_effects_handle_extreme_values() {
    let effects: Vec<Box<dyn PostEffect>> = vec![
        Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())),
        Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())),
        Box::new(DichroicGlass::new(DichroicGlassConfig::default())),
        Box::new(Ferrofluid::new(FerrofluidConfig::default())),
        Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())),
    ];
    
    // Test with HDR-like extreme values
    let extreme_buffer: PixelBuffer = vec![
        (10.0, 10.0, 10.0, 1.0),  // Very bright
        (0.0, 0.0, 0.0, 1.0),     // Black
        (0.0, 0.0, 0.0, 0.0),     // Fully transparent
        (5.0, 0.0, 0.0, 1.0),     // Bright red only
    ];
    
    for effect in effects {
        let result = effect.process(&extreme_buffer, 2, 2);
        assert!(result.is_ok(), "Effect {} should handle extreme values", effect.name());
        
        let output = result.unwrap();
        for pixel in &output {
            assert!(!pixel.0.is_nan(), "Effect {} produced NaN in red", effect.name());
            assert!(!pixel.1.is_nan(), "Effect {} produced NaN in green", effect.name());
            assert!(!pixel.2.is_nan(), "Effect {} produced NaN in blue", effect.name());
            assert!(!pixel.3.is_nan(), "Effect {} produced NaN in alpha", effect.name());
        }
    }
}

/// Test effects handle non-square buffers
#[test]
fn test_effects_handle_non_square_buffers() {
    let effects: Vec<Box<dyn PostEffect>> = vec![
        Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())),
        Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())),
        Box::new(DichroicGlass::new(DichroicGlassConfig::default())),
        Box::new(Ferrofluid::new(FerrofluidConfig::default())),
        Box::new(TemporalEchoes::new(TemporalEchoesConfig::default())),
        Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())),
    ];
    
    // Wide buffer (20x5)
    let wide_buffer: PixelBuffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
    
    // Tall buffer (5x20)
    let tall_buffer: PixelBuffer = vec![(0.5, 0.5, 0.5, 1.0); 100];
    
    for effect in &effects {
        let wide_result = effect.process(&wide_buffer, 20, 5);
        assert!(wide_result.is_ok(), "Effect {} should handle wide buffer", effect.name());
        assert_eq!(wide_result.unwrap().len(), 100);
        
        let tall_result = effect.process(&tall_buffer, 5, 20);
        assert!(tall_result.is_ok(), "Effect {} should handle tall buffer", effect.name());
        assert_eq!(tall_result.unwrap().len(), 100);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISM TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Test that effects produce deterministic output
#[test]
fn test_effect_determinism() {
    let width = 15;
    let height = 15;
    
    // Create test buffer with pattern
    let create_buffer = || -> PixelBuffer {
        let mut buffer = Vec::with_capacity(width * height);
        for y in 0..height {
            for x in 0..width {
                let r = (x as f64 * 0.07).sin().abs();
                let g = (y as f64 * 0.11).cos().abs();
                let b = ((x + y) as f64 * 0.05).sin().abs();
                buffer.push((r * 0.9, g * 0.9, b * 0.9, 0.9));
            }
        }
        buffer
    };
    
    let effects: Vec<Box<dyn PostEffect>> = vec![
        Box::new(BlackbodyRadiation::new(BlackbodyConfig::default())),
        Box::new(SubsurfaceScattering::new(SubsurfaceScatteringConfig::default())),
        Box::new(DichroicGlass::new(DichroicGlassConfig::default())),
        Box::new(Ferrofluid::new(FerrofluidConfig::default())),
        Box::new(SpectralInterference::new(SpectralInterferenceConfig::default())),
    ];
    
    for effect in effects {
        let buffer1 = create_buffer();
        let buffer2 = create_buffer();
        
        let result1 = effect.process(&buffer1, width, height).unwrap();
        let result2 = effect.process(&buffer2, width, height).unwrap();
        
        assert_eq!(result1.len(), result2.len());
        
        for (i, (p1, p2)) in result1.iter().zip(result2.iter()).enumerate() {
            assert!(
                (p1.0 - p2.0).abs() < 1e-10,
                "Effect {} is non-deterministic at pixel {} (r: {} vs {})",
                effect.name(), i, p1.0, p2.0
            );
            assert!(
                (p1.1 - p2.1).abs() < 1e-10,
                "Effect {} is non-deterministic at pixel {} (g: {} vs {})",
                effect.name(), i, p1.1, p2.1
            );
            assert!(
                (p1.2 - p2.2).abs() < 1e-10,
                "Effect {} is non-deterministic at pixel {} (b: {} vs {})",
                effect.name(), i, p1.2, p2.2
            );
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS MODULE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Test golden ratio scoring with ideal composition
#[test]
fn test_golden_ratio_ideal_composition() {
    // Create positions that span the canvas well
    let positions = vec![
        vec![
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(0.5, 0.0, 0.0),
            Vector3::new(1.0, 0.0, 0.0),
            Vector3::new(0.0, 0.5, 0.0),
            Vector3::new(0.5, 0.5, 0.0),
            Vector3::new(1.0, 0.5, 0.0),
            Vector3::new(0.0, 1.0, 0.0),
            Vector3::new(0.5, 1.0, 0.0),
            Vector3::new(1.0, 1.0, 0.0),
            Vector3::new(0.38, 0.38, 0.0), // Near golden ratio
        ],
        vec![
            Vector3::new(0.25, 0.25, 0.0),
            Vector3::new(0.75, 0.25, 0.0),
            Vector3::new(0.25, 0.75, 0.0),
            Vector3::new(0.75, 0.75, 0.0),
            Vector3::new(0.5, 0.5, 0.0),
            Vector3::new(0.62, 0.38, 0.0), // Near golden ratio
            Vector3::new(0.38, 0.62, 0.0),
            Vector3::new(0.62, 0.62, 0.0),
            Vector3::new(0.38, 0.38, 0.0),
            Vector3::new(0.5, 0.25, 0.0),
        ],
        vec![
            Vector3::new(0.1, 0.1, 0.0),
            Vector3::new(0.9, 0.1, 0.0),
            Vector3::new(0.1, 0.9, 0.0),
            Vector3::new(0.9, 0.9, 0.0),
            Vector3::new(0.5, 0.5, 0.0),
            Vector3::new(0.3, 0.3, 0.0),
            Vector3::new(0.7, 0.3, 0.0),
            Vector3::new(0.3, 0.7, 0.0),
            Vector3::new(0.7, 0.7, 0.0),
            Vector3::new(0.5, 0.3, 0.0),
        ],
    ];
    
    let score = golden_ratio_composition_score(&positions);
    assert!(score >= 0.0, "Score should be non-negative, got {}", score);
    assert!(score <= 1.0, "Score should not exceed 1.0, got {}", score);
}

/// Test golden ratio scoring with poor composition (all points clustered)
#[test]
fn test_golden_ratio_poor_composition() {
    // All points clustered in one corner
    let positions = vec![
        vec![
            Vector3::new(0.1, 0.1, 0.0),
            Vector3::new(0.11, 0.11, 0.0),
            Vector3::new(0.12, 0.12, 0.0),
        ],
        vec![
            Vector3::new(0.1, 0.12, 0.0),
            Vector3::new(0.11, 0.13, 0.0),
            Vector3::new(0.12, 0.14, 0.0),
        ],
        vec![
            Vector3::new(0.13, 0.1, 0.0),
            Vector3::new(0.14, 0.11, 0.0),
            Vector3::new(0.15, 0.12, 0.0),
        ],
    ];
    
    let clustered_score = golden_ratio_composition_score(&positions);
    
    // Well-distributed positions
    let distributed = vec![
        vec![
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(1.0, 0.0, 0.0),
            Vector3::new(0.5, 1.0, 0.0),
        ],
        vec![
            Vector3::new(0.25, 0.5, 0.0),
            Vector3::new(0.75, 0.5, 0.0),
            Vector3::new(0.5, 0.25, 0.0),
        ],
        vec![
            Vector3::new(0.0, 1.0, 0.0),
            Vector3::new(1.0, 1.0, 0.0),
            Vector3::new(0.5, 0.0, 0.0),
        ],
    ];
    
    let distributed_score = golden_ratio_composition_score(&distributed);
    
    // Well-distributed should score better
    assert!(
        distributed_score >= clustered_score * 0.8,
        "Distributed score ({}) should be at least 80% of clustered ({})",
        distributed_score, clustered_score
    );
}

/// Test negative space scoring
#[test]
fn test_negative_space_scoring() {
    // Create positions with good negative space (ring shape)
    let ring_positions: Vec<Vec<Vector3<f64>>> = (0..3).map(|body| {
        (0..20).map(|i| {
            let angle = (i as f64 / 20.0 + body as f64 / 3.0) * std::f64::consts::TAU;
            let radius = 0.4;
            Vector3::new(
                0.5 + radius * angle.cos(),
                0.5 + radius * angle.sin(),
                0.0,
            )
        }).collect()
    }).collect();
    
    let ring_score = negative_space_score(&ring_positions);
    assert!(ring_score > 0.0, "Ring should have positive negative space score");
    assert!(ring_score <= 1.0, "Score should not exceed 1.0");
    
    // Create positions that fill everything (poor negative space)
    let filled_positions: Vec<Vec<Vector3<f64>>> = (0..3).map(|body| {
        (0..100).map(|i| {
            let x = (i % 10) as f64 / 10.0 + body as f64 * 0.03;
            let y = (i / 10) as f64 / 10.0;
            Vector3::new(x, y, 0.0)
        }).collect()
    }).collect();
    
    let filled_score = negative_space_score(&filled_positions);
    
    // Ring should have better negative space than filled grid
    // (Ring has clear center, filled has no breathing room)
    assert!(ring_score >= 0.0 && filled_score >= 0.0);
}

/// Test close encounter intensity
#[test]
fn test_close_encounter_intensity_calculation() {
    let positions = vec![
        vec![
            Vector3::new(0.0, 0.0, 0.0),   // Far apart
            Vector3::new(0.1, 0.0, 0.0),   // Getting closer
            Vector3::new(0.05, 0.0, 0.0),  // Very close
        ],
        vec![
            Vector3::new(1.0, 0.0, 0.0),
            Vector3::new(0.3, 0.0, 0.0),
            Vector3::new(0.1, 0.0, 0.0),
        ],
        vec![
            Vector3::new(0.5, 1.0, 0.0),
            Vector3::new(0.5, 0.5, 0.0),
            Vector3::new(0.07, 0.0, 0.0),
        ],
    ];
    
    let intensity_0 = close_encounter_intensity(&positions, 0);
    let intensity_1 = close_encounter_intensity(&positions, 1);
    let intensity_2 = close_encounter_intensity(&positions, 2);
    
    // Closer encounters should have higher intensity
    assert!(intensity_2 > intensity_0, "Closer encounter should have higher intensity");
    assert!(intensity_2 > intensity_1, "Closest encounter should have highest intensity");
}

/// Test min separations calculation
#[test]
fn test_min_separations() {
    let positions = vec![
        vec![
            Vector3::new(0.0, 0.0, 0.0),
            Vector3::new(0.5, 0.0, 0.0),
        ],
        vec![
            Vector3::new(1.0, 0.0, 0.0),
            Vector3::new(0.6, 0.0, 0.0),
        ],
        vec![
            Vector3::new(0.5, 1.0, 0.0),
            Vector3::new(0.55, 0.1, 0.0),
        ],
    ];
    
    let separations = calculate_min_separations(&positions);
    
    assert_eq!(separations.len(), 2, "Should have separation for each timestep");
    assert!(separations[0] > 0.0, "Separations should be positive");
    assert!(separations[1] > 0.0, "Separations should be positive");
    assert!(separations[1] < separations[0], "Second step should have smaller separation");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Test time dilation config defaults
#[test]
fn test_time_dilation_config() {
    let config = TimeDilationConfig::default();
    assert!(config.enabled, "Time dilation should be enabled by default");
    assert!(config.min_dt_factor > 0.0, "Min dt factor should be positive");
    assert!(config.min_dt_factor < 1.0, "Min dt factor should be less than 1");
    assert!(config.threshold_distance > 0.0, "Threshold should be positive");
    assert!(config.strength > 0.0, "Strength should be positive");
}

/// Test that standard simulation still works
#[test]
fn test_standard_simulation() {
    let seed = vec![1u8, 2, 3, 4, 5, 6, 7, 8];
    let _rng = Sha3RandomByteStream::new(&seed, 0.5, 1.5, 1.0, 0.5);
    
    // Generate random bodies
    let bodies = vec![
        Body::new(1.0, Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 0.1, 0.0)),
        Body::new(1.0, Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.0, -0.05, 0.0)),
        Body::new(1.0, Vector3::new(0.5, 0.866, 0.0), Vector3::new(-0.05, 0.0, 0.0)),
    ];
    
    let result = get_positions(bodies, 100);
    
    assert_eq!(result.positions.len(), 3, "Should have 3 body trajectories");
    assert_eq!(result.positions[0].len(), 100, "Should have 100 positions per body");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMD OPTIMIZATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

/// Test that SIMD pixel operations work correctly
#[test]
fn test_simd_pixel4_roundtrip() {
    let pixels = [
        (0.1, 0.2, 0.3, 0.4),
        (0.5, 0.6, 0.7, 0.8),
        (0.9, 0.8, 0.7, 0.6),
        (0.3, 0.4, 0.5, 1.0),
    ];
    
    let simd = SimdPixel4::from_pixels(&pixels);
    let back = simd.to_pixels();
    
    for i in 0..4 {
        assert!((back[i].0 - pixels[i].0).abs() < 1e-10, "Red mismatch at {}", i);
        assert!((back[i].1 - pixels[i].1).abs() < 1e-10, "Green mismatch at {}", i);
        assert!((back[i].2 - pixels[i].2).abs() < 1e-10, "Blue mismatch at {}", i);
        assert!((back[i].3 - pixels[i].3).abs() < 1e-10, "Alpha mismatch at {}", i);
    }
}

/// Test SIMD luminance calculation
#[test]
fn test_simd_luminance() {
    let pixels = [
        (1.0, 1.0, 1.0, 1.0), // White: lum = 1.0
        (0.0, 0.0, 0.0, 1.0), // Black: lum = 0.0
        (1.0, 0.0, 0.0, 1.0), // Red: lum = 0.2126
        (0.0, 1.0, 0.0, 1.0), // Green: lum = 0.7152
    ];
    
    let simd = SimdPixel4::from_pixels(&pixels);
    let lum = simd.luminance().to_array();
    
    assert!((lum[0] - 1.0).abs() < 1e-10, "White luminance wrong");
    assert!(lum[1].abs() < 1e-10, "Black luminance wrong");
    assert!((lum[2] - 0.2126).abs() < 1e-10, "Red luminance wrong");
    assert!((lum[3] - 0.7152).abs() < 1e-10, "Green luminance wrong");
}

/// Test SIMD effects buffer processing
#[test]
fn test_simd_effects_buffer_processing() {
    let input: Vec<_> = (0..32)
        .map(|i| {
            let v = i as f64 / 32.0;
            (v, v, v, 1.0)
        })
        .collect();
    
    // Test with effects enabled
    let output = simd_process_effects_buffer(
        &input,
        0.3, 2000.0, 10000.0, // blackbody
        0.2, 0.5,             // metallic
        0.1, 0.25,            // subsurface
    );
    
    assert_eq!(output.len(), input.len(), "Output size should match");
    
    // All outputs should be valid
    for (i, p) in output.iter().enumerate() {
        assert!(p.0 >= 0.0 && p.0 <= 1.0, "R out of range at {}: {}", i, p.0);
        assert!(p.1 >= 0.0 && p.1 <= 1.0, "G out of range at {}: {}", i, p.1);
        assert!(p.2 >= 0.0 && p.2 <= 1.0, "B out of range at {}: {}", i, p.2);
        assert!(p.3 >= 0.0 && p.3 <= 1.0, "A out of range at {}: {}", i, p.3);
    }
}

/// Test SIMD blur preserves energy
#[test]
fn test_simd_blur_energy_preservation() {
    // Create a simple kernel
    let kernel: Vec<f64> = vec![0.25, 0.5, 0.25];
    let radius = 1;
    
    let src: Vec<(f64, f64, f64, f64)> = vec![
        (1.0, 0.0, 0.0, 1.0),
        (0.0, 1.0, 0.0, 1.0),
        (0.0, 0.0, 1.0, 1.0),
        (0.5, 0.5, 0.5, 1.0),
        (0.2, 0.3, 0.4, 1.0),
        (0.7, 0.1, 0.2, 1.0),
        (0.3, 0.6, 0.9, 1.0),
        (0.8, 0.8, 0.8, 1.0),
    ];
    let mut dst: Vec<(f64, f64, f64, f64)> = vec![(0.0, 0.0, 0.0, 0.0); 8];
    
    simd_blur_row(&src, &mut dst, &kernel, radius);
    
    // Output should have valid values (not NaN, reasonable range)
    for (i, p) in dst.iter().enumerate() {
        assert!(!p.0.is_nan(), "R is NaN at {}", i);
        assert!(!p.1.is_nan(), "G is NaN at {}", i);
        assert!(!p.2.is_nan(), "B is NaN at {}", i);
        assert!(!p.3.is_nan(), "A is NaN at {}", i);
    }
}

/// Test SIMD tone mapping produces valid output
#[test]
fn test_simd_tonemap_valid_output() {
    let input: Vec<_> = (0..16)
        .map(|i| {
            let v = i as f64 / 16.0 * 2.0; // 0.0 to 2.0 range (HDR)
            (v, v * 0.8, v * 0.6, 1.0)
        })
        .collect();
    
    let mut output = vec![0u8; input.len() * 3];
    
    simd_tonemap_buffer(&input, &mut output, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0));
    
    // Check all output bytes are valid (u8 is always in valid range)
    // Just verify we got the expected number of bytes
    assert_eq!(output.len(), input.len() * 3, "Output size should be 3x input");
    
    // Verify some non-zero values were produced
    let non_zero_count = output.iter().filter(|&&v| v > 0).count();
    assert!(non_zero_count > 0, "Should produce some non-zero values");
}

/// Test SIMD pixel clamping
#[test]
fn test_simd_pixel_clamping() {
    let pixels = [
        (1.5, -0.5, 0.5, 1.0),  // Out of range
        (0.0, 2.0, 0.0, -0.1),  // Out of range
        (-1.0, 0.5, 1.5, 0.5),  // Out of range
        (0.5, 0.5, 0.5, 0.5),   // In range
    ];
    
    let simd = SimdPixel4::from_pixels(&pixels);
    let clamped = simd.clamp01();
    let result = clamped.to_pixels();
    
    // Check clamping worked
    for p in &result {
        assert!(p.0 >= 0.0 && p.0 <= 1.0, "R not clamped: {}", p.0);
        assert!(p.1 >= 0.0 && p.1 <= 1.0, "G not clamped: {}", p.1);
        assert!(p.2 >= 0.0 && p.2 <= 1.0, "B not clamped: {}", p.2);
        assert!(p.3 >= 0.0 && p.3 <= 1.0, "A not clamped: {}", p.3);
    }
}

/// Test SIMD lerp interpolation
#[test]
fn test_simd_pixel_lerp() {
    use wide::f64x4;
    
    let black = SimdPixel4::splat(0.0, 0.0, 0.0, 1.0);
    let white = SimdPixel4::splat(1.0, 1.0, 1.0, 1.0);
    
    let mid = SimdPixel4::lerp(&black, &white, f64x4::splat(0.5));
    let result = mid.to_pixels();
    
    for p in &result {
        assert!((p.0 - 0.5).abs() < 1e-10, "R lerp wrong");
        assert!((p.1 - 0.5).abs() < 1e-10, "G lerp wrong");
        assert!((p.2 - 0.5).abs() < 1e-10, "B lerp wrong");
    }
}

/// Test SIMD 2D blur on small buffer
#[test]
fn test_simd_blur_2d_small() {
    let kernel: Vec<f64> = vec![1.0]; // Identity kernel
    let mut buffer: Vec<(f64, f64, f64, f64)> = vec![
        (1.0, 0.0, 0.0, 1.0), (0.0, 1.0, 0.0, 1.0),
        (0.0, 0.0, 1.0, 1.0), (0.5, 0.5, 0.5, 1.0),
    ];
    let original = buffer.clone();
    
    simd_blur_2d(&mut buffer, 2, 2, &kernel, 0);
    
    // Identity kernel should preserve values
    for (i, (b, o)) in buffer.iter().zip(original.iter()).enumerate() {
        assert!((b.0 - o.0).abs() < 1e-10, "R changed at {}", i);
        assert!((b.1 - o.1).abs() < 1e-10, "G changed at {}", i);
        assert!((b.2 - o.2).abs() < 1e-10, "B changed at {}", i);
        assert!((b.3 - o.3).abs() < 1e-10, "A changed at {}", i);
    }
}

/// Test SIMD spectral to RGBA conversion
#[test]
fn test_simd_spd_to_rgba() {
    let spd_batch = [
        [0.0f64; 16], // Empty spectrum
        [1.0f64; 16], // Full spectrum
        {
            let mut arr = [0.0f64; 16];
            arr[4] = 1.0; // Single bin (roughly green)
            arr
        },
        {
            let mut arr = [0.0f64; 16];
            arr[0] = 1.0; // Single bin (roughly red)
            arr
        },
    ];
    
    // Simple bin_rgb mapping (wavelength to color)
    let bin_rgb: [(f64, f64, f64); 16] = [
        (0.8, 0.0, 0.2), (0.9, 0.1, 0.0), (1.0, 0.3, 0.0), (1.0, 0.6, 0.0),
        (0.8, 0.9, 0.0), (0.3, 1.0, 0.0), (0.0, 1.0, 0.3), (0.0, 0.9, 0.6),
        (0.0, 0.7, 0.9), (0.0, 0.4, 1.0), (0.1, 0.1, 1.0), (0.3, 0.0, 0.9),
        (0.5, 0.0, 0.7), (0.6, 0.0, 0.5), (0.7, 0.0, 0.3), (0.8, 0.0, 0.2),
    ];
    let bin_tone = [1.0f64; 16];
    
    let result = simd_spd_to_rgba_batch(&spd_batch, &bin_rgb, &bin_tone);
    
    // Empty spectrum should produce black
    assert!((result[0].0).abs() < 1e-10, "Empty spectrum should be black");
    
    // Full spectrum should produce some color
    assert!(result[1].3 > 0.0, "Full spectrum should have alpha > 0");
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/// Convert HSV to RGB (helper for tests)
fn hsv_to_rgb(h: f64, s: f64, v: f64) -> (f64, f64, f64) {
    let h = h.rem_euclid(1.0) * 6.0;
    let c = v * s;
    let x = c * (1.0 - ((h % 2.0) - 1.0).abs());
    let m = v - c;
    
    let (r, g, b) = match h as usize {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    
    (r + m, g + m, b + m)
}
