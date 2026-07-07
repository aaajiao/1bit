// 1-bit Chimera Void - Room Sky (per-room sky vocabulary)
//
// The flat background becomes four skies: one camera-following inverted dome
// draws the CURRENT room's celestial treatment behind everything. black = the
// system, white = the self, dither = the friction between them — and the sky
// is where the room's mental state stops pretending to be architecture:
//
// - INFO_OVERFLOW: sparse hard specks blinking on hash phases — signal
//   without meaning, all the way up.
// - FORCED_ALIGNMENT: absolutely horizontal ledger rule-lines — even the sky
//   is a form to be filled in.
// - IN_BETWEEN: two celestial discs slightly offset, one ink one paper — a
//   heaven misregistered, printed once by each system and agreeing on nothing.
// - POLARIZED: the sky splits into an ink half and a paper half through the
//   vertical plane of the local seam line — the ground's us/them continued
//   overhead with nothing in between.
//
// The sky joins the weather (weather batch): the dome reads the WeatherState
// lifecycle broadcast and answers each phase in the room's own vocabulary —
// - forewarn: subtle degradation scaling with the ramp (speck dropouts, line
//   waver, disc tremor, seam jitter), all re-rolled on hard ticks;
// - onset: whole strobe ticks blank the treatment to the raw base — the sky
//   blinks as the storm breaks, thinning out as the announcement fades;
// - peak: INFO's specks densify, stretch into dashes and FALL under digital
//   RAIN; FA's ledger breaks into jittering horizontal segments under STATIC;
//   IN_BETWEEN's discs drift further apart under RAIN/GLITCH stress; the
//   POLARIZED halves SWAP for each screen invert strike (identical cadence
//   math from identical WeatherState inputs — see invertStrikeActive);
// - aftermath: FA's last broken segments snap back into rule as the residue
//   decays. The ECLIPSE runs above all of it: a hard ink disc transits a
//   fixed arc (eclipseArcAzimuth/Elevation), anchored to the dome's celestial
//   anchor at mid-transit, OCCLUDING whatever it crosses in every room.
//
// Discipline: strict 1-bit. Every mark is hard on/off (step()); the treatment
// hard-swaps on room change with a 2-3 frame off/on flicker, never a
// crossfade; the weather responses gate discrete elements on hard per-pixel
// thresholds (densities, ticks, hard offsets) — never an alpha fade. The
// dome's base color is copied from the live scene.background every frame, so
// it can never fight DayNightCycle (which owns that color); at night the
// ink/paper roles are hard-swapped so that, composed with the DitherShader's
// global night inversion, every mark keeps its final polarity (dark specks
// stay dark specks) across the whole cycle.
//
// The dome is global and permanent (no chunk lifecycle): one draw call,
// fog:false, depthWrite:false, drawn behind everything via renderOrder, and
// re-centered on the player's x/z each frame so it is never approached.
// Owned and driven by core/StatsSunsetUpdater (beside the DayNightCycle whose
// blend it follows — the WeatherState it forwards is the LAST frame's
// broadcast, the sky-eye precedent); disposed there on teardown.
import type { WeatherState } from '../types';
import type { ColorRGB } from './RoomConfig';
import * as THREE from 'three';
import { ROOM_SKY } from '../config';
import { hash } from '../utils/hash';
import { riftLineXForWorldX, ROOM_CONFIGS, RoomType } from './RoomConfig';
import { WEATHER_TYPES } from './WeatherSystem';

/**
 * Shader treatment ids consumed by the dome fragment shader's uMode. Not a
 * DitherShader mode — this is a dedicated object-level ShaderMaterial (same
 * precedent as the cable uplink material: the 6-site DitherShader uniform
 * chain is deliberately untouched).
 */
export const ROOM_SKY_MODE = {
    /** INFO_OVERFLOW: sparse blinking specks. */
    SPECKS: 0,
    /** FORCED_ALIGNMENT: horizontal ledger rule-lines. */
    LEDGER: 1,
    /** IN_BETWEEN: two misregistered celestial discs. */
    TWIN_DISCS: 2,
    /** POLARIZED: hard ink/paper split through the seam plane. */
    SPLIT: 3,
} as const;

// Hash salts (utils/hash integer namespaces, distinct from every other
// stream — current max in use elsewhere is 1637). Per-tick forewarn jitters
// only: purely visual, so no generation-affecting stream is consumed.
const SKY_SEAM_JITTER_SALT = 1657;
const SKY_TREMOR_AZ_SALT = 1663;
const SKY_TREMOR_EL_SALT = 1667;

/** Room -> sky treatment (bijective; the sky is part of the room's identity). */
export function roomSkyMode(roomType: RoomType): number {
    switch (roomType) {
        case RoomType.INFO_OVERFLOW: return ROOM_SKY_MODE.SPECKS;
        case RoomType.FORCED_ALIGNMENT: return ROOM_SKY_MODE.LEDGER;
        case RoomType.IN_BETWEEN: return ROOM_SKY_MODE.TWIN_DISCS;
        case RoomType.POLARIZED: return ROOM_SKY_MODE.SPLIT;
    }
}

