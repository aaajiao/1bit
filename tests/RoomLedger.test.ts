import type { BehaviorProfile, RoomWeights } from '../src/world/RoomConfig';
import { describe, expect, it } from 'vitest';
import {
    BEHAVIOR_ROOM_BIAS,
    biasedRoomWeights,
    clusterRoomRandom,
    getRoomTypeForCluster,
    getRoomTypeFromPosition,
    NEUTRAL_ROOM_WEIGHTS,
    pickRoomFromWeights,
    ROOM_PICK_ORDER,
    RoomType,
} from '../src/world/RoomConfig';
import { RoomLedger } from '../src/world/RoomLedger';

// Behavior fixtures: one extreme per mirror axis (plus the do-nothing run).
const NEUTRAL_PROFILE: BehaviorProfile = {
    avgFlower: 0.5,
    gazeRatio: 0,
    overrideActivity: 0,
    crackAffinity: 0,
};
const SUPPRESSED: BehaviorProfile = { ...NEUTRAL_PROFILE, avgFlower: 0 };
const EXPRESSIVE: BehaviorProfile = { ...NEUTRAL_PROFILE, avgFlower: 1 };
const GAZER: BehaviorProfile = { ...NEUTRAL_PROFILE, gazeRatio: 1 };
const OVERRIDER: BehaviorProfile = { ...NEUTRAL_PROFILE, overrideActivity: 1 };
const CRACK_WALKER: BehaviorProfile = { ...NEUTRAL_PROFILE, crackAffinity: 1 };

const ALL_ROOMS = Object.values(RoomType);

/** Fraction of clusters in a grid the ledger assigns to `room` under `profile`. */
function roomShare(profile: BehaviorProfile | null, room: RoomType, half = 30): number {
    const ledger = new RoomLedger();
    ledger.setProfile(profile);
    let hits = 0;
    let total = 0;
    for (let x = -half; x < half; x++) {
        for (let z = -half; z < half; z++) {
            if (ledger.getRoomTypeForCluster(x, z) === room)
                hits++;
            total++;
        }
    }
    return hits / total;
}

