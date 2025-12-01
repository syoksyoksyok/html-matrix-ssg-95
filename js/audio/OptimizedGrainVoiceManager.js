/**
 * OptimizedGrainVoiceManager - Manages granular synthesis voices
 * Handles voice pooling, grain scheduling, and audio node management
 */

import { Logger } from '../utils/logger.js';
import { ResourceManager } from '../utils/resourceManager.js';

// Constants
const DEFAULT_MAX_VOICES = 128;
const CLEANUP_INTERVAL = 60;
const CLEANUP_DELAY = 0.1;
const DEFAULT_FFT_SIZE = 512;
const DEFAULT_SMOOTHING = 0.8;
const LEFT_ANALYSER_SMOOTHING = 0.1;
const MIN_DECIBELS = -90;
const MAX_DECIBELS = -10;
const BASE_GAIN = 0.2;
const DEFAULT_FILTER_FREQUENCY = 350;
const ENVELOPE_STEPS = {
  LOGARITHMIC: 10,
  SIGMOID: 15,
  COSINE: 12,
  GAUSSIAN: 20,
  HANNING: 16
};

/**
 * OptimizedGrainVoiceManager class
 * Manages multiple grain voices with optimized audio node pooling
 */
export class OptimizedGrainVoiceManager {
  /**
   * Constructor
   * @param {AudioContext} audioContext - Web Audio API context
   * @param {number} maxVoices - Maximum number of concurrent voices
   */
  constructor(audioContext, maxVoices = DEFAULT_MAX_VOICES) {
    try {
      this.audioContext = audioContext;
      this.maxVoices = maxVoices;
      this.activeVoices = new Set();
      this.voicePool = [];
      this.cleanupQueue = [];
      this.lastCleanup = 0;

      // Resource manager for cleanup tracking
      this.resourceManager = new ResourceManager();

      // Create master gain node
      this.masterGain = audioContext.createGain();
      this.masterGain.gain.value = 1.0;

      // Create stereo splitter for left/right analysis
      this.stereoSplitter = audioContext.createChannelSplitter(2);

      // Create separate analysers for left and right channels
      this.leftAnalyser = audioContext.createAnalyser();
      this.rightAnalyser = audioContext.createAnalyser();

      // Configure analysers
      [this.leftAnalyser, this.rightAnalyser].forEach(analyser => {
        analyser.fftSize = DEFAULT_FFT_SIZE;
        analyser.smoothingTimeConstant = LEFT_ANALYSER_SMOOTHING;
        analyser.minDecibels = MIN_DECIBELS;
        analyser.maxDecibels = MAX_DECIBELS;
      });

      // Connect stereo chain
      this.masterGain.connect(this.stereoSplitter);
      this.stereoSplitter.connect(this.leftAnalyser, 0);
      this.stereoSplitter.connect(this.rightAnalyser, 1);

      // Connect to destination
      this.masterGain.connect(audioContext.destination);

      // Create main analyser for overall audio
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = DEFAULT_FFT_SIZE;
      this.analyser.smoothingTimeConstant = DEFAULT_SMOOTHING;
      this.masterGain.connect(this.analyser);

      // Initialize node pool
      this.nodePool = {
        gainNodes: [],
        filterNodes: [],
        pannerNodes: []
      };

      // Pre-allocate nodes for better performance
      this.preAllocateNodes();

      Logger.info('OptimizedGrainVoiceManager initialized', {
        maxVoices,
        fftSize: DEFAULT_FFT_SIZE
      });
    } catch (error) {
      Logger.error('Failed to initialize OptimizedGrainVoiceManager:', error);
      throw error;
    }
  }

  /**
   * Get left channel analyser
   * @returns {AnalyserNode} Left channel analyser
   */
  getLeftAnalyser() {
    return this.leftAnalyser;
  }

  /**
   * Get right channel analyser
   * @returns {AnalyserNode} Right channel analyser
   */
  getRightAnalyser() {
    return this.rightAnalyser;
  }

  /**
   * Get LED analyser (currently mapped to left channel)
   * @returns {AnalyserNode} LED analyser
   */
  getLEDAnalyser() {
    return this.leftAnalyser;
  }

  /**
   * Pre-allocate audio nodes for the pool
   * Improves performance by reducing GC pressure
   */
  preAllocateNodes() {
    try {
      for (let i = 0; i < this.maxVoices; i++) {
        this.nodePool.gainNodes.push(this.audioContext.createGain());
        this.nodePool.filterNodes.push(this.audioContext.createBiquadFilter());
        this.nodePool.pannerNodes.push(this.audioContext.createStereoPanner());
      }
      Logger.debug(`Pre-allocated ${this.maxVoices} nodes for each type`);
    } catch (error) {
      Logger.error('Failed to pre-allocate nodes:', error);
      throw error;
    }
  }

