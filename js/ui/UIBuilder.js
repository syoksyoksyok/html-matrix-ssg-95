/**
 * UIBuilder
 * Handles UI construction and DOM element creation
 * Separates UI building logic from main application logic
 */

import { Logger } from '../utils/logger.js';
import { OptimizedWaveformRenderer } from './OptimizedWaveformRenderer.js';

export class UIBuilder {
    constructor(config, domCache, resourceManager) {
        this.config = config;
        this.domCache = domCache;
        this.resourceManager = resourceManager;

        // Store waveform renderers (will be accessed by main player)
        this.waveformRenderers = [];

        Logger.log('✅ UIBuilder initialized');
    }

    /**
     * Create all UI sections
     * @param {Object} callbacks - Callback functions for event handling
     */
    createAllUI(callbacks) {
        this.callbacks = callbacks;

        this.createControls();
        this.createUtilSection();
        this.createCtrlSection();
        this.createSequencer();
        this.createOutputSection();
        this.setupCollapsibleHeaders();

        Logger.log('✅ UI creation complete');
    }

    /**
     * Create CONTROLS section
     */
    createControls() {
        const controlsContainer = this.domCache.getElementById('controls');

        const modeGroup = this.createPanelGroup('MODE:', 'mode-content');
        this.config.GLOBAL_CONTROL_SPECS.forEach(spec => {
            modeGroup.content.appendChild(this.createControlElement(spec));
        });
        controlsContainer.appendChild(modeGroup.group);

        modeGroup.content.classList.add('collapsed-content');
        const indicator = modeGroup.title.querySelector('.indicator');
        if (indicator) {
            indicator.textContent = '+';
        }

        const mainGroup = this.createPanelGroup('MAIN:', 'main-content');
        const waveformDisplayContainer = document.createElement('div');
        waveformDisplayContainer.className = 'waveform-display-container';

        for (let s = 0; s < this.config.SLOTS; s++) {
            const canvas = document.createElement('canvas');
            canvas.id = `waveform-${s}`;
            canvas.width = this.config.WAVEFORM_CANVAS_WIDTH;
            canvas.height = this.config.WAVEFORM_CANVAS_HEIGHT;
            canvas.className = 'waveform-canvas';
            waveformDisplayContainer.appendChild(canvas);

            this.waveformRenderers.push(new OptimizedWaveformRenderer(canvas));
        }
        mainGroup.content.appendChild(waveformDisplayContainer);
        controlsContainer.appendChild(mainGroup.group);
    }

    /**
     * Create CTRL section (slot matrix)
     */
    createCtrlSection() {
        const ctrlContainer = this.domCache.getElementById('ctrlSection');
        const ctrlGroup = this.createPanelGroup('CTRL:', 'ctrl-content');

        const slotMatrixContainer = this.createSlotMatrix(ctrlGroup.content);
        ctrlGroup.content.appendChild(slotMatrixContainer);

        ctrlContainer.appendChild(ctrlGroup.group);
    }

