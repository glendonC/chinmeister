import type { CSSProperties, ReactNode } from 'react';
import { completionColor } from '../../../widgets/utils.js';
import styles from './RateBars.module.css';

export interface RateBarRow {
  key: string;
  label: ReactNode;
  /** Bar width as 0-100 (literal rate, NOT normalized). */
  rate: number;
  /** Right-aligned primary value. Defaults to `${rate}%` rounded. */
  value?: ReactNode;
  /** Right-aligned secondary value. */
  sublabel?: ReactNode;
  /** Explicit fill color. Takes precedence over `tone`. */
  fillColor?: string;
}

export interface RateBarsProps {
  rows: ReadonlyArray<RateBarRow>;
  /** Caption beneath the strip. */
  footer?: ReactNode;
  /** When a row omits `fillColor`: `completion` uses `completionColor(rate)`,
   *  `workType` is a no-op (caller passes `fillColor` for work-type bars),
   *  `neutral` resolves to `var(--ink)`. Defaults to `neutral`. */
  tone?: 'completion' | 'workType' | 'neutral';
  /** Width of the left label column. Defaults to 130px (mid between the
   *  120px work-type and 160px commit-bucket call sites). */
  labelWidth?: number;
}

function resolveFill(
  fillColor: string | undefined,
  tone: 'completion' | 'workType' | 'neutral',
  rate: number,
): string {
  if (fillColor) return fillColor;
  if (tone === 'completion') return completionColor(rate);
  // workType expects an explicit fillColor; fall back to ink so a missing
  // color never collapses the row to a blank track.
  return 'var(--ink)';
}

/**
 * Horizontal rate bars: `label | track | fill | value+sublabel`. Bar fill
 * width is the literal rate value (0-100), NOT normalized against the
 * row max. Used for completion-by-work-type (color per work type) and
 * commits-vs-completion buckets (color per completion threshold).
 */
export default function RateBars({
  rows,
  footer,
  tone = 'neutral',
  labelWidth = 130,
}: RateBarsProps) {
  return (
    <div className={styles.list} style={{ '--label-col': `${labelWidth}px` } as CSSProperties}>
      {rows.map((row, i) => {
        const rate = Math.max(0, Math.min(100, row.rate));
        const fill = resolveFill(row.fillColor, tone, rate);
        const value = row.value ?? `${Math.round(rate)}%`;
        return (
          <div
            key={row.key}
            className={styles.row}
            style={
              {
                '--row-index': i,
                '--rate': `${rate}%`,
                '--fill': fill,
              } as CSSProperties
            }
          >
            <span className={styles.label}>{row.label}</span>
            <div className={styles.track}>
              <div className={styles.fill} />
            </div>
            <span className={styles.value}>
              {value}
              {row.sublabel != null && <span className={styles.sublabel}>{row.sublabel}</span>}
            </span>
          </div>
        );
      })}
      {footer && <p className={styles.footer}>{footer}</p>}
    </div>
  );
}
