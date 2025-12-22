// 1-bit Chimera Void - Procedural Audio System
// Minimalist 8-bit style audio to match 1-bit aesthetics

import type { AmbientNode, AudioSystemInterface } from '../types';
import { RoomType, RoomAudioConfig } from '../world/RoomConfig';

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

    // Weather audio state
    private weatherNoiseSource: AudioBufferSourceNode | null = null;
    private weatherNoiseGain: GainNode | null = null;
    private weatherRainInterval: number | null = null;
    private currentWeatherType: number = 0; // 0=clear, 1=static, 2=rain, 3=glitch

    // Flower audio state - IKEDA STYLE: pure sine, only during change
    private lastFlowerIntensity: number = -1;
    private lastFlowerState: number = -1; // -1=unset, 0=dim, 1=soft, 2=intense
    private flowerSilenceTimer: number = 0; // Frames since last change

    // Rift audio state
    private riftFogNode: { noise: AudioBufferSourceNode, gain: GainNode, filter: BiquadFilterNode, lfo: OscillatorNode } | null = null;
    private riftFallOsc: OscillatorNode | null = null;
    private riftFallNoise: AudioBufferSourceNode | null = null;
    private riftFallGain: GainNode | null = null;

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

        // Gains for each channel (louder for audibility)
        const leftGain = this.audioContext.createGain();
        const rightGain = this.audioContext.createGain();
        leftGain.gain.value = 0.4;
        rightGain.gain.value = 0.4;

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

    /**
     * Play room transition sound - digital threshold crossing
     * Extended version with layered noise and frequency sweep (~400ms)
     */
    playRoomTransition(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const duration = 0.4;

        // Layer 1: White noise with sweeping filter
        const bufferSize = Math.floor(this.audioContext.sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        // Bandpass filter sweeping from high to low
        const noiseFilter = this.audioContext.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(3000, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(400, now + duration);
        noiseFilter.Q.value = 3;

        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.setValueAtTime(0, now);
        noiseGain.gain.linearRampToValueAtTime(0.1, now + 0.02);
        noiseGain.gain.setValueAtTime(0.1, now + 0.1);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        // Layer 2: Descending tone sweep (digital "warp" feel)
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + duration * 0.8);

        const oscFilter = this.audioContext.createBiquadFilter();
        oscFilter.type = 'lowpass';
        oscFilter.frequency.setValueAtTime(2000, now);
        oscFilter.frequency.exponentialRampToValueAtTime(300, now + duration);

        const oscGain = this.audioContext.createGain();
        oscGain.gain.setValueAtTime(0, now);
        oscGain.gain.linearRampToValueAtTime(0.08, now + 0.03);
        oscGain.gain.setValueAtTime(0.08, now + 0.15);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(oscFilter);
        oscFilter.connect(oscGain);
        oscGain.connect(this.masterGain);

        // Start and stop
        noise.start(now);
        noise.stop(now + duration);
        osc.start(now);
        osc.stop(now + duration);
    }

    /**
     * Play jump sound - ascending digital blip (first jump)
     */
    playJump(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // Square wave for harsh 8-bit feel
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);

        // Short, punchy envelope
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setTargetAtTime(0.001, now + 0.05, 0.015);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.08);
    }

    /**
     * Play double jump sound - higher pitch, dual-tone burst
     * More urgent/special feeling than regular jump
     */
    playDoubleJump(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;

        // First tone (square wave)
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(250, now);
        osc1.frequency.exponentialRampToValueAtTime(500, now + 0.05);
        gain1.gain.setValueAtTime(0.1, now);
        gain1.gain.setTargetAtTime(0.001, now + 0.04, 0.01);
        osc1.connect(gain1);
        gain1.connect(this.masterGain);

        // Second tone (sine wave, slightly delayed) for "echo" effect
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(400, now + 0.03);
        osc2.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.setValueAtTime(0.08, now + 0.03);
        gain2.gain.setTargetAtTime(0.001, now + 0.07, 0.015);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);

        osc1.start(now);
        osc1.stop(now + 0.06);
        osc2.start(now + 0.03);
        osc2.stop(now + 0.1);
    }

    // ==================== RIFT AUDIO ====================

    /**
     * Start rift "Fog" sound - White noise with LFO filtered sweep
     * Creates a swelling, breathing mist effect
     */
    startRiftFog(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain || this.riftFogNode) return;

        const now = this.audioContext.currentTime;

        // 1. Create White Noise (simpler, louder)
        const bufferSize = this.audioContext.sampleRate * 2; // 2 seconds buffer
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // Standard white noise
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // 2. Filter with LFO
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 2; // Higher resonance for "windy" feel
        filter.frequency.value = 600; // Higher base frequency

        const lfo = this.audioContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.2; // 5 seconds cycle

        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 400; // Large sweep

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        // 3. Gain control
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0, now);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
        lfo.start(now);

        this.riftFogNode = { noise, gain, filter, lfo };
    }

    /**
     * Update rift fog intensity based on distance
     * @param intensity 0.0 to 1.0 (1.0 = at the edge)
     */
    updateRiftFog(intensity: number): void {
        if (!this.riftFogNode || !this.audioContext) return;

        // Louder target volume (0.8 max instead of 0.25)
        const targetVol = Math.max(0, Math.min(1, intensity)) * 0.8;

        // Use exponential ramp for more natural volume change, but ensure we don't hit 0 exactly for exp ramp
        // Fallback to setTargetAtTime
        this.riftFogNode.gain.gain.setTargetAtTime(targetVol, this.audioContext.currentTime, 0.2);
    }

    /**
     * Stop rift fog sound
     */
    stopRiftFog(): void {
        if (!this.riftFogNode) return;

        const { noise, gain, lfo } = this.riftFogNode;
        const now = this.audioContext?.currentTime || 0;

        // Fade out
        gain.gain.setTargetAtTime(0, now, 0.5);

        setTimeout(() => {
            noise.stop();
            lfo.stop();
        }, 600);

        this.riftFogNode = null;
    }

    /**
     * Start rift fall sound - Dramatic wind rush + shepherd-like Shepard tone feel
     */
    playRiftFall(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain || this.riftFallGain) return;

        const now = this.audioContext.currentTime;

        // Master gain for this effect
        this.riftFallGain = this.audioContext.createGain();
        this.riftFallGain.gain.setValueAtTime(0, now);
        this.riftFallGain.gain.linearRampToValueAtTime(0.4, now + 0.5); // Fade in relatively fast
        this.riftFallGain.connect(this.masterGain);

        // 1. Wind Rush (Filtered Noise)
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.riftFallNoise = this.audioContext.createBufferSource();
        this.riftFallNoise.buffer = buffer;
        this.riftFallNoise.loop = true;

        const windFilter = this.audioContext.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.Q.value = 1;
        windFilter.frequency.setValueAtTime(400, now);
        // Frequency rises as we fall (Doppler-ish / intensity increase)
        windFilter.frequency.exponentialRampToValueAtTime(2000, now + 3.0);

        this.riftFallNoise.connect(windFilter);
        windFilter.connect(this.riftFallGain);

        // 2. Descending Shepard-like Oscillator (The "falling" sensation)
        this.riftFallOsc = this.audioContext.createOscillator();
        this.riftFallOsc.type = 'sawtooth';
        this.riftFallOsc.frequency.setValueAtTime(200, now);
        this.riftFallOsc.frequency.exponentialRampToValueAtTime(50, now + 3.0); // Drop in pitch

        const oscGain = this.audioContext.createGain();
        oscGain.gain.value = 0.15;

        this.riftFallOsc.connect(oscGain);
        oscGain.connect(this.riftFallGain);

        this.riftFallNoise.start(now);
        this.riftFallOsc.start(now);
    }

    /**
     * Stop fall sound immediately (e.g. if player jumps out of rift)
     */
    stopRiftFall(): void {
        if (!this.riftFallGain || !this.audioContext) return;

        const now = this.audioContext.currentTime;

        // Fade out quickly
        this.riftFallGain.gain.cancelScheduledValues(now);
        this.riftFallGain.gain.setValueAtTime(this.riftFallGain.gain.value, now);
        this.riftFallGain.gain.linearRampToValueAtTime(0, now + 0.1);

        const oldNoise = this.riftFallNoise;
        const oldOsc = this.riftFallOsc;
        const oldGain = this.riftFallGain;

        setTimeout(() => {
            oldNoise?.stop();
            oldOsc?.stop();
            oldGain?.disconnect();
        }, 150);

        this.riftFallNoise = null;
        this.riftFallOsc = null;
        this.riftFallGain = null;
    }

    /**
     * Stop fall sound and play respawn "pop"
     */
    playRiftRespawn(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        // Stop falling sound first
        this.stopRiftFall();

        const now = this.audioContext.currentTime;

        // Play Respawn Pop - Reverse suction feel
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1); // Rapid rise

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    // ==================== WEATHER AUDIO ====================

    /**
     * Update weather audio based on current weather state
     * @param weatherType - 0=clear, 1=static, 2=rain, 3=glitch
     * @param intensity - 0 to 1
     */
    updateWeatherAudio(weatherType: number, intensity: number): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        // Handle weather type changes
        if (weatherType !== this.currentWeatherType) {
            // Stop previous weather audio
            this.stopStaticAmbient();
            this.stopRainAmbient();

            // Start new weather audio
            if (weatherType === 1) {
                this.startStaticAmbient();
            } else if (weatherType === 2) {
                this.startRainAmbient();
            } else if (weatherType === 3) {
                this.playGlitchBurst();
            }

            this.currentWeatherType = weatherType;
        }

        // Update intensity
        if (this.weatherNoiseGain) {
            this.weatherNoiseGain.gain.setTargetAtTime(
                intensity * 0.15,
                this.audioContext.currentTime,
                0.1
            );
        }
    }

    /**
     * Start static ambient - "Low Frequency Drone"
     * DISTINCT: Continuous low-frequency oscillation with slow LFO modulation
     * FREQUENCY RANGE: 40-80Hz (very low, felt more than heard)
     */
    private startStaticAmbient(): void {
        if (!this.audioContext || !this.masterGain || this.weatherNoiseSource) return;

        // Gain control for overall volume
        this.weatherNoiseGain = this.audioContext.createGain();
        this.weatherNoiseGain.gain.value = 0;
        this.weatherNoiseGain.connect(this.masterGain);

        // Main drone oscillator (50Hz - very low)
        const drone = this.audioContext.createOscillator();
        drone.type = 'triangle'; // Softer than square
        drone.frequency.value = 50;

        // LFO for slow pitch modulation (creates "breathing" feel)
        const lfo = this.audioContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.3; // Very slow: 0.3Hz = 3 second cycle

        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 10; // Modulate pitch by ±10Hz

        lfo.connect(lfoGain);
        lfoGain.connect(drone.frequency);

        // Drone gain
        const droneGain = this.audioContext.createGain();
        droneGain.gain.value = 0.25;
        drone.connect(droneGain);
        droneGain.connect(this.weatherNoiseGain);

        // Second harmonic for thickness (100Hz)
        const harmonic = this.audioContext.createOscillator();
        harmonic.type = 'sine';
        harmonic.frequency.value = 100;
        const harmonicGain = this.audioContext.createGain();
        harmonicGain.gain.value = 0.08;
        harmonic.connect(harmonicGain);
        harmonicGain.connect(this.weatherNoiseGain);

        drone.start();
        lfo.start();
        harmonic.start();

        // Store for cleanup
        this.weatherNoiseSource = drone as unknown as AudioBufferSourceNode;
        // Store LFO and harmonic in a cleanup array (hacky but works)
        (this as any)._staticExtra = [lfo, harmonic];
    }

    /**
     * Stop static ambient noise
     */
    private stopStaticAmbient(): void {
        if (this.weatherNoiseSource) {
            try {
                (this.weatherNoiseSource as unknown as OscillatorNode).stop();
            } catch (e) { /* Already stopped */ }
            this.weatherNoiseSource = null;
        }
        // Stop extra oscillators
        const extra = (this as any)._staticExtra as OscillatorNode[] | undefined;
        if (extra) {
            extra.forEach(osc => { try { osc.stop(); } catch (e) { /* */ } });
            (this as any)._staticExtra = null;
        }
        this.weatherNoiseGain = null;
    }

    /**
     * Start rain ambient - "Melodic Descent"
     * DISTINCT: Long sine tone sweeps with slow decay
     * FREQUENCY RANGE: 300-1200Hz (mid-range, clearly audible tones)
     */
    private startRainAmbient(): void {
        if (!this.audioContext || !this.masterGain || this.weatherRainInterval) return;

        // Gain node for overall rain volume
        this.weatherNoiseGain = this.audioContext.createGain();
        this.weatherNoiseGain.gain.value = 0;
        this.weatherNoiseGain.connect(this.masterGain);

        // Musical note frequencies (pentatonic scale)
        const notes = [1200, 900, 800, 600, 400, 300];
        let noteIndex = 0;

        const playTone = () => {
            if (!this.audioContext || !this.weatherNoiseGain) return;

            const now = this.audioContext.currentTime;
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            // Pure sine for clean tone
            osc.type = 'sine';

            // Start at note, glide down slightly
            const startFreq = notes[noteIndex];
            osc.frequency.setValueAtTime(startFreq, now);
            osc.frequency.exponentialRampToValueAtTime(startFreq * 0.8, now + 0.4);

            // Long envelope: 400ms with slow decay
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.setValueAtTime(0.1, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            osc.connect(gain);
            gain.connect(this.weatherNoiseGain);

            osc.start(now);
            osc.stop(now + 0.45);

            // Cycle through notes
            noteIndex = (noteIndex + 1) % notes.length;
        };

        // 500ms interval for spacious feel
        const scheduleNextTone = () => {
            if (this.weatherRainInterval === null) return;
            playTone();
            this.weatherRainInterval = window.setTimeout(scheduleNextTone, 500);
        };

        this.weatherRainInterval = window.setTimeout(scheduleNextTone, 0);
    }

    /**
     * Stop rain ambient
     */
    private stopRainAmbient(): void {
        if (this.weatherRainInterval !== null) {
            clearTimeout(this.weatherRainInterval);
            this.weatherRainInterval = null;
        }
        this.weatherNoiseGain = null;
    }

    /**
     * Play glitch burst - "Digital Stutter"
     * DISTINCT: Extended chaotic high-frequency pattern with stuttering
     * FREQUENCY RANGE: 2000-6000Hz (high, harsh, clearly different from others)
     * DURATION: 600-1000ms (much longer)
     */
    playGlitchBurst(): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const totalDuration = 0.6 + Math.random() * 0.4; // 600-1000ms

        // Play rapid stuttering pattern
        const burstCount = 8 + Math.floor(Math.random() * 8); // 8-16 bursts

        for (let i = 0; i < burstCount; i++) {
            // Variable timing (creates stutter effect)
            const burstStart = now + i * (totalDuration / burstCount);
            const burstDuration = 0.02 + Math.random() * 0.04; // 20-60ms each

            // Random silence gaps (30% chance to skip)
            if (Math.random() < 0.3) continue;

            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            // High frequency range (clearly different from drone and tones)
            osc.type = 'square';
            const baseFreq = 2000 + Math.random() * 4000; // 2-6kHz
            osc.frequency.setValueAtTime(baseFreq, burstStart);

            // Pitch jump mid-burst for chaotic feel
            if (Math.random() > 0.5) {
                osc.frequency.setValueAtTime(baseFreq * 1.5, burstStart + burstDuration * 0.5);
            }

            // Sharp on/off
            gain.gain.setValueAtTime(0.08, burstStart);
            gain.gain.setValueAtTime(0, burstStart + burstDuration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(burstStart);
            osc.stop(burstStart + burstDuration + 0.01);
        }
    }

    // ==================== FLOWER AUDIO - IKEDA STYLE ====================

    /**
     * Update flower audio based on current intensity
     * IKEDA STYLE: Only plays during intensity CHANGE, silent when stable
     * Uses pure sine waves, mathematically precise
     * @param intensity - 0.0 to 1.0
     */
    updateFlowerAudio(intensity: number): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        // Determine current state (0=dim, 1=soft, 2=intense)
        let currentState = 0;
        if (intensity >= 0.7) currentState = 2;
        else if (intensity >= 0.3) currentState = 1;

        // Check for state transition - play confirmation tone
        if (this.lastFlowerState !== -1 && currentState !== this.lastFlowerState) {
            const ascending = currentState > this.lastFlowerState;
            this.playFlowerStateChange(ascending);
        }
        this.lastFlowerState = currentState;

        // Calculate change magnitude
        const changeThreshold = 0.01; // Minimum change to trigger sound
        const intensityChange = Math.abs(intensity - this.lastFlowerIntensity);

        if (this.lastFlowerIntensity >= 0 && intensityChange > changeThreshold) {
            // Play a brief tone proportional to current intensity
            this.playFlowerChangeTone(intensity, intensityChange);
            this.flowerSilenceTimer = 0;
        } else {
            // No significant change - increment silence timer
            this.flowerSilenceTimer++;
        }

        this.lastFlowerIntensity = intensity;
    }

    /**
     * Play a brief pure sine tone during intensity change
     * Frequency maps to intensity, volume maps to change speed
     * @param intensity - Current intensity 0-1
     * @param changeSpeed - How fast intensity is changing
     */
    private playFlowerChangeTone(intensity: number, changeSpeed: number): void {
        if (!this.audioContext || !this.masterGain) return;

        // Allow overlapping tones for continuity
        if (this.flowerSilenceTimer < 2) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // Pure sine wave
        osc.type = 'sine';

        // Frequency: 150Hz (dim) to 500Hz (intense) - softer, lower range
        const baseFreq = 150;
        const freq = baseFreq + intensity * 350; // Linear 150-500Hz
        osc.frequency.value = freq;

        // Volume: very soft (max 0.06)
        const volume = Math.min(changeSpeed * 2 + 0.02, 0.06);

        // Duration with soft fade-in and long decay (200-400ms)
        const duration = 0.2 + changeSpeed * 0.2;

        // Soft attack (fade in over 30ms)
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.03);
        gain.gain.setValueAtTime(volume, now + duration * 0.4); // Hold
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    /**
     * Play state change confirmation tone
     * @param ascending - true if intensity increased, false if decreased
     */
    playFlowerStateChange(ascending: boolean): void {
        if (!this.enabled || !this.audioContext || !this.masterGain) return;

        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        // Pure sine - Ikeda precision
        osc.type = 'sine';

        if (ascending) {
            // Ascending: pure fifth interval (3:2 ratio)
            // 400Hz → 600Hz (perfect fifth)
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        } else {
            // Descending: perfect fourth interval (4:3 ratio)
            // 600Hz → 450Hz
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(450, now + 0.08);
        }

        // Short, clean envelope
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    /**
     * Stop flower audio (cleanup/reset state)
     */
    stopFlowerAudio(): void {
        this.lastFlowerIntensity = -1;
        this.lastFlowerState = -1;
        this.flowerSilenceTimer = 0;
    }
    /**
     * Handle audio changes when switching rooms
     * @param prevType - Previous room type
     * @param newType - New room type
     * @param audioConfig - Audio configuration for the new room
     */
    onRoomChange(prevType: RoomType | null, newType: RoomType, audioConfig: RoomAudioConfig): void {
        if (!this.enabled) return;

        // Play transition sound (skip initial load)
        if (prevType !== null) {
            this.playRoomTransition();
        }

        // Stop previous effects
        if (prevType === RoomType.FORCED_ALIGNMENT) {
            console.log('[Audio] Stopping binaural beat');
            this.stopBinauralBeat();
        }

        // Start new effects
        if (newType === RoomType.FORCED_ALIGNMENT) {
            if (audioConfig.beatFrequency) {
                console.log(`[Audio] Starting binaural beat: ${audioConfig.baseFrequency}Hz + ${audioConfig.beatFrequency}Hz`);
                this.startBinauralBeat(
                    audioConfig.baseFrequency,
                    audioConfig.beatFrequency
                );
            } else {
                console.warn('[Audio] No beatFrequency in config!');
            }
        }
    }
}

