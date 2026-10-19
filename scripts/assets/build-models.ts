// Turns the original 3D models of a shop item into the web-ready files the game loads
// (public/assets/…). The originals are large (4K textures, ~50k vertices per piece) and
// stay out of git: keep them in assets-src/<item>/ (ignored) or anywhere else.
//
//   node scripts/assets/build-models.ts monolith-set   assets-src/monolith
//   node scripts/assets/build-models.ts monolith-board assets-src/monolith
//
// What it does, per model: puts the base at y = 0 and centres it, scales it to its size
// on the board (one board square = one unit), simplifies the mesh, shrinks the textures
// to WebP and compresses the geometry (EXT_meshopt_compression; the app's loader decodes
// it). Piece sets also get their White version (see `recolor` in MODELS).
//
// The settings for every item live in MODELS below; adding an item = adding an entry.

import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Document, NodeIO, getBounds, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

type PieceName = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

interface PieceSetModels {
  kind: 'pieces';
  /** folder of the originals in the R2 originals bucket (.github/workflows/models.yml) */
  source: string;
  /** output folder under public/assets/pieces/ */
  dir: string;
  /** height of each piece in board squares (the classic set: pawn 0.93 … king 1.64) */
  heights: Record<PieceName, number>;
  /**
   * the colour of the delivered models; the other one is made by `recolor`. `both`: every
   * piece comes in both colours (files named …<piece>…<white|black>…), nothing is recoloured
   */
  delivered: 'black' | 'white' | 'both';
  /**
   * How the other colour is made: the parts that are not metal (metallicRoughness
   * texture, blue channel) turn into `tone`, keeping their detail inverted (dark veins
   * on a light body); metal parts (chrome) stay as they are.
   */
  recolor?: { tone: [number, number, number]; contrast: number };
  /**
   * At most this many triangles per piece: `game` for the board (32 pieces at once),
   * `hd` for the close-up 3D preview in the shop (`<piece>-<colour>-hd.glb`).
   */
  triangles: { game: number; hd: number };
  /** texture size in pixels */
  textureSize: number;
}

interface BoardModels {
  kind: 'board';
  /** folder of the originals in the R2 originals bucket (.github/workflows/models.yml) */
  source: string;
  dir: string;
  /** words in the file's name, when the folder holds more than this board */
  match?: string[];
  /** the 8×8 playing grid inside the model, in model units (measured from a top view) */
  grid: { x: [number, number]; z: [number, number] };
  /** where the playing surface ends up (the classic board's top, `layout.boardTop`) */
  top: number;
  triangles: number;
  textureSize: number;
}

export const MODELS: Record<string, PieceSetModels | BoardModels> = {
  'monolith-set': {
    kind: 'pieces',
    source: 'pieces/monolith',
    dir: 'monolith',
    heights: { pawn: 1.1, rook: 1.25, knight: 1.35, bishop: 1.5, queen: 1.65, king: 1.75 },
    delivered: 'black',
    recolor: { tone: [0.93, 0.91, 0.87], contrast: 1.6 },
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
  },
  'squircle-set': {
    kind: 'pieces',
    source: 'pieces/squircle',
    dir: 'squircle',
    // broad pieces (half as wide as tall): a little shorter than Monolith so they fit their squares
    heights: { pawn: 0.95, rook: 1.1, knight: 1.2, bishop: 1.32, queen: 1.45, king: 1.55 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
  },
  'monolith-board': {
    kind: 'board',
    source: 'boards',
    match: ['monolith', 'chessboard'],
    dir: 'monolith',
    grid: { x: [-0.915, 0.914], z: [-0.645, 0.646] },
    top: 0.3,
    triangles: 12_000,
    textureSize: 2048,
  },
};

const PIECES: PieceName[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const OUT = 'public/assets';

let io: NodeIO;

// run as a script (the models workflow only imports MODELS)
if (process.argv[1]?.endsWith('build-models.ts')) await main(process.argv[2], process.argv[3]);

async function main(itemId: string, sourceDir: string) {
  const config = MODELS[itemId];
  if (!config || !sourceDir) {
    console.error(`usage: node scripts/assets/build-models.ts <${Object.keys(MODELS).join('|')}> <folder with the original .glb files>`);
    process.exit(1);
  }

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  if (config.kind === 'pieces') {
    const out = join(OUT, 'pieces', config.dir);
    mkdirSync(out, { recursive: true });
    for (const piece of PIECES) {
      for (const [lod, suffix] of [['game', ''], ['hd', '-hd']] as const) {
        const triangles = config.triangles[lod];
        const place = (doc: Document) => fitPiece(doc, config.heights[piece]);
        if (config.delivered === 'both') {
          for (const colour of ['white', 'black'] as const) {
            await write(config.textureSize, await prepare(find(sourceDir, [piece, colour]), place, triangles), join(out, `${piece}-${colour}${suffix}.glb`));
          }
          continue;
        }
        const src = find(sourceDir, [piece]);
        const other = config.delivered === 'black' ? 'white' : 'black';
        await write(config.textureSize, await prepare(src, place, triangles), join(out, `${piece}-${config.delivered}${suffix}.glb`));
        const recoloured = await prepare(src, place, triangles);
        await recolor(recoloured, config.recolor!, config.textureSize);
        await write(config.textureSize, recoloured, join(out, `${piece}-${other}${suffix}.glb`));
      }
    }
  } else {
    const out = join(OUT, 'boards', config.dir);
    mkdirSync(out, { recursive: true });
    const src = find(sourceDir, config.match ?? ['chessboard']);
    await write(config.textureSize, await prepare(src, (doc) => fitBoard(doc, config), config.triangles), join(out, 'board.glb'));
  }
}

/** The one .glb in the folder (or below it) whose name has all these words. */
function find(dir: string, words: string[]): string {
  const all = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? all(join(d, n)) : [join(d, n)]));
  const hits = all(dir).filter((f) => f.toLowerCase().endsWith('.glb') && words.every((w) => basename(f).toLowerCase().includes(w)));
  if (hits.length !== 1) throw new Error(`${dir}: ${hits.length} files named with ${words.join(' + ')}${hits.length ? `: ${hits.join(', ')}` : ''}`);
  return hits[0];
}

