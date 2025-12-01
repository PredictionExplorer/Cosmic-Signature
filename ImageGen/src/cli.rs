use clap::{Args, Parser};

/// Command-line arguments
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Simulate random 3-body orbits, choose the best via Borda, then generate a single image + MP4.\nAlso discards orbits that appear to have an escaping body."
)]
pub struct Cli {
    #[command(flatten)]
    pub sim: SimArgs,

    #[command(flatten)]
    pub render: RenderArgs,

    #[command(flatten)]
    pub drift: DriftArgs,

    #[command(flatten)]
    pub effects: EffectArgs,

    #[command(flatten)]
    pub output: OutputArgs,
}

#[derive(Args, Debug)]
pub struct SimArgs {
    #[arg(long, default_value = "0x100033")]
    pub seed: String,

    #[arg(long)]
    pub num_sims: Option<usize>,

    #[arg(long, default_value_t = 1_000_000)]
    pub num_steps_sim: usize,

    #[arg(long, default_value_t = 300.0)]
    pub location: f64,

    #[arg(long, default_value_t = 1.0)]
    pub velocity: f64,

    #[arg(long, default_value_t = 100.0)]
    pub min_mass: f64,

    #[arg(long, default_value_t = 300.0)]
    pub max_mass: f64,

    #[arg(long, default_value_t = 0.75)]
    pub chaos_weight: f64,

    #[arg(long, default_value_t = 11.0)]
    pub equil_weight: f64,

    /// If body's energy in COM frame is above this, treat as escaping
    #[arg(long, default_value_t = -0.3)]
    pub escape_threshold: f64,
}

#[derive(Args, Debug)]
pub struct RenderArgs {
    #[arg(long, default_value_t = 1920)]
    pub width: u32,

    #[arg(long, default_value_t = 1080)]
    pub height: u32,

    /// Fast encode mode: use hardware acceleration (3-5× faster, slightly lower quality)
    /// Default is high-quality mode with H.265, 10-bit color, and perceptual optimization
    #[arg(long, default_value_t = false)]
    pub fast_encode: bool,

    /// Denominator for alpha used in drawing lines
    #[arg(long, default_value_t = 15_000_000)]
    pub alpha_denom: usize,

    /// Strength of density-aware alpha compression (0 = off)
    #[arg(long, default_value_t = 6.0)]
    pub alpha_compress: f64,

    /// HDR mode: off or auto
    #[arg(long, default_value = "auto")]
    pub hdr_mode: String,
}

#[derive(Args, Debug)]
pub struct DriftArgs {
    /// Disable drift motion (drift is enabled by default)
    #[arg(long, default_value_t = false)]
    pub no_drift: bool,

    /// Drift mode: linear, brownian, elliptical
    #[arg(long, default_value = "elliptical")]
    pub drift_mode: String,

    /// Scale of drift motion (relative to system size)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    pub drift_scale: Option<f64>,

    /// Fraction of the orbit to traverse when using elliptical drift (0-1)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    pub drift_arc_fraction: Option<f64>,

    /// Orbit eccentricity when using elliptical drift (0-0.95)
    /// If not specified, will be randomly generated based on mode
    #[arg(long)]
    pub drift_orbit_eccentricity: Option<f64>,
}

#[derive(Args, Debug)]
pub struct OutputArgs {
    #[arg(long, default_value = "output")]
    pub file_name: String,

    /// Profile tag to append to output filenames
    #[arg(long, default_value = "")]
    pub profile_tag: String,

    /// Test mode: render only the first frame as PNG and exit (skips video generation)
    #[arg(long, default_value_t = false)]
    pub test_frame: bool,

    /// Output logs in JSON format
    #[arg(long)]
    pub json_logs: bool,

    /// Set log level (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    pub log_level: String,
}

#[derive(Args, Debug)]
pub struct EffectArgs {
    #[arg(long, default_value_t = false)]
    pub special: bool,

    /// Enable gallery quality mode (narrower randomization ranges for exhibition-ready results)
    /// Default is TRUE for best quality. Use --gallery-quality=false for wider exploration.
    #[arg(long, default_value_t = true)]
    pub gallery_quality: bool,

    // ==== Effect Control Flags (All effects enabled by default) ====
    /// Disable ALL post-processing effects (show pure spectral rendering + basic bloom)
    #[arg(long, default_value_t = false)]
    pub disable_all_effects: bool,

