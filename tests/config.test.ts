import { describe, expect, it } from 'vitest';
import { AUDIO_MASTER, CABLE_AUDIO_CONFIG, FOOTSTEP_CONFIG, POLARIZED_BEAT_CONFIG, SNAPSHOT_AUDIO_CONFIG } from '../src/config/audio';
import { FLOWER_HINT, FLOWER_INTRO, GAMEPLAY, OVERRIDE, SPAWN, SUNSET_FORESHADOW, WORLD } from '../src/config/constants';
import { PHYSICS_CONFIG, RIFT_PHYSICS } from '../src/config/physics';

describe('physics Config', () => {
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

describe('override Config', () => {
    it('should have valid OVERRIDE timing values (single source of truth)', () => {
        // OVERRIDE.HOLD_THRESHOLD is the live value consumed by OverrideMechanic.
        expect(OVERRIDE.HOLD_THRESHOLD).toBeGreaterThan(0);
        expect(OVERRIDE.EFFECT_DURATION).toBeGreaterThan(0);
        expect(OVERRIDE.COOLDOWN).toBeGreaterThan(0);
        // Flash timings must be monotonically increasing within the effect.
        expect(OVERRIDE.FLASH_ON_DURATION).toBeLessThan(OVERRIDE.FLASH_HOLD_END);
        expect(OVERRIDE.FLASH_HOLD_END).toBeLessThan(OVERRIDE.FLASH_OFF_END);
    });

    it('should keep the raw-bypass crash frame short and inside the effect (enhancement #4)', () => {
        // Photosensitivity: the raw crash window must stay brief, and it must
        // end before the effect does so the inversion aftershock is visible.
        expect(OVERRIDE.RAW_BYPASS_DURATION).toBeGreaterThan(0);
        expect(OVERRIDE.RAW_BYPASS_DURATION).toBeLessThanOrEqual(0.15);
        expect(OVERRIDE.RAW_BYPASS_DURATION).toBeLessThan(OVERRIDE.EFFECT_DURATION);
    });

    it('should have valid sustain/residue payoff values (enhancements #5/#6)', () => {
        expect(OVERRIDE.SUSTAIN_RELEASE_SECONDS).toBeGreaterThan(0);
        expect(OVERRIDE.RESIDUE_STEP).toBeGreaterThan(0);
        expect(OVERRIDE.RESIDUE_MAX).toBeGreaterThanOrEqual(OVERRIDE.RESIDUE_STEP);
        // The residue rides the uMisregister channel; keep it a subtle layer.
        expect(OVERRIDE.RESIDUE_MAX).toBeLessThanOrEqual(0.2);
    });
});

describe('gameplay Config', () => {
    it('should have a valid snapshot minimum-run-duration gate', () => {
        expect(GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT).toBeGreaterThan(0);
        // The gate must stay below the shortest possible day half-cycle
        // (cycleDuration 240-360s => half-cycle >= 120s) or every run would be skipped.
        expect(GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT).toBeLessThan(120);
    });

    it('should keep the opening pulse a valid intensity sway (enhancement #1)', () => {
        expect(FLOWER_INTRO.PULSE_MIN).toBeGreaterThanOrEqual(0);
        expect(FLOWER_INTRO.PULSE_MIN).toBeLessThan(FLOWER_INTRO.PULSE_MAX);
        expect(FLOWER_INTRO.PULSE_MAX).toBeLessThanOrEqual(1);
        expect(FLOWER_INTRO.PULSE_DURATION).toBeGreaterThan(0);
        expect(FLOWER_INTRO.PULSE_SPEED).toBeGreaterThan(0);
        // The pulse must complete at least one full breath inside its window
        // or the cue reads as drift, not as an invitation.
        const period = (2 * Math.PI) / FLOWER_INTRO.PULSE_SPEED;
        expect(FLOWER_INTRO.PULSE_DURATION).toBeGreaterThanOrEqual(period);
    });

    it('should keep the fallback hint after the opening pulse (enhancement #1)', () => {
        // The wordless cue gets its chance first; the explicit [scroll] line
        // is the fallback, so its idle window must outlast the pulse.
        expect(FLOWER_HINT.IDLE_SECONDS).toBeGreaterThan(FLOWER_INTRO.PULSE_DURATION);
    });
});

describe('audio Config', () => {
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

    it('should keep the POLARIZED pulse pair audible above the gaze-lowpass floor', () => {
        // The whole point of the layer (flow-audit medium #2): the sub-40Hz
        // drone sits below the 400Hz closed cutoff, so the carrier must not.
        expect(POLARIZED_BEAT_CONFIG.lowFreq).toBeGreaterThan(AUDIO_MASTER.gazeFilterClosed);
        expect(POLARIZED_BEAT_CONFIG.highFreq).toBe(POLARIZED_BEAT_CONFIG.lowFreq * 2);
        expect(POLARIZED_BEAT_CONFIG.baseInterval).toBeGreaterThan(POLARIZED_BEAT_CONFIG.pulseDuration);
        expect(POLARIZED_BEAT_CONFIG.gazeRateGain).toBeGreaterThan(0);
    });

    it('should keep the snapshot lowpass ceiling between closed and open', () => {
        expect(SNAPSHOT_AUDIO_CONFIG.lowpassFreq).toBeGreaterThanOrEqual(AUDIO_MASTER.gazeFilterClosed);
        expect(SNAPSHOT_AUDIO_CONFIG.lowpassFreq).toBeLessThan(AUDIO_MASTER.gazeFilterOpen);
        expect(SNAPSHOT_AUDIO_CONFIG.holdSeconds).toBeGreaterThan(0);
    });
});

describe('settlement & spawn Config', () => {
    it('should keep the dusk paper shift dimming-only and inside a half-cycle', () => {
        expect(SUNSET_FORESHADOW.WARM_SHIFT).toBeLessThanOrEqual(SUNSET_FORESHADOW.PAPER_DIM);
        expect(SUNSET_FORESHADOW.PAPER_DIM + SUNSET_FORESHADOW.WARM_SHIFT).toBeLessThan(1);
        // The lead must fit inside the shortest possible day half-cycle (120s).
        expect(SUNSET_FORESHADOW.LEAD_SECONDS).toBeGreaterThan(0);
        expect(SUNSET_FORESHADOW.LEAD_SECONDS).toBeLessThan(120);
    });

    it('should keep the safe-spawn offset inside the chunk half-width', () => {
        expect(SPAWN.SPAWN_OFFSET).toBeGreaterThanOrEqual(0);
        expect(SPAWN.SPAWN_OFFSET).toBeLessThan(WORLD.CHUNK_SIZE / 2);
        expect(SPAWN.SCAN_RADIUS_CHUNKS).toBeGreaterThanOrEqual(1);
    });
});
