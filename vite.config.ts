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
        // Split heavy, infrequently-changing vendor libraries into their own
        // cacheable chunks, so an app-code change doesn't bust the browser
        // cache for the entire Firebase SDK / PDF / spreadsheet bundles too.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('jspdf') || id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('exceljs') || id.includes('xlsx')) return 'vendor-spreadsheet';
          if (id.includes('html2canvas') || id.includes('html-to-image')) return 'vendor-image';
        },
      },
    },
  },
});
