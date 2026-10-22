// What every puzzle module's world is made of (docs/PLATFORM.md §4.2, the map): the user's
// models (their PBR pack, kept in the R2 originals bucket under map/, one folder per module)
// and the horizon, made here from code in the module's theme colours.
//
//   big        stands along the path, many copies (<module>/along-path/<name>.glb)
//   small      small things on the ground near the path (<module>/ground/<name>.glb)
//   landmarks  large one-off pieces on terraces beside the path (<module>/landmarks/<name>.glb)
import * as THREE from 'three';
import { WORLD_THEMES } from '../../../src/features/puzzles/map/themes.ts';
import {
  C,
  FAR,
  NEAR,
  haze,
  hills,
  horizonRing,
  mesas,
  mix,
  move,
  onRing,
  pane,
  part,
  pawn,
  peaks,
  rng,
  silhouette,
  type Model,
} from './horizon.ts';

export interface MapObject {
  /** the file's name in its folder, without .glb */
  name: string;
  /** how often it appears compared with the others of its kind */
  weight?: number;
  /** only on the flat ground by the path (pools) */
  flat?: boolean;
  /** which way a landmark's front looks: +z (default) or +x (a profile, like the knight's head) */
  facing?: 'x' | 'z';
}

export interface WorldRecipe {
  big: MapObject[];
  small: MapObject[];
  landmarks: MapObject[];
  horizon: () => { near: Model; far: Model };
}

const objects = (list: [string, number, boolean?][]): MapObject[] => list.map(([name, weight, flat]) => ({ name, weight, flat }));

// ================================================================== Openings
// Dawn over a field of giant stone pawns, the gate where every game begins.

function openingsHorizon() {
  const t = WORLD_THEMES.openings;
  const h = haze('openings');
  const dark = mix(h, C(t.ground[0]), 0.35);
  const nearH = hills(10, 8, 4.5, 3);
  const near = horizonRing(NEAR, nearH, h, dark, mix(dark, C(t.sun), 0.45));
  for (const a of [-0.09, 0.03, 0.14, -0.32, 0.41, 0.7, 2.5, -2.2]) near.push(...onRing([part(pawn(9), 'body', silhouette(h, dark, 0, 9))], NEAR - 2, a, nearH(a) - 2.5));
  const farDark = mix(h, C(t.ground[0]), 0.16);
  const far = horizonRing(FAR, hills(13, 12, 2.5, 9), h, farDark, mix(farDark, C(t.sun), 0.6));
  return { near, far };
}

// ================================================================== First Steps
// A friendly meadow: round trees, blossom, mushrooms, a windmill.

function firstStepsHorizon() {
  const t = WORLD_THEMES['first-steps'];
  const h = haze('first-steps');
  const dark = mix(h, C('#1f4a3a'), 0.32);
  const nearH = hills(9.5, 7, 4.5, 5);
  const near = horizonRing(NEAR, nearH, h, dark, mix(dark, C(t.sun), 0.35));
  const r = rng(77);
  // a line of tree tops along the crests
  for (let k = 0; k < 70; k++) {
    const a = (r() - 0.5) * Math.PI * 1.6 + (r() < 0.3 ? Math.PI : 0);
    const s = 1.6 + r() * 1.4;
    const crown = [part(new THREE.IcosahedronGeometry(1.6, 0).scale(1, 1.15, 1), 'body', silhouette(dark, mix(dark, C(t.sun), 0.18), -1.5, 2))];
    near.push(...onRing(crown, NEAR - 2, a, nearH(a) - 0.4 * s, s));
  }
  const farDark = mix(h, C('#1f4a3a'), 0.14);
  const far = horizonRing(FAR, hills(12, 11, 2.5, 11), h, farDark, mix(farDark, C(t.sun), 0.5));
  return { near, far };
}

// ================================================================== Mate in Two
// A royal court at night: the palace on the horizon, its windows lit.

