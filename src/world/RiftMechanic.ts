import type * as THREE from 'three';
import type { PlayerManager } from '../player/PlayerManager';
import type { AudioSystemInterface } from '../types';
import { BINAURAL_SIDE_CONFIG } from '../config/audio';
import { RIFT_PHYSICS } from '../config/physics';
import { CHUNK_SIZE } from './ChunkManager';
import { faSideAxisX, getRoomTypeFromPosition, riftLineXForWorldX, RoomType, worldToChunkCoord } from './RoomConfig';

/**
 * Minimal room-attribution surface RiftMechanic consumes. ChunkManager
 * satisfies it structurally (its ledger-backed getRoomTypeForChunk), so the
 * fall check always agrees with the GENERATED world — including clusters the
 * F1 behavior bias assigned differently from the neutral hash.
 */
export interface RoomTypeSource {
    getRoomTypeForChunk: (cx: number, cz: number) => RoomType;
}

export class RiftMechanic {
    constructor() { }

    /**
     * Update rift logic: check if player is over crack, handle falling and respawning
     *
     * @param player - Player manager (ground level / gravity / teleport).
     * @param audio - Audio system for rift fog/fall/respawn cues.
     * @param cameraPosition - Player world position this frame.
     * @param rooms - Room attribution source (pass the ChunkManager so the
     *   session ledger is consulted). Omitted (tests), falls back to the
     *   neutral pure attribution, which is identical pre-profile.
     */
    public update(
        player: PlayerManager,
        audio: AudioSystemInterface,
        cameraPosition: THREE.Vector3,
        rooms?: RoomTypeSource,
    ): void {
        // PHYSICAL crack: one per FA chunk column, running along the chunk
        // center x (riftLineXForWorldX is the single source of the crack base
        // point, shared with the floor generation and the shore corridor).
        // All physics below — fall, fog proximity, respawn — keys off the
        // NEAREST crack line.
        const crackCenterX = riftLineXForWorldX(cameraPosition.x, CHUNK_SIZE);
        const distFromCenter = Math.abs(cameraPosition.x - crackCenterX);

        // The crack only exists in FORCED_ALIGNMENT clusters. Validate the
        // chunk the player is actually standing on (round convention — the
        // rounded x/z chunk is the one whose floor footprint contains the
        // player by construction; chunks inherit their cluster's room), so the
        // fall can never punch through the intact floor of a neighbouring
        // non-rift cluster.
        const nearestChunkX = worldToChunkCoord(cameraPosition.x, CHUNK_SIZE);
        const nearestChunkZ = worldToChunkCoord(cameraPosition.z, CHUNK_SIZE);
        const roomHere = rooms
            ? rooms.getRoomTypeForChunk(nearestChunkX, nearestChunkZ)
            : getRoomTypeFromPosition(nearestChunkX, nearestChunkZ);
        const isRiftChunk = roomHere === RoomType.FORCED_ALIGNMENT;

        // Binaural beat (flow-audit break #7) — the two rift concepts feed it
        // separately: WHICH side the beat detunes toward comes from the room's
        // SEMANTIC axis (faSideAxisX, the cluster center — negative = tidy
        // left, positive = broken right; siding is a choice about the room,
        // not about the nearest crack), while HOW LOUD it beats comes from the
        // distance to the nearest PHYSICAL crack (each crack carries its own
        // sound field, see BINAURAL_SIDE_CONFIG.fieldWidth).
        audio.updateBinauralPosition(
            cameraPosition.x - faSideAxisX(cameraPosition.x, CHUNK_SIZE),
            distFromCenter,
        );

        // RIFT AUDIO: Fog Sound
        // Start if not already playing (internal check handles redundancy)
        audio.startRiftFog();

        // Intensity based on proximity to the nearest crack (closer = louder);
        // cracks repeat every chunk column, so the fog cue is audible from
        // anywhere in the room and always leads to the closest rift
        const riftProximity = Math.max(0, 1 - distFromCenter / BINAURAL_SIDE_CONFIG.fogAudibleRange);
        audio.updateRiftFog(riftProximity);

        // Crack half-width (meters from center), gated on the chunk actually
        // having a crack (see isRiftChunk above)
        if (isRiftChunk && distFromCenter < RIFT_PHYSICS.crackHalfWidth) {
            // Player is above the crack - infinite fall with low gravity
            player.setGroundLevel(-1000);
            player.setGravity(RIFT_PHYSICS.fallGravity); // Lunar gravity for slow, long fall

            // Trigger fall sound if just started falling
            if (cameraPosition.y < 0 && cameraPosition.y > -5) {
                audio.playRiftFall();
            }
        }
        else {
            // Player is on solid ground
            player.setGroundLevel(2.0);
            player.setGravity(29.4); // Default gravity

            // Safety: Stop fall sound if we stepped out
            audio.stopRiftFall();
        }

        // Fall reset check (Respawn)
        if (cameraPosition.y < RIFT_PHYSICS.respawnHeight) {
            // Calculate safe spawn point (from center, on the side they fell closest to)
            const sign = cameraPosition.x > crackCenterX ? 1 : -1;
            const safeX = crackCenterX + sign * RIFT_PHYSICS.safeSpawnDistance;

            // Teleport back to surface
            player.teleport(safeX, 2.0, cameraPosition.z);

            // Reset gravity immediately
            player.setGravity(29.4);

            // Play respawn sound
            audio.playRiftRespawn();
        }
    }

    /**
     * Clean up interactions when leaving the rift area
     */
    public onExit(player: PlayerManager, audio: AudioSystemInterface): void {
        // Reset ground level and gravity
        player.setGroundLevel(2.0);
        player.setGravity(29.4);

        // Stop rift fog
        audio.stopRiftFog();
    }

    /**
     * Dispose any resources owned by this mechanic.
     * RiftMechanic holds no listeners, timers, or GPU resources of its own
     * (it mutates the shared player/audio systems, which own their cleanup),
     * so this is a no-op provided for interface consistency with other systems.
     */
    public dispose(): void {
        // No-op: nothing owned here to release.
    }
}
