import { describe, expect, it } from 'vitest';
import { PERFORMANCE, WORLD } from '../src/config';
import { RIFT_PHYSICS } from '../src/config/physics';
import {
    chunkToCluster,
    DEFAULT_ROOM_FOG,
    FA_RIFT,
    getRoomTypeForCluster,
    getRoomTypeFromPosition,
    IN_BETWEEN_EDGE_GHOSTS,
    inBetweenEdgeFactor,
    isWithinRiftClearance,
    lerpRoomShaderConfig,
    riftLineXForWorldX,
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

        it('should map the hash buckets (drawn per CLUSTER) to the documented thresholds', () => {
            // Re-derive the same hash the implementation uses — over CLUSTER
            // coordinates — and assert the bucket boundaries (<0.25, <0.5,
            // <0.75, else) hold for every chunk via its cluster.
            for (let cx = -15; cx <= 15; cx++) {
                for (let cz = -15; cz <= 15; cz++) {
                    const clusterX = chunkToCluster(cx);
                    const clusterZ = chunkToCluster(cz);
                    const hash = Math.abs(Math.sin(clusterX * 12.9898 + clusterZ * 78.233) * 43758.5453) % 1;
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

        it('should give all chunks of one cluster the same room (2x2 grouping)', () => {
            const cc = WORLD.CLUSTER_CHUNKS;
            for (const k of [-4, -1, 0, 3]) {
                for (const m of [-2, 0, 5]) {
                    const expected = getRoomTypeForCluster(k, m);
                    for (let ix = 0; ix < cc; ix++) {
                        for (let iz = 0; iz < cc; iz++) {
                            expect(getRoomTypeFromPosition(k * cc + ix, m * cc + iz)).toBe(expected);
                        }
                    }
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

    // Flow-audit enhancement #14 — boundary-bound z-fight densification,
    // measured against the CLUSTER footprint edge (rooms are 2x2 chunks).
    describe('inBetweenEdgeFactor', () => {
        const S = WORLD.CHUNK_SIZE; // 80
        const HALF_CLUSTER = (S * WORLD.CLUSTER_CHUNKS) / 2; // 80
        // Chunk (0,0) is the low-x/low-z chunk of cluster (0,0): its center
        // sits at cluster-local (-S/2, -S/2), so its OUTER cluster edges are
        // the -x/-z sides and its +x/+z sides are inner chunk seams.
        const innerOffset = S / 2; // chunk (0,0) center offset from cluster center

        it('returns 0 deep in the cluster interior (original ghost behavior)', () => {
            expect(inBetweenEdgeFactor(0, 0, 0, 0)).toBe(0);
            expect(inBetweenEdgeFactor(10, -10, 0, 0)).toBe(0);
        });

        it('stays 0 at the INNER chunk seams of a cluster (not a room boundary)', () => {
            // Chunk (0,0)'s +x edge (chunk-local +30, the closest a building
            // gets) faces chunk (1,0) of the SAME cluster: calm by design.
            expect(inBetweenEdgeFactor(30, 0, 0, 0)).toBe(0);
            expect(inBetweenEdgeFactor(0, 30, 0, 0)).toBe(0);
            // Mirror case: chunk (1,1)'s -x/-z edges face its own cluster.
            expect(inBetweenEdgeFactor(-30, 0, 1, 1)).toBe(0);
            expect(inBetweenEdgeFactor(0, -30, 1, 1)).toBe(0);
        });

        it('saturates to 1 within INNER_DISTANCE of the cluster footprint edge', () => {
            // Cluster-local saturation line: HALF_CLUSTER - INNER, on the -x
            // side of chunk (0,0): chunk-local -(HALF_CLUSTER - INNER) + innerOffset.
            const atInner = -(HALF_CLUSTER - IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE) + innerOffset;
            expect(inBetweenEdgeFactor(atInner, 0, 0, 0)).toBe(1);
            expect(inBetweenEdgeFactor(0, atInner - 1, 0, 0)).toBe(1);
            // And on the +x side of the high chunk (1,0) of the same cluster.
            expect(inBetweenEdgeFactor(-atInner, 0, 1, 0)).toBe(1);
        });

        it('ramps monotonically between OUTER_DISTANCE and INNER_DISTANCE of the cluster edge', () => {
            const { INNER_DISTANCE, OUTER_DISTANCE } = IN_BETWEEN_EDGE_GHOSTS;
            let prev = -1;
            for (let dist = OUTER_DISTANCE; dist >= INNER_DISTANCE; dist -= 1) {
                // Chunk-local x of a point `dist` from the -x cluster edge.
                const localX = -(HALF_CLUSTER - dist) + innerOffset;
                const f = inBetweenEdgeFactor(localX, 0, 0, 0);
                expect(f).toBeGreaterThanOrEqual(prev);
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThanOrEqual(1);
                prev = f;
            }
            expect(prev).toBe(1);
        });

        it('uses the Chebyshev metric (either axis near the cluster edge densifies)', () => {
            const nearEdge = -(HALF_CLUSTER - IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE) + innerOffset;
            expect(inBetweenEdgeFactor(nearEdge, 0, 0, 0)).toBe(inBetweenEdgeFactor(0, nearEdge, 0, 0));
        });

        it('is continuous in negative-coordinate clusters too', () => {
            // Chunk (-2,-2) is the low chunk of cluster (-1,-1); chunk (-1,-1)
            // is its high chunk. Same geometry as the positive case.
            const atInner = -(HALF_CLUSTER - IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE) + innerOffset;
            expect(inBetweenEdgeFactor(atInner, 0, -2, -2)).toBe(1);
            expect(inBetweenEdgeFactor(-atInner, 0, -1, -2)).toBe(1);
            expect(inBetweenEdgeFactor(30, 0, -2, -2)).toBe(0); // inner seam calm
        });

        it('the band is reachable by actual building placements (|local| <= 30)', () => {
            // Building positions are bounded to ±(CHUNK_SIZE-20)/2 = ±30 of
            // their CHUNK; in the cluster's outer band the closest approach to
            // the cluster edge is HALF_CLUSTER - innerOffset - 30 = 10m, so the
            // saturation line must lie inside that bound or the band is dead.
            const layoutHalf = (S - 20) / 2;
            const minReachableEdgeDist = HALF_CLUSTER - innerOffset - layoutHalf;
            expect(minReachableEdgeDist).toBeLessThanOrEqual(IN_BETWEEN_EDGE_GHOSTS.INNER_DISTANCE);
            // And the interior must still contain a zero-factor region.
            expect(inBetweenEdgeFactor(0, 0, 0, 0)).toBe(0);
        });
    });

    // Rift presence — the FA shore corridor gate + the FA_RIFT knob contracts.
    describe('isWithinRiftClearance (FA shore corridor)', () => {
        // Use a few different columns (positive and negative x) so the gate
        // is exercised against more than one rift line.
        const riftLines = [0, 200, -300].map(x => riftLineXForWorldX(x));

        it('is true ON the rift line and strictly inside the clearance', () => {
            for (const line of riftLines) {
                expect(isWithinRiftClearance(line)).toBe(true);
                expect(isWithinRiftClearance(line + FA_RIFT.CLEARANCE - 0.01)).toBe(true);
                expect(isWithinRiftClearance(line - FA_RIFT.CLEARANCE + 0.01)).toBe(true);
            }
        });

        it('is false AT the clearance boundary (buildings may sit exactly on it)', () => {
            for (const line of riftLines) {
                expect(isWithinRiftClearance(line + FA_RIFT.CLEARANCE)).toBe(false);
                expect(isWithinRiftClearance(line - FA_RIFT.CLEARANCE)).toBe(false);
            }
        });

        it('is false deep on either bank', () => {
            for (const line of riftLines) {
                expect(isWithinRiftClearance(line + 30)).toBe(false);
                expect(isWithinRiftClearance(line - 30)).toBe(false);
            }
        });

        it('repeats the corridor for EVERY chunk column (one crack per 80m)', () => {
            for (const line of riftLines) {
                // The next column's crack has its own corridor…
                expect(isWithinRiftClearance(line + WORLD.CHUNK_SIZE)).toBe(true);
                expect(isWithinRiftClearance(line - WORLD.CHUNK_SIZE)).toBe(true);
                // …and the midline between two cracks stays buildable.
                expect(isWithinRiftClearance(line + WORLD.CHUNK_SIZE / 2)).toBe(false);
            }
        });

        it('leaves a buildable band on each flank of a column (corridor < layout bound)', () => {
            // Building positions are bounded to ±(CHUNK_SIZE-20)/2 = ±30 of a
            // chunk center; the corridor (±12) must leave real room outside it
            // or FA chunks could never place a single building.
            const layoutHalf = (WORLD.CHUNK_SIZE - 20) / 2;
            expect(FA_RIFT.CLEARANCE).toBeLessThan(layoutHalf);
        });
    });

    describe('fa rift knob contracts (FA_RIFT)', () => {
        it('keeps the corridor wider than the physical crack', () => {
            expect(FA_RIFT.CLEARANCE).toBeGreaterThan(RIFT_PHYSICS.crackHalfWidth);
        });

        it('orders the fog column heights (bottom < dense top < leak top)', () => {
            const { BOTTOM, DENSE_TOP, LEAK_TOP, LEAK_FRACTION, LEAK_SCALE } = FA_RIFT.FOG;
            expect(BOTTOM).toBeLessThan(DENSE_TOP);
            expect(DENSE_TOP).toBeLessThan(LEAK_TOP);
            expect(LEAK_FRACTION).toBeGreaterThan(0);
            expect(LEAK_FRACTION).toBeLessThan(1);
            expect(LEAK_SCALE).toBeGreaterThanOrEqual(1);
        });

        it('keeps the void tear translucent and rising out of the crack', () => {
            const { HEIGHT, BASE_Y, OPACITY } = FA_RIFT.TEAR;
            expect(BASE_Y).toBeLessThan(0);
            expect(HEIGHT).toBeGreaterThan(0);
            expect(OPACITY).toBeGreaterThan(0);
            expect(OPACITY).toBeLessThan(1);
        });

        it('tunes the banner droop to a taut sub-metre sag over the corridor span', () => {
            // CableSystem sag formula: droop - span * 0.1, clamped at 0.
            const span = 2 * FA_RIFT.CLEARANCE;
            const sag = Math.max(0, FA_RIFT.BANNER.DROOP - span * 0.1);
            expect(sag).toBeGreaterThanOrEqual(0);
            expect(sag).toBeLessThan(1);
            // And the banners hang above head height even at full sag + tremble.
            expect(FA_RIFT.BANNER.HEIGHT_BASE - sag - FA_RIFT.BANNER.TREMBLE_AMPLITUDE)
                .toBeGreaterThan(2);
        });
    });
});
