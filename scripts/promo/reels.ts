// The Instagram Reels (docs/marketing/README.md "Reels"): what each one shows, shot by shot,
// and the text laid over it. `render-reels.ts` renders the takes from the real game as
// frames; `build-reels.ts` adds the text, the game's own sounds and a music bed and writes
// promo/instagram/reels/<reel>/reel.mp4 with cover.jpg and caption.md.
//
// Times: a take's `dur` and every `t` are seconds of video (30 fps). `speed` keys are how
// fast the game runs at that video time (1 = real time, 0.3 = slow motion), linear between
// keys. Moves are played at game (simulation) times; `simStart` is how far into the take's
// game clock the first frame is.

import { moduleOf } from '../../supabase/functions/_shared/puzzles.ts';

export const FPS = 30;

/** Game speed at video time v of a take (linear between the keys). */
export function speedAt(keys: [number, number][] | undefined, v: number): number {
  if (!keys?.length) return 1;
  if (v <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, s1] = keys[i];
    const [t0, s0] = keys[i - 1];
    if (v <= t1) return s0 + (s1 - s0) * ((v - t0) / (t1 - t0));
  }
  return keys.at(-1)![1];
}

/** The game clock at video time v (simStart plus the frames' steps, as render-reels.ts runs it). */
export function gameAt(keys: [number, number][] | undefined, simStart: number, v: number): number {
  let g = simStart;
  for (let i = 0; i < Math.round(v * FPS); i++) g += speedAt(keys, i / FPS) / FPS;
  return g;
}

export interface Camera {
  /** square or [x, y, z] the camera looks at */
  at: string | [number, number, number];
  dist: number;
  height: number;
  /** degrees around the board; 0 = from White's side, 90 = from the h-file */
  yaw?: number;
  fov?: number;
}

export interface Loadout {
  pieces?: string;
  board?: string;
  background?: string;
}

export interface Take {
  name: string;
  /** shop items for this take (both sides) */
  loadout?: Loadout;
  /** engine styles switched on for this take (the way a future shop item would) */
  styles?: { move?: string; destruction?: string };
  /** a puzzle module's colour (`_shared/puzzles.ts`): the scene takes it, as while playing the module */
  mood?: string;
  fen?: string;
  /** moves already on the board (UCI) */
  before?: string[];
  /** moves played during the take, at game-clock seconds */
  moves?: { uci: string; at: number }[];
  /** game-clock seconds already run when the first frame is taken */
  simStart?: number;
  /** video seconds */
  dur: number;
  /** [video seconds, game speed]; default real time */
  speed?: [number, number][];
  /** [video seconds, camera]; eased between keys */
  camera: [number, Camera][];
}

export type TextStyle = 'hook' | 'title' | 'label' | 'big' | 'count' | 'cta';

export interface Overlay {
  /** video seconds (whole reel) */
  from: number;
  to: number;
  style: TextStyle;
  /** first line (kicker for labels) */
  kicker?: string;
  text: string;
  sub?: string;
  /** vertical position of the block's centre, px of 1920 */
  y?: number;
}

export interface Reel {
  id: string;
  title: string;
  /** what it is for (docs/marketing/README.md) */
  goal: string;
  takes: Take[];
  overlays: Overlay[];
  /** the cover: a video time whose frame is used, and its headline */
  cover: { t: number; kicker: string; text: string };
  caption: string;
  alt: string;
  /** music bed: root note (Hz) and mood */
  music: { root: number; mood: 'dark' | 'bright' };
}

const KNIGHT_TAKES = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
const SCHOLAR = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'];
const PUZZLE = 'rn4k1/p4ppp/b7/3P4/4qBn1/7P/PP2QPP1/2R1KB1R b K - 1 20';

const HASHTAGS = '#chess #3dchess #chessgame #onlinechess #indiegame';

// ------------------------------------------------------------------ 01: the promise

const knightCam = (yaw: number, dist: number): Camera => ({ at: [0.5, 1.5, -0.5], dist, height: 1.8, yaw });
const queenCam = (yaw: number, dist: number, height = 3): Camera => ({ at: [2.2, 1.2, -1.8], dist, height, yaw });

