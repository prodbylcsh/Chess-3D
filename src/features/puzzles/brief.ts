// What a puzzle asks of the player, in their language (docs/PLATFORM.md §4.2): a title, the
// task, the line's story or what to look for, and the motifs. See describe.ts.
import type { Puzzle } from '#shared/puzzles.ts';
import { getPrefs } from '../../app/prefs';
import { t, tk, tn } from '../../i18n';
import { describe } from './describe';
import type { Lesson, Motif } from './lessons';

export interface Brief {
  title: string;
  /** e.g. "You play White · 3 moves to find" */
  task: string;
  intro: string;
  motifs: Motif[];
  side: 'w' | 'b';
  moves: number;
  lesson: Lesson | null;
}

// the goals and intros describe.ts picks, for the translator
export const BRIEF_TEXT = [
  tk('Save the game'),
  tk('Promote a pawn'),
  tk('Win material'),
  tk('Find the strongest move'),
  tk('The enemy king is in danger. Find the moves that lead to mate.'),
  tk('You are in trouble. Find the only moves that hold the balance.'),
  tk('Your opponent has left a weakness. Find the moves that win material.'),
  tk('There is one move that changes everything. Look at checks, captures and threats first.'),
];

/** `prefer`: the module's own themes, named first. */
export function briefOf(p: Puzzle, prefer: readonly string[] = []): Brief {
  const d = describe(p, prefer);
  const you = d.side === 'w' ? t('You play White') : t('You play Black');
  return {
    title: 'mateIn' in d.goal ? tn(d.goal.mateIn, 'Checkmate in {n} move', 'Checkmate in {n} moves') : t(d.goal.text),
    task: `${you} · ${tn(d.moves, '{n} move to find', '{n} moves to find')}`,
    intro: t(d.intro),
    motifs: d.motifs,
    side: d.side,
    moves: d.moves,
    lesson: d.lesson,
  };
}

const CZECH_PIECES: Record<string, string> = { N: 'J', B: 'S', R: 'V', Q: 'D', K: 'K' };

/** A move in the player's language: Czech names the pieces J, S, V, D, K (Nf3 → Jf3). */
export function moveName(san: string): string {
  return getPrefs().language === 'cs' ? san.replace(/[NBRQK]/g, (c) => CZECH_PIECES[c]) : san;
}
