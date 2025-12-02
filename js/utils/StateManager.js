/**
 * State Manager
 * Handles state persistence, undo/redo functionality with optimized cloning
 */

import { Logger } from './logger.js';

export class StateManager {
    constructor(maxHistoryStates = 50) {
        this.maxHistoryStates = maxHistoryStates;
        this.history = [];
        this.historyIndex = -1;
    }

    /**
     * Save current state to history
     * Uses structuredClone for better performance than JSON.parse(JSON.stringify())
     * @param {Object} state - State object to save
     * @returns {boolean} Success status
     */
    saveState(state) {
        try {
            // Remove any states after current index (when undoing then making new changes)
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }

            // Clone state efficiently
            const clonedState = this._cloneState(state);

            // Add to history
            this.history.push(clonedState);

            // Limit history size
            if (this.history.length > this.maxHistoryStates) {
                this.history.shift();
            } else {
                this.historyIndex++;
            }

            Logger.log(`💾 State saved (${this.historyIndex + 1}/${this.history.length})`);
            return true;
        } catch (error) {
            Logger.error('Failed to save state:', error);
            return false;
        }
    }

    /**
     * Undo to previous state
     * @returns {Object|null} Previous state or null if unavailable
     */
    undo() {
        if (!this.canUndo()) {
            Logger.log('⚠️ No more undo history');
            return null;
        }

        this.historyIndex--;
        const state = this._cloneState(this.history[this.historyIndex]);
        Logger.log(`↶ Undo (${this.historyIndex + 1}/${this.history.length})`);
        return state;
    }

    /**
     * Redo to next state
     * @returns {Object|null} Next state or null if unavailable
     */
    redo() {
        if (!this.canRedo()) {
            Logger.log('⚠️ No more redo history');
            return null;
        }

        this.historyIndex++;
        const state = this._cloneState(this.history[this.historyIndex]);
        Logger.log(`↷ Redo (${this.historyIndex + 1}/${this.history.length})`);
        return state;
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.historyIndex > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Get current history position info
     * @returns {Object} History info
     */
    getHistoryInfo() {
        return {
            current: this.historyIndex + 1,
            total: this.history.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
        Logger.log('🗑️ History cleared');
    }

    /**
     * Clone state object efficiently
     * Uses structuredClone if available, falls back to JSON method
     * @private
     * @param {Object} state - State to clone
     * @returns {Object} Cloned state
     */
    _cloneState(state) {
        // Use structuredClone if available (modern browsers)
        if (typeof structuredClone !== 'undefined') {
            try {
                return structuredClone(state);
            } catch (error) {
                Logger.warn('structuredClone failed, falling back to JSON method:', error);
            }
        }

        // Fallback to JSON method (slower but compatible)
        return JSON.parse(JSON.stringify(state));
    }

    /**
     * Get memory usage estimate (approximate)
     * @returns {Object} Memory usage info
     */
    getMemoryUsage() {
        const estimatedSize = JSON.stringify(this.history).length;
        const avgStateSize = this.history.length > 0 ? estimatedSize / this.history.length : 0;

        return {
            totalStates: this.history.length,
            estimatedBytes: estimatedSize,
            estimatedKB: (estimatedSize / 1024).toFixed(2),
            avgStateSizeKB: (avgStateSize / 1024).toFixed(2)
        };
    }
}

export default StateManager;
