import { t as translate, tk } from '../../i18n';
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
  /** piece gradient, top to bottom (default: ivory) */
  glyph?: [string, string];
  /** decorative outer ring (shop and season icons) */
  frame?: string;
  /** season reward icons show the season number */
  season?: number;
}

export const PROFILE_ICONS: IconDef[] = [
  { id: 'king', name: tk('King'), piece: 'king', colors: ['#f7d59c', '#8a5a1c'], starter: true },
  { id: 'queen', name: tk('Queen'), piece: 'queen', colors: ['#c3adff', '#4a2f9a'], starter: true },
  { id: 'rook', name: tk('Rook'), piece: 'rook', colors: ['#7fe0d3', '#165a62'], starter: true },
  { id: 'bishop', name: tk('Bishop'), piece: 'bishop', colors: ['#ff9a8f', '#7a1f2e'], starter: true },
  { id: 'knight', name: tk('Knight'), piece: 'knight', colors: ['#9cc0ff', '#1f3b80'], starter: true },
  { id: 'pawn', name: tk('Pawn'), piece: 'pawn', colors: ['#86e8b0', '#1b5e3e'], starter: true },
  // shop icons
  { id: 'ember-rook', name: tk('Ember Rook'), piece: 'rook', colors: ['#ff9a4a', '#5a1404'], glyph: ['#fff1c9', '#ffb04a'], frame: '#ff7a2a' },
  { id: 'frost-knight', name: tk('Frost Knight'), piece: 'knight', colors: ['#bfeaff', '#1d4f86'], glyph: ['#ffffff', '#cdeeff'], frame: '#8fd8ff' },
  { id: 'jade-bishop', name: tk('Jade Bishop'), piece: 'bishop', colors: ['#9df0c0', '#0e4a33'], glyph: ['#f1fff6', '#a8e9c4'], frame: '#5fd39a' },
  { id: 'storm-pawn', name: tk('Storm Pawn'), piece: 'pawn', colors: ['#a6b4ff', '#1b1f5c'], glyph: ['#fffbe0', '#ffe066'], frame: '#8a9cff' },
  { id: 'void-queen', name: tk('Void Queen'), piece: 'queen', colors: ['#7a4dff', '#0b0620'], glyph: ['#f2e9ff', '#b18cff'], frame: '#b18cff' },
  { id: 'sun-king', name: tk('Sun King'), piece: 'king', colors: ['#ffe9a3', '#c86a12'], glyph: ['#fffdf2', '#ffd36b'], frame: '#ffd36b' },
  // non-player icons
  { id: 'bot', name: tk('Wizard Bot'), piece: 'knight', colors: ['#6b6f7d', '#1b1d26'] },
  { id: 'guest', name: tk('Guest'), piece: 'pawn', colors: ['#8a8f9c', '#2b2e38'] },
  { id: 'white', name: tk('White'), piece: 'king', colors: ['#f4efe6', '#9c958a'] },
  { id: 'black', name: tk('Black'), piece: 'king', colors: ['#5d5873', '#16141f'] },
];

export const STARTER_ICONS = PROFILE_ICONS.filter((i) => i.starter);

/** Season reward icons, by bracket: medallion colours and the piece shown. */
const SEASON_STYLE: Record<string, { piece: PieceId; colors: [string, string]; frame: string }> = {
  iron: { piece: 'pawn', colors: ['#9aa3ad', '#2c3238'], frame: '#c3cad2' },
  'bronze-silver': { piece: 'knight', colors: ['#e0b48a', '#5c3a22'], frame: '#d9dde3' },
  'gold-platinum': { piece: 'bishop', colors: ['#ffe08a', '#7a5212'], frame: '#9ff0e6' },
  'emerald-diamond': { piece: 'rook', colors: ['#7ff0b8', '#0f4d5e'], frame: '#a8d8ff' },
  'master-grandmaster': { piece: 'queen', colors: ['#d68aff', '#4a0f3a'], frame: '#ff9a9a' },
  challenger: { piece: 'king', colors: ['#fff2b0', '#b0560f'], frame: '#7ff3ff' },
};

function seasonIcon(id: string): IconDef | null {
  const m = /^season-(\d+)-([a-z-]+)$/.exec(id);
  const style = m && SEASON_STYLE[m[2]];
  if (!m || !style) return null;
  return { id, name: tk('Season reward'), ...style, glyph: ['#ffffff', '#f3e7cf'], season: Number(m[1]) };
}

export function iconById(id: string | null | undefined): IconDef {
  return PROFILE_ICONS.find((i) => i.id === id) ?? (id ? seasonIcon(id) : null) ?? PROFILE_ICONS.find((i) => i.id === 'guest')!;
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
      aria-label={translate(def.name)}
      style={{ flex: 'none', display: 'block' }}
    >
      <defs>
        <radialGradient id={`bg${uid}`} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor={def.colors[0]} />
          <stop offset="1" stopColor={def.colors[1]} />
        </radialGradient>
        <linearGradient id={`pc${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={def.glyph?.[0] ?? '#fffdf7'} />
          <stop offset="1" stopColor={def.glyph?.[1] ?? '#e4d9c6'} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#bg${uid})`} />
      <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      {def.frame && (
        <>
          <circle cx="50" cy="50" r="45" fill="none" stroke={def.frame} strokeOpacity="0.85" strokeWidth="2.2" strokeDasharray="2 4.2" />
          <circle cx="50" cy="50" r="48" fill="none" stroke={def.frame} strokeWidth="1.6" />
        </>
      )}
      {ring && <circle cx="50" cy="50" r="48.5" fill="none" stroke={ring} strokeWidth="3" />}
      <g transform="translate(11 10) scale(0.78)" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.35))' }}>
        <PieceGlyph piece={def.piece} fill={`url(#pc${uid})`} />
      </g>
      {def.season != null && (
        <g>
          <rect x="31" y="74" width="38" height="17" rx="8.5" fill="rgba(10,8,16,.82)" stroke={def.frame} strokeWidth="1.2" />
          <text x="50" y="86.5" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="11" fill={def.frame}>
            S{def.season}
          </text>
        </g>
      )}
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
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={translate(t.name)} style={{ flex: 'none', display: 'block' }}>
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

/** Badge for a season reward: a pennant in the bracket's colours with the season number. */
export function SeasonBadge({ season, bracket, size = 44 }: { season: number; bracket: string; size?: number }) {
  const style = SEASON_STYLE[bracket] ?? SEASON_STYLE.iron;
  const uid = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={translate('Season {n}', { n: season })} style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={`sb${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={style.colors[0]} />
          <stop offset="1" stopColor={style.colors[1]} />
        </linearGradient>
      </defs>
      <path d="M22 8 H78 V74 L50 94 L22 74 Z" fill={`url(#sb${uid})`} stroke={style.frame} strokeWidth="2.5" />
      <path d="M30 16 H70 V69 L50 83 L30 69 Z" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      <text x="50" y="52" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="26" fill="#fffaf0" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.5))' }}>
        S{season}
      </text>
    </svg>
  );
}
