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
import { clearNodeTransform, dedup, dequantize, flatten, meshopt, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

type PieceName = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

interface PieceSetModels {
  kind: 'pieces';
  /** folder of the originals in the R2 originals bucket (.github/workflows/models.yml) */
  source: string;
  /** output folder under public/assets/pieces/ */
  dir: string;
  /** turn pieces round the vertical axis, in degrees, when they face the wrong way (the knight must look to −z) */
  turn?: Partial<Record<PieceName, number>>;
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
   * With `delivered: 'both'`: pieces whose file is missing or wrong in one colour, made from
   * the other colour's file instead, with the lightness of every non-metal part inverted
   * (hue kept: black resin with teal swirls → white resin with teal swirls; metal stays).
   */
  derive?: `${PieceName}-${'white' | 'black'}`[];
  /**
   * At most this many triangles per piece: `game` for the board (32 pieces at once),
   * `hd` for the close-up 3D preview in the shop (`<piece>-<colour>-hd.glb`).
   */
  triangles: { game: number; hd: number };
  /** texture size in pixels */
  textureSize: number;
  /** texture size of the board files (default `textureSize`); the 3D view keeps `textureSize` */
  gameTextureSize?: number;
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
  /** height of the squares in model units, when a frame stands higher (default: the model's top) */
  surface?: number;
  /** quarter turns round the vertical axis, in degrees, so that a1 (front left from White) is dark */
  turn?: number;
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
    turn: { knight: 180 },
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
  // the sets and boards of November 2026 (heights keep each designer's proportions, king 1.65
  // squares, bases at most 0.8 wide; board grids measured from top renders of the originals;
  // 512 px textures on the board: some sets have six materials with three maps each)
  'aurum-set': {
    kind: 'pieces',
    source: 'pieces/aurum',
    dir: 'aurum',
    heights: { pawn: 0.96, rook: 1.06, knight: 1.24, bishop: 1.32, queen: 1.52, king: 1.65 },
    turn: { knight: 90 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'cobalt-set': {
    // the black knight was delivered with the white knight's colours: made from it, darkened
    kind: 'pieces',
    source: 'pieces/cobalt',
    dir: 'cobalt',
    heights: { pawn: 0.86, rook: 0.96, knight: 1.19, bishop: 1.15, queen: 1.39, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    derive: ['knight-black'],
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'crystalic-set': {
    kind: 'pieces',
    source: 'pieces/crystalic',
    dir: 'crystalic',
    heights: { pawn: 0.9, rook: 0.96, knight: 1.18, bishop: 1.32, queen: 1.49, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'cut-set': {
    kind: 'pieces',
    source: 'pieces/cut',
    dir: 'cut',
    heights: { pawn: 0.49, rook: 0.87, knight: 0.97, bishop: 1.02, queen: 1.5, king: 1.65 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'cylindra-set': {
    kind: 'pieces',
    source: 'pieces/cylindra',
    dir: 'cylindra',
    heights: { pawn: 0.44, rook: 0.71, knight: 0.8, bishop: 0.89, queen: 1, king: 1.23 },
    turn: { knight: 180 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'dismorph-set': {
    kind: 'pieces',
    source: 'pieces/dismorph',
    dir: 'dismorph',
    heights: { pawn: 0.62, rook: 0.93, knight: 1.12, bishop: 1.19, queen: 1.48, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'domina-set': {
    kind: 'pieces',
    source: 'pieces/domina',
    dir: 'domina',
    heights: { pawn: 0.75, rook: 1.27, knight: 1.31, bishop: 1.45, queen: 1.45, king: 1.42 },
    turn: { knight: 180 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'dune-set': {
    kind: 'pieces',
    source: 'pieces/dune',
    dir: 'dune',
    heights: { pawn: 0.82, rook: 1.03, knight: 1.15, bishop: 1.35, queen: 1.5, king: 1.62 },
    turn: { knight: 180 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'ferro-orbis-set': {
    kind: 'pieces',
    source: 'pieces/ferro orbis',
    dir: 'ferro-orbis',
    heights: { pawn: 0.86, rook: 0.99, knight: 1.32, bishop: 1.35, queen: 1.45, king: 1.65 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'frost-glass-set': {
    // the id frost-set is retired (an old placeholder): never reuse it
    kind: 'pieces',
    source: 'pieces/frost',
    dir: 'frost-glass',
    heights: { pawn: 0.82, rook: 0.93, knight: 1.2, bishop: 1.31, queen: 1.44, king: 1.6 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'glanc-set': {
    // no white queen was delivered: made from the black one, lightened
    kind: 'pieces',
    source: 'pieces/glanc',
    dir: 'glanc',
    heights: { pawn: 1.08, rook: 1.22, knight: 1.35, bishop: 1.34, queen: 1.45, king: 1.65 },
    delivered: 'both',
    derive: ['queen-white'],
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'hallow-set': {
    // figures: every piece looks to +z as delivered
    kind: 'pieces',
    source: 'pieces/hallow',
    dir: 'hallow',
    heights: { pawn: 0.96, rook: 1.17, knight: 1.29, bishop: 1.39, queen: 1.53, king: 1.65 },
    turn: { king: 180, queen: 180, rook: 180, bishop: 180, knight: 180, pawn: 180 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'henge-set': {
    kind: 'pieces',
    source: 'pieces/henge',
    dir: 'henge',
    heights: { pawn: 1.32, rook: 0.99, knight: 1.32, bishop: 1.51, queen: 1.53, king: 1.58 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'hexa-set': {
    // every original is 2 units tall: heights set by hand from their widths
    kind: 'pieces',
    source: 'pieces/hexa',
    dir: 'hexa',
    heights: { pawn: 0.95, rook: 1.1, knight: 1.25, bishop: 1.3, queen: 1.45, king: 1.6 },
    turn: { knight: 180 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'hexalith-set': {
    kind: 'pieces',
    source: 'pieces/hexalith',
    dir: 'hexalith',
    heights: { pawn: 0.88, rook: 1, knight: 1.12, bishop: 1.4, queen: 1.47, king: 1.65 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'lithoxyl-set': {
    kind: 'pieces',
    source: 'pieces/lithoxyl',
    dir: 'lithoxyl',
    heights: { pawn: 0.96, rook: 1.01, knight: 1.11, bishop: 1.3, queen: 1.53, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'marb-set': {
    kind: 'pieces',
    source: 'pieces/marb',
    dir: 'marb',
    heights: { pawn: 1.09, rook: 1.22, knight: 1.18, bishop: 1.52, queen: 1.58, king: 1.65 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'metal-set': {
    // squat bells: the designer's proportions (the widest base fills 0.8 of a square)
    kind: 'pieces',
    source: 'pieces/metal',
    dir: 'metal',
    heights: { pawn: 0.65, rook: 0.78, knight: 0.84, bishop: 0.96, queen: 1.04, king: 1.07 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'minima-set': {
    kind: 'pieces',
    source: 'pieces/minima',
    dir: 'minima',
    heights: { pawn: 1.15, rook: 1.32, knight: 1.39, bishop: 1.48, queen: 1.55, king: 1.65 },
    turn: { knight: 90 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'phyrm-set': {
    kind: 'pieces',
    source: 'pieces/phyrm',
    dir: 'phyrm',
    heights: { pawn: 0.72, rook: 0.99, knight: 0.99, bishop: 1.01, queen: 1.35, king: 1.65 },
    turn: { knight: 90 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'roni-set': {
    kind: 'pieces',
    source: 'pieces/roni',
    dir: 'roni',
    heights: { pawn: 0.88, rook: 1.16, knight: 1.41, bishop: 1.36, queen: 1.62, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'serpentina-set': {
    kind: 'pieces',
    source: 'pieces/serpentina',
    dir: 'serpentina',
    heights: { pawn: 0.95, rook: 1.22, knight: 1.36, bishop: 1.48, queen: 1.62, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'spirl-set': {
    kind: 'pieces',
    source: 'pieces/spirl',
    dir: 'spirl',
    heights: { pawn: 1.15, rook: 1.34, knight: 1.6, bishop: 1.44, queen: 1.53, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'stoni-set': {
    kind: 'pieces',
    source: 'pieces/stoni',
    dir: 'stoni',
    heights: { pawn: 0.87, rook: 1.01, knight: 1.15, bishop: 1.32, queen: 1.49, king: 1.65 },
    turn: { knight: 90 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'teel-set': {
    kind: 'pieces',
    source: 'pieces/teel',
    dir: 'teel',
    heights: { pawn: 1.12, rook: 1.39, knight: 1.46, bishop: 1.65, queen: 1.45, king: 1.42 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'titani-set': {
    kind: 'pieces',
    source: 'pieces/titani',
    dir: 'titani',
    heights: { pawn: 0.88, rook: 1.16, knight: 1.41, bishop: 1.36, queen: 1.62, king: 1.65 },
    turn: { knight: 270 },
    delivered: 'both',
    triangles: { game: 6000, hd: 24_000 },
    textureSize: 1024,
    gameTextureSize: 512,
  },
  'argentum-board': {
    kind: 'board',
    source: 'boards',
    match: ['argentum', 'chessboard'],
    dir: 'argentum',
    grid: { x: [-0.2013, 0.2013], z: [-0.2013, 0.2013] },
    top: 0.3,
    triangles: 12_000,
    textureSize: 2048,
  },
  'azure-lagoon-board': {
    kind: 'board',
    source: 'boards',
    match: ['azure', 'lagoon'],
    dir: 'azure-lagoon',
    grid: { x: [-0.1998, 0.1998], z: [-0.1998, 0.1998] },
    top: 0.3,
    triangles: 12_000,
    textureSize: 2048,
  },
  'beton-board': {
    kind: 'board',
    source: 'boards',
    match: ['beton', 'chessboard'],
    dir: 'beton',
    grid: { x: [-0.1843, 0.1843], z: [-0.1843, 0.1843] },
    top: 0.3,
    surface: 0.0666, // the frame stands higher than the squares
    triangles: 12_000,
    textureSize: 1024, // several materials, each with its own maps
  },
  'classie-board': {
    kind: 'board',
    source: 'boards',
    match: ['classie', 'chessboard'],
    dir: 'classie',
    grid: { x: [-0.2003, 0.2003], z: [-0.2003, 0.2003] },
    top: 0.3,
    surface: 0.0593, // the frame stands higher than the squares
    triangles: 12_000,
    textureSize: 2048,
  },
  'frost-board': {
    kind: 'board',
    source: 'boards',
    match: ['frost', 'chessboard'],
    dir: 'frost',
    grid: { x: [-0.1881, 0.1881], z: [-0.1881, 0.1881] },
    top: 0.3,
    surface: 0.0208, // the frame stands higher than the squares
    turn: 90, // a1 must be dark
    triangles: 12_000,
    textureSize: 2048,
  },
  'gappa-board': {
    kind: 'board',
    source: 'boards',
    match: ['gappa', 'chessboard'],
    dir: 'gappa',
    grid: { x: [-0.1841, 0.1841], z: [-0.1841, 0.1841] },
    top: 0.3,
    triangles: 12_000,
    textureSize: 2048,
  },
  'greel-board': {
    kind: 'board',
    source: 'boards',
    match: ['greel', 'chessboard'],
    dir: 'greel',
    grid: { x: [-0.1591, 0.1591], z: [-0.1591, 0.1591] },
    top: 0.3,
    triangles: 12_000,
    textureSize: 2048,
  },
  'legoed-board': {
    kind: 'board',
    source: 'boards',
    match: ['legoed', 'chessboard'],
    dir: 'legoed',
    grid: { x: [-0.18, 0.18], z: [-0.18, 0.18] },
    top: 0.3,
    surface: 0.035, // the frame stands higher than the squares
    triangles: 20_000,
    textureSize: 1024, // several materials, each with its own maps
  },
  'maple-board': {
    kind: 'board',
    source: 'boards',
    match: ['maple', 'chessboard'],
    dir: 'maple',
    grid: { x: [-0.1994, 0.1994], z: [-0.1994, 0.1994] },
    top: 0.3,
    triangles: 12_000,
    textureSize: 2048,
  },
  'mozaic-board': {
    kind: 'board',
    source: 'boards',
    match: ['mozaic', 'chessboard'],
    dir: 'mozaic',
    grid: { x: [-0.1989, 0.1989], z: [-0.1989, 0.1989] },
    top: 0.3,
    triangles: 20_000,
    textureSize: 2048,
  },
  'zlata-board': {
    kind: 'board',
    source: 'boards',
    match: ['zlata', 'chessboard'],
    dir: 'zlata',
    grid: { x: [-0.1927, 0.1927], z: [-0.1927, 0.1927] },
    top: 0.3,
    surface: 0.0135, // the frame stands higher than the squares
    triangles: 12_000,
    textureSize: 2048,
  },
};

const PIECES: PieceName[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const OUT = 'public/assets';

let io: NodeIO;


async function main(itemId: string, sourceDir: string) {
  const config = MODELS[itemId];
  if (!config || !sourceDir) {
    console.error(`usage: node scripts/assets/build-models.ts <${Object.keys(MODELS).join('|')}> <folder with the original .glb files>`);
    process.exit(1);
  }

  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  // the decoder too: originals (or the inspect previews, for a quick local try) may come compressed
  io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

  if (config.kind === 'pieces') {
    const out = join(OUT, 'pieces', config.dir);
    mkdirSync(out, { recursive: true });
    for (const piece of PIECES) {
      for (const [lod, suffix] of [['game', ''], ['hd', '-hd']] as const) {
        const triangles = config.triangles[lod];
        const size = lod === 'game' ? (config.gameTextureSize ?? config.textureSize) : config.textureSize;
        const place = (doc: Document) => fitPiece(doc, config.heights[piece], config.turn?.[piece] ?? 0);
        if (config.delivered === 'both') {
          for (const colour of ['white', 'black'] as const) {
            const derived = config.derive?.includes(`${piece}-${colour}`);
            const doc = await prepare(find(sourceDir, [piece, derived ? (colour === 'white' ? 'black' : 'white') : colour]), place, triangles);
            if (derived) await invertLightness(doc, config.textureSize);
            await write(size, doc, join(out, `${piece}-${colour}${suffix}.glb`));
          }
          continue;
        }
        const src = find(sourceDir, [piece]);
        const other = config.delivered === 'black' ? 'white' : 'black';
        await write(size, await prepare(src, place, triangles), join(out, `${piece}-${config.delivered}${suffix}.glb`));
        const recoloured = await prepare(src, place, triangles);
        await recolor(recoloured, config.recolor!, config.textureSize);
        await write(size, recoloured, join(out, `${piece}-${other}${suffix}.glb`));
      }
    }
  } else {
    const out = join(OUT, 'boards', config.dir);
    mkdirSync(out, { recursive: true });
    const src = find(sourceDir, config.match ?? ['chessboard']);
    await write(config.textureSize, await prepare(src, (doc) => fitBoard(doc, config), config.triangles), join(out, 'board.glb'));
  }
}

/**
 * Words in the originals' file names, by meaning: the user names files in English or Czech
 * (`kral_bila.glb`, `Rez_Dama_cerny.glb`, `hexa_king_white.glb`).
 */
const SYNONYMS: Record<string, string[]> = {
  king: ['king', 'kral'],
  queen: ['queen', 'dama'],
  rook: ['rook', 'vez'],
  bishop: ['bishop', 'strelec'],
  knight: ['knight', 'jezdec'],
  pawn: ['pawn', 'pesec'],
  white: ['white', 'bily', 'bila', 'bile'],
  black: ['black', 'cerny', 'cerna', 'cerne'],
};

/** The one .glb in the folder (or below it) whose name has all these words (whole words, any synonym). */
function find(dir: string, words: string[]): string {
  const all = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? all(join(d, n)) : [join(d, n)]));
  const tokens = (f: string) => basename(f).toLowerCase().replace(/\.glb$/, '').split(/[^a-z0-9]+/);
  const has = (f: string, word: string) => (SYNONYMS[word] ?? [word]).some((w) => tokens(f).includes(w));
  const hits = all(dir).filter((f) => f.toLowerCase().endsWith('.glb') && words.every((w) => has(f, w)));
  if (hits.length !== 1) throw new Error(`${dir}: ${hits.length} files named with ${words.join(' + ')}${hits.length ? `: ${hits.join(', ')}` : ''}`);
  return hits[0];
}

/** Read a model, place it, simplify it. Textures are resized when written. */
async function prepare(file: string, place: (doc: Document) => void, maxTriangles: number): Promise<Document> {
  const doc = await io.read(file);
  // plain float vertices (a quantized input would lose its normals when transformed), and
  // node transforms into the meshes, so the bounds `place` measures are what gets baked
  await doc.transform(dequantize(), flatten());
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) clearNodeTransform(node);
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

/** Base centred at the origin on y = 0, `height` board squares tall, turned by `degrees`. */
function fitPiece(doc: Document, height: number, degrees = 0): void {
  const scene = doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const s = height / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const n = Math.sin(a);
  // centre and scale, then turn about y (column-major)
  bake(doc, [s * c, 0, -s * n, 0, 0, s, 0, 0, s * n, 0, s * c, 0, s * (-c * cx - n * cz), -b.min[1] * s, s * (n * cx - c * cz), 1]);
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
  const surface = cfg.surface ?? b.max[1];
  const a = ((cfg.turn ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const n = Math.sin(a);
  // scale and centre, then turn about y (column-major)
  bake(doc, [c * sx, 0, -n * sx, 0, 0, sy, 0, 0, n * sz, 0, c * sz, 0, c * -cx * sx + n * -cz * sz, cfg.top - surface * sy, -n * -cx * sx + c * -cz * sz, 1]);
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

/**
 * The other colour of a piece (`derive`): lightness of non-metal parts inverted, hue kept.
 * Without `size` textures keep their own size and format (a full-quality original,
 * scripts/assets/derive-original.ts).
 */
export async function invertLightness(doc: Document, size?: number): Promise<void> {
  const flip = (r: number, g: number, b: number): [number, number, number] => {
    // HSL: L → 1 − L keeps hue and saturation
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const l2 = 1 - l;
    if (d === 0) return [l2, l2, l2];
    const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
    const q = l2 < 0.5 ? l2 * (1 + sat) : l2 + sat - l2 * sat;
    const p = 2 * l2 - q;
    const hue = (t: number) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  };
  const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const metal = new Set(doc.getRoot().listMaterials().filter((m) => m.getMetallicFactor() >= 0.5));
  for (const material of doc.getRoot().listMaterials()) {
    if (metal.has(material)) continue;
    const base = material.getBaseColorTexture();
    if (base) {
      const own = await sharp(Buffer.from(base.getImage()!)).metadata();
      const [width, height] = size ? [size, size] : [own.width!, own.height!];
      const rgb = await raw(base, width, height);
      for (let i = 0; i < rgb.length; i += 3) {
        const c = flip(rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255);
        for (let k = 0; k < 3; k++) rgb[i + k] = Math.round(c[k] * 255);
      }
      const image = sharp(rgb, { raw: { width, height, channels: 3 } });
      const jpeg = !size && base.getMimeType() === 'image/jpeg';
      const data = jpeg ? await image.jpeg({ quality: 95 }).toBuffer() : await image.png().toBuffer();
      material.setBaseColorTexture(
        doc.createTexture(`${base.getName() || 'base'}-inverted`).setImage(data).setMimeType(jpeg ? 'image/jpeg' : 'image/png'),
      );
    } else {
      const [r, g, b, a] = material.getBaseColorFactor();
      const usesVertexColour = doc
        .getRoot()
        .listMeshes()
        .some((m) => m.listPrimitives().some((p) => p.getMaterial() === material && p.getAttribute('COLOR_0')));
      // a white factor multiplies vertex colours: those are flipped below instead
      if (!usesVertexColour) material.setBaseColorFactor([...flip(toSrgb(r), toSrgb(g), toSrgb(b)).map(toLinear), a] as [number, number, number, number]);
    }
  }
  // vertex colours (linear) of non-metal parts
  const done = new Set<unknown>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const colours = prim.getAttribute('COLOR_0');
      if (!colours || done.has(colours) || (prim.getMaterial() && metal.has(prim.getMaterial()!))) continue;
      done.add(colours);
      const v: number[] = [];
      for (let i = 0; i < colours.getCount(); i++) {
        colours.getElement(i, v);
        const c = flip(toSrgb(v[0]), toSrgb(v[1]), toSrgb(v[2])).map(toLinear);
        colours.setElement(i, v.length === 4 ? [...c, v[3]] : c);
      }
    }
  }
  await doc.transform(prune());
}

async function raw(texture: Texture, width: number, height = width): Promise<Buffer> {
  return sharp(Buffer.from(texture.getImage()!)).resize(width, height).removeAlpha().raw().toBuffer();
}

async function write(size: number, doc: Document, file: string): Promise<void> {
  // authoring metadata (`extras`, e.g. a modeller's original_components) is not for the game:
  // in Minima and Spirl it outweighed the geometry ten times
  const root = doc.getRoot();
  for (const property of [root, ...root.listScenes(), ...root.listNodes(), ...root.listMeshes(), ...root.listMeshes().flatMap((m) => m.listPrimitives()), ...root.listMaterials(), ...root.listTextures(), ...root.listAccessors()]) {
    property.setExtras({});
  }
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

// run as a script (the models workflow only imports MODELS)
if (process.argv[1]?.endsWith('build-models.ts')) await main(process.argv[2], process.argv[3]);
