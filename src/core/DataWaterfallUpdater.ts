import { nextWaterfallOffset, updateWaterfallOffset } from '../world/DataWaterfall';

/**
 * Data-waterfall clock (scene-style batch): integrates the INFO_OVERFLOW
 * record-strip scroll offset and pushes it into the ONE shared strip material
 * (world/DataWaterfall) — a single uniform write per frame regardless of how
 * many strips exist anywhere in the world. Rides the same per-frame flower
 * feed as the cable uplink (core/CableUplinkUpdater): the speed follows the
 * player's CURRENT flower intensity, so the brighter the self burns, the
 * faster the district churns its records. Kept in its own file (one system
 * per file); ProximityUpdaters composes it.
 *
 * The offset must be INTEGRATED (speed varies per frame with the flower), but
 * the proximity path threads elapsed time `t`, not delta — so the delta is
 * derived here from consecutive t values and clamped inside
 * nextWaterfallOffset (PERFORMANCE.MAX_FRAME_DELTA, the FrameClock contract).
 * FrameClock's t keeps running while updates are pause-gated, so the clamp is
 * what keeps a resume from teleporting the streams.
 */
export class DataWaterfallUpdater {
    // Shared scroll offset in [0,1) (texture heights).
    private offset = 0;
    // Elapsed seconds at the previous update; null until the first frame.
    private lastT: number | null = null;

    /**
     * @param t - Elapsed seconds (consecutive values integrate the scroll).
     * @param flowerIntensity - Player flower intensity in [0,1] (speed map).
     */
    update(t: number, flowerIntensity: number): void {
        const rawDt = this.lastT === null ? 0 : t - this.lastT;
        this.lastT = t;
        this.offset = nextWaterfallOffset(this.offset, rawDt, flowerIntensity);
        updateWaterfallOffset(this.offset);
    }

    /**
     * Reset internal state. The shared strip material/texture themselves are
     * owned and disposed by ChunkManager (disposeWaterfallAssets).
     */
    dispose(): void {
        this.offset = 0;
        this.lastT = null;
    }
}
