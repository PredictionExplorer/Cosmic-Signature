//! Loadable/savable orbit presets.
//!
//! Orbit presets let us skip the expensive Borda search when we already have
//! a known-good 3-body initial condition.

use crate::error::{ConfigError, Result};
use crate::sim::Body;
use nalgebra::Vector3;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufReader, BufWriter};
use std::path::Path;

pub const ORBIT_PRESET_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrbitPreset {
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub bodies: Vec<OrbitBody>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrbitBody {
    pub mass: f64,
    pub position: [f64; 3],
    pub velocity: [f64; 3],
}

impl OrbitPreset {
    pub fn new(name: Option<String>, bodies: Vec<OrbitBody>) -> Self {
        Self { version: ORBIT_PRESET_VERSION, name, bodies }
    }

    pub fn from_bodies(name: Option<String>, bodies: &[Body]) -> Self {
        let mut out = Vec::with_capacity(bodies.len());
        for b in bodies {
            out.push(OrbitBody {
                mass: b.mass,
                position: [b.position.x, b.position.y, b.position.z],
                velocity: [b.velocity.x, b.velocity.y, b.velocity.z],
            });
        }
        Self::new(name, out)
    }

    pub fn to_bodies(&self) -> Vec<Body> {
        self.bodies
            .iter()
            .map(|b| {
                Body::new(
                    b.mass,
                    Vector3::new(b.position[0], b.position[1], b.position[2]),
                    Vector3::new(b.velocity[0], b.velocity[1], b.velocity[2]),
                )
            })
            .collect()
    }
}

pub fn load_orbit_preset(path: &str) -> Result<OrbitPreset> {
    let path_obj = Path::new(path);
    let file = std::fs::File::open(path_obj).map_err(|e| ConfigError::FileSystem {
        operation: "open file".to_string(),
        path: path.to_string(),
        error: e,
    })?;

    let reader = BufReader::new(file);
    let preset: OrbitPreset = serde_json::from_reader(reader).map_err(|e| ConfigError::Json {
        operation: "parse orbit preset".to_string(),
        path: path.to_string(),
        error: e,
    })?;

    Ok(preset)
}

pub fn save_orbit_preset(path: &str, preset: &OrbitPreset) -> Result<()> {
    let path_obj = Path::new(path);

    let file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path_obj)
        .map_err(|e| ConfigError::FileSystem {
            operation: "write file".to_string(),
            path: path.to_string(),
            error: e,
        })?;

    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, preset).map_err(|e| ConfigError::Json {
        operation: "serialize orbit preset".to_string(),
        path: path.to_string(),
        error: e,
    })?;

    Ok(())
}
