// 1-bit Chimera Void - Viewmodel Misregister Echo ("IN_BETWEEN reads YOU twice")
//
// IN_BETWEEN is the room of unresolved ambiguity: its language is the
// misregister — two plates of the same print that never quite agree. This
// system turns that language on the SELF. Only while the current room is
// IN_BETWEEN, the player's own viewmodel (hands + held flower) gains a
// second, offset image: the hands re-read as solid ink (one system reads
// your body as mass), the flower as bare paper wireframe (the other system
// reads your desire as structure only). Two systems each read you once;
// they disagree by a few centimeters on the page.
//
// Strict 1-bit: the echo is hard on/off — it toggles on room change with a
// frame-counted flicker (the batch's swap language, cf. RoomSky), never a
// fade, and its materials carry no transparency; the full-screen dither
// pass owns all softness.
//
// Rendering choice (studied against the source): the source viewmodel is
// ordinary depth-tested geometry parented to the camera — opaque Lamberts
// for hands/arms, with the petals/sepals in the transparent pass. The echo
// therefore shares the source geometries (no clones) under two shared echo
// materials, sits at a small fixed camera-local offset, is pushed slightly
// DEEPER than the source (VIEWMODEL_ECHO.OFFSET_Z), and renders with
// depthWrite:false at a late renderOrder. Consequences, in order:
//   - the depth pushback makes overlap regions lose the depth test against
//     the source cleanly — no z-fighting through the source silhouette;
//   - the late renderOrder means the opaque world + source have already
//     written depth, so the echo appears exactly where it peeks out from
//     behind you (print misregistration: the under-plate shows at the edge);
//   - depthWrite:false means the echo never occludes anything drawn after
//     it (the source's transparent petals/sepals, the sky eye's overlay) —
//     it punches no holes.
//
// Per-frame cost: source/echo node pairs are built ONCE at construction;
// while visible the update is a pairwise position/quaternion/scale (+ mesh
// visibility, for the dust-orbit hard toggle) copy over a fixed array — no
// traversal, no allocation. While hidden and settled, the work is exactly
// the gate check. No hash salt is consumed: the echo is a deterministic
// mirror, not a generator.

import * as THREE from 'three';
import { VIEWMODEL, VIEWMODEL_ECHO } from '../config';
import { RoomType } from '../world/RoomConfig';
import { getSharedAssets } from '../world/SharedAssets';

// ===========================================================================
// Pure gating / offset logic (unit-tested in tests/ViewmodelEcho.test.ts)
// ===========================================================================

/** Hard-swap gate: settled target visibility + remaining flicker frames. */
export interface EchoGateState {
    /** Visibility the gate settles to once the flicker runs out. */
    target: boolean;
    /** Frames left of the room hard-swap flicker (0 = settled). */
    framesLeft: number;
}

/** Initial gate state: hidden, settled (no flicker armed). */
export function createEchoGateState(): EchoGateState {
    return { target: false, framesLeft: 0 };
}

/**
 * Flicker parity, same rule as RoomSky.swapFlickerVisible: hidden on odd
 * counts, visible on even. Counting down from an odd FLICKER_FRAMES yields
 * off/on/off and then the settle frame — the swap lands with a pop instead
 * of a fade. Pure.
 */
export function echoFlickerVisible(framesLeft: number): boolean {
    return framesLeft % 2 === 0;
}

/**
 * Advance the gate one frame: a target change arms `flickerFrames` of
 * parity stutter, after which visibility settles to the target. Mutates
 * `state` in place (allocation-free per-frame) and returns this frame's
 * visibility. Deterministic — the only inputs are the state and the room.
 */
export function stepEchoGate(
    state: EchoGateState,
    wantVisible: boolean,
    flickerFrames: number,
): boolean {
    if (wantVisible !== state.target) {
        state.target = wantVisible;
        state.framesLeft = flickerFrames;
    }
    if (state.framesLeft > 0) {
        const visible = echoFlickerVisible(state.framesLeft);
        state.framesLeft -= 1;
        return visible;
    }
    return state.target;
}

/**
 * Camera-space x of the misregister offset, holding the ON-SCREEN offset
 * constant across aspect ratios. Misregistration is a property of the page
 * (screen), not of the world: with a fixed vertical FOV a camera-space x
 * maps to NDC as x / (halfH * aspect), so a fixed x would visibly shrink on
 * ultrawide and swell on phone portrait. Scaling by aspect / referenceAspect
 * keeps the NDC offset exactly what it is at the authored REFERENCE_ASPECT
 * (same construction as viewmodelLayout.ndcToCameraSpace). y needs no
 * compensation — the vertical FOV is fixed. Guards a non-positive reference
 * by returning the base unchanged. Pure.
 */
export function misregisterOffsetX(
    baseX: number,
    aspect: number,
    referenceAspect: number,
): number {
    if (!(referenceAspect > 0))
        return baseX;
    return baseX * (aspect / referenceAspect);
}

// ===========================================================================
// System
// ===========================================================================

/** One mirrored node: transforms are copied source -> echo while visible. */
interface EchoPair {
    source: THREE.Object3D;
    echo: THREE.Object3D;
}

/**
 * The misregistered second reading of the player's viewmodel. Constructed
 * once against the live hands tree (HandsModel.getHandsGroup()), parented to
 * the camera as a sibling of the source, and driven by PlayerManager with
 * the current room each frame.
 */
