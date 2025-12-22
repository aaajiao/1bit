import { describe, it, expect, beforeEach } from 'vitest';
import { StateSnapshotGenerator } from '../src/stats/StateSnapshotGenerator';
import type { BehaviorTag } from '../src/stats/RunStatsCollector';

describe('StateSnapshotGenerator', () => {
    let generator: StateSnapshotGenerator;

    beforeEach(() => {
        generator = new StateSnapshotGenerator();
    });

    describe('generate', () => {
        it('should generate a snapshot with pattern and text', () => {
            const tags: BehaviorTag[] = ['QUIET_LIGHT', 'LOW_GAZE'];
            const snapshot = generator.generate(tags);

            expect(snapshot.tags).toEqual(tags);
            expect(snapshot.pattern).toBeDefined();
            expect(snapshot.text).toBeDefined();
            expect(snapshot.text.length).toBeGreaterThan(0);
        });

        it('should return pattern with valid uniforms', () => {
            const snapshot = generator.generate(['MEDIUM_LIGHT']);

            expect(snapshot.pattern.uPatternMode).toBeGreaterThanOrEqual(0);
            expect(snapshot.pattern.uPatternMode).toBeLessThanOrEqual(3);
            expect(snapshot.pattern.uDensity).toBeGreaterThanOrEqual(0);
            expect(snapshot.pattern.uDensity).toBeLessThanOrEqual(1);
            expect(snapshot.pattern.uFrequency).toBeGreaterThan(0);
        });

        it('should handle empty tags gracefully', () => {
            const snapshot = generator.generate([]);

            expect(snapshot.tags).toEqual([]);
            expect(snapshot.pattern).toBeDefined();
            // Text might be empty or default
        });
    });

    describe('getPatternFromTags', () => {
        it('should return noise pattern for QUIET_LIGHT', () => {
            const pattern = generator.getPatternFromTags(['QUIET_LIGHT']);
            expect(pattern.uPatternMode).toBe(0); // Noise
            expect(pattern.uDensity).toBeLessThan(0.5);
        });

        it('should return high density for LOUD_LIGHT', () => {
            const pattern = generator.getPatternFromTags(['LOUD_LIGHT']);
            expect(pattern.uDensity).toBeGreaterThan(0.5);
        });

        it('should return default noise pattern for gaze-only tag', () => {
            // HIGH_GAZE alone doesn't set a specific pattern mode, defaults to 0 (noise)
            const pattern = generator.getPatternFromTags(['HIGH_GAZE']);
            expect(pattern.uPatternMode).toBe(0); // Default noise
        });

        it('should return radial pattern for BINARY_EDGE', () => {
            const pattern = generator.getPatternFromTags(['BINARY_EDGE']);
            expect(pattern.uPatternMode).toBe(3); // Radial (not grid)
        });
    });

    describe('getTextFromTags', () => {
        it('should return text for known tags', () => {
            const result = generator.getTextFromTags(['QUIET_LIGHT']);
            expect(result.text.length).toBeGreaterThan(0);
            expect(result.key).toBe('QUIET_LIGHT');
        });

        it('should prioritize behavioral tags over light tags', () => {
            // RESISTER should be prioritized over QUIET_LIGHT
            const result = generator.getTextFromTags(['QUIET_LIGHT', 'RESISTER']);
            expect(result.key).toBe('RESISTER');
        });

        it('should handle unknown tag combinations', () => {
            const result = generator.getTextFromTags(['MEDIUM_LIGHT', 'LOW_GAZE']);
            // Should still return something
            expect(result.text).toBeDefined();
        });
    });

    describe('getTextsForTag', () => {
        it('should return array of texts for valid tag', () => {
            const texts = generator.getTextsForTag('QUIET_LIGHT');
            expect(Array.isArray(texts)).toBe(true);
            expect(texts.length).toBeGreaterThan(0);
        });

        it('should return empty array for unknown tag', () => {
            const texts = generator.getTextsForTag('UNKNOWN_TAG' as BehaviorTag);
            expect(texts).toEqual([]);
        });
    });

    describe('getPatternModeName', () => {
        it('should return correct mode names', () => {
            expect(generator.getPatternModeName(0)).toBe('noise');
            expect(generator.getPatternModeName(1)).toBe('stripes');
            expect(generator.getPatternModeName(2)).toBe('checker');
            expect(generator.getPatternModeName(3)).toBe('radial');
        });

        it('should return unknown for invalid mode', () => {
            expect(generator.getPatternModeName(99)).toBe('unknown');
        });
    });
});
