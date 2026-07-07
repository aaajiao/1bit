// Burn-in afterimage (INFO_OVERFLOW: what you stared at cannot be unseen) —
// pure CPU logic: the stare state machine (arming, hysteresis, reset), the
// hasHeat cooldown that keeps the GPU pass alive until the buffer drains,
// the config contract, and the new room-chain field's lerp round-trip.
import { describe, expect, it } from 'vitest';
import { BURN_IN } from '../src/config/constants';
import {
    createStareDetectorState,
    quaternionAngleRadians,
    shouldRunBurnPass,
    stepHeatCooldown,
    stepStareDetector,
} from '../src/core/BurnInPass';
import { lerpRoomShaderConfig, ROOM_CONFIGS, RoomType } from '../src/world/RoomConfig';

/** Test-local stare tunables so detector tests don't drift with BURN_IN. */
const CFG = {
    STILLNESS_THRESHOLD: 0.1,
    RELEASE_THRESHOLD: 0.4,
    ARM_SECONDS: 1.0,
};

describe('quaternionAngleRadians', () => {
    const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

    it('returns 0 for identical orientations', () => {
        expect(quaternionAngleRadians(IDENTITY, IDENTITY)).toBeCloseTo(0, 9);
    });

    it('measures a 90 degree yaw as pi/2', () => {
        const halfAngle = Math.PI / 4;
        const yaw90 = { x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) };
        expect(quaternionAngleRadians(IDENTITY, yaw90)).toBeCloseTo(Math.PI / 2, 6);
    });

    it('is double-cover safe: q and -q are the same orientation', () => {
        const q = { x: 0.1, y: 0.2, z: 0.3, w: Math.sqrt(1 - 0.14) };
        const negQ = { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
        expect(quaternionAngleRadians(q, negQ)).toBeCloseTo(0, 6);
    });
});

describe('stepStareDetector — arming', () => {
    it('arms after ARM_SECONDS of continuous stillness', () => {
        const state = createStareDetectorState();
        for (let i = 0; i < 3; i++)
            expect(stepStareDetector(state, 0.05, 0.25, CFG)).toBe(false);
        // 0.75s so far; the 4th still frame crosses 1.0s.
        expect(stepStareDetector(state, 0.05, 0.25, CFG)).toBe(true);
    });

    it('does not arm before ARM_SECONDS even at perfect stillness', () => {
        const state = createStareDetectorState();
        for (let i = 0; i < 9; i++)
            expect(stepStareDetector(state, 0, 0.1, CFG)).toBe(false);
    });

    it('resets the arming timer on motion above the stillness threshold', () => {
        const state = createStareDetectorState();
        stepStareDetector(state, 0.05, 0.9, CFG); // 0.9s of stillness banked
        stepStareDetector(state, 0.2, 0.016, CFG); // one moving frame
        expect(state.stillSeconds).toBe(0);
        // Needs the FULL arming window again.
        expect(stepStareDetector(state, 0.05, 0.9, CFG)).toBe(false);
        expect(stepStareDetector(state, 0.05, 0.2, CFG)).toBe(true);
    });

    it('never arms from inside the hysteresis band', () => {
        const state = createStareDetectorState();
        // Speed between STILLNESS and RELEASE: too fast to arm, forever.
        for (let i = 0; i < 100; i++)
            expect(stepStareDetector(state, 0.25, 0.1, CFG)).toBe(false);
    });
});

describe('stepStareDetector — hysteresis + reset', () => {
    const armedState = () => {
        const state = createStareDetectorState();
        stepStareDetector(state, 0, CFG.ARM_SECONDS, CFG);
        expect(state.staring).toBe(true);
        return state;
    };

    it('micro-jitter below the release threshold keeps an active stare', () => {
        const state = armedState();
        for (let i = 0; i < 100; i++)
            expect(stepStareDetector(state, 0.35, 0.016, CFG)).toBe(true);
    });

    it('fast motion above the release threshold breaks the stare immediately', () => {
        const state = armedState();
        expect(stepStareDetector(state, 0.5, 0.016, CFG)).toBe(false);
        expect(state.stillSeconds).toBe(0);
    });

    it('requires the full arming window again after a break', () => {
        const state = armedState();
        stepStareDetector(state, 2.0, 0.016, CFG); // break
        expect(stepStareDetector(state, 0, CFG.ARM_SECONDS / 2, CFG)).toBe(false);
        expect(stepStareDetector(state, 0, CFG.ARM_SECONDS / 2, CFG)).toBe(true);
    });
});

