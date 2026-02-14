use clap::Parser;
use nalgebra::Vector3;
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::time::Instant;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

mod analysis;
mod app;
mod curation;
mod drift;
mod drift_config;
mod error;
mod generation_log;
mod orbit_preset;
mod profile;
mod oklab;
mod post_effects;
mod render;
mod sim;
mod soa_positions;
mod spectral_constants;
mod spectrum;
mod spectrum_simd;
mod utils;

use crate::curation::{
    CandidateEvaluation, CurationOptions, CurationSummary, QualityMode,
    novelty::NoveltyMemory,
    quality_score::{
        apply_video_and_novelty, estimate_temporal_scores, quick_reject_config,
        score_image_frame, score_temporal_probe_frames,
    },
    repair::repair_candidate,
    selector::{accept_candidate, choose_finalists, composite_score, pick_winner},
    style_families::{StyleFamily, apply_style_family, resolve_style_family},
};
use error::Result;
use render::RenderConfig;
use sim::Sha3RandomByteStream;

/// Command-line arguments
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "
Simulate random 3-body orbits, choose the best via Borda, 
then generate a single image + MP4. 
Also discards orbits that appear to have an escaping body."
)]
struct Args {
    #[arg(long, default_value = "0x100033")]
    seed: String,

    #[arg(long, default_value = "output")]
    file_name: String,

    #[arg(long)]
    num_sims: Option<usize>,

    #[arg(long, default_value_t = 1_000_000)]
    num_steps_sim: usize,

    #[arg(long, default_value_t = 300.0)]
    location: f64,

    #[arg(long, default_value_t = 1.0)]
    velocity: f64,

    #[arg(long, default_value_t = 100.0)]
    min_mass: f64,

    #[arg(long, default_value_t = 300.0)]
    max_mass: f64,

    #[arg(long, default_value_t = 0.75)]
    chaos_weight: f64,

    #[arg(long, default_value_t = 11.0)]
    equil_weight: f64,

    #[arg(long, default_value_t = 1920)]
    width: u32,

    #[arg(long, default_value_t = 1080)]
    height: u32,

    /// Lower percentile for clamping
    #[arg(long, default_value_t = 0.010)]
    clip_black: f64,

    /// Upper percentile for clamping
    #[arg(long, default_value_t = 0.990)]
    clip_white: f64,

    #[arg(long, default_value_t = false)]
    special: bool,

    /// Test mode: render only the first frame as PNG and exit (skips video generation)
    #[arg(long, default_value_t = false)]
    test_frame: bool,

    /// Render a single final PNG only (skips MP4 generation)
    #[arg(long, default_value_t = false)]
    no_video: bool,

    /// Fast encode mode: use hardware acceleration (3-5× faster, slightly lower quality)
    /// Default is high-quality mode with H.265, 10-bit color, and perceptual optimization
    #[arg(long, default_value_t = false)]
    fast_encode: bool,

    /// Denominator for alpha used in drawing lines
    #[arg(long, default_value_t = 15_000_000)]
    alpha_denom: usize,

    /// If body's energy in COM frame is above this, treat as escaping
    #[arg(long, default_value_t = -0.3)]
    escape_threshold: f64,

    /// Strength of density-aware alpha compression (0 = off)
    #[arg(long, default_value_t = 6.0)]
    alpha_compress: f64,

    /// Disable drift motion (drift is enabled by default)
    #[arg(long, default_value_t = false)]
    no_drift: bool,

    /// Drift mode: linear, brownian, elliptical
    #[arg(long, default_value = "elliptical")]
    drift_mode: String,

    /// Scale of drift motion (relative to system size)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    drift_scale: Option<f64>,

    /// Fraction of the orbit to traverse when using elliptical drift (0-1)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    drift_arc_fraction: Option<f64>,

    /// Orbit eccentricity when using elliptical drift (0-0.95)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    drift_orbit_eccentricity: Option<f64>,

    /// Profile tag to append to output filenames
    #[arg(long, default_value = "")]
    profile_tag: String,

    /// Bloom mode: gaussian or dog
    #[arg(long, default_value = "dog")]
    bloom_mode: String,

    /// DoG bloom strength (0.1-1.0)
    #[arg(long, default_value_t = 0.32)]
    dog_strength: f64,

    /// DoG inner sigma in pixels (auto-scales with resolution if not specified)
    #[arg(long)]
    dog_sigma: Option<f64>,

    /// DoG outer/inner sigma ratio
    #[arg(long, default_value_t = 2.8)]
    dog_ratio: f64,

    /// HDR mode: off or auto
    #[arg(long, default_value = "auto")]
    hdr_mode: String,

    /// HDR scale multiplier for line alpha
    #[arg(long, default_value_t = 0.12)]
    hdr_scale: f64,

    /// Enable perceptual blur in OKLab space: off or on
    #[arg(long, default_value = "on")]
    perceptual_blur: String,

    /// Perceptual blur radius (pixels), defaults to main blur radius
    #[arg(long)]
    perceptual_blur_radius: Option<usize>,

    /// Perceptual blur strength (0.0-1.0)
    #[arg(long, default_value_t = 0.65)]
    perceptual_blur_strength: f64,

    /// Gamut mapping mode for perceptual blur: clamp, preserve-hue, soft-clip
    #[arg(long, default_value = "preserve-hue")]
    perceptual_gamut_mode: String,

    /// Output logs in JSON format
    #[arg(long)]
    json_logs: bool,

    /// Set log level (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    log_level: String,

    // ==== Curation & Quality Search ====
    /// Quality mode: strict, balanced, or explore
    #[arg(long, default_value = "strict")]
    quality_mode: String,

    /// Number of preview candidates per curation round
    #[arg(long, default_value_t = 30)]
    candidate_count_preview: usize,

    /// Number of finalists re-rendered at target resolution
    #[arg(long, default_value_t = 2)]
    finalist_count: usize,

    /// Maximum curation rounds before fallback to best candidate
    #[arg(long, default_value_t = 2)]
    max_curation_rounds: usize,

    /// Minimum image score threshold for acceptance
    #[arg(long, default_value_t = 0.78)]
    min_image_score: f64,

    /// Minimum video score threshold for acceptance
    #[arg(long, default_value_t = 0.72)]
    min_video_score: f64,

    /// Minimum novelty score threshold for acceptance
    #[arg(long, default_value_t = 0.18)]
    min_novelty_score: f64,

    /// Allow targeted repair pass for near-miss candidates
    #[arg(long, default_value_t = true)]
    allow_repair_pass: bool,

    /// Optional fixed style family name (e.g. "Velvet Nebula")
    #[arg(long)]
    style_family: Option<String>,

    /// Save optional archival master output in strict mode
    #[arg(long, default_value_t = false)]
    save_master: bool,

    // ==== Fast Generation / Profiles ====
    /// Skip curation search (single-pass), even in strict/balanced modes
    #[arg(long, default_value_t = false)]
    no_curation: bool,

    /// Load a frozen effect profile (JSON). Disables effect randomization and style-family mutation
    #[arg(long)]
    effect_profile_in: Option<String>,

    /// Save the final resolved effect profile to JSON
    #[arg(long)]
    effect_profile_out: Option<String>,

    /// Load orbit preset (JSON) and skip Borda orbit search
    #[arg(long)]
    orbit_in: Option<String>,

    /// Save selected orbit to an orbit preset (JSON)
    #[arg(long)]
    orbit_out: Option<String>,

    /// Load orbit bodies from generation_log.json by file_name
    #[arg(long)]
    orbit_from_log: Option<String>,

    /// Load effect profile from generation_log.json by file_name
    #[arg(long)]
    effect_from_log: Option<String>,

    /// Generate multiple variants for the same orbit (colors/effects vary per variant)
    #[arg(long, default_value_t = 1)]
    variants: usize,

    /// Variant start index (useful for resumable batches)
    #[arg(long, default_value_t = 0)]
    variant_start: usize,

    // ==== Effect Control Flags (All effects enabled by default) ====
    /// Disable ALL post-processing effects (show pure spectral rendering + basic bloom)
    #[arg(long, default_value_t = false)]
    disable_all_effects: bool,

    /// Disable bloom effect (Gaussian/DoG glow)
    #[arg(long, default_value_t = false)]
    disable_bloom: bool,

    /// Disable glow enhancement (tight sparkle on bright areas)
    #[arg(long, default_value_t = false)]
    disable_glow: bool,

    /// Disable chromatic bloom (prismatic color separation)
    #[arg(long, default_value_t = false)]
    disable_chromatic_bloom: bool,

    /// Disable perceptual blur (OKLab space smoothing)
    #[arg(long, default_value_t = false)]
    disable_perceptual_blur: bool,

    /// Disable micro-contrast enhancement (detail clarity boost)
    #[arg(long, default_value_t = false)]
    disable_micro_contrast: bool,

    /// Disable gradient mapping (luxury color palettes)
    #[arg(long, default_value_t = false)]
    disable_gradient_map: bool,

    /// Disable cinematic color grading (film-like look)
    #[arg(long, default_value_t = false)]
    disable_color_grade: bool,

    /// Disable champlevé effect (Voronoi cells + metallic rims)
    #[arg(long, default_value_t = false)]
    disable_champleve: bool,

    /// Disable aether effect (woven filaments + volumetric flow)
    #[arg(long, default_value_t = false)]
    disable_aether: bool,

    /// Disable opalescence (gem-like iridescent shimmer)
    #[arg(long, default_value_t = false)]
    disable_opalescence: bool,

    /// Disable edge luminance enhancement (form refinement)
    #[arg(long, default_value_t = false)]
    disable_edge_luminance: bool,

    /// Disable atmospheric depth (spatial perspective + fog)
    #[arg(long, default_value_t = false)]
    disable_atmospheric_depth: bool,

    /// Disable fine texture overlay (canvas/surface quality)
    #[arg(long, default_value_t = false)]
    disable_fine_texture: bool,

    /// Disable temporal smoothing (video frame blending)
    #[arg(long, default_value_t = false)]
    disable_temporal_smoothing: bool,

    // ==== Gallery Quality Mode ====
    /// Enable gallery quality mode (narrower randomization ranges for exhibition-ready results)
    #[arg(long, default_value_t = false)]
    gallery_quality: bool,

    // ==== Bloom & Glow Parameters ====
    /// Gaussian blur strength (if not specified, randomized in range 4.0-18.0)
    #[arg(long)]
    param_blur_strength: Option<f64>,

    /// Blur radius scale relative to resolution (if not specified, randomized in range 0.008-0.045)
    #[arg(long)]
    param_blur_radius_scale: Option<f64>,

    /// Blur core brightness preservation (if not specified, randomized in range 4.0-18.0)
    #[arg(long)]
    param_blur_core_brightness: Option<f64>,

    /// DoG bloom strength (if not specified, randomized in range 0.15-0.60)
    #[arg(long)]
    param_dog_strength: Option<f64>,

    /// DoG inner sigma scale (if not specified, randomized in range 0.004-0.012)
    #[arg(long)]
    param_dog_sigma_scale: Option<f64>,

    /// DoG outer/inner ratio (if not specified, randomized in range 2.0-4.0)
    #[arg(long)]
    param_dog_ratio: Option<f64>,

    /// Glow enhancement strength (if not specified, randomized in range 0.15-0.70)
    #[arg(long)]
    param_glow_strength: Option<f64>,

