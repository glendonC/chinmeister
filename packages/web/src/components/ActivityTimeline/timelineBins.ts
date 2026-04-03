export const BIN_COUNT = 18;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : null;
}

function formatBinLabel(binStart: number, binEnd: number, days: number): string {
  const start = new Date(binStart);
  const end = new Date(binEnd);

  if (days <= 1) {
    const fmt = (d: Date) =>
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${fmt(start)}\u2009\u2013\u2009${fmt(end)}`;
  }
  if (days <= 7) {
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric' });
    return `${fmt(start)}\u2009\u2013\u2009${fmt(end)}`;
  }
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)}\u2009\u2013\u2009${fmt(end)}`;
}

export interface TimelineBin {
  value: number;
  sessions: number;
  edits: number;
  conflicts: number;
  label: string;
}

interface SessionInput {
  started_at?: string | null;
  ended_at?: string | null;
  edit_count?: number;
  conflicts_hit?: number;
}

export function buildTimelineBins(
  sessions: SessionInput[] = [],
  liveCount = 0,
  days = 1,
): TimelineBin[] {
  const now = Date.now();
  const rangeMs = days * DAY_MS;
  const start = now - rangeMs;
  const binSize = rangeMs / BIN_COUNT;

  const bins: TimelineBin[] = Array.from({ length: BIN_COUNT }, (_, i) => ({
    value: 0,
    sessions: 0,
    edits: 0,
    conflicts: 0,
    label: formatBinLabel(start + i * binSize, start + (i + 1) * binSize, days),
  }));

  sessions.forEach((session) => {
    const startedAt = toTimestamp(session.started_at);
    if (!startedAt) return;

    const endedAt = toTimestamp(session.ended_at) || now;
    const sessionStart = Math.max(startedAt, start);
    const sessionEnd = Math.max(sessionStart, endedAt);

    const firstBin = clamp(Math.floor((sessionStart - start) / binSize), 0, BIN_COUNT - 1);
    const lastBin = clamp(Math.floor((sessionEnd - start) / binSize), 0, BIN_COUNT - 1);
    const weight = 1 + Math.min(2, (session.edit_count || 0) / 8);

    const spanCount = lastBin - firstBin + 1;
    const editsPerBin = Math.round((session.edit_count || 0) / spanCount);
    const conflictsPerBin = Math.round((session.conflicts_hit || 0) / spanCount);

    for (let index = firstBin; index <= lastBin; index += 1) {
      bins[index].value += weight;
      bins[index].sessions += 1;
      bins[index].edits += editsPerBin;
      bins[index].conflicts += conflictsPerBin;
    }
  });

  if (liveCount > 0) {
    bins[BIN_COUNT - 1].value += liveCount * 0.9;
    bins[BIN_COUNT - 1].sessions += liveCount;
  }
  return bins;
}
