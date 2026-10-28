// Renders the 3D shots for the Instagram posts from the real game (docs/marketing/,
// promo/instagram/). Each scene sets up a position, picks the items, plays one move and
// takes frames of it at given moments, with the interface hidden. The game itself is not
// changed: the engine's unreleased effects (comet, embers, …) are switched on in the page
// only, the way a future shop item would.
//
// Needs the dev server with mock accounts (the dev build exposes window.__chess):
//   VITE_ACCOUNTS=mock npx vite --host 127.0.0.1 --port 5174
// and Playwright (not a project dependency; NODE_PATH may point at an install):
//   node scripts/promo/render-scenes.ts [--only name,name] [--scale 1.333] [--out dir]
// Software WebGL is slow: about a minute per frame at 1080×1440.
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg('out') ?? 'promo/instagram/renders';
const SCALE = Number(arg('scale') ?? 4 / 3); // 810×1080 CSS px → 1080×1440
const ONLY = arg('only')?.split(',');
/** simulation steps per second before a frame (fewer is faster; effects need ~15) */
const FPS = Number(arg('fps') ?? 15);

interface Loadout {
  pieces?: string;
  board?: string;
  moveAnimation?: string;
  destruction?: string;
}

interface Camera {
  /** square or [x, y, z] the camera looks at */
  at: string | [number, number, number];
  dist: number;
  height: number;
  /** degrees around the board; 0 = from White's side, 90 = from the h-file */
  yaw?: number;
  fov?: number;
}

interface Scene {
  /** another game screen than the local board, e.g. a lesson */
  route?: string;
  /** a phone screenshot with the interface visible (no camera set-up) */
  ui?: boolean;
  loadout?: Loadout;
  /** engine styles switched on in the page for this scene */
  styles?: { move?: string; destruction?: string };
  fen?: string;
  /** moves played instantly before the shot (UCI) */
  before?: string[];
  /** the move that is animated (UCI); none = a still of the position */
  move?: string;
  /** seconds after the move starts → frame name suffix */
  frames: Record<string, number>;
  camera?: Camera;
}

// Opera Game, Morphy vs the Duke of Brunswick and Count Isouard, Paris 1858.
const OPERA = 'e2e4 e7e5 g1f3 d7d6 d2d4 c8g4 d4e5 g4f3 d1f3 d6e5 f1c4 g8f6 f3b3 d8e7 b1c3 c7c6 c1g5 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 a8d8 d1d7 d8d7 h1d1 e7e6 b5d7 f6d7 b3b8 d7b8 d1d8'.split(' ');
/** The Opera Game up to (not including) ply `n`, then ply `n` animated. */
const opera = (n: number, frames: Record<string, number>, camera: Camera): Scene => ({
  before: OPERA.slice(0, n),
  move: OPERA[n],
  frames,
  camera,
});
const WIDE: Camera = { at: [0, 0.2, 0.4], dist: 12.5, height: 10.5 };
const KNIGHT_TAKES = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
const FX_CAMERA: Camera = { at: [0.5, 0.9, -0.5], dist: 6.6, height: 2.6, yaw: 30 };
const MONO: Loadout = { pieces: 'monolith-set', board: 'monolith-board' };

