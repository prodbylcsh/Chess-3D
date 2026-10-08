---
name: verify-in-browser
description: How to run Wizard Chess and check UI or 3D changes in headless Chromium (screenshots, flows, Czech text, the board and its effects). Use after any visible change, before telling the user a UI or game feature works, and whenever you need screenshots of the app.
---

# Verifying Wizard Chess in a browser

Type checks and unit tests don't show layout bugs, untranslated text, broken flows or
3D regressions. Check visible changes in the real app before reporting them as done,
and look at the screenshots yourself (Read the PNG).

## 1. Start the dev server(s)

The container restarts now and then and everything in `/tmp` and every background process
is gone afterwards. Check first, then start if needed.

Accounts are real (Supabase) whenever the build has Supabase settings, and `.env.local`
points at the local stack. So there are two ways to run the app:

| Server | Accounts | Use for |
| --- | --- | --- |
| `:5174`, `VITE_ACCOUNTS=mock` | in the browser, seeded by the harness (`profile: {...}`) | any screen in a given state: coins, items, rank, Czech, phone width, the board |
| `:5173`, plain `vite` | real, on the local stack (local-supabase skill must be running) | sign-up, email links, reset, account settings, onboarding, guest invite games |

```bash
# mock accounts (no Supabase needed)
curl -s -o /dev/null http://127.0.0.1:5174/ || (VITE_ACCOUNTS=mock nohup npx vite --host 127.0.0.1 --port 5174 > /tmp/vite-mock.log 2>&1 &)
# real accounts
curl -s -o /dev/null http://127.0.0.1:5173/ || (nohup npx vite --host 127.0.0.1 --port 5173 > /tmp/vite.log 2>&1 &)
until curl -s -o /dev/null http://127.0.0.1:5174/; do sleep 1; done
```

The harness uses `APP_URL`, by default the mock server `http://127.0.0.1:5174/`. For real
accounts run the script with `APP_URL=http://127.0.0.1:5173/`. Against the real server a
seeded profile is ignored and the app shows the sign-in page.

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
onboarded mock profile, or `null` for signed out; mock server only), `viewport` (use `{width: 390,
height: 844}` for phone), `gl` (software WebGL for the board), `out` (screenshot folder).
Helpers: `go(route)`, `waitFor(sel)`, `click(sel)`, `shot(name)`, `text()`, and for the board
`waitBoard()`, `play(moves)` and `step(seconds)`.

Routes: `/auth`, `/onboarding`, `/play`, `/community`, `/shop`, `/profile`, `/u/<name>`,
`/messages`, `/settings`, `/game/local`, `/game/ai?level=3&color=w`,
`/game/online/<id>`, `/join/<id>` (matchmade games, `/game/match/<id>`, need a match created through the Play hub first).

### Real accounts (`APP_URL=http://127.0.0.1:5173/`, local stack running)

Start signed out (`profile: null`), sign up through the form, then open the emailed link
in the same page (the PKCE verifier lives in that browser's storage):

```js
const verify = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(
  (await (await fetch('http://127.0.0.1:54324/api/v1/message/latest')).json()).HTML)[1].replaceAll('&amp;', '&');
const landing = (await fetch(verify, { redirect: 'manual' })).headers.get('location');
await app.page.goto(landing);   // signed in, on /onboarding
```

For an existing account, create it confirmed with the admin API (service-role key, see
the local-supabase skill) and sign in through the form. An online game needs a second
player: a Node `Online` client (`src/net/online.ts`, `new Online(url, anonKey,
{ storageKey: 'host' })`) can create, join, move and resign.

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

- **Seeded profiles need the mock server** (`:5174`, the harness default). Against real
  accounts the seed is ignored and you land on the sign-in page.
- **After signing out from a page, signing in returns to that page** (the guard
  remembers it), not to `/play`. Wait for the page you expect.
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
- 404 and certificate console errors from fonts and the agent proxy are expected noise,
  and so is one 403 right after deleting an account (the sign-out call for a user that
  no longer exists).
- Result cards and other game endings need `gl: true`: without WebGL the engine never
  plays the ending, so the card never appears.

## What to check

- The flow end to end (e.g. buy → balance changes in the header *and* the sidebar → Use →
  "In use").
- Czech (`lang: 'cs'`): no English left, nothing overflowing or wrapping badly.
- Phone width (390 px): tab bar, toasts not covering content, no horizontal page scroll.
- For the board: the default look is unchanged, plus the new look or effect mid-animation.
