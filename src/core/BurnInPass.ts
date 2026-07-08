// Burn-in afterimage (INFO_OVERFLOW): what you stared at cannot be unseen.
// Black = the system, white = the self, dither = the friction between them —
// and in the overload room the friction leaves residue: hold your gaze still
// and the hard ink/paper content of the frame accumulates into a heat ghost;
// look away and the ghost stays stamped over the world, eroding pixel by
// pixel. This file owns both halves of the mechanic:
//
// - CPU (pure, unit-tested): camera angular speed -> stare state machine
//   (arming time + hysteresis so micro-jitter never chatters) and the
//   hasHeat cooldown that keeps the GPU pass alive until the buffer drains.
// - GPU: a low-res ping-pong render-target pair stepped once per unpaused
//   frame by the BurnAccumShader (shaders/DitherShader.ts), sampling the
//   composer's freshly rendered frame. The result is bound directly onto the
//   dither material's uBurnMap; the room gate (uBurnAmount) rides the normal
//   RoomShaderConfig chain instead.
//
// Cost discipline: the accumulation pass runs ONLY while the room's burn
// gate is open or the cooldown says the buffer still holds heat — every
// other room/time skips the pass entirely. setFrame() is called from
// ShaderSyncUpdater (delta-gated upstream by the pause controller), so a
// paused game neither accumulates nor decays: the ghost freezes with the
// frame, and utils/ScreenshotManager keeps capturing the composited canvas.
import * as THREE from 'three';
import { BURN_IN } from '../config';
import { BurnAccumShader } from '../shaders/DitherShader';
import { disposeRenderTarget } from '../utils/dispose';

/** Orientation shape shared by THREE.Quaternion and plain test literals. */
export interface QuaternionLike {
    x: number;
    y: number;
    z: number;
    w: number;
}

/** Stare-detector tunables (subset of BURN_IN; injectable for tests). */
export interface StareConfig {
    /** rad/s at or below which the view counts as still (arming). */
    STILLNESS_THRESHOLD: number;
    /** rad/s an ACTIVE stare must exceed to break (hysteresis headroom). */
    RELEASE_THRESHOLD: number;
    /** Seconds of continuous stillness before staring arms. */
    ARM_SECONDS: number;
}

/** Mutable stare-detector state (stepped in place, allocation-free). */
export interface StareDetectorState {
    /** Accumulated continuous stillness (s) while un-armed. */
    stillSeconds: number;
    /** True while the player is staring (armed). */
    staring: boolean;
}

/** Fresh un-armed detector state. */
export function createStareDetectorState(): StareDetectorState {
    return { stillSeconds: 0, staring: false };
}

/**
 * Angle (radians) between two orientations: 2*acos(|dot|), double-cover safe
 * (q and -q are the same orientation and read as 0). Pure.
 */
export function quaternionAngleRadians(a: QuaternionLike, b: QuaternionLike): number {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    const clamped = Math.min(1, Math.abs(dot));
    return 2 * Math.acos(clamped);
}

/**
 * Step the stare state machine one frame (mutates `state` in place, returns
 * the new staring flag). Arming requires TRUE stillness (speed at or below
 * STILLNESS_THRESHOLD) held for ARM_SECONDS — any faster motion resets the
 * timer. Once armed, only speed ABOVE RELEASE_THRESHOLD breaks the stare:
 * the hysteresis band between the two thresholds absorbs micro-jitter
 * without chattering, but deliberately does NOT arm. Pure logic; exported
 * for testing.
 */
export function stepStareDetector(
    state: StareDetectorState,
    angularSpeed: number,
    delta: number,
    config: StareConfig = BURN_IN,
): boolean {
    if (state.staring) {
        if (angularSpeed > config.RELEASE_THRESHOLD) {
            state.staring = false;
            state.stillSeconds = 0;
        }
        return state.staring;
    }
    if (angularSpeed <= config.STILLNESS_THRESHOLD) {
        state.stillSeconds += delta;
        if (state.stillSeconds >= config.ARM_SECONDS)
            state.staring = true;
    }
    else {
        state.stillSeconds = 0;
    }
    return state.staring;
}

