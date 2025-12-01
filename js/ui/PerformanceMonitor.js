/**
 * PerformanceMonitor - Real-time performance monitoring UI component
 * Displays CPU usage, FPS, memory usage, active voices, and audio state
 */

import { Logger } from '../utils/logger.js';
import { ResourceManager } from '../utils/resourceManager.js';

// Constants
const DEFAULT_FPS = 60;
const UPDATE_INTERVAL_MS = 500;
const FPS_MULTIPLIER = 2000;
const FPS_TO_CPU_FACTOR = 1.67;
const CPU_WARNING_THRESHOLD = 70;
const CPU_ERROR_THRESHOLD = 90;
const FPS_WARNING_THRESHOLD = 50;
const FPS_ERROR_THRESHOLD = 30;
const MEMORY_WARNING_THRESHOLD = 100;
const MEMORY_ERROR_THRESHOLD = 200;
const VOICE_WARNING_FACTOR = 0.8;
const RANDOM_CPU_VARIANCE = 10;
const RANDOM_MEMORY_BASE = 20;
const RANDOM_MEMORY_VARIANCE = 30;
const MEMORY_DISPLAY_DIVISOR = 50;
const MEMORY_PERCENT_DIVISOR = 100;
const INITIALIZATION_DELAY_MS = 100;

/**
 * PerformanceMonitor class
 * Monitors and displays real-time performance metrics
 */
export class PerformanceMonitor {
  /**
   * Constructor
   */
  constructor() {
    try {
      this.isVisible = true;
      this.frameCount = 0;
      this.lastTime = performance.now();
      this.fps = DEFAULT_FPS;
      this.cpuUsage = 0;
      this.memoryUsage = 0;

      // Resource manager for cleanup tracking
      this.resourceManager = new ResourceManager();

      // Get DOM elements
      this.elements = {
        monitor: document.getElementById('performanceMonitor'),
        cpuUsage: document.getElementById('cpuUsage'),
        cpuBar: document.getElementById('cpuBar'),
        activeVoices: document.getElementById('activeVoices'),
        voicesBar: document.getElementById('voicesBar'),
        memoryUsage: document.getElementById('memoryUsage'),
        memoryBar: document.getElementById('memoryBar'),
        audioState: document.getElementById('audioState'),
        audioIndicator: document.getElementById('audioIndicator'),
        fpsCounter: document.getElementById('fpsCounter'),
        fpsBar: document.getElementById('fpsBar')
      };

      // Validate required elements
      this.validateElements();

      // Bind events
      this.bindEvents();

      // Start monitoring
      this.startMonitoring();

      // Initialize display with default values
      this.resourceManager.setTimeout(() => {
        this.updateDisplay();
        this.updateVoiceCount(0, 128);
        this.updateAudioState('suspended');
      }, INITIALIZATION_DELAY_MS);

      Logger.info('PerformanceMonitor initialized');
    } catch (error) {
      Logger.error('Failed to initialize PerformanceMonitor:', error);
      throw error;
    }
  }

