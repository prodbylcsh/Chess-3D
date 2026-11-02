// The Instagram Reels (docs/marketing/README.md "Reels"): what each one shows, shot by shot,
// and the text laid over it. `render-reels.ts` renders the takes from the real game as
// frames; `build-reels.ts` adds the text, the game's own sounds and a music bed and writes
// promo/instagram/reels/<reel>/reel.mp4 with cover.jpg and caption.md.
//
// Times: a take's `dur` and every `t` are seconds of video (30 fps). `speed` keys are how
// fast the game runs at that video time (1 = real time, 0.3 = slow motion), linear between
// keys. Moves are played at game (simulation) times; `simStart` is how far into the take's
// game clock the first frame is.

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
      dur: 8.6,
      // the bolt in slow motion, then on to the checkmate scene, which then lingers
      speed: [[0, 1], [0.45, 1], [0.6, 0.32], [2.6, 0.32], [2.9, 1.25], [4.6, 1.25], [5.0, 0.55]],
      camera: [
        [0, queenCam(-38, 9.2)],
        [3.0, queenCam(-24, 8.4)],
        [8.6, queenCam(-6, 10.5, 4.2)],
      ],
    },
  ],
  overlays: [
    { from: 0.05, to: 2.2, style: 'hook', text: 'Chess,', y: 520 },
    { from: 0.6, to: 2.2, style: 'hook', text: 'but the pieces fight.', y: 700 },
    { from: 2.6, to: 6.0, style: 'label', kicker: 'The knight', text: 'leaps and slams down', y: 1330 },
    { from: 6.7, to: 9.4, style: 'label', kicker: 'The queen', text: 'casts a spell', y: 1330 },
    { from: 9.6, to: 11.6, style: 'big', text: 'Checkmate.', y: 560 },
    { from: 11.8, to: 15.0, style: 'cta', text: 'Chess where the pieces really fight' },
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
    { ...capture('implode', { pieces: 'aurum-set', board: 'zlata-board' }, 'implode', 30), dur: 5.6,
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
4️⃣ Implode, Aurum on Zlata

Every capture effect, piece set and board shows in every game you play, and your opponent sees it too. Earn coins by playing, spend them in the shop.

Play free, link in bio 👆

#chess #3dchess #chessgame #gaming #indiegame`,
  alt: 'Four slow-motion clips of the same 3D chess capture, a knight taking a pawn: the pawn shatters on a marble board, burns to embers on the black Monolith set, freezes and cracks on the Frost glass set, and implodes on the gold Aurum set. Labels 1 to 4 ask which one you would pick.',
  music: { root: 82.41, mood: 'bright' },
};

// ------------------------------------------------------------------ 03: mate in two

const TOP: Camera = { at: [0, 0, 1.4], dist: 5.2, height: 15.5, yaw: 0, fov: 40 };
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
        [6.0, { ...TOP, dist: 4.6, height: 14.5 }],
        [7.2, { at: [-1, 0.6, -1], dist: 8.5, height: 6.5, yaw: -24 }],
        [10.9, { at: [0.5, 0.8, -2.6], dist: 7.4, height: 4.4, yaw: -8 }],
        [17.2, { at: [1.2, 0.8, -3], dist: 8.6, height: 5.4, yaw: 10 }],
      ],
    },
  ],
  overlays: [
    { from: 0.1, to: 2.9, style: 'hook', text: 'Black just took your queen.', y: 560 },
    { from: 3.3, to: 6.0, style: 'title', kicker: 'White to play', text: 'Mate in 2', y: 1390 },
    { from: 4.6, to: 6.0, style: 'label', kicker: 'Pause now', text: 'Answer in 3 seconds', y: 330 },
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
  ['Aurum', { pieces: 'aurum-set', board: 'zlata-board' }, 'common'],
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

Classic Marble · Squircle · Monolith · Aurum · Frost · Hallow · Dismorph · Medenka

29 piece sets and 13 boards, each one a real 3D model. Your opponent sees your set in every game. Earn coins by playing, or pick them up in the shop.

Play free, link in bio 👆

#chess #chessset #3dchess #chessboard #indiegame`,
  alt: 'The camera circles a 3D chessboard in one continuous move while the pieces and board change every second: Classic Marble, Squircle on maple, the black Monolith set, gold Aurum, frosted glass Frost, Hallow on concrete, Dismorph on a lagoon-blue board, and copper Medenka. Text: make the board yours, 29 piece sets, 13 boards.',
  music: { root: 87.31, mood: 'bright' },
};

export const REELS: Reel[] = [PIECES_FIGHT, PICK_CAPTURE, PUZZLE_REEL, MAKE_IT_YOURS];

export const FPS = 30;
export const reelLength = (r: Reel) => r.takes.reduce((s, t) => s + Math.round(t.dur * FPS), 0) / FPS;
