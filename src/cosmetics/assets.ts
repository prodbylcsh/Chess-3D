// Where shop item files (models, pictures) are served from. Their paths are relative to
// the assets root (`pieces/monolith/king-white.glb`, `shop/monolith-set.webp`): the
// Cloudflare R2 bucket when VITE_ASSETS_URL is set (docs/PLATFORM.md §4.5 "Assets"),
// otherwise public/assets/ on the site itself (local development, or before R2).
const REMOTE = import.meta.env.VITE_ASSETS_URL?.replace(/\/*$/, '/');

export const assetUrl = (path: string) => (REMOTE ? `${REMOTE}${path}` : `${import.meta.env.BASE_URL}assets/${path}`);
