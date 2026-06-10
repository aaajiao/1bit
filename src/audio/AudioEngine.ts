/**
 * AudioEngine - Low-level audio engine
 * Manages AudioContext, node connections, Master Volume, and other Web Audio API details
 */

import { AUDIO_MASTER } from '../config';

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
    private gazeFilterTargetFreq: number = AUDIO_MASTER.gazeFilterOpen;
    private gazeFilterCurrentFreq: number = AUDIO_MASTER.gazeFilterOpen;

    // Temporary lowpass ceiling (snapshot ritual, flow-audit enhancement #9):
    // while the timer runs, the effective filter target is capped at this
    // frequency; the glide itself reuses the gaze-filter interpolation below.
    private lowpassCeilingFreq: number = Infinity;
    private lowpassCeilingTimeLeft: number = 0;

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init(): void {
        if (this.enabled)
            return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();

            // Browsers may auto-suspend the context (e.g. created before a gesture); resume it.
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {
                    // Resume may reject until a user gesture occurs; ignore.
                });
            }

            // Create master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = AUDIO_MASTER.defaultVolume;

            // Create gaze low-pass filter
            this.gazeLowPassFilter = this.audioContext.createBiquadFilter();
            this.gazeLowPassFilter.type = 'lowpass';
            this.gazeLowPassFilter.frequency.value = AUDIO_MASTER.gazeFilterOpen;
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
     * Resume the audio context if it has been suspended (e.g. tab blur/focus,
     * or browser autoplay policy). Safe to call repeatedly.
     */
    resume(): void {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {
                // Ignore resume errors (e.g. no user gesture yet).
            });
        }
    }

    /**
     * Suspend the audio context (used by the pause state machine).
     * Safe to call when already suspended or before init.
     */
    suspend(): void {
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend().catch(() => {
                // Ignore suspend errors.
            });
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
            this.masterGain.gain.value = this.masterGain.gain.value > 0 ? 0 : AUDIO_MASTER.defaultVolume;
        }
    }

    /**
     * Update gaze filter target frequency
     * @param isGazing - Whether player is gazing
     * @param gazeIntensity - 0-1
     */
    updateGazeFilter(isGazing: boolean, gazeIntensity: number): void {
        this.gazeFilterTargetFreq = isGazing
            ? AUDIO_MASTER.gazeFilterClosed
            + (1 - gazeIntensity) * (AUDIO_MASTER.gazeFilterOpen - AUDIO_MASTER.gazeFilterClosed)
            : AUDIO_MASTER.gazeFilterOpen;
    }

    /**
     * Apply a temporary lowpass ceiling for `holdSeconds` of play time
     * (snapshot ritual, flow-audit enhancement #9). The effective filter
     * target becomes min(gaze target, ceiling) and glides there through the
     * shared log-domain interpolation in tick(); when the hold expires the
     * ceiling lifts and the filter glides back to the live gaze target.
     * The timer only advances inside tick(), so pausing freezes the hold.
     */
    applyTemporaryLowpass(freq: number, holdSeconds: number): void {
        this.lowpassCeilingFreq = freq;
        this.lowpassCeilingTimeLeft = holdSeconds;
    }

    /**
     * Tick gaze filter interpolation (call every frame)
     */
    tick(deltaTime: number): void {
        if (!this.gazeLowPassFilter || !this.audioContext)
            return;

        // Advance the temporary-ceiling hold (play time: frozen while paused).
        if (this.lowpassCeilingTimeLeft > 0) {
            this.lowpassCeilingTimeLeft -= deltaTime;
            if (this.lowpassCeilingTimeLeft <= 0) {
                this.lowpassCeilingTimeLeft = 0;
                this.lowpassCeilingFreq = Infinity;
            }
        }
        const target = Math.min(this.gazeFilterTargetFreq, this.lowpassCeilingFreq);

        // Skip writing the filter frequency once it has converged to the target
        // (relative epsilon — equal perceptual margin at any frequency).
        const logRatio = Math.log(target / this.gazeFilterCurrentFreq);
        if (Math.abs(logRatio) < AUDIO_MASTER.gazeFilterEpsilon) {
            if (this.gazeFilterCurrentFreq !== target) {
                this.gazeFilterCurrentFreq = target;
                this.gazeLowPassFilter.frequency.setValueAtTime(
                    this.gazeFilterCurrentFreq,
                    this.audioContext.currentTime,
                );
            }
            return;
        }

        // Exponential approach in LOG-frequency space (flow-audit enhancement
        // #7): the old linear-Hz lerp spent most of its time inaudibly far
        // above the 400Hz closed target, stretching the perceived "muffle" to
        // 2-3x the promised 0.5s. Each frame now covers an equal fraction of
        // the REMAINING octaves; 1 - exp(-rate*dt) keeps the step exact and
        // frame-rate independent.
        const k = 1 - Math.exp(-AUDIO_MASTER.gazeFilterLerpSpeed * deltaTime);
        this.gazeFilterCurrentFreq *= Math.exp(logRatio * k);

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

        const stopTime = now + options.duration + 0.1;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(options.volume, now + attack);
        gain.gain.setTargetAtTime(0.001, now + attack, decay);

        // When the caller omits an explicit decay, the exponential approach (decay === duration)
        // is only ~1 time-constant in at stop time, leaving an audible click. Ramp to 0 first.
        if (options.decay === undefined) {
            gain.gain.linearRampToValueAtTime(0, stopTime);
        }

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(stopTime);
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
        // Ensure the envelope reaches true zero before stop to avoid an audible click.
        gain.gain.linearRampToValueAtTime(0, now + options.duration);

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
