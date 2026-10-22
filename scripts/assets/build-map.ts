// Builds the scenery of the puzzle map (public/assets/map/<module>.glb) from the user's
// models (their PBR pack: R2 originals bucket, folder map/; one folder per module with
// along-path/, ground/ and landmarks/) and the horizon made from code (map/horizon.ts).
//
//   node scripts/assets/r2.ts pull-originals map assets-src/map     the originals, once
//   node scripts/assets/build-map.ts assets-src/map                  every module
//   node scripts/assets/build-map.ts assets-src/map forks pins       some
//
// (.github/workflows/models.yml does both with the target `map`.) Look at the result in
// scripts/assets/map/preview.html on the dev server.
//
// The originals are too heavy to be drawn hundreds of times on a phone, so each one is
// lightened: its solid parts are simplified to a budget (their normal maps keep the
// detail), its leaf and petal cards are thinned out (fewer, slightly larger cards), its
// textures shrink to WebP, and see-through ice drops "transmission" (a second render of
// the whole scene) for plain transparency.
//
// One file per module. Its nodes, read by src/features/puzzles/map/World.ts:
//   big-<n>       things standing along the path (many copies); extras.weight, extras.flat
//   small-<n>     small things on the ground near the path (many copies); extras.weight, extras.flat
//   landmark-<n>  large single pieces beside the path; extras.facing (x: a profile looking along +x)
//   horizon-near, horizon-far   rings of land round the camera (materials body, glow)
// The user's models keep their own materials (body, gloss, glow, ice, foliage, petals).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Document, Logger, NodeIO, PropertyType, type Material, type Node, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, simplifyPrimitive, textureCompress, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { byMaterial, triangles, type Mat, type Model } from './map/horizon.ts';
import { WORLDS, type MapObject } from './map/worlds.ts';

export const MAP_DIR = 'public/assets/map';

type Kind = 'big' | 'small' | 'landmark';

/** Per object: triangles of its solid parts, of its leaf cards, and its texture size. */
const LIGHTEN: Record<Kind, { solid: number; cards: number; texture: number }> = {
  big: { solid: 1800, cards: 1400, texture: 512 },
  small: { solid: 700, cards: 600, texture: 256 },
  landmark: { solid: 14000, cards: 2000, texture: 768 },
};

/** The most triangles a model may have in the built file (tests/map-assets.test.ts). */
export const BUDGET = { big: 3400, small: 1400, landmark: 16500, horizon: 12000 };

const FOLDER: Record<Kind, string> = { big: 'along-path', small: 'ground', landmark: 'landmarks' };
const CARDS = new Set(['foliage', 'petals']);

const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const quiet = (doc: Document) => doc.setLogger(new Logger(Logger.Verbosity.WARN));
const trianglesOf = (prim: Primitive) => (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')!.getCount()) / 3;

/** Simplify a solid primitive to about `target` triangles, loosening the allowed error until it gets there. */
function simplifyTo(prim: Primitive, target: number): void {
  const start = trianglesOf(prim);
  if (start <= target) return;
  for (const error of [0.002, 0.005, 0.01, 0.02, 0.04, 0.08]) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: target / trianglesOf(prim), error });
    if (trianglesOf(prim) <= target * 1.1) return;
  }
}

/**
 * Keep one leaf card in `k` (a card is two triangles in a row), each kept card grown a little
 * round its centre so the crown stays about as full.
 */
function thinCards(doc: Document, prim: Primitive, cap: number): void {
  const indices = prim.getIndices()?.getArray();
  const count = trianglesOf(prim);
  if (!indices || count <= cap) return;
  const k = Math.ceil(count / cap);
  const grow = Math.pow(k, 0.4);
  const keep: number[] = [];
  for (let card = 0; card * 6 < indices.length; card++) if ((card * 7) % k === 0) keep.push(card);
  const position = prim.getAttribute('POSITION')!;
  for (const semantic of prim.listSemantics()) {
    const source = prim.getAttribute(semantic)!;
    const size = source.getElementSize();
    const out = new Float32Array(keep.length * 6 * size);
    const el: number[] = [];
    let o = 0;
    for (const card of keep) {
      const corners = Array.from(indices.slice(card * 6, card * 6 + 6) as ArrayLike<number>);
      const centre = [0, 0, 0];
      if (semantic === 'POSITION') for (const v of corners) position.getElement(v, el).forEach((x, i) => (centre[i] += x / 6));
      for (const v of corners) {
        source.getElement(v, el);
        for (let i = 0; i < size; i++) out[o++] = semantic === 'POSITION' ? centre[i] + (el[i] - centre[i]) * grow : el[i];
      }
    }
    prim.setAttribute(semantic, doc.createAccessor().setType(source.getType()).setArray(out).setNormalized(source.getNormalized()).setBuffer(source.getBuffer()));
  }
  prim.setIndices(null);
}

