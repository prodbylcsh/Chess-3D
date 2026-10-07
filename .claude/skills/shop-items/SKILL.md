---
name: shop-items
description: Adding, changing or removing Wizard Chess shop items (piece sets, boards, backgrounds, move animations, destruction effects, profile icons), wiring in real assets from the user (models, textures, preview images), and changing loadout or season-reward behaviour. Use for any shop, cosmetics, loadout or Wardrobe work.
---

# Shop items and cosmetics

The user will deliver real assets over time; the current looks are placeholders made
from the classic marble set. Keep item **ids** stable: they are stored in players'
inventories and loadouts.

## Where an item lives (all of these, every time)

| What | File | Notes |
| --- | --- | --- |
| id, category, price, rarity, forSale | `supabase/functions/_shared/shop.ts` (`ITEMS`) | What the server trusts. Prices must sit inside `PRICE_RANGES` |
| Name + description | `src/api/catalog.ts` (`TEXT`) | English, wrapped in `tk()` |
| Czech name + description | `src/i18n/cs.ts` | Use the i18n skill's sync script |
| 3D look | `src/cosmetics/looks.ts` | `PIECE_SETS`, `BOARDS`, `BACKGROUNDS`, `MOVE_STYLES`, `DESTRUCTION_STYLES` |
| Profile icon art | `src/ui/art/art.tsx` (`PROFILE_ICONS`) | `colors`, `glyph`, `frame` |
| Preview image (optional) | `public/shop/<id>.webp` + `PREVIEW_IMAGES` in `src/features/shop/previews.tsx` | Otherwise a 2D preview is drawn from the look |
| Docs | `docs/PLATFORM.md` §4.5 catalogue table | Keep in sync |

## Rules (tests enforce some of them; keep all of them)

- **Prices:** inside the category's range (§4.5): icon 1,500–3,000 · background 5,000–12,000 ·
  move/destruction 8,000–20,000 · board 10,000–25,000 · pieces 15,000–40,000. Changing a range
  is a product decision: ask the user and record it in §10.
- **Rarity** goes up with price inside a category: standard (free) < common < rare < epic < legendary.
- **Exactly one free standard item** per loadout category (the default loadout in
  `DEFAULT_LOADOUT`), and **six free starter icons**. Free items are owned implicitly and are
  never stored in `inventory`.
- **Ids are global and unique** across categories (`marble-set` / `marble-board`, never
  the same id twice). Never rename an id silently: add the mapping to `RENAMED` in
  `src/api/mock/db.ts` (and later a SQL migration) so stored loadouts keep working.
- **Season rewards** draw from `seasonRewardPool()` (for-sale pieces, boards, moves,
  destruction). Adding or removing pool items changes which item past seasons recompute
  to (`rewardHistory`). That's fine on the mock. Once the server stores rewards, it must
  read them from the database and stop recomputing them. Season icons
  (`season-<n>-<bracket>`) are never for sale.
- **Who sees what in a game** (§4.5): each side shows its owner's pieces, moves and
  captures. Board and background come from one player, picked by `looksFor(…, seed)`.
  The seed must be shared by both players (game or match id), so both see the same pick.
- Purchases and equips go through `api.shop` only. Never change coins or inventory from
  the UI. The server is the only place balances change (§8.3).

## Placeholder looks: tuning

- Piece sets recolour per side (`light` for White, `dark` for Black) with
  `src/fx/recolor.ts`. `veinAmount` is strong: dark sets look blotchy above ~0.6 unless
  the veins are meant to dominate (Celestial, Ember). Add `glow` only for magical sets.
- Boards: `light`/`dark` square colours, optional `vein`. The frame takes the dark tone.
- Backgrounds change sky/fog, the table gradient, three light colours and the floating
  motes (`motes.color` is linear HDR, values above 1 glow).
- Move and destruction styles are code in `src/game/Choreographer.ts` (`travel()` switches
  on `wardrobe.move(side)`, `impact()` on `wardrobe.destruction(side)`). A new style needs:
  the id in `MOVE_STYLES`/`DESTRUCTION_STYLES`, the type union, the animation, and a CSS
  preview animation in `src/features/shop/shop.css` (`preview-move.is-<style>` /
  `preview-destroy.is-<style>`).
- Captures must always end with `victim.dispose()`, including on async paths. Moves must
  end with the piece exactly on `dest`, with `quaternion.identity()`, `glow = 0` and
  `dissolve = 0`.
- Check every new look with the verify-in-browser skill (`gl: true`): the default look is
  unchanged, and the new one looks right at rest and mid-capture.

## Plugging in real assets (when the user delivers them)

Agreed delivery format (§4.5 "Assets"):

| Category | Asset | Goes to |
| --- | --- | --- |
| Piece set | GLB with nodes `piece_<pawn…king>_<white\|black>`, same scale and origin as `public/models/chess-set.glb` | `public/models/sets/<id>.glb` |
| Board | GLB with a `board` node, or a diffuse texture | `public/models/boards/<id>.glb` |
| Background | equirectangular image or scene GLB | `public/backgrounds/<id>.*` |
| Any | 16:10 preview image, ~640×400 WebP/PNG | `public/shop/<id>.webp` |

Steps for the first real model (this engine work is not built yet):

1. Before writing code, inspect the GLB's node names, materials and scale. A Node script
   that reads the JSON chunk of the `.glb` is enough (see how `chess-set.glb` was checked:
   nodes `piece_*_white_01`, `board`, three materials). Ask the user about anything that
   doesn't match the agreed format.
2. Add `assets: { model }` to the look and teach `src/scene/assets.ts` to load and cache a
   set's templates by URL. `BoardView.createPiece` must pick the template from the owner's
   set. `Wardrobe.dress` then skips recolouring for sets that have a model.
3. Load lazily, when a game uses the item, and show the existing loader. Fall back to the
   classic set if loading fails. Large GLBs belong in `public/` (not imported) so the main
   bundle stays small.
4. Keep `layout.boardTop`/`boardHalf` coming from the board actually in use.
5. Replace the item's preview with the real image, and update §4.5 and the README.
