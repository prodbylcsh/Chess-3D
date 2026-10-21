# Handoff: where the work stands (20 October 2026)

Read this, then `CLAUDE.md` (rules, loaded automatically), `docs/PLATFORM.md` (every
product decision; §4.2 is Puzzles) and the skills in `.claude/skills/` before changing
anything. This file is a snapshot. When it and `PLATFORM.md` disagree, `PLATFORM.md`
wins. Update or delete this file when the picture changes.

## The work and what the user wants

Wizard Chess 3D is an online chess platform around a cinematic 3D board. It is live at
https://prodbylcsh.github.io/Chess-3D/ (Supabase project `yhzgrorvjfvbqshneipc`).

The recent sessions were about **Puzzles**. The user wants them fun, interactive, made
with love and genuinely useful, so that players enjoy them and buy more modules.

How the user works:

- **Language.** Writes in Czech, sometimes in English. Answer in the language of the
  last message.
- **Main.** Never push to or merge into `main` without an explicit "yes" each time.
  `main` deploys the site and Supabase. Work on the session's development branch.
- **Product questions.** Ask about undecided product rules with a recommendation; decide
  engineering questions yourself.
- **Explanations.** Texts speak of pieces, not squares ("the pawn beside the king", not
  "f7").
- **Names.** Set and board names (Monolith, Squircle, Classic Marble) are the same in
  every language.
- **Look.** The 3D game look must stay identical unless asked. Puzzle-only visuals
  (rings, arrows) are fine.
- **Secrets.** No secrets in chat or in commits; keys live in GitHub secrets.
- **Personal data.** The operator's birth number must never be published. Only the name
  and address in the legal pages: Lukáš Schöbel, Oty Bubeníčka 1639/8, 104 00 Praha.

## Also merged on 21 October 2026 (the user's yes)

- **Blocking and reporting** (`PLATFORM.md` §4.4): block and report on profiles and in
  chats, the blocked list in Settings, matchmaking keeps blocked players apart; reports for
  the operator in the dashboard view `report_queue`. Migration `20261021090000`. Legal pages
  dated 21 October 2026.

## Merged to `main` on 21 October 2026 (the user's yes)

- **Ranked closed** until there are enough players: "Soon" on the Play hub, the `play`
  function answers `ranked_closed`. One switch, `SEASON_ONE` in `_shared/seasons.ts`
  (`null` now): set it to the current month to open ranked, which also starts **season 1**.
- **No season rewards while ranked is closed**; season 1 starts everyone at 1,000 MMR.
  Migration `20261020120000` moves stored players to season 0. The Shop previews season 1.
  Locally the functions get `SEASON_ONE=2026-07` (start script) so the e2e tests cover ranked.
- **Guests in puzzles**: the first 10 Openings puzzles and the daily puzzle without an
  account; signing up or in on the same device moves them in (`claim`, `src/net/guest.ts`).
  Migration `20261020130000` (retention counts guest puzzles). Legal pages updated.
- **Roadmap** in `PLATFORM.md` §9: blocking and reporting next, then Learn; spectating;
  map decorations wait for the user's assets; measurements and abuse detection (not coin
  caps) after the release; domain, live payments and Sign in with Apple are the user's.

## Done (all merged and live, last `main` commit `a90845c`)

**Openings module** (free): 100 hand-made lines from the first move, 50 as White and
50 as Black, in chapters of ten. They cover main lines from both sides, answers to the
opponent's openings, quick mates, punishing weak openings, gambits and classic traps.

- Every player move was checked with Stockfish.
- Every line has an intro and an explanation per move, in English and Czech.
- Ratings are 400 + 12 per line.

**Help in every puzzle:**

- The coach card shows "Your next move" with its aim (`intent.ts`): protect an attacked
  piece, stop a mate threat, fork, pin, develop, and so on.
- A wrong move gets a Stockfish "why not?" (`whyNot.ts`): the opponent's refutation is
  played with a red arrow, then taken back. A move as good as the puzzle's is **not** a
  mistake: "A good move too!"
- After a miss, a free green ring marks the target square. After three misses in a row
  the piece is shown too, and that counts as one hint.
- Hints cost up to 10 coins: two per move, first the piece, then the square.
- Arrows: the hint, the opponent's moves, refutations.
- "Replay the solution" on the result card.
- Real stuck detection (`stuck.ts`) offers the solution. The puzzle then counts as
  "seen": no coins or stars, the next one opens, and a later review pays it.

**Reviews:** stars of a replayed puzzle improve only 20 h after the last attempt. A
replay before that is practice, so players can't re-solve from fresh memory. The module
map has a "Review (n)" button.

