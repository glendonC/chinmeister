export function fmtCount(n: number): string {
  return n.toLocaleString();
}

export function fileBasename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}
