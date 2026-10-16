import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_COINS,
  MODULES,
  bonusFor,
  hintPenalty,
  solveCoins,
  completionItem,
  moduleOf,
  playerSide,
  puzzleCoins,
  replyAfter,
  rightMove,
  setupMove,
  solution,
  solves,
  stars,
  type Puzzle,
} from '../supabase/functions/_shared/puzzles.ts';

// the example in the Lichess puzzle database's documentation: Black's king steps up, White mates in two
const mateIn2: Puzzle = { id: '00sHx', fen: 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17', moves: 'e8d7 a2e6 d7d8 f7f8', rating: 1760 };

test('modules: seven, only Openings free, each with its own colour', () => {
  assert.equal(MODULES.length, 7);
  assert.deepEqual(MODULES.filter((m) => m.free).map((m) => m.id), ['openings']);
  assert.equal(MODULES[0].id, 'openings', 'the free one comes first');
  assert.equal(new Set(MODULES.map((m) => m.color)).size, 7);
  assert.equal(moduleOf('forks')?.name, 'Forks');
  assert.equal(moduleOf('nope'), null);
});

test('coins: 25 to 50 by difficulty, 500 for every tenth solve', () => {
  assert.equal(puzzleCoins(400), 25);
  assert.equal(puzzleCoins(1400), 38);
  assert.equal(puzzleCoins(2400), 50);
  assert.equal(puzzleCoins(3000), 50);
  assert.deepEqual([bonusFor(9), bonusFor(10), bonusFor(11), bonusFor(100)], [0, BONUS_COINS, 0, BONUS_COINS]);
});

test('hints cost up to 10 coins, in proportion to the hints the puzzle offers', () => {
  // two hints per move: a 2-move puzzle offers 4
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((h) => hintPenalty(h, 2)), [0, 3, 5, 8, 10, 10]);
  assert.equal(hintPenalty(2, 1), 10, 'every hint of a one-move puzzle');
  assert.equal(hintPenalty(1, 5), 1);
  assert.equal(solveCoins(400, 0, 1), 25);
  assert.equal(solveCoins(400, 2, 1), 15);
  assert.equal(solveCoins(2400, 1, 1), 45);
});

test('stars: three for a clean solve, fewer with mistakes or hints', () => {
  assert.equal(stars(0, 0), 3);
  assert.equal(stars(1, 0), 2);
  assert.equal(stars(0, 1), 2);
  assert.equal(stars(2, 0), 1);
  assert.equal(stars(1, 1), 1);
});

test('the player plays the side to move after the opponent\'s first move', () => {
  assert.equal(playerSide(mateIn2), 'w');
});

test('solutions: the right moves, or any checkmate at the end', () => {
  assert.ok(solves(mateIn2, ['a2e6', 'f7f8']));
  assert.ok(!solves(mateIn2, ['a2e6']), 'not finished');
  assert.ok(!solves(mateIn2, ['f7g7', 'a2e6']), 'wrong first move');
  assert.ok(!solves(mateIn2, ['a2e6', 'f7f6']), 'not mate');
  assert.ok(!solves(mateIn2, ['a2e6', 'e1e8']), 'illegal');
  assert.ok(rightMove(mateIn2, [], 'a2e6'));
  assert.ok(!rightMove(mateIn2, [], 'f7g7'));
  assert.ok(rightMove(mateIn2, ['a2e6'], 'f7f8'));
});

