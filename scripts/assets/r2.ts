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
//   node scripts/assets/r2.ts publish                        push-assets + cors + check that the
//                                                            site can load them (the Pages deploy
//                                                            uses R2 only when this passes)
//
// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (an R2 API token with
// Object Read & Write on these buckets) in the environment, never in the repository: as
// GitHub Actions secrets for the deploy. The public URL is VITE_ASSETS_URL in .env.production.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  GetObjectCommand,
  HeadObjectCommand,
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

/** Upload a folder; files already there with the same content are skipped. */
async function push(s3: S3Client, bucket: string, dir: string, prefix: string, cacheControl?: string) {
  let skipped = 0;
  for (const file of files(dir)) {
    const key = `${prefix}${relative(dir, file).split('\\').join('/')}`;
    if (key.endsWith('README.md')) continue;
    const body = readFileSync(file);
    const md5 = createHash('md5').update(body).digest('hex');
    const existing = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
    if (existing?.ETag?.replace(/"/g, '') === md5) {
      skipped++;
      continue;
    }
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: typeOf(file), CacheControl: cacheControl }));
    console.log(`${bucket}/${key}  ${(body.length / 1024).toFixed(0)} KB`);
  }
  if (skipped) console.log(`${skipped} unchanged`);
}

/** The bucket's public URL, from .env.production (the address the live site uses). */
function publicUrl(): string | null {
  const line = readFileSync('.env.production', 'utf8').split('\n').find((l) => l.startsWith('VITE_ASSETS_URL='));
  const url = line?.slice('VITE_ASSETS_URL='.length).trim();
  return url ? url.replace(/\/*$/, '/') : null;
}

/** Can the live site load a model from the bucket (public URL, CORS)? */
async function check(): Promise<string | null> {
  const base = publicUrl();
  if (!base) return 'VITE_ASSETS_URL is not set in .env.production';
  const key = files('public/assets').map((f) => relative('public/assets', f).split('\\').join('/')).find((k) => k.endsWith('.glb'));
  const res = await fetch(`${base}${key}`, { headers: { Origin: ORIGINS[0] } }).catch((e: Error) => e);
  if (res instanceof Error) return `${base} cannot be reached: ${res.message}`;
  if (!res.ok) return `${base}${key} answers ${res.status} (is public access on for the bucket?)`;
  if (!res.headers.get('access-control-allow-origin')) {
    return `no CORS header for ${ORIGINS[0]}: in the dashboard, R2 → ${BUCKETS.assets} → Settings → CORS policy, allow GET from ${ORIGINS.join(', ')}`;
  }
  return null;
}

async function cors(s3: S3Client): Promise<void> {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKETS.assets,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: ORIGINS, AllowedMethods: ['GET', 'HEAD'], AllowedHeaders: ['*'], MaxAgeSeconds: 86400 }] },
    }),
  );
  console.log(`CORS set on ${BUCKETS.assets} for ${ORIGINS.join(', ')}`);
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
      // folders made in the dashboard are empty objects named like the folder
      if (key.endsWith('/')) continue;
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
    await cors(s3);
    break;
  case 'publish': {
    // never fails the deploy: when R2 is not ready the site keeps serving the files itself
    let problem: string | null = null;
    try {
      await push(s3, BUCKETS.assets, 'public/assets', '', 'public, max-age=86400');
      // an Object Read & Write token may not change bucket settings; then CORS is set in the dashboard
      await cors(s3).catch((e: Error) => console.log(`CORS not changed (${e.name}); keeping the bucket's own policy`));
      problem = await check();
    } catch (e) {
      problem = (e as Error).message;
    }
    if (problem) console.log(`::warning::Shop assets stay on the site, R2 is not ready: ${problem}`);
    else console.log(`R2 ready: ${publicUrl()}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${problem ? 'false' : 'true'}\n`);
    break;
  }
  default:
    console.error('usage: node scripts/assets/r2.ts push-assets | push-originals <folder> <name> | pull-originals <name> <folder> | list [assets|originals] | cors | publish');
    process.exit(1);
}
