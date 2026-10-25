# Wizard Chess Premium: the subscription plan (proposal)

Status: **proposal, 25 October 2026. Nothing here is decided yet.** The numbers, plan names
and economy changes wait for the user's yes (CLAUDE.md: prices and product rules are the
user's). When they are decided, the rules move into `docs/PLATFORM.md` (§1, §4, §6, §10)
and this file becomes the design record of the subscription.

What this document does: it looks at what the platform has now, what it is about to get
and what it may get later; puts a coin and euro value on all of it; and builds three plans
from that, so that the middle plan is the obvious choice. Then it covers the changes to
the economy, the psychology behind each choice, how the plans are shown and promoted, the
legal side, the build, and the open decisions.

---

## 1. Starting point: what things cost and what they are worth

### 1.1 What a coin is worth in euros

The coin packs (§4.5) set the value of a coin:

| Pack | Coins | Price | Coins per euro |
| --- | --- | --- | --- |
| Small | 15,000 | €4.99 | 3,006 |
| Medium | 35,000 | €9.99 | 3,503 |
| Large | 75,000 | €19.99 | 3,752 |
| Huge | 200,000 | €49.99 | 4,001 |

So **1 € ≈ 3,500–4,000 coins**, and 100,000 coins ≈ €25–33.

### 1.2 What a free player earns

| Source | Coins | Per month, active player |
| --- | --- | --- |
| Casual or ranked games | 100 win / 75 draw / 50 loss (± performance) | ≈ 22,000 at 10 games a day, ≈ 7,000 at 3 a day |
| Daily puzzle | 40 a day + streak milestones (100 / 300 / 600 / 1,500 in the first 30 days) | ≈ 1,200 + 2,500 in the first month |
| Puzzle module (once) | 25–50 a puzzle + 500 every 10 + a shop item at the end | ≈ 8,700 + an item, once per module |
| Learn (once) | 250 a chapter | 2,000 once |

A dedicated free player earns about **10,000–25,000 coins a month**.

### 1.3 What is locked today, priced in coins and euros

| Locked content | Coins | ≈ Euros in packs |
| --- | --- | --- |
| 6 puzzle modules (100,000 each) | 600,000 | €150–200 |
| Learn chapters 3–8 | 75,000 | €20 |
| The shop (Squircle 25,000, Monolith set 68,000, Monolith board 42,500, 6 icons 12,500) | 148,000 | €37–49 |
| **Total** | **823,000** | **≈ €210–270** |

At 20,000 coins a month, a free player needs **about 3 years** to open everything. That
gap is what the subscription sells: everything now, for a small monthly price.

### 1.4 What other chess sites charge

Chess.com sells Gold, Platinum and Diamond for about €50, €85 and €125 a year (≈ €6, €10
and €15 month by month, by region). Lichess is free. Wizard Chess has less training
content than Chess.com, but it has the 3D board, the cosmetics and the coin economy, which
Chess.com does not. So: **cheaper than Chess.com for the content, with coins and looks on
top.**

### 1.5 What the operator keeps