const PIECES_FIGHT: Reel = {
  id: '01-pieces-fight',
  title: 'Chess, but the pieces fight',
  goal: 'the promise; brings players in (reach: Reels are shown to non-followers)',
  takes: [
    {
      name: 'approach',
      before: KNIGHT_TAKES,
      dur: 2.2,
      camera: [
        [0, { at: [0, 0.3, 0.6], dist: 14, height: 9, yaw: -28 }],
        [2.2, { at: [0.4, 1.0, 0], dist: 10.5, height: 3.4, yaw: 8 }],
      ],
    },
    {
      name: 'knight',
      before: KNIGHT_TAKES,
      moves: [{ uci: 'f3e5', at: 0 }],
      simStart: 0.45,
      dur: 4.2,
      // the leap at full speed, then slow motion through the slam and the shards
      speed: [[0, 1], [0.45, 1], [0.6, 0.28], [2.6, 0.28], [3.0, 1]],
      camera: [
        [0, knightCam(34, 9.6)],
        [4.2, knightCam(14, 8.2)],
      ],
    },
    {
      name: 'queen',
      before: SCHOLAR,
      moves: [{ uci: 'h5f7', at: 0 }],
      simStart: 0.35,
      dur: 10.6,
      // the bolt in slow motion, then on to the checkmate scene, which then lingers
      speed: [[0, 1], [0.45, 1], [0.6, 0.32], [2.6, 0.32], [2.9, 1.25], [4.6, 1.25], [5.0, 0.55]],
      camera: [
        [0, queenCam(-38, 9.2)],
        [3.0, queenCam(-24, 8.4)],
        // over to the mated king on e8
        [5.2, { at: [1.1, 1.0, -2.9], dist: 8.2, height: 3.2, yaw: -14 }],
        [8.4, { at: [1.0, 1.0, -2.9], dist: 9.6, height: 4.2, yaw: 2 }],
        [10.6, { at: [0.8, 1.0, -2.6], dist: 11.5, height: 5.2, yaw: 10 }],
      ],
    },
  ],
  overlays: [
    { from: 0.05, to: 2.2, style: 'hook', text: 'Chess,', y: 520 },
    { from: 0.6, to: 2.2, style: 'hook', text: 'but the pieces fight.', y: 700 },
    { from: 2.6, to: 6.0, style: 'label', kicker: 'The knight', text: 'leaps and slams down', y: 1330 },
    { from: 6.7, to: 9.4, style: 'label', kicker: 'The queen', text: 'casts a spell', y: 1330 },
    { from: 10.4, to: 13.8, style: 'big', text: 'Checkmate.', y: 560 },
    { from: 14.6, to: 17.0, style: 'cta', text: 'Chess where the pieces really fight' },
  ],
  cover: { t: 3.6, kicker: '3D chess · free in your browser', text: 'Chess, but the pieces fight' },
  caption: `Chess, but the pieces actually fight ⚔️ Knights leap and slam down, queens cast spells, checkmate gets its own scene.

♟️ Real chess rules, real opponents
🏆 Ranked seasons from Iron to Challenger
🧩 Puzzles, lessons and tournaments
🆓 Free in your browser, phone and PC

Play free, link in bio 👆

${HASHTAGS}`,
  alt: 'A 3D chess game in a dark candlelit room. A white marble knight leaps and smashes a black pawn into shards in slow motion, then the white queen fires a magic bolt at f7 and the black king is checkmated. The video ends with the Wizard Chess logo: free in your browser, link in bio.',
  music: { root: 73.42, mood: 'dark' },
};

// ------------------------------------------------------------------ 02: pick your capture

const FX_CAM = (yaw: number, dist: number): Camera => ({ at: [0.5, 0.9, -0.5], dist, height: 2.8, yaw });
const capture = (name: string, loadout: Loadout, destruction: string | undefined, yaw: number): Take => ({
  name,
  loadout,
  styles: destruction ? { destruction } : undefined,
  before: KNIGHT_TAKES,
  moves: [{ uci: 'f3e5', at: 0 }],
  simStart: 0.85,
  dur: 3.1,
  speed: [[0, 1], [0.3, 1], [0.42, 0.3], [3.1, 0.3]],
  camera: [
    [0, FX_CAM(yaw, 8.6)],
    [3.1, FX_CAM(yaw - 14, 7.4)],
  ],
});

const PICK_CAPTURE: Reel = {
  id: '02-pick-your-capture',
  title: 'Pick your capture',
  goal: 'desire for items, comments ("which one?"); earns through coin packs and Premium',
  takes: [
    capture('shatter', { pieces: 'marble-set', board: 'marble-board' }, undefined, 34),
    capture('embers', { pieces: 'monolith-set', board: 'monolith-board' }, 'embers', 30),
    { ...capture('frostbite', { pieces: 'frost-glass-set', board: 'frost-board' }, 'frostbite', 34), dur: 3.1 },
    { ...capture('implode', { pieces: 'titani-set', board: 'argentum-board' }, 'implode', 30), dur: 5.6,
      speed: [[0, 1], [0.3, 1], [0.42, 0.3], [3.1, 0.3], [3.4, 0.6]] },
  ],
  overlays: [
    { from: 0.0, to: 3.1, style: 'title', text: 'Pick your capture', y: 470 },
    { from: 0.15, to: 3.1, style: 'count', kicker: '1', text: 'Shatter', y: 1330 },
    { from: 3.15, to: 6.2, style: 'count', kicker: '2', text: 'Embers', y: 1330 },
    { from: 6.25, to: 9.3, style: 'count', kicker: '3', text: 'Frostbite', y: 1330 },
    { from: 9.35, to: 12.3, style: 'count', kicker: '4', text: 'Implode', y: 1330 },
    { from: 9.35, to: 12.3, style: 'label', kicker: 'Comment', text: '1, 2, 3 or 4?', y: 470 },
    { from: 12.4, to: 14.9, style: 'cta', text: 'Make every capture yours' },
  ],
  cover: { t: 4.4, kicker: 'Capture effects', text: 'Pick your capture' },
  caption: `Which capture would you pick? Comment 1, 2, 3 or 4 👇

1️⃣ Shatter, Classic Marble
2️⃣ Embers, Monolith
3️⃣ Frostbite, Frost
4️⃣ Implode, Titani on Argentum

Every capture effect, piece set and board shows in every game you play, and your opponent sees it too. Earn coins by playing, spend them in the shop.

Play free, link in bio 👆

#chess #3dchess #chessgame #gaming #indiegame`,
  alt: 'Four slow-motion clips of the same 3D chess capture, a knight taking a pawn: the pawn shatters on a marble board, burns to embers on the black Monolith set, freezes and cracks on the Frost glass set, and implodes on the Titani set. Labels 1 to 4 ask which one you would pick.',
  music: { root: 82.41, mood: 'bright' },
};

