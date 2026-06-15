// 1-bit Chimera Void - State Snapshot Generator
// Generates end-of-run visual patterns and observational text based on player behavior

import type { BehaviorTag, NormalizedMetrics } from './RunStatsCollector';

/**
 * A single observational line in both languages. Chinese (`zh`) is the
 * primary surface; English (`en`) is the secondary line shown beneath it.
 */
export interface BilingualText {
    zh: string;
    en: string;
}

/**
 * Shader uniforms for pattern generation
 */
export interface PatternUniforms {
    uPatternMode: number; // 0: noise, 1: stripes, 2: checker, 3: radial
    uDensity: number; // Fill density (0-1)
    uFrequency: number; // Pattern frequency
    uPhase: number; // Offset/rotation
}

/**
 * State snapshot result
 */
export interface StateSnapshot {
    tags: BehaviorTag[];
    pattern: PatternUniforms;
    /** Observational line, primary surface (Chinese). */
    text: string;
    /** Observational line, secondary surface (English) — paired with `text`. */
    textEn: string;
    textKey: string; // For localization lookup
    /**
     * Play-time seconds of the run this snapshot settled (F6 share-card
     * footer). Stamped by StatsSunsetUpdater (the generator only sees
     * normalized metrics); optional — snapshots persisted before F6 and
     * generator outputs carry none.
     */
    durationSeconds?: number;
}

/**
 * Text table for observational messages (Yang Edward style).
 * Each entry is a bilingual pair: `zh` is the primary line, `en` the secondary.
 */
const TEXT_TABLE: Record<BehaviorTag, BilingualText[]> = {
    QUIET_LIGHT: [
        { zh: '自己调暗一点，世界就安静了一点。', en: 'you turned yourself down a little, and the world went quieter' },
        { zh: '让光保持很低，这似乎有帮助。', en: 'you kept the light low, it seemed to help' },
    ],
    MEDIUM_LIGHT: [
        { zh: '找到了一个折中方案，虽然它从来没感觉过完全对。', en: 'you settled somewhere in the middle, it never quite felt right' },
    ],
    LOUD_LIGHT: [
        { zh: '就算没人开口，你还是把光开得很亮。', en: 'you kept the light loud, even when no one asked you to' },
        { zh: '把它开得越亮，看着就越疼。', en: 'the brighter you turned it, the more it hurt to look' },
    ],
    HIGH_GAZE: [
        { zh: '这一趟，你大部分时间都在抬头看。', en: 'you spent most of this walk looking up' },
        { zh: '那只眼睛总在那儿，你停不下来确认。', en: 'the eye was always there, and you kept checking' },
    ],
    LOW_GAZE: [
        { zh: '很少去确认，那只眼睛还在不在。', en: 'you rarely glanced up to check the eye was still there' },
        { zh: '大多把视线放在地上。', en: 'you kept your eyes mostly on the ground' },
    ],
    INFO_MAZE: [
        { zh: '走过很多信号，却没遇到多少回答。', en: 'so many signals, so few answers' },
        { zh: '试图看得越多，理解得越少。', en: 'the more you tried to see, the less you understood' },
    ],
    CRACK_WALKER: [
        { zh: '裂缝上待的时间，比大多数人久一点。', en: 'you stayed on the cracks a little longer than most' },
        { zh: '中间总是最难站的地方。', en: 'the middle was always the hardest place to stand' },
    ],
    NEUTRAL_SEEKER: [
        { zh: '更喜欢没什么确定的地方。', en: 'you liked the places where nothing was certain' },
    ],
    INBETWEENER: [
        { zh: '总是走进一些，不太算是谁的地方。', en: 'you kept ending up in places that belonged to no one' },
        { zh: '不管你去哪儿，你总是被误读。', en: 'wherever you went, you were read wrong' },
    ],
    BINARY_EDGE: [
        { zh: '一直走到一个地方，那里所有事都只能是这样或那样。', en: 'you walked all the way to where things could only be one or the other' },
        { zh: '在纯黑白中，没有呼吸的空间。', en: 'in pure black and white, there was no room to breathe' },
    ],
    RESISTER: [
        { zh: '有一次把画面弄坏了，它后来恢复了，但已经不太一样。', en: 'you broke the picture once, it came back, but not the same' },
        { zh: '试着说不，一瞬间，世界听了。', en: 'you tried saying no, and for a moment, the world listened' },
    ],
};

/** Bilingual fallback line when no priority tag carries text. */
const FALLBACK_TEXT: BilingualText = {
    zh: '你走过了这片风景，没有留下太多痕迹。',
    en: 'you passed through here, and left little behind',
};

