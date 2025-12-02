/**
 * Knob Utility Functions
 * Provides common calculations for knob controls
 */

const KNOB_BASE_SENSITIVITY = 0.5;
const KNOB_BASE_RANGE = 100;

/**
 * Calculate normalized sensitivity for a knob based on its value range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Normalized sensitivity
 */
export function calculateNormalizedSensitivity(min, max) {
    const valueRange = max - min;
    return KNOB_BASE_SENSITIVITY * (valueRange / KNOB_BASE_RANGE);
}

/**
 * Calculate knob rotation angle from value
 * @param {number} value - Current value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} minAngle - Minimum rotation angle (default: -135)
 * @param {number} maxAngle - Maximum rotation angle (default: 135)
 * @returns {number} Rotation angle in degrees
 */
export function valueToAngle(value, min, max, minAngle = -135, maxAngle = 135) {
    const normalizedValue = (value - min) / (max - min);
    return minAngle + normalizedValue * (maxAngle - minAngle);
}

/**
 * Calculate value from knob rotation angle
 * @param {number} angle - Current rotation angle
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} minAngle - Minimum rotation angle (default: -135)
 * @param {number} maxAngle - Maximum rotation angle (default: 135)
 * @returns {number} Calculated value
 */
export function angleToValue(angle, min, max, minAngle = -135, maxAngle = 135) {
    const normalizedAngle = (angle - minAngle) / (maxAngle - minAngle);
    return min + normalizedAngle * (max - min);
}

/**
 * Format knob value for display
 * @param {number} value - Value to format
 * @param {number} step - Step size
 * @returns {string|number} Formatted value
 */
export function formatKnobValue(value, step) {
    if (step >= 1) {
        return Math.round(value);
    } else if (step >= 0.1) {
        return value.toFixed(1);
    } else if (step >= 0.01) {
        return value.toFixed(2);
    } else {
        return value.toFixed(3);
    }
}

/**
 * Clamp value within min/max range
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export default {
    calculateNormalizedSensitivity,
    valueToAngle,
    angleToValue,
    formatKnobValue,
    clampValue
};