/**
 * Step the hasHeat cooldown: a contributing frame (staring inside the burn
 * room) re-arms the full window; otherwise it drains by delta toward 0. The
 * window is sized >= DECAY_SECONDS (config contract), so by the time it hits
 * 0 the GPU buffer is guaranteed fully eroded and the pass may stop. Pure.
 */
export function stepHeatCooldown(
    remaining: number,
    contributing: boolean,
    delta: number,
    cooldownSeconds: number = BURN_IN.HAS_HEAT_COOLDOWN,
): number {
    if (contributing)
        return cooldownSeconds;
    return Math.max(0, remaining - delta);
}

/**
 * Whether the accumulation pass must run this frame: while the room gate is
 * open (burn strength > 0, including transition fades) OR the buffer may
 * still hold heat. Everywhere else the pass costs nothing. Pure.
 */
export function shouldRunBurnPass(burnStrength: number, heatCooldown: number): boolean {
    return burnStrength > 0 || heatCooldown > 0;
}

/**
 * Session registry: createPostProcessing builds the pass next to the shader
 * quad; ShaderSyncUpdater (which is handed only the quad — main.ts stays
 * untouched) looks it up here to feed the per-frame CPU state in.
 */
const passByQuad = new WeakMap<THREE.Object3D, BurnInPass>();

export function registerBurnInPass(quad: THREE.Object3D, pass: BurnInPass): void {
    passByQuad.set(quad, pass);
}

export function getBurnInPass(quad: THREE.Object3D): BurnInPass | null {
    return passByQuad.get(quad) ?? null;
}

/**
 * The burn-in heat pass: stare detection + the low-res ping-pong heat buffer.
 * setFrame() (CPU, from ShaderSyncUpdater's update — pause-gated) arms one
 * frame of accumulation; run() (from PostProcessing.renderComposed, after the
 * scene render) consumes it, steps the buffer once, and binds the fresh heat
 * texture onto the dither material's uBurnMap.
 */
export class BurnInPass {
    /** Ping-pong pair; targets[readIndex] holds the CURRENT heat state. */
    private readonly targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
    private readIndex = 0;

    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

    // CPU stare state (pure helpers above).
    private readonly stare = createStareDetectorState();
    private readonly prevQuat = { x: 0, y: 0, z: 0, w: 1 };
    private hasPrevQuat = false;
    private heatCooldown = 0;
    private burnStrength = 0;
    private contributing = false;

    // One-frame accumulation ticket: armed by setFrame (update phase),
    // consumed by run (render phase). While paused, no ticket -> no step.
    private framePending = false;
    private frameDelta = 0;

    // Fresh targets hold undefined data; also re-armed on resize and after
    // every inactive stretch so a re-entered room never inherits stale heat.
    private needsClear = true;

    /** Scratch for save/restore of the renderer clear color during clears. */
    private readonly savedClearColor = new THREE.Color();

