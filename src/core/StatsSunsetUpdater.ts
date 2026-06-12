import type * as THREE from 'three';
import type { AudioController } from '../audio/AudioController';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { RunStatsCollector } from '../stats/RunStatsCollector';
import type { ScarStore } from '../stats/ScarStorage';
import type { StateSnapshot } from '../stats/StateSnapshotGenerator';
import type { DayNightContext } from '../types';
import type { RoomType } from '../world/RoomConfig';
import type { WeatherSystem } from '../world/WeatherSystem';
import { FORGET_CONFIRM, SNAPSHOT_RITUAL, SUNSET_FORESHADOW } from '../config';
import { exportSnapshotCard } from '../stats/SnapshotCard';
import { SnapshotOverlay } from '../stats/SnapshotOverlay';
import { clearLastSnapshot, loadLastSnapshot, saveLastSnapshot } from '../stats/SnapshotStorage';
import { StateSnapshotGenerator } from '../stats/StateSnapshotGenerator';
import { clearStoredTrail, saveTrail, TrailRecorder } from '../stats/TrailRecorder';
import { DayNightCycle } from '../world/DayNightCycle';

/** Frame-stable dependencies wired once at construction. */
export interface StatsSunsetDeps {
    scene: THREE.Scene;
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    audio: AudioController;
    weather: WeatherSystem;
    runStats: RunStatsCollector;
    player: PlayerManager;
    /** Cross-run scar record (F2): override scars + runsCompleted. */
    scars: ScarStore;
}

/**
 * Per-frame stats & sunset-settlement wiring: accumulates run stats and
 * advances the day/night cycle, generating + showing the personalized state
 * snapshot at sunset. Owns the DayNightCycle, the snapshot generator, the
 * snapshot overlay, the snapshot persistence/replay surfaces (the
 * "上次" start-screen line and the pause-menu replay entry — flow-audit
 * medium #8 / enhancement #8), and the F4 ghost-trail recorder (persisted on
 * the same sunset/unload boundaries). main.ts only threads per-frame state in.
 */
export class StatsSunsetUpdater {
    private readonly dayNight = new DayNightCycle();
    private readonly snapshotGenerator = new StateSnapshotGenerator();
    private readonly snapshotOverlay = new SnapshotOverlay();
    private readonly runStats: RunStatsCollector;
    private readonly player: PlayerManager;
    private readonly audio: AudioController;
    // Built once: the day/night context (incl. the onSunset closure) is
    // frame-stable, so there is no need to reallocate it per frame.
    private readonly dayNightContext: DayNightContext;

    // Latest pre-sunset foreshadow level (0-1), refreshed each update and
    // consumed by main.ts for the duotone dusk shift (enhancement #8).
    private sunsetForeshadow = 0;

    // Cross-run scar record (F2): in-memory cache over localStorage.
    private readonly scars: ScarStore;

    // F4 ghost trail: this run's walk, sampled on the stats cadence and
    // persisted at sunset/unload — next session's GhostSystem replays it.
    private readonly trail = new TrailRecorder();

    // Low-key DOM surfaces on the start/pause screen (index.html).
    private readonly replayEl: HTMLElement | null;
    private readonly boundReplay: () => void;
    private readonly forgetEl: HTMLElement | null;
    private readonly boundForget: (e: Event) => void;
    // In-screen two-step confirm state for the forget entry (no native
    // dialog — the work's only system-level UI stays in the 1-bit language).
    private forgetArmed = false;
    private forgetRevertTimer: ReturnType<typeof setTimeout> | null = null;
    // F6 share card: pause-menu export entry next to the replay line.
    private readonly saveCardEl: HTMLElement | null;
    private readonly boundSaveCard: (e: Event) => void;

