/**
 * Vibration on phones (docs/PLATFORM.md §7): every event of the game has its own pattern,
 * shaped to feel like what happens. Patterns are [on, off, on, …] in milliseconds; a phone
 * can only vary the length, so strength is felt through duration and rhythm:
 *
 * - your own moves are crisp and each piece has its own character (a pawn ticks, a knight
 *   hops and lands, a rook thuds); the opponent's moves are the same but softer, so your
 *   own actions always feel stronger
 * - taking a piece is a firm hit with a pleasant echo, bigger for bigger pieces (a reward);
 *   losing one is a single dull buzz without rhythm (a loss is felt, but never jarring)
 * - good news rises (short, then longer), bad news is flat and low
 *
 * Android and other browsers with the Vibration API get the full patterns. Safari on iPhone
 * has no Vibration API: there the system tick of a hidden switch stands in, one per beat
 * (iOS 18 and later; Apple may close this). Off in Settings (Prefs.haptics, which sets `enabled`).
 */
import type { Move, PieceSymbol } from 'chess.js';

export type Pattern = number[];

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Your own move, by the piece that moves. */
export const PIECE_FEEL: Record<PieceSymbol, Pattern> = {
  p: [10], // a light step
  n: [14, 45, 20], // a hop and a landing
  b: [18], // a smooth glide
  r: [30], // a solid thud
  q: [16, 30, 26], // a graceful double, the second firmer
  k: [40], // a slow, weighty step
};

/** The same, softer: the opponent's moves are felt less than your own. */
const soft = (p: Pattern): Pattern => p.map((ms, i) => (i % 2 ? ms : Math.max(6, Math.round(ms * 0.45))));

/** You take a piece: a firm hit, and for big pieces a rolling echo. */
export function captureFeel(captured: PieceSymbol): Pattern {
  const v = VALUE[captured];
  const hit = Math.min(56, 20 + 4 * v);
  if (v >= 9) return [hit, 40, 22, 40, 12];
  if (v >= 5) return [hit, 40, 18];
  return [hit, 45, 10];
}

/** The opponent takes one of yours: one dull buzz, longer for bigger losses. */
export const lossFeel = (captured: PieceSymbol): Pattern => [60 + 8 * VALUE[captured]];

export const FEEL = {
  castle: [16, 60, 16], // the king, then the rook
  promote: [10, 40, 20, 40, 35], // rising
  giveCheck: [20, 60, 20], // two pointed taps
  inCheck: [45, 70, 45], // a warning
  win: [20, 60, 30, 60, 45, 80, 90], // a rising flourish
  lose: [180], // a long low fade
  draw: [30, 100, 30],
  right: [12, 50, 24], // da-DUM: puzzles, a right move
  wrong: [70], // a flat "no"
  hint: [8],
  solved: [20, 50, 30, 50, 60],
  select: [6],
} satisfies Record<string, Pattern>;

/** A streak celebration that grows with the streak's tier (0 = a few days … 5 = 1000+). */
export function streakFeel(tier: number): Pattern {
  const beats = 2 + tier; // more beats …
  const out: Pattern = [];
  for (let i = 0; i < beats; i++) {
    out.push(14 + i * (6 + tier * 2), 55 - Math.min(25, tier * 5)); // … each longer, closer together
  }
  out.push(60 + tier * 25); // and a longer finale
  return out;
}

/** The feel of a move: `mine` when the player made it (or both sides are the player's). */
export function moveFeel(move: Pick<Move, 'piece' | 'captured' | 'promotion' | 'flags'>, mine: boolean): Pattern {
  if (move.captured) return mine ? captureFeel(move.captured) : lossFeel(move.captured);
  if (move.promotion) return mine ? FEEL.promote : soft(FEEL.promote);
  if (move.flags.includes('k') || move.flags.includes('q')) return mine ? FEEL.castle : soft(FEEL.castle);
  return mine ? PIECE_FEEL[move.piece] : soft(PIECE_FEEL[move.piece]);
}

// ---------------------------------------------------------------- output

let iosSwitch: HTMLLabelElement | null = null;
const isIos = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Safari on iPhone: a hidden switch whose toggle gives the system's haptic tick. */
function tick(): void {
  if (!iosSwitch) {
    iosSwitch = document.createElement('label');
    iosSwitch.setAttribute('aria-hidden', 'true');
    iosSwitch.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    iosSwitch.appendChild(input);
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.click();
}

export const haptics = {
  /** the player's setting (src/app/prefs.ts keeps it in step) */
  enabled: true,
  play(pattern: Pattern): void {
    if (!haptics.enabled || typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* not allowed before the first tap */
      }
      return;
    }
    if (!isIos()) return;
    // one tick per beat, a second for long ones
    let at = 0;
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) {
        setTimeout(tick, at);
        if (ms >= 60) setTimeout(tick, at + Math.min(ms, 120) - 10);
      }
      at += ms;
    });
  },
};
