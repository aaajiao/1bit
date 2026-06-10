import type { AnomalyKind, Biome, BuildingStyle, LayoutMode } from '../src/world/RoomGeneration';
import { describe, expect, it } from 'vitest';
import { RoomType } from '../src/world/RoomConfig';
import {
    ANOMALY_THRESHOLD,
    anomalyAt,
    applyLayout,
    BIOME_PERIOD,
    biomeAt,
    biomeDensityFactor,
    biomeScaleFactor,
    chunkBuildingCount,
    GRID_SNAP_SIZE,
    layoutAt,
    polarizedFaction,
    selectBuildingStyle,
    snapToGrid,
    SUB_PALETTE_COUNT,
    subPaletteIndex,
} from '../src/world/RoomGeneration';

const ALL_ROOMS = [
    RoomType.INFO_OVERFLOW,
    RoomType.FORCED_ALIGNMENT,
    RoomType.IN_BETWEEN,
    RoomType.POLARIZED,
];

const VALID_STYLES = new Set<BuildingStyle>(['BLOCKS', 'SPIKES', 'TREE', 'FLUID']);

// Sample the [0,1) seed space densely for distribution assertions.
function sampleStyles(roomType: RoomType | undefined): Record<BuildingStyle, number> {
    const counts: Record<BuildingStyle, number> = { BLOCKS: 0, SPIKES: 0, TREE: 0, FLUID: 0 };
    const N = 1000;
    for (let k = 0; k < N; k++) {
        const seed = k / N;
        counts[selectBuildingStyle(seed, roomType)]++;
    }
    return counts;
}

