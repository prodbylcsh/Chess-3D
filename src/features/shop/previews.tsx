// 2D previews of shop items, drawn from the same colours the 3D engine uses.
// When real preview images arrive, list them in PREVIEW_IMAGES and they are
// shown instead.
import { useId, type CSSProperties } from 'react';
import { itemDef } from '#shared/shop.ts';
import { backgroundLook, boardLook, destructionStyle, moveStyle, pieceSetLook, type PieceTone } from '../../cosmetics/looks';
import { PieceGlyph, ProfileIcon } from '../../ui/art/art';
import { PIECE_PATHS, type PieceId } from '../../ui/art/pieces';

/** item id → image URL (e.g. `${import.meta.env.BASE_URL}shop/frost-set.webp`) */
export const PREVIEW_IMAGES: Record<string, string> = {};

const CLASSIC: Record<'light' | 'dark', PieceTone> = {
  light: { base: '#f3ede2', vein: '#c9c0b2', veinAmount: 0.5 },
  dark: { base: '#25232a', vein: '#6a6670', veinAmount: 0.5 },
};
const CLASSIC_BOARD = { light: '#e9e6df', dark: '#2a2a2e', vein: '#8d8a86' };

export function ItemPreview({ id, animate = false }: { id: string; animate?: boolean }) {
  const def = itemDef(id);
  if (PREVIEW_IMAGES[id]) return <img className="preview-img" src={PREVIEW_IMAGES[id]} alt="" />;
  switch (def?.category) {
    case 'pieces':
      return <PiecesPreview id={id} />;
    case 'board':
      return <BoardPreview id={id} />;
    case 'background':
      return <BackgroundPreview id={id} />;
    case 'moveAnimation':
      return <MovePreview id={id} animate={animate} />;
    case 'destruction':
      return <DestructionPreview id={id} animate={animate} />;
    default:
      return (
        <div className="preview preview-icon">
          <ProfileIcon icon={id} size={96} />
        </div>
      );
  }
}

function Glyph({ piece, tone, x, y, scale }: { piece: PieceId; tone: PieceTone; x: number; y: number; scale: number }) {
  const uid = useId().replace(/:/g, '');
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={tone.base} />
          <stop offset="0.6" stopColor={tone.base} />
          <stop offset="1" stopColor={tone.vein} stopOpacity={0.35 + tone.veinAmount * 0.4} />
        </linearGradient>
      </defs>
      <g style={tone.glow ? { filter: `drop-shadow(0 0 7px ${tone.glow})` } : undefined}>
        <PieceGlyph piece={piece} fill={`url(#g${uid})`} />
      </g>
      <path
        fillRule="evenodd"
        fill="none"
        stroke={tone.glow ?? tone.vein}
        strokeOpacity={0.35 + tone.veinAmount * 0.5}
        strokeWidth={1.6}
        d={PIECE_PATHS[piece].join(' ')}
      />
    </g>
  );
}

function PiecesPreview({ id }: { id: string }) {
  const look = pieceSetLook(id);
  const light = look.light ?? CLASSIC.light;
  const dark = look.dark ?? CLASSIC.dark;
  return (
    <div className="preview preview-pieces" style={{ '--glow': light.glow ?? dark.glow ?? 'transparent' } as CSSProperties}>
      <svg viewBox="0 0 200 130" aria-hidden>
        <ellipse cx="100" cy="118" rx="80" ry="9" fill="rgba(0,0,0,.45)" />
        <Glyph piece="queen" tone={dark} x={34} y={22} scale={0.95} />
        <Glyph piece="king" tone={light} x={86} y={10} scale={1.08} />
      </svg>
    </div>
  );
}

function BoardPreview({ id }: { id: string }) {
  const tones = boardLook(id).tones ?? CLASSIC_BOARD;
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push(<rect key={`${r}${c}`} x={c * 20} y={r * 20} width="20" height="20" fill={(r + c) % 2 ? tones.dark : tones.light} />);
  return (
    <div className="preview preview-board">
      <svg viewBox="-10 -10 120 120" aria-hidden>
        <g className="preview-board-tilt">
          <rect x="-7" y="-7" width="114" height="114" rx="4" fill={tones.dark} stroke="rgba(255,255,255,.12)" />
          {cells}
          {tones.vein && <path d="M5 30 C 30 20, 45 60, 70 45 S 95 70, 100 62" stroke={tones.vein} strokeOpacity=".45" strokeWidth="1.4" fill="none" />}
        </g>
      </svg>
    </div>
  );
}

function BackgroundPreview({ id }: { id: string }) {
  const bg = backgroundLook(id);
  const [r, g, b] = bg.motes.color;
  const mote = `rgb(${Math.min(255, r * 150)}, ${Math.min(255, g * 150)}, ${Math.min(255, b * 150)})`;
  const dots = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 70, s: 1 + (i % 3) }));
  return (
    <div
      className="preview preview-bg"
      style={{ background: `radial-gradient(120% 90% at 50% 100%, ${bg.table[0]} 0%, ${bg.table[1]} 35%, ${bg.sky} 75%)` }}
    >
      <div className="preview-bg-light" style={{ background: `radial-gradient(60% 60% at 15% 70%, ${bg.fill.color}55, transparent 70%)` }} />
      <svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.s * 0.45} fill={mote} className="preview-mote" style={{ animationDelay: `${(i % 5) * 0.6}s` }} />
        ))}
      </svg>
      <div className="preview-bg-board" />
    </div>
  );
}

function MovePreview({ id, animate }: { id: string; animate: boolean }) {
  return (
    <div className={`preview preview-move is-${moveStyle(id)}${animate ? ' is-playing' : ''}`}>
      <div className="preview-squares" />
      <div className="preview-mover">
        <svg viewBox="0 0 100 100" aria-hidden>
          <PieceGlyph piece="knight" fill="#f3ede2" />
        </svg>
      </div>
      <span className="preview-trail" />
    </div>
  );
}

function DestructionPreview({ id, animate }: { id: string; animate: boolean }) {
  const style = destructionStyle(id);
  return (
    <div className={`preview preview-destroy is-${style}${animate ? ' is-playing' : ''}`}>
      <div className="preview-victim">
        <svg viewBox="0 0 100 100" aria-hidden>
          <PieceGlyph piece="pawn" fill={style === 'frostbite' ? '#cfeeff' : '#d8d2c7'} />
        </svg>
      </div>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="preview-bit" style={{ '--a': `${i * 36}deg`, '--d': `${(i % 3) * 0.05}s` } as CSSProperties} />
      ))}
      <span className="preview-ring" />
    </div>
  );
}
