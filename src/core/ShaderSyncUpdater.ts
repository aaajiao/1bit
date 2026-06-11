import type * as THREE from 'three';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { WeatherState } from '../types';
import type { ChunkManager } from '../world/ChunkManager';
import type { RoomType } from '../world/RoomConfig';
import type { ShaderUniformParams } from './ShaderUniformUpdater';
import { createShaderUniformParams, updateShaderUniforms } from './ShaderUniformUpdater';
import { StressLevel } from './StressLevel';

/**
 * Per-frame shader sync wiring: assembles the reused ShaderUniformParams
 * object from this frame's player/world state (fields mutated in place — the
 * per-frame uniform sync allocates nothing) and pushes it into the
 * DitherShader uniforms. Also owns the F5 stress->grain smoother
 * (core/StressLevel): pressure coarsens the dither sampling grid.
 * main.ts only threads per-frame state in.
 */
export class ShaderSyncUpdater {
    private readonly params: ShaderUniformParams;
    // F5 stress->grain smoother (pressure coarsens the dither sampling grid).
    private readonly stress = new StressLevel();

    constructor(
        shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
        private readonly chunkManager: ChunkManager,
        private readonly player: PlayerManager,
    ) {
        this.params = createShaderUniformParams(
            shaderQuad,
            chunkManager.getCurrentShaderConfig(),
        );
    }

    /**
     * Sync the DitherShader uniforms from this frame's state.
     * @param delta - Frame delta (s), for the stress smoothing.
     * @param t - Elapsed time (s).
     * @param weather - This frame's weather state.
     * @param playerState - The freshly updated player state.
     * @param currentRoomType - Room the player is in this frame.
     * @param sunsetForeshadow - 0-1 pre-sunset dusk ramp (StatsSunsetUpdater).
     */
    update(
        delta: number,
        t: number,
        weather: WeatherState,
        playerState: PlayerState,
        currentRoomType: RoomType,
        sunsetForeshadow: number,
    ): void {
        const sp = this.params;
        sp.t = t;
        sp.weather = weather;
        sp.shaderConfig = this.chunkManager.getCurrentShaderConfig();
        sp.flowerIntensity = playerState.flowerIntensity;
        sp.colorInversion = this.player.getColorInversionValue();
        sp.overrideProgress = playerState.overrideProgress;
        sp.rawBypass = this.player.getRawBypassValue();
        sp.overrideSustain = this.player.getOverrideSustain();
        sp.overrideResidue = this.player.getOverrideResidue();
        sp.gazeIntensity = playerState.gazeIntensity;
        sp.pitch = playerState.pitch;
        sp.gazeThresholdPulse = playerState.gazeThresholdPulse;
        sp.sunsetForeshadow = sunsetForeshadow;
        // Stress->grain (F5): pressure coarsens the dither sampling grid.
        sp.ditherScale = this.stress.update(
            delta,
            playerState.gazeIntensity,
            this.player.getOverrideSustain(),
            playerState.flowerIntensity,
            currentRoomType,
            sunsetForeshadow,
        );
        updateShaderUniforms(sp);
    }
}
