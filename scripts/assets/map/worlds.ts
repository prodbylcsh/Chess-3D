// The models of every puzzle module's world (docs/PLATFORM.md §4.2, the map): what stands
// along the path (`big`, many copies), the small things on the ground near it (`small`),
// a few large landmarks, and the horizon round the whole map. Colours come from the
// module's theme (src/features/puzzles/map/themes.ts).
import * as THREE from 'three';
import { WORLD_THEMES } from '../../../src/features/puzzles/map/themes.ts';
import {
  C,
  G,
  box,
  cone,
  curve,
  cyl,
  extrude,
  fbm,
  gradient,
  ico,
  lathe,
  mix,
  part,
  place,
  refine,
  rng,
  shade,
  smoothstep,
  solid,
  stone,
  strata,
  type Model,
  type Painter,
} from './kit.ts';
import {
  blob,
  crystalGeo,
  crystals,
  deadTree,
  fir,
  flame,
  flowers,
  grass,
  hills,
  horizonRing,
  knightHead,
  mesas,
  mound,
  onRing,
  pane,
  peaks,
  piece,
  pieceGeos,
  rocks,
  silhouette,
  tower,
  trunk,
  type PieceKind,
} from './props.ts';

export interface Weighted {
  model: Model;
  /** how often it appears compared with the others of its kind */
  weight: number;
  /** only on the flat ground by the path (pools) */
  flat?: boolean;
}

export interface WorldModels {
  big: Weighted[];
  small: Weighted[];
  landmarks: Model[];
  /** which way each landmark's front looks: +z (default) or +x (a profile, like the knight's head) */
  facing?: ('x' | 'z')[];
  horizon: { near: Model; far: Model };
}

const NEAR = 165;
const FAR = 235;

/** The fog colour of the map (World.ts mixes it the same way): where the land fades out. */
function haze(id: string): THREE.Color {
  const t = WORLD_THEMES[id];
  return C(t.fog).lerp(C(t.sky[1]), 0.35);
}

const one = (model: Model, weight = 1, flat = false): Weighted => ({ model, weight, flat });
const join = (...models: Model[]): Model => models.flat();

/** A weathered stone chess piece, `warp` reshaping it (a chip, a crack) before painting. */
function statue(kind: PieceKind, size: number, paint: Painter, seed: number, warp?: (p: THREE.Vector3) => void, rough = 0.012, segments = 16): Model {
  return pieceGeos(kind, size, segments).map((g, k) => {
    const s = G.of(solid(g)).rough(rough * size, 1.4 / size, seed + k);
    if (warp) s.warp(warp);
    return part(s.geo, 'body', paint, { seed: seed + k });
  });
}

/** Cut away everything beyond a plane through `at` facing `normal` (a chipped corner). */
function chip(at: THREE.Vector3, normal: THREE.Vector3): (p: THREE.Vector3) => void {
  const n = normal.clone().normalize();
  return (p) => {
    const d = p.clone().sub(at).dot(n);
    if (d > 0) p.addScaledVector(n, -d);
  };
}

/** An outline pushed into depth, with its big faces split for roughening. */
function slab(outline: [number, number][], depth: number, edge: number, roughness: number, seed: number, bevel = 0.1): THREE.BufferGeometry {
  return G.of(refine(solid(extrude(outline, depth, bevel, [], 4)), edge)).rough(roughness, 0.35, seed).geo;
}

/** An arched gateway's outline: a block with an arch-shaped opening down to the ground. */
function gateOutline(w: number, h: number, openW: number, openH: number): [number, number][] {
  const r = openW / 2;
  const inner: [number, number][] = [[-r, 0]];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (k / 12) * Math.PI;
    inner.push([Math.cos(a) * r, openH - r + Math.sin(a) * r]);
  }
  inner.push([r, 0]);
  return [[-w / 2, 0], ...inner, [w / 2, 0], [w / 2, h], [-w / 2, h]];
}

/** A brazier: a stone or bronze bowl on a stem, burning. */
function brazier(metal: THREE.Color, rim: THREE.Color, deep: THREE.Color, bright: THREE.Color, seed: number): Model {
  const bowl = lathe([[0, 0], [0.6, 0], [0.6, 0.2], [0.3, 0.35], [0.2, 1.6], [0.34, 1.76], [0.78, 2.0], [0.88, 2.34], [0.74, 2.38], [0.5, 2.25], [0, 2.22]], 14);
  return join(
    [part(bowl, 'gloss', (p, n) => (p.y > 2.2 ? rim : shade(metal, 0.8 + n.y * 0.3)), { smooth: true })],
    place(flame(1.5, deep, bright, 4, seed), (g) => g.move(0, 2.15, 0)),
  );
}

// ================================================================== Openings
// Dawn over a field of giant stone pawns, the gate where every game begins.

