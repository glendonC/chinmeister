// GET /me/sessions: lightweight session list for the dashboard timeline.
//
// Unlike /me/analytics this is a straight cross-team fan-out + concat - no
// merge, no accumulators. Kept separate from the analytics module tree so
// the analytics handler only has to think about one response shape.

import { getDB, getTeam, rpc } from '../../lib/env.js';
import { getErrorMessage } from '../../lib/errors.js';
import { json } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';
import { authedRoute } from '../../lib/middleware.js';
import { withRateLimit } from '../../lib/validation.js';
import { MAX_DASHBOARD_TEAMS, RATE_LIMIT_SESSIONS_READS } from '../../lib/constants.js';
import { DO_CALL_TIMEOUT_MS, withTimeout } from './helpers.js';

const log = createLogger('routes.user.sessions');

// 15s max-age + 60s SWR. /me/sessions backs the live activity timeline,
// which polls aggressively; a short max-age is enough to absorb that burst
// without lagging behind newly-recorded sessions. Private because every
// session row is caller-scoped.
const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
};

function todayStr(): string {
  // UTC: session.started_at is stored via SQL datetime('now'), which is UTC.
  // Defaulting from local time slips a day near midnight in non-UTC locales
  // and silently drops freshly inserted sessions from the response.
  return new Date().toISOString().slice(0, 10);
}

// Filter param shape. host_tool ids are alnum + hyphen, capped at 64 so we
// never bind oversized strings into DO SQL. Anything outside the whitelist
// silently drops the filter rather than 400ing, this cross-team list route
// treats unknown inputs as "no filter."
//
// Note: this route is hard-scoped to the caller's own handle (see filters
// below). A `handle` query param is intentionally not accepted, accepting
// one would let any authenticated team member enumerate a teammate's
// per-session metadata (outcome summaries, file lists, token usage). The
// only timeline consumer is useSessionTimeline in the web package, which
// passes from/to only.
const HOST_TOOL_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ISO 8601 date format: YYYY-MM-DD. Parameterized SQL prevents injection,
// but a malformed string ("foo", "tomorrow") binds as a literal that no
// row can match, returning empty silently. 400 instead so client bugs
// surface loud at the boundary. Runs after a strict regex match so the
// Date constructor only sees pre-validated strings.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip check: catches inputs like a 30th of February which the
  // Date constructor silently rolls forward instead of rejecting. Compare
  // the round-trip basis so the equality holds for every valid
  // YYYY-MM-DD across timezones.
  return d.toISOString().slice(0, 10) === value;
}

export const handleUserSessions = authedRoute(async ({ request, user, env }) => {
  const db = getDB(env);
  return withRateLimit(
    db,
    `usess:${user.id}`,
    RATE_LIMIT_SESSIONS_READS,
    'Sessions read limit reached. Try again later.',
    async () => {
      const url = new URL(request.url);
      const fromParam = url.searchParams.get('from');
      const toParam = url.searchParams.get('to');

      // Validate ISO date format up front. Default-to-today is preserved
      // for callers that omit the param (the existing useSessionTimeline
      // call passes from/to explicitly, so the default rarely fires); a
      // present-but-malformed param 400s so bugs surface loud rather than
      // returning an empty list silently.
      if (fromParam !== null && !isValidIsoDate(fromParam)) {
        return json({ error: 'invalid `from` date, expected YYYY-MM-DD' }, 400);
      }
      if (toParam !== null && !isValidIsoDate(toParam)) {
        return json({ error: 'invalid `to` date, expected YYYY-MM-DD' }, 400);
      }

      const from = fromParam ?? todayStr();
      const to = toParam ?? todayStr();
      // Echo the resolved range back. Useful when from/to defaulted to
      // todayStr() so consumers know the implicit narrowing happened
      // rather than silently treating "no filter" as "lifetime".
      const range = { from, to };

      const hostToolParam = url.searchParams.get('host_tool');
      // Always scope to the caller's own handle. The DO method accepts an
      // optional handle filter, but here we always populate it from user.handle
      // to prevent cross-user enumeration.
      const filters: { hostTool?: string; handle?: string } = { handle: user.handle };
      if (hostToolParam && HOST_TOOL_RE.test(hostToolParam)) filters.hostTool = hostToolParam;

      const teamsResult = rpc(await db.getUserTeams(user.id));
      const teams: Array<{ team_id: string; team_name: string | null }> = teamsResult.teams;

      if (teams.length === 0) {
        return json(
          {
            ok: true,
            sessions: [],
            totals: { sessions: 0, edits: 0, lines_added: 0, lines_removed: 0, tools: [] },
            range,
          },
          200,
          { headers: CACHE_HEADERS },
        );
      }

      const capped = teams.slice(0, MAX_DASHBOARD_TEAMS);
      const results = await Promise.allSettled(
        capped.map(async (t) => {
          const team = getTeam(env, t.team_id);
          try {
            const result = rpc(
              await withTimeout(
                team.getSessionsInRange(user.id, from, to, filters) as unknown as Promise<
                  Record<string, unknown>
                >,
                DO_CALL_TIMEOUT_MS,
              ),
            );
            if (result.error) return [];
            return ((result.sessions as Array<Record<string, unknown>>) || []).map((s) => ({
              ...s,
              team_id: t.team_id,
              team_name: t.team_name,
            }));
          } catch (err) {
            log.error('failed to fetch team sessions', {
              teamId: t.team_id,
              error: getErrorMessage(err),
            });
            return [];
          }
        }),
      );

      const allSessions: Array<Record<string, unknown>> = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          for (const s of r.value) allSessions.push(s);
        }
      }
      allSessions.sort((a, b) =>
        String(a.started_at || '').localeCompare(String(b.started_at || '')),
      );

      const totals = {
        sessions: allSessions.length,
        edits: allSessions.reduce((s, r) => s + ((r.edit_count as number) || 0), 0),
        lines_added: allSessions.reduce((s, r) => s + ((r.lines_added as number) || 0), 0),
        lines_removed: allSessions.reduce((s, r) => s + ((r.lines_removed as number) || 0), 0),
        tools: [...new Set(allSessions.map((s) => s.host_tool as string).filter(Boolean))],
      };

      return json({ ok: true, sessions: allSessions, totals, range }, 200, {
        headers: CACHE_HEADERS,
      });
    },
  );
});
