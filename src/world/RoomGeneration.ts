// 1-bit Chimera Void - Per-Room Procedural Generation Helpers
//
// Pure, deterministic helpers that give each RoomType a distinct building
// identity. Every function here is a pure function of integer chunk/index
// seeds (via hash() from utils/hash) plus the RoomType, so the same coords
// always produce the same output within a session. No THREE.js, no allocation
// of GPU resources — these are unit-testable in isolation (see tests/).
//
// AGGRESSIVENESS = MEDIUM: INFO_OVERFLOW strongly reduces (does not ban) TREE;
// POLARIZED is rigid BLOCKS and bans TREE *and* FLUID (no curves at all);
// IN_BETWEEN never settles (FLUID dominant); FORCED_ALIGNMENT is regimented
// BLOCKS/SPIKES.

import { hash } from '../utils/hash';
import { RoomType } from './RoomConfig';

/**
 * The four procedural building styles. String-literal union mirrors the
 * style strings the BuildingFactory / FloraFactory dispatch on in ChunkManager.
 */
export type BuildingStyle = 'BLOCKS' | 'SPIKES' | 'TREE' | 'FLUID';

/**
 * Selects a building style from a deterministic styleSeed in [0,1), skewed per
 * room. The seed is produced by the caller via hash(i, cx); the cutoffs here
 * replace the former inline literals in ChunkManager so each room reads as a
 * distinct "district".
 *
 * - INFO_OVERFLOW: machine district — BLOCKS/SPIKES dominant, TREE rare, no FLUID.
 * - IN_BETWEEN: never-settling — FLUID dominant.
 * - POLARIZED: rigid — BLOCKS dominant, no TREE, no FLUID (a little SPIKES texture).
 * - FORCED_ALIGNMENT: regimented — BLOCKS/SPIKES only.
 * - default (undefined room): the original mix (FLUID>0.9, TREE>0.7, SPIKES>0.35, else BLOCKS).
 *
 * @param styleSeed - Deterministic value in [0,1) (e.g. hash(i, cx)).
 * @param roomType - Room driving the skew, or undefined for the default mix.
 * @returns One of the four building styles.
 */
export function selectBuildingStyle(styleSeed: number, roomType?: RoomType): BuildingStyle {
    switch (roomType) {
        case RoomType.INFO_OVERFLOW:
            // Machine district: BLOCKS/SPIKES dominant, TREE rare, no FLUID.
            if (styleSeed > 0.95)
                return 'TREE';
            if (styleSeed > 0.5)
                return 'SPIKES';
            return 'BLOCKS';

        case RoomType.IN_BETWEEN:
            // Never-settling: FLUID dominant, the rest a thin spread.
            if (styleSeed > 0.35)
                return 'FLUID';
            if (styleSeed > 0.2)
                return 'TREE';
            if (styleSeed > 0.1)
                return 'SPIKES';
            return 'BLOCKS';

        case RoomType.POLARIZED:
            // Rigid: BLOCKS dominant, NO TREE (banned), NO FLUID — the room is
            // all straight lines, zero curves (flow-audit enhancement #11);
            // the former FLUID slice folds into BLOCKS. A little SPIKES texture.
            if (styleSeed > 0.75)
                return 'SPIKES';
            return 'BLOCKS';

        case RoomType.FORCED_ALIGNMENT:
            // Regimented: BLOCKS/SPIKES only, no organic shapes.
            if (styleSeed > 0.6)
                return 'SPIKES';
            return 'BLOCKS';

        default:
            // Original mix (preserves pre-Phase-2 behavior for any unset room).
            if (styleSeed > 0.9)
                return 'FLUID';
            if (styleSeed > 0.7)
                return 'TREE';
            if (styleSeed > 0.35)
                return 'SPIKES';
            return 'BLOCKS';
    }
}

/**
 * Salt for the sparse-clearing gate hash so it decorrelates from the building
 * count / position hashes already drawn for the same chunk.
 */
const SPARSE_GATE_SALT = 101;