function openings(): WorldModels {
  const t = WORLD_THEMES.openings;
  const marble = C(t.decorColor);
  const moss = C('#808046');
  const paint = (seed: number, mossAmount = 0.7) => stone(marble, { moss, mossAmount, height: 4.5, seed });
  const earth = gradient(C('#3b2a2a'), mix(C(t.ground[1]), C('#6d6a3a'), 0.4), -0.1, 0.9, 0.2);
  const dawnGrass = (seed: number) => grass(0.75, C('#4d4a26'), C('#d9b56b'), 8, seed);

  // light and dark squares, like the edge of a board (on the faces that look forward or back)
  const checker = (base: Painter): Painter => (p, n, r) => {
    const c = base(p, n, r);
    return Math.abs(n.z) > 0.5 && Math.floor((p.x + 5.5) / (11 / 12)) % 2 === 1 ? shade(c, 0.42) : c;
  };
  const plinth = (w: number, seed: number) => [part(G.of(solid(box(w, 0.55, w, 3, 1, 3))).rough(0.08, 0.8, seed).move(0, 0.12, 0).geo, 'body', paint(seed, 1))];

  const pawnWhole = join(plinth(3.6, 1), place(statue('pawn', 4.2, paint(1), 1), (g) => g.move(0, 0.38, 0)));
  const pawnChipped = join(
    place(statue('pawn', 3.8, paint(2), 2, chip(new THREE.Vector3(0.25, 3.5, 0), new THREE.Vector3(0.8, 0.6, 0.15))), (g) => g.rot(0, 0, 0.12)),
    rocks(3, 0.42, paint(2, 0.4), 21, 2.4),
  );
  const pawnSunk = join(place(statue('pawn', 4.8, paint(3, 1), 3), (g) => g.rot(0.08, 0, -0.06).move(0, -1.5, 0)), mound(2.5, 0.85, earth, 3), dawnGrass(31));
  const pawnFallen = join(
    place(statue('pawn', 3.5, paint(4, 1.1), 4, chip(new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0.2, -1, 0.1))), (g) => g.rot(0, 0.5, Math.PI / 2 - 0.08).floor(-0.35)),
    rocks(2, 0.35, paint(4), 41, 3),
  );

  const smallHead = join(place(statue('pawn', 1.5, paint(5, 1), 5, undefined, 0.012, 9), (g) => g.rot(0.9, 0.4, 0.3).move(0, -0.6, 0)), dawnGrass(51));

  // the gate where the path begins: an arch with a pawn on each side
  const gate = join(
    [part(G.of(slab(gateOutline(10, 9.5, 5.4, 7.4), 1.9, 0.9, 0.12, 6)).geo, 'body', paint(6, 1))],
    [part(G.of(solid(box(11, 0.75, 2.6, 12, 1, 2))).rough(0.06, 0.6, 7).move(0, 9.85, 0).geo, 'body', checker(paint(7, 0.5)))],
    place(statue('pawn', 2.6, paint(8, 1), 8), (g) => g.move(-4.3, 10.2, 0)),
    place(statue('pawn', 2.6, paint(9, 1), 9, chip(new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(-0.6, 0.8, 0.2))), (g) => g.move(4.3, 10.2, 0)),
    place(rocks(4, 0.85, paint(10, 0.5), 10, 2.5), (g) => g.move(3.5, 0, 2.2)),
    place(dawnGrass(11), (g) => g.scale(1.8).move(-3.8, 0, 1.6)),
  );

  // a king toppled long ago, half sunk in the field, its cross broken off beside it
  const kingGeos = pieceGeos('king', 8.5, 18);
  const king = kingGeos.slice(0, 1).map((g) => part(G.of(solid(g)).rough(0.1, 0.18, 12).rot(0, 0.35, Math.PI / 2 - 0.05).floor(-1.3).geo, 'body', paint(12, 1.4), { seed: 12 }));
  const cross = kingGeos.slice(1).map((g, k) => part(G.of(solid(g)).rough(0.04, 0.4, 13 + k).move(0, -12.6, 0).rot(Math.PI / 2, 0.9, 0).move(-15.5, 0.25, 3.5).geo, 'body', paint(13, 1.2)));
  const fallenKing = join(king, cross, place(rocks(5, 1.1, paint(14, 0.6), 14, 3), (g) => g.move(-4, 0, 3.2)), place(mound(5, 1.4, earth, 15), (g) => g.move(-11, 0, 0)));

  const h = haze('openings');
  const dark = mix(h, C(t.ground[0]), 0.35);
  const nearH = hills(10, 8, 4.5, 3);
  const near = join(horizonRing(NEAR, nearH, h, dark, mix(dark, C(t.sun), 0.45)));
  for (const a of [-0.09, 0.03, 0.14, -0.32, 0.41, 0.7, 2.5, -2.2]) {
    near.push(...onRing(statue('pawn', 9, silhouette(h, dark, 0, 9), 70 + a * 10, undefined, 0), NEAR - 2, a, nearH(a) - 2.5));
  }
  const farDark = mix(h, C(t.ground[0]), 0.16);
  const far = horizonRing(FAR, hills(13, 12, 2.5, 9), h, farDark, mix(farDark, C(t.sun), 0.6));

  return {
    big: [one(pawnWhole, 3), one(pawnChipped, 2), one(pawnSunk, 2), one(pawnFallen, 1.5)],
    small: [
      one(dawnGrass(61), 5),
      one(flowers(0.8, C('#5a5a2c'), [C(t.accent), C('#ffd28a'), C('#fff1df'), C('#e86f8a')], 6, 62), 3),
      one(rocks(3, 0.32, paint(63, 0.8), 63, 1.4), 2),
      one(smallHead, 0.6),
    ],
    landmarks: [gate, fallenKing],
    horizon: { near, far },
  };
}

// ================================================================== First Steps
// A friendly meadow: round trees, blossom, mushrooms, a windmill.

