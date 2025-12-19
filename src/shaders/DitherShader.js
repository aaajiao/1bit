// 1-bit Chimera Void - Dither Shader
import * as THREE from 'three';

/**
 * 1-BIT BAYER DITHER POST-PROCESSING SHADER
 * Converts scene to black/white using 4x4 Bayer matrix threshold
 */
export const DitherShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2() },
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
        varying vec2 vUv;

        float bayer4x4(vec2 uv) {
            int x = int(mod(uv.x, 4.0));
            int y = int(mod(uv.y, 4.0));
            if (x==0){ if(y==0)return 0.0625; if(y==1)return 0.5625; if(y==2)return 0.1875; if(y==3)return 0.6875; }
            if (x==1){ if(y==0)return 0.8125; if(y==1)return 0.3125; if(y==2)return 0.9375; if(y==3)return 0.4375; }
            if (x==2){ if(y==0)return 0.25;   if(y==1)return 0.75;   if(y==2)return 0.125;  if(y==3)return 0.625; }
            if (x==3){ if(y==0)return 1.0;    if(y==1)return 0.5;    if(y==2)return 0.875;  if(y==3)return 0.375; }
            return 0.5;
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            gray = pow(gray, 0.8) * 2.0;
            vec2 pixelCoord = gl_FragCoord.xy;
            float threshold = bayer4x4(pixelCoord);
            vec3 finalColor = (gray < threshold) ? vec3(0.0) : vec3(1.0);
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `,
};

/**
 * Cable pulse shader for animated cables
 */
export const CableShader = {
    uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x000000) },
        pulseColor: { value: new THREE.Color(0x555555) },
    },
    vertexShader: `
        uniform float time;
        attribute float lineDistance;
        varying float vLineDistance;
        void main() {
            vLineDistance = lineDistance;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform vec3 pulseColor;
        varying float vLineDistance;
        void main() {
            float pulse = step(0.9, fract(vLineDistance * 0.1 - time * 2.0));
            vec3 finalColor = mix(color, pulseColor, pulse);
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `,
};
