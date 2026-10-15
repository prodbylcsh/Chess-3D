// What a puzzle is about, in English (features/puzzles/brief.ts translates it): the goal
// from what the solution achieves, the motifs from its Lichess themes, the lesson of a
// hand-made line. No i18n here, so the tests can check every puzzle in Node.
import { Chess } from 'chess.js';
import { playerSide, replyAfter, setupMove, solution, type Puzzle } from '#shared/puzzles.ts';
import { LESSONS, MOTIFS, type Lesson, type Motif } from './lessons.ts';

export interface Description {
  /** the goal: a hand-made line's name, or what to achieve */
  goal: { text: string } | { mateIn: number };
  /** what to look for (English) */
  intro: string;
  motifs: Motif[];
  side: 'w' | 'b';
  moves: number;
  lesson: Lesson | null;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const toMove = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });

function material(chess: Chess, side: 'w' | 'b'): number {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq) sum += (sq.color === side ? 1 : -1) * VALUE[sq.type];
  return sum;
}

/** How the solution ends: mate, or how much material the player wins. */
function outcome(p: Puzzle): { mate: boolean; gain: number } {
  const chess = new Chess(p.fen);
  const setup = setupMove(p);
  if (setup) chess.move(toMove(setup));
  const side = playerSide(p);
  const before = material(chess, side);
  solution(p).forEach((m, i) => {
    chess.move(toMove(m));
    const reply = replyAfter(p, i + 1);
    if (reply && !chess.isGameOver()) chess.move(toMove(reply));
  });
  return { mate: chess.isCheckmate(), gain: material(chess, side) - before };
}

/** `prefer`: the module's own themes, named first (a Forks puzzle is about the fork). */
export function describe(p: Puzzle, prefer: readonly string[] = []): Description {
  const side = playerSide(p);
  const moves = solution(p).length;
  const lesson = LESSONS[p.id] ?? null;
  const themes = p.themes ?? [];
  const found = MOTIFS.filter((m) => themes.includes(m.theme));
  const motifs = [...found.filter((m) => prefer.includes(m.theme)), ...found.filter((m) => !prefer.includes(m.theme))].slice(0, 2);
  if (p.goal) return { goal: { text: p.goal }, intro: lesson?.intro ?? '', motifs, side, moves, lesson };

  const { mate, gain } = outcome(p);
  const equal = themes.includes('equality');
  const goal = mate
    ? { mateIn: moves }
    : { text: equal ? 'Save the game' : themes.includes('promotion') && gain >= 3 ? 'Promote a pawn' : gain >= 2 ? 'Win material' : 'Find the strongest move' };
  const intro = mate
    ? 'The enemy king is in danger. Find the moves that lead to mate.'
    : equal
      ? 'You are in trouble. Find the only moves that hold the balance.'
      : gain >= 2
        ? 'Your opponent has left a weakness. Find the moves that win material.'
        : 'There is one move that changes everything. Look at checks, captures and threats first.';
  return { goal, intro, motifs, side, moves, lesson };
}
