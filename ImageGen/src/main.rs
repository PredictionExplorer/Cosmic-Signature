use clap::Parser;
use tracing::info;
use tracing_subscriber::EnvFilter;

mod analysis;
mod app;
mod drift;
mod drift_config;
mod error;
mod generation_log;
mod oklab;
mod post_effects;
mod render;
mod sim;
mod soa_positions;
mod spectral_constants;
mod spectrum;
mod spectrum_simd;
mod utils;

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

    /// Test mode: render only the first frame as PNG and exit (skips video generation)
    #[arg(long, default_value_t = false)]
    test_frame: bool,

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

    // ==== Museum Quality Enhancements (all enabled by default) ====

    /// Disable ALL museum-quality enhancements at once (classic rendering)
    #[arg(long, default_value_t = false)]
    no_enhancements: bool,

    /// Disable boosted OKLab chroma for richer color saturation
    #[arg(long, default_value_t = false)]
    no_chroma_boost: bool,

    /// Disable boosted saturation in spectral-to-RGB conversion
    #[arg(long, default_value_t = false)]
    no_sat_boost: bool,

    /// Disable refined ACES tonemapping curve (more midtone contrast)
    #[arg(long, default_value_t = false)]
    no_aces_tweak: bool,

    /// Disable per-body alpha variation (depth hierarchy in trail brightness)
    #[arg(long, default_value_t = false)]
    no_alpha_variation: bool,

    /// Disable aspect-aware bounding box (prevents orbit stretching)
    #[arg(long, default_value_t = false)]
    no_aspect_correction: bool,

    /// Disable boosted spectral dispersion (wider rainbow trails)
    #[arg(long, default_value_t = false)]
    no_dispersion_boost: bool,

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
    
    /// Nebula strength (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    param_nebula_strength: Option<f64>,

    /// Nebula octaves (if not specified, randomized in range 3-5)
    #[arg(long)]
    param_nebula_octaves: Option<usize>,

    /// Nebula base frequency (if not specified, randomized in range 0.0008-0.0025)
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

