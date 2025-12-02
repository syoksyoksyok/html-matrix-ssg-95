/**
 * Sequencer Controller
 * Manages sequencer patterns, step selection, and randomization
 * Includes debounced update functionality to prevent excessive DOM manipulation
 */

import { Logger } from '../utils/logger.js';
import { debounce } from '../utils/mathUtils.js';
import { DOMCache } from '../utils/DOMCache.js';

export class SequencerController {
    constructor(config, domCache = null) {
        this.config = config;
        this.domCache = domCache || new DOMCache();

        // Sequencer state
        this.patterns = Array.from(
            { length: this.config.SLOTS },
            () => Array(this.config.SEQUENCER_STEPS).fill(true)
        );

        this.currentStep = 0;
        this.selectedStep = 0;
        this.selectedSlot = 0;
        this.multiSelectStart = -1;
        this.multiSelectEnd = -1;
        this.isMultiSelecting = false;

        // Debounced randomize function to prevent excessive updates
        this.debouncedRandomizeSequencer = debounce(
            this._randomizeSequencerImmediate.bind(this),
            100 // 100ms debounce
        );
    }

    /**
     * Initialize patterns from existing state
     * @param {Array} patterns - Existing patterns
     */
    initializePatterns(patterns) {
        if (patterns && patterns.length === this.config.SLOTS) {
            this.patterns = patterns.map(p => [...p]);
        }
    }

    /**
     * Get current patterns
     * @returns {Array} Current sequencer patterns
     */
    getPatterns() {
        return this.patterns.map(p => [...p]);
    }

    /**
     * Toggle step on/off
     * @param {number} slot - Slot index
     * @param {number} step - Step index
     * @returns {boolean} New state
     */
    toggleStep(slot, step) {
        if (slot < 0 || slot >= this.config.SLOTS || step < 0 || step >= this.config.SEQUENCER_STEPS) {
            Logger.warn(`Invalid step toggle: slot ${slot}, step ${step}`);
            return false;
        }

        this.patterns[slot][step] = !this.patterns[slot][step];
        this._updateStepDOM(slot, step);

        return this.patterns[slot][step];
    }

    /**
     * Set step state
     * @param {number} slot - Slot index
     * @param {number} step - Step index
     * @param {boolean} isActive - Active state
     */
    setStep(slot, step, isActive) {
        if (slot < 0 || slot >= this.config.SLOTS || step < 0 || step >= this.config.SEQUENCER_STEPS) {
            return;
        }

        this.patterns[slot][step] = isActive;
        this._updateStepDOM(slot, step);
    }

    /**
     * Get step state
     * @param {number} slot - Slot index
     * @param {number} step - Step index
     * @returns {boolean} Step active state
     */
    getStep(slot, step) {
        if (slot < 0 || slot >= this.config.SLOTS || step < 0 || step >= this.config.SEQUENCER_STEPS) {
            return false;
        }
        return this.patterns[slot][step];
    }

    /**
     * Set current playing step
     * @param {number} step - Step index
     */
    setCurrentStep(step) {
        const oldStep = this.currentStep;
        this.currentStep = step;

        // Update DOM to show current step
        this._updateCurrentStepDOM(oldStep, step);
    }

    /**
     * Randomize sequencer with debounce (for knob drag)
     * @param {number} density - Density value (0-100)
     */
    randomizeSequencer(density) {
        this.debouncedRandomizeSequencer(density);
    }

    /**
     * Randomize sequencer immediately (internal)
     * @private
     * @param {number} density - Density value (0-100)
     */
    _randomizeSequencerImmediate(density) {
        const threshold = density / 100;
        let generatedSteps = 0;

        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            for (let step = 0; step < this.config.SEQUENCER_STEPS; step++) {
                const on = Math.random() < threshold;
                this.patterns[slot][step] = on;
                this._updateStepDOM(slot, step);
                if (on) generatedSteps++;
            }
        }

        const totalSteps = this.config.SLOTS * this.config.SEQUENCER_STEPS;
        Logger.log(`🎲 ランダムシーケンス生成: ${Math.round(threshold * 100)}% Density → ${generatedSteps}/${totalSteps} ステップON`);
    }

    /**
     * Clear all steps
     */
    clearAll() {
        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            for (let step = 0; step < this.config.SEQUENCER_STEPS; step++) {
                this.patterns[slot][step] = false;
                this._updateStepDOM(slot, step);
            }
        }
        Logger.log('🗑️ Sequencer cleared');
    }

    /**
     * Fill all steps
     */
    fillAll() {
        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            for (let step = 0; step < this.config.SEQUENCER_STEPS; step++) {
                this.patterns[slot][step] = true;
                this._updateStepDOM(slot, step);
            }
        }
        Logger.log('✅ Sequencer filled');
    }

    /**
     * Set selected step
     * @param {number} step - Step index
     * @param {number} slot - Slot index (optional)
     */
    setSelectedStep(step, slot = null) {
        this.selectedStep = step;
        if (slot !== null) {
            this.selectedSlot = slot;
        }
        this._updateSelectionDOM();
    }

    /**
     * Update step DOM element
     * @private
     * @param {number} slot - Slot index
     * @param {number} step - Step index
     */
    _updateStepDOM(slot, step) {
        const stepElement = this.domCache.querySelector(
            `.step[data-slot='${slot}'][data-step='${step}']`,
            true // refresh cache
        );

        if (stepElement) {
            stepElement.classList.toggle('active', this.patterns[slot][step]);
        }
    }

    /**
     * Update current step indicator in DOM
     * @private
     * @param {number} oldStep - Previous step
     * @param {number} newStep - New current step
     */
    _updateCurrentStepDOM(oldStep, newStep) {
        // Remove 'current' class from old step
        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            const oldElement = this.domCache.querySelector(
                `.step[data-slot='${slot}'][data-step='${oldStep}']`,
                true
            );
            if (oldElement) {
                oldElement.classList.remove('current');
            }
        }

        // Add 'current' class to new step
        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            const newElement = this.domCache.querySelector(
                `.step[data-slot='${slot}'][data-step='${newStep}']`,
                true
            );
            if (newElement) {
                newElement.classList.add('current');
            }
        }
    }

    /**
     * Update selection display in DOM
     * @private
     */
    _updateSelectionDOM() {
        // Clear all selections
        const allSteps = this.domCache.querySelectorAll('.step.selected', true);
        allSteps.forEach(el => el.classList.remove('selected'));

        // Set new selection
        const selectedElement = this.domCache.querySelector(
            `.step[data-slot='${this.selectedSlot}'][data-step='${this.selectedStep}']`,
            true
        );
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
    }

    /**
     * Get statistics about sequencer state
     * @returns {Object} Sequencer statistics
     */
    getStats() {
        let totalActive = 0;
        const slotStats = [];

        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            let slotActive = 0;
            for (let step = 0; step < this.config.SEQUENCER_STEPS; step++) {
                if (this.patterns[slot][step]) {
                    slotActive++;
                    totalActive++;
                }
            }
            slotStats.push({
                slot,
                activeSteps: slotActive,
                density: (slotActive / this.config.SEQUENCER_STEPS * 100).toFixed(1) + '%'
            });
        }

        const totalSteps = this.config.SLOTS * this.config.SEQUENCER_STEPS;

        return {
            totalSteps,
            totalActive,
            totalInactive: totalSteps - totalActive,
            overallDensity: (totalActive / totalSteps * 100).toFixed(1) + '%',
            slotStats
        };
    }

    /**
     * Destroy controller and clean up
     */
    destroy() {
        this.patterns = null;
        this.domCache.clear();
    }
}

export default SequencerController;
