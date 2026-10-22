// The toolkit the puzzle-map models are made with (scripts/assets/build-map.ts): seeded
// noise, shapes, transforms and vertex paint. Every model is a list of parts; a part is a
// non-indexed geometry with positions, normals and colours, and the material it uses:
//
//   body   matte, lit (stone, wood, leaves, snow)
//   gloss  shiny, lit (obsidian, gold, polished marble)
//   glow   unlit and bright (fire, lava, lit windows, magic)
//   ice    shiny and see-through (ice, crystals)
//
// The map's code (src/features/puzzles/map/World.ts) gives each material its look; the
// colours are painted into the vertices here.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type Mat = 'body' | 'gloss' | 'glow' | 'ice';

export interface Part {
  geo: THREE.BufferGeometry;
  mat: Mat;
}

export type Model = Part[];

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
export function noise(x: number, y: number, z: number): number {
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
export function fbm(x: number, y: number, z: number, octaves = 3): number {
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

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ shapes

export const V2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** A turned shape (chess pieces, columns, bowls) from a profile of [radius, height]. */
export function lathe(profile: [number, number][], segments = 20): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => V2(Math.max(r, 0.0001), y)),
    segments,
  );
}

export const box = (w: number, h: number, d: number, sw = 1, sh = 1, sd = 1) => new THREE.BoxGeometry(w, h, d, sw, sh, sd);
export const cyl = (rTop: number, rBottom: number, h: number, seg = 12, hseg = 1, open = false) => new THREE.CylinderGeometry(rTop, rBottom, h, seg, hseg, open);
export const cone = (r: number, h: number, seg = 8, hseg = 1) => new THREE.ConeGeometry(r, h, seg, hseg);
export const ico = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
export const sphere = (r: number, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
export const dodeca = (r: number, detail = 0) => new THREE.DodecahedronGeometry(r, detail);

/** A flat outline pushed into depth (centred on z), with rounded edges. */
export function extrude(points: [number, number][], depth: number, bevel = 0.04, holes: [number, number][][] = [], curveSegments = 6): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => V2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => V2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A smooth outline through points (Catmull-Rom), for extrude. */
export function curve(points: [number, number][], samples = 60, closed = true): [number, number][] {
  const c = new THREE.SplineCurve(points.map(([x, y]) => V2(x, y)));
  const pts = c.getSpacedPoints(samples).map((p) => [p.x, p.y] as [number, number]);
  return closed ? pts.slice(0, -1) : pts;
}

/** An arch-shaped outline (a rectangle with a round top), for doorways. */
export function archOutline(w: number, h: number, steps = 10): [number, number][] {
  const r = w / 2;
  const pts: [number, number][] = [[-r, 0], [r, 0]];
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * Math.PI;
    pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]);
  }
  return pts;
}

// ------------------------------------------------------------------ transforms

const tmpM = new THREE.Matrix4();

/** Chainable transforms of a geometry (all in place). */
export class G {
  geo: THREE.BufferGeometry;
  constructor(geo: THREE.BufferGeometry) {
    this.geo = geo;
  }
  static of(geo: THREE.BufferGeometry) {
    return new G(geo);
  }
  move(x: number, y: number, z: number) {
    this.geo.translate(x, y, z);
    return this;
  }
  scale(x: number, y = x, z = x) {
    this.geo.scale(x, y, z);
    return this;
  }
  rot(x: number, y: number, z: number) {
    this.geo.applyMatrix4(tmpM.makeRotationFromEuler(new THREE.Euler(x, y, z, 'YXZ')));
    return this;
  }
  /** move it so its lowest point is at height y */
  floor(y = 0) {
    this.geo.computeBoundingBox();
    this.geo.translate(0, y - this.geo.boundingBox!.min.y, 0);
    return this;
  }
  /** move every vertex: f gets the position (change it in place) */
  warp(f: (p: THREE.Vector3) => void) {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      f(p);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    return this;
  }
  /** roughen the surface: move vertices along noise, the same for shared corners */
  rough(amount: number, freq = 1.2, seed = 0) {
    return this.warp((p) => {
      const n = (s: number) => fbm(p.x * freq + s + seed, p.y * freq + seed * 0.7, p.z * freq - s + seed * 1.3, 2);
      p.x += n(0) * amount;
      p.y += n(17.3) * amount * 0.6;
      p.z += n(41.7) * amount;
    });
  }
  /** bend along x as the height grows (a leaning shape) */
  lean(x: number, z = 0, power = 1.6) {
    this.geo.computeBoundingBox();
    const top = this.geo.boundingBox!.max.y || 1;
    return this.warp((p) => {
      const t = Math.pow(Math.max(0, p.y / top), power);
      p.x += x * t;
      p.z += z * t;
    });
  }
}

