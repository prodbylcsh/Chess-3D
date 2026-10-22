// Building blocks shared by the worlds of the puzzle map (scripts/assets/map/worlds.ts):
// chess pieces, plants, rocks, fire, towers, the horizon ring.
import * as THREE from 'three';
import {
  C,
  G,
  box,
  clamp01,
  cone,
  cyl,
  dodeca,
  extrude,
  fbm,
  gradient,
  ico,
  lathe,
  leaves,
  mix,
  noise,
  part,
  rng,
  shade,
  smoothstep,
  solid,
  type Mat,
  type Model,
  type Painter,
} from './kit.ts';

// ------------------------------------------------------------------ chess pieces

type Profile = [number, number][];

/** Staunton-like profiles, one unit = the pawn's height. */
const PROFILES: Record<'pawn' | 'king' | 'queen' | 'rook' | 'bishop', Profile> = {
  pawn: [
    [0, 0], [0.42, 0], [0.43, 0.05], [0.4, 0.09], [0.36, 0.1], [0.36, 0.13], [0.3, 0.16], [0.24, 0.22], [0.18, 0.36], [0.15, 0.5],
    [0.14, 0.56], [0.25, 0.6], [0.25, 0.63], [0.15, 0.66], [0.17, 0.7], [0.21, 0.76], [0.22, 0.82], [0.2, 0.89], [0.15, 0.95], [0.08, 0.99], [0, 1],
  ],
  king: [
    [0, 0], [0.46, 0], [0.47, 0.05], [0.43, 0.1], [0.39, 0.11], [0.39, 0.15], [0.32, 0.19], [0.26, 0.28], [0.2, 0.55], [0.17, 0.85], [0.16, 0.95],
    [0.28, 1.0], [0.28, 1.04], [0.18, 1.08], [0.2, 1.12], [0.16, 1.15], [0.21, 1.21], [0.27, 1.33], [0.29, 1.4], [0.22, 1.42], [0.13, 1.44], [0, 1.45],
  ],
  queen: [
    [0, 0], [0.45, 0], [0.46, 0.05], [0.42, 0.1], [0.38, 0.11], [0.38, 0.15], [0.31, 0.19], [0.25, 0.28], [0.19, 0.55], [0.16, 0.82], [0.15, 0.92],
    [0.27, 0.97], [0.27, 1.01], [0.17, 1.05], [0.19, 1.09], [0.16, 1.12], [0.22, 1.2], [0.3, 1.32], [0.27, 1.34], [0.14, 1.32], [0.1, 1.38], [0, 1.4],
  ],
  rook: [
    [0, 0], [0.44, 0], [0.45, 0.05], [0.41, 0.1], [0.37, 0.11], [0.37, 0.15], [0.3, 0.19], [0.26, 0.28], [0.24, 0.6], [0.23, 0.74], [0.31, 0.77],
    [0.31, 0.81], [0.28, 0.83], [0.31, 0.87], [0.32, 0.95], [0.24, 0.95], [0.24, 0.9], [0, 0.9],
  ],
  bishop: [
    [0, 0], [0.43, 0], [0.44, 0.05], [0.4, 0.1], [0.36, 0.11], [0.36, 0.15], [0.29, 0.19], [0.23, 0.28], [0.17, 0.55], [0.14, 0.76], [0.25, 0.8],
    [0.25, 0.84], [0.15, 0.87], [0.19, 0.95], [0.21, 1.04], [0.17, 1.14], [0.1, 1.22], [0.07, 1.25], [0.1, 1.29], [0.06, 1.33], [0, 1.34],
  ],
};

export type PieceKind = keyof typeof PROFILES | 'knight';

