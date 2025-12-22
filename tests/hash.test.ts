import { describe, it, expect } from 'vitest';
import { hash } from '../src/utils/hash';

describe('hash', () => {
    it('should return a value between 0 and 1', () => {
        const result = hash(123, 456);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(1);
    });

    it('should be deterministic for the same inputs', () => {
        const result1 = hash(10, 20);
        const result2 = hash(10, 20);
        expect(result1).toBe(result2);
    });

    it('should produce different values for different inputs', () => {
        const result1 = hash(1, 2);
        const result2 = hash(3, 4);
        expect(result1).not.toBe(result2);
    });

    it('should handle negative inputs', () => {
        const result = hash(-10, -20);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(1);
    });

    it('should handle zero inputs', () => {
        const result = hash(0, 0);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(1);
    });

    it('should produce good distribution', () => {
        // Test that different coordinates produce varied results
        const values = new Set<number>();
        for (let x = 0; x < 10; x++) {
            for (let z = 0; z < 10; z++) {
                values.add(Math.floor(hash(x, z) * 100));
            }
        }
        // Should have reasonable spread (at least 30 different buckets out of 100)
        expect(values.size).toBeGreaterThan(30);
    });
});