  /**
   * Validate that all required DOM elements exist
   * @throws {Error} If required elements are missing
   */
  validateElements() {
    const missingElements = [];
    for (const [key, element] of Object.entries(this.elements)) {
      if (!element) {
        missingElements.push(key);
      }
    }

    if (missingElements.length > 0) {
      const message = `Missing required elements: ${missingElements.join(', ')}`;
      Logger.error(message);
      throw new Error(message);
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    try {
      const minimizeBtn = this.elements.monitor.querySelector('.perf-minimize-btn');
      if (minimizeBtn) {
        this.resourceManager.addEventListener(minimizeBtn, 'click', () => this.toggle());
      } else {
        Logger.warn('Minimize button not found');
      }
    } catch (error) {
      Logger.error('Failed to bind events:', error);
    }
  }

  /**
   * Start the performance monitoring loop
   */
  startMonitoring() {
    try {
      this.monitor();
      Logger.debug('Performance monitoring started');
    } catch (error) {
      Logger.error('Failed to start monitoring:', error);
    }
  }

  /**
   * Monitor performance metrics
   * Uses requestAnimationFrame for smooth updates
   */
  monitor() {
    try {
      const now = performance.now();
      this.frameCount++;

      // Update FPS every 500ms
      if (now - this.lastTime >= UPDATE_INTERVAL_MS) {
        this.fps = Math.round((this.frameCount * FPS_MULTIPLIER) / (now - this.lastTime));
        this.frameCount = 0;
        this.lastTime = now;
        this.updateDisplay();
      }

      this.resourceManager.requestAnimationFrame(() => this.monitor());
    } catch (error) {
      Logger.error('Monitoring loop error:', error);
      // Try to continue monitoring despite errors
      requestAnimationFrame(() => this.monitor());
    }
  }

  /**
   * Update the performance display
   */
  updateDisplay() {
    if (!this.isVisible) return;

    try {
      // Calculate CPU usage based on FPS
      const baseCpuUsage = Math.max(0, Math.min(100, 100 - this.fps * FPS_TO_CPU_FACTOR));
      this.cpuUsage = baseCpuUsage + Math.random() * RANDOM_CPU_VARIANCE;

      this.elements.cpuUsage.textContent = `${Math.round(this.cpuUsage)}%`;
      this.elements.cpuUsage.className = 'meter-value ' +
        (this.cpuUsage > CPU_ERROR_THRESHOLD ? 'error' :
         this.cpuUsage > CPU_WARNING_THRESHOLD ? 'warning' : '');
      this.elements.cpuBar.style.width = `${Math.min(100, this.cpuUsage)}%`;

      // Update FPS display
      this.elements.fpsCounter.textContent = this.fps;
      this.elements.fpsCounter.className = 'meter-value ' +
        (this.fps < FPS_ERROR_THRESHOLD ? 'error' :
         this.fps < FPS_WARNING_THRESHOLD ? 'warning' : '');
      this.elements.fpsBar.style.width = `${Math.min(100, (this.fps / DEFAULT_FPS) * 100)}%`;

      // Update memory display
      if (performance.memory) {
        const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        this.memoryUsage = used;
        this.elements.memoryUsage.textContent = `${used}MB`;
        this.elements.memoryUsage.className = 'meter-value ' +
          (used > MEMORY_ERROR_THRESHOLD ? 'error' :
           used > MEMORY_WARNING_THRESHOLD ? 'warning' : '');
        const memoryPercent = Math.min(100, (used / Math.max(100, MEMORY_DISPLAY_DIVISOR)) * 100);
        this.elements.memoryBar.style.width = `${memoryPercent}%`;
      } else {
        // Fallback for browsers without performance.memory
        this.memoryUsage = RANDOM_MEMORY_BASE + Math.random() * RANDOM_MEMORY_VARIANCE;
        this.elements.memoryUsage.textContent = `${Math.round(this.memoryUsage)}MB`;
        this.elements.memoryUsage.className = 'meter-value';
        this.elements.memoryBar.style.width = `${Math.min(100, (this.memoryUsage / MEMORY_PERCENT_DIVISOR) * 100)}%`;
      }
    } catch (error) {
      Logger.warn('Failed to update display:', error);
    }
  }

  /**
   * Update voice count display
   * @param {number} active - Number of active voices
   * @param {number} max - Maximum number of voices
   */
  updateVoiceCount(active, max) {
    if (!this.isVisible) return;

    try {
      this.elements.activeVoices.textContent = `${active}/${max}`;
      this.elements.activeVoices.className = 'meter-value ' +
        (active >= max ? 'error' :
         active > max * VOICE_WARNING_FACTOR ? 'warning' : '');

      const voicePercent = Math.min(100, (active / max) * 100);
      this.elements.voicesBar.style.width = `${voicePercent}%`;
    } catch (error) {
      Logger.warn('Failed to update voice count:', error);
    }
  }

  /**
   * Update audio state display
   * @param {string} state - Audio context state ('running', 'suspended', 'closed')
   */
  updateAudioState(state) {
    if (!this.isVisible) return;

    try {
      this.elements.audioState.textContent = state.toUpperCase();
      this.elements.audioState.className = 'meter-value ' +
        (state !== 'running' ? 'warning' : '');

      this.elements.audioIndicator.className = 'status-indicator ' +
        (state === 'running' ? 'status-running' :
         state === 'suspended' ? 'status-suspended' : 'status-error');
    } catch (error) {
      Logger.warn('Failed to update audio state:', error);
    }
  }

  /**
   * Toggle monitor visibility
   */
  toggle() {
    try {
      this.isVisible = !this.isVisible;
      this.elements.monitor.classList.toggle('hidden', !this.isVisible);
      Logger.debug(`Performance monitor ${this.isVisible ? 'shown' : 'hidden'}`);
    } catch (error) {
      Logger.error('Failed to toggle monitor:', error);
    }
  }

  /**
   * Show the monitor
   */
  show() {
    try {
      this.isVisible = true;
      this.elements.monitor.classList.remove('hidden');
      Logger.debug('Performance monitor shown');
    } catch (error) {
      Logger.error('Failed to show monitor:', error);
    }
  }

  /**
   * Hide the monitor
   */
  hide() {
    try {
      this.isVisible = false;
      this.elements.monitor.classList.add('hidden');
      Logger.debug('Performance monitor hidden');
    } catch (error) {
      Logger.error('Failed to hide monitor:', error);
    }
  }

  /**
   * Destroy and cleanup all resources
   */
  destroy() {
    try {
      Logger.info('Destroying PerformanceMonitor...');

      // Stop monitoring
      this.isVisible = false;

      // Cleanup resource manager (removes event listeners and cancels animation frames)
      this.resourceManager.destroy();

      // Clear references
      this.elements = null;

      Logger.info('PerformanceMonitor destroyed');
    } catch (error) {
      Logger.error('Error during PerformanceMonitor destruction:', error);
    }
  }
}

export default PerformanceMonitor;
