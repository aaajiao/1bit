// 1-bit Chimera Void - Main Entry Point
import * as THREE from 'three';
import { DitherShader } from './shaders/DitherShader';
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
import { RoomType } from './world/RoomConfig';
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
    private composerScene: THREE.Scene;
    private composerCamera: THREE.OrthographicCamera;
    private renderTarget: THREE.WebGLRenderTarget;
    private chunkManager: ChunkManager;
    private controls: Controls;
    private handsModel: HandsModel;
    private scannerLight: THREE.SpotLight;
    private skyEye: SkyEye;
    private audio: AudioSystem;
    private weather: WeatherSystem;
    private dayNight: DayNightCycle;
    private prevTime: number = performance.now();
    private shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

    // New systems
    private gazeMechanic: GazeMechanic;
    private overrideMechanic: OverrideMechanic;
    private runStats: RunStatsCollector;
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

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x888888);
        this.scene.fog = new THREE.Fog(0x888888, this.config.fogNear, this.config.fogFar);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            80,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.rotation.order = 'YXZ';

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        container.appendChild(this.renderer.domElement);

        // Disable new color management to match r128 behavior
        THREE.ColorManagement.enabled = false;
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        // Render target for post-processing
        const scale = this.config.renderScale;
        this.renderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth * scale,
            window.innerHeight * scale,
            {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
            }
        );

        // Post-processing quad
        this.composerScene = new THREE.Scene();
        this.composerCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.shaderQuad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.ShaderMaterial({
                uniforms: {
                    tDiffuse: { value: this.renderTarget.texture },
                    resolution: {
                        value: new THREE.Vector2(
                            window.innerWidth * scale,
                            window.innerHeight * scale
                        ),
                    },
                    enableOutline: { value: true },
                    outlineStrength: { value: 0.3 },
                    enableDepthDither: { value: false },
                    ditherTransition: { value: 0.7 },
                    invertColors: { value: false },
                    // Weather
                    weatherType: { value: 0 },
                    weatherIntensity: { value: 0.0 },
                    weatherTime: { value: 0.0 },
                    // Room-specific uniforms
                    uNoiseDensity: { value: 0.5 },
                    uThresholdBias: { value: 0.0 },
                    uTemporalJitter: { value: 0.0 },
                    uContrast: { value: 1.0 },
                    uGlitchAmount: { value: 0.0 },
                    uGlitchSpeed: { value: 0.0 },
                    uColorInversion: { value: 0.0 },
                    uOverrideProgress: { value: 0.0 },
                    uTime: { value: 0.0 },
                    uFlowerIntensity: { value: 0.5 },
                },
                vertexShader: DitherShader.vertexShader,
                fragmentShader: DitherShader.fragmentShader,
            })
        );
        this.composerScene.add(this.shaderQuad);

        // Lighting (intensity increased to compensate for r155+ decay changes)
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111111, 1.2);
        this.scene.add(hemiLight);

        this.scannerLight = new THREE.SpotLight(0xffffff, 4.0);
        this.scannerLight.position.set(0, 80, 0);
        this.scannerLight.angle = Math.PI / 4;
        this.scannerLight.penumbra = 0.5;
        this.scannerLight.decay = 1; // Reduced from 2 to compensate
        this.scannerLight.distance = 250;
        this.scannerLight.castShadow = true;
        this.camera.add(this.scannerLight);

        // Sky Eye
        this.skyEye = new SkyEye(this.scene);

        // Controls and Hands
        this.controls = new Controls(this.camera, document.body);
        this.handsModel = new HandsModel(this.camera);

        // World
        this.chunkManager = new ChunkManager(this.scene);

        // Add camera to scene
        this.scene.add(this.camera);

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

            const s = this.config.renderScale;
            this.renderTarget.setSize(
                window.innerWidth * s,
                window.innerHeight * s
            );
            (this.shaderQuad.material.uniforms.resolution.value as THREE.Vector2).set(
                window.innerWidth * s,
                window.innerHeight * s
            );
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
            shaderQuad: this.shaderQuad,
            audio: this.audio,
            weather: this.weather,
        };
        this.dayNight.update(t, dayNightContext);

        // Weather system
        const weatherState = this.weather.update(delta, t);
        this.shaderQuad.material.uniforms.weatherType.value = weatherState.weatherType;
        this.shaderQuad.material.uniforms.weatherIntensity.value = weatherState.weatherIntensity;
        this.shaderQuad.material.uniforms.weatherTime.value = weatherState.weatherTime;

        // Update room-specific shader uniforms
        this.shaderQuad.material.uniforms.uNoiseDensity.value = shaderConfig.uNoiseDensity;
        this.shaderQuad.material.uniforms.uThresholdBias.value = shaderConfig.uThresholdBias;
        this.shaderQuad.material.uniforms.uTemporalJitter.value = shaderConfig.uTemporalJitter;
        this.shaderQuad.material.uniforms.uContrast.value = shaderConfig.uContrast;
        this.shaderQuad.material.uniforms.uGlitchAmount.value = shaderConfig.uGlitchAmount;
        this.shaderQuad.material.uniforms.uGlitchSpeed.value = shaderConfig.uGlitchSpeed;
        this.shaderQuad.material.uniforms.uTime.value = t;
        this.shaderQuad.material.uniforms.uFlowerIntensity.value = flowerIntensity;

        // Override color inversion effect
        this.shaderQuad.material.uniforms.uColorInversion.value =
            this.overrideMechanic.getColorInversionValue();

        // Override hold progress (for visual feedback while holding)
        this.shaderQuad.material.uniforms.uOverrideProgress.value =
            this.overrideMechanic.getHoldProgress();

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
            coordsEl.innerText = `POS: ${pos.x}, ${pos.z} | ${currentRoomType} | ↑${pitchDeg}° ${shiftKey} ${gazing} ${progress}`;
        }

        // Render
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.composerScene, this.composerCamera);
    }
}

// Start application
window.app = new ChimeraVoid();

// Export CHUNK_SIZE for potential external use
export { CHUNK_SIZE };
