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
});
