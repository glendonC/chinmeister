// Shared formatting helpers used across every Usage panel. Currency goes
// through `formatCost` from widgets/utils so the detail view inherits the
// same thousands separator and null→em-dash fallback as the KPI strip.
export function fmtCount(n: number): string {
  return n.toLocaleString();
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

// YYYY-MM-DD → MM-DD, mono-friendly.
export function formatStripDate(iso: string): string {
  if (iso.length >= 10) return iso.slice(5);
  return iso;
}
