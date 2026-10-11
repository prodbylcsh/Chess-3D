// How shop items look. Plain data (colours as hex strings, file paths) so both the 3D
// engine and the shop's previews can use it.
//
// A look either recolours the classic marble model with a shader (`light`/`dark`,
// `tones`) or points at real models under public/assets/ (`model`), which the engine
// loads when a game uses them (docs/PLATFORM.md §4.5 "Assets"; the build script is
// scripts/assets/build-models.ts).

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
  /** recolour of the classic set; null keeps the original model untouched */
  light: PieceTone | null;
  dark: PieceTone | null;
  /** own models: folder with `<king…pawn>-<white|black>.glb` (replaces the classic set) */
  model?: { dir: string };
}

export interface BoardLook {
  /** recolour of the classic board; null keeps the original board */
  tones: { light: string; dark: string; vein?: string; veinAmount?: number; roughness?: number } | null;
  /** own model: a GLB whose 8×8 grid is 8 units wide around the origin (replaces the classic board) */
  model?: { file: string };
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
  'monolith-set': { light: null, dark: null, model: { dir: 'assets/pieces/monolith' } },
};

export const BOARDS: Record<string, BoardLook> = {
  'marble-board': { tones: null },
  'monolith-board': { tones: null, model: { file: 'assets/boards/monolith/board.glb' } },
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
};

// Item id → animation. The engine also has 'levitate', 'blink', 'comet' (moves) and 'embers',
// 'frostbite', 'implode' (captures), ready for future shop items.
export const MOVE_STYLES: Record<string, MoveStyle> = { glide: 'glide' };
export const DESTRUCTION_STYLES: Record<string, DestructionStyle> = { shatter: 'shatter' };

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
