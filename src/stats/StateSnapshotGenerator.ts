// 1-bit Chimera Void - State Snapshot Generator
// Generates end-of-run visual patterns and observational text based on player behavior

import type { BehaviorTag, NormalizedMetrics } from './RunStatsCollector';

/**
 * Shader uniforms for pattern generation
 */
export interface PatternUniforms {
    uPatternMode: number;   // 0: noise, 1: stripes, 2: checker, 3: radial
    uDensity: number;       // Fill density (0-1)
    uFrequency: number;     // Pattern frequency
    uPhase: number;         // Offset/rotation
}

/**
 * State snapshot result
 */
export interface StateSnapshot {
    tags: BehaviorTag[];
    pattern: PatternUniforms;
    text: string;
    textKey: string;        // For localization lookup
}

/**
 * Text table for observational messages (Yang Edward style)
 */
const TEXT_TABLE: Record<BehaviorTag, string[]> = {
    QUIET_LIGHT: [
        "你把自己调暗一点，世界就安静了一点。",
        "你让光保持很低，这似乎有帮助。",
    ],
    MEDIUM_LIGHT: [
        "你找到了一个折中方案，虽然它从来没感觉过完全对。",
    ],
    LOUD_LIGHT: [
        "就算没人开口，你还是把光开得很亮。",
        "你把它开得越亮，看着就越疼。",
    ],
    HIGH_GAZE: [
        "这一趟，你大部分时间都在抬头看。",
        "那只眼睛总在那儿，你停不下来确认。",
    ],
    LOW_GAZE: [
        "你很少去确认，那只眼睛还在不在。",
        "你大多把视线放在地上。",
    ],
    INFO_MAZE: [
        "你走过很多信号，却没遇到多少回答。",
        "你试图看得越多，理解得越少。",
    ],
    CRACK_WALKER: [
        "你在裂缝上待的时间，比大多数人久一点。",
        "中间总是最难站的地方。",
    ],
    NEUTRAL_SEEKER: [
        "你更喜欢没什么确定的地方。",
    ],
    INBETWEENER: [
        "你总是走进一些，不太算是谁的地方。",
        "不管你去哪儿，你总是被误读。",
    ],
    BINARY_EDGE: [
        "你一直走到一个地方，那里所有事都只能是这样或那样。",
        "在纯黑白中，没有呼吸的空间。",
    ],
    RESISTER: [
        "你有一次把画面弄坏了，它后来恢复了，但已经不太一样。",
        "你试着说不，一瞬间，世界听了。",
    ],
};

/**
 * Pattern fragment shader code
 */
export const StateSnapshotShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec2 uResolution;
        uniform int uPatternMode;
        uniform float uDensity;
        uniform float uFrequency;
        uniform float uPhase;
        uniform float uTime;
        varying vec2 vUv;

        // Simplex noise helper
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);

            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));

            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
            vec2 uv = vUv;
            float pattern = 0.0;

            if (uPatternMode == 0) {
                // Noise: Perlin-like
                pattern = noise(uv * uFrequency + uTime * 0.1);
            } else if (uPatternMode == 1) {
                // Stripes: angled parallel lines
                pattern = sin((uv.x + uv.y * tan(uPhase)) * uFrequency) * 0.5 + 0.5;
            } else if (uPatternMode == 2) {
                // Checkerboard
                pattern = mod(floor(uv.x * uFrequency) + floor(uv.y * uFrequency), 2.0);
            } else if (uPatternMode == 3) {
                // Radial: concentric circles or spiral
                pattern = sin(length(uv - 0.5) * uFrequency + uPhase + uTime * 0.5) * 0.5 + 0.5;
            }

            // Apply density threshold for 1-bit output
            if (pattern > (1.0 - uDensity)) {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // White
            } else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black
            }
        }
    `,
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
            patternMode = 0;  // Noise
            frequency = 16.0; // High frequency for "chaotic" feel
            density = 0.7;
        } else if (tags.includes('CRACK_WALKER')) {
            patternMode = 1;  // Stripes
            frequency = 12.0;
            phase = Math.PI / 2; // Vertical stripes
        } else if (tags.includes('INBETWEENER')) {
            patternMode = 2;  // Checkerboard
            frequency = 10.0;
            density = 0.6;
        } else if (tags.includes('BINARY_EDGE')) {
            patternMode = 3;  // Radial
            frequency = 10.0;
            phase = Math.random() * Math.PI * 2;
        }

        // Secondary light tag modifies density
        if (tags.includes('QUIET_LIGHT')) {
            density -= 0.2; // Sparser pattern
        } else if (tags.includes('LOUD_LIGHT')) {
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
    getTextFromTags(tags: BehaviorTag[]): { text: string; key: BehaviorTag } {
        // Priority order for text selection
        const priority: BehaviorTag[] = [
            'RESISTER',     // Resistance is most notable
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

        // Find first matching tag with text
        for (const tag of priority) {
            if (tags.includes(tag)) {
                const texts = TEXT_TABLE[tag];
                const text = texts[Math.floor(Math.random() * texts.length)];
                return { text, key: tag };
            }
        }

        // Fallback
        return {
            text: "你走过了这片风景，没有留下太多痕迹。",
            key: 'MEDIUM_LIGHT',
        };
    }

    /**
     * Generate complete state snapshot
     */
    generate(tags: BehaviorTag[]): StateSnapshot {
        const pattern = this.getPatternFromTags(tags);
        const { text, key } = this.getTextFromTags(tags);

        return {
            tags,
            pattern,
            text,
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
        pattern.uDensity = Math.max(0.1, Math.min(0.9,
            pattern.uDensity + (metrics.avgFlower - 0.5) * 0.2
        ));

        // More gaze = faster animation (via phase)
        if (metrics.gazeRatio > 0.3) {
            pattern.uPhase += metrics.gazeRatio * Math.PI;
        }

        // Wide exploration = more complex pattern
        if (metrics.spreadX > 50) {
            pattern.uFrequency *= 1.2;
        }

        const { text, key } = this.getTextFromTags(tags);

        return {
            tags,
            pattern,
            text,
            textKey: key,
        };
    }

    /**
     * Get all available text entries for a tag
     */
    getTextsForTag(tag: BehaviorTag): string[] {
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
