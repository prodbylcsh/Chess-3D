// The first six Instagram carousel posts: their slides, captions and alt texts.
// Who they are for and why: docs/marketing/README.md; how they look:
// docs/marketing/INSTAGRAM-DESIGN.md. Built by scripts/promo/build-posts.ts.
//
// Marketing describes the finished platform (everything on the roadmap counts as built).

export type Slide =
  | { type: 'cover'; img: string; kicker: string; title: string; sub?: string; tag: string; focus?: string }
  | { type: 'scene'; img: string; kicker?: string; moves?: string; title?: string; text: string; focus?: string }
  | { type: 'statement'; kicker?: string; moves?: string; title: string; text?: string; visual?: Visual; img?: string }
  | { type: 'card'; visual: Visual; kicker?: string; title: string; text: string; accent?: string }
  | { type: 'grid'; items: { img: string; label: string }[]; kicker?: string; title: string; text?: string }
  | { type: 'steps'; kicker?: string; title: string; items: { head: string; text: string }[]; img?: string }
  | { type: 'phone'; img: string; kicker?: string; title: string; text: string }
  | { type: 'cta'; img?: string; kicker?: string; title: string; text: string; ask?: string };

/** Pictures drawn by the builder rather than rendered from the game. */
export type Visual =
  | { kind: 'emblems'; tiers: { id: string; division?: number }[]; size?: number }
  | { kind: 'board'; fen: string; arrows?: [string, string][]; marks?: string[]; flat?: boolean; caption?: string }
  | { kind: 'image'; img: string }
  | { kind: 'table'; rows: [string, string][]; head?: [string, string] };

export interface Post {
  slug: string;
  /** for the plan in docs/marketing/README.md */
  audience: string;
  slides: Slide[];
  caption: string;
  alt: string;
}

const OPERA_BG = 'opera-start-still';

/** The order to post them in; the profile grid shows the newest top left (docs/marketing/README.md). */
export const POSTING_ORDER = ['05', '03', '06', '04', '02', '01'];