test('a mate before the end of the line solves the puzzle too', () => {
  // the line wants Qh5 first, but Qxf7 is already mate
  const p: Puzzle = { id: 'x', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1', moves: 'a7a6 h5h4 a6a5 h4h5', rating: 500 };
  assert.ok(rightMove(p, [], 'h5f7'));
  assert.ok(solves(p, ['h5f7']));
  assert.ok(!solves(p, ['h5h4']), 'not finished');
});

test('openings: the player may move first, from the starting position', async () => {
  const { curatedPuzzles } = await import('./../scripts/puzzles/curated.ts');
  const lines = curatedPuzzles('openings');
  assert.equal(lines.length, 40);
  const italian = lines.find((p) => p.goal === 'Italian Game')!;
  assert.equal(italian.playerFirst, true);
  assert.equal(playerSide(italian), 'w');
  assert.equal(setupMove(italian), null);
  assert.deepEqual(solution(italian), ['e2e4', 'g1f3', 'f1c4', 'c2c3', 'd2d4']);
  assert.equal(replyAfter(italian, 1), 'e7e5');
  assert.ok(rightMove(italian, [], 'e2e4'));
  assert.ok(!rightMove(italian, [], 'd2d4'), 'another good move, but not this opening');
  const sicilian = lines.find((p) => p.goal === 'Sicilian Defence: Najdorf')!;
  assert.equal(playerSide(sicilian), 'b');
  assert.equal(setupMove(sicilian), 'e2e4');
  for (const p of lines) assert.ok(solves(p, solution(p)), p.goal);
  assert.equal(new Set(lines.map((p) => p.id)).size, lines.length);
});

test('the finishing reward: one of the items the player lacks, at random', () => {
  assert.equal(completionItem(['a', 'b', 'c'], 0), 'a');
  assert.equal(completionItem(['a', 'b', 'c'], 0.99), 'c');
  assert.equal(completionItem([], 0.5), null, 'owns everything: coins instead');
});

test('every puzzle of every module is solved by its own solution', async () => {
  const { PUZZLES } = await import('../supabase/functions/_shared/server/puzzle-data.ts');
  for (const m of MODULES) {
    const list = PUZZLES[m.id];
    assert.equal(list.length, 100, m.id);
    assert.ok(list.every((p, i) => i === 0 || list[i - 1].rating <= p.rating), `${m.id}: easiest first`);
    for (const p of list) assert.ok(solves(p, solution(p)), `${m.id} ${p.id}`);
    assert.equal(new Set(list.map((p) => p.id)).size, 100, `${m.id}: no puzzle twice`);
  }
  const all = MODULES.flatMap((m) => PUZZLES[m.id].map((p) => p.id));
  assert.equal(new Set(all).size, all.length, 'no puzzle in two modules');
});

test('the goals of hand-made puzzles are translated', async () => {
  const [{ PUZZLES }, { cs }] = await Promise.all([import('../supabase/functions/_shared/server/puzzle-data.ts'), import('../src/i18n/cs.ts')]);
  const goals = Object.values(PUZZLES).flatMap((list) => list.flatMap((p) => (p.goal ? [p.goal] : [])));
  assert.ok(goals.length >= 40);
  assert.deepEqual(goals.filter((g) => !(g in cs)), []);
});

test('every puzzle explains itself: lessons for hand-made lines, themes for the rest', async () => {
  const [{ PUZZLES }, { LESSONS, MOTIFS }, { describe }] = await Promise.all([
    import('../supabase/functions/_shared/server/puzzle-data.ts'),
    import('../src/features/puzzles/lessons.ts'),
    import('../src/features/puzzles/describe.ts'),
  ]);
  for (const m of MODULES) {
    for (const p of PUZZLES[m.id]) {
      if (p.goal) {
        assert.ok(LESSONS[p.id], `${p.id}: no lesson`);
        assert.equal(LESSONS[p.id].why.length, solution(p).length, `${p.id}: one explanation per move`);
      } else {
        assert.ok(p.themes?.length, `${m.id} ${p.id}: no themes`);
      }
      const d = describe(p);
      assert.ok(d.intro, `${m.id} ${p.id}: nothing to say`);
      if ('mateIn' in d.goal) assert.ok(p.themes?.some((x) => x.startsWith('mate')), `${p.id}: a mate the themes don't know`);
    }
  }
  // a themed module names its own motif first
  for (const module of ['forks', 'pins', 'sacrifices']) {
    const themes = moduleOf(module)!.select.themes!;
    const named = PUZZLES[module].filter((p) => themes.includes(describe(p, themes).motifs[0]?.theme));
    assert.equal(named.length, 100, module);
  }
  assert.ok(MOTIFS.length > 40);
  assert.equal(Object.keys(LESSONS).length, 40);
});
