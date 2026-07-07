// 1-bit Chimera Void - Weather System
// Procedural 1-bit style weather with a full lifecycle: the sky no longer
// snaps between states — every real event is announced (forewarn), breaks
// (onset), peaks, and leaves a residue (aftermath). The rotation carries the
// system's moods (STATIC/RAIN/GLITCH plus ASHFALL, the settling of noise, and
// GALE, the directional shove); the rare ECLIPSE runs on its own clock above
// every room. The player's run-long behavior gently leans what the sky sends.

import type { WeatherConfig, WeatherState, WeatherSystemInterface } from '../types';
import type { BehaviorProfile, RoomType, RoomWeatherProfile, WeatherTypeWeights } from './RoomConfig';
import { WEATHER_ECLIPSE, WEATHER_LIFECYCLE, WEATHER_TYPE_TUNING } from '../config';
import { hash } from '../utils/hash';
import {
    biasedWeatherWeights,
    DEFAULT_WEATHER_PROFILE,
    DEFAULT_WEATHER_WEIGHTS,
    ROOM_WEATHER_PROFILES,
    ROOM_WEATHER_WEIGHTS,
    weatherCooldownScale,
} from './RoomConfig';

/**
 * Weather types. 0-3 are the legacy SCREEN types (the DitherShader overlays);
 * 4-6 are world-space types that must never reach the screen shader — see
 * screenWeatherType for the mapping that keeps them off it.
 */
export const WEATHER_TYPES = {
    CLEAR: 0,
    STATIC: 1, // Static snow/noise
    RAIN: 2, // Digital rain
    GLITCH: 3, // Signal glitch
    ASHFALL: 4, // The settling of noise — gentle world-space fallout
    GALE: 5, // Directional shove — the system leaning on the world
    ECLIPSE: 6, // The authority's sky goes dark (own scheduler, not rotated)
} as const;

/**
 * Onset broadcast window (seconds): after a REAL weather event starts
 * (any rotation type or the eclipse, including forced static/rain), the
 * returned weatherOnset decays linearly 1 -> 0 over this window so the
 * shader/audio can announce "weather just began". Transient ambient
 * glitches never broadcast (weatherOnset stays 0).
 */
export const ONSET_SECONDS = 1.6;

export type WeatherType = typeof WEATHER_TYPES[keyof typeof WEATHER_TYPES];

// Module-level mirror of the app instance's latest broadcast (the CableSystem
// module-singleton precedent). main.ts wires exactly one WeatherSystem; helpers
// that neither hold it nor can be rethreaded through main's fixed call list
// (core/RoomFlowUpdater's weather-reactions layer) read the last update() here
// — one frame stale for consumers earlier in the frame order, exactly the
// getLastState() staleness contract. Null until the first update().
let lastBroadcast: WeatherState | null = null;

/**
 * Latest WeatherState returned by ANY WeatherSystem.update() call this
 * session (in the app there is exactly one instance). See getLastState for
 * the staleness contract; prefer the instance method when you hold one.
 */
export function getLastWeatherBroadcast(): WeatherState | null {
    return lastBroadcast;
}

/**
 * Map a weather type to the value the SCREEN shader may see. The DitherShader
 * gates EVERY weather overlay — the per-type effects, the onset strobe/sweep
 * and the IN_BETWEEN misregister widening — behind `weatherType > 0`, then
 * branches on 1/2/3 only. The world-space types (ASHFALL/GALE/ECLIPSE) must
 * draw NO screen overlay, so anything past GLITCH collapses to CLEAR here;
 * their presence lives in world objects and the WeatherState broadcast
 * fields, never in the full-screen pass. Identity for the legacy types. Pure.
 */
export function screenWeatherType(weatherType: number): number {
    return weatherType > WEATHER_TYPES.GLITCH ? WEATHER_TYPES.CLEAR : weatherType;
}

/**
 * Rotation band order of the weighted type pick. STATIC/RAIN/GLITCH keep the
 * historical order (a legacy 3-type weight table maps bit-identically); the
 * new types append after. ECLIPSE is deliberately absent — it never rotates.
 */
const WEATHER_PICK_ORDER = ['static', 'rain', 'glitch', 'ashfall', 'gale'] as const;

const PICK_TYPE: Record<typeof WEATHER_PICK_ORDER[number], WeatherType> = {
    static: WEATHER_TYPES.STATIC,
    rain: WEATHER_TYPES.RAIN,
    glitch: WEATHER_TYPES.GLITCH,
    ashfall: WEATHER_TYPES.ASHFALL,
    gale: WEATHER_TYPES.GALE,
};

