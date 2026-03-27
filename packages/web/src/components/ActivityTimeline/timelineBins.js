export const BIN_COUNT = 18;

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toTimestamp(value) {
  if (!value) return null;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : null;
}

export function buildTimelineBins(sessions = [], liveCount = 0) {
  const now = Date.now();
  const start = now - DAY_MS;
  const binSize = DAY_MS / BIN_COUNT;
  const bins = Array.from({ length: BIN_COUNT }, () => 0);

  sessions.forEach((session) => {
    const startedAt = toTimestamp(session.started_at);
    if (!startedAt) return;

    const endedAt = toTimestamp(session.ended_at) || now;
    const sessionStart = Math.max(startedAt, start);
    const sessionEnd = Math.max(sessionStart, endedAt);

    const firstBin = clamp(Math.floor((sessionStart - start) / binSize), 0, BIN_COUNT - 1);
    const lastBin = clamp(Math.floor((sessionEnd - start) / binSize), 0, BIN_COUNT - 1);
    const weight = 1 + Math.min(2, (session.edit_count || 0) / 8);

    for (let index = firstBin; index <= lastBin; index += 1) {
      bins[index] += weight;
    }
  });

  bins[BIN_COUNT - 1] += liveCount * 0.9;
  return bins;
}
