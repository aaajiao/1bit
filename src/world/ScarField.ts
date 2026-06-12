// 1-bit Chimera Void - World Scar Field (F2 "the system remembers you resisted")
// Pure math for the permanent geometric distortion around the places the
// player successfully resisted (cross-session scars, stats/ScarStorage).
// Buildings near a scar point lean, settle and dislocate — deterministic per
// building via the project hash, severity growing gently with the aggregated
// resistance count and clamped by the SCAR_FIELD config. No THREE imports:
// ChunkManager applies the returned numbers to the freshly built group.

import { SCAR_FIELD, WORLD } from '../config/constants';
import { hash } from '../utils/hash';

/**
 * One persisted scar: the WORLD position the resistance happened at
 * (quantized to SCAR_STORAGE.POSITION_GRID) plus how many times it happened
 * near there. The anchor IS the place — "the system remembers you resisted"
 * must distort the spot the player actually stood on, not the cluster's
 * administrative center (which can be 50-113m away).
 */
export interface ScarPoint {
    /** Quantized world x coordinate of the resistance (m). */
    x: number;
    /** Quantized world z coordinate of the resistance (m). */
    z: number;
    /** Aggregated successful-override count at this place (>= 1). */
    count: number;
}

/**
 * Structural source of the boot-time scar snapshot (satisfied by
 * stats/ScarStorage.ScarStore without a world -> stats import).
 */
export interface ScarFieldSource {
    getScars: () => readonly ScarPoint[];
}

/** Per-building deterministic distortion amounts (all clamped by SCAR_FIELD). */
export interface ScarDistortion {
    /** Lean around the x axis (radians, signed). */
    tiltX: number;
    /** Lean around the z axis (radians, signed). */
    tiltZ: number;
    /** Downward settle (m, >= 0). */
    sink: number;
    /** Lateral dislocation on x (m, signed). */
    offsetX: number;
    /** Lateral dislocation on z (m, signed). */
    offsetZ: number;
}

// Distinct integer salts (decorrelated from every prior per-chunk draw in
// ChunkManager, whose salts top out at 1019).
const SCAR_TILT_X_SALT = 1117;
const SCAR_TILT_Z_SALT = 1123;
const SCAR_SINK_SALT = 1129;
const SCAR_OFFSET_X_SALT = 1151;
const SCAR_OFFSET_Z_SALT = 1153;

/**
 * Depth of a scar in [MIN_DEPTH, 1] from its aggregated count: visible from
 * the first resistance, ramping linearly to 1 at COUNT_SATURATION (温和递增,
 * clamped). Pure; exported for testing.
 */
export function scarDepth(count: number): number {
    const { COUNT_SATURATION, MIN_DEPTH } = SCAR_FIELD;
    const c = count < 0 ? 0 : count;
    const ratio = Math.min(1, c / COUNT_SATURATION);
    return MIN_DEPTH + (1 - MIN_DEPTH) * ratio;
}

/**
 * Scar severity in [0,1] at a world position: for each scar, depth(count)
 * scaled by a linear falloff from the scar's world anchor out to
 * SCAR_FIELD.RADIUS; the MAX over all scars wins (overlapping scars do not
 * stack — the deepest wound shows). 0 when no scar reaches the point. Pure.
 */
export function scarSeverityAt(
    scars: readonly ScarPoint[],
    worldX: number,
    worldZ: number,
): number {
    const { RADIUS } = SCAR_FIELD;
    let severity = 0;
    for (const scar of scars) {
        const dx = worldX - scar.x;
        const dz = worldZ - scar.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= RADIUS)
            continue;
        const s = scarDepth(scar.count) * (1 - dist / RADIUS);
        if (s > severity)
            severity = s;
    }
    return severity;
}

/**
 * Deterministic per-building distortion for a severity in [0,1] (clamped):
 * hash-seeded lean/settle/dislocation, every component scaled by severity
 * and clamped by the SCAR_FIELD maxima. severity<=0 returns all zeros, so
 * unscarred terrain is bit-identical to the pre-F2 world. Pure.
 *
 * @param severity - Scar severity at the building's world position.
 * @param i - Building index within the chunk (deterministic seed).
 * @param cx - Chunk X coordinate (deterministic seed).
 * @param cz - Chunk Z coordinate (deterministic seed).
 */
export function scarDistortionFor(
    severity: number,
    i: number,
    cx: number,
    cz: number,
): ScarDistortion {
    const s = severity <= 0 ? 0 : severity >= 1 ? 1 : severity;
    if (s === 0) {
        return { tiltX: 0, tiltZ: 0, sink: 0, offsetX: 0, offsetZ: 0 };
    }
    const { MAX_TILT_RAD, MAX_SINK, MAX_OFFSET } = SCAR_FIELD;
    return {
        tiltX: (hash(i + SCAR_TILT_X_SALT, cx) - 0.5) * 2 * MAX_TILT_RAD * s,
        tiltZ: (hash(i + SCAR_TILT_Z_SALT, cz) - 0.5) * 2 * MAX_TILT_RAD * s,
        sink: hash(i + SCAR_SINK_SALT, cx + cz) * MAX_SINK * s,
        offsetX: (hash(i + SCAR_OFFSET_X_SALT, cx) - 0.5) * 2 * MAX_OFFSET * s,
        offsetZ: (hash(i + SCAR_OFFSET_Z_SALT, cz) - 0.5) * 2 * MAX_OFFSET * s,
    };
}

/**
 * The subset of scars whose influence circle can reach chunk (cx, cz)'s
 * floor footprint (centered on cx*chunkSize, half-extent chunkSize/2 —
 * the worldToChunkCoord convention). ChunkManager calls this once per chunk
 * build so the per-building severity loop only walks scars that matter
 * (usually none). Pure.
 */
export function scarsNearChunk(
    scars: readonly ScarPoint[],
    cx: number,
    cz: number,
    chunkSize: number = WORLD.CHUNK_SIZE,
): ScarPoint[] {
    const { RADIUS } = SCAR_FIELD;
    const half = chunkSize / 2;
    return scars.filter((scar) => {
        // Distance from the scar anchor to the chunk footprint box.
        const dx = Math.max(0, Math.abs(scar.x - cx * chunkSize) - half);
        const dz = Math.max(0, Math.abs(scar.z - cz * chunkSize) - half);
        return Math.hypot(dx, dz) < RADIUS;
    });
}
