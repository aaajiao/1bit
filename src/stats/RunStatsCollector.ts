// 1-bit Chimera Void - Run Stats Collector
// Non-invasive runtime behavior sampling for state snapshot generation

import type { BehaviorProfile } from '../world/RoomConfig';
import { GAMEPLAY, LIVE_PROFILE, TAG_THRESHOLDS } from '../config';
import { riftLineXForWorldX, RoomType } from '../world/RoomConfig';

/**
 * Raw runtime statistics collected during a run
 */
export interface RunStats {
    duration: number; // Total seconds
    samples: number; // Number of recorded data points

    // Flower/Light
    flowerIntensitySum: number;

    // Gaze (Sky Eye)
    gazeEvents: number; // Number of times looked at eye
    gazeTimeTotal: number; // Total seconds looking
    gazeDepthMax: number; // Maximum pitch angle reached

    // Position/Room
    roomTime: Record<string, number>; // Time spent in each mental state room
    currentRoom: RoomType | null;
    onCrackTime: number; // Time spent in "neutral zone" (FORCED_ALIGNMENT)
    xPositionSum: number;
    xPositionMin: number;
    xPositionMax: number;

    // Override/Resistance
    overrideAttempts: number;
    overrideSuccesses: number;
    overrideTimeTotal: number;
}

/**
 * Normalized metrics for tag generation (0-1 ratios unless noted as raw)
 */
export interface NormalizedMetrics {
    avgFlower: number; // 0-1
    gazeRatio: number; // 0-1
    overrideRatio: number; // 0-1
    overrideSuccesses: number; // Raw count (not a ratio)
    roomRatios: Record<string, number>; // { INFO: 0-1, FORCED: 0-1, etc. }
    crackRatio: number; // 0-1
    spreadX: number; // 0-? (absolute distance)
}

/**
 * Behavior tags derived from normalized metrics
 */
export type BehaviorTag
    = | 'QUIET_LIGHT'
        | 'MEDIUM_LIGHT'
        | 'LOUD_LIGHT'
        | 'HIGH_GAZE'
        | 'LOW_GAZE'
        | 'INFO_MAZE'
        | 'CRACK_WALKER'
        | 'INBETWEENER'
        | 'BINARY_EDGE'
        | 'NEUTRAL_SEEKER'
        | 'RESISTER';

/**
 * Maps a dominant room type to its behavior tag.
 * Module-level constant so generateTags() does not reallocate it every call.
 * Exported so the share card (F6) can invert it (tag -> room duotone accent)
 * without duplicating the mapping.
 */
export const ROOM_TAG_MAP: Record<string, BehaviorTag> = {
    [RoomType.INFO_OVERFLOW]: 'INFO_MAZE',
    [RoomType.FORCED_ALIGNMENT]: 'CRACK_WALKER',
    [RoomType.IN_BETWEEN]: 'INBETWEENER',
    [RoomType.POLARIZED]: 'BINARY_EDGE',
};

/**
 * Collects and processes runtime statistics
 */
export class RunStatsCollector {
    private stats: RunStats;
    private sampleTimer: number = 0;
    private sampleInterval: number = 2.0; // Sample every 2 seconds
    private wasGazingLastFrame: boolean = false;
    private wasOverrideActiveLastFrame: boolean = false;
    private wasGlitchingLastFrame: boolean = false;

    constructor() {
        this.stats = this.createEmptyStats();
    }

    /**
     * Create empty stats object
     */
    private createEmptyStats(): RunStats {
        return {
            duration: 0,
            samples: 0,
            flowerIntensitySum: 0,
            gazeEvents: 0,
            gazeTimeTotal: 0,
            gazeDepthMax: 0,
            roomTime: {},
            currentRoom: null,
            onCrackTime: 0,
            xPositionSum: 0,
            xPositionMin: Infinity,
            xPositionMax: -Infinity,
            overrideAttempts: 0,
            overrideSuccesses: 0,
            overrideTimeTotal: 0,
        };
    }

