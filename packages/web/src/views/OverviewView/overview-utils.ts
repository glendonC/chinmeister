import { summarizeList } from '../../lib/summarize.js';

// ── View-specific constants ───────────────────────
// Widget-shared utilities (work types, colors, formatters, heatmap helpers)
// live in packages/web/src/widgets/utils.ts. This file intentionally keeps
// only exports that the OverviewView shell itself consumes.

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function summarizeNames(items: Array<{ team_id?: string; team_name?: string }>): string {
  const names = items.map((item) => item?.team_name || item?.team_id).filter(Boolean) as string[];
  return summarizeList(names);
}

// ── Shared scope subtitle formatter ────────────────
// Detail views share a subtitle format: count + labeled noun, joined by
// middle-dot. Defined once so Usage ("4 tools · 2 projects") and LiveNow
// ("3 agents · 1 conflict · 7 files in play · 2 projects") stay in sync.
// Zero-count parts are dropped; plural fallback is `${singular}s` when no
// explicit plural is passed.
export interface ScopePart {
  count: number;
  singular: string;
  plural?: string;
}

export function formatScope(parts: ScopePart[]): string {
  return parts
    .filter((p) => p.count > 0)
    .map((p) => `${p.count} ${p.count === 1 ? p.singular : (p.plural ?? `${p.singular}s`)}`)
    .join(' · ');
}