function firstSteps(): WorldModels {
  const t = WORLD_THEMES['first-steps'];
  const bark = shade(C(t.decorColor), 1.35);
  const green = C('#2f7d4a');
  const lightGreen = C('#a9e57c');
  const freshGrass = (seed: number) => grass(0.6, C('#2a5e36'), C('#9be07a'), 8, seed);
  const rockPaint = (seed: number) => stone(C('#cfc8b4'), { moss: C('#5f9a4a'), mossAmount: 1.2, height: 1.2, seed });

  const roundTree = join(trunk(2.6, 0.34, bark, 0.3, 1), place(blob(1.75, green, lightGreen, 1), (g) => g.move(0.2, 3.7, 0)), place(blob(1.1, green, lightGreen, 2), (g) => g.move(1.2, 3.0, 0.5)));
  const blossom = join(
    trunk(2.3, 0.3, bark, -0.25, 3),
    place(blob(1.5, C('#e0608f'), C('#ffb3d1'), 3), (g) => g.move(-0.3, 3.3, 0)),
    place(blob(1.0, C('#e0608f'), C('#ffb3d1'), 4), (g) => g.move(0.8, 2.9, -0.4)),
    place(blob(0.9, C('#e0608f'), C('#ffb3d1'), 5), (g) => g.move(-1.2, 2.7, 0.5)),
  );
  const poplar = join(trunk(1.4, 0.25, bark, 0, 6), place(blob(1, C('#21593a'), C('#77c46a'), 6), (g) => g.scale(0.85, 2.6, 0.85).move(0, 3.4, 0)));
  const bush = join(
    place(blob(0.9, green, lightGreen, 7, 1), (g) => g.move(0, 0.55, 0)),
    place(blob(0.7, green, lightGreen, 8, 1), (g) => g.move(0.9, 0.4, 0.3)),
    place(blob(0.6, green, lightGreen, 9, 1), (g) => g.move(-0.7, 0.35, 0.4)),
    flowers(1.3, C('#2e6b3a'), [C('#ffffff'), C('#ffe37a')], 5, 9),
  );

  const mushrooms = (() => {
    const r = rng(20);
    const out: Model = [];
    for (let k = 0; k < 3; k++) {
      const s = 0.5 + r() * 0.5;
      const x = (r() - 0.5) * 0.7;
      const z = (r() - 0.5) * 0.7;
      out.push(part(G.of(cyl(0.07 * s, 0.1 * s, 0.4 * s, 7)).move(x, 0.2 * s, z).geo, 'body', C('#f1ead8'), { smooth: true }));
      const cap = lathe([[0, 0.34], [0.3, 0.33], [0.29, 0.42], [0.2, 0.52], [0, 0.56]].map(([a, b]) => [a * s, b * s] as [number, number]), 10);
      out.push(part(G.of(cap).move(x, 0.04, z).geo, 'body', (p, n) => (fbm(p.x * 14, p.y * 14, p.z * 14, 1) > 0.25 && n.y > 0.2 ? C('#fff6ea') : C('#d8423a')), { smooth: true }));
    }
    return out;
  })();

  const signpost = join(
    [part(G.of(cyl(0.07, 0.08, 1.6, 6)).move(0, 0.8, 0).geo, 'body', bark)],
    [part(G.of(extrude([[-0.05, 0], [0.55, 0], [0.7, 0.1], [0.55, 0.2], [-0.05, 0.2]], 0.05, 0.01)).move(0, 1.3, 0).geo, 'body', C('#c79a62'))],
    [part(G.of(extrude([[0.05, 0], [-0.55, 0], [-0.7, 0.1], [-0.55, 0.2], [0.05, 0.2]], 0.05, 0.01)).rot(0, 0.6, 0).move(0, 1.0, 0).geo, 'body', C('#b8895a'))],
    freshGrass(21),
  );

  // a windmill built like a pawn, sails turned to the path
  const walls = C('#efe4cf');
  const roof = C('#b44a35');
  const mill = join(
    [part(lathe([[0, 0], [2.5, 0], [2.4, 0.6], [2.0, 1.0], [1.6, 2.4], [1.35, 4.6], [1.25, 5.0], [2.0, 5.2], [2.0, 5.5], [1.3, 5.7]], 18), 'body', (p, n, r) => (p.y < 0.9 ? shade(C('#a89f8c'), 0.8 + r * 0.25) : p.y > 5.05 ? C('#7a5236') : shade(walls, 0.85 + n.y * 0.1 + r * 0.08)), { seed: 30 })],
    [part(G.of(lathe([[1.3, 0], [1.6, 0.4], [1.75, 1.1], [1.6, 1.8], [1.1, 2.4], [0.5, 2.7], [0, 2.8]], 18)).move(0, 5.6, 0).geo, 'body', (_p, n, r) => shade(roof, 0.75 + n.y * 0.2 + r * 0.1), { seed: 31 })],
    [part(G.of(box(0.9, 1.5, 0.3)).move(0, 1.4, 2.0).geo, 'body', C('#5a3a26'))],
    place(pane(0.45, 0.6, C('#ffd98a')), (g) => g.move(0, 3.4, 1.55)),
    place(pane(0.45, 0.6, C('#ffd98a')), (g) => g.rot(0, 1.4, 0).move(1.5, 3.0, 0.2)),
  );
  const hub = new THREE.Vector3(0, 6.6, 1.9);
  mill.push(part(G.of(cyl(0.3, 0.3, 0.8, 8)).rot(Math.PI / 2, 0, 0).move(hub.x, hub.y, hub.z).geo, 'body', C('#4a3022')));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.35;
    const arm = join(
      [part(G.of(box(0.16, 4.6, 0.14)).move(0, 2.3, 0).geo, 'body', C('#6b4a30'))],
      [part(G.of(box(1.1, 3.6, 0.05, 1, 4, 1)).move(0.62, 2.7, 0.04).geo, 'body', (_p, _n, r) => shade(C('#f5efe3'), 0.85 + r * 0.15))],
    );
    mill.push(...place(arm, (g) => g.rot(0, 0, a).move(hub.x, hub.y, hub.z + 0.45)));
  }

  // a cottage with a little rook tower
  const thatch = C('#b98a4e');
  const cottage = join(
    [part(G.of(box(4.4, 2.6, 3.2, 2, 1, 2)).move(0, 1.3, 0).geo, 'body', (_p, n, r) => shade(walls, 0.82 + n.y * 0.1 + r * 0.1))],
    [part(G.of(slab([[-2.7, 0], [2.7, 0], [0, 2.3]], 3.8, 0.8, 0.08, 32, 0.06)).move(0, 2.55, 0).geo, 'body', (p, n, r) => shade(thatch, 0.7 + n.y * 0.25 + r * 0.15 + fbm(p.x * 3, p.y * 6, p.z * 3, 1) * 0.15))],
    [part(G.of(box(0.6, 1.6, 0.6)).move(1.2, 4.2, -0.6).geo, 'body', C('#9a8f80'))],
    [part(G.of(box(0.9, 1.6, 0.1)).move(-0.6, 0.8, 1.62).geo, 'body', C('#5a3a26'))],
    place(pane(0.6, 0.6, C('#ffd98a')), (g) => g.move(1.0, 1.5, 1.61)),
    place(pane(0.6, 0.6, C('#ffd98a')), (g) => g.rot(0, Math.PI / 2, 0).move(-2.21, 1.5, 0.2)),
    place(piece('rook', 4.6, 'body', stone(C('#d8d2c2'), { moss: C('#5f9a4a'), height: 4, seed: 33 }), { rough: 0.006, seed: 33, segments: 16 }), (g) => g.move(3.2, 0, -0.6)),
    place(bushes(), (g) => g.move(-2.8, 0, 1.6)),
  );
  function bushes(): Model {
    return join(blob(0.7, green, lightGreen, 34, 1), place(blob(0.5, green, lightGreen, 35, 1), (g) => g.move(0.7, -0.1, 0.3)));
  }

  const h = haze('first-steps');
  const dark = mix(h, C('#1f4a3a'), 0.32);
  const nearH = hills(9.5, 7, 4.5, 5);
  const near = join(horizonRing(NEAR, nearH, h, dark, mix(dark, C(t.sun), 0.35)));
  const r = rng(77);
  // a line of tree tops along the crests
  for (let k = 0; k < 70; k++) {
    const a = (r() - 0.5) * Math.PI * 1.6 + (r() < 0.3 ? Math.PI : 0);
    const s = 1.6 + r() * 1.4;
    const crown = [part(G.of(ico(1.6, 0)).scale(1, 1.15, 1).geo, 'body', silhouette(dark, mix(dark, C(t.sun), 0.18), -1.5, 2))];
    near.push(...onRing(crown, NEAR - 2, a, nearH(a) - 0.4 * s, s));
  }
  const farDark = mix(h, C('#1f4a3a'), 0.14);
  const far = horizonRing(FAR, hills(12, 11, 2.5, 11), h, farDark, mix(farDark, C(t.sun), 0.5));

  return {
    big: [one(roundTree, 3), one(blossom, 1.5), one(poplar, 2), one(bush, 2)],
    small: [
      one(freshGrass(40), 5),
      one(flowers(0.7, C('#2e6b3a'), [C('#ffffff'), C('#ffe37a'), C('#ff9ad0'), C('#9ad0ff')], 6, 41), 3),
      one(mushrooms, 1.2),
      one(rocks(2, 0.38, rockPaint(42), 42, 1.4), 1.5),
      one(signpost, 0.35),
    ],
    landmarks: [mill, cottage],
    horizon: { near, far },
  };
}

// ================================================================== Mate in Two
// A royal court at night: marble columns, braziers, red banners, an empty throne.

