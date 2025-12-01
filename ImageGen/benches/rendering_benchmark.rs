//! Performance benchmarks for the Three Body Problem renderer
//!
//! Run with: cargo bench
//!
//! # Benchmark Categories
//!
//! - **Line Drawing**: Core spectral line rendering performance
//! - **Color Conversion**: OKLab and SPD conversion throughput
//! - **Effect Chain**: Post-processing pipeline performance
//! - **Simulation**: Physics simulation throughput
//! - **Utility Functions**: Kernel generation and helper functions

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use nalgebra::Vector3;
use std::hint::black_box;
use three_body_problem::{
    oklab::{linear_srgb_to_oklab, linear_srgb_to_oklab_batch, oklab_to_linear_srgb},
    render::{
        drawing::draw_line_segment_aa_spectral_with_dispersion,
        effects::{EffectChainBuilder, EffectConfig, FrameParams},
    },
    sim::{Body, Sha3RandomByteStream, get_positions},
    spectrum::{NUM_BINS, spd_to_rgba},
    utils::build_gaussian_kernel,
};

// ============================================================================
// Line Drawing Benchmarks
// ============================================================================

fn bench_line_drawing(c: &mut Criterion) {
    let mut group = c.benchmark_group("line_drawing");

    let width = 1920;
    let height = 1080;
    let mut accum = vec![[0.0f64; NUM_BINS]; (width * height) as usize];

    group.bench_function("single_line_spectral", |b| {
        b.iter(|| {
            draw_line_segment_aa_spectral_with_dispersion(
                black_box(&mut accum),
                width,
                height,
                100.0,
                100.0,
                200.0,
                200.0,
                (0.5, 0.1, 0.1),
                (0.5, -0.1, -0.1),
                0.5,
                0.5,
                1.0,
                false,
            )
        })
    });

    // Long line (more pixels to draw)
    group.bench_function("long_line_spectral", |b| {
        b.iter(|| {
            draw_line_segment_aa_spectral_with_dispersion(
                black_box(&mut accum),
                width,
                height,
                100.0,
                100.0,
                1800.0,
                980.0,
                (0.5, 0.1, 0.1),
                (0.5, -0.1, -0.1),
                0.5,
                0.5,
                1.0,
                false,
            )
        })
    });

    // Special mode with dispersion
    group.bench_function("line_with_dispersion", |b| {
        b.iter(|| {
            draw_line_segment_aa_spectral_with_dispersion(
                black_box(&mut accum),
                width,
                height,
                100.0,
                100.0,
                200.0,
                200.0,
                (0.5, 0.1, 0.1),
                (0.5, -0.1, -0.1),
                0.5,
                0.5,
                1.0,
                true, // special mode with dispersion
            )
        })
    });

    group.finish();
}

// ============================================================================
// OKLab Color Conversion Benchmarks
// ============================================================================

fn bench_oklab_conversion(c: &mut Criterion) {
    let mut group = c.benchmark_group("oklab");

    // Single conversion
    group.bench_function("single_rgb_to_oklab", |b| {
        b.iter(|| linear_srgb_to_oklab(black_box(0.5), black_box(0.3), black_box(0.8)))
    });

    group.bench_function("single_oklab_to_rgb", |b| {
        b.iter(|| oklab_to_linear_srgb(black_box(0.7), black_box(0.1), black_box(-0.1)))
    });

    // Batch conversion
    for size in [100, 1000, 10000].iter() {
        let pixels: Vec<_> = (0..*size)
            .map(|i| {
                let t = i as f64 / *size as f64;
                (t, 1.0 - t, 0.5, 1.0)
            })
            .collect();

        group.throughput(Throughput::Elements(*size as u64));
        group.bench_with_input(
            BenchmarkId::new("batch_rgb_to_oklab", size),
            &pixels,
            |b, pixels| b.iter(|| linear_srgb_to_oklab_batch(black_box(pixels))),
        );
    }

    group.finish();
}

// ============================================================================
// SPD Conversion Benchmarks
// ============================================================================