/** A chess piece's geometries, `size` = the pawn's height, base at y = 0. */
export function pieceGeos(kind: PieceKind, size: number, segments = 18): THREE.BufferGeometry[] {
  if (kind === 'knight') {
    const base = lathe(
      [[0, 0], [0.44, 0], [0.45, 0.05], [0.41, 0.1], [0.37, 0.11], [0.37, 0.15], [0.3, 0.2], [0.27, 0.26], [0, 0.26]],
      segments,
    );
    const head = knightHead(0.5);
    G.of(head).move(0, 0.24, 0);
    return [base, head].map((g) => G.of(g).scale(size).geo);
  }
  const geos = [lathe(PROFILES[kind], segments)];
  if (kind === 'king') {
    geos.push(G.of(box(0.08, 0.3, 0.08)).move(0, 1.57, 0).geo, G.of(box(0.24, 0.08, 0.08)).move(0, 1.6, 0).geo);
  }
  if (kind === 'queen') {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      geos.push(G.of(ico(0.045, 0)).move(Math.sin(a) * 0.27, 1.36, Math.cos(a) * 0.27).geo);
    }
    geos.push(G.of(ico(0.06, 1)).move(0, 1.44, 0).geo);
  }
  if (kind === 'bishop') geos.push(G.of(box(0.21, 0.035, 0.3)).rot(0, 0, 0.7).move(0.05, 1.08, 0).geo);
  return geos.map((g) => G.of(g).scale(size).geo);
}

/** The knight's head as a flat outline pushed into depth: facing +x, about 1.2 × width tall. */
export function knightHead(depth: number): THREE.BufferGeometry {
  // a Staunton knight's head in profile: the chest, the long muzzle, the ears, the mane
  const outline: [number, number][] = [
    [-0.36, 0], [0.36, 0], [0.35, 0.1], [0.24, 0.26], [0.2, 0.4], [0.24, 0.5], [0.36, 0.56], [0.56, 0.58], [0.74, 0.6], [0.84, 0.64],
    [0.86, 0.72], [0.8, 0.76], [0.86, 0.8], [0.84, 0.88], [0.7, 0.98], [0.5, 1.1], [0.34, 1.2], [0.26, 1.3], [0.24, 1.48], [0.14, 1.36],
    [0.06, 1.44], [-0.02, 1.3], [-0.14, 1.22], [-0.3, 1.08], [-0.42, 0.86], [-0.48, 0.6], [-0.46, 0.34], [-0.4, 0.14],
  ];
  return extrude(outline, depth, 0.025, [], 4);
}

/** A chess piece as a model, painted with `paint`. */
export function piece(kind: PieceKind, size: number, mat: Mat, paint: Painter | THREE.Color, opts: { rough?: number; smooth?: boolean; seed?: number; segments?: number } = {}): Model {
  return pieceGeos(kind, size, opts.segments).map((g, k) => {
    let geo = g;
    if (opts.rough) geo = G.of(solid(g)).rough(opts.rough * size, 1.6 / size, (opts.seed ?? 0) + k).geo;
    return part(geo, mat, paint, { smooth: opts.smooth, seed: (opts.seed ?? 0) + k });
  });
}

// ------------------------------------------------------------------ plants

/** A tuft of grass blades, `h` tall. */
export function grass(h: number, base: THREE.Color, tip: THREE.Color, blades = 7, seed = 1): Model {
  const r = rng(seed);
  const out: Model = [];
  for (let k = 0; k < blades; k++) {
    const hh = h * (0.6 + r() * 0.6);
    const g = G.of(cone(0.05 + r() * 0.03, hh, 3)).move(0, hh / 2, 0).rot((r() - 0.2) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.6).move((r() - 0.5) * h * 0.5, 0, (r() - 0.5) * h * 0.5);
    out.push(part(g.geo, 'body', gradient(shade(base, 0.7), tip, 0, h), { seed: seed + k }));
  }
  return out;
}

