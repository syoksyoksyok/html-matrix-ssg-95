/**
 * Environment-aware logging utility
 * Set DEBUG to false in production to disable all console logs
 */

const DEBUG = true; // Set to false in production

export const Logger = {
  log(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  },

  warn(...args) {
    if (DEBUG) {
      console.warn(...args);
    }
  },

  error(...args) {
    // Always log errors, even in production
    console.error(...args);
  },

  info(...args) {
    if (DEBUG) {
      console.info(...args);
    }
  },

  debug(...args) {
    if (DEBUG) {
      console.debug(...args);
    }
  }
};

export default Logger;