/// Build randomizable effect configuration from command-line arguments.
/// Any unspecified parameter will be randomized during resolution.
fn build_randomizable_config(args: &Args) -> render::randomizable_config::RandomizableEffectConfig {
    use render::randomizable_config::RandomizableEffectConfig;

    RandomizableEffectConfig {

        // Effect enables (convert disable flags to enable options)
        enable_bloom: if args.disable_all_effects || args.disable_bloom { Some(false) } else { None },
        enable_glow: if args.disable_all_effects || args.disable_glow { Some(false) } else { None },
        enable_chromatic_bloom: if args.disable_all_effects || args.disable_chromatic_bloom { Some(false) } else { None },
        enable_perceptual_blur: if args.disable_all_effects || args.disable_perceptual_blur { Some(false) } else { None },
        enable_micro_contrast: if args.disable_all_effects || args.disable_micro_contrast { Some(false) } else { None },
        enable_gradient_map: if args.disable_all_effects || args.disable_gradient_map { Some(false) } else { None },
        enable_color_grade: if args.disable_all_effects || args.disable_color_grade { Some(false) } else { None },
        enable_champleve: if args.disable_all_effects || args.disable_champleve { Some(false) } else { None },
        enable_aether: if args.disable_all_effects || args.disable_aether { Some(false) } else { None },
        enable_opalescence: if args.disable_all_effects || args.disable_opalescence { Some(false) } else { None },
        enable_edge_luminance: if args.disable_all_effects || args.disable_edge_luminance { Some(false) } else { None },
        enable_atmospheric_depth: if args.disable_all_effects || args.disable_atmospheric_depth { Some(false) } else { None },
        enable_fine_texture: if args.disable_all_effects || args.disable_fine_texture { Some(false) } else { None },

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

fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize tracing
    setup_logging(args.json_logs, &args.log_level);

    let num_sims = args.num_sims.unwrap_or(100_000);

    let enhancements = app::Enhancements {
        chroma_boost: !args.no_enhancements && !args.no_chroma_boost,
        sat_boost: !args.no_enhancements && !args.no_sat_boost,
        aces_tweak: !args.no_enhancements && !args.no_aces_tweak,
        alpha_variation: !args.no_enhancements && !args.no_alpha_variation,
        aspect_correction: !args.no_enhancements && !args.no_aspect_correction,
        dispersion_boost: !args.no_enhancements && !args.no_dispersion_boost,
    };

    crate::spectrum_simd::SAT_BOOST_ENABLED.store(enhancements.sat_boost, std::sync::atomic::Ordering::Relaxed);
    crate::render::ACES_TWEAK_ENABLED.store(enhancements.aces_tweak, std::sync::atomic::Ordering::Relaxed);
    crate::render::drawing::DISPERSION_BOOST_ENABLED.store(enhancements.dispersion_boost, std::sync::atomic::Ordering::Relaxed);

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

    // Resolve effect configuration (randomize unspecified parameters)
    info!("Resolving effect configuration...");
    let randomizable_config = build_randomizable_config(&args);
    let (resolved_effect_config, randomization_log) = randomizable_config.resolve(
        &mut rng,
        args.width,
        args.height,
    );
    
    let num_randomized = randomization_log.effects.iter()
        .map(|e| e.parameters.iter().filter(|p| p.was_randomized).count())
        .sum::<usize>();
    
    info!(
        "   => Resolved {} effects ({} parameters randomized, {} explicit)",
        randomization_log.effects.len(),
        num_randomized,
        randomization_log.effects.iter()
            .map(|e| e.parameters.len())
            .sum::<usize>() - num_randomized
    );
    
    // Stage 1: Borda selection
    let (best_bodies, best_info) = app::run_borda_selection(
        &mut rng,
        num_sims,
        args.num_steps_sim,
        args.chaos_weight,
        args.equil_weight,
        args.escape_threshold,
    )?;

    // Stage 2: Re-run best orbit
    let mut positions = app::simulate_best_orbit(best_bodies, args.num_steps_sim);

    // Stage 2.5: Apply drift (if enabled)
    let drift_config = if !args.no_drift {
        app::apply_drift_transformation(
            &mut positions,
            &args.drift_mode,
            args.drift_scale,
            args.drift_arc_fraction,
            args.drift_orbit_eccentricity,
            &mut rng,
        )
    } else {
        info!("STAGE 2.5/7: Drift disabled (--no-drift flag)");
        None
    };

    // Stage 3: Generate colors
    let (colors, body_alphas) = app::generate_colors(
        &mut rng,
        args.num_steps_sim,
        args.alpha_denom,
        &enhancements,
    );

    // Using OKLab color space
    info!("   => Using OKLab color space for accumulation");

    // Stage 4: Bounding box
    info!("STAGE 4/7: Determining bounding box...");
    let render_ctx = render::context::RenderContext::new(args.width, args.height, &positions, enhancements.aspect_correction);
    let bbox = render_ctx.bounds();
    info!("   => X: [{:.3}, {:.3}], Y: [{:.3}, {:.3}]", bbox.min_x, bbox.max_x, bbox.min_y, bbox.max_y);

    // Configure rendering from resolved parameters
    let render_config = RenderConfig {
        hdr_scale: if args.hdr_mode == "auto" { resolved_effect_config.hdr_scale } else { 1.0 },
    };

    // Stage 5-6: Build histogram and compute levels
    let levels = app::build_histogram_and_levels(
        &positions,
        &colors,
        &body_alphas,
        &resolved_effect_config,
        noise_seed,
        &render_config,
        enhancements.aspect_correction,
    )?;

    let base_filename = app::generate_filename(&args.file_name, &args.profile_tag);
    let output_png = format!("pics/{}.png", base_filename);

    // Stage 7: Render
    if args.test_frame {
        app::render_test_frame(
            &positions,
            &colors,
            &body_alphas,
            &resolved_effect_config,
            &levels,
            noise_seed,
            &render_config,
            &output_png,
            &best_info,
            enhancements.aspect_correction,
        )?;
        return Ok(());
    }

    // Normal mode: Render full video
    let output_vid = format!("vids/{}.mp4", base_filename);
    
    app::render_video(
        &positions,
        &colors,
        &body_alphas,
        &resolved_effect_config,
        &levels,
        noise_seed,
        &render_config,
        &output_vid,
        &output_png,
        args.fast_encode,
        enhancements.aspect_correction,
        !args.disable_temporal_smoothing,
    )?;

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
        test_frame: args.test_frame,
        clip_black: args.clip_black,
        clip_white: args.clip_white,
        alpha_denom: args.alpha_denom,
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
        hdr_mode: args.hdr_mode.clone(),
        hdr_scale: args.hdr_scale,
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
    
    app::log_generation(
        &app_config,
        &base_filename,
        hex_seed,
        &drift_config,
        num_sims,
        &best_info,
        Some(&randomization_log),
    );
    
    Ok(())
}
