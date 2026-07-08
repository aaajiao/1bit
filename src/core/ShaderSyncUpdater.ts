import type * as THREE from 'three';
import type { PlayerManager, PlayerState } from '../player/PlayerManager';
import type { WeatherState } from '../types';
import type { ChunkManager } from '../world/ChunkManager';
import type { RoomType } from '../world/RoomConfig';
import type { BurnInPass } from './BurnInPass';
import type { ShaderUniformParams } from './ShaderUniformUpdater';
import { DuskSnapSequencer, presentedBlend } from '../world/DuskSnap';
import { getBurnInPass } from './BurnInPass';
import { createShaderUniformParams, updateShaderUniforms } from './ShaderUniformUpdater';
import { StressLevel } from './StressLevel';

/**
 * Per-frame shader sync wiring: assembles the reused ShaderUniformParams
 * object from this frame's player/world state (fields mutated in place — the
 * per-frame uniform sync allocates nothing) and pushes it into the
 * DitherShader uniforms. Also owns the F5 stress->grain smoother
 * (core/StressLevel): pressure coarsens the dither sampling grid — and feeds
 * the burn-in pass its CPU frame (camera stillness + room gate) along the
 * same camera-state route. main.ts only threads per-frame state in.
 */
export class ShaderSyncUpdater {
    private readonly params: ShaderUniformParams;
    // F5 stress->grain smoother (pressure coarsens the dither sampling grid).
    private readonly stress = new StressLevel();
    // Dusk refusal (POLARIZED): snap-moment flicker sequencer for the
    // presented dusk ramp (world/DuskSnap).
    private readonly duskSnap = new DuskSnapSequencer();
    // Burn-in afterimage (INFO_OVERFLOW): the GPU pass registered against the
    // shader quad by createPostProcessing; fed one CPU frame per update.
    private readonly burnIn: BurnInPass | null;

    constructor(
        shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
        private readonly chunkManager: ChunkManager,
        private readonly player: PlayerManager,
    ) {
        this.params = createShaderUniformParams(
            shaderQuad,
            chunkManager.getCurrentShaderConfig(),
        );
        this.burnIn = getBurnInPass(shaderQuad);
    }

    /**
     * Sync the DitherShader uniforms from this frame's state.
     * @param delta - Frame delta (s), for the stress smoothing.
     * @param t - Elapsed time (s).
     * @param weather - This frame's weather state.
     * @param playerState - The freshly updated player state.
     * @param currentRoomType - Room the player is in this frame.
     * @param sunsetForeshadow - 0-1 RAW pre-sunset dusk ramp
     *   (StatsSunsetUpdater); the room's duskHardness presentation step
     *   (world/DuskSnap) is applied here before any consumer sees it.
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
        // Dusk refusal ("no dusk in POLARIZED — time itself refuses the
        // gray"): the raw pre-sunset ramp passes through the room's
        // duskHardness step HERE, the single point where the ramp enters the
        // screen path — so the paper dusk shift and the stress grain input
        // below read the SAME presented value, and the room scalar is the
        // TRANSITION-BLENDED config (crossing a POLARIZED boundary mid-dusk
        // glides). The logical day/night machine upstream (DayNightCycle:
        // isDaytime, day counter, sunset snapshot) never sees this
        // transform; the ambient drone's descent (StatsSunsetUpdater's audio
        // half) deliberately keeps the raw ramp — time still passes and can
        // still be HEARD passing; POLARIZED only refuses to show its gray.
        const presentedDusk = this.duskSnap.update(
            presentedBlend(sunsetForeshadow, sp.shaderConfig.duskHardness),
        );
        sp.sunsetForeshadow = presentedDusk;
        // Stress->grain (F5): pressure coarsens the dither sampling grid.
        sp.ditherScale = this.stress.update(
            delta,
            playerState.gazeIntensity,
            this.player.getOverrideSustain(),
            playerState.flowerIntensity,
            currentRoomType,
            presentedDusk,
        );
        // Burn-in stare detection (INFO_OVERFLOW afterimage): camera
        // orientation -> stillness, plus the room's transition-blended burn
        // gate. Delta-driven HERE — main gates this update while paused, so a
        // paused frame arms no accumulation and the ghost freezes.
        this.burnIn?.setFrame(
            delta,
            this.player.controls.getCamera().quaternion,
            sp.shaderConfig.burnInStrength,
        );
        updateShaderUniforms(sp);
    }
}