/** Little flowers on stems with coloured heads. */
export function flowers(h: number, stem: THREE.Color, heads: THREE.Color[], n = 5, seed = 2): Model {
  const r = rng(seed);
  const out: Model = grass(h * 0.7, stem, shade(stem, 1.3), 4, seed);
  for (let k = 0; k < n; k++) {
    const hh = h * (0.7 + r() * 0.5);
    const x = (r() - 0.5) * h * 0.8;
    const z = (r() - 0.5) * h * 0.8;
    out.push(part(G.of(cyl(0.012, 0.018, hh, 3)).move(x, hh / 2, z).geo, 'body', stem));
    const c = heads[k % heads.length];
    out.push(part(G.of(ico(0.07 + r() * 0.04, 0)).scale(1, 0.6, 1).move(x, hh, z).geo, 'body', (_p, n) => shade(c, 0.85 + n.y * 0.25)));
  }
  return out;
}

/** A soft lumpy blob of leaves, radius r, centred at the origin. */
export function blob(r: number, base: THREE.Color, light: THREE.Color, seed = 3, detail = 1): Model {
  const g = G.of(solid(ico(r, detail))).rough(r * 0.28, 1.1 / r, seed).scale(1, 0.88, 1);
  return [part(g.geo, 'body', leaves(base, light, seed), { seed })];
}

/** A tapered, slightly bent trunk from the ground to height h. */
export function trunk(h: number, r: number, color: THREE.Color, bend = 0.2, seed = 4): Model {
  const g = G.of(solid(cyl(r * 0.6, r, h, 6, 4))).move(0, h / 2, 0).lean(bend, bend * 0.3).rough(r * 0.15, 3 / h, seed);
  return [part(g.geo, 'body', gradient(shade(color, 0.6), color, 0, h, 0.15), { seed })];
}

/** A bare tree: a trunk that forks again and again. */
export function deadTree(h: number, color: THREE.Color, seed = 5, depth = 3): Model {
  const r = rng(seed);
  const out: Model = [];
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, level: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const g = cyl(rad * 0.7, rad, len, 5, 1);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)));
    g.translate(from.x, from.y, from.z);
    out.push(part(g, 'body', (p, n, rr) => shade(color, 0.7 + n.y * 0.2 + rr * 0.15 + smoothstep(0, h, p.y) * 0.2), { seed: seed + level }));
    if (level >= depth) return;
    const forks = level === 0 ? 2 : r() < 0.6 ? 2 : 3;
    for (let k = 0; k < forks; k++) {
      const spread = 0.45 + r() * 0.35;
      const side = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize();
      const nd = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread) * (k === 0 ? 1 : -1)).normalize();
      if (k === 2) nd.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      grow(to, nd, len * (0.62 + r() * 0.15), rad * 0.65, level + 1);
    }
  };
  grow(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3((r() - 0.5) * 0.2, 1, 0).normalize(), h * 0.45, h * 0.06, 0);
  return out;
}

/** Stacked cones of a fir tree, with snow on top when `snow` is given. */
export function fir(h: number, green: THREE.Color, bark: THREE.Color, snow?: THREE.Color, seed = 6): Model {
  const out: Model = trunk(h * 0.3, h * 0.05, bark, 0, seed);
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const rad = h * (0.3 - t * 0.2);
    const ch = h * (0.42 - t * 0.06);
    const g = G.of(solid(cone(rad, ch, 7, 2))).rough(rad * 0.12, 2 / h, seed + k).move(0, h * 0.22 + t * h * 0.62 + ch / 2, 0);
    out.push(
      part(g.geo, 'body', (p, n, rr) => {
        const c = shade(green, 0.75 + rr * 0.3 + n.y * 0.1);
        return snow ? mix(c, snow, smoothstep(0.35, 0.7, n.y + fbm(p.x * 2, p.y * 2, p.z * 2, 2) * 0.3)) : c;
      }, { seed: seed + k }),
    );
  }
  return out;
}

// ------------------------------------------------------------------ rocks and ground

