// 1-bit Chimera Void - Type Definitions
import * as THREE from 'three';

// ===== Building & Generation =====

export interface BuildingParams {
    i: number;
    cx: number;
    cz: number;
    assets: SharedAssets;
}

export interface SharedAssets {
    // Materials
    matSolid: THREE.MeshLambertMaterial;
    matDark: THREE.MeshLambertMaterial;
    matWire: THREE.MeshBasicMaterial;
    matPlasma: THREE.MeshLambertMaterial;
    matTreeBark: THREE.MeshLambertMaterial;
    matFlowerStem: THREE.MeshLambertMaterial;
    matFlowerPetal: THREE.MeshPhongMaterial;
    matFlowerCore: THREE.MeshStandardMaterial;
    matLiquid: THREE.MeshPhongMaterial;
    // Geometries
    boxGeo: THREE.BoxGeometry;
    blobGeo: THREE.IcosahedronGeometry;
    sphereGeo: THREE.SphereGeometry;
    knotGeo: THREE.TorusKnotGeometry;
    coneGeo: THREE.ConeGeometry;
    tetraGeo: THREE.TetrahedronGeometry;
    cylinderGeo: THREE.CylinderGeometry;
    dispose(): void;
}

// ===== Animation Types =====

export type AnimationType =
    | 'ROTATE_FLOAT'
    | 'LIQUID_WOBBLE'
    | 'BRANCH_SWAY'
    | 'LEAF_FLUTTER'
    | 'PETAL_BREATHE'
    | 'SEPAL_FLOAT'
    | 'DUST_ORBIT';

export interface AnimatedObjectUserData {
    animType?: AnimationType;
    speed?: number;
    phase?: number;
    baseScale?: THREE.Vector3;
    initialRotZ?: number;
    rigidity?: number;
    isPlasma?: boolean;
    axis?: THREE.Vector3;
    baseRotX?: number;
}

export interface AnimatedObject extends THREE.Object3D {
    userData: AnimatedObjectUserData;
    material?: THREE.Material & { emissive?: THREE.Color };
}

// ===== Cable System =====

export interface CableNode {
    obj: { position: THREE.Vector3 };
    topOffset: THREE.Vector3;
    isGround: boolean;
}

export interface CableOptions {
    droop: number;
    heavySag: boolean;
    offsetS: THREE.Vector3;
    offsetE: THREE.Vector3;
}

export interface CableCache {
    pStart: THREE.Vector3;
    pEnd: THREE.Vector3;
    mid: THREE.Vector3;
}

export interface DynamicCable {
    line: THREE.Line;
    startNode: CableNode;
    endNode: CableNode;
    options: CableOptions;
    segments: number;
    _cache: CableCache;
}

// ===== Chunk System =====

export interface BuildingUserData {
    initialPos: THREE.Vector3;
    wanderSpeed: number;
    wanderRange: number;
    offset: number;
    isMobile: boolean;
}

export interface ChunkUserData {
    cables: DynamicCable[];
    buildings: THREE.Group[];
    animatedObjects: AnimatedObject[];
}

export interface Chunk extends THREE.Group {
    userData: ChunkUserData;
}

// ===== Weather System =====

export interface WeatherState {
    weatherType: number;
    weatherIntensity: number;
    weatherTime: number;
}

export interface WeatherConfig {
    minCooldown: number;
    maxCooldown: number;
    minDuration: number;
    maxDuration: number;
    transitionSpeed: number;
    glitchChance: number;
}

// ===== Day/Night System =====

export interface DayNightContext {
    scene: THREE.Scene;
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    audio: AudioSystemInterface;
    weather: WeatherSystemInterface;
    onSunset?: () => void;  // Callback for state snapshot on day->night transition
}

// ===== Audio System Interface =====

export interface AudioSystemInterface {
    enabled: boolean;
    init(): void;
    playFootstep(): void;
    playCablePulse(): void;
    playEyeBlink(): void;
    playDayNightTransition(toNight: boolean): void;
    setVolume(value: number): void;
    toggleMute(): void;
    // Gaze
    playGazeStartPulse(): void;
    updateGaze(isGazing: boolean, gazeIntensity: number): void;
    tick(deltaTime: number): void;
    // Override
    playOverrideTear(): void;
    // Room
    playRoomTransition(): void;
    playJump(): void;
    playDoubleJump(): void;
    updateWeatherAudio(weatherType: number, intensity: number): void;
    playGlitchBurst(): void;
    // Flower
    updateFlowerAudio(intensity: number): void;
    playFlowerStateChange(ascending: boolean): void;
    stopFlowerAudio(): void;
    // Rift
    startRiftFog(): void;
    updateRiftFog(intensity: number): void;
    stopRiftFog(): void;
    playRiftFall(): void;
    stopRiftFall(): void;
    playRiftRespawn(): void;
    // Cable
    startCableHum(): void;
    updateCableHum(intensity: number): void;
    stopCableHum(): void;
    // Binaural
    updateBinauralPosition(xPosition: number, crackWidth: number): void;
}

export interface WeatherSystemInterface {
    update(delta: number, time: number): WeatherState;
    forceWeather(type: string, duration?: number): void;
}

// ===== Controls =====

export interface ControlsConfig {
    speed: number;
    jumpForce: number;
    gravity: number;
    friction: number;
    groundHeight: number;
    bobSpeed: number;
    bobAmount: number;
    mouseSensitivity: number;
    maxJumps: number;
}

export interface PlayerPosition {
    x: number;
    z: number;
}

// ===== Shader Uniforms =====

export interface DitherUniforms {
    tDiffuse: { value: THREE.Texture | null };
    resolution: { value: THREE.Vector2 };
    enableOutline: { value: boolean };
    outlineStrength: { value: number };
    enableDepthDither: { value: boolean };
    ditherTransition: { value: number };
    invertColors: { value: boolean };
    weatherType: { value: number };
    weatherIntensity: { value: number };
    weatherTime: { value: number };
}

export interface CableUniforms {
    time: { value: number };
    color: { value: THREE.Color };
    pulseColor: { value: THREE.Color };
}

export interface ShaderDefinition {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
}

// ===== Finger & Hand Model =====

export interface FingerStructure {
    root: THREE.Group;
    s1: THREE.Mesh | THREE.Group;
    s2: THREE.Group;
    s3: THREE.Group;
    length?: number;
}

export interface ThumbStructure {
    root: THREE.Group;
    s1: THREE.Group;
    s2: THREE.Group;
}

// ===== Application Config =====

export interface AppConfig {
    renderScale: number;
    fogNear: number;
    fogFar: number;
}

// ===== Ambient Audio Node =====

export interface AmbientNode {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
}