    /// Glow luminance threshold (if not specified, randomized in range 0.50-0.85)
    #[arg(long)]
    param_glow_threshold: Option<f64>,

    /// Glow radius scale (if not specified, randomized in range 0.004-0.012)
    #[arg(long)]
    param_glow_radius_scale: Option<f64>,

    /// Glow sharpness (if not specified, randomized in range 1.5-4.0)
    #[arg(long)]
    param_glow_sharpness: Option<f64>,

    /// Glow saturation boost (if not specified, randomized in range 0.0-0.40)
    #[arg(long)]
    param_glow_saturation_boost: Option<f64>,

    // ==== Chromatic Bloom Parameters ====
    /// Chromatic bloom strength (if not specified, randomized in range 0.35-0.85)
    #[arg(long)]
    param_chromatic_bloom_strength: Option<f64>,

    /// Chromatic bloom radius scale (if not specified, randomized in range 0.007-0.018)
    #[arg(long)]
    param_chromatic_bloom_radius_scale: Option<f64>,

    /// Chromatic bloom RGB separation scale (if not specified, randomized in range 0.0015-0.0035)
    #[arg(long)]
    param_chromatic_bloom_separation_scale: Option<f64>,

    /// Chromatic bloom threshold (if not specified, randomized in range 0.08-0.30)
    #[arg(long)]
    param_chromatic_bloom_threshold: Option<f64>,

    // ==== Perceptual Blur Parameters ====
    /// Perceptual blur strength (if not specified, randomized in range 0.35-0.85)
    #[arg(long)]
    param_perceptual_blur_strength: Option<f64>,

    // ==== Color Grading Parameters ====
    /// Color grading strength (if not specified, randomized in range 0.0-0.75)
    #[arg(long)]
    param_color_grade_strength: Option<f64>,

    /// Vignette strength (if not specified, randomized in range 0.0-0.65)
    #[arg(long)]
    param_vignette_strength: Option<f64>,

    /// Vignette softness exponent (if not specified, randomized in range 1.8-3.5)
    #[arg(long)]
    param_vignette_softness: Option<f64>,

    /// Color vibrance multiplier (if not specified, randomized in range 0.85-1.35)
    #[arg(long)]
    param_vibrance: Option<f64>,

    /// Clarity strength (if not specified, randomized in range 0.0-0.50)
    #[arg(long)]
    param_clarity_strength: Option<f64>,

    /// Tone curve strength (if not specified, randomized in range 0.0-0.75)
    #[arg(long)]
    param_tone_curve_strength: Option<f64>,

    // ==== Gradient Mapping Parameters ====
    /// Gradient map strength (if not specified, randomized in range 0.40-1.0)
    #[arg(long)]
    param_gradient_map_strength: Option<f64>,

    /// Gradient map hue preservation (if not specified, randomized in range 0.0-0.40)
    #[arg(long)]
    param_gradient_map_hue_preservation: Option<f64>,

    /// Gradient map palette selection (0-14: 0=GoldPurple, 1=CosmicTealPink, 2=AmberCyan, 3=IndigoGold, 4=BlueOrange, 5=VenetianRenaissance, 6=JapaneseUkiyoe, 7=ArtNouveau, 8=LunarOpal, 9=FireOpal, 10=DeepOcean, 11=AuroraBorealis, 12=MoltenMetal, 13=AncientJade, 14=RoyalAmethyst)
    #[arg(long)]
    param_gradient_map_palette: Option<usize>,

    // ==== Opalescence Parameters ====
    /// Opalescence strength (if not specified, randomized in range 0.0-0.35)
    #[arg(long)]
    param_opalescence_strength: Option<f64>,

    /// Opalescence pattern scale (if not specified, randomized in range 0.005-0.015)
    #[arg(long)]
    param_opalescence_scale: Option<f64>,

    /// Opalescence interference layers (if not specified, randomized in range 1-4)
    #[arg(long)]
    param_opalescence_layers: Option<usize>,

    // ==== Champlevé Parameters ====
    /// Champlevé flow alignment (if not specified, randomized in range 0.20-0.85)
    #[arg(long)]
    param_champleve_flow_alignment: Option<f64>,

    /// Champlevé interference amplitude (if not specified, randomized in range 0.15-0.80)
    #[arg(long)]
    param_champleve_interference_amplitude: Option<f64>,

    /// Champlevé rim intensity (if not specified, randomized in range 0.5-3.0)
    #[arg(long)]
    param_champleve_rim_intensity: Option<f64>,

    /// Champlevé rim warmth (if not specified, randomized in range 0.0-0.90)
    #[arg(long)]
    param_champleve_rim_warmth: Option<f64>,

    /// Champlevé interior lift (if not specified, randomized in range 0.20-0.90)
    #[arg(long)]
    param_champleve_interior_lift: Option<f64>,

    // ==== Aether Parameters ====
    /// Aether flow alignment (if not specified, randomized in range 0.30-0.95)
    #[arg(long)]
    param_aether_flow_alignment: Option<f64>,

    /// Aether scattering strength (if not specified, randomized in range 0.30-1.50)
    #[arg(long)]
    param_aether_scattering_strength: Option<f64>,

    /// Aether iridescence amplitude (if not specified, randomized in range 0.20-0.85)
    #[arg(long)]
    param_aether_iridescence_amplitude: Option<f64>,

    /// Aether caustic strength (if not specified, randomized in range 0.0-0.60)
    #[arg(long)]
    param_aether_caustic_strength: Option<f64>,

    // ==== Micro-Contrast Parameters ====
    /// Micro-contrast strength (if not specified, randomized in range 0.10-0.45)
    #[arg(long)]
    param_micro_contrast_strength: Option<f64>,

    /// Micro-contrast radius (if not specified, randomized in range 2-8)
    #[arg(long)]
    param_micro_contrast_radius: Option<usize>,

    // ==== Edge Luminance Parameters ====
    /// Edge luminance strength (if not specified, randomized in range 0.08-0.40)
    #[arg(long)]
    param_edge_luminance_strength: Option<f64>,

    /// Edge luminance threshold (if not specified, randomized in range 0.10-0.30)
    #[arg(long)]
    param_edge_luminance_threshold: Option<f64>,

    /// Edge luminance brightness boost (if not specified, randomized in range 0.15-0.50)
    #[arg(long)]
    param_edge_luminance_brightness_boost: Option<f64>,

    // ==== Atmospheric Depth Parameters ====
    /// Atmospheric depth strength (if not specified, randomized in range 0.0-0.45)
    #[arg(long)]
    param_atmospheric_depth_strength: Option<f64>,

    /// Atmospheric desaturation (if not specified, randomized in range 0.10-0.60)
    #[arg(long)]
    param_atmospheric_desaturation: Option<f64>,

    /// Atmospheric darkening (if not specified, randomized in range 0.0-0.35)
    #[arg(long)]
    param_atmospheric_darkening: Option<f64>,

    /// Atmospheric fog color red component (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    param_atmospheric_fog_color_r: Option<f64>,

    /// Atmospheric fog color green component (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    param_atmospheric_fog_color_g: Option<f64>,

    /// Atmospheric fog color blue component (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    param_atmospheric_fog_color_b: Option<f64>,

    // ==== Fine Texture Parameters ====
    /// Fine texture strength (if not specified, randomized in range 0.02-0.25)
    #[arg(long)]
    param_fine_texture_strength: Option<f64>,

    /// Fine texture scale (if not specified, randomized in range 0.0008-0.0028)
    #[arg(long)]
    param_fine_texture_scale: Option<f64>,

    /// Fine texture contrast (if not specified, randomized in range 0.15-0.50)
    #[arg(long)]
    param_fine_texture_contrast: Option<f64>,

    // ==== HDR Parameters ====
    /// HDR scale (if not specified, randomized in range 0.06-0.25)
    #[arg(long)]
    param_hdr_scale: Option<f64>,

    // ==== Clipping Parameters ====
    /// Black point clipping (if not specified, randomized in range 0.005-0.025, constrained < clip_white)
    #[arg(long)]
    param_clip_black: Option<f64>,

    /// White point clipping (if not specified, randomized in range 0.975-0.998, constrained > clip_black)
    #[arg(long)]
    param_clip_white: Option<f64>,

    // ==== Nebula Parameters ====
    /// Nebula strength (if not specified, randomized in range 0.02-0.12)
    #[arg(long)]
    param_nebula_strength: Option<f64>,

    /// Nebula octaves (if not specified, randomized in range 2-7)
    #[arg(long)]
    param_nebula_octaves: Option<usize>,

    /// Nebula base frequency (if not specified, randomized in range 0.0005-0.0035)
    #[arg(long)]
    param_nebula_base_frequency: Option<f64>,
}

fn setup_logging(json: bool, level: &str) {
    let env_filter = EnvFilter::try_new(level).unwrap_or_else(|_| EnvFilter::new("info"));

    if json {
        // Structured logging in key=value format (JSON feature not available)
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_target(false)
            .with_thread_ids(false)
            .with_level(true)
            .with_ansi(false)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_target(false)
            .with_thread_ids(false)
            .init();
    }
}

fn parse_status_kib(status_text: &str, key: &str) -> Option<u64> {
    for line in status_text.lines() {
        if let Some(rest) = line.strip_prefix(key) {
            let value = rest.split_whitespace().next().and_then(|v| v.parse::<u64>().ok());
            if value.is_some() {
                return value;
            }
        }
    }
    None
}

fn parse_status_threads(status_text: &str) -> Option<usize> {
    for line in status_text.lines() {
        if let Some(rest) = line.strip_prefix("Threads:") {
            let value = rest.split_whitespace().next().and_then(|v| v.parse::<usize>().ok());
            if value.is_some() {
                return value;
            }
        }
    }
    None
}

fn read_process_telemetry() -> Option<(u64, u64, usize)> {
    let status_text = fs::read_to_string("/proc/self/status").ok()?;
    let vm_rss_kib = parse_status_kib(&status_text, "VmRSS:")?;
    let vm_hwm_kib = parse_status_kib(&status_text, "VmHWM:").unwrap_or(vm_rss_kib);
    let threads = parse_status_threads(&status_text).unwrap_or(0);
    Some((vm_rss_kib, vm_hwm_kib, threads))
}

fn log_stage_telemetry(stage: &str, started_at: Instant) {
    let elapsed_s = started_at.elapsed().as_secs_f64();
    if let Some((rss_kib, hwm_kib, threads)) = read_process_telemetry() {
        info!(
            "Stage telemetry: stage={stage}, elapsed_s={elapsed_s:.3}, vm_rss_mb={:.1}, vm_hwm_mb={:.1}, threads={threads}",
            rss_kib as f64 / 1024.0,
            hwm_kib as f64 / 1024.0,
        );
    } else {
        info!("Stage telemetry: stage={stage}, elapsed_s={elapsed_s:.3}");
    }
}

fn build_curation_options(args: &Args) -> CurationOptions {
    CurationOptions {
        quality_mode: QualityMode::from_str(&args.quality_mode),
        candidate_count_preview: args.candidate_count_preview.max(1),
        finalist_count: args.finalist_count.max(1),
        max_curation_rounds: args.max_curation_rounds.max(1),
        min_image_score: args.min_image_score.clamp(0.0, 1.0),
        min_video_score: args.min_video_score.clamp(0.0, 1.0),
        min_novelty_score: args.min_novelty_score.clamp(0.0, 1.0),
        allow_repair_pass: args.allow_repair_pass,
        style_family: args.style_family.clone(),
    }
}

