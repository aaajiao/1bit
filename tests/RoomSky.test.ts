import type { WeatherState } from '../src/types';
import { describe, expect, it } from 'vitest';
import { PERFORMANCE, ROOM_SKY, WORLD } from '../src/config/constants';
import { DitherShader } from '../src/shaders/DitherShader';
import { FA_RIFT, riftLineXForWorldX, ROOM_CONFIGS, RoomType } from '../src/world/RoomConfig';
import {
    celestialDiscDirection,
    eclipseArcAzimuth,
    eclipseArcElevation,
    forewarnJitter,
    invertStrikeActive,
    ledgerBreakAmount,
    newSkyWeatherDrive,
    ROOM_SKY_MODE,
    roomSkyMode,
    SKY_FRAGMENT_SHADER,
    skyPalette,
    skySeamXForPlayerX,
    skyWeatherDrive,
    swapFlickerVisible,
} from '../src/world/RoomSky';
import { WEATHER_TYPES } from '../src/world/WeatherSystem';

/** A CLEAR WeatherState with overridable fields (the broadcast shape). */
function weatherState(overrides: Partial<WeatherState> = {}): WeatherState {
    return {
        weatherType: WEATHER_TYPES.CLEAR,
        weatherIntensity: 0,
        weatherTime: 0,
        weatherOnset: 0,
        weatherIsEvent: 0,
        forewarn: 0,
        upcomingType: WEATHER_TYPES.CLEAR,
        eventDirection: 0,
        aftermath: 0,
        lastEndedType: WEATHER_TYPES.CLEAR,
        eclipseProgress: 0,
        ...overrides,
    };
}

const ALL_ROOMS = [
    RoomType.INFO_OVERFLOW,
    RoomType.FORCED_ALIGNMENT,
    RoomType.IN_BETWEEN,
    RoomType.POLARIZED,
];

describe('roomSkyMode', () => {
    it('maps each room to its own sky treatment', () => {
        expect(roomSkyMode(RoomType.INFO_OVERFLOW)).toBe(ROOM_SKY_MODE.SPECKS);
        expect(roomSkyMode(RoomType.FORCED_ALIGNMENT)).toBe(ROOM_SKY_MODE.LEDGER);
        expect(roomSkyMode(RoomType.IN_BETWEEN)).toBe(ROOM_SKY_MODE.TWIN_DISCS);
        expect(roomSkyMode(RoomType.POLARIZED)).toBe(ROOM_SKY_MODE.SPLIT);
    });

    it('is bijective: four rooms, four distinct modes', () => {
        const modes = new Set(ALL_ROOMS.map(roomSkyMode));
        expect(modes.size).toBe(4);
    });
});

describe('skySeamXForPlayerX', () => {
    it('agrees with riftLineXForWorldX (single conversion source for seam x)', () => {
        for (const x of [-201, -80, -41, -39, 0, 39, 41, 80, 123.4]) {
            expect(skySeamXForPlayerX(x)).toBe(riftLineXForWorldX(x));
        }
    });

    it('snaps to the nearest chunk-column center (the floor seam line)', () => {
        const size = WORLD.CHUNK_SIZE;
        expect(skySeamXForPlayerX(0)).toBe(0);
        expect(skySeamXForPlayerX(size * 0.49)).toBe(0);
        expect(skySeamXForPlayerX(size * 0.51)).toBe(size);
        expect(skySeamXForPlayerX(-size * 0.51)).toBe(-size);
    });
});

describe('swapFlickerVisible', () => {
    it('hides on odd counts and shows on even counts', () => {
        expect(swapFlickerVisible(3)).toBe(false);
        expect(swapFlickerVisible(2)).toBe(true);
        expect(swapFlickerVisible(1)).toBe(false);
        expect(swapFlickerVisible(0)).toBe(true);
    });

    it('the configured countdown ends hidden, so the settle-visible frame reads as the swap landing', () => {
        // Counting SWAP_FLICKER_FRAMES..1 must both start and end hidden
        // (off/on/off), which requires an odd frame count.
        expect(ROOM_SKY.SWAP_FLICKER_FRAMES % 2).toBe(1);
        expect(swapFlickerVisible(ROOM_SKY.SWAP_FLICKER_FRAMES)).toBe(false);
        expect(swapFlickerVisible(1)).toBe(false);
    });
});

