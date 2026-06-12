import type * as THREE from 'three';
import type { AudioController } from '../audio/AudioController';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { ChunkManager } from '../world/ChunkManager';
import type { FigureSystem } from '../world/FigureSystem';
import type { GhostSystem } from '../world/GhostSystem';
import type { BehaviorProfile, RoomFogConfig } from '../world/RoomConfig';
import { GAMEPLAY, LIVE_PROFILE } from '../config';
import { RiftMechanic } from '../world/RiftMechanic';
import { RAIN_FOG_FAR_FACTOR, ROOM_FOG, RoomType, stepFogToward } from '../world/RoomConfig';
import { WEATHER_TYPES } from '../world/WeatherSystem';

/**
 * Per-frame room-flow wiring: detects room transitions (ambient retune via
 * AudioController.onRoomChange + FORCED_ALIGNMENT rift cleanup) and runs the
 * per-room mechanics (rift physics, INFO_OVERFLOW chirps, the per-room fog
 * horizon, the F3 silhouette figures, the F4 ghost replay). Owns the
 * previous-room memory, the RiftMechanic instance, and the injected
 * FigureSystem / GhostSystem (disposed here).
 */
export class RoomFlowUpdater {
    private previousRoomType: RoomType | null = null;
    private readonly riftMechanic = new RiftMechanic();

    // Throttle for feeding the live behavior profile into the room ledger
    // (F1 "the world reads you") — once per LEDGER_REFRESH_INTERVAL, not per
    // frame; the ledger only consults it when a new cluster needs a room.
    private profileFeedTimer = 0;

    // Weather type + intensity fed by main.ts AFTER the weather update each
    // frame; the figures and the rain fog close-in consume them one frame
    // stale by design, because the room flow runs before this frame's
    // weather selection in the fixed order.
    private weatherType = 0;
    private weatherIntensity = 0;

    // Reusable rain-biased fog target (no per-frame allocation; ROOM_FOG
    // entries are shared constants and must never be mutated).
    private readonly rainFogTarget: RoomFogConfig = { near: 0, far: 0 };

    /**
     * @param fog - The live scene fog (THREE.Fog satisfies the shape), eased
     *   toward the current room's ROOM_FOG target every frame (flow-audit
     *   enhancement #12: INFO_OVERFLOW's near noise horizon). Null disables
     *   the fog response (e.g. tests).
     * @param liveProfileSource - Lazily reads the live behavior profile
     *   (RunStatsCollector.getLiveProfile), fed to the chunk manager's room
     *   ledger at a low cadence. Null disables the F1 world-mirror bias.
     * @param figures - F3 distant silhouettes, driven once per frame after
     *   the room flow settles. OWNED here: disposed in dispose(). Null
     *   disables the figures (tests).
     * @param ghost - F4 ghost replay (last run's trail walked once), driven
     *   once per frame alongside the figures. OWNED here: disposed in
     *   dispose(). Null disables the ghost (tests).
     */
    constructor(
        private readonly fog: RoomFogConfig | null = null,
        private readonly liveProfileSource: (() => BehaviorProfile | null) | null = null,
        private readonly figures: FigureSystem | null = null,
        private readonly ghost: GhostSystem | null = null,
    ) {}

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
     * Feed the CURRENT frame's weather type + intensity (main.ts calls this
     * right after the weather update). Consumed by the NEXT frame's figure
     * update and rain fog close-in — one frame stale by design (see the
     * field comment above).
     */
    setWeather(weatherType: number, intensity: number): void {
        this.weatherType = weatherType;
        this.weatherIntensity = intensity;
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

        // F1 "the world reads you": feed the live behavior profile into the
        // room ledger at a low cadence, so clusters generated from here on
        // lean gently toward the player's run-long behavior. Delta-driven
        // (pause-gated upstream); the first feed lands after one interval.
        if (this.liveProfileSource) {
            this.profileFeedTimer += delta;
            if (this.profileFeedTimer >= LIVE_PROFILE.LEDGER_REFRESH_INTERVAL) {
                this.profileFeedTimer = 0;
                chunkManager.setLiveProfile(this.liveProfileSource());
            }
        }

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
        // RAIN pulls the horizon in further (weather-presence): the far
        // target closes toward RAIN_FOG_FAR_FACTOR scaled by the live
        // intensity, so the data downpour visibly engulfs the world;
        // stepFogToward's easing glides it in/out with the storm.
        if (this.fog) {
            let target = ROOM_FOG[currentRoomType];
            if (this.weatherType === WEATHER_TYPES.RAIN && this.weatherIntensity > 0) {
                this.rainFogTarget.near = target.near;
                this.rainFogTarget.far = target.far
                    * (1 - this.weatherIntensity * (1 - RAIN_FOG_FAR_FACTOR));
                target = this.rainFogTarget;
            }
            stepFogToward(this.fog, target, delta);
        }

        // Per-room mechanics. The rift consults the chunk manager's room
        // ledger (not the neutral pure attribution) so the fall check agrees
        // with the generated world even after the F1 bias kicks in.
        if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
            this.riftMechanic.update(player, audio, playerPos, chunkManager);
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

        // F3 silhouette figures: distant kin living the same rooms. Runs
        // AFTER the room flow above so the chunk grid and the room ledger's
        // cluster pins are already settled for this frame; the system follows
        // the same active chunk window as ChunkManager, reports its rare
        // rebel tears through the audio controller, and shimmers harder
        // under the (one frame stale) weather intensity.
        this.figures?.update(delta, playerPos, playerState, currentRoomType, audio, this.weatherIntensity);

        // F4 ghost replay: last run's you, retracing its recorded trail. It
        // ignores rooms entirely (memory predates this world's layout); it
        // only needs the frame delta and the player position (for the single
        // silent recognition flare).
        this.ghost?.update(delta, playerPos);

        return currentRoomType;
    }

    dispose(): void {
        this.riftMechanic.dispose();
        this.figures?.dispose();
        this.ghost?.dispose();
    }
}
