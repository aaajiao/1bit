// 1-bit Chimera Void - Main Entry Point
import type * as THREE from 'three';
import type { PostProcessingComponents } from './core/PostProcessing';
import type { ShaderUniformParams } from './core/ShaderUniformUpdater';
import type { AppConfig } from './types';
import { AudioController } from './audio/AudioController';
import { PERFORMANCE, SPAWN } from './config';
import { isWebGLAvailable, showFallback } from './core/BootGuard';
import { CableAudioUpdater } from './core/CableAudioUpdater';
import { HudUpdater } from './core/HudUpdater';
import { PauseController } from './core/PauseController';
import { createPostProcessing, disposePostProcessing, updatePostProcessingSize } from './core/PostProcessing';
import { RoomFlowUpdater } from './core/RoomFlowUpdater';
import { createScene, updateScannerLight } from './core/SceneSetup';
import { createShaderUniformParams, updateShaderUniforms } from './core/ShaderUniformUpdater';
import { StatsSunsetUpdater } from './core/StatsSunsetUpdater';
import { StressLevel } from './core/StressLevel';
// New Managers
import { PlayerManager } from './player/PlayerManager';
import { RunStatsCollector } from './stats/RunStatsCollector';
import { ScarStore } from './stats/ScarStorage';
import { ScreenshotManager } from './utils/ScreenshotManager';
import { updateCableTime } from './world/CableSystem';
import { CHUNK_SIZE, ChunkManager } from './world/ChunkManager';
import { FigureSystem } from './world/FigureSystem';
import { GhostSystem } from './world/GhostSystem';
import { findQuietSpawnPosition, getRoomTypeAtWorldPosition, RoomType } from './world/RoomConfig';
import { SkyEye } from './world/SkyEye';
import { WeatherSystem } from './world/WeatherSystem';

// Extend Window interface for app reference
declare global {
    interface Window {
        app: ChimeraVoid;
    }
}

/**
 * Main application class
 */
class ChimeraVoid {
    private camera: THREE.PerspectiveCamera;
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private postProcessing: PostProcessingComponents;
    private chunkManager: ChunkManager;
    private scannerLight: THREE.SpotLight;
    private skyEye: SkyEye;
    private audio: AudioController;
    private weather: WeatherSystem;
    private prevTime: number = 0;
    private hasPrevTime: boolean = false;

    // Systems
    private player: PlayerManager;
    private runStats: RunStatsCollector;
    private scars: ScarStore;
    private screenshotManager: ScreenshotManager;

    // Per-frame wiring helpers (core/)
    private cableAudio: CableAudioUpdater;
    private roomFlow: RoomFlowUpdater;
    private statsSunset: StatsSunsetUpdater;
    private hudUpdater: HudUpdater;
    // F5 stress->grain smoother (pressure coarsens the dither sampling grid).
    private stress: StressLevel = new StressLevel();

    // Pause state machine + persistent window/document listeners: while paused
    // (no pointer lock / start screen shown / tab hidden) the entire UPDATE
    // phase is gated so nothing advances; only the render keeps presenting the
    // last frame (H3/M1/M2/M4/H5).
    private pause: PauseController;

    // Reused every frame by updateShaderUniforms (fields mutated in place so
    // the per-frame uniform sync allocates nothing).
    private shaderParams: ShaderUniformParams;

    // Animation loop control
    private isRunning: boolean = true;
    private animationFrameId: number = 0;

    private config: AppConfig = {
        renderScale: PERFORMANCE.DEFAULT_RENDER_SCALE,
        fogNear: PERFORMANCE.FOG_NEAR,
        fogFar: PERFORMANCE.FOG_FAR,
    };

