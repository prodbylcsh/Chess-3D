// Builds the models of the puzzle map's worlds (public/assets/map/<module>.glb) from the
// recipes in scripts/assets/map/worlds.ts. Nothing to download: every model is made here,
// from code, so the files can be rebuilt and changed at any time (the same code always
// gives the same files; tests/map-assets.test.ts checks the committed ones are current).
//
//   node scripts/assets/build-map.ts              every module
//   node scripts/assets/build-map.ts forks pins   some
//
// Look at the result in scripts/assets/map/preview.html (open it on the dev server).
//
// One file per module. Its nodes, read by src/features/puzzles/map/World.ts:
//   big-<n>       things standing along the path (many copies); extras.weight, extras.flat
//   small-<n>     small things on the ground near the path (many copies); extras.weight, extras.flat
//   landmark-<n>  large single pieces seen far off; extras.facing (x: a profile looking along +x)
//   horizon-near, horizon-far   rings of land round the camera
// Each node's mesh has one primitive per material: body, gloss, glow, ice (kit.ts).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Document, Logger, NodeIO, type Material, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { byMaterial, triangles, type Mat, type Model } from './map/kit.ts';
import { WORLDS } from './map/worlds.ts';

export const MAP_DIR = 'public/assets/map';

/** Triangle limits: copies are drawn hundreds of times, so they must stay light (phones). */
export const BUDGET = { big: 2500, small: 500, landmark: 22000, horizon: 12000 };

function addModel(doc: Document, materials: Map<Mat, Material>, name: string, model: Model, extras?: Record<string, unknown>): Node {
  const mesh = doc.createMesh(name);
  const buffer = doc.getRoot().listBuffers()[0];
  for (const [mat, geo] of byMaterial(model)) {
    const attribute = (name: string) => doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes[name].array as Float32Array)).setBuffer(buffer);
    mesh.addPrimitive(
      doc.createPrimitive().setAttribute('POSITION', attribute('position')).setAttribute('NORMAL', attribute('normal')).setAttribute('COLOR_0', attribute('color')).setMaterial(materials.get(mat)!),
    );
  }
  const node = doc.createNode(name).setMesh(mesh);
  if (extras) node.setExtras(extras);
  return node;
}

/**
 * One module's file, and the triangles of each of its models. Throws when a model is
 * over its budget.
 */
export async function buildWorld(id: string): Promise<{ glb: Uint8Array; triangles: Record<string, number> }> {
  const world = WORLDS[id]?.();
  if (!world) throw new Error(`no world called ${id}; there are ${Object.keys(WORLDS).join(', ')}`);
  await MeshoptEncoder.ready;
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  doc.createBuffer();
  const scene = doc.createScene(id);
  const materials = new Map<Mat, Material>();
  for (const m of ['body', 'gloss', 'glow', 'ice'] as Mat[]) materials.set(m, doc.createMaterial(m).setRoughnessFactor(m === 'body' ? 0.85 : 0.25).setMetallicFactor(0));
  const counts: Record<string, number> = {};
  const add = (kind: keyof typeof BUDGET, name: string, model: Model, extras?: Record<string, unknown>) => {
    const n = Math.round(triangles(model));
    if (n > BUDGET[kind]) throw new Error(`${id}/${name}: ${n} triangles, more than the ${BUDGET[kind]} allowed for ${kind}`);
    counts[name] = n;
    scene.addChild(addModel(doc, materials, name, model, extras));
  };
  world.big.forEach((w, k) => add('big', `big-${k}`, w.model, { weight: w.weight, flat: w.flat }));
  world.small.forEach((w, k) => add('small', `small-${k}`, w.model, { weight: w.weight, flat: w.flat }));
  world.landmarks.forEach((m, k) => add('landmark', `landmark-${k}`, m, { facing: world.facing?.[k] ?? 'z' }));
  for (const [k, m] of Object.entries(world.horizon)) add('horizon', `horizon-${k}`, m);
  await doc.transform(prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  return { glb: await io.writeBinary(doc), triangles: counts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ids = process.argv.slice(2);
  mkdirSync(MAP_DIR, { recursive: true });
  for (const id of ids.length ? ids : Object.keys(WORLDS)) {
    const { glb, triangles: counts } = await buildWorld(id);
    writeFileSync(join(MAP_DIR, `${id}.glb`), glb);
    console.log(`${id}: ${(glb.length / 1024).toFixed(0)} KB, ${Object.entries(counts).map(([name, n]) => `${name} ${n}`).join(', ')}`);
  }
}
