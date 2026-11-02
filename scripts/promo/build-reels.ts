// Builds the Instagram Reels (scripts/promo/reels.ts) from the frames that render-reels.ts
// rendered: the text in the brand's style (docs/marketing/INSTAGRAM-DESIGN.md), the game's
// own sounds (src/audio/sfx.ts, played back where they happened) over a quiet music bed
// made the same way (Web Audio, no samples), and an H.264 MP4 Instagram takes as it is.
// Writes promo/instagram/reels/<reel>/reel.mp4, cover.jpg (for the profile grid) and caption.md.
//
// Needs ffmpeg, Playwright, and the dev server for the sounds (as for render-reels.ts):
//   VITE_ACCOUNTS=mock npx vite --host 127.0.0.1 --port 5174
//   node scripts/promo/build-reels.ts [--only 01,03] [--no-audio] [--frames dir]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { FONTS, esc, fileUrl, logo, spark } from './brand.ts';
import { FPS, REELS, reelLength, type Overlay, type Reel } from './reels.ts';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5174/';
const ROOT = 'promo/instagram/reels';
const FRAMES = (() => {
  const i = process.argv.indexOf('--frames');
  return i > 0 ? process.argv[i + 1] : join(ROOT, '.frames');
})();
const WORK = join(ROOT, '.build');
const W = 1080;
const H = 1920;
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > 0 ? process.argv[i + 1].split(',') : null;
})();
const NO_AUDIO = process.argv.includes('--no-audio');

// ------------------------------------------------------------------ text layers

// Reels' safe area: Instagram covers about the top 220 px (header) and the bottom 380 px
// (caption, audio), and the right 140 px from mid-height down (buttons).
const CSS = `${FONTS}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
body{position:relative;color:#efeae1;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.shade{position:absolute;left:0;right:0;height:760px;transform:translateY(-50%);
  background:radial-gradient(ellipse 760px 330px at 50% 50%,rgba(10,11,16,.72) 0%,rgba(10,11,16,.42) 52%,rgba(10,11,16,0) 100%)}
.block{position:absolute;left:90px;right:90px;transform:translateY(-50%);text-align:center}
.cin{font-family:Cinzel,serif;letter-spacing:.01em;line-height:1.05;margin:0;
  background:linear-gradient(180deg,#f9dca8 0%,#e3a858 58%,#c98a3c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 4px 18px rgba(0,0,0,.85)) drop-shadow(0 0 2px rgba(0,0,0,.6))}
.hook{font-weight:800;font-size:104px}
.title{font-weight:800;font-size:96px}
.big{font-weight:800;font-size:132px}
.name{font-weight:700;font-size:84px}
.kicker{font:600 30px Inter;letter-spacing:.2em;text-transform:uppercase;color:#f2c27a;margin-bottom:18px;
  text-shadow:0 2px 12px rgba(0,0,0,.9)}
.kicker.violet{color:#c9b8ff}
.line{font:600 56px/1.2 Inter;color:#efeae1;text-shadow:0 3px 18px rgba(0,0,0,.95)}
.sub{font:500 42px/1.3 Inter;color:#efeae1;margin-top:18px;text-shadow:0 3px 16px rgba(0,0,0,.95)}
.num{display:inline-flex;width:92px;height:92px;border-radius:50%;align-items:center;justify-content:center;margin-bottom:22px;
  font:700 50px Cinzel;color:#1a1308;background:linear-gradient(180deg,#f7d59c,#e0a556);box-shadow:0 10px 30px rgba(0,0,0,.6)}
.mark{position:absolute;top:236px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:14px;
  font:600 24px Inter;letter-spacing:.22em;color:rgba(239,234,225,.82);text-shadow:0 2px 10px rgba(0,0,0,.9)}
.cta{position:absolute;inset:0;background:radial-gradient(900px 900px at 50% 42%,rgba(35,29,58,.86) 0%,rgba(20,22,32,.9) 50%,rgba(10,11,16,.95) 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 100px 160px}
.cta .logo{filter:drop-shadow(0 0 50px rgba(165,140,255,.4));margin-bottom:44px}
.cta .brand{font:800 92px Cinzel;letter-spacing:.02em}
.cta .promise{font:500 46px/1.3 Inter;color:#efeae1;margin-top:26px;max-width:860px}
.cta .free{font:600 28px Inter;letter-spacing:.16em;text-transform:uppercase;color:#a9a399;margin-top:34px}
.pill{margin-top:56px;display:inline-flex;align-items:center;gap:16px;background:linear-gradient(180deg,#f7d59c,#e0a556);color:#1a1308;
  font:700 44px Inter;padding:26px 60px;border-radius:999px;box-shadow:0 14px 40px rgba(0,0,0,.5)}
.cover-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,11,16,.25) 0%,rgba(10,11,16,0) 30%,rgba(10,11,16,0) 46%,rgba(10,11,16,.8) 70%,rgba(10,11,16,.92) 100%)}
`;

