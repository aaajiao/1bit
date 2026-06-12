// 1-bit Chimera Void - Main Entry Point
import type * as THREE from 'three';
import type { PostProcessingComponents } from './core/PostProcessing';
import type { AppConfig } from './types';
import { AudioController } from './audio/AudioController';
import { PERFORMANCE, SPAWN } from './config';
import { bootWithGuards } from './core/BootGuard';
import { CableAudioUpdater } from './core/CableAudioUpdater';
import { FrameClock } from './core/FrameClock';
import { HudUpdater } from './core/HudUpdater';
import { PauseController } from './core/PauseController';
import { createPostProcessing, disposePostProcessing, renderComposed, resizeRendering } from './core/PostProcessing';
import { RoomFlowUpdater } from './core/RoomFlowUpdater';
import { createScene, updateScannerLight } from './core/SceneSetup';
import { ShaderSyncUpdater } from './core/ShaderSyncUpdater';
import { StatsSunsetUpdater } from './core/StatsSunsetUpdater';
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
 * Main application class: owns every system, instantiates them in the
 * constructor, and threads the shared per-frame state through each update()
 * in a fixed order inside animate() (player first so every consumer sees
 * this frame's position). Pure wiring — business logic lives in the domain
 * systems and the core/ per-frame helpers.
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
    private shaderSync: ShaderSyncUpdater;

    // Clamped frame delta + elapsed seconds, reseeded on resume (M1).
    private clock = new FrameClock();

    // Pause state machine + persistent window/document listeners: while
    // paused (no pointer lock / start screen / tab hidden) the entire UPDATE
    // phase is gated; only the render keeps presenting (H3/M1/M2/M4/H5).
    private pause: PauseController;

    // Animation loop control
    private isRunning: boolean = true;
    private animationFrameId: number = 0;

    private config: AppConfig = {
        renderScale: PERFORMANCE.DEFAULT_RENDER_SCALE,
        fogNear: PERFORMANCE.FOG_NEAR,
        fogFar: PERFORMANCE.FOG_FAR,
    };

    constructor(container: HTMLElement) {
        // Scene, camera, renderer, lighting, post-processing, audio.
        const sceneComponents = createScene(container, this.config);
        this.scene = sceneComponents.scene;
        this.camera = sceneComponents.camera;
        this.renderer = sceneComponents.renderer;
        this.scannerLight = sceneComponents.scannerLight;
        this.postProcessing = createPostProcessing(this.config.renderScale);
        this.audio = new AudioController();

        // Player Manager (renderer canvas for pointer lock), spawned in the
        // nearest quiet room (flow-audit medium #7): the origin chunk is
        // always INFO_OVERFLOW, so the helper scans outward for quiet.
        this.player = new PlayerManager(this.camera, this.renderer.domElement, this.audio);
        const spawn = findQuietSpawnPosition();
        this.player.setSpawnPosition(spawn.x, SPAWN.SPAWN_HEIGHT, spawn.z);

        // Cross-run scar record (F2): ONE localStorage read at boot, cached
        // in memory — the eye's familiarity and the world's scars read from it.
        this.scars = new ScarStore();

        // World & environment, seeded from the actual spawn so the first
        // frame doesn't blend in from the wrong room's palette.
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

        // Per-frame wiring helpers (core/) — each helper's own doc comment
        // explains the systems it drives.
        this.cableAudio = new CableAudioUpdater();
        // Room flow eases scene.fog toward the room horizon, feeds the live
        // profile into the room ledger (F1), and drives + disposes the F3
        // figures and the F4 ghost (loaded at boot, before any save).
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
        this.shaderSync = new ShaderSyncUpdater(
            this.postProcessing.shaderQuad,
            this.chunkManager,
            this.player,
        );

        // Window/document events + initial pause sync (H3/M1/M2/M4/H5/M14).
        this.pause = new PauseController({
            audio: this.audio,
            isPointerLocked: () => this.player.controls.isPointerLocked(),
            onResize: () =>
                resizeRendering(this.camera, this.renderer, this.postProcessing, this.config.renderScale),
            onTimingReset: () => this.clock.reset(),
            onDispose: () => this.dispose(),
        });

        // Touch pause button -> pause state machine (touch fallback mode has
        // no pointerlockchange event for PauseController to observe).
        this.player.controls.setOnPauseRequest(() => this.pause.syncPauseState());

        // Start loop
        this.animate();
    }

    private animate(): void {
        if (!this.isRunning)
            return;
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        this.clock.tick();
        const { delta, t } = this.clock;

        // While paused, advance nothing: keep presenting the last frame only
        // (H3/M1/M2/M4) behind the start/pause UI.
        if (this.pause.isPaused()) {
            this.render();
            return;
        }

        // 1. Update core world. Flower intensity (INFO_OVERFLOW flicker) is
        // read pre-player-update — one frame stale by design, keeping the
        // fixed update sequence.
        updateCableTime(t);
        this.chunkManager.update(this.camera);
        this.chunkManager.animate(t, delta, this.camera.position, this.player.getFlowerIntensity());

        // 2. Update player FIRST so all consumers see this frame's position.
        const playerState = this.player.update(delta, t, {
            currentRoomType: this.roomFlow.getRoomType() ?? RoomType.IN_BETWEEN,
            // Eye pos is one frame stale by design (the eye updates below).
            eyePosition: this.skyEye.getPosition(),
        });
        const playerPos = this.player.getPosition();

        // Player room + displayed shader blend from the fresh position.
        this.chunkManager.updatePlayerRoom(playerPos.x, playerPos.z, delta, playerState.flowerIntensity);

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

        // 5. Stats & environment (run stats + day/night sunset snapshot),
        // then room-weighted weather selection (flow-audit medium #3).
        this.statsSunset.update(delta, playerState, playerPos, currentRoomType);
        const weatherState = this.weather.update(delta, t, currentRoomType);
        this.audio.updateWeatherAudio(weatherState.weatherType, weatherState.weatherIntensity, weatherState.weatherOnset);
        this.roomFlow.setWeather(weatherState.weatherType, weatherState.weatherIntensity);

        // 6. Shaders & visuals: core/ShaderSyncUpdater mutates ONE reused
        // params object (no per-frame allocation) and owns stress->grain (F5).
        this.shaderSync.update(
            delta,
            t,
            weatherState,
            playerState,
            currentRoomType,
            this.statsSunset.getSunsetForeshadow(),
        );

        this.audio.tick(delta);

        // Sky Eye (perceives the flower, the gaze — flow-audit break #4 —
        // the storm overhead, and dominates POLARIZED's sky, enhancement #11)
        this.skyEye.update(
            delta,
            playerPos,
            this.audio,
            playerState.flowerIntensity,
            playerState.gazeIntensity,
            currentRoomType,
            weatherState.weatherIntensity,
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
        renderComposed(this.renderer, this.scene, this.camera, this.postProcessing);
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

        // Post-processing (target + quad + blue-noise), renderer, scene.
        disposePostProcessing(this.postProcessing);
        this.renderer.dispose();
        this.scene.clear();
    }
}

// Start application (M15: guard WebGL + container + boot errors).
bootWithGuards((container) => {
    window.app = new ChimeraVoid(container);
});

export { CHUNK_SIZE };
