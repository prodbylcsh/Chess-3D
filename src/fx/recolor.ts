import * as THREE from 'three';

/**
 * Recolours a textured marble material while keeping its detail: texels are
 * split into a dark and a light tone by brightness, each tone gets a new colour,
 * the brightness variation around the tone is kept, and the marble veins can
 * take their own (optionally glowing) colour.
 */
export interface RecolorUniforms {
  uRcOn: { value: number };
  /** brightness range that separates the dark tone (below) from the light tone (above) */
  uRcSplit: { value: THREE.Vector2 };
  /** typical brightness of the dark and the light tone in the source texture */
  uRcRef: { value: THREE.Vector2 };
  uRcDark: { value: THREE.Color };
  uRcLight: { value: THREE.Color };
  uRcVein: { value: THREE.Color };
  uRcVeinAmount: { value: number };
  uRcGlow: { value: THREE.Color };
}

export function createRecolorUniforms(): RecolorUniforms {
  return {
    uRcOn: { value: 0 },
    uRcSplit: { value: new THREE.Vector2(0.1, 0.3) },
    uRcRef: { value: new THREE.Vector2(0.03, 0.6) },
    uRcDark: { value: new THREE.Color() },
    uRcLight: { value: new THREE.Color() },
    uRcVein: { value: new THREE.Color() },
    uRcVeinAmount: { value: 0 },
    uRcGlow: { value: new THREE.Color(0, 0, 0) },
  };
}

const HEAD = /* glsl */ `
uniform float uRcOn;
uniform vec2 uRcSplit;
uniform vec2 uRcRef;
uniform vec3 uRcDark;
uniform vec3 uRcLight;
uniform vec3 uRcVein;
uniform float uRcVeinAmount;
uniform vec3 uRcGlow;
`;

const RECOLOR = /* glsl */ `
float rcVein = 0.0;
if (uRcOn > 0.5) {
  float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uRcSplit.x, uRcSplit.y, l);
  float rel = l / max(mix(uRcRef.x, uRcRef.y, k), 1e-4);
  // dark marble has light veins, light marble has darker grey veins
  rcVein = mix(smoothstep(1.4, 3.2, rel), smoothstep(0.93, 0.62, rel), k) * uRcVeinAmount;
  vec3 tone = mix(uRcDark, uRcLight, k) * clamp(mix(rel, 1.0, 0.35), 0.6, 1.45);
  diffuseColor.rgb = mix(tone, uRcVein, rcVein);
}
`;

/** Add recolouring to a lit material, keeping any shader patch it already has (e.g. dissolve). */
export function applyRecolor(material: THREE.Material, uniforms: RecolorUniforms): void {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${RECOLOR}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRcGlow * rcVein;');
  };
  material.customProgramCacheKey = () => `${previousKey()}|recolor`;
}

const LUMA = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * Typical brightness of the dark and light texels of a texture (linear, the
 * space the shader sees), split at `threshold`. Used to calibrate recolouring.
 */
export function measureTones(texture: THREE.Texture | null, threshold = 0.2): { dark: number; light: number } {
  const image = texture?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!image?.width) return { dark: 0.03, light: 0.6 };
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const dark: number[] = [];
  const light: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const l = LUMA(toLinear(data[i] / 255), toLinear(data[i + 1] / 255), toLinear(data[i + 2] / 255));
    (l < threshold ? dark : light).push(l);
  }
  const median = (a: number[], fallback: number) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : fallback);
  return { dark: median(dark, 0.03), light: median(light, 0.6) };
}