describe('roomLedger (F1 "the world reads you")', () => {
    describe('weight table validity (BEHAVIOR_ROOM_BIAS / biasedRoomWeights)', () => {
        it('keeps the pick order a permutation of all four rooms', () => {
            expect([...ROOM_PICK_ORDER].sort()).toEqual([...ALL_ROOMS].sort());
        });

        it('keeps the neutral weights all-1 and the GAIN table total', () => {
            for (const room of ALL_ROOMS) {
                expect(NEUTRAL_ROOM_WEIGHTS[room]).toBe(1);
                expect(BEHAVIOR_ROOM_BIAS.GAIN[room]).toBeGreaterThan(0);
            }
        });

        it('keeps the bias gentle: MAX_MULT at most x2', () => {
            expect(BEHAVIOR_ROOM_BIAS.MAX_MULT).toBeGreaterThan(1);
            expect(BEHAVIOR_ROOM_BIAS.MAX_MULT).toBeLessThanOrEqual(2);
        });

        it('keeps the flower deadzone inside the pivot range', () => {
            const { FLOWER_PIVOT, FLOWER_DEADZONE } = BEHAVIOR_ROOM_BIAS;
            expect(FLOWER_PIVOT - FLOWER_DEADZONE).toBeGreaterThan(0);
            expect(FLOWER_PIVOT + FLOWER_DEADZONE).toBeLessThan(1);
            expect(BEHAVIOR_ROOM_BIAS.GAZE_SATURATION).toBeGreaterThan(0);
        });

        it('returns the neutral weights for a null (unformed) profile', () => {
            expect(biasedRoomWeights(null)).toEqual(NEUTRAL_ROOM_WEIGHTS);
        });

        it('returns the neutral weights for the do-nothing profile (deadzone)', () => {
            expect(biasedRoomWeights(NEUTRAL_PROFILE)).toEqual(NEUTRAL_ROOM_WEIGHTS);
        });

        it('clamps every weight to [1, MAX_MULT] for extreme/out-of-range profiles', () => {
            const extremes: BehaviorProfile[] = [
                SUPPRESSED,
                EXPRESSIVE,
                GAZER,
                OVERRIDER,
                CRACK_WALKER,
                { avgFlower: -5, gazeRatio: 9, overrideActivity: 9, crackAffinity: 9 },
                { avgFlower: 9, gazeRatio: -1, overrideActivity: -1, crackAffinity: -1 },
            ];
            for (const profile of extremes) {
                const weights = biasedRoomWeights(profile);
                for (const room of ALL_ROOMS) {
                    expect(weights[room]).toBeGreaterThanOrEqual(1);
                    expect(weights[room]).toBeLessThanOrEqual(BEHAVIOR_ROOM_BIAS.MAX_MULT);
                }
            }
        });

        it('maps each behavior axis to its room (and only its room)', () => {
            const axes: Array<[BehaviorProfile, RoomType]> = [
                [SUPPRESSED, RoomType.POLARIZED],
                [EXPRESSIVE, RoomType.INFO_OVERFLOW],
                [GAZER, RoomType.FORCED_ALIGNMENT],
                [OVERRIDER, RoomType.IN_BETWEEN],
                [CRACK_WALKER, RoomType.IN_BETWEEN],
            ];
            for (const [profile, target] of axes) {
                const weights = biasedRoomWeights(profile);
                expect(weights[target]).toBeGreaterThan(1);
                for (const room of ALL_ROOMS) {
                    if (room !== target)
                        expect(weights[room]).toBe(1);
                }
            }
        });
    });

    describe('pickRoomFromWeights', () => {
        it('reproduces the historical quartile thresholds under neutral weights', () => {
            const cases: Array<[number, RoomType]> = [
                [0, RoomType.INFO_OVERFLOW],
                [0.2499, RoomType.INFO_OVERFLOW],
                [0.25, RoomType.FORCED_ALIGNMENT],
                [0.4999, RoomType.FORCED_ALIGNMENT],
                [0.5, RoomType.IN_BETWEEN],
                [0.7499, RoomType.IN_BETWEEN],
                [0.75, RoomType.POLARIZED],
                [0.9999, RoomType.POLARIZED],
            ];
            for (const [r, expected] of cases) {
                expect(pickRoomFromWeights(r, NEUTRAL_ROOM_WEIGHTS)).toBe(expected);
            }
        });

        it('always returns a valid room for any r and any biased weights', () => {
            const valid = new Set(ALL_ROOMS);
            const weightSets: RoomWeights[] = [
                NEUTRAL_ROOM_WEIGHTS,
                biasedRoomWeights(SUPPRESSED),
                biasedRoomWeights(GAZER),
            ];
            for (const weights of weightSets) {
                for (let r = 0; r < 1; r += 0.01) {
                    expect(valid.has(pickRoomFromWeights(r, weights))).toBe(true);
                }
            }
        });

        it('shifts the boundary in the biased room favor (monotone over r)', () => {
            // POLARIZED doubled: its share of the [0,1) line grows from the
            // top quartile to the top 2/5 — r=0.65 flips IN_BETWEEN -> POLARIZED.
            const weights = biasedRoomWeights(SUPPRESSED);
            expect(pickRoomFromWeights(0.65, NEUTRAL_ROOM_WEIGHTS)).toBe(RoomType.IN_BETWEEN);
            expect(pickRoomFromWeights(0.65, weights)).toBe(RoomType.POLARIZED);
        });
    });

    describe('neutral consistency (no profile => the pure functions exactly)', () => {
        it('matches getRoomTypeForCluster on every cluster before any profile', () => {
            const ledger = new RoomLedger();
            for (let x = -15; x <= 15; x++) {
                for (let z = -15; z <= 15; z++) {
                    expect(ledger.getRoomTypeForCluster(x, z)).toBe(getRoomTypeForCluster(x, z));
                }
            }
        });

        it('matches getRoomTypeForCluster after an explicit null profile feed', () => {
            const ledger = new RoomLedger();
            ledger.setProfile(null);
            for (let x = -12; x <= 12; x++) {
                for (let z = -12; z <= 12; z++) {
                    expect(ledger.getRoomTypeForCluster(x, z)).toBe(getRoomTypeForCluster(x, z));
                }
            }
        });

        it('matches getRoomTypeFromPosition chunk-wise (cluster inheritance)', () => {
            const ledger = new RoomLedger();
            for (let cx = -20; cx <= 20; cx++) {
                for (let cz = -20; cz <= 20; cz++) {
                    expect(ledger.getRoomTypeForChunk(cx, cz)).toBe(getRoomTypeFromPosition(cx, cz));
                }
            }
        });
    });

    describe('pin invariance (visited terrain never changes its face)', () => {
        it('keeps neutral-era assignments after a strong profile arrives', () => {
            const ledger = new RoomLedger();
            const before = new Map<string, RoomType>();
            for (let x = -10; x <= 10; x++) {
                for (let z = -10; z <= 10; z++) {
                    before.set(`${x},${z}`, ledger.getRoomTypeForCluster(x, z));
                }
            }

            ledger.setProfile(SUPPRESSED);
            for (let x = -10; x <= 10; x++) {
                for (let z = -10; z <= 10; z++) {
                    expect(ledger.getRoomTypeForCluster(x, z)).toBe(before.get(`${x},${z}`));
                }
            }
        });

        it('keeps biased-era assignments after the profile resets to null', () => {
            const ledger = new RoomLedger();
            ledger.setProfile(SUPPRESSED);
            const before = new Map<string, RoomType>();
            for (let x = -10; x <= 10; x++) {
                for (let z = -10; z <= 10; z++) {
                    before.set(`${x},${z}`, ledger.getRoomTypeForCluster(x, z));
                }
            }

            ledger.setProfile(null);
            for (let x = -10; x <= 10; x++) {
                for (let z = -10; z <= 10; z++) {
                    expect(ledger.getRoomTypeForCluster(x, z)).toBe(before.get(`${x},${z}`));
                }
            }
        });

        it('pins via chunk queries too: all four chunks of a cluster agree across a profile flip', () => {
            const ledger = new RoomLedger();
            // Pin cluster (3, 4) via one of its chunks under the neutral era.
            const first = ledger.getRoomTypeForChunk(6, 8);
            ledger.setProfile(SUPPRESSED);
            for (const [cx, cz] of [[6, 8], [7, 8], [6, 9], [7, 9]] as const) {
                expect(ledger.getRoomTypeForChunk(cx, cz)).toBe(first);
            }
            expect(ledger.getRoomTypeForCluster(3, 4)).toBe(first);
        });
    });

    describe('bias flows through new clusters (the mirror actually tilts)', () => {
        it('assigns a divergent cluster the BIASED pick, not the neutral one', () => {
            // Find a cluster whose hash draw lands where the suppressed
            // weights flip the room relative to neutral.
            const biased = biasedRoomWeights(SUPPRESSED);
            const findDivergent = (): { x: number; z: number } | null => {
                for (let x = -40; x <= 40; x++) {
                    for (let z = -40; z <= 40; z++) {
                        const r = clusterRoomRandom(x, z);
                        if (pickRoomFromWeights(r, biased) !== pickRoomFromWeights(r, NEUTRAL_ROOM_WEIGHTS))
                            return { x, z };
                    }
                }
                return null;
            };
            const found = findDivergent();
            expect(found).not.toBeNull();

            const ledger = new RoomLedger();
            ledger.setProfile(SUPPRESSED);
            const r = clusterRoomRandom(found!.x, found!.z);
            expect(ledger.getRoomTypeForCluster(found!.x, found!.z)).toBe(pickRoomFromWeights(r, biased));
            expect(ledger.getRoomTypeForCluster(found!.x, found!.z))
                .not
                .toBe(getRoomTypeForCluster(found!.x, found!.z));
        });

        it('raises the POLARIZED share significantly under a suppressed profile', () => {
            const neutralShare = roomShare(null, RoomType.POLARIZED);
            const biasedShare = roomShare(SUPPRESSED, RoomType.POLARIZED);
            // Neutral ~= 0.25; doubled weight => ~2/5 = 0.4 over 3600 clusters.
            expect(neutralShare).toBeGreaterThan(0.15);
            expect(neutralShare).toBeLessThan(0.35);
            expect(biasedShare).toBeGreaterThan(neutralShare + 0.08);
        });

        it('tilts each axis toward its room at the distribution level', () => {
            const axes: Array<[BehaviorProfile, RoomType]> = [
                [EXPRESSIVE, RoomType.INFO_OVERFLOW],
                [GAZER, RoomType.FORCED_ALIGNMENT],
                [OVERRIDER, RoomType.IN_BETWEEN],
            ];
            for (const [profile, room] of axes) {
                expect(roomShare(profile, room)).toBeGreaterThan(roomShare(null, room) + 0.05);
            }
        });
    });
});