function mateInTwo(): WorldModels {
  const t = WORLD_THEMES['mate-in-2'];
  const marbleBase = C(t.decorColor);
  const vein = C('#8f7d76');
  const red = C(t.accent);
  const gold = C('#f2c27a');
  const fireDeep = C('#e8321a');
  const fireBright = C('#ffb54a');
  const marble: Painter = (p, n, r) => {
    const v = Math.abs(fbm(p.x * 0.7 + p.y * 0.35, p.y * 0.5, p.z * 0.7, 3));
    const c = shade(marbleBase, 0.7 + n.y * 0.12 + r * 0.06 + smoothstep(0, 6, p.y) * 0.18);
    return v < 0.05 ? mix(c, vein, 0.7) : c;
  };

  const column = (h: number, broken = 0, seed = 1): Model => {
    let shaft = G.of(solid(cyl(0.46, 0.52, h, 20, Math.max(2, Math.round(h * 1.5))))).move(0, h / 2 + 0.55, 0);
    shaft = shaft.warp((p) => {
      const a = Math.atan2(p.x, p.z);
      const k = 1 - 0.06 * Math.max(0, Math.cos(a * 10));
      p.x *= k;
      p.z *= k;
    });
    if (broken) {
      shaft = shaft.warp((p) => {
        const a = Math.atan2(p.x, p.z);
        const top = h + 0.55 - broken + (fbm(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3, seed, 2) * 0.5 + 0.5) * broken;
        if (p.y > top) p.y = top;
      });
    }
    const out: Model = [
      part(G.of(box(1.5, 0.3, 1.5)).move(0, 0.15, 0).geo, 'body', marble),
      part(G.of(lathe([[0.75, 0], [0.74, 0.1], [0.66, 0.16], [0.6, 0.25], [0.5, 0.26]], 20)).move(0, 0.3, 0).geo, 'body', marble, { smooth: true }),
      part(shaft.geo, 'body', marble, { smooth: true, seed }),
    ];
    if (!broken) {
      out.push(part(G.of(lathe([[0.46, 0], [0.56, 0.12], [0.68, 0.3], [0.72, 0.36]], 20)).move(0, h + 0.55, 0).geo, 'body', marble, { smooth: true }));
      out.push(part(G.of(box(1.55, 0.28, 1.55)).move(0, h + 0.55 + 0.5, 0).geo, 'body', marble));
    }
    return out;
  };

  const drum = (seed: number) => part(G.of(solid(cyl(0.5, 0.5, 0.9, 20, 1))).rough(0.03, 2, seed).rot(0, seed, Math.PI / 2).floor(0).geo, 'body', marble);
  const brokenColumn = join(column(3.2, 1.0, 3), [place([drum(4)], (g) => g.move(1.6, -0.08, 0.4))[0], place([drum(5)], (g) => g.move(2.6, -0.1, -0.8))[0]], rocks(4, 0.25, marble, 6, 3));
  const bronze = C('#6a4a32');
  const fire = brazier(bronze, gold, fireDeep, fireBright, 7);

  // a red banner with a gold crown on a crossbar
  const wave = (p: THREE.Vector3) => {
    p.z += Math.sin(p.y * 1.4 + p.x * 1.2) * 0.14;
  };
  const cloth = G.of(box(1.9, 3.4, 0.05, 10, 12, 1))
    .move(0, -1.7, 0)
    .warp((p) => {
      if (p.y < -2.6) p.y += (1 - Math.abs(p.x) / 0.95) * 0.75 * ((-2.6 - p.y) / 0.8 + 0.3);
    })
    .warp(wave)
    .move(0, 5.55, 0.3);
  const crown = G.of(extrude([[-0.45, 0], [0.45, 0], [0.5, 0.45], [0.25, 0.22], [0, 0.55], [-0.25, 0.22], [-0.5, 0.45]], 0.04, 0.01))
    .move(0, 3.95, 0.37)
    .warp((p) => {
      p.z += Math.sin(p.y * 1.4 + p.x * 1.2) * 0.14;
    });
  const banner = join(
    [part(G.of(cyl(0.07, 0.09, 6.2, 6)).move(0, 3.1, 0).geo, 'gloss', C('#3a2f33'))],
    [part(G.of(box(2.3, 0.1, 0.1)).move(0, 5.6, 0).geo, 'gloss', C('#3a2f33'))],
    [part(G.of(ico(0.14, 0)).move(0, 6.3, 0).geo, 'gloss', gold)],
    [part(cloth.geo, 'body', (p, n, r) => (Math.abs(p.x) > 0.76 || p.y > 5.27 ? shade(gold, 0.8 + r * 0.15) : shade(red, 0.55 + Math.abs(n.z) * 0.25 + r * 0.06)))],
    [part(crown.geo, 'gloss', gold)],
    [part(G.of(box(1.4, 0.4, 1.4)).move(0, 0.2, 0).geo, 'body', marble)],
  );

  const fallenCrown = join(
    [part(G.of(lathe([[0.36, 0], [0.38, 0.02], [0.38, 0.18], [0.36, 0.2], [0.33, 0.2], [0.33, 0.02]], 16)).rot(0.5, 0, 0.2).floor(0).geo, 'gloss', gold, { smooth: true })],
    place([part(G.of(ico(0.07, 0)).move(0, 0.3, 0.3).geo, 'glow', C('#ff5a6a'))], (g) => g.rot(0.5, 0, 0.2)),
    rocks(2, 0.18, marble, 50, 4),
  );
  const candles = (() => {
    const r = rng(51);
    const out: Model = [];
    for (let k = 0; k < 4; k++) {
      const hh = 0.25 + r() * 0.35;
      const x = (r() - 0.5) * 0.5;
      const z = (r() - 0.5) * 0.5;
      out.push(part(G.of(cyl(0.05, 0.055, hh, 7)).move(x, hh / 2, z).geo, 'body', C('#efe0c8'), { smooth: true }));
      out.push(part(G.of(cone(0.035, 0.12, 5)).move(x, hh + 0.08, z).geo, 'glow', C('#ffb347'), { smooth: true }));
    }
    return out;
  })();

  // the empty throne on its dais, where the king is mated
  const step = (w: number, d: number, y: number, seed: number) => part(G.of(solid(box(w, 0.6, d, 3, 1, 3))).rough(0.03, 1, seed).move(0, y + 0.3, 0).geo, 'body', marble);
  const backOutline: [number, number][] = [[-1.4, 0], [1.4, 0], [1.4, 4.6], [0.8, 5.6], [0, 6.4], [-0.8, 5.6], [-1.4, 4.6]];
  const throne = join(
    [step(10, 7.6, 0, 60), step(8.2, 6.2, 0.6, 61), step(6.4, 4.8, 1.2, 62)],
    [[2.9, 1.82, 0.95], [0.7, 1.22, 2.75], [0.7, 0.62, 3.45], [2.4, 0.03, 5.0]].map(([d, y, z]) => part(G.of(box(1.6, 0.05, d)).move(0, y, z).geo, 'body', shade(red, 0.7))),
    [part(G.of(box(2.8, 1.2, 2.4)).move(0, 2.4, -0.5).geo, 'gloss', gold)],
    [part(G.of(box(2.5, 0.25, 2.1)).move(0, 3.1, -0.4).geo, 'body', shade(red, 0.8))],
    [part(G.of(extrude(backOutline, 0.5, 0.06)).move(0, 1.8, -1.6).geo, 'gloss', gold)],
    [part(G.of(extrude(backOutline.map(([x, y]) => [x * 0.8, y * 0.86 + 0.25] as [number, number]), 0.1, 0.02)).move(0, 1.8, -1.3).geo, 'body', shade(red, 0.75))],
    [part(G.of(box(0.4, 1.0, 2.2)).move(-1.5, 3.3, -0.5).geo, 'gloss', gold), part(G.of(box(0.4, 1.0, 2.2)).move(1.5, 3.3, -0.5).geo, 'gloss', gold)],
    [part(G.of(box(0.22, 1.0, 0.22)).move(0, 8.65, -1.6).geo, 'gloss', gold), part(G.of(box(0.7, 0.22, 0.22)).move(0, 8.8, -1.6).geo, 'gloss', gold)],
    place(brazier(bronze, gold, fireDeep, fireBright, 63), (g) => g.scale(1.2).move(-3.6, 1.8, 1.2)),
    place(brazier(bronze, gold, fireDeep, fireBright, 64), (g) => g.scale(1.2).move(3.6, 1.8, 1.2)),
  );

  // a colonnade, one column fallen and the roof broken above it
  const colonnade: Model = [];
  for (let k = 0; k < 5; k++) colonnade.push(...place(k === 3 ? column(2.4, 0.9, 70 + k) : column(7, 0, 70 + k), (g) => g.move(-6 + k * 3, 0, 0)));
  colonnade.push(part(G.of(solid(box(8.6, 1.0, 1.9, 4, 1, 1))).rough(0.04, 1, 75).move(-3.6, 8.4, 0).geo, 'body', marble));
  colonnade.push(part(G.of(solid(box(2.2, 1.0, 1.9, 1, 1, 1))).rough(0.04, 1, 76).move(6.4, 8.4, 0).geo, 'body', marble));
  colonnade.push(part(G.of(slab([[-7.9, 0], [-0.4, 0], [-3.2, 2.1]], 1.7, 0.7, 0.04, 77, 0.05)).move(0, 8.9, 0).geo, 'body', marble));
  colonnade.push(part(G.of(solid(box(3, 1, 1.9))).rot(0.2, 0.5, 0.35).move(3.6, 0.4, 2.2).geo, 'body', marble));
  colonnade.push(...place(rocks(4, 0.45, marble, 78, 2.2), (g) => g.move(3.2, 0, 0.8)));
  colonnade.push(...place([drum(79)], (g) => g.move(1.5, 0, 2.2)));

  // the palace on the horizon: walls and towers with lit windows
  const h = haze('mate-in-2');
  const dark = mix(h, C('#12040a'), 0.4);
  const towers = [-0.62, -0.35, -0.05, 0.22, 0.5, 0.85, 1.6, 2.6, -1.4, -2.4];
  const wallH = (a: number) => {
    let y = 12 + (Math.sin(a * 260) > 0.2 ? 0.9 : 0);
    for (const c of towers) if (Math.abs(a - c) < 0.022) y = 19 + (towers.indexOf(c) % 3) * 2.5;
    return y;
  };
  const near = join(horizonRing(NEAR, wallH, h, dark, mix(dark, red, 0.35), 900));
  const lit = C('#ffb36b');
  const r = rng(80);
  for (const c of towers) {
    const top = wallH(c);
    near.push(...onRing([part(cone(3.6, 6 + r() * 3, 8), 'body', silhouette(dark, mix(dark, red, 0.25), 0, 6))], NEAR, c, top + 3));
    for (let k = 0; k < 3; k++) near.push(...onRing(pane(0.9, 1.4, lit), NEAR - 1, c + (r() - 0.5) * 0.03, 8 + r() * (top - 9)));
  }
  for (let k = 0; k < 30; k++) {
    const a = (r() - 0.5) * Math.PI * 2;
    near.push(...onRing(pane(0.7, 1.0, lit), NEAR - 1, a, 6 + r() * 4));
  }
  const farDark = mix(h, C('#12040a'), 0.2);
  const far = horizonRing(FAR, hills(13, 10, 3, 13), h, farDark, mix(farDark, red, 0.5));

  return {
    big: [one(column(6, 0, 1), 3), one(brokenColumn, 2), one(fire, 1.4), one(banner, 1.4)],
    small: [one(rocks(4, 0.22, marble, 52, 2), 3), one(candles, 2), one(fallenCrown, 0.8)],
    landmarks: [throne, colonnade],
    horizon: { near, far },
  };
}

