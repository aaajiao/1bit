/**
 * AudioController - High-level audio controller
 * Encapsulates all game sound effect playback logic, uses AudioEngine low-level API
 * Implements AudioSystemInterface for backward compatibility
 */

import type { AmbientNode, AudioSystemInterface } from '../types';
import type { RoomAudioConfig } from '../world/RoomConfig';
import {
    BINAURAL_SIDE_CONFIG,
    CABLE_AUDIO_CONFIG,
    DISTANT_TEAR_CONFIG,
    FLOWER_ATTENTION_CONFIG,
    FLOWER_CHANGE_TONE_CONFIG,
    FOOTSTEP_CONFIG,
    INFO_CHIRP_CONFIG,
    OVERRIDE_DENIED_CONFIG,
    POLARIZED_BEAT_CONFIG,
    RIFT_AUDIO_CONFIG,
    ROOM_AMBIENT_CONFIG,
    SNAPSHOT_AUDIO_CONFIG,
    SUNSET_FORESHADOW_AUDIO,
    WEATHER_AUDIO_CONFIG,
} from '../config';
import { RoomType } from '../world/RoomConfig';
import { AudioEngine } from './AudioEngine';

export class AudioController implements AudioSystemInterface {
    private engine: AudioEngine;

    // Ambient drone state
    private ambientNode: AmbientNode | null = null;

    // Throttle state
    private lastFootstepTime: number = 0;

    // Binaural state
    private binauralLeft: OscillatorNode | null = null;
    private binauralRight: OscillatorNode | null = null;
    private binauralMerger: ChannelMergerNode | null = null;
    private binauralGain: GainNode | null = null;
    private binauralActive: boolean = false;
    // Base/beat frequencies of the active binaural pair, kept so the side
    // asymmetry (flow-audit break #7) can retune the beat around them.
    private binauralBaseFreq: number = 0;
    private binauralBeatFreq: number = 0;

    // Weather state
    private weatherNoiseSource: AudioBufferSourceNode | null = null;
    private weatherNoiseGain: GainNode | null = null;
    private weatherRainInterval: number | null = null;
    private currentWeatherType: number = 0;
    private _staticExtra: OscillatorNode[] | null = null;

    // Flower state
    private lastFlowerState: number = -1;
    // Debounce clock (AudioContext time) for the event-driven intensity
    // confirm tone (flow-audit medium #6).
    private lastFlowerToneTime: number = -1;
    // "Being watched" hum (flow-audit break #4): created lazily on first use,
    // then kept alive with its gain riding the flower intensity.
    private flowerAttentionNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null;

    // Rift state
    private riftFogNode: { noise: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; lfo: OscillatorNode } | null = null;
    private riftFallOsc: OscillatorNode | null = null;
    private riftFallNoise: AudioBufferSourceNode | null = null;
    private riftFallGain: GainNode | null = null;

    // Cable hum state
    private cableHumNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;

    // Per-room ambient state
    // Pooled looping white-noise buffer, created once and reused across every
    // room's noise bed (a fresh BufferSource is cheap; the buffer is not).
    private noiseBedBuffer: AudioBuffer | null = null;
    // Currently active room noise bed; torn down before the next one starts.
    private roomNoiseBed: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
    // Debounce: defer drone retune / noise-bed swap until the room is stable, so
    // oscillating across a chunk seam doesn't thrash Web Audio nodes.
    private retuneTimer: number | null = null;
    private pendingRoomType: RoomType | null = null;

    /**
     * Audio-clock time (s) of the last transition whoosh. -Infinity so the
     * very first room change always whooshes (flow-audit medium #5 cooldown).
     */
    private lastRoomWhooshTime: number = -Infinity;

    // POLARIZED binary pulse layer (flow-audit medium #2): rain-ambient style
    // setTimeout scheduling; the interval re-reads the latest gaze intensity
    // each tick so gazing audibly quickens the metronome.
    private polarizedBeatTimer: number | null = null;
    private polarizedBeatGain: GainNode | null = null;
    private polarizedBeatHigh: boolean = false;
    /** Latest gaze intensity (0 when not gazing), fed per frame by updateGaze. */
    private polarizedGazeIntensity: number = 0;

    // Ambient drone frequencies as last retuned (startAmbientDrone /
    // retuneAmbientDrone), so the sunset foreshadow can descend RELATIVE to
    // whatever room the drone is currently tuned to.
    private droneBaseFreq: number = 35;
    private dronePartnerFreq: number = 35.5;
    /** Foreshadow level whose drone descent was last applied (write debounce). */
    private appliedSunsetForeshadow: number = 0;

    constructor() {
        this.engine = new AudioEngine();
    }

    get enabled(): boolean {
        return this.engine.enabled;
    }

    init(): void {
        this.engine.init();
        if (this.engine.enabled) {
            this.startAmbientDrone();
        }
    }

    // ==================== Passthrough Methods ====================

    setVolume(value: number): void {
        this.engine.setVolume(value);
    }

    toggleMute(): void {
        this.engine.toggleMute();
    }

    /**
     * Resume the audio context if suspended (e.g. after tab blur/focus).
     * main wires persistent visibility/focus listeners that call this.
     */
    resume(): void {
        this.engine.resume();
    }

