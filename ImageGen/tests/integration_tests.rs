//! Integration tests for the Three Body Problem renderer
//!
//! These tests verify end-to-end functionality of the rendering pipeline.
//!
//! # Test Categories
//!
//! - **Simulation Tests**: Verify physics simulation produces valid data
//! - **Render Context Tests**: Verify coordinate transformations
//! - **Color Tests**: Verify color generation and manipulation
//! - **Effect Chain Tests**: Verify effect pipeline processes buffers correctly
//! - **Full Pipeline Tests**: End-to-end rendering validation

use nalgebra::Vector3;
use three_body_problem::{
    post_effects::FrameParams,
    presets::Preset,
    render::{
        color::generate_body_color_sequences,
        context::RenderContext,
        effects::{DogBloomConfig, EffectChainBuilder, EffectConfig},
        types::{BlurConfig, ChannelLevels, Resolution},
    },
    sim::{Body, Sha3RandomByteStream, get_positions},
};

#[test]
fn test_end_to_end_simulation() {
    // Create a simple three-body system
    let seed = [0x42u8; 32];
    let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);

    let bodies = vec![
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), rng.random_location()),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), rng.random_velocity()),
        ),
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), rng.random_location()),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), rng.random_velocity()),
        ),
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), rng.random_location()),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), rng.random_velocity()),
        ),
    ];

    // Run simulation
    let result = get_positions(bodies, 1000);

    // Verify we got positions
    assert_eq!(result.positions.len(), 3, "Should have 3 bodies");
    assert_eq!(result.positions[0].len(), 1000, "Should have 1000 steps");

    // Verify positions are reasonable (not NaN or infinite)
    for body_positions in &result.positions {
        for pos in body_positions {
            assert!(pos[0].is_finite(), "Position X should be finite");
            assert!(pos[1].is_finite(), "Position Y should be finite");
            assert!(pos[2].is_finite(), "Position Z should be finite");
        }
    }
}

#[test]
fn test_render_context_creation() {
    // Create sample positions
    let positions = vec![
        vec![Vector3::new(0.0, 0.0, 0.0), Vector3::new(10.0, 0.0, 0.0)],
        vec![Vector3::new(0.0, 10.0, 0.0), Vector3::new(10.0, 10.0, 0.0)],
        vec![Vector3::new(5.0, 5.0, 0.0), Vector3::new(5.0, 5.0, 0.0)],
    ];

    let ctx = RenderContext::new(1920, 1080, &positions);

    assert_eq!(ctx.width, 1920);
    assert_eq!(ctx.height, 1080);
    assert_eq!(ctx.pixel_count(), 1920 * 1080);

    // Verify coordinate transformation works
    let bbox = ctx.bounds();
    assert!(bbox.min_x < 10.0);
    assert!(bbox.max_x > 0.0);
}

#[test]
fn test_color_generation() {
    let seed = [0x42u8; 32];
    let rng = &mut Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);

    let (colors, alphas) = generate_body_color_sequences(rng, 1000, 0.001);

    // Should have 3 bodies
    assert_eq!(colors.len(), 3);
    assert_eq!(alphas.len(), 3);

    // Each body should have 1000 color samples
    for body_colors in &colors {
        assert_eq!(body_colors.len(), 1000);

        // All colors should be valid OkLab
        for (l, _a, _b) in body_colors {
            assert!(*l >= 0.0 && *l <= 1.0, "Lightness should be in [0, 1]");
        }
    }

    // Alphas should be positive
    for &alpha in &alphas {
        assert!(alpha > 0.0, "Alpha should be positive");
    }
}

#[test]
fn test_blur_config_scaling() {
    let res_hd = Resolution::new(1920, 1080);
    let res_4k = Resolution::new(3840, 2160);

    let blur_hd = BlurConfig::standard(res_hd);
    let blur_4k = BlurConfig::standard(res_4k);

    // 4K should have larger blur radius (scales with resolution)
    assert!(blur_4k.radius_px > blur_hd.radius_px);

    // Blur strength should be the same (not resolution dependent)
    assert_eq!(blur_4k.strength, blur_hd.strength);
}