    /// Disable bloom effect (Gaussian/DoG glow)
    #[arg(long, default_value_t = false)]
    pub disable_bloom: bool,

    /// Disable glow enhancement (tight sparkle on bright areas)
    #[arg(long, default_value_t = false)]
    pub disable_glow: bool,

    /// Disable chromatic bloom (prismatic color separation)
    #[arg(long, default_value_t = false)]
    pub disable_chromatic_bloom: bool,

    /// Disable perceptual blur (OKLab space smoothing)
    #[arg(long, default_value_t = false)]
    pub disable_perceptual_blur: bool,

    /// Disable micro-contrast enhancement (detail clarity boost)
    #[arg(long, default_value_t = false)]
    pub disable_micro_contrast: bool,

    /// Disable gradient mapping (luxury color palettes)
    #[arg(long, default_value_t = false)]
    pub disable_gradient_map: bool,

    /// Disable cinematic color grading (film-like look)
    #[arg(long, default_value_t = false)]
    pub disable_color_grade: bool,

    /// Disable champlevé effect (Voronoi cells + metallic rims)
    #[arg(long, default_value_t = false)]
    pub disable_champleve: bool,

    /// Disable aether effect (woven filaments + volumetric flow)
    #[arg(long, default_value_t = false)]
    pub disable_aether: bool,

    /// Disable opalescence (gem-like iridescent shimmer)
    #[arg(long, default_value_t = false)]
    pub disable_opalescence: bool,

    /// Disable edge luminance enhancement (form refinement)
    #[arg(long, default_value_t = false)]
    pub disable_edge_luminance: bool,

    /// Disable atmospheric depth (spatial perspective + fog)
    #[arg(long, default_value_t = false)]
    pub disable_atmospheric_depth: bool,

    /// Disable fine texture overlay (canvas/surface quality)
    #[arg(long, default_value_t = false)]
    pub disable_fine_texture: bool,

    /// Disable temporal smoothing (video frame blending)
    #[arg(long, default_value_t = false)]
    pub disable_temporal_smoothing: bool,

    // ==== Bloom & Glow Parameters ====
    /// Gaussian blur strength (if not specified, randomized in range 4.0-18.0)
    #[arg(long)]
    pub param_blur_strength: Option<f64>,

    /// Blur radius scale relative to resolution (if not specified, randomized in range 0.008-0.045)
    #[arg(long)]
    pub param_blur_radius_scale: Option<f64>,

    /// Blur core brightness preservation (if not specified, randomized in range 4.0-18.0)
    #[arg(long)]
    pub param_blur_core_brightness: Option<f64>,

    /// Bloom mode: gaussian or dog
    #[arg(long, default_value = "dog")]
    pub bloom_mode: String,

    /// DoG bloom strength (0.1-1.0)
    #[arg(long, default_value_t = 0.32)]
    pub dog_strength: f64,

    /// DoG inner sigma in pixels (auto-scales with resolution if not specified)
    #[arg(long)]
    pub dog_sigma: Option<f64>,

    /// DoG outer/inner sigma ratio
    #[arg(long, default_value_t = 2.8)]
    pub dog_ratio: f64,

    /// DoG bloom strength (randomizable override)
    #[arg(long)]
    pub param_dog_strength: Option<f64>,

    /// DoG inner sigma scale (if not specified, randomized in range 0.004-0.012)
    #[arg(long)]
    pub param_dog_sigma_scale: Option<f64>,

    /// DoG outer/inner ratio (randomizable override)
    #[arg(long)]
    pub param_dog_ratio: Option<f64>,

    /// Glow enhancement strength (if not specified, randomized in range 0.15-0.70)
    #[arg(long)]
    pub param_glow_strength: Option<f64>,

    /// Glow luminance threshold (if not specified, randomized in range 0.50-0.85)
    #[arg(long)]
    pub param_glow_threshold: Option<f64>,

    /// Glow radius scale (if not specified, randomized in range 0.004-0.012)
    #[arg(long)]
    pub param_glow_radius_scale: Option<f64>,

    /// Glow sharpness (if not specified, randomized in range 1.5-4.0)
    #[arg(long)]
    pub param_glow_sharpness: Option<f64>,

    /// Glow saturation boost (if not specified, randomized in range 0.0-0.40)
    #[arg(long)]
    pub param_glow_saturation_boost: Option<f64>,

    // ==== Chromatic Bloom Parameters ====
    /// Chromatic bloom strength (if not specified, randomized in range 0.35-0.85)
    #[arg(long)]
    pub param_chromatic_bloom_strength: Option<f64>,