function mateInTwoHorizon() {
  const red = C(WORLD_THEMES['mate-in-2'].accent);
  const h = haze('mate-in-2');
  const dark = mix(h, C('#12040a'), 0.4);
  const towers = [-0.62, -0.35, -0.05, 0.22, 0.5, 0.85, 1.6, 2.6, -1.4, -2.4];
  const wallH = (a: number) => {
    let y = 12 + (Math.sin(a * 260) > 0.2 ? 0.9 : 0);
    for (const c of towers) if (Math.abs(a - c) < 0.022) y = 19 + (towers.indexOf(c) % 3) * 2.5;
    return y;
  };
  const near = horizonRing(NEAR, wallH, h, dark, mix(dark, red, 0.35), 900);
  const lit = C('#ffb36b');
  const r = rng(80);
  for (const c of towers) {
    const top = wallH(c);
    near.push(...onRing([part(new THREE.ConeGeometry(3.6, 6 + r() * 3, 8), 'body', silhouette(dark, mix(dark, red, 0.25), 0, 6))], NEAR, c, top + 3));
    for (let k = 0; k < 3; k++) near.push(...onRing(pane(0.9, 1.4, lit), NEAR - 1, c + (r() - 0.5) * 0.03, 8 + r() * (top - 9)));
  }
  for (let k = 0; k < 30; k++) near.push(...onRing(pane(0.7, 1.0, lit), NEAR - 1, (r() - 0.5) * Math.PI * 2, 6 + r() * 4));
  const farDark = mix(h, C('#12040a'), 0.2);
  const far = horizonRing(FAR, hills(13, 10, 3, 13), h, farDark, mix(farDark, red, 0.5));
  return { near, far };
}

// ================================================================== Forks
// A golden canyon among mesas.

function forksHorizon() {
  const t = WORLD_THEMES.forks;
  const h = haze('forks');
  const dark = mix(h, C('#5a2a12'), 0.32);
  const near = horizonRing(NEAR, mesas(9, 13, 4, 7), h, dark, mix(dark, C(t.sun), 0.4), 720);
  const farDark = mix(h, C('#5a2a12'), 0.15);
  const far = horizonRing(FAR, mesas(12, 15, 2.5, 17), h, farDark, mix(farDark, C(t.sun), 0.5), 720);
  return { near, far };
}

// ================================================================== Pins & Skewers
// A glacier under snowy peaks.

function pinsHorizon() {
  const h = haze('pins');
  const dark = mix(h, C('#1e3566'), 0.32);
  const near = horizonRing(NEAR, peaks(7, 17, 6, 3), h, dark, mix(dark, C('#ffffff'), 0.65), 720);
  const farDark = mix(h, C('#1e3566'), 0.15);
  const far = horizonRing(FAR, peaks(11, 22, 3.5, 23), h, farDark, mix(farDark, C('#ffffff'), 0.7), 720);
  return { near, far };
}

// ================================================================== Sacrifices
// A volcanic altar: glowing volcanoes on the horizon.

function sacrificesHorizon() {
  const ember = C(WORLD_THEMES.sacrifices.accent);
  const lavaDeep = C('#b8240f');
  const lavaBright = C('#ffb03a');
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
  const near = horizonRing(NEAR, nearH, h, dark, mix(dark, ember, 0.3), 900);
  for (const v of volcanoes) {
    near.push(...onRing([part(move(new THREE.TorusGeometry(2.4, 0.5, 4, 16), 0, 0, 0, [Math.PI / 2, 0, 0]), 'glow', lavaBright)], NEAR - 1, v.a, v.h - 2.7));
    const r = rng(Math.round(v.a * 100));
    for (let k = 0; k < 3; k++) {
      const len = 5 + r() * 6;
      const side = (r() - 0.5) * 0.5;
      const streak = move(new THREE.BoxGeometry(0.6, len, 0.2).translate(0, -len / 2, 0), 0, 0, 0, [0, 0, side]);
      near.push(...onRing([part(streak, 'glow', mix(lavaDeep, ember, r()))], NEAR - 1.5, v.a + side * 0.02, v.h - 3));
    }
  }
  const farDark = mix(h, C('#0a0410'), 0.2);
  const far = horizonRing(FAR, peaks(12, 18, 3.5, 43), h, farDark, mix(farDark, ember, 0.35), 720);
  return { near, far };
}

// ================================================================== Endgames
// A misty valley: ramparts and towers in the mist.

