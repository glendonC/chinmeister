import { type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';

import { completionColor } from '../../../widgets/utils.js';
import styles from './RateVolumeColumns.module.css';

export interface RateVolumeColumn {
  key: string | number;
  /** Axis label rendered under the column. */
  label: ReactNode;
  /** Optional value rendered above the column (e.g. "78%"). */
  rateLabel?: ReactNode;
  /** Drives the bar height relative to the max volume in the set. */
  volume: number;
  /** 0-100 rate. Pass `null` to render a ghost-tinted bar (no data). */
  rate: number | null;
  /** Hover tooltip. */
  title?: string;
  /** Per-column opacity override. Defaults to the token-driven fill. */
  opacity?: number;
}

export interface RateVolumeColumnsLegend {
  left: ReactNode;
  right: ReactNode;
}

export interface RateVolumeColumnsProps {
  columns: ReadonlyArray<RateVolumeColumn>;
  /** Floor height (%) for non-empty columns. Default 8. */
  minVisibleHeight?: number;
  /** Minimum frame height in px. Default 120; pass 180 for the peak-hours frame. */
  minFrameHeightPx?: number;
  /** Two-span legend below the chart. Default shows the volume / color hint.
   *  Pass `null` to suppress entirely. */
  legend?: RateVolumeColumnsLegend | null;
  /** Highlight predicate, e.g. for the best 3-hour window ring. */
  highlight?: (idx: number, col: RateVolumeColumn) => boolean;
  /** Animation stagger ms per column. Default 30. */
  staggerMs?: number;
  ariaLabel?: string;
}

const DEFAULT_LEGEND: RateVolumeColumnsLegend = {
  left: 'height shows volume',
  right: 'color shows completion',
};

/**
 * Vertical column primitive: bar height encodes volume, bar color encodes
 * a rate (via `completionColor`). Shared by the peak-hour, day-of-week
 * dip, and daily completion-trend reads. Zero-volume columns render as
 * a thin ghost bar so the slot stays visible and `rate == null` flags it.
 */
export function RateVolumeColumns({
  columns,
  minVisibleHeight = 8,
  minFrameHeightPx = 120,
  legend = DEFAULT_LEGEND,
  highlight,
  staggerMs = 30,
  ariaLabel,
}: RateVolumeColumnsProps) {
  const maxVolume = Math.max(0, ...columns.map((c) => c.volume));

  const frameVars = {
    '--rvc-frame-height': `${minFrameHeightPx}px`,
    '--rvc-stagger-ms': staggerMs,
  } as CSSProperties;

  return (
    <div className={styles.frame} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      <div className={styles.bars} style={frameVars}>
        {columns.map((col, i) => {
          const heightPct =
            col.volume === 0
              ? minVisibleHeight * 0.75
              : maxVolume > 0
                ? Math.max(minVisibleHeight, (col.volume / maxVolume) * 100)
                : minVisibleHeight;
          const color = col.rate == null ? 'var(--ghost)' : completionColor(col.rate);
          const isHighlighted = highlight ? highlight(i, col) : false;
          const barStyle: CSSProperties = {
            '--rvc-bar-height': `${heightPct}%`,
            '--rvc-bar-color': color,
          } as CSSProperties;
          if (col.opacity !== undefined) {
            (barStyle as Record<string, string | number>)['--rvc-bar-opacity'] = col.opacity;
          }
          return (
            <div
              key={col.key}
              className={styles.column}
              style={{ '--row-index': i } as CSSProperties}
            >
              {col.rateLabel === undefined ? (
                <span className={styles.rateLabel} aria-hidden="true" />
              ) : (
                <span className={styles.rateLabel}>{col.rateLabel}</span>
              )}
              <span
                className={clsx(styles.bar, isHighlighted && styles.barHighlight)}
                style={barStyle}
                title={col.title}
              />
              <span className={styles.axisLabel}>{col.label}</span>
            </div>
          );
        })}
      </div>
      {legend !== null && (
        <div className={styles.legend}>
          <span>{legend.left}</span>
          <span>{legend.right}</span>
        </div>
      )}
    </div>
  );
}

export default RateVolumeColumns;
