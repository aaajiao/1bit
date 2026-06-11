// 1-bit Chimera Void - Scar persistence (F2 "the system remembers you resisted")
// Cross-session record of every successful override (anchored at the world
// position it happened at, aggregated per place within SCAR_FIELD.RADIUS)
// plus the runs-completed counter. Versioned / injectable-storage / try-catch
// pattern mirrors SnapshotStorage. Deliberately decoupled from the
// session-only RoomLedger (F1): scars survive the tab, the ledger does not.

import type { ScarPoint } from '../world/ScarField';
import { SCAR_FIELD, SCAR_STORAGE } from '../config';

/**
 * Versioned wire format of the persisted scar record. `scars` is ordered by
 * recency: least-recently-touched first, most-recently-touched last (the
 * cap evicts from the front).
 */
export interface PersistedScars {
    version: number;
    scars: ScarPoint[];
    runsCompleted: number;
}

/** A fresh, empty record (no scars, no completed runs). Pure. */
export function createEmptyScarRecord(): PersistedScars {
    return { version: SCAR_STORAGE.VERSION, scars: [], runsCompleted: 0 };
}

/** Encode a record into its versioned JSON wire format. Pure. */
export function encodeScarRecord(record: PersistedScars): string {
    const payload: PersistedScars = {
        version: SCAR_STORAGE.VERSION,
        scars: record.scars.map(s => ({ x: s.x, z: s.z, count: s.count })),
        runsCompleted: record.runsCompleted,
    };
    return JSON.stringify(payload);
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isValidScar(v: unknown): v is ScarPoint {
    if (typeof v !== 'object' || v === null)
        return false;
    const s = v as Partial<ScarPoint>;
    return isFiniteNumber(s.x) && isFiniteNumber(s.z) && isFiniteNumber(s.count) && s.count >= 1;
}

/**
 * Decode + validate a persisted payload. Returns null for anything that is
 * not a well-formed CURRENT-version record (corrupt JSON, older versions,
 * missing/garbage fields), so callers can treat bad data as simply absent.
 * Oversized scar lists are trimmed to the cap, keeping the most recent
 * (tail) entries. Pure.
 */
export function decodeScarRecord(raw: string | null | undefined): PersistedScars | null {
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

    const p = parsed as Partial<PersistedScars>;
    if (p.version !== SCAR_STORAGE.VERSION)
        return null;
    if (!isFiniteNumber(p.runsCompleted) || p.runsCompleted < 0)
        return null;
    if (!Array.isArray(p.scars) || !p.scars.every(isValidScar))
        return null;

    // Rebuild clean objects (never alias the parsed payload's extra fields)
    // and enforce the cap, evicting the least-recent (front) entries.
    const scars = p.scars
        .slice(-SCAR_STORAGE.MAX_SCARS)
        .map(s => ({ x: s.x, z: s.z, count: Math.floor(s.count) }));
    return {
        version: SCAR_STORAGE.VERSION,
        scars,
        runsCompleted: Math.floor(p.runsCompleted),
    };
}

/** Snap a world coordinate onto the stored anchor grid (0.5m => exact). */
function quantizeCoord(v: number): number {
    const grid = SCAR_STORAGE.POSITION_GRID;
    return Math.round(v / grid) * grid;
}

/**
 * Aggregate one successful override at WORLD position (worldX, worldZ) into
 * the record. Pure (fresh record/arrays/objects; the input is never mutated,
 * so boot-time snapshots of `scars` held elsewhere stay frozen):
 *
 * - Within SCAR_FIELD.RADIUS of an existing scar => count++, the anchor
 *   drifts ANCHOR_NUDGE of the way toward the new position, and the scar
 *   moves to the most-recent end.
 * - Anywhere else => appended as a fresh count-1 scar anchored at the
 *   (quantized) resistance position; when over `max`, the
 *   least-recently-touched scar (front) is evicted.
 */
export function withScarAt(
    record: PersistedScars,
    worldX: number,
    worldZ: number,
    max: number = SCAR_STORAGE.MAX_SCARS,
): PersistedScars {
    const x = quantizeCoord(worldX);
    const z = quantizeCoord(worldZ);
    const idx = record.scars.findIndex(
        s => Math.hypot(s.x - x, s.z - z) < SCAR_FIELD.RADIUS,
    );
    let scars: ScarPoint[];
    if (idx >= 0) {
        const prev = record.scars[idx];
        const touched: ScarPoint = {
            x: quantizeCoord(prev.x + (x - prev.x) * SCAR_STORAGE.ANCHOR_NUDGE),
            z: quantizeCoord(prev.z + (z - prev.z) * SCAR_STORAGE.ANCHOR_NUDGE),
            count: prev.count + 1,
        };
        scars = [...record.scars.slice(0, idx), ...record.scars.slice(idx + 1), touched];
    }
    else {
        scars = [...record.scars, { x, z, count: 1 }];
        if (scars.length > max)
            scars = scars.slice(scars.length - max);
    }
    return { ...record, scars };
}

/** One more completed run (sunset settlement). Pure; input never mutated. */
export function withRunCompleted(record: PersistedScars): PersistedScars {
    return { ...record, scars: [...record.scars], runsCompleted: record.runsCompleted + 1 };
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
 * Persist the scar record. Quota/privacy errors are swallowed — persistence
 * is best-effort by design.
 */
export function saveScarRecord(
    record: PersistedScars,
    storage: Storage | null = defaultStorage(),
): void {
    if (!storage)
        return;
    try {
        storage.setItem(SCAR_STORAGE.KEY, encodeScarRecord(record));
    }
    catch {
        // Best-effort: drop silently (quota exceeded / privacy mode).
    }
}

/** Load the persisted scar record, or null when absent/invalid. */
export function loadScarRecord(
    storage: Storage | null = defaultStorage(),
): PersistedScars | null {
    if (!storage)
        return null;
    let raw: string | null = null;
    try {
        raw = storage.getItem(SCAR_STORAGE.KEY);
    }
    catch {
        return null;
    }
    return decodeScarRecord(raw);
}

/**
 * Runtime owner of the scar record: ONE localStorage read at construction
 * (boot), then an in-memory cache that mutators rewrite through. World
 * generation reads getScars() from memory — never localStorage on the chunk
 * hot path. All mutators replace the record wholesale (the pure helpers
 * never mutate), so a boot-time snapshot of getScars() held by ChunkManager
 * stays frozen for the session: scars recorded NOW surface NEXT session.
 */
export class ScarStore {
    private record: PersistedScars;

    constructor(private readonly storage: Storage | null = defaultStorage()) {
        this.record = loadScarRecord(this.storage) ?? createEmptyScarRecord();
    }

    /** The aggregated scar list (read-only; replaced wholesale on writes). */
    getScars(): readonly ScarPoint[] {
        return this.record.scars;
    }

    /** Completed-run counter (sunsets survived across all sessions). */
    getRunsCompleted(): number {
        return this.record.runsCompleted;
    }

    /** True when the system remembers ANYTHING about this visitor. */
    hasMemory(): boolean {
        return this.record.scars.length > 0 || this.record.runsCompleted > 0;
    }

    /** Record one successful override at world (x, z) and persist. */
    recordScar(worldX: number, worldZ: number): void {
        this.record = withScarAt(this.record, worldX, worldZ);
        saveScarRecord(this.record, this.storage);
    }

    /** Record one completed run (sunset) and persist. */
    recordRunCompleted(): void {
        this.record = withRunCompleted(this.record);
        saveScarRecord(this.record, this.storage);
    }

    /**
     * The forgetting (F2 #4): clear scars + runsCompleted and remove the
     * persisted key — the visitor's right to reset the relationship.
     */
    forgetAll(): void {
        this.record = createEmptyScarRecord();
        if (!this.storage)
            return;
        try {
            this.storage.removeItem(SCAR_STORAGE.KEY);
        }
        catch {
            // Best-effort, like every other persistence path here.
        }
    }
}
