export { fmtCount } from '../../../widgets/utils.js';

export function fileBasename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}
