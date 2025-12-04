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
import { generateRandomValue, throttle } from './utils/mathUtils.js';
import { calculateNormalizedSensitivity } from './utils/knobUtils.js';
import { DOMCache } from './utils/DOMCache.js';
import { StateManager } from './utils/StateManager.js';
import { SequencerController } from './controllers/SequencerController.js';
import { LayoutManager } from './controllers/LayoutManager.js';
import { ParameterController } from './controllers/ParameterController.js';
import { KeyboardController } from './controllers/KeyboardController.js';
import { FileLoaderController } from './controllers/FileLoaderController.js';

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
    MAX_SECTION_SIZE_RATIO: 0.9, // Max section size as ratio of viewport
    
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
                this.parameterController = null; // Initialize after config
                this.keyboardController = null; // Initialize after config
                this.fileLoaderController = null; // Initialize after config
            
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

                // Initialize ParameterController
                this.parameterController = new ParameterController(
                    this.config,
                    this.domCache,
                    this.resourceManager,
                    this.state.knobDragStates,
                    this.state.knobLockStates,
                    {
                        updateKnobDisplay: this._updateKnobDisplay.bind(this),
                        saveCurrentState: this.saveCurrentState.bind(this),
                        randomizeSequencer: () => {
                            const density = this.parameterController.getKnobValue('randomDensity');
                            this.sequencerController.randomizeSequencer(density);
                        }
                    }
                );

                // Initialize KeyboardController
                this.keyboardController = new KeyboardController(
                    this.config,
                    this.domCache,
                    this.resourceManager,
                    this.state,
                    {
                        undo: this.undo.bind(this),
                        redo: this.redo.bind(this),
                        loadFolderSamples: () => this.fileLoaderController.loadFolderSamples(this.ui),
                        startGranularPlayback: this.startGranularPlayback.bind(this),
                        stopGranularPlayback: this.stopGranularPlayback.bind(this),
                        stopAllGrains: this.stopAllGrains.bind(this),
                        toggleSequencerStep: this._toggleSequencerStep.bind(this),
                        setSequencerStep: this._setSequencerStep.bind(this),
                        updateAllSlotControlButtons: this._updateAllSlotControlButtons.bind(this),
                        updateSlotControlButtons: this._updateSlotControlButtons.bind(this),
                        saveCurrentState: this.saveCurrentState.bind(this)
                    }
                );

                // Initialize FileLoaderController
                this.fileLoaderController = new FileLoaderController(
                    this.config,
                    this.domCache,
                    this.audioContext,
                    this.state,
                    {
                        saveCurrentState: this.saveCurrentState.bind(this),
                        showErrorNotification: this._showErrorNotification.bind(this),
                        updateUI: () => {} // Can be extended if needed
                    }
                );

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
                        this.parameterController.bindKnobEvents(spec.id, spec, null);
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
                            this.parameterController.bindKnobEvents(elementId, spec, slot);
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
            this.resourceManager.addEventListener(this.ui.clearPanButton, 'click', () => this.parameterController.clearPan());
            this.resourceManager.addEventListener(this.ui.resetHpfButton, 'click', () => this.parameterController.setHpf(0));
            this.resourceManager.addEventListener(this.ui.setHpf130Button, 'click', () => this.parameterController.setHpf(130));
            this.resourceManager.addEventListener(this.ui.setHpf900Button, 'click', () => this.parameterController.setHpf(900));
            this.resourceManager.addEventListener(this.ui.setAtk0Button, 'click', () => this.parameterController.setAttackTime(3));
            this.resourceManager.addEventListener(this.ui.percButton, 'click', () => this.parameterController.setPercussivePreset());
            this.resourceManager.addEventListener(this.ui.unlockAllKnobsButton, 'click', () => this.parameterController.unlockAllKnobs());
            this.resourceManager.addEventListener(this.ui.undoButton, 'click', () => this.undo());
            this.resourceManager.addEventListener(this.ui.redoButton, 'click', () => this.redo());
            this.resourceManager.addEventListener(this.ui.loadPathButton, 'click', () => this.fileLoaderController.loadFolderSamples(this.ui));
            this.resourceManager.addEventListener(this.ui.togglePerfMonitor, 'click', () => {
                this._safeExecute(() => this.performanceMonitor.toggle(), 'Performance Monitor toggle');
            });

            // パラメータ別のランダマイズボタンのイベントリスナー
            this.resourceManager.addEventListener(document, 'click', (e) => {
                if (e.target.classList.contains('param-random-btn')) {
                    const paramId = e.target.dataset.param;
                    this.parameterController.randomizeParameter(paramId);
                }

                if (e.target.classList.contains('param-reset-btn')) {
                    const paramId = e.target.dataset.param;
                    this.parameterController.resetParameter(paramId);
                }

                if (e.target.classList.contains('param-lock-btn')) {
                    const paramId = e.target.dataset.param;
                    this.parameterController.toggleParameterLock(paramId);
                }
            });

            for (let s = 0; s < this.config.SLOTS; s++) {
                const fileInput = this.domCache.getElementById(`hiddenFileInput-slot${s}`);
                this.resourceManager.addEventListener(fileInput, 'change', async (e) => {
                    const slot = parseInt(e.target.dataset.slot);
                    const file = e.target.files[0];
                    if (!file) return;
                    await this.fileLoaderController.handleFileLoad(file, slot);
                    e.target.value = ''; // Clear the input
                });

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

            this.parameterController.bindKnobEvents('bpm', this.config.BPM_SPEC, null);
            this.parameterController.bindKnobEvents('randomDensity', this.config.RANDOM_DENSITY_SPEC, null);

            this.keyboardController.bindKeyboardShortcuts();
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
            const margin = CONSTANTS.LAYOUT_MARGIN;
            const headerHeight = CONSTANTS.LAYOUT_HEADER_HEIGHT;
            
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
            const searchRadius = CONSTANTS.LAYOUT_SEARCH_RADIUS;
            const step = CONSTANTS.LAYOUT_SEARCH_STEP;
            
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
            let fallbackX = Math.min(maxX, clampedX + CONSTANTS.LAYOUT_FALLBACK_OFFSET);
            let fallbackY = Math.min(maxY, clampedY + CONSTANTS.LAYOUT_FALLBACK_OFFSET);

            // それでも重複する場合は下にずらす
            while (fallbackY <= maxY && this._hasOverlap(fallbackX, fallbackY, width, height, occupiedAreas)) {
                fallbackY += CONSTANTS.LAYOUT_SEARCH_STEP * 2;
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
            const buffer = CONSTANTS.LAYOUT_OVERLAP_BUFFER;
            
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

            // Throttle resize events to improve performance (max once per 150ms)
            this._resizeListener = throttle(() => {
                if (this.state.isFreeLayoutMode && this.state.autoScalingActive) {
                    this._adjustSectionsToViewport();

                    if (this.spectrumAnalyzer) {
                        this.resourceManager.setTimeout(() => {
                            this.spectrumAnalyzer.setupCanvas();
                        }, 100);
                    }
                }
            }, 150);

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
                const currentWidth = parseInt(section.style.width) || CONSTANTS.LAYOUT_DEFAULT_WIDTH;
                const currentHeight = parseInt(section.style.height) || CONSTANTS.LAYOUT_MIN_PANEL_HEIGHT;
                
                let newLeft = currentLeft;
                let newTop = currentTop;
                let newWidth = currentWidth;
                let newHeight = currentHeight;
                let scale = 1;

                if (currentLeft + currentWidth > viewportWidth - CONSTANTS.VIEWPORT_EDGE_MARGIN) {
                    const maxWidth = viewportWidth - currentLeft - CONSTANTS.VIEWPORT_EDGE_MARGIN;
                    if (maxWidth > CONSTANTS.LAYOUT_MIN_PANEL_WIDTH) {
                        newWidth = maxWidth;
                    } else {
                        newLeft = Math.max(CONSTANTS.VIEWPORT_MIN_MARGIN, viewportWidth - currentWidth - CONSTANTS.VIEWPORT_EDGE_MARGIN);
                        if (newLeft < CONSTANTS.VIEWPORT_MIN_MARGIN) {
                            newLeft = CONSTANTS.VIEWPORT_MIN_MARGIN;
                            newWidth = viewportWidth - CONSTANTS.VIEWPORT_MIN_HEIGHT_MARGIN;
                        }
                    }
                }

                if (currentTop + currentHeight > viewportHeight - CONSTANTS.VIEWPORT_EDGE_MARGIN) {
                    const maxHeight = viewportHeight - currentTop - CONSTANTS.VIEWPORT_EDGE_MARGIN;
                    if (maxHeight > CONSTANTS.LAYOUT_MIN_PANEL_HEIGHT) {
                        newHeight = maxHeight;
                    } else {
                        newTop = Math.max(CONSTANTS.VIEWPORT_MIN_MARGIN, viewportHeight - currentHeight - CONSTANTS.VIEWPORT_EDGE_MARGIN);
                        if (newTop < CONSTANTS.VIEWPORT_MIN_MARGIN) {
                            newTop = CONSTANTS.VIEWPORT_MIN_MARGIN;
                            newHeight = viewportHeight - CONSTANTS.VIEWPORT_MIN_HEIGHT_MARGIN;
                        }
                    }
                }

                const minScale = CONSTANTS.MIN_SECTION_SCALE;
                const maxSectionWidth = viewportWidth * CONSTANTS.MAX_SECTION_SIZE_RATIO;
                const maxSectionHeight = viewportHeight * CONSTANTS.MAX_SECTION_SIZE_RATIO;
                
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

        _handleStepClick(cell) {
            const slot = +cell.dataset.slot;
            const step = +cell.dataset.step;

            // Delegate to SequencerController
            this.sequencerController.toggleStep(slot, step);

            // Sync state
            this.state.sequencerPatterns = this.sequencerController.getPatterns();
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
                const volumeValue = this.parameterController.getKnobValue(volumeElementId) || 0.7;
                
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
                params[spec.id] = this.parameterController.getKnobValue(elementId);
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
            const density = this.parameterController.getKnobValue('randomDensity');
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
                    
                    if (this.parameterController.isKnobLocked(elementId)) {
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
                        slotState[spec.id] = this.parameterController.getKnobValue(elementId);
                    });
                    return slotState;
                }),
                sequencerPatterns: deepClone(this.state.sequencerPatterns),
                slotSoloStatus: deepClone(this.state.slotSoloStatus),
                slotMuteStatus: deepClone(this.state.slotMuteStatus),
                tempoBpm: this.state.tempoBpm,
                randomDensity: this.parameterController.getKnobValue('randomDensity'),
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

        /**
         * Show user-friendly error notification
         * @param {string} title - Error title
         * @param {string} message - Error message
         * @param {Error} error - Original error object (optional)
         */
        _showErrorNotification(title, message, error = null) {
            const fullMessage = error ? `${message}\n\n詳細: ${error.message}` : message;
            alert(`❌ ${title}\n\n${fullMessage}`);

            if (error) {
                Logger.error(`${title}:`, error);
            } else {
                Logger.error(`${title}: ${message}`);
            }
        }

        /**
         * Safe execution wrapper with error handling
         * @param {Function} fn - Function to execute
         * @param {string} context - Context description for error messages
         * @returns {boolean} Success status
         */
        _safeExecute(fn, context) {
            try {
                fn();
                return true;
            } catch (error) {
                Logger.error(`Error in ${context}:`, error);
                return false;
            }
        }
    }
