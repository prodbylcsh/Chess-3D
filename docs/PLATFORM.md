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
- **The platform has to make money** (the user's goal, October 2026). Free parts exist to
  bring players in and show what the paid parts are worth; features are weighed by how
  they help players start, stay and pay. See "Earning money" below.

### Earning money

The platform is meant to earn money for its operator. What pays today and what is planned:

| Source | How | Status |
| --- | --- | --- |
| Coin packs | €4.99–€49.99 through Paddle (4.5) | sandbox; live needs the own domain and Paddle's review |
| Puzzle modules | 100,000 coins each; Openings free (4.2) | ✅ |
| Learn | chapters 1–2 free, the rest 75,000 coins (≈ €20) (4.3) | planned |
| Shop items | piece sets, boards, effects for coins (4.5) | ✅ |
| Premium (subscription) | Apprentice €4.99, Wizard €9.99, Archmage €19.99 a month (a year = 8 months): every puzzle module and Learn chapter, coins every month, Game Review, streak shields, the Wardrobe (4.9) | ✅ built (October 2026); sandbox until live payments |

Coins can also be earned by playing, so every paid part is reachable without money; buying
coins is the shortcut. When a feature is designed, say how it supports this (bringing
players in, keeping them, or a reason to buy) and propose prices to the user; prices are
the user's decision.

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
- **Guests** (invite links, puzzles) play under an anonymous session and have no profile.
  Their result card invites them to create a free account; their puzzles move into it (4.2). Registered players use their account
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
| Settings | 🟡 | Language, email, password, sound, the subscription. |
| Premium | ✅ | The plans and subscribing (4.9); reached from the sidebar, the Shop and the offers, not a nav item. |

Modules marked 🔜 currently show a placeholder page listing their planned features.

The top of the sidebar shows the logo; the bottom shows the signed-in player (icon,
username, rank) and the coin balance.

## 4. Modules

### 4.1 Play

| Mode | Status | Description |
| --- | --- | --- |
| Casual | ✅ (M6) | Matchmaking against any online player. Pays coins, no MMR. |
| Ranked | ⏸ built (M6), closed | Matchmaking against players of similar MMR. Changes MMR and pays coins. **Closed until the platform has enough players** (October 2026): the Play hub shows it with a "Soon" badge and the server refuses ranked searches. |
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

**Opening ranked.** Ranked and the seasons wait for one constant, `SEASON_ONE` in
`_shared/seasons.ts` (`null` for now). The app (Play hub, Shop season panel, mock back-end)
and the server both read it; the `play` function answers ranked searches with
`ranked_closed`. To open ranked, set it to the current month (e.g. `{ year: 2027, month: 3 }`)
and deploy (the merge to `main` deploys the site and the functions): ranked opens at once
and **season 1** starts on the 1st of that month. A later month opens ranked on its 1st.
Never set a month in the past beyond the current one: the seasons in between would end at
once and hand out rewards. Before season 1 the Shop previews season 1's rewards with
"Starts when ranked games open". The server also honours a `SEASON_ONE` environment variable
(`2026-07`, or `none`), which the local stack sets so the e2e tests cover ranked and season
ends.

**Matchmaking (ranked):** start with a ±100 MMR window and widen it by 50 every 5 seconds
of waiting, up to ±400. Casual uses one queue with no rating window (it still prefers
close ratings when several players are waiting). Leaving a running game counts as a loss.
When nobody fits, the search keeps going: it shows how many players are online and
offers a game against the AI while waiting (which pays nothing, as decided).

#### Spectating ✅ (October 2026)

Anyone may watch a running online game on the same 3D board, with both players' own items
(piece sets, boards, effects), read-only. Decided with the user on 25 October 2026.

**Ways in**
- **Watch link** `#/watch/<game id>`: players share it from the game (the **Share** action:
  the share sheet on phones, else copied). It works without an account (the app signs the
  visitor in as a guest); a player opening it plays instead, and anyone else opening the
  game's own link or invite link of a running game lands on the watch link.
- **Friends:** a friend in a game shows **Playing now** in Community, on their profile and
  in the chat header, with **Watch** (also on the profile of a non-friend whose game may be
  watched). "Playing now" needs a move or other change in the last 30 minutes
  (`PLAYING_NOW_FRESH_MS`), so an abandoned game does not show; checked every 20 s.
- **Live now** on the Play hub (friends' games first, then the best-ranked running
  matchmade games, `LIVE_NOW_LIMIT` 12): **built but closed** (`LIVE_NOW_OPEN = false` in
  `_shared/spectate.ts`); the hub shows it with "Soon" until there are enough games to fill
  it. To open it, set the constant to `true` and deploy.

**The spectator screen** (`src/features/game/modes/watch.ts`): both player cards (name,
icon, rank in matchmade games, clocks, captured pieces), the move list, Flip, Sound and
Share; a chip with how many are watching, and in delayed games "2 moves behind". Joining
mid-game shows the position at once; later moves animate one by one. At the end a result
card for spectators: both players with the winner highlighted, **Seen in this game** (the
players' shop items, each linking to its Shop category), and **Watch the rematch**, Create a
free account (guests) and Play a game. When the players start a rematch, the spectator is
taken there after 4 s unless they choose Stay. Spectators can't move, offer anything,
chat with the players, or analyse the game.

**N watching:** players and spectators both see how many people watch: everyone in the
game's realtime presence except its two players.

**Delay:** in ranked and coin games, spectators see the moves **two moves (4 half-moves)
behind** while the game runs, so nobody watching can help a player; once the game is over
they see every move. Friend and casual games are live. The delay is even, so the side to
move and the live clocks match the position spectators see.

**Who may watch** (Settings → Profile, "Who can watch my games"): **Everyone with the link**
(default), **Friends only**, or **Nobody**. Both players' settings must allow it (a guest
from an invite link has no setting), and neither player may have blocked the spectator or
been blocked by them. Players always see their own games.

**On the server** (migration `20261025090000_spectating.sql`): a trigger keeps
`game_watch`, the spectators' copy of every game (the delayed moves, names, clocks, result,
rematch; no draw offers), and `can_watch(white, black)` decides who may read it (row
security; realtime follows it). The game row itself (`games`) is readable only by its
players, and by anyone while it waits for its second player (the invite link). The rules
and numbers are in `_shared/spectate.ts`, which `tests/spectate.test.ts` compares with the
SQL; `tests/spectate.e2e.ts` covers the delay, the settings, blocks and realtime.

**Earning:** watch links bring new players in (guests watch without signing up and get
"Create a free account"), watching friends brings players back, and spectators see the
paid items in action with a way to the Shop. Spectating stays free (a paywall would stop
the links from spreading).

**Later** (§9): spectator chat or emoji reactions (v2, needs moderation), replays of
finished games from a profile's history, opening Live now.

### 4.2 Puzzles ✅

