// 1-bit Chimera Void - INFO_OVERFLOW Data Waterfalls ("the district leaks its records")
//
// The INFO_OVERFLOW floor already speaks binary glyphs (FloorTile's dot-matrix
// data feed); here that language climbs the walls: a hash-gated fraction of
// the room's buildings carry 1-3 thin vertical strips down which glyph streams
// scroll — the district leaking its own records. black = the system's ledger,
// white = the self written into it; every glyph pixel is hard on/off (the
// full-screen dither pass owns the only softness). The scroll speed follows
// the player's CURRENT flower intensity: the brighter you burn, the faster
// the district churns what it knows about you.
//
// Shared-assets discipline: ONE deterministic glyph-strip DataTexture (the
// floor pool's generation approach, repeat-wrapped vertically) and ONE
// scrolling ShaderMaterial serve every strip in every chunk. Per-strip desync
// is BAKED into each strip's UVs (phase offset + metre-true repeat) — strips
// are never given material clones. Strip meshes parent into the building
// group (inside the chunk tree), so removeChunk's traversal frees their tiny
// per-strip plane geometries while skipping the shared material; the material
// + texture are freed exactly once via disposeWaterfallAssets from
// ChunkManager.dispose. Per-frame cost is ONE uniform write regardless of
// strip count (core/DataWaterfallUpdater); nothing else in this file runs
// per frame.

import * as THREE from 'three';
import { DATA_WATERFALL, PERFORMANCE } from '../config/constants';
import { hash } from '../utils/hash';

// Distinct integer salts for the waterfall draws, decorrelated from every
// prior draw across src/ (ShadowCorrection <= 1381, ChunkManager <= 1327,
// SnapshotEcho <= 1307, FigureSystem <= 1291). Documented so the next
// feature picks decorrelated integers > 1447.
const WATERFALL_GATE_SALT = 1409; // which buildings leak records
const WATERFALL_COUNT_SALT = 1423; // strips per leaking building
const WATERFALL_SIDE_SALT = 1427; // facade pick per strip
const WATERFALL_LATERAL_SALT = 1429; // slide along the facade per strip
const WATERFALL_HEIGHT_SALT = 1433; // strip-top draw per strip
const WATERFALL_PHASE_SALT = 1439; // baked UV scroll phase per strip (desync)
const WATERFALL_TEX_SALT = 1447; // shared glyph-texture field seed

/**
 * Whether building `i` of chunk (cx, cz) leaks its records — the hash-gated
 * fraction of INFO_OVERFLOW facades that carry waterfall strips. The caller
 * additionally excludes TREE-style buildings (a tree keeps no records).
 * Pure; exported for testing.
 *
 * @param cx - Chunk X coordinate (deterministic seed).
 * @param cz - Chunk Z coordinate (deterministic seed).
 * @param i - Building index within the chunk (deterministic seed).
 * @param fraction - Acceptance fraction in [0,1] (default from config).
 */
export function waterfallEligible(
    cx: number,
    cz: number,
    i: number,
    fraction: number = DATA_WATERFALL.BUILDING_FRACTION,
): boolean {
    // cz folded in (the SEAM_SHELL_PHASE_SALT precedent) so the same building
    // index in z-adjacent chunks draws a distinct gate, not an identical one.
    return hash(i + WATERFALL_GATE_SALT, cx * 31 + cz) < fraction;
}

/**
 * Strips carried by a leaking building: hash-drawn integer in
 * [STRIPS_MIN, STRIPS_MAX]. Pure; exported for testing.
 */
export function waterfallStripCount(cx: number, cz: number, i: number): number {
    const { STRIPS_MIN, STRIPS_MAX } = DATA_WATERFALL;
    const span = STRIPS_MAX - STRIPS_MIN + 1;
    const draw = Math.floor(hash(i + WATERFALL_COUNT_SALT, cx * 31 + cz) * span);
    return STRIPS_MIN + Math.min(span - 1, draw);
}

