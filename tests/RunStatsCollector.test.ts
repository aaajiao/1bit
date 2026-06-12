import { beforeEach, describe, expect, it } from 'vitest';
import { LIVE_PROFILE } from '../src/config';
import { RunStatsCollector } from '../src/stats/RunStatsCollector';
import { faSideAxisX, riftLineXForWorldX, RoomType } from '../src/world/RoomConfig';

// A FORCED_ALIGNMENT crack near the origin: the rift lines are the chunk
// COLUMN centers (riftLineXForWorldX) — one crack per 80m column.
const CRACK_X = riftLineXForWorldX(0);
// The cluster's semantic side axis — solid mid-floor between the two cracks.
const AXIS_X = faSideAxisX(0);

describe('runStatsCollector', () => {
    let collector: RunStatsCollector;

    beforeEach(() => {
        collector = new RunStatsCollector();
    });

    describe('initial state', () => {
        it('should start with zero duration', () => {
            expect(collector.getDuration()).toBe(0);
        });

        it('should return empty tags with no data', () => {
            const tags = collector.generateTags();
            // Should have at least one light tag
            expect(tags.length).toBeGreaterThan(0);
        });
    });

    describe('update', () => {
        it('should track duration', () => {
            collector.update(1.0, 0.5, false, 0, null, 0, false, false);
            expect(collector.getDuration()).toBe(1.0);

            collector.update(2.0, 0.5, false, 0, null, 0, false, false);
            expect(collector.getDuration()).toBe(3.0);
        });

        it('should track gaze events', () => {
            // Start gazing
            collector.update(0.1, 0.5, true, 0.5, null, 0, false, false);
            // Continue gazing (same event)
            collector.update(0.1, 0.5, true, 0.5, null, 0, false, false);
            // Stop gazing
            collector.update(0.1, 0.5, false, 0, null, 0, false, false);
            // Start gazing again (new event)
            collector.update(0.1, 0.5, true, 0.5, null, 0, false, false);

            const stats = collector.getStats();
            expect(stats.gazeEvents).toBe(2);
        });

        it('should track room time', () => {
            collector.update(5.0, 0.5, false, 0, RoomType.INFO_OVERFLOW, 0, false, false);
            collector.update(3.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, 0, false, false);

            const stats = collector.getStats();
            expect(stats.roomTime[RoomType.INFO_OVERFLOW]).toBe(5.0);
            expect(stats.roomTime[RoomType.FORCED_ALIGNMENT]).toBe(3.0);
        });

        it('should track position bounds', () => {
            collector.update(0.1, 0.5, false, 0, null, -100, false, false);
            collector.update(0.1, 0.5, false, 0, null, 50, false, false);
            collector.update(0.1, 0.5, false, 0, null, 200, false, false);

            const stats = collector.getStats();
            expect(stats.xPositionMin).toBe(-100);
            expect(stats.xPositionMax).toBe(200);
        });

        it('accumulates onCrackTime when standing on a rift line in FA', () => {
            // Within ±5m of the nearest physical rift line (riftLineXForWorldX).
            collector.update(2.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, CRACK_X - 2, false, false);
            collector.update(3.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, CRACK_X + 2, false, false);
            expect(collector.getStats().onCrackTime).toBe(5.0);
        });

        it('does NOT accumulate onCrackTime on the cluster side axis (solid floor between cracks)', () => {
            // The semantic axis is the midpoint between the two cracks — 40m
            // from either rift line, the farthest-from-a-crack point there is.
            expect(Math.abs(AXIS_X - riftLineXForWorldX(AXIS_X))).toBeGreaterThanOrEqual(5);
            collector.update(5.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, AXIS_X, false, false);
            expect(collector.getStats().onCrackTime).toBe(0);
        });

        it('does NOT accumulate onCrackTime on the rift line outside FORCED_ALIGNMENT', () => {
            collector.update(5.0, 0.5, false, 0, RoomType.IN_BETWEEN, CRACK_X, false, false);
            expect(collector.getStats().onCrackTime).toBe(0);
        });
    });

    describe('normalize', () => {
        it('should calculate avgFlower correctly', () => {
            // Simulate multiple samples (sample interval is 2s)
            for (let i = 0; i < 10; i++) {
                collector.update(2.1, 0.3, false, 0, null, 0, false, false);
            }

            const metrics = collector.normalize();
            expect(metrics.avgFlower).toBeCloseTo(0.3, 1);
        });

        it('should calculate gazeRatio correctly', () => {
            // 5 seconds total, 2 seconds gazing
            collector.update(2.0, 0.5, true, 0.5, null, 0, false, false);
            collector.update(3.0, 0.5, false, 0, null, 0, false, false);

            const metrics = collector.normalize();
            expect(metrics.gazeRatio).toBeCloseTo(0.4, 2);
        });

        it('should carry overrideSuccesses through to metrics', () => {
            // Two distinct glitch events (edge-detected)
            collector.update(0.1, 0.5, false, 0, null, 0, true, true);
            collector.update(0.1, 0.5, false, 0, null, 0, false, false);
            collector.update(0.1, 0.5, false, 0, null, 0, true, true);

            const metrics = collector.normalize();
            expect(metrics.overrideSuccesses).toBe(2);
        });
    });

    describe('generateTags', () => {
        it('should generate QUIET_LIGHT for low flower intensity', () => {
            // Fill with low intensity samples
            for (let i = 0; i < 5; i++) {
                collector.update(2.1, 0.1, false, 0, null, 0, false, false);
            }

            const tags = collector.generateTags();
            expect(tags).toContain('QUIET_LIGHT');
        });

        it('should generate LOUD_LIGHT for high flower intensity', () => {
            for (let i = 0; i < 5; i++) {
                collector.update(2.1, 0.9, false, 0, null, 0, false, false);
            }

            const tags = collector.generateTags();
            expect(tags).toContain('LOUD_LIGHT');
        });

        it('should generate HIGH_GAZE when gazing a lot', () => {
            // Gaze for more than 50% of time
            collector.update(6.0, 0.5, true, 0.5, null, 0, false, false);
            collector.update(4.0, 0.5, false, 0, null, 0, false, false);

            const tags = collector.generateTags();
            expect(tags).toContain('HIGH_GAZE');
        });

        it('should generate RESISTER when override hold exceeds 5% of run', () => {
            // Override held for more than 5% of time, no success registered
            collector.update(1.0, 0.5, false, 0, null, 0, true, false);
            collector.update(10.0, 0.5, false, 0, null, 0, false, false);

            const tags = collector.generateTags();
            expect(tags).toContain('RESISTER');
        });

        it('should generate RESISTER after a single success even with low hold ratio', () => {
            // One successful override (~1s hold) in a long run
            collector.update(1.0, 0.5, false, 0, null, 0, true, true);
            collector.update(120.0, 0.5, false, 0, null, 0, false, false);

            const metrics = collector.normalize();
            expect(metrics.overrideSuccesses).toBe(1);
            expect(metrics.overrideRatio).toBeLessThan(0.05);

            const tags = collector.generateTags();
            expect(tags).toContain('RESISTER');
        });

        it('should not generate RESISTER with zero successes and zero hold time', () => {
            collector.update(60.0, 0.5, false, 0, null, 0, false, false);

            const tags = collector.generateTags();
            expect(tags).not.toContain('RESISTER');
        });

        it('should generate INFO_MAZE for INFO_OVERFLOW room dominance', () => {
            collector.update(10.0, 0.5, false, 0, RoomType.INFO_OVERFLOW, 0, false, false);
            collector.update(2.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, 0, false, false);

            const tags = collector.generateTags();
            expect(tags).toContain('INFO_MAZE');
        });
    });

    describe('reset', () => {
        it('should reset all stats', () => {
            collector.update(5.0, 0.8, true, 0.5, RoomType.INFO_OVERFLOW, 100, true, true);
            collector.reset();

            expect(collector.getDuration()).toBe(0);
            expect(collector.getStats().gazeEvents).toBe(0);
            expect(collector.getStats().overrideAttempts).toBe(0);
        });
    });

    describe('getLiveProfile (F1 "the world reads you")', () => {
        it('returns null before the profile has formed (duration < MIN_DURATION)', () => {
            for (let i = 0; i < LIVE_PROFILE.MIN_DURATION - 1; i++) {
                collector.update(1.0, 0.8, true, 0.5, RoomType.FORCED_ALIGNMENT, 0, true, false);
            }
            expect(collector.getLiveProfile()).toBeNull();
        });

        it('forms a fully-saturated profile from a maximal run', () => {
            // 1s steps: gazing every frame, override held every frame, and
            // standing on the FORCED_ALIGNMENT crack line (the cluster rift).
            for (let i = 0; i < LIVE_PROFILE.MIN_DURATION + 5; i++) {
                collector.update(1.0, 0.9, true, 0.5, RoomType.FORCED_ALIGNMENT, CRACK_X, true, false);
            }
            const profile = collector.getLiveProfile();
            expect(profile).not.toBeNull();
            expect(profile!.avgFlower).toBeCloseTo(0.9, 5);
            expect(profile!.gazeRatio).toBeCloseTo(1, 5);
            expect(profile!.overrideActivity).toBe(1); // ratio 1 >> saturation
            expect(profile!.crackAffinity).toBe(1); // ratio 1 >> saturation
        });

        it('forms an all-quiet profile from a do-nothing run', () => {
            for (let i = 0; i < LIVE_PROFILE.MIN_DURATION + 5; i++) {
                collector.update(1.0, 0.5, false, 0, RoomType.IN_BETWEEN, 100, false, false);
            }
            const profile = collector.getLiveProfile();
            expect(profile).not.toBeNull();
            expect(profile!.avgFlower).toBeCloseTo(0.5, 5);
            expect(profile!.gazeRatio).toBe(0);
            expect(profile!.overrideActivity).toBe(0);
            expect(profile!.crackAffinity).toBe(0);
        });

        it('normalizes partial override/crack ratios against their saturation knobs', () => {
            // 2s of override hold + 6s on the crack across a 40s run:
            // overrideRatio 0.05 == saturation -> 1; crackRatio 0.15 -> 0.5.
            collector.update(2.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, CRACK_X, true, false);
            collector.update(4.0, 0.5, false, 0, RoomType.FORCED_ALIGNMENT, CRACK_X, false, false);
            collector.update(34.0, 0.5, false, 0, RoomType.IN_BETWEEN, 100, false, false);

            const profile = collector.getLiveProfile();
            expect(profile).not.toBeNull();
            expect(profile!.overrideActivity).toBeCloseTo(
                (2 / 40) / LIVE_PROFILE.OVERRIDE_SATURATION,
                5,
            );
            expect(profile!.crackAffinity).toBeCloseTo(
                (6 / 40) / LIVE_PROFILE.CRACK_SATURATION,
                5,
            );
        });

        it('keeps every field in [0, 1]', () => {
            for (let i = 0; i < 60; i++) {
                collector.update(1.0, 1.0, true, 1.5, RoomType.FORCED_ALIGNMENT, 0, true, true);
            }
            const profile = collector.getLiveProfile()!;
            for (const v of Object.values(profile)) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        });

        it('returns to null after reset (next run starts unformed)', () => {
            for (let i = 0; i < LIVE_PROFILE.MIN_DURATION + 5; i++) {
                collector.update(1.0, 0.5, false, 0, null, 0, false, false);
            }
            expect(collector.getLiveProfile()).not.toBeNull();
            collector.reset();
            expect(collector.getLiveProfile()).toBeNull();
        });
    });
});
