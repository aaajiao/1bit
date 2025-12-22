
export interface HUDState {
    posX: number;
    posZ: number;
    roomType: string;
    pitch: number; // in radians
    isShiftHeld: boolean;
    isGazing: boolean;
    overrideActive: boolean;
    overrideProgress: number; // 0-1
    tags: string[];
}

/**
 * Heads-Up Display Manager
 * Handles the debug overlay and status information
 */
export class HUD {
    private element: HTMLElement | null;

    constructor() {
        this.element = document.getElementById('coords');
        if (!this.element) {
            console.warn('HUD element with id "coords" not found');
        }
    }

    /**
     * Update the HUD display
     * @param state Current state of the application for display
     */
    update(state: HUDState): void {
        if (!this.element) return;

        const pitchDeg = Math.round(state.pitch * 180 / Math.PI);
        const shiftKey = state.isShiftHeld ? '⬆️SHIFT' : '';
        const gazing = state.isGazing ? '👁️GAZE' : '';
        const progress = state.overrideActive ? `[${Math.round(state.overrideProgress * 100)}%]` : '';
        const tagStr = state.tags.join(', ');

        this.element.innerText = `POS: ${state.posX}, ${state.posZ} | ${state.roomType} | ↑${pitchDeg}° ${shiftKey} ${gazing} ${progress}\n${tagStr}`;
    }
}
