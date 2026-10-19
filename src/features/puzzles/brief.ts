// What a puzzle asks of the player, in their language (docs/PLATFORM.md §4.2): a title, the
// task, the line's story or what to look for, and the motifs. See describe.ts.
import type { Puzzle } from '#shared/puzzles.ts';
import { t, tk, tn } from '../../i18n';
import { describe } from './describe';
import type { Lesson, Motif } from './lessons';
import type { Intent, NextGoal } from './intent';
import type { PieceSymbol } from 'chess.js';

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

// what the next move is for (intent.ts), shown on the coach card before the player moves
const NEXT_TEXT: Record<Exclude<Intent, 'defend'>, string> = {
  mate: tk('Mate is on: find the move that gives it.'),
  promote: tk('Bring a pawn to the last rank and promote it.'),
  castle: tk('Bring your king to safety.'),
  escape: tk('You are in check: get out of it in the most useful way.'),
  stopMate: tk('Your opponent threatens mate: stop it.'),
  recapture: tk('Your opponent has just taken: take back.'),
  win: tk("Something of your opponent's is poorly defended: win it."),
  trade: tk('A capture is the key here: find the right one.'),
  sacrifice: tk('Look for a sacrifice: give material to get something bigger.'),
  sacrificeCheck: tk('Look for a sacrifice with check that opens up the king.'),
  check: tk('Put pressure on the king with a check.'),
  threatMate: tk("Threaten mate: aim at the weak point next to the king."),
  fork: tk('Attack two things at once.'),
  pin: tk('Pin or skewer: attack a piece that has something more valuable behind it.'),
  threat: tk("Create a threat: attack a weak point in your opponent's camp."),
  develop: tk('Develop: bring a knight or a bishop into play.'),
  centre: tk('Fight for the centre with a pawn.'),
  improve: tk('Improve a piece: put it where it works best.'),
  pawn: tk('Push a pawn: in the endgame every step counts.'),
  quiet: tk('No capture or check this time: find the quiet move that strengthens your position.'),
};
const DEFEND_TEXT: Record<PieceSymbol, string> = {
  p: tk('Your opponent attacks your pawn: protect it or move it to safety.'),
  n: tk('Your opponent attacks your knight: protect it or move it to safety.'),
  b: tk('Your opponent attacks your bishop: protect it or move it to safety.'),
  r: tk('Your opponent attacks your rook: protect it or move it to safety.'),
  q: tk('Your opponent attacks your queen: protect it or move it to safety.'),
  k: tk('You are in check: get out of it in the most useful way.'),
};

/** The aim of the next move, in the player's language. */
export function nextText(g: NextGoal): string {
  return g.intent === 'defend' ? t(DEFEND_TEXT[g.piece ?? 'p']) : t(NEXT_TEXT[g.intent]);
}
