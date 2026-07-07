// 1-bit Chimera Void - INFO_OVERFLOW Rain Puddles ("the downpour's records pool")
//
// AFTERMATH trace, INFO_OVERFLOW after RAIN (weather reactions): when a
// digital downpour ends over the district, its records POOL — a few
// glyph-language blot decals stamp onto the floor near the player (ink blots
// carrying the floor's own 4px dot-matrix records in paper) and dissolve
// cell-by-cell across the aftermath window. black = the system's ledger,
// white = the self written into it; the rain was the district being told
// about you, and the puddles are what didn't drain away. Strict 1-bit: every
// texel is ink, paper, or ABSENT (discarded) — the dissolve is a per-pixel
// hard threshold against the shared uDissolve uniform, each pixel binary at
// every instant, never an alpha fade.
//
// Lifecycle/ownership: a FIXED pool of PUDDLES.COUNT quad decals, stamped
// once per qualifying aftermath (deterministic per event: session stamp
// counter + the event's heading seed the hash draws) and PARENTED INTO THE
// CHUNK under each stamp point — chunk-parented objects dispose with their
// chunk, so a puddle can never outlive its floor. The unit quad geometry is
// module-shared (the ShadowCorrection decal pattern: removeChunk's traversal
// may free its GPU buffers, three re-uploads lazily); the blot material +
// texture are shared singletons freed once via disposePuddleAssets (owned by
// the one RainGlyphPuddles instance, disposed with core/WeatherReactions-
// Updater via RoomFlowUpdater). Per-frame cost is ONE uniform write while a
// rain aftermath decays, zero otherwise.

import type { Chunk } from '../types';
import type { ChunkManager } from './ChunkManager';
import * as THREE from 'three';
import { WEATHER_REACTIONS, WORLD } from '../config';
import { hash } from '../utils/hash';
import { RoomType } from './RoomConfig';

const { PUDDLES } = WEATHER_REACTIONS;

/**
 * One puddle's stamp draw, as pure data (no THREE types): where it lands on
 * the ring around the player, how big, and how it is spun. Deterministic per
 * (stampIndex, k, direction) — the same aftermath always pools the same way.
 * Pure; exported for testing.
 *
 * @param stampIndex - Session-monotone stamp counter (one per rain aftermath).
 * @param k - Puddle index within the stamp (0..COUNT-1).
 * @param directionRad - The ended event's heading (the per-event seed).
 */
export function puddleSpot(
    stampIndex: number,
    k: number,
    directionRad: number,
): { angle: number; radius: number; size: number; spin: number } {
    const { RADIUS_MIN, RADIUS_MAX, SIZE_MIN, SIZE_SPAN, SALTS } = PUDDLES;
    // Seeds fold the stamp counter and the event heading together so two
    // aftermaths never reuse a layout; k * 31 keeps the pool decorrelated.
    const s = stampIndex * 7 + k * 31;
    return {
        angle: hash(s + SALTS.ANGLE, directionRad * 512) * Math.PI * 2,
        radius: RADIUS_MIN + hash(s + SALTS.RADIUS, directionRad * 512) * (RADIUS_MAX - RADIUS_MIN),
        size: SIZE_MIN + hash(s + SALTS.SIZE, directionRad * 512) * SIZE_SPAN,
        spin: hash(s + SALTS.SPIN, directionRad * 512) * Math.PI * 2,
    };
}

// --- Module-shared blot assets ----------------------------------------------
// ONE glyph-blot texture + ONE dissolving material + ONE flat unit quad for
// every puddle. Never cloned per decal; freed once via disposePuddleAssets.
let puddleTex: THREE.DataTexture | null = null;
let puddleMat: THREE.ShaderMaterial | null = null;
let puddleGeo: THREE.PlaneGeometry | null = null;

/**
 * Builds the shared blot texture in the INFO floor's glyph language
 * (GLYPH_PITCH-px cells, 2x2 lit dots), packed per channel:
 * - r: the record bit — paper dot (255) or ink ground (0);
 * - g: the cell's dissolve threshold (hash in [0,255]) — the per-pixel hard
 *   gate the aftermath decays through;
 * - b: the blot shape mask — cells exist under a hash gate that tightens
 *   with radial distance (SHAPE_FILL at center, 0 at the rim), so the blot
 *   is an irregular pool, not a stamp-perfect square.
 * Every channel is consumed with hard thresholds; nothing here can fade.
 */