const isNumber = (s?: string) => !!s && /^\d+$/.test(s);

function overlayHtml(o: Overlay): string {
  const y = o.y ?? 960;
  const shade = `<div class="shade" style="top:${y}px"></div>`;
  const kicker = o.kicker ? `<div class="kicker">${esc(o.kicker)}</div>` : '';
  const sub = o.sub ? `<div class="sub">${esc(o.sub)}</div>` : '';
  const at = (inner: string) => `${shade}<div class="block" style="top:${y}px">${inner}</div>`;
  switch (o.style) {
    case 'hook':
      return at(`<h1 class="cin hook">${esc(o.text)}</h1>${sub}`);
    case 'title':
      return at(`${kicker}<h1 class="cin title">${esc(o.text)}</h1>${sub}`);
    case 'big':
      // chess moves keep their case: Inter, not Cinzel (INSTAGRAM-DESIGN.md §3)
      return /^\d|[a-h][1-8]/.test(o.text)
        ? at(`<div class="line" style="font:700 120px Inter;color:#f2c27a">${esc(o.text)}</div>${sub}`)
        : at(`<h1 class="cin big">${esc(o.text)}</h1>${sub}`);
    case 'label':
      return at(`${kicker}<div class="line">${esc(o.text)}</div>${sub}`);
    case 'count':
      return at(`${isNumber(o.kicker) ? `<div class="num">${o.kicker}</div>` : kicker}<h2 class="cin name">${esc(o.text)}</h2>${sub}`);
    case 'cta':
      return `<div class="cta"><div class="logo">${logo(190)}</div><div class="cin brand">Wizard Chess</div>
        <div class="promise">${esc(o.text)}</div><div class="free">Free in your browser · phone &amp; PC</div>
        <div class="pill">${spark(26, '#1a1308')} Link in bio</div></div>`;
  }
}

const MARK = `<div class="mark">${logo(46)} WIZARD CHESS</div>`;
const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

type Browser = Awaited<ReturnType<typeof chromium.launch>>;

async function png(browser: Browser, html: string, file: string, background?: string): Promise<void> {
  const tab = await browser.newPage({ viewport: { width: W, height: H } });
  const htmlFile = resolve(WORK, 'layer.html');
  writeFileSync(htmlFile, background ? html.replace('<body>', `<body><img src="${fileUrl(background)}" style="position:absolute;inset:0;width:100%;height:100%"><div class="cover-fade"></div>`) : html);
  await tab.goto(fileUrl(htmlFile));
  await tab.evaluate(() => document.fonts.ready);
  // a busy machine (render-reels.ts running) sometimes fails a capture: try again
  for (let attempt = 1; ; attempt++) {
    try {
      await tab.screenshot({ path: file, omitBackground: !background, ...(background ? { type: 'jpeg', quality: 92 } : {}) });
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      await tab.waitForTimeout(1000 * attempt);
    }
  }
  await tab.close();
}

// ------------------------------------------------------------------ frames and sound

interface TakeFrames {
  start: number; // seconds into the reel
  frames: string[];
  sounds: { name: string; args: unknown[]; t: number }[];
}

function takes(reel: Reel): TakeFrames[] {
  let start = 0;
  return reel.takes.map((take) => {
    const dir = join(FRAMES, reel.id, take.name);
    if (!existsSync(join(dir, 'done.json'))) throw new Error(`missing frames ${dir} (run scripts/promo/render-reels.ts)`);
    const done = JSON.parse(readFileSync(join(dir, 'done.json'), 'utf8'));
    const frames = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().map((f) => join(dir, f));
    const t = { start, frames, sounds: done.sounds };
    start += frames.length / FPS;
    return t;
  });
}

