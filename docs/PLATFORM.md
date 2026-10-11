# Wizard Chess: platform concept

This document is the single source of truth for what the platform is going to be.
It records the product vision, the rules of every system (ranked MMR, coins, cosmetics)
and the plan for building it. When a decision changes, change it here.

Status legend used below: ✅ built · 🟡 front-end built on mock data, needs back-end · 🔜 planned · ⏸ disabled ("Coming soon")

---

## 1. Vision

Wizard Chess is an online chess platform whose games are played on the cinematic 3D board
this project already has: pieces glide, leap and smash each other, with shattering, magic
bolts and slow motion. Around that board we build a modern, stylish platform: accounts,
ranked play with leagues, friends and messages, a coin economy and a cosmetics shop.

Principles:

- **The 3D game stays as it is.** Graphics, animations and effects are not changed by the
  platform work. Only the interface around them (menus, buttons, panels) is redesigned.
- **Simple, modern, stylish.** Dark, calm surfaces, one warm gold accent and a violet
  secondary, the Cinzel display font for headings, Inter for everything else. Few elements
  per screen, generous spacing, clear hierarchy, motion only where it helps.
- **Fair competition.** Everything that affects rank or coins is decided on the server.
  The client only displays.
- **Cosmetics only.** Coins buy looks, never an advantage.

## 2. Accounts and onboarding

Registration is required to play online. Sign-up options:

| Method | Notes |
| --- | --- |
| Email + password | Email verification link; password reset by email. |
| Sign in with Apple | Required by Apple if the app ever ships on iOS with other social logins. |
| Sign in with Google | One-tap where available. |

All three are provided by Supabase Auth. A guest can still open an invite link and play
that one game as a guest (current behaviour); they are invited to register afterwards.

### Onboarding (after the first sign-in)

A short wizard with a progress bar at the top. Steps:

1. **Welcome**: one line about the game, "Let's set up your profile".
2. **Username**: 3–20 characters, letters, digits and `_`, unique (checked live while typing,
   case-insensitive). This is the public name used everywhere.
3. **Profile icon**: pick one of 6 chess icons (King, Queen, Rook, Bishop, Knight, Pawn).
   No photo uploads. More icons can be bought in the Shop.
4. **Done**: summary card (icon, username, starting rank, starting coins) and "Start playing".

The wizard can be resumed if it is closed half way. Both the username and the icon can be
changed later (the username once per 30 days).

### How accounts work (M4)

- **Email + password:** signing up sends a confirmation link; the account works once the
  link is opened. The link brings the player back to the app already signed in (in the same
  browser; opened elsewhere it confirms the address and asks them to sign in). Unconfirmed
  sign-ins get "confirm your email first" with a "send the link again" button.
- **Password reset:** "Forgot password?" emails a link that opens a "Choose a new password"
  screen. Links work once and expire after an hour; an expired or reused link says so.
- **Apple and Google:** the buttons send players to the provider and back. Until a provider
  is set up on the server, its button shows "Soon" and is disabled.
- **Emails** (confirmation, reset, email change) come in the player's language: the app
  stores the interface language on the account (`user_metadata.language`) at sign-up and
  whenever it changes, and the templates (`supabase/templates/`) pick English or Czech.
- **Email change** (Settings) waits for the confirmation links sent to the old and the new
  address; **password change** needs the current password; **deleting** the account needs
  the username typed exactly and removes the profile with it.
- **Usernames:** 3–20 characters, letters, digits and `_`, unique regardless of case, and a
  few names are reserved (admin, support, guest, wizardbot, …). The demo players' names
  count as taken too.
- **Guests** (invite links) play under an anonymous session and have no profile. Their
  result card invites them to create a free account. Registered players use their account
  for online games.
- **Everything a player owns is on the server** (M6): coins, rank, stats, items, loadout,
  game history, friends and messages. The app copies the player's state into its local
  store, which the screens read. Other players see a player's rank, stats and items
  through the **showcase** (`profiles.showcase`), which the server writes after every
  game, purchase and equip; MMR itself never leaves the server.

## 3. Layout and navigation

A left sidebar lists the modules. On phones it becomes a bottom tab bar with the main
modules and a "More" sheet.

| Module | Status | Purpose |
| --- | --- | --- |
| Play | 🟡 | Start games in every mode. |
| Puzzles | ⏸ | Roadmap of 100 puzzle levels. |
| Learn | ⏸ | Tutorials: basics, tactics, openings. |
| Community | 🟡 | Find players, friend requests, view profiles. |
| Shop | 🔜 | Spend coins on cosmetics. |
| Profile | 🟡 | Rank, history, awards, equipped cosmetics. |
| Messages | 🟡 | Chat with friends. |
| Settings | 🟡 | Language, email, password, sound. |

Modules marked 🔜 currently show a placeholder page listing their planned features.

The top of the sidebar shows the logo; the bottom shows the signed-in player (icon,
username, rank) and the coin balance.

## 4. Modules

### 4.1 Play

