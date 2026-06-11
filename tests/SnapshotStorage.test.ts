import type { StateSnapshot } from '../src/stats/StateSnapshotGenerator';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_STORAGE } from '../src/config';
import {
    decodeSnapshot,
    encodeSnapshot,
    loadLastSnapshot,
    saveLastSnapshot,
} from '../src/stats/SnapshotStorage';

function makeSnapshot(): StateSnapshot {
    return {
        tags: ['LOW_GAZE', 'INBETWEENER'],
        pattern: { uPatternMode: 2, uDensity: 0.6, uFrequency: 10, uPhase: 1.25 },
        text: '大多把视线放在地上。',
        textKey: 'LOW_GAZE',
    };
}

/** Minimal in-memory Storage double (tests run in node — no localStorage). */
function makeFakeStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
        get length() { return map.size; },
        clear: () => map.clear(),
        getItem: (key: string) => map.get(key) ?? null,
        key: (index: number) => [...map.keys()][index] ?? null,
        removeItem: (key: string) => void map.delete(key),
        setItem: (key: string, value: string) => void map.set(key, String(value)),
    } as Storage;
}

describe('snapshot wire format (flow-audit enhancement #8)', () => {
    it('round-trips a snapshot through encode/decode', () => {
        const snapshot = makeSnapshot();
        const decoded = decodeSnapshot(encodeSnapshot(snapshot));
        expect(decoded).toEqual(snapshot);
        // The decoder rebuilds clean objects (no aliasing of parsed payloads).
        expect(decoded).not.toBe(snapshot);
        expect(decoded!.pattern).not.toBe(snapshot.pattern);
    });

    it('stamps the configured wire version on encode', () => {
        const payload = JSON.parse(encodeSnapshot(makeSnapshot())) as { version: number };
        expect(payload.version).toBe(SNAPSHOT_STORAGE.VERSION);
    });

    it('rejects null/empty/corrupt input', () => {
        expect(decodeSnapshot(null)).toBeNull();
        expect(decodeSnapshot(undefined)).toBeNull();
        expect(decodeSnapshot('')).toBeNull();
        expect(decodeSnapshot('not json {{')).toBeNull();
        expect(decodeSnapshot('42')).toBeNull();
        expect(decodeSnapshot('null')).toBeNull();
        expect(decodeSnapshot('"a string"')).toBeNull();
    });

    it('rejects a version mismatch (stale payloads read as absent)', () => {
        const payload = JSON.parse(encodeSnapshot(makeSnapshot())) as Record<string, unknown>;
        payload.version = SNAPSHOT_STORAGE.VERSION + 1;
        expect(decodeSnapshot(JSON.stringify(payload))).toBeNull();
    });

    it('rejects missing or non-numeric pattern fields', () => {
        const base = JSON.parse(encodeSnapshot(makeSnapshot())) as Record<string, any>;

        const noPattern = { ...base, pattern: undefined };
        expect(decodeSnapshot(JSON.stringify(noPattern))).toBeNull();

        const badField = { ...base, pattern: { ...base.pattern, uDensity: 'high' } };
        expect(decodeSnapshot(JSON.stringify(badField))).toBeNull();

        const missingField = { ...base, pattern: { ...base.pattern } };
        delete missingField.pattern.uPhase;
        expect(decodeSnapshot(JSON.stringify(missingField))).toBeNull();
    });

    it('rejects non-string text/textKey and non-string-array tags', () => {
        const base = JSON.parse(encodeSnapshot(makeSnapshot())) as Record<string, any>;
        expect(decodeSnapshot(JSON.stringify({ ...base, text: 7 }))).toBeNull();
        expect(decodeSnapshot(JSON.stringify({ ...base, textKey: null }))).toBeNull();
        expect(decodeSnapshot(JSON.stringify({ ...base, tags: 'LOW_GAZE' }))).toBeNull();
        expect(decodeSnapshot(JSON.stringify({ ...base, tags: ['LOW_GAZE', 3] }))).toBeNull();
    });
});

describe('snapshot persistence (save/load)', () => {
    it('saves under the configured key and loads the same snapshot back', () => {
        const storage = makeFakeStorage();
        const snapshot = makeSnapshot();
        saveLastSnapshot(snapshot, storage);
        expect(storage.getItem(SNAPSHOT_STORAGE.KEY)).not.toBeNull();
        expect(loadLastSnapshot(storage)).toEqual(snapshot);
    });

    it('returns null from empty storage and treats corrupt entries as absent', () => {
        expect(loadLastSnapshot(makeFakeStorage())).toBeNull();
        const corrupt = makeFakeStorage({ [SNAPSHOT_STORAGE.KEY]: '{broken' });
        expect(loadLastSnapshot(corrupt)).toBeNull();
    });

    it('is a silent no-op without storage (privacy mode / node)', () => {
        expect(() => saveLastSnapshot(makeSnapshot(), null)).not.toThrow();
        expect(loadLastSnapshot(null)).toBeNull();
    });

    it('swallows setItem failures (quota exceeded)', () => {
        const storage = makeFakeStorage();
        storage.setItem = () => {
            throw new Error('QuotaExceededError');
        };
        expect(() => saveLastSnapshot(makeSnapshot(), storage)).not.toThrow();
    });
});
