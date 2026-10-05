import * as THREE from 'three';
import { Chess, type Color as Side, type Move, type PieceSymbol, type Square } from 'chess.js';
import { animator, ease, lerp } from '../core/animator';
import { TEAMS, layout, other } from '../core/layout';
import { sfx } from '../audio/sfx';
import type { Stage } from '../scene/Stage';
import type { Hud, HudAction } from '../ui/Hud';
import type { BoardView } from './BoardView';
import type { Choreographer } from './Choreographer';
import type { Piece } from './Piece';

const CHECK_RED = new THREE.Color(1.0, 0.12, 0.05);

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

  constructor(
    private readonly stage: Stage,
    private readonly view: BoardView,
    private readonly choreo: Choreographer,
    private readonly hud: Hud,
  ) {
    this.bindInput();
    hud.onAction = (a) => this.onAction(a);
  }

  async start(): Promise<void> {
    const pieces = this.view.rebuild(this.chess);
    for (const p of pieces) p.dissolve.uDissolve.value = 1.1;
    this.hud.update(this.chess);
    this.setBusy(true);
    await this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera);
    this.hud.hideLoader();
    await Promise.all([this.introCamera(), animator.wait(0.5).then(() => this.choreo.materialize(pieces))]);
    this.setBusy(false);
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
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') this.deselect();
      else if (key === 'f') this.onAction('flip');
      else if (key === 'u' || (key === 'z' && (e.ctrlKey || e.metaKey))) this.onAction('undo');
      else if (key === 'n') this.onAction('new');
      else if (key === 'm') this.onAction('sound');
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
    if (this.busy || this.over || !sq) {
      this.view.setHover(null);
      el.style.cursor = '';
      return;
    }
    const piece = this.chess.get(sq);
    const interesting = (piece && piece.color === this.chess.turn()) || this.targets.some((m) => m.to === sq);
    this.view.setHover(interesting ? sq : null);
    el.style.cursor = interesting ? 'pointer' : '';
  }

  private onSquareClick(sq: Square | null): void {
    if (this.busy || this.over) return;
    if (!sq) return this.deselect();

    if (this.selected) {
      const candidates = this.targets.filter((m) => m.to === sq);
      if (candidates.length) {
        void this.commit(candidates);
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

  private onAction(action: HudAction): void {
    sfx.unlock();
    switch (action) {
      case 'new':
        void this.newGame();
        break;
      case 'undo':
        this.undo();
        break;
      case 'flip':
        if (!this.busy) void this.orbitTo(this.cameraTheta() + Math.PI);
        break;
      case 'autoflip':
        this.autoFlip = !this.autoFlip;
        this.hud.setToggle('autoflip', this.autoFlip);
        if (this.autoFlip && !this.busy) void this.faceSide(this.chess.turn());
        break;
      case 'sound':
        sfx.muted = !sfx.muted;
        this.hud.setToggle('sound', !sfx.muted);
        break;
    }
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
    if (candidates[0].isPromotion()) promotion = await this.hud.askPromotion(this.chess.turn());
    const choice = candidates.find((m) => m.promotion === promotion) ?? candidates[0];

    this.releaseSelection?.(false);
    this.releaseSelection = null;
    this.selected = null;
    this.targets = [];
    this.view.clearTargets();
    this.view.setSelected(null);
    this.view.setHover(null);
    this.view.setLastMove(null, null);
    this.clearCheck();
    this.hud.hideHint();

    const move = this.chess.move({ from: choice.from, to: choice.to, promotion: choice.promotion });
    this.hud.update(this.chess);
    this.setBusy(true);

    await this.choreo.play(move);
    this.view.setLastMove(move.from, move.to);
    await this.afterMove();
  }

  private async afterMove(): Promise<void> {
    const c = this.chess;
    if (c.isCheckmate()) {
      const loser = c.turn();
      this.hud.update(c, 'Checkmate!');
      const king = this.view.findKing(loser);
      if (king) {
        this.view.setCheck(king.square);
        await this.choreo.checkmate(king);
        this.view.setCheck(null);
      }
      sfx.fanfare();
      this.endGame('Checkmate', `${TEAMS[other(loser)].name} wins`);
      return;
    }
    if (c.isDraw()) {
      const reason = c.isStalemate()
        ? 'Stalemate'
        : c.isInsufficientMaterial()
          ? 'Insufficient material'
          : c.isThreefoldRepetition()
            ? 'Threefold repetition'
            : 'Fifty-move rule';
      this.hud.update(c, 'Draw');
      this.endGame('Draw', reason);
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
      this.hud.update(c);
      return;
    }
    const king = this.view.findKing(c.turn());
    if (king) {
      this.view.setCheck(king.square);
      this.stopCheck = this.pulseCheck(king);
    }
    if (withSound) sfx.check();
    this.hud.update(c, 'Check!');
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

  private endGame(title: string, text: string): void {
    this.over = true;
    this.setBusy(false);
    this.stage.controls.autoRotate = true;
    this.stage.controls.autoRotateSpeed = 0.6;
    setTimeout(() => {
      if (this.over) this.hud.showGameOver(title, text);
    }, 1400);
  }

  private undo(): void {
    if (this.busy || this.chess.history().length === 0) return;
    this.deselect();
    this.clearCheck();
    this.chess.undo();
    this.over = false;
    this.stage.controls.autoRotate = false;
    this.hud.hideGameOver();
    this.view.rebuild(this.chess);
    const last = this.chess.history({ verbose: true }).at(-1);
    this.view.setLastMove(last?.from ?? null, last?.to ?? null);
    this.showCheckState(false);
    this.setBusy(false);
  }

  private async newGame(): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    this.deselect();
    this.clearCheck();
    this.over = false;
    this.stage.controls.autoRotate = false;
    this.hud.hideGameOver();
    this.view.setLastMove(null, null);

    await this.choreo.dematerialize([...this.view.pieces.values()]);
    this.chess.reset();
    const pieces = this.view.rebuild(this.chess);
    for (const p of pieces) p.dissolve.uDissolve.value = 1.1;
    this.hud.update(this.chess);
    await Promise.all([this.faceSide('w'), this.choreo.materialize(pieces)]);
    this.setBusy(false);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.hud.setBusy(busy, this.chess.history().length > 0);
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

  private async introCamera(): Promise<void> {
    const { camera, controls } = this.stage;
    const end = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
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
