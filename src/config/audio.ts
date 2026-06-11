// Audio Configuration
// All audio-related constants for easy tuning

/**
 * Master audio settings
 */
export const AUDIO_MASTER = {
    /** Default master volume (0-1) */
    defaultVolume: 0.3,
    /** Gaze filter range Hz */
    gazeFilterOpen: 20000,
    gazeFilterClosed: 400,
    /**
     * Exponential approach rate (1/s) of the gaze lowpass glide in
     * LOG-frequency space (flow-audit enhancement #7). The old linear-Hz lerp
     * spent most of its time inaudibly far above the 400Hz target, stretching
     * the perceived "muffle" to 2-3x the promised 0.5s; in log space each step
     * covers an equal fraction of the remaining OCTAVES. Time constant ~0.17s
     * => ~95% of the perceptual distance inside 0.5s.
     */
    gazeFilterLerpSpeed: 6.0,
    /** Relative (log-domain) convergence epsilon below which the filter snaps. */
    gazeFilterEpsilon: 0.002,
};

/**
 * Footstep audio configuration
 */
export const FOOTSTEP_CONFIG = {
    /** Minimum interval between footsteps (seconds) */
    minInterval: 0.25,
    /** Frequency range Hz */
    minFrequency: 80,
    maxFrequency: 120,
    /** Volume */
    volume: 0.15,
};

/**
 * Cable audio configuration
 */
export const CABLE_AUDIO_CONFIG = {
    /** Base hum frequency */
    humFrequency: 100,
    /** Max volume when close to cable */
    maxVolume: 0.15,
};

/**
 * Rift audio configuration
 */
export const RIFT_AUDIO_CONFIG = {
    /** Fog noise volume at max proximity */
    fogMaxVolume: 0.8,
    /** Fall sound fade in time (seconds) */
    fallFadeIn: 0.5,
};

/**
 * "Being watched" hum (flow-audit break #4): a low drone that fades in as the
 * flower gets bright enough to attract the sky eye's attention. Gentle by
 * design — a felt presence, not an alarm.
 */
export const FLOWER_ATTENTION_CONFIG = {
    /** Flower intensity above which the watched-hum starts fading in */
    threshold: 0.6,
    /** Hum oscillator frequency (Hz, low) */
    frequency: 46,
    /** Hum gain at flower intensity 1.0 */
    maxGain: 0.05,
    /** setTargetAtTime time constant (s) for hum gain fades */
    fadeTime: 0.8,
    /** Slow frequency-wobble LFO rate (Hz) and depth (Hz) so the hum breathes */
    lfoRate: 0.15,
    lfoDepth: 1.5,
};

/**
 * Override denied thud (flow-audit break #2, failure-feedback tier 2): an
 * extremely light low-frequency thump played when the player holds the
 * override key in POLARIZED without gazing — "the direction is wrong".
 * Non-POLARIZED rooms stay silent by design (only here can you resist).
 */
export const OVERRIDE_DENIED_CONFIG = {
    /** Thud frequency sweep (Hz, low and soft) */
    frequency: 70,
    frequencyEnd: 36,
    /** Thud length (seconds) */
    duration: 0.18,
    /** Very light volume — a nudge, not a buzzer */
    volume: 0.07,
};

/**
 * Distant tear (F3 silhouette rebellion): the player's own override tear,
 * heard from far away when a distant figure breaks rank — quieter, duller
 * (lowpassed), slightly longer. Volume scales with the trigger proximity
 * (1 = the closest possible rebellion, FIGURES.REBEL_MIN_DISTANCE; 0 = the
 * farthest), so the rip always reads as happening ELSEWHERE.
 */
export const DISTANT_TEAR_CONFIG = {
    /** Volume at proximity 0 (farthest trigger distance). */
    minVolume: 0.03,
    /** Volume at proximity 1 (closest trigger distance). */
    maxVolume: 0.12,
    /** Noise burst length (s) — longer than the player's own 0.3s tear. */
    duration: 0.5,
    /** Lowpass cutoff (Hz): distance eats the highs. */
    filterFreq: 900,
    filterQ: 0.8,
};

