// 1-bit Chimera Void - Weather Reactions driver ("the world reacts")
//
// Per-frame distribution of the weather broadcast into the BEHAVIORAL layer:
// weather is felt because everything else responds. Owned and driven by
// core/RoomFlowUpdater (the same one-frame-stale broadcast the figures read
// — the sky-eye staleness precedent); all mappings are pure
// (world/WeatherReactions) and every knob decays to its exact rest value
// with the phase scalar that gates it.
//
// (a) GALE: one wind write leans on every cable and FA banner (CableSystem
//     module wind, consumed by next frame's geometry pass) and one shear
//     uniform skews the INFO record strips (DataWaterfall) — both carry the
//     half-strength aftermath residual, the wires ringing after the shove.
// (b) FOREWARN: the announced storm quickens the cable uplink's pulse rate
//     (a multiplier into the existing speed mapping, consumed by this
//     frame's uplink pass). The figures' forewarn facing is threaded by
//     RoomFlowUpdater directly — orientation priority lives in ONE place
//     (FigureSystem.figureAttitude).
// (c) AFTERMATH traces, each room answering in its own vocabulary, started
//     on the aftermath's opening edge and torn down on its closing edge:
//     INFO after RAIN pools glyph puddles (world/RainGlyphPuddles), FA
//     after STATIC lets its corrected shadows shiver then re-tidies them
//     bit-exact (world/ShadowAftermath), POLARIZED after GLITCH holds 1-2
//     near-seam buildings in the counterpart language (ChunkManager's
//     seam-hold contract).

import type * as THREE from 'three';
import type { WeatherState } from '../types';
import type { ChunkManager } from '../world/ChunkManager';
import { setCableWind, setUplinkRateScale, uplinkForewarnScale } from '../world/CableSystem';
import { updateWaterfallShear } from '../world/DataWaterfall';
import { RainGlyphPuddles } from '../world/RainGlyphPuddles';
import { RoomType } from '../world/RoomConfig';
import { ShadowAftermath } from '../world/ShadowAftermath';
import { galeWindStrength, waterfallShearFor } from '../world/WeatherReactions';
import { WEATHER_TYPES } from '../world/WeatherSystem';

export class WeatherReactionsUpdater {
    private readonly puddles = new RainGlyphPuddles();
    private readonly shadows = new ShadowAftermath();
    // Aftermath value seen last frame — the edge detector for trace start
    // (0 -> >0; WeatherSystem zeroes the residue for an event's whole run,
    // so the window can only ever open from exactly 0) and end (>0 -> 0,
    // including a fresh event stomping the residue early).
    private prevAftermath = 0;
    // Accumulated play-time clock (s) for the stepped shadow jitter —
    // delta-driven like every system clock here, frozen while paused.
    private clock = 0;

    /**
     * @param delta - Frame delta (s).
     * @param state - The weather broadcast (one frame stale; null on the
     *   boot frame — everything stays at rest).
     * @param playerPos - Player world position, fresh this frame.
     * @param chunkManager - Owns the chunk tree the aftermath traces live in.
     * @param currentRoomType - The player's room; each trace only fires when
     *   its storm ends over its own room.
     */
    update(
        delta: number,
        state: WeatherState | null,
        playerPos: THREE.Vector3,
        chunkManager: ChunkManager,
        currentRoomType: RoomType,
    ): void {
        this.clock += delta;
        if (state === null)
            return;

        // (a)+(b) knob distribution — three writes, all exact-rest at calm.
        const wind = galeWindStrength(state);
        setCableWind(wind, state.eventDirection);
        updateWaterfallShear(waterfallShearFor(wind, state.eventDirection));
        setUplinkRateScale(uplinkForewarnScale(state.forewarn));

        // (c) aftermath traces: opening edge stamps the room's own residue...
        if (state.aftermath > 0 && this.prevAftermath === 0) {
            if (state.lastEndedType === WEATHER_TYPES.RAIN
                && currentRoomType === RoomType.INFO_OVERFLOW) {
                this.puddles.stamp(playerPos, state.eventDirection, chunkManager);
            }
            else if (state.lastEndedType === WEATHER_TYPES.STATIC
                && currentRoomType === RoomType.FORCED_ALIGNMENT) {
                this.shadows.begin(playerPos, chunkManager);
            }
            else if (state.lastEndedType === WEATHER_TYPES.GLITCH
                && currentRoomType === RoomType.POLARIZED) {
                chunkManager.holdSeamShellsForAftermath(playerPos, state.eventDirection);
            }
        }
        // ...the closing edge (window drained, or a fresh event stomped the
        // residue) restores everything exactly.
        else if (state.aftermath <= 0 && this.prevAftermath > 0) {
            this.shadows.end();
            chunkManager.releaseHeldSeamShells();
        }
        this.prevAftermath = state.aftermath;

        // Per-frame trace presence (each a no-op while its trace is dormant).
        this.puddles.setDissolve(state.aftermath);
        this.shadows.update(this.clock, state.aftermath);
    }

    /**
     * Teardown: restore every jittered shadow, free the puddle pool's shared
     * assets, and park the module knobs at their exact rest values (they
     * outlive this instance — the CableSystem/DataWaterfall singletons).
     * Seam holds die with ChunkManager.dispose's chunk teardown.
     */
    dispose(): void {
        this.shadows.end();
        this.puddles.dispose();
        setCableWind(0, 0);
        updateWaterfallShear(0);
        setUplinkRateScale(1);
        this.prevAftermath = 0;
    }
}
