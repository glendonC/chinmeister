export { fmtCount } from '../../../widgets/utils.js';

export function formatMinutes(n: number): string {
  if (n >= 10) return String(Math.round(n));
  return n.toFixed(1);
}
