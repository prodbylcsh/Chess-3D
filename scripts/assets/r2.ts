// Shop item files on Cloudflare R2 (S3-compatible API). Two buckets:
//
//   wizard-chess-assets     public: what the game loads (the build output, public/assets/
//                           layout: pieces/…, boards/…, shop/…); the app reads it from
//                           VITE_ASSETS_URL (the bucket's public URL)
//   wizard-chess-originals  private: the user's original models and pictures, one folder per
//                           item group (monolith/king.glb …), so they are never lost and
//                           the build can be re-run from any machine
//
//   node scripts/assets/r2.ts push-assets                    public/assets → assets bucket
//   node scripts/assets/r2.ts push-originals <folder> <name> a folder → originals/<name>/
//   node scripts/assets/r2.ts pull-originals <name> <folder> originals/<name>/ → a folder
//   node scripts/assets/r2.ts list [assets|originals]
//   node scripts/assets/r2.ts cors                           let the site read the assets
//
// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (an R2 API token with
// Object Read & Write on these buckets) in the environment, never in the repository.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const BUCKETS = {
  assets: process.env.R2_ASSETS_BUCKET ?? 'wizard-chess-assets',
  originals: process.env.R2_ORIGINALS_BUCKET ?? 'wizard-chess-originals',
};

/** Sites allowed to load the assets (the live site and local development). */
const ORIGINS = ['https://prodbylcsh.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];

const TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
};

function client(): S3Client {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret } = process.env;
  if (!account || !key || !secret) {
    console.error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (an R2 API token).');
    process.exit(1);
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const typeOf = (path: string) => TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';

async function push(s3: S3Client, bucket: string, dir: string, prefix: string, cacheControl?: string) {
  for (const file of files(dir)) {
    const key = `${prefix}${relative(dir, file).split('\\').join('/')}`;
    if (key.endsWith('README.md')) continue;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(file), ContentType: typeOf(file), CacheControl: cacheControl }));
    console.log(`${bucket}/${key}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
}

async function list(s3: S3Client, bucket: string, prefix = ''): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents ?? []) out.push({ key: o.Key!, size: o.Size ?? 0 });
    token = page.NextContinuationToken;
  } while (token);
  return out;
}

const [command, a, b] = process.argv.slice(2);
const s3 = client();
switch (command) {
  case 'push-assets':
    // rebuilt files keep their names: browsers re-check after a day
    await push(s3, BUCKETS.assets, 'public/assets', '', 'public, max-age=86400');
    break;
  case 'push-originals':
    if (!a || !b) throw new Error('usage: push-originals <folder> <name>');
    await push(s3, BUCKETS.originals, a, `${b}/`);
    break;
  case 'pull-originals': {
    if (!a || !b) throw new Error('usage: pull-originals <name> <folder>');
    for (const { key } of await list(s3, BUCKETS.originals, `${a}/`)) {
      const object = await s3.send(new GetObjectCommand({ Bucket: BUCKETS.originals, Key: key }));
      const target = join(b, key.slice(a.length + 1));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, await object.Body!.transformToByteArray());
      console.log(target);
    }
    break;
  }
  case 'list':
    for (const o of await list(s3, BUCKETS[(a as keyof typeof BUCKETS) ?? 'assets'] ?? BUCKETS.assets)) {
      console.log(`${(o.size / 1024).toFixed(0).padStart(8)} KB  ${o.key}`);
    }
    break;
  case 'cors':
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: BUCKETS.assets,
        CORSConfiguration: { CORSRules: [{ AllowedOrigins: ORIGINS, AllowedMethods: ['GET', 'HEAD'], AllowedHeaders: ['*'], MaxAgeSeconds: 86400 }] },
      }),
    );
    console.log(`CORS set on ${BUCKETS.assets} for ${ORIGINS.join(', ')}`);
    break;
  default:
    console.error('usage: node scripts/assets/r2.ts push-assets | push-originals <folder> <name> | pull-originals <name> <folder> | list [assets|originals] | cors');
    process.exit(1);
}
