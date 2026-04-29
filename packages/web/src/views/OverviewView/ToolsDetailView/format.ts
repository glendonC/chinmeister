export function fmtCount(n: number): string {
  return n.toLocaleString();
}

// Completion tone helper used inside the flow-pairs answer prose.
export function completionTone(rate: number): 'positive' | 'warning' | 'negative' {
  if (rate >= 70) return 'positive';
  if (rate >= 40) return 'warning';
  return 'negative';
}
