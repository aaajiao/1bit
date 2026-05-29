import type { OverrideHintDisplay } from '../types/player';

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
    // Optional [SHIFT]-resistance hint. Populated by main from the
    // OverrideMechanic hint state; optional for backward compatibility.
    hint?: OverrideHintDisplay;
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
        if (!this.element)
            return;

        const pitchDeg = Math.round(state.pitch * 180 / Math.PI);
        const shiftKey = state.isShiftHeld ? '⬆️SHIFT' : '';
        const gazing = state.isGazing ? '👁️GAZE' : '';
        const progress = state.overrideActive ? `[${Math.round(state.overrideProgress * 100)}%]` : '';
        const tagStr = state.tags.join(', ');
        const hintStr = state.hint && state.hint.visible ? `\n${state.hint.text}` : '';

        this.element.innerText = `POS: ${state.posX.toFixed(1)}, ${state.posZ.toFixed(1)} | ${state.roomType} | ↑${pitchDeg}° ${shiftKey} ${gazing} ${progress}\n${tagStr}${hintStr}`;
    }
}
