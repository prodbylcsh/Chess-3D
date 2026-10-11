// Real 3D models of shop items (public/assets/…, built by scripts/assets/build-models.ts).
// Loaded lazily, when a game or a preview needs them, and cached: each file is fetched
// and parsed once, then cloned. The files are already in board units (one square = 1),
// with the base of a piece (or the playing surface of a board) placed by the build.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Color as Side, PieceSymbol } from 'chess.js';
import type { PieceTemplate } from './assets';

export const PIECE_TYPES: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

const PIECE_FILES: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Object3D>>();

/** A file under public/, wherever the site is hosted (GitHub Pages serves it from a sub-path). */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** The model in a file; parsed once, every caller gets the same object (clone it). */
export function loadModel(path: string): Promise<THREE.Object3D> {
  let model = cache.get(path);
  if (!model) {
    model = loader.loadAsync(assetUrl(path)).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const material = mesh.material as THREE.MeshStandardMaterial;
        for (const tex of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) {
          if (tex) tex.anisotropy = 8;
        }
      });
      return gltf.scene;
    });
    model.catch(() => cache.delete(path)); // try again next time
    cache.set(path, model);
  }
  return model;
}

/**
 * File of one piece of a model set: `<dir>/<king…pawn>-<white|black>.glb`, or the
 * detailed version for close-ups (`…-hd.glb`, too heavy for 32 pieces on the board).
 */
export const pieceModelPath = (dir: string, type: PieceSymbol, side: Side, hd = false) =>
  `${dir}/${PIECE_FILES[type]}-${side === 'w' ? 'white' : 'black'}${hd ? '-hd' : ''}.glb`;

/** One side of a model set, ready for `Piece` (which clones object and material). */
export async function loadPieceTemplates(dir: string, side: Side): Promise<Map<PieceSymbol, PieceTemplate>> {
  const entries = await Promise.all(
    PIECE_TYPES.map(async (type) => [type, toTemplate(await loadModel(pieceModelPath(dir, type, side)), side)] as const),
  );
  return new Map(entries);
}

function toTemplate(source: THREE.Object3D, side: Side): PieceTemplate {
  const object = source.clone();
  // the models face -z, the way White looks; Black's pieces turn round to face White
  object.rotation.set(0, side === 'b' ? Math.PI : 0, 0);
  let material: THREE.MeshStandardMaterial | undefined;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) material ??= mesh.material as THREE.MeshStandardMaterial;
  });
  const box = new THREE.Box3().setFromObject(object);
  return {
    object,
    material: material!,
    height: box.max.y,
    radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
  };
}