/**
 * One strip's placement on its building, as pure data (no THREE types so it
 * unit-tests in isolation). All in the building group's LOCAL frame.
 */
export interface WaterfallStrip {
    /** Facade pick: 0 = +x, 1 = -x, 2 = +z, 3 = -z. */
    side: number;
    /** Slide (m, signed) along the facade, within ±LATERAL_RANGE. */
    lateral: number;
    /** Strip bottom y (m) — just above the glyph floor. */
    bottom: number;
    /** Strip top y (m): hash-drawn band clamped to the building height. */
    top: number;
    /** Baked UV scroll phase in [0,1) — the per-strip desync. */
    phase: number;
}

/**
 * Deterministic placement of strip `k` on building `i` of chunk (cx, cz).
 * The strip-top draw is clamped to the building's height (records never
 * scroll off into empty air above the roof), floored at MIN_STRIP_HEIGHT so
 * a stub building still keeps a legible stream. Seeds fold k in at a x4
 * stride (k < STRIPS_MAX + 1) so building i's strip 1 never collides with
 * building i+1's strip 0. Pure; exported for testing.
 *
 * @param cx - Chunk X coordinate (deterministic seed).
 * @param cz - Chunk Z coordinate (deterministic seed).
 * @param i - Building index within the chunk (deterministic seed).
 * @param k - Strip index within the building (deterministic seed).
 * @param buildingHeight - Building height (m) in the same local frame.
 */
export function waterfallStripParams(
    cx: number,
    cz: number,
    i: number,
    k: number,
    buildingHeight: number,
): WaterfallStrip {
    const { LATERAL_RANGE, BOTTOM_Y, HEIGHT_MIN, HEIGHT_MAX, MIN_STRIP_HEIGHT } = DATA_WATERFALL;
    const s = i * 4 + k; // unique per (building, strip) since k <= 3
    const side = Math.min(3, Math.floor(hash(s + WATERFALL_SIDE_SALT, cx * 31 + cz) * 4));
    const lateral = (hash(s + WATERFALL_LATERAL_SALT, cz * 31 + cx) - 0.5) * 2 * LATERAL_RANGE;
    const drawnTop = HEIGHT_MIN + hash(s + WATERFALL_HEIGHT_SALT, cx + cz * 31) * (HEIGHT_MAX - HEIGHT_MIN);
    const top = Math.max(BOTTOM_Y + MIN_STRIP_HEIGHT, Math.min(drawnTop, buildingHeight));
    const phase = hash(s + WATERFALL_PHASE_SALT, cx * 31 + cz);
    return { side, lateral, bottom: BOTTOM_Y, top, phase };
}

/**
 * Scroll speed (texture heights/s) for the player's current flower intensity:
 * SPEED_BASE when dim, ramping linearly by SPEED_FLOWER_GAIN to full at
 * intensity 1 — the brighter you burn, the faster the district churns.
 * Input clamped to [0,1]. Pure; exported for testing.
 */
export function waterfallScrollSpeed(flowerIntensity: number): number {
    const f = Math.max(0, Math.min(1, flowerIntensity));
    return DATA_WATERFALL.SPEED_BASE + f * DATA_WATERFALL.SPEED_FLOWER_GAIN;
}

/**
 * Advances the shared scroll offset by one frame: offset + speed(intensity)
 * x dt, wrapped into [0,1) (the glyph texture's vertical period is 1, so the
 * wrap is invisible and the float never grows unbounded). dt is clamped to
 * [0, PERFORMANCE.MAX_FRAME_DELTA] — the FrameClock contract — so a pause
 * gap or a clock reseed can never teleport the streams. Pure; exported for
 * testing.
 *
 * @param offset - Current offset in [0,1).
 * @param rawDt - Raw seconds since the last update (any value; clamped here).
 * @param flowerIntensity - Player flower intensity in [0,1].
 */
export function nextWaterfallOffset(
    offset: number,
    rawDt: number,
    flowerIntensity: number,
): number {
    const dt = Math.max(0, Math.min(rawDt, PERFORMANCE.MAX_FRAME_DELTA));
    const next = offset + waterfallScrollSpeed(flowerIntensity) * dt;
    return next - Math.floor(next);
}

