//! Parameter descriptors for post-processing effects.
//!
//! This module defines the valid ranges and metadata for all effect parameters,
//! enabling type-safe randomization and validation.

/// Descriptor for a floating-point parameter with bounded range.
#[derive(Clone, Debug)]
pub struct FloatParamDescriptor {
    #[allow(dead_code)]
    pub name: &'static str,
    pub min: f64,
    pub max: f64,
    pub gallery_min: f64,
    pub gallery_max: f64,
    #[allow(dead_code)]
    pub description: &'static str,
}

impl FloatParamDescriptor {
    /// Get the appropriate range based on gallery quality mode.
    pub fn range(&self, gallery_quality: bool) -> (f64, f64) {
        if gallery_quality {
            (self.gallery_min, self.gallery_max)
        } else {
            (self.min, self.max)
        }
    }
}

/// Descriptor for an integer parameter with bounded range.
#[derive(Clone, Debug)]
pub struct IntParamDescriptor {
    #[allow(dead_code)]
    pub name: &'static str,
    pub min: usize,
    pub max: usize,
    pub gallery_min: usize,
    pub gallery_max: usize,
    #[allow(dead_code)]
    pub description: &'static str,
}

impl IntParamDescriptor {
    /// Get the appropriate range based on gallery quality mode.
    pub fn range(&self, gallery_quality: bool) -> (usize, usize) {
        if gallery_quality {
            (self.gallery_min, self.gallery_max)
        } else {
            (self.min, self.max)
        }
    }
}

// ==================== BLOOM & GLOW PARAMETERS ====================

pub const BLUR_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "blur_strength",
    min: 4.0,
    max: 18.0,
    gallery_min: 6.0,
    gallery_max: 14.0,
    description: "Strength of Gaussian blur bloom effect",
};

pub const BLUR_RADIUS_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "blur_radius_scale",
    min: 0.008,
    max: 0.045,
    gallery_min: 0.012,
    gallery_max: 0.035,
    description: "Radius scale for blur (relative to resolution)",
};

pub const BLUR_CORE_BRIGHTNESS: FloatParamDescriptor = FloatParamDescriptor {
    name: "blur_core_brightness",
    min: 4.0,
    max: 18.0,
    gallery_min: 6.0,
    gallery_max: 14.0,
    description: "Brightness preservation in blur core",
};

pub const DOG_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "dog_strength",
    min: 0.15,
    max: 0.60,
    gallery_min: 0.25,
    gallery_max: 0.45,
    description: "Difference-of-Gaussians bloom strength",
};

pub const DOG_SIGMA_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "dog_sigma_scale",
    min: 0.004,
    max: 0.012,
    gallery_min: 0.005,
    gallery_max: 0.009,
    description: "DoG inner sigma scale (relative to resolution)",
};

pub const DOG_RATIO: FloatParamDescriptor = FloatParamDescriptor {
    name: "dog_ratio",
    min: 2.0,
    max: 4.0,
    gallery_min: 2.3,
    gallery_max: 3.5,
    description: "DoG outer/inner sigma ratio",
};

pub const GLOW_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "glow_strength",
    min: 0.15,
    max: 0.70,
    gallery_min: 0.20,
    gallery_max: 0.55,
    description: "Tight glow enhancement strength",
};

pub const GLOW_THRESHOLD: FloatParamDescriptor = FloatParamDescriptor {
    name: "glow_threshold",
    min: 0.50,
    max: 0.85,
    gallery_min: 0.60,
    gallery_max: 0.75,
    description: "Luminance threshold for glow activation",
};

pub const GLOW_RADIUS_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "glow_radius_scale",
    min: 0.004,
    max: 0.012,
    gallery_min: 0.005,
    gallery_max: 0.009,
    description: "Glow radius scale (relative to resolution)",
};

pub const GLOW_SHARPNESS: FloatParamDescriptor = FloatParamDescriptor {
    name: "glow_sharpness",
    min: 1.5,
    max: 4.0,
    gallery_min: 2.0,
    gallery_max: 3.5,
    description: "Glow falloff sharpness",
};

