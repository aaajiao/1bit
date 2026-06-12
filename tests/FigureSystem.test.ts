import { describe, expect, it } from 'vitest';
import { FIGURES, WORLD } from '../src/config/constants';
import {
    breatheLight,
    conformistPressed,
    figureCountForChunk,
    figurePlacementsForChunk,
    isInRebelRange,
    pickRebelIndex,
    rebelDelaySeconds,
    rebelTearProximity,
} from '../src/world/FigureSystem';
import {
    FA_FIGURE_PLACEMENT,
    riftLineXForWorldX,
    ROOM_FIGURE_DENSITY,
    RoomType,
} from '../src/world/RoomConfig';

const ALL_ROOMS = Object.values(RoomType);
const CHUNK = WORLD.CHUNK_SIZE;

/** Mean figure count per chunk for a room over a [-half, half) grid. */
function meanCount(roomType: RoomType, half = 40): number {
    let sum = 0;
    let total = 0;
    for (let cx = -half; cx < half; cx++) {
        for (let cz = -half; cz < half; cz++) {
            sum += figureCountForChunk(cx, cz, roomType);
            total++;
        }
    }
    return sum / total;
}

describe('figureSystem (F3 silhouettes)', () => {
    describe('density table (ROOM_FIGURE_DENSITY)', () => {
        it('keeps every probability knob inside (0, 1)', () => {
            for (const room of ALL_ROOMS) {
                const d = ROOM_FIGURE_DENSITY[room];
                expect(d.host).toBeGreaterThan(0);
                expect(d.host).toBeLessThan(1);
                expect(d.second).toBeGreaterThan(0);
                expect(d.second).toBeLessThan(1);
            }
        });

        it('orders the rooms INFO_OVERFLOW > IN_BETWEEN > POLARIZED', () => {
            const info = ROOM_FIGURE_DENSITY[RoomType.INFO_OVERFLOW];
            const between = ROOM_FIGURE_DENSITY[RoomType.IN_BETWEEN];
            const polarized = ROOM_FIGURE_DENSITY[RoomType.POLARIZED];
            expect(info.host).toBeGreaterThan(between.host);
            expect(between.host).toBeGreaterThan(polarized.host);
        });
    });

    describe('figureCountForChunk', () => {
        it('is deterministic and bounded to 0-2 for every room', () => {
            for (const room of ALL_ROOMS) {
                for (let cx = -12; cx <= 12; cx += 3) {
                    for (let cz = -12; cz <= 12; cz += 3) {
                        const count = figureCountForChunk(cx, cz, room);
                        expect(count).toBe(figureCountForChunk(cx, cz, room));
                        expect(count).toBeGreaterThanOrEqual(0);
                        expect(count).toBeLessThanOrEqual(2);
                        expect(Number.isInteger(count)).toBe(true);
                    }
                }
            }
        });

        it('dominates pointwise from dense to sparse rooms (same hash draws)', () => {
            for (let cx = -25; cx <= 25; cx++) {
                for (let cz = -25; cz <= 25; cz++) {
                    const info = figureCountForChunk(cx, cz, RoomType.INFO_OVERFLOW);
                    const between = figureCountForChunk(cx, cz, RoomType.IN_BETWEEN);
                    const polarized = figureCountForChunk(cx, cz, RoomType.POLARIZED);
                    expect(info).toBeGreaterThanOrEqual(between);
                    expect(between).toBeGreaterThanOrEqual(polarized);
                }
            }
        });

        it('realizes the room density ordering at the distribution level', () => {
            const info = meanCount(RoomType.INFO_OVERFLOW);
            const between = meanCount(RoomType.IN_BETWEEN);
            const polarized = meanCount(RoomType.POLARIZED);
            expect(info).toBeGreaterThan(between);
            expect(between).toBeGreaterThan(polarized);
            expect(polarized).toBeLessThan(0.3); // genuinely sparse
        });

        it('keeps the expected on-screen population within the <=20 budget', () => {
            // RENDER_DISTANCE=2 => a 5x5 active chunk window.
            const windowChunks = (2 * WORLD.RENDER_DISTANCE + 1) ** 2;
            for (const room of ALL_ROOMS) {
                expect(meanCount(room) * windowChunks).toBeLessThanOrEqual(20);
            }
        });
    });

    describe('figurePlacementsForChunk', () => {
        it('matches the chunk count and reproduces deterministically', () => {
            for (const room of ALL_ROOMS) {
                for (let cx = -6; cx <= 6; cx += 2) {
                    for (let cz = -6; cz <= 6; cz += 2) {
                        const a = figurePlacementsForChunk(cx, cz, room);
                        const b = figurePlacementsForChunk(cx, cz, room);
                        expect(a.length).toBe(figureCountForChunk(cx, cz, room));
                        expect(a).toEqual(b);
                    }
                }
            }
        });

        it('assigns the per-room archetypes', () => {
            const expected: Array<[RoomType, string]> = [
                [RoomType.INFO_OVERFLOW, 'CONFORMIST'],
                [RoomType.POLARIZED, 'CONFORMIST'],
                [RoomType.IN_BETWEEN, 'MISREAD'],
                [RoomType.FORCED_ALIGNMENT, 'ALIGNED'],
            ];
            for (const [room, archetype] of expected) {
                for (let cx = -20; cx <= 20; cx++) {
                    for (const p of figurePlacementsForChunk(cx, 7, room)) {
                        expect(p.archetype).toBe(archetype);
                    }
                }
            }
        });

        it('keeps every placement inside the chunk footprint with a legal height', () => {
            for (const room of ALL_ROOMS) {
                for (let cx = -15; cx <= 15; cx++) {
                    for (let cz = -15; cz <= 15; cz++) {
                        for (const p of figurePlacementsForChunk(cx, cz, room)) {
                            expect(Math.abs(p.x)).toBeLessThanOrEqual(CHUNK / 2);
                            expect(Math.abs(p.z)).toBeLessThanOrEqual(CHUNK / 2);
                            expect(p.height).toBeGreaterThanOrEqual(FIGURES.HEIGHT_MIN);
                            expect(p.height).toBeLessThanOrEqual(FIGURES.HEIGHT_MAX);
                            expect(Number.isFinite(p.rotationY)).toBe(true);
                        }
                    }
                }
            }
        });

        it('keeps the FA placement knobs coherent (rank stands beyond the clearance)', () => {
            expect(FA_FIGURE_PLACEMENT.ROW_DISTANCE)
                .toBeGreaterThanOrEqual(FA_FIGURE_PLACEMENT.CRACK_CLEARANCE);
        });

        it('keeps every FORCED_ALIGNMENT figure outside the rift clearance', () => {
            const { CRACK_CLEARANCE } = FA_FIGURE_PLACEMENT;
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    const crackLocalX = riftLineXForWorldX(cx * CHUNK) - cx * CHUNK;
                    for (const p of figurePlacementsForChunk(cx, cz, RoomType.FORCED_ALIGNMENT)) {
                        expect(Math.abs(p.x - crackLocalX))
                            .toBeGreaterThanOrEqual(CRACK_CLEARANCE);
                    }
                }
            }
        });

        it('ranks the tidy LEFT side: shared distance, grid z, exact facing, no overlap', () => {
            const { ROW_DISTANCE, ROW_SNAP } = FA_FIGURE_PLACEMENT;
            let leftChunksSeen = 0;
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    const crackLocalX = riftLineXForWorldX(cx * CHUNK) - cx * CHUNK;
                    if (crackLocalX <= 0)
                        continue; // chunk lies right of its cluster's rift
                    const placements = figurePlacementsForChunk(cx, cz, RoomType.FORCED_ALIGNMENT);
                    if (placements.length > 0)
                        leftChunksSeen++;
                    for (const p of placements) {
                        expect(p.x).toBeCloseTo(crackLocalX - ROW_DISTANCE, 10);
                        expect(p.rotationY).toBe(Math.PI / 2); // facing the crack
                        // z snapped to the rank grid.
                        expect(Math.abs(p.z / ROW_SNAP - Math.round(p.z / ROW_SNAP)))
                            .toBeLessThan(1e-9);
                    }
                    if (placements.length === 2) {
                        expect(placements[0].z).not.toBe(placements[1].z);
                    }
                }
            }
            expect(leftChunksSeen).toBeGreaterThan(10);
        });

        it('scatters the broken RIGHT side: varied depth, untidy crack-facing', () => {
            const { CRACK_CLEARANCE, SCATTER_DEPTH, SCATTER_FACING_JITTER } = FA_FIGURE_PLACEMENT;
            const depths = new Set<number>();
            for (let cx = -21; cx <= 21; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    const crackLocalX = riftLineXForWorldX(cx * CHUNK) - cx * CHUNK;
                    if (crackLocalX >= 0)
                        continue; // chunk lies left of its cluster's rift
                    for (const p of figurePlacementsForChunk(cx, cz, RoomType.FORCED_ALIGNMENT)) {
                        const depth = p.x - crackLocalX;
                        expect(depth).toBeGreaterThanOrEqual(CRACK_CLEARANCE);
                        expect(depth).toBeLessThanOrEqual(CRACK_CLEARANCE + SCATTER_DEPTH);
                        depths.add(Math.round(depth * 100));
                        // Facing roughly -x (the crack), within the jitter band.
                        expect(Math.abs(p.rotationY - -Math.PI / 2))
                            .toBeLessThanOrEqual(SCATTER_FACING_JITTER + 1e-9);
                    }
                }
            }
            expect(depths.size).toBeGreaterThan(5); // genuinely scattered, not a rank
        });
    });

    describe('conformist light behavior', () => {
        it('breathes inside the configured band and actually oscillates', () => {
            const { LIGHT_BREATHE_MIN, LIGHT_BREATHE_MAX } = FIGURES;
            let min = Infinity;
            let max = -Infinity;
            for (let t = 0; t < 30; t += 0.05) {
                const v = breatheLight(t, 1.3);
                expect(v).toBeGreaterThanOrEqual(LIGHT_BREATHE_MIN - 1e-9);
                expect(v).toBeLessThanOrEqual(LIGHT_BREATHE_MAX + 1e-9);
                min = Math.min(min, v);
                max = Math.max(max, v);
            }
            const mid = (LIGHT_BREATHE_MIN + LIGHT_BREATHE_MAX) / 2;
            expect(min).toBeLessThan(mid);
            expect(max).toBeGreaterThan(mid);
        });

        it('presses globally while gazing, regardless of distance', () => {
            expect(conformistPressed(true, 0, 500 * 500)).toBe(true);
        });

        it('presses on a blazing flower only within the distance band', () => {
            const near = (FIGURES.DIM_FLOWER_DISTANCE - 1) ** 2;
            const far = (FIGURES.DIM_FLOWER_DISTANCE + 1) ** 2;
            expect(conformistPressed(false, FIGURES.DIM_FLOWER_THRESHOLD + 0.01, near)).toBe(true);
            expect(conformistPressed(false, FIGURES.DIM_FLOWER_THRESHOLD + 0.01, far)).toBe(false);
        });

        it('never presses below the flower threshold (strict)', () => {
            expect(conformistPressed(false, FIGURES.DIM_FLOWER_THRESHOLD, 1)).toBe(false);
            expect(conformistPressed(false, 0.2, 1)).toBe(false);
        });
    });

    describe('rebel event gating', () => {
        it('draws deterministic arming delays inside the interval band', () => {
            const seen = new Set<number>();
            for (let i = 0; i < 60; i++) {
                const d = rebelDelaySeconds(i);
                expect(d).toBe(rebelDelaySeconds(i));
                expect(d).toBeGreaterThanOrEqual(FIGURES.REBEL_MIN_INTERVAL);
                expect(d).toBeLessThanOrEqual(FIGURES.REBEL_MAX_INTERVAL);
                seen.add(Math.round(d));
            }
            expect(seen.size).toBeGreaterThan(10); // varied, not a constant
        });

        it('gates the trigger to the 30-60m band (inclusive bounds)', () => {
            const { REBEL_MIN_DISTANCE, REBEL_MAX_DISTANCE } = FIGURES;
            expect(isInRebelRange((REBEL_MIN_DISTANCE - 0.1) ** 2)).toBe(false);
            expect(isInRebelRange(REBEL_MIN_DISTANCE ** 2)).toBe(true);
            expect(isInRebelRange(45 ** 2)).toBe(true);
            expect(isInRebelRange(REBEL_MAX_DISTANCE ** 2)).toBe(true);
            expect(isInRebelRange((REBEL_MAX_DISTANCE + 0.1) ** 2)).toBe(false);
        });

        it('picks a deterministic in-range candidate index (-1 when empty)', () => {
            expect(pickRebelIndex(0, 0)).toBe(-1);
            expect(pickRebelIndex(5, -1)).toBe(-1);
            const seen = new Set<number>();
            for (let eventIndex = 0; eventIndex < 30; eventIndex++) {
                for (let count = 1; count <= 8; count++) {
                    const idx = pickRebelIndex(eventIndex, count);
                    expect(idx).toBe(pickRebelIndex(eventIndex, count));
                    expect(idx).toBeGreaterThanOrEqual(0);
                    expect(idx).toBeLessThan(count);
                    if (count === 8)
                        seen.add(idx);
                }
            }
            expect(seen.size).toBeGreaterThan(2); // the pick actually varies
        });

        it('maps trigger distance to tear proximity (1 close, 0 far)', () => {
            const { REBEL_MIN_DISTANCE, REBEL_MAX_DISTANCE } = FIGURES;
            expect(rebelTearProximity(REBEL_MIN_DISTANCE ** 2)).toBe(1);
            expect(rebelTearProximity(REBEL_MAX_DISTANCE ** 2)).toBe(0);
            const midDist = (REBEL_MIN_DISTANCE + REBEL_MAX_DISTANCE) / 2;
            expect(rebelTearProximity(midDist ** 2)).toBeCloseTo(0.5, 10);
        });
    });
});
