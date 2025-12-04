import { Logger } from '../utils/logger.js';

/**
 * KeyboardController
 * Handles all keyboard shortcuts and key-based interactions
 */
export class KeyboardController {
    constructor(config, domCache, resourceManager, state, callbacks) {
        this.config = config;
        this.domCache = domCache;
        this.resourceManager = resourceManager;
        this.state = state;
        this.callbacks = callbacks;

        // Key state tracking
        this.state.isMKeyPressed = false;
        this.state.isOKeyPressed = false;
    }

    /**
     * Bind all keyboard shortcuts
     */
    bindKeyboardShortcuts() {
        this.resourceManager.addEventListener(document, 'keydown', (e) => {
            // Skip if user is typing in an input field
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT' ||
                activeElement.contentEditable === 'true'
            )) {
                return;
            }

            // Track M and O key states for combo shortcuts
            if (e.code === 'KeyM') {
                this.state.isMKeyPressed = true;
            }

            if (e.code === 'KeyO') {
                this.state.isOKeyPressed = true;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this._handleSpaceKey();
                    break;

                case 'Escape':
                    e.preventDefault();
                    this._handleEscapeKey();
                    break;

                case 'KeyZ':
                    if (e.ctrlKey && !e.shiftKey) {
                        e.preventDefault();
                        this.callbacks.undo();
                    }
                    break;

                case 'KeyY':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.callbacks.redo();
                    }
                    break;

                case 'KeyL':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.callbacks.loadFolderSamples();
                    }
                    break;

