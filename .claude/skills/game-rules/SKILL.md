---
name: game-rules
description: The decided product rules of Wizard Chess: ranked MMR, ranks and divisions, coin rewards, coin stakes, seasons and season rewards, username limits, which game kinds pay. Use before changing or displaying anything about MMR, ranks, coins, stakes, seasons or rewards, and when the user proposes a rule change.
---

# Product rules (decided with the user)

These values were agreed one by one with the user. **Don't change them on your own**,
not even to "fix" something that looks unbalanced. Propose the change, wait for a yes,
then change the code, tests and docs together and record it in `docs/PLATFORM.md` §10.

## Where the rules live

All rules are pure functions in `supabase/functions/_shared/` and are shared by the
server and the app. The app only previews and displays; the server applies.

| Rules | File | Tests | Docs |
| --- | --- | --- | --- |
| MMR change, ranks, accuracy | `rating.ts` | `tests/rating.test.ts` (includes the §5.3 worked examples) | §5 |
| Coin rewards, stakes, fee | `economy.ts` | `tests/rating.test.ts` | §6 |
| Season calendar, resets, brackets, reward picking | `seasons.ts` | `tests/seasons.test.ts` | §5.5 |
| Shop prices and purchase rules | `shop.ts` | `tests/shop.test.ts` | §4.5 |
| Usernames, reserved names, the 30-day limit, onboarding | `accounts.ts` | `tests/accounts.test.ts`, `tests/accounts.e2e.ts` | §2 |

Never copy these numbers into UI code. Import them (`#shared/rating.ts` etc.) and use
`rankOf`, `bracketOf`, `STAKES`, `COINS`, `resetShare` and so on.

## The decisions

- **MMR:** start 1,000. Win +20, loss −18 (the small average gain is intended: it rewards
  playing, and seasons reset the drift). Draw 0 baseline, with half the difference and
  half the performance; the streak is unchanged.
- **Difference:** 10% of the gap, in the direction that rewards upsets; upset bonus at
  most 30, expected-result reduction at most 15.
- **Performance:** ±20% of the baseline from accuracy; 70% accuracy is neutral.
- **Streak (ranked):** 3rd win +10% of the baseline, +2% per further win, capped at +30%. A
  loss resets it; a draw keeps it.
- **Ranks:** Iron → Challenger; tiers below Master have divisions IV–I of 100 MMR
  (new players are Silver II). Master, Grandmaster and Challenger have no divisions.
  **MMR numbers are never shown**, only ranks and progress bars (the result card shows
  the MMR *change*).
- **Who pays what:** coins and MMR only from **ranked** and **casual** games (casual gives
  coins, not MMR). **No coins and no MMR** from friend, AI or same-device games.
- **Coins:** win 100 / draw 75 / loss 50, adjusted for performance (±20%), rating gap
  (ranked only) and streak; at least half the baseline. New accounts start with 500.
- **Play for coins:** stakes 100 / 500 / 2,000; the winner takes the pot minus a **10% fee**.
- **Time controls:** Blitz 5+3, Rapid 10+5 and Classical 15+10 for Ranked, Casual and Play
  for coins; Fast blitz 3+2 for Casual only; no clock for friends, AI and same device.
- **Seasons:** 3 months, season 1 started July 2026. At season end MMR is pulled towards
  1,000 by 25%, by 50% every 4th season, and by 100% every 12th (everyone back to 1,000).
  Win streaks reset.
- **Season rewards:** by the **highest** rank reached in the season. Ranks are grouped in
  brackets: Iron 500 coins · Bronze & Silver 1,000 · Gold & Platinum 2,000 · Emerald &
  Diamond 4,000 · Master & Grandmaster 7,500 · Challenger 12,000. Each bracket gets a
  unique badge, a unique profile icon, the coins and one shop item (piece set, board or
  effect). The item is random, but nothing from the previous 3 seasons repeats, brackets
  get different items, and a higher bracket never gets a cheaper item. A player who
  already owns the item gets its price in coins instead.
- **Shop prices:** see §4.5 and the shop-items skill.
- **Username:** 3–20 characters (letters, digits, `_`), unique regardless of case, some
  names reserved (`RESERVED_USERNAMES`); changeable once per 30 days after onboarding.
  **Profile icons:** six starters during onboarding, no photo uploads; more come from the
  Shop and seasons.
- **Accounts:** email sign-ups must confirm their address before playing; guests (invite
  links) play without a profile and are invited to register afterwards.
- **Coins have no real-money value** (Terms of Service §5): no cash-out, no transfers
  between players, no refunds. Buying coins with real money comes later; before it does,
  the Terms (`public/legal/`, both languages) get the purchase conditions and the
  operator's business details.
- **Languages:** English is the default; Czech is complete. Which language comes next is
  still open.

## When a rule changes (after the user said yes)

1. Change the function or constant in `_shared/` (plain TS that Node runs: explicit `.ts`
   import extensions, no TypeScript parameter properties or enums).
2. Update or add tests. If §5.3's worked examples change, update the test and the doc
   table from the actual output.
3. Update `docs/PLATFORM.md` (the section and §10 Decisions).
4. Check where the UI explains the rule (result card breakdown, stake picker, season
   panel, onboarding text) and the Czech text for it.
5. The server applies the same module (Edge Function `game`), and it deploys from `main`
   via `.github/workflows/supabase.yml`. Never deploy or merge to `main` without the
   user's go-ahead.
