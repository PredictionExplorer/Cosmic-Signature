//! Visual regression tests using snapshot testing
//!
//! These tests ensure that rendering output remains consistent across code changes.
//! Any deviation from the expected output will fail the test and show a diff.
//!
//! Run with: `cargo test --test snapshot_tests`
//! Update snapshots: `cargo insta test --test snapshot_tests --review`

use insta::assert_yaml_snapshot;
use nalgebra::Vector3;
use three_body_problem::{
    presets::Preset,
    render::{
        ChannelLevels, RenderConfig, RenderParams, SceneDataRef,
        color::generate_body_color_sequences, compute_black_white_gamma,
        pass_1_build_histogram_spectral, randomizable_config::RandomizableEffectConfig,
        render_single_frame_spectral,
    },
    sim::{Body, Sha3RandomByteStream, get_positions},
};

// Type aliases to simplify complex return types
type Positions = Vec<Vec<Vector3<f64>>>;
type Colors = Vec<Vec<(f64, f64, f64)>>;
type Alphas = Vec<f64>;

/// Helper to create a deterministic test scene
#[allow(clippy::type_complexity)] // Return type is clear in context
fn create_test_scene(seed: &[u8]) -> (Positions, Colors, Alphas) {
    let mut rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 100.0, 3.0);

    // Create three bodies with deterministic initial conditions
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

    // Run short simulation
    let sim = get_positions(bodies, 1000);
    let positions = sim.positions;

    // Generate colors
    let (colors, alphas) = generate_body_color_sequences(&mut rng, 1000, 0.001);

    (positions, colors, alphas)
}

/// Extract a small sample of pixel values for snapshot comparison
///
/// We can't snapshot the entire image (too large), so we sample key regions
/// and compute statistics.
fn extract_image_signature(img: &image::ImageBuffer<image::Rgb<u16>, Vec<u16>>) -> ImageSignature {
    let (width, height) = img.dimensions();
    let pixel_count = (width * height) as usize;

    // Sample pixels at strategic locations
    let center = img.get_pixel(width / 2, height / 2);
    let top_left = img.get_pixel(width / 4, height / 4);
    let top_right = img.get_pixel(3 * width / 4, height / 4);
    let bottom_left = img.get_pixel(width / 4, 3 * height / 4);
    let bottom_right = img.get_pixel(3 * width / 4, 3 * height / 4);

    // Compute overall statistics
    let mut total_r = 0u64;
    let mut total_g = 0u64;
    let mut total_b = 0u64;
    let mut non_black = 0usize;

    for pixel in img.pixels() {
        total_r += pixel[0] as u64;
        total_g += pixel[1] as u64;
        total_b += pixel[2] as u64;
        if pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0 {
            non_black += 1;
        }
    }

    ImageSignature {
        width,
        height,
        center: [center[0], center[1], center[2]],
        top_left: [top_left[0], top_left[1], top_left[2]],
        top_right: [top_right[0], top_right[1], top_right[2]],
        bottom_left: [bottom_left[0], bottom_left[1], bottom_left[2]],
        bottom_right: [bottom_right[0], bottom_right[1], bottom_right[2]],
        avg_r: (total_r / pixel_count as u64) as u16,
        avg_g: (total_g / pixel_count as u64) as u16,
        avg_b: (total_b / pixel_count as u64) as u16,
        non_black_pixels: non_black,
    }
}

#[derive(Debug, serde::Serialize)]
struct ImageSignature {
    width: u32,
    height: u32,
    center: [u16; 3],
    top_left: [u16; 3],
    top_right: [u16; 3],
    bottom_left: [u16; 3],
    bottom_right: [u16; 3],
    avg_r: u16,
    avg_g: u16,
    avg_b: u16,
    non_black_pixels: usize,
}

#[test]
fn snapshot_render_default_preset() {
    let seed = b"snapshot_default_v1";
    let (positions, colors, alphas) = create_test_scene(seed);

    let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    let (resolved_config, _log) =
        RandomizableEffectConfig::default().resolve(&mut rng, 640, 480, false, 42);

    // Build histogram (simplified - use mock levels for test speed)
    let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

    let scene = SceneDataRef::new(&positions, &colors, &alphas);
    let render_config = RenderConfig::default();
    let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);

    let img = render_single_frame_spectral(&params, &levels).expect("Render should succeed");

    let signature = extract_image_signature(&img);
    assert_yaml_snapshot!("default_preset", signature);
}

