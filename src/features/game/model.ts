// Kept separate from engine.ts so screens can prefetch the model without
// pulling three.js into the main bundle.

export const MODEL_URL = `${import.meta.env.BASE_URL}models/chess-set.glb`;

let prefetched = false;

/** Warm the HTTP cache with the 3D model so the first game opens quickly. */
export function prefetchModel(): void {
  if (prefetched) return;
  prefetched = true;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = MODEL_URL;
  link.as = 'fetch';
  document.head.append(link);
}
