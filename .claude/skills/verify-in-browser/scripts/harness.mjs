// Playwright helpers for checking Wizard Chess in headless Chromium.
// Import from a script run in a directory where `playwright` is installed:
//
//   import { open } from '/path/to/repo/.claude/skills/verify-in-browser/scripts/harness.mjs';
//   const app = await open({ lang: 'cs', profile: { coins: 50000 } });
//   await app.go('/shop'); await app.waitFor('.shop-card'); await app.shot('shop');
//   await app.close();
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const { chromium } = createRequire(`${process.cwd()}/`)('playwright');

// mock accounts by default (VITE_ACCOUNTS=mock on :5174); real accounts: APP_URL=http://127.0.0.1:5173/
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const DB_KEY = 'wizard-chess.mock-db.v1';
const PREFS_KEY = 'wizard-chess.prefs';

/** A signed-in, onboarded mock account; override any profile field. Works only against a
 *  server with mock accounts (VITE_ACCOUNTS=mock), see the skill. */
export function mockDb(profile = {}) {
  const id = 'user-test';
  return {
    version: 1,
    sessionId: id,
    accounts: [{ id, email: 't@example.com', provider: 'email', password: 'x' }],
    profiles: {
      [id]: {
        id,
        username: 'Tester',
        iconId: 'rook',
        onboardingStep: 4,
        onboarded: true,
        coins: 500,
        mmr: 1000,
        stats: { wins: 0, losses: 0, draws: 0, winStreak: 0, rankedStreak: 0, bestStreak: 0 },
        loadout: { pieces: 'marble-set', board: 'marble-board', background: 'candlelit-study', moveAnimation: 'glide', destruction: 'shatter' },
        inventory: [],
        createdAt: new Date().toISOString(),
        usernameChangedAt: null,
        ...profile,
      },
    },
    history: {},
    matches: {},
  };
}

/**
 * Open the app. `profile: null` starts signed out with an empty database.
 * `gl: true` enables software WebGL (needed for the 3D board; slow).
 */
export async function open({ lang = 'en', profile = {}, viewport = { width: 1300, height: 860 }, gl = false, out = '/tmp/shots' } = {}) {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: gl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
  });
  const context = await browser.newContext({ viewport });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && !/ERR_FAILED|404|CERT/.test(m.text()) && console.log('console', m.text().slice(0, 300)));

  // Seed storage, then reload: the app keeps its database in memory, and hash
  // navigation alone does not reload it.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([dbKey, prefsKey, db, lang]) => {
      localStorage.clear();
      if (db) localStorage.setItem(dbKey, JSON.stringify(db));
      localStorage.setItem(prefsKey, JSON.stringify({ language: lang }));
    },
    [DB_KEY, PREFS_KEY, profile === null ? null : mockDb(profile), lang],
  );
  await page.reload({ waitUntil: 'domcontentloaded' });

  const app = {
    page,
    /** Navigate to a route (hash router), e.g. '/shop'. */
    async go(route) {
      await page.goto(`${BASE}#${route}`, { waitUntil: 'domcontentloaded' });
    },
    waitFor: (selector, timeout = 15000) => page.waitForSelector(selector, { timeout }),
    click: (selector) => page.locator(selector).first().click(),
    /** Screenshot with CSS animations frozen (headless captures lag behind animations). */
    async shot(name) {
      await page.addStyleTag({ content: '*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' });
      await page.waitForTimeout(300);
      const path = `${out}/${name}.png`;
      await page.screenshot({ path, timeout: 120000 });
      console.log('shot', path);
      return path;
    },
    /** Visible text of the page, e.g. to look for untranslated English. */
    text: () => page.locator('body').innerText(),

    // ---------------------------------------------------------------- 3D board (needs gl: true)

    /**
     * Wait until a game screen's engine is loaded and idle. Pauses the render loop
     * and advances it by hand: continuous software rendering makes screenshots time out.
     */
    async waitBoard() {
      for (let i = 0; i < 600; i++) {
        const ready = await page.evaluate(async () => {
          const c = window.__chess;
          if (!c) return false;
          c.stage.pause();
          await c.step(0.25, 8);
          return !!document.querySelector('.gs-panel') && c.game.busy === false;
        });
        if (ready) return;
        await page.waitForTimeout(100);
      }
      throw new Error('board never became ready');
    },
    /** Advance the 3D simulation by `seconds` (dev builds only). */
    step: (seconds, fps = 20) => page.evaluate(([s, f]) => window.__chess.step(s, f), [seconds, fps]),
    /**
     * Play moves on the board. Moves are from-to squares ("e2e4"), NOT SAN.
     * Each move but the last is played to completion.
     */
    async play(moves, settle = 3) {
      const list = [];
      for (const [i, move] of moves.entries()) {
        list.push(move);
        await page.evaluate((l) => void window.__chess.game.sync(l), [...list]);
        if (i < moves.length - 1) await app.step(settle, 10);
      }
    },
    close: () => browser.close(),
  };
  return app;
}
