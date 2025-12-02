/**
 * DOM Cache Manager
 * Caches frequently accessed DOM elements to improve performance
 */

import { Logger } from './logger.js';

export class DOMCache {
    constructor() {
        this.cache = new Map();
        this.queryCount = 0;
        this.cacheHits = 0;
    }

    /**
     * Get element by ID with caching
     * @param {string} id - Element ID
     * @param {boolean} refresh - Force refresh cache
     * @returns {HTMLElement|null} Element or null
     */
    getElementById(id, refresh = false) {
        const cacheKey = `id:${id}`;

        if (!refresh && this.cache.has(cacheKey)) {
            this.cacheHits++;
            return this.cache.get(cacheKey);
        }

        this.queryCount++;
        const element = document.getElementById(id);

        if (element) {
            this.cache.set(cacheKey, element);
        }

        return element;
    }

    /**
     * Query selector with caching
     * @param {string} selector - CSS selector
     * @param {boolean} refresh - Force refresh cache
     * @returns {HTMLElement|null} Element or null
     */
    querySelector(selector, refresh = false) {
        const cacheKey = `qs:${selector}`;

        if (!refresh && this.cache.has(cacheKey)) {
            this.cacheHits++;
            return this.cache.get(cacheKey);
        }

        this.queryCount++;
        const element = document.querySelector(selector);

        if (element) {
            this.cache.set(cacheKey, element);
        }

        return element;
    }

    /**
     * Query selector all with caching
     * @param {string} selector - CSS selector
     * @param {boolean} refresh - Force refresh cache
     * @returns {NodeList} NodeList of elements
     */
    querySelectorAll(selector, refresh = false) {
        const cacheKey = `qsa:${selector}`;

        if (!refresh && this.cache.has(cacheKey)) {
            this.cacheHits++;
            return this.cache.get(cacheKey);
        }

        this.queryCount++;
        const elements = document.querySelectorAll(selector);
        this.cache.set(cacheKey, elements);

        return elements;
    }

    /**
     * Get elements by class name with caching
     * @param {string} className - Class name
     * @param {boolean} refresh - Force refresh cache
     * @returns {HTMLCollection} Collection of elements
     */
    getElementsByClassName(className, refresh = false) {
        const cacheKey = `class:${className}`;

        if (!refresh && this.cache.has(cacheKey)) {
            this.cacheHits++;
            return this.cache.get(cacheKey);
        }

        this.queryCount++;
        const elements = document.getElementsByClassName(className);
        this.cache.set(cacheKey, elements);

        return elements;
    }

    /**
     * Invalidate specific cache entry
     * @param {string} key - Cache key to invalidate
     */
    invalidate(key) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            Logger.log(`🗑️ Cache invalidated: ${key}`);
        }
    }

    /**
     * Invalidate all entries matching a pattern
     * @param {RegExp|string} pattern - Pattern to match
     */
    invalidatePattern(pattern) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        let count = 0;

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }

        Logger.log(`🗑️ Cache invalidated: ${count} entries matching pattern`);
    }

    /**
     * Clear all cache
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        Logger.log(`🗑️ DOM cache cleared (${size} entries)`);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        const hitRate = this.queryCount > 0
            ? ((this.cacheHits / (this.queryCount + this.cacheHits)) * 100).toFixed(2)
            : 0;

        return {
            cacheSize: this.cache.size,
            totalQueries: this.queryCount,
            cacheHits: this.cacheHits,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Prefetch and cache multiple elements
     * @param {Object} selectors - Object with selector definitions
     * @example
     * cache.prefetch({
     *   mainButton: { type: 'id', value: 'myButton' },
     *   allKnobs: { type: 'class', value: 'knob' }
     * });
     */
    prefetch(selectors) {
        let count = 0;

        for (const [name, config] of Object.entries(selectors)) {
            try {
                switch (config.type) {
                    case 'id':
                        this.getElementById(config.value);
                        break;
                    case 'class':
                        this.getElementsByClassName(config.value);
                        break;
                    case 'selector':
                        this.querySelector(config.value);
                        break;
                    case 'selectorAll':
                        this.querySelectorAll(config.value);
                        break;
                }
                count++;
            } catch (error) {
                Logger.warn(`Failed to prefetch ${name}:`, error);
            }
        }

        Logger.log(`✅ Prefetched ${count} DOM element groups`);
    }

    /**
     * Auto-invalidate cache when DOM changes (MutationObserver)
     * @param {HTMLElement} targetNode - Node to observe
     * @param {Object} options - MutationObserver options
     */
    setupAutoInvalidation(targetNode = document.body, options = { childList: true, subtree: true }) {
        const observer = new MutationObserver((mutations) => {
            // Clear cache on DOM changes
            this.clear();
        });

        observer.observe(targetNode, options);
        Logger.log('👁️ Auto-invalidation enabled for DOM cache');

        return observer;
    }
}

export default DOMCache;
