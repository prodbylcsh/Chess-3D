import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path
  // (e.g. GitHub Pages serves this repo at /Chess-3D/).
  base: './',
  plugins: [react()],
  server: { port: 5173, open: false },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