/**
 * Generates state snapshots from behavior tags
 */
export class StateSnapshotGenerator {
    /**
     * Generate pattern uniforms from behavior tags
     */
    getPatternFromTags(tags: BehaviorTag[]): PatternUniforms {
        let patternMode = 0;
        let density = 0.5;
        let frequency = 8.0;
        let phase = 0.0;

        // Primary environment tag determines base pattern
        if (tags.includes('INFO_MAZE')) {
            patternMode = 0; // Noise
            frequency = 16.0; // High frequency for "chaotic" feel
            density = 0.7;
        }
        else if (tags.includes('CRACK_WALKER')) {
            patternMode = 1; // Stripes
            frequency = 12.0;
            phase = Math.PI / 2; // Vertical stripes
        }
        else if (tags.includes('INBETWEENER')) {
            patternMode = 2; // Checkerboard
            frequency = 10.0;
            density = 0.6;
        }
        else if (tags.includes('BINARY_EDGE')) {
            patternMode = 3; // Radial
            frequency = 10.0;
            phase = Math.random() * Math.PI * 2;
        }

        // Secondary light tag modifies density
        if (tags.includes('QUIET_LIGHT')) {
            density -= 0.2; // Sparser pattern
        }
        else if (tags.includes('LOUD_LIGHT')) {
            density += 0.2; // Denser pattern
        }

        // Resistance tag adds chaos
        if (tags.includes('RESISTER')) {
            frequency *= 1.5;
            density += 0.1;
        }

        return {
            uPatternMode: patternMode,
            uDensity: Math.max(0.1, Math.min(0.9, density)),
            uFrequency: frequency,
            uPhase: phase,
        };
    }

    /**
     * Select observational text from tags
     */
    getTextFromTags(tags: BehaviorTag[]): { text: string; textEn: string; key: BehaviorTag } {
        // Priority order for text selection
        const priority: BehaviorTag[] = [
            'RESISTER', // Resistance is most notable
            'HIGH_GAZE',
            'LOW_GAZE',
            'INFO_MAZE',
            'CRACK_WALKER',
            'INBETWEENER',
            'BINARY_EDGE',
            'NEUTRAL_SEEKER',
            'LOUD_LIGHT',
            'QUIET_LIGHT',
            'MEDIUM_LIGHT',
        ];

        // Find first matching tag with text — pick one variant, return the
        // zh/en of that same variant so the pair never crosses lines.
        for (const tag of priority) {
            if (tags.includes(tag)) {
                const texts = TEXT_TABLE[tag];
                const pick = texts[Math.floor(Math.random() * texts.length)];
                return { text: pick.zh, textEn: pick.en, key: tag };
            }
        }

        // Fallback (key stays MEDIUM_LIGHT for backward-compatible textKey).
        return {
            text: FALLBACK_TEXT.zh,
            textEn: FALLBACK_TEXT.en,
            key: 'MEDIUM_LIGHT',
        };
    }

    /**
     * Generate complete state snapshot
     */
    generate(tags: BehaviorTag[]): StateSnapshot {
        const pattern = this.getPatternFromTags(tags);
        const { text, textEn, key } = this.getTextFromTags(tags);

        return {
            tags,
            pattern,
            text,
            textEn,
            textKey: key,
        };
    }

    /**
     * Generate snapshot from normalized metrics
     */
    generateFromMetrics(metrics: NormalizedMetrics, tags: BehaviorTag[]): StateSnapshot {
        // Use metrics to further customize pattern
        const pattern = this.getPatternFromTags(tags);

        // Adjust pattern based on specific metrics
        pattern.uDensity = Math.max(0.1, Math.min(0.9, pattern.uDensity + (metrics.avgFlower - 0.5) * 0.2,
        ));

        // More gaze = faster animation (via phase)
        if (metrics.gazeRatio > 0.3) {
            pattern.uPhase += metrics.gazeRatio * Math.PI;
        }

        // Wide exploration = more complex pattern
        if (metrics.spreadX > 50) {
            pattern.uFrequency *= 1.2;
        }

        const { text, textEn, key } = this.getTextFromTags(tags);

        return {
            tags,
            pattern,
            text,
            textEn,
            textKey: key,
        };
    }

    /**
     * Get all available text entries for a tag (bilingual pairs).
     */
    getTextsForTag(tag: BehaviorTag): BilingualText[] {
        return TEXT_TABLE[tag] || [];
    }

    /**
     * Get pattern mode name for debugging
     */
    getPatternModeName(mode: number): string {
        const names = ['noise', 'stripes', 'checker', 'radial'];
        return names[mode] || 'unknown';
    }
}