/** The soundtrack, rendered offline in the page with the game's own sound kit. */
async function soundtrack(browser: Browser, reel: Reel, parts: TakeFrames[], file: string): Promise<void> {
  const length = reelLength(reel);
  const events = parts.flatMap((p) => p.sounds.map((s) => ({ ...s, t: p.start + s.t })));
  const cuts = parts.slice(1).map((p) => p.start);
  const tab = await browser.newPage();
  await tab.goto(BASE, { waitUntil: 'domcontentloaded' });
  const wav: string = await tab.evaluate(async ({ length, events, cuts, music }) => {
    const { sfx } = await import(/* @vite-ignore */ '/src/audio/sfx.ts');
    const rate = 48000;
    const ctx = new OfflineAudioContext(2, Math.ceil(length * rate), rate);
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -14;
    out.ratio.value = 3;
    out.connect(ctx.destination);

    // the game's sound kit, pointed at this context (as `unlock` would set it up)
    const s = sfx as any;
    s.ctx = ctx;
    s.muted = false;
    s.master = ctx.createGain();
    s.master.gain.value = 0.62;
    s.master.connect(out);
    s.noise = ctx.createBuffer(1, rate * 2, rate);
    const data = s.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    Object.defineProperty(s, 'ready', { get: () => ctx });

    // music bed: a slow pad on the root, with plucks for the bright reels
    const bed = ctx.createGain();
    bed.gain.setValueAtTime(0.0001, 0);
    bed.gain.exponentialRampToValueAtTime(0.16, 0.6);
    bed.gain.setValueAtTime(0.16, Math.max(0.7, length - 1.2));
    bed.gain.exponentialRampToValueAtTime(0.0001, length);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(380, 0);
    lp.frequency.linearRampToValueAtTime(900, length * 0.7);
    lp.frequency.linearRampToValueAtTime(500, length);
    lp.Q.value = 0.7;
    bed.connect(lp).connect(out);
    const root = music.root;
    const chord = music.mood === 'dark' ? [1, 1.5, 2, 2.4, 3] : [1, 1.5, 2, 2.52, 3.36];
    chord.forEach((ratio, i) => {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = root * ratio;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = i < 2 ? 0.22 : 0.12;
        const pan = ctx.createStereoPanner();
        pan.pan.value = detune < 0 ? -0.5 : 0.5;
        o.connect(g).connect(pan).connect(bed);
        o.start(0);
        o.stop(length);
      }
    });
    if (music.mood === 'bright') {
      const notes = [2, 3, 4, 3, 2.52, 3, 4, 5.04];
      const step = 60 / 112 / 2;
      for (let t = 0.6, n = 0; t < length - 1; t += step, n++) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = root * 2 * notes[n % notes.length];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(bed);
        o.start(t);
        o.stop(t + 0.4);
      }
    }
    // a low hit on every cut
    for (const t of cuts) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.7);
    }

    // the game's sounds where they happened (suspend points are whole render quanta)
    const quantum = 128 / rate;
    const groups = new Map<number, typeof events>();
    for (const e of events) {
      const at = Math.max(1, Math.ceil(e.t / quantum)) * quantum;
      if (at >= length) continue;
      groups.set(at, [...(groups.get(at) ?? []), e]);
    }
    for (const [at, list] of groups) {
      void ctx.suspend(at).then(() => {
        for (const e of list) (sfx as any)[e.name](...e.args);
        void ctx.resume();
      });
    }
    const buffer = await ctx.startRendering();

    // 16-bit WAV, base64
    const ch = [buffer.getChannelData(0), buffer.getChannelData(1)];
    const n = buffer.length;
    const bytes = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o: number, v: string) => [...v].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); bytes.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
    bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
    str(36, 'data'); bytes.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) bytes.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
    let bin = '';
    const u8 = new Uint8Array(bytes.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { length, events, cuts, music: reel.music });
  writeFileSync(file, Buffer.from(wav, 'base64'));
  await tab.close();
}

