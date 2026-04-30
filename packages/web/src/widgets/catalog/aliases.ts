/**
 * ID aliases for widgets that have been renamed, removed, or split. When a
 * saved layout contains a deprecated ID, the loader replaces it in place
 * with the target IDs at their catalog default sizes.
 *
 * Empty array means "the widget was removed with no replacement" — the slot
 * is dropped from the layout.
 *
 * Single-entry array = rename. Multi-entry array = split.
 */
export const WIDGET_ALIASES: Record<string, string[]> = {
  // formation-summary: the merge/evolve/discard breakdown belongs in the
  // review drill, not the cockpit.
  'formation-summary': [],
  // first-edit + duration-dist: both already render in Usage detail's
  // Sessions panel. Detail-only is the honest home when a metric only
  // earns its seat in context. duration-dist also invited the "optimal
  // session length" read, a never-build anti-pattern.
  'first-edit': [],
  'duration-dist': [],
  // session-trend: detail-view's DailyOutcomeStrip + the same-row outcomes
  // widget already own the signal with more context, and zero-fill
  // rendered fake shape for low-activity users.
  'session-trend': [],
  // edit-velocity: no detail-view earns the build cost. The only
  // substrate-honest question (velocity → completion) is a
  // Simpson's-paradox trap, and edits/hr is a generic metric any tool's
  // own dashboard produces. Schema field `edit_velocity` stays for
  // UsageDetail's `cadence` scalar consumers.
  'edit-velocity': [],

  // Activity cuts. prompt-efficiency rides the same Simpson's-paradox
  // trap that cut edit-velocity (turns ↔ outcome). work-type-outcomes
  // is fully absorbed into OutcomesDetailView's WorkTypesPanel.
  'prompt-efficiency': [],
  'work-type-outcomes': [],

  // Codebase cuts. file-churn duplicates files in practice (different
  // aggregation primitive, same ranking), and triple-volume-metric row
  // invites the "high-on-all = bad" anti-pattern read.
  'file-churn': [],

  // Tools & Models. tool-capability-coverage was static feature spec, not
  // analytics. token-attribution overlapped model-mix on substrate. Both
  // alias to empty so saved layouts drop the slot on next load.
  tools: [],
  models: ['model-mix'],
  'token-detail': [],
  'tool-capability-coverage': [],
  'token-attribution': [],

  // Tools cuts. tool-outcomes is redundant with the `tools` grid (which
  // already shows completion%). cache-efficiency is plumbing observability
  // with no user control surface. tool-daily rides the same zero-fill A3
  // failure that cut session-trend. tool-work-type carries a broken
  // denominator (sessions in multiple work types double-counted) and the
  // "per-tool distribution as pie" anti-pattern. tool-calls has polysemous
  // "calls" semantics across hook-instrumented vs MCP-only hosts.
  // tool-call-freq is pure frequency without effectiveness overlay.
  // data-coverage is a plumbing diagnostic with negative emotional payload;
  // it belongs on a Connect/Settings surface, not the cockpit.
  'tool-outcomes': [],
  'cache-efficiency': [],
  'tool-daily': [],
  'tool-work-type': [],
  'tool-calls': [],
  'tool-call-freq': [],
  'data-coverage': [],

  // Conversations originals each independently violated the
  // sentiment-as-headline firewall:
  //   topics: redundant with work-types; D1 weak (every LLM-obs tool
  //     ships it).
  //   prompt-clarity: classifier still emits sentiment polarity, the
  //     "sentiment-to-outcome standalone" pattern.
  //   conversation-depth: Simpson's-paradox trap (longer sessions =
  //     harder tasks), same family as the edit-velocity cut.
  topics: [],
  'prompt-clarity': [],
  'conversation-depth': [],
  // memory-stats / sentiment-outcomes: replacement targets are themselves
  // cut, so the historical aliases drop their slots entirely.
  'memory-stats': [],
  'sentiment-outcomes': [],

  // Memory cuts. memory-activity rendered search hit rate, an evergreen
  // anti-pattern (hit-rate-as-quality). memory-safety stays cut: the data
  // ships via memory-supersession-flow + memory-secrets-shield, and the
  // remaining auditor-flag piece is pre-empted by the Memory Hygiene
  // Autopilot Report.
  'memory-activity': [],
  'memory-safety': [],

  // top-memories: opaque previews and no denominator hit the
  // hit-rate-as-quality anti-pattern. The schema field stays; the data is
  // consumed inside MemoryDetailView's Health tab where rank + last-touch
  // + category + author can co-render in context.
  'top-memories': [],

  // Team cuts. Only conflicts-blocked survives as substrate-unique
  // prevention proof. team-members triggers the productivity-ranking
  // anti-pattern (surveillance, not intelligence) and pre-empts the
  // unbuilt privacy model. conflict-impact rides Simpson's paradox
  // (sessions hitting conflicts are also harder sessions); the
  // disclaimer line is theater in a stat-row that reads causally by
  // construction. retry-patterns is redundant with file-rework (same
  // axis, different aggregation primitive); the cross-agent + cross-tool
  // columns belong as a footer line on file-rework.
  'team-members': [],
  'conflict-impact': [],
  'retry-patterns': [],
};

/**
 * Resolve a widget id through the alias map. Returns the replacement ids
 * (one or many), or the original id if it has no alias. Does not validate
 * that the returned ids exist in the catalog — callers still need to run
 * through `defaultSlot` or `getWidget`.
 */
export function resolveWidgetAlias(id: string): string[] {
  return WIDGET_ALIASES[id] ?? [id];
}

/**
 * Tab-value aliases for the Usage detail view. When a saved or shared URL
 * carries a tab value that no longer exists, the detail view consults this
 * map to land the user on the right (tab, q) pair instead of bouncing them
 * back to the default tab. Each entry preserves the original deep-link
 * intent so existing bookmarks keep working after a tab is folded into a
 * sibling.
 */
export const USAGE_TAB_ALIASES: Record<string, { tab: string; q?: string }> = {
  // cost-per-edit folded into the Cost tab as a sibling question.
  'cost-per-edit': { tab: 'cost', q: 'per-edit' },
};
