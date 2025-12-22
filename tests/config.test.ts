import { describe, expect, it } from 'vitest';
import { PHYSICS_CONFIG, RIFT_PHYSICS, OVERRIDE_CONFIG } from '../src/config/physics';
import { AUDIO_MASTER, FOOTSTEP_CONFIG, CABLE_AUDIO_CONFIG } from '../src/config/audio';

describe('Physics Config', () => {
    it('should have valid PHYSICS_CONFIG values', () => {
        expect(PHYSICS_CONFIG.speed).toBeGreaterThan(0);
        expect(PHYSICS_CONFIG.jumpForce).toBeGreaterThan(0);
        expect(PHYSICS_CONFIG.gravity).toBeGreaterThan(0);
        expect(PHYSICS_CONFIG.maxJumps).toBeGreaterThanOrEqual(1);
    });

    it('should have valid RIFT_PHYSICS values', () => {
        expect(RIFT_PHYSICS.fallGravity).toBeLessThan(PHYSICS_CONFIG.gravity);
        expect(RIFT_PHYSICS.respawnHeight).toBeLessThan(0);
        expect(RIFT_PHYSICS.crackHalfWidth).toBeGreaterThan(0);
    });

    it('should have valid OVERRIDE_CONFIG values', () => {
        expect(OVERRIDE_CONFIG.holdDuration).toBeGreaterThan(0);
        expect(OVERRIDE_CONFIG.pitchThreshold).toBeGreaterThan(0);
        expect(OVERRIDE_CONFIG.pitchThreshold).toBeLessThanOrEqual(90);
    });
});

describe('Audio Config', () => {
    it('should have valid AUDIO_MASTER values', () => {
        expect(AUDIO_MASTER.defaultVolume).toBeGreaterThanOrEqual(0);
        expect(AUDIO_MASTER.defaultVolume).toBeLessThanOrEqual(1);
        expect(AUDIO_MASTER.gazeFilterOpen).toBeGreaterThan(AUDIO_MASTER.gazeFilterClosed);
    });

    it('should have valid FOOTSTEP_CONFIG values', () => {
        expect(FOOTSTEP_CONFIG.minInterval).toBeGreaterThan(0);
        expect(FOOTSTEP_CONFIG.maxFrequency).toBeGreaterThan(FOOTSTEP_CONFIG.minFrequency);
    });

    it('should have valid CABLE_AUDIO_CONFIG values', () => {
        expect(CABLE_AUDIO_CONFIG.maxDistance).toBeGreaterThan(CABLE_AUDIO_CONFIG.minDistance);
        expect(CABLE_AUDIO_CONFIG.maxVolume).toBeGreaterThan(0);
    });
});
