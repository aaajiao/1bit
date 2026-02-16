import type * as THREE from 'three';
import type { AudioController } from '../audio/AudioController';
import type { ChunkManager } from '../world/ChunkManager';
import { CABLE_PROXIMITY } from '../config';

/**
 * Manages cable proximity audio effects (hum + pulse)
 */
export class CableAudioUpdater {
    private checkCounter: number = 0;
    private lastPulseTime: number = 0;

    update(playerPos: THREE.Vector3, chunkManager: ChunkManager, audio: AudioController): void {
        if (++this.checkCounter < CABLE_PROXIMITY.CHECK_INTERVAL)
            return;
        this.checkCounter = 0;

        const cableDist = chunkManager.getDistanceToNearestCable(playerPos);
        if (cableDist < CABLE_PROXIMITY.HUM_START_DISTANCE) {
            audio.startCableHum();
        }
        else if (cableDist > CABLE_PROXIMITY.HUM_STOP_DISTANCE) {
            audio.stopCableHum();
        }

        if (cableDist < CABLE_PROXIMITY.MAX_AUDIO_DISTANCE) {
            const humIntensity = Math.max(0, 1 - Math.max(0, cableDist - 1) / 11.0);
            audio.updateCableHum(humIntensity);

            const now = performance.now() / 1000;
            const cooldownElapsed = now - this.lastPulseTime >= CABLE_PROXIMITY.PULSE_COOLDOWN;
            if (cableDist < CABLE_PROXIMITY.PULSE_DISTANCE
                && cooldownElapsed
                && Math.random() < CABLE_PROXIMITY.PULSE_PROBABILITY) {
                audio.playCablePulse();
                this.lastPulseTime = now;
            }
        }
    }
}
