import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GAZE, GAZE_VISUAL } from '../src/config';
import { gazeDirectionFactor, GazeMechanic } from '../src/player/GazeMechanic';

describe('gazeMechanic', () => {
    let camera: THREE.PerspectiveCamera;
    let gaze: GazeMechanic;

    beforeEach(() => {
        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.rotation.order = 'YXZ'; // Match game rotation order
        gaze = new GazeMechanic(camera);
    });

    describe('initialization', () => {
        it('should start with isGazing = false', () => {
            const state = gaze.getState();
            expect(state.isGazing).toBe(false);
        });

        it('should start with zero intensity', () => {
            const state = gaze.getState();
            expect(state.gazeIntensity).toBe(0);
        });

        it('should start with zero gaze events', () => {
            const state = gaze.getState();
            expect(state.gazeEvents).toBe(0);
        });
    });

    describe('gaze detection', () => {
        it('should not detect gaze when looking straight ahead', () => {
            camera.rotation.x = 0; // Looking straight
            const state = gaze.update(0.016);
            expect(state.isGazing).toBe(false);
        });

        it('should not detect gaze when looking down', () => {
            camera.rotation.x = -Math.PI / 4; // Looking down 45°
            const state = gaze.update(0.016);
            expect(state.isGazing).toBe(false);
        });

        it('should not detect gaze just below threshold', () => {
            camera.rotation.x = Math.PI / 4 - 0.01; // Just under 45°
            const state = gaze.update(0.016);
            expect(state.isGazing).toBe(false);
        });

        it('should detect gaze when looking up above 45°', () => {
            camera.rotation.x = Math.PI / 3; // 60°
            const state = gaze.update(0.016);
            expect(state.isGazing).toBe(true);
        });

        it('should detect gaze when looking straight up', () => {
            camera.rotation.x = Math.PI / 2; // 90°
            const state = gaze.update(0.016);
            expect(state.isGazing).toBe(true);
        });
    });

    describe('gaze intensity', () => {
        it('should have zero intensity when not gazing', () => {
            camera.rotation.x = 0;
            const state = gaze.update(0.016);
            expect(state.gazeIntensity).toBe(0);
        });

        it('should have low intensity just above threshold', () => {
            camera.rotation.x = Math.PI / 4 + 0.1; // Just above 45°
            const state = gaze.update(0.016);
            expect(state.gazeIntensity).toBeGreaterThan(0);
            expect(state.gazeIntensity).toBeLessThan(0.5);
        });

        it('should have maximum intensity when looking straight up', () => {
            camera.rotation.x = Math.PI / 2; // 90°
            const state = gaze.update(0.016);
            expect(state.gazeIntensity).toBe(1);
        });

        it('should increase intensity as pitch increases', () => {
            camera.rotation.x = Math.PI / 3; // 60°
            const state1 = gaze.update(0.016);

            camera.rotation.x = Math.PI * 0.4; // 72°
            const state2 = gaze.update(0.016);

            expect(state2.gazeIntensity).toBeGreaterThan(state1.gazeIntensity);
        });
    });

    describe('gaze events and callbacks', () => {
        it('should increment gazeEvents when gaze starts', () => {
            camera.rotation.x = Math.PI / 3; // Start gazing
            gaze.update(0.016);
            expect(gaze.getState().gazeEvents).toBe(1);
        });

        it('should fire onGazeStart callback when gaze begins', () => {
            const callback = vi.fn();
            gaze.setOnGazeStart(callback);

            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should not fire onGazeStart callback when already gazing', () => {
            const callback = vi.fn();
            gaze.setOnGazeStart(callback);

            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);
            gaze.update(0.016);
            gaze.update(0.016);

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should fire onGazeEnd callback when gaze ends', () => {
            const callback = vi.fn();
            gaze.setOnGazeEnd(callback);

            camera.rotation.x = Math.PI / 3; // Start gazing
            gaze.update(0.016);

            camera.rotation.x = 0; // Stop gazing
            gaze.update(0.016);

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should fire onGazeUpdate callback while gazing', () => {
            const callback = vi.fn();
            gaze.setOnGazeUpdate(callback);

            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);

            expect(callback).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(expect.any(Number));
        });
    });

    describe('gaze duration tracking', () => {
        it('should track gaze duration while gazing', () => {
            camera.rotation.x = Math.PI / 3;

            gaze.update(0.5);
            expect(gaze.getState().gazeDuration).toBeCloseTo(0.5, 2);

            gaze.update(0.5);
            expect(gaze.getState().gazeDuration).toBeCloseTo(1.0, 2);
        });

        it('should reset gaze duration when gaze ends and starts again', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(1.0);

            camera.rotation.x = 0;
            gaze.update(0.016);

            camera.rotation.x = Math.PI / 3;
            gaze.update(0.5);

            expect(gaze.getState().gazeDuration).toBeCloseTo(0.5, 2);
        });

        it('should accumulate total gaze time across sessions', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(1.0);

            camera.rotation.x = 0;
            gaze.update(0.016);

            camera.rotation.x = Math.PI / 3;
            gaze.update(1.0);

            expect(gaze.getState().totalGazeTime).toBeCloseTo(2.0, 2);
        });
    });

    describe('forced flower intensity calculation', () => {
        it('should return 1.0 when not gazing', () => {
            camera.rotation.x = 0;
            gaze.update(0.016);
            expect(gaze.calculateForcedFlowerIntensity()).toBe(1.0);
        });

        it('should return less than 1.0 when gazing', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);
            expect(gaze.calculateForcedFlowerIntensity()).toBeLessThan(1.0);
        });

        it('should return minimum value (0.1) at max gaze intensity', () => {
            camera.rotation.x = Math.PI / 2; // Max gaze
            gaze.update(0.016);
            expect(gaze.calculateForcedFlowerIntensity()).toBeCloseTo(GAZE.FLOWER_MIN_INTENSITY, 2);
        });

        it('should start near FLOWER_FORCED_START (0.35) just above the threshold', () => {
            // Flow-audit medium #1: the forced value at the threshold crossing
            // sits below the default flower intensity (0.5), so a default
            // player sees the flower dim the instant they cross 45°.
            camera.rotation.x = Math.PI / 4 + 0.001; // Just over 45°
            gaze.update(0.016);
            expect(gaze.calculateForcedFlowerIntensity()).toBeCloseTo(GAZE.FLOWER_FORCED_START, 1);
            expect(gaze.calculateForcedFlowerIntensity()).toBeLessThan(0.5);
        });

        it('should interpolate between FLOWER_FORCED_START and FLOWER_MIN_INTENSITY', () => {
            camera.rotation.x = Math.PI / 3; // 60°
            const state = gaze.update(0.016);
            const expected = GAZE.FLOWER_MIN_INTENSITY
                + (1 - state.gazeIntensity) * (GAZE.FLOWER_FORCED_START - GAZE.FLOWER_MIN_INTENSITY);
            expect(gaze.calculateForcedFlowerIntensity()).toBeCloseTo(expected, 5);
        });
    });

    describe('threshold-crossing pulse (45° marker line)', () => {
        it('should start at zero', () => {
            expect(gaze.getThresholdPulse()).toBe(0);
        });

        it('should stay zero while below the threshold', () => {
            camera.rotation.x = Math.PI / 4 - 0.1;
            gaze.update(0.016);
            expect(gaze.getThresholdPulse()).toBe(0);
        });

        it('should fire at full strength on the first crossing', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);
            expect(gaze.getThresholdPulse()).toBe(1.0);
        });

        it('should decay to zero over PITCH_LINE_PULSE_DURATION', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016); // Crossing frame: pulse = 1.0

            gaze.update(GAZE_VISUAL.PITCH_LINE_PULSE_DURATION / 2);
            expect(gaze.getThresholdPulse()).toBeCloseTo(0.5, 5);

            gaze.update(GAZE_VISUAL.PITCH_LINE_PULSE_DURATION);
            expect(gaze.getThresholdPulse()).toBe(0);
        });

        it('should not re-fire on subsequent crossings in the same session', () => {
            camera.rotation.x = Math.PI / 3; // First crossing
            gaze.update(0.016);
            gaze.update(GAZE_VISUAL.PITCH_LINE_PULSE_DURATION * 2); // Fully decayed

            camera.rotation.x = 0; // Look back down
            gaze.update(0.016);

            camera.rotation.x = Math.PI / 3; // Second crossing
            gaze.update(0.016);
            expect(gaze.getThresholdPulse()).toBe(0);
        });

        it('should fire again after reset()', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);

            camera.rotation.x = 0;
            gaze.update(0.016);
            gaze.reset();

            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);
            expect(gaze.getThresholdPulse()).toBe(1.0);
        });
    });

    // Flow-audit enhancement #13: discipline only lands while the eye is in frame.
    describe('gaze direction attenuation', () => {
        const ORIGIN = { x: 0, y: 0, z: 0 };

        describe('gazeDirectionFactor (pure)', () => {
            it('returns 1 when looking straight up at an eye directly overhead', () => {
                const f = gazeDirectionFactor(ORIGIN, 0, Math.PI / 2, { x: 0, y: 120, z: 0 });
                expect(f).toBeCloseTo(1, 6);
            });

            it('returns 0 when looking at the horizon with the eye straight overhead', () => {
                // Forward is perpendicular to the camera->eye direction: dot = 0.
                const f = gazeDirectionFactor(ORIGIN, 0, 0, { x: 0, y: 120, z: 0 });
                expect(f).toBeCloseTo(0, 6);
            });

            it('returns 0 (hard zero) when the eye is behind the view plane', () => {
                // Looking up-forward (-Z) while the eye sits low behind (+Z).
                const f = gazeDirectionFactor(ORIGIN, 0, Math.PI / 3, { x: 0, y: 2, z: 100 });
                expect(f).toBe(0);
            });

            it('returns 1 when the eye sits exactly along the camera forward', () => {
                // Forward at yaw 0, pitch 60°: (0, sin60, -cos60). Eye 100m out.
                const f = gazeDirectionFactor(
                    ORIGIN,
                    0,
                    Math.PI / 3,
                    { x: 0, y: Math.sin(Math.PI / 3) * 100, z: -Math.cos(Math.PI / 3) * 100 },
                );
                expect(f).toBeCloseTo(1, 6);
            });

            it('attenuates partially for an off-axis eye (0 < factor < 1)', () => {
                // Pitch 60° toward -Z, eye up-and-behind: dot lands mid-range.
                const f = gazeDirectionFactor(ORIGIN, 0, Math.PI / 3, { x: 0, y: 86.6, z: 50 });
                expect(f).toBeGreaterThan(0);
                expect(f).toBeLessThan(1);
            });

            it('respects yaw: turning away from the eye reduces the factor', () => {
                const eye = { x: 0, y: 86.6, z: -50 }; // up-forward at yaw 0
                const facing = gazeDirectionFactor(ORIGIN, 0, Math.PI / 3, eye);
                const turned = gazeDirectionFactor(ORIGIN, Math.PI, Math.PI / 3, eye);
                expect(facing).toBeGreaterThan(turned);
            });

            it('returns 1 for a degenerate zero-length camera->eye vector', () => {
                expect(gazeDirectionFactor(ORIGIN, 0, 1, ORIGIN)).toBe(1);
            });
        });

        it('keeps legacy intensity when no eye position is provided', () => {
            camera.rotation.x = Math.PI / 2;
            const state = gaze.update(0.016);
            expect(state.gazeIntensity).toBe(1);
        });

        it('preserves full intensity when the eye is directly overhead', () => {
            camera.rotation.x = Math.PI / 2; // straight up
            const state = gaze.update(0.016, { x: 0, y: 120, z: 0 });
            expect(state.gazeIntensity).toBeCloseTo(1, 6);
        });

        it('zeroes intensity but keeps isGazing when the eye is out of frame', () => {
            camera.rotation.x = Math.PI / 3; // above threshold, facing -Z
            const state = gaze.update(0.016, { x: 0, y: 2, z: 100 }); // low behind
            expect(state.isGazing).toBe(true); // pitch stays the sole determinant
            expect(state.gazeIntensity).toBe(0);
        });

        it('reduces intensity versus baseline for a partially off-frame eye', () => {
            camera.rotation.x = Math.PI / 3;
            const baseline = gaze.update(0.016).gazeIntensity;

            const attenuated = gaze.update(0.016, { x: 0, y: 86.6, z: 50 }).gazeIntensity;
            expect(attenuated).toBeGreaterThan(0);
            expect(attenuated).toBeLessThan(baseline);
        });

        it('feeds the attenuated intensity into the forced flower calculation', () => {
            camera.rotation.x = Math.PI / 3; // gazing toward -Z...
            gaze.update(0.016, { x: 0, y: 2, z: 100 }); // ...eye fully out of frame
            // Intensity 0 while gazing => forced value sits at the threshold start.
            expect(gaze.calculateForcedFlowerIntensity()).toBeCloseTo(GAZE.FLOWER_FORCED_START, 5);
        });
    });

    describe('reset', () => {
        it('should reset all state values', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(1.0);
            gaze.update(1.0);

            gaze.reset();

            const state = gaze.getState();
            expect(state.isGazing).toBe(false);
            expect(state.gazeIntensity).toBe(0);
            expect(state.gazeDuration).toBe(0);
            expect(state.totalGazeTime).toBe(0);
            expect(state.gazeEvents).toBe(0);
        });
    });

    describe('helper methods', () => {
        it('getPitch should return camera rotation.x', () => {
            camera.rotation.x = 0.5;
            expect(gaze.getPitch()).toBe(0.5);
        });

        it('isGazing should return current gaze state', () => {
            camera.rotation.x = 0;
            gaze.update(0.016);
            expect(gaze.isGazing()).toBe(false);

            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);
            expect(gaze.isGazing()).toBe(true);
        });

        it('getIntensity should return current intensity', () => {
            camera.rotation.x = Math.PI / 3;
            gaze.update(0.016);
            expect(gaze.getIntensity()).toBeGreaterThan(0);
        });
    });
});