describe('celestialDiscDirection', () => {
    it('returns a unit vector', () => {
        for (const [az, el] of [[0, 0], [0.7, 0.62], [-1.2, 0.3], [3.0, 1.2]]) {
            const [x, y, z] = celestialDiscDirection(az, el);
            expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
        }
    });

    it('elevation lifts y; azimuth 0 points +z', () => {
        const [x0, y0, z0] = celestialDiscDirection(0, 0);
        expect(x0).toBeCloseTo(0, 12);
        expect(y0).toBeCloseTo(0, 12);
        expect(z0).toBeCloseTo(1, 12);
        const [, yUp] = celestialDiscDirection(0.5, Math.PI / 2);
        expect(yUp).toBeCloseTo(1, 12);
    });

    it('the configured twin discs are offset by roughly the misregister angle', () => {
        const a = celestialDiscDirection(ROOM_SKY.DISC_AZIMUTH, ROOM_SKY.DISC_ELEVATION);
        const b = celestialDiscDirection(
            ROOM_SKY.DISC_AZIMUTH + ROOM_SKY.DISC_OFFSET_AZIMUTH,
            ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION,
        );
        const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const angle = Math.acos(Math.min(1, dot));
        // Misregistered, not detached: the two plates must OVERLAP — offset
        // smaller than the disc diameter but clearly nonzero.
        expect(angle).toBeGreaterThan(0.005);
        expect(angle).toBeLessThan(2 * ROOM_SKY.DISC_ANGULAR_RADIUS);
    });
});

describe('skyPalette', () => {
    it('day uses the room\'s own RoomConfig ink/paper', () => {
        for (const room of ALL_ROOMS) {
            const { ink, paper } = skyPalette(room, true);
            expect(ink).toEqual(ROOM_CONFIGS[room].shader.inkColor);
            expect(paper).toEqual(ROOM_CONFIGS[room].shader.paperColor);
        }
    });

    it('night hard-swaps the roles (polarity-stable under the global inversion)', () => {
        for (const room of ALL_ROOMS) {
            const { ink, paper } = skyPalette(room, false);
            expect(ink).toEqual(ROOM_CONFIGS[room].shader.paperColor);
            expect(paper).toEqual(ROOM_CONFIGS[room].shader.inkColor);
        }
    });
});

