// 1-bit Chimera Void - Procedural Audio System
// Minimalist 8-bit style audio to match 1-bit aesthetics

import type { AmbientNode, AudioSystemInterface } from '../types';

// Extend Window interface for webkit prefix
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

/**
 * Generates procedural audio using Web Audio API
 * Sound design philosophy: harsh, digital, binary - matching the 1-bit visual style
 */
export class AudioSystem implements AudioSystemInterface {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    public enabled: boolean = false;
    private ambientNode: AmbientNode | null = null;
    private lastFootstepTime: number = 0;

    // Gaze low-pass filter for disciplinary effect
    private gazeLowPassFilter: BiquadFilterNode | null = null;
    private gazeFilterTargetFreq: number = 20000;
    private gazeFilterCurrentFreq: number = 20000;

    // Binaural beat generator (for FORCED_ALIGNMENT room)
    private binauralLeft: OscillatorNode | null = null;
    private binauralRight: OscillatorNode | null = null;
    private binauralMerger: ChannelMergerNode | null = null;
    private binauralGain: GainNode | null = null;
    private binauralActive: boolean = false;

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init(): void {
        if (this.enabled) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();

            // Create master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3;

            // Create gaze low-pass filter (inserted before destination)
            this.gazeLowPassFilter = this.audioContext.createBiquadFilter();
            this.gazeLowPassFilter.type = 'lowpass';
            this.gazeLowPassFilter.frequency.value = 20000; // Full spectrum when not gazing
            this.gazeLowPassFilter.Q.value = 0.7;

            // Route: masterGain -> gazeLowPassFilter -> destination
            this.masterGain.connect(this.gazeLowPassFilter);
            this.gazeLowPassFilter.connect(this.audioContext.destination);

            this.enabled = true;

            // Start ambient drone
            this.startAmbientDrone();
        } catch (e) {
            console.warn('AudioSystem: Failed to initialize', e);
        }
    }

    /**
     * 1-bit style footstep - harsh square wave click
     */
    playFootstep(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        // Throttle footsteps
        const now = this.audioContext.currentTime;
        if (now - this.lastFootstepTime < 0.25) return;
        this.lastFootstepTime = now;

        // Create a harsh, digital click
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // Square wave for harsh digital sound
        osc.type = 'square';
        osc.frequency.value = 80 + Math.random() * 40; // 80-120 Hz

        // Very short envelope - click sound
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.setTargetAtTime(0.001, now, 0.02);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.05);
    }

    /**
     * Persistent ambient drone - low frequency oscillation
     * Creates an unsettling, digital atmosphere
     */
    private startAmbientDrone(): void {
        if (!this.enabled || this.ambientNode || !this.audioContext || !this.masterGain) return;

        // Low frequency oscillator
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Detuned sawtooth waves for thick sound
        osc1.type = 'sawtooth';
        osc1.frequency.value = 35; // Very low

        osc2.type = 'sawtooth';
        osc2.frequency.value = 35.5; // Slight detune for beating

        // Low pass filter
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 2;

        // Very quiet
        gain.gain.value = 0.08;

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc1.start();
        osc2.start();

        this.ambientNode = { osc1, osc2, gain, filter };
    }

    /**
     * Cable pulse sound - high frequency blip
     */
    playCablePulse(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // High pitched square wave
        osc.type = 'square';
        osc.frequency.value = 1200;
        osc.frequency.setTargetAtTime(600, now, 0.02);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.setTargetAtTime(0.001, now, 0.03);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.06);
    }

    /**
     * Eye blink sound - descending tone
     */
    playEyeBlink(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setTargetAtTime(0.001, now + 0.1, 0.02);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    /**
     * Day/night transition sound - rising/falling sweep
     * @param toNight - true if transitioning to night
     */
    playDayNightTransition(toNight: boolean): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'triangle';

        if (toNight) {
            // Descending for night
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
        } else {
            // Ascending for day
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
        }

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.setTargetAtTime(0.001, now + 0.4, 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.6);
    }

    /**
     * Set master volume
     * @param value - 0.0 to 1.0
     */
    setVolume(value: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, value));
        }
    }

    /**
     * Mute/unmute
     */
    toggleMute(): void {
        if (this.masterGain) {
            this.masterGain.gain.value = this.masterGain.gain.value > 0 ? 0 : 0.3;
        }
    }

    /**
     * Update gaze filter based on gaze state
     * @param isGazing - Whether player is looking at sky eye
     * @param gazeIntensity - 0-1, how directly looking (based on pitch)
     */
    updateGaze(isGazing: boolean, gazeIntensity: number): void {
        // Target: 20000Hz (open) -> 400Hz (full gaze)
        this.gazeFilterTargetFreq = isGazing
            ? 400 + (1 - gazeIntensity) * 19600
            : 20000;
    }

    /**
     * Smooth filter interpolation (call in animation loop)
     * @param deltaTime - Delta time in seconds
     */
    tick(deltaTime: number): void {
        if (!this.gazeLowPassFilter || !this.audioContext) return;

        // Smooth interpolation
        const lerpSpeed = 3.0;
        this.gazeFilterCurrentFreq +=
            (this.gazeFilterTargetFreq - this.gazeFilterCurrentFreq) * lerpSpeed * deltaTime;

        this.gazeLowPassFilter.frequency.setValueAtTime(
            this.gazeFilterCurrentFreq,
            this.audioContext.currentTime
        );
    }

    /**
     * Play override "tear" sound - dramatic white noise burst
     * Triggered when player activates resistance in POLARIZED room
     */
    playOverrideTear(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;

        // Create white noise buffer
        const bufferSize = Math.floor(this.audioContext.sampleRate * 0.3);
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        // Band-pass filter for "digital tear" character
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 1.5;

        // Dramatic envelope
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.01); // Fast attack
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25); // Quick decay

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + 0.3);
    }

    /**
     * Start binaural beat for FORCED_ALIGNMENT room
     * @param baseFreq - Base frequency (Hz)
     * @param beatFreq - Beat frequency difference (Hz)
     */
    startBinauralBeat(baseFreq: number = 55, beatFreq: number = 20): void {
        if (!this.enabled || !this.audioContext || !this.masterGain || this.binauralActive) return;

        // Create stereo merger
        this.binauralMerger = this.audioContext.createChannelMerger(2);

        // Left oscillator
        this.binauralLeft = this.audioContext.createOscillator();
        this.binauralLeft.type = 'sine';
        this.binauralLeft.frequency.value = baseFreq;

        // Right oscillator (detuned)
        this.binauralRight = this.audioContext.createOscillator();
        this.binauralRight.type = 'sine';
        this.binauralRight.frequency.value = baseFreq + beatFreq;

        // Gains for each channel
        const leftGain = this.audioContext.createGain();
        const rightGain = this.audioContext.createGain();
        leftGain.gain.value = 0.1;
        rightGain.gain.value = 0.1;

        // Route to separate channels
        this.binauralLeft.connect(leftGain);
        this.binauralRight.connect(rightGain);
        leftGain.connect(this.binauralMerger, 0, 0);  // Left channel
        rightGain.connect(this.binauralMerger, 0, 1); // Right channel

        // Master gain for binaural
        this.binauralGain = this.audioContext.createGain();
        this.binauralGain.gain.value = 0;
        this.binauralMerger.connect(this.binauralGain);
        this.binauralGain.connect(this.masterGain);

        // Start oscillators
        this.binauralLeft.start();
        this.binauralRight.start();

        // Fade in
        this.binauralGain.gain.setTargetAtTime(1, this.audioContext.currentTime, 0.5);

        this.binauralActive = true;
    }

    /**
     * Stop binaural beat
     */
    stopBinauralBeat(): void {
        if (!this.binauralActive || !this.audioContext) return;

        // Fade out then stop
        if (this.binauralGain) {
            this.binauralGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.3);
        }

        setTimeout(() => {
            if (this.binauralLeft) {
                this.binauralLeft.stop();
                this.binauralLeft = null;
            }
            if (this.binauralRight) {
                this.binauralRight.stop();
                this.binauralRight = null;
            }
            this.binauralMerger = null;
            this.binauralGain = null;
            this.binauralActive = false;
        }, 500);
    }

    /**
     * Update binaural beat intensity based on player X position
     * @param xPosition - Player X coordinate
     * @param crackWidth - Width of the neutral zone
     */
    updateBinauralPosition(xPosition: number, crackWidth: number): void {
        if (!this.binauralGain || !this.audioContext) return;

        // Closer to crack = stronger binaural effect
        const distanceFromCrack = Math.abs(xPosition);
        const intensity = Math.max(0, 1 - distanceFromCrack / crackWidth);

        this.binauralGain.gain.setTargetAtTime(
            intensity,
            this.audioContext.currentTime,
            0.1
        );
    }

    /**
     * Play high-frequency digital chirps (for INFO_OVERFLOW room)
     */
    playInfoChirp(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // Random high frequency
        osc.type = 'square';
        osc.frequency.value = 2000 + Math.random() * 8000;

        // Very short blip
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.setTargetAtTime(0.001, now, 0.01);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.03);
    }

    /**
     * Play gaze start pulse (single pulse when gaze begins)
     */
    playGazeStartPulse(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.value = 200;
        osc.frequency.setTargetAtTime(80, now, 0.1);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.setTargetAtTime(0.001, now + 0.1, 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }
}