/**
 * Deterministic building count for a chunk, with a sparse gate that turns a
 * fraction of chunks into near-empty clearings/landmarks. Most chunks stay
 * populated (the original 3-7 range); a minority drop to 0-1.
 *
 * Safe to return 0: createCables guards nodes.length<1 and the floor renders
 * independently of buildings.
 *
 * @param cx - Chunk X coordinate (integer).
 * @param cz - Chunk Z coordinate (integer).
 * @param roomType - Room driving how aggressive the sparse gate is.
 * @returns Integer building count (>= 0).
 */
export function chunkBuildingCount(cx: number, cz: number, roomType?: RoomType): number {
    // Base populated count: original 3-7 range, unchanged for full chunks.
    const base = 3 + Math.floor(hash(cx, cz + 1) * 5);

    // Sparse gate: a separate decorrelated hash bit. Per room, a fraction of
    // chunks become clearings. INFO_OVERFLOW packs the machine district densely
    // (fewest clearings); IN_BETWEEN opens up more voids.
    let clearingChance: number;
    switch (roomType) {
        case RoomType.INFO_OVERFLOW:
            clearingChance = 0.08;
            break;
        case RoomType.IN_BETWEEN:
            clearingChance = 0.22;
            break;
        case RoomType.POLARIZED:
            clearingChance = 0.15;
            break;
        case RoomType.FORCED_ALIGNMENT:
            clearingChance = 0.12;
            break;
        default:
            clearingChance = 0.15;
            break;
    }

    const gate = hash(cx + SPARSE_GATE_SALT, cz - SPARSE_GATE_SALT);
    if (gate < clearingChance) {
        // Near-empty: 0 or 1 building (landmark/clearing). A second bit decides.
        return hash(cz + SPARSE_GATE_SALT, cx) < 0.5 ? 0 : 1;
    }

    return base;
}

/**
 * Faction descriptor for a POLARIZED building: which pole (+X vs -X half) it is
 * pushed toward and whether it is a filled 'us' (solid) or hollow 'them' (wire)
 * faction. Deterministic per (cx, cz, i).
 */
export interface PolarizedFaction {
    /** +1 pushes toward +X half, -1 toward -X half. */
    pole: 1 | -1;
    /** True => filled solid material ('us'); false => hollow wire ('them'). */
    solid: boolean;
}

/**
 * Salt for the faction hash so it does not collide with the building-position
 * hashes (hash(cx+i, cz) / hash(cx, cz+i)) drawn for the same chunk.
 */
const FACTION_SALT = 211;

/**
 * Deterministic POLARIZED faction for building i in chunk (cx, cz). A single
 * hash bit picks the pole; a second picks the material faction. Building COUNT
 * is unaffected (callers must keep cable node indices valid).
 *
 * @param cx - Chunk X coordinate (integer).
 * @param cz - Chunk Z coordinate (integer).
 * @param i - Building index within the chunk.
 * @returns Pole sign and solid/wire faction flag.
 */
export function polarizedFaction(cx: number, cz: number, i: number): PolarizedFaction {
    const poleBit = hash(cx + i + FACTION_SALT, cz + FACTION_SALT);
    const solidBit = hash(cz + FACTION_SALT, cx + i + FACTION_SALT);
    return {
        pole: poleBit < 0.5 ? -1 : 1,
        solid: solidBit < 0.5,
    };
}

/**
 * FORCED_ALIGNMENT grid size, in world units. Buildings quantize to this grid.
 */
export const GRID_SNAP_SIZE = 8;

/**
 * Quantizes a coordinate to the FORCED_ALIGNMENT grid (Math.round(v/8)*8).
 * Pure helper extracted for testability; the occupancy check stays in the
 * caller (it needs per-chunk mutable state).
 *
 * @param v - World-space coordinate (chunk-local).
 * @returns The coordinate snapped to the nearest grid line.
 */
