export { fmtCount } from '../../../widgets/utils.js';

// Completion tone helper used inside the flow-pairs answer prose.
export function completionTone(rate: number): 'positive' | 'warning' | 'negative' {
  if (rate >= 70) return 'positive';
  if (rate >= 40) return 'warning';
  return 'negative';
}
