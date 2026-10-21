// The lessons of Learn (docs/PLATFORM.md §4.3): explain, show, try, check. Every lesson is a
// list of steps on the 3D board. A board without both kings is "free": the pieces move as
// usual, the game never ends, and the player moves again after each move (src/game/Game.ts).
// Texts speak of pieces, not squares. English here, Czech in src/i18n/cs.ts; tests check
// that every task can be done (tests/learn.test.ts).
// the translator's marker, as in src/i18n (kept local so the tests can load this file in Node)
const tk = (text: string) => text;

export type Task =
  /** move your pieces onto every star */
  | { kind: 'collect' }
  /** take all the opponent's pieces */
  | { kind: 'capture' }
  /** play one of these moves (UCI); another legal move is answered with `wrong` */
  | { kind: 'move'; moves: string[]; wrong: string }
  /** give check */
  | { kind: 'check' }
  /** give checkmate in one move (a stalemate is explained) */
  | { kind: 'mate' }
  /** any legal move (the rules allow only the ones that get out of check) */
  | { kind: 'escape' };

export interface Quiz {
  options: { text: string; correct?: boolean }[];
  /** shown once answered right */
  why: string;
}

export interface Step {
  /** what the coach says */
  say: string;
  /** a new board (FEN); without it the board stays as it is */
  fen?: string;
  /** moves the board plays first (UCI), e.g. the opponent's double step before en passant */
  play?: string[];
  /** stars on these squares */
  marks?: string[];
  /** show where the piece on this square can go */
  moves?: string;
  arrows?: [string, string][];
  task?: Task;
  quiz?: Quiz;
}