// ================================================================== Forks
// A golden canyon where the rock forks in two, and a cliff in the shape of the knight.

function forks(): WorldModels {
  const t = WORLD_THEMES.forks;
  const bands = ['#b8703c', '#d49a5a', '#a35a33', '#e2b77c', '#c27f48'].map(C);
  const rock = (seed: number, band = 0.55) => strata(bands, band, seed);
  const capRock = C('#6f4a2e');

  const column = (rTop: number, rBottom: number, h: number, seed: number) => G.of(solid(cyl(rTop, rBottom, h, 7, Math.max(2, Math.round(h * 1.4))))).move(0, h / 2, 0).rough(rBottom * 0.22, 0.9, seed);
  const hoodoo = join(
    [part(column(1.0, 1.4, 2.2, 1).geo, 'body', rock(1))],
    [part(column(0.6, 0.95, 2.6, 2).move(0, 2.1, 0).geo, 'body', rock(2))],
    [part(column(0.45, 0.6, 0.8, 3).move(0, 4.6, 0).geo, 'body', rock(3))],
    [part(G.of(solid(ico(1.15, 1))).rough(0.25, 0.9, 4).scale(1, 0.42, 1).move(0.1, 5.6, 0).geo, 'body', (_p, n, r) => shade(capRock, 0.75 + n.y * 0.3 + r * 0.1))],
  );
  const prong = (lean: number, seed: number) => column(0.22, 0.75, 5.6, seed).lean(lean, lean * 0.15, 1.8).move(lean * 0.12, 0.6, 0);
  const forked = join(
    [part(G.of(solid(ico(1.6, 1))).rough(0.35, 0.7, 5).scale(1.2, 0.6, 1).move(0, 0.4, 0).geo, 'body', rock(5))],
    [part(prong(-1.9, 6).geo, 'body', rock(6))],
    [part(prong(1.7, 7).geo, 'body', rock(7))],
  );
  const butte = join(
    [part(column(2.0, 2.7, 3.6, 8).warp((p) => (p.y = Math.min(p.y, 3.4))).geo, 'body', rock(8, 0.45))],
    rocks(3, 0.6, rock(9), 9, 3.5),
  );
  const tree = deadTree(5, C('#8c7a66'), 10);

  const shrubPaint = (seed: number) => blob(0.45, C('#5f6a30'), C('#a8a35a'), seed, 0);
  const shrub = join(shrubPaint(20), place(shrubPaint(21), (g) => g.move(0.45, -0.1, 0.25)), place(shrubPaint(22), (g) => g.move(-0.35, -0.12, 0.3)));
  const cactusGreen = C('#5f7f3d');
  const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 2, 7);
  const cactusPaint: Painter = (_p, n, r) => shade(cactusGreen, 0.72 + n.y * 0.15 + r * 0.15);
  const cactus = join(
    [part(G.of(cap(0.22, 1.7)).move(0, 1.05, 0).geo, 'body', cactusPaint)],
    [part(G.of(cap(0.13, 0.45)).rot(0, 0, Math.PI / 2).move(0.35, 1.0, 0).geo, 'body', cactusPaint), part(G.of(cap(0.13, 0.6)).move(0.58, 1.35, 0).geo, 'body', cactusPaint)],
    [part(G.of(cap(0.12, 0.35)).rot(0, 0, Math.PI / 2).move(-0.32, 1.4, 0).geo, 'body', cactusPaint), part(G.of(cap(0.12, 0.45)).move(-0.5, 1.65, 0).geo, 'body', cactusPaint)],
  );

  // the knight: a cliff worn into the shape of its head
  const head = G.of(refine(solid(knightHead(1)), 0.11)).scale(10, 10, 4.5).rough(0.25, 0.22, 30).move(0, 2.2, 0);
  const knight = join(
    [part(head.geo, 'body', strata(bands, 1.3, 30, 0.3))],
    [part(column(6.5, 7.8, 3, 31).geo, 'body', rock(31, 0.9))],
    place(rocks(5, 1.4, rock(32), 32, 3), (g) => g.move(6, 0, 4)),
  );

  // a natural rock arch
  const archOutline = curve(
    [[-8, 0], [-4.2, 0], [-4.4, 3.5], [-3, 6], [0, 7], [3, 6.1], [4.3, 3.6], [4.2, 0], [8, 0], [7.6, 4.5], [5, 8.6], [0, 10.2], [-5, 8.8], [-7.5, 5]],
    80,
  );
  const arch = join([part(slab(archOutline, 4, 0.9, 0.5, 33), 'body', strata(bands, 1.1, 33, 0.3))], place(rocks(4, 1.0, rock(34), 34, 3), (g) => g.move(-6, 0, 3)));

  const h = haze('forks');
  const dark = mix(h, C('#5a2a12'), 0.32);
  const near = horizonRing(NEAR, mesas(9, 13, 4, 7), h, dark, mix(dark, C(t.sun), 0.4), 720);
  const farDark = mix(h, C('#5a2a12'), 0.15);
  const far = horizonRing(FAR, mesas(12, 15, 2.5, 17), h, farDark, mix(farDark, C(t.sun), 0.5), 720);

  return {
    big: [one(hoodoo, 3), one(forked, 2.4), one(butte, 1.6), one(tree, 1.2)],
    small: [one(shrub, 4), one(cactus, 1.6), one(rocks(3, 0.35, rock(40), 40, 1.6), 2.5)],
    landmarks: [knight, arch],
    // the knight's head looks along +x (World turns that side towards the path)
    facing: ['x', 'z'],
    horizon: { near, far },
  };
}