fn bench_spd_conversion(c: &mut Criterion) {
    let mut group = c.benchmark_group("spectrum");

    let spd = [0.1; NUM_BINS];

    group.bench_function("spd_to_rgba", |b| b.iter(|| spd_to_rgba(black_box(&spd))));

    // Batch SPD conversion
    for size in [100, 1000, 10000].iter() {
        let spds: Vec<_> = (0..*size)
            .map(|i| {
                let mut spd = [0.0; NUM_BINS];
                for (j, val) in spd.iter_mut().enumerate() {
                    *val = (i + j) as f64 * 0.001;
                }
                spd
            })
            .collect();

        group.throughput(Throughput::Elements(*size as u64));
        group.bench_with_input(BenchmarkId::new("batch_spd_to_rgba", size), &spds, |b, spds| {
            b.iter(|| {
                for spd in spds.iter() {
                    let _ = spd_to_rgba(black_box(spd));
                }
            })
        });
    }

    group.finish();
}

// ============================================================================
// Effect Chain Benchmarks
// ============================================================================

fn bench_effect_chain(c: &mut Criterion) {
    let mut group = c.benchmark_group("effects");
    group.sample_size(20); // Reduce samples for slower benchmarks

    let config = EffectConfig::default();
    let chain = EffectChainBuilder::new(config);
    let params = FrameParams { _frame_number: 0, _density: None };

    for (name, (w, h)) in
        [("720p", (1280usize, 720usize)), ("1080p", (1920usize, 1080usize))].iter()
    {
        let buffer: Vec<(f64, f64, f64, f64)> = vec![(0.5, 0.5, 0.5, 1.0); w * h];

        group.throughput(Throughput::Elements((w * h) as u64));
        group.bench_with_input(
            BenchmarkId::new("full_chain", name),
            &(*w, *h, buffer.clone()),
            |b, (w, h, buf)| {
                b.iter(|| chain.process_frame(black_box(buf.clone()), *w, *h, &params))
            },
        );
    }

    // Minimal config (no effects) for comparison
    let minimal_config = EffectConfig::builder().disable_all_effects().build();
    let minimal_chain = EffectChainBuilder::new(minimal_config);
    let buffer_1080: Vec<(f64, f64, f64, f64)> = vec![(0.5, 0.5, 0.5, 1.0); 1920 * 1080];

    group.bench_function("minimal_chain_1080p", |b| {
        b.iter(|| minimal_chain.process_frame(black_box(buffer_1080.clone()), 1920, 1080, &params))
    });

    group.finish();
}

// ============================================================================
// Gaussian Kernel Benchmarks
// ============================================================================

fn bench_gaussian_kernel(c: &mut Criterion) {
    let mut group = c.benchmark_group("gaussian_kernel");

    for radius in [5, 10, 20, 30, 50].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(radius), radius, |b, &radius| {
            b.iter(|| build_gaussian_kernel(black_box(radius)))
        });
    }

    group.finish();
}

// ============================================================================
// Simulation Benchmarks
// ============================================================================

fn bench_simulation(c: &mut Criterion) {
    let mut group = c.benchmark_group("simulation");
    group.sample_size(10); // Reduce sample size for slow benchmarks

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

    for steps in [1000, 10_000, 100_000].iter() {
        group.throughput(Throughput::Elements(*steps as u64));
        group.bench_with_input(BenchmarkId::new("orbit_simulation", steps), steps, |b, &steps| {
            b.iter(|| get_positions(black_box(bodies.clone()), steps))
        });
    }

    group.finish();
}

// ============================================================================
// RNG Benchmarks
// ============================================================================

fn bench_rng(c: &mut Criterion) {
    let mut group = c.benchmark_group("rng");

    let seed = [0x42u8; 32];
    let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);

    group.bench_function("next_f64", |b| b.iter(|| rng.next_f64()));

    group.bench_function("random_mass", |b| b.iter(|| rng.random_mass()));

    group.bench_function("random_location", |b| b.iter(|| rng.random_location()));

    group.finish();
}

criterion_group!(
    benches,
    bench_line_drawing,
    bench_oklab_conversion,
    bench_spd_conversion,
    bench_effect_chain,
    bench_gaussian_kernel,
    bench_simulation,
    bench_rng,
);
criterion_main!(benches);
