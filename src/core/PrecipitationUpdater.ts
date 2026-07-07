import type * as THREE from 'three';
import type { WeatherState } from '../types';
import type { RoomType } from '../world/RoomConfig';
import { AshTraces } from '../world/AshTraces';
import { computePrecipitationDrive, createPrecipitationDrive, Precipitation } from '../world/Precipitation';
import { ROOM_CONFIGS } from '../world/RoomConfig';

/**
 * World-space precipitation clock (weather batch): maps this frame's weather
 * broadcast to the falling layer's drive (world/Precipitation — rain dashes,
 * ash motes, gale wind) and the ash-trace ground pool (world/AshTraces), a
 * handful of uniform writes per frame. Follows the DataWaterfallUpdater
 * wiring precedent: its own file (one system per file), composed inside an
 * existing core helper so main.ts stays untouched — it lives in
 * StatsSunsetUpdater beside RoomSky because, like the dome, its ink/paper
 * polarity must follow the DayNightCycle's phase exactly.
 *
 * The drive object is allocated once and mutated in place (the
 * ShaderSyncUpdater params pattern): the per-frame path allocates nothing.
 * The room's rain flavor (weatherRainDensity — INFO_OVERFLOW's data
 * downpour, POLARIZED's dry ruptures) is read from the player's CURRENT
 * room; it hard-swaps on room change, which is the 1-bit language.
 */
export class PrecipitationUpdater {
    private readonly falling: Precipitation;
    private readonly traces: AshTraces;
    private readonly drive = createPrecipitationDrive();

    constructor(scene: THREE.Scene) {
        this.falling = new Precipitation(scene);
        this.traces = new AshTraces(scene);
    }

    /**
     * @param delta - Frame delta (s), pause-gated upstream.
     * @param state - Latest weather broadcast, or null before the weather
     *   system's first update (boot frame): everything stays at rest.
     * @param playerPos - Player world position (this frame).
     * @param roomType - Player's current room (rain flavor + crack keep-out).
     * @param isDay - DayNightCycle day phase (mark polarity).
     */
    update(
        delta: number,
        state: WeatherState | null,
        playerPos: THREE.Vector3,
        roomType: RoomType,
        isDay: boolean,
    ): void {
        if (state === null)
            return;
        computePrecipitationDrive(state, ROOM_CONFIGS[roomType].shader.weatherRainDensity, this.drive);
        this.falling.update(delta, this.drive, playerPos, isDay);
        this.traces.update(delta, state, playerPos, roomType, isDay);
    }

    /** Dispose both layers (app teardown). */
    dispose(): void {
        this.falling.dispose();
        this.traces.dispose();
    }
}