#[test]
fn test_channel_levels_normalization() {
    let levels = ChannelLevels::new(0.1, 0.9, 0.2, 0.8, 0.0, 1.0);

    // Ranges should be properly calculated
    assert!((levels.range(0) - 0.8).abs() < 1e-10);
    assert!((levels.range(1) - 0.6).abs() < 1e-10);
    assert!((levels.range(2) - 1.0).abs() < 1e-10);

    // Black points should match input
    assert_eq!(levels.black_point(0), 0.1);
    assert_eq!(levels.black_point(1), 0.2);
    assert_eq!(levels.black_point(2), 0.0);
}

#[test]
fn test_position_data_integrity() {
    // Verify that simulation preserves data integrity
    let seed = [0x01u8; 32];
    let _rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);

    let bodies = vec![
        Body::new(200.0, Vector3::new(100.0, 0.0, 0.0), Vector3::new(0.0, 0.5, 0.0)),
        Body::new(200.0, Vector3::new(-100.0, 0.0, 0.0), Vector3::new(0.0, -0.5, 0.0)),
        Body::new(200.0, Vector3::new(0.0, 100.0, 0.0), Vector3::new(-0.5, 0.0, 0.0)),
    ];

    let result = get_positions(bodies, 100);

    // Verify all positions are valid numbers
    for body_pos in &result.positions {
        for pos in body_pos {
            assert!(!pos[0].is_nan(), "Position should not be NaN");
            assert!(!pos[1].is_nan(), "Position should not be NaN");
            assert!(!pos[2].is_nan(), "Position should not be NaN");
            assert!(pos[0].is_finite(), "Position should be finite");
            assert!(pos[1].is_finite(), "Position should be finite");
            assert!(pos[2].is_finite(), "Position should be finite");
        }
    }
}

// ============================================================================
// Effect Chain Integration Tests
// ============================================================================

#[test]
fn test_effect_chain_default_processes_buffer() {
    let config = EffectConfig::default();
    let chain = EffectChainBuilder::new(config);

    // Create test buffer with mid-gray values
    let width = 32;
    let height = 32;
    let buffer = vec![(0.5, 0.5, 0.5, 1.0); width * height];

    let params = FrameParams { frame_number: 0, _density: None, body_positions: None };

    let traj_result = chain.process_trajectories(buffer, width, height, &params);
    assert!(traj_result.is_ok(), "Trajectory chain should succeed");
    
    let finishing_result = chain.process_finishing(traj_result.unwrap(), width, height, &params);
    assert!(finishing_result.is_ok(), "Finishing chain should succeed: {:?}", finishing_result.err());

    let output = finishing_result.unwrap();
    assert_eq!(output.len(), width * height, "Output size should match input");

    // Verify output has valid values
    for (i, (r, g, b, a)) in output.iter().enumerate() {
        assert!(r.is_finite() && *r >= 0.0, "R invalid at {}: {}", i, r);
        assert!(g.is_finite() && *g >= 0.0, "G invalid at {}: {}", i, g);
        assert!(b.is_finite() && *b >= 0.0, "B invalid at {}: {}", i, b);
        assert!(a.is_finite() && *a >= 0.0 && *a <= 1.0, "Alpha invalid at {}: {}", i, a);
    }
}

#[test]
fn test_effect_chain_with_builder() {
    let config = EffectConfig::builder()
        .with_dog_bloom(DogBloomConfig::default())
        .enable_chromatic_bloom(true)
        .enable_color_grade(true)
        .build();

    let chain = EffectChainBuilder::new(config);

    let width = 16;
    let height = 16;
    let buffer = vec![(0.8, 0.7, 0.6, 1.0); width * height];

    let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
    let traj_result = chain.process_trajectories(buffer, width, height, &params);
    let finishing_result = chain.process_finishing(traj_result.unwrap(), width, height, &params);

    assert!(finishing_result.is_ok(), "Builder-configured chain should succeed");
}

#[test]
fn test_effect_chain_disabled_effects() {
    let config = EffectConfig::builder().disable_all_effects().build();

    let chain = EffectChainBuilder::new(config);

    let width = 16;
    let height = 16;
    let input = vec![(0.5, 0.5, 0.5, 1.0); width * height];

    let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
    let traj_result = chain.process_trajectories(input.clone(), width, height, &params);
    let finishing_result = chain.process_finishing(traj_result.unwrap(), width, height, &params);

    assert!(finishing_result.is_ok());
    // With no effects, output should be reasonably close to input
    let output = finishing_result.unwrap();
    let total_diff: f64 =
        input.iter().zip(output.iter()).map(|(inp, out)| (inp.0 - out.0).abs()).sum();
    let avg_diff = total_diff / input.len() as f64;
    assert!(avg_diff < 0.5, "Average difference should be small: got {}", avg_diff);
}

