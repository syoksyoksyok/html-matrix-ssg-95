/**
 * Math Utility Functions
 * Provides common mathematical operations and random value generation
 */

/**
 * Generate random value based on parameter specification
 * @param {Object} spec - Parameter specification
 * @param {number} spec.min - Minimum value
 * @param {number} spec.max - Maximum value
 * @param {number} spec.step - Step size
 * @param {string} spec.id - Parameter ID (for special cases like 'volume')
 * @param {number} [volumeMin=0.3] - Minimum volume for volume randomization
 * @param {number} [volumeMax=0.8] - Maximum volume for volume randomization
 * @returns {number} Generated random value
 */
export function generateRandomValue(spec, volumeMin = 0.3, volumeMax = 0.8) {
    let randomValue;

    // Special case for volume parameter
    if (spec.id === 'volume') {
        randomValue = Math.random() * (volumeMax - volumeMin) + volumeMin;
    }
    // Integer values (step >= 1)
    else if (spec.step >= 1) {
        randomValue = Math.floor(Math.random() * (spec.max - spec.min + 1)) + spec.min;
    }
    // Float values
    else {
        randomValue = Math.random() * (spec.max - spec.min) + spec.min;
    }

    return randomValue;
}

/**
 * Generate random integer within range (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float within range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random float
 */
export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Clamp value within range
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Map value from one range to another
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Mapped value
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/**
 * Debounce function - delays execution until after wait period
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait period in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function - limits execution rate
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between executions in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

export default {
    generateRandomValue,
    randomInt,
    randomFloat,
    clamp,
    lerp,
    mapRange,
    debounce,
    throttle
};
