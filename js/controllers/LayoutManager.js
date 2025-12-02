/**
 * Layout Manager
 * Handles panel dragging, resizing, and layout management
 * Optimized event listener management to prevent memory leaks
 */

import { Logger } from '../utils/logger.js';
import { clamp } from '../utils/mathUtils.js';
import { ResourceManager } from '../utils/resourceManager.js';

export class LayoutManager {
    constructor(resourceManager = null) {
        this.resourceManager = resourceManager || new ResourceManager();

        // Layout state
        this.isFreeLayoutMode = false;
        this.sectionPositions = {};

        // Drag state
        this.dragState = {
            isDragging: false,
            currentElement: null,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };

        // Resize state
        this.resizeState = {
            isResizing: false,
            currentElement: null,
            startX: 0,
            startY: 0,
            startWidth: 0,
            startHeight: 0
        };

        // Bound event handlers (to maintain reference for cleanup)
        this._boundHandleDragResizeStart = this._handleDragResizeStart.bind(this);
        this._boundHandleDragResizeMove = this._handleDragResizeMove.bind(this);
        this._boundHandleDragResizeEnd = this._handleDragResizeEnd.bind(this);

        // Constants
        this.CONSTANTS = {
            MIN_WIDTH: 200,
            MAX_WIDTH: 2000,
            MIN_HEIGHT: 150,
            MAX_HEIGHT: 2000,
            MARGIN: 20
        };

        // Register event listeners ONCE during initialization
        this._registerEventListeners();
    }

    /**
     * Register global event listeners once
     * @private
     */
    _registerEventListeners() {
        // Mouse events
        this.resourceManager.addEventListener(document, 'mousedown', this._boundHandleDragResizeStart);
        this.resourceManager.addEventListener(document, 'mousemove', this._boundHandleDragResizeMove);
        this.resourceManager.addEventListener(document, 'mouseup', this._boundHandleDragResizeEnd);

        // Touch events
        this.resourceManager.addEventListener(document, 'touchstart', this._boundHandleDragResizeStart, { passive: false });
        this.resourceManager.addEventListener(document, 'touchmove', this._boundHandleDragResizeMove, { passive: false });
        this.resourceManager.addEventListener(document, 'touchend', this._boundHandleDragResizeEnd);

        Logger.log('✅ Layout manager event listeners registered');
    }

    /**
     * Enable/disable free layout mode
     * @param {boolean} enabled - Enable free layout
     */
    setFreeLayoutMode(enabled) {
        this.isFreeLayoutMode = enabled;

        const layoutContainer = document.getElementById('layoutContainer');
        const layoutToggle = document.getElementById('layoutToggle');
        const autoArrangeBtn = document.getElementById('autoArrangeBtn');

        if (!layoutContainer) return;

        if (enabled) {
            layoutContainer.classList.add('free-layout');
            if (layoutToggle) layoutToggle.textContent = '📐 NORMAL LAYOUT';
            if (autoArrangeBtn) autoArrangeBtn.classList.add('show');

            // Make panels draggable
            const panels = layoutContainer.querySelectorAll('.panel-group');
            panels.forEach(panel => {
                panel.classList.add('draggable');
                this._addResizeHandle(panel);
            });

            Logger.log('📐 FREE LAYOUT mode enabled');
        } else {
            layoutContainer.classList.remove('free-layout');
            if (layoutToggle) layoutToggle.textContent = '🎨 FREE LAYOUT';
            if (autoArrangeBtn) autoArrangeBtn.classList.remove('show');

            // Remove draggable class
            const panels = layoutContainer.querySelectorAll('.panel-group');
            panels.forEach(panel => {
                panel.classList.remove('draggable');
                panel.style.position = '';
                panel.style.left = '';
                panel.style.top = '';
                panel.style.width = '';
                panel.style.height = '';

                // Remove resize handle
                const handle = panel.querySelector('.resize-handle');
                if (handle) handle.remove();
            });

            Logger.log('📐 NORMAL LAYOUT mode enabled');
        }
    }

    /**
     * Add resize handle to panel
     * @private
     * @param {HTMLElement} panel - Panel element
     */
    _addResizeHandle(panel) {
        if (panel.querySelector('.resize-handle')) return;

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        panel.appendChild(handle);
    }

    /**
     * Handle drag/resize start
     * @private
     * @param {MouseEvent|TouchEvent} e - Event
     */
    _handleDragResizeStart(e) {
        if (!this.isFreeLayoutMode) return;

        // Check for resize handle
        if (e.target.classList.contains('resize-handle')) {
            this._startResize(e, e.target);
            return;
        }

        // Check for title bar drag
        const titleBar = e.target.closest('.group-title');
        if (!titleBar) return;

        const target = titleBar.closest('.panel-group');
        if (!target || !target.classList.contains('draggable')) return;

        this._startDrag(e, target, titleBar);
    }