/** Weld the corners of a primitive so warping keeps it closed (drops uvs and normals). */
export function solid(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return mergeVertices(geo, 1e-4);
}

/**
 * Split the long edges of a welded geometry until none is longer than maxEdge, so big flat
 * faces (an extruded outline's sides) get vertices to roughen and paint. Each edge is
 * split or not for both of its triangles, so the surface stays closed.
 */
export function refine(geo: THREE.BufferGeometry, maxEdge: number, passes = 6): THREE.BufferGeometry {
  const g = geo.index ? geo : solid(geo);
  const pos = Array.from(g.attributes.position.array as ArrayLike<number>);
  let idx = Array.from(g.index!.array as ArrayLike<number>);
  const len2 = (a: number, b: number) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
  for (let pass = 0; pass < passes; pass++) {
    const mids = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      if (len2(a, b) <= maxEdge * maxEdge) return -1;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let m = mids.get(key);
      if (m === undefined) {
        m = pos.length / 3;
        pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
        mids.set(key, m);
      }
      return m;
    };
    const out: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      let [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      let [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)];
      const n = +(ab >= 0) + +(bc >= 0) + +(ca >= 0);
      // turn the triangle so the split edges come first (ab, then bc)
      for (let k = 0; k < 3 && !(n === 1 ? ab >= 0 : n === 2 ? ab >= 0 && bc >= 0 : true); k++) {
        [a, b, c] = [b, c, a];
        [ab, bc, ca] = [bc, ca, ab];
      }
      if (n === 0) out.push(a, b, c);
      else if (n === 1) out.push(a, ab, c, ab, b, c);
      else if (n === 2) out.push(ab, b, bc, a, ab, bc, a, bc, c);
      else out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const changed = out.length !== idx.length;
    idx = out;
    if (!changed) break;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  r.setIndex(idx);
  return r;
}

// ------------------------------------------------------------------ paint and finish

export type Painter = (p: THREE.Vector3, n: THREE.Vector3, rand: number) => THREE.Color;

/** A colour from a hex string (in the linear working space, as glTF wants). */
export const C = (hex: string) => new THREE.Color(hex);
export const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp01(t));
export const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);

/**
 * Finish a geometry into a part: faceted (flat normals, one colour per face: the low-poly
 * look of the map) or smooth (shared normals, colour per vertex: turned pieces, columns).
 */
export function part(geo: THREE.BufferGeometry, mat: Mat, paint: Painter | THREE.Color, opts: { smooth?: boolean; seed?: number } = {}): Part {
  let g: THREE.BufferGeometry;
  if (opts.smooth) {
    g = solid(geo.clone());
    g.computeVertexNormals();
    g = g.toNonIndexed();
  } else {
    g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.computeVertexNormals();
  }
  g.deleteAttribute('uv');
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const r = rng(opts.seed ?? 7);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const painter: Painter = paint instanceof THREE.Color ? () => paint : paint;
  if (opts.smooth) {
    for (let i = 0; i < pos.count; i++) {
      const c = painter(p.fromBufferAttribute(pos, i), n.fromBufferAttribute(nor, i), hash3(p));
      colors.set([c.r, c.g, c.b], i * 3);
    }
  } else {
    // one colour per face, taken at its centre
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      p.fromBufferAttribute(pos, i).add(a.fromBufferAttribute(pos, i + 1)).add(b.fromBufferAttribute(pos, i + 2)).divideScalar(3);
      n.fromBufferAttribute(nor, i);
      const c = painter(p, n, r());
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geo: g, mat };
}

