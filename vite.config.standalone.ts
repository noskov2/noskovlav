import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// Produces a single, fully self-contained index.html (JS + CSS inlined,
// no external requests) that can be opened directly by double-clicking —
// no server, no build step, no account needed. Used for the "PECO
// Dashboard - standalone.html" distributable; the default vite.config.ts
// is still used for normal dev/deployed builds.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist-standalone',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 10000,
  },
})
