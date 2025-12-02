// Import dependencies
import { ResourceManager } from './utils/resourceManager.js';
import { Logger } from './utils/logger.js';
import { WinAMPSpectrumAnalyzer } from './audio/WinAMPSpectrumAnalyzer.js';
import { OptimizedGrainVoiceManager } from './audio/OptimizedGrainVoiceManager.js';
import { PerformanceMonitor } from './ui/PerformanceMonitor.js';
import { OptimizedWaveformRenderer } from './ui/OptimizedWaveformRenderer.js';
import { UIBuilder } from './ui/UIBuilder.js';
import { deepClone } from './utils/cloneUtils.js';
import { loadAudioFile, validateAudioFile, trimSilence } from './utils/audioFileUtils.js';
import { generateRandomValue } from './utils/mathUtils.js';
import { calculateNormalizedSensitivity } from './utils/knobUtils.js';
import { DOMCache } from './utils/DOMCache.js';
import { StateManager } from './utils/StateManager.js';
import { SequencerController } from './controllers/SequencerController.js';
import { LayoutManager } from './controllers/LayoutManager.js';

// Constants
const CONSTANTS = {
    // UI Constants
    DOUBLE_TAP_THRESHOLD_MS: 300,
    KNOB_FLASH_DURATION_MS: 300,
    KNOB_SCALE_DURATION_MS: 100,
    SPECTRUM_UPDATE_INTERVAL_MS: 100,
    SEQUENCER_SELECTION_DELAY_MS: 100,
    SPECTRUM_ANALYZER_INIT_DELAY_MS: 100,
    AUTO_ARRANGE_TRANSITION_MS: 300,
    
    // Knob Settings
    KNOB_BASE_SENSITIVITY: 0.5,
    KNOB_BASE_RANGE: 100,
    KNOB_SCALE_FACTOR: 1.1,
    
    // Volume Range for Randomization
    VOLUME_RANDOM_MIN: 0.3,
    VOLUME_RANDOM_MAX: 0.8,
    
    // Layout Constants
    LAYOUT_MARGIN: 20,
    LAYOUT_HEADER_HEIGHT: 120,
    LAYOUT_SEARCH_RADIUS: 80,
    LAYOUT_SEARCH_STEP: 15,
    LAYOUT_OVERLAP_BUFFER: 15,
    LAYOUT_MIN_PANEL_WIDTH: 200,
    LAYOUT_MIN_PANEL_HEIGHT: 150,
    LAYOUT_MAX_WIDTH: 1000,
    LAYOUT_MAX_HEIGHT: 1000,
    LAYOUT_FALLBACK_OFFSET: 50,
    LAYOUT_DEFAULT_WIDTH: 300,
    LAYOUT_CTRL_SECTION_WIDTH: 1200,
    LAYOUT_MAIN_SECTION_WIDTH: 580,
    LAYOUT_OUTPUT_SECTION_WIDTH: 600,
    
    // LED Meter Constants
    LED_PEAK_HOLD_DURATION_MS: 1000,
    LED_FADE_FACTOR: 0.92,
    LED_MIN_THRESHOLD: 0.01,
    LED_PEAK_MIN_THRESHOLD: 0.05,
    LED_GREEN_THRESHOLD: 0.67,
    LED_YELLOW_THRESHOLD: 0.83,
    LED_ORANGE_THRESHOLD: 0.93,
    LED_SEGMENT_COUNT: 30,
    
    // Scale Constants
    SCALE_PEAK_HOLD_DECAY: 0.95,
    VIEWPORT_EDGE_MARGIN: 40,
    VIEWPORT_MIN_MARGIN: 20,
    VIEWPORT_MIN_HEIGHT_MARGIN: 60,
    MIN_SECTION_SCALE: 0.5,
    MAX_SECTION_SCALE: 1.0,
    
    // Audio Constants
    MAX_VOICE_COUNT: 128,
    DEFAULT_BPM: 120,
    MAX_GRAINS_PER_STEP: 20,
    POSITION_RANDOM_OFFSET: 0.05,

    // File Loading
    CONCURRENT_FILE_LOAD_LIMIT: 4,
};

