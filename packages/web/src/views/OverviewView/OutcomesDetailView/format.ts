export function fmtCount(n: number): string {
  return n.toLocaleString();
}

export function formatMinutes(n: number): string {
  if (n >= 10) return String(Math.round(n));
  return n.toFixed(1);
}
