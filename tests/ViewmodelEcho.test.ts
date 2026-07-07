import { describe, expect, it } from 'vitest';
import { CAMERA, VIEWMODEL, VIEWMODEL_ECHO } from '../src/config/constants';
import {
    createEchoGateState,
    echoFlickerVisible,
    misregisterOffsetX,
    stepEchoGate,
} from '../src/player/ViewmodelEcho';
import { cameraSpaceToNdc } from '../src/player/viewmodelLayout';

/** Drive the gate `n` frames at a fixed room condition; collect visibility. */
function run(state: ReturnType<typeof createEchoGateState>, wantVisible: boolean, n: number): boolean[] {
    const out: boolean[] = [];
    for (let i = 0; i < n; i++) {
        out.push(stepEchoGate(state, wantVisible, VIEWMODEL_ECHO.FLICKER_FRAMES));
    }
    return out;
}

describe('echoFlickerVisible', () => {
    it('hides on odd counts and shows on even counts (RoomSky swap parity)', () => {
        expect(echoFlickerVisible(3)).toBe(false);
        expect(echoFlickerVisible(2)).toBe(true);
        expect(echoFlickerVisible(1)).toBe(false);
        expect(echoFlickerVisible(0)).toBe(true);
    });
});

describe('stepEchoGate', () => {
    it('starts hidden and stays hidden outside IN_BETWEEN with zero flicker work', () => {
        const state = createEchoGateState();
        expect(run(state, false, 5)).toEqual([false, false, false, false, false]);
        expect(state.framesLeft).toBe(0); // never armed: hidden frames are free
    });

    it('entering the room flickers off/on/off then settles visible', () => {
        const state = createEchoGateState();
        // FLICKER_FRAMES = 3: parity gives hidden, visible, hidden, then settle.
        expect(run(state, true, 5)).toEqual([false, true, false, true, true]);
        expect(state.framesLeft).toBe(0);
        expect(state.target).toBe(true);
    });

    it('leaving the room flickers and settles hidden (symmetric swap language)', () => {
        const state = createEchoGateState();
        run(state, true, 5); // settle visible first
        expect(run(state, false, 5)).toEqual([false, true, false, false, false]);
        expect(state.target).toBe(false);
    });

    it('a room flip mid-flicker re-arms the countdown toward the new target', () => {
        const state = createEchoGateState();
        stepEchoGate(state, true, 3); // arm toward visible, framesLeft now 2
        expect(state.framesLeft).toBe(2);
        // Flip back before settling: re-armed at full length, new target hidden.
        stepEchoGate(state, false, 3);
        expect(state.target).toBe(false);
        expect(state.framesLeft).toBe(2);
        expect(run(state, false, 4)).toEqual([true, false, false, false]);
    });

    it('zero flicker frames degrades to an instant hard toggle', () => {
        const state = createEchoGateState();
        expect(stepEchoGate(state, true, 0)).toBe(true);
        expect(stepEchoGate(state, false, 0)).toBe(false);
    });

    it('config: FLICKER_FRAMES is a small odd count so the countdown ends hidden', () => {
        // Odd => the last flicker frame is hidden and the settle frame pops
        // (off/on/off -> on), matching ROOM_SKY.SWAP_FLICKER_FRAMES language.
        expect(VIEWMODEL_ECHO.FLICKER_FRAMES % 2).toBe(1);
        expect(VIEWMODEL_ECHO.FLICKER_FRAMES).toBeGreaterThanOrEqual(1);
        expect(VIEWMODEL_ECHO.FLICKER_FRAMES).toBeLessThanOrEqual(5);
    });
});

describe('misregisterOffsetX', () => {
    it('returns the authored offset at the reference aspect', () => {
        expect(misregisterOffsetX(0.035, VIEWMODEL.REFERENCE_ASPECT, VIEWMODEL.REFERENCE_ASPECT))
            .toBeCloseTo(0.035, 12);
    });

    it('scales linearly with aspect (holds the offset constant on the page)', () => {
        const ref = VIEWMODEL.REFERENCE_ASPECT;
        expect(misregisterOffsetX(0.035, ref * 2, ref)).toBeCloseTo(0.07, 12);
        expect(misregisterOffsetX(0.035, ref / 2, ref)).toBeCloseTo(0.0175, 12);
    });

    it('keeps the NDC offset aspect-invariant at the viewmodel depth', () => {
        const ref = VIEWMODEL.REFERENCE_ASPECT;
        const z = VIEWMODEL.RIGHT_HAND.z + VIEWMODEL_ECHO.OFFSET_Z;
        const refNdc = cameraSpaceToNdc(
            VIEWMODEL_ECHO.OFFSET_X,
            0,
            z,
            ref,
            CAMERA.FOV_DEGREES,
        ).ndcX;
        for (const aspect of [0.5, 1.0, ref, 2.4, 32 / 9]) {
            const x = misregisterOffsetX(VIEWMODEL_ECHO.OFFSET_X, aspect, ref);
            const ndc = cameraSpaceToNdc(x, 0, z, aspect, CAMERA.FOV_DEGREES).ndcX;
            expect(ndc).toBeCloseTo(refNdc, 10);
        }
    });

    it('guards a non-positive reference aspect by returning the base', () => {
        expect(misregisterOffsetX(0.035, 1.5, 0)).toBe(0.035);
        expect(misregisterOffsetX(0.035, 1.5, -1)).toBe(0.035);
    });

    it('config: the offset reads as a few centimeters of misregistration', () => {
        // x/y stay small (misregister, not a doppelganger); z pushes the echo
        // strictly DEEPER so overlap regions lose the depth test cleanly.
        expect(VIEWMODEL_ECHO.OFFSET_X).toBeGreaterThan(0);
        expect(Math.abs(VIEWMODEL_ECHO.OFFSET_X)).toBeLessThanOrEqual(0.1);
        expect(Math.abs(VIEWMODEL_ECHO.OFFSET_Y)).toBeLessThanOrEqual(0.1);
        expect(VIEWMODEL_ECHO.OFFSET_Z).toBeLessThan(0);
    });
});
