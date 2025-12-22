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
    // Room
    playRoomTransition: () => void;
    playJump: () => void;
    playDoubleJump: () => void;
    updateWeatherAudio: (weatherType: number, intensity: number) => void;
    playGlitchBurst: () => void;
    // Flower
    updateFlowerAudio: (intensity: number) => void;
    playFlowerStateChange: (ascending: boolean) => void;
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
    // Binaural
    updateBinauralPosition: (xPosition: number, crackWidth: number) => void;
}

export interface AmbientNode {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
}