/**
 * Weighted rotation pick: r01 in [0, 1) against the cumulative distribution
 * of `weights` over WEATHER_PICK_ORDER. Returns null when every weight is 0
 * (the room blocks all weather). Pure.
 */
export function pickWeatherFromWeights(r01: number, weights: WeatherTypeWeights): WeatherType | null {
    let total = 0;
    for (const key of WEATHER_PICK_ORDER)
        total += weights[key];
    if (total <= 0)
        return null;
    const pick = r01 * total;
    let acc = 0;
    for (const key of WEATHER_PICK_ORDER) {
        acc += weights[key];
        if (pick < acc)
            return PICK_TYPE[key];
    }
    // r01 at the very top of the range: the last non-empty band wins.
    for (let i = WEATHER_PICK_ORDER.length - 1; i >= 0; i--) {
        if (weights[WEATHER_PICK_ORDER[i]] > 0)
            return PICK_TYPE[WEATHER_PICK_ORDER[i]];
    }
    return null;
}

/**
 * Per-type lifecycle tuning (WEATHER_TYPE_TUNING). Legacy types have no
 * entry: their duration/intensity draw stays bit-identical to the profile.
 */
function typeTuning(type: WeatherType): typeof WEATHER_TYPE_TUNING.ASHFALL | typeof WEATHER_TYPE_TUNING.GALE | null {
    if (type === WEATHER_TYPES.ASHFALL)
        return WEATHER_TYPE_TUNING.ASHFALL;
    if (type === WEATHER_TYPES.GALE)
        return WEATHER_TYPE_TUNING.GALE;
    return null;
}

/**
 * A rotation event drawn at forewarn time and started when the cooldown
 * expires — drawing early is what lets the world announce what is coming.
 */
