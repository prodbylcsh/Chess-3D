// The puzzle map's scenery (public/assets/map/, built by scripts/assets/build-map.ts from the
// user's models): every module has its file, with what src/features/puzzles/map/World.ts
// reads, and light enough for phones (triangles, texture sizes, file size).
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MODULES } from '#shared/puzzles.ts';
import { BUDGET, MAP_DIR } from '../scripts/assets/build-map.ts';
import { WORLDS } from '../scripts/assets/map/worlds.ts';
import { WORLD_THEMES } from '../src/features/puzzles/map/themes.ts';

const MATERIALS = ['body', 'gloss', 'glow', 'ice', 'foliage', 'petals'];

/** Triangles of a node and everything under it. */
function trianglesUnder(node: Node): number {
  let n = 0;
  node.traverse((child) => {
    for (const prim of child.getMesh()?.listPrimitives() ?? []) n += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')!.getCount()) / 3;
  });
  return n;
}

test('every puzzle module has a world, a recipe and its scenery', () => {
  for (const m of MODULES) {
    assert.ok(WORLD_THEMES[m.id], `${m.id} has no theme`);
    assert.ok(WORLDS[m.id], `${m.id} has no recipe in scripts/assets/map/worlds.ts`);
    assert.ok(readFileSync(join(MAP_DIR, `${m.id}.glb`)).length > 0, `${m.id} has no map file`);
  }
});

test('each map file has what the map reads, light enough for phones', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const [id, recipe] of Object.entries(WORLDS)) {
    const file = join(MAP_DIR, `${id}.glb`);
    assert.ok(statSync(file).size < 4 * 1024 * 1024, `${id}: the file is over 4 MB`);
    const doc = await io.read(file);
    const nodes = doc.getRoot().listScenes()[0].listChildren();
    const named = (prefix: string) => nodes.filter((n) => n.getName().startsWith(prefix));
    assert.equal(named('big-').length, recipe.big.length, `${id}: big models`);
    assert.equal(named('small-').length, recipe.small.length, `${id}: small models`);
    assert.equal(named('landmark-').length, recipe.landmarks.length, `${id}: landmarks`);
    assert.ok(named('horizon-near').length && named('horizon-far').length, `${id}: no horizon`);
    for (const [prefix, limit] of [['big-', BUDGET.big], ['small-', BUDGET.small], ['landmark-', BUDGET.landmark], ['horizon-', BUDGET.horizon]] as const) {
      for (const n of named(prefix)) assert.ok(trianglesUnder(n) <= limit, `${id}/${n.getName()}: ${trianglesUnder(n)} triangles, over ${limit}`);
    }
    for (const n of [...named('big-'), ...named('small-')]) assert.ok(Number(n.getExtras().weight) > 0, `${id}/${n.getName()}: no weight`);
    for (const material of doc.getRoot().listMaterials()) assert.ok(MATERIALS.includes(material.getName()), `${id}: unknown material ${material.getName()}`);
    for (const texture of doc.getRoot().listTextures()) {
      const [w, h] = texture.getSize() ?? [0, 0];
      assert.ok(Math.max(w, h) <= 768, `${id}: a ${w}×${h} texture`);
      assert.equal(texture.getMimeType(), 'image/webp', `${id}: a texture that isn't WebP`);
    }
  }
});
