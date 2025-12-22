// 1-bit Chimera Void - Utility Functions

/**
 * Pseudo-random hash function for procedural generation
 * Based on sine wave with magic numbers for good distribution
 * @param x - First seed value
 * @param z - Second seed value
 * @returns Value between 0 and 1
 */
export function hash(x: number, z: number): number {
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return n - Math.floor(n);
}
