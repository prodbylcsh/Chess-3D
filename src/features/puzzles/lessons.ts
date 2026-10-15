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
    intro: tk('White has pushed two pawns in front of the king and opened a diagonal straight to it. Find the fastest mate in chess.'),
    why: [
      tk('The queen checks down the open diagonal and the king has nowhere to go. Mate on move two!'),
    ],
  },
  'openings-scholar-s-mate': {
    intro: tk('The weakest point in Black\'s camp is the pawn beside the king: only the king defends it. Aim your bishop and queen at it and strike.'),
    why: [
      tk('The king\'s pawn steps forward and opens the way for the queen and a bishop.'),
      tk('The bishop aims straight at the weak pawn beside the king.'),
      tk('The queen joins in: now two pieces attack that pawn.'),
      tk('The queen takes the pawn beside the king, protected by the bishop. Mate! A careful opponent won\'t allow it, so learn the defence too.'),
    ],
  },
  'openings-stop-the-scholar-s-mate': {
    intro: tk('White\'s queen and bishop both aim at the pawn beside your king: the Scholar\'s Mate is coming. Defend calmly and gain time by chasing the queen.'),
    why: [
      tk('A pawn steps up, blocks the queen\'s path to your king and attacks her at the same time.'),
      tk('The knight comes out, blocks the queen\'s way in again and develops. Black is doing great.'),
    ],
  },
  'openings-smothered-mate-in-the-caro-kann': {
    intro: tk('In the Caro-Kann, Black has just brought out the second knight. But the king is hemmed in by its own pieces and your queen stands on its file. One knight jump decides.'),
    why: [
      tk('The knight checks. The pawn in front of the king can\'t take it because your queen pins it, and the king is smothered by its own pieces.'),
    ],
  },
  'openings-italian-game': {
    intro: tk('One of the oldest openings: a pawn to the centre, knights and bishops out quickly, and a bishop aimed at the weak pawn beside Black\'s king.'),
    why: [
      tk('The king\'s pawn takes the centre and frees the queen and a bishop.'),
      tk('The knight develops with a threat: it attacks Black\'s centre pawn.'),
      tk('The Italian bishop, eyeing the weak pawn beside Black\'s king.'),
      tk('A quiet pawn move that prepares a second pawn for the centre.'),
      tk('The queen\'s pawn strikes in the centre! White gains space and opens lines.'),
    ],
  },
  'openings-two-knights-defence': {
    intro: tk('Against the Italian, Black brings out the second knight and attacks White\'s centre pawn instead of copying White. If White\'s knight jumps forward against your weak spot, you have the answer ready.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends the pawn and develops at the same time.'),
      tk('The second knight attacks White\'s centre pawn instead of defending.'),
      tk('The queen\'s pawn blocks the bishop\'s diagonal towards your king: the key defence.'),
      tk('The knight chases the dangerous bishop away. Black gives a pawn for quick development.'),
    ],
  },
  'openings-scotch-game': {
    intro: tk('In the Scotch, White opens the centre straight away with the queen\'s pawn: open lines and free play for the pieces.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops and attacks Black\'s centre pawn.'),
      tk('The Scotch: the queen\'s pawn challenges the centre at once.'),
      tk('The knight takes back and stands proudly in the centre.'),
      tk('Trade the knights and leave Black with doubled pawns.'),
      tk('The pawn kicks Black\'s knight away and grabs space.'),
    ],
  },
  'openings-queen-s-gambit': {
    intro: tk('White offers a side pawn to lure Black\'s centre pawn away. It isn\'t a real sacrifice: the pawn can usually be won back.'),
    why: [
      tk('The queen\'s pawn takes the centre, protected by the queen.'),
      tk('The gambit: a side pawn attacks Black\'s centre pawn.'),
      tk('The knight adds pressure on the centre.'),
      tk('The bishop pins Black\'s knight, one of the centre\'s defenders.'),
      tk('A pawn step opens the way for the other bishop.'),
      tk('The knight finishes the kingside so White can castle.'),
    ],
  },
  'openings-sicilian-defence-najdorf': {
    intro: tk('The Sicilian is Black\'s sharpest answer to the king\'s pawn: fight for the centre from the side. The Najdorf is its most famous line, played by Fischer and Kasparov.'),
    why: [
      tk('A side pawn controls the centre without copying White.'),
      tk('A small pawn step guards the centre and frees a bishop.'),
      tk('Trade your side pawn for White\'s centre pawn.'),
      tk('The knight develops and attacks White\'s centre pawn.'),
      tk('The Najdorf: a rook\'s pawn step keeps White\'s pieces out and prepares your own play.'),
    ],
  },
  'openings-london-system': {
    intro: tk('A solid system you can play against almost anything: a bishop goes out early, then a sturdy pyramid of pawns.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The London bishop goes out before the pawns lock it in.'),
      tk('A pawn supports the centre and frees the other bishop.'),
      tk('The knight develops and guards the centre.'),
      tk('Another pawn keeps your centre rock solid against Black\'s attack.'),
      tk('The second knight supports the centre and keeps everything flexible.'),
    ],
  },
  'openings-french-defence': {
    intro: tk('In the French, Black first prepares a pawn duel in the centre, builds a solid wall and attacks White\'s centre later.'),
    why: [
      tk('A modest pawn step prepares the queen\'s pawn to come forward.'),
      tk('The queen\'s pawn challenges White\'s centre at once.'),
      tk('The knight adds pressure on White\'s centre pawn.'),
      tk('The bishop breaks the pin on your knight.'),
      tk('The knight steps back, ready for your pawns to hit White\'s pawn chain.'),
    ],
  },
  'openings-petrov-trap': {
    intro: tk('In the Petrov, Black copied White and took your centre pawn too early. The file in front of Black\'s king is now open: put your queen on it.'),
    why: [
      tk('The queen attacks Black\'s knight and lines up against the king.'),
      tk('The knight jumps away with a discovered check from the queen, and it attacks Black\'s queen too. She is lost.'),
    ],
  },
  'openings-caro-kann-defence': {
    intro: tk('The Caro-Kann supports the queen\'s pawn with a side pawn and, unlike the French, lets the light-squared bishop out before the pawns close it in.'),
    why: [
      tk('A side pawn prepares the queen\'s pawn to come forward.'),
      tk('The queen\'s pawn challenges the centre.'),
      tk('Take White\'s centre pawn: swap the centre for free piece play.'),
      tk('The bishop comes out with a threat to White\'s knight.'),
      tk('The bishop steps back but stays on its good diagonal.'),
    ],
  },
  'openings-ruy-lopez': {
    intro: tk('The Spanish Game: the bishop presses the knight that defends Black\'s centre pawn. A favourite of world champions for centuries.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops and attacks Black\'s centre pawn.'),
      tk('The Spanish bishop presses the knight that defends that pawn.'),
      tk('The bishop steps back but keeps the pressure instead of trading.'),
      tk('Castle: king to safety, rook towards the centre.'),
      tk('The rook guards your centre pawn and prepares a bigger centre.'),
    ],
  },
  'openings-scandinavian-defence': {
    intro: tk('Black hits White\'s centre pawn right away. The queen comes out early, so you have to park her somewhere safe and useful.'),
    why: [
      tk('The queen\'s pawn attacks White\'s centre pawn immediately.'),
      tk('The queen takes back.'),
      tk('The queen steps to a safe square on the side and pins White\'s knight.'),
      tk('The knight develops and watches the centre.'),
    ],
  },
  'openings-punish-the-damiano-defence': {
    intro: tk('Black defended the centre pawn by pushing a pawn in front of the king, a classic beginner\'s mistake that opens a diagonal to the king. Punish it at once!'),
    why: [
      tk('The knight takes the pawn anyway. If Black takes back, your queen comes in.'),
      tk('The queen checks down the weakened diagonal.'),
      tk('A fork: the queen checks the king and attacks the rook in the corner.'),
    ],
  },
  'openings-king-s-indian-defence': {
    intro: tk('Black lets White build a big centre, tucks the king behind a bishop on the long diagonal, and strikes back later. A weapon of Fischer and Kasparov.'),
    why: [
      tk('The knight develops and holds back White\'s king\'s pawn for now.'),
      tk('A pawn step makes room for the bishop.'),
      tk('The bishop on the long diagonal aims at the centre.'),
      tk('A pawn step guards the centre and prepares a later strike.'),
      tk('Castle: the king is safe, now the fight for the centre begins.'),
    ],
  },
  'openings-english-opening': {
    intro: tk('The English starts with a side pawn. Against Black\'s king\'s pawn it is a Sicilian with an extra move for White.'),
    why: [
      tk('A side pawn controls the centre from the flank.'),
      tk('The knight adds more control of the centre.'),
      tk('A pawn step makes room for the bishop on the long diagonal.'),
      tk('Trade your side pawn for Black\'s centre pawn.'),
      tk('The bishop on the long diagonal hits the centre and beyond.'),
    ],
  },
  'openings-queen-s-gambit-declined': {
    intro: tk('The most solid answer to the Queen\'s Gambit: keep your centre pawn and build a strong wall.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('Decline the gambit: another pawn supports the centre.'),
      tk('The knight develops and defends the centre.'),
      tk('The bishop breaks the pin.'),
      tk('Castle: king to safety.'),
    ],
  },
  'openings-le-gal-s-mate': {
    intro: tk('Black\'s bishop pins your knight to the queen. It looks like a pin, but it isn\'t a real one: give up the queen and mate!'),
    why: [
      tk('The knight takes a pawn anyway, ignores the pin and leaves your queen hanging.'),
      tk('The bishop takes the pawn beside the king with check: the king has to step forward.'),
      tk('The other knight jumps in: three minor pieces mate the king. That\'s Légal\'s Mate!'),
    ],
  },
  'openings-slav-defence': {
    intro: tk('Like the Caro-Kann against the king\'s pawn: support your centre pawn with a side pawn and keep your light-squared bishop free.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('A side pawn supports the centre without shutting in the bishop.'),
      tk('The knight develops.'),
      tk('Now take the offered pawn: White will need time to win it back.'),
    ],
  },
  'openings-king-s-gambit': {
    intro: tk('The romantic opening: give a pawn, open the file next to your king and attack. Here Black holds on to the pawn and White undermines it.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The gambit: offer a pawn to open lines.'),
      tk('The knight develops and stops a check from Black\'s queen.'),
      tk('A rook\'s pawn undermines Black\'s pawn chain.'),
      tk('The knight jumps to a strong centre square, eyeing the weak spots around Black\'s king.'),
    ],
  },
  'openings-nimzo-indian-defence': {
    intro: tk('Black pins White\'s knight and controls the centre with pieces instead of pawns. One of the most respected defences.'),
    why: [
      tk('The knight develops and stops White\'s king\'s pawn from advancing.'),
      tk('A pawn step opens the dark-squared bishop.'),
      tk('The bishop pins the knight: now White\'s centre is hard to build.'),
      tk('Castle: king safe, ready to strike in the centre.'),
    ],
  },
  'openings-blackburne-shilling-trap': {
    intro: tk('You played a cheeky knight jump into the centre and left your pawn hanging. White\'s knight grabbed it: now punish the greed.'),
    why: [
      tk('The queen attacks the greedy knight and the pawn in front of White\'s king at once.'),
      tk('The queen takes the pawn and now attacks the rook in the corner.'),
      tk('The queen takes the centre pawn with check, and the bishop has to block.'),
      tk('The knight mates: a smothered mate. The trap has sprung!'),
    ],
  },
  'openings-vienna-game': {
    intro: tk('In the Vienna, White brings out the queen\'s knight first and saves a pawn for an attacking push.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops and protects your centre pawn.'),
      tk('A pawn attacks Black\'s centre pawn, like a King\'s Gambit with a knight already out.'),
      tk('Take and grab space.'),
      tk('The other knight develops and supports your advanced pawn.'),
    ],
  },
  'openings-petrov-s-defence': {
    intro: tk('Black meets White\'s knight with a counter-attack on the centre pawn. Careful: only take that pawn after chasing White\'s knight away.'),
    why: [
      tk('Your king\'s pawn takes the centre.'),
      tk('The knight counter-attacks White\'s centre pawn.'),
      tk('First chase the knight away. Taking the pawn now would walk into the Petrov Trap.'),
      tk('Now the pawn is yours.'),
      tk('The queen\'s pawn supports your knight in the centre.'),
    ],
  },
  'openings-fried-liver-attack': {
    intro: tk('The Two Knights lets White\'s knight jump forward and hit the weak pawn beside Black\'s king twice. If Black takes back with the knight, the Fried Liver sacrifice drags the king into the open.'),
    why: [
      tk('The knight jumps forward: two attackers on the pawn beside the king.'),
      tk('Take the pawn and open lines.'),
      tk('Sacrifice the knight to pull the king out!'),
      tk('The queen checks, and Black\'s knight in the centre is attacked twice.'),
      tk('Bring another attacker. The king in the centre is in real trouble.'),
    ],
  },
  'openings-danish-gambit': {
    intro: tk('Give two pawns, get two bishops raking the board towards Black\'s king. Pure attacking chess.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The queen\'s pawn opens the centre at once.'),
      tk('The gambit: offer another pawn.'),
      tk('The bishop develops and aims at Black\'s king instead of saving pawns.'),
      tk('The other bishop takes back: two bishops aimed at the king, worth both pawns.'),
    ],
  },
  'openings-dutch-defence': {
    intro: tk('Black answers the queen\'s pawn with a kingside pawn, grabbing a key square in the centre and preparing a kingside attack.'),
    why: [
      tk('A kingside pawn controls the centre from the side.'),
      tk('The knight develops and watches the centre.'),
      tk('A pawn step frees the bishop and supports the centre.'),
      tk('The bishop develops, ready for castling.'),
      tk('Castle: king safe, and the rook backs up the advanced pawn.'),
    ],
  },
  'openings-kieninger-trap': {
    intro: tk('In the Budapest Gambit your queen stands on the same file as White\'s king. White just attacked your bishop with a pawn: ignore it!'),
    why: [
      tk('The knight wins the pawn back and sets the trap.'),
      tk('The knight checks. The pawn in front of the king is pinned by your queen and can\'t take. Smothered mate!'),
    ],
  },
  'openings-berlin-defence': {
    intro: tk('The Berlin Wall: Black gives up castling for a rock-solid endgame. Kramnik used it to take the world title from Kasparov.'),
    why: [
      tk('Your king\'s pawn takes the centre.'),
      tk('The knight defends your centre pawn.'),
      tk('The Berlin: the second knight counter-attacks White\'s centre pawn.'),
      tk('Take the pawn while White castles.'),
      tk('The knight attacks the bishop and gets out of the rook\'s way.'),
      tk('Take back towards the centre and free your bishop.'),
      tk('The knight finds a fine square. The queens will soon come off.'),
    ],
  },
  'openings-evans-gambit': {
    intro: tk('An Italian with a twist: give a side pawn to gain time for a big centre and an attack.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops and attacks Black\'s centre pawn.'),
      tk('The bishop aims at the weak pawn beside Black\'s king.'),
      tk('The Evans Gambit: a side pawn lures Black\'s bishop away.'),
      tk('Chase the bishop again and prepare the centre.'),
      tk('The queen\'s pawn builds a big centre and opens lines for the attack.'),
    ],
  },
  'openings-budapest-gambit': {
    intro: tk('A surprise gambit against the queen\'s pawn: give a centre pawn and win it back with active pieces.'),
    why: [
      tk('The knight develops.'),
      tk('The Budapest: your king\'s pawn strikes in the centre at once.'),
      tk('The knight attacks White\'s advanced pawn.'),
      tk('The other knight attacks it a second time.'),
      tk('The bishop develops with check.'),
    ],
  },
  'openings-englund-gambit-trap': {
    intro: tk('In the Englund Gambit your queen came out early. White\'s bishop has just left home, so a pawn and the back rank are weak.'),
    why: [
      tk('The queen checks and attacks the bishop and a pawn at once.'),
      tk('Grab the pawn. Now the rook in the corner is attacked.'),
      tk('Your bishop pins White\'s bishop to the king!'),
      tk('Take the defender.'),
      tk('The queen lands on the empty back rank. Mate!'),
    ],
  },
  'openings-elephant-trap': {
    intro: tk('White thinks your knight is pinned and grabs a centre pawn. But the pin is fake: give up your queen and win a piece.'),
    why: [
      tk('The knight takes back and lets White take your queen!'),
      tk('Check first: the bishop will win White\'s queen back.'),
      tk('The bishop takes the queen.'),
      tk('The king takes the bishop back. Black is a whole knight up.'),
    ],
  },
  'openings-benko-gambit': {
    intro: tk('Give a queenside pawn for open files and lasting pressure. Loved by fighting players.'),
    why: [
      tk('The knight develops.'),
      tk('A side pawn hits White\'s centre, and White pushes past.'),
      tk('The Benko: offer a pawn.'),
      tk('Offer another one to open the files.'),
      tk('The bishop takes back, very active. The open files on the queenside are yours.'),
    ],
  },
  'openings-stafford-gambit-trap': {
    intro: tk('The Stafford Gambit is full of tricks. White\'s last move left the square next to the king weak.'),
    why: [
      tk('The bishop aims at the weak spot next to White\'s king.'),
      tk('The knight takes a pawn and lets White take your queen!'),
      tk('The bishop checks: the king must step forward.'),
      tk('The other bishop mates: two bishops and a knight!'),
    ],
  },
  'openings-siberian-trap': {
    intro: tk('In the Smith-Morra Gambit your knight and queen both aim at the square in front of White\'s king. White just told the knight to leave...'),
    why: [
      tk('The other knight attacks the queen. If White\'s knight takes it, nothing guards the king any more.'),
      tk('The queen mates, protected by your knight!'),
    ],
  },
  'openings-noah-s-ark-trap': {
    intro: tk('In the Ruy Lopez, White\'s bishop has few squares left. Chase White\'s queen with threats and then shut the bishop in with pawns.'),
    why: [
      tk('A pawn kicks the queen.'),
      tk('The bishop attacks the queen again.'),
      tk('The bishop blocks the check.'),
      tk('A pawn step traps White\'s bishop. Noah\'s Ark!'),
    ],
  },
  'openings-lasker-trap': {
    intro: tk('In the Albin Counter-Gambit your pawn sits deep in White\'s camp. White\'s careless pawn move lets it march all the way, with a rare twist at the end.'),
    why: [
      tk('The bishop checks and pulls White\'s bishop forward.'),
      tk('The pawn takes and attacks both the bishop and the pawn beside the king.'),
      tk('The pawn takes with check: the king has to move.'),
      tk('Promote to a knight, with check! A queen would simply be taken. Black wins.'),
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
  { theme: 'attackingF2F7', title: tk('The weak spot beside the king'), tip: tk('The pawn next to the king is defended only by the king.') },
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