interface ScheduledWeather {
    type: WeatherType;
    duration: number;
    targetIntensity: number;
    /** Event heading in radians, hash-drawn once for the whole arc. */
    direction: number;
}

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
    // rotation event). Transient glitches must not reset the main cooldown.
    private isGlitchEvent: boolean = false;
    // Whether the current event is the eclipse: like a transient it restores
    // the rotation cooldown on end (the rotation PAUSES under an eclipse, its
    // progress survives), but unlike a transient it is a real event — it
    // broadcasts onset and leaves an aftermath.
    private isEclipseEvent: boolean = false;
    // Cooldown captured before a transient glitch / eclipse, restored on end.
    private savedCooldown: number = 0;
    // Player's current room (flow-audit medium #3): weights the SELECTION of
    // the next weather event and picks its lifecycle profile (cooldown /
    // duration / intensity) — in-progress weather is never cut short.
    private currentRoomType: RoomType | null = null;
    // Live behavior profile (mirror layer 4), threaded through update();
    // null (the default) is exactly the unbiased behavior.
    private behaviorProfile: BehaviorProfile | null = null;

    // Lifecycle: the next rotation event, drawn when the cooldown enters the
    // forewarn window so the world can announce it. Committed once drawn —
    // an announced storm arrives even if the player crosses a room line.
    private scheduled: ScheduledWeather | null = null;
    // Monotone per-session event index seeding the direction hash.
    private eventCounter: number = 0;
    // Direction of the current (or announced) event, kept through aftermath.
    private eventDirection: number = 0;
    // Aftermath broadcast: seconds left of the 1 -> 0 residue window.
    private aftermathRemaining: number = 0;
    private lastEndedType: WeatherType = WEATHER_TYPES.CLEAR;

    // Eclipse scheduler: accumulated play time (delta sum, pause-gated
    // upstream) and the next session timestamp an eclipse becomes due.
    private playTime: number = 0;
    private nextEclipseAt: number = WEATHER_ECLIPSE.FIRST_MIN_SECONDS;

    // Latest state returned by update(), for consumers that run BEFORE the
    // weather step in main's frame order (see getLastState).
    private lastState: WeatherState | null = null;

    // Configuration. Cooldown/duration/intensity ranges live in the per-room
    // weather profiles (ROOM_WEATHER_PROFILES / DEFAULT_WEATHER_PROFILE).
    private config: WeatherConfig = {
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
     * @param roomType - Player's current room; weights the next event's type
     *   selection and supplies its cooldown/duration/intensity profile
     *   (omit/null for the unweighted rotation + DEFAULT_WEATHER_PROFILE)
     * @param profile - Live behavior profile (the same object RoomFlowUpdater
     *   threads to the room ledger); gently biases type weights and cooldown
     *   sampling. Omit/null for the exact unbiased behavior.
     * @returns Weather state for shader uniforms
     */
    update(delta: number, time: number, roomType: RoomType | null = null, profile: BehaviorProfile | null = null): WeatherState {
        this.weatherTime = time;
        this.currentRoomType = roomType;
        this.behaviorProfile = profile;
        this.playTime += delta;

        // Aftermath residue decays on its own clock, independent of what the
        // sky is doing now (a fresh event clears it on start instead).
        this.aftermathRemaining = Math.max(0, this.aftermathRemaining - delta);

        // Update cooldown
        if (this.currentWeather === WEATHER_TYPES.CLEAR) {
            this.cooldown -= delta;

            // Random brief glitch even during clear weather. glitchChance is a
            // per-second rate, so scale by delta to stay frame-rate independent
            // (a 144Hz monitor no longer glitches ~2.4x more than a 60Hz one).
            if (Math.random() < this.config.glitchChance * delta) {
                this.triggerGlitch();
            }

            if (this.playTime >= this.nextEclipseAt) {
                // Eclipse due and the sky is free (an in-progress event is
                // never cut short — the eclipse waits in the else-branch
                // frames until the weather returns to CLEAR). It outranks a
                // transient glitch triggered this same frame, and while it
                // runs this whole branch is skipped: the rotation pauses.
                this.startEclipse();
            }
            else {
                // Draw the next rotation event as the cooldown enters the
                // forewarn window, so the world can announce it...
                if (this.scheduled === null && this.cooldown <= WEATHER_LIFECYCLE.FOREWARN_SECONDS) {
                    this.scheduleNextWeather();
                }
                // ...and break it when the cooldown expires.
                if (this.scheduled !== null && this.cooldown <= 0) {
                    this.startScheduledWeather();
                }
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

        // Real-event flag: transient ambient glitches share weatherType=GLITCH
        // with real storms, so downstream consumers (e.g. the POLARIZED invert
        // strikes) need an explicit signal to tell them apart.
        const isRealEvent = this.currentWeather !== WEATHER_TYPES.CLEAR && !this.isGlitchEvent;

        // Onset broadcast: real events decay 1 -> 0 over ONSET_SECONDS from
        // their start; transient glitches stay silent.
        const weatherOnset = isRealEvent
            ? Math.max(0, 1 - this.elapsed / ONSET_SECONDS)
            : 0;

        // Forewarn broadcast: while a rotation event is drawn but not yet
        // started, ramp 0 -> 1 across the forewarn window (holds at 1 if an
        // eclipse delays the start past cooldown zero).
        const forewarn = this.scheduled !== null
            ? Math.min(1, Math.max(0, 1 - this.cooldown / WEATHER_LIFECYCLE.FOREWARN_SECONDS))
            : 0;

        this.lastState = {
            weatherType: this.currentWeather,
            weatherIntensity: this.intensity,
            weatherTime: this.weatherTime,
            weatherOnset,
            weatherIsEvent: isRealEvent ? 1 : 0,
            forewarn,
            upcomingType: this.scheduled !== null ? this.scheduled.type : WEATHER_TYPES.CLEAR,
            eventDirection: this.scheduled !== null ? this.scheduled.direction : this.eventDirection,
            aftermath: this.aftermathRemaining > 0
                ? this.aftermathRemaining / WEATHER_LIFECYCLE.AFTERMATH_SECONDS
                : 0,
            lastEndedType: this.lastEndedType,
            eclipseProgress: this.currentWeather === WEATHER_TYPES.ECLIPSE
                ? Math.min(1, this.elapsed / this.duration)
                : 0,
        };
        lastBroadcast = this.lastState;
        return this.lastState;
    }

    /**
     * Latest state broadcast by update(), or null before the first frame.
     * For consumers wired EARLIER than the weather step in main's fixed
     * frame order (e.g. the precipitation layer inside StatsSunsetUpdater):
     * one frame stale by design — the sky-eye precedent.
     */
    getLastState(): WeatherState | null {
        return this.lastState;
    }

    /**
     * Lifecycle profile for the player's current room (DEFAULT when roomless).
     */
    private currentProfile(): RoomWeatherProfile {
        return this.currentRoomType !== null
            ? ROOM_WEATHER_PROFILES[this.currentRoomType]
            : DEFAULT_WEATHER_PROFILE;
    }

    /**
     * Cooldown draw from a profile, leaned by the behavior bias (layer 4):
     * storm-leaning play shortens the calm, settle-leaning play stretches it.
     * A null/neutral profile multiplies by exactly 1 (bit-identical).
     */
    private drawCooldown(profile: RoomWeatherProfile): number {
        return this.randomRange(...profile.cooldownRange) * weatherCooldownScale(this.behaviorProfile);
    }

    /**
     * Draw the next rotation event (type / duration / intensity / direction).
     * Runs when the cooldown enters the forewarn window — early enough for
     * the world to announce it. Type selection is weighted by the player's
     * current room (flow-audit medium #3: INFO_OVERFLOW heavily favors
     * digital RAIN, POLARIZED keeps GLITCH ruptures dominant) and gently
     * leaned by the behavior profile; ASHFALL/GALE add their per-type tuning
     * on top of the room profile. The brief ambient flickers and the eclipse
     * flash are a SEPARATE transient path (triggerGlitch / forceWeather),
     * flagged with isGlitchEvent so they don't reset the main cooldown; a
     * glitch drawn here is a real, full-duration weather event.
     */
    private scheduleNextWeather(): void {
        const weights = biasedWeatherWeights(
            this.currentRoomType !== null
                ? ROOM_WEATHER_WEIGHTS[this.currentRoomType]
                : DEFAULT_WEATHER_WEIGHTS,
            this.behaviorProfile,
        );
        const profile = this.currentProfile();
        const type = pickWeatherFromWeights(Math.random(), weights);
        if (type === null) {
            // Every type is blocked in this room: skip the event entirely and
            // restart the cooldown so the system keeps ticking.
            this.cooldown = this.drawCooldown(profile);
            return;
        }

        // Duration and intensity follow the room's lifecycle profile (e.g.
        // POLARIZED: short 8-16s ruptures pinned at 0.9-1.0 intensity), then
        // the per-type tuning (identity for the legacy types).
        const tuning = typeTuning(type);
        const duration = this.randomRange(...profile.durationRange) * (tuning?.DURATION_SCALE ?? 1);
        let targetIntensity = this.randomRange(...profile.intensityRange) * (tuning?.INTENSITY_SCALE ?? 1);
        if (tuning !== null) {
            targetIntensity = Math.min(tuning.INTENSITY_MAX, Math.max(tuning.INTENSITY_MIN, targetIntensity));
        }

        // One deterministic heading per event for its whole arc (utils/hash,
        // own salt namespace) — GALE blows somewhere, ASHFALL drifts from it.
        this.eventCounter += 1;
        const direction = hash(this.eventCounter, WEATHER_LIFECYCLE.DIRECTION_SALT) * Math.PI * 2;

        this.scheduled = { type, duration, targetIntensity, direction };
    }

    /**
     * Break the announced rotation event (cooldown expired).
     */
    private startScheduledWeather(): void {
        const event = this.scheduled;
        if (event === null)
            return;
        this.scheduled = null;

        this.currentWeather = event.type;
        this.isGlitchEvent = false;
        this.duration = event.duration;
        this.elapsed = 0;
        this.targetIntensity = event.targetIntensity;
        this.eventDirection = event.direction;
        // A fresh storm overwrites the last one's residue.
        this.aftermathRemaining = 0;

        console.log(`Weather: ${this.getWeatherName()} for ${Math.round(this.duration)}s`);
    }

    /**
     * Begin the eclipse (its own scheduler — never part of the rotation).
     * The rotation cooldown is captured and restored on end, so the rotation
     * pauses under the dark sky instead of losing progress; a pending
     * forewarn simply holds. Hard on: the shadow is cast, not faded in.
     */
    private startEclipse(): void {
        this.savedCooldown = this.cooldown;
        this.isGlitchEvent = false;
        this.isEclipseEvent = true;

        this.currentWeather = WEATHER_TYPES.ECLIPSE;
        this.duration = WEATHER_ECLIPSE.DURATION_SECONDS;
        this.elapsed = 0;
        this.targetIntensity = 1;
        this.intensity = 1;
        this.aftermathRemaining = 0;

        // Draw the next visit NOW so an interrupted eclipse (forced clear)
        // cannot leave a stale past-due timer that immediately re-fires.
        this.nextEclipseAt = this.playTime + this.randomRange(...WEATHER_ECLIPSE.INTERVAL_RANGE);

        console.log(`Weather: Eclipse for ${Math.round(this.duration)}s`);
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
        const endedType = this.currentWeather;
        this.currentWeather = WEATHER_TYPES.CLEAR;
        this.intensity = 0;
        this.targetIntensity = 0;

        if (this.isGlitchEvent) {
            // Transient glitch ending: restore CLEAR without overwriting the
            // existing cooldown, so progress toward the next real event is
            // kept — and with NO aftermath (transients bypass the whole arc).
            this.cooldown = this.savedCooldown;
            this.isGlitchEvent = false;
        }
        else if (this.isEclipseEvent) {
            // Eclipse ending: the paused rotation resumes where it stood, and
            // the sky remembers — a real event leaves a real aftermath.
            this.cooldown = this.savedCooldown;
            this.isEclipseEvent = false;
            this.lastEndedType = endedType;
            this.aftermathRemaining = WEATHER_LIFECYCLE.AFTERMATH_SECONDS;
        }
        else {
            // Real rotation event ending: start a fresh (behavior-leaned)
            // cooldown from the room the player is in NOW (DEFAULT when
            // roomless) and broadcast the aftermath residue.
            this.cooldown = this.drawCooldown(this.currentProfile());
            this.lastEndedType = endedType;
            this.aftermathRemaining = WEATHER_LIFECYCLE.AFTERMATH_SECONDS;
        }
    }

    /**
     * Force a specific weather (for testing)
     * @param type - 'clear', 'static', 'rain', 'glitch', 'ashfall', 'gale', 'eclipse'
     * @param duration - Duration in seconds
     */
    forceWeather(type: string, duration: number = 30): void {
        const typeMap: Record<string, WeatherType> = {
            clear: WEATHER_TYPES.CLEAR,
            static: WEATHER_TYPES.STATIC,
            rain: WEATHER_TYPES.RAIN,
            glitch: WEATHER_TYPES.GLITCH,
            ashfall: WEATHER_TYPES.ASHFALL,
            gale: WEATHER_TYPES.GALE,
            eclipse: WEATHER_TYPES.ECLIPSE,
        };

        this.currentWeather = typeMap[type] ?? WEATHER_TYPES.CLEAR;
        this.duration = duration;
        this.elapsed = 0;
        // A forced REAL state supersedes any announced rotation event: drop
        // the draw so its forewarn stops broadcasting (the cooldown re-enters
        // the forewarn window later and a fresh event is drawn). A forced
        // transient GLITCH keeps the pending draw — transients bypass the
        // forewarn arc exactly as they bypass onset (the ambient-glitch
        // rule), so the solar-eclipse flash cannot snap an announced storm's
        // omen or swap its heading seconds before it lands.
        if (this.currentWeather !== WEATHER_TYPES.GLITCH) {
            this.scheduled = null;
        }

        if (this.currentWeather === WEATHER_TYPES.CLEAR) {
            // Forced clear: snap off and reset cooldown so a previously
            // expired cooldown can't immediately re-trigger random weather.
            this.targetIntensity = 0;
            this.intensity = 0;
            this.isGlitchEvent = false;
            this.isEclipseEvent = false;
            this.cooldown = this.drawCooldown(this.currentProfile());
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
                this.isEclipseEvent = false;
            }
            else if (this.currentWeather === WEATHER_TYPES.ECLIPSE) {
                // A forced eclipse behaves like the scheduled one: the
                // rotation pauses (cooldown restored on end) but it is a real
                // event — onset and aftermath broadcast.
                this.savedCooldown = this.cooldown;
                this.isGlitchEvent = false;
                this.isEclipseEvent = true;
            }
            else {
                // Forced STATIC/RAIN/ASHFALL/GALE are real events: they
                // broadcast an onset window (the dusk weather IS announced)
                // and let endWeather() set a fresh cooldown when they finish.
                this.isGlitchEvent = false;
                this.isEclipseEvent = false;
            }
        }
    }

    /**
     * Get weather name for logging
     */
    private getWeatherName(): string {
        const names = ['Clear', 'Static', 'Rain', 'Glitch', 'Ashfall', 'Gale', 'Eclipse'];
        return names[this.currentWeather] || 'Unknown';
    }

    /**
     * Random range helper
     */
    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
}
