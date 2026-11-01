// A missing or wrong piece of a delivered set, made at full quality from its other colour:
// same scale, geometry and texture size as the original, the lightness of non-metal parts
// inverted (hue kept), material names switched to the other colour. For the user to upload
// to the originals bucket in place of the missing file; the build's `derive` does the same
// for the game files (scripts/assets/build-models.ts).
//
//   node scripts/assets/derive-original.ts <source.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { invertLightness } from './build-models.ts';

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error('usage: node scripts/assets/derive-original.ts <source.glb> <out.glb>');
  process.exit(1);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(source);
await invertLightness(doc);
// black ↔ white in the names, English and Czech
const swap: Record<string, string> = { black: 'white', white: 'black', cerna: 'bila', bila: 'cerna', cerny: 'bily', bily: 'cerny' };
const rename = (name: string) => name.replace(/black|white|cerna|bila|cerny|bily/gi, (w) => {
  const other = swap[w.toLowerCase()];
  return w[0] === w[0].toUpperCase() ? other[0].toUpperCase() + other.slice(1) : other;
});
const root = doc.getRoot();
for (const p of [...root.listMaterials(), ...root.listMeshes(), ...root.listNodes(), ...root.listTextures()]) p.setName(rename(p.getName()));
await doc.transform(prune());
await io.write(out, doc);
console.log(out);
