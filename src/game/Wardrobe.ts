import * as THREE from 'three';
import type { Color as Side, PieceSymbol } from 'chess.js';
import { layout } from '../core/layout';
import {
  DEFAULT_LOOKS,
  backgroundLook,
  boardLook,
  destructionStyle,
  moveStyle,
  pieceSetLook,
  type DestructionStyle,
  type GameLooks,
  type MoveStyle,
  type PieceTone,
} from '../cosmetics/looks';
import type { Effects } from '../fx/effects';
import { applyRecolor, createRecolorUniforms, measureTones, type RecolorUniforms } from '../fx/recolor';
import type { ChessAssets, PieceTemplate } from '../scene/assets';
import { loadModel, loadPieceTemplates } from '../scene/models';
import type { Stage } from '../scene/Stage';
import type { Piece } from './Piece';

const SOURCE = { roughness: 1, metalness: 0 };

/**
 * Dresses a game in the players' shop items: piece sets per side, the board,
 * the background, and which move and capture styles each side uses. Items with
 * their own models are loaded when a game first uses them; until then (or if
 * loading fails) the classic set and board stand in.
 */
export class Wardrobe {
  private looks: GameLooks = DEFAULT_LOOKS;
  private readonly board: RecolorUniforms = createRecolorUniforms();
  private readonly boardMaterials: THREE.MeshStandardMaterial[] = [];
  /** brightness of the classic textures, so recoloured items keep their detail */
  private readonly pieceRef: Record<Side, number>;
  /** each side's model set, when its look has one */
  private sets: Record<Side, Map<PieceSymbol, PieceTemplate> | null> = { w: null, b: null };
  private modelBoard: THREE.Object3D | null = null;
  private readonly classicHalf: number;
  /** the latest `apply`, so an older one finishing late changes nothing */
  private generation = 0;

  constructor(
    private readonly stage: Stage,
    private readonly fx: Effects,
    private readonly assets: ChessAssets,
  ) {
    this.classicHalf = layout.boardHalf;
    assets.board.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (this.boardMaterials.includes(material)) return;
      this.boardMaterials.push(material);
      applyRecolor(material, this.board);
    });
    const boardTones = measureTones(this.boardMaterials[0]?.map ?? null, 0.2);
    this.board.uRcSplit.value.set(boardTones.dark * 2.2, boardTones.light * 0.55);
    this.board.uRcRef.value.set(boardTones.dark, boardTones.light);

    const tone = (side: Side) => measureTones(assets.templates.get(`${side}p`)?.material.map ?? null, side === 'w' ? 0.05 : 0.2);
    this.pieceRef = { w: tone('w').light, b: tone('b').dark };
    this.apply(DEFAULT_LOOKS);
  }

  get current(): GameLooks {
    return this.looks;
  }

  /**
   * Board and background change at once; pieces take their set when (re)created.
   * Resolves when the items with their own models are loaded (never rejects).
   */
  apply(looks: GameLooks): Promise<void> {
    this.looks = looks;
    const board = boardLook(looks.board).tones;
    const u = this.board;
    u.uRcOn.value = board ? 1 : 0;
    if (board) {
      u.uRcDark.value.set(board.dark);
      u.uRcLight.value.set(board.light);
      u.uRcVein.value.set(board.vein ?? board.light);
      u.uRcVeinAmount.value = board.veinAmount ?? 0;
    }
    for (const m of this.boardMaterials) m.roughness = board?.roughness ?? SOURCE.roughness;

    const bg = backgroundLook(looks.background);
    this.stage.setBackdrop(bg);
    this.fx.motes.configure(bg.motes);
    return this.loadModels(looks);
  }

  /** The model a new piece is made from: its owner's set, or the classic one. */
  template(color: Side, type: PieceSymbol): PieceTemplate | undefined {
    return this.sets[color]?.get(type) ?? this.assets.templates.get(`${color}${type}`);
  }

  private async loadModels(looks: GameLooks): Promise<void> {
    const generation = ++this.generation;
    const set = (side: Side) => {
      const dir = pieceSetLook(looks.pieces[side]).model?.dir;
      return dir ? loadPieceTemplates(dir, side).catch((err) => fallback(err, null)) : Promise.resolve(null);
    };
    const file = boardLook(looks.board).model?.file;
    const [w, b, board] = await Promise.all([
      set('w'),
      set('b'),
      file ? loadModel(file).catch((err) => fallback(err, null)) : Promise.resolve(null),
    ]);
    if (generation !== this.generation) return;
    this.sets = { w, b };
    this.showBoard(board);
  }

  /** Swap the classic board for a model board (or back, with null). */
  private showBoard(model: THREE.Object3D | null): void {
    this.modelBoard?.removeFromParent();
    this.modelBoard = model ? model.clone() : null;
    this.assets.board.visible = !this.modelBoard;
    if (!this.modelBoard) {
      layout.boardHalf = this.classicHalf;
      layout.floorY = 0;
      this.stage.setFloor(0);
      return;
    }
    const box = new THREE.Box3().setFromObject(this.modelBoard);
    // the playing surface sits exactly where the classic board's top is; the table drops
    // to the board's foot, so a board on a pedestal stands on it (nothing else moves)
    this.modelBoard.position.y = layout.boardTop - box.max.y;
    layout.boardHalf = Math.min(box.max.x, -box.min.x, box.max.z, -box.min.z);
    layout.floorY = Math.min(0, box.min.y + this.modelBoard.position.y);
    this.stage.setFloor(layout.floorY);
    this.stage.scene.add(this.modelBoard);
  }

  /** Give a freshly created piece its owner's set. */
  dress(piece: Piece): void {
    const set = pieceSetLook(this.looks.pieces[piece.color]);
    if (this.sets[piece.color]) return; // made from the set's own model: nothing to recolour
    const tone: PieceTone | null = piece.color === 'w' ? set.light : set.dark;
    const u = createRecolorUniforms();
    // one tone per piece material: the split never triggers, the reference is the source's brightness
    u.uRcSplit.value.set(-2, -1);
    u.uRcRef.value.set(this.pieceRef[piece.color], this.pieceRef[piece.color]);
    if (tone) {
      u.uRcOn.value = 1;
      u.uRcLight.value.set(tone.base);
      u.uRcDark.value.set(tone.base);
      u.uRcVein.value.set(tone.vein);
      u.uRcVeinAmount.value = tone.veinAmount;
      if (tone.glow) u.uRcGlow.value.set(tone.glow).multiplyScalar(1.6);
      piece.material.roughness = tone.roughness ?? SOURCE.roughness;
      if (tone.metalness != null) {
        piece.material.metalnessMap = null;
        piece.material.metalness = tone.metalness;
      }
    }
    piece.recolor = u;
    applyRecolor(piece.material, u);
  }

  move(side: Side): MoveStyle {
    return moveStyle(this.looks.moveAnimation[side]);
  }

  destruction(side: Side): DestructionStyle {
    return destructionStyle(this.looks.destruction[side]);
  }
}

function fallback<T>(err: unknown, value: T): T {
  console.warn('Could not load a shop item model; using the classic look.', err);
  return value;
}
