// 1-bit Chimera Void - Snapshot Share Card (F6 分享卡片)
// Composes the sunset state snapshot into a downloadable 1080x1350 1-bit
// "negative label": the run's pattern fingerprint on top, the observation,
// tag row and run signature below. Reuses the snapshot's existing pattern
// data + text (SnapshotPattern is the very math the overlay renders) — the
// card derives nothing new about the player. Restraint over poster: black
// ground, white type, one duotone hairline.

import type { ColorRGB, RoomType } from '../world/RoomConfig';
import type { BehaviorTag } from './RunStatsCollector';
import type { PatternUniforms, StateSnapshot } from './StateSnapshotGenerator';
import { SNAPSHOT_CARD, SNAPSHOT_OVERLAY_CONFIG } from '../config';
import { ROOM_CONFIGS } from '../world/RoomConfig';
import { ROOM_TAG_MAP } from './RunStatsCollector';
import { isPatternWhite } from './SnapshotPattern';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no DOM)
// ---------------------------------------------------------------------------

/**
 * Inverse of RunStatsCollector's room->tag map: which room a room-dominance
 * tag stands for. Built once from the same table — one source of truth.
 */
const TAG_TO_ROOM: Partial<Record<BehaviorTag, RoomType>> = (() => {
    const inverse: Partial<Record<BehaviorTag, RoomType>> = {};
    for (const [room, tag] of Object.entries(ROOM_TAG_MAP)) {
        inverse[tag] = room as RoomType;
    }
    return inverse;
})();

/**
 * The run's dominant room, read from the snapshot's room-dominance tag (the
 * tag list carries at most one — RunStatsCollector emits only the dominant
 * room's tag). Null when no room dominated the run.
 */
export function dominantRoomFromTags(tags: readonly BehaviorTag[]): RoomType | null {
    for (const tag of tags) {
        const room = TAG_TO_ROOM[tag];
        if (room)
            return room;
    }
    return null;
}

/**
 * The card's single concession to color: the dominant room's duotone paper
 * tint, used only for the hairline divider. Null (-> plain white) when no
 * room dominated.
 */
export function accentColorForTags(tags: readonly BehaviorTag[]): ColorRGB | null {
    const room = dominantRoomFromTags(tags);
    return room ? ROOM_CONFIGS[room].shader.paperColor : null;
}

/** 0-1 RGB triple -> CSS rgb() string (components rounded to bytes). */
export function colorToCss(color: ColorRGB): string {
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    return `rgb(${r}, ${g}, ${b})`;
}

/** Closing punctuation that must not start a wrapped line (简易避头点). */
const CLOSING_PUNCTUATION = new Set([
    '，',
    '。',
    '、',
    '；',
    '：',
    '！',
    '？',
    '…',
    '）',
    '」',
    '』',
    '”',
    '’',
    ',',
    '.',
    ';',
    ':',
    '!',
    '?',
    ')',
]);

/**
 * Greedy per-character wrap for the card's CJK observation text. `measure`
 * is injected (canvas measureText in production, char counts in tests) so
 * the function stays pure. Closing punctuation never starts a line — the
 * previous character is carried down with it. A single over-wide character
 * is still placed (no infinite loop), and '\n' forces a break. Iterates by
 * code points, so astral characters never get split.
 */
export function wrapTextLines(
    text: string,
    maxWidth: number,
    measure: (s: string) => number,
): string[] {
    const lines: string[] = [];
    let line: string[] = [];
    for (const ch of text) {
        if (ch === '\n') {
            lines.push(line.join(''));
            line = [];
            continue;
        }
        if (line.length > 0 && measure(line.join('') + ch) > maxWidth) {
            if (CLOSING_PUNCTUATION.has(ch) && line.length > 1) {
                // 避头点: carry the previous character down with the mark.
                const carried = line.pop()!;
                lines.push(line.join(''));
                line = [carried, ch];
            }
            else {
                lines.push(line.join(''));
                line = [ch];
            }
        }
        else {
            line.push(ch);
        }
    }
    if (line.length > 0) {
        lines.push(line.join(''));
    }
    return lines;
}

