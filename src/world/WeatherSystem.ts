// 1-bit Chimera Void - Weather System
// Procedural 1-bit style weather effects

import type { WeatherConfig, WeatherState, WeatherSystemInterface } from '../types';

/**
 * Weather types
 */
export const WEATHER_TYPES = {
    CLEAR: 0,
    STATIC: 1, // Static snow/noise
    RAIN: 2, // Digital rain
    GLITCH: 3, // Signal glitch
} as const;

export type WeatherType = typeof WEATHER_TYPES[keyof typeof WEATHER_TYPES];

/**
 * Manages weather effects and transitions
 */
export class WeatherSystem implements WeatherSystemInterface {
    private currentWeather: WeatherType = WEATHER_TYPES.CLEAR;
    private intensity: number = 0;
    private targetIntensity: number = 0;
    private weatherTime: number = 0;

    // Timing
    private duration: number = 0; // Current weather duration
    private elapsed: number = 0; // Time elapsed in current weather
    private cooldown: number = 0; // Time until next weather can trigger

    // Whether the current event is a transient ambient glitch (not a real
    // STATIC/RAIN event). Transient glitches must not reset the main cooldown.
    private isGlitchEvent: boolean = false;
    // Cooldown captured before a transient glitch, restored when it ends.
    private savedCooldown: number = 0;

    // Configuration
    private config: WeatherConfig = {
        minCooldown: 60, // Min seconds between weather events
        maxCooldown: 180, // Max seconds between weather events
        minDuration: 15, // Min weather duration
        maxDuration: 45, // Max weather duration
        transitionSpeed: 0.5, // Fade in/out speed
        glitchChance: 0.12, // Ambient glitch rate per SECOND (scaled by delta below; 0.12/s ~ the old 0.002/frame at 60fps)
    };

    constructor() {
        // Initialize cooldown
        this.cooldown = this.randomRange(30, 60);
    }

    /**
     * Update weather system
     * @param delta - Delta time in seconds
     * @param time - Total time in seconds
     * @returns Weather state for shader uniforms
     */
    update(delta: number, time: number): WeatherState {
        this.weatherTime = time;

        // Update cooldown
        if (this.currentWeather === WEATHER_TYPES.CLEAR) {
            this.cooldown -= delta;

            // Random brief glitch even during clear weather. glitchChance is a
            // per-second rate, so scale by delta to stay frame-rate independent
            // (a 144Hz monitor no longer glitches ~2.4x more than a 60Hz one).
            if (Math.random() < this.config.glitchChance * delta) {
                this.triggerGlitch();
            }

            // Trigger new weather event
            if (this.cooldown <= 0) {
                this.startRandomWeather();
            }
        }
        else {
            // Update current weather
            this.elapsed += delta;

            // Fade out near end (skip for very short durations so the fade-out
            // cannot fire on the first frame and instantly kill intensity)
            if (this.duration > 2 && this.elapsed > this.duration - 2) {
                this.targetIntensity = 0;
            }

            // End weather
            if (this.elapsed >= this.duration) {
                this.endWeather();
            }
        }

        // Smooth intensity transition
        const diff = this.targetIntensity - this.intensity;
        this.intensity += diff * this.config.transitionSpeed * delta * 5;
        this.intensity = Math.max(0, Math.min(1, this.intensity));

        return {
            weatherType: this.currentWeather,
            weatherIntensity: this.intensity,
            weatherTime: this.weatherTime,
        };
    }

