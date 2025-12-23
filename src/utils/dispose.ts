// 1-bit Chimera Void - Resource Disposal Utilities
import * as THREE from 'three';

/**
 * Recursively dispose all resources in a Three.js Object3D hierarchy
 * Handles geometries, materials, and textures
 *
 * @param obj - The Object3D to dispose
 * @param disposeMaterials - Whether to dispose materials (default: true)
 * @param disposeTextures - Whether to dispose textures (default: true)
 */
export function disposeObject3D(
    obj: THREE.Object3D,
    disposeMaterials: boolean = true,
    disposeTextures: boolean = true,
): void {
    obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            // Dispose geometry
            child.geometry?.dispose();

            // Dispose materials
            if (disposeMaterials) {
                disposeMaterial(child.material, disposeTextures);
            }
        }
        else if (child instanceof THREE.Line) {
            child.geometry?.dispose();
            if (disposeMaterials && child.material) {
                disposeMaterial(child.material, disposeTextures);
            }
        }
        else if (child instanceof THREE.Points) {
            child.geometry?.dispose();
            if (disposeMaterials && child.material) {
                disposeMaterial(child.material, disposeTextures);
            }
        }
    });
}

/**
 * Dispose a material or array of materials
 */
function disposeMaterial(
    material: THREE.Material | THREE.Material[],
    disposeTextures: boolean,
): void {
    const materials = Array.isArray(material) ? material : [material];

    for (const mat of materials) {
        if (!mat)
            continue;

        // Dispose textures if requested
        if (disposeTextures) {
            disposeTexturesFromMaterial(mat);
        }

        mat.dispose();
    }
}

/**
 * Dispose all textures from a material
 */
function disposeTexturesFromMaterial(material: THREE.Material): void {
    // Common texture properties across material types
    const textureProps = [
        'map',
        'lightMap',
        'bumpMap',
        'normalMap',
        'specularMap',
        'envMap',
        'alphaMap',
        'aoMap',
        'displacementMap',
        'emissiveMap',
        'gradientMap',
        'metalnessMap',
        'roughnessMap',
        'clearcoatMap',
        'clearcoatNormalMap',
        'clearcoatRoughnessMap',
        'transmissionMap',
        'thicknessMap',
    ] as const;

    for (const prop of textureProps) {
        const texture = (material as any)[prop];
        if (texture instanceof THREE.Texture) {
            texture.dispose();
        }
    }
}

/**
 * Dispose a render target and its texture
 */
export function disposeRenderTarget(renderTarget: THREE.WebGLRenderTarget | null): void {
    if (!renderTarget)
        return;

    renderTarget.texture?.dispose();
    renderTarget.dispose();
}

/**
 * Remove an object from its parent and dispose all its resources
 */
export function removeAndDispose(
    obj: THREE.Object3D,
    disposeMaterials: boolean = true,
    disposeTextures: boolean = true,
): void {
    // Remove from parent
    obj.parent?.remove(obj);

    // Dispose resources
    disposeObject3D(obj, disposeMaterials, disposeTextures);
}
