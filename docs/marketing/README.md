# Marketing

How Wizard Chess is promoted. Start here, then read the two documents it points to.

| File | What it is |
| --- | --- |
| [`AUDIENCE.md`](AUDIENCE.md) | who we talk to: the primary audience and three more, in detail, with sources. **The base for everything.** |
| [`INSTAGRAM-DESIGN.md`](INSTAGRAM-DESIGN.md) | how posts look: format, colours, fonts, the elements every slide shares |
| `promo/instagram/` | the posts themselves: `renders/` (3D shots), `posts/<post>/` (slides + caption), `grid-preview.jpg` |
| `scripts/promo/` | `render-scenes.ts` (3D shots from the real game), `posts.ts` (the slides' content), `build-posts.ts` (slides, captions, zips), `build-logo.ts` (the logo) |

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

**Next:** Reels from the same scenes (a capture in slow motion, 7–12 s, with sound); the
puzzle as a weekly series ("Puzzle Monday"); season launch posts with the season's rewards.

## Rebuilding the posts

```bash
VITE_ACCOUNTS=mock npx vite --host 127.0.0.1 --port 5174   # the dev build exposes the engine
node scripts/promo/render-scenes.ts                         # 3D shots → promo/instagram/renders (slow)
node scripts/promo/build-posts.ts                           # slides, captions, zips, grid preview
```

Playwright is not a project dependency: install it somewhere and point `NODE_PATH` at its
`node_modules` (the verify-in-browser skill shows how). Change texts in
`scripts/promo/posts.ts`, then run only `build-posts.ts`.
