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
changed later (username changes may be limited, e.g. once per 30 days).

## 3. Layout and navigation

A left sidebar lists the modules. On phones it becomes a bottom tab bar with the main
modules and a "More" sheet.

| Module | Status | Purpose |
| --- | --- | --- |
| Play | 🟡 | Start games in every mode. |
| Puzzles | ⏸ | Roadmap of 100 puzzle levels. |
| Learn | ⏸ | Tutorials: basics, tactics, openings. |
| Community | 🔜 | Find players, friend requests, view profiles. |
| Shop | 🔜 | Spend coins on cosmetics. |
| Profile | 🔜 | Rank, history, awards, equipped cosmetics. |
| Messages | 🔜 | Chat with friends. |
| Settings | 🔜 | Language, email, password, sound. |

Modules marked 🔜 currently show a placeholder page listing their planned features.

The top of the sidebar shows the logo; the bottom shows the signed-in player (icon,
username, rank) and the coin balance.

## 4. Modules

### 4.1 Play

| Mode | Status | Description |
| --- | --- | --- |
| Casual | 🟡 | Matchmaking against any online player. Pays coins, no MMR. |
| Ranked | 🟡 | Matchmaking against players of similar MMR. Changes MMR and pays coins. |
| Tournaments | ⏸ | Coin entry fee, brackets. Later. |
| Play a friend | 🟡 | Invite from the friends list (🟡 demo list), play on one device (✅), or create a link anyone can open (✅ live online). |
| Play vs AI | ✅ | Built-in engine with difficulty levels, runs in the browser. No MMR, no coins. |
| Play for coins | 🟡 | Both players stake the same amount; the winner takes the pot minus a fee. |

**Matchmaking (ranked):** start with a ±100 MMR window and widen it by 50 every 5 seconds
of waiting, up to ±400. Casual uses one queue with no rating window (it still prefers
close ratings when several players are waiting). Leaving a running game counts as a loss.

### 4.2 Puzzles ⏸

A roadmap of 100 levels, easiest to hardest, with progress saved to the account. A puzzle
puts the player in a position (a mid-game scenario or a forced line) where the opponent's
replies are pre-programmed. Later: more packs and community-made puzzles.

### 4.3 Learn ⏸

Interactive tutorials: rules and basics, then tactics, openings and advanced ideas.

### 4.4 Community

Search players by username, send/accept/decline friend requests, view any profile.
Everything on a profile is public (see 4.6).

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

Owned items can be equipped ("Used") from the Shop or the Profile. Later: real-money coin
packs and temporary coin boosts (e.g. +50% coins for 24 h), and a 3D viewer for items.

Suggested price ranges (to be tuned once real reward data exists):

| Item | Coins |
| --- | --- |
| Profile icon | 1,500 – 3,000 |
| Background | 5,000 – 12,000 |
| Move animation / destruction effect | 8,000 – 20,000 |
| Board | 10,000 – 25,000 |
| Piece set | 15,000 – 40,000 |

At roughly 10 games a day this means a new icon every 2–3 days and a piece set every few
weeks, which keeps the shop meaningful without feeling out of reach.

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

### 5.5 Design notes to decide on

- **Inflation.** Because a win (+20) is worth more than a loss (−18), a player who wins
  exactly half their games still gains about 1 MMR per game on average, so everyone drifts
  upwards over time. Options: keep it (it feels rewarding) and do soft resets each season
  (e.g. pull everyone 25% towards 1,000), or make the baseline symmetric (+19/−19).
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

- All rewards are computed and credited on the server, written to a transaction ledger.
- Games shorter than ~10 moves, or abandoned in the first moves, pay nothing.
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

## 8. Technical architecture

### 8.1 Front-end

- **Vite + TypeScript + React** for the platform UI; **Three.js** engine (unchanged) for
  the game. The engine is mounted inside a React page and talks to it through a small
  `GameUi` interface instead of DOM queries.
