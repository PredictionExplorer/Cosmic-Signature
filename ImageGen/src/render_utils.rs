//! Rendering utilities for common functionality

use std::error::Error;
use log::info;

/// Save an RGB image buffer as PNG
pub fn save_image_as_png(
    rgb_img: &image::ImageBuffer<image::Rgb<u8>, Vec<u8>>,
    path: &str,
) -> Result<(), Box<dyn Error>> {
    let dyn_img = image::DynamicImage::ImageRgb8(rgb_img.clone());
    dyn_img.save(path)?;
    info!("Saved PNG => {}", path);
    Ok(())
} 