/**
 * m:ss run length (hours fold in as h:mm:ss) — the film-label signature.
 * Negative or non-finite input clamps to 0:00.
 */
export function formatRunDuration(seconds: number): string {
    const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number): string => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Footer line: '1bit · 6:32', or just '1bit' when the duration is unknown. */
export function cardFooterText(durationSeconds: number | null | undefined): string {
    if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return '1bit';
    }
    return `1bit · ${formatRunDuration(durationSeconds)}`;
}

/** `1bit-snapshot-2026-06-11-CRACK_WALKER.png` — local date + dominant key. */
export function snapshotCardFileName(textKey: string, date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    // textKey is a BehaviorTag ([A-Z_]) by construction; scrub defensively so
    // a future key can never produce an awkward filename.
    const key = textKey.replace(/[^\w-]/g, '_');
    return `${SNAPSHOT_CARD.FILE_PREFIX}-${y}-${m}-${d}-${key}.png`;
}

// ---------------------------------------------------------------------------
// Composition (DOM canvas)
// ---------------------------------------------------------------------------

/**
 * Render the snapshot's pattern (frozen at the overlay's first frame,
 * time = 0) into a square offscreen canvas at the overlay's native cell
 * resolution — same evaluator, same grid, opaque 1-bit output. Null when a
 * 2D context is unavailable.
 */
function renderPatternSource(pattern: PatternUniforms): HTMLCanvasElement | null {
    const size = SNAPSHOT_OVERLAY_CONFIG.CANVAS_SIZE;
    const block = SNAPSHOT_OVERLAY_CONFIG.PATTERN_BLOCK_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return null;

    const image = ctx.createImageData(size, size);
    const data = image.data;
    const cells = Math.ceil(size / block);
    for (let sy = 0; sy < cells; sy++) {
        for (let sx = 0; sx < cells; sx++) {
            const color = isPatternWhite(pattern, sx / cells, sy / cells, 0) ? 255 : 0;
            for (let dy = 0; dy < block && sy * block + dy < size; dy++) {
                for (let dx = 0; dx < block && sx * block + dx < size; dx++) {
                    const i = ((sy * block + dy) * size + (sx * block + dx)) * 4;
                    data[i] = color;
                    data[i + 1] = color;
                    data[i + 2] = color;
                    data[i + 3] = 255; // opaque: the card is a print, not an overlay
                }
            }
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

/**
 * Compose the card: top 2/3 the pattern (nearest-neighbor upscale keeps the
 * 1-bit cells hard), bottom 1/3 a black label — wrapped observation, dimmed
 * tag row, and the '1bit · run length' signature. Returns null when a 2D
 * context is unavailable.
 */
export function composeSnapshotCard(snapshot: StateSnapshot): HTMLCanvasElement | null {
    const C = SNAPSHOT_CARD;
    const canvas = document.createElement('canvas');
    canvas.width = C.WIDTH;
    canvas.height = C.HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return null;

    // Black ground (the label zone IS the background).
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

    // Pattern window: center-crop the square source to 1080x900 and scale
    // with smoothing disabled so the upscaled pixels stay sharp.
    const source = renderPatternSource(snapshot.pattern);
    if (source) {
        const srcHeight = Math.round(source.height * (C.PATTERN_HEIGHT / C.WIDTH));
        const srcY = Math.floor((source.height - srcHeight) / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, 0, srcY, source.width, srcHeight, 0, 0, C.WIDTH, C.PATTERN_HEIGHT);
    }

    // Hairline divider — the only color on the card: the dominant room's
    // duotone paper tint (plain white when no room dominated the run).
    const accent = accentColorForTags(snapshot.tags);
    ctx.fillStyle = accent ? colorToCss(accent) : '#ffffff';
    ctx.fillRect(C.MARGIN, C.PATTERN_HEIGHT, C.WIDTH - C.MARGIN * 2, C.DIVIDER_HEIGHT);

    const mono = '"Courier New", Courier, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';

    // Observation, char-wrapped (CJK) and capped label-style.
    ctx.font = `${C.TEXT_FONT_SIZE}px ${mono}`;
    const maxTextWidth = C.WIDTH - C.MARGIN * 2;
    const lines = wrapTextLines(snapshot.text, maxTextWidth, s => ctx.measureText(s).width)
        .slice(0, C.TEXT_MAX_LINES);
    const textTop = C.PATTERN_HEIGHT + C.TEXT_TOP_OFFSET;
    lines.forEach((line, i) => {
        ctx.fillText(line, C.MARGIN, textTop + i * C.TEXT_LINE_HEIGHT);
    });

    // Tag row: the run's raw labels, small monospace, dimmed (still
    // achromatic). maxWidth squeezes an unusually long row instead of
    // clipping it.
    ctx.globalAlpha = C.TAG_ALPHA;
    ctx.font = `${C.TAG_FONT_SIZE}px ${mono}`;
    ctx.fillText(snapshot.tags.join(' · '), C.MARGIN, C.HEIGHT - C.TAG_BOTTOM_OFFSET, maxTextWidth);
    ctx.globalAlpha = 1;

    // Signature: '1bit · run length'.
    ctx.font = `${C.FOOTER_FONT_SIZE}px ${mono}`;
    ctx.fillText(cardFooterText(snapshot.durationSeconds), C.MARGIN, C.HEIGHT - C.FOOTER_BOTTOM_OFFSET);

    return canvas;
}

// ---------------------------------------------------------------------------
// Delivery (share sheet on capable mobile platforms, download otherwise)
// ---------------------------------------------------------------------------

/** canvas.toBlob as a promise; null on failure (null callback / throw). */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        try {
            canvas.toBlob(blob => resolve(blob), 'image/png');
        }
        catch {
            resolve(null);
        }
    });
}

