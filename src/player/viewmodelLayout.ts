// First-person view-model layout math (pure, THREE-free, unit-testable).
//
// The hands + held flower are children of the camera. The camera uses a FIXED
// vertical FOV (CAMERA.FOV_DEGREES, 80°); only camera.aspect changes on resize.
// Anchoring each child by a screen-space NDC position and recomputing its
// camera-space x/y from the live aspect every frame keeps it at exactly that
// NDC for ANY aspect ratio — stable by construction, no aspect clamp needed.
//
// These helpers are plain trig + clamps so they test cleanly without a scene.

/** Camera-space position (x,y at a given depth z). */
export interface CameraSpacePos {
    x: number;
    y: number;
}

/** Tunable knobs for the flower's narrow-aspect recompose. */
export interface FlowerRecomposeParams {
    /** Aspect at/above which the flower is untouched. */
    START_ASPECT: number;
    /** Aspect at/below which the recompose is fully applied. */
    FULL_ASPECT: number;
    /** Max fraction of the right hand's camera-space x to cancel (pull to center). */
    MAX_CENTER_FRACTION: number;
    /** Max uniform scale multiplier at full recompose. */
    MAX_SCALE_MULT: number;
}

/** Result of {@link flowerRecompose}: how far to pull-to-center and how much to grow. */
export interface FlowerRecompose {
    /**
     * Fraction (0..MAX_CENTER_FRACTION) of the parent hand's camera-space x to
     * cancel by nudging the flower's local x in the opposite direction. 0 = no
     * nudge (wide aspect), MAX_CENTER_FRACTION = full pull toward center.
     */
    centerFactor: number;
    /** Uniform scale multiplier (1..MAX_SCALE_MULT). 1 = unchanged (wide aspect). */
    scale: number;
}

/**
 * Convert a screen-space NDC anchor + camera-space depth into a camera-space
 * (x,y) using the live viewport aspect and a vertical FOV.
 *
 *   halfH = |z| * tan(vFovDeg/2)   (camera-space half-height at depth z)
 *   halfW = halfH * aspect         (camera-space half-width  at depth z)
 *   x     = ndcX * halfW
 *   y     = ndcY * halfH
 *
 * @param ndcX  Horizontal anchor in [-1, 1] (right is +).
 * @param ndcY  Vertical anchor in [-1, 1] (up is +).
 * @param z     Camera-space depth (negative = in front of the camera).
 * @param aspect Viewport aspect (width / height).
 * @param vFovDeg Vertical field of view in degrees.
 */
export function ndcToCameraSpace(
    ndcX: number,
    ndcY: number,
    z: number,
    aspect: number,
    vFovDeg: number,
): CameraSpacePos {
    const halfH = Math.abs(z) * Math.tan((vFovDeg * Math.PI) / 180 / 2);
    const halfW = halfH * aspect;
    return { x: ndcX * halfW, y: ndcY * halfH };
}

/**
 * The inverse: where on screen (NDC) does a camera-space (x,y) at depth z land
 * under the given aspect/FOV. Used by tests to assert that an anchored hand
 * stays on screen ([-1,1]) on a portrait aspect.
 */
export function cameraSpaceToNdc(
    x: number,
    y: number,
    z: number,
    aspect: number,
    vFovDeg: number,
): { ndcX: number; ndcY: number } {
    const halfH = Math.abs(z) * Math.tan((vFovDeg * Math.PI) / 180 / 2);
    const halfW = halfH * aspect;
    return { ndcX: x / halfW, ndcY: y / halfH };
}

/**
 * Narrow-aspect flower recompose. Returns a 0..1 progress mapped onto a
 * center-pull fraction and a scale multiplier. Both effects grow monotonically
 * as the aspect shrinks from START_ASPECT down to FULL_ASPECT, then clamp.
 *
 * @param aspect Live viewport aspect (width / height).
 * @param params Recompose knobs (config/VIEWMODEL.FLOWER_RECOMPOSE).
 */
export function flowerRecompose(
    aspect: number,
    params: FlowerRecomposeParams,
): FlowerRecompose {
    const { START_ASPECT, FULL_ASPECT, MAX_CENTER_FRACTION, MAX_SCALE_MULT } = params;
    // Progress 0 at/above START_ASPECT, 1 at/below FULL_ASPECT, linear between.
    const span = START_ASPECT - FULL_ASPECT;
    const raw = span > 0 ? (START_ASPECT - aspect) / span : 0;
    const progress = Math.max(0, Math.min(1, raw));
    return {
        centerFactor: progress * MAX_CENTER_FRACTION,
        scale: 1 + progress * (MAX_SCALE_MULT - 1),
    };
}

/**
 * Convert a bottom safe-area inset (CSS px) into the camera-space Y lift that
 * keeps the view-model clear of the inset. The inset is a fraction of the
 * viewport height; doubling for the full NDC span (NDC is [-1,1] = 2 units of
 * half-height) gives the NDC lift, then {@link ndcToCameraSpace}'s halfH scales
 * it to camera space at the given depth.
 *
 * Degrades to 0 when the inset or viewport height is unavailable / non-positive.
 *
 * @param insetBottomPx Bottom safe-area inset in CSS pixels.
 * @param viewportHeightPx Viewport height in CSS pixels.
 * @param z Camera-space depth (negative) to express the lift at.
 * @param vFovDeg Vertical field of view in degrees.
 */
export function safeAreaLiftCameraSpace(
    insetBottomPx: number,
    viewportHeightPx: number,
    z: number,
    vFovDeg: number,
): number {
    if (!(insetBottomPx > 0) || !(viewportHeightPx > 0))
        return 0;
    // Inset as a fraction of the full viewport height -> NDC span (×2) -> camera-space.
    const ndcLift = (insetBottomPx / viewportHeightPx) * 2;
    const halfH = Math.abs(z) * Math.tan((vFovDeg * Math.PI) / 180 / 2);
    return ndcLift * halfH;
}
