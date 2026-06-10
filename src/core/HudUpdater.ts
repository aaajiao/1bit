import type * as THREE from 'three';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { BehaviorTag, RunStatsCollector } from '../stats/RunStatsCollector';
import type { RoomType } from '../world/RoomConfig';
import { HUD } from '../ui/HUD';

// Throttle interval (seconds) for the debug-HUD behavior-tag regeneration (M13).
const TAG_REFRESH_INTERVAL = 1.0;

// Resolved resistance hint text shown on the HUD when conditions are met.
// Touch fallback mode points at the hold-to-resist button instead of SHIFT
// (flow-audit C3: the POLARIZED climax must be discoverable on touch too).
const OVERRIDE_HINT_TEXT_DESKTOP = '[SHIFT] 也许可以反抗';
const OVERRIDE_HINT_TEXT_TOUCH = '[按住「反抗」] 也许可以反抗';

// Minimal flower-adjustment fallback hint (flow-audit enhancement #1): shown
// after FLOWER_HINT.IDLE_SECONDS of play without any intensity input. Touch
// fallback devices have −/+ buttons instead of a wheel.
const FLOWER_HINT_TEXT_DESKTOP = '[scroll]';
const FLOWER_HINT_TEXT_TOUCH = '[−/+]';

/**
 * Per-frame HUD wiring: throttles the debug behavior-tag regeneration to
 * ~1Hz (M13) and maps the override mechanic's hint state to the HUD display
 * contract. The mechanic keeps shouldShow true for its configured display
 * window and marks itself shown when it elapses (flow-audit break #2), so
 * this just renders `shouldShow` — no marking here. Owns the HUD instance.
 */
export class HudUpdater {
    private readonly hud = new HUD();
    private cachedTags: BehaviorTag[] = [];
    private tagRefreshTimer = 0;

    update(
        delta: number,
        playerState: PlayerState,
        playerPos: THREE.Vector3,
        currentRoomType: RoomType,
        player: PlayerManager,
        runStats: RunStatsCollector,
    ): void {
        this.tagRefreshTimer += delta;
        if (this.tagRefreshTimer >= TAG_REFRESH_INTERVAL) {
            this.tagRefreshTimer = 0;
            this.cachedTags = runStats.generateTags();
        }

        this.hud.update({
            posX: playerPos.x,
            posZ: playerPos.z,
            roomType: currentRoomType,
            pitch: playerState.pitch,
            isShiftHeld: playerState.isShiftHeld,
            isGazing: playerState.isGazing,
            overrideActive: playerState.overrideActive,
            overrideProgress: playerState.overrideProgress,
            tags: this.cachedTags,
            hint: {
                text: player.controls.isTouchFallback()
                    ? OVERRIDE_HINT_TEXT_TOUCH
                    : OVERRIDE_HINT_TEXT_DESKTOP,
                visible: player.getOverrideHintState().shouldShow,
            },
            flowerHint: {
                text: player.controls.isTouchFallback()
                    ? FLOWER_HINT_TEXT_TOUCH
                    : FLOWER_HINT_TEXT_DESKTOP,
                visible: player.getFlowerHintState().shouldShow,
            },
        });
    }
}
