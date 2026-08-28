import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Build separat pentru un fișier .html standalone (spec: „un singur fișier
 * HTML"), deschis direct din file:// — fără server, fără instalare.
 * Config distinct de vite.config.ts (build-ul normal, multi-fișier, folosit
 * pentru `npm run dev`/`npm run build`), ca să nu afecteze fluxul obișnuit.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  worker: {
    // 'iife' (nu 'es'): un worker de tip modul (ES) instanțiat dintr-un blob:
    // URL e blocat de Chromium pe pagini deschise din file:// (eroare silențioasă
    // pe evenimentul 'error' al worker-ului). Un worker clasic (iife), fără
    // sintaxă import/export, funcționează normal din file://.
    format: 'iife',
  },
  optimizeDeps: {
    include: ['xlsx', 'dexie'],
  },
  build: {
    outDir: 'dist-standalone',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
})