#[test]
fn test_effect_chain_handles_black_buffer() {
    let config = EffectConfig::default();
    let chain = EffectChainBuilder::new(config);

    // All-black buffer (edge case)
    let width = 32;
    let height = 32;
    let buffer = vec![(0.0, 0.0, 0.0, 0.0); width * height];

    let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
    let traj_result = chain.process_trajectories(buffer, width, height, &params);
    let finishing_result = chain.process_finishing(traj_result.unwrap(), width, height, &params);

    assert!(finishing_result.is_ok(), "Should handle black buffer");
}

#[test]
fn test_effect_chain_handles_bright_buffer() {
    let config = EffectConfig::default();
    let chain = EffectChainBuilder::new(config);

    // Very bright HDR buffer
    let width = 32;
    let height = 32;
    let buffer = vec![(5.0, 5.0, 5.0, 1.0); width * height];

    let params = FrameParams { frame_number: 0, _density: None, body_positions: None };
    let traj_result = chain.process_trajectories(buffer, width, height, &params);
    let finishing_result = chain.process_finishing(traj_result.unwrap(), width, height, &params);

    assert!(finishing_result.is_ok(), "Should handle bright buffer");

    let output = finishing_result.unwrap();
    for pixel in &output {
        assert!(pixel.0.is_finite(), "Output should be finite");
    }
}

// ============================================================================
// Preset Integration Tests
// ============================================================================

#[test]
fn test_preset_gallery_produces_valid_output() {
    use three_body_problem::render::randomizable_config::RandomizableEffectConfig;

    let mut config = RandomizableEffectConfig::default();
    Preset::Gallery.apply(&mut config);

    assert!(config.gallery_quality, "Gallery preset should enable gallery_quality");
    assert_eq!(config.enable_chromatic_bloom, Some(true));
    assert_eq!(config.enable_aether, Some(false)); // Experimental disabled
}

#[test]
fn test_preset_minimal_disables_most_effects() {
    use three_body_problem::render::randomizable_config::RandomizableEffectConfig;

    let mut config = RandomizableEffectConfig::default();
    Preset::Minimal.apply(&mut config);

    assert_eq!(config.enable_color_grade, Some(false));
    assert_eq!(config.enable_champleve, Some(false));
    assert_eq!(config.enable_aether, Some(false));
    assert_eq!(config.enable_bloom, Some(true)); // Basic visibility kept
}

#[test]
fn test_all_presets_parse_correctly() {
    let preset_names = ["gallery", "preview", "cinematic", "exploratory", "minimal", "web"];

    for name in preset_names {
        let result: Result<Preset, _> = name.parse();
        assert!(result.is_ok(), "Preset '{}' should parse correctly", name);
    }
}

// ============================================================================
// Full Pipeline Integration Tests
// ============================================================================

#[test]
fn test_full_pipeline_minimal_render() {
    // Use deterministic seed for reproducibility
    let seed = vec![0x42u8; 4];
    let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);

    // Minimal simulation parameters
    let num_steps = 100;
    let width = 64;
    let height = 64;

    // Create three bodies
    let bodies = vec![
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), 0.0),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), 0.0),
        ),
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), 0.0),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), 0.0),
        ),
        Body::new(
            rng.random_mass(),
            Vector3::new(rng.random_location(), rng.random_location(), 0.0),
            Vector3::new(rng.random_velocity(), rng.random_velocity(), 0.0),
        ),
    ];

    // Run simulation
    let sim_result = get_positions(bodies, num_steps);
    assert_eq!(sim_result.positions.len(), 3);
    assert_eq!(sim_result.positions[0].len(), num_steps);

    // Generate colors
    let (colors, alphas) = generate_body_color_sequences(&mut rng, num_steps, 0.001);
    assert_eq!(colors.len(), 3);
    assert_eq!(alphas.len(), 3);

    // Create render context
    let ctx = RenderContext::new(width, height, &sim_result.positions);
    assert_eq!(ctx.pixel_count(), (width * height) as usize);

    // Verify bounds are computed
    let bounds = ctx.bounds();
    assert!(bounds.width > 0.0, "Bounds width should be positive");
    assert!(bounds.height > 0.0, "Bounds height should be positive");
}