// ------------------------------------------------------------------ 03: mate in two

// nearly straight down, the whole board in the upper part of the frame (the text sits below)
const TOP: Camera = { at: [0, 0, 1.6], dist: 3.6, height: 24, yaw: 0, fov: 40 };
const PUZZLE_REEL: Reel = {
  id: '03-mate-in-two',
  title: 'Mate in 2: Black just took your queen',
  goal: 'comments, saves, rewatches; puzzles as a habit; earns through puzzle worlds and Premium',
  takes: [
    {
      name: 'puzzle',
      fen: PUZZLE,
      moves: [
        { uci: 'a6e2', at: 0 },
        { uci: 'c1c8', at: 6.4 },
        { uci: 'e4e8', at: 8.6 },
        { uci: 'c8e8', at: 10.8 },
      ],
      simStart: 0.3,
      dur: 17.2,
      // the solution's last move in slow motion, then the checkmate scene
      speed: [[0, 1], [11.4, 1], [11.55, 0.4], [13.0, 0.4], [13.3, 1]],
      camera: [
        [0, { at: [1, 0.6, 0.8], dist: 8.2, height: 5.2, yaw: 18 }],
        [2.6, { at: [0.2, 0.3, 1.2], dist: 7, height: 10, yaw: 6 }],
        [3.3, TOP],
        [6.0, { ...TOP, dist: 3, height: 22.5 }],
        [7.2, { at: [0, 0.6, -2.2], dist: 9.6, height: 6.8, yaw: -14 }],
        [10.9, { at: [0.6, 0.8, -2.8], dist: 8.4, height: 4.8, yaw: -6 }],
        [17.2, { at: [1.2, 0.8, -3], dist: 8.6, height: 5.4, yaw: 10 }],
      ],
    },
  ],
  overlays: [
    { from: 0.1, to: 2.9, style: 'hook', text: 'Black just took your queen.', y: 560 },
    { from: 3.3, to: 6.0, style: 'title', kicker: 'White to play', text: 'Mate in 2', y: 1390 },
    { from: 4.6, to: 6.0, style: 'label', kicker: 'Pause now', text: 'Answer in 3 seconds', y: 360 },
    { from: 6.4, to: 8.4, style: 'big', text: '1. Rc8+', sub: 'the rook checks the king', y: 1390 },
    { from: 8.6, to: 10.6, style: 'big', text: '1... Qe8', sub: 'the only block', y: 1390 },
    { from: 10.8, to: 13.4, style: 'big', text: '2. Rxe8#', sub: 'checkmate', y: 1390 },
    { from: 14.4, to: 17.2, style: 'cta', text: 'A new puzzle every day' },
  ],
  cover: { t: 4.2, kicker: 'Puzzle · mate in 2', text: 'Black just took your queen' },
  caption: `Black just took your queen. Mate in 2. Did you see it before the answer? 👀

White to play. Pause the video, find the two moves, then check.
Comment how fast you got it ⏱️

Every day a new puzzle, free. Seven puzzle worlds on a map, from first mates to sacrifices.

Puzzle: Lichess (CC0).

#chess #chesspuzzle #mateintwo #3dchess #chesstactics`,
  alt: 'A 3D chess puzzle. A black bishop captures the white queen with a magic bolt. Seen from above, the text says White to play, mate in 2. The solution plays out: the rook goes to c8 with check, the black queen blocks on e8, and the rook takes it on e8, checkmate.',
  music: { root: 69.3, mood: 'dark' },
};

// ------------------------------------------------------------------ 04: make it yours

