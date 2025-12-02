/**
 * Clone Utilities
 * Provides efficient object cloning using structuredClone with fallback
 */

import { Logger } from './logger.js';

/**
 * Deep clone an object efficiently
 * Uses structuredClone if available, falls back to JSON method
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Use structuredClone if available (modern browsers)
    if (typeof structuredClone !== 'undefined') {
        try {
            return structuredClone(obj);
        } catch (error) {
            Logger.warn('structuredClone failed, falling back to JSON method:', error);
        }
    }

    // Fallback to JSON method (slower but compatible)
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (error) {
        Logger.error('Failed to clone object:', error);
        return obj;
    }
}

/**
 * Shallow clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Shallow cloned object
 */
export function shallowClone(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return [...obj];
    }

    if (typeof obj === 'object') {
        return { ...obj };
    }

    return obj;
}

/**
 * Clone an array of objects
 * @param {Array} arr - Array to clone
 * @param {boolean} deep - Use deep clone (default: true)
 * @returns {Array} Cloned array
 */
export function cloneArray(arr, deep = true) {
    if (!Array.isArray(arr)) {
        return arr;
    }

    if (deep) {
        return arr.map(item => deepClone(item));
    } else {
        return [...arr];
    }
}

export default {
    deepClone,
    shallowClone,
    cloneArray
};
