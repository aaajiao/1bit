// 1-bit Chimera Void - Main Entry Point
import type * as THREE from 'three';
import type { PostProcessingComponents } from './core/PostProcessing';
import type { BehaviorTag } from './stats/RunStatsCollector';
import type { AppConfig } from './types';
import type { OverrideHintDisplay } from './types/player';
import { AudioController } from './audio/AudioController';
import { GAMEPLAY, PERFORMANCE } from './config';
import { CableAudioUpdater } from './core/CableAudioUpdater';
import { createPostProcessing, updatePostProcessingSize } from './core/PostProcessing';
import { createScene } from './core/SceneSetup';
import { updateShaderUniforms } from './core/ShaderUniformUpdater';
// New Managers
import { PlayerManager } from './player/PlayerManager';
import { RunStatsCollector } from './stats/RunStatsCollector';
import { SnapshotOverlay } from './stats/SnapshotOverlay';
import { StateSnapshotGenerator } from './stats/StateSnapshotGenerator';
import { HUD } from './ui/HUD';
import { disposeRenderTarget } from './utils/dispose';
import { ScreenshotManager } from './utils/ScreenshotManager';
import { updateCableTime } from './world/CableSystem';
import { CHUNK_SIZE, ChunkManager } from './world/ChunkManager';
import { DayNightCycle } from './world/DayNightCycle';
import { RiftMechanic } from './world/RiftMechanic';
import { RoomType } from './world/RoomConfig';

import { SkyEye } from './world/SkyEye';
import { WeatherSystem } from './world/WeatherSystem';

// Extend Window interface for app reference
declare global {
    interface Window {
        app: ChimeraVoid;
    }
}

// Throttle interval (seconds) for the debug-HUD behavior-tag regeneration (M13).
const TAG_REFRESH_INTERVAL = 1.0;

