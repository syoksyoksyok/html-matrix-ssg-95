import { Logger } from '../utils/logger.js';
import { loadAudioFile, trimSilence } from '../utils/audioFileLoader.js';

/**
 * FileLoaderController
 * Handles all file loading operations (folder selection, individual files)
 */
export class FileLoaderController {
    constructor(config, domCache, audioContext, state, callbacks) {
        this.config = config;
        this.domCache = domCache;
        this.audioContext = audioContext;
        this.state = state;
        this.callbacks = callbacks; // { saveCurrentState, showErrorNotification, updateUI }
    }

    /**
     * Load audio samples from a selected folder
     */
    async loadFolderSamples(ui) {
        ui.loadPathButton.disabled = true;
        ui.loadPathButton.textContent = 'Loading...';
        ui.loadingStatus.textContent = 'Loading';
        ui.loadingStatus.classList.add('loading-dots');

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

            // Clear all slots
            for (let s = 0; s < this.config.SLOTS; s++) {
                this.state.audioBuffers[s] = null;
                this.state.waveformRenderers[s].invalidateCache();
                this.state.waveformRenderers[s].ctx.clearRect(0, 0, this.config.WAVEFORM_CANVAS_WIDTH, this.config.WAVEFORM_CANVAS_HEIGHT);
                this.domCache.getElementById(`fileName-slot${s}`).textContent = '';
            }

            // Shuffle file handles
            for (let i = allFileHandles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allFileHandles[i], allFileHandles[j]] = [allFileHandles[j], allFileHandles[i]];
            }

            // Load files in parallel
            const loadPromises = allFileHandles.slice(0, this.config.SLOTS).map((fileHandle, index) =>
                this._processAndLoadFile(fileHandle, index)
            );

            await Promise.all(loadPromises);

            const loadedCount = this.state.audioBuffers.filter(b => b).length;
            ui.loadingStatus.textContent = `${loadedCount}/${this.config.SLOTS} loaded`;
            this.callbacks.saveCurrentState();

        } catch (err) {
            Logger.error("❌ Folder load error:", err);
            ui.loadingStatus.textContent = 'Error!';

            // Show user-friendly error message
            let errorMessage = 'フォルダーからのファイル読み込みに失敗しました。';
            if (err.name === 'AbortError') {
                errorMessage = 'ファイル選択がキャンセルされました。';
            } else if (err.name === 'NotAllowedError') {
                errorMessage = 'フォルダーへのアクセス権限がありません。';
            } else if (err.message) {
                errorMessage += `\n\n詳細: ${err.message}`;
            }

            this.callbacks.showErrorNotification('フォルダー読み込みエラー', errorMessage);
        } finally {
            ui.loadPathButton.disabled = false;
            ui.loadPathButton.textContent = 'Load';
            ui.loadingStatus.classList.remove('loading-dots');
        }
    }

    /**
     * Recursively get all audio files from directory
     */
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

    /**
     * Process and load a single audio file into a slot
     */
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

    /**
     * Handle individual file load from file input
     */
    async handleFileLoad(file, slot) {
        try {
            // Validate and load file with proper error handling
            const decoded = await loadAudioFile(file, this.audioContext);

            this.state.audioBuffers[slot] = decoded;
            this.state.waveformRenderers[slot].drawWaveform(decoded);
            this.domCache.getElementById(`fileName-slot${slot}`).textContent = file.name;
            this.callbacks.saveCurrentState();

            Logger.log(`✅ Slot ${slot}: ${file.name} loaded successfully`);
            return true;
        } catch (err) {
            Logger.error(`❌ Failed to load file for Slot ${slot}:`, err);
            alert(`ファイルの読み込みに失敗しました:\n${err.message}`);
            return false;
        }
    }
}
