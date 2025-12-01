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
    presets::Preset,
    render::{
        color::generate_body_color_sequences,
        context::RenderContext,
        effects::{DogBloomConfig, EffectChainBuilder, EffectConfig, FrameParams},
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

    let params = FrameParams { _frame_number: 0, _density: None };

    let result = chain.process_frame(buffer, width, height, &params);
    assert!(result.is_ok(), "Effect chain should succeed: {:?}", result.err());

    let output = result.unwrap();
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

    let params = FrameParams { _frame_number: 0, _density: None };
    let result = chain.process_frame(buffer, width, height, &params);

    assert!(result.is_ok(), "Builder-configured chain should succeed");
}

#[test]
fn test_effect_chain_disabled_effects() {
    let config = EffectConfig::builder().disable_all_effects().build();

    let chain = EffectChainBuilder::new(config);

    let width = 16;
    let height = 16;
    let input = vec![(0.5, 0.5, 0.5, 1.0); width * height];

    let params = FrameParams { _frame_number: 0, _density: None };
    let result = chain.process_frame(input.clone(), width, height, &params);

    assert!(result.is_ok());
    // With no effects, output should be reasonably close to input
    // Note: Some minimal processing may occur even with effects disabled (exposure, tonemapping)
    let output = result.unwrap();
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

    let params = FrameParams { _frame_number: 0, _density: None };
    let result = chain.process_frame(buffer, width, height, &params);

    assert!(result.is_ok(), "Should handle black buffer");
}

#[test]
fn test_effect_chain_handles_bright_buffer() {
    let config = EffectConfig::default();
    let chain = EffectChainBuilder::new(config);

    // Very bright HDR buffer
    let width = 32;
    let height = 32;
    let buffer = vec![(5.0, 5.0, 5.0, 1.0); width * height];

    let params = FrameParams { _frame_number: 0, _density: None };
    let result = chain.process_frame(buffer, width, height, &params);

    assert!(result.is_ok(), "Should handle bright buffer");

    let output = result.unwrap();
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
