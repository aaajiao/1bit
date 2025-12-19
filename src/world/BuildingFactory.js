// 1-bit Chimera Void - Building Factory
import * as THREE from 'three';
import { hash } from '../utils/hash.js';
import { SharedAssets } from './SharedAssets.js';

/**
 * Creates BLOCKS style building
 * @param {THREE.Group} buildGroup - Parent group
 * @param {Object} params - Generation parameters
 * @returns {number} Maximum height of building
 */
export function createBlocksBuilding(buildGroup, params) {
    const { i, cx, cz, assets } = params;
    let maxHeight = 0;
    const fragments = 4 + Math.floor(hash(i, cz) * 8);

    for (let f = 0; f < fragments; f++) {
        const r2 = hash(cx, cz + f);
        const r3 = hash(f, i);

        const mesh = new THREE.Mesh(assets.boxGeo, assets.matSolid);
        mesh.scale.set(
            2 + r2 * 4,
            3 + r3 * 4,
            2 + r2 * 4
        );

        const yPos = f * 3.5;
        const xOffset = (r2 - 0.5) * 5;
        const zOffset = (r3 - 0.5) * 5;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(xOffset, yPos, zOffset);
        mesh.userData.baseScale = mesh.scale.clone();

        buildGroup.add(mesh);

        const topY = yPos + mesh.scale.y * 1.5;
        if (topY > maxHeight) maxHeight = topY;
    }

    return maxHeight;
}

/**
 * Creates SPIKES style building
 * @param {THREE.Group} buildGroup - Parent group
 * @param {Object} params - Generation parameters
 * @returns {number} Maximum height of building
 */
export function createSpikesBuilding(buildGroup, params) {
    const { i, cx, cz, assets } = params;
    let maxHeight = 0;
    const fragments = 4 + Math.floor(hash(i, cz) * 8);

    for (let f = 0; f < fragments; f++) {
        const r2 = hash(cx, cz + f);
        const r3 = hash(f, i);

        const mesh = new THREE.Mesh(assets.coneGeo, assets.matDark);
        mesh.scale.set(1 + r2, 4 + r3 * 6, 1 + r2);

        const yPos = f * 3.5;
        const xOffset = (r2 - 0.5) * 6;
        const zOffset = (r3 - 0.5) * 6;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(xOffset, yPos, zOffset);
        mesh.userData.baseScale = mesh.scale.clone();

        buildGroup.add(mesh);

        const topY = yPos + mesh.scale.y * 1.5;
        if (topY > maxHeight) maxHeight = topY;
    }

    return maxHeight;
}

/**
 * Creates FLUID style building with mixed assets
 * @param {THREE.Group} buildGroup - Parent group
 * @param {Object} params - Generation parameters
 * @param {Array} animatedObjects - Array to collect animated objects
 * @returns {number} Maximum height of building
 */
export function createFluidBuilding(buildGroup, params, animatedObjects) {
    const { i, cx, cz, assets } = params;
    let maxHeight = 0;
    const fragments = 4 + Math.floor(hash(i, cz) * 8);

    for (let f = 0; f < fragments; f++) {
        const r1 = hash(i + f, cx);
        const r2 = hash(cx, cz + f);
        const r3 = hash(f, i);

        let mesh;
        let yPos, xOffset, zOffset;

        const isLiquid = hash(f, i) > 0.5;

        if (!isLiquid) {
            // Solid asset selection
            const assetType = hash(f, cx);
            let chosenGeo, chosenMat;

            if (assetType > 0.8) {
                chosenGeo = assets.knotGeo;
                chosenMat = assets.matSolid;
            } else if (assetType > 0.6) {
                chosenGeo = assets.coneGeo;
                chosenMat = assets.matDark;
            } else if (assetType > 0.4) {
                chosenGeo = assets.tetraGeo;
                chosenMat = assets.matWire;
            } else if (assetType > 0.2) {
                chosenGeo = assets.cylinderGeo;
                chosenMat = assets.matTreeBark;
            } else {
                chosenGeo = assets.boxGeo;
                chosenMat = assets.matSolid;
            }

            if (hash(f, cz) > 0.9) {
                chosenMat = assets.matPlasma.clone();
            }

            mesh = new THREE.Mesh(chosenGeo, chosenMat);
            const scaleMod = 1.0 + r2 * 1.5;

            if (chosenGeo === assets.coneGeo) {
                mesh.scale.set(scaleMod, scaleMod * 3, scaleMod);
            } else if (chosenGeo === assets.tetraGeo) {
                mesh.scale.set(scaleMod * 2, scaleMod * 2, scaleMod * 2);
            } else {
                mesh.scale.set(scaleMod * 2, scaleMod * 1.5, scaleMod * 2);
            }

            mesh.rotation.set(
                r1 * Math.PI * 2,
                r2 * Math.PI * 2,
                r3 * Math.PI * 2
            );

            yPos = f * 2.5;
            xOffset = (r2 - 0.5) * 5;
            zOffset = (r3 - 0.5) * 5;
            mesh.userData.baseScale = mesh.scale.clone();

            if (assetType > 0.7) {
                mesh.userData.animType = 'ROTATE_FLOAT';
                mesh.userData.speed = 0.2;
                animatedObjects.push(mesh);
            }
        } else {
            // Liquid blob
            mesh = new THREE.Mesh(assets.sphereGeo, assets.matLiquid);
            const stretch = 1.0 + r1 * 2.0;
            mesh.scale.set(2.0 + r2, 2.0 * stretch, 2.0 + r3);

            mesh.userData = {
                animType: 'LIQUID_WOBBLE',
                speed: 0.8 + r2,
                phase: f + r1 * 5,
                baseScale: mesh.scale.clone(),
            };
            animatedObjects.push(mesh);

            yPos = f * 2.5 + (r1 - 0.5) * 2;
            xOffset = (r2 - 0.5) * 6;
            zOffset = (r3 - 0.5) * 6;
            mesh.rotation.z = (r1 - 0.5) * 0.5;
        }

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(xOffset, yPos, zOffset);
        buildGroup.add(mesh);

        const topY = yPos + mesh.scale.y * 1.5;
        if (topY > maxHeight) maxHeight = topY;
    }

    return maxHeight;
}
