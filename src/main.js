// 1-bit Chimera Void - Main Entry Point
import * as THREE from 'three';
import { DitherShader } from './shaders/DitherShader.js';
import { ChunkManager, CHUNK_SIZE } from './world/ChunkManager.js';
import { updateCableTime } from './world/CableSystem.js';
import { Controls } from './player/Controls.js';
import { HandsModel } from './player/HandsModel.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { WeatherSystem } from './world/WeatherSystem.js';

/**
 * Main application class
 */
class ChimeraVoid {
    constructor() {
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.composerScene = null;
        this.composerCamera = null;
        this.renderTarget = null;
        this.chunkManager = null;
        this.controls = null;
        this.handsModel = null;
        this.scannerLight = null;
        this.skyEyeGroup = null;
        this.audio = null;
        this.weather = null;
        this.prevTime = performance.now();

        // Day/night cycle state
        this.dayNight = {
            cycleDuration: 300,  // 5 minutes per full cycle
            isDay: true,
        };

        this.config = {
            renderScale: 0.5,
            fogNear: 20,
            fogFar: 110,
        };

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        const container = document.getElementById('canvas-container');

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
        const quad = new THREE.Mesh(
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
        this.composerScene.add(quad);

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
        this.createSkyEye();

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

        // Weather system
        this.weather = new WeatherSystem();

        // Events
        this.setupWindowEvents();

        // Start loop
        this.animate();
    }

    /**
     * Create the sky eye effect
     */
    createSkyEye() {
        this.skyEyeGroup = new THREE.Group();
        // Add to scene (world space), not camera
        this.scene.add(this.skyEyeGroup);

        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false,  // Always render on top
            depthWrite: false,
            fog: false,  // Not affected by scene fog
        });

        // Larger eye rings for visibility in the sky
        for (let i = 1; i <= 5; i++) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(i * 8, i * 8 + 1, 64),
                mat
            );
            ring.userData = { speed: (Math.random() - 0.5) * 0.3 };
            this.skyEyeGroup.add(ring);
        }

        // Larger pupil
        const pupil = new THREE.Mesh(
            new THREE.CircleGeometry(5, 32),
            mat
        );
        pupil.userData = { isPupil: true };
        this.skyEyeGroup.add(pupil);

        // Store pupil reference for animation
        this.skyEyeGroup.userData.pupil = pupil;
        this.skyEyeGroup.userData.isBlinking = false;

        // Position high in the sky, facing down
        this.skyEyeGroup.position.set(0, 120, 0);
        this.skyEyeGroup.rotation.x = -Math.PI / 2; // Face downward
        this.skyEyeGroup.renderOrder = 999; // Render last
    }

    /**
     * Setup window resize handler
     */
    setupWindowEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);

            const s = this.config.renderScale;
            this.renderTarget.setSize(
                window.innerWidth * s,
                window.innerHeight * s
            );
            this.composerScene.children[0].material.uniforms.resolution.value.set(
                window.innerWidth * s,
                window.innerHeight * s
            );
        });
    }

    /**
     * Main animation loop
     */
    animate() {
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
        this.updateDayNightCycle(t);

        // Weather system
        const weatherState = this.weather.update(delta, t);
        const quad = this.composerScene.children[0];
        quad.material.uniforms.weatherType.value = weatherState.weatherType;
        quad.material.uniforms.weatherIntensity.value = weatherState.weatherIntensity;
        quad.material.uniforms.weatherTime.value = weatherState.weatherTime;

        // Update hands
        this.handsModel.animate(delta, isMoving, time);

        // Update sky eye
        if (this.skyEyeGroup) {
            // Pupil tracking: follow player position
            const pupil = this.skyEyeGroup.userData.pupil;
            if (pupil) {
                const eyePos = this.skyEyeGroup.position.clone();
                const playerPos = this.camera.position.clone();

                // Calculate offset in XZ plane (eye looks down from above)
                const dx = playerPos.x - eyePos.x;
                const dz = playerPos.z - eyePos.z;

                // Clamp pupil movement within the eye
                const maxOffset = 3;
                const targetX = Math.max(-maxOffset, Math.min(maxOffset, dx * 0.02));
                const targetY = Math.max(-maxOffset, Math.min(maxOffset, dz * 0.02));

                // Smooth interpolation (local coords, eye faces down so Z maps to Y)
                pupil.position.lerp(new THREE.Vector3(targetX, targetY, 0.1), 0.05);
            }

            // Random blinking
            if (!this.skyEyeGroup.userData.isBlinking && Math.random() > 0.999) {
                this.triggerEyeBlink();
            }

            // Ring rotation
            this.skyEyeGroup.children.forEach(ring => {
                if (ring.userData.speed) {
                    ring.rotation.z += ring.userData.speed * delta;
                    ring.rotation.x += ring.userData.speed * 0.5 * delta;
                }
            });
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
        document.getElementById('coords').innerText = `POS: ${pos.x}, ${pos.z}`;

        // Render
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.composerScene, this.composerCamera);
    }

    /**
     * Trigger sky eye blink animation
     */
    triggerEyeBlink() {
        if (!this.skyEyeGroup || this.skyEyeGroup.userData.isBlinking) return;

        this.skyEyeGroup.userData.isBlinking = true;
        const originalScale = this.skyEyeGroup.scale.clone();

        // Play blink sound
        this.audio.playEyeBlink();

        // Close eye
        setTimeout(() => {
            this.skyEyeGroup.scale.y = 0.05;
        }, 0);

        // Open eye
        setTimeout(() => {
            this.skyEyeGroup.scale.y = originalScale.y;
            this.skyEyeGroup.userData.isBlinking = false;
        }, 150);
    }

    /**
     * Update day/night cycle
     * @param {number} t - Time in seconds
     */
    updateDayNightCycle(t) {
        const { cycleDuration } = this.dayNight;
        const halfCycle = cycleDuration / 2;

        // Determine if it's day or night based on time
        const cycleTime = t % cycleDuration;
        const newIsDay = cycleTime < halfCycle;

        // Transition when state changes
        if (newIsDay !== this.dayNight.isDay) {
            this.dayNight.isDay = newIsDay;

            // Play transition sound
            this.audio.playDayNightTransition(!newIsDay);

            // Update colors
            const dayColor = 0x888888;
            const nightColor = 0x222222;
            const bgColor = newIsDay ? dayColor : nightColor;

            this.scene.background.setHex(bgColor);
            this.scene.fog.color.setHex(bgColor);

            // Toggle shader inversion
            const quad = this.composerScene.children[0];
            quad.material.uniforms.invertColors.value = !newIsDay;

            console.log(`Day/Night: ${newIsDay ? 'DAY ☀️' : 'NIGHT 🌙'}`);
        }
    }
}

// Start application
window.app = new ChimeraVoid();
