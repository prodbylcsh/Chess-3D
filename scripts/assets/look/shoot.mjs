// Screenshot the look page (index.html here): node scripts/assets/look/shoot.mjs <out.png> <view> <file> [file …]
// (Vite dev server on :5174; files are paths under the repository). Prints the models' bounds.
import { createRequire } from 'node:module';
const { chromium } = createRequire(`${process.cwd()}/`)('playwright');
const [out, view, ...files] = process.argv.slice(2);
const cols = process.env.COLS ?? Math.min(6, files.length);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1500), height: 1200 } });
page.on('console', (m) => m.text().startsWith('load failed') && console.log(m.text()));
await page.goto(`http://127.0.0.1:5174/scripts/assets/look/?view=${view}&cols=${cols}&w=${process.env.W ?? 1500}&fit=${process.env.FIT ?? ''}&files=${files.map(encodeURIComponent).join(',')}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 300000 });
const box = await page.evaluate(() => [document.querySelector('canvas').width, document.querySelector('canvas').height]);
await page.setViewportSize({ width: box[0], height: box[1] });
await page.screenshot({ path: out });
if (process.env.INFO) console.log(JSON.stringify(await page.evaluate(() => window.info)));
await browser.close();