const ORBIT_SECONDS = 12.6;
/** One continuous orbit across all cuts: the camera at reel time t. */
const orbit = (t: number): Camera => ({ at: [0, 0.9, 0.6], dist: 9.6 - t * 0.12, height: 3.6 + t * 0.08, yaw: -40 + (t / ORBIT_SECONDS) * 80 });
const SETS: [string, Loadout, string][] = [
  ['Classic Marble', { pieces: 'marble-set', board: 'marble-board' }, 'free'],
  ['Squircle', { pieces: 'squircle-set', board: 'maple-board' }, 'rare'],
  ['Monolith', { pieces: 'monolith-set', board: 'monolith-board' }, 'legendary'],
  ['Marb', { pieces: 'marb-set', board: 'zlata-board' }, 'epic'],
  ['Frost', { pieces: 'frost-glass-set', board: 'frost-board' }, 'rare'],
  ['Hallow', { pieces: 'hallow-set', board: 'beton-board' }, 'legendary'],
  ['Dismorph', { pieces: 'dismorph-set', board: 'azure-lagoon-board' }, 'legendary'],
  ['Medenka', { pieces: 'medenka-set', board: 'classie-board' }, 'legendary'],
];
const CLIP = 1.4;
const MAKE_IT_YOURS: Reel = {
  id: '04-make-it-yours',
  title: 'Make the board yours',
  goal: 'desire for items; earns through coin packs and Premium (the Wardrobe)',
  takes: SETS.map(([name, loadout], i) => {
    const t0 = i * CLIP;
    const dur = i === SETS.length - 1 ? 3.6 : CLIP;
    return {
      name: name.toLowerCase().replace(/ /g, '-'),
      loadout,
      before: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'],
      dur,
      camera: [[0, orbit(t0)], [dur, orbit(t0 + dur)]] as [number, Camera][],
    };
  }),
  overlays: [
    { from: 0.05, to: 2.75, style: 'title', text: 'Make the board yours', y: 470 },
    ...SETS.map(([name, , rarity], i): Overlay => ({
      from: i * CLIP + 0.05,
      to: i * CLIP + (i === SETS.length - 1 ? 1.9 : CLIP),
      style: 'count',
      kicker: rarity,
      text: name,
      y: 1360,
    })),
    { from: 11.5, to: 14.8, style: 'cta', text: '29 piece sets · 13 boards' },
  ],
  cover: { t: 3.5, kicker: 'Piece sets · boards', text: 'Make the board yours' },
  caption: `Same opening, eight different boards. Which set would you play with? 👇

Classic Marble · Squircle · Monolith · Marb · Frost · Hallow · Dismorph · Medenka

29 piece sets and 13 boards, each one a real 3D model. Your opponent sees your set in every game. Earn coins by playing, or pick them up in the shop.

Play free, link in bio 👆

#chess #chessset #3dchess #chessboard #indiegame`,
  alt: 'The camera circles a 3D chessboard in one continuous move while the pieces and board change every second: Classic Marble, Squircle on maple, the black Monolith set, cream and black Marb columns on the gold Zlata board, frosted glass Frost, Hallow on concrete, Dismorph on a lagoon-blue board, and copper Medenka. Text: make the board yours, 29 piece sets, 13 boards.',
  music: { root: 87.31, mood: 'bright' },
};

// ------------------------------------------------------------------ 05–10: the puzzle worlds
// One Reel per puzzle world (docs/PLATFORM.md §4.2), each in its world's colour, with a real
// puzzle from it: the Openings line is hand-made (scripts/puzzles/curated.ts), the others are
// from the Lichess database (CC0) as stored in _shared/puzzle-data/<module>.json.

const mood = (id: string) => moduleOf(id)!.color;
const PUZZLE_TAGS = '#chess #chesspuzzle #chesstactics #3dchess';
const WORLDS = `🧩 Seven puzzle worlds, 100 puzzles each, easiest first
🪙 Coins for every puzzle you solve, a bonus every 10
🎁 Finish a world, win a random item from the shop
📅 A free daily puzzle for everyone`;

/** A puzzle take: the opponent's move (`first`) is played before the first frame; the
 *  solution's moves are given at video times and placed on the game clock here. */
function puzzleTake(p: {
  name: string; mood: string; fen?: string; first?: string; moves: [string, number][];
  simStart?: number; dur: number; speed?: [number, number][]; camera: [number, Camera][];
}): Take {
  const simStart = p.simStart ?? 0.3;
  return {
    name: p.name, mood: p.mood, fen: p.fen, simStart, dur: p.dur, speed: p.speed, camera: p.camera,
    moves: [
      ...(p.first ? [{ uci: p.first, at: 0 }] : []),
      ...p.moves.map(([uci, v]) => ({ uci, at: gameAt(p.speed, simStart, v) })),
    ],
  };
}
/** the board seen from above, then a little closer (the puzzle's "pause now" view) */
const TOP_HOLD = (from: number, to: number): [number, Camera][] => [[from, TOP], [to, { ...TOP, dist: 3, height: 22.5 }]];
/** slow motion from video time t for `len` seconds */
const slow = (t: number, len = 1.3, k = 0.45): [number, number][] => [[t, 1], [t + 0.1, k], [t + len, k], [t + len + 0.3, 1]];
const PAUSE = (from: number, to: number, seconds = 3): Overlay =>
  ({ from, to, style: 'label', kicker: 'Pause now', text: `Answer in ${seconds} seconds`, y: 360 });