    /**
     * Create OUTPUT section
     */
    createOutputSection() {
        const outputContainer = this.domCache.getElementById('outputSection');
        const outputGroup = this.createPanelGroup('OUTPUT:', 'output-content');

        const winampDisplay = document.createElement('div');
        winampDisplay.className = 'winamp-display';
        winampDisplay.id = 'winampDisplay';
        winampDisplay.textContent = 'MULTIGRAIN SPECTRUM ANALYZER v2.1 - ENHANCED RANDOM CONTROLS';
        outputGroup.content.appendChild(winampDisplay);

        const spectrumInfo = document.createElement('div');
        spectrumInfo.className = 'spectrum-info';
        spectrumInfo.id = 'spectrumInfo';
        spectrumInfo.textContent = 'PEAK: --- | RMS: ---%';
        outputGroup.content.appendChild(spectrumInfo);

        const modeBtnContainer = document.createElement('div');
        modeBtnContainer.className = 'spectrum-mode-buttons';

        const modes = ['Bars', 'Line', 'WinAMP'];
        modes.forEach((mode, index) => {
            const btn = document.createElement('button');
            btn.className = `spectrum-mode-btn ${index === 2 ? 'active' : ''}`;
            btn.dataset.mode = index;
            btn.textContent = mode;
            modeBtnContainer.appendChild(btn);
        });

        outputGroup.content.appendChild(modeBtnContainer);

        const spectrumCanvas = document.createElement('canvas');
        spectrumCanvas.id = 'spectrumCanvas';
        spectrumCanvas.width = 512;
        spectrumCanvas.height = 200;
        spectrumCanvas.className = 'spectrum-canvas';
        outputGroup.content.appendChild(spectrumCanvas);

        const ledContainer = document.createElement('div');
        ledContainer.className = 'led-meter-container';
        ledContainer.innerHTML = `
            <div class="led-channel">
                <label>L</label>
                <div class="led-meter" id="ledMeterLeft">
                    ${Array(12).fill(0).map((_, i) =>
                        `<div class="led-segment led-${i < 8 ? 'green' : i < 10 ? 'yellow' : 'red'}"></div>`
                    ).join('')}
                </div>
            </div>
            <div class="led-channel">
                <label>R</label>
                <div class="led-meter" id="ledMeterRight">
                    ${Array(12).fill(0).map((_, i) =>
                        `<div class="led-segment led-${i < 8 ? 'green' : i < 10 ? 'yellow' : 'red'}"></div>`
                    ).join('')}
                </div>
            </div>
        `;
        outputGroup.content.appendChild(ledContainer);

        outputContainer.appendChild(outputGroup.group);
    }

    /**
     * Create slot matrix with file inputs and controls
     * @param {HTMLElement} container - Parent container
     * @returns {HTMLElement} Slot matrix container
     */
    createSlotMatrix(container) {
        const slotMatrixContainer = document.createElement('div');
        slotMatrixContainer.id = 'slotMatrix';
        slotMatrixContainer.className = 'slot-matrix';

        for (let slot = 0; slot < this.config.SLOTS; slot++) {
            const slotBlock = document.createElement('div');
            slotBlock.className = 'slot-block';

            const slotHeader = document.createElement('div');
            slotHeader.className = 'slot-header';
            slotHeader.innerHTML = `
                <span class="slot-label">SLOT ${slot + 1}</span>
                <button class="solo-btn" id="soloBtn-${slot}">S</button>
                <button class="mute-btn" id="muteBtn-${slot}">M</button>
                <span class="file-name" id="fileName-slot${slot}">No file loaded</span>
            `;
            slotBlock.appendChild(slotHeader);

            const hiddenFileInput = document.createElement('input');
            hiddenFileInput.type = 'file';
            hiddenFileInput.accept = 'audio/*';
            hiddenFileInput.id = `hiddenFileInput-slot${slot}`;
            hiddenFileInput.style.display = 'none';
            slotBlock.appendChild(hiddenFileInput);

            const paramControlsContainer = document.createElement('div');
            paramControlsContainer.className = 'param-controls-container';

            this.config.PER_SLOT_CONTROL_SPECS.forEach(spec => {
                const paramGroup = document.createElement('div');
                paramGroup.className = 'param-group';

                const controlElement = this.createControlElement(spec, slot);
                paramGroup.appendChild(controlElement);

                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'param-button-group';

                const randomBtn = document.createElement('button');
                randomBtn.className = 'param-random-btn';
                randomBtn.dataset.param = spec.id;
                randomBtn.dataset.slot = slot;
                randomBtn.textContent = '?';
                randomBtn.title = `Randomize ${spec.label}`;
                buttonGroup.appendChild(randomBtn);

                const resetBtn = document.createElement('button');
                resetBtn.className = 'param-reset-btn';
                resetBtn.dataset.param = spec.id;
                resetBtn.dataset.slot = slot;
                resetBtn.textContent = '↺';
                resetBtn.title = `Reset ${spec.label}`;
                buttonGroup.appendChild(resetBtn);

                const lockBtn = document.createElement('button');
                lockBtn.className = 'param-lock-btn';
                lockBtn.dataset.param = spec.id;
                lockBtn.dataset.slot = slot;
                lockBtn.textContent = '🔓';
                lockBtn.title = `Lock ${spec.label}`;
                buttonGroup.appendChild(lockBtn);

                paramGroup.appendChild(buttonGroup);
                paramControlsContainer.appendChild(paramGroup);
            });

            slotBlock.appendChild(paramControlsContainer);
            slotMatrixContainer.appendChild(slotBlock);
        }

        return slotMatrixContainer;
    }

