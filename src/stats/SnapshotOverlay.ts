// 1-bit Chimera Void - Snapshot Overlay
// DOM-based overlay for displaying state snapshots at day/night transitions

import type { StateSnapshot } from './StateSnapshotGenerator';

/**
 * Overlay display configuration
 */
export interface OverlayConfig {
    displayDuration: number;    // Total display time (ms)
    fadeInDuration: number;     // Fade in time (ms)
    fadeOutDuration: number;    // Fade out time (ms)
    textDelay: number;          // Delay before text appears (ms)
    textDuration: number;       // How long text stays visible (ms)
}

const DEFAULT_CONFIG: OverlayConfig = {
    displayDuration: 8000,
    fadeInDuration: 1500,
    fadeOutDuration: 1500,
    textDelay: 1000,
    textDuration: 5000,
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
    private hideTimeoutId: number | null = null;
    private textHideTimeoutId: number | null = null;
    private animationFrameId: number | null = null;
    private patternTime: number = 0;

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
            transition: opacity ${this.config.fadeInDuration}ms ease-in-out;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Create canvas for pattern
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            mix-blend-mode: multiply;
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

        // Add to DOM
        document.body.appendChild(this.container);

        // Handle resize
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    /**
     * Resize canvas to match window
     */
    private resizeCanvas(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Show the overlay with a snapshot
     */
    show(snapshot: StateSnapshot): void {
        if (this.isVisible) {
            this.hide();
        }

        this.isVisible = true;

        // Start pattern animation
        this.patternTime = 0;
        this.startPatternAnimation(snapshot);

        // Show container
        this.container.style.opacity = '1';

        // Show text after delay
        setTimeout(() => {
            this.textEl.textContent = snapshot.text;
            this.textEl.style.opacity = '1';
        }, this.config.textDelay);

        // Hide text before container
        this.textHideTimeoutId = window.setTimeout(() => {
            this.textEl.style.opacity = '0';
        }, this.config.textDelay + this.config.textDuration);

        // Hide overlay after display duration
        this.hideTimeoutId = window.setTimeout(() => {
            this.hide();
        }, this.config.displayDuration);

        console.log('[SnapshotOverlay] Showing snapshot:', snapshot.tags.join(', '));
    }

    /**
     * Hide the overlay
     */
    hide(): void {
        this.isVisible = false;

        // Cancel pending timeouts
        if (this.hideTimeoutId !== null) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }
        if (this.textHideTimeoutId !== null) {
            clearTimeout(this.textHideTimeoutId);
            this.textHideTimeoutId = null;
        }
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Fade out
        this.container.style.opacity = '0';
        this.textEl.style.opacity = '0';
    }

    /**
     * Start pattern rendering animation
     */
    private startPatternAnimation(snapshot: StateSnapshot): void {
        const pattern = snapshot.pattern;

        const animate = () => {
            if (!this.isVisible) return;

            this.patternTime += 0.016; // ~60fps
            this.renderPattern(pattern);

            this.animationFrameId = requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Render the 1-bit pattern on canvas
     */
    private renderPattern(pattern: {
        uPatternMode: number;
        uDensity: number;
        uFrequency: number;
        uPhase: number
    }): void {
        const { width, height } = this.canvas;
        const imageData = this.ctx.createImageData(width, height);
        const data = imageData.data;

        // Scale down for performance
        const scale = 4;
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
        return (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
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