**Daily puzzle and streak:** one puzzle per UTC day, from any module, easier on Monday.

- 40 coins a day.
- Streak milestones: 3 → 100, 7 → 300, 14 → 600, 30 → 1,500, 50 → 2,500, 100 → 5,000,
  200 → 10,000, 365 → 25,000 + an item, 500 → 40,000, 1000 → 100,000 + an item, then
  10,000 every 100 days.
- Six flame tiers (Spark … Starfire), each animating more intensely, with an ever
  bigger celebration. The amounts are decided by the user.

**Vibration** (`src/audio/haptics.ts`, switch in Settings):

- Every piece has its own feel; the opponent's moves are softer.
- Taking a piece is a rewarding hit; losing one is a dull buzz.
- Check, mate and the puzzles have their own patterns.

**Earlier this month:**

- Puzzles v1 and v2: 7 modules, a 3D world map with a hopping piece, briefing and coach.
- The R2 model pipeline (GitHub Action `models.yml` pulls originals from R2).
- The Squircle set (common, 25,000).
- The knight facing fix.

**Legal pages** (EN and CS) describe the reviews, the daily puzzle, the streak and the
stored data. They are dated 20 October 2026.

## Remaining (nothing is half-done in the code)

1. **3D map decorations:** the user finds the background objects amateurish. **The user
   makes the new assets and sends them later**; wait for them
   (`src/features/puzzles/map/World.ts`, `themes.ts`).
2. **Puzzles later:** a puzzle subscription, more themes (fantasy).
3. **Payments:** live payments need the own domain and the Paddle review (sandbox works).
4. **Roadmap:** Learn module, tournaments, more sets, boards and effects.
5. **Open question:** which language comes after Czech?
6. **Unverified on real devices:**
   - iPhone haptics through Safari's switch trick. Apple may have closed it in iOS 26.5+.
   - The "why not?" timing on a slow phone.

## Decisions and why

- **Openings is fully hand-made.** The Lichess "opening" puzzles were random middlegame
  positions with pawns missing, and the user wanted the real start of the game.
- **Openings is the free module; First Steps costs 100,000.** Players who had started
  First Steps keep it (migration `20261015170000`).
- **The next move's aim is computed, not hand-written.** It works for all 700 puzzles
  and never names a square or gives the move away.