// ================================================================== Pins & Skewers
// A glacier: crystals, ice spears in the snow, pieces pinned in blocks of ice.

function pins(): WorldModels {
  const deep = C('#2f6fc0');
  const tip = C('#e6f6ff');
  const snowC = C('#f4f8ff');
  const snowShadow = C('#a9bfe6');
  const snow: Painter = (_p, n, r) => shade(mix(snowShadow, snowC, 0.45 + n.y * 0.55), 0.94 + r * 0.08);
  const ice = (h: number): Painter => (p, n, r) => shade(mix(deep, tip, smoothstep(0, h, p.y) * 0.8 + n.y * 0.2), 0.9 + r * 0.15);

  const cluster = join(mound(1.7, 0.65, snow, 1), crystals(6, 4.4, ice(4.4), 'ice', 1));
  const spears = join(mound(1.9, 0.75, snow, 2), (() => {
    const r = rng(3);
    const out: Model = [];
    for (let k = 0; k < 4; k++) {
      const hh = 4 + r() * 2.5;
      const g = G.of(solid(cone(0.2 + r() * 0.08, hh, 5, 3))).move(0, hh / 2 - 0.4, 0).rot(0.35 + r() * 0.35, k * 1.7 + r(), 0).move((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2);
      out.push(part(g.geo, 'ice', ice(hh), { seed: k }));
    }
    return out;
  })());
  const serac = join(
    [part(G.of(solid(box(2.3, 4.6, 1.9, 3, 5, 3))).rough(0.4, 0.5, 4).move(0, 2.1, 0).rot(0.05, 0.3, 0.08).geo, 'gloss', stone(C('#9cc4ec'), { snow: snowC, height: 4.5, seed: 4, grain: 0.1 }))],
    mound(1.8, 0.5, snow, 5),
  );
  const pine = fir(5.6, C('#24474a'), C('#3a2f2a'), snowC, 6);

  const shards = join(mound(0.7, 0.25, snow, 20), crystals(3, 1.1, ice(1.1), 'ice', 20));
  const chunks = rocks(3, 0.35, (_p, n, r) => shade(mix(C('#7fb2e6'), tip, 0.4 + n.y * 0.4), 0.9 + r * 0.15), 21, 1.5).map((pt) => ({ ...pt, mat: 'gloss' as const }));

  // pieces frozen in blocks of ice; a giant spear skewers two of them
  const iceBlock = (w: number, h: number, d: number, seed: number) => part(G.of(solid(box(w, h, d, 4, 5, 3))).rough(Math.min(w, h) * 0.07, 0.35, seed).move(0, h / 2, 0).geo, 'ice', ice(h), { seed });
  const frozenPaint = (seed: number) => stone(C('#2a3550'), { height: 6, seed, grain: 0.1 });
  const frozenKing = join(
    place(piece('king', 5.2, 'gloss', frozenPaint(30), { smooth: true, segments: 20 }), (g) => g.rot(0, 0, 0.12).move(0, 0.8, 0)),
    [iceBlock(7, 10.5, 6, 31)],
    place(mound(2.6, 1, snow, 32), (g) => g.scale(1.6, 1.2, 1.4).move(0, 10.2, 0)),
    mound(6.5, 1.8, snow, 33),
    place(crystals(4, 3.5, ice(3.5), 'ice', 34), (g) => g.move(4.8, 0, 2.5)),
  );
  const spearDir = new THREE.Vector3(0.55, 1, 0.15).normalize();
  const along = (d: number) => spearDir.clone().multiplyScalar(d);
  const blockAt = (d: number, kind: PieceKind, seed: number) => {
    const at = along(d);
    return join(
      place([iceBlock(4.2, 4.2, 4.2, seed)], (g) => g.move(0, -2.1, 0).rot(0.2, seed, 0.1).move(at.x, at.y, at.z)),
      place(piece(kind, 2.6, 'gloss', frozenPaint(seed), { smooth: true }), (g) => g.move(0, -1.6, 0).rot(0.2, 0.4, -0.3).move(at.x, at.y, at.z)),
    );
  };
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spearDir);
  const shaft = G.of(cyl(0.32, 0.38, 24, 8)).move(0, 12, 0);
  shaft.geo.applyQuaternion(q);
  const head = G.of(crystalGeo(3.4, 0.75)).move(0, 23.5, 0);
  head.geo.applyQuaternion(q);
  const skewer = join(
    [part(shaft.move(0, -2, 0).geo, 'gloss', C('#3b4458'), { smooth: true })],
    [part(head.move(0, -2, 0).geo, 'glow', C('#3fa8f0'))],
    blockAt(8, 'queen', 40),
    blockAt(15, 'rook', 41),
    mound(4.5, 2.2, snow, 42),
    place(crystals(5, 3, ice(3), 'ice', 43), (g) => g.move(-3.2, 0, 1.8)),
  );

  const h = haze('pins');
  const dark = mix(h, C('#1e3566'), 0.32);
  const near = horizonRing(NEAR, peaks(7, 17, 6, 3), h, dark, mix(dark, C('#ffffff'), 0.65), 720);
  const farDark = mix(h, C('#1e3566'), 0.15);
  const far = horizonRing(FAR, peaks(11, 22, 3.5, 23), h, farDark, mix(farDark, C('#ffffff'), 0.7), 720);

  return {
    big: [one(cluster, 3), one(spears, 2), one(serac, 1.6), one(pine, 2.4)],
    small: [one(mound(0.6, 0.3, snow, 50), 3), one(shards, 3), one(chunks, 1.5)],
    landmarks: [frozenKing, skewer],
    horizon: { near, far },
  };
}

// ================================================================== Sacrifices
// A volcanic altar: obsidian, basalt, lava pools, a queen laid on the altar.

