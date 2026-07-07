// 1-bit Chimera Void - FORCED_ALIGNMENT Shadow Aftermath ("the system re-tidies")
//
// AFTERMATH trace, FORCED_ALIGNMENT after STATIC (weather reactions): the
// static was the system's signal breaking up — and for a while afterwards
// even its idealized shadows (ShadowCorrection's corrected decals) can't hold
// their filing. Decals within a config radius of the player take small
// STEPPED jitter offsets — hash-drawn per quantized time step, never smooth,
// the rebel-strobe language applied to the room's most disciplined object —
// with amplitude draining as the aftermath decays, and when the window
// closes every decal snaps back EXACTLY to its corrected pose: the system
// re-tidies after inspection. black = the system; watching its own shadows
// shiver is the closest FORCED_ALIGNMENT comes to admitting the storm
// happened.
//
// Bounded and disposal-safe: the decal set is collected ONCE at aftermath
// start (3x3 chunk window via ChunkManager.getChunkAt, capped at
// SHADOW_JITTER.MAX_DECALS), the per-frame pass writes only on step change,
// and originals are stored-and-restored verbatim — bit-exact for both decal
// transform modes (plain position for unscarred decals, baked matrix
// translation for scarred matrixAutoUpdate=false ones). A decal whose chunk
// unloads mid-window is just a dead reference: writes to it are harmless and
// its regenerated replacement is born already corrected.

import type * as THREE from 'three';
import type { ChunkManager } from './ChunkManager';
import { WEATHER_REACTIONS, WORLD } from '../config';
import { hash } from '../utils/hash';

const { SHADOW_JITTER } = WEATHER_REACTIONS;

/**
 * Deterministic jitter offset (m) along one axis for decal `k` at quantized
 * time step `step`, scaled by the decaying aftermath: hash-drawn in
 * [-AMPLITUDE, AMPLITUDE] x aftermath. Exactly 0 at aftermath 0. Pure;
 * exported for testing.
 */
export function shadowJitterOffset(step: number, k: number, salt: number, aftermath: number): number {
    const a = Math.max(0, Math.min(1, aftermath));
    if (a <= 0)
        return 0;
    return (hash(step * 13 + k + salt, k * 31 - step) - 0.5) * 2 * SHADOW_JITTER.AMPLITUDE * a;
}

/** One jittered decal: the mesh plus its stored-verbatim resting transform. */
interface JitteredDecal {
    mesh: THREE.Mesh;
    /** True = plain position transform; false = baked matrix (scarred decal). */
    auto: boolean;
    /** Resting translation, restored bit-exact when the window closes. */
    baseX: number;
    baseZ: number;
}

/**
 * The jitter pass. One instance, owned by core/WeatherReactionsUpdater:
 * begin() once when a STATIC aftermath starts over FORCED_ALIGNMENT,
 * update() per frame while it decays (write-on-step-change over <=
 * MAX_DECALS meshes), end() to restore exactly — also safe to call anytime
 * as the teardown path.
 */
export class ShadowAftermath {
    private decals: JitteredDecal[] = [];
    /** Last applied step — the whole pass skips until the step advances. */
    private lastStep = -1;

    /**
     * Collect the corrected-shadow decals within SHADOW_JITTER.RADIUS of the
     * player (3x3 chunk window — the radius never reaches further) and store
     * their resting translations. Runs once per qualifying aftermath. Decals
     * are recognized by ShadowCorrection's stable mesh name; only chunks the
     * manager still holds are consulted.
     */
    begin(playerPos: THREE.Vector3, chunkManager: ChunkManager): void {
        this.end(); // never stack two windows: restore any live one first

        const radiusSq = SHADOW_JITTER.RADIUS * SHADOW_JITTER.RADIUS;
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const chunk = chunkManager.getChunkAt(
                    playerPos.x + x * WORLD.CHUNK_SIZE,
                    playerPos.z + z * WORLD.CHUNK_SIZE,
                );
                if (!chunk)
                    continue;
                for (const child of chunk.children) {
                    if (child.name !== 'correctedShadow')
                        continue;
                    if (this.decals.length >= SHADOW_JITTER.MAX_DECALS)
                        return;
                    const mesh = child as THREE.Mesh;
                    // Decal translation in chunk-local space, from whichever
                    // transform mode the decal uses (ShadowCorrection:
                    // unscarred = position/scale, scarred = baked matrix).
                    const auto = mesh.matrixAutoUpdate;
                    const baseX = auto ? mesh.position.x : mesh.matrix.elements[12];
                    const baseZ = auto ? mesh.position.z : mesh.matrix.elements[14];
                    const worldX = chunk.position.x + baseX;
                    const worldZ = chunk.position.z + baseZ;
                    const dx = worldX - playerPos.x;
                    const dz = worldZ - playerPos.z;
                    if (dx * dx + dz * dz > radiusSq)
                        continue;
                    this.decals.push({ mesh, auto, baseX, baseZ });
                }
            }
        }
    }

    /**
     * Per-frame jitter: on each new quantized step (clock x STEP_RATE) every
     * collected decal takes a fresh hash-drawn offset, its reach scaled by
     * the decaying aftermath — the shivering settles as the residue drains.
     * No-op between steps and whenever nothing was collected.
     *
     * @param clock - The owner's accumulated play-time clock (s).
     * @param aftermath - WeatherState.aftermath (1 -> 0 across the window).
     */
    update(clock: number, aftermath: number): void {
        if (this.decals.length === 0)
            return;
        const step = Math.floor(clock * SHADOW_JITTER.STEP_RATE);
        if (step === this.lastStep)
            return;
        this.lastStep = step;

        const { SALTS } = SHADOW_JITTER;
        for (let k = 0; k < this.decals.length; k++) {
            const d = this.decals[k];
            const jx = shadowJitterOffset(step, k, SALTS.X, aftermath);
            const jz = shadowJitterOffset(step, k, SALTS.Z, aftermath);
            if (d.auto) {
                d.mesh.position.x = d.baseX + jx;
                d.mesh.position.z = d.baseZ + jz;
            }
            else {
                d.mesh.matrix.elements[12] = d.baseX + jx;
                d.mesh.matrix.elements[14] = d.baseZ + jz;
                d.mesh.matrixWorldNeedsUpdate = true;
            }
        }
    }

    /**
     * The re-tidying: write every stored resting translation back VERBATIM
     * (the numbers came from the transforms, so the restore is bit-exact)
     * and forget the set. Idempotent; doubles as the teardown path.
     */
    end(): void {
        for (const d of this.decals) {
            if (d.auto) {
                d.mesh.position.x = d.baseX;
                d.mesh.position.z = d.baseZ;
            }
            else {
                d.mesh.matrix.elements[12] = d.baseX;
                d.mesh.matrix.elements[14] = d.baseZ;
                d.mesh.matrixWorldNeedsUpdate = true;
            }
        }
        this.decals.length = 0;
        this.lastStep = -1;
    }
}
