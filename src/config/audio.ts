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