export class OptimizedMultigrainPlayer {
        constructor() {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.grainVoiceManager = new OptimizedGrainVoiceManager(this.audioContext, CONSTANTS.MAX_VOICE_COUNT);
                this.performanceMonitor = new PerformanceMonitor();
                this.spectrumAnalyzer = null;
                this.resourceManager = new ResourceManager();
                this.domCache = new DOMCache();
                this.stateManager = new StateManager(50); // 50 states max
                this.sequencerController = null; // Initialize after config
                this.layoutManager = null; // Initialize after config
            
            this.config = {
                SLOTS: 4,
                SEQUENCER_STEPS: 16,
                GRANULAR_INTERVAL_DIVISOR: 4,
                WAVEFORM_CANVAS_WIDTH: 250,
                WAVEFORM_CANVAS_HEIGHT: 100,
                MIN_BPM: 40,
                MAX_BPM: 240,
                BPM_SENSITIVITY: 0.5,
                MIN_RANDOM_DENSITY: 0,
                MAX_RANDOM_DENSITY: 100,
                RANDOM_DENSITY_SENSITIVITY: 0.5,
                MAX_HISTORY_STATES: 50,
                PER_SLOT_CONTROL_SPECS: [
                  { label: 'S.Pos (%):', type: 'knob', id: 'startOffset', min: 0, max: 100, value: 0, step: 1 },
                  { label: 'PB Rate:', type: 'knob', id: 'playbackRate', min: 0.1, max: 2.0, step: 0.01, value: 1.0 },
                  { label: 'HPF Freq (Hz):', type: 'knob', id: 'cutoffFreq', min: 0, max: 12000, value: 100, step: 10 },
                  { label: 'Atk Time (ms):', type: 'knob', id: 'attackTime', min: 3, max: 500, value: 3, step: 1 },
                  { label: 'Dec Time (ms):', type: 'knob', id: 'decayTime', min: 5, max: 1000, value: 200, step: 1 },
                  { label: 'Env Shape:', type: 'knob', id: 'envelopeShape', min: 0, max: 7, value: 0, step: 1 },
                  { label: 'G Size (ms):', type: 'knob', id: 'grainSize', min: 10, max: 1000, value: 350, step: 10 },
                  { label: 'G PerStep:', type: 'knob', id: 'grainsPerStep', min: 1, max: 50, value: 10, step: 1 },
                  { label: 'G Voices:', type: 'knob', id: 'grainVoices', min: 1, max: 8, value: 4, step: 1 },
                  { label: 'LFO WF:', type: 'knob', id: 'lfoWaveform', min: 0, max: 3, value: 0, step: 1 },
                  { label: 'LFO Rate (Hz):', type: 'knob', id: 'lfoRate', min: 0.1, max: 5.0, step: 0.01, value: 0.5 },
                  { label: 'Spread:', type: 'knob', id: 'spread', min: 0, max: 100, value: 0, step: 1 },
                  { label: 'Pan:', type: 'knob', id: 'panControl', min: -1, max: 1, step: 0.01, value: 0 },
                  { label: 'Pan Random:', type: 'knob', id: 'panRandom', min: 0, max: 0.5, step: 0.01, value: 0.1 },
                  { label: 'Volume:', type: 'knob', id: 'volume', min: 0, max: 1.0, step: 0.01, value: 0.7 }
                ],
                GLOBAL_CONTROL_SPECS: [
                  {
                    label: 'Slot Mode:', type: 'select', id: 'slotMode',
                    options: ['Fixed (Slot 1)', 'Fixed (Slot 2)', 'Fixed (Slot 3)', 'Fixed (Slot 4)', 'All', 'Random'], selected: 4
                  },
                ],
                RANDOM_DENSITY_SPEC: { label: 'RND SEQ Density:', type: 'knob', id: 'randomDensity', min: 0, max: 100, value: 50, tooltip: 'ランダムシーケンス生成時のステップON確率' },
                BPM_SPEC: { label: 'Tempo (BPM):', type: 'knob', id: 'bpm', min: 40, max: 240, value: 120, tooltip: 'シーケンサーのテンポ速度' },
            };

            this.state = {
                audioBuffers: Array(this.config.SLOTS).fill(null),
                waveformRenderers: [],
                sequencerPatterns: Array.from({ length: this.config.SLOTS }, () => Array(this.config.SEQUENCER_STEPS).fill(true)),
                slotSoloStatus: Array(this.config.SLOTS).fill(false),
                slotMuteStatus: Array(this.config.SLOTS).fill(false),
                previewSources: Array(this.config.SLOTS).fill(null),
                isPlaying: false,
                lfoStartTime: 0,
                currentSequencerStep: 0,
                sequencerIntervalId: null,
                tempoBpm: 120,
                history: [],
                historyIndex: -1,
                knobDragStates: {},
                knobLockStates: {},
                selectedStep: 0,
                selectedSlot: 0,
                multiSelectStart: -1,
                multiSelectEnd: -1,
                isMultiSelecting: false,
                isFreeLayoutMode: true,
                sectionPositions: {},
                isMKeyPressed: false,
                isOKeyPressed: false,
                autoScalingActive: false,
                baseViewportSize: { width: 0, height: 0 }
                // dragState and resizeState are now managed by LayoutManager
            };

            this.ui = {};
            } catch (error) {
                Logger.error('Failed to initialize OptimizedMultigrainPlayer:', error);
                throw error;
            }
        }

        init() {
            try {
                // Initialize controllers
                this.sequencerController = new SequencerController(this.config, this.domCache);
                this.sequencerController.initializePatterns(this.state.sequencerPatterns);

                this.layoutManager = new LayoutManager(this.resourceManager);
                this.layoutManager.setFreeLayoutMode(this.state.isFreeLayoutMode);

                this._createUI();
                this._bindKnobEventsForAllControls();
                this._bindEvents();
                this._updateBpmKnob(this.state.tempoBpm);
                this._updateRandomDensityKnob(this.config.RANDOM_DENSITY_SPEC.value);
                this._updateAllSlotControlButtons();
                this.saveCurrentState();

                this.resourceManager.setTimeout(() => {
                    this._updateSequencerSelection();
                }, CONSTANTS.SEQUENCER_SELECTION_DELAY_MS);

                this.startPerformanceTracking();

                this.resourceManager.addEventListener(window, 'beforeunload', () => {
                    this._stopAutoScaling();
                });

                // Prefetch frequently accessed DOM elements
                this._prefetchDOMElements();

                // Initialize FREE LAYOUT mode if enabled
                if (this.state.isFreeLayoutMode) {
                    const layoutContainer = this.domCache.getElementById('layoutContainer');
                    const layoutToggle = this.domCache.getElementById('layoutToggle');
                    const autoArrangeBtn = this.domCache.getElementById('autoArrangeBtn');

                    if (layoutContainer) layoutContainer.classList.add('free-layout');
                    if (layoutToggle) layoutToggle.textContent = '📐 NORMAL LAYOUT';
                    if (autoArrangeBtn) autoArrangeBtn.classList.add('show');
                    this._enableFreeLayout();
                    Logger.log('🎛️ Started in FREE LAYOUT mode');
                }
            } catch (error) {
                Logger.error('Failed to initialize player:', error);
                throw error;
            }
        }

        startPerformanceTracking() {
            const updatePerformance = () => {
                try {
                    const activeVoices = this.grainVoiceManager.getActiveVoiceCount();
                    this.performanceMonitor.updateVoiceCount(activeVoices, CONSTANTS.MAX_VOICE_COUNT);
                    this.performanceMonitor.updateAudioState(this.audioContext.state);
                    this.resourceManager.requestAnimationFrame(updatePerformance);
                } catch (error) {
                    Logger.error('Performance tracking error:', error);
                }
            };
            updatePerformance();
        }

        _createUI() {
            // Initialize UIBuilder
            this.uiBuilder = new UIBuilder(this.config, this.domCache, this.resourceManager);

            // Create all UI with callbacks
            const callbacks = {
                onControlChange: () => this.saveCurrentState()
            };
            this.uiBuilder.createAllUI(callbacks);

            // Get waveform renderers from UIBuilder
            this.state.waveformRenderers = this.uiBuilder.getWaveformRenderers();
        }

        /**
         * Bind knob events for all control knobs after UI creation
         */
        _bindKnobEventsForAllControls() {
            // Bind global control knobs
            this.config.GLOBAL_CONTROL_SPECS.forEach(spec => {
                if (spec.type === 'knob') {
                    this.resourceManager.setTimeout(() => {
                        this._updateKnobDisplay(spec.id, spec, spec.value);
                        this._bindKnobEvents(spec.id, spec, null);
                    }, 0);
                }
            });

            // Bind per-slot control knobs
            for (let slot = 0; slot < this.config.SLOTS; slot++) {
                this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                    if (spec.type === 'knob') {
                        const elementId = `${spec.id}-slot${slot}`;
                        this.resourceManager.setTimeout(() => {
                            this._updateKnobDisplay(elementId, spec, spec.value);
                            this._bindKnobEvents(elementId, spec, slot);
                        }, 0);
                    }
                });
            }
        }

        _updateKnobDisplay(elementId, spec, value) {
            const indicator = this.domCache.getElementById(`${elementId}Indicator`, true);
            const display = this.domCache.getElementById(`${elementId}ValueDisplay`, true);
            
            if (indicator) {
                const normalizedValue = (value - spec.min) / (spec.max - spec.min);
                const angle = (normalizedValue * 270) - 135;
                indicator.style.transform = `translateX(-50%) rotate(${angle}deg)`;
            }
            
            if (display) {
                display.textContent = this.uiBuilder.formatKnobValue(spec, value);
            }
        }

        _setKnobLocked(elementId, isLocked) {
            const knobElement = this.domCache.getElementById(`${elementId}Knob`, true);
            if (!knobElement) return;

            this.state.knobLockStates[elementId] = isLocked;
            
            if (isLocked) {
                knobElement.classList.add('locked');
            } else {
                knobElement.classList.remove('locked');
            }
            
            this.saveCurrentState();
        }

        _isKnobLocked(elementId) {
            return this.state.knobLockStates[elementId] || false;
        }

        _unlockAllKnobs() {
            let unlockedCount = 0;
            
            for (let s = 0; s < this.config.SLOTS; s++) {
                this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                    const elementId = `${spec.id}-slot${s}`;
                    if (this._isKnobLocked(elementId)) {
                        this._setKnobLocked(elementId, false);
                        unlockedCount++;
                    }
                });
            }
            
            const globalKnobs = ['bpm', 'randomDensity'];
            globalKnobs.forEach(knobId => {
                if (this._isKnobLocked(knobId)) {
                    this._setKnobLocked(knobId, false);
                    unlockedCount++;
                }
            });
            
            if (unlockedCount > 0) {
                Logger.log(`🔓 Unlocked ${unlockedCount} knobs`);
            }
        }

        _toggleParameterLock(paramId) {
            const spec = this.config.PER_SLOT_CONTROL_SPECS.find(s => s.id === paramId);
            if (!spec) return;
            
            // 全スロットの現在のロック状態を確認
            const elementIds = [];
            let lockedCount = 0;
            
            for (let slot = 0; slot < this.config.SLOTS; slot++) {
                const elementId = `${paramId}-slot${slot}`;
                elementIds.push(elementId);
                if (this._isKnobLocked(elementId)) {
                    lockedCount++;
                }
            }
            
            // 全てロック済みならアンロック、そうでなければ全てロック
            const shouldLock = lockedCount < this.config.SLOTS;
            let changedCount = 0;
            
            elementIds.forEach(elementId => {
                const currentLockState = this._isKnobLocked(elementId);
                if (currentLockState !== shouldLock) {
                    this._setKnobLocked(elementId, shouldLock);
                    changedCount++;
                }
            });
            
            // ボタンの表示を更新
            const button = this.domCache.querySelector(`[data-param="${paramId}"].param-lock-btn`);
            if (button) {
                if (shouldLock) {
                    button.classList.add('locked');
                } else {
                    button.classList.remove('locked');
                }
                
                // 視覚的フィードバック
                button.classList.add('flash');
                this.resourceManager.setTimeout(() => {
                    button.classList.remove('flash');
                }, 300);
            }
            
            const action = shouldLock ? 'locked' : 'unlocked';
            Logger.log(`🔒 ${spec.label} ${action} for ${changedCount}/${this.config.SLOTS} slots`);
            
            // 状態変更があった場合のみ履歴に保存
            if (changedCount > 0) {
                this.saveCurrentState();
            }
        }

        _resetParameter(paramId) {
            const spec = this.config.PER_SLOT_CONTROL_SPECS.find(s => s.id === paramId);
            if (!spec) return;
            
            let resetCount = 0;
            let lockedCount = 0;
            
            for (let slot = 0; slot < this.config.SLOTS; slot++) {
                const elementId = `${paramId}-slot${slot}`;
                
                if (this._isKnobLocked(elementId)) {
                    lockedCount++;
                    continue;
                }
                
                // 各パラメータのデフォルト値にリセット
                const defaultValue = spec.value;
                
                if (this.state.knobDragStates[elementId]) {
                    this.state.knobDragStates[elementId].currentValue = defaultValue;
                }
                
                this._updateKnobDisplay(elementId, spec, defaultValue);
                resetCount++;
            }
            
            // 視覚的フィードバック
            const buttons = this.domCache.querySelectorAll(`[data-param="${paramId}"].param-reset-btn`);
            buttons.forEach(button => {
                button.classList.add('flash');
                this.resourceManager.setTimeout(() => {
                    button.classList.remove('flash');
                }, 300);
            });
            
            Logger.log(`🔄 ${spec.label} reset to default (${spec.value}) for ${resetCount}/${this.config.SLOTS} slots${lockedCount > 0 ? ` (${lockedCount} locked)` : ''}`);
            this.saveCurrentState();
        }

        _randomizeParameter(paramId) {
            const spec = this.config.PER_SLOT_CONTROL_SPECS.find(s => s.id === paramId);
            if (!spec) return;
            
            let randomizedCount = 0;
            let lockedCount = 0;
            
            for (let slot = 0; slot < this.config.SLOTS; slot++) {
                const elementId = `${paramId}-slot${slot}`;
                
                if (this._isKnobLocked(elementId)) {
                    lockedCount++;
                    continue;
                }
                
                let randomValue;
                if (spec.id === 'volume') {
                    // Volumeは少し特別な処理
                    randomValue = Math.random() * (CONSTANTS.VOLUME_RANDOM_MAX - CONSTANTS.VOLUME_RANDOM_MIN) + CONSTANTS.VOLUME_RANDOM_MIN;
                } else if (spec.id === 'envelopeShape' || spec.id === 'lfoWaveform') {
                    // 整数値のパラメータ
                    randomValue = Math.floor(Math.random() * (spec.max - spec.min + 1)) + spec.min;
                } else {
                    // 通常のパラメータ
                    randomValue = Math.random() * (spec.max - spec.min) + spec.min;
                    if (spec.step) {
                        randomValue = Math.round(randomValue / spec.step) * spec.step;
                    }
                }
                
                if (this.state.knobDragStates[elementId]) {
                    this.state.knobDragStates[elementId].currentValue = randomValue;
                }
                
                this._updateKnobDisplay(elementId, spec, randomValue);
                randomizedCount++;
            }
            
            // 視覚的フィードバック
            const buttons = this.domCache.querySelectorAll(`[data-param="${paramId}"]`);
            buttons.forEach(button => {
                button.classList.add('flash');
                this.resourceManager.setTimeout(() => {
                    button.classList.remove('flash');
                }, 300);
            });
            
            Logger.log(`🎲 ${spec.label} randomized for ${randomizedCount}/${this.config.SLOTS} slots${lockedCount > 0 ? ` (${lockedCount} locked)` : ''}`);
            this.saveCurrentState();
        }

        _bindKnobEvents(elementId, spec, slotIndex) {
            const knobElement = this.domCache.getElementById(`${elementId}Knob`, true);
            if (!knobElement) return;

            this.state.knobDragStates[elementId] = {
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
                this.state.knobDragStates[elementId].isDragging = true;
                knobElement.style.cursor = 'ns-resize';
                this.state.knobDragStates[elementId].startY = clientY;
                this.state.knobDragStates[elementId].startValue = this.state.knobDragStates[elementId].currentValue;

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
                const dragState = this.state.knobDragStates[elementId];
                if (!dragState.isDragging) return;

                const deltaY = dragState.startY - clientY;
                let newValue = dragState.startValue + (deltaY * normalizedSensitivity);

                newValue = Math.max(spec.min, Math.min(spec.max, newValue));

                if (spec.step) {
                    newValue = Math.round(newValue / spec.step) * spec.step;
                }

                dragState.currentValue = newValue;
                this._updateKnobDisplay(elementId, spec, newValue);

                // Real-time sequencer update for SEQ PROB knob
                if (elementId === 'randomDensity') {
                    Logger.debug(`SEQ PROB knob dragged to: ${newValue}`);
                    this.randomizeSequencer();
                }
            };

            const onDragEnd = () => {
                const dragState = this.state.knobDragStates[elementId];
                if (dragState.isDragging) {
                    dragState.isDragging = false;
                    knobElement.style.cursor = 'grab';
                    this.saveCurrentState();

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
                const dragState = this.state.knobDragStates[elementId];
                dragState.currentValue = spec.value;
                this._updateKnobDisplay(elementId, spec, spec.value);
                this.saveCurrentState();
                
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
                const isCurrentlyLocked = this._isKnobLocked(elementId);
                this._setKnobLocked(elementId, !isCurrentlyLocked);
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
                const dragState = this.state.knobDragStates[elementId];

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
            
            if (this._isKnobLocked(elementId)) {
                knobElement.classList.add('locked');
            }
            knobElement.style.cursor = 'grab';
        }

        _getKnobValue(elementId) {
            const dragState = this.state.knobDragStates[elementId];
            return dragState ? dragState.currentValue : 0;
        }

        _setupCollapsibleHeaders() {
            this.domCache.querySelectorAll('.collapsible-header').forEach(header => {
                this.resourceManager.addEventListener(header, 'click', () => {
                    if (this.state.isFreeLayoutMode || header.classList.contains('no-collapse')) {
                        return;
                    }

                    const content = header.nextElementSibling;
                    const indicator = header.querySelector('.indicator');
                    if (content && indicator) {
                        content.classList.toggle('collapsed-content');
                        indicator.textContent = content.classList.contains('collapsed-content') ? '+' : '-';
                        this.saveCurrentState();
                    }
                });
            });
        }

        _bindEvents() {
            this.ui = {
                startGranular: this.domCache.getElementById('startGranular'),
                stopGranular: this.domCache.getElementById('stopGranular'),
                randomizeSequencer: this.domCache.getElementById('randomizeSequencer'),
                randomizeAllSlotParams: this.domCache.getElementById('randomizeAllSlotParams'),
                clearPanButton: this.domCache.getElementById('clearPanButton'),
                resetHpfButton: this.domCache.getElementById('resetHpfButton'),
                setHpf130Button: this.domCache.getElementById('setHpf130Button'),
                setHpf900Button: this.domCache.getElementById('setHpf900Button'),
                setAtk0Button: this.domCache.getElementById('setAtk0Button'),
                percButton: this.domCache.getElementById('percButton'),
                unlockAllKnobsButton: this.domCache.getElementById('unlockAllKnobsButton'),
                undoButton: this.domCache.getElementById('undoButton'),
                redoButton: this.domCache.getElementById('redoButton'),
                loadingStatus: this.domCache.getElementById('loadingStatus'),
                bpmKnob: this.domCache.getElementById('bpmKnob'),
                randomDensityKnob: this.domCache.getElementById('randomDensityKnob'),
                loadPathButton: this.domCache.getElementById('loadPathButton'),
                sequencerContainer: this.domCache.getElementById('sequencer-content'),
                slotMatrix: this.domCache.getElementById('slotMatrix'),
                togglePerfMonitor: this.domCache.getElementById('togglePerfMonitor'),
            };

            this.resourceManager.addEventListener(this.ui.startGranular, 'click', () => this.startGranularPlayback());
            this.resourceManager.addEventListener(this.ui.stopGranular, 'click', () => this.stopGranularPlayback());
            this.resourceManager.addEventListener(this.ui.randomizeSequencer, 'click', () => this.randomizeSequencer());
            this.resourceManager.addEventListener(this.ui.randomizeAllSlotParams, 'click', () => this.randomizeAllSlotParams());
            this.resourceManager.addEventListener(this.ui.clearPanButton, 'click', () => this.clearAllPan());
            this.resourceManager.addEventListener(this.ui.resetHpfButton, 'click', () => this.setHpf(0));
            this.resourceManager.addEventListener(this.ui.setHpf130Button, 'click', () => this.setHpf(130));
            this.resourceManager.addEventListener(this.ui.setHpf900Button, 'click', () => this.setHpf(900));
            this.resourceManager.addEventListener(this.ui.setAtk0Button, 'click', () => this.setAttackTime(3));
            this.resourceManager.addEventListener(this.ui.percButton, 'click', () => this.setPercussivePreset());
            this.resourceManager.addEventListener(this.ui.unlockAllKnobsButton, 'click', () => this._unlockAllKnobs());
            this.resourceManager.addEventListener(this.ui.undoButton, 'click', () => this.undo());
            this.resourceManager.addEventListener(this.ui.redoButton, 'click', () => this.redo());
            this.resourceManager.addEventListener(this.ui.loadPathButton, 'click', () => this._loadFolderSamples());
            this.resourceManager.addEventListener(this.ui.togglePerfMonitor, 'click', () => this.performanceMonitor.toggle());

            // パラメータ別のランダマイズボタンのイベントリスナー
            this.resourceManager.addEventListener(document, 'click', (e) => {
                if (e.target.classList.contains('param-random-btn')) {
                    const paramId = e.target.dataset.param;
                    this._randomizeParameter(paramId);
                }

                if (e.target.classList.contains('param-reset-btn')) {
                    const paramId = e.target.dataset.param;
                    this._resetParameter(paramId);
                }

                if (e.target.classList.contains('param-lock-btn')) {
                    const paramId = e.target.dataset.param;
                    this._toggleParameterLock(paramId);
                }
            });

            for (let s = 0; s < this.config.SLOTS; s++) {
                const fileInput = this.domCache.getElementById(`hiddenFileInput-slot${s}`);
                this.resourceManager.addEventListener(fileInput, 'change', e => this._handleFileLoad(e));

                const canvas = this.domCache.getElementById(`waveform-${s}`);
                this.resourceManager.addEventListener(canvas, 'mousedown', (e) => this._onWaveformPlaybackStart(e, s));
                this.resourceManager.addEventListener(canvas, 'mouseup', (e) => this._onWaveformPlaybackStop(e, s));
                this.resourceManager.addEventListener(canvas, 'mouseleave', (e) => this._onWaveformPlaybackStop(e, s));
                this.resourceManager.addEventListener(canvas, 'touchstart', (e) => this._onWaveformPlaybackStart(e, s), { passive: false });
                this.resourceManager.addEventListener(canvas, 'touchend', (e) => this._onWaveformPlaybackStop(e, s));
                this.resourceManager.addEventListener(canvas, 'touchcancel', (e) => this._onWaveformPlaybackStop(e, s));
            }

            this.resourceManager.addEventListener(this.ui.sequencerContainer, 'click', e => {
                if (e.target.classList.contains('step')) this._handleStepClick(e.target);
            });
            this.resourceManager.addEventListener(this.ui.slotMatrix, 'click', e => {
                 const slotLabel = e.target.closest('[data-slot]');
                 if (slotLabel && !e.target.closest('.slot-controls-container')) {
                     const slot = slotLabel.dataset.slot;
                     if (slot !== undefined) {
                         this.domCache.getElementById(`hiddenFileInput-slot${slot}`).click();
                     }
                 }
                 if (e.target.classList.contains('slot-control-btn')) {
                     this._handleSlotControlClick(e.target);
                 }
            });

            this._bindKnobEvents('bpm', this.config.BPM_SPEC, null);
            this._bindKnobEvents('randomDensity', this.config.RANDOM_DENSITY_SPEC, null);
            
            this._bindKeyboardShortcuts();
            this._initializeDragAndDrop();
        }

        _initializeDragAndDrop() {
            const layoutToggle = this.domCache.getElementById('layoutToggle');
            const autoArrangeBtn = this.domCache.getElementById('autoArrangeBtn');

            this.resourceManager.addEventListener(layoutToggle, 'click', () => this._toggleLayoutMode());
            this.resourceManager.addEventListener(autoArrangeBtn, 'click', () => this._autoArrangePanels());

            // LayoutManager already registers drag/resize listeners in its constructor
            // No need to call _setupSectionDragging() here
        }

        _toggleLayoutMode() {
            // Toggle state
            this.state.isFreeLayoutMode = !this.state.isFreeLayoutMode;

            // Delegate to LayoutManager
            this.layoutManager.setFreeLayoutMode(this.state.isFreeLayoutMode);

            // Additional setup for free/normal layout
            if (this.state.isFreeLayoutMode) {
                this._enableFreeLayout();
            } else {
                this._disableFreeLayout();
            }
        }

        _autoArrangePanels() {
            if (!this.state.isFreeLayoutMode) return;
            
            const sections = this.domCache.querySelectorAll('.panel-group.draggable', true);
            if (sections.length === 0) return;
            
            // ビューポートサイズを取得
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const margin = 20;
            const headerHeight = 120;
            
            // 各パネルの現在のサイズと位置を取得
            const panels = Array.from(sections).map(section => {
                const rect = section.getBoundingClientRect();
                const currentLeft = parseInt(section.style.left) || rect.left;
                const currentTop = parseInt(section.style.top) || rect.top;
                
                return {
                    element: section,
                    originalX: currentLeft,
                    originalY: currentTop,
                    width: rect.width,
                    height: rect.height,
                    newX: currentLeft,
                    newY: currentTop
                };
            });
            
            Logger.log(`📐 Auto-arrange: Organizing ${panels.length} panels while keeping their sizes`);
            
            // 現在の位置に近い順でソート
            panels.sort((a, b) => {
                const distA = Math.sqrt(a.originalX * a.originalX + a.originalY * a.originalY);
                const distB = Math.sqrt(b.originalX * b.originalX + b.originalY * b.originalY);
                return distA - distB;
            });
            
            // 既に配置されたパネルの領域を記録
            const occupiedAreas = [];
            
            panels.forEach((panel, index) => {
                // 理想的な位置を現在位置の近くで探す
                const idealPosition = this._findNearestNonOverlappingPosition(
                    panel.originalX,
                    panel.originalY,
                    panel.width,
                    panel.height,
                    occupiedAreas,
                    viewportWidth,
                    viewportHeight,
                    margin,
                    headerHeight
                );
                
                panel.newX = idealPosition.x;
                panel.newY = idealPosition.y;
                
                // 配置済み領域に追加
                occupiedAreas.push({
                    x: idealPosition.x,
                    y: idealPosition.y,
                    width: panel.width,
                    height: panel.height
                });
                
                // パネルの変形をリセット
                const section = panel.element;
                section.style.transform = '';
                section.style.transformOrigin = '';
                
                // スケール表示を削除
                const scaleIndicator = section.querySelector('.scale-indicator');
                if (scaleIndicator) {
                    scaleIndicator.remove();
                }
                
                // アニメーション付きで配置（サイズは変更しない）
                section.style.transition = 'all 0.3s ease';
                section.style.left = idealPosition.x + 'px';
                section.style.top = idealPosition.y + 'px';
                // width と height は変更しない
                
                // 位置を保存（サイズは現在のまま）
                this.state.sectionPositions[section.id] = {
                    x: idealPosition.x,
                    y: idealPosition.y,
                    width: panel.width,
                    height: panel.height
                };
                
                // アニメーション終了後にtransitionを削除
                this.resourceManager.setTimeout(() => {
                    section.style.transition = '';
                }, 300);
            });
            
            Logger.log('⚡ Auto-arranged all panels to nearest non-overlapping positions');
        }

        _findNearestNonOverlappingPosition(targetX, targetY, width, height, occupiedAreas, viewportWidth, viewportHeight, margin, headerHeight) {
            const searchRadius = 80; // 探索半径を拡大
            const step = 15; // 探索ステップを細かく
            
            // 最大有効範囲
            const maxX = viewportWidth - width - margin;
            const maxY = viewportHeight - height - margin;
            const minX = margin;
            const minY = headerHeight;
            
            // 現在位置が有効範囲内で重複がない場合はそのまま使用
            const clampedX = Math.max(minX, Math.min(maxX, targetX));
            const clampedY = Math.max(minY, Math.min(maxY, targetY));
            
            if (!this._hasOverlap(clampedX, clampedY, width, height, occupiedAreas)) {
                return { x: clampedX, y: clampedY };
            }
            
            // 螺旋状に近い位置を探索
            for (let radius = step; radius <= searchRadius * 4; radius += step) {
                const positions = this._generateSearchPositions(clampedX, clampedY, radius, step);
                
                for (const pos of positions) {
                    const x = Math.max(minX, Math.min(maxX, pos.x));
                    const y = Math.max(minY, Math.min(maxY, pos.y));
                    
                    if (!this._hasOverlap(x, y, width, height, occupiedAreas)) {
                        return { x, y };
                    }
                }
            }
            
            // それでも見つからない場合は、グリッド状に全範囲を探す
            for (let y = minY; y <= maxY; y += step) {
                for (let x = minX; x <= maxX; x += step) {
                    if (!this._hasOverlap(x, y, width, height, occupiedAreas)) {
                        return { x, y };
                    }
                }
            }
            
            // 最後の手段：右下方向にずらして強制配置
            let fallbackX = Math.min(maxX, clampedX + 50);
            let fallbackY = Math.min(maxY, clampedY + 50);
            
            // それでも重複する場合は下にずらす
            while (fallbackY <= maxY && this._hasOverlap(fallbackX, fallbackY, width, height, occupiedAreas)) {
                fallbackY += 30;
            }
            
            return { x: fallbackX, y: Math.min(maxY, fallbackY) };
        }

        _generateSearchPositions(centerX, centerY, radius, step) {
            const positions = [];
            const steps = Math.max(8, Math.floor(2 * Math.PI * radius / step));
            
            for (let i = 0; i < steps; i++) {
                const angle = (2 * Math.PI * i) / steps;
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                positions.push({ x: Math.round(x), y: Math.round(y) });
            }
            
            return positions;
        }

        _hasOverlap(x, y, width, height, occupiedAreas) {
            const buffer = 15; // 重複判定のバッファを増加
            
            return occupiedAreas.some(area => {
                // より厳密な重複判定
                const overlap = !(
                    x >= area.x + area.width + buffer ||  // 右側に完全に離れている
                    x + width + buffer <= area.x ||       // 左側に完全に離れている
                    y >= area.y + area.height + buffer || // 下側に完全に離れている
                    y + height + buffer <= area.y         // 上側に完全に離れている
                );
                
                return overlap;
            });
        }

        _enableFreeLayout() {
            const sections = this.domCache.querySelectorAll('.panel-group', true);
            sections.forEach((section, index) => {
                section.classList.add('draggable');
                
                const existingHandle = section.querySelector('.resize-handle');
                if (existingHandle) {
                    existingHandle.remove();
                }
                
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'resize-handle';
                resizeHandle.dataset.sectionId = section.id;
                resizeHandle.setAttribute('title', 'Drag to resize');
                section.appendChild(resizeHandle);
                
                const titleHeader = section.querySelector('.group-title');
                if (titleHeader) {
                    titleHeader.classList.add('no-collapse');
                    const indicator = titleHeader.querySelector('.indicator');
                    if (indicator) {
                        indicator.style.display = 'none';
                    }
                }
                
                const content = section.querySelector('[id$="-content"]');
                if (content && content.classList.contains('collapsed-content')) {
                    content.classList.remove('collapsed-content');
                }
                
                const savedPosition = this.state.sectionPositions[section.id];
                if (savedPosition) {
                    section.style.left = savedPosition.x + 'px';
                    section.style.top = savedPosition.y + 'px';
                    section.style.width = savedPosition.width + 'px';
                    if (savedPosition.height) {
                        section.style.height = savedPosition.height + 'px';
                    }
                } else {
                    const col = index % 2;
                    const row = Math.floor(index / 2);
                    
                    let defaultWidth = '300px';
                    if (section.id === 'main-section') {
                        defaultWidth = '580px';
                    } else if (section.id === 'ctrl-section') {
                        defaultWidth = '900px';
                    } else if (section.id === 'output-section') {
                        defaultWidth = '600px';
                    }
                    
                    section.style.left = (col * 620 + 20) + 'px';
                    section.style.top = (row * 280 + 100) + 'px';
                    section.style.width = defaultWidth;
                    section.style.minHeight = '150px';
                }
            });
        }

        _disableFreeLayout() {
            const sections = this.domCache.querySelectorAll('.panel-group', true);
            sections.forEach(section => {
                this.state.sectionPositions[section.id] = {
                    x: parseInt(section.style.left) || 0,
                    y: parseInt(section.style.top) || 0,
                    width: parseInt(section.style.width) || 300,
                    height: parseInt(section.style.height) || 'auto'
                };
                
                const resizeHandle = section.querySelector('.resize-handle');
                if (resizeHandle) {
                    resizeHandle.remove();
                }
                
                const titleHeader = section.querySelector('.group-title');
                if (titleHeader) {
                    titleHeader.classList.remove('no-collapse');
                    const indicator = titleHeader.querySelector('.indicator');
                    if (indicator) {
                        indicator.style.display = '';
                    }
                }
                
                section.classList.remove('draggable', 'dragging', 'resizing');
                section.style.left = '';
                section.style.top = '';
                section.style.width = '';
                section.style.height = '';
                section.style.position = '';
                section.style.transform = '';
                section.style.transformOrigin = '';
                
                const scaleIndicator = section.querySelector('.scale-indicator');
                if (scaleIndicator) {
                    scaleIndicator.remove();
                }
                
                const scaledElements = section.querySelectorAll('[style*="transform"]');
                scaledElements.forEach(el => {
                    if (el.style.transform.includes('scale')) {
                        el.style.transform = '';
                        el.style.transformOrigin = '';
                    }
                });
            });
            
            this._stopAutoScaling();
        }

        _startAutoScaling() {
            if (this.state.autoScalingActive) return;
            
            this.state.autoScalingActive = true;
            this.state.baseViewportSize = {
                width: window.innerWidth,
                height: window.innerHeight
            };
            
            this._adjustSectionsToViewport();
            
            this._resizeListener = () => {
                if (this.state.isFreeLayoutMode && this.state.autoScalingActive) {
                    this._adjustSectionsToViewport();
                    
                    if (this.spectrumAnalyzer) {
                        this.resourceManager.setTimeout(() => {
                            this.spectrumAnalyzer.setupCanvas();
                        }, 100);
                    }
                }
            };
            
            this.resourceManager.addEventListener(window, 'resize', this._resizeListener);
            Logger.log('🔄 Auto-scaling started for FREE LAYOUT mode');
        }

        _stopAutoScaling() {
            if (!this.state.autoScalingActive) return;
            
            this.state.autoScalingActive = false;
            
            if (this._resizeListener) {
                this.resourceManager.removeEventListener(window, 'resize', this._resizeListener);
                this._resizeListener = null;
            }
            
            Logger.log('🔄 Auto-scaling stopped');
        }

        _adjustSectionsToViewport() {
            // Check if user is currently dragging or resizing via LayoutManager
            if (this.layoutManager.getStatus().isInteracting) {
                return;
            }
            
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const sections = this.domCache.querySelectorAll('.panel-group.draggable', true);
            
            if (sections.length === 0) return;
            
            sections.forEach(section => {
                const rect = section.getBoundingClientRect();
                const currentLeft = parseInt(section.style.left) || 0;
                const currentTop = parseInt(section.style.top) || 0;
                const currentWidth = parseInt(section.style.width) || 300;
                const currentHeight = parseInt(section.style.height) || 200;
                
                let newLeft = currentLeft;
                let newTop = currentTop;
                let newWidth = currentWidth;
                let newHeight = currentHeight;
                let scale = 1;
                
                if (currentLeft + currentWidth > viewportWidth - 40) {
                    const maxWidth = viewportWidth - currentLeft - 40;
                    if (maxWidth > 200) {
                        newWidth = maxWidth;
                    } else {
                        newLeft = Math.max(20, viewportWidth - currentWidth - 40);
                        if (newLeft < 20) {
                            newLeft = 20;
                            newWidth = viewportWidth - 60;
                        }
                    }
                }
                
                if (currentTop + currentHeight > viewportHeight - 40) {
                    const maxHeight = viewportHeight - currentTop - 40;
                    if (maxHeight > 150) {
                        newHeight = maxHeight;
                    } else {
                        newTop = Math.max(20, viewportHeight - currentHeight - 40);
                        if (newTop < 20) {
                            newTop = 20;
                            newHeight = viewportHeight - 60;
                        }
                    }
                }
                
                const minScale = 0.5;
                const maxSectionWidth = viewportWidth * 0.9;
                const maxSectionHeight = viewportHeight * 0.9;
                
                if (newWidth > maxSectionWidth) {
                    scale = Math.min(scale, maxSectionWidth / newWidth);
                }
                if (newHeight > maxSectionHeight) {
                    scale = Math.min(scale, maxSectionHeight / newHeight);
                }
                
                scale = Math.max(minScale, scale);
                
                section.style.left = newLeft + 'px';
                section.style.top = newTop + 'px';
                section.style.width = newWidth + 'px';
                section.style.height = newHeight + 'px';
                
                if (scale < 1) {
                    section.style.transform = `scale(${scale})`;
                    section.style.transformOrigin = 'top left';
                    section.style.zIndex = '999';
                    
                    const scaleIndicator = section.querySelector('.scale-indicator') || document.createElement('div');
                    if (!section.querySelector('.scale-indicator')) {
                        scaleIndicator.className = 'scale-indicator';
                        scaleIndicator.style.cssText = `
                            position: absolute;
                            top: -20px;
                            right: 5px;
                            background: rgba(255, 165, 0, 0.9);
                            color: white;
                            padding: 2px 6px;
                            font-size: 0.7em;
                            font-weight: bold;
                            border-radius: 3px;
                            z-index: 1003;
                            pointer-events: none;
                        `;
                        section.appendChild(scaleIndicator);
                    }
                    scaleIndicator.textContent = `${Math.round(scale * 100)}%`;
                } else {
                    section.style.transform = '';
                    section.style.transformOrigin = '';
                    
                    const scaleIndicator = section.querySelector('.scale-indicator');
                    if (scaleIndicator) {
                        scaleIndicator.remove();
                    }
                }
                
                this._scaleInternalContent(section, scale);
            });
        }

        _scaleInternalContent(section, scale) {
            const waveformCanvases = section.querySelectorAll('.waveform-canvas');
            waveformCanvases.forEach(canvas => {
                if (scale < 1) {
                    canvas.style.transform = `scale(${Math.max(0.7, scale)})`;
                    canvas.style.transformOrigin = 'top left';
                } else {
                    canvas.style.transform = '';
                    canvas.style.transformOrigin = '';
                }
            });
            
            const spectrumCanvas = section.querySelector('#spectrumCanvas');
            if (spectrumCanvas && scale < 1) {
                const spectrumContainer = section.querySelector('.spectrum-analyzer-container');
                if (spectrumContainer) {
                    spectrumContainer.style.transform = `scale(${Math.max(0.8, scale)})`;
                    spectrumContainer.style.transformOrigin = 'top left';
                }
            } else if (spectrumCanvas) {
                const spectrumContainer = section.querySelector('.spectrum-analyzer-container');
                if (spectrumContainer) {
                    spectrumContainer.style.transform = '';
                    spectrumContainer.style.transformOrigin = '';
                }
            }
            
            const matrixKnobs = section.querySelectorAll('.matrix-knob .knob');
            matrixKnobs.forEach(knob => {
                if (scale < 0.8) {
                    knob.style.transform = `scale(${Math.max(0.6, scale)})`;
                    knob.style.transformOrigin = 'center';
                } else {
                    knob.style.transform = '';
                    knob.style.transformOrigin = '';
                }
            });
        }

        _setupSectionDragging() {
            this.resourceManager.addEventListener(document, 'mousedown', (e) => this._handleDragResizeStart(e));
            this.resourceManager.addEventListener(document, 'mousemove', (e) => this._handleDragResizeMove(e));
            this.resourceManager.addEventListener(document, 'mouseup', (e) => this._handleDragResizeEnd(e));

            this.resourceManager.addEventListener(document, 'touchstart', (e) => this._handleDragResizeStart(e), {passive: false});
            this.resourceManager.addEventListener(document, 'touchmove', (e) => this._handleDragResizeMove(e), {passive: false});
            this.resourceManager.addEventListener(document, 'touchend', (e) => this._handleDragResizeEnd(e));
        }

        _handleDragResizeStart(e) {
            if (!this.state.isFreeLayoutMode) return;
            
            if (e.target.classList.contains('resize-handle')) {
                this._startResize(e, e.target);
                return;
            }
            
            const titleBar = e.target.closest('.group-title');
            if (!titleBar) return;
            
            const target = titleBar.closest('.panel-group');
            if (!target || !target.classList.contains('draggable')) return;
            
            this._startDrag(e, target, titleBar);
        }

        _handleDragResizeMove(e) {
            if (this.state.dragState.isDragging) {
                this._handleDragMove(e);
            } else if (this.state.resizeState.isResizing) {
                this._handleResizeMove(e);
            }
        }

        _handleDragResizeEnd(e) {
            if (this.state.dragState.isDragging) {
                this._handleDragEnd(e);
            } else if (this.state.resizeState.isResizing) {
                this._handleResizeEnd(e);
            }
        }

        _startDrag(e, target, titleBar) {
            e.preventDefault();
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            const rect = target.getBoundingClientRect();
            
            this.state.dragState = {
                isDragging: true,
                currentElement: target,
                startX: clientX,
                startY: clientY,
                offsetX: clientX - rect.left,
                offsetY: clientY - rect.top
            };
            
            target.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.overflow = 'hidden';
        }

        _startResize(e, resizeHandle) {
            e.preventDefault();
            e.stopPropagation();
            
            const target = resizeHandle.parentElement;
            if (!target || !target.classList.contains('panel-group')) {
                return;
            }
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            const rect = target.getBoundingClientRect();
            
            this.state.resizeState = {
                isResizing: true,
                currentElement: target,
                startX: clientX,
                startY: clientY,
                startWidth: rect.width,
                startHeight: rect.height
            };
            
            target.classList.add('resizing');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'se-resize';
        }

        _handleDragMove(e) {
            if (!this.state.dragState.isDragging) return;
            
            e.preventDefault();
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            const newX = clientX - this.state.dragState.offsetX;
            const newY = clientY - this.state.dragState.offsetY;
            
            const container = this.domCache.getElementById('layoutContainer');
            const containerRect = container.getBoundingClientRect();
            const element = this.state.dragState.currentElement;
            const elementRect = element.getBoundingClientRect();
            
            const maxX = containerRect.width - elementRect.width;
            const maxY = containerRect.height - elementRect.height;
            
            const boundedX = Math.max(0, Math.min(newX, maxX));
            const boundedY = Math.max(0, Math.min(newY, maxY));
            
            element.style.left = boundedX + 'px';
            element.style.top = boundedY + 'px';
        }

        _handleResizeMove(e) {
            if (!this.state.resizeState.isResizing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            const deltaX = clientX - this.state.resizeState.startX;
            const deltaY = clientY - this.state.resizeState.startY;
            
            let newWidth = this.state.resizeState.startWidth + deltaX;
            let newHeight = this.state.resizeState.startHeight + deltaY;
            
            const minWidth = 200;
            const maxWidth = 1000;
            const minHeight = 150;
            const maxHeight = 1000;
            
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
            
            const element = this.state.resizeState.currentElement;
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
        }

        _handleDragEnd(e) {
            if (!this.state.dragState.isDragging) return;
            
            const element = this.state.dragState.currentElement;
            element.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.overflow = '';
            
            this.state.sectionPositions[element.id] = {
                ...this.state.sectionPositions[element.id],
                x: parseInt(element.style.left) || 0,
                y: parseInt(element.style.top) || 0
            };
            
            this.state.dragState = {
                isDragging: false,
                currentElement: null,
                startX: 0,
                startY: 0,
                offsetX: 0,
                offsetY: 0
            };
        }

        _handleResizeEnd(e) {
            if (!this.state.resizeState.isResizing) return;
            
            const element = this.state.resizeState.currentElement;
            element.classList.remove('resizing');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            
            const currentPosition = this.state.sectionPositions[element.id] || {};
            this.state.sectionPositions[element.id] = {
                ...currentPosition,
                width: parseInt(element.style.width) || 300,
                height: parseInt(element.style.height) || 200
            };
            
            this.state.resizeState = {
                isResizing: false,
                currentElement: null,
                startX: 0,
                startY: 0,
                startWidth: 0,
                startHeight: 0
            };
        }

        _bindKeyboardShortcuts() {
            this.resourceManager.addEventListener(document, 'keydown', (e) => {
                const activeElement = document.activeElement;
                if (activeElement && (
                    activeElement.tagName === 'INPUT' || 
                    activeElement.tagName === 'TEXTAREA' || 
                    activeElement.tagName === 'SELECT' ||
                    activeElement.contentEditable === 'true'
                )) {
                    return;
                }

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
                            this.undo();
                        }
                        break;
                        
                    case 'KeyY':
                        if (e.ctrlKey) {
                            e.preventDefault();
                            this.redo();
                        }
                        break;

                    case 'KeyL':
                        if (e.ctrlKey) {
                            e.preventDefault();
                            this._loadFolderSamples();
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

        _handleModeShortcut(modeValue) {
            const slotModeSelect = this.domCache.getElementById('slotMode');
            if (slotModeSelect) {
                slotModeSelect.value = modeValue;

                // 視覚的フィードバック
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
                
                // コンソールログで確認
                const modeNames = [
                    'Fixed (Slot 1)', 'Fixed (Slot 2)', 'Fixed (Slot 3)', 
                    'Fixed (Slot 4)', 'All', 'Random'
                ];
                Logger.log(`🎛️ Mode changed to: ${modeNames[modeValue]}`);
                
                this.saveCurrentState();
            }
        }

        _handleSpaceKey() {
            if (this.state.isPlaying) {
                this.stopGranularPlayback();
            } else {
                this.startGranularPlayback();
            }
        }

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

        _clearMultiSelect() {
            this.state.isMultiSelecting = false;
            this.state.multiSelectStart = -1;
            this.state.multiSelectEnd = -1;
        }

        _handleSequencerToggle() {
            if (this.state.isMultiSelecting) {
                const start = Math.min(this.state.multiSelectStart, this.state.multiSelectEnd);
                const end = Math.max(this.state.multiSelectStart, this.state.multiSelectEnd);
                
                for (let step = start; step <= end; step++) {
                    this._toggleSequencerStep(this.state.selectedSlot, step);
                }
            } else {
                this._toggleSequencerStep(this.state.selectedSlot, this.state.selectedStep);
            }
            
            this.saveCurrentState();
        }

        _handleSequencerDelete() {
            if (this.state.isMultiSelecting) {
                const start = Math.min(this.state.multiSelectStart, this.state.multiSelectEnd);
                const end = Math.max(this.state.multiSelectStart, this.state.multiSelectEnd);
                
                for (let step = start; step <= end; step++) {
                    this._setSequencerStep(this.state.selectedSlot, step, false);
                }
            } else {
                this._setSequencerStep(this.state.selectedSlot, this.state.selectedStep, false);
            }
            
            this.saveCurrentState();
        }

        _toggleSequencerStep(slot, step) {
            // Delegate to SequencerController
            this.sequencerController.toggleStep(slot, step);

            // Sync state
            this.state.sequencerPatterns = this.sequencerController.getPatterns();
        }

        _setSequencerStep(slot, step, isActive) {
            // Delegate to SequencerController
            this.sequencerController.setStep(slot, step, isActive);

            // Sync state
            this.state.sequencerPatterns = this.sequencerController.getPatterns();
        }

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

        _handleEscapeKey() {
            if (this.state.isMultiSelecting) {
                this._clearMultiSelect();
                this._updateSequencerSelection();
                return;
            }

            this.stopGranularPlayback();
            this.grainVoiceManager.stopAll();
            
            for (let s = 0; s < this.config.SLOTS; s++) {
                if (this.state.previewSources[s]) {
                    this.state.previewSources[s].stop();
                    this.state.previewSources[s].disconnect();
                    this.state.previewSources[s] = null;
                }
            }
        }

        async _handleFileLoad(e) {
            const slot = parseInt(e.target.dataset.slot);
            const file = e.target.files[0];
            if (!file) return;

            try {
                // Validate and load file with proper error handling
                const decoded = await loadAudioFile(file, this.audioContext);

                this.state.audioBuffers[slot] = decoded;
                this.state.waveformRenderers[slot].drawWaveform(decoded);
                this.domCache.getElementById(`fileName-slot${slot}`).textContent = file.name;
                this.saveCurrentState();

                Logger.log(`✅ Slot ${slot}: ${file.name} loaded successfully`);
            } catch (err) {
                Logger.error(`❌ Failed to load file for Slot ${slot}:`, err);
                alert(`ファイルの読み込みに失敗しました:\n${err.message}`);

                // Clear the file input
                e.target.value = '';
            }
        }
        
        _handleStepClick(cell) {
            const slot = +cell.dataset.slot;
            const step = +cell.dataset.step;

            // Delegate to SequencerController
            this.sequencerController.toggleStep(slot, step);

            // Sync state
            this.state.sequencerPatterns = this.sequencerController.getPatterns();
            this.saveCurrentState();
        }

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
                    this._updateAllSlotControlButtons();
                    break;
                    
                case 'mute':
                    this.state.slotMuteStatus[slot] = !this.state.slotMuteStatus[slot];
                    if (this.state.slotMuteStatus[slot]) {
                        this.state.slotSoloStatus[slot] = false;
                    }
                    this._updateSlotControlButtons(slot);
                    break;
            }
            
            this.saveCurrentState();
        }

        _handleSlotControlClick(button) {
            const slot = parseInt(button.dataset.slot);
            const type = button.dataset.type;
            
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
                    this._updateAllSlotControlButtons();
                    break;
                    
                case 'mute':
                    this.state.slotMuteStatus[slot] = !this.state.slotMuteStatus[slot];
                    if (this.state.slotMuteStatus[slot]) {
                        this.state.slotSoloStatus[slot] = false;
                    }
                    this._updateSlotControlButtons(slot);
                    break;
            }
            
            this.saveCurrentState();
        }

        _updateSlotControlButtons(slot) {
            const soloBtn = this.domCache.getElementById(`soloBtn-${slot}`);
            const muteBtn = this.domCache.getElementById(`muteBtn-${slot}`);
            
            if (this.state.slotSoloStatus[slot]) {
                soloBtn.classList.add('solo-active');
            } else {
                soloBtn.classList.remove('solo-active');
            }
            
            if (this.state.slotMuteStatus[slot]) {
                muteBtn.classList.add('mute-active');
            } else {
                muteBtn.classList.remove('mute-active');
            }
        }

        _updateAllSlotControlButtons() {
            for (let s = 0; s < this.config.SLOTS; s++) {
                this._updateSlotControlButtons(s);
            }
        }

        _isSlotActiveForPlayback(slot) {
            const hasSoloActive = this.state.slotSoloStatus.some(solo => solo);
            if (hasSoloActive) {
                return this.state.slotSoloStatus[slot];
            }
            return !this.state.slotMuteStatus[slot];
        }

        _onWaveformPlaybackStart(e, slotIndex) {
            if (this.state.audioBuffers[slotIndex] && !this.state.previewSources[slotIndex]) {
                const src = this.audioContext.createBufferSource();
                src.buffer = this.state.audioBuffers[slotIndex];
                
                const volumeElementId = `volume-slot${slotIndex}`;
                const volumeValue = this._getKnobValue(volumeElementId) || 0.7;
                
                const previewGain = this.audioContext.createGain();
                previewGain.gain.value = volumeValue;
                
                src.connect(previewGain);
                previewGain.connect(this.grainVoiceManager.masterGain);
                src.loop = true;
                src.start(0);
                this.state.previewSources[slotIndex] = src;
            }
            e.preventDefault();
        }

        _onWaveformPlaybackStop(e, slotIndex) {
            if (this.state.previewSources[slotIndex]) {
                this.state.previewSources[slotIndex].stop();
                this.state.previewSources[slotIndex].disconnect();
                this.state.previewSources[slotIndex] = null;
            }
            e.preventDefault();
        }

        startGranularPlayback() {
            try {
                if (this.state.isPlaying) {
                    if (this.state.sequencerIntervalId !== null) {
                        this.resourceManager.clearInterval(this.state.sequencerIntervalId);
                        this.state.sequencerIntervalId = null;
                    }
                } else {
                    this.state.isPlaying = true;
                    this.state.lfoStartTime = this.audioContext.currentTime;
                    this.state.currentSequencerStep = 0;

                    if (this.spectrumAnalyzer) {
                        this.spectrumAnalyzer.start();
                    }
                }

                const stepIntervalMs = (60 / this.state.tempoBpm) * 1000 / this.config.GRANULAR_INTERVAL_DIVISOR;
                this.state.sequencerIntervalId = this.resourceManager.setInterval(() => this._sequencerTick(), stepIntervalMs);
            } catch (error) {
                Logger.error('Failed to start granular playback:', error);
                this.state.isPlaying = false;
            }
        }

        stopGranularPlayback() {
            try {
                if (!this.state.isPlaying) return;
                this.state.isPlaying = false;
                if (this.state.sequencerIntervalId !== null) {
                    this.resourceManager.clearInterval(this.state.sequencerIntervalId);
                    this.state.sequencerIntervalId = null;
                }
                this._updateStepUI();

                this.grainVoiceManager.stopAll();

                if (this.spectrumAnalyzer) {
                    this.spectrumAnalyzer.stop();
                }

                for (let s = 0; s < this.config.SLOTS; s++) {
                    const buffer = this.state.audioBuffers[s];
                    if (buffer) {
                        this.state.waveformRenderers[s].drawWaveform(buffer);
                    } else {
                        this.state.waveformRenderers[s].ctx.clearRect(0, 0, this.state.waveformRenderers[s].canvas.width, this.state.waveformRenderers[s].canvas.height);
                        this.domCache.getElementById(`fileName-slot${s}`).textContent = '';
                    }
                }
            } catch (error) {
                Logger.error('Failed to stop granular playback:', error);
            }
        }
        
        _sequencerTick() {
            try {
                const slotMode = parseInt(this.domCache.getElementById('slotMode').value);
                let targetSlots = [];

                if (slotMode === 4) {
                    targetSlots = Array.from({ length: this.config.SLOTS }, (_, i) => i);
                } else if (slotMode === 5) {
                    const randomSlot = this._pickRandomLoadedSlot();
                    if (randomSlot !== null) targetSlots.push(randomSlot);
                } else {
                    targetSlots.push(slotMode);
                }

                targetSlots.forEach(s => {
                    if (this.state.audioBuffers[s] &&
                        this.sequencerController.getStep(s, this.state.currentSequencerStep) &&
                        this._isSlotActiveForPlayback(s)) {
                        this._triggerGrainForSlot(s);
                    }
                });

                this._updateStepUI();
                this.state.currentSequencerStep = (this.state.currentSequencerStep + 1) % this.config.SEQUENCER_STEPS;
            } catch (error) {
                Logger.error('Sequencer tick error:', error);
            }
        }

        _triggerGrainForSlot(targetSlot) {
            const buffer = this.state.audioBuffers[targetSlot];
            if (!buffer) return;

            const params = {};
            this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                const elementId = `${spec.id}-slot${targetSlot}`;
                params[spec.id] = this._getKnobValue(elementId);
            });

            const maxGrains = Math.min(params.grainsPerStep, 20);
            const spreadAmount = params.spread / 100;
            
            for (let i = 0; i < maxGrains; i++) {
                const now = this.audioContext.currentTime;
                const lfoTime = now - this.state.lfoStartTime;
                const lfoVal = this._getLFOValue(params.lfoWaveform, params.lfoRate, lfoTime);
                
                const grainDurSec = params.grainSize / 1000;
                let baseStartPosition = (params.startOffset / 100) * buffer.duration;
                baseStartPosition += lfoVal * (buffer.duration - baseStartPosition - grainDurSec);
                
                let positionSec = baseStartPosition;
                if (spreadAmount > 0) {
                    const positionSpread = spreadAmount * buffer.duration * 0.5;
                    const randomOffset = (Math.random() - 0.5) * 2 * positionSpread;
                    positionSec = baseStartPosition + randomOffset;
                }
                
                positionSec = Math.max(0, Math.min(buffer.duration - grainDurSec, positionSec + (Math.random() - 0.5) * 0.05));

                const spreadParams = { ...params };
                
                if (spreadAmount > 0) {
                    const pitchSpreadRange = spreadAmount * 0.5;
                    const pitchVariation = 1 + (Math.random() - 0.5) * 2 * pitchSpreadRange;
                    spreadParams.playbackRate = Math.max(0.1, Math.min(2.0, params.playbackRate * pitchVariation));
                    
                    const panSpreadRange = spreadAmount * 2;
                    const panVariation = (Math.random() - 0.5) * 2 * panSpreadRange;
                    spreadParams.panControl = Math.max(-1, Math.min(1, params.panControl + panVariation));
                }

                if (i % 4 === 0) {
                    this._flashSlot(targetSlot, positionSec);
                }

                let grainStartTime = now;
                if (spreadAmount > 0) {
                    const timingSpread = spreadAmount * 0.02;
                    grainStartTime += (Math.random() - 0.5) * 2 * timingSpread;
                }
                
                this.grainVoiceManager.createGrain(buffer, spreadParams, grainStartTime, grainDurSec, positionSec);
            }
        }
        
        _getLFOValue(waveformType, rate, time) {
            const waveformIndex = parseInt(waveformType);
            switch (waveformIndex) {
                case 0: return (Math.sin(2 * Math.PI * rate * time) + 1) / 2;
                case 1: return 1 - Math.abs(((time * rate) % 2) - 1);
                case 2: return ((time * rate) % 1) < 0.5 ? 0 : 1;
                case 3: return Math.random();
                default: return 0.5;
            }
        }

        _pickRandomLoadedSlot() {
            const available = this.state.audioBuffers
                .map((b, i) => (b && this._isSlotActiveForPlayback(i) ? i : null))
                .filter(i => i !== null);
            if (available.length === 0) return null;
            return available[Math.floor(Math.random() * available.length)];
        }

        _flashSlot(slotIndex, positionSec) {
            const buffer = this.state.audioBuffers[slotIndex];
            if (buffer) {
                this.state.waveformRenderers[slotIndex].drawPlayhead(buffer, positionSec);
            }
        }
        
        _updateStepUI() {
            const currentSteps = this.domCache.querySelectorAll('.step.current', true);
            currentSteps.forEach(step => step.classList.remove('current'));
            
            if (this.state.isPlaying) {
                const newCurrentSteps = this.domCache.querySelectorAll(`.step[data-step='${this.state.currentSequencerStep}']`, true);
                newCurrentSteps.forEach(step => step.classList.add('current'));
            }
        }

        _updateBpmKnob(value) {
            this.state.tempoBpm = Math.max(this.config.MIN_BPM, Math.min(this.config.MAX_BPM, value));
            
            if (this.state.knobDragStates['bpm']) {
                this.state.knobDragStates['bpm'].currentValue = this.state.tempoBpm;
            }
            
            this._updateKnobDisplay('bpm', this.config.BPM_SPEC, this.state.tempoBpm);
            
            if (this.state.isPlaying) {
                this.startGranularPlayback();
            }
        }
        
        _updateRandomDensityKnob(value) {
            let randomDensityValue = Math.max(this.config.MIN_RANDOM_DENSITY, Math.min(this.config.MAX_RANDOM_DENSITY, value));
            randomDensityValue = Math.round(randomDensityValue);
            
            if (this.state.knobDragStates['randomDensity']) {
                this.state.knobDragStates['randomDensity'].currentValue = randomDensityValue;
            }
            
            this._updateKnobDisplay('randomDensity', this.config.RANDOM_DENSITY_SPEC, randomDensityValue);
        }
        
        _updateUndoRedoButtons() {
            this.ui.undoButton.disabled = !this.stateManager.canUndo();
            this.ui.redoButton.disabled = !this.stateManager.canRedo();
        }

        randomizeSequencer() {
            const density = this._getKnobValue('randomDensity');
            this.sequencerController.randomizeSequencer(density);

            // Sync state
            this.state.sequencerPatterns = this.sequencerController.getPatterns();
            this.saveCurrentState();
        }

        randomizeAllSlotParams() {
            let randomizedCount = 0;
            let lockedCount = 0;
            
            for (let s = 0; s < this.config.SLOTS; s++) {
                this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                    const elementId = `${spec.id}-slot${s}`;
                    
                    if (this._isKnobLocked(elementId)) {
                        lockedCount++;
                        return;
                    }
                    
                    if (spec.id === 'volume') {
                        return;
                    }
                    
                    let randomValue;
                    const min = spec.min;
                    const max = spec.max;
                    const step = spec.step || 1;
                    randomValue = Math.random() * (max - min) + min;
                    randomValue = Math.round(randomValue / step) * step;
                    
                    if (this.state.knobDragStates[elementId]) {
                        this.state.knobDragStates[elementId].currentValue = randomValue;
                    }
                    
                    this._updateKnobDisplay(elementId, spec, randomValue);
                    randomizedCount++;
                });
            }
            
            this.saveCurrentState();
        }

        clearAllPan() {
            let clearedCount = 0;
            let lockedCount = 0;
            
            for (let s = 0; s < this.config.SLOTS; s++) {
                const panElementId = `panControl-slot${s}`;
                const panRandomElementId = `panRandom-slot${s}`;
                
                if (!this._isKnobLocked(panElementId)) {
                    if (this.state.knobDragStates[panElementId]) {
                        this.state.knobDragStates[panElementId].currentValue = 0;
                    }
                    
                    const panSpec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'panControl');
                    if (panSpec) {
                        this._updateKnobDisplay(panElementId, panSpec, 0);
                        clearedCount++;
                    }
                } else {
                    lockedCount++;
                }
                
                if (!this._isKnobLocked(panRandomElementId)) {
                    if (this.state.knobDragStates[panRandomElementId]) {
                        this.state.knobDragStates[panRandomElementId].currentValue = 0;
                    }
                    
                    const panRandomSpec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'panRandom');
                    if (panRandomSpec) {
                        this._updateKnobDisplay(panRandomElementId, panRandomSpec, 0);
                        clearedCount++;
                    }
                } else {
                    lockedCount++;
                }
            }
            
            this.saveCurrentState();
        }

        setHpf(frequency) {
            let setCount = 0;
            let lockedCount = 0;
            
            for (let s = 0; s < this.config.SLOTS; s++) {
                const elementId = `cutoffFreq-slot${s}`;
                const spec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'cutoffFreq');
                
                if (spec) {
                    if (this._isKnobLocked(elementId)) {
                        lockedCount++;
                        continue;
                    }
                    
                    const valueToSet = Math.max(spec.min, Math.min(spec.max, frequency));
                    
                    if (this.state.knobDragStates[elementId]) {
                        this.state.knobDragStates[elementId].currentValue = valueToSet;
                    }
                    
                    this._updateKnobDisplay(elementId, spec, valueToSet);
                    setCount++;
                }
            }
            
            this.saveCurrentState();
        }

        setAttackTime(attackTime) {
            let setCount = 0;
            let lockedCount = 0;
            
            for (let s = 0; s < this.config.SLOTS; s++) {
                const elementId = `attackTime-slot${s}`;
                const spec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === 'attackTime');
                
                if (spec) {
                    if (this._isKnobLocked(elementId)) {
                        lockedCount++;
                        continue;
                    }
                    
                    if (this.state.knobDragStates[elementId]) {
                        this.state.knobDragStates[elementId].currentValue = attackTime;
                    }
                    
                    this._updateKnobDisplay(elementId, spec, attackTime);
                    setCount++;
                }
            }
            
            this.saveCurrentState();
        }

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
                        if (this._isKnobLocked(elementId)) {
                            lockedCount++;
                            return;
                        }
                        
                        const clampedValue = Math.max(spec.min, Math.min(spec.max, value));
                        
                        if (this.state.knobDragStates[elementId]) {
                            this.state.knobDragStates[elementId].currentValue = clampedValue;
                        }
                        
                        this._updateKnobDisplay(elementId, spec, clampedValue);
                        setCount++;
                    }
                });
            }
            
            this.saveCurrentState();
        }

        async _loadFolderSamples() {
            this.ui.loadPathButton.disabled = true;
            this.ui.loadPathButton.textContent = 'Loading...';
            this.ui.loadingStatus.textContent = 'Loading';
            this.ui.loadingStatus.classList.add('loading-dots');

            try {
                if (!window.showDirectoryPicker) {
                    alert("File System Access API not supported");
                    return;
                }

                const dirHandle = await window.showDirectoryPicker();
                let allFileHandles = await this._getAllAudioFilesRecursive(dirHandle);

                const filterString = this.domCache.getElementById('loadPathInput').value.toLowerCase().trim();
                if (filterString) {
                    allFileHandles = allFileHandles.filter(handle => handle.name.toLowerCase().includes(filterString));
                }

                if (allFileHandles.length === 0) {
                    alert("No matching audio files found");
                    return;
                }
                
                for (let s = 0; s < this.config.SLOTS; s++) {
                    this.state.audioBuffers[s] = null;
                    this.state.waveformRenderers[s].invalidateCache();
                    this.state.waveformRenderers[s].ctx.clearRect(0, 0, this.config.WAVEFORM_CANVAS_WIDTH, this.config.WAVEFORM_CANVAS_HEIGHT);
                    this.domCache.getElementById(`fileName-slot${s}`).textContent = '';
                }

                for (let i = allFileHandles.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allFileHandles[i], allFileHandles[j]] = [allFileHandles[j], allFileHandles[i]];
                }

                const loadPromises = allFileHandles.slice(0, this.config.SLOTS).map((fileHandle, index) =>
                    this._processAndLoadFile(fileHandle, index)
                );
                
                await Promise.all(loadPromises);
                
                const loadedCount = this.state.audioBuffers.filter(b => b).length;
                this.ui.loadingStatus.textContent = `${loadedCount}/${this.config.SLOTS} loaded`;
                this.saveCurrentState();

            } catch (err) {
                Logger.error("Load error:", err);
                this.ui.loadingStatus.textContent = 'Error!';
            } finally {
                this.ui.loadPathButton.disabled = false;
                this.ui.loadPathButton.textContent = 'Load';
                this.ui.loadingStatus.classList.remove('loading-dots');
            }
        }

        async _getAllAudioFilesRecursive(dirHandle, files = []) {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && (entry.name.toLowerCase().endsWith('.wav') || entry.name.toLowerCase().endsWith('.mp3'))) {
                    files.push(entry);
                } else if (entry.kind === 'directory') {
                    await this._getAllAudioFilesRecursive(entry, files);
                }
            }
            return files;
        }

        async _processAndLoadFile(fileHandle, slotIndex) {
            try {
                const file = await fileHandle.getFile();
                if (!file) {
                    throw new Error('Failed to get file');
                }

                // Load file with validation and error handling
                let decodedData = await loadAudioFile(file, this.audioContext);

                // Trim silence
                const trimmedBuffer = trimSilence(decodedData, this.audioContext, 0.01);

                // Normalize audio
                const data = trimmedBuffer.getChannelData(0);
                const max = data.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
                if (max > 0) {
                    for (let i = 0; i < data.length; i++) {
                        data[i] /= max;
                    }
                }

                // Store buffer and update UI
                this.state.audioBuffers[slotIndex] = trimmedBuffer;
                this.state.waveformRenderers[slotIndex].drawWaveform(trimmedBuffer);
                this.domCache.getElementById(`fileName-slot${slotIndex}`).textContent = file.name;

                Logger.log(`✅ Slot ${slotIndex}: ${file.name} processed successfully`);
            } catch (error) {
                Logger.error(`❌ Error processing ${fileHandle.name}:`, error);

                // Cleanup on error
                if (this.state.audioBuffers[slotIndex]) {
                    this.state.audioBuffers[slotIndex] = null;
                }

                const fileNameElement = this.domCache.getElementById(`fileName-slot${slotIndex}`);
                if (fileNameElement) {
                    fileNameElement.textContent = 'Error!';
                }
            }
        }

        _getControlState() {
            const collapsedStates = {};
            
            if (!this.state.isFreeLayoutMode) {
                this.domCache.querySelectorAll('.panel-group', true).forEach(panel => {
                    const content = panel.querySelector('[id$="-content"]');
                    if (content) {
                        collapsedStates[panel.id] = content.classList.contains('collapsed-content');
                    }
                });
            }
            
            return {
                globalControls: { slotMode: this.domCache.getElementById('slotMode').value },
                perSlotControls: Array.from({ length: this.config.SLOTS }, (_, s) => {
                    const slotState = {};
                    this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                        const elementId = `${spec.id}-slot${s}`;
                        slotState[spec.id] = this._getKnobValue(elementId);
                    });
                    return slotState;
                }),
                sequencerPatterns: deepClone(this.state.sequencerPatterns),
                slotSoloStatus: deepClone(this.state.slotSoloStatus),
                slotMuteStatus: deepClone(this.state.slotMuteStatus),
                tempoBpm: this.state.tempoBpm,
                randomDensity: this._getKnobValue('randomDensity'),
                knobLockStates: deepClone(this.state.knobLockStates),
                collapsedStates: collapsedStates
            };
        }

        _applyState(state) {
            this.domCache.getElementById('slotMode').value = state.globalControls.slotMode;
            
            state.perSlotControls.forEach((slotState, s) => {
                for (const id in slotState) {
                    const elementId = `${id}-slot${s}`;
                    const spec = this.config.PER_SLOT_CONTROL_SPECS.find(spec => spec.id === id);
                    
                    if (spec && this.state.knobDragStates[elementId]) {
                        this.state.knobDragStates[elementId].currentValue = slotState[id];
                        this._updateKnobDisplay(elementId, spec, slotState[id]);
                    }
                }
            });

            // Delegate to SequencerController
            this.sequencerController.initializePatterns(state.sequencerPatterns);
            this.state.sequencerPatterns = this.sequencerController.getPatterns();

            // Update DOM for all sequencer steps
            this.state.sequencerPatterns.forEach((pattern, slot) => {
                pattern.forEach((isActive, step) => {
                    this.sequencerController.setStep(slot, step, isActive);
                });
            });

            this.state.slotSoloStatus = deepClone(state.slotSoloStatus);
            this.state.slotMuteStatus = deepClone(state.slotMuteStatus);

            if (state.knobLockStates) {
                this.state.knobLockStates = deepClone(state.knobLockStates);
                
                Object.entries(this.state.knobLockStates).forEach(([elementId, isLocked]) => {
                    const knobElement = this.domCache.getElementById(`${elementId}Knob`, true);
                    if (knobElement) {
                        if (isLocked) {
                            knobElement.classList.add('locked');
                        } else {
                            knobElement.classList.remove('locked');
                        }
                        knobElement.style.cursor = 'grab';
                    }
                });
            }
            
            this._updateAllSlotControlButtons();
            
            if (!this.state.isFreeLayoutMode && state.collapsedStates) {
                Object.entries(state.collapsedStates).forEach(([panelId, isCollapsed]) => {
                    const panel = this.domCache.getElementById(panelId, true);
                    if (panel) {
                        const content = panel.querySelector('[id$="-content"]');
                        const indicator = panel.querySelector('.indicator');
                        if (content && indicator) {
                            content.classList.toggle('collapsed-content', isCollapsed);
                            indicator.textContent = isCollapsed ? '+' : '-';
                        }
                    }
                });
            }
            
            this._updateRandomDensityKnob(state.randomDensity);
            this._updateBpmKnob(state.tempoBpm);
            this._updateUndoRedoButtons();
        }

        saveCurrentState() {
            const currentState = this._getControlState();
            this.stateManager.saveState(currentState);
            this._updateUndoRedoButtons();
        }

        undo() {
            const previousState = this.stateManager.undo();
            if (previousState) {
                this._applyState(previousState);
            }
        }

        redo() {
            const nextState = this.stateManager.redo();
            if (nextState) {
                this._applyState(nextState);
            }
        }

        /**
         * Clean up all resources
         */
        destroy() {
            try {
                Logger.log('Destroying OptimizedMultigrainPlayer...');

                // Stop playback
                if (this.state.isPlaying) {
                    this.stopGranularPlayback();
                }

                // Stop auto-scaling
                this._stopAutoScaling();

                // Stop LED meter loop
                this._stopLEDMeterLoop();

                // Clean up audio resources
                if (this.grainVoiceManager) {
                    this.grainVoiceManager.destroy();
                }

                // Clean up performance monitor
                if (this.performanceMonitor) {
                    this.performanceMonitor.destroy();
                }

                // Clean up waveform renderers
                if (this.state.waveformRenderers) {
                    this.state.waveformRenderers.forEach(renderer => {
                        if (renderer && typeof renderer.destroy === 'function') {
                            renderer.destroy();
                        }
                    });
                    this.state.waveformRenderers = [];
                }

                // Clean up spectrum analyzer
                if (this.spectrumAnalyzer) {
                    this.spectrumAnalyzer.destroy();
                    this.spectrumAnalyzer = null;
                }

                // Close audio context
                if (this.audioContext && this.audioContext.state !== 'closed') {
                    this.audioContext.close().catch(err => {
                        Logger.error('Error closing AudioContext:', err);
                    });
                }

                // Clean up all managed resources (event listeners, timers)
                if (this.resourceManager) {
                    this.resourceManager.destroy();
                }

                Logger.log('OptimizedMultigrainPlayer destroyed successfully');
            } catch (error) {
                Logger.error('Error during OptimizedMultigrainPlayer destruction:', error);
            }
        }

        /**
         * Prefetch frequently accessed DOM elements into cache
         * @private
         */
        _prefetchDOMElements() {
            const elementsToCache = {
                // Main containers
                controls: { type: 'id', value: 'controls' },
                ctrlSection: { type: 'id', value: 'ctrlSection' },
                outputSection: { type: 'id', value: 'outputSection' },
                sequencers: { type: 'id', value: 'sequencers' },
                utilSectionContainer: { type: 'id', value: 'utilSectionContainer' },

                // Layout
                layoutContainer: { type: 'id', value: 'layoutContainer' },
                layoutToggle: { type: 'id', value: 'layoutToggle' },
                autoArrangeBtn: { type: 'id', value: 'autoArrangeBtn' },

                // Control buttons
                startGranular: { type: 'id', value: 'startGranular' },
                stopGranular: { type: 'id', value: 'stopGranular' },
                randomizeSequencer: { type: 'id', value: 'randomizeSequencer' },
                randomizeAllSlotParams: { type: 'id', value: 'randomizeAllSlotParams' },
                clearPanButton: { type: 'id', value: 'clearPanButton' },
                resetHpfButton: { type: 'id', value: 'resetHpfButton' },
                setHpf130Button: { type: 'id', value: 'setHpf130Button' },
                setHpf900Button: { type: 'id', value: 'setHpf900Button' },
                setAtk0Button: { type: 'id', value: 'setAtk0Button' },
                percButton: { type: 'id', value: 'percButton' },
                unlockAllKnobsButton: { type: 'id', value: 'unlockAllKnobsButton' },
                undoButton: { type: 'id', value: 'undoButton' },
                redoButton: { type: 'id', value: 'redoButton' },
                loadingStatus: { type: 'id', value: 'loadingStatus' },
                loadPathButton: { type: 'id', value: 'loadPathButton' },
                loadPathInput: { type: 'id', value: 'loadPathInput' },
                togglePerfMonitor: { type: 'id', value: 'togglePerfMonitor' },

                // Knobs
                bpmKnob: { type: 'id', value: 'bpmKnob' },
                randomDensityKnob: { type: 'id', value: 'randomDensityKnob' },

                // Spectrum analyzer
                spectrumInfo: { type: 'id', value: 'spectrumInfo' },
                winampDisplay: { type: 'id', value: 'winampDisplay' },

                // Sequencer
                sequencerContent: { type: 'id', value: 'sequencer-content' },
                slotMatrix: { type: 'id', value: 'slotMatrix' },

                // Controls
                slotMode: { type: 'id', value: 'slotMode' },

                // Panels
                modeSection: { type: 'id', value: 'mode-section' },

                // Slot-specific elements (prefetch for all slots)
                ...Object.fromEntries(
                    Array.from({ length: this.config.SLOTS }, (_, i) => [
                        `fileName-slot${i}`,
                        { type: 'id', value: `fileName-slot${i}` }
                    ])
                ),
                ...Object.fromEntries(
                    Array.from({ length: this.config.SLOTS }, (_, i) => [
                        `hiddenFileInput-slot${i}`,
                        { type: 'id', value: `hiddenFileInput-slot${i}` }
                    ])
                ),
                ...Object.fromEntries(
                    Array.from({ length: this.config.SLOTS }, (_, i) => [
                        `waveform-${i}`,
                        { type: 'id', value: `waveform-${i}` }
                    ])
                ),
                ...Object.fromEntries(
                    Array.from({ length: this.config.SLOTS }, (_, i) => [
                        `soloBtn-${i}`,
                        { type: 'id', value: `soloBtn-${i}` }
                    ])
                ),
                ...Object.fromEntries(
                    Array.from({ length: this.config.SLOTS }, (_, i) => [
                        `muteBtn-${i}`,
                        { type: 'id', value: `muteBtn-${i}` }
                    ])
                )
            };

            this.domCache.prefetch(elementsToCache);
            Logger.log(`✅ Prefetched ${Object.keys(elementsToCache).length} DOM elements`);
        }
    }
