// 1-bit Chimera Void - Weather System
// Procedural 1-bit style weather effects

import type { WeatherState, WeatherConfig, WeatherSystemInterface } from '../types';

/**
 * Weather types
 */
export const WEATHER_TYPES = {
    CLEAR: 0,
    STATIC: 1,      // Static snow/noise
    RAIN: 2,        // Digital rain
    GLITCH: 3,      // Signal glitch
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
    private duration: number = 0;          // Current weather duration
    private elapsed: number = 0;           // Time elapsed in current weather
    private cooldown: number = 0;          // Time until next weather can trigger

    // Configuration
    private config: WeatherConfig = {
        minCooldown: 60,        // Min seconds between weather events
        maxCooldown: 180,       // Max seconds between weather events
        minDuration: 15,        // Min weather duration
        maxDuration: 45,        // Max weather duration
        transitionSpeed: 0.5,   // Fade in/out speed
        glitchChance: 0.002,    // Chance of glitch per frame
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

            // Random glitch even during clear weather
            if (Math.random() < this.config.glitchChance) {
                this.triggerGlitch();
            }

            // Trigger new weather event
            if (this.cooldown <= 0) {
                this.startRandomWeather();
            }
        } else {
            // Update current weather
            this.elapsed += delta;

            // Fade out near end
            if (this.elapsed > this.duration - 2) {
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
        // Choose weather type (static or rain, glitch is separate)
        const types: WeatherType[] = [WEATHER_TYPES.STATIC, WEATHER_TYPES.RAIN];
        this.currentWeather = types[Math.floor(Math.random() * types.length)];

        this.duration = this.randomRange(
            this.config.minDuration,
            this.config.maxDuration
        );
        this.elapsed = 0;
        this.targetIntensity = 0.6 + Math.random() * 0.4; // 0.6 to 1.0

        console.log(`Weather: ${this.getWeatherName()} for ${Math.round(this.duration)}s`);
    }

    /**
     * Trigger a short glitch effect
     */
    private triggerGlitch(): void {
        if (this.currentWeather !== WEATHER_TYPES.CLEAR) return;

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
        this.cooldown = this.randomRange(
            this.config.minCooldown,
            this.config.maxCooldown
        );
    }

    /**
     * Force a specific weather (for testing)
     * @param type - 'clear', 'static', 'rain', 'glitch'
     * @param duration - Duration in seconds
     */
    forceWeather(type: string, duration: number = 30): void {
        const typeMap: Record<string, WeatherType> = {
            'clear': WEATHER_TYPES.CLEAR,
            'static': WEATHER_TYPES.STATIC,
            'rain': WEATHER_TYPES.RAIN,
            'glitch': WEATHER_TYPES.GLITCH,
        };

        this.currentWeather = typeMap[type] ?? WEATHER_TYPES.CLEAR;
        this.duration = duration;
        this.elapsed = 0;
        this.targetIntensity = 1;

        if (this.currentWeather === WEATHER_TYPES.CLEAR) {
            this.intensity = 0;
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
