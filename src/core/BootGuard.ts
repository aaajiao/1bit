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
 * Guarded boot flow (M15): verify the canvas container and WebGL support,
 * then hand the container to `createApp`, rendering the DOM fallback for
 * every failure path (including a throwing constructor).
 */
export function bootWithGuards(createApp: (container: HTMLElement) => void): void {
    const container = document.getElementById('canvas-container');
    if (!container) {
        showFallback('无法启动：未找到画布容器。\nUnable to start: canvas container not found.');
        return;
    }
    if (!isWebGLAvailable()) {
        showFallback('你的浏览器或设备不支持 WebGL。\nYour browser or device does not support WebGL.');
        return;
    }
    try {
        createApp(container);
    }
    catch (e) {
        console.error('[ChimeraVoid] Failed to initialize', e);
        showFallback('启动失败，请刷新或更换浏览器。\nFailed to start. Try refreshing or another browser.');
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
