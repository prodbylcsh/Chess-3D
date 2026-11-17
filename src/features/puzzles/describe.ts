// What a puzzle is about, in English (features/puzzles/brief.ts translates it): the goal
// from what the solution achieves (the server works it out: `infoOf`), the motifs from its Lichess themes, the lesson of a
// hand-made line. No i18n here, so the tests can check every puzzle in Node.
import { playerSide, type PuzzleInfo } from '#shared/puzzles.ts';
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

/** `prefer`: the module's own themes, named first (a Forks puzzle is about the fork). */
export function describe(p: PuzzleInfo, prefer: readonly string[] = []): Description {
  const side = playerSide(p);
  const moves = p.moves;
  const lesson = LESSONS[p.id] ?? null;
  const themes = p.themes ?? [];
  const found = MOTIFS.filter((m) => themes.includes(m.theme));
  const motifs = [...found.filter((m) => prefer.includes(m.theme)), ...found.filter((m) => !prefer.includes(m.theme))].slice(0, 2);
  if (p.goal) return { goal: { text: p.goal }, intro: lesson?.intro ?? '', motifs, side, moves, lesson };

  const { mate, gain } = p;
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
