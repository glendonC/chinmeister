import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function scanEnvironment(cwd = process.cwd()) {
  const profile = {
    framework: detectAgentFramework(),
    languages: [],
    frameworks: [],
    tools: [],
    platforms: [],
  };

  // package.json
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      profile.languages.push('javascript');

      const frameworkMap = {
        'react': 'react', 'next': 'nextjs', 'vue': 'vue', 'nuxt': 'nuxt',
        'svelte': 'svelte', '@sveltejs/kit': 'sveltekit', 'express': 'express',
        'fastify': 'fastify', 'hono': 'hono', 'ink': 'ink',
        '@angular/core': 'angular', 'astro': 'astro',
      };

      for (const [dep, tag] of Object.entries(frameworkMap)) {
        if (allDeps[dep]) profile.frameworks.push(tag);
      }

      const toolMap = {
        'esbuild': 'esbuild', 'vite': 'vite', 'webpack': 'webpack',
        'typescript': 'typescript', 'eslint': 'eslint', 'prettier': 'prettier',
        'jest': 'jest', 'vitest': 'vitest', 'prisma': 'prisma',
        'drizzle-orm': 'drizzle',
      };

      for (const [dep, tag] of Object.entries(toolMap)) {
        if (allDeps[dep]) profile.tools.push(tag);
      }
    } catch { /* malformed package.json — skip */ }
  }

  // TypeScript
  if (existsSync(join(cwd, 'tsconfig.json'))) {
    profile.languages.push('typescript');
  }

  // Python
  if (existsSync(join(cwd, 'pyproject.toml'))) {
    profile.languages.push('python');
  }

  // Go
  if (existsSync(join(cwd, 'go.mod'))) {
    profile.languages.push('go');
  }

  // Rust
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    profile.languages.push('rust');
  }

  // Platforms
  if (existsSync(join(cwd, 'wrangler.toml')) || existsSync(join(cwd, 'wrangler.jsonc'))) {
    profile.platforms.push('cloudflare');
  }
  if (existsSync(join(cwd, 'vercel.json'))) {
    profile.platforms.push('vercel');
  }
  if (existsSync(join(cwd, 'fly.toml'))) {
    profile.platforms.push('fly');
  }
  if (existsSync(join(cwd, 'Dockerfile'))) {
    profile.platforms.push('docker');
  }

  // Deduplicate
  profile.languages = [...new Set(profile.languages)];
  profile.frameworks = [...new Set(profile.frameworks)];
  profile.tools = [...new Set(profile.tools)];
  profile.platforms = [...new Set(profile.platforms)];

  return profile;
}

function detectAgentFramework() {
  if (process.env.CLAUDE_CODE) return 'claude-code';
  if (process.env.CODEX_HOME) return 'codex';
  return 'unknown';
}
