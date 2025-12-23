/**
 * AudioEngine - 底层音频引擎
 * 管理 AudioContext、节点连接、Master Volume 等 WebAudio API 细节
 */

// Extend Window interface for webkit prefix
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

export class AudioEngine {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private gazeLowPassFilter: BiquadFilterNode | null = null;
    public enabled: boolean = false;

    // Filter interpolation state
    private gazeFilterTargetFreq: number = 20000;
    private gazeFilterCurrentFreq: number = 20000;

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init(): void {
        if (this.enabled)
            return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();

            // Create master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3;

            // Create gaze low-pass filter
            this.gazeLowPassFilter = this.audioContext.createBiquadFilter();
            this.gazeLowPassFilter.type = 'lowpass';
            this.gazeLowPassFilter.frequency.value = 20000;
            this.gazeLowPassFilter.Q.value = 0.7;

            // Route: masterGain -> gazeLowPassFilter -> destination
            this.masterGain.connect(this.gazeLowPassFilter);
            this.gazeLowPassFilter.connect(this.audioContext.destination);

            this.enabled = true;
        }
        catch (e) {
            console.warn('AudioEngine: Failed to initialize', e);
        }
    }

    /**
     * Get the audio context
     */
    getContext(): AudioContext | null {
        return this.audioContext;
    }

    /**
     * Get the master gain node (for connecting sounds to output)
     */
    getMasterGain(): GainNode | null {
        return this.masterGain;
    }

    /**
     * Set master volume (0.0 to 1.0)
     */
    setVolume(value: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, value));
        }
    }

    /**
     * Toggle mute
     */
    toggleMute(): void {
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterGain.gain.value > 0 ? 0 : 0.3;
        }
    }

    /**
     * Update gaze filter target frequency
     * @param isGazing - Whether player is gazing
     * @param gazeIntensity - 0-1
     */
    updateGazeFilter(isGazing: boolean, gazeIntensity: number): void {
        this.gazeFilterTargetFreq = isGazing
            ? 400 + (1 - gazeIntensity) * 19600
            : 20000;
    }

    /**
     * Tick gaze filter interpolation (call every frame)
     */
    tick(deltaTime: number): void {
        if (!this.gazeLowPassFilter || !this.audioContext)
            return;

        const lerpSpeed = 3.0;
        this.gazeFilterCurrentFreq
            += (this.gazeFilterTargetFreq - this.gazeFilterCurrentFreq) * lerpSpeed * deltaTime;

        this.gazeLowPassFilter.frequency.setValueAtTime(
            this.gazeFilterCurrentFreq,
            this.audioContext.currentTime,
        );
    }

    // ==================== Sound Utilities ====================

    /**
     * Create a white noise buffer
     */
    createNoiseBuffer(duration: number): AudioBuffer | null {
        if (!this.audioContext)
            return null;
        const bufferSize = Math.floor(this.audioContext.sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    /**
     * Play a simple oscillator tone
     */
    playTone(options: {
        type: OscillatorType;
        frequency: number;
        frequencyEnd?: number;
        duration: number;
        volume: number;
        attack?: number;
        decay?: number;
    }): void {
        if (!this.enabled || !this.audioContext || !this.masterGain)
            return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = options.type;
        osc.frequency.setValueAtTime(options.frequency, now);
        if (options.frequencyEnd) {
            osc.frequency.exponentialRampToValueAtTime(options.frequencyEnd, now + options.duration);
        }

        const attack = options.attack ?? 0;
        const decay = options.decay ?? options.duration;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(options.volume, now + attack);
        gain.gain.setTargetAtTime(0.001, now + attack, decay);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + options.duration + 0.1);
    }

    /**
     * Play a noise burst
     */
    playNoise(options: {
        duration: number;
        volume: number;
        filterType?: BiquadFilterType;
        filterFreq?: number;
        filterQ?: number;
    }): void {
        if (!this.enabled || !this.audioContext || !this.masterGain)
            return;

        const now = this.audioContext.currentTime;
        const buffer = this.createNoiseBuffer(options.duration);
        if (!buffer)
            return;

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(options.volume, now);
        gain.gain.setTargetAtTime(0.001, now + options.duration * 0.7, options.duration * 0.3);

        if (options.filterType) {
            const filter = this.audioContext.createBiquadFilter();
            filter.type = options.filterType;
            filter.frequency.value = options.filterFreq ?? 1000;
            filter.Q.value = options.filterQ ?? 1;
            noise.connect(filter);
            filter.connect(gain);
        }
        else {
            noise.connect(gain);
        }

        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + options.duration);
    }

    /**
     * Dispose audio context and all resources
     */
    dispose(): void {
        if (this.audioContext) {
            // Disconnect nodes
            this.masterGain?.disconnect();
            this.gazeLowPassFilter?.disconnect();

            // Close audio context
            this.audioContext.close().catch(() => {
                // Ignore close errors
            });

            this.audioContext = null;
            this.masterGain = null;
            this.gazeLowPassFilter = null;
            this.enabled = false;
        }
    }
}
