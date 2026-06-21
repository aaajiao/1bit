// Tests for the first-person view-model layout math (visual-stability fix).
// Pure-function coverage: the NDC<->camera-space mapping (with a desktop
// 16:9 regression guard that reproduces today's fixed hand offsets), the
// portrait on-screen guarantee, flower-recompose monotonicity, and the
// safe-area lift's graceful degradation.
import { describe, expect, it } from 'vitest';
import { CAMERA, VIEWMODEL } from '../src/config';
import {
    cameraSpaceToNdc,
    flowerRecompose,
    handSizeFactor,
    ndcToCameraSpace,
    safeAreaLiftCameraSpace,
} from '../src/player/viewmodelLayout';

const VFOV = CAMERA.FOV_DEGREES; // 80
const REF_ASPECT = VIEWMODEL.REFERENCE_ASPECT;

describe('reference constants stay coupled to the live camera', () => {
    it('anchors were derived at the runtime FOV and aspect', () => {
        // The NDC anchors are baked at REFERENCE_FOV_DEGREES / REFERENCE_ASPECT.
        // If the camera FOV ever moves, the baked anchors silently stop
        // reproducing the legacy framing — fail loudly here instead of letting
        // the 16:9 guard fail with a cryptic off-by-a-little number.
        expect(VIEWMODEL.REFERENCE_FOV_DEGREES).toBe(CAMERA.FOV_DEGREES);
        expect(VIEWMODEL.REFERENCE_ASPECT).toBeCloseTo(16 / 9, 6);
    });
});

describe('ndcToCameraSpace — desktop regression guard', () => {
    it('reproduces the RIGHT hand fixed offset (0.6, -0.7) at 16:9', () => {
        const { x, y } = ndcToCameraSpace(
            VIEWMODEL.RIGHT_HAND.ndcX,
            VIEWMODEL.RIGHT_HAND.ndcY,
            VIEWMODEL.RIGHT_HAND.z,
            REF_ASPECT,
            VFOV,
        );
        expect(x).toBeCloseTo(0.6, 2);
        expect(y).toBeCloseTo(-0.7, 2);
    });

    it('reproduces the LEFT hand fixed offset (-0.55, -0.6) at 16:9', () => {
        const { x, y } = ndcToCameraSpace(
            VIEWMODEL.LEFT_HAND.ndcX,
            VIEWMODEL.LEFT_HAND.ndcY,
            VIEWMODEL.LEFT_HAND.z,
            REF_ASPECT,
            VFOV,
        );
        expect(x).toBeCloseTo(-0.55, 2);
        expect(y).toBeCloseTo(-0.6, 2);
    });
});

describe('ndcToCameraSpace — round trip', () => {
    it('cameraSpaceToNdc inverts ndcToCameraSpace at an arbitrary aspect', () => {
        const aspect = 1.3;
        const { x, y } = ndcToCameraSpace(0.25, -0.4, -0.9, aspect, VFOV);
        const back = cameraSpaceToNdc(x, y, -0.9, aspect, VFOV);
        expect(back.ndcX).toBeCloseTo(0.25, 6);
        expect(back.ndcY).toBeCloseTo(-0.4, 6);
    });
});

describe('portrait stability — hand stays on screen', () => {
    // Phone portrait aspect (~9:19.5). By construction the anchored hand lands
    // at exactly its target NDC, which is inside [-1,1] => on screen, not
    // clipped off the side as the fixed-offset version would be.
    const PORTRAIT = 9 / 19.5;

    it('right hand resolves to its target NDC (on screen) on portrait', () => {
        const { x, y } = ndcToCameraSpace(
            VIEWMODEL.RIGHT_HAND.ndcX,
            VIEWMODEL.RIGHT_HAND.ndcY,
            VIEWMODEL.RIGHT_HAND.z,
            PORTRAIT,
            VFOV,
        );
        const ndc = cameraSpaceToNdc(x, y, VIEWMODEL.RIGHT_HAND.z, PORTRAIT, VFOV);
        expect(ndc.ndcX).toBeCloseTo(VIEWMODEL.RIGHT_HAND.ndcX, 6);
        expect(ndc.ndcY).toBeCloseTo(VIEWMODEL.RIGHT_HAND.ndcY, 6);
        expect(Math.abs(ndc.ndcX)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.ndcY)).toBeLessThanOrEqual(1);
    });

    it('fixed-offset version WOULD clip the right hand off screen on portrait', () => {
        // Sanity contrast: the old behavior (fixed camera-space x = 0.6) maps to
        // an NDC far outside [-1,1] on portrait — the bug this fix removes.
        const fixed = cameraSpaceToNdc(0.6, -0.7, VIEWMODEL.RIGHT_HAND.z, PORTRAIT, VFOV);
        expect(Math.abs(fixed.ndcX)).toBeGreaterThan(1);
    });
});

