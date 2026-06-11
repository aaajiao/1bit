// 1-bit Chimera Void - Ghost-trail recording + persistence (F4 "ghost replay")
// Samples the player's walk — (x, z, flowerIntensity) — on the same 2s
// cadence RunStatsCollector uses, into a ring buffer capped at the last
// ~20 minutes. The trail is persisted at sunset / unload (owned by
// core/StatsSunsetUpdater, alongside the snapshot persistence) using the
// versioned-key / injectable-storage / try-catch pattern of SnapshotStorage.
// Next boot, world/GhostSystem replays the stored trail once as a quiet
// silhouette: last run's you, walking its own path through this run's world.
//
// JSON size note: points are stored as a FLAT number array of [x, z, flower]
// triplets, x/z rounded to 0.1m and flower to 0.01 — a full 600-point trail
// stays around ~10KB, far under any localStorage quota concern.

import { TRAIL } from '../config';

/** One recorded trail sample (world x/z, flower intensity 0-1). */
export interface TrailPoint {
    x: number;
    z: number;
    flower: number;
}

/** Versioned wire format: flat [x, z, flower] triplets, chronological. */
export interface PersistedTrail {
    version: number;
    points: number[];
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round(v: number, decimals: number): number {
    const f = 10 ** decimals;
    return Math.round(v * f) / f;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Encode a trail into its versioned JSON wire format, quantizing x/z to the
 * 0.1m grid and flower to 0.01 (POSITION_DECIMALS / FLOWER_DECIMALS). Pure.
 */
export function encodeTrail(points: readonly TrailPoint[]): string {
    const flat: number[] = [];
    for (const p of points) {
        flat.push(
            round(p.x, TRAIL.POSITION_DECIMALS),
            round(p.z, TRAIL.POSITION_DECIMALS),
            round(clamp01(p.flower), TRAIL.FLOWER_DECIMALS),
        );
    }
    const payload: PersistedTrail = { version: TRAIL.VERSION, points: flat };
    return JSON.stringify(payload);
}

/**
 * Decode + validate a persisted payload. Returns null for anything that is
 * not a well-formed CURRENT-version trail (corrupt JSON, older versions,
 * non-numeric or truncated triplets) AND for trails too short to walk
 * (< 2 points) — callers treat bad data as simply absent: 静默无幽灵.
 * Oversized trails are trimmed to the cap, keeping the most recent (tail)
 * points, mirroring the recorder's ring-buffer semantics. Pure.
 */
export function decodeTrail(raw: string | null | undefined): TrailPoint[] | null {
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

    const p = parsed as Partial<PersistedTrail>;
    if (p.version !== TRAIL.VERSION)
        return null;
    if (!Array.isArray(p.points) || p.points.length % 3 !== 0)
        return null;
    if (!p.points.every(isFiniteNumber))
        return null;
    if (p.points.length < 2 * 3)
        return null; // a ghost needs at least one segment to walk

    // Rebuild clean points (never alias the parsed payload), trimming to the
    // last MAX_POINTS and re-clamping flower defensively.
    const flat = p.points.slice(-TRAIL.MAX_POINTS * 3);
    const points: TrailPoint[] = [];
    for (let i = 0; i < flat.length; i += 3)
        points.push({ x: flat[i], z: flat[i + 1], flower: clamp01(flat[i + 2]) });
    return points;
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
 * Persist `points` as the last-run trail. Quota/privacy errors are
 * swallowed — persistence is best-effort by design.
 */
export function saveTrail(
    points: readonly TrailPoint[],
    storage: Storage | null = defaultStorage(),
): void {
    if (!storage)
        return;
    try {
        storage.setItem(TRAIL.KEY, encodeTrail(points));
    }
    catch {
        // Best-effort: drop silently (quota exceeded / privacy mode).
    }
}

/** Load the persisted last-run trail, or null when absent/invalid. */
export function loadTrail(
    storage: Storage | null = defaultStorage(),
): TrailPoint[] | null {
    if (!storage)
        return null;
    let raw: string | null = null;
    try {
        raw = storage.getItem(TRAIL.KEY);
    }
    catch {
        return null;
    }
    return decodeTrail(raw);
}

/**
 * Remove the persisted trail (the F2 "遗忘" entry erases the ghost's memory
 * along with the scars). Best-effort like every persistence path here.
 */
export function clearStoredTrail(storage: Storage | null = defaultStorage()): void {
    if (!storage)
        return;
    try {
        storage.removeItem(TRAIL.KEY);
    }
    catch {
        // Best-effort.
    }
}

/**
 * Delta-driven trail sampler: one point per SAMPLE_INTERVAL, ring-buffered
 * at MAX_POINTS (oldest dropped — the ghost remembers the LAST ~20 minutes).
 * The timer starts "due" so the very first unpaused frame records the spawn
 * point: the replayed trail genuinely starts where the run started.
 */
export class TrailRecorder {
    private points: TrailPoint[] = [];
    private timer: number = TRAIL.SAMPLE_INTERVAL;

    /** Per-frame update (pause-gated upstream like every other system). */
    update(delta: number, x: number, z: number, flower: number): void {
        this.timer += delta;
        if (this.timer < TRAIL.SAMPLE_INTERVAL)
            return;
        this.timer = 0;
        this.points.push({ x, z, flower });
        if (this.points.length > TRAIL.MAX_POINTS)
            this.points.shift();
    }

    /** The recorded trail so far (read-only view; replaced on reset). */
    getPoints(): readonly TrailPoint[] {
        return this.points;
    }

    /**
     * Whether this run walked long enough to leave a ghost (MIN_POINTS x
     * SAMPLE_INTERVAL = the snapshot's 30s minimum-run threshold).
     */
    hasMeaningfulTrail(): boolean {
        return this.points.length >= TRAIL.MIN_POINTS;
    }

    /** Start a fresh trail (sunset rolls the run over). */
    reset(): void {
        this.points = [];
        this.timer = TRAIL.SAMPLE_INTERVAL;
    }
}
