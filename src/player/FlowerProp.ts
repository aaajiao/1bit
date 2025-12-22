// 1-bit Chimera Void - Flower Prop (Hand-held flower)
import * as THREE from 'three';
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
    isBeingForced: boolean;     // True when gaze is forcing intensity down
    forcedIntensity: number;    // The intensity to force to when gazing
}

interface FlowerGroup extends THREE.Group {
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
    const coreLight = new THREE.PointLight(0xffffff, 3.0, 8.0);
    coreLight.castShadow = true;
    coreLight.shadow.bias = -0.0001;
    bloom.add(coreLight);

    // Core mesh
    const coreMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.07, 1),
        assets.matFlowerCore
    );
    bloom.add(coreMesh);

    // Petals
    for (let p = 0; p < 7; p++) {
        const angle = (p / 7) * Math.PI * 2;
        const petal = new THREE.Mesh(
            new THREE.ConeGeometry(0.05, 0.5, 3),
            assets.matFlowerPetal
        );
        petal.position.set(
            Math.sin(angle) * 0.08,
            0.2,
            Math.cos(angle) * 0.08
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
            assets.matWire
        );
        sepal.position.set(
            Math.sin(angle) * 0.12,
            0.05,
            Math.cos(angle) * 0.12
        );
        sepal.rotation.set(
            Math.random(),
            Math.random(),
            Math.random()
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
        const r = 0.3 + Math.random() * 0.3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        dust.position.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
        (dust.userData as FlowerPartUserData) = {
            animType: 'DUST_ORBIT',
            axis: new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize(),
            speed: 0.4 + Math.random(),
        };
        bloom.add(dust);
    }

    flowerGroup.add(bloom);
    flowerGroup.userData = {
        bloom: bloom,
        coreLight: coreLight,
        intensity: 0.5,           // Default intensity
        targetIntensity: 0.5,     // Target for smooth interpolation
        isBeingForced: false,     // Not being forced by gaze
        forcedIntensity: 0.1,     // Default forced intensity when gazing
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
}

/**
 * Get current flower intensity
 */
export function getFlowerIntensity(flowerGroup: FlowerGroup): number {
    return flowerGroup.userData.intensity;
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
    forcedValue: number = 0.1
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
}

/**
 * Animate flower components
 * @param flowerGroup - The flower group to animate
 * @param time - Current time in seconds
 * @param delta - Delta time in seconds
 */
export function animateFlower(flowerGroup: FlowerGroup, time: number, delta: number): void {
    if (!flowerGroup.userData.bloom) return;

    const ud = flowerGroup.userData;
    const bloom = ud.bloom;

    // Determine target intensity based on gaze forcing
    let effectiveTarget = ud.targetIntensity;
    if (ud.isBeingForced) {
        effectiveTarget = ud.forcedIntensity;
    }

    // Smooth interpolation of intensity
    const lerpSpeed = 3.0;
    ud.intensity += (effectiveTarget - ud.intensity) * lerpSpeed * delta;
    ud.intensity = Math.max(0, Math.min(1, ud.intensity));

    // Apply intensity to core light
    if (ud.coreLight) {
        // Light intensity scales from 0.5 (dim) to 5.0 (bright)
        ud.coreLight.intensity = 0.5 + ud.intensity * 4.5;
        // Light distance also scales with intensity
        ud.coreLight.distance = 4.0 + ud.intensity * 6.0;
    }

    // Bloom rotation (slower when dim, faster when bright)
    bloom.rotation.y += delta * (0.1 + ud.intensity * 0.2);

    // Scale bloom slightly based on intensity
    const bloomScale = 0.8 + ud.intensity * 0.4;
    bloom.scale.setScalar(bloomScale);

    bloom.children.forEach(part => {
        const partData = part.userData as FlowerPartUserData;
        if (!partData || !partData.animType) return;

        if (partData.animType === 'PETAL_BREATHE' && partData.baseRotX !== undefined && partData.phase !== undefined) {
            // Petals open more when intensity is high
            const openAmount = Math.sin(time * 2.0 + partData.phase) * 0.2 * (0.5 + ud.intensity * 0.5);
            const baseOpen = (ud.intensity - 0.5) * 0.3; // More open when brighter
            part.rotation.x = partData.baseRotX + openAmount + baseOpen;
        }
        if (partData.animType === 'SEPAL_FLOAT' && partData.phase !== undefined) {
            const floatSpeed = 0.3 + ud.intensity * 0.4;
            part.rotation.x += delta * floatSpeed;
            part.rotation.z += delta * floatSpeed * 0.6;
            part.position.y = 0.1 + Math.sin(time * 1.5 + partData.phase) * 0.05;
        }
        if (partData.animType === 'DUST_ORBIT' && partData.axis && partData.speed !== undefined) {
            // Dust orbits faster when intensity is high
            const orbitSpeed = partData.speed * (0.5 + ud.intensity * 0.5);
            part.position.applyAxisAngle(partData.axis, orbitSpeed * delta);
        }
    });
}
