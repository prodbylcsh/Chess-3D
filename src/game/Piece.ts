import * as THREE from 'three';
import type { Color as Side, PieceSymbol, Square } from 'chess.js';
import { TEAMS, squareCenter } from '../core/layout';
import type { PieceTemplate } from '../scene/assets';
import { applyDissolve, createDissolveDepthMaterial, createDissolveUniforms, type DissolveUniforms } from '../fx/dissolve';
import type { RecolorUniforms } from '../fx/recolor';

let nextId = 1;

/**
 * A chess piece in the scene. `root` is a pivot at the piece's base, so tilting
 * it makes the piece lean like it is walking; `model` holds the scaled mesh.
 */
export class Piece {
  readonly id = nextId++;
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly material: THREE.MeshStandardMaterial;
  readonly dissolve: DissolveUniforms;
  readonly height: number;
  readonly radius: number;
  readonly meshes: THREE.Mesh[] = [];
  /** set by the Wardrobe: the piece set's recolouring (debris reuses it) */
  recolor: RecolorUniforms | null = null;
  private readonly depthMaterial: THREE.MeshDepthMaterial;

  constructor(
    readonly type: PieceSymbol,
    readonly color: Side,
    public square: Square,
    template: PieceTemplate,
  ) {
    this.model = template.object.clone();
    this.height = template.height;
    this.radius = template.radius;

    // Per-piece material so glow and dissolve can be animated individually.
    // Textures are shared, so this is cheap.
    this.material = template.material.clone();
    this.material.emissive.copy(TEAMS[color].glow);
    this.material.emissiveIntensity = 0;
    this.dissolve = createDissolveUniforms(55);
    this.dissolve.uEdgeColor.value.copy(TEAMS[color].glow).multiplyScalar(6);
    applyDissolve(this.material, this.dissolve);
    this.depthMaterial = createDissolveDepthMaterial(this.dissolve);

    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = this.material;
      mesh.customDepthMaterial = this.depthMaterial;
      mesh.userData.piece = this;
      this.meshes.push(mesh);
    });

    this.root.add(this.model);
    this.root.name = `${color}${type}-${this.id}`;
    squareCenter(square, this.root.position);
  }

  set glow(v: number) {
    this.material.emissiveIntensity = v;
  }

  get glow(): number {
    return this.material.emissiveIntensity;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.material.dispose();
    this.depthMaterial.dispose();
  }
}