/** A stable random number for a position (smooth parts: equal for shared vertices). */
function hash3(p: THREE.Vector3): number {
  const s = Math.sin(p.x * 127.1 + p.y * 311.7 + p.z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Move, turn or scale every part of a model (in place; normals follow). */
export function place(model: Model, f: (g: G) => void): Model {
  for (const pt of model) f(G.of(pt.geo));
  return model;
}

export function copy(model: Model): Model {
  return model.map((pt) => ({ geo: pt.geo.clone(), mat: pt.mat }));
}

/** The parts of a model merged per material. */
export function byMaterial(model: Model): Map<Mat, THREE.BufferGeometry> {
  const out = new Map<Mat, THREE.BufferGeometry>();
  const groups = new Map<Mat, THREE.BufferGeometry[]>();
  for (const pt of model) {
    const list = groups.get(pt.mat) ?? [];
    list.push(pt.geo);
    groups.set(pt.mat, list);
  }
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    if (!merged) throw new Error(`could not merge the ${mat} parts`);
    out.set(mat, merged);
  }
  return out;
}

export const triangles = (model: Model) => model.reduce((n, pt) => n + pt.geo.attributes.position.count / 3, 0);

// ------------------------------------------------------------------ common painters

/**
 * Weathered stone: darker low down and in the crevices (faces turned down), lighter on
 * top, with grain; `moss` greens the faces that look up.
 */
export function stone(base: THREE.Color, opts: { moss?: THREE.Color; mossAmount?: number; height?: number; grain?: number; seed?: number; snow?: THREE.Color } = {}): Painter {
  const h = opts.height ?? 3;
  const grain = opts.grain ?? 0.18;
  const seed = opts.seed ?? 0;
  return (p, n, r) => {
    const up = n.y;
    let c = shade(base, 0.62 + 0.38 * smoothstep(-0.2, h, p.y) + up * 0.08 + (r - 0.5) * grain + fbm(p.x * 1.7 + seed, p.y * 1.7, p.z * 1.7, 2) * 0.22);
    if (p.y < 0.35) c = shade(c, 0.7 + p.y * 0.85);
    if (opts.moss) {
      const m = smoothstep(0.25, 0.9, up) * smoothstep(-0.15, 0.35, fbm(p.x * 0.9 + seed, p.y * 0.9, p.z * 0.9, 2)) * (opts.mossAmount ?? 1);
      c = mix(c, shade(opts.moss, 0.85 + r * 0.3), m);
    }
    if (opts.snow) c = mix(c, opts.snow, smoothstep(0.45, 0.75, up + fbm(p.x * 1.3, p.y, p.z * 1.3, 2) * 0.3));
    return c;
  };
}

/** Horizontal bands of colour (canyon rock), the bands wobbling a little. */
export function strata(colors: THREE.Color[], band = 0.55, seed = 0, wobble = 0.6): Painter {
  return (p, n, r) => {
    const k = (p.y + fbm(p.x * 0.35 + seed, 0, p.z * 0.35, 2) * wobble) / band;
    const i = ((Math.floor(k) % colors.length) + colors.length) % colors.length;
    const c = colors[i];
    return shade(c, 0.78 + n.y * 0.16 + (r - 0.5) * 0.12 + smoothstep(0, 6, p.y) * 0.12);
  };
}

/** A vertical gradient, bottom to top. */
export function gradient(bottom: THREE.Color, top: THREE.Color, y0: number, y1: number, jitter = 0.08): Painter {
  return (p, n, r) => shade(mix(bottom, top, (p.y - y0) / (y1 - y0)), 1 + (r - 0.5) * jitter + n.y * 0.04);
}

/** Foliage: lighter where it faces the sky, darker inside and below. */
export function leaves(base: THREE.Color, light: THREE.Color, seed = 0): Painter {
  return (p, n, r) => {
    const t = clamp01(0.45 + n.y * 0.45 + fbm(p.x * 1.4 + seed, p.y * 1.4, p.z * 1.4, 2) * 0.35);
    return shade(mix(base, light, t), 0.82 + r * 0.3);
  };
}
