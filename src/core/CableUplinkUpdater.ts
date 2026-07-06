import type * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { updateCableUplinkUniforms, uplinkFlowerBoost } from '../world/CableSystem';

/**
 * Cable uplink driver (scene-richness batch): mirrors the cable-audio proximity
 * path — fed the per-frame player position — but reports the player's LIGHT
 * rather than sound. When the flower burns past CABLE_UPLINK.FLOWER_THRESHOLD,
 * cables near the player carry hard 1-bit dashes toward the sky eye; brighter
 * flower = faster, denser pulses. Kept in its own file (not folded into
 * CableAudioUpdater) to honor one-system-per-file — audio and visual uplink are
 * distinct concerns that only share the near-chunk proximity shape.
 *
 * black = the system, white = the self; this makes the invisible rule
 * "brighter = seen by authority" a literal line of light travelling down the
 * wires toward the eye.
 */
export class CableUplinkUpdater {
    // Whether cables were lit last frame — lets the dim state skip the scan
    // entirely after a single trailing reset pass (see update()).
    private wasActive: boolean = false;

    /**
     * @param time - Elapsed seconds (marches the dash phase).
     * @param playerPos - Player world position.
     * @param chunkManager - Owns the cables scanned near the player.
     * @param flowerIntensity - Player flower intensity in [0,1].
     */
    update(time: number, playerPos: THREE.Vector3, chunkManager: ChunkManager, flowerIntensity: number): void {
        const boost = uplinkFlowerBoost(flowerIntensity);
        const active = boost > 0;

        // Fully static while dim: once the last active frame has been reset,
        // skip the scan. The trailing reset pass (active=false, wasActive=true)
        // returns any still-lit cables near the player to the base material.
        if (!active && !this.wasActive)
            return;

        // Toggle first (lazily creates the shared uplink material on the first
        // swap), then push this frame's speed/density onto it.
        chunkManager.updateCableUplink(playerPos, active);
        updateCableUplinkUniforms(time, boost);
        this.wasActive = active;
    }

    /**
     * Reset internal state. The shared uplink material itself is owned and
     * disposed by ChunkManager (disposeCableUplinkMaterial).
     */
    dispose(): void {
        this.wasActive = false;
    }
}