pub const GLOW_SATURATION_BOOST: FloatParamDescriptor = FloatParamDescriptor {
    name: "glow_saturation_boost",
    min: 0.0,
    max: 0.40,
    gallery_min: 0.10,
    gallery_max: 0.30,
    description: "Color saturation boost in glows",
};

// ==================== CHROMATIC EFFECTS ====================

pub const CHROMATIC_BLOOM_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "chromatic_bloom_strength",
    min: 0.35,
    max: 0.85,
    gallery_min: 0.50,
    gallery_max: 0.75,
    description: "Prismatic color separation strength",
};

pub const CHROMATIC_BLOOM_RADIUS_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "chromatic_bloom_radius_scale",
    min: 0.007,
    max: 0.018,
    gallery_min: 0.009,
    gallery_max: 0.014,
    description: "Chromatic bloom radius scale",
};

pub const CHROMATIC_BLOOM_SEPARATION_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "chromatic_bloom_separation_scale",
    min: 0.0015,
    max: 0.0035,
    gallery_min: 0.0018,
    gallery_max: 0.0028,
    description: "RGB channel separation distance scale",
};

pub const CHROMATIC_BLOOM_THRESHOLD: FloatParamDescriptor = FloatParamDescriptor {
    name: "chromatic_bloom_threshold",
    min: 0.08,
    max: 0.30,
    gallery_min: 0.12,
    gallery_max: 0.22,
    description: "Luminance threshold for chromatic bloom",
};

// ==================== PERCEPTUAL BLUR ====================

pub const PERCEPTUAL_BLUR_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "perceptual_blur_strength",
    min: 0.35,
    max: 0.85,
    gallery_min: 0.50,
    gallery_max: 0.75,
    description: "OKLab perceptual blur strength",
};

// ==================== COLOR GRADING ====================

pub const COLOR_GRADE_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "color_grade_strength",
    min: 0.0,
    max: 0.75,
    gallery_min: 0.30,
    gallery_max: 0.60,
    description: "Overall cinematic color grading strength",
};

pub const VIGNETTE_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "vignette_strength",
    min: 0.0,
    max: 0.65,
    gallery_min: 0.25,
    gallery_max: 0.55,
    description: "Vignette darkness strength",
};

pub const VIGNETTE_SOFTNESS: FloatParamDescriptor = FloatParamDescriptor {
    name: "vignette_softness",
    min: 1.8,
    max: 3.5,
    gallery_min: 2.2,
    gallery_max: 3.0,
    description: "Vignette edge softness exponent",
};

pub const VIBRANCE: FloatParamDescriptor = FloatParamDescriptor {
    name: "vibrance",
    min: 0.85,
    max: 1.35,
    gallery_min: 0.95,
    gallery_max: 1.20,
    description: "Color vibrance multiplier",
};

pub const CLARITY_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "clarity_strength",
    min: 0.0,
    max: 0.50,
    gallery_min: 0.20,
    gallery_max: 0.40,
    description: "High-pass contrast clarity boost",
};

pub const TONE_CURVE_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "tone_curve_strength",
    min: 0.0,
    max: 0.75,
    gallery_min: 0.35,
    gallery_max: 0.65,
    description: "Midtone contrast curve strength",
};

// ==================== GRADIENT MAPPING ====================

pub const GRADIENT_MAP_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "gradient_map_strength",
    min: 0.40,
    max: 1.0,
    gallery_min: 0.60,
    gallery_max: 0.90,
    description: "Luxury palette gradient strength",
};

pub const GRADIENT_MAP_HUE_PRESERVATION: FloatParamDescriptor = FloatParamDescriptor {
    name: "gradient_map_hue_preservation",
    min: 0.0,
    max: 0.40,
    gallery_min: 0.10,
    gallery_max: 0.30,
    description: "Original hue preservation factor",
};

// ==================== MATERIAL EFFECTS ====================

pub const OPALESCENCE_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "opalescence_strength",
    min: 0.0,
    max: 0.35,
    gallery_min: 0.08,
    gallery_max: 0.25,
    description: "Gem-like iridescent shimmer strength",
};

