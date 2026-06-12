import type { ShaderDefinition } from '../types';
// 1-bit Chimera Void - Dither Shader
import * as THREE from 'three';

/**
 * 1-BIT BAYER DITHER POST-PROCESSING SHADER (Enhanced)
 * Features:
 * - Edge detection (Sobel) for comic/woodcut outlines
 * - Multi-scale dithering (8x8 near, 2x2 far)
 * - Depth-aware dither transitions
 */
export const DitherShader: ShaderDefinition = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2() },
        enableOutline: { value: true },
        outlineStrength: { value: 0.3 },
        enableDepthDither: { value: false }, // Disabled by default (requires depth buffer)
        ditherTransition: { value: 0.7 },
        invertColors: { value: false }, // Day/night color inversion
        // Weather
        weatherType: { value: 0 }, // 0=clear, 1=static, 2=rain, 3=glitch
        weatherIntensity: { value: 0.0 },
        weatherTime: { value: 0.0 },
        // Weather-presence pass: onset broadcast (1 -> 0 over the event's first
        // ~1.6s, from WeatherState) + per-room weather flavor (RoomShaderConfig,
        // baked through the RoomTransition lerp). Defaults = pre-pass look.
        uWeatherOnset: { value: 0.0 },
        uWeatherIsEvent: { value: 0.0 }, // 1 = real event, 0 = transient ambient glitch (gates invert strikes)
        uWeatherRainDensity: { value: 1.0 }, // RAIN column density/speed/trail multiplier
        uWeatherBandStrength: { value: 0.0 }, // STATIC pressed into scan bands (FA)
        uWeatherMisregisterBoost: { value: 0.0 }, // RAIN double-print ghost (IN_BETWEEN)
        uWeatherInvertStrike: { value: 0.0 }, // GLITCH full-screen invert strikes (POLARIZED)
        // Room-specific uniforms (mental state spaces)
        uNoiseDensity: { value: 0.5 }, // 0-1, controls dither pattern density
        uThresholdBias: { value: 0.0 }, // -0.5 to 0.5, black/white balance offset
        uTemporalJitter: { value: 0.0 }, // 0-1, temporal dither animation
        uContrast: { value: 1.0 }, // 1.0+, overall contrast
        uGlitchAmount: { value: 0.0 }, // 0-1, scales glitch line density + inversion strength (post-process, no vertex displacement)
        uGlitchSpeed: { value: 0.0 }, // Hz, glitch animation frequency
        uColorInversion: { value: 0.0 }, // 0-1, for override effect
        uOverrideProgress: { value: 0.0 }, // 0-1, hold progress feedback
        uTime: { value: 0.0 }, // Global time for animations
        // Flower intensity (affects world response)
        uFlowerIntensity: { value: 0.5 }, // 0-1, player's light intensity
        // ===== 1-bit duotone palette (per-room) =====
        // The dithered scalar (~0 or ~1 per pixel) is mapped to two colors at the
        // very end of the pipeline: finalRGB = mix(uInkColor, uPaperColor, value).
        // Defaults are pure black/white so behavior is identical to the original
        // monochrome 1-bit output until per-room colors are supplied.
        uInkColor: { value: new THREE.Vector3(0.0, 0.0, 0.0) }, // the "0"/dark ink
        uPaperColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) }, // the "1"/light paper
        // Tone fix: brightness lift applied after contrast so the floor / shadows
        // render as a textured ink/paper dither instead of crushing to solid ink.
        uBrightnessLift: { value: 1.55 },
        // ===== Per-room post-process character (Phase 5b) =====
        // uScanIntensity: 0-1, slow horizontal CRT/surveillance scan band biasing
        //   the dither threshold (FORCED_ALIGNMENT only; 0 elsewhere).
        // uMisregister: 0-1, subtle duotone channel misregistration (IN_BETWEEN).
        uScanIntensity: { value: 0.0 },
        uMisregister: { value: 0.0 },
        // uFlowerThresholdGain: signed gain of the flower term in the dither
        //   threshold. Positive = brighter flower whitens/cleans the frame
        //   (default 0.1, the historical behavior); NEGATIVE in INFO_OVERFLOW
        //   so brightness dirties the frame instead (flow-audit break #8).
        uFlowerThresholdGain: { value: 0.1 },
        // ===== Gaze visual feedback (flow-audit break #1 + enhancement #2) =====
        // uGazeIntensity: 0-1 smoothed gaze intensity (GazeMechanic curve);
        //   drives a gentle disciplinary vignette (scaled by
        //   uGazeVignetteStrength, sourced from GAZE_VISUAL config).
        // uPitchLineV / uPitchLineAlpha: screen-space 45° threshold marker — a
        //   thin paper-colored horizon line near the gaze threshold, with a
        //   short first-crossing pulse folded into the alpha CPU-side.
        uGazeIntensity: { value: 0.0 },
        uGazeVignetteStrength: { value: 0.0 },
        uPitchLineV: { value: 0.5 },
        uPitchLineAlpha: { value: 0.0 },
        // ===== Override payoff (flow-audit enhancements #4/#5) =====
        // uRawBypass: 1 during the short crash window right after the override
        //   triggers — the shader outputs the raw, un-dithered, un-tinted
        //   tDiffuse render (the system cracks open), then the duotone
        //   inversion flash plays as the aftershock.
        // uOverrideSustain: 0-1 steady paper-white edge band while the key
        //   stays held past the trigger (fast decay on release). Distinct from
        //   the pulsing uOverrideProgress ramp / low-intensity cooldown denial.
        uRawBypass: { value: 0.0 },
        uOverrideSustain: { value: 0.0 },
        // ===== F5 dither language =====
        // uDitherScale: stress-driven sampling-grid divisor (core/StressLevel);
        //   1.0 = the historical grain, ~2.5 = coarse under full pressure.
        // uScreenCenter: dither-scale anchor — the center of the OUTPUT
        //   framebuffer (canvas px, i.e. gl_FragCoord units of the final
        //   pass; NOT the renderScale-scaled `resolution`). Sampling is
        //   centered on it so scale changes zoom the pattern symmetrically.
        //   Set at construction + on resize (PostProcessing.ts).
        // uDitherModeFrom/To + uDitherModeBlend: per-room pattern crossfade
        //   (ids from world/RoomConfig.DITHER_MODE, baked through the
        //   RoomTransition pipeline; transitions blend pattern OUTPUTS).
        // tBlueNoise: 64x64 best-candidate ordered threshold texture,
        //   generated once at boot (shaders/BlueNoiseTexture.ts).
        uDitherScale: { value: 1.0 },
        uScreenCenter: { value: new THREE.Vector2() },
        uDitherModeFrom: { value: 0 },
        uDitherModeTo: { value: 0 },
        uDitherModeBlend: { value: 1.0 },
        tBlueNoise: { value: null },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform bool enableOutline;
        uniform float outlineStrength;
        uniform bool enableDepthDither;
        uniform float ditherTransition;
        uniform bool invertColors;
        // Weather uniforms
        uniform int weatherType;
        uniform float weatherIntensity;
        uniform float weatherTime;
        // Weather-presence pass: onset broadcast + per-room weather flavor
        uniform float uWeatherOnset;            // 1 -> 0 over the event's first ~1.6s
        uniform float uWeatherIsEvent;          // 1 = real event, 0 = transient ambient glitch
        uniform float uWeatherRainDensity;      // RAIN density/speed/trail multiplier
        uniform float uWeatherBandStrength;     // STATIC scan-band organization (FA)
        uniform float uWeatherMisregisterBoost; // RAIN misregistered ghost copy (IN_BETWEEN)
        uniform float uWeatherInvertStrike;     // GLITCH invert-strike strength (POLARIZED)
        // Room-specific uniforms
        uniform float uNoiseDensity;
        uniform float uThresholdBias;
        uniform float uTemporalJitter;
        uniform float uContrast;
        uniform float uGlitchAmount;
        uniform float uGlitchSpeed;
        uniform float uColorInversion;
        uniform float uOverrideProgress;
        uniform float uTime;
        uniform float uFlowerIntensity;
        // 1-bit duotone palette (per-room) + tone-fix brightness lift
        uniform vec3 uInkColor;
        uniform vec3 uPaperColor;
        uniform float uBrightnessLift;
        // Per-room post-process character (Phase 5b)
        uniform float uScanIntensity;   // FORCED_ALIGNMENT: slow horizontal scan band
        uniform float uMisregister;     // IN_BETWEEN: subtle duotone misregistration
        uniform float uFlowerThresholdGain; // signed flower->threshold gain (per-room)
        // Gaze visual feedback
        uniform float uGazeIntensity;        // 0-1 smoothed gaze intensity
        uniform float uGazeVignetteStrength; // peak ink mix of the gaze vignette
        uniform float uPitchLineV;           // screen v of the 45° threshold marker
        uniform float uPitchLineAlpha;       // 0-1 marker opacity (proximity + pulse)
        // Override payoff (flow-audit enhancements #4/#5)
        uniform float uRawBypass;            // 1 = output raw tDiffuse (crash frame)
        uniform float uOverrideSustain;      // 0-1 steady held-resistance edge band
        // F5 dither language: stress grain + per-room pattern crossfade
        uniform float uDitherScale;     // >=1 sampling-coord divisor (coarser grain)
        uniform vec2 uScreenCenter;     // dither-scale anchor: OUTPUT-framebuffer center (gl_FragCoord px)
        uniform int uDitherModeFrom;    // pattern id of the crossfade's from side
        uniform int uDitherModeTo;      // pattern id of the room's own side
        uniform float uDitherModeBlend; // 0=from, 1=to (blends pattern OUTPUTS)
        uniform sampler2D tBlueNoise;   // 64x64 ordered blue-noise thresholds
        varying vec2 vUv;

        // Duotone-aware "inverse": swaps a color toward the opposite palette
        // endpoint. Reduces to (1.0 - c) when ink=black/paper=white, so every
        // existing value-space inversion (day/night, override, glitch, weather,
        // flower vignette) keeps working under an arbitrary duotone palette.
        vec3 duoInvert(vec3 c) {
            return uInkColor + uPaperColor - c;
        }

        // ===== BAYER MATRICES =====

        // Original 4x4 Bayer matrix
        float bayer4x4(vec2 uv) {
            int x = int(mod(uv.x, 4.0));
            int y = int(mod(uv.y, 4.0));
            if (x==0){ if(y==0)return 0.0625; if(y==1)return 0.5625; if(y==2)return 0.1875; if(y==3)return 0.6875; }
            if (x==1){ if(y==0)return 0.8125; if(y==1)return 0.3125; if(y==2)return 0.9375; if(y==3)return 0.4375; }
            if (x==2){ if(y==0)return 0.25;   if(y==1)return 0.75;   if(y==2)return 0.125;  if(y==3)return 0.625; }
            if (x==3){ if(y==0)return 1.0;    if(y==1)return 0.5;    if(y==2)return 0.875;  if(y==3)return 0.375; }
            return 0.5;
        }

        // Fine-grained 8x8 Bayer matrix (for nearby objects)
        float bayer8x8(vec2 uv) {
            int x = int(mod(uv.x, 8.0));
            int y = int(mod(uv.y, 8.0));

            // 8x8 Bayer matrix (normalized to 0-1)
            if (x==0){ if(y==0)return 0.015625; if(y==1)return 0.515625; if(y==2)return 0.140625; if(y==3)return 0.640625; if(y==4)return 0.046875; if(y==5)return 0.546875; if(y==6)return 0.171875; if(y==7)return 0.671875; }
            if (x==1){ if(y==0)return 0.765625; if(y==1)return 0.265625; if(y==2)return 0.890625; if(y==3)return 0.390625; if(y==4)return 0.796875; if(y==5)return 0.296875; if(y==6)return 0.921875; if(y==7)return 0.421875; }
            if (x==2){ if(y==0)return 0.203125; if(y==1)return 0.703125; if(y==2)return 0.078125; if(y==3)return 0.578125; if(y==4)return 0.234375; if(y==5)return 0.734375; if(y==6)return 0.109375; if(y==7)return 0.609375; }
            if (x==3){ if(y==0)return 0.953125; if(y==1)return 0.453125; if(y==2)return 0.828125; if(y==3)return 0.328125; if(y==4)return 0.984375; if(y==5)return 0.484375; if(y==6)return 0.859375; if(y==7)return 0.359375; }
            if (x==4){ if(y==0)return 0.062500; if(y==1)return 0.562500; if(y==2)return 0.187500; if(y==3)return 0.687500; if(y==4)return 0.031250; if(y==5)return 0.531250; if(y==6)return 0.156250; if(y==7)return 0.656250; }
            if (x==5){ if(y==0)return 0.812500; if(y==1)return 0.312500; if(y==2)return 0.937500; if(y==3)return 0.437500; if(y==4)return 0.781250; if(y==5)return 0.281250; if(y==6)return 0.906250; if(y==7)return 0.406250; }
            if (x==6){ if(y==0)return 0.250000; if(y==1)return 0.750000; if(y==2)return 0.125000; if(y==3)return 0.625000; if(y==4)return 0.218750; if(y==5)return 0.718750; if(y==6)return 0.093750; if(y==7)return 0.593750; }
            if (x==7){ if(y==0)return 1.000000; if(y==1)return 0.500000; if(y==2)return 0.875000; if(y==3)return 0.375000; if(y==4)return 0.968750; if(y==5)return 0.468750; if(y==6)return 0.843750; if(y==7)return 0.343750; }
            return 0.5;
        }

        // Coarse 2x2 Bayer matrix (for distant objects - blocky effect)
        float bayer2x2(vec2 uv) {
            int x = int(mod(uv.x, 2.0));
            int y = int(mod(uv.y, 2.0));
            if (x==0){ if(y==0)return 0.0; if(y==1)return 0.5; }
            if (x==1){ if(y==0)return 0.75; if(y==1)return 0.25; }
            return 0.5;
        }

        // ===== DITHER PATTERN LANGUAGE (F5) =====

        // Blue-noise ordered threshold: 64x64 best-candidate rank texture,
        // CPU-generated once at boot, hash-seeded (shaders/BlueNoiseTexture).
        // MUST match config BLUE_NOISE.SIZE; RepeatWrapping tiles it for us.
        const float BLUE_NOISE_SIZE = 64.0;
        float blueNoiseThreshold(vec2 coord) {
            vec2 uv = (floor(coord) + 0.5) / BLUE_NOISE_SIZE;
            return texture2D(tBlueNoise, uv).r;
        }

        // Low-frequency value noise for the IN_BETWEEN territory field.
        float territoryHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float territoryNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = territoryHash(i);
            float b = territoryHash(i + vec2(1.0, 0.0));
            float c = territoryHash(i + vec2(0.0, 1.0));
            float d = territoryHash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        // Threshold of ONE dither pattern mode (DITHER_MODE in RoomConfig:
        // 0=Bayer, 1=blue-noise, 2=dual conflict, 3=mirrored Bayer). Room
        // transitions crossfade the OUTPUT of two modes, never the ids.
        float patternThreshold(int mode, vec2 coord) {
            if (mode == 1) {
                // INFO_OVERFLOW: dense but structureless — overload without
                // the Bayer grid's crystalline order.
                return blueNoiseThreshold(coord);
            }
            if (mode == 2) {
                // IN_BETWEEN: two systems contest the frame — a slow-drifting
                // low-frequency field hands each region to Bayer or
                // blue-noise, with a narrow soft front line between them.
                float region = territoryNoise(vUv * 5.0 + vec2(mod(uTime, 3600.0) * 0.03, 0.0));
                float side = smoothstep(0.45, 0.55, region);
                return mix(bayer4x4(coord), blueNoiseThreshold(coord), side);
            }
            if (mode == 3) {
                // FORCED_ALIGNMENT: the two halves of the view disagree — the
                // right side mirrors the left's Bayer phase/orientation (even
                // the pattern takes sides across the rift).
                vec2 c = coord;
                if (vUv.x > 0.5) {
                    c.x = -c.x - 1.0; // mirrored phase: pattern reads right-to-left
                    c.y += 2.0;       // half-cell slip: the rows disagree too
                }
                return bayer4x4(c);
            }
            return bayer4x4(coord);
        }

        // ===== EDGE DETECTION =====

        // Luminance helper
        float getLuminance(vec3 color) {
            return dot(color, vec3(0.299, 0.587, 0.114));
        }

        // Sobel edge detection
        float sobelEdge(sampler2D tex, vec2 uv, vec2 res) {
            vec2 texel = 1.0 / res;

            // Sample 3x3 neighborhood
            float tl = getLuminance(texture2D(tex, uv + vec2(-texel.x, -texel.y)).rgb);
            float tm = getLuminance(texture2D(tex, uv + vec2(0.0, -texel.y)).rgb);
            float tr = getLuminance(texture2D(tex, uv + vec2(texel.x, -texel.y)).rgb);

            float ml = getLuminance(texture2D(tex, uv + vec2(-texel.x, 0.0)).rgb);
            float mr = getLuminance(texture2D(tex, uv + vec2(texel.x, 0.0)).rgb);

            float bl = getLuminance(texture2D(tex, uv + vec2(-texel.x, texel.y)).rgb);
            float bm = getLuminance(texture2D(tex, uv + vec2(0.0, texel.y)).rgb);
            float br = getLuminance(texture2D(tex, uv + vec2(texel.x, texel.y)).rgb);

            // Sobel kernels
            float gx = -tl + tr - 2.0*ml + 2.0*mr - bl + br;
            float gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;

            return length(vec2(gx, gy));
        }

        // ===== WEATHER EFFECTS =====

        // --- Weather tuning constants (weather-presence pass) ---
        // STATIC: fraction of the frame inverted at full intensity (raised
        // from the historical 0.3 so weather is unmistakable).
        const float STATIC_COVERAGE = 0.45;
        // Scan-storm bands (FORCED_ALIGNMENT): band repeats across the screen,
        // sweep speed (band phases/s), band window half-width in phase units,
        // and the outside-band noise floor (snow nearly silenced off-band).
        const float STATIC_BAND_COUNT = 4.0;
        const float STATIC_BAND_SPEED = 0.5;
        const float STATIC_BAND_HALF_WIDTH = 0.18;
        const float STATIC_BAND_FLOOR = 0.2;
        // RAIN: base column count (density 1 = the historical 50 columns) and
        // the historical active-column share (step(0.85) = 15%); both scale
        // with uWeatherRainDensity.
        const float RAIN_BASE_COLUMNS = 50.0;
        const float RAIN_COLUMN_SHARE = 0.15;
        // RAIN misregistration (IN_BETWEEN): ghost copy's horizontal offset
        // (UV units), its breathing speed (rad/s), and its invert mix.
        const float RAIN_MISREG_OFFSET = 0.012;
        const float RAIN_MISREG_DRIFT_SPEED = 1.3;
        const float RAIN_MISREG_GHOST_MIX = 0.8;
        // Weather-coupled duotone misregistration (IN_BETWEEN, any weather
        // type): extra slip amplitude, widened breathing swing, and a slow
        // phase wander (amplitude in rad, wander rate in rad/s) so the two
        // plates visibly drift/breathe for the storm's whole duration.
        const float MISREG_WX_SLIP_GAIN = 0.5;
        const float MISREG_WX_BREATH_GAIN = 0.35;
        const float MISREG_WX_DRIFT = 3.0;
        const float MISREG_WX_DRIFT_SPEED = 0.45;
        // GLITCH: bar row count / racing speed (shared with glitchEffect) and
        // the horizontal displacement amplitude (UV units) at full intensity.
        const float GLITCH_ROW_COUNT = 30.0;
        const float GLITCH_BAR_SPEED = 100.0;
        const float GLITCH_SHIFT_AMP = 0.06;
        // Invert strikes (POLARIZED rupture-storm): one Bernoulli roll per
        // window (~2-4s cadence), hit probability at strike=1, full-screen
        // invert duration, tear-line half-thickness (px) and row shift (UV).
        const float STRIKE_WINDOW_SECONDS = 3.0;
        const float STRIKE_CHANCE = 0.85;
        const float STRIKE_SECONDS = 0.12;
        const float STRIKE_TEAR_PX = 3.0;
        const float STRIKE_TEAR_SHIFT = 0.08;
        // Onset broadcast: edge-band square-wave strobe frequency (Hz), band
        // peak mix toward paper, and the sweep line half-thickness (px).
        const float ONSET_FLICKER_HZ = 8.0;
        const float ONSET_BAND_MIX = 0.85;
        const float ONSET_SWEEP_PX = 1.5;

        // Static noise (TV snow)
        float staticNoise(vec2 coord, float t) {
            return fract(sin(dot(coord + t, vec2(12.9898, 78.233))) * 43758.5453);
        }

        // Digital rain effect. density scales column count, fall speed, trail
        // length and the active-column share (1.0 = the historical look;
        // INFO_OVERFLOW's 2.5 turns it into a true downpour).
        float digitalRain(vec2 uv, float t, float density) {
            float column = floor(uv.x * RAIN_BASE_COLUMNS * density);
            float speed = (fract(sin(column * 123.456) * 789.0) * 2.0 + 0.5) * density;
            float phase = fract(sin(column * 456.789) * 123.0);
            float y = fract(uv.y * 2.0 + t * speed + phase);
            float dropLength = (0.05 + fract(sin(column * 789.0) * 12.0) * 0.1) * density;
            float drop = step(1.0 - dropLength, y);
            float columnMask = step(1.0 - RAIN_COLUMN_SHARE * density, fract(sin(column * 234.0) * 567.0));
            return drop * columnMask;
        }

        // Glitch effect (horizontal bars + offset)
        float glitchEffect(vec2 uv, float t) {
            float bar = step(0.92, fract(uv.y * GLITCH_ROW_COUNT + t * GLITCH_BAR_SPEED));
            float flicker = step(0.97, fract(sin(t * 500.0) * 12345.0));
            return bar * flicker;
        }

        // ===== MAIN SHADER =====

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            // Override raw-bypass crash frame (flow-audit enhancement #4): for
            // ~0.1s after the trigger the whole 1-bit pipeline is skipped and
            // the raw, un-dithered, un-tinted render leaks through — the system
            // cracks open and shows the world underneath. The duotone inversion
            // flash (uColorInversion below) then plays as the aftershock.
            if (uRawBypass > 0.5) {
                gl_FragColor = vec4(color.rgb, 1.0);
                return;
            }

            float gray = getLuminance(color.rgb);

            // Apply contrast (room-specific) BEFORE the brightness boost so that
            // high uContrast (e.g. POLARIZED's 2.0) is not neutered by midtone saturation.
            gray = (gray - 0.5) * uContrast + 0.5;
            // Brightness boost (gamma lift). Contrast still bites first (per-room
            // uContrast), then we lift so the floor / shadows are not crushed to a
            // featureless ink void: they render as a textured ~10-25% paper dither.
            // uBrightnessLift (~1.55) is the exposed, tunable tone-fix lever.
            gray = pow(clamp(gray, 0.0, 1.0), 0.8) * uBrightnessLift;
            gray = clamp(gray, 0.0, 1.0);

            // Edge detection
            float edge = 0.0;
            if (enableOutline) {
                edge = sobelEdge(tDiffuse, vUv, resolution);
            }

            // Dithering threshold with room-specific modifications
            vec2 pixelCoord = gl_FragCoord.xy;
            float threshold;

            // Wrap unbounded time before high-frequency sin/fract usage to avoid
            // precision banding/freezing on long sessions (and WebGL1/mediump).
            float animTime = mod(uTime, 3600.0);

            // Apply temporal jitter for animated dithering (room-specific)
            vec2 jitteredCoord = pixelCoord;
            if (uTemporalJitter > 0.0) {
                float jitterOffset = sin(animTime * 10.0 + pixelCoord.x * 0.1) * uTemporalJitter * 2.0;
                jitteredCoord.x += jitterOffset;
                jitteredCoord.y += cos(animTime * 8.0 + pixelCoord.y * 0.1) * uTemporalJitter * 2.0;
            }

            // Stress coarsens the grain (F5 "分辨率即情绪"): divide the
            // sampling coords BEFORE the patterns' int/floor quantization, so
            // fractional scales land between cell sizes continuously. The
            // POLARIZED hard-threshold branch never samples a pattern, so the
            // scale (like every pattern knob) is inert there by construction.
            // Anchored on the screen center (uScreenCenter, gl_FragCoord px):
            // a changing scale zooms the pattern symmetrically about the view
            // center instead of crawling away from the lower-left corner.
            // (mod()/floor() in the patterns are negative-coord safe.)
            vec2 scaledCoord = (jitteredCoord - uScreenCenter) / max(uDitherScale, 1.0);

            if (enableDepthDither) {
                float pseudoDepth = length(vUv - 0.5) * 2.0;
                pseudoDepth = smoothstep(0.0, 1.0, pseudoDepth);
                float fineThreshold = bayer8x8(scaledCoord);
                float coarseThreshold = bayer2x2(scaledCoord);
                threshold = mix(fineThreshold, coarseThreshold, smoothstep(ditherTransition - 0.2, ditherTransition + 0.2, pseudoDepth));
            } else {
                // For POLARIZED room (zeroDither), use hard threshold
                if (uNoiseDensity < 0.01) {
                    threshold = 0.5; // Pure 1-bit, no dithering
                } else {
                    // Per-room pattern crossfade (F5): during room transitions
                    // blend the OUTPUT of the from/to patterns, never the ids.
                    float pattern;
                    if (uDitherModeFrom == uDitherModeTo || uDitherModeBlend >= 1.0) {
                        pattern = patternThreshold(uDitherModeTo, scaledCoord);
                    } else if (uDitherModeBlend <= 0.0) {
                        pattern = patternThreshold(uDitherModeFrom, scaledCoord);
                    } else {
                        pattern = mix(
                            patternThreshold(uDitherModeFrom, scaledCoord),
                            patternThreshold(uDitherModeTo, scaledCoord),
                            uDitherModeBlend
                        );
                    }
                    // Apply noise density - scales the dither pattern
                    threshold = mix(0.5, pattern, uNoiseDensity);
                }
            }

            // Apply threshold bias (shifts black/white balance)
            threshold += uThresholdBias;

            // FORCED_ALIGNMENT scan band (~few ALU ops): an orderly horizontal
            // CRT/surveillance refresh line sweeping slowly down-screen biases the
            // dither threshold, so a soft bright/dark band glides over the room.
            // Multiplied by uScanIntensity, so it is exactly inert (no-op) at 0 —
            // including POLARIZED, which never enters this branch with 0 anyway.
            if (uScanIntensity > 0.0) {
                // 0.05 Hz sweep; cosine band centered on the moving scan line.
                float scanPhase = vUv.y * 3.0 - animTime * 0.15;
                float scanBand = cos(scanPhase * 6.28318);
                threshold -= scanBand * uScanIntensity * 0.12;
            }

            // Apply flower intensity influence on threshold. The gain is a
            // per-room SIGNED uniform: positive (default 0.1) = brighter flower
            // means more white/cleaner; negative (INFO_OVERFLOW) = brighter
            // flower means more ink/dirtier (flow-audit break #8).
            threshold -= (uFlowerIntensity - 0.5) * uFlowerThresholdGain;

            // Dither to 1-bit, then map the scalar (~0 / ~1) to the per-room
            // duotone palette. All value-space effects below operate on this
            // vec3 via duoInvert(), which stays palette-correct.
            vec3 finalColor = (gray < threshold) ? uInkColor : uPaperColor;

            // Apply edge as ink outline (on-palette, was hard black)
            if (enableOutline && edge > outlineStrength) {
                finalColor = uInkColor;
            }

            // IN_BETWEEN misregistration (~few ALU ops): the two systems disagree by
            // a sliver. Edges (already computed, free) get a faint duotone fringe — a
            // 1px-style channel slip — by nudging finalColor toward the inverted
            // palette only on edge pixels. Stays on the duotone axis (greyscale-/1bit-
            // consistent) and is exactly inert at uMisregister = 0.
            // Weather couples in through uWeatherMisregisterBoost (weather-presence
            // pass): while ANY weather is active the slip amplitude widens, the
            // breathing swing deepens, and the shimmer phase wanders slowly — the
            // room's duotone offset visibly drifts/breathes for the storm's whole
            // duration. Exactly inert where the room scalar is 0.
            float wxMisreg = (weatherType > 0) ? uWeatherMisregisterBoost * weatherIntensity : 0.0;
            if (uMisregister > 0.0 || wxMisreg > 0.0) {
                float fringe = smoothstep(outlineStrength * 0.5, outlineStrength, edge);
                // Tiny temporal shimmer so the slip "breathes" rather than sitting still.
                float breath = 0.35 + (0.15 + wxMisreg * MISREG_WX_BREATH_GAIN)
                    * sin(animTime * 1.7 + vUv.y * 40.0 + wxMisreg * MISREG_WX_DRIFT * sin(animTime * MISREG_WX_DRIFT_SPEED));
                float slip = fringe * min(1.0, uMisregister + wxMisreg * MISREG_WX_SLIP_GAIN) * breath;
                finalColor = mix(finalColor, duoInvert(finalColor), clamp(slip, 0.0, 1.0));
            }

            // Glitch effect (room-specific). uGlitchAmount scales BOTH line density
            // (higher amount = more frequent glitch lines) and inversion strength,
            // so per-room values (0.02 / 0.05 / 0.08) produce distinct amplitudes.
            if (uGlitchAmount > 0.0) {
                float glitchTime = mod(uTime, 3600.0);
                // Threshold drops from 0.99 (sparse) toward ~0.9 (dense) as amount grows.
                float lineThreshold = 1.0 - clamp(uGlitchAmount, 0.0, 1.0) * 0.5;
                float glitchLine = step(lineThreshold, fract(vUv.y * 30.0 + glitchTime * uGlitchSpeed));
                if (glitchLine > 0.5 && fract(sin(glitchTime * 100.0) * 12345.0) > 0.7) {
                    // Scale inversion strength by amount instead of a hard full flip.
                    float invStrength = clamp(uGlitchAmount * 8.0, 0.0, 1.0);
                    finalColor = mix(finalColor, duoInvert(finalColor), invStrength);
                }
            }

            // Day/night inversion (swaps ink <-> paper under the duotone palette)
            if (invertColors) {
                finalColor = duoInvert(finalColor);
            }

            // Override progress feedback (edge pulse while holding). Carries
            // both the pre-trigger hold ramp and the low-intensity cooldown
            // denial (flow-audit break #2); the post-trigger sustain lives on
            // its own steady channel below (enhancement #5).
            if (uOverrideProgress > 0.0 && uOverrideProgress < 1.0) {
                vec2 centered = vUv - 0.5;
                float edgeDist = max(abs(centered.x), abs(centered.y));
                float pulse = sin(animTime * 8.0) * 0.5 + 0.5;
                float edgePulse = smoothstep(0.4, 0.5, edgeDist) * uOverrideProgress;
                edgePulse *= pulse * 0.5 + 0.5;
                finalColor = mix(finalColor, duoInvert(finalColor), edgePulse * 0.6);
            }

            // Override color inversion effect (for resistance mechanic)
            if (uColorInversion > 0.0) {
                vec3 inverted = duoInvert(finalColor);
                finalColor = mix(finalColor, inverted, uColorInversion);
            }

            // Sustained-resistance edge band (flow-audit enhancement #5): while
            // the key stays held past the trigger the screen edges hold a
            // STEADY paper-white band — "still pressing = still resisting" —
            // with a fast (~0.2s) CPU-side decay after release. Steady + paper
            // (vs pulsing + inverted above) keeps the two states readable, and
            // applying it after the inversion flash keeps the band same-phase
            // white through the aftershock.
            if (uOverrideSustain > 0.0) {
                vec2 sustainCentered = vUv - 0.5;
                float sustainDist = max(abs(sustainCentered.x), abs(sustainCentered.y));
                float sustainBand = smoothstep(0.4, 0.5, sustainDist);
                finalColor = mix(finalColor, uPaperColor, sustainBand * uOverrideSustain * 0.6);
            }

            // Weather effects (per-room flavor via the uWeather* room scalars)
            if (weatherType > 0) {
                vec2 pixelUV = gl_FragCoord.xy / resolution;
                // Wrap weather time to keep high-frequency sin/fract stable over long runs.
                float wTime = mod(weatherTime, 3600.0);

                if (weatherIntensity > 0.0) {
                    if (weatherType == 1) {
                        // Static snow (coverage raised to STATIC_COVERAGE)
                        float noise = staticNoise(gl_FragCoord.xy * 0.15, wTime * 15.0);
                        // FORCED_ALIGNMENT "inspection scan-storm": the snow is
                        // pressed into horizontal bands sweeping the screen (the
                        // room's CRT scan language); off-band noise is nearly
                        // silenced, so the frame reads as reviewed line by line.
                        if (uWeatherBandStrength > 0.0) {
                            float bandPhase = fract(pixelUV.y * STATIC_BAND_COUNT - wTime * STATIC_BAND_SPEED);
                            float band = 1.0 - smoothstep(STATIC_BAND_HALF_WIDTH * 0.5, STATIC_BAND_HALF_WIDTH, abs(bandPhase - 0.5));
                            noise *= mix(1.0, mix(STATIC_BAND_FLOOR, 1.0, band), uWeatherBandStrength);
                        }
                        if (noise > 1.0 - weatherIntensity * STATIC_COVERAGE) {
                            finalColor = duoInvert(finalColor);
                        }
                    } else if (weatherType == 2) {
                        // Digital rain; column density / fall speed / trail length
                        // follow the room's rain flavor (INFO_OVERFLOW's downpour).
                        float rainDensity = max(uWeatherRainDensity, 0.0);
                        float rain = digitalRain(pixelUV, wTime, rainDensity);
                        if (rain > 0.5) {
                            finalColor = uPaperColor;  // Paper-colored rain drops (on-palette)
                        }
                        // IN_BETWEEN misregistration: a second, horizontally offset
                        // copy of the same rain — two systems print one storm and
                        // miss. The slip drifts/breathes so the misprint is alive.
                        if (uWeatherMisregisterBoost > 0.0) {
                            float slip = RAIN_MISREG_OFFSET * (0.6 + 0.4 * sin(wTime * RAIN_MISREG_DRIFT_SPEED));
                            float ghost = digitalRain(pixelUV + vec2(slip, 0.0), wTime, rainDensity);
                            if (ghost > 0.5) {
                                finalColor = mix(finalColor, duoInvert(finalColor), RAIN_MISREG_GHOST_MIX * uWeatherMisregisterBoost);
                            }
                        }
                    } else if (weatherType == 3) {
                        // Signal glitch: bars now DISPLACE the image — the hit row
                        // is re-sampled with a horizontal shift and re-thresholded
                        // to the inverted duotone (stronger than the old flat flip).
                        float glitch = glitchEffect(pixelUV, wTime);
                        if (glitch > 0.5) {
                            float barIdx = floor(pixelUV.y * GLITCH_ROW_COUNT + wTime * GLITCH_BAR_SPEED);
                            float barSeed = fract(sin(barIdx * 91.7) * 43758.5453);
                            float shift = (barSeed - 0.5) * GLITCH_SHIFT_AMP * weatherIntensity;
                            vec3 shiftedSrc = texture2D(tDiffuse, vec2(fract(vUv.x + shift), vUv.y)).rgb;
                            vec3 shifted = (getLuminance(shiftedSrc) < 0.5) ? uInkColor : uPaperColor;
                            finalColor = duoInvert(shifted);
                        }
                        // POLARIZED "rupture-storm" (uWeatherInvertStrike): one
                        // hash Bernoulli roll per ~3s window; a hit inverts the
                        // whole frame for ~0.12s and tears 1-2 thin rows sideways.
                        // Missed windows keep the glitch above subdued — the dead
                        // calm between strikes IS the room. Gated on uWeatherIsEvent
                        // so 0.1-0.5s transient ambient glitches keep only the bar
                        // flicker above — hard strikes stay reserved for the rare
                        // full-length rupture events.
                        if (uWeatherInvertStrike > 0.0 && uWeatherIsEvent > 0.5) {
                            float windowIdx = floor(wTime / STRIKE_WINDOW_SECONDS);
                            float tInWindow = wTime - windowIdx * STRIKE_WINDOW_SECONDS;
                            float strikeRoll = fract(sin(windowIdx * 127.1) * 43758.5453);
                            if (strikeRoll < uWeatherInvertStrike * STRIKE_CHANCE && tInWindow < STRIKE_SECONDS) {
                                finalColor = duoInvert(finalColor);
                                // 1-2 horizontal tear lines: hard-shifted rows
                                // re-thresholded WITHOUT the invert, so they stand
                                // out against the struck frame.
                                float tearV1 = fract(sin((windowIdx + 1.0) * 311.7) * 43758.5453);
                                float tearV2 = fract(sin((windowIdx + 2.0) * 269.5) * 43758.5453);
                                float hasSecond = step(0.5, fract(sin((windowIdx + 3.0) * 183.3) * 43758.5453));
                                float nearTear = step(abs(vUv.y - tearV1) * resolution.y, STRIKE_TEAR_PX)
                                    + hasSecond * step(abs(vUv.y - tearV2) * resolution.y, STRIKE_TEAR_PX);
                                if (nearTear > 0.0) {
                                    float tearShift = (fract(sin(windowIdx * 97.3) * 43758.5453) - 0.5) * STRIKE_TEAR_SHIFT;
                                    vec3 tearSrc = texture2D(tDiffuse, vec2(fract(vUv.x + tearShift), vUv.y)).rgb;
                                    finalColor = (getLuminance(tearSrc) < 0.5) ? uInkColor : uPaperColor;
                                }
                            }
                        }
                    }
                }

                // ===== ONSET BROADCAST (uWeatherOnset: 1 -> 0 over ~1.6s) =====
                // "Weather just started" must be unmissable: the screen-edge band
                // (sustain-band geometry) strobes as a fast square wave, and a
                // thin paper line sweeps from the top of the screen to the bottom
                // as the onset window decays. Gated on weatherType only, so the
                // broadcast fires even while intensity is still ramping in.
                if (uWeatherOnset > 0.0) {
                    vec2 onsetCentered = vUv - 0.5;
                    float onsetDist = max(abs(onsetCentered.x), abs(onsetCentered.y));
                    float onsetBand = smoothstep(0.4, 0.5, onsetDist);
                    float strobe = step(0.5, fract(animTime * ONSET_FLICKER_HZ));
                    finalColor = mix(finalColor, uPaperColor, onsetBand * strobe * uWeatherOnset * ONSET_BAND_MIX);
                    // Sweep line: vUv.y = uWeatherOnset runs top (1) -> bottom (0)
                    // across the onset window.
                    float sweepPx = abs(vUv.y - uWeatherOnset) * resolution.y;
                    finalColor = mix(finalColor, uPaperColor, step(sweepPx, ONSET_SWEEP_PX));
                }
            }

            // ===== FLOWER INTENSITY VISUAL FEEDBACK =====
            // At high intensity (>0.7), add a subtle radial vignette/glow effect
            if (uFlowerIntensity > 0.7) {
                float highIntensity = (uFlowerIntensity - 0.7) / 0.3; // 0-1 in intense range
                vec2 centered = vUv - 0.5;
                float radialDist = length(centered) * 2.0;

                // Pulsing edge glow at high intensity
                float pulse = sin(animTime * 4.0) * 0.3 + 0.7;
                float edgeGlow = smoothstep(0.8, 1.2, radialDist) * highIntensity * pulse;

                // Invert edges slightly to create "bloom overflow" effect
                finalColor = mix(finalColor, duoInvert(finalColor), edgeGlow * 0.4);
            }

            // ===== GAZE VISUAL FEEDBACK =====
            // Disciplinary vignette: while gazing at the eye, the screen edges
            // close in toward ink. Gentle (peak mix = uGazeVignetteStrength,
            // from GAZE_VISUAL config) and smoothed by the gaze intensity curve.
            if (uGazeIntensity > 0.0) {
                vec2 gazeCentered = vUv - 0.5;
                // ~0 at center, 1 at the corners.
                float vig = smoothstep(0.5, 1.0, length(gazeCentered) * 1.41421356);
                finalColor = mix(finalColor, uInkColor, vig * uGazeIntensity * uGazeVignetteStrength);
            }

            // 45° gaze-threshold marker: a thin paper-white horizon line that
            // fades in as pitch nears the threshold (alpha also carries the
            // short first-crossing pulse). One render-target pixel tall to
            // match the 1-bit pixel grid.
            if (uPitchLineAlpha > 0.001) {
                float linePx = abs(vUv.y - uPitchLineV) * resolution.y;
                float line = step(linePx, 0.5);
                finalColor = mix(finalColor, uPaperColor, line * uPitchLineAlpha);
            }

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `,
};

/**
 * Cable pulse shader for animated cables
 * Enhanced with smooth pulses and per-cable random timing
 */
export const CableShader: ShaderDefinition = {
    uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x000000) },
        pulseColor: { value: new THREE.Color(0x555555) },
    },
    vertexShader: `
        uniform float time;
        attribute float lineDistance;
        attribute float randomSeed;  // Per-vertex random seed for variety
        varying float vLineDistance;
        varying float vRandomSeed;
        void main() {
            vLineDistance = lineDistance;
            vRandomSeed = randomSeed;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform vec3 pulseColor;
        varying float vLineDistance;
        varying float vRandomSeed;

        void main() {
            // Random parameters derived from seed (reduced ranges for subtler effect)
            float speedMult = 0.4 + vRandomSeed * 0.6;        // Speed: 0.4x to 1.0x
            float freqMult = 0.03 + vRandomSeed * 0.04;       // Frequency variation
            float phaseOffset = vRandomSeed * 6.28318;         // Random phase 0 to 2π

            // Multi-layered pulse for organic feel
            float wave1 = fract(vLineDistance * freqMult - time * speedMult + phaseOffset);
            float wave2 = fract(vLineDistance * freqMult * 0.5 - time * speedMult * 0.7 + phaseOffset * 0.5);

            // Smooth pulse with gradual fade (instead of harsh step)
            float pulse1 = smoothstep(0.7, 0.85, wave1) * smoothstep(1.0, 0.9, wave1);
            float pulse2 = smoothstep(0.75, 0.88, wave2) * smoothstep(1.0, 0.92, wave2) * 0.6;

            // Combine pulses
            float pulse = clamp(pulse1 + pulse2, 0.0, 1.0);

            vec3 finalColor = mix(color, pulseColor, pulse);
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `,
};
