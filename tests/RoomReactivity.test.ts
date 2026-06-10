import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import {
    DEFAULT_WEATHER_WEIGHTS,
    faSideNoiseDensity,
    FORCED_ALIGNMENT_SIDE_NOISE,
    INFO_OVERFLOW_JITTER,
    INFO_OVERFLOW_NOISE_MAP,
    infoOverflowJitterForIntensity,
    lerpRoomShaderConfig,
    noiseDensityForIntensity,
    ROOM_CONFIGS,
    ROOM_WEATHER_WEIGHTS,
    RoomType,
} from '../src/world/RoomConfig';

/**
 * Flow-audit 2b — world reactivity pure logic:
 * - INFO_OVERFLOW negative feedback (break #8): noise map activation, jitter
 *   ramp, reversed flower->threshold gain.
 * - FORCED_ALIGNMENT side asymmetry (break #7): signed-distance noise density.
 * - Room-weighted weather table (medium #3).
 */
describe('noiseDensityForIntensity (INFO_OVERFLOW flower -> dither density)', () => {
    const BPS = Object.keys(INFO_OVERFLOW_NOISE_MAP).map(Number).sort((a, b) => a - b);

    it('returns the exact mapped value at every breakpoint', () => {
        for (const bp of BPS) {
            expect(noiseDensityForIntensity(bp)).toBeCloseTo(INFO_OVERFLOW_NOISE_MAP[bp], 9);
        }
    });

    it('clamps below the lowest and above the highest breakpoint', () => {
        const lowest = BPS[0];
        const highest = BPS[BPS.length - 1];
        expect(noiseDensityForIntensity(0)).toBe(INFO_OVERFLOW_NOISE_MAP[lowest]);
        expect(noiseDensityForIntensity(-1)).toBe(INFO_OVERFLOW_NOISE_MAP[lowest]);
        expect(noiseDensityForIntensity(2)).toBe(INFO_OVERFLOW_NOISE_MAP[highest]);
    });

    it('interpolates linearly between breakpoints', () => {
        // Midway between 0.1 (0.75) and 0.3 (0.82) -> 0.785.
        expect(noiseDensityForIntensity(0.2)).toBeCloseTo(0.785, 9);
        // Midway between 0.7 (0.95) and 1.0 (1.0) -> 0.975.
        expect(noiseDensityForIntensity(0.85)).toBeCloseTo(0.975, 9);
    });

    it('is monotonically non-decreasing (brighter flower never calms the room)', () => {
        let prev = noiseDensityForIntensity(0);
        for (let i = 0; i <= 1.0001; i += 0.01) {
            const cur = noiseDensityForIntensity(i);
            expect(cur).toBeGreaterThanOrEqual(prev);
            prev = cur;
        }
    });
});

describe('infoOverflowJitterForIntensity (INFO_OVERFLOW flower -> temporal jitter)', () => {
    it('spans base -> base+gain across the intensity range (0.3 -> 0.9)', () => {
        expect(infoOverflowJitterForIntensity(0)).toBeCloseTo(INFO_OVERFLOW_JITTER.base, 9);
        expect(infoOverflowJitterForIntensity(1)).toBeCloseTo(
            INFO_OVERFLOW_JITTER.base + INFO_OVERFLOW_JITTER.flowerGain,
            9,
        );
        expect(infoOverflowJitterForIntensity(0.5)).toBeCloseTo(
            INFO_OVERFLOW_JITTER.base + 0.5 * INFO_OVERFLOW_JITTER.flowerGain,
            9,
        );
    });

    it('finally reaches the documented 0.9 ceiling at full intensity', () => {
        expect(infoOverflowJitterForIntensity(1)).toBeCloseTo(0.9, 9);
    });

    it('clamps out-of-range intensities', () => {
        expect(infoOverflowJitterForIntensity(-5)).toBeCloseTo(INFO_OVERFLOW_JITTER.base, 9);
        expect(infoOverflowJitterForIntensity(5)).toBeCloseTo(
            INFO_OVERFLOW_JITTER.base + INFO_OVERFLOW_JITTER.flowerGain,
            9,
        );
    });
});

