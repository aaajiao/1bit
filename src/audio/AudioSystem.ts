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

    /**
     * Initialize audio context (must be called after user interaction)
     */
    init(): void {
        if (this.enabled) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3; // Master volume
            this.masterGain.connect(this.audioContext.destination);
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
}