/// Build randomizable effect configuration from command-line arguments.
/// Any unspecified parameter will be randomized during resolution.
fn build_randomizable_config(
    args: &Args,
    mode: QualityMode,
) -> render::randomizable_config::RandomizableEffectConfig {
    use render::randomizable_config::RandomizableEffectConfig;

    let default_enable = !matches!(mode, QualityMode::Explore);

    let enable_or_random = |disabled: bool| -> Option<bool> {
        if args.disable_all_effects || disabled {
            Some(false)
        } else if default_enable {
            Some(true)
        } else {
            None
        }
    };

    RandomizableEffectConfig {
        gallery_quality: args.gallery_quality,

        // Effect enables (strict/balanced default to enabled; explore keeps randomization)
        enable_bloom: enable_or_random(args.disable_bloom),
        enable_glow: enable_or_random(args.disable_glow),
        enable_chromatic_bloom: enable_or_random(args.disable_chromatic_bloom),
        enable_perceptual_blur: enable_or_random(args.disable_perceptual_blur),
        enable_micro_contrast: enable_or_random(args.disable_micro_contrast),
        enable_gradient_map: enable_or_random(args.disable_gradient_map),
        enable_color_grade: enable_or_random(args.disable_color_grade),
        enable_champleve: enable_or_random(args.disable_champleve),
        enable_aether: enable_or_random(args.disable_aether),
        enable_opalescence: enable_or_random(args.disable_opalescence),
        enable_edge_luminance: enable_or_random(args.disable_edge_luminance),
        enable_atmospheric_depth: enable_or_random(args.disable_atmospheric_depth),
        enable_fine_texture: enable_or_random(args.disable_fine_texture),

        // Bloom & Glow parameters
        blur_strength: args.param_blur_strength,
        blur_radius_scale: args.param_blur_radius_scale,
        blur_core_brightness: args.param_blur_core_brightness,
        dog_strength: args.param_dog_strength,
        dog_sigma_scale: args.param_dog_sigma_scale,
        dog_ratio: args.param_dog_ratio,
        glow_strength: args.param_glow_strength,
        glow_threshold: args.param_glow_threshold,
        glow_radius_scale: args.param_glow_radius_scale,
        glow_sharpness: args.param_glow_sharpness,
        glow_saturation_boost: args.param_glow_saturation_boost,

        // Chromatic effects
        chromatic_bloom_strength: args.param_chromatic_bloom_strength,
        chromatic_bloom_radius_scale: args.param_chromatic_bloom_radius_scale,
        chromatic_bloom_separation_scale: args.param_chromatic_bloom_separation_scale,
        chromatic_bloom_threshold: args.param_chromatic_bloom_threshold,

        // Perceptual blur
        perceptual_blur_strength: args.param_perceptual_blur_strength,

        // Color grading
        color_grade_strength: args.param_color_grade_strength,
        vignette_strength: args.param_vignette_strength,
        vignette_softness: args.param_vignette_softness,
        vibrance: args.param_vibrance,
        clarity_strength: args.param_clarity_strength,
        tone_curve_strength: args.param_tone_curve_strength,

        // Gradient mapping
        gradient_map_strength: args.param_gradient_map_strength,
        gradient_map_hue_preservation: args.param_gradient_map_hue_preservation,
        gradient_map_palette: args.param_gradient_map_palette,

        // Opalescence
        opalescence_strength: args.param_opalescence_strength,
        opalescence_scale: args.param_opalescence_scale,
        opalescence_layers: args.param_opalescence_layers,

        // Champlevé
        champleve_flow_alignment: args.param_champleve_flow_alignment,
        champleve_interference_amplitude: args.param_champleve_interference_amplitude,
        champleve_rim_intensity: args.param_champleve_rim_intensity,
        champleve_rim_warmth: args.param_champleve_rim_warmth,
        champleve_interior_lift: args.param_champleve_interior_lift,

        // Aether
        aether_flow_alignment: args.param_aether_flow_alignment,
        aether_scattering_strength: args.param_aether_scattering_strength,
        aether_iridescence_amplitude: args.param_aether_iridescence_amplitude,
        aether_caustic_strength: args.param_aether_caustic_strength,

        // Micro-contrast
        micro_contrast_strength: args.param_micro_contrast_strength,
        micro_contrast_radius: args.param_micro_contrast_radius,

        // Edge luminance
        edge_luminance_strength: args.param_edge_luminance_strength,
        edge_luminance_threshold: args.param_edge_luminance_threshold,
        edge_luminance_brightness_boost: args.param_edge_luminance_brightness_boost,

        // Atmospheric depth
        atmospheric_depth_strength: args.param_atmospheric_depth_strength,
        atmospheric_desaturation: args.param_atmospheric_desaturation,
        atmospheric_darkening: args.param_atmospheric_darkening,
        atmospheric_fog_color_r: args.param_atmospheric_fog_color_r,
        atmospheric_fog_color_g: args.param_atmospheric_fog_color_g,
        atmospheric_fog_color_b: args.param_atmospheric_fog_color_b,

        // Fine texture
        fine_texture_strength: args.param_fine_texture_strength,
        fine_texture_scale: args.param_fine_texture_scale,
        fine_texture_contrast: args.param_fine_texture_contrast,

        // HDR
        hdr_scale: args.param_hdr_scale,

        // Clipping
        clip_black: args.param_clip_black,
        clip_white: args.param_clip_white,

        // Nebula
        nebula_strength: args.param_nebula_strength,
        nebula_octaves: args.param_nebula_octaves,
        nebula_base_frequency: args.param_nebula_base_frequency,
    }
}

fn apply_effect_disable_overrides(
    args: &Args,
    config: &mut render::randomizable_config::ResolvedEffectConfig,
) {
    if args.disable_all_effects {
        config.enable_bloom = false;
        config.enable_glow = false;
        config.enable_chromatic_bloom = false;
        config.enable_perceptual_blur = false;
        config.enable_micro_contrast = false;
        config.enable_gradient_map = false;
        config.enable_color_grade = false;
        config.enable_champleve = false;
        config.enable_aether = false;
        config.enable_opalescence = false;
        config.enable_edge_luminance = false;
        config.enable_atmospheric_depth = false;
        config.enable_fine_texture = false;
        return;
    }

    if args.disable_bloom {
        config.enable_bloom = false;
    }
    if args.disable_glow {
        config.enable_glow = false;
    }
    if args.disable_chromatic_bloom {
        config.enable_chromatic_bloom = false;
    }
    if args.disable_perceptual_blur {
        config.enable_perceptual_blur = false;
    }
    if args.disable_micro_contrast {
        config.enable_micro_contrast = false;
    }
    if args.disable_gradient_map {
        config.enable_gradient_map = false;
    }
    if args.disable_color_grade {
        config.enable_color_grade = false;
    }
    if args.disable_champleve {
        config.enable_champleve = false;
    }
    if args.disable_aether {
        config.enable_aether = false;
    }
    if args.disable_opalescence {
        config.enable_opalescence = false;
    }
    if args.disable_edge_luminance {
        config.enable_edge_luminance = false;
    }
    if args.disable_atmospheric_depth {
        config.enable_atmospheric_depth = false;
    }
    if args.disable_fine_texture {
        config.enable_fine_texture = false;
    }
}

fn build_render_config(
    args: &Args,
    quality_mode: QualityMode,
    resolved_effect_config: &render::randomizable_config::ResolvedEffectConfig,
    effect_budget: render::EffectBudget,
) -> RenderConfig {
    let bloom_mode = match args.bloom_mode.to_ascii_lowercase().as_str() {
        "gaussian" => "gaussian".to_string(),
        _ => "dog".to_string(),
    };
    let hdr_mode = match args.hdr_mode.to_ascii_lowercase().as_str() {
        "off" => "off".to_string(),
        _ => "auto".to_string(),
    };
    let temporal_smoothing_enabled = !args.disable_temporal_smoothing
        && !matches!(quality_mode, QualityMode::Explore)
        && !matches!(effect_budget, render::EffectBudget::Preview);
    let temporal_smoothing_blend = if temporal_smoothing_enabled {
        match (quality_mode, effect_budget) {
            (QualityMode::Strict, render::EffectBudget::Full) => 0.18,
            (QualityMode::Balanced, render::EffectBudget::Full) => 0.13,
            (_, render::EffectBudget::Finalist) => 0.08,
            _ => 0.0,
        }
    } else {
        0.0
    };

    RenderConfig {
        hdr_scale: if hdr_mode == "auto" { resolved_effect_config.hdr_scale } else { 1.0 },
        bloom_mode,
        hdr_mode,
        temporal_smoothing_enabled,
        temporal_smoothing_blend,
        exposure_damping_enabled: !matches!(quality_mode, QualityMode::Explore)
            && !matches!(effect_budget, render::EffectBudget::Preview),
        exposure_damping_rate: if matches!(quality_mode, QualityMode::Strict) {
            0.15
        } else {
            0.20
        },
        output_dither_enabled: !matches!(quality_mode, QualityMode::Explore)
            && matches!(effect_budget, render::EffectBudget::Full),
        effect_budget,
        histogram_fast_mode: !matches!(effect_budget, render::EffectBudget::Full),
    }
}

fn preview_dimensions(width: u32, height: u32) -> (u32, u32) {
    let scale_w = 640.0 / width as f64;
    let scale_h = 360.0 / height as f64;
    let scale = scale_w.min(scale_h).min(1.0);

    let mut w = ((width as f64 * scale).round() as u32).max(64);
    let mut h = ((height as f64 * scale).round() as u32).max(64);
    if w % 2 == 1 {
        w = w.saturating_sub(1);
    }
    if h % 2 == 1 {
        h = h.saturating_sub(1);
    }
    (w.max(2), h.max(2))
}

/// Ultra-cheap screening resolution (roughly 320x180) used for the first
/// pass of two-tier candidate evaluation.  4x fewer pixels than preview.
fn screening_dimensions(width: u32, height: u32) -> (u32, u32) {
    let scale_w = 320.0 / width as f64;
    let scale_h = 180.0 / height as f64;
    let scale = scale_w.min(scale_h).min(1.0);

    let mut w = ((width as f64 * scale).round() as u32).max(64);
    let mut h = ((height as f64 * scale).round() as u32).max(64);
    if w % 2 == 1 {
        w = w.saturating_sub(1);
    }
    if h % 2 == 1 {
        h = h.saturating_sub(1);
    }
    (w.max(2), h.max(2))
}

fn downsample_scene(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    target_steps: usize,
) -> (Vec<Vec<Vector3<f64>>>, Vec<Vec<render::OklabColor>>) {
    if positions.is_empty() || positions[0].is_empty() {
        return (positions.to_vec(), colors.to_vec());
    }

    let total_steps = positions[0].len();
    if total_steps <= target_steps.max(2) {
        return (positions.to_vec(), colors.to_vec());
    }

    let stride = ((total_steps as f64) / target_steps as f64).ceil() as usize;
    let mut indices: Vec<usize> = (0..total_steps).step_by(stride.max(1)).collect();
    if indices.last().copied() != Some(total_steps - 1) {
        indices.push(total_steps - 1);
    }

    let sampled_positions =
        positions.iter().map(|body| indices.iter().map(|&i| body[i]).collect()).collect();
    let sampled_colors =
        colors.iter().map(|body| indices.iter().map(|&i| body[i]).collect()).collect();
    (sampled_positions, sampled_colors)
}

