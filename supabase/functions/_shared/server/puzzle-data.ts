// Every module's puzzles, for the server (the app loads them one module at a time).
import endgames from '../puzzle-data/endgames.json' with { type: 'json' };
import firstSteps from '../puzzle-data/first-steps.json' with { type: 'json' };
import forks from '../puzzle-data/forks.json' with { type: 'json' };
import mateIn2 from '../puzzle-data/mate-in-2.json' with { type: 'json' };
import pins from '../puzzle-data/pins.json' with { type: 'json' };
import sacrifices from '../puzzle-data/sacrifices.json' with { type: 'json' };
import type { Puzzle } from '../puzzles.ts';

export const PUZZLES: Record<string, Puzzle[]> = {
  'first-steps': firstSteps,
  'mate-in-2': mateIn2,
  forks,
  pins,
  sacrifices,
  endgames,
};
