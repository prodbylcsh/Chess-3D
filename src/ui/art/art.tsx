import { useId } from 'react';
import type { TierId } from '#shared/rating.ts';
import { TIERS } from '#shared/rating.ts';
import { PIECE_PATHS, type PieceId } from './pieces';

// ------------------------------------------------------------------ profile icons

export interface IconDef {
  id: string;
  name: string;
  piece: PieceId;
  /** medallion gradient: light, dark */
  colors: [string, string];
  /** the six icons everyone can pick during onboarding */
  starter?: boolean;
}

export const PROFILE_ICONS: IconDef[] = [
  { id: 'king', name: 'King', piece: 'king', colors: ['#f7d59c', '#8a5a1c'], starter: true },
  { id: 'queen', name: 'Queen', piece: 'queen', colors: ['#c3adff', '#4a2f9a'], starter: true },
  { id: 'rook', name: 'Rook', piece: 'rook', colors: ['#7fe0d3', '#165a62'], starter: true },
  { id: 'bishop', name: 'Bishop', piece: 'bishop', colors: ['#ff9a8f', '#7a1f2e'], starter: true },
  { id: 'knight', name: 'Knight', piece: 'knight', colors: ['#9cc0ff', '#1f3b80'], starter: true },
  { id: 'pawn', name: 'Pawn', piece: 'pawn', colors: ['#86e8b0', '#1b5e3e'], starter: true },
  // non-player icons
  { id: 'bot', name: 'Wizard Bot', piece: 'knight', colors: ['#6b6f7d', '#1b1d26'] },
  { id: 'guest', name: 'Guest', piece: 'pawn', colors: ['#8a8f9c', '#2b2e38'] },
  { id: 'white', name: 'White', piece: 'king', colors: ['#f4efe6', '#9c958a'] },
  { id: 'black', name: 'Black', piece: 'king', colors: ['#5d5873', '#16141f'] },
];

export const STARTER_ICONS = PROFILE_ICONS.filter((i) => i.starter);

export function iconById(id: string | null | undefined): IconDef {
  return PROFILE_ICONS.find((i) => i.id === id) ?? PROFILE_ICONS.find((i) => i.id === 'guest')!;
}

export function PieceGlyph({ piece, fill = 'currentColor' }: { piece: PieceId; fill?: string }) {
  return <path fillRule="evenodd" fill={fill} d={PIECE_PATHS[piece].join(' ')} />;
}

/** Round chess medallion used as a player's avatar. */
export function ProfileIcon({
  icon,
  size = 40,
  ring,
  className,
}: {
  icon: string | null | undefined;
  size?: number;
  /** optional coloured ring, e.g. the rank tier colour */
  ring?: string;
  className?: string;
}) {
  const def = iconById(icon);
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={def.name}
      style={{ flex: 'none', display: 'block' }}
    >
      <defs>
        <radialGradient id={`bg${uid}`} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor={def.colors[0]} />
          <stop offset="1" stopColor={def.colors[1]} />
        </radialGradient>
        <linearGradient id={`pc${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf7" />
          <stop offset="1" stopColor="#e4d9c6" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#bg${uid})`} />
      <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      {ring && <circle cx="50" cy="50" r="48.5" fill="none" stroke={ring} strokeWidth="3" />}
      <g transform="translate(11 10) scale(0.78)" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.35))' }}>
        <PieceGlyph piece={def.piece} fill={`url(#pc${uid})`} />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ rank emblem

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** Crest for a rank tier, with the division numeral when the tier has divisions. */
export function RankEmblem({ tier, division, size = 48 }: { tier: TierId; division?: number | null; size?: number }) {
  const t = TIERS.find((x) => x.id === tier) ?? TIERS[0];
  const uid = useId().replace(/:/g, '');
  const apex = !t.divisions;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={t.name} style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={`rk${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(t.color, 0.35)} />
          <stop offset="0.55" stopColor={t.color} />
          <stop offset="1" stopColor={shade(t.color, -0.55)} />
        </linearGradient>
        <linearGradient id={`rki${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(t.color, -0.62)} />
          <stop offset="1" stopColor={shade(t.color, -0.82)} />
        </linearGradient>
      </defs>
      {apex && (
        <path
          d="M30 22 L36 6 L44 16 L50 2 L56 16 L64 6 L70 22 Z"
          fill={`url(#rk${uid})`}
          stroke="rgba(0,0,0,.35)"
          strokeWidth="1"
        />
      )}
      <path d="M50 14 L86 28 L82 68 L50 96 L18 68 L14 28 Z" fill={`url(#rk${uid})`} />
      <path d="M50 22 L78 33 L75 64 L50 86 L25 64 L22 33 Z" fill={`url(#rki${uid})`} />
      <path d="M50 22 L78 33 L75 64 L50 86 L25 64 L22 33 Z" fill="none" stroke={shade(t.color, 0.2)} strokeOpacity="0.6" strokeWidth="1.5" />
      {division ? (
        <text
          x="50"
          y="63"
          textAnchor="middle"
          fontFamily="Cinzel, serif"
          fontWeight="700"
          fontSize={division === 3 ? 22 : 25}
          fill={shade(t.color, 0.3)}
        >
          {ROMAN[division]}
        </text>
      ) : (
        <g transform="translate(31 31) scale(0.38)">
          <PieceGlyph piece="king" fill={shade(t.color, 0.3)} />
        </g>
      )}
    </svg>
  );
}

/** The platform's mark: a knight on a gold medallion. */
export function LogoMark({ size = 34 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={`lg${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9dca8" />
          <stop offset="1" stopColor="#c98a3c" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="26" fill={`url(#lg${uid})`} />
      <g transform="translate(14 10) scale(0.72)">
        <PieceGlyph piece="knight" fill="#1a1308" />
      </g>
    </svg>
  );
}
