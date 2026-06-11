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
        // uDitherModeFrom/To + uDitherModeBlend: per-room pattern crossfade
        //   (ids from world/RoomConfig.DITHER_MODE, baked through the
        //   RoomTransition pipeline; transitions blend pattern OUTPUTS).
        // tBlueNoise: 64x64 best-candidate ordered threshold texture,
        //   generated once at boot (shaders/BlueNoiseTexture.ts).
        uDitherScale: { value: 1.0 },
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

        // Static noise (TV snow)
        float staticNoise(vec2 coord, float t) {
            return fract(sin(dot(coord + t, vec2(12.9898, 78.233))) * 43758.5453);
        }

        // Digital rain effect
        float digitalRain(vec2 uv, float t) {
            float column = floor(uv.x * 50.0);
            float speed = fract(sin(column * 123.456) * 789.0) * 2.0 + 0.5;
            float phase = fract(sin(column * 456.789) * 123.0);
            float y = fract(uv.y * 2.0 + t * speed + phase);
            float dropLength = 0.05 + fract(sin(column * 789.0) * 12.0) * 0.1;
            float drop = step(1.0 - dropLength, y);
            float columnMask = step(0.85, fract(sin(column * 234.0) * 567.0));
            return drop * columnMask;
        }

        // Glitch effect (horizontal bars + offset)
        float glitchEffect(vec2 uv, float t) {
            float bar = step(0.92, fract(uv.y * 30.0 + t * 100.0));
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
            vec2 scaledCoord = jitteredCoord / max(uDitherScale, 1.0);

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
            if (uMisregister > 0.0) {
                float fringe = smoothstep(outlineStrength * 0.5, outlineStrength, edge);
                // Tiny temporal shimmer so the slip "breathes" rather than sitting still.
                float slip = fringe * uMisregister * (0.35 + 0.15 * sin(animTime * 1.7 + vUv.y * 40.0));
                finalColor = mix(finalColor, duoInvert(finalColor), slip);
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

            // Weather effects
            if (weatherType > 0 && weatherIntensity > 0.0) {
                vec2 pixelUV = gl_FragCoord.xy / resolution;
                // Wrap weather time to keep high-frequency sin/fract stable over long runs.
                float wTime = mod(weatherTime, 3600.0);

                if (weatherType == 1) {
                    // Static snow
                    float noise = staticNoise(gl_FragCoord.xy * 0.15, wTime * 15.0);
                    if (noise > 1.0 - weatherIntensity * 0.3) {
                        finalColor = duoInvert(finalColor);
                    }
                } else if (weatherType == 2) {
                    // Digital rain
                    float rain = digitalRain(pixelUV, wTime);
                    if (rain > 0.5) {
                        finalColor = uPaperColor;  // Paper-colored rain drops (on-palette)
                    }
                } else if (weatherType == 3) {
                    // Signal glitch
                    float glitch = glitchEffect(pixelUV, wTime);
                    if (glitch > 0.5) {
                        finalColor = duoInvert(finalColor);
                    }
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
