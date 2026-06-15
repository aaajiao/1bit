// F6 share card: pure-function coverage (wrapping, filename, duration,
// duotone accent resolution, layout knob self-consistency, and the shared
// pattern evaluator the card renders with).

import type { BehaviorTag } from '../src/stats/RunStatsCollector';
import type { PatternUniforms } from '../src/stats/StateSnapshotGenerator';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_CARD } from '../src/config';
import {
    accentColorForTags,
    cardFooterText,
    colorToCss,
    dominantRoomFromTags,
    englishLineBudget,
    formatRunDuration,
    snapshotCardFileName,
    wrapTextLines,
    wrapTextLinesWord,
} from '../src/stats/SnapshotCard';
import { evaluatePattern, isPatternWhite } from '../src/stats/SnapshotPattern';
import { ROOM_CONFIGS, RoomType } from '../src/world/RoomConfig';

/** Char-count measure: every code point is 1 unit wide. */
const charMeasure = (s: string): number => [...s].length;

describe('wrapTextLines (card observation wrapping)', () => {
    it('returns no lines for empty text', () => {
        expect(wrapTextLines('', 5, charMeasure)).toEqual([]);
    });

    it('keeps text that fits on a single line', () => {
        expect(wrapTextLines('一二三', 5, charMeasure)).toEqual(['一二三']);
    });

    it('wraps CJK text greedily at the width limit', () => {
        expect(wrapTextLines('一二三四五六七', 5, charMeasure))
            .toEqual(['一二三四五', '六七']);
    });

    it('never starts a line with closing punctuation (避头点)', () => {
        // Naive wrap would emit '一二三四五' + '，六'; the rule carries 五 down.
        expect(wrapTextLines('一二三四五，六', 5, charMeasure))
            .toEqual(['一二三四', '五，六']);
    });

    it('honors explicit newlines', () => {
        expect(wrapTextLines('ab\ncd', 5, charMeasure)).toEqual(['ab', 'cd']);
    });

    it('still places a single over-wide character (no infinite loop)', () => {
        const wide = (s: string): number => [...s].length * 10;
        expect(wrapTextLines('ab', 5, wide)).toEqual(['a', 'b']);
    });

    it('lets punctuation wrap alone when there is nothing to carry', () => {
        expect(wrapTextLines('一，', 1, charMeasure)).toEqual(['一', '，']);
    });

    it('wraps a real observation line at canvas-like widths', () => {
        // 40px CJK glyphs in a 936px box ≈ 23 units per line.
        const text = '一直走到一个地方，那里所有事都只能是这样或那样。';
        const lines = wrapTextLines(text, 23, charMeasure);
        expect(lines.join('')).toBe(text);
        for (const line of lines) {
            expect(charMeasure(line)).toBeLessThanOrEqual(23);
        }
    });
});

describe('wrapTextLinesWord (card English wrapping)', () => {
    it('returns no lines for empty text', () => {
        expect(wrapTextLinesWord('', 5, charMeasure)).toEqual([]);
    });

    it('keeps words that fit on a single line', () => {
        expect(wrapTextLinesWord('one two', 7, charMeasure)).toEqual(['one two']);
    });

    it('wraps greedily at word boundaries', () => {
        // 'one two' = 7 fits; adding ' six' (4) overflows 8 -> break.
        expect(wrapTextLinesWord('one two six', 8, charMeasure))
            .toEqual(['one two', 'six']);
    });

    it('hard-splits a single over-long word so it never overflows', () => {
        expect(wrapTextLinesWord('abcdefg', 3, charMeasure))
            .toEqual(['abc', 'def', 'g']);
    });

    it('wraps after an over-long word, carrying its tail forward', () => {
        // 'abcdef' splits to 'abc','def'; 'gh' then joins the carried tail.
        expect(wrapTextLinesWord('abcdef gh', 3, charMeasure))
            .toEqual(['abc', 'def', 'gh']);
    });

    it('collapses runs of whitespace', () => {
        expect(wrapTextLinesWord('one   two', 7, charMeasure)).toEqual(['one two']);
    });

    it('honors explicit newlines', () => {
        expect(wrapTextLinesWord('ab cd\nef', 99, charMeasure))
            .toEqual(['ab cd', 'ef']);
    });

    it('wraps a real English line without exceeding the width', () => {
        const text = 'you walked all the way to where things could only be one or the other';
        const lines = wrapTextLinesWord(text, 30, charMeasure);
        expect(lines.join(' ')).toBe(text);
        for (const line of lines) {
            expect(charMeasure(line)).toBeLessThanOrEqual(30);
        }
    });
});

