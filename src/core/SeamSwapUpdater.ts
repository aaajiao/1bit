import type * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { RoomType } from '../world/RoomConfig';

/**
 * POLARIZED seam-swap driver (scene-richness batch): mirrors CableUplinkUpdater's
 * shape — fed the per-frame player position, it drives ChunkManager.updateSeamSwap
 * only where it matters. The seam split (solid 'us' vs wireframe 'them') is the
 * room's whole binary; this makes it legible that the split is a matter of WHERE
 * YOU STAND. On the seam line, near-seam buildings flicker into the other
 * faction's language; step off and the world snaps back to hard us/them.
 *
 * Kept in its own file (one system per file) rather than folded into
 * CableUplinkUpdater — they share only the near-player scan shape. The pass is
 * skipped entirely unless the player is in POLARIZED; a single trailing frame
 * on exit re-polarizes any shells still showing near the player.
 *
 * black = the system, white = the self, dither = the friction between them —
 * here the friction is literal, both languages flickering into each other
 * exactly on the dividing line.
 */
export class SeamSwapUpdater {
    // Whether the player was in POLARIZED last frame — lets the non-POLARIZED
    // state skip the scan after one trailing reset pass hides any lit shells.
    private wasActive: boolean = false;

    /**
     * @param time - Elapsed seconds (marches the flicker square wave).
     * @param playerPos - Player world position.
     * @param chunkManager - Owns the near-seam shells scanned around the player.
     * @param currentRoomType - The player's room this frame.
     */
    update(time: number, playerPos: THREE.Vector3, chunkManager: ChunkManager, currentRoomType: RoomType): void {
        const active = currentRoomType === RoomType.POLARIZED;

        // Fully static outside POLARIZED: once the last active frame has been
        // reset (active=false, wasActive=true forces every near shell hidden),
        // skip the scan until the player steps back onto a seam.
        if (!active && !this.wasActive)
            return;

        chunkManager.updateSeamSwap(playerPos, time, active);
        this.wasActive = active;
    }

    /** Reset internal state. Shells are owned/disposed by ChunkManager. */
    dispose(): void {
        this.wasActive = false;
    }
}
