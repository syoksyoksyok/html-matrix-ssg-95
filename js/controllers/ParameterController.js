import { Logger } from '../utils/logger.js';
import { CONSTANTS } from '../config/constants.js';

/**
 * ParameterController
 * Manages all parameter operations (randomize, reset, lock/unlock, preset application)
 */
export class ParameterController {
    constructor(config, domCache, resourceManager, knobDragStates, knobLockStates, callbacks) {
        this.config = config;
        this.domCache = domCache;
        this.resourceManager = resourceManager;
        this.knobDragStates = knobDragStates;
        this.knobLockStates = knobLockStates;
        this.callbacks = callbacks; // { updateKnobDisplay, saveCurrentState }
    }

    /**
     * Toggle lock state for all instances of a parameter across slots
     */
    toggleParameterLock(paramId) {
        const spec = this.config.PER_SLOT_CONTROL_SPECS.find(s => s.id === paramId);
        if (!spec) return;

        // Check current lock states across all slots
        const elementIds = [];
        let lockedCount = 0;

        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            const elementId = `${paramId}-slot${slot}`;
            elementIds.push(elementId);
            if (this.isKnobLocked(elementId)) {
                lockedCount++;
            }
        }

        // If all locked, unlock; otherwise lock all
        const shouldLock = lockedCount < this.config.SLOTS;
        let changedCount = 0;

        elementIds.forEach(elementId => {
            const currentLockState = this.isKnobLocked(elementId);
            if (currentLockState !== shouldLock) {
                this.setKnobLocked(elementId, shouldLock);
                changedCount++;
            }
        });

        // Update button display
        const button = this.domCache.querySelector(`[data-param="${paramId}"].param-lock-btn`);
        if (button) {
            if (shouldLock) {
                button.classList.add('locked');
            } else {
                button.classList.remove('locked');
            }

            // Visual feedback
            button.classList.add('flash');
            this.resourceManager.setTimeout(() => {
                button.classList.remove('flash');
            }, 300);
        }

        const action = shouldLock ? 'locked' : 'unlocked';
        Logger.log(`🔒 ${spec.label} ${action} for ${changedCount}/${this.config.SLOTS} slots`);

