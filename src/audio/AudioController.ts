/**
 * AudioController - 高层音频控制器
 * 封装所有游戏音效播放逻辑，使用 AudioEngine 底层 API
 * 实现 AudioSystemInterface 以保持向后兼容
 */

import type { AmbientNode, AudioSystemInterface } from '../types';
import type { RoomAudioConfig } from '../world/RoomConfig';
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

    // Weather state
    private weatherNoiseSource: AudioBufferSourceNode | null = null;
    private weatherNoiseGain: GainNode | null = null;
    private weatherRainInterval: number | null = null;
    private currentWeatherType: number = 0;
    private _staticExtra: OscillatorNode[] | null = null;

    // Flower state
    private lastFlowerIntensity: number = -1;
    private lastFlowerState: number = -1;
    private flowerSilenceTimer: number = 0;

    // Rift state
    private riftFogNode: { noise: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; lfo: OscillatorNode } | null = null;
    private riftFallOsc: OscillatorNode | null = null;
    private riftFallNoise: AudioBufferSourceNode | null = null;
    private riftFallGain: GainNode | null = null;

    // Cable hum state
    private cableHumNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;

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

    updateGaze(isGazing: boolean, gazeIntensity: number): void {
        this.engine.updateGazeFilter(isGazing, gazeIntensity);
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
        osc1.frequency.value = 35;
        osc2.type = 'sawtooth';
        osc2.frequency.value = 35.5;

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
        if (now - this.lastFootstepTime < 0.25)
            return;
        this.lastFootstepTime = now;

        this.engine.playTone({
            type: 'square',
            frequency: 80 + Math.random() * 40,
            duration: 0.05,
            volume: 0.15,
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

    playInfoChirp(): void {
        this.engine.playTone({
            type: 'square',
            frequency: 2000 + Math.random() * 8000,
            duration: 0.03,
            volume: 0.03,
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
            osc.frequency.setValueAtTime(2000 + Math.random() * 4000, burstStart);
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
        drone.frequency.value = 50;

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

        const notes = [1200, 900, 800, 600, 400, 300];
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
            this.weatherRainInterval = window.setTimeout(schedule, 500);
        };
        this.weatherRainInterval = window.setTimeout(schedule, 0);
    }

    private stopRainAmbient(): void {
        if (this.weatherRainInterval !== null) {
            clearTimeout(this.weatherRainInterval);
            this.weatherRainInterval = null;
        }
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

        const changeThreshold = 0.01;
        const intensityChange = Math.abs(intensity - this.lastFlowerIntensity);

        if (this.lastFlowerIntensity >= 0 && intensityChange > changeThreshold) {
            this.playFlowerChangeTone(intensity, intensityChange);
            this.flowerSilenceTimer = 0;
        }
        else {
            this.flowerSilenceTimer++;
        }
        this.lastFlowerIntensity = intensity;
    }

    private playFlowerChangeTone(intensity: number, changeSpeed: number): void {
        if (this.flowerSilenceTimer < 2)
            return;
        const freq = 150 + intensity * 350;
        const volume = Math.min(changeSpeed * 2 + 0.02, 0.06);
        const duration = 0.2 + changeSpeed * 0.2;

        this.engine.playTone({
            type: 'sine',
            frequency: freq,
            duration,
            volume,
            attack: 0.03,
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
        this.lastFlowerIntensity = -1;
        this.lastFlowerState = -1;
        this.flowerSilenceTimer = 0;
    }

    // ==================== Binaural Beat ====================

    startBinauralBeat(baseFreq: number = 55, beatFreq: number = 20): void {
        const ctx = this.engine.getContext();
        const master = this.engine.getMasterGain();
        if (!ctx || !master || this.binauralActive)
            return;

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

        setTimeout(() => {
            this.binauralLeft?.stop();
            this.binauralRight?.stop();
            this.binauralLeft = null;
            this.binauralRight = null;
            this.binauralMerger = null;
            this.binauralGain = null;
            this.binauralActive = false;
        }, 500);
    }

    updateBinauralPosition(xPosition: number, crackWidth: number): void {
        const ctx = this.engine.getContext();
        if (!this.binauralGain || !ctx)
            return;

        const distanceFromCrack = Math.abs(xPosition);
        const intensity = Math.max(0, 1 - distanceFromCrack / crackWidth);
        this.binauralGain.gain.setTargetAtTime(intensity, ctx.currentTime, 0.1);
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
        osc.frequency.value = 100;

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
        const vol = Math.max(0, Math.min(1, intensity)) * 0.15;
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
        const targetVol = Math.max(0, Math.min(1, intensity)) * 0.8;
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
        this.riftFallGain.gain.linearRampToValueAtTime(0.4, now + 0.5);
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

        if (prevType !== null) {
            this.playRoomTransition();
        }

        if (prevType === RoomType.FORCED_ALIGNMENT) {
            this.stopBinauralBeat();
        }

        if (newType === RoomType.FORCED_ALIGNMENT && audioConfig.beatFrequency) {
            this.startBinauralBeat(audioConfig.baseFrequency, audioConfig.beatFrequency);
        }
    }
}
