/**
 * WinAMP-style Spectrum Analyzer with improved resource management
 */

import { ResourceManager } from '../utils/resourceManager.js';

// Constants
const DEFAULT_FFT_SIZE = 512;
const DEFAULT_SMOOTHING = 0.8;
const DEFAULT_BAR_COUNT = 32;
const PEAK_FALL_SPEED = 2;
const NYQUIST_FREQUENCY = 22050;
const MIN_FREQUENCY = 80;
const GRID_LINE_COUNT = 4;

// Color thresholds
const HIGH_THRESHOLD = 0.8;
const MED_THRESHOLD = 0.4;

export class WinAMPSpectrumAnalyzer {
  constructor(canvasElement, analyserNode) {
    if (!canvasElement || !analyserNode) {
      throw new Error('Canvas element and analyser node are required');
    }

    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.analyser = analyserNode;
    this.resourceManager = new ResourceManager();

    // Configure analyser
    this.analyser.fftSize = DEFAULT_FFT_SIZE;
    this.analyser.smoothingTimeConstant = DEFAULT_SMOOTHING;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    // Visualization settings
    this.barCount = DEFAULT_BAR_COUNT;
    this.mode = 'bars';
    this.isAnimating = false;
    this.animationFrameId = null;

    // Peak tracking
    this.peakValues = new Array(this.barCount).fill(0);
    this.peakFallSpeed = PEAK_FALL_SPEED;

    this.frequencyRanges = this.calculateFrequencyRanges();
    this.setupCanvas();
  }

  setupCanvas() {
    try {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;

      this.ctx.scale(dpr, dpr);
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';

      this.width = rect.width;
      this.height = rect.height;
      this.barWidth = this.width / this.barCount;
    } catch (error) {
      console.error('Failed to setup canvas:', error);
      throw error;
    }
  }

  calculateFrequencyRanges() {
    const ranges = [];
    const logMin = Math.log10(MIN_FREQUENCY);
    const logMax = Math.log10(NYQUIST_FREQUENCY);

    for (let i = 0; i < this.barCount; i++) {
      const logFreq = logMin + (logMax - logMin) * (i / (this.barCount - 1));
      const freq = Math.pow(10, logFreq);
      const binIndex = Math.round((freq / NYQUIST_FREQUENCY) * this.bufferLength);
      ranges.push(Math.min(binIndex, this.bufferLength - 1));
    }

    return ranges;
  }

  start() {
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animate();
    }
  }

  stop() {
    this.isAnimating = false;
    if (this.animationFrameId !== null) {
      this.resourceManager.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.clearCanvas();
  }

  animate() {
    if (!this.isAnimating) return;

    try {
      this.analyser.getByteFrequencyData(this.dataArray);
      this.draw();

      this.animationFrameId = this.resourceManager.requestAnimationFrame(() => this.animate());
    } catch (error) {
      console.error('Animation error:', error);
      this.stop();
    }
  }

  draw() {
    this.clearCanvas();

    if (this.mode === 'bars') {
      this.drawBars();
    } else {
      this.drawLine();
    }
  }

  clearCanvas() {
    // Fill background
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw grid
    this.ctx.strokeStyle = '#111';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();

    // Horizontal lines
    for (let i = 1; i < GRID_LINE_COUNT; i++) {
      const y = (this.height / GRID_LINE_COUNT) * i;
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
    }

    // Vertical lines
    for (let i = 1; i < this.barCount; i++) {
      const x = this.barWidth * i;
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
    }

    this.ctx.stroke();
  }

  drawBars() {
    for (let i = 0; i < this.barCount; i++) {
      const binIndex = this.frequencyRanges[i];
      const value = this.dataArray[binIndex] || 0;
      const normalizedValue = value / 255;
      const barHeight = normalizedValue * this.height;

      const x = i * this.barWidth;
      const y = this.height - barHeight;

      // Create gradient based on intensity
      const gradient = this.ctx.createLinearGradient(0, this.height, 0, 0);

      if (normalizedValue > HIGH_THRESHOLD) {
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(0.6, '#ffff00');
        gradient.addColorStop(1, '#ff0000');
      } else if (normalizedValue > MED_THRESHOLD) {
        gradient.addColorStop(0, '#00ff00');
        gradient.addColorStop(1, '#ffff00');
      } else {
        gradient.addColorStop(0, '#008000');
        gradient.addColorStop(1, '#00ff00');
      }

      // Draw bar
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(x + 1, y, this.barWidth - 2, barHeight);

      // Update and draw peak
      if (normalizedValue > this.peakValues[i]) {
        this.peakValues[i] = normalizedValue;
      } else {
        this.peakValues[i] = Math.max(0, this.peakValues[i] - this.peakFallSpeed / 60);
      }

      const peakY = this.height - (this.peakValues[i] * this.height);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x + 1, peakY - 1, this.barWidth - 2, 2);
    }
  }

  drawLine() {
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < this.barCount; i++) {
      const binIndex = this.frequencyRanges[i];
      const value = this.dataArray[binIndex] || 0;
      const normalizedValue = value / 255;

      const x = (i / (this.barCount - 1)) * this.width;
      const y = this.height - (normalizedValue * this.height);

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();
  }

  setMode(mode) {
    if (mode === 'bars' || mode === 'line') {
      this.mode = mode;
    } else {
      console.warn(`Invalid mode: ${mode}. Using 'bars' as default.`);
      this.mode = 'bars';
    }
  }

  getFrequencyAtBar(barIndex) {
    const logMin = Math.log10(MIN_FREQUENCY);
    const logMax = Math.log10(NYQUIST_FREQUENCY);
    const logFreq = logMin + (logMax - logMin) * (barIndex / (this.barCount - 1));
    return Math.round(Math.pow(10, logFreq));
  }

  getPeakFrequency() {
    let maxValue = 0;
    let maxIndex = 0;

    for (let i = 0; i < this.barCount; i++) {
      const binIndex = this.frequencyRanges[i];
      const value = this.dataArray[binIndex] || 0;

      if (value > maxValue) {
        maxValue = value;
        maxIndex = i;
      }
    }

    return this.getFrequencyAtBar(maxIndex);
  }

  getRMSLevel() {
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += (this.dataArray[i] / 255) ** 2;
    }
    return Math.sqrt(sum / this.dataArray.length);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    this.resourceManager.destroy();
  }
}

export default WinAMPSpectrumAnalyzer;
