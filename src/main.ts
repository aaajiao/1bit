// 1-bit Chimera Void - Main Entry Point
import * as THREE from 'three';
import { ChunkManager, CHUNK_SIZE } from './world/ChunkManager';
import { updateCableTime } from './world/CableSystem';
import { AudioController } from './audio/AudioController';
import { WeatherSystem } from './world/WeatherSystem';
import { DayNightCycle } from './world/DayNightCycle';
import { SkyEye } from './world/SkyEye';
import { RunStatsCollector } from './stats/RunStatsCollector';
import { StateSnapshotGenerator } from './stats/StateSnapshotGenerator';
import { SnapshotOverlay } from './stats/SnapshotOverlay';
import { RoomType } from './world/RoomConfig';
import { createScene } from './core/SceneSetup';
import { createPostProcessing, updatePostProcessingSize, type PostProcessingComponents } from './core/PostProcessing';
import { HUD } from './ui/HUD';
import { ScreenshotManager } from './utils/ScreenshotManager';
import type { AppConfig } from './types';

// New Managers
import { PlayerManager } from './player/PlayerManager';
import { RiftMechanic } from './world/RiftMechanic';

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

    private config: AppConfig = {
        renderScale: 0.5,
        fogNear: 20,
        fogFar: 110,
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
            if (!this.audio.enabled) this.audio.init();
        }, { once: true });

        // Player Manager
        this.player = new PlayerManager(this.camera, document.body, this.audio);
        this.player.setSpawnPosition(8, 2, 8); // Safe spawn

        // Mechanics
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
        requestAnimationFrame(() => this.animate());

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
        } else if (currentRoomType === RoomType.INFO_OVERFLOW && Math.random() < 0.02) {
            this.audio.playInfoChirp();
        }

        // Cable Audio (Simplified for main.ts)
        this.updateCableAudio(playerPos);

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
            playerState.overrideTriggered
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
        this.updateUniforms(
            t,
            weatherState,
            shaderConfig,
            playerState.flowerIntensity,
            playerState.overrideProgress
        );

        // Audio tick
        this.audio.tick(delta);

        // Sky Eye
        if (this.skyEye) this.skyEye.update(delta, playerPos, this.audio);

        // Scanner Light
        if (this.scannerLight) {
            this.scannerLight.target.position.set(
                Math.sin(t * 0.5) * 100, 0, Math.cos(t * 0.5) * 100
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
            tags: this.runStats.generateTags()
        });

        // Loop Render
        this.render();
    }

    private updateCableAudio(playerPos: THREE.Vector3): void {
        const cableDist = this.chunkManager.getDistanceToNearestCable(playerPos);
        if (cableDist < 8.0) {
            this.audio.startCableHum();
        } else if (cableDist > 12.0) {
            this.audio.stopCableHum();
        }

        if (cableDist < 12.0) {
            const humIntensity = Math.max(0, 1 - Math.max(0, cableDist - 1) / 11.0);
            this.audio.updateCableHum(humIntensity);
            if (cableDist < 2.5 && Math.random() < 0.01) this.audio.playCablePulse();
        }
    }

    private updateUniforms(t: number, weather: any, shaderConfig: any, flowerIntensity: number, overrideProgress: number): void {
        const u = this.postProcessing.shaderQuad.material.uniforms;

        // Weather
        u.weatherType.value = weather.weatherType;
        u.weatherIntensity.value = weather.weatherIntensity;
        u.weatherTime.value = weather.weatherTime;

        // Room
        u.uNoiseDensity.value = shaderConfig.uNoiseDensity;
        u.uThresholdBias.value = shaderConfig.uThresholdBias;
        u.uTemporalJitter.value = shaderConfig.uTemporalJitter;
        u.uContrast.value = shaderConfig.uContrast;
        u.uGlitchAmount.value = shaderConfig.uGlitchAmount;
        u.uGlitchSpeed.value = shaderConfig.uGlitchSpeed;

        // Globals & Player
        u.uTime.value = t;
        u.uFlowerIntensity.value = flowerIntensity;
        u.uColorInversion.value = this.player.getColorInversionValue();
        u.uOverrideProgress.value = overrideProgress;
    }

    private render(): void {
        this.renderer.setRenderTarget(this.postProcessing.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postProcessing.composerScene, this.postProcessing.composerCamera);
    }
}

// Start application
window.app = new ChimeraVoid();
export { CHUNK_SIZE };
