// Analytics scope: the canonical filter object every analytics query accepts.
//
// Why this exists. Developer-level data is private by default: without a
// scope object, an unscoped `SELECT ... FROM sessions WHERE ...` returns
// every member's data and lets dev A pull dev B's sentiment distribution,
// completion rate, edit count, etc. Threading `handle` through every query
// would close the leak but locks the codebase into a one-axis filter; any
// future filter (host tool, project, date-bucket overrides) would need
// another parameter, and every new query under analytics/ would have to
// remember to thread them.
//
// AnalyticsScope is the additive alternative. Every query takes a scope,
// builds its WHERE fragment from `buildScopeFilter`, and splices the
// fragment plus its params into its existing SQL. New filter axes become
// new optional fields on the type, never new parameters.
//
// Default contract: an empty scope (`{}`) returns team-wide aggregates -
// preserves existing semantics for the few endpoints that intentionally
// expose cross-user data (project view summaries, lead-style aggregates
// once team-tier ships). Routes that should be developer-scoped pass
// `{ handle: user.handle }` explicitly.

export interface AnalyticsScope {
  /**
   * When set, restrict the query to rows authored by this handle. Tables
   * carry `handle` directly (sessions, edits, memories, conversations,
   * tool_calls, commits, members, messages) so this is a simple equality
   * filter, not a join.
   *
   * Pass the *acting user's handle* for personal/dev-scoped views (the
   * /me/analytics route, /me/dashboard summaries). Leave empty for
   * intentional team-wide aggregates.
   *
   * Why handle, not owner_id. Three contract guarantees make handle a safe
   * scope key here:
   *
   *   1. members.handle and sessions.handle are denormalized for query
   *      performance. Joining to users on every analytics call would force a
   *      cross-DO read (the canonical user row lives in DatabaseDO, not
   *      TeamDO) and turn every aggregate into a fan-out.
   *   2. users.handle is `UNIQUE NOT NULL` (DatabaseDO migration 001) and
   *      updateHandle rejects duplicates with the CONFLICT code. Auth
   *      additionally re-verifies the looked-up user's handle still matches
   *      the KV-issued token (routes/user/auth.ts), so handle rotation
   *      never silently re-points an existing token to a different user.
   *   3. Account deletion is administrator-mediated and does not reclaim
   *      the handle. The /me/data/delete path tombstones data per team and
   *      revokes tokens but leaves the users-row intact, so the handle
   *      stays bound to its original owner_id for the lifetime of the
   *      database. There is no path that frees a handle for re-use.
   *
   * Together these mean: a scope filter `WHERE handle = 'alice'` cannot
   * cross-leak sessions between two distinct users, because there is never
   * more than one user with handle 'alice' in the entire system. If any of
   * the three guarantees changes (handle reclaim, soft-delete with reuse,
   * etc.), this scope key MUST switch to owner_id and the relevant tables
   * need an owner_id column, denormalized at write time.
   */
  handle?: string;
}

/**
 * Where in a query the scope fragment should land. Most tables expose
 * `handle` directly; queries with multiple aliased tables need to disambiguate
 * (e.g., `s.handle` from sessions vs `m.handle` from members).
 */
export interface ScopeOptions {
  /**
   * Column reference for the handle filter, including any table alias.
   * Defaults to `handle` (no alias). Pass `s.handle`, `m.handle`, etc. when
   * the query has joined tables.
   */
  handleColumn?: string;
}

export interface ScopeFragment {
  /**
   * SQL fragment to splice into a WHERE clause. Always begins with a leading
   * space and `AND`, so the caller can append it after their existing
   * WHERE-clause tail without worrying about delimiter handling. Empty
   * string when no scope filters apply.
   */
  sql: string;
  /** Param values to spread into the parameter list, in fragment order. */
  params: unknown[];
}

/**
 * Build the SQL fragment + params for a scope. Always returns a fragment
 * starting with ` AND ...` (leading space) so call sites can do:
 *
 *   const scopeFilter = buildScopeFilter(scope);
 *   const rows = sql.exec(
 *     `SELECT ... FROM sessions WHERE ended_at IS NOT NULL${scopeFilter.sql}`,
 *     ...existingParams,
 *     ...scopeFilter.params,
 *   );
 *
 * Returning `{ sql: '', params: [] }` for an empty scope keeps the SQL
 * unchanged and avoids forcing every call site to branch.
 */
export function buildScopeFilter(
  scope: AnalyticsScope = {},
  options: ScopeOptions = {},
): ScopeFragment {
  const fragments: string[] = [];
  const params: unknown[] = [];

  if (scope.handle) {
    const col = options.handleColumn ?? 'handle';
    fragments.push(`${col} = ?`);
    params.push(scope.handle);
  }

  if (fragments.length === 0) return { sql: '', params: [] };
  return { sql: ` AND ${fragments.join(' AND ')}`, params };
}

/**
 * Convenience for queries that build their WHERE clause from scratch (no
 * existing AND chain to append to). Returns ` WHERE ...` when filters
 * apply, empty string otherwise.
 */
export function buildScopeWhere(
  scope: AnalyticsScope = {},
  options: ScopeOptions = {},
): ScopeFragment {
  const fragment = buildScopeFilter(scope, options);
  if (!fragment.sql) return { sql: '', params: [] };
  // Strip the leading ' AND ' and replace with ' WHERE '.
  return { sql: fragment.sql.replace(/^ AND /, ' WHERE '), params: fragment.params };
}

/**
 * Type guard for scoped vs unscoped - useful when a function wants to
 * skip an entire correlation step (e.g., team-wide cohort analysis) when
 * called with a personal scope.
 */
export function isScoped(scope: AnalyticsScope): boolean {
  return Boolean(scope.handle);
}

/**
 * Compose a base query + base params with a scope filter in one call.
 * Returns `{ sql, params }` already merged so callers cannot forget the
 * param spread, the silent-bypass failure mode that motivated the audit.
 *
 * Usage:
 *
 *   const { sql: q, params } = withScope(
 *     `SELECT COUNT(*) AS cnt FROM sessions WHERE ended_at > datetime('now', '-' || ? || ' days')`,
 *     [days],
 *     scope,
 *   );
 *   const row = sql.exec(q, ...params).one();
 *
 * Equivalent to the manual `buildScopeFilter` + concat dance, just with
 * one call site for both halves so they cannot drift.
 *
 * For multi-filter queries (different handleColumn aliases in the same
 * statement, e.g. joined tables), call `buildScopeFilter` per alias and
 * concat manually. `withScope` is the safe path for the common single-
 * filter case (~80% of analytics queries).
 */
export function withScope(
  baseQuery: string,
  baseParams: readonly unknown[],
  scope: AnalyticsScope = {},
  options: ScopeOptions = {},
): { sql: string; params: unknown[] } {
  const fragment = buildScopeFilter(scope, options);
  return {
    sql: baseQuery + fragment.sql,
    params: [...baseParams, ...fragment.params],
  };
}

/**
 * `withScope` for queries that build their WHERE clause from scratch.
 * Appends ` WHERE ...` when the scope is non-empty, otherwise leaves the
 * base query untouched.
 */
export function withScopeWhere(
  baseQuery: string,
  baseParams: readonly unknown[],
  scope: AnalyticsScope = {},
  options: ScopeOptions = {},
): { sql: string; params: unknown[] } {
  const fragment = buildScopeWhere(scope, options);
  return {
    sql: baseQuery + fragment.sql,
    params: [...baseParams, ...fragment.params],
  };
}
