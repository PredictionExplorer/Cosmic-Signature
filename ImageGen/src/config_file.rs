//! TOML configuration file support for the rendering pipeline.
//!
//! This module provides functionality to load rendering configuration from
//! TOML files, reducing the need for lengthy command-line arguments.
//!
//! # Example Configuration
//!
//! ```toml
//! [simulation]
//! seed = "0x100033"
//! num_sims = 50000
//! num_steps_sim = 1000000
//!
//! [render]
//! width = 1920
//! height = 1080
//! fast_encode = false
//!
//! [effects]
//! special = true
//! gallery_quality = true
//! preset = "gallery"
//!
//! [effects.bloom]
//! blur_strength = 12.0
//! blur_radius_scale = 0.02
//!
//! [drift]
//! mode = "elliptical"
//! scale = 1.5
//! arc_fraction = 0.25
//! ```

use serde::Deserialize;
use std::path::Path;
use tracing::info;

/// Complete configuration file structure.
///
/// All fields are optional to allow partial configuration files
/// that only specify the settings that differ from defaults.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct ConfigFile {
    /// Simulation parameters
    #[serde(default)]
    pub simulation: SimulationSettings,

    /// Render output parameters
    #[serde(default)]
    pub render: RenderSettings,

    /// Drift motion parameters
    #[serde(default)]
    pub drift: DriftSettings,

    /// Post-processing effects
    #[serde(default)]
    pub effects: EffectSettings,

    /// Output file settings
    #[serde(default)]
    pub output: OutputSettings,
}

/// Simulation parameters.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct SimulationSettings {
    /// Hex seed for RNG (e.g., "0x100033")
    pub seed: Option<String>,

    /// Number of simulation candidates to search
    pub num_sims: Option<usize>,

    /// Simulation timesteps
    pub num_steps_sim: Option<usize>,

    /// Location scale for initial positions
    pub location: Option<f64>,

    /// Velocity scale for initial velocities
    pub velocity: Option<f64>,

    /// Minimum body mass
    pub min_mass: Option<f64>,

    /// Maximum body mass
    pub max_mass: Option<f64>,

    /// Chaos weight for Borda selection
    pub chaos_weight: Option<f64>,

    /// Equilibrium weight for Borda selection
    pub equil_weight: Option<f64>,

    /// Escape threshold for orbit filtering
    pub escape_threshold: Option<f64>,
}

/// Render output parameters.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct RenderSettings {
    /// Output width in pixels
    pub width: Option<u32>,

    /// Output height in pixels
    pub height: Option<u32>,

    /// Use hardware-accelerated encoding
    pub fast_encode: Option<bool>,

    /// Alpha denominator for line drawing
    pub alpha_denom: Option<usize>,

    /// Alpha compression strength
    pub alpha_compress: Option<f64>,

    /// HDR mode ("auto" or "off")
    pub hdr_mode: Option<String>,
}

/// Drift motion parameters.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct DriftSettings {
    /// Enable drift motion
    pub enabled: Option<bool>,

    /// Drift mode ("linear", "brownian", "elliptical")
    pub mode: Option<String>,

    /// Drift scale relative to system size
    pub scale: Option<f64>,

    /// Arc fraction for elliptical drift (0-1)
    pub arc_fraction: Option<f64>,

    /// Orbit eccentricity for elliptical drift (0-0.95)
    pub orbit_eccentricity: Option<f64>,
}

/// Post-processing effect settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct EffectSettings {
    /// Enable special mode
    pub special: Option<bool>,

    /// Enable gallery quality mode
    pub gallery_quality: Option<bool>,

    /// Preset name to apply
    pub preset: Option<String>,

    /// Disable all effects
    pub disable_all_effects: Option<bool>,

    /// Bloom settings
    #[serde(default)]
    pub bloom: BloomSettings,

    /// Glow settings
    #[serde(default)]
    pub glow: GlowSettings,

    /// Chromatic bloom settings
    #[serde(default)]
    pub chromatic_bloom: ChromaticBloomSettings,

    /// Color grading settings
    #[serde(default)]
    pub color_grade: ColorGradeSettings,

    /// Material effect settings
    #[serde(default)]
    pub material: MaterialSettings,

    /// Atmospheric effect settings
    #[serde(default)]
    pub atmospheric: AtmosphericSettings,

    /// HDR and clipping settings
    #[serde(default)]
    pub hdr: HdrSettings,

    /// Nebula settings
    #[serde(default)]
    pub nebula: NebulaSettings,
}

