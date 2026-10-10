import { t } from '../i18n';
import * as THREE from 'three';
import { Chess, type Color as Side, type Move, type PieceSymbol, type Square } from 'chess.js';
import { animator, ease, lerp } from '../core/animator';
import { TEAMS, layout, other } from '../core/layout';
import { sfx } from '../audio/sfx';
import type { Stage } from '../scene/Stage';
import type { BoardView } from './BoardView';
import type { Choreographer } from './Choreographer';
import type { Piece } from './Piece';
import type { GameEnd, GameUi } from './ui';

/** The rook's starting square for a castling move, otherwise null. */
function castlingRook(m: Move): Square | null {
  if (m.isKingsideCastle()) return `h${m.from[1]}` as Square;
  if (m.isQueensideCastle()) return `a${m.from[1]}` as Square;
  return null;
}

/** The pawn an en passant capture takes (it stands beside the mover, not on the target). */
function enPassantVictim(m: Move): Square | null {
  return m.isEnPassant() ? (`${m.to[0]}${m.from[1]}` as Square) : null;
}

const CHECK_RED =new THREE.Color(1.0, 0.12, 0.05);

/** This browser's place in an online game. */
export interface Seat {
  /** the side this browser plays; null when spectating */
  side: Side | null;
  /** false until both players are present, and after the game ends */
  active: boolean;
  /** called with every move made on this board, right after it is applied */
  send(move: Move): void;
}

interface Ending extends GameEnd {
  /** short text for the turn banner */
  status: string;
}

/**
 * Game controller: owns the rules (chess.js), turns clicks into moves and
 * sequences the animations. Input is ignored while an animation plays.
 */
export class Game {
  private readonly chess = new Chess();
  private readonly raycaster = new THREE.Raycaster();
  private busy = true;
  private over = false;
  private autoFlip = false;
  private selected: Square | null = null;
  private targets: Move[] = [];
  private releaseSelection: ((settle: boolean) => void) | null = null;
  private stopCheck: (() => void) | null = null;
  /** online seat, or null for local (hotseat) play */
  private seat: Seat | null = null;
  /** board work runs strictly in order: moves, remote updates and resets never interleave */
  private queue: Promise<void> = Promise.resolve();
  private introduced = false;
  /** keyboard shortcuts only apply while the game screen is showing */
  active = false;

  constructor(
    private readonly stage: Stage,
    private readonly view: BoardView,
    private readonly choreo: Choreographer,
    private readonly ui: GameUi,
  ) {
    this.bindInput();
  }

  /**
   * Start a game: local hotseat with a null seat, otherwise a seat that sends
   * this player's moves somewhere (server, AI). The first game plays the intro.
   */
  begin(seat: Seat | null, moves: string[] = []): Promise<void> {
    this.setBusy(true);
    return this.run(async () => {
      this.seat = seat;
      const side = seat?.side ?? 'w';
      if (this.introduced) return this.resetBoard(moves, side);
      this.introduced = true;
      await this.intro(moves, side);
    });
  }

  /** Moves so far in UCI notation ("e2e4", "e7e8q"). */
  get history(): string[] {
    return this.chess.history({ verbose: true }).map((m) => m.lan);
  }

  get fen(): string {
    return this.chess.fen();
  }

  get isOver(): boolean {
    return this.over;
  }

  /** Resolves once all queued board work (moves, animations, resets) has finished. */
  idle(): Promise<void> {
    return this.queue;
  }

  private async intro(moves: string[], side: Side): Promise<void> {
    this.clearBoardState();
    this.replay(moves);
    const pieces = this.view.rebuild(this.chess);
    for (const p of pieces) p.dissolve.uDissolve.value = 1.1;
    this.ui.update(this.chess);
    this.setBusy(true);
    await this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera);
    await Promise.all([this.introCamera(side), animator.wait(0.5).then(() => this.choreo.materialize(pieces))]);
    this.settle();
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    const el = this.stage.renderer.domElement;
    let down: { x: number; y: number } | null = null;