    /**
     * Start a random weather event
     */
    private startRandomWeather(): void {
        // Choose weather type. All three sustained weathers — static snow,
        // digital rain, and signal glitch — share the rotation at equal odds
        // (1/3 each). The brief ambient flickers and the eclipse flash are a
        // SEPARATE transient path (triggerGlitch / forceWeather), flagged with
        // isGlitchEvent so they don't reset the main cooldown; a glitch picked
        // here is a real, full-duration weather event (isGlitchEvent = false).
        const types: WeatherType[] = [
            WEATHER_TYPES.STATIC,
            WEATHER_TYPES.RAIN,
            WEATHER_TYPES.GLITCH,
        ];
        this.currentWeather = types[Math.floor(Math.random() * types.length)];
        this.isGlitchEvent = false;

        this.duration = this.randomRange(
            this.config.minDuration,
            this.config.maxDuration,
        );
        this.elapsed = 0;
        this.targetIntensity = 0.6 + Math.random() * 0.4; // 0.6 to 1.0

        console.log(`Weather: ${this.getWeatherName()} for ${Math.round(this.duration)}s`);
    }

    /**
     * Trigger a short glitch effect
     */
    private triggerGlitch(): void {
        if (this.currentWeather !== WEATHER_TYPES.CLEAR)
            return;

        // Preserve progress toward the next real weather event so a transient
        // ambient glitch doesn't reset the main cooldown.
        this.savedCooldown = this.cooldown;
        this.isGlitchEvent = true;

        this.currentWeather = WEATHER_TYPES.GLITCH;
        this.duration = 0.1 + Math.random() * 0.4; // 0.1 to 0.5 seconds
        this.elapsed = 0;
        this.targetIntensity = 1;
        this.intensity = 1; // Instant on for glitch
    }

    /**
     * End current weather and start cooldown
     */
    private endWeather(): void {
        this.currentWeather = WEATHER_TYPES.CLEAR;
        this.intensity = 0;
        this.targetIntensity = 0;

        if (this.isGlitchEvent) {
            // Transient glitch ending: restore CLEAR without overwriting the
            // existing cooldown, so progress toward the next real event is kept.
            this.cooldown = this.savedCooldown;
            this.isGlitchEvent = false;
        }
        else {
            // Real STATIC/RAIN event ending: start a fresh cooldown.
            this.cooldown = this.randomRange(
                this.config.minCooldown,
                this.config.maxCooldown,
            );
        }
    }

    /**
     * Force a specific weather (for testing)
     * @param type - 'clear', 'static', 'rain', 'glitch'
     * @param duration - Duration in seconds
     */
    forceWeather(type: string, duration: number = 30): void {
        const typeMap: Record<string, WeatherType> = {
            clear: WEATHER_TYPES.CLEAR,
            static: WEATHER_TYPES.STATIC,
            rain: WEATHER_TYPES.RAIN,
            glitch: WEATHER_TYPES.GLITCH,
        };

        this.currentWeather = typeMap[type] ?? WEATHER_TYPES.CLEAR;
        this.duration = duration;
        this.elapsed = 0;

        if (this.currentWeather === WEATHER_TYPES.CLEAR) {
            // Forced clear: snap off and reset cooldown so a previously
            // expired cooldown can't immediately re-trigger random weather.
            this.targetIntensity = 0;
            this.intensity = 0;
            this.isGlitchEvent = false;
            this.cooldown = this.randomRange(
                this.config.minCooldown,
                this.config.maxCooldown,
            );
        }
        else {
            // Instant-on: snap intensity so very short forced weather (e.g. the
            // eclipse glitch with duration <= ~2s) is actually visible.
            this.targetIntensity = 1;
            this.intensity = 1;

            if (this.currentWeather === WEATHER_TYPES.GLITCH) {
                // A forced transient glitch preserves the main cooldown,
                // consistent with ambient glitches.
                this.savedCooldown = this.cooldown;
                this.isGlitchEvent = true;
            }
            else {
                // Forced STATIC/RAIN are real events; let endWeather() set a
                // fresh cooldown when they finish.
                this.isGlitchEvent = false;
            }
        }
    }

    /**
     * Get weather name for logging
     */
    private getWeatherName(): string {
        const names = ['Clear', 'Static', 'Rain', 'Glitch'];
        return names[this.currentWeather] || 'Unknown';
    }

    /**
     * Random range helper
     */
    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
}