    /**
     * Suspend the audio context (pause state machine).
     */
    suspend(): void {
        this.engine.suspend();
    }

    updateGaze(isGazing: boolean, gazeIntensity: number): void {
        this.engine.updateGazeFilter(isGazing, gazeIntensity);
        // Feed the POLARIZED pulse scheduler (flow-audit medium #2): each
        // scheduled tick reads this to compress its next interval.
        this.polarizedGazeIntensity = isGazing ? gazeIntensity : 0;
    }

    /**
     * Sunset-settlement audio convergence (flow-audit enhancement #9): cap
     * the master lowpass for a few seconds while the snapshot lands, riding
     * the existing gaze-filter glide pipeline.
     */
    duckForSnapshot(): void {
        this.engine.applyTemporaryLowpass(
            SNAPSHOT_AUDIO_CONFIG.lowpassFreq,
            SNAPSHOT_AUDIO_CONFIG.holdSeconds,
        );
    }

    /**
     * Pre-sunset drone descent (flow-audit enhancement #8): slide the ambient
     * drone down by up to droneDropFraction across the foreshadow ramp
     * (0 = none, 1 = sunset moment). Called per frame; writes are debounced
     * to meaningful level changes so the steady state costs nothing.
     */
    updateSunsetForeshadow(level: number): void {
        const f = Math.max(0, Math.min(1, level));
        if (Math.abs(f - this.appliedSunsetForeshadow) < SUNSET_FORESHADOW_AUDIO.applyEpsilon)
            return;
        const ctx = this.engine.getContext();
        if (!ctx || !this.ambientNode)
            return;
        this.appliedSunsetForeshadow = f;

        const mult = 1 - f * SUNSET_FORESHADOW_AUDIO.droneDropFraction;
        const now = ctx.currentTime;
        const glide = SUNSET_FORESHADOW_AUDIO.glide;
        this.ambientNode.osc1.frequency.setTargetAtTime(this.droneBaseFreq * mult, now, glide);
        this.ambientNode.osc2.frequency.setTargetAtTime(this.dronePartnerFreq * mult, now, glide);
    }

    tick(deltaTime: number): void {
        this.engine.tick(deltaTime);
    }

    // ==================== Ambient Drone ====================

    private startAmbientDrone(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.ambientNode)
            return;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc1.type = 'sawtooth';
        osc1.frequency.value = this.droneBaseFreq;
        osc2.type = 'sawtooth';
        osc2.frequency.value = this.dronePartnerFreq;

        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 2;
        gain.gain.value = 0.08;

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(master);

        osc1.start();
        osc2.start();