    /**
     * Create SEQUENCER section
     */
    createSequencer() {
        const sequencerDiv = this.domCache.getElementById("sequencers");
        const seqGroup = this.createPanelGroup('SEQ (TRG):', 'sequencer-content');

        for (let s = 0; s < this.config.SLOTS; s++) {
            const row = document.createElement("div");
            row.className = "seq-row";

            const rowLabel = document.createElement("span");
            rowLabel.className = "seq-row-label";
            rowLabel.textContent = `S${s + 1}`;
            row.appendChild(rowLabel);

            for (let step = 0; step < this.config.SEQUENCER_STEPS; step++) {
                const stepDiv = document.createElement("div");
                stepDiv.className = "step active";
                stepDiv.dataset.slot = s;
                stepDiv.dataset.step = step;
                row.appendChild(stepDiv);
            }
            seqGroup.content.appendChild(row);
        }

        sequencerDiv.appendChild(seqGroup.group);
    }

    /**
     * Create UTIL section
     */
    createUtilSection() {
        const container = this.domCache.getElementById('utilSectionContainer');
        const utilGroup = this.createPanelGroup('UTIL:', 'util-content');

        utilGroup.content.innerHTML = `
            <div class="load-input-group">
                <input type="text" id="loadPathInput" placeholder="Filter pattern (optional)" />
                <button id="loadPathButton" class="styled-button">LOAD PATH</button>
            </div>
            <div class="util-button-group">
                <button id="startGranular" class="styled-button">START</button>
                <button id="stopGranular" class="styled-button">STOP</button>
                <button id="randomizeSequencer" class="styled-button">RANDOM SEQ</button>
                <button id="randomizeAllSlotParams" class="styled-button">RANDOM ALL</button>
                <button id="clearPanButton" class="styled-button">CLEAR PAN</button>
                <button id="resetHpfButton" class="styled-button">HPF OFF</button>
                <button id="setHpf130Button" class="styled-button">HPF 130Hz</button>
                <button id="setHpf900Button" class="styled-button">HPF 900Hz</button>
                <button id="setAtk0Button" class="styled-button">ATK 0</button>
                <button id="percButton" class="styled-button">PERC</button>
                <button id="unlockAllKnobsButton" class="styled-button">UNLOCK ALL</button>
                <button id="undoButton" class="styled-button" disabled>UNDO</button>
                <button id="redoButton" class="styled-button" disabled>REDO</button>
                <button id="togglePerfMonitor" class="styled-button">PERF</button>
            </div>
            <div id="loadingStatus" class="loading-status"></div>
        `;

        container.appendChild(utilGroup.group);
    }

    /**
     * Create a panel group with title and content
     * @param {string} titleText - Title text
     * @param {string} contentId - Content element ID
     * @returns {Object} - {group, title, content}
     */
    createPanelGroup(titleText, contentId) {
        const group = document.createElement("div");
        group.className = "panel-group";

        const sectionId = titleText.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '-section';
        group.id = sectionId;

        const title = document.createElement("h3");
        title.className = "group-title collapsible-header";
        title.innerHTML = `${titleText}<span class="indicator">-</span>`;
        const content = document.createElement('div');
        content.id = contentId;
        group.appendChild(title);
        group.appendChild(content);
        return { group, title, content };
    }