| Mode | Status | Description |
| --- | --- | --- |
| Casual | ✅ (M6) | Matchmaking against any online player. Pays coins, no MMR. |
| Ranked | ✅ (M6) | Matchmaking against players of similar MMR. Changes MMR and pays coins. |
| Tournaments | ⏸ | Coin entry fee, brackets. Later. |
| Play a friend | 🟡 | Invite from the friends list (🟡 demo list), play on one device (✅), or create a link anyone can open (✅ live online). |
| Play vs AI | ✅ | Built-in engine with difficulty levels, runs in the browser. No MMR, no coins. |
| Play for coins | ✅ (M6) | Both players stake the same amount; the winner takes the pot minus a fee. |

**Time controls (decided).** The cinematic captures take 1–3 seconds to play out, so
very fast games (bullet) don't suit this game. The clock of the player to move only starts
once the opponent's move has finished animating on the server-agreed duration, so animations
never cost anyone time.

| Control | Name | Where |
| --- | --- | --- |
| 5 + 3 | Blitz | Ranked, Casual, Play for coins |
| 10 + 5 | Rapid | Ranked, Casual, Play for coins (default) |
| 15 + 10 | Classical | Ranked, Casual, Play for coins, friends |
| 3 + 2 | Fast blitz | Casual only |
| No clock | Unlimited | Friends, vs AI, same device |

