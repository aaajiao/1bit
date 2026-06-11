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
    updateWeatherAudio: (weatherType: number, intensity: number) => void;
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
    // Binaural — signedOffsetX is the SIGNED x distance from the rift crack
    // center (negative = left/consonant side, positive = right/dissonant side);
    // |offset| drives loudness, the sign drives the beat detune direction.
    updateBinauralPosition: (signedOffsetX: number, crackWidth: number) => void;
}

export interface AmbientNode {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
}
