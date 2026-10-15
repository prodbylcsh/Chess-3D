// What each puzzle is about, for the player (docs/PLATFORM.md §4.2): the hand-made opening
// lines explain themselves move by move (LESSONS, keyed by puzzle id), and Lichess puzzles
// are described by their themes (MOTIFS, most telling first). English here, Czech in cs.ts.
// the translator's marker, as in src/i18n (kept local so the tests can load this file in Node)
const tk = (text: string) => text;

export interface Lesson {
  /** what the line is about, shown before the player starts */
  intro: string;
  /** why each of the player's moves, shown after it is played */
  why: string[];
}

export const LESSONS: Record<string, Lesson> = {
  'openings-fool-s-mate': {
    intro: tk('White has weakened the king with f3 and g4. The diagonal from d8 to h4 is wide open: find the fastest mate in chess.'),
    why: [
      tk('Qh4#: the queen checks down the open diagonal and the king has nowhere to go. Mate on move two!'),
    ],
  },
  'openings-scholar-s-mate': {
    intro: tk('The weakest square in Black\'s camp is f7: only the king defends it. Aim your bishop and queen at it and strike.'),
    why: [
      tk('e4 opens the way for the queen and the light-squared bishop.'),
      tk('Bc4 points the bishop straight at f7.'),
      tk('Qh5 joins in: now two pieces hit f7 (and the e5 pawn).'),
      tk('Qxf7#: the bishop protects the queen, so nobody can take her. Mate! A careful opponent won\'t allow it, so learn the defence too.'),
    ],
  },
  'openings-stop-the-scholar-s-mate': {
    intro: tk('White\'s queen and bishop both aim at f7: the Scholar\'s Mate is coming. Defend calmly and gain time by chasing the queen.'),
    why: [
      tk('g6 shuts the queen out of f7 and attacks her at the same time.'),
      tk('Nf6 blocks the f-file against Qxf7 and develops a piece. Black is doing great.'),
    ],
  },
  'openings-smothered-mate-in-the-caro-kann': {
    intro: tk('In the Caro-Kann, Black has just played the g8 knight to f6. But the d7 knight and the e7 pawn hem the king in, and your queen stands on the e-file. One knight jump decides.'),
    why: [
      tk('Nd6#: the e7 pawn can\'t take because your queen pins it, and the king is smothered by its own pieces.'),
    ],
  },
  'openings-italian-game': {
    intro: tk('One of the oldest openings: pawns to the centre, knights and bishops out quickly, and the bishop aimed at f7.'),
    why: [
      tk('e4: take the centre and free the queen and bishop.'),
      tk('Nf3: develop with a threat: the knight attacks the e5 pawn.'),
      tk('Bc4: the Italian bishop, eyeing the weak f7 square.'),
      tk('c3: prepares d4 to build a big pawn centre.'),
      tk('d4: strike in the centre! White gains space and opens lines.'),
    ],
  },
  'openings-two-knights-defence': {
    intro: tk('Against the Italian, Black brings out the second knight and attacks e4 instead of copying White. If White jumps to g5 against f7, you have the answer ready.'),
    why: [
      tk('e5: claim your share of the centre.'),
      tk('Nc6: defend e5 and develop at the same time.'),
      tk('Nf6: the Two Knights: attack e4 instead of defending.'),
      tk('d5: block the bishop\'s road to f7, the key defence against Ng5.'),
      tk('Na5: chase the dangerous bishop away. Black gives a pawn for quick development.'),
    ],
  },
  'openings-scotch-game': {
    intro: tk('In the Scotch, White opens the centre straight away with d4: open lines and free play for the pieces.'),
    why: [
      tk('e4: take the centre.'),
      tk('Nf3: develop and attack e5.'),
      tk('d4: the Scotch: challenge e5 at once.'),
      tk('Nxd4: take back with a knight in the centre.'),
      tk('Nxc6: trade knights and leave Black with doubled pawns.'),
      tk('e5: kick the f6 knight and grab space: the Mieses variation.'),
    ],
  },
  'openings-queen-s-gambit': {
    intro: tk('White offers the c-pawn to lure Black\'s d-pawn away from the centre. It isn\'t a real sacrifice: the pawn can usually be won back.'),
    why: [
      tk('d4: the queen\'s pawn takes the centre, protected by the queen.'),
      tk('c4: the gambit: attack d5 from the side.'),
      tk('Nc3: more pressure on d5.'),
      tk('Bg5: pin the f6 knight, a defender of d5.'),
      tk('e3: open the way for the light-squared bishop.'),
      tk('Nf3: finish the kingside and get ready to castle.'),
    ],
  },
  'openings-sicilian-defence-najdorf': {
    intro: tk('The Sicilian is Black\'s sharpest answer to 1.e4: fight for the centre from the side with ...c5. The Najdorf is its most famous line, played by Fischer and Kasparov.'),
    why: [
      tk('c5: control d4 without copying White.'),
      tk('d6: keep an eye on e5 and free the c8 bishop.'),
      tk('cxd4: trade a side pawn for White\'s centre pawn.'),
      tk('Nf6: develop and attack e4.'),
      tk('a6: the Najdorf: keep White\'s pieces off b5 and prepare ...e5 or ...b5.'),
    ],
  },
  'openings-london-system': {
    intro: tk('A solid system you can play against almost anything: the bishop goes out to f4 first, then a sturdy pyramid of pawns.'),
    why: [
      tk('d4: take the centre.'),
      tk('Bf4: the London bishop, out before e3 locks it in.'),
      tk('e3: support d4 and free the other bishop.'),
      tk('Nf3: develop and guard e5.'),
      tk('c3: meet ...c5 by keeping d4 rock solid.'),
      tk('Nbd2: the knight supports e4 and keeps everything flexible.'),
    ],
  },
  'openings-french-defence': {
    intro: tk('In the French, Black prepares ...d5 with ...e6, builds a solid wall and attacks White\'s centre later.'),
    why: [
      tk('e6: prepare ...d5 with a pawn behind it.'),
      tk('d5: challenge e4 at once.'),
      tk('Nf6: more pressure on e4.'),
      tk('Be7: break the pin on the f6 knight.'),
      tk('Nfd7: the knight steps back, ready to hit White\'s pawn chain with ...c5 and ...f6.'),
    ],
  },
  'openings-petrov-trap': {
    intro: tk('In the Petrov, Black copied White and took on e4 too early. The e-file now leads straight to Black\'s king: put your queen on it.'),
    why: [
      tk('Qe2: attack the e4 knight and line up against the king.'),
      tk('Nc6+: a discovered check from the queen, and the knight attacks Black\'s queen on d8. She is lost.'),
    ],
  },
  'openings-caro-kann-defence': {
    intro: tk('The Caro-Kann prepares ...d5 with ...c6 and, unlike the French, lets the light-squared bishop out before the pawns close it in.'),
    why: [
      tk('c6: prepare ...d5.'),
      tk('d5: challenge the centre.'),
      tk('dxe4: take on e4, swapping the centre for free piece play.'),
      tk('Bf5: bring out the bishop with a threat to the e4 knight.'),
      tk('Bg6: keep the bishop on its good diagonal.'),
    ],
  },
  'openings-ruy-lopez': {
    intro: tk('The Spanish Game: the bishop presses the c6 knight, the defender of e5. A favourite of world champions for centuries.'),
    why: [
      tk('e4: take the centre.'),
      tk('Nf3: develop and attack e5.'),
      tk('Bb5: the Spanish bishop puts pressure on the defender of e5.'),
      tk('Ba4: keep the pressure instead of trading.'),
      tk('O-O: king to safety, rook towards the centre.'),
      tk('Re1: guard e4 and prepare c3 and d4.'),
    ],
  },
  'openings-scandinavian-defence': {
    intro: tk('Black hits e4 right away with ...d5. The queen comes out early, so you must park her somewhere safe and useful.'),
    why: [
      tk('d5: attack e4 immediately.'),
      tk('Qxd5: take back with the queen.'),
      tk('Qa5: the queen steps to a safe square and pins the c3 knight.'),
      tk('Nf6: develop and watch e4.'),
    ],
  },
  'openings-punish-the-damiano-defence': {
    intro: tk('Black defended e5 with ...f6, a classic beginner\'s mistake that weakens the diagonal to the king. Punish it at once!'),
    why: [
      tk('Nxe5: take the pawn anyway. If ...fxe5, your queen comes in.'),
      tk('Qh5+: check down the weakened diagonal.'),
      tk('Qxe5+: a fork, check to the king and an attack on the h8 rook.'),
    ],
  },
  'openings-king-s-indian-defence': {
    intro: tk('Black lets White build a big centre, tucks the king behind a bishop on g7, and strikes back later. A weapon of Fischer and Kasparov.'),
    why: [
      tk('Nf6: develop and stop e4 for now.'),
      tk('g6: prepare the fianchetto.'),
      tk('Bg7: on the long diagonal the bishop aims at the centre.'),
      tk('d6: control e5 and prepare ...e5 later.'),
      tk('O-O: the king is safe, now the fight for the centre begins.'),
    ],
  },
  'openings-english-opening': {
    intro: tk('The English starts on the wing with 1.c4. Against ...e5 it is a Sicilian with an extra move for White.'),
    why: [
      tk('c4: control d5 from the side.'),
      tk('Nc3: more control of d5.'),
      tk('g3: make room for the bishop on the long diagonal.'),
      tk('cxd5: trade a side pawn for Black\'s centre pawn.'),
      tk('Bg2: the bishop hits d5 and the whole long diagonal.'),
    ],
  },
  'openings-queen-s-gambit-declined': {
    intro: tk('The most solid answer to the Queen\'s Gambit: keep the d5 pawn and build a strong centre.'),
    why: [
      tk('d5: take the centre.'),
      tk('e6: decline the gambit and support d5.'),
      tk('Nf6: develop and defend d5.'),
      tk('Be7: break the pin.'),
      tk('O-O: king to safety.'),
    ],
  },
  'openings-le-gal-s-mate': {
    intro: tk('Black\'s bishop pins your knight to the queen. It looks like a pin, but it isn\'t a real one: give up the queen and mate!'),
    why: [
      tk('Nxe5!: ignore the pin and leave your queen hanging.'),
      tk('Bxf7+: the king has to step forward.'),
      tk('Nd5#: three minor pieces mate the king. That\'s Légal\'s Mate!'),
    ],
  },
  'openings-slav-defence': {
    intro: tk('Like the Caro-Kann against 1.e4: support d5 with ...c6 and keep the c8 bishop free.'),
    why: [
      tk('d5: take the centre.'),
      tk('c6: support d5 without shutting in the bishop.'),
      tk('Nf6: develop.'),
      tk('dxc4: now take the pawn: White will need time to win it back.'),
    ],
  },
  'openings-king-s-gambit': {
    intro: tk('The romantic opening: give a pawn, open the f-file and attack. Here Black holds the pawn with ...g5 and White undermines it with h4.'),
    why: [
      tk('e4: take the centre.'),
      tk('f4: the gambit: offer a pawn to open lines.'),
      tk('Nf3: develop and stop ...Qh4+.'),
      tk('h4: undermine the g5 pawn.'),
      tk('Ne5: the Kieseritzky: a strong centre knight eyeing f7 and g4.'),
    ],
  },
  'openings-nimzo-indian-defence': {
    intro: tk('Black pins the c3 knight and controls e4 with pieces instead of pawns. One of the most respected defences.'),
    why: [
      tk('Nf6: develop and stop e4.'),
      tk('e6: open the dark-squared bishop.'),
      tk('Bb4: pin the knight: now e4 is hard to play.'),
      tk('O-O: king safe, ready for ...d5 or ...c5.'),
    ],
  },
  'openings-blackburne-shilling-trap': {
    intro: tk('You played the cheeky ...Nd4 and left e5 hanging. White grabbed the pawn: now punish the greed.'),
    why: [
      tk('Qg5: attack the e5 knight and the g2 pawn at once.'),
      tk('Qxg2: now the h1 rook is attacked.'),
      tk('Qxe4+: check, and the bishop has to block.'),
      tk('Nf3#: a smothered mate. The trap has sprung!'),
    ],
  },
  'openings-vienna-game': {
    intro: tk('In the Vienna, White brings out the queen\'s knight first and saves the f-pawn for an attacking f4.'),
    why: [
      tk('e4: take the centre.'),
      tk('Nc3: develop and protect e4.'),
      tk('f4: hit e5 like a King\'s Gambit, with a knight already out.'),
      tk('fxe5: take and gain space.'),
      tk('Nf3: develop and support e5.'),
    ],
  },
  'openings-petrov-s-defence': {
    intro: tk('Black meets Nf3 with a counter-attack on e4. Careful: only take e4 after kicking the knight away from e5.'),
    why: [
      tk('e5: take the centre.'),
      tk('Nf6: counter-attack e4.'),
      tk('d6: kick the knight first. Taking on e4 now would walk into the Petrov Trap.'),
      tk('Nxe4: now the pawn is yours.'),
      tk('d5: support the knight on e4.'),
    ],
  },
  'openings-fried-liver-attack': {
    intro: tk('The Two Knights allows Ng5, hitting f7 twice. If Black takes back on d5 with the knight, the Fried Liver sacrifice drags the king into the open.'),
    why: [
      tk('Ng5: two attackers on f7.'),
      tk('exd5: win a pawn and open lines.'),
      tk('Nxf7!: sacrifice the knight to pull the king out.'),
      tk('Qf3+: check, and the d5 knight is attacked twice.'),
      tk('Nc3: bring another attacker. The king in the centre is in real trouble.'),
    ],
  },
  'openings-danish-gambit': {
    intro: tk('Give two pawns, get two bishops raking the board towards Black\'s king. Pure attacking chess.'),
    why: [
      tk('e4: take the centre.'),
      tk('d4: open the centre at once.'),
      tk('c3: the gambit: offer another pawn.'),
      tk('Bc4: develop and aim at f7 instead of saving pawns.'),
      tk('Bxb2: two bishops aimed at the king, worth both pawns.'),
    ],
  },
  'openings-dutch-defence': {
    intro: tk('Black answers 1.d4 with ...f5, grabbing the e4 square and preparing a kingside attack.'),
    why: [
      tk('f5: control e4 from the side.'),
      tk('Nf6: develop and watch e4.'),
      tk('e6: free the bishop and support the centre.'),
      tk('Be7: develop and get ready to castle.'),
      tk('O-O: king safe, and the rook backs up the f-pawn.'),
    ],
  },
  'openings-kieninger-trap': {
    intro: tk('In the Budapest Gambit your queen stands on the e-file facing White\'s king. White just attacked your bishop with a3: ignore it!'),
    why: [
      tk('Ngxe5: win the pawn back and set the trap.'),
      tk('Nd3#: the e2 pawn is pinned by your queen and can\'t take. Smothered mate!'),
    ],
  },
  'openings-berlin-defence': {
    intro: tk('The Berlin Wall: Black gives up castling for a rock-solid endgame. Kramnik used it to take the world title from Kasparov.'),
    why: [
      tk('e5: take the centre.'),
      tk('Nc6: defend e5.'),
      tk('Nf6: the Berlin: counter-attack e4.'),
      tk('Nxe4: take the pawn while White castles.'),
      tk('Nd6: attack the bishop and get out of the way of Re1.'),
      tk('dxc6: take back towards the centre and free your bishop.'),
      tk('Nf5: the knight finds a fine square. The queens will soon come off.'),
    ],
  },
  'openings-evans-gambit': {
    intro: tk('An Italian with a twist: give the b-pawn to gain time for c3, d4 and a big attack.'),
    why: [
      tk('e4: take the centre.'),
      tk('Nf3: develop and attack e5.'),
      tk('Bc4: aim at f7.'),
      tk('b4: the Evans Gambit: lure the c5 bishop away.'),
      tk('c3: chase the bishop again and prepare d4.'),
      tk('d4: a big centre and open lines for the attack.'),
    ],
  },
  'openings-budapest-gambit': {
    intro: tk('A surprise gambit against 1.d4: give the e-pawn and win it back with active pieces.'),
    why: [
      tk('Nf6: develop.'),
      tk('e5: the Budapest: strike in the centre at once.'),
      tk('Ng4: attack the e5 pawn.'),
      tk('Nc6: attack it a second time.'),
      tk('Bb4+: develop with check.'),
    ],
  },
  'openings-englund-gambit-trap': {
    intro: tk('In the Englund Gambit your queen waits on e7. White\'s bishop has just left c1, so the b2 pawn and the back rank are weak.'),
    why: [
      tk('Qb4+: check, hitting the f4 bishop and the b2 pawn.'),
      tk('Qxb2: grab the pawn. Now the a1 rook is attacked.'),
      tk('Bb4!: pin the c3 bishop to the king.'),
      tk('Bxc3: remove the defender.'),
      tk('Qc1#: the back rank is empty. Mate!'),
    ],
  },
  'openings-elephant-trap': {
    intro: tk('White thinks the f6 knight is pinned and grabs d5. But the pin is fake: give up your queen and win a piece.'),
    why: [
      tk('Nxd5!: let White take your queen.'),
      tk('Bb4+: check first. The bishop will win White\'s queen back.'),
      tk('Bxd2+: take the queen.'),
      tk('Kxd8: take the bishop back. Black is a whole knight up.'),
    ],
  },
  'openings-benko-gambit': {
    intro: tk('Give a queenside pawn for the open a- and b-files and lasting pressure. Loved by fighting players.'),
    why: [
      tk('Nf6: develop.'),
      tk('c5: hit d4. White pushes past with d5.'),
      tk('b5: the Benko: offer the pawn.'),
      tk('a6: offer another one to open the files.'),
      tk('Bxa6: the bishop takes back, very active. The a- and b-files are yours.'),
    ],
  },
  'openings-stafford-gambit-trap': {
    intro: tk('The Stafford Gambit is full of tricks. White\'s last move left the f2 square near the king weak.'),
    why: [
      tk('Bc5: aim at f2, the weak spot next to the king.'),
      tk('Nxe4!: let White take your queen.'),
      tk('Bxf2+: the king must step up to e2.'),
      tk('Bg4#: mate with two bishops and a knight!'),
    ],
  },
  'openings-siberian-trap': {
    intro: tk('In the Smith-Morra Gambit your knight on g4 and queen on c7 both aim at h2. White just told the knight to leave with h3...'),
    why: [
      tk('Nd4!: attack the queen. If the f3 knight takes, it no longer guards h2.'),
      tk('Qh2#: the g4 knight protects the queen. Mate!'),
    ],
  },
  'openings-noah-s-ark-trap': {
    intro: tk('In the Ruy Lopez, White\'s bishop on b3 has few squares. Chase White\'s queen with threats and then shut the bishop in with pawns.'),
    why: [
      tk('c5: kick the queen.'),
      tk('Be6: attack the queen again.'),
      tk('Bd7: block the check.'),
      tk('c4: the b3 bishop is trapped. Noah\'s Ark!'),
    ],
  },
  'openings-lasker-trap': {
    intro: tk('In the Albin Counter-Gambit your d4 pawn sits deep in White\'s camp. White\'s careless e3 lets it march all the way, with a rare twist at the end.'),
    why: [
      tk('Bb4+: check, pulling the bishop to d2.'),
      tk('dxe3!: the pawn attacks f2 and the bishop on d2.'),
      tk('exf2+: check, the king has to move.'),
      tk('fxg1=N+!: promote to a knight with check. A queen would simply be taken. Black wins.'),
    ],
  },
};

