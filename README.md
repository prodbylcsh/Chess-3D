# Wizard Chess 3D

An online chess platform built around a cinematic 3D board with "wizard chess" style
animations: pieces glide across the board, hop over anything in their way, and destroy each
other with physics-driven shattering.

The platform plan (modules, ranked MMR, coins, shop, architecture, roadmap) lives in
**[docs/PLATFORM.md](docs/PLATFORM.md)**.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle in dist/
npm test         # rules, rating/coin and AI unit tests
```

## What's in the app today (milestone 1)

- **Accounts**: sign in / sign up with email and password, Apple or Google, and a 4-step
  onboarding (username with live availability check, one of six profile icons).
- **Sidebar** with the eight modules; Puzzles and Learn are marked "Soon", Community, Shop,
  Profile, Messages and Settings show what is coming in the next milestones.
- **Play hub**: Ranked (with your rank emblem and division progress), Casual, Play a friend
  (friends list, invite link, same device), Play vs AI (5 levels), Play for coins (3 stakes),
  Tournaments ("Soon").
- **Redesigned game screen** around the unchanged 3D board: player cards with rank and
  captures, move list, actions, promotion picker, invite card, and a result screen with the
  MMR change and its breakdown, rank progress, coins and accuracy.

Accounts, friends, matchmaking and results currently run on an **in-browser mock back-end**
(`src/api/mock`, data in localStorage) that applies the real MMR and coin rules. Matchmade
opponents are played by the AI and marked "Demo". Invite-link games are fully online already
(Supabase). See the roadmap in docs/PLATFORM.md for the back-end milestones.

## Controls

| Input | Action |
| --- | --- |
| Click a piece, then a glowing square | Move |
| Left-drag / Right-drag / Wheel | Orbit / Pan / Zoom |
| `F` | Flip the view to the other side |
| `U` or `Ctrl+Z` | Undo (same-device games) |
| `Esc` | Deselect |

## Online games by invite link

In **Play → Play a friend → Create an invite link**, pick a colour and send the link to a friend. The game
starts when they open it. Online games support resigning, draw offers, rematches (colours swap),
spectators (anyone who opens a full game's link), presence (a dot shows whether your opponent
is connected) and resuming after a reload: the link always brings you back to your game.

Players sign in anonymously behind the scenes, so nobody needs an account. The backend is
[Supabase](https://supabase.com):

- **Postgres** table `games` (`supabase/migrations/`). Row-level security lets signed-in users
  *read* games but never write them.
- **Edge Function** `game` (`supabase/functions/game/`). Every write (create, join, move, resign,
  draw, rematch) goes through it. It replays the game with chess.js and rejects illegal moves,
  moves out of turn, and players who aren't seated in the game. Writes are conditional on a
  `version` column, so concurrent requests can't both apply.
- **Realtime**: both players subscribe to their game row and see each other's moves at once.
  Moves are shown immediately and rolled back if the server refuses them.

The "Play online" button only appears when the build has `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (see `.env.example`). Both are public values.

### Local backend

```bash
npx supabase start                # needs Docker
npx supabase functions serve      # in a second terminal
cp .env.example .env.local        # fill in the API URL and anon key from `npx supabase status`
npm run dev
npm test                          # rules unit tests
SUPABASE_ANON_KEY=... npm run test:e2e   # two players over the network, against the local stack
```

### Hosted backend

1. Create a project at supabase.com, then turn on **Authentication → Sign In / Providers →
   Allow anonymous sign-ins**.
2. Add the repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`, and the
   variable `SUPABASE_PROJECT_ID`. The workflow `.github/workflows/supabase.yml` then applies
   migrations and deploys the function whenever `supabase/` changes (or when run by hand).
3. Put the project URL and anon key in `.env.production` so the Pages build includes them.

## Tech

- **[Three.js](https://threejs.org) r186**: WebGL renderer, PBR materials, soft shadows, an HDR
  post-processing chain (MSAA, then Unreal bloom, then ACES tone mapping), and OrbitControls.
- **[chess.js](https://github.com/jhlywa/chess.js)**: the rules engine, used for legal move generation,
  check, checkmate, stalemate, castling, en passant, promotion, threefold repetition,
  the fifty-move rule and insufficient material.
- The piece and board model is `public/models/chess-set.glb`.
- Sound is synthesised at runtime with the Web Audio API, so there are no audio files.

## Animations

| Situation | What happens |
| --- | --- |
| Quiet move | The piece leans into the motion and glides. It arcs over any piece in its path, and knights always jump. |
| Pawn / King captures | **Melee**: the attacker approaches, winds up and smashes the victim. |
| Rook / Knight captures | **Crush**: the attacker leaps high and slams down, sending out a shockwave. |
| Bishop / Queen captures | **Spell**: the attacker charges magic and fires a bolt. The victim levitates, cracks with light, then explodes. |
| Castling | The king slides and the rook vaults over it. |
| Promotion | A vortex dissolves the pawn and the new piece materialises. |
| Checkmate | The king trembles, topples and bursts apart in slow motion. |

Destruction works by breaking the victim mesh into Voronoi-style shards: its triangles are
clustered around random seeds, biased towards the impact point. Solid rubble chunks are added,
and everything is simulated against the board, the table and the remaining pieces. The debris
then burns away with a noise-based dissolve shader that has glowing edges. Impacts trigger
slow motion, camera shake, sparks, dust and a light flash.

## Code map

```
src/
  app/        App (routes, guards), session state, sidebar layout
  features/   auth, onboarding, play (hub, matchmaking, sheets), game (game screen, modes,
              result card, join page), placeholders for upcoming modules
  api/        typed service contracts (types.ts) and the in-browser mock back-end (mock/)
  ui/         design-system components (kit.tsx), profile icons and rank emblems (art/)
  ai/         chess engine for Play vs AI: 0x88 board, alpha-beta search, Web Worker
  net/        Supabase client for online games
  core/       layout (square <-> world), Animator (single game clock, tweens, bullet time)
  scene/      Stage (renderer, camera, lights, post-processing), GLB loading
  fx/         particles, effects (sparks, dust, shockwave, bolt), shatter physics, dissolve shader
  game/       Piece, BoardView, Choreographer (move animations), Game (controller), GameUi contract
  audio/      procedural sound effects
supabase/
  migrations/         games table, row-level security, realtime
  functions/game/     Edge Function that validates and applies every online action
  functions/_shared/  pure rules shared by the app, the server and the tests:
                      game rules, MMR/ranks (rating.ts), coins (economy.ts)
docs/PLATFORM.md      the platform concept and roadmap
tests/                unit tests (rules, rating, AI) and an end-to-end online test
```

In dev builds, `window.__chess.step(seconds)` advances the game clock without
`requestAnimationFrame`, which is handy for testing animations in a background tab.