pub const OPALESCENCE_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "opalescence_scale",
    min: 0.005,
    max: 0.015,
    gallery_min: 0.007,
    gallery_max: 0.012,
    description: "Opalescence pattern scale",
};

pub const OPALESCENCE_LAYERS: IntParamDescriptor = IntParamDescriptor {
    name: "opalescence_layers",
    min: 1,
    max: 4,
    gallery_min: 2,
    gallery_max: 3,
    description: "Number of interference layers",
};

pub const CHAMPLEVE_FLOW_ALIGNMENT: FloatParamDescriptor = FloatParamDescriptor {
    name: "champleve_flow_alignment",
    min: 0.20,
    max: 0.85,
    gallery_min: 0.45,
    gallery_max: 0.75,
    description: "Champlevé flow alignment strength",
};

pub const CHAMPLEVE_INTERFERENCE_AMPLITUDE: FloatParamDescriptor = FloatParamDescriptor {
    name: "champleve_interference_amplitude",
    min: 0.15,
    max: 0.80,
    gallery_min: 0.35,
    gallery_max: 0.70,
    description: "Iridescent interference amplitude",
};

pub const CHAMPLEVE_RIM_INTENSITY: FloatParamDescriptor = FloatParamDescriptor {
    name: "champleve_rim_intensity",
    min: 0.5,
    max: 3.0,
    gallery_min: 1.2,
    gallery_max: 2.5,
    description: "Metallic rim brightness multiplier",
};

pub const CHAMPLEVE_RIM_WARMTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "champleve_rim_warmth",
    min: 0.0,
    max: 0.90,
    gallery_min: 0.40,
    gallery_max: 0.80,
    description: "Rim warmth (gold tint) blend factor",
};

pub const CHAMPLEVE_INTERIOR_LIFT: FloatParamDescriptor = FloatParamDescriptor {
    name: "champleve_interior_lift",
    min: 0.20,
    max: 0.90,
    gallery_min: 0.45,
    gallery_max: 0.80,
    description: "Interior opaline glow lift",
};

pub const AETHER_FLOW_ALIGNMENT: FloatParamDescriptor = FloatParamDescriptor {
    name: "aether_flow_alignment",
    min: 0.30,
    max: 0.95,
    gallery_min: 0.55,
    gallery_max: 0.90,
    description: "Aether filament flow alignment",
};

pub const AETHER_SCATTERING_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "aether_scattering_strength",
    min: 0.30,
    max: 1.50,
    gallery_min: 0.60,
    gallery_max: 1.20,
    description: "Volumetric scattering intensity",
};

pub const AETHER_IRIDESCENCE_AMPLITUDE: FloatParamDescriptor = FloatParamDescriptor {
    name: "aether_iridescence_amplitude",
    min: 0.20,
    max: 0.85,
    gallery_min: 0.40,
    gallery_max: 0.75,
    description: "Aether iridescent color shift amplitude",
};

pub const AETHER_CAUSTIC_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "aether_caustic_strength",
    min: 0.0,
    max: 0.60,
    gallery_min: 0.15,
    gallery_max: 0.45,
    description: "Negative space caustics intensity",
};

// ==================== DETAIL & CLARITY ====================

pub const MICRO_CONTRAST_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "micro_contrast_strength",
    min: 0.10,
    max: 0.45,
    gallery_min: 0.15,
    gallery_max: 0.35,
    description: "Local contrast enhancement strength",
};

pub const MICRO_CONTRAST_RADIUS: IntParamDescriptor = IntParamDescriptor {
    name: "micro_contrast_radius",
    min: 2,
    max: 8,
    gallery_min: 3,
    gallery_max: 6,
    description: "Micro-contrast neighborhood radius",
};

pub const EDGE_LUMINANCE_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "edge_luminance_strength",
    min: 0.08,
    max: 0.40,
    gallery_min: 0.12,
    gallery_max: 0.30,
    description: "Edge brightening strength",
};