describe('stepHeatCooldown / shouldRunBurnPass', () => {
    it('re-arms the full window on a contributing frame', () => {
        expect(stepHeatCooldown(0.3, true, 0.016, 4)).toBe(4);
        expect(stepHeatCooldown(0, true, 0.016, 4)).toBe(4);
    });

    it('drains by delta and clamps at 0 when not contributing', () => {
        expect(stepHeatCooldown(1.0, false, 0.25, 4)).toBeCloseTo(0.75, 9);
        expect(stepHeatCooldown(0.1, false, 0.25, 4)).toBe(0);
    });

    it('runs the pass while the room gate is open, even with no heat', () => {
        expect(shouldRunBurnPass(0.85, 0)).toBe(true);
        expect(shouldRunBurnPass(0.001, 0)).toBe(true); // transition fade tail
    });

    it('keeps the pass alive on residual heat after leaving the room', () => {
        expect(shouldRunBurnPass(0, 2.5)).toBe(true);
    });

    it('costs nothing once the gate is closed and the buffer has drained', () => {
        expect(shouldRunBurnPass(0, 0)).toBe(false);
    });
});

describe('bURN_IN config contract', () => {
    it('keeps the heat buffer scale in (0, 1]', () => {
        expect(BURN_IN.BUFFER_SCALE).toBeGreaterThan(0);
        expect(BURN_IN.BUFFER_SCALE).toBeLessThanOrEqual(1);
    });

    it('keeps a real hysteresis band (release strictly above stillness)', () => {
        expect(BURN_IN.STILLNESS_THRESHOLD).toBeGreaterThan(0);
        expect(BURN_IN.RELEASE_THRESHOLD).toBeGreaterThan(BURN_IN.STILLNESS_THRESHOLD);
    });

    it('has positive arming, gain and decay times', () => {
        expect(BURN_IN.ARM_SECONDS).toBeGreaterThan(0);
        expect(BURN_IN.GAIN_PER_SECOND).toBeGreaterThan(0);
        expect(BURN_IN.DECAY_SECONDS).toBeGreaterThan(0);
    });

    it('keeps the contribution gate a reachable distance-from-mid-grey', () => {
        expect(BURN_IN.CONTRIBUTION_THRESHOLD).toBeGreaterThan(0);
        expect(BURN_IN.CONTRIBUTION_THRESHOLD).toBeLessThan(0.5);
    });

    it('sizes the cooldown to fully drain the buffer before the pass stops', () => {
        // Max heat is 1.0 and decay is 1/DECAY_SECONDS per second, so a
        // cooldown window >= DECAY_SECONDS guarantees an empty buffer.
        expect(BURN_IN.HAS_HEAT_COOLDOWN).toBeGreaterThanOrEqual(BURN_IN.DECAY_SECONDS);
    });
});

describe('burnInStrength room chain', () => {
    it('burns only in INFO_OVERFLOW', () => {
        expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.burnInStrength).toBeCloseTo(0.85, 9);
        expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.burnInStrength).toBeLessThanOrEqual(1);
    });

    it('is exactly 0 in the other three rooms (the transition lerp IS the gate)', () => {
        expect(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.burnInStrength).toBe(0);
        expect(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.burnInStrength).toBe(0);
        expect(ROOM_CONFIGS[RoomType.POLARIZED].shader.burnInStrength).toBe(0);
    });

    it('rides lerpRoomShaderConfig like every other room scalar', () => {
        const from = ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader;
        const to = ROOM_CONFIGS[RoomType.POLARIZED].shader;
        expect(lerpRoomShaderConfig(from, to, 0).burnInStrength).toBe(from.burnInStrength);
        expect(lerpRoomShaderConfig(from, to, 1).burnInStrength).toBeCloseTo(to.burnInStrength, 9);
        expect(lerpRoomShaderConfig(from, to, 0.5).burnInStrength)
            .toBeCloseTo((from.burnInStrength + to.burnInStrength) / 2, 9);
    });
});
