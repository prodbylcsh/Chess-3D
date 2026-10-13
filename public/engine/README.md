# Stockfish (chess engine)

`stockfish-19-lite-single.js` and `.wasm` are **Stockfish 19** compiled to WebAssembly by
the stockfish.js project (lite network, single-threaded), unchanged from the npm package
`stockfish@19.0.1`. The app runs them in each player's browser to analyse finished ranked
and casual games (`src/ai/stockfish.ts`, `supabase/functions/_shared/analysis.ts`).

Stockfish is free software under the **GNU General Public License v3** (`COPYING.txt`).
Source code:

- Stockfish: https://github.com/official-stockfish/Stockfish
- this WebAssembly build: https://github.com/nmrugg/stockfish.js/tree/v19.0.1

To update: `npm pack stockfish@<version>`, copy `bin/stockfish-<v>-lite-single.{js,wasm}`
and `Copying.txt` here, and change `ANALYSIS.engine` in `supabase/functions/_shared/analysis.ts`
(both players must run the same build, or their reports never match).
