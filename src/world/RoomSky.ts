// 1-bit Chimera Void - Room Sky (per-room sky vocabulary)
//
// The flat background becomes four skies: one camera-following inverted dome
// draws the CURRENT room's celestial treatment behind everything. black = the
// system, white = the self, dither = the friction between them — and the sky
// is where the room's mental state stops pretending to be architecture:
//
// - INFO_OVERFLOW: sparse hard specks blinking on hash phases — signal
//   without meaning, all the way up.
// - FORCED_ALIGNMENT: absolutely horizontal ledger rule-lines — even the sky
//   is a form to be filled in.
// - IN_BETWEEN: two celestial discs slightly offset, one ink one paper — a
//   heaven misregistered, printed once by each system and agreeing on nothing.
// - POLARIZED: the sky splits into an ink half and a paper half through the
//   vertical plane of the local seam line — the ground's us/them continued
//   overhead with nothing in between.
//
// Discipline: strict 1-bit. Every mark is hard on/off (step()); the treatment
// hard-swaps on room change with a 2-3 frame off/on flicker, never a
// crossfade. The dome's base color is copied from the live scene.background
// every frame, so it can never fight DayNightCycle (which owns that color);
// at night the ink/paper roles are hard-swapped so that, composed with the
// DitherShader's global night inversion, every mark keeps its final polarity
// (dark specks stay dark specks) across the whole cycle.
//
// The dome is global and permanent (no chunk lifecycle): one draw call,
// fog:false, depthWrite:false, drawn behind everything via renderOrder, and
// re-centered on the player's x/z each frame so it is never approached.
// Owned and driven by core/StatsSunsetUpdater (beside the DayNightCycle whose
// blend it follows); disposed there on teardown.
import type { ColorRGB } from './RoomConfig';
import * as THREE from 'three';
import { ROOM_SKY } from '../config';
import { riftLineXForWorldX, ROOM_CONFIGS, RoomType } from './RoomConfig';

/**
 * Shader treatment ids consumed by the dome fragment shader's uMode. Not a
 * DitherShader mode — this is a dedicated object-level ShaderMaterial (same
 * precedent as the cable uplink material: the 6-site DitherShader uniform
 * chain is deliberately untouched).
 */
export const ROOM_SKY_MODE = {
    /** INFO_OVERFLOW: sparse blinking specks. */
    SPECKS: 0,
    /** FORCED_ALIGNMENT: horizontal ledger rule-lines. */
    LEDGER: 1,
    /** IN_BETWEEN: two misregistered celestial discs. */
    TWIN_DISCS: 2,
    /** POLARIZED: hard ink/paper split through the seam plane. */
    SPLIT: 3,
} as const;

/** Room -> sky treatment (bijective; the sky is part of the room's identity). */
export function roomSkyMode(roomType: RoomType): number {
    switch (roomType) {
        case RoomType.INFO_OVERFLOW: return ROOM_SKY_MODE.SPECKS;
        case RoomType.FORCED_ALIGNMENT: return ROOM_SKY_MODE.LEDGER;
        case RoomType.IN_BETWEEN: return ROOM_SKY_MODE.TWIN_DISCS;
        case RoomType.POLARIZED: return ROOM_SKY_MODE.SPLIT;
    }
}

/**
 * World x of the vertical plane the POLARIZED sky splits along: the seam line
 * nearest the player. A POLARIZED chunk's razor seam runs down its center x
 * (ChunkManager.updateSeamSwap judges the band against chunk.position.x), and
 * riftLineXForWorldX is the single conversion source for that chunk-column
 * center — so the sky's split always stands directly over the floor seam the
 * player is standing nearest to. Pure, per-frame safe.
 */
export function skySeamXForPlayerX(playerX: number): number {
    return riftLineXForWorldX(playerX);
}

/**
 * Dome visibility during the room hard-swap flicker, from the frames-left
 * countdown: hidden on odd counts, visible on even. Counting down from an odd
 * SWAP_FLICKER_FRAMES (e.g. 3 -> hidden, visible, hidden) ends hidden and then
 * settles visible — an off/on/off stutter, never a fade. Pure.
 */
export function swapFlickerVisible(framesLeft: number): boolean {
    return framesLeft % 2 === 0;
}

/**
 * Unit direction of a celestial disc center from azimuth (rad, 0 = +z,
 * increasing toward +x) and elevation (rad above the horizon). Pure; used
 * once at construction for the IN_BETWEEN twin discs.
 */
export function celestialDiscDirection(azimuth: number, elevation: number): [number, number, number] {
    const cosEl = Math.cos(elevation);
    return [cosEl * Math.sin(azimuth), Math.sin(elevation), cosEl * Math.cos(azimuth)];
}