export const POSTS: Post[] = [
  // ------------------------------------------------------------------ 1. hero
  {
    slug: '01-pieces-fight',
    audience: 'everyone (primary first): the promise of the platform',
    slides: [
      {
        type: 'cover',
        img: 'knight-leap-air',
        tag: 'Gameplay',
        kicker: 'Real chess. Real rules.',
        title: 'Chess, but the pieces fight.',
      },
      {
        type: 'statement',
        kicker: 'For centuries',
        title: 'A capture looked like this.',
        text: 'A piece disappears. That’s it.',
        visual: { kind: 'board', fen: 'r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3', flat: true },
      },
      {
        type: 'scene',
        img: 'knight-leap-slam',
        kicker: 'Knights and rooks',
        title: 'Leap and slam down.',
        text: 'Every capture plays out on a cinematic 3D board.',
      },
      {
        type: 'scene',
        img: 'queen-spell-bolt',
        kicker: 'Bishops and queens',
        title: 'Cast spells.',
        text: 'The bolt finds its target. The target cracks with light.',
      },
      {
        type: 'scene',
        img: 'queen-spell-blast',
        kicker: 'Every single capture',
        title: 'The victim shatters.',
        text: 'And the animation never costs you a second on the clock.',
      },
      {
        type: 'cta',
        img: 'queen-spell-mate',
        kicker: 'Wizard Chess',
        title: 'Play free.',
        text: 'Ranked seasons from Iron to Challenger, puzzles, lessons and tournaments.',
        ask: 'Free in your browser · phone & PC',
      },
    ],
    caption: `Chess, but the pieces actually fight. ♟️💥

Knights leap and slam down. Bishops and queens cast spells. Every capture is a little scene, and it never costs you a second on the clock.

Real chess, real rules, a ranked ladder from Iron to Challenger. Free in your browser on phone and PC.

▶️ Play free: link in bio

#chess #3dchess #chessgame #indiegame #gaming`,
    alt: 'Six slides from Wizard Chess, a 3D chess game: a white knight leaping high over the board onto a black pawn; a flat 2D chess diagram where a captured piece simply disappears; the knight slamming down in a burst of light; a white queen firing a golden magic bolt at a black pawn; the pawn shattering; the queen standing on the square after checkmate.',
  },

  // ------------------------------------------------------------------ 2. ranks
  {
    slug: '02-ranked-ladder',
    audience: 'primary + Gen Z ranked gamers: the ladder they already understand',
    slides: [
      {
        type: 'cover',
        img: 'opening-low-still',
        tag: 'Ranked',
        kicker: 'Iron → Challenger',
        title: 'Chess has ranks now.',
        focus: 'emblem',
      },
      {
        type: 'steps',
        kicker: 'How it works',
        title: 'Simple. Fair. Addictive.',
        items: [
          { head: 'Everyone starts at Silver II', text: '1,000 MMR, matched against players at your level.' },
          { head: 'Win +20, lose −18', text: 'About five wins take you up a division.' },
          { head: 'Four divisions per tier', text: 'IV to I, with a progress bar like League points.' },
          { head: 'Skill only', text: 'Nothing you can buy changes your rank.' },
        ],
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'iron', division: 4 }, { id: 'bronze', division: 2 }] },
        kicker: '0 – 799 MMR',
        title: 'Iron · Bronze',
        text: 'Everyone starts somewhere. Learn the patterns, climb out.',
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'silver', division: 2 }], size: 380 },
        kicker: '800 – 1,199 MMR',
        title: 'Silver',
        text: 'Your first ranked game puts you here: Silver II.',
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'gold', division: 3 }, { id: 'platinum', division: 1 }] },
        kicker: '1,200 – 1,999 MMR',
        title: 'Gold · Platinum',
        text: 'You see the tactics coming. This is where the real climb starts.',
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'emerald', division: 2 }, { id: 'diamond', division: 1 }] },
        kicker: '2,000 – 2,799 MMR',
        title: 'Emerald · Diamond',
        text: 'The air gets thin. Every game is a fight.',
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'master' }], size: 380 },
        kicker: '2,800+ MMR',
        title: 'Master',
        text: 'No divisions any more. Just you and the ladder.',
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'grandmaster' }], size: 380 },
        kicker: '3,200+ MMR',
        title: 'Grandmaster',
        text: 'Your name at the top of the season’s ladder.',
      },
      {
        type: 'card',
        visual: { kind: 'emblems', tiers: [{ id: 'challenger' }], size: 420 },
        kicker: '3,600+ MMR',
        title: 'Challenger',
        text: 'The top of the ladder. Most players will never see this emblem.',
        accent: '#ffe08a',
      },
      {
        type: 'card',
        visual: {
          kind: 'table',
          head: ['Highest rank', 'Season reward'],
          rows: [
            ['Iron', '500 coins + an item'],
            ['Bronze · Silver', '1,000 coins + an item'],
            ['Gold · Platinum', '2,000 coins + an item'],
            ['Emerald · Diamond', '4,000 coins + an item'],
            ['Master · Grandmaster', '7,500 coins + an item'],
            ['Challenger', '12,000 coins + top item'],
          ],
        },
        kicker: 'Seasons',
        title: 'Every 3 months, a new season.',
        text: 'Plus a season badge and a profile icon you can’t buy anywhere.',
      },
      {
        type: 'statement',
        kicker: 'Fair play',
        title: 'Skill only.',
        text: 'Every ranked game is checked for engine help. Coins buy looks, never an advantage. Animations never run on your clock.',
        img: 'opening-wide-still',
      },
      {
        type: 'cta',
        img: 'opening-low-still',
        kicker: 'Your turn',
        title: 'Where would you land?',
        text: 'Comment your guess: Iron, Gold, Diamond… Challenger? Then go prove it.',
        ask: 'Ranked is free · link in bio',
      },
    ],
    caption: `Chess has ranks now. Iron → Bronze → Silver → Gold → Platinum → Emerald → Diamond → Master → Grandmaster → Challenger. 🏆

Win +20, lose −18, about five wins per division. Seasons every three months with rewards for the highest rank you reach: coins, an item, a badge and an icon nobody can buy.

Skill only. Every game is checked for engine help, and coins never buy an advantage.

Where would you land? Comment your guess 👇

#chess #ranked #chessgame #competitivegaming #3dchess`,
    alt: 'Twelve slides explaining the Wizard Chess ranked ladder: the rank emblems, shield-shaped crests in the colours of each tier from grey Iron to golden Challenger with a crown; how points are won and lost; the season rewards table; a note on fair play; and the question where you would land.',
  },

  // ------------------------------------------------------------------ 3. items
  {
    slug: '03-make-it-yours',
    audience: 'primary + fantasy fans and collectors: cosmetics as status and style',
    slides: [
      {
        type: 'cover',
        img: 'fx-frostbite-hit',
        tag: 'Collection',
        kicker: 'Piece sets · boards · effects',
        title: 'Make the board yours.',
      },
      {
        type: 'scene',
        img: 'set-marble-still',
        kicker: 'Free · everyone’s first set',
        title: 'Classic Marble',
        text: 'Hand-polished marble in black and white. Where every player begins.',
      },
      {
        type: 'scene',
        img: 'set-squircle-still',
        kicker: 'Piece set · common',
        title: 'Squircle',
        text: 'Pieces that melt from circle to square. Soft, modern, unmistakable.',
      },
      {
        type: 'scene',
        img: 'set-monolith-still',
        kicker: 'Piece set · legendary',
        title: 'Monolith',
        text: 'Black stone against ivory marble. Sharp, tall, silent.',
      },
      {
        type: 'scene',
        img: 'board-monolith-still',
        kicker: 'Board · legendary',
        title: 'The Monolith board',
        text: 'Graphite oak and black squares on a chrome hull.',
      },
      {
        type: 'grid',
        kicker: 'Capture effects',
        title: 'Choose how they fall.',
        items: [
          { img: 'fx-shatter-hit', label: 'Shatter' },
          { img: 'fx-embers-hit', label: 'Embers' },
          { img: 'fx-frostbite-hit', label: 'Frostbite' },
          { img: 'fx-implode-hit', label: 'Implode' },
        ],
      },
      {
        type: 'grid',
        kicker: 'Move animations',
        title: 'And how your pieces move.',
        items: [
          { img: 'move-comet-mid', label: 'Comet' },
          { img: 'move-levitate-mid', label: 'Levitate' },
        ],
      },
      {
        type: 'cta',
        img: 'board-monolith-still',
        kicker: 'Seen by every opponent',
        title: 'Earned, not bought.',
        text: 'Every game pays coins. Spend them on looks, never on power. Season rewards you can only win.',
        ask: 'Free in your browser · link in bio',
      },
    ],
    caption: `Your pieces. Your board. Your captures. ✨

Classic Marble for everyone, Squircle pieces that melt from circle to square, the legendary Monolith set and board. Capture effects from shatter to frostbite, moves from glide to comet.

Your opponent sees your set in every game. Earn coins by playing; they buy looks, never power.

Which set would you play? 👇

#chess #3dchess #chessset #gameart #indiegame`,
    alt: 'Eight slides of Wizard Chess cosmetics rendered in 3D: the tall black and ivory Monolith piece set; the Classic Marble set; the rounded Squircle set; the Monolith board of dark oak and chrome; four capture effects side by side (shatter, embers, frostbite, implode); two move animations (comet and levitate); and a closing slide saying items are earned by playing.',
  },

  // ------------------------------------------------------------------ 4. puzzle
  {
    slug: '04-mate-in-two',
    audience: 'primary + beginners: engagement (comments, saves), puzzles as a reason to come back',
    slides: [
      {
        type: 'cover',
        img: 'puzzle-mate2-taken',
        tag: 'Puzzle',
        focus: 'board',
        kicker: 'White to move · mate in 2',
        title: 'Black just took your queen.',
        sub: 'Comment your answer before you swipe.',
      },
      {
        type: 'statement',
        kicker: 'Hint',
        title: 'Look at the back rank.',
        text: 'Black’s king hides behind three pawns. Who guards the squares beside it?',
        visual: { kind: 'board', fen: 'rn4k1/p4ppp/8/3P4/4qBn1/7P/PP2bPP1/2R1KB1R w K - 0 21', marks: ['f8', 'g8', 'h8', 'f7', 'g7', 'h7'] },
      },
      {
        type: 'statement',
        kicker: 'Solution',
        moves: '1. Rc8+!  Qe8   2. Rxe8#',
        title: 'Back-rank mate.',
        text: 'The rook checks, the queen has to block, the rook takes it: checkmate. The king’s own pawns lock it in.',
        visual: { kind: 'board', fen: 'rn2R1k1/p4ppp/8/3P4/5Bn1/7P/PP2bPP1/4KB1R b K - 0 22', arrows: [['c1', 'c8'], ['c8', 'e8']], marks: ['g8'] },
      },
      {
        type: 'cta',
        img: 'puzzle-mate2-mate-mate',
        kicker: '700 puzzles · 7 worlds',
        title: 'Got it? Next one.',
        text: 'Openings, forks, pins, sacrifices, endgames: worlds of 100 puzzles on a map. A new daily puzzle every day.',
        ask: 'Daily puzzle free · link in bio',
      },
    ],
    caption: `Black just took your queen. 😳 White to move, mate in 2.

Comment your answer before you swipe. The solution is on slide 3.

This one is from our Mate in Two world: 100 puzzles from easy to brutal, one of seven worlds on the puzzle map. New daily puzzle every day.

Save it for your friend who says they're good at chess. 🔖

#chess #chesspuzzle #mateintwo #chesstactics #3dchess`,
    alt: 'A chess puzzle on a 3D board seen from above: Black’s bishop has just captured White’s queen. White to move and mate in two. Second slide: a hint with the squares around Black’s king marked. Third slide: the solution, rook to c8 check, queen blocks on e8, rook takes on e8, checkmate. Last slide: the checkmate on the 3D board.',
  },

  // ------------------------------------------------------------------ 5. learn
  {
    slug: '05-learn-chess',
    audience: 'beginners and self-improvers: Learn and the daily habit',
    slides: [
      {
        type: 'cover',
        img: 'opening-low-still',
        tag: 'Learn',
        kicker: '8 chapters · 41 lessons',
        title: 'Never learned chess? Start here.',
      },
      {
        type: 'steps',
        kicker: 'Every lesson in four steps',
        title: 'Explain. Show. Try. Check.',
        items: [
          { head: 'Explain', text: 'One short idea at a time.' },
          { head: 'Show', text: 'The piece moves on the 3D board and its squares light up.' },
          { head: 'Try', text: 'A small task: take all the pawns, get out of check, castle.' },
          { head: 'Check', text: 'A quick question with the reason behind the answer.' },
        ],
        img: 'set-marble-still',
      },
      {
        type: 'phone',
        img: 'ui-learn-still',
        kicker: 'On your phone or PC',
        title: 'One idea at a time.',
        text: 'A short explanation, the 3D board shows it, then you try. Mistakes are explained by the rule, not by an engine score.',
      },
      {
        type: 'card',
        visual: {
          kind: 'table',
          rows: [
            ['1  The pieces', 'free'],
            ['2  Special rules', 'free'],
            ['3  How a game ends', ''],
            ['4  Opening moves', ''],
            ['5  Playing well', ''],
            ['6  First tactics', ''],
            ['7  First endgames', ''],
            ['8  Coordinates', ''],
          ],
        },
        kicker: 'The path',
        title: 'From “how does the knight move?”',
        text: '…to your first checkmate and your first endgame.',
      },
      {
        type: 'cta',
        img: 'set-marble-still',
        kicker: '10 minutes a day',
        title: 'Start today.',
        text: 'The first two chapters are free: enough to play a whole game. Then a daily puzzle keeps the streak going.',
        ask: 'Free in your browser · link in bio',
      },
    ],
    caption: `Always wanted to learn chess properly? Start here. ♟️

8 chapters, 41 short lessons on a 3D board. Every lesson: explain, show, try, check. Mistakes are explained by the rule, not by an engine score.

The first two chapters are free, and that's enough to play your first whole game. Then 10 minutes a day with the daily puzzle.

Save this for when you start. 🔖

#learnchess #chessforbeginners #chess #3dchess #newhobby`,
    alt: 'Five slides about learning chess in Wizard Chess: a 3D chess board in candlelight; the four steps of every lesson (explain, show, try, check); a phone screenshot of a lesson with the coach card; the eight chapters from The pieces to Coordinates, the first two free; and an invitation to start today.',
  },

  // ------------------------------------------------------------------ 6. opera game
  {
    slug: '06-opera-game',
    audience: 'everyone: a saved and shared story that shows the 3D board move by move',
    slides: [
      {
        type: 'cover',
        img: 'opera-18-rd8-mate',
        tag: 'Chess history',
        kicker: 'Paris, 1858 · swipe through all 17 moves',
        title: 'The most famous game ever played.',
      },
      {
        type: 'statement',
        kicker: 'The Opera Game',
        title: 'Played in a box at the opera.',
        text: 'Paul Morphy, 21, sat with his back to the stage. Against him: the Duke of Brunswick and Count Isouard, playing together.',
        img: OPERA_BG,
      },
      { type: 'scene', img: 'opera-02-philidor-done', moves: '1. e4 e5  2. Nf3 d6', title: 'A quiet start.', text: 'The Philidor Defence: solid, but passive.' },
      { type: 'scene', img: 'opera-03-pin-done', moves: '3. d4 Bg4', title: 'The pin.', text: 'Black’s bishop pins the knight to the queen.' },
      { type: 'scene', img: 'opera-04-bxf3-bolt', moves: '4. dxe5 Bxf3', title: 'Bishop for knight.', text: 'Black gives up the bishop rather than lose a pawn.' },
      { type: 'scene', img: 'opera-05-qxf3-blast', moves: '5. Qxf3 dxe5', title: 'The queen arrives.', text: 'White recaptures with the queen, already eyeing the weak pawn beside Black’s king.' },
      { type: 'scene', img: 'opera-06-bc4-done', moves: '6. Bc4 Nf6', title: 'Mate is threatened.', text: 'Queen and bishop aim at that pawn. Black covers it with the knight.' },
      { type: 'scene', img: 'opera-07-qb3-done', moves: '7. Qb3!', title: 'Two targets at once.', text: 'The queen now hits the king’s pawn and the pawn on b7.' },
      { type: 'scene', img: 'opera-08-nc3-done', moves: '7… Qe7  8. Nc3', title: 'No greed.', text: 'Morphy could take a pawn. He brings another piece into the game instead.' },
      { type: 'scene', img: 'opera-09-bg5-done', moves: '8… c6  9. Bg5 b5?', title: 'Another pin.', text: 'Now the knight can’t move. Black lashes out at the bishop.' },
      { type: 'scene', img: 'opera-10-nxb5-slam', moves: '10. Nxb5!', title: 'A knight sacrifice.', text: 'Morphy gives a piece to tear the position open.' },
      { type: 'scene', img: 'opera-11-bxb5-blast', moves: '10… cxb5  11. Bxb5+', title: 'Check.', text: 'The bishop strikes the king. Black blocks with the knight.' },
      { type: 'scene', img: 'opera-12-castle-done', moves: '11… Nbd7  12. O-O-O', title: 'The rook enters.', text: 'Castling queenside brings the rook straight onto the open file.' },
      { type: 'scene', img: 'opera-13-rxd7-slam', moves: '12… Rd8  13. Rxd7!', title: 'Another sacrifice.', text: 'The rook crashes into the pinned knight.' },
      { type: 'scene', img: 'opera-14-rd1-done', moves: '13… Rxd7  14. Rd1', title: 'Pressure, not material.', text: 'The second rook joins. Every black piece is stuck.' },
      { type: 'scene', img: 'opera-15-bxd7-blast', moves: '14… Qe6  15. Bxd7+', title: 'Check again.', text: 'The bishop takes the rook. The knight has to take back.' },
      { type: 'scene', img: 'opera-16-qb8-done', moves: '15… Nxd7  16. Qb8+!!', title: 'The queen sacrifice.', text: 'Morphy offers his queen. It cannot be refused.' },
      { type: 'scene', img: 'opera-17-nxb8-slam', moves: '16… Nxb8', title: 'Forced.', text: 'The knight takes the queen, and leaves the back rank open.' },
      { type: 'scene', img: 'opera-18-rd8-mate', moves: '17. Rd8#', title: 'Checkmate.', text: 'A rook and a bishop. Black still has a queen and a rook, and they can do nothing.' },
      {
        type: 'cta',
        img: 'opera-16-qb8-done',
        kicker: 'Your games, like this',
        title: 'Replay every game in 3D.',
        text: 'Every move animated, every capture a scene. Watch your own games back and find your Morphy moments.',
        ask: 'Play free · link in bio',
      },
    ],
    caption: `The most famous chess game ever played, in 20 frames. 🎭

Paris, 1858. Paul Morphy, 21, plays the Duke of Brunswick and Count Isouard in a box at the opera, with his back to the stage. 17 moves later: two sacrifices, a queen given away and a checkmate with just two pieces.

Swipe through it on our 3D board, and save it for later. 🔖

#chess #chesshistory #paulmorphy #operagame #3dchess`,
    alt: 'Twenty slides retelling the Opera Game, Paul Morphy against the Duke of Brunswick and Count Isouard, Paris 1858, on a cinematic 3D chess board: each slide shows one moment with its moves, from the quiet opening through the knight and rook sacrifices and the queen sacrifice on b8 to the final checkmate by the rook on d8.',
  },
];
