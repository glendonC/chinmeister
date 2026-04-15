import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.js',
      // Use test-specific config: no AI binding, local KV — runs in CI without CF auth.
      wrangler: { configPath: './wrangler.test.toml' },
    }),
  ],
  test: {
    // scripts/ holds standalone Node build scripts (fetch-pricing-seed,
    // resolver coverage harness). They're invoked directly via
    // `node --experimental-strip-types` and must not be picked up by vitest.
    exclude: ['**/node_modules/**', 'scripts/**'],
  },
  // Note: V8 coverage is not supported with @cloudflare/vitest-pool-workers
  // because tests run in the workerd runtime, not Node.js. The workerd runtime
  // does not expose node:inspector/promises needed for V8 coverage collection.
  // Coverage for worker code requires a different approach (e.g., integration
  // tests running against the worker from Node.js).
});
