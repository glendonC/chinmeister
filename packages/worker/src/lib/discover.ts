// Multi-source tool discovery pipeline.
//
// Sources ranked by ROI (from research):
//   1. Awesome lists   — curated by humans, highest signal, 300+ tools
//   2. Product Hunt    — new launches, every serious tool goes here
//   3. GitHub topics   — OSS tools by tag (mcp-server, ai-coding, etc.)
//   4. HN Algolia      — trending/buzzy tools, Show HN posts
//   5. Exa sweep       — broad web crawl, supplementary
//
// All sources return DiscoveredTool[] which get deduped against existing
// evaluations before being returned for batch evaluation.

import type { Env } from '../types.js';
import { CATEGORY_NAMES } from '../catalog.js';

const GITHUB_RAW = 'https://raw.githubusercontent.com';
const GITHUB_API = 'https://api.github.com';
const HN_API = 'https://hn.algolia.com/api/v1';
const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const TIMEOUT = 30_000;

// ── Shared types ──

export interface DiscoveredTool {
  name: string;
  url: string;
  source: string;
}

export interface DiscoveryResult {
  discovered: DiscoveredTool[];
  new_tools: string[];
  strategies_run: string[];
  total_candidates: number;
  triage_passed: number;
  triage_rejected: number;
  errors: string[];
}

// ── Helpers ──

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function githubHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function dedupInto(
  target: Map<string, DiscoveredTool>,
  existingSet: Set<string>,
  tools: DiscoveredTool[],
): void {
  for (const t of tools) {
    const slug = slugify(t.name);
    if (slug.length < 2) continue;
    if (existingSet.has(slug)) continue;
    if (target.has(slug)) continue;
    target.set(slug, t);
  }
}

// ── Source 1: Awesome lists ──
// Parse markdown README files from curated GitHub awesome lists.
// These are the single highest-signal source for AI dev tools.
//
// IMPORTANT: Only the ai-devtools list is included for tool discovery.
// MCP server lists (punkpeye, wong2) have 1,900+ entries that are infrastructure
// components (database connectors, API wrappers), not standalone AI dev tools.
// Those flood the pipeline with false positives at $$ per Exa evaluation.

const AWESOME_LISTS: Array<{ repo: string; kind: 'devtools' | 'mcp' }> = [
  { repo: 'jamesmurdza/awesome-ai-devtools', kind: 'devtools' }, // 300+ tools, 20+ categories
  { repo: 'eudk/awesome-ai-tools', kind: 'devtools' }, // Broader AI tools
  // MCP lists intentionally excluded — see comment above.
  // To add one back, use kind: 'mcp' and the parser will apply stricter filtering.
];

// ── Awesome list parser ──
// Awesome lists follow a rigid structure:
//   ## Category Header
//   ### Subcategory
//   - [ToolName](url) — Description text
//   - [**ToolName**](url) — Description text
//
// Non-tool content lives outside this pattern:
//   - TOC: lines like `- [Category Name](#anchor)` (anchor links)
//   - Badges: `[![badge](shields.io/...)](...)`
//   - Inline links in descriptions: `[Source](url)` within a tool's description line
//   - Sponsors: HTML tables with `<td>`, `<a href=...>` tags
//   - Header text: lines starting with `#` or `>`
//
// Strategy: parse line-by-line. Track whether we're inside a tool section
// (under a category header). Only extract the FIRST link on bullet lines.

/** Sections that never contain tool entries. */
const SKIP_SECTIONS =
  /^(categories|table of contents|contents|contributing|contributors|license|resources|legend|what is|sponsors?|tutorials?|community|clients?|reference servers?|tips)/i;

/** Line is a bullet list item (possibly nested). */
const BULLET_RE = /^(\s*[-*])\s+/;

/** Primary tool link on a bullet line. Handles bold names and plain names.
 *  Group 1: name (may include ** wrapping)
 *  Group 2: URL
 *  Remainder after `)` should contain a description separator (—, -, :, etc.)
 */
