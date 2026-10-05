import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Color as Side, PieceSymbol } from 'chess.js';
import { MODEL_SCALE, layout } from '../core/layout';

export type PieceKey = `${Side}${PieceSymbol}`;

export interface PieceTemplate {
  object: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  height: number;
  radius: number;
}

export interface ChessAssets {
  board: THREE.Object3D;
  templates: Map<PieceKey, PieceTemplate>;
}

const TYPE_BY_NAME: Record<string, PieceSymbol> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

export async function loadAssets(
  url: string,
  maxAnisotropy: number,
  onProgress?: (fraction: number) => void,
): Promise<ChessAssets> {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => {
    if (e.lengthComputable) onProgress?.(e.loaded / e.total);
  });

  let board: THREE.Object3D | undefined;
  const sources = new Map<PieceKey, THREE.Object3D>();
  gltf.scene.traverse((o) => {
    if (o.name === 'board') board = o;
    const m = /^piece_([a-z]+)_(white|black)/.exec(o.name);
    if (!m) return;
    const key = `${m[2] === 'white' ? 'w' : 'b'}${TYPE_BY_NAME[m[1]]}` as PieceKey;
    if (!sources.has(key)) sources.set(key, o);
  });
  if (!board) throw new Error('Board mesh not found in model');

  board.removeFromParent();
  board.position.set(0, 0, 0);
  board.scale.setScalar(MODEL_SCALE);
  board.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap]) {
      if (tex) tex.anisotropy = maxAnisotropy;
    }
  });
  const boardBox = new THREE.Box3().setFromObject(board);
  layout.boardTop = boardBox.max.y;
  layout.boardHalf = boardBox.max.x;

  const templates = new Map<PieceKey, PieceTemplate>();
  for (const [key, src] of sources) {
    const object = src.clone();
    object.position.set(0, 0, 0);
    // The model has White on -z; we put White on +z, so turn every piece around
    // (keeps knights looking at the enemy).
    object.rotation.set(0, Math.PI, 0);
    object.scale.setScalar(MODEL_SCALE);
    let material: THREE.MeshStandardMaterial | undefined;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      material ??= mesh.material as THREE.MeshStandardMaterial;
      for (const tex of [material.map, material.normalMap, material.roughnessMap]) {
        if (tex) tex.anisotropy = Math.min(8, maxAnisotropy);
      }
    });
    const box = new THREE.Box3().setFromObject(object);
    templates.set(key, {
      object,
      material: material!,
      height: box.max.y,
      radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
    });
  }

  return { board, templates };
}
