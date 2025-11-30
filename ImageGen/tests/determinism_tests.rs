//! Determinism and Reproducibility Tests
//!
//! These tests ensure that the renderer and simulator produce
//! **exactly the same output** given the same inputs, which is
//! critical for debugging, testing, and reproducibility.

use three_body_problem::{
    sim::{Body, Sha3RandomByteStream, get_positions},
};
use nalgebra::Vector3;

/// Test that RNG is perfectly deterministic
#[test]
fn test_rng_determinism() {
    let seed = b"determinism_test_seed_v1";
    
    // Create two RNGs with the same seed
    let mut rng1 = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    let mut rng2 = Sha3RandomByteStream::new(seed, 100.0, 300.0, 25.0, 10.0);
    
    // Generate 1000 random values
    for _ in 0..1000 {
        let v1 = rng1.next_f64();
        let v2 = rng2.next_f64();
        
        assert_eq!(v1, v2, "RNG should be perfectly deterministic");
    }
}

/// Test that simulation is perfectly deterministic
#[test]
fn test_simulation_determinism() {
    let seed = b"sim_determinism_test_v1";
    
    // Create identical initial conditions
    let create_bodies = || {
        let mut local_rng = Sha3RandomByteStream::new(seed, 150.0, 200.0, 10.0, 3.0);
        vec![
            Body::new(
                local_rng.random_mass(),
                Vector3::new(
                    local_rng.random_location(),
                    local_rng.random_location(),
                    local_rng.random_location(),
                ),
                Vector3::new(
                    local_rng.random_velocity(),
                    local_rng.random_velocity(),
                    local_rng.random_velocity(),
                ),
            ),
            Body::new(
                local_rng.random_mass(),
                Vector3::new(
                    local_rng.random_location(),
                    local_rng.random_location(),
                    local_rng.random_location(),
                ),
                Vector3::new(
                    local_rng.random_velocity(),
                    local_rng.random_velocity(),
                    local_rng.random_velocity(),
                ),
            ),
            Body::new(
                local_rng.random_mass(),
                Vector3::new(
                    local_rng.random_location(),
                    local_rng.random_location(),
                    local_rng.random_location(),
                ),
                Vector3::new(
                    local_rng.random_velocity(),
                    local_rng.random_velocity(),
                    local_rng.random_velocity(),
                ),
            ),
        ]
    };
    
    let bodies1 = create_bodies();
    let bodies2 = create_bodies();
    
    // Simulate
    let sim1 = get_positions(bodies1, 500);
    let sim2 = get_positions(bodies2, 500);
    
    // Verify every position is identical
    for body_idx in 0..3 {
        for step in 0..500 {
            let p1 = sim1.positions[body_idx][step];
            let p2 = sim2.positions[body_idx][step];
            
            assert_eq!(p1.x, p2.x, "X position should be identical at body {} step {}", body_idx, step);
            assert_eq!(p1.y, p2.y, "Y position should be identical at body {} step {}", body_idx, step);
            assert_eq!(p1.z, p2.z, "Z position should be identical at body {} step {}", body_idx, step);
        }
    }
}

/// Test that different seeds produce different results
#[test]
fn test_different_seeds_produce_different_results() {
    let seed1 = b"seed_one";
    let seed2 = b"seed_two";
    
    let mut rng1 = Sha3RandomByteStream::new(seed1, 100.0, 300.0, 25.0, 10.0);
    let mut rng2 = Sha3RandomByteStream::new(seed2, 100.0, 300.0, 25.0, 10.0);
    
    let v1 = rng1.next_f64();
    let v2 = rng2.next_f64();
    
    assert_ne!(v1, v2, "Different seeds should produce different results");
}

/// Test that changing a single bit in the seed changes output (avalanche effect)
#[test]
fn test_rng_avalanche_effect() {
    let seed1 = b"test_seed_000000";
    let seed2 = b"test_seed_000001";  // Single bit changed
    
    let mut rng1 = Sha3RandomByteStream::new(seed1, 100.0, 300.0, 25.0, 10.0);
    let mut rng2 = Sha3RandomByteStream::new(seed2, 100.0, 300.0, 25.0, 10.0);
    
    // Count how many of first 100 values differ
    let mut differences = 0;
    for _ in 0..100 {
        if rng1.next_f64() != rng2.next_f64() {
            differences += 1;
        }
    }
    
    // SHA3 should have good avalanche effect - expect ~100% different
    assert!(differences > 95, "Expected strong avalanche effect, got {} differences", differences);
}

