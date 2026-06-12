// Audio-related types

export interface AudioSystemInterface {
    enabled: boolean;
    init: () => void;
    playFootstep: () => void;
    playCablePulse: () => void;
    playEyeBlink: () => void;
    playDayNightTransition: (toNight: boolean) => void;
    setVolume: (value: number) => void;
    toggleMute: () => void;
    // Gaze
    playGazeStartPulse: () => void;
    updateGaze: (isGazing: boolean, gazeIntensity: number) => void;
    tick: (deltaTime: number) => void;
    // Override
    playOverrideTear: () => void;
    // Light low thud when the override key is denied for lack of gaze
    // (flow-audit break #2 failure-feedback tier).
    playOverrideDeniedThud: () => void;
    // Room
    playRoomTransition: () => void;
    playJump: () => void;
    playDoubleJump: () => void;
    // onset (0-1, default 0) is the event's opening-broadcast window
    // (WeatherState.weatherOnset); the weather layer gain swells by
    // WEATHER_AUDIO.onsetSwellMult inside it, then settles.
    updateWeatherAudio: (weatherType: number, intensity: number, onset?: number) => void;
    playGlitchBurst: () => void;
    // Flower
    updateFlowerAudio: (intensity: number) => void;
    playFlowerStateChange: (ascending: boolean) => void;
    // Event-driven confirm tone for a player intensity change (debounced;
    // flow-audit medium #6). Wired from the Controls intensity callback.
    playFlowerChangeTone: (intensity: number) => void;
    stopFlowerAudio: () => void;
    // Rift
    startRiftFog: () => void;
    updateRiftFog: (intensity: number) => void;
    stopRiftFog: () => void;
    playRiftFall: () => void;
    stopRiftFall: () => void;
    playRiftRespawn: () => void;
    // Cable
    startCableHum: () => void;
    updateCableHum: (intensity: number) => void;
    stopCableHum: () => void;
    // Binaural — sideOffsetX is the SIGNED x distance from the room's semantic
    // side axis (faSideAxisX, the cluster center; negative = left/consonant,
    // positive = right/dissonant) and drives the beat detune direction;
    // riftDistance is the distance (m) to the nearest PHYSICAL crack
    // (riftLineXForWorldX) and drives loudness. Normalization knobs live in
    // BINAURAL_SIDE_CONFIG (sideHalfRange / fieldWidth).
    updateBinauralPosition: (sideOffsetX: number, riftDistance: number) => void;
}

export interface AmbientNode {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
}
