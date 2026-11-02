// Renders the Reels' takes (scripts/promo/reels.ts) from the real game as 1080×1920 frames,
// with the interface hidden, and records which of the game's own sounds play when
// (src/audio/sfx.ts) so build-reels.ts can put them on the soundtrack. The game is not
// changed: the camera is set from outside, the clock is stepped by hand, and the engine's
// unreleased effects are switched on in the page only, as in render-scenes.ts.
//
// Needs the dev server with mock accounts (the dev build exposes window.__chess):
//   VITE_ACCOUNTS=mock npx vite --host 127.0.0.1 --port 5174
// and Playwright (not a project dependency; NODE_PATH may point at an install):
//   node scripts/promo/render-reels.ts [--only 01,03] [--take knight] [--workers 2]
//                                      [--preview] [--force]
// --preview renders every 10th frame at half size into .preview/ (to check the framing).
// Software WebGL takes about 3 s a frame: a 15-second Reel is about 25 minutes.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { FPS, REELS, type Camera, type Reel, type Take } from './reels.ts';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const ONLY = arg('only')?.split(',');
const TAKE = arg('take')?.split(',');
const PREVIEW = flag('preview');
const FORCE = flag('force');
const WORKERS = Number(arg('workers') ?? 2);
export const FRAMES_DIR = 'promo/instagram/reels/.frames';
const OUT = PREVIEW ? 'promo/instagram/reels/.preview' : FRAMES_DIR;

/** World position of a square's centre (8 units wide, White at +z). */
function squareXZ(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(sq[1]) - 1)];
}

function target(c: Camera): [number, number, number] {
  if (typeof c.at !== 'string') return c.at;
  const [x, z] = squareXZ(c.at);
  return [x, 0.5, z];
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** The camera at video time v: its parameters eased between the keys. */
function cameraAt(keys: [number, Camera][], v: number) {
  let i = keys.findIndex(([t]) => t > v);
  if (i < 0) i = keys.length;
  const [t0, a] = keys[Math.max(0, i - 1)];
  const [t1, b] = keys[Math.min(keys.length - 1, i)];
  const k = t1 > t0 ? smooth(Math.min(1, Math.max(0, (v - t0) / (t1 - t0)))) : 0;
  const ta = target(a);
  const tb = target(b);
  const tg = [0, 1, 2].map((j) => mix(ta[j], tb[j], k));
  const yaw = (mix(a.yaw ?? 0, b.yaw ?? 0, k) * Math.PI) / 180;
  const dist = mix(a.dist, b.dist, k);
  const height = mix(a.height, b.height, k);
  return {
    target: tg,
    position: [tg[0] + Math.sin(yaw) * dist, tg[1] + height, tg[2] + Math.cos(yaw) * dist],
    fov: mix(a.fov ?? 38, b.fov ?? 38, k),
  };
}

/** Game speed at video time v (linear between the keys). */
function speedAt(keys: [number, number][] | undefined, v: number): number {
  if (!keys?.length) return 1;
  if (v <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, s1] = keys[i];
    const [t0, s0] = keys[i - 1];
    if (v <= t1) return mix(s0, s1, (v - t0) / (t1 - t0));
  }
  return keys.at(-1)![1];
}

const DB_KEY = 'wizard-chess.mock-db.v1';
const PREFS_KEY = 'wizard-chess.prefs';

function mockDb(take: Take) {
  const id = 'user-promo';
  return {
    version: 1,
    sessionId: id,
    accounts: [{ id, email: 'promo@example.com', provider: 'email', password: 'x' }],
    profiles: {
      [id]: {
        id, username: 'Promo', iconId: 'knight', onboardingStep: 4, onboarded: true, coins: 0, mmr: 1000,
        stats: { wins: 0, losses: 0, draws: 0, winStreak: 0, rankedStreak: 0, bestStreak: 0 },
        loadout: { pieces: 'marble-set', board: 'marble-board', background: 'candlelit-study', moveAnimation: 'glide', destruction: 'shatter', ...take.loadout },
        inventory: [take.loadout?.pieces, take.loadout?.board].filter(Boolean),
        createdAt: new Date().toISOString(), usernameChangedAt: null,
      },
    },
    history: {}, matches: {},
  };
}

type Browser = Awaited<ReturnType<typeof chromium.launch>>;

