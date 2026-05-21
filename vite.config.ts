import { defineConfig } from 'vitest/config';
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
  test: {
    environment: 'node',
    globals: true,
  },
});
