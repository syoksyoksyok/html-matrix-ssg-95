/**
 * Audio File Utilities
 * Provides file validation, loading, and error handling for audio files
 */

import { Logger } from './logger.js';

// File size limits (in bytes)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const WARN_FILE_SIZE = 50 * 1024 * 1024;  // 50MB

/**
 * Validate audio file before processing
 * @param {File} file - File to validate
 * @returns {Object} Validation result { valid: boolean, error: string|null, warning: string|null }
 */
export function validateAudioFile(file) {
    const result = {
        valid: true,
        error: null,
        warning: null
    };

    // Check if file exists
    if (!file) {
        result.valid = false;
        result.error = 'No file provided';
        return result;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        result.valid = false;
        result.error = `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(MAX_FILE_SIZE)})`;
        return result;
    }

    if (file.size > WARN_FILE_SIZE) {
        result.warning = `Large file detected (${formatFileSize(file.size)}). Loading may take some time.`;
    }

    // Check file type
    const audioExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm'];
    const audioMimeTypes = ['audio/', 'video/webm'];

    const hasValidExtension = audioExtensions.some(ext =>
        file.name.toLowerCase().endsWith(ext)
    );

    const hasValidMimeType = audioMimeTypes.some(type =>
        file.type.toLowerCase().startsWith(type)
    );

    if (!hasValidExtension && !hasValidMimeType) {
        result.warning = `Unexpected file type: ${file.type}. File may not be an audio file.`;
    }

    return result;
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Load and decode audio file with proper error handling and validation
 * @param {File} file - Audio file to load
 * @param {AudioContext} audioContext - Web Audio API context
 * @returns {Promise<AudioBuffer>} Decoded audio buffer
 */
export async function loadAudioFile(file, audioContext) {
    try {
        // Validate file
        const validation = validateAudioFile(file);

        if (!validation.valid) {
            throw new Error(validation.error);
        }

        if (validation.warning) {
            Logger.warn(validation.warning);
        }

        // Check AudioContext state
        if (audioContext.state === 'closed') {
            throw new Error('AudioContext is closed. Cannot decode audio.');
        }

        // Resume AudioContext if suspended
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
            Logger.log('AudioContext resumed');
        }

        // Load file
        Logger.log(`Loading file: ${file.name} (${formatFileSize(file.size)})`);

        const arrayBuffer = await file.arrayBuffer();

        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Failed to read file or file is empty');
        }

        // Decode audio data
        const decodedData = await audioContext.decodeAudioData(arrayBuffer);

        if (!decodedData) {
            throw new Error('Failed to decode audio data');
        }

        Logger.log(`✅ Loaded: ${file.name} (${decodedData.duration.toFixed(2)}s, ${decodedData.sampleRate}Hz)`);

        return decodedData;

    } catch (error) {
        // Enhance error messages
        let errorMessage = error.message;

        if (error.name === 'EncodingError' || error.message.includes('Unable to decode')) {
            errorMessage = `Unable to decode audio file "${file.name}". The file may be corrupted or in an unsupported format.`;
        } else if (error.name === 'NotSupportedError') {
            errorMessage = `Audio format not supported for file "${file.name}". Try converting to WAV or MP3.`;
        }

        Logger.error(`❌ Failed to load ${file.name}:`, errorMessage);
        throw new Error(errorMessage);
    }
}

/**
 * Load multiple audio files with progress tracking
 * @param {Array<File>} files - Array of files to load
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {Function} onProgress - Progress callback (loaded, total)
 * @returns {Promise<Array<AudioBuffer|null>>} Array of decoded buffers (null on failure)
 */
export async function loadAudioFiles(files, audioContext, onProgress = null) {
    const results = [];
    let loaded = 0;

    for (const file of files) {
        try {
            const buffer = await loadAudioFile(file, audioContext);
            results.push(buffer);
        } catch (error) {
            Logger.error(`Failed to load ${file.name}:`, error);
            results.push(null);
        }

        loaded++;
        if (onProgress) {
            onProgress(loaded, files.length);
        }
    }

    return results;
}

/**
 * Trim silence from audio buffer
 * @param {AudioBuffer} buffer - Audio buffer to trim
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {number} threshold - Silence threshold (default: 0.01)
 * @returns {AudioBuffer} Trimmed audio buffer
 */
export function trimSilence(buffer, audioContext, threshold = 0.01) {
    try {
        const rawData = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;

        let startIdx = 0;
        let endIdx = rawData.length - 1;

        // Find start of audio
        for (let i = 0; i < rawData.length; i++) {
            if (Math.abs(rawData[i]) > threshold) {
                startIdx = i;
                break;
            }
        }

        // Find end of audio
        for (let i = rawData.length - 1; i >= 0; i--) {
            if (Math.abs(rawData[i]) > threshold) {
                endIdx = i;
                break;
            }
        }

        const trimmedLength = endIdx - startIdx + 1;

        if (trimmedLength <= 0 || trimmedLength === rawData.length) {
            return buffer; // No trimming needed
        }

        // Create trimmed buffer
        const trimmedBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            trimmedLength,
            sampleRate
        );

        // Copy data for all channels
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const channelData = buffer.getChannelData(ch);
            const trimmedChannelData = trimmedBuffer.getChannelData(ch);
            for (let i = 0; i < trimmedLength; i++) {
                trimmedChannelData[i] = channelData[startIdx + i];
            }
        }

        const originalDuration = buffer.duration;
        const trimmedDuration = trimmedBuffer.duration;
        const savedTime = originalDuration - trimmedDuration;

        Logger.log(`✂️ Trimmed ${savedTime.toFixed(2)}s of silence (${originalDuration.toFixed(2)}s → ${trimmedDuration.toFixed(2)}s)`);

        return trimmedBuffer;

    } catch (error) {
        Logger.error('Failed to trim silence:', error);
        return buffer; // Return original buffer on error
    }
}

export default {
    validateAudioFile,
    formatFileSize,
    loadAudioFile,
    loadAudioFiles,
    trimSilence
};
