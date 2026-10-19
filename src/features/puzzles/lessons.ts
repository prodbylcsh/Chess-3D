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
  'openings-fool-s-mate-for-white': {
    intro: tk('Black has pushed two pawns away from the king and opened the diagonal beside it. The same mistake that loses White the Fool\'s Mate loses Black the game here.'),
    why: [
      tk('The queen checks down the open diagonal and nothing can block or capture her. Mate on move three!'),
    ],
  },
  'openings-punish-the-wayward-queen': {
    intro: tk('White brings the queen out on move two and aims at the pawn beside your king. Defend calmly, chase the queen with your developing moves, and punish her when she wanders too far.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends your centre pawn, which the queen attacks.'),
      tk('A pawn steps up and drives the queen away from your king.'),
      tk('The knight blocks the queen\'s path to your king and develops. The mate threat is gone for good.'),
      tk('White wasted time with a pawn on the wing. The knight jumps into the centre, hits the queen and eyes a fork on the king and rook. Black takes over.'),
    ],
  },
  'openings-italian-game-as-black': {
    intro: tk('The Italian Game from Black\'s side. White wants a big pawn centre and an attack on the pawn beside your king. Develop quickly, then answer the central pawn break with a check.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends your centre pawn and develops at the same time.'),
      tk('Your bishop copies White\'s and aims at White\'s own weak pawn beside the king.'),
      tk('The knight attacks White\'s centre pawn and gets ready to castle.'),
      tk('Take the pawn that strikes at your centre.'),
      tk('A check! The bishop gets out of the pawns\' reach with tempo, and White has to spend a move on it.'),
    ],
  },
  'openings-four-knights-game': {
    intro: tk('The most natural opening of all: both sides bring out both knights. Then the bishop pins Black\'s knight and White castles. Simple, solid moves that every player should know.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops towards the centre and attacks Black\'s centre pawn.'),
      tk('The second knight develops and adds pressure on the centre.'),
      tk('The bishop pins the knight that defends Black\'s centre pawn.'),
      tk('Castling: the king is safe and the rook joins the game.'),
      tk('A modest pawn move: it defends your centre pawn and frees the other bishop.'),
    ],
  },
  'openings-scotch-game-as-black': {
    intro: tk('In the Scotch, White opens the centre right away and puts a knight in the middle of the board. Hit that knight with your bishop and queen and develop around it.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends your centre pawn and develops at the same time.'),
      tk('Take the pawn: the centre opens.'),
      tk('The bishop attacks the centralised knight at once.'),
      tk('The queen adds pressure on the knight and eyes White\'s kingside.'),
      tk('The second knight develops behind the queen, ready to castle. Black\'s pieces are all active.'),
    ],
  },
  'openings-answer-the-london-system': {
    intro: tk('The London System is a fixed setup: bishop out early, then a solid pawn triangle. Its weak spot is the queenside pawn the bishop left behind. Hit it with a pawn, a knight and the queen.'),
    why: [
      tk('Your queen\'s pawn claims its share of the centre.'),
      tk('A side pawn challenges White\'s centre.'),
      tk('The knight develops and adds pressure on the centre.'),
      tk('The queen attacks the pawn the bishop left without defence.'),
      tk('Instead of trading queens, the pawn steps forward with tempo and grabs space on the queenside.'),
    ],
  },
  'openings-closed-ruy-lopez': {
    intro: tk('The Ruy Lopez is White\'s most respected weapon against your king\'s pawn: the bishop pressures the knight that defends your centre. Learn the main line that grandmasters have played for a century.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends your centre pawn and develops at the same time.'),
      tk('Ask the bishop right away: stay or go?'),
      tk('The knight attacks White\'s centre pawn.'),
      tk('The bishop develops and prepares to castle.'),
      tk('Now the threat to win your centre pawn is real, so the pawn chases the bishop away for good.'),
      tk('The pawn defends your centre and opens the other bishop\'s diagonal.'),
      tk('You castle: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-open-sicilian': {
    intro: tk('Against the Sicilian, White opens the centre and puts a knight in the middle. Here Black answers by hitting that knight with a pawn: jump forward, not back.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops and prepares the pawn break in the centre.'),
      tk('The queen\'s pawn opens the centre.'),
      tk('The knight takes back and stands proudly in the centre.'),
      tk('The second knight defends your centre pawn.'),
      tk('The knight jumps forward, not back, and eyes the hole in Black\'s camp that the pawn move left.'),
    ],
  },
  'openings-french-advance-variation': {
    intro: tk('In the French, Black lets you have the centre and attacks it from the side. Push your pawn forward to grab space, then hold the pawn chain together.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The queen\'s pawn takes the centre.'),
      tk('The pawn advances and cramps Black\'s kingside.'),
      tk('A pawn defends the base of the chain.'),
      tk('The knight defends the chain once more.'),
      tk('A quiet pawn move prepares to grab space on the queenside with the next pawn.'),
    ],
  },
  'openings-french-advance-as-black': {
    intro: tk('White has pushed the pawn forward and grabbed space. The French answer: attack the base of White\'s pawn chain with a pawn, a knight and the queen.'),
    why: [
      tk('A modest pawn move that prepares to fight for the centre.'),
      tk('Now the pawn challenges White\'s centre.'),
      tk('White\'s pawn chain is strong, so attack its base from the side.'),
      tk('The knight adds pressure on the base.'),
      tk('The queen joins the attack on the centre and also eyes the pawn the bishop left behind.'),
    ],
  },
  'openings-caro-kann-advance-variation': {
    intro: tk('Against the Caro-Kann, White pushes forward and takes space. Black\'s bishop gets out first, so develop calmly and keep the pawn chain under control.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The queen\'s pawn takes the centre.'),
      tk('The pawn advances and takes space.'),
      tk('The knight develops and defends the advanced pawn.'),
      tk('The bishop develops quietly and prepares to castle.'),
      tk('Black hits your centre, so the bishop develops and adds a defender.'),
    ],
  },
  'openings-caro-kann-advance-as-black': {
    intro: tk('The Caro-Kann prepares the centre pawn with a small pawn move first. When White pushes forward, get the light bishop out before you close it in, then hit White\'s pawn chain.'),
    why: [
      tk('A small pawn move that prepares the centre pawn.'),
      tk('Now the pawn challenges White\'s centre.'),
      tk('The bishop gets out before your own pawns close it in.'),
      tk('The pawn supports your centre and opens the way for the other bishop.'),
      tk('The pawn hits the base of White\'s chain. This pawn break is Black\'s whole plan.'),
    ],
  },
  'openings-scandinavian-defence-as-white': {
    intro: tk('In the Scandinavian, Black\'s queen comes out early. Win time by chasing her with your developing moves.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('Take the pawn: Black\'s queen must recapture and come out early.'),
      tk('The knight develops and attacks the queen. That\'s a free move for you.'),
      tk('The queen\'s pawn takes the centre.'),
      tk('The knight develops and defends the centre.'),
      tk('The bishop takes an active diagonal. White is ahead in development.'),
    ],
  },
  'openings-from-s-gambit-mate': {
    intro: tk('Against the Bird Opening, the From\'s Gambit opens lines towards White\'s king. White has just made a careless pawn move. Look at the diagonal next to the king.'),
    why: [
      tk('The bishop checks down the open diagonal. The king\'s pawns block its own escape. Mate!'),
    ],
  },
  'openings-owen-s-defence-trap': {
    intro: tk('Black has fianchettoed the bishop and then weakened the king with a pawn move beside it. Open the king up, accept the loss of a rook, and finish with a bishop mate.'),
    why: [
      tk('Take the pawn: it opens the diagonal to Black\'s king.'),
      tk('Ignore the rook! The queen checks.'),
      tk('Take the pawn that blocked the check. Now the pawn and the queen both point at the king.'),
      tk('The pawn moves with a discovered check from the queen. Black can take the queen, but...'),
      tk('...the bishop mates! Black\'s own pieces block every escape.'),
    ],
  },
  'openings-answer-the-shilling-gambit': {
    intro: tk('Black\'s knight jumps into the centre and leaves the centre pawn hanging. It\'s a trap: taking that pawn loses to a queen attack. Trade the knight and build your centre instead.'),
    why: [
      tk('Trade the intruder instead of grabbing the pawn.'),
      tk('A pawn hits the pawn that came to the centre. Black\'s opening has only wasted time.'),
    ],
  },
  'openings-two-knights-defence-as-white': {
    intro: tk('In the Two Knights, the knight attacks the weak pawn beside Black\'s king. Black gives a pawn and chases your bishop. Take the pawn, keep the bishop alive and retreat calmly.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops towards the centre and attacks Black\'s centre pawn.'),
      tk('The bishop aims at the weak pawn beside Black\'s king.'),
      tk('The knight joins the attack on that pawn.'),
      tk('Take the pawn that blocked the bishop.'),
      tk('The bishop escapes the knight with a check.'),
      tk('Take the pawn. Black takes back, and White stays a pawn up.'),
      tk('The bishop retreats to safety. Black has fast development for the pawns, but White\'s position is solid.'),
    ],
  },
  'openings-the-fork-trick': {
    intro: tk('White\'s knight came out in front of the pawns. A little trick wins back material at once: give up your knight, then fork with a pawn.'),
    why: [
      tk('The knight takes the pawn. It looks like a free piece for White...'),
      tk('...but the pawn forks the bishop and the knight. Black wins the piece back and owns the centre.'),
    ],
  },
  'openings-punish-the-early-bishop-pin': {
    intro: tk('Black pins your knight too early. Open the centre and make Black trade the bishop. Then your queen and bishop hit two weak pawns at once.'),
    why: [
      tk('Take in the centre. Black\'s bishop must decide now.'),
      tk('Take back with the queen: she comes into play.'),
      tk('The bishop aims at the pawn beside the king: mate threat!'),
      tk('The queen attacks the pawn beside the king and the pawn on the queenside. Black can\'t defend both.'),
    ],
  },
  'openings-classical-line-against-the-king-s-indian': {
    intro: tk('In the King\'s Indian, Black lets you build a big centre and plans to attack it later. Take the space, develop calmly and castle.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The second pawn strikes at Black\'s centre from the side.'),
      tk('The second knight develops and adds pressure on the centre.'),
      tk('The king\'s pawn joins: White has a big pawn centre.'),
      tk('The knight develops and defends the centre.'),
      tk('The bishop develops quietly and prepares to castle.'),
      tk('Castling: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-classical-line-against-the-nimzo-indian': {
    intro: tk('In the Nimzo-Indian, Black pins your knight and threatens to double your pawns. The queen defends the knight, so you keep a healthy pawn structure and both bishops.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The second pawn strikes at Black\'s centre from the side.'),
      tk('The knight develops and supports the king\'s pawn push.'),
      tk('The queen defends the pinned knight: if Black takes it, you take back with the queen and your pawns stay healthy.'),
      tk('A pawn asks the bishop: take or retreat?'),
      tk('Take back with the queen: White has both bishops for the long game.'),
    ],
  },
  'openings-main-line-against-the-slav': {
    intro: tk('In the Slav, Black takes your side pawn and hopes to keep it. Stop the queenside pawns from defending it, develop, and win it back.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The second pawn strikes at Black\'s centre from the side.'),
      tk('The knight develops and defends the centre.'),
      tk('The second knight develops and adds pressure on the centre.'),
      tk('Black took a pawn. This pawn stops Black\'s queenside pawns from defending it.'),
      tk('The pawn opens the way for the bishop to take back.'),
      tk('The bishop wins the pawn back and develops with it.'),
    ],
  },
  'openings-gru-nfeld-defence': {
    intro: tk('In the Grünfeld, Black lets White build a big centre on purpose, then attacks it with pieces. Trade a pair of knights and aim your bishop at the centre from afar.'),
    why: [
      tk('The knight develops and watches the centre.'),
      tk('A pawn steps aside to make room for the bishop on the long diagonal.'),
      tk('The pawn challenges White\'s centre at once.'),
      tk('Take back with the knight.'),
      tk('Trade the knights before the pawn chases yours away.'),
      tk('The bishop takes the long diagonal and aims at White\'s big centre.'),
    ],
  },
  'openings-queen-s-gambit-exchange-variation': {
    intro: tk('Against the Queen\'s Gambit Declined, the exchange in the centre gives White a clear plan: pin the knight, develop the bishop to the best diagonal and attack later.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The second pawn strikes at Black\'s centre from the side.'),
      tk('The second knight develops and adds pressure on the centre.'),
      tk('Trade in the centre: the structure is fixed now.'),
      tk('The bishop pins the knight.'),
      tk('The pawn opens the way for the other bishop.'),
      tk('The bishop takes its best diagonal, aimed at Black\'s kingside.'),
    ],
  },
  'openings-queen-s-gambit-accepted': {
    intro: tk('You may take the gambit pawn, but don\'t try to keep it. Develop calmly, let White win it back, and then hit White\'s centre.'),
    why: [
      tk('Your queen\'s pawn claims its share of the centre.'),
      tk('Take the gambit pawn. It\'s fine, as long as you don\'t cling to it.'),
      tk('The knight develops and watches the centre.'),
      tk('The pawn opens the way for the bishop.'),
      tk('White has the pawn back. Now your side pawn strikes at White\'s centre.'),
    ],
  },
  'openings-punish-the-greedy-pawn-grab': {
    intro: tk('Black took the gambit pawn and tries to keep it with another pawn. That leaves the rook in the corner on an open diagonal. Break the pawns up and aim the queen at it.'),
    why: [
      tk('A pawn attacks the defender.'),
      tk('Take: the queenside opens up.'),
      tk('The queen attacks the rook in the corner along the diagonal. Black loses a piece.'),
    ],
  },
  'openings-answer-the-english-opening': {
    intro: tk('The English is a Sicilian with White\'s colours. Play the Sicilian ideas from the other side: take the centre and put a knight in the middle.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight develops and watches the centre.'),
      tk('The knight defends your centre pawn.'),
      tk('The pawn takes more of the centre.'),
      tk('Take back with the knight: it stands in the centre.'),
    ],
  },
  'openings-catalan-opening': {
    intro: tk('The Catalan pairs the Queen\'s Gambit with a bishop on the long diagonal. It quietly presses on Black\'s queenside for many moves.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The second pawn strikes at Black\'s centre from the side.'),
      tk('A pawn makes room for the bishop.'),
      tk('The bishop takes the long diagonal and presses on Black\'s queenside.'),
      tk('The knight develops.'),
      tk('Castling: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-re-ti-opening': {
    intro: tk('The Réti starts with a knight, not a pawn, and attacks the centre from the sides. A flexible way to begin when you don\'t want to show your plans yet.'),
    why: [
      tk('The knight comes out first and controls the centre.'),
      tk('A side pawn hits Black\'s centre.'),
      tk('A pawn makes room for the bishop.'),
      tk('The bishop takes the long diagonal.'),
      tk('Castling: the king is safe and the rook joins the game.'),
      tk('Another pawn prepares the second bishop on the other long diagonal.'),
    ],
  },
  'openings-colle-system': {
    intro: tk('The Colle is a simple, solid setup: pawns, knights and the bishop to the same squares every game, then castle and push in the centre later.'),
    why: [
      tk('The queen\'s pawn takes the centre.'),
      tk('The knight develops.'),
      tk('The pawn builds a solid centre and frees the bishop.'),
      tk('The bishop aims at Black\'s kingside.'),
      tk('A pawn holds the centre firmly.'),
      tk('The second knight develops behind the pawns, ready to support the central push.'),
      tk('Castling: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-dutch-defence-trap': {
    intro: tk('Black chased your bishop with pawns and stripped the king of protection. Two pieces and a sacrifice are enough to mate.'),
    why: [
      tk('The bishop aims at the king through the weakened pawns.'),
      tk('Sacrifice the queen! Check, and the rook must take her.'),
      tk('The bishop checks. The king has no squares left. Mate!'),
    ],
  },
  'openings-answer-the-trompowsky': {
    intro: tk('The Trompowsky sends the bishop out against your knight on move two. Jump forward with the knight, hit the bishop, then attack White\'s centre.'),
    why: [
      tk('The knight develops and watches the centre.'),
      tk('The knight jumps forward and attacks the bishop.'),
      tk('A pawn hits White\'s centre while the bishop is far away.'),
    ],
  },
  'openings-sicilian-dragon': {
    intro: tk('The Dragon puts Black\'s bishop on the long diagonal, aimed straight at White\'s queenside. It\'s one of the sharpest openings in chess.'),
    why: [
      tk('The Sicilian: a side pawn fights for the centre and makes the game unbalanced.'),
      tk('The pawn controls the centre and frees the bishop.'),
      tk('Trade a side pawn for White\'s centre pawn.'),
      tk('The knight attacks White\'s centre pawn.'),
      tk('A pawn steps aside to make room for the bishop on the long diagonal.'),
      tk('The bishop takes the long diagonal: that\'s the Dragon.'),
      tk('You castle: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-magnus-smith-trap': {
    intro: tk('Black has put the bishop on the long diagonal, but the pawn beside the king is weak. Trade, push in the centre, and the bishop sacrifice wins the queen.'),
    why: [
      tk('Trade knights first.'),
      tk('The pawn attacks the knight. If Black takes it, the queens face each other on the open file.'),
      tk('The bishop sacrifices itself with check and drags the king away from its queen...'),
      tk('...and your queen takes Black\'s queen, which had no defender left.'),
    ],
  },
  'openings-rossolimo-attack': {
    intro: tk('Against the Sicilian, the bishop can pin the knight instead of opening the centre. White gives up the bishop and leaves Black with doubled pawns.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops towards the centre and attacks Black\'s centre pawn.'),
      tk('The bishop pins the knight before Black\'s plan gets going.'),
      tk('Take the knight: Black\'s pawns are doubled.'),
      tk('A pawn opens the way for the other bishop.'),
      tk('A pawn stops Black\'s bishop from pinning your knight.'),
    ],
  },
  'openings-alapin-sicilian': {
    intro: tk('The Alapin prepares a full pawn centre with a quiet pawn move. If Black\'s queen recaptures in the middle, chase her and finish the centre.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('A pawn prepares the queen\'s pawn for the centre.'),
      tk('Take the pawn: Black\'s queen has to come out.'),
      tk('The pawn takes the centre, protected by the side pawn.'),
      tk('The knight develops and defends the centre.'),
    ],
  },
  'openings-answer-the-alapin': {
    intro: tk('White prepares a big pawn centre. Attack the king\'s pawn with your knight right away, then trade off the pawn that supports the centre.'),
    why: [
      tk('The Sicilian: a side pawn fights for the centre and makes the game unbalanced.'),
      tk('The knight attacks White\'s king\'s pawn before the queen\'s pawn can defend it.'),
      tk('The knight jumps to a strong post in the centre.'),
      tk('Trade a pawn: White\'s centre loses its support.'),
      tk('The knight develops and adds pressure on the centre.'),
    ],
  },
  'openings-grand-prix-attack': {
    intro: tk('The Grand Prix Attack goes straight for Black\'s king: an extra pawn on the kingside and fast development. Then the bishop pins the knight that guards the centre.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops and prepares the pawn push.'),
      tk('The pawn goes forward to fight for the centre and attack the kingside.'),
      tk('The knight develops.'),
      tk('The bishop pins the knight and prepares to castle.'),
    ],
  },
  'openings-answer-the-grand-prix-attack': {
    intro: tk('White wants to attack your king quickly. Get the bishop to the long diagonal and put your knight in the centre before White does anything.'),
    why: [
      tk('The Sicilian: a side pawn fights for the centre and makes the game unbalanced.'),
      tk('The knight develops and controls the centre.'),
      tk('A pawn steps aside to make room for the bishop on the long diagonal.'),
      tk('The bishop goes to the long diagonal, the strongest post in this setup.'),
      tk('The pinned knight jumps into the centre, escapes the pin and attacks the bishop.'),
    ],
  },
  'openings-smith-morra-gambit': {
    intro: tk('The Smith-Morra gives a pawn for fast development and open lines against the Sicilian. Get every piece out quickly and aim at the pawn beside the king.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The queen\'s pawn offers a trade.'),
      tk('Offer a second pawn: the gambit!'),
      tk('Take back with the knight: it develops.'),
      tk('The other knight develops.'),
      tk('The bishop aims at the pawn beside the king. White is far ahead in development for the pawn.'),
    ],
  },
  'openings-decline-the-smith-morra-gambit': {
    intro: tk('White offers a pawn for fast development. You don\'t have to take it: attack the pawn in the centre with your knight and jump into the middle.'),
    why: [
      tk('The Sicilian: a side pawn fights for the centre and makes the game unbalanced.'),
      tk('Take the queen\'s pawn.'),
      tk('Instead of taking a second pawn, the knight attacks White\'s king\'s pawn.'),
      tk('The knight jumps into the centre. This is a known line against the Alapin, and Black stands fine.'),
    ],
  },
  'openings-decline-the-king-s-gambit': {
    intro: tk('White offers a pawn to open lines against your king. Decline it: the bishop takes the diagonal to White\'s king and White can\'t castle.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The bishop takes the diagonal towards White\'s king instead of the pawn.'),
      tk('A pawn holds your centre.'),
      tk('The knight develops and attacks White\'s king\'s pawn.'),
    ],
  },
  'openings-decline-the-danish-gambit': {
    intro: tk('The Danish gives two pawns for two bishops raking at your king. Return the favour: push in the centre, trade, and develop with threats.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('Take the first pawn.'),
      tk('Instead of the second pawn, strike in the centre.'),
      tk('The queen recaptures in the centre. White has no knight to chase her.'),
      tk('The knight develops and attacks the pawn in the centre.'),
      tk('The bishop pins the knight that defends the centre pawn.'),
    ],
  },
  'openings-evans-gambit-accepted': {
    intro: tk('White gives a pawn to gain time for a big centre. Take it, keep the bishop alive and defend calmly.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends your centre pawn and develops at the same time.'),
      tk('The bishop aims at White\'s weak pawn beside the king.'),
      tk('Take the gambit pawn.'),
      tk('The bishop retreats but stays on the diagonal and pins White\'s pawn to the king.'),
      tk('A pawn holds your centre firm. Black keeps the extra pawn.'),
    ],
  },
  'openings-scotch-gambit': {
    intro: tk('The Scotch Gambit develops the bishop instead of taking back in the centre. If Black\'s knight comes out, push forward and attack it.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops towards the centre and attacks Black\'s centre pawn.'),
      tk('The queen\'s pawn opens the centre.'),
      tk('Leave the pawn for now. The bishop develops and aims at the pawn beside the king.'),
      tk('The pawn attacks the knight.'),
      tk('The bishop escapes and pins the knight.'),
      tk('Now take the pawn back. White has a strong position in the centre.'),
    ],
  },
  'openings-centre-game': {
    intro: tk('In the Centre Game, the queen recaptures early. Move her to a safe square where she still eyes the centre, then develop.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The queen\'s pawn opens the centre.'),
      tk('The queen takes back in the centre.'),
      tk('Black\'s knight attacks the queen. She steps aside to safety and still eyes the centre.'),
      tk('The knight develops and defends the king\'s pawn.'),
    ],
  },
  'openings-answer-the-centre-game': {
    intro: tk('White\'s queen came out early. Chase her with your knight, develop with tempo and castle quickly.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('Take the pawn.'),
      tk('The knight develops and attacks the queen.'),
      tk('The knight develops and attacks the king\'s pawn.'),
      tk('The bishop pins the knight that defends the pawn.'),
      tk('You castle: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-pirc-defence': {
    intro: tk('In the Pirc, Black lets White build a centre and attacks it later with pieces. Set up quickly and castle.'),
    why: [
      tk('A pawn controls the centre from behind.'),
      tk('The knight attacks the king\'s pawn.'),
      tk('A pawn steps aside to make room for the bishop on the long diagonal.'),
      tk('The bishop goes to the long diagonal, the strongest post in this setup.'),
      tk('You castle: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-austrian-attack-against-the-pirc': {
    intro: tk('The Pirc gives White the centre. The Austrian Attack takes it with three pawns and plans to push them later.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The queen\'s pawn takes the centre.'),
      tk('The knight defends the king\'s pawn.'),
      tk('A third pawn joins the centre: the Austrian Attack.'),
      tk('The knight develops and supports the pawn push.'),
      tk('The bishop aims at Black\'s kingside.'),
    ],
  },
  'openings-alekhine-s-defence': {
    intro: tk('Alekhine\'s Defence lures White\'s pawns forward and later attacks them. The knight must move again, so build calmly behind it.'),
    why: [
      tk('The knight attacks the king\'s pawn right away.'),
      tk('Chased by the pawn, the knight jumps into the centre.'),
      tk('The pawn attacks White\'s advanced centre.'),
      tk('The bishop pins the knight that defends the centre.'),
      tk('A pawn makes room for the other bishop and supports the knight.'),
    ],
  },
  'openings-alekhine-s-defence-as-white': {
    intro: tk('Against Alekhine\'s Defence, don\'t overdo it. Gain space, develop and castle: the solid modern way.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The pawn chases the knight.'),
      tk('The queen\'s pawn takes the centre.'),
      tk('The knight develops and defends the centre.'),
      tk('The bishop breaks the pin.'),
      tk('Castling: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-bishop-s-opening': {
    intro: tk('The Bishop\'s Opening develops the bishop first. It aims at the pawn beside Black\'s king, and if a pawn attacks it, it retreats and keeps the diagonal.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The bishop comes out first and aims at the pawn beside the king.'),
      tk('A pawn defends the king\'s pawn.'),
      tk('The knight develops.'),
      tk('The bishop retreats but keeps its diagonal.'),
    ],
  },
  'openings-answer-the-ponziani': {
    intro: tk('The Ponziani prepares White\'s centre with a quiet pawn move. Strike in the centre before White gets there.'),
    why: [
      tk('Your king\'s pawn claims its share of the centre.'),
      tk('The knight defends your centre pawn and develops at the same time.'),
      tk('The pawn strikes in the centre at once. White\'s pawn took the knight\'s best square, so the centre is hard to defend.'),
    ],
  },
  'openings-ruy-lopez-exchange-variation': {
    intro: tk('In the Exchange Variation, the bishop takes the knight and gives Black doubled pawns. White plans a simple endgame where its extra pawn on the kingside counts.'),
    why: [
      tk('The king\'s pawn takes the centre.'),
      tk('The knight develops towards the centre and attacks Black\'s centre pawn.'),
      tk('The bishop pressures the defender of Black\'s centre pawn.'),
      tk('Take the knight: Black\'s pawns are doubled.'),
      tk('Castling: the king is safe and the rook joins the game.'),
      tk('The pawn opens the centre.'),
    ],
  },
  'openings-win-the-pawn-back-in-the-exchange-ruy-lopez': {
    intro: tk('White took your knight and then grabbed your centre pawn. Not so fast: the queen attacks two things at once.'),
    why: [
      tk('The queen attacks the knight and the king\'s pawn at once.'),
      tk('The queen takes the pawn with check. Material is even again.'),
    ],
  },
  'openings-answer-the-steinitz-variation': {
    intro: tk('Black\'s queen comes out early and attacks your king\'s pawn. Jump forward with the knight to threaten a fork, and develop with tempo.'),
    why: [
      tk('The knight jumps forward and threatens to take a pawn with a fork on the king and the rook.'),
      tk('The bishop blocks the check and develops.'),
      tk('The bishop blocks the check again. Black has the pawn, but White is far ahead in development.'),
      tk('Castling: the king is safe and the rook joins the game.'),
    ],
  },
  'openings-advance-french-queen-trap': {
    intro: tk('Black took in the centre and the knight is about to win a pawn. Let it happen: after the trade, the bishop leaves with check and uncovers your queen\'s attack on Black\'s queen.'),
    why: [
      tk('Take the knight.'),
      tk('The bishop checks and opens the line between the queens. Black must deal with the check, and White wins the queen.'),
    ],
  },
  'openings-tarrasch-trap': {
    intro: tk('Black castled too early and left the centre pawn weak. Trade on the right squares and the pawn falls.'),
    why: [
      tk('Take the knight that defends the centre.'),
      tk('Take in the centre.'),
      tk('Trade queens.'),
      tk('Take the pawn. White wins a pawn and threatens more.'),
    ],
  },
  'openings-monticelli-trap': {
    intro: tk('Black\'s knight just took yours. Instead of taking back, jump with the other knight: together with the queen it threatens mate, and your bishop on the long diagonal joins in.'),
    why: [
      tk('The knight threatens mate with the queen next to the king.'),
      tk('Take the knight, opening the long diagonal.'),
      tk('The queen takes the bishop and now attacks the rook in the corner.'),
      tk('Take the rook. White wins material.'),
    ],
  },
  'openings-fishing-pole-trap': {
    intro: tk('You left your knight near White\'s castled king as bait, and White has taken it with a pawn. Take back and the open file leads straight to the king.'),
    why: [
      tk('Take back with the pawn: the rook\'s file opens.'),
      tk('The queen joins the attack.'),
      tk('The pawn closes the net: mate next move cannot be stopped.'),
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