/** A cluster of n rough rocks of about `size`. */
export function rocks(n: number, size: number, paint: Painter, seed = 7, spread = 1): Model {
  const r = rng(seed);
  const out: Model = [];
  for (let k = 0; k < n; k++) {
    const s = size * (0.5 + r() * 0.7) * (k === 0 ? 1.3 : 1);
    const a = r() * Math.PI * 2;
    const d = k === 0 ? 0 : size * spread * (0.6 + r() * 0.8);
    const g = G.of(solid(dodeca(s, 0)))
      .rough(s * 0.25, 1.4 / s, seed + k)
      .scale(1, 0.55 + r() * 0.35, 1)
      .rot(0, r() * 3, 0)
      .move(Math.cos(a) * d, s * 0.25, Math.sin(a) * d);
    out.push(part(g.geo, 'body', paint, { seed: seed + k }));
  }
  return out;
}

/** A low lumpy mound (earth, snow) of radius r and height h. */
export function mound(r: number, h: number, paint: Painter, seed = 8): Model {
  const g = G.of(solid(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)))
    .rough(0.12, 1.5, seed)
    .scale(r, h, r)
    .move(0, -0.05, 0);
  return [part(g.geo, 'body', paint, { seed })];
}

// ------------------------------------------------------------------ fire and light

/** Licks of flame (glow), `h` tall, from `deep` at the root to `bright` at the tips. */
export function flame(h: number, deep: THREE.Color, bright: THREE.Color, tongues = 4, seed = 9): Model {
  const r = rng(seed);
  const out: Model = [];
  for (let k = 0; k < tongues; k++) {
    const hh = h * (k === 0 ? 1 : 0.55 + r() * 0.35);
    const rad = h * (k === 0 ? 0.2 : 0.13 + r() * 0.06);
    const a = (k / tongues) * Math.PI * 2 + r();
    const d = k === 0 ? 0 : h * 0.24;
    const g = G.of(solid(cone(rad, hh, 6, 3)))
      .move(0, hh / 2, 0)
      .rough(rad * 0.3, 3 / h, seed + k)
      .lean((r() - 0.5) * h * 0.3, (r() - 0.5) * h * 0.2)
      .move(Math.cos(a) * d, 0, Math.sin(a) * d);
    out.push(part(g.geo, 'glow', (p) => mix(deep, bright, smoothstep(0, h * 0.8, p.y)), { smooth: true }));
  }
  return out;
}

/** A glowing pane (window, rune): a thin box. */
export function pane(w: number, h: number, color: THREE.Color, depth = 0.06): Model {
  return [part(box(w, h, depth), 'glow', color)];
}

// ------------------------------------------------------------------ buildings

/** Square stones on a round wall top, like a rook's battlements. */
export function battlements(radius: number, y: number, size: number, n: number, paint: Painter, seed = 10): Model {
  const out: Model = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const g = G.of(solid(box(size, size * 1.1, size * 0.8, 1, 1, 1)))
      .rough(size * 0.06, 2 / size, seed + k)
      .rot(0, a, 0)
      .move(Math.sin(a) * radius, y + size * 0.55, Math.cos(a) * radius);
    out.push(part(g.geo, 'body', paint, { seed: seed + k }));
  }
  return out;
}

/**
 * A round stone tower (a rook grown into a building): `h` tall, radius r. `broken` bites
 * a jagged top off it; `windows` glow.
 */