#[allow(clippy::too_many_arguments)]
fn evaluate_candidate(
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    resolved_config: &render::randomizable_config::ResolvedEffectConfig,
    noise_seed: i32,
    render_config: &RenderConfig,
    temporal_prior: (f64, f64, f64),
    novelty_memory: &NoveltyMemory,
) -> Result<(
    crate::curation::quality_score::QualityScores,
    crate::curation::quality_score::FrameFeatures,
    f64,
    f64,
)> {
    let levels = app::build_histogram_and_levels(
        positions,
        colors,
        body_alphas,
        resolved_config,
        noise_seed,
        render_config,
    )?;

    let probe_count = match render_config.effect_budget {
        render::EffectBudget::Screening => 2,
        render::EffectBudget::Preview => 4,
        render::EffectBudget::Finalist => 8,
        render::EffectBudget::Full => 10,
    };
    let probe_frames = render::render_probe_frames_spectral(
        positions,
        colors,
        body_alphas,
        resolved_config,
        levels.black[0],
        levels.range[0] + levels.black[0],
        levels.black[1],
        levels.range[1] + levels.black[1],
        levels.black[2],
        levels.range[2] + levels.black[2],
        noise_seed,
        render_config,
        probe_count,
    )?;

    let frame = if let Some(frame) = probe_frames.first() {
        frame
    } else {
        return Err(std::io::Error::other("probe frame render returned no frames").into());
    };

    let (mut scores, features) = score_image_frame(frame, resolved_config);
    let novelty_score = novelty_memory.score_candidate(&features);

    let probe_temporal = score_temporal_probe_frames(&probe_frames);
    let temporal_stability = (0.25 * temporal_prior.0 + 0.75 * probe_temporal.0).clamp(0.0, 1.0);
    let motion_smoothness = (0.25 * temporal_prior.1 + 0.75 * probe_temporal.1).clamp(0.0, 1.0);
    let exposure_consistency = (0.25 * temporal_prior.2 + 0.75 * probe_temporal.2).clamp(0.0, 1.0);
    apply_video_and_novelty(
        &mut scores,
        temporal_stability,
        motion_smoothness,
        exposure_consistency,
        novelty_score,
    );

    let composite = composite_score(&scores, novelty_score);
    Ok((scores, features, novelty_score, composite))
}

#[allow(clippy::too_many_arguments)]
fn evaluate_candidate_still_cached(
    accum_spd: &[[f64; crate::spectrum::NUM_BINS]],
    total_steps: usize,
    resolved_config: &render::randomizable_config::ResolvedEffectConfig,
    noise_seed: i32,
    render_config: &RenderConfig,
    novelty_memory: &NoveltyMemory,
    temporal_prior: Option<(f64, f64, f64)>,
) -> Result<(
    crate::curation::quality_score::QualityScores,
    crate::curation::quality_score::FrameFeatures,
    f64,
    f64,
)> {
    let frame = render::render_still_from_accum_spd_spectral(
        accum_spd,
        total_steps,
        resolved_config,
        noise_seed,
        render_config,
    )?;

    let (mut scores, features) = score_image_frame(&frame, resolved_config);
    let novelty_score = novelty_memory.score_candidate(&features);

    // Use provided temporal prior or treat as fully stable (still mode).
    let (ts, ms, ec) = temporal_prior.unwrap_or((1.0, 1.0, 1.0));
    apply_video_and_novelty(&mut scores, ts, ms, ec, novelty_score);

    let composite = composite_score(&scores, novelty_score);
    Ok((scores, features, novelty_score, composite))
}

