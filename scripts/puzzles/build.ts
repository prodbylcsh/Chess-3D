// Picks the puzzles of each module from the Lichess puzzle database (CC0,
// https://database.lichess.org/#puzzles) and writes them to
// supabase/functions/_shared/puzzle-data/<module>.json, easiest first.
//
//   curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | node scripts/puzzles/build.ts
//
// The GitHub workflow .github/workflows/puzzles.yml runs it (this container cannot reach
// lichess.org) and commits the result. Each module wants 100 well-rated, popular puzzles
// spread evenly over its rating range; the modules themselves are in _shared/puzzles.ts.
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MODULES, PUZZLES_PER_MODULE, type PuzzleModule } from '../../supabase/functions/_shared/puzzles.ts';

const OUT = 'supabase/functions/_shared/puzzle-data';
const KEEP = 8; // candidates kept per rating band, so modules can avoid sharing puzzles

interface Candidate {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  score: number;
}

const fits = (m: PuzzleModule, themes: string[], plies: number) =>
  plies <= m.select.maxPlies && (!m.select.themes || m.select.themes.some((t) => themes.includes(t))) && !(m.select.without ?? []).some((t) => themes.includes(t));

const bands = new Map(MODULES.map((m) => [m.id, Array.from({ length: PUZZLES_PER_MODULE }, () => [] as Candidate[])]));
let lines = 0;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (lines++ === 0 || !line) continue; // header
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
  const [id, fen, moves, rating, deviation, popularity, plays, themeList] = line.split(',');
  const r = Number(rating);
  if (Number(deviation) > 90 || Number(popularity) < 80 || Number(plays) < 300) continue;
  const themes = themeList.split(' ');
  const plies = moves.split(' ').length;
  for (const m of MODULES) {
    const { min, max } = m.select;
    if (r < min || r >= max || !fits(m, themes, plies)) continue;
    const band = bands.get(m.id)![Math.floor(((r - min) / (max - min)) * PUZZLES_PER_MODULE)];
    const score = Number(popularity) + Math.log10(Number(plays)) * 5;
    if (band.length < KEEP || score > band[band.length - 1].score) {
      band.push({ id, fen, moves, rating: r, score });
      band.sort((a, b) => b.score - a.score);
      band.length = Math.min(band.length, KEEP);
    }
  }
}

mkdirSync(OUT, { recursive: true });
const used = new Set<string>();
for (const m of MODULES) {
  const all = bands.get(m.id)!;
  const picked = all.map((_, i) => {
    // this band's best unused puzzle, or the nearest band's when this one has none left
    let pick: Candidate | undefined;
    for (let d = 0; !pick && d < all.length; d++) {
      pick = [all[i - d], all[i + d]].flatMap((b) => b ?? []).find((c) => !used.has(c.id));
    }
    if (!pick) throw new Error(`${m.id}: not enough puzzles`);
    used.add(pick.id);
    return { id: pick.id, fen: pick.fen, moves: pick.moves, rating: pick.rating };
  });
  picked.sort((a, b) => a.rating - b.rating);
  writeFileSync(`${OUT}/${m.id}.json`, JSON.stringify(picked, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(`${m.id}: ${picked.length} puzzles, ${picked[0].rating}–${picked.at(-1)!.rating}`);
}
console.log(`read ${lines} lines`);
