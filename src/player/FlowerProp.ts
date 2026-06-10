// 1-bit Chimera Void - Flower Prop (Hand-held flower)
import * as THREE from 'three';
import { GAZE } from '../config';
import { hash } from '../utils/hash';
import { getSharedAssets } from '../world/SharedAssets';

interface FlowerPartUserData {
    animType?: 'PETAL_BREATHE' | 'SEPAL_FLOAT' | 'DUST_ORBIT';
    baseRotX?: number;
    phase?: number;
    speed?: number;
    axis?: THREE.Vector3;
}

interface FlowerGroupUserData {
    bloom?: THREE.Group;
    coreLight?: THREE.PointLight;
    intensity: number;
    targetIntensity: number;
    isBeingForced: boolean; // True when gaze is forcing intensity down
    forcedIntensity: number; // The intensity to force to when gazing
    wasBeingForced: boolean; // Previous-frame forcing state (transition detection)
    recoveryDelay: number; // Seconds left before post-gaze recovery may begin
}

export interface FlowerGroup extends THREE.Group {
    userData: FlowerGroupUserData;
}

/**
 * Creates an animated flower prop held by the right hand
 */
export function createFlowerProp(): FlowerGroup {
    const assets = getSharedAssets();
    const flowerGroup = new THREE.Group() as FlowerGroup;

    // Flower position relative to hand
    flowerGroup.position.set(-0.05, 0.05, -0.25);
    flowerGroup.rotation.set(0.1, -0.1, 0.1);

    // Stem (curved tube)
    const stemCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -2.0, 0),
        new THREE.Vector3(0.01, -0.5, 0.01),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.01, 0.6, -0.02),
        new THREE.Vector3(0, 0.8, 0),
    ]);
    const stemGeo = new THREE.TubeGeometry(stemCurve, 12, 0.012, 6, false);
    const stem = new THREE.Mesh(stemGeo, assets.matFlowerStem);
    flowerGroup.add(stem);

    // Bloom container
    const bloom = new THREE.Group();
    bloom.position.set(0, 0.8, 0);

    // Core light
    const coreLight = new THREE.PointLight(0xFFFFFF, 3.0, 8.0);
    coreLight.castShadow = true;
    coreLight.shadow.bias = -0.0001;
    bloom.add(coreLight);

    // Core mesh
    const coreMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.07, 1),
        assets.matFlowerCore,
    );
    bloom.add(coreMesh);

    // Petals
    for (let p = 0; p < 7; p++) {
        const angle = (p / 7) * Math.PI * 2;
        const petal = new THREE.Mesh(
            new THREE.ConeGeometry(0.05, 0.5, 3),
            assets.matFlowerPetal,
        );
        petal.position.set(
            Math.sin(angle) * 0.08,
            0.2,
            Math.cos(angle) * 0.08,
        );
        petal.lookAt(0, 0, 0);
        petal.rotation.x -= 2.2;
        (petal.userData as FlowerPartUserData) = {
            animType: 'PETAL_BREATHE',
            baseRotX: petal.rotation.x,
            phase: p,
        };
        bloom.add(petal);
    }

    // Sepals
    for (let s = 0; s < 5; s++) {
        const angle = (s / 5) * Math.PI * 2 + 0.5;
        const sepal = new THREE.Mesh(
            new THREE.TetrahedronGeometry(0.2),
            assets.matWire,
        );
        sepal.position.set(
            Math.sin(angle) * 0.12,
            0.05,
            Math.cos(angle) * 0.12,
        );
        sepal.rotation.set(
            hash(s, 11) * Math.PI * 2,
            hash(s, 23) * Math.PI * 2,
            hash(s, 37) * Math.PI * 2,
        );
        (sepal.userData as FlowerPartUserData) = {
            animType: 'SEPAL_FLOAT',
            phase: s * 2,
            speed: 0.6,
        };
        bloom.add(sepal);
    }

    // Dust particles
    const pGeo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
    for (let d = 0; d < 16; d++) {
        const dust = new THREE.Mesh(pGeo, assets.matFlowerCore);
        const r = 0.3 + hash(d, 3) * 0.3;
        const theta = hash(d, 5) * Math.PI * 2;
        const phi = hash(d, 7) * Math.PI;
        dust.position.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta),
        );
        (dust.userData as FlowerPartUserData) = {
            animType: 'DUST_ORBIT',
            axis: new THREE.Vector3(
                hash(d, 13) - 0.5,
                hash(d, 17) - 0.5,
                hash(d, 19) - 0.5,
            ).normalize(),
            speed: 0.4 + hash(d, 29),
        };
        bloom.add(dust);
    }

    flowerGroup.add(bloom);
    flowerGroup.userData = {
        bloom,
        coreLight,
        intensity: 0.5, // Default intensity
        targetIntensity: 0.5, // Target for smooth interpolation
        isBeingForced: false, // Not being forced by gaze
        forcedIntensity: 0.1, // Default forced intensity when gazing
        wasBeingForced: false, // Previous-frame forcing state
        recoveryDelay: 0, // No pending post-gaze recovery hold
    };

    return flowerGroup;
}