function createPuddleTexture(): THREE.DataTexture {
    const { TEX_SIZE, GLYPH_PITCH, GLYPH_GATE, SHAPE_FILL, SALTS } = PUDDLES;
    const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
    const dot = GLYPH_PITCH / 2; // 2x2 dot inside each cell (the floor's shape)
    const half = TEX_SIZE / 2;

    for (let idx = 0; idx < TEX_SIZE * TEX_SIZE; idx++) {
        const x = idx % TEX_SIZE;
        const y = Math.floor(idx / TEX_SIZE);
        const cellX = Math.floor(x / GLYPH_PITCH);
        const cellY = Math.floor(y / GLYPH_PITCH);

        // Radial falloff of the cell-existence gate (cell-center distance,
        // normalized so the corner is ~1.4 — corners are nearly always bare).
        const cx = (cellX + 0.5) * GLYPH_PITCH;
        const cy = (cellY + 0.5) * GLYPH_PITCH;
        const d = Math.sqrt((cx - half) * (cx - half) + (cy - half) * (cy - half)) / half;
        const gate = SHAPE_FILL * Math.max(0, 1 - d * d);
        const shaped = hash(cellX + SALTS.TEX, cellY * 1.37) < gate;

        const inDot = x % GLYPH_PITCH < dot && y % GLYPH_PITCH < dot;
        const lit = inDot && hash(cellX + SALTS.TEX * 2, cellY * 0.61) > GLYPH_GATE;

        // Per-cell dissolve threshold: uniform hash so the pool loses an even
        // fraction of its cells per unit of aftermath — chunky, 1-bit decay.
        const thresh = Math.floor(hash(cellX + SALTS.TEX * 3, cellY + SALTS.TEX) * 255);

        data[idx * 4] = lit ? 255 : 0;
        data[idx * 4 + 1] = thresh;
        data[idx * 4 + 2] = shaped ? 255 : 0;
        data[idx * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(data, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
}

/** Lazily initializes (once) the shared quad + blot material + texture. */
function getPuddleAssets(): { geo: THREE.PlaneGeometry; mat: THREE.ShaderMaterial } {
    if (!puddleGeo) {
        // Flat into the XZ plane (normal +Y) — the ShadowCorrection pattern,
        // so a puddle transform is position/spin/scale only.
        puddleGeo = new THREE.PlaneGeometry(1, 1);
        puddleGeo.rotateX(-Math.PI / 2);
    }
    if (!puddleMat) {
        puddleTex = createPuddleTexture();
        puddleMat = new THREE.ShaderMaterial({
            uniforms: {
                uBlot: { value: puddleTex },
                // 1 = the pool fully present (aftermath start); decays to 0.
                uDissolve: { value: 0 },
                uInk: { value: new THREE.Color(0x000000) },
                uPaper: { value: new THREE.Color(0xCCCCCC) },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uBlot;
                uniform float uDissolve;
                uniform vec3 uInk;
                uniform vec3 uPaper;
                varying vec2 vUv;
                void main() {
                    vec4 t = texture2D(uBlot, vUv);
                    // Outside the blot shape: no pixel at all.
                    if (t.b < 0.5) discard;
                    // The dissolve: each cell's baked threshold against the
                    // shared aftermath scalar — a pixel exists or it doesn't,
                    // and as uDissolve decays 1 -> 0 the pool dries cell by
                    // cell. Never a fade.
                    if (t.g > uDissolve) discard;
                    gl_FragColor = vec4(mix(uInk, uPaper, step(0.5, t.r)), 1.0);
                }
            `,
        });
        // Depth-bias toward the camera (paired with PUDDLES.LIFT) so the
        // decal never z-fights the glyph floor — the FloorTile/FA_SHADOW
        // floor-decal pattern.
        puddleMat.polygonOffset = true;
        puddleMat.polygonOffsetFactor = -1;
        puddleMat.polygonOffsetUnits = -1;
    }
    return { geo: puddleGeo, mat: puddleMat };
}

/**
 * Frees the module-shared blot assets. Idempotent; called once from the
 * owning system's dispose (never per chunk — chunks only ever dispose the
 * shared quad's GPU buffers via their traversal, which re-upload lazily).
 */
export function disposePuddleAssets(): void {
    if (puddleTex) {
        puddleTex.dispose();
        puddleTex = null;
    }
    if (puddleMat) {
        puddleMat.dispose();
        puddleMat = null;
    }
    if (puddleGeo) {
        puddleGeo.dispose();
        puddleGeo = null;
    }
}

/**
 * The puddle pool. One instance, owned by core/WeatherReactionsUpdater:
 * stamp() once when a RAIN aftermath begins over INFO_OVERFLOW, setDissolve()
 * once per frame while it decays (one uniform write), dispose() at teardown.
 */
export class RainGlyphPuddles {
    /** Fixed decal pool (PUDDLES.COUNT), created lazily on the first stamp. */
    private meshes: THREE.Mesh[] = [];
    /** Session-monotone stamp counter — the per-event determinism seed. */
    private stampIndex = 0;
    /** Whether any decal is currently placed (skips the per-frame write). */
    private active = false;

    /**
     * Stamp the pool near the player: each decal draws its ring spot
     * (puddleSpot), lands in the chunk under it — CHUNK-parented, so it
     * disposes with its floor — and shows at full presence. Decals whose
     * spot falls outside a loaded INFO_OVERFLOW chunk stay hidden (the pool
     * never pools on another room's floor). Runs once per qualifying
     * aftermath, never per frame.
     *
     * @param playerPos - Player world position at the aftermath's start.
     * @param directionRad - The ended event's heading (determinism seed).
     * @param chunkManager - Resolves each spot's chunk (getChunkAt).
     */
    stamp(playerPos: THREE.Vector3, directionRad: number, chunkManager: ChunkManager): void {
        const { geo, mat } = getPuddleAssets();
        if (this.meshes.length === 0) {
            for (let k = 0; k < PUDDLES.COUNT; k++) {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.name = 'rainGlyphPuddle';
                // The pool IS surface markings: no shadow interplay.
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.visible = false;
                this.meshes.push(mesh);
            }
        }

        this.stampIndex += 1;
        mat.uniforms.uDissolve.value = 1;

        for (let k = 0; k < this.meshes.length; k++) {
            const mesh = this.meshes[k];
            const spot = puddleSpot(this.stampIndex, k, directionRad);
            const worldX = playerPos.x + Math.cos(spot.angle) * spot.radius;
            const worldZ = playerPos.z + Math.sin(spot.angle) * spot.radius;

            // Re-home the decal under its new floor. A previous parent (a
            // possibly long-unloaded chunk) just drops the reference; the
            // pool re-uses the same mesh objects for the whole session.
            // The FLOOR under a world point belongs to the chunk whose ORIGIN
            // is nearest (floors are chunk-size quads centered on the group
            // origin), so the lookup snaps to that origin — the puddle then
            // shares its parent with the very glyph floor it pools on and
            // disposes with it.
            mesh.removeFromParent();
            const chunk: Chunk | null = chunkManager.getChunkAt(
                Math.round(worldX / WORLD.CHUNK_SIZE) * WORLD.CHUNK_SIZE,
                Math.round(worldZ / WORLD.CHUNK_SIZE) * WORLD.CHUNK_SIZE,
            );
            if (!chunk || chunk.userData.roomType !== RoomType.INFO_OVERFLOW) {
                mesh.visible = false;
                continue;
            }
            mesh.position.set(
                worldX - chunk.position.x,
                PUDDLES.LIFT,
                worldZ - chunk.position.z,
            );
            mesh.rotation.y = spot.spin;
            mesh.scale.set(spot.size, 1, spot.size);
            mesh.visible = true;
            chunk.add(mesh);
        }
        this.active = true;
    }

    /**
     * Per-frame presence: the aftermath scalar IS the dissolve level (1 =
     * just rained, 0 = dried). One uniform write while a pool exists; when
     * the window closes the decals hide and the pass goes fully dormant.
     */
    setDissolve(aftermath: number): void {
        if (!this.active)
            return;
        if (puddleMat)
            puddleMat.uniforms.uDissolve.value = aftermath;
        if (aftermath <= 0) {
            for (const mesh of this.meshes) {
                mesh.visible = false;
                mesh.removeFromParent();
            }
            this.active = false;
        }
    }

    /** Free the pool meshes' parenting and the shared blot assets (once). */
    dispose(): void {
        for (const mesh of this.meshes)
            mesh.removeFromParent();
        this.meshes.length = 0;
        this.active = false;
        disposePuddleAssets();
    }
}