/**
 * Flower-intensity change confirm tone (flow-audit medium #6): event-driven
 * from the player's wheel / Q-E / touch-button input. Pitch rises with the
 * new intensity so each tick is an audible confirmation of the change.
 */
export const FLOWER_CHANGE_TONE_CONFIG = {
    /** Minimum interval between confirm tones (s) — debounces rapid scrolling */
    debounceSeconds: 0.09,
    /** Pitch mapping: frequency = base + intensity * range */
    baseFrequency: 150,
    frequencyRange: 350,
    /** Tone length (s), volume, and attack (s) */
    duration: 0.18,
    volume: 0.05,
    attack: 0.03,
};

/**
 * INFO_OVERFLOW chirp volume scaling (flow-audit break #8): chirps get louder
 * as the flower brightens — more input, more meaningless chatter.
 */
export const INFO_CHIRP_CONFIG = {
    /** Chirp volume at flower intensity 0 */
    minVolume: 0.02,
    /** Chirp volume at flower intensity 1 */
    maxVolume: 0.06,
};

/**
 * FORCED_ALIGNMENT binaural side asymmetry (flow-audit break #7): the beat
 * frequency narrows toward consonance on the LEFT of the rift and widens
 * toward dissonance on the RIGHT, matching the tidy-left/broken-right visuals.
 */
export const BINAURAL_SIDE_CONFIG = {
    /**
     * Fractional beat-frequency change at full side displacement:
     * effective beat = beatFreq * (1 + side * detuneGain), side in [-1, 1].
     */
    detuneGain: 0.6,
    /** setTargetAtTime time constant (s) for side-driven beat retunes */
    glide: 0.15,
    /**
     * Audible half-width (meters) of the binaural field around the rift crack:
     * beat intensity fades to 0 at this distance from the crack center, and
     * the signed side displacement is normalized by it (RiftMechanic ->
     * AudioController.updateBinauralPosition).
     */
    fieldWidth: 20,
};

/**
 * Per-room ambient configuration.
 *
 * Drives the retunable ambient drone (osc1/osc2) and an optional filtered
 * white-noise bed on room change. Frequencies for the drone partner are derived
 * from the room's `baseFrequency` via `harmonicRatio[harmonic]`:
 *   - consonant => octave  (POLARIZED 40 => 40/80, pure octave, no beat)
 *   - dissonant => ~1.4x   (IN_BETWEEN 50 => 50/70, dissonant beat)
 *   - binaural  => +detune (FORCED_ALIGNMENT; the binaural beat system handles
 *                           the L/R split, so the drone stays a subtle pair)
 */
export const ROOM_AMBIENT_CONFIG = {
    /** Multiplier applied to baseFrequency to derive the drone's second oscillator. */
    harmonicRatio: {
        consonant: 2.0, // octave
        dissonant: 1.4, // dissonant interval (~tritone-ish)
        binaural: 1.0, // unison; small fixed detune added on top
    } as Record<'consonant' | 'dissonant' | 'binaural', number>,
    /** Small absolute detune (Hz) added to the binaural-room drone partner. */
    binauralDroneDetune: 0.5,
    /** Lowpass cutoff (Hz) for the retuned drone (keeps it sub/low). */
    droneFilterFreq: 200,
    /** Time constant (s) for setTargetAtTime drone-frequency glides on retune. */
    droneRetuneGlide: 0.4,
    /** Time constant (s) for noise-bed gain fades (in and out). */
    noiseFadeTime: 0.6,
    /**
     * Hard ceiling on the noise-bed gain regardless of a room's configured
     * noiseGain. Matches the design's INFO_OVERFLOW 0.15 ceiling.
     */
    noiseGainCeiling: 0.15,
    /** Bandpass center (Hz) and Q for the high hiss bed (INFO_OVERFLOW style). */
    noiseBandHighFreq: 4000, // centered in the 2-6kHz hiss range
    noiseBandHighQ: 0.6,
    /** Bandpass center (Hz) and Q for the low/dull noise bed (IN_BETWEEN style). */
    noiseBandLowFreq: 600,
    noiseBandLowQ: 0.8,
    /** noiseGain threshold above which the "high hiss" band is used (else low). */
    noiseHighBandThreshold: 0.1,
    /** Looping noise buffer length (s); reused across all rooms (pooled). */
    noiseBufferSeconds: 2,
    /**
     * Debounce (ms) before a room change retunes the drone / swaps the noise bed.
     * Prevents thrash when the player oscillates across a chunk seam.
     */
    retuneDebounceMs: 250,
    /**
     * Minimum interval (s, audio-clock) between one-shot transition whooshes
     * (flow-audit medium #5): strafing along a room boundary re-crosses the
     * seam every few hundred ms, and without a cooldown every crossing fires a
     * full whoosh. The first crossing still plays immediately.
     */
    whooshMinInterval: 1.8,
};