  /**
   * Get pooled audio nodes
   * @returns {Object} Object containing gainNode, filterNode, and pannerNode
   */
  getPooledNodes() {
    try {
      return {
        gainNode: this.nodePool.gainNodes.pop() || this.audioContext.createGain(),
        filterNode: this.nodePool.filterNodes.pop() || this.audioContext.createBiquadFilter(),
        pannerNode: this.nodePool.pannerNodes.pop() || this.audioContext.createStereoPanner()
      };
    } catch (error) {
      Logger.error('Failed to get pooled nodes:', error);
      // Return newly created nodes as fallback
      return {
        gainNode: this.audioContext.createGain(),
        filterNode: this.audioContext.createBiquadFilter(),
        pannerNode: this.audioContext.createStereoPanner()
      };
    }
  }

  /**
   * Return nodes to the pool for reuse
   * @param {Object} nodes - Object containing audio nodes to return
   */
  returnNodesToPool(nodes) {
    try {
      // Reset gain node
      nodes.gainNode.gain.cancelScheduledValues(0);
      nodes.gainNode.gain.value = 1;
      nodes.gainNode.disconnect();

      // Reset filter node
      nodes.filterNode.frequency.cancelScheduledValues(0);
      nodes.filterNode.frequency.value = DEFAULT_FILTER_FREQUENCY;
      nodes.filterNode.disconnect();

      // Reset panner node
      nodes.pannerNode.pan.cancelScheduledValues(0);
      nodes.pannerNode.pan.value = 0;
      nodes.pannerNode.disconnect();

      // Return to pool
      this.nodePool.gainNodes.push(nodes.gainNode);
      this.nodePool.filterNodes.push(nodes.filterNode);
      this.nodePool.pannerNodes.push(nodes.pannerNode);
    } catch (error) {
      Logger.warn('Failed to return nodes to pool:', error);
      // Don't throw - this is cleanup code
    }
  }

  /**
   * Create a grain with the given parameters
   * @param {AudioBuffer} buffer - Audio buffer to play
   * @param {Object} params - Grain parameters
   * @param {number} startTime - Start time in audio context time
   * @param {number} duration - Duration of the grain
   * @param {number} position - Position in the buffer to start from
   * @returns {Object|null} Grain object or null if creation failed
   */
  createGrain(buffer, params, startTime, duration, position) {
    try {
      const now = this.audioContext.currentTime;

      // Periodic cleanup
      if (++this.lastCleanup % CLEANUP_INTERVAL === 0) {
        this.performCleanup();
      }

      // Force cleanup if at max voices
      if (this.activeVoices.size >= this.maxVoices) {
        this.forceCleanupOldest();
      }

      const grain = this.createOptimizedGrain(buffer, params, startTime, duration, position);
      if (grain) {
        this.activeVoices.add(grain);
        this.scheduleCleanup(grain, startTime + duration + CLEANUP_DELAY);
      }

      return grain;
    } catch (error) {
      Logger.error('Failed to create grain:', error);
      return null;
    }
  }

  /**
   * Create an optimized grain with audio nodes
   * @param {AudioBuffer} buffer - Audio buffer to play
   * @param {Object} params - Grain parameters
   * @param {number} startTime - Start time in audio context time
   * @param {number} duration - Duration of the grain
   * @param {number} position - Position in the buffer to start from
   * @returns {Object|null} Grain object or null if creation failed
   */
  createOptimizedGrain(buffer, params, startTime, duration, position) {
    try {
      // Create buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = params.playbackRate;

      // Get nodes from pool
      const nodes = this.getPooledNodes();

      // Configure filter
      nodes.filterNode.type = 'highpass';
      nodes.filterNode.frequency.value = params.cutoffFreq;

      // Configure panner with randomization
      const randomAmount = params.panRandom || 0;
      const panValue = Math.max(-1, Math.min(1,
        params.panControl + (Math.random() - 0.5) * randomAmount));
      nodes.pannerNode.pan.value = panValue;

      // Apply envelope
      this.applyOptimizedEnvelope(nodes.gainNode, startTime, duration, params);

      // Connect audio graph
      source
        .connect(nodes.filterNode)
        .connect(nodes.pannerNode)
        .connect(nodes.gainNode)
        .connect(this.masterGain);

      // Start playback
      source.start(startTime, position, duration);

      // Create grain object
      const grain = {
        source,
        nodes,
        endTime: startTime + duration,
        isActive: true
      };

      // Set up cleanup when source ends
      source.onended = () => {
        this.cleanupGrain(grain);
      };

      return grain;

    } catch (error) {
      Logger.warn('Grain creation failed:', error);
      return null;
    }
  }