function endgamesHorizon() {
  const t = WORLD_THEMES.endgames;
  const warm = C('#ffcf7a');
  const h = haze('endgames');
  const dark = mix(h, C('#07150f'), 0.32);
  const nearH = hills(9, 7, 4.5, 9);
  const near = horizonRing(NEAR, nearH, h, dark, mix(dark, C(t.sun), 0.25));
  const r = rng(90);
  const ahead = [-0.07, 0.05, 0.16];
  for (let k = 0; k < 12; k++) {
    const a = k < ahead.length ? ahead[k] : (r() - 0.5) * Math.PI * 1.5 + (k > 9 ? Math.PI : 0);
    const th = 8 + r() * 7;
    const sil = silhouette(dark, mix(dark, C(t.sun), 0.15), 0, th);
    const tower: Model = [part(new THREE.CylinderGeometry(1.5, 1.7, th, 8).translate(0, th / 2, 0), 'body', sil)];
    for (let m = 0; m < 5; m++) tower.push(part(new THREE.BoxGeometry(0.8, 0.9, 0.8).translate(Math.sin(m * 1.26) * 1.5, th + 0.45, Math.cos(m * 1.26) * 1.5), 'body', sil));
    if (r() < 0.7) for (const w of pane(0.4, 0.7, warm)) tower.push({ ...w, geo: w.geo.translate(0, th * 0.7, 1.6) });
    near.push(...onRing(tower, NEAR - 3, a, nearH(a) - 2));
  }
  const farDark = mix(h, C('#07150f'), 0.15);
  const far = horizonRing(FAR, hills(12, 11, 2.5, 19), h, farDark, mix(farDark, C(t.sun), 0.35));
  return { near, far };
}

export const WORLDS: Record<string, WorldRecipe> = {
  openings: {
    big: objects([['pawn-on-plinth', 3], ['pawn-chipped', 2], ['pawn-sunk', 2], ['pawn-fallen', 1.5]]),
    small: objects([['grass', 5], ['wildflowers', 3], ['pebbles', 2], ['pawn-head', 0.6]]),
    landmarks: [{ name: 'gate' }, { name: 'fallen-king' }],
    horizon: openingsHorizon,
  },
  'first-steps': {
    big: objects([['round-tree', 3], ['blossom-tree', 1.5], ['poplar', 2], ['bush', 2]]),
    small: objects([['grass', 5], ['flowers', 3], ['mushrooms', 1.2], ['mossy-rocks', 1.5], ['signpost', 0.35]]),
    landmarks: [{ name: 'windmill' }, { name: 'cottage' }],
    horizon: firstStepsHorizon,
  },
  'mate-in-2': {
    big: objects([['column', 3], ['broken-column', 2], ['brazier', 1.4], ['banner', 1.4]]),
    small: objects([['marble-rubble', 3], ['candles', 2], ['fallen-crown', 0.8]]),
    landmarks: [{ name: 'throne' }, { name: 'colonnade' }],
    horizon: mateInTwoHorizon,
  },
  forks: {
    big: objects([['hoodoo', 3], ['forked-rock', 2.4], ['butte', 1.6], ['dead-tree', 1.2]]),
    small: objects([['shrub', 4], ['cactus', 1.6], ['pebbles', 2.5]]),
    landmarks: [{ name: 'knight-cliff', facing: 'x' }, { name: 'rock-arch' }],
    horizon: forksHorizon,
  },
  pins: {
    big: objects([['crystal-cluster', 3], ['ice-spears', 2], ['serac', 1.6], ['snowy-fir', 2.4]]),
    small: objects([['snow-mound', 3], ['crystal-shards', 3], ['ice-chunks', 1.5]]),
    landmarks: [{ name: 'frozen-king' }, { name: 'skewer' }],
    horizon: pinsHorizon,
  },
  sacrifices: {
    big: objects([['obsidian-shards', 3], ['basalt-columns', 2.2], ['lava-pool', 1.3, true], ['rune-pillar', 1.4]]),
    small: objects([['ember-vent', 1.6, true], ['small-obsidian', 3], ['ash-rocks', 3]]),
    landmarks: [{ name: 'altar' }, { name: 'fire-gate' }],
    horizon: sacrificesHorizon,
  },
  endgames: {
    big: objects([['rook-tower', 2.4], ['broken-tower', 2.2], ['standing-stones', 1.6], ['dead-tree', 1.4]]),
    small: objects([['grass', 5], ['lantern', 0.6], ['gravestone', 1.2], ['rubble', 2]]),
    landmarks: [{ name: 'king-statue' }, { name: 'ruined-wall' }],
    horizon: endgamesHorizon,
  },
};
