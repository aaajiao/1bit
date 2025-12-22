# 🏛 Wired Brutalism: Chimera Void - Design Philosophy & Roadmap

## 🏛 Philosophical Core

### 1. The 1-Bit Aesthetic as "Existence vs. Void"

In *Chimera Void*, 1-bit is not a retro stylistic choice; it is a metaphysical statement.
- **Black (#000000) represents the System**: The absolute, the rigid, the void.
- **White (#FFFFFF) represents the Self**: The signal, the ephemeral, the observer.
- **Dithering represents Noise**: The friction between the system and the self.

### 2. Narrative Arc: "Repression & Desire" (The Ang Lee Approach)

We treat the interaction not as a game, but as a psychological pressure cooker.
- **The Sky Eye (Authority)**: A silent, massive presence that demands submission. 
- **The Flower (Desire)**: A fragile, internal light. It is beautiful but dangerous; making it too bright attracts the Eye's gaze.
- **The Gaze (Discipline)**: Looking at authority dims your own light. Resistance is possible, but it results in "System Overflow" (Glitch).

---

## 🎭 Narrative & Psychological Foundations

### 1. Repression as Coping Mechanism
In this world, survival is synonymous with repression. To exist safely under the Sky Eye, one must dim their internal "flower"—their desires, their identity, their light. The game is not about "winning" through power, but about navigating the cost of either conformity or expression.

### 2. The Archetypes of Response
- **The Submissive Listener**: Players who keep their flower dim and avoid the Eye's gaze. They experience a stable, albeit muted, world.
- **The Boundary Tester**: Players who oscillate between light and dark, seeing how much "noise" the system can tolerate before reacting.
- **The Resister**: Players who force their light to full intensity in the face of authority, choosing the "Glitch" (breakdown of the system) over safety.

---

## 🚶 Player Journey

### Phase 1: Awakening (The Quiet Loop)
- Player wakes in a minimal 1-bit environment.
- **Initial Feeling**: Loneliness, silence. The "Flower" is dim.
- **Goal**: Learn to walk and adjust light intensity.

### Phase 2: The First Gaze (Confronting Authority)
- The Sky Eye appears on the horizon/sky.
- **Initial Feeling**: Vulnerability.
- **System Response**: If the player looks at the Eye, the screen contrast hardens, and the audio goes into a muffled low-pass state.

### Phase 3: The Descent into Mental States
- The world begins generating different "Rooms" (Mental States).
- **INFO_OVERFLOW**: Feeling overwhelmed by too much signal.
- **FORCED_ALIGNMENT**: The pressure to choose a "side" (Left vs. Right).

### Phase 4: Resolution (State Snapshot)
- After the run ends, the player receives a "State Snapshot."
- This is a non-judgmental summary of their psychological choices during the run.

---

## ⚙️ Technical Interaction Loop

Describes what the player does (Input) and how the system responds (Feedback).

### 1. The Gaze Mechanic (Look Input)

- **Player Action**  
  Look up at the Sky Eye (pitch angle > 45°).
- **System Feedback (Visual)**  
  `FlowerProp` intensity is forced to a low value (e.g., 0.1).  
  `DitherShader` shifts `uContrast` from 1.0 to 1.8 (making the image harsher).
- **System Feedback (Audio)**  
  `AudioSystem` triggers a `LowPassFilter` transition over 0.5s. Ambient sounds become muffled.
- **Psychological Effect**  
  The player feels "disciplined." Their subjective light is suppressed by the objective gaze of authority.

### 2. The Overflow Mechanic (Intensity Input)

- **Player Action**  
  Increase flower intensity to 1.0 in a high-noise area (`INFO_OVERFLOW`).
- **System Feedback (Visual)**  
  `DitherShader.uTemporalJitter` increases from 0.2 to 0.9. The scene begins to "vibrate."
- **System Feedback (Audio)**  
  High-frequency digital chirps (data noise) increase in volume.
- **Psychological Effect**  
  Sensory overload. The player realizes that "more light" doesn't mean "more clarity"; it only increases the noise.

### 3. The Split Mechanic (Position Input)

- **Player Action**  
  Walking along the "Crack" in `FORCED_ALIGNMENT`.
- **System Feedback (Visual)**  
  `VertexShader` applies a subtle "wobble" (sin wave) to building meshes near the crack.
- **System Feedback (Audio)**  
  A binaural beat plays, where the left ear is slightly detuned from the right (~20Hz difference).
- **Psychological Effect**  
  Feeling "in-between." The discomfort of not picking a side.

### 4. The Resistance (Override Key)

- **Player Action**  
  Hold the "Override" key (e.g., Space or Shift) while looking at the Sky Eye in the `POLARIZED` room.
- **System Feedback (Visual)**  
  `Flower.intensity` is forced to 1.0. `PostProcessing` triggers a "Color Invert" flash. `DitherShader` "breaks" (shows raw triangles for 0.1s).
- **System Feedback (Audio)**  
  A loud, digital "tear" sound (white noise burst) plays.
- **Psychological Effect**  
  Defiance. Breaking the rules of the simulation, even if just for a second.

### 5. The State Snapshot (End of Run)

- **System Action**  
  Calculates a summary based on sampled metrics.
- **System Feedback (Visual)**  
  A unique procedural 1-bit noise pattern is generated as a "fingerprint" of the run.
- **System Feedback (Text)**  
  A short, observational text (Edward Yang tone) appears: *"You tried to see it all, but you ended up seeing nothing."*

---

## 📊 State Snapshot: Runtime Metrics & Logging

To generate the end-of-run "State Snapshot," we track player behavior non-intrusively.

### 6. Data Collection Model

```typescript
interface RunStats {
  duration: number;        // Total seconds
  samples: number;         // Number of data points recorded
  
  // Flower/Light
  flowerIntensitySum: number;
  
  // Gaze (Sky Eye)
  gazeEvents: number;      // How many times looked at Eye
  gazeTimeTotal: number;   // Total seconds gazing
  gazeDepthMax: number;    // Max pitch angle reached
  
  // Positional/Room
  roomTime: Record<string, number>; // Time spent in each Mental State Room
  onCrackTime: number;     // Time spent in the "Neutral Zone" (FORCED_ALIGNMENT)
  xPositionMin: number;
  xPositionMax: number;
  
  // Resistance
  overrideAttempts: number;
  overrideSuccesses: number;
  overrideTimeTotal: number;
}
```

#### 6.1 Recording Strategy

We sample every **2.0 seconds** to avoid performance overhead.

```typescript
function updateRunStats(deltaTime) {
  runStats.duration += deltaTime;
  
  const isCurrentlyGazing = player.camera.rotation.x > Math.PI / 4;
  const isOverrideActive = player.input.isDown('OVERRIDE');
  
  // Sample periodic data
  sampleTimer += deltaTime;
  if (sampleTimer > 2.0) {
    runStats.samples++;
    runStats.flowerIntensitySum += flower.intensity;
    sampleTimer = 0;
  }
  
  // Event-based tracking
  if (isCurrentlyGazing && !wasGazingLastFrame) {
    runStats.gazeEvents++;
  }
  if (isCurrentlyGazing) {
    runStats.gazeTimeTotal += deltaTime;
    runStats.gazeDepthMax = Math.max(runStats.gazeDepthMax, camera.rotation.x);
  }
  
  // Track room type
  const currentRoom = chunkManager.getCurrentRoomType();
  if (currentRoom !== runStats.currentRoom) {
    runStats.currentRoom = currentRoom;
  }
  runStats.roomTime[currentRoom] = (runStats.roomTime[currentRoom] || 0) + deltaTime;
  
  // Track position
  runStats.xPositionSum += player.position.x;
  runStats.xPositionMin = Math.min(runStats.xPositionMin, player.position.x);
  runStats.xPositionMax = Math.max(runStats.xPositionMax, player.position.x);
  if (Math.abs(player.position.x) < 5.0) {
    runStats.onCrackTime += deltaTime;
  }
  
  // Track overrides
  if (isOverrideActive && !wasOverrideActiveLastFrame) {
    runStats.overrideAttempts++;
  }
  if (isOverrideActive) {
    runStats.overrideTimeTotal += deltaTime;
    if (isGlitchingFromOverride) {
      runStats.overrideSuccesses++;
    }
  }
  
  wasGazingLastFrame = isCurrentlyGazing;
  wasOverrideActiveLastFrame = isOverrideActive;
}
```

#### 6.2 Normalization Phase

When the run ends, raw stats are converted to normalized 0–1 metrics:

```typescript
function normalizeRunStats(rawStats: RunStats): NormalizedMetrics {
  const avgFlower = rawStats.flowerIntensitySum / rawStats.samples;
  const gazeRatio = rawStats.gazeTimeTotal / rawStats.duration;
  const overrideRatio = rawStats.overrideTimeTotal / rawStats.duration;
  
  // Which room did the player spend most time in?
  const roomRatios = {};
  for (const [room, time] of Object.entries(rawStats.roomTime)) {
    roomRatios[room] = time / rawStats.duration;
  }
  
  // How far left vs right did the player go?
  const centerX = (rawStats.xPositionMax + rawStats.xPositionMin) / 2;
  const spreadX = (rawStats.xPositionMax - rawStats.xPositionMin) / 2;
  const crackRatio = rawStats.onCrackTime / rawStats.duration;
  
  return {
    avgFlower,      // 0–1
    gazeRatio,      // 0–1
    overrideRatio,  // 0–1
    roomRatios,     // { INFO: 0–1, FORCED: 0–1, IN_BETWEEN: 0–1, POLARIZED: 0–1 }
    crackRatio,     // 0–1
    spreadX,        // 0–? (absolute distance)
  };
}
```

#### 6.3 Tag Generation

Normalized metrics are converted to discrete, human-readable tags:

```typescript
function generateRunTags(metrics: NormalizedMetrics): string[] {
  const tags = [];
  
  // Light intensity tags
  if (metrics.avgFlower < 0.25) {
    tags.push('QUIET_LIGHT');
  } else if (metrics.avgFlower < 0.6) {
    tags.push('MEDIUM_LIGHT');
  } else {
    tags.push('LOUD_LIGHT');
  }
  
  // Gaze relationship tags
  if (metrics.gazeRatio > 0.5) {
    tags.push('HIGH_GAZE');
  } else if (metrics.gazeRatio < 0.15) {
    tags.push('LOW_GAZE');
  }
  
  // Room dominance tags
  const dominantRoom = Object.entries(metrics.roomRatios)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];
  
  const roomTagMap = {
    'INFO_OVERFLOW': 'INFO_MAZE',
    'FORCED_ALIGNMENT': 'CRACK_WALKER',
    'IN_BETWEEN': 'INBETWEENER',
    'POLARIZED': 'BINARY_EDGE',
  };
  
  tags.push(roomTagMap[dominantRoom]);
  
  // Positional tags
  if (metrics.crackRatio > 0.3) {
    tags.push('NEUTRAL_SEEKER');
  }
  
  // Resistance tags
  if (metrics.overrideRatio > 0.05) {
    tags.push('RESISTER');
  }
  
  return tags;
}
```

**Tag Semantics:**

- `QUIET_LIGHT`: The player kept the flower mostly dimmed.
- `LOUD_LIGHT`: The player preferred the flower bright.
- `MEDIUM_LIGHT`: The player used mid-range intensities.
- `HIGH_GAZE`: The player frequently looked at the Eye.
- `LOW_GAZE`: The player avoided looking at the Eye.
- `INFO_MAZE`: Most time in INFO_OVERFLOW.
- `CRACK_WALKER`: Most time in FORCED_ALIGNMENT (especially on crack).
- `INBETWEENER`: Most time in IN_BETWEEN.
- `BINARY_EDGE`: Most time in POLARIZED.
- `NEUTRAL_SEEKER`: Spent significant time on the crack (FORCED_ALIGNMENT).
- `RESISTER`: Used the Override mechanic (at least once).

#### 6.4 Visual Pattern Generation

Tags drive a procedural 1-bit texture that is displayed briefly at run end.

**Pattern Selection Logic:**

```glsl
// In StateSnapshot.frag (Fragment Shader)

uniform int uPatternMode;  // 0: noise, 1: stripes, 2: checker, 3: radial
uniform float uDensity;    // Fill density (0–1)
uniform float uFrequency;  // Pattern frequency
uniform float uPhase;      // Offset/rotation

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float pattern = 0.0;
  
  if (uPatternMode == 0) {
    // Noise: Perlin/simplex-based
    pattern = noise(uv * uFrequency);
  } else if (uPatternMode == 1) {
    // Stripes: parallel lines with angle
    pattern = sin((uv.x + uv.y * tan(uPhase)) * uFrequency) * 0.5 + 0.5;
  } else if (uPatternMode == 2) {
    // Checkerboard
    pattern = mod(floor(uv.x * uFrequency) + floor(uv.y * uFrequency), 2.0);
  } else if (uPatternMode == 3) {
    // Radial: concentric circles or spirals
    pattern = sin(length(uv - 0.5) * uFrequency + uPhase) * 0.5 + 0.5;
  }
  
  // Apply density: threshold to get 1-bit output
  if (pattern > (1.0 - uDensity)) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // White
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black
  }
}
```

**Tag-to-Pattern Mapping:**

```typescript
function getPatternFromTags(tags: string[]): ShaderUniforms {
  let patternMode = 0;
  let density = 0.5;
  let frequency = 8.0;
  let phase = 0.0;
  
  // Primary environment tag determines base pattern
  if (tags.includes('INFO_MAZE')) {
    patternMode = 0;  // Noise
    frequency = 16.0; // High frequency for "chaotic" feel
    density = 0.7;
  } else if (tags.includes('CRACK_WALKER')) {
    patternMode = 1;  // Stripes
    frequency = 12.0;
    phase = Math.PI / 2; // Vertical stripes
  } else if (tags.includes('INBETWEENER')) {
    patternMode = 2;  // Checkerboard
    frequency = 10.0;
    density = 0.6;
  } else if (tags.includes('BINARY_EDGE')) {
    patternMode = 3;  // Radial
    frequency = 10.0;
    phase = Math.random() * Math.PI * 2;
  }
  
  // Secondary light-intensity tag modifies density
  if (tags.includes('QUIET_LIGHT')) {
    density -= 0.2; // Sparse pattern
  } else if (tags.includes('LOUD_LIGHT')) {
    density += 0.2; // Dense pattern
  }
  
  // Resistance tag adds chaos
  if (tags.includes('RESISTER')) {
    frequency *= 1.5;
    density += 0.1;
  }
  
  return {
    uPatternMode: patternMode,
    uDensity: Math.clamp(density, 0.1, 0.9),
    uFrequency: frequency,
    uPhase: phase,
  };
}
```

**Display Mechanism:**

The pattern is rendered to a small quad (e.g., 256×256 or 512×512) and displayed in the bottom-right corner of the screen, or overlaid briefly on the ground beneath the player. It fades in over 0.5 seconds, remains for 2 seconds, then fades out over 1 second. The pattern loops/tiles to fill the quad seamlessly.

#### 6.5 Text Selection & Composition

Using the same tags, a combination of pre-written sentences creates the text snapshot.

**Text Library (Edward Yang Tone):**

The tone is observational, non-judgmental, slightly melancholic, and specific to the archetype each player is inhabiting.

```typescript
const textTable = {
  QUIET_LIGHT: [
    {
      en: "You dimmed yourself, and the world looked less noisy."
    },
    {
      en: "You kept the light low, and that seemed to help."
    }
  ],
  
  LOUD_LIGHT: [
    {
      en: "You kept the light up, even when no one asked."
    },
    {
      en: "The brighter you made it, the more it hurt to look at."
    }
  ],
  
  MEDIUM_LIGHT: [
    {
      en: "You found a middle ground, though it never felt quite right."
    }
  ],
  
  HIGH_GAZE: [
    {
      en: "You spent most of the time looking up."
    },
    {
      en: "The Eye was always there, and you couldn't stop checking."
    }
  ],
  
  LOW_GAZE: [
    {
      en: "You rarely checked if the Eye was still there."
    },
    {
      en: "You mostly kept your eyes on the ground."
    }
  ],
  
  INFO_MAZE: [
    {
      en: "You walked through a lot of signals, but not many answers."
    },
    {
      en: "The more you tried to see, the less you understood."
    }
  ],
  
  CRACK_WALKER: [
    {
      en: "You stayed on the crack longer than most would."
    },
    {
      en: "The middle was always the hardest place to stand."
    }
  ],
  
  NEUTRAL_SEEKER: [
    {
      en: "You preferred the places where nothing was certain."
    }
  ],
  
  INBETWEENER: [
    {
      en: "You kept stepping into places that belonged to no one in particular."
    },
    {
      en: "You were always being misread, no matter where you went."
    }
  ],
  
  BINARY_EDGE: [
    {
      en: "You went right up to where things had to be either this or that."
    },
    {
      en: "In the pure black and white, there was no room to breathe."
    }
  ],
  
  RESISTER: [
    {
      en: "You broke the picture once; it came back, but not quite the same."
    },
    {
      en: "You tried to say no, and for a moment, the world listened."
    }
  ]
};
```

---

## 🧠 Level Design: Mental State Rooms

### Core Design Philosophy

We implement **Mental State Rooms**, not linear levels.

- We do **not** gate progress by clearing rooms. Rooms are sampled and recombined per session (like emotional weather), not unlocked linearly.
- We do **not** offer explicit rewards for "winning" rooms.
- We **do** offer the implicit reward of understanding one's own response pattern.

---

### 1. INFO_OVERFLOW (High Noise, No Response)

**Conceptual Framing**

The anxiety of over-connection: you scream into the void, and the void replies with static. This room mirrors the experience of scrolling social media endlessly, seeing mountains of information but receiving no feedback, no dialogue, no sense of being heard.

**Visual Language**

- High-frequency dithering pattern (0.8–1.0 density), creating visual "noise."
- Distant buildings flicker and swap geometry every 2–6 seconds depending on flower intensity.
- Digital rain: vertical lines descending at varying speeds, like falling data packets.
- No clear focal points; the eye cannot rest anywhere.
- The horizon is not defined; the world fades into pure noise within 30 meters.

**Audio Language**

- Base layer: constant low-frequency hum (~60 Hz), barely perceptible but creating subconscious unease.
- Second layer: random beeps and chirps at varying frequencies (2–10 kHz), creating a sense of "missed messages" or "notifications you can't read."
- The beep frequency and intensity increase with flower brightness.
- No rhythm or pattern; the sounds are unpredictable, preventing the listener from anticipating or finding comfort in repetition.

**Interactive Mechanics**

```typescript
// INFO_OVERFLOW specific systems
const noiseDensityMap = {
  0.1: 0.75,  // Dim light
  0.3: 0.82,
  0.5: 0.88,
  0.7: 0.95,
  1.0: 1.0    // Full brightness = maximum noise
};

const buildingRefreshIntervalMap = {
  0.1: 6.0,   // Dim: buildings stay stable
  0.3: 5.0,
  0.5: 3.5,
  0.7: 2.5,
  1.0: 1.5    // Bright: chaos
};
```

**Player Journey in INFO_OVERFLOW**

1. **Initial Entry**: Player's instinct is to brighten the light to "see better."
2. **Negative Feedback**: The brighter they get, the more chaotic the world becomes; they realize increasing light is counterproductive.
3. **Adaptation**: Player learns to keep light around 0.3–0.4 (low-medium), finding a "survivable" level of noise.
4. **Lingering Doubt**: Even at optimal settings, there's no sense of progress or understanding. The information keeps flowing, and nothing is resolved.
5. **Exit Option**: The player can navigate through the room and exit (there's no "trap"), but there's a psychological weight to leaving without answers.

**Design Intent**

This room teaches the player that **more input ≠ more understanding**. It's a meditation on the contemporary phenomenon of information overload, where constant stimulation paradoxically leads to numbness and passivity.

---

### 2. FORCED_ALIGNMENT (The Split World)

**Conceptual Framing**

The pressure to pick a side. No true middle ground allowed. This room embodies the contemporary polarization of social/political discourse, where nuance is collapsed into binary oppositions, and neutrality is treated as betrayal.

**Visual Language**

- A massive vertical chasm divides the space into left and right halves.
- Left side: Clean, geometric, well-lit structures (low dithering density ~0.4). The aesthetic is pristine but oppressively orderly.
- Right side: Broken, organic, partially collapsed structures (high dithering density ~0.7). Chaotic but more visually "honest."
- The crack itself: An abyss of pure black, no bottom visible. Traversing it means crossing into uncertainty.
- Line cables that span the chasm like ideological banners, taut and trembling.
- The floor on the crack: Semi-transparent or glitching, implying instability underfoot.

**Audio Language**

- Left side: A single, sustained harmonic tone (major 3rd, ~330 Hz and ~550 Hz) played softly, evoking stability and order.
- Right side: A discordant tone (tritone or sus-2 chord) played at the same volume, creating mild unease.
- The crack: Both tones play simultaneously, creating interference beats (~20 Hz), producing a pulsing dissonance that is profoundly uncomfortable to listen to for extended periods.
- The binaural beat frequency changes based on the player's X position, creating a dynamic audio landscape that maps to spatial location.

**Player Journey in FORCED_ALIGNMENT**

1. **Initial Encounter**: The player sees the split and is initially drawn to explore both sides.
2. **Comfort Discovery**: Moving fully to one side makes the world feel more "coherent" (less dithering, stable ground, pleasant audio).
3. **Psychological Cost**: But staying on one side means accepting the distortion of the other side (it becomes noisy, unstable). The player is complicit in "erasing" the other perspective.
4. **The Neutral Option**: The player can return to the crack and endure the discomfort of being between. This is the "enlightened" choice, but it's painful.
5. **Repeated Choice**: The player may oscillate between sides and the crack, testing the boundaries and costs repeatedly.

**Design Intent**

This room externalizes the internal conflict of political/ideological standing. It offers no "correct" answer: both sides are equally valid and equally limiting. The crack is "correct" in principle but psychologically untenable. The game validates all three strategies without ranking them.

---

### 3. IN_BETWEEN (The Glitch)

**Conceptual Framing**

Being misread by both systems: rejected as noise in one context, barely accepted as signal in another. This room is for those who don't fit neatly into established categories—minorities, hybrids, those caught between cultures or identities.

**Visual Language**

- Two overlapping building systems with incompatible visual languages: one rectilinear and clean, the other fractured and organic.
- Z-fighting (texture fighting) at boundaries, creating visual noise where the systems intersect.
- Geometry that is ambiguous: partially rendered in one system's style, partially in another's.
- Surfaces that reflect light differently depending on which system "claims" them at that moment, creating a flickering appearance.
- Floor: dual-layer grid, one rotated ~30° relative to the other, creating a moiré pattern.

**Audio Language**

- System A: A harmonic chord (perfect fifth, consonant) played at low volume.
- System B: A dissonant chord (tritone or cluster) at the same volume.
- On boundaries: Both chords overlap, creating complex harmonic interference.
- The player's light triggers different resonances in each system (System A: confirmatory tones; System B: alarm tones).

**Player Journey in IN_BETWEEN**

1. **Discovery**: The player encounters incompatible systems and realizes their responses vary contextually.
2. **Frustration**: An action that works in System A causes problems in System B, and vice versa. The player cannot be "consistently right."
3. **Adaptation**: The player learns to navigate by playing each system's rules when in each system's territory.
4. **Deeper Realization**: Even this adaptive strategy fails on the boundaries; the player discovers there's no universal solution.
5. **Coping**: The player either compartmentalizes (treating each system separately) or embraces the ambiguity (accepting contradiction).

**Design Intent**

This room reflects the lived experience of people navigating multiple, incompatible social systems. There is no "solution"; there is only the daily practice of context-switching and the psychological toll it takes. The game validates both the compartmentalist and ambiguity-embracing strategies.

---

### 4. POLARIZED (The Pure Binary)

**Conceptual Framing**

Total submission to 1-bit logic: no gray, no dithering, only hard decisions. This is the room where the world has collapsed into pure binary opposition, where nuance is obliterated and every choice is a binary switch.

**Visual Language**

- **Zero dithering**: Pure 1-bit rendering. The world is composed entirely of solid black and solid white, with razor-sharp boundaries.
- **No gradients or shadows**: All surfaces are either fully lit (white) or completely in shadow (black).
- **Geometric precision**: All geometry is made of rectangles, cubes, and lines. No curves, no organic shapes.
- **Chessboard floors**: The most iconic 1-bit pattern, emphasizing the black-and-white duality.
- **Cables as borders**: All cables and lines trace the exact black-white boundaries, forming a skeleton of the world.
- **Sky Eye**: Dominates the visual field, impossibly large, rendered as concentric 1-bit circles.

**Audio Language**

- **Binary beeps**: The only sounds are crisp, digital beeps at two frequencies (e.g., 440 Hz and 880 Hz), representing "on" and "off."
- **No ambiguity in tone**: There is no sustain, no fade, only sudden onset and offset.
- **Rhythm**: The beeps follow a simple, relentless 4/4 beat, like a digital pulse or clock ticking, inescapable and mechanical.
- **The Gaze intensifies**: When looking at the Eye, the beeps speed up slightly, creating a sense of increasing pressure.

**Design Intent**

This room is the game's philosophical climax. It represents the totalitarian endpoint of the binary logic: a world where nuance, compromise, and ambiguity are not just discouraged but technically impossible. The Override is not a "power" but a defiant gesture—beautiful in its futility.

---

## 🎛 Parameter Reference

### Shader Uniforms

```glsl
// Global parameters for all rooms
uniform float uNoiseDensity;    // 0–1, controls dithering pattern density
uniform float uThresholdBias;   // -0.5 to 0.5, shifts black/white balance
uniform float uTemporalJitter;  // 0–1, controls temporal animation of dithering
uniform float uContrast;        // 1.0+ controls overall contrast
uniform float uCRTCurvature;    // 0–0.1, CRT monitor curve distortion
uniform float uScanlineIntensity; // 0–1, horizontal scan line effect

// Vertex displacement (glitch)
uniform float uGlitchAmount;    // 0–1, magnitude of vertex displacement
uniform float uGlitchSpeed;     // Hz, frequency of glitch animation

// Color effects
uniform float uColorInversion;  // 0–1, 0=normal, 1=fully inverted
uniform float uSaturation;      // 0–1, 0=grayscale, 1=full color
```

---

## 📍 Current Status Assessment

Before implementing the roadmap, here is an assessment of the existing codebase:

### Existing Modules

| Module | Status | Notes |
|--------|--------|-------|
| `DitherShader.ts` | **Partial** | Has basic Bayer dithering, edge detection, weather effects. Missing: `uNoiseDensity`, `uThresholdBias`, `uTemporalJitter`, `uContrast` per-room uniforms. Has `invertColors` for day/night. |
| `ChunkManager.ts` | **Needs Extension** | Generates procedural chunks with buildings/cables. No `roomType` enum or Mental State Room configuration. |
| `FlowerProp.ts` | **Needs Extension** | Visual flower with petal/sepal/dust animations. No `setIntensity()` method or intensity control. |
| `AudioSystem.ts` | **Partial** | Web Audio API with footsteps, ambient drone, cable pulse, eye blink, day/night sounds. Missing: low-pass filter for Gaze, per-room audio layers, binaural beats. |
| `Controls.ts` | **Needs Extension** | Basic FPS controls (WASD + mouse look). No Gaze detection (pitch > 45°), no Override key handling. |
| `SkyEye.ts` | **Exists** | Sky Eye visual exists. Needs integration with Gaze mechanic. |
| `RunStats` | **Not Started** | No runtime metrics collection infrastructure. |
| `StateSnapshot` | **Not Started** | No end-of-run summary generation. |

### Required New Modules

- `RunStatsCollector.ts` - Runtime behavior sampling
- `StateSnapshotGenerator.ts` - Tag generation and pattern rendering
- `RoomConfig.ts` - Per-room shader/audio configuration
- `GazeMechanic.ts` - Gaze detection and response system

---

## 🎓 Player Discovery Design

Mechanics must be discoverable without explicit tutorials. The following environmental hints guide player learning:

### 1. Flower Intensity Discovery

**Environmental Hint:**
- On first load, the flower pulses gently between 0.3–0.5 intensity for 10 seconds
- A subtle audio cue (rising tone) plays when intensity increases
- The world's dithering density visibly responds to flower brightness

**Control Mapping:**
```typescript
// Scroll wheel controls flower intensity
window.addEventListener('wheel', (e) => {
  const delta = -Math.sign(e.deltaY) * 0.1;
  flower.setIntensity(flower.intensity + delta);
});
```

**Fallback:** After 60 seconds without interaction, a minimal text prompt appears: `[scroll]`

### 2. Gaze Mechanic Discovery

**Environmental Hint:**
- The Sky Eye is positioned at the horizon on first spawn, impossible to ignore
- When the player naturally looks around, crossing the 45° pitch threshold triggers immediate visual/audio feedback
- The feedback is dramatic enough to be noticed but not punishing

**Visual Cue:**
- A thin white line appears at the 45° pitch angle on screen edges (like a horizon marker)
- This line pulses briefly when the player first crosses the threshold

### 3. Override Key Discovery

**Environmental Hint:**
- In the POLARIZED room, the Override prompt appears only after:
  1. Player has gazed at the Eye for > 5 cumulative seconds
  2. Player's flower intensity has been forced low (< 0.2) at least twice
- The prompt is diegetic: a flickering text appears on a nearby building surface: `[HOLD TO RESIST]`

**Timing:**
- First playthrough: prompt appears after conditions met
- Subsequent runs: prompt timing randomizes (30s–120s) to maintain surprise

### 4. Room Transition Awareness

**Environmental Hint:**
- Room boundaries are marked by subtle visual changes:
  - INFO_OVERFLOW: Distant buildings begin flickering before entry
  - FORCED_ALIGNMENT: The crack becomes visible 20m before reaching it
  - IN_BETWEEN: Z-fighting artifacts appear at boundary edges
  - POLARIZED: Dithering abruptly disappears at entry

**Audio Cue:**
- A 0.5s crossfade between room audio signatures
- The transition is smooth but perceptible

---

## 🔊 Audio System Technical Specification

The audio system uses the Web Audio API with the following architecture:

### Audio Graph Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      AudioContext                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │ Ambient     │    │ Room Layer  │    │ Event Layer  │    │
│  │ Drone       │    │ (per-room)  │    │ (one-shots)  │    │
│  └──────┬──────┘    └──────┬──────┘    └──────┬───────┘    │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    MasterGain                        │   │
│  └───────────────────────────┬─────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              GazeLowPassFilter                       │   │
│  │         (BiquadFilter, dynamically controlled)       │   │
│  └───────────────────────────┬─────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Destination                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Gaze Low-Pass Filter Implementation

```typescript
class GazeAudioController {
  private lowPassFilter: BiquadFilterNode;
  private targetFrequency: number = 20000; // Full range when not gazing
  private currentFrequency: number = 20000;

  constructor(audioContext: AudioContext) {
    this.lowPassFilter = audioContext.createBiquadFilter();
    this.lowPassFilter.type = 'lowpass';
    this.lowPassFilter.frequency.value = 20000;
    this.lowPassFilter.Q.value = 0.7;
  }

  /**
   * Update filter based on gaze state
   * @param isGazing - Whether player is looking at Sky Eye
   * @param gazeIntensity - 0–1, how directly player is looking (based on pitch)
   */
  updateGaze(isGazing: boolean, gazeIntensity: number): void {
    // Target: 20000Hz (open) → 400Hz (fully gazing)
    this.targetFrequency = isGazing
      ? 400 + (1 - gazeIntensity) * 19600
      : 20000;
  }

  /**
   * Smooth interpolation (call in animation loop)
   */
  tick(deltaTime: number): void {
    const lerpSpeed = 3.0; // Transition speed
    this.currentFrequency += (this.targetFrequency - this.currentFrequency) * lerpSpeed * deltaTime;
    this.lowPassFilter.frequency.setValueAtTime(
      this.currentFrequency,
      this.lowPassFilter.context.currentTime
    );
  }
}
```

### Per-Room Audio Configuration

```typescript
interface RoomAudioConfig {
  baseFrequency: number;      // Ambient drone base frequency (Hz)
  harmonic: 'consonant' | 'dissonant' | 'binaural';
  noiseLayer: boolean;        // Whether to add high-frequency noise
  noiseGain: number;          // 0–1
  beatFrequency?: number;     // For binaural beats (Hz difference L/R)
}

const ROOM_AUDIO_CONFIGS: Record<string, RoomAudioConfig> = {
  INFO_OVERFLOW: {
    baseFrequency: 60,
    harmonic: 'dissonant',
    noiseLayer: true,
    noiseGain: 0.15,
  },
  FORCED_ALIGNMENT: {
    baseFrequency: 55,
    harmonic: 'binaural',
    noiseLayer: false,
    noiseGain: 0,
    beatFrequency: 20, // 20Hz binaural beat
  },
  IN_BETWEEN: {
    baseFrequency: 50,
    harmonic: 'dissonant',
    noiseLayer: true,
    noiseGain: 0.08,
  },
  POLARIZED: {
    baseFrequency: 40,
    harmonic: 'consonant', // Ironically "clean" sound for oppressive room
    noiseLayer: false,
    noiseGain: 0,
  },
};
```

### Binaural Beat Implementation (FORCED_ALIGNMENT)

```typescript
class BinauralBeatGenerator {
  private leftOsc: OscillatorNode;
  private rightOsc: OscillatorNode;
  private merger: ChannelMergerNode;

  constructor(audioContext: AudioContext, baseFreq: number, beatFreq: number) {
    // Create stereo merger
    this.merger = audioContext.createChannelMerger(2);

    // Left ear oscillator
    this.leftOsc = audioContext.createOscillator();
    this.leftOsc.type = 'sine';
    this.leftOsc.frequency.value = baseFreq;

    // Right ear oscillator (detuned)
    this.rightOsc = audioContext.createOscillator();
    this.rightOsc.type = 'sine';
    this.rightOsc.frequency.value = baseFreq + beatFreq;

    // Route to separate channels
    const leftGain = audioContext.createGain();
    const rightGain = audioContext.createGain();
    leftGain.gain.value = 0.1;
    rightGain.gain.value = 0.1;

    this.leftOsc.connect(leftGain);
    this.rightOsc.connect(rightGain);
    leftGain.connect(this.merger, 0, 0);  // Left channel
    rightGain.connect(this.merger, 0, 1); // Right channel
  }

  /**
   * Adjust beat intensity based on player X position (crack proximity)
   * @param xPosition - Player X coordinate
   * @param crackWidth - Width of neutral zone
   */
  updatePosition(xPosition: number, crackWidth: number): void {
    const distanceFromCrack = Math.abs(xPosition);
    const intensity = Math.max(0, 1 - distanceFromCrack / crackWidth);

    // Closer to crack = stronger binaural effect
    const leftGain = this.leftOsc.context.createGain();
    // ... adjust gains based on intensity
  }

  connect(destination: AudioNode): void {
    this.merger.connect(destination);
  }

  start(): void {
    this.leftOsc.start();
    this.rightOsc.start();
  }

  stop(): void {
    this.leftOsc.stop();
    this.rightOsc.stop();
  }
}
```

### Override Sound Effect

```typescript
/**
 * Plays the "tear" sound when Override is activated
 * White noise burst with dramatic envelope
 */
function playOverrideTear(audioContext: AudioContext, masterGain: GainNode): void {
  const now = audioContext.currentTime;

  // White noise buffer
  const bufferSize = audioContext.sampleRate * 0.3;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;

  // Bandpass filter for "digital tear" character
  const filter = audioContext.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 1.5;

  // Dramatic envelope
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01); // Sharp attack
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25); // Quick decay

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  noise.start(now);
  noise.stop(now + 0.3);
}
```

---

## ♿ Accessibility Considerations

### Visual Accessibility

| Concern | Mitigation |
|---------|------------|
| Photosensitive epilepsy | Add `reducedMotion` setting: disables temporal jitter, slows glitch effects to < 3Hz, removes Override flash |
| High contrast issues | The 1-bit aesthetic is inherently high-contrast; no mitigation needed |
| Motion sickness | Add `reducedMotion` setting: reduces head bob, slows room transitions |

**Implementation:**

```typescript
interface AccessibilitySettings {
  reducedMotion: boolean;
  audioDescriptions: boolean; // Future: narrate room transitions
  disableFlashing: boolean;
}

// In DitherShader, respect reducedMotion:
if (settings.reducedMotion) {
  uniforms.uTemporalJitter.value = 0;
  uniforms.uGlitchSpeed.value = Math.min(uniforms.uGlitchSpeed.value, 2.0);
}

// Override visual: skip color invert flash
if (settings.disableFlashing) {
  // Skip the 0.1s "break" effect, go directly to intensity boost
}
```

### Audio Accessibility

| Concern | Mitigation |
|---------|------------|
| Hearing impairment | All audio cues have visual counterparts (Gaze = contrast change, Override = screen flash) |
| Binaural beats discomfort | Add `disableBinauralBeats` setting: replaces with mono panning effect |
| Volume sensitivity | Separate volume sliders: Master, Ambient, Events |

### Control Accessibility

| Concern | Mitigation |
|---------|------------|
| Limited mobility | Configurable key bindings; mouse-only mode (auto-walk toggle) |
| Override hold duration | Adjustable hold time (default 1s, range 0.3s–3s) |

---

## 🛠 Technical Roadmap

### Phase 1: The Foundation (Shader & State)

**Objectives:**

- Refactor `ChunkManager` to support `roomType` enum and per-room configuration.
- Upgrade `DitherShader` with all required uniforms and temporal animation support.
- Implement basic `Flower` intensity control (manual and automatic via Gaze).
- Set up `RunStats` collection infrastructure (non-intrusive background recording).

**Deliverables:**

- `ChunkManager.ts` can generate and manage chunks with assigned `roomType`.
- `DitherShader.ts` exposes `uNoiseDensity`, `uThresholdBias`, `uTemporalJitter`, `uContrast` as dynamically updateable uniforms.
- `FlowerProp.ts` supports `setIntensity(0-1)` with smooth lerping.
- `RunStats` object persists and accumulates data throughout a session.

**Success Criteria:**

- Switching between INFO_OVERFLOW and POLARIZED rooms causes visible shader changes.
- Flower intensity can be manually controlled and displays smooth visual feedback.
- No performance regression; frame rate remains stable.

---

### Phase 2: The Discipline (Mechanic)

**Objectives:**

- Implement the Gaze mechanic: automatic intensity reduction when gazing at Sky Eye.
- Integrate audio filtering (low-pass when gazing).
- Add haptic feedback (if platform supports).
- Implement camera pitch detection and smooth state transitions.

**Deliverables:**

- `Controls.ts` detects Gaze state (pitch > 45) and broadcasts events.
- `Flower` responds to Gaze by auto-lerping intensity.
- `AudioSystem` applies low-pass filter smoothly when Gazing.
- Haptic pulse patterns implemented (single pulse on Gaze start, periodic while gazing).

**Success Criteria:**

- Gazing up clearly feels punitive (dim, muffled, vibration).
- The effect is smooth and not jarring.
- Players naturally learn the Gaze rule within the first 30 seconds of play.

---

### Phase 3: Mental State Rooms

**Objectives:**

- Implement four Mental State Rooms: `INFO_OVERFLOW`, `FORCED_ALIGNMENT`, `IN_BETWEEN`, `POLARIZED`.
- Configure independent shader parameters and audio settings for each room.
- Implement smooth transitions between rooms (visual and audio crossfade).
- Add environmental hints at room boundaries.

**Deliverables:**

- `RoomConfig.ts` defines shader/audio parameters for each room.
- `ChunkManager.ts` assigns `roomType` based on position.
- `DitherShader.ts` dynamically adjusts uniforms based on current room.
- `AudioSystem.ts` supports per-room audio layers and binaural beats (FORCED_ALIGNMENT).
- Room boundary visual hints (flickering, Z-fighting artifacts, dithering changes).

**Success Criteria:**

- Entering different rooms produces distinct and unique visual/audio changes.
- Room transitions are smooth (0.5s crossfade).
- Binaural beats in FORCED_ALIGNMENT vary based on player X position.
- POLARIZED room displays pure zero-dithering 1-bit rendering.

---

### Phase 4: The Resistance (Override Mechanic)

**Objectives:**

- Implement the Override key mechanic: holding a specific key in POLARIZED room forces flower intensity to 1.0.
- Add Override visual effects: color invert flash, shader brief "crash".
- Add Override audio effects: white noise "tear" sound.
- Implement conditional trigger logic for Override prompt.

**Deliverables:**

- `Controls.ts` handles Override key (Space or Shift) hold detection.
- `OverrideMechanic.ts` manages Override state, timing, and effect triggering.
- `DitherShader.ts` supports color inversion and glitch effects.
- `AudioSystem.ts` adds `playOverrideTear()` method.
- Override prompt logic: only displays `[HOLD TO RESIST]` after conditions met (gaze cumulative > 5s, flower forced low 2+ times).

**Success Criteria:**

- Holding Override key in POLARIZED room produces clear visual/audio feedback.
- Override effect duration correlates with hold time (configurable, default 1s trigger).
- Override prompt appears diegetically at appropriate timing.
- Accessibility settings can disable flashing effects.

---

### Phase 5: State Snapshot (End-of-Run Summary)

**Objectives:**

- Implement runtime metrics collection system (`RunStats`).
- Implement end-of-run tag generation algorithm.
- Implement procedural 1-bit pattern generation (tag-driven).
- Implement observational text selection and display (Edward Yang tone).

**Deliverables:**

- `RunStatsCollector.ts` samples player behavior every 2 seconds (intensity, gaze, position, override).
- `TagGenerator.ts` generates behavior tags from normalized metrics.
- `StateSnapshotGenerator.ts` generates 1-bit patterns and composed text from tags.
- `StateSnapshot.frag` shader renders final pattern (noise/stripes/checkerboard/radial).
- End-of-run UI: displays pattern and text snapshot.

**Success Criteria:**

- End-of-run correctly generates tags reflecting player behavior.
- Each run generates a unique 1-bit pattern "fingerprint".
- Displayed observational text matches player behavior tags.
- Runtime metrics collection has no noticeable performance impact.

---

### Future Optimization Phase

**Potential Objectives:**

- Mobile adaptation (touch controls, performance optimization).
- Accessibility improvements (`reducedMotion`, `disableBinauralBeats`, configurable key bindings).
- Multi-language support optimization (Simplified Chinese/English text library improvements).
- Run data persistence and history viewing.
- Audio description features (narrate room transitions for visually impaired players).

---

*Document Version: 1.2 (English)*

**Changelog:**
- v1.2: Completed Technical Roadmap with Phase 3 (Mental State Rooms), Phase 4 (Override Mechanic), Phase 5 (State Snapshot), and Future Optimization Phase.
- v1.1: Added Current Status Assessment, Player Discovery Design, Audio System Technical Specification, Accessibility Considerations. Removed time estimates from Technical Roadmap.
