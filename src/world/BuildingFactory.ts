// 1-bit Chimera Void - Building Factory
import * as THREE from 'three';
import { hash } from '../utils/hash';
import type { BuildingParams, SharedAssets, AnimatedObject } from '../types';

/**
 * Creates BLOCKS style building
 * @param buildGroup - Parent group
 * @param params - Generation parameters
 * @returns Maximum height of building
 */
export function createBlocksBuilding(buildGroup: THREE.Group, params: BuildingParams): number {
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
 * @param buildGroup - Parent group
 * @param params - Generation parameters
 * @returns Maximum height of building
 */
export function createSpikesBuilding(buildGroup: THREE.Group, params: BuildingParams): number {
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

interface AssetSelection {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
}

/**
 * Selects geometry and material for a solid building asset
 * @param assetType - Random value for asset selection
 * @param materialOverride - Random value for material override
 * @param assets - Shared assets object
 */
function selectSolidAsset(assetType: number, materialOverride: number, assets: SharedAssets): AssetSelection {
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;

    if (assetType > 0.8) {
        geometry = assets.knotGeo;
        material = assets.matSolid;
    } else if (assetType > 0.6) {
        geometry = assets.coneGeo;
        material = assets.matDark;
    } else if (assetType > 0.4) {
        geometry = assets.tetraGeo;
        material = assets.matWire;
    } else if (assetType > 0.2) {
        geometry = assets.cylinderGeo;
        material = assets.matTreeBark;
    } else {
        geometry = assets.boxGeo;
        material = assets.matSolid;
    }

    // Override with plasma material for rare cases
    if (materialOverride > 0.9) {
        material = assets.matPlasma.clone();
    }

    return { geometry, material };
}

/**
 * Calculates scale for an asset based on its geometry type
 * @param geometry - The geometry to scale
 * @param baseScale - Base scale modifier
 * @param assets - Shared assets object
 */
function calculateAssetScale(geometry: THREE.BufferGeometry, baseScale: number, assets: SharedAssets): THREE.Vector3 {
    const scaleMod = 1.0 + baseScale * 1.5;

    if (geometry === assets.coneGeo) {
        return new THREE.Vector3(scaleMod, scaleMod * 3, scaleMod);
    } else if (geometry === assets.tetraGeo) {
        return new THREE.Vector3(scaleMod * 2, scaleMod * 2, scaleMod * 2);
    } else {
        return new THREE.Vector3(scaleMod * 2, scaleMod * 1.5, scaleMod * 2);
    }
}

interface SolidMeshParams {
    assets: SharedAssets;
    assetType: number;
    materialOverride: number;
    r1: number;
    r2: number;
    r3: number;
}

/**
 * Creates a solid building mesh
 * @param params - Creation parameters
 * @param animatedObjects - Array to collect animated objects
 */
function createSolidMesh(params: SolidMeshParams, animatedObjects: AnimatedObject[]): THREE.Mesh {
    const { assets, assetType, materialOverride, r1, r2, r3 } = params;

    const { geometry, material } = selectSolidAsset(assetType, materialOverride, assets);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.scale.copy(calculateAssetScale(geometry, r2, assets));
    mesh.rotation.set(r1 * Math.PI * 2, r2 * Math.PI * 2, r3 * Math.PI * 2);
    mesh.userData.baseScale = mesh.scale.clone();

    // Add rotation animation for special assets
    if (assetType > 0.7) {
        mesh.userData.animType = 'ROTATE_FLOAT';
        mesh.userData.speed = 0.2;
        animatedObjects.push(mesh as AnimatedObject);
    }

    return mesh;
}

interface LiquidMeshParams {
    assets: SharedAssets;
    f: number;
    r1: number;
    r2: number;
    r3: number;
}

/**
 * Creates a liquid building mesh
 * @param params - Creation parameters
 * @param animatedObjects - Array to collect animated objects
 */
function createLiquidMesh(params: LiquidMeshParams, animatedObjects: AnimatedObject[]): THREE.Mesh {
    const { assets, f, r1, r2, r3 } = params;

    const mesh = new THREE.Mesh(assets.sphereGeo, assets.matLiquid);
    const stretch = 1.0 + r1 * 2.0;
    mesh.scale.set(2.0 + r2, 2.0 * stretch, 2.0 + r3);

    mesh.userData = {
        animType: 'LIQUID_WOBBLE',
        speed: 0.8 + r2,
        phase: f + r1 * 5,
        baseScale: mesh.scale.clone(),
    };
    animatedObjects.push(mesh as AnimatedObject);

    mesh.rotation.z = (r1 - 0.5) * 0.5;

    return mesh;
}

interface FragmentPosition {
    yPos: number;
    xOffset: number;
    zOffset: number;
}

/**
 * Calculates position based on fragment type
 * @param isLiquid - Whether the fragment is liquid
 * @param f - Fragment index
 * @param r1 - Random value 1
 * @param r2 - Random value 2
 * @param r3 - Random value 3
 */
function calculateFragmentPosition(isLiquid: boolean, f: number, r1: number, r2: number, r3: number): FragmentPosition {
    const yPos = isLiquid ? f * 2.5 + (r1 - 0.5) * 2 : f * 2.5;
    const xOffset = isLiquid ? (r2 - 0.5) * 6 : (r2 - 0.5) * 5;
    const zOffset = isLiquid ? (r3 - 0.5) * 6 : (r3 - 0.5) * 5;

    return { yPos, xOffset, zOffset };
}

/**
 * Creates FLUID style building with mixed assets
 * @param buildGroup - Parent group
 * @param params - Generation parameters
 * @param animatedObjects - Array to collect animated objects
 * @returns Maximum height of building
 */
export function createFluidBuilding(
    buildGroup: THREE.Group,
    params: BuildingParams,
    animatedObjects: AnimatedObject[]
): number {
    const { i, cx, cz, assets } = params;
    let maxHeight = 0;
    const fragments = 4 + Math.floor(hash(i, cz) * 8);

    for (let f = 0; f < fragments; f++) {
        const r1 = hash(i + f, cx);
        const r2 = hash(cx, cz + f);
        const r3 = hash(f, i);

        const isLiquid = hash(f, i) > 0.5;
        const mesh = isLiquid
            ? createLiquidMesh({ assets, f, r1, r2, r3 }, animatedObjects)
            : createSolidMesh({
                assets,
                assetType: hash(f, cx),
                materialOverride: hash(f, cz),
                r1, r2, r3
            }, animatedObjects);

        const { yPos, xOffset, zOffset } = calculateFragmentPosition(isLiquid, f, r1, r2, r3);

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(xOffset, yPos, zOffset);
        buildGroup.add(mesh);

        const topY = yPos + mesh.scale.y * 1.5;
        if (topY > maxHeight) maxHeight = topY;
    }

    return maxHeight;
}