// 05 — Openings (free): the Caro-Kann smothered mate, from the first move
const OPENINGS_TRAP: Reel = {
  id: '05-openings-trap',
  title: 'Checkmate in 6 moves (Openings)',
  goal: 'saves and shares; the free Openings world brings players in',
  takes: [
    puzzleTake({
      name: 'caro-kann',
      mood: mood('openings'),
      simStart: 0,
      moves: [
        ['e2e4', 0.4], ['c7c6', 1.2], ['d2d4', 2.0], ['d7d5', 2.8], ['b1c3', 3.6], ['d5e4', 4.4],
        ['c3e4', 5.8], ['b8d7', 7.2], ['d1e2', 8.0], ['g8f6', 9.4], ['e4d6', 11.0],
      ],
      dur: 18.0,
      speed: [[0, 1], ...slow(11.0, 1.5)],
      camera: [
        [0, { at: [0, 0, 0.5], dist: 8.5, height: 10.5, yaw: -12 }],
        [7.6, { at: [0, 0, -0.3], dist: 8, height: 9.5, yaw: 6 }],
        [10.8, { at: 'd7', dist: 7.8, height: 5, yaw: 18 }],
        [18.0, { at: 'd7', dist: 8.6, height: 5.4, yaw: 30 }],
      ],
    }),
  ],
  overlays: [
    { from: 0.05, to: 3.4, style: 'hook', text: 'Checkmate\nin 6 moves.', y: 470 },
    { from: 3.6, to: 7.6, style: 'label', kicker: 'Caro-Kann trap', text: "Spot Black's mistake", y: 470 },
    { from: 8.0, to: 9.3, style: 'big', text: '5. Qe2', sub: 'White sets the trap', y: 1390 },
    { from: 9.4, to: 10.8, style: 'big', text: '5... Ngf6??', sub: 'the natural move loses', y: 1390 },
    { from: 11.0, to: 14.8, style: 'big', text: '6. Nd6#', sub: 'smothered mate', y: 1390 },
    { from: 15.4, to: 18.0, style: 'cta', text: '100 opening lines, free' },
  ],
  cover: { t: 12.6, kicker: 'Openings · Caro-Kann trap', text: 'Checkmate in 6 moves' },
  caption: `Checkmate in 6 moves 😳 Did you spot Black's mistake?

1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7 5.Qe2 Ngf6?? 6.Nd6#

The knight checks from d6, and nothing can take it: the e7 pawn is pinned to its king by the queen on e2. The king is boxed in by its own pieces. Smothered mate.

The Openings world is free: 100 lines from real games, as White and as Black, with what every move is for, the traps included.

${WORLDS}

Play free, link in bio 👆

#chess #chessopenings #carokann #chesstraps #3dchess`,
  alt: 'A 3D chess game in an orange-lit room plays the Caro-Kann from the first move. White puts the queen on e2, Black develops the knight to f6, and the white knight jumps to d6: checkmate, the black king boxed in by its own pieces. Text: checkmate in 6 moves, smothered mate.',
  music: { root: 92.5, mood: 'bright' },
};

