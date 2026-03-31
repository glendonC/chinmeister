import { TOOL_CATALOG, CATEGORY_NAMES } from '../catalog.js';
import { getDB, getLobby } from '../lib/env.js';
import { json } from '../lib/http.js';

function evaluationToCatalogEntry(e) {
  const metadata = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata || {});
  return {
    id: e.tool_id,
    name: e.name,
    description: e.tagline || '',
    category: e.category || 'uncategorized',
    website: metadata.website || null,
    installCmd: metadata.installCmd || null,
    mcpCompatible: !!e.mcp_support,
    featured: !!metadata.featured,
  };
}

export async function handleInit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const db = getDB(env);

  const limit = await db.checkRateLimit(ip, 3);
  if (!limit.allowed) {
    return json({ error: 'Too many accounts created today. Try again tomorrow.' }, 429);
  }

  const user = await db.createUser();
  if (user.error) {
    return json({ error: user.error }, 400);
  }

  await db.consumeRateLimit(ip);
  await env.AUTH_KV.put(`token:${user.token}`, user.id);

  return json({ handle: user.handle, color: user.color, token: user.token }, 201);
}

export async function handleStats(env) {
  const [lobbyStats, dbStats] = await Promise.all([
    getLobby(env).getStats(),
    getDB(env).getStats(),
  ]);
  return json({ ...dbStats, ...lobbyStats });
}

export async function handleToolCatalog(env) {
  const db = getDB(env);
  const result = await db.listEvaluations({});

  let tools;
  if (result.evaluations && result.evaluations.length > 0) {
    tools = result.evaluations.map(evaluationToCatalogEntry);
  } else {
    // Fallback to static catalog if no evaluations in DB yet
    tools = TOOL_CATALOG;
  }

  return json({ tools, categories: CATEGORY_NAMES }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  });
}
