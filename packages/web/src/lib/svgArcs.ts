// ── Arc ring constants & helpers ──
export const CX = 130;
export const CY = 130;
export const R = 58;
export const SW = 13;
export const GAP = 14;
export const DEG = Math.PI / 180;

// Leader line geometry: ring edge → radial stub → horizontal to text
export const LEADER_GAP = 5; // gap between ring outer edge and line start
export const LEADER_STUB = 20; // radial segment length
export const LEADER_H = 22; // horizontal extension from elbow to text

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
): string {
  const s = (startDeg - 90) * DEG,
    e = (startDeg + sweepDeg - 90) * DEG;
  return `M ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)}`;
}