// 06 — First Steps: a speed round of three mates in one
const SPEED: [string, string, string, string, string][] = [
  // [puzzle id, position after the opponent's move, the mate, its name, the king's square]
  ['o8wo0', '5r1k/1pp3pp/pb3R1q/8/2B3b1/2Nr1N2/PP3PPP/R5K1 w - - 1 21', 'f6f8', 'Rxf8#', 'h8'],
  ['Iz0nf', 'r2q1rk1/ppp3bp/3p4/4p1Np/2Pn4/3Q4/PP3PP1/R1B1K2R w KQ - 0 15', 'd3h7', 'Qxh7#', 'g8'],
  ['CzEOB', '2kr4/3q4/8/7p/Q4B2/6PP/5P1K/8 w - - 3 66', 'a4a8', 'Qa8#', 'c8'],
];
const ROUND = 4.8;
const SPEED_SUBS = ['the back rank is shut', 'the knight guards h7', 'the bishop covers the escape'];
const SPEED_ROUND: Reel = {
  id: '06-speed-round',
  title: '3 mates, 3 seconds each (First Steps)',
  goal: 'rewatches and comments ("how many did you get?"); the First Steps world',
  takes: SPEED.map(([id, fen, mate, , king], i) => {
    const last = i === SPEED.length - 1;
    return puzzleTake({
      name: `mate-${i + 1}-${id}`,
      mood: mood('first-steps'),
      fen,
      simStart: 0.2,
      moves: [[mate, 3.0]],
      dur: last ? 7.6 : ROUND,
      speed: [[0, 1], ...slow(3.1, 0.9, 0.5)],
      camera: [
        ...TOP_HOLD(0, 3.0),
        [4.4, { at: king, dist: 7.4, height: 4.6, yaw: i === 1 ? 16 : -16 }],
        [last ? 7.6 : ROUND, { at: king, dist: 7.0, height: 4.3, yaw: i === 1 ? 22 : -22 }],
      ],
    });
  }),
  overlays: [
    { from: 0.05, to: 2.9, style: 'label', kicker: 'Speed round', text: '3 seconds each', y: 360 },
    ...SPEED.flatMap(([, , , san], i): Overlay[] => {
      const t0 = i * ROUND;
      return [
        { from: t0 + 0.05, to: t0 + 3.0, style: 'title', kicker: `Puzzle ${i + 1} of 3 · White to play`, text: 'Mate in 1', y: 1300 },
        ...[3, 2, 1].map((n, k): Overlay => ({ from: t0 + k + 0.05, to: t0 + k + 0.95, style: 'big', text: String(n), y: 1480 })),
        { from: t0 + 3.05, to: t0 + 4.75, style: 'big', text: san, sub: SPEED_SUBS[i], y: 1390 },
      ];
    }),
    { from: 14.6, to: 17.2, style: 'cta', text: 'Seven puzzle worlds, 100 puzzles each' },
  ],
  cover: { t: 1.5, kicker: 'Speed round · mate in 1', text: '3 seconds each' },
  caption: `Speed round ⏱️ Three mates in one, three seconds each. How many did you get? Comment 1, 2 or 3 👇

1. Rxf8#  2. Qxh7#  3. Qa8#

These are from First Steps, the warm-up world: short puzzles, win material, spot the mate.

${WORLDS}

Puzzles: Lichess (CC0).

Play free, link in bio 👆

${PUZZLE_TAGS} #mateinone`,
  alt: 'Three 3D chess puzzles seen from above, each with a 3, 2, 1 countdown and the text mate in 1. Then the answer plays: a rook takes on f8, a queen takes on h7 next to a knight, and a queen lands on a8, each one checkmate.',
  music: { root: 98.0, mood: 'bright' },
};

// 07 — Forks: one knight, two targets
const FORK: Reel = {
  id: '07-fork',
  title: 'One knight, two targets (Forks)',
  goal: 'saves, comments; the Forks world',
  takes: [
    puzzleTake({
      name: 'fork',
      mood: mood('forks'),
      fen: '3qk2r/1bp2p1p/2n1pp2/1Nbp4/Q7/4PN2/3P1PPP/4KB1R b Kk - 0 14',
      first: 'd8a8',
      moves: [['b5c7', 5.2], ['e8e7', 7.6], ['c7a8', 9.0]],
      dur: 15.4,
      speed: [[0, 1], ...slow(5.3, 1.3), ...slow(9.1, 1.3)],
      camera: [
        [0, { at: 'b7', dist: 8.6, height: 5.6, yaw: 16 }],
        [1.9, { at: [-0.5, 0.3, 0.8], dist: 7.2, height: 10, yaw: 6 }],
        ...TOP_HOLD(2.6, 4.9),
        [5.8, { at: 'c7', dist: 7.6, height: 4.4, yaw: 24 }],
        [8.6, { at: 'b7', dist: 8.0, height: 4.6, yaw: 10 }],
        [15.4, { at: 'b7', dist: 9.0, height: 5.2, yaw: -6 }],
      ],
    }),
  ],
  overlays: [
    { from: 0.05, to: 2.4, style: 'hook', text: 'One knight.', y: 470 },
    { from: 0.7, to: 2.4, style: 'hook', text: 'Two targets.', y: 640 },
    { from: 2.6, to: 5.0, style: 'title', kicker: 'White to play', text: 'Find the fork', y: 1390 },
    PAUSE(3.2, 5.0, 2),
    { from: 5.2, to: 7.4, style: 'big', text: '1. Nxc7+', sub: 'check, and the queen hangs', y: 1390 },
    { from: 7.6, to: 8.8, style: 'big', text: '1... Ke7', sub: 'the king has to move', y: 1390 },
    { from: 9.0, to: 12.2, style: 'big', text: '2. Nxa8', sub: 'the queen is gone', y: 1390 },
    { from: 12.8, to: 15.4, style: 'cta', text: '100 fork puzzles, easiest first' },
  ],
  cover: { t: 3.8, kicker: 'Puzzle · find the fork', text: 'One knight. Two targets.' },
  caption: `One knight, two targets 🐴 Found it before the answer?

1.Nxc7+ checks the king and hits the queen on a8 at the same time. The king has to move, and 2.Nxa8 takes the queen.

The Forks world: one piece, two targets, 100 puzzles from easy to hard.

${WORLDS}

Puzzle: Lichess (CC0).

Play free, link in bio 👆

${PUZZLE_TAGS} #chessfork`,
  alt: 'A 3D chess puzzle in a gold-lit room. The black queen moves to a8. Seen from above, the text says White to play, find the fork. The white knight jumps to c7, taking a pawn with check while attacking the queen; the king steps to e7 and the knight takes the queen on a8.',
  music: { root: 77.78, mood: 'bright' },
};