/**
 * The dome's ink/paper duotone for a room and day phase. Day uses the room's
 * own RoomConfig colors; night hard-swaps the roles so that, composed with
 * the DitherShader's global night inversion, every sky mark keeps its final
 * polarity across the cycle (a swap is 1-bit; a dim would be a fade). Pure.
 */
export function skyPalette(roomType: RoomType, isDay: boolean): { ink: ColorRGB; paper: ColorRGB } {
    const shader = ROOM_CONFIGS[roomType].shader;
    return isDay
        ? { ink: shader.inkColor, paper: shader.paperColor }
        : { ink: shader.paperColor, paper: shader.inkColor };
}

// In-shader analogue of utils/hash (same sine/magic-number construction) for
// per-cell speck gates and blink phases: purely visual, deterministic per
// direction, so no JS-side salt is consumed.
const SKY_VERTEX_SHADER = `
    varying vec3 vDir;
    varying vec3 vWorldPos;
    void main() {
        // Object-space direction: stable under the x/z player-follow, so the
        // sky never scrolls with walking (a sky, not a ceiling).
        vDir = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const SKY_FRAGMENT_SHADER = `
    uniform int uMode;
    uniform float uTime;
    uniform vec3 uInk;
    uniform vec3 uPaper;
    uniform vec3 uBase;
    uniform float uSeamX;
    uniform float uSpeckGrid;
    uniform float uSpeckFill;
    uniform float uSpeckSize;
    uniform float uSpeckBlinkSpeed;
    uniform float uLineCount;
    uniform float uLineThickness;
    uniform vec3 uDiscDirInk;
    uniform vec3 uDiscDirPaper;
    uniform float uDiscCos;
    varying vec3 vDir;
    varying vec3 vWorldPos;

    float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec3 dir = normalize(vDir);
        // Lat/long parametrization: azimuth around y, elevation off the horizon.
        float az = atan(dir.x, dir.z) / 6.28318530718 + 0.5; // 0..1
        float el = asin(clamp(dir.y, -1.0, 1.0)) / 1.57079632679; // -1..1

        vec3 c = uBase;
        if (uMode == 0) {
            // INFO_OVERFLOW: sparse hard speck squares blinking on hash
            // phases. Each lat/long cell draws at most one speck at a
            // hash-jittered spot; step() keeps everything strictly on/off.
            vec2 cellUv = vec2(az * uSpeckGrid, (el * 0.5 + 0.5) * uSpeckGrid * 0.5);
            vec2 cell = floor(cellUv);
            float gate = hash2(cell);
            float host = step(1.0 - uSpeckFill, gate);
            vec2 jitter = vec2(hash2(cell + 17.0), hash2(cell + 53.0));
            vec2 center = jitter * (1.0 - uSpeckSize) + uSpeckSize * 0.5;
            vec2 d = abs(fract(cellUv) - center);
            float speck = step(max(d.x, d.y), uSpeckSize * 0.5);
            float blink = step(0.5, fract(uTime * uSpeckBlinkSpeed + gate * 9.13));
            c = mix(uBase, uInk, host * speck * blink);
        }
        else if (uMode == 1) {
            // FORCED_ALIGNMENT: absolutely horizontal ledger rule-lines,
            // evenly spaced in elevation ANGLE across the above-horizon band.
            float line = step(fract(el * uLineCount), uLineThickness) * step(0.0, el);
            c = mix(uBase, uInk, line);
        }
        else if (uMode == 2) {
            // IN_BETWEEN: two celestial discs slightly offset — a heaven
            // printed once by each system. Paper plate first, ink plate over
            // it: the overlap goes ink, leaving a paper misregister rim.
            float paperDisc = step(uDiscCos, dot(dir, uDiscDirPaper));
            float inkDisc = step(uDiscCos, dot(dir, uDiscDirInk));
            c = mix(mix(uBase, uPaper, paperDisc), uInk, inkDisc);
        }
        else {
            // POLARIZED: the sky splits hard through the vertical plane of
            // the local seam line — ink west, paper east, nothing between.
            c = mix(uInk, uPaper, step(uSeamX, vWorldPos.x));
        }
        gl_FragColor = vec4(c, 1.0);
    }
