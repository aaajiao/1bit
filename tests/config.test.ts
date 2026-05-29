import { describe, expect, it } from 'vitest';
import { AUDIO_MASTER, CABLE_AUDIO_CONFIG, FOOTSTEP_CONFIG } from '../src/config/audio';
import { OVERRIDE } from '../src/config/constants';
import { PHYSICS_CONFIG, RIFT_PHYSICS } from '../src/config/physics';

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
});

describe('Override Config', () => {
    it('should have valid OVERRIDE timing values (single source of truth)', () => {
        // OVERRIDE.HOLD_THRESHOLD is the live value consumed by OverrideMechanic.
        expect(OVERRIDE.HOLD_THRESHOLD).toBeGreaterThan(0);
        expect(OVERRIDE.EFFECT_DURATION).toBeGreaterThan(0);
        expect(OVERRIDE.COOLDOWN).toBeGreaterThan(0);
        // Flash timings must be monotonically increasing within the effect.
        expect(OVERRIDE.FLASH_ON_DURATION).toBeLessThan(OVERRIDE.FLASH_HOLD_END);
        expect(OVERRIDE.FLASH_HOLD_END).toBeLessThan(OVERRIDE.FLASH_OFF_END);
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
        expect(CABLE_AUDIO_CONFIG.humFrequency).toBeGreaterThan(0);
        expect(CABLE_AUDIO_CONFIG.maxVolume).toBeGreaterThan(0);
    });
});