export interface Motif {
  theme: string;
  title: string;
  tip: string;
}

export const MOTIFS: Motif[] = [
  { theme: 'smotheredMate', title: tk('Smothered mate'), tip: tk('A knight mates a king hemmed in by its own pieces.') },
  { theme: 'backRankMate', title: tk('Back-rank mate'), tip: tk('The king is stuck behind its own pawns.') },
  { theme: 'anastasiaMate', title: tk('Anastasia\'s mate'), tip: tk('A knight and a heavy piece trap the king on the edge.') },
  { theme: 'arabianMate', title: tk('Arabian mate'), tip: tk('A rook and a knight mate the king in the corner.') },
  { theme: 'bodenMate', title: tk('Boden\'s mate'), tip: tk('Two bishops on crossing diagonals mate the king.') },
  { theme: 'doubleBishopMate', title: tk('Two-bishop mate'), tip: tk('Two bishops side by side sweep the king\'s escape squares.') },
  { theme: 'dovetailMate', title: tk('Dovetail mate'), tip: tk('The queen mates a king whose escape squares are blocked by its own pieces.') },
  { theme: 'hookMate', title: tk('Hook mate'), tip: tk('A rook, a knight and a pawn team up for mate.') },
  { theme: 'pillsburysMate', title: tk('Pillsbury\'s mate'), tip: tk('A rook and a bishop mate the castled king.') },
  { theme: 'operaMate', title: tk('Opera mate'), tip: tk('A rook mates on the back rank, guarded by a bishop.') },
  { theme: 'discoveredCheck', title: tk('Discovered check'), tip: tk('Move a piece away to give check with the one behind it.') },
  { theme: 'fork', title: tk('Fork'), tip: tk('One piece attacks two targets at once.') },
  { theme: 'pin', title: tk('Pin'), tip: tk('A piece can\'t move without exposing something more valuable behind it.') },
  { theme: 'skewer', title: tk('Skewer'), tip: tk('Attack a valuable piece: when it moves, take what stands behind it.') },
  { theme: 'discoveredAttack', title: tk('Discovered attack'), tip: tk('Move one piece out of the way to unleash another.') },
  { theme: 'doubleCheck', title: tk('Double check'), tip: tk('Check with two pieces at once: the king has to move.') },
  { theme: 'deflection', title: tk('Deflection'), tip: tk('Lure a defender away from its job.') },
  { theme: 'attraction', title: tk('Attraction'), tip: tk('Lure the king or a piece onto a fatal square.') },
  { theme: 'capturingDefender', title: tk('Remove the defender'), tip: tk('Take the piece that guards your target.') },
  { theme: 'clearance', title: tk('Clearance'), tip: tk('Clear a square or a line for another piece.') },
  { theme: 'interference', title: tk('Interference'), tip: tk('Put a piece between two enemy pieces to cut them off.') },
  { theme: 'intermezzo', title: tk('In-between move'), tip: tk('Before the expected move, play a stronger one.') },
  { theme: 'xRayAttack', title: tk('X-ray'), tip: tk('A piece attacks or defends through another piece.') },
  { theme: 'trappedPiece', title: tk('Trapped piece'), tip: tk('An enemy piece has no safe square: go after it.') },
  { theme: 'hangingPiece', title: tk('Hanging piece'), tip: tk('Something is left undefended: take it.') },
  { theme: 'sacrifice', title: tk('Sacrifice'), tip: tk('Give up material to get something bigger.') },
  { theme: 'quietMove', title: tk('Quiet move'), tip: tk('No check, no capture: a calm move with an unstoppable threat.') },
  { theme: 'defensiveMove', title: tk('Defence'), tip: tk('Stop your opponent\'s threat first.') },
  { theme: 'zugzwang', title: tk('Zugzwang'), tip: tk('Leave your opponent with only bad moves.') },
  { theme: 'underPromotion', title: tk('Underpromotion'), tip: tk('Sometimes a knight is better than a queen.') },
  { theme: 'promotion', title: tk('Promotion'), tip: tk('Get a pawn to the last rank.') },
  { theme: 'enPassant', title: tk('En passant'), tip: tk('A pawn that just jumped two squares can be taken in passing.') },
  { theme: 'castling', title: tk('Castling'), tip: tk('Sometimes the best move is to castle.') },
  { theme: 'attackingF2F7', title: tk('Attack on f2/f7'), tip: tk('The square next to the king is the weak spot.') },
  { theme: 'exposedKing', title: tk('Exposed king'), tip: tk('The king has lost its shelter: go for it.') },
  { theme: 'kingsideAttack', title: tk('Kingside attack'), tip: tk('Throw your pieces at the castled king.') },
  { theme: 'queensideAttack', title: tk('Queenside attack'), tip: tk('The action is on the queenside.') },
  { theme: 'advancedPawn', title: tk('Advanced pawn'), tip: tk('A pawn deep in enemy territory is a big asset.') },
  { theme: 'rookEndgame', title: tk('Rook endgame'), tip: tk('Active rooks win rook endgames.') },
  { theme: 'pawnEndgame', title: tk('Pawn endgame'), tip: tk('Count the moves: every tempo matters.') },
  { theme: 'queenEndgame', title: tk('Queen endgame'), tip: tk('Look for checks and forks.') },
  { theme: 'bishopEndgame', title: tk('Bishop endgame'), tip: tk('Bishops love open diagonals.') },
  { theme: 'knightEndgame', title: tk('Knight endgame'), tip: tk('Knights need squares close to the action.') },
  { theme: 'queenRookEndgame', title: tk('Queen and rook endgame'), tip: tk('Team up your heavy pieces against the king.') },
];