describe('skyWeatherDrive (WeatherState -> dome uniforms)', () => {
    it('null (the boot frame) is exactly the CLEAR sky', () => {
        const d = skyWeatherDrive(null, newSkyWeatherDrive());
        expect(d.weatherType).toBe(WEATHER_TYPES.CLEAR);
        expect(d.intensity).toBe(0);
        expect(d.onset).toBe(0);
        expect(d.isEvent).toBe(0);
        expect(d.forewarn).toBe(0);
        expect(d.aftermath).toBe(0);
        expect(d.eclipseProgress).toBe(0);
        expect(d.fallRate).toBe(0);
        expect(d.discSeparation).toBe(1);
    });

    it('copies the lifecycle broadcast through (clamped to 0-1)', () => {
        const d = skyWeatherDrive(weatherState({
            weatherType: WEATHER_TYPES.STATIC,
            weatherIntensity: 1.7,
            weatherTime: 123.4,
            weatherOnset: 0.6,
            weatherIsEvent: 1,
            forewarn: -0.2,
            aftermath: 0.3,
            lastEndedType: WEATHER_TYPES.RAIN,
            eclipseProgress: 0.5,
        }), newSkyWeatherDrive());
        expect(d.weatherType).toBe(WEATHER_TYPES.STATIC);
        expect(d.intensity).toBe(1);
        expect(d.weatherTime).toBe(123.4);
        expect(d.onset).toBe(0.6);
        expect(d.isEvent).toBe(1);
        expect(d.forewarn).toBe(0);
        expect(d.aftermath).toBe(0.3);
        expect(d.lastEndedType).toBe(WEATHER_TYPES.RAIN);
        expect(d.eclipseProgress).toBe(0.5);
    });

    it('digital RAIN drives the INFO fall field and widens the IN_BETWEEN misregister', () => {
        const d = skyWeatherDrive(weatherState({
            weatherType: WEATHER_TYPES.RAIN,
            weatherIntensity: 0.8,
        }), newSkyWeatherDrive());
        expect(d.fallRate).toBeCloseTo(0.8, 12);
        expect(d.discSeparation).toBeCloseTo(1 + ROOM_SKY.WEATHER.DISC_DRIFT_GAIN * 0.8, 12);
    });

    it('a GLITCH widens the misregister but nothing falls', () => {
        const d = skyWeatherDrive(weatherState({
            weatherType: WEATHER_TYPES.GLITCH,
            weatherIntensity: 1,
        }), newSkyWeatherDrive());
        expect(d.fallRate).toBe(0);
        expect(d.discSeparation).toBeCloseTo(1 + ROOM_SKY.WEATHER.DISC_DRIFT_GAIN, 12);
    });

    it('a STATIC neither falls nor drifts (it breaks the ledger instead)', () => {
        const d = skyWeatherDrive(weatherState({
            weatherType: WEATHER_TYPES.STATIC,
            weatherIntensity: 1,
        }), newSkyWeatherDrive());
        expect(d.fallRate).toBe(0);
        expect(d.discSeparation).toBe(1);
    });

    it('world-space types (ASHFALL/GALE/ECLIPSE) leave the dome treatments alone', () => {
        for (const type of [WEATHER_TYPES.ASHFALL, WEATHER_TYPES.GALE, WEATHER_TYPES.ECLIPSE]) {
            const d = skyWeatherDrive(weatherState({
                weatherType: type,
                weatherIntensity: 1,
            }), newSkyWeatherDrive());
            expect(d.fallRate).toBe(0);
            expect(d.discSeparation).toBe(1);
        }
    });

    it('reuses the out target (per-frame allocation-free contract)', () => {
        const out = newSkyWeatherDrive();
        expect(skyWeatherDrive(weatherState(), out)).toBe(out);
        expect(skyWeatherDrive(null, out)).toBe(out);
    });
});

describe('ledgerBreakAmount (FA + STATIC arc)', () => {
    it('an active STATIC breaks with its live intensity (re-aligns as it decays)', () => {
        expect(ledgerBreakAmount(WEATHER_TYPES.STATIC, 0.9, WEATHER_TYPES.CLEAR, 0)).toBeCloseTo(0.9, 12);
        expect(ledgerBreakAmount(WEATHER_TYPES.STATIC, 0.2, WEATHER_TYPES.CLEAR, 0)).toBeCloseTo(0.2, 12);
    });

    it('the STATIC aftermath keeps a scaled residue of segments snapping back', () => {
        const scale = ROOM_SKY.WEATHER.LEDGER_AFTERMATH_SCALE;
        expect(ledgerBreakAmount(WEATHER_TYPES.CLEAR, 0, WEATHER_TYPES.STATIC, 1)).toBeCloseTo(scale, 12);
        expect(ledgerBreakAmount(WEATHER_TYPES.CLEAR, 0, WEATHER_TYPES.STATIC, 0.4)).toBeCloseTo(0.4 * scale, 12);
        expect(ledgerBreakAmount(WEATHER_TYPES.CLEAR, 0, WEATHER_TYPES.STATIC, 0)).toBe(0);
    });

    it('other weather (and other aftermaths) never touch the ledger', () => {
        expect(ledgerBreakAmount(WEATHER_TYPES.RAIN, 1, WEATHER_TYPES.CLEAR, 0)).toBe(0);
        expect(ledgerBreakAmount(WEATHER_TYPES.GLITCH, 1, WEATHER_TYPES.CLEAR, 0)).toBe(0);
        expect(ledgerBreakAmount(WEATHER_TYPES.CLEAR, 0, WEATHER_TYPES.RAIN, 1)).toBe(0);
        expect(ledgerBreakAmount(WEATHER_TYPES.CLEAR, 0, WEATHER_TYPES.GLITCH, 1)).toBe(0);
    });
});