Puzzles are meant to be fun first. They come in **themed modules of 100 puzzles**, easiest
first, played one after another on a map of levels. A puzzle puts the player in a position
after the opponent's move; the player finds the solution move by move and the opponent's
replies are played back. Later: fantasy and other themes, community-made puzzles.

Decided (October 2026):

- **Source:** the Lichess puzzle database (CC0). `scripts/puzzles/build.ts` picks the 100
  puzzles of each module in a GitHub Action (`.github/workflows/puzzles.yml`, which
  streams the database): well-tested puzzles only (rating deviation ≤ 90, popularity ≥ 80,
  ≥ 300 plays), one per rating step across the module's range, by the module's Lichess
  themes. The result is committed to `supabase/functions/_shared/puzzle-data/`, so app
  and server use the same puzzles; the workflow builds only missing modules unless run
  with "rebuild" (rebuilding changes puzzles players have already solved).
- **Modules** (`_shared/puzzles.ts`), each with its own colour and icon, used on its card,
  its map and in the scene while playing (the sky, table, lights and floating motes take
  the colour):

  | Module | Themes | Ratings |
  | --- | --- | --- |
  | Openings (free) | 100 hand-made opening lines, half for White and half for Black | 400–1588 |
  | First Steps | short puzzles, up to 2 player moves | 400–1300 |
  | Mate in Two | mateIn2 | 600–2000 |
  | Forks | fork | 600–2200 |
  | Pins & Skewers | pin, skewer | 600–2200 |
  | Sacrifices | sacrifice | 900–2400 |
  | Endgames | endgame | 700–2300 |

  More modules (fantasy and other themes) come later.
- **Openings** (added October 2026 at the user's request, all hand-made since 19 October:
  the Lichess "opening" puzzles were random middlegame positions, often with pawns
  already gone, and the user wanted the module to be about the start of the game). 100
  real games from the first move, 50 played as White and 50 as Black, in chapters of ten:
  the first moves and quickest mates; the classical main lines from both sides; Black's
  answers to 1.e4 and how White meets them; the attacks on the weak pawn beside the king;
  queen's pawn openings; flank openings; the Sicilian world; gambits and how to answer
  them; more systems; the traps the masters set. Every opening appears from both sides
  where it makes sense ("Italian Game" and "Italian Game as Black"), weak first moves are
  punished ("Punish the Wayward Queen", "Owen's Defence Trap"), and the "Answer the …"
  lines teach what the opponent is after and how to counter it. A line starts at most a
  few moves in, always from a real game, and the intro and the explanation after every
  move say what the opponent intends. The lines live in `scripts/puzzles/curated.ts`
  (SAN; each player move checked with Stockfish; the order is the difficulty, rating
  400 + 12 per line) with their lessons in `src/features/puzzles/lessons.ts`; only the
  line's move counts, the hint shows it. It is the free module.
- **Unlocking:** only Openings, shown first, is free (since 15 October 2026, the user's
  choice; First Steps was the free one on the first day, and players who had solved a
  First Steps puzzle by then keep it unlocked, migration `20261015170000`). The others cost **100,000 coins** each and
  stay unlocked. Any Premium plan opens every module while it runs (4.9).
- **Coins:** 25–50 coins the first time a puzzle is solved, by its rating
  (25 at 400, 50 at 2400 and above). Solving it again pays nothing, so puzzles cannot be
  farmed. **Every 10 solved puzzles in a module pay a bonus of 500 coins.**
- **Finishing a module** (all 100 solved) gives a random item from the shop that the
  player doesn't own yet (piece set, board, background, effect, icon); a player who owns
  everything gets 25,000 coins instead.
- **Stars:** 3 for a clean solve, 2 with one mistake or hint, 1 otherwise. They are for
  motivation only; the best stars are kept.
- **Hints cost coins** (October 2026, the user's decision): a puzzle offers two hints per
  move of its solution (the piece, then the square); using all of them takes **10 coins**
  off the first-solve reward, fewer hints take off a share of that, rounded
  (`hintPenalty`, `solveCoins`). The result card shows "Hints −n".
- **Wrong moves** are taken back and count as a mistake; any checkmate counts as the right
  move (and ends the puzzle). A hint first lifts the piece to move on the board and names it;
  a second hint shows only the square it goes to. Each counts against the stars.
- **Help after wrong moves** (19 October 2026, the user's decision): after every wrong move,
  with any piece, a green ring marks the square where the right move ends, for free (no
  coins; the mistake itself still costs the star as before). After **three wrong moves in a
  row** on the same move (`MISSES_FOR_HINT` in `modes/puzzle.ts`) the piece to move is
  marked too, and that counts as one hint (coins and stars) unless the player had already
  asked for the piece. The marks stay until the right move is played (`Game.guide`); the
  Hint button then has only what isn't shown yet (the piece, or the square) and is off
  when both are.
- **The aim of the next move** (20 October 2026, the user's request: make clearer what to
  play): whenever it is the player's turn, the coach card shows "Your next move" with what
  that move is for, worked out from the position and the solution's move for every puzzle
  (`src/features/puzzles/intent.ts`), never naming squares or the move itself: mate is on;
  the opponent threatens mate, stop it; the opponent attacks your knight, protect it or move
  it; your opponent has just taken, take back; something is poorly defended, win it; attack
  two things at once; pin or skewer; threaten mate; a sacrifice (with check); a check;
  create a threat on a weak point; and in openings develop a knight or bishop, fight for the
  centre with a pawn, bring the king to safety; in endgames push a pawn; otherwise a quiet
  strengthening move. The forks module's first moves are named forks in more than half of
  its puzzles, the pins module's pins (tested).
- **Why not?** (20 October 2026, the user's choice): after a wrong move Stockfish (in the
  browser, `src/features/puzzles/whyNot.ts`, 80,000 nodes per move) compares it with the
  right one. Nearly as good (under 40 centipawns, or both winning by far): "A good move
  too! But this puzzle goes on with a different one", **not a mistake** (the user's
  decision, 20 Oct 2026): it is taken back without costing a star and the square of the
  puzzle's move is marked. A little weaker (under 120): "weaker than the move this puzzle
  wants". Still winning where the puzzle has a mate: "there is a checkmate here". Otherwise
  the board plays the opponent's answer with a red arrow and says what it does (mates,
  takes your queen, checks, takes over), then both moves are taken back. These count as
  a mistake. Without WebAssembly the old "not this move" stays.