    el.addEventListener('pointerdown', (e) => {
      sfx.unlock();
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 6) this.onSquareClick(this.pickAt(e));
    });
    el.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) return;
      this.onSquareHover(this.pickAt(e));
    });
    el.addEventListener('pointerleave', () => this.view.setHover(null));

    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') this.deselect();
      else if (key === 'f') this.flip();
      else if (this.seat) return;
      else if (key === 'u' || (key === 'z' && (e.ctrlKey || e.metaKey))) this.undo();
    });
  }

  private pickAt(e: PointerEvent): Square | null {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    return this.view.pick(this.raycaster);
  }

  private onSquareHover(sq: Square | null): void {
    const el = this.stage.renderer.domElement;
    if (this.busy || this.over || !sq || !this.isMyTurn()) {
      this.view.setHover(null);
      el.style.cursor = '';
      return;
    }
    const piece = this.chess.get(sq);
    const interesting =
      (piece && piece.color === this.chess.turn()) ||
      this.targets.some((m) => m.to === sq || castlingRook(m) === sq);
    this.view.setHover(interesting ? sq : null);
    el.style.cursor = interesting ? 'pointer' : '';
  }

  private onSquareClick(sq: Square | null): void {
    if (this.busy || this.over || !this.isMyTurn()) return;
    if (!sq) return this.deselect();

    if (this.selected) {
      // Castling: click the king's target square, or simply the rook to castle with.
      // En passant: click the target square, or the pawn being taken.
      const candidates = this.targets.filter((m) => m.to === sq || castlingRook(m) === sq || enPassantVictim(m) === sq);
      if (candidates.length) {
        this.setBusy(true);
        void this.run(() => this.commit(candidates));
        return;
      }
    }

    const piece = this.chess.get(sq);
    if (piece && piece.color === this.chess.turn()) {
      if (sq === this.selected) this.deselect();
      else this.select(sq);
      return;
    }
    this.deselect();
  }

  /** Turn the camera to the other side of the board. */
  flip(): void {
    sfx.unlock();
    if (!this.busy) void this.orbitTo(this.cameraTheta() + Math.PI);
  }

  /** Keep the camera on the side to move (handy for two players on one device). */
  setAutoFlip(on: boolean): void {
    this.autoFlip = on;
    if (on && !this.busy) void this.faceSide(this.chess.turn());
  }

  private isMyTurn(): boolean {
    return !this.seat || (this.seat.active && this.seat.side === this.chess.turn());
  }

  /** Queue board work behind anything already running. */
  private run(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task).catch((err) => {
      console.error(err);
      this.setBusy(false); // never leave the board locked
    });
    this.queue = next;
    return next;
  }

  // ---------------------------------------------------------------- remote moves

  /** Bring the board to the server's move list: animate a single new move, rebuild on anything else. */
  sync(moves: string[]): Promise<void> {
    return this.run(async () => {
      const local = this.chess.history({ verbose: true }).map((m) => m.lan);
      const extends1 = moves.length === local.length + 1 && local.every((m, i) => m === moves[i]);
      if (extends1) {
        const uci = moves.at(-1)!;
        this.setBusy(true);
        try {
          await this.play({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
          return;
        } catch (err) {
          console.error(err);
        }
      } else if (moves.length === local.length && local.every((m, i) => m === moves[i])) {
        return;
      }
      this.jumpTo(moves);
    });
  }

  /** The game ended off the board (resignation, agreed draw, timeout). */
  finish(end: GameEnd): Promise<void> {
    return this.run(async () => {
      if (this.over) return;
      this.deselect();
      this.clearCheck();
      this.ui.update(this.chess, end.title);
      this.endGame(end);
    });
  }

  // ---------------------------------------------------------------- selection

  private select(sq: Square): void {
    this.deselect();
    const piece = this.view.pieces.get(sq);
    if (!piece) return;
    this.selected = sq;
    this.targets = this.chess.moves({ square: sq, verbose: true });
    this.view.setSelected(sq);
    this.view.showTargets(this.targets);
    this.releaseSelection = this.levitate(piece);
    sfx.select();
  }

  private deselect(): void {
    this.releaseSelection?.(true);
    this.releaseSelection = null;
    this.selected = null;
    this.targets = [];
    this.view.clearTargets();
    this.view.setSelected(null);
  }

  /** The selected piece floats and glows until released. */
  private levitate(piece: Piece): (settle: boolean) => void {
    let alive = true;
    let t = 0;
    animator.onFrame((dt) => {
      if (!alive) return false;
      t += dt;
      const target = layout.boardTop + 0.24 + Math.sin(t * 3) * 0.04;
      piece.root.position.y += (target - piece.root.position.y) * Math.min(1, dt * 10);
      piece.glow = 0.22 + 0.1 * Math.sin(t * 4);
    });
    return (settle) => {
      alive = false;
      const y0 = piece.root.position.y;
      const g0 = piece.glow;
      void animator.tween(0.22, (k) => {
        if (settle) piece.root.position.y = lerp(y0, layout.boardTop, k);
        piece.glow = g0 * (1 - k);
      }, ease.outCubic);
    };
  }

  // ---------------------------------------------------------------- moves

  private async commit(candidates: Move[]): Promise<void> {
    this.setBusy(true);
    let promotion: PieceSymbol | undefined;
    if (candidates[0].isPromotion()) promotion = await this.ui.askPromotion(this.chess.turn());
    const choice = candidates.find((m) => m.promotion === promotion) ?? candidates[0];
    await this.play(choice, (move) => this.seat?.send(move));
  }

  /** Apply a move to the rules and the board, animate it, then handle check and game end. */
  private async play(
    choice: { from: Square; to: Square; promotion?: string },
    onApplied?: (move: Move) => void,
  ): Promise<void> {
    this.releaseSelection?.(false);
    this.releaseSelection = null;
    this.selected = null;
    this.targets = [];
    this.view.clearTargets();
    this.view.setSelected(null);
    this.view.setHover(null);
    this.view.setLastMove(null, null);
    this.clearCheck();

    const move = this.chess.move({ from: choice.from, to: choice.to, promotion: choice.promotion });
    onApplied?.(move);
    this.ui.update(this.chess);
    this.setBusy(true);

    await this.choreo.play(move);
    this.view.setLastMove(move.from, move.to);
    await this.afterMove();
  }

  /** "White wins" locally, "You win" / "Alice wins" online. */
  winText(side: Side): string {
    const name = this.ui.sideName(side);
    return name === 'You' ? t('You win') : t('{name} wins', { name });
  }

  /** How the current position ends the game, if it does. */
  private ending(): Ending | null {
    const c = this.chess;
    if (c.isCheckmate()) {
      const winner = other(c.turn());
      return { winner, reason: 'checkmate', title: t('Checkmate'), text: this.winText(winner), status: t('Checkmate!') };
    }
    if (!c.isDraw()) return null;
    const reason = c.isStalemate()
      ? 'Stalemate'
      : c.isInsufficientMaterial()
        ? 'Insufficient material'
        : c.isThreefoldRepetition()
          ? 'Threefold repetition'
          : 'Fifty-move rule';
    return { winner: null, reason: reason.toLowerCase(), title: t('Draw'), text: t(reason), status: t('Draw') };
  }

  private async afterMove(): Promise<void> {
    const c = this.chess;
    const end = this.ending();
    if (end) {
      this.ui.update(c, end.status);
      if (c.isCheckmate()) {
        const king = this.view.findKing(c.turn());
        if (king) {
          this.view.setCheck(king.square);
          await this.choreo.checkmate(king);
          this.view.setCheck(null);
        }
        sfx.fanfare();
      }
      this.endGame(end);
      return;
    }

    this.showCheckState(true);
    if (this.autoFlip) await this.faceSide(c.turn());
    this.setBusy(false);
  }

  private showCheckState(withSound: boolean): void {
    this.clearCheck();
    const c = this.chess;
    if (!c.inCheck()) {
      this.ui.update(c);
      return;
    }
    const king = this.view.findKing(c.turn());
    if (king) {
      this.view.setCheck(king.square);
      this.stopCheck = this.pulseCheck(king);
    }
    if (withSound) sfx.check();
    this.ui.update(c, t('Check!'));
  }

  private pulseCheck(king: Piece): () => void {
    let alive = true;
    king.material.emissive.copy(CHECK_RED);
    animator.onFrame((_, time) => {
      if (!alive) return false;
      king.glow = 0.16 + 0.12 * Math.sin(time * 6);
    });
    return () => {
      alive = false;
      king.glow = 0;
      king.material.emissive.copy(TEAMS[king.color].glow);
    };
  }

  private clearCheck(): void {
    this.stopCheck?.();
    this.stopCheck = null;
    this.view.setCheck(null);
  }

  private endGame(end: GameEnd): void {
    this.over = true;
    this.setBusy(false);
    this.stage.controls.autoRotate = true;
    this.stage.controls.autoRotateSpeed = 0.6;
    setTimeout(() => {
      if (this.over) this.ui.gameOver(end);
    }, 1400);
  }

  /** Take back the last move (local games only). */
  undo(): void {
    if (this.busy || this.seat || this.chess.history().length === 0) return;
    this.deselect();
    this.clearCheck();
    this.chess.undo();
    this.over = false;
    this.stage.controls.autoRotate = false;
    this.ui.hideGameOver();
    this.view.rebuild(this.chess);
    const last = this.chess.history({ verbose: true }).at(-1);
    this.view.setLastMove(last?.from ?? null, last?.to ?? null);
    this.showCheckState(false);
    this.setBusy(false);
  }

  /** Start over (local games only). */
  newGame(): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.setBusy(true);
    return this.run(() => this.resetBoard([], 'w'));
  }

  private replay(moves: string[]): void {
    this.chess.reset();
    for (const uci of moves) this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }

  private clearBoardState(): void {
    this.deselect();
    this.clearCheck();
    this.over = false;
    this.stage.controls.autoRotate = false;
    this.ui.hideGameOver();
    this.view.setLastMove(null, null);
  }

  /** After a reset or jump: highlight the last move and show check or a finished game. */
  private settle(): void {
    const last = this.chess.history({ verbose: true }).at(-1);
    this.view.setLastMove(last?.from ?? null, last?.to ?? null);
    this.showCheckState(false);
    const end = this.ending();
    if (end) {
      this.ui.update(this.chess, end.status);
      this.endGame(end);
    } else {
      this.setBusy(false);
    }
  }

  /** Dissolve the pieces and summon the position after `moves`, facing `side`. */
  private async resetBoard(moves: string[], side: Side): Promise<void> {
    this.setBusy(true);
    this.clearBoardState();
    await this.choreo.dematerialize([...this.view.pieces.values()]);
    this.replay(moves);
    const pieces = this.view.rebuild(this.chess);
    for (const p of pieces) p.dissolve.uDissolve.value = 1.1;
    this.ui.update(this.chess);
    await Promise.all([this.faceSide(side), this.choreo.materialize(pieces)]);
    this.settle();
  }

  /** Snap straight to the position after `moves` (resync after a missed or rejected update). */
  private jumpTo(moves: string[]): void {
    this.clearBoardState();
    this.replay(moves);
    this.view.rebuild(this.chess);
    this.ui.update(this.chess);
    this.settle();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.ui.setBusy(busy, this.chess.history().length > 0);
    if (busy) this.stage.renderer.domElement.style.cursor = '';
  }

  // ---------------------------------------------------------------- camera

  private cameraTheta(): number {
    const off = this.stage.camera.position.clone().sub(this.stage.controls.target);
    return new THREE.Spherical().setFromVector3(off).theta;
  }

  private faceSide(side: Side): Promise<void> {
    return this.orbitTo(side === 'w' ? 0 : Math.PI);
  }

  private async orbitTo(theta: number, duration = 1.2): Promise<void> {
    const { camera, controls } = this.stage;
    const off = camera.position.clone().sub(controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    const delta = Math.atan2(Math.sin(theta - s.theta), Math.cos(theta - s.theta));
    if (Math.abs(delta) < 0.02) return;
    const t0 = s.theta;
    const wasRotating = controls.autoRotate;
    controls.enabled = false;
    controls.autoRotate = false;
    await animator.tween(duration, (k) => {
      s.theta = t0 + delta * k;
      off.setFromSpherical(s);
      camera.position.copy(controls.target).add(off);
      camera.lookAt(controls.target);
    }, ease.inOutCubic);
    controls.enabled = true;
    controls.autoRotate = wasRotating;
  }

  private async introCamera(side: Side): Promise<void> {
    const { camera, controls } = this.stage;
    const end = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (side === 'b') end.theta += Math.PI;
    const start = new THREE.Spherical(end.radius * 1.7, 0.35, end.theta - 1.4);
    const s = new THREE.Spherical();
    const off = new THREE.Vector3();
    controls.enabled = false;
    await animator.tween(3.2, (k) => {
      s.set(lerp(start.radius, end.radius, k), lerp(start.phi, end.phi, k), lerp(start.theta, end.theta, k));
      off.setFromSpherical(s);
      camera.position.copy(controls.target).add(off);
      camera.lookAt(controls.target);
    }, ease.inOutCubic);
    controls.enabled = true;
  }
}
