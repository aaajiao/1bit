// Boot-time guards (M15): WebGL detection + DOM fallback rendering.

/**
 * Detect minimal WebGL availability before booting the experience (M15).
 */
export function isWebGLAvailable(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext
            && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    }
    catch {
        return false;
    }
}

/**
 * Render a plain DOM fallback message instead of a blank page + console error (M15).
 */
export function showFallback(message: string): void {
    const fallback = document.createElement('div');
    fallback.id = 'boot-fallback';
    fallback.style.cssText
        = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
            + 'padding:24px;color:#fff;background:#000;font-family:"Courier New",monospace;'
            + 'text-align:center;line-height:1.6;z-index:1000;';
    fallback.innerText = message;
    document.body.appendChild(fallback);
}