/**
 * Sunset-settlement audio convergence (flow-audit enhancement #9): when the
 * snapshot lands, a temporary lowpass ceiling rides the existing gaze-filter
 * pipeline (AudioEngine.applyTemporaryLowpass) so the world audibly recedes
 * for a few seconds, then releases back to the live gaze target.
 */
export const SNAPSHOT_AUDIO_CONFIG = {
    /** Temporary lowpass ceiling (Hz) while the snapshot lands. */
    lowpassFreq: 700,
    /** Seconds the ceiling holds (play-time; frozen while paused) before release. */
    holdSeconds: 3.0,
};

/**
 * Pre-sunset drone descent (flow-audit enhancement #8): over the foreshadow
 * window (SUNSET_FORESHADOW.LEAD_SECONDS) the ambient drone slowly slides
 * down in pitch — the audio half of the "ending is coming" signal.
 */
export const SUNSET_FORESHADOW_AUDIO = {
    /** Fractional drone pitch drop at full foreshadow (sunset moment). */
    droneDropFraction: 0.12,
    /** setTargetAtTime time constant (s) for the descent glide. */
    glide: 1.0,
    /** Minimum foreshadow-level change before the drone frequency is rewritten. */
    applyEpsilon: 0.005,
};

/**
 * POLARIZED binary pulse layer (flow-audit medium #2): a metronome of
 * alternating 440/880Hz ticks — this pitch or that one, nothing in between —
 * scheduled like the rain ambient. Gazing compresses the interval
 * (×1/(1 + gazeRateGain·gazeIntensity)) so the room's gaze pressure finally
 * has an audible carrier ABOVE the 400Hz gaze-lowpass cutoff (the sub-40Hz
 * drone sits entirely below it and never registered the filter).
 */
export const POLARIZED_BEAT_CONFIG = {
    /** The two alternating pulse frequencies (Hz) — the binary pair. */
    lowFreq: 440,
    highFreq: 880,
    /** Base interval (s) between pulses with no gaze. */
    baseInterval: 0.75,
    /** Gaze rate gain: interval = baseInterval / (1 + gazeRateGain * gazeIntensity). */
    gazeRateGain: 0.3,
    /** Per-pulse volume and length (s). */
    volume: 0.05,
    pulseDuration: 0.12,
    /** Layer fade in/out time constant (s) on room enter/exit. */
    fadeTime: 0.5,
};

/**
 * Weather audio configuration
 */
export const WEATHER_AUDIO_CONFIG = {
    /** Static drone frequency */
    staticFrequency: 50,
    /** Rain note frequencies (pentatonic scale) */
    rainNotes: [1200, 900, 800, 600, 400, 300],
    /** Rain note interval (ms) */
    rainInterval: 500,
    /** Glitch frequency range */
    glitchMinFreq: 2000,
    glitchMaxFreq: 6000,
};
