// What the user's original models are like, before an item's build settings are written
// (scripts/assets/build-models.ts): per .glb file its size, meshes, triangles, bounds,
// materials and textures. The workflow .github/workflows/models.yml runs it on a folder
// pulled from the originals bucket and commits the report, so a session without access to
// Cloudflare can read it.
//
//   node scripts/assets/inspect.ts <folder> [report.json]
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [folder, out] = process.argv.slice(2);
if (!folder) {
  console.error('usage: node scripts/assets/inspect.ts <folder> [report.json]');
  process.exit(1);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const report = [];
for (const file of walk(folder)) {
  const entry: Record<string, unknown> = { file: relative(folder, file), kb: Math.round(statSync(file).size / 1024) };
  if (!file.toLowerCase().endsWith('.glb')) {
    report.push(entry);
    continue;
  }
  const doc = await io.read(file);
  const root = doc.getRoot();
  const prims = root.listMeshes().flatMap((m) => m.listPrimitives());
  const b = getBounds(root.listScenes()[0]);
  const round = (v: number[]) => v.map((x) => Math.round(x * 1000) / 1000);
  entry.nodes = root.listNodes().map((n) => n.getName());
  entry.meshes = root.listMeshes().length;
  entry.triangles = prims.reduce((n, p) => n + (p.getIndices()?.getCount() ?? (p.getAttribute('POSITION')?.getCount() ?? 0)) / 3, 0);
  entry.vertices = prims.reduce((n, p) => n + (p.getAttribute('POSITION')?.getCount() ?? 0), 0);
  entry.bounds = { min: round(b.min), max: round(b.max), size: round(b.max.map((v, i) => v - b.min[i])) };
  entry.materials = await Promise.all(
    root.listMaterials().map(async (m) => {
      const tex = async (t: ReturnType<typeof m.getBaseColorTexture>) => {
        if (!t?.getImage()) return null;
        const meta = await sharp(Buffer.from(t.getImage()!)).metadata();
        return `${meta.width}x${meta.height} ${t.getMimeType()}`;
      };
      return {
        name: m.getName(),
        color: round(m.getBaseColorFactor()),
        metallic: m.getMetallicFactor(),
        roughness: m.getRoughnessFactor(),
        base: await tex(m.getBaseColorTexture()),
        metallicRoughness: await tex(m.getMetallicRoughnessTexture()),
        normal: await tex(m.getNormalTexture()),
      };
    }),
  );
  report.push(entry);
}

const json = JSON.stringify(report, null, 2);
if (out) writeFileSync(out, json + '\n');
console.log(json);