- **Arrows** (20 October 2026): once the piece and its square are both shown, a green
  arrow joins them (a knight's arrow bends like its jump); the opponent's moves get a
  soft gold arrow until the player moves; refutations a red one (`Game.arrows`, puzzles
  only, so the look of games is unchanged).
- **Replay the solution** (20 October 2026): on the result card of a solved (or shown)
  puzzle, in every module and the daily puzzle: the line plays from the start with arrows,
  each of the player's moves explained (the lesson, or "Knight takes, with check!"). Skip
  jumps to the end.
- **Show the solution when stuck** (20 October 2026, the user asked for a real stuck
  detection, not "five wrong moves"): mistakes and hints count a point each, and every
  40 seconds on the current move (only while the page is visible) another; at 5 points,
  never in the first minute and always after four minutes on one move (`stuck.ts`), the
  coach offers the solution. Showing it (after a confirmation) plays the solution; the
  puzzle counts as **seen**: no coins or stars, the next one opens (the server needs the
  puzzle open for 20 seconds). Solving it later in a review pays its first-solve coins and
  stars then. Not offered in the daily puzzle.
- **Reviews** (20 October 2026; the user worried that a player could replay a 1-star
  puzzle right away from memory): a puzzle with fewer than three stars, or seen, can be
  replayed any time, but its stars only improve when it was last finished at least
  **20 hours** before (`REVIEW_AFTER_HOURS`); a replay before that is a practice round,
  said so in the briefing, the coach card and the result. Every finished attempt starts the
  wait again, so practising just before a review doesn't help. The module map shows
  "Review (n)" for puzzles past the wait (each "Next" goes to the next one) or when the
  next ones are ready; a puzzle's card says when its stars can improve.
- **The daily puzzle and the streak** (20 October 2026, the user's choice and amounts): one puzzle a day for everyone (UTC date), from any module, locked ones too (a
  taste of them), easy on Monday and harder towards Sunday (`dailyPuzzle`). It pays
  **40 coins** less what the hints cost (`DAILY_COINS`), once a day. Solving it on days in
  a row builds a streak (a missed UTC day ends it, the best is kept). Milestones pay extra:
  3 days 100, 7 300, 14 600, 30 1,500, 50 2,500, 100 5,000, 200 10,000, 365 25,000 + a shop
  item the player lacks, 500 40,000, 1000 100,000 + an item, then 10,000 every 100 days
  (`STREAK_MILESTONES`). The streak's flame grows through six tiers, each more intense
  than the last, so a 1000-day streak feels far bigger than a 10-day one: Spark (1), Flame
  (7), Blaze (30, embers), Azure Fire (100, a ring of fire), Phoenix (365, wings), Starfire
  (1000, circling stars) (`STREAK_TIERS`, `streak.tsx`). After the solve the result card
  counts the streak up with a burst whose rays grow with the tier, and a bigger one with a
  new tier or a milestone; the phone vibrates longer for longer streaks. The Puzzles page
  shows the daily card with the streak and the next milestone. Server: `puzzle_daily`,
  `puzzle_streaks`, `solve_daily` (migration `20261020090000`).
- **Every puzzle says what it wants** (October 2026, the user's request: puzzles must be fun,
  guide the player and teach something). Before the first move a briefing card shows the
  goal ("Italian Game", "Checkmate in 2 moves", "Win material"), the side and the number of
  moves to find, what to look for, and how to get three stars. During play a coach card in
  place of the opponent's card keeps the goal in view, marks the moves found, and answers
  every move: the hand-made lines explain each right move ("The Italian bishop, eyeing the
  weak pawn beside Black's king"), the others cheer; a wrong move says so and is taken back.
  Texts speak of pieces, not squares (the user's wish: "the bishop", "the pawn beside the
  king", not "f7"); hints show the piece and its square on the board instead. The goal of
  a Lichess puzzle comes from what its solution achieves (mate, material) and its motifs
  (fork, pin, sacrifice, …) from its Lichess themes, the module's own motif first
  (`features/puzzles/describe.ts`, `lessons.ts`; the themes were added to the puzzles
  already picked without changing them, `scripts/puzzles/enrich.ts`).
- **The map is a 3D world** (October 2026, the user's request): each module has its own
  landscape around a winding path of 100 stepping stones (Openings: dawn among giant stone
  pawns; First Steps: a meadow with fireflies; Mate in Two: a royal court at night; Forks: a
  golden canyon; Pins & Skewers: a glacier under snow; Sacrifices: a volcanic altar;
  Endgames: misty towers; `features/puzzles/map/`). A chest stands at every 10th stone and
  opens when its bonus is earned; the reward waits on a pedestal at the end under a beam of
  light. The player's own piece (the knight of their piece set) stands on the next puzzle;
  "Next puzzle" after a solve goes back to the map, where it hops on to the next stone before
  the next puzzle's card appears. Drag or scroll to travel, tap a stone to see its card.
  Without WebGL the levels are a plain grid.
  **The scenery is real models** (22 October 2026, the user's request, replacing the first
  simple shapes): the user's PBR pack (67 textured models: sculpted, normal maps, real
  materials), kept in the R2 originals bucket under `map/`, one folder per module. One file
  per module, `public/assets/map/<module>.glb`, built by `scripts/assets/build-map.ts`
  (what each module uses and how often: `scripts/assets/map/worlds.ts`; the models workflow
  rebuilds it with the target `map`). Each world has things that stand along the path in
  many copies, small things on the ground near it, two landmarks that stand on level
  terraces beside the path every 17 levels, and a horizon of distant land round the camera
  that fades out of the fog (made from code in the theme's colours; the pack has none):

  | Module | Along the path | Landmarks | Horizon |
  | --- | --- | --- | --- |
  | Openings | giant stone pawns (whole, chipped, sunk, fallen), dawn grass, flowers | the gate where games begin (a chessboard band, pawns on top), a toppled king | hills with giant pawns |
  | First Steps | round trees, blossom, poplars, bushes, mushrooms, a signpost | a windmill built like a pawn, a cottage with a rook tower | green hills, a line of trees |
  | Mate in Two | marble columns (whole, broken), braziers, red banners, candles, a fallen crown | the empty throne, a broken colonnade | the palace with lit windows |
  | Forks | striped rock spires, Y-shaped forked rocks, buttes, dead trees, cacti | a cliff shaped like the knight's head, a rock arch | mesas |
  | Pins & Skewers | crystal clusters, ice spears in the snow, ice blocks, snowy firs | a king frozen in ice, a spear skewering a queen and a rook in ice | snowy peaks |
  | Sacrifices | obsidian, basalt columns, lava pools, rune pillars | the altar with a queen laid on it, an obsidian gate with a ring of fire | glowing volcanoes |
  | Endgames | rook towers (whole, broken), standing stones, dead trees, lanterns, graves | a lone king's statue, a ruined wall with an arch | ramparts and towers in the mist |

  The originals are too heavy to draw hundreds of times on a phone, so the build lightens
  each one: solid parts simplified to about 1,800 triangles along the path, 700 on the
  ground and 14,000 for a landmark (the normal maps keep the detail), leaf and petal cards
  thinned out, textures as WebP at 512 px (256 on the ground, 768 for landmarks), and the
  ice's "transmission" replaced by plain transparency. A file is about 2–3 MB; the map draws
  about 150–300 thousand triangles at a time (the copies are grouped in six stretches of
  the path and those in the fog are skipped) and keeps the models' own materials, with a
  soft studio light for reflections. Without the file the map works, only bare. The files
  are served like the shop models (R2 on the live site). Look at them without the app in
  `scripts/assets/map/preview.html` on the dev server.
- **Progress:** the next level opens when the previous one is solved; solved levels can be
  replayed.
- **Server checks** (`puzzles` function): a puzzle must be opened before it is solved
  (`puzzle_attempts`), at least 2 seconds pass between the two, the moves must solve it,
  levels go in order, and the coins, bonus, unlock and reward are paid in one transaction
  (`solve_puzzle`, `unlock_module`, `complete_module`; ledger reasons `puzzle`,
  `puzzle_bonus`, `puzzle_unlock`, `puzzle_reward`; reward items in `player_items` with
  source `puzzle`).
- **Guests** (October 2026): without an account, visitors play the first **10** puzzles of
  the free module (`GUEST_PUZZLES`, `guestMayPlay` in `_shared/puzzles.ts`) and the daily
  puzzle, under an anonymous session ("Try puzzles without an account" on the sign-in page;
  the Puzzles pages work signed out). The server checks their solves like anyone's and
  answers `guest_limit` beyond that. A guest has no player row: what they earn is recorded in
  the ledger and shown as "waiting for you". When they sign up or in **on the same device**,
  the app keeps the guest's refresh token (`src/net/guest.ts`) and the `puzzles` function's
  `claim` replays the guest's solves into the account with the account's rules (a puzzle it
  solved already pays nothing; a bonus every 10 by its own count) and adds daily puzzles after
  the account's last one to its streak; then the guest's rows are deleted. Guests are removed
  after 6 months without a game move or a puzzle (`cleanup_inactive`).

### 4.3 Learn ✅ (all 8 chapters, 41 lessons, October 2026)

Learn **teaches** the game; Puzzles **test** it. Nothing is assumed: a beginner who has never
played learns every rule here. Each lesson has four steps on the 3D board, reusing what
Puzzles has (coach card, rings, arrows, vibration):

1. **Explain:** one short idea on the coach card.
2. **Show:** the piece moves by itself and its moves light up.
3. **Try:** a small task on an almost empty board ("take all the pawns with the rook",
   "get out of check", "castle").
4. **Check:** a quick question with the reason ("Checkmate or stalemate?").

A mistake is explained by the rule it breaks ("the king cannot castle across an attacked
square"), not by an engine move. Texts speak of pieces, not squares, except in the
Coordinates chapter (lessons marked `squares`). Boards with pieces but no kings run on chess.js with `skipValidation`
(src/game/Game.ts, free boards).

**Chapters:**

| # | Chapter | Contents | Price |
| --- | --- | --- | --- |
| 1 | The pieces | the board; how each piece moves and captures, one lesson per piece (8 lessons) | free |
| 2 | Special rules | check and checkmate, castling and its conditions, promotion, en passant (6) | free |
| 3 | How a game ends | (5) stalemate, the draws (repetition, the 50-move rule, not enough material, agreement), resigning, time | paid |
| 4 | Opening moves | (5) the centre, developing the pieces, a safe king (castle early), good first moves (the Italian Game, the Queen's Gambit), mistakes to avoid (the quickest mate, stopping a mate threat); leads into the Openings puzzles | paid |
| 5 | Playing well | (5) what the pieces are worth, free (hanging) pieces, trading, mate with the queen, mate with the rook and the back-rank mate | paid |
| 6 | First tactics | (4) fork, pin, discovered attack, practice; each points to its Puzzles module | paid |
| 7 | First endgames | (4) the active king, the passed pawn, the opposition, the edge pawn | paid |
| 8 | Coordinates | (4) files and ranks, square names, writing moves down (letters, x, +, #, castling), reading a game; the board shows letters and numbers on its frame in these lessons only, and only here do the texts name squares | paid |

**Price (decided):** chapters 1 and 2 are free (guests too, like the free puzzles). The paid
chapters open **together** for **75,000 coins**, the coins of the €19.99 pack (about €20,
see 4.5), or are open with any **Premium** plan (4.9). Finishing a chapter pays
**250 coins once**; there are no stars. Checkmate is taught in chapter 2, so the free part
is enough to play a whole game.

**First version:** chapters 1–3, then 4–7.

**How it is built (October 2026):**
- **Structure and rules** (`_shared/learn.ts`): the chapters with their lesson ids, the price
  (`LEARN_PRICE`), the reward (`CHAPTER_REWARD`), lessons in order (`lessonOpen`). Chapters
  not written yet have no lessons and show "Coming soon"; unlocking opens them too.
- **Lessons** (`src/features/learn/lessons.ts`): steps of text with a board (FEN), moves the
  board plays first, stars, arrows, a piece's moves shown, a task (collect the stars, take
  every piece, a given move, check, checkmate, get out of check) or a quiz. Boards without
  both kings are "free": any pieces, no end of game, and the player moves again after each
  move. `tests/learn.test.ts` proves every task can be done and every quiz has one answer.
- **Play** (`src/features/game/modes/learn.ts`, `LessonCoach.tsx`): on the 3D board, with
  gold stars on squares (`BoardView.setGoals`); a wrong move is explained by the rule and
  taken back. The 3D look is unchanged.
- **Server** (`puzzles` function, actions `learn`, `learn_done`, `learn_unlock`; tables
  `learn_lessons`, `learn_chapters`, `learn_unlocks`, migration `20261021120000`): lessons in
  order, at least 8 s apart (`MIN_LESSON_MS`), the reward once per chapter in the same
  transaction. Guests take the free chapters; their lessons and rewards move into the
  account with the puzzles (`claim`).
- **Pages:** `/learn` (chapters, the unlock), `/learn/:chapter` (lessons), `/game/learn/:id`;
  a Learn card on the Play hub; Learn in the guest's tab bar.


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

**Blocking and reporting** (October 2026). On another player's profile: **Block** and
**Report**; in a chat: a report flag in the header and on each of the other player's messages.
- **Block:** the friendship or request between the two goes, neither can send the other a
  friend request (the blocker gets "unblock them first", the blocked player "you cannot add
  this player"), chat and chat challenges stop (they need friends), matchmaking never pairs
  them (`mm_poll`), and the blocker no longer sees the conversation or the player in
  suggestions. The blocked player is not told. Settings lists blocked players with Unblock.
  At most 500 (`BLOCKS_MAX`).
- **Report:** a reason (abusive, cheating, offensive username, spam, something else), an
  optional note (500 characters), and for a message a copy of it; "Also block" in the same
  dialog. 10 reports a day per player (`REPORTS_PER_DAY`); the same open report again adds
  nothing. Rules in `_shared/social.ts`, writes in the `social` function, tables `blocks`
  and `reports` (migration `20261021090000`). Reports are kept 12 months.
- **The operator reviews** reports in the Supabase dashboard: the view `report_queue` (SQL
  editor: `select * from report_queue`) lists open reports first, with both usernames and how
  often the player was reported. Handling one: `update reports set status = 'resolved'
  (or 'dismissed'), handled_at = now(), handled_note = '…' where id = '…'`. Actions (a new
  username, coins or rank reset, deleting the account) are done by hand for now; an in-app
  moderation page and an email on new reports can come later.

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
their standard item until real items arrive. Later: temporary coin boosts (e.g. +50% coins
for 24 h).

**Buying coins** (October 2026; `supabase/functions/_shared/payments.ts`, "Buy coins" in the
Shop header):

| Pack | Coins | Price (VAT included) | Extra coins per euro |
| --- | --- | --- | --- |
| Small | 15,000 | €4.99 | – |
| Medium | 35,000 | €9.99 | +16% |
| Large | 75,000 | €19.99 | +24% |
| Huge | 200,000 | €49.99 | +33% |

For scale: the Monolith set costs 68,000 coins (about the Large pack), a win pays 100.
Paddle sells the coins as merchant of record (payment, VAT, receipts, payouts to us);
Paddle's fee is 5% + $0.50 per payment, which is why the smallest pack is about €5.
Before paying, the player ticks that they want the coins at once and lose the right of
withdrawal once delivered (EU digital content). Refunds: within 14 days on request if the
balance still holds all the pack's coins (they are removed), later only where the law
requires; a refund or chargeback through Paddle removes the coins (down to zero).
Players under 18 need a parent's consent (Terms §6). Registered, onboarded players only.

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

**Names** of piece sets and boards are the same in every language (the user's rule, October
2026: Classic Marble, Monolith, Squircle); their Czech entries repeat the English.

**Catalogue.** Every category has one free standard item that everyone owns; profile
icons have six free starters. Piece sets and boards are separate items (a set never
includes a board).

| Category | Items (price, rarity) |
| --- | --- |
| Piece sets | Classic Marble (free) · **Squircle** 25,000 common (own models in both colours: pieces that melt from circle to square; low-mid tier) · **Monolith** 68,000 legendary (own models; Black as delivered, White recoloured to ivory marble) |
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

**Where the user puts originals** (`wizard-chess-originals`, agreed October 2026), one
folder per item, by type:

```
pieces/<set>/king.glb … pawn.glb      one colour is enough, any scale, full quality
boards/<board>/chessboard.glb
icons/<icon>.png|svg                  square, at least 512 px, transparent background
backgrounds/<id>/…                    an HDR/EXR sky, a GLB scene or pictures, plus a reference
effects/<id>/…                        capture effects: a reference video or GIF, textures, sounds
animations/<id>/…                     move animations: a reference video or GIF, sounds
sounds/<id>/…                         WAV or OGG
```

(Monolith's originals are in `pieces/monolith/` and `boards/`.) Turning originals into
game files is a step Claude does in a session, once per item: inspect the model, set
heights, the knight's direction, the recolour and the triangle budget, build, check it in
the browser, add the shop item. The session cannot reach Cloudflare, so the workflow
`.github/workflows/models.yml` pulls the originals on GitHub's machine: a commit of
`scripts/assets/request.json` (`inspect` a folder, or `build` an item) starts it, and it
commits the report (`scripts/assets/reports/`) or the built files (`public/assets/`) to
the branch. Effects and animations are written as code from the reference. The deploy
then uploads the result to `wizard-chess-assets`, whose folders match the originals'
(`pieces/<set>/`, `boards/<board>/`, `shop/`); nobody uploads there by hand.

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

Awards: first win, 10 and 100 wins, 500 games, win streaks of 5 and 10, reaching Gold,
Platinum and Diamond, a game with 90%+ accuracy, checkmate in 20 moves or fewer
(`supabase/functions/_shared/awards.ts`). On real accounts the server grants them when a
game is settled or its analysis applied and keeps each with its date and game
(`player_awards`, readable by signed-in players), so an award stays after a season reset
or when the game leaves the history; the result card shows the awards a game earned and
the profile shows when each was earned. Progress bars (e.g. 4/10 wins) come from the
stats. Existing progress was carried over when this started (14 October 2026). The demo
back-end works the awards out from the profile instead.

### 4.7 Messages

One-to-one chats with friends: conversation list, unread badges, game invites inside
the chat.

On the server (M5): only friends can start a conversation or write; after unfriending,
the history stays readable. Messages up to 1,000 characters, at most 20 a minute.
Conversations and messages are visible only to the two players (row-level security) and
are deleted with either account. New messages arrive through realtime (toast and badge).
"Play a friend" and Challenge send the invite as a chat card.

### 4.8 Settings

Language, change email, change password, who can watch my games (4.1 "Spectating"),
sound and music, board preferences
(auto-rotate camera), sign out, delete account.

### 4.9 Premium (subscription) ✅ (October 2026)

Decided with the user on 26 October 2026; the reasoning, the psychology and the design are in
`docs/SUBSCRIPTION.md`. Rules: `supabase/functions/_shared/subscription.ts` (tested in
`tests/subscription.test.ts`, `tests/subscription.e2e.ts`).

**Plans** (prices VAT included; a year costs 8 months, "4 months free"):

| | Apprentice | **Wizard** (recommended) | Archmage |
| --- | --- | --- | --- |
| Monthly / yearly | €4.99 / €39.99 | **€9.99 / €79.99** | €19.99 / €159.99 |
| Puzzles and Learn | every module and chapter, new ones too | ✓ | ✓ |
| Hints | free | free | free |
| Game Review a day | 3 | unlimited | unlimited |
| Coins every month | – | **35,000** (the €9.99 pack) | **75,000** (the €19.99 pack) |
| Streak shields a month | 1 | 2 | 4 |
| Bonus on coin packs | – | +10% | +20% |
| Subscriber icon every month (kept) | – | ✓ | ✓ (animated frame on the badge) |
| The Wardrobe (every for-sale item to use) | – | – | ✓ |
| Early access to new items and modules | – | – | 7 days |
| Badge | silver | gold, gold name | violet, animated |
| Free trial | – | 7 days, once per account | – |

Free players: Openings, the daily puzzle, Learn chapters 1–2, one Game Review a day, streak
shields for 2,500 coins (at most 2 held). The coin prices of modules (100,000) and Learn
(75,000) stay: bought ones stay open for good. **Nothing in a plan changes MMR, matchmaking,
clocks, stakes or season rewards.** Spectating and replays stay free.

**How the benefits work**
- **Monthly coins** are given lazily from the paid periods (`grantsDue`): one grant per
  month that has begun (a yearly payment gives twelve, month by month), with the month's icon
  (`premium-YYYY-MM`, Wizard and Archmage, never for sale) and the shields refilled to the
  plan's number. The trial's zero transaction gives nothing. An upgrade (a payment that starts
  inside the paid period) ends the old payment's months there and tops the current month up to
  the new plan's coins. A refund takes that payment's coins (down to zero) and icons back.
- **Streak shields:** a missed UTC day is kept when the player holds a shield for every missed
  day (used when they next show up, `use_shields`); the day counts as kept, not solved (no
  coins, the streak doesn't grow). At most `shieldCap` held (2, or 4 with Archmage).
- **The Wardrobe** (Archmage): every for-sale item can be equipped; when the plan ends, items not
  owned go back to the standard ones (loadout and icon, `tidyLoadout`). Season rewards and
  monthly icons stay earned.
- **Early access:** items and modules can carry `releaseAt`; Archmage sees them 7 days early.
- **Founders:** subscribed in the month after `PREMIUM_LAUNCH` (null while in Paddle's sandbox):
  a Founder badge, and the price is kept while the subscription runs.
- **Game Review** (`src/features/review/review.ts`, `modes/review.ts`, route
  `/game/review/<id>`): from the result card of any finished game of the player's (vs AI,
  matchmade, online), Stockfish in the browser (30,000 nodes a position) judges every move by
  the drop in the mover's winning chance (best, great: the best move after the opponent's
  mistake, good, inaccuracy ≥ 6, mistake ≥ 12, blunder ≥ 22 points), picks the key moments, and
  the 3D board steps through the game with a green arrow for the better move, described by its
  piece. The server counts the reviews per UTC day (`review_uses`, `start_review`); a game
  reviewed again the same day is free.

**Paying** (`payments` function, Paddle as merchant of record like coin packs): `subscribe`
opens a transaction with the plan's recurring non-catalog price (Wizard's trial once per
account); Paddle's webhooks `subscription.*` keep `subscriptions` in step (older events are
ignored) and `transaction.completed` with a subscription records the paid period
(`subscription_payments`); `change` (upgrade charged at once, a downgrade credited to the next
payment), `cancel` (at the end of the paid period; a trial at once), `resume`, `manage`
(Paddle's customer portal). Deleting the account cancels a running subscription. Before
subscribing the player ticks the withdrawal waiver (EU digital content). The checkout waits
for the plan, then a celebration shows the coins arriving.

**Where it shows** (until live payments: only with `#/premium?test=1` on the real site, always
in the demo, `premiumShown`):
- the Premium page `/premium`: value first, Monthly | Yearly (yearly selected), three cards
  with Wizard in the middle (first on phones), what every plan includes in coins, the
  comparison, questions, the button again;
- "Go Premium" in the sidebar (subscribers see their badge), a Premium button in the Shop;
- contextual offers: locked puzzle modules and Learn ("Included in Premium · from €3.33 a
  month"), the Buy coins dialog (Wizard = the €9.99 pack's coins + everything), the item dialog
  (the Archmage's Wardrobe), the puzzle briefing (free hints), the streak card late in a long
  unsolved day, the result card (Game Review left today);
- one unrequested offer: a card on the Play hub after an account's third day, gone for two
  weeks once closed;
- Settings → Subscription: plan, next payment, what the plan gave so far, change, Paddle's
  portal, cancel in two clicks (what stays, what closes, one offer, the button);
- badges next to names (profile, Community, the sidebar, the cards in games).

**Server** (migration `20261026090000_subscriptions.sql`): `subscriptions`, `subscription_payments`,
`subscription_grants`, `review_uses`, `puzzle_streaks.shields`; functions `sync_subscription`,
`record_subscription_payment`, `grant_subscription`, `reverse_subscription_payment`,
`use_shields`, `buy_shield`, `start_review`; ledger reasons `subscription_coins`,
`subscription_refunded`, `shield_bought`; `player_items` source `subscription`. The player's
state (`ensurePlayer`) carries `premium` and `trial_used` and gives what is owed on every visit;
the showcase carries the badge.

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

**How accuracy is measured (ranked and casual games).** A finished game is settled at once
with neutral accuracy. Then both players' browsers analyse it in the background with the
same Stockfish build (Stockfish 19, lite network, one thread, 30,000 nodes per position,
`supabase/functions/_shared/analysis.ts`) and send a score for every position to the
server. With these fixed settings Stockfish gives exactly the same scores on every
device, so two honest reports are identical. Only when both reports agree does the
server compute each player's accuracy and add the performance part to MMR and coins
(`performanceAdjustment`: the same settlement with the accuracy, minus the neutral one;
streaks and stats don't change). If the reports differ, one never arrives (tab closed,
no WebAssembly) or a day passes, the game keeps neutral accuracy. A cheater can therefore
only cancel the performance part, never gain from it. The result screen shows the
analysis progress, the player's accuracy and whether the performance part was added;
the analysis keeps running when the player leaves the game screen and resumes after a
reload (for a day). It takes about 5–15 s per game on a computer, longer on a phone.

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

**Start:** season 1 starts when ranked opens (`SEASON_ONE`, 4.1), and seasons follow back
to back. Until then no season runs: nobody gets season rewards and nobody's MMR is reset
(decided October 2026; the calendar that counted from July 2026 is gone, and nothing was
handed out for it). When season 1 starts everyone begins it fresh at 1,000 MMR (Silver II),
with win streaks reset.

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
shop purchases are the other one, and streak shields (2,500 coins, 4.9) a small third. A player needs at least the stake in their balance.

### 6.3 Anti-abuse

- All rewards are computed and credited on the server, written to a transaction ledger
  (`coin_ledger`: games, stakes, payouts, purchases, season rewards).
- Games with fewer than **20 half-moves (10 moves each)** pay no coins; ranked MMR still
  counts, so resigning early still costs rating (decided October 2026). Coin games are
  not affected: the stake is the point. Aborted games change nothing.
- **No daily coin cap** (decided October 2026): instead, detect unusual behaviour (9,
  after the release), such as 100 games an hour, two accounts from the same IP address, or
  the same two players handing each other wins. Storing IP addresses for this needs the
  Privacy Policy updated first.

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
- **Start framing:** a game starts at the classic distance, or further away on narrow
  screens (phones held upright) so the whole width of the board is in view.
- **Camera:** drag to orbit, right-drag to pan, scroll or pinch to zoom; zooming out goes
  far enough (distance 42) to see the whole board on a phone, and beyond the earlier
  limit (26) the fog thins so the board stays clear.
- **Vibration on phones** (20 October 2026, the user's request; `src/audio/haptics.ts`, off
  in Settings). Designed after what haptics research and practice agree on: strength and
  rhythm set how intense something feels, rising patterns read as good news and flat ones
  as bad, frequent events stay subtle and haptics only add to sound and picture. So: your
  own move is crisp and every piece has its character (a pawn ticks, a knight hops and
  lands, a bishop glides, a rook thuds, the queen a graceful double, the king a slow heavy
  step); the opponent's moves are the same at half strength; taking a piece is a firm hit
  with a pleasant echo, bigger for bigger pieces, while losing one is a single dull buzz,
  longer for bigger losses; castling two taps, promotion rising; giving check two pointed
  taps, being in check a warning; a win a rising flourish, a loss a long low fade. In
  puzzles a right move "da-DUM", a wrong one a flat buzz, a hint a tick, a solve a flourish,
  and the daily streak a celebration that grows with its tier. Android browsers vibrate
  with the full patterns; iPhones have no vibration for websites, so Safari (iOS 18+) gets
  one system tick per beat through a hidden switch, which Apple may stop.

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
  verified with perft). The same worker estimates accuracy for the result screen of AI
  games and demo matches. On the mock back-end, matchmade opponents are played by this
  engine and marked "Demo".
- **Engine analysis:** Stockfish 19 compiled to WebAssembly (lite, single-threaded,
  `public/engine/`, GPL v3 with its licence and source links next to it) runs in a Web
  Worker (`src/ai/stockfish.ts`). `src/ai/analysis.ts` queues the player's finished ranked
  and casual games, keeps the queue in `localStorage` for a day, and reports to the server
  (5.2).
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
| Edge Functions | game moves, clocks and results (✅ `game`), profiles, shop and seasons (✅ `account`), friends and chat (✅ M5: `social`), matchmaking and history (✅ M6: `play`), coins for money (✅ `payments`), puzzles (✅ `puzzles`) |
| Realtime | live moves (✅; spectators follow `game_watch`, 4.1), who is online (✅ presence), chat and friend requests (✅), matchmaking notifications. On the free plan Supabase stops realtime for an idle project and restarts it on the next connection, dropping the first updates; the app re-reads a watched game every 4 s and the badges every 20 s, so nothing gets stuck |
| Payments | ✅ in code: the `payments` function creates a Paddle transaction for a pack (price given inline, nothing set up in Paddle's catalogue; `custom_data` = player and pack) that the app opens in Paddle's overlay checkout (Paddle.js, loaded only then); Paddle's signed webhook (`transaction.completed`, refunds and chargebacks as `adjustment.*`) credits or takes back the coins once (`purchases`, `complete_purchase`, `reverse_purchase`, ledger `coins_bought` / `coins_refunded`). Sandbox (test payments) until the live account is approved; in sandbox the Shop shows "Buy coins" only with `#/shop?buy=coins` |
| Engine analysis | ✅ in the players' browsers (5.2): the `play` function takes each player's report (`analysis`), the `game_analysis` table (server only) keeps the settlement's input and both reports for two days, and `apply_analysis` adds the performance part once both agree (ledger reason `performance`). Edge Functions are too CPU-limited for Stockfish; a server of our own (`engine/`, Oracle Cloud) is ready but unused |
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
player_awards   player_id, award_id, earned_at, game_id  (✅; definitions in code)
```

Spectating (✅, 4.1): `game_watch` (the spectators' copy of each game, kept by a trigger on
`games`, moves delayed in running ranked and coin games; readable where `can_watch` allows)
and `profiles.watch` (everyone | friends | nobody). `games` itself is readable by its
players, and by anyone while it waits for a second player.

Puzzles (✅): `puzzle_solves` (player_id, module, idx, best stars, first solved_at),
`puzzle_modules` (player_id, module, unlocked_at, completed_at, reward_item,
reward_coins) and `puzzle_attempts` (the puzzle a player has open and since when; server
only). Players read their own solves and modules; every write goes through the `puzzles`
function.

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

4. **Paddle (buying coins).** Sandbox first (sandbox-vendors.paddle.com, separate from the
   live account): Developer tools → Authentication: an **API key** (permission to write
   transactions) → GitHub secret `PADDLE_API_KEY`; a **client-side token** → GitHub variable
   `PADDLE_CLIENT_TOKEN` (public). Developer tools → Notifications: a destination
   `https://yhzgrorvjfvbqshneipc.supabase.co/functions/v1/payments` with the events
   `transaction.completed`, `adjustment.created`, `adjustment.updated` and, for Premium,
   `subscription.created`, `subscription.updated`, `subscription.activated`,
   `subscription.trialing`, `subscription.past_due`, `subscription.paused`,
   `subscription.resumed` and `subscription.canceled`; its secret key →
   GitHub secret `PADDLE_WEBHOOK_SECRET`. Checkout → Checkout settings: default payment
   link `https://prodbylcsh.github.io/Chess-3D/`. GitHub variable `PADDLE_ENV` = `sandbox`.
   Then run both deploy workflows by hand. Going live: the same in the live account, plus
   Paddle's account and domain review (needs our own domain, the Terms with prices and the
   refund policy), then `PADDLE_ENV` = `production`.

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
| M7 Real items | Asset pipeline and folders, model piece sets and boards in games, 3D item view, item catalogue and ownership in the database, first set and board (Monolith), placeholders removed | ✅ live (October 2026) |
| Engine analysis | Stockfish in the players' browsers, both reports must agree, performance part of MMR and coins | ✅ live (October 2026) |
| Buying coins | Coin packs through Paddle (sandbox), purchase terms, refunds | ✅ live in sandbox (October 2026): test payments work |
| Puzzles | Seven themed modules of 100 puzzles (Lichess, plus hand-made openings), level map, themed scene, coins, bonus every 10, shop item for finishing, unlocking for coins; daily puzzle and streak, reviews, why-not refutations, the solution when stuck, replays, arrows, vibration | ✅ live (October 2026) |
| Ranked waits for players | Ranked closed and shown as "Soon"; no season runs until ranked opens with season 1 (`SEASON_ONE`, 4.1, 5.5) | ✅ (October 2026) |
| Guests in puzzles | Try the first 10 Openings puzzles and the daily puzzle without an account; the progress and coins move into the account on signing up or in on the same device (4.2) | ✅ live (October 2026) |
| Blocking and reporting | Block a player (no friendship, requests, chat or matches between them) and report a player or a message; the operator reviews them in the dashboard (4.4) | ✅ (October 2026) |
| Learn | A teaching module, separate from Puzzles: chapters from the pieces to first endgames, incl. Opening moves; chapters 1–2 free, the rest 75,000 coins or the subscription (4.3) | ✅ all 8 chapters live (October 2026) |
| Puzzle map scenery | The user's PBR models on every module's map: things along the path, landmarks, plus a horizon (4.2; `scripts/assets/build-map.ts`) | ✅ built (October 2026) |
| Spectating | Watch a running online game (watch link, friends' "Playing now"), read-only, with the same 3D board and the players' items; "N watching"; ranked and coin games two moves behind; who may watch in Settings (4.1) | ✅ (October 2026) |
| Live now | Running games to watch on the Play hub, friends' first (4.1) | ⏸ built, closed until there are enough games (`LIVE_NOW_OPEN`) |
| Spectating v2 | Spectator chat or emoji reactions (only spectators see them; needs moderation) | ⏸ |
| Replays | Watch any finished game from a profile's history on the 3D board | ⏸ later |
| Before release | Own domain (site, auth emails from our own sender, Google branding), Paddle's live review (and an IČO if needed), Sign in with Apple (Apple Developer Program). **The user handles these closer to the release** (8.4) | ⏸ |
| After release: measurements | Our own numbers, no third-party analytics: players and games per day, how long a search waits, puzzle use; shows when ranked can open | ⏸ |
| After release: unusual behaviour | Detect abuse instead of capping coins (6.3): e.g. 100 games an hour, two accounts from the same IP address, the same two players feeding each other wins; flags for the operator first | ⏸ |
| Premium (subscription) | Three plans: every puzzle module and Learn chapter, monthly coins, Game Review, streak shields, monthly icons, the Wardrobe, early access; the Premium page, offers, Settings, badges (4.9) | ✅ built (October 2026), sandbox; live with the coin packs |
| Later | Game Review from a profile's history, season pass and tournament benefits for subscribers, gifting a month, prices by country; tournaments, more puzzle themes, more sets, boards, backgrounds and effects, boosts | ⏸ |

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
  item in `player_items`. Every season hands out items; with fewer items than brackets
  the most expensive go to the highest brackets (with today's pool, season 1: Challenger
  the Monolith set, Master & Grandmaster the Monolith board, Emerald & Diamond the
  Squircle set). Season 1 starts when ranked opens (5.5).
  The legal pages say so (Privacy §3, Terms §6, effective 11 October 2026); Terms §5
  covers clocks, leaving and the first-move window.
- **No coins under 20 half-moves**, MMR still counts; **30 s first-move window**, else the
  game is aborted (both October 2026).
- **Order of the back-end milestones:** social (friends, chat) before competitive
  (matchmaking, server MMR and coins), October 2026.
- **Buying coins** (October 2026): Paddle as merchant of record, web only (App Store
  later); four packs from €4.99 (4.5); withdrawal waiver ticked before paying; refunds
  within 14 days while the coins are unspent. Legal pages (Terms §1 address and §6
  "Buying coins", Privacy §2–§6 with Paddle) effective 14 October 2026. Whether Paddle
  accepts in-game currency is confirmed with Paddle's support before going live; the
  operator has no IČO yet, which Paddle's live review and Czech tax law may require.
- **Accuracy from Stockfish in the players' browsers** (October 2026), counted only when
  both players' analyses agree (5.2); no engine server, so it costs nothing. The Oracle
  Cloud server in `engine/` stays as an option (Oracle's free tier is now 2 OCPU / 12 GB
  and often out of capacity).
  The legal pages say so (Privacy §2, §3 and §6; Terms §4, §6 and §7 with the Stockfish
  licence; effective 13 October 2026).
- **Puzzles** (October 2026, 4.2): themed modules of 100, only Openings free, the others
  100,000 coins each (a subscription later); 25–50 coins per first solve, 500 for every 10
  solved in a module, a random unowned shop item (or 25,000 coins) for finishing one; six
  tactics modules first, then Openings (100 hand-made lines from the first move, both
  colours, since 19 October 2026); fantasy and other themes later. The legal pages say so (Privacy
  §2 and §6, Terms §6; effective 15 October 2026).
- **No third-party requests** from the site apart from the back-end: fonts are served
  with the site (`@fontsource`), no cookies, analytics or ads.
- **Languages**: English (default) and Czech.
- **Ranked closed at launch** (October 2026): ranked games open only once there are enough
  players for fair matches; until then the Play hub shows ranked as "Soon" and the server
  refuses ranked searches (`SEASON_ONE`, 4.1). Casual and coin games stay open.
- **Abuse is detected, not capped** (October 2026): no daily coin cap; unusual behaviour
  (many games an hour, accounts sharing an IP, wins handed back and forth) is detected after
  the release (6.3, 9).
- **Blocking and reporting** (October 2026, 4.4): a block ends the friendship, stops requests
  both ways and keeps the two apart in matchmaking, without telling the blocked player;
  reports go to the operator (dashboard view `report_queue`), kept 12 months. The legal pages
  say so (Privacy §2 and §6, Terms §4; effective 21 October 2026).
- **Learn** (October 2026, 4.3): teaching first, 7 chapters including Opening moves;
  chapters 1–2 free (checkmate is in chapter 2), the rest together 75,000 coins (the coins
  of the €19.99 pack) or free with the subscription; 250 coins once per finished chapter,
  no stars; chapters 1–3 first; a coordinates lesson near the end.
- **The platform has to make money** (October 2026, 1): free parts bring players in, paid
  parts and coin packs earn.
- **Season 1 starts everyone at 1,000 MMR** (October 2026, 5.5).
- **Guests in puzzles** (October 2026, 4.2): the first 10 puzzles of the free module and the
  daily puzzle without an account; what they earn moves into the account on the same device,
  by the account's rules. The legal pages say so (Privacy §2, §3, §6; Terms §6).
- **Roadmap order** (October 2026): guests in puzzles, then blocking and reporting, then
  Learn; spectating later; map decorations (built 22 October 2026, 4.2); measurements and
  abuse detection after the release; domain, live payments and Sign in with Apple are the
  user's to do closer to the release.
- **Seasons wait for ranked** (October 2026): no season rewards while ranked is closed; the
  first real season (season 1) starts when ranked opens, everyone at 1,000 MMR (5.5).

- **Spectating** (25 October 2026, 4.1): watch links and friends' "Playing now" with
  Watch; the players' items on the spectator's board; "N watching" for players and
  spectators; ranked and coin games two moves behind while they run; "Who can watch my
  games" (everyone with the link by default, friends, nobody), blocked players never; free.
  "Live now" built but closed ("Soon"); spectator chat or reactions in v2; replays later.
  The legal pages say so (Privacy §2 and §6, Terms §4; effective 25 October 2026).

- **Premium** (26 October 2026, 4.9, `docs/SUBSCRIPTION.md`): three plans, Apprentice €4.99,
  Wizard €9.99, Archmage €19.99 a month, a year = 8 months; every plan opens every module and
  Learn chapter; Wizard and Archmage give their price back in coins every month (35,000 /
  75,000, paid monthly on yearly plans too; this needs about one new shop item a month, which
  the unused animations and effects in the engine and new icons can supply); Game Review
  (1 / 3 / unlimited a day); streak shields (1 / 2 / 4 a month, 2,500 coins for everyone); the
  Wardrobe for Archmage (items not bought are lost when the plan ends); +10% / +20% on coin
  packs; monthly icons; early access; badges; a 7-day Wizard trial (coins from the first
  payment); Founders; plan names the same in every language; the placements in 4.9. The legal
  pages say so (Terms §6 "Premium", Privacy §2, §4, §6; effective 26 October 2026).

Open:

1. Which languages come after Czech?
