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
  // 2026-04: memory-stats mixed period + lifetime fields. Split so each
  // widget has one clear time scope. See .internal/OVERVIEW_ARCH.md item #1.
  'memory-stats': ['memory-activity', 'memory-health'],
  // 2026-04: sentiment-outcomes reframed as prompt-clarity. Same data (the
  // classifier still produces sentiment classes) under a coordination-oriented
  // frame: "which prompt phrasings stall sessions" instead of "your mood vs
  // your outcomes." See .internal/WIDGET_RUBRIC.md E4.
  'sentiment-outcomes': ['prompt-clarity'],
  // 2026-04-21: formation-summary cut. Duplicated memory-safety's
  // auditor-flagged count in chart form (B2) and failed C1 — the bar chart
  // rendered a minority subset (actionable flags) as if it were the whole.
  // The merge/evolve/discard breakdown belongs in the review drill, not
  // the cockpit.
  'formation-summary': [],
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