#[allow(clippy::too_many_arguments)]
fn run_curation_search(
    args: &Args,
    curation_options: &CurationOptions,
    rng: &mut Sha3RandomByteStream,
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    noise_seed: i32,
    novelty_memory: &mut NoveltyMemory,
) -> Result<(CandidateEvaluation, CurationSummary)> {
    if args.no_video {
        return run_curation_search_still(
            args,
            curation_options,
            rng,
            positions,
            colors,
            body_alphas,
            noise_seed,
            novelty_memory,
        );
    }

    const PREVIEW_TARGET_STEPS: usize = 12_000;
    const FINALIST_TARGET_STEPS: usize = 36_000;
    const EPSILON_EXPLORATION: f64 = 0.25;
    const MAX_PERIMETER_SPECKLE_PENALTY: f64 = 0.0;
    const MIN_NEBULA_VISIBILITY_SCORE: f64 = 0.22;
    const MAX_NEBULA_DOMINANCE_PENALTY: f64 = 0.35;
    /// Stop evaluating preview candidates once one scores above this threshold.
    const EARLY_EXIT_SCORE: f64 = 0.92;

    const SCREENING_TARGET_STEPS: usize = 6_000;

    // Pin hdr_scale during preview to enable SPD buffer caching (same strategy
    // as the still-mode path).  Candidates only differ in post-processing.
    let fixed_hdr_scale = args.param_hdr_scale.unwrap_or(0.12);

    let (screening_width, screening_height) = screening_dimensions(args.width, args.height);
    let (preview_width, preview_height) = preview_dimensions(args.width, args.height);
    let (screening_positions, screening_colors) =
        downsample_scene(positions, colors, SCREENING_TARGET_STEPS);
    let (preview_positions, preview_colors) =
        downsample_scene(positions, colors, PREVIEW_TARGET_STEPS);
    let (final_positions, final_colors) =
        downsample_scene(positions, colors, FINALIST_TARGET_STEPS);

    let preview_temporal = estimate_temporal_scores(&preview_positions);
    let final_temporal = estimate_temporal_scores(&final_positions);

    let screening_steps = screening_positions.first().map(|b| b.len()).unwrap_or(0);
    let preview_steps = preview_positions.first().map(|b| b.len()).unwrap_or(0);

    /// Number of top candidates promoted from screening to preview tier.
    const SCREENING_PROMOTE_COUNT: usize = 4;

    // ── Pre-compute geometry (SPD) buffers once ──
    // Screening tier: ultra-low resolution for fast ranking.
    let mut screening_spd = render::accumulate_spd_buffer_spectral(
        &screening_positions,
        &screening_colors,
        body_alphas,
        screening_width,
        screening_height,
        fixed_hdr_scale,
        args.special,
    );
    render::apply_energy_density_shift_inplace(&mut screening_spd, args.special);

    // Preview tier: moderate resolution for accurate scoring of promoted candidates.
    let mut preview_spd = render::accumulate_spd_buffer_spectral(
        &preview_positions,
        &preview_colors,
        body_alphas,
        preview_width,
        preview_height,
        fixed_hdr_scale,
        args.special,
    );
    render::apply_energy_density_shift_inplace(&mut preview_spd, args.special);

    let mut total_candidates = 0usize;
    let mut finalists_considered = 0usize;
    let mut family_stats: HashMap<String, (usize, usize)> = HashMap::new();

    let mut round_id = 0usize;
    loop {
        round_id = round_id.saturating_add(1);
        if round_id == curation_options.max_curation_rounds.saturating_add(1) {
            warn!(
                "No candidate met strict acceptance gates after {} rounds; continuing rerolls until one passes.",
                curation_options.max_curation_rounds
            );
        }
        info!(
            "Curation round {}/{} (preview candidates: {})",
            round_id,
            curation_options.max_curation_rounds,
            curation_options.candidate_count_preview
        );

        // ── Phase 1: generate candidate configs (fast, sequential, RNG-dependent) ──
        let count = curation_options.candidate_count_preview;
        let allow_repair = curation_options.allow_repair_pass;
        let quality_mode = curation_options.quality_mode;

        struct CandidateSpec {
            candidate_id: usize,
            resolved_config: render::randomizable_config::ResolvedEffectConfig,
            randomization_log: render::effect_randomizer::RandomizationLog,
            style_family_name: String,
            repair_actions: Vec<String>,
        }

        let mut specs = Vec::with_capacity(count);
        for _ in 1..=count {
            total_candidates += 1;
            let candidate_id = total_candidates;

            // Retry loop: regenerate config when the config-only pre-filter
            // detects that the candidate cannot possibly meet acceptance gates.
            const MAX_REJECT_RETRIES: usize = 5;
            let mut resolved_config;
            let mut randomization_log;
            let mut style_family;
            let mut style_repair_actions;
            let mut retries = 0usize;
            loop {
                let randomizable_config =
                    build_randomizable_config(args, quality_mode);
                let resolved = randomizable_config.resolve(rng, preview_width, preview_height, args.special);
                resolved_config = resolved.0;
                randomization_log = resolved.1;

                style_family = if let Some(explicit) = curation_options.style_family.as_deref() {
                    resolve_style_family(Some(explicit), rng)
                } else if rng.next_f64() < EPSILON_EXPLORATION || family_stats.is_empty() {
                    StyleFamily::random(rng)
                } else {
                    let mut best_family = StyleFamily::random(rng);
                    let mut best_score = f64::MIN;
                    for family in StyleFamily::all() {
                        let (attempts, successes) =
                            family_stats.get(family.name()).copied().unwrap_or((0, 0));
                        let score = if attempts == 0 {
                            1.0
                        } else {
                            (successes as f64 + 1.0) / (attempts as f64 + 2.0)
                        };
                        if score > best_score {
                            best_score = score;
                            best_family = family;
                        }
                    }
                    best_family
                };
                style_repair_actions = apply_style_family(
                    &mut resolved_config,
                    style_family,
                    rng,
                    quality_mode,
                );
                resolved_config.hdr_scale = fixed_hdr_scale;
                apply_effect_disable_overrides(args, &mut resolved_config);

                if retries >= MAX_REJECT_RETRIES
                    || !quick_reject_config(&resolved_config, curation_options.min_image_score)
                {
                    break;
                }
                retries += 1;
            }

            let style_key = style_family.name().to_string();
            family_stats
                .entry(style_key.clone())
                .and_modify(|entry| entry.0 += 1)
                .or_insert((1, 0));
            let mut repair_actions = style_repair_actions;
            if retries > 0 {
                repair_actions.push(format!("config_prefilter_retried_{retries}"));
            }

            specs.push(CandidateSpec {
                candidate_id,
                resolved_config,
                randomization_log,
                style_family_name: style_family.name().to_string(),
                repair_actions,
            });
        }

        // ── Phase 2a: SCREENING – evaluate all candidates at low resolution ──
        // Uses Screening budget (expensive effects disabled) + small SPD buffer.
        let screening_candidates: Vec<CandidateEvaluation> = specs
            .into_par_iter()
            .map(|spec| {
                let mut screening_config = spec.resolved_config.clone();
                screening_config.width = screening_width;
                screening_config.height = screening_height;
                let render_config = build_render_config(
                    args,
                    quality_mode,
                    &screening_config,
                    render::EffectBudget::Screening,
                );
                let (scores, features, novelty_score, composite) =
                    evaluate_candidate_still_cached(
                        &screening_spd,
                        screening_steps,
                        &screening_config,
                        noise_seed,
                        &render_config,
                        novelty_memory,
                        Some(preview_temporal),
                    )?;
                Ok(CandidateEvaluation {
                    round_id,
                    candidate_id: spec.candidate_id,
                    style_family: spec.style_family_name,
                    config: spec.resolved_config,
                    randomization_log: spec.randomization_log,
                    scores,
                    features,
                    novelty_score,
                    composite_score: composite,
                    repair_actions: spec.repair_actions,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        for (i, evaluation) in screening_candidates.iter().enumerate() {
            info!(
                "  Screening candidate {}/{} -> score {:.3} (image {:.3})",
                i + 1,
                count,
                evaluation.composite_score,
                evaluation.scores.image_composite,
            );
        }

        // ── Phase 2b: PREVIEW – promote top candidates to higher-fidelity evaluation ──
        let promote_count = SCREENING_PROMOTE_COUNT.min(screening_candidates.len());
        let promoted = choose_finalists(screening_candidates, promote_count);

        // Re-evaluate promoted candidates at full preview resolution with
        // Preview budget (more effects enabled, higher resolution).
        let preview_candidates: Vec<CandidateEvaluation> = promoted
            .into_par_iter()
            .map(|mut cand| {
                cand.config.width = preview_width;
                cand.config.height = preview_height;
                let render_config = build_render_config(
                    args,
                    quality_mode,
                    &cand.config,
                    render::EffectBudget::Preview,
                );
                let (mut scores, mut features, mut novelty_score, mut composite) =
                    evaluate_candidate_still_cached(
                        &preview_spd,
                        preview_steps,
                        &cand.config,
                        noise_seed,
                        &render_config,
                        novelty_memory,
                        Some(preview_temporal),
                    )?;

                if allow_repair && (0.70..0.80).contains(&composite) {
                    let mut repaired_config = cand.config.clone();
                    repaired_config.hdr_scale = fixed_hdr_scale;
                    let mut suggested_repairs = repair_candidate(&mut repaired_config, &scores);
                    if !suggested_repairs.is_empty() {
                        apply_effect_disable_overrides(args, &mut repaired_config);
                        let repaired_render_config = build_render_config(
                            args,
                            quality_mode,
                            &repaired_config,
                            render::EffectBudget::Preview,
                        );
                        let (repaired_scores, repaired_features, repaired_novelty, repaired_composite) =
                            evaluate_candidate_still_cached(
                                &preview_spd,
                                preview_steps,
                                &repaired_config,
                                noise_seed,
                                &repaired_render_config,
                                novelty_memory,
                                Some(preview_temporal),
                            )?;

                        if repaired_composite > composite {
                            cand.config = repaired_config;
                            scores = repaired_scores;
                            features = repaired_features;
                            novelty_score = repaired_novelty;
                            composite = repaired_composite;
                            cand.repair_actions.append(&mut suggested_repairs);
                        }
                    }
                }

                cand.scores = scores;
                cand.features = features;
                cand.novelty_score = novelty_score;
                cand.composite_score = composite;
                Ok(cand)
            })
            .collect::<Result<Vec<_>>>()?;

        for (i, evaluation) in preview_candidates.iter().enumerate() {
            info!(
                "  Preview candidate {}/{} -> score {:.3} (image {:.3}, video {:.3}, novelty {:.3})",
                i + 1,
                promote_count,
                evaluation.composite_score,
                evaluation.scores.image_composite,
                evaluation.scores.video_composite,
                evaluation.novelty_score
            );
        }
        if let Some(best) = preview_candidates.iter().max_by(|a, b| {
            a.composite_score.partial_cmp(&b.composite_score).unwrap_or(std::cmp::Ordering::Equal)
        }) {
            if best.composite_score >= EARLY_EXIT_SCORE {
                info!(
                    "  Early exit: best candidate scored {:.3} >= {:.3}",
                    best.composite_score, EARLY_EXIT_SCORE
                );
            }
        }

        let mut finalists = choose_finalists(preview_candidates, curation_options.finalist_count);
        finalists_considered += finalists.len();

        // ── Phase 3: re-render finalists with full probe frames for accurate temporal scoring ──
        for finalist in &mut finalists {
            finalist.config.width = args.width;
            finalist.config.height = args.height;
            apply_effect_disable_overrides(args, &mut finalist.config);
        }

        let finalist_results: Vec<_> = finalists
            .par_iter()
            .map(|finalist| {
                let finalist_render_config = build_render_config(
                    args,
                    quality_mode,
                    &finalist.config,
                    render::EffectBudget::Full,
                );
                evaluate_candidate(
                    &final_positions,
                    &final_colors,
                    body_alphas,
                    &finalist.config,
                    noise_seed,
                    &finalist_render_config,
                    final_temporal,
                    novelty_memory,
                )
            })
            .collect::<Vec<_>>();

        for (finalist, result) in finalists.iter_mut().zip(finalist_results.into_iter()) {
            let (scores, features, novelty_score, composite) = result?;
            finalist.scores = scores;
            finalist.features = features;
            finalist.novelty_score = novelty_score;
            finalist.composite_score = composite;
        }

        if let Some(round_winner) = pick_winner(&finalists) {
            if let Some(stats) = family_stats.get_mut(&round_winner.style_family) {
                stats.1 += 1;
            }

            if accept_candidate(
                &round_winner,
                curation_options.min_image_score,
                curation_options.min_video_score,
                curation_options.min_novelty_score,
                MAX_PERIMETER_SPECKLE_PENALTY,
                MIN_NEBULA_VISIBILITY_SCORE,
                MAX_NEBULA_DOMINANCE_PENALTY,
            ) {
                novelty_memory.remember(round_winner.features.clone());
                let summary = CurationSummary {
                    quality_mode: curation_options.quality_mode.as_str().to_string(),
                    rounds_used: round_id,
                    accepted: true,
                    total_candidates,
                    finalists_considered,
                    rejection_reason: None,
                };
                return Ok((round_winner, summary));
            }
            warn!(
                "Round {} winner rejected: image={:.3} (<{:.3}) video={:.3} (<{:.3}) novelty={:.3} (<{:.3}) perimeter_penalty={:.4} (>{:.4}) nebula_visibility={:.3} (<{:.3}) nebula_dominance={:.3} (>{:.3})",
                round_id,
                round_winner.scores.image_composite,
                curation_options.min_image_score,
                round_winner.scores.video_composite,
                curation_options.min_video_score,
                round_winner.novelty_score,
                curation_options.min_novelty_score,
                round_winner.scores.perimeter_speckle_penalty,
                MAX_PERIMETER_SPECKLE_PENALTY,
                round_winner.scores.nebula_visibility_score,
                MIN_NEBULA_VISIBILITY_SCORE,
                round_winner.scores.nebula_dominance_penalty,
                MAX_NEBULA_DOMINANCE_PENALTY,
            );
        } else {
            warn!("Round {} produced no finalists; rerolling.", round_id);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_curation_search_still(
    args: &Args,
    curation_options: &CurationOptions,
    rng: &mut Sha3RandomByteStream,
    positions: &[Vec<Vector3<f64>>],
    colors: &[Vec<render::OklabColor>],
    body_alphas: &[f64],
    noise_seed: i32,
    novelty_memory: &mut NoveltyMemory,
) -> Result<(CandidateEvaluation, CurationSummary)> {
    const PREVIEW_TARGET_STEPS: usize = 12_000;
    const FINALIST_TARGET_STEPS: usize = 36_000;
    const EPSILON_EXPLORATION: f64 = 0.25;
    const MAX_PERIMETER_SPECKLE_PENALTY: f64 = 0.0;
    const MIN_NEBULA_VISIBILITY_SCORE: f64 = 0.22;
    const MAX_NEBULA_DOMINANCE_PENALTY: f64 = 0.35;
    /// Stop evaluating preview candidates once one scores above this threshold.
    const EARLY_EXIT_SCORE: f64 = 0.92;

    let fixed_hdr_scale = args.param_hdr_scale.unwrap_or(0.12);

    let (preview_width, preview_height) = preview_dimensions(args.width, args.height);
    let (preview_positions, preview_colors) =
        downsample_scene(positions, colors, PREVIEW_TARGET_STEPS);
    let (final_positions, final_colors) = downsample_scene(positions, colors, FINALIST_TARGET_STEPS);

    let preview_steps = preview_positions.first().map(|b| b.len()).unwrap_or(0);
    let final_steps = final_positions.first().map(|b| b.len()).unwrap_or(0);

    // Geometry pass caches (spectral space), re-used across all effect candidates.
    let mut preview_spd = render::accumulate_spd_buffer_spectral(
        &preview_positions,
        &preview_colors,
        body_alphas,
        preview_width,
        preview_height,
        fixed_hdr_scale,
        args.special,
    );
    render::apply_energy_density_shift_inplace(&mut preview_spd, args.special);

    let mut final_spd = render::accumulate_spd_buffer_spectral(
        &final_positions,
        &final_colors,
        body_alphas,
        args.width,
        args.height,
        fixed_hdr_scale,
        args.special,
    );
    render::apply_energy_density_shift_inplace(&mut final_spd, args.special);

    let mut total_candidates = 0usize;
    let mut finalists_considered = 0usize;
    let mut family_stats: HashMap<String, (usize, usize)> = HashMap::new();

    let mut round_id = 0usize;
    loop {
        round_id = round_id.saturating_add(1);
        if round_id == curation_options.max_curation_rounds.saturating_add(1) {
            warn!(
                "No candidate met strict acceptance gates after {} rounds; continuing rerolls until one passes.",
                curation_options.max_curation_rounds
            );
        }
        info!(
            "Curation round {}/{} (preview candidates: {}) [still mode]",
            round_id,
            curation_options.max_curation_rounds,
            curation_options.candidate_count_preview
        );

        // ── Phase 1: generate candidate configs (fast, sequential, RNG-dependent) ──
        let count = curation_options.candidate_count_preview;
        let allow_repair = curation_options.allow_repair_pass;
        let quality_mode = curation_options.quality_mode;

        struct CandidateSpec {
            candidate_id: usize,
            resolved_config: render::randomizable_config::ResolvedEffectConfig,
            randomization_log: render::effect_randomizer::RandomizationLog,
            style_family_name: String,
            repair_actions: Vec<String>,
        }

        let mut specs = Vec::with_capacity(count);
        for _ in 1..=count {
            total_candidates += 1;
            let candidate_id = total_candidates;

            // Retry loop: regenerate config when the config-only pre-filter
            // detects that the candidate cannot possibly meet acceptance gates.
            const MAX_REJECT_RETRIES: usize = 5;
            let mut resolved_config;
            let mut randomization_log;
            let mut style_family;
            let mut style_repair_actions;
            let mut retries = 0usize;
            loop {
                let randomizable_config = build_randomizable_config(args, quality_mode);
                let resolved = randomizable_config.resolve(rng, preview_width, preview_height, args.special);
                resolved_config = resolved.0;
                randomization_log = resolved.1;

                style_family = if let Some(explicit) = curation_options.style_family.as_deref() {
                    resolve_style_family(Some(explicit), rng)
                } else if rng.next_f64() < EPSILON_EXPLORATION || family_stats.is_empty() {
                    StyleFamily::random(rng)
                } else {
                    let mut best_family = StyleFamily::random(rng);
                    let mut best_score = f64::MIN;
                    for family in StyleFamily::all() {
                        let (attempts, successes) =
                            family_stats.get(family.name()).copied().unwrap_or((0, 0));
                        let score = if attempts == 0 {
                            1.0
                        } else {
                            (successes as f64 + 1.0) / (attempts as f64 + 2.0)
                        };
                        if score > best_score {
                            best_score = score;
                            best_family = family;
                        }
                    }
                    best_family
                };

                style_repair_actions = apply_style_family(
                    &mut resolved_config,
                    style_family,
                    rng,
                    quality_mode,
                );
                // Keep HDR scale stable for still-mode caching.
                resolved_config.hdr_scale = fixed_hdr_scale;
                apply_effect_disable_overrides(args, &mut resolved_config);

                if retries >= MAX_REJECT_RETRIES
                    || !quick_reject_config(&resolved_config, curation_options.min_image_score)
                {
                    break;
                }
                retries += 1;
            }

            let style_key = style_family.name().to_string();
            family_stats
                .entry(style_key.clone())
                .and_modify(|entry| entry.0 += 1)
                .or_insert((1, 0));

            let mut repair_actions = style_repair_actions;
            if retries > 0 {
                repair_actions.push(format!("config_prefilter_retried_{retries}"));
            }

            specs.push(CandidateSpec {
                candidate_id,
                resolved_config,
                randomization_log,
                style_family_name: style_family.name().to_string(),
                repair_actions,
            });
        }

        // ── Phase 2: evaluate candidates in parallel (expensive rendering + scoring) ──
        let preview_candidates: Vec<CandidateEvaluation> = specs
            .into_par_iter()
            .map(|mut spec| {
                let render_config = build_render_config(
                    args,
                    quality_mode,
                    &spec.resolved_config,
                    render::EffectBudget::Preview,
                );

                let (mut scores, mut features, mut novelty_score, mut composite) =
                    evaluate_candidate_still_cached(
                        &preview_spd,
                        preview_steps,
                        &spec.resolved_config,
                        noise_seed,
                        &render_config,
                        novelty_memory,
                        None,
                    )?;

                if allow_repair && (0.70..0.80).contains(&composite) {
                    let mut repaired_config = spec.resolved_config.clone();
                    repaired_config.hdr_scale = fixed_hdr_scale;

                    let mut suggested_repairs = repair_candidate(&mut repaired_config, &scores);
                    if !suggested_repairs.is_empty() {
                        apply_effect_disable_overrides(args, &mut repaired_config);
                        let repaired_render_config = build_render_config(
                            args,
                            quality_mode,
                            &repaired_config,
                            render::EffectBudget::Preview,
                        );
                        let (repaired_scores, repaired_features, repaired_novelty, repaired_composite) =
                            evaluate_candidate_still_cached(
                                &preview_spd,
                                preview_steps,
                                &repaired_config,
                                noise_seed,
                                &repaired_render_config,
                                novelty_memory,
                                None,
                            )?;

                        if repaired_composite > composite {
                            spec.resolved_config = repaired_config;
                            scores = repaired_scores;
                            features = repaired_features;
                            novelty_score = repaired_novelty;
                            composite = repaired_composite;
                            spec.repair_actions.append(&mut suggested_repairs);
                        }
                    }
                }

                Ok(CandidateEvaluation {
                    round_id,
                    candidate_id: spec.candidate_id,
                    style_family: spec.style_family_name,
                    config: spec.resolved_config,
                    randomization_log: spec.randomization_log,
                    scores,
                    features,
                    novelty_score,
                    composite_score: composite,
                    repair_actions: spec.repair_actions,
                })
            })
            .collect::<Result<Vec<_>>>()?;

        for (i, evaluation) in preview_candidates.iter().enumerate() {
            info!(
                "  Preview candidate {}/{} -> score {:.3} (image {:.3}, novelty {:.3})",
                i + 1,
                count,
                evaluation.composite_score,
                evaluation.scores.image_composite,
                evaluation.novelty_score
            );
        }
        if let Some(best) = preview_candidates.iter().max_by(|a, b| {
            a.composite_score.partial_cmp(&b.composite_score).unwrap_or(std::cmp::Ordering::Equal)
        }) {
            if best.composite_score >= EARLY_EXIT_SCORE {
                info!(
                    "  Early exit: best candidate scored {:.3} >= {:.3}",
                    best.composite_score, EARLY_EXIT_SCORE
                );
            }
        }

        let mut finalists = choose_finalists(preview_candidates, curation_options.finalist_count);
        finalists_considered += finalists.len();

        // ── Phase 3: re-render finalists at full resolution in parallel ──
        for finalist in &mut finalists {
            finalist.config.width = args.width;
            finalist.config.height = args.height;
            finalist.config.hdr_scale = fixed_hdr_scale;
            apply_effect_disable_overrides(args, &mut finalist.config);
        }

        let finalist_results: Vec<_> = finalists
            .par_iter()
            .map(|finalist| {
                let finalist_render_config = build_render_config(
                    args,
                    quality_mode,
                    &finalist.config,
                    render::EffectBudget::Full,
                );
                evaluate_candidate_still_cached(
                    &final_spd,
                    final_steps,
                    &finalist.config,
                    noise_seed,
                    &finalist_render_config,
                    novelty_memory,
                    None,
                )
            })
            .collect::<Vec<_>>();

        for (finalist, result) in finalists.iter_mut().zip(finalist_results.into_iter()) {
            let (scores, features, novelty_score, composite) = result?;
            finalist.scores = scores;
            finalist.features = features;
            finalist.novelty_score = novelty_score;
            finalist.composite_score = composite;
        }

        if let Some(round_winner) = pick_winner(&finalists) {
            if let Some(stats) = family_stats.get_mut(&round_winner.style_family) {
                stats.1 += 1;
            }

            if accept_candidate(
                &round_winner,
                curation_options.min_image_score,
                0.0, // still mode: ignore video gating
                curation_options.min_novelty_score,
                MAX_PERIMETER_SPECKLE_PENALTY,
                MIN_NEBULA_VISIBILITY_SCORE,
                MAX_NEBULA_DOMINANCE_PENALTY,
            ) {
                novelty_memory.remember(round_winner.features.clone());
                let summary = CurationSummary {
                    quality_mode: curation_options.quality_mode.as_str().to_string(),
                    rounds_used: round_id,
                    accepted: true,
                    total_candidates,
                    finalists_considered,
                    rejection_reason: None,
                };
                return Ok((round_winner, summary));
            }

            warn!(
                "Round {} winner rejected: image={:.3} (<{:.3}) novelty={:.3} (<{:.3}) perimeter_penalty={:.4} (>{:.4}) nebula_visibility={:.3} (<{:.3}) nebula_dominance={:.3} (>{:.3})",
                round_id,
                round_winner.scores.image_composite,
                curation_options.min_image_score,
                round_winner.novelty_score,
                curation_options.min_novelty_score,
                round_winner.scores.perimeter_speckle_penalty,
                MAX_PERIMETER_SPECKLE_PENALTY,
                round_winner.scores.nebula_visibility_score,
                MIN_NEBULA_VISIBILITY_SCORE,
                round_winner.scores.nebula_dominance_penalty,
                MAX_NEBULA_DOMINANCE_PENALTY,
            );
        } else {
            warn!("Round {} produced no finalists; rerolling.", round_id);
        }
    }
}

struct SelectedCuration {
    resolved_effect_config: render::randomizable_config::ResolvedEffectConfig,
    randomization_log: render::effect_randomizer::RandomizationLog,
    style_family: Option<String>,
    candidate_id: Option<usize>,
    round_id: Option<usize>,
    quality_scores: Option<crate::curation::quality_score::QualityScores>,
    frame_features: Option<crate::curation::quality_score::FrameFeatures>,
    novelty_score: Option<f64>,
    repair_actions: Vec<String>,
    curation_summary: CurationSummary,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let total_start = Instant::now();

    // Initialize tracing
    setup_logging(args.json_logs, &args.log_level);
    let curation_options = build_curation_options(&args);
    info!("Quality mode: {}", curation_options.quality_mode.as_str());

    // Determine number of simulations
    let num_sims = args.num_sims.unwrap_or(100_000);

    // Setup
    app::setup_directories()?;
    error::validation::validate_dimensions(args.width, args.height)?;

    let seed_bytes = app::parse_seed(&args.seed)?;
    let hex_seed = if args.seed.starts_with("0x") { &args.seed[2..] } else { &args.seed };
    let noise_seed = app::derive_noise_seed(&seed_bytes);

    let mut rng = Sha3RandomByteStream::new(
        &seed_bytes,
        args.min_mass,
        args.max_mass,
        args.location,
        args.velocity,
    );

    let fast_mode = args.no_curation
        || args.effect_profile_in.is_some()
        || args.effect_profile_out.is_some()
        || args.orbit_in.is_some()
        || args.orbit_out.is_some()
        || args.orbit_from_log.is_some()
        || args.effect_from_log.is_some()
        || args.variants != 1
        || args.variant_start != 0;

    if !fast_mode {
        // Stage 1: Borda selection
        let stage_1_start = Instant::now();
        let (best_bodies, best_info, orbit_selected_index, orbit_discarded_count) =
            app::run_borda_selection(
                &mut rng,
                num_sims,
                args.num_steps_sim,
                args.chaos_weight,
                args.equil_weight,
                args.escape_threshold,
            )?;
        log_stage_telemetry("stage_1_borda", stage_1_start);

        // Stage 2: Re-run best orbit
        let stage_2_start = Instant::now();
        let best_bodies_for_log = best_bodies.clone();
        let mut positions = app::simulate_best_orbit(best_bodies, args.num_steps_sim);
        log_stage_telemetry("stage_2_resimulate", stage_2_start);

        // Stage 2.5: Apply drift (if enabled)
        let stage_25_start = Instant::now();
        let drift_config = if !args.no_drift {
            app::apply_drift_transformation(
                &mut positions,
                &args.drift_mode,
                args.drift_scale,
                args.drift_arc_fraction,
                args.drift_orbit_eccentricity,
                &mut rng,
                args.special,
            )
        } else {
            info!("STAGE 2.5/7: Drift disabled (--no-drift flag)");
            None
        };
        log_stage_telemetry("stage_2_5_drift", stage_25_start);

        // Stage 3: Generate colors
        let stage_3_start = Instant::now();
        let (colors, body_alphas) =
            app::generate_colors(&mut rng, args.num_steps_sim, args.alpha_denom, args.alpha_compress);
        log_stage_telemetry("stage_3_color_generation", stage_3_start);

        let mut novelty_memory = NoveltyMemory::new(64);
        let historical_features = generation_log::load_recent_frame_features(64);
        for feature in historical_features {
            novelty_memory.remember(feature);
        }
        if novelty_memory.len() > 0 {
            info!(
                "Loaded {} prior frame signatures for novelty gating.",
                novelty_memory.len()
            );
        }

        let stage_curation_start = Instant::now();
        let selected = if matches!(curation_options.quality_mode, QualityMode::Explore) {
            info!("Explore mode selected: using single-pass randomization without strict curation.");
            let randomizable_config = build_randomizable_config(&args, curation_options.quality_mode);
            let (mut resolved_effect_config, randomization_log) =
                randomizable_config.resolve(&mut rng, args.width, args.height, args.special);
            apply_effect_disable_overrides(&args, &mut resolved_effect_config);
            SelectedCuration {
                resolved_effect_config,
                randomization_log,
                style_family: None,
                candidate_id: None,
                round_id: None,
                quality_scores: None,
                frame_features: None,
                novelty_score: None,
                repair_actions: Vec::new(),
                curation_summary: CurationSummary {
                    quality_mode: curation_options.quality_mode.as_str().to_string(),
                    rounds_used: 1,
                    accepted: true,
                    total_candidates: 1,
                    finalists_considered: 1,
                    rejection_reason: None,
                },
            }
        } else {
            info!("Running curated candidate search...");
            let (winner, summary) = run_curation_search(
                &args,
                &curation_options,
                &mut rng,
                &positions,
                &colors,
                &body_alphas,
                noise_seed,
                &mut novelty_memory,
            )?;
            SelectedCuration {
                resolved_effect_config: winner.config,
                randomization_log: winner.randomization_log,
                style_family: Some(winner.style_family),
                candidate_id: Some(winner.candidate_id),
                round_id: Some(winner.round_id),
                quality_scores: Some(winner.scores),
                frame_features: Some(winner.features),
                novelty_score: Some(winner.novelty_score),
                repair_actions: winner.repair_actions,
                curation_summary: summary,
            }
        };
        log_stage_telemetry("stage_3_5_curation", stage_curation_start);

        let num_randomized = selected
            .randomization_log
            .effects
            .iter()
            .map(|e| e.parameters.iter().filter(|p| p.was_randomized).count())
            .sum::<usize>();

        info!(
            "Resolved {} effects ({} parameters randomized, {} explicit)",
            selected.randomization_log.effects.len(),
            num_randomized,
            selected
                .randomization_log
                .effects
                .iter()
                .map(|e| e.parameters.len())
                .sum::<usize>()
                .saturating_sub(num_randomized)
        );
        if let Some(style_family) = &selected.style_family {
            info!("Selected style family: {}", style_family);
        }
        info!(
            "Curation summary: rounds={}, accepted={}, candidates={}, finalists={}",
            selected.curation_summary.rounds_used,
            selected.curation_summary.accepted,
            selected.curation_summary.total_candidates,
            selected.curation_summary.finalists_considered
        );
        if let Some(reason) = &selected.curation_summary.rejection_reason {
            warn!("Curation fallback reason: {reason}");
        }
        if let Some(scores) = &selected.quality_scores {
            info!(
                "Selected quality scores: image={:.3}, video={:.3}, final={:.3}, perimeter_penalty={:.4}, nebula_visibility={:.3}, nebula_dominance={:.3}, nebula_signal_ratio={:.3}",
                scores.image_composite,
                scores.video_composite,
                scores.final_composite,
                scores.perimeter_speckle_penalty,
                scores.nebula_visibility_score,
                scores.nebula_dominance_penalty,
                scores.nebula_signal_ratio
            );
        }
        if args.gallery_quality {
            info!("Gallery quality mode enabled (conservative randomization ranges).");
        }

        // Stage 4: Bounding box
        info!("STAGE 4/7: Determining bounding box...");
        let render_ctx = render::context::RenderContext::new(args.width, args.height, &positions);
        let bbox = render_ctx.bounds();
        info!(
            "   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]",
            bbox.min_x, bbox.max_x, bbox.min_y, bbox.max_y
        );

        // Configure rendering from resolved parameters
        let render_config = build_render_config(
            &args,
            curation_options.quality_mode,
            &selected.resolved_effect_config,
            render::EffectBudget::Full,
        );

        let levels = if args.no_video && !args.test_frame {
            None
        } else {
            // Stage 5-6: Build histogram and compute levels
            let stage_56_start = Instant::now();
            let levels = app::build_histogram_and_levels(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                noise_seed,
                &render_config,
            )?;
            log_stage_telemetry("stage_5_6_histogram_levels", stage_56_start);
            Some(levels)
        };

        let base_filename = app::generate_filename(&args.file_name, &args.profile_tag);
        let output_png = format!("pics/{}.png", base_filename);

        // Stage 7: Render
        let stage_7_start = Instant::now();
        if args.test_frame {
            app::render_test_frame(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                levels.as_ref().expect("levels required for test frame"),
                noise_seed,
                &render_config,
                &output_png,
                &best_info,
            )?;
        } else if args.no_video {
            app::render_still(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                noise_seed,
                &render_config,
                &output_png,
                &best_info,
            )?;
        } else {
            // Normal mode: Render full video
            let output_vid = format!("vids/{}.mp4", base_filename);

            app::render_video(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                levels.as_ref().expect("levels required for video render"),
                noise_seed,
                &render_config,
                &output_vid,
                &output_png,
                args.fast_encode,
            )?;

            if args.save_master && matches!(curation_options.quality_mode, QualityMode::Strict) {
                fs::create_dir_all("masters")?;
                let master_png = format!("masters/{}_master.png", base_filename);
                let master_vid = format!("masters/{}_master.mp4", base_filename);
                fs::copy(&output_png, &master_png)?;
                fs::copy(&output_vid, &master_vid)?;
                info!("Saved archival master outputs: {}, {}", master_png, master_vid);
            }
        }
        log_stage_telemetry("stage_7_render", stage_7_start);

        info!(
            "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
            best_info.total_score_weighted
        );

        // Log generation parameters for reproducibility
        let app_config = app::AppConfig {
            seed: args.seed.clone(),
            file_name: args.file_name.clone(),
            num_sims,
            num_steps_sim: args.num_steps_sim,
            width: args.width,
            height: args.height,
            special: args.special,
            test_frame: args.test_frame,
            clip_black: selected.resolved_effect_config.clip_black,
            clip_white: selected.resolved_effect_config.clip_white,
            alpha_denom: args.alpha_denom,
            alpha_compress: args.alpha_compress,
            escape_threshold: args.escape_threshold,
            drift_enabled: !args.no_drift,
            drift_mode: args.drift_mode.clone(),
            drift_scale: args.drift_scale,
            drift_arc_fraction: args.drift_arc_fraction,
            drift_orbit_eccentricity: args.drift_orbit_eccentricity,
            profile_tag: args.profile_tag.clone(),
            bloom_mode: args.bloom_mode.clone(),
            dog_strength: args.dog_strength,
            dog_sigma: args.dog_sigma,
            dog_ratio: args.dog_ratio,
            hdr_mode: render_config.hdr_mode.clone(),
            hdr_scale: render_config.hdr_scale,
            quality_mode: curation_options.quality_mode.as_str().to_string(),
            perceptual_blur: args.perceptual_blur.clone(),
            perceptual_blur_radius: args.perceptual_blur_radius,
            perceptual_blur_strength: args.perceptual_blur_strength,
            perceptual_gamut_mode: args.perceptual_gamut_mode.clone(),
            min_mass: args.min_mass,
            max_mass: args.max_mass,
            location: args.location,
            velocity: args.velocity,
            chaos_weight: args.chaos_weight,
            equil_weight: args.equil_weight,
        };
        let nebula_palette_id =
            render::nebula_palette_id_for_config(&selected.resolved_effect_config, noise_seed);
        let nebula_strength = if selected.resolved_effect_config.special_mode {
            Some(selected.resolved_effect_config.nebula_strength)
        } else {
            None
        };
        if let Some(palette_id) = nebula_palette_id {
            info!(
                "Selected nebula diagnostics: palette_id={}, strength={:.4}",
                palette_id,
                nebula_strength.unwrap_or_default()
            );
        }

        app::log_generation(
            &app_config,
            &base_filename,
            hex_seed,
            &drift_config,
            num_sims,
            &best_info,
            Some(orbit_selected_index),
            Some(orbit_discarded_count),
            Some(&best_bodies_for_log),
            Some(&selected.resolved_effect_config),
            Some(&selected.randomization_log),
            Some(&selected.curation_summary),
            selected.style_family.as_deref(),
            selected.candidate_id,
            selected.round_id,
            selected.quality_scores.as_ref(),
            selected.frame_features.as_ref(),
            selected.novelty_score,
            nebula_palette_id,
            nebula_strength,
            &selected.repair_actions,
        );
        log_stage_telemetry("total_pipeline", total_start);

        return Ok(());
    }

    // =========================
    // Fast / Batch pipeline
    // =========================

    let log_records = crate::generation_log::GenerationLogger::new().load_records();

    let stage_1_start = Instant::now();
    let (best_bodies, best_info, orbit_selected_index, orbit_discarded_count, effective_num_sims) =
        if let Some(path) = &args.orbit_in {
            let preset = crate::orbit_preset::load_orbit_preset(path)?;
            (
                preset.to_bodies(),
                sim::TrajectoryResult {
                    chaos: 0.0,
                    equilateralness: 0.0,
                    chaos_pts: 0,
                    equil_pts: 0,
                    total_score: 0,
                    total_score_weighted: 0.0,
                },
                None,
                None,
                0usize,
            )
        } else if let Some(file_name) = &args.orbit_from_log {
            let record = log_records
                .iter()
                .rev()
                .find(|r| r.file_name == *file_name)
                .cloned()
                .ok_or_else(|| {
                    crate::error::ConfigError::InvalidProfile {
                        reason: format!("generation log has no record for file_name '{file_name}'"),
                    }
                })?;

            let logged_bodies = record.orbit_bodies.ok_or_else(|| {
                crate::error::ConfigError::InvalidProfile {
                    reason: format!(
                        "generation log record '{file_name}' is missing orbit_bodies (regenerate once with the updated binary)"
                    ),
                }
            })?;

            let bodies = logged_bodies
                .into_iter()
                .map(|b| {
                    sim::Body::new(
                        b.mass,
                        Vector3::new(b.position[0], b.position[1], b.position[2]),
                        Vector3::new(b.velocity[0], b.velocity[1], b.velocity[2]),
                    )
                })
                .collect::<Vec<_>>();

            (
                bodies,
                sim::TrajectoryResult {
                    chaos: 0.0,
                    equilateralness: 0.0,
                    chaos_pts: 0,
                    equil_pts: 0,
                    total_score: 0,
                    total_score_weighted: 0.0,
                },
                None,
                None,
                0usize,
            )
        } else {
            let (bodies, info, idx, discarded) = app::run_borda_selection(
                &mut rng,
                num_sims,
                args.num_steps_sim,
                args.chaos_weight,
                args.equil_weight,
                args.escape_threshold,
            )?;
            (
                bodies,
                info,
                Some(idx),
                Some(discarded),
                num_sims,
            )
        };
    log_stage_telemetry("stage_1_orbit", stage_1_start);

    if let Some(path) = &args.orbit_out {
        let preset = crate::orbit_preset::OrbitPreset::from_bodies(Some(args.file_name.clone()), &best_bodies);
        crate::orbit_preset::save_orbit_preset(path, &preset)?;
        info!("Saved orbit preset to: {}", path);
    }

    // Stage 2: Re-run best orbit
    let stage_2_start = Instant::now();
    let best_bodies_for_log = best_bodies.clone();
    let mut positions = app::simulate_best_orbit(best_bodies, args.num_steps_sim);
    log_stage_telemetry("stage_2_resimulate", stage_2_start);

    // Stage 2.5: Apply drift (if enabled)
    let stage_25_start = Instant::now();
    let drift_config = if !args.no_drift {
        app::apply_drift_transformation(
            &mut positions,
            &args.drift_mode,
            args.drift_scale,
            args.drift_arc_fraction,
            args.drift_orbit_eccentricity,
            &mut rng,
            args.special,
        )
    } else {
        info!("STAGE 2.5/7: Drift disabled (--no-drift flag)");
        None
    };
    log_stage_telemetry("stage_2_5_drift", stage_25_start);

    // Stage 4: Bounding box (once per orbit)
    info!("STAGE 4/7: Determining bounding box...");
    let render_ctx = render::context::RenderContext::new(args.width, args.height, &positions);
    let bbox = render_ctx.bounds();
    info!(
        "   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]",
        bbox.min_x, bbox.max_x, bbox.min_y, bbox.max_y
    );

    let loaded_effect_config: Option<render::randomizable_config::ResolvedEffectConfig> =
        if let Some(path) = &args.effect_profile_in {
            let profile = crate::profile::load_effect_profile(path)?;
            Some(profile.config)
        } else if let Some(file_name) = &args.effect_from_log {
            let record = log_records
                .iter()
                .rev()
                .find(|r| r.file_name == *file_name)
                .cloned()
                .ok_or_else(|| {
                    crate::error::ConfigError::InvalidProfile {
                        reason: format!("generation log has no record for file_name '{file_name}'"),
                    }
                })?;

            if let Some(config) = record.resolved_effect_config {
                Some(config)
            } else if let Some(log) = record.randomization_log {
                Some(crate::profile::resolved_config_from_randomization_log(
                    &log,
                    args.width,
                    args.height,
                    args.special,
                )?)
            } else {
                return Err(crate::error::ConfigError::InvalidProfile {
                    reason: format!(
                        "generation log record '{file_name}' has no resolved_effect_config or randomization_log"
                    ),
                }
                .into());
            }
        } else {
            None
        };

    let mut novelty_memory = NoveltyMemory::new(64);
    let historical_features = generation_log::load_recent_frame_features(64);
    for feature in historical_features {
        novelty_memory.remember(feature);
    }

    let base_filename_root = app::generate_filename(&args.file_name, &args.profile_tag);
    let variants = args.variants.max(1);
    let mut saved_profile = false;

    for local_variant in 0..variants {
        let variant_index = args.variant_start.saturating_add(local_variant);
        let variant_number = variant_index.saturating_add(1);

        let base_filename = if variants > 1 || args.variant_start > 0 {
            format!("{}_v{:04}", base_filename_root, variant_number)
        } else {
            base_filename_root.clone()
        };

        // Variant RNG: preserve legacy behavior for the first variant, then derive additional RNGs.
        let mut derived_rng: Option<Sha3RandomByteStream> = None;
        let mut variant_noise_seed = noise_seed;
        if local_variant != 0 {
            use sha3::{Digest, Sha3_256};
            let mut hasher = Sha3_256::new();
            hasher.update(&seed_bytes);
            hasher.update(b"variant");
            hasher.update((variant_index as u64).to_le_bytes());
            let derived_seed = hasher.finalize().to_vec();
            variant_noise_seed = app::derive_noise_seed(&derived_seed);
            derived_rng = Some(Sha3RandomByteStream::new(
                &derived_seed,
                args.min_mass,
                args.max_mass,
                args.location,
                args.velocity,
            ));
        }
        let variant_rng = derived_rng.as_mut().unwrap_or(&mut rng);

        // Stage 3: Generate colors
        let stage_3_start = Instant::now();
        let (colors, body_alphas) =
            app::generate_colors(variant_rng, args.num_steps_sim, args.alpha_denom, args.alpha_compress);
        log_stage_telemetry("stage_3_color_generation", stage_3_start);

        let stage_curation_start = Instant::now();
        let selected = if let Some(profile_config) = &loaded_effect_config {
            // Use frozen config exactly (no randomization, no style-family mutation).
            let mut resolved = profile_config.clone();
            resolved.width = args.width;
            resolved.height = args.height;
            resolved.special_mode = args.special;

            apply_effect_disable_overrides(&args, &mut resolved);

            let mut randomization_log =
                render::effect_randomizer::RandomizationLog::new(resolved.gallery_quality);
            randomization_log.add_record(render::effect_randomizer::RandomizationRecord::new(
                "effect_profile".to_string(),
                true,
                false,
            ));

            SelectedCuration {
                resolved_effect_config: resolved,
                randomization_log,
                style_family: None,
                candidate_id: None,
                round_id: None,
                quality_scores: None,
                frame_features: None,
                novelty_score: None,
                repair_actions: Vec::new(),
                curation_summary: CurationSummary {
                    quality_mode: curation_options.quality_mode.as_str().to_string(),
                    rounds_used: 1,
                    accepted: true,
                    total_candidates: 1,
                    finalists_considered: 1,
                    rejection_reason: None,
                },
            }
        } else if args.no_curation || matches!(curation_options.quality_mode, QualityMode::Explore) {
            info!("Fast single-pass selection (no curation)");
            let randomizable_config = build_randomizable_config(&args, curation_options.quality_mode);
            let (mut resolved_effect_config, randomization_log) =
                randomizable_config.resolve(variant_rng, args.width, args.height, args.special);

            let mut style_family_name = None;
            let mut repair_actions = Vec::new();

            if args.no_curation {
                let family = resolve_style_family(args.style_family.as_deref(), variant_rng);
                repair_actions = apply_style_family(
                    &mut resolved_effect_config,
                    family,
                    variant_rng,
                    curation_options.quality_mode,
                );
                style_family_name = Some(family.name().to_string());
            }

            apply_effect_disable_overrides(&args, &mut resolved_effect_config);

            SelectedCuration {
                resolved_effect_config,
                randomization_log,
                style_family: style_family_name,
                candidate_id: None,
                round_id: None,
                quality_scores: None,
                frame_features: None,
                novelty_score: None,
                repair_actions,
                curation_summary: CurationSummary {
                    quality_mode: curation_options.quality_mode.as_str().to_string(),
                    rounds_used: 1,
                    accepted: true,
                    total_candidates: 1,
                    finalists_considered: 1,
                    rejection_reason: None,
                },
            }
        } else {
            info!("Running curated candidate search...");
            let (winner, summary) = run_curation_search(
                &args,
                &curation_options,
                variant_rng,
                &positions,
                &colors,
                &body_alphas,
                variant_noise_seed,
                &mut novelty_memory,
            )?;
            SelectedCuration {
                resolved_effect_config: winner.config,
                randomization_log: winner.randomization_log,
                style_family: Some(winner.style_family),
                candidate_id: Some(winner.candidate_id),
                round_id: Some(winner.round_id),
                quality_scores: Some(winner.scores),
                frame_features: Some(winner.features),
                novelty_score: Some(winner.novelty_score),
                repair_actions: winner.repair_actions,
                curation_summary: summary,
            }
        };
        log_stage_telemetry("stage_3_5_curation", stage_curation_start);

        if let Some(path) = &args.effect_profile_out {
            if !saved_profile {
                let profile = crate::profile::EffectProfile::new(
                    Some(base_filename.clone()),
                    selected.resolved_effect_config.clone(),
                );
                crate::profile::save_effect_profile(path, &profile)?;
                info!("Saved effect profile to: {}", path);
                saved_profile = true;
            }
        }

        // Configure rendering from resolved parameters
        let render_config = build_render_config(
            &args,
            curation_options.quality_mode,
            &selected.resolved_effect_config,
            render::EffectBudget::Full,
        );

        let levels = if args.no_video && !args.test_frame {
            None
        } else {
            // Stage 5-6: Build histogram and compute levels
            let stage_56_start = Instant::now();
            let levels = app::build_histogram_and_levels(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                variant_noise_seed,
                &render_config,
            )?;
            log_stage_telemetry("stage_5_6_histogram_levels", stage_56_start);
            Some(levels)
        };

        let output_png = format!("pics/{}.png", base_filename);

        // Stage 7: Render
        let stage_7_start = Instant::now();
        if args.test_frame {
            app::render_test_frame(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                levels.as_ref().expect("levels required for test frame"),
                variant_noise_seed,
                &render_config,
                &output_png,
                &best_info,
            )?;
        } else if args.no_video {
            app::render_still(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                variant_noise_seed,
                &render_config,
                &output_png,
                &best_info,
            )?;
        } else {
            let output_vid = format!("vids/{}.mp4", base_filename);
            app::render_video(
                &positions,
                &colors,
                &body_alphas,
                &selected.resolved_effect_config,
                levels.as_ref().expect("levels required for video render"),
                variant_noise_seed,
                &render_config,
                &output_vid,
                &output_png,
                args.fast_encode,
            )?;
        }
        log_stage_telemetry("stage_7_render", stage_7_start);

        let app_config = app::AppConfig {
            seed: args.seed.clone(),
            file_name: args.file_name.clone(),
            num_sims: effective_num_sims,
            num_steps_sim: args.num_steps_sim,
            width: args.width,
            height: args.height,
            special: args.special,
            test_frame: args.test_frame,
            clip_black: selected.resolved_effect_config.clip_black,
            clip_white: selected.resolved_effect_config.clip_white,
            alpha_denom: args.alpha_denom,
            alpha_compress: args.alpha_compress,
            escape_threshold: args.escape_threshold,
            drift_enabled: !args.no_drift,
            drift_mode: args.drift_mode.clone(),
            drift_scale: args.drift_scale,
            drift_arc_fraction: args.drift_arc_fraction,
            drift_orbit_eccentricity: args.drift_orbit_eccentricity,
            profile_tag: args.profile_tag.clone(),
            bloom_mode: args.bloom_mode.clone(),
            dog_strength: args.dog_strength,
            dog_sigma: args.dog_sigma,
            dog_ratio: args.dog_ratio,
            hdr_mode: render_config.hdr_mode.clone(),
            hdr_scale: render_config.hdr_scale,
            quality_mode: curation_options.quality_mode.as_str().to_string(),
            perceptual_blur: args.perceptual_blur.clone(),
            perceptual_blur_radius: args.perceptual_blur_radius,
            perceptual_blur_strength: args.perceptual_blur_strength,
            perceptual_gamut_mode: args.perceptual_gamut_mode.clone(),
            min_mass: args.min_mass,
            max_mass: args.max_mass,
            location: args.location,
            velocity: args.velocity,
            chaos_weight: args.chaos_weight,
            equil_weight: args.equil_weight,
        };

        let nebula_palette_id =
            render::nebula_palette_id_for_config(&selected.resolved_effect_config, variant_noise_seed);
        let nebula_strength = if selected.resolved_effect_config.special_mode {
            Some(selected.resolved_effect_config.nebula_strength)
        } else {
            None
        };

        app::log_generation(
            &app_config,
            &base_filename,
            hex_seed,
            &drift_config,
            effective_num_sims,
            &best_info,
            orbit_selected_index,
            orbit_discarded_count,
            Some(&best_bodies_for_log),
            Some(&selected.resolved_effect_config),
            Some(&selected.randomization_log),
            Some(&selected.curation_summary),
            selected.style_family.as_deref(),
            selected.candidate_id,
            selected.round_id,
            selected.quality_scores.as_ref(),
            selected.frame_features.as_ref(),
            selected.novelty_score,
            nebula_palette_id,
            nebula_strength,
            &selected.repair_actions,
        );
    }

    info!(
        "Done! Best orbit => Weighted Borda = {:.3}\nHave a nice day!",
        best_info.total_score_weighted
    );

    log_stage_telemetry("total_pipeline", total_start);
    Ok(())
}
#[cfg(test)]
mod telemetry_tests {
    use super::{parse_status_kib, parse_status_threads};

    #[test]
    fn parse_status_kib_extracts_values() {
        let text = "Name:\tthree_body_problem\nVmRSS:\t123456 kB\nVmHWM:\t234567 kB\n";
        assert_eq!(parse_status_kib(text, "VmRSS:"), Some(123456));
        assert_eq!(parse_status_kib(text, "VmHWM:"), Some(234567));
    }

    #[test]
    fn parse_status_threads_extracts_count() {
        let text = "Name:\tthree_body_problem\nThreads:\t48\n";
        assert_eq!(parse_status_threads(text), Some(48));
    }
}