    /**
     * Reset stats for a new run
     */
    reset(): void {
        this.stats = this.createEmptyStats();
        this.sampleTimer = 0;
        this.wasGazingLastFrame = false;
        this.wasOverrideActiveLastFrame = false;
        this.wasGlitchingLastFrame = false;
    }

    /**
     * Update stats each frame
     */
    update(
        deltaTime: number,
        flowerIntensity: number,
        isGazing: boolean,
        gazePitch: number,
        currentRoom: RoomType | null,
        playerX: number,
        isOverrideActive: boolean,
        isGlitchingFromOverride: boolean,
    ): void {
        this.stats.duration += deltaTime;

        // Sample periodic data
        this.sampleTimer += deltaTime;
        if (this.sampleTimer > this.sampleInterval) {
            this.stats.samples++;
            this.stats.flowerIntensitySum += flowerIntensity;
            this.sampleTimer = 0;
        }

        // Event-based gaze tracking
        if (isGazing && !this.wasGazingLastFrame) {
            this.stats.gazeEvents++;
        }
        if (isGazing) {
            this.stats.gazeTimeTotal += deltaTime;
            this.stats.gazeDepthMax = Math.max(this.stats.gazeDepthMax, gazePitch);
        }

        // Track room type
        if (currentRoom !== null) {
            this.stats.currentRoom = currentRoom;
            this.stats.roomTime[currentRoom] = (this.stats.roomTime[currentRoom] || 0) + deltaTime;
        }

        // Track position
        this.stats.xPositionSum += playerX;
        this.stats.xPositionMin = Math.min(this.stats.xPositionMin, playerX);
        this.stats.xPositionMax = Math.max(this.stats.xPositionMax, playerX);

        // Track time on crack (neutral zone in FORCED_ALIGNMENT). The crack
        // is the cluster's rift line (riftLineXForWorldX, the single source
        // of the crack base point) — NOT the world origin x=0, which no rift
        // ever passes through.
        if (
            Math.abs(playerX - riftLineXForWorldX(playerX)) < 5.0
            && currentRoom === RoomType.FORCED_ALIGNMENT
        ) {
            this.stats.onCrackTime += deltaTime;
        }

        // Track override
        if (isOverrideActive && !this.wasOverrideActiveLastFrame) {
            this.stats.overrideAttempts++;
        }
        if (isOverrideActive) {
            this.stats.overrideTimeTotal += deltaTime;
        }
        // Edge-detect the glitch (success) so it counts once per attempt,
        // consistent with overrideAttempts, instead of once per frame.
        if (isGlitchingFromOverride && !this.wasGlitchingLastFrame) {
            this.stats.overrideSuccesses++;
        }

        this.wasGazingLastFrame = isGazing;
        this.wasOverrideActiveLastFrame = isOverrideActive;
        this.wasGlitchingLastFrame = isGlitchingFromOverride;
    }

    /**
     * Get raw stats
     */
    getStats(): RunStats {
        return { ...this.stats };
    }

    /**
     * Normalize raw stats to 0-1 metrics
     */
    normalize(): NormalizedMetrics {
        const s = this.stats;
        const duration = Math.max(s.duration, 1); // Avoid division by zero

        const avgFlower = s.samples > 0 ? s.flowerIntensitySum / s.samples : 0.5;
        const gazeRatio = s.gazeTimeTotal / duration;
        const overrideRatio = s.overrideTimeTotal / duration;

        // Room ratios
        const roomRatios: Record<string, number> = {};
        for (const [room, time] of Object.entries(s.roomTime)) {
            roomRatios[room] = time / duration;
        }

        // Position spread
        const spreadX = s.xPositionMax === -Infinity
            ? 0
            : (s.xPositionMax - s.xPositionMin) / 2;

        const crackRatio = s.onCrackTime / duration;

        return {
            avgFlower,
            gazeRatio,
            overrideRatio,
            overrideSuccesses: s.overrideSuccesses,
            roomRatios,
            crackRatio,
            spreadX,
        };
    }

