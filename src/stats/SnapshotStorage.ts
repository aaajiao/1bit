// 1-bit Chimera Void - Snapshot persistence (flow-audit enhancement #8)
// Serializes the last run's state snapshot (tags + text + pattern params) to
// localStorage so closing the tab doesn't silently discard the observation;
// the next start screen surfaces it as one quiet line.

import type { BehaviorTag } from './RunStatsCollector';
import type { PatternUniforms, StateSnapshot } from './StateSnapshotGenerator';
import { SNAPSHOT_STORAGE } from '../config';

/** Versioned wire format of a persisted snapshot. */
export interface PersistedSnapshot {
    version: number;
    tags: BehaviorTag[];
    pattern: PatternUniforms;
    text: string;
    textKey: string;
    /**
     * Optional English line paired with `text` (bilingual snapshots); absent
     * in pre-bilingual payloads — same VERSION, additive field.
     */
    textEn?: string;
    /**
     * Optional run length in seconds (F6 share-card footer); absent in
     * pre-F6 payloads — same VERSION, additive field.
     */
    durationSeconds?: number;
}

/** Encode a snapshot into its versioned JSON wire format. Pure. */
export function encodeSnapshot(snapshot: StateSnapshot): string {
    const payload: PersistedSnapshot = {
        version: SNAPSHOT_STORAGE.VERSION,
        tags: snapshot.tags,
        pattern: snapshot.pattern,
        text: snapshot.text,
        textKey: snapshot.textKey,
    };
    if (typeof snapshot.textEn === 'string' && snapshot.textEn.length > 0) {
        payload.textEn = snapshot.textEn;
    }
    if (isFiniteNumber(snapshot.durationSeconds) && snapshot.durationSeconds >= 0) {
        payload.durationSeconds = snapshot.durationSeconds;
    }
    return JSON.stringify(payload);
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Decode + validate a persisted payload. Returns null for anything that is
 * not a well-formed CURRENT-version snapshot (corrupt JSON, older versions,
 * missing/garbage fields), so callers can treat bad data as simply absent.
 * Pure.
 */
export function decodeSnapshot(raw: string | null | undefined): StateSnapshot | null {
    if (!raw)
        return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return null;

    const p = parsed as Partial<PersistedSnapshot>;
    if (p.version !== SNAPSHOT_STORAGE.VERSION)
        return null;
    if (typeof p.text !== 'string' || typeof p.textKey !== 'string')
        return null;
    if (!Array.isArray(p.tags) || !p.tags.every(tag => typeof tag === 'string'))
        return null;

    const pattern = p.pattern as Partial<PatternUniforms> | undefined;
    if (
        !pattern
        || !isFiniteNumber(pattern.uPatternMode)
        || !isFiniteNumber(pattern.uDensity)
        || !isFiniteNumber(pattern.uFrequency)
        || !isFiniteNumber(pattern.uPhase)
    ) {
        return null;
    }

    // Rebuild a clean object (never alias the parsed payload's extra fields).
    const snapshot: StateSnapshot = {
        tags: p.tags as BehaviorTag[],
        pattern: {
            uPatternMode: pattern.uPatternMode,
            uDensity: pattern.uDensity,
            uFrequency: pattern.uFrequency,
            uPhase: pattern.uPhase,
        },
        text: p.text,
        // Optional English line (bilingual): tolerate absence — pre-bilingual
        // payloads (or garbage) fall back to '' without rejecting the snapshot.
        textEn: typeof p.textEn === 'string' ? p.textEn : '',
        textKey: p.textKey,
    };
    // Optional run duration (F6): tolerate absence (pre-F6 payloads) and
    // drop garbage values without rejecting the whole snapshot.
    if (isFiniteNumber(p.durationSeconds) && p.durationSeconds >= 0) {
        snapshot.durationSeconds = p.durationSeconds;
    }
    return snapshot;
}

/** Browser localStorage, or null when unavailable (tests, privacy modes). */
function defaultStorage(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    }
    catch {
        return null;
    }
}

/**
 * Persist `snapshot` as the last-run record. Quota/privacy errors are
 * swallowed — persistence is best-effort by design.
 */
export function saveLastSnapshot(
    snapshot: StateSnapshot,
    storage: Storage | null = defaultStorage(),
): void {
    if (!storage)
        return;
    try {
        storage.setItem(SNAPSHOT_STORAGE.KEY, encodeSnapshot(snapshot));
    }
    catch {
        // Best-effort: drop silently (quota exceeded / privacy mode).
    }
}

/**
 * Remove the persisted last-run snapshot (the F2 "遗忘" entry erases the
 * visit record along with the scars and the ghost trail). Best-effort like
 * every other persistence path here.
 */
export function clearLastSnapshot(storage: Storage | null = defaultStorage()): void {
    if (!storage)
        return;
    try {
        storage.removeItem(SNAPSHOT_STORAGE.KEY);
    }
    catch {
        // Best-effort.
    }
}

/** Load the persisted last-run snapshot, or null when absent/invalid. */
export function loadLastSnapshot(
    storage: Storage | null = defaultStorage(),
): StateSnapshot | null {
    if (!storage)
        return null;
    let raw: string | null = null;
    try {
        raw = storage.getItem(SNAPSHOT_STORAGE.KEY);
    }
    catch {
        return null;
    }
    return decodeSnapshot(raw);
}