// ------------------------------------------------------------------ the reels

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const reel of REELS) {
  if (ONLY && !ONLY.some((o) => reel.id.startsWith(o))) continue;
  const parts = takes(reel);
  const length = reelLength(reel);
  const work = join(WORK, reel.id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'seq'), { recursive: true });
  const out = join(ROOT, reel.id);
  mkdirSync(out, { recursive: true });

  // one numbered sequence across the takes
  let n = 0;
  for (const p of parts) for (const f of p.frames) symlinkSync(resolve(f), join(work, 'seq', `${String(n++).padStart(5, '0')}.jpg`));

  // text layers, the brand mark (hidden under the CTA card)
  const layers: { file: string; from: number; to: number }[] = [];
  const ctaFrom = reel.overlays.find((o) => o.style === 'cta')?.from ?? length;
  layers.push({ file: join(work, 'mark.png'), from: 0, to: ctaFrom });
  await png(browser, page(MARK), join(work, 'mark.png'));
  for (const [i, o] of reel.overlays.entries()) {
    const file = join(work, `text-${i}.png`);
    await png(browser, page(overlayHtml(o)), file);
    layers.push({ file, from: o.from, to: Math.min(o.to, length) });
  }

  // the video: frames + layers fading in (with a small rise) and out
  const inputs = ['-framerate', String(FPS), '-i', join(work, 'seq', '%05d.jpg')];
  const chain: string[] = [];
  chain.push(`[0:v]scale=${W}:${H}:flags=lanczos,setsar=1[base]`);
  let last = 'base';
  layers.forEach((l, i) => {
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(length), '-i', l.file);
    const fadeIn = l.from > 0.01 ? `,fade=t=in:st=${l.from}:d=0.22:alpha=1` : '';
    const fadeOut = l.to < length - 0.05 ? `,fade=t=out:st=${Math.max(l.from, l.to - 0.22)}:d=0.22:alpha=1` : '';
    chain.push(`[${i + 1}:v]format=rgba${fadeIn}${fadeOut}[l${i}]`);
    const rise = l.from > 0.01 ? `'if(lt(t,${l.from + 0.35}),24*pow(1-max(0,t-${l.from})/0.35,2),0)'` : '0';
    chain.push(`[${last}][l${i}]overlay=x=0:y=${rise}:enable='between(t,${l.from},${l.to})'[v${i}]`);
    last = `v${i}`;
  });
  chain.push(`[${last}]format=yuv420p[vout]`);

  const wav = join(work, 'sound.wav');
  if (!NO_AUDIO) await soundtrack(browser, reel, parts, wav);
  const audio = NO_AUDIO ? [] : ['-i', wav];
  const audioIndex = layers.length + 1;
  ffmpeg([
    ...inputs, ...audio,
    '-filter_complex', chain.join(';'),
    '-map', '[vout]', ...(NO_AUDIO ? [] : ['-map', `${audioIndex}:a`, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000']),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-profile:v', 'high', '-level', '4.2', '-r', String(FPS),
    '-t', String(length), '-movflags', '+faststart', join(out, 'reel.mp4'),
  ]);

  // the cover: a frame with the headline in the part the 3:4 grid shows (y 240–1680)
  const coverFrame = join(work, 'seq', `${String(Math.min(n - 1, Math.round(reel.cover.t * FPS))).padStart(5, '0')}.jpg`);
  await png(browser, page(`${MARK}<div class="block" style="top:1290px"><div class="kicker">${esc(reel.cover.kicker)}</div>
    <h1 class="cin title" style="font-size:112px">${esc(reel.cover.text)}</h1></div>`), join(out, 'cover.jpg'), resolve(coverFrame));

  writeFileSync(join(out, 'caption.md'), `# ${reel.title}

${length.toFixed(1)} s · 1080 × 1920 · 30 fps · for: ${reel.goal}

Upload \`reel.mp4\` as a Reel, set \`cover.jpg\` as the cover (Edit cover → Add from camera roll),
and check that the grid crop (3:4, the middle) shows the headline.

## Caption

${reel.caption}

## Alt text

${reel.alt}

## Sound

The game's own sounds over a quiet music bed made for this Reel (no licensed music). To
ride a trending sound instead, add it in Instagram at about 20% and keep the original audio.
`);
  console.log(`${reel.id}: ${join(out, 'reel.mp4')} (${length.toFixed(1)} s)`);
}
await browser.close();
