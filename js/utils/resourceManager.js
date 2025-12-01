/**
 * Resource Manager - Manages event listeners and timers
 * Provides cleanup mechanisms to prevent memory leaks
 */

export class ResourceManager {
  constructor() {
    this.eventListeners = [];
    this.timers = [];
    this.animationFrames = [];
  }

  /**
   * Add an event listener and track it for cleanup
   */
  addEventListener(element, event, handler, options) {
    try {
      element.addEventListener(event, handler, options);
      this.eventListeners.push({ element, event, handler, options });
    } catch (error) {
      console.error('Failed to add event listener:', error);
    }
  }

  /**
   * Set a timeout and track it for cleanup
   */
  setTimeout(callback, delay) {
    try {
      const id = setTimeout(callback, delay);
      this.timers.push({ id, type: 'timeout' });
      return id;
    } catch (error) {
      console.error('Failed to set timeout:', error);
      return null;
    }
  }

  /**
   * Set an interval and track it for cleanup
   */
  setInterval(callback, delay) {
    try {
      const id = setInterval(callback, delay);
      this.timers.push({ id, type: 'interval' });
      return id;
    } catch (error) {
      console.error('Failed to set interval:', error);
      return null;
    }
  }

  /**
   * Request animation frame and track it for cleanup
   */
  requestAnimationFrame(callback) {
    try {
      const id = requestAnimationFrame(callback);
      this.animationFrames.push(id);
      return id;
    } catch (error) {
      console.error('Failed to request animation frame:', error);
      return null;
    }
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(id) {
    clearTimeout(id);
    this.timers = this.timers.filter(timer => timer.id !== id);
  }

  /**
   * Clear a specific interval
   */
  clearInterval(id) {
    clearInterval(id);
    this.timers = this.timers.filter(timer => timer.id !== id);
  }

  /**
   * Cancel a specific animation frame
   */
  cancelAnimationFrame(id) {
    cancelAnimationFrame(id);
    this.animationFrames = this.animationFrames.filter(frameId => frameId !== id);
  }

  /**
   * Clean up all tracked resources
   */
  destroy() {
    // Remove all event listeners
    this.eventListeners.forEach(({ element, event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.error('Failed to remove event listener:', error);
      }
    });
    this.eventListeners = [];

    // Clear all timers
    this.timers.forEach(({ id, type }) => {
      try {
        if (type === 'timeout') {
          clearTimeout(id);
        } else if (type === 'interval') {
          clearInterval(id);
        }
      } catch (error) {
        console.error('Failed to clear timer:', error);
      }
    });
    this.timers = [];

    // Cancel all animation frames
    this.animationFrames.forEach(id => {
      try {
        cancelAnimationFrame(id);
      } catch (error) {
        console.error('Failed to cancel animation frame:', error);
      }
    });
    this.animationFrames = [];
  }
}

export default ResourceManager;