    /**
     * Create a control element (knob, select, etc.)
     * @param {Object} spec - Control specification
     * @param {number|null} slotIndex - Slot index (null for global controls)
     * @returns {HTMLElement} Control element
     */
    createControlElement(spec, slotIndex = null) {
        const elementId = slotIndex !== null ? `${spec.id}-slot${slotIndex}` : spec.id;

        switch (spec.type) {
            case 'select':
                const label = document.createElement('label');
                label.textContent = spec.label;

                const inputElement = document.createElement('select');
                spec.options.forEach((opt, i) => {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = opt;
                    if (spec.selected === i) option.selected = true;
                    inputElement.appendChild(option);
                });

                if (this.callbacks && this.callbacks.onControlChange) {
                    this.resourceManager.addEventListener(inputElement, 'change',
                        () => this.callbacks.onControlChange());
                }

                inputElement.id = elementId;
                inputElement.className = 'form-element';
                label.appendChild(inputElement);
                return label;

            case 'knob':
                const knobContainer = document.createElement('div');
                knobContainer.className = 'knob-container matrix-knob';

                let tooltipAttr = '';
                if (spec.tooltip) {
                    tooltipAttr = `title="${spec.tooltip}"`;
                }

                knobContainer.innerHTML = `
                    <div class="knob" id="${elementId}Knob" ${tooltipAttr}>
                        <div class="knob-face">
                            <div class="knob-indicator" id="${elementId}Indicator"></div>
                            <div class="knob-center"></div>
                        </div>
                    </div>
                    <div id="${elementId}ValueDisplay" class="knob-value-display">${this.formatKnobValue(spec, spec.value)}</div>`;

                // Knob events will be bound by the main player after UI creation
                return knobContainer;

            default:
                const defaultLabel = document.createElement('label');
                defaultLabel.textContent = spec.label;

                const defaultInput = document.createElement('input');
                defaultInput.type = 'range';
                Object.assign(defaultInput, { min: spec.min, max: spec.max, step: spec.step || 1, value: spec.value });
                defaultInput.id = elementId;
                defaultInput.className = 'form-element';
                defaultLabel.appendChild(defaultInput);
                return defaultLabel;
        }
    }

    /**
     * Format knob value for display
     * @param {Object} spec - Control specification
     * @param {number} value - Current value
     * @returns {string} Formatted value
     */
    formatKnobValue(spec, value) {
        if (spec.id === 'volume') {
            const percentage = Math.round(value * 100);
            const dbValue = value > 0 ? (20 * Math.log10(value)).toFixed(1) : '-∞';
            return `${percentage}% (${dbValue}dB)`;
        } else if (spec.id === 'playbackRate') {
            const semitones = 12 * Math.log2(value);
            const semitonesText = semitones >= 0 ? `+${semitones.toFixed(1)}` : semitones.toFixed(1);
            return `${value.toFixed(2)} (${semitonesText}st)`;
        } else if (spec.id === 'envelopeShape') {
            const shapes = ['Linear', 'Exponential', 'Logarithmic', 'S-Curve', 'Cosine', 'Gaussian', 'Hanning', 'Triangular'];
            return shapes[value] || 'Linear';
        } else if (spec.id === 'lfoWaveform') {
            const waveforms = ['Sine', 'Triangle', 'Square', 'Random'];
            return waveforms[value] || 'Sine';
        } else if (spec.id === 'panRandom') {
            const percentage = Math.round(value * 100);
            return `${percentage}% (±${(value * 100).toFixed(1)}%)`;
        } else if (spec.id === 'randomDensity') {
            const percentage = Math.round(value);
            return `${percentage}% SEQ PROB`;
        } else {
            if (spec.step >= 1) {
                return parseFloat(value).toFixed(0);
            } else {
                return parseFloat(value).toFixed(spec.step < 1 ? 2 : 0);
            }
        }
    }

    /**
     * Setup collapsible headers
     */
    setupCollapsibleHeaders() {
        this.domCache.querySelectorAll('.collapsible-header').forEach(header => {
            this.resourceManager.addEventListener(header, 'click', () => {
                const panelGroup = header.closest('.panel-group');
                if (!panelGroup) return;

                const content = panelGroup.querySelector('[id$="-content"]');
                const indicator = header.querySelector('.indicator');

                if (!content || !indicator) return;

                content.classList.toggle('collapsed-content');
                indicator.textContent = content.classList.contains('collapsed-content') ? '+' : '-';
            });
        });
    }

    /**
     * Get waveform renderers
     * @returns {Array} Array of waveform renderer instances
     */
    getWaveformRenderers() {
        return this.waveformRenderers;
    }

    /**
     * Destroy UI builder and clean up
     */
    destroy() {
        this.waveformRenderers.forEach(renderer => {
            if (renderer.destroy) renderer.destroy();
        });
        this.waveformRenderers = [];
        Logger.log('🗑️ UIBuilder destroyed');
    }
}