describe('faSideNoiseDensity (FORCED_ALIGNMENT signed side -> noise density)', () => {
    const SIZE = WORLD.CHUNK_SIZE;
    const HALF = FORCED_ALIGNMENT_SIDE_NOISE.halfRange;

    it('returns the room baseline (0.55) exactly on the crack center', () => {
        // Chunk centers sit at k * CHUNK_SIZE under the round convention.
        for (const k of [-3, 0, 2, 17]) {
            expect(faSideNoiseDensity(k * SIZE)).toBeCloseTo(
                ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.uNoiseDensity,
                9,
            );
        }
    });

    it('reaches the tidy LEFT value at the far-left footprint edge', () => {
        expect(faSideNoiseDensity(-HALF)).toBeCloseTo(FORCED_ALIGNMENT_SIDE_NOISE.left, 9);
        expect(faSideNoiseDensity(2 * SIZE - HALF)).toBeCloseTo(FORCED_ALIGNMENT_SIDE_NOISE.left, 9);
    });

    it('approaches the broken RIGHT value toward the far-right footprint edge', () => {
        expect(faSideNoiseDensity(HALF - 0.001)).toBeCloseTo(FORCED_ALIGNMENT_SIDE_NOISE.right, 4);
        expect(faSideNoiseDensity(2 * SIZE + HALF - 0.001)).toBeCloseTo(FORCED_ALIGNMENT_SIDE_NOISE.right, 4);
    });

    it('interpolates linearly with the signed offset inside the footprint', () => {
        // Offset +HALF/2 -> t = 0.75 -> 0.4 + 0.75 * 0.3 = 0.625.
        expect(faSideNoiseDensity(HALF / 2)).toBeCloseTo(0.625, 9);
        // Offset -HALF/2 -> t = 0.25 -> 0.475.
        expect(faSideNoiseDensity(-HALF / 2)).toBeCloseTo(0.475, 9);
    });

    it('is monotonically non-decreasing left-to-right within one footprint', () => {
        let prev = faSideNoiseDensity(-HALF);
        for (let x = -HALF; x < HALF; x += 1) {
            const cur = faSideNoiseDensity(x);
            expect(cur).toBeGreaterThanOrEqual(prev);
            prev = cur;
        }
    });
});

describe('uFlowerThresholdGain (per-room flower -> dither threshold direction)', () => {
    it('is defined for all four rooms', () => {
        for (const room of Object.values(RoomType)) {
            expect(typeof ROOM_CONFIGS[room].shader.uFlowerThresholdGain).toBe('number');
        }
    });

    it('is REVERSED (negative) only in INFO_OVERFLOW — brightness dirties the frame', () => {
        expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.uFlowerThresholdGain).toBeLessThan(0);
        expect(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.uFlowerThresholdGain).toBeGreaterThan(0);
        expect(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.uFlowerThresholdGain).toBeGreaterThan(0);
        expect(ROOM_CONFIGS[RoomType.POLARIZED].shader.uFlowerThresholdGain).toBeGreaterThan(0);
    });

    it('keeps the historical 0.1 magnitude in every room', () => {
        for (const room of Object.values(RoomType)) {
            expect(Math.abs(ROOM_CONFIGS[room].shader.uFlowerThresholdGain)).toBeCloseTo(0.1, 9);
        }
    });

    it('interpolates through lerpRoomShaderConfig like every other scalar', () => {
        const from = ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader; // -0.1
        const to = ROOM_CONFIGS[RoomType.POLARIZED].shader; // +0.1
        expect(lerpRoomShaderConfig(from, to, 0).uFlowerThresholdGain).toBeCloseTo(-0.1, 9);
        expect(lerpRoomShaderConfig(from, to, 0.5).uFlowerThresholdGain).toBeCloseTo(0, 9);
        expect(lerpRoomShaderConfig(from, to, 1).uFlowerThresholdGain).toBeCloseTo(0.1, 9);
    });
});

describe('rOOM_WEATHER_WEIGHTS (room-weighted weather selection table)', () => {
    it('defines non-negative weights for all four rooms', () => {
        for (const room of Object.values(RoomType)) {
            const w = ROOM_WEATHER_WEIGHTS[room];
            expect(w.static).toBeGreaterThanOrEqual(0);
            expect(w.rain).toBeGreaterThanOrEqual(0);
            expect(w.glitch).toBeGreaterThanOrEqual(0);
        }
    });

    it('always leaves at least one selectable type per room', () => {
        for (const room of Object.values(RoomType)) {
            const w = ROOM_WEATHER_WEIGHTS[room];
            expect(w.static + w.rain + w.glitch).toBeGreaterThan(0);
        }
    });

    it('blocks STATIC and RAIN in POLARIZED, keeping only GLITCH', () => {
        const w = ROOM_WEATHER_WEIGHTS[RoomType.POLARIZED];
        expect(w.static).toBe(0);
        expect(w.rain).toBe(0);
        expect(w.glitch).toBeGreaterThan(0);
    });

    it('heavily favors RAIN in INFO_OVERFLOW', () => {
        const w = ROOM_WEATHER_WEIGHTS[RoomType.INFO_OVERFLOW];
        expect(w.rain).toBeGreaterThan(w.static);
        expect(w.rain).toBeGreaterThan(w.glitch);
    });

    it('keeps the default weights at equal thirds (historical rotation odds)', () => {
        expect(DEFAULT_WEATHER_WEIGHTS.static).toBe(DEFAULT_WEATHER_WEIGHTS.rain);
        expect(DEFAULT_WEATHER_WEIGHTS.rain).toBe(DEFAULT_WEATHER_WEIGHTS.glitch);
    });
});
