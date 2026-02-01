import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  optimizeDeps: {
    include: ['qz-tray'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    proxy: {
      '/botmaster': {
        target: 'https://api.botmastersender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/botmaster/, ''),
      },
    },
  },
});
