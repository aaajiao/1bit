// 1-bit Chimera Void - Blue-noise dither texture (F5 "每房间抖动图案")
// Best-candidate ordered-dither generation: a SIZE x SIZE threshold texture
// whose ranks are assigned in maximally-spread order, so thresholding any
// gray level against it yields an even, structureless point distribution —
// chaos without the Bayer grid's crystalline order. Generated ONCE at boot
// (one-time ~tens of ms), deterministic via the project hash, no RNG state.
import * as THREE from 'three';
import { BLUE_NOISE } from '../config';
import { hash } from '../utils/hash';

/**
 * Generate the normalized threshold ranks of a size x size blue-noise
 * ordered-dither texture via best-candidate sampling:
 *
 * Texels are placed one at a time; each placement draws `candidates` random
 * texels from the not-yet-placed pool and keeps the one farthest (toroidal
 * metric, so the texture tiles seamlessly) from every already-placed texel.
 * The placement ORDER is the texel's rank — exactly like a Bayer matrix's
 * ordering, but blue. Threshold = (rank + 0.5) / total, a permutation of the
 * centered uniform levels.
 *
 * Deterministic: the candidate stream is hash(seed, step) (utils/hash), so
 * the same seed always builds the identical texture. Pure.
 */
export function generateBlueNoiseRanks(
    size: number = BLUE_NOISE.SIZE,
    seed: number = BLUE_NOISE.SEED,
    candidates: number = BLUE_NOISE.CANDIDATES,
): Float32Array {
    const total = size * size;
    const thresholds = new Float32Array(total);
    // Exact squared toroidal distance from each texel to its nearest placed
    // point. Updated in full after every placement: total^2 cheap iterations
    // (64^4 ≈ 16.7M adds/compares), a one-time boot cost.
    const distSq = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
    // Wrapped per-axis squared deltas (toroidal metric lookup).
    const wrapSq = new Float64Array(size);
    for (let d = 0; d < size; d++) {
        const m = Math.min(d, size - d);
        wrapSq[d] = m * m;
    }
    // Not-yet-placed texel pool (swap-remove) for O(1) candidate draws.
    const unplaced = new Uint32Array(total);
    for (let i = 0; i < total; i++)
        unplaced[i] = i;
    let poolSize = total;

    // Deterministic candidate stream off the project hash.
    let step = 0;
    const rand = (): number => hash(seed, ++step);

    for (let rank = 0; rank < total; rank++) {
        // Best candidate: of `candidates` random unplaced texels, keep the
        // one with the greatest nearest-placed distance. First placement
        // (all distances infinite) keeps the first draw.
        let bestPool = Math.min(poolSize - 1, Math.floor(rand() * poolSize));
        let bestDist = distSq[unplaced[bestPool]];
        for (let c = 1; c < candidates; c++) {
            const p = Math.min(poolSize - 1, Math.floor(rand() * poolSize));
            const d = distSq[unplaced[p]];
            if (d > bestDist) {
                bestDist = d;
                bestPool = p;
            }
        }
        const texel = unplaced[bestPool];
        unplaced[bestPool] = unplaced[--poolSize];

        thresholds[texel] = (rank + 0.5) / total;

        // Fold the new point into every texel's nearest-placed distance.
        const px = texel % size;
        const py = (texel - px) / size;
        for (let y = 0, j = 0; y < size; y++) {
            const dy = wrapSq[Math.abs(y - py)];
            for (let x = 0; x < size; x++, j++) {
                const d = dy + wrapSq[Math.abs(x - px)];
                if (d < distSq[j])
                    distSq[j] = d;
            }
        }
    }
    return thresholds;
}

/**
 * Quantize a normalized rank threshold to the texture's byte value.
 * Mapped onto 1..255 (never 0): a 0-byte threshold would make its texel
 * paper-white even over pure-black input (gray < 0 is unsatisfiable), so the
 * floor of the range stays at 1/255 — black regions dither to solid ink,
 * matching the Bayer matrices (whose minimum threshold is also nonzero).
 * Pure; exported for testing.
 */
export function quantizeRankToByte(threshold: number): number {
    return Math.min(255, 1 + Math.floor(threshold * 255));
}

/**
 * Build the boot-time blue-noise DataTexture the DitherShader samples
 * (tBlueNoise): grayscale RGBA bytes, NearestFilter (it is a threshold
 * lookup, not an image) and RepeatWrapping so the GLSL can tile it by
 * sampling raw scaled pixel coords / BLUE_NOISE_SIZE.
 */
export function createBlueNoiseTexture(
    size: number = BLUE_NOISE.SIZE,
    seed: number = BLUE_NOISE.SEED,
): THREE.DataTexture {
    const ranks = generateBlueNoiseRanks(size, seed, BLUE_NOISE.CANDIDATES);
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < ranks.length; i++) {
        const v = quantizeRankToByte(ranks[i]);
        const o = i * 4;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
}
