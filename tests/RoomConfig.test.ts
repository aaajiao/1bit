import { describe, expect, it } from 'vitest';
import { PERFORMANCE, WORLD } from '../src/config';
import {
    DEFAULT_ROOM_FOG,
    getRoomTypeFromPosition,
    IN_BETWEEN_EDGE_GHOSTS,
    inBetweenEdgeFactor,
    lerpRoomShaderConfig,
    ROOM_CONFIGS,
    ROOM_FOG,
    RoomType,
    stepFogToward,
} from '../src/world/RoomConfig';

describe('roomConfig', () => {
    describe('getRoomTypeFromPosition', () => {
        it('should map the same position to the same RoomType deterministically', () => {
            const a = getRoomTypeFromPosition(3, 7);
            const b = getRoomTypeFromPosition(3, 7);
            const c = getRoomTypeFromPosition(3, 7);
            expect(a).toBe(b);
            expect(b).toBe(c);
        });

        it('should always return a valid RoomType', () => {
            const valid = new Set(Object.values(RoomType));
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    expect(valid.has(getRoomTypeFromPosition(cx, cz))).toBe(true);
                }
            }
        });

        it('should produce all four RoomType buckets across positions', () => {
            const seen = new Set<RoomType>();
            for (let cx = -30; cx <= 30; cx++) {
                for (let cz = -30; cz <= 30; cz++) {
                    seen.add(getRoomTypeFromPosition(cx, cz));
                    if (seen.size === 4)
                        break;
                }
            }
            expect(seen.size).toBe(4);
            expect(seen.has(RoomType.INFO_OVERFLOW)).toBe(true);
            expect(seen.has(RoomType.FORCED_ALIGNMENT)).toBe(true);
            expect(seen.has(RoomType.IN_BETWEEN)).toBe(true);
            expect(seen.has(RoomType.POLARIZED)).toBe(true);
        });

        it('should map the hash buckets to the documented thresholds', () => {
            // Re-derive the same hash the implementation uses and assert the
            // bucket boundaries (<0.25, <0.5, <0.75, else) hold for every cell.
            for (let cx = -15; cx <= 15; cx++) {
                for (let cz = -15; cz <= 15; cz++) {
                    const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;
                    const expected
                        = hash < 0.25
                            ? RoomType.INFO_OVERFLOW
                            : hash < 0.50
                                ? RoomType.FORCED_ALIGNMENT
                                : hash < 0.75
                                    ? RoomType.IN_BETWEEN
                                    : RoomType.POLARIZED;
                    expect(getRoomTypeFromPosition(cx, cz)).toBe(expected);
                }
            }
        });
    });

    describe('lerpRoomShaderConfig', () => {
        const from = ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader;
        const to = ROOM_CONFIGS[RoomType.POLARIZED].shader;

        // Endpoint equality must tolerate the float error a linear lerp
        // (a + (b - a) * t) reintroduces at t=1 (e.g. 0.0549 -> 0.0549000000…4).
        // Every numeric uniform and every color component is still pinned to
        // the expected config — this is exact-in-intent, just not bit-exact.
        const expectShaderConfigClose = (
            actual: typeof from,
            expected: typeof from,
        ): void => {
            expect(actual.uNoiseDensity).toBeCloseTo(expected.uNoiseDensity, 9);
            expect(actual.uThresholdBias).toBeCloseTo(expected.uThresholdBias, 9);
            expect(actual.uTemporalJitter).toBeCloseTo(expected.uTemporalJitter, 9);
            expect(actual.uContrast).toBeCloseTo(expected.uContrast, 9);
            expect(actual.uGlitchAmount).toBeCloseTo(expected.uGlitchAmount, 9);
            expect(actual.uGlitchSpeed).toBeCloseTo(expected.uGlitchSpeed, 9);
            for (let i = 0; i < 3; i++) {
                expect(actual.inkColor[i]).toBeCloseTo(expected.inkColor[i], 9);
                expect(actual.paperColor[i]).toBeCloseTo(expected.paperColor[i], 9);
            }
        };

        it('should return the from-config at t=0', () => {
            const result = lerpRoomShaderConfig(from, to, 0);
            expect(result).toEqual(from);
        });

        it('should return the to-config at t=1', () => {
            const result = lerpRoomShaderConfig(from, to, 1);
            expectShaderConfigClose(result, to);
        });

        it('should interpolate the midpoint at t=0.5', () => {
            const result = lerpRoomShaderConfig(from, to, 0.5);
            expect(result.uNoiseDensity).toBeCloseTo((from.uNoiseDensity + to.uNoiseDensity) / 2, 6);
            expect(result.uThresholdBias).toBeCloseTo((from.uThresholdBias + to.uThresholdBias) / 2, 6);
            expect(result.uTemporalJitter).toBeCloseTo((from.uTemporalJitter + to.uTemporalJitter) / 2, 6);
            expect(result.uContrast).toBeCloseTo((from.uContrast + to.uContrast) / 2, 6);
            expect(result.uGlitchAmount).toBeCloseTo((from.uGlitchAmount + to.uGlitchAmount) / 2, 6);
            expect(result.uGlitchSpeed).toBeCloseTo((from.uGlitchSpeed + to.uGlitchSpeed) / 2, 6);
        });

        it('should clamp t<0 to the from-config (no extrapolation undershoot)', () => {
            const result = lerpRoomShaderConfig(from, to, -1);
            expect(result).toEqual(from);
        });

        it('should clamp t>1 to the to-config (no extrapolation overshoot)', () => {
            const result = lerpRoomShaderConfig(from, to, 5);
            expectShaderConfigClose(result, to);
        });

        it('should not mutate the input configs', () => {
            const fromCopy = { ...from };
            const toCopy = { ...to };
            lerpRoomShaderConfig(from, to, 0.5);
            expect(from).toEqual(fromCopy);
            expect(to).toEqual(toCopy);
        });
    });

    // Flow-audit enhancement #12 — INFO_OVERFLOW's noise horizon.
    describe('rOOM_FOG', () => {
        it('covers every room with a valid near < far range', () => {
            for (const room of Object.values(RoomType)) {
                const fog = ROOM_FOG[room];
                expect(fog).toBeDefined();
                expect(fog.near).toBeGreaterThan(0);
                expect(fog.near).toBeLessThan(fog.far);
            }
        });

        it('iNFO_OVERFLOW closes the horizon in; every other room keeps the default', () => {
            const info = ROOM_FOG[RoomType.INFO_OVERFLOW];
            expect(info.near).toBeLessThan(DEFAULT_ROOM_FOG.near);
            expect(info.far).toBeLessThan(DEFAULT_ROOM_FOG.far);
            for (const room of [RoomType.FORCED_ALIGNMENT, RoomType.IN_BETWEEN, RoomType.POLARIZED]) {
                expect(ROOM_FOG[room]).toEqual(DEFAULT_ROOM_FOG);
            }
        });

        it('default fog matches the PERFORMANCE boot values (SceneSetup)', () => {
            expect(DEFAULT_ROOM_FOG.near).toBe(PERFORMANCE.FOG_NEAR);
            expect(DEFAULT_ROOM_FOG.far).toBe(PERFORMANCE.FOG_FAR);
        });
    });

    describe('stepFogToward', () => {
        it('moves both near and far toward the target', () => {
            const fog = { near: 20, far: 110 };
            stepFogToward(fog, ROOM_FOG[RoomType.INFO_OVERFLOW], 0.5);
            expect(fog.near).toBeLessThan(20);
            expect(fog.near).toBeGreaterThan(8);
            expect(fog.far).toBeLessThan(110);
            expect(fog.far).toBeGreaterThan(45);
        });

        it('converges to the target after enough time', () => {
            const fog = { near: 20, far: 110 };
            for (let i = 0; i < 600; i++)
                stepFogToward(fog, { near: 8, far: 45 }, 1 / 60);
            expect(fog.near).toBeCloseTo(8, 3);
            expect(fog.far).toBeCloseTo(45, 3);
        });

        it('is frame-rate independent (two half steps equal one full step)', () => {
            const target = { near: 8, far: 45 };
            const one = { near: 20, far: 110 };
            stepFogToward(one, target, 1.0);
            const two = { near: 20, far: 110 };
            stepFogToward(two, target, 0.5);
            stepFogToward(two, target, 0.5);
            expect(two.near).toBeCloseTo(one.near, 9);
            expect(two.far).toBeCloseTo(one.far, 9);
        });

        it('does not move at delta 0 and never moves when already at the target', () => {
            const fog = { near: 8, far: 45 };
            stepFogToward(fog, { near: 8, far: 45 }, 1.0);
            expect(fog.near).toBeCloseTo(8, 9);
            expect(fog.far).toBeCloseTo(45, 9);

            const frozen = { near: 20, far: 110 };
            stepFogToward(frozen, { near: 8, far: 45 }, 0);
            expect(frozen.near).toBeCloseTo(20, 9);
            expect(frozen.far).toBeCloseTo(110, 9);
        });
    });

    // Flow-audit enhancement #14 — boundary-bound z-fight densification.
    describe('inBetweenEdgeFactor', () => {
        const HALF = WORLD.CHUNK_SIZE / 2; // 40

        it('returns 0 deep in the chunk interior (original ghost behavior)', () => {
            expect(inBetweenEdgeFactor(0, 0)).toBe(0);
            expect(inBetweenEdgeFactor(10, -10)).toBe(0);
        });

        it('saturates to 1 within INNER_DISTANCE of the footprint edge', () => {
            const atInner = HALF - IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE;
            expect(inBetweenEdgeFactor(atInner, 0)).toBe(1);
            expect(inBetweenEdgeFactor(0, -(atInner + 1))).toBe(1);
        });

        it('ramps monotonically between OUTER_DISTANCE and INNER_DISTANCE', () => {
            const { INNER_DISTANCE, OUTER_DISTANCE } = IN_BETWEEN_EDGE_GHOSTS;
            let prev = -1;
            for (let dist = OUTER_DISTANCE; dist >= INNER_DISTANCE; dist -= 1) {
                const f = inBetweenEdgeFactor(HALF - dist, 0);
                expect(f).toBeGreaterThanOrEqual(prev);
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThanOrEqual(1);
                prev = f;
            }
            expect(prev).toBe(1);
        });

        it('uses the Chebyshev metric (either axis near the edge densifies)', () => {
            const nearEdge = HALF - IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE;
            expect(inBetweenEdgeFactor(nearEdge, 0)).toBe(inBetweenEdgeFactor(0, nearEdge));
        });

        it('the band is reachable by actual building placements (|local| <= 30)', () => {
            // Building positions are bounded to ±(CHUNK_SIZE-20)/2 = ±30; the
            // saturation point must lie inside that bound or the band is dead.
            const layoutHalf = (WORLD.CHUNK_SIZE - 20) / 2;
            const saturationPos = HALF - IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE;
            expect(saturationPos).toBeLessThanOrEqual(layoutHalf);
            // And the interior must still contain a zero-factor region.
            expect(inBetweenEdgeFactor(0, 0)).toBe(0);
        });
    });
});