/**
 * Set the flower intensity (0-1)
 * Higher intensity = brighter light, more visible
 * @param flowerGroup - The flower group
 * @param intensity - Target intensity (0-1)
 */
export function setFlowerIntensity(flowerGroup: FlowerGroup, intensity: number): void {
    flowerGroup.userData.targetIntensity = Math.max(0, Math.min(1, intensity));
    // Deliberate player input (scroll wheel) cancels the post-gaze recovery
    // hold — the flower should respond to the player immediately.
    flowerGroup.userData.recoveryDelay = 0;
}

/**
 * Get current flower intensity
 */
export function getFlowerIntensity(flowerGroup: FlowerGroup): number {
    return flowerGroup.userData.intensity;
}

/**
 * Get the player-set target intensity (scroll wheel / override).
 * Used by the gaze one-way clamp: gaze may only suppress below this value.
 */
export function getFlowerTargetIntensity(flowerGroup: FlowerGroup): number {
    return flowerGroup.userData.targetIntensity;
}

/**
 * Force flower intensity down (used by gaze mechanic)
 * @param flowerGroup - The flower group
 * @param isForced - Whether intensity is being forced
 * @param forcedValue - The value to force to (default 0.1)
 */
export function forceFlowerIntensity(
    flowerGroup: FlowerGroup,
    isForced: boolean,
    forcedValue: number = 0.1,
): void {
    flowerGroup.userData.isBeingForced = isForced;
    flowerGroup.userData.forcedIntensity = forcedValue;
}

/**
 * Override flower intensity to maximum (used by resistance mechanic)
 * @param flowerGroup - The flower group
 */
export function overrideFlowerIntensity(flowerGroup: FlowerGroup): void {
    flowerGroup.userData.intensity = 1.0;
    flowerGroup.userData.targetIntensity = 1.0;
    // Override is authoritative: clear gaze-forcing so animateFlower's
    // effectiveTarget holds at the max target instead of decaying back down
    // toward forcedIntensity (H4). Also cancel any pending post-gaze recovery
    // hold so the blaze-to-full payoff is instant.
    flowerGroup.userData.isBeingForced = false;
    flowerGroup.userData.wasBeingForced = false;
    flowerGroup.userData.recoveryDelay = 0;
}

/**
 * Animate flower components with three distinct intensity states:
 * - 0.0-0.3: Dim (微弱光芒) - subtle, safe
 * - 0.3-0.7: Soft (柔和发光) - moderate, starts attracting attention
 * - 0.7-1.0: Intense (强烈光芒) - bright, fully exposed
 * @param flowerGroup - The flower group to animate
 * @param time - Current time in seconds
 * @param delta - Delta time in seconds
 */
