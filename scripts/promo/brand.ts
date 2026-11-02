// Brand pieces shared by the promo builders (build-posts.ts, build-reels.ts): the Night
// Knight tile, the spark and the two fonts (docs/marketing/INSTAGRAM-DESIGN.md).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PIECE_PATHS } from '../../src/ui/art/pieces.ts';

export const fileUrl = (path: string) => pathToFileURL(resolve(path)).href;
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GOLD_STOPS = '<stop offset="0" stop-color="#f9dca8"/><stop offset="0.55" stop-color="#e3a858"/><stop offset="1" stop-color="#c98a3c"/>';

/** The Night Knight tile (LogoMark in src/ui/art/art.tsx). */
export function logo(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><defs>
    <radialGradient id="lb" cx="0.5" cy="0.38" r="0.7"><stop offset="0" stop-color="#2a2245"/><stop offset="0.6" stop-color="#141620"/><stop offset="1" stop-color="#0a0b10"/></radialGradient>
    <linearGradient id="lg" x1="0.2" y1="0" x2="0.8" y2="1">${GOLD_STOPS}</linearGradient></defs>
    <rect x="4" y="4" width="92" height="92" rx="26" fill="url(#lb)"/>
    <rect x="4.75" y="4.75" width="90.5" height="90.5" rx="25.25" fill="none" stroke="#f2c27a" stroke-opacity="0.5" stroke-width="1.5"/>
    <path transform="translate(-1.5 5)" fill-rule="evenodd" fill="url(#lg)" d="${PIECE_PATHS.knight[1]}"/>
    <path d="M75 18 Q76.3 24.7 83 26 Q76.3 27.3 75 34 Q73.7 27.3 67 26 Q73.7 24.7 75 18 Z" fill="#d9ceff"/></svg>`;
}

/** The four-point spark from the logo, the series' only bullet. */
export const spark = (size: number, fill = '#f2c27a') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20"><path d="M10 0 Q11.6 8.4 20 10 Q11.6 11.6 10 20 Q8.4 11.6 0 10 Q8.4 8.4 10 0 Z" fill="${fill}"/></svg>`;

const font = (family: string, file: string, weight: number) =>
  `@font-face{font-family:${family};font-weight:${weight};src:url(${fileUrl(`node_modules/@fontsource/${family.toLowerCase()}/files/${file}`)}) format('woff2')}`;

/** @font-face rules for Cinzel 700/800 and Inter 400–700. */
export const FONTS = `
${font('Cinzel', 'cinzel-latin-700-normal.woff2', 700)}
${font('Cinzel', 'cinzel-latin-800-normal.woff2', 800)}
${[400, 500, 600, 700].map((w) => font('Inter', `inter-latin-${w}-normal.woff2`, w)).join('\n')}`;
