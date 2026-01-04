//! Randomizable configuration for all effect parameters.
//!
//! This module defines the complete parameter space for effect configuration,
//! with support for explicit user values or random generation.
//!
//! # Museum Quality Pipeline
//!
//! The resolution pipeline implements a multi-stage approach to ensure both
//! variety and quality:
//!
//! 1. **Style Genome**: 8 continuous aesthetic axes derived from seed
//! 2. **Effect Theme**: Optional thematic coordination of effects
//! 3. **Genome-Biased Randomization**: Effect probabilities influenced by genome
//! 4. **Parameter Resolution**: All values determined (explicit or randomized)
//! 5. **Artifact Budget**: Soft caps on artifact-prone effect combinations
//! 6. **Theme Application**: Apply theme modifiers to resolved strengths
//! 7. **Museum Quality Enforcement**: Minimum quality guarantees for gallery mode

use super::artifact_budget::ArtifactBudget;
use super::effect_randomizer::{EffectRandomizer, RandomizationLog, RandomizationRecord};
use super::effect_themes::EffectTheme;
use super::parameter_descriptors as pd;
use super::style_genome::StyleGenome;
use crate::sim::Sha3RandomByteStream;

/// Complete configuration for all randomizable effect parameters.
/// Each field is Option<T>: `None` means "randomize this", `Some`(T) means "use explicit value".
#[derive(Clone, Debug, Default)]
pub struct RandomizableEffectConfig {
    // Gallery quality mode
    pub gallery_quality: bool,

    // MUSEUM QUALITY: Effect theme for coordinated aesthetics
    // None = randomly select a theme (or Balanced), Some = use specified theme
    pub effect_theme: Option<EffectTheme>,

    // Effect enable/disable flags
    pub enable_bloom: Option<bool>,
    pub enable_glow: Option<bool>,
    pub enable_chromatic_bloom: Option<bool>,
    pub enable_perceptual_blur: Option<bool>,
    pub enable_micro_contrast: Option<bool>,
    pub enable_gradient_map: Option<bool>,
    pub enable_color_grade: Option<bool>,
    pub enable_champleve: Option<bool>,
    pub enable_aether: Option<bool>,
    pub enable_opalescence: Option<bool>,
    pub enable_edge_luminance: Option<bool>,
    pub enable_atmospheric_depth: Option<bool>,
    pub enable_crepuscular_rays: Option<bool>,
    pub enable_volumetric_occlusion: Option<bool>,
    pub enable_refractive_caustics: Option<bool>,
    pub enable_fine_texture: Option<bool>,

    // New "Masterpiece" effects (Phase 2024 enhancements)
    pub enable_event_horizon: Option<bool>,
    pub enable_cherenkov: Option<bool>,
    pub enable_cosmic_ink: Option<bool>,
    pub enable_aurora_veils: Option<bool>,
    pub enable_prismatic_halos: Option<bool>,
    pub enable_dimensional_glitch: Option<bool>,
    pub enable_deep_space: Option<bool>,

    // Bloom & Glow parameters
    pub blur_strength: Option<f64>,
    pub blur_radius_scale: Option<f64>,
    pub blur_core_brightness: Option<f64>,
    pub dog_strength: Option<f64>,
    pub dog_sigma_scale: Option<f64>,
    pub dog_ratio: Option<f64>,
    pub glow_strength: Option<f64>,
    pub glow_threshold: Option<f64>,
    pub glow_radius_scale: Option<f64>,
    pub glow_sharpness: Option<f64>,
    pub glow_saturation_boost: Option<f64>,

    // Chromatic effects
    pub chromatic_bloom_strength: Option<f64>,
    pub chromatic_bloom_radius_scale: Option<f64>,
    pub chromatic_bloom_separation_scale: Option<f64>,
    pub chromatic_bloom_threshold: Option<f64>,

    // Perceptual blur
    pub perceptual_blur_strength: Option<f64>,

    // Color grading
    pub color_grade_strength: Option<f64>,
    pub vignette_strength: Option<f64>,
    pub vignette_softness: Option<f64>,
    pub vibrance: Option<f64>,
    pub clarity_strength: Option<f64>,
    pub tone_curve_strength: Option<f64>,

    // Gradient mapping
    pub gradient_map_strength: Option<f64>,
    pub gradient_map_hue_preservation: Option<f64>,
    pub gradient_map_palette: Option<usize>, // 0-14 for 15 different palettes

    // Material effects - Opalescence
    pub opalescence_strength: Option<f64>,
    pub opalescence_scale: Option<f64>,
    pub opalescence_layers: Option<usize>,

    // Material effects - Champlevé
    pub champleve_flow_alignment: Option<f64>,
    pub champleve_interference_amplitude: Option<f64>,
    pub champleve_rim_intensity: Option<f64>,
    pub champleve_rim_warmth: Option<f64>,
    pub champleve_interior_lift: Option<f64>,

    // Material effects - Aether
    pub aether_flow_alignment: Option<f64>,
    pub aether_scattering_strength: Option<f64>,
    pub aether_iridescence_amplitude: Option<f64>,
    pub aether_caustic_strength: Option<f64>,

    // Detail & Clarity
    pub micro_contrast_strength: Option<f64>,
    pub micro_contrast_radius: Option<usize>,
    pub edge_luminance_strength: Option<f64>,
    pub edge_luminance_threshold: Option<f64>,
    pub edge_luminance_brightness_boost: Option<f64>,

    // Atmospheric
    pub atmospheric_depth_strength: Option<f64>,
    pub atmospheric_desaturation: Option<f64>,
    pub atmospheric_darkening: Option<f64>,
    pub atmospheric_fog_color_r: Option<f64>, // Fog color RGB components
    pub atmospheric_fog_color_g: Option<f64>,
    pub atmospheric_fog_color_b: Option<f64>,

    // Crepuscular Rays
    pub crepuscular_rays_strength: Option<f64>,
    pub crepuscular_rays_density: Option<f64>,
    pub crepuscular_rays_decay: Option<f64>,
    pub crepuscular_rays_weight: Option<f64>,
    pub crepuscular_rays_exposure: Option<f64>,

    // Volumetric Occlusion (Self-Shadowing)
    pub volumetric_occlusion_strength: Option<f64>,
    pub volumetric_occlusion_radius: Option<usize>,
    pub volumetric_occlusion_light_angle: Option<f64>,
    pub volumetric_occlusion_density_scale: Option<f64>,
    pub volumetric_occlusion_decay: Option<f64>,
    pub volumetric_occlusion_threshold: Option<f64>,

    // Refractive Caustics
    pub refractive_caustics_strength: Option<f64>,
    pub refractive_caustics_ior: Option<f64>,
    pub refractive_caustics_dispersion: Option<f64>,
    pub refractive_caustics_focus: Option<f64>,
    pub refractive_caustics_threshold: Option<f64>,

    // Fine Texture / Impasto
    pub fine_texture_strength: Option<f64>,
    pub fine_texture_scale: Option<f64>,
    pub fine_texture_contrast: Option<f64>,
    pub fine_texture_specular: Option<f64>,
    pub fine_texture_light_angle: Option<f64>,
    pub fine_texture_type: Option<usize>,

    // HDR & Exposure
    pub hdr_scale: Option<f64>,

    // Clipping
    pub clip_black: Option<f64>,
    pub clip_white: Option<f64>,

    // Nebula
    pub nebula_strength: Option<f64>,
    pub nebula_octaves: Option<usize>,
    pub nebula_base_frequency: Option<f64>,

    // New "Masterpiece" effect parameters
    // Event Horizon Lensing
    pub event_horizon_strength: Option<f64>,
    pub event_horizon_mass_scale: Option<f64>,

    // Cherenkov Radiation
    pub cherenkov_strength: Option<f64>,
    pub cherenkov_threshold: Option<f64>,
    pub cherenkov_blur_radius: Option<f64>,

    // Cosmic Ink
    pub cosmic_ink_strength: Option<f64>,
    pub cosmic_ink_swirl_intensity: Option<f64>,

    // Aurora Veils
    pub aurora_veils_strength: Option<f64>,
    pub aurora_veils_curtain_count: Option<usize>,

    // Prismatic Halos
    pub prismatic_halos_strength: Option<f64>,
    pub prismatic_halos_threshold: Option<f64>,

    // Dimensional Glitch
    pub dimensional_glitch_strength: Option<f64>,
    pub dimensional_glitch_threshold: Option<f64>,

    // NEW: Halation (Photochemical Highlight Glow) - Museum Quality Upgrade
    pub enable_halation: Option<bool>,
    pub halation_strength: Option<f64>,
    pub halation_threshold: Option<f64>,
    pub halation_radius_scale: Option<f64>,
    pub halation_warmth: Option<f64>,
    pub halation_softness: Option<f64>,

    // NEW: Dodge & Burn (Saliency-Guided Focal Shaping) - Museum Quality Upgrade
    pub enable_dodge_burn: Option<bool>,
    pub dodge_burn_strength: Option<f64>,
    pub dodge_burn_dodge_amount: Option<f64>,
    pub dodge_burn_burn_amount: Option<f64>,
    pub dodge_burn_saliency_radius: Option<f64>,
    pub dodge_burn_luminance_weight: Option<f64>,
}