const SCENES: Record<string, Scene> = {
  // --- post 1: chess, but the pieces fight (knight takes on e5, queen mates on f7)
  'knight-leap': {
    before: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
    move: 'f3e5',
    frames: { air: 1.1, slam: 1.2 },
    camera: { at: [0.5, 1.9, -0.5], dist: 9.5, height: 1.6, yaw: 30 },
  },
  'queen-spell': {
    before: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'],
    move: 'h5f7',
    frames: { bolt: 1.0, blast: 1.5, mate: 3.6 },
    camera: { at: [2.4, 1.3, -1.6], dist: 8.6, height: 2.8, yaw: -32 },
  },
  'opening-wide': { frames: { still: 0 }, camera: WIDE },
  'opening-low': { frames: { still: 0 }, camera: { at: [0, 0.6, 1.2], dist: 7.5, height: 2.4, yaw: 14 } },

  // --- post 3: make it yours (sets, board, effects)
  'set-marble': { before: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], frames: { still: 0 }, camera: { at: [0.5, 0.6, 1.8], dist: 6, height: 2.6, yaw: -18 } },
  'set-squircle': { loadout: { pieces: 'squircle-set' }, before: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], frames: { still: 0 }, camera: { at: [0.5, 0.6, 1.8], dist: 6, height: 2.6, yaw: -18 } },
  'set-monolith': { loadout: { pieces: 'monolith-set' }, before: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], frames: { still: 0 }, camera: { at: [0.5, 0.6, 1.8], dist: 6, height: 2.6, yaw: -18 } },
  'board-monolith': { loadout: MONO, before: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'], frames: { still: 0 }, camera: { at: [0, 0, 0.3], dist: 11, height: 9, yaw: 32 } },
  'fx-embers': { styles: { destruction: 'embers' }, before: KNIGHT_TAKES, move: 'f3e5', frames: { hit: 1.25 }, camera: FX_CAMERA },
  'fx-frostbite': { styles: { destruction: 'frostbite' }, before: KNIGHT_TAKES, move: 'f3e5', frames: { hit: 1.25 }, camera: FX_CAMERA },
  'fx-implode': { styles: { destruction: 'implode' }, before: KNIGHT_TAKES, move: 'f3e5', frames: { hit: 1.25 }, camera: FX_CAMERA },
  'fx-shatter': { before: KNIGHT_TAKES, move: 'f3e5', frames: { hit: 1.25 }, camera: FX_CAMERA },
  'move-comet': { styles: { move: 'comet' }, loadout: MONO, before: ['e2e4', 'e7e5'], move: 'd1h5', frames: { mid: 0.35 }, camera: { at: [1.6, 1.2, 1.6], dist: 9, height: 4, yaw: 28 } },
  'move-levitate': { styles: { move: 'levitate' }, before: ['e2e4', 'e7e5'], move: 'g1f3', frames: { mid: 0.35 }, camera: { at: [2, 1.7, 2.6], dist: 7, height: 1.4, yaw: 30 } },

  // --- post 4: mate in two (Lichess puzzle jqG75, CC0): Black has just taken the queen
  'puzzle-mate2': {
    fen: 'rn4k1/p4ppp/b7/3P4/4qBn1/7P/PP2QPP1/2R1KB1R b K - 1 20',
    move: 'a6e2',
    frames: { taken: 5 },
    camera: { at: [0, 0, 0.6], dist: 7.2, height: 13.5 },
  },
  'puzzle-mate2-mate': {
    fen: 'rnR1q1k1/p4ppp/8/3P4/5Bn1/7P/PP2bPP1/4KB1R w K - 2 22',
    move: 'c8e8',
    frames: { mate: 4.2 },
    camera: { at: [1.5, 0.5, -3.2], dist: 7.6, height: 4.6, yaw: 4 },
  },

  // --- post 6: the Opera Game in frames
  'opera-start': { frames: { still: 0 }, camera: { at: [0, 0.4, 0], dist: 9.5, height: 6, yaw: -24 } },
  'opera-02-philidor': opera(3, { done: 2.2 }, WIDE),
  'opera-03-pin': opera(5, { done: 2.2 }, { at: 'f3', dist: 7, height: 5, yaw: 30 }),
  'opera-04-bxf3': opera(7, { bolt: 1.0, blast: 1.5 }, { at: 'f3', dist: 5.6, height: 3.2, yaw: 40 }),
  'opera-05-qxf3': opera(8, { bolt: 1.0, blast: 1.5 }, { at: 'f3', dist: 5.6, height: 3.2, yaw: 40 }),
  'opera-06-bc4': opera(10, { done: 2.2 }, { at: 'e6', dist: 8, height: 6.5, yaw: 25 }),
  'opera-07-qb3': opera(12, { done: 2.2 }, { at: 'c5', dist: 8, height: 6.5, yaw: -30 }),
  'opera-08-nc3': opera(14, { done: 2.2 }, WIDE),
  'opera-09-bg5': opera(16, { done: 2.2 }, { at: 'f6', dist: 7.5, height: 5.5, yaw: 35 }),
  'opera-10-nxb5': opera(18, { slam: 1.22 }, { at: 'b5', dist: 5.6, height: 3, yaw: -35 }),
  'opera-11-bxb5': opera(20, { bolt: 1.0, blast: 1.5 }, { at: 'b5', dist: 5.6, height: 3.2, yaw: -40 }),
  'opera-12-castle': opera(22, { done: 2.6 }, { at: 'c1', dist: 6.5, height: 4.2, yaw: -30 }),
  'opera-13-rxd7': opera(24, { slam: 1.22 }, { at: 'd7', dist: 5.8, height: 3.2, yaw: -25 }),
  'opera-14-rd1': opera(26, { done: 2.2 }, { at: 'd4', dist: 8.5, height: 6.5, yaw: -18 }),
  'opera-15-bxd7': opera(28, { bolt: 1.0, blast: 1.5 }, { at: 'd7', dist: 5.6, height: 3.2, yaw: 30 }),
  'opera-16-qb8': opera(30, { done: 2.2 }, { at: 'c7', dist: 6.5, height: 4.5, yaw: -40 }),
  'opera-17-nxb8': opera(31, { slam: 1.22 }, { at: 'b8', dist: 5.4, height: 3, yaw: -35 }),
  // --- post 5: a lesson as players see it on a phone
  'ui-learn': { route: '/game/learn/board', ui: true, frames: { still: 4 } },

  'opera-18-rd8': opera(32, { slide: 0.5, mate: 3.6 }, { at: 'd8', dist: 6.2, height: 4.2, yaw: -20 }),
};

/** World position of a square's centre (8 units wide, White at +z). */
function squareXZ(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(sq[1]) - 1)];
}

