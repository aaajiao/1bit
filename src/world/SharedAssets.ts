// 1-bit Chimera Void - Shared Assets (Geometries & Materials)
import * as THREE from 'three';
import type { SharedAssets as ISharedAssets } from '../types';

/**
 * Shared assets container - initialized once, reused everywhere
 */
export class SharedAssets implements ISharedAssets {
    // Materials
    matSolid: THREE.MeshLambertMaterial;
    matDark: THREE.MeshLambertMaterial;
    matWire: THREE.MeshBasicMaterial;
    matPlasma: THREE.MeshLambertMaterial;
    matTreeBark: THREE.MeshLambertMaterial;
    matFlowerStem: THREE.MeshLambertMaterial;
    matFlowerPetal: THREE.MeshPhongMaterial;
    matFlowerCore: THREE.MeshStandardMaterial;
    matLiquid: THREE.MeshPhongMaterial;

    // Geometries
    boxGeo: THREE.BoxGeometry;
    blobGeo: THREE.IcosahedronGeometry;
    sphereGeo: THREE.SphereGeometry;
    knotGeo: THREE.TorusKnotGeometry;
    coneGeo: THREE.ConeGeometry;
    tetraGeo: THREE.TetrahedronGeometry;
    cylinderGeo: THREE.CylinderGeometry;

    constructor() {
        // Materials
        this.matSolid = new THREE.MeshLambertMaterial({ color: 0x333333 });
        this.matDark = new THREE.MeshLambertMaterial({ color: 0x050505 });
        this.matWire = new THREE.MeshBasicMaterial({
            color: 0x333333,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
        });
        this.matPlasma = new THREE.MeshLambertMaterial({
            color: 0x111111,
            emissive: 0x000000,
        });
        this.matTreeBark = new THREE.MeshLambertMaterial({
            color: 0x252525,
        });
        this.matFlowerStem = new THREE.MeshLambertMaterial({
            color: 0x000000,
        });
        this.matFlowerPetal = new THREE.MeshPhongMaterial({
            color: 0xaaaaaa,
            emissive: 0x111111,
            specular: 0xffffff,
            shininess: 100,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
        });
        this.matFlowerCore = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 1.0,
            roughness: 0.3,
            metalness: 0.0,
        });
        this.matLiquid = new THREE.MeshPhongMaterial({
            color: 0x111111,
            specular: 0xaaaaaa,
            shininess: 60,
        });

        // Geometries
        this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
        this.blobGeo = new THREE.IcosahedronGeometry(1, 1);
        this.sphereGeo = new THREE.SphereGeometry(1, 16, 16);
        this.knotGeo = new THREE.TorusKnotGeometry(0.6, 0.2, 64, 8);
        this.coneGeo = new THREE.ConeGeometry(0.5, 1, 16);
        this.tetraGeo = new THREE.TetrahedronGeometry(1);
        this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    }

    /**
     * Dispose all assets when no longer needed
     */
    dispose(): void {
        // Dispose materials
        const values = Object.values(this) as unknown[];
        values.forEach(value => {
            if (value && typeof (value as { dispose?: () => void }).dispose === 'function') {
                (value as { dispose: () => void }).dispose();
            }
        });
    }
}

// Singleton instance
let sharedAssetsInstance: SharedAssets | null = null;

/**
 * Get or create shared assets instance
 */
export function getSharedAssets(): SharedAssets {
    if (!sharedAssetsInstance) {
        sharedAssetsInstance = new SharedAssets();
    }
    return sharedAssetsInstance;
}
