# Instagram: how posts look

The rules for every Instagram post (and, with small changes, every ad and story). Posts
don't all have to look the same, but every one must be recognisable as Wizard Chess from
its thumbnail. The slides of the first six posts are built from these rules by
`scripts/promo/build-posts.ts`; its CSS is the reference implementation.

## 1. Format

| | |
| --- | --- |
| Size | **1080 × 1440 px (3:4)**, the tallest ratio Instagram keeps at full resolution, and the ratio of the profile grid, so the grid shows the cover uncropped |
| Carousel | up to **20** slides (photos and videos mixed); every slide has the ratio of the first |
| Safe area | important text inside **x 72–1008, y 90–1350**: if a slide is ever shown at 4:5 the top and bottom 45 px may be cut, and the corners carry the logo and counter |
| File | JPEG, sRGB, quality 92 (Instagram recompresses anyway); text-only slides may be PNG |
| Length | vary it: short (2–4) for one sharp idea or a puzzle, medium (5–8) for a feature, long (12–20) for stories and "save for later" content |

Carousels get the highest engagement rate and the most saves of the feed formats; Reels
reach more people. Use carousels for explaining and collecting, Reels for the capture
spectacle (the same 3D renders, as video).

## 2. Brand colours

The app's own tokens (`src/styles/global.css`):