impl RandomizableEffectConfig {
    /// Resolve all Option<T> values: use explicit values or randomize.
    ///
    /// This is the orchestration layer that transforms a partially-specified configuration
    /// into a fully-resolved configuration ready for rendering.
    ///
    /// # Resolution Pipeline
    ///
    /// 1. **Generate Aesthetic Biases:** Create unique style coordinates
    /// 2. **Resolve Global Lighting:** Ensure coherent light source
    /// 3. **Resolve Dependencies First:** Palette, bloom strength (other params depend on these)
    /// 4. **Apply Parameter Linking:** Inverse correlations (e.g., high bloom → high ray threshold)
    /// 5. **Apply Palette Coherence:** Match fog color to gradient palette temperature
    /// 6. **Resolve All Parameters:** Enable flags and numeric values
    /// 7. **Special Mode Guarantee:** Ensure atmosphere in Special mode
    /// 8. **Apply Performance Guards:** Prevent extreme combinations
    ///
    /// # Returns
    ///
    /// A tuple of (`ResolvedEffectConfig`, `RandomizationLog`) containing:
    /// - Fully resolved configuration with all parameters determined
    /// - Log of all randomization decisions for reproducibility
    ///
    /// # Example
    ///
    /// ```
    /// # use three_body_problem::render::randomizable_config::RandomizableEffectConfig;
    /// # use three_body_problem::sim::Sha3RandomByteStream;
    /// let seed = vec![0x42, 0x43, 0x44, 0x45];
    /// let mut rng = Sha3RandomByteStream::new(&seed, 100.0, 300.0, 300.0, 1.0);
    /// let config = RandomizableEffectConfig::default();
    /// let (resolved, log) = config.resolve(&mut rng, 1920, 1080, false, 42);
    /// ```
    pub fn resolve(
        &self,
        rng: &mut Sha3RandomByteStream,
        width: u32,
        height: u32,
        special_mode: bool,
        noise_seed: i32,
    ) -> (ResolvedEffectConfig, RandomizationLog) {
        // =========================================================================
        // PHASE 1: Style Genome - Coherent Aesthetic DNA
        // =========================================================================
        // Generate 8-axis style fingerprint for this seed. This ensures
        // coherent aesthetics across all effect choices.
        let mut style_genome = StyleGenome::from_rng(rng);

        // MUSEUM QUALITY: Bias "photochemical" axis higher to favor warm, film-like output
        // This combats the "cold digital void" look by encouraging Halation/Texture.
        style_genome.photochemical = (style_genome.photochemical + 0.15).min(1.0);

        // =========================================================================
        // PHASE 1.5: Effect Theme Selection
        // =========================================================================
        // Select or randomize the effect theme. Themes coordinate multiple effects
        // for cohesive aesthetics (e.g., Ethereal, Dramatic, Cosmic).
        let effect_theme = match self.effect_theme {
            Some(theme) => theme,
            None => {
                if self.gallery_quality {
                    EffectTheme::random_gallery(rng)
                } else {
                    EffectTheme::random(rng)
                }
            }
        };

        // 1. Resolve Global Light Angle for Coherent Lighting FIRST (before creating randomizer)
        // We pick one angle for the whole scene to ensure shadows and textures match.
        // 50% chance of standard studio lighting (top-left, 135 deg), 50% random.
        let global_light_angle_random = rng.next_f64();
        let global_light_angle_value = rng.next_f64();
        let global_light_angle =
            if global_light_angle_random < 0.5 { 135.0 } else { global_light_angle_value * 360.0 };

        let mut randomizer = EffectRandomizer::new(rng, self.gallery_quality);
        let biases = randomizer.biases();
        let mut log = RandomizationLog::new(self.gallery_quality, biases);

        // Log style genome for reproducibility
        log.add_record(RandomizationRecord::new(
            format!(
                "style_genome: photo={:.2} ornate={:.2} ethereal={:.2} chrom={:.2} crisp={:.2} dramatic={:.2} organic={:.2} lum={:.2}",
                style_genome.photochemical, style_genome.ornate, style_genome.ethereal,
                style_genome.chromatic, style_genome.crisp, style_genome.dramatic,
                style_genome.organic, style_genome.luminous
            ),
            true,
            false,
        ));

        // =========================================================================
        // PHASE 2: Genome-Biased Effect Resolution
        // =========================================================================
        // Key aesthetic effects use genome-biased probabilities for coherence.
        // A "photochemical" genome will favor halation over chromatic bloom, etc.

        // Resolve key driving parameters (dependencies)
        // We resolve these first because other parameters depend on them for coherence.

        let enable_gradient_map = self.resolve_enable_with_genome(
            "gradient_map",
            self.enable_gradient_map,
            &mut randomizer,
            &style_genome,
            &mut log,
        );
        let gradient_map_palette = self.resolve_int(
            "gradient_map_palette",
            self.gradient_map_palette,
            &pd::GRADIENT_MAP_PALETTE,
            &mut randomizer,
            &mut log,
        );

        let enable_bloom =
            self.resolve_enable("bloom", self.enable_bloom, &mut randomizer, &mut log);
        // Note: blur_strength is the bloom strength
        let blur_strength = self.resolve_float(
            "blur_strength",
            self.blur_strength,
            &pd::BLUR_STRENGTH,
            &mut randomizer,
            &mut log,
        );

        // 3. Parameter Linking & Coherence Logic

        // Inverse Correlation: High bloom strength -> Higher exposure threshold for rays
        // This prevents the image from becoming completely white-out when both are strong.
        let crepuscular_rays_exposure_base = self.resolve_float(
            "crepuscular_rays_exposure",
            self.crepuscular_rays_exposure,
            &pd::CREPUSCULAR_RAYS_EXPOSURE,
            &mut randomizer,
            &mut log,
        );
        let crepuscular_rays_exposure = if blur_strength > 15.0 {
            // Boost exposure threshold significantly if bloom is very strong
            (crepuscular_rays_exposure_base * 1.5).min(0.95)
        } else {
            crepuscular_rays_exposure_base
        };

        // MUSEUM QUALITY TUNING (v2): Enhanced Palette Coherence
        // Derive fog colors directly from the gradient map palette's nebula colors.
        // This ensures atmospheric effects are visually coherent with the color grading
        // and provides variety across different palettes (fixes "too similar backgrounds" issue).
        use crate::post_effects::LuxuryPalette;

        let (fog_bias_r, fog_bias_g, fog_bias_b) = if enable_gradient_map {
            // Get nebula colors from the selected palette
            let palette = LuxuryPalette::from_index(gradient_map_palette);
            let nebula_colors = palette.nebula_colors();
            
            // Average the nebula colors for the fog base, giving more weight to darker tones
            // This creates atmospheric coherence with the nebula background
            let mut sum_r = 0.0;
            let mut sum_g = 0.0;
            let mut sum_b = 0.0;
            for color in &nebula_colors {
                sum_r += color[0];
                sum_g += color[1];
                sum_b += color[2];
            }
            let avg_r = sum_r / 4.0;
            let avg_g = sum_g / 4.0;
            let avg_b = sum_b / 4.0;
            
            // Scale slightly brighter for fog (fog is more visible than nebula)
            (avg_r * 1.3, avg_g * 1.3, avg_b * 1.3)
        } else {
            // Neutral default when gradient map is not active
            (0.12, 0.14, 0.18)
        };

        // Resolve fog colors
        let fog_r = self.resolve_float(
            "atmospheric_fog_color_r",
            self.atmospheric_fog_color_r,
            &pd::ATMOSPHERIC_FOG_COLOR_R,
            &mut randomizer,
            &mut log,
        );
        let fog_g = self.resolve_float(
            "atmospheric_fog_color_g",
            self.atmospheric_fog_color_g,
            &pd::ATMOSPHERIC_FOG_COLOR_G,
            &mut randomizer,
            &mut log,
        );
        let fog_b = self.resolve_float(
            "atmospheric_fog_color_b",
            self.atmospheric_fog_color_b,
            &pd::ATMOSPHERIC_FOG_COLOR_B,
            &mut randomizer,
            &mut log,
        );

        // Blend fog with palette-derived bias if gradient map is active and fog wasn't manually set
        // This creates variety: each palette produces a unique fog color
        let (final_fog_r, final_fog_g, final_fog_b) =
            if enable_gradient_map && self.atmospheric_fog_color_r.is_none() {
                // Use a stronger blend towards palette colors for more variety
                let blend = 0.6; // 60% palette, 40% random
                (
                    fog_r * (1.0 - blend) + fog_bias_r * blend,
                    fog_g * (1.0 - blend) + fog_bias_g * blend,
                    fog_b * (1.0 - blend) + fog_bias_b * blend,
                )
            } else {
                (fog_r, fog_g, fog_b)
            };

        // Resolve all parameters with logging
        let resolved = ResolvedEffectConfig {
            width,
            height,
            gallery_quality: self.gallery_quality,
            special_mode,
            noise_seed,
            effect_theme,

            // Effect enables
            enable_bloom,
            // Glow uses genome biasing - luminous genomes favor glow effects
            enable_glow: self.resolve_enable_with_genome(
                "glow",
                self.enable_glow,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            // Chromatic bloom uses genome biasing - chromatic genomes favor prismatic effects
            enable_chromatic_bloom: self.resolve_enable_with_genome(
                "chromatic_bloom",
                self.enable_chromatic_bloom,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            enable_perceptual_blur: self.resolve_enable(
                "perceptual_blur",
                self.enable_perceptual_blur,
                &mut randomizer,
                &mut log,
            ),
            // Micro contrast uses genome biasing - crisp genomes favor sharpness
            enable_micro_contrast: self.resolve_enable_with_genome(
                "micro_contrast",
                self.enable_micro_contrast,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            enable_gradient_map,
            enable_color_grade: self.resolve_enable(
                "color_grade",
                self.enable_color_grade,
                &mut randomizer,
                &mut log,
            ),
            enable_champleve: self.resolve_enable(
                "champleve",
                self.enable_champleve,
                &mut randomizer,
                &mut log,
            ),
            enable_aether: self.resolve_enable(
                "aether",
                self.enable_aether,
                &mut randomizer,
                &mut log,
            ),
            // Opalescence uses genome biasing - ornate genomes favor decorative effects
            enable_opalescence: self.resolve_enable_with_genome(
                "opalescence",
                self.enable_opalescence,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            // Edge luminance uses genome biasing - crisp + dramatic genomes favor edges
            enable_edge_luminance: self.resolve_enable_with_genome(
                "edge_luminance",
                self.enable_edge_luminance,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            // Atmospheric depth uses genome biasing - ethereal genomes favor atmosphere
            enable_atmospheric_depth: self.resolve_enable_with_genome(
                "atmospheric_depth",
                self.enable_atmospheric_depth,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            enable_crepuscular_rays: self.resolve_enable(
                "crepuscular_rays",
                self.enable_crepuscular_rays,
                &mut randomizer,
                &mut log,
            ),
            enable_volumetric_occlusion: self.resolve_enable(
                "volumetric_occlusion",
                self.enable_volumetric_occlusion,
                &mut randomizer,
                &mut log,
            ),
            enable_refractive_caustics: self.resolve_enable(
                "refractive_caustics",
                self.enable_refractive_caustics,
                &mut randomizer,
                &mut log,
            ),
            // Fine texture uses genome biasing - photochemical genomes favor surface detail
            enable_fine_texture: self.resolve_enable_with_genome(
                "fine_texture",
                self.enable_fine_texture,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),

            // New "Masterpiece" effects
            // SPECIAL MODE LOGIC:
            // In Special Mode, we GUARANTEE atmospheric depth via Aurora or Ink.
            // In Default Mode, we DISABLE them to preserve the "Clean/Geometric" distinction.
            enable_event_horizon: self.resolve_enable(
                "event_horizon",
                self.enable_event_horizon,
                &mut randomizer,
                &mut log,
            ),
            enable_cherenkov: self.resolve_enable(
                "cherenkov",
                self.enable_cherenkov,
                &mut randomizer,
                &mut log,
            ),

            // Cosmic Ink & Aurora Veils: The Signature of Special Mode
            enable_cosmic_ink: if special_mode {
                // In special mode, check if we enabled it explicitly, otherwise use bias probability
                // (High probability in resolve_enable via bias boost)
                self.resolve_enable("cosmic_ink", self.enable_cosmic_ink, &mut randomizer, &mut log)
            } else {
                // In default mode, disable to keep "Clean" look distinct from "Atmospheric" special mode
                false
            },

            enable_aurora_veils: if special_mode {
                self.resolve_enable(
                    "aurora_veils",
                    self.enable_aurora_veils,
                    &mut randomizer,
                    &mut log,
                )
            } else {
                false
            },

            enable_prismatic_halos: self.resolve_enable(
                "prismatic_halos",
                self.enable_prismatic_halos,
                &mut randomizer,
                &mut log,
            ),
            enable_dimensional_glitch: self.resolve_enable(
                "dimensional_glitch",
                self.enable_dimensional_glitch,
                &mut randomizer,
                &mut log,
            ),
            enable_deep_space: self.resolve_enable(
                "deep_space",
                self.enable_deep_space,
                &mut randomizer,
                &mut log,
            ),

            // Resolve all float/int parameters
            blur_strength,
            blur_radius_scale: self.resolve_float(
                "blur_radius_scale",
                self.blur_radius_scale,
                &pd::BLUR_RADIUS_SCALE,
                &mut randomizer,
                &mut log,
            ),
            blur_core_brightness: self.resolve_float(
                "blur_core_brightness",
                self.blur_core_brightness,
                &pd::BLUR_CORE_BRIGHTNESS,
                &mut randomizer,
                &mut log,
            ),
            dog_strength: self.resolve_float(
                "dog_strength",
                self.dog_strength,
                &pd::DOG_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            dog_sigma_scale: self.resolve_float(
                "dog_sigma_scale",
                self.dog_sigma_scale,
                &pd::DOG_SIGMA_SCALE,
                &mut randomizer,
                &mut log,
            ),
            dog_ratio: self.resolve_float(
                "dog_ratio",
                self.dog_ratio,
                &pd::DOG_RATIO,
                &mut randomizer,
                &mut log,
            ),
            glow_strength: self.resolve_float(
                "glow_strength",
                self.glow_strength,
                &pd::GLOW_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            glow_threshold: self.resolve_float(
                "glow_threshold",
                self.glow_threshold,
                &pd::GLOW_THRESHOLD,
                &mut randomizer,
                &mut log,
            ),
            glow_radius_scale: self.resolve_float(
                "glow_radius_scale",
                self.glow_radius_scale,
                &pd::GLOW_RADIUS_SCALE,
                &mut randomizer,
                &mut log,
            ),
            glow_sharpness: self.resolve_float(
                "glow_sharpness",
                self.glow_sharpness,
                &pd::GLOW_SHARPNESS,
                &mut randomizer,
                &mut log,
            ),
            glow_saturation_boost: self.resolve_float(
                "glow_saturation_boost",
                self.glow_saturation_boost,
                &pd::GLOW_SATURATION_BOOST,
                &mut randomizer,
                &mut log,
            ),
            chromatic_bloom_strength: self.resolve_float(
                "chromatic_bloom_strength",
                self.chromatic_bloom_strength,
                &pd::CHROMATIC_BLOOM_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            chromatic_bloom_radius_scale: self.resolve_float(
                "chromatic_bloom_radius_scale",
                self.chromatic_bloom_radius_scale,
                &pd::CHROMATIC_BLOOM_RADIUS_SCALE,
                &mut randomizer,
                &mut log,
            ),
            chromatic_bloom_separation_scale: self.resolve_float(
                "chromatic_bloom_separation_scale",
                self.chromatic_bloom_separation_scale,
                &pd::CHROMATIC_BLOOM_SEPARATION_SCALE,
                &mut randomizer,
                &mut log,
            ),
            chromatic_bloom_threshold: self.resolve_float(
                "chromatic_bloom_threshold",
                self.chromatic_bloom_threshold,
                &pd::CHROMATIC_BLOOM_THRESHOLD,
                &mut randomizer,
                &mut log,
            ),
            perceptual_blur_strength: self.resolve_float(
                "perceptual_blur_strength",
                self.perceptual_blur_strength,
                &pd::PERCEPTUAL_BLUR_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            color_grade_strength: self.resolve_float(
                "color_grade_strength",
                self.color_grade_strength,
                &pd::COLOR_GRADE_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            vignette_strength: self.resolve_float(
                "vignette_strength",
                self.vignette_strength,
                &pd::VIGNETTE_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            vignette_softness: self.resolve_float(
                "vignette_softness",
                self.vignette_softness,
                &pd::VIGNETTE_SOFTNESS,
                &mut randomizer,
                &mut log,
            ),
            vibrance: self.resolve_float(
                "vibrance",
                self.vibrance,
                &pd::VIBRANCE,
                &mut randomizer,
                &mut log,
            ),
            clarity_strength: self.resolve_float(
                "clarity_strength",
                self.clarity_strength,
                &pd::CLARITY_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            tone_curve_strength: self.resolve_float(
                "tone_curve_strength",
                self.tone_curve_strength,
                &pd::TONE_CURVE_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            gradient_map_strength: self.resolve_float(
                "gradient_map_strength",
                self.gradient_map_strength,
                &pd::GRADIENT_MAP_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            gradient_map_hue_preservation: self.resolve_float(
                "gradient_map_hue_preservation",
                self.gradient_map_hue_preservation,
                &pd::GRADIENT_MAP_HUE_PRESERVATION,
                &mut randomizer,
                &mut log,
            ),
            gradient_map_palette,
            opalescence_strength: self.resolve_float(
                "opalescence_strength",
                self.opalescence_strength,
                &pd::OPALESCENCE_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            opalescence_scale: self.resolve_float(
                "opalescence_scale",
                self.opalescence_scale,
                &pd::OPALESCENCE_SCALE,
                &mut randomizer,
                &mut log,
            ),
            opalescence_layers: self.resolve_int(
                "opalescence_layers",
                self.opalescence_layers,
                &pd::OPALESCENCE_LAYERS,
                &mut randomizer,
                &mut log,
            ),
            champleve_flow_alignment: self.resolve_float(
                "champleve_flow_alignment",
                self.champleve_flow_alignment,
                &pd::CHAMPLEVE_FLOW_ALIGNMENT,
                &mut randomizer,
                &mut log,
            ),
            champleve_interference_amplitude: self.resolve_float(
                "champleve_interference_amplitude",
                self.champleve_interference_amplitude,
                &pd::CHAMPLEVE_INTERFERENCE_AMPLITUDE,
                &mut randomizer,
                &mut log,
            ),
            champleve_rim_intensity: self.resolve_float(
                "champleve_rim_intensity",
                self.champleve_rim_intensity,
                &pd::CHAMPLEVE_RIM_INTENSITY,
                &mut randomizer,
                &mut log,
            ),
            champleve_rim_warmth: self.resolve_float(
                "champleve_rim_warmth",
                self.champleve_rim_warmth,
                &pd::CHAMPLEVE_RIM_WARMTH,
                &mut randomizer,
                &mut log,
            ),
            champleve_interior_lift: self.resolve_float(
                "champleve_interior_lift",
                self.champleve_interior_lift,
                &pd::CHAMPLEVE_INTERIOR_LIFT,
                &mut randomizer,
                &mut log,
            ),
            aether_flow_alignment: self.resolve_float(
                "aether_flow_alignment",
                self.aether_flow_alignment,
                &pd::AETHER_FLOW_ALIGNMENT,
                &mut randomizer,
                &mut log,
            ),
            aether_scattering_strength: self.resolve_float(
                "aether_scattering_strength",
                self.aether_scattering_strength,
                &pd::AETHER_SCATTERING_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            aether_iridescence_amplitude: self.resolve_float(
                "aether_iridescence_amplitude",
                self.aether_iridescence_amplitude,
                &pd::AETHER_IRIDESCENCE_AMPLITUDE,
                &mut randomizer,
                &mut log,
            ),
            aether_caustic_strength: self.resolve_float(
                "aether_caustic_strength",
                self.aether_caustic_strength,
                &pd::AETHER_CAUSTIC_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            micro_contrast_strength: self.resolve_float(
                "micro_contrast_strength",
                self.micro_contrast_strength,
                &pd::MICRO_CONTRAST_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            micro_contrast_radius: self.resolve_int(
                "micro_contrast_radius",
                self.micro_contrast_radius,
                &pd::MICRO_CONTRAST_RADIUS,
                &mut randomizer,
                &mut log,
            ),
            edge_luminance_strength: self.resolve_float(
                "edge_luminance_strength",
                self.edge_luminance_strength,
                &pd::EDGE_LUMINANCE_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            edge_luminance_threshold: self.resolve_float(
                "edge_luminance_threshold",
                self.edge_luminance_threshold,
                &pd::EDGE_LUMINANCE_THRESHOLD,
                &mut randomizer,
                &mut log,
            ),
            edge_luminance_brightness_boost: self.resolve_float(
                "edge_luminance_brightness_boost",
                self.edge_luminance_brightness_boost,
                &pd::EDGE_LUMINANCE_BRIGHTNESS_BOOST,
                &mut randomizer,
                &mut log,
            ),
            atmospheric_depth_strength: self.resolve_float(
                "atmospheric_depth_strength",
                self.atmospheric_depth_strength,
                &pd::ATMOSPHERIC_DEPTH_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            atmospheric_desaturation: self.resolve_float(
                "atmospheric_desaturation",
                self.atmospheric_desaturation,
                &pd::ATMOSPHERIC_DESATURATION,
                &mut randomizer,
                &mut log,
            ),
            atmospheric_darkening: self.resolve_float(
                "atmospheric_darkening",
                self.atmospheric_darkening,
                &pd::ATMOSPHERIC_DARKENING,
                &mut randomizer,
                &mut log,
            ),
            atmospheric_fog_color_r: final_fog_r,
            atmospheric_fog_color_g: final_fog_g,
            atmospheric_fog_color_b: final_fog_b,

            crepuscular_rays_strength: self.resolve_float(
                "crepuscular_rays_strength",
                self.crepuscular_rays_strength,
                &pd::CREPUSCULAR_RAYS_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            crepuscular_rays_density: self.resolve_float(
                "crepuscular_rays_density",
                self.crepuscular_rays_density,
                &pd::CREPUSCULAR_RAYS_DENSITY,
                &mut randomizer,
                &mut log,
            ),
            crepuscular_rays_decay: self.resolve_float(
                "crepuscular_rays_decay",
                self.crepuscular_rays_decay,
                &pd::CREPUSCULAR_RAYS_DECAY,
                &mut randomizer,
                &mut log,
            ),
            crepuscular_rays_weight: self.resolve_float(
                "crepuscular_rays_weight",
                self.crepuscular_rays_weight,
                &pd::CREPUSCULAR_RAYS_WEIGHT,
                &mut randomizer,
                &mut log,
            ),
            crepuscular_rays_exposure,

            volumetric_occlusion_strength: self.resolve_float(
                "volumetric_occlusion_strength",
                self.volumetric_occlusion_strength,
                &pd::VOLUMETRIC_OCCLUSION_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            volumetric_occlusion_radius: self.resolve_int(
                "volumetric_occlusion_radius",
                self.volumetric_occlusion_radius,
                &pd::VOLUMETRIC_OCCLUSION_RADIUS,
                &mut randomizer,
                &mut log,
            ),
            // Override light angle with global one if not manually set
            volumetric_occlusion_light_angle: if self.volumetric_occlusion_light_angle.is_none() {
                global_light_angle
            } else {
                self.resolve_float(
                    "volumetric_occlusion_light_angle",
                    self.volumetric_occlusion_light_angle,
                    &pd::VOLUMETRIC_OCCLUSION_LIGHT_ANGLE,
                    &mut randomizer,
                    &mut log,
                )
            },
            volumetric_occlusion_density_scale: self.resolve_float(
                "volumetric_occlusion_density_scale",
                self.volumetric_occlusion_density_scale,
                &pd::VOLUMETRIC_OCCLUSION_DENSITY_SCALE,
                &mut randomizer,
                &mut log,
            ),
            volumetric_occlusion_decay: self.resolve_float(
                "volumetric_occlusion_decay",
                self.volumetric_occlusion_decay,
                &pd::VOLUMETRIC_OCCLUSION_DECAY,
                &mut randomizer,
                &mut log,
            ),
            volumetric_occlusion_threshold: self.resolve_float(
                "volumetric_occlusion_threshold",
                self.volumetric_occlusion_threshold,
                &pd::VOLUMETRIC_OCCLUSION_THRESHOLD,
                &mut randomizer,
                &mut log,
            ),

            refractive_caustics_strength: self.resolve_float(
                "refractive_caustics_strength",
                self.refractive_caustics_strength,
                &pd::REFRACTIVE_CAUSTICS_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            refractive_caustics_ior: self.resolve_float(
                "refractive_caustics_ior",
                self.refractive_caustics_ior,
                &pd::REFRACTIVE_CAUSTICS_IOR,
                &mut randomizer,
                &mut log,
            ),
            refractive_caustics_dispersion: self.resolve_float(
                "refractive_caustics_dispersion",
                self.refractive_caustics_dispersion,
                &pd::REFRACTIVE_CAUSTICS_DISPERSION,
                &mut randomizer,
                &mut log,
            ),
            refractive_caustics_focus: self.resolve_float(
                "refractive_caustics_focus",
                self.refractive_caustics_focus,
                &pd::REFRACTIVE_CAUSTICS_FOCUS,
                &mut randomizer,
                &mut log,
            ),
            refractive_caustics_threshold: self.resolve_float(
                "refractive_caustics_threshold",
                self.refractive_caustics_threshold,
                &pd::REFRACTIVE_CAUSTICS_THRESHOLD,
                &mut randomizer,
                &mut log,
            ),

            fine_texture_strength: self.resolve_float(
                "fine_texture_strength",
                self.fine_texture_strength,
                &pd::FINE_TEXTURE_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            fine_texture_scale: self.resolve_float(
                "fine_texture_scale",
                self.fine_texture_scale,
                &pd::FINE_TEXTURE_SCALE,
                &mut randomizer,
                &mut log,
            ),
            fine_texture_contrast: self.resolve_float(
                "fine_texture_contrast",
                self.fine_texture_contrast,
                &pd::FINE_TEXTURE_CONTRAST,
                &mut randomizer,
                &mut log,
            ),
            fine_texture_specular: self.resolve_float(
                "fine_texture_specular",
                self.fine_texture_specular,
                &pd::FINE_TEXTURE_SPECULAR,
                &mut randomizer,
                &mut log,
            ),
            // Override light angle with global one if not manually set
            fine_texture_light_angle: if self.fine_texture_light_angle.is_none() {
                global_light_angle
            } else {
                self.resolve_float(
                    "fine_texture_light_angle",
                    self.fine_texture_light_angle,
                    &pd::FINE_TEXTURE_LIGHT_ANGLE,
                    &mut randomizer,
                    &mut log,
                )
            },
            fine_texture_type: self.resolve_int(
                "fine_texture_type",
                self.fine_texture_type,
                &pd::FINE_TEXTURE_TYPE,
                &mut randomizer,
                &mut log,
            ),

            hdr_scale: self.resolve_float(
                "hdr_scale",
                self.hdr_scale,
                &pd::HDR_SCALE,
                &mut randomizer,
                &mut log,
            ),
            nebula_strength: self.resolve_float(
                "nebula_strength",
                self.nebula_strength,
                &pd::NEBULA_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            nebula_octaves: self.resolve_int(
                "nebula_octaves",
                self.nebula_octaves,
                &pd::NEBULA_OCTAVES,
                &mut randomizer,
                &mut log,
            ),
            nebula_base_frequency: self.resolve_float(
                "nebula_base_frequency",
                self.nebula_base_frequency,
                &pd::NEBULA_BASE_FREQUENCY,
                &mut randomizer,
                &mut log,
            ),

            // New "Masterpiece" effect parameters (using simple fixed ranges for now)
            event_horizon_strength: self.event_horizon_strength.unwrap_or(if special_mode {
                0.45
            } else {
                0.25
            }),
            event_horizon_mass_scale: self.event_horizon_mass_scale.unwrap_or(2.5),
            cherenkov_strength: self.cherenkov_strength.unwrap_or(if special_mode {
                0.55
            } else {
                0.30
            }),
            cherenkov_threshold: self.cherenkov_threshold.unwrap_or(if special_mode {
                0.65
            } else {
                0.72
            }),
            cherenkov_blur_radius: self.cherenkov_blur_radius.unwrap_or(if special_mode {
                8.0
            } else {
                5.0
            }),
            cosmic_ink_strength: self.cosmic_ink_strength.unwrap_or(if special_mode {
                0.40
            } else {
                0.22
            }),
            cosmic_ink_swirl_intensity: self.cosmic_ink_swirl_intensity.unwrap_or(0.75),
            aurora_veils_strength: self.aurora_veils_strength.unwrap_or(if special_mode {
                0.35
            } else {
                0.18
            }),
            aurora_veils_curtain_count: self
                .aurora_veils_curtain_count
                .unwrap_or(if special_mode { 5 } else { 3 }),
            prismatic_halos_strength: self.prismatic_halos_strength.unwrap_or(0.42),
            prismatic_halos_threshold: self.prismatic_halos_threshold.unwrap_or(0.70),
            dimensional_glitch_strength: self.dimensional_glitch_strength.unwrap_or(0.35),
            dimensional_glitch_threshold: self.dimensional_glitch_threshold.unwrap_or(0.75),

            // NEW: Halation (Photochemical Highlight Glow)
            // Uses genome biasing - photochemical genomes strongly favor halation
            enable_halation: self.resolve_enable_with_genome(
                "halation",
                self.enable_halation,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            halation_strength: self.resolve_float(
                "halation_strength",
                self.halation_strength,
                &pd::HALATION_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            halation_threshold: self.resolve_float(
                "halation_threshold",
                self.halation_threshold,
                &pd::HALATION_THRESHOLD,
                &mut randomizer,
                &mut log,
            ),
            halation_radius_scale: self.resolve_float(
                "halation_radius_scale",
                self.halation_radius_scale,
                &pd::HALATION_RADIUS_SCALE,
                &mut randomizer,
                &mut log,
            ),
            halation_warmth: self.resolve_float(
                "halation_warmth",
                self.halation_warmth,
                &pd::HALATION_WARMTH,
                &mut randomizer,
                &mut log,
            ),
            halation_softness: self.resolve_float(
                "halation_softness",
                self.halation_softness,
                &pd::HALATION_SOFTNESS,
                &mut randomizer,
                &mut log,
            ),

            // NEW: Dodge & Burn (Saliency-Guided Focal Shaping)
            // Uses genome biasing - dramatic + photochemical genomes favor dodge & burn
            enable_dodge_burn: self.resolve_enable_with_genome(
                "dodge_burn",
                self.enable_dodge_burn,
                &mut randomizer,
                &style_genome,
                &mut log,
            ),
            dodge_burn_strength: self.resolve_float(
                "dodge_burn_strength",
                self.dodge_burn_strength,
                &pd::DODGE_BURN_STRENGTH,
                &mut randomizer,
                &mut log,
            ),
            dodge_burn_dodge_amount: self.resolve_float(
                "dodge_burn_dodge_amount",
                self.dodge_burn_dodge_amount,
                &pd::DODGE_BURN_DODGE_AMOUNT,
                &mut randomizer,
                &mut log,
            ),
            dodge_burn_burn_amount: self.resolve_float(
                "dodge_burn_burn_amount",
                self.dodge_burn_burn_amount,
                &pd::DODGE_BURN_BURN_AMOUNT,
                &mut randomizer,
                &mut log,
            ),
            dodge_burn_saliency_radius: self.resolve_float(
                "dodge_burn_saliency_radius",
                self.dodge_burn_saliency_radius,
                &pd::DODGE_BURN_SALIENCY_RADIUS,
                &mut randomizer,
                &mut log,
            ),
            dodge_burn_luminance_weight: self.resolve_float(
                "dodge_burn_luminance_weight",
                self.dodge_burn_luminance_weight,
                &pd::DODGE_BURN_LUMINANCE_WEIGHT,
                &mut randomizer,
                &mut log,
            ),

            // Resolve constrained pair (clip_black < clip_white)
            clip_black: 0.0, // Will be set below
            clip_white: 0.0, // Will be set below
        };

        // Resolve clip_black and clip_white as ordered pair
        let (clip_black, clip_white) = if self.clip_black.is_some() && self.clip_white.is_some() {
            // Both specified - ensure ordering
            let black = self.clip_black.unwrap();
            let white = self.clip_white.unwrap();
            if black < white { (black, white) } else { (white, black) }
        } else if self.clip_black.is_some() {
            // Only black specified, randomize white
            let black = self.clip_black.unwrap();
            let white = randomizer.randomize_float(&pd::CLIP_WHITE);
            if black < white { (black, white) } else { (white, black) }
        } else if self.clip_white.is_some() {
            // Only white specified, randomize black
            let white = self.clip_white.unwrap();
            let black = randomizer.randomize_float(&pd::CLIP_BLACK);
            if black < white { (black, white) } else { (white, black) }
        } else {
            // Both random - use ordered pair
            randomizer.randomize_ordered_pair(&pd::CLIP_BLACK, &pd::CLIP_WHITE)
        };

        // Store resolved clip values
        let resolved = ResolvedEffectConfig { clip_black, clip_white, ..resolved };

        // Log clip parameters
        let mut clip_record = RandomizationRecord::new("clipping".to_string(), true, false);
        clip_record.add_float(
            "clip_black".to_string(),
            clip_black,
            self.clip_black.is_none(),
            pd::CLIP_BLACK.range(self.gallery_quality),
        );
        clip_record.add_float(
            "clip_white".to_string(),
            clip_white,
            self.clip_white.is_none(),
            pd::CLIP_WHITE.range(self.gallery_quality),
        );
        log.add_record(clip_record);

        // Apply conflict detection and adjustments
        let mut resolved = apply_conflict_detection(resolved, &mut log);

        // =========================================================================
        // MUSEUM QUALITY ENFORCEMENT
        // =========================================================================
        // Post-resolve enforcement ensures every image meets exhibition standards.
        // This section implements the "gallery floor" quality baseline.
        // =========================================================================

        // 4. REGULAR MODE: Depth Cue Guarantee
        // Volumetric occlusion is essential for professional 3D depth perception.
        // Without it, images appear flat and amateur. Force-enable if disabled.
        if !resolved.special_mode && !resolved.enable_volumetric_occlusion {
            // 85% chance to force-enable volumetric occlusion in regular mode
            // This ensures most images have depth, while allowing some flat geometric pieces
            let force_depth = rng.next_f64() < 0.85;
            if force_depth {
                resolved.enable_volumetric_occlusion = true;
                log.add_record(RandomizationRecord::new(
                    "volumetric_occlusion".to_string(),
                    true,
                    false,
                ));
            }
        }

        // 5. GALLERY/SPECIAL MODE: Maximum Beauty Enforcement
        // Gallery mode (--special) should maximize all beauty effects for cinematic impact.
        // This is the "exhibition showpiece" mode - no compromises on visual richness.
        //
        // MUSEUM QUALITY TUNING (v2): Changed from 100% mandatory to 92-95% probabilistic.
        // This introduces variety while maintaining the high quality floor.
        // Previously, 100% enforcement of darkening effects caused all images to be too dark
        // and look too similar. The small chance of disabling effects creates more variety.
        if resolved.special_mode {
            // 5a. Atmospheric Effect Guarantee (92% - slight chance for clean aesthetic)
            // At least ONE atmospheric effect should be active for gallery-worthy depth.
            if !resolved.enable_cosmic_ink && !resolved.enable_aurora_veils {
                // 92% chance to force an atmospheric effect
                let force_atmospheric = rng.next_f64() < 0.92;
                if force_atmospheric {
                    // Select based on aesthetic biases for coherent visual language
                    let ink_score = biases.complexity * 0.5 + biases.energy_vs_matter * 0.8;
                    let aurora_score =
                        (1.0 - biases.energy_vs_matter) * 0.8 + (1.0 - biases.vintage_vs_digital) * 0.3;

                    if ink_score > aurora_score {
                        resolved.enable_cosmic_ink = true;
                        log.add_record(RandomizationRecord::new("cosmic_ink".to_string(), true, false));
                    } else {
                        resolved.enable_aurora_veils = true;
                        log.add_record(RandomizationRecord::new(
                            "aurora_veils".to_string(),
                            true,
                            false,
                        ));
                    }
                }
            }

            // 5b. Volumetric Occlusion (92% - occasionally skip for brighter images)
            // 3D depth perception is important but not always necessary.
            // TUNING: Reduced from 100% to allow some images without heavy shadowing.
            if !resolved.enable_volumetric_occlusion {
                let force_volumetric = rng.next_f64() < 0.92;
                if force_volumetric {
                    resolved.enable_volumetric_occlusion = true;
                    log.add_record(RandomizationRecord::new(
                        "volumetric_occlusion".to_string(),
                        true,
                        false,
                    ));
                }
            }

            // 5c. Atmospheric Depth (88% - occasionally skip for cleaner look)
            // Aerial perspective adds depth but also darkening.
            // TUNING: Reduced from 100% to allow more brightness variety.
            if !resolved.enable_atmospheric_depth {
                let force_atmospheric_depth = rng.next_f64() < 0.88;
                if force_atmospheric_depth {
                    resolved.enable_atmospheric_depth = true;
                    log.add_record(RandomizationRecord::new(
                        "atmospheric_depth".to_string(),
                        true,
                        false,
                    ));
                }
            }

            // 5d. Chromatic Bloom is HIGHLY encouraged in gallery mode
            // Prismatic color separation is a luxury signature effect.
            if !resolved.enable_chromatic_bloom {
                let force_chromatic = rng.next_f64() < 0.80;
                if force_chromatic {
                    resolved.enable_chromatic_bloom = true;
                    log.add_record(RandomizationRecord::new(
                        "chromatic_bloom".to_string(),
                        true,
                        false,
                    ));
                }
            }

            // 5e. Opalescence is HIGHLY encouraged in gallery mode
            // Gem-like iridescence adds precious material quality.
            if !resolved.enable_opalescence {
                let force_opal = rng.next_f64() < 0.75;
                if force_opal {
                    resolved.enable_opalescence = true;
                    log.add_record(RandomizationRecord::new(
                        "opalescence".to_string(),
                        true,
                        false,
                    ));
                }
            }

            // 5f. Edge Luminance refines form in gallery mode
            if !resolved.enable_edge_luminance {
                let force_edge = rng.next_f64() < 0.70;
                if force_edge {
                    resolved.enable_edge_luminance = true;
                    log.add_record(RandomizationRecord::new(
                        "edge_luminance".to_string(),
                        true,
                        false,
                    ));
                }
            }

            // 5g. Deep Space volumetric scattering adds cosmic atmosphere
            if !resolved.enable_deep_space {
                let force_deep = rng.next_f64() < 0.60;
                if force_deep {
                    resolved.enable_deep_space = true;
                    log.add_record(RandomizationRecord::new(
                        "deep_space".to_string(),
                        true,
                        false,
                    ));
                }
            }
        }

        // =========================================================================
        // PHASE 3: Artifact Budget - Soft Quality Guardrails
        // =========================================================================
        // Apply artifact budget to prevent "plugin soup" aesthetic.
        // When multiple artifact-prone effects are too strong, scale them back.
        let artifact_budget = ArtifactBudget::museum_quality();

        // Auto-disable dimensional glitch for museum quality (user preference)
        if artifact_budget.should_disable_glitch() && resolved.enable_dimensional_glitch {
            resolved.enable_dimensional_glitch = false;
            log.add_record(RandomizationRecord::new(
                "dimensional_glitch_disabled".to_string(),
                false,
                false,
            ));
        }

        // Apply budget - scales down artifact-prone effects if over budget
        if let Some(scale_factor) = artifact_budget.apply(&mut resolved) {
            log.add_record(RandomizationRecord::new(
                format!("artifact_budget_applied: scale={:.3}", scale_factor),
                true,
                false,
            ));
        }

        // MUSEUM QUALITY PIPELINE:
        // Apply artifact budget at the end of resolution to prevent "plugin soup" aesthetic.
        let artifact_budget = ArtifactBudget::museum_quality();
        
        // Auto-disable dimensional glitch for museum quality (unless specifically requested)
        if artifact_budget.should_disable_glitch() && self.enable_dimensional_glitch.is_none() {
            resolved.enable_dimensional_glitch = false;
            log.add_record(RandomizationRecord::new(
                "dimensional_glitch_auto_disabled".to_string(),
                false,
                false,
            ));
        }

        // Apply budget - scales down artifact-prone effects if over budget
        if let Some(scale_factor) = artifact_budget.apply(&mut resolved) {
            log.add_record(RandomizationRecord::new(
                format!("artifact_budget_applied: scale={:.3}", scale_factor),
                true,
                false,
            ));
        }

        // =========================================================================
        // PHASE 7: Apply Effect Theme Modifiers
        // =========================================================================
        // Apply theme-specific strength multipliers for cohesive aesthetics.
        // This is the final touch that coordinates multiple effects together.
        let resolved = apply_theme_modifiers(resolved, &mut log);

        (resolved, log)
    }

    fn resolve_enable(
        &self,
        name: &str,
        value: Option<bool>,
        randomizer: &mut EffectRandomizer<'_>,
        log: &mut RandomizationLog,
    ) -> bool {
        let (enabled, was_randomized) = match value {
            Some(v) => (v, false),
            None => (randomizer.randomize_enable(name), true),
        };

        log.add_record(RandomizationRecord::new(name.to_string(), enabled, was_randomized));

        enabled
    }

    /// Resolve enable with genome-biased probability.
    ///
    /// Uses the StyleGenome to adjust base probabilities for coherent aesthetics.
    /// For example, a photochemical genome will favor halation over chromatic bloom.
    fn resolve_enable_with_genome(
        &self,
        name: &str,
        value: Option<bool>,
        randomizer: &mut EffectRandomizer<'_>,
        genome: &StyleGenome,
        log: &mut RandomizationLog,
    ) -> bool {
        let (enabled, was_randomized) = match value {
            Some(v) => (v, false),
            None => {
                // Get base probability from randomizer, then bias with genome
                let base_prob = randomizer.base_probability(name);
                let biased_prob = genome.effect_probability(name, base_prob);

                // Resolve using biased probability
                let roll = randomizer.rng().next_f64();
                (roll < biased_prob, true)
            }
        };

        log.add_record(RandomizationRecord::new(name.to_string(), enabled, was_randomized));

        enabled
    }

    fn resolve_float(
        &self,
        name: &str,
        value: Option<f64>,
        descriptor: &pd::FloatParamDescriptor,
        randomizer: &mut EffectRandomizer<'_>,
        log: &mut RandomizationLog,
    ) -> f64 {
        let (resolved, was_randomized) = match value {
            Some(v) => (v, false),
            None => (randomizer.randomize_float(descriptor), true),
        };

        // Find or create record for this parameter's effect group
        let effect_name = Self::effect_group_name(name);
        let record_idx = log.effects.iter().position(|r| r.effect_name == effect_name);

        if let Some(idx) = record_idx {
            log.effects[idx].add_float(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
        } else {
            let mut record = RandomizationRecord::new(effect_name, true, false);
            record.add_float(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
            log.add_record(record);
        }

        resolved
    }

    fn resolve_int(
        &self,
        name: &str,
        value: Option<usize>,
        descriptor: &pd::IntParamDescriptor,
        randomizer: &mut EffectRandomizer<'_>,
        log: &mut RandomizationLog,
    ) -> usize {
        let (resolved, was_randomized) = match value {
            Some(v) => (v, false),
            None => (randomizer.randomize_int(descriptor), true),
        };

        // Find or create record for this parameter's effect group
        let effect_name = Self::effect_group_name(name);
        let record_idx = log.effects.iter().position(|r| r.effect_name == effect_name);

        if let Some(idx) = record_idx {
            log.effects[idx].add_int(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
        } else {
            let mut record = RandomizationRecord::new(effect_name, true, false);
            record.add_int(
                name.to_string(),
                resolved,
                was_randomized,
                descriptor.range(randomizer.gallery_quality()),
            );
            log.add_record(record);
        }

        resolved
    }

    /// Extract effect group name from parameter name (e.`g`., "glow_strength" -> "glow")
    fn effect_group_name(param_name: &str) -> String {
        param_name.split('_').next().unwrap_or(param_name).to_string()
    }
}

/// Fully resolved effect configuration with all parameters determined.
#[derive(Clone, Debug)]
pub struct ResolvedEffectConfig {
    pub width: u32,
    pub height: u32,
    #[allow(dead_code)] // Stored for logging purposes
    pub gallery_quality: bool,
    pub special_mode: bool,
    pub noise_seed: i32,

    // MUSEUM QUALITY: Selected effect theme
    pub effect_theme: EffectTheme,

    // Effect enables
    pub enable_bloom: bool,
    pub enable_glow: bool,
    pub enable_chromatic_bloom: bool,
    pub enable_perceptual_blur: bool,
    pub enable_micro_contrast: bool,
    pub enable_gradient_map: bool,
    pub enable_color_grade: bool,
    pub enable_champleve: bool,
    pub enable_aether: bool,
    pub enable_opalescence: bool,
    pub enable_edge_luminance: bool,
    pub enable_atmospheric_depth: bool,
    pub enable_crepuscular_rays: bool,
    pub enable_volumetric_occlusion: bool,
    pub enable_refractive_caustics: bool,
    pub enable_fine_texture: bool,

    // New "Masterpiece" effects
    pub enable_event_horizon: bool,
    pub enable_cherenkov: bool,
    pub enable_cosmic_ink: bool,
    pub enable_aurora_veils: bool,
    pub enable_prismatic_halos: bool,
    pub enable_dimensional_glitch: bool,
    pub enable_deep_space: bool,

    // Parameters
    pub blur_strength: f64,
    pub blur_radius_scale: f64,
    pub blur_core_brightness: f64,
    pub dog_strength: f64,
    pub dog_sigma_scale: f64,
    pub dog_ratio: f64,
    pub glow_strength: f64,
    pub glow_threshold: f64,
    pub glow_radius_scale: f64,
    pub glow_sharpness: f64,
    pub glow_saturation_boost: f64,
    pub chromatic_bloom_strength: f64,
    pub chromatic_bloom_radius_scale: f64,
    pub chromatic_bloom_separation_scale: f64,
    pub chromatic_bloom_threshold: f64,
    pub perceptual_blur_strength: f64,
    pub color_grade_strength: f64,
    pub vignette_strength: f64,
    pub vignette_softness: f64,
    pub vibrance: f64,
    pub clarity_strength: f64,
    pub tone_curve_strength: f64,
    pub gradient_map_strength: f64,
    pub gradient_map_hue_preservation: f64,
    pub gradient_map_palette: usize, // Palette index (0-14)
    pub opalescence_strength: f64,
    pub opalescence_scale: f64,
    pub opalescence_layers: usize,
    pub champleve_flow_alignment: f64,
    pub champleve_interference_amplitude: f64,
    pub champleve_rim_intensity: f64,
    pub champleve_rim_warmth: f64,
    pub champleve_interior_lift: f64,
    pub aether_flow_alignment: f64,
    pub aether_scattering_strength: f64,
    pub aether_iridescence_amplitude: f64,
    pub aether_caustic_strength: f64,
    pub micro_contrast_strength: f64,
    pub micro_contrast_radius: usize,
    pub edge_luminance_strength: f64,
    pub edge_luminance_threshold: f64,
    pub edge_luminance_brightness_boost: f64,
    pub atmospheric_depth_strength: f64,
    pub atmospheric_desaturation: f64,
    pub atmospheric_darkening: f64,
    pub atmospheric_fog_color_r: f64, // RGB fog color components
    pub atmospheric_fog_color_g: f64,
    pub atmospheric_fog_color_b: f64,
    pub crepuscular_rays_strength: f64,
    pub crepuscular_rays_density: f64,
    pub crepuscular_rays_decay: f64,
    pub crepuscular_rays_weight: f64,
    pub crepuscular_rays_exposure: f64,
    pub volumetric_occlusion_strength: f64,
    pub volumetric_occlusion_radius: usize,
    pub volumetric_occlusion_light_angle: f64,
    pub volumetric_occlusion_density_scale: f64,
    pub volumetric_occlusion_decay: f64,
    pub volumetric_occlusion_threshold: f64,
    pub refractive_caustics_strength: f64,
    pub refractive_caustics_ior: f64,
    pub refractive_caustics_dispersion: f64,
    pub refractive_caustics_focus: f64,
    pub refractive_caustics_threshold: f64,
    pub fine_texture_strength: f64,
    pub fine_texture_scale: f64,
    pub fine_texture_contrast: f64,
    pub fine_texture_specular: f64,
    pub fine_texture_light_angle: f64,
    pub fine_texture_type: usize, // 0=Canvas, 1=Impasto
    pub hdr_scale: f64,
    pub clip_black: f64,
    pub clip_white: f64,
    pub nebula_strength: f64,
    pub nebula_octaves: usize,
    pub nebula_base_frequency: f64,

    // New "Masterpiece" effect parameters
    pub event_horizon_strength: f64,
    pub event_horizon_mass_scale: f64,
    pub cherenkov_strength: f64,
    pub cherenkov_threshold: f64,
    pub cherenkov_blur_radius: f64,
    pub cosmic_ink_strength: f64,
    pub cosmic_ink_swirl_intensity: f64,
    pub aurora_veils_strength: f64,
    pub aurora_veils_curtain_count: usize,
    pub prismatic_halos_strength: f64,
    pub prismatic_halos_threshold: f64,
    pub dimensional_glitch_strength: f64,
    pub dimensional_glitch_threshold: f64,

    // NEW: Halation (Photochemical Highlight Glow) - Museum Quality Upgrade
    pub enable_halation: bool,
    pub halation_strength: f64,
    pub halation_threshold: f64,
    pub halation_radius_scale: f64,
    pub halation_warmth: f64,
    pub halation_softness: f64,

    // NEW: Dodge & Burn (Saliency-Guided Focal Shaping) - Museum Quality Upgrade
    pub enable_dodge_burn: bool,
    pub dodge_burn_strength: f64,
    pub dodge_burn_dodge_amount: f64,
    pub dodge_burn_burn_amount: f64,
    pub dodge_burn_saliency_radius: f64,
    pub dodge_burn_luminance_weight: f64,
}

/// Apply essential constraints to prevent performance catastrophes and mathematical impossibilities.
///
/// Philosophy: Maximum exploration with minimum intervention.
/// - NO aesthetic constraints (oversaturation, clutter, darkness are valid artistic choices)
/// - ONLY essential guards: performance, stability, mathematical validity
/// - Parameters are chosen independently to maximize exploration of visual space
fn apply_conflict_detection(
    mut config: ResolvedEffectConfig,
    log: &mut RandomizationLog,
) -> ResolvedEffectConfig {
    let mut adjustments = Vec::new();

    // ============================================================================
    // ESSENTIAL CONSTRAINT 1: Performance Guard - Extreme Blur
    // ============================================================================
    // Prevents: Out-of-memory errors or multi-hour render times
    // Threshold: Only triggers at truly extreme combinations (top 5% of range)
    //
    // Large blur radius (>60px at 1080p) combined with high iteration count
    // can cause >3GB memory allocation and >10 minutes per frame
    if config.enable_bloom && config.blur_radius_scale > 0.060 && config.blur_strength > 24.0 {
        let original_radius = config.blur_radius_scale;
        let original_strength = config.blur_strength;

        // Scale back just enough to stay within performance envelope
        let performance_factor = 0.85;
        config.blur_radius_scale *= performance_factor;
        config.blur_strength *= performance_factor;

        adjustments.push(format!(
            "Performance guard: Scaled extreme blur parameters (radius: {:.4} -> {:.4}, strength: {:.2} -> {:.2}) to prevent memory/time issues",
            original_radius, config.blur_radius_scale,
            original_strength, config.blur_strength
        ));
    }

    // ============================================================================
    // ESSENTIAL CONSTRAINT 2: Exponential Cost Guard - Opalescence Layers
    // ============================================================================
    // Prevents: Exponential performance degradation
    // Threshold: Only restricts most extreme combination (6+ layers at high strength)
    //
    // Each opalescence layer multiplies rendering cost. 6+ layers at high strength
    // can cause minutes per frame due to nested interference calculations.
    if config.enable_opalescence
        && config.opalescence_layers > 5
        && config.opalescence_strength > 0.30
    {
        let original_layers = config.opalescence_layers;

        config.opalescence_layers = 5;

        adjustments.push(format!(
            "Performance guard: Capped opalescence_layers ({} -> 5) at high strength ({:.2}) to prevent exponential cost",
            original_layers, config.opalescence_strength
        ));
    }

    // ============================================================================
    // Note: All aesthetic conflict rules have been removed to maximize exploration.
    // Oversaturation, visual clutter, muddy looks, and extreme darkness are valid
    // artistic outcomes. Users can regenerate with different seeds if desired.
    // ============================================================================

    // Log adjustments if any were made
    if !adjustments.is_empty() {
        let mut adjustment_record =
            RandomizationRecord::new("essential_constraints".to_string(), true, false);

        for adjustment in adjustments {
            adjustment_record.parameters.push(
                crate::render::effect_randomizer::RandomizedParameter {
                    name: "performance_guard".to_string(),
                    value: adjustment,
                    was_randomized: false,
                    range_used: "N/A".to_string(),
                },
            );
        }

        log.add_record(adjustment_record);
    }

    config
}

/// Apply effect theme modifiers to scale strengths for cohesive aesthetics.
///
/// Each theme has specific multipliers that boost or reduce certain effects
/// to create a unified visual style. For example:
/// - Ethereal: Boosts soft effects (halation, chromatic bloom), reduces harsh effects
/// - Dramatic: Boosts contrast effects (volumetric occlusion), reduces soft effects
///
/// This is applied after all other resolution to ensure themes have final say on aesthetics.
fn apply_theme_modifiers(
    mut config: ResolvedEffectConfig,
    log: &mut RandomizationLog,
) -> ResolvedEffectConfig {
    let mods = config.effect_theme.modifiers();

    // Apply multipliers to relevant strengths
    // Helper to apply modifier with clamping
    let apply = |value: f64, multiplier: f64| -> f64 { (value * multiplier).clamp(0.0, 1.0) };

    // Bloom & Glow
    config.blur_strength = config.blur_strength * mods.bloom_multiplier;
    config.glow_strength = apply(config.glow_strength, mods.glow_multiplier);
    config.chromatic_bloom_strength = apply(config.chromatic_bloom_strength, mods.chromatic_bloom_multiplier);
    config.halation_strength = apply(config.halation_strength, mods.halation_multiplier);

    // Atmospheric effects
    config.atmospheric_darkening = apply(config.atmospheric_darkening, mods.atmospheric_depth_multiplier);
    config.volumetric_occlusion_strength = apply(config.volumetric_occlusion_strength, mods.volumetric_occlusion_multiplier);
    config.crepuscular_rays_strength = apply(config.crepuscular_rays_strength, mods.crepuscular_rays_multiplier);
    config.nebula_strength = apply(config.nebula_strength, mods.nebula_multiplier);
    config.aurora_veils_strength = apply(config.aurora_veils_strength, mods.aurora_veils_multiplier);
    // Note: deep_space doesn't have a strength parameter, only enable/disable

    // Detail effects
    config.micro_contrast_strength = apply(config.micro_contrast_strength, mods.micro_contrast_multiplier);
    config.fine_texture_strength = apply(config.fine_texture_strength, mods.fine_texture_multiplier);
    config.perceptual_blur_strength = apply(config.perceptual_blur_strength, mods.perceptual_blur_multiplier);

    // Color effects
    config.color_grade_strength = apply(config.color_grade_strength, mods.color_grade_multiplier);
    config.gradient_map_strength = apply(config.gradient_map_strength, mods.gradient_map_multiplier);

    // Other effects
    config.dodge_burn_strength = apply(config.dodge_burn_strength, mods.dodge_burn_multiplier);
    config.vignette_strength = apply(config.vignette_strength, mods.vignette_multiplier);
    config.cosmic_ink_strength = apply(config.cosmic_ink_strength, mods.cosmic_ink_multiplier);
    config.opalescence_strength = apply(config.opalescence_strength, mods.opalescence_multiplier);
    config.edge_luminance_strength = apply(config.edge_luminance_strength, mods.edge_luminance_multiplier);

    // Log the theme application
    log.add_record(RandomizationRecord::new(
        format!("effect_theme: {}", config.effect_theme.name()),
        true,
        false,
    ));

    config
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::Sha3RandomByteStream;

    /// Helper to create a test RNG with a fixed seed
    fn test_rng() -> Sha3RandomByteStream {
        Sha3RandomByteStream::new(b"test_museum_quality_v1", 100.0, 300.0, 25.0, 10.0)
    }

    // =========================================================================
    // MUSEUM QUALITY GUARANTEE TESTS
    // =========================================================================
    // These tests verify that both modes produce exhibition-ready output.

    #[test]
    fn test_gallery_mode_guarantees_volumetric_occlusion() {
        // Gallery/special mode MUST have volumetric occlusion for 3D depth
        let mut rng = test_rng();
        let config = RandomizableEffectConfig {
            enable_volumetric_occlusion: Some(false), // Explicitly disabled
            ..Default::default()
        };

        let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, 42);

        assert!(
            resolved.enable_volumetric_occlusion,
            "Gallery mode MUST force-enable volumetric_occlusion for depth perception"
        );
    }

    #[test]
    fn test_gallery_mode_guarantees_atmospheric_depth() {
        // Gallery/special mode MUST have atmospheric depth for spatial grandeur
        let mut rng = test_rng();
        let config = RandomizableEffectConfig {
            enable_atmospheric_depth: Some(false), // Explicitly disabled
            ..Default::default()
        };

        let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, 42);

        assert!(
            resolved.enable_atmospheric_depth,
            "Gallery mode MUST force-enable atmospheric_depth for aerial perspective"
        );
    }

    #[test]
    fn test_gallery_mode_guarantees_atmospheric_effect() {
        // Gallery mode guarantees at least ONE atmospheric effect (cosmic_ink or aurora_veils)
        let mut rng = test_rng();
        let config = RandomizableEffectConfig {
            enable_cosmic_ink: Some(false),
            enable_aurora_veils: Some(false),
            ..Default::default()
        };

        let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, 42);

        assert!(
            resolved.enable_cosmic_ink || resolved.enable_aurora_veils,
            "Gallery mode MUST have at least one atmospheric effect enabled"
        );
    }

    #[test]
    fn test_regular_mode_high_probability_volumetric_occlusion() {
        // Regular mode should have high probability of volumetric occlusion
        // Run multiple times to verify statistical guarantee (~85% expected)
        let mut enabled_count = 0;
        let iterations = 100;

        for i in 0..iterations {
            let seed = format!("test_regular_depth_{}", i);
            let mut rng = Sha3RandomByteStream::new(seed.as_bytes(), 100.0, 300.0, 25.0, 10.0);
            let config = RandomizableEffectConfig::default();
            let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, false, i as i32);

            if resolved.enable_volumetric_occlusion {
                enabled_count += 1;
            }
        }

        // Should be enabled in roughly 85%+ of cases due to base probability + enforcement
        let enable_rate = enabled_count as f64 / iterations as f64;
        assert!(
            enable_rate > 0.75,
            "Regular mode volumetric_occlusion enable rate ({:.0}%) should be >75% for depth quality",
            enable_rate * 100.0
        );
    }

    #[test]
    fn test_gallery_mode_chromatic_bloom_highly_likely() {
        // Gallery mode should have very high chromatic bloom probability
        let mut enabled_count = 0;
        let iterations = 50;

        for i in 0..iterations {
            let seed = format!("test_gallery_chromatic_{}", i);
            let mut rng = Sha3RandomByteStream::new(seed.as_bytes(), 100.0, 300.0, 25.0, 10.0);
            let config = RandomizableEffectConfig::default();
            let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, i as i32);

            if resolved.enable_chromatic_bloom {
                enabled_count += 1;
            }
        }

        let enable_rate = enabled_count as f64 / iterations as f64;
        assert!(
            enable_rate > 0.70,
            "Gallery mode chromatic_bloom should be >70% enabled ({:.0}%)",
            enable_rate * 100.0
        );
    }

    #[test]
    fn test_gallery_mode_opalescence_highly_likely() {
        // Gallery mode should have very high opalescence probability
        let mut enabled_count = 0;
        let iterations = 50;

        for i in 0..iterations {
            let seed = format!("test_gallery_opal_{}", i);
            let mut rng = Sha3RandomByteStream::new(seed.as_bytes(), 100.0, 300.0, 25.0, 10.0);
            let config = RandomizableEffectConfig::default();
            let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, i as i32);

            if resolved.enable_opalescence {
                enabled_count += 1;
            }
        }

        let enable_rate = enabled_count as f64 / iterations as f64;
        assert!(
            enable_rate > 0.65,
            "Gallery mode opalescence should be >65% enabled ({:.0}%)",
            enable_rate * 100.0
        );
    }

    #[test]
    fn test_regular_mode_no_atmospheric_effects() {
        // Regular mode should NOT enable cosmic_ink or aurora_veils
        // These are gallery-mode exclusive for the "clean vs atmospheric" distinction
        let mut rng = test_rng();
        let config = RandomizableEffectConfig::default();
        let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, false, 42);

        assert!(
            !resolved.enable_cosmic_ink,
            "Regular mode should NOT enable cosmic_ink (gallery-mode exclusive)"
        );
        assert!(
            !resolved.enable_aurora_veils,
            "Regular mode should NOT enable aurora_veils (gallery-mode exclusive)"
        );
    }

    #[test]
    fn test_gradient_map_available_in_both_modes() {
        // Gradient map (luxury palettes) should be available in BOTH modes
        let mut rng = test_rng();

        // Test regular mode
        let config = RandomizableEffectConfig {
            enable_gradient_map: Some(true),
            ..Default::default()
        };
        let (resolved_regular, _) = config.resolve(&mut rng, 1920, 1080, false, 42);

        // Test gallery mode
        let mut rng2 = test_rng();
        let config2 = RandomizableEffectConfig {
            enable_gradient_map: Some(true),
            ..Default::default()
        };
        let (resolved_gallery, _) = config2.resolve(&mut rng2, 1920, 1080, true, 42);

        assert!(
            resolved_regular.enable_gradient_map,
            "Gradient map should be available in regular mode"
        );
        assert!(
            resolved_gallery.enable_gradient_map,
            "Gradient map should be available in gallery mode"
        );
    }

    #[test]
    fn test_special_mode_stores_flag_correctly() {
        let mut rng = test_rng();
        let config = RandomizableEffectConfig::default();

        let (resolved_regular, _) = config.resolve(&mut rng, 1920, 1080, false, 42);
        let mut rng2 = test_rng();
        let (resolved_special, _) = config.resolve(&mut rng2, 1920, 1080, true, 42);

        assert!(!resolved_regular.special_mode, "Regular mode should have special_mode=false");
        assert!(resolved_special.special_mode, "Special mode should have special_mode=true");
    }

    #[test]
    fn test_nebula_strength_in_valid_range() {
        // Nebula strength should now be in a valid non-zero range (was disabled)
        let mut rng = test_rng();
        let config = RandomizableEffectConfig::default();
        let (resolved, _) = config.resolve(&mut rng, 1920, 1080, true, 42);

        assert!(
            resolved.nebula_strength >= 0.12 && resolved.nebula_strength <= 0.35,
            "Nebula strength ({}) should be in range [0.12, 0.35]",
            resolved.nebula_strength
        );
    }

    #[test]
    fn test_nebula_strength_not_pinned_to_min_in_gallery_quality() {
        // Regression test: nebula strength must not be pinned to the descriptor minimum.
        // This used to happen when the distribution was disabled (mean=0,std=0),
        // causing strength to clamp to the minimum every time.
        //
        // MUSEUM QUALITY: Effect themes can now modify nebula_strength via multipliers.
        // The Cosmic theme has nebula_multiplier = 1.4, which can push values up to 0.42.
        // The Minimal theme has nebula_multiplier = 0.4, which can reduce values to 0.08.
        // We test for reasonable bounds after theme modification.
        let iterations = 60;
        let mut min_val = f64::INFINITY;
        let mut max_val = f64::NEG_INFINITY;

        for i in 0..iterations {
            let seed = format!("test_nebula_strength_variety_{}", i);
            let mut rng = Sha3RandomByteStream::new(seed.as_bytes(), 100.0, 300.0, 25.0, 10.0);
            let config = RandomizableEffectConfig { gallery_quality: true, ..Default::default() };
            let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, i as i32);

            min_val = min_val.min(resolved.nebula_strength);
            max_val = max_val.max(resolved.nebula_strength);

            // MUSEUM QUALITY: Range after theme modifiers can be wider
            // Base range: [0.20, 0.30], after Cosmic (1.4x): [0.28, 0.42], after Minimal (0.4x): [0.08, 0.12]
            // We allow the full modified range: [0.08, 0.50] for safety
            assert!(
                resolved.nebula_strength >= 0.08 && resolved.nebula_strength <= 0.50,
                "Gallery nebula strength ({}) should be in theme-adjusted range [0.08, 0.50]",
                resolved.nebula_strength
            );
        }

        assert!(
            (max_val - min_val) > 0.005,
            "Nebula strength appears pinned or nearly constant (min={}, max={})",
            min_val,
            max_val
        );
    }

    #[test]
    fn test_deep_space_elevated_probability() {
        // Deep space should have elevated probability due to museum quality boost
        let mut enabled_count = 0;
        let iterations = 100;

        for i in 0..iterations {
            let seed = format!("test_deep_space_{}", i);
            let mut rng = Sha3RandomByteStream::new(seed.as_bytes(), 100.0, 300.0, 25.0, 10.0);
            let config = RandomizableEffectConfig::default();
            let (resolved, _log) = config.resolve(&mut rng, 1920, 1080, true, i as i32);

            if resolved.enable_deep_space {
                enabled_count += 1;
            }
        }

        let enable_rate = enabled_count as f64 / iterations as f64;
        // Base probability 0.40 + gallery enforcement = should be well over 50%
        assert!(
            enable_rate > 0.50,
            "Gallery mode deep_space should be >50% enabled ({:.0}%)",
            enable_rate * 100.0
        );
    }
}
