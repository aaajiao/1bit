// 1-bit Chimera Void - Snapshot Overlay
// DOM-based overlay for displaying state snapshots at day/night transitions

import type { StateSnapshot } from './StateSnapshotGenerator';
import { SNAPSHOT_OVERLAY_CONFIG } from '../config';

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
    private config: OverlayConfig;
    private isVisible: boolean = false;

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

        // Create text element
        this.textEl = document.createElement('div');
        this.textEl.id = 'snapshot-text';
        this.textEl.style.cssText = `
            position: relative;
            z-index: 1;
            font-family: 'Courier New', monospace;
            font-size: 24px;
            color: #ffffff;
            text-align: center;
            max-width: 80%;
            line-height: 1.6;
            text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
            opacity: 0;
            transition: opacity 1s ease-in-out;
            padding: 20px;
            background: rgba(0, 0, 0, 0.6);
        `;
        this.container.appendChild(this.textEl);

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
        this.container.style.opacity = '1';
        this.textEl.textContent = snapshot.text;
        this.textEl.style.opacity = '0';

        console.log('[SnapshotOverlay] Showing snapshot:', snapshot.tags.join(', '));
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

        // Fade out
        this.container.style.opacity = '0';
        this.textEl.style.opacity = '0';
    }

    /**
     * Render the 1-bit pattern on the fixed-size canvas
     */
    private renderPattern(pattern: {
        uPatternMode: number;
        uDensity: number;
        uFrequency: number;
        uPhase: number;
    }): void {
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

                let value = 0;

                switch (pattern.uPatternMode) {
                    case 0: // Noise
                        value = this.noise(u * pattern.uFrequency, v * pattern.uFrequency + this.patternTime * 0.1);
                        break;
                    case 1: // Stripes
                        value = Math.sin((u + v * Math.tan(pattern.uPhase)) * pattern.uFrequency) * 0.5 + 0.5;
                        break;
                    case 2: // Checkerboard
                        value = (Math.floor(u * pattern.uFrequency) + Math.floor(v * pattern.uFrequency)) % 2;
                        break;
                    case 3: // Radial
                        const dx = u - 0.5;
                        const dy = v - 0.5;
                        value = Math.sin(Math.sqrt(dx * dx + dy * dy) * pattern.uFrequency + pattern.uPhase + this.patternTime * 0.5) * 0.5 + 0.5;
                        break;
                }

                // Apply threshold for 1-bit output
                const isWhite = value > (1.0 - pattern.uDensity);
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
     * Simple 2D noise function
     */
    private noise(x: number, y: number): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        // Smoothstep
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);

        // Hash corners
        const a = this.hash(ix, iy);
        const b = this.hash(ix + 1, iy);
        const c = this.hash(ix, iy + 1);
        const d = this.hash(ix + 1, iy + 1);

        // Bilinear interpolation
        return this.mix(this.mix(a, b, sx), this.mix(c, d, sx), sy);
    }

    private hash(x: number, y: number): number {
        // Proper fract() (matching the GLSL twin); JS `% 1` is signed and biases
        // half the grid negative, darkening the noise pattern.
        const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return h - Math.floor(h);
    }

    private mix(a: number, b: number, t: number): number {
        return a + (b - a) * t;
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
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
