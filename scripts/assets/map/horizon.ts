// The horizon of the puzzle map, made from code (scripts/assets/build-map.ts): a ring of
// distant land round the camera, its foot in the colour of the fog, with silhouettes on it
// (pawns, towers, tree tops, volcanoes). Everything else on the map is the user's models.
//
// A model is a list of parts; a part is a non-indexed geometry with positions, normals and
// colours and the material it uses: `body` (the land, flat colour) or `glow` (lit windows,
// lava). World.ts draws both unlit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_THEMES } from '../../../src/features/puzzles/map/themes.ts';

export type Mat = 'body' | 'glow';

export interface Part {
  geo: THREE.BufferGeometry;
  mat: Mat;
}

export type Model = Part[];

/** Radius of the near and the far ring. */
export const NEAR = 165;
export const FAR = 235;

// ------------------------------------------------------------------ randomness

/** A seeded random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = (() => {
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad(h: number, x: number, y: number, z: number): number {
  const u = h & 15;
  const a = u < 8 ? x : y;
  const b = u < 4 ? y : u === 12 || u === 14 ? x : z;
  return (u & 1 ? -a : a) + (u & 2 ? -b : b);
}

/** Perlin noise, about −1…1. */
function noise(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u), lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u), lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
}

/** Layered noise (octaves halve in size and strength). */
function fbm(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x, y, z) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
  }
  return sum / norm;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ colours

/** A colour from a hex string (in the linear working space, as glTF wants). */
export const C = (hex: string) => new THREE.Color(hex);
export const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp01(t));

/** The fog colour of the map (World.ts mixes it the same way): where the land fades out. */
export function haze(id: string): THREE.Color {
  const t = WORLD_THEMES[id];
  return C(t.fog).lerp(C(t.sky[1]), 0.35);
}

export type Painter = (p: THREE.Vector3) => THREE.Color;

/** A colour by height, from `low` at y0 to `high` at y1 (silhouettes painted like the ring). */
export function silhouette(low: THREE.Color, high: THREE.Color, y0: number, y1: number): Painter {
  return (p) => mix(low, high, smoothstep(y0, y1, p.y));
}

/** A geometry made into a part, coloured per face (taken at the face's centre). */
export function part(geo: THREE.BufferGeometry, mat: Mat, paint: Painter | THREE.Color): Part {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    p.fromBufferAttribute(pos, i).add(q.fromBufferAttribute(pos, i + 1)).add(q.fromBufferAttribute(pos, i + 2)).divideScalar(3);
    const c = paint instanceof THREE.Color ? paint : paint(p);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geo: g, mat };
}

/** Move, turn or scale geometries in place, chained. */
export function move(geo: THREE.BufferGeometry, x: number, y: number, z: number, rot?: [number, number, number]): THREE.BufferGeometry {
  if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')));
  geo.translate(x, y, z);
  return geo;
}

/** A glowing pane (a window): a thin box. */
export function pane(w: number, h: number, color: THREE.Color): Model {
  return [part(new THREE.BoxGeometry(w, h, 0.06), 'glow', color)];
}

/** A pawn's turned shape, `size` tall, base at y = 0. */
export function pawn(size: number): THREE.BufferGeometry {
  const profile = [
    [0, 0], [0.42, 0], [0.43, 0.05], [0.4, 0.09], [0.36, 0.1], [0.36, 0.13], [0.3, 0.16], [0.24, 0.22], [0.18, 0.36], [0.15, 0.5],
    [0.14, 0.56], [0.25, 0.6], [0.25, 0.63], [0.15, 0.66], [0.17, 0.7], [0.21, 0.76], [0.22, 0.82], [0.2, 0.89], [0.15, 0.95], [0.08, 0.99], [0, 1],
  ];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001) * size, y * size)), 16);
}

// ------------------------------------------------------------------ the ring

/**
 * A ring of land far away round the camera (θ = 0 straight ahead, −z): from below the
 * ground up to `height(θ)`, coloured from `low` (the fog, where it meets the ground) to
 * `high` at the top with a thin lighter rim.
 */
export function horizonRing(radius: number, height: (a: number) => number, low: THREE.Color, high: THREE.Color, rim: THREE.Color, samples = 360): Model {
  const pos: number[] = [];
  const col: number[] = [];
  const rows = [-40, 0, 0.55, 0.96, 1];
  const at = (a: number, k: number): [number, number, number, THREE.Color] => {
    const h = height(a);
    const y = k <= 1 ? rows[k] : h * rows[k];
    const c = k <= 1 ? low : k === 2 ? mix(low, high, 0.6) : k === 3 ? high : mix(high, rim, 0.8);
    return [Math.sin(a) * radius, y, -Math.cos(a) * radius, c];
  };
  for (let i = 0; i < samples; i++) {
    const a0 = (i / samples) * Math.PI * 2;
    const a1 = ((i + 1) / samples) * Math.PI * 2;
    for (let k = 0; k < rows.length - 1; k++) {
      for (const [x, y, z, c] of [at(a0, k), at(a1, k), at(a1, k + 1), at(a0, k), at(a1, k + 1), at(a0, k + 1)]) {
        pos.push(x, y, z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return [{ geo: g, mat: 'body' }];
}

/** Stand a model on the ring at angle a (its front, +z, towards the camera). */
export function onRing(model: Model, radius: number, a: number, y: number, scale = 1): Model {
  for (const pt of model) move(pt.geo.scale(scale, scale, scale), Math.sin(a) * radius, y, -Math.cos(a) * radius, [0, -a, 0]);
  return model;
}

/** Smooth rolling hills: a height function for horizonRing. */
export function hills(base: number, amp: number, freq: number, seed: number): (a: number) => number {
  return (a) => base + amp * (fbm(Math.cos(a) * freq + seed, Math.sin(a) * freq, seed, 3) * 0.5 + 0.5);
}

/** Sharp peaks: ridged noise. */
export function peaks(base: number, amp: number, freq: number, seed: number): (a: number) => number {
  return (a) => {
    const n = 1 - Math.abs(fbm(Math.cos(a) * freq + seed, Math.sin(a) * freq, seed, 4));
    return base + amp * n * n;
  };
}

/** Flat-topped mesas: noise snapped into steps with steep sides. */
export function mesas(base: number, amp: number, freq: number, seed: number): (a: number) => number {
  return (a) => {
    const n = fbm(Math.cos(a) * freq + seed, Math.sin(a) * freq, seed, 3) * 0.5 + 0.5;
    const steps = 3;
    const s = Math.floor(n * steps) / steps;
    const f = n * steps - Math.floor(n * steps);
    return base + amp * (s + smoothstep(0.85, 1, f) / steps);
  };
}

// ------------------------------------------------------------------ output

/** The parts of a model merged per material. */
export function byMaterial(model: Model): Map<Mat, THREE.BufferGeometry> {
  const groups = new Map<Mat, THREE.BufferGeometry[]>();
  for (const pt of model) groups.set(pt.mat, [...(groups.get(pt.mat) ?? []), pt.geo]);
  const out = new Map<Mat, THREE.BufferGeometry>();
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    if (!merged) throw new Error(`could not merge the ${mat} parts`);
    out.set(mat, merged);
  }
  return out;
}

export const triangles = (model: Model) => model.reduce((n, pt) => n + pt.geo.attributes.position.count / 3, 0);
