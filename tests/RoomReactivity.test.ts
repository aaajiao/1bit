import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import {
    clusterCenterWorld,
    DEFAULT_WEATHER_WEIGHTS,
    faSideAxisX,
    faSideNoiseDensity,
    FORCED_ALIGNMENT_SIDE_NOISE,
    INFO_OVERFLOW_JITTER,
    INFO_OVERFLOW_NOISE_MAP,
    infoOverflowJitterForIntensity,
    lerpRoomShaderConfig,
    noiseDensityForIntensity,
    reactiveRoomShaderConfig,
    riftLineXForWorldX,
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
    const HALF = FORCED_ALIGNMENT_SIDE_NOISE.halfRange;
    const BLEND = FORCED_ALIGNMENT_SIDE_NOISE.seamBlendRange;
    const { left, right } = FORCED_ALIGNMENT_SIDE_NOISE;
    const MID = (left + right) / 2;
    // The side SEMANTIC pivots on the CLUSTER center line (faSideAxisX) — the
    // room's choice axis, NOT the physical cracks, which sit at axis ± 40
    // (riftLineXForWorldX, one per chunk column). CRACK/CRACK2 here are the
    // AXES of cluster 0 and a far-away cluster.
    const CRACK = clusterCenterWorld(0);
    const CRACK2 = clusterCenterWorld(2);
    // Side value at the inner edge of the seam-blend zone (|offset| = HALF-BLEND):
    // the most tidy/broken reading the smoothed field actually reaches.
    const EDGE_DELTA = (BLEND / (2 * HALF)) * (right - left);

    it('saturates the side blend at the cluster half-width (rooms are 160m places)', () => {
        expect(HALF).toBe((WORLD.CHUNK_SIZE * WORLD.CLUSTER_CHUNKS) / 2);
    });

    it('returns the room baseline (0.55) exactly on the side axis', () => {
        // Side axes sit on cluster centers (clusterCenterWorld = faSideAxisX).
        for (const k of [-3, 0, 2, 17]) {
            expect(faSideAxisX(clusterCenterWorld(k))).toBe(clusterCenterWorld(k));
            expect(faSideNoiseDensity(clusterCenterWorld(k))).toBeCloseTo(
                ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.uNoiseDensity,
                9,
            );
        }
    });

    it('keeps the side semantic on the CLUSTER axis: both banks of the LEFT crack read "left"', () => {
        // Acceptance for the physical/semantic split: the left physical crack
        // sits at axis - 40 (riftLineXForWorldX); stepping across it must NOT
        // flip the side reading — both sides stay in the tidy-left value
        // range (below the 0.55 axis baseline), and the field still grows
        // monotonically toward the axis.
        const leftCrack = CRACK - 40;
        expect(riftLineXForWorldX(leftCrack)).toBe(leftCrack); // it IS a crack line
        const west = faSideNoiseDensity(leftCrack - 5);
        const east = faSideNoiseDensity(leftCrack + 5);
        expect(west).toBeLessThan(MID);
        expect(east).toBeLessThan(MID);
        expect(west).toBeLessThan(east); // deeper west = tidier
        // Mirror image across the RIGHT crack: both banks read "right".
        const rightCrack = CRACK + 40;
        expect(faSideNoiseDensity(rightCrack - 5)).toBeGreaterThan(MID);
        expect(faSideNoiseDensity(rightCrack + 5)).toBeGreaterThan(MID);
    });

    it('is most tidy LEFT / broken RIGHT at the seam-blend inner edges', () => {
        expect(faSideNoiseDensity(CRACK - (HALF - BLEND))).toBeCloseTo(left + EDGE_DELTA, 9);
        expect(faSideNoiseDensity(CRACK + (HALF - BLEND))).toBeCloseTo(right - EDGE_DELTA, 9);
        // Same shape inside a far-away cluster footprint.
        expect(faSideNoiseDensity(CRACK2 - (HALF - BLEND))).toBeCloseTo(left + EDGE_DELTA, 9);
        expect(faSideNoiseDensity(CRACK2 + (HALF - BLEND))).toBeCloseTo(right - EDGE_DELTA, 9);
    });

    it('eases back to the mid baseline at the cluster footprint edges (seam smoothing)', () => {
        expect(faSideNoiseDensity(CRACK - HALF)).toBeCloseTo(MID, 9);
        expect(faSideNoiseDensity(CRACK + HALF - 1e-6)).toBeCloseTo(MID, 5);
        expect(faSideNoiseDensity(CRACK2 - HALF)).toBeCloseTo(MID, 9);
    });

    it('is continuous across an FA-FA cluster seam (no right -> left jump)', () => {
        // Without seam smoothing this seam jumped 0.7 -> 0.4 in a single step.
        const seamX = CRACK + HALF; // boundary between cluster 0 and cluster 1 footprints
        const eps = 0.01;
        const before = faSideNoiseDensity(seamX - eps);
        const after = faSideNoiseDensity(seamX + eps);
        expect(Math.abs(before - after)).toBeLessThan(0.01);
        expect(before).toBeCloseTo(MID, 2);
        expect(after).toBeCloseTo(MID, 2);
    });

    it('interpolates linearly with the signed offset inside the footprint', () => {
        // Offset +HALF/2 -> t = 0.75 -> 0.4 + 0.75 * 0.3 = 0.625.
        expect(faSideNoiseDensity(CRACK + HALF / 2)).toBeCloseTo(0.625, 9);
        // Offset -HALF/2 -> t = 0.25 -> 0.475.
        expect(faSideNoiseDensity(CRACK - HALF / 2)).toBeCloseTo(0.475, 9);
    });

    it('has ONE side axis per cluster: monotonic left-to-right across the whole 160m footprint', () => {
        // The field pivots on the single cluster axis, so it sweeps
        // monotonically between the seam-blend zones — unaffected by the TWO
        // physical cracks (axis ± 40) it crosses on the way.
        let prev = faSideNoiseDensity(CRACK - (HALF - BLEND));
        for (let x = -(HALF - BLEND); x <= HALF - BLEND; x += 1) {
            const cur = faSideNoiseDensity(CRACK + x);
            expect(cur).toBeGreaterThanOrEqual(prev);
            prev = cur;
        }
    });

    it('keeps the seam-blend zone a small fraction of the footprint (side reading intact)', () => {
        expect(BLEND).toBeGreaterThan(0);
        expect(BLEND).toBeLessThanOrEqual(HALF / 4);
    });
});

