// 1-bit Chimera Void - Main Entry Point
import * as THREE from 'three';
import { ChunkManager, CHUNK_SIZE } from './world/ChunkManager';
import { updateCableTime } from './world/CableSystem';
import { Controls } from './player/Controls';
import { HandsModel } from './player/HandsModel';
import { AudioSystem } from './audio/AudioSystem';
import { WeatherSystem } from './world/WeatherSystem';
import { DayNightCycle } from './world/DayNightCycle';
import { SkyEye } from './world/SkyEye';
import { GazeMechanic } from './player/GazeMechanic';
import { OverrideMechanic } from './player/OverrideMechanic';
import { setFlowerIntensity, getFlowerIntensity, forceFlowerIntensity, overrideFlowerIntensity } from './player/FlowerProp';
import { RunStatsCollector } from './stats/RunStatsCollector';
import { StateSnapshotGenerator } from './stats/StateSnapshotGenerator';
import { SnapshotOverlay } from './stats/SnapshotOverlay';
import { RoomType } from './world/RoomConfig';
import { createScene } from './core/SceneSetup';
import { createPostProcessing, updatePostProcessingSize, type PostProcessingComponents } from './core/PostProcessing';
import type { AppConfig, DayNightContext } from './types';

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
    private controls: Controls;
    private handsModel: HandsModel;
    private scannerLight: THREE.SpotLight;
    private skyEye: SkyEye;
    private audio: AudioSystem;
    private weather: WeatherSystem;
    private dayNight: DayNightCycle;
    private prevTime: number = performance.now();

    // New systems
    private gazeMechanic: GazeMechanic;
    private overrideMechanic: OverrideMechanic;
    private runStats: RunStatsCollector;
    private snapshotGenerator: StateSnapshotGenerator;
    private snapshotOverlay: SnapshotOverlay;
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

        // Sky Eye
        this.skyEye = new SkyEye(this.scene);

        // Controls and Hands
        this.controls = new Controls(this.camera, document.body);
        this.handsModel = new HandsModel(this.camera);

        // World
        this.chunkManager = new ChunkManager(this.scene);

        // Audio system (initialized on first click)
        this.audio = new AudioSystem();
        document.addEventListener('click', () => {
            if (!this.audio.enabled) {
                this.audio.init();
            }
        }, { once: true });

        // Weather and Day/Night systems
        this.weather = new WeatherSystem();
        this.dayNight = new DayNightCycle();

        // Initialize new systems
        this.gazeMechanic = new GazeMechanic(this.camera);
        this.overrideMechanic = new OverrideMechanic();
        this.runStats = new RunStatsCollector();
        this.snapshotGenerator = new StateSnapshotGenerator();
        this.snapshotOverlay = new SnapshotOverlay();

        // Setup gaze mechanic callbacks
        this.gazeMechanic.setOnGazeStart(() => {
            this.audio.playGazeStartPulse();
        });

        // Setup override mechanic callbacks
        this.overrideMechanic.setOnOverrideTrigger(() => {
            this.audio.playOverrideTear();
            // Force flower to max intensity
            const flower = this.handsModel.getFlower();
            if (flower) {
                overrideFlowerIntensity(flower);
            }
        });

        // Setup flower intensity control via scroll wheel
        this.controls.setOnFlowerIntensityChange((intensity) => {
            const flower = this.handsModel.getFlower();
            if (flower) {
                setFlowerIntensity(flower, intensity);
            }
        });

        // Events
        this.setupWindowEvents();

        // Start loop
        this.animate();
    }

    /**
     * Setup window resize handler
     */
    private setupWindowEvents(): void {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            updatePostProcessingSize(this.postProcessing, this.config.renderScale);
        });
    }

    /**
     * Main animation loop
     */
    private animate(): void {
        requestAnimationFrame(() => this.animate());

        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;
        this.prevTime = time;

        const t = time * 0.001;

        // Update cable shader
        updateCableTime(t);

        // Update world chunks
        this.chunkManager.update(this.camera);
        this.chunkManager.animate(t, delta);

        // Update player room based on position
        const pos = this.controls.getPosition();
        this.chunkManager.updatePlayerRoom(this.camera.position.x, this.camera.position.z);

        // Get current room type and shader config
        const currentRoomType = this.chunkManager.getCurrentRoomType();
        const shaderConfig = this.chunkManager.getCurrentShaderConfig();

        // Handle room transitions (audio)
        if (currentRoomType !== this.previousRoomType) {
            // Stop previous room's audio effects
            if (this.previousRoomType === RoomType.FORCED_ALIGNMENT) {
                this.audio.stopBinauralBeat();
            }
            // Start new room's audio effects
            if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
                const roomConfig = this.chunkManager.getCurrentRoomConfig();
                if (roomConfig.audio.beatFrequency) {
                    this.audio.startBinauralBeat(
                        roomConfig.audio.baseFrequency,
                        roomConfig.audio.beatFrequency
                    );
                }
            }
            this.previousRoomType = currentRoomType;
        }

        // Update binaural beat position (for FORCED_ALIGNMENT)
        if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
            this.audio.updateBinauralPosition(this.camera.position.x, 20);
        }

        // Update controls
        const isMoving = this.controls.update(time);

        // Footstep audio
        if (isMoving && this.controls.canJump) {
            this.audio.playFootstep();
        }

        // Update gaze mechanic
        const gazeState = this.gazeMechanic.update(delta);

        // Update audio gaze filter
        this.audio.updateGaze(gazeState.isGazing, gazeState.gazeIntensity);
        this.audio.tick(delta);

        // Get flower reference
        const flower = this.handsModel.getFlower();
        let flowerIntensity = 0.5;

        if (flower) {
            // Force flower intensity based on gaze
            const isGazing = gazeState.isGazing;
            forceFlowerIntensity(flower, isGazing, this.gazeMechanic.calculateForcedFlowerIntensity());

            // Get current intensity
            flowerIntensity = getFlowerIntensity(flower);
        }

        // Update override mechanic
        const overrideState = this.overrideMechanic.update(
            delta,
            this.controls.isOverrideKeyHeld(),
            gazeState.isGazing,
            currentRoomType,
            gazeState.isGazing && flowerIntensity < 0.3
        );

        // Update run stats
        this.runStats.update(
            delta,
            flowerIntensity,
            gazeState.isGazing,
            this.gazeMechanic.getPitch(),
            currentRoomType,
            this.camera.position.x,
            overrideState.isActive,
            overrideState.isTriggered
        );

        // Day/night cycle
        const dayNightContext: DayNightContext = {
            scene: this.scene,
            shaderQuad: this.postProcessing.shaderQuad,
            audio: this.audio,
            weather: this.weather,
            onSunset: () => {
                // Generate and display state snapshot on sunset
                const tags = this.runStats.generateTags();
                const snapshot = this.snapshotGenerator.generate(tags);
                this.snapshotOverlay.show(snapshot);
            },
        };
        this.dayNight.update(t, dayNightContext);

        // Weather system
        const weatherState = this.weather.update(delta, t);
        const uniforms = this.postProcessing.shaderQuad.material.uniforms;
        uniforms.weatherType.value = weatherState.weatherType;
        uniforms.weatherIntensity.value = weatherState.weatherIntensity;
        uniforms.weatherTime.value = weatherState.weatherTime;

        // Update room-specific shader uniforms
        uniforms.uNoiseDensity.value = shaderConfig.uNoiseDensity;
        uniforms.uThresholdBias.value = shaderConfig.uThresholdBias;
        uniforms.uTemporalJitter.value = shaderConfig.uTemporalJitter;
        uniforms.uContrast.value = shaderConfig.uContrast;
        uniforms.uGlitchAmount.value = shaderConfig.uGlitchAmount;
        uniforms.uGlitchSpeed.value = shaderConfig.uGlitchSpeed;
        uniforms.uTime.value = t;
        uniforms.uFlowerIntensity.value = flowerIntensity;

        // Override color inversion effect
        uniforms.uColorInversion.value = this.overrideMechanic.getColorInversionValue();

        // Override hold progress (for visual feedback while holding)
        uniforms.uOverrideProgress.value = this.overrideMechanic.getHoldProgress();

        // Update hands
        this.handsModel.animate(delta, isMoving, time);

        // Update sky eye
        if (this.skyEye) {
            this.skyEye.update(delta, this.camera.position, this.audio);
        }

        // Update scanner light
        if (this.scannerLight) {
            const scanSpeed = 0.0005;
            const scanRadius = 100;
            this.scannerLight.target.position.set(
                Math.sin(time * scanSpeed) * scanRadius,
                0,
                Math.cos(time * scanSpeed) * scanRadius
            );
            this.scannerLight.target.updateMatrixWorld();
        }

        // Update coordinates display with room type and debug info
        const coordsEl = document.getElementById('coords');
        if (coordsEl) {
            const pitchDeg = Math.round(this.gazeMechanic.getPitch() * 180 / Math.PI);
            const shiftKey = this.controls.isOverrideKeyHeld() ? '⬆️SHIFT' : '';
            const gazing = gazeState.isGazing ? '👁️GAZE' : '';
            const progress = overrideState.isActive ? `[${Math.round(this.overrideMechanic.getHoldProgress() * 100)}%]` : '';
            const tags = this.runStats.generateTags().join(', ');
            coordsEl.innerText = `POS: ${pos.x}, ${pos.z} | ${currentRoomType} | ↑${pitchDeg}° ${shiftKey} ${gazing} ${progress}\n${tags}`;
        }

        // Render
        this.renderer.setRenderTarget(this.postProcessing.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postProcessing.composerScene, this.postProcessing.composerCamera);
    }
}

// Start application
window.app = new ChimeraVoid();

// Export CHUNK_SIZE for potential external use
export { CHUNK_SIZE };