/**
 * World x of the vertical plane the POLARIZED sky splits along: the seam line
 * nearest the player. A POLARIZED chunk's razor seam runs down its center x
 * (ChunkManager.updateSeamSwap judges the band against chunk.position.x), and
 * riftLineXForWorldX is the single conversion source for that chunk-column
 * center — so the sky's split always stands directly over the floor seam the
 * player is standing nearest to. Pure, per-frame safe.
 */
export function skySeamXForPlayerX(playerX: number): number {
    return riftLineXForWorldX(playerX);
}

/**
 * Dome visibility during the room hard-swap flicker, from the frames-left
 * countdown: hidden on odd counts, visible on even. Counting down from an odd
 * SWAP_FLICKER_FRAMES (e.g. 3 -> hidden, visible, hidden) ends hidden and then
 * settles visible — an off/on/off stutter, never a fade. Pure.
 */
export function swapFlickerVisible(framesLeft: number): boolean {
    return framesLeft % 2 === 0;
}

/**
 * Unit direction of a celestial disc center from azimuth (rad, 0 = +z,
 * increasing toward +x) and elevation (rad above the horizon). Pure; used
 * once at construction for the IN_BETWEEN twin discs (setDirFromAzEl is its
 * allocation-free per-frame twin).
 */
export function celestialDiscDirection(azimuth: number, elevation: number): [number, number, number] {
    const cosEl = Math.cos(elevation);
    return [cosEl * Math.sin(azimuth), Math.sin(elevation), cosEl * Math.cos(azimuth)];
}

/**
 * The dome's ink/paper duotone for a room and day phase. Day uses the room's
 * own RoomConfig colors; night hard-swaps the roles so that, composed with
 * the DitherShader's global night inversion, every sky mark keeps its final
 * polarity across the cycle (a swap is 1-bit; a dim would be a fade). Pure.
 */
export function skyPalette(roomType: RoomType, isDay: boolean): { ink: ColorRGB; paper: ColorRGB } {
    const shader = ROOM_CONFIGS[roomType].shader;
    return isDay
        ? { ink: shader.inkColor, paper: shader.paperColor }
        : { ink: shader.paperColor, paper: shader.inkColor };
}

/**
 * The dome's per-frame weather drive, normalized from the WeatherState
 * lifecycle broadcast (see skyWeatherDrive). Raw phase scalars feed the
 * shader; fallRate/discSeparation are the CPU-side derivations.
 */
export interface SkyWeatherDrive {
    /** WEATHER_TYPES value of the active weather (world type, unmapped). */
    weatherType: number;
    /** Active intensity, clamped 0-1. */
    intensity: number;
    /** Onset broadcast (1 -> 0 after a real event breaks). */
    onset: number;
    /** 1 for a REAL event, 0 for transient ambient glitches and CLEAR. */
    isEvent: number;
    /** WeatherState.weatherTime — the screen shader's own weather clock. */
    weatherTime: number;
    /** Forewarn ramp (0 -> 1 while the next event is announced). */
    forewarn: number;
    /** Aftermath residue (1 -> 0 after a real event ends). */
    aftermath: number;
    /** WEATHER_TYPES value of the last real event that ended. */
    lastEndedType: number;
    /** ECLIPSE transit progress (0 outside one). */
    eclipseProgress: number;
    /** INFO fall-field rate: RAIN intensity, 0 for every other type. */
    fallRate: number;
    /**
     * IN_BETWEEN plate-offset multiplier (1 = at rest): RAIN/GLITCH stress
     * widens the misregister by DISC_DRIFT_GAIN.
     */
    discSeparation: number;
}

