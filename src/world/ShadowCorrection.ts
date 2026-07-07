// 1-bit Chimera Void - FORCED_ALIGNMENT Corrected Shadows ("idealized shadows")
//
// In FORCED_ALIGNMENT the system corrects even light: every building gets a
// fake shadow — a hard-black, perfectly axis-aligned rectangle decal on the
// floor at its foot, displaced in ONE fixed global azimuth (FA_SHADOW) and
// sized from the building's footprint but quantized to the room's 8-unit grid
// rhythm — deliberately too regular for the building's actual silhouette.
// black = the system, and this shadow is the system redrawing the self's
// outline: idealized, filed, subtly wrong. Near a cross-run scar the tidying
// FAILS: the rectangle rotates, shears and slides by hash-drawn amounts scaled
// by scar severity (ScarField) — where you resisted, even the shadows stay
// uncorrected. Hard on/off ink only: no soft penumbra, no alpha fade. One
// exception to "every building": a decal whose x reach would enter the rift
// crack's keep-out band is skipped (shadowCrossesCrack) — the shore corridor's
// crack gap stays visually open, never bridged by a floating black quad.
//
// Generation-time only. Decals are static meshes parented to the CHUNK and
// freed with it: the module-shared unit-quad geometry rides the same benign
// dispose/re-upload churn as the FloorTile redaction discs (removeChunk's
// traversal disposes its GPU buffers; three re-uploads lazily on next use),
// and the single shared ink material — which the traversal skips — is freed
// once via disposeShadowAssets from ChunkManager.dispose. NEVER cloned per
// decal. No per-frame cost anywhere in this file.

import * as THREE from 'three';
import { FA_SHADOW } from '../config/constants';
import { hash } from '../utils/hash';

// Distinct integer salts for the scar-skew draws, decorrelated from every
// prior draw across src/ (ChunkManager <= 1327, SnapshotEcho <= 1307,
// FigureSystem <= 1291, ScarField <= 1153). Documented so the next feature
// picks decorrelated integers > 1381.
const SHADOW_ROT_SALT = 1361;
const SHADOW_SHEAR_SALT = 1367;
const SHADOW_OFFSET_X_SALT = 1373;
const SHADOW_OFFSET_Z_SALT = 1381;

/**
 * The corrected shadow rectangle: axis-aligned extents (grid-quantized) plus
 * the displacement of its center from the building foot along the ONE fixed
 * global azimuth. Pure data — no THREE types — so it unit-tests in isolation.
 */
export interface ShadowRect {
    /** World-x extent (m); a multiple of FA_SHADOW.QUANT within the clamps. */
    width: number;
    /** World-z extent (m); a multiple of FA_SHADOW.QUANT within the clamps. */
    depth: number;
    /** Rect-center displacement from the building foot along world x (m). */
    offsetX: number;
    /** Rect-center displacement from the building foot along world z (m). */
    offsetZ: number;
}

/**
 * Scar-broken correction amounts: how far a shadow near a scar departs from
 * the idealized axis-aligned rectangle. All components are hash-deterministic
 * per (i, cx, cz), scaled by severity and clamped by FA_SHADOW; severity <= 0
 * returns exact zeros so unscarred shadows stay bit-identical to the
 * corrected form. Pure data — no THREE types.
 */
export interface ShadowSkew {
    /** Rotation off axis-alignment (radians, signed, |v| <= MAX_SKEW_ROT_RAD). */
    rotY: number;
    /** XZ shear factor (x drift per unit of rect depth, |v| <= MAX_SHEAR). */
    shear: number;
    /** Extra lateral slide off the corrected spot (m, |v| <= MAX_SKEW_OFFSET). */
    offsetX: number;
    /** Extra lateral slide off the corrected spot (m, |v| <= MAX_SKEW_OFFSET). */
    offsetZ: number;
}

/**
 * Quantizes one footprint extent to the FA shadow grid: rounded to the
 * nearest FA_SHADOW.QUANT step, then clamped to [MIN_SIZE, MAX_SIZE]. Both
 * clamps are themselves multiples of QUANT (config contract), so the result
 * always sits on the grid — the "correction" that never quite fits the
 * building. Pure; exported for testing.
 *
 * @param extent - Raw footprint extent along one axis (m, >= 0).
 * @returns The grid-quantized extent (m).
 */
export function quantizeShadowExtent(extent: number): number {
    const { QUANT, MIN_SIZE, MAX_SIZE } = FA_SHADOW;
    const q = Math.round(extent / QUANT) * QUANT;
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, q));
}

/**
 * The idealized shadow rect for a building footprint: both extents quantized
 * to the grid, and the rect center displaced along the ONE fixed global
 * azimuth by a single magnitude — OFFSET_FACTOR of the MEAN quantized extent,
 * so the offset still steps in the grid rhythm while the displacement
 * DIRECTION stays exactly AZIMUTH_RAD for every aspect ratio (scaling each
 * component by its own extent would bend the direction per building). Every
 * FA building in the world shares the same azimuth: one sun, one rule. Pure.
 *
 * @param footprintX - Building footprint extent along world x (m).
 * @param footprintZ - Building footprint extent along world z (m).
 */