#[test]
fn snapshot_render_gallery_preset() {
    let seed = b"snapshot_gallery_v1";
    let (positions, colors, alphas) = create_test_scene(seed);

    let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    let mut config = RandomizableEffectConfig::default();
    Preset::Gallery.apply(&mut config);
    let (resolved_config, _log) = config.resolve(&mut rng, 640, 480, false, 42);

    let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

    let scene = SceneDataRef::new(&positions, &colors, &alphas);
    let render_config = RenderConfig::default();
    let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);

    let img = render_single_frame_spectral(&params, &levels).expect("Render should succeed");

    let signature = extract_image_signature(&img);
    assert_yaml_snapshot!("gallery_preset", signature);
}

#[test]
fn snapshot_render_minimal_preset() {
    let seed = b"snapshot_minimal_v1";
    let (positions, colors, alphas) = create_test_scene(seed);

    let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    let mut config = RandomizableEffectConfig::default();
    Preset::Minimal.apply(&mut config);
    let (resolved_config, _log) = config.resolve(&mut rng, 640, 480, false, 42);

    let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

    let scene = SceneDataRef::new(&positions, &colors, &alphas);
    let render_config = RenderConfig::default();
    let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);

    let img = render_single_frame_spectral(&params, &levels).expect("Render should succeed");

    let signature = extract_image_signature(&img);
    assert_yaml_snapshot!("minimal_preset", signature);
}

#[test]
fn snapshot_render_special_mode() {
    let seed = b"snapshot_special_v1";
    let (positions, colors, alphas) = create_test_scene(seed);

    let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    let (resolved_config, _log) =
        RandomizableEffectConfig::default().resolve(&mut rng, 640, 480, true, 42);

    let levels = ChannelLevels::new(0.0, 1.0, 0.0, 1.0, 0.0, 1.0);

    let scene = SceneDataRef::new(&positions, &colors, &alphas);
    let render_config = RenderConfig::default();
    let params = RenderParams::new(scene, &resolved_config, 1, 0, &render_config);

    let img = render_single_frame_spectral(&params, &levels).expect("Render should succeed");

    let signature = extract_image_signature(&img);
    assert_yaml_snapshot!("special_mode", signature);
}

#[test]
fn snapshot_histogram_computation() {
    let seed = b"snapshot_histogram_v1";
    let (positions, colors, alphas) = create_test_scene(seed);

    let mut rng = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    let (resolved_config, _log) =
        RandomizableEffectConfig::default().resolve(&mut rng, 320, 240, false, 42);

    let scene = SceneDataRef::new(&positions, &colors, &alphas);
    let render_config = RenderConfig::default();
    let params = RenderParams::new(scene, &resolved_config, 100, 0, &render_config);

    let mut all_r = Vec::new();
    let mut all_g = Vec::new();
    let mut all_b = Vec::new();

    pass_1_build_histogram_spectral(&params, &mut all_r, &mut all_g, &mut all_b)
        .expect("Histogram should succeed");

    let (black_r, white_r, black_g, white_g, black_b, white_b) =
        compute_black_white_gamma(&mut all_r, &mut all_g, &mut all_b, 0.002, 0.998);

    #[derive(Debug, serde::Serialize)]
    struct HistogramLevels {
        black_r: String,
        white_r: String,
        black_g: String,
        white_g: String,
        black_b: String,
        white_b: String,
        num_samples: usize,
    }

    let levels = HistogramLevels {
        black_r: format!("{:.6e}", black_r),
        white_r: format!("{:.6e}", white_r),
        black_g: format!("{:.6e}", black_g),
        white_g: format!("{:.6e}", white_g),
        black_b: format!("{:.6e}", black_b),
        white_b: format!("{:.6e}", white_b),
        num_samples: all_r.len(),
    };

    assert_yaml_snapshot!("histogram_levels", levels);
}

#[test]
fn snapshot_determinism_verification() {
    // Verify that same seed produces identical results
    let seed = b"determinism_snapshot_v1";

    let (pos1, col1, alp1) = create_test_scene(seed);
    let (pos2, col2, alp2) = create_test_scene(seed);

    // Check a sample of positions
    for body_idx in 0..3 {
        for step_idx in [0, 100, 500, 999].iter() {
            assert_eq!(
                pos1[body_idx][*step_idx], pos2[body_idx][*step_idx],
                "Positions should be identical at body {} step {}",
                body_idx, step_idx
            );
        }
    }

    // Check colors
    for body_idx in 0..3 {
        assert_eq!(
            col1[body_idx][0], col2[body_idx][0],
            "Colors should be identical for body {}",
            body_idx
        );
    }

    // Check alphas
    assert_eq!(alp1, alp2, "Alphas should be identical");

    // Determinism verified - test passes by not panicking
}
