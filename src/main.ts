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

        // Update controls
        const isMoving = this.controls.update(time);

        // Footstep audio
        if (isMoving && this.controls.canJump) {
            this.audio.playFootstep();
        }

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

        // Update coordinates display
        const pos = this.controls.getPosition();
        const coordsEl = document.getElementById('coords');
        if (coordsEl) {
            coordsEl.innerText = `POS: ${pos.x}, ${pos.z}`;
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