export function tower(h: number, r: number, paint: Painter, opts: { broken?: number; windows?: THREE.Color; seed?: number; battlements?: boolean } = {}): Model {
  const seed = opts.seed ?? 11;
  let g = G.of(solid(cyl(r * 0.92, r, h, 12, 8))).move(0, h / 2, 0).rough(r * 0.05, 1.5 / r, seed);
  if (opts.broken) {
    const cut = h - opts.broken;
    g = g.warp((p) => {
      const a = Math.atan2(p.x, p.z);
      const top = cut + (noise(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7, 0.5) * 0.5 + 0.5) * opts.broken! * 1.2;
      if (p.y > top) p.y = top;
    });
  }
  const out: Model = [part(g.geo, 'body', paint, { seed })];
  if (!opts.broken) {
    const lip = G.of(solid(cyl(r * 1.08, r * 0.95, h * 0.07, 12, 1))).move(0, h - h * 0.02, 0);
    out.push(part(lip.geo, 'body', paint, { seed: seed + 1 }));
    if (opts.battlements !== false) out.push(...battlements(r * 0.98, h + h * 0.01, r * 0.42, 7, paint, seed + 2));
  }
  if (opts.windows) {
    const r2 = rng(seed);
    const rows = Math.max(1, Math.floor(h / 3));
    for (let k = 0; k < rows; k++) {
      const y = h * (0.35 + (k / rows) * 0.5);
      if (opts.broken && y > h - opts.broken * 1.3) continue;
      const a = r2() * Math.PI * 2;
      const w = pane(r * 0.22, r * 0.42, opts.windows)[0];
      G.of(w.geo).rot(0, a, 0).move(Math.sin(a) * r * 0.97, y, Math.cos(a) * r * 0.97);
      out.push(w);
    }
  }
  return out;
}

// ------------------------------------------------------------------ crystals

/** A six-sided crystal with a pointed tip, base at the origin, pointing up. */
export function crystalGeo(h: number, r: number): THREE.BufferGeometry {
  const body = cyl(r, r * 0.85, h * 0.78, 6, 1);
  body.translate(0, h * 0.39, 0);
  const tip = cone(r, h * 0.22, 6, 1);
  tip.translate(0, h * 0.78 + h * 0.11, 0);
  tip.rotateY(0);
  return solidMerge([body, tip]);
}

/** Merge geometries into one closed, welded shape. */
export function solidMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.map((g) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    c.deleteAttribute('uv');
    c.deleteAttribute('normal');
    return c;
  });
  const pos: number[] = [];
  for (const g of flat) pos.push(...(g.attributes.position.array as Float32Array));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return solid(out);
}

/** A cluster of crystals fanning out of one spot. */
export function crystals(n: number, h: number, paint: Painter, mat: Mat = 'ice', seed = 12, spread = 0.55): Model {
  const r = rng(seed);
  const out: Model = [];
  for (let k = 0; k < n; k++) {
    const hh = h * (k === 0 ? 1 : 0.35 + r() * 0.5);
    const g = G.of(crystalGeo(hh, hh * (0.13 + r() * 0.05)))
      .rot(k === 0 ? (r() - 0.5) * 0.15 : (0.3 + r() * spread), r() * Math.PI * 2, 0)
      .move((r() - 0.5) * h * 0.12, -hh * 0.05, (r() - 0.5) * h * 0.12);
    out.push(part(g.geo, mat, paint, { seed: seed + k }));
  }
  return out;
}

// ------------------------------------------------------------------ the horizon

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
      const quad = [at(a0, k), at(a1, k), at(a1, k + 1), at(a0, k), at(a1, k + 1), at(a0, k + 1)];
      for (const [x, y, z, c] of quad) {
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

/** Stand a model on the horizon ring at angle a (its front, +z, towards the camera). */
export function onRing(model: Model, radius: number, a: number, y: number, scale = 1): Model {
  for (const pt of model) G.of(pt.geo).scale(scale).rot(0, -a, 0).move(Math.sin(a) * radius, y, -Math.cos(a) * radius);
  return model;
}

/** A flat silhouette colour for things on the horizon (painted like the ring). */
export function silhouette(low: THREE.Color, high: THREE.Color, y0: number, y1: number): Painter {
  return (p) => mix(low, high, smoothstep(y0, y1, p.y));
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

export { C, clamp01, mix, shade, smoothstep };