// 08 — Pins & Skewers: the rook that cannot move
const PIN: Reel = {
  id: '08-pin',
  title: 'Black took your queen. Big mistake. (Pins & Skewers)',
  goal: 'comments, saves; the Pins & Skewers world',
  takes: [
    puzzleTake({
      name: 'pin',
      mood: mood('pins'),
      fen: 'r1b2rk1/pppp1Qpp/8/8/2B5/5P2/2n2P1P/R3R1K1 b - - 0 17',
      first: 'f8f7',
      moves: [['e1e8', 7.2]],
      dur: 14.6,
      speed: [[0, 1], ...slow(7.3)],
      camera: [
        [0, { at: 'f7', dist: 8.0, height: 4.8, yaw: -20 }],
        [2.6, { at: [0.2, 0.3, 1.2], dist: 7, height: 10, yaw: 6 }],
        ...TOP_HOLD(3.3, 6.8),
        [7.8, { at: 'e7', dist: 8.4, height: 5, yaw: -18 }],
        [14.6, { at: 'e7', dist: 9.2, height: 5.6, yaw: -4 }],
      ],
    }),
  ],
  overlays: [
    { from: 0.1, to: 2.9, style: 'hook', text: 'Black took your queen.', y: 520 },
    { from: 1.1, to: 2.9, style: 'hook', text: 'Big mistake.', y: 760 },
    { from: 3.3, to: 7.0, style: 'title', kicker: 'White to play', text: 'Mate in 1', y: 1390 },
    { from: 4.8, to: 7.0, style: 'label', kicker: 'Hint', text: 'One black piece is stuck', y: 360 },
    { from: 7.2, to: 11.4, style: 'big', text: '1. Re8#', sub: "the f7 rook is pinned, it can't block", y: 1390 },
    { from: 12.0, to: 14.6, style: 'cta', text: '100 pins and skewers, easiest first' },
  ],
  cover: { t: 4.4, kicker: 'Puzzle · mate in 1', text: 'Black took your queen. Big mistake.' },
  caption: `Black took your queen. Big mistake 📌

1.Re8# The rook on f7 would block on f8, but it can't move: the bishop on c4 pins it to its king.

The Pins & Skewers world: pin pieces to their king and skewer what stands behind, 100 puzzles from easy to hard.

${WORLDS}

Puzzle: Lichess (CC0).

Play free, link in bio 👆

${PUZZLE_TAGS} #chesspin`,
  alt: 'A 3D chess puzzle in a blue-lit room. A black rook captures the white queen on f7. Seen from above, the text says White to play, mate in 1, with the hint that one black piece is stuck. The white rook slides to e8: checkmate, because the black rook on f7 is pinned by the bishop on c4.',
  music: { root: 65.41, mood: 'dark' },
};

// 09 — Sacrifices: give up the queen, then mate
const SACRIFICE: Reel = {
  id: '09-sacrifice',
  title: 'Give up your queen. Then mate. (Sacrifices)',
  goal: 'shares, saves; the Sacrifices world and its finishing reward',
  takes: [
    puzzleTake({
      name: 'sacrifice',
      mood: mood('sacrifices'),
      fen: 'rn4k1/ppq3pp/3b1n2/3p2N1/6b1/2N1Q3/PPP2PPP/R3RK2 b - - 6 16',
      first: 'd6h2',
      moves: [['e3e8', 6.6], ['f6e8', 8.6], ['e1e8', 10.6]],
      dur: 17.0,
      speed: [[0, 1], ...slow(8.7, 1.1), ...slow(10.7)],
      camera: [
        [0, { at: 'g2', dist: 8.0, height: 5.0, yaw: 24 }],
        [2.6, { at: [0.2, 0.3, 1.2], dist: 7, height: 10, yaw: 6 }],
        ...TOP_HOLD(3.3, 6.2),
        [7.2, { at: 'e6', dist: 9.0, height: 5.6, yaw: -22 }],
        [10.4, { at: 'e7', dist: 8.4, height: 5.0, yaw: -10 }],
        [17.0, { at: 'e7', dist: 9.0, height: 5.6, yaw: 6 }],
      ],
    }),
  ],
  overlays: [
    { from: 0.1, to: 2.9, style: 'hook', text: 'Give up your queen.', y: 520 },
    { from: 1.0, to: 2.9, style: 'hook', text: 'Then mate.', y: 760 },
    { from: 3.3, to: 6.4, style: 'title', kicker: 'White to play', text: 'Mate in 2', y: 1390 },
    PAUSE(4.6, 6.4),
    { from: 6.6, to: 8.4, style: 'big', text: '1. Qe8+!', sub: 'straight into the knight', y: 1390 },
    { from: 8.6, to: 10.4, style: 'big', text: '1... Nxe8', sub: 'the only move', y: 1390 },
    { from: 10.6, to: 13.8, style: 'big', text: '2. Rxe8#', sub: 'checkmate', y: 1390 },
    { from: 14.4, to: 17.0, style: 'cta', text: 'Finish a world, win a shop item' },
  ],
  cover: { t: 4.4, kicker: 'Puzzle · mate in 2', text: 'Give up your queen. Then mate.' },
  caption: `Give up your queen, then mate 👑 Would you have played it?

1.Qe8+! Black has only one move, 2...Nxe8, and the e-file opens for the rook: 2.Rxe8#.

The Sacrifices world: give material away to win something bigger. Solve all 100 and you win a random item from the shop.

${WORLDS}

Puzzle: Lichess (CC0).

Play free, link in bio 👆

${PUZZLE_TAGS} #chesssacrifice`,
  alt: 'A 3D chess puzzle in a violet-lit room. A black bishop takes the pawn on h2. Seen from above, the text says White to play, mate in 2. The white queen goes to e8 with check, the black knight takes it, and the white rook takes the knight on e8: checkmate.',
  music: { root: 61.74, mood: 'dark' },
};