pub const EDGE_LUMINANCE_THRESHOLD: FloatParamDescriptor = FloatParamDescriptor {
    name: "edge_luminance_threshold",
    min: 0.10,
    max: 0.30,
    gallery_min: 0.15,
    gallery_max: 0.25,
    description: "Edge detection sensitivity threshold",
};

pub const EDGE_LUMINANCE_BRIGHTNESS_BOOST: FloatParamDescriptor = FloatParamDescriptor {
    name: "edge_luminance_brightness_boost",
    min: 0.15,
    max: 0.50,
    gallery_min: 0.20,
    gallery_max: 0.40,
    description: "Edge brightness multiplier",
};

// ==================== ATMOSPHERIC ====================

pub const ATMOSPHERIC_DEPTH_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "atmospheric_depth_strength",
    min: 0.0,
    max: 0.45,
    gallery_min: 0.10,
    gallery_max: 0.35,
    description: "Atmospheric perspective strength",
};

pub const ATMOSPHERIC_DESATURATION: FloatParamDescriptor = FloatParamDescriptor {
    name: "atmospheric_desaturation",
    min: 0.10,
    max: 0.60,
    gallery_min: 0.25,
    gallery_max: 0.50,
    description: "Depth-based desaturation",
};

pub const ATMOSPHERIC_DARKENING: FloatParamDescriptor = FloatParamDescriptor {
    name: "atmospheric_darkening",
    min: 0.0,
    max: 0.35,
    gallery_min: 0.08,
    gallery_max: 0.25,
    description: "Depth-based darkening",
};

pub const FINE_TEXTURE_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "fine_texture_strength",
    min: 0.02,
    max: 0.25,
    gallery_min: 0.06,
    gallery_max: 0.18,
    description: "Canvas/surface texture strength",
};

pub const FINE_TEXTURE_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "fine_texture_scale",
    min: 0.0008,
    max: 0.0028,
    gallery_min: 0.0012,
    gallery_max: 0.0022,
    description: "Texture feature scale",
};

pub const FINE_TEXTURE_CONTRAST: FloatParamDescriptor = FloatParamDescriptor {
    name: "fine_texture_contrast",
    min: 0.15,
    max: 0.50,
    gallery_min: 0.25,
    gallery_max: 0.42,
    description: "Texture contrast intensity",
};

// ==================== HDR & EXPOSURE ====================

pub const HDR_SCALE: FloatParamDescriptor = FloatParamDescriptor {
    name: "hdr_scale",
    min: 0.06,
    max: 0.25,
    gallery_min: 0.08,
    gallery_max: 0.18,
    description: "HDR line alpha scale multiplier",
};

// ==================== CLIPPING ====================

pub const CLIP_BLACK: FloatParamDescriptor = FloatParamDescriptor {
    name: "clip_black",
    min: 0.005,
    max: 0.025,
    gallery_min: 0.008,
    gallery_max: 0.015,
    description: "Black point percentile clipping",
};

pub const CLIP_WHITE: FloatParamDescriptor = FloatParamDescriptor {
    name: "clip_white",
    min: 0.975,
    max: 0.998,
    gallery_min: 0.985,
    gallery_max: 0.995,
    description: "White point percentile clipping",
};

// ==================== NEBULA ====================

pub const NEBULA_STRENGTH: FloatParamDescriptor = FloatParamDescriptor {
    name: "nebula_strength",
    min: 0.0,
    max: 0.30,
    gallery_min: 0.08,
    gallery_max: 0.22,
    description: "Nebula cloud background opacity",
};

pub const NEBULA_OCTAVES: IntParamDescriptor = IntParamDescriptor {
    name: "nebula_octaves",
    min: 3,
    max: 5,
    gallery_min: 3,
    gallery_max: 4,
    description: "Nebula noise detail octaves",
};

pub const NEBULA_BASE_FREQUENCY: FloatParamDescriptor = FloatParamDescriptor {
    name: "nebula_base_frequency",
    min: 0.0008,
    max: 0.0025,
    gallery_min: 0.0010,
    gallery_max: 0.0020,
    description: "Nebula noise base frequency",
};