    /// Chromatic bloom radius scale (if not specified, randomized in range 0.007-0.018)
    #[arg(long)]
    pub param_chromatic_bloom_radius_scale: Option<f64>,

    /// Chromatic bloom RGB separation scale (if not specified, randomized in range 0.0015-0.0035)
    #[arg(long)]
    pub param_chromatic_bloom_separation_scale: Option<f64>,

    /// Chromatic bloom threshold (if not specified, randomized in range 0.08-0.30)
    #[arg(long)]
    pub param_chromatic_bloom_threshold: Option<f64>,

    // ==== Perceptual Blur Parameters ====
    /// Enable perceptual blur in OKLab space: off or on
    #[arg(long, default_value = "on")]
    pub perceptual_blur: String,

    /// Perceptual blur radius (pixels), defaults to main blur radius
    #[arg(long)]
    pub perceptual_blur_radius: Option<usize>,

    /// Perceptual blur strength (0.0-1.0)
    #[arg(long, default_value_t = 0.65)]
    pub perceptual_blur_strength: f64,

    /// Gamut mapping mode for perceptual blur: clamp, preserve-hue, soft-clip
    #[arg(long, default_value = "preserve-hue")]
    pub perceptual_gamut_mode: String,

    /// Perceptual blur strength (randomizable override)
    #[arg(long)]
    pub param_perceptual_blur_strength: Option<f64>,

    // ==== Color Grading Parameters ====
    /// Color grading strength (if not specified, randomized in range 0.0-0.75)
    #[arg(long)]
    pub param_color_grade_strength: Option<f64>,

    /// Vignette strength (if not specified, randomized in range 0.0-0.65)
    #[arg(long)]
    pub param_vignette_strength: Option<f64>,

    /// Vignette softness exponent (if not specified, randomized in range 1.8-3.5)
    #[arg(long)]
    pub param_vignette_softness: Option<f64>,

    /// Color vibrance multiplier (if not specified, randomized in range 0.85-1.35)
    #[arg(long)]
    pub param_vibrance: Option<f64>,

    /// Clarity strength (if not specified, randomized in range 0.0-0.50)
    #[arg(long)]
    pub param_clarity_strength: Option<f64>,

    /// Tone curve strength (if not specified, randomized in range 0.0-0.75)
    #[arg(long)]
    pub param_tone_curve_strength: Option<f64>,

    // ==== Gradient Mapping Parameters ====
    /// Gradient map strength (if not specified, randomized in range 0.40-1.0)
    #[arg(long)]
    pub param_gradient_map_strength: Option<f64>,

    /// Gradient map hue preservation (if not specified, randomized in range 0.0-0.40)
    #[arg(long)]
    pub param_gradient_map_hue_preservation: Option<f64>,

    /// Gradient map palette selection (0-14: 0=GoldPurple, 1=CosmicTealPink, 2=AmberCyan, 3=IndigoGold, 4=BlueOrange, 5=VenetianRenaissance, 6=JapaneseUkiyoe, 7=ArtNouveau, 8=LunarOpal, 9=FireOpal, 10=DeepOcean, 11=AuroraBorealis, 12=MoltenMetal, 13=AncientJade, 14=RoyalAmethyst)
    #[arg(long)]
    pub param_gradient_map_palette: Option<usize>,

    // ==== Opalescence Parameters ====
    /// Opalescence strength (if not specified, randomized in range 0.0-0.35)
    #[arg(long)]
    pub param_opalescence_strength: Option<f64>,

    /// Opalescence pattern scale (if not specified, randomized in range 0.005-0.015)
    #[arg(long)]
    pub param_opalescence_scale: Option<f64>,

    /// Opalescence interference layers (if not specified, randomized in range 1-4)
    #[arg(long)]
    pub param_opalescence_layers: Option<usize>,

    // ==== Champlevé Parameters ====
    /// Champlevé flow alignment (if not specified, randomized in range 0.20-0.85)
    #[arg(long)]
    pub param_champleve_flow_alignment: Option<f64>,

    /// Champlevé interference amplitude (if not specified, randomized in range 0.15-0.80)
    #[arg(long)]
    pub param_champleve_interference_amplitude: Option<f64>,

    /// Champlevé rim intensity (if not specified, randomized in range 0.5-3.0)
    #[arg(long)]
    pub param_champleve_rim_intensity: Option<f64>,