export function animateFlower(flowerGroup: FlowerGroup, time: number, delta: number): void {
    const bloom = flowerGroup.userData.bloom;
    if (!bloom)
        return;

    const ud = flowerGroup.userData;
    const assets = getSharedAssets();

    // Post-gaze recovery hold (flow-audit enhancement #3): when gaze-forcing
    // ends, keep the flower extinguished for a beat so the player can look
    // back down and actually see the dimmed flower before it recovers.
    if (ud.wasBeingForced && !ud.isBeingForced) {
        ud.recoveryDelay = GAZE.FLOWER_RECOVERY_DELAY;
    }
    ud.wasBeingForced = ud.isBeingForced;

    // Determine target intensity based on gaze forcing
    let effectiveTarget = ud.targetIntensity;
    if (ud.isBeingForced) {
        effectiveTarget = ud.forcedIntensity;
        ud.recoveryDelay = 0; // Active forcing supersedes any pending hold
    }
    else if (ud.recoveryDelay > 0) {
        ud.recoveryDelay = Math.max(0, ud.recoveryDelay - delta);
        effectiveTarget = ud.intensity; // Freeze at the extinguished level
    }

    // Smooth interpolation of intensity
    const lerpSpeed = 3.0;
    ud.intensity += (effectiveTarget - ud.intensity) * lerpSpeed * delta;
    ud.intensity = Math.max(0, Math.min(1, ud.intensity));

    // ===== THREE-STATE VISUAL SYSTEM =====
    const intensity = ud.intensity;

    // Determine state: 0=dim, 1=soft, 2=intense
    let state: 0 | 1 | 2;
    let stateProgress: number; // 0-1 within current state
    if (intensity < 0.3) {
        state = 0; // Dim
        stateProgress = intensity / 0.3;
    }
    else if (intensity < 0.7) {
        state = 1; // Soft
        stateProgress = (intensity - 0.3) / 0.4;
    }
    else {
        state = 2; // Intense
        stateProgress = (intensity - 0.7) / 0.3;
    }

    // ----- 1. CORE LIGHT (PointLight) -----
    // State-based light intensity and distance
    if (ud.coreLight) {
        const lightParams = [
            { intensity: 0.3 + stateProgress * 0.5, distance: 2.0 + stateProgress * 1.0 }, // Dim: 0.3-0.8, 2-3m
            { intensity: 1.0 + stateProgress * 2.0, distance: 4.0 + stateProgress * 2.0 }, // Soft: 1.0-3.0, 4-6m
            { intensity: 4.0 + stateProgress * 4.0, distance: 8.0 + stateProgress * 4.0 }, // Intense: 4.0-8.0, 8-12m
        ];
        const params = lightParams[state];
        ud.coreLight.intensity = params.intensity;
        ud.coreLight.distance = params.distance;
    }

    // ----- 2. MATERIAL EMISSIVE (Core glow) -----
    // Update core material emissive intensity based on state
    const emissiveParams = [0.2 + stateProgress * 0.3, 0.6 + stateProgress * 0.6, 1.5 + stateProgress * 1.5];
    assets.matFlowerCore.emissiveIntensity = emissiveParams[state];

    // ----- 3. PETAL EMISSIVE -----
    // Petals glow more in higher states
    const petalEmissive = [0.05, 0.15 + stateProgress * 0.15, 0.4 + stateProgress * 0.3];
    if (assets.matFlowerPetal.emissive) {
        assets.matFlowerPetal.emissiveIntensity = petalEmissive[state];
    }

    // ----- 4. BLOOM SCALE -----
    // More dramatic scaling between states
    const scaleParams = [
        0.6 + stateProgress * 0.15, // Dim: 0.6 - 0.75
        0.8 + stateProgress * 0.15, // Soft: 0.8 - 0.95
        1.0 + stateProgress * 0.3, // Intense: 1.0 - 1.3
    ];
    bloom.scale.setScalar(scaleParams[state]);

    // ----- 5. BLOOM ROTATION -----
    // Rotation speed increases with state
    const rotationSpeeds = [0.05, 0.15, 0.35 + stateProgress * 0.2];
    bloom.rotation.y += delta * rotationSpeeds[state];

    // ----- 6. PETAL/SEPAL/DUST ANIMATIONS -----
    bloom.children.forEach((part) => {
        const partData = part.userData as FlowerPartUserData;
        if (!partData || !partData.animType)
            return;

        if (partData.animType === 'PETAL_BREATHE' && partData.baseRotX !== undefined && partData.phase !== undefined) {
            // Petal opening based on state
            const breatheAmplitude = [0.1, 0.2, 0.35][state];
            const openAmount = Math.sin(time * 2.0 + partData.phase) * breatheAmplitude;
            const baseOpen = [0, 0.1 * stateProgress, 0.2 + stateProgress * 0.15][state];
            part.rotation.x = partData.baseRotX + openAmount + baseOpen;
        }

        if (partData.animType === 'SEPAL_FLOAT' && partData.phase !== undefined) {
            // Sepals float more actively in higher states
            const floatSpeed = [0.15, 0.3, 0.5 + stateProgress * 0.3][state];
            part.rotation.x += delta * floatSpeed;
            part.rotation.z += delta * floatSpeed * 0.6;
            const floatAmplitude = [0.02, 0.04, 0.07][state];
            part.position.y = 0.1 + Math.sin(time * 1.5 + partData.phase) * floatAmplitude;
        }

        if (partData.animType === 'DUST_ORBIT' && partData.axis && partData.speed !== undefined) {
            // Dust visibility and speed based on state
            // In dim state, dust is barely visible; in intense state, dust orbits fast
            const dustVisible = state === 0 ? stateProgress > 0.5 : true;
            (part as THREE.Mesh).visible = dustVisible;

            if (dustVisible) {
                const orbitMultiplier = [0.3, 0.6, 1.0 + stateProgress * 0.5][state];
                const orbitSpeed = partData.speed * orbitMultiplier;
                part.position.applyAxisAngle(partData.axis, orbitSpeed * delta);
            }
        }
    });
}
