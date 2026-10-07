import * as THREE from 'three';
import type { Color as Side } from 'chess.js';
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
import type { ChessAssets } from '../scene/assets';
import type { Stage } from '../scene/Stage';
import type { Piece } from './Piece';

const SOURCE = { roughness: 1, metalness: 0 };

/**
 * Dresses a game in the players' shop items: piece sets per side, the board,
 * the background, and which move and capture styles each side uses.
 */
export class Wardrobe {
  private looks: GameLooks = DEFAULT_LOOKS;
  private readonly board: RecolorUniforms = createRecolorUniforms();
  private readonly boardMaterials: THREE.MeshStandardMaterial[] = [];
  /** brightness of the classic textures, so recoloured items keep their detail */
  private readonly pieceRef: Record<Side, number>;

  constructor(
    private readonly stage: Stage,
    private readonly fx: Effects,
    assets: ChessAssets,
  ) {
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

  /** Board and background change at once; pieces take their set when (re)created. */
  apply(looks: GameLooks): void {
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
  }

  /** Give a freshly created piece its owner's set. */
  dress(piece: Piece): void {
    const set = pieceSetLook(this.looks.pieces[piece.color]);
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
