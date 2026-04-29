import { Fragment, useMemo, type ReactNode } from 'react';

import { getToolMeta } from '../../../lib/toolMeta.js';
import type { ToolCombination } from '../../../hooks/useGlobalStats.js';

import { SectionHead } from '../components/SectionHead.js';
import styles from '../GlobalView.module.css';

/**
 * Parse a CSS color string (hex or hsl()) into an [r, g, b] tuple, 0-255.
 * Needed because getToolMeta returns either, known tools use hex brand
 * colors, unknown tools get an HSL-derived fallback.
 * Returns null if the input is unrecognized so the caller can fall back to
 * a neutral ink rendering rather than throwing.
 */
function parseColor(input: string): [number, number, number] | null {
  if (input.startsWith('#')) {
    const h = input.slice(1);
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    if (h.length === 6) {
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
    return null;
  }
  const hslMatch = input.match(
    /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i,
  );
  if (hslMatch) {
    const h = Number(hslMatch[1]) / 360;
    const s = Number(hslMatch[2]) / 100;
    const l = Number(hslMatch[3]) / 100;
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hueToRgb = (t: number): number => {
      let u = t;
      if (u < 0) u += 1;
      if (u > 1) u -= 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    return [
      Math.round(hueToRgb(h + 1 / 3) * 255),
      Math.round(hueToRgb(h) * 255),
      Math.round(hueToRgb(h - 1 / 3) * 255),
    ];
  }
  return null;
}

/** Average two tool brand colors into a single rgba with the given alpha. */
function blendToolColors(a: string, b: string, alpha: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return `rgba(18, 19, 23, ${alpha})`;
  return `rgba(${Math.round((pa[0] + pb[0]) / 2)}, ${Math.round((pa[1] + pb[1]) / 2)}, ${Math.round((pa[2] + pb[2]) / 2)}, ${alpha.toFixed(2)})`;
}

function ToolComboMatrix({ pairs }: { pairs: ToolCombination[] }): ReactNode {
  // Derive the distinct tool axis from the pair data itself. Sort by a tool's
  // total pair-volume so the densest cells cluster top-left. Clamp to 12 so
  // label density stays legible, if the community ever cracks 12 tools with
  // co-usage, the tail gets grouped under "...".
  const { tools, pairMap, maxUsers } = useMemo(() => {
    const volume = new Map<string, number>();
    const pm = new Map<string, number>();
    let mu = 0;
    for (const p of pairs) {
      volume.set(p.toolA, (volume.get(p.toolA) ?? 0) + p.users);
      volume.set(p.toolB, (volume.get(p.toolB) ?? 0) + p.users);
      const key = p.toolA < p.toolB ? `${p.toolA}|${p.toolB}` : `${p.toolB}|${p.toolA}`;
      pm.set(key, p.users);
      if (p.users > mu) mu = p.users;
    }
    const sorted = [...volume.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return { tools: sorted.slice(0, 12), pairMap: pm, maxUsers: Math.max(mu, 1) };
  }, [pairs]);

  if (tools.length < 2) {
    return (
      <div className={styles.matrixEmpty}>
        Tool combinations will appear once enough developers use multiple tools.
      </div>
    );
  }

  // Grid: one leading column for row labels, then N data columns.
  const gridCols = `minmax(92px, auto) repeat(${tools.length}, minmax(20px, 1fr))`;

  return (
    <div className={styles.matrix} style={{ gridTemplateColumns: gridCols }}>
      {/* Column-header row: blank corner + tool labels. Label color pulls
          the tool's brand color so the matrix reads as a product map, the
          category IS the color. Per design brief: categorical data is a
          legitimate place for color on an otherwise-monochrome surface. */}
      <span className={styles.matrixCorner} />
      {tools.map((t) => {
        const meta = getToolMeta(t);
        return (
          <span
            key={`col-${t}`}
            className={styles.matrixColLabel}
            style={{ color: meta.color }}
            title={meta.label}
          >
            {meta.label}
          </span>
        );
      })}
      {/* Data rows */}
      {tools.map((rowTool, ri) => {
        const rowMeta = getToolMeta(rowTool);
        return (
          <Fragment key={`row-${rowTool}`}>
            <span className={styles.matrixRowLabel} style={{ color: rowMeta.color }}>
              {rowMeta.label}
            </span>
            {tools.map((colTool, ci) => {
              if (ci === ri) {
                return <span key={`${ri}-${ci}`} className={styles.matrixDiag} />;
              }
              if (ci < ri) {
                // Lower triangle: render mirrored but faint, so the shape still
                // reads as a square without double-counting.
                return <span key={`${ri}-${ci}`} className={styles.matrixMirror} />;
              }
              const key = rowTool < colTool ? `${rowTool}|${colTool}` : `${colTool}|${rowTool}`;
              const users = pairMap.get(key) ?? 0;
              const intensity = users / maxUsers;
              // Cell color = blend of the two tools' brand colors. Cell
              // opacity = how common this pair is among developers. Two
              // channels of data on the same cell: color tells WHICH pair,
              // density tells HOW MANY. Empty cells (no co-usage) render at
              // the blended color with very low alpha so the grid reads as
              // a product map, not a checkerboard.
              const alpha = users === 0 ? 0.05 : 0.15 + intensity * 0.75;
              const colorRow = getToolMeta(rowTool).color;
              const colorCol = getToolMeta(colTool).color;
              const background = blendToolColors(colorRow, colorCol, alpha);
              return (
                <span
                  key={`${ri}-${ci}`}
                  className={styles.matrixCell}
                  style={{ background }}
                  title={`${getToolMeta(rowTool).label} + ${getToolMeta(colTool).label}: ${users} developer${users === 1 ? '' : 's'}`}
                />
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

interface Props {
  toolCombinations: ToolCombination[];
}

export function StackingSection({ toolCombinations }: Props): ReactNode {
  return (
    <section className={styles.section}>
      <SectionHead label="How Developers Stack Tools" />
      <ToolComboMatrix pairs={toolCombinations} />
    </section>
  );
}
