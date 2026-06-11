// 1-bit Chimera Void - Room transition blending
// Pure state machine (no Three.js) — owns the displayed shader config and how
// it glides across room boundaries. ChunkManager drives it once per frame.
import type { RoomShaderConfig, RoomType } from './RoomConfig';
import { ROOM_TRANSITION } from '../config/constants';
import {
    cloneRoomShaderConfig,
    lerpRoomShaderConfig,
    reactiveRoomShaderConfig,
    ROOM_CONFIGS,
} from './RoomConfig';

/**
 * Blends the displayed room shader config across room transitions.
 *
 * Freeze-from semantics (flow-audit medium #4): when a new transition begins —
 * including MID-FLIGHT during boundary probing / an immediate retreat — the
 * blend does NOT restart from the previous room's static baseline. It freezes
 * the current on-screen config (the last `update()` output, reactive deltas
 * included) as the from-snapshot and glides from there to the new target, so
 * the screen is continuous at every crossing no matter how rapid.
 *
 * The blend target is the live REACTIVE config (reactiveRoomShaderConfig), not
 * the static baseline: INFO_OVERFLOW's flower-driven noise/jitter and
 * FORCED_ALIGNMENT's side asymmetry are baked into the output here, easing in
 * on entry and frozen into the snapshot on exit — eliminating the bounded
 * residual jumps (FA ±0.15, INFO ±0.3) of the old delta-on-top wiring.
 */
export class RoomTransition {
    private fromConfig: RoomShaderConfig;
    private output: RoomShaderConfig;
    private progress: number = 1.0; // 1.0 = settled in targetRoom
    private targetRoom: RoomType;
    private readonly speed: number;

    constructor(
        initialRoom: RoomType,
        speed: number = ROOM_TRANSITION.TRANSITION_SPEED,
    ) {
        this.targetRoom = initialRoom;
        this.speed = speed;
        this.fromConfig = cloneRoomShaderConfig(ROOM_CONFIGS[initialRoom].shader);
        this.output = cloneRoomShaderConfig(ROOM_CONFIGS[initialRoom].shader);
    }

    /**
     * Start blending toward `toRoom`, freezing the current on-screen config
     * (reactive deltas included) as the from-snapshot.
     */
    beginTransition(toRoom: RoomType): void {
        if (toRoom === this.targetRoom)
            return;
        this.fromConfig = cloneRoomShaderConfig(this.output);
        this.targetRoom = toRoom;
        this.progress = 0;
    }

    /**
     * Advance the blend and return the displayed config for this frame.
     * @param delta - Seconds since last update
     * @param flowerIntensity - 0-1, drives INFO_OVERFLOW reactive noise/jitter
     * @param playerX - Player world x, drives FORCED_ALIGNMENT side asymmetry
     */
    update(delta: number, flowerIntensity: number, playerX: number): RoomShaderConfig {
        if (this.progress < 1)
            this.progress = Math.min(1, this.progress + delta * this.speed);
        const target = reactiveRoomShaderConfig(this.targetRoom, flowerIntensity, playerX);
        // At steady state clone (exact reactive values, fresh tuples); mid-blend
        // lerp (which also returns fresh tuples) from the frozen snapshot.
        this.output = this.progress >= 1
            ? cloneRoomShaderConfig(target)
            : lerpRoomShaderConfig(this.fromConfig, target, this.progress);
        return this.output;
    }

    /**
     * Latest blended config — the on-screen state the next beginTransition
     * would freeze. Owned by this class; callers must not mutate.
     */
    getConfig(): RoomShaderConfig {
        return this.output;
    }

    isInTransition(): boolean {
        return this.progress < 1;
    }

    getTargetRoom(): RoomType {
        return this.targetRoom;
    }
}
