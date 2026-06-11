import type * as THREE from 'three';
import type { AudioController } from '../audio/AudioController';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { ChunkManager } from '../world/ChunkManager';
import type { RoomFogConfig } from '../world/RoomConfig';
import { GAMEPLAY } from '../config';
import { RiftMechanic } from '../world/RiftMechanic';
import { ROOM_FOG, RoomType, stepFogToward } from '../world/RoomConfig';

/**
 * Per-frame room-flow wiring: detects room transitions (ambient retune via
 * AudioController.onRoomChange + FORCED_ALIGNMENT rift cleanup) and runs the
 * per-room mechanics (rift physics, INFO_OVERFLOW chirps, the per-room fog
 * horizon). Owns the previous-room memory and the RiftMechanic instance.
 */
export class RoomFlowUpdater {
    private previousRoomType: RoomType | null = null;
    private readonly riftMechanic = new RiftMechanic();

    /**
     * @param fog - The live scene fog (THREE.Fog satisfies the shape), eased
     *   toward the current room's ROOM_FOG target every frame (flow-audit
     *   enhancement #12: INFO_OVERFLOW's near noise horizon). Null disables
     *   the fog response (e.g. tests).
     */
    constructor(private readonly fog: RoomFogConfig | null = null) {}

    /**
     * Room the player was attributed to as of the last update (null before
     * the first frame). main.ts feeds this into the player update as the room
     * context for the CURRENT frame — one frame stale by design, because the
     * fixed update order runs the player before the room attribution.
     */
    getRoomType(): RoomType | null {
        return this.previousRoomType;
    }

    /**
     * Detect room transitions and run per-room mechanics.
     * Must run AFTER ChunkManager.updatePlayerRoom for this frame.
     * @returns The player's current room type.
     */
    update(
        delta: number,
        playerState: PlayerState,
        playerPos: THREE.Vector3,
        chunkManager: ChunkManager,
        player: PlayerManager,
        audio: AudioController,
    ): RoomType {
        const currentRoomType = chunkManager.getCurrentRoomType();

        // Handle room transitions
        if (currentRoomType !== this.previousRoomType) {
            console.log(`[Room Transition] ${this.previousRoomType} -> ${currentRoomType}`);
            const roomConfig = chunkManager.getCurrentRoomConfig();
            audio.onRoomChange(this.previousRoomType, currentRoomType, roomConfig.audio);

            // Cleanup previous room effects if needed
            if (this.previousRoomType === RoomType.FORCED_ALIGNMENT) {
                this.riftMechanic.onExit(player, audio);
            }

            this.previousRoomType = currentRoomType;
        }

        // Per-room fog horizon (flow-audit enhancement #12): ease the scene
        // fog toward the current room's target — INFO_OVERFLOW pulls the far
        // world into a ~45m noise horizon, every other room releases it back
        // to the global default. Frame-rate independent (delta-scaled).
        if (this.fog) {
            stepFogToward(this.fog, ROOM_FOG[currentRoomType], delta);
        }

        // Per-room mechanics
        if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
            this.riftMechanic.update(player, audio, playerPos);
        }
        else if (
            currentRoomType === RoomType.INFO_OVERFLOW
            // INFO_CHIRP_PROBABILITY is a per-FRAME value; treat (value * 60) as a
            // per-SECOND rate and scale by delta so the chirp cadence is
            // frame-rate independent (reproduces the old ~2%/frame at 60fps).
            // The flower multiplier (flow-audit break #8) makes a brighter
            // flower chirp more often (0.5x dim -> 2x blazing).
            && Math.random() < GAMEPLAY.INFO_CHIRP_PROBABILITY * 60 * delta
            * (GAMEPLAY.INFO_CHIRP_FLOWER_PROB_FLOOR
                + playerState.flowerIntensity * GAMEPLAY.INFO_CHIRP_FLOWER_PROB_GAIN)
        ) {
            audio.playInfoChirp(playerState.flowerIntensity);
        }

        return currentRoomType;
    }

    dispose(): void {
        this.riftMechanic.dispose();
    }
}