export function correctedShadowRect(footprintX: number, footprintZ: number): ShadowRect {
    const { AZIMUTH_RAD, OFFSET_FACTOR } = FA_SHADOW;
    const width = quantizeShadowExtent(footprintX);
    const depth = quantizeShadowExtent(footprintZ);
    const magnitude = OFFSET_FACTOR * (width + depth) / 2;
    return {
        width,
        depth,
        offsetX: Math.cos(AZIMUTH_RAD) * magnitude,
        offsetZ: Math.sin(AZIMUTH_RAD) * magnitude,
    };
}

/**
 * Deterministic scar skew for a shadow at scar severity in [0,1] (clamped):
 * hash-seeded rotation/shear/slide, every component scaled linearly by
 * severity and clamped by the FA_SHADOW maxima — the ScarField.
 * scarDistortionFor shape, applied to the shadow instead of the building.
 * severity <= 0 returns exact zeros (the corrected shadow, bit-identical).
 * Pure.
 *
 * @param severity - Scar severity at the building's world position
 *   (ScarField.scarSeverityAt — depth x radial falloff over SCAR_FIELD.RADIUS).
 * @param i - Building index within the chunk (deterministic seed).
 * @param cx - Chunk X coordinate (deterministic seed).
 * @param cz - Chunk Z coordinate (deterministic seed).
 */
export function scarShadowSkew(
    severity: number,
    i: number,
    cx: number,
    cz: number,
): ShadowSkew {
    const s = severity <= 0 ? 0 : severity >= 1 ? 1 : severity;
    if (s === 0) {
        return { rotY: 0, shear: 0, offsetX: 0, offsetZ: 0 };
    }
    const { MAX_SKEW_ROT_RAD, MAX_SHEAR, MAX_SKEW_OFFSET } = FA_SHADOW;
    return {
        rotY: (hash(i + SHADOW_ROT_SALT, cx) - 0.5) * 2 * MAX_SKEW_ROT_RAD * s,
        shear: (hash(i + SHADOW_SHEAR_SALT, cz) - 0.5) * 2 * MAX_SHEAR * s,
        offsetX: (hash(i + SHADOW_OFFSET_X_SALT, cx + cz) - 0.5) * 2 * MAX_SKEW_OFFSET * s,
        offsetZ: (hash(i + SHADOW_OFFSET_Z_SALT, cz) - 0.5) * 2 * MAX_SKEW_OFFSET * s,
    };
}

/**
 * Whether a shadow decal at building foot `footX` (chunk-local) would enter
 * the keep-out band of the chunk's rift crack line — the FA "shore corridor"
 * rule applied to shadows: buildings respect FA_RIFT.CLEARANCE, but a large
 * decal's offset + half-extent can out-reach it and visually bridge the crack
 * gap, floating over the abyss plane. The x half-extent is EXACT for the
 * composed T·RotY·Shear·Scale decal transform (shear first, then rotation),
 * so unscarred rects degrade to width/2. Pure; exported for testing.
 *
 * @param footX - Building foot chunk-local x (m).
 * @param crackLocalX - Chunk-local x of the crack line (0 on the regular path).
 * @param rect - The corrected shadow rect (correctedShadowRect).
 * @param skew - The scar skew (scarShadowSkew; zeros when unscarred).
 */
export function shadowCrossesCrack(
    footX: number,
    crackLocalX: number,
    rect: ShadowRect,
    skew: ShadowSkew,
): boolean {
    const centerX = footX + rect.offsetX + skew.offsetX;
    // Max |x - centerX| over the four transformed corners (±w/2, ±d/2):
    // shear maps x -> x + shear·z, then rotY maps x -> cos·x + sin·z.
    const halfX = Math.abs(Math.cos(skew.rotY)) * rect.width / 2
        + Math.abs(Math.cos(skew.rotY) * skew.shear + Math.sin(skew.rotY)) * rect.depth / 2;
    return centerX - halfX < crackLocalX + FA_SHADOW.CRACK_KEEPOUT
        && centerX + halfX > crackLocalX - FA_SHADOW.CRACK_KEEPOUT;
}

// --- Module-shared decal assets ---------------------------------------------
// One unit quad (pre-rotated flat into the XZ plane, normal +Y) and ONE ink
// material shared by every decal in every chunk. The material is never cloned
// per decal; removeChunk's material-skipping traversal leaves it alone and it
// is freed exactly once via disposeShadowAssets().
let shadowGeo: THREE.PlaneGeometry | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;