describe('flowerRecompose', () => {
    const P = VIEWMODEL.FLOWER_RECOMPOSE;

    it('is a no-op at/above START_ASPECT', () => {
        const wide = flowerRecompose(P.START_ASPECT, P);
        expect(wide.scale).toBeCloseTo(1, 6);
        expect(wide.centerFactor).toBeCloseTo(0, 6);
        const wider = flowerRecompose(P.START_ASPECT + 1, P);
        expect(wider.scale).toBeCloseTo(1, 6);
        expect(wider.centerFactor).toBeCloseTo(0, 6);
    });

    it('reaches full effect at/below FULL_ASPECT', () => {
        const full = flowerRecompose(P.FULL_ASPECT, P);
        expect(full.scale).toBeCloseTo(P.MAX_SCALE_MULT, 6);
        expect(full.centerFactor).toBeCloseTo(P.MAX_CENTER_FRACTION, 6);
        const beyond = flowerRecompose(P.FULL_ASPECT - 0.2, P);
        expect(beyond.scale).toBeCloseTo(P.MAX_SCALE_MULT, 6);
        expect(beyond.centerFactor).toBeCloseTo(P.MAX_CENTER_FRACTION, 6);
    });

    it('scale grows monotonically as aspect shrinks', () => {
        const aspects = [1.2, 1.0, 0.9, 0.75, 0.6, 0.5];
        let prevScale = -Infinity;
        let prevCenter = -Infinity;
        for (const a of aspects) {
            const r = flowerRecompose(a, P);
            expect(r.scale).toBeGreaterThanOrEqual(prevScale);
            expect(r.centerFactor).toBeGreaterThanOrEqual(prevCenter);
            prevScale = r.scale;
            prevCenter = r.centerFactor;
        }
    });
});

describe('handSizeFactor — narrow-aspect squish fix', () => {
    const REF = VIEWMODEL.REFERENCE_ASPECT;
    const MIN = VIEWMODEL.HAND_SCALE.MIN;

    it('is 1 at and above the reference aspect (desktop unchanged)', () => {
        expect(handSizeFactor(REF, REF, MIN)).toBeCloseTo(1, 6);
        expect(handSizeFactor(REF + 1, REF, MIN)).toBeCloseTo(1, 6);
        expect(handSizeFactor(3, REF, MIN)).toBeCloseTo(1, 6);
    });

    it('shrinks proportionally as the viewport narrows', () => {
        // Square viewport: aspect 1 -> 1 / (16/9) = 0.5625.
        expect(handSizeFactor(1, REF, MIN)).toBeCloseTo(1 / REF, 6);
        // Monotonic decrease as aspect shrinks.
        const a = handSizeFactor(1.2, REF, MIN);
        const b = handSizeFactor(0.9, REF, MIN);
        const c = handSizeFactor(0.7, REF, MIN);
        expect(a).toBeGreaterThanOrEqual(b);
        expect(b).toBeGreaterThanOrEqual(c);
    });

    it('clamps to MIN on extreme portrait so hands never vanish', () => {
        // Phone portrait (~9:19.5) would compute below MIN -> clamped.
        expect(handSizeFactor(9 / 19.5, REF, MIN)).toBe(MIN);
        expect(handSizeFactor(0.01, REF, MIN)).toBe(MIN);
    });

    it('degrades to 1 for a non-positive reference aspect', () => {
        expect(handSizeFactor(0.5, 0, MIN)).toBe(1);
    });
});

describe('safeAreaLiftCameraSpace', () => {
    it('returns 0 when inset or viewport is non-positive (graceful degrade)', () => {
        expect(safeAreaLiftCameraSpace(0, 800, -0.9, VFOV)).toBe(0);
        expect(safeAreaLiftCameraSpace(34, 0, -0.9, VFOV)).toBe(0);
        expect(safeAreaLiftCameraSpace(Number.NaN, 800, -0.9, VFOV)).toBe(0);
    });

    it('lifts proportionally to the inset fraction of viewport height', () => {
        const lift = safeAreaLiftCameraSpace(34, 800, -0.9, VFOV);
        // Positive, and larger insets lift more.
        expect(lift).toBeGreaterThan(0);
        const bigger = safeAreaLiftCameraSpace(68, 800, -0.9, VFOV);
        expect(bigger).toBeGreaterThan(lift);
    });
});