async function renderTake(browser: Browser, reel: Reel, take: Take): Promise<void> {
  const dir = join(OUT, reel.id, take.name);
  if (!FORCE && !PREVIEW && existsSync(join(dir, 'done.json'))) {
    console.log(`${reel.id}/${take.name}: already rendered`);
    return;
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const started = Date.now();
  // 540×960 CSS px at 2× (the renderer's pixel-ratio cap) → 1080×1920
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: PREVIEW ? 1 : 2 });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`${take.name} pageerror`, e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, p, db]) => {
    localStorage.clear();
    localStorage.setItem(k, db);
    localStorage.setItem(p, JSON.stringify({ language: 'en' }));
  }, [DB_KEY, PREFS_KEY, JSON.stringify(mockDb(take))]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.goto(`${BASE}#/game/local`, { waitUntil: 'domcontentloaded' });

  for (let i = 0; ; i++) {
    const ready = await page.evaluate(async () => {
      const c = (window as any).__chess;
      if (!c) return false;
      c.stage.pause();
      await c.step(0.25, 8);
      return c.game.busy === false;
    });
    if (ready) break;
    if (i > 900) throw new Error(`${take.name}: board never became ready`);
    await page.waitForTimeout(100);
  }
  await page.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });

  const first = cameraAt(take.camera, 0);
  await page.evaluate(async ({ take, first }) => {
    const w = window as any;
    const c = w.__chess;
    if (take.styles) {
      const looks = await import(/* @vite-ignore */ '/src/cosmetics/looks.ts');
      if (take.styles.move) looks.MOVE_STYLES.glide = take.styles.move;
      if (take.styles.destruction) looks.DESTRUCTION_STYLES.shatter = take.styles.destruction;
    }
    // Record the game's sounds instead of playing them (build-reels.ts plays them back).
    const { sfx } = await import(/* @vite-ignore */ '/src/audio/sfx.ts');
    w.__sfxLog = [];
    w.__videoT = 0;
    const skip = new Set(['constructor', 'unlock', 'noiseSource', 'env']);
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(sfx))) {
      if (skip.has(name) || typeof sfx[name] !== 'function') continue;
      sfx[name] = (...args: unknown[]) => void w.__sfxLog.push({ name, args, t: w.__videoT });
    }
    // The board animates resets, so step frames until it is idle (the loop is paused).
    if (take.fen) void c.game.begin(null, [], take.fen);
    if (take.before?.length) void c.game.sync(take.before);
    for (let i = 0; i < 40 && (i < 2 || c.game.busy); i++) await c.step(0.5, 6);
    // Screen shake reads the wall clock: give it the game clock, so it moves with the video.
    w.__sim = 0;
    performance.now = () => w.__sim * 1000;
    const s = c.stage;
    s.controls.autoRotate = false;
    s.camera.fov = first.fov;
    s.camera.position.set(...first.position);
    s.controls.target.set(...first.target);
    s.camera.updateProjectionMatrix();
    s.controls.update();
    await c.step(0.4, 5);
    w.__sfxLog = [];
  }, { take, first });

  // The game clock runs from 0; moves start at their times; frames are taken from simStart.
  const total = Math.round(take.dur * FPS);
  const step = PREVIEW ? 10 : 1;
  await page.evaluate(async ({ take }) => {
    const w = window as any;
    const c = w.__chess;
    const all = [...(take.before ?? [])];
    w.__pending = [...(take.moves ?? [])].sort((a, b) => a.at - b.at);
    w.__played = all;
    w.__due = () => {
      while (w.__pending.length && w.__pending[0].at <= w.__sim + 1e-6) {
        w.__played.push(w.__pending.shift().uci);
        void c.game.sync([...w.__played]);
      }
    };
    // pre-roll to simStart (not filmed)
    const end = take.simStart ?? 0;
    while (w.__sim < end - 1e-6) {
      w.__due();
      const dt = Math.min(1 / 20, end - w.__sim);
      c.stage.frame(dt);
      w.__sim += dt;
      await new Promise((r) => setTimeout(r, 0));
    }
    w.__sfxLog = w.__sfxLog.map((e: any) => ({ ...e, t: 0 }));
  }, { take });

  for (let i = 0; i < total; i++) {
    const v = i / FPS;
    const pose = cameraAt(take.camera, v);
    const dt = speedAt(take.speed, v) / FPS;
    const shoot = i % step === 0;
    const url: string | null = await page.evaluate(async ({ pose, dt, v, shoot }) => {
      const w = window as any;
      const c = w.__chess;
      const s = c.stage;
      w.__videoT = v;
      w.__due();
      s.controls.autoRotate = false;
      s.camera.fov = pose.fov;
      s.camera.position.set(...pose.position);
      s.controls.target.set(...pose.target);
      s.camera.updateProjectionMatrix();
      s.controls.update();
      s.frame(dt);
      w.__sim += dt;
      await new Promise((r) => setTimeout(r, 0)); // let the game's promise chains advance
      return shoot ? s.renderer.domElement.toDataURL('image/jpeg', 0.95) : null;
    }, { pose, dt, v, shoot });
    if (url) writeFileSync(join(dir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    if (i % 30 === 0) console.log(`${reel.id}/${take.name}: frame ${i}/${total}`);
  }

  const sounds = await page.evaluate(() => (window as any).__sfxLog);
  writeFileSync(join(dir, 'done.json'), JSON.stringify({ frames: total, sounds }, null, 1));
  await context.close();
  console.log(`${reel.id}/${take.name}: ${total} frames in ${Math.round((Date.now() - started) / 1000)} s`);
}

const jobs: [Reel, Take][] = [];
for (const reel of REELS) {
  if (ONLY && !ONLY.some((o) => reel.id.startsWith(o))) continue;
  for (const take of reel.takes) if (!TAKE || TAKE.includes(take.name)) jobs.push([reel, take]);
}
// the longest first, so the workers finish together
jobs.sort((a, b) => b[1].dur - a[1].dur);

const chrome = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const launch = () => chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
await Promise.all(Array.from({ length: Math.min(WORKERS, jobs.length) }, async () => {
  const browser = await launch();
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    try {
      await renderTake(browser, ...job);
    } catch (e) {
      console.error(`${job[0].id}/${job[1].name} failed:`, e);
      process.exitCode = 1;
    }
  }
  await browser.close();
}));
if (PREVIEW) for (const reel of REELS) if (existsSync(join(OUT, reel.id))) console.log('preview', join(OUT, reel.id), readdirSync(join(OUT, reel.id)));
