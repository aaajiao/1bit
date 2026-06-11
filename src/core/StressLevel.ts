// 1-bit Chimera Void - Stress level (F5 "分辨率即情绪")
// Pure pressure math + a tiny stateful smoother. The combined 0-1 stress of
// the moment — being gazed at, holding the resistance, blazing the flower
// inside INFO_OVERFLOW, the dying day — maps to the dither sampling scale
// (uDitherScale): pressure coarsens the screen's grain, release refines it.
// main.ts drives ONE StressLevel per frame and feeds the result into the
// reused ShaderUniformParams (a global player layer, like the gaze contrast
// — room reactivity stays baked upstream in RoomTransition).
import { STRESS } from '../config';
import { RoomType } from '../world/RoomConfig';

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Combine the frame's pressure sources into a raw 0-1 stress target.
 * Max-combine (not sum): concurrent pressures never stack past full panic,
 * and each source alone carries the grain to its own ceiling. Pure.
 *
 * - gazeIntensity: 0-1 smoothed gaze (GazeMechanic curve) — being seen.
 * - overrideSustain: 0-1 held resistance past the trigger — still pressing.
 * - flowerIntensity: 0-1; ONLY inside INFO_OVERFLOW does a blazing flower
 *   read as overload (ramping from INFO_FLOWER_OVERLOAD_START to 1) — the
 *   room's "more input != more clarity" lesson on the grain channel.
 * - sunsetForeshadow: 0-1 last-moments-of-day ramp, weighted down so the
 *   ending tightens the grain without reaching full panic.
 */
export function computeRawStress(
    gazeIntensity: number,
    overrideSustain: number,
    flowerIntensity: number,
    roomType: RoomType,
    sunsetForeshadow: number,
): number {
    const gaze = clamp01(gazeIntensity);
    const resistance = clamp01(overrideSustain);
    const overload = roomType === RoomType.INFO_OVERFLOW
        ? clamp01(
                (flowerIntensity - STRESS.INFO_FLOWER_OVERLOAD_START)
                / (1 - STRESS.INFO_FLOWER_OVERLOAD_START),
            )
        : 0;
    const dying = clamp01(sunsetForeshadow) * STRESS.SUNSET_WEIGHT;
    return Math.max(gaze, resistance, overload, dying);
}

/**
 * Asymmetric exponential smoothing step: fast attack (~ATTACK_SECONDS time
 * constant) when stress rises, slow release (~RELEASE_SECONDS) when it
 * drains. Frame-rate independent: 1 - exp(-delta/tau) composes exactly
 * across arbitrary delta splits while the target stays on one side. Pure.
 */
export function stepStress(current: number, target: number, delta: number): number {
    const tau = target > current ? STRESS.ATTACK_SECONDS : STRESS.RELEASE_SECONDS;
    const k = 1 - Math.exp(-delta / tau);
    return current + (target - current) * k;
}

/**
 * Map a smoothed 0-1 stress to the dither sampling scale
 * (SCALE_MIN at calm -> SCALE_MAX at full pressure), clamped. Pure.
 */
export function ditherScaleForStress(stress: number): number {
    return STRESS.SCALE_MIN + (STRESS.SCALE_MAX - STRESS.SCALE_MIN) * clamp01(stress);
}

/**
 * Stateful wrapper main.ts drives once per frame: smooths the raw stress
 * (attack fast / release slow) and returns the dither scale to feed into
 * ShaderUniformParams.ditherScale. All math delegates to the pure functions
 * above. Positional args so the per-frame call allocates nothing.
 */
export class StressLevel {
    private smoothed: number = 0;

    update(
        delta: number,
        gazeIntensity: number,
        overrideSustain: number,
        flowerIntensity: number,
        roomType: RoomType,
        sunsetForeshadow: number,
    ): number {
        const target = computeRawStress(
            gazeIntensity,
            overrideSustain,
            flowerIntensity,
            roomType,
            sunsetForeshadow,
        );
        this.smoothed = stepStress(this.smoothed, target, delta);
        return ditherScaleForStress(this.smoothed);
    }

    /** Current smoothed 0-1 stress (post-attack/release filtering). */
    getStress(): number {
        return this.smoothed;
    }
}
