// 1-bit Chimera Void - Run Stats Collector
// Non-invasive runtime behavior sampling for state snapshot generation

import { RoomType } from '../world/RoomConfig';

/**
 * Raw runtime statistics collected during a run
 */
export interface RunStats {
    duration: number;           // Total seconds
    samples: number;            // Number of recorded data points

    // Flower/Light
    flowerIntensitySum: number;

    // Gaze (Sky Eye)
    gazeEvents: number;         // Number of times looked at eye
    gazeTimeTotal: number;      // Total seconds looking
    gazeDepthMax: number;       // Maximum pitch angle reached

    // Position/Room
    roomTime: Record<string, number>; // Time spent in each mental state room
    currentRoom: RoomType | null;
    onCrackTime: number;        // Time spent in "neutral zone" (FORCED_ALIGNMENT)
    xPositionSum: number;
    xPositionMin: number;
    xPositionMax: number;

    // Override/Resistance
    overrideAttempts: number;
    overrideSuccesses: number;
    overrideTimeTotal: number;
}

/**
 * Normalized metrics (0-1 range) for tag generation
 */
export interface NormalizedMetrics {
    avgFlower: number;          // 0-1
    gazeRatio: number;          // 0-1
    overrideRatio: number;      // 0-1
    roomRatios: Record<string, number>; // { INFO: 0-1, FORCED: 0-1, etc. }
    crackRatio: number;         // 0-1
    spreadX: number;            // 0-? (absolute distance)
}

/**
 * Behavior tags derived from normalized metrics
 */
export type BehaviorTag =
    | 'QUIET_LIGHT'
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
 * Collects and processes runtime statistics
 */
export class RunStatsCollector {
    private stats: RunStats;
    private sampleTimer: number = 0;
    private sampleInterval: number = 2.0; // Sample every 2 seconds
    private wasGazingLastFrame: boolean = false;
    private wasOverrideActiveLastFrame: boolean = false;

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
        isGlitchingFromOverride: boolean
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

        // Track time on crack (neutral zone in FORCED_ALIGNMENT)
        if (Math.abs(playerX) < 5.0 && currentRoom === RoomType.FORCED_ALIGNMENT) {
            this.stats.onCrackTime += deltaTime;
        }

        // Track override
        if (isOverrideActive && !this.wasOverrideActiveLastFrame) {
            this.stats.overrideAttempts++;
        }
        if (isOverrideActive) {
            this.stats.overrideTimeTotal += deltaTime;
            if (isGlitchingFromOverride) {
                this.stats.overrideSuccesses++;
            }
        }

        this.wasGazingLastFrame = isGazing;
        this.wasOverrideActiveLastFrame = isOverrideActive;
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
            roomRatios,
            crackRatio,
            spreadX,
        };
    }

    /**
     * Generate behavior tags from normalized metrics
     */
    generateTags(): BehaviorTag[] {
        const metrics = this.normalize();
        const tags: BehaviorTag[] = [];

        // Light intensity tags
        if (metrics.avgFlower < 0.25) {
            tags.push('QUIET_LIGHT');
        } else if (metrics.avgFlower < 0.6) {
            tags.push('MEDIUM_LIGHT');
        } else {
            tags.push('LOUD_LIGHT');
        }

        // Gaze relationship tags
        if (metrics.gazeRatio > 0.5) {
            tags.push('HIGH_GAZE');
        } else if (metrics.gazeRatio < 0.15) {
            tags.push('LOW_GAZE');
        }

        // Room dominance tag
        const dominantRoom = Object.entries(metrics.roomRatios)
            .reduce((a, b) => (a[1] > b[1] ? a : b), ['', 0])[0];

        const roomTagMap: Record<string, BehaviorTag> = {
            [RoomType.INFO_OVERFLOW]: 'INFO_MAZE',
            [RoomType.FORCED_ALIGNMENT]: 'CRACK_WALKER',
            [RoomType.IN_BETWEEN]: 'INBETWEENER',
            [RoomType.POLARIZED]: 'BINARY_EDGE',
        };

        if (dominantRoom && roomTagMap[dominantRoom]) {
            tags.push(roomTagMap[dominantRoom]);
        }

        // Position tags
        if (metrics.crackRatio > 0.3) {
            tags.push('NEUTRAL_SEEKER');
        }

        // Resistance tag
        if (metrics.overrideRatio > 0.05) {
            tags.push('RESISTER');
        }

        return tags;
    }

    /**
     * Get run duration in seconds
     */
    getDuration(): number {
        return this.stats.duration;
    }
}