export function snapToGrid(v: number): number {
    return Math.round(v / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
}

// ============================================================================
// Phase 4 — World-scale variety (ORTHOGONAL to rooms)
//
// These layers run UNDER the per-room identity from Phase 2: biome and layout
// are the broad substrate (macro-rhythm and composition), roomType is the
// dominant overlay (it still dictates STYLE). Biome only nudges density and
// scale; it must never wash out per-room identity. Every draw below is a pure
// function of integer chunk seeds via hash(), with salts decorrelated from the
// Phase 1/2 position/style/faction/count hashes. No hash() in any per-frame path.
// ============================================================================

/**
 * Macro biome belts. Low-frequency (~BIOME_PERIOD-chunk) bands give the world a
 * coarse rhythm so wandering crosses overgrown -> rigid -> sparse zones. Biome
 * is the broad substrate; roomType remains the dominant overlay.
 *
 * - OVERGROWN: denser, taller — life pushing through.
 * - RIGID: regular, uniform scale — machine order.
 * - SPARSE: thinned out, voids — exhaustion.
 */
export type Biome = 'OVERGROWN' | 'RIGID' | 'SPARSE';

/** Period (in chunks) of the biome belts. ~6 chunks => slow macro-rhythm. */
export const BIOME_PERIOD = 6;

/**
 * Salt folded into the biome hash so the belt pattern decorrelates from every
 * other per-chunk draw (position, style, count, faction).
 */
const BIOME_SALT = 503;

/**
 * Deterministic biome for a chunk, sampled over low-frequency bands so adjacent
 * chunks usually share a biome (belts, not noise). Folds the band index through
 * hash() with a frozen salt; the result is a stable integer-seeded choice.
 *
 * @param cx - Chunk X coordinate (integer).
 * @param cz - Chunk Z coordinate (integer).
 * @returns One of the three biomes.
 */
export function biomeAt(cx: number, cz: number): Biome {
    // Quantize to belts: chunks in the same band fold to the same seed.
    const bandX = Math.floor(cx / BIOME_PERIOD);
    const bandZ = Math.floor(cz / BIOME_PERIOD);
    const h = hash(bandX + BIOME_SALT, bandZ - BIOME_SALT);
    if (h < 0.38)
        return 'OVERGROWN';
    if (h < 0.72)
        return 'RIGID';
    return 'SPARSE';
}

/**
 * Frozen integer salt for the biome layer, exposed so the caller can fold biome
 * into the existing hash()-based placement/style/density draws (see usage in
 * ChunkManager). Keeping it a constant guarantees within-session reproducibility.
 */
export const BIOME_HASH_SALT = BIOME_SALT;

/**
 * Multiplicative density nudge per biome. Applied to the populated building
 * count AFTER chunkBuildingCount() so it never affects the clearing gate (a
 * clearing stays a clearing). MEDIUM: a gentle push, not a wipe.
 *
 * @param biome - The chunk's biome.
 * @returns A multiplier in roughly [0.6, 1.4].
 */
export function biomeDensityFactor(biome: Biome): number {
    switch (biome) {
        case 'OVERGROWN':
            return 1.35;
        case 'SPARSE':
            return 0.6;
        case 'RIGID':
        default:
            return 1.0;
    }
}

/**
 * Multiplicative scale nudge per biome for building groups. OVERGROWN reads
 * taller/larger, SPARSE slightly shrunken, RIGID uniform. Subtle so the duotone
 * silhouette still reads per-room.
 *
 * @param biome - The chunk's biome.
 * @returns A uniform scale multiplier near 1.0.
 */
export function biomeScaleFactor(biome: Biome): number {
    switch (biome) {
        case 'OVERGROWN':
            return 1.2;
        case 'SPARSE':
            return 0.85;
        case 'RIGID':
        default:
            return 1.0;
    }
}

/**
 * Per-chunk layout mode: how the building positions are composed within the
 * chunk so the world reads as deliberate composition rather than uniform noise.
 * Cables follow automatically because they read positions post-placement.
 *
 * - SCATTER: the original loose random spread (default feel).
 * - CLUSTER: buildings pulled toward a single hash-seeded focal point.
 * - AXIAL_STREET: buildings snapped to a line (a "street") across the chunk.
 */
export type LayoutMode = 'SCATTER' | 'CLUSTER' | 'AXIAL_STREET';

/** Salt for the layout-mode hash, decorrelated from position/style/count. */
const LAYOUT_SALT = 607;

/**
 * Deterministic layout mode for a chunk. FORCED_ALIGNMENT always reads as a
 * rigid grid (handled separately by snapToGrid in the caller), so it is forced
 * to SCATTER here to avoid double-composition; every other room gets a
 * hash-chosen composition. POLARIZED leans AXIAL_STREET (a hard dividing line
 * suits the faction split) but is not forced, keeping MEDIUM aggressiveness.
 *
 * @param cx - Chunk X coordinate (integer).
 * @param cz - Chunk Z coordinate (integer).
 * @param roomType - Room driving the layout skew.
 * @returns The composition mode for this chunk.
 */
export function layoutAt(cx: number, cz: number, roomType?: RoomType): LayoutMode {
    // FORCED_ALIGNMENT already composes via the 8-unit occupancy grid; leave its
    // scatter-then-snap path untouched so the institutional grid still reads.
    if (roomType === RoomType.FORCED_ALIGNMENT)
        return 'SCATTER';

    const h = hash(cx + LAYOUT_SALT, cz + LAYOUT_SALT);
    if (roomType === RoomType.POLARIZED) {
        // Lean toward a hard axial dividing line; still allow some scatter.
        if (h < 0.55)
            return 'AXIAL_STREET';
        if (h < 0.8)
            return 'CLUSTER';
        return 'SCATTER';
    }

    if (h < 0.34)
        return 'SCATTER';
    if (h < 0.67)
        return 'CLUSTER';
    return 'AXIAL_STREET';
}

/**
 * Composition offsets for layout modes. Pure: given a raw scattered position
 * (rawX, rawZ in chunk-local space) and the chunk/index seeds, returns the
 * composed position. SCATTER returns the input unchanged so the legacy feel is
 * preserved bit-for-bit when the mode resolves to SCATTER.
 *
 * - CLUSTER: lerp the raw position toward a per-chunk focal point.
 * - AXIAL_STREET: snap one axis to a per-chunk street line, keeping the other.
 *
 * @param mode - The chunk's layout mode.
 * @param rawX - Raw scattered X (chunk-local).
 * @param rawZ - Raw scattered Z (chunk-local).
 * @param cx - Chunk X coordinate (integer seed).
 * @param cz - Chunk Z coordinate (integer seed).
 * @param i - Building index within the chunk.
 * @param half - Half-extent the positions are bounded to (e.g. (CHUNK_SIZE-20)/2).
 * @returns Composed { x, z } in chunk-local space.
 */
export function applyLayout(
    mode: LayoutMode,
    rawX: number,
    rawZ: number,
    cx: number,
    cz: number,
    i: number,
    half: number,
): { x: number; z: number } {
    switch (mode) {
        case 'CLUSTER': {
            // Per-chunk focal point (decorrelated salts), then pull each building
            // toward it by a hash-seeded amount in [0.45, 0.85).
            const focusX = (hash(cx + LAYOUT_SALT, cz) - 0.5) * half * 1.2;
            const focusZ = (hash(cx, cz + LAYOUT_SALT) - 0.5) * half * 1.2;
            const pull = 0.45 + hash(i + LAYOUT_SALT, cx) * 0.4;
            return {
                x: rawX + (focusX - rawX) * pull,
                z: rawZ + (focusZ - rawZ) * pull,
            };
        }
        case 'AXIAL_STREET': {
            // A street line. Orientation chosen per chunk; buildings sit ON the
            // line (the cross-axis snaps to the street offset) and slide ALONG it.
            const horizontal = hash(cx - LAYOUT_SALT, cz - LAYOUT_SALT) < 0.5;
            const streetOffset = (hash(cx + LAYOUT_SALT, cz - LAYOUT_SALT) - 0.5) * half;
            // Small per-building jitter off the line so it does not read as a ruler.
            const jitter = (hash(i + LAYOUT_SALT, cz + LAYOUT_SALT) - 0.5) * 3;
            return horizontal
                ? { x: rawX, z: streetOffset + jitter }
                : { x: streetOffset + jitter, z: rawZ };
        }
        case 'SCATTER':
        default:
            return { x: rawX, z: rawZ };
    }
}

/** Number of greyscale sub-palette tints exposed by SharedAssets.subTints. */
export const SUB_PALETTE_COUNT = 3;

/** Salt for the sub-palette hash, decorrelated from other per-chunk draws. */
const SUB_PALETTE_SALT = 709;

/**
 * Sub-palette index per biome (and lightly per room), selecting which of the
 * shared greyscale Lambert tints in SharedAssets a building leans toward. This
 * only nudges material/tint — never style or count — so per-room identity from
 * Phase 2 is preserved. Returns an index into a small fixed tint array
 * (0 = lightest .. SUB_PALETTE_COUNT-1 = darkest) so the duotone post-process
 * still maps cleanly.
 *
 * @param biome - The chunk's biome.
 * @param cx - Chunk X coordinate (integer seed).
 * @param cz - Chunk Z coordinate (integer seed).
 * @returns Integer tint index in [0, SUB_PALETTE_COUNT).
 */
export function subPaletteIndex(biome: Biome, cx: number, cz: number): number {
    const h = hash(cx + SUB_PALETTE_SALT, cz + SUB_PALETTE_SALT);
    // Bias the pick per biome: OVERGROWN tends lighter (mid-greys), RIGID mid,
    // SPARSE tends darker. Still hash-varied so a belt is not monochrome.
    let base: number;
    switch (biome) {
        case 'OVERGROWN':
            base = 0;
            break;
        case 'SPARSE':
            base = SUB_PALETTE_COUNT - 1;
            break;
        case 'RIGID':
        default:
            base = 1;
            break;
    }
    // 60% take the biome's base tint, 40% drift one step (hash-seeded).
    if (h < 0.6)
        return base;
    const drift = h < 0.8 ? -1 : 1;
    return Math.max(0, Math.min(SUB_PALETTE_COUNT - 1, base + drift));
}

/**
 * The rare-anomaly landmark kinds. A very small fraction of chunks are swapped
 * for one of these instead of the normal building loop.
 *
 * - COLOSSUS: a single colossal building dominating the chunk.
 * - SPIKE_GRID: a regular grid of spikes (a "field of needles").
 * - TREE_RING: a ring of trees around an empty center.
 */
export type AnomalyKind = 'COLOSSUS' | 'SPIKE_GRID' | 'TREE_RING';

/** Salt for the anomaly gate, decorrelated from every other per-chunk draw. */
const ANOMALY_SALT = 811;

/**
 * Rarity threshold for the anomaly gate. A chunk becomes an anomaly only when
 * its anomaly hash exceeds this, i.e. ~1.5% of chunks. Kept genuinely rare so
 * landmarks stay landmarks.
 */
export const ANOMALY_THRESHOLD = 0.985;

/**
 * Deterministic rare-anomaly descriptor for a chunk, or null for the (vast)
 * majority of chunks. The gate is a single decorrelated hash bit; a second bit
 * picks the kind. POLARIZED bans TREE (Phase 2 contract), so its TREE_RING pick
 * falls back to SPIKE_GRID, preserving the no-tree rule.
 *
 * @param cx - Chunk X coordinate (integer).
 * @param cz - Chunk Z coordinate (integer).
 * @param roomType - Room driving any per-room anomaly constraints.
 * @returns The anomaly kind, or null if this chunk is ordinary.
 */
export function anomalyAt(cx: number, cz: number, roomType?: RoomType): AnomalyKind | null {
    const gate = hash(cx + ANOMALY_SALT, cz - ANOMALY_SALT);
    if (gate <= ANOMALY_THRESHOLD)
        return null;

    const pick = hash(cz + ANOMALY_SALT, cx + ANOMALY_SALT);
    let kind: AnomalyKind;
    if (pick < 0.34)
        kind = 'COLOSSUS';
    else if (pick < 0.67)
        kind = 'SPIKE_GRID';
    else
        kind = 'TREE_RING';

    // Respect Phase 2 per-room bans: no TREE in POLARIZED / FORCED_ALIGNMENT.
    if (kind === 'TREE_RING'
        && (roomType === RoomType.POLARIZED || roomType === RoomType.FORCED_ALIGNMENT)) {
        kind = 'SPIKE_GRID';
    }

    return kind;
}