        // Save state only if changes occurred
        if (changedCount > 0) {
            this.callbacks.saveCurrentState();
        }
    }

    /**
     * Reset a parameter to its default value across all unlocked slots
     */
    resetParameter(paramId) {
        const spec = this.config.PER_SLOT_CONTROL_SPECS.find(s => s.id === paramId);
        if (!spec) return;

        let resetCount = 0;
        let lockedCount = 0;

        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            const elementId = `${paramId}-slot${slot}`;

            if (this.isKnobLocked(elementId)) {
                lockedCount++;
                continue;
            }

            // Reset to default value
            const defaultValue = spec.value;

            if (this.knobDragStates[elementId]) {
                this.knobDragStates[elementId].currentValue = defaultValue;
            }

            this.callbacks.updateKnobDisplay(elementId, spec, defaultValue);
            resetCount++;
        }

        // Visual feedback
        const buttons = this.domCache.querySelectorAll(`[data-param="${paramId}"].param-reset-btn`);
        buttons.forEach(button => {
            button.classList.add('flash');
            this.resourceManager.setTimeout(() => {
                button.classList.remove('flash');
            }, 300);
        });

        Logger.log(`🔄 ${spec.label} reset to default (${spec.value}) for ${resetCount}/${this.config.SLOTS} slots${lockedCount > 0 ? ` (${lockedCount} locked)` : ''}`);
        this.callbacks.saveCurrentState();
    }

    /**
     * Randomize a parameter across all unlocked slots
     */
    randomizeParameter(paramId) {
        const spec = this.config.PER_SLOT_CONTROL_SPECS.find(s => s.id === paramId);
        if (!spec) return;

        let randomizedCount = 0;
        let lockedCount = 0;

        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            const elementId = `${paramId}-slot${slot}`;

            if (this.isKnobLocked(elementId)) {
                lockedCount++;
                continue;
            }

            let randomValue;
            if (spec.id === 'volume') {
                // Volume has special randomization range
                randomValue = Math.random() * (CONSTANTS.VOLUME_RANDOM_MAX - CONSTANTS.VOLUME_RANDOM_MIN) + CONSTANTS.VOLUME_RANDOM_MIN;
            } else if (spec.id === 'envelopeShape' || spec.id === 'lfoWaveform') {
                // Integer parameters
                randomValue = Math.floor(Math.random() * (spec.max - spec.min + 1)) + spec.min;
            } else {
                // Normal parameters
                randomValue = Math.random() * (spec.max - spec.min) + spec.min;
                if (spec.step) {
                    randomValue = Math.round(randomValue / spec.step) * spec.step;
                }
            }

            if (this.knobDragStates[elementId]) {
                this.knobDragStates[elementId].currentValue = randomValue;
            }

            this.callbacks.updateKnobDisplay(elementId, spec, randomValue);
            randomizedCount++;
        }

        // Visual feedback
        const buttons = this.domCache.querySelectorAll(`[data-param="${paramId}"]`);
        buttons.forEach(button => {
            button.classList.add('flash');
            this.resourceManager.setTimeout(() => {
                button.classList.remove('flash');
            }, 300);
        });

        Logger.log(`🎲 ${spec.label} randomized for ${randomizedCount}/${this.config.SLOTS} slots${lockedCount > 0 ? ` (${lockedCount} locked)` : ''}`);
        this.callbacks.saveCurrentState();
    }

    /**
     * Bind knob interaction events (drag, double-click, right-click lock)
     */
    bindKnobEvents(elementId, spec, slotIndex) {
        const knobElement = this.domCache.getElementById(`${elementId}Knob`, true);
        if (!knobElement) return;

        this.knobDragStates[elementId] = {
            isDragging: false,
            startY: 0,
            startValue: spec.value,
            currentValue: spec.value,
            lastTapTime: 0
        };

        const valueRange = spec.max - spec.min;
        const baseSensitivity = CONSTANTS.KNOB_BASE_SENSITIVITY;
        const baseRange = CONSTANTS.KNOB_BASE_RANGE;
        const normalizedSensitivity = baseSensitivity * (valueRange / baseRange);

        // Event handlers stored for cleanup
        let mouseMoveHandler = null;
        let mouseUpHandler = null;
        let touchMoveHandler = null;
        let touchEndHandler = null;
        let touchCancelHandler = null;

        const onDragStart = (clientY) => {
            this.knobDragStates[elementId].isDragging = true;
            knobElement.style.cursor = 'ns-resize';
            this.knobDragStates[elementId].startY = clientY;
            this.knobDragStates[elementId].startValue = this.knobDragStates[elementId].currentValue;

            // Add global event listeners only during drag
            mouseMoveHandler = (e) => onDragMove(e.clientY);
            mouseUpHandler = () => onDragEnd();
            touchMoveHandler = (e) => {
                onDragMove(e.touches[0].clientY);
                e.preventDefault();
            };
            touchEndHandler = () => onDragEnd();
            touchCancelHandler = () => onDragEnd();

            this.resourceManager.addEventListener(document, 'mousemove', mouseMoveHandler);
            this.resourceManager.addEventListener(document, 'mouseup', mouseUpHandler);
            this.resourceManager.addEventListener(document, 'touchmove', touchMoveHandler, { passive: false });
            this.resourceManager.addEventListener(document, 'touchend', touchEndHandler);
            this.resourceManager.addEventListener(document, 'touchcancel', touchCancelHandler);

            return true;
        };

        const onDragMove = (clientY) => {
            const dragState = this.knobDragStates[elementId];
            if (!dragState.isDragging) return;

            const deltaY = dragState.startY - clientY;
            let newValue = dragState.startValue + (deltaY * normalizedSensitivity);

            newValue = Math.max(spec.min, Math.min(spec.max, newValue));

            if (spec.step) {
                newValue = Math.round(newValue / spec.step) * spec.step;
            }

            dragState.currentValue = newValue;
            this.callbacks.updateKnobDisplay(elementId, spec, newValue);

            // Real-time sequencer update for SEQ PROB knob
            if (elementId === 'randomDensity' && this.callbacks.randomizeSequencer) {
                Logger.debug(`SEQ PROB knob dragged to: ${newValue}`);
                this.callbacks.randomizeSequencer();
            }
        };

        const onDragEnd = () => {
            const dragState = this.knobDragStates[elementId];
            if (dragState.isDragging) {
                dragState.isDragging = false;
                knobElement.style.cursor = 'grab';
                this.callbacks.saveCurrentState();

                // Remove global event listeners after drag
                if (mouseMoveHandler) {
                    this.resourceManager.removeEventListener(document, 'mousemove', mouseMoveHandler);
                    this.resourceManager.removeEventListener(document, 'mouseup', mouseUpHandler);
                    this.resourceManager.removeEventListener(document, 'touchmove', touchMoveHandler);
                    this.resourceManager.removeEventListener(document, 'touchend', touchEndHandler);
                    this.resourceManager.removeEventListener(document, 'touchcancel', touchCancelHandler);
                    mouseMoveHandler = null;
                    mouseUpHandler = null;
                    touchMoveHandler = null;
                    touchEndHandler = null;
                    touchCancelHandler = null;
                }
            }
        };

        const onDoubleAction = () => {
            const dragState = this.knobDragStates[elementId];
            dragState.currentValue = spec.value;
            this.callbacks.updateKnobDisplay(elementId, spec, spec.value);
            this.callbacks.saveCurrentState();

            knobElement.style.transition = 'transform 0.1s ease';
            knobElement.style.transform = `scale(${CONSTANTS.KNOB_SCALE_FACTOR})`;
            this.resourceManager.setTimeout(() => {
                knobElement.style.transform = 'scale(1)';
                this.resourceManager.setTimeout(() => {
                    knobElement.style.transition = '';
                }, CONSTANTS.KNOB_SCALE_DURATION_MS);
            }, CONSTANTS.KNOB_SCALE_DURATION_MS);
        };

        const onRightClick = (e) => {
            e.preventDefault();
            const isCurrentlyLocked = this.isKnobLocked(elementId);
            this.setKnobLocked(elementId, !isCurrentlyLocked);
        };

        this.resourceManager.addEventListener(knobElement, 'mousedown', e => {
            if (e.button === 0) {
                onDragStart(e.clientY);
                e.preventDefault();
            }
        });

        this.resourceManager.addEventListener(knobElement, 'contextmenu', onRightClick);

        this.resourceManager.addEventListener(knobElement, 'dblclick', e => {
            e.preventDefault();
            onDoubleAction();
        });

        this.resourceManager.addEventListener(knobElement, 'touchstart', e => {
            const currentTime = Date.now();
            const dragState = this.knobDragStates[elementId];

            if (currentTime - dragState.lastTapTime < CONSTANTS.DOUBLE_TAP_THRESHOLD_MS) {
                e.preventDefault();
                onDoubleAction();
                dragState.lastTapTime = 0;
                return;
            }

            dragState.lastTapTime = currentTime;
            onDragStart(e.touches[0].clientY);
            e.preventDefault();
        }, { passive: false });

        if (this.isKnobLocked(elementId)) {
            knobElement.classList.add('locked');
        }
        knobElement.style.cursor = 'grab';
    }

    /**
     * Get current value of a knob
     */
    getKnobValue(elementId) {
        const dragState = this.knobDragStates[elementId];
        return dragState ? dragState.currentValue : 0;
    }

    /**
     * Set lock state for a specific knob
     */
    setKnobLocked(elementId, isLocked) {
        const knobElement = this.domCache.getElementById(`${elementId}Knob`, true);
        if (!knobElement) return;

        this.knobLockStates[elementId] = isLocked;

        if (isLocked) {
            knobElement.classList.add('locked');
        } else {
            knobElement.classList.remove('locked');
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Check if a knob is locked
     */
    isKnobLocked(elementId) {
        return this.knobLockStates[elementId] || false;
    }

    /**
     * Unlock all knobs across all slots and global controls
     */
    unlockAllKnobs() {
        let unlockedCount = 0;

        // Unlock per-slot knobs
        for (let s = 0; s < this.config.SLOTS; s++) {
            this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                const elementId = `${spec.id}-slot${s}`;
                if (this.isKnobLocked(elementId)) {
                    this.setKnobLocked(elementId, false);
                    unlockedCount++;
                }
            });
        }

        // Unlock global knobs
        const globalKnobs = ['bpm', 'randomDensity'];
        globalKnobs.forEach(knobId => {
            if (this.isKnobLocked(knobId)) {
                this.setKnobLocked(knobId, false);
                unlockedCount++;
            }
        });

        if (unlockedCount > 0) {
            Logger.log(`🔓 Unlocked ${unlockedCount} knobs`);
        } else {
            Logger.log('All knobs already unlocked');
        }
    }

    /**
     * Clear pan values for all unlocked slots
     */
    clearPan() {
        let clearedCount = 0;
        let lockedCount = 0;

        for (let s = 0; s < this.config.SLOTS; s++) {
            const panElementId = `panControl-slot${s}`;
            const panRandomElementId = `panRandom-slot${s}`;

            if (!this.isKnobLocked(panElementId)) {
                if (this.knobDragStates[panElementId]) {
                    this.knobDragStates[panElementId].currentValue = 0;
                }

                const panSpec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'panControl');
                if (panSpec) {
                    this.callbacks.updateKnobDisplay(panElementId, panSpec, 0);
                    clearedCount++;
                }
            } else {
                lockedCount++;
            }

            if (!this.isKnobLocked(panRandomElementId)) {
                if (this.knobDragStates[panRandomElementId]) {
                    this.knobDragStates[panRandomElementId].currentValue = 0;
                }

                const panRandomSpec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'panRandom');
                if (panRandomSpec) {
                    this.callbacks.updateKnobDisplay(panRandomElementId, panRandomSpec, 0);
                    clearedCount++;
                }
            } else {
                lockedCount++;
            }
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Set HPF frequency for all unlocked slots
     */
    setHpf(frequency) {
        let setCount = 0;
        let lockedCount = 0;

        for (let s = 0; s < this.config.SLOTS; s++) {
            const elementId = `cutoffFreq-slot${s}`;
            const spec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'cutoffFreq');

            if (spec) {
                if (this.isKnobLocked(elementId)) {
                    lockedCount++;
                    continue;
                }

                const valueToSet = Math.max(spec.min, Math.min(spec.max, frequency));

                if (this.knobDragStates[elementId]) {
                    this.knobDragStates[elementId].currentValue = valueToSet;
                }

                this.callbacks.updateKnobDisplay(elementId, spec, valueToSet);
                setCount++;
            }
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Set attack time for all unlocked slots
     */
    setAttackTime(attackTime) {
        let setCount = 0;
        let lockedCount = 0;

        for (let s = 0; s < this.config.SLOTS; s++) {
            const elementId = `attackTime-slot${s}`;
            const spec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'attackTime');

            if (spec) {
                if (this.isKnobLocked(elementId)) {
                    lockedCount++;
                    continue;
                }

                if (this.knobDragStates[elementId]) {
                    this.knobDragStates[elementId].currentValue = attackTime;
                }

                this.callbacks.updateKnobDisplay(elementId, spec, attackTime);
                setCount++;
            }
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Apply percussive preset to all unlocked slots
     */
    setPercussivePreset() {
        const presetValues = {
            'startOffset': 0,
            'attackTime': 3,
            'envelopeShape': 1,
            'lfoRate': 5.0,
            'lfoWaveform': 3,
            'decayTime': 450,
            'panControl': 0,
            'panRandom': 0.02,
            'spread': 25
        };

        let setCount = 0;
        let lockedCount = 0;

        for (let s = 0; s < this.config.SLOTS; s++) {
            Object.entries(presetValues).forEach(([paramId, value]) => {
                const elementId = `${paramId}-slot${s}`;
                const spec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === paramId);

                if (spec) {
                    if (this.isKnobLocked(elementId)) {
                        lockedCount++;
                        return;
                    }

                    const clampedValue = Math.max(spec.min, Math.min(spec.max, value));

                    if (this.knobDragStates[elementId]) {
                        this.knobDragStates[elementId].currentValue = clampedValue;
                    }

                    this.callbacks.updateKnobDisplay(elementId, spec, clampedValue);
                    setCount++;
                }
            });
        }

        this.callbacks.saveCurrentState();
    }
}
