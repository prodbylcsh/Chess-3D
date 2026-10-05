# Wizard Chess 3D

A local two-player 3D chess game in the browser, with "wizard chess" style animations:
pieces glide across the board, hop over anything in their way, and destroy each other
with cinematic, physics-driven shattering.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle in dist/
```

## Controls

| Input | Action |
| --- | --- |
| Click a piece, then a glowing square | Move |
| Left-drag / Right-drag / Wheel | Orbit / Pan / Zoom |
| `F` | Flip the view to the other side |
| `U` or `Ctrl+Z` | Undo |
| `N` | New game |
| `M` | Sound on/off |
| `Esc` | Deselect |

## Tech

- **[Three.js](https://threejs.org) r186**: WebGL renderer, PBR materials, soft shadows, an HDR
  post-processing chain (MSAA, then Unreal bloom, then ACES tone mapping), and OrbitControls.
- **[chess.js](https://github.com/jhlywa/chess.js)**: the rules engine, used for legal move generation,
  check, checkmate, stalemate, castling, en passant, promotion, threefold repetition,
  the fifty-move rule and insufficient material.
- The piece and board model is `public/models/chess-set.glb`.
- Sound is synthesised at runtime with the Web Audio API, so there are no audio files.

## Animations

| Situation | What happens |
| --- | --- |
| Quiet move | The piece leans into the motion and glides. It arcs over any piece in its path, and knights always jump. |
| Pawn / King captures | **Melee**: the attacker approaches, winds up and smashes the victim. |
| Rook / Knight captures | **Crush**: the attacker leaps high and slams down, sending out a shockwave. |
| Bishop / Queen captures | **Spell**: the attacker charges magic and fires a bolt. The victim levitates, cracks with light, then explodes. |
| Castling | The king slides and the rook vaults over it. |
| Promotion | A vortex dissolves the pawn and the new piece materialises. |
| Checkmate | The king trembles, topples and bursts apart in slow motion. |

Destruction works by breaking the victim mesh into Voronoi-style shards: its triangles are
clustered around random seeds, biased towards the impact point. Solid rubble chunks are added,
and everything is simulated against the board, the table and the remaining pieces. The debris
then burns away with a noise-based dissolve shader that has glowing edges. Impacts trigger
slow motion, camera shake, sparks, dust and a light flash.

## Code map

```
src/
  core/      layout (square <-> world), Animator (single game clock, tweens, bullet time)
  scene/     Stage (renderer, camera, lights, post-processing), GLB loading
  fx/        particles, effects (sparks, dust, shockwave, bolt), shatter physics, dissolve shader
  game/      Piece, BoardView (pieces, markers, picking), Choreographer (move animations), Game (controller)
  ui/        HUD (turn, captures, move list, promotion and game-over dialogs)
  audio/     procedural sound effects
```

In dev builds, `window.__chess.step(seconds)` advances the game clock without
`requestAnimationFrame`, which is handy for testing animations in a background tab.
