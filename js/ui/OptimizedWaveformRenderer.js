/**
 * OptimizedWaveformRenderer - Optimized waveform rendering with caching
 * Renders audio waveforms to canvas with efficient caching mechanism
 */

import { Logger } from '../utils/logger.js';

// Constants
const DEFAULT_STROKE_STYLE = '#0f0';
const DEFAULT_LINE_WIDTH = 1;
const PLAYHEAD_COLOR = 'red';
const PLAYHEAD_LINE_WIDTH = 2;
const MAX_CACHE_SIZE = 1024 * 1024; // 1MB limit for cache

/**
 * OptimizedWaveformRenderer class
 * Renders audio waveforms with caching for improved performance
 */
export class OptimizedWaveformRenderer {
  /**
   * Constructor
   * @param {HTMLCanvasElement} canvas - Canvas element to render to
   */
  constructor(canvas) {
    try {
      if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Invalid canvas element provided');
      }

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      if (!this.ctx) {
        throw new Error('Failed to get canvas 2d context');
      }

      // Create offscreen canvas for caching
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');

      if (!this.offscreenCtx) {
        throw new Error('Failed to create offscreen canvas context');
      }

      // Set offscreen canvas size to match main canvas
      this.offscreenCanvas.width = canvas.width;
      this.offscreenCanvas.height = canvas.height;

      // Cache state
      this.lastBuffer = null;
      this.cachedWaveform = null;

      Logger.info('OptimizedWaveformRenderer initialized', {
        width: canvas.width,
        height: canvas.height
      });
    } catch (error) {
      Logger.error('Failed to initialize OptimizedWaveformRenderer:', error);
      throw error;
    }
  }

  /**
   * Draw waveform to canvas
   * Uses caching to avoid redrawing if buffer hasn't changed
   * @param {AudioBuffer} buffer - Audio buffer to render
   */
  drawWaveform(buffer) {
    try {
      // Use cached waveform if buffer hasn't changed
      if (buffer === this.lastBuffer && this.cachedWaveform) {
        this.ctx.putImageData(this.cachedWaveform, 0, 0);
        return;
      }

      // Clear canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!buffer) return;

      // Validate buffer
      if (!buffer.getChannelData || buffer.numberOfChannels === 0) {
        Logger.warn('Invalid audio buffer provided');
        return;
      }

      // Get audio data from first channel
      const data = buffer.getChannelData(0);
      const width = this.canvas.width;
      const height = this.canvas.height;
      const step = Math.max(1, Math.floor(data.length / width));
      const amp = height / 2;

      // Draw to offscreen canvas
      this.offscreenCtx.clearRect(0, 0, width, height);
      this.offscreenCtx.strokeStyle = DEFAULT_STROKE_STYLE;
      this.offscreenCtx.lineWidth = DEFAULT_LINE_WIDTH;
      this.offscreenCtx.beginPath();

      // Draw waveform line
      for (let i = 0; i < width; i++) {
        const sampleIndex = i * step;
        const y = amp + data[sampleIndex] * amp;

        if (i === 0) {
          this.offscreenCtx.moveTo(i, y);
        } else {
          this.offscreenCtx.lineTo(i, y);
        }
      }

      this.offscreenCtx.stroke();

      // Cache the rendered waveform with size limit
      const imageDataSize = width * height * 4; // 4 bytes per pixel (RGBA)
      if (imageDataSize > MAX_CACHE_SIZE) {
        Logger.warn(`Waveform cache exceeds max size (${imageDataSize} > ${MAX_CACHE_SIZE}), caching disabled`);
        this.cachedWaveform = null;
        this.lastBuffer = null;
        // Draw directly to main canvas
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
      } else {
        this.cachedWaveform = this.offscreenCtx.getImageData(0, 0, width, height);
        this.lastBuffer = buffer;
        // Draw cached waveform to main canvas
        this.ctx.putImageData(this.cachedWaveform, 0, 0);
      }
    } catch (error) {
      Logger.error('Failed to draw waveform:', error);
    }
  }

  /**
   * Draw waveform with playhead indicator
   * @param {AudioBuffer} buffer - Audio buffer to render
   * @param {number} positionSec - Current playhead position in seconds
   */
  drawPlayhead(buffer, positionSec) {
    try {
      // Draw cached waveform or redraw if needed
      if (this.cachedWaveform) {
        this.ctx.putImageData(this.cachedWaveform, 0, 0);
      } else {
        this.drawWaveform(buffer);
      }

      if (!buffer) return;

      // Validate position
      if (typeof positionSec !== 'number' || positionSec < 0) {
        Logger.warn('Invalid playhead position:', positionSec);
        return;
      }

      // Calculate playhead x position
      const x = (positionSec / buffer.duration) * this.canvas.width;

      // Draw playhead line
      this.ctx.strokeStyle = PLAYHEAD_COLOR;
      this.ctx.lineWidth = PLAYHEAD_LINE_WIDTH;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    } catch (error) {
      Logger.error('Failed to draw playhead:', error);
    }
  }

  /**
   * Invalidate the waveform cache
   * Forces redraw on next render
   */
  invalidateCache() {
    try {
      this.lastBuffer = null;
      this.cachedWaveform = null;
      Logger.debug('Waveform cache invalidated');
    } catch (error) {
      Logger.warn('Failed to invalidate cache:', error);
    }
  }

  /**
   * Clear the canvas
   */
  clear() {
    try {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
      Logger.debug('Canvas cleared');
    } catch (error) {
      Logger.error('Failed to clear canvas:', error);
    }
  }

  /**
   * Resize the canvas and offscreen canvas
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    try {
      if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
        throw new Error('Invalid dimensions for resize');
      }

      this.canvas.width = width;
      this.canvas.height = height;
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;

      // Invalidate cache after resize
      this.invalidateCache();

      Logger.debug('Canvas resized', { width, height });
    } catch (error) {
      Logger.error('Failed to resize canvas:', error);
    }
  }

  /**
   * Get canvas dimensions
   * @returns {Object} Object with width and height
   */
  getDimensions() {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    };
  }

  /**
   * Destroy and cleanup all resources
   */
  destroy() {
    try {
      Logger.info('Destroying OptimizedWaveformRenderer...');

      // Clear canvases
      this.clear();

      // Clear cache
      this.invalidateCache();

      // Clear references
      this.canvas = null;
      this.ctx = null;
      this.offscreenCanvas = null;
      this.offscreenCtx = null;

      Logger.info('OptimizedWaveformRenderer destroyed');
    } catch (error) {
      Logger.error('Error during OptimizedWaveformRenderer destruction:', error);
    }
  }
}

export default OptimizedWaveformRenderer;
