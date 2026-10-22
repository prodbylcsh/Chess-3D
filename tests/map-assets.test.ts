// The puzzle map's scenery (public/assets/map/, made by scripts/assets/build-map.ts): every
// module has its file, the committed files are what the code makes today, and each file has
// what src/features/puzzles/map/World.ts reads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MODULES } from '#shared/puzzles.ts';
import { MAP_DIR, buildWorld } from '../scripts/assets/build-map.ts';
import { WORLD_THEMES } from '../src/features/puzzles/map/themes.ts';

test('every puzzle module has a world and its scenery', () => {
  for (const m of MODULES) {
    assert.ok(WORLD_THEMES[m.id], `${m.id} has no theme`);
    assert.ok(readFileSync(join(MAP_DIR, `${m.id}.glb`)).length > 0, `${m.id} has no map file`);
  }
});

test('the committed map files are current (rebuild: node scripts/assets/build-map.ts)', async () => {
  for (const id of Object.keys(WORLD_THEMES)) {
    const { glb } = await buildWorld(id);
    const committed = readFileSync(join(MAP_DIR, `${id}.glb`));
    assert.ok(Buffer.from(glb).equals(committed), `public/assets/map/${id}.glb is out of date with scripts/assets/map/ or the theme`);
  }
});

test('each map file has what the map reads', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const id of Object.keys(WORLD_THEMES)) {
    const doc = await io.read(join(MAP_DIR, `${id}.glb`));
    const names = doc.getRoot().listScenes()[0].listChildren().map((n) => n.getName());
    for (const prefix of ['big-', 'small-', 'landmark-']) assert.ok(names.some((n) => n.startsWith(prefix)), `${id}: no ${prefix}* models`);
    assert.ok(names.includes('horizon-near') && names.includes('horizon-far'), `${id}: no horizon`);
    for (const material of doc.getRoot().listMaterials()) assert.ok(['body', 'gloss', 'glow', 'ice'].includes(material.getName()), `${id}: unknown material ${material.getName()}`);
  }
});
