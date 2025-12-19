// 1-bit Chimera Void - Shared Assets (Geometries & Materials)
import * as THREE from 'three';

/**
 * Shared assets container - initialized once, reused everywhere
 */
export class SharedAssets {
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
        this.matFlowerCore = new THREE.MeshBasicMaterial({
            color: 0xffffff,
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
    dispose() {
        // Dispose materials
        Object.values(this).forEach(value => {
            if (value && typeof value.dispose === 'function') {
                value.dispose();
            }
        });
    }
}

// Singleton instance
let sharedAssetsInstance = null;

/**
 * Get or create shared assets instance
 * @returns {SharedAssets}
 */
export function getSharedAssets() {
    if (!sharedAssetsInstance) {
        sharedAssetsInstance = new SharedAssets();
    }
    return sharedAssetsInstance;
}