/** Lazily initializes (once) the module-shared decal geometry + ink material. */
function getShadowAssets(): { geo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } {
    if (!shadowGeo) {
        // Bake the flat orientation into the geometry so decal transforms stay
        // a pure translate/rotY/shear/scale composition in the XZ plane.
        shadowGeo = new THREE.PlaneGeometry(1, 1);
        shadowGeo.rotateX(-Math.PI / 2);
    }
    if (!shadowMat) {
        shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000, // pure ink — the hard 1-bit shadow
            // Depth-bias the decal toward the camera (paired with the
            // FA_SHADOW.LIFT epsilon) so it never z-fights the floor plane —
            // the FloorTile redaction-disc / seam-line pattern.
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });
    }
    return { geo: shadowGeo, mat: shadowMat };
}

// Generation-time scratch (module-shared; never touched per frame).
const _footprintBox = new THREE.Box3();
const _footprintSize = new THREE.Vector3();
const _mTranslate = new THREE.Matrix4();
const _mRotate = new THREE.Matrix4();
const _mShear = new THREE.Matrix4();
const _mScale = new THREE.Matrix4();

/**
 * Builds one corrected-shadow decal for a freshly built FORCED_ALIGNMENT
 * building group. The footprint is measured from the group's actual bounds
 * (generation-time Box3; works pre-parenting because setFromObject composes
 * local matrices downward, and size is translation-invariant so the group's
 * chunk-local position never leaks into the extents), then idealized via
 * correctedShadowRect. The caller parents the mesh to the CHUNK — not the
 * building — so it stays a floor decal and disposes with the chunk tree.
 *
 * Unscarred buildings get a plain axis-aligned position/scale transform.
 * Near a scar the correction fails: the rect is rotated, SHEARED (a true
 * parallelogram, composed as T·RotY·Shear·Scale into mesh.matrix with
 * matrixAutoUpdate off) and slid by scarShadowSkew amounts. Everything is
 * static after this call — no per-frame cost.
 *
 * @param buildGroup - The finished building group (post scar distortion).
 * @param scarSeverity - Scar severity at the building (0 = corrected shadow).
 * @param cx - Chunk X coordinate (deterministic seed).
 * @param cz - Chunk Z coordinate (deterministic seed).
 * @param i - Building index within the chunk (deterministic seed).
 * @param crackLocalX - Chunk-local x of the chunk's rift crack line, or null
 *   when the chunk has none: a decal whose x reach would enter the crack's
 *   keep-out band is skipped (shadowCrossesCrack) so it never bridges the gap.
 * @returns The decal mesh, positioned in chunk-local space; null when skipped.
 */
export function createCorrectedShadowDecal(
    buildGroup: THREE.Group,
    scarSeverity: number,
    cx: number,
    cz: number,
    i: number,
    crackLocalX: number | null = null,
): THREE.Mesh | null {
    _footprintBox.setFromObject(buildGroup);
    _footprintBox.getSize(_footprintSize); // (0,0,0) when the box is empty

    const rect = correctedShadowRect(_footprintSize.x, _footprintSize.z);
    const skew = scarShadowSkew(scarSeverity, i, cx, cz);

    if (crackLocalX !== null
        && shadowCrossesCrack(buildGroup.position.x, crackLocalX, rect, skew)) {
        return null;
    }

    const { geo, mat } = getShadowAssets();
    const decal = new THREE.Mesh(geo, mat);
    decal.name = 'correctedShadow';
    // The decal IS the (fake) shadow: it neither casts nor receives real ones.
    decal.castShadow = false;
    decal.receiveShadow = false;

    const px = buildGroup.position.x + rect.offsetX + skew.offsetX;
    const pz = buildGroup.position.z + rect.offsetZ + skew.offsetZ;

    if (scarSeverity <= 0) {
        // The corrected case: perfectly axis-aligned, plain PRS transform.
        decal.position.set(px, FA_SHADOW.LIFT, pz);
        decal.scale.set(rect.width, 1, rect.depth);
        return decal;
    }

    // Scarred: compose T · RotY · Shear · Scale once, at generation time.
    // Shear maps x' = x + shear·z AFTER scaling, so `shear` reads as metres of
    // x drift per metre of rect depth (clamped by FA_SHADOW.MAX_SHEAR).
    _mTranslate.makeTranslation(px, FA_SHADOW.LIFT, pz);
    _mRotate.makeRotationY(skew.rotY);
    _mShear.set(
        1,
        0,
        skew.shear,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
    );
    _mScale.makeScale(rect.width, 1, rect.depth);
    decal.matrix.copy(_mTranslate).multiply(_mRotate).multiply(_mShear).multiply(_mScale);
    decal.matrixAutoUpdate = false;
    return decal;
}

/**
 * Frees the module-shared decal geometry + ink material. Idempotent. Call
 * once from ChunkManager.dispose; NEVER per chunk — the assets are shared by
 * every decal in every FORCED_ALIGNMENT chunk.
 */
export function disposeShadowAssets(): void {
    if (shadowGeo) {
        shadowGeo.dispose();
        shadowGeo = null;
    }
    if (shadowMat) {
        shadowMat.dispose();
        shadowMat = null;
    }
}