/** A zeroed drive (the CLEAR sky). One per dome; reused every frame. */
export function newSkyWeatherDrive(): SkyWeatherDrive {
    return {
        weatherType: WEATHER_TYPES.CLEAR,
        intensity: 0,
        onset: 0,
        isEvent: 0,
        weatherTime: 0,
        forewarn: 0,
        aftermath: 0,
        lastEndedType: WEATHER_TYPES.CLEAR,
        eclipseProgress: 0,
        fallRate: 0,
        discSeparation: 1,
    };
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

/**
 * WeatherState -> dome uniform values: clamp the phase scalars and derive
 * the CPU-side responses (INFO fall rate, IN_BETWEEN plate separation).
 * Null (the boot frame — the dome runs before the weather step in main's
 * fixed order) is exactly the CLEAR sky. Writes into `out` and returns it,
 * so the per-frame path allocates nothing. Pure.
 */
export function skyWeatherDrive(state: WeatherState | null, out: SkyWeatherDrive): SkyWeatherDrive {
    if (state === null) {
        out.weatherType = WEATHER_TYPES.CLEAR;
        out.intensity = 0;
        out.onset = 0;
        out.isEvent = 0;
        out.weatherTime = 0;
        out.forewarn = 0;
        out.aftermath = 0;
        out.lastEndedType = WEATHER_TYPES.CLEAR;
        out.eclipseProgress = 0;
        out.fallRate = 0;
        out.discSeparation = 1;
        return out;
    }
    out.weatherType = state.weatherType;
    out.intensity = clamp01(state.weatherIntensity);
    out.onset = clamp01(state.weatherOnset);
    out.isEvent = state.weatherIsEvent > 0 ? 1 : 0;
    out.weatherTime = state.weatherTime;
    out.forewarn = clamp01(state.forewarn);
    out.aftermath = clamp01(state.aftermath);
    out.lastEndedType = state.lastEndedType;
    out.eclipseProgress = clamp01(state.eclipseProgress);
    // Only digital RAIN turns the INFO speck field into a falling one; the
    // world-space types (ASHFALL/GALE) live in the precipitation layer and
    // must leave the dome treatments alone.
    out.fallRate = state.weatherType === WEATHER_TYPES.RAIN ? out.intensity : 0;
    // RAIN and GLITCH are the stress the IN_BETWEEN misregister widens under
    // (the same pair the screen's misregister boost answers to).
    const stressed = state.weatherType === WEATHER_TYPES.RAIN || state.weatherType === WEATHER_TYPES.GLITCH;
    out.discSeparation = 1 + ROOM_SKY.WEATHER.DISC_DRIFT_GAIN * (stressed ? out.intensity : 0);
    return out;
}

/**
 * FA ledger break amount — the CPU reference of the LEDGER branch's breakAmt
 * derivation in SKY_FRAGMENT_SHADER (kept in exact step with it): STATIC
 * drives the break with its live intensity (so the lines re-align as it
 * decays); after it ends the aftermath keeps a LEDGER_AFTERMATH_SCALE
 * residue of segments snapping back one hard roll at a time. Pure.
 */
export function ledgerBreakAmount(weatherType: number, intensity: number, lastEndedType: number, aftermath: number): number {
    if (weatherType === WEATHER_TYPES.STATIC)
        return clamp01(intensity);
    if (lastEndedType === WEATHER_TYPES.STATIC)
        return clamp01(aftermath) * ROOM_SKY.WEATHER.LEDGER_AFTERMATH_SCALE;
    return 0;
}

/**
 * POLARIZED invert-strike gate — the CPU reference of the SPLIT branch's
 * strike block in SKY_FRAGMENT_SHADER, which itself reproduces the screen
 * shader's cadence verbatim (DitherShader: windowed Bernoulli roll
 * fract(sin(windowIdx * 127.1) * 43758.5453) on mod(weatherTime, 3600),
 * gated on a real GLITCH event). Sky and screen therefore strike in the
 * same frames by construction: both GLSL blocks run the same expression on
 * the same GPU from the same WeatherState inputs. This double-precision
 * mirror exists for the tests that pin the cadence contract. Pure.
 */
export function invertStrikeActive(
    weatherTime: number,
    weatherType: number,
    intensity: number,
    isEvent: number,
    invertStrike: number,
): boolean {
    if (invertStrike <= 0 || isEvent <= 0.5 || weatherType !== WEATHER_TYPES.GLITCH || intensity <= 0)
        return false;
    const W = ROOM_SKY.WEATHER;
    const wTime = weatherTime % 3600;
    const windowIdx = Math.floor(wTime / W.STRIKE_WINDOW_SECONDS);
    const tInWindow = wTime - windowIdx * W.STRIKE_WINDOW_SECONDS;
    // Same sine-hash construction as the screen shader's strikeRoll (the
    // utils/hash family): fract(sin(windowIdx * 127.1) * 43758.5453).
    const n = Math.sin(windowIdx * 127.1) * 43758.5453;
    const strikeRoll = n - Math.floor(n);
    return strikeRoll < invertStrike * W.STRIKE_CHANCE && tInWindow < W.STRIKE_SECONDS;
}

/**
 * ECLIPSE transit arc, azimuth half: a fixed sweep of ECLIPSE_ARC_SPAN rad
 * centered on the dome's celestial anchor (the IN_BETWEEN disc azimuth) —
 * at mid-transit (progress 0.5) the shadow sits exactly on the anchor. Pure.
 */
export function eclipseArcAzimuth(progress: number): number {
    return ROOM_SKY.DISC_AZIMUTH + (progress - 0.5) * ROOM_SKY.WEATHER.ECLIPSE_ARC_SPAN;
}

/**
 * ECLIPSE transit arc, elevation half: a parabola peaking at the anchor
 * elevation at mid-transit and dipping ECLIPSE_ARC_DIP below it at both
 * ends — deep enough that the disc rises from and sets beneath the horizon
 * (config contract test). Pure.
 */
export function eclipseArcElevation(progress: number): number {
    const q = progress * 2 - 1;
    return ROOM_SKY.DISC_ELEVATION - ROOM_SKY.WEATHER.ECLIPSE_ARC_DIP * q * q;
}

/**
 * Forewarn degradation jitter: a hash-signed offset in [-0.5, 0.5] scaled by
 * the forewarn ramp, re-rolled per hard tick (never a slide — the value
 * holds for the whole tick, then snaps). Exactly 0 outside a forewarn.
 * Callers scale by their own amplitude (rad / meters / periods). Pure.
 */
export function forewarnJitter(tick: number, salt: number, forewarn: number): number {
    if (forewarn <= 0)
        return 0;
    return (hash(tick, salt) - 0.5) * Math.min(1, forewarn);
}

// In-shader analogue of utils/hash (same sine/magic-number construction) for
// per-cell speck gates and blink phases: purely visual, deterministic per
// direction, so no JS-side salt is consumed.
const SKY_VERTEX_SHADER = `
    varying vec3 vDir;
    varying vec3 vWorldPos;
    void main() {
        // Object-space direction: stable under the x/z player-follow, so the
        // sky never scrolls with walking (a sky, not a ceiling).
        vDir = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

/**
 * Dome fragment shader. Exported for the strike-cadence contract test only
 * (tests/RoomSky.test.ts asserts its SPLIT block reproduces the screen
 * shader's strike expression verbatim); not part of the runtime API.
 */
export const SKY_FRAGMENT_SHADER = `
    uniform int uMode;
    uniform float uTime;
    uniform vec3 uInk;
    uniform vec3 uPaper;
    uniform vec3 uBase;
    uniform float uSeamX;
    uniform float uSpeckGrid;
    uniform float uSpeckFill;
    uniform float uSpeckSize;
    uniform float uSpeckBlinkSpeed;
    uniform float uLineCount;
    uniform float uLineThickness;
    uniform vec3 uDiscDirInk;
    uniform vec3 uDiscDirPaper;
    uniform float uDiscCos;
    // Weather lifecycle broadcast (WeatherState via skyWeatherDrive).
    uniform int uWeatherType;
    uniform float uWeatherIntensity;
    uniform float uWeatherOnset;
    uniform float uWeatherIsEvent;
    uniform float uWeatherTime;
    uniform float uForewarn;
    uniform float uAftermath;
    uniform int uLastEndedType;
    uniform float uEclipseProgress;
    uniform vec3 uEclipseDir;
    uniform float uFallPhase;
    // Room strike scalar (POLARIZED 1, elsewhere ignored by the mode gate).
    uniform float uInvertStrike;
    // Set-once weather knobs (all tunables live in ROOM_SKY.WEATHER).
    uniform float uEclipseCos;
    uniform float uStrikeWindow;
    uniform float uStrikeChance;
    uniform float uStrikeSeconds;
    uniform float uRainDensify;
    uniform float uRainStreak;
    uniform float uLedgerSegments;
    uniform float uLedgerBreakMax;
    uniform float uLedgerJitterAmp;
    uniform float uLedgerJitterHz;
    uniform float uLedgerAfterScale;
    uniform float uFlutterHz;
    uniform float uFlutterDrop;
    uniform float uLineWaver;
    uniform float uOnsetStrobeHz;
    varying vec3 vDir;
    varying vec3 vWorldPos;

    float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec3 dir = normalize(vDir);
        // Lat/long parametrization: azimuth around y, elevation off the horizon.
        float az = atan(dir.x, dir.z) / 6.28318530718 + 0.5; // 0..1
        float el = asin(clamp(dir.y, -1.0, 1.0)) / 1.57079632679; // -1..1

        vec3 c = uBase;
        if (uMode == 0) {
            // INFO_OVERFLOW: sparse hard speck squares blinking on hash
            // phases. Each lat/long cell draws at most one speck at a
            // hash-jittered spot; step() keeps everything strictly on/off.
            // Digital RAIN (type 2) turns the field into a falling one: the
            // fill densifies (each cell gates on at its own hash threshold),
            // specks stretch into downward dashes and the whole grid scrolls
            // on the CPU-side fall phase — every pixel still binary.
            float rainAmt = (uWeatherType == 2) ? uWeatherIntensity : 0.0;
            float fill = uSpeckFill * (1.0 + uRainDensify * rainAmt);
            vec2 cellUv = vec2(az * uSpeckGrid, (el * 0.5 + 0.5) * uSpeckGrid * 0.5 + uFallPhase);
            vec2 cell = floor(cellUv);
            float gate = hash2(cell);
            float host = step(1.0 - fill, gate);
            vec2 jitter = vec2(hash2(cell + 17.0), hash2(cell + 53.0));
            vec2 center = jitter * (1.0 - uSpeckSize) + uSpeckSize * 0.5;
            vec2 d = abs(fract(cellUv) - center);
            float stretch = 1.0 + uRainStreak * rainAmt;
            float speck = step(max(d.x, d.y / stretch), uSpeckSize * 0.5);
            float blink = step(0.5, fract(uTime * uSpeckBlinkSpeed + gate * 9.13));
            // Rain locks cells solid-on per-cell hash threshold (not a
            // fade): a falling field does not blink out mid-fall.
            blink = max(blink, step(hash2(cell + 71.0), rainAmt));
            // Forewarn flutter: per-cell dropouts re-rolled on hard ticks —
            // the signal degrades before the storm arrives.
            float fTick = mod(floor(uTime * uFlutterHz), 1024.0);
            float flutter = step(uForewarn * uFlutterDrop, hash2(cell + vec2(fTick * 0.618, fTick * 0.383)));
            c = mix(uBase, uInk, host * speck * blink * flutter);
        }
        else if (uMode == 1) {
            // FORCED_ALIGNMENT: absolutely horizontal ledger rule-lines,
            // evenly spaced in elevation ANGLE across the above-horizon band.
            // STATIC (type 1) breaks each line into azimuth segments that
            // jitter vertically on hard ticks; as its intensity decays fewer
            // segments roll broken, and the aftermath keeps a residue of
            // last segments snapping back into rule (ledgerBreakAmount is
            // this derivation's CPU reference). The forewarn wavers whole
            // lines by a hair. Distance-to-nearest-line form, so a shifted
            // segment is never clipped inside its owner half-period.
            float breakAmt = (uWeatherType == 1)
                ? uWeatherIntensity
                : ((uLastEndedType == 1) ? uAftermath * uLedgerAfterScale : 0.0);
            float f = el * uLineCount;
            float lineIdx = floor(f + 0.5);
            float local = f - lineIdx;
            float segIdx = floor(az * uLedgerSegments);
            float jTick = mod(floor(uTime * uLedgerJitterHz), 1024.0);
            float broken = step(hash2(vec2(lineIdx * 13.7 + segIdx, jTick * 0.731)), breakAmt * uLedgerBreakMax);
            float segJit = (hash2(vec2(segIdx * 7.3 + lineIdx, jTick * 0.531 + 29.0)) - 0.5) * uLedgerJitterAmp;
            float wTick = mod(floor(uTime * uFlutterHz), 1024.0);
            float waver = (hash2(vec2(lineIdx * 3.7, wTick * 0.529)) - 0.5) * uForewarn * uLineWaver;
            float x = local - broken * segJit - waver;
            float line = step(0.0, x) * (1.0 - step(uLineThickness, x)) * step(0.0, el);
            c = mix(uBase, uInk, line);
        }
        else if (uMode == 2) {
            // IN_BETWEEN: two celestial discs slightly offset — a heaven
            // printed once by each system. Paper plate first, ink plate over
            // it: the overlap goes ink, leaving a paper misregister rim.
            // The plate directions are CPU-side uniforms: RAIN/GLITCH stress
            // widens the misregister and the forewarn makes both plates
            // tremble on hard ticks (see update()).
            float paperDisc = step(uDiscCos, dot(dir, uDiscDirPaper));
            float inkDisc = step(uDiscCos, dot(dir, uDiscDirInk));
            c = mix(mix(uBase, uPaper, paperDisc), uInk, inkDisc);
        }
        else {
            // POLARIZED: the sky splits hard through the vertical plane of
            // the local seam line — ink west, paper east, nothing between.
            // During a real GLITCH rupture the halves SWAP for each screen
            // invert strike: the block below reproduces the DitherShader's
            // strike cadence VERBATIM from the same WeatherState inputs
            // (weatherTime / isEvent), so sky and screen rupture in the same
            // frames (CPU reference: invertStrikeActive).
            float swap = 0.0;
            if (uInvertStrike > 0.0 && uWeatherIsEvent > 0.5 && uWeatherType == 3 && uWeatherIntensity > 0.0) {
                float wT = mod(uWeatherTime, 3600.0);
                float windowIdx = floor(wT / uStrikeWindow);
                float tInWindow = wT - windowIdx * uStrikeWindow;
                float strikeRoll = fract(sin(windowIdx * 127.1) * 43758.5453);
                if (strikeRoll < uInvertStrike * uStrikeChance && tInWindow < uStrikeSeconds) {
                    swap = 1.0;
                }
            }
            float side = step(uSeamX, vWorldPos.x);
            c = mix(uInk, uPaper, abs(side - swap));
        }

        // Onset broadcast: while the onset window decays, whole strobe ticks
        // blank the treatment back to the raw base — the sky blinks as the
        // storm breaks, thinning out as the announcement fades. The blank is
        // a binary mix (a tick either fires or it doesn't), never a fade.
        if (uWeatherOnset > 0.0) {
            float oTick = mod(floor(uTime * uOnsetStrobeHz), 1024.0);
            float tickOn = step(hash2(vec2(oTick * 0.917, 4.7)), uWeatherOnset);
            c = mix(c, uBase, tickOn * step(0.5, fract(uTime * uOnsetStrobeHz)));
        }

        // ECLIPSE: the authority's hard ink disc transits the dome on its
        // fixed arc, above every room's treatment. It OCCLUDES whatever it
        // crosses — in IN_BETWEEN both misregistered discs simply disappear
        // behind it (the two systems' prints agree on nothing except the
        // shadow). Drawn after the onset strobe: the authority never
        // flickers.
        if (uEclipseProgress > 0.0) {
            c = mix(c, uInk, step(uEclipseCos, dot(dir, uEclipseDir)));
        }
        gl_FragColor = vec4(c, 1.0);
    }
