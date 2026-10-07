---
name: verify-in-browser
description: How to run Wizard Chess and check UI or 3D changes in headless Chromium (screenshots, flows, Czech text, the board and its effects). Use after any visible change, before telling the user a UI or game feature works, and whenever you need screenshots of the app.
---

# Verifying Wizard Chess in a browser

Type checks and unit tests don't show layout bugs, untranslated text, broken flows or
3D regressions. Check visible changes in the real app before reporting them as done,
and look at the screenshots yourself (Read the PNG).

## 1. Start the dev server

The container restarts now and then and everything in `/tmp` and every background process
is gone afterwards. Check first, then start if needed:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/ || true
(nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/vite.log 2>&1 &)
until curl -s -o /dev/null http://127.0.0.1:5173/; do sleep 1; done
```

## 2. Install Playwright in a scratch directory (once per container)

Chromium is preinstalled at `/opt/pw-browsers/chromium`; never run `playwright install`.

```bash
mkdir -p /tmp/pw && cd /tmp/pw && [ -d node_modules/playwright ] || \
  (npm init -y >/dev/null && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright >/dev/null)
```

## 3. Write a short script that uses the harness

Run it **from `/tmp/pw`** (the harness resolves `playwright` from the working directory).

```js
// /tmp/pw/check.mjs
import { open } from '/home/user/Chess-3D/.claude/skills/verify-in-browser/scripts/harness.mjs';

const app = await open({ lang: 'cs', profile: { coins: 50000, inventory: ['frost-set'] }, out: '/tmp/shots' });
await app.go('/shop');
await app.waitFor('.shop-card');
await app.shot('shop-cs');
await app.close();
```

`open()` options: `lang` ('en' | 'cs'), `profile` (fields merged into a signed-in,
onboarded mock profile, or `null` for signed out), `viewport` (use `{width: 390,
height: 844}` for phone), `gl` (software WebGL for the board), `out` (screenshot folder).
Helpers: `go(route)`, `waitFor(sel)`, `click(sel)`, `shot(name)`, `text()`, and for the board
`waitBoard()`, `play(moves)` and `step(seconds)`.

Routes: `/auth`, `/onboarding`, `/play`, `/community`, `/shop`, `/profile`, `/u/<name>`,
`/messages`, `/settings`, `/game/local`, `/game/ai?level=3&color=w`,
`/game/online/<id>`, `/join/<id>` (matchmade games, `/game/match/<id>`, need a match created through the Play hub first).

### The 3D board

```js
const app = await open({ gl: true, viewport: { width: 1000, height: 640 },
  profile: { loadout: { pieces: 'ember-set', board: 'royal-board', background: 'volcanic-forge', moveAnimation: 'comet', destruction: 'embers' } } });
await app.go('/game/local');
await app.waitBoard();
await app.play(['e2e4', 'd7d5', 'e4d5']);   // from-to squares, not SAN ("exd5" fails)
for (const t of [0.55, 0.3, 0.3, 0.45]) { await app.step(t); await app.shot(`capture-${t}`); }
```

Software WebGL is slow: a run takes minutes. Start it with `run_in_background` and wait
for the notification instead of polling.

## Pitfalls that cost time before

- **Seeding storage needs a reload.** The app keeps its mock database in memory, and hash
  navigation doesn't reload the page. The harness seeds and then reloads. If you write
  your own script, do the same, or the app overwrites your seed.
- **Don't edit source files while a long run is going.** Vite hot-reloads the page and the
  run breaks halfway. Finish your edits first, then run the check.
- **Screenshots of a running WebGL canvas time out.** Pause the stage and step frames
  yourself, as `waitBoard()` and `step()` do. Freeze CSS animations before UI screenshots,
  as `shot()` does.
- **Selectors with English text fail in Czech runs.** Use classes or `nth()`.
- **Never `pkill -f <pattern>` with a pattern that also matches your own shell command.**
  That kills the shell (exit 144). Use `pgrep -f "node check[.]mjs"` (the brackets stop the
  pattern matching itself) and kill those PIDs.
- Foreground `sleep` is blocked in this environment. Wait with `until …; do sleep 1; done`
  in a background command, or with Monitor.
- 404 and certificate console errors from fonts and the agent proxy are expected noise.

## What to check

- The flow end to end (e.g. buy → balance changes in the header *and* the sidebar → Use →
  "In use").
- Czech (`lang: 'cs'`): no English left, nothing overflowing or wrapping badly.
- Phone width (390 px): tab bar, toasts not covering content, no horizontal page scroll.
- For the board: the default look is unchanged, plus the new look or effect mid-animation.
