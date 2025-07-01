//! Video encoding utilities

use crate::render::error::{RenderError, RenderResult};
use log::{debug, info};
use std::io::Write;
use std::process::{Command, Stdio};

// FFmpeg encoding constants
const FFMPEG_CRF: &str = "18";              // Constant Rate Factor (0-51, lower = better quality)
const FFMPEG_PRESET: &str = "slow";        // Encoding preset (slower = better compression)
const FFMPEG_PROFILE: &str = "high";       // H.264 profile
const FFMPEG_LEVEL: &str = "4.2";          // H.264 level
const FFMPEG_PIX_FMT: &str = "yuv420p";    // Pixel format for compatibility

/// Create a video from frames using FFmpeg in a single pass
///
/// This function spawns an FFmpeg process and pipes raw RGB frames directly
/// to it for encoding. This is more efficient than saving individual frame files.
///
/// # Arguments
/// * `width` - Video width in pixels
/// * `height` - Video height in pixels
/// * `frame_rate` - Frames per second
/// * `frames_iter` - Closure that writes raw RGB frames to the provided writer
/// * `output_file` - Path to the output video file
///
/// # Returns
/// Result indicating success or an error
pub fn create_video_from_frames_singlepass(
    width: u32,
    height: u32,
    frame_rate: u32,
    mut frames_iter: impl FnMut(&mut dyn Write) -> Result<(), Box<dyn std::error::Error>>,
    output_file: &str,
) -> RenderResult<()> {
    info!("Creating video: {}x{} @ {} fps -> {}", width, height, frame_rate, output_file);
    
    // Validate dimensions
    if width == 0 || height == 0 {
        return Err(RenderError::InvalidDimensions { width, height });
    }
    
    // Build FFmpeg command with optimized settings
    let mut ffmpeg = Command::new("ffmpeg")
        .args(&[
            "-y",                           // Overwrite output file
            "-f", "rawvideo",              // Input format
            "-pix_fmt", "rgb24",           // Input pixel format
            "-s", &format!("{}x{}", width, height),
            "-r", &format!("{}", frame_rate),
            "-i", "-",                     // Read from stdin
            "-c:v", "libx264",             // Video codec
            "-crf", FFMPEG_CRF,            // Quality setting
            "-preset", FFMPEG_PRESET,      // Encoding preset
            "-profile:v", FFMPEG_PROFILE,  // H.264 profile
            "-level", FFMPEG_LEVEL,        // H.264 level
            "-pix_fmt", FFMPEG_PIX_FMT,    // Output pixel format
            "-movflags", "+faststart",     // Optimize for streaming
            output_file,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            RenderError::FfmpegError {
                message: format!("Failed to spawn ffmpeg process: {}", e),
            }
        })?;
    
    debug!("FFmpeg process started with PID: {:?}", ffmpeg.id());
    
    // Get stdin handle for writing frames
    let mut stdin = ffmpeg.stdin.take()
        .ok_or_else(|| RenderError::FfmpegError {
            message: "Failed to open stdin for ffmpeg".to_string(),
        })?;
    
    // Write frames to FFmpeg
    let write_result = frames_iter(&mut stdin);
    
    // Close stdin to signal end of input
    drop(stdin);
    
    // Wait for FFmpeg to complete
    let output = ffmpeg.wait_with_output()
        .map_err(|e| RenderError::FfmpegError {
            message: format!("Failed to wait for ffmpeg: {}", e),
        })?;
    
    // Check if frame writing failed
    if let Err(e) = write_result {
        return Err(RenderError::FfmpegError {
            message: format!("Error writing frames to ffmpeg: {}", e),
        });
    }
    
    // Check FFmpeg exit status
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(RenderError::FfmpegError {
            message: format!("FFmpeg encoding failed:\n{}", stderr),
        });
    }
    
    info!("Video encoding completed successfully: {}", output_file);
    Ok(())
} 