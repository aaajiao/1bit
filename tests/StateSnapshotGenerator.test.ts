import type { BehaviorTag } from '../src/stats/RunStatsCollector';
import { beforeEach, describe, expect, it } from 'vitest';
import { StateSnapshotGenerator } from '../src/stats/StateSnapshotGenerator';

// Every tag that carries observational text (the TEXT_TABLE keys).
const TEXT_TAGS: BehaviorTag[] = [
    'QUIET_LIGHT',
    'MEDIUM_LIGHT',
    'LOUD_LIGHT',
    'HIGH_GAZE',
    'LOW_GAZE',
    'INFO_MAZE',
    'CRACK_WALKER',
    'NEUTRAL_SEEKER',
    'INBETWEENER',
    'BINARY_EDGE',
    'RESISTER',
];

describe('stateSnapshotGenerator', () => {
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
            expect(snapshot.textEn).toBeDefined();
            expect(snapshot.textEn.length).toBeGreaterThan(0);
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
            expect(result.textEn.length).toBeGreaterThan(0);
            expect(result.key).toBe('QUIET_LIGHT');
        });

        it('should return a zh/en pair from the same variant', () => {
            // Run enough times to hit both variants; every returned pair must
            // be one of the table entries (zh and en never cross variants).
            for (let i = 0; i < 50; i++) {
                const result = generator.getTextFromTags(['LOUD_LIGHT']);
                const variants = generator.getTextsForTag('LOUD_LIGHT');
                const match = variants.find(v => v.zh === result.text);
                expect(match).toBeDefined();
                expect(result.textEn).toBe(match!.en);
            }
        });

        it('should return a bilingual fallback for tags without text', () => {
            // No priority tag present -> fallback line, both languages non-empty.
            const result = generator.getTextFromTags([]);
            expect(result.text.length).toBeGreaterThan(0);
            expect(result.textEn.length).toBeGreaterThan(0);
            expect(result.key).toBe('MEDIUM_LIGHT');
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
        it('should return array of bilingual pairs for valid tag', () => {
            const texts = generator.getTextsForTag('QUIET_LIGHT');
            expect(Array.isArray(texts)).toBe(true);
            expect(texts.length).toBeGreaterThan(0);
            expect(typeof texts[0].zh).toBe('string');
            expect(typeof texts[0].en).toBe('string');
        });

        it('should return empty array for unknown tag', () => {
            const texts = generator.getTextsForTag('UNKNOWN_TAG' as BehaviorTag);
            expect(texts).toEqual([]);
        });

        it('every text tag has at least one non-empty zh/en pair per variant', () => {
            for (const tag of TEXT_TAGS) {
                const variants = generator.getTextsForTag(tag);
                expect(variants.length).toBeGreaterThan(0);
                for (const v of variants) {
                    expect(v.zh.length).toBeGreaterThan(0);
                    expect(v.en.length).toBeGreaterThan(0);
                }
            }
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
