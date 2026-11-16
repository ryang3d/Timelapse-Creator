const { execSync } = require('child_process');
const fs = require('fs');

class VideoService {
  constructor() {
    this.cachedCodec = null;
  }

  /**
   * Codec tiering for Frigate-scraper renders:
   * Intel VAAPI when /dev/dri/renderD128 + h264_vaapi are available,
   * otherwise software libx264. Callers add a software fallback on failure.
   * (Non-scraper sessions keep the CUDA/NVENC pipeline in server.js.)
   */
  getBestCodec() {
    if (this.cachedCodec) {
      return this.cachedCodec;
    }

    const vaapiAvailable = this.checkVAAPIAvailability();

    if (vaapiAvailable) {
      console.log('[VideoService] VAAPI available; using h264_vaapi for scraper renders.');
      this.cachedCodec = {
        type: 'hardware',
        encoder: 'h264_vaapi',
        hwaccel: 'vaapi',
        device: '/dev/dri/renderD128',
        inputOptions: ['-vaapi_device', '/dev/dri/renderD128'],
        // No -preset: h264_vaapi does not accept it (verified on ffmpeg 5.1).
        outputOptions: ['-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi', '-b:v', '5M']
      };
    } else {
      console.log('[VideoService] No HW accel found. Falling back to software libx264.');
      this.cachedCodec = {
        type: 'software',
        encoder: 'libx264',
        hwaccel: null,
        device: null,
        inputOptions: [],
        outputOptions: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-b:v', '5M']
      };
    }

    return this.cachedCodec;
  }

  checkVAAPIAvailability() {
    try {
      // Check 1: /dev/dri/renderD128 must exist in this container.
      const driDevice = '/dev/dri/renderD128';
      if (!fs.existsSync(driDevice)) {
        console.log('[VideoService] VAAPI check: /dev/dri/renderD128 not found');
        return false;
      }

      // Check 2: h264_vaapi encoder must be present in the container ffmpeg.
      try {
        const encoders = execSync('ffmpeg -encoders 2>/dev/null', { encoding: 'utf8' });
        if (encoders.includes('h264_vaapi')) {
          console.log('[VideoService] VAAPI check: h264_vaapi encoder available');
          return true;
        }
        console.log('[VideoService] VAAPI check: h264_vaapi encoder not found in FFmpeg');
        return false;
      } catch (error) {
        console.log('[VideoService] VAAPI check: Failed to run ffmpeg -encoders');
        return false;
      }
    } catch (error) {
      console.log('[VideoService] VAAPI check: Error during availability check', error.message);
      return false;
    }
  }

  /**
   * Existing CUDA pipeline for non-scraper sessions (behavior unchanged).
   */
  getCudaCodec() {
    return {
      type: 'cuda',
      encoder: 'h264_nvenc',
      hwaccel: 'cuda',
      device: null,
      inputOptions: ['-hwaccel', 'cuda'],
      outputOptions: ['-c:v', 'h264_nvenc', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-cq', '23']
    };
  }
}

module.exports = VideoService;
