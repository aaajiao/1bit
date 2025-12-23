import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GazeMechanic } from '../src/player/GazeMechanic';

describe('GazeMechanic', () => {
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
            expect(gaze.calculateForcedFlowerIntensity()).toBeCloseTo(0.1, 2);
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