- **A good alternative move is no mistake** (the user's decision). Only an engine verdict
  of "about as good" (loss under 40 cp, or both winning big) counts as alternative.
- **Reviews wait 20 h.** The user worried about re-solving from memory for 3 stars.
  Every finished attempt restarts the wait.
- **No solution at a fixed "N misses".** The user asked for real stuck detection.
  Mistakes, hints and every 40 s on a move add up; 5 points, never in the first minute.
- **The daily day is UTC**, the same for everyone. In Czechia it changes at 1:00 or
  2:00 at night.
- **Haptics design:** own moves stronger, rising patterns for good news, flat for bad,
  frequent events subtle.

## Failed approaches: don't repeat

- **Lichess `opening`-theme puzzles** as an Openings module: they aren't openings.
- **Prettier without config** turns quotes into double quotes. Use
  `--single-quote --print-width 160`, or don't run it on generated files.
- **Node tests importing app modules** that use directory imports (`src/i18n`,
  `src/app/prefs`) fail. Keep tested modules pure, with explicit `.ts` imports. That is
  why `lessons.ts` has a local `tk` and `haptics.enabled` is set by `prefs.ts`.
- **`workflow_dispatch`** only works once the workflow is on `main`. On branches,
  `models.yml` runs on a commit of `scripts/assets/request.json`. It ignores `main` so
  it doesn't run again after a merge.
- **R2 "folder" marker objects** caused EEXIST in pull-originals. Keys ending in `/` are
  skipped.
- **Network:** this container can't reach github.io, lichess.org or Cloudflare. Use the
  GitHub Actions (`puzzles.yml`, `models.yml`, deploys) and the GitHub MCP tools for run
  status.
- **`pkill -f <script>` in a background shell** kills that shell too.
- **Headless browser with `gl: true`:** software rendering eats the CPU.
  - Stockfish then takes about 70 s instead of 0.2 s. Check engine-dependent puzzle
    behaviour with `gl: false`.
  - Long GL screenshots time out. Run GL checks in the background.
  - The mock dev server on :5174 dies now and then: restart it
    (`VITE_ACCOUNTS=mock nohup npx vite --host 127.0.0.1 --port 5174 &`).
  - The harness's `app.step()` only works on game pages, not on the module map.
- **Stockfish npm package in Node:** it crashes if commands come before `uciok` and a
  `setoption`.
- **chess.js** rejects a FEN where the side not to move is in check. Build test
  positions carefully.

## Important files

**Puzzle rules, shared by app and server:**

- `supabase/functions/_shared/puzzles.ts`: modules, coins, hints, review, the daily
  puzzle, the streak.
- Data: `supabase/functions/_shared/puzzle-data/*.json`.
- Hand-made lines: `scripts/puzzles/curated.ts`. Rebuild with
  `printf 'h\n' | MODULES=openings node scripts/puzzles/build.ts`.

**Server:**

- `supabase/functions/puzzles/index.ts`: progress, start, solve, unlock, reveal, daily,
  daily_start, daily_solve.
- Migrations `20261015090000_puzzles.sql` and `20261020090000_puzzles_review_daily.sql`.

**Play:**

- `src/features/game/modes/puzzle.ts`: mode logic.
- `PuzzleCoach.tsx`, `ResultCard.tsx`, `store.ts` (`PuzzleView`).

**Puzzle helpers (pure, tested):** `src/features/puzzles/` `intent.ts`, `whyNot.ts`,
`stuck.ts`, `review.ts`. Plus:

- `brief.ts` and `describe.ts`: goal and intro texts.
- `lessons.ts`: per-move lessons. Edit it by hand; its generator lived in a scratchpad
  and is gone.
- `streak.tsx` and `streak.css`.
- `ModulePage.tsx`, `PuzzlesPage.tsx`, `map/World.ts`.

**Engine:**

- `src/game/Game.ts`: `guide`, `arrows`, `hold`, `suggest`, haptics hooks.
- `src/game/BoardView.ts`: Guide marker, arrows.
- `src/ai/stockfish.ts`: `search` with searchmoves.

**Mock back-end:** `src/api/mock/puzzles.ts`, `db.ts`. **API types:** `src/api/types.ts`.

**Haptics and settings:** `src/audio/haptics.ts`, `src/app/prefs.ts`,
`src/features/settings/SettingsPage.tsx`.

**Text, tests, docs:**

- `src/i18n/cs.ts`, synced with `node .claude/skills/i18n/scripts/sync.ts [file.json]`.
- `tests/puzzles.test.ts`, `tests/puzzles-v3.test.ts`, `tests/puzzles.e2e.ts`.
- `docs/PLATFORM.md` §4.2 (Puzzles), §7 (vibration), §9–10.
- `public/legal/` (EN and CS).

## Tests and results (20 October 2026)

- `npx tsc --noEmit`: clean. `npx vite build`: OK.
- `npm test`: **97 pass**. Rules, rating, shop, i18n, AI, puzzles (incl. the 100 opening
  lines, lessons without square names, intents, why-not, stuck, review, streak,
  haptics).
- `npm run test:e2e` against local Supabase: **40 pass**, puzzles 7/7 (reveal, review
  timing, daily puzzle and streak milestones included).
- Browser checks, mock, Czech, desktop and phone:
  - Daily card with tiers.
  - Daily solve with the 7-day milestone.
  - The refutation with mate.
  - Review button.
  - Stuck → reveal → replay.
  - Recorded vibration patterns.
  - "A good move too" with `gl: false`.
  - "Your next move".
- Deploy workflows on `main` all succeeded. The live database itself wasn't queried
  after the review/daily migration.

**Known issues:**

- The stuck timer counts in 1 s ticks and slows when the browser throttles a busy tab.
- When the engine answer takes over 6 s (only very slow devices), a good alternative
  counts as a mistake.
- The knight on the module map is seen from behind in some camera angles (cosmetic, not
  confirmed as a bug).

## Next steps

1. Build Learn (plan and prices decided, `PLATFORM.md` §4.3). The user wants the platform to make money
   (`PLATFORM.md` §1 "Earning money").
2. On a real iPhone and an Android phone, check the vibration and the "why not?" speed.
   If iOS gives no tick, say so and keep the switch.
3. When adding opening lines, check them with Stockfish and add lessons:
   - Extend `curated.ts` (unique goal names: the id is a slug of the goal).
   - Add lessons for each player move to `lessons.ts`, with Czech in `cs.ts`.
   - Add the goals to `PUZZLE_GOALS` in `modules.ts`.
   - Rebuild `openings.json`.
4. Before any merge: `npx tsc --noEmit`, `npm test`. When `supabase/`, `src/net/` or
   `src/api/supabase/` change, also `npm run test:e2e` (local-supabase skill). Then ask
   the user.