/**
 * Mobile-first delivery: when the platform can share files, raise the native
 * share sheet. Returns true when the share path HANDLED the gesture — which
 * includes the user dismissing the sheet (an AbortError must not then spring
 * a surprise download). False -> caller falls back to download.
 */
async function tryNativeShare(blob: Blob, fileName: string): Promise<boolean> {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
        return false;
    }
    let payload: ShareData;
    try {
        payload = { files: [new File([blob], fileName, { type: 'image/png' })] };
    }
    catch {
        return false; // File constructor unavailable
    }
    if (!navigator.canShare(payload)) {
        return false;
    }
    try {
        await navigator.share(payload);
        return true;
    }
    catch (e) {
        // Dismissed sheet: handled. Anything else: fall back to download.
        return e instanceof DOMException && e.name === 'AbortError';
    }
}

/** Anchor-click download, mirroring utils/ScreenshotManager's pattern. */
function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    // Revoke after the download has had a beat to start.
    setTimeout(() => URL.revokeObjectURL(url), SNAPSHOT_CARD.REVOKE_DELAY_MS);
    console.log('[SnapshotCard] Saved:', fileName);
}

/**
 * Compose + deliver the share card. Best-effort by design: composition or
 * encoding failures warn quietly and return — the sunset ritual must never
 * break on an export.
 */
export async function exportSnapshotCard(snapshot: StateSnapshot, now: Date = new Date()): Promise<void> {
    const canvas = composeSnapshotCard(snapshot);
    if (!canvas) {
        console.warn('[SnapshotCard] 2D context unavailable; card not exported');
        return;
    }
    const blob = await canvasToBlob(canvas);
    if (!blob) {
        console.warn('[SnapshotCard] toBlob failed; card not exported');
        return;
    }
    const fileName = snapshotCardFileName(snapshot.textKey, now);
    if (await tryNativeShare(blob, fileName)) {
        return;
    }
    downloadBlob(blob, fileName);
}
