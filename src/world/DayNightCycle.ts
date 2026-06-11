// 1-bit Chimera Void - Day/Night Cycle System
import type * as THREE from 'three';
import type { DayNightContext } from '../types';

/**
 * Manages day/night cycle with randomization
 */
export class DayNightCycle {
    private cycleDuration: number = 300; // Current cycle duration (randomized 4-6 min)
    private cycleTime: number = 0; // Play-time position within the current cycle (seconds)
    private isDay: boolean = true;
    private nightIntensity: number = 0.5; // 0.3-1.0, affects background darkness
    private inEclipse: boolean = false;
    private eclipseTimeLeft: number = 0; // Remaining eclipse play time (seconds)

    /**
     * Update the day/night cycle.
     *
     * Delta-driven (pause-aware): main.ts gates the whole update phase while
     * paused (start screen / ESC / hidden tab), so the cycle only advances
     * with actual play time and never jumps across wall-clock gaps.
     * @param delta - Delta time in seconds
     * @param context - { scene, shaderQuad, audio, weather }
     */
    update(delta: number, context: DayNightContext): void {
        // Advance the per-cycle clock. Wrapping (instead of a modulo on an
        // absolute clock) keeps the phase continuous when cycleDuration is
        // re-randomized at dawn.
        this.cycleTime += delta;
        if (this.cycleTime >= this.cycleDuration) {
            this.cycleTime -= this.cycleDuration;
        }
        const halfCycle = this.cycleDuration / 2;

        // Check for eclipse end
        if (this.inEclipse) {
            this.eclipseTimeLeft -= delta;
            if (this.eclipseTimeLeft <= 0) {
                this.inEclipse = false;
                context.shaderQuad.material.uniforms.invertColors.value = !this.isDay;
                console.log('Eclipse ended');
            }
        }

        // Random eclipse chance during day. The 0.03 is a per-SECOND rate
        // (the old 0.05%/frame * 60), scaled by delta so the cadence is
        // frame-rate independent (reproduces the old rate at 60fps).
        if (this.isDay && !this.inEclipse && Math.random() < 0.03 * delta) {
            this.triggerSolarEclipse(context);
        }

        // Determine if it's day or night
        const newIsDay = this.cycleTime < halfCycle;

        // Transition when state changes
        if (newIsDay !== this.isDay) {
            this.isDay = newIsDay;

            // Trigger snapshot on sunset (day -> night). The callback reports
            // whether a settlement snapshot was actually shown so the weather
            // roll below can stand aside for it.
            let snapshotShown = false;
            if (!newIsDay && context.onSunset) {
                snapshotShown = context.onSunset() === true;
            }

            // Randomize for next cycle
            if (newIsDay) {
                this.cycleDuration = 240 + Math.random() * 120; // 4-6 minutes
                this.nightIntensity = 0.3 + Math.random() * 0.7;
                console.log(`New cycle: ${Math.round(this.cycleDuration)}s, intensity: ${this.nightIntensity.toFixed(2)}`);
            }

            // Play transition sound
            context.audio.playDayNightTransition(!newIsDay);

            // Transition weather chance. Skipped on a snapshot sunset
            // (flow-audit enhancement #9): the settlement's visual language
            // must stay distinct from weather static.
            if (!newIsDay && !snapshotShown && Math.random() < 0.3) {
                context.weather.forceWeather('static', 15 + Math.random() * 15);
            }
            else if (newIsDay && Math.random() < 0.2) {
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
     * Pre-sunset foreshadow ramp (flow-audit enhancement #8): 0 for most of
     * the cycle, rising linearly to 1 across the final `leadSeconds` of the
     * DAY phase, and 0 again at night. A pure query on the delta-driven
     * cycle clock — no new wall clock is involved, so it pauses with play.
     */
    getSunsetForeshadow(leadSeconds: number): number {
        if (!this.isDay || leadSeconds <= 0)
            return 0;
        const remaining = this.cycleDuration / 2 - this.cycleTime;
        if (remaining >= leadSeconds)
            return 0;
        return 1 - Math.max(0, remaining) / leadSeconds;
    }

    /**
     * Trigger a rare solar eclipse event
     * @param context - { shaderQuad, weather, audio }
     */
    private triggerSolarEclipse(context: DayNightContext): void {
        const duration = 10 + Math.random() * 20; // 10-30 seconds
        this.inEclipse = true;
        this.eclipseTimeLeft = duration;

        context.shaderQuad.material.uniforms.invertColors.value = true;
        context.weather.forceWeather('glitch', 0.5);
        context.audio.playEyeBlink();

        console.log(`SOLAR ECLIPSE for ${Math.round(duration)}s!`);
    }
}