/// Bloom effect settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct BloomSettings {
    /// Enable bloom
    pub enabled: Option<bool>,

    /// Bloom mode ("gaussian" or "dog")
    pub mode: Option<String>,

    /// Blur strength
    pub blur_strength: Option<f64>,

    /// Blur radius scale (relative to resolution)
    pub blur_radius_scale: Option<f64>,

    /// Blur core brightness
    pub blur_core_brightness: Option<f64>,

    /// DoG bloom strength
    pub dog_strength: Option<f64>,

    /// DoG sigma scale
    pub dog_sigma_scale: Option<f64>,

    /// DoG outer/inner ratio
    pub dog_ratio: Option<f64>,
}

/// Glow enhancement settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct GlowSettings {
    /// Enable glow
    pub enabled: Option<bool>,

    /// Glow strength
    pub strength: Option<f64>,

    /// Luminance threshold
    pub threshold: Option<f64>,

    /// Glow radius scale
    pub radius_scale: Option<f64>,

    /// Glow sharpness
    pub sharpness: Option<f64>,

    /// Saturation boost
    pub saturation_boost: Option<f64>,
}

/// Chromatic bloom settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct ChromaticBloomSettings {
    /// Enable chromatic bloom
    pub enabled: Option<bool>,

    /// Effect strength
    pub strength: Option<f64>,

    /// Radius scale
    pub radius_scale: Option<f64>,

    /// RGB separation scale
    pub separation_scale: Option<f64>,

    /// Luminance threshold
    pub threshold: Option<f64>,
}

/// Color grading settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct ColorGradeSettings {
    /// Enable color grading
    pub enabled: Option<bool>,

    /// Overall grading strength
    pub strength: Option<f64>,

    /// Vignette strength
    pub vignette_strength: Option<f64>,

    /// Vignette softness
    pub vignette_softness: Option<f64>,

    /// Vibrance multiplier
    pub vibrance: Option<f64>,

    /// Clarity strength
    pub clarity_strength: Option<f64>,

    /// Tone curve strength
    pub tone_curve_strength: Option<f64>,

    /// Enable gradient mapping
    pub gradient_map_enabled: Option<bool>,

    /// Gradient map strength
    pub gradient_map_strength: Option<f64>,

    /// Gradient map hue preservation
    pub gradient_map_hue_preservation: Option<f64>,

    /// Gradient map palette index (0-14)
    pub gradient_map_palette: Option<usize>,
}

/// Material effect settings (champlevé, aether, opalescence).
#[derive(Debug, Deserialize, Default, Clone)]
pub struct MaterialSettings {
    /// Enable champlevé effect
    pub champleve_enabled: Option<bool>,

    /// Champlevé flow alignment
    pub champleve_flow_alignment: Option<f64>,

    /// Champlevé interference amplitude
    pub champleve_interference_amplitude: Option<f64>,

    /// Champlevé rim intensity
    pub champleve_rim_intensity: Option<f64>,

    /// Champlevé rim warmth
    pub champleve_rim_warmth: Option<f64>,

    /// Champlevé interior lift
    pub champleve_interior_lift: Option<f64>,

    /// Enable aether effect
    pub aether_enabled: Option<bool>,

    /// Aether flow alignment
    pub aether_flow_alignment: Option<f64>,

    /// Aether scattering strength
    pub aether_scattering_strength: Option<f64>,

    /// Aether iridescence amplitude
    pub aether_iridescence_amplitude: Option<f64>,

    /// Aether caustic strength
    pub aether_caustic_strength: Option<f64>,

    /// Enable opalescence effect
    pub opalescence_enabled: Option<bool>,

    /// Opalescence strength
    pub opalescence_strength: Option<f64>,

    /// Opalescence scale
    pub opalescence_scale: Option<f64>,

    /// Opalescence layers
    pub opalescence_layers: Option<usize>,
}