    constructor(container: HTMLElement) {
        // Initialize scene, camera, renderer, and lighting
        const sceneComponents = createScene(container, this.config);
        this.scene = sceneComponents.scene;
        this.camera = sceneComponents.camera;
        this.renderer = sceneComponents.renderer;
        this.scannerLight = sceneComponents.scannerLight;

        // Initialize post-processing
        this.postProcessing = createPostProcessing(this.config.renderScale);

        // Audio system
        this.audio = new AudioController();

        // Player Manager (use renderer canvas for pointer lock)
        this.player = new PlayerManager(this.camera, this.renderer.domElement, this.audio);
        // Spawn in the nearest quiet room (flow-audit medium #7): the origin
        // chunk is always INFO_OVERFLOW — the loudest opening possible — so
        // scan outward for IN_BETWEEN/POLARIZED instead (origin fallback and
        // radius cap live in the helper).
        const spawn = findQuietSpawnPosition();
        this.player.setSpawnPosition(spawn.x, SPAWN.SPAWN_HEIGHT, spawn.z);

        // Cross-run scar record (F2): ONE localStorage read at boot, cached
        // in memory — the eye's familiarity and the world's scars both read
        // from this snapshot-side cache.
        this.scars = new ScarStore();

        // World & Environment (seed the room state from the actual spawn so
        // the first frame doesn't blend in from the wrong room's palette)
        this.skyEye = new SkyEye(this.scene, this.scars.getRunsCompleted());
        this.chunkManager = new ChunkManager(
            this.scene,
            getRoomTypeAtWorldPosition(spawn.x, spawn.z),
            this.scars.getScars(),
        );
        this.weather = new WeatherSystem();

        // Stats & Utils
        this.runStats = new RunStatsCollector();
        this.screenshotManager = new ScreenshotManager(this.renderer);

        // Per-frame wiring helpers (core/)
        this.cableAudio = new CableAudioUpdater();
        // Room flow also eases scene.fog toward the current room's horizon
        // (flow-audit enhancement #12); createScene always installs THREE.Fog.
        // The profile source feeds the room ledger (F1 "the world reads you").
        // The figure system (F3 silhouettes) attributes rooms via the chunk
        // manager's ledger so figures agree with the generated world; the
        // ghost (F4) replays last session's persisted trail, loaded here at
        // boot before any save can overwrite it. The RoomFlowUpdater drives
        // both per frame and owns their dispose.
        this.roomFlow = new RoomFlowUpdater(
            this.scene.fog as THREE.Fog | null,
            () => this.runStats.getLiveProfile(),
            new FigureSystem(this.scene, this.chunkManager),
            new GhostSystem(this.scene),
        );
        this.statsSunset = new StatsSunsetUpdater({
            scene: this.scene,
            shaderQuad: this.postProcessing.shaderQuad,
            audio: this.audio,
            weather: this.weather,
            runStats: this.runStats,
            player: this.player,
            scars: this.scars,
        });
        this.hudUpdater = new HudUpdater();
        this.shaderParams = createShaderUniformParams(
            this.postProcessing.shaderQuad,
            this.chunkManager.getCurrentShaderConfig(),
        );

        // Window/document events + initial pause sync (H3/M1/M2/M4/H5/M14).
        this.pause = new PauseController({
            audio: this.audio,
            isPointerLocked: () => this.player.controls.isPointerLocked(),
            onResize: () => this.onResize(),
            onTimingReset: () => {
                this.hasPrevTime = false;
            },
            onDispose: () => this.dispose(),
        });

        // Touch pause button -> pause state machine (touch fallback mode has
        // no pointerlockchange event for PauseController to observe).
        this.player.controls.setOnPauseRequest(() => this.pause.syncPauseState());

        // Start loop
        this.animate();
    }