describe('invertStrikeActive (POLARIZED strike-swap gating)', () => {
    // windowIdx 0 rolls fract(sin(0) * 43758.5453) = 0 < chance: a certain
    // strike window at any invertStrike > 0.
    const STRIKE = ROOM_SKY.WEATHER;

    it('gates exactly like the screen shader: real GLITCH events only', () => {
        // Not a glitch:
        expect(invertStrikeActive(0.05, WEATHER_TYPES.RAIN, 1, 1, 1)).toBe(false);
        // Transient ambient glitch (isEvent 0):
        expect(invertStrikeActive(0.05, WEATHER_TYPES.GLITCH, 1, 0, 1)).toBe(false);
        // Room without strikes (invertStrike 0):
        expect(invertStrikeActive(0.05, WEATHER_TYPES.GLITCH, 1, 1, 0)).toBe(false);
        // Intensity still ramping from zero:
        expect(invertStrikeActive(0.05, WEATHER_TYPES.GLITCH, 0, 1, 1)).toBe(false);
        // All gates open:
        expect(invertStrikeActive(0.05, WEATHER_TYPES.GLITCH, 1, 1, 1)).toBe(true);
    });

    it('a strike lasts STRIKE_SECONDS at the top of its window, then dies', () => {
        expect(invertStrikeActive(STRIKE.STRIKE_SECONDS * 0.5, WEATHER_TYPES.GLITCH, 1, 1, 1)).toBe(true);
        expect(invertStrikeActive(STRIKE.STRIKE_SECONDS + 0.01, WEATHER_TYPES.GLITCH, 1, 1, 1)).toBe(false);
        expect(invertStrikeActive(STRIKE.STRIKE_WINDOW_SECONDS * 0.5, WEATHER_TYPES.GLITCH, 1, 1, 1)).toBe(false);
    });

    it('windows roll independently: some strike, some stay calm', () => {
        let strikes = 0;
        const windows = 40;
        for (let w = 0; w < windows; w++) {
            const t = w * STRIKE.STRIKE_WINDOW_SECONDS + STRIKE.STRIKE_SECONDS * 0.5;
            if (invertStrikeActive(t, WEATHER_TYPES.GLITCH, 1, 1, 1))
                strikes++;
        }
        // chance 0.85: statistically certain to see both outcomes in 40 rolls.
        expect(strikes).toBeGreaterThan(0);
        expect(strikes).toBeLessThan(windows);
    });

    it('is deterministic and periodic on the screen shader\'s 3600s wrap', () => {
        for (const t of [0.05, 7.3, 100.01, 2999.9]) {
            const a = invertStrikeActive(t, WEATHER_TYPES.GLITCH, 1, 1, 1);
            expect(invertStrikeActive(t, WEATHER_TYPES.GLITCH, 1, 1, 1)).toBe(a);
            expect(invertStrikeActive(t + 3600, WEATHER_TYPES.GLITCH, 1, 1, 1)).toBe(a);
        }
    });
});

describe('strike cadence contract with the screen shader', () => {
    /** Extract a `const float NAME = <number>;` from a GLSL source. */
    function glslConst(source: string, name: string): number {
        const m = source.match(new RegExp(`const float ${name} = ([0-9.]+);`));
        expect(m, `${name} missing from the shader source`).not.toBeNull();
        return Number(m![1]);
    }

    it('the ROOM_SKY.WEATHER knobs mirror the DitherShader STRIKE_* consts exactly', () => {
        const screen = DitherShader.fragmentShader;
        expect(ROOM_SKY.WEATHER.STRIKE_WINDOW_SECONDS).toBe(glslConst(screen, 'STRIKE_WINDOW_SECONDS'));
        expect(ROOM_SKY.WEATHER.STRIKE_CHANCE).toBe(glslConst(screen, 'STRIKE_CHANCE'));
        expect(ROOM_SKY.WEATHER.STRIKE_SECONDS).toBe(glslConst(screen, 'STRIKE_SECONDS'));
    });

    it('sky and screen run the identical roll expression on the identical clock', () => {
        const roll = 'fract(sin(windowIdx * 127.1) * 43758.5453)';
        expect(DitherShader.fragmentShader).toContain(roll);
        expect(SKY_FRAGMENT_SHADER).toContain(roll);
        // Both wrap the same WeatherState.weatherTime input at 3600s.
        expect(DitherShader.fragmentShader).toContain('mod(weatherTime, 3600.0)');
        expect(SKY_FRAGMENT_SHADER).toContain('mod(uWeatherTime, 3600.0)');
    });
});