                case 'Digit1':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this._handleSlotShortcut(0, 'solo');
                    } else if (this.state.isMKeyPressed && this.state.isOKeyPressed) {
                        e.preventDefault();
                        this._handleModeShortcut(0); // Fixed (Slot 1)
                    } else if (this.state.isMKeyPressed) {
                        e.preventDefault();
                        this._handleSlotShortcut(0, 'mute'); // Mute (Slot 1)
                    }
                    break;

                case 'Digit2':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this._handleSlotShortcut(1, 'solo');
                    } else if (this.state.isMKeyPressed && this.state.isOKeyPressed) {
                        e.preventDefault();
                        this._handleModeShortcut(1); // Fixed (Slot 2)
                    } else if (this.state.isMKeyPressed) {
                        e.preventDefault();
                        this._handleSlotShortcut(1, 'mute'); // Mute (Slot 2)
                    }
                    break;

                case 'Digit3':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this._handleSlotShortcut(2, 'solo');
                    } else if (this.state.isMKeyPressed && this.state.isOKeyPressed) {
                        e.preventDefault();
                        this._handleModeShortcut(2); // Fixed (Slot 3)
                    } else if (this.state.isMKeyPressed) {
                        e.preventDefault();
                        this._handleSlotShortcut(2, 'mute'); // Mute (Slot 3)
                    }
                    break;

                case 'Digit4':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this._handleSlotShortcut(3, 'solo');
                    } else if (this.state.isMKeyPressed && this.state.isOKeyPressed) {
                        e.preventDefault();
                        this._handleModeShortcut(3); // Fixed (Slot 4)
                    } else if (this.state.isMKeyPressed) {
                        e.preventDefault();
                        this._handleSlotShortcut(3, 'mute'); // Mute (Slot 4)
                    }
                    break;

                case 'KeyA':
                    if (this.state.isMKeyPressed && this.state.isOKeyPressed) {
                        e.preventDefault();
                        this._handleModeShortcut(4); // All
                    }
                    break;

                case 'KeyR':
                    if (this.state.isMKeyPressed && this.state.isOKeyPressed) {
                        e.preventDefault();
                        this._handleModeShortcut(5); // Random
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    this._handleSequencerNavigation('left', e.shiftKey);
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    this._handleSequencerNavigation('right', e.shiftKey);
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    this._handleSequencerNavigation('up', e.shiftKey);
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    this._handleSequencerNavigation('down', e.shiftKey);
                    break;

                case 'Enter':
                    e.preventDefault();
                    this._handleSequencerToggle();
                    break;

                case 'Delete':
                    e.preventDefault();
                    this._handleSequencerDelete();
                    break;
            }
        });

        this.resourceManager.addEventListener(document, 'keyup', (e) => {
            if (e.code === 'KeyM') {
                this.state.isMKeyPressed = false;
            }
            if (e.code === 'KeyO') {
                this.state.isOKeyPressed = false;
            }
        });
    }

    /**
     * Handle mode selection shortcuts (M+O+1-4, M+O+A, M+O+R)
     */
    _handleModeShortcut(modeValue) {
        const slotModeSelect = this.domCache.getElementById('slotMode');
        if (slotModeSelect) {
            slotModeSelect.value = modeValue;

            // Visual feedback
            const modePanel = this.domCache.getElementById('mode-section');
            if (modePanel) {
                modePanel.style.transition = 'transform 0.1s ease';
                modePanel.style.transform = 'scale(1.02)';
                this.resourceManager.setTimeout(() => {
                    modePanel.style.transform = 'scale(1)';
                    this.resourceManager.setTimeout(() => {
                        modePanel.style.transition = '';
                    }, 100);
                }, 100);
            }

            // Console feedback
            const modeNames = [
                'Fixed (Slot 1)', 'Fixed (Slot 2)', 'Fixed (Slot 3)',
                'Fixed (Slot 4)', 'All', 'Random'
            ];
            Logger.log(`🎛️ Mode changed to: ${modeNames[modeValue]}`);

            this.callbacks.saveCurrentState();
        }
    }

    /**
     * Handle Space key (start/stop playback)
     */
    _handleSpaceKey() {
        if (this.state.isPlaying) {
            this.callbacks.stopGranularPlayback();
        } else {
            this.callbacks.startGranularPlayback();
        }
    }

    /**
     * Handle Escape key (stop all, clear multi-select)
     */
    _handleEscapeKey() {
        if (this.state.isMultiSelecting) {
            this._clearMultiSelect();
            this._updateSequencerSelection();
            return;
        }

        this.callbacks.stopGranularPlayback();
        this.callbacks.stopAllGrains();

        // Stop all preview sources
        for (let s = 0; s < this.config.SLOTS; s++) {
            if (this.state.previewSources[s]) {
                this.state.previewSources[s].stop();
                this.state.previewSources[s].disconnect();
                this.state.previewSources[s] = null;
            }
        }
    }

    /**
     * Handle slot shortcuts (Shift+1-4 for solo, M+1-4 for mute)
     */
    _handleSlotShortcut(slot, type) {
        switch (type) {
            case 'solo':
                if (this.state.slotSoloStatus[slot]) {
                    this.state.slotSoloStatus[slot] = false;
                } else {
                    for (let i = 0; i < this.config.SLOTS; i++) {
                        this.state.slotSoloStatus[i] = false;
                    }
                    this.state.slotSoloStatus[slot] = true;
                    this.state.slotMuteStatus[slot] = false;
                }
                this.callbacks.updateAllSlotControlButtons();
                break;

            case 'mute':
                this.state.slotMuteStatus[slot] = !this.state.slotMuteStatus[slot];
                if (this.state.slotMuteStatus[slot]) {
                    this.state.slotSoloStatus[slot] = false;
                }
                this.callbacks.updateSlotControlButtons(slot);
                break;
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Handle sequencer navigation (arrow keys)
     */
    _handleSequencerNavigation(direction, isShiftPressed) {
        const maxStep = this.config.SEQUENCER_STEPS - 1;
        const maxSlot = this.config.SLOTS - 1;

        switch (direction) {
            case 'left':
                if (isShiftPressed) {
                    this._handleMultiSelect('left');
                } else {
                    this._clearMultiSelect();
                    this.state.selectedStep = Math.max(0, this.state.selectedStep - 1);
                }
                break;

            case 'right':
                if (isShiftPressed) {
                    this._handleMultiSelect('right');
                } else {
                    this._clearMultiSelect();
                    this.state.selectedStep = Math.min(maxStep, this.state.selectedStep + 1);
                }
                break;

            case 'up':
                this._clearMultiSelect();
                this.state.selectedSlot = Math.max(0, this.state.selectedSlot - 1);
                break;

            case 'down':
                this._clearMultiSelect();
                this.state.selectedSlot = Math.min(maxSlot, this.state.selectedSlot + 1);
                break;
        }

        this._updateSequencerSelection();
    }

    /**
     * Handle multi-select with Shift+Arrow keys
     */
    _handleMultiSelect(direction) {
        if (!this.state.isMultiSelecting) {
            this.state.isMultiSelecting = true;
            this.state.multiSelectStart = this.state.selectedStep;
            this.state.multiSelectEnd = this.state.selectedStep;
        }

        if (direction === 'left' && this.state.multiSelectEnd > 0) {
            this.state.multiSelectEnd--;
        } else if (direction === 'right' && this.state.multiSelectEnd < this.config.SEQUENCER_STEPS - 1) {
            this.state.multiSelectEnd++;
        }

        this.state.selectedStep = this.state.multiSelectEnd;
    }

    /**
     * Clear multi-select state
     */
    _clearMultiSelect() {
        this.state.isMultiSelecting = false;
        this.state.multiSelectStart = -1;
        this.state.multiSelectEnd = -1;
    }

    /**
     * Handle sequencer toggle (Enter key)
     */
    _handleSequencerToggle() {
        if (this.state.isMultiSelecting) {
            const start = Math.min(this.state.multiSelectStart, this.state.multiSelectEnd);
            const end = Math.max(this.state.multiSelectStart, this.state.multiSelectEnd);

            for (let step = start; step <= end; step++) {
                this.callbacks.toggleSequencerStep(this.state.selectedSlot, step);
            }
        } else {
            this.callbacks.toggleSequencerStep(this.state.selectedSlot, this.state.selectedStep);
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Handle sequencer delete (Delete key)
     */
    _handleSequencerDelete() {
        if (this.state.isMultiSelecting) {
            const start = Math.min(this.state.multiSelectStart, this.state.multiSelectEnd);
            const end = Math.max(this.state.multiSelectStart, this.state.multiSelectEnd);

            for (let step = start; step <= end; step++) {
                this.callbacks.setSequencerStep(this.state.selectedSlot, step, false);
            }
        } else {
            this.callbacks.setSequencerStep(this.state.selectedSlot, this.state.selectedStep, false);
        }

        this.callbacks.saveCurrentState();
    }

    /**
     * Update sequencer selection visual feedback
     */
    _updateSequencerSelection() {
        this.domCache.querySelectorAll('.step.selected, .step.multi-selected', true).forEach(element => {
            element.classList.remove('selected', 'multi-selected');
        });

        if (this.state.isMultiSelecting) {
            const start = Math.min(this.state.multiSelectStart, this.state.multiSelectEnd);
            const end = Math.max(this.state.multiSelectStart, this.state.multiSelectEnd);

            for (let step = start; step <= end; step++) {
                const stepElement = this.domCache.querySelector(
                    `.step[data-slot='${this.state.selectedSlot}'][data-step='${step}']`
                );
                if (stepElement) {
                    stepElement.classList.add('multi-selected');
                }
            }
        } else {
            const selectedElement = this.domCache.querySelector(
                `.step[data-slot='${this.state.selectedSlot}'][data-step='${this.state.selectedStep}']`
            );
            if (selectedElement) {
                selectedElement.classList.add('selected');
            }
        }
    }
}