    /**
     * Generate behavior tags from normalized metrics. All cut points live in
     * config/TAG_THRESHOLDS (single source of truth, shared with the
     * LIVE_PROFILE saturation knobs).
     */
    generateTags(): BehaviorTag[] {
        const metrics = this.normalize();
        const tags: BehaviorTag[] = [];

        // Light intensity tags
        if (metrics.avgFlower < TAG_THRESHOLDS.QUIET_LIGHT_MAX_FLOWER) {
            tags.push('QUIET_LIGHT');
        }
        else if (metrics.avgFlower < TAG_THRESHOLDS.MEDIUM_LIGHT_MAX_FLOWER) {
            tags.push('MEDIUM_LIGHT');
        }
        else {
            tags.push('LOUD_LIGHT');
        }

        // Gaze relationship tags
        if (metrics.gazeRatio > TAG_THRESHOLDS.HIGH_GAZE_MIN_RATIO) {
            tags.push('HIGH_GAZE');
        }
        else if (metrics.gazeRatio < TAG_THRESHOLDS.LOW_GAZE_MAX_RATIO) {
            tags.push('LOW_GAZE');
        }

        // Room dominance tag
        const dominantRoom = Object.entries(metrics.roomRatios)
            .reduce((a, b) => (a[1] > b[1] ? a : b), ['', 0])[0];

        if (dominantRoom && ROOM_TAG_MAP[dominantRoom]) {
            tags.push(ROOM_TAG_MAP[dominantRoom]);
        }

        // Position tags
        if (metrics.crackRatio > TAG_THRESHOLDS.NEUTRAL_SEEKER_MIN_CRACK_RATIO) {
            tags.push('NEUTRAL_SEEKER');
        }

        // Resistance tag: a single successful override counts, regardless of hold ratio
        if (
            metrics.overrideSuccesses >= TAG_THRESHOLDS.RESISTER_MIN_SUCCESSES
            || metrics.overrideRatio > TAG_THRESHOLDS.RESISTER_MIN_OVERRIDE_RATIO
        ) {
            tags.push('RESISTER');
        }

        return tags;
    }

    /**
     * Live, lightweight normalized behavior profile of the run so far (F1
     * "the world reads you"), computed on the fly from already-collected
     * fields — no new sampling. Returns null while the profile has not yet
     * formed (duration < LIVE_PROFILE.MIN_DURATION), so boot-time generation
     * and the spawn scan stay exactly neutral. Consumed (low frequency) by
     * the room ledger via RoomConfig.biasedRoomWeights.
     */
    getLiveProfile(): BehaviorProfile | null {
        const s = this.stats;
        if (s.duration < LIVE_PROFILE.MIN_DURATION)
            return null;

        const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
        return {
            // Same default as normalize(): 0.5 (the flower's boot intensity,
            // inside the bias deadzone) until the first 2s sample lands.
            avgFlower: clamp01(s.samples > 0 ? s.flowerIntensitySum / s.samples : 0.5),
            gazeRatio: clamp01(s.gazeTimeTotal / s.duration),
            overrideActivity: clamp01(
                s.overrideTimeTotal / s.duration / LIVE_PROFILE.OVERRIDE_SATURATION,
            ),
            crackAffinity: clamp01(
                s.onCrackTime / s.duration / LIVE_PROFILE.CRACK_SATURATION,
            ),
        };
    }

    /**
     * Whether this run has accumulated enough play time for a sunset snapshot.
     * Runs below the threshold (e.g. a sunset landing right after entry) skip
     * the snapshot and roll silently into the next run cycle.
     */
    hasMinimumSnapshotDuration(): boolean {
        return this.stats.duration >= GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT;
    }

    /**
     * Get run duration in seconds
     */
    getDuration(): number {
        return this.stats.duration;
    }
}
