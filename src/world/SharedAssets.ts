import type { SharedAssets as ISharedAssets } from '../types';
// 1-bit Chimera Void - Shared Assets (Geometries & Materials)
import * as THREE from 'three';

// Singleton instance (declared before the class: dispose() clears it).
let sharedAssetsInstance: SharedAssets | null = null;

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

    // Phase 4 sub-palette: 2-3 shared greyscale Lambert tints selected per
    // biome/room. Shared singletons — never cloned per instance — so they add
    // zero per-instance allocation. Index 0 = lightest .. last = darkest, all
    // greyscale so the duotone post-process maps cleanly.
    subTints: THREE.MeshLambertMaterial[];

    // Geometries
    boxGeo: THREE.BoxGeometry;
    blobGeo: THREE.IcosahedronGeometry;
    sphereGeo: THREE.SphereGeometry;
    knotGeo: THREE.TorusKnotGeometry;
    coneGeo: THREE.ConeGeometry;
    tetraGeo: THREE.TetrahedronGeometry;
    cylinderGeo: THREE.CylinderGeometry;

    // Phase 4 sub-palette geometries: extra THREE primitives shared as
    // singletons (no per-instance allocation) for biome/room variety.
    tallBoxGeo: THREE.BoxGeometry;
    octaGeo: THREE.OctahedronGeometry;
    hiCylinderGeo: THREE.CylinderGeometry;

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
            color: 0xAAAAAA,
            emissive: 0x111111,
            specular: 0xFFFFFF,
            shininess: 100,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
        });
        this.matFlowerCore = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            emissive: 0xFFFFFF,
            emissiveIntensity: 1.0,
            roughness: 0.3,
            metalness: 0.0,
        });
        this.matLiquid = new THREE.MeshPhongMaterial({
            color: 0x111111,
            specular: 0xAAAAAA,
            shininess: 60,
        });

        // Sub-palette tints (greyscale, light -> dark). Selected per biome/room
        // by RoomGeneration.subPaletteIndex; SUB_PALETTE_COUNT mirrors length.
        this.subTints = [
            new THREE.MeshLambertMaterial({ color: 0x6A6A6A }),
            new THREE.MeshLambertMaterial({ color: 0x3A3A3A }),
            new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
        ];

        // Geometries
        this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
        this.blobGeo = new THREE.IcosahedronGeometry(1, 1);
        this.sphereGeo = new THREE.SphereGeometry(1, 16, 16);
        this.knotGeo = new THREE.TorusKnotGeometry(0.6, 0.2, 64, 8);
        this.coneGeo = new THREE.ConeGeometry(0.5, 1, 16);
        this.tetraGeo = new THREE.TetrahedronGeometry(1);
        this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 6);

        // Sub-palette geometries: tall box (verticality), octahedron (faceted
        // crystal), and a higher-segment cylinder (smoother column).
        this.tallBoxGeo = new THREE.BoxGeometry(1, 3, 1);
        this.octaGeo = new THREE.OctahedronGeometry(1);
        this.hiCylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
    }

    /**
     * Dispose all assets when no longer needed
     */
    dispose(): void {
        // Dispose materials/geometries. The generic loop frees every field that
        // is itself disposable; array-valued fields (e.g. subTints) are walked
        // element-by-element so their shared singletons are freed too.
        const values = Object.values(this) as unknown[];
        values.forEach((value) => {
            if (Array.isArray(value)) {
                value.forEach((entry) => {
                    if (entry && typeof (entry as { dispose?: () => void }).dispose === 'function') {
                        (entry as { dispose: () => void }).dispose();
                    }
                });
                return;
            }
            if (value && typeof (value as { dispose?: () => void }).dispose === 'function') {
                (value as { dispose: () => void }).dispose();
            }
        });

        // A disposed instance must never be served again: clear the module
        // singleton so the next getSharedAssets() rebuilds fresh assets
        // instead of handing out already-freed GPU resources.
        if (sharedAssetsInstance === this) {
            sharedAssetsInstance = null;
        }
    }
}

/**
 * Get or create shared assets instance
 */
export function getSharedAssets(): SharedAssets {
    if (!sharedAssetsInstance) {
        sharedAssetsInstance = new SharedAssets();
    }
    return sharedAssetsInstance;
}
