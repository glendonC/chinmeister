import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
      },
    },
  },
  server: {
    port: 56790,
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'src/**/*.jsx'],
      exclude: ['src/**/*.test.*'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      // Thresholds enforce current coverage floor (~5% margin below actual).
      // Target: raise to 60/50/40 as view-level tests are added.
      thresholds: {
        lines: 34,
        functions: 31,
        branches: 15,
      },
    },
  },
});
