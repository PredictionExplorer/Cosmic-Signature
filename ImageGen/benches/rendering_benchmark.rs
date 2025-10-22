//! Performance benchmarks for the Three Body Problem renderer
//!
//! Run with: cargo bench

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};
use nalgebra::Vector3;
use std::hint::black_box;
use three_body_problem::{
    render::drawing::draw_line_segment_aa_spectral_with_dispersion,
    sim::{Body, Sha3RandomByteStream, get_positions},
    spectrum::NUM_BINS,
    utils::build_gaussian_kernel,
};

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
    
    group.finish();
}

fn bench_gaussian_kernel(c: &mut Criterion) {
    let mut group = c.benchmark_group("gaussian_kernel");
    
    for radius in [5, 10, 20, 30].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(radius), radius, |b, &radius| {
            b.iter(|| build_gaussian_kernel(black_box(radius)))
        });
    }
    
    group.finish();
}

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
    
    group.bench_function("orbit_simulation_10k_steps", |b| {
        b.iter(|| {
            get_positions(black_box(bodies.clone()), 10_000)
        })
    });
    
    group.finish();
}

criterion_group!(benches, bench_line_drawing, bench_gaussian_kernel, bench_simulation);
criterion_main!(benches);