        this.ambientNode = { osc1, osc2, gain, filter };
    }

    // ==================== Simple Sounds ====================

    playFootstep(): void {
        const ctx = this.engine.getContext();
        if (!ctx)
            return;
        const now = ctx.currentTime;
        if (now - this.lastFootstepTime < FOOTSTEP_CONFIG.minInterval)
            return;
        this.lastFootstepTime = now;

        this.engine.playTone({
            type: 'square',
            frequency: FOOTSTEP_CONFIG.minFrequency
                + Math.random() * (FOOTSTEP_CONFIG.maxFrequency - FOOTSTEP_CONFIG.minFrequency),
            duration: 0.05,
            volume: FOOTSTEP_CONFIG.volume,
            decay: 0.02,
        });
    }

    playCablePulse(): void {
        this.engine.playTone({
            type: 'square',
            frequency: 1200 + Math.random() * 500,
            frequencyEnd: 600,
            duration: 0.1,
            volume: 0.15,
            decay: 0.05,
        });
    }

    playEyeBlink(): void {
        this.engine.playTone({
            type: 'sine',
            frequency: 400,
            frequencyEnd: 100,
            duration: 0.2,
            volume: 0.1,
            decay: 0.02,
        });
    }

    playDayNightTransition(toNight: boolean): void {
        this.engine.playTone({
            type: 'triangle',
            frequency: toNight ? 800 : 100,
            frequencyEnd: toNight ? 100 : 800,
            duration: 0.6,
            volume: 0.15,
            decay: 0.05,
        });
    }

    playJump(): void {
        this.engine.playTone({
            type: 'square',
            frequency: 150,
            frequencyEnd: 300,
            duration: 0.08,
            volume: 0.12,
            decay: 0.015,
        });
    }

    playDoubleJump(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master)
            return;

        const now = ctx.currentTime;

        // First tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(250, now);
        osc1.frequency.exponentialRampToValueAtTime(500, now + 0.05);
        gain1.gain.setValueAtTime(0.1, now);
        gain1.gain.setTargetAtTime(0.001, now + 0.04, 0.01);
        osc1.connect(gain1);
        gain1.connect(master);

        // Second tone (delayed)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(400, now + 0.03);
        osc2.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.setValueAtTime(0.08, now + 0.03);
        gain2.gain.setTargetAtTime(0.001, now + 0.07, 0.015);
        osc2.connect(gain2);
        gain2.connect(master);

        osc1.start(now);
        osc1.stop(now + 0.06);
        osc2.start(now + 0.03);
        osc2.stop(now + 0.1);
    }

    playGazeStartPulse(): void {
        this.engine.playTone({
            type: 'sine',
            frequency: 200,
            frequencyEnd: 80,
            duration: 0.15,
            volume: 0.15,
        });
    }

    /**
     * INFO_OVERFLOW data chirp. Volume scales with the flower intensity
     * (flow-audit break #8): a brighter flower makes each chirp louder,
     * INFO_CHIRP_CONFIG.minVolume -> maxVolume across the 0-1 range.
     */
    playInfoChirp(flowerIntensity: number = 0.5): void {
        const t = Math.max(0, Math.min(1, flowerIntensity));
        this.engine.playTone({
            type: 'square',
            frequency: 2000 + Math.random() * 8000,
            duration: 0.03,
            volume: INFO_CHIRP_CONFIG.minVolume
                + t * (INFO_CHIRP_CONFIG.maxVolume - INFO_CHIRP_CONFIG.minVolume),
            decay: 0.01,
        });
    }

    playOverrideTear(): void {
        this.engine.playNoise({
            duration: 0.3,
            volume: 0.4,
            filterType: 'bandpass',
            filterFreq: 2000,
            filterQ: 1.5,
        });
    }

    /**
     * Distant tear for a silhouette's rebellion (F3): the player's own
     * override tear heard from far away — quieter, duller (lowpassed) and
     * slightly longer. `proximity` in [0,1] scales the volume (1 = the
     * closest possible trigger distance, 0 = the farthest), so the rip
     * always reads as happening ELSEWHERE, never to you.
     */
    playDistantTear(proximity: number): void {
        const p = Math.max(0, Math.min(1, proximity));
        this.engine.playNoise({
            duration: DISTANT_TEAR_CONFIG.duration,
            volume: DISTANT_TEAR_CONFIG.minVolume
                + p * (DISTANT_TEAR_CONFIG.maxVolume - DISTANT_TEAR_CONFIG.minVolume),
            filterType: 'lowpass',
            filterFreq: DISTANT_TEAR_CONFIG.filterFreq,
            filterQ: DISTANT_TEAR_CONFIG.filterQ,
        });
    }

    /**
     * Extremely light low-frequency thud for an override key press that is
     * denied because the player is not gazing (flow-audit break #2): a felt
     * "wrong direction" nudge, deliberately quieter than any success sound.
     */
    playOverrideDeniedThud(): void {
        this.engine.playTone({
            type: 'sine',
            frequency: OVERRIDE_DENIED_CONFIG.frequency,
            frequencyEnd: OVERRIDE_DENIED_CONFIG.frequencyEnd,
            duration: OVERRIDE_DENIED_CONFIG.duration,
            volume: OVERRIDE_DENIED_CONFIG.volume,
        });
    }

    playRoomTransition(): void {
        // Simplified: just play noise + tone
        this.engine.playNoise({
            duration: 0.4,
            volume: 0.1,
            filterType: 'bandpass',
            filterFreq: 1500,
            filterQ: 3,
        });
        this.engine.playTone({
            type: 'sawtooth',
            frequency: 800,
            frequencyEnd: 150,
            duration: 0.4,
            volume: 0.08,
        });
    }

    playGlitchBurst(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master)
            return;

        const now = ctx.currentTime;
        const totalDuration = 0.6 + Math.random() * 0.4;
        const burstCount = 8 + Math.floor(Math.random() * 8);

        for (let i = 0; i < burstCount; i++) {
            const burstStart = now + i * (totalDuration / burstCount);
            const burstDuration = 0.02 + Math.random() * 0.04;
            if (Math.random() < 0.3)
                continue;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(
                WEATHER_AUDIO_CONFIG.glitchMinFreq
                + Math.random() * (WEATHER_AUDIO_CONFIG.glitchMaxFreq - WEATHER_AUDIO_CONFIG.glitchMinFreq),
                burstStart,
            );
            gain.gain.setValueAtTime(0.08, burstStart);
            gain.gain.setValueAtTime(0, burstStart + burstDuration);
            osc.connect(gain);
            gain.connect(master);
            osc.start(burstStart);
            osc.stop(burstStart + burstDuration + 0.01);
        }
    }

    // ==================== Weather ====================

    updateWeatherAudio(weatherType: number, intensity: number): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master)
            return;

        if (weatherType !== this.currentWeatherType) {
            this.stopStaticAmbient();
            this.stopRainAmbient();

            if (weatherType === 1)
                this.startStaticAmbient();
            else if (weatherType === 2)
                this.startRainAmbient();
            else if (weatherType === 3)
                this.playGlitchBurst();

            this.currentWeatherType = weatherType;
        }

        if (this.weatherNoiseGain) {
            this.weatherNoiseGain.gain.setTargetAtTime(intensity * 0.15, ctx.currentTime, 0.1);
        }
    }

    private startStaticAmbient(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.weatherNoiseSource)
            return;

        this.weatherNoiseGain = ctx.createGain();
        this.weatherNoiseGain.gain.value = 0;
        this.weatherNoiseGain.connect(master);

        const drone = ctx.createOscillator();
        drone.type = 'triangle';
        drone.frequency.value = WEATHER_AUDIO_CONFIG.staticFrequency;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.3;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfoGain.connect(drone.frequency);

        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.25;
        drone.connect(droneGain);
        droneGain.connect(this.weatherNoiseGain);

        const harmonic = ctx.createOscillator();
        harmonic.type = 'sine';
        harmonic.frequency.value = 100;
        const harmonicGain = ctx.createGain();
        harmonicGain.gain.value = 0.08;
        harmonic.connect(harmonicGain);
        harmonicGain.connect(this.weatherNoiseGain);

        drone.start();
        lfo.start();
        harmonic.start();

        this.weatherNoiseSource = drone as unknown as AudioBufferSourceNode;
        this._staticExtra = [lfo, harmonic];
    }

    private stopStaticAmbient(): void {
        if (this.weatherNoiseSource) {
            try { (this.weatherNoiseSource as unknown as OscillatorNode).stop(); }
            catch { }
            this.weatherNoiseSource = null;
        }
        if (this._staticExtra) {
            this._staticExtra.forEach((osc) => {
                try { osc.stop(); }
                catch { }
            });
            this._staticExtra = null;
        }
        this.weatherNoiseGain?.disconnect();
        this.weatherNoiseGain = null;
    }

    private startRainAmbient(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.weatherRainInterval)
            return;

        this.weatherNoiseGain = ctx.createGain();
        this.weatherNoiseGain.gain.value = 0;
        this.weatherNoiseGain.connect(master);

        const notes = WEATHER_AUDIO_CONFIG.rainNotes;
        let noteIndex = 0;

        const playTone = () => {
            if (!ctx || !this.weatherNoiseGain)
                return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const startFreq = notes[noteIndex];
            osc.frequency.setValueAtTime(startFreq, now);
            osc.frequency.exponentialRampToValueAtTime(startFreq * 0.8, now + 0.4);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.connect(gain);
            gain.connect(this.weatherNoiseGain!);
            osc.start(now);
            osc.stop(now + 0.45);
            noteIndex = (noteIndex + 1) % notes.length;
        };

        const schedule = () => {
            if (this.weatherRainInterval === null)
                return;
            playTone();
            this.weatherRainInterval = window.setTimeout(schedule, WEATHER_AUDIO_CONFIG.rainInterval);
        };
        this.weatherRainInterval = window.setTimeout(schedule, 0);
    }

    private stopRainAmbient(): void {
        if (this.weatherRainInterval !== null) {
            clearTimeout(this.weatherRainInterval);
            this.weatherRainInterval = null;
        }
        this.weatherNoiseGain?.disconnect();
        this.weatherNoiseGain = null;
    }

    // ==================== Flower ====================

    updateFlowerAudio(intensity: number): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master)
            return;

        let currentState = 0;
        if (intensity >= 0.7)
            currentState = 2;
        else if (intensity >= 0.3)
            currentState = 1;

        if (this.lastFlowerState !== -1 && currentState !== this.lastFlowerState) {
            this.playFlowerStateChange(currentState > this.lastFlowerState);
        }
        this.lastFlowerState = currentState;

        // NOTE: the per-frame intensity-change confirm tone used to live here,
        // but its threshold math could never fire at >=30fps (flow-audit
        // medium #6). The tone is now event-driven: Controls' intensity-change
        // callback calls playFlowerChangeTone directly.

        // "Being watched" hum rides the same per-frame intensity feed
        // (flow-audit break #4: a bright flower attracts the sky eye).
        this.updateFlowerAttentionHum(intensity);
    }

    /**
     * Low "being watched" hum that fades in once the flower is bright enough
     * to attract the sky eye (flow-audit break #4). Nodes are created lazily
     * the first time the threshold is crossed, then kept alive with the gain
     * riding the intensity (no per-frame node churn); a slow LFO wobbles the
     * frequency so the presence breathes. Gentle by config.
     */
    private updateFlowerAttentionHum(intensity: number): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master)
            return;

        const cfg = FLOWER_ATTENTION_CONFIG;
        const drive = cfg.threshold >= 1
            ? 0
            : Math.max(0, Math.min(1, (intensity - cfg.threshold) / (1 - cfg.threshold)));

        if (!this.flowerAttentionNode) {
            if (drive <= 0)
                return;

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = cfg.frequency;

            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = cfg.lfoRate;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = cfg.lfoDepth;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(master);

            osc.start();
            lfo.start();
            this.flowerAttentionNode = { osc, gain, lfo, lfoGain };
        }

        this.flowerAttentionNode.gain.gain.setTargetAtTime(
            drive * cfg.maxGain,
            ctx.currentTime,
            cfg.fadeTime,
        );
    }

    /**
     * Stop and release the "being watched" hum nodes (dispose path).
     */
    private stopFlowerAttentionHum(): void {
        if (!this.flowerAttentionNode)
            return;
        const { osc, gain, lfo, lfoGain } = this.flowerAttentionNode;
        this.flowerAttentionNode = null;
        try { osc.stop(); }
        catch { }
        try { lfo.stop(); }
        catch { }
        lfoGain.disconnect();
        gain.disconnect();
    }

    /**
     * Confirm tone for a player-driven flower intensity change (wheel / Q-E /
     * touch buttons). Event-driven (flow-audit medium #6): called from the
     * Controls intensity-change callback, debounced so a fast scroll burst
     * doesn't machine-gun. Pitch rises with the new intensity, so repeated
     * ticks read as an ascending/descending scale.
     */
    playFlowerChangeTone(intensity: number): void {
        const ctx = this.engine.getContext();
        if (!ctx)
            return;
        const now = ctx.currentTime;
        if (this.lastFlowerToneTime >= 0
            && now - this.lastFlowerToneTime < FLOWER_CHANGE_TONE_CONFIG.debounceSeconds) {
            return;
        }
        this.lastFlowerToneTime = now;

        const t = Math.max(0, Math.min(1, intensity));
        this.engine.playTone({
            type: 'sine',
            frequency: FLOWER_CHANGE_TONE_CONFIG.baseFrequency
                + t * FLOWER_CHANGE_TONE_CONFIG.frequencyRange,
            duration: FLOWER_CHANGE_TONE_CONFIG.duration,
            volume: FLOWER_CHANGE_TONE_CONFIG.volume,
            attack: FLOWER_CHANGE_TONE_CONFIG.attack,
        });
    }

    playFlowerStateChange(ascending: boolean): void {
        this.engine.playTone({
            type: 'sine',
            frequency: ascending ? 400 : 600,
            frequencyEnd: ascending ? 600 : 450,
            duration: 0.15,
            volume: 0.1,
        });
    }

    stopFlowerAudio(): void {
        this.lastFlowerState = -1;
        this.lastFlowerToneTime = -1;
    }

    // ==================== Binaural Beat ====================

    startBinauralBeat(baseFreq: number = 55, beatFreq: number = 20): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.binauralActive)
            return;

        this.binauralBaseFreq = baseFreq;
        this.binauralBeatFreq = beatFreq;

        this.binauralMerger = ctx.createChannelMerger(2);
        this.binauralLeft = ctx.createOscillator();
        this.binauralLeft.type = 'sine';
        this.binauralLeft.frequency.value = baseFreq;

        this.binauralRight = ctx.createOscillator();
        this.binauralRight.type = 'sine';
        this.binauralRight.frequency.value = baseFreq + beatFreq;

        const leftGain = ctx.createGain();
        const rightGain = ctx.createGain();
        leftGain.gain.value = 0.4;
        rightGain.gain.value = 0.4;

        this.binauralLeft.connect(leftGain);
        this.binauralRight.connect(rightGain);
        leftGain.connect(this.binauralMerger, 0, 0);
        rightGain.connect(this.binauralMerger, 0, 1);

        this.binauralGain = ctx.createGain();
        this.binauralGain.gain.value = 0;
        this.binauralMerger.connect(this.binauralGain);
        this.binauralGain.connect(master);

        this.binauralLeft.start();
        this.binauralRight.start();
        this.binauralGain.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
        this.binauralActive = true;
    }

    stopBinauralBeat(): void {
        const ctx = this.engine.getContext();
        if (!this.binauralActive || !ctx)
            return;

        if (this.binauralGain) {
            this.binauralGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        }

        // Capture node locals, then clear instance state SYNCHRONOUSLY so rapid
        // restart calls see a clean slate and never orphan or drop a chain.
        const oldLeft = this.binauralLeft;
        const oldRight = this.binauralRight;
        const oldMerger = this.binauralMerger;
        const oldGain = this.binauralGain;

        this.binauralLeft = null;
        this.binauralRight = null;
        this.binauralMerger = null;
        this.binauralGain = null;
        this.binauralActive = false;
        this.binauralBaseFreq = 0;
        this.binauralBeatFreq = 0;

        setTimeout(() => {
            try { oldLeft?.stop(); }
            catch { }
            try { oldRight?.stop(); }
            catch { }
            oldMerger?.disconnect();
            oldGain?.disconnect();
        }, 500);
    }

    /**
     * Drive the binaural beat from the two rift readings (flow-audit break
     * #7, split into the two rift concepts): `riftDistance` — the distance to
     * the nearest PHYSICAL crack — drives loudness (each crack carries its
     * own fieldWidth-sized sound field), while the SIGNED `sideOffsetX` from
     * the room's SEMANTIC axis (faSideAxisX, the cluster center) retunes the
     * beat — the left (negative) side narrows it toward consonance, the right
     * (positive) side widens it toward dissonance — so the player hears which
     * side of the ROOM they chose, not which side of the nearest crack.
     */
    updateBinauralPosition(sideOffsetX: number, riftDistance: number): void {
        const ctx = this.engine.getContext();
        if (!this.binauralGain || !ctx)
            return;

        const intensity = Math.max(0, 1 - riftDistance / BINAURAL_SIDE_CONFIG.fieldWidth);
        this.binauralGain.gain.setTargetAtTime(intensity, ctx.currentTime, 0.1);

        if (this.binauralRight && this.binauralBeatFreq > 0) {
            const side = Math.max(-1, Math.min(1, sideOffsetX / BINAURAL_SIDE_CONFIG.sideHalfRange));
            const beat = this.binauralBeatFreq * (1 + side * BINAURAL_SIDE_CONFIG.detuneGain);
            this.binauralRight.frequency.setTargetAtTime(
                this.binauralBaseFreq + beat,
                ctx.currentTime,
                BINAURAL_SIDE_CONFIG.glide,
            );
        }
    }

    // ==================== Cable Hum ====================

    startCableHum(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.cableHumNode)
            return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = CABLE_AUDIO_CONFIG.humFrequency;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 2;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        const humGain = ctx.createGain();
        humGain.gain.value = 0;
        osc.connect(humGain);
        humGain.connect(master);

        osc.start(now);
        lfo.start(now);

        this.cableHumNode = { osc, gain: humGain, lfo };
    }

    updateCableHum(intensity: number): void {
        const ctx = this.engine.getContext();
        if (!this.cableHumNode || !ctx)
            return;
        const vol = Math.max(0, Math.min(1, intensity)) * CABLE_AUDIO_CONFIG.maxVolume;
        this.cableHumNode.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
    }

    stopCableHum(): void {
        if (!this.cableHumNode)
            return;
        const ctx = this.engine.getContext();
        const { osc, gain, lfo } = this.cableHumNode;

        if (ctx)
            gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);

        setTimeout(() => {
            try { osc.stop(); }
            catch { }
            try { lfo.stop(); }
            catch { }
            gain.disconnect();
        }, 250);

        this.cableHumNode = null;
    }

    // ==================== Rift ====================

    startRiftFog(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.riftFogNode)
            return;

        const now = ctx.currentTime;
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 2;
        filter.frequency.value = 600;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.2;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 400;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        noise.start(now);
        lfo.start(now);

        this.riftFogNode = { noise, gain, filter, lfo };
    }

    updateRiftFog(intensity: number): void {
        const ctx = this.engine.getContext();
        if (!this.riftFogNode || !ctx)
            return;
        const targetVol = Math.max(0, Math.min(1, intensity)) * RIFT_AUDIO_CONFIG.fogMaxVolume;
        this.riftFogNode.gain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.2);
    }

    stopRiftFog(): void {
        if (!this.riftFogNode)
            return;
        const ctx = this.engine.getContext();
        const { noise, gain, lfo } = this.riftFogNode;
        if (ctx)
            gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => { noise.stop(); lfo.stop(); }, 600);
        this.riftFogNode = null;
    }

    playRiftFall(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.riftFallGain)
            return;

        const now = ctx.currentTime;
        this.riftFallGain = ctx.createGain();
        this.riftFallGain.gain.setValueAtTime(0, now);
        this.riftFallGain.gain.linearRampToValueAtTime(0.4, now + RIFT_AUDIO_CONFIG.fallFadeIn);
        this.riftFallGain.connect(master);

        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        this.riftFallNoise = ctx.createBufferSource();
        this.riftFallNoise.buffer = buffer;
        this.riftFallNoise.loop = true;
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.Q.value = 1;
        windFilter.frequency.setValueAtTime(400, now);
        windFilter.frequency.exponentialRampToValueAtTime(2000, now + 3.0);
        this.riftFallNoise.connect(windFilter);
        windFilter.connect(this.riftFallGain);

        this.riftFallOsc = ctx.createOscillator();
        this.riftFallOsc.type = 'sawtooth';
        this.riftFallOsc.frequency.setValueAtTime(200, now);
        this.riftFallOsc.frequency.exponentialRampToValueAtTime(50, now + 3.0);
        const oscGain = ctx.createGain();
        oscGain.gain.value = 0.15;
        this.riftFallOsc.connect(oscGain);
        oscGain.connect(this.riftFallGain);

        this.riftFallNoise.start(now);
        this.riftFallOsc.start(now);
    }

    stopRiftFall(): void {
        const ctx = this.engine.getContext();
        if (!this.riftFallGain || !ctx)
            return;

        const now = ctx.currentTime;
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

    playRiftRespawn(): void {
        this.stopRiftFall();
        this.engine.playTone({
            type: 'sine',
            frequency: 50,
            frequencyEnd: 800,
            duration: 0.3,
            volume: 0.3,
            attack: 0.05,
        });
    }

    // ==================== Room Change ====================

    onRoomChange(prevType: RoomType | null, newType: RoomType, audioConfig: RoomAudioConfig): void {
        if (!this.enabled)
            return;

        // One-shot transition whoosh fires immediately for responsive feedback,
        // even while the ambient reconfiguration below is being debounced —
        // but rate-limited (flow-audit medium #5) so strafing along a room
        // boundary doesn't machine-gun the whoosh on every seam re-cross.
        // Audio-clock time (ctx.currentTime) matches the footstep cooldown
        // pattern and doesn't advance while the context is suspended (paused).
        const ctx = this.engine.getContext();
        if (prevType !== null && ctx !== null
            && ctx.currentTime - this.lastRoomWhooshTime >= ROOM_AMBIENT_CONFIG.whooshMinInterval) {
            this.lastRoomWhooshTime = ctx.currentTime;
            this.playRoomTransition();
        }

        // Debounce the heavier ambient reconfiguration (drone retune, noise bed,
        // binaural) so oscillating across a chunk seam doesn't thrash nodes.
        this.pendingRoomType = newType;
        if (this.retuneTimer !== null) {
            clearTimeout(this.retuneTimer);
        }
        this.retuneTimer = window.setTimeout(() => {
            this.retuneTimer = null;
            // Re-read the latest pending room: the player may have crossed several
            // seams during the debounce window; only the final room matters.
            const target = this.pendingRoomType;
            if (target === null)
                return;
            this.applyRoomAmbient(target, audioConfig);
        }, ROOM_AMBIENT_CONFIG.retuneDebounceMs);
    }

    /**
     * Apply a room's ambient audio: retune the drone, swap the noise bed, and
     * start/stop the binaural beat. Called from the debounced room-change path.
     *
     * Each onRoomChange reschedules the single debounce timer, so the surviving
     * timer's captured `audioConfig` is always paired with the final
     * `pendingRoomType` passed here as `target` — they describe the same room.
     */
    private applyRoomAmbient(target: RoomType, audioConfig: RoomAudioConfig): void {
        this.retuneAmbientDrone(audioConfig);
        this.setRoomNoiseBed(audioConfig);

        // Binaural beat: only FORCED_ALIGNMENT runs one. Stop any existing beat
        // when leaving, (re)start when entering.
        if (target === RoomType.FORCED_ALIGNMENT && audioConfig.beatFrequency) {
            this.stopBinauralBeat();
            this.startBinauralBeat(audioConfig.baseFrequency, audioConfig.beatFrequency);
        }
        else {
            this.stopBinauralBeat();
        }

        // POLARIZED binary pulse layer (flow-audit medium #2): only POLARIZED
        // runs the 440/880 metronome.
        if (target === RoomType.POLARIZED) {
            this.startPolarizedBeat();
        }
        else {
            this.stopPolarizedBeat();
        }
    }

    // ==================== POLARIZED Pulse Layer ====================

    /**
     * Start the POLARIZED binary pulse layer (flow-audit medium #2): short
     * sine ticks alternating strictly between 440 and 880 Hz — this pitch or
     * that one, nothing in between — scheduled with the same setTimeout-chain
     * pattern as the rain ambient. Each tick recomputes its next interval
     * from the LIVE gaze intensity (interval / (1 + 0.3·gaze)), so gazing
     * audibly quickens the metronome. Sits above the 400Hz gaze-lowpass
     * cutoff, so the gaze muffle finally registers in this room too.
     */
    private startPolarizedBeat(): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.polarizedBeatTimer !== null)
            return;

        const cfg = POLARIZED_BEAT_CONFIG;
        this.polarizedBeatGain = ctx.createGain();
        this.polarizedBeatGain.gain.setValueAtTime(0, ctx.currentTime);
        this.polarizedBeatGain.gain.setTargetAtTime(1, ctx.currentTime, cfg.fadeTime);
        this.polarizedBeatGain.connect(master);
        this.polarizedBeatHigh = false;

        const playPulse = (): void => {
            // Suspended context (paused): skip the pulse but keep the
            // scheduler alive, so a long pause never stacks pending pulses
            // into one burst at resume.
            if (!this.polarizedBeatGain || ctx.state !== 'running')
                return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = this.polarizedBeatHigh ? cfg.highFreq : cfg.lowFreq;
            this.polarizedBeatHigh = !this.polarizedBeatHigh;
            gain.gain.setValueAtTime(cfg.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.pulseDuration);
            osc.connect(gain);
            gain.connect(this.polarizedBeatGain);
            osc.start(now);
            osc.stop(now + cfg.pulseDuration + 0.05);
        };

        const schedule = (): void => {
            if (this.polarizedBeatTimer === null)
                return;
            playPulse();
            const interval = cfg.baseInterval
                / (1 + cfg.gazeRateGain * this.polarizedGazeIntensity);
            this.polarizedBeatTimer = window.setTimeout(schedule, interval * 1000);
        };
        this.polarizedBeatTimer = window.setTimeout(schedule, 0);
    }

    /**
     * Stop the POLARIZED pulse layer: cancel the scheduler synchronously,
     * fade the layer gain, and disconnect after the tail (rain/binaural
     * teardown pattern — rapid re-entry never orphans a chain).
     */
    private stopPolarizedBeat(): void {
        if (this.polarizedBeatTimer !== null) {
            clearTimeout(this.polarizedBeatTimer);
            this.polarizedBeatTimer = null;
        }
        if (!this.polarizedBeatGain)
            return;
        const ctx = this.engine.getContext();
        const oldGain = this.polarizedBeatGain;
        this.polarizedBeatGain = null;
        if (ctx) {
            oldGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
            setTimeout(() => oldGain.disconnect(), 400);
        }
        else {
            oldGain.disconnect();
        }
    }

    /**
     * Retune the persistent ambient drone (osc1/osc2) to the room's base
     * frequency and harmonic relationship. Glides rather than jumps to avoid
     * clicks. The drone runs continuously; we never recreate its nodes here.
     */
    private retuneAmbientDrone(audioConfig: RoomAudioConfig): void {
        const ctx = this.engine.getContext();
        if (!ctx || !this.ambientNode)
            return;

        const base = audioConfig.baseFrequency;
        const ratio = ROOM_AMBIENT_CONFIG.harmonicRatio[audioConfig.harmonic];
        let partner = base * ratio;
        if (audioConfig.harmonic === 'binaural')
            partner = base + ROOM_AMBIENT_CONFIG.binauralDroneDetune;

        // Remember the room tuning, then retune THROUGH the current sunset
        // foreshadow descent so a room change inside the lead window doesn't
        // pop the drone back up to its undimmed pitch.
        this.droneBaseFreq = base;
        this.dronePartnerFreq = partner;
        const foreshadowMult
            = 1 - this.appliedSunsetForeshadow * SUNSET_FORESHADOW_AUDIO.droneDropFraction;

        const now = ctx.currentTime;
        const glide = ROOM_AMBIENT_CONFIG.droneRetuneGlide;
        this.ambientNode.osc1.frequency.setTargetAtTime(base * foreshadowMult, now, glide);
        this.ambientNode.osc2.frequency.setTargetAtTime(partner * foreshadowMult, now, glide);
        // Keep the lowpass parked where the drone is meant to sit.
        this.ambientNode.filter.frequency.setTargetAtTime(
            ROOM_AMBIENT_CONFIG.droneFilterFreq,
            now,
            glide,
        );
    }

    /**
     * Lazily build (once) the pooled looping white-noise buffer shared by every
     * room's noise bed. Returns null before the audio context exists.
     */
    private getNoiseBedBuffer(): AudioBuffer | null {
        const ctx = this.engine.getContext();
        if (!ctx)
            return null;
        if (this.noiseBedBuffer)
            return this.noiseBedBuffer;

        const length = Math.floor(ctx.sampleRate * ROOM_AMBIENT_CONFIG.noiseBufferSeconds);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++)
            data[i] = Math.random() * 2 - 1;
        this.noiseBedBuffer = buffer;
        return buffer;
    }

    /**
     * Tear down the current room noise bed (if any) and, when the new room calls
     * for one, start a fresh filtered noise bed faded in to its clamped gain.
     *
     * - noiseLayer false => no bed (e.g. POLARIZED, FORCED_ALIGNMENT).
     * - INFO_OVERFLOW (high noiseGain) => bright 2-6kHz hiss band.
     * - IN_BETWEEN (low noiseGain) => duller low band.
     * Gain is clamped to ROOM_AMBIENT_CONFIG.noiseGainCeiling regardless of config.
     */
    private setRoomNoiseBed(audioConfig: RoomAudioConfig): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();

        // Always stop the previous bed first so we never stack/leak sources.
        this.stopRoomNoiseBed();

        if (!ctx || !master || !audioConfig.noiseLayer || audioConfig.noiseGain <= 0)
            return;

        const buffer = this.getNoiseBedBuffer();
        if (!buffer)
            return;

        const now = ctx.currentTime;
        const targetGain = Math.min(audioConfig.noiseGain, ROOM_AMBIENT_CONFIG.noiseGainCeiling);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        if (audioConfig.noiseGain > ROOM_AMBIENT_CONFIG.noiseHighBandThreshold) {
            filter.frequency.value = ROOM_AMBIENT_CONFIG.noiseBandHighFreq;
            filter.Q.value = ROOM_AMBIENT_CONFIG.noiseBandHighQ;
        }
        else {
            filter.frequency.value = ROOM_AMBIENT_CONFIG.noiseBandLowFreq;
            filter.Q.value = ROOM_AMBIENT_CONFIG.noiseBandLowQ;
        }

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.setTargetAtTime(targetGain, now, ROOM_AMBIENT_CONFIG.noiseFadeTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start(now);

        this.roomNoiseBed = { source, gain, filter };
    }

    /**
     * Fade out and disconnect the active room noise bed. Clears state
     * synchronously so a rapid re-entry never orphans or double-frees a chain.
     */
    private stopRoomNoiseBed(): void {
        if (!this.roomNoiseBed)
            return;
        const ctx = this.engine.getContext();
        const { source, gain, filter } = this.roomNoiseBed;
        this.roomNoiseBed = null;

        if (ctx) {
            const now = ctx.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.setTargetAtTime(0, now, ROOM_AMBIENT_CONFIG.noiseFadeTime);
        }

        // Stop slightly after the fade so we don't click; reuse the shared buffer
        // (only the source/filter/gain nodes are discarded).
        setTimeout(() => {
            try { source.stop(); }
            catch { }
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
        }, ROOM_AMBIENT_CONFIG.noiseFadeTime * 1000 + 200);
    }

    // ==================== Cleanup ====================

    /**
     * Dispose all audio resources
     */
    dispose(): void {
        // Cancel any pending debounced room retune.
        if (this.retuneTimer !== null) {
            clearTimeout(this.retuneTimer);
            this.retuneTimer = null;
        }
        this.pendingRoomType = null;

        // Stop all active sounds
        this.stopStaticAmbient();
        this.stopRainAmbient();
        this.stopRoomNoiseBed();
        this.stopBinauralBeat();
        this.stopPolarizedBeat();
        this.stopCableHum();
        this.stopRiftFog();
        this.stopRiftFall();
        this.stopFlowerAudio();
        this.stopFlowerAttentionHum();

        // Release the pooled noise buffer reference.
        this.noiseBedBuffer = null;

        // Stop ambient drone
        if (this.ambientNode) {
            try {
                this.ambientNode.osc1.stop();
                this.ambientNode.osc2.stop();
            }
            catch { /* Already stopped */ }
            this.ambientNode = null;
        }

        // Dispose engine
        this.engine.dispose();
    }
}
