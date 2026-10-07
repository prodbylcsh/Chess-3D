// How shop items look. Plain data (colours as hex strings) so both the 3D engine
// and the 2D previews in the shop can use it.
//
// These are placeholder looks: they recolour the classic marble model with a
// shader and reuse the existing effects. When real assets arrive, a look can
// point at them via `assets` (see docs/PLATFORM.md §4.5, "Assets") and the
// engine loads those instead of recolouring.

export type MoveStyle = 'glide' | 'levitate' | 'blink' | 'comet';
export type DestructionStyle = 'shatter' | 'embers' | 'frostbite' | 'implode';

/** Recolour of one side's pieces. */
export interface PieceTone {
  /** main colour (replaces the marble's base colour) */
  base: string;
  /** colour of the marble veins */
  vein: string;
  /** 0..1: how strongly veins take the vein colour */
  veinAmount: number;
  /** veins glow in this colour (magical sets) */
  glow?: string;
  roughness?: number;
  metalness?: number;
}

export interface PieceSetLook {
  /** null keeps the original model untouched */
  light: PieceTone | null;
  dark: PieceTone | null;
  /** future: GLB with piece_<type>_<white|black> nodes, like the classic set */
  assets?: { model: string };
}

export interface BoardLook {
  /** null keeps the original board */
  tones: { light: string; dark: string; vein?: string; veinAmount?: number; roughness?: number } | null;
  /** future: GLB with a "board" node, or replacement textures */
  assets?: { model?: string; texture?: string };
}

export interface BackgroundLook {
  /** sky and fog colour */
  sky: string;
  fog: number;
  /** table gradient from the centre out */
  table: [string, string, string];
  keyLight: string;
  /** the coloured fill light on one side */
  fill: { color: string; intensity: number };
  rim: string;
  hemisphere: [sky: string, ground: string];
  /** floating particles in the air: linear HDR colour, count, rising speed and size multipliers */
  motes: { color: [number, number, number]; count: number; rise: number; size: number };
  /** future: an equirectangular image or a scene GLB */
  assets?: { environment?: string; model?: string };
}

export const PIECE_SETS: Record<string, PieceSetLook> = {
  'marble-set': { light: null, dark: null },
  'onyx-gold-set': {
    light: { base: '#e9c46a', vein: '#9a6b1f', veinAmount: 0.7, roughness: 0.35, metalness: 0.55 },
    dark: { base: '#111116', vein: '#d9a640', veinAmount: 0.55, roughness: 0.3 },
  },
  'frost-set': {
    light: { base: '#cfe9ff', vein: '#6cc0ff', veinAmount: 0.9, glow: '#3fa8ff', roughness: 0.18 },
    dark: { base: '#1b3657', vein: '#9fe0ff', veinAmount: 0.9, glow: '#4cc2ff', roughness: 0.2 },
  },
  'ember-set': {
    light: { base: '#efd8c2', vein: '#ff8a3a', veinAmount: 0.85, glow: '#ff5a14', roughness: 0.45 },
    dark: { base: '#1b0f0b', vein: '#ff7a24', veinAmount: 1, glow: '#ff4a0a', roughness: 0.55 },
  },
  'celestial-set': {
    light: { base: '#f5efff', vein: '#b996ff', veinAmount: 0.85, glow: '#9a6bff', roughness: 0.25 },
    dark: { base: '#120e2e', vein: '#ffd27a', veinAmount: 1, glow: '#ffc04a', roughness: 0.25 },
  },
};

export const BOARDS: Record<string, BoardLook> = {
  'marble-board': { tones: null },
  'walnut-board': { tones: { light: '#e2c08f', dark: '#5b3a21', vein: '#3a2412', veinAmount: 0.3, roughness: 0.55 } },
  'moonstone-board': { tones: { light: '#e3e9f4', dark: '#33415e', vein: '#9fb4dc', veinAmount: 0.7, roughness: 0.25 } },
  'jade-board': { tones: { light: '#e4f2e6', dark: '#1e5a3f', vein: '#7fd6a4', veinAmount: 0.7, roughness: 0.22 } },
  'royal-board': { tones: { light: '#f3e6c8', dark: '#5c1424', vein: '#e2b24e', veinAmount: 1, roughness: 0.28 } },
};

