// 1-bit Chimera Void - Eclipse Darkening (weather batch, ECLIPSE presentation)
//
// While the authority's disc transits the dome (WEATHER_TYPES.ECLIPSE), the
// world itself darkens toward the deepest night palette and restores — the
// shadow is cast on the WORLD, not painted on the screen. black = the system,
// white = the self, dither = the friction between them: for one transit the
// system swallows the light everywhere at once, and whatever the player
// carries becomes the loudest thing left.
//
// The darkening is deliberately a SEPARATE factor composed onto the final
// background color at the point where it is applied. It never passes through
// the day/night state machine: DayNightCycle's isDaytime(), its day counter
// and the sunset-snapshot trigger are provably unaffected (the pure transit
// curve below + tests/EclipseDarkening.test.ts) — an eclipse can darken noon
// without ever making it night.
//
// Plumbing: DayNightCycle writes scene.background only on day/night
// transitions, so this system re-composes background + fog each frame from a
// captured BASE color, re-capturing whenever an external write lands (a
// sunset arriving mid-eclipse simply becomes the new base and the transit
// keeps darkening from there). RoomSky copies scene.background into its
// uBase every frame AFTER this runs (StatsSunsetUpdater's fixed order), so
// dome and background stay consistent for free. Outside a transit apply()
// writes nothing at all — CLEAR/STATIC/RAIN/GLITCH behavior is untouched.
//
// The depth curve IS the transit (deepest at mid-transit); the same depth
// drives the audio lowpass darkening (AudioController.updateEclipseDarkening)
// so eye and ear dim on one clock. The curve is continuous by design: it
// feeds the pre-dither world luminance (every rendered pixel stays binary),
// not an overlay alpha.

import type { WeatherState } from '../types';
import * as THREE from 'three';
import { ECLIPSE_DARKENING } from '../config';
import { WEATHER_TYPES } from './WeatherSystem';

/**
 * Raw transit-darkness curve in [0, 1] from the weather broadcast: 0 outside
 * an ECLIPSE, rising along a half-sine to 1 at mid-transit (progress 0.5)
 * and back to 0 as the disc sets — the shadow deepens exactly as the disc
 * crosses the anchor. Null (the boot frame) is exactly no eclipse. Consumers
 * scale it themselves (EclipseDarkening applies DEPTH_MAX; the audio maps it
 * to a lowpass cutoff). Pure.
 */
export function eclipseTransitDepth(state: Pick<WeatherState, 'weatherType' | 'eclipseProgress'> | null): number {
    if (state === null || state.weatherType !== WEATHER_TYPES.ECLIPSE)
        return 0;
    const p = Math.min(1, Math.max(0, state.eclipseProgress));
    return Math.sin(Math.PI * p);
}

/**
 * The slice of THREE.Scene the darkening touches (structural — tests drive
 * it with plain colors, no real scene).
 */
export type DarkenableScene = Pick<THREE.Scene, 'background' | 'fog'>;

/**
 * Composes the eclipse darkening factor onto the final background/fog color.
 * Owned and driven by core/StatsSunsetUpdater between the day/night step and
 * the RoomSky update. Holds NO reference to the DayNightCycle — additive
 * plumbing only (see the file header for the non-interference contract).
 */
export class EclipseDarkening {
    /** Base color the transit darkens FROM (whatever DayNightCycle last set). */
    private readonly base = new THREE.Color();
    /** Night-palette gray the transit darkens TOWARD (set once from config). */
    private readonly target = new THREE.Color(ECLIPSE_DARKENING.TARGET_HEX);
    /** Exact color we last wrote — an unequal live color means an external write. */
    private readonly applied = new THREE.Color();
    /** Whether the LAST apply() wrote a composed color into the scene. */
    private darkened = false;

    constructor(private readonly scene: DarkenableScene) {}

    /**
     * Compose this frame's darkening. Allocation-free.
     * @param depth - Transit depth 0-1 (eclipseTransitDepth). At 0 the scene
     *   is restored bit-exactly and, once restored, never written again until
     *   the next transit — the steady state costs nothing and cannot drift.
     */
    apply(depth: number): void {
        const bg = this.scene.background;
        if (!(bg instanceof THREE.Color))
            return;
        const d = Math.min(1, Math.max(0, depth)) * ECLIPSE_DARKENING.DEPTH_MAX;
        // Steady state outside a transit: no writes at all, so the day/night
        // palette (and any other owner of the background) is untouched.
        if (d <= 0 && !this.darkened)
            return;
        // Re-base on any external write (DayNightCycle transitions own the
        // underlying color): if the live color is not the one WE last wrote,
        // someone else set a new base — capture it and compose from there.
        if (!this.darkened || !bg.equals(this.applied))
            this.base.copy(bg);
        // depth 0 composes to exactly the base (the restore is bit-exact).
        this.applied.copy(this.base).lerp(this.target, d);
        bg.copy(this.applied);
        // Fog follows the background — the same contract DayNightCycle keeps
        // on its transitions (both start at the one scene color).
        if (this.scene.fog)
            this.scene.fog.color.copy(this.applied);
        this.darkened = d > 0;
    }
}
