// 1-bit Chimera Void - Snapshot pattern evaluation (shared)
// The sunset snapshot's 1-bit pattern math, extracted from SnapshotOverlay so
// the share card (F6) renders the exact same fingerprint — one algorithm, two
// canvases. Pure functions of (pattern, u, v, time); no DOM, no state.

import type { PatternUniforms } from './StateSnapshotGenerator';

function hash(x: number, y: number): number {
    // Proper fract() (matching the GLSL twin); JS `% 1` is signed and biases
    // half the grid negative, darkening the noise pattern.
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return h - Math.floor(h);
}

function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Simple 2D value noise (smoothstep-interpolated corner hashes). */
function noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // Smoothstep
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    // Hash corners
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);

    // Bilinear interpolation
    return mix(mix(a, b, sx), mix(c, d, sx), sy);
}

/**
 * Evaluate the snapshot pattern field at normalized (u, v) in [0, 1).
 * `time` animates the noise drift / radial pulse — the overlay feeds its
 * patternTime; the share card freezes it at 0 (the overlay's first frame).
 */
export function evaluatePattern(pattern: PatternUniforms, u: number, v: number, time: number): number {
    switch (pattern.uPatternMode) {
        case 0: // Noise
            return noise(u * pattern.uFrequency, v * pattern.uFrequency + time * 0.1);
        case 1: // Stripes
            return Math.sin((u + v * Math.tan(pattern.uPhase)) * pattern.uFrequency) * 0.5 + 0.5;
        case 2: // Checkerboard
            return (Math.floor(u * pattern.uFrequency) + Math.floor(v * pattern.uFrequency)) % 2;
        case 3: { // Radial
            const dx = u - 0.5;
            const dy = v - 0.5;
            return Math.sin(Math.sqrt(dx * dx + dy * dy) * pattern.uFrequency + pattern.uPhase + time * 0.5) * 0.5 + 0.5;
        }
        default:
            return 0;
    }
}

/** 1-bit threshold: a cell is white when the field exceeds 1 - density. */
export function isPatternWhite(pattern: PatternUniforms, u: number, v: number, time: number): boolean {
    return evaluatePattern(pattern, u, v, time) > (1.0 - pattern.uDensity);
}