function cameraPose(c: Camera) {
  let [tx, ty, tz] = typeof c.at === 'string' ? [0, 0.5, 0] : c.at;
  if (typeof c.at === 'string') [tx, tz] = squareXZ(c.at);
  const yaw = ((c.yaw ?? 0) * Math.PI) / 180;
  return {
    target: [tx, ty, tz],
    position: [tx + Math.sin(yaw) * c.dist, ty + c.height, tz + Math.cos(yaw) * c.dist],
    fov: c.fov ?? 38,
  };
}

const DB_KEY = 'wizard-chess.mock-db.v1';
const PREFS_KEY = 'wizard-chess.prefs';

function mockDb(loadout: Loadout) {
  const id = 'user-promo';
  return {
    version: 1,
    sessionId: id,
    accounts: [{ id, email: 'promo@example.com', provider: 'email', password: 'x' }],
    profiles: {
      [id]: {
        id, username: 'Promo', iconId: 'knight', onboardingStep: 4, onboarded: true, coins: 0, mmr: 1000,
        stats: { wins: 0, losses: 0, draws: 0, winStreak: 0, rankedStreak: 0, bestStreak: 0 },
        loadout: { pieces: 'marble-set', board: 'marble-board', background: 'candlelit-study', moveAnimation: 'glide', destruction: 'shatter', ...loadout },
        inventory: ['monolith-set', 'squircle-set', 'monolith-board'],
        createdAt: new Date().toISOString(), usernameChangedAt: null,
      },
    },
    history: {}, matches: {},
  };
}

mkdirSync(OUT, { recursive: true });
const chrome = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

for (const [name, scene] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) continue;
  const started = Date.now();
  const context = await browser.newContext(
    scene.ui
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }
      : { viewport: { width: 810, height: 1080 }, deviceScaleFactor: SCALE },
  );
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, p, db]) => {
    localStorage.clear();
    localStorage.setItem(k, db);
    localStorage.setItem(p, JSON.stringify({ language: 'en' }));
  }, [DB_KEY, PREFS_KEY, JSON.stringify(mockDb(scene.loadout ?? {}))]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.goto(`${BASE}#${scene.route ?? '/game/local'}`, { waitUntil: 'domcontentloaded' });

  // Wait for the engine, pause its loop and step it by hand.
  for (let i = 0; ; i++) {
    const ready = await page.evaluate(async (ui) => {
      const c = (window as any).__chess;
      if (!c) return false;
      c.stage.pause();
      await c.step(0.25, 8);
      return ui || c.game.busy === false;
    }, !!scene.ui);
    if (ready) break;
    if (i > 900) throw new Error(`${name}: board never became ready`);
    await page.waitForTimeout(100);
  }

  if (scene.styles) {
    await page.evaluate(async (styles) => {
      const looks = await import(/* @vite-ignore */ '/src/cosmetics/looks.ts');
      if (styles.move) looks.MOVE_STYLES.glide = styles.move;
      if (styles.destruction) looks.DESTRUCTION_STYLES.shatter = styles.destruction;
    }, scene.styles);
  }

  const pose = scene.camera ? cameraPose(scene.camera) : null;
  if (pose) await page.evaluate(async ({ scene, pose }) => {
    const c = (window as any).__chess;
    // The board animates resets, so step frames until it is idle (the loop is paused).
    if (scene.fen) void c.game.begin(null, [], scene.fen);
    if (scene.before?.length) void c.game.sync(scene.before);
    for (let i = 0; i < 40 && (i < 2 || c.game.busy); i++) await c.step(0.5, 6);
    const s = c.stage;
    s.camera.fov = pose.fov;
    s.camera.position.set(...pose.position);
    s.controls.target.set(...pose.target);
    s.camera.updateProjectionMatrix();
    s.controls.update();
    await c.step(0.6, 5);
  }, { scene, pose });
  if (!scene.ui) await page.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });
  else await page.addStyleTag({ content: '*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' });

  let clock = 0;
  // --frames from:to:step replaces the scene's frames (for finding the right moments)
  const sweep = arg('frames')?.split(':').map(Number);
  const timeline = sweep
    ? Object.fromEntries(Array.from({ length: Math.round((sweep[1] - sweep[0]) / sweep[2]) + 1 }, (_, i) => {
        const t = +(sweep[0] + i * sweep[2]).toFixed(2);
        return [`t${t.toFixed(2)}`, t];
      }))
    : scene.frames;
  const frames = Object.entries(timeline).sort((a, b) => a[1] - b[1]);
  if (scene.move) {
    await page.evaluate((list) => void (window as any).__chess.game.sync(list), [...(scene.before ?? []), scene.move]);
  }
  for (const [frame, at] of frames) {
    if (at > clock) await page.evaluate(([s, fps]) => (window as any).__chess.step(s, fps), [at - clock, FPS]);
    clock = at;
    const file = join(OUT, `${name}-${frame}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92, timeout: 300000 });
    console.log('wrote', file);
  }
  await context.close();
  console.log(`${name}: ${Math.round((Date.now() - started) / 1000)} s`);
}
await browser.close();
