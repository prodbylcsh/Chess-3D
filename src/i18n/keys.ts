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
];