"10 + 5" means 10 minutes per player plus 5 seconds added after every move. Ranked uses one
ladder (one MMR) for Blitz, Rapid and Classical at first; separate ladders per control can be added
later if players ask for them. Running out of time loses the game, unless the opponent has
no material that can still checkmate (then it's a draw), as in standard chess rules.
Clocks are kept by the server (M6, `_shared/play.ts`); the client only displays them and
tells the server when a clock shows zero (either player may; the server checks). The next
player's time starts after the previous move's animation: 3 s after a capture, 2.5 s after
castling or a promotion, 1.5 s otherwise. The players pick the time control on the Play
hub (remembered on the device); Rapid is the default.

**First move:** each player has 30 seconds for their first move, and no clock runs before
it. If a player doesn't move in time, the game is **aborted**: no MMR, no coins, stakes
refunded (decided October 2026). A move sent after the clock ran out ends the game on time
instead.

**Matchmaking (ranked):** start with a ±100 MMR window and widen it by 50 every 5 seconds
of waiting, up to ±400. Casual uses one queue with no rating window (it still prefers
close ratings when several players are waiting). Leaving a running game counts as a loss.
When nobody fits, the search keeps going: it shows how many players are online and
offers a game against the AI while waiting (which pays nothing, as decided).

### 4.2 Puzzles ⏸

A roadmap of 100 levels, easiest to hardest, with progress saved to the account. A puzzle
puts the player in a position (a mid-game scenario or a forced line) where the opponent's
replies are pre-programmed. Later: more packs and community-made puzzles.

### 4.3 Learn ⏸

Interactive tutorials: rules and basics, then tactics, openings and advanced ideas.

### 4.4 Community

Search players by username, send/accept/decline friend requests, view any profile.
Everything on a profile is public (see 4.6). Friends can be messaged or challenged
directly; a challenge creates an online game and posts it as a card in the chat. A side
panel suggests players near your rank. Pending requests show as a badge on Community.

On the server (M5): requests, accepting (a request back accepts too), declining,
cancelling and removing go through the `social` function; up to 500 friends and 50
requests waiting. Suggestions are the newest players you don't know yet (online first)
until ranks are on the server. Who is online comes from realtime presence. New requests
and accepted requests arrive as toasts and the Community badge. Message and Challenge
buttons show only for friends.

### 4.5 Shop

Coins earned by playing are spent here. Categories:

| Category | Applies to | Who sees it |
| --- | --- | --- |
| Piece sets | your pieces | both players (each side shows its owner's set) |
| Boards | the board | both players; if the two players' boards differ, one is picked at random for the game |
| Backgrounds | the scene behind the board | both players; random pick like boards |
| Move animations | how your pieces move | both players (per side) |
| Destruction effects | how your captures look | both players (per side) |
| Profile icons | your avatar | everyone |

Owned items can be equipped ("Used") from the Shop or from the Profile ("In use" → your
items). Piece sets and boards have a **3D view** in their item dialog (Shop and Profile →
your items): pick a piece and a colour, drag to rotate, scroll or pinch to zoom,
right-drag or two fingers to move (`src/features/shop/ModelViewer.tsx`, loaded only when
opened). The shop lists only categories with something to buy; the others hold just
their standard item until real items arrive. Later: real-money coin packs and temporary
coin boosts (e.g. +50% coins for 24 h).

Price ranges per category (enforced by `tests/shop.test.ts`):

| Item | Coins |
| --- | --- |
| Profile icon | 1,500 – 3,000 |
| Background | 5,000 – 12,000 |
| Move animation / destruction effect | 8,000 – 20,000 |
| Board | 10,000 – 45,000 |
| Piece set | 15,000 – 70,000 |

(Raised in October 2026 for the first real, premium set: about 70% above the most
expensive placeholder set, 40,000 → 68,000; the board follows the same rule, 25,000 →
42,500.)

At roughly 10 games a day this means a new icon every 2–3 days and a piece set every few
weeks, which keeps the shop meaningful without feeling out of reach.

**Catalogue.** Every category has one free standard item that everyone owns; profile
icons have six free starters. Piece sets and boards are separate items (a set never
includes a board).

| Category | Items (price, rarity) |
| --- | --- |
| Piece sets | Classic Marble (free) · **Monolith** 68,000 legendary (own models; Black as delivered, White recoloured to ivory marble) |
| Boards | Classic Marble (free) · **Monolith** 42,500 legendary (own model: graphite oak and black squares on a chrome hull) |
| Backgrounds | Candlelit Study (free) |
| Move animations | Glide (free) |
| Destruction effects | Shatter (free) |
| Profile icons | 6 starters (free) · Ember Rook / Frost Knight 1,500 · Jade Bishop / Storm Pawn 2,000 · Void Queen 2,500 · Sun King 3,000 |

The first catalogue (M3) had placeholder sets, boards, backgrounds and effects that
recoloured the classic set; they were taken out of the shop when the first real models
arrived (October 2026, nobody owned any). Their ids are kept as retired
(`RETIRED_ITEMS` in `_shared/shop.ts`) and must never be reused. The engine still has
the extra move and capture animations (levitate, blink, comet, embers, frostbite,
implode) for future items.

Season reward icons ("Season 2 · Gold & Platinum") are icons too, but are never for sale.

**In games.** Each side shows its owner's piece set (light or dark variant by colour), move
animation and destruction effect. Board and background come from one of the two players;
when they differ, the pick is random but derived from the game id, so both players see
the same. Same-device games use your items for both sides; AI opponents use the standard
items; matchmade opponents (and demo opponents) show their own items, read from their
public profile. Online friend games show your items on your side and the standard set for
the opponent.

**Assets.** Real items are 3D models under `public/assets/`, served with the site:

```
public/assets/
  pieces/<set>/<king…pawn>-<white|black>.glb       the board (≈6k triangles each)
  pieces/<set>/<king…pawn>-<white|black>-hd.glb    the 3D view (≈24k triangles)
  boards/<board>/board.glb                          8×8 grid = 8 units, top at the classic board's height
  shop/<item-id>.webp                               shop card picture, 16:10 (PREVIEW_IMAGES)
  backgrounds/, effects/, animations/               future items, same idea
```

**Storage on Cloudflare R2 (October 2026).** Two buckets:
`wizard-chess-assets` (public; the files above, same paths without the `assets/` prefix;
the app reads them from `VITE_ASSETS_URL`, the bucket's public URL, and falls back to
`public/assets/` on the site when it is not set) and `wizard-chess-originals` (private;
the user's original models and pictures per item, so they are never lost).
`scripts/assets/r2.ts` uploads (`push-assets`, `push-originals`), downloads
(`pull-originals`) and sets CORS; it needs an R2 API token in the environment
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, GitHub Actions secrets; the
Claude cloud environment cannot reach Cloudflare). The Pages deploy runs `r2.ts publish`
(upload changed files, CORS, check that the live site can load a model) and builds with
`VITE_ASSETS_URL` only when that passes, otherwise the site serves `public/assets/` itself;
`.github/workflows/assets.yml` runs the same by hand from any branch. The built files stay
in git (`public/assets/`, the source of each upload); the originals are uploaded to the
originals bucket in the Cloudflare dashboard. The Privacy Policy names Cloudflare.

The originals the user delivers (large: 4K textures, up to 450k triangles) are not in
git; they go to `assets-src/<item>/` locally (and to the originals bucket) and `scripts/assets/build-models.ts` turns
them into the files above: base at y = 0, size on the board (one square = one unit; each
piece's height is set per set), simplified meshes, WebP textures, meshopt-compressed
geometry, and the missing colour of a piece set (non-metal parts recoloured, chrome kept).
A look in `src/cosmetics/looks.ts` points at the folder (`model: { dir }` for sets,
`model: { file }` for boards); the engine loads it when a game uses the item and falls
back to the classic set if loading fails. A model board keeps its playing surface at the classic
board's height and the table drops to the board's foot (`layout.floorY`), so a board on
a pedestal (Monolith) stands on it; only the depth of the Monolith board is stretched,
so its squares are square like the game's grid. Delivery format: one GLB per piece
(`king.glb` … `pawn.glb`) plus `chessboard.glb` for a board, in either colour, any scale;
the shop-items skill has the steps. Placeholder looks (recolours of the classic set)
still work for items without models.

Move animations and destruction effects are code (`src/game/Choreographer.ts`); new ones
need a short description or reference video.

### 4.6 Profile

Shows (to the owner and to everyone else): icon, username, rank emblem and division,
win/loss/draw record, current win streak, game history (opponent, result, mode, MMR change
visible only to the owner), awards, and the equipped cosmetics. The owner can change the
icon and equip owned items here. MMR itself is never shown, only the rank.

Awards (first ideas): first win, 10/100/1000 wins, win streaks of 5/10, reach each tier,
a game with 90%+ accuracy, checkmate in under 20 moves.

### 4.7 Messages

One-to-one chats with friends: conversation list, unread badges, game invites inside
the chat.

On the server (M5): only friends can start a conversation or write; after unfriending,
the history stays readable. Messages up to 1,000 characters, at most 20 a minute.
Conversations and messages are visible only to the two players (row-level security) and
are deleted with either account. New messages arrive through realtime (toast and badge).
"Play a friend" and Challenge send the invite as a chat card.

### 4.8 Settings

Language, change email, change password, sound and music, board preferences
(auto-rotate camera), sign out, delete account.

## 5. Ranked: MMR and ranks

The implementation is `supabase/functions/_shared/rating.ts` (tested in
`tests/rating.test.ts`). The constants at the top of that file are the tuning knobs.

### 5.1 Basics

- Everyone starts at **1,000 MMR**. The lowest possible MMR is **0**, the highest **1,000,000**.
- Players never see their MMR, only their **rank**, and after each ranked game how much
  MMR they gained or lost (e.g. "+23").

### 5.2 How a game changes MMR

```
win:   +20  + difference + performance + streak     (always at least +3)
loss:  −18  + difference + performance              (always at least −3)
draw:    0  + difference/2 + performance/2
```

**Difference.** 10% of the rating gap, in the direction that rewards upsets:

- beat a stronger player: you gain extra (gap 100 → +10)
- beat a weaker player: you gain less (gap 100 → −10)
- lose to a stronger player: you lose less (gap 100 → 10 fewer points lost)
- lose to a weaker player: you lose more (gap 100 → 10 more points lost)

Caps keep extreme gaps sane: an upset moves at most **30** extra points, an expected
result is reduced by at most **15** points. Without caps a single game between 1,000 and
5,000 MMR players would move 400 points, and an expected win could become negative.

**Performance.** Up to **±20% of the baseline** (±4 points on a win, ±3.6 on a loss),
scaled smoothly by how well you played. Each move is judged by an engine: how much it
lowered your winning chances compared with the best move. That gives an **accuracy**
from 0 to 100 for the game (the same model lichess uses). The performance factor is:

| Accuracy | Factor | Effect on a win | Effect on a loss |
| --- | --- | --- | --- |
| 100% | +1 | +4 | lose 3.6 less |
| 85% | +0.5 | +2 | lose 1.8 less |
| 70% | 0 | 0 | 0 |
| 35% | −0.5 | −2 | lose 1.8 more |
| 0% | −1 | −4 | lose 3.6 more |

70% accuracy is "neutral" because that is roughly typical club-level play; with 50% as
neutral nearly everyone would get a bonus and ratings would inflate.

**Win streak.** Ranked wins in a row. The 3rd consecutive win gives **+10%** of the
baseline (+2), each further win **+2%** more (4th: +12%, 5th: +14%, …), capped at **+30%**
(the 13th win and beyond). A loss resets the streak. A draw neither extends nor breaks it.

### 5.3 Worked examples (exact output of the code)

Player at 1,000 MMR; "average play" is 70% accuracy. Coins are for a ranked game.

| Situation | Base | Difference | Performance | Streak | MMR | Coins |
| --- | --- | --- | --- | --- | --- | --- |
| Win vs equal, average play | 20 | +0 | +0 | 0 | **+20** | 100 |
| Win vs +100 stronger, average play | 20 | +10 | +0 | 0 | **+30** | 110 |
| Win vs 100 weaker, great play (92%) | 20 | −10 | +3 | 0 | **+13** | 105 |
| Loss vs 100 stronger, good play (85%) | −18 | +10 | +2 | 0 | **−6** | 60 |
| Loss vs 150 weaker, poor play (45%) | −18 | −15 | −1 | 0 | **−34** | 38 |
| 4th win in a row vs equal, 80% | 20 | +0 | +1 | +2 | **+23** | 119 |
| Draw vs 200 stronger, 75% | 0 | +10 | +0 | 0 | **+10** | 93 |

The spec's own example (0 MMR beats a 100 MMR player) gives 20 + 10 = **+30**.

### 5.4 Ranks

Each tier below Master has four divisions (IV is the lowest, I the highest) of 100 MMR.
A new player (1,000 MMR) starts in **Silver II**.

| Tier | MMR | Divisions |
| --- | --- | --- |
| Iron | 0 – 399 | IV, III, II, I |
| Bronze | 400 – 799 | IV, III, II, I |
| Silver | 800 – 1,199 | IV, III, II, I |
| Gold | 1,200 – 1,599 | IV, III, II, I |
| Platinum | 1,600 – 1,999 | IV, III, II, I |
| Emerald | 2,000 – 2,399 | IV, III, II, I |
| Diamond | 2,400 – 2,799 | IV, III, II, I |
| Master | 2,800 – 3,199 | – |
| Grandmaster | 3,200 – 3,599 | – |
| Challenger | 3,600 + | – |

The profile shows a progress bar through the current division (like League points).
About 5 average wins move you up one division.

### 5.5 Seasons and the +20 / −18 baseline (decided)

A win (+20) is deliberately worth more than a loss (−18): a player who wins exactly half
their games still gains about 1 MMR per game. **This is intended**: every game played adds
real chess experience, and the slow climb reflects that.

The drift is kept in check by **seasons** (implemented in
`supabase/functions/_shared/seasons.ts`, tested in `tests/seasons.test.ts`).

**Length:** 3 months. **Reset when a season ends:**

| Season that ends | Pull towards 1,000 MMR | Example (1,800 MMR) |
| --- | --- | --- |
| Most seasons | 25% | 1,600 |
| Every 4th season (once a year) | 50% | 1,400 |
| Every 12th season (every 3 years) | 100%: everyone back to 1,000 | 1,000 |

Win streaks reset with the season.

**Rewards** depend on the **highest rank reached during the season**. Ranks are grouped into
brackets that receive the same rewards; a higher bracket always gets more:

| Bracket | Coins | Item |
| --- | --- | --- |
| Iron | 500 | from the cheapest price band |
| Bronze & Silver | 1,000 | ↓ |
| Gold & Platinum | 2,000 | ↓ |
| Emerald & Diamond | 4,000 | ↓ |
| Master & Grandmaster | 7,500 | ↓ |
| Challenger | 12,000 | from the most expensive price band |

Every bracket also gets a **badge** and a **special profile icon** unique to that season.
The item is a piece set, board or effect from the shop, chosen randomly per season, with
three guarantees:

- nothing handed out as a season reward in the **previous 3 seasons** is handed out again;
- every bracket gets a different item;
- a higher bracket never gets a **cheaper** item than a lower bracket (the eligible items
  are sorted by price and split into one price band per bracket).

A player who already owns the item gets its price in coins instead.

### 5.6 Ideas for later

- **Grandmaster and Challenger** could later become "top 200 / top 50 players" instead
  of fixed MMR, like League of Legends.
- **Placement games.** Optionally double the changes for a player's first 5 ranked games
  so new players reach their level faster.

## 6. Coin economy

Implementation: `supabase/functions/_shared/economy.ts`.

### 6.1 Rewards per game

```
win 100 · loss 50 · draw 75     (baseline)
+ performance   ±20% of the baseline (same accuracy factor as MMR)
+ difference    ranked only: +10% per 100 MMR the opponent is stronger (−25% … +50%)
+ streak        wins only: same percentages as the MMR streak
never less than half the baseline
```

Which games pay coins:

| Mode | Coins |
| --- | --- |
| Ranked, Casual | yes (table above) |
| Play for coins | the stake only (see below) |
| vs AI, same device, friend games | none, because they are easy to farm with a second account |

New accounts start with **500 coins**.

### 6.2 Play for coins

Both players stake the same amount and are matched with someone who chose the same stake.

| Stake | Coins |
| --- | --- |
| Low | 100 |
| Medium | 500 |
| High | 2,000 |

The winner receives the pot minus a **10% fee** (stake 500: win +400 net, loss −500,
draw refunds both). The fee is the main coin sink that keeps the economy from inflating;
shop purchases are the other one. A player needs at least the stake in their balance.

### 6.3 Anti-abuse

- All rewards are computed and credited on the server, written to a transaction ledger
  (`coin_ledger`: games, stakes, payouts, purchases, season rewards).
- Games with fewer than **20 half-moves (10 moves each)** pay no coins; ranked MMR still
  counts, so resigning early still costs rating (decided October 2026). Coin games are
  not affected: the stake is the point. Aborted games change nothing.
- Possible later: a soft daily cap on coins from Casual.

## 7. In-game interface (redesign)

The 3D board fills the screen. Around it:

- **Player cards** top and bottom (opponent and you): icon, username, rank emblem,
  captured pieces with material balance, a "to move" glow, and later a clock.
- **Side panel**: move list, and actions for the mode (Offer draw / Resign online,
  Undo / New game locally, Flip view, Auto-rotate, Sound).
- **Promotion picker** and **result screen** as centred cards. The result screen shows the
  outcome, the MMR change with its breakdown (base, difference, performance, streak) and
  the new rank progress, the coins earned, and Rematch / New game / Back to lobby.
- Toasts for draw offers, rematch requests, opponent connection.
- **Camera:** drag to orbit, right-drag to pan, scroll or pinch to zoom; zooming out goes
  far enough (distance 42) to see the whole board on a phone, and beyond the earlier
  limit (26) the fog thins so the board stays clear.

## 8. Technical architecture

### 8.1 Front-end

- **Vite + TypeScript + React** for the platform UI; **Three.js** engine (unchanged) for
  the game. The engine is mounted inside a React page and talks to it through a small
  `GameUi` interface instead of DOM queries.
- **Routing:** hash-based routes (`#/play`, `#/profile/…`) so GitHub Pages can host it.
- **Data layer:** `src/api/` defines typed service interfaces (auth, profiles, friends,
  messages, shop, matchmaking, games). A **mock implementation** (browser storage, fake
  latency) makes the whole UI usable now; a **Supabase implementation** replaces it module
  by module without UI changes. Since M6, whenever the build has Supabase settings,
  `src/api/supabase/` provides everything a player has (accounts, profile, friends, chat,
  coins, rank, items, history, matchmaking); the browser store only holds a copy of the
  server state for the screens to read. `npm run dev:mock` (`VITE_ACCOUNTS=mock`) runs the
  whole back-end in the browser.
- **One Supabase client** (`src/net/supabase.ts`, PKCE flow so returning links work with
  hash routes) is shared by accounts and online games.
- **AI opponent:** a small alpha-beta engine in a Web Worker (5 levels, move generator
  verified with perft). The same worker estimates accuracy for the result screen until
  server-side analysis exists. On the mock back-end, matchmade opponents are played by this
  engine and marked "Demo".
- **Cosmetics:** `src/cosmetics/looks.ts` describes how every item looks (plain data, shared
  by the 3D engine and the 2D shop previews). `src/game/Wardrobe.ts` applies a game's
  looks: board and background directly, piece sets as each piece is created, and tells
  the Choreographer which move and capture style each side uses. Prices and purchase
  rules live in `supabase/functions/_shared/shop.ts` for the server.
- **Languages:** English (default) and Czech, switched in Settings. Code keeps English
  text wrapped in `t()`; `src/i18n/<lang>.ts` maps it to the translation, with English as
  the fallback. `tn()` handles counts (Czech has a separate 2–4 form). `tests/i18n.test.ts`
  fails when a string has no Czech entry, so adding a language is a translation task.

### 8.2 Back-end (Supabase)

| Service | Use |
| --- | --- |
| Auth | email + password, Apple, Google; email verification and password reset (✅ M4); anonymous sessions for guests |
| Postgres + RLS | all data; clients read what they may, writes go through functions |
| Edge Functions | game moves, clocks and results (✅ `game`), profiles, shop and seasons (✅ `account`), friends and chat (✅ M5: `social`), matchmaking and history (✅ M6: `play`) |
| Realtime | live moves (✅), who is online (✅ presence), chat and friend requests (✅), matchmaking notifications. On the free plan Supabase stops realtime for an idle project and restarts it on the next connection, dropping the first updates; the app re-reads a watched game every 4 s and the badges every 20 s, so nothing gets stuck |
| Engine analysis | Stockfish in a small worker service (Edge Functions are too CPU-limited) computes accuracy after each ranked game; run server-side only (Stockfish is GPL, which is fine for server use) |
| Email | Supabase Auth emails (sign-up, password reset, email change) in the player's language, through a custom SMTP provider (Resend) in production |

Wizard Chess has its own Supabase project, `wizard-chess` (ref `yhzgrorvjfvbqshneipc`,
eu-west-1, free plan). Everything in it comes from the repository and is deployed by the
workflow `.github/workflows/supabase.yml` on every change to `supabase/` on `main` (or when
run by hand): the migrations, the Edge Functions, and the auth settings and email
templates. `supabase/config.toml` is the source for both local development and the live
project; `supabase/auth-config.ts` sends its auth part to the live project with the live
URLs. A setting changed only in the dashboard is overwritten by the next deploy. Only
secrets stay in the dashboard (8.4). Every deploy ends with a smoke test of the live
project from GitHub's servers (`tests/live.smoke.ts`: auth settings, both functions, row
security, an online game with realtime); it leaves a few anonymous guests and a finished
game behind.

### 8.3 Data model (first draft)

`games` (online play), `profiles`, `friendships`, `conversations`, `messages`, `players`,
`game_results`, `coin_ledger` and `mm_queue` exist.
`profiles` (M4): id (= auth user), username (unique, case-insensitive), icon_id,
onboarding_step, onboarded_at, username_changed_at, created_at, showcase (M5); written
only by the `account` Edge Function. Social (M5): `friendships` (id, user_a < user_b,
status, requested_by, created_at, accepted_at), `conversations` (id, user_a < user_b,
a_read_at, b_read_at, last_message_at), `messages` (id, conversation_id, sender_id, body,
kind text|invite, game_id, created_at), and the view `conversation_list` (last message and
unread count for the caller); written only by the `social` Edge Function. Competitive (M6):
`players` (private to the player: mmr, coins, wins, losses, draws, streaks, season,
season_peak_mmr, loadout, badges; MMR is never public, others see the showcase), `games` + kind (friend|ranked|casual|wager), control, clock_w, clock_b,
turn_started_at, stake, settled_at; `game_results` (one row per player and game: public
columns, plus private mmr_delta, coins_delta and the breakdown), `coin_ledger` and
`mm_queue`. Atomic steps are SQL functions only the service role may call: `mm_poll`
(matching, stakes), `settle_game` (once per game), `buy_item`, `apply_seasons`. Season ends
are applied lazily the next time a player shows up (rewards by the season's peak, MMR
reset, streaks reset). Items: `items` (the catalogue: id, category, rarity, price,
for_sale, retired; public) is copied from `_shared/shop.ts` on every deploy by
`supabase/catalog.ts`; `player_items` (player_id, item_id, source purchase|season|grant,
price_paid, season, acquired_at; private to the player) has one row per owned item, so
"who owns what, since when, how" is one query (free standard items have no rows).
`buy_item` checks the price against `items` too. The rest is the plan:

```
awards          id, name, rule;  player_awards  player_id, award_id, earned_at
puzzle_progress player_id, level, stars, completed_at   (later)
```

Coins and MMR are only ever changed by server functions, in the same transaction that
records the reason (ledger, game result).

### 8.4 Live settings

Real accounts went live with M4 (October 2026) on the `wizard-chess` project. A new
project is set up by running the deploy workflow by hand: tables, functions, auth
settings and email templates. These are automatic, from `supabase/config.toml`:

- **URL configuration:** Site URL `https://prodbylcsh.github.io/Chess-3D/`, redirect URL
  `https://prodbylcsh.github.io/Chess-3D/**` (`SITE_URL` and `REDIRECT_URLS` in
  `supabase/auth-config.ts`). The GitHub Pages address is temporary; production moves to
  its own domain (e.g. wizardchess.com). The app builds its return links from the address
  it runs on, so the move needs no app change: set the new address in `auth-config.ts`
  (keep the old one in the redirect list during the switch) and add the domain to
  Google's authorized domains.
- **Email sign-in:** "Confirm email" on, "Secure email change" on, minimum password length
  8 with letters and digits, links valid for 1 hour, anonymous sign-ins on (guests in
  invite games).
- **Email templates** for sign-up, password reset and email change, in English and Czech.

The workflow's `SUPABASE_ACCESS_TOKEN` must reach this project: a scoped token made for
another project fails at `supabase link` ("does not have the necessary privileges"). Use
a token scoped to `wizard-chess` with read-write project permissions.

These hold secrets, so the dashboard keeps them (project `yhzgrorvjfvbqshneipc`):

1. **Custom SMTP** (Authentication → Emails → SMTP Settings), Resend: the built-in sender
   is limited to a few emails per hour and meant for testing only. Sending needs a domain
   of our own (DNS records prove it), so the production domain is best bought before the
   switch, even while the site still runs on GitHub Pages. For now emails go out through
   Resend from the already verified `grow-hub.cz` (sender name "Wizard Chess"); switch the
   sender once the game's own domain exists. Then raise the email rate limit
   (Authentication → Rate Limits; it can only be changed with custom SMTP), e.g. to 100
   per hour.
2. **Google:** in Google Cloud (Google Auth Platform), Branding: app name, support email,
   home page `https://prodbylcsh.github.io/Chess-3D/`, no logo (a logo triggers brand
   verification), authorized domains `prodbylcsh.github.io` and
   `yhzgrorvjfvbqshneipc.supabase.co` (not `github.io` / `supabase.co`: those are shared
   hosting suffixes, so Google wants our own subdomain). Then an OAuth client (type "Web
   application") with the authorized redirect URI
   `https://yhzgrorvjfvbqshneipc.supabase.co/auth/v1/callback`; paste the client ID and
   secret into the Google provider (Authentication → Sign In / Providers), and publish the
   app (Audience → In production). Publishing needs the privacy policy link in Branding:
   `https://prodbylcsh.github.io/Chess-3D/legal/privacy.html` (terms:
   `…/legal/terms.html`). Until the app is published it is in "Testing": only the test
   users listed under Audience can sign in with Google, everyone else gets Google's
   "access blocked" page.
3. **Apple (later):** needs the paid Apple Developer Program, so it is switched on once the
   game earns money; until then the Apple button shows "Soon". Then: a Services ID with
   "Sign in with Apple" and the same callback URL, plus a key, entered in the Apple
   provider. The generated secret expires every 6 months and must be renewed.

Online invite games from before the move (in the old shared project) are not carried over,
and neither are players' demo accounts (stored in their browsers).

## 9. Roadmap

Front-end first (with the mock data layer), then back-end module by module.

| Milestone | Content | Status |
| --- | --- | --- |
| M1 Foundation | Concept doc, rating and coin rules (tested), React shell, design system, sidebar, auth screens, onboarding, Play hub, redesigned game screen, vs AI, result screen | ✅ (on the mock back-end) |
| M2 Social | Profile (own and public, stats, awards, history, loadout, icon change), Community (search, friends, requests, suggestions), Messages (chat, unread badges, challenges in chat), Settings (email, password, username with 30-day limit, sound, camera, language, sign out, delete account) | ✅ (on the mock back-end) |
| M3 Shop | Shop catalogue (30+ items, placeholder looks), buy and equip, your items on the Profile, loadouts in games, season rewards view | ✅ (on the mock back-end) |
| M4 Back-end: accounts | Supabase Auth (email with confirmation and reset, Apple, Google), profiles, onboarding, usernames, account deletion, guest invitation | ✅ live (October 2026); Google sign-in limited to test users until the privacy policy exists (8.4) |
| M5 Back-end: social | Friends and requests, real chat between players, challenges from chat, who is online, the showcase (built before the competitive back-end: with few players, friends bring each other in) | ✅ live (October 2026) |
| M6 Back-end: competitive and shop | Matchmaking queues, game kinds, server clocks, results with MMR and coins, ledger, seasons, shop purchases, inventory, loadout | ✅ live (October 2026) |
| M7 Real items | Asset pipeline and folders, model piece sets and boards in games, 3D item view, item catalogue and ownership in the database, first set and board (Monolith), placeholders removed | ✅ in code, tested locally; live when merged |
| Later | Tournaments, Puzzles, Learn, more sets, boards, backgrounds and effects, real-money coins, boosts | ⏸ |

## 10. Decisions and open questions

Decided:

- **+20 / −18 baseline** stays; the small average gain is intended and seasons reset the
  drift (5.5).
- **Draws**: half the rating difference and half the performance; the streak is unchanged.
- **Coin stakes** 100 / 500 / 2,000 with a 10% fee; shop price ranges as in 4.5.
- **Friend, AI and same-device games** pay no coins and no MMR.
- **Time controls**: Blitz 5+3, Rapid 10+5 and Classical 15+10 for Ranked, Casual and Play
  for coins; Fast blitz 3+2 for Casual only; no clock for friends, AI and same device.
- **Seasons**: 3 months; resets of 25% / 50% (every 4th) / 100% (every 12th); rewards per
  rank bracket as in 5.5.
- **Username changes**: once every 30 days. Reserved names (admin, support, guest, …) can't
  be taken.
- **Email verification** is required before an email account can play.
- **Sign in with Apple** waits until the game earns money (Apple Developer Program fee);
  email and Google come first.
- **Domain:** GitHub Pages is temporary; production gets its own domain.
- **Own Supabase project** (`wizard-chess`), separate from other apps; its auth settings
  and email templates live in the repository (8.2).
- **Auth emails** come in the player's interface language (English or Czech).
- **Operator and legal pages:** Wizard Chess is run by Lukáš Schöbel, Czech Republic
  (contact seblis@seznam.cz). Privacy Policy and Terms of Service are static pages in
  English and Czech (`public/legal/`, linked from sign-up and Settings). Minimum age 15,
  confirmed at sign-up ("By continuing you confirm you are at least 15…").
- **Coins have no real-money value** (Terms §6): no cash-out, no transfers, no refunds.
  Buying coins with real money is planned; before it starts, the Terms get purchase
  conditions (prices, payment, refunds, right of withdrawal, parental consent under 18)
  and the operator's business details, which Czech consumer law requires for selling.
- **Retention:** a daily job (`cleanup_inactive`, pg_cron) deletes guests and online games
  without a registered player after 6 months without activity (Privacy Policy §6).
- **En passant** shows the move dot on the landing square and the capture ring on the
  pawn being taken; clicking either plays it.
- **Fresh start on the server** (M6): coins, rank and items from the browser are not carried
  over; everyone starts with 500 coins, Silver II and the free items.
- **Real items replace the placeholders** (October 2026): the first real piece set and
  board, **Monolith** (68,000 and 42,500 coins: about 70% above the most expensive
  placeholder of their kind), with a White version of the black models made by
  recolouring; boards are always separate items. All placeholder items except the
  profile icons left the shop (retired, nobody owned any). Ownership is recorded per
  item in `player_items`. Season item rewards start with season 2 (season 1 ended before
  the server kept items), so in season 2 the Challenger bracket gets the Monolith set and
  Master & Grandmaster the Monolith board, by the existing rule that the most expensive
  items go to the highest brackets.
  The legal pages say so (Privacy §3, Terms §6, effective 11 October 2026); Terms §5
  covers clocks, leaving and the first-move window.
- **No coins under 20 half-moves**, MMR still counts; **30 s first-move window**, else the
  game is aborted (both October 2026).
- **Order of the back-end milestones:** social (friends, chat) before competitive
  (matchmaking, server MMR and coins), October 2026.
- **Accuracy on the server:** until an engine server exists (Stockfish needs more CPU than
  Edge Functions give; about $5/month), every server-side game counts as neutral 70%
  accuracy, so only the result, rating gap and streak change MMR and coins. Switching it
  on later needs no rule change.
- **No third-party requests** from the site apart from the back-end: fonts are served
  with the site (`@fontsource`), no cookies, analytics or ads.
- **Languages**: English (default) and Czech.

Open:

1. Which languages come after Czech?
