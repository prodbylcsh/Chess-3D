import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path
  // (e.g. GitHub Pages serves this repo at /Chess-3D/).
  base: './',
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