describe('eclipse transit arc', () => {
    it('sits exactly on the dome\'s celestial anchor at mid-transit', () => {
        expect(eclipseArcAzimuth(0.5)).toBeCloseTo(ROOM_SKY.DISC_AZIMUTH, 12);
        expect(eclipseArcElevation(0.5)).toBeCloseTo(ROOM_SKY.DISC_ELEVATION, 12);
    });

    it('sweeps the configured azimuth span monotonically', () => {
        expect(eclipseArcAzimuth(1) - eclipseArcAzimuth(0)).toBeCloseTo(ROOM_SKY.WEATHER.ECLIPSE_ARC_SPAN, 12);
        let prev = eclipseArcAzimuth(0);
        for (let p = 0.1; p <= 1.001; p += 0.1) {
            const az = eclipseArcAzimuth(p);
            expect(az).toBeGreaterThan(prev);
            prev = az;
        }
    });

    it('rises and sets: symmetric elevation, whole disc below the horizon at the ends', () => {
        for (const p of [0, 0.2, 0.35]) {
            expect(eclipseArcElevation(p)).toBeCloseTo(eclipseArcElevation(1 - p), 12);
        }
        // The full ink disc starts and ends under the horizon — no pop-in.
        expect(eclipseArcElevation(0) + ROOM_SKY.WEATHER.ECLIPSE_ANGULAR_RADIUS).toBeLessThan(0);
        expect(eclipseArcElevation(1) + ROOM_SKY.WEATHER.ECLIPSE_ANGULAR_RADIUS).toBeLessThan(0);
    });

    it('occludes both IN_BETWEEN discs at mid-transit (the documented compose rule)', () => {
        // Angle from the anchor (= eclipse center at progress 0.5) to the
        // paper plate's center, plus the plate radius, must fit inside the
        // eclipse disc radius: the shadow swallows both prints whole.
        const anchor = celestialDiscDirection(ROOM_SKY.DISC_AZIMUTH, ROOM_SKY.DISC_ELEVATION);
        const paper = celestialDiscDirection(
            ROOM_SKY.DISC_AZIMUTH + ROOM_SKY.DISC_OFFSET_AZIMUTH,
            ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION,
        );
        const dot = anchor[0] * paper[0] + anchor[1] * paper[1] + anchor[2] * paper[2];
        const offAngle = Math.acos(Math.min(1, dot));
        expect(offAngle + ROOM_SKY.DISC_ANGULAR_RADIUS)
            .toBeLessThanOrEqual(ROOM_SKY.WEATHER.ECLIPSE_ANGULAR_RADIUS);
    });
});

describe('forewarnJitter (forewarn degradation ticks)', () => {
    const SALT_A = 1657;
    const SALT_B = 1663;

    it('is exactly 0 outside a forewarn', () => {
        for (let tick = 0; tick < 20; tick++) {
            expect(forewarnJitter(tick, SALT_A, 0)).toBe(0);
        }
    });

    it('is hash-signed and bounded by half the ramp', () => {
        let sawPositive = false;
        let sawNegative = false;
        for (let tick = 0; tick < 64; tick++) {
            const j = forewarnJitter(tick, SALT_A, 1);
            expect(Math.abs(j)).toBeLessThanOrEqual(0.5);
            if (j > 0)
                sawPositive = true;
            if (j < 0)
                sawNegative = true;
        }
        expect(sawPositive).toBe(true);
        expect(sawNegative).toBe(true);
    });

    it('scales linearly with the ramp and holds per tick (deterministic)', () => {
        for (const tick of [0, 7, 31]) {
            expect(forewarnJitter(tick, SALT_A, 0.5)).toBeCloseTo(forewarnJitter(tick, SALT_A, 1) * 0.5, 12);
            expect(forewarnJitter(tick, SALT_A, 1)).toBe(forewarnJitter(tick, SALT_A, 1));
        }
    });

    it('different salts decorrelate the jitter streams', () => {
        let differs = false;
        for (let tick = 0; tick < 16; tick++) {
            if (forewarnJitter(tick, SALT_A, 1) !== forewarnJitter(tick, SALT_B, 1))
                differs = true;
        }
        expect(differs).toBe(true);
    });
});