- **Routing:** hash-based routes (`#/play`, `#/profile/…`) so GitHub Pages can host it.
- **Data layer:** `src/api/` defines typed service interfaces (auth, profiles, friends,
  messages, shop, matchmaking, games). A **mock implementation** (browser storage, fake
  latency) makes the whole UI usable now; a **Supabase implementation** replaces it module
  by module without UI changes.
- **AI opponent:** a small alpha-beta engine in a Web Worker (5 levels, move generator
  verified with perft). The same worker estimates accuracy for the result screen until
  server-side analysis exists. On the mock back-end, matchmade opponents are played by this
  engine and marked "Demo".
- **Languages:** planned together with Settings (M2): user-facing text moves into one
  dictionary per language, so adding a language becomes a translation task.

### 8.2 Back-end (Supabase)

| Service | Use |
| --- | --- |
| Auth | email + password, Apple, Google; email verification and password reset |
| Postgres + RLS | all data; clients read what they may, writes go through functions |
| Edge Functions | game moves (✅ today), matchmaking, results (MMR, coins), shop purchases, friend requests |
| Realtime | live moves (✅ today), presence, matchmaking notifications, chat |
| Engine analysis | Stockfish in a small worker service (Edge Functions are too CPU-limited) computes accuracy after each ranked game; run server-side only (Stockfish is GPL, which is fine for server use) |
| Email | Supabase Auth emails through a custom SMTP provider (e.g. Resend) in production |

### 8.3 Data model (first draft)

```
profiles        id (= auth user), username (unique), icon_id, mmr, win_streak, coins,
                wins, losses, draws, created_at, onboarded_at
games           (exists) + kind (ranked|casual|wager|friend|ai), stake, white/black mmr before
game_results    game_id, player_id, outcome, accuracy, mmr_delta + breakdown, coins_delta
coin_ledger     id, player_id, amount, reason (game|purchase|wager|grant), ref_id, created_at
items           id, category, name, price, asset refs, active
inventory       player_id, item_id, acquired_at
loadout         player_id, category, item_id (equipped)
friendships     user_a, user_b, status (pending|accepted), requested_by, created_at
messages        id, conversation_id, sender_id, body, created_at, read_at
conversations   id, user_a, user_b, last_message_at
mm_queue        player_id, kind, mmr, stake, joined_at  (matchmaking)
awards          id, name, rule;  player_awards  player_id, award_id, earned_at
puzzle_progress player_id, level, stars, completed_at   (later)
```

Coins and MMR are only ever changed by server functions, in the same transaction that
records the reason (ledger, game result).

## 9. Roadmap

Front-end first (with the mock data layer), then back-end module by module.

| Milestone | Content | Status |
| --- | --- | --- |
| M1 Foundation | Concept doc, rating and coin rules (tested), React shell, design system, sidebar, auth screens, onboarding, Play hub, redesigned game screen, vs AI, result screen | ✅ (on the mock back-end) |
| M2 Social | Profile, Community, Messages, Settings screens | 🔜 |
| M3 Shop | Shop catalogue, buy and equip, loadout in games | 🔜 |
| M4 Back-end: accounts | Supabase Auth (email, Apple, Google), profiles, onboarding, usernames | 🔜 |
| M5 Back-end: competitive | Matchmaking queues, game kinds, results with MMR and coins, engine analysis, ledger | 🔜 |
| M6 Back-end: social and shop | Friends, messages, shop purchases, inventory, loadout | 🔜 |
| Later | Tournaments, Puzzles, Learn, more cosmetics, real-money coins, boosts, 3D item viewer, clocks | ⏸ |

## 10. Open questions

1. **Inflation**: keep +20/−18 with seasonal soft resets, or make it symmetric? (5.5)
2. **Draws**: the proposal above (half the difference and half the performance, streak
   unchanged). OK?
3. **Coin stakes and prices**: 100 / 500 / 2,000 stakes, 10% fee, and the price ranges in 4.5.
4. **Friend and AI games**: no coins and no MMR (anti-farming). OK?
5. **Time controls**: which ones (e.g. 3+2, 5+0, 10+0)? Ranked needs a clock so games end.
6. **Username changes**: allowed how often?
7. **Languages**: which ones besides English, and in what order?