#[test]
fn test_coordinate_transformation_roundtrip() {
    // Create positions at known locations
    let positions = vec![
        vec![Vector3::new(0.0, 0.0, 0.0)],
        vec![Vector3::new(100.0, 0.0, 0.0)],
        vec![Vector3::new(0.0, 100.0, 0.0)],
    ];

    let ctx = RenderContext::new(1920, 1080, &positions);

    // Verify center is mapped correctly
    let bounds = ctx.bounds();
    let center_x = bounds.min_x + bounds.width / 2.0;
    let center_y = bounds.min_y + bounds.height / 2.0;

    let (px, py) = ctx.to_pixel(center_x, center_y);

    // Center should map to approximately center of image
    assert!((px - 960.0).abs() < 100.0, "Center X should be near middle: {}", px);
    assert!((py - 540.0).abs() < 100.0, "Center Y should be near middle: {}", py);
}

// ============================================================================
// Advanced Curation Integration Tests
// ============================================================================

#[test]
fn test_enhanced_quality_metrics_realistic_scene() {
    use three_body_problem::render::enhanced_quality_metrics::EnhancedQualityMetrics;
    
    // Create a realistic pixel buffer simulating a rendered scene
    // with bright trajectories on a dark background
    let width = 100;
    let height = 100;
    let mut pixels = vec![(0.05, 0.03, 0.08, 1.0); width * height]; // Dark background
    
    // Add some bright "trajectory" pixels in the center
    for y in 30..70 {
        for x in 30..70 {
            let idx = y * width + x;
            let dist_from_center = (((x as f64 - 50.0).powi(2) + (y as f64 - 50.0).powi(2)).sqrt()) / 28.0;
            if dist_from_center < 1.0 {
                let brightness = 0.3 + 0.5 * (1.0 - dist_from_center);
                pixels[idx] = (brightness * 1.1, brightness * 0.9, brightness * 0.7, 1.0);
            }
        }
    }
    
    let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, width, height);
    
    // Should have reasonable scores for a centered subject
    assert!(metrics.quality_score > 0.3, 
        "Centered subject should have reasonable quality: {}", metrics.quality_score);
    assert!(metrics.center_focus > 0.3, 
        "Should detect center focus: {}", metrics.center_focus);
    assert!(metrics.subject_coverage > 0.05, 
        "Should detect subject coverage: {}", metrics.subject_coverage);
}

#[test]
fn test_enhanced_quality_metrics_detects_quality_issues() {
    use three_body_problem::render::enhanced_quality_metrics::EnhancedQualityMetrics;
    
    // Test 1: Too dark image
    let dark_pixels: Vec<(f64, f64, f64, f64)> = vec![(0.02, 0.02, 0.02, 1.0); 10000];
    let dark_metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&dark_pixels, 100, 100);
    assert!(dark_metrics.mean_luminance < 0.05, "Should detect dark image");
    assert!(dark_metrics.quality_score < 0.6, "Dark image should have low score");
    
    // Test 2: Too bright image with clipping
    let bright_pixels: Vec<(f64, f64, f64, f64)> = vec![(0.99, 0.99, 0.99, 1.0); 10000];
    let bright_metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&bright_pixels, 100, 100);
    assert!(bright_metrics.highlight_clip_pct > 50.0, "Should detect clipping");
    
    // Test 3: Flat/boring image
    let flat_pixels: Vec<(f64, f64, f64, f64)> = vec![(0.5, 0.5, 0.5, 1.0); 10000];
    let flat_metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&flat_pixels, 100, 100);
    assert!(flat_metrics.contrast_spread < 0.01, "Should detect flat contrast");
    assert!(flat_metrics.interest_score < 0.6, "Flat image should have low interest");
}

#[test]
fn test_enhanced_quality_metrics_suggests_improvements() {
    use three_body_problem::render::enhanced_quality_metrics::EnhancedQualityMetrics;
    
    // Create a problematic image (too dark with low contrast)
    let mut pixels = Vec::with_capacity(10000);
    for _ in 0..10000 {
        pixels.push((0.05, 0.05, 0.05, 1.0));
    }
    
    let metrics = EnhancedQualityMetrics::from_pixel_buffer_2d(&pixels, 100, 100);
    let adjustments = metrics.suggest_adjustments();
    
    // Should suggest exposure boost for dark images
    assert!(adjustments.iter().any(|a| a.param.contains("exposure") || a.param.contains("darkening")),
        "Should suggest exposure or darkening adjustments for dark image");
}

