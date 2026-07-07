import type { ScarPoint } from '../src/world/ScarField';
import { describe, expect, it } from 'vitest';
import { ECLIPSE_FIGURES, FIGURES, SCAR_WITNESS, WORLD } from '../src/config/constants';
import {
    breatheLight,
    conformistPressed,
    contagionWindowTick,
    convergePhase,
    eclipseFacesPlayer,
    figureAttitude,
    figureCountForChunk,
    figurePlacementsForChunk,
    isInRebelRange,
    isScarWitness,
    pickRebelIndex,
    rebelDelaySeconds,
    rebelTearProximity,
    resonanceArmed,
    resonanceInBand,
    resonanceReferencePhase,
    resonantBreathe,
    stepRebelArmTimer,
    updateResonanceArm,
    witnessPose,
} from '../src/world/FigureSystem';
import {
    FA_FIGURE_PLACEMENT,
    faSideAxisX,
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

        it('keeps every FORCED_ALIGNMENT figure outside the clearance of its chunk own crack', () => {
            const { CRACK_CLEARANCE } = FA_FIGURE_PLACEMENT;
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    // The physical crack runs through every FA chunk's center:
                    // chunk-local x = 0 (riftLineXForWorldX of the chunk center).
                    const crackLocalX = riftLineXForWorldX(cx * CHUNK) - cx * CHUNK;
                    expect(crackLocalX).toBe(0);
                    for (const p of figurePlacementsForChunk(cx, cz, RoomType.FORCED_ALIGNMENT)) {
                        expect(Math.abs(p.x - crackLocalX))
                            .toBeGreaterThanOrEqual(CRACK_CLEARANCE);
                    }
                }
            }
        });

        it('ranks the tidy LEFT side (semantic axis, not crack): shared distance, grid z, exact facing', () => {
            const { ROW_DISTANCE, ROW_SNAP } = FA_FIGURE_PLACEMENT;
            let leftChunksSeen = 0;
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    // Tidy treatment belongs to chunks WEST of the room's
                    // semantic side axis (the cluster center).
                    if (cx * CHUNK > faSideAxisX(cx * CHUNK))
                        continue; // chunk lies right of its cluster's axis
                    const placements = figurePlacementsForChunk(cx, cz, RoomType.FORCED_ALIGNMENT);
                    if (placements.length > 0)
                        leftChunksSeen++;
                    for (const p of placements) {
                        // Rank stands ROW_DISTANCE west of the chunk's own
                        // crack (local x = 0).
                        expect(p.x).toBeCloseTo(-ROW_DISTANCE, 10);
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

        it('scatters the broken RIGHT side (semantic axis): varied depth, untidy crack-facing', () => {
            const { CRACK_CLEARANCE, SCATTER_DEPTH, SCATTER_FACING_JITTER } = FA_FIGURE_PLACEMENT;
            const depths = new Set<number>();
            for (let cx = -21; cx <= 21; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    if (cx * CHUNK < faSideAxisX(cx * CHUNK))
                        continue; // chunk lies left of its cluster's axis
                    for (const p of figurePlacementsForChunk(cx, cz, RoomType.FORCED_ALIGNMENT)) {
                        // Scatter sits east of the chunk's own crack (local 0).
                        const depth = p.x;
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

    describe('witnesses at the scars (F3 x F2)', () => {
        it('keeps the witness knobs coherent (ring inside a positive redact radius)', () => {
            expect(SCAR_WITNESS.FRACTION).toBeGreaterThan(0);
            expect(SCAR_WITNESS.FRACTION).toBeLessThan(1);
            expect(SCAR_WITNESS.RING_MIN).toBeGreaterThan(0);
            expect(SCAR_WITNESS.RING_MAX).toBeGreaterThan(SCAR_WITNESS.RING_MIN);
            expect(SCAR_WITNESS.REDACT_RADIUS).toBeGreaterThan(0);
        });

        it('gates roughly SCAR_WITNESS.FRACTION of figures as witnesses, deterministically', () => {
            let witnesses = 0;
            let total = 0;
            for (let cx = -40; cx <= 40; cx++) {
                for (let cz = -40; cz <= 40; cz++) {
                    for (let k = 0; k < 2; k++) {
                        const w = isScarWitness(cx, cz, k);
                        expect(w).toBe(isScarWitness(cx, cz, k)); // deterministic
                        if (w)
                            witnesses++;
                        total++;
                    }
                }
            }
            const frac = witnesses / total;
            expect(frac).toBeGreaterThan(SCAR_WITNESS.FRACTION - 0.08);
            expect(frac).toBeLessThan(SCAR_WITNESS.FRACTION + 0.08);
        });

        it('stands a witness on the ring around the scar and faces it (witnessPose)', () => {
            const { RING_MIN, RING_MAX } = SCAR_WITNESS;
            const scar: ScarPoint = { x: 123.4, z: -56.7, count: 3 };
            let angleSpread = new Set<number>();
            for (let cx = -6; cx <= 6; cx++) {
                for (let cz = -6; cz <= 6; cz++) {
                    for (let k = 0; k < 2; k++) {
                        const pose = witnessPose(scar, cx, cz, k, CHUNK);
                        const worldX = cx * CHUNK + pose.x;
                        const worldZ = cz * CHUNK + pose.z;
                        const r = Math.hypot(scar.x - worldX, scar.z - worldZ);
                        expect(r).toBeGreaterThanOrEqual(RING_MIN - 1e-9);
                        expect(r).toBeLessThanOrEqual(RING_MAX + 1e-9);
                        // local +z (sin rotY, cos rotY) aims straight at the scar.
                        expect(Math.sin(pose.rotationY)).toBeCloseTo((scar.x - worldX) / r, 9);
                        expect(Math.cos(pose.rotationY)).toBeCloseTo((scar.z - worldZ) / r, 9);
                        angleSpread = angleSpread.add(Math.round(pose.rotationY * 100));
                    }
                }
            }
            expect(angleSpread.size).toBeGreaterThan(5); // genuinely ringed, not one spot
        });

        it('leaves the scattered placement bit-for-bit when no scar reaches the chunk', () => {
            for (const room of ALL_ROOMS) {
                for (let cx = -8; cx <= 8; cx++) {
                    for (let cz = -8; cz <= 8; cz++) {
                        expect(figurePlacementsForChunk(cx, cz, room, CHUNK, []))
                            .toEqual(figurePlacementsForChunk(cx, cz, room));
                    }
                }
            }
        });

        it('pulls only the witness share to the scar, leaving the rest untouched', () => {
            const { RING_MAX } = SCAR_WITNESS;
            let witnessesSeen = 0;
            let bystandersSeen = 0;
            for (let cx = -8; cx <= 8; cx++) {
                for (let cz = -8; cz <= 8; cz++) {
                    // A scar sitting near this chunk's own centre.
                    const scar: ScarPoint = { x: cx * CHUNK + 3, z: cz * CHUNK - 2, count: 4 };
                    const base = figurePlacementsForChunk(cx, cz, RoomType.INFO_OVERFLOW);
                    const withScar = figurePlacementsForChunk(
                        cx,
                        cz,
                        RoomType.INFO_OVERFLOW,
                        CHUNK,
                        [scar],
                    );
                    expect(withScar.length).toBe(base.length);
                    for (let k = 0; k < base.length; k++) {
                        if (isScarWitness(cx, cz, k)) {
                            witnessesSeen++;
                            const worldX = cx * CHUNK + withScar[k].x;
                            const worldZ = cz * CHUNK + withScar[k].z;
                            const r = Math.hypot(scar.x - worldX, scar.z - worldZ);
                            expect(r).toBeLessThanOrEqual(RING_MAX + 1e-9);
                            // Archetype / height / phase are never rewritten.
                            expect(withScar[k].archetype).toBe(base[k].archetype);
                            expect(withScar[k].height).toBe(base[k].height);
                            expect(withScar[k].phase).toBe(base[k].phase);
                        }
                        else {
                            bystandersSeen++;
                            expect(withScar[k]).toEqual(base[k]);
                        }
                    }
                }
            }
            expect(witnessesSeen).toBeGreaterThan(5);
            expect(bystandersSeen).toBeGreaterThan(5);
        });

        it('is deterministic given the frozen boot scar snapshot', () => {
            const scars: ScarPoint[] = [
                { x: 12, z: 20, count: 2 },
                { x: -140, z: 65, count: 5 },
            ];
            for (const room of ALL_ROOMS) {
                for (let cx = -6; cx <= 6; cx++) {
                    for (let cz = -6; cz <= 6; cz++) {
                        const a = figurePlacementsForChunk(cx, cz, room, CHUNK, scars);
                        const b = figurePlacementsForChunk(cx, cz, room, CHUNK, scars);
                        expect(a).toEqual(b);
                    }
                }
            }
        });

        it('gathers different figures at the nearest of several scars', () => {
            // Two scars far apart; every witness must land on the ring of ITS
            // nearest scar, never averaged between them.
            const { RING_MAX } = SCAR_WITNESS;
            const scarA: ScarPoint = { x: 0, z: 0, count: 3 };
            const scarB: ScarPoint = { x: 300, z: 0, count: 3 };
            const scars = [scarA, scarB];
            for (let cx = -3; cx <= 6; cx++) {
                for (let cz = -3; cz <= 3; cz++) {
                    const withScar = figurePlacementsForChunk(cx, cz, RoomType.INFO_OVERFLOW, CHUNK, scars);
                    for (let k = 0; k < withScar.length; k++) {
                        if (!isScarWitness(cx, cz, k))
                            continue;
                        const worldX = cx * CHUNK + withScar[k].x;
                        const worldZ = cz * CHUNK + withScar[k].z;
                        const rA = Math.hypot(scarA.x - worldX, scarA.z - worldZ);
                        const rB = Math.hypot(scarB.x - worldX, scarB.z - worldZ);
                        expect(Math.min(rA, rB)).toBeLessThanOrEqual(RING_MAX + 1e-9);
                    }
                }
            }
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

    describe('rebellion is contagious (override loosens the gate)', () => {
        describe('config coherence', () => {
            it('opens a positive window and accelerates the gate by >1', () => {
                expect(FIGURES.REBEL_CONTAGION_WINDOW).toBeGreaterThan(0);
                expect(FIGURES.REBEL_CONTAGION_GATE_DIVISOR).toBeGreaterThan(1);
            });
        });

        describe('contagionWindowTick', () => {
            it('refreshes to the full window on a successful override', () => {
                expect(contagionWindowTick(0, 0.016, true))
                    .toBe(FIGURES.REBEL_CONTAGION_WINDOW);
                // A repeated success refreshes even a partly-drained window.
                expect(contagionWindowTick(12, 0.016, true))
                    .toBe(FIGURES.REBEL_CONTAGION_WINDOW);
            });

            it('drains by delta toward 0 and never goes negative', () => {
                expect(contagionWindowTick(10, 4, false)).toBeCloseTo(6, 10);
                expect(contagionWindowTick(3, 4, false)).toBe(0);
                expect(contagionWindowTick(0, 4, false)).toBe(0);
            });

            it('ignores a negative delta (frozen, never grows)', () => {
                expect(contagionWindowTick(10, -5, false)).toBe(10);
            });

            it('drains to exactly 0 over the full window duration', () => {
                let remaining = contagionWindowTick(0, 0.016, true);
                for (let i = 0; i < 100000 && remaining > 0; i++)
                    remaining = contagionWindowTick(remaining, 0.05, false);
                expect(remaining).toBe(0);
            });
        });

        describe('stepRebelArmTimer', () => {
            it('drains at 1x when the window is closed (calm gate)', () => {
                expect(stepRebelArmTimer(100, 5, false)).toBeCloseTo(95, 10);
            });

            it('drains DIVISOR times faster while the window is open', () => {
                const { REBEL_CONTAGION_GATE_DIVISOR: div } = FIGURES;
                expect(stepRebelArmTimer(100, 5, true)).toBeCloseTo(100 - 5 * div, 10);
            });

            it('reaches 0 in 1/DIVISOR the time while contagious', () => {
                const { REBEL_CONTAGION_GATE_DIVISOR: div } = FIGURES;
                const start = rebelDelaySeconds(0);
                // Calm frames to drain the whole interval.
                let calm = start;
                let calmFrames = 0;
                while (calm > 0) {
                    calm = stepRebelArmTimer(calm, 0.05, false);
                    calmFrames++;
                }
                // Contagious frames to drain the same interval.
                let hot = start;
                let hotFrames = 0;
                while (hot > 0) {
                    hot = stepRebelArmTimer(hot, 0.05, true);
                    hotFrames++;
                }
                // Roughly div times fewer frames (allow ±1 frame of rounding).
                expect(hotFrames).toBeLessThanOrEqual(Math.ceil(calmFrames / div) + 1);
                expect(hotFrames).toBeGreaterThanOrEqual(Math.floor(calmFrames / div) - 1);
            });

            it('clamps at 0 and never goes negative', () => {
                expect(stepRebelArmTimer(1, 5, true)).toBe(0);
                expect(stepRebelArmTimer(0, 5, false)).toBe(0);
            });

            it('ignores a negative delta (frozen gate)', () => {
                expect(stepRebelArmTimer(50, -3, true)).toBe(50);
            });
        });
    });

    describe('flower resonance (the mid-band social instrument)', () => {
        const TWO_PI = Math.PI * 2;

        describe('config coherence', () => {
            it('orders the resonance band inside the breathe/press knobs', () => {
                expect(FIGURES.RESONANCE_BAND_MIN).toBeLessThan(FIGURES.RESONANCE_BAND_MAX);
                expect(FIGURES.RESONANCE_BAND_HYSTERESIS).toBeGreaterThan(0);
                // The outer (hysteretic) band must stay below the blaze
                // threshold, so a blazing flower always exits resonance before
                // it presses the kin down.
                expect(FIGURES.RESONANCE_BAND_MAX + FIGURES.RESONANCE_BAND_HYSTERESIS)
                    .toBeLessThan(FIGURES.DIM_FLOWER_THRESHOLD);
                // The lifted peak actually rises above the lonely default.
                expect(FIGURES.RESONANCE_LIGHT_MAX).toBeGreaterThan(FIGURES.LIGHT_BREATHE_MAX);
                expect(FIGURES.RESONANCE_ARM_SECONDS).toBeGreaterThan(0);
            });
        });

        describe('resonanceInBand (hysteresis)', () => {
            it('enters only strictly inside the band', () => {
                const { RESONANCE_BAND_MIN, RESONANCE_BAND_MAX } = FIGURES;
                const mid = (RESONANCE_BAND_MIN + RESONANCE_BAND_MAX) / 2;
                expect(resonanceInBand(mid, false)).toBe(true);
                expect(resonanceInBand(RESONANCE_BAND_MIN - 0.001, false)).toBe(false);
                expect(resonanceInBand(RESONANCE_BAND_MAX + 0.001, false)).toBe(false);
            });

            it('stays in-band across the hysteresis margin once entered', () => {
                const { RESONANCE_BAND_MAX, RESONANCE_BAND_HYSTERESIS } = FIGURES;
                const justOver = RESONANCE_BAND_MAX + RESONANCE_BAND_HYSTERESIS / 2;
                // Would not ENTER here, but does not chatter out once armed.
                expect(resonanceInBand(justOver, false)).toBe(false);
                expect(resonanceInBand(justOver, true)).toBe(true);
                // Beyond the widened band it finally drops.
                expect(resonanceInBand(RESONANCE_BAND_MAX + RESONANCE_BAND_HYSTERESIS + 0.001, true))
                    .toBe(false);
            });
        });

        describe('updateResonanceArm', () => {
            it('arms only after sustained continuous in-band time', () => {
                const mid = (FIGURES.RESONANCE_BAND_MIN + FIGURES.RESONANCE_BAND_MAX) / 2;
                let state = { inBand: false, armTimer: 0 };
                expect(resonanceArmed(state)).toBe(false);
                // Half the arm time: in-band but not yet armed.
                for (let t = 0; t < FIGURES.RESONANCE_ARM_SECONDS / 2; t += 0.1)
                    state = updateResonanceArm(state, mid, false, 0.1);
                expect(state.inBand).toBe(true);
                expect(resonanceArmed(state)).toBe(false);
                // Past the threshold: armed, and the timer caps (never grows past).
                for (let t = 0; t < FIGURES.RESONANCE_ARM_SECONDS; t += 0.1)
                    state = updateResonanceArm(state, mid, false, 0.1);
                expect(resonanceArmed(state)).toBe(true);
                expect(state.armTimer).toBe(FIGURES.RESONANCE_ARM_SECONDS);
            });

            it('resets the timer when gazing (discipline breaks resonance)', () => {
                const mid = (FIGURES.RESONANCE_BAND_MIN + FIGURES.RESONANCE_BAND_MAX) / 2;
                let state = { inBand: true, armTimer: FIGURES.RESONANCE_ARM_SECONDS };
                state = updateResonanceArm(state, mid, true, 0.1);
                expect(state.inBand).toBe(false);
                expect(state.armTimer).toBe(0);
                expect(resonanceArmed(state)).toBe(false);
            });

            it('resets the timer when the flower leaves the band (blazing / dimming)', () => {
                let state = { inBand: true, armTimer: FIGURES.RESONANCE_ARM_SECONDS };
                // Blaze above the band.
                state = updateResonanceArm(state, FIGURES.DIM_FLOWER_THRESHOLD + 0.1, false, 0.1);
                expect(state.armTimer).toBe(0);
                // Dim below the band.
                state = { inBand: true, armTimer: FIGURES.RESONANCE_ARM_SECONDS };
                state = updateResonanceArm(state, 0.05, false, 0.1);
                expect(state.armTimer).toBe(0);
            });
        });

        describe('resonanceReferencePhase', () => {
            it('is wrapped to [0, 2π) and deterministic', () => {
                for (let t = 0; t < 500; t += 3.3) {
                    const p = resonanceReferencePhase(t);
                    expect(p).toBe(resonanceReferencePhase(t));
                    expect(p).toBeGreaterThanOrEqual(0);
                    expect(p).toBeLessThan(TWO_PI);
                }
            });

            it('evolves with elapsed time (a live shared cadence)', () => {
                expect(resonanceReferencePhase(10)).not.toBe(resonanceReferencePhase(20));
            });
        });

        describe('convergePhase', () => {
            it('never overshoots and stays wrapped for a large delta', () => {
                const next = convergePhase(0, Math.PI, 100, 10); // rate*delta >> 1
                expect(next).toBeCloseTo(Math.PI, 10);
                expect(next).toBeGreaterThanOrEqual(0);
                expect(next).toBeLessThan(TWO_PI);
            });

            it('takes the shortest arc across the 0/2π seam', () => {
                // From 0.1 rad, the target 2π - 0.1 is reached by going NEGATIVE
                // (a -0.2 rad arc through the seam), not the long way forward.
                // rate*delta = 0.8 steps 80% of the -0.2 arc, crossing 0 and
                // wrapping into the high 6.x range.
                const next = convergePhase(0.1, TWO_PI - 0.1, 1, 0.8);
                expect(next).toBeGreaterThan(Math.PI); // proves it went negative
                expect(next).toBeGreaterThan(TWO_PI - 0.1); // past the seam, not yet at target
                expect(next).toBeLessThan(TWO_PI);
            });

            it('monotonically closes onto a static target over time', () => {
                let cur = 0.3;
                const target = 2.4;
                let prevGap = Math.abs(target - cur);
                for (let i = 0; i < 200; i++) {
                    cur = convergePhase(cur, target, FIGURES.RESONANCE_CONVERGE_RATE, 0.05);
                    const gap = Math.abs(target - cur);
                    expect(gap).toBeLessThanOrEqual(prevGap + 1e-9);
                    prevGap = gap;
                }
                expect(prevGap).toBeLessThan(0.05); // exponential ease, near-closed
            });
        });

        describe('resonantBreathe', () => {
            it('equals the plain breathe at resonance 0', () => {
                for (let t = 0; t < 20; t += 0.37) {
                    expect(resonantBreathe(t, 1.1, 0)).toBeCloseTo(breatheLight(t, 1.1), 12);
                }
            });

            it('keeps the floor and lifts the peak toward RESONANCE_LIGHT_MAX', () => {
                const { LIGHT_BREATHE_MIN, LIGHT_BREATHE_MAX, RESONANCE_LIGHT_MAX } = FIGURES;
                let min = Infinity;
                let max = -Infinity;
                for (let t = 0; t < 60; t += 0.02) {
                    const v = resonantBreathe(t, 0.7, 1);
                    min = Math.min(min, v);
                    max = Math.max(max, v);
                }
                // Floor unchanged, peak reaches the resonant maximum.
                expect(min).toBeCloseTo(LIGHT_BREATHE_MIN, 3);
                expect(max).toBeCloseTo(RESONANCE_LIGHT_MAX, 3);
                expect(max).toBeGreaterThan(LIGHT_BREATHE_MAX);
            });

            it('clamps the resonance strength to [0, 1]', () => {
                expect(resonantBreathe(3, 0.4, -5)).toBeCloseTo(resonantBreathe(3, 0.4, 0), 12);
                expect(resonantBreathe(3, 0.4, 5)).toBeCloseTo(resonantBreathe(3, 0.4, 1), 12);
            });
        });
    });

    describe('eclipse attitude (weather batch)', () => {
        describe('eclipseFacesPlayer', () => {
            const { FACE_PLAYER_FLOWER_THRESHOLD, FACE_PLAYER_RADIUS } = ECLIPSE_FIGURES;
            const nearSq = (FACE_PLAYER_RADIUS - 1) ** 2;
            const farSq = (FACE_PLAYER_RADIUS + 1) ** 2;

            it('turns a figure only for a loud flower WITHIN the radius', () => {
                expect(eclipseFacesPlayer(FACE_PLAYER_FLOWER_THRESHOLD + 0.1, nearSq)).toBe(true);
                expect(eclipseFacesPlayer(FACE_PLAYER_FLOWER_THRESHOLD + 0.1, farSq)).toBe(false);
                expect(eclipseFacesPlayer(FACE_PLAYER_FLOWER_THRESHOLD - 0.1, nearSq)).toBe(false);
            });

            it('is exclusive at the threshold and the radius edge', () => {
                expect(eclipseFacesPlayer(FACE_PLAYER_FLOWER_THRESHOLD, nearSq)).toBe(false);
                expect(eclipseFacesPlayer(1, FACE_PLAYER_RADIUS * FACE_PLAYER_RADIUS)).toBe(false);
            });

            it('keeps the face-player threshold below the press-down threshold', () => {
                // The exception must be reachable WITHOUT bowing the kin:
                // there is a flower band that turns faces but does not press.
                expect(ECLIPSE_FIGURES.FACE_PLAYER_FLOWER_THRESHOLD)
                    .toBeLessThan(FIGURES.DIM_FLOWER_THRESHOLD);
            });
        });

        describe('figureAttitude (the ONE priority ladder)', () => {
            it('press-down suppression outranks everything (top rung)', () => {
                expect(figureAttitude(true, true, true, true)).toBe('PRESSED');
                expect(figureAttitude(true, true, false, false)).toBe('PRESSED');
                expect(figureAttitude(true, false, false, true)).toBe('PRESSED');
            });

            it('eclipse facing outranks resonance', () => {
                expect(figureAttitude(false, true, false, true)).toBe('ECLIPSE_LOOK_UP');
                expect(figureAttitude(false, true, true, true)).toBe('ECLIPSE_FACE_PLAYER');
            });

            it('a loud flower nearby turns the face to the PLAYER, else to the sky', () => {
                expect(figureAttitude(false, true, true, false)).toBe('ECLIPSE_FACE_PLAYER');
                expect(figureAttitude(false, true, false, false)).toBe('ECLIPSE_LOOK_UP');
            });

            it('the faces-player gate means nothing outside a transit', () => {
                expect(figureAttitude(false, false, true, false)).toBe('IDLE');
                expect(figureAttitude(false, false, true, true)).toBe('RESONANCE');
            });

            it('resonance outranks idle sway (bottom rungs)', () => {
                expect(figureAttitude(false, false, false, true)).toBe('RESONANCE');
                expect(figureAttitude(false, false, false, false)).toBe('IDLE');
            });

            it('pressed and resonating cannot co-occur under the real gates', () => {
                // The ladder's legacy-equivalence argument (see figureAttitude
                // doc): gazing disarms resonance the same frame, and the
                // resonance band's hysteretic outer edge sits strictly below
                // the flower press threshold — so gating the resonance drive
                // on attitude RESONANCE is bit-identical for legacy weather.
                expect(FIGURES.RESONANCE_BAND_MAX + FIGURES.RESONANCE_BAND_HYSTERESIS)
                    .toBeLessThan(FIGURES.DIM_FLOWER_THRESHOLD);
                const arm = updateResonanceArm(
                    { inBand: true, armTimer: FIGURES.RESONANCE_ARM_SECONDS },
                    0.5,
                    true, // gazing (== pressed for every conformist)
                    0.016,
                );
                expect(resonanceArmed(arm)).toBe(false);
            });
        });
    });
});
