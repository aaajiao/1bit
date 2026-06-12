// 1-bit Chimera Void - Room Ledger (F1 "the world reads you")
// Session ledger of cluster -> room assignments. The live behavior profile
// gently biases which room a cluster becomes the FIRST time it needs one;
// the result is pinned for the rest of the session, so already-visited
// terrain never changes its face when the player's profile drifts.

import type { BehaviorProfile, RoomType, RoomWeights } from './RoomConfig';
import {
    biasedRoomWeights,
    chunkToCluster,
    clusterRoomRandom,
    pickRoomFromWeights,
} from './RoomConfig';

/**
 * Two guarantees (F1):
 *
 * 1. PIN INVARIANCE — a cluster keeps the room it was first assigned for the
 *    whole session, no matter how the profile evolves afterwards.
 * 2. NEUTRAL CONSISTENCY — until a profile forms (setProfile(null) / never
 *    called), assignments consume the SAME hash draw (clusterRoomRandom) and
 *    the SAME neutral cumulative thresholds as the pure
 *    getRoomTypeForCluster / getRoomTypeFromPosition, so boot-time
 *    generation and the spawn scan are bit-identical to the unbiased world.
 *
 * Not part of the cross-session reproducibility surface: the bias depends on
 * live player behavior by design (only within-session determinism matters).
 */
export class RoomLedger {
    /** clusterKey "x,z" -> the room this cluster was first assigned. */
    private readonly pinned = new Map<string, RoomType>();

    /**
     * Weights consulted when a brand-new cluster needs a room. Neutral until
     * a formed profile arrives (biasedRoomWeights(null) IS the neutral set).
     */
    private weights: RoomWeights = biasedRoomWeights(null);

    /**
     * Feed the latest live behavior profile (low frequency — RoomFlowUpdater
     * calls this about once per second). null means "profile not formed yet"
     * and resets the weights to neutral.
     */
    setProfile(profile: BehaviorProfile | null): void {
        this.weights = biasedRoomWeights(profile);
    }

    /**
     * Room of the cluster containing chunk (cx, cz) — the ledger analogue of
     * getRoomTypeFromPosition (chunks inherit their 2x2 cluster's room).
     */
    getRoomTypeForChunk(cx: number, cz: number): RoomType {
        return this.getRoomTypeForCluster(chunkToCluster(cx), chunkToCluster(cz));
    }

    /**
     * Room of a cluster: the pinned assignment if one exists, otherwise a
     * weighted pick (deterministic cluster hash x current weights), pinned
     * on the spot so every later query agrees.
     */
    getRoomTypeForCluster(clusterX: number, clusterZ: number): RoomType {
        const key = `${clusterX},${clusterZ}`;
        const existing = this.pinned.get(key);
        if (existing !== undefined)
            return existing;

        const room = pickRoomFromWeights(clusterRoomRandom(clusterX, clusterZ), this.weights);
        this.pinned.set(key, room);
        return room;
    }
}
