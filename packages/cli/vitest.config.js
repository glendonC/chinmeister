import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js', 'lib/**/*.jsx', 'cli.jsx'],
      exclude: ['lib/__tests__/**', 'dist/**'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      // Current coverage: ~27% lines. Threshold enforces no regression.
      // Target: 40%+ as React hook tests and remaining dashboard components get covered.
      thresholds: {
        lines: 25,
        branches: 20,
        functions: 15,
      },
    },
  },
});
