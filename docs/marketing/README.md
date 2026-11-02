# Marketing

How Wizard Chess is promoted. Start here, then read the two documents it points to.

| File | What it is |
| --- | --- |
| [`AUDIENCE.md`](AUDIENCE.md) | who we talk to: the primary audience and three more, in detail, with sources. **The base for everything.** |
| [`INSTAGRAM-DESIGN.md`](INSTAGRAM-DESIGN.md) | how posts look: format, colours, fonts, the elements every slide shares |
| `promo/instagram/` | the posts themselves: `renders/` (3D shots), `posts/<post>/` (slides + caption), `grid-preview.jpg` |
| `promo/instagram/reels/` | the Reels: `<reel>/reel.mp4`, `cover.jpg`, `caption.md` |
| `scripts/promo/` | `render-scenes.ts` (3D shots from the real game), `posts.ts` (the slides' content), `build-posts.ts` (slides, captions, zips), `reels.ts` (the Reels, shot by shot), `render-reels.ts` (their frames from the real game), `build-reels.ts` (text, sound, MP4), `brand.ts` (logo, spark, fonts), `build-logo.ts` (the logo) |

## Rules

1. **Plan for the finished platform.** Everything on the roadmap (`docs/PLATFORM.md` §9)
   counts as built: ranked with seasons, tournaments, replays, more items and effects. The
   user starts posting once it is built; the thinking happens now. Never write "coming soon"
   or "ranked is closed" into marketing.
2. **Only real things.** Renders from the real game, real features, real prices. No fake
   numbers ("10,000 players"), no fake reviews, no stock images, no AI pictures of pieces we
   don't have.
3. **Say how it earns.** Each piece of content brings players in, keeps them, or gives a
   reason to pay (`docs/PLATFORM.md` §1 "Earning money"); the post plan below says which.
4. **English** on Instagram (international). Czech only in Czech-targeted ads.
5. **Never:** Harry Potter names or images (trademark), "bet"/"gamble" language, anything
   suggesting money wins games, pushing purchases at under-18s.
6. Legal pages describe what we do. A new tracking pixel, newsletter or contest means
   updating the Privacy Policy and Terms first (`CLAUDE.md`).

## The Instagram profile

- **Username:** @wizardchess3d · **Category:** Video Game · **Photo:** Night Knight
  (`promo/logo/night-knight.png`)
- **Name** (searchable, 30 characters): `Wizard Chess 3D | Online Chess`
- **Bio** (134 characters):

  ```
  ♟️ Chess where the pieces really fight
  🏆 Ranked seasons, Iron to Challenger
  🧩 Puzzles · lessons · tournaments
  🆓 Free in your browser 👇
  ```

- **Link:** title `Play free in your browser` → the site (the own domain once it exists).
- **Highlights** (stories kept on the profile): Captures · Ranked · Puzzles · Learn · Items.
- **Pinned:** 01 (the promise), 02 (ranks), 04 (the puzzle).

Why: the name and bio are what Instagram's search reads ("chess", "online chess"); the
four lines answer what visitors ask (what is it, why is it different, what's in it, is it
free and where), and the arrow points at the link.

## The first six posts

All carousels, 1080 × 1440, different lengths on purpose. Zips with the slides and
`caption.md` (caption, alt text) come from `node scripts/promo/build-posts.ts`.

| # | Post | Slides | For | Goal | Earns by |
| --- | --- | --- | --- | --- | --- |
| 01 | **Chess, but the pieces fight** | 6 | everyone | the promise: what makes us different | bringing players in |
| 02 | **Chess has ranks now** (Iron → Challenger) | 12 | primary + Gen Z | the ladder in their language; comments ("where would you land?") | keeping players (seasons) |
| 03 | **Make the board yours** (sets, board, effects) | 8 | primary + collectors | desire for items; "which set would you play?" | coin packs, Archmage |
| 04 | **Mate in 2: Black just took your queen** | 4 | primary + beginners | comments and saves; puzzles as a habit | puzzle worlds, Premium |
| 05 | **Never learned chess? Start here** | 5 | beginners | saves; Learn as the way in | Learn, Premium |
| 06 | **The Opera Game in 20 frames** | 20 | everyone | saves and shares; the board in action | bringing players in |

**Posting order** (the grid shows the newest top left): 05 → 03 → 06 → 04 → 02 → 01, so
after the last post the top row is 01 · 02 · 04 (the pinned ones) and the second row
06 · 03 · 05. See `promo/instagram/grid-preview.jpg`. Leave two or three days between
posts; reply to every comment in the first hour.

## The first four Reels

Vertical video, 1080 × 1920, 30 fps, 14–17 s, rendered frame by frame from the real game
(the camera moves, the game's clock slows down for the captures; the look is untouched).
Reels reach people who don't follow us yet, so they carry the spectacle; the carousels
explain. Each folder has `reel.mp4`, `cover.jpg` (headline inside the 3:4 grid crop) and
`caption.md` (caption, alt text).

| # | Reel | Length | For | Goal | Earns by |
| --- | --- | --- | --- | --- | --- |
| 01 | **Chess, but the pieces fight** (knight leap, queen's spell, checkmate) | 17 s | everyone | the promise, reach | bringing players in |
| 02 | **Pick your capture** (shatter, embers, frostbite, implode; comment 1–4) | 15 s | primary + collectors | comments, desire for items | coin packs, Premium |
| 03 | **Mate in 2: Black just took your queen** (pause, then the answer) | 17 s | primary + beginners | comments, rewatches, saves | puzzle worlds, Premium |
| 04 | **Make the board yours** (one orbit, eight sets and boards) | 15 s | primary + collectors | desire for items | coin packs, Premium |

**Text** stays inside Instagram's Reels safe area (not the top 220 px, the bottom 380 px or
the right 140 px from mid-height down); the hook is on screen in the first second; the last
3 s are the CTA card (same as the carousels'). **Sound:** the game's own sounds (the Web
Audio kit in `src/audio/sfx.ts`, played where they happened) over a quiet music bed made the
same way, so there is no licensed music. Instagram favours trending audio: add one in the
app at about 20% over the original sound if wanted.

**Posting:** one Reel between carousels (e.g. 05 → Reel 01 → 03 → Reel 03 → 06 → Reel 02 →
04 → 02 → Reel 04 → 01). Reels show on the grid as their cover cropped to 3:4, so the
covers are made for that crop. Effects shown in 02 (embers, frostbite, implode) must be
shop items by then, like post 03's.

**Next:** the puzzle as a weekly Reel series ("Puzzle Monday": copy 03 with a new position
in `reels.ts`); season launch posts with the season's rewards.

## Rebuilding the posts

```bash
VITE_ACCOUNTS=mock npx vite --host 127.0.0.1 --port 5174   # the dev build exposes the engine
node scripts/promo/render-scenes.ts                         # 3D shots → promo/instagram/renders (slow)
node scripts/promo/build-posts.ts                           # slides, captions, zips, grid preview
node scripts/promo/render-reels.ts --preview                # Reels: every 10th frame at half size, to check the camera
node scripts/promo/render-reels.ts                          # Reels: all frames (about 3 s each, 1.5 hours for the four)
node scripts/promo/build-reels.ts                           # Reels: text, sound, reel.mp4, cover, caption
```

`render-reels.ts` keeps finished takes (`--force` renders again, `--only 02 --take embers`
one take); its frames (`.frames/`, about 600 MB) are not committed. Change the Reels' texts in
`reels.ts`, then run only `build-reels.ts`.

Playwright is not a project dependency: install it somewhere and point `NODE_PATH` at its
`node_modules` (the verify-in-browser skill shows how). Change texts in
`scripts/promo/posts.ts`, then run only `build-posts.ts`.
