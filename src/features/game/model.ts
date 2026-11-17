// Kept separate from engine.ts so screens can prefetch the model without
// pulling three.js into the main bundle.

export const MODEL_URL = `${import.meta.env.BASE_URL}models/chess-set.glb`;

let prefetched = false;

/** Warm the HTTP cache with the 3D model so the first game opens quickly (not on a data saver or a slow line). */
export function prefetchModel(): void {
  if (prefetched || saveData()) return;
  prefetched = true;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = MODEL_URL;
  link.as = 'fetch';
  document.head.append(link);
}

/** The player asked the browser to save data, or the connection is slow: don't fetch ahead. */
function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (!!c.saveData || /(^|-)2g$|^3g$/.test(c.effectiveType ?? ''));
}
