import type * as THREE from 'three';
import type { AudioController } from '../audio/AudioController';
import type { ChunkManager } from '../world/ChunkManager';
import type { RoomType } from '../world/RoomConfig';
import { CableAudioUpdater } from './CableAudioUpdater';
import { CableUplinkUpdater } from './CableUplinkUpdater';
import { SeamSwapUpdater } from './SeamSwapUpdater';

/**
 * Near-player proximity composite (scene-richness batch): the three per-frame
 * passes that scan the 3x3 chunk window around the player and react to what is
 * CLOSE — cable HUM (audio), cable UPLINK (hard 1-bit dashes racing to the eye
 * when the flower burns), and the POLARIZED SEAM swap (us/them dissolving on the
 * line). They keep their own files and logic (one system per file — they share
 * only the near-chunk scan shape); this aggregate just owns their construction,
 * a single per-frame update(), and disposal so main.ts wires ONE field instead
 * of three, mirroring PlayerManager's compose-and-expose-one-update pattern.
 */
export class ProximityUpdaters {
    private cableAudio = new CableAudioUpdater();
    private cableUplink = new CableUplinkUpdater();
    private seamSwap = new SeamSwapUpdater();

    /**
     * @param t - Elapsed seconds (marches dash + flicker phase).
     * @param playerPos - Player world position (this frame).
     * @param chunkManager - Owns the cables + seam shells scanned near the player.
     * @param audio - Cable-hum audio sink.
     * @param flowerIntensity - Player flower intensity in [0,1] (uplink gate).
     * @param currentRoomType - Player's room this frame (seam swaps in POLARIZED only).
     */
    update(
        t: number,
        playerPos: THREE.Vector3,
        chunkManager: ChunkManager,
        audio: AudioController,
        flowerIntensity: number,
        currentRoomType: RoomType,
    ): void {
        this.cableAudio.update(playerPos, chunkManager, audio);
        this.cableUplink.update(t, playerPos, chunkManager, flowerIntensity);
        // Seam dissolves us/them: near-seam POLARIZED buildings flicker into the
        // other faction's language only while the player stands on the line.
        this.seamSwap.update(t, playerPos, chunkManager, currentRoomType);
    }

    /**
     * Dispose all three passes. The shared cable/uplink materials themselves are
     * owned by ChunkManager; audio is threaded to the cable-audio teardown.
     */
    dispose(audio: AudioController): void {
        this.cableAudio.dispose(audio);
        this.cableUplink.dispose();
        this.seamSwap.dispose();
    }
}
