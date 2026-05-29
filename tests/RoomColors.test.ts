import { describe, expect, it } from 'vitest';
import {
    lerpRoomShaderConfig,
    ROOM_CONFIGS,
    RoomType,
} from '../src/world/RoomConfig';

/**
 * Per-room 1-bit duotone palette tests.
 *
 * Each room defines an `inkColor` (the dark "0") and `paperColor` (the light
 * "1") as an RGB triple in 0-1. The dither scalar is mapped to these via
 * mix(inkColor, paperColor, value) at the end of the fragment shader, so the
 * lerp between rooms must interpolate both colors component-wise.
 */
describe('room duotone colors', () => {
    const ALL_ROOMS = Object.values(RoomType);

    describe('palette definition', () => {
        it('should define inkColor and paperColor for all four rooms', () => {
            expect(ALL_ROOMS).toHaveLength(4);
            for (const room of ALL_ROOMS) {
                const { shader } = ROOM_CONFIGS[room];
                expect(Array.isArray(shader.inkColor), `${room} inkColor is a tuple`).toBe(true);
                expect(Array.isArray(shader.paperColor), `${room} paperColor is a tuple`).toBe(true);
                expect(shader.inkColor).toHaveLength(3);
                expect(shader.paperColor).toHaveLength(3);
            }
        });

        it('should keep every color component within the normalized [0, 1] range', () => {
            for (const room of ALL_ROOMS) {
                const { shader } = ROOM_CONFIGS[room];
                for (const c of [...shader.inkColor, ...shader.paperColor]) {
                    expect(c).toBeGreaterThanOrEqual(0);
                    expect(c).toBeLessThanOrEqual(1);
                }
            }
        });

        it('should keep ink darker than paper in every room (duotone contrast)', () => {
            // Perceptual-ish luminance (Rec. 601 weights). Ink must read dark and
            // paper light so the result still reads as a 1-bit image with a cast.
            const lum = ([r, g, b]: readonly number[]) => 0.299 * r + 0.587 * g + 0.114 * b;
            for (const room of ALL_ROOMS) {
                const { shader } = ROOM_CONFIGS[room];
                const inkL = lum(shader.inkColor);
                const paperL = lum(shader.paperColor);
                expect(paperL, `${room} paper should be lighter than ink`).toBeGreaterThan(inkL);
                // And the contrast should be substantial, not a subtle gradient.
                expect(paperL - inkL).toBeGreaterThan(0.5);
            }
        });

        it('should give each room a distinct palette (not all identical)', () => {
            const inkKeys = new Set(
                ALL_ROOMS.map(r => ROOM_CONFIGS[r].shader.inkColor.join(',')),
            );
            const paperKeys = new Set(
                ALL_ROOMS.map(r => ROOM_CONFIGS[r].shader.paperColor.join(',')),
            );
            expect(inkKeys.size).toBe(4);
            expect(paperKeys.size).toBe(4);
        });
    });

    describe('lerpRoomShaderConfig color interpolation', () => {
        const from = ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader;
        const to = ROOM_CONFIGS[RoomType.POLARIZED].shader;

        it('should return the from-room colors at t=0', () => {
            const result = lerpRoomShaderConfig(from, to, 0);
            expect(result.inkColor).toEqual(from.inkColor);
            expect(result.paperColor).toEqual(from.paperColor);
        });

        it('should return the to-room colors at t=1', () => {
            // A linear lerp (a + (b - a) * t) reintroduces float error at t=1,
            // so compare component-wise within tolerance (still pinned exactly).
            const result = lerpRoomShaderConfig(from, to, 1);
            for (let i = 0; i < 3; i++) {
                expect(result.inkColor[i]).toBeCloseTo(to.inkColor[i], 9);
                expect(result.paperColor[i]).toBeCloseTo(to.paperColor[i], 9);
            }
        });

        it('should interpolate each color component to the midpoint at t=0.5', () => {
            const result = lerpRoomShaderConfig(from, to, 0.5);
            for (let i = 0; i < 3; i++) {
                expect(result.inkColor[i]).toBeCloseTo((from.inkColor[i] + to.inkColor[i]) / 2, 6);
                expect(result.paperColor[i]).toBeCloseTo((from.paperColor[i] + to.paperColor[i]) / 2, 6);
            }
        });

        it('should interpolate linearly at an arbitrary t', () => {
            const t = 0.3;
            const result = lerpRoomShaderConfig(from, to, t);
            for (let i = 0; i < 3; i++) {
                expect(result.inkColor[i]).toBeCloseTo(
                    from.inkColor[i] + (to.inkColor[i] - from.inkColor[i]) * t,
                    6,
                );
                expect(result.paperColor[i]).toBeCloseTo(
                    from.paperColor[i] + (to.paperColor[i] - from.paperColor[i]) * t,
                    6,
                );
            }
        });

        it('should clamp t<0 to the from-room colors', () => {
            const result = lerpRoomShaderConfig(from, to, -2);
            expect(result.inkColor).toEqual(from.inkColor);
            expect(result.paperColor).toEqual(from.paperColor);
        });

        it('should clamp t>1 to the to-room colors', () => {
            const result = lerpRoomShaderConfig(from, to, 3);
            for (let i = 0; i < 3; i++) {
                expect(result.inkColor[i]).toBeCloseTo(to.inkColor[i], 9);
                expect(result.paperColor[i]).toBeCloseTo(to.paperColor[i], 9);
            }
        });

        it('should return fresh color tuples that do not alias the inputs', () => {
            const result = lerpRoomShaderConfig(from, to, 0);
            // Equal in value...
            expect(result.inkColor).toEqual(from.inkColor);
            // ...but a distinct array instance, so callers mutating the result
            // (e.g. shallow-spread shader config) can't corrupt ROOM_CONFIGS.
            expect(result.inkColor).not.toBe(from.inkColor);
            expect(result.paperColor).not.toBe(from.paperColor);
        });

        it('should not mutate the source room palettes', () => {
            const fromInk = [...from.inkColor];
            const fromPaper = [...from.paperColor];
            const toInk = [...to.inkColor];
            const toPaper = [...to.paperColor];

            lerpRoomShaderConfig(from, to, 0.5);

            expect(from.inkColor).toEqual(fromInk);
            expect(from.paperColor).toEqual(fromPaper);
            expect(to.inkColor).toEqual(toInk);
            expect(to.paperColor).toEqual(toPaper);
        });

        it('should interpolate every ordered pair of rooms without escaping [0,1]', () => {
            for (const a of ALL_ROOMS) {
                for (const b of ALL_ROOMS) {
                    const fa = ROOM_CONFIGS[a].shader;
                    const fb = ROOM_CONFIGS[b].shader;
                    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                        const r = lerpRoomShaderConfig(fa, fb, t);
                        for (const c of [...r.inkColor, ...r.paperColor]) {
                            expect(c).toBeGreaterThanOrEqual(0);
                            expect(c).toBeLessThanOrEqual(1);
                        }
                    }
                }
            }
        });
    });
});
