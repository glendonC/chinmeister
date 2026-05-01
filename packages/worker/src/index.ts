// Worker entry point - HTTP routing, auth, and request handling.
// Uses DO RPC for all Durable Object communication.
// Auth flow: Bearer token → KV lookup → user_id → DO.getUser(id)

import type { Env, User } from './types.js';
import type { RouteDefinition } from './lib/router.js';
import { json } from './lib/http.js';
import { buildRoutes, matchRoute } from './lib/router.js';
import { createLogger, setLogLevel } from './lib/logger.js';
import { getErrorMessage } from './lib/errors.js';
import { registerPublicRoutes } from './routes/public.js';
import { authenticate, registerUserRoutes } from './routes/user/index.js';
import { registerTeamRoutes } from './routes/team/index.js';
import { runPulseCheck } from './lib/pulse.js';
import { runRefreshModelPrices } from './lib/refresh-model-prices.js';

export { DatabaseDO } from './dos/database/index.js';
export { LobbyDO } from './lobby.js';
export { TeamDO } from './dos/team/index.js';
export {
  parseTeamPath,
  getAgentRuntime,
  getToolFromAgentId,
  sanitizeTags,
  teamErrorStatus,
} from './lib/request-utils.js';

// --- CORS ---
//
// Allowlist is env-driven. CORS_ALLOWED_ORIGINS (comma-separated) overrides
// the built-in defaults. Built-ins cover production hosts plus any loopback
// origin so contributor dev servers (Vite, wrangler dev) work without extra
// configuration. Unknown origins receive no Access-Control-Allow-Origin
// header at all; we never echo the wildcard.

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://chinmeister.com',
  'https://www.chinmeister.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8788',
]);

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS';
const ALLOWED_HEADERS =
  'Content-Type, Authorization, X-Agent-Id, X-Agent-Host-Tool, X-Agent-Surface, X-Agent-Transport, X-Agent-Tier';

function parseAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const merged = new Set(DEFAULT_ALLOWED_ORIGINS);
  for (const item of raw.split(',')) {
    const trimmed = item.trim();
    if (trimmed) merged.add(trimmed);
  }
  return merged;
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    const isLoopbackHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1';
    return isLoopbackHost && (protocol === 'http:' || protocol === 'https:');
  } catch {
    return false;
  }
}

/**
 * Resolve the origin to echo back. Returns the request origin only when it
 * matches the allowlist (prod hosts, configured extras, or any loopback host
 * in non-production). Returns null when no origin should be echoed.
 */
function getAllowedOrigin(origin: string, env: Env): string | null {
  if (!origin) return null;
  const allowed = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (allowed.has(origin)) return origin;
  if (env.ENVIRONMENT !== 'production' && isLoopbackOrigin(origin)) return origin;
  return null;
}

function corsHeadersFor(origin: string, env: Env): Record<string, string> {
  const allowed = getAllowedOrigin(origin, env);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    Vary: 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = allowed;
  return headers;
}

/**
 * Validate Origin header for WebSocket upgrades.
 * Browsers always send Origin on WS handshakes. Non-browser clients
 * (MCP servers, CLI) may omit it; that's fine, they're not subject
 * to same-origin policy. We reject only when Origin IS present but
 * does not match our allowlist, which blocks cross-site WS hijacking.
 */
function isWebSocketOriginAllowed(origin: string, env: Env): boolean {
  if (!origin) return true; // non-browser client - no Origin header
  return getAllowedOrigin(origin, env) !== null;
}

// --- Route table ---
// auth: false → public, auth: true (default) → requires authenticated user.
// Handlers receive (request, env, user?, ...params) - user is null for public routes.
// Parametric :params are captured and appended as trailing handler arguments.
// Constrained params use :name(regex) syntax, e.g. :tid(t_[a-f0-9]{16}).
//
// To add a new endpoint, append it to the relevant register*Routes() factory
// in routes/* - never grow this composition list. The order below mirrors the
// legacy flat table: public → user → team. Each register function preserves
// its own internal registration order; cross-group reordering is safe only
// because no two team paths share a parametric regex that could collide.

// Team ID format used in parseTeamPath - constrained to prevent invalid IDs
// from reaching handlers (they get a 404 instead).
const TID = ':tid(t_[a-f0-9]{16})';

const routeDefinitions: RouteDefinition[] = [
  ...registerPublicRoutes(),
  ...registerUserRoutes(),
  ...registerTeamRoutes(TID),
];

const routes = buildRoutes(routeDefinitions);

// WebSocket upgrade paths skip CORS header injection (the Response is a
// WebSocket handshake, not a regular HTTP response).
const WS_PATTERN = /^\/teams\/[^/]+\/ws$/;

function isWebSocketRoute(path: string): boolean {
  return WS_PATTERN.test(path);
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Dispatch on the exact cron expression from wrangler.toml. Every configured
    // cron must have an explicit case here; unknown expressions are logged and
    // no-op'd so adding a cron without wiring its handler fails visibly instead
    // of silently running the wrong job.
    switch (controller.cron) {
      case '0 3 * * 1':
        ctx.waitUntil(runPulseCheck(env));
        break;
      case '0 */6 * * *':
        ctx.waitUntil(runRefreshModelPrices(env));
        break;
      default:
        createLogger('scheduled').warn(`unhandled cron expression: ${controller.cron}`);
        break;
    }
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const ref = crypto.randomUUID().slice(0, 8);

    // Configure log level from environment
    setLogLevel((env as Env & { LOG_LEVEL?: string }).LOG_LEVEL || '');
    const log = createLogger('router');

    const origin = request.headers.get('Origin') || '';
    const corsHeaders = corsHeadersFor(origin, env);

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const matched = matchRoute(routes, method, path);
      if (!matched) {
        return json({ error: 'Not found' }, 404, corsHeaders);
      }

      const { route, params } = matched;

      // Authenticate if required
      let user: User | null = null;
      if (route.auth) {
        user = await authenticate(request, env);
        if (!user) {
          return json({ error: 'Unauthorized' }, 401, corsHeaders);
        }
      }

      // Validate Origin for WebSocket upgrades - reject cross-site hijacking
      if (isWebSocketRoute(path)) {
        if (!isWebSocketOriginAllowed(origin, env)) {
          return json({ error: 'Origin not allowed' }, 403, corsHeaders);
        }
      }

      const response = await route.handler(request, env, user, ...params);

      // WebSocket upgrades return the handshake directly (no CORS headers)
      if (isWebSocketRoute(path)) {
        return response;
      }

      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (err: unknown) {
      // In production, omit raw stack from operator logs to avoid leaking
      // implementation details if logs are exported. Dev / staging keep the
      // full stack for debugging.
      const isProd = env.ENVIRONMENT === 'production';
      const errorPayload: Record<string, unknown> = {
        ref,
        method,
        path,
        status: 500,
        error: getErrorMessage(err),
      };
      if (err instanceof Error) {
        errorPayload.name = err.name;
        if (!isProd) errorPayload.stack = err.stack;
      }
      log.error('request failed', errorPayload);
      return json({ error: `Internal server error (ref: ${ref})` }, 500, corsHeaders);
    }
  },
} satisfies ExportedHandler<Env>;