export const BACKGROUNDS: Record<string, BackgroundLook> = {
  'candlelit-study': {
    sky: '#07080b',
    fog: 0.032,
    table: ['#3a2c22', '#2a1f18', '#0a0909'],
    keyLight: '#fff0dc',
    fill: { color: '#ff9a4a', intensity: 14 },
    rim: '#9db4ff',
    hemisphere: ['#8a9cc0', '#1a1410'],
    motes: { color: [1.6, 1.1, 0.6], count: 260, rise: 1, size: 1 },
  },
  'moonlit-hall': {
    sky: '#05070e',
    fog: 0.03,
    table: ['#252d3f', '#171d2b', '#05060a'],
    keyLight: '#dce6ff',
    fill: { color: '#5d8bff', intensity: 12 },
    rim: '#a9c2ff',
    hemisphere: ['#7f9cd6', '#0e1220'],
    motes: { color: [1.0, 1.25, 1.8], count: 200, rise: 0.6, size: 0.8 },
  },
  'emerald-grove': {
    sky: '#030806',
    fog: 0.034,
    table: ['#1f3826', '#13241a', '#040806'],
    keyLight: '#f1ffe6',
    fill: { color: '#4dff9a', intensity: 11 },
    rim: '#bfffd8',
    hemisphere: ['#8fd6a8', '#0b140d'],
    motes: { color: [1.4, 2.0, 0.45], count: 120, rise: 1.4, size: 1.7 },
  },
  'arcane-void': {
    sky: '#06030c',
    fog: 0.028,
    table: ['#2c1a44', '#1a1029', '#050308'],
    keyLight: '#f1e6ff',
    fill: { color: '#a066ff', intensity: 16 },
    rim: '#d0b0ff',
    hemisphere: ['#a58ad8', '#120a1e'],
    motes: { color: [1.3, 0.75, 2.1], count: 300, rise: 1, size: 1 },
  },
  'volcanic-forge': {
    sky: '#0a0402',
    fog: 0.036,
    table: ['#4a1d0c', '#2a1007', '#090302'],
    keyLight: '#ffd9b5',
    fill: { color: '#ff5a1a', intensity: 22 },
    rim: '#ff9a6a',
    hemisphere: ['#c08a70', '#1a0a04'],
    motes: { color: [2.4, 0.8, 0.18], count: 300, rise: 4, size: 1.1 },
  },
};

export const MOVE_STYLES: Record<string, MoveStyle> = { glide: 'glide', levitate: 'levitate', blink: 'blink', comet: 'comet' };
export const DESTRUCTION_STYLES: Record<string, DestructionStyle> = { shatter: 'shatter', embers: 'embers', frostbite: 'frostbite', implode: 'implode' };

export const pieceSetLook = (id: string) => PIECE_SETS[id] ?? PIECE_SETS['marble-set'];
export const boardLook = (id: string) => BOARDS[id] ?? BOARDS['marble-board'];
export const backgroundLook = (id: string) => BACKGROUNDS[id] ?? BACKGROUNDS['candlelit-study'];
export const moveStyle = (id: string): MoveStyle => MOVE_STYLES[id] ?? 'glide';
export const destructionStyle = (id: string): DestructionStyle => DESTRUCTION_STYLES[id] ?? 'shatter';

/** What the engine needs to dress one game. */
export interface GameLooks {
  pieces: { w: string; b: string };
  board: string;
  background: string;
  moveAnimation: { w: string; b: string };
  destruction: { w: string; b: string };
}

export const DEFAULT_LOOKS: GameLooks = {
  pieces: { w: 'marble-set', b: 'marble-set' },
  board: 'marble-board',
  background: 'candlelit-study',
  moveAnimation: { w: 'glide', b: 'glide' },
  destruction: { w: 'shatter', b: 'shatter' },
};

interface LoadoutLike {
  pieces: string;
  board: string;
  background: string;
  moveAnimation: string;
  destruction: string;
}

/**
 * Combine both players' loadouts: each side keeps its own pieces, moves and
 * captures; board and background come from one player, picked at random
 * (deterministically from `seed`, so both players see the same) when they differ.
 */
export function looksFor(white: LoadoutLike | null, black: LoadoutLike | null, seed: string): GameLooks {
  const w = white ?? DEFAULT_LOADOUT_LIKE;
  const b = black ?? DEFAULT_LOADOUT_LIKE;
  const coin = (salt: string) => hash(seed + salt) % 2 === 0;
  return {
    pieces: { w: w.pieces, b: b.pieces },
    board: w.board === b.board || coin('board') ? w.board : b.board,
    background: w.background === b.background || coin('background') ? w.background : b.background,
    moveAnimation: { w: w.moveAnimation, b: b.moveAnimation },
    destruction: { w: w.destruction, b: b.destruction },
  };
}

const DEFAULT_LOADOUT_LIKE: LoadoutLike = {
  pieces: DEFAULT_LOOKS.pieces.w,
  board: DEFAULT_LOOKS.board,
  background: DEFAULT_LOOKS.background,
  moveAnimation: DEFAULT_LOOKS.moveAnimation.w,
  destruction: DEFAULT_LOOKS.destruction.w,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