#[test]
fn test_advanced_curation_settings_presets() {
    use three_body_problem::render::advanced_curation::AdvancedCurationSettings;
    
    let default = AdvancedCurationSettings::default();
    let fast = AdvancedCurationSettings::fast();
    let gallery = AdvancedCurationSettings::gallery();
    
    // Fast mode should be faster (fewer candidates, larger stride)
    assert!(fast.initial_k < default.initial_k, "Fast mode should have fewer candidates");
    assert!(fast.fast_step_stride > default.fast_step_stride, "Fast mode should have larger stride");
    
    // Gallery mode should be more thorough
    assert!(gallery.initial_k >= default.initial_k, "Gallery mode should have at least as many candidates");
    assert!(gallery.hifi_step_stride < default.hifi_step_stride, "Gallery mode should have smaller stride");
    assert!(gallery.max_refinement_iterations >= default.max_refinement_iterations, 
        "Gallery mode should allow more refinement");
}

#[test]
fn test_advanced_curation_determinism() {
    use three_body_problem::render::advanced_curation::{
        advanced_curate_effect_config, AdvancedCurationSettings
    };
    use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
    use three_body_problem::render::types::{RenderConfig, SceneDataRef};
    
    let seed = b"determinism_test_advanced";
    let mut rng1 = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
    let mut rng2 = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);
    
    // Create identical scenes
    let bodies = vec![
        Body::new(150.0, Vector3::new(0.0, 0.0, 0.0), Vector3::new(0.0, 0.5, 0.0)),
        Body::new(160.0, Vector3::new(1.0, 0.0, 0.0), Vector3::new(0.0, -0.4, 0.0)),
        Body::new(170.0, Vector3::new(0.0, 1.0, 0.0), Vector3::new(-0.3, 0.0, 0.0)),
    ];
    let sim = get_positions(bodies, 200);
    let (colors1, alphas1) = generate_body_color_sequences(&mut rng1, 200, 0.01);
    let (colors2, alphas2) = generate_body_color_sequences(&mut rng2, 200, 0.01);
    
    let scene1 = SceneDataRef::new(&sim.positions, &colors1, &alphas1);
    let scene2 = SceneDataRef::new(&sim.positions, &colors2, &alphas2);
    
    let randomizable = RandomizableEffectConfig::default();
    let (resolved1, log1) = randomizable.clone().resolve(&mut rng1, 256, 144, false, 42);
    let (resolved2, log2) = randomizable.clone().resolve(&mut rng2, 256, 144, false, 42);
    
    // Use fast settings for quick test
    let settings = AdvancedCurationSettings::fast();
    
    let curated1 = advanced_curate_effect_config(
        seed, resolved1, log1, &randomizable,
        256, 144, false, true, 42, scene1, &RenderConfig::default(), settings,
    );
    
    let curated2 = advanced_curate_effect_config(
        seed, resolved2, log2, &randomizable,
        256, 144, false, true, 42, scene2, &RenderConfig::default(), settings,
    );
    
    // Results should be identical
    assert!((curated1.summary.final_score - curated2.summary.final_score).abs() < 1e-6,
        "Scores should be deterministic: {} vs {}", 
        curated1.summary.final_score, curated2.summary.final_score);
    assert_eq!(curated1.summary.chosen_initial_index, curated2.summary.chosen_initial_index,
        "Should choose same candidate");
}

#[test]
fn test_quality_assessment_thresholds() {
    use three_body_problem::render::enhanced_quality_metrics::{
        EnhancedQualityMetrics, QualityAssessment, thresholds
    };
    
    let mut metrics = EnhancedQualityMetrics::default();
    
    // Test Excellent threshold
    metrics.quality_score = thresholds::EXCELLENT;
    assert_eq!(metrics.assessment(), QualityAssessment::Excellent);
    assert!(metrics.is_exhibition_ready());
    
    // Test Good threshold
    metrics.quality_score = thresholds::GOOD;
    assert_eq!(metrics.assessment(), QualityAssessment::Good);
    assert!(metrics.passes_museum_quality());
    assert!(!metrics.is_exhibition_ready());
    
    // Test Acceptable threshold
    metrics.quality_score = thresholds::ACCEPTABLE;
    assert_eq!(metrics.assessment(), QualityAssessment::Acceptable);
    assert!(!metrics.passes_museum_quality());
    
    // Test Poor
    metrics.quality_score = 0.3;
    assert_eq!(metrics.assessment(), QualityAssessment::Poor);
}
