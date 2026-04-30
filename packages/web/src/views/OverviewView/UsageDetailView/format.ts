// Shared formatting helpers used across every Usage panel. Currency goes
// through `formatCost` from widgets/utils so the detail view inherits the
// same thousands separator and null-em-dash fallback as the KPI strip.
export { fmtCount } from '../../../widgets/utils.js';

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

// YYYY-MM-DD -> MM-DD, mono-friendly.
export function formatStripDate(iso: string): string {
  if (iso.length >= 10) return iso.slice(5);
  return iso;
}

// 24-hour clock to "12a / 9a / 12p / 3p" glyph; matches the labels used
// across activity rhythm vizes so the heatmap reads consistently when it
// surfaces here.
export function hourGlyph(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}
