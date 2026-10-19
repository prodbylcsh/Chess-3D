// Screenshot the card page into public/assets/shop/<item-id>.webp (16:10, ≤ 50 KB).
//   node scripts/assets/card/shoot.mjs <item-id> pieces/<set>   (Vite dev server on :5174)
import { createRequire } from 'node:module';
import sharp from 'sharp';
// Playwright is not a dependency of the app: the one the browser checks use (verify-in-browser skill)
const { chromium } = createRequire(`${process.cwd()}/`)('playwright');
const [id, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:5174/scripts/assets/card/?dir=${dir}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 240000 });
const png = await page.locator('canvas').screenshot();
await browser.close();
let quality = 82;
let out;
do {
  out = await sharp(png).resize(800, 500).webp({ quality }).toBuffer();
  quality -= 6;
} while (out.length > 50 * 1024 && quality > 30);
await sharp(out).toFile(`public/assets/shop/${id}.webp`);
console.log(`public/assets/shop/${id}.webp ${(out.length / 1024).toFixed(0)} KB`);
