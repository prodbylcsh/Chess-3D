// Chess piece silhouettes on a 100×100 canvas, used by profile icons, badges and
// buttons. Each piece is a list of SVG path strings drawn with the same fill.

export type PieceId = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

const BASE = 'M27 90 h46 a3 3 0 0 0 3 -3 v-3 a3 3 0 0 0 -3 -3 h-46 a3 3 0 0 0 -3 3 v3 a3 3 0 0 0 3 3 Z M32 81 h36 l-2 -6 h-32 Z';

export const PIECE_PATHS: Record<PieceId, string[]> = {
  pawn: [
    BASE,
    'M38 75 C40 64 44 56 45 50 h10 C56 56 60 64 62 75 Z',
    'M36 51 h28 a3 3 0 0 0 0 -6 h-28 a3 3 0 0 0 0 6 Z',
    'M50 45 a12 12 0 1 0 0 -24 a12 12 0 1 0 0 24 Z',
  ],
  rook: [
    BASE,
    'M35 75 L38 47 h24 L65 75 Z',
    'M33 48 h34 v-6 h-34 Z',
    'M32 42 V23 h8 v6 h6 v-6 h8 v6 h6 v-6 h8 V42 Z',
  ],
  bishop: [
    BASE,
    'M38 75 C41 64 44 57 45 52 h10 C56 57 59 64 62 75 Z',
    'M36 53 h28 a3 3 0 0 0 0 -6 h-28 a3 3 0 0 0 0 6 Z',
    'M50 17 C60 25 64 34 60 42 C58 46 42 46 40 42 C36 34 40 25 50 17 Z M54.5 26 L47 35 L49.5 37 L57 28 Z',
    'M50 17 a4.5 4.5 0 1 0 0 -9 a4.5 4.5 0 1 0 0 9 Z',
  ],
  knight: [
    BASE,
    'M36 75 C35 66 40 60 46 55 C41 56 35 58 31 55 C27 52 28 47 32 44 C38 40 41 34 43 28 L41 19 L49 23 C55 22 63 26 67 34 C72 44 71 58 66 75 Z M51 33 a2.6 2.6 0 1 0 0.01 0 Z',
  ],
  queen: [
    BASE,
    'M37 75 C40 65 44 58 45 53 h10 C56 58 60 65 63 75 Z',
    'M35 54 h30 a3 3 0 0 0 0 -6 h-30 a3 3 0 0 0 0 6 Z',
    'M34 48 L29 25 L40 37 L44 20 L50 35 L56 20 L60 37 L71 25 L66 48 Z',
    'M29 26 a4 4 0 1 0 0 -8 a4 4 0 1 0 0 8 Z M44 20 a4 4 0 1 0 0 -8 a4 4 0 1 0 0 8 Z M56 20 a4 4 0 1 0 0 -8 a4 4 0 1 0 0 8 Z M71 26 a4 4 0 1 0 0 -8 a4 4 0 1 0 0 8 Z',
  ],
  king: [
    BASE,
    'M37 75 C40 65 44 58 45 53 h10 C56 58 60 65 63 75 Z',
    'M35 54 h30 a3 3 0 0 0 0 -6 h-30 a3 3 0 0 0 0 6 Z',
    'M36 48 C33 38 38 30 50 30 C62 30 67 38 64 48 Z',
    'M47 30 V20 h-6 v-6 h6 V8 h6 v6 h6 v6 h-6 V30 Z',
  ],
};