describe('config contract (ROOM_SKY.WEATHER)', () => {
    it('keeps a jittered ledger segment inside its owner half-period', () => {
        // Max |shift| = (segment jitter + forewarn waver) / 2 (hash-signed);
        // the drawn window [shift, shift + thickness) must stay within the
        // half-period the distance-to-nearest-line form owns.
        const maxShift = (ROOM_SKY.WEATHER.LEDGER_JITTER_AMP + ROOM_SKY.WEATHER.FOREWARN_LINE_WAVER) / 2;
        expect(maxShift + ROOM_SKY.LINE_THICKNESS).toBeLessThanOrEqual(0.5);
    });

    it('keeps the densified rain field a valid fill fraction', () => {
        const peak = ROOM_SKY.SPECK_FILL * (1 + ROOM_SKY.WEATHER.RAIN_DENSIFY_GAIN);
        expect(peak).toBeGreaterThan(ROOM_SKY.SPECK_FILL);
        expect(peak).toBeLessThan(1);
    });

    it('keeps the fully drifted paper disc on the dome (below the zenith)', () => {
        const maxSep = 1 + ROOM_SKY.WEATHER.DISC_DRIFT_GAIN;
        expect(ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION * maxSep)
            .toBeLessThan(Math.PI / 2);
    });

    it('keeps the forewarn degradations subtle (partial dropouts, bounded ramps)', () => {
        expect(ROOM_SKY.WEATHER.FOREWARN_SPECK_DROP).toBeGreaterThan(0);
        expect(ROOM_SKY.WEATHER.FOREWARN_SPECK_DROP).toBeLessThan(1);
        expect(ROOM_SKY.WEATHER.FOREWARN_DISC_TREMOR).toBeGreaterThan(0);
        expect(ROOM_SKY.WEATHER.FOREWARN_DISC_TREMOR).toBeLessThan(ROOM_SKY.DISC_ANGULAR_RADIUS);
        expect(ROOM_SKY.WEATHER.FOREWARN_SEAM_JITTER).toBeGreaterThan(0);
        expect(ROOM_SKY.WEATHER.FOREWARN_SEAM_JITTER).toBeLessThan(WORLD.CHUNK_SIZE / 2);
    });
});

describe('config contract (ROOM_SKY)', () => {
    it('keeps the dome inside the camera far plane even at the rift bottom', () => {
        // Camera far is 1000 (SceneSetup); the deepest camera position is the
        // rift fall (FA_RIFT.FOG.BOTTOM), and the dome follows x/z only.
        expect(ROOM_SKY.RADIUS + Math.abs(FA_RIFT.FOG.BOTTOM)).toBeLessThan(1000);
    });

    it('keeps the dome beyond the fog horizon and the loaded-world footprint', () => {
        expect(ROOM_SKY.RADIUS).toBeGreaterThan(PERFORMANCE.FOG_FAR);
        // Loaded world reaches (RENDER_DISTANCE + 1) chunks in any direction.
        expect(ROOM_SKY.RADIUS).toBeGreaterThan((WORLD.RENDER_DISTANCE + 1) * WORLD.CHUNK_SIZE);
    });

    it('keeps the speck field sparse and the marks hard-drawable', () => {
        expect(ROOM_SKY.SPECK_FILL).toBeGreaterThan(0);
        expect(ROOM_SKY.SPECK_FILL).toBeLessThan(0.5);
        expect(ROOM_SKY.SPECK_SIZE).toBeGreaterThan(0);
        expect(ROOM_SKY.SPECK_SIZE).toBeLessThanOrEqual(1);
        expect(ROOM_SKY.LINE_THICKNESS).toBeGreaterThan(0);
        expect(ROOM_SKY.LINE_THICKNESS).toBeLessThan(0.5);
        expect(ROOM_SKY.DISC_ANGULAR_RADIUS).toBeGreaterThan(0);
        expect(ROOM_SKY.DISC_ANGULAR_RADIUS).toBeLessThan(Math.PI / 4);
    });
});
