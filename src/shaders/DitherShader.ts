// 1-bit Chimera Void - Dither Shader
import * as THREE from 'three';
import type { ShaderDefinition } from '../types';

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
        invertColors: { value: false },  // Day/night color inversion
        // Weather
        weatherType: { value: 0 },       // 0=clear, 1=static, 2=rain, 3=glitch
        weatherIntensity: { value: 0.0 },
        weatherTime: { value: 0.0 },
        // Room-specific uniforms (mental state spaces)
        uNoiseDensity: { value: 0.5 },    // 0-1, controls dither pattern density
        uThresholdBias: { value: 0.0 },   // -0.5 to 0.5, black/white balance offset
        uTemporalJitter: { value: 0.0 },  // 0-1, temporal dither animation
        uContrast: { value: 1.0 },        // 1.0+, overall contrast
        uGlitchAmount: { value: 0.0 },    // 0-1, vertex displacement amplitude
        uGlitchSpeed: { value: 0.0 },     // Hz, glitch animation frequency
        uColorInversion: { value: 0.0 },  // 0-1, for override effect
        uOverrideProgress: { value: 0.0 }, // 0-1, hold progress feedback
        uTime: { value: 0.0 },            // Global time for animations
        // Flower intensity (affects world response)
        uFlowerIntensity: { value: 0.5 }, // 0-1, player's light intensity
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
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
        varying vec2 vUv;

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
            float gray = getLuminance(color.rgb);

            // Apply contrast (room-specific)
            gray = pow(gray, 0.8) * 2.0;
            gray = (gray - 0.5) * uContrast + 0.5;
            gray = clamp(gray, 0.0, 1.0);

            // Edge detection
            float edge = 0.0;
            if (enableOutline) {
                edge = sobelEdge(tDiffuse, vUv, resolution);
            }

            // Dithering threshold with room-specific modifications
            vec2 pixelCoord = gl_FragCoord.xy;
            float threshold;

            // Apply temporal jitter for animated dithering (room-specific)
            vec2 jitteredCoord = pixelCoord;
            if (uTemporalJitter > 0.0) {
                float jitterOffset = sin(uTime * 10.0 + pixelCoord.x * 0.1) * uTemporalJitter * 2.0;
                jitteredCoord.x += jitterOffset;
                jitteredCoord.y += cos(uTime * 8.0 + pixelCoord.y * 0.1) * uTemporalJitter * 2.0;
            }

            if (enableDepthDither) {
                float pseudoDepth = length(vUv - 0.5) * 2.0;
                pseudoDepth = smoothstep(0.0, 1.0, pseudoDepth);
                float fineThreshold = bayer8x8(jitteredCoord);
                float coarseThreshold = bayer2x2(jitteredCoord);
                threshold = mix(fineThreshold, coarseThreshold, smoothstep(ditherTransition - 0.2, ditherTransition + 0.2, pseudoDepth));
            } else {
                // For POLARIZED room (zeroDither), use hard threshold
                if (uNoiseDensity < 0.01) {
                    threshold = 0.5; // Pure 1-bit, no dithering
                } else {
                    threshold = bayer4x4(jitteredCoord);
                    // Apply noise density - scales the dither pattern
                    threshold = mix(0.5, threshold, uNoiseDensity);
                }
            }

            // Apply threshold bias (shifts black/white balance)
            threshold += uThresholdBias;

            // Apply flower intensity influence on threshold
            // Brighter flower = slightly higher threshold = more white
            threshold -= (uFlowerIntensity - 0.5) * 0.1;

            // Dither to black/white
            vec3 finalColor = (gray < threshold) ? vec3(0.0) : vec3(1.0);

            // Apply edge as black outline
            if (enableOutline && edge > outlineStrength) {
                finalColor = vec3(0.0);
            }

            // Glitch effect (room-specific, applied to UV offset)
            if (uGlitchAmount > 0.0) {
                float glitchLine = step(0.98, fract(vUv.y * 30.0 + uTime * uGlitchSpeed));
                if (glitchLine > 0.5 && fract(sin(uTime * 100.0) * 12345.0) > 0.7) {
                    finalColor = vec3(1.0) - finalColor;
                }
            }

            // Day/night inversion
            if (invertColors) {
                finalColor = vec3(1.0) - finalColor;
            }

            // Override progress feedback (edge pulse while holding)
            if (uOverrideProgress > 0.0 && uOverrideProgress < 1.0) {
                vec2 centered = vUv - 0.5;
                float edgeDist = max(abs(centered.x), abs(centered.y));
                float pulse = sin(uTime * 8.0) * 0.5 + 0.5;
                float edgePulse = smoothstep(0.4, 0.5, edgeDist) * uOverrideProgress;
                edgePulse *= pulse * 0.5 + 0.5;
                finalColor = mix(finalColor, vec3(1.0) - finalColor, edgePulse * 0.6);
            }

            // Override color inversion effect (for resistance mechanic)
            if (uColorInversion > 0.0) {
                vec3 inverted = vec3(1.0) - finalColor;
                finalColor = mix(finalColor, inverted, uColorInversion);
            }

            // Weather effects
            if (weatherType > 0 && weatherIntensity > 0.0) {
                vec2 pixelUV = gl_FragCoord.xy / resolution;

                if (weatherType == 1) {
                    // Static snow
                    float noise = staticNoise(gl_FragCoord.xy * 0.15, weatherTime * 15.0);
                    if (noise > 1.0 - weatherIntensity * 0.3) {
                        finalColor = vec3(1.0) - finalColor;
                    }
                } else if (weatherType == 2) {
                    // Digital rain
                    float rain = digitalRain(pixelUV, weatherTime);
                    if (rain > 0.5) {
                        finalColor = vec3(1.0);  // White rain drops
                    }
                } else if (weatherType == 3) {
                    // Signal glitch
                    float glitch = glitchEffect(pixelUV, weatherTime);
                    if (glitch > 0.5) {
                        finalColor = vec3(1.0) - finalColor;
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
                float pulse = sin(uTime * 4.0) * 0.3 + 0.7;
                float edgeGlow = smoothstep(0.8, 1.2, radialDist) * highIntensity * pulse;

                // Invert edges slightly to create "bloom overflow" effect
                finalColor = mix(finalColor, vec3(1.0) - finalColor, edgeGlow * 0.4);
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
