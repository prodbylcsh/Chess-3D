import { useEffect, useRef, useState } from 'react';
import type { Color as Side, PieceSymbol } from 'chess.js';
import { ArrowLeft, Copy, Link2, RefreshCcw, Share2, Volume2, VolumeX } from 'lucide-react';
import { sfx } from '../../audio/sfx';
import { getPrefs, setPrefs } from '../../app/prefs';
import { PieceGlyph, ProfileIcon, RankEmblem } from '../../ui/art/art';
import type { PieceId } from '../../ui/art/pieces';
import { Badge, Button, IconButton, Modal, cx } from '../../ui/kit';
import type { Engine } from './engine';
import type { Mode } from './modes/types';
import { ResultCard } from './ResultCard';
import { useGameState, type GameState, type PlayerView } from './store';

const PIECE_ID: Record<PieceSymbol, PieceId> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');

export function GameHud({ engine, mode }: { engine: Engine; mode: Mode }) {
  const s = useGameState(engine.store);
  const top = other(s.bottom);
  // sound follows the saved preference; toggling here saves it too
  const [muted, setMuted] = useState(() => (sfx.muted = !getPrefs().sound));

  return (
    <>
      <div className="gs-top">
        <IconButton label="Leave game" onClick={() => mode.act('exit')}>
          <ArrowLeft size={19} />
        </IconButton>
        <span className="gs-mode">{mode.label}</span>
      </div>

      <TurnPill s={s} />

      <aside className="gs-panel">
        <PlayerCard side={top} player={s.players[top]} s={s} />
        <section className="gs-side">
          <MoveList moves={s.moves} />
          <div className="gs-actions">
            {mode.actions(s).map((a) => (
              <button
                key={a.id}
                type="button"
                className={cx('gs-action', a.tone === 'danger' && 'is-danger', a.pressed && 'is-pressed')}
                disabled={a.disabled}
                aria-pressed={a.pressed}
                title={a.id === 'draw' ? 'Offer a draw' : a.label}
                onClick={() => {
                  sfx.unlock();
                  mode.act(a.id);
                }}
              >
                <a.icon size={18} />
                <span>{a.label}</span>
              </button>
            ))}
            <button type="button" className="gs-action" onClick={() => engine.game.flip()} title="Flip view (F)">
              <RefreshCcw size={18} />
              <span>Flip</span>
            </button>
            <button
              type="button"
              className={cx('gs-action', muted && 'is-pressed')}
              aria-pressed={muted}
              onClick={() => {
                sfx.unlock();
                sfx.muted = !sfx.muted;
                setMuted(sfx.muted);
                setPrefs({ sound: !sfx.muted });
              }}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span>{muted ? 'Muted' : 'Sound'}</span>
            </button>
          </div>
        </section>
        <PlayerCard side={s.bottom} player={s.players[s.bottom]} s={s} />
      </aside>

      {s.invite && <InviteCard url={s.invite} onCancel={() => mode.act('exit')} />}

      <Modal open={!!s.promotion} dismissable={false} title="Promote your pawn" subtitle="Choose the piece it becomes." width={420}>
        <div className="promo">
          {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((p) => (
            <button key={p} type="button" className="promo-btn" onClick={() => engine.store.choosePromotion(p)}>
              <svg viewBox="0 0 100 100" width="54" height="54">
                <PieceGlyph piece={PIECE_ID[p]} fill={s.promotion === 'b' ? '#2a2638' : '#f4eee3'} />
              </svg>
              <span>{PIECE_ID[p][0].toUpperCase() + PIECE_ID[p].slice(1)}</span>
            </button>
          ))}
        </div>
      </Modal>

      {s.end && s.showEnd && <ResultCard s={s} mode={mode} onHide={() => engine.store.set({ showEnd: false })} />}
      {s.end && !s.showEnd && (
        <button type="button" className="gs-show-result" onClick={() => engine.store.set({ showEnd: true })}>
          Show result
        </button>
      )}
    </>
  );
}