// 10 — Endgames: the pawn race
const ENDGAME: Reel = {
  id: '10-endgame-race',
  title: 'Can a pawn still win? (Endgames)',
  goal: 'comments, saves; the Endgames world, coins for solving',
  takes: [
    puzzleTake({
      name: 'race',
      mood: mood('endgames'),
      fen: '6R1/7K/5P2/p5r1/5kp1/8/8/8 b - - 9 48',
      first: 'g5g8',
      moves: [['h7g8', 6.6], ['g4g3', 8.0], ['f6f7', 9.0], ['g3g2', 10.0], ['f7f8q', 11.0]],
      dur: 17.6,
      speed: [[0, 1], ...slow(11.1, 1.4)],
      camera: [
        [0, { at: 'g7', dist: 7.5, height: 4.6, yaw: -24 }],
        [2.6, { at: [0.2, 0.3, 1.2], dist: 7, height: 10, yaw: 6 }],
        ...TOP_HOLD(3.3, 6.2),
        [7.2, { at: 'f5', dist: 9.0, height: 9.0, yaw: -20 }],
        [10.6, { at: 'f8', dist: 7.0, height: 4.2, yaw: -20 }],
        [17.6, { at: 'f8', dist: 7.8, height: 4.8, yaw: -6 }],
      ],
    }),
  ],
  overlays: [
    { from: 0.1, to: 2.9, style: 'hook', text: 'Your rook is gone.', y: 520 },
    { from: 1.0, to: 2.9, style: 'hook', text: 'Can a pawn still win?', y: 800 },
    { from: 3.3, to: 6.4, style: 'title', kicker: 'White to play', text: 'Win the race', y: 1390 },
    PAUSE(4.6, 6.4),
    { from: 6.6, to: 8.6, style: 'big', text: '1. Kxg8', sub: 'take the rook back', y: 1390 },
    { from: 9.0, to: 10.8, style: 'big', text: '2. f7', sub: 'both pawns run', y: 1390 },
    { from: 11.0, to: 14.4, style: 'big', text: '3. f8=Q+', sub: 'first to queen, with check', y: 1390 },
    { from: 15.0, to: 17.6, style: 'cta', text: 'Coins for every puzzle you solve' },
  ],
  cover: { t: 4.4, kicker: 'Endgame · white to play', text: 'Can a pawn still win?' },
  caption: `Your rook is gone. Can a pawn still win? ♟️

1.Kxg8 g3 2.f7 g2 3.f8=Q+ White queens first, and with check, so Black never gets to.

The Endgames world: few pieces, exact moves. Promote, mate and hold, 100 puzzles from easy to hard.

${WORLDS}

Puzzle: Lichess (CC0).

Play free, link in bio 👆

${PUZZLE_TAGS} #chessendgame`,
  alt: 'A 3D chess endgame in a green-lit room. A black rook takes the white rook on g8. Seen from above, the text says White to play, win the race. The white king takes the rook back, both sides push a pawn, and the white pawn reaches f8 first and becomes a queen with check.',
  music: { root: 82.41, mood: 'bright' },
};

export const REELS: Reel[] = [
  PIECES_FIGHT, PICK_CAPTURE, PUZZLE_REEL, MAKE_IT_YOURS,
  OPENINGS_TRAP, SPEED_ROUND, FORK, PIN, SACRIFICE, ENDGAME,
];

export const reelLength = (r: Reel) => r.takes.reduce((s, t) => s + Math.round(t.dur * FPS), 0) / FPS;
