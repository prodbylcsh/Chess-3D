// Learn (docs/PLATFORM.md §4.3): chapters of lessons that teach the game, from the pieces
// to the first endgames. Shared by the `puzzles` function (which records lessons and pays)
// and the app (which plays the lessons: src/features/learn/lessons.ts).

/** The paid chapters open together for this many coins (the coins of the €19.99 pack). */
export const LEARN_PRICE = 75_000;
/** Finishing a chapter pays this once. */
export const CHAPTER_REWARD = 250;
/** Two lessons are finished at least this far apart (a lesson takes longer; no scripted farming). */
export const MIN_LESSON_MS = 8_000;

export interface LearnChapter {
  id: string;
  /** English; the app translates */
  name: string;
  description: string;
  /** lucide icon name, see src/features/learn/LearnPage.tsx */
  icon: string;
  color: string;
  free: boolean;
  /** lesson ids, in order; empty while the chapter is being written */
  lessons: readonly string[];
}

export const CHAPTERS: readonly LearnChapter[] = [
  {
    id: 'pieces',
    name: 'The pieces',
    description: 'The board, and how every piece moves and captures.',
    icon: 'castle',
    color: '#6fb3ff',
    free: true,
    lessons: ['board', 'rook', 'bishop', 'queen', 'king', 'knight', 'pawn', 'capture'],
  },
  {
    id: 'rules',
    name: 'Special rules',
    description: 'Check and checkmate, castling, promotion and en passant.',
    icon: 'crown',
    color: '#ffb547',
    free: true,
    lessons: ['check', 'escape', 'checkmate', 'castling', 'promotion', 'en-passant'],
  },
  {
    id: 'endings',
    name: 'How a game ends',
    description: 'Stalemate, the draws, resigning and running out of time.',
    icon: 'flag',
    color: '#ff7a6b',
    free: false,
    lessons: ['stalemate', 'avoid-stalemate', 'repetition', 'material', 'clock'],
  },
  {
    id: 'opening',
    name: 'Opening moves',
    description: 'The first moves of a game, and why they are played.',
    icon: 'book',
    color: '#c08bff',
    free: false,
    lessons: ['centre', 'develop', 'castle-early', 'first-moves', 'opening-traps'],
  },
  {
    id: 'playing',
    name: 'Playing well',
    description: 'What the pieces are worth, trades and the simple mates.',
    icon: 'scale',
    color: '#4fd1a5',
    free: false,
    lessons: ['values', 'free-pieces', 'trades', 'queen-mate', 'rook-mate'],
  },
  {
    id: 'tactics',
    name: 'First tactics',
    description: 'Forks, pins and discovered attacks.',
    icon: 'zap',
    color: '#ff8fc7',
    free: false,
    lessons: ['fork', 'pin', 'discovered', 'tactics-practice'],
  },
  {
    id: 'endgames',
    name: 'First endgames',
    description: 'An active king, passed pawns and the opposition.',
    icon: 'hourglass',
    color: '#9bd36a',
    free: false,
    lessons: ['king-active', 'passed-pawn', 'opposition', 'edge-pawn'],
  },
  {
    id: 'coordinates',
    name: 'Coordinates',
    description: 'How squares and moves are written down.',
    icon: 'grid',
    color: '#8fa3ff',
    free: false,
    lessons: ['files-ranks', 'square-names', 'notation', 'read-moves'],
  },
];

export const chapterOf = (id: unknown): LearnChapter | null => CHAPTERS.find((c) => c.id === id) ?? null;

/** The chapter a lesson belongs to, and its place in it. */
export function lessonOf(id: unknown): { chapter: LearnChapter; index: number } | null {
  for (const chapter of CHAPTERS) {
    const index = chapter.lessons.indexOf(id as string);
    if (index >= 0) return { chapter, index };
  }
  return null;
}

/** A chapter is open when it is free, or once the paid chapters are unlocked. */
export const chapterOpen = (chapter: LearnChapter, unlocked: boolean): boolean => chapter.free || unlocked;

/** The lesson to play next in a chapter (-1: all done). Lessons go in order. */
export function nextLesson(chapter: LearnChapter, done: ReadonlySet<string> | readonly string[]): number {
  const has = (id: string) => (Array.isArray(done) ? done.includes(id) : (done as ReadonlySet<string>).has(id));
  return chapter.lessons.findIndex((l) => !has(l));
}

/** Whether a lesson may be played now: its chapter is open and the lessons before it are done. */
export function lessonOpen(id: string, done: ReadonlySet<string> | readonly string[], unlocked: boolean): boolean {
  const at = lessonOf(id);
  if (!at || !chapterOpen(at.chapter, unlocked)) return false;
  const next = nextLesson(at.chapter, done);
  return next === -1 || at.index <= next;
}
