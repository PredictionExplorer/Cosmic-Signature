//! Video encoding functionality

use std::error::Error;
use std::io::Write;
use std::process::{Command, Stdio};
use tracing::info;

use crate::render::constants;
use crate::render::error::{RenderError, Result};

/// Configuration for video encoding
///
/// This struct provides fine-grained control over FFmpeg encoding parameters,
/// allowing users to balance quality, file size, and encoding speed.
#[derive(Debug, Clone)]
pub struct VideoEncodingOptions {
    /// Output bitrate (e.g., "100M", "50M")
    /// Higher values produce larger files with better quality
    pub bitrate: String,

    /// H.264 preset (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow)
    /// Slower presets provide better compression at the cost of encoding time
    pub preset: String,

    /// Constant Rate Factor (0-51, lower = better quality)
    /// CRF 18 is visually lossless, 23 is default, 28 is acceptable for web
    pub crf: u32,

    /// Pixel format for color subsampling
    /// yuv420p is most compatible, yuv444p preserves more color information
    pub pixel_format: String,

    /// Video codec to use (e.g., "libx264", "libx265", "av1")
    pub codec: String,

    /// Additional FFmpeg arguments for advanced customization
    /// These are passed directly to FFmpeg after all other options
    pub extra_args: Vec<String>,
}

impl Default for VideoEncodingOptions {
    fn default() -> Self {
        Self {
            bitrate: constants::DEFAULT_VIDEO_BITRATE.to_string(),
            preset: "medium".to_string(),
            crf: 18,
            pixel_format: constants::DEFAULT_PIXEL_FORMAT.to_string(),
            codec: constants::DEFAULT_VIDEO_CODEC.to_string(),
            extra_args: vec![],
        }
    }
}

impl VideoEncodingOptions {
    /// Create options optimized for high quality archival
    #[allow(dead_code)]
    pub fn high_quality() -> Self {
        Self { preset: "slow".to_string(), crf: 15, ..Default::default() }
    }

    /// Create options optimized for web streaming
    #[allow(dead_code)]
    pub fn web_optimized() -> Self {
        Self {
            bitrate: "10M".to_string(),
            preset: "fast".to_string(),
            crf: 23,
            extra_args: vec!["-movflags".to_string(), "+faststart".to_string()],
            ..Default::default()
        }
    }

    /// Create options for fast preview generation
    #[allow(dead_code)]
    pub fn fast_preview() -> Self {
        Self {
            bitrate: "5M".to_string(),
            preset: "ultrafast".to_string(),
            crf: 28,
            ..Default::default()
        }
    }
}

/// Create H.264 video in a single pass using FFmpeg with configurable options
///
/// This function pipes raw RGB frames directly to FFmpeg's stdin, avoiding the need
/// for temporary frame files on disk.
///
/// # Arguments
/// * `width` - Frame width in pixels
/// * `height` - Frame height in pixels  
/// * `frame_rate` - Output video framerate (fps)
/// * `frames_iter` - Closure that writes raw RGB frame data to the provided writer
/// * `output_file` - Path to the output video file
/// * `options` - Encoding configuration options
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(RenderError)` if FFmpeg fails or encoding parameters are invalid
///
/// # Example
/// ```ignore
/// let options = VideoEncodingOptions::default();
/// create_video_from_frames_singlepass(
///     1920, 1080, 60,
///     |writer| write_frames_to(writer),
///     "output.mp4",
///     &options
/// )?;
/// ```
pub fn create_video_from_frames_singlepass(
    width: u32,
    height: u32,
    frame_rate: u32,
    mut frames_iter: impl FnMut(&mut dyn Write) -> std::result::Result<(), Box<dyn Error>>,
    output_file: &str,
    options: &VideoEncodingOptions,
) -> Result<()> {
    // Validate parameters
    if width == 0 || height == 0 {
        return Err(RenderError::InvalidDimensions { width, height });
    }

    if frame_rate == 0 {
        return Err(RenderError::InvalidConfig("Frame rate must be greater than 0".to_string()));
    }

    // Build FFmpeg command
    let mut cmd = Command::new("ffmpeg");

    // Input parameters
    cmd.args([
        "-y", // Overwrite output file
        "-f",
        "rawvideo", // Input format
        "-pix_fmt",
        "rgb24", // Input pixel format
        "-s",
        &format!("{}x{}", width, height),
        "-r",
        &frame_rate.to_string(),
        "-i",
        "-", // Read from stdin
    ]);

    // Encoding parameters
    cmd.args([
        "-c:v",
        &options.codec,
        "-preset",
        &options.preset,
        "-crf",
        &options.crf.to_string(),
        "-b:v",
        &options.bitrate,
        "-pix_fmt",
        &options.pixel_format,
    ]);

    // Add any extra arguments
    for arg in &options.extra_args {
        cmd.arg(arg);
    }

    // Output file
    cmd.arg(output_file);

    // Spawn FFmpeg process
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(RenderError::VideoEncoding)?;

    // Write frames to FFmpeg's stdin
    if let Some(stdin) = child.stdin.as_mut() {
        if let Err(e) = frames_iter(stdin) {
            // Kill the FFmpeg process if frame writing fails
            let _ = child.kill();
            return Err(RenderError::VideoEncoding(std::io::Error::other(e.to_string())));
        }
    }

    // Wait for FFmpeg to complete
    let output = child.wait_with_output().map_err(RenderError::VideoEncoding)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(RenderError::VideoEncoding(std::io::Error::other(format!(
            "FFmpeg failed with status {:?}. stderr: {}",
            output.status, stderr
        ))));
    }

    info!("   Saved video => {}", output_file);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_options() {
        let options = VideoEncodingOptions::default();
        assert_eq!(options.bitrate, "100M");
        assert_eq!(options.preset, "medium");
        assert_eq!(options.crf, 18);
        assert_eq!(options.pixel_format, "yuv420p");
        assert_eq!(options.codec, "libx264");
        assert!(options.extra_args.is_empty());
    }

    #[test]
    fn test_preset_options() {
        let hq = VideoEncodingOptions::high_quality();
        assert_eq!(hq.preset, "slow");
        assert_eq!(hq.crf, 15);

        let web = VideoEncodingOptions::web_optimized();
        assert_eq!(web.bitrate, "10M");
        assert_eq!(web.preset, "fast");
        assert!(web.extra_args.contains(&"-movflags".to_string()));

        let preview = VideoEncodingOptions::fast_preview();
        assert_eq!(preview.preset, "ultrafast");
        assert_eq!(preview.crf, 28);
    }
}
