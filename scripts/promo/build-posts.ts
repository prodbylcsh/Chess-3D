// Builds the Instagram carousel posts (scripts/promo/posts.ts) as 1080×1440 slides, following
// docs/marketing/INSTAGRAM-DESIGN.md: promo/instagram/posts/<post>/NN.jpg with caption.md,
// a zip per post in promo/instagram/zips/ (not committed) and grid-preview.jpg (the
// profile's first two rows as they look after posting all six).
//
// Uses the 3D shots in promo/instagram/renders/ (scripts/promo/render-scenes.ts) and
// Playwright (not a project dependency; NODE_PATH may point at an install):
//   node scripts/promo/build-posts.ts [--only 01,04]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import { PIECE_PATHS, type PieceId } from '../../src/ui/art/pieces.ts';
import { TIERS } from '../../supabase/functions/_shared/rating.ts';
import { POSTING_ORDER, POSTS, type Slide, type Visual } from './posts.ts';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const ROOT = 'promo/instagram';
const RENDERS = join(ROOT, 'renders');
const W = 1080;
const H = 1440;
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > 0 ? process.argv[i + 1].split(',') : null;
})();

const fileUrl = (path: string) => pathToFileURL(resolve(path)).href;
const render = (name: string) => {
  const path = join(RENDERS, `${name}.jpg`);
  if (!existsSync(path)) throw new Error(`missing render ${path} (run scripts/promo/render-scenes.ts)`);
  return fileUrl(path);
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ brand pieces

const GOLD_STOPS = '<stop offset="0" stop-color="#f9dca8"/><stop offset="0.55" stop-color="#e3a858"/><stop offset="1" stop-color="#c98a3c"/>';

/** The Night Knight tile (LogoMark in src/ui/art/art.tsx). */
function logo(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><defs>
    <radialGradient id="lb" cx="0.5" cy="0.38" r="0.7"><stop offset="0" stop-color="#2a2245"/><stop offset="0.6" stop-color="#141620"/><stop offset="1" stop-color="#0a0b10"/></radialGradient>
    <linearGradient id="lg" x1="0.2" y1="0" x2="0.8" y2="1">${GOLD_STOPS}</linearGradient></defs>
    <rect x="4" y="4" width="92" height="92" rx="26" fill="url(#lb)"/>
    <rect x="4.75" y="4.75" width="90.5" height="90.5" rx="25.25" fill="none" stroke="#f2c27a" stroke-opacity="0.5" stroke-width="1.5"/>
    <path transform="translate(-1.5 5)" fill-rule="evenodd" fill="url(#lg)" d="${PIECE_PATHS.knight[1]}"/>
    <path d="M75 18 Q76.3 24.7 83 26 Q76.3 27.3 75 34 Q73.7 27.3 67 26 Q73.7 24.7 75 18 Z" fill="#d9ceff"/></svg>`;
}

/** The four-point spark from the logo, the series' only bullet. */
const spark = (size: number, fill = '#f2c27a') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20"><path d="M10 0 Q11.6 8.4 20 10 Q11.6 11.6 10 20 Q8.4 11.6 0 10 Q8.4 8.4 10 0 Z" fill="${fill}"/></svg>`;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
let uid = 0;

/** A rank crest, the same drawing as RankEmblem in src/ui/art/art.tsx. */
function emblem(tierId: string, division: number | undefined, size: number): string {
  const t = TIERS.find((x) => x.id === tierId)!;
  const id = `e${uid++}`;
  const apex = !t.divisions;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="filter:drop-shadow(0 0 ${size / 9}px ${t.color}55)"><defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(t.color, 0.35)}"/><stop offset="0.55" stop-color="${t.color}"/><stop offset="1" stop-color="${shade(t.color, -0.55)}"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(t.color, -0.62)}"/><stop offset="1" stop-color="${shade(t.color, -0.82)}"/></linearGradient></defs>
    ${apex ? `<path d="M30 22 L36 6 L44 16 L50 2 L56 16 L64 6 L70 22 Z" fill="url(#${id}a)" stroke="rgba(0,0,0,.35)" stroke-width="1"/>` : ''}
    <path d="M50 14 L86 28 L82 68 L50 96 L18 68 L14 28 Z" fill="url(#${id}a)"/>
    <path d="M50 22 L78 33 L75 64 L50 86 L25 64 L22 33 Z" fill="url(#${id}b)"/>
    <path d="M50 22 L78 33 L75 64 L50 86 L25 64 L22 33 Z" fill="none" stroke="${shade(t.color, 0.2)}" stroke-opacity="0.6" stroke-width="1.5"/>
    ${division
      ? `<text x="50" y="63" text-anchor="middle" font-family="Cinzel" font-weight="700" font-size="${division === 3 ? 22 : 25}" fill="${shade(t.color, 0.3)}">${ROMAN[division]}</text>`
      : `<g transform="translate(31 31) scale(0.38)"><path fill-rule="evenodd" fill="${shade(t.color, 0.3)}" d="${PIECE_PATHS.king.join(' ')}"/></g>`}
  </svg>`;
}

const PIECE_IDS: Record<string, PieceId> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

/** A flat 2D diagram (our own glyphs) with optional arrows and marked squares. */
function board(fen: string, opts: { arrows?: [string, string][]; marks?: string[]; flat?: boolean }, size: number): string {
  const sq = size / 8;
  const light = opts.flat ? '#d6d3cc' : '#d9ccb4';
  const dark = opts.flat ? '#8f8b84' : '#6f5d48';
  const xy = (s: string) => [(s.charCodeAt(0) - 97) * sq, (8 - Number(s[1])) * sq];
  let out = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) out += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" fill="${(r + f) % 2 ? dark : light}"/>`;
  for (const m of opts.marks ?? []) {
    const [x, y] = xy(m);
    out += `<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="#a58cff" fill-opacity="0.55"/>`;
  }
  const chess = new Chess(fen);
  for (const row of chess.board()) for (const p of row) {
    if (!p) continue;
    const [x, y] = xy(p.square);
    const white = p.color === 'w';
    out += `<g transform="translate(${x} ${y}) scale(${sq / 100})"><path fill-rule="evenodd" d="${PIECE_PATHS[PIECE_IDS[p.type]].join(' ')}"
      fill="${white ? '#fffaf0' : '#1d1a22'}" stroke="${white ? '#3a2f22' : '#e8e0d0'}" stroke-width="${white ? 2.4 : 1.4}"/></g>`;
  }
  for (const [from, to] of opts.arrows ?? []) {
    const [x1, y1] = xy(from).map((v) => v + sq / 2);
    const [x2, y2] = xy(to).map((v) => v + sq / 2);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const head = sq * 0.42;
    const ex = x2 - ux * head * 0.9;
    const ey = y2 - uy * head * 0.9;
    out += `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="#f2c27a" stroke-width="${sq * 0.16}" stroke-linecap="round" opacity="0.92"/>
      <path d="M${x2} ${y2} L${ex - uy * head * 0.6} ${ey + ux * head * 0.6} L${ex + uy * head * 0.6} ${ey - ux * head * 0.6} Z" fill="#f2c27a" opacity="0.92"/>`;
  }
  return `<svg class="diagram${opts.flat ? ' flat' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${out}</svg>`;
}

function visual(v: Visual): string {
  switch (v.kind) {
    case 'emblems': {
      const size = v.size ?? (v.tiers.length > 1 ? 330 : 380);
      return `<div class="emblems">${v.tiers.map((t) => emblem(t.id, t.division, size)).join('')}</div>`;
    }
    case 'board':
      return board(v.fen, v, 720);
    case 'image':
      return `<img class="visual-img" src="${render(v.img)}">`;
    case 'table':
      return `<table class="table">${v.head ? `<tr><th>${esc(v.head[0])}</th><th>${esc(v.head[1])}</th></tr>` : ''}${v.rows
        .map(([a, b]) => `<tr><td>${esc(a)}</td><td>${b === 'free' ? '<span class="free">free</span>' : esc(b)}</td></tr>`)
        .join('')}</table>`;
  }
}

// ------------------------------------------------------------------ slides

const kicker = (k?: string) => (k ? `<div class="kicker">${esc(k)}</div>` : '');
/** Chess moves keep their case (Cinzel and the kicker would capitalise them). */
const moves = (m?: string) => (m ? `<div class="moves">${esc(m)}</div>` : '');

function slideBody(s: Slide): { body: string; cls: string } {
  switch (s.type) {
    case 'cover':
      return {
        cls: `cover${s.focus === 'board' ? ' compact' : ''}`,
        body: `<div class="bg" style="background-image:url(${render(s.img)})"></div><div class="fade"></div>
          ${s.focus === 'emblem' ? `<div class="cover-emblem">${emblem('challenger', undefined, 460)}</div>` : ''}
          <div class="content">${kicker(s.kicker)}<h1>${esc(s.title)}</h1>${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}</div>
          <div class="swipe">Swipe →</div>`,
      };
    case 'scene':
      return {
        cls: 'scene',
        body: `<div class="bg" style="background-image:url(${render(s.img)})"></div><div class="fade"></div>
          <div class="content">${kicker(s.kicker)}${moves(s.moves)}${s.title ? `<h2>${esc(s.title)}</h2>` : ''}<p class="body">${esc(s.text)}</p></div>`,
      };
    case 'statement':
      return {
        cls: 'statement',
        body: `${s.img ? `<div class="bg dim" style="background-image:url(${render(s.img)})"></div><div class="fade strong"></div>` : ''}
          <div class="center">${s.visual ? `<div class="visual">${visual(s.visual)}</div>` : ''}
          ${kicker(s.kicker)}${moves(s.moves)}<h2>${esc(s.title)}</h2>${s.text ? `<p class="body">${esc(s.text)}</p>` : ''}</div>`,
      };
    case 'card': {
      const tier = s.visual?.kind === 'emblems' ? TIERS.find((t) => t.id === s.visual.tiers[0].id) : null;
      return {
        cls: 'card',
        body: `${tier ? `<div class="glow" style="background:radial-gradient(520px 460px at 50% 41%,${tier.color}30,transparent 70%)"></div>` : ''}<div class="center">${s.visual ? `<div class="visual">${visual(s.visual)}</div>` : ''}
          ${kicker(s.kicker)}<h2${s.accent ? ` style="background:linear-gradient(180deg,#fff6d8,${s.accent} 60%,#c99a3c);-webkit-background-clip:text;background-clip:text"` : ''}>${esc(s.title)}</h2>
          <p class="body">${esc(s.text)}</p></div>`,
      };
    }
    case 'grid':
      return {
        cls: 'grid',
        body: `<div class="center">${kicker(s.kicker)}<h2>${esc(s.title)}</h2>
          <div class="tiles n${s.items.length}">${s.items
            .map((i) => `<figure><div class="tile" style="background-image:url(${render(i.img)})"></div><figcaption>${spark(18)} ${esc(i.label)}</figcaption></figure>`)
            .join('')}</div>${s.text ? `<p class="body">${esc(s.text)}</p>` : ''}</div>`,
      };
    case 'steps':
      return {
        cls: 'steps',
        body: `${s.img ? `<div class="bg dim" style="background-image:url(${render(s.img)})"></div><div class="fade strong"></div>` : ''}
          <div class="center left">${kicker(s.kicker)}<h2>${esc(s.title)}</h2><ol>${s.items
            .map((i, n) => `<li><span class="num">${n + 1}</span><div><b>${esc(i.head)}</b><span>${esc(i.text)}</span></div></li>`)
            .join('')}</ol></div>`,
      };
    case 'phone':
      return {
        cls: 'phone-slide',
        body: `<div class="phone-wrap"><div class="phone"><img src="${render(s.img)}"></div></div>
          <div class="content">${kicker(s.kicker)}<h2>${esc(s.title)}</h2><p class="body">${esc(s.text)}</p></div>`,
      };
    case 'cta':
      return {
        cls: 'cta',
        body: `${s.img ? `<div class="bg dim" style="background-image:url(${render(s.img)})"></div><div class="fade strong"></div>` : ''}
          <div class="center"><div class="cta-logo">${logo(150)}</div>${kicker(s.kicker)}<h2>${esc(s.title)}</h2>
          <p class="body">${esc(s.text)}</p>
          <div class="cta-pill">${spark(22, '#1a1308')} Link in bio</div>
          ${s.ask ? `<p class="ask">${esc(s.ask)}</p>` : ''}</div>`,
      };
  }
}

const font = (family: string, file: string, weight: number) =>
  `@font-face{font-family:${family};font-weight:${weight};src:url(${fileUrl(`node_modules/@fontsource/${family.toLowerCase()}/files/${file}`)}) format('woff2')}`;

const CSS = `
${font('Cinzel', 'cinzel-latin-700-normal.woff2', 700)}
${font('Cinzel', 'cinzel-latin-800-normal.woff2', 800)}
${[400, 500, 600, 700].map((w) => font('Inter', `inter-latin-${w}-normal.woff2`, w)).join('\n')}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{position:relative;color:#efeae1;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;
  background:radial-gradient(1100px 900px at 50% 16%,#231d3a 0%,#141620 48%,#0a0b10 100%)}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.bg.dim{filter:brightness(.55) saturate(.9)}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,11,16,.62) 0%,rgba(10,11,16,0) 16%,rgba(10,11,16,0) 46%,rgba(10,11,16,.82) 70%,#0a0b10 96%)}
.fade.strong{background:linear-gradient(180deg,rgba(10,11,16,.55) 0%,rgba(10,11,16,.35) 40%,rgba(10,11,16,.85) 75%,#0a0b10 100%)}
.glow{position:absolute;inset:0}
.frame{position:absolute;inset:36px;border:1.5px solid rgba(242,194,122,.35);border-radius:28px;pointer-events:none}
.top{position:absolute;top:64px;left:72px;right:72px;display:flex;align-items:center;justify-content:space-between;z-index:5}
.brand{display:flex;align-items:center;gap:16px;font:600 22px Inter;letter-spacing:.2em;color:#efeae1}
.count{font:600 22px Inter;letter-spacing:.14em;color:#a9a399}
.count.tag{color:#f2c27a}
.content{position:absolute;left:72px;right:72px;bottom:118px;z-index:4}
.center{position:absolute;inset:150px 72px 110px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:4}
.center.left{align-items:flex-start;text-align:left}
.moves{font:700 46px Inter;color:#f2c27a;letter-spacing:.01em;margin-bottom:18px;white-space:pre}
.kicker{font:600 26px Inter;letter-spacing:.18em;text-transform:uppercase;color:#f2c27a;margin-bottom:22px}
h1,h2{font-family:Cinzel,serif;margin:0;letter-spacing:.01em;line-height:1.04;
  background:linear-gradient(180deg,#f9dca8 0%,#e3a858 62%,#c98a3c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 4px 22px rgba(0,0,0,.7))}
h1{font-weight:800;font-size:112px}
h2{font-weight:700;font-size:80px}
.compact h1{font-size:84px}
.compact .fade{background:linear-gradient(180deg,rgba(10,11,16,.5) 0%,rgba(10,11,16,0) 10%,rgba(10,11,16,0) 60%,rgba(10,11,16,.9) 72%,#0a0b10 82%)}
.sub{font:500 42px/1.3 Inter;margin:28px 0 0;color:#efeae1}
.body{font:400 37px/1.38 Inter;color:#d9d3c9;margin:26px 0 0;max-width:900px}
.center .body{margin-left:auto;margin-right:auto}
.center.left .body{margin-left:0}
.swipe{position:absolute;right:72px;bottom:58px;z-index:5;background:linear-gradient(180deg,#f7d59c,#e0a556);color:#1a1308;font:700 24px Inter;
  letter-spacing:.06em;padding:14px 28px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.45)}
.cover-emblem{position:absolute;left:0;right:0;top:300px;display:flex;justify-content:center;z-index:3}
.visual{margin-bottom:56px;display:flex;justify-content:center}
.emblems{display:flex;gap:28px;justify-content:center}
.diagram{border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 2px rgba(242,194,122,.35)}
.diagram.flat{filter:grayscale(1) contrast(.9);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.12)}
.table{border-collapse:collapse;font:500 34px Inter;min-width:820px}
.table th{font:600 22px Inter;letter-spacing:.14em;text-transform:uppercase;color:#a9a399;text-align:left;padding:0 18px 16px}
.table td{padding:17px 18px;border-top:1px solid rgba(255,255,255,.09);text-align:left}
.table td:last-child{text-align:right;color:#f2c27a}
.free{font:700 22px Inter;letter-spacing:.12em;text-transform:uppercase;background:rgba(85,211,145,.14);color:#55d391;padding:6px 14px;border-radius:999px}
.tiles{display:grid;gap:22px;margin-top:40px;width:100%}
.grid h2{font-size:68px}
.tiles.n4{grid-template-columns:1fr 1fr}
.tiles.n2{grid-template-columns:1fr 1fr}
figure{margin:0}
.tile{width:100%;aspect-ratio:3/4;background-size:cover;background-position:center;border-radius:20px;box-shadow:0 0 0 1.5px rgba(242,194,122,.3)}
.tiles.n4 .tile{aspect-ratio:5/4}
.tiles.n2 .tile{aspect-ratio:3/4.4}
figcaption{display:flex;align-items:center;justify-content:center;gap:10px;font:600 28px Inter;letter-spacing:.06em;margin-top:14px}
ol{list-style:none;padding:0;margin:44px 0 0;display:flex;flex-direction:column;gap:34px;width:100%}
li{display:flex;gap:28px;align-items:flex-start}
.num{flex:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 34px Cinzel;color:#1a1308;
  background:linear-gradient(180deg,#f7d59c,#e0a556)}
li b{display:block;font:600 38px/1.2 Inter;color:#efeae1}
li span{display:block;font:400 32px/1.35 Inter;color:#a9a399;margin-top:6px}
.phone-wrap{position:absolute;left:0;right:0;top:150px;display:flex;justify-content:center;z-index:3}
.phone{width:430px;height:900px;border-radius:58px;padding:14px;background:#050507;box-shadow:0 0 0 2px rgba(242,194,122,.45),0 40px 100px rgba(0,0,0,.7)}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:46px;display:block}
.phone-slide .content{bottom:100px}
.phone-slide h2{font-size:64px}
.cta-logo{margin-bottom:40px;filter:drop-shadow(0 0 40px rgba(165,140,255,.35))}
.cta-pill{margin-top:48px;display:inline-flex;align-items:center;gap:14px;background:linear-gradient(180deg,#f7d59c,#e0a556);color:#1a1308;
  font:700 40px Inter;padding:24px 52px;border-radius:999px;box-shadow:0 14px 40px rgba(0,0,0,.5)}
.ask{font:600 26px Inter;letter-spacing:.14em;text-transform:uppercase;color:#a9a399;margin-top:30px}
`;

function page(slide: Slide, index: number, total: number): string {
  const { body, cls } = slideBody(slide);
  const counter = slide.type === 'cover'
    ? `<div class="count tag">${esc(slide.tag.toUpperCase())}</div>`
    : `<div class="count">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body class="${cls}">${body}<div class="frame"></div>
    <div class="top"><div class="brand">${logo(56)}WIZARD CHESS</div>${counter}</div></body></html>`;
}

// ------------------------------------------------------------------ build

const work = mkdtempSync(join(tmpdir(), 'wc-posts-'));
mkdirSync(join(ROOT, 'zips'), { recursive: true });
// The container's preinstalled Chromium when there is one (verify-in-browser skill).
const chrome = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const tab = await browser.newPage({ viewport: { width: W, height: H } });
const covers: Record<string, string> = {};

for (const post of POSTS) {
  if (ONLY && !ONLY.some((o) => post.slug.startsWith(o))) {
    covers[post.slug.slice(0, 2)] = join(ROOT, 'posts', post.slug, '01.jpg');
    continue;
  }
  const dir = join(ROOT, 'posts', post.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [i, slide] of post.slides.entries()) {
    const html = join(work, `${post.slug}-${i}.html`);
    writeFileSync(html, page(slide, i, post.slides.length));
    await tab.goto(fileUrl(html));
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForLoadState('networkidle');
    await tab.screenshot({ path: join(dir, `${String(i + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  writeFileSync(
    join(dir, 'caption.md'),
    `# ${post.slug}\n\nFor: ${post.audience}\n\nSlides: ${post.slides.length} (1080 × 1440, upload in order)\n\n## Caption\n\n${post.caption}\n\n## Alt text\n\n${post.alt}\n`,
  );
  const zip = resolve(ROOT, 'zips', `${post.slug}.zip`);
  rmSync(zip, { force: true });
  execFileSync('zip', ['-q', '-j', zip, ...post.slides.map((_, i) => `${String(i + 1).padStart(2, '0')}.jpg`), 'caption.md'], { cwd: dir });
  covers[post.slug.slice(0, 2)] = join(dir, '01.jpg');
  console.log(`${post.slug}: ${post.slides.length} slides`);
}

// The profile grid after posting all six in order: the newest (the last post) is top left.
const cells = [...POSTING_ORDER]
  .reverse()
  .map((n) => covers[n])
  .map((c) => `<div style="aspect-ratio:3/4;background:url(${fileUrl(c)}) center/cover"></div>`)
  .join('');
const grid = join(work, 'grid.html');
writeFileSync(grid, `<!doctype html><html><body style="margin:0;background:#000;width:1080px">
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px">${cells}</div></body></html>`);
await tab.setViewportSize({ width: 1080, height: 960 });
await tab.goto(fileUrl(grid));
await tab.waitForLoadState('networkidle');
await tab.screenshot({ path: join(ROOT, 'grid-preview.jpg'), type: 'jpeg', quality: 90, fullPage: true });

await browser.close();
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${ROOT}/posts, ${ROOT}/zips and ${ROOT}/grid-preview.jpg`);