describe('reactiveRoomShaderConfig (live per-room target for the transition blend)', () => {
    it('replaces INFO_OVERFLOW noise/jitter with the flower-reactive values', () => {
        const out = reactiveRoomShaderConfig(RoomType.INFO_OVERFLOW, 0.7, 0);
        expect(out.uNoiseDensity).toBeCloseTo(noiseDensityForIntensity(0.7), 9);
        expect(out.uTemporalJitter).toBeCloseTo(infoOverflowJitterForIntensity(0.7), 9);
        // Everything else stays on the room baseline.
        expect(out.uContrast).toBe(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.uContrast);
        expect(out.uFlowerThresholdGain).toBe(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.uFlowerThresholdGain);
    });

    it('replaces FORCED_ALIGNMENT noise with the side-asymmetric value', () => {
        const out = reactiveRoomShaderConfig(RoomType.FORCED_ALIGNMENT, 0.5, 20);
        expect(out.uNoiseDensity).toBeCloseTo(faSideNoiseDensity(20), 9);
        expect(out.uTemporalJitter).toBe(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.uTemporalJitter);
    });

    it('returns the static baseline for rooms without reactive parameters', () => {
        expect(reactiveRoomShaderConfig(RoomType.IN_BETWEEN, 1, 99)).toEqual(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader);
        expect(reactiveRoomShaderConfig(RoomType.POLARIZED, 1, 99)).toEqual(ROOM_CONFIGS[RoomType.POLARIZED].shader);
    });

    it('does not mutate the shared static configs', () => {
        const before = JSON.stringify(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader);
        reactiveRoomShaderConfig(RoomType.INFO_OVERFLOW, 1, 0);
        reactiveRoomShaderConfig(RoomType.FORCED_ALIGNMENT, 1, 33);
        expect(JSON.stringify(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader)).toBe(before);
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