    constructor(deps: StatsSunsetDeps) {
        this.runStats = deps.runStats;
        this.player = deps.player;
        this.audio = deps.audio;
        this.scars = deps.scars;

        // F2 cross-run scars: every successful override (the existing
        // OverrideMechanic trigger chain, surfaced by PlayerManager with the
        // player's position) scars the PLACE it happened at — the anchor is
        // the resistance's own world position (aggregated within
        // SCAR_FIELD.RADIUS), persisted immediately (a tab close must not
        // lose it).
        deps.player.setOnOverrideSuccess((worldX, worldZ) => {
            this.scars.recordScar(worldX, worldZ);
            this.syncForgetEntry();
        });
        this.dayNightContext = {
            scene: deps.scene,
            shaderQuad: deps.shaderQuad,
            audio: deps.audio,
            weather: deps.weather,
            onSunset: () => this.onSunset(),
        };

        // Restore the previous session's persisted snapshot (enhancement #8):
        // seed the replay cache and surface the observation as one quiet line.
        const persisted = loadLastSnapshot();
        if (persisted) {
            this.snapshotOverlay.seedLastSnapshot(persisted);
            const note = document.getElementById('last-run-note');
            if (note) {
                note.textContent = `上次：${persisted.text}`;
                note.classList.remove('hidden');
            }
        }

        // Pause-menu replay entry (flow-audit medium #8): visible once any
        // snapshot is cached. The click bubbles on to the usual enter-game
        // handlers, so replaying also resumes play (where the overlay's
        // delta-driven clock actually advances).
        this.replayEl = document.getElementById('replay-snapshot');
        this.boundReplay = () => {
            this.snapshotOverlay.replayLast();
        };
        this.replayEl?.addEventListener('click', this.boundReplay);

        // F6 share card: two "keep this" surfaces, both exporting via
        // stats/SnapshotCard. (a) the overlay's corner entry covers the live
        // display window; (b) the pause-menu entry sits next to the replay
        // line and exports the cached last snapshot. Both stay hidden until
        // a snapshot exists (syncReplayEntry below).
        this.snapshotOverlay.setOnSave((snapshot) => {
            void exportSnapshotCard(snapshot);
        });
        this.saveCardEl = document.getElementById('save-snapshot-card');
        this.boundSaveCard = (e: Event) => {
            // Keep this click on the pause screen (same reasoning as the
            // forget entry): saving a card is not an intent to enter the game.
            e.stopPropagation();
            const snapshot = this.snapshotOverlay.getLastSnapshot();
            if (snapshot)
                void exportSnapshotCard(snapshot);
        };
        this.saveCardEl?.addEventListener('click', this.boundSaveCard);
        this.syncReplayEntry();

        // The forgetting (F2 #4): a deliberately subdued start/pause-screen
        // entry that erases the cross-run record (scars + runsCompleted) —
        // the visitor's right to reset the relationship. Shown only once the
        // system actually remembers something.
        this.forgetEl = document.getElementById('forget-scars');
        this.boundForget = (e: Event) => this.onForget(e);
        this.forgetEl?.addEventListener('click', this.boundForget);
        this.syncForgetEntry();
    }

    /** Show/hide the replay + save-card entries from the cache state. */
    private syncReplayEntry(): void {
        const missing = this.snapshotOverlay.getLastSnapshot() === null;
        this.replayEl?.classList.toggle('hidden', missing);
        this.saveCardEl?.classList.toggle('hidden', missing);
    }

    /** Show/hide the forget entry from the scar-record state (F2). */
    private syncForgetEntry(): void {
        this.forgetEl?.classList.toggle('hidden', !this.scars.hasMemory());
    }

    /**
     * Two-step in-screen confirm, then erase the cross-run record (F2 #4).
     * The first click arms the entry ("再点一次以遗忘"); without a second
     * click inside FORGET_CONFIRM.WINDOW_MS it quietly reverts. No native
     * dialog: the forgetting stays inside the work's own screen language.
     */
    private onForget(e: Event): void {
        // Keep this click on the start screen: without stopPropagation it
        // would bubble to the document click handlers and enter the game
        // (the replay entry bubbles on purpose; the forgetting must not).
        e.stopPropagation();
        if (!this.forgetArmed) {
            this.armForget();
            return;
        }
        this.disarmForget();
        this.scars.forgetAll();
        // The forgetting erases the ghost's memory too (F4): the stored
        // trail goes with the scars, and the in-memory recorder restarts
        // from zero — otherwise the next sunset/unload save would write
        // the pre-forget footprints right back. A ghost already walking
        // this session is in-flight memory and finishes its walk.
        clearStoredTrail();
        this.trail.reset();
        // "所有来访记录" includes the persisted "上次" snapshot: clear
        // the stored record, the start-screen line, and the replay /
        // save-card cache (their entries hide via syncReplayEntry).
        clearLastSnapshot();
        this.snapshotOverlay.clearLastSnapshot();
        document.getElementById('last-run-note')?.classList.add('hidden');
        this.syncReplayEntry();
        this.syncForgetEntry();
    }

    /** Arm the forget entry and start the auto-revert window (wall clock). */
    private armForget(): void {
        this.forgetArmed = true;
        if (this.forgetEl) {
            this.forgetEl.textContent = FORGET_CONFIRM.CONFIRM_TEXT;
            this.forgetEl.classList.add('armed');
        }
        this.forgetRevertTimer = setTimeout(() => this.disarmForget(), FORGET_CONFIRM.WINDOW_MS);
    }

    /** Restore the resting entry (confirm consumed, window lapsed, dispose). */
    private disarmForget(): void {
        this.forgetArmed = false;
        if (this.forgetRevertTimer !== null) {
            clearTimeout(this.forgetRevertTimer);
            this.forgetRevertTimer = null;
        }
        if (this.forgetEl) {
            this.forgetEl.textContent = FORGET_CONFIRM.IDLE_TEXT;
            this.forgetEl.classList.remove('armed');
        }
    }

