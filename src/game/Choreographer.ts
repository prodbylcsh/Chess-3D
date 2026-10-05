import * as THREE from 'three';
import type { Move, PieceSymbol, Square } from 'chess.js';
import { animator, ease, lerp, rand } from '../core/animator';
import { TEAMS, layout, squareCenter, worldToSquare } from '../core/layout';
import { sfx } from '../audio/sfx';
import type { Effects } from '../fx/effects';
import type { Debris } from '../fx/shatter';
import type { Stage } from '../scene/Stage';
import type { BoardView } from './BoardView';
import type { Piece } from './Piece';

const UP = new THREE.Vector3(0, 1, 0);
const tmpAxis = new THREE.Vector3();

type CaptureStyle = 'melee' | 'crush' | 'spell';

const CAPTURE_STYLE: Record<PieceSymbol, CaptureStyle> = {
  p: 'melee',
  k: 'melee',
  n: 'crush',
  r: 'crush',
  b: 'spell',
  q: 'spell',
};

/** Horizontal unit vector from a to b. */
function flatDir(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  return d.lengthSq() < 1e-8 ? d.set(0, 0, -1) : d.normalize();
}

function flatDist(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Lean a piece around its base: positive angle tips the top towards `dir`. */
function lean(piece: Piece, dir: THREE.Vector3, angle: number): void {
  tmpAxis.crossVectors(UP, dir).normalize();
  piece.root.quaternion.setFromAxisAngle(tmpAxis, angle);
}

/**
 * Turns chess moves into cinematic animations. Every method awaits until its
 * animation is finished, so the game controller can simply `await play(move)`.
 */
export class Choreographer {
  constructor(
    private readonly view: BoardView,
    private readonly fx: Effects,
    private readonly debris: Debris,
    private readonly stage: Stage,
  ) {}

  async play(move: Move): Promise<void> {
    const { view } = this;
    const mover = view.pieces.get(move.from);
    if (!mover) throw new Error(`No piece on ${move.from}`);

    let victim: Piece | undefined;
    // chess.js does not count en passant as isCapture()
    if (move.isCapture() || move.isEnPassant()) {
      const victimSq = move.isEnPassant() ? (`${move.to[0]}${move.from[1]}` as Square) : move.to;
      victim = view.pieces.get(victimSq);
      view.pieces.delete(victimSq);
    }
    view.pieces.delete(move.from);
    view.pieces.set(move.to, mover);
    mover.square = move.to;

    const dest = squareCenter(move.to);

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      await this.castle(mover, dest, move);
    } else if (victim) {
      await this.capture(mover, victim, dest);
    } else {
      await this.travel(mover, dest);
    }

    if (move.promotion) await this.promote(mover, move.promotion);
  }

  // ---------------------------------------------------------------- movement

  /**
   * Move a piece to `dest`. It glides across the board, or hops in an arc when
   * another piece is in the way (and knights always jump).
   */
  async travel(piece: Piece, dest: THREE.Vector3, opts: { hop?: boolean; height?: number } = {}): Promise<void> {
    const start = piece.root.position.clone();
    const dist = flatDist(start, dest);
    if (dist < 1e-3 && Math.abs(start.y - dest.y) < 1e-3) return;

    const obstacle = this.obstacleHeight(start, dest, piece);
    const hop = opts.hop || obstacle > 0 || piece.type === 'n';
    const height = opts.height ?? (obstacle > 0 ? obstacle + 0.5 : hop ? 1.0 : 0);
    const duration = hop ? 0.5 + dist * 0.08 + height * 0.08 : 0.28 + dist * 0.12;
    const dir = flatDir(start, dest);
    const tiltAmp = hop ? 0.3 : 0.14;

    if (hop) sfx.whoosh(duration * 0.8);
    else sfx.slide(duration);
    this.fx.dustPuff(new THREE.Vector3(start.x, layout.boardTop, start.z), hop ? 10 : 5, 0.3, 0.6);

    await animator.tween(duration, (k, raw) => {
      const p = piece.root.position;
      p.x = lerp(start.x, dest.x, k);
      p.z = lerp(start.z, dest.z, k);
      const baseY = lerp(start.y, dest.y, k);
      p.y = baseY + (hop ? height * 4 * raw * (1 - raw) : 0.06 * Math.sin(Math.PI * raw));
      lean(piece, dir, tiltAmp * Math.sin(2 * Math.PI * raw));
    }, hop ? ease.inOutSine : ease.inOutCubic);

    piece.root.position.copy(dest);
    piece.root.quaternion.identity();

    if (hop) {
      sfx.thud(0.6 + height * 0.15);
      this.fx.dustPuff(dest, 16, 0.45, 0.9);
      this.stage.shake(0.12 + height * 0.04);
      await this.settleBounce(piece, 0.08);
    } else {
      this.fx.dustPuff(dest, 6, 0.3, 0.5);
    }
  }

  /** Tallest piece whose square the straight path from a to b crosses (0 = clear). */
  private obstacleHeight(a: THREE.Vector3, b: THREE.Vector3, mover: Piece): number {
    let max = 0;
    const p = new THREE.Vector3();
    const c = new THREE.Vector3();
    const steps = Math.ceil(flatDist(a, b) / 0.1);
    for (let i = 1; i < steps; i++) {
      p.lerpVectors(a, b, i / steps);
      const sq = worldToSquare(p.x, p.z);
      if (!sq) continue;
      const other = this.view.pieces.get(sq);
      if (!other || other === mover) continue;
      squareCenter(sq, c);
      if (Math.hypot(p.x - c.x, p.z - c.z) < 0.48 && flatDist(other.root.position, b) > 0.2) {
        max = Math.max(max, other.height);
      }
    }
    return max;
  }

  private async settleBounce(piece: Piece, amount: number): Promise<void> {
    const y0 = piece.root.position.y;
    await animator.tween(0.22, (_, raw) => {
      const s = Math.sin(raw * Math.PI) * amount * (1 - raw);
      piece.root.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
      piece.root.position.y = y0;
    }, ease.linear);
    piece.root.scale.set(1, 1, 1);
  }

  private async castle(king: Piece, dest: THREE.Vector3, move: Move): Promise<void> {
    const rank = move.from[1];
    const kingside = move.isKingsideCastle();
    const rookFrom = `${kingside ? 'h' : 'a'}${rank}` as Square;
    const rookTo = `${kingside ? 'f' : 'd'}${rank}` as Square;
    const rook = this.view.pieces.get(rookFrom);
    if (!rook) return this.travel(king, dest);
    this.view.pieces.delete(rookFrom);
    this.view.pieces.set(rookTo, rook);
    rook.square = rookTo;

    sfx.magic(0.6, 330);
    this.fx.gather(rook.root.position.clone().setY(layout.boardTop + rook.height * 0.6), TEAMS[rook.color].glow, 0.5, 40);
    await Promise.all([
      this.travel(king, dest),
      animator.wait(0.18).then(() =>
        this.travel(rook, squareCenter(rookTo), { hop: true, height: king.height + 0.6 }),
      ),
    ]);
  }

  // ---------------------------------------------------------------- captures

  private async capture(attacker: Piece, victim: Piece, dest: THREE.Vector3): Promise<void> {
    switch (CAPTURE_STYLE[attacker.type]) {
      case 'melee':
        return this.melee(attacker, victim, dest);
      case 'crush':
        return this.crush(attacker, victim, dest);
      case 'spell':
        return this.spell(attacker, victim, dest);
    }
  }

  /** Approach, rear back, and smash into the victim (pawns, king). */
  private async melee(attacker: Piece, victim: Piece, dest: THREE.Vector3): Promise<void> {
    const vpos = victim.root.position.clone();
    let dir = flatDir(attacker.root.position, vpos);
    const approach = vpos.clone().addScaledVector(dir, -1.0);
    approach.y = layout.boardTop;
    if (flatDist(attacker.root.position, approach) > 0.05 && flatDist(attacker.root.position, vpos) > 1.05) {
      await this.travel(attacker, approach);
    }
    dir = flatDir(attacker.root.position, vpos);
    const base = attacker.root.position.clone();
    const stopTrembling = this.tremble(victim, 0.025);

    // wind-up
    await animator.tween(0.32, (k) => {
      attacker.root.position.copy(base).addScaledVector(dir, -0.18 * k);
      attacker.root.position.y = base.y + 0.18 * k;
      lean(attacker, dir, -0.38 * k);
    }, ease.outCubic);

    sfx.whoosh(0.18);
    const strikeFrom = attacker.root.position.clone();
    const strikeTo = vpos.clone().addScaledVector(dir, -0.5);
    strikeTo.y = base.y + 0.05;
    await animator.tween(0.11, (k) => {
      attacker.root.position.lerpVectors(strikeFrom, strikeTo, k);
      lean(attacker, dir, lerp(-0.38, 0.55, k));
    }, ease.inCubic);

    stopTrembling();
    const impact = vpos.clone().addScaledVector(UP, victim.height * 0.55).addScaledVector(dir, -victim.radius * 0.6);
    this.impact(attacker, victim, impact, {
      direction: dir,
      force: 3.2,
      radial: 2.2,
      lift: 3,
      shards: 24,
    });

    await animator.tween(0.25, (k) => lean(attacker, dir, lerp(0.55, 0.05, k)), ease.outCubic);
    await this.travel(attacker, dest);
  }

  /** Leap high and slam down on the victim (rooks, knights). */
  private async crush(attacker: Piece, victim: Piece, dest: THREE.Vector3): Promise<void> {
    const start = attacker.root.position.clone();
    const vpos = victim.root.position.clone();
    const dir = flatDir(start, vpos);
    const apex = layout.boardTop + victim.height + 2.4;
    const stopTrembling = this.tremble(victim, 0.02);

    // crouch
    await animator.tween(0.2, (k) => attacker.root.scale.set(1 + 0.08 * k, 1 - 0.14 * k, 1 + 0.08 * k), ease.outQuad);
    sfx.whoosh(0.5);
    this.fx.dustPuff(start, 14, 0.4, 0.8);

    // leap to above the victim
    const spinTurns = attacker.type === 'r' ? Math.PI * 2 : 0;
    await animator.tween(0.6, (_, raw) => {
      const h = ease.inOutSine(raw);
      attacker.root.position.x = lerp(start.x, vpos.x, h);
      attacker.root.position.z = lerp(start.z, vpos.z, h);
      attacker.root.position.y = lerp(start.y, apex, ease.outCubic(raw));
      const s = Math.min(1, raw * 4);
      attacker.root.scale.set(lerp(1.08, 1, s), lerp(0.86, 1, s) + 0.06 * Math.sin(raw * Math.PI), lerp(1.08, 1, s));
      if (attacker.type === 'n') lean(attacker, dir, 0.5 * Math.sin(raw * Math.PI));
      attacker.model.rotation.y = Math.PI + spinTurns * ease.inOutCubic(raw);
    }, ease.linear);
    attacker.root.scale.set(1, 1, 1);
    attacker.model.rotation.y = Math.PI;

    // hang in the air for a heartbeat
    attacker.glow = 0.6;
    await animator.tween(0.14, (k) => {
      attacker.root.position.y = apex + 0.12 * Math.sin(k * Math.PI);
      lean(attacker, dir, attacker.type === 'n' ? -0.25 * k : 0);
    }, ease.inOutSine);

    // slam
    const contactY = layout.boardTop + victim.height * 0.8;
    await animator.tween(0.16, (k) => {
      attacker.root.position.y = lerp(apex, contactY, k);
    }, ease.inQuad);

    stopTrembling();
    this.impact(attacker, victim, vpos.clone().setY(contactY), {
      direction: new THREE.Vector3(0, -1, 0),
      force: 2,
      radial: 4.2,
      lift: 2.2,
      shards: 28,
      ring: 3.4,
      shake: 0.9,
    });

    await animator.tween(0.07, (k) => {
      attacker.root.position.y = lerp(contactY, layout.boardTop, k);
    }, ease.linear);
    attacker.root.quaternion.identity();
    this.fx.dustPuff(vpos, 30, 0.9, 1.4);
    sfx.thud(1.2);
    await this.settleBounce(attacker, 0.16);
    void animator.tween(0.5, (k) => (attacker.glow = 0.6 * (1 - k)));

    if (flatDist(attacker.root.position, dest) > 0.05) await this.travel(attacker, dest);
  }

  /** Charge a spell, fire a bolt, the victim cracks and explodes (bishops, queens). */
  private async spell(attacker: Piece, victim: Piece, dest: THREE.Vector3): Promise<void> {
    const glow = TEAMS[attacker.color].glow;
    const vpos = victim.root.position.clone();
    const isQueen = attacker.type === 'q';

    if (flatDist(attacker.root.position, vpos) > 2.9) {
      const castFrom = vpos.clone().addScaledVector(flatDir(attacker.root.position, vpos), -2.2);
      castFrom.y = layout.boardTop;
      await this.travel(attacker, castFrom);
    }

    // charge
    const base = attacker.root.position.clone();
    const tip = () => attacker.root.position.clone().add(new THREE.Vector3(0, attacker.height + 0.18, 0));
    sfx.magic(0.75, isQueen ? 440 : 600);
    this.fx.gather(tip().setY(base.y + attacker.height + 0.45), glow, 0.65, isQueen ? 110 : 70);
    const stopTrembling = this.tremble(victim, 0.03);
    await animator.tween(0.7, (k) => {
      attacker.root.position.y = base.y + 0.3 * k;
      attacker.glow = 0.9 * k;
    }, ease.inOutSine);

    // fire
    sfx.zap();
    const target = vpos.clone().add(new THREE.Vector3(0, victim.height * 0.55, 0));
    await this.fx.bolt(tip(), target, glow, isQueen ? 0.18 : 0.12);

    // the victim is struck: it levitates, shakes and cracks with light
    stopTrembling();
    victim.material.emissive.copy(glow);
    victim.dissolve.uEdgeColor.value.copy(glow).multiplyScalar(10);
    victim.dissolve.uEdgeWidth.value = 0.09;
    this.fx.sparkBurst(target, glow, 40, 3);
    const v0 = victim.root.position.clone();
    await animator.tween(0.45, (k) => {
      victim.root.position.set(v0.x + rand(-1, 1) * 0.05 * k, v0.y + 0.35 * ease.outCubic(k), v0.z + rand(-1, 1) * 0.05 * k);
      victim.dissolve.uDissolve.value = 0.14 * k;
      victim.glow = 0.7 * k;
    }, ease.linear);

    this.impact(attacker, victim, victim.root.position.clone().add(new THREE.Vector3(0, victim.height * 0.5, 0)), {
      radial: isQueen ? 4.8 : 3.8,
      lift: 3,
      spin: 14,
      shards: isQueen ? 30 : 24,
      sparks: isQueen ? 260 : 170,
      ring: isQueen ? 3.8 : 2.8,
      shake: isQueen ? 0.85 : 0.6,
    });
    if (isQueen) {
      void animator.wait(0.12).then(() => this.fx.shockwave(vpos, glow, 2.2, 0.6));
    }

    // calm down and claim the square
    await animator.tween(0.35, (k) => {
      attacker.root.position.y = base.y + 0.3 * (1 - k);
      attacker.glow = 0.9 * (1 - k);
    }, ease.inOutSine);
    attacker.glow = 0;
    await this.travel(attacker, dest);
  }

  private impact(
    attacker: Piece,
    victim: Piece,
    point: THREE.Vector3,
    o: {
      direction?: THREE.Vector3;
      force?: number;
      radial?: number;
      lift?: number;
      spin?: number;
      shards?: number;
      sparks?: number;
      ring?: number;
      shake?: number;
    },
  ): void {
    const glow = TEAMS[attacker.color].glow;
    const base = victim.root.position.clone().setY(layout.boardTop);
    this.debris.shatter(victim, {
      impact: point,
      direction: o.direction,
      force: o.force,
      radial: o.radial,
      lift: o.lift,
      spin: o.spin,
      shards: o.shards,
      glow,
    });
    victim.dispose();

    this.fx.sparkBurst(point, glow, o.sparks ?? 120, 7, { dir: o.direction });
    this.fx.sparkBurst(point, new THREE.Color(1, 0.9, 0.75), 40, 5);
    this.fx.dustPuff(base, 30, 0.7, 1.3);
    this.fx.shockwave(base, glow, o.ring ?? 2.4);
    this.fx.flash(point.clone().add(new THREE.Vector3(0, 0.5, 0)), glow, 5, 0.6);
    this.stage.shake(o.shake ?? 0.55);
    animator.bulletTime(0.16, 0.32, 0.7);
    sfx.shatter();
  }

  /** Make a piece shiver until the returned function is called. */
  private tremble(piece: Piece, amount: number): () => void {
    const origin = piece.root.position.clone();
    let alive = true;
    animator.onFrame(() => {
      if (!alive) return false;
      piece.root.position.set(origin.x + rand(-amount, amount), origin.y, origin.z + rand(-amount, amount));
    });
    return () => {
      alive = false;
      piece.root.position.copy(origin);
    };
  }

  // ---------------------------------------------------------------- special

  async promote(pawn: Piece, type: PieceSymbol): Promise<Piece> {
    const glow = TEAMS[pawn.color].glow;
    const pos = pawn.root.position.clone();
    sfx.magic(1.3, 392);
    this.fx.vortex(pos, glow, 2.6, 1.4);

    const fresh = this.view.createPiece(type, pawn.color, pawn.square); // replaces pawn in the map
    fresh.dissolve.uDissolve.value = 1.1;
    fresh.root.position.y += 0.9;

    await Promise.all([
      animator.tween(1.0, (k) => {
        pawn.dissolve.uDissolve.value = k * 1.1;
        pawn.root.position.y = pos.y + 0.5 * k;
        pawn.glow = 1.5 * k;
      }, ease.inQuad),
      animator.wait(0.5).then(() =>
        animator.tween(1.1, (k) => {
          fresh.dissolve.uDissolve.value = 1.1 * (1 - k);
          fresh.root.position.y = pos.y + 0.9 * (1 - k);
          fresh.glow = 1.8 * (1 - k);
        }, ease.outCubic),
      ),
    ]);
    pawn.dispose();
    fresh.dissolve.uDissolve.value = 0;
    fresh.glow = 0;
    this.fx.sparkBurst(pos.clone().setY(pos.y + 0.3), glow, 120, 4, { up: 0.9 });
    this.fx.shockwave(pos, glow, 2);
    this.fx.flash(pos.clone().setY(pos.y + 1.2), glow, 4, 0.8);
    sfx.thud(0.8);
    return fresh;
  }

  /** The mated king trembles, topples over and bursts apart. */
  async checkmate(king: Piece): Promise<void> {
    const winnerGlow = TEAMS[king.color === 'w' ? 'b' : 'w'].glow;
    const stop = this.tremble(king, 0.03);
    sfx.check();
    await animator.wait(0.8);
    stop();

    const pos = king.root.position.clone();
    const dir = flatDir(new THREE.Vector3(0, 0, 0), pos);
    if (dir.lengthSq() < 0.5) dir.set(1, 0, 0);
    await animator.tween(0.75, (k) => {
      const a = k * Math.PI * 0.5;
      lean(king, dir, a);
      king.root.position.y = pos.y + king.radius * Math.sin(a) * 0.9;
    }, ease.inQuad);
    sfx.thud(1.1);
    this.fx.dustPuff(pos.clone().addScaledVector(dir, king.height * 0.6), 30, 0.8, 1.2);
    this.stage.shake(0.4);
    await animator.tween(0.3, (_, raw) => {
      lean(king, dir, Math.PI * 0.5 - Math.sin(raw * Math.PI) * 0.08);
    }, ease.linear);

    king.material.emissive.copy(winnerGlow);
    king.dissolve.uEdgeColor.value.copy(winnerGlow).multiplyScalar(10);
    await animator.tween(0.6, (k) => {
      king.dissolve.uDissolve.value = 0.16 * k;
      king.glow = 0.45 * k;
    });

    this.view.pieces.delete(king.square);
    const center = pos.clone().addScaledVector(dir, king.height * 0.45).setY(layout.boardTop + king.radius);
    this.debris.shatter(king, { impact: center, radial: 3.2, lift: 4, spin: 10, shards: 34, rubble: 16, glow: winnerGlow });
    king.dispose();
    this.fx.sparkBurst(center, winnerGlow, 200, 7, { up: 0.8 });
    this.fx.shockwave(pos, winnerGlow, 4.5, 1.1);
    this.fx.flash(center.clone().setY(center.y + 1), winnerGlow, 7, 1.2);
    this.fx.dustPuff(pos, 40, 1.0, 1.6);
    this.stage.shake(1);
    animator.bulletTime(0.12, 0.7, 1.2);
    sfx.shatter();
  }

  /** Pieces rise out of magic dust, rank by rank. */
  async materialize(pieces: Piece[]): Promise<void> {
    const jobs = pieces.map((p) => {
      const delay = (p.color === 'w' ? Number(p.square[1]) - 1 : 8 - Number(p.square[1])) * 0.12 + Math.random() * 0.15;
      const y = p.root.position.y;
      p.dissolve.uDissolve.value = 1.1;
      p.root.position.y = y + 0.6;
      return animator.wait(delay).then(() => {
        this.fx.gather(p.root.position.clone().setY(y + p.height * 0.5), TEAMS[p.color].glow, 0.45, 10);
        return animator.tween(0.9, (k) => {
          p.dissolve.uDissolve.value = 1.1 * (1 - k);
          p.root.position.y = y + 0.6 * (1 - k);
          p.glow = 1.2 * (1 - k);
        }, ease.outCubic);
      }).then(() => {
        p.dissolve.uDissolve.value = 0;
        p.glow = 0;
      });
    });
    sfx.magic(1.4, 330);
    await Promise.all(jobs);
  }

  /** Every piece burns away into embers. */
  async dematerialize(pieces: Piece[]): Promise<void> {
    sfx.magic(0.9, 260);
    await Promise.all(
      pieces.map((p) =>
        animator.wait(Math.random() * 0.35).then(() =>
          animator.tween(0.75, (k) => {
            p.dissolve.uDissolve.value = 1.1 * k;
            p.root.position.y = layout.boardTop + 0.4 * k;
          }, ease.inQuad),
        ),
      ),
    );
  }
}