`;

/**
 * Write a unit az/el direction into `target` — the allocation-free per-frame
 * twin of celestialDiscDirection (same math, no tuple).
 */
function setDirFromAzEl(target: THREE.Vector3, azimuth: number, elevation: number): void {
    const cosEl = Math.cos(elevation);
    target.set(cosEl * Math.sin(azimuth), Math.sin(elevation), cosEl * Math.cos(azimuth));
}

/**
 * The camera-following sky dome. One inverted sphere, one dedicated
 * ShaderMaterial, one draw call. See the file header for the design contract;
 * update() is allocation-free (color copies + scalar uniform writes only).
 */
export class RoomSky {
    private readonly scene: THREE.Scene;
    private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

    // Accumulated play time (s): delta-driven, so the speck blink phase is
    // pause-gated along with the rest of the update phase.
    private time = 0;

    // INFO fall field phase (speck-grid rows): advances only while digital
    // rain falls, so the specks freeze exactly where the storm leaves them.
    private fallPhase = 0;

    // Reused weather-drive target (skyWeatherDrive writes into it each
    // frame): keeps the per-frame path allocation-free.
    private readonly drive = newSkyWeatherDrive();

    // Last applied room/day state, so palette + mode writes happen only on
    // actual change; null until the first update applies the initial state
    // (without a flicker — waking up is not a room swap).
    private currentRoom: RoomType | null = null;
    private wasDay: boolean | null = null;

    // Room hard-swap flicker countdown (frames). See swapFlickerVisible.
    private flickerFramesLeft = 0;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uMode: { value: ROOM_SKY_MODE.SPECKS },
                uTime: { value: 0 },
                uInk: { value: new THREE.Color(0, 0, 0) },
                uPaper: { value: new THREE.Color(1, 1, 1) },
                uBase: { value: new THREE.Color(0x888888) },
                uSeamX: { value: 0 },
                // Set-once treatment knobs (all tunables live in ROOM_SKY).
                uSpeckGrid: { value: ROOM_SKY.SPECK_GRID },
                uSpeckFill: { value: ROOM_SKY.SPECK_FILL },
                uSpeckSize: { value: ROOM_SKY.SPECK_SIZE },
                uSpeckBlinkSpeed: { value: ROOM_SKY.SPECK_BLINK_SPEED },
                uLineCount: { value: ROOM_SKY.LINE_COUNT },
                uLineThickness: { value: ROOM_SKY.LINE_THICKNESS },
                uDiscDirInk: {
                    value: new THREE.Vector3(...celestialDiscDirection(
                        ROOM_SKY.DISC_AZIMUTH,
                        ROOM_SKY.DISC_ELEVATION,
                    )),
                },
                uDiscDirPaper: {
                    value: new THREE.Vector3(...celestialDiscDirection(
                        ROOM_SKY.DISC_AZIMUTH + ROOM_SKY.DISC_OFFSET_AZIMUTH,
                        ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION,
                    )),
                },
                uDiscCos: { value: Math.cos(ROOM_SKY.DISC_ANGULAR_RADIUS) },
                // Weather lifecycle broadcast (skyWeatherDrive, per frame).
                uWeatherType: { value: WEATHER_TYPES.CLEAR },
                uWeatherIntensity: { value: 0 },
                uWeatherOnset: { value: 0 },
                uWeatherIsEvent: { value: 0 },
                uWeatherTime: { value: 0 },
                uForewarn: { value: 0 },
                uAftermath: { value: 0 },
                uLastEndedType: { value: WEATHER_TYPES.CLEAR },
                uEclipseProgress: { value: 0 },
                // Straight down until the first eclipse frame aims it.
                uEclipseDir: { value: new THREE.Vector3(0, -1, 0) },
                uFallPhase: { value: 0 },
                // Room strike scalar; written on room hard-swap (update()).
                uInvertStrike: { value: 0 },
                // Set-once weather knobs (ROOM_SKY.WEATHER).
                uEclipseCos: { value: Math.cos(ROOM_SKY.WEATHER.ECLIPSE_ANGULAR_RADIUS) },
                uStrikeWindow: { value: ROOM_SKY.WEATHER.STRIKE_WINDOW_SECONDS },
                uStrikeChance: { value: ROOM_SKY.WEATHER.STRIKE_CHANCE },
                uStrikeSeconds: { value: ROOM_SKY.WEATHER.STRIKE_SECONDS },
                uRainDensify: { value: ROOM_SKY.WEATHER.RAIN_DENSIFY_GAIN },
                uRainStreak: { value: ROOM_SKY.WEATHER.RAIN_STREAK_GAIN },
                uLedgerSegments: { value: ROOM_SKY.WEATHER.LEDGER_SEGMENTS },
                uLedgerBreakMax: { value: ROOM_SKY.WEATHER.LEDGER_BREAK_MAX },
                uLedgerJitterAmp: { value: ROOM_SKY.WEATHER.LEDGER_JITTER_AMP },
                uLedgerJitterHz: { value: ROOM_SKY.WEATHER.LEDGER_JITTER_HZ },
                uLedgerAfterScale: { value: ROOM_SKY.WEATHER.LEDGER_AFTERMATH_SCALE },
                uFlutterHz: { value: ROOM_SKY.WEATHER.FOREWARN_TICK_HZ },
                uFlutterDrop: { value: ROOM_SKY.WEATHER.FOREWARN_SPECK_DROP },
                uLineWaver: { value: ROOM_SKY.WEATHER.FOREWARN_LINE_WAVER },
                uOnsetStrobeHz: { value: ROOM_SKY.WEATHER.ONSET_STROBE_HZ },
            },
            vertexShader: SKY_VERTEX_SHADER,
            fragmentShader: SKY_FRAGMENT_SHADER,
            // Seen from inside; ignores scene fog (it IS the beyond-the-fog);
            // never writes depth so the whole world overdraws it.
            side: THREE.BackSide,
            fog: false,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(ROOM_SKY.RADIUS, ROOM_SKY.WIDTH_SEGMENTS, ROOM_SKY.HEIGHT_SEGMENTS),
            material,
        );
        this.mesh.renderOrder = ROOM_SKY.RENDER_ORDER;
        // The shell always surrounds the camera — culling it would blank the sky.
        this.mesh.frustumCulled = false;
        // Hidden until the first update: the app boots PAUSED behind the start
        // screen (PauseController) and renders without updating, so the dome
        // would otherwise show these constructor defaults (SPECKS, ink/paper)
        // regardless of the spawn room. Keeping the flat background until the
        // real room is known matches pre-dome behavior; the first update's
        // settle branch reveals it (no flicker — waking up is not a room swap).
        this.mesh.visible = false;
        scene.add(this.mesh);
    }

    /**
     * Drive the dome for this frame. Runs right after DayNightCycle.update
     * (StatsSunsetUpdater) so the base color and day polarity are this
     * frame's — the dome follows the cycle's blend by construction.
     * @param delta - Frame delta (s), pause-gated upstream.
     * @param playerPos - Player world position (dome re-centers on x/z).
     * @param roomType - The player's CURRENT room (hard-swaps the treatment).
     * @param isDay - DayNightCycle day phase (hard-swaps ink/paper roles).
     * @param weather - Last broadcast WeatherState (null on the boot frame —
     *   the dome runs before the weather step in main's fixed order; one
     *   frame stale by design, the sky-eye/precipitation precedent).
     */
    update(
        delta: number,
        playerPos: THREE.Vector3,
        roomType: RoomType,
        isDay: boolean,
        weather: WeatherState | null = null,
    ): void {
        this.time += delta;
        const u = this.mesh.material.uniforms;
        u.uTime.value = this.time;

        // Weather drive: normalized phases + CPU-side responses, written
        // into the reused target (allocation-free).
        const drive = skyWeatherDrive(weather, this.drive);
        u.uWeatherType.value = drive.weatherType;
        u.uWeatherIntensity.value = drive.intensity;
        u.uWeatherOnset.value = drive.onset;
        u.uWeatherIsEvent.value = drive.isEvent;
        u.uWeatherTime.value = drive.weatherTime;
        u.uForewarn.value = drive.forewarn;
        u.uAftermath.value = drive.aftermath;
        u.uLastEndedType.value = drive.lastEndedType;
        u.uEclipseProgress.value = drive.eclipseProgress;

        // INFO fall field: the phase advances only while digital rain falls
        // (the specks freeze exactly where the storm leaves them), wrapped
        // so fract() precision never decays over a long session.
        this.fallPhase = (this.fallPhase + delta * ROOM_SKY.WEATHER.RAIN_FALL_SPEED * drive.fallRate)
            % ROOM_SKY.WEATHER.RAIN_FALL_WRAP;
        u.uFallPhase.value = this.fallPhase;

        // Follow on x/z only: the dome stays on the world's vertical datum so
        // the horizon, rules and discs never bob with jumps or the rift fall.
        this.mesh.position.set(playerPos.x, 0, playerPos.z);

        // The POLARIZED split plane stands over the seam nearest the player —
        // plus the forewarn tremor: before a storm the border itself is less
        // sure of where it stands (hard per-tick offsets, never a slide).
        const tick = Math.floor(this.time * ROOM_SKY.WEATHER.FOREWARN_TICK_HZ);
        u.uSeamX.value = skySeamXForPlayerX(playerPos.x)
            + forewarnJitter(tick, SKY_SEAM_JITTER_SALT, drive.forewarn) * ROOM_SKY.WEATHER.FOREWARN_SEAM_JITTER;

        // Base = the live background (DayNightCycle owns it): copied every
        // frame, so day/night transitions and eclipses carry through exactly.
        if (this.scene.background instanceof THREE.Color)
            (u.uBase.value as THREE.Color).copy(this.scene.background);

        // Hard-swap treatment + palette on change only. A ROOM change also
        // arms the off/on/off flicker; the day/night role swap does not (the
        // global inversion is already the cycle's own hard cut).
        if (roomType !== this.currentRoom || isDay !== this.wasDay) {
            if (this.currentRoom !== null && roomType !== this.currentRoom)
                this.flickerFramesLeft = ROOM_SKY.SWAP_FLICKER_FRAMES;
            this.currentRoom = roomType;
            this.wasDay = isDay;
            u.uMode.value = roomSkyMode(roomType);
            const { ink, paper } = skyPalette(roomType, isDay);
            (u.uInk.value as THREE.Color).setRGB(ink[0], ink[1], ink[2]);
            (u.uPaper.value as THREE.Color).setRGB(paper[0], paper[1], paper[2]);
            // The strike scalar rides the room's own shader config — the
            // same source the screen's uWeatherInvertStrike lerp reads —
            // hard-swapped with the rest of the sky vocabulary (the sky
            // never blends between rooms). Known divergence: the screen's
            // copy lerps across a room transition (~0.5 s at
            // TRANSITION_SPEED), so a GLITCH strike whose roll lands between
            // the lerped and final thresholds can fire on one surface but
            // not the other for that window; steady-state cadence is
            // identical by construction.
            u.uInvertStrike.value = ROOM_CONFIGS[roomType].shader.weatherInvertStrike;
        }

        // IN_BETWEEN celestial plates: RAIN/GLITCH stress slides the paper
        // plate further off the ink plate's anchor (the misregister widens),
        // and the forewarn shakes both plates rigidly — registration intact,
        // hands unsteady. Other rooms keep the set-once directions.
        if (this.currentRoom === RoomType.IN_BETWEEN) {
            const tremorAz = forewarnJitter(tick, SKY_TREMOR_AZ_SALT, drive.forewarn)
                * ROOM_SKY.WEATHER.FOREWARN_DISC_TREMOR;
            const tremorEl = forewarnJitter(tick, SKY_TREMOR_EL_SALT, drive.forewarn)
                * ROOM_SKY.WEATHER.FOREWARN_DISC_TREMOR;
            setDirFromAzEl(
                u.uDiscDirInk.value as THREE.Vector3,
                ROOM_SKY.DISC_AZIMUTH + tremorAz,
                ROOM_SKY.DISC_ELEVATION + tremorEl,
            );
            setDirFromAzEl(
                u.uDiscDirPaper.value as THREE.Vector3,
                ROOM_SKY.DISC_AZIMUTH + ROOM_SKY.DISC_OFFSET_AZIMUTH * drive.discSeparation + tremorAz,
                ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION * drive.discSeparation + tremorEl,
            );
        }

        // ECLIPSE transit: aim the authority disc along the fixed arc. The
        // below-horizon endpoints make it rise and set instead of popping.
        if (drive.eclipseProgress > 0) {
            setDirFromAzEl(
                u.uEclipseDir.value as THREE.Vector3,
                eclipseArcAzimuth(drive.eclipseProgress),
                eclipseArcElevation(drive.eclipseProgress),
            );
        }

        // Swap flicker: hidden frames expose the raw background — the sky
        // blinks out and back as the new vocabulary takes the dome.
        if (this.flickerFramesLeft > 0) {
            this.mesh.visible = swapFlickerVisible(this.flickerFramesLeft);
            this.flickerFramesLeft--;
        }
        else if (!this.mesh.visible) {
            this.mesh.visible = true;
        }
    }

    /** Remove the dome and free its geometry + material (app teardown). */
    dispose(): void {
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
