---
name: shop-items
description: Adding, changing or removing Wizard Chess shop items (piece sets, boards, backgrounds, move animations, destruction effects, profile icons), wiring in real assets from the user (models, textures, preview images), and changing loadout or season-reward behaviour. Use for any shop, cosmetics, loadout or Wardrobe work.
---

# Shop items and cosmetics

Real items are 3D models the user delivers; the first are the **Monolith** piece set and
board. Keep item **ids** stable: they are stored in players' loadouts and in the database
(`player_items`). Removed items go to `RETIRED_ITEMS`, never reuse an id.

## Where an item lives (all of these, every time)

| What | File | Notes |
| --- | --- | --- |
| id, category, price, rarity, forSale | `supabase/functions/_shared/shop.ts` (`ITEMS`) | What the server trusts. Prices must sit inside `PRICE_RANGES`. Copied to the `items` table on deploy (`supabase/catalog.ts`) |
| Name + description | `src/api/catalog.ts` (`TEXT`) | English, wrapped in `tk()` |
| Czech name + description | `src/i18n/cs.ts` | Use the i18n skill's sync script |
| 3D look | `src/cosmetics/looks.ts` | `PIECE_SETS` (`model: { dir }`), `BOARDS` (`model: { file }`), `BACKGROUNDS`, `MOVE_STYLES`, `DESTRUCTION_STYLES` |
| Model files | `public/assets/pieces/<set>/`, `public/assets/boards/<board>/` | Built by `scripts/assets/build-models.ts`, never edited by hand |
| Shop card picture | `public/assets/shop/<id>.webp` (16:10) + `PREVIEW_IMAGES` in `src/features/shop/previews.tsx` | Otherwise a 2D preview is drawn from the look |
| Profile icon art | `src/ui/art/art.tsx` (`PROFILE_ICONS`) | `colors`, `glyph`, `frame` |
| Docs | `docs/PLATFORM.md` §4.5 catalogue table | Keep in sync |

## Rules (tests enforce some of them; keep all of them)

- **Prices:** inside the category's range (§4.5): icon 1,500–3,000 · background 5,000–12,000 ·
  move/destruction 8,000–20,000 · board 10,000–45,000 · pieces 15,000–70,000. Prices and
  ranges are product decisions: ask the user and record them in §10.
- **Rarity** goes up with price inside a category: standard (free) < common < rare < epic < legendary.
- **Exactly one free standard item** per loadout category (the default loadout in
  `DEFAULT_LOADOUT`), and **six free starter icons**. Free items are owned implicitly and
  never have `player_items` rows.
- **Ids are global and unique** across categories (`marble-set` / `marble-board`, never
  the same id twice). Never rename an id; retire it (`RETIRED_ITEMS`) and add a new one.
- **Piece sets and boards are separate items.** A set never includes a board.
- **Ownership** is the `player_items` table (source purchase|season|grant, price_paid,
  season, acquired_at). Purchases go through `buy_item` (checks the `items` price too),
  season rewards through `apply_seasons`. A grant by the operator is an insert with
  source `grant` (service role). Never change coins or ownership from the UI.
- **Season rewards** draw from `seasonRewardPool()` (for-sale pieces, boards, moves,
  destruction) starting with season 2 (`FIRST_ITEM_SEASON`). Adding or removing pool
  items changes which item later seasons get; past seasons are already in `player_items`.
  Season icons (`season-<n>-<bracket>`) are never for sale.
- **Who sees what in a game** (§4.5): each side shows its owner's pieces, moves and
  captures. Board and background come from one player, picked by `looksFor(…, seed)`.
  The seed must be shared by both players (game or match id), so both see the same pick.

## Adding a real piece set or board (the user's models)