    /**
     * Handle drag/resize move
     * @private
     * @param {MouseEvent|TouchEvent} e - Event
     */
    _handleDragResizeMove(e) {
        if (this.dragState.isDragging) {
            this._handleDragMove(e);
        } else if (this.resizeState.isResizing) {
            this._handleResizeMove(e);
        }
    }

    /**
     * Handle drag/resize end
     * @private
     * @param {MouseEvent|TouchEvent} e - Event
     */
    _handleDragResizeEnd(e) {
        if (this.dragState.isDragging) {
            this._handleDragEnd(e);
        } else if (this.resizeState.isResizing) {
            this._handleResizeEnd(e);
        }
    }

    /**
     * Start dragging a panel
     * @private
     * @param {Event} e - Event
     * @param {HTMLElement} target - Panel element
     * @param {HTMLElement} titleBar - Title bar element
     */
    _startDrag(e, target, titleBar) {
        e.preventDefault();

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        const rect = target.getBoundingClientRect();

        this.dragState = {
            isDragging: true,
            currentElement: target,
            startX: clientX,
            startY: clientY,
            offsetX: clientX - rect.left,
            offsetY: clientY - rect.top
        };

        target.classList.add('dragging');
        document.body.classList.add('dragging-active');
    }

    /**
     * Handle drag move
     * @private
     * @param {Event} e - Event
     */
    _handleDragMove(e) {
        if (!this.dragState.isDragging) return;

        e.preventDefault();

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        const newX = clientX - this.dragState.offsetX;
        const newY = clientY - this.dragState.offsetY;

        const container = document.getElementById('layoutContainer');
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const element = this.dragState.currentElement;
        const elementRect = element.getBoundingClientRect();

        const maxX = containerRect.width - elementRect.width;
        const maxY = containerRect.height - elementRect.height;

        const boundedX = clamp(newX, 0, maxX);
        const boundedY = clamp(newY, 0, maxY);

        element.style.left = boundedX + 'px';
        element.style.top = boundedY + 'px';
    }

    /**
     * Handle drag end
     * @private
     * @param {Event} e - Event
     */
    _handleDragEnd(e) {
        if (!this.dragState.isDragging) return;

        const element = this.dragState.currentElement;
        if (element) {
            element.classList.remove('dragging');
        }

        document.body.classList.remove('dragging-active');

        // Reset drag state
        this.dragState = {
            isDragging: false,
            currentElement: null,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };
    }

    /**
     * Start resizing a panel
     * @private
     * @param {Event} e - Event
     * @param {HTMLElement} resizeHandle - Resize handle element
     */
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

        this.resizeState = {
            isResizing: true,
            currentElement: target,
            startX: clientX,
            startY: clientY,
            startWidth: rect.width,
            startHeight: rect.height
        };

        target.classList.add('resizing');
        document.body.classList.add('resizing-active');
    }

    /**
     * Handle resize move
     * @private
     * @param {Event} e - Event
     */
    _handleResizeMove(e) {
        if (!this.resizeState.isResizing) return;

        e.preventDefault();
        e.stopPropagation();

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);

        const deltaX = clientX - this.resizeState.startX;
        const deltaY = clientY - this.resizeState.startY;

        let newWidth = this.resizeState.startWidth + deltaX;
        let newHeight = this.resizeState.startHeight + deltaY;

        newWidth = clamp(newWidth, this.CONSTANTS.MIN_WIDTH, this.CONSTANTS.MAX_WIDTH);
        newHeight = clamp(newHeight, this.CONSTANTS.MIN_HEIGHT, this.CONSTANTS.MAX_HEIGHT);

        const element = this.resizeState.currentElement;
        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';
    }

    /**
     * Handle resize end
     * @private
     * @param {Event} e - Event
     */
    _handleResizeEnd(e) {
        if (!this.resizeState.isResizing) return;

        const element = this.resizeState.currentElement;
        if (element) {
            element.classList.remove('resizing');
        }

        document.body.classList.remove('resizing-active');

        // Reset resize state
        this.resizeState = {
            isResizing: false,
            currentElement: null,
            startX: 0,
            startY: 0,
            startWidth: 0,
            startHeight: 0
        };
    }

    /**
     * Get current drag/resize status
     * @returns {Object} Status
     */
    getStatus() {
        return {
            isFreeLayoutMode: this.isFreeLayoutMode,
            isDragging: this.dragState.isDragging,
            isResizing: this.resizeState.isResizing,
            isInteracting: this.dragState.isDragging || this.resizeState.isResizing
        };
    }

    /**
     * Destroy layout manager and clean up
     */
    destroy() {
        this.resourceManager.destroy();
        this.dragState = null;
        this.resizeState = null;
        Logger.log('🗑️ Layout manager destroyed');
    }
}

export default LayoutManager;
