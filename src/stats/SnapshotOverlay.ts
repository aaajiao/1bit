// 1-bit Chimera Void - Snapshot Overlay
// DOM-based overlay for displaying state snapshots at day/night transitions

import type { PatternUniforms, StateSnapshot } from './StateSnapshotGenerator';
import { SNAPSHOT_OVERLAY_CONFIG } from '../config';
import { isPatternWhite } from './SnapshotPattern';

/**
 * Overlay display configuration. All durations are SECONDS of play time:
 * the overlay is advanced by update(delta) from the main loop, which is
 * gated while paused — so ESC/tab-hide freeze the display window instead of
 * burning it (flow-audit medium #8; the old version ran on setTimeout wall
 * clocks and a pause longer than the remaining window lost the settlement
 * forever).
 */
export interface OverlayConfig {
    displayDuration: number; // Total display time (s)
    fadeInDuration: number; // Fade in time (s)
    fadeOutDuration: number; // Fade out time (s)
    textDelay: number; // Delay before text appears (s)
    textDuration: number; // How long text stays visible (s)
}

const DEFAULT_CONFIG: OverlayConfig = {
    displayDuration: 8,
    fadeInDuration: 1.5,
    fadeOutDuration: 1.5,
    textDelay: 1,
    textDuration: 5,
};

/**
 * Manages the visual overlay for state snapshots
 */
export class SnapshotOverlay {
    private container: HTMLDivElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private textEl: HTMLDivElement;
    // Bilingual children of #snapshot-text: Chinese (textElZh) on top, a
    // low-key hairline divider, then the English secondary line. All three
    // live inside textEl's opacity wrapper so they fade in together; the
    // hairline + English line collapse (display:none) when textEn is empty
    // (old snapshots).
    private textElZh: HTMLDivElement;
    private hairlineEl: HTMLDivElement;
    private textElEn: HTMLDivElement;
    private config: OverlayConfig;
    private isVisible: boolean = false;

    // F6 share card: low-key corner entry shown while a snapshot is displayed
    // (only once a save handler is wired — no handler, no entry).
    private readonly saveEl: HTMLButtonElement;
    private readonly boundSave: (e: Event) => void;
    private onSave: ((snapshot: StateSnapshot) => void) | null = null;

    // Play-time display clock (advanced by update(delta); frozen while paused).
    private displayTime: number = 0;
    private patternTime: number = 0;
    private textPhase: 'pending' | 'shown' | 'hidden' = 'pending';

    // The pattern currently being rendered (null when hidden).
    private activeSnapshot: StateSnapshot | null = null;
    // Most recent snapshot shown (or seeded from persistence) — the replay
    // entry on the pause menu re-shows this (flow-audit medium #8).
    private lastSnapshot: StateSnapshot | null = null;

    // Reused pixel buffer for the fixed-size pattern canvas (no per-frame
    // ImageData allocation — flow-audit medium #9).
    private readonly imageData: ImageData;