const TOOL_LINK_RE = /^\s*[-*]\s+\[(?:\*\*)?([^\]]+?)(?:\*\*)?\]\((https?:\/\/[^)]+)\)/;

/** Inline badge images that appear before the tool link on some lists. */
const BADGE_PREFIX_RE = /^\s*[-*]\s+\[!\[.*?\]\(.*?\)\]\(.*?\)\s*/;

function parseAwesomeMarkdown(markdown: string, source: string): DiscoveredTool[] {
  const tools: DiscoveredTool[] = [];
  const lines = markdown.split('\n');

  let currentSection = '';
  let inSkippedSection = false;
  let inHtmlBlock = false; // Track HTML blocks (sponsor tables, etc.)

  for (const line of lines) {
    // ── Track HTML blocks (sponsor tables, image grids) ──
    if (/<table|<div/i.test(line)) inHtmlBlock = true;
    if (/<\/table>|<\/div>/i.test(line)) {
      inHtmlBlock = false;
      continue;
    }
    if (inHtmlBlock) continue;

    // ── Track section headers ──
    const headerMatch = line.match(
      /^#{1,4}\s+(?:<a[^>]*>)?\s*(?:[\p{Emoji}\uFE0F\u200D]+\s*[-–]?\s*)?(.+?)(?:<\/a>)?$/u,
    );
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      inSkippedSection = SKIP_SECTIONS.test(currentSection);
      continue;
    }

    // Skip non-tool sections
    if (inSkippedSection) continue;

    // We only care about bullet lines
    if (!BULLET_RE.test(line)) continue;

    // ── TOC lines: bullet + anchor link → skip ──
    if (/^\s*[-*]\s+\[.*?\]\(#/.test(line)) continue;

    // ── Strip leading badge images (some lists prefix entries with score badges) ──
    let cleanLine = line;
    while (BADGE_PREFIX_RE.test(cleanLine)) {
      cleanLine = cleanLine.replace(BADGE_PREFIX_RE, '- ');
    }

    // ── Extract the primary tool link ──
    const toolMatch = cleanLine.match(TOOL_LINK_RE);
    if (!toolMatch) continue;

    let name = toolMatch[1].trim();
    const url = toolMatch[2];

    // What comes AFTER the link? Real tool entries have a description.
    // `- [Name](url)` alone (no description) is usually a sub-link or reference.
    const afterLink = cleanLine.slice(cleanLine.indexOf(')') + 1).trim();
    // Require some description text (at least a separator + a few chars)
    // Exception: lines where the name itself is descriptive enough (>= 3 chars)
    // and there's no other link on the line before this one.
    const hasDescription = /^[\s]*[-–—:,|]\s*\S/.test(afterLink) || afterLink.length > 10;
    if (!hasDescription && afterLink.length > 0 && /^\[/.test(afterLink)) continue; // secondary link, not a tool
    // Allow entries with no description if they're in a valid tool section (some lists are terse)

    // ── Name validation ──
    if (!name || name.length < 2 || name.length > 80) continue;

    // Skip names that look like GitHub user/repo paths from MCP lists
    // but keep them if the list format uses that as the name (extract repo name)
    if (/^[a-z0-9_-]+\/[a-z0-9_.-]+$/i.test(name)) {
      // Extract the repo part as the tool name
      const repoPart = name.split('/')[1];
      if (!repoPart || repoPart.length < 2) continue;
      // Clean up common suffixes
      name = repoPart
        .replace(/[-_]mcp[-_]?server$/i, '')
        .replace(/^mcp[-_]/i, '')
        .replace(/[-_]/g, ' ')
        .trim();
      if (!name || name.length < 2) continue;
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    // ── URL validation ──
    // Skip badges, anchors, non-HTTP
    if (url.includes('shields.io')) continue;
    if (url.includes('badge')) continue;
    if (url.includes('glama.ai/mcp/servers')) continue; // Badge links on MCP lists

    // Skip GitHub profile links (no repo path)
    if (/^https?:\/\/github\.com\/[^/]+\/?$/.test(url)) continue;

    // Skip docs/blog/media links that aren't product pages
    if (/\/(blog|docs|wiki|changelog|releases|issues|pull|compare)\//i.test(url)) continue;

    // Skip image files
    if (/\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i.test(url)) continue;

    tools.push({ name, url, source });
  }

  return tools;
}

async function fetchReadme(repo: string): Promise<string | null> {
  // Try main branch first, then master
  for (const branch of ['main', 'master']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(`${GITHUB_RAW}/${repo}/${branch}/README.md`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return await res.text();
    } catch {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function discoverFromAwesomeLists(
  existingSet: Set<string>,
): Promise<{ tools: DiscoveredTool[]; candidates: number; errors: string[] }> {
  const all = new Map<string, DiscoveredTool>();
  const errors: string[] = [];
  let candidates = 0;

  for (const { repo } of AWESOME_LISTS) {
    try {
      const md = await fetchReadme(repo);
      if (!md) {
        errors.push(`awesome:${repo} → fetch failed`);
        continue;
      }

      const source = `awesome:${repo}`;
      const tools = parseAwesomeMarkdown(md, source);
      candidates += tools.length;
      dedupInto(all, existingSet, tools);
    } catch (err) {
      const e = err as Error & { name: string };
      errors.push(`awesome:${repo} → ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
  }

  return { tools: Array.from(all.values()), candidates, errors };
}

// ── Source 2: Product Hunt ──
// GraphQL API, free developer token. Best source for new launches.

const PH_API = 'https://api.producthunt.com/v2/api/graphql';

async function discoverFromProductHunt(
  existingSet: Set<string>,
  env: Env,
): Promise<{ tools: DiscoveredTool[]; candidates: number; errors: string[] }> {
  // PH requires a developer token — skip if not configured
  const token = env.PH_TOKEN;
  if (!token)
    return {
      tools: [],
      candidates: 0,
      errors: ['PH_TOKEN not configured — skipping Product Hunt'],
    };

  const tools: DiscoveredTool[] = [];
  const errors: string[] = [];
  let candidates = 0;

  // Search for AI developer tools from the last 90 days
  const queries = [
    'AI coding agent',
    'AI code editor',
    'AI developer tool',
    'MCP server',
    'AI code review',
    'AI terminal',
  ];

  for (const q of queries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(PH_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `{
            posts(order: VOTES, topic: "developer-tools", first: 20) {
              edges {
                node {
                  name
                  tagline
                  url
                  website
                  votesCount
                }
              }
            }
          }`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) {
        errors.push(`ph:"${q}" → ${res.status}`);
        continue;
      }

      const data: any = await res.json();
      const edges = data?.data?.posts?.edges || [];
      candidates += edges.length;

      for (const edge of edges) {
        const node = edge.node;
        if (!node?.name) continue;
        // Use the tool's actual website, fall back to PH page
        const url = node.website || node.url;
        tools.push({ name: node.name, url, source: 'producthunt' });
      }
    } catch (err) {
      const e = err as Error & { name: string };
      errors.push(`ph:"${q}" → ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
    break; // PH rate limits — one query is enough to get top tools
  }

  const deduped = new Map<string, DiscoveredTool>();
  dedupInto(deduped, existingSet, tools);
  return { tools: Array.from(deduped.values()), candidates, errors };
}

// ── Source 3: GitHub topic search ──

const GITHUB_TOPICS = [
  'mcp-server',
  'mcp',
  'model-context-protocol',
  'ai-coding',
  'ai-code-assistant',
  'copilot-alternative',
  'ai-agent',
  'coding-agent',
  'ai-developer-tools',
  'code-generation',
  'ai-code-review',
  'llm-tools',
  'ai-terminal',
];

async function discoverFromGitHub(
  existingSet: Set<string>,
  env: Env,
): Promise<{ tools: DiscoveredTool[]; candidates: number; errors: string[] }> {
  const token = env.GITHUB_TOKEN;
  const all = new Map<string, DiscoveredTool>();
  const errors: string[] = [];
  let candidates = 0;

  // Date filter: pushed in last 6 months
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];

  for (const topic of GITHUB_TOPICS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const q = encodeURIComponent(`topic:${topic} stars:>20 pushed:>${sixMonthsAgo}`);
      const res = await fetch(
        `${GITHUB_API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=30`,
        { headers: githubHeaders(token), signal: controller.signal },
      );

      clearTimeout(timeout);
      if (!res.ok) {
        if (res.status === 403) {
          errors.push('github: rate limited');
          break;
        }
        errors.push(`github:${topic} → ${res.status}`);
        continue;
      }

      const data: any = await res.json();
      const items = data.items || [];
      candidates += items.length;

      for (const repo of items) {
        if (repo.archived || repo.disabled) continue;

        // Prefer repo description's first phrase as tool name, fall back to repo name
        let name = (repo.name as string)
          .replace(/[-_](mcp|server|cli|ai|tool|agent|vscode|extension)$/i, '')
          .replace(/[-_]/g, ' ')
          .trim();
        name = name.charAt(0).toUpperCase() + name.slice(1);

        if (!name || name.length < 2) continue;

        const tools = [{ name, url: repo.html_url as string, source: `github:${topic}` }];
        dedupInto(all, existingSet, tools);
      }
    } catch (err) {
      const e = err as Error & { name: string };
      errors.push(`github:${topic} → ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
  }

  return { tools: Array.from(all.values()), candidates, errors };
}

// ── Source 4: Hacker News (Algolia API) ──
// Free, no auth, no rate limit. Search Show HN posts about AI dev tools.

async function discoverFromHN(
  existingSet: Set<string>,
): Promise<{ tools: DiscoveredTool[]; candidates: number; errors: string[] }> {
  const all = new Map<string, DiscoveredTool>();
  const errors: string[] = [];
  let candidates = 0;

  const queries = [
    'Show HN AI coding',
    'Show HN AI developer tool',
    'Show HN code agent',
    'Show HN MCP server',
    'Show HN AI code review',
  ];

  for (const q of queries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const params = new URLSearchParams({
        query: q,
        tags: 'show_hn',
        numericFilters: 'points>30',
        hitsPerPage: '20',
      });

      const res = await fetch(`${HN_API}/search?${params}`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) {
        errors.push(`hn:"${q}" → ${res.status}`);
        continue;
      }

      const data: any = await res.json();
      const hits = data.hits || [];
      candidates += hits.length;

      for (const hit of hits) {
        const title = (hit.title as string) || '';
        const url = (hit.url as string) || '';
        if (!url) continue;

        // Extract tool name from "Show HN: ToolName – Description" pattern
        const name = title
          .replace(/^Show HN:\s*/i, '')
          .split(/\s*[-–—:|]\s*/)[0]
          .trim();

        if (!name || name.length < 2 || name.length > 50) continue;
        if (/^(the|a |an |how|why|what|best|top|i |my |we )/i.test(name)) continue;

        dedupInto(all, existingSet, [{ name, url, source: 'hn' }]);
      }
    } catch (err) {
      const e = err as Error & { name: string };
      errors.push(`hn:"${q}" → ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
  }

  return { tools: Array.from(all.values()), candidates, errors };
}

// ── Source 5: Exa neural sweep (supplementary) ──

const CATEGORY_QUERIES: Record<string, string> = {
  'coding-agent': 'AI pair programming agent that writes code in your repo',
  ide: 'AI-native code editor or IDE with built-in AI features',
  voice: 'voice-to-code dictation tool for programmers',
  review: 'AI-powered code review tool for pull requests',
  terminal: 'AI-powered terminal or shell assistant for developers',
  docs: 'AI tool that generates or maintains code documentation',
  testing: 'AI tool that generates unit tests and integration tests for code',
  security: 'AI-powered code security scanner for vulnerabilities',
  'design-to-code': 'AI tool that converts designs or prompts into frontend code',
  refactoring: 'AI tool for automated code refactoring and codemod migration',
  debugging: 'standalone AI debugging tool that diagnoses code errors',
};

function extractToolName(title: string): string | null {
  let name = title.split(/\s*[-–—:|•·]\s*/)[0].trim();
  name = name.replace(/\s*(AI|Tool|App|IDE|Editor|Platform|Inc\.?|Labs?|by\s.*)$/i, '').trim();
  if (!name || name.length < 2 || name.length > 50) return null;
  if (/^(best|top|how|why|what|the|\d+|a |an )/i.test(name)) return null;
  if (name.includes(' ') && name === name.toLowerCase() && !name.includes('.')) return null;
  return name;
}

function isAggregatorUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const blocked = [
    'alternativeto.com',
    'g2.com',
    'capterra.com',
    'slant.co',
    'stackshare.io',
    'reddit.com',
    'news.ycombinator.com',
    'youtube.com',
    'twitter.com',
    'x.com',
    'wikipedia.org',
    'medium.com/',
    'dev.to/',
    'hackernoon.com/',
    'techcrunch.com/',
    // NOTE: Product Hunt intentionally NOT blocked — it's a primary discovery source
  ];
  if (blocked.some((p) => lower.includes(p))) return true;
  const paths = [
    '/best-',
    '/top-',
    '/compare/',
    '/alternatives/',
    '/vs/',
    '/reviews/',
    '/awesome-',
  ];
  return paths.some((p) => lower.includes(p));
}

async function discoverFromExa(
  existingSet: Set<string>,
  env: Env,
): Promise<{ tools: DiscoveredTool[]; candidates: number; errors: string[] }> {
  const apiKey = env.EXA_API_KEY;
  if (!apiKey) return { tools: [], candidates: 0, errors: ['EXA_API_KEY not configured'] };

  const year = new Date().getFullYear();
  const queries: string[] = [
    `best AI developer tools ${year}`,
    `new AI coding tool launch ${year}`,
    `MCP model context protocol developer tool`,
    `AI coding agent alternative to Cursor Copilot`,
  ];

  // Add per-category queries
  for (const cat of Object.keys(CATEGORY_NAMES)) {
    const template = CATEGORY_QUERIES[cat];
    if (template) queries.push(template);
  }

  const all = new Map<string, DiscoveredTool>();
  const errors: string[] = [];
  let candidates = 0;

  for (const query of queries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(EXA_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          query,
          type: 'neural',
          numResults: 50,
          contents: { text: { maxCharacters: 500 } },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) {
        errors.push(`exa:"${query.slice(0, 40)}…" → ${res.status}`);
        continue;
      }

      const data: any = await res.json();
      const results = data.results || [];
      candidates += results.length;

      for (const r of results) {
        if (!r.url || !r.title) continue;
        if (isAggregatorUrl(r.url)) continue;

        const name = extractToolName(r.title);
        if (!name) continue;

        dedupInto(all, existingSet, [{ name, url: r.url, source: 'exa' }]);
      }
    } catch (err) {
      const e = err as Error & { name: string };
      errors.push(
        `exa:"${query.slice(0, 40)}…" → ${e.name === 'AbortError' ? 'timeout' : e.message}`,
      );
    }
  }

  return { tools: Array.from(all.values()), candidates, errors };
}

// ── Triage ──
// Fast, synchronous filtering of candidates from ALL sources before expensive
// Exa Deep Search evaluation (3 passes x $$ per tool). Zero API calls.
//
// Philosophy: it's better to let a borderline tool through (one wasted eval)
// than to filter out a real tool. The triage is a cost gate, not a quality gate.
// Exa evaluation is the quality gate.
//
// Checks run in order from cheapest to most expensive. A candidate that fails
// ANY check is rejected. The order matters for performance — put the fastest,
// highest-rejection-rate checks first.

export interface TriageResult {
  passed: DiscoveredTool[];
  rejected: Array<{ tool: DiscoveredTool; reason: string }>;
}

/** Domains that are aggregators, social media, or content platforms — never a tool's home. */
const TRIAGE_BLOCKED_DOMAINS = new Set([
  'alternativeto.com',
  'g2.com',
  'capterra.com',
  'slant.co',
  'stackshare.io',
  'reddit.com',
  'news.ycombinator.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'wikipedia.org',
  'medium.com',
  'dev.to',
  'hackernoon.com',
  'techcrunch.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'hub.docker.com', // Package registries
  'arxiv.org',
  'papers.ssrn.com',
  'scholar.google.com', // Academic
  'glama.ai', // MCP directory, not a tool
]);

/** URL path patterns that indicate non-product pages. */
const TRIAGE_BLOCKED_PATHS = [
  '/best-',
  '/top-',
  '/compare/',
  '/alternatives/',
  '/vs/',
  '/reviews/',
  '/awesome-',
  '/blog/',
  '/docs/',
  '/wiki/',
  '/changelog/',
  '/discussions/',
  '/issues/',
  '/pull/',
  '/releases/',
];

/** Names that are clearly not product names. */
const TRIAGE_BAD_NAMES =
  /^(the|a |an |how|why|what|best|top|i |my |we |this|here|click|see|read|note|source|check|official|star|fork|repo|example|sample|template|todo|tbd|wip|untitled|test|demo|new|old|latest|previous|deprecated)/i;

/** Names that are just common words, not product names. */
const TRIAGE_GENERIC_NAMES = new Set([
  'tools',
  'tool',
  'server',
  'client',
  'agent',
  'extension',
  'plugin',
  'api',
  'sdk',
  'cli',
  'app',
  'web',
  'desktop',
  'mobile',
  'free',
  'pro',
  'premium',
  'enterprise',
  'beta',
  'alpha',
  'github',
  'gitlab',
  'npm',
  'pypi',
  'homebrew',
  'everything',
  'fetch',
  'filesystem',
  'memory',
  'time',
  'git', // MCP reference servers
]);

/**
 * Triage a batch of discovered tools. Synchronous, no API calls.
 * Returns tools that pass all checks and the rejected tools with reasons.
 */
export function triageCandidates(candidates: DiscoveredTool[]): TriageResult {
  const passed: DiscoveredTool[] = [];
  const rejected: Array<{ tool: DiscoveredTool; reason: string }> = [];

  for (const tool of candidates) {
    const reason = triageOne(tool);
    if (reason) {
      rejected.push({ tool, reason });
    } else {
      passed.push(tool);
    }
  }

  return { passed, rejected };
}

/** Returns rejection reason or null if the candidate passes. */
function triageOne(tool: DiscoveredTool): string | null {
  const { name, url } = tool;

  // ── 1. Name length bounds ──
  // Too short = abbreviation/badge label. Too long = sentence/description, not a name.
  if (name.length < 2) return 'name too short';
  if (name.length > 60) return 'name too long';

  // ── 2. Name blocklist patterns ──
  if (TRIAGE_BAD_NAMES.test(name)) return `bad name pattern: "${name}"`;

  // ── 3. Generic single-word names ──
  const nameLower = name.toLowerCase().trim();
  if (TRIAGE_GENERIC_NAMES.has(nameLower)) return `generic name: "${name}"`;

  // ── 4. Name looks like a file path or import ──
  if (/^[@./]/.test(name)) return 'name looks like a path/import';
  if (/\.(js|ts|py|go|rs|md|json|yaml|toml|txt|sh|css|html)$/i.test(name))
    return 'name is a filename';

  // ── 5. URL validation ──
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'invalid URL';
  }

  // ── 6. Domain blocklist ──
  const hostname = parsed.hostname.replace(/^www\./, '');
  if (TRIAGE_BLOCKED_DOMAINS.has(hostname)) return `blocked domain: ${hostname}`;

  // ── 7. URL path blocklist ──
  const pathLower = parsed.pathname.toLowerCase();
  for (const blocked of TRIAGE_BLOCKED_PATHS) {
    if (pathLower.includes(blocked)) return `blocked path pattern: ${blocked}`;
  }

  // ── 8. GitHub profile links (no repo) ──
  if (hostname === 'github.com' || hostname === 'gitlab.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return 'user profile, not a repo';
    // Skip if the path goes deeper than owner/repo (e.g. /tree/main/src/something)
    // Those are sub-directory links, not product pages.
    if (segments.length > 2 && !['tree', 'blob'].includes(segments[2])) {
      // Could be /owner/repo/something — that's fine
    }
  }

  // ── 9. Package registry links ──
  if (/^(registry\.npmjs\.org|pypi\.org|crates\.io)/.test(hostname)) {
    return 'package registry, not a product page';
  }

  // ── 10. Badge/image URLs that slipped through ──
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/i.test(pathLower)) return 'image URL';
  if (hostname === 'img.shields.io' || hostname === 'badge.fury.io') return 'badge URL';

  // ── 11. Name is all numbers or a version string ──
  if (/^[v\d][\d.]+$/.test(nameLower)) return 'version number, not a name';

  // ── 12. Name contains emoji-only (section decoration) ──
  // Strip emoji and see if anything remains
  const stripped = name.replace(/[\p{Emoji}\uFE0F\u200D\s]+/gu, '');
  if (stripped.length < 2) return 'emoji-only or decoration name';

  // ── 13. Duplicate signal: name is identical to a common category ──
  const categoryWords = new Set([
    'development environments',
    'terminal',
    'web-based tools',
    'desktop applications',
    'automated workflows',
    'agent infrastructure',
    'specialized tools',
    'ide extensions',
    'coding agents',
    'app builders',
    'ui generators',
  ]);
  if (categoryWords.has(nameLower)) return 'name is a category, not a tool';

  return null; // Passed all checks
}

// ── Orchestrator ──

export type Strategy = 'awesome' | 'producthunt' | 'github' | 'hn' | 'exa';

/**
 * Run discovery across multiple sources. Returns deduplicated new tools.
 * Default: all sources. Pass strategies[] to run specific ones.
 */
export async function discoverTools(
  existingIds: string[],
  env: Env,
  options?: { strategies?: Strategy[] },
): Promise<DiscoveryResult> {
  const existingSet = new Set(existingIds.map((id) => id.toLowerCase()));
  const strategies = options?.strategies || ['awesome', 'producthunt', 'github', 'hn', 'exa'];
  const strategiesRun: string[] = [];
  const allErrors: string[] = [];
  let totalCandidates = 0;
  const globalSeen = new Map<string, DiscoveredTool>();

  // Run in priority order — highest ROI first
  if (strategies.includes('awesome')) {
    const result = await discoverFromAwesomeLists(existingSet);
    strategiesRun.push('awesome');
    totalCandidates += result.candidates;
    allErrors.push(...result.errors);
    dedupInto(globalSeen, existingSet, result.tools);
  }

  if (strategies.includes('producthunt')) {
    const result = await discoverFromProductHunt(existingSet, env);
    strategiesRun.push('producthunt');
    totalCandidates += result.candidates;
    allErrors.push(...result.errors);
    dedupInto(globalSeen, existingSet, result.tools);
  }

  if (strategies.includes('github')) {
    const result = await discoverFromGitHub(existingSet, env);
    strategiesRun.push('github');
    totalCandidates += result.candidates;
    allErrors.push(...result.errors);
    dedupInto(globalSeen, existingSet, result.tools);
  }

  if (strategies.includes('hn')) {
    const result = await discoverFromHN(existingSet);
    strategiesRun.push('hn');
    totalCandidates += result.candidates;
    allErrors.push(...result.errors);
    dedupInto(globalSeen, existingSet, result.tools);
  }

  if (strategies.includes('exa')) {
    const result = await discoverFromExa(existingSet, env);
    strategiesRun.push('exa');
    totalCandidates += result.candidates;
    allErrors.push(...result.errors);
    dedupInto(globalSeen, existingSet, result.tools);
  }

  // ── Triage: filter all candidates before expensive Exa evaluation ──
  const raw = Array.from(globalSeen.values());
  const { passed, rejected } = triageCandidates(raw);

  return {
    discovered: passed,
    new_tools: passed.map((d) => d.name),
    strategies_run: strategiesRun,
    total_candidates: totalCandidates,
    triage_rejected: rejected.length,
    triage_passed: passed.length,
    errors: allErrors,
  };
}