  /**
   * Apply optimized envelope to gain node
   * @param {GainNode} gainNode - Gain node to apply envelope to
   * @param {number} startTime - Start time
   * @param {number} duration - Duration
   * @param {Object} params - Envelope parameters
   */
  applyOptimizedEnvelope(gainNode, startTime, duration, params) {
    try {
      const attackTime = Math.min(duration * 0.3, params.attackTime / 1000);
      const releaseTime = Math.min(duration * 0.7, params.decayTime / 1000);
      const sustainTime = Math.max(0, duration - attackTime - releaseTime);
      const peakGain = BASE_GAIN * (params.volume || 0.7);

      gainNode.gain.setValueAtTime(0, startTime);

      const envelopeType = parseInt(params.envelopeShape);

      switch (envelopeType) {
        case 0: // Linear
          gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attackTime);
          if (sustainTime > 0) {
            gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
          }
          gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
          break;

        case 1: // Exponential
          gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + attackTime);
          if (sustainTime > 0) {
            gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
          }
          gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          break;

        case 2: // Logarithmic
          this.applyLogarithmicEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain);
          break;

        case 3: // Sigmoid
          this.applySigmoidEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain);
          break;

        case 4: // Cosine
          this.applyCosineEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain);
          break;

        case 5: // Gaussian
          this.applyGaussianEnvelope(gainNode, startTime, duration, peakGain);
          break;

        case 6: // Hanning
          this.applyHanningEnvelope(gainNode, startTime, duration, peakGain);
          break;

        case 7: // Triangular
          this.applyTriangularEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain);
          break;

        default: // Default to linear
          gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attackTime);
          if (sustainTime > 0) {
            gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
          }
          gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
          break;
      }
    } catch (error) {
      Logger.warn('Failed to apply envelope:', error);
    }
  }

  /**
   * Apply logarithmic envelope
   */
  applyLogarithmicEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain) {
    const steps = ENVELOPE_STEPS.LOGARITHMIC;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const attackValue = peakGain * Math.log(1 + t * (Math.E - 1)) / Math.log(Math.E);
      gainNode.gain.linearRampToValueAtTime(attackValue, startTime + (attackTime * t));
    }

    if (sustainTime > 0) {
      gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
    }

    const releaseStart = startTime + attackTime + sustainTime;
    const releaseTime = duration - attackTime - sustainTime;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const releaseValue = peakGain * (1 - Math.log(1 + t * (Math.E - 1)) / Math.log(Math.E));
      gainNode.gain.linearRampToValueAtTime(releaseValue, releaseStart + (releaseTime * t));
    }
  }

  /**
   * Apply sigmoid envelope
   */
  applySigmoidEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain) {
    const steps = ENVELOPE_STEPS.SIGMOID;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (t - 0.5) * 12;
      const sigmoid = 1 / (1 + Math.exp(-x));
      const attackValue = peakGain * sigmoid;
      gainNode.gain.linearRampToValueAtTime(attackValue, startTime + (attackTime * t));
    }

    if (sustainTime > 0) {
      gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
    }

    const releaseStart = startTime + attackTime + sustainTime;
    const releaseTime = duration - attackTime - sustainTime;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (0.5 - t) * 12;
      const sigmoid = 1 / (1 + Math.exp(-x));
      const releaseValue = peakGain * sigmoid;
      gainNode.gain.linearRampToValueAtTime(releaseValue, releaseStart + (releaseTime * t));
    }
  }

  /**
   * Apply cosine envelope
   */
  applyCosineEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain) {
    const steps = ENVELOPE_STEPS.COSINE;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI / 2;
      const attackValue = peakGain * Math.sin(angle);
      gainNode.gain.linearRampToValueAtTime(attackValue, startTime + (attackTime * t));
    }

    if (sustainTime > 0) {
      gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
    }

    const releaseStart = startTime + attackTime + sustainTime;
    const releaseTime = duration - attackTime - sustainTime;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = Math.PI / 2 + t * Math.PI / 2;
      const releaseValue = peakGain * Math.abs(Math.sin(angle));
      gainNode.gain.linearRampToValueAtTime(releaseValue, releaseStart + (releaseTime * t));
    }
  }

  /**
   * Apply Gaussian envelope
   */
  applyGaussianEnvelope(gainNode, startTime, duration, peakGain) {
    const steps = ENVELOPE_STEPS.GAUSSIAN;
    const sigma = duration / 6;
    const center = duration / 2;

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * duration;
      const x = t - center;
      const gaussian = Math.exp(-(x * x) / (2 * sigma * sigma));
      const value = peakGain * gaussian;
      gainNode.gain.linearRampToValueAtTime(value, startTime + t);
    }
  }

  /**
   * Apply Hanning envelope
   */
  applyHanningEnvelope(gainNode, startTime, duration, peakGain) {
    const steps = ENVELOPE_STEPS.HANNING;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const hanning = 0.5 * (1 - Math.cos(2 * Math.PI * t));
      const value = peakGain * hanning;
      gainNode.gain.linearRampToValueAtTime(value, startTime + (duration * t));
    }
  }

  /**
   * Apply triangular envelope
   */
  applyTriangularEnvelope(gainNode, startTime, attackTime, sustainTime, duration, peakGain) {
    gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attackTime);

    if (sustainTime > 0) {
      gainNode.gain.setValueAtTime(peakGain, startTime + attackTime + sustainTime);
    }

    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
  }

  /**
   * Schedule cleanup for a grain
   * @param {Object} grain - Grain to cleanup
   * @param {number} cleanupTime - Time to perform cleanup
   */
  scheduleCleanup(grain, cleanupTime) {
    this.cleanupQueue.push({ grain, time: cleanupTime });
  }

  /**
   * Perform scheduled cleanup of finished grains
   */
  performCleanup() {
    try {
      const now = this.audioContext.currentTime;
      const toCleanup = [];

      for (let i = this.cleanupQueue.length - 1; i >= 0; i--) {
        const item = this.cleanupQueue[i];
        if (item.time <= now) {
          toCleanup.push(item.grain);
          this.cleanupQueue.splice(i, 1);
        }
      }

      toCleanup.forEach(grain => this.cleanupGrain(grain));
    } catch (error) {
      Logger.warn('Cleanup failed:', error);
    }
  }

  /**
   * Force cleanup of the oldest grain
   */
  forceCleanupOldest() {
    try {
      let oldestGrain = null;
      let oldestTime = Infinity;

      for (const grain of this.activeVoices) {
        if (grain.endTime < oldestTime) {
          oldestTime = grain.endTime;
          oldestGrain = grain;
        }
      }

      if (oldestGrain) {
        this.cleanupGrain(oldestGrain);
      }
    } catch (error) {
      Logger.warn('Force cleanup failed:', error);
    }
  }

  /**
   * Clean up a grain and return resources to pool
   * @param {Object} grain - Grain to cleanup
   */
  cleanupGrain(grain) {
    if (!grain.isActive) return;

    try {
      grain.isActive = false;
      this.activeVoices.delete(grain);

      if (grain.source) {
        try {
          grain.source.stop();
          grain.source.disconnect();
        } catch (e) {
          // Already stopped - ignore
        }
      }

      if (grain.nodes) {
        this.returnNodesToPool(grain.nodes);
      }
    } catch (error) {
      Logger.warn('Grain cleanup failed:', error);
    }
  }

  /**
   * Stop all active grains
   */
  stopAll() {
    try {
      for (const grain of this.activeVoices) {
        this.cleanupGrain(grain);
      }
      this.cleanupQueue.length = 0;
      Logger.debug('All grains stopped');
    } catch (error) {
      Logger.error('Failed to stop all grains:', error);
    }
  }

  /**
   * Get the count of active voices
   * @returns {number} Number of active voices
   */
  getActiveVoiceCount() {
    return this.activeVoices.size;
  }

  /**
   * Get the main analyser node
   * @returns {AnalyserNode} Main analyser
   */
  getAnalyser() {
    return this.analyser;
  }

  /**
   * Set master volume
   * @param {number} volume - Volume level (0-1)
   */
  setMasterVolume(volume) {
    try {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    } catch (error) {
      Logger.error('Failed to set master volume:', error);
    }
  }

  /**
   * Destroy and cleanup all resources
   */
  destroy() {
    try {
      Logger.info('Destroying OptimizedGrainVoiceManager...');

      // Stop all active grains
      this.stopAll();

      // Disconnect all audio nodes
      if (this.masterGain) {
        this.masterGain.disconnect();
      }
      if (this.stereoSplitter) {
        this.stereoSplitter.disconnect();
      }
      if (this.leftAnalyser) {
        this.leftAnalyser.disconnect();
      }
      if (this.rightAnalyser) {
        this.rightAnalyser.disconnect();
      }
      if (this.analyser) {
        this.analyser.disconnect();
      }

      // Clear pools
      this.nodePool.gainNodes = [];
      this.nodePool.filterNodes = [];
      this.nodePool.pannerNodes = [];

      // Clear collections
      this.activeVoices.clear();
      this.voicePool = [];
      this.cleanupQueue = [];

      // Cleanup resource manager
      this.resourceManager.destroy();

      Logger.info('OptimizedGrainVoiceManager destroyed');
    } catch (error) {
      Logger.error('Error during OptimizedGrainVoiceManager destruction:', error);
    }
  }
}

export default OptimizedGrainVoiceManager;