/// Atmospheric effect settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct AtmosphericSettings {
    /// Enable atmospheric depth
    pub depth_enabled: Option<bool>,

    /// Atmospheric depth strength
    pub depth_strength: Option<f64>,

    /// Desaturation amount
    pub desaturation: Option<f64>,

    /// Darkening amount
    pub darkening: Option<f64>,

    /// Fog color (RGB)
    pub fog_color: Option<[f64; 3]>,

    /// Enable fine texture
    pub fine_texture_enabled: Option<bool>,

    /// Fine texture strength
    pub fine_texture_strength: Option<f64>,

    /// Fine texture scale
    pub fine_texture_scale: Option<f64>,

    /// Fine texture contrast
    pub fine_texture_contrast: Option<f64>,
}

/// HDR and clipping settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct HdrSettings {
    /// HDR scale
    pub scale: Option<f64>,

    /// Black point clipping
    pub clip_black: Option<f64>,

    /// White point clipping
    pub clip_white: Option<f64>,
}

/// Nebula effect settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct NebulaSettings {
    /// Nebula strength
    pub strength: Option<f64>,

    /// Number of noise octaves
    pub octaves: Option<usize>,

    /// Base frequency
    pub base_frequency: Option<f64>,
}

/// Output file settings.
#[derive(Debug, Deserialize, Default, Clone)]
pub struct OutputSettings {
    /// Base filename (without extension)
    pub file_name: Option<String>,

    /// Profile tag to append
    pub profile_tag: Option<String>,

    /// Only render test frame
    pub test_frame: Option<bool>,

    /// Output logs as JSON
    pub json_logs: Option<bool>,

    /// Log level
    pub log_level: Option<String>,
}

impl ConfigFile {
    /// Load configuration from a TOML file.
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the configuration file
    ///
    /// # Errors
    ///
    /// Returns an error if the file cannot be read or parsed.
    pub fn load(path: &Path) -> Result<Self, ConfigFileError> {
        let contents = std::fs::read_to_string(path).map_err(|e| ConfigFileError::Io {
            path: path.display().to_string(),
            error: e,
        })?;

        let config: ConfigFile =
            toml::from_str(&contents).map_err(|e| ConfigFileError::Parse {
                path: path.display().to_string(),
                error: e,
            })?;

        info!(
            path = %path.display(),
            "Loaded configuration file"
        );

        Ok(config)
    }

    /// Check if this configuration specifies any simulation settings.
    #[must_use]
    pub fn has_simulation_settings(&self) -> bool {
        self.simulation.seed.is_some()
            || self.simulation.num_sims.is_some()
            || self.simulation.num_steps_sim.is_some()
    }

    /// Check if this configuration specifies any render settings.
    #[must_use]
    pub fn has_render_settings(&self) -> bool {
        self.render.width.is_some() || self.render.height.is_some()
    }

    /// Check if this configuration specifies any effect settings.
    #[must_use]
    pub fn has_effect_settings(&self) -> bool {
        self.effects.special.is_some()
            || self.effects.gallery_quality.is_some()
            || self.effects.preset.is_some()
    }
}

/// Errors that can occur when loading a configuration file.
#[derive(Debug)]
pub enum ConfigFileError {
    /// I/O error reading the file
    Io {
        path: String,
        error: std::io::Error,
    },
    /// TOML parsing error
    Parse {
        path: String,
        error: toml::de::Error,
    },
}

impl std::fmt::Display for ConfigFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigFileError::Io { path, error } => {
                write!(f, "failed to read config file '{}': {}", path, error)
            }
            ConfigFileError::Parse { path, error } => {
                write!(f, "failed to parse config file '{}': {}", path, error)
            }
        }
    }
}

