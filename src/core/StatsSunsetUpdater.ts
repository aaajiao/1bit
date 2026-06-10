import type * as THREE from 'three';
import type { AudioController } from '../audio/AudioController';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { RunStatsCollector } from '../stats/RunStatsCollector';
import type { StateSnapshot } from '../stats/StateSnapshotGenerator';
import type { DayNightContext } from '../types';
import type { RoomType } from '../world/RoomConfig';
import type { WeatherSystem } from '../world/WeatherSystem';
import { SNAPSHOT_RITUAL, SUNSET_FORESHADOW } from '../config';
import { SnapshotOverlay } from '../stats/SnapshotOverlay';
import { loadLastSnapshot, saveLastSnapshot } from '../stats/SnapshotStorage';
import { StateSnapshotGenerator } from '../stats/StateSnapshotGenerator';
import { DayNightCycle } from '../world/DayNightCycle';

/** Frame-stable dependencies wired once at construction. */
export interface StatsSunsetDeps {
    scene: THREE.Scene;
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    audio: AudioController;
    weather: WeatherSystem;
    runStats: RunStatsCollector;
    player: PlayerManager;
}

/**
 * Per-frame stats & sunset-settlement wiring: accumulates run stats and
 * advances the day/night cycle, generating + showing the personalized state
 * snapshot at sunset. Owns the DayNightCycle, the snapshot generator, the
 * snapshot overlay, and the snapshot persistence/replay surfaces (the
 * "上次" start-screen line and the pause-menu replay entry — flow-audit
 * medium #8 / enhancement #8). main.ts only threads per-frame state in.
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

    // Low-key DOM surfaces on the start/pause screen (index.html).
    private readonly replayEl: HTMLElement | null;
    private readonly boundReplay: () => void;

    constructor(deps: StatsSunsetDeps) {
        this.runStats = deps.runStats;
        this.player = deps.player;
        this.audio = deps.audio;
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
        this.syncReplayEntry();
    }

    /** Show/hide the replay entry from the cache state. */
    private syncReplayEntry(): void {
        this.replayEl?.classList.toggle('hidden', this.snapshotOverlay.getLastSnapshot() === null);
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
            // (snapshot personalization wiring).
            const metrics = this.runStats.normalize();
            const tags = this.runStats.generateTags();
            this.snapshotOverlay.show(this.snapshotGenerator.generateFromMetrics(metrics, tags));

            // Settlement ritual (enhancement #9): dull the player's actions
            // for a beat and converge the audio, so an accidental input or a
            // loud world can't stomp the moment. Look stays live.
            this.player.suppressActions(SNAPSHOT_RITUAL.INPUT_DULL_SECONDS);
            this.audio.duckForSnapshot();
            this.syncReplayEntry();
            shown = true;
        }
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
            ? this.snapshotGenerator.generateFromMetrics(
                    this.runStats.normalize(),
                    this.runStats.generateTags(),
                )
            : this.snapshotOverlay.getLastSnapshot();
        if (snapshot) {
            saveLastSnapshot(snapshot);
        }
    }

    dispose(): void {
        // dispose() runs on beforeunload/HMR via PauseController -> main, so
        // this is the "page is going away" hook: save before tearing down.
        this.persistRun();
        this.replayEl?.removeEventListener('click', this.boundReplay);
        this.snapshotOverlay.dispose();
    }
}