function sacrifices(): WorldModels {
  const t = WORLD_THEMES.sacrifices;
  const obsidian = C('#3a2850');
  const sheen = C('#8a62b8');
  const basalt = C('#4a3f50');
  const lavaDeep = C('#b8240f');
  const lavaBright = C('#ffb03a');
  const ember = C(t.accent);
  const temple = C('#4a3552');
  const glass: Painter = (_p, n, r) => shade(mix(obsidian, sheen, smoothstep(0.3, 1, n.y) * 0.6 + r * 0.15), 0.9 + r * 0.2);
  const lit = (base: THREE.Color): Painter => (p, n, r) => {
    const c = shade(base, 0.7 + n.y * 0.25 + r * 0.15);
    return mix(c, ember, smoothstep(0.2, -0.6, n.y) * 0.45 + smoothstep(0.6, 0, p.y) * 0.15);
  };

  const shardCluster = join(
    crystals(5, 4.8, glass, 'gloss', 1, 0.7),
    (() => {
      const r = rng(2);
      const out: Model = [];
      for (let k = 0; k < 5; k++) out.push(part(G.of(ico(0.12 + r() * 0.1, 0)).move((r() - 0.5) * 2.4, 0.05, (r() - 0.5) * 2.4).geo, 'glow', mix(ember, lavaBright, r() * 0.5)));
      return out;
    })(),
  );
  const columns = (() => {
    const r = rng(3);
    const out: Model = [];
    const spots = [[0, 0], [1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87], [1.5, 0.87], [-1.5, -0.87]];
    spots.forEach(([x, z], k) => {
      const hh = 1.2 + r() * 3.2 * (k === 0 ? 1.2 : 1);
      const g = G.of(cyl(0.52, 0.55, hh, 6, 2)).move(0, hh / 2 - 0.2, 0).rot(r() * 0.08, Math.PI / 6, r() * 0.08).move(x * 1.0, 0, z * 1.0);
      out.push(part(g.geo, 'body', (p, n, rr) => mix(shade(n.y > 0.8 ? shade(basalt, 1.6) : basalt, 0.7 + rr * 0.3 + p.y * 0.05), ember, smoothstep(0.8, 0, p.y) * 0.25)));
    });
    out.push(part(G.of(box(0.12, 0.08, 2.4)).rot(0, 0.5, 0).move(0.3, 0.02, 0.2).geo, 'glow', lavaBright));
    return out;
  })();
  const pool = (radius: number, seed: number): Model => {
    const r = rng(seed);
    const out: Model = [];
    const n = Math.round(radius * 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.3;
      const s = radius * (0.26 + r() * 0.16);
      out.push(part(G.of(solid(ico(s, 0))).rough(s * 0.3, 1.5 / s, seed + k).scale(1, 0.6, 1).move(Math.cos(a) * radius, s * 0.2, Math.sin(a) * radius).geo, 'body', lit(basalt), { seed: seed + k }));
    }
    const disc = G.of(new THREE.CircleGeometry(radius * 1.02, 20, 0, Math.PI * 2)).rot(-Math.PI / 2, 0, 0).move(0, 0.12, 0);
    out.push(part(disc.geo, 'glow', (p) => mix(lavaBright, lavaDeep, smoothstep(0, radius, Math.hypot(p.x, p.z)) + fbm(p.x * 1.5, 0, p.z * 1.5, 2) * 0.4), { smooth: true }));
    return out;
  };
  const pillar = join(
    [part(G.of(solid(box(1.2, 4.6, 1.2, 1, 6, 1))).warp((p) => {
      const top = 3.4 + fbm(p.x * 1.5 + 3, 0, p.z * 1.5, 2) * 1.4;
      if (p.y > top - 2.3) p.y = Math.min(p.y, top - 2.3);
    }).rough(0.06, 1, 5).move(0, 2.3, 0).geo, 'body', lit(temple))],
    [0.9, 1.6, 2.3].flatMap((y) => place(pane(0.3, 0.42, ember), (g) => g.move(0, y, 0.62))),
    rocks(4, 0.35, lit(temple), 6, 2.4),
  );

  const vent = join(pool(0.45, 20));
  const smallShards = crystals(3, 1.2, glass, 'gloss', 21, 0.8);

  // the altar: three tiers, glowing runes, braziers, and a queen laid on the top stone
  const tier = (w: number, y: number, seed: number) => part(G.of(solid(box(w, 1.4, w, 3, 1, 3))).rough(0.06, 0.8, seed).move(0, y + 0.7, 0).geo, 'body', lit(temple));
  const runes = (w: number, y: number): Model => {
    const out: Model = [];
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) out.push(...place(pane(w * 0.7, 0.12, ember), (g) => g.move(0, y + 0.7, w / 2 + 0.03).rot(0, a, 0)));
    return out;
  };
  const altar = join(
    [tier(10, 0, 30), tier(7.4, 1.4, 31), tier(5, 2.8, 32)],
    runes(10, 0),
    runes(7.4, 1.4),
    runes(5, 2.8),
    [part(G.of(solid(box(3.8, 0.7, 2, 2, 1, 1))).rough(0.03, 1, 33).move(0, 4.55, 0).geo, 'gloss', glass)],
    place(piece('queen', 2.3, 'gloss', (_p, n, r) => shade(C('#efe6f2'), 0.75 + n.y * 0.2 + r * 0.05), { smooth: true, segments: 20 }), (g) => g.rot(0, 0, Math.PI / 2).move(1.5, 4.9 + 0.5, 0)),
    ...[[-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, z], k) => place(brazier(C('#2a1c2c'), ember, lavaDeep, lavaBright, 34 + k), (g) => g.scale(0.7).move(x, 4.2, z))),
  );

  // a gate of two obsidian monoliths with a ring of fire between them
  const monolith = (x: number, seed: number) => part(G.of(solid(box(1.8, 11, 1.4, 1, 6, 1))).warp((p) => {
    const k = 1 - (p.y + 5.5) / 11 * 0.35;
    p.x *= k;
    p.z *= k;
    if (p.y > 5.4) p.y += Math.abs(p.x) < 0.1 ? 0.8 : 0;
  }).rough(0.08, 0.8, seed).move(x, 5.5, 0).geo, 'gloss', glass, { seed });
  const ring = G.of(new THREE.TorusGeometry(3, 0.28, 6, 28)).move(0, 6.5, 0);
  const gate = join(
    [monolith(-4.4, 40), monolith(4.4, 41)],
    [part(ring.geo, 'glow', (p) => mix(lavaDeep, lavaBright, 0.5 + 0.5 * Math.sin(Math.atan2(p.y - 6.5, p.x) * 3)), { smooth: true })],
    [part(G.of(solid(box(12, 0.8, 4, 4, 1, 2))).rough(0.1, 0.8, 42).move(0, 0.2, 0).geo, 'body', lit(temple))],
    place(pool(1.8, 43), (g) => g.move(0, 0.55, 3.2)),
  );

  // volcanoes on the horizon, glowing
  const h = haze('sacrifices');
  const dark = mix(h, C('#0a0410'), 0.26);
  const volcanoes = [
    { a: 0.06, h: 21, w: 0.09 },
    { a: -0.5, h: 24, w: 0.25 },
    { a: 0.6, h: 22, w: 0.25 },
    { a: 2.4, h: 26, w: 0.3 },
  ];
  const base = peaks(7, 10, 6, 33);
  const nearH = (a: number) => {
    let y = base(a);
    for (const v of volcanoes) {
      const d = Math.abs(Math.atan2(Math.sin(a - v.a), Math.cos(a - v.a))) / v.w;
      if (d < 1) y = Math.max(y, v.h * (1 - d) ** 1.4 - (d < 0.08 ? 2.5 : 0));
    }
    return y;
  };
  const near = join(horizonRing(NEAR, nearH, h, dark, mix(dark, ember, 0.3), 900));
  for (const v of volcanoes) {
    near.push(...onRing([part(G.of(new THREE.TorusGeometry(2.4, 0.5, 4, 16)).rot(Math.PI / 2, 0, 0).geo, 'glow', lavaBright)], NEAR - 1, v.a, v.h - 2.7));
    const r = rng(Math.round(v.a * 100));
    for (let k = 0; k < 3; k++) {
      const len = 5 + r() * 6;
      const side = (r() - 0.5) * 0.5;
      near.push(...onRing([part(G.of(box(0.6, len, 0.2)).move(0, -len / 2, 0).rot(0, 0, side).geo, 'glow', mix(lavaDeep, ember, r()))], NEAR - 1.5, v.a + side * 0.02, v.h - 3));
    }
  }
  const farDark = mix(h, C('#0a0410'), 0.2);
  const far = horizonRing(FAR, peaks(12, 18, 3.5, 43), h, farDark, mix(farDark, ember, 0.35), 720);

  return {
    big: [one(shardCluster, 3), one(columns, 2.2), one(pool(2.1, 7), 1.3, true), one(pillar, 1.4)],
    small: [one(vent, 1.6, true), one(smallShards, 3), one(rocks(3, 0.3, lit(basalt), 22, 1.6), 3)],
    landmarks: [altar, gate],
    horizon: { near, far },
  };
}

