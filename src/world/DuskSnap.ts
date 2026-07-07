// 1-bit Chimera Void - Dusk Refusal (POLARIZED: time itself refuses the gray)
//
// black = the system, white = the self, dither = the friction between them.
// POLARIZED admits no gray — not even time's. The day/night machine already
// speaks in hard swaps everywhere (invertColors is a boolean, the background
// snaps its hex on the transition, RoomSky hard-swaps its palette roles); the
// ONE gradual day/night visual in the whole work is the pre-sunset dusk ramp
// (SUNSET_FORESHADOW: the duotone paper dims and warms across the day's last
// ~30s). In POLARIZED that PRESENTED ramp is stepped hard at its halfway
// point: the day holds absolutely pure, then the full dusk arrives in ONE
// frame — with a frame-counted old/new stutter on the snap (the codebase's
// established swap language, RoomSky's room-change flicker), never a fade.
//
// This is a CPU-side presentation transform, applied at the single choke
// point where the dusk ramp enters the screen path (core/ShaderSyncUpdater):
// every visual consumer of the ramp (the paper dusk shift and the stress
// grain input) reads the SAME presented value from the one params object.
// The LOGICAL day/night state machine is untouched by construction —
// presentedBlend is a pure read of DayNightCycle's OUTPUT, so isDaytime(),
// the day counter and the sunset snapshot trigger fire exactly as before
// (contract-tested beside the EclipseDarkening non-interference suite). No
// DitherShader uniform is added anywhere.

import { DUSK_SNAP } from '../config';

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The presented dusk blend for a room hardness:
 * mix(blend, step(0.5, blend), hardness), both inputs clamped to [0, 1].
 * hardness 0 is the exact identity (dusk blends in as everywhere); hardness
 * 1 is a hard step at the ramp's halfway point (dusk does not exist).
 * RoomTransition feeds partial hardness while a room crossing is in flight,
 * so entering/leaving POLARIZED mid-dusk glides between the two readings
 * instead of popping. Monotonic in blend for any fixed hardness. Pure.
 */
export function presentedBlend(blend: number, hardness: number): number {
    const b = clamp01(blend);
    const h = clamp01(hardness);
    const stepped = b >= 0.5 ? 1 : 0;
    return b + (stepped - b) * h;
}

/**
 * Snap-flicker output from the frames-left countdown: the OLD pole on odd
 * counts, the NEW on even — the RoomSky swapFlickerVisible parity, so an odd
 * DUSK_SNAP.FLICKER_FRAMES opens and closes on the old pole and then settles
 * on the new: an old/new/old stutter, never a fade. Pure.
 */
export function duskFlickerValue(framesLeft: number, oldPole: number, newPole: number): number {
    return framesLeft % 2 === 0 ? newPole : oldPole;
}

/**
 * Tiny stateful sequencer around the snap moment. core/ShaderSyncUpdater
 * drives ONE of these per frame — delta-gated upstream by main.ts, so paused
 * frames never advance the countdown. It watches the presented ramp for the
 * hard upward jump only a step can produce (DUSK_SNAP.JUMP_THRESHOLD in a
 * single frame) and stutters the output between the pre-snap and post-snap
 * poles for FLICKER_FRAMES frames. Falling edges (the ramp's collapse at the
 * actual sunset) never arm — that moment already owns its own hard swap.
 */
export class DuskSnapSequencer {
    /** Last RAW presented value (pre-flicker), for jump detection. */
    private prev = 0;
    /** Pre-snap pole the flicker stutters back to. */
    private oldPole = 0;
    /** Snap-flicker countdown (frames); 0 = settled passthrough. */
    private framesLeft = 0;

    /** Feed this frame's presented value; returns the value to display. */
    update(presented: number): number {
        if (presented - this.prev >= DUSK_SNAP.JUMP_THRESHOLD) {
            this.oldPole = this.prev;
            this.framesLeft = DUSK_SNAP.FLICKER_FRAMES;
        }
        this.prev = presented;
        if (this.framesLeft <= 0)
            return presented;
        const out = duskFlickerValue(this.framesLeft, this.oldPole, presented);
        this.framesLeft--;
        return out;
    }
}
