import type * as THREE from 'three';

/**
 * Manages screenshot capture functionality
 */
export class ScreenshotManager {
    private renderer: THREE.WebGLRenderer;

    constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer;
        this.setupKeyHandler();
    }

    private setupKeyHandler(): void {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code === 'KeyP') {
                this.takeScreenshot();
            }
        });
    }

    /**
     * Capture and download a screenshot of the current frame
     */
    public takeScreenshot(): void {
        // Get canvas data URL
        const canvas = this.renderer.domElement;
        const dataURL = canvas.toDataURL('image/png');

        // Create download link
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `1bit-chimera-${timestamp}.png`;
        link.href = dataURL;
        link.click();

        console.log('[Screenshot] Saved:', link.download);
    }
}