/** One of the user's models, lightened for the map. */
async function prepare(file: string, kind: Kind): Promise<{ doc: Document; before: number; after: number }> {
  const doc = quiet(await io().read(file));
  const limits = LIGHTEN[kind];
  for (const material of doc.getRoot().listMaterials()) {
    for (const ext of ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior']) material.setExtension(ext, null);
  }
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'].includes(ext.extensionName)) ext.dispose();
  }
  await doc.transform(weld());
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const isCards = (p: Primitive) => CARDS.has(p.getMaterial()?.getName() ?? '');
  const before = prims.reduce((n, p) => n + trianglesOf(p), 0);
  const solid = prims.filter((p) => !isCards(p)).reduce((n, p) => n + trianglesOf(p), 0);
  const cards = prims.filter(isCards).reduce((n, p) => n + trianglesOf(p), 0);
  for (const p of prims) {
    if (isCards(p)) thinCards(doc, p, Math.max(60, (trianglesOf(p) / cards) * limits.cards));
    else simplifyTo(p, Math.max(60, (trianglesOf(p) / solid) * limits.solid));
  }
  const after = prims.reduce((n, p) => n + trianglesOf(p), 0);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [limits.texture, limits.texture], quality: 82 }),
    prune(),
  );
  return { doc, before, after };
}

function addHorizon(doc: Document, materials: Map<Mat, Material>, name: string, model: Model): Node {
  const mesh = doc.createMesh(name);
  const buffer = doc.getRoot().listBuffers()[0];
  for (const [mat, geo] of byMaterial(model)) {
    const attribute = (a: string) => doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes[a].array as Float32Array)).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', attribute('position')).setAttribute('NORMAL', attribute('normal')).setAttribute('COLOR_0', attribute('color')).setMaterial(materials.get(mat)!));
  }
  return doc.createNode(name).setMesh(mesh);
}

/** One module's file from the originals in `folder`, and the triangles of each model. */
export async function buildWorld(id: string, folder: string): Promise<{ glb: Uint8Array; triangles: Record<string, string> }> {
  const recipe = WORLDS[id];
  if (!recipe) throw new Error(`no world called ${id}; there are ${Object.keys(WORLDS).join(', ')}`);
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const doc = quiet(new Document());
  doc.createBuffer();
  const scene = doc.createScene(id);
  const counts: Record<string, string> = {};

  const add = async (kind: Kind, name: string, object: MapObject, extras: Record<string, unknown>) => {
    const file = join(folder, id, FOLDER[kind], `${object.name}.glb`);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    const { doc: part, before, after } = await prepare(file, kind);
    if (after > BUDGET[kind]) throw new Error(`${id}/${object.name}: ${after} triangles, more than the ${BUDGET[kind]} allowed for ${kind}`);
    counts[`${name} ${object.name}`] = `${before} → ${after}`;
    const copied = mergeDocuments(doc, part);
    const partScene = part.getRoot().listScenes()[0];
    const holder = doc.createNode(name).setExtras(extras);
    for (const child of partScene.listChildren()) holder.addChild(copied.get(child) as Node);
    (copied.get(partScene) as { dispose(): void }).dispose();
    scene.addChild(holder);
  };
  for (const [k, o] of recipe.big.entries()) await add('big', `big-${k}`, o, { weight: o.weight ?? 1, flat: o.flat ?? false });
  for (const [k, o] of recipe.small.entries()) await add('small', `small-${k}`, o, { weight: o.weight ?? 1, flat: o.flat ?? false });
  for (const [k, o] of recipe.landmarks.entries()) await add('landmark', `landmark-${k}`, o, { facing: o.facing ?? 'z' });

  const materials = new Map<Mat, Material>();
  for (const m of ['body', 'glow'] as Mat[]) materials.set(m, doc.createMaterial(m).setMetallicFactor(0));
  for (const [k, model] of Object.entries(recipe.horizon())) {
    const n = Math.round(triangles(model));
    if (n > BUDGET.horizon) throw new Error(`${id}/horizon-${k}: ${n} triangles, more than the ${BUDGET.horizon} allowed`);
    counts[`horizon-${k}`] = String(n);
    scene.addChild(addHorizon(doc, materials, `horizon-${k}`, model));
  }

  await doc.transform(unpartition(), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  return { glb: await io().writeBinary(doc), triangles: counts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [folder, ...ids] = process.argv.slice(2);
  if (!folder || !existsSync(folder)) {
    console.error('usage: node scripts/assets/build-map.ts <folder of the originals> [module ...]');
    process.exit(1);
  }
  mkdirSync(MAP_DIR, { recursive: true });
  for (const id of ids.length ? ids : Object.keys(WORLDS)) {
    const { glb, triangles: counts } = await buildWorld(id, folder);
    writeFileSync(join(MAP_DIR, `${id}.glb`), glb);
    console.log(`${id}: ${(glb.length / 1024 / 1024).toFixed(1)} MB`);
    for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(32)} ${n}`);
  }
}