/** Read a model, place it, simplify it. Textures are resized when written. */
async function prepare(file: string, place: (doc: Document) => void, maxTriangles: number): Promise<Document> {
  const doc = await io.read(file);
  place(doc);
  await doc.transform(weld());
  const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  await doc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, maxTriangles / triangles), error: 0.01, lockBorder: false }),
    dedup(),
    prune(),
  );
  return doc;
}

/** Base centred at the origin on y = 0, `height` board squares tall. */
function fitPiece(doc: Document, height: number): void {
  const scene = doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const s = height / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  bake(doc, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -cx * s, -b.min[1] * s, -cz * s, 1]);
}

/** The playing grid becomes exactly 8×8 units around the origin, its surface at `top`. */
function fitBoard(doc: Document, cfg: BoardModels): void {
  const scene = doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const sx = 8 / (cfg.grid.x[1] - cfg.grid.x[0]);
  const sz = 8 / (cfg.grid.z[1] - cfg.grid.z[0]);
  const sy = sx; // thickness follows the width
  const cx = (cfg.grid.x[0] + cfg.grid.x[1]) / 2;
  const cz = (cfg.grid.z[0] + cfg.grid.z[1]) / 2;
  bake(doc, [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, -cx * sx, cfg.top - b.max[1] * sy, -cz * sz, 1]);
}

/** Apply a column-major 4×4 matrix to every mesh and clear the node transforms. */
function bake(doc: Document, matrix: number[]): void {
  for (const node of doc.getRoot().listNodes()) {
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, matrix as Parameters<typeof transformMesh>[1]);
  }
}

/** The other colour: non-metal parts become `tone` with their detail inverted; metal stays. */
async function recolor(doc: Document, cfg: PieceSetModels['recolor'], size: number): Promise<void> {
  for (const material of doc.getRoot().listMaterials()) {
    const base = material.getBaseColorTexture();
    const mr = material.getMetallicRoughnessTexture();
    if (!base) continue;
    const rgb = await raw(base, size);
    const metal = mr ? await raw(mr, size) : null;
    const outPixels = Buffer.alloc(size * size * 3);
    for (let i = 0; i < size * size; i++) {
      const r = rgb[i * 3] / 255;
      const g = rgb[i * 3 + 1] / 255;
      const bl = rgb[i * 3 + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      // chrome is metal = 1 in the blue channel; blend across the seams
      const m = metal ? metal[i * 3 + 2] / 255 : 0;
      const t = Math.min(1, Math.max(0, (m - 0.3) / 0.4));
      const keepMetal = t * t * (3 - 2 * t);
      const shade = Math.max(0, 1 - cfg.contrast * lum);
      const c = [r, g, bl].map((v, k) => (cfg.tone[k] * shade) * (1 - keepMetal) + v * keepMetal);
      for (let k = 0; k < 3; k++) outPixels[i * 3 + k] = Math.round(Math.min(1, c[k]) * 255);
    }
    const png = await sharp(outPixels, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
    // a new texture, so the other slots (and the delivered colour) are untouched
    const light = doc.createTexture(`${base.getName() || 'base'}-recolored`).setImage(png).setMimeType('image/png');
    material.setBaseColorTexture(light);
  }
  await doc.transform(prune());
}

async function raw(texture: Texture, size: number): Promise<Buffer> {
  return sharp(Buffer.from(texture.getImage()!)).resize(size, size).removeAlpha().raw().toBuffer();
}

async function write(size: number, doc: Document, file: string): Promise<void> {
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 88 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(file, doc);
  const vertices = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getAttribute('POSITION')?.getCount() ?? 0), 0);
  const triangles = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KB  ${vertices} vertices  ${triangles} triangles`);
}