describe('roomGeneration', () => {
    describe('selectBuildingStyle', () => {
        it('should always return a valid style for every room and seed', () => {
            for (const room of [...ALL_ROOMS, undefined]) {
                for (let k = 0; k <= 100; k++) {
                    const style = selectBuildingStyle(k / 100, room);
                    expect(VALID_STYLES.has(style)).toBe(true);
                }
            }
        });

        it('should be deterministic for the same seed and room', () => {
            const a = selectBuildingStyle(0.42, RoomType.IN_BETWEEN);
            const b = selectBuildingStyle(0.42, RoomType.IN_BETWEEN);
            expect(a).toBe(b);
        });

        it('default mix preserves the original pre-Phase-2 cutoffs', () => {
            // FLUID>0.9, TREE>0.7, SPIKES>0.35, else BLOCKS.
            expect(selectBuildingStyle(0.95, undefined)).toBe('FLUID');
            expect(selectBuildingStyle(0.8, undefined)).toBe('TREE');
            expect(selectBuildingStyle(0.5, undefined)).toBe('SPIKES');
            expect(selectBuildingStyle(0.1, undefined)).toBe('BLOCKS');
        });

        it('iNFO_OVERFLOW is a machine district: BLOCKS/SPIKES dominant, rare TREE, no FLUID', () => {
            const counts = sampleStyles(RoomType.INFO_OVERFLOW);
            expect(counts.FLUID).toBe(0);
            // TREE is rare (only the very top of the seed range).
            expect(counts.TREE).toBeGreaterThan(0);
            expect(counts.TREE).toBeLessThan(counts.BLOCKS);
            expect(counts.TREE).toBeLessThan(counts.SPIKES);
            // BLOCKS + SPIKES dominate.
            expect(counts.BLOCKS + counts.SPIKES).toBeGreaterThan(900);
        });

        it('iN_BETWEEN is FLUID-dominant (never settling)', () => {
            const counts = sampleStyles(RoomType.IN_BETWEEN);
            expect(counts.FLUID).toBeGreaterThan(counts.BLOCKS);
            expect(counts.FLUID).toBeGreaterThan(counts.SPIKES);
            expect(counts.FLUID).toBeGreaterThan(counts.TREE);
        });

        it('pOLARIZED is rigid BLOCKS-dominant and bans TREE and FLUID (no curves)', () => {
            // Flow-audit enhancement #11: the room is all straight lines — the
            // former FLUID slice folds into BLOCKS.
            const counts = sampleStyles(RoomType.POLARIZED);
            expect(counts.TREE).toBe(0);
            expect(counts.FLUID).toBe(0);
            expect(counts.BLOCKS).toBeGreaterThan(counts.SPIKES);
            expect(counts.BLOCKS + counts.SPIKES).toBe(1000);
        });

        it('fORCED_ALIGNMENT is regimented BLOCKS/SPIKES only (no TREE, no FLUID)', () => {
            const counts = sampleStyles(RoomType.FORCED_ALIGNMENT);
            expect(counts.TREE).toBe(0);
            expect(counts.FLUID).toBe(0);
            expect(counts.BLOCKS + counts.SPIKES).toBe(1000);
        });
    });

    describe('chunkBuildingCount', () => {
        it('should be deterministic for the same chunk and room', () => {
            const a = chunkBuildingCount(5, -3, RoomType.POLARIZED);
            const b = chunkBuildingCount(5, -3, RoomType.POLARIZED);
            expect(a).toBe(b);
        });

        it('should never return a negative count', () => {
            for (const room of ALL_ROOMS) {
                for (let cx = -30; cx <= 30; cx++) {
                    for (let cz = -30; cz <= 30; cz++) {
                        expect(chunkBuildingCount(cx, cz, room)).toBeGreaterThanOrEqual(0);
                    }
                }
            }
        });

        it('populated chunks stay within the original 3-7 range', () => {
            for (const room of ALL_ROOMS) {
                for (let cx = -30; cx <= 30; cx++) {
                    for (let cz = -30; cz <= 30; cz++) {
                        const count = chunkBuildingCount(cx, cz, room);
                        // Either a clearing (0-1) or a populated chunk (3-7).
                        const isClearing = count <= 1;
                        const isPopulated = count >= 3 && count <= 7;
                        expect(isClearing || isPopulated).toBe(true);
                    }
                }
            }
        });

        it('sparse gate produces some clearings but keeps most chunks populated', () => {
            let clearings = 0;
            let total = 0;
            for (let cx = -40; cx <= 40; cx++) {
                for (let cz = -40; cz <= 40; cz++) {
                    total++;
                    if (chunkBuildingCount(cx, cz, RoomType.IN_BETWEEN) <= 1)
                        clearings++;
                }
            }
            const ratio = clearings / total;
            // Some clearings exist...
            expect(clearings).toBeGreaterThan(0);
            // ...but most chunks remain populated (clearings are the minority).
            expect(ratio).toBeLessThan(0.5);
        });
    });

    describe('polarizedFaction', () => {
        it('should be deterministic for the same coords and index', () => {
            const a = polarizedFaction(2, 9, 4);
            const b = polarizedFaction(2, 9, 4);
            expect(a).toEqual(b);
        });

        it('should always return a valid pole and boolean faction', () => {
            for (let cx = -10; cx <= 10; cx++) {
                for (let cz = -10; cz <= 10; cz++) {
                    for (let i = 0; i < 7; i++) {
                        const f = polarizedFaction(cx, cz, i);
                        expect(f.pole === 1 || f.pole === -1).toBe(true);
                        expect(typeof f.solid).toBe('boolean');
                    }
                }
            }
        });

        it('should split into both poles and both factions across the world', () => {
            const poles = new Set<number>();
            const factions = new Set<boolean>();
            for (let cx = -10; cx <= 10; cx++) {
                for (let i = 0; i < 7; i++) {
                    const f = polarizedFaction(cx, 0, i);
                    poles.add(f.pole);
                    factions.add(f.solid);
                }
            }
            expect(poles.size).toBe(2);
            expect(factions.size).toBe(2);
        });
    });

    describe('snapToGrid', () => {
        it('should quantize to the grid size', () => {
            expect(snapToGrid(0)).toBe(0);
            expect(snapToGrid(3)).toBe(0); // 3/8 = 0.375 -> round 0 -> 0
            expect(snapToGrid(8)).toBe(GRID_SNAP_SIZE);
        });

        it('should snap to the nearest grid line', () => {
            // round(v/8)*8
            expect(snapToGrid(3.9)).toBe(0); // 3.9/8 = 0.4875 -> round 0
            expect(snapToGrid(4.1)).toBe(GRID_SNAP_SIZE); // 4.1/8 = 0.5125 -> round 1 -> 8
            expect(snapToGrid(7)).toBe(GRID_SNAP_SIZE);
            expect(snapToGrid(-4.1)).toBe(-GRID_SNAP_SIZE);
            expect(snapToGrid(20)).toBe(24); // 20/8=2.5 -> round 3 -> 24 (banker's? JS rounds 2.5 to 3)
        });

        it('output is always a multiple of the grid size', () => {
            for (let v = -100; v <= 100; v += 0.7) {
                // `+ 0` normalizes the -0 that `(-8) % 8` yields so Object.is passes.
                expect((snapToGrid(v) % GRID_SNAP_SIZE) + 0).toBe(0);
            }
        });
    });

    // ===== Phase 4 — world-scale variety (orthogonal to rooms) =====

    const ALL_BIOMES: Biome[] = ['OVERGROWN', 'RIGID', 'SPARSE'];

    describe('biomeAt', () => {
        it('should be deterministic for the same chunk', () => {
            expect(biomeAt(7, -4)).toBe(biomeAt(7, -4));
        });

        it('should always return a valid biome', () => {
            const seen = new Set<Biome>();
            for (let cx = -60; cx <= 60; cx++) {
                for (let cz = -60; cz <= 60; cz++) {
                    const b = biomeAt(cx, cz);
                    expect(ALL_BIOMES.includes(b)).toBe(true);
                    seen.add(b);
                }
            }
            // The world should exhibit all three biomes somewhere.
            expect(seen.size).toBe(3);
        });

        it('forms belts: chunks in the same band usually share a biome', () => {
            // Within one band (BIOME_PERIOD x BIOME_PERIOD) every chunk folds to
            // the same band seed, so the biome is constant across the band.
            const bandX = 3 * BIOME_PERIOD;
            const bandZ = -2 * BIOME_PERIOD;
            const ref = biomeAt(bandX, bandZ);
            for (let dx = 0; dx < BIOME_PERIOD; dx++) {
                for (let dz = 0; dz < BIOME_PERIOD; dz++) {
                    expect(biomeAt(bandX + dx, bandZ + dz)).toBe(ref);
                }
            }
        });
    });

    describe('biome factors', () => {
        it('density/scale factors are positive and biome-ordered', () => {
            for (const b of ALL_BIOMES) {
                expect(biomeDensityFactor(b)).toBeGreaterThan(0);
                expect(biomeScaleFactor(b)).toBeGreaterThan(0);
            }
            // OVERGROWN denser/taller than SPARSE; RIGID neutral.
            expect(biomeDensityFactor('OVERGROWN')).toBeGreaterThan(biomeDensityFactor('SPARSE'));
            expect(biomeScaleFactor('OVERGROWN')).toBeGreaterThan(biomeScaleFactor('SPARSE'));
            expect(biomeDensityFactor('RIGID')).toBe(1.0);
            expect(biomeScaleFactor('RIGID')).toBe(1.0);
        });
    });

    describe('layoutAt', () => {
        const VALID_LAYOUTS = new Set<LayoutMode>(['SCATTER', 'CLUSTER', 'AXIAL_STREET']);

        it('should be deterministic for the same chunk and room', () => {
            expect(layoutAt(4, 9, RoomType.IN_BETWEEN)).toBe(layoutAt(4, 9, RoomType.IN_BETWEEN));
        });

        it('should always return a valid layout mode', () => {
            for (const room of [...ALL_ROOMS, undefined]) {
                for (let cx = -20; cx <= 20; cx++) {
                    for (let cz = -20; cz <= 20; cz++) {
                        expect(VALID_LAYOUTS.has(layoutAt(cx, cz, room))).toBe(true);
                    }
                }
            }
        });

        it('fORCED_ALIGNMENT always scatters (composition handled by its grid)', () => {
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    expect(layoutAt(cx, cz, RoomType.FORCED_ALIGNMENT)).toBe('SCATTER');
                }
            }
        });

        it('pOLARIZED leans toward axial streets', () => {
            let axial = 0;
            let total = 0;
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    total++;
                    if (layoutAt(cx, cz, RoomType.POLARIZED) === 'AXIAL_STREET')
                        axial++;
                }
            }
            // The lean is real but not absolute (MEDIUM aggressiveness).
            expect(axial / total).toBeGreaterThan(0.4);
        });
    });

    describe('applyLayout', () => {
        const HALF = 30;

        it('sCATTER returns the raw position unchanged (legacy preserved)', () => {
            const r = applyLayout('SCATTER', 12.5, -7.25, 3, 4, 2, HALF);
            expect(r.x).toBe(12.5);
            expect(r.z).toBe(-7.25);
        });

        it('is deterministic for the same inputs', () => {
            const a = applyLayout('CLUSTER', 5, 6, 1, 2, 3, HALF);
            const b = applyLayout('CLUSTER', 5, 6, 1, 2, 3, HALF);
            expect(a).toEqual(b);
        });

        it('cLUSTER pulls a building closer to a shared focal point', () => {
            // Two buildings with very different raw positions should end up closer
            // together than they started (pulled toward the same focus).
            const cx = 9;
            const cz = -2;
            const rawA = { x: -HALF, z: -HALF };
            const rawB = { x: HALF, z: HALF };
            const a = applyLayout('CLUSTER', rawA.x, rawA.z, cx, cz, 0, HALF);
            const b = applyLayout('CLUSTER', rawB.x, rawB.z, cx, cz, 1, HALF);
            const rawDist = Math.hypot(rawA.x - rawB.x, rawA.z - rawB.z);
            const newDist = Math.hypot(a.x - b.x, a.z - b.z);
            expect(newDist).toBeLessThan(rawDist);
        });

        it('aXIAL_STREET collapses one axis toward a shared line', () => {
            const cx = 2;
            const cz = 5;
            const a = applyLayout('AXIAL_STREET', -20, -20, cx, cz, 0, HALF);
            const b = applyLayout('AXIAL_STREET', 20, 20, cx, cz, 1, HALF);
            // Whichever axis is the cross-axis, both buildings share it within the
            // small per-building jitter (|delta| <= 3), so they line up on a street.
            const dx = Math.abs(a.x - b.x);
            const dz = Math.abs(a.z - b.z);
            expect(Math.min(dx, dz)).toBeLessThanOrEqual(6);
        });
    });

    describe('subPaletteIndex', () => {
        it('should be deterministic and in range', () => {
            for (const biome of ALL_BIOMES) {
                for (let cx = -30; cx <= 30; cx++) {
                    for (let cz = -30; cz <= 30; cz++) {
                        const idx = subPaletteIndex(biome, cx, cz);
                        expect(idx).toBe(subPaletteIndex(biome, cx, cz));
                        expect(idx).toBeGreaterThanOrEqual(0);
                        expect(idx).toBeLessThan(SUB_PALETTE_COUNT);
                    }
                }
            }
        });

        it('biases OVERGROWN lighter and SPARSE darker on average', () => {
            let lightSum = 0;
            let darkSum = 0;
            let n = 0;
            for (let cx = -30; cx <= 30; cx++) {
                for (let cz = -30; cz <= 30; cz++) {
                    lightSum += subPaletteIndex('OVERGROWN', cx, cz);
                    darkSum += subPaletteIndex('SPARSE', cx, cz);
                    n++;
                }
            }
            // Lower index = lighter tint; OVERGROWN should average lighter.
            expect(lightSum / n).toBeLessThan(darkSum / n);
        });
    });

    describe('anomalyAt', () => {
        const VALID_ANOMALIES = new Set<AnomalyKind>(['COLOSSUS', 'SPIKE_GRID', 'TREE_RING']);

        it('should be deterministic for the same chunk and room', () => {
            expect(anomalyAt(13, 21, RoomType.IN_BETWEEN)).toBe(anomalyAt(13, 21, RoomType.IN_BETWEEN));
        });

        it('is genuinely rare (well under 5% of chunks)', () => {
            let anomalies = 0;
            let total = 0;
            for (let cx = -120; cx <= 120; cx++) {
                for (let cz = -120; cz <= 120; cz++) {
                    total++;
                    if (anomalyAt(cx, cz, RoomType.INFO_OVERFLOW) !== null)
                        anomalies++;
                }
            }
            const ratio = anomalies / total;
            // Some exist...
            expect(anomalies).toBeGreaterThan(0);
            // ...but the gate (~1 - ANOMALY_THRESHOLD) keeps them rare.
            expect(ratio).toBeLessThan(0.05);
            // Sanity: the empirical rate is near the gate complement.
            expect(ratio).toBeLessThan((1 - ANOMALY_THRESHOLD) * 2);
        });

        it('only ever returns a valid kind or null', () => {
            for (const room of [...ALL_ROOMS, undefined]) {
                for (let cx = -120; cx <= 120; cx += 1) {
                    for (let cz = -120; cz <= 120; cz += 1) {
                        const a = anomalyAt(cx, cz, room);
                        if (a !== null)
                            expect(VALID_ANOMALIES.has(a)).toBe(true);
                    }
                }
            }
        });

        it('never produces TREE_RING in POLARIZED or FORCED_ALIGNMENT (Phase 2 no-tree ban)', () => {
            for (const room of [RoomType.POLARIZED, RoomType.FORCED_ALIGNMENT]) {
                for (let cx = -200; cx <= 200; cx++) {
                    for (let cz = -200; cz <= 200; cz++) {
                        expect(anomalyAt(cx, cz, room)).not.toBe('TREE_RING');
                    }
                }
            }
        });
    });
});
