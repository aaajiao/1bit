// 1-bit Chimera Void - Flower Prop (Hand-held flower)
import * as THREE from 'three';
import { getSharedAssets } from '../world/SharedAssets.js';

/**
 * Creates an animated flower prop held by the right hand
 * @returns {THREE.Group} Flower group with bloom animations
 */
export function createFlowerProp() {
    const assets = getSharedAssets();
    const flowerGroup = new THREE.Group();

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
        petal.userData = {
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
        sepal.userData = {
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
        dust.userData = {
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
    flowerGroup.userData = { bloom: bloom };

    return flowerGroup;
}

/**
 * Animate flower components
 * @param {THREE.Group} flowerGroup - The flower group to animate
 * @param {number} time - Current time in seconds
 * @param {number} delta - Delta time in seconds
 */
export function animateFlower(flowerGroup, time, delta) {
    if (!flowerGroup.userData.bloom) return;

    const bloom = flowerGroup.userData.bloom;
    bloom.rotation.y += delta * 0.2;

    bloom.children.forEach(part => {
        const ud = part.userData;
        if (!ud || !ud.animType) return;

        if (ud.animType === 'PETAL_BREATHE') {
            const openAmount = Math.sin(time * 2.0 + ud.phase) * 0.2;
            part.rotation.x = ud.baseRotX + openAmount;
        }
        if (ud.animType === 'SEPAL_FLOAT') {
            part.rotation.x += delta * 0.5;
            part.rotation.z += delta * 0.3;
            part.position.y = 0.1 + Math.sin(time * 1.5 + ud.phase) * 0.05;
        }
        if (ud.animType === 'DUST_ORBIT') {
            part.position.applyAxisAngle(ud.axis, ud.speed * delta);
        }
    });
}
