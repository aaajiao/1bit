import type { AudioController } from '../audio/AudioController';

/** Side effects the pause state machine needs from the app (wired by main). */
export interface PauseControllerDeps {
    audio: AudioController;
    /** Current pointer-lock status (PlayerManager controls). */
    isPointerLocked: () => boolean;
    /** Window resize side effect (camera/renderer/post-processing in main). */
    onResize: () => void;
    /** Reset frame timing so the first delta after a resume isn't inflated (M1). */
    onTimingReset: () => void;
    /** Full app dispose (beforeunload + Vite HMR). */
    onDispose: () => void;
}

/**
 * Window/document event wiring + pause state machine (H3/M1/M2/M4/H5/M14).
 *
 * Owns the persistent listeners (resize, pointerlockchange, visibilitychange,
 * first-gesture audio init/resume, beforeunload, Vite HMR) and the paused
 * flag that gates the whole per-frame UPDATE phase in main.ts: while paused
 * (no pointer lock / start screen shown / tab hidden) nothing advances; only
 * the render keeps presenting the last frame.
 */
export class PauseController {
    private paused = true;

    // Bound persistent handlers so they can be removed in dispose() (M14).
    private readonly boundResize: () => void;
    private readonly boundPointerLockChange: () => void;
    private readonly boundVisibilityChange: () => void;
    private readonly boundResumeAudio: () => void;
    private readonly boundBeforeUnload: () => void;

    constructor(private readonly deps: PauseControllerDeps) {
        this.boundResize = () => this.deps.onResize();
        this.boundPointerLockChange = () => this.syncFromPointerLock();
        this.boundVisibilityChange = () => this.onVisibilityChange();
        this.boundResumeAudio = () => this.onUserGesture();
        this.boundBeforeUnload = () => this.deps.onDispose();

        window.addEventListener('resize', this.boundResize);

        // Pause when pointer lock is lost (ESC / start screen) and resume when
        // it is (re)acquired (H3/M4).
        document.addEventListener('pointerlockchange', this.boundPointerLockChange);

        // Reset timing and recover audio across tab visibility changes (M1/H5).
        document.addEventListener('visibilitychange', this.boundVisibilityChange);

        // Persistent (NOT once) gesture listeners: init audio on first gesture and
        // resume a suspended context on any subsequent gesture so audio recovers
        // after tab blur (H5).
        document.addEventListener('click', this.boundResumeAudio);
        document.addEventListener('keydown', this.boundResumeAudio);

        // Ensure resources are released on navigation away (L-dispose).
        window.addEventListener('beforeunload', this.boundBeforeUnload);

        // Vite HMR: dispose the previous instance before a hot update.
        // `import.meta.hot` is a Vite extension; access it through a narrow local
        // type so this compiles without the ambient `vite/client` types.
        const meta = import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } };
        if (meta.hot) {
            meta.hot.dispose(() => this.deps.onDispose());
        }

        // Sync the initial pause state from the current pointer-lock status.
        this.syncFromPointerLock();
    }

    isPaused(): boolean {
        return this.paused;
    }

    /**
     * Re-sync the pause flag from the current lock/active status NOW. Touch
     * fallback mode has no pointerlockchange event, so the touch pause button
     * (Controls.exitTouchMode) requests an explicit sync after deactivating
     * (flow-audit: 触屏无退出/暂停路径). Desktop is unaffected — the
     * pointerlockchange listener already covers it.
     */
    syncPauseState(): void {
        this.syncFromPointerLock();
    }

    /**
     * First-gesture audio init + recover a suspended context on later gestures (H5).
     *
     * Both paths respect the paused invariant (paused = silent): a keypress on
     * the start screen or pause menu must NOT start/resume audio, because
     * setPaused early-returns on identical state and would never re-suspend it.
     */
    private onUserGesture(): void {
        // Re-sync FIRST. On desktop the pointerlockchange event also covers
        // this; on touch/trackpad fallback (no pointerlockchange) this is the
        // only signal that play has started — Controls' click handler runs
        // before this one (registered earlier) and has already set isLocked,
        // so an entry tap unpauses here before the audio decisions below.
        this.syncFromPointerLock();

        if (!this.deps.audio.enabled) {
            // The context must be created inside a user gesture (autoplay
            // policy), but init() starts the ambient drone — so when still
            // paused (start screen / pause menu), suspend it immediately; the
            // unpause edge in setPaused() resumes it.
            this.deps.audio.init();
            if (this.paused) {
                this.deps.audio.suspend();
            }
        }
        else if (!this.paused) {
            this.deps.audio.resume();
        }
    }

    /**
     * Toggle the pause state from the current pointer-lock status (H3/M4).
     */
    private syncFromPointerLock(): void {
        this.setPaused(!this.deps.isPointerLocked());
    }

    private onVisibilityChange(): void {
        if (document.hidden) {
            this.setPaused(true);
            return;
        }
        // Tab visible again. H5's recovery is for mid-play stalls only: while
        // paused (pause menu / start screen) audio must stay suspended — the
        // unpause edge in setPaused() owns the timing reset and resume.
        if (!this.paused) {
            // Reset timing so the first frame after returning isn't inflated (M1).
            this.deps.onTimingReset();
            // Resume audio if the context was suspended while hidden (H5).
            this.deps.audio.resume();
        }
    }

    /**
     * Enter/leave the paused state. On pause we suspend audio; on resume we
     * resume it and reset frame timing so delta isn't inflated (M1/H5).
     */
    private setPaused(paused: boolean): void {
        if (paused === this.paused)
            return;
        this.paused = paused;
        if (paused) {
            this.deps.audio.suspend();
        }
        else {
            this.deps.onTimingReset();
            this.deps.audio.resume();
        }
    }

    /**
     * Remove all persistent window/document listeners (M14).
     */
    dispose(): void {
        window.removeEventListener('resize', this.boundResize);
        document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
        document.removeEventListener('visibilitychange', this.boundVisibilityChange);
        document.removeEventListener('click', this.boundResumeAudio);
        document.removeEventListener('keydown', this.boundResumeAudio);
        window.removeEventListener('beforeunload', this.boundBeforeUnload);
    }
}
