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
    /** Distance range for audio (meters) */
    minDistance: 3,
    maxDistance: 25,
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
