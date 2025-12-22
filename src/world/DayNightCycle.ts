// 1-bit Chimera Void - Day/Night Cycle System
import * as THREE from 'three';
import type { DayNightContext } from '../types';

/**
 * Manages day/night cycle with randomization
 */
export class DayNightCycle {
    private cycleDuration: number = 300;     // Current cycle duration (randomized 4-6 min)
    private isDay: boolean = true;
    private nightIntensity: number = 0.5;    // 0.3-1.0, affects background darkness
    private inEclipse: boolean = false;
    private eclipseEndTime: number = 0;

    /**
     * Update the day/night cycle
     * @param t - Time in seconds
     * @param context - { scene, shaderQuad, audio, weather }
     */
    update(t: number, context: DayNightContext): void {
        const halfCycle = this.cycleDuration / 2;

        // Check for eclipse end
        if (this.inEclipse && t > this.eclipseEndTime) {
            this.inEclipse = false;
            context.shaderQuad.material.uniforms.invertColors.value = !this.isDay;
            console.log('Eclipse ended');
        }

        // Random eclipse chance during day (0.05% per frame)
        if (this.isDay && !this.inEclipse && Math.random() < 0.0005) {
            this.triggerSolarEclipse(t, context);
        }

        // Determine if it's day or night
        const cycleTime = t % this.cycleDuration;
        const newIsDay = cycleTime < halfCycle;

        // Transition when state changes
        if (newIsDay !== this.isDay) {
            this.isDay = newIsDay;

            // Randomize for next cycle
            if (newIsDay) {
                this.cycleDuration = 240 + Math.random() * 120; // 4-6 minutes
                this.nightIntensity = 0.3 + Math.random() * 0.7;
                console.log(`New cycle: ${Math.round(this.cycleDuration)}s, intensity: ${this.nightIntensity.toFixed(2)}`);
            }

            // Play transition sound
            context.audio.playDayNightTransition(!newIsDay);

            // Transition weather chance
            if (!newIsDay && Math.random() < 0.3) {
                context.weather.forceWeather('static', 15 + Math.random() * 15);
            } else if (newIsDay && Math.random() < 0.2) {
                context.weather.forceWeather('rain', 10 + Math.random() * 10);
            }

            // Update colors
            const dayColor = 0x888888;
            const nightGray = Math.floor(0x11 + (1 - this.nightIntensity) * 0x22);
            const nightColor = (nightGray << 16) | (nightGray << 8) | nightGray;
            const bgColor = newIsDay ? dayColor : nightColor;

            (context.scene.background as THREE.Color).setHex(bgColor);
            context.scene.fog!.color.setHex(bgColor);

            // Toggle shader inversion (unless in eclipse)
            if (!this.inEclipse) {
                context.shaderQuad.material.uniforms.invertColors.value = !newIsDay;
            }

            console.log(`Day/Night: ${newIsDay ? 'DAY' : 'NIGHT'}`);
        }
    }

    /**
     * Trigger a rare solar eclipse event
     * @param t - Current time
     * @param context - { shaderQuad, weather, audio }
     */
    private triggerSolarEclipse(t: number, context: DayNightContext): void {
        const duration = 10 + Math.random() * 20; // 10-30 seconds
        this.inEclipse = true;
        this.eclipseEndTime = t + duration;

        context.shaderQuad.material.uniforms.invertColors.value = true;
        context.weather.forceWeather('glitch', 0.5);
        context.audio.playEyeBlink();

        console.log(`SOLAR ECLIPSE for ${Math.round(duration)}s!`);
    }
}
