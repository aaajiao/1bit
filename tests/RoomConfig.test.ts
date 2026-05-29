import { describe, expect, it } from 'vitest';
import {
    getRoomTypeFromPosition,
    lerpRoomShaderConfig,
    ROOM_CONFIGS,
    RoomType,
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
});
