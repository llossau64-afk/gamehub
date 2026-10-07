import { defineConfig } from 'vite';

// Relative base so the build works from any portal sub-path (GamePix, CrazyGames, Playgama).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