impl std::error::Error for ConfigFileError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ConfigFileError::Io { error, .. } => Some(error),
            ConfigFileError::Parse { error, .. } => Some(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn create_temp_config(content: &str) -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.flush().unwrap();
        file
    }

    #[test]
    fn test_load_minimal_config() {
        let content = r#"
[simulation]
seed = "0x12345"
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert_eq!(config.simulation.seed, Some("0x12345".to_string()));
        assert!(config.simulation.num_sims.is_none());
    }

    #[test]
    fn test_load_full_simulation_config() {
        let content = r#"
[simulation]
seed = "0xABCDEF"
num_sims = 50000
num_steps_sim = 1000000
location = 300.0
velocity = 1.0
min_mass = 100.0
max_mass = 300.0
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert_eq!(config.simulation.seed, Some("0xABCDEF".to_string()));
        assert_eq!(config.simulation.num_sims, Some(50000));
        assert_eq!(config.simulation.num_steps_sim, Some(1_000_000));
        assert_eq!(config.simulation.location, Some(300.0));
    }

    #[test]
    fn test_load_render_config() {
        let content = r#"
[render]
width = 3840
height = 2160
fast_encode = true
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert_eq!(config.render.width, Some(3840));
        assert_eq!(config.render.height, Some(2160));
        assert_eq!(config.render.fast_encode, Some(true));
    }

    #[test]
    fn test_load_effects_config() {
        let content = r#"
[effects]
special = true
gallery_quality = true
preset = "cinematic"

[effects.bloom]
enabled = true
blur_strength = 12.0
dog_strength = 0.4

[effects.color_grade]
enabled = true
vignette_strength = 0.5
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert_eq!(config.effects.special, Some(true));
        assert_eq!(config.effects.gallery_quality, Some(true));
        assert_eq!(config.effects.preset, Some("cinematic".to_string()));
        assert_eq!(config.effects.bloom.enabled, Some(true));
        assert_eq!(config.effects.bloom.blur_strength, Some(12.0));
        assert_eq!(config.effects.color_grade.vignette_strength, Some(0.5));
    }

    #[test]
    fn test_load_drift_config() {
        let content = r#"
[drift]
enabled = true
mode = "elliptical"
scale = 1.5
arc_fraction = 0.25
orbit_eccentricity = 0.3
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert_eq!(config.drift.enabled, Some(true));
        assert_eq!(config.drift.mode, Some("elliptical".to_string()));
        assert_eq!(config.drift.scale, Some(1.5));
        assert_eq!(config.drift.arc_fraction, Some(0.25));
    }

    #[test]
    fn test_has_settings_checks() {
        let content = r#"
[simulation]
seed = "0x123"
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert!(config.has_simulation_settings());
        assert!(!config.has_render_settings());
        assert!(!config.has_effect_settings());
    }

    #[test]
    fn test_empty_config() {
        let content = "";
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert!(!config.has_simulation_settings());
        assert!(!config.has_render_settings());
        assert!(!config.has_effect_settings());
    }

    #[test]
    fn test_invalid_toml_error() {
        let content = "this is not valid toml [";
        let file = create_temp_config(content);
        let result = ConfigFile::load(file.path());
        
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ConfigFileError::Parse { .. }));
    }

    #[test]
    fn test_nonexistent_file_error() {
        let result = ConfigFile::load(Path::new("/nonexistent/path/config.toml"));
        
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ConfigFileError::Io { .. }));
    }

    #[test]
    fn test_atmospheric_fog_color() {
        let content = r#"
[effects.atmospheric]
depth_enabled = true
fog_color = [0.1, 0.15, 0.2]
"#;
        let file = create_temp_config(content);
        let config = ConfigFile::load(file.path()).unwrap();
        
        assert_eq!(config.effects.atmospheric.fog_color, Some([0.1, 0.15, 0.2]));
    }
    
    /// Fuzz-style robustness test: parser should never panic on arbitrary input
    ///
    /// This test exercises the parser with various malformed inputs to ensure
    /// it always returns an error gracefully rather than panicking.
    #[test]
    fn test_parser_robustness_fuzz_style() {
        // Pre-allocate long strings to satisfy borrow checker
        let long_x_string = "x".repeat(10000);
        let long_a_string = format!("[{}]\nkey = 1", "a".repeat(1000));
        
        // Collection of malformed inputs that should be handled gracefully
        let malformed_inputs = vec![
            // Empty and whitespace
            "",
            "   ",
            "\n\n\n",
            "\t\t\t",
            
            // Invalid TOML syntax
            "[[[",
            "]]]",
            "===",
            "....",
            "{{{",
            "}}}",
            "<<<",
            ">>>",
            
            // Unclosed brackets
            "[simulation",
            "[simulation]seed",
            "[effects.bloom",
            "[[effects",
            
            // Invalid key-value pairs
            "key = ",
            "= value",
            "key value",
            "key == value",
            
            // Invalid numbers
            "[simulation]\nseed = 0xGGGG",
            "[simulation]\nnum_sims = -1",
            "[render]\nwidth = NaN",
            "[render]\nheight = Infinity",
            
            // Type mismatches
            "[simulation]\nseed = 12345",  // seed expects string
            "[render]\nwidth = \"not a number\"",
            "[effects]\nspecial = \"maybe\"",  // bool expected
            
            // Invalid array syntax
            "[effects.atmospheric]\nfog_color = [0.1, 0.2",  // unclosed
            "[effects.atmospheric]\nfog_color = 0.1, 0.2, 0.3",  // missing brackets
            "[effects.atmospheric]\nfog_color = [\"a\", \"b\", \"c\"]",  // wrong type
            
            // Nested section errors
            "[effects.unknown_section]\nvalue = 1",
            "[simulation.nested.too.deep]\nvalue = 1",
            
            // Unicode and special characters
            "seed = \"🚀\"",
            "[§invalid§]",
            "key = \"val\nue\"",
            
            // Extremely long inputs (potential DoS)
            &long_x_string,
            &long_a_string,
            
            // Mixed valid and invalid
            "[simulation]\nseed = \"0x123\"\n[[[\ninvalid",
            
            // Duplicate keys (TOML spec allows, but last wins)
            "[simulation]\nseed = \"0x123\"\nseed = \"0x456\"",
        ];
        
        for input in malformed_inputs.iter() {
            let file = create_temp_config(input);
            let result = ConfigFile::load(file.path());
            
            // The key requirement: should not panic, should return Result
            // We don't care if it succeeds or fails, just that it doesn't crash
            match result {
                Ok(_) => {
                    // Some malformed inputs might actually be valid TOML
                    // (e.g., empty file, whitespace, duplicate keys)
                    // That's fine - we just verify no panic occurred
                }
                Err(e) => {
                    // Should be a proper error, not a panic
                    // Verify error can be displayed (also exercises Display impl)
                    let _ = format!("{}", e);
                    let _ = format!("{:?}", e);
                }
            }
            
            // If we get here, no panic occurred for this input
        }
    }
    
    /// Test parser handles extremely nested or pathological structures
    #[test]
    fn test_parser_pathological_structures() {
        // Deeply nested tables (TOML allows this)
        let deep_nesting = "[a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p]\nvalue = 1";
        let file = create_temp_config(deep_nesting);
        let _ = ConfigFile::load(file.path());
        
        // Very long keys
        let long_key = format!("{} = 1", "a".repeat(1000));
        let file = create_temp_config(&long_key);
        let _ = ConfigFile::load(file.path());
        
        // Very long values
        let long_value = format!("key = \"{}\"", "x".repeat(10000));
        let file = create_temp_config(&long_value);
        let _ = ConfigFile::load(file.path());
        
        // Many sections
        let many_sections = (0..1000)
            .map(|i| format!("[section{}]\nkey = {}", i, i))
            .collect::<Vec<_>>()
            .join("\n");
        let file = create_temp_config(&many_sections);
        let _ = ConfigFile::load(file.path());
        
        // All of these should complete without panic
    }
    
    /// Test parser handles all control characters and special bytes
    #[test]
    fn test_parser_control_characters() {
        // Test all ASCII control characters
        for byte in 0u8..32u8 {
            let input = format!("key = \"value{}\"", byte as char);
            let file = create_temp_config(&input);
            let _ = ConfigFile::load(file.path());
        }
        
        // Test common special bytes
        let special_bytes = vec![
            b'\0',  // null
            b'\x7F',  // DEL
            b'\xFF',  // invalid UTF-8
        ];
        
        for &byte in &special_bytes {
            // Create byte string (might be invalid UTF-8)
            let bytes = vec![b'k', b'e', b'y', b'=', byte];
            let file = tempfile::NamedTempFile::new().unwrap();
            std::fs::write(file.path(), &bytes).unwrap();
            let _ = ConfigFile::load(file.path());
        }
    }
}

