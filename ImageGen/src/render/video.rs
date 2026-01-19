//! Video encoding functionality

use std::error::Error;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use tracing::{debug, info, warn};

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

    // CRITICAL: Take ownership of stdin and stderr to avoid pipe deadlock.
    //
    // If we don't drain stderr while writing to stdin, the OS pipe buffer (~64KB)
    // can fill up, causing FFmpeg to block on stderr writes while we're blocked
    // on stdin writes = DEADLOCK.
    //
    // Solution: Spawn a dedicated thread to continuously drain stderr.
    let stdin = child.stdin.take().ok_or_else(|| {
        RenderError::VideoEncoding(std::io::Error::other("Failed to capture FFmpeg stdin"))
    })?;

    let stderr = child.stderr.take().ok_or_else(|| {
        RenderError::VideoEncoding(std::io::Error::other("Failed to capture FFmpeg stderr"))
    })?;

    // Channel for the stderr thread to report back captured output and any errors
    let (stderr_tx, stderr_rx) = mpsc::channel::<String>();

    // Spawn stderr draining thread - this prevents the deadlock
    let stderr_handle = thread::Builder::new()
        .name("ffmpeg-stderr-drain".to_string())
        .spawn(move || {
            let reader = BufReader::new(stderr);
            let mut captured_lines = Vec::new();
            let mut line_count = 0;

            for line_result in reader.lines() {
                match line_result {
                    Ok(line) => {
                        line_count += 1;
                        // Log first few lines and any errors/warnings for debugging
                        if line_count <= 5
                            || line.contains("error")
                            || line.contains("Error")
                            || line.contains("warning")
                            || line.contains("Warning")
                        {
                            debug!("FFmpeg: {}", line);
                        }
                        // Always capture error lines
                        if line.contains("error") || line.contains("Error") {
                            captured_lines.push(line);
                        }
                    }
                    Err(e) => {
                        // Non-UTF8 output or read error - log and continue
                        debug!("FFmpeg stderr read error (non-fatal): {}", e);
                    }
                }
            }

            // Send captured error lines back (empty string if no errors)
            let _ = stderr_tx.send(captured_lines.join("\n"));
        })
        .map_err(|e| RenderError::VideoEncoding(std::io::Error::other(format!(
            "Failed to spawn stderr drain thread: {}", e
        ))))?;

    // Write frames to FFmpeg's stdin
    // We use a mutable reference wrapper to satisfy the Write trait
    let mut stdin_writer = stdin;
    let write_result = frames_iter(&mut stdin_writer);

    // Explicitly drop stdin to signal EOF to FFmpeg
    // This is crucial - FFmpeg won't finish until stdin is closed
    drop(stdin_writer);

    // Wait for stderr drain thread to complete (with timeout protection)
    let stderr_join_result = stderr_handle.join();
    let captured_stderr = match stderr_join_result {
        Ok(()) => {
            // Thread completed, get captured stderr
            stderr_rx.recv().unwrap_or_default()
        }
        Err(e) => {
            warn!("FFmpeg stderr drain thread panicked: {:?}", e);
            String::new()
        }
    };

    // Handle frame writing errors
    if let Err(e) = write_result {
        // Kill FFmpeg if it's still running
        let _ = child.kill();
        let _ = child.wait(); // Reap zombie process

        let mut error_msg = format!("Frame writing failed: {}", e);
        if !captured_stderr.is_empty() {
            error_msg.push_str(&format!("\nFFmpeg errors: {}", captured_stderr));
        }
        return Err(RenderError::VideoEncoding(std::io::Error::other(error_msg)));
    }

    // Wait for FFmpeg to complete
    let status = child.wait().map_err(RenderError::VideoEncoding)?;

    if !status.success() {
        let mut error_msg = format!("FFmpeg failed with status {:?}", status);
        if !captured_stderr.is_empty() {
            error_msg.push_str(&format!(". Errors: {}", captured_stderr));
        }
        return Err(RenderError::VideoEncoding(std::io::Error::other(error_msg)));
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
