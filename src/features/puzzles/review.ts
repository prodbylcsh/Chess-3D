// Reviewing puzzles (docs/PLATFORM.md §4.2): the ones under three stars, or whose solution
// was shown, come back once the review wait (REVIEW_AFTER_HOURS) has passed.
import type { PuzzleModuleProgress } from '../../api';

/** Puzzles of a module ready for a review: under three stars (or seen) and past the wait. */
export function reviewReady(p: PuzzleModuleProgress, now = Date.now()): number[] {
  const out: number[] = [];
  p.stars.forEach((s, i) => {
    const from = p.reviewFrom[i];
    if ((s > 0 || p.seen[i]) && s < 3 && from && Date.parse(from) <= now) out.push(i);
  });
  return out;
}

/** Puzzles waiting for their review, with the time the first becomes ready. */
export function reviewWaiting(p: PuzzleModuleProgress, now = Date.now()): { count: number; next: string | null } {
  let next: string | null = null;
  let count = 0;
  p.stars.forEach((s, i) => {
    const from = p.reviewFrom[i];
    if ((s > 0 || p.seen[i]) && s < 3 && from && Date.parse(from) > now) {
      count++;
      if (!next || from < next) next = from;
    }
  });
  return { count, next };
}

/** The next puzzle to play in a module: the first neither solved nor seen (-1 when all are). */
export const nextOpen = (p: PuzzleModuleProgress): number => p.stars.findIndex((s, i) => s === 0 && !p.seen[i]);
