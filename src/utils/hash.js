// 1-bit Chimera Void - Utility Functions

/**
 * Pseudo-random hash function for procedural generation
 * Based on sine wave with magic numbers for good distribution
 * @param {number} x - First seed value
 * @param {number} z - Second seed value
 * @returns {number} Value between 0 and 1
 */
export function hash(x, z) {
    let n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return n - Math.floor(n);
}
