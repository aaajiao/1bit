// 1-bit Chimera Void - Main Entry Point
import type * as THREE from 'three';
import type { PostProcessingComponents } from './core/PostProcessing';
import type { AppConfig } from './types';
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
    private prevTime: number = performance.now();

    // Systems
    private player: PlayerManager;
    private riftMechanic: RiftMechanic;
    private runStats: RunStatsCollector;
    private snapshotGenerator: StateSnapshotGenerator;
    private snapshotOverlay: SnapshotOverlay;
    private hud: HUD;
    private previousRoomType: RoomType | null = null;
    private cableAudio: CableAudioUpdater;

    // Animation loop control
    private isRunning: boolean = true;
    private animationFrameId: number = 0;

    private config: AppConfig = {
        renderScale: PERFORMANCE.DEFAULT_RENDER_SCALE,
        fogNear: PERFORMANCE.FOG_NEAR,
        fogFar: PERFORMANCE.FOG_FAR,
    };

    constructor() {
        const container = document.getElementById('canvas-container');
        if (!container) {
            throw new Error('Canvas container not found');
        }

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
        document.addEventListener('click', () => {
            if (!this.audio.enabled)
                this.audio.init();
        }, { once: true });

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
        new ScreenshotManager(this.renderer);

        // Events
        this.setupWindowEvents();

        // Start loop
        this.animate();
    }

    private setupWindowEvents(): void {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            updatePostProcessingSize(this.postProcessing, this.config.renderScale);
        });
    }

    private animate(): void {
        if (!this.isRunning)
            return;
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        this.prevTime = time;
        const t = time * 0.001;

        // 1. Update Core World
        updateCableTime(t);
        this.chunkManager.update(this.camera);
        this.chunkManager.animate(t, delta);

        // Update player room
        const playerPos = this.player.getPosition();
        this.chunkManager.updatePlayerRoom(playerPos.x, playerPos.z);

        const currentRoomType = this.chunkManager.getCurrentRoomType();
        const shaderConfig = this.chunkManager.getCurrentShaderConfig();

        // 2. Handle Room Transitions
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

        // 3. Update Mechanics
        if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
            this.riftMechanic.update(this.player, this.audio, playerPos);
        }
        else if (currentRoomType === RoomType.INFO_OVERFLOW && Math.random() < GAMEPLAY.INFO_CHIRP_PROBABILITY) {
            this.audio.playInfoChirp();
        }

        // Cable Audio
        this.cableAudio.update(playerPos, this.chunkManager, this.audio);

        // 4. Update Player
        const playerState = this.player.update(delta, t, { currentRoomType });

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
                const tags = this.runStats.generateTags();
                this.snapshotOverlay.show(this.snapshotGenerator.generate(tags));
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
            tags: this.runStats.generateTags(),
        });

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

        // Dispose subsystems
        this.player.dispose();
        this.chunkManager.dispose();
        this.audio.dispose();
        this.skyEye.dispose();

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

// Start application
window.app = new ChimeraVoid();
export { CHUNK_SIZE };