    /// Champlevé rim warmth (if not specified, randomized in range 0.0-0.90)
    #[arg(long)]
    pub param_champleve_rim_warmth: Option<f64>,

    /// Champlevé interior lift (if not specified, randomized in range 0.20-0.90)
    #[arg(long)]
    pub param_champleve_interior_lift: Option<f64>,

    // ==== Aether Parameters ====
    /// Aether flow alignment (if not specified, randomized in range 0.30-0.95)
    #[arg(long)]
    pub param_aether_flow_alignment: Option<f64>,

    /// Aether scattering strength (if not specified, randomized in range 0.30-1.50)
    #[arg(long)]
    pub param_aether_scattering_strength: Option<f64>,

    /// Aether iridescence amplitude (if not specified, randomized in range 0.20-0.85)
    #[arg(long)]
    pub param_aether_iridescence_amplitude: Option<f64>,

    /// Aether caustic strength (if not specified, randomized in range 0.0-0.60)
    #[arg(long)]
    pub param_aether_caustic_strength: Option<f64>,

    // ==== Micro-Contrast Parameters ====
    /// Micro-contrast strength (if not specified, randomized in range 0.10-0.45)
    #[arg(long)]
    pub param_micro_contrast_strength: Option<f64>,

    /// Micro-contrast radius (if not specified, randomized in range 2-8)
    #[arg(long)]
    pub param_micro_contrast_radius: Option<usize>,

    // ==== Edge Luminance Parameters ====
    /// Edge luminance strength (if not specified, randomized in range 0.08-0.40)
    #[arg(long)]
    pub param_edge_luminance_strength: Option<f64>,

    /// Edge luminance threshold (if not specified, randomized in range 0.10-0.30)
    #[arg(long)]
    pub param_edge_luminance_threshold: Option<f64>,

    /// Edge luminance brightness boost (if not specified, randomized in range 0.15-0.50)
    #[arg(long)]
    pub param_edge_luminance_brightness_boost: Option<f64>,

    // ==== Atmospheric Depth Parameters ====
    /// Atmospheric depth strength (if not specified, randomized in range 0.0-0.45)
    #[arg(long)]
    pub param_atmospheric_depth_strength: Option<f64>,

    /// Atmospheric desaturation (if not specified, randomized in range 0.10-0.60)
    #[arg(long)]
    pub param_atmospheric_desaturation: Option<f64>,

    /// Atmospheric darkening (if not specified, randomized in range 0.0-0.35)
    #[arg(long)]
    pub param_atmospheric_darkening: Option<f64>,

    /// Atmospheric fog color red component (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    pub param_atmospheric_fog_color_r: Option<f64>,

    /// Atmospheric fog color green component (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    pub param_atmospheric_fog_color_g: Option<f64>,

    /// Atmospheric fog color blue component (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    pub param_atmospheric_fog_color_b: Option<f64>,

    // ==== Fine Texture Parameters ====
    /// Fine texture strength (if not specified, randomized in range 0.02-0.25)
    #[arg(long)]
    pub param_fine_texture_strength: Option<f64>,

    /// Fine texture scale (if not specified, randomized in range 0.0008-0.0028)
    #[arg(long)]
    pub param_fine_texture_scale: Option<f64>,

    /// Fine texture contrast (if not specified, randomized in range 0.15-0.50)
    #[arg(long)]
    pub param_fine_texture_contrast: Option<f64>,

    // ==== HDR Parameters ====
    /// HDR scale (if not specified, randomized in range 0.06-0.25)
    #[arg(long)]
    pub param_hdr_scale: Option<f64>,

    // ==== Clipping Parameters ====
    /// Black point clipping (if not specified, randomized in range 0.005-0.025, constrained < clip_white)
    #[arg(long)]
    pub param_clip_black: Option<f64>,

    /// White point clipping (if not specified, randomized in range 0.975-0.998, constrained > clip_black)
    #[arg(long)]
    pub param_clip_white: Option<f64>,

    // ==== Nebula Parameters ====
    /// Nebula strength (if not specified, randomized in range 0.0-0.30)
    #[arg(long)]
    pub param_nebula_strength: Option<f64>,

    /// Nebula octaves (if not specified, randomized in range 3-5)
    #[arg(long)]
    pub param_nebula_octaves: Option<usize>,

    /// Nebula base frequency (if not specified, randomized in range 0.0008-0.0025)
    #[arg(long)]
    pub param_nebula_base_frequency: Option<f64>,
}