// ================================================================== Endgames
// A misty valley of old rook towers, standing stones and a lone king's statue.

function endgames(): WorldModels {
  const t = WORLD_THEMES.endgames;
  const grey = C(t.decorColor);
  const moss = C('#3f6b4a');
  const warm = C('#ffcf7a');
  const rune = C(t.accent);
  const paint = (seed: number, mossAmount = 1) => stone(grey, { moss, mossAmount, height: 6, seed });
  const darkGrass = (seed: number) => grass(0.7, C('#1d3a2a'), C('#6aa874'), 8, seed);

  const rookTower = join(tower(7.2, 1.5, paint(1), { windows: warm, seed: 1 }), place(rocks(3, 0.4, paint(2), 2, 4), (g) => g.move(0.5, 0, 0.5)));
  const brokenTower = join(tower(6.2, 1.6, paint(3, 1.4), { broken: 2.6, seed: 3 }), rocks(5, 0.5, paint(4), 4, 3.4));
  const menhirs = (() => {
    const r = rng(5);
    const out: Model = [];
    for (let k = 0; k < 3; k++) {
      const hh = 2.6 + r() * 1.8;
      const a = (k / 3) * Math.PI * 2 + r();
      const g = G.of(solid(box(0.95, hh, 0.6, 1, 4, 1))).warp((p) => {
        const s = 1 - (p.y / hh + 0.5) * 0.3;
        p.x *= s;
      }).rough(0.12, 1.2, 5 + k).move(0, hh / 2 - 0.2, 0).rot((r() - 0.5) * 0.15, r() * 3, (r() - 0.5) * 0.15).move(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
      out.push(part(g.geo, 'body', paint(5 + k, 1.4)));
      if (k === 0) out.push(...place(pane(0.08, 0.9, rune), (g) => g.move(0, hh * 0.5, 0.31).rot(0, 0, 0).move(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3)));
    }
    return out;
  })();
  const tree = deadTree(5.5, C('#3b3a33'), 6, 3);

  const lantern = join(
    [part(G.of(cyl(0.06, 0.08, 1.7, 6)).move(0, 0.85, 0).geo, 'body', C('#3a3128'))],
    [part(G.of(box(0.5, 0.06, 0.06)).move(0.22, 1.62, 0).geo, 'body', C('#3a3128'))],
    [part(G.of(box(0.22, 0.3, 0.22)).move(0.42, 1.4, 0).geo, 'glow', warm)],
    [part(G.of(cone(0.18, 0.14, 4)).rot(0, Math.PI / 4, 0).move(0.42, 1.62, 0).geo, 'body', C('#2a241d'))],
    darkGrass(20),
  );
  const grave = join(
    [part(G.of(slab([[-0.35, 0], [0.35, 0], [0.35, 0.65], [0.25, 0.85], [0, 0.92], [-0.25, 0.85], [-0.35, 0.65]], 0.16, 0.3, 0.02, 21, 0.02)).rot(0.15, 0.3, 0.1).move(0, -0.05, 0).geo, 'body', paint(21, 1.6))],
    darkGrass(22),
  );

  // the last piece standing: a king's statue, moss-grown
  const statueKing = join(
    [part(G.of(solid(box(5.2, 1.2, 5.2, 3, 1, 3))).rough(0.08, 0.6, 30).move(0, 0.5, 0).geo, 'body', paint(30, 1.3))],
    [part(G.of(solid(box(4, 1, 4, 2, 1, 2))).rough(0.06, 0.6, 31).move(0, 1.6, 0).geo, 'body', paint(31, 1.3))],
    place(statue('king', 8, paint(32, 1.1), 32), (g) => g.move(0, 2.05, 0)),
    place(rocks(4, 0.7, paint(33), 33, 3), (g) => g.move(2, 0, 3)),
    place(darkGrass(34), (g) => g.scale(2).move(-2.6, 0, 2.6)),
  );
  function statue(kind: PieceKind, size: number, p: Painter, seed: number): Model {
    return pieceGeos(kind, size, 16).map((g, k) => part(G.of(solid(g)).rough(0.012 * size, 1.4 / size, seed + k).geo, 'body', p, { seed: seed + k }));
  }

  // a ruined wall with an archway, a lantern hanging in it
  const wallOutline = gateOutline(14, 8.5, 4.2, 6.2);
  const wall = G.of(refine(solid(extrude(wallOutline, 1.6, 0.08, [], 4)), 0.9)).warp((p) => {
    const top = 8.5 - (fbm(p.x * 0.25 + 4, 0, 0, 2) * 0.5 + 0.5) * 3.2 * smoothstep(1, 6, Math.abs(p.x - 1));
    if (p.y > top) p.y = top;
  }).rough(0.12, 0.35, 40);
  const ruin = join(
    [part(wall.geo, 'body', paint(40, 1.5))],
    place([part(G.of(cyl(0.02, 0.02, 1.2, 3)).geo, 'body', C('#2a241d')), part(G.of(box(0.55, 0.75, 0.55)).move(0, -0.9, 0).geo, 'glow', warm)], (g) => g.move(0, 5.9, 0)),
    place(rocks(6, 0.8, paint(42), 42, 3), (g) => g.move(4.5, 0, 1.6)),
  );

  // ramparts and towers in the mist
  const h = haze('endgames');
  const dark = mix(h, C('#07150f'), 0.32);
  const nearH = hills(9, 7, 4.5, 9);
  const near = join(horizonRing(NEAR, nearH, h, dark, mix(dark, C(t.sun), 0.25)));
  const r = rng(90);
  const ahead = [-0.07, 0.05, 0.16];
  for (let k = 0; k < 12; k++) {
    const a = k < ahead.length ? ahead[k] : (r() - 0.5) * Math.PI * 1.5 + (k > 9 ? Math.PI : 0);
    const th = 8 + r() * 7;
    const sil = silhouette(dark, mix(dark, C(t.sun), 0.15), 0, th);
    const tw = join([part(G.of(cyl(1.5, 1.7, th, 8)).move(0, th / 2, 0).geo, 'body', sil)], ...[0, 1, 2, 3, 4].map((m) => [part(G.of(box(0.8, 0.9, 0.8)).move(Math.sin(m * 1.26) * 1.5, th + 0.45, Math.cos(m * 1.26) * 1.5).geo, 'body', sil)]));
    if (r() < 0.7) tw.push(...place(pane(0.4, 0.7, warm), (g) => g.move(0, th * 0.7, 1.6)));
    near.push(...onRing(tw, NEAR - 3, a, nearH(a) - 2));
  }
  const farDark = mix(h, C('#07150f'), 0.15);
  const far = horizonRing(FAR, hills(12, 11, 2.5, 19), h, farDark, mix(farDark, C(t.sun), 0.35));

  return {
    big: [one(rookTower, 2.4), one(brokenTower, 2.2), one(menhirs, 1.6), one(tree, 1.4)],
    small: [one(darkGrass(50), 5), one(lantern, 0.6), one(grave, 1.2), one(rocks(3, 0.3, paint(51), 51, 1.6), 2)],
    landmarks: [statueKing, ruin],
    horizon: { near, far },
  };
}

export const WORLDS: Record<string, () => WorldModels> = {
  openings,
  'first-steps': firstSteps,
  'mate-in-2': mateInTwo,
  forks,
  pins,
  sacrifices,
  endgames,
};