// --- Module-shared strip assets ----------------------------------------------
// ONE binary glyph-strip texture + ONE scrolling material for every strip in
// every chunk. Never cloned per strip/chunk; freed once via
// disposeWaterfallAssets(). The texture lives in a shader uniform (not .map),
// so even a material-disposing traversal would skip it — disposal here is the
// single owner.
let waterfallTex: THREE.DataTexture | null = null;
let waterfallMat: THREE.ShaderMaterial | null = null;

/**
 * Builds the shared glyph-strip texture: the INFO floor's dot-matrix language
 * (GLYPH_PITCH-px cells with 2x2 lit dots, plus sparse stray burst texels) in
 * a narrow column, hash-seeded so every session builds the identical strip.
 * Strictly binary texels — the fragment shader step()s at 0.5, so there is
 * nothing soft to lose. Repeat-wraps vertically (the scroll axis); clamped
 * horizontally (one strip = one texture width).
 */
function createWaterfallTexture(): THREE.DataTexture {
    const { TEX_WIDTH, TEX_HEIGHT, GLYPH_PITCH, GLYPH_GATE, BURST_GATE } = DATA_WATERFALL;
    const data = new Uint8Array(TEX_WIDTH * TEX_HEIGHT * 4);
    const dot = GLYPH_PITCH / 2; // 2x2 dot inside each 4px cell (floor's shape)

    for (let idx = 0; idx < TEX_WIDTH * TEX_HEIGHT; idx++) {
        const x = idx % TEX_WIDTH;
        const y = Math.floor(idx / TEX_WIDTH);
        const cellX = Math.floor(x / GLYPH_PITCH);
        const cellY = Math.floor(y / GLYPH_PITCH);
        const inDot = x % GLYPH_PITCH < dot && y % GLYPH_PITCH < dot;

        // Deterministic lit/unlit per cell + sparse per-texel data bursts.
        const lit = inDot && hash(cellX + WATERFALL_TEX_SALT, cellY * 1.37) > GLYPH_GATE;
        const burst = hash(x + WATERFALL_TEX_SALT * 2, y * 0.61) > BURST_GATE;
        const c = lit || burst ? 255 : 0;

        data[idx * 4] = c;
        data[idx * 4 + 1] = c;
        data[idx * 4 + 2] = c;
        data[idx * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(data, TEX_WIDTH, TEX_HEIGHT, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping; // the vertical scroll axis
    tex.needsUpdate = true;
    return tex;
}

/**
 * Get or lazily create the shared scrolling strip material. uOffset is the
 * single per-frame knob (core/DataWaterfallUpdater); per-strip desync and
 * glyph density are baked into each strip's UVs at generation time, so ONE
 * uniform write drives every strip in the world.
 */
function getWaterfallMaterial(): THREE.ShaderMaterial {
    if (!waterfallMat) {
        waterfallTex = createWaterfallTexture();
        waterfallMat = new THREE.ShaderMaterial({
            uniforms: {
                uGlyphs: { value: waterfallTex },
                uOffset: { value: 0 },
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
                uniform sampler2D uGlyphs;
                uniform float uOffset;
                uniform vec3 uInk;
                uniform vec3 uPaper;
                varying vec2 vUv;
                void main() {
                    // Records fall: sampling at v + offset slides the glyph
                    // column DOWN the facade as the offset grows (RepeatWrapping
                    // owns the wrap). step() keeps every pixel hard on/off —
                    // the full-screen dither pass owns the only softness.
                    float g = texture2D(uGlyphs, vec2(vUv.x, vUv.y + uOffset)).r;
                    gl_FragColor = vec4(mix(uInk, uPaper, step(0.5, g)), 1.0);
                }
            `,
            // Readable from either bank of the street; a record pane, not a wall.
            side: THREE.DoubleSide,
        });
    }
    return waterfallMat;
}

/**
 * Drive the shared material's scroll offset for this frame — the ONE uniform
 * write that moves every strip in the world. No-op until the material exists
 * (the first INFO strip lazily creates it), so a run that never generates an
 * INFO chunk costs nothing.
 */
export function updateWaterfallOffset(offset: number): void {
    if (waterfallMat) {
        waterfallMat.uniforms.uOffset.value = offset;
    }
}

/**
 * Builds this building's waterfall strips and parents them into the group
 * (inside the chunk tree, so they wander with a mobile building and dispose
 * with the chunk). Each strip is a thin vertical quad standing FACE_OFFSET
 * off the group center on its hash-picked facade, with the scroll phase and
 * a metre-true glyph repeat baked into its UVs — the shared material never
 * needs per-strip state. Static after this call: no per-frame cost here.
 *
 * Call ONLY for INFO_OVERFLOW, non-TREE, waterfallEligible buildings, and
 * AFTER any pass that traverses the group's meshes (sub-palette, flicker
 * anchor pick) so no other system ever touches a strip.
 *
 * @param buildGroup - The finished building group (chunk-local frame).
 * @param buildingHeight - Building height (m) in the group's LOCAL frame —
 *   callers with a biome-scaled group divide the world height back down so
 *   the group scale applies to the strips exactly once.
 * @param cx - Chunk X coordinate (deterministic seed).
 * @param cz - Chunk Z coordinate (deterministic seed).
 * @param i - Building index within the chunk (deterministic seed).
 */
export function attachWaterfallStrips(
    buildGroup: THREE.Group,
    buildingHeight: number,
    cx: number,
    cz: number,
    i: number,
): void {
    const { STRIP_WIDTH, FACE_OFFSET, V_PER_METER } = DATA_WATERFALL;
    const material = getWaterfallMaterial();
    const count = waterfallStripCount(cx, cz, i);

    for (let k = 0; k < count; k++) {
        const strip = waterfallStripParams(cx, cz, i, k, buildingHeight);
        const height = strip.top - strip.bottom;

        // Per-strip plane (4 vertices; disposed with the chunk tree). The UV v
        // axis is rewritten to phase + metres x V_PER_METER, so glyph size is
        // constant across strip heights and the phase desyncs the streams.
        const geo = new THREE.PlaneGeometry(STRIP_WIDTH, height);
        const uvs = geo.attributes.uv as THREE.BufferAttribute;
        for (let v = 0; v < uvs.count; v++) {
            uvs.setY(v, strip.phase + uvs.getY(v) * height * V_PER_METER);
        }

        const mesh = new THREE.Mesh(geo, material);
        mesh.name = 'dataWaterfall';
        // Self-lit record pane: neither casts nor receives real shadows.
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        const cy = (strip.top + strip.bottom) / 2;
        if (strip.side === 0) {
            mesh.position.set(FACE_OFFSET, cy, strip.lateral);
            mesh.rotation.y = Math.PI / 2;
        }
        else if (strip.side === 1) {
            mesh.position.set(-FACE_OFFSET, cy, strip.lateral);
            mesh.rotation.y = -Math.PI / 2;
        }
        else if (strip.side === 2) {
            mesh.position.set(strip.lateral, cy, FACE_OFFSET);
        }
        else {
            mesh.position.set(strip.lateral, cy, -FACE_OFFSET);
            mesh.rotation.y = Math.PI;
        }
        buildGroup.add(mesh);
    }
}

/**
 * Frees the module-shared strip material + glyph texture. Idempotent. Call
 * once from ChunkManager.dispose; NEVER per chunk — the assets are shared by
 * every strip in every INFO_OVERFLOW chunk. Subsequent strip generation
 * lazily recreates them.
 */
export function disposeWaterfallAssets(): void {
    if (waterfallTex) {
        waterfallTex.dispose();
        waterfallTex = null;
    }
    if (waterfallMat) {
        waterfallMat.dispose();
        waterfallMat = null;
    }
}
