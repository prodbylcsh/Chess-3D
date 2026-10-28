// Builds the Wizard Chess logo variants for social profiles (Instagram first).
// Writes SVG + 1080×1080 PNG per variant to promo/logo/, plus a preview sheet with the
// circle crop at the sizes Instagram shows it. Run: node scripts/promo/build-logo.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PIECE_PATHS } from '../../src/ui/art/pieces.ts';

// Playwright isn't a project dependency; require() also finds a global install (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const OUT = 'promo/logo';

// App palette (src/styles/global.css, LogoMark in src/ui/art/art.tsx).
const C = {
  bg: '#0a0b10',
  panel: '#141620',
  goldLight: '#f9dca8',
  gold: '#f2c27a',
  goldStrong: '#e3a858',
  goldDeep: '#c98a3c',
  ink: '#1a1308',
  violet: '#a58cff',
};

// The knight's head without the base (piece space 0..100): x 27..72, y 19..75.
const KNIGHT = PIECE_PATHS.knight[1];

/** Places the knight so its head is centred on (cx, cy) at `scale` canvas units per piece unit. */
function knight(fill: string, scale: number, cx = 500, cy = 500, extra = ''): string {
  const tx = cx - 49.5 * scale;
  const ty = cy - 47 * scale;
  return `<path transform="translate(${tx} ${ty}) scale(${scale})" fill-rule="evenodd" fill="${fill}" d="${KNIGHT}" ${extra}/>`;
}

/** Four-point sparkle centred on (x, y) with outer radius r. */
function sparkle(x: number, y: number, r: number, fill: string, extra = ''): string {
  const k = r * 0.16;
  const d = `M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`;
  return `<path d="${d}" fill="${fill}" ${extra}/>`;
}

const goldGradient = (id: string) => `
  <linearGradient id="${id}" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="${C.goldLight}"/>
    <stop offset="0.55" stop-color="${C.goldStrong}"/>
    <stop offset="1" stop-color="${C.goldDeep}"/>
  </linearGradient>`;

const nightBackground = (id: string) => `
  <radialGradient id="${id}" cx="0.5" cy="0.38" r="0.7">
    <stop offset="0" stop-color="#231d3a"/>
    <stop offset="0.55" stop-color="${C.panel}"/>
    <stop offset="1" stop-color="${C.bg}"/>
  </radialGradient>`;

const glow = (id: string, blur: number) => `
  <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="${blur}" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

const svg = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1080" height="1080"><defs>${defs}</defs>${body}</svg>\n`;

const VARIANTS: Record<string, { title: string; svg: string }> = {
  // 1. A gold knight on the app's night background, a violet spark of magic at its ear.
  'night-knight': {
    title: 'Night Knight',
    svg: svg(
      goldGradient('g') + nightBackground('bg') + glow('glow', 14) +
        `<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="${C.violet}" stop-opacity="0.28"/>
          <stop offset="1" stop-color="${C.violet}" stop-opacity="0"/>
        </radialGradient>`,
      `<rect width="1000" height="1000" fill="url(#bg)"/>
       <circle cx="500" cy="470" r="360" fill="url(#halo)"/>
       <circle cx="500" cy="500" r="462" fill="none" stroke="${C.gold}" stroke-opacity="0.35" stroke-width="5"/>
       ${knight('url(#g)', 9.6, 490, 515)}
       ${sparkle(735, 255, 62, '#ffffff', 'filter="url(#glow)"')}
       ${sparkle(735, 255, 62, C.violet, 'opacity="0.55"')}
       ${sparkle(795, 345, 22, C.gold, 'opacity="0.9"')}`,
    ),
  },
  // 2. The in-app mark made round: dark knight on a full gold medallion.
  medallion: {
    title: 'Gold Medallion',
    svg: svg(
      `<radialGradient id="m" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#fbe4b8"/>
          <stop offset="0.5" stop-color="${C.gold}"/>
          <stop offset="1" stop-color="${C.goldDeep}"/>
        </radialGradient>`,
      `<rect width="1000" height="1000" fill="url(#m)"/>
       <circle cx="500" cy="500" r="430" fill="none" stroke="${C.ink}" stroke-opacity="0.18" stroke-width="6"/>
       ${knight(C.ink, 9.4, 490, 515)}
       ${sparkle(735, 260, 56, C.ink)}
       ${sparkle(795, 345, 20, C.ink, 'opacity="0.7"')}`,
    ),
  },
  // 3. Gold knight inside a tilted violet orbit, a spell circling the piece.
  orbit: {
    title: 'Arcane Orbit',
    svg: svg(
      goldGradient('g') + nightBackground('bg') + glow('glow', 10) +
        `<linearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${C.violet}" stop-opacity="0.15"/>
          <stop offset="0.5" stop-color="${C.violet}"/>
          <stop offset="1" stop-color="#e2d8ff"/>
        </linearGradient>
        <clipPath id="front"><rect x="0" y="500" width="1000" height="500"/></clipPath>`,
      `<rect width="1000" height="1000" fill="url(#bg)"/>
       <g transform="rotate(-18 500 500)">
         <ellipse cx="500" cy="500" rx="400" ry="120" fill="none" stroke="url(#ring)" stroke-width="16" opacity="0.55"/>
       </g>
       ${knight('url(#g)', 8.6, 495, 500)}
       <g transform="rotate(-18 500 500)">
         <ellipse cx="500" cy="500" rx="400" ry="120" fill="none" stroke="url(#ring)" stroke-width="16" clip-path="url(#front)" filter="url(#glow)"/>
       </g>
       ${sparkle(855, 395, 50, '#ffffff', 'filter="url(#glow)"')}`,
    ),
  },
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });

for (const [name, v] of Object.entries(VARIANTS)) {
  writeFileSync(join(OUT, `${name}.svg`), v.svg);
  await page.setContent(`<html><body style="margin:0;background:#000">${v.svg}</body></html>`);
  await page.locator('svg').screenshot({ path: join(OUT, `${name}.png`) });
}

// Preview: each variant as Instagram crops it (circle) at profile and feed sizes, light and dark.
const rows = Object.entries(VARIANTS)
  .map(([, v]) => {
    const data = `data:image/svg+xml;base64,${Buffer.from(v.svg).toString('base64')}`;
    const crop = (px: number) => `<img src="${data}" width="${px}" height="${px}" style="border-radius:50%;display:block">`;
    const cell = (bg: string, fg: string) =>
      `<div style="background:${bg};color:${fg};padding:24px;border-radius:16px;display:flex;align-items:center;gap:24px">
         ${crop(160)}${crop(56)}${crop(32)}
         <div style="font:600 18px Inter,system-ui,sans-serif">wizardchess3d</div>
       </div>`;
    return `<div style="display:flex;align-items:center;gap:24px">
      <div style="width:180px;font:700 20px Inter,system-ui,sans-serif;color:#efeae1">${v.title}</div>
      ${cell('#ffffff', '#111')}${cell('#000000', '#f5f5f5')}
    </div>`;
  })
  .join('');
await page.setViewportSize({ width: 1240, height: 760 });
await page.setContent(`<html><body style="margin:0;padding:32px;background:#0a0b10;display:flex;flex-direction:column;gap:24px">${rows}</body></html>`);
await page.screenshot({ path: join(OUT, 'preview.png'), fullPage: true });

await browser.close();
console.log(`Wrote ${Object.keys(VARIANTS).length} variants and preview.png to ${OUT}/`);
