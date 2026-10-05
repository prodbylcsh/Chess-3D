import { Color, Vector3 } from 'three';
import type { Color as Side, Square } from 'chess.js';

/** Size of one board square inside the GLB, in model units. */
export const MODEL_SQUARE = 0.0578881;
/** The whole set is scaled so that one square is exactly one world unit. */
export const MODEL_SCALE = 1 / MODEL_SQUARE;

/** Filled in from the loaded board model. */
export const layout = {
  boardTop: 0.3,
  boardHalf: 4.78,
};

const FILES = 'abcdefgh';

export function fileIndex(sq: Square): number {
  return sq.charCodeAt(0) - 97;
}

export function rankIndex(sq: Square): number {
  return sq.charCodeAt(1) - 49;
}

export function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

/**
 * White sits at +z looking towards -z, so a1 is front-left from White's view.
 */
export function squareCenter(sq: Square, out = new Vector3()): Vector3 {
  return out.set(fileIndex(sq) - 3.5, layout.boardTop, 3.5 - rankIndex(sq));
}

export function worldToSquare(x: number, z: number): Square | null {
  return toSquare(Math.floor(x + 4), Math.floor(4 - z));
}

export interface TeamStyle {
  name: string;
  /** Linear HDR colour used for magic, sparks and glowing edges. */
  glow: Color;
}

export const TEAMS: Record<Side, TeamStyle> = {
  w: { name: 'White', glow: new Color(1.0, 0.62, 0.22) },
  b: { name: 'Black', glow: new Color(0.62, 0.42, 1.0) },
};

export function other(side: Side): Side {
  return side === 'w' ? 'b' : 'w';
}