| Token | Hex | Use |
| --- | --- | --- |
| Night | `#0a0b10` | background of every slide |
| Panel | `#141620` | cards, boxes |
| Night violet | `#231d3a` | top of the background gradient (the logo's sky) |
| Text | `#efeae1` | body text |
| Text 2 | `#a9a399` | secondary text, captions on slides |
| Gold | `#f2c27a` | the accent: headlines, key numbers, CTA |
| Gold gradient | `#f9dca8 → #e3a858 → #c98a3c` | headline fills, the logo |
| Violet | `#a58cff` | magic: effects, spells, Premium, the spark |
| Rank colours | Iron `#8b8f98` · Bronze `#c58a5a` · Silver `#c9d2dd` · Gold `#f2c27a` · Platinum `#6fd3c7` · Emerald `#3fcf8e` · Diamond `#8fb6ff` · Master `#c08cff` · Grandmaster `#ff6a7a` · Challenger `#ffe08a` | only in ranked content |

**Proportion:** about 70% night, 20% the 3D scene, 10% gold. Violet is a spice: never as
a background, never next to gold in equal amounts. No white backgrounds, ever.

## 3. Type

| Role | Font | Size at 1080 px | Notes |
| --- | --- | --- | --- |
| Headline | **Cinzel** 700–800 | 84–128 px | capitals by design; max 3 lines, max ~6 words on a cover; letter-spacing 0.02em; gold gradient or text colour |
| Kicker (above the headline) | Inter 600 | 26 px | UPPERCASE, letter-spacing 0.18em, gold or violet |
| Sub-headline | Inter 500 | 40–48 px | sentence case |
| Body | Inter 400–500 | 34–38 px (never under 30) | max ~30 words per slide; line height 1.35 |
| Numbers, moves | Inter 700 (tabular) | 46 px for moves above a headline | chess moves in standard notation (e4, Nf3, Rd8#), gold; **never in Cinzel or the uppercase kicker**, which turn "Rxe8" into "RXE8" |
| Labels, counters | Inter 600 | 22–24 px | UPPERCASE, letter-spacing 0.14em, text-2 |

Only these two fonts. Cinzel is the "magic", Inter the "modern platform"; the mix is
the brand. No italic, no third font, no emoji in slides (emoji go in captions).

## 4. Elements on every slide (the consistency)

1. **The frame:** a thin gold line (1.5 px, 35% opacity) 36 px inside the edge, with
   rounded corners (28 px). It is the signature of the series: a board, a card, a stage.
2. **The mark:** the Night Knight tile (56 px) in the top-left corner, with **WIZARD CHESS**
   beside it (Inter 600, 22 px, letter-spacing 0.2em).
3. **The counter:** top right, "03 / 12" (Inter 600, 22 px, text-2). On the cover it is
   replaced by the series tag (e.g. "RANKED", "PUZZLE").
4. **The spark ✦:** the four-point sparkle from the logo is the only bullet and divider.
5. **Night gradient:** behind a 3D render the bottom 45% fades into night so text stays
   readable (no boxes over the board).
6. **The swipe cue:** on the cover, a gold pill "Swipe →" at the bottom right; on the last
   slide the CTA card instead.
7. **The CTA card** (last slide): logo, one line of promise, "Free in your browser · phone &
   PC", and "Link in bio". Same layout on every post.

## 5. Slide types

| Type | Layout | Use |
| --- | --- | --- |
| **Cover** | full-bleed render, kicker + headline in the lower third, swipe cue | first slide |
| **Statement** | text only on night, one big idea centred | contrasts, facts, transitions |
| **Scene** | full-bleed render, short caption at the bottom | a moment from the game |
| **Card** | render or emblem in the upper half, title + 1–2 lines below | items, ranks |
| **Grid** | 2×2 or 1×2 renders with labels | comparing effects or sets |
| **Steps** | numbered list with the spark, 3–5 items | how something works |
| **Diagram** | flat 2D board (our own SVG) with arrows | puzzle hints and solutions |
| **CTA** | the CTA card | last slide |

## 6. The grid (the profile as one picture)

- Covers alternate: a **render cover** (the board, dark, lots of light) next to a
  **statement or emblem cover** (more night, big type). Never three text covers in a row.
- Every cover's headline must read at grid size (a third of a phone's width): 6 words or
  fewer, 100 px or bigger.
- Pin three posts: the hero ("Chess, but the pieces fight"), the ranks, the puzzle.

## 7. Images

- **Only real renders from the game** (`scripts/promo/render-scenes.ts`) or real
  screenshots. Never stock photos, never AI images of "chess", never pieces we don't have.
- The default look (Classic Marble, candlelit study) leads; shop items appear where items
  are the topic.
- Captures are shown at their peak: the leap, the bolt, the shards.
- The game's look is never edited (colours, effects); only the framing (camera, crop) and the
  night gradient for text.

## 8. Words

- English (the account is international). Short sentences, one idea per slide.
- Headlines promise, slides prove, the last slide asks (comment, save, play).
- Chess moves in standard notation; explain them in words next to them for beginners.
- Never: "best chess app", fake numbers, Harry Potter names, "bet", anything that suggests
  money wins games.

## 9. Captions, alt text, hashtags

- **Caption:** the first line is the hook (the first ~125 characters show before "more"),
  then 2–4 short lines of value, then one CTA ("Comment your answer", "Save it",
  "Play free, link in bio").
- **Hashtags:** 3–5 relevant ones at the end (`#chess #chesspuzzle #3dchess #indiegame
  #ranked`), not 30.
- **Alt text:** every post gets one (what is on the slides), written in each post's
  `caption.md`.
- **Keywords:** the words people search for ("chess", "chess game", "chess puzzle", "learn
  chess") in the caption and the alt text; Instagram's search reads them.

## Sources

- [Kapwing: Instagram's 3:4 grid](https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/), [Postnitro: the 20-slide carousel](https://postnitro.ai/blog/post/instagram-carousel-limit-20-photos-per-post-guide), [Decktopus: carousel sizes](https://www.decktopus.com/blog/instagram-carousel-size-dimensions)
- [Socialinsider: Instagram benchmarks (carousels vs Reels vs images)](https://www.socialinsider.io/blog/instagram-benchmark-study/), [Blck Alpaca: Reels vs carousels](https://blckalpaca.at/en/knowledge-base/social-media/social-media-algorithms-distribution/reels-vs-carousel-instagram-formats)
- [Brandghost: carousel design guide](https://blog.brandghost.ai/posts/instagram-carousel-design-guide/), [Postnitro: design elements](https://postnitro.ai/blog/post/instagram-carousel-design-elements-for-viral-success), [Search Engine Journal: carousel tips](https://www.searchenginejournal.com/instagram-carousel-tips/429880/)
- [Search Engine Journal: how Instagram ranks search](https://www.searchenginejournal.com/how-instagram-ranks-search-results/417449/)
