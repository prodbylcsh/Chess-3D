// Translatable strings that live in modules which cannot import the i18n code
// (shared rules, the AI worker). Listed here so the completeness test sees them.
import { tk } from './index';

export const EXTERNAL_KEYS = [
  // AI levels (src/ai/search.ts)
  tk('Novice'), tk('Learning the moves'),
  tk('Casual'), tk('Plays for fun'),
  tk('Club'), tk('A solid opponent'),
  tk('Expert'), tk('Punishes mistakes'),
  tk('Master'), tk('Thinks deep'),
  // rank tiers (supabase/functions/_shared/rating.ts)
  tk('Iron'), tk('Bronze'), tk('Silver'), tk('Gold'), tk('Platinum'), tk('Emerald'), tk('Diamond'), tk('Grandmaster'), tk('Challenger'),
  // stakes (supabase/functions/_shared/economy.ts)
  tk('Low'), tk('Medium'), tk('High'),
  // season brackets (supabase/functions/_shared/seasons.ts)
  tk('Bronze & Silver'), tk('Gold & Platinum'), tk('Emerald & Diamond'), tk('Master & Grandmaster'),
  // end-of-game reasons (src/game/Game.ts)
  tk('Checkmate'), tk('Checkmate!'), tk('Check!'), tk('Draw'), tk('Stalemate'), tk('Insufficient material'), tk('Threefold repetition'), tk('Fifty-move rule'),
  // stored game-end reasons (game records)
  tk('checkmate'), tk('resignation'), tk('agreement'), tk('stalemate'), tk('insufficient material'), tk('threefold repetition'), tk('fifty-move rule'), tk('abandoned'),
  tk('timeout'), tk('timeout vs insufficient material'), tk('aborted'),
  // Learn chapters (supabase/functions/_shared/learn.ts)
  tk('The pieces'), tk('The board, and how every piece moves and captures.'),
  tk('Special rules'), tk('Check and checkmate, castling, promotion and en passant.'),
  tk('How a game ends'), tk('Stalemate, the draws, resigning and running out of time.'),
  tk('Opening moves'), tk('The first moves of a game, and why they are played.'),
  tk('Playing well'), tk('What the pieces are worth, trades and the simple mates.'),
  tk('First tactics'), tk('Forks, pins and discovered attacks.'),
  tk('First endgames'), tk('An active king, passed pawns and the opposition.'),
  tk('Coordinates'), tk('How squares and moves are written down.'),
  // time controls (supabase/functions/_shared/play.ts)
  tk('Fast blitz'), tk('Blitz'), tk('Rapid'), tk('Classical'),
];
