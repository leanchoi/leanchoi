/**
 * Shaders del cielo y de las partículas de clima.
 *
 * Tres materiales hechos a mano, sin dependencias de post-procesado:
 *
 *  · **Cielo**: domo con gradiente cenit→horizonte, disco solar con halo y una
 *    capa de nubes procedimentales que se mueve con el viento real.
 *  · **Nieve**: puntos redondos con atenuación por distancia.
 *  · **Lluvia / ráfagas**: segmentos que se desvanecen hacia la punta, para que
 *    la gota se lea como un trazo y no como un palito.
 *
 * Todo en GLSL ES 1.0 (WebGL2 lo compila igual vía three), sin extensiones.
 */

import { AdditiveBlending, BackSide, Color, ShaderMaterial, Vector3 } from 'three';
import type { SkyState } from './DayNightCycle.ts';

/* ------------------------------------------------------------------ */
/* Cielo                                                               */
/* ------------------------------------------------------------------ */

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorldDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
precision mediump float;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uCloudCover;
uniform float uTime;
uniform float uWindKph;
uniform float uWindDirRad;
uniform float uNight;

varying vec3 vWorldDirection;

// Ruido de valor clásico: barato y suficiente para bandas de nubes.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vWorldDirection);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

  // Gradiente: el horizonte pesa más cerca del suelo.
  float t = pow(clamp(dir.y, 0.0, 1.0), 0.55);
  vec3 sky = mix(uHorizon, uZenith, t);

  // Bajo el horizonte se oscurece hacia el valle.
  sky = mix(sky * 0.55, sky, smoothstep(-0.25, 0.02, dir.y));

  // Sol: disco duro + halo suave. De noche queda apagado.
  float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
  float disc = smoothstep(0.9975, 0.9992, sunDot);
  float halo = pow(sunDot, 220.0) * 0.35 + pow(sunDot, 12.0) * 0.12;
  sky += uSunColor * (disc * 1.6 + halo) * (1.0 - uNight * 0.85);

  // Nubes: dos capas de fbm desplazadas por el viento real de Esquel.
  if (dir.y > 0.02 && uCloudCover > 0.01) {
    vec2 windDir = vec2(sin(uWindDirRad), cos(uWindDirRad));
    vec2 uv = dir.xz / max(dir.y, 0.12);
    vec2 drift = windDir * uTime * (0.004 + uWindKph * 0.0006);
    float clouds = fbm(uv * 0.55 + drift) * 0.65 + fbm(uv * 1.7 - drift * 1.6) * 0.35;
    float mask = smoothstep(0.62 - uCloudCover * 0.5, 0.95 - uCloudCover * 0.35, clouds);
    mask *= smoothstep(0.02, 0.28, dir.y) * uCloudCover;
    vec3 cloudColor = mix(vec3(0.28, 0.30, 0.34), vec3(0.94, 0.94, 0.96), 1.0 - uNight * 0.8);
    cloudColor = mix(cloudColor, uSunColor, halo * 2.0);
    sky = mix(sky, cloudColor, mask * 0.85);
  }

  // Estrellas: sólo de noche y lejos del horizonte.
  if (uNight > 0.5 && dir.y > 0.12) {
    float star = hash(floor(dir.xz * 260.0 / max(dir.y, 0.2)));
    float twinkle = step(0.9985, star) * (0.6 + 0.4 * sin(uTime * 2.0 + star * 60.0));
    sky += vec3(twinkle) * smoothstep(0.12, 0.5, dir.y) * (1.0 - uCloudCover * 0.9);
  }

  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}
`;

export interface SkyUniforms {
  uZenith: { value: Color };
  uHorizon: { value: Color };
  uSunColor: { value: Color };
  uSunDirection: { value: Vector3 };
  uCloudCover: { value: number };
  uTime: { value: number };
  uWindKph: { value: number };
  uWindDirRad: { value: number };
  uNight: { value: number };
}

/** Material del domo celeste. Va en una esfera grande con `BackSide`. */
export const createSkyMaterial = (): ShaderMaterial => {
  const uniforms: SkyUniforms = {
    uZenith: { value: new Color(0x1f6fc4) },
    uHorizon: { value: new Color(0xc9e2f2) },
    uSunColor: { value: new Color(0xfff0d0) },
    uSunDirection: { value: new Vector3(0, 1, 0) },
    uCloudCover: { value: 0.3 },
    uTime: { value: 0 },
    uWindKph: { value: 10 },
    uWindDirRad: { value: Math.PI },
    uNight: { value: 0 },
  };
  return new ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
};

/** Vuelca el estado del ciclo solar y del viento en los uniforms del cielo. */
export const updateSkyMaterial = (
  material: ShaderMaterial,
  sky: SkyState,
  opts: { cloudCover: number; windKph: number; windDirDeg: number; elapsed: number },
): void => {
  const u = material.uniforms as unknown as SkyUniforms;
  u.uZenith.value.copy(sky.zenith);
  u.uHorizon.value.copy(sky.horizon);
  u.uSunColor.value.copy(sky.sunColor);
  u.uSunDirection.value.copy(sky.sunDirection);
  u.uCloudCover.value = opts.cloudCover;
  u.uWindKph.value = opts.windKph;
  u.uWindDirRad.value = (opts.windDirDeg * Math.PI) / 180;
  u.uNight.value = sky.night ? 1 : 0;
  u.uTime.value = opts.elapsed;
};

/* ------------------------------------------------------------------ */
/* Nieve                                                               */
/* ------------------------------------------------------------------ */

const SNOW_VERTEX = /* glsl */ `
uniform float uSize;
attribute float aScale;
varying float vScale;

void main() {
  vScale = aScale;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * aScale * (260.0 / max(-mvPosition.z, 1.0));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SNOW_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vScale;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.12, d) * uOpacity * (0.65 + vScale * 0.35);
  gl_FragColor = vec4(uColor, alpha);
}
`;

/** Copo de nieve: punto redondo, sin textura. */
export const createSnowMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(0xf4f8fb) },
      uOpacity: { value: 0.9 },
      uSize: { value: 2.2 },
    },
    vertexShader: SNOW_VERTEX,
    fragmentShader: SNOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });

/* ------------------------------------------------------------------ */
/* Lluvia y ráfagas                                                    */
/* ------------------------------------------------------------------ */

const STREAK_VERTEX = /* glsl */ `
attribute float aTip;
varying float vTip;

void main() {
  vTip = aTip;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STREAK_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vTip;

void main() {
  // aTip = 0 en la cabeza del trazo y 1 en la cola: la cola se desvanece.
  gl_FragColor = vec4(uColor, uOpacity * (1.0 - vTip * 0.85));
}
`;

/** Trazo de lluvia o de ráfaga de viento. Va en `LineSegments`. */
export const createStreakMaterial = (color: number, opacity: number): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