export interface Lesson {
  id: string;
  title: string;
  steps: Step[];
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const LESSONS: Record<string, Lesson> = {
  // ---------------------------------------------------------------- chapter 1: the pieces
  board: {
    id: 'board',
    title: tk('The board'),
    steps: [
      { say: tk('Chess is played on a board of 64 squares, light and dark. Each player has 16 pieces: White starts at the bottom, Black at the top.'), fen: START },
      { say: tk('The board is always set up with a light square in each player\'s right-hand corner.'), marks: ['h1', 'a8'] },
      { say: tk('In the back row stand the rooks, knights, bishops, the queen and the king; in front of them, eight pawns. The queen stands on the square of her own colour.') },
      {
        say: tk('Who makes the first move of a game?'),
        quiz: {
          options: [{ text: tk('White'), correct: true }, { text: tk('Black') }, { text: tk('Whoever is quicker') }],
          why: tk('White always starts. Then the players take turns, one move each, and nobody may skip a turn.'),
        },
      },
      { say: tk('The goal is to trap the enemy king so that it cannot escape: checkmate. You will learn it in the next chapter. First, meet the pieces.') },
    ],
  },
  rook: {
    id: 'rook',
    title: tk('The rook'),
    steps: [
      { say: tk('The rook moves in straight lines: forwards, backwards and sideways, as far as it likes.'), fen: '8/8/8/8/3R4/8/8/8 w - - 0 1', moves: 'd4' },
      { say: tk('It cannot jump over other pieces: a piece in the way stops it.'), fen: '8/8/3P4/8/1P1R4/8/8/8 w - - 0 1', moves: 'd4' },
      { say: tk('Collect all the stars with the rook.'), fen: '8/8/8/8/8/8/8/R7 w - - 0 1', marks: ['a5', 'e5', 'e8'], task: { kind: 'collect' } },
      {
        say: tk('A piece captures by moving onto the square of an enemy piece, which leaves the board. Take all the black pawns.'),
        fen: '8/8/p4p2/8/8/8/5p2/R7 w - - 0 1',
        task: { kind: 'capture' },
      },
    ],
  },
  bishop: {
    id: 'bishop',
    title: tk('The bishop'),
    steps: [
      { say: tk('The bishop moves diagonally, as far as it likes.'), fen: '8/8/8/8/3B4/8/8/8 w - - 0 1', moves: 'd4' },
      { say: tk('A bishop never leaves the colour of its square. That is why each player has two: one for the light squares, one for the dark.'), fen: '8/8/8/8/8/8/8/2B2B2 w - - 0 1' },
      { say: tk('Collect the stars with the bishop.'), fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', marks: ['e3', 'g5', 'b6'], task: { kind: 'collect' } },
      { say: tk('Take all the black knights.'), fen: '8/8/3n4/8/1n3n2/8/8/2B5 w - - 0 1', task: { kind: 'capture' } },
    ],
  },
  queen: {
    id: 'queen',
    title: tk('The queen'),
    steps: [
      { say: tk('The queen moves like a rook and a bishop together: in straight lines and diagonally, as far as she likes. She is the strongest piece.'), fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1', moves: 'd4' },
      { say: tk('Collect the stars with the queen.'), fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', marks: ['d5', 'h5', 'e8'], task: { kind: 'collect' } },
      { say: tk('Take all the black pieces.'), fen: '8/n5b1/8/8/8/8/8/Q5r1 w - - 0 1', task: { kind: 'capture' } },
    ],
  },
  king: {
    id: 'king',
    title: tk('The king'),
    steps: [
      { say: tk('The king moves one square in any direction. He is the most important piece: if he is trapped, the game is lost.'), fen: '8/8/8/8/4K3/8/8/8 w - - 0 1', moves: 'e4' },
      { say: tk('Walk the king to the stars, one square at a time.'), fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', marks: ['e3', 'g4'], task: { kind: 'collect' } },
      {
        say: tk('The king may never step where an enemy piece could take him. Here the black rook guards a whole line, so the king cannot go there.'),
        fen: '3r3k/8/8/8/8/8/8/4K3 w - - 0 1',
        moves: 'e1',
      },
    ],
  },
  knight: {
    id: 'knight',
    title: tk('The knight'),
    steps: [
      { say: tk('The knight jumps in an L shape: two squares in a straight line, then one to the side.'), fen: '8/8/8/8/3N4/8/8/8 w - - 0 1', moves: 'd4' },
      { say: tk('It is the only piece that jumps over others. Even when surrounded, it gets out.'), fen: '8/8/8/2PPP3/2PNP3/2PPP3/8/8 w - - 0 1', moves: 'd4' },
      { say: tk('Collect the stars with the knight.'), fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', marks: ['c3', 'e4', 'f6'], task: { kind: 'collect' } },
      { say: tk('Take all the black pawns.'), fen: '8/3p4/8/4p3/8/5p2/8/6N1 w - - 0 1', task: { kind: 'capture' } },
    ],
  },
  pawn: {
    id: 'pawn',
    title: tk('The pawn'),
    steps: [
      { say: tk('The pawn moves straight forwards, one square at a time. It never moves backwards.'), fen: '8/8/8/8/8/4P3/8/8 w - - 0 1', moves: 'e3' },
      { say: tk('From its starting square, a pawn may move one or two squares.'), fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', moves: 'e2' },
      { say: tk('Reach the star in one move.'), marks: ['e4'], task: { kind: 'collect' } },
      {
        say: tk('The pawn captures differently from how it moves: one square diagonally forwards. A piece right in front of it blocks it.'),
        fen: '8/8/8/3pqp2/4P3/8/8/8 w - - 0 1',
        moves: 'e4',
      },
      { say: tk('Take all the black pieces with the pawn.'), fen: '8/8/8/3n4/4b3/3r4/2P5/8 w - - 0 1', task: { kind: 'capture' } },
    ],
  },
  capture: {
    id: 'capture',
    title: tk('Capturing'),
    steps: [
      { say: tk('Now use two pieces. Take all the black pieces: the rook and the bishop each have their own way.'), fen: '8/8/7n/p7/8/8/8/R1B5 w - - 0 1', task: { kind: 'capture' } },
      { say: tk('You can never take your own pieces, and they block your way like any other piece.'), fen: '8/8/8/8/1P1R4/8/3P4/8 w - - 0 1', moves: 'd4' },
      {
        say: tk('Which piece can jump over other pieces?'),
        quiz: {
          options: [{ text: tk('The rook') }, { text: tk('The knight'), correct: true }, { text: tk('The queen') }],
          why: tk('Only the knight jumps. All the other pieces are stopped by a piece in their way.'),
        },
      },
      {
        say: tk('Which piece is the strongest?'),
        quiz: {
          options: [{ text: tk('The king') }, { text: tk('The rook') }, { text: tk('The queen'), correct: true }],
          why: tk('The queen moves like a rook and a bishop at once. The king is the most important piece, but not the strongest.'),
        },
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 2: special rules
  check: {
    id: 'check',
    title: tk('Check'),
    steps: [
      { say: tk('When a piece attacks the enemy king, the king is in check. Here the white rook attacks the black king.'), fen: '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1', arrows: [['e1', 'e8']] },
      { say: tk('Give check with your rook.'), fen: '4k3/8/8/8/8/8/8/R5K1 w - - 0 1', task: { kind: 'check' } },
      {
        say: tk('Is the black king in check?'),
        fen: '4k3/8/8/1B6/8/8/8/6K1 b - - 0 1',
        quiz: {
          options: [{ text: tk('Yes'), correct: true }, { text: tk('No') }],
          why: tk('Yes: the bishop attacks the king along the diagonal.'),
        },
      },
    ],
  },
  escape: {
    id: 'escape',
    title: tk('Getting out of check'),
    steps: [
      { say: tk('A king in check must get out of it at once. There are three ways: move the king away, put a piece in between, or take the attacking piece.'), fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1' },
      { say: tk('The black rook checks your king. Move the king out of its line.'), fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', task: { kind: 'escape' } },
      {
        say: tk('Your king cannot move. Put a piece between it and the rook.'),
        fen: '6k1/8/8/8/8/8/3N1PPP/r5K1 w - - 0 1',
        task: { kind: 'move', moves: ['d2b1', 'd2f1'], wrong: tk('Not that one: the king must be out of check after your move.') },
      },
      {
        say: tk('Now take the piece that gives check.'),
        fen: '6k1/8/8/8/1B6/8/5PPP/4r1K1 w - - 0 1',
        task: { kind: 'move', moves: ['b4e1'], wrong: tk('Not that one: take the rook that gives check.') },
      },
    ],
  },
  checkmate: {
    id: 'checkmate',
    title: tk('Checkmate'),
    steps: [
      { say: tk('If the king is in check and there is no way out, it is checkmate, and the game is over. Whoever gives checkmate wins.'), fen: 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1' },
      { say: tk('The black king is walled in by its own pawns. Give checkmate in one move.'), fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', task: { kind: 'mate' } },
      { say: tk('Your king guards the escape squares. Checkmate with the queen.'), fen: '7k/8/6K1/8/8/8/8/1Q6 w - - 0 1', task: { kind: 'mate' } },
      { say: tk('Two rooks work like a ladder: one cuts off a row, the other gives check. Checkmate.'), fen: 'k7/6R1/8/8/8/8/8/6KR w - - 0 1', task: { kind: 'mate' } },
    ],
  },
  castling: {
    id: 'castling',
    title: tk('Castling'),
    steps: [
      {
        say: tk('Castling moves the king and a rook at once: the king steps two squares towards the rook, and the rook jumps over to the king\'s other side. It brings the king to safety.'),
        fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
        play: ['e1g1'],
      },
      {
        say: tk('Castle on the short side: move the king two squares towards the rook on the right.'),
        fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
        task: { kind: 'move', moves: ['e1g1'], wrong: tk('That is an ordinary move. To castle, move the king two squares towards the rook.') },
      },
      { say: tk('You may castle only if the king and that rook have not moved yet, nothing stands between them, the king is not in check, and it does not pass or land on a square an enemy piece attacks.') },
      {
        say: tk('Can White castle on the short side here?'),
        fen: '4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1',
        quiz: {
          options: [{ text: tk('Yes') }, { text: tk('No'), correct: true }],
          why: tk('No: on its way the king would pass a square the black rook attacks. On the long side it may.'),
        },
      },
      {
        say: tk('The white king is in check. May it castle?'),
        fen: '4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1',
        quiz: {
          options: [{ text: tk('Yes') }, { text: tk('No'), correct: true }],
          why: tk('No: castling is never allowed out of check.'),
        },
      },
    ],
  },
  promotion: {
    id: 'promotion',
    title: tk('Promotion'),
    steps: [
      { say: tk('A pawn that reaches the far end of the board is promoted: it becomes a queen, rook, bishop or knight, as you choose. Almost always a queen.'), fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', play: ['b7b8q'] },
      { say: tk('Promote the pawn to a queen.'), fen: '8/4k1P1/8/8/8/8/8/4K3 w - - 0 1', task: { kind: 'move', moves: ['g7g8q'], wrong: tk('Choose the queen: she is the strongest piece.') } },
      {
        say: tk('A pawn can also promote by capturing. Take the rook and become a queen.'),
        fen: '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1',
        task: { kind: 'move', moves: ['a7b8q'], wrong: tk('Take the rook diagonally, and choose the queen.') },
      },
    ],
  },
  'en-passant': {
    id: 'en-passant',
    title: tk('En passant'),
    steps: [
      {
        say: tk('When a pawn moves two squares and lands right beside an enemy pawn, that pawn may take it as if it had moved only one. This is called en passant.'),
        fen: '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1',
        play: ['d7d5'],
      },
      { say: tk('Take the black pawn en passant: your pawn goes diagonally to the square right behind it.'), task: { kind: 'move', moves: ['e5d6'], wrong: tk('Take the pawn that has just moved two squares.') } },
      {
        say: tk('Can you take en passant a move later?'),
        quiz: {
          options: [{ text: tk('Yes, at any time') }, { text: tk('No, only right away'), correct: true }],
          why: tk('Only on your very next move. After that, the chance is gone.'),
        },
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 3: how a game ends
  stalemate: {
    id: 'stalemate',
    title: tk('Stalemate'),
    steps: [
      { say: tk('If the player to move is not in check but has no legal move, it is stalemate, and the game is a draw, even when the other side has much more.'), fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' },
      {
        say: tk('Black is to move. Checkmate or stalemate?'),
        quiz: {
          options: [{ text: tk('Checkmate') }, { text: tk('Stalemate'), correct: true }],
          why: tk('Stalemate: the black king is not in check, but every square it could go to is attacked.'),
        },
      },
      {
        say: tk('And here?'),
        fen: '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',
        quiz: {
          options: [{ text: tk('Checkmate'), correct: true }, { text: tk('Stalemate') }],
          why: tk('Checkmate: the queen gives check and the king protects her, so there is no way out.'),
        },
      },
    ],
  },
  'avoid-stalemate': {
    id: 'avoid-stalemate',
    title: tk('Win, not draw'),
    steps: [
      { say: tk('With much more material it is easy to stalemate by mistake. Before every move, check that the enemy king still has a move, or give checkmate.'), fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' },
      { say: tk('Give checkmate, and careful: one queen move here is stalemate.'), fen: '7k/8/6K1/5Q2/8/8/8/8 w - - 0 1', task: { kind: 'mate' } },
      { say: tk('Checkmate with the rook.'), fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1', task: { kind: 'mate' } },
    ],
  },
  repetition: {
    id: 'repetition',
    title: tk('Draws'),
    steps: [
      { say: tk('A game is drawn when the same position comes up three times with the same player to move. It often happens when one side gives check after check and the king cannot escape.'), fen: '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1' },
      {
        say: tk('The same position is on the board for the third time. What happens?'),
        quiz: {
          options: [{ text: tk('It is a draw'), correct: true }, { text: tk('The player to move loses') }, { text: tk('Nothing, play goes on') }],
          why: tk('It is a draw by repetition.'),
        },
      },
      { say: tk('A game is also drawn after fifty moves by each player without a capture or a pawn move: nobody is making progress. And the players may simply agree to a draw.') },
      {
        say: tk('Fifty moves each, and no capture and no pawn move. What then?'),
        quiz: {
          options: [{ text: tk('White wins') }, { text: tk('It is a draw'), correct: true }, { text: tk('The game starts again') }],
          why: tk('It is a draw by the fifty-move rule.'),
        },
      },
    ],
  },
  material: {
    id: 'material',
    title: tk('Not enough to mate'),
    steps: [
      { say: tk('When neither side has enough pieces left to give checkmate, the game is a draw at once: king against king, king and bishop against king, or king and knight against king.'), fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1' },
      {
        say: tk('Which of these can give checkmate to a lone king?'),
        quiz: {
          options: [{ text: tk('King and rook'), correct: true }, { text: tk('King and bishop') }, { text: tk('King and knight') }],
          why: tk('A rook, with its king helping, is enough. A single bishop or a single knight is not.'),
        },
      },
      { say: tk('Prove it: checkmate with king and rook.'), fen: '6k1/8/6K1/8/8/8/8/R7 w - - 0 1', task: { kind: 'mate' } },
    ],
  },
  clock: {
    id: 'clock',
    title: tk('Resigning and the clock'),
    steps: [
      { say: tk('A game can also end before the board decides it. A player may resign at any time, and the opponent wins.'), fen: START },
      { say: tk('In timed games each player has a clock. Running out of time loses, unless the opponent has nothing left that could give checkmate: then it is a draw.') },
      {
        say: tk('Your time runs out, and your opponent has only the king left. What is the result?'),
        quiz: {
          options: [{ text: tk('You lose') }, { text: tk('It is a draw'), correct: true }, { text: tk('You win') }],
          why: tk('A draw: a lone king can never give checkmate.'),
        },
      },
      { say: tk('In Wizard Chess your clock waits while a move plays out on the board, so the spells and captures never cost you time.') },
    ],
  },

  // ---------------------------------------------------------------- chapter 4: opening moves
  centre: {
    id: 'centre',
    title: tk('The centre'),
    steps: [
      { say: tk('The four squares in the middle of the board are the centre. Pieces there reach the most squares, and whoever holds the centre has more room to play.'), fen: START, marks: ['d4', 'e4', 'd5', 'e5'] },
      { say: tk('A knight in the middle reaches eight squares.'), fen: '8/8/8/8/3N4/8/8/N7 w - - 0 1', moves: 'd4' },
      { say: tk('In the corner, the same knight reaches only two.'), moves: 'a1' },
      {
        say: tk('Start the game by claiming the centre: push one of the two middle pawns two squares.'),
        fen: START,
        task: { kind: 'move', moves: ['e2e4', 'd2d4'], wrong: tk('Push one of the two middle pawns two squares forward: they claim the centre.') },
      },
      {
        say: tk('Why do players fight for the centre?'),
        quiz: {
          options: [{ text: tk('Pieces there reach more squares'), correct: true }, { text: tk('Pieces there cannot be taken') }, { text: tk('The king is safest there') }],
          why: tk('From the centre, pieces reach far in every direction and can quickly go wherever they are needed.'),
        },
      },
    ],
  },
  develop: {
    id: 'develop',
    title: tk('Developing'),
    steps: [
      {
        say: tk('Developing means bringing your knights and bishops out of the back row, so they take part in the game. Do it early, and move each piece once rather than one piece many times.'),
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      },
      {
        say: tk('Bring a knight out towards the centre.'),
        task: { kind: 'move', moves: ['g1f3', 'b1c3'], wrong: tk('Bring a knight out towards the middle: knights are usually the first pieces to develop.') },
      },
      {
        say: tk('Now develop a bishop to a good diagonal.'),
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        task: { kind: 'move', moves: ['f1c4', 'f1b5', 'f1e2'], wrong: tk('Not there: put the bishop where it is safe, does not block a pawn, and looks towards the middle.') },
      },
      {
        say: tk('Which piece should usually stay at home in the first moves?'),
        quiz: {
          options: [{ text: tk('The queen'), correct: true }, { text: tk('A knight') }, { text: tk('A bishop') }],
          why: tk('The queen is so valuable that the opponent chases her with every new piece, and you lose time running away.'),
        },
      },
    ],
  },
  'castle-early': {
    id: 'castle-early',
    title: tk('A safe king'),
    steps: [
      { say: tk('Before the middle of the board opens up, bring your king to safety: castle early. The rook comes towards the centre at the same time.'), fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4' },
      { say: tk('Castle now.'), task: { kind: 'move', moves: ['e1g1'], wrong: tk('Castle: move the king two squares towards the rook on the right.') } },
      { say: tk('After castling, leave the pawns in front of your king where they are: they are its shield.') },
      {
        say: tk('Your king has castled. Which pawns should you keep where they are?'),
        quiz: {
          options: [{ text: tk('The ones in front of the king'), correct: true }, { text: tk('The ones on the other side') }, { text: tk('None of them') }],
          why: tk('The pawns in front of the castled king are its shield. Every one that moves opens a door for the enemy pieces.'),
        },
      },
    ],
  },
  'first-moves': {
    id: 'first-moves',
    title: tk('Good first moves'),
    steps: [
      {
        say: tk('This is how a game often begins: both sides claim the centre with a pawn, bring a knight out, then a bishop. This opening is called the Italian Game.'),
        fen: START,
        play: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
      },
      {
        say: tk('Another good start: the queen\'s pawn two squares. Here White even offers a side pawn to win the centre: the Queen\'s Gambit.'),
        fen: START,
        play: ['d2d4', 'd7d5', 'c2c4'],
      },
      {
        say: tk('What do good opening moves have in common?'),
        quiz: {
          options: [{ text: tk('They claim the centre and bring pieces out'), correct: true }, { text: tk('They bring the queen out early') }, { text: tk('They push the pawns on the edge') }],
          why: tk('The centre, development and a safe king: every good opening follows these three ideas.'),
        },
      },
      { say: tk('To practise real openings move by move, play the Openings module in Puzzles.') },
    ],
  },
  'opening-traps': {
    id: 'opening-traps',
    title: tk('Mistakes to avoid'),
    steps: [
      { say: tk('Moving the pawns in front of your own king too early can be fatal. Watch the quickest mate in chess.'), fen: START, play: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] },
      { say: tk('White pushed the pawns that guard the king, and the black queen walked straight in. Keep those pawns at home in the opening.') },
      {
        say: tk('Black\'s queen and bishop both aim at the pawn beside your king. Stop the mate.'),
        fen: 'rnb1k1nr/pppp1ppp/8/2b1p3/2B1P2q/2N5/PPPP1PPP/R1BQK1NR w KQkq - 4 4',
        task: {
          kind: 'move',
          moves: ['g2g3', 'd1e2', 'd1f3', 'g1h3', 'd2d4', 'd1g4', 'd1h5'],
          wrong: tk('Not that one: protect the pawn beside your king, block the bishop, or chase the queen away.'),
        },
      },
      { say: tk('Look at your opponent\'s threats before every move: it is the best habit in chess.') },
    ],
  },

  // ---------------------------------------------------------------- chapter 5: playing well
  values: {
    id: 'values',
    title: tk('What pieces are worth'),
    steps: [
      { say: tk('To compare pieces, count in pawns: a knight or a bishop is worth about three, a rook five, the queen nine. The king is priceless: without him the game is lost.'), fen: START },
      {
        say: tk('How many pawns is a rook worth?'),
        quiz: { options: [{ text: tk('Three') }, { text: tk('Five'), correct: true }, { text: tk('Nine') }], why: tk('About five: more than a knight or a bishop, less than the queen.') },
      },
      {
        say: tk('You can take a knight, but you lose your rook for it. A good deal?'),
        quiz: { options: [{ text: tk('Yes') }, { text: tk('No'), correct: true }], why: tk('No: you give five and get three.') },
      },
      {
        say: tk('Your bishop for their knight?'),
        quiz: { options: [{ text: tk('A fair trade'), correct: true }, { text: tk('A bad trade') }], why: tk('A fair trade: both are worth about three.') },
      },
    ],
  },
  'free-pieces': {
    id: 'free-pieces',
    title: tk('Free pieces'),
    steps: [
      { say: tk('A piece nobody protects is hanging: it can be taken for free. Look for hanging pieces, the opponent\'s and your own, before every move.'), fen: '6k1/8/4p3/3n4/b7/8/8/3Q2K1 w - - 0 1' },
      {
        say: tk('Take the piece that nobody protects.'),
        task: { kind: 'move', moves: ['d1a4'], wrong: tk('Look again: one black piece is protected by a pawn, the other by nobody. Take the free one.') },
      },
      { say: tk('Your own pieces can hang too. When one of yours is attacked, move it, protect it, or make sure the trade is fair.') },
    ],
  },
  trades: {
    id: 'trades',
    title: tk('Trading'),
    steps: [
      { say: tk('Trading means both sides take a piece of the same value. When you are ahead, trade: the fewer pieces are left, the easier your extra material wins.'), fen: '3qk3/8/8/8/8/8/8/R2QK3 w - - 0 1' },
      {
        say: tk('You are a rook ahead. Should you trade queens?'),
        quiz: { options: [{ text: tk('Yes'), correct: true }, { text: tk('No') }], why: tk('Yes: with the queens gone, your extra rook is even stronger.') },
      },
      {
        say: tk('You are behind. What should you avoid?'),
        quiz: {
          options: [{ text: tk('Trading pieces'), correct: true }, { text: tk('Developing your pieces') }, { text: tk('Castling') }],
          why: tk('Trading helps the side that is ahead. When you are behind, keep pieces on the board and look for chances.'),
        },
      },
    ],
  },
  'queen-mate': {
    id: 'queen-mate',
    title: tk('Mate with the queen'),
    steps: [
      { say: tk('King and queen against a lone king is an easy win: the queen pushes the king to the edge, your king comes close, then the queen gives mate.'), fen: '7k/8/6K1/8/8/8/8/3Q4 w - - 0 1' },
      { say: tk('Checkmate.'), task: { kind: 'mate' } },
      { say: tk('Checkmate again, with the king in the other corner.'), fen: 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1', task: { kind: 'mate' } },
      { say: tk('Remember the stalemate trap: never leave the lone king without a move unless it is checkmate.') },
    ],
  },
  'rook-mate': {
    id: 'rook-mate',
    title: tk('Mate with the rook'),
    steps: [
      { say: tk('With king and rook, your king stands right in front of the enemy king, and the rook gives mate along the edge.'), fen: '3k4/8/3K4/8/8/8/8/7R w - - 0 1' },
      { say: tk('Checkmate.'), task: { kind: 'mate' } },
      { say: tk('A king walled in by its own pawns on the back row is in danger too: the back-rank mate.'), fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', task: { kind: 'mate' } },
    ],
  },

  // ---------------------------------------------------------------- chapter 6: first tactics
  fork: {
    id: 'fork',
    title: tk('The fork'),
    steps: [
      { say: tk('A fork is one piece attacking two at once. The opponent can save only one of them.'), fen: 'r3k3/2N5/8/8/8/8/8/6K1 b - - 0 1', arrows: [['c7', 'e8'], ['c7', 'a8']] },
      { say: tk('Find the knight fork: check the king and attack the rook at the same time.'), fen: 'r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1', task: { kind: 'move', moves: ['b5c7'], wrong: tk('Look for a knight jump that attacks the king and the rook together.') } },
      { say: tk('Pawns fork too. Attack both knights with one pawn move.'), fen: '4k3/8/2n1n3/8/3P4/8/8/4K3 w - - 0 1', task: { kind: 'move', moves: ['d4d5'], wrong: tk('Push the pawn so that it attacks both knights at once.') } },
      {
        say: tk('What is a fork?'),
        quiz: {
          options: [{ text: tk('One piece attacking two at once'), correct: true }, { text: tk('Two pieces attacking one') }, { text: tk('A trade of queens') }],
          why: tk('One piece, two targets. Practise them in the Forks puzzle module.'),
        },
      },
    ],
  },
  pin: {
    id: 'pin',
    title: tk('The pin'),
    steps: [
      { say: tk('A pin holds a piece in place: it cannot move without exposing a more valuable piece behind it. When the piece behind is the king, moving is not even allowed.'), fen: '4k3/8/2n5/1B6/8/8/8/6K1 b - - 0 1', arrows: [['b5', 'e8']] },
      { say: tk('Pin the knight to its king with your bishop.'), fen: '4k3/8/2n5/8/8/8/8/5BK1 w - - 0 1', task: { kind: 'move', moves: ['f1b5'], wrong: tk('Put the bishop on the line that runs through the knight to the king.') } },
      {
        say: tk('This knight is pinned to its king by your rook: it cannot move. Attack it with a pawn.'),
        fen: '4k3/8/8/4n3/8/8/3P1P2/4R1K1 w - - 0 1',
        task: { kind: 'move', moves: ['d2d4', 'f2f4'], wrong: tk('Attack the pinned knight with a pawn: it cannot run away.') },
      },
      { say: tk('Pinned pieces are easy targets. Practise pins in the Pins & Skewers puzzle module.') },
    ],
  },
  discovered: {
    id: 'discovered',
    title: tk('Discovered attack'),
    steps: [
      { say: tk('When a piece moves out of the way, the piece behind it suddenly attacks. If the moving piece attacks something too, there are two threats at once: a discovered attack.'), fen: 'q3k3/8/8/8/4B3/8/8/4R1K1 w - - 0 1' },
      {
        say: tk('Move the bishop: your rook checks the king, and the bishop attacks the queen.'),
        task: { kind: 'move', moves: ['e4d5', 'e4c6', 'e4b7', 'e4f3', 'e4g2', 'e4h1'], wrong: tk('Move the bishop along the line towards the black queen: the rook behind it gives check by itself.') },
      },
      {
        say: tk('What makes a discovered attack so strong?'),
        quiz: {
          options: [{ text: tk('Two threats at once'), correct: true }, { text: tk('It always gives checkmate') }, { text: tk('It cannot be seen') }],
          why: tk('Two threats at once: the opponent can answer only one. Here the king must escape the check, and the queen is lost.'),
        },
      },
    ],
  },
  'tactics-practice': {
    id: 'tactics-practice',
    title: tk('Practice'),
    steps: [
      { say: tk('Now find the tactics yourself. Win the queen with a knight fork.'), fen: 'q3k3/8/8/3N4/8/8/8/6K1 w - - 0 1', task: { kind: 'move', moves: ['d5c7'], wrong: tk('Find the jump that checks the king and attacks the queen together.') } },
      { say: tk('Give a discovered check: move the knight, and the rook behind it checks the king.'), fen: '4k3/8/8/8/8/8/4N3/4R1K1 w - - 0 1', task: { kind: 'check' } },
      { say: tk('Forks, pins and discovered attacks win games. The puzzle modules have hundreds of them to practise.') },
    ],
  },

  // ---------------------------------------------------------------- chapter 7: first endgames
  'king-active': {
    id: 'king-active',
    title: tk('The active king'),
    steps: [
      { say: tk('In the opening the king hides. In the endgame, with few pieces left, he becomes a fighter: bring him to the middle of the board.'), fen: '8/8/4k3/8/8/4P3/8/4K3 w - - 0 1' },
      { say: tk('Walk your king to the star in the middle.'), fen: '8/pp6/8/8/8/8/PP6/4K3 w - - 0 1', marks: ['e4'], task: { kind: 'collect' } },
      {
        say: tk('In the endgame, where does the king belong?'),
        quiz: { options: [{ text: tk('In the corner, safe') }, { text: tk('In the middle, active'), correct: true }], why: tk('In the middle: from there he reaches both sides of the board.') },
      },
    ],
  },
  'passed-pawn': {
    id: 'passed-pawn',
    title: tk('The passed pawn'),
    steps: [
      { say: tk('A passed pawn has no enemy pawn in front of it or on the files beside it: only pieces can stop it on its way to promotion. The marked pawn is passed.'), fen: '4k3/8/8/1P3pp1/8/6P1/8/4K3 w - - 0 1', marks: ['b5'] },
      {
        say: tk('Is the marked pawn passed?'),
        fen: '4k3/8/4p3/3P4/8/8/8/4K3 w - - 0 1',
        marks: ['d5'],
        quiz: { options: [{ text: tk('Yes') }, { text: tk('No'), correct: true }], why: tk('No: the black pawn on the file beside it stands in its way and can take it.') },
      },
      { say: tk('Passed pawns must be pushed! Run with this one to the end of the board.'), fen: '8/8/8/1P6/8/8/8/8 w - - 0 1', marks: ['b8'], task: { kind: 'collect' } },
    ],
  },
  opposition: {
    id: 'opposition',
    title: tk('The opposition'),
    steps: [
      {
        say: tk('When the kings stand face to face with one square between them, neither may step forward. The side that does not have to move holds the opposition: the other king must give way.'),
        fen: '8/8/4k3/8/4K3/8/8/8 w - - 0 1',
        marks: ['e5'],
      },
      {
        say: tk('White is to move. Who holds the opposition?'),
        quiz: { options: [{ text: tk('White') }, { text: tk('Black'), correct: true }], why: tk('Black: White has to move and give way.') },
      },
      {
        say: tk('Take the opposition: stand right in front of the black king, with one square between.'),
        fen: '8/8/8/4k3/8/8/3K4/8 w - - 0 1',
        task: { kind: 'move', moves: ['d2e3'], wrong: tk('Stand straight in front of the black king, with exactly one square between the two kings.') },
      },
      { say: tk('In king and pawn endgames the opposition often decides: the king that takes it gets past, and the pawn promotes.') },
    ],
  },
  'edge-pawn': {
    id: 'edge-pawn',
    title: tk('The edge pawn'),
    steps: [
      { say: tk('A pawn on the edge is the hardest to win with. Here Black is to move.'), fen: 'k7/P7/1K6/8/8/8/8/8 b - - 0 1' },
      {
        say: tk('What is the result?'),
        quiz: {
          options: [{ text: tk('White wins') }, { text: tk('Stalemate, a draw'), correct: true }, { text: tk('Black wins') }],
          why: tk('Stalemate: the black king is not in check but has no move. In the corner, the lone king often saves the draw.'),
        },
      },
      { say: tk('With an edge pawn, keep the enemy king out of the corner in front of it, or the game ends in a draw.') },
    ],
  },
};

/** Whether a position has both kings (a real game position); otherwise the board is free. */
export function hasKings(fen: string): boolean {
  const board = fen.split(' ')[0];
  return board.includes('K') && board.includes('k');
}
