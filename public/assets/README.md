# Game assets

Web-ready files of shop items, served with the site. Built from the original models by
`scripts/assets/build-models.ts` (the originals stay out of git, in `assets-src/`).
See docs/PLATFORM.md §4.5 "Assets" and the shop-items skill.

```
pieces/<set>/<king…pawn>-<white|black>.glb      on the board (light)
pieces/<set>/<king…pawn>-<white|black>-hd.glb   in the 3D view (detailed)
boards/<board>/board.glb                         a board: 8×8 grid = 8 units
shop/<item-id>.webp                              shop card picture, 16:10
map/<module>.glb                                 a puzzle module's map scenery, built by
                                                 scripts/assets/build-map.ts (originals: map/)
backgrounds/<id>/…                               (future) scene or environment
effects/<id>/…                                   (future) capture effects
animations/<id>/…                                (future) move animations
```

The classic set (`../models/chess-set.glb`) predates this folder and stays where it is.
