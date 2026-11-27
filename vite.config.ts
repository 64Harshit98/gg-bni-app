import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  base: '/',
  optimizeDeps: {
    include: ['qz-tray'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },

  },
  build: {
    rollupOptions: {
      output: {
        // Only Firebase gets a named vendor chunk: every page (including the
        // public storefront) needs it at boot, so it's safe to keep it in one
        // long-cached file. PDF / spreadsheet / image libraries are left to
        // Rollup's automatic splitting on purpose — naming them here used to
        // drag shared helpers (Vite's lazy-import preload helper, Babel's
        // typeof, the CJS interop helper) into vendor-pdf / vendor-spreadsheet,
        // which made the entry chunk statically import both and forced every
        // visitor to download and run ~3MB of pdf.js + SheetJS + ExcelJS
        // before the first render.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'vendor-firebase';
        },
      },
    },
  },
});