    /**
     * @param width - Composer target width (renderScale-scaled).
     * @param height - Composer target height (renderScale-scaled).
     */
    constructor(width: number, height: number) {
        const options: THREE.RenderTargetOptions = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            // Half-float: an 8-bit channel would quantize the slow per-frame
            // decay (delta / DECAY_SECONDS) below its own step at high fps.
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false,
        };
        this.targets = [
            new THREE.WebGLRenderTarget(this.scaled(width), this.scaled(height), options),
            new THREE.WebGLRenderTarget(this.scaled(width), this.scaled(height), options),
        ];
        this.quad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.ShaderMaterial({
                uniforms: {
                    tPrevHeat: { value: null },
                    tScene: { value: null },
                    uDelta: { value: 0 },
                    uStareGain: { value: 0 },
                    uDecayRate: { value: 1 / BURN_IN.DECAY_SECONDS },
                    uContribThreshold: { value: BURN_IN.CONTRIBUTION_THRESHOLD },
                },
                vertexShader: BurnAccumShader.vertexShader,
                fragmentShader: BurnAccumShader.fragmentShader,
            }),
        );
        this.scene.add(this.quad);
    }

    private scaled(v: number): number {
        return Math.max(1, Math.round(v * BURN_IN.BUFFER_SCALE));
    }

    /**
     * CPU half of the frame (call once per UNPAUSED frame, before render):
     * camera orientation -> angular speed -> stare machine, plus the room's
     * live burn gate (transition-blended burnInStrength). Arms exactly one
     * accumulation step for the upcoming run().
     */
    setFrame(delta: number, orientation: QuaternionLike, burnStrength: number): void {
        const angularSpeed = this.hasPrevQuat && delta > 0
            ? quaternionAngleRadians(this.prevQuat, orientation) / delta
            : 0;
        this.prevQuat.x = orientation.x;
        this.prevQuat.y = orientation.y;
        this.prevQuat.z = orientation.z;
        this.prevQuat.w = orientation.w;
        this.hasPrevQuat = true;

        const staring = stepStareDetector(this.stare, angularSpeed, delta);
        this.burnStrength = burnStrength;
        // Heat only ever builds inside the burn room (gate > 0, incl. the
        // transition fade); staring elsewhere leaves no residue.
        this.contributing = staring && burnStrength > 0;
        this.heatCooldown = stepHeatCooldown(this.heatCooldown, this.contributing, delta);

        this.frameDelta = delta;
        this.framePending = true;
    }

    /**
     * GPU half of the frame (from renderComposed, after the scene render):
     * step the heat buffer once with the CURRENT frame as the burn source and
     * bind the result onto the dither material. No pending ticket (paused) =>
     * the ghost freezes exactly; inactive (no gate, no heat) => free.
     * Leaves the renderer's target dirty — the caller resets it for the
     * composite pass, as it already did between scene and quad.
     */
    run(
        renderer: THREE.WebGLRenderer,
        sceneTexture: THREE.Texture,
        ditherMaterial: THREE.ShaderMaterial,
    ): void {
        if (!this.framePending)
            return;
        this.framePending = false;

        if (!shouldRunBurnPass(this.burnStrength, this.heatCooldown)) {
            // Whatever heat remains has fully eroded (cooldown contract);
            // re-arm the clear so a later reactivation starts from zero.
            this.needsClear = true;
            return;
        }

        if (this.needsClear) {
            this.clearTargets(renderer);
            this.needsClear = false;
        }

        const read = this.targets[this.readIndex];
        const write = this.targets[1 - this.readIndex];
        const u = this.quad.material.uniforms;
        u.tPrevHeat.value = read.texture;
        u.tScene.value = sceneTexture;
        u.uDelta.value = this.frameDelta;
        u.uStareGain.value = this.contributing ? BURN_IN.GAIN_PER_SECOND : 0;

        renderer.setRenderTarget(write);
        renderer.render(this.scene, this.camera);
        this.readIndex = 1 - this.readIndex;

        // Bind the fresh heat state for the composite pass. The sampler is
        // deliberately outside the room-config chain (see types/shader.ts).
        ditherMaterial.uniforms.uBurnMap.value = write.texture;
    }

    /** Zero both heat targets (black = no heat), preserving clear-color state. */
    private clearTargets(renderer: THREE.WebGLRenderer): void {
        renderer.getClearColor(this.savedClearColor);
        const savedAlpha = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 1);
        for (const target of this.targets) {
            renderer.setRenderTarget(target);
            renderer.clear(true, false, false);
        }
        renderer.setClearColor(this.savedClearColor, savedAlpha);
    }

    /**
     * Track the composer's resize (updatePostProcessingSize). Resizing drops
     * the buffer contents, so the next active frame starts from clean zero.
     */
    setSize(width: number, height: number): void {
        for (const target of this.targets)
            target.setSize(this.scaled(width), this.scaled(height));
        this.needsClear = true;
    }

    /** Release both render targets and the accumulation quad's GPU objects. */
    dispose(): void {
        for (const target of this.targets)
            disposeRenderTarget(target);
        this.quad.geometry.dispose();
        this.quad.material.dispose();
    }
}