describe('englishLineBudget (no-overflow corridor math)', () => {
    it('grants room for English when the Chinese block is short', () => {
        expect(englishLineBudget(1)).toBeGreaterThan(0);
    });

    it('shrinks the budget as the Chinese block grows', () => {
        expect(englishLineBudget(2)).toBeLessThanOrEqual(englishLineBudget(1));
    });

    it('collapses to zero when the Chinese block fills the corridor', () => {
        expect(englishLineBudget(SNAPSHOT_CARD.TEXT_MAX_LINES)).toBe(0);
    });

    it('never lets the English block cross the tag row', () => {
        for (let cn = 0; cn <= SNAPSHOT_CARD.TEXT_MAX_LINES; cn++) {
            const enLines = englishLineBudget(cn);
            const enBottom = SNAPSHOT_CARD.PATTERN_HEIGHT
                + SNAPSHOT_CARD.TEXT_TOP_OFFSET
                + cn * SNAPSHOT_CARD.TEXT_LINE_HEIGHT
                + SNAPSHOT_CARD.TEXT_EN_TOP_GAP
                + enLines * SNAPSHOT_CARD.TEXT_EN_LINE_HEIGHT;
            expect(enBottom).toBeLessThanOrEqual(SNAPSHOT_CARD.HEIGHT - SNAPSHOT_CARD.TAG_BOTTOM_OFFSET);
        }
    });

    it('caps the budget at the configured maximum', () => {
        for (let cn = 0; cn <= SNAPSHOT_CARD.TEXT_MAX_LINES; cn++) {
            expect(englishLineBudget(cn)).toBeLessThanOrEqual(SNAPSHOT_CARD.TEXT_EN_MAX_LINES);
        }
    });
});