// Resolved [SHIFT]-resistance hint text shown on the HUD when conditions are met.
const OVERRIDE_HINT_TEXT = '[SHIFT] 也许可以反抗';

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
    private dayNight: DayNightCycle;
    private prevTime: number = 0;
    private hasPrevTime: boolean = false;

    // Systems
    private player: PlayerManager;
    private riftMechanic: RiftMechanic;
    private runStats: RunStatsCollector;
    private snapshotGenerator: StateSnapshotGenerator;
    private snapshotOverlay: SnapshotOverlay;
    private hud: HUD;
    private screenshotManager: ScreenshotManager;
    private previousRoomType: RoomType | null = null;
    private cableAudio: CableAudioUpdater;

    // Animation loop control
    private isRunning: boolean = true;
    private animationFrameId: number = 0;

    // Pause state machine: while paused (no pointer lock / start screen shown /
    // tab hidden) the entire UPDATE phase is gated so nothing advances; only the
    // render keeps presenting the last frame (H3/M1/M2/M4/H5).
    private paused: boolean = true;

    // Throttled debug-HUD tags cache (M13).
    private cachedTags: BehaviorTag[] = [];
    private tagRefreshTimer: number = 0;

    // Bound persistent handlers so they can be removed in dispose() (M14).
    private boundResize: () => void;
    private boundPointerLockChange: () => void;
    private boundVisibilityChange: () => void;
    private boundResumeAudio: () => void;
    private boundBeforeUnload: () => void;

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
        this.player.setSpawnPosition(8, 2, 8); // Safe spawn

        // Mechanics
        this.cableAudio = new CableAudioUpdater();
        this.riftMechanic = new RiftMechanic();
        this.skyEye = new SkyEye(this.scene);
        this.chunkManager = new ChunkManager(this.scene);

        // Environment Systems
        this.weather = new WeatherSystem();
        this.dayNight = new DayNightCycle();

        // UI & Stats
        this.runStats = new RunStatsCollector();
        this.snapshotGenerator = new StateSnapshotGenerator();
        this.snapshotOverlay = new SnapshotOverlay();
        this.hud = new HUD();
        this.screenshotManager = new ScreenshotManager(this.renderer);

        // Bind persistent handlers
        this.boundResize = () => this.onResize();
        this.boundPointerLockChange = () => this.onPauseStateChange();
        this.boundVisibilityChange = () => this.onVisibilityChange();
        this.boundResumeAudio = () => this.onUserGesture();
        this.boundBeforeUnload = () => this.dispose();

        // Events
        this.setupWindowEvents();

        // Sync the initial pause state from the current pointer-lock status.
        this.onPauseStateChange();

        // Start loop
        this.animate();
    }

    private setupWindowEvents(): void {
        window.addEventListener('resize', this.boundResize);

        // Pause when pointer lock is lost (ESC / start screen) and resume when
        // it is (re)acquired (H3/M4).
        document.addEventListener('pointerlockchange', this.boundPointerLockChange);

        // Reset timing and recover audio across tab visibility changes (M1/H5).
        document.addEventListener('visibilitychange', this.boundVisibilityChange);

        // Persistent (NOT once) gesture listeners: init audio on first gesture and
        // resume a suspended context on any subsequent gesture so audio recovers
        // after tab blur (H5).
        document.addEventListener('click', this.boundResumeAudio);
        document.addEventListener('keydown', this.boundResumeAudio);

        // Ensure resources are released on navigation away (L-dispose).
        window.addEventListener('beforeunload', this.boundBeforeUnload);

        // Vite HMR: dispose the previous instance before a hot update.
        // `import.meta.hot` is a Vite extension; access it through a narrow local
        // type so this compiles without the ambient `vite/client` types.
        const meta = import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } };
        if (meta.hot) {
            meta.hot.dispose(() => this.dispose());
        }
    }

    private onResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        updatePostProcessingSize(this.postProcessing, this.config.renderScale);
    }

    /**
     * First-gesture audio init + recover a suspended context on later gestures (H5).
     */
    private onUserGesture(): void {
        if (!this.audio.enabled) {
            this.audio.init();
        }
        else {
            this.audio.resume();
        }
        // Re-sync the pause state from the current lock status. On desktop the
        // pointerlockchange event also covers this; on touch/trackpad fallback
        // (no pointerlockchange) this is the only signal that play has started.
        this.onPauseStateChange();
    }

    /**
     * Toggle the pause state from the current pointer-lock status (H3/M4).
     */
    private onPauseStateChange(): void {
        const locked = this.player.controls.isPointerLocked();
        this.setPaused(!locked);
    }

    private onVisibilityChange(): void {
        if (document.hidden) {
            this.setPaused(true);
        }
        else {
            // Reset timing so the first frame after returning isn't inflated (M1).
            this.hasPrevTime = false;
            // Resume audio if the context was suspended while hidden (H5).
            this.audio.resume();
        }
    }

    /**
     * Enter/leave the paused state. On pause we suspend audio; on resume we
     * resume it and reset frame timing so delta isn't inflated (M1/H5).
     */
    private setPaused(paused: boolean): void {
        if (paused === this.paused)
            return;
        this.paused = paused;
        if (paused) {
            this.audio.suspend();
        }
        else {
            this.hasPrevTime = false;
            this.audio.resume();
        }
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
        if (this.paused) {
            this.render();
            return;
        }

        // 1. Update Core World
        updateCableTime(t);
        this.chunkManager.update(this.camera);
        // Pass camera world position to activate animation LOD (world agent API).
        this.chunkManager.animate(t, delta, this.camera.position);

        // 2. Update Player FIRST so all consumers see this frame's position.
        const playerState = this.player.update(delta, t, {
            currentRoomType: this.previousRoomType ?? RoomType.IN_BETWEEN,
        });
        const playerPos = this.player.getPosition();

        // Update player room from the freshly updated position (L-playerPos).
        this.chunkManager.updatePlayerRoom(playerPos.x, playerPos.z);

        const currentRoomType = this.chunkManager.getCurrentRoomType();
        const shaderConfig = this.chunkManager.getCurrentShaderConfig();

        // 3. Handle Room Transitions
        if (currentRoomType !== this.previousRoomType) {
            console.log(`[Room Transition] ${this.previousRoomType} -> ${currentRoomType}`);
            const roomConfig = this.chunkManager.getCurrentRoomConfig();
            this.audio.onRoomChange(this.previousRoomType, currentRoomType, roomConfig.audio);

            // Cleanup previous room effects if needed
            if (this.previousRoomType === RoomType.FORCED_ALIGNMENT) {
                this.riftMechanic.onExit(this.player, this.audio);
            }

            this.previousRoomType = currentRoomType;
        }

        // 4. Update Mechanics
        if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
            this.riftMechanic.update(this.player, this.audio, playerPos);
        }
        else if (currentRoomType === RoomType.INFO_OVERFLOW && Math.random() < GAMEPLAY.INFO_CHIRP_PROBABILITY) {
            this.audio.playInfoChirp();
        }

        // Cable Audio
        this.cableAudio.update(playerPos, this.chunkManager, this.audio);

        // 5. Update Stats & Environment
        this.runStats.update(
            delta,
            playerState.flowerIntensity,
            playerState.isGazing,
            playerState.pitch,
            currentRoomType,
            playerPos.x,
            playerState.overrideActive,
            playerState.overrideTriggered,
        );

        this.dayNight.update(t, {
            scene: this.scene,
            shaderQuad: this.postProcessing.shaderQuad,
            audio: this.audio,
            weather: this.weather,
            onSunset: () => {
                // Personalize the snapshot from this run's normalized metrics
                // (snapshot personalization wiring).
                const metrics = this.runStats.normalize();
                const tags = this.runStats.generateTags();
                this.snapshotOverlay.show(this.snapshotGenerator.generateFromMetrics(metrics, tags));
                // Reset for the next run AFTER the overlay snapshot is captured (M11).
                this.runStats.reset();
            },
        });

        const weatherState = this.weather.update(delta, t);
        this.audio.updateWeatherAudio(weatherState.weatherType, weatherState.weatherIntensity);

        // 6. Update Shaders & Visuals
        updateShaderUniforms(
            this.postProcessing.shaderQuad,
            t,
            weatherState,
            shaderConfig,
            playerState.flowerIntensity,
            this.player.getColorInversionValue(),
            playerState.overrideProgress,
        );

        // Audio tick
        this.audio.tick(delta);

        // Sky Eye
        if (this.skyEye)
            this.skyEye.update(delta, playerPos, this.audio);

        // Scanner Light
        if (this.scannerLight) {
            this.scannerLight.target.position.set(
                Math.sin(t * 0.5) * 100,
                0,
                Math.cos(t * 0.5) * 100,
            );
            this.scannerLight.target.updateMatrixWorld();
        }

        // Override hint (HUD wiring): show the [SHIFT]-resistance hint once.
        const hint = this.resolveOverrideHint();

        // Throttle behavior-tag regeneration for the debug HUD to ~1Hz (M13).
        this.tagRefreshTimer += delta;
        if (this.tagRefreshTimer >= TAG_REFRESH_INTERVAL) {
            this.tagRefreshTimer = 0;
            this.cachedTags = this.runStats.generateTags();
        }

        // HUD
        this.hud.update({
            posX: playerPos.x,
            posZ: playerPos.z,
            roomType: currentRoomType,
            pitch: playerState.pitch,
            isShiftHeld: playerState.isShiftHeld,
            isGazing: playerState.isGazing,
            overrideActive: playerState.overrideActive,
            overrideProgress: playerState.overrideProgress,
            tags: this.cachedTags,
            hint,
        });

        // Loop Render
        this.render();
    }

    /**
     * Read the override hint state and mark it shown once displayed.
     */
    private resolveOverrideHint(): OverrideHintDisplay {
        const hintState = this.player.getOverrideHintState();
        if (hintState.shouldShow) {
            this.player.markOverrideHintShown();
            return { text: OVERRIDE_HINT_TEXT, visible: true };
        }
        return { text: OVERRIDE_HINT_TEXT, visible: false };
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
        window.removeEventListener('resize', this.boundResize);
        document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
        document.removeEventListener('visibilitychange', this.boundVisibilityChange);
        document.removeEventListener('click', this.boundResumeAudio);
        document.removeEventListener('keydown', this.boundResumeAudio);
        window.removeEventListener('beforeunload', this.boundBeforeUnload);

        // Dispose subsystems
        this.player.dispose();
        this.chunkManager.dispose();
        this.cableAudio.dispose(this.audio);
        this.riftMechanic.dispose();
        this.audio.dispose();
        this.skyEye.dispose();
        this.screenshotManager.dispose();
        this.snapshotOverlay.dispose();

        // Dispose post-processing
        disposeRenderTarget(this.postProcessing.renderTarget);
        this.postProcessing.shaderQuad.geometry.dispose();
        (this.postProcessing.shaderQuad.material as THREE.ShaderMaterial).dispose();

        // Dispose renderer
        this.renderer.dispose();

        // Clear scene
        this.scene.clear();
    }
}

/**
 * Detect minimal WebGL availability before booting the experience (M15).
 */
function isWebGLAvailable(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext
            && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    }
    catch {
        return false;
    }
}

/**
 * Render a plain DOM fallback message instead of a blank page + console error (M15).
 */
function showFallback(message: string): void {
    const fallback = document.createElement('div');
    fallback.id = 'boot-fallback';
    fallback.style.cssText
        = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
            + 'padding:24px;color:#fff;background:#000;font-family:"Courier New",monospace;'
            + 'text-align:center;line-height:1.6;z-index:1000;';
    fallback.innerText = message;
    document.body.appendChild(fallback);
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
