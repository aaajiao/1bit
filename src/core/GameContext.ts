// Game Context - Shared state passed to all systems during update

import type * as THREE from 'three';
import type { RoomType } from '../world/RoomConfig';

/**
 * Context passed to systems during update
 */
export interface GameContext {
    // Time
    time: number;
    delta: number;

    // Player
    playerPosition: THREE.Vector3;
    currentRoomType: RoomType;

    // Room state
    isRoomTransition: boolean;
}