    constructor(config: Partial<OverlayConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'snapshot-overlay';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            opacity: 0;
            transition: opacity ${this.config.fadeInDuration * 1000}ms ease-in-out;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Pattern canvas: FIXED small resolution, CSS-stretched to fullscreen.
        // image-rendering: pixelated keeps the 1-bit cells sharp while the CPU
        // only ever fills CANVAS_SIZE² pixels (flow-audit medium #9: the old
        // window-sized ImageData cost ~130k evaluations + ~8MB of writes per
        // frame at the narrative climax).
        this.canvas = document.createElement('canvas');
        this.canvas.width = SNAPSHOT_OVERLAY_CONFIG.CANVAS_SIZE;
        this.canvas.height = SNAPSHOT_OVERLAY_CONFIG.CANVAS_SIZE;
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            mix-blend-mode: multiply;
            image-rendering: pixelated;
        `;
        this.container.appendChild(this.canvas);

        // Create text element. #snapshot-text is the shared fade wrapper that
        // keeps the original centering / max-width / padding / background and
        // owns the single opacity transition; the Chinese line, hairline, and
        // English line are children so they fade in as one block.
        this.textEl = document.createElement('div');
        this.textEl.id = 'snapshot-text';
        this.textEl.style.cssText = `
            position: relative;
            z-index: 1;
            text-align: center;
            max-width: 80%;
            opacity: 0;
            transition: opacity 1s ease-in-out;
            padding: 20px;
            background: rgba(0, 0, 0, 0.6);
        `;

        // Chinese primary: 24px solid white, the original look on top.
        this.textElZh = document.createElement('div');
        this.textElZh.style.cssText = `
            font-family: 'Courier New', monospace;
            font-size: 24px;
            color: #ffffff;
            line-height: 1.6;
            text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
        `;
        this.textEl.appendChild(this.textElZh);

        // Duotone hairline divider: 1px, low-contrast translucent white — no
        // colour, in keeping with the 1-bit black/white aesthetic. Collapses
        // with the English line when textEn is empty.
        this.hairlineEl = document.createElement('div');
        this.hairlineEl.style.cssText = `
            height: 1px;
            margin: 12px auto;
            width: 40%;
            background: rgba(255, 255, 255, 0.18);
        `;
        this.textEl.appendChild(this.hairlineEl);

        // English secondary: smaller (19px) and dimmer (opacity 0.6), below.
        // Still clearly subordinate to the 24px Chinese, but the earlier 15px
        // read as too small on screen (the share card's larger en is fine).
        this.textElEn = document.createElement('div');
        this.textElEn.style.cssText = `
            font-family: 'Courier New', monospace;
            font-size: 19px;
            color: #ffffff;
            line-height: 1.5;
            opacity: 0.6;
            text-shadow: 1px 1px 6px rgba(0, 0, 0, 0.8);
        `;
        this.textEl.appendChild(this.textElEn);

        this.container.appendChild(this.textEl);

        // F6 share card: "keep this" in the corner. The container stays
        // pointer-events: none (the ritual is not a dialog); only this entry
        // re-enables events, and its click never bubbles to the document
        // enter-game/pointer-lock handlers — saving is not an intent to
        // resume play. Touch taps land here directly; desktop reaches it
        // after ESC (the pause gate freezes the display clock, so the
        // overlay waits instead of expiring).
        this.saveEl = document.createElement('button');
        this.saveEl.id = 'snapshot-save';
        this.saveEl.textContent = '⤓ 留存';
        this.saveEl.style.cssText = `
            position: absolute;
            right: 20px;
            bottom: 20px;
            z-index: 2;
            pointer-events: auto;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #ffffff;
            background: rgba(0, 0, 0, 0.6);
            border: none;
            text-decoration: underline;
            opacity: 0.55;
            padding: 10px 12px;
            display: none;
        `;
        this.boundSave = (e: Event) => {
            e.stopPropagation();
            if (this.activeSnapshot && this.onSave) {
                this.onSave(this.activeSnapshot);
            }
        };
        this.saveEl.addEventListener('click', this.boundSave);
        this.container.appendChild(this.saveEl);

        // Get 2D context
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D context');
        }
        this.ctx = ctx;
        this.imageData = ctx.createImageData(this.canvas.width, this.canvas.height);

        // Add to DOM
        document.body.appendChild(this.container);
    }

    /**
     * Show the overlay with a snapshot
     */
    show(snapshot: StateSnapshot): void {
        if (this.isVisible) {
            this.hide();
        }

        this.isVisible = true;
        this.activeSnapshot = snapshot;
        this.lastSnapshot = snapshot;
        this.displayTime = 0;
        this.patternTime = 0;
        this.textPhase = 'pending';

        // Render the first pattern frame immediately so the overlay is never
        // blank (e.g. shown from the pause menu while updates are gated).
        this.renderPattern(snapshot.pattern);

        // Show container; text appears after textDelay via update(delta).
        // textContent (not innerHTML) on both lines keeps the fixed copy safe.
        // Empty textEn (legacy snapshots) collapses the hairline + English
        // block so the layout degrades to Chinese-only with no gap.
        this.container.style.opacity = '1';
        this.textElZh.textContent = snapshot.text;
        const hasEn = snapshot.textEn.length > 0;
        this.textElEn.textContent = hasEn ? snapshot.textEn : '';
        this.textElEn.style.display = hasEn ? 'block' : 'none';
        this.hairlineEl.style.display = hasEn ? 'block' : 'none';
        this.textEl.style.opacity = '0';
        this.syncSaveEntry();

        console.log('[SnapshotOverlay] Showing snapshot:', snapshot.tags.join(', '));
    }

    /**
     * Wire the share-card export (F6). The corner entry only appears while a
     * snapshot is actually being displayed AND a handler is wired.
     */
    setOnSave(handler: (snapshot: StateSnapshot) => void): void {
        this.onSave = handler;
        this.syncSaveEntry();
    }

    /** Show/hide the corner save entry from the current display state. */
    private syncSaveEntry(): void {
        const available = this.isVisible && this.activeSnapshot !== null && this.onSave !== null;
        this.saveEl.style.display = available ? 'block' : 'none';
    }

    /**
     * Re-show the most recent snapshot (pause-menu replay entry,
     * flow-audit medium #8). Returns false when nothing is cached.
     */
    replayLast(): boolean {
        if (!this.lastSnapshot)
            return false;
        this.show(this.lastSnapshot);
        return true;
    }

    /**
     * Most recent snapshot shown (or seeded), null when none exists yet.
     */
    getLastSnapshot(): StateSnapshot | null {
        return this.lastSnapshot;
    }

    /**
     * Seed the replay cache without showing the overlay (used to restore the
     * previous session's persisted snapshot at boot).
     */
    seedLastSnapshot(snapshot: StateSnapshot): void {
        this.lastSnapshot = snapshot;
    }

    /**
     * Drop the cached last snapshot (the forgetting, F2 #4): the replay and
     * save-card entries lose their source and hide on the next sync.
     */
    clearLastSnapshot(): void {
        this.lastSnapshot = null;
    }

    /**
     * Advance the display clock and re-render the pattern. Delta-driven and
     * called from the (pause-gated) main update loop, so pausing freezes the
     * remaining display window instead of expiring it (flow-audit medium #8).
     */
    update(delta: number): void {
        if (!this.isVisible || !this.activeSnapshot)
            return;

        this.displayTime += delta;
        this.patternTime += delta;

        // Text window: fade in after textDelay, out after textDuration.
        if (this.textPhase === 'pending' && this.displayTime >= this.config.textDelay) {
            this.textPhase = 'shown';
            this.textEl.style.opacity = '1';
        }
        else if (
            this.textPhase === 'shown'
            && this.displayTime >= this.config.textDelay + this.config.textDuration
        ) {
            this.textPhase = 'hidden';
            this.textEl.style.opacity = '0';
        }

        if (this.displayTime >= this.config.displayDuration) {
            this.hide();
            return;
        }

        this.renderPattern(this.activeSnapshot.pattern);
    }

    /**
     * Hide the overlay
     */
    hide(): void {
        this.isVisible = false;
        this.activeSnapshot = null;
        this.syncSaveEntry();

        // Fade out
        this.container.style.opacity = '0';
        this.textEl.style.opacity = '0';
    }

    /**
     * Render the 1-bit pattern on the fixed-size canvas. The pattern math
     * lives in SnapshotPattern (shared with the F6 share card).
     */
    private renderPattern(pattern: PatternUniforms): void {
        const { width, height } = this.canvas;
        const imageData = this.imageData;
        const data = imageData.data;

        // One pattern evaluation per scale×scale block.
        const scale = SNAPSHOT_OVERLAY_CONFIG.PATTERN_BLOCK_SCALE;
        const scaledWidth = Math.ceil(width / scale);
        const scaledHeight = Math.ceil(height / scale);

        for (let sy = 0; sy < scaledHeight; sy++) {
            for (let sx = 0; sx < scaledWidth; sx++) {
                const u = sx / scaledWidth;
                const v = sy / scaledHeight;

                // Evaluate + threshold for 1-bit output (shared math).
                const isWhite = isPatternWhite(pattern, u, v, this.patternTime);
                const color = isWhite ? 255 : 0;
                const alpha = 180; // Semi-transparent

                // Fill scaled block
                for (let dy = 0; dy < scale && sy * scale + dy < height; dy++) {
                    for (let dx = 0; dx < scale && sx * scale + dx < width; dx++) {
                        const px = sx * scale + dx;
                        const py = sy * scale + dy;
                        const i = (py * width + px) * 4;
                        data[i] = color;
                        data[i + 1] = color;
                        data[i + 2] = color;
                        data[i + 3] = alpha;
                    }
                }
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Check if overlay is currently visible
     */
    isShowing(): boolean {
        return this.isVisible;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.hide();
        this.saveEl.removeEventListener('click', this.boundSave);
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