export class ViewmodelEcho {
    private camera: THREE.PerspectiveCamera;
    /** Echo root: carries the camera-local misregister offset; visibility gate. */
    private root = new THREE.Group();
    private pairs: EchoPair[] = [];
    private gate = createEchoGateState();

    // The two shared echo materials — the whole echo is drawn with exactly
    // these (shared is fine: there is exactly one echo instance).
    private inkMat: THREE.MeshBasicMaterial;
    private paperMat: THREE.MeshLambertMaterial;

    /**
     * FlowerProp animates the SHARED flower-core material's emissiveIntensity
     * (its three-state glow); the echo copies that parameter each visible
     * frame so the second reading breathes with the flower.
     */
    private emissiveSource: THREE.MeshStandardMaterial;

    constructor(camera: THREE.PerspectiveCamera, sourceViewmodel: THREE.Object3D) {
        this.camera = camera;

        // Ink plate: flat, unlit — MeshBasic reads as "a system's rendering
        // of you", not a body under the world's light.
        this.inkMat = new THREE.MeshBasicMaterial({
            color: VIEWMODEL_ECHO.INK_COLOR,
            depthWrite: false,
        });
        // Paper plate: black diffuse + white emissive on a Lambert = output
        // is emissive-only, so it reads flat too, while exposing the
        // emissiveIntensity parameter the flower echo copies each frame.
        this.paperMat = new THREE.MeshLambertMaterial({
            color: 0x000000,
            emissive: VIEWMODEL_ECHO.PAPER_COLOR,
            emissiveIntensity: 1,
            wireframe: true,
            depthWrite: false,
        });
        this.emissiveSource = getSharedAssets().matFlowerCore;

        const echoTop = this.buildEcho(sourceViewmodel, false);
        if (echoTop)
            this.root.add(echoTop);

        // Fixed components of the misregister offset; x is aspect-driven and
        // recomputed each visible frame in update().
        this.root.position.set(
            VIEWMODEL_ECHO.OFFSET_X,
            VIEWMODEL_ECHO.OFFSET_Y,
            VIEWMODEL_ECHO.OFFSET_Z,
        );
        this.root.visible = false;
        camera.add(this.root);
    }

    /**
     * Mirror one source node: meshes share the source geometry under an echo
     * material (flower subtree -> paper wireframe, everything else -> solid
     * ink); groups mirror as groups. Lights are dropped entirely — the echo
     * is an image of you, not a light source (cloning the flower's PointLight
     * would double the pre-dither exposure field around the player).
     * Called once at construction; registers every kept node in `pairs`.
     */
    private buildEcho(source: THREE.Object3D, inFlower: boolean): THREE.Object3D | null {
        if ((source as THREE.Light).isLight)
            return null;

        // The flower group is identified by its FlowerProp userData.bloom
        // marker; the flag then covers its whole subtree (stem + bloom).
        const isFlower = inFlower || Boolean(source.userData?.bloom);

        let echo: THREE.Object3D;
        if ((source as THREE.Mesh).isMesh) {
            const mesh = new THREE.Mesh(
                (source as THREE.Mesh).geometry,
                isFlower ? this.paperMat : this.inkMat,
            );
            // renderOrder is per-object (not inherited): set on every mesh.
            mesh.renderOrder = VIEWMODEL_ECHO.RENDER_ORDER;
            echo = mesh;
        }
        else {
            echo = new THREE.Group();
        }

        echo.position.copy(source.position);
        echo.quaternion.copy(source.quaternion);
        echo.scale.copy(source.scale);
        this.pairs.push({ source, echo });

        for (const child of source.children) {
            const childEcho = this.buildEcho(child, isFlower);
            if (childEcho)
                echo.add(childEcho);
        }
        return echo;
    }

    /**
     * Per-frame drive. Call AFTER HandsModel.animate so the echo mirrors
     * THIS frame's pose (PlayerManager owns the order). Hidden and settled
     * costs exactly the gate check.
     */
    update(currentRoomType: RoomType): void {
        const visible = stepEchoGate(
            this.gate,
            currentRoomType === RoomType.IN_BETWEEN,
            VIEWMODEL_ECHO.FLICKER_FRAMES,
        );
        this.root.visible = visible;
        if (!visible)
            return;

        // Aspect-held screen offset (see misregisterOffsetX); y/z are fixed.
        this.root.position.x = misregisterOffsetX(
            VIEWMODEL_ECHO.OFFSET_X,
            this.camera.aspect,
            VIEWMODEL.REFERENCE_ASPECT,
        );

        // Pairwise pose mirror over the fixed pair array — no traversal, no
        // allocation. Visibility is copied for the dust-orbit hard toggle
        // (FlowerProp blinks dust meshes off in the dim state).
        for (const pair of this.pairs) {
            pair.echo.position.copy(pair.source.position);
            pair.echo.quaternion.copy(pair.source.quaternion);
            pair.echo.scale.copy(pair.source.scale);
            pair.echo.visible = pair.source.visible;
        }

        // The second system reads the flower's light too: copy the shared
        // core material's animated emissive level onto the paper plate.
        this.paperMat.emissiveIntensity = this.emissiveSource.emissiveIntensity;
    }

    /**
     * Cleanup. Only the two echo materials are owned here — every geometry
     * is shared with the source viewmodel and disposed by HandsModel /
     * SharedAssets (disposing them twice would be a lifecycle bug).
     */
    dispose(): void {
        this.camera.remove(this.root);
        this.inkMat.dispose();
        this.paperMat.dispose();
        this.pairs.length = 0;
    }
}