    /**
     * Sunset settlement. Returns true when a snapshot was shown so the
     * DayNightCycle skips its forced-static weather roll for this transition
     * (flow-audit enhancement #9).
     */
    private onSunset(): boolean {
        let shown = false;
        // Skip the snapshot for runs below the minimum play time
        // (flow-audit #5: spurious "empty run" snapshots).
        if (this.runStats.hasMinimumSnapshotDuration()) {
            // Personalize the snapshot from this run's normalized metrics
            // (snapshot personalization wiring) and stamp the run length on
            // it (F6 share-card footer) BEFORE the stats reset below.
            const metrics = this.runStats.normalize();
            const tags = this.runStats.generateTags();
            this.snapshotOverlay.show({
                ...this.snapshotGenerator.generateFromMetrics(metrics, tags),
                durationSeconds: this.runStats.getDuration(),
            });

            // Settlement ritual (enhancement #9): dull the player's actions
            // for a beat and converge the audio, so an accidental input or a
            // loud world can't stomp the moment. Look stays live.
            this.player.suppressActions(SNAPSHOT_RITUAL.INPUT_DULL_SECONDS);
            this.audio.duckForSnapshot();
            this.syncReplayEntry();
            shown = true;
        }
        // One more completed run in the cross-session record (F2): the eye
        // will know this visitor a little better next time. Unconditional —
        // a sunset is a full day survived, snapshot or not.
        this.scars.recordRunCompleted();
        this.syncForgetEntry();
        // F4 ghost trail: a meaningful run's walk becomes next session's
        // ghost (too-short runs keep whatever trail is already stored), and
        // the recorder rolls over with the run either way.
        if (this.trail.hasMeaningfulTrail())
            saveTrail(this.trail.getPoints());
        this.trail.reset();
        // Reset for the next run AFTER the overlay snapshot is captured (M11).
        this.runStats.reset();
        // The run settles: the accumulated resistance residue (enhancement
        // #6, uMisregister layer) is forgotten along with the stats.
        this.player.resetOverrideResidue();
        return shown;
    }

    update(
        delta: number,
        playerState: PlayerState,
        playerPos: THREE.Vector3,
        currentRoomType: RoomType,
    ): void {
        this.runStats.update(
            delta,
            playerState.flowerIntensity,
            playerState.isGazing,
            playerState.pitch,
            currentRoomType,
            playerPos.x,
            playerState.overrideActive,
            playerState.overrideTriggered,
        );

        this.dayNight.update(delta, this.dayNightContext);

        // Pre-sunset foreshadow (~30s lead, enhancement #8): derived from the
        // delta-driven cycle phase — no new wall clock. Audio half here; the
        // visual half is read by main.ts via getSunsetForeshadow().
        this.sunsetForeshadow = this.dayNight.getSunsetForeshadow(SUNSET_FORESHADOW.LEAD_SECONDS);
        this.audio.updateSunsetForeshadow(this.sunsetForeshadow);

        // Snapshot display clock: delta-driven and pause-gated by main.ts, so
        // ESC/tab-hide freeze the window instead of burning it (medium #8).
        this.snapshotOverlay.update(delta);

        // F4 ghost trail: sample the walk on the stats cadence (2s).
        this.trail.update(delta, playerPos.x, playerPos.z, playerState.flowerIntensity);
    }

    /** Latest 0-1 pre-sunset foreshadow level (duotone dusk shift input). */
    getSunsetForeshadow(): number {
        return this.sunsetForeshadow;
    }

    /**
     * Persist the run's observation (enhancement #8). Prefers a fresh
     * snapshot of the CURRENT run when it is long enough to be meaningful;
     * otherwise falls back to the last settled snapshot, if any.
     */
    private persistRun(): void {
        const snapshot: StateSnapshot | null = this.runStats.hasMinimumSnapshotDuration()
            ? {
                    ...this.snapshotGenerator.generateFromMetrics(
                        this.runStats.normalize(),
                        this.runStats.generateTags(),
                    ),
                    // Run length for the F6 share-card footer.
                    durationSeconds: this.runStats.getDuration(),
                }
            : this.snapshotOverlay.getLastSnapshot();
        if (snapshot) {
            saveLastSnapshot(snapshot);
        }
        // F4 ghost trail (same unload semantics): persist the current run's
        // walk when it is long enough to be worth a ghost; otherwise leave
        // the previously stored trail in place (storage IS the fallback).
        if (this.trail.hasMeaningfulTrail())
            saveTrail(this.trail.getPoints());
    }

    dispose(): void {
        // dispose() runs on beforeunload/HMR via PauseController -> main, so
        // this is the "page is going away" hook: save before tearing down.
        this.persistRun();
        this.disarmForget();
        this.replayEl?.removeEventListener('click', this.boundReplay);
        this.forgetEl?.removeEventListener('click', this.boundForget);
        this.saveCardEl?.removeEventListener('click', this.boundSaveCard);
        this.snapshotOverlay.dispose();
    }
}