    private onResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        updatePostProcessingSize(this.postProcessing, this.config.renderScale);
    }

    private animate(): void {
        if (!this.isRunning)
            return;
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        const time = performance.now();
        // On the first tick (or after a reset) seed prevTime so the initial
        // delta isn't inflated by the time since page load (M1).
        if (!this.hasPrevTime) {
            this.prevTime = time;
            this.hasPrevTime = true;
        }
        // Clamp delta to avoid huge physics/animation steps after a stall (M1).
        const delta = Math.min((time - this.prevTime) / 1000, 0.1);
        this.prevTime = time;
        const t = time * 0.001;

        // While paused, advance nothing: keep presenting the last frame only
        // (H3/M1/M2/M4). Render keeps the canvas alive behind the start/pause UI.
        if (this.pause.isPaused()) {
            this.render();
            return;
        }

        // 1. Update Core World
        updateCableTime(t);
        this.chunkManager.update(this.camera);
        // Pass camera world position to activate animation LOD (world agent API)
        // and the last-known flower intensity to drive INFO_OVERFLOW flicker rate
        // (read before the player update => one frame stale, fine for the slow
        // flicker cadence; avoids reordering the fixed update sequence).
        this.chunkManager.animate(t, delta, this.camera.position, this.player.getFlowerIntensity());

        // 2. Update Player FIRST so all consumers see this frame's position.
        const playerState = this.player.update(delta, t, {
            currentRoomType: this.roomFlow.getRoomType() ?? RoomType.IN_BETWEEN,
            // Gaze direction check (enhancement #13); eye pos is one frame
            // stale by design (the eye updates after the player below).
            eyePosition: this.skyEye.getPosition(),
        });
        const playerPos = this.player.getPosition();

        // Update player room from the freshly updated position (L-playerPos)
        // and advance the displayed shader blend (RoomTransition) with this
        // frame's flower intensity / player x for the reactive room targets.
        this.chunkManager.updatePlayerRoom(
            playerPos.x,
            playerPos.z,
            delta,
            playerState.flowerIntensity,
        );

        // 3. Room transitions + per-room mechanics (rift physics, info chirps)
        const currentRoomType = this.roomFlow.update(
            delta,
            playerState,
            playerPos,
            this.chunkManager,
            this.player,
            this.audio,
        );

        // 4. Cable Audio
        this.cableAudio.update(playerPos, this.chunkManager, this.audio);

        // 5. Update Stats & Environment (run stats + day/night sunset snapshot)
        this.statsSunset.update(delta, playerState, playerPos, currentRoomType);

        // Room-weighted weather selection (flow-audit medium #3).
        const weatherState = this.weather.update(delta, t, currentRoomType);
        this.audio.updateWeatherAudio(weatherState.weatherType, weatherState.weatherIntensity);

        // 6. Update Shaders & Visuals (mutate the reused params object in
        // place — no per-frame allocation).
        const sp = this.shaderParams;
        sp.t = t;
        sp.weather = weatherState;
        sp.shaderConfig = this.chunkManager.getCurrentShaderConfig();
        sp.flowerIntensity = playerState.flowerIntensity;
        sp.colorInversion = this.player.getColorInversionValue();
        sp.overrideProgress = playerState.overrideProgress;
        sp.rawBypass = this.player.getRawBypassValue();
        sp.overrideSustain = this.player.getOverrideSustain();
        sp.overrideResidue = this.player.getOverrideResidue();
        sp.gazeIntensity = playerState.gazeIntensity;
        sp.pitch = playerState.pitch;
        sp.gazeThresholdPulse = playerState.gazeThresholdPulse;
        sp.sunsetForeshadow = this.statsSunset.getSunsetForeshadow();
        // Stress->grain (F5): pressure coarsens the dither sampling grid.
        sp.ditherScale = this.stress.update(
            delta,
            playerState.gazeIntensity,
            this.player.getOverrideSustain(),
            playerState.flowerIntensity,
            currentRoomType,
            sp.sunsetForeshadow,
        );
        updateShaderUniforms(sp);

        // Audio tick
        this.audio.tick(delta);

        // Sky Eye (perceives the flower's brightness and the player's gaze —
        // flow-audit break #4 — and dominates POLARIZED's sky, enhancement #11)
        this.skyEye.update(
            delta,
            playerPos,
            this.audio,
            playerState.flowerIntensity,
            playerState.gazeIntensity,
            currentRoomType,
        );

        // Scanner Light
        updateScannerLight(this.scannerLight, t);

        // 7. HUD (override hint + throttled behavior tags)
        this.hudUpdater.update(
            delta,
            playerState,
            playerPos,
            currentRoomType,
            this.player,
            this.runStats,
        );

        // Loop Render
        this.render();
    }

    private render(): void {
        this.renderer.setRenderTarget(this.postProcessing.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postProcessing.composerScene, this.postProcessing.composerCamera);
    }

    /**
     * Cleanup all resources and stop the application
     */
    dispose(): void {
        // Stop animation loop
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Remove persistent window/document listeners (M14).
        this.pause.dispose();

        // Dispose subsystems
        this.player.dispose();
        this.chunkManager.dispose();
        this.cableAudio.dispose(this.audio);
        this.roomFlow.dispose();
        this.audio.dispose();
        this.skyEye.dispose();
        this.screenshotManager.dispose();
        this.statsSunset.dispose();

        // Dispose post-processing (render target + quad + blue-noise texture)
        disposePostProcessing(this.postProcessing);

        // Dispose renderer
        this.renderer.dispose();

        // Clear scene
        this.scene.clear();
    }
}

// Start application (M15: guard WebGL + container + boot errors).
function boot(): void {
    const container = document.getElementById('canvas-container');
    if (!container) {
        showFallback('无法启动：未找到画布容器。\nUnable to start: canvas container not found.');
        return;
    }
    if (!isWebGLAvailable()) {
        showFallback('你的浏览器或设备不支持 WebGL。\nYour browser or device does not support WebGL.');
        return;
    }
    try {
        window.app = new ChimeraVoid(container);
    }
    catch (e) {
        console.error('[ChimeraVoid] Failed to initialize', e);
        showFallback('启动失败，请刷新或更换浏览器。\nFailed to start. Try refreshing or another browser.');
    }
}

boot();
export { CHUNK_SIZE };