Paddle takes 5% + $0.50 (≈ €0.46) per payment, and VAT (21% in Czechia; Paddle applies the
buyer's country) comes out of the price.

| Price | Without 21% VAT | Paddle | **Kept** | Share |
| --- | --- | --- | --- | --- |
| €4.99 a month | €4.12 | €0.71 | **€3.41** | 68% |
| €9.99 a month | €8.26 | €0.96 | **€7.30** | 73% |
| €19.99 a month | €16.52 | €1.46 | **€15.06** | 75% |
| €39.99 a year | €33.05 | €2.46 | **€30.59** | 76% |
| €79.99 a year | €66.11 | €4.46 | **€61.65** | 77% |
| €159.99 a year | €132.22 | €8.46 | **€123.76** | 77% |

The $0.50 per payment is why nothing should cost less than about €4.99 a month, and why
yearly plans keep more of the money.

---

## 2. Everything that could go into the subscription

The list covers what exists, what is planned and what may come later. Each item is rated
by how much a player wants it, what it costs us to give, and whether it harms fairness.

**Rule that does not change:** *coins buy looks, never an advantage* (§1). Nothing in a
plan changes MMR, matchmaking, clocks, stakes or season rewards. Ranked stays equal for
everyone. Benefits are content, coins, looks, tools used after a game, and status.

| # | Benefit | Exists? | Wanted | Our cost | Fair? | Use |
| --- | --- | --- | --- | --- | --- | --- |
| A | All puzzle modules, including every future one | ✅ | high | none (already built) | ✅ | **major**, all plans |
| B | All Learn chapters, including future courses | ✅ | high | none | ✅ | **major**, all plans |
| C | Coins every month | ✅ (coins) | very high | inflation (6.4) | ✅ (looks only) | **major**, Wizard, Archmage |
| D | **Game Review**: every move of your game judged on the 3D board, key moments, best moves, "play it again from here" | 🔜 new (the analysis already scores every position, `src/ai/analysis.ts`) | very high (the main reason people pay Chess.com) | about one milestone of work | ✅ only after the game | **major**: a taste free, more in plans |
| E | **The Wardrobe**: use every shop item (sets, boards, effects, backgrounds) while subscribed | new rule, little code | high for collectors | fewer item sales to these players | ✅ | **major**, Archmage |
| F | Free hints in puzzles (no coins off) | ✅ | medium | ≤ 10 coins a puzzle | ✅ (stars still count hints) | minor, all plans |
| G | **Streak shields**: a missed day does not end the daily streak | new | high (loss aversion; Duolingo's best seller) | a few milestone coins | ✅ | minor, rising by plan; also sold for coins |
| H | A subscriber-only profile icon every month, kept forever | new (icons are code, `src/ui/art/art.tsx`) | medium; collectors high | small (one icon design a month) | ✅ | minor, Wizard, Archmage |
| I | Profile badge and name colour (profile, cards in games, chat, Community) | new | medium; visible to others = advert | tiny | ✅ | minor, all plans (per plan) |
| J | Bonus coins on coin packs (+10% / +20%) | new | medium | some coins | ✅ | minor, Wizard, Archmage |
| K | Early access: new items and puzzle modules 7 days before everyone | new | medium–high for collectors | none | ✅ | minor, Archmage |
| L | Value counter: "since you joined: 140,000 coins, 4 modules, 38 reviews" | new | lowers cancellations | tiny | ✅ | minor, all plans |
| M | Founder badge (subscribed in the first month after launch) | new | high at launch (real, one-time) | none | ✅ | launch offer |
| N | Replays of finished games (roadmap) | 🔜 | medium | – | ✅ | **stays free** (shared replays bring players in) |
| O | Tournaments (roadmap): a free entry a week; a subscriber cup for a cosmetic prize | 🔜 | medium | entry coins | ✅ if the prize is cosmetic | later, Wizard, Archmage |
| P | Season pass: a second, cosmetic reward track each season | idea | high in games | content each season | ✅ | later, Wizard, Archmage |
| Q | Spectator reactions (spectating v2): a subscriber set of reactions | 🔜 v2 | low–medium | tiny | ✅ | later, minor |
| R | New puzzle themes (fantasy), community puzzles | idea | medium | content | ✅ | automatically in A |
| S | Practice against Stockfish from any position (a review moment, a puzzle) | new, comes with D | medium | none (in the browser) | ✅ only outside rated games | with D |
| – | More MMR, faster matchmaking, more time, bigger stakes, extra season rewards | – | – | – | ❌ | **never** |
| – | Spectating behind a paywall | – | – | – | ❌ stops links from spreading | **never** (§4.1) |
| – | Ads for free players | – | – | – | – | not proposed (no third-party requests, §10) |

---

## 3. The plans

### 3.1 Structure: three plans, the middle one the obvious choice

- **Apprentice: learn and train.** All the content (puzzles, Learn) and the learning
  perks. No coins. For learners and parents buying for a child.
- **Wizard: the full game (recommended).** Everything in Apprentice, plus every month
  **the coins of the €9.99 pack**, unlimited Game Review, streak shields, a new icon
  every month and the gold badge.
- **Archmage: every look, all the time.** Everything in Wizard, plus every month **the
  coins of the €19.99 pack**, the Wardrobe (every shop item to use), early access and the
  animated badge. For collectors, and as the top plan that makes Wizard look reasonable.

**The core message** (also the reason it "makes sense with the coins"):

> **Wizard and Archmage give back their price in coins every month: the same coins as the
> coin pack that costs the same. Every puzzle, every lesson and all the rest come on top.**

That turns the choice from "is it worth €9.99?" into "I was going to buy coins anyway."

### 3.2 Prices (proposed)

Yearly = 8 × monthly (**4 months free, −33%**). Prices end in .99 like the coin packs.

| | Monthly | Yearly | Yearly, per month |
| --- | --- | --- | --- |
| Apprentice | **€4.99** | **€39.99** | €3.33 |
| Wizard | **€9.99** | **€79.99** | €6.67 |
| Archmage | **€19.99** | **€159.99** | €13.33 |

The monthly prices are the prices of the three smaller coin packs, on purpose: the Buy
coins dialog can put the €9.99 pack and the €9.99 plan side by side (5.3).

Wizard yearly (€6.67 a month) is a little above Chess.com Gold and well under Platinum,
and it also pays 420,000 coins a year.

### 3.3 What each plan contains

| | Free | Apprentice | **Wizard** | Archmage |
| --- | --- | --- | --- | --- |
| **Price** | – | €4.99 / mo · €39.99 / yr | **€9.99 / mo · €79.99 / yr** | €19.99 / mo · €159.99 / yr |
| **Puzzles** | Openings + daily puzzle | **all 7 modules + every new one** | ✓ | ✓ |
| **Learn** | chapters 1–2 | **all chapters + new courses** | ✓ | ✓ |
| **Game Review** | 1 a day | 3 a day | **unlimited** | unlimited |
| **Coins every month** | – | – | **35,000** (= the €9.99 pack) | **75,000** (= the €19.99 pack) |
| Hints in puzzles | up to 10 coins | free | free | free |
| Streak shields a month | buy for 2,500 coins | 1 | 2 | 4 |
| Bonus on coin packs | – | – | +10% | +20% |
| Monthly subscriber icon (kept forever) | – | – | ✓ | ✓ + an animated frame |
| **Wardrobe**: every shop item to use | – | – | – | **✓** |
| Early access to new items and modules | – | – | – | 7 days |
| Badge | – | Apprentice (silver) | Wizard (gold, gold name) | Archmage (violet, animated) |
| Free trial | – | – | **7 days** | – |
| Later (when built) | – | – | free tournament entry weekly, season pass | + subscriber cup |

**Why every plan gets all the content.** Content costs us nothing more per player, and it
is what people pay for first ("I want to keep learning"). Giving it to every plan makes
the lowest plan honest and simple. Wizard does not add more content, it adds **coins worth
more than the €5 step up**. That step is what makes Wizard the clear pick:

| Step | You pay extra | You get extra |
| --- | --- | --- |
| Apprentice → Wizard | €5 a month | 35,000 coins (a €9.99 pack) + unlimited reviews + 1 more shield + icon + gold badge |
| Wizard → Archmage | €10 a month | 40,000 coins more (> a €9.99 pack) + the Wardrobe (148,000 coins of items today, growing) + early access |

Each step returns more in coins than it costs. That is the decoy effect done honestly: no
plan is a trick, but Apprentice is visibly the "almost" plan.

### 3.4 How the benefits work in detail

**Puzzles and Learn.** While subscribed, every module and chapter is open (current and
future). Modules or Learn bought with coins stay owned for good. When the subscription
ends, the modules and chapters not owned close again; **all progress, stars and coins
stay**, and everything opens again on resubscribing ("Your 63 stars in Forks are waiting").
The 100,000-coin unlock stays for players who prefer to own.

**Coins every month.** Paid at once on each payment, so the first thing a new subscriber
sees is their balance jumping (a "payday" moment every month, which reminds them of the
value right when they are charged). Yearly plans also get the coins **month by month**
(35,000 each month, not 420,000 at once): it keeps the economy calm and makes refunds
simple. Coins already received stay after cancelling. A refund of a payment takes that
payment's coins back, down to zero, like a pack (§4.5).

**Game Review** (to build, 7.3). After a ranked, casual, coin, friend or AI game, the
3D board replays the game with the analysis: accuracy for both players, each move marked
(best, good, inaccuracy, mistake, blunder, great move), the 3–5 key moments, the better
move as a green arrow with a sentence on why (the same style as the puzzles' "why not?"),
and "Play from here" against Stockfish. Free: one review a day (enough to see how good it
is). Apprentice: three. Wizard and Archmage: unlimited. It is a tool used after the game,
so it does not touch fairness, and spectators still cannot analyse running games.

**Streak shields.** A shield is used automatically on a missed UTC day and the streak
continues (the day counts as kept, not solved: it pays no daily coins). At most 4 held.
Plans refill to their number each month. Everyone can buy shields for **2,500 coins**
(at most 2 held without a plan), which is a new coin sink. Milestones still need the
streak's days to pass, so a shield never jumps a milestone.

**Monthly icon.** A new profile icon each month for Wizard and Archmage, never sold,
kept forever even after cancelling ("Premium · March 2027"). Collecting them is a reason
to stay subscribed. Archmage's version has an animated frame.

**Wardrobe** (Archmage). Every shop item that is for sale can be equipped while
subscribed, including new ones, 7 days before they go on sale. Season rewards and monthly
icons are not included (they must stay earned). When the plan ends, items not owned go
back to the player's owned or standard ones. Coins still buy items to keep for good.

**Badge.** Shown next to the name on the profile, in Community, chat, on the player cards
in games and on the spectator screen. The 3D board itself is unchanged. Tapping someone's
badge opens the Premium page: every subscriber advertises the plan.

**Founders** (launch offer, one time). Everyone who subscribes in the first month after
launch keeps a **Founder** badge forever and keeps their price as long as the subscription
runs. It is real scarcity with a real end date (allowed; fake countdowns are not).

**Free trial** (Wizard, 7 days). Everything in Wizard except the coins and the icon,
which come with the first payment, so a trial cannot be farmed for coins with new
accounts. A card is needed to start. One trial per account. The app reminds the player
2 days before the trial ends, in the app (and by email once our own sender exists).

### 3.5 Changing plans, failed payments, cancelling

- **Upgrade** (to a higher plan or to yearly): at once; Paddle charges the prorated
  difference; the coins of the new plan for this period are topped up to its amount.
- **Downgrade**: at the end of the current period.
- **Failed payment**: Paddle retries for a few days; the plan keeps working meanwhile,
  without new coins until a payment succeeds; then it ends.
- **Cancel**: in Settings, two clicks (5.6); the plan runs until the end of the period
  already paid.

---

## 4. Changes to the economy (proposed)

| # | Change | Why |
| --- | --- | --- |
| E1 | The 6 paid modules and Learn chapters 3–8 open with any plan; the coin prices (100,000 / 75,000) stay | the coin price is the anchor that makes the plan look cheap: "600,000 coins of puzzles, or €3.33 a month" |
| E2 | Hints are free with a plan (the stars still count them) | small, everyday reminder of the plan |
| E3 | **Streak shields** for everyone: 2,500 coins each, at most 2 held (4 with Archmage) | a new coin sink, and the strongest small reason to subscribe |
| E4 | Monthly coin grants of 35,000 / 75,000 | the core of the offer (3.1) |
| E5 | Bonus on coin packs for subscribers: +10% / +20% | keeps packs worth buying for subscribers who want a big item at once |
| E6 | The Wardrobe: Archmage uses every for-sale item | the top plan's main benefit; grows with every new item |
| E7 | Game Review: 1 a day free, 3 Apprentice, unlimited Wizard and Archmage | the biggest new benefit |
| E8 | Coin packs stay as they are | instant big purchases, players who don't want a subscription |

Not changed: game coins, stakes and the fee, puzzle and daily coins, season rewards, MMR,
shop prices.

### 4.1 Will coins lose their meaning? (inflation)

A Wizard who plays 10 games a day earns about 22,000 + 35,000 = 57,000 coins a month and
could buy today's whole shop (148,000) in under three months. Then coins stop being
exciting, and an excited subscriber is the one who stays. What keeps coins meaningful:

1. **New items.** The shop needs about **one new item a month** after launch (plus the
   monthly icon). This is the most important condition of the whole plan, and it depends
   on the user's assets. The cheapest are effects and animations (code, §4.5) and icons.
2. **New sinks:** streak shields (E3), coin boosts (§4.5 "later"), tournament entries,
   bigger stakes, a season pass.
3. **Coins paid monthly**, never a year at once.

If new items cannot come about monthly, lower the grants (Wizard 25,000, Archmage 50,000)
and change the message from "your price back in coins" to "the Squircle set's worth of
coins every month". The proposal keeps 35,000 / 75,000 because the message is so strong.

### 4.2 What it does to coin pack sales

Some players who would buy the €9.99 pack will subscribe instead. That is the goal: the
same €9.99, but every month. Packs stay for big one-off purchases (the Huge pack still
gives the most coins at once), and subscribers get a bonus on them.

### 4.3 A rough revenue example

To show the scale, not a forecast: 1,000 players active in a month, 4% subscribe (a
common figure for games with a good offer), split 25% Apprentice, 60% Wizard, 15% Archmage,
half yearly. The average kept per subscriber is about €6.40 a month, so **≈ €260 a month**
from 40 subscribers, plus coin packs. At 10,000 players, ≈ €2,600. The subscription grows
with the number of players, which is why spending on bringing players in (free content,
watch links) pays back here.

---

## 5. How the plans are shown

### 5.1 The principles

| Principle | Use |
| --- | --- |
| **Value before price** | the page opens with what you get ("Every puzzle. Every lesson. Coins every month."), then the plans; contextual offers lead with the benefit, then "from €3.33 a month" |
| **Price is easy to find** | inside a plan card the price is near the top, above the button: hiding it makes people distrust the offer |
| **Three plans, the middle one highlighted** (centre-stage and compromise effect) | Apprentice · **Wizard** · Archmage left to right; Wizard larger, gold, "Recommended" |
| **Anchoring** | Archmage's €19.99 and the coin prices (600,000 coins of puzzles) make €9.99 feel small |
| **Small price, honest total** | yearly shown as "€6.67 / month" in large type and "€79.99 billed yearly" right below; the monthly price ×12 struck through as a comparison with our own price |
| **Mental accounting** | "35,000 coins every month = the €9.99 pack": the subscription feels free |
| **Instant reward** | coins land at once on payment, with a celebration (like the streak's) |
| **Loss aversion, not fear** | streak shields, "your progress waits", the endowment of the free trial; no fake timers, no guilt texts |
| **Status and social proof** | badges everyone sees; "Recommended", not "Most popular" until our numbers show it (a false "most popular" is a misleading claim under EU law) |
| **Few choices** | 3 plans, 2 billing periods, 1 button per plan |
| **Easy to leave** | cancel in two clicks; trust makes people subscribe sooner |

### 5.2 The Premium page (`/premium`)

A new page, reachable from the sidebar and every offer. Order from top to bottom:

1. **Hero.** Small gold label "WIZARD CHESS PREMIUM" (12 px, letter-spaced). Headline in
   Cinzel, **40 px** on desktop / **30 px** on phones: "Every puzzle. Every lesson. Coins
   every month." Below, 16 px, secondary colour: "Pick a plan. Cancel anytime." No price
   here.
2. **Billing switch**: Monthly | Yearly, with a green "4 months free" chip on Yearly.
   **Yearly is selected by default** (the smaller monthly number is seen first; monthly is
   one tap away).
3. **The three cards.** Desktop: side by side, Wizard in the middle, raised 12 px, 1.06×
   scale, gold border and glow. Phones: **Wizard first**, then Archmage, then Apprentice
   (only the first card is seen without scrolling). Inside a card, top to bottom:
   - "Recommended" ribbon (Wizard only) or "Founder offer" during the launch month;
   - the plan's emblem (40 px) and name in **Cinzel 24 px**;
   - a promise in **14 px**, at most 8 words: Apprentice "Learn and train without limits";
     Wizard "The full Wizard Chess"; Archmage "Every look in the game, yours to use";
   - **the price**: the amount in **44 px Inter bold** with tabular digits, the € sign at
     60% size, "/ month" in 14 px; below, 13 px: "€79.99 billed yearly" and ~~€119.88~~;
   - Wizard and Archmage: a gold 13 px line with a coin: "35,000 coins every month: the
     same as a €9.99 pack";
   - **the button**, full width, 52 px high (`btn-lg`): Wizard gold "Try 7 days free"; the
     others secondary "Choose Apprentice" / "Choose Archmage";
   - under the button, 12 px: "Then €79.99 a year. Cancel anytime.";
   - "Everything in Apprentice, plus:" (12 px capitals, faint);
   - **3–4 major benefits**: 15 px semibold with a 20 px icon and a 13 px line under each;
   - **minor benefits**: 14 px, a small tick, secondary colour.
4. **What every plan includes** (a wide strip): "6 puzzle modules (600,000 coins) +
   Learn chapters 3–8 (75,000 coins), included in every plan."
5. **The comparison table** (3.3), grouped by Puzzles & Learn, Coins, Games, Looks,
   Status; folded on phones ("Compare all benefits").
6. **Questions**: Can I cancel anytime? What happens to my coins and progress when I
   cancel? Do subscribers get an advantage in games? (No, never.) How do yearly coins
   work? Who handles the payment? (Paddle.) Can I get a refund?
7. **The button again** and a trust line: lock icon, "Payments by Paddle · Prices include
   VAT · Cancel in Settings".

Colours from the design system: Wizard gold (`--gold`), Archmage violet (`--violet`),
Apprentice silver (text colours). Motion: the cards rise in one after another (30 ms
apart, as in the shop); the Wizard card's border shimmers slowly once. Nothing moves all
the time.

### 5.3 Where offers appear

Contextual offers (at the moment a player wants something) convert best and annoy least.

| Where | When | What it says (English / Czech) |
| --- | --- | --- |
| **Sidebar**, under the balance | always, for non-subscribers | a small gold button "Go Premium" / "Získat Premium"; subscribers see their badge instead |
| **Locked puzzle module** | on its card, beside "Unlock · 100,000" | "Included in Premium · from €3.33 a month" / "V Premium · od 3,33 € měsíčně" |
| **Learn**, after chapter 2 | the chapter list and the last lesson's result | "You know the rules. Chapter 3 is waiting, in every Premium plan." / "Pravidla umíte. Kapitola 3 čeká, v každém plánu Premium." |
| **Buy coins dialog** | at the top, above the packs | "Or every month: 35,000 coins + every puzzle and lesson. Wizard, €9.99 a month." / "Nebo každý měsíc: 35 000 mincí + všechny úlohy a lekce. Wizard, 9,99 € měsíčně." |
| **Result card** after a game | under the accuracy | "See your best and worst moves: Game Review" with "1 free review left today" / "Podívejte se na své nejlepší a nejhorší tahy" |
| **Daily streak** | a streak of 7+ not yet solved after 18:00 UTC | "Your 23-day streak is safe with a streak shield." with Wizard or 2,500 coins |
| **Puzzle hints** | when a hint costs coins | a quiet line "Free with Premium" |
| **Shop item dialog** | a set or board not owned | Archmage: "Use it now with the Wardrobe" next to the coin price |
| **Someone's badge** | profile, Community, game cards | tap → the Premium page |
| **Finishing a module** | on the reward card | "Next: Mate in Two, included in Premium" |
| **After onboarding** | not at once: after the 3rd day with a game or puzzle, once | a card on the Play hub: "Try Wizard free for 7 days" |

**Never** during a game or a puzzle, never in a pop-up that blocks the screen, never more
than one unrequested offer a day (contextual ones like a locked module are always shown).
Guests first get "Create a free account"; Premium comes after.

### 5.4 Wording

- Say **what the player gets**, not "features": "every puzzle" beats "unlimited access".
- Name the coins with their pack price: "the same as a €9.99 pack".
- Buttons say the action and the result: "Try 7 days free", "Choose Wizard", never just
  "Subscribe".
- Plan names (Apprentice, Wizard, Archmage) are the same in every language, like the set
  names; everything else is translated (`t()`, Czech).

### 5.5 After subscribing

A celebration card (the plan's emblem, the coins counting up into the balance, "Every
puzzle and lesson is open"), then three tiles: "Open a puzzle module", "Continue Learn",
"Spend your coins". The value counter (L) goes on the subscription page in Settings.

### 5.6 Managing and cancelling

Settings → **Subscription**: plan, next payment and its amount, the value counter,
**Change plan**, **Payment method and invoices** (Paddle's customer portal), **Cancel
subscription**. Cancel opens one screen: what stays (coins, icons, progress), what closes
(modules, chapters, reviews, the Wardrobe) and when, one offer (switch to yearly, or to
Apprentice), and the **Cancel subscription** button. Done in two clicks. This is what EU
law expects (the "withdrawal button" of Directive 2023/2673 from 19 June 2026, and
cancelling as easily as subscribing) and it builds the trust that makes people subscribe
in the first place.

---

## 6. Legal side (to do with the build)

- **Terms**, new section "Subscriptions" (English and Czech): plans and prices with VAT,
  automatic renewal and its period, the trial and when it charges, how to cancel and when
  it takes effect, what happens to coins, items and progress, the right of withdrawal
  (the player asks for the plan to start at once and loses the 14-day right once it has
  started, like coin packs; ticked before paying), refunds, failed payments, price changes
  announced 30 days ahead with the right to cancel, the Founder price.
- **Privacy**: subscription data (plan, status, periods, Paddle's subscription id), kept
  as long as the account plus what tax law requires.
- **Check before going live**: the Czech rules for automatically renewing consumer
  contracts and the withdrawal button as Czechia put them into law; whether Paddle accepts
  subscriptions that include in-game currency (asked together with the open coin-pack
  question, §10); price display rules (total price clearly shown).

---

## 7. How it is built (engineering, decided by Claude when building)

### 7.1 Rules (`supabase/functions/_shared/subscription.ts`)

Plans, prices (euro cents), periods, the benefit table (`perks(plan)`: coins a month,
reviews a day, shields a month, pack bonus, wardrobe, early access), and pure helpers:
`hasModule(module, owned, plan)`, `learnUnlocked(owned, plan)`, `hintCost(plan, …)`,
`reviewsLeft(plan, usedToday)`, `grantDue(subscription, now)`. Tested in
`tests/subscription.test.ts`. The puzzle, Learn and shop rules call it instead of
repeating the numbers.

### 7.2 Server

- Tables: `subscriptions` (player, plan, period, status trialing / active / past_due /
  canceled, Paddle subscription and customer ids, current period start and end,
  cancel_at, founder, price), `subscription_grants` (one row per paid month: coins, period),
  `streak_shields` on `puzzle_streaks`, `review_uses` (per UTC day). Ledger reasons
  `subscription_coins`, `shield_bought`; `player_items` source `subscription` for the
  monthly icons.
- `payments` function: `subscribe` (a Paddle transaction with the plan's recurring price
  and `custom_data` = player and plan, opened in the same overlay checkout), `manage`
  (the customer portal link), `change` and `cancel` (Paddle's subscription API). Webhooks
  `subscription.created / activated / updated / canceled / past_due` keep the row in step;
  `transaction.completed` with a subscription pays that period's coins once. Yearly
  months are paid lazily on the next visit, like season ends.
- Whether Paddle accepts recurring prices inline (as the packs do) or needs six catalogue
  prices is checked first; if it needs them, a setup script creates them through the API.
- `puzzles` function: module and chapter access by owning **or** an active plan; free
  hints; shields on missed days. `account`: the Wardrobe in equipping and in the
  showcase; the badge in the showcase.

### 7.3 Game Review (its own milestone)

The analysis already gives every position's score for ranked and casual games
(`_shared/analysis.ts`). The review adds the best move per position, runs the same
analysis for friend and AI games, classifies moves (win-chance drop, the same model as
accuracy), picks the key moments and plays them on the 3D board with the puzzles' arrows
and coach card. Uses are counted on the server per UTC day. Puzzles' helpers
(`whyNot.ts`, `Game.arrows`) are reused; the 3D look is unchanged.

### 7.4 App

`src/features/premium/` (the page, cards, comparison, celebration), the badge component,
the offers in 5.3, Settings → Subscription, the mock back-end (`src/api/mock`) with a
fake checkout so `npm run dev:mock` shows the whole flow. All text with Czech.

### 7.5 Order

1. Rules, tables, Paddle sandbox subscriptions, access to puzzles and Learn, coins,
   hints, badge, Settings → Subscription, the Premium page and the offers, legal pages.
2. Streak shields, monthly icons, the Wardrobe, early access.
3. Game Review (before the launch if possible: it is Wizard's best argument after coins).
4. Later: tournaments benefits, season pass, spectator reactions, gifts ("Give a month",
   one-off payment), prices by country.

Live payments wait for the own domain and Paddle's review (§9), so the subscription can be
built and tested in sandbox now and goes live together with the coin packs.

---

## 8. Decisions for the user

Each with the recommendation:

1. **Three plans** Apprentice / Wizard / Archmage, all with every puzzle module and Learn
   chapter. *Recommended.* (Alternative: two plans, Wizard and Archmage.)
2. **Prices** €4.99 / €9.99 / €19.99 a month, yearly 8× monthly (€39.99 / €79.99 /
   €159.99). *Recommended.*
3. **Coins every month**: Wizard 35,000, Archmage 75,000 (the price back in coins), paid
   monthly also on yearly plans. *Recommended,* on the condition of about one new shop item
   a month; otherwise 25,000 / 50,000.
4. **Game Review** as a new feature: 1 a day free, 3 Apprentice, unlimited Wizard and
   Archmage, built before launch. *Recommended.*
5. **Streak shields**: 1 / 2 / 4 a month by plan, 2,500 coins each for everyone (at most 2
   held without a plan). *Recommended.*
6. **The Wardrobe** for Archmage (every for-sale item to use while subscribed).
   *Recommended.*
7. **Minor benefits**: free hints, +10% / +20% on coin packs, monthly icon (Wizard and
   Archmage, kept forever), badges, early access (Archmage). *Recommended.*
8. **Free trial**: 7 days of Wizard, card needed, coins only after the first payment.
   *Recommended.*
9. **Founder offer**: badge forever and the price kept, for the first month after launch.
   *Recommended.*
10. **Names**: "Premium" for the subscription, plans Apprentice / Wizard / Archmage, the
    same in every language. *Recommended.*
11. **Placement**: the Premium page, a gold "Go Premium" in the sidebar, and the offers in
    5.3, at most one unrequested offer a day. *Recommended.*
12. **Replays and spectating stay free.** *Recommended.*
