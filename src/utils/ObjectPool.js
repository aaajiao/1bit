// 1-bit Chimera Void - Object Pool for Vector3
import * as THREE from 'three';

/**
 * Object Pool to avoid per-frame allocations
 */
export class Vector3Pool {
    constructor(size = 50) {
        this.pool = [];
        this.index = 0;
        for (let i = 0; i < size; i++) {
            this.pool.push(new THREE.Vector3());
        }
    }

    /**
     * Get a Vector3 from the pool (reuses cyclically)
     * @returns {THREE.Vector3}
     */
    get() {
        const vec = this.pool[this.index];
        this.index = (this.index + 1) % this.pool.length;
        return vec;
    }

    /**
     * Reset pool index (call at start of frame)
     */
    reset() {
        this.index = 0;
    }
}

// Singleton instance for global use
export const vec3Pool = new Vector3Pool(100);
