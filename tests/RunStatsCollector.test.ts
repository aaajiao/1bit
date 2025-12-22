import { describe, it, expect, beforeEach } from 'vitest';
import { RunStatsCollector, type BehaviorTag } from '../src/stats/RunStatsCollector';
import { RoomType } from '../src/world/RoomConfig';

describe('RunStatsCollector', () => {
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

        it('should generate RESISTER when override is used', () => {
            // Override for more than 5% of time
            collector.update(1.0, 0.5, false, 0, null, 0, true, false);
            collector.update(10.0, 0.5, false, 0, null, 0, false, false);

            const tags = collector.generateTags();
            expect(tags).toContain('RESISTER');
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
});