`;

/**
 * The camera-following sky dome. One inverted sphere, one dedicated
 * ShaderMaterial, one draw call. See the file header for the design contract;
 * update() is allocation-free (color copies + scalar uniform writes only).
 */
export class RoomSky {
    private readonly scene: THREE.Scene;
    private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

    // Accumulated play time (s): delta-driven, so the speck blink phase is
    // pause-gated along with the rest of the update phase.
    private time = 0;

    // Last applied room/day state, so palette + mode writes happen only on
    // actual change; null until the first update applies the initial state
    // (without a flicker — waking up is not a room swap).
    private currentRoom: RoomType | null = null;
    private wasDay: boolean | null = null;

    // Room hard-swap flicker countdown (frames). See swapFlickerVisible.
    private flickerFramesLeft = 0;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uMode: { value: ROOM_SKY_MODE.SPECKS },
                uTime: { value: 0 },
                uInk: { value: new THREE.Color(0, 0, 0) },
                uPaper: { value: new THREE.Color(1, 1, 1) },
                uBase: { value: new THREE.Color(0x888888) },
                uSeamX: { value: 0 },
                // Set-once treatment knobs (all tunables live in ROOM_SKY).
                uSpeckGrid: { value: ROOM_SKY.SPECK_GRID },
                uSpeckFill: { value: ROOM_SKY.SPECK_FILL },
                uSpeckSize: { value: ROOM_SKY.SPECK_SIZE },
                uSpeckBlinkSpeed: { value: ROOM_SKY.SPECK_BLINK_SPEED },
                uLineCount: { value: ROOM_SKY.LINE_COUNT },
                uLineThickness: { value: ROOM_SKY.LINE_THICKNESS },
                uDiscDirInk: {
                    value: new THREE.Vector3(...celestialDiscDirection(
                        ROOM_SKY.DISC_AZIMUTH,
                        ROOM_SKY.DISC_ELEVATION,
                    )),
                },
                uDiscDirPaper: {
                    value: new THREE.Vector3(...celestialDiscDirection(
                        ROOM_SKY.DISC_AZIMUTH + ROOM_SKY.DISC_OFFSET_AZIMUTH,
                        ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION,
                    )),
                },
                uDiscCos: { value: Math.cos(ROOM_SKY.DISC_ANGULAR_RADIUS) },
            },
            vertexShader: SKY_VERTEX_SHADER,
            fragmentShader: SKY_FRAGMENT_SHADER,
            // Seen from inside; ignores scene fog (it IS the beyond-the-fog);
            // never writes depth so the whole world overdraws it.
            side: THREE.BackSide,
            fog: false,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(ROOM_SKY.RADIUS, ROOM_SKY.WIDTH_SEGMENTS, ROOM_SKY.HEIGHT_SEGMENTS),
            material,
        );
        this.mesh.renderOrder = ROOM_SKY.RENDER_ORDER;
        // The shell always surrounds the camera — culling it would blank the sky.
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    /**
     * Drive the dome for this frame. Runs right after DayNightCycle.update
     * (StatsSunsetUpdater) so the base color and day polarity are this
     * frame's — the dome follows the cycle's blend by construction.
     * @param delta - Frame delta (s), pause-gated upstream.
     * @param playerPos - Player world position (dome re-centers on x/z).
     * @param roomType - The player's CURRENT room (hard-swaps the treatment).
     * @param isDay - DayNightCycle day phase (hard-swaps ink/paper roles).
     */
    update(delta: number, playerPos: THREE.Vector3, roomType: RoomType, isDay: boolean): void {
        this.time += delta;
        const u = this.mesh.material.uniforms;
        u.uTime.value = this.time;

        // Follow on x/z only: the dome stays on the world's vertical datum so
        // the horizon, rules and discs never bob with jumps or the rift fall.
        this.mesh.position.set(playerPos.x, 0, playerPos.z);

        // The POLARIZED split plane stands over the seam nearest the player.
        u.uSeamX.value = skySeamXForPlayerX(playerPos.x);

        // Base = the live background (DayNightCycle owns it): copied every
        // frame, so day/night transitions and eclipses carry through exactly.
        if (this.scene.background instanceof THREE.Color)
            (u.uBase.value as THREE.Color).copy(this.scene.background);

        // Hard-swap treatment + palette on change only. A ROOM change also
        // arms the off/on/off flicker; the day/night role swap does not (the
        // global inversion is already the cycle's own hard cut).
        if (roomType !== this.currentRoom || isDay !== this.wasDay) {
            if (this.currentRoom !== null && roomType !== this.currentRoom)
                this.flickerFramesLeft = ROOM_SKY.SWAP_FLICKER_FRAMES;
            this.currentRoom = roomType;
            this.wasDay = isDay;
            u.uMode.value = roomSkyMode(roomType);
            const { ink, paper } = skyPalette(roomType, isDay);
            (u.uInk.value as THREE.Color).setRGB(ink[0], ink[1], ink[2]);
            (u.uPaper.value as THREE.Color).setRGB(paper[0], paper[1], paper[2]);
        }

        // Swap flicker: hidden frames expose the raw background — the sky
        // blinks out and back as the new vocabulary takes the dome.
        if (this.flickerFramesLeft > 0) {
            this.mesh.visible = swapFlickerVisible(this.flickerFramesLeft);
            this.flickerFramesLeft--;
        }
        else if (!this.mesh.visible) {
            this.mesh.visible = true;
        }
    }

    /** Remove the dome and free its geometry + material (app teardown). */
    dispose(): void {
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
