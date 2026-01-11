use crate::sim::{Body, G};
use crate::utils::fourier_transform;
use nalgebra::Vector3;
use statrs::statistics::Statistics;

/// Total energy: kinetic + potential
pub fn calculate_total_energy(bodies: &[Body]) -> f64 {
    let mut kin = 0.0;
    let mut pot = 0.0;
    for b in bodies {
        kin += crate::render::constants::KINETIC_ENERGY_FACTOR * b.mass * b.velocity.norm_squared();
    }
    let n = bodies.len(); // Cache length to avoid repeated calls
    for i in 0..n {
        for j in (i + 1)..n {
            let r = (bodies[i].position - bodies[j].position).norm();
            if r > 1e-10 {
                pot += -G * bodies[i].mass * bodies[j].mass / r;
            }
        }
    }
    kin + pot
}

/// Total angular momentum vector
pub fn calculate_total_angular_momentum(bodies: &[Body]) -> Vector3<f64> {
    let mut total_l = Vector3::zeros();
    for b in bodies {
        total_l += b.mass * b.position.cross(&b.velocity);
    }
    total_l
}

/// A measure of "regularity" vs "chaos", smaller => more chaotic
pub fn non_chaoticness(m1: f64, m2: f64, m3: f64, positions: &[Vec<Vector3<f64>>]) -> f64 {
    let len = positions[0].len();
    if len == 0 {
        return 0.0;
    }
    let mut r1 = vec![0.0; len];
    let mut r2 = vec![0.0; len];
    let mut r3 = vec![0.0; len];
    for i in 0..len {
        let p1 = positions[0][i];
        let p2 = positions[1][i];
        let p3 = positions[2][i];
        let cm1 = (m2 * p2 + m3 * p3) / (m2 + m3);
        let cm2 = (m1 * p1 + m3 * p3) / (m1 + m3);
        let cm3 = (m1 * p1 + m2 * p2) / (m1 + m2);
        r1[i] = (p1 - cm1).norm();
        r2[i] = (p2 - cm2).norm();
        r3[i] = (p3 - cm3).norm();
    }
    let abs1: Vec<f64> = fourier_transform(&r1).iter().map(|c| c.norm()).collect();
    let abs2: Vec<f64> = fourier_transform(&r2).iter().map(|c| c.norm()).collect();
    let abs3: Vec<f64> = fourier_transform(&r3).iter().map(|c| c.norm()).collect();
    let sd1 = Statistics::std_dev(abs1.iter().copied());
    let sd2 = Statistics::std_dev(abs2.iter().copied());
    let sd3 = Statistics::std_dev(abs3.iter().copied());
    (sd1 + sd2 + sd3) / 3.0
}

/// Score how "equilateral" the 3-body triangle is over time
pub fn equilateralness_score(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let n = positions[0].len();
    if n < 1 {
        return 0.0;
    }
    let mut sum = 0.0;
    for step in 0..n {
        let p0 = positions[0][step];
        let p1 = positions[1][step];
        let p2 = positions[2][step];
        let l01 = (p0 - p1).norm();
        let l12 = (p1 - p2).norm();
        let l20 = (p2 - p0).norm();
        let mn = l01.min(l12).min(l20);
        if mn < 1e-14 {
            continue;
        }
        let mx = l01.max(l12).max(l20);
        sum += 1.0 / (mx / mn);
    }
    sum / (n as f64)
}

/// Measure how "compact" the trajectory is (higher = more bounded/elegant)
#[allow(dead_code)]
/// 
/// This metric rewards trajectories where:
/// - Bodies stay within a bounded region
/// - The orbital paths don't spread across the entire space
/// - There are clear focal points in the motion
/// 
/// Formula: 1.0 / (1.0 + normalized_spread)
/// where normalized_spread = average distance from center of mass / characteristic length
pub fn trajectory_compactness(positions: &[Vec<Vector3<f64>>]) -> f64 {
    let n = positions[0].len();
    if n < 10 {
        return 0.0;
    }
    
    // Compute center of mass of all positions over time
    let mut com_x = 0.0;
    let mut com_y = 0.0;
    let mut com_z = 0.0;
    let mut count = 0.0;
    
    for body_pos in positions {
        for pos in body_pos {
            com_x += pos.x;
            com_y += pos.y;
            com_z += pos.z;
            count += 1.0;
        }
    }
    
    if count < 1.0 {
        return 0.0;
    }
    
    let com = Vector3::new(com_x / count, com_y / count, com_z / count);
    
    // Compute bounding box to get characteristic length
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    
    for body_pos in positions {
        for pos in body_pos {
            min_x = min_x.min(pos.x);
            max_x = max_x.max(pos.x);
            min_y = min_y.min(pos.y);
            max_y = max_y.max(pos.y);
        }
    }
    
    let bbox_size = ((max_x - min_x).powi(2) + (max_y - min_y).powi(2)).sqrt();
    if bbox_size < 1e-10 {
        return 1.0; // Perfectly compact (degenerate case)
    }
    
    // Compute average distance from center of mass
    let mut total_dist = 0.0;
    for body_pos in positions {
        for pos in body_pos {
            total_dist += (pos - com).norm();
        }
    }
    let avg_dist = total_dist / count;
    
    // Normalize by bounding box and convert to compactness score
    // Lower spread = higher compactness
    let normalized_spread = avg_dist / bbox_size;
    
    // Return compactness score (0 to 1, higher = more compact)
    1.0 / (1.0 + normalized_spread * 2.0)
}

/// Compute the "elegance" score combining multiple metrics
#[allow(dead_code)]
/// 
/// A trajectory is elegant if it is:
/// - Moderately chaotic (interesting but not random)
/// - Symmetric (equilateral triangles)
/// - Compact (bounded, not space-filling)
pub fn trajectory_elegance(
    m1: f64, m2: f64, m3: f64,
    positions: &[Vec<Vector3<f64>>],
) -> f64 {
    let chaos = non_chaoticness(m1, m2, m3, positions);
    let equilateral = equilateralness_score(positions);
    let compactness = trajectory_compactness(positions);
    
    // Normalize chaos (lower is more chaotic, we want moderate)
    // Optimal chaos is around 0.1-0.5, too high = boring, too low = random
    let chaos_factor = if chaos < 0.1 {
        chaos / 0.1  // Too chaotic, penalize
    } else if chaos > 1.0 {
        1.0 / chaos  // Too stable, penalize
    } else {
        1.0  // Good range
    };
    
    // Combine with weights
    // Compactness is most important for visual elegance
    0.3 * equilateral + 0.5 * compactness + 0.2 * chaos_factor
}
