// When a player is stuck on a puzzle (docs/PLATFORM.md §4.2), the coach offers its solution.
// Not after a fixed number of wrong moves alone: those already bring the free marks and the
// piece. Here mistakes, hints and time on the current move add up, and the first minute is
// always the player's own.

/**
 * Mistakes and hints, plus a point for every 40 seconds on the current move (counted only
 * while the page is visible): the solution is offered at 5 points, never in the first
 * minute of the puzzle, and always after four minutes on one move.
 */
export function stuckness(mistakes: number, hints: number, puzzleMs: number, moveMs: number): boolean {
  if (puzzleMs < 60_000) return false;
  return moveMs >= 240_000 || mistakes + hints + Math.floor(moveMs / 40_000) >= 5;
}