Delivery: the user uploads the originals to the R2 bucket `wizard-chess-originals`, one
folder per item by type (`pieces/<set>/king.glb … pawn.glb`, either colour, any scale;
`boards/<board>/chessboard.glb`; see PLATFORM §4.5) and tells you the folder. This
session cannot reach Cloudflare; the workflow `.github/workflows/models.yml` does it for
you: commit `scripts/assets/request.json` on the development branch and push, it runs,
commits its result to the branch, and you pull.

- `{ "task": "inspect", "target": "pieces/<set>" }` lists the bucket into
  `scripts/assets/reports/originals.txt` and reports the folder's models (size, triangles,
  bounds, materials, textures) into `scripts/assets/reports/pieces-<set>.json`.
- `{ "task": "build", "target": "<item-id>" }` pulls the item's `source` folder and runs
  the build (step 4) on GitHub's machine; the files land in `public/assets/`.

Watch the run with the GitHub tools (actions_list on `models.yml`), then `git pull`.
Files the user sends in the chat still work: put them in `assets-src/<name>/` and build
locally.

1. Inspect the originals (the `inspect` request above, or locally in `assets-src/<name>/`).
2. Look at them first: `npx gltf-transform inspect` (via `@gltf-transform/core` in a Node
   script) for size, triangles and textures, and render them (any three.js page with
   `GLTFLoader` + `MeshoptDecoder`). Check which way the knight faces (the build expects
   −z, the way White looks; Black is turned round at runtime) and which colour arrived.
3. Add an entry to `MODELS` in `scripts/assets/build-models.ts` (`source`: its folder in
   the originals bucket):
   - piece set: `heights` per piece in board squares (the classic set: pawn 0.93 …
     king 1.64; Monolith uses 1.1 … 1.75), `delivered` colour, `recolor` for the other
     colour (non-metal parts turn into `tone`, chrome is kept: uses the metallic texture),
     `triangles: { game, hd }` (≈6k for the board, ≈24k for the 3D view), `textureSize`;
   - board: measure the 8×8 grid in a top-down orthographic render of the original
     (`grid.x`, `grid.z` in model units; the build stretches it to exactly 8×8 units and
     puts the surface at the classic board's top, so `layout` does not change).
4. Build: the `build` request above, or `node scripts/assets/build-models.ts <item-id>
   assets-src/<name>` locally; either writes
   `public/assets/pieces/<dir>/` or `public/assets/boards/<dir>/`.
5. Add the item to `ITEMS`, the look (`model`) to `looks.ts`, the texts and Czech, a card
   picture (render the `-hd` models on a dark background, 16:10, WebP ≤ 50 KB) in
   `public/assets/shop/` and `PREVIEW_IMAGES`.
6. Check with the verify-in-browser skill (`gl: true`): a game in the set (pieces on
   their squares, the knight facing the enemy, a capture), the default look unchanged,
   the shop card and the 3D view (both colours). `npm test`; the e2e tests if prices or
   the catalogue rules changed.
7. Update §4.5 (catalogue table) and §10; the deploy copies the catalogue to the database.

## Placeholder looks (recolours of the classic set)

Still possible for items without models: `light`/`dark` tones on a set, `tones` on a
board (`src/fx/recolor.ts`). Backgrounds change sky/fog, the table gradient, three light
colours and the floating motes. Move and destruction styles are code in
`src/game/Choreographer.ts` (`travel()` switches on `wardrobe.move(side)`, `impact()` on
`wardrobe.destruction(side)`); the engine has glide, levitate, blink, comet and shatter,
embers, frostbite, implode. A new style needs the id in `MOVE_STYLES`/`DESTRUCTION_STYLES`,
the animation, and a CSS preview in `src/features/shop/shop.css`.

- Captures must always end with `victim.dispose()`, including on async paths. Moves must
  end with the piece exactly on `dest`, with `quaternion.identity()`, `glow = 0` and
  `dissolve = 0`.
- Model sets load per game (`Wardrobe.apply` → `Game.prepare`; `begin` waits). Keep the
  board triangle budget: 32 pieces are on screen at once.