describe('formatRunDuration / cardFooterText', () => {
    it('formats m:ss', () => {
        expect(formatRunDuration(0)).toBe('0:00');
        expect(formatRunDuration(392)).toBe('6:32');
        expect(formatRunDuration(59.9)).toBe('0:59');
    });

    it('folds hours in as h:mm:ss', () => {
        expect(formatRunDuration(3661)).toBe('1:01:01');
    });

    it('clamps negative and non-finite input to 0:00', () => {
        expect(formatRunDuration(-5)).toBe('0:00');
        expect(formatRunDuration(Number.NaN)).toBe('0:00');
        expect(formatRunDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
    });

    it('signs the footer with the run length when known', () => {
        expect(cardFooterText(392)).toBe('1bit · 6:32');
    });

    it('falls back to a bare signature when the duration is unknown', () => {
        expect(cardFooterText(null)).toBe('1bit');
        expect(cardFooterText(undefined)).toBe('1bit');
        expect(cardFooterText(0)).toBe('1bit');
        expect(cardFooterText(Number.NaN)).toBe('1bit');
    });
});

describe('snapshotCardFileName', () => {
    it('contains the local date and the dominant text key', () => {
        expect(snapshotCardFileName('CRACK_WALKER', new Date(2026, 5, 11)))
            .toBe('1bit-snapshot-2026-06-11-CRACK_WALKER.png');
    });

    it('zero-pads month and day', () => {
        expect(snapshotCardFileName('RESISTER', new Date(2026, 0, 5)))
            .toBe('1bit-snapshot-2026-01-05-RESISTER.png');
    });

    it('scrubs non-filename-safe characters from the key', () => {
        expect(snapshotCardFileName('A B/C', new Date(2026, 0, 5)))
            .toBe('1bit-snapshot-2026-01-05-A_B_C.png');
    });

    it('uses the configured prefix', () => {
        expect(snapshotCardFileName('X', new Date(2026, 0, 1)))
            .toMatch(new RegExp(`^${SNAPSHOT_CARD.FILE_PREFIX}-`));
    });
});

describe('dominant room -> duotone accent', () => {
    it('maps each room-dominance tag to its room', () => {
        expect(dominantRoomFromTags(['INFO_MAZE'])).toBe(RoomType.INFO_OVERFLOW);
        expect(dominantRoomFromTags(['CRACK_WALKER'])).toBe(RoomType.FORCED_ALIGNMENT);
        expect(dominantRoomFromTags(['INBETWEENER'])).toBe(RoomType.IN_BETWEEN);
        expect(dominantRoomFromTags(['BINARY_EDGE'])).toBe(RoomType.POLARIZED);
    });

    it('finds the room tag among non-room tags', () => {
        const tags: BehaviorTag[] = ['LOUD_LIGHT', 'CRACK_WALKER', 'RESISTER'];
        expect(dominantRoomFromTags(tags)).toBe(RoomType.FORCED_ALIGNMENT);
        expect(accentColorForTags(tags))
            .toEqual(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.paperColor);
    });

    it('returns null (-> white divider) without a room tag', () => {
        expect(dominantRoomFromTags(['QUIET_LIGHT', 'LOW_GAZE'])).toBeNull();
        expect(accentColorForTags([])).toBeNull();
    });
});

describe('colorToCss', () => {
    it('converts 0-1 triples to byte rgb() strings', () => {
        expect(colorToCss([1, 1, 1])).toBe('rgb(255, 255, 255)');
        expect(colorToCss([0, 0, 0])).toBe('rgb(0, 0, 0)');
        expect(colorToCss([0.5, 0, 0])).toBe('rgb(128, 0, 0)');
    });
});

describe('shared pattern evaluator (card == overlay fingerprint)', () => {
    const checker: PatternUniforms = {
        uPatternMode: 2,
        uDensity: 0.5,
        uFrequency: 2,
        uPhase: 0,
    };

    it('evaluates the checkerboard exactly', () => {
        expect(evaluatePattern(checker, 0.1, 0.1, 0)).toBe(0);
        expect(evaluatePattern(checker, 0.6, 0.1, 0)).toBe(1);
        expect(isPatternWhite(checker, 0.1, 0.1, 0)).toBe(false);
        expect(isPatternWhite(checker, 0.6, 0.1, 0)).toBe(true);
    });

    it('treats density as the white threshold (1 - density)', () => {
        const dense: PatternUniforms = { ...checker, uDensity: 1.0 };
        // Threshold 0: any positive field value renders white.
        expect(isPatternWhite(dense, 0.6, 0.1, 0)).toBe(true);
        const sparse: PatternUniforms = { ...checker, uDensity: 0.0 };
        expect(isPatternWhite(sparse, 0.6, 0.1, 0)).toBe(false);
    });

    it('is deterministic for the noise mode (same args, same field)', () => {
        const noise: PatternUniforms = {
            uPatternMode: 0,
            uDensity: 0.7,
            uFrequency: 16,
            uPhase: 0,
        };
        const a = evaluatePattern(noise, 0.37, 0.61, 0);
        const b = evaluatePattern(noise, 0.37, 0.61, 0);
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
    });

    it('falls back to black for unknown pattern modes', () => {
        const unknown: PatternUniforms = { ...checker, uPatternMode: 9 };
        expect(evaluatePattern(unknown, 0.5, 0.5, 0)).toBe(0);
    });
});

describe('snapshot card layout knobs', () => {
    it('keeps the 4:5 portrait and the 2/3 pattern window', () => {
        expect(SNAPSHOT_CARD.WIDTH / SNAPSHOT_CARD.HEIGHT).toBeCloseTo(4 / 5, 10);
        expect(SNAPSHOT_CARD.PATTERN_HEIGHT * 3).toBe(SNAPSHOT_CARD.HEIGHT * 2);
    });

    it('fits the full text block above the tag row', () => {
        const textBottom = SNAPSHOT_CARD.PATTERN_HEIGHT
            + SNAPSHOT_CARD.TEXT_TOP_OFFSET
            + SNAPSHOT_CARD.TEXT_MAX_LINES * SNAPSHOT_CARD.TEXT_LINE_HEIGHT;
        expect(textBottom).toBeLessThanOrEqual(SNAPSHOT_CARD.HEIGHT - SNAPSHOT_CARD.TAG_BOTTOM_OFFSET);
    });

    it('orders the label rows: tags above footer above the bottom edge', () => {
        expect(SNAPSHOT_CARD.TAG_BOTTOM_OFFSET)
            .toBeGreaterThan(SNAPSHOT_CARD.FOOTER_BOTTOM_OFFSET);
        expect(SNAPSHOT_CARD.FOOTER_BOTTOM_OFFSET)
            .toBeGreaterThan(SNAPSHOT_CARD.FOOTER_FONT_SIZE);
    });
});