function TurnPill({ s }: { s: GameState }) {
  const p = s.players[s.turn];
  const text = s.end ? 'Game over' : s.invite ? 'Waiting for an opponent…' : s.mySide ? (s.turn === s.mySide ? 'Your move' : `${p.name} to move`) : `${p.name} to move`;
  return (
    <div className="gs-turn" data-side={s.turn} aria-live="polite">
      <div className="gs-turn-pill">
        <span className="gs-turn-chip" />
        <span>{text}</span>
        {s.status && (
          <span key={s.status + s.moves.length} className="gs-turn-status">
            {s.status}
          </span>
        )}
      </div>
      {s.note && <div className="gs-note">{s.note}</div>}
    </div>
  );
}

function PlayerCard({ side, player, s }: { side: Side; player: PlayerView; s: GameState }) {
  const toMove = !s.end && !s.invite && s.turn === side;
  const enemy = other(side);
  return (
    <div className={cx('player', toMove && 'is-to-move')} data-side={side}>
      <div className="player-avatar">
        <ProfileIcon icon={player.iconId} size={46} />
        {player.present !== undefined && <span className={cx('presence', player.present && 'is-on')} title={player.present ? 'Connected' : 'Disconnected'} />}
      </div>
      <div className="player-info">
        <div className="player-name">
          <strong>{player.name}</strong>
          {player.you && s.mySide && <Badge tone="gold">You</Badge>}
          {player.tag && <Badge tone="violet">{player.tag}</Badge>}
        </div>
        <div className="player-meta">
          {player.rank ? (
            <>
              <RankEmblem tier={player.rank.tier} division={player.rank.division} size={18} />
              <span>{player.rank.label}</span>
            </>
          ) : (
            <span className="player-color">
              <span className={`swatch swatch-${side}`} /> {side === 'w' ? 'White' : 'Black'}
            </span>
          )}
        </div>
      </div>
      <div className="player-captures" aria-label="Captured pieces">
        <span className="captured">
          {s.captured[side].map((p, i) => (
            <svg key={i} viewBox="0 0 100 100" width="17" height="17">
              <PieceGlyph piece={PIECE_ID[p]} fill={enemy === 'w' ? '#efe8dc' : '#3a3550'} />
            </svg>
          ))}
        </span>
        {s.advantage[side] > 0 && <span className="advantage">+{s.advantage[side]}</span>}
      </div>
    </div>
  );
}

function MoveList({ moves }: { moves: string[] }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [moves.length]);
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);
  return (
    <div className="moves">
      <h2>Moves</h2>
      {moves.length === 0 ? (
        <p className="moves-empty faint">Click a piece, then a glowing square. Drag to orbit, right-drag to pan, scroll to zoom.</p>
      ) : (
        <ol ref={list}>
          {rows.map(([w, b], i) => (
            <li key={i}>
              <span className="num">{i + 1}.</span>
              <span className={cx(i * 2 === moves.length - 1 && 'latest')}>{w}</span>
              <span className={cx(i * 2 + 1 === moves.length - 1 && 'latest')}>{b ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function InviteCard({ url, onCancel }: { url: string; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* the link stays selectable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <div className="invite">
      <div className="invite-icon">
        <Link2 size={24} />
      </div>
      <h2>Invite your opponent</h2>
      <p className="muted">Send this link to a friend. The game starts as soon as they open it.</p>
      <div className="invite-link">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <Button size="sm" variant="primary" icon={<Copy size={15} />} onClick={() => void copy()}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <div className="invite-foot">
        <span className="invite-waiting">Waiting for your opponent…</span>
        <div>
          {canShare && (
            <Button size="sm" variant="ghost" icon={<Share2 size={15} />} onClick={() => void navigator.share({ title: 'Wizard Chess', text: 'Play chess with me!', url })}>
              Share
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